-- Ripple — migration 003: AI pipeline wiring (Phase 2, spec §7)
--
-- Adds the ai_usage_log table (§7.6: "log token usage per org for future cost modeling")
-- and the database webhook trigger that invokes the analyze-submission Edge Function after
-- every submissions INSERT.
--
-- The webhook auth secret is generated server-side via gen_random_bytes() and stored in
-- Supabase Vault — it is never written to this file in plaintext, so it never lands in git
-- history. After this migration runs, retrieve it with:
--   select decrypted_secret from vault.decrypted_secrets where name = 'analyze_submission_webhook_secret';
-- and set it as the Edge Function's WEBHOOK_SECRET secret so the function can verify calls
-- actually came from this trigger and not an arbitrary internet request (the function is
-- deployed with --no-verify-jwt since the caller is Postgres, not a user session).

create table ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions (id) on delete cascade,
  org_id uuid not null references organizations (id) on delete cascade,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

alter table ai_usage_log enable row level security;

create policy ai_usage_log_select on ai_usage_log for select
  using (org_id in (select current_org_ids()) or is_platform_admin());
-- No insert policy for authenticated/anon — only the Edge Function (service_role, which
-- bypasses RLS) writes here.

create extension if not exists pg_net;

select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'analyze_submission_webhook_secret',
  'Shared secret so analyze-submission can verify a call came from this DB''s own trigger'
);

create or replace function trigger_analyze_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets where name = 'analyze_submission_webhook_secret';

  perform net.http_post(
    url := 'https://dvysizzelywbhemblqdq.supabase.co/functions/v1/analyze-submission',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', webhook_secret),
    body := jsonb_build_object('type', 'INSERT', 'table', 'submissions', 'record', to_jsonb(new))
  );
  return new;
end;
$$;

create trigger on_submission_created_analyze
  after insert on submissions
  for each row execute function trigger_analyze_submission();
