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

- **Phase 0–3 are code-complete.** Phase 3 adds the full admin surface (`app/(admin)/`):
  thresholds editor (with reset-to-defaults via `reset_org_thresholds()`, migration 006),
  sites manager, members + role changes + invite codes with QR rendering
  (`react-native-qrcode-svg`, code generation via `admin_create_invite()`, migration 005),
  a notification composer (`send-notification` Edge Function — targeting: all/active_30d/site,
  Expo Push chunked in 100s, prunes dead tokens it can detect synchronously), and CSV export
  (`export-org-data` Edge Function, `expo-file-system` + `expo-sharing` to save/share the file).
- Both new Edge Functions are deployed with **default JWT verification** (unlike
  `analyze-submission`, which uses `--no-verify-jwt` + a Vault secret since its caller is a DB
  trigger) — these are called directly by a logged-in admin, so the real user JWT is what
  identifies them; a service-role client is only used where RLS genuinely can't do the job
  (`send-notification`'s token resolution — `notifications`/`profiles` writes need it,
  `export-org-data` doesn't, since admins already have full RLS read access to their own org's
  submissions).
- Real bug found via live-testing `export-org-data`: `submissions` has two FKs to `profiles`
  (`user_id` and `reviewed_by`), so `.select('profiles(display_name)')` failed with "more than
  one relationship was found" — PostgREST can't guess which FK to embed on. Fixed with the
  explicit hint `profiles!submissions_user_id_fkey(display_name)`. Watch for this same ambiguity
  anywhere else a table has >1 FK into the same target (e.g. any future join through
  `reviewed_by`).
- **This app has real users now.** iOS distribution is live via TestFlight (not Expo Go — SDK 57
  never caught up on the App Store, so we went straight to a real signed build) and Android via a
  directly-shared EAS-built APK (no Play Store needed for internal testing). Bugs already found
  and fixed through actual device use, not just static checks: missing `EXPO_PUBLIC_SUPABASE_*`
  EAS environment variables (crashed on launch — local `.env` isn't visible to EAS cloud builds),
  a case-sensitive invite-code comparison, sign-up not handling the "no session until email
  confirmed" case, a navigation dead-end from the reviewer queue back to Home, and an app icon
  with an alpha channel (TestFlight accepted it; real App Store review wouldn't have). Treat
  "typecheck passes" as necessary, never sufficient — this project has a track record of shipping
  real bugs past static checks.
- Simplifications made to stay within §3's "keep dependencies minimal" rule, revisited each time
  a real feature needed more (sites, QR codes, CSV export all added a small targeted dependency
  when the feature genuinely required it — not speculatively): location/sites use editable text
  fields instead of a map picker (no `react-native-maps`); date/time on a submission is captured
  automatically, not user-editable; `sync_client_id` isn't populated yet (Phase 4 is offline —
  genuinely not needed before then).
- **Phase 4 (offline queue/sync) is code-complete.** Submissions always go through a local
  SQLite queue first (`lib/offlineQueue.ts`), then an immediate sync attempt
  (`lib/syncEngine.ts`); if that succeeds the user sees the normal "submitted" screen, if not
  they see a "queued" variant and the item stays in the queue. `sync_client_id` (already present
  in the schema since migration 001, unused until now) is the idempotency key — a `23505` unique
  violation on retry is treated as a successful sync, not an error, since it means a prior attempt
  landed server-side even though the client never saw the response. Sync is triggered three ways:
  immediately after a submission, on `NetInfo` reconnect events, and once on mount — all wired via
  `startSyncListeners()` in `app/(member)/_layout.tsx`. Photos are copied out of the camera's
  cache into the app's permanent document directory at enqueue time (`expo-file-system`'s
  `File`/`Directory`/`Paths`, not the pre-SDK-54 API) so they survive until the device is back
  online. History and Home show queue state (per-item status badges, a queued-count chip)
  by polling the local SQLite queue every 4s while those screens are focused — deliberately
  simple over wiring a pub-sub between `offlineQueue.ts` and the UI, since queue reads are cheap
  and local.
  Site auto-matching and membership lookup needed no new offline-caching work: the whole app
  already runs every query through `PersistQueryClientProvider` (`lib/queryClient.ts`,
  AsyncStorage-backed, 24h `gcTime`), so `sites` and `membership` queries are restored from disk
  on cold start even with no connection, as long as the app was opened online at least once in
  the last 24h.
  Not yet tested on a real device in airplane mode — the queue/sync logic is typechecked and
  unit-testable pieces are covered, but true offline behavior (kill connectivity mid-session,
  submit, restore connectivity, confirm auto-sync) needs a live device pass.
- Not yet built: Phase 5 (account deletion, my-data export, the
  separate Ripple platform web dashboard).

## Repo layout

See spec §3. Route groups under `app/`: `(auth)`, `(member)`, `(reviewer)`, and `(admin)` all
exist now.

## Environment

Supabase URL/anon key are read from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
(see `.env.example`; real values live in `.env`, gitignored). The pilot Supabase project
(`dvysizzelywbhemblqdq`) is linked and migration 001 is applied. To run CLI commands against it
non-interactively: `SUPABASE_ACCESS_TOKEN=<personal access token> npx supabase <command> --linked`.
This machine has no Docker, so use `supabase db query --linked -f <file.sql>` instead of
`supabase test db` for running SQL/tests directly.
