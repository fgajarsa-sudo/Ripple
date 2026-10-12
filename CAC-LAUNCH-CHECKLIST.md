# CAC launch — what's left (prepared 2026-10-12)

Branch: `cac-launch-prep` (built on `fix-launch-crash-submit-draft`). Nothing here has touched
the live database or `master`.

## Status vs. the CAC launch spec

| Task | Status |
|---|---|
| 1. Open registration, three paths | Done — extended to one group + one personal collection, separate thresholds, picker on submit (admin's explicit request; spec said one org per user) |
| 2. Org isolation audit | Done — 31/31 cross-tenant tests |
| 3. Test data cleanup + Ripple Demo | **Script drafted, NOT run:** `scripts/cac-task3-cleanup.sql` |
| 4. Store-required features | Account deletion, 13+ attestation, version 1.0.0, exact permission copy, no background location — all verified in code. **Left:** screenshots + device walkthrough |
| 5. Privacy + support pages | **Pages drafted** in `docs/` (`docs/privacy/`, `docs/support/`). **Left:** turn on GitHub Pages |
| 6. Builds, submit, freeze tag | Not started — needs the laptop (Expo + Apple sign-ins) |

## Admin to-do (decisions only the admin can make)

1. (Done) Operator: "a student-led group"; support email confirmed: fgajarsa@gmail.com.
2. Read STEP 1 output of `scripts/cac-task3-cleanup.sql`, confirm the four org names to keep.
3. Ripple Demo email confirmed: `fgajarsa+rippledemo@gmail.com`. Admin picks the password at the laptop (never written into the repo).

## Laptop session — paste this into Claude Code

> Run `git fetch origin` and merge `origin/android-map-fallback` into master. It hides the map on Android (no Google Maps key exists) and adds install steps to the support page. Run `npm run typecheck && npm test` and stop if either fails.
>
> Then follow the CAC launch spec and CAC-LAUNCH-CHECKLIST.md, in this exact order:
>
> 1. **Privacy + support pages:** enable GitHub Pages for this repo from the `master` branch, `/docs` folder. Confirm both pages load and give me the /privacy and /support URLs.
>
> 2. **Data cleanup:** walk me through `scripts/cac-task3-cleanup.sql` one step at a time. Show me the STEP 1 output and wait for my OK before running anything that deletes data. Then create the Ripple Demo account with email fgajarsa+rippledemo@gmail.com (I'll type the password myself) and run its setup step.
>
> 3. **Builds:** start the iOS production build and the Android APK build from the same commit. While they run, tell me exactly which screenshots to take on my phone and what sizes App Store Connect needs.
>
> 4. **App Store:** upload the iOS build to App Store Connect, fill in the listing, the privacy questionnaire (per the spec), and the App Review notes with the Ripple Demo login and invite code, then submit for review. Do not create or share any TestFlight public link.
>
> 5. **Freeze:** tag the submitted commit `cac-2026-submission`, create a GitHub Release from that tag, and attach the APK to it.
>
> 6. **Report:** give me, in one message, every link for the CAC form:
>    - App Store link (and its review status)
>    - Android download link from the GitHub Release
>    - Privacy and support page URLs
>    - GitHub link: https://github.com/fgajarsa-sudo/Ripple/tree/cac-2026-submission
>    - Ripple Demo login email and invite code
>
>    Do not include any TestFlight link.
>
> Do not start any surf work. After the tag, master is frozen.

## Device walkthrough (Task 4) — on the TestFlight build

- [ ] Fresh install opens (no crash)
- [ ] Sign up → "Start a group" → see invite code + QR
- [ ] Sign up (2nd account) → "Join a group" with that code
- [ ] Sign up (3rd account) → "Collect on my own" → lands on thresholds setup
- [ ] Member of a group + personal collection: "Submit a Reading" asks which one
- [ ] Submit one reading to each (with photo); "Submitting for X" shows the right name
- [ ] My History labels each reading with the right collection
- [ ] Set different thresholds for group vs personal; a reading is scored against the right one
- [ ] Settings → Export my data works; Delete my account works
- [ ] Android (borrow any Android phone, ~5 min): install the APK, sign in, submit one reading — location screen shows GPS + lat/lng fields, no map, no crash
- [ ] Airplane mode: submit → shows "queued" → turn signal back on → it syncs
- [ ] Screenshots for the listing: Home, submit flow, History

## Notes for the next session

- Sentry was removed on 2026-10-11 (commit 1d2f116). `CLAUDE.md`'s Phase 6 Sentry section is
  out of date; `SENTRY_DISABLE_AUTO_UPLOAD` / `EXPO_PUBLIC_SENTRY_DSN` EAS vars are now unused.
- The launch crash was `useSubmitDraft()` on Home outside `SubmitDraftProvider` (fixed in
  `fix-launch-crash-submit-draft`). Keep exactly one provider, in `app/(member)/_layout.tsx`.
- The iOS location permission text says "your conservation group" — it's the spec's exact
  copy, so it was left as-is even though personal collections now exist. Admin's call.
