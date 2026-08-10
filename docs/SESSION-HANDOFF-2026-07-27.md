# Session Handoff — 2026-07-27

**Written 2026-07-27, ~12:30 IST.** This replaces the entire prior chain of dated handoff docs (2026-07-02 through 2026-07-17), which were cleared out at the user's request as outdated. This is now the single canonical status document — read this first, and only reach further back into git history/commit messages if something below is unclear.

**`main` is at `b48d1dc`, pushed to `origin`, deployed live** to both `https://st-francis-school-a3e7e.web.app` and the custom domain `https://sfslaitkor.in`.

---

## Current live status (verified today, not assumed)

- **Report cards: ALL of Class III–X are released.** 409 students total across those 8 classes, confirmed via a live data pull today (III:63, IV:63, V:59, VI:48, VII:50, VIII:44, IX:44, X:38 — all fully released). This resolves what earlier handoffs listed as an open item ("release Class III, IX, X").
- **SKG/LKG/Class I/Class II: 0 report cards released.** Confirmed live today. These classes' report cards are simply not ready yet (separate pre-primary template/pipeline).
- **Parent report-card lookup** (`sfslaitkor.in/report-card-lookup/`):
  - **Class III–X lookup is now CLOSED** for this term (done today, at user's request) — returns *"Report card lookup for Class III–X has been closed for this term. Please contact the school office."*
  - **SKG/LKG/Class I/Class II lookup remains OPEN** — will correctly return "not released yet" until those cards exist.
  - This is a new, permanent **per-system** switch (`settings/report_card_lookup.marksLookupEnabled`), independent of the original global `enabled` switch — see mechanism note below.
- **View tracking is live and working** — every successful lookup stamps `viewCount`/`firstViewedAt`/`lastViewedAt` on the student's own record (no IP, device, or viewer identity stored — see privacy ruling below). As of today's pull: 382 of 409 released cards viewed (93%); 27 not yet viewed, full named list in the PDF below.

## Deliverables sitting in `docs/` (untracked — see repo hygiene note)

- **`docs/Report-Card-View-Tracker-HalfYearly-2026-27.pdf`** — built today. Per-class breakdown of released/viewed/not-viewed, with named+roll-number lists of students who haven't viewed their card yet.
- **`docs/Performance-Analytics-Report-HalfYearly-2026-27.pdf`** — methodology + Half-Yearly data snapshot, built a few days ago.
- **`docs/Parent-Guide-Report-Card-Lookup.pdf`** — one-page parent handout, uses the short `sfslaitkor.in/report-card-lookup/` link, deliberately uses a **fictional** example (Class V/Roll 12/DOB 15.03.2015) so it can't be mistaken for a real child's working lookup credentials. Ready to distribute for Class III–X families who haven't viewed yet (list is in the View Tracker PDF) — though note lookup for those classes is now closed, so re-open the switch before/while distributing if that's still the intent.
- **`docs/Missing-DOB-Class-3-to-10.xlsx`** — historical worklist, DOB backfill is done (0 missing as of the 07-17 work).

## Mechanism note: how production Firestore gets written

**Corrected 2026-08-10. The previous version of this note was wrong and cost effort — read this one.**

Production Firestore **can** be written directly from the repo. `pro-leo-site/serviceAccountKey.json` is a valid service-account credential for `st-francis-school-a3e7e`, and the whole of `scripts/*` already uses it:

```js
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
```

That is the route. Write a script in `scripts/`, run it read-only first, then apply. Established conventions worth keeping: dry-run by default with an explicit `--apply` flag, a printed summary of exactly what will change before it changes, and a rollback backup of prior state written to `scripts/backups/`. See `scripts/open-final-term-3-10.js` for the pattern.

**What the old note claimed, and why it was wrong.** It stated there was "no way for Claude to write directly to production Firestore" — no browser admin login (true, and still true: credentials are never entered, even if offered directly) and no local Application Default Credentials for `firebase-admin` (misleading — bare ADC does fail, but the service-account key file sitting in the repo root works, and no one tested it). From that it prescribed a **temporary secret-token-gated `onRequest` Cloud Function**: deploy it, `curl` it once, then delete it from source and production. That was used twice (global kill switch on 07-17; `marksLookupEnabled: false` on 07-27) and was clean both times — but it was never necessary. Do not reach for it again; a Cloud Function deploy to change one field is far more risk and moving parts than a local script.

**Standing caution:** `serviceAccountKey.json` is a live production credential sitting in the working tree, granting full admin access to the project. Its containment was verified 2026-08-10 and is currently sound on all three fronts:

- **Not in git** — ignored at `.gitignore:7`, never tracked, absent from all history (`git log --all` on the path returns nothing).
- **Not served** — listed in `firebase.json` → `hosting.ignore`. Requesting `/serviceAccountKey.json` on either domain returns `200` but that is the SPA rewrite serving `index.html` (`content-type: text/html`), not the key.
- **Never quoted** — its contents must not be pasted into docs, commit messages, logs, or chat.

Re-check the first two if `.gitignore` or the hosting `ignore` list is ever edited. Treat any script that loads it as a production write even in dry-run.

## ⚖️ Standing decision — do not silently re-add

A past request to **track parent IP addresses / device fingerprints** on report-card views ("for statistics") was **declined** on privacy/DPDP-Act grounds (children's data, no consent mechanism on the lookup page, unreliable anyway since families share devices). The privacy-preserving alternative that was built instead (view **count** only, no viewer identity, per the mechanism above) was accepted and is what's live today. **If more detailed analytics are ever requested again, the privacy concerns need to be re-raised, not silently bypassed** — this isn't a limitation to route around later.

---

## ⚠️ OPEN ITEMS

1. ~~**Class marksheet (`marksheet.js`) Term-2 zero-marks display — never verified.**~~ **CLOSED 2026-08-10.** The bug was real. It fired only on a *Final Term* marksheet generated before Term 2 was assessed (an HY marksheet reads `data.halfYearly` and was never affected — which is why nobody hit it). Both builders write `ia: ftA.IA ?? 0`, so the IA/UT/TE cells held a numeric `0`, not `undefined`, and the `!== undefined ? … : '—'` guards never caught them: the sheet printed `0` in every component cell, `0` grand total, `0.0%`, a row of `0.0` class averages, and — worst — a green **PASS** off an empty term, because `consolidated.result` correctly stays PASS while FT is unstarted. Only the Remarks table had ever been fixed (it already had the `ftNotAssessed` check). Fixed by adding the same `ftEmpty` guard `render.js` uses to `buildRows()` and `buildAverageRow()`; the class-average row now reads "Class Average — Term 2 not yet assessed". Verified in-browser across three cases: FT-empty (3 of 55 cells filled, zero `0`s, zero PASS badges), HY (55/55, unchanged), FT-with-marks (55/55, unchanged). Deployed.
2. **Class-teacher mark-correction feature** (built ~07-16, lets a class teacher fix a subject teacher's mark from the Student Form screen) — no record in any handoff of this ever being smoke-tested with a real class-teacher login. Worth confirming it actually works in practice if it's being relied on.
3. **Pre-primary (SKG/LKG/I/II) report-card template** — separate from the Class III–X renderer, never touched by any of the styling/Term-2/logo/seal fixes made to the main template. May need the same treatment once those cards are ready to release.
4. **Lookup rate limit** — 10 lookups/day per IP (`LOOKUP_DAILY_CAP` in `functions/index.js`). Fine for the current closed-for-III-X state; worth raising if SKG/LKG/I/II distribution on a shared school/village network triggers complaints later.
5. **Global kill switch** (`settings/report_card_lookup.enabled`) is still `true` (public) — separate from today's new per-class switch. Decide when to flip this off entirely, e.g. once SKG/LKG/I/II's window also closes.
6. **Repo hygiene, still unresolved across every prior handoff**: a large pile of untracked files in the working tree — deleted `RP/*.pdf`, `session-summary-2026-06-02.md`, `STAFF-ATTENDANCE-APK-TODO.md` (all show as uncommitted deletions), modified `assessment-app/components/session-review.js`, `package*.json`, `.claude/settings.local.json`, plus untracked docs (`class1_maths_grading_example.pdf`, xlsx/png assets, `expense-voucher/`, `scripts/compare-lock-classes.js`). None of this is new — it's been sitting untouched for weeks. Worth a deliberate decision (commit, delete, or `.gitignore`) rather than continuing to carry it forward silently.
7. **Should the parent guide PDF and analytics PDFs be committed to git?** They're currently untracked, same as this handoff doc. Low stakes either way, but worth a decision now that the handoff-doc pile itself has just been cleaned up.
