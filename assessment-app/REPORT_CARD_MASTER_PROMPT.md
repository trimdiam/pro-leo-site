# REPORT CARD SYSTEM — MASTER IMPLEMENTATION PROMPT
# ST. FRANCIS DE SALES SCHOOL, LAITKOR
# Project LEO — Assessment Ecosystem Integration

---

## READ THIS FIRST — BEFORE WRITING A SINGLE LINE OF CODE

You are working inside a **production school management ecosystem** with two connected apps:

| App | Path | Role |
|-----|------|------|
| `assessment-app` | `e:\PROJECT 26\assessment-app` | Weekly assessment engine, teacher/admin panel |
| `pro-leo-site` | `e:\PROJECT LEO 2\LATEST MAY 12\pro-leo-site` | Main school portal, student/admin/staff |

Both apps share:
- Firebase Project: `st-francis-school-a3e7e`
- Same Firestore database
- Same Firebase Auth
- Same `student_id` as universal key (format: `SFS/YYYY/NNN`)
- Firebase SDK version: `10.13.0`
- Vanilla HTML + ES6 modules — NO frameworks, NO bundlers

**DO NOT:**
- Introduce React, Vue, or any frontend framework
- Use npm packages beyond what is already in the project
- Modify any of these engines (they are production-stable):
  - `aggregation-engine.js`
  - `analytics-engine.js`
  - `comparison-engine.js`
  - `narrative-summary-engine.js`
  - `weak-student-engine.js`
- Change existing Firestore collection structures
- Remove or rename any existing fields
- Minify any code — all files must be human-readable

**DO:**
- Write clean, modular ES6 — one responsibility per file
- Follow the existing code style (see `main.js` for reference)
- Add JSDoc comments on every exported function
- Preserve backward compatibility with all existing data
- Write all files unminified with clear section comments

---

## SYSTEM ARCHITECTURE — REPORT CARD FLOW

```
ASSESSMENT APP (Admin triggers generation)
        │
        ▼
[1] report-card-aggregator.js
        │  Reads all reviewed/locked sessions for a student
        │  in the specified half-year window
        │  Groups by subject → criteria
        │  Computes average score per criterion (1–5 scale)
        │
        ▼
[2] report-card-grade-engine.js
        │  Maps average scores to grades (A+/A/B/C/D/AB)
        │  Computes subject-level grade
        │  Computes overall performance grade
        │  Flags attendance risk
        │
        ▼
[3] report-card-remark-engine.js
        │  Calls Claude API (claude-sonnet-4-20250514)
        │  Passes student profile: grades, trend, strongest,
        │  weakest, attendance, class
        │  Receives human-like, kind, adaptive remark
        │  250–300 characters
        │
        ▼
[4] report-card-builder.js
        │  Assembles final report card document object
        │  Writes to Firestore: report_cards/{studentId}_{term}
        │  Status: "draft"
        │
        ▼
FIRESTORE — report_cards collection
        │
        ▼
PRO-LEO-SITE — Admin Panel
        │
[5] report-card-admin-panel.js (pro-leo-site)
        │  Lists all report cards by class + term
        │  Shows: student name, class, status, fee clearance
        │  Admin can edit teacher remark before release
        │  Admin clicks "Release" → status: "released"
        │  Fee gate: checks fee_transactions balance
        │
        ▼
PRO-LEO-SITE — Student Portal
        │
[6] report-card-student-view.js (pro-leo-site)
        │  Student logs in → Report Card tab visible
        │  Fetches only released cards for their student_id
        │  Renders print-ready card
        │  Print / download button
```

---

## PHASE A — ASSESSMENT APP: REPORT CARD ENGINES

### Location: `assessment-app/services/`

---

### FILE 1: `report-card-aggregator.js`

**Purpose:** Reads and aggregates all finalized sessions for a student within a date range.

**Exports:**
```javascript
/**
 * Aggregates all reviewed/locked session marks for a student
 * across a given half-year window.
 *
 * @param {string} studentId - Universal student ID e.g. "SFS/2025/001"
 * @param {string} dateFrom  - ISO date string "2025-04-01"
 * @param {string} dateTo    - ISO date string "2025-09-30"
 * @returns {Promise<AggregatedStudentData>}
 */
export async function aggregateStudentForReportCard(studentId, dateFrom, dateTo)
```

**Logic:**
1. Call `getAllSessions()` from `session-storage.js`
2. Filter: `status === 'reviewed' || status === 'locked'`
3. Filter: `session.weekStart >= dateFrom && session.weekEnd <= dateTo`
4. Filter: student appears in session marks (`marks[studentId]` exists)
5. Group sessions by `subject_id`
6. For each subject, group marks by `criterion_id`
7. For each criterion, collect all non-null, non-absent scores
8. Compute: `averageScore = sum / count` (ignore absent entries in average)
9. Count total absent marks per criterion
10. Return structured object:

```javascript
{
  studentId: "SFS/2025/001",
  dateFrom: "2025-04-01",
  dateTo: "2025-09-30",
  totalSessionsIncluded: 12,
  subjects: [
    {
      subject_id: "math",
      subject_name: "Mathematics",
      criteria: [
        {
          criterion_id: "math_c1",
          criterion_name: "Number Recognition",
          scores: [4, 5, 3, 5],
          absentCount: 0,
          averageScore: 4.25,
          sessionCount: 4
        }
      ]
    }
  ]
}
```

**BACKWARD COMPATIBILITY:**
- Sessions without `weekStart` → use `session.date` as both start and end
- Sessions without `subject_id` → skip with console.warn
- Missing `marks[studentId]` → skip that session silently

---

### FILE 2: `report-card-grade-engine.js`

**Purpose:** Converts average scores to grades and computes subject/overall performance.

**Grade Scale (1–5 system):**
```
4.5 – 5.0  →  A+  Outstanding
3.5 – 4.4  →  A   Excellent
2.5 – 3.4  →  B   Satisfactory
1.5 – 2.4  →  C   Needs Improvement
0.0 – 1.4  →  D   Unsatisfactory
No scores  →  AB  Absent / Not Assessed
```

**Exports:**
```javascript
/**
 * Maps a numeric average score to a grade descriptor.
 * @param {number|null} averageScore
 * @returns {{ grade: string, label: string, numericValue: number }}
 */
export function mapScoreToGrade(averageScore)

/**
 * Grades all criteria within a subject and computes subject-level grade.
 * @param {object} subjectData - From aggregateStudentForReportCard output
 * @returns {GradedSubject}
 */
export function gradeSubject(subjectData)

/**
 * Computes overall performance grade across all subjects.
 * Identifies strongest subject, weakest subject, flagged criteria.
 * @param {GradedSubject[]} gradedSubjects
 * @returns {OverallPerformance}
 */
export function computeOverallPerformance(gradedSubjects)
```

**Output shape of `computeOverallPerformance`:**
```javascript
{
  overallAverageScore: 3.8,
  overallGrade: "A",
  overallLabel: "Excellent",
  strongestSubject: { subject_name: "Mathematics", averageScore: 4.6, grade: "A+" },
  weakestSubject:   { subject_name: "English", averageScore: 2.8, grade: "B" },
  flaggedCriteria: [
    { subject_name: "English", criterion_name: "Writing", grade: "C" }
  ],
  improvementAreas: ["Writing in English", "EVS Observation Skills"]
}
```

---

### FILE 3: `report-card-remark-engine.js`

**Purpose:** Calls Claude API to generate an intelligent, human-like, adaptive teacher remark.

**CRITICAL IMPLEMENTATION NOTES:**
- Use `claude-sonnet-4-20250514` model
- `max_tokens: 200`
- Remark must be 250–300 characters (enforce with retry if under 200 or over 320)
- Remark must be warm, kind, encouraging — teacher-to-parent voice
- Must mention at least one strength and one area to improve
- Must NOT sound robotic or list-like
- Must NOT use the student's ID — use first name only
- Tone adapts to performance level:
  - A+/A overall → celebratory but challenging ("...keep reaching higher")
  - B overall → encouraging, balanced
  - C overall → warm, supportive, focus on specific growth
  - D overall → gentle, hopeful, actionable

**Exports:**
```javascript
/**
 * Generates an intelligent teacher remark via Claude API.
 *
 * @param {object} studentProfile
 * @param {string} studentProfile.firstName         - Student first name only
 * @param {string} studentProfile.className         - e.g. "Class I"
 * @param {string} studentProfile.overallGrade      - e.g. "A"
 * @param {string} studentProfile.overallLabel      - e.g. "Excellent"
 * @param {number} studentProfile.overallAverageScore
 * @param {string} studentProfile.strongestSubject  - subject name
 * @param {string} studentProfile.weakestSubject    - subject name
 * @param {string[]} studentProfile.improvementAreas - criterion names
 * @param {string} studentProfile.trendDirection    - "improving"|"declining"|"stable"
 * @param {boolean} studentProfile.attendanceRisk
 * @param {string} studentProfile.term              - "First Half" | "Second Half"
 * @returns {Promise<string>} - The remark text, 250–300 characters
 */
export async function generateTeacherRemark(studentProfile)
```

**Claude API prompt template to use inside the function:**

```
You are a warm, experienced, and caring class teacher at a Catholic school in Meghalaya, India.
Write a progress remark for a student's half-yearly report card.
This will be read by the child's parents.

Student: {firstName}, {className}
Term: {term}
Overall Performance: {overallLabel} ({overallGrade})
Average Score: {overallAverageScore}/5
Strongest Area: {strongestSubject}
Weakest Area: {weakestSubject}
Areas needing focus: {improvementAreas joined by ", "}
Performance trend: {trendDirection}
Attendance concern: {attendanceRisk ? "yes" : "no"}

Write ONE short paragraph. 
Rules:
- Exactly 250 to 300 characters including spaces
- Warm, kind, teacher-to-parent tone
- Mention the child's strength naturally
- Gently highlight area to improve
- End with encouragement
- No bullet points, no lists, no robotic phrasing
- Do not repeat the student's name more than once
- Do not start with "I"
```

**Retry logic:**
- If response is under 200 characters → retry once with "expand slightly"
- If response is over 320 characters → retry once with "shorten slightly"
- If second attempt also fails bounds → trim/pad and return with console.warn

**Fallback (if API call fails):**
```javascript
return `${firstName} has shown ${overallLabel.toLowerCase()} progress this term. 
${strongestSubject} is a clear strength. Continued focus on ${weakestSubject} 
will help achieve even better results. Keep up the great effort!`
  .substring(0, 300);
```

---

### FILE 4: `report-card-builder.js`

**Purpose:** Assembles the complete report card object and persists it to Firestore.

**Exports:**
```javascript
/**
 * Builds and saves a complete report card for one student.
 *
 * @param {object} params
 * @param {string} params.studentId    - Universal student ID
 * @param {string} params.term         - "HY1" | "HY2" | "Annual"
 * @param {string} params.academicYear - "2025-26"
 * @param {string} params.dateFrom     - ISO date
 * @param {string} params.dateTo       - ISO date
 * @param {string} params.generatedBy  - Admin user name
 * @returns {Promise<{ ok: boolean, docId: string, error?: string }>}
 */
export async function buildAndSaveReportCard(params)
```

**Document ID convention:**
```
report_cards/{sanitizedStudentId}_{term}
e.g. SFS_2025_001_HY1
```
Sanitize: replace `/` and spaces with `_`

**Complete Firestore document structure:**
```javascript
{
  // Identity
  studentId:       "SFS/2025/001",
  docId:           "SFS_2025_001_HY1",
  studentName:     "John Doe",
  firstName:       "John",
  className:       "Class I",
  rollNo:          "01",
  section:         "",

  // Term
  term:            "HY1",
  termLabel:       "First Half-Yearly",
  academicYear:    "2025-26",
  dateFrom:        "2025-04-01",
  dateTo:          "2025-09-30",

  // Grades
  subjects: [
    {
      subject_id:     "math",
      subject_name:   "Mathematics",
      subjectGrade:   "A",
      subjectAverage: 4.1,
      criteria: [
        {
          criterion_id:   "math_c1",
          criterion_name: "Number Recognition",
          averageScore:   4.25,
          grade:          "A",
          label:          "Excellent",
          sessionCount:   4,
          absentCount:    0
        }
      ]
    }
  ],

  // Overall
  overallAverageScore:  3.8,
  overallGrade:         "A",
  overallLabel:         "Excellent",
  strongestSubject:     "Mathematics",
  weakestSubject:       "English",
  improvementAreas:     ["Writing in English"],
  trendDirection:       "improving",
  attendanceRisk:       false,

  // Remark
  teacherRemark:        "...",    // From remark engine
  remarkGeneratedByAI:  true,
  remarkEditedByAdmin:  false,

  // Attendance (placeholder — filled by admin if needed)
  attendancePresentDays: null,
  attendanceWorkingDays: null,

  // Workflow
  status:          "draft",       // "draft" | "ready" | "released"
  feesCleared:     false,
  generatedBy:     "Admin Name",
  generatedAt:     serverTimestamp(),
  releasedBy:      null,
  releasedAt:      null,
  lastModifiedAt:  serverTimestamp()
}
```

**Internal flow of `buildAndSaveReportCard`:**
1. Load student from Firestore `students/{studentId}` → get name, class, roll
2. Call `aggregateStudentForReportCard(studentId, dateFrom, dateTo)`
3. Grade each subject via `gradeSubject()`
4. Call `computeOverallPerformance(gradedSubjects)`
5. Call `generateTeacherRemark(profile)` — await
6. Assemble complete document
7. Write to `report_cards/{docId}` with `setDoc(..., { merge: false })`
8. Return `{ ok: true, docId }`

---

### FILE 5: `report-card-generator-ui.js` (component)

**Location:** `assessment-app/components/report-card-generator-ui.js`

**Purpose:** Admin UI inside assessment-app to trigger report card generation.

**Renders inside Admin panel — new tab: "Report Cards"**

**UI Elements:**
- Class selector dropdown (LKG, SKG, Class I, Class II)
- Term selector: First Half (HY1) / Second Half (HY2)
- Academic year display (auto-computed from current date)
- Date range: auto-filled based on term selection
  - HY1: April 1 – September 30
  - HY2: October 1 – March 31
- "Generate for Entire Class" button
- Progress indicator: "Generating 1 of 24..."
- Student-level result list:
  - ✅ John Doe — Generated
  - ⚠ Jane Doe — No sessions found
  - ❌ Peter Pan — API error (retry button)
- "View Generated Cards" link

**Generation flow:**
1. Load all students for selected class
2. For each student: call `buildAndSaveReportCard()`
3. Show live progress
4. Skip students with zero finalized sessions (show warning)
5. Do NOT block on individual failures — continue to next student

Add this tab to `main.js` `renderAdmin()` section as a new `adminView` option:
```javascript
{ key: 'reportcards', label: 'Report Cards' }
```

---

## PHASE B — PRO-LEO-SITE: ADMIN RELEASE PANEL

### Location: `pro-leo-site/`

---

### FILE 6: `report-card-admin.js`

**Purpose:** Admin panel section for reviewing, editing remarks, and releasing report cards.

**Wire into:** The existing admin section of `pro-leo-site/app-logic.js`
Look for the admin navigation section and add "Report Cards" as a new panel/tab.

**UI Sections:**

#### Section 1 — Filter Bar
- Class filter dropdown
- Term filter dropdown  
- Status filter: All / Draft / Ready / Released
- "Refresh" button

#### Section 2 — Report Card Table
Columns:
```
Roll | Student Name | Class | Term | Overall | Fee Status | Card Status | Actions
```

- **Fee Status** badge:
  - Check `fee_transactions` collection for this `studentId`
  - If any unpaid transaction exists → 🔴 Fees Pending
  - If all cleared or no transactions → 🟢 Fees Clear
  - Fee check logic: sum all `fee_transactions` where `studentId` matches
    and `status !== 'paid'` — if sum > 0 → pending

- **Card Status** badge:
  - 🟡 Draft — generated, not reviewed
  - 🔵 Ready — admin marked as ready
  - 🟢 Released — visible to student

- **Actions column:**
  - "Edit Remark" → inline text editor for `teacherRemark`
  - "Mark Ready" → status: "ready"
  - "Release" → only enabled if `feesCleared === true`
    - On click: confirm dialog → set `status: "released"`, `releasedBy`, `releasedAt`
  - "Revoke" → set status back to "ready" (for already released cards)

#### Section 3 — Bulk Actions
- "Release All (Fees Cleared)" button → releases all cards where feesCleared=true and status=ready
- "Refresh Fee Status" → re-checks fee_transactions for all listed students

**Fee clearance update logic:**
When admin opens this panel, automatically run fee check for all students in the filtered list and update `feesCleared` field on each `report_cards` document accordingly.

---

### FILE 7: `report-card-styles.css`

**Location:** Add styles to `pro-leo-site/styles.css` (append at end, clearly sectioned)

OR create `pro-leo-site/report-card-styles.css` and import in HTML.

**Style conventions — MUST follow existing CSS variable system:**
```css
/* Use existing variables from pro-leo-site/styles.css */
var(--primary)
var(--accent)
var(--bg)
var(--card-bg)
var(--text)
var(--text-muted)
var(--border)
var(--radius)
var(--shadow)
```

**Key components to style:**
- `.rc-table` — report card admin table
- `.rc-status-badge` — colored status badges
- `.rc-fee-badge` — fee status indicator
- `.rc-release-btn` — release button (disabled state when fees pending)
- `.rc-remark-editor` — inline textarea for remark editing
- `.rc-print-card` — print-ready report card layout (see Phase C)

---

## PHASE C — PRO-LEO-SITE: STUDENT VIEW

### Location: `pro-leo-site/`

---

### FILE 8: `report-card-student-view.js`

**Purpose:** Student-facing report card viewer in the student portal.

**Wire into:** Student portal section of `pro-leo-site/app-logic.js`
Add "My Report Card" to the student navigation (alongside existing tabs like Fees, Homework).

**Fetch logic:**
```javascript
// Only load released cards for the logged-in student
const snapshot = await getDocs(
  query(
    collection(db, 'report_cards'),
    where('studentId', '==', currentStudentId),
    where('status', '==', 'released')
  )
);
```

**UI Layout — Per Card:**

```
┌────────────────────────────────────────────────────┐
│         ST. FRANCIS DE SALES SCHOOL, LAITKOR        │
│              HALF-YEARLY PROGRESS REPORT            │
│                     2025 – 2026                     │
├────────────────────────────────────────────────────┤
│  Name: John Doe          Class: Class I  Roll: 01  │
│  Term: First Half-Yearly (April – September 2025)  │
├────────────────────────────────────────────────────┤
│  SCHOLASTIC ASSESSMENT                             │
│                                                    │
│  MATHEMATICS                          Grade: A     │
│  ┌─────────────────────────────┬──────┬──────────┐ │
│  │ Criterion                   │ Avg  │  Grade   │ │
│  ├─────────────────────────────┼──────┼──────────┤ │
│  │ Number Recognition          │ 4.3  │   A      │ │
│  │ Counting & Sequences        │ 4.8  │   A+     │ │
│  │ Shape Identification        │ 3.6  │   A      │ │
│  └─────────────────────────────┴──────┴──────────┘ │
│                                                    │
│  [... repeat for each subject ...]                 │
├────────────────────────────────────────────────────┤
│  OVERALL PERFORMANCE:  A  —  Excellent             │
│  TREND:  ↑ Improving                               │
├────────────────────────────────────────────────────┤
│  TEACHER'S REMARK:                                 │
│  John has shown excellent progress this term...    │
├────────────────────────────────────────────────────┤
│  Attendance:  Present: ___  /  Working Days: ___   │
├────────────────────────────────────────────────────┤
│  Class Teacher: ____________                       │
│  Principal:     ____________                       │
│                                                    │
│         [🖨 Print Report Card]                     │
└────────────────────────────────────────────────────┘
```

**Print functionality:**
```javascript
function printReportCard(docId) {
  const printWindow = window.open('', '_blank');
  printWindow.document.write(buildPrintableHTML(cardData));
  printWindow.document.close();
  printWindow.print();
}
```

`buildPrintableHTML` must generate a self-contained HTML string with:
- Inline CSS (no external dependencies)
- A4 page sizing via `@media print`
- School letterhead (text-based, no image dependency)
- Grade color coding: A+ = green, A = blue, B = yellow, C = orange, D = red

---

## PHASE D — FIRESTORE SECURITY RULES

### Location: `pro-leo-site/firestore.rules`

**Append these rules to the existing rules file:**

```javascript
// =============================================
// REPORT CARDS
// =============================================

match /report_cards/{docId} {

  // Admin: full read/write
  allow read, write: if isAdmin();

  // Staff (teachers): read only
  allow read: if isStaff();

  // Students: read ONLY their OWN released cards
  allow read: if isStudent()
    && resource.data.studentId == getUserStudentId()
    && resource.data.status == 'released';

  // No public access
}
```

Helper functions (add if not already present):
```javascript
function isAdmin() {
  return request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}

function isStaff() {
  return request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'teacher', 'office'];
}

function isStudent() {
  return request.auth != null
    && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'student';
}

function getUserStudentId() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.student_id;
}
```

---

## FIRESTORE COLLECTION SPEC

### New Collection: `report_cards`

| Field | Type | Notes |
|-------|------|-------|
| studentId | string | "SFS/2025/001" |
| docId | string | "SFS_2025_001_HY1" |
| studentName | string | Full name |
| firstName | string | First name for remark engine |
| className | string | "Class I" |
| rollNo | string | "01" |
| term | string | "HY1" / "HY2" |
| termLabel | string | "First Half-Yearly" |
| academicYear | string | "2025-26" |
| dateFrom | string | ISO date |
| dateTo | string | ISO date |
| subjects | array | See structure above |
| overallAverageScore | number | |
| overallGrade | string | |
| overallLabel | string | |
| strongestSubject | string | |
| weakestSubject | string | |
| improvementAreas | array | string[] |
| trendDirection | string | |
| attendanceRisk | boolean | |
| attendancePresentDays | number / null | Admin fills |
| attendanceWorkingDays | number / null | Admin fills |
| teacherRemark | string | AI-generated, admin-editable |
| remarkGeneratedByAI | boolean | |
| remarkEditedByAdmin | boolean | |
| status | string | "draft"/"ready"/"released" |
| feesCleared | boolean | |
| generatedBy | string | Admin name |
| generatedAt | timestamp | |
| releasedBy | string / null | |
| releasedAt | timestamp / null | |
| lastModifiedAt | timestamp | |

---

## INTEGRATION CHECKPOINTS

After all files are written, verify these integration points:

### In `assessment-app/main.js`:
```javascript
// Add to imports at top
import { createReportCardGeneratorUI } from './components/report-card-generator-ui.js';

// Add to tabDefs array in renderAdmin():
{ key: 'reportcards', label: 'Report Cards' }

// Add to admin view switch:
} else if (state.adminView === 'reportcards') {
  renderAdminReportCards();
}

// Add render function:
function renderAdminReportCards() {
  assessmentRoot.append(createReportCardGeneratorUI({
    classes,
    currentUser: getCurrentUser()
  }));
}
```

### In `pro-leo-site/app-logic.js`:
```javascript
// Wire admin report card panel into admin navigation
// Wire student report card view into student portal navigation
// Both imports as ES6 modules
```

### In `pro-leo-site/index.html`:
```html
<!-- Add module script imports for report card components -->
<!-- Add #report-card-admin-root div in admin section -->
<!-- Add #report-card-student-root div in student section -->
```

---

## FILE DELIVERY CHECKLIST

```
assessment-app/
  services/
    ✅ report-card-aggregator.js      (new)
    ✅ report-card-grade-engine.js    (new)
    ✅ report-card-remark-engine.js   (new)
    ✅ report-card-builder.js         (new)
  components/
    ✅ report-card-generator-ui.js    (new)

pro-leo-site/
  ✅ report-card-admin.js             (new)
  ✅ report-card-student-view.js      (new)
  ✅ report-card-styles.css           (new, or appended to styles.css)
  ✅ firestore.rules                  (modified — rules appended)
  ✅ index.html                       (modified — divs + script imports added)
  ✅ app-logic.js                     (modified — new views wired in)
```

---

## CORE PRINCIPLES — REPEAT FOR EMPHASIS

1. **One engine, one responsibility** — no file does more than one job
2. **All code unminified** — readable, commented, maintainable
3. **No framework dependencies** — vanilla ES6 modules only
4. **Backward compatible** — existing sessions, students, data untouched
5. **Graceful degradation** — if remark API fails, fallback remark is used; if no sessions found, card is skipped; if Firestore write fails, error is shown but generation continues for other students
6. **Same CSS variable system** — report card styles use existing design tokens
7. **Student sees nothing until admin releases** — status gate is enforced both in Firestore rules AND in UI query filters
8. **Fee gate is non-blocking for admin** — admin CAN release even with fees pending (admin override), but the Release button shows a warning: "Fees are pending for this student. Release anyway?"

---

## ACADEMIC YEAR AUTO-COMPUTATION

```javascript
/**
 * Returns academic year string based on current date.
 * School year: April – March
 * e.g. If today is May 2026 → "2025-26"
 *      If today is January 2026 → "2025-26"
 *      If today is April 2026 → "2026-27"
 */
export function getCurrentAcademicYear() {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-indexed
  const year = now.getFullYear();
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(2)}`;
  } else {
    return `${year - 1}-${String(year).slice(2)}`;
  }
}

/**
 * Returns date range for a given term in the current academic year.
 * @param {"HY1"|"HY2"} term
 * @returns {{ dateFrom: string, dateTo: string, termLabel: string }}
 */
export function getTermDateRange(term) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startYear = month >= 4 ? year : year - 1;

  if (term === 'HY1') {
    return {
      dateFrom: `${startYear}-04-01`,
      dateTo:   `${startYear}-09-30`,
      termLabel: 'First Half-Yearly'
    };
  } else {
    return {
      dateFrom: `${startYear}-10-01`,
      dateTo:   `${startYear + 1}-03-31`,
      termLabel: 'Second Half-Yearly'
    };
  }
}
```

---

## START HERE

Begin implementation in this exact order:

```
1. report-card-aggregator.js
2. report-card-grade-engine.js
3. report-card-remark-engine.js
4. report-card-builder.js
5. report-card-generator-ui.js
6. report-card-admin.js (pro-leo-site)
7. report-card-student-view.js (pro-leo-site)
8. report-card-styles.css (pro-leo-site)
9. firestore.rules (append rules)
10. Wire into main.js (assessment-app)
11. Wire into app-logic.js + index.html (pro-leo-site)
```

Do not skip ahead. Each file depends on the previous one.
Test each engine function independently before wiring into the UI.
```

---

*Generated for Project LEO — St. Francis de Sales School, Laitkor*
*Half-Yearly Report Card System — Full Ecosystem Integration*
