# Session Handoff — 2026-07-03

Read this first when resuming work on `pro-leo-site`. Everything below is **deployed and live** at https://st-francis-school-a3e7e.web.app and committed to git as of `63d9733` / `d5e5b7b`.

## Deployed and confirmed working

1. **Fixed recurring "teacher keeps disappearing" bug (SFSTEMPT01 / SFSTEMPT02).**
   Root cause: `SFS_TEACHER_DIRECTORY` in `app-logic.js` (~line 11500) is a hardcoded list the Admin → Manage Teachers → **Sync Directory** feature matches against by `staffId`. Two entries — Anando Pohtam and Daprikmen Massar — had `staffId: ""`. Any manually-added teacher doc that doesn't match an entry in this array is flagged as an "orphan" by Sync Directory and gets batch-deleted when an admin applies changes. Fixed by setting:
   - `staffId: "SFSTEMPT01"` for Anando Pohtam (`app-logic.js:11638`)
   - `staffId: "SFSTEMPT02"` for Daprikmen Massar (`app-logic.js:11637`)
   Confirmed surviving a real Sync Directory run in the live admin panel.

2. **New admin feature: "All Marks" overview (Class III–X).**
   Read-only view under Admin → Academic → **All Marks**. Built in `app-logic.js` (~line 5870 onward) and `index.html` (~line 1849, sidebar button; ~line 2378, section + drill-down modal).
   - Summary grid: Class × (Half Yearly / Final Term) showing student count, subject count, % marks entered. Click a cell → `openMarksDrilldown(cls, term)`.
   - Level 2: per-subject entered/submitted counts for that class+term. Click "View" → `loadMarksSubjectStudents(cls, term, subject)`.
   - Level 3: every student's actual IA/UT/TE/Total for that subject (UT column only shown if any student in the class has a UT field — determined once per table, not per row, to avoid column misalignment).
   - No write path — view only, by design (user's choice, to keep mark-entry as single source of truth).
   Confirmed against real Firestore data with a live admin session — numbers and drill-down render correctly for both `standard` (III–VIII) and `senior` (IX–X) mark schemes.

3. **Mobile UI fix: "Enter Marks" button no longer requires horizontal scroll.**
   On the Teacher Portal's subject-assignment table (`.tp-assign-table`, rendered by `renderTPAssignments` in `app-logic.js`), the Action column with the "Enter Marks →" button was pushed off-screen on mobile, requiring teachers to scroll left/right to find it.
   Root cause: existing mobile card-stacking CSS (`styles.css:3552`, `@media max-width:640px`) correctly turned `<tr>`/`<td>` into stacked label:value rows, but a **global** `table { min-width: 600px }` rule (`styles.css:1684`, intended for the desktop-style scrollable admin tables elsewhere in the app) still forced the `<table>` element itself to be 600px wide regardless — so the visually-stacked card still sat inside an invisibly-oversized table, and `.table-wrap`'s `overflow-x:auto` kept the scroll active.
   Fix: added `display: block; width: 100%; min-width: 0` scoped to `.tp-assign-table`/`tbody` inside the existing mobile media query (`styles.css:3552-3564`) — does not touch the global `table`/`.table-wrap` rules other (intentionally-scrollable) admin tables rely on.
   Confirmed on a real phone.

## Also resolved (carried over from 2026-07-02, now confirmed)
- Real-device APK offline confirmation — done.
- SFST002 / SFST005 contradictory `classTeacher` vs `classTeacherOf` fields — resolved.

## Deliberate behaviors carried over (confirmed as intended, not bugs)
- CT co-scholastic override: a class teacher can still edit/override a co-scholastic grade a subject teacher already entered — confirmed acceptable.
- Split-subject submit-completeness: CT dashboard's "X of Y submitted" counts a shared subject as done once EITHER teacher submits, not both — confirmed acceptable.

## Class Test / Term Summary feature (committed `d5e5b7b`) — verified in browser preview

A separate, larger feature landed on top of this handoff's changes: Class I/II Half-Yearly class test with 70/30 blended report card grading (new `assessment-app/components/class-test-entry.js`, `term-summary.js`, `class-test-loader.js`, `class-test-storage.js`, plus changes to `aggregation-engine.js`, `report-card-builder.js`, `report-card-grade-engine.js`, `firestore-service.js`, and a switch from weekly to bi-weekly assessment scheduling in `main.js`/`session-setup.js`).

Verified via Claude Preview (`site-root` on port 4601, injected `sfds_auth_user` localStorage session to bypass real Firebase login, real local-JSON student fallback data, "Load Class I Drill Demo"):
- Class Test entry: class/subject filtering correct (Hindi correctly excluded for Class I), mark validation correct (rejects out-of-range, accepts 0), save persists to localStorage with correct `test_id`/student IDs, round-trip reload on subject switch works correctly.
- Firestore write/read calls fail with `permission-denied` in this sandbox (no real Firebase Auth token) but fail non-fatally — local-first behavior works as designed. Same known limitation as the rest of this app in this dev environment.
- Admin Term Summary: renders class comparison, subject rankings (sorted correctly, term-over-term trend), student table (sortable/searchable, names resolve correctly once a class is selected), and drill-through to student profile — all with real aggregated demo data (63% class average, 59 students, 10 assessments across 5 subjects).

**Bug found and fixed:** in `assessment-app/main.js`, `handleTestMarkChange()` (~line 992) updated `state.testMarks` but never called `render()`, so the "X/Y entered" progress counter stayed stuck until Save was clicked. Fixed by adding `render()` to the handler. Re-verified in browser preview: counter now updates live per mark entered, prior values survive the re-render, no console errors. Not yet committed.

**Still not verified:** real Firebase Auth login (teacher/admin) and real Firestore reads/writes — only local-storage-backed behavior was confirmed in this sandbox.

## Report card blending — fully verified against a real Firestore write

Set up the Firestore + Auth emulator (`firebase.json` already had an `emulators` block) to remove the "no real auth token" sandbox limitation entirely, instead of weakening report-card save behavior in production. Steps, for next time:
1. Java isn't on PATH on this machine, but Android Studio bundles a JRE at `C:\Program Files\Android\Android Studio\jbr\bin\java.exe` — prepend that to PATH before running the emulator.
2. `npx firebase emulators:start --only firestore,auth` — starts Auth on `127.0.0.1:9099`, Firestore on `127.0.0.1:8080`, UI on `127.0.0.1:4000`.
3. Seed test users with `firebase-admin` (already in `node_modules`) pointed at the emulator via `FIRESTORE_EMULATOR_HOST`/`FIREBASE_AUTH_EMULATOR_HOST` env vars — Admin SDK bypasses security rules, so this is the only way to seed `users/{uid}` docs without a chicken-and-egg rules problem.
4. `assessment-app/services/firebase-config.js` now auto-connects to these emulators when `location.hostname` is `localhost`/`127.0.0.1` (added `connectAuthEmulator`/`connectFirestoreEmulator`, gated — never true on the real deployed site, so this is safe to leave in the codebase permanently).

**Bug found and fixed:** `firestore.rules` had zero rules for the two new collections this feature introduced (`class_test_marks`, `term_analytics`). Firestore default-denies anything not explicitly matched, so **class-test saves and term-analytics writes were broken in production, not just in this sandbox** — this would have silently failed for real teachers too. Added matching `allow read: isAnyStaff() / allow write: isTeacherAny() || isAdmin()` rules (same pattern as `assessment_sessions`/`monthly_analytics`).

With the emulator + rules fix, re-ran the full pipeline for real (real Firebase Auth login as both teacher and admin, real Firestore reads/writes, no localStorage shortcuts):
- Teacher login → Class Test entry → Save → confirmed the document actually landed in Firestore (`class_test_marks/HY1_Class_I_MATH`, verified via a direct query).
- Admin login → Report Card Generator → "Generate for This Student" (SFS260101) → confirmed a real report card document was saved (`report_cards/SFS260101_HY1`), with subjects blended correctly: Mathematics `assessmentAverage: 4.29, classTestScore: 4.17, subjectAverage: 4.25` ("Prof"); all other subjects assessment-only, unchanged.
- This is now proven working end-to-end against real Firestore, not just synthetic/local computation.

**Still not covered:** the "Generate for Entire Class" batch path, and the `report-card-print.js` visible-grade check (confirmed earlier via directly-injected data, not from this real saved document — worth a quick re-check that the saved doc renders identically, though the shape is the same).

Worth a product confirmation with the school: blending can measurably move a subject's letter grade (not just nudge a decimal) — confirm 30% is the intended weight before this is used for real report cards.

**Emulator was stopped after this verification session** (not left running). To resume: prepend the Android Studio JRE to PATH, run `npx firebase emulators:start --only firestore,auth`, re-seed test users if needed (previous emulator data was in-memory only and is gone now that it stopped).

## Reusable infrastructure (unchanged, still true — see 2026-07-02 handoff for full detail)
- Firestore emulator via PowerShell (Java PATH issue) — command in prior handoff.
- Claude Preview MCP: `.claude/launch.json` → `site-root` on port 4601.
- Admin service-account scripts in `scripts/` for direct Firestore access — throwaway inspection scripts should be deleted after use, not left lying around.

## Next steps when resuming
1. Verify the new Class Test / 70-30 blended grading feature (`d5e5b7b`) against live Firestore data with a real teacher and admin login — this is unverified and changes report-card math for Class I/II.
2. Everything else from this handoff and 2026-07-02 is resolved — no other carryover items pending.
