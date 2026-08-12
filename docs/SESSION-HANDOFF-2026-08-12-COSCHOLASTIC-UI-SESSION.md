# Session Handoff — 2026-08-12 — "Co-Scholastic UI Session"

Second session of 2026-08-12. The first
(`SESSION-HANDOFF-2026-08-12-LOWER-PRIMARY-SESSION.md`) built co-scholastic and
entered Class II data. This one started by reading that handoff, then fixed what
the first real look at the Co-Scholastic screen exposed.

All work below is **committed, pushed and deployed**. Nothing is half-applied.

---

## Commits from this session

| Commit | What |
|---|---|
| `bedfeba` | **Fix: co-scholastic entry stacked duplicate panels and clipped the grade grid** |
| `c9847bf` | Read-only assessment gap diagnostic |
| `bb3b6c8` | Freeze roll/student columns and header row on the co-scholastic grid |
| `a58265e` | Half-Yearly class test offered for LKG and SKG |
| `e00def8` | **Fix: rollover archives `class_test_marks` and `term_analytics`** |
| `f202620` | Stop tracking the firebase local deploy cache |

---

## 1. The two bugs on the Co-Scholastic screen

Both were visible in the first screenshot of the screen in real use. Neither had
been caught because the previous session's "layout verified at 375/800/1280" was
about the **admin Assessments** screen — this screen's layout had never been
checked at any width.

**Duplicate panels.** `renderCoScholastic()` appended to `assessmentRoot`
without clearing it first; every other mode calls `replaceChildren()`. Each
re-render therefore stacked another copy of the panel below the last, with the
stale one keeping whatever the user had selected in its now-dead DOM node —
picking a class left a panel above still reading "Select a class to begin."

**Clipped grid.** `.selector-panel` goes two-column at >=660px, which suits a
pair of Class/Term selects but not a students x subjects table. The grid landed
in a single half-width cell and clipped every subject column after the first,
with the progress line stranded in the empty cell beside it.

Fixed by a scoped `.coschol-panel` class so the other four `.selector-panel`
screens are untouched. Full panel width alone was not enough: the table needs
~1140px and `.app-shell` caps every panel at 820px, so the last subjects stayed
behind a horizontal scroll. This one screen now breaks out of the shell above
1024px, clamped to the viewport.

**Cascade note, still true:** overrides must be declared *after* the existing
`@media (min-width: 660px)` block or they are silently lost.

---

## 2. Sticky columns — a correctness fix, not a usability one

On a phone the grid is ~1136px inside a ~316px viewport. Scrolling right to
reach Neatness pushed the student's name off the left edge; scrolling down
pushed the subject headers off the top. You ended up grading a cell with no idea
which child or which subject it belonged to, 329 times over.

Roll, student and the header row now freeze. Two things this needed:

- `overflow-x:auto` already computes `overflow-y` to `auto`, but with no height
  constraint the wrap never scrolls vertically, so a sticky header anchors to a
  box that never moves and silently does nothing. Hence `max-height: 70vh`.
- Collapsed borders are not painted on sticky cells, so `border-collapse` is
  `separate` here with an inset box-shadow drawing the grid lines. Sticky cells
  also need opaque backgrounds — `.panel` is `rgba(255,255,255,0.7)`.

The name column is also capped below 1024px. Left at its natural 305px of
nowrap it froze **half** the visible width at tablet size, which would have made
things worse rather than better.

**This does not make phone entry good.** It is still roughly one grade column at
a time and still 329 taps. It stops a grade being entered against the wrong
child. See Outstanding for the real fix.

---

## 3. Class tests for LKG and SKG

Class tests were configured for Class I/II only, so the four kindergarten
subjects had no way to record one — even though nothing in the pipeline was
class-specific. `gradeSubject()` takes no class argument and blends any class
test at 30% against 70% assessment; the `class_test_marks` rule is not
class-scoped either. It was a gap in `data/class-test-config.json`, nothing more.

LKG/SKG now offer Literacy, Numeracy, Rhymes & Stories and Arts/Colouring at 30
marks each. Verified against the real `getClassTestSubjectsForClass()`
intersection: LKG/SKG get their four, Class I still gets five, Class II six, and
no subject leaks across a class boundary.

**30 marks is an assumption** copied from Class I/II on a "same concept"
instruction. If kindergarten should differ it is a one-line edit per subject.

**Worth knowing:** LKG/SKG cards print `gradesOnly`, so a class test will move a
child's letter grade with no number on the card explaining why. Class-test marks
are not printed for any class, so this is parity — but it surprises more where
no numbers appear at all.

---

## 4. Rollover gap closed

`class_test_marks` and `term_analytics` were missing from `ACADEMIC_FLAT` in
`year-end-rollover.js`. Neither carries a year in its doc id, so next year's
entries would have silently overwritten this year's — the same collision already
fixed for `report_cards` and `coscholastic_marks`. Enabling class tests for
LKG/SKG roughly doubled the exposure, which is why it was fixed now.

`ACADEMIC_FLAT` drives preview counts, archive, archive verification, clear and
the post-clear recount, so adding the two names covers every path.

**Untested against real data** — a rollover cannot be exercised without
Firestore credentials. `verifyArchive()` compares archived against live counts
and Clear stays locked unless every row passes, so a wrong name fails
verification rather than deleting anything. Still: on the first real rollover,
run Preview, confirm both collections show non-zero counts, and confirm Verify
passes before touching Clear.

---

## 5. New tool — `scripts/diagnose-assessment-gaps.js`

READ-ONLY. Counts actual vs expected coverage per class, subject and fortnight
for LKG, SKG, Class I and Class II. Reports which fortnight slots have no
session, which sessions exist but will not reach a report card (unreviewed, or
dates not fully contained in the term window), which look default-filled — the
935-identical-4s pattern — and whether `class_test_marks` / `coscholastic_marks`
exist per class.

```
npm install && node scripts/diagnose-assessment-gaps.js [--term HY1] [--class "Class I"]
```

**Never run against live data.** It needs `serviceAccountKey.json`, which is
gitignored and absent from a fresh clone. Verified end-to-end against a stubbed
`firebase-admin` and fixtures instead: every branch fires correctly, including
the real Class I Maths `2026-04-01..2026-07-14` session being excluded.

Two traps recorded in the script itself:
- The term window and the teaching fortnights are **different ranges**. HY1
  2026-27 opens 2026-03-01 so early entries are picked up, but the school
  teaches six fortnights, April to June. Generating slots from the window
  invented two permanent March gaps in every subject of every class.
- `getTermDateRange()` is duplicated there because
  `report-card-grade-engine.js` is a browser ES module and cannot be `require`d
  from CommonJS. If that function changes and the copy does not, the diagnostic
  lies.

---

## 6. Outstanding

**Nothing in this session has been confirmed in the real app.** All three UI
fixes are deployed but unobserved — they could not be exercised without auth and
Firestore, and screenshots were unavailable. 30-second check: open
Co-Scholastic, pick a class, change the term (expect **one** panel); on a phone
scroll right to Neatness and down past row 10 (name and headers should hold).

**The gap diagnostic has never run against live data.** It needs the service
account key and `npm install`. The assessment gaps for LKG/SKG are therefore
still **unmeasured** — the previous handoff's Outstanding section covers Class
I/II only, and that silence is not a clean bill of health.

**Arts is on the LKG/SKG card twice.** `ART` "Arts/Colouring" is a full academic
subject for LKG/SKG — 14 criteria, criteria-scored, counts in the overall
average — while co-scholastic separately adds "Arts & Craft" as a letter grade
excluded from the average. Same child, same card, two Arts marks on two scales.
Class I/II never hit this because `ART` is not academic for them; the
co-scholastic list was copied across without that check. Smaller version:
co-scholastic "Neatness" vs criterion `ART_C14` "Neatness / Cleanliness".
**Not fixed** — it is a school-convention call, and a one-line edit to
`coscholastic.json` either way.

**Co-scholastic is still empty.** No grades entered for any class.

**Phone entry is still 329 taps.** The real fix is subject-at-a-time entry: pick
one subject, get a single column of students, with a "set all to…" default. No
horizontal scrolling at any width, and it matches how a teacher actually
grades — one subject across the class, not one child across seven subjects. The
storage format does not change; `coscholastic_marks` is already keyed by student
and subject. Decide first whether saves stay all-or-nothing per class+term or
become per-subject. **Not started.**

**`'Class 9'`** sits in the class list at `main.js:83` with no roster file and no
subjects — a dead option in the co-scholastic dropdown.

**Class I Maths 5/6, English II 0/6 in both classes** — carried over from the
previous handoff, unchanged.

---

## Lesson repeated from the last handoff

The previous session recorded: gating was "verified" by testing the matching
logic without ever testing the resolution path, and half-verified was reported
as verified.

The same trap appeared twice here and was caught both times only by running
things rather than reading them. The first gap-slot generator produced eight
fortnights instead of six and would have reported two phantom March gaps in
every subject of every class. The first layout harness reported a 28px panel
because it did not reproduce the page wrapper or normalise students, so its
column measurements were meaningless.

Neither error was visible by inspection. Both were obvious the moment something
executed.

---

## Useful paths
- `scripts/diagnose-assessment-gaps.js` — coverage gaps per class/subject/fortnight
- `scripts/check-classtest-vs-reportcard.js`, `scripts/diagnose-class-teacher-assignment.js` — read-only diagnostics
- `assessment-app/data/coscholastic.json`, `data/class-test-config.json` — the two registries changed this session
- `F:\assessment\_work\` — crop tooling and writer scripts (**external drive, not present**)
- Firestore admin: `serviceAccountKey.json` at repo root (gitignored — absent from a fresh clone)
