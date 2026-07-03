# Session Handoff — 2026-07-03

Read this first when resuming work on `pro-leo-site`. Everything below is **deployed and live** at https://st-francis-school-a3e7e.web.app. Nothing from today is committed to git yet (see bottom).

## Deployed today

1. **Fixed recurring "teacher keeps disappearing" bug (SFSTEMPT01 / SFSTEMPT02).**
   Root cause: `SFS_TEACHER_DIRECTORY` in `app-logic.js` (~line 11500) is a hardcoded list the Admin → Manage Teachers → **Sync Directory** feature matches against by `staffId`. Two entries — Anando Pohtam and Daprikmen Massar — had `staffId: ""`. Any manually-added teacher doc that doesn't match an entry in this array is flagged as an "orphan" by Sync Directory and gets batch-deleted when an admin applies changes. Fixed by setting:
   - `staffId: "SFSTEMPT01"` for Anando Pohtam (`app-logic.js:11638`)
   - `staffId: "SFSTEMPT02"` for Daprikmen Massar (`app-logic.js:11637`)
   Both should now survive future syncs. **Not yet re-verified against live Firestore** — worth confirming both docs still exist and hold up after the next Sync Directory run.

2. **New admin feature: "All Marks" overview (Class III–X).**
   Read-only view under Admin → Academic → **All Marks**. Built in `app-logic.js` (~line 5870 onward) and `index.html` (~line 1849, sidebar button; ~line 2378, section + drill-down modal).
   - Summary grid: Class × (Half Yearly / Final Term) showing student count, subject count, % marks entered. Click a cell → `openMarksDrilldown(cls, term)`.
   - Level 2: per-subject entered/submitted counts for that class+term. Click "View" → `loadMarksSubjectStudents(cls, term, subject)`.
   - Level 3: every student's actual IA/UT/TE/Total for that subject (UT column only shown if any student in the class has a UT field — determined once per table, not per row, to avoid column misalignment).
   - No write path — view only, by design (user's choice, to keep mark-entry as single source of truth).
   - **Caveat:** built and verified for syntax/wiring/error-handling only. Could not verify against real Firestore data — this dev environment has no authenticated admin session (same limitation as prior sessions). Needs a real look with live data.

3. **Mobile UI fix: "Enter Marks" button no longer requires horizontal scroll.**
   On the Teacher Portal's subject-assignment table (`.tp-assign-table`, rendered by `renderTPAssignments` in `app-logic.js`), the Action column with the "Enter Marks →" button was pushed off-screen on mobile, requiring teachers to scroll left/right to find it.
   Root cause: existing mobile card-stacking CSS (`styles.css:3552`, `@media max-width:640px`) correctly turned `<tr>`/`<td>` into stacked label:value rows, but a **global** `table { min-width: 600px }` rule (`styles.css:1684`, intended for the desktop-style scrollable admin tables elsewhere in the app) still forced the `<table>` element itself to be 600px wide regardless — so the visually-stacked card still sat inside an invisibly-oversized table, and `.table-wrap`'s `overflow-x:auto` kept the scroll active.
   Fix: added `display: block; width: 100%; min-width: 0` scoped to `.tp-assign-table`/`tbody` inside the existing mobile media query (`styles.css:3552-3564`) — does not touch the global `table`/`.table-wrap` rules other (intentionally-scrollable) admin tables rely on.
   Verified numerically via Claude Preview (injected the real markup, confirmed `wrap.scrollWidth === wrap.clientWidth === 375` and the button's bounding rect sits fully inside a 375px viewport). Not yet confirmed on a real phone.

## Still open / not done
1. **Real-device / real-data confirmation** for all three items above — everything today was verified via code inspection, syntax checks, and browser-preview simulation with injected/no data, not against the live app with a real logged-in teacher or admin session.
2. **Carried over from 2026-07-02** (still unresolved, see that handoff for full detail):
   - Real-device APK offline confirmation — never done.
   - SFST002 / SFST005 contradictory `classTeacher` vs `classTeacherOf` fields — untouched.
3. **Uncommitted work.** As of this handoff, `app-logic.js`, `index.html`, `styles.css`, `sw.js` are modified in the working tree and deployed live, but not committed to git. (Yesterday's 2026-07-02 batch — offline hardening, marksheet fix, etc. — *was* committed as `05b7515`.) Run `git status -s` and commit before it piles up further.

## Known deferred items carried over (deliberate decisions, not bugs — don't "fix" without asking)
1. CT co-scholastic override not locked down — a class teacher can still edit/override a co-scholastic grade a subject teacher already entered.
2. Split-subject submit-completeness is fuzzy — CT dashboard's "X of Y submitted" counts a shared subject as done once EITHER teacher submits, not both.

## Reusable infrastructure (unchanged, still true — see 2026-07-02 handoff for full detail)
- Firestore emulator via PowerShell (Java PATH issue) — command in prior handoff.
- Claude Preview MCP: `.claude/launch.json` → `site-root` on port 4601. Used today to verify the CSS overflow fix numerically (scrollWidth/clientWidth/bounding rects) since no real login is available in this workspace.
- Admin service-account scripts in `scripts/` for direct Firestore access — throwaway inspection scripts should be deleted after use, not left lying around.

## Next steps when resuming
1. Confirm SFSTEMPT01/02 survive a real Sync Directory run in the live admin panel.
2. Log in as admin and actually look at the new "All Marks" view with real data — check the numbers make sense, check the drill-down renders correctly for both `standard` (III–VIII) and `senior` (IX–X) mark schemes.
3. Check the mobile "Enter Marks" fix on a real phone or real narrow browser session (not just injected-markup simulation).
4. Commit today's changes (`app-logic.js`, `index.html`, `styles.css`, `sw.js`) once verified.
5. Everything carried over from 2026-07-02's "Next steps" is still pending.
