-- ============================================================================
-- CAC launch spec — Task 3: keep the groups, wipe the data
-- DRAFT prepared in a phone session (not yet run). Run against the LIVE Supabase project only
-- after the admin has read STEP 1's output and confirmed the keep-list below.
--
-- How to run (from the laptop):
--   STEP 1 (read-only):  paste the STEP 1 block into Supabase Dashboard -> SQL Editor
--   STEP 2 (destructive): paste the STEP 2 block. It ends in ROLLBACK on purpose — read the
--                         "after" counts it prints, and only if they look right change the
--                         final ROLLBACK to COMMIT and run it again.
--   STEP 3: delete photos in Dashboard -> Storage -> submission-photos (select all -> delete).
--           Supabase blocks deleting storage files from SQL, so this one is a click.
--   STEP 4: create the Ripple Demo login (instructions at the bottom).
-- ============================================================================


-- ============================================================================
-- STEP 1 — PREVIEW (changes nothing)
-- Check the exact names: the spec says "Team A, Team B, Team C" and "Squam Lakes
-- Association", but the real rows may be named slightly differently. Fix KEEP_NAMES in
-- STEP 2 to match exactly before running it.
-- ============================================================================
select o.name, o.slug, o.is_personal, o.is_platform_org,
       (select count(*) from memberships m where m.org_id = o.id and m.status = 'active') as active_members,
       (select count(*) from submissions s where s.org_id = o.id) as submissions
from organizations o
order by o.name;

select count(*) as total_submissions from submissions;
select count(*) as total_photos from storage.objects where bucket_id = 'submission-photos';


-- ============================================================================
-- STEP 2 — CLEANUP (ends in ROLLBACK; switch to COMMIT only after checking the output)
-- ============================================================================
begin;

-- The orgs that survive launch. Ripple Demo is created below; everything else
-- (old test orgs, the retired shared "Independent Observers" org, testers' personal
-- collections) is deleted. Deleting an org cascades to its memberships, sites,
-- thresholds, invites and submissions — testers' *accounts* are untouched.
create temp table keep_names (name text primary key) on commit drop;
insert into keep_names values
  ('Team A'), ('Team B'), ('Team C'), ('Squam Lakes Association');   -- <- edit to match STEP 1

-- Safety stop: refuse to continue if any keep-list name doesn't exist exactly.
do $$
declare missing text;
begin
  select string_agg(k.name, ', ') into missing
  from keep_names k where not exists (select 1 from organizations o where o.name = k.name);
  if missing is not null then
    raise exception 'Keep-list names not found in organizations: %. Fix KEEP_NAMES and re-run.', missing;
  end if;
end $$;

-- 1. Wipe every submission and test notification across ALL orgs (production starts empty).
delete from submissions;
delete from notifications;

-- 2. Delete every org not on the keep-list.
delete from organizations where name not in (select name from keep_names);

-- 3. Create the Ripple Demo org (for Apple's reviewer). Its admin is attached in STEP 4.
insert into organizations (name, slug, is_listed_publicly, waterbody_name, region)
values ('Ripple Demo', 'ripple-demo', false, 'Demo Lake', 'New Hampshire')
on conflict (slug) do nothing;

-- 4. Fresh invite codes for all five remaining orgs (old codes stop working).
delete from org_invites;
insert into org_invites (org_id, code)
select id, upper(substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8))
from organizations;

-- 5. Show the result. These rows are what you'll copy into the CAC form / admin screens.
select o.name, i.code as invite_code,
       (select count(*) from memberships m where m.org_id = o.id and m.status = 'active') as active_members,
       (select count(*) from submissions s where s.org_id = o.id) as submissions
from organizations o join org_invites i on i.org_id = o.id
order by o.name;

rollback;   -- <- change to COMMIT only after the output above looks right


-- ============================================================================
-- STEP 4 — Ripple Demo login (after STEP 2 is committed)
-- a) Dashboard -> Authentication -> Users -> Add user -> "Create new user"
--    email: fgajarsa+rippledemo@gmail.com (confirmed by admin)
--    password: something you'll paste into App Review Notes. Tick "Auto confirm user".
-- b) Run this, with the demo email filled in. It makes the demo user admin of Ripple Demo
--    and adds one site + 4 plausible sample readings so the reviewer sees a lived-in app.
--    (Inserting readings fires the normal AI analysis trigger, which is fine — it shows
--    the reviewer the real urgency badges.)
-- ============================================================================
-- do $$
-- declare
--   demo_email text := 'fgajarsa+rippledemo@gmail.com';
--   demo_user uuid;
--   demo_org uuid;
--   demo_site uuid;
-- begin
--   select id into demo_user from auth.users where email = demo_email;
--   if demo_user is null then raise exception 'Create the demo user in Authentication first'; end if;
--   select id into demo_org from organizations where slug = 'ripple-demo';
--
--   update profiles set display_name = 'Ripple Demo' where id = demo_user;
--   insert into memberships (user_id, org_id, role, status)
--   values (demo_user, demo_org, 'admin', 'active')
--   on conflict do nothing;
--
--   insert into sites (org_id, name, lat, lng, radius_m)
--   values (demo_org, 'North Cove', 43.7600, -71.5400, 150)
--   returning id into demo_site;
--
--   insert into submissions (org_id, user_id, site_id, lat, lng, captured_at, weather, notes, readings, sync_client_id)
--   values
--     (demo_org, demo_user, demo_site, 43.7601, -71.5402, now() - interval '9 days', 'Clear',        'Calm morning, clear water.',
--      '{"temp_f": 64.2, "ph": 7.1, "ec": 48.0, "tds": 24.0, "salinity": 23.0, "specific_gravity": 1.000, "orp": 210}', 'demo-1'),
--     (demo_org, demo_user, demo_site, 43.7599, -71.5398, now() - interval '6 days', 'Partly Cloudy', null,
--      '{"temp_f": 66.8, "ph": 7.3, "ec": 51.0, "tds": 26.0, "salinity": 25.0, "specific_gravity": 1.000, "orp": 198}', 'demo-2'),
--     (demo_org, demo_user, demo_site, 43.7603, -71.5405, now() - interval '3 days', 'Overcast',     'Slight green tint near the shore.',
--      '{"temp_f": 71.5, "ph": 8.4, "ec": 62.0, "tds": 31.0, "salinity": 30.0, "specific_gravity": 1.001, "orp": 165}', 'demo-3'),
--     (demo_org, demo_user, demo_site, 43.7600, -71.5401, now() - interval '1 day',  'Clear',        null,
--      '{"temp_f": 68.0, "ph": 7.4, "ec": 50.0, "tds": 25.0, "salinity": 24.0, "specific_gravity": 1.000, "orp": 205}', 'demo-4');
-- end $$;
