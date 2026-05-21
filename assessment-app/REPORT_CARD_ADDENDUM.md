# REPORT CARD SYSTEM — ADDENDUM PROMPT
# Attach this AFTER the Master Prompt before passing to Claude Code
# This addendum overrides and extends specific sections of the master prompt

---

## ADDENDUM A — GRADING SCALE OVERRIDE

Replace ALL references to the A+/A/B/C/D grading scale in the master prompt
with the following scale. This is the ONLY grading scale to be used throughout
the entire system.

### Official Grading Scale

| Score Range | Code  | Full Word   | Display in Report Card       |
|-------------|-------|-------------|------------------------------|
| 4.5 – 5.0   | Adv   | Advanced    | Adv — Advanced               |
| 3.5 – 4.4   | Prof  | Proficient  | Prof — Proficient            |
| 2.5 – 3.4   | Dev   | Developing  | Dev — Developing             |
| 1.5 – 2.4   | Beg   | Beginning   | Beg — Beginning              |
| 0.0 – 1.4   | NY    | Not Yet     | NY — Not Yet                 |
| No scores   | Ex    | Exempt      | Ex — Exempt / No Data        |

### Notes on "Not Yet":
- The grade "NY" must always render with a tooltip or small footnote:
  "Indicates the student has the potential to still achieve this milestone."
- Render in a muted tone — not red, not alarming. Use gray or soft amber.

### Grade color mapping (update everywhere — badges, progress bars, cells):
```
Adv  → green   (#0a6e3a bg: #d4f5e2)
Prof → blue    (#1a5fb4 bg: #d6eaf8)
Dev  → amber   (#b87600 bg: #fef3d0)
Beg  → orange  (#cc5500 bg: #fde8d8)
NY   → gray    (#666    bg: #f0f0f0)
Ex   → muted   (#999    bg: #f5f5f5)
```

### Update `report-card-grade-engine.js` — mapScoreToGrade():
```javascript
export function mapScoreToGrade(averageScore) {
  if (averageScore === null || averageScore === undefined) {
    return { code: 'Ex', word: 'Exempt', label: 'Exempt / No Data', colorClass: 'grade-ex' };
  }
  if (averageScore >= 4.5) {
    return { code: 'Adv', word: 'Advanced',    label: 'Advanced',   colorClass: 'grade-adv'  };
  }
  if (averageScore >= 3.5) {
    return { code: 'Prof', word: 'Proficient', label: 'Proficient', colorClass: 'grade-prof' };
  }
  if (averageScore >= 2.5) {
    return { code: 'Dev', word: 'Developing',  label: 'Developing', colorClass: 'grade-dev'  };
  }
  if (averageScore >= 1.5) {
    return { code: 'Beg', word: 'Beginning',   label: 'Beginning',  colorClass: 'grade-beg'  };
  }
  return { code: 'NY', word: 'Not Yet', label: 'Not Yet', colorClass: 'grade-ny',
           footnote: 'Indicates the student has the potential to still achieve this milestone.' };
}
```

### Update remark engine prompt — replace grade labels:
Wherever the remark engine prompt references A/B/C/D labels,
use: Advanced / Proficient / Developing / Beginning / Not Yet

Example: Instead of "Overall Performance: Excellent (A)"
Use: "Overall Performance: Proficient (Prof)"

---

## ADDENDUM B — DYNAMIC SUBJECTS & CRITERIA ENGINE

### CRITICAL INSTRUCTION

The master prompt described subjects and criteria as static arrays.
This is WRONG for this system.

Subjects and criteria are FULLY DYNAMIC and already exist in the codebase.
The report card system MUST read them from the existing engines.

DO NOT hardcode any subject names or criterion names anywhere in the
report card system. Every subject and criterion displayed on the report card
must be fetched live from the existing loaders.

### Existing engines to use (DO NOT modify these files):

```
assessment-app/services/subject-loader.js
  → getSubjectsForClass(allSubjects, className)
  → loadSubjects()

assessment-app/services/criteria-loader.js
  → loadCriteriaForSubject(subject, className)
```

### How report-card-aggregator.js must fetch subjects and criteria:

```javascript
import { loadSubjects, getSubjectsForClass } from './subject-loader.js';
import { loadCriteriaForSubject } from './criteria-loader.js';

/**
 * Builds the full subject+criteria map for a given class
 * using the live subject and criteria engines.
 * This is the authoritative source — never hardcode subjects or criteria.
 *
 * @param {string} className - e.g. "Class I"
 * @returns {Promise<SubjectCriteriaMap[]>}
 */
async function buildSubjectCriteriaMap(className) {
  const allSubjects = await loadSubjects();
  const classSubjects = getSubjectsForClass(allSubjects, className);

  const map = [];

  for (const subject of classSubjects) {
    let criteria = [];
    try {
      criteria = await loadCriteriaForSubject(subject, className);
    } catch (err) {
      console.warn(`Criteria not available for ${subject.subject_name} in ${className}`, err);
      criteria = [];
    }
    map.push({
      subject_id:   subject.subject_id,
      subject_name: subject.subject_name,
      criteria:     criteria.map(c => ({
        criterion_id:   c.criterion_id,
        criterion_name: c.criterion_name
      }))
    });
  }

  return map;
}
```

### In report-card-aggregator.js — replace static subject grouping:

Current master prompt says: "Group sessions by subject_id"

Replace with this flow:

```
1. Build live subject+criteria map → buildSubjectCriteriaMap(className)
2. For each subject in the map:
   a. Find all sessions where session.subject_id === subject.subject_id
   b. For each criterion in the map (not from sessions — from the engine):
      - Collect scores from all matching sessions
      - If no sessions found for this criterion → averageScore = null → grade: Ex
3. This ensures ALL criteria defined in the engine appear on the report card,
   even if some were not yet assessed. They show as "Ex — Exempt / No Data"
```

This approach means:
- The report card always shows the complete curriculum structure
- No criterion is silently omitted because it had no sessions
- Future criteria additions are automatically reflected in new report cards

### Special handling for LKG and SKG:

The master prompt noted that LKG/SKG criteria are not yet defined.
When `loadCriteriaForSubject` returns empty or throws for LKG/SKG:

```javascript
if (!criteria || criteria.length === 0) {
  // Mark entire subject as pending — do not crash
  map.push({
    subject_id:   subject.subject_id,
    subject_name: subject.subject_name,
    criteria:     [],
    pending:      true,   // flag for UI to show "Criteria coming soon"
    pendingNote:  'Assessment criteria for this subject are being finalized.'
  });
}
```

On the report card UI, subjects with `pending: true` render as:
```
SUBJECT NAME
[Criteria for this subject are being finalized for this class]
```
Still shows the subject heading, but no criteria rows. No errors thrown.

---

## ADDENDUM C — E-BOOK STYLE PRINT VIEW

### Overview

Replace the single-term print view described in the master prompt with a
COMBINED E-BOOK document that contains BOTH terms in one printable file.

The student sees and prints ONE document containing:
- Cover page
- First Half-Yearly report (HY1)
- Second Half-Yearly report (HY2)
- Annual summary page (auto-computed from HY1 + HY2)

### Document Structure (page-by-page):

```
Page 1 — Cover Page
Page 2 — First Half-Yearly Report Card
Page 3 — Second Half-Yearly Report Card
Page 4 — Annual Academic Summary
```

### Page 1 — Cover Page HTML structure:

```html
<!-- Full A4 page, centered content -->
<div class="ebook-cover">
  <div class="cover-crest">
    <!-- School name as styled text crest — no image dependency -->
    SFDS
  </div>
  <div class="cover-school-name">St. Francis de Sales School</div>
  <div class="cover-school-location">Laitkor, Shillong — Meghalaya</div>
  <div class="cover-divider"></div>
  <div class="cover-doc-title">Academic Progress Report</div>
  <div class="cover-year">2025 – 2026</div>
  <div class="cover-divider"></div>
  <div class="cover-student-name">{studentName}</div>
  <div class="cover-student-class">Class: {className} &nbsp;|&nbsp; Roll No: {rollNo}</div>
  <div class="cover-student-id">Student ID: {studentId}</div>
  <div class="cover-footer">
    This document contains the First Half-Yearly and Second Half-Yearly
    Progress Reports for the academic year 2025–26.
  </div>
</div>
```

### Page 2 — First Half-Yearly Report Card:
Full report card as designed, with:
- Header: "First Half-Yearly Progress Report | April – September 2025"
- All subjects and criteria for that term
- Attendance for HY1
- Teacher's remark for HY1
- Signature block

### Page 3 — Second Half-Yearly Report Card:
Full report card with:
- Header: "Second Half-Yearly Progress Report | October 2025 – March 2026"
- All subjects and criteria for that term
- Attendance for HY2
- Teacher's remark for HY2
- Signature block

If HY2 is not yet released:
```html
<div class="term-pending-page">
  <p>Second Half-Yearly results will be published at the end of the academic year.</p>
</div>
```
Still renders the page — just shows the pending message. This way the document
structure is consistent and students know it's coming.

### Page 4 — Annual Academic Summary:

Computed ONLY when both HY1 and HY2 are released.
Until then, show:
```html
<div class="annual-pending">
  Annual summary will be generated once both terms are complete.
</div>
```

When both terms available, compute:

```javascript
/**
 * Computes annual summary by averaging HY1 and HY2 criterion scores.
 * For each criterion: annualAvg = (hy1Avg + hy2Avg) / 2
 * If one term is missing for a criterion: use the available term's score only
 */
function computeAnnualSummary(hy1Card, hy2Card)
```

Annual summary page layout:
```
┌─────────────────────────────────────────┐
│        ANNUAL ACADEMIC SUMMARY          │
│             2025 – 2026                 │
├─────────────────────────────────────────┤
│ Subject     │ HY1 Grade │ HY2 Grade │ Annual │
│ Mathematics │   Adv     │   Adv     │  Adv   │
│ English     │   Dev     │   Prof    │  Prof  │
│ EVS         │   Prof    │   Prof    │  Prof  │
├─────────────────────────────────────────┤
│ Overall HY1: Proficient                 │
│ Overall HY2: Advanced                   │
│ Annual Standing: Proficient             │
│                                         │
│ Trend: ↑ Consistent Improvement        │
│                                         │
│ Teacher's Annual Remark:               │
│ [annual remark — new AI generation]    │
├─────────────────────────────────────────┤
│ Total Attendance: 168 / 180 days (93%) │
├─────────────────────────────────────────┤
│ Promoted to: Class II                  │
│ [Principal Signature]                  │
└─────────────────────────────────────────┘
```

"Promoted to" field:
- Admin fills this manually in the admin release panel before releasing
- Add a "Promoted to Class" input in the admin panel for annual report only
- If left blank: show "Promotion pending"

### E-book CSS — print media rules:

```css
@media print {
  .ebook-page {
    page-break-after: always;
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 18mm;
    box-sizing: border-box;
  }

  .ebook-cover {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 297mm;
    text-align: center;
  }

  /* Hide print button and browser chrome */
  .print-btn-bar { display: none !important; }

  /* Force color printing for grade badges */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
```

### Student portal — print button bar (screen only, hidden on print):

```html
<div class="print-btn-bar">
  <button onclick="window.print()" class="print-btn">
    🖨 Print / Download Report Card
  </button>
  <span class="print-hint">
    To save as PDF: choose "Save as PDF" in your browser's print dialog
  </span>
</div>
```

### `buildPrintableHTML(hy1Card, hy2Card)` — updated signature:

```javascript
/**
 * Builds a self-contained, printable A4 e-book HTML document
 * combining cover page, HY1 report, HY2 report, and annual summary.
 *
 * @param {ReportCardDocument|null} hy1Card  - HY1 report card, or null if not released
 * @param {ReportCardDocument|null} hy2Card  - HY2 report card, or null if not released
 * @param {object} studentInfo               - { studentName, className, rollNo, studentId }
 * @returns {string}                         - Full self-contained HTML string
 */
export function buildPrintableHTML(hy1Card, hy2Card, studentInfo)
```

This function must:
1. Always render the cover page
2. Render HY1 if available, else "pending" page
3. Render HY2 if available, else "pending" page
4. Render annual summary if both available, else "pending" page
5. Include ALL CSS inline (no external stylesheets)
6. Include school name in print header via `@page` rule
7. Be completely self-contained — no Firebase calls, no imports
   (all data passed in as plain objects)

---

## ADDENDUM D — STUDENT PORTAL UPDATES

### Update `report-card-student-view.js`:

Replace the single-card fetch with a combined fetch:

```javascript
// Fetch BOTH terms for the student in one query
const snapshot = await getDocs(
  query(
    collection(db, 'report_cards'),
    where('studentId', '==', currentStudentId),
    where('status', '==', 'released')
  )
);

// Separate by term
const hy1Card = snapshot.docs.find(d => d.data().term === 'HY1')?.data() || null;
const hy2Card = snapshot.docs.find(d => d.data().term === 'HY2')?.data() || null;
```

### Student portal card display (screen view — before printing):

Show a summary card for each available term:

```
┌────────────────────────────────┐
│  📋 First Half-Yearly Report   │
│  Overall: Proficient           │
│  Released: 15 Oct 2025         │
│  [View Full Report Card]       │
└────────────────────────────────┘

┌────────────────────────────────┐
│  📋 Second Half-Yearly Report  │
│  Overall: Advanced             │
│  Released: 20 Mar 2026         │
│  [View Full Report Card]       │
└────────────────────────────────┘

[ 🖨 Print Complete Academic Record (Both Terms) ]
```

The "Print Complete Academic Record" button calls:
```javascript
const html = buildPrintableHTML(hy1Card, hy2Card, studentInfo);
const w = window.open('', '_blank');
w.document.write(html);
w.document.close();
w.print();
```

"View Full Report Card" (single term) also uses buildPrintableHTML but
passes only that term's card and null for the other.

---

## ADDENDUM E — ADMIN PANEL UPDATES FOR E-BOOK

### Add to admin release panel:

When releasing the Second Half-Yearly (HY2) term, show an additional field:

```
┌─────────────────────────────────────┐
│  Annual Promotion                   │
│  Promoted to Class: [____________]  │
│  (leave blank if not applicable)    │
└─────────────────────────────────────┘
```

This saves to the HY2 `report_cards` document as:
```javascript
{ promotedToClass: "Class II" }   // or null
```

### Admin can preview the e-book before release:

Add "Preview E-Book" button in admin panel:
- Opens `buildPrintableHTML(hy1Card, hy2Card, studentInfo)` in a new tab
- Admin sees exactly what the student will see and print
- Does NOT change the release status

---

## ADDENDUM F — INTELLIGENT REMARK ENGINE UPDATES

### Annual remark (new):

The remark engine needs a new function for the annual summary page:

```javascript
/**
 * Generates an annual summary teacher remark via Claude API.
 * Takes both half-yearly profiles and produces a year-in-review remark.
 *
 * @param {object} annualProfile
 * @param {string} annualProfile.firstName
 * @param {string} annualProfile.className
 * @param {string} annualProfile.hy1Grade          - e.g. "Proficient"
 * @param {string} annualProfile.hy2Grade          - e.g. "Advanced"
 * @param {string} annualProfile.annualGrade       - e.g. "Proficient"
 * @param {string} annualProfile.strongestSubject
 * @param {string} annualProfile.mostImprovedArea  - subject that improved most HY1→HY2
 * @param {string} annualProfile.persistentWeakArea
 * @param {string} annualProfile.trendDirection
 * @param {string|null} annualProfile.promotedToClass
 * @returns {Promise<string>} - 250–300 character annual remark
 */
export async function generateAnnualRemark(annualProfile)
```

Annual remark prompt addition:
```
You are a warm, experienced class teacher writing an end-of-year summary
for a student's annual report card. This will be read by parents.

Student: {firstName}, {className}
Academic Year: 2025–2026
HY1 Overall: {hy1Grade}
HY2 Overall: {hy2Grade}
Annual Standing: {annualGrade}
Strongest Subject: {strongestSubject}
Most Improved Area: {mostImprovedArea}
Area still needing focus: {persistentWeakArea}
Year trend: {trendDirection}
Promotion: {promotedToClass ? "Promoted to " + promotedToClass : "Promotion pending"}

Write ONE warm paragraph, 250–300 characters.
Reflect on the full year journey.
Celebrate growth, acknowledge effort, encourage the year ahead.
If promoted, end with congratulations for the next class.
Same rules as term remark: kind, teacher-to-parent, no lists.
```

### Grading words in remark prompts:

Replace all A/B/C/D references in the original remark prompt with:
- "Advanced" instead of "Outstanding/A+"
- "Proficient" instead of "Excellent/A"
- "Developing" instead of "Satisfactory/B"
- "Beginning" instead of "Needs Improvement/C"
- "Not Yet" instead of "Unsatisfactory/D"

---

## ADDENDUM G — UPDATED FILE DELIVERY CHECKLIST

Add these to the master prompt's file checklist:

```
assessment-app/
  services/
    ✅ report-card-grade-engine.js   (UPDATED — new grading scale)
    ✅ report-card-aggregator.js     (UPDATED — dynamic criteria from engine)
    ✅ report-card-remark-engine.js  (UPDATED — new grade words + annual remark)
    ✅ report-card-builder.js        (UPDATED — both terms, annual summary)

pro-leo-site/
  ✅ report-card-student-view.js    (UPDATED — e-book view, both terms)
  ✅ report-card-admin.js           (UPDATED — promotion field, preview button)
  ✅ report-card-print.js           (NEW — buildPrintableHTML, self-contained)
```

`report-card-print.js` is a NEW dedicated file for all print logic.
It must be fully self-contained — no Firebase imports, no service dependencies.
It receives plain data objects and returns an HTML string.
This keeps print logic isolated and testable independently.

---

## HOW TO USE BOTH PROMPTS TOGETHER

When passing to Claude Code, combine as follows:

```
[MASTER PROMPT — full content of REPORT_CARD_MASTER_PROMPT.md]

---

[ADDENDUM — full content of REPORT_CARD_ADDENDUM.md]

---

INSTRUCTION TO CLAUDE CODE:
The Addendum takes precedence over the Master Prompt wherever they conflict.
Specifically:
- Use the Adv/Prof/Dev/Beg/NY/Ex grading scale (not A+/A/B/C/D)
- Use subject-loader.js and criteria-loader.js for all subject/criteria data
- Build the e-book print view (not a single-term print)
- Create report-card-print.js as a standalone print engine
All other instructions from the Master Prompt remain in full effect.
```

---

*Addendum for Project LEO — Report Card System*
*St. Francis de Sales School, Laitkor*
