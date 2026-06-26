# Mark Entry — Launch Readiness Audit
**Generated:** 2026-06-26 · live data, Firebase project `st-francis-school-a3e7e`
**Scope:** Classes III–X (I, II, SKG, LKG use a separate system)

## Verdict
The mark-entry → storage → marksheet → report **code path works** (verified end-to-end on live data
with a write/read/delete round-trip). **The blocker is data, not code:** most teachers have no
subject assignments, and two class teachers have broken class identifiers.

---

## A. Subject assignment gaps — 51 subject-slots still unassigned
Each unassigned subject below has **no teacher who can enter its marks**. Aggregate subjects
(S.Science, English I+II, Science P+C+B) are auto-computed and intentionally excluded.

| Class | Missing | Subjects with NO teacher assigned |
|-------|---------|-----------------------------------|
| III   | 7 / 8   | Mathematics, Science, Social Studies, Spelling, English I, English II, Khasi/Alt. English |
| IV    | 8 / 9   | Mathematics, Science, Computer, Spelling, English I, English II, Social Studies, Khasi/Alt. English |
| V     | 8 / 9   | Mathematics, Science, Computer, Spelling, English I, English II, Social Studies, Khasi/Alt. English |
| VI    | 8 / 11  | Science, Geography, Civics, History, English I, English II, Health Education, Khasi/Alt. English |
| VII   | 7 / 10  | Science, Geography, Civics, History, English I, H.Education, Khasi/Alt. English |
| VIII  | 5 / 10  | Civics, History, English I, H.Education, Khasi/Alt. English |
| IX    | 3 / 12  | Chemistry, Biology, H.Education |
| X     | 5 / 12  | Chemistry, Biology, Economics, H.Education, Khasi/Alt. English |

**Action:** Admin → Teacher Assignments → assign every subject above to the teacher who teaches it.
Only the school knows who teaches what — this cannot be auto-filled.

---

## B. Class-teacher identifier problems (HIGH — breaks Review & Lock + report generation)
These class teachers will see an **empty** review/marksheet screen because their class id is wrong:

| Teacher | classTeacher | classTeacherOf | Problem |
|---------|-------------|----------------|---------|
| SFST002 | "6"         | "X-A"          | Two fields disagree (VI vs X); `-A` suffix not normalized on the review path |
| SFST005 | "SKG"       | "VIII"         | Two fields disagree (SKG vs VIII) |

**Action:** Admin → re-save each class teacher so `classTeacher` (Arabic) and `classTeacherOf`
(Roman, **no** `-A`) agree and point to the correct class.

**Code fix (recommended regardless):** `Sfs-report-card/markentry.js` line ~234, normalize the
review deep-link class id:
`ME.ctClassId = toRomanClassId(urlClassId);`  (currently `ME.ctClassId = urlClassId;`)
This makes the review path resilient to any leftover `-A` data.

---

## C. Teacher accounts not configured
- **8 teachers have no `role`:** SFST023, SFST021, SFST025, SFSTEMPT02, SFST010, SFST018, SFST019, SFST026
- **19 teachers have empty `assignments[]`** (includes the 8 above). They cannot enter subject marks
  until assigned. Class teachers with no subject assignment is fine *if* they only teach via others;
  but every subject in section A above still needs an owner.

---

## D. What was verified working (no action needed)
- Storage path `marks/{Roman}_{HY|FT}/students/{id}` with `academics.{subjectKey} = {IA,UT,TE,total}`.
- **Multi-subject merge is safe** — saving one subject does NOT erase others (live-proven).
- Transform to marksheet/report (`IA→ia`, `HY→halfYearly`, aggregates from components) is correct;
  marksheet and report card read from the same transform.
- Students load by `class == "<arabic>"`; all classes III–X populated (38–63 students each).
- `config.js` subject keys match between portal and report card for classes 3–10.
- Firestore rules allow teacher writes; `rollover_lock` is OFF.
- Login resolves correctly despite teacher docs being keyed by initials, not UID.

## E. Low-priority note
Marks write rule (`firestore.rules:200`) lets **any** teacher write **any** student's marks — not
scoped to their assignment. Not a launch blocker, but a teacher could overwrite another's subject.
