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
| `59bca28` | **Fix: Arts & Craft no longer listed as co-scholastic for LKG/SKG** |
| `57702a8` | Quick entry — one subject, one tap per student, plus a bulk fill |
| `f60d0cf` | Kindergarten co-scholastic uses Science and Spelling |

(Plus `ecdd6a4`, `2015c02`, `825413c`, `fa3f347`, `759bcad`, `db1e2de` —
service-worker cache bumps, one per deploy.)

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

**This does not make phone entry good** — it stops a grade being entered against
the wrong child, nothing more. The grid is no longer the primary way in: see
§7 for quick entry, which was built later in the session. The grid and its
frozen columns remain as the review view.

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

## 6. Arts was on the LKG/SKG card twice — fixed

`ART` "Arts/Colouring" is a full **academic** subject for LKG/SKG in
`subjects.json`: 14 criteria, criteria-scored fortnightly, counted in the
overall average. Co-scholastic separately listed "Arts & Craft" as a letter
grade explicitly excluded from that average. Same child, same card, two Arts
marks on two different scales.

Class I/II never hit this because `ART` is not academic for them, so the
co-scholastic entry was the only Arts on their card. The list was copied across
to LKG/SKG without that check — the same copy-without-checking that produced the
7-subject assumption in the first place.

`arts_craft` is now Class I/II only, and carries a `_why` note on the entry
itself warning against adding LKG/SKG back without first removing `ART` from
`subjects.json`. A comment in the file is what the next person will actually see.

A smaller overlap was noted at the time and deliberately left: co-scholastic
"Neatness" against criterion `ART_C14` "Neatness / Cleanliness". It became moot
for LKG/SKG later in the session — Neatness was replaced by Spelling for those
classes (see below). It still stands for Class I/II, where it is harmless: they
have no academic Arts, so `ART_C14` never appears on their card.

No data risk: reads resolve through the registry, so a stored `arts_craft` value
for a KG student stops being read rather than breaking anything, and
`saveCoScholastic` uses `setDoc` without merge so the key drops on the next save.

### Kindergarten now differs from Class I/II on two more subjects

At the school's instruction, for **LKG/SKG only**: Aptitude → **Science**, and
Neatness → **Spelling**. Class I/II keep all seven unchanged.

| | Co-scholastic subjects |
|---|---|
| LKG / SKG | P.E., Singing, Discipline, **Science**, **Spelling**, Val. Edu./Catechism |
| Class I / II | P.E., Singing, Discipline, Aptitude, Arts & Craft, Neatness, Val. Edu./Catechism |

Both are **new keys** (`science`, `spelling`), not relabelled `gk` and
`neatness`. Relabelling would have left one stored value meaning two different
things depending on which class read it — a grade under `gk` rendering as
"Aptitude" for Class I and "Science" for LKG. Free to do properly because
nothing is entered yet.

Adding Science was the obvious place to repeat the Arts mistake, so it was
checked: LKG/SKG have no academic Science, so this is the only Science on a KG
card. Verified across all four classes that nothing appears on both the academic
and co-scholastic side, and that no keys collide.

The Class III–X system is untouched — the `gk`/`neatness` entries in `config.js`
and `Sfs-report-card/` belong to a separate report card keyed by class number,
with no LKG/SKG entries at all.

---

## 7. Quick entry — the real fix for 336 dropdowns

Entry was 336 `<select>`s for SKG (48 x 7 at the time), each needing an
open-scroll-select. Quick entry mirrors `components/quick-entry-grid.js` rather
than inventing a second pattern: **one subject at a time, every student on
screen, six grade buttons per row**, one tap to set and the same tap again to
clear. Reuses `.mark-scale`/`.mark-button` and the `.quick-*` classes so both
entry screens feel identical and the 44px tap targets carry over. It is the
default view; the full grid stays behind a toggle for review.

**"Fill blanks with"** sets the whole class for a subject in one tap. It fills
only **blank** cells — unlike `default-score-picker.js`, which pre-fills
everything up front. A teacher who has already corrected individual students
must never have that silently overwritten by a later tap on the bulk row.

Roughly, for SKG's 282 grades: ~850 interactions before, 282 tapping each, ~62
with the bulk fill and 20% exceptions.

**The bulk fill is the 935-identical-4s mechanism.** That fabrication started as
an unremarkable default-fill nobody looked at again, was submitted, and nearly
fed a perfect fortnight into 55 report cards. So a subject that ends up entirely
one grade now says so — "47 of 47 graded — every student is A+", in warning
colour. It blocks nothing; it refuses to let it happen silently. **If entry
turns out to be too frictionless in practice, this is the knob to turn.**

Implementation notes worth keeping:
- Neither view re-renders on a grade change — `onGradeChange` in `main.js`
  deliberately does not call `render()`. The DOM is updated in place, which is
  what lets the chosen subject survive every tap. Do not "fix" that by adding a
  re-render.
- Progress is **recomputed**, not incremented. A running counter drifts the
  first time a cell is cleared.
- A first version synced the grid's `<select>`s from the per-student tap handler
  only, so anything written by the bulk fill showed as **blank** in the grid.
  The sync is now one wholesale pass on view switch — one path, nothing for the
  next writer to forget.

Verified by driving the component against the real registry and 47-student SKG
roster: tap sets and clears; bulk fill leaves an already-graded student
untouched; subject switching preserves grades; all 282 cells agree between the
two views in both directions; buttons are 45x44px at 375px with all six visible
and no horizontal scroll; the grid still fits at 1280.

---

## 8. Outstanding

**Nothing in this session has been confirmed in the real app.** Four UI changes
are now deployed but unobserved — none could be exercised without auth and
Firestore, and screenshots were unavailable throughout. Everything was verified
in an offline render harness against the real component, registry and roster,
which is not the same thing.

One check covers most of it, on a phone: open Co-Scholastic, pick a class,
change the term (expect **one** panel, not two), tap a few grades in Quick
entry, then switch to Full grid and confirm the same values are there.

**Whether the bulk fill is too frictionless is an open question**, and it can
only be answered by watching a real teacher use it. If all six SKG subjects can
be completed in under a minute without looking at a child, the uniform-grade
warning is too soft.

**The gap diagnostic has never run against live data.** It needs the service
account key and `npm install`. The assessment gaps for LKG/SKG are therefore
still **unmeasured** — the previous handoff's Outstanding section covers Class
I/II only, and that silence is not a clean bill of health.

**Co-scholastic is still empty.** No grades entered for any class.

**Should kindergarten Science and Spelling be academic instead?** As
co-scholastic they carry one O–C letter per term and are **excluded from the
overall average** — treated like Discipline, not like Literacy or Numeracy. If
the school means them to be properly assessed and counted, they belong in
`subjects.json` with criteria and fortnightly sessions instead. Raised, not
answered. Far cheaper to settle now than after a term of grades exists.

**Co-scholastic saves remain all-or-nothing per class+term.** `saveCoScholastic`
writes the whole grid with `setDoc` and no merge. With quick entry encouraging
subject-by-subject work, per-subject saves would fit the flow better and shrink
the blast radius of a half-finished session. Not changed — it alters how partial
data is written and deserves a deliberate decision.

**A "mini admin" test account was requested and not built.** It cannot be done
with data alone: a teacher role plus `tpClassTeacherOf` grants exactly one
class, while an `admin` role grants every class in `canReviewClass()` but never
sees the screen — the Co-Scholastic nav button lives inside `if (isTeacher())`
at `main.js:337`, and `admin` is not a teacher role. All-classes access for one
account needs a sentinel (e.g. `tpClassTeacherOf: "ALL"`) honoured in **both**
`main.js` and `firestore.rules`, since a UI-only change would show the grid and
have every save rejected server-side. That is a permanent, documented hole in
the class-teacher gate that `c8135a1` had just fixed, and it needs a
`firestore.rules` deploy. Judged not worth it; **the zero-code alternative is to
assign the test account as class teacher of one class at a time** via admin →
Teacher Assignments, which does not clear the real teacher's own
`tpClassTeacherOf`.

**`'Class 9'`** sits in the class list at `main.js:83` with no roster file and no
subjects — a dead option in the co-scholastic dropdown.

**Class I Maths 5/6, English II 0/6 in both classes** — carried over from the
previous handoff, unchanged.

---

## Lesson repeated from the last handoff

The previous session recorded: gating was "verified" by testing the matching
logic without ever testing the resolution path, and half-verified was reported
as verified.

The same trap appeared three times here and was caught each time only by running
things rather than reading them:

- The first gap-slot generator produced eight fortnights instead of six and
  would have reported two phantom March gaps in every subject of every class.
- The first layout harness reported a 28px panel because it did not reproduce
  the page wrapper or normalise students, so its column measurements were
  meaningless — a test that lies is worse than no test.
- Quick entry's first version left the full grid showing **blank** for anything
  written by the bulk fill. The code read correctly; only clicking the bulk
  button and switching views exposed it.

None of the three was visible by inspection. All three were obvious the moment
something executed. The corollary for the next session: a harness is only
evidence once you have checked that the harness itself is right.

---

## Useful paths
- `scripts/diagnose-assessment-gaps.js` — coverage gaps per class/subject/fortnight
- `scripts/check-classtest-vs-reportcard.js`, `scripts/diagnose-class-teacher-assignment.js` — read-only diagnostics
- `assessment-app/data/coscholastic.json`, `data/class-test-config.json` — the two registries changed this session
- `F:\assessment\_work\` — crop tooling and writer scripts (**external drive, not present**)
- Firestore admin: `serviceAccountKey.json` at repo root (gitignored — absent from a fresh clone)
