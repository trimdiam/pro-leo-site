# SFDS Ecosystem Integration — Project Status

## Integration Overview

| App | Role | Repository |
|-----|------|------------|
| pro-leo-site | Main school management portal | `e:\PROJECT LEO 2\LATEST MAY 12\pro-leo-site` |
| assessment-app | Academic intelligence + assessment module | `e:\PROJECT 26\assessment-app` |

Both apps share:
- **Same Firebase Project:** `st-francis-school-a3e7e`
- **Same Firestore Database**
- **Same Authentication Ecosystem**
- **Same Student Identity System** (`student_id` as universal key)

---

## Completed Phases

### ✅ Phase 1 — Shared Firebase Foundation
**Date:** 2026-05-12

**Tasks Completed:**
- Inspected existing Firebase config in pro-leo-site
- Inspected current persistence structure in assessment-app
- Aligned Firebase SDK versions to **10.13.0** across both apps
- Added `assessment_sessions` collection to Firestore security rules
- Verified assessment-app already reads `students/` collection from shared Firestore
- Local JSON fallback preserved for offline resilience

**Files Modified:**
- `assessment-app/services/firebase-config.js` — SDK 10.13.0
- `assessment-app/services/student-loader.js` — SDK 10.13.0
- `assessment-app/services/firestore-service.js` — SDK 10.13.0
- `assessment-app/services/auth-service.js` — SDK 10.13.0
- `pro-leo-site/firestore.rules` — Added `assessment_sessions` rules

**Success Condition:** ✅ assessment-app successfully reads `students/` from the same Firebase backend used by pro-leo-site.

### ✅ Phase 2 — Shared Student Identity System
**Date:** 2026-05-12

**Tasks Completed:**
- Exported `CLASS_MAP` and `FIRESTORE_TO_DISPLAY_CLASS` from `student-loader.js` as canonical sources of truth
- Hardened `normalizeStudent()`: class field now always resolves to display name (e.g. `'Class I'` not `'1'`), `roll_no` always coerced to string, warning logged on missing `student_id`
- Fixed `analytics-engine.js` `getStudentAnalytics()` return contract: `studentId` key corrected to `student_id`
- Fixed `student-profile.js` fallback: `profile.studentId` → `profile.student_id`
- Removed stale `student?.studentId` fallback from `criteria-loader.js` `buildAssessmentStructure()`

**Files Modified:**
- `assessment-app/services/student-loader.js` — CLASS_MAP exported, FIRESTORE_TO_DISPLAY_CLASS added, normalizeStudent() hardened
- `assessment-app/services/analytics-engine.js` — corrected student_id return key
- `assessment-app/components/student-profile.js` — corrected student_id fallback
- `assessment-app/services/criteria-loader.js` — removed studentId fallback

**Success Condition:** ✅ Both apps recognize the SAME student using the SAME `student_id`. Normalized student objects always carry display-form class names and string roll numbers.

### ✅ Phase 3 — Assessment Data Persistence
**Date:** 2026-05-12

**Tasks Completed:**
- Added `persistMonthlyAnalytics`, `fetchMonthlyAnalytics`, `persistWeakStudents`, `fetchWeakStudents`, `persistStudentProfile`, `fetchStudentProfile` to `firestore-service.js`
- `aggregation-engine.js`: reads Firestore before computing (cross-device cache hit); writes to Firestore after computing
- `weak-student-engine.js`: new `detectAndPersistWeakStudents()` async wrapper writes flags to Firestore in background without changing synchronous callers
- `student-profile-engine.js`: writes computed profile to `student_profiles/{sanitizedStudentId}` in background on every `getStudentProfile()` call
- `session-review-engine.js`: on `reviewed` or `locked` transition, triggers forced recompute + Firestore persist for that class+month
- `pro-leo-site/firestore.rules`: added rules for `monthly_analytics`, `weak_students`, `student_profiles`; students can self-read their own profile document

**Files Modified:**
- `assessment-app/services/firestore-service.js`
- `assessment-app/services/aggregation-engine.js`
- `assessment-app/services/weak-student-engine.js`
- `assessment-app/services/student-profile-engine.js`
- `assessment-app/services/session-review-engine.js`
- `pro-leo-site/firestore.rules`

**Document ID conventions:**
- `monthly_analytics` + `weak_students`: `{yearMonth}_{className_spaces_as_underscores}` e.g. `2026-05_Class_I`
- `student_profiles`: studentId with slashes replaced by underscores e.g. `SFS_2025_001`

**Success Condition:** ✅ Assessment intelligence persists correctly in Firestore. Analytics survive device switches and browser clears.

### ✅ Phase 4 — Student Academic Profile Engine
**Date:** 2026-05-12

**Tasks Completed:**
- Created `services/student-snapshot-engine.js` with `buildStudentSnapshot(studentId, profile)`
- Snapshot shapes the full analytics profile into a lean, canonical document for cross-app reading
- Updated `services/student-profile-engine.js`: UI still receives the full profile; Firestore receives only the lean snapshot

**Snapshot document structure (`student_profiles/{sanitizedStudentId}`):**
```
studentId, student_id, full_name, class, roll_no
overallAverage, monthsTracked, totalSessions
strongestSubject: { subject_id, subject_name, averagePercentage }
weakestSubject:   { subject_id, subject_name, averagePercentage }
trendDirection, trendLabel, trendDelta
attendanceRisk (bool), attendanceRiskLevel
activeAlerts[], alertReasons[]
summaryText
lastUpdated
```

**Files Modified:**
- `assessment-app/services/student-snapshot-engine.js` — new file
- `assessment-app/services/student-profile-engine.js` — write snapshot not raw profile

**Success Condition:** ✅ Each student has a centralized, lean academic intelligence document in Firestore ready for pro-leo-site to read.

### ✅ Phase 5 — Main Portal Academic Snapshot
**Date:** 2026-05-12

**Tasks Completed:**
- Added `#s-academic-snapshot` div to `index.html` inside `#s-profile`, after `profile-info-grid`
- Added all snapshot card CSS to `styles.css` using existing CSS variable conventions
- Added `loadAcademicSnapshot(studentId)` async function to `app-logic.js`
- Wired call into `loadStudentProfile()` — non-blocking, fire-and-forget
- Document ID sanitization matches assessment-app convention: `SFS/2025/001` → `SFS_2025_001`

**Snapshot widget displays:**
- Overall average % + trend badge (↑ Improving / ↓ Declining / → Stable)
- Months tracked + total sessions
- Strongest subject name + %
- Weakest subject name + %
- Alert box (only shown if activeAlerts.length > 0)
- Summary text sentence
- "View Full Academic Report →" button (wired in Phase 6 via `window._academicAppUrl`)

**Graceful degradation:**
- No student_profiles doc → "Academic report not yet available" message
- Firestore error → "Could not load academic report" message
- Either state: rest of student portal completely unaffected

**Files Modified:**
- `pro-leo-site/index.html`
- `pro-leo-site/styles.css`
- `pro-leo-site/app-logic.js`

**Success Condition:** ✅ Student profile page displays academic intelligence snapshot read from Firestore.

### ⬜ Phase 6 — Full Report Deep-Link System
- Connect main portal to full assessment dashboard via deep links

### ⬜ Phase 7 — Shared Authentication Ecosystem
- Implement cross-app single sign-on

### ⬜ Phase 8 — Security Rules + Access Control
- Production-grade role-based security rules

### ⬜ Phase 9 — Ecosystem UX Refinement
- Unified branding, cross-app navigation

### ⬜ Phase 10 — Future Expansion Readiness
- Architecture prepared for parent portal, PDF reports, push notifications

---

## Shared Firestore Collections

| Collection | Location | Access |
|------------|----------|--------|
| `students` | Shared | Staff read, Admin/Office write |
| `teachers` | Shared | Public read, Admin write |
| `users` | Shared | Self + Admin read, Self write |
| `assessment_sessions` | Assessment app | Staff read, Teacher/Admin write |
| `attendance_daily` | pro-leo-site | Staff read, Teacher/Admin write |
| `attendance_monthly` | pro-leo-site | Staff read/write (with locking) |
| `fee_transactions` | pro-leo-site | Staff + Student read, Admin/Office write |
| `homework` | pro-leo-site | Auth read, Teacher/Admin write |
| `notices` | pro-leo-site | Public read, Admin/Teacher write |
| `events` | pro-leo-site | Public read, Admin write |
| `gallery` | pro-leo-site | Public read, Admin write |
| `announcements` | pro-leo-site | Public read, Admin write |
| `settings` | pro-leo-site | Public read, Admin write |
| `admissions` | pro-leo-site | Public create, Staff read/update, Admin delete |
| `contacts` | pro-leo-site | Public create, Admin read/write |
| `leave_applications` | pro-leo-site | Auth create, Staff read, Admin update |
| `newAccountLinks` | pro-leo-site | Auth create, Admin read |

---

## Legacy Assessment App Status

### Active Classes
- LKG, SKG, Class I, Class II

### Completed Stages (Pre-Integration)
1. Student Data Layer (JSON + Firestore hybrid)
2. Dynamic Subject System
3. Assessment Sessions with tap-to-fill grading
4. Admin & Intelligence (session status, aggregation, weak student detection)
5. Analytics & Visualization (Chart.js)
6. Auth, Roles, Profiles, Fast Entry

### Key Design Principles
- Mobile-first, low-end Android compatible
- Minimal typing, large tap targets
- Modular ES6 architecture — no framework dependencies except Chart.js
- `student_id` is the permanent primary key
- LocalStorage + Firestore hybrid for resilience
- Default score workflow (default = 4)

---

## Remaining Roadmap
- Phase 2–10 of ecosystem integration (see ROADMAP.md)
- Report Card Generation (after Phase 6)
- Parent Portal (Phase 10+)
- PDF Report Cards (Phase 10+)
- Realtime Alerts & Push Notifications (Phase 10+)
- Mobile App (Phase 10+)
