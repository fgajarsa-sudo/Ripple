-- Ripple — migration 008: self-serve group creation + org switching (CAC 2026 launch spec Task 1)
--
-- The original build spec made org creation platform-admin-only (v1: "design schema so
-- self-serve group signup is a v2 addition, not a rebuild"). The 2026 launch spec is that v2
-- flip for creation specifically: any signed-in user can start their own group and becomes
-- its admin immediately. Kept as a SECURITY DEFINER RPC (same pattern as
-- redeem_org_invite/join_public_org below) rather than loosening organizations_insert's RLS
-- policy directly, so creating an org always comes bundled with the caller becoming its admin
-- atomically, not just an insert a client could otherwise shape however it wants.
--
-- "Switching orgs" (launch spec Task 1: "a user who later joins a different group switches
-- orgs; prior readings remain with the org where they were collected") was never actually
-- handled anywhere: memberships_one_active_org_per_user (migration 001) means a second
-- redeem_org_invite/join_public_org call would just hit a unique-violation. leave_current_org()
-- is the shared fix, called at the start of every join/create path below.

create or replace function leave_current_org()
returns void
language sql
security definer
set search_path = public
as $$
  update memberships set status = 'removed' where user_id = auth.uid() and status = 'active';
$$;

grant execute on function leave_current_org() to authenticated;

create or replace function redeem_org_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite org_invites%rowtype;
begin
  select * into invite from org_invites where code = upper(invite_code) for update;

  if not found then
    raise exception 'Invalid invite code';
  end if;
  if invite.expires_at is not null and invite.expires_at < now() then
    raise exception 'Invite code has expired';
  end if;
  if invite.max_uses is not null and invite.use_count >= invite.max_uses then
    raise exception 'Invite code has reached its use limit';
  end if;

  perform leave_current_org();

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

  perform leave_current_org();

  insert into memberships (user_id, org_id, role, status)
  values (auth.uid(), target_org_id, 'member', 'active');
end;
$$;

-- Task 1, path 1: "Start a group." Name it, become its admin, get an invite code back
-- immediately so the UI can show the code + QR without a second round trip.
create or replace function create_own_org(org_name text, listed_publicly boolean default false)
returns table (org_id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  new_code text;
begin
  if trim(coalesce(org_name, '')) = '' then
    raise exception 'Group name is required';
  end if;

  perform leave_current_org();

  insert into organizations (name, slug, is_listed_publicly)
  values (
    trim(org_name),
    lower(regexp_replace(trim(org_name), '[^a-zA-Z0-9]+', '-', 'g'))
      || '-' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 6),
    coalesce(listed_publicly, false)
  )
  returning id into new_org_id;

  insert into memberships (user_id, org_id, role, status)
  values (auth.uid(), new_org_id, 'admin', 'active');

  new_code := admin_create_invite(new_org_id);

  return query select new_org_id, new_code;
end;
$$;

grant execute on function create_own_org(text, boolean) to authenticated;

-- Task 1, path 3: "Collect on my own." Auto-joins the platform-managed Independent Observers
-- org seeded below — an ordinary org in every mechanical sense (same org_id scoping, same
-- RLS), just one the platform owns and administers instead of a volunteer conservation group.
create or replace function join_independent_observers()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  select id into target_org_id from organizations where slug = 'independent-observers';
  if target_org_id is null then
    raise exception 'Independent Observers organization is not configured';
  end if;

  perform leave_current_org();

  insert into memberships (user_id, org_id, role, status)
  values (auth.uid(), target_org_id, 'member', 'active');

  return target_org_id;
end;
$$;

grant execute on function join_independent_observers() to authenticated;

-- ============================================================================
-- Seed: Independent Observers org + a dedicated platform-owner account to admin it.
--
-- Deliberately NOT a real tester's personal account (Francesca's existing account already
-- admins Team Test Org A, and the one-org-per-user rule means reusing it here would have
-- pulled her out of that role) — a dedicated login keeps this purely operational.
-- ============================================================================

do $$
declare
  owner_user_id uuid := gen_random_uuid();
  new_org_id uuid;
begin
  insert into organizations (name, slug, is_listed_publicly)
  values ('Independent Observers', 'independent-observers', false)
  returning id into new_org_id;

  insert into auth.users (
    id, email, encrypted_password, email_confirmed_at, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values (
    owner_user_id,
    'platform@ripplewater.app',
    extensions.crypt('RipplePlatformOwner2026!', extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('age_attested', true, 'display_name', 'Ripple Platform'),
    '', '', '', ''
  );

  insert into memberships (user_id, org_id, role, status)
  values (owner_user_id, new_org_id, 'admin', 'active');
end $$;
