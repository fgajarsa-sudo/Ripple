-- Ripple — migration 010: personal (not shared) independent-collection orgs
--
-- Migration 009's "Independent Observers" was a single org shared by every solo user — which
-- meant they'd all share the same thresholds too, since thresholds are a per-org concept.
-- That makes a solo user's thresholds meaningless if their collection area is genuinely
-- different from someone else's (explicit feedback: "they could be two independent test
-- areas... without thresholds, the collection is meaningless"). Each user who collects
-- independently now gets their own personal org instead — admin of it, full threshold
-- control, same mechanism as create_own_org, just auto-named and skipping invite-code
-- generation (no one else needs to be invited to a personal collection).
--
-- The old shared "Independent Observers" org is left in place but no longer referenced by
-- any code path after this migration — it has no real submissions yet (pre-launch test data
-- only) and sits outside Task 3's keep-list, so it'll be cleaned up in that pass rather than
-- migrated live here.

alter table organizations add column is_personal boolean not null default false;

-- Supersedes is_platform_org's role in leave_current_org()'s exclusion logic — personal
-- collections are the new "doesn't compete with your one real group" category.
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
    and org_id not in (select id from organizations where is_personal);
end;
$$;

create or replace function start_personal_collection()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_org_id uuid;
  new_org_id uuid;
  owner_name text;
begin
  -- Reuse this user's existing personal org if they already have one, rather than creating a
  -- new one every time they tap "Collect on my own."
  select m.org_id into existing_org_id
  from memberships m
  join organizations o on o.id = m.org_id
  where m.user_id = auth.uid() and o.is_personal
  order by m.created_at desc limit 1;

  if existing_org_id is not null then
    update memberships set status = 'active' where user_id = auth.uid() and org_id = existing_org_id;
    return existing_org_id;
  end if;

  select display_name into owner_name from profiles where id = auth.uid();

  insert into organizations (name, slug, is_listed_publicly, is_personal)
  values (
    coalesce(nullif(trim(owner_name), ''), 'My') || '''s Independent Collection',
    'independent-' || substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10),
    false,
    true
  )
  returning id into new_org_id;

  insert into memberships (user_id, org_id, role, status)
  values (auth.uid(), new_org_id, 'admin', 'active');

  return new_org_id;
end;
$$;

grant execute on function start_personal_collection() to authenticated;
