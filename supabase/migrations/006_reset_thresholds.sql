-- Ripple — migration 006: admin "reset to defaults" for thresholds (Phase 3)
--
-- Duplicates the literal default values from seed_default_thresholds() (migration 001) —
-- kept as a separate values list rather than factored into one shared function, since the
-- insert shapes differ slightly (ON CONFLICT upsert here vs. plain insert on org creation).
-- If the defaults ever change, both places need updating.

create or replace function reset_org_thresholds(target_org_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not has_role(target_org_id, 'admin') then
    raise exception 'Only org admins can reset thresholds';
  end if;

  delete from thresholds where org_id = target_org_id;

  insert into thresholds (org_id, parameter, min_value, max_value, severity) values
    (target_org_id, 'ph',               6.0,  9.0,  'medium'),
    (target_org_id, 'ph',               5.0,  10.0, 'high'),
    (target_org_id, 'temp_f',           32,   77,   'medium'),
    (target_org_id, 'temp_f',           25,   86,   'high'),
    (target_org_id, 'ec',                50,  500,  'medium'),
    (target_org_id, 'ec',                20,  1000, 'high'),
    (target_org_id, 'tds',               25,  250,  'medium'),
    (target_org_id, 'tds',               10,  500,  'high'),
    (target_org_id, 'salinity',          0,   100,  'medium'),
    (target_org_id, 'salinity',          0,   250,  'high'),
    (target_org_id, 'specific_gravity',  0.995, 1.005, 'medium'),
    (target_org_id, 'specific_gravity',  0.99,  1.01,  'high'),
    (target_org_id, 'orp',               150,  400,  'medium'),
    (target_org_id, 'orp',               100,  500,  'high');
end;
$$;

grant execute on function reset_org_thresholds(uuid) to authenticated;
