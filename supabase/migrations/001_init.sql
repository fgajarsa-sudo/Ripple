-- Ripple — migration 001: schema, RLS, seeding
--
-- Sensor field list resolved against the reference Lovable prototype (not the build spec's
-- prose, which listed dissolved oxygen + turbidity and omitted specific gravity — the
-- prototype disagreed and the user chose to match the prototype): ph, temp_f, ec, tds,
-- salinity, specific_gravity, orp. Temperature is stored AND displayed in Fahrenheit
-- (temp_f), not converted to Celsius.

create extension if not exists pgcrypto;

-- ============================================================================
-- TABLES
-- ============================================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  is_listed_publicly boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused')),
  waterbody_name text,
  region text,
  created_at timestamptz not null default now()
);

create table org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  code text not null unique,
  expires_at timestamptz,
  max_uses int,
  use_count int not null default 0,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

-- 1:1 with auth.users, populated by handle_new_user() below.
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  age_attested_at timestamptz not null,
  expo_push_token text,
  created_at timestamptz not null default now()
);

-- Join table (not org_id on profiles directly) so v2 multi-group support is a constraint
-- change (drop the partial unique index below), not a migration.
create table memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'reviewer', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now()
);

-- v1: one active org per user. v2: drop this and add unique(user_id, org_id) instead.
create unique index memberships_one_active_org_per_user
  on memberships (user_id)
  where status = 'active';

create table sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  radius_m int not null default 500,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table site_subscriptions (
  user_id uuid not null references profiles (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, site_id)
);

create table thresholds (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  parameter text not null check (
    parameter in ('ph', 'temp_f', 'ec', 'tds', 'salinity', 'specific_gravity', 'orp')
  ),
  min_value numeric,
  max_value numeric,
  severity text not null default 'medium' check (severity in ('medium', 'high')),
  created_at timestamptz not null default now(),
  unique (org_id, parameter, severity)
);

create table submissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  site_id uuid references sites (id),
  lat double precision not null,
  lng double precision not null,
  captured_at timestamptz not null,
  weather text,
  notes text,
  readings jsonb not null default '{}'::jsonb,
  photo_path text,
  ai_urgency text check (ai_urgency in ('low', 'medium', 'high')),
  ai_summary text,
  ai_flags jsonb,
  review_status text not null default 'unreviewed'
    check (review_status in ('unreviewed', 'validated', 'rejected', 'noted')),
  reviewed_by uuid references profiles (id),
  reviewer_note text,
  sync_client_id text unique,
  created_at timestamptz not null default now()
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations (id) on delete cascade,
  sent_by uuid not null references profiles (id),
  title text not null,
  body text not null,
  target text not null check (target in ('all', 'active_30d', 'site')),
  target_site_id uuid references sites (id),
  sent_at timestamptz not null default now(),
  recipient_count int not null default 0,
  created_at timestamptz not null default now()
);

create table platform_admins (
  user_id uuid primary key references profiles (id) on delete cascade
);

-- ============================================================================
-- HELPER FUNCTIONS (used throughout RLS policies below)
-- ============================================================================

create or replace function current_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from memberships
  where user_id = auth.uid() and status = 'active';
$$;

create or replace function has_role(org uuid, role_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and org_id = org
      and status = 'active'
      and role = role_name
  );
$$;

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

-- ============================================================================
-- auth.users -> profiles
-- ============================================================================

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce((new.raw_user_meta_data ->> 'age_attested')::boolean, false) is not true then
    raise exception 'age attestation is required at signup';
  end if;

  insert into public.profiles (id, display_name, age_attested_at)
  values (new.id, new.raw_user_meta_data ->> 'display_name', now());

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================================
-- Guarded membership creation (join-by-invite-code, join-from-public-directory)
--
-- No client-facing INSERT policy exists on `memberships` (see RLS below) — these
-- SECURITY DEFINER functions are the only way to create one, so invite redemption
-- (use_count / expires_at / max_uses) and public-directory eligibility are enforced
-- atomically rather than trusted to the client.
-- ============================================================================

create or replace function redeem_org_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite org_invites%rowtype;
begin
  select * into invite from org_invites where code = invite_code for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;
  if invite.expires_at is not null and invite.expires_at < now() then
    raise exception 'Invite code has expired';
  end if;
  if invite.max_uses is not null and invite.use_count >= invite.max_uses then
    raise exception 'Invite code has reached its use limit';
  end if;

  insert into memberships (user_id, org_id, role, status)
  values (auth.uid(), invite.org_id, 'member', 'active');

  update org_invites set use_count = use_count + 1 where id = invite.id;
end;
$$;

create or replace function join_public_org(target_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from organizations
    where id = target_org_id and is_listed_publicly = true and status = 'active'
  ) then
    raise exception 'This group is not open for self-service joining';
  end if;

  insert into memberships (user_id, org_id, role, status)
  values (auth.uid(), target_org_id, 'member', 'active');
end;
$$;

grant execute on function redeem_org_invite(text) to authenticated;
grant execute on function join_public_org(uuid) to authenticated;

-- ============================================================================
-- New-org threshold seeding
--
-- "Sensible scientific defaults" for a healthy freshwater lake — starting points only,
-- org admins are expected to tune these for their own waterbody.
-- ============================================================================

create or replace function seed_default_thresholds()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into thresholds (org_id, parameter, min_value, max_value, severity) values
    (new.id, 'ph',               6.0,  9.0,  'medium'),
    (new.id, 'ph',               5.0,  10.0, 'high'),
    (new.id, 'temp_f',           32,   77,   'medium'),
    (new.id, 'temp_f',           25,   86,   'high'),
    (new.id, 'ec',                50,  500,  'medium'),
    (new.id, 'ec',                20,  1000, 'high'),
    (new.id, 'tds',               25,  250,  'medium'),
    (new.id, 'tds',               10,  500,  'high'),
    (new.id, 'salinity',          0,   100,  'medium'),
    (new.id, 'salinity',          0,   250,  'high'),
    (new.id, 'specific_gravity',  0.995, 1.005, 'medium'),
    (new.id, 'specific_gravity',  0.99,  1.01,  'high'),
    (new.id, 'orp',               150,  400,  'medium'),
    (new.id, 'orp',               100,  500,  'high');
  return new;
end;
$$;

create trigger on_organization_created
  after insert on organizations
  for each row execute function seed_default_thresholds();

-- ============================================================================
-- submissions: reviewers/admins may only ever change review + AI-pipeline columns
-- ============================================================================

create or replace function enforce_submission_update_columns()
returns trigger
language plpgsql
as $$
declare
  old_row jsonb := to_jsonb(old) - 'review_status' - 'reviewed_by' - 'reviewer_note'
                    - 'ai_urgency' - 'ai_summary' - 'ai_flags';
  new_row jsonb := to_jsonb(new) - 'review_status' - 'reviewed_by' - 'reviewer_note'
                    - 'ai_urgency' - 'ai_summary' - 'ai_flags';
begin
  if old_row is distinct from new_row then
    raise exception
      'Only review_status, reviewed_by, reviewer_note, ai_urgency, ai_summary, ai_flags may be updated on submissions';
  end if;
  return new;
end;
$$;

create trigger submissions_update_columns_guard
  before update on submissions
  for each row execute function enforce_submission_update_columns();

-- ============================================================================
-- agg_daily_site_readings
--
-- Postgres materialized views can't carry RLS policies, so the real aggregation lives in
-- a privately-held matview (no grants to authenticated) and a thin RLS-equivalent view
-- sits on top, filtering rows in its WHERE clause via the same helper functions used
-- elsewhere. This is the standard workaround for "RLS on a matview."
--
-- Derived ONLY from readings/urgency/site/day — no user_id, no exact GPS, no photos, by
-- construction (those columns are never selected from `submissions` below).
-- ============================================================================

create materialized view agg_daily_site_readings_mv as
select
  s.org_id,
  s.site_id,
  date_trunc('day', s.captured_at)::date as day,
  param.key as parameter,
  count(*) as n,
  avg((param.value)::numeric) as avg,
  min((param.value)::numeric) as min,
  max((param.value)::numeric) as max,
  count(*) filter (where s.ai_urgency = 'high') as high_flags,
  count(*) filter (where s.ai_urgency = 'medium') as medium_flags
from submissions s
cross join lateral jsonb_each_text(s.readings) as param(key, value)
where s.site_id is not null
group by s.org_id, s.site_id, date_trunc('day', s.captured_at)::date, param.key;

create unique index agg_daily_site_readings_mv_uq
  on agg_daily_site_readings_mv (org_id, site_id, day, parameter);

-- security_invoker = false (i.e. the view runs with its owner's privileges, not the
-- querying role's) is what makes "wrap a privately-held matview in a filtering view" work
-- at all. This Supabase instance defaults new views to security_invoker = true — the
-- opposite of vanilla Postgres — so it must be set explicitly or `authenticated` gets a
-- bare "permission denied" on the matview instead of the filtered rows.
create view agg_daily_site_readings
  with (security_invoker = false)
as
select * from agg_daily_site_readings_mv
where org_id in (select current_org_ids()) or is_platform_admin();

revoke all on agg_daily_site_readings_mv from public, authenticated, anon;
grant select on agg_daily_site_readings to authenticated;

-- ============================================================================
-- STORAGE
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('submission-photos', 'submission-photos', false)
on conflict (id) do nothing;

-- ============================================================================
-- RLS
-- ============================================================================

alter table organizations enable row level security;
alter table org_invites enable row level security;
alter table profiles enable row level security;
alter table memberships enable row level security;
alter table sites enable row level security;
alter table site_subscriptions enable row level security;
alter table thresholds enable row level security;
alter table submissions enable row level security;
alter table notifications enable row level security;
alter table platform_admins enable row level security;

-- organizations
create policy organizations_select on organizations for select
  using (id in (select current_org_ids()) or is_listed_publicly = true or is_platform_admin());
create policy organizations_insert on organizations for insert
  with check (is_platform_admin());
create policy organizations_update on organizations for update
  using (is_platform_admin());

-- org_invites (platform_admins can seed the first invite for a brand-new org, which has
-- no admin members yet)
create policy org_invites_select on org_invites for select
  using (org_id in (select current_org_ids()));
create policy org_invites_insert on org_invites for insert
  with check (has_role(org_id, 'admin') or is_platform_admin());
create policy org_invites_update on org_invites for update
  using (has_role(org_id, 'admin') or is_platform_admin());
create policy org_invites_delete on org_invites for delete
  using (has_role(org_id, 'admin') or is_platform_admin());

-- profiles
create policy profiles_select_self on profiles for select
  using (id = auth.uid());
create policy profiles_update_self on profiles for update
  using (id = auth.uid());
-- Not in spec §5's policy list verbatim, but required for the Members list (§6 screen 12)
-- and review queue "submitted by" display to function at all: an org's admins/reviewers
-- can see the profiles of that same org's other active members. Scoped to admin/reviewer,
-- not plain members, to stay close to least-privilege.
create policy profiles_select_org_staff on profiles for select
  using (
    exists (
      select 1 from memberships target
      where target.user_id = profiles.id
        and target.status = 'active'
        and target.org_id in (select current_org_ids())
        and (has_role(target.org_id, 'admin') or has_role(target.org_id, 'reviewer'))
    )
  );

-- memberships (no insert policy — redeem_org_invite / join_public_org only)
create policy memberships_select on memberships for select
  using (user_id = auth.uid() or has_role(org_id, 'admin'));
create policy memberships_update on memberships for update
  using (has_role(org_id, 'admin'));

-- sites
create policy sites_select on sites for select
  using (org_id in (select current_org_ids()));
create policy sites_insert on sites for insert
  with check (has_role(org_id, 'admin'));
create policy sites_update on sites for update
  using (has_role(org_id, 'admin'));
create policy sites_delete on sites for delete
  using (has_role(org_id, 'admin'));

-- site_subscriptions ("my sites" — a member manages their own subscriptions)
create policy site_subscriptions_select on site_subscriptions for select
  using (user_id = auth.uid());
create policy site_subscriptions_insert on site_subscriptions for insert
  with check (
    user_id = auth.uid()
    and exists (select 1 from sites where sites.id = site_id and sites.org_id in (select current_org_ids()))
  );
create policy site_subscriptions_delete on site_subscriptions for delete
  using (user_id = auth.uid());

-- thresholds
create policy thresholds_select on thresholds for select
  using (org_id in (select current_org_ids()));
create policy thresholds_insert on thresholds for insert
  with check (has_role(org_id, 'admin'));
create policy thresholds_update on thresholds for update
  using (has_role(org_id, 'admin'));
create policy thresholds_delete on thresholds for delete
  using (has_role(org_id, 'admin'));

-- submissions
create policy submissions_insert on submissions for insert
  with check (
    user_id = auth.uid()
    and org_id in (select current_org_ids())
  );
create policy submissions_select on submissions for select
  using (
    user_id = auth.uid()
    or has_role(org_id, 'reviewer')
    or has_role(org_id, 'admin')
  );
create policy submissions_update on submissions for update
  using (has_role(org_id, 'reviewer') or has_role(org_id, 'admin'));

-- notifications (insert is Edge-Function-only via service role, which bypasses RLS —
-- intentionally no insert policy here for the authenticated role)
create policy notifications_select on notifications for select
  using (org_id in (select current_org_ids()));

-- platform_admins (readable by platform admins themselves only; membership is managed
-- out-of-band by Ripple staff, not through the app)
create policy platform_admins_select on platform_admins for select
  using (user_id = auth.uid());

-- storage.objects — paths are prefixed `org_id/...`; platform admins get NO photo access
-- (deliberately: agg views never expose photo_path, and this bucket has no policy for
-- is_platform_admin() at all).
create policy submission_photos_select on storage.objects for select
  using (
    bucket_id = 'submission-photos'
    and (storage.foldername(name))[1]::uuid in (select current_org_ids())
  );
create policy submission_photos_insert on storage.objects for insert
  with check (
    bucket_id = 'submission-photos'
    and (storage.foldername(name))[1]::uuid in (select current_org_ids())
  );
create policy submission_photos_delete on storage.objects for delete
  using (
    bucket_id = 'submission-photos'
    and has_role((storage.foldername(name))[1]::uuid, 'admin')
  );
