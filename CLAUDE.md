@AGENTS.md

# Ripple — working notes for Claude Code

`RIPPLE-BUILD-SPEC.md` (in the repo root, or wherever it was provided from) is the source of
truth for this project. Treat it as authoritative and ask before deviating from it. If something
in the codebase contradicts the spec, the spec wins unless the user says otherwise — check with
them rather than guessing (see the sensor-field / temperature-unit resolution history for why:
the spec's prose and the reference Lovable prototype disagreed, and only the user could settle it).

## Hard rules

- **TypeScript strict mode.** `tsconfig.json` has `"strict": true` — don't weaken it.
- **Every schema change ships with RLS policies + cross-tenant tests in the same migration PR.**
  A migration that adds/changes a table without updating `supabase/tests/database/` is incomplete.
- **No service-role key usage outside Edge Functions.** The mobile app and the platform dashboard
  only ever use the anon key + user session (RLS-enforced). Service-role key lives in Edge
  Function secrets only.
- **No PII in aggregates.** Nothing reachable by `platform_admins` (i.e. `agg_daily_site_readings`
  and anything derived from it) may carry `user_id`, `display_name`, email, `expo_push_token`,
  exact `lat/lng`, or `photo_path`. See spec §5.
- **Run `npm run typecheck && npm test` before declaring any task done.**
- **Permission strings in spec §11 are exact copy — don't rewrite them.** They're already in
  `app.json` (`infoPlist` / `plugins` config) — copy from there, don't re-author.
- **Keep dependencies minimal.** Stick to the libraries listed in spec §3 unless there's a real
  reason to add another one — ask first.
- The cross-tenant RLS test suite (`supabase/tests/database/cross_tenant.test.sql`) gates every
  schema PR — re-run it after any migration that touches RLS. Currently 25/25 passing against the
  linked pilot Supabase project (via `supabase db query --linked -f <file>`, since this machine
  has no Docker for `supabase test db`).

## Phase status

- **Phase 0** (foundations), **Phase 1** (core submit loop), and **Phase 2** (AI + review) are
  code-complete. Phase 2 adds: the `analyze-submission` Edge Function (deployed, live-tested with
  a real Anthropic key — both the medium and HIGH severity paths verified against the linked
  project), the `on_submission_created_analyze` database webhook trigger (migration 003, auth'd
  via a Vault-generated shared secret, not a hardcoded one), `ai_usage_log` for per-org token cost
  tracking, Expo push token registration, and the reviewer queue + detail screens
  (`app/(reviewer)/`) with validate/reject/note actions.
- Guardrail note: the function *always* calls Claude when a key is present, even when rule-based
  severity is already HIGH — an earlier version skipped the call in that case to save cost, but
  that meant the most important submissions never got an AI summary, which defeats the point for
  reviewers. The guardrail only stops AI from *lowering* a rule-based HIGH, never from running.
- Verified via `npm run typecheck`, `npm test`, `expo-doctor`, the RLS suite, and live end-to-end
  webhook + Claude API tests against the pilot project (test fixtures created and cleaned up
  immediately after) — **still not yet verified on an actual device or simulator**. Expo Go's App
  Store build hasn't caught up to Expo SDK 57 yet (Apple review lag, not a project bug); this
  machine also has no Docker/Android/iOS simulator. Do an end-to-end run-through on a phone once
  Expo Go updates before trusting the UI beyond what static checks can catch.
- Simplifications made to stay within §3's "keep dependencies minimal" rule, to revisit if the
  product needs more later: location step uses editable text fields instead of a map picker (no
  `react-native-maps`); date/time on a submission is captured automatically, not user-editable
  (no date/time picker library); `sync_client_id` isn't populated yet (Phase 1 is online-only per
  §13 — offline dedupe is genuinely Phase 4 work).
- The Submitted screen's copy avoids claiming "reviewers were alerted" for HIGH, since real push
  delivery wasn't wired up when that screen was first built — it now is (Phase 2's HIGH
  auto-alert push), so that copy is a candidate to revisit and make more assertive.
- `send-notification` (admin-composed notifications with targeting: all/active_30d/site) is
  explicitly Phase 3 — only the automatic HIGH-urgency push exists so far, inlined in
  `analyze-submission` rather than going through a general-purpose notification function.

## Repo layout

See spec §3. Route groups under `app/`: `(auth)`, `(member)`, and `(reviewer)` exist. `(admin)`
gets created when Phase 3 starts — don't scaffold empty route groups ahead of the screens that
belong in them.

## Environment

Supabase URL/anon key are read from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
(see `.env.example`; real values live in `.env`, gitignored). The pilot Supabase project
(`dvysizzelywbhemblqdq`) is linked and migration 001 is applied. To run CLI commands against it
non-interactively: `SUPABASE_ACCESS_TOKEN=<personal access token> npx supabase <command> --linked`.
This machine has no Docker, so use `supabase db query --linked -f <file.sql>` instead of
`supabase test db` for running SQL/tests directly.
