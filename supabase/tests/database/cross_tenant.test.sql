-- Cross-tenant RLS test suite (spec §5: "gates every schema PR").
--
-- Run with the Supabase CLI. Two ways, depending on what's available:
--   supabase test db --linked supabase/tests/database          (needs Docker, even against a linked project)
--   supabase db query --linked -f supabase/tests/database/cross_tenant.test.sql   (no Docker needed)
-- The second form only surfaces the last statement's output, which is why results are
-- collected into a temp table (tap_output) and dumped in one final SELECT rather than
-- relying on each assertion's own statement output.
--
-- Last run 2026-07-11 against the linked pilot project: 25/25 passing (23 from migration
-- 001, +2 for ai_usage_log added in migration 003), transaction rolled back cleanly
-- (verified zero residual rows in organizations/auth.users/submissions afterward). Re-run
-- after any RLS-relevant migration change.
--
-- Strategy: two orgs (A, B), one admin + one member each, seeded directly as the
-- superuser (bypasses RLS, which is correct for test fixture setup — RLS is what we're
-- testing, not fixture creation). Assertions then impersonate each user via
-- tests.authenticate_as() and check every table/bucket denies cross-org access, with a
-- same-org positive control alongside each negative one so an empty table can't produce a
-- false pass.

begin;
create extension if not exists pgtap;

select no_plan();

-- `supabase db query` (used here in place of `supabase test db`, which requires Docker)
-- only surfaces the last statement's result set, so every assertion's TAP output line is
-- collected here and dumped in one final SELECT instead of relying on each statement's
-- own output being visible.
create temporary table tap_output (id serial primary key, line text);
grant select, insert on tap_output to authenticated;
grant usage, select on sequence tap_output_id_seq to authenticated;

-- ----------------------------------------------------------------------------
-- Test-only auth impersonation helpers (mirrors Supabase's real auth.uid(), which reads
-- request.jwt.claim.sub / request.jwt.claims — setting both covers both code paths).
-- ----------------------------------------------------------------------------
create schema if not exists tests;
-- new schemas don't grant USAGE to PUBLIC by default; needed so later blocks can still
-- call tests.authenticate_as()/tests.clear_authentication() after role has already
-- switched to `authenticated` (function EXECUTE itself defaults to PUBLIC, but resolving
-- `tests.foo()` at all requires USAGE on the schema first).
grant usage on schema tests to public;

create or replace function tests.authenticate_as(p_user_id uuid) returns void as $$
begin
  perform set_config('request.jwt.claim.sub', p_user_id::text, true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;
end;
$$ language plpgsql;

create or replace function tests.clear_authentication() returns void as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  reset role;
end;
$$ language plpgsql;

-- pgTAP's throws_ok() overloads are ambiguous once you pass a plain description string
-- (it gets interpreted as an expected error message to match, not just a label) — this
-- sidesteps that entirely by catching the exception directly and reporting pass/fail via
-- pgTAP's unambiguous ok(boolean, description).
create or replace function tests.assert_raises(p_sql text, p_description text) returns text as $$
begin
  begin
    execute p_sql;
  exception when others then
    return ok(true, p_description);
  end;
  return ok(false, p_description);
end;
$$ language plpgsql;

-- ----------------------------------------------------------------------------
-- Fixtures
-- ----------------------------------------------------------------------------
do $$
declare
  v_org_a uuid;
  v_org_b uuid;
  v_admin_a uuid := gen_random_uuid();
  v_member_a uuid := gen_random_uuid();
  v_admin_b uuid := gen_random_uuid();
  v_member_b uuid := gen_random_uuid();
  v_site_a uuid;
  v_site_b uuid;
  v_submission_a uuid;
  v_submission_b uuid;
begin
  insert into organizations (name, slug, waterbody_name)
  values ('Org A Conservation', 'org-a', 'Lake A') returning id into v_org_a;
  insert into organizations (name, slug, waterbody_name)
  values ('Org B Conservation', 'org-b', 'Lake B') returning id into v_org_b;

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at, updated_at)
  values
    (v_admin_a, 'admin-a@ripple.test', json_build_object('display_name', 'Admin A', 'age_attested', true), 'authenticated', 'authenticated', now(), now()),
    (v_member_a, 'member-a@ripple.test', json_build_object('display_name', 'Member A', 'age_attested', true), 'authenticated', 'authenticated', now(), now()),
    (v_admin_b, 'admin-b@ripple.test', json_build_object('display_name', 'Admin B', 'age_attested', true), 'authenticated', 'authenticated', now(), now()),
    (v_member_b, 'member-b@ripple.test', json_build_object('display_name', 'Member B', 'age_attested', true), 'authenticated', 'authenticated', now(), now());

  insert into memberships (user_id, org_id, role, status) values
    (v_admin_a, v_org_a, 'admin', 'active'),
    (v_member_a, v_org_a, 'member', 'active'),
    (v_admin_b, v_org_b, 'admin', 'active'),
    (v_member_b, v_org_b, 'member', 'active');

  insert into sites (org_id, name, lat, lng) values (v_org_a, 'Site A', 43.73, -71.56) returning id into v_site_a;
  insert into sites (org_id, name, lat, lng) values (v_org_b, 'Site B', 44.00, -71.00) returning id into v_site_b;

  insert into submissions (org_id, user_id, site_id, lat, lng, captured_at, readings)
    values (v_org_a, v_member_a, v_site_a, 43.73, -71.56, now(), '{"ph": 7.2}'::jsonb)
    returning id into v_submission_a;
  insert into submissions (org_id, user_id, site_id, lat, lng, captured_at, readings)
    values (v_org_b, v_member_b, v_site_b, 44.00, -71.00, now(), '{"ph": 7.1}'::jsonb)
    returning id into v_submission_b;

  insert into ai_usage_log (submission_id, org_id, input_tokens, output_tokens) values
    (v_submission_a, v_org_a, 100, 50),
    (v_submission_b, v_org_b, 100, 50);

  insert into notifications (org_id, sent_by, title, body, target) values
    (v_org_a, v_admin_a, 'Alert A', 'Body A', 'all'),
    (v_org_b, v_admin_b, 'Alert B', 'Body B', 'all');

  insert into org_invites (org_id, code, created_by) values
    (v_org_a, 'CODE-A-1', v_admin_a),
    (v_org_b, 'CODE-B-1', v_admin_b);

  insert into storage.buckets (id, name, public) values ('submission-photos', 'submission-photos', false)
    on conflict (id) do nothing;
  insert into storage.objects (bucket_id, name, owner) values
    ('submission-photos', v_org_a::text || '/photo-a.jpg', v_member_a),
    ('submission-photos', v_org_b::text || '/photo-b.jpg', v_member_b);

  -- stash ids for later blocks via a temp table (do blocks can't return values)
  create temporary table test_fixture_ids as
  select v_org_a as org_a, v_org_b as org_b, v_admin_a as admin_a, v_member_a as member_a,
         v_admin_b as admin_b, v_member_b as member_b, v_site_a as site_a, v_site_b as site_b,
         v_submission_a as submission_a, v_submission_b as submission_b;
  -- created by the setup role; later blocks read it as `authenticated` via tests.authenticate_as()
  grant select on test_fixture_ids to authenticated;
end $$;

-- ----------------------------------------------------------------------------
-- organizations: member of A cannot see B's private detail beyond the public directory
-- columns (is_listed_publicly defaults false, so B should be fully invisible to A)
-- ----------------------------------------------------------------------------
select tests.authenticate_as((select member_a from test_fixture_ids));

insert into tap_output (line) select isnt_empty(
  format('select 1 from organizations where id = %L', (select org_a from test_fixture_ids)),
  'org A member can see org A'
);
insert into tap_output (line) select is_empty(
  format('select 1 from organizations where id = %L', (select org_b from test_fixture_ids)),
  'org A member cannot see unlisted org B'
);

-- ----------------------------------------------------------------------------
-- memberships
-- ----------------------------------------------------------------------------
insert into tap_output (line) select isnt_empty(
  format('select 1 from memberships where org_id = %L and user_id = %L',
    (select org_a from test_fixture_ids), (select member_a from test_fixture_ids)),
  'org A member sees their own membership'
);
insert into tap_output (line) select is_empty(
  format('select 1 from memberships where org_id = %L', (select org_b from test_fixture_ids)),
  'org A member cannot see org B memberships'
);

-- An RLS-blocked UPDATE doesn't throw (USING just filters it to zero matched rows), so
-- verify by re-checking the row afterward under an unrestricted role rather than
-- expecting an exception.
select tests.authenticate_as((select admin_a from test_fixture_ids));
update memberships set role = 'removed'
  where user_id = (select member_b from test_fixture_ids)
    and org_id = (select org_b from test_fixture_ids);
select tests.clear_authentication();
insert into tap_output (line) select is(
  (select role from memberships
    where user_id = (select member_b from test_fixture_ids)
      and org_id = (select org_b from test_fixture_ids)),
  'member',
  'org A admin cannot modify org B membership (update affects zero rows under RLS)'
);

-- ----------------------------------------------------------------------------
-- sites
-- ----------------------------------------------------------------------------
select tests.authenticate_as((select member_a from test_fixture_ids));
insert into tap_output (line) select isnt_empty(
  format('select 1 from sites where id = %L', (select site_a from test_fixture_ids)),
  'org A member sees org A site'
);
insert into tap_output (line) select is_empty(
  format('select 1 from sites where id = %L', (select site_b from test_fixture_ids)),
  'org A member cannot see org B site'
);

select tests.authenticate_as((select admin_a from test_fixture_ids));
insert into tap_output (line) select tests.assert_raises(
  format($f$insert into sites (org_id, name, lat, lng) values (%L, 'Hostile site', 0, 0)$f$,
    (select org_b from test_fixture_ids)),
  'org A admin cannot insert a site into org B'
);

-- ----------------------------------------------------------------------------
-- thresholds (auto-seeded by the org-creation trigger)
-- ----------------------------------------------------------------------------
select tests.authenticate_as((select member_a from test_fixture_ids));
insert into tap_output (line) select isnt_empty(
  format('select 1 from thresholds where org_id = %L', (select org_a from test_fixture_ids)),
  'org A member sees org A thresholds'
);
insert into tap_output (line) select is_empty(
  format('select 1 from thresholds where org_id = %L', (select org_b from test_fixture_ids)),
  'org A member cannot see org B thresholds'
);

-- ----------------------------------------------------------------------------
-- submissions
-- ----------------------------------------------------------------------------
select tests.authenticate_as((select member_a from test_fixture_ids));
insert into tap_output (line) select isnt_empty(
  format('select 1 from submissions where org_id = %L', (select org_a from test_fixture_ids)),
  'org A member sees org A submissions'
);
insert into tap_output (line) select is_empty(
  format('select 1 from submissions where org_id = %L', (select org_b from test_fixture_ids)),
  'org A member cannot see org B submissions'
);
insert into tap_output (line) select tests.assert_raises(
  format($f$insert into submissions (org_id, user_id, lat, lng, captured_at, readings)
    values (%L, %L, 0, 0, now(), '{}'::jsonb)$f$,
    (select org_b from test_fixture_ids), (select member_a from test_fixture_ids)),
  'org A member cannot insert a submission into org B'
);

select tests.authenticate_as((select admin_a from test_fixture_ids));
insert into tap_output (line) select is_empty(
  format('select 1 from submissions where org_id = %L', (select org_b from test_fixture_ids)),
  'org A admin cannot see org B submissions either'
);

-- ----------------------------------------------------------------------------
-- notifications
-- ----------------------------------------------------------------------------
select tests.authenticate_as((select member_a from test_fixture_ids));
insert into tap_output (line) select isnt_empty(
  format('select 1 from notifications where org_id = %L', (select org_a from test_fixture_ids)),
  'org A member sees org A notifications'
);
insert into tap_output (line) select is_empty(
  format('select 1 from notifications where org_id = %L', (select org_b from test_fixture_ids)),
  'org A member cannot see org B notifications'
);

-- ----------------------------------------------------------------------------
-- org_invites
-- ----------------------------------------------------------------------------
select tests.authenticate_as((select admin_a from test_fixture_ids));
insert into tap_output (line) select isnt_empty(
  format('select 1 from org_invites where org_id = %L', (select org_a from test_fixture_ids)),
  'org A admin sees org A invites'
);
insert into tap_output (line) select is_empty(
  format('select 1 from org_invites where org_id = %L', (select org_b from test_fixture_ids)),
  'org A admin cannot see org B invites'
);

-- ----------------------------------------------------------------------------
-- ai_usage_log
-- ----------------------------------------------------------------------------
insert into tap_output (line) select isnt_empty(
  format('select 1 from ai_usage_log where org_id = %L', (select org_a from test_fixture_ids)),
  'org A admin sees org A ai_usage_log rows'
);
insert into tap_output (line) select is_empty(
  format('select 1 from ai_usage_log where org_id = %L', (select org_b from test_fixture_ids)),
  'org A admin cannot see org B ai_usage_log rows'
);

-- ----------------------------------------------------------------------------
-- storage.objects (submission-photos bucket)
-- ----------------------------------------------------------------------------
select tests.authenticate_as((select member_a from test_fixture_ids));
insert into tap_output (line) select isnt_empty(
  format($f$select 1 from storage.objects where bucket_id = 'submission-photos' and name = %L$f$,
    (select org_a from test_fixture_ids)::text || '/photo-a.jpg'),
  'org A member sees org A photo object'
);
insert into tap_output (line) select is_empty(
  format($f$select 1 from storage.objects where bucket_id = 'submission-photos' and name = %L$f$,
    (select org_b from test_fixture_ids)::text || '/photo-b.jpg'),
  'org A member cannot see org B photo object'
);

-- ----------------------------------------------------------------------------
-- platform_admins are never granted for these fixture users, so agg_daily_site_readings
-- should show org A member only their own org's aggregate rows (or none, if no daily
-- aggregate has been computed yet in this transaction — sites without a materialized
-- refresh will legitimately return zero rows for both, which is why this check is
-- structured as "B rows are a subset of / never exceed what A can see" rather than
-- requiring non-empty A rows).
-- ----------------------------------------------------------------------------
-- REFRESH requires ownership/privilege on the mv — must run as the setup role, not while
-- still impersonating org A's member from the storage.objects block above.
select tests.clear_authentication();
refresh materialized view agg_daily_site_readings_mv;

select tests.authenticate_as((select member_a from test_fixture_ids));
insert into tap_output (line) select is_empty(
  format('select 1 from agg_daily_site_readings where org_id = %L', (select org_b from test_fixture_ids)),
  'org A member cannot see org B rows in agg_daily_site_readings'
);

-- ----------------------------------------------------------------------------
-- profiles: org A staff (admin/reviewer) should not see org B members' profiles
-- ----------------------------------------------------------------------------
select tests.authenticate_as((select admin_a from test_fixture_ids));
insert into tap_output (line) select isnt_empty(
  format('select 1 from profiles where id = %L', (select member_a from test_fixture_ids)),
  'org A admin sees org A member profile'
);
insert into tap_output (line) select is_empty(
  format('select 1 from profiles where id = %L', (select member_b from test_fixture_ids)),
  'org A admin cannot see org B member profile'
);

select tests.clear_authentication();
insert into tap_output (line) select * from finish();
select line from tap_output order by id;
rollback;
