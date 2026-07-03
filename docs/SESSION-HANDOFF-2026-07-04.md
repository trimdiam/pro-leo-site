# Session Handoff — 2026-07-04

Read this first when resuming work on `pro-leo-site`. Everything from 2026-07-03 is committed, deployed, and pushed — nothing carried over as unfinished code. The one open item is a **planned but not-yet-built feature**, fully designed below, ready to implement.

## Next task: standalone student report-card lookup link

**Goal:** a temporary, standalone (not inside the teacher/admin app) page where a parent/student can pull up and download their own *released* Half-Yearly report card without logging in — because this year the main app is teacher-only; full rollout to students/parents isn't until next year.

### Finalized design (agreed with user, do not re-litigate these — build them)
- **Lookup credentials: Class + Roll No + DOB.** No full name field. No release-code/PIN gate — this was discussed and explicitly dropped in favor of simplicity. The only anti-abuse layer is rate limiting on the backend.
- **DOB data is reliable** — checked the real production `students` Firestore collection (not the local offline-fallback JSON files, which are stale and mostly missing DOB): 58/59 Class I and 54/55 Class II students have DOB on file. Safe to rely on.
- **Architecture:**
  1. New Cloud Function `lookupReportCard` (`onCall`, in `functions/index.js`, matching the existing style like `setTempPassword`/`recordStaffAttendance` — `asia-south1` region, `HttpsError` for rejections). Does the match server-side via Admin SDK: find student in `students` by class+rollNo+dob, then query `report_cards` for that studentId + `status == 'released'` for the currently-configured term. No new public Firestore read rules — the function is the only access path.
  2. Rate limiting inside the function (per IP or a coarse key) — needs designing since this codebase has **no existing App Check/reCAPTCHA anywhere** (checked, confirmed absent) — this is new ground, build it from scratch (a simple Firestore attempt-counter keyed by IP+day is enough, no need for App Check infra unless it becomes a problem).
  3. **Kill switch:** one Firestore doc, e.g. `settings/report_card_lookup: { enabled, term }`, checked by the function before responding. Admin flips `enabled` off manually when the release window is over — no auto-expiry date, purely manual (explicitly chosen over auto-expire).
  4. **Standalone page:** new folder (e.g. `report-card-lookup/`) with its own `index.html` + minimal JS — no shared nav/bundle with the teacher/admin app. Form: Class dropdown, Roll No, DOB picker. Calls the Cloud Function via `httpsCallable`.
  5. **Rendering the result:** reuse `buildPrintableHTML()` from `report-card-print.js` (root of repo) — it's fully self-contained (own CDN `<script>` tags for jsPDF/html2canvas, its own "Download PDF" button, no imports) and is the same function the existing admin "Preview" button already uses. Since the standalone page lives on a separate hosting site/public folder, **copy `report-card-print.js` into the new folder** rather than trying to share it across hosting targets — it's small and self-contained, low drift risk for what's meant to be a temporary feature.
  6. **Separate Firebase Hosting site**, not a hidden path on the main domain — explicitly chosen so it's a genuinely different shareable URL and can be torn down after the release window without touching the main site. Firebase supports multiple hosting sites per project for free; needs `firebase hosting:sites:create <new-site-id>`, a `target` entry in `.firebaserc`, and a second `hosting` block in `firebase.json` pointing at the new folder.

### Build order (chunked — confirm with user after each step per their CLAUDE.md mobile-timeout-prevention rule; do NOT do them all in one pass)
1. Cloud Function `lookupReportCard` in `functions/index.js`.
2. Firestore `settings/report_card_lookup` doc + rules entry (function-only, no client access needed since the flag is checked server-side inside the function, not read by the client directly).
3. Standalone page (`report-card-lookup/index.html` + JS + copied `report-card-print.js`).
4. New Firebase Hosting site/target wiring in `.firebaserc`/`firebase.json`.
5. Deploy functions + new hosting target; set the initial `settings/report_card_lookup` doc (`enabled: true`, correct `term`).
6. End-to-end test before handing the link to the user — ideally via the Firestore/Auth emulator setup already documented below, not against production with real student data, if a functions-emulator equivalent can be wired in too (check `firebase emulators:start --only functions,firestore` works with the bundled JRE approach below).

### One thing to watch when building
Don't silently reintroduce the release-code or full-name fields — both were explicitly proposed and explicitly rejected in favor of simplicity. If security concerns come up again, raise them as a question, don't just add complexity back in.

## Reusable infrastructure (unchanged, still true)
- **Firestore/Auth emulator**, since Java isn't on this machine's PATH: prepend Android Studio's bundled JRE before running the emulator —
  ```
  export PATH="/c/Program Files/Android/Android Studio/jbr/bin:$PATH"
  npx firebase emulators:start --only firestore,auth
  ```
  Auth on `127.0.0.1:9099`, Firestore on `127.0.0.1:8080`, UI on `127.0.0.1:4000`. Seed test users with `firebase-admin` (already in `node_modules`) pointed at the emulator via `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` env vars (Admin SDK bypasses rules — the only way to seed `users/{uid}` docs without a chicken-and-egg rules problem). `assessment-app/services/firebase-config.js` already auto-connects to these emulators when `location.hostname` is `localhost`/`127.0.0.1`.
- **Claude Preview MCP:** `.claude/launch.json` → `site-root` on port 4601 (serves the real repo root via `assessment-app/tools/root-server.mjs`), `demo-cards` on 4599.
- **Production Firestore access for scripts:** `serviceAccountKey.json` exists at repo root, works with `firebase-admin` for direct read/write bypassing security rules — used to verify writes/reads directly. **Always delete throwaway scripts after use** — don't leave `_tmp-*.mjs` files lying around (they're not gitignored by name pattern, only by convention of deleting them).
- **`docs/` is now excluded from Firebase Hosting** (`firebase.json` fix from 2026-07-03) — safe to keep reference material, photos, spreadsheets there without it becoming public. Don't re-add `docs/` back into a hosting deploy without re-checking this.

## Known state, no action needed
- All commits through `b8a9034` are pushed to `origin/main` and deployed to production (both hosting and Firestore rules).
- Four files show as deleted in the working tree (`RP/ReportCard_01_Arjun_Sharma_SFDS.pdf`, `RP/ReportCard_25_Neha_Chauhan_SFDS.pdf`, `STAFF-ATTENDANCE-APK-TODO.md`, `session-summary-2026-06-02.md`) — these were already missing from disk before any work in the 2026-07-03/04 sessions touched anything; not caused by Claude. Still uncommitted/unexplained — worth the user checking whether this was intentional before it lingers further.
- Three untracked files in `docs/` (`maths assessment April.xlsx`, two upscaled PNGs) — harmless now that `docs/` is hosting-ignored, just uncommitted. No urgency.
- `.claude/settings.local.json` modified (local permission allowlist growth from today's session) — not deploy-relevant, fine to leave as-is or commit, user's call.

## Next steps when resuming
1. Start the standalone report-card lookup feature per the build order above — confirm with the user before each chunked step.
2. Ask the user about the four mysteriously-deleted files if it hasn't come up.
