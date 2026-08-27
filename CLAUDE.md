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
- **Phase 5 items 1-3 (account deletion, my-data export, nightly aggregate refresh) are
  code-complete and deployed.** `app/(member)/settings.tsx` (reachable via a "Settings" link in
  Home's header) has two actions:
  - **Export my data** — entirely client-side, no Edge Function: RLS already scopes
    `submissions` to `user_id = auth.uid()`, so this just queries directly and builds a CSV the
    same way `app/(admin)/export.tsx` does for the org-wide version, then shares it via
    `expo-file-system` + `expo-sharing`.
  - **Delete my account** — one confirm `Alert`, then `delete-account` Edge Function
    (JWT-verified, same pattern as `send-notification`/`export-org-data`): resolves the caller
    from their own JWT, then a service-role client calls `auth.admin.deleteUser()`. `profiles`
    cascades from that (`on delete cascade`, migration 001) — all PII (display_name,
    expo_push_token) lives there, so deleting it is the whole job.
  - Migration 007 is what makes that cascade safe: `submissions.user_id`/`reviewed_by`,
    `notifications.sent_by`, and `org_invites.created_by` were changed from their default
    `NO ACTION`/`CASCADE` behavior to `ON DELETE SET NULL` (nullable where they weren't
    already), so the org keeps its submissions/notifications/invites — just with the departed
    user's attribution nulled out ("former member"), per spec §13 Phase 5. Real gotcha found
    while building this: Postgres fires row-level triggers for FK-cascaded `SET NULL` updates
    too, so the `submissions_update_columns_guard` trigger (migration 001, locks every column
    except the review/AI ones) was rejecting the cascade's own update and aborting the whole
    account deletion. Fixed by carving out exactly the `user_id → NULL` transition in that
    trigger, without opening a path to reassigning a submission to a different user. Verified
    end-to-end against the real linked database with a throwaway org/user/submission before
    trusting it (see git history for the one-off SQL — not kept as a permanent fixture).
  - Migration 007 also enables `pg_cron` and schedules `refresh-agg-daily-site-readings`
    (`agg_daily_site_readings_mv`, `REFRESH ... CONCURRENTLY` using the unique index migration
    001 already put on the matview) nightly at 03:17 UTC.
  - Site auto-matching and membership lookup needed no new work for offline caching — see the
    Phase 4 note above, same reasoning applies here (nothing account-deletion-specific to
    revisit).
- **Phase 6 item: Sentry crash reporting is wired in.** `@sentry/react-native` (installed via
  `npx expo install`, which auto-added the `@sentry/react-native` config plugin to `app.json`)
  is initialized in `lib/sentry.ts` — `Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  sendDefaultPii: false, ... })`, imported for its side effect at the top of
  `app/_layout.tsx`, whose default export is wrapped in `Sentry.wrap()` for an automatic error
  boundary + native crash capture. `sendDefaultPii` is explicitly off — some pilot orgs'
  volunteers are minors (age-gated at signup, migration 001), so Sentry gets crash/error
  context only, no automatic device/user PII collection. The DSN lives in
  `EXPO_PUBLIC_SENTRY_DSN` (`.env` locally, `eas env:create` for production/preview/development
  — same pattern as the Supabase URL/anon key) since a DSN is safe to embed client-side, unlike
  a real secret.
  What this gets you now: JS-level error/crash reporting. What's deliberately deferred: fully
  symbolicated native crash stack traces, which need a Sentry auth token for source-map/debug-
  symbol upload during EAS builds (the `@sentry/react-native/expo` plugin's build-hook side) —
  the plugin is installed but org/project/auth-token aren't configured in `app.json` yet. Add
  `organization`/`project` to the plugin config + `SENTRY_AUTH_TOKEN` as an EAS secret to turn
  it on. Not yet verified against a real crash on a real device — that needs the next
  TestFlight/APK build in testers' hands.
  Real bug found while shipping this: without org/project configured, the Sentry build-hook
  script doesn't skip the source-map upload quietly — it hard-fails both the Xcode and Gradle
  builds ("An organization ID or slug is required"). Fixed with `SENTRY_DISABLE_AUTO_UPLOAD=true`
  as an EAS env var (all three environments) — Sentry's own documented escape hatch for
  deferring source-map upload setup. Remove that var once org/project/auth-token are wired up.
- **External TestFlight testing is live.** An external group (public link, Apple-approved) is
  set up in App Store Connect alongside the Android APK link — both are real, installable links
  a non-technical tester can use with zero Apple ID/account setup on your end. Source is also
  public now: https://github.com/fgajarsa-sudo/Ripple (checked for secrets before pushing —
  clean; only `.p8`/`.env`/`credentials/` paths are gitignored, never their contents).
- Not yet built: Phase 5 item 4 (the separate Ripple platform web dashboard) and the remaining
  Phase 6 items (EAS Update OTA channel — `runtimeVersion`/`updates.url` are already present in
  `app.json` from `eas init`, but no update has actually been published to the `pilot` channel
  yet; a volunteer install guide).
- **Real bugs found via external beta testing, fixed:**
  - Offline readings taken in dead zones weren't syncing once the tester regained signal.
    Root cause: `startSyncListeners()` (`lib/syncEngine.ts`) only re-ran sync on a `NetInfo`
    connectivity *transition* event or on app mount — but iOS suspends JS execution while the
    app is backgrounded, so a transition that happens while the phone is locked/in a pocket
    never reaches that listener. Fixed by also triggering a sync check on `AppState` going
    `active` (catches "resumed from background after regaining signal") and a 60s interval
    safety net (catches connectivity flickering back without either a clean transition or a
    foreground event). Lakes are a notoriously bad-signal environment, so this class of gap is
    worth taking seriously rather than patching narrowly.
  - Sensor readings and admin thresholds now round to a consistent 3 decimal places
    (`roundToParameterPrecision()` in `lib/readings.ts`), applied when a reading is entered and
    when thresholds are saved. All 7 parameters use the same precision — `specific_gravity`
    needed at least ~3 decimals to stay meaningful (its whole useful range is ~0.99–1.03) and
    the team preferred uniform precision over a mixed per-parameter scheme.
  - Location step now includes a `react-native-maps` `MapView` with a draggable marker
    alongside the existing lat/lng text fields, since manually typing coordinates wasn't the
    easiest way to confirm/adjust a GPS fix. Works immediately on iOS (Apple Maps, no key
    needed). **Android needs a Google Maps API key** (`android.config.googleMaps.apiKey` in
    `app.json`) before map tiles will render there — not yet configured, since it requires the
    org's own Google Cloud project/billing.

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
