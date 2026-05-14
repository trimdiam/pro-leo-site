# SFS Connect — Project Handoff Summary
**Date:** 2026-05-14  
**Project:** St. Francis De Sales School — SFS Connect (Main Portal)  
**Firebase Project ID:** `sfs-laitkor-app`  
**Repo:** `pro-leo-site` (branch: `main`, user: `trimdiam`)

---

## What Was Built in This Session

### Phase 1 — Admin Portal: Teacher Assignment System ✅

A full teacher assignment UI was added inside the existing Admin Portal (`index.html`).

**Sidebar nav entry:**
```
"Teacher Assignments" → showDash('a','a-teacher-assign',this); loadTeacherAssignList()
```

**Screen 1 — Teacher List (`#a-teacher-assign`)**
- Fetches all docs from `/teachers` collection
- Renders cards with role badges: Admin (gold), Class Teacher (green), Subject Teacher (blue), Unassigned (grey)
- Subject summary on each card (e.g. "Mathematics (III, IV, V)")
- Search/filter by name, email, or subject
- `[Assign →]` opens the slide-in panel

**Screen 2 — Assignment Slide-in Panel (`#ta-panel`)**
- Section A: Role radio (Subject Teacher / Class Teacher / Admin)
- Section B: Class Teacher dropdown (reveals on role = class_teacher), with live conflict warning from `/classes/{id}`
- Section C: Subject dropdown — dynamically built from `CONFIG[classNum].subjects`, **aggregates strictly excluded**
- Quick multi-class helper — add same subject across multiple classes at once, filtered by valid class-subject combos
- Assignment table — remove rows with ✕
- Duplicate prevention

**Save logic — Firestore batch write (all or nothing):**
1. `/teachers/{docId}` → `role`, `classTeacherOf`, `assignments[]`, `updatedAt`
2. Old `/classes/{oldId}` → clears `classTeacherId`, `classTeacherName`
3. New `/classes/{newId}` → sets `classTeacherId`, `classTeacherName`

**Key decisions made:**
- School has ONE section only — section field removed everywhere, hardcoded `"A"` internally but not displayed
- `classTeacherOf` stored as just the class name e.g. `"X"` (not `"X-A"`)
- Assignment objects: `{ class, subjectKey, subjectLabel }` (no section field)

---

### Phase 2 — Teacher Portal: Reflect Assignments ✅

**Sidebar nav entry added:**
```
"My Subjects" → showDash('t','t-my-subjects',this)
```

**`#t-my-subjects` section:**
- **My Class card** (class_teacher only) — shows classTeacherOf, View Student List + Review & Lock Records buttons
- **My Subjects table** — Class | Subject | `[Enter Marks →]` button
  - Buttons have `data-class-id` and `data-subject-key` attributes (ready for Phase 3 markentry wiring)
  - Empty state: different message for class-teacher-only vs unassigned
- `onSnapshot` on `/teachers/{docId}` — live update toast if admin changes assignments while teacher is logged in

**Portal data patch (critical fix):**  
`loadTeacherPortal` originally read old `classTeacher` (Arabic number) and `subjects` (string) fields. A patch was added (at bottom of `app-logic.js`) that:
1. Reads new `role`, `classTeacherOf`, `assignments` from Phase 1 fields
2. Converts Roman numeral → Arabic via `TA_ROMAN_TO_NUM` map for student/attendance queries
3. **Strips legacy `-A` suffix** from `classTeacherOf` before lookup (`.split('-')[0]`)
4. Re-fetches student list for correct class via `window.renderTeacherStudentList`
5. Re-inits attendance via `window.initTeacherAttendance`
6. Updates all header/stat UI: dash subtitle, `.dash-role`, stat cards, class headings

---

## Files Modified

| File | What Changed |
|------|-------------|
| `index.html` | Admin sidebar + `#a-teacher-assign` section + slide-in panel HTML; Teacher sidebar "My Subjects" button + `#t-my-subjects` section; `#t-dash-subtitle` ID added |
| `styles.css` | `.admin-ta-*` namespace (cards, panel, badges, selects, multi-helper); `.tp-assign-*` namespace (subjects table, empty state, enter-marks button, live toast) |
| `app-logic.js` | Teacher Assignment JS module + Phase 2 reflect assignments module appended at bottom; `renderTeacherStudentList` exposed on `window` |
| `config.js` | Copied from report card project; Class I & II added (7 subjects each); SKG/LKG/Playgroup as commented placeholders; `window.CONFIG = CONFIG` added at end (required for ES module access) |
| `firestore.rules` | `/classes/{docId}` rule added: `allow read: if isAnyStaff(); allow write: if isAdmin()` |

---

## CONFIG Object (config.js)

Located at: `E:\LEO ECO\pro-leo-site\config.js`  
Original source: `E:\LEO ECO\Report-card-2026\sfds-reportcard\js\config.js`

**Classes covered:** I, II, III, IV, V, VI, VII, VIII, IX, X  
**Placeholders:** Playgroup, SKG, LKG (commented out)

| Class | markScheme | grandTotalMax | passmark | Notes |
|-------|-----------|--------------|---------|-------|
| I, II | standard | 700 | 40 | 7 subjects (no computer, no social studies) |
| III | standard | 800 | 40 | 8 subjects |
| IV, V | standard | 900 | 40 | 9 subjects |
| VI | standard | 800 | 40 | Has health_education (different key from h_education) |
| VII, VIII | standard | 700 | 40 | No hindi, has h_education |
| IX, X | senior | 600 | 30 | PCB + S.Science aggregates |

**Aggregate subjects (never assignable to teachers):**
- VI–VIII: `s_science` (G+C+H), `english_i_ii`
- IX–X: `science_pcb` (P+C+B), `s_science` (G+C+H+E), `english_i_ii`

---

## Firestore Data Structure (New Fields)

### `/teachers/{docId}`
```javascript
{
  // Existing fields (old system)
  name, email, teacherId, title, gender, classTeacher, subjects, ...

  // New fields added by Phase 1
  role: "class_teacher" | "subject_teacher" | "admin",
  classTeacherOf: "X",           // Roman numeral class name, NO section suffix
  assignments: [
    { class: "X", subjectKey: "mathematics", subjectLabel: "Mathematics" },
    { class: "IX", subjectKey: "mathematics", subjectLabel: "Mathematics" }
  ],
  updatedAt: timestamp
}
```

### `/classes/{classId}`  e.g. `"X"`
```javascript
{
  classTeacherId: "firestore_doc_id_of_teacher",
  classTeacherName: "Ms. Asha Mary Nongkhlaw"
  // merged with existing class doc fields
}
```

---

## Known Issues / Things to Watch

1. **Teachers saved BEFORE section was removed** may have `classTeacherOf: "X-A"` instead of `"X"`. The portal patch handles this by stripping `-A` via `.split('-')[0]`. **Re-save those teachers from Admin → Teacher Assignments to clean up Firestore.**

2. **Firestore rules** — `/classes` rule was added but must be deployed:
   ```
   firebase deploy --only firestore:rules
   ```

3. **`window.CONFIG`** — `config.js` uses `const CONFIG` which doesn't auto-attach to `window`. The line `window.CONFIG = CONFIG` at the bottom of `config.js` is required for the ES module (`app-logic.js`) to access it.

4. **`[Enter Marks →]` buttons** in Teacher Portal My Subjects are wired but show a toast placeholder. Full wiring happens in Phase 3 (mark entry bridge).

---

## Next Steps (Planned)

### Phase 3 — Bridge: Assignment Data → Mark Entry Module
- `markentry.js` loads assignments from Firestore (not hardcoded)
- URL param preloading: `?classId=X&subject=mathematics&term=HY`
- `singleTotal` detection for Spelling-type subjects
- `passmark` from `CONFIG[classNum].passmark` (30 for IX/X)
- Wire `[Enter Marks →]` buttons in Teacher Portal to navigate to markentry.html

### Integration with Report Card Standalone App
- Report card app lives at: `E:\LEO ECO\Report-card-2026\sfds-reportcard\`
- Uses the same `CONFIG` object (already synced to main portal)
- Same Firebase project (`sfs-laitkor-app`) — shares Firestore collections
- Mark entry data path: `/marks/{classId_term}/{studentId}/academics/{subjectKey}`

---

## Master Prompt Documents
- `SFS_ADMIN_TEACHER_ASSIGNMENT_PROMPT.md` — full spec for Phases 1–3 of teacher assignment system
- `SFS_MARK_ENTRY_MASTER_PROMPT.md` — full spec for mark entry module (referenced but not provided this session)

---

*Generated: 2026-05-14 | Session: Teacher Assignment System (Phase 1 & 2)*
