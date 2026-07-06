# Session Handoff — 2026-07-06

Read this first when resuming. **Nothing from today is committed or deployed** — all work is sitting uncommitted in the working tree on the F: drive, deliberately held at the user's request. Two separate bodies of work are intermingled in the diff; details below so you can commit/deploy them together or separately later.

---

## STATUS: uncommitted, undeployed, but fully built + tested

Do NOT assume anything is live. Production is still running the OLD code for everything below. When resuming, the two decisions to make are: (1) commit, and (2) `firebase deploy` (functions + firestore:rules + hosting).

---

## Work item 1 — Pass/fail rule fixes (Class 9/10, and Class 3–8 aggregate)

### What changed and why
The pass/fail logic had bugs and a missing rule. Fixed across the standalone `Sfs-report-card` tool AND the real Firestore-backed `markentry.js` (the one teachers actually use, linked from the main app).

- **Class 9 & 10 (senior scheme) — NEW RULE:** a subject now fails if its combined total clears the passmark (30) but **IA < 6 OR Theory < 24** individually. Getting 30 by combination is no longer a pass if either component is below its floor. Floors are derived proportionally from `passmark` (20×30% = 6 IA, 80×30% = 24 Theory), so they auto-adjust if passmark ever changes. For aggregate subjects (Science P+C+B, S.Science, English I+II) the floor is checked against the **average** IA and average Theory of the components, per the user's explicit decision ("final average for aggregate subjects").
- **All classes (3–10) — aggregate subjects now AVERAGE their components, not SUM.** `config.js` already declared `aggregateMethod: "average"` for every class's aggregates, and `grandTotalMax` was sized for averaging — but several code paths were summing. This was a real pre-existing bug. Passmark: 40 for Classes 3–8, 30 for Classes 9–10.
- **`markentry.js` had ~5 duplicated pass/fail spots that each handled aggregates differently** (some summed, some read a Firestore key that never exists → silently 0, some excluded aggregates from the pass check entirely). All unified onto one shared `computeAggregateSubject()` helper + `subjectFailsFloor()` helper. Also fixed: `renderStudentList` used `cfg.passMarkPerSubject` (nonexistent field → always defaulted to 33) and `renderAcademicSummary` hardcoded `<40`.

### IMPORTANT scope note (the user corrected me twice on this)
The IA/Theory floor rule is **senior-scheme only** (Class 9/10) — `subjectFailsFloor()` gates on `markScheme === 'senior'`. Do NOT extend it to other classes without an explicit request. The user was clear: touch exactly the classes named, ask before widening. (See also the [[scope-adherence-strict]] memory.)

### Files (work item 1)
- `Sfs-report-card/config.js` — added shared helpers `computeAggregateSubject`, `getComponentFloors`, `subjectFailsFloor`
- `Sfs-report-card/form.js` — floor check in `updateResult` + `collectFormData`; aggregate ia/exam storage fix; dynamic rank-eligibility note (`updateRankEligibilityNote`)
- `Sfs-report-card/index.html` — rank-eligibility note given `id="rankEligibilityNote"` (was hardcoded stale "40+ in each")
- `Sfs-report-card/markentry.js` — the big one; all ~5 pass/fail sites unified + floor rule
- `Sfs-report-card/marksheet.js` + `render.js` — cosmetic fail-highlighting matched to real logic
- `Sfs-report-card/reportcard.html` — inline `sfds_adminRC` converter fixed (same aggregate/floor bugs); this is the renderer the lookup feature below depends on

### Verified
Live via Claude Preview against `markentry.html` and the standalone form: Class 8 S.Science averages correctly (120→40), Class 9 floor rule FAIL/PASS correct, rank note updates per class. See in-session testing.

---

## Work item 2 — Parent report-card lookup (NEW feature, SKG→Class 10)

### What / why
Login-free page for a parent to pull their child's *released* Half-Yearly report card by **Class + Roll No + DOB**. Extends the Class-I/II-only design from `SESSION-HANDOFF-2026-07-04.md` to **SKG, LKG, Class 1–2, and Class 3–10** (Play Group excluded — no digital report card). Public path on the existing hosting site (chosen over a separate hosting site for simplicity).

Handles the two report-card systems:
- **SKG/LKG/1/2** → `report_cards` collection, `status === 'released'`, rendered via `buildPrintableHTML()` in an iframe.
- **Class 3–10** → `marks/{classId}_FT|HY`, `releasedToStudent === true` on FT doc, rendered via `Sfs-report-card/reportcard.html` sessionStorage bridge.

### Files (work item 2)
- `functions/index.js` — NEW `lookupReportCard` onCall (asia-south1). Public (no auth). Kill-switch → rate-limit (10/day/IP via `lookup_attempts`) → student match (Admin SDK) → branch by system. Returns only render data, not raw student PII.
- `firestore.rules` — added `match /lookup_attempts/{docId} { allow read, write: if false; }` (function-only). `settings/report_card_lookup` already covered by generic `/settings/{docId}` rule.
- `report-card-lookup/` — NEW folder: `index.html` (form), `app.js` (calls function, renders both branches), `report-card-print.js` (copied, self-contained).
- `firebase.json` — added `functions: { port: 5001 }` to emulators (for local functions testing).

### Bugs found & fixed during build
- window.open() popup blocked on mobile → switched to in-page render (iframe for pre-primary, same-tab nav for III–X).
- Top-level `await import(firebase)` blocked the submit handler from binding → a fast click fell through to a broken native form submit. Fixed: button disabled synchronously until Firebase is ready.

### Verified (local emulator: Firestore+Auth+Functions)
Class 9 match→PASS (grand total 450/600 confirms averaging), Class 2 match→iframe render, wrong DOB→rejected, not-released→rejected, kill-switch off→rejected, 11th/day→429 rate-limited. All throwaway `_tmp-*.mjs` seed/toggle scripts deleted.

### DEPLOY CHECKLIST for this feature (when resuming)
1. `firebase deploy --only functions,firestore:rules,hosting`
2. **Create the production kill-switch doc** `settings/report_card_lookup` = `{ enabled: true, term: "half_yearly" }` (function reads it; without it, lookups return "not currently available"). `term` maps to HY1 (pre-primary) / HY (III–X) inside the function.
3. Give parents the URL: `<site>/report-card-lookup/`. Flip `enabled: false` after the release window.

### Data caveat to raise with user
DOB coverage (production `students`, checked 2026-07-06): SKG 44/48, LKG 74/75, Class 1 58/59, Class 2 54/55, Classes 3–9 ~95–100%, **Class 10 only 30/38 (79%)**. The 8 Class-10 students missing DOB cannot use the lookup — office should fill those before relying on it for Class 10.

---

## Reusable infra (unchanged, still true)
- **Emulator** (Java not on PATH): `export PATH="/f/APK/jdk/bin:$PATH"` then `npx firebase emulators:start --only firestore,auth,functions`. (Note: JDK is at `F:\APK\jdk`, NOT Android Studio's jbr — that path in the 07-04 handoff was wrong on this machine.) Ports: Firestore 8080, Auth 9099, Functions 5001, UI 4000.
- **Seed the emulator** with `firebase-admin` + `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`. Admin SDK bypasses rules. Delete throwaway scripts after use.
- `report-card-lookup/app.js` auto-connects to the functions emulator on localhost/127.0.0.1 (safe: prod uses real endpoint).
- **Don't query production student PII to the transcript** — the auto-mode classifier blocks it (correctly). Aggregate counts only.

## Pre-existing loose ends (NOT caused by today — still unresolved from 07-04)
- 4 files show deleted in working tree (`RP/ReportCard_01/25_*.pdf`, `STAFF-ATTENDANCE-APK-TODO.md`, `session-summary-2026-06-02.md`) — were already missing before today. Ask user if intentional.
- Untracked `docs/` extras (xlsx + 2 upscaled PNGs) — harmless, `docs/` is hosting-ignored.
- `.claude/settings.local.json`, `.firebase/hosting..cache`, `sw.js` cache constant — local/non-deploy churn.
