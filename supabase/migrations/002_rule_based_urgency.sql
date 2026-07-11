-- Ripple — migration 002: server-side rule-based urgency scoring (Phase 1)
--
-- §7 describes the full pipeline as "final urgency = max(rule-based severity, AI severity)"
-- with the AI half landing in Phase 2 via the analyze-submission Edge Function (which will
-- UPDATE ai_urgency after this trigger has already set the rule-based floor — permitted by
-- the submissions_update_columns_guard trigger from migration 001). This migration adds
-- only the rule-based half.
--
-- Deliberately computed server-side, not trusted from the client: urgency is a
-- security/trust-relevant classification (drives reviewer alerts), so the server decides
-- it from the submission's own readings + the org's thresholds, ignoring whatever (if
-- anything) the client sent for ai_urgency on insert.

create or replace function compute_rule_based_urgency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r_key text;
  r_val numeric;
  worst text := null;
  t_high thresholds%rowtype;
  t_medium thresholds%rowtype;
begin
  if new.readings is null or new.readings = '{}'::jsonb then
    -- nothing to score yet; Phase 2's photo-based AI analysis may still set urgency later
    new.ai_urgency := null;
    return new;
  end if;

  -- assumes readings values are always numeric literals (enforced client-side); a
  -- malformed non-numeric value would raise here rather than being silently skipped
  for r_key, r_val in
    select key, value::numeric from jsonb_each_text(new.readings)
  loop
    select * into t_high from thresholds
      where org_id = new.org_id and parameter = r_key and severity = 'high';
    if found and (
      (t_high.min_value is not null and r_val < t_high.min_value) or
      (t_high.max_value is not null and r_val > t_high.max_value)
    ) then
      worst := 'high';
      continue;
    end if;

    select * into t_medium from thresholds
      where org_id = new.org_id and parameter = r_key and severity = 'medium';
    if found and (
      (t_medium.min_value is not null and r_val < t_medium.min_value) or
      (t_medium.max_value is not null and r_val > t_medium.max_value)
    ) then
      if worst is distinct from 'high' then
        worst := 'medium';
      end if;
      continue;
    end if;

    if worst is null then
      worst := 'low';
    end if;
  end loop;

  new.ai_urgency := worst;
  return new;
end;
$$;

create trigger submissions_compute_rule_based_urgency
  before insert on submissions
  for each row execute function compute_rule_based_urgency();
