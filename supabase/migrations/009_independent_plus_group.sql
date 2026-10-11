-- Ripple — migration 009: a user can be in one real group AND Independent Observers at once
--
-- Scoped deliberately narrower than full multi-group support (which the schema's join-table
-- design does make feasible later, per the original spec's own note — "multi-group is a v2
-- flag-flip, not a migration"): a user can still only belong to one *real* conservation group
-- at a time, exactly as migration 008 shipped, but membership in the platform-managed
-- Independent Observers org no longer competes with that — the two can coexist. Full
-- arbitrary multi-group was explicitly declined for this launch given the Oct 25 deadline.
--
-- Also fixes a real bug found in testing: redeem_org_invite/join_public_org/create_own_org
-- always INSERTed a fresh membership row, so rejoining a group you'd previously left (even
-- one you created and were admin of) silently demoted you to a plain member — there was no
-- way back to your own admin role short of an admin manually fixing the database. Every join
-- path now reactivates an existing membership row (preserving its original role) if one
-- already exists for that user+org, instead of blindly inserting a new 'member' row.

alter table organizations add column is_platform_org boolean not null default false;
update organizations set is_platform_org = true where slug = 'independent-observers';

-- The old constraint ("one active membership per user, full stop") can't distinguish real
-- orgs from platform orgs without a subquery, which Postgres partial indexes can't contain —
-- so the "only one real group" rule now lives in leave_current_org() below instead of a bare
-- index. This index keeps the invariant an index *can* still enforce: never two simultaneous
-- active rows for the exact same user+org pair.
drop index if exists memberships_one_active_org_per_user;
create unique index memberships_one_active_per_user_org
  on memberships (user_id, org_id)
  where status = 'active';

-- Leaves only the caller's current *real* group (if any) — Independent Observers membership,
-- if they have one, is untouched. Called by create_own_org/redeem_org_invite/join_public_org
-- before joining a different real group; no longer called by join_independent_observers,
-- since joining that is additive now, not a switch.
create or replace function leave_current_org()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update memberships
  set status = 'removed'
  where user_id = auth.uid()
    and status = 'active'
    and org_id not in (select id from organizations where is_platform_org);
end;
$$;

create or replace function redeem_org_invite(invite_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invite org_invites%rowtype;
  existing memberships%rowtype;
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

  select * into existing from memberships
    where user_id = auth.uid() and org_id = invite.org_id
    order by created_at desc limit 1;

  if found then
    update memberships set status = 'active' where id = existing.id;
  else
    insert into memberships (user_id, org_id, role, status)
    values (auth.uid(), invite.org_id, 'member', 'active');
  end if;

  update org_invites set use_count = use_count + 1 where id = invite.id;
end;
$$;

create or replace function join_public_org(target_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing memberships%rowtype;
begin
  if not exists (
    select 1 from organizations
    where id = target_org_id and is_listed_publicly = true and status = 'active'
  ) then
    raise exception 'This group is not open for self-service joining';
  end if;

  perform leave_current_org();

  select * into existing from memberships
    where user_id = auth.uid() and org_id = target_org_id
    order by created_at desc limit 1;

  if found then
    update memberships set status = 'active' where id = existing.id;
  else
    insert into memberships (user_id, org_id, role, status)
    values (auth.uid(), target_org_id, 'member', 'active');
  end if;
end;
$$;

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

-- No longer calls leave_current_org() — joining Independent Observers is additive, it doesn't
-- give up an existing real-group membership.
create or replace function join_independent_observers()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  existing memberships%rowtype;
begin
  select id into target_org_id from organizations where slug = 'independent-observers';
  if target_org_id is null then
    raise exception 'Independent Observers organization is not configured';
  end if;

  select * into existing from memberships
    where user_id = auth.uid() and org_id = target_org_id
    order by created_at desc limit 1;

  if found then
    update memberships set status = 'active' where id = existing.id;
  else
    insert into memberships (user_id, org_id, role, status)
    values (auth.uid(), target_org_id, 'member', 'active');
  end if;

  return target_org_id;
end;
$$;
