# Session Handoff — 2026-08-19 — "Silent Failures & the Attendance Import"

> **Read this one differently.** The previous handoffs record features built.
> This session was mostly about things that were **already broken and showing no
> error at all** — a lookup that could never match, a panel that vanished, a
> panel that printed the same sentence for every child, a term window that
> discarded a month of finished work. Four separate defects, none of which threw,
> logged, or failed visibly. One of them I introduced myself, mid-session.
>
> Continues from `SESSION-HANDOFF-2026-08-18-LKG-SKG-AND-LOOKUP-FIXES.md`.
> Everything below is **committed, pushed and deployed**.

---

## Commits (all after `6eefcf7b`)

| Commit | What |
|---|---|
| `e85c58efb` | **Delete button** for draft report cards (guarded: drafts only) |
| `361805b7f` | **Fix: a broken string literal I shipped killed the entire SKG–Class II panel** |
| `5bed357e9` | **Hide LKG/SKG/PLG** from the Class III–X pipeline table |
| `3f56854ed` | **Fix: "Needs Attention" showed the same criterion on every card** |
| `e17bdd023` | **Fix: HY1 window now opens 1 February** — SKG had 0 counted sessions |
| `59f499a78` | **Attendance Range Report** — totals days present over any span of months |
| `be3d1b9f9` | **Co-scholastic grade key spelled out** on the card — letters alone meant nothing |
| `5b7aa51d6` | **LKG/SKG key switched to words**, percentages kept for the teacher |
| `fdce215e5` | **Students who leave are flagged, not deleted** (`student-status.js`) |
| `551409645`, `7e0ab5593`, `452d46e98`, `af2ea0dc7`, `0a4f5a9fd`, `ac6b59272`, `3d3d06381`, `929f500a5`, `033c276bb` | Service-worker cache bumps, one per deploy |

Hosting-only. No Cloud Functions or rules deploys this session.

---

## ⚠️ Production DATA written this session (not in git)

This is the part a future reader will not find by reading code. Real student
records were written directly, via the Admin SDK, from `attendance_daily`:

| Target | Records | Content |
|---|---|---|
| `marks/LKG_HY/students/*` | 75 | `attendance.hyPresent`, `attendance.hyTotal = 84` |
| `marks/SKG_HY/students/*` | 48 | `attendance.hyPresent`, `attendance.hyTotal = 85` |

Both carry `lastUpdatedBy: 'admin-import:attendance_daily'` so the import is
identifiable and reversible. `HY2`/Final Term was deliberately left untouched.

**Period: 24 Feb 2026 → 30 Jun 2026** (the register's own first entry through
term end). Working days differ by one because SKG recorded 22 days in March and
LKG 21 — see §6.

Integrity was proven **before** writing, not after. For each class three
independent totals had to agree, and did:

```
LKG   sum(total - absent) per day = 5240
      sum per-student present     = 5240        ✓
SKG   sum(total - absent) per day = 3516
      sum per-student present     = 3516
      sum(stored present + late)  = 3516        ✓
```

Every absent-marked id existed in the roster, no duplicate dates, roster sizes
steady. Read back after writing: 75/75 and 48/48 exact.

### The `late` trap — LKG and SKG store it differently

This nearly produced silently wrong numbers:

- **LKG**: `present == total − absent`, and there are **zero** late entries.
- **SKG**: `present == total − absent − late` on **all 85 days**. Late pupils are
  counted as *neither* present nor absent in the stored figure.

So on SKG the school's rule ("late comers are present") genuinely changes the
result. **Roll 18, LIAM A KHARKONGOR, was late 60 times** — he reads 73/85 (86%)
under the rule, and would have read 13/85 (15%) from the stored count. The import
uses `present = workingDays − absent`, which is correct under both shapes.

### Students whose numbers are real but need a human decision

Written faithfully, because the register is the source of truth — but these look
like enrolment issues rather than poor attendance:

| Class | Roll | Student | Days |
|---|---|---|---|
| LKG | 71 | SAKANIMAIA KHARNARBI | 0 / 84 — never present |
| LKG | 21 | HASHUWAMEKI DKHAR | 1 / 84 — present once, 12 Mar |
| SKG | 5 | DAMANBHAKUPAR SUTING | 0 / 85 — never present |
| SKG | 48 | MEWANAIJINGKMEN MARBANIANG | 0 / 85 — never present |
| SKG | 20 | MERPURA SHEMIARI KHARKONGOR | 1 / 85 — present once, 28 Apr |

If these children never enrolled they should probably not carry a report card at
all. **Left as-is at the user's instruction.** No other student is a late joiner:
everyone else spans the full Feb→Jun range.

---

## 1. I broke production, and `node --check` told me it was fine

The most important entry here, because the failure mode will recur.

Adding the Delete button (`e85c58efb`), the `confirm()` message ended up with
**real newlines inside single-quoted string literals** instead of `\n` escapes —
a shell-escaping accident while patching the file through a heredoc. That is a
syntax error. Consequence:

```
report-card-admin.js fails to parse
   → its init module never executes
   → #rc-admin-root never populated
   → the ENTIRE SKG–Class II report card panel disappears
```

The "SKG – Class II" divider above it still rendered, so the page looked merely
empty rather than broken. The user found it by going looking for their cards.

**Why it shipped: `node --check` exits 0 on the broken file.** It is not a
reliable gate for this — the browser rejects what Node accepts. My own
verification script also lied, because I built its regex with
`new RegExp(BS + 'n')`, which matches a *newline*, not a backslash-n — so it
counted the very thing it was supposed to detect as proof of correctness.

**What actually diagnosed it:** `window.loadAdminReportCardsNew` was `undefined`
on the live page, and importing the module in the browser returned
`Invalid or unexpected token`. Numeric character codes settled it — 8 real
newlines, 0 escapes. Display output kept un-escaping strings and misled me
repeatedly; **char codes are the only trustworthy read.**

**The gate that works** (kept at `/tmp/esmcheck.js` during the session — worth
making permanent): strip `import`/`export` lines, then `new Function(src)`. It
reproduces the browser's exact error, and fails the broken commit while passing
the fix.

Fixed by rewriting the message as a **template literal**, where real newlines are
legal — so escaping cannot break it again.

---

## 2. Delete button for draft report cards

There was no way to remove a report card from the UI at all; the only route was
the Firebase Console.

**Draft-only by design.** `Revoke` already covers taking a released card back,
and deleting one there would strand a parent already pointed at it. A draft is
the only state that is pure work-in-progress. Confirms against the student's
name, and says plainly that the generated remark and any hand-entered attendance
go with it while the underlying marks do not.

Styled red rather than the revoke amber so it never reads as another reversible
state change. `firestore.rules` already gates `report_cards` writes on
`isAdmin()`, so this is enforced server-side, not merely hidden.

---

## 3. "Needs Attention" was the same sentence on every card

The panel read `improvementAreas[0]`, but `computeOverallPerformance()` built
that list by walking subjects in order and criteria in file order, pushing every
Beg/NY. `[0]` was therefore whichever flagged criterion is *listed* first — in
practice always English I's first criterion.

Proven on the real cards. Two students, different classes, different weakest
subjects, **identical output** — and the second contradicted its own card:

```
BANHOISHAPHRANG (Class I)   "Understand simple instructions in English I"
ADRIELSON (Class II)        "Understand simple instructions in English I"
                            ...while its own Weakest Subject read "Hindi"
```

Fixed in **two** places on purpose:

- `report-card-grade-engine.js` now sorts flagged criteria by score, so
  `improvementAreas[0]` is genuinely the weakest going forward (the remark engine
  reads the same list).
- `report-card-print.js` **recomputes** the lowest-scoring flagged criterion from
  the card's own stored criteria — so **already-generated cards render correctly
  without being regenerated**.

After: `"Understand simple instructions in English II"` and `"Show manners and
help others in Mathematics"` respectively.

Strongest/Weakest Subject were checked at the same time and are **correct** —
no change made.

---

## 4. HY1 now opens 1 February — SKG had zero counted sessions

Kindergarten assessment starts in February. The 2026-27 term exception opened HY1
on 1 March, and the aggregator requires a session to sit **fully** inside the
window, so February work was discarded silently.

```
                    counted sessions
Class      before  →  after
LKG            1       1
SKG            0       2      ← was ZERO
Class I       29      29
Class II      25      25
```

Two **already-reviewed** SKG sessions were being thrown away:

```
SKG  Literacy          2026-02-16 .. 2026-02-20   reviewed
SKG  Rhymes & Stories  2026-02-23 .. 2026-02-27   reviewed
```

Every SKG report card generated before this would have printed **no academic data
whatsoever** while the finished work sat in the app. Verified nothing is lost by
widening: no session that previously qualified now falls outside.

This also aligned the term with the attendance import (24 Feb – 30 Jun), which
had been sitting against a "1 Mar – 30 Jun" header.

---

## 5. Pipeline table no longer lists kindergarten

LKG/SKG/PLG rows in the Class III–X pipeline could only ever read "Not started" —
that table reads `marks/{class}_HY|FT`, which kindergarten never uses. Confirmed
against production: 0 mark documents for all three, while every other class has a
full roster. The rows read as outstanding work when they meant "not applicable",
and that is exactly what sent someone hunting for the SKG–Class II cards in the
wrong place.

Class I and II are **deliberately kept**: they hold real data there (59 and 55
students).

---

## 6. Attendance Range Report (new: `attendance-range.js`)

The admin screen could only report one month, so a term figure meant opening
each month and adding up by hand. New card in the Monthly Attendance section:
class + From/To months, presets for **this month / 3 / 6 / 12**, and PDF / Excel
/ Print exports. The headline figure is the **sum of days present**, not a
percentage: Present · Late · Absent · Working Days · **Total Days Present** · %,
with a CLASS TOTAL row in every export.

**Source is `attendance_daily`, deliberately — never `attendance_monthly`.**
Monthly snapshots are themselves *generated from* daily (see
`generateMonthlySnapshot`), so reading both would double-count. They are also
nearly empty: of the 7 that exist, **5 have `working_days = 0`** because they were
generated for months with no daily data, and LKG/SKG have none at all despite
holding 108 and 110 days of real records.

**Missing months are named** in the UI and in every export, so a gap is visible
instead of quietly dragging the total down. This matters most for Class 9, whose
teacher recorded February, stopped for three months, then resumed in June.

Built as its own module rather than extending `app-logic.js` (~14k lines).

Verified against the independently-computed import: LKG Feb–Jun = 84 days with
all 75 students matching, SKG = 85 days with all 48 matching.

### The trial year, in data

The register was a trial and take-up was partial — the numbers say exactly who
used it:

| Class | Daily register |
|---|---|
| LKG | 108 days · Feb–Aug |
| SKG | 110 days · Feb–Aug |
| Class 9 | 40 days · Feb, Jun, Jul, Aug (3 months missing mid-term) |
| Class 10 | 27 days · Jul, Aug |
| **Classes 1–8, PLG** | **none at all** |

Live check: Class 9 Feb–Jul = 1268/1408 (90.1%); Class 10 Jul–Aug = 952/1026
(92.8%); Class 5 correctly returns "No attendance was recorded".

**Classes 3–10 get the report but NOT the write.** Per explicit instruction,
their teachers enter report-card attendance manually. Only LKG/SKG were imported.

### The odd extra day

SKG has 85 working days to LKG's 84. The difference is **Wed 4 March 2026**,
which only SKG recorded — mid-week, with both classes recording the days either
side, and SKG showing 43/48 present (a normal figure, not a holiday). Almost
certainly **LKG's teacher missed marking that day** while back-entering in August.

Left at 84 deliberately: adding a day with no data would mean inventing it —
marking all present inflates, all absent penalises children who were there.
84/84 is self-consistent. If the paper register for 4 March turns up, send who
was absent and LKG recomputes to 85 in minutes.

---

## 7. The co-scholastic grade key — and why it is worded twice

The strip printed bare letters (`O · A+ · A · B+ · B · C · D · E · NA`), which
tells a parent nothing. Each grade now carries its meaning on the card.

It landed in two steps, and the second reversed the first for kindergarten:

**`be3d1b9f9`** spelled the key out using each class's own scale — percentage
bands for LKG/SKG, word descriptors for Class I/II.

**`5b7aa51d6`** then replaced the kindergarten percentages with words. The
reasoning is worth keeping: *"P.E. — 90-100%"* implies a measured score, but
nobody measures a four-year-old's P.E. to a percent. It is a teacher's judgement,
and a band label says so honestly. It also puts all four classes in one
vocabulary instead of two different kinds of scale.

### Split by audience — the part that will look redundant but is not

The same labels serve two different readers, so **both wordings are kept**:

| Consumer | Field | Shows |
|---|---|---|
| Report card (parent) | `gradeMeaningsByClass` | Outstanding … Needs Constant Support · Not Assessed |
| Entry screen (teacher) | `gradeLabelsByClass` | 90-100% … Less than 30% · Not available |

The percentage bands were **not** deleted. They are what keeps grading consistent
between teachers, so the entry screen still shows them. Anyone tidying
`coscholastic.json` later will see two labellings for the same nine grades and be
tempted to merge them — **don't**; `_gradeMeaningsByClass_why` in the file explains
this.

`O`–`C` are word-for-word identical to Class I/II. Only three are new:

```
D   Needs Much Improvement    (was "30-39%")
E   Needs Constant Support    (was "Less than 30%")
NA  Not Assessed              (was "Not available")
```

D and E are worded supportively on purpose — these reach parents of four- and
five-year-olds. "Not Assessed" replaced "Not available" because it states plainly
that the school did not grade that activity, where the old wording left a parent
guessing whether something had gone missing.

### Layout was measured, not assumed

Growing this strip is what clipped the Annual panel in an earlier session, so
both versions were measured before shipping. The longer wording still renders on
**one line (10px)**, no wrap, card does not overflow, no rows cut off — verified
on the 9-value (SKG) and 6-value (Class II) scales.

---

## 8. Students who leave: a flag, never a deletion

There was no representation of a leaver in the data at all — **all 647 students
carry no `status` field** — so the only way to remove one was to delete the
record. That is lossy in a way that is not visible from the UI.

### Why deleting is the wrong tool

Deleting the `students` document removes the roster row **and nothing else**.
Every reference survives, now pointing at somebody who no longer exists. One LKG
pupil was traced to **51** of them:

```
23  assessment_sessions    marks[studentId]      — marks with no owner
25  attendance_daily       absent / late arrays  — id stays in the array
 2  marks/LKG_{HY,FT}/students/{docId}           — incl. the imported attendance
 1  coscholastic_marks     grades[studentId]
```

Nothing crashes, which is precisely the problem. What actually degrades:

- **A released report card becomes permanently unreachable.** `lookupReportCard`
  matches class + roll + DOB against `students` *before* it will hand the card
  over. No row, no card — and it reads to a parent as "the school lost it".
- **The pipeline table counts drift forever.** `loadRCPipeline` counts from the
  marks subcollection, not the roster, so an orphan mark doc keeps being counted:
  a class of 44 reads "0/45" and can never reconcile.
- **Attendance history stops matching.** Each daily record froze `total: 75`; the
  roster now says 74.

### The convention

```
status: 'left'  + leftOn: 'YYYY-MM-DD'   → off the roll
status absent                            → on the roll
```

**Missing means active, and that must never be inverted** — every one of the 647
existing records predates the field, so flipping the default would take the whole
school off the roll at once. The rule lives in exactly one place,
`student-status.js`, for that reason.

### Blocked vs kept — the split that matters

**Blocked** once marked left (every entry surface): assessment-app new/quick
entry, class test, co-scholastic, report-card generation (all through
`loadStudentsForClass`); Sfs-report-card subject grid, class-teacher list, rank
computation and the Class Attendance grid; the teacher daily-attendance roster
and its class-strength stat.

**Kept**, deliberately — history has to stay readable:

| Surface | Why |
|---|---|
| Marks inside an already-saved session | Hiding them makes real saved marks look ownerless |
| A card already generated for them | Still needs to resolve their name |
| Attendance range report, flagged `(left)` | A child who left in April *did* attend Feb–Mar; dropping them shrinks the class and understates days taught |
| Parent lookup | A released card must stay reachable |

`loadStudentsForClass(className, { includeInactive: true })` is the opt-in for
those history paths — it exists for history, not convenience.

### Verified against production

Flagged SKG roll 5, checked every surface, then restored:

```
roster before          48 total / 48 active
marked left            48 total / 47 active
entry roster has #5    false     ← blocked
history roster has #5  true      ← preserved
attendance record      {hyPresent: 0, hyTotal: 85}  ← untouched
restored               48 total / 48 active
```

### Left in place on purpose

The hard **Delete** button still exists in the admin student list, unguarded, at
the user's decision. It is legitimate for a duplicate row or a student added in
error with no history. **The rule: if the student has any marks, attendance or a
report card, mark them as left — never delete.** A guarded delete (refuse when
references exist) was offered and declined for now.

---

## 9. Outstanding

**LKG/SKG report cards are NOT ready to generate.** Attendance and co-scholastic
flow correctly, but **51 of 54 sessions are still `submitted`, not
reviewed/locked**, and the aggregator counts only reviewed/locked. A dry run for
two students showed the result:

```
LKG roll 19   1 session counted, 19 blocked   → 3 of 4 subjects "Ex / no data"
              overall 1.86 "Beg" resting on a single Arts session
              attendance 82/84 ✓   co-scholastic ✓
SKG roll 25   2 sessions counted, 29 blocked  → 2 of 4 subjects "Ex / no data"
              overall 2.12 "Beg" resting on two sessions
              attendance 85/85 ✓   co-scholastic ✓
```

Generating now would publish badly understated grades to parents. **The one
action needed is the class teacher reviewing and locking those sessions** — then
regenerate and everything fills in. No code work remains.

**Two co-scholastic columns are ungraded for LKG** — General Awareness and
Spelling were blank for the sampled student while the other four were filled.
General Awareness is new as of 2026-08-18, so it may simply not have been graded
yet.

**Duplicate student id, still unresolved by choice.** `SFS260623` belongs to two
real children — ADRIAN OMEBAKHRAW WARBAH (LKG roll 1) and SHANBORLANG LYNGDOH
NONGBRI (Class X roll 38). Only 1 duplicate across 647 students; nothing else
references it; no login exists. **Latent, not active.** Assigning a corrected id
is a records decision, deliberately not guessed.

Related and still live: **two students have a Firestore document id that differs
from their studentId** — SKG roll 48 (`7m5G7RwwfRtm6k41y77y`) and Class X roll
38. Both the attendance reader and the parent lookup now resolve this via a
fallback; without it those two silently lose data while everyone else looks fine.

**No report card has ever been released.** `report_cards` holds a single Class II
draft. The first real release will be the first genuine end-to-end test of the
parent lookup fix, the expandable-criteria view, and the success path generally.

**Two attendance routes are in use.** LKG/SKG/9/10 use the daily register; Class
I/II used the Class Attendance grid directly and have no daily records at all.
Only the daily route feeds the Range Report. **Decide which one is mandatory next
year**, or the compliance check will show false negatives for grid users.

**The co-scholastic grade wording exists in two places.** `report-card-print.js`
is a self-contained template with no imports, so it carries its own copy of the
nine words that `gradeMeaningsByClass` holds in `coscholastic.json`. Both sides
cross-reference each other in comments, but a wording change must be made in
**both** or the card and the registry will disagree silently.

**Hard delete is still reachable for students.** The red Delete button remains in
the admin student list, unguarded, by decision — see §8. A guarded version
(refuse when marks/attendance/report cards exist) was offered and declined for
now. If orphaned references ever do appear, §8 lists exactly where to look.

**The five never-present pupils are still on the roll.** LKG rolls 71 and 21, SKG
rolls 5, 48 and 20 (see the data section above) are the obvious candidates for
the new "mark as left" flag, if the office confirms they never enrolled.

Everything from the previous handoff's Outstanding section is unchanged.

---

## 10. Lessons — the ones specific to this session

**1. `node --check` is not a syntax gate for browser code.** It exited 0 on a
file Chrome refused to parse, and that shipped a production outage. Use the
strip-imports + `new Function()` check instead. It reproduces the browser's exact
error.

**2. Verify with character codes, not with printed output.** Tool output
un-escaped strings repeatedly and made a broken file look correct. Worse, my own
verification regex was built wrong (`new RegExp('\n')` matches a newline, not a
literal backslash-n) and *confirmed* the bug as proof of correctness. Numeric
`charCodeAt` was the only read that ever told the truth.

**3. The service worker serves stale JS after every deploy.** This bit twice —
"Science" persisting after the LKG fix, and Khasi appearing clipped from an old
print engine that measured a clean 126px of headroom in the current build. It is
cache-first for same-origin JS, so HTTP `no-cache` headers do not override what
it already holds. Firefox fix: `about:debugging#/runtime/this-firefox` →
Unregister → `Ctrl+Shift+R`. **An open decision:** make JS network-first in
`sw.js` (as HTML already is) so deploys take effect immediately, at the cost of
offline JS for the APK cold start.

**4. Two identifiers built in two places will drift** — restated from the last
handoff, and it recurred here. The fix that holds is to stop reconstructing the
identifier at all and query by field.

**5. An empty result is not proof of absent data.** Carried from the previous
handoff and it kept earning its place: `marks/1_HY` looked empty because the
collection keys by Roman numeral; `class == "null"` looked like SKG had no
students. Both times, listing what *is* there found it immediately.

---

## Useful paths

- `attendance-range.js` — the range report (new); `computeRange()` is the whole
  calculation and is exported for reuse
- `student-status.js` — the single definition of "still on the roll".
  `isStudentActive()` / `filterActiveStudentDocs()`. **Missing status = active**;
  inverting that default takes all 647 students off the roll at once. Loaded as a
  classic script BEFORE `app-logic.js`, which calls it
- `assessment-app/services/report-card-attendance.js` — report-card attendance
  reader; `CLASS_TO_MARKS_ID` maps display name → Roman-numeral marks id, and the
  docId fallback lives here
- `assessment-app/services/report-card-grade-engine.js` — `getTermDateRange()`
  (the Feb window) and `computeOverallPerformance()` (improvementAreas ordering)
- `report-card-print.js` — `pickNeedsAttention()`, and `KG_SCALE`/`PRIMARY_SCALE`
  (the printed grade key). Keep in sync with **two** things: its fork at
  `report-card-lookup/report-card-print.js` (`diff` them before shipping) and
  `gradeMeaningsByClass` in `assessment-app/data/coscholastic.json`
- `assessment-app/data/coscholastic.json` — subjects, both grade scales, and
  **both** labellings: `gradeLabelsByClass` (teacher, percentages) vs
  `gradeMeaningsByClass` (parent, words). They are not duplicates — see §7
- `report-card-admin.js` — Delete / Edit Attendance / Edit Remark actions
- `app-logic.js` — `loadRCPipeline()` (`PIPELINE_EXCLUDED`),
  `generateMonthlySnapshot()`
- Firestore admin: `serviceAccountKey.json` at repo root (gitignored, present on
  this dev machine — used for every diagnostic and for the attendance import)

**Deploy note:** Cloud Functions need
`FUNCTIONS_DISCOVERY_TIMEOUT=120 firebase deploy --only functions` on this
machine; the default 10s discovery times out even though the code is fine.
