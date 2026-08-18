# Session Handoff — 2026-08-18 — "LKG/SKG Curriculum, Attendance Wiring & Parent Lookup Fixes"

Started as a small LKG curriculum change (no class test, one renamed co-scholastic
subject) and ended up uncovering three separate silent-failure bugs, the last of
which had been blocking **every** pre-primary parent lookup since 2026-08-06.

All work below is **committed, pushed and deployed** (hosting, plus one
`functions:lookupReportCard` deploy). Nothing is half-applied.

---

## Commits from this session

| Commit | What |
|---|---|
| `844fd23d` | **LKG has no class test**; co-scholastic Science → General Awareness (LKG only) |
| `dcd5e4c2` | **`no-cache` headers for `assessment-app/data/*.json`** — the reason a deployed config change appeared not to work |
| `303342fa` | **LKG/SKG co-scholastic D/E/NA grade scale**; report card signs "Headmistress" not "Principal" |
| `ad3ade8e` | **Expandable per-criterion detail** under category rows (screen only, print unaffected) |
| `16bebda4` | LKG–II attendance switched to manual entry (superseded same session — see §5) |
| `f16c7dc9` | **Attendance now read from the Class Attendance grid** (`marks/{classId}_{HY\|FT}`) |
| `9570eb05` | **SKG/LKG class teachers had an empty student list** — blocked attendance entry entirely |
| `ae2a7ebd` | **Parent lookup never matched pre-primary cards** + Class III-X keyed marks by the wrong id |
| `3a091753`, `bce9a9e8`, `50b03c78`, `2f6b8d2e`, `d6ecb69f`, `6058195c`, `b93ea241` | Service-worker cache bumps, one per hosting deploy |

`ae2a7ebd` is the only Cloud Functions deploy; everything else is hosting-only.

---

## 1. LKG curriculum changes

**Class test — nil for LKG.** LKG is removed from `class-test-config.json`'s
`classes` list: no class tests are conducted for LKG (direct Half-Yearly exam
only). LKG no longer appears in the Class Test Entry dropdown at all, and
`gradeSubject()` grades LKG from assessment criteria alone via its existing
`classTest = null` default. **SKG still blends** 70/30 exactly as Class I/II do.

**Co-scholastic — General Awareness replaces Science, LKG only.** `science` is
now scoped to `["SKG"]`; a new `general_awareness` key covers `["LKG"]`. Its own
key, not a relabelled `science`, so a grade entered under one is never read as
the other.

Verified against live Firestore before changing: **zero** LKG class-test docs and
**zero** LKG `science` grades existed, so nothing needed migrating.

Also fixed `scripts/diagnose-assessment-gaps.js`, which unconditionally reported
"class test MISSING" for every class/subject — it now gates on
`class-test-config.json`, so LKG won't false-positive forever.

---

## 2. The `.json` caching trap (worth remembering)

After deploying §1 the user still saw "Science" on screen after five hard
refreshes. The deploy was fine — `firebase.json` had explicit `no-cache` rules
for `.js`/`.css`/`.html` but **nothing for `.json`**, so Firebase Hosting's
default `max-age=3600` applied to every file in `assessment-app/data/`.

A hard refresh does not reliably fix this: these configs are loaded by `fetch()`
lazily on tab switch, not as part of the initial page load, so the cached
response survives a reload. Fixed by adding a `no-cache, must-revalidate` rule
for `assessment-app/data/**/*.json`.

**Lesson:** a config change that "didn't deploy" is worth checking with
`curl -I` before re-editing anything. The file was correct at origin the whole
time.

---

## 3. LKG/SKG co-scholastic grade scale (D/E/NA)

Kindergarten co-scholastic now uses the school's percentage-band scale:

```
O 90-100% · A+ 80-89% · A 70-79% · B+ 60-69% · B 50-59%
C 40-49%  · D 30-39%  · E <30%   · NA Not available
```

Class I/II keep the original 6-value word scale, unchanged. Implemented as
**additive** `gradeScaleByClass` / `gradeLabelsByClass` overrides in
`coscholastic.json` — the base scale still exists, and O/A+/A/B+/B/C mean the
same letters in both, so **nothing already saved is invalidated**. Service
gained class-aware `getCoScholasticGradeScale()` / `getCoScholasticGradeLabels()`.

The grade-button grid changed from a fixed 6 columns to `auto-fill` so 9 buttons
wrap cleanly instead of leaving a lopsided row.

Also corrected the report card signature line from **"Principal" → "Headmistress"**
across `report-card-print.js`, its `report-card-lookup/` fork, and the two
dev-only demo HTML templates. Deliberately **not** changed: the homepage's
"Principal's Message" page and the attendance-report PDF — those reference a real
named staff member and a different document.

---

## 4. Expandable criteria detail on the report card

Parents saw only the 2-category rollup (e.g. Arts/Colouring → Work Habits,
Learning) with no way to see the 14 criteria behind it. The full per-criterion
data was **already being sent to the browser** on every lookup —
`buildTableRows()` averaged it into the category row and threw the rest away.

Category rows are now clickable and expand in place. **No new fetch, no new
Cloud Function call, no new Firestore read, no new rules surface** — same data
already in the response, just rendered instead of discarded. Collapsed by
default, so nothing changes for a parent who doesn't click.

**Print is unaffected**: `.crit-row` is forced hidden under `@media print`
regardless of on-screen expand state, so the printed/PDF card stays the same
14×8.5in layout with the same rollup. Verified by actually clicking expand and
collapse in a rendered card, not just by reading the code.

---

## 5. Attendance — two wrong turns before the right answer

This took three iterations and the intermediate states are worth recording so
nobody re-treads them.

**Attempt 1 (what existed):** `report-card-attendance.js` auto-pulled from
`attendance_monthly` snapshots. Checked production: **0/4 months present for all
of LKG, SKG, Class I and Class II** — nobody has ever run the monthly snapshot
generator for these classes. Only Class VII–X have any, and those are partial.

**Attempt 2 (`16bebda4`, superseded):** switched to manual typed entry, matching
what Class III-X does on its mark-entry form. Reasonable, but wrong — it assumed
no automated source existed.

**Attempt 3 (`f16c7dc9`, correct):** the user pointed at the **Class Attendance**
button in `Sfs-report-card/markentry.html`. That bulk grid was already populated:
**Class I 59/59 students, Class II 55/55**, written to
`marks/{classId}_{HY|FT}/students/{id}.attendance` as
`{hyPresent, hyTotal, ftPresent, ftTotal}`.

**Why the first check missed it:** `marks/` keys classes by **Roman numeral**
(`I_HY`, `II_HY`) — a check against `1_HY`/`2_HY` returns empty and looks
exactly like "no data exists". `CLASS_TO_MARKS_ID` is a lookup table rather than
a derived string specifically to stop that recurring.

Mapping: **HY1 → `hyPresent`/`hyTotal`, HY2 → `ftPresent`/`ftTotal`**. A zero
working-days total reads as "not entered for this term" rather than "zero days",
because the grid writes all four keys at once and leaves the other term's pair
at 0.

The manual inputs from attempt 2 were **kept as an explicit per-student
override** (relabelled to say so) — an explicitly passed value still wins, so the
admin panel's "Edit Attendance" can correct a card without the grid overwriting
it on regeneration.

Verified live before shipping: `SFS260101 HY1 → 86/95`, `SFS260102 HY1 → 83/95`,
`SFS260160 HY1 → 86/95`, HY2 correctly blank.

---

## 6. SKG/LKG class teachers had an empty student list

The SKG class teacher couldn't enter attendance at all — the Class Attendance
grid refuses to open without a loaded roster (`'Open the class student list
first.'`), and the roster was empty.

**Cause:** the `students` collection stores `class` as an arabic numeral for
numbered classes (`"1"`..`"10"`) but as a plain label for kindergarten (`"SKG"`,
`"LKG"`, `"PLG"`). The roster query built its filter as
`String(classNumFromId(classId))`, and `classNumFromId("SKG")` returns `null` —
so the query literally searched for **`class == "null"`** and matched nobody.
Numbered classes were unaffected, which is why it went unnoticed.

Added `classStrFromId()` and used it at the three student-query sites (subject
grid, rank recompute, lock-all). Verified against production:

```
SKG  0 → 48 students     I    59 → 59 (unchanged)
LKG  0 → 75 students     II   55 → 55 (unchanged)
                         III  63 → 63 (unchanged)
                         X    38 → 38 (unchanged)
```

`calcStudentTotal()` and `studentFailsTerm()` already guard on a missing
`CONFIG[classNum]`, so kindergarten renders an empty-marks roster without
crashing — sufficient for attendance entry, which is all this needed to unblock.

---

## 7. Parent lookup was structurally broken for all 237 pre-primary students

Found while investigating a duplicate student id. **This is the most severe find
of the session.**

`lookupReportCard` rebuilt the `report_cards` document id as
`${studentId}_${term}` → `SFS260101_HY1`. But `report-card-builder.js` has
written `${studentId}_${academicYear}_${term}` → `SFS260101_2026-27_HY1` since
**2026-08-06** (`918ed20e`, "report card year collision"). The function was
written 2026-07-27 and never followed.

**They could never match.** Every SKG/LKG/Class I/II lookup threw "No released
report card found for this student yet" regardless of what had been released.
This is why the previous handoff's note that the success path "has never been
exercised" was true — it *could not* succeed.

**Fix: query by `studentId`, filter term/status in code.** Deliberately *not*
just adding `academicYear` to the string — that value would come from the server
clock at **lookup** time, which stops matching the year baked in at
**generation** time the moment the year rolls over. It would have worked today
and silently broken again next April. One equality filter, so the automatic
single-field index covers it; sorts newest `academicYear` first for returning
students.

**Second bug in the same function:** Class III-X read marks by `studentId`, but
mark docs are keyed by the student's Firestore **document id** (what
`markentry.js` writes under). Normally identical — but not for the two records
created with an auto-generated id. Class X roll 38's card sat `releasedToStudent:
true` while the lookup told the family it didn't exist. Now tries the document id
first, falls back to `studentId`.

Verified against production before deploying:

```
Class X roll 38 (mismatched id)   OLD: not found → FAILS   NEW: found, released → OK
Class X roll 1  (control)         OLD: OK                  NEW: OK (unchanged)
Class I roll 1  (pre-primary)     OLD: id never existed    NEW: card reached
```

The Class I case now correctly refuses because the card is `status: draft` — a
real business rule — rather than because the id was unbuildable.

### Functions deploy gotcha

First attempt failed with `Cannot determine backend specification. Timeout after
10000`. **Not a code problem** — `functions/index.js` loads in 500ms locally; the
CLI's discovery step is just slow on this machine. Use:

```bash
FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase deploy --only functions
```

---

## 8. Duplicate student id — investigated, left alone per instruction

```
SFS260623  ADRIAN OMEBAKHRAW WARBAH     LKG roll 1      DOB 2022-10-23  docId=SFS260623             ← canonical
SFS260623  SHANBORLANG LYNGDOH NONGBRI  Class X roll 38 DOB 2010-03-09  docId=BbLJKxgGBaGIa8I7dBVc  ← collides
```

Exactly **1 duplicate across all 647 students** (646 distinct ids). Scanned
`users`, `fee_transactions`, `fees`, `student_progress`, `sibling_links`,
`messages` — **zero** references to `SFS260623`, and no login account exists for
it. No active data collision or privacy leak today.

It is a **latent** landmine: it becomes real the moment Adrian gets a report card
*and* something keys Class X lookups off `studentId`. The §7 fix sidesteps it by
preferring the document id.

**Left as-is at the user's explicit instruction.** Assigning SHANBORLANG a
correct unique id is a school-records decision, not one to guess at.

There is also a second record with a mismatched doc id — **SKG roll 48**
(`docId=7m5G7RwwfRtm6k41y77y`, `studentId=SFS270101`). `report-card-attendance.js`
resolves the real document id before giving up, specifically so that student's
attendance doesn't silently vanish from their card once SKG attendance is entered.

---

## 9. Outstanding

**SKG and LKG attendance has not been entered yet.** Their Class Attendance grids
are now reachable (§6) but empty. Until a teacher fills them in, SKG/LKG report
cards will show blank attendance — correctly, not as a bug.

**Final Term attendance is not entered for any class.** Only `hyPresent`/`hyTotal`
are populated; HY2 cards will show blank attendance until the FT grid is filled.

**No report card has ever been released.** `report_cards` holds exactly one doc
(`SFS260101_2026-27_HY1`, Class I roll 1, `status: draft`) — regenerated by the
user for testing after an earlier test doc was deleted. **The first real release
will be the first genuine end-to-end test of the §7 fix**, the §4 expand feature
against real data, and the parent-facing success path generally. All three were
verified as far as is possible without releasing real data.

**`marksLookupEnabled: false`** in `settings/report_card_lookup` — Class III-X
parent lookup is currently closed for the term. The §7 Class III-X fix therefore
cannot be exercised live until that is flipped.

**The lock cascade's rules-enforcement path is still unverified** — carried over
unchanged from the previous two handoffs. Needs a real admin locking a real
class+term while a teacher's session is open.

**Everything else from the previous handoff's Outstanding section is unchanged** —
the "mini admin" test account gap, `'Class 9'` dead dropdown entry, Class I
Maths/English II coverage gaps, and the `isMonthlyUpdateAllowed`/`tryingToUnlock`
rules bug all still stand.

---

## Lesson repeated — a fourth time

Previous handoffs recorded: *"a harness or a screen is only evidence once you've
checked the harness itself is right, and reading code is not the same as running
it."* This session added a sharper corollary:

**An empty query result is not evidence of absent data.** It happened twice:

- `marks/1_HY` returned nothing, so attendance "didn't exist" — the collection
  keys by Roman numeral, and Class I/II were **fully populated** the whole time
  (§5). The user corrected this from memory.
- `class == "null"` returned nothing, so SKG "had no students" — 48 were there
  all along (§6). This one was in *production code*, silently blocking teachers.

Both look identical to a genuine empty collection. The habit that catches them is
listing what *is* there (`listDocuments()`, group-by-field counts) before
concluding something is missing — which is exactly how §6 and §7 were eventually
found.

And §7 restates the older lesson exactly: **when two places construct the same
identifier, they will drift.** `report-card-builder.js` changed its id format and
nothing failed loudly — the lookup just returned "no card found" forever. The fix
was to stop reconstructing the id at all rather than to re-sync the format.

---

## Useful paths

- `assessment-app/data/coscholastic.json` — co-scholastic registry; `gradeScaleByClass`
  overrides for LKG/SKG
- `assessment-app/data/class-test-config.json` — which classes have a class test (LKG excluded)
- `assessment-app/services/report-card-attendance.js` — reads the Class Attendance grid;
  `CLASS_TO_MARKS_ID` maps display name → Roman-numeral marks id
- `Sfs-report-card/markentry.js` — `classStrFromId()` (§6), `openClassAttendance()` /
  `saveClassAttendance()` (the grid that feeds attendance)
- `report-card-print.js` — shared print engine, single source of truth
  (re-synced into `report-card-lookup/` this session; confirm with
  `diff report-card-print.js report-card-lookup/report-card-print.js`)
- `functions/index.js` — `lookupReportCard` (§7)
- Firestore admin: `serviceAccountKey.json` at repo root (gitignored, present on this
  dev machine — used for all read-only diagnostics this session)
