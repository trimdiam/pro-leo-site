# SFDS Ecosystem Integration Roadmap

## Phase-Based Implementation

### ✅ Phase 1 — Shared Firebase Foundation
**Status:** COMPLETE  
**Date:** 2026-05-12

- [x] Inspect existing Firebase config in pro-leo-site
- [x] Inspect current persistence structure in assessment-app
- [x] Create modular Firebase integration layer in assessment-app
- [x] Connect shared Firestore
- [x] Connect shared Authentication
- [x] Verify shared students collection access
- [x] Align Firebase SDK versions (10.12.0 → 10.13.0)
- [x] Add assessment_sessions to Firestore security rules
- [x] Update documentation

**Success Condition:** assessment-app successfully reads `students/` from the same Firebase backend used by pro-leo-site. ✅

**Migration Checkpoint:**
- Both apps now use identical Firebase config
- `student-loader.js` queries Firestore `students` collection with local JSON fallback
- Firestore rules allow `assessment_sessions` read/write for teachers/admin
- LocalStorage + Firestore hybrid persistence operational

---

### ✅ Phase 2 — Shared Student Identity System
**Status:** COMPLETE
**Date:** 2026-05-12

- [x] Inspect student structures in both apps
- [x] Normalize `student_id` field names across assessment-app
- [x] Ensure analytics use `student_id` (fixed return contract in analytics-engine.js)
- [x] Ensure student profile component uses `student_id`
- [x] Remove stale `studentId` fallbacks from criteria-loader.js
- [x] Document universal key contract via exported CLASS_MAP and FIRESTORE_TO_DISPLAY_CLASS

**Key Decision:**
- Firestore canonical field: `studentId` (camelCase, set by pro-leo-site)
- assessment-app internal field: `student_id` (snake_case, via normalizeStudent())
- Class names: Firestore stores `'1'`/`'2'`; assessment-app always uses display form `'Class I'`/`'Class II'`
- `CLASS_MAP` and `FIRESTORE_TO_DISPLAY_CLASS` in `student-loader.js` are the single source of truth for this translation

**Success Condition:** ✅ Both apps recognize the SAME student using the SAME `student_id`.

---

### ✅ Phase 3 — Assessment Data Persistence
**Status:** COMPLETE
**Date:** 2026-05-12

- [x] `assessment_sessions` — already writing to Firestore (Phase 1)
- [x] `monthly_analytics` — Firestore read-through + write-through in `aggregation-engine.js`
- [x] `weak_students` — background write via `detectAndPersistWeakStudents()` in `weak-student-engine.js`
- [x] `student_profiles` — background write in `student-profile-engine.js` on every profile load
- [x] Auto-trigger: `session-review-engine.js` forces recompute + persist when session reaches `reviewed`/`locked`
- [x] Security rules added for all three new collections

**Architecture rule followed:** UI layer untouched. Only service/persistence layer changed. All writes are non-blocking (background `.catch()` pattern). localStorage fast-path preserved.

**Success Condition:** ✅ Analytics survive device switches and browser data clears.

---

### ✅ Phase 4 — Student Academic Profile Engine
**Status:** COMPLETE
**Date:** 2026-05-12

- [x] Define canonical snapshot schema for `student_profiles`
- [x] Create `student-snapshot-engine.js` — shapes full analytics into lean cross-app document
- [x] Trend derived from last two months in `monthlyData` (delta ≥5% = improving, ≤−5% = declining)
- [x] Attendance risk derived from `getAttendanceRiskLevel(absenceRate)`
- [x] Subject-specific alert IDs: `weak_subject_{subject_id}` (not just generic `weak_subject`)
- [x] `summaryText` — auto-generated human-readable sentence
- [x] UI receives full analytics profile; Firestore receives lean snapshot only

**Key decision:** Phase 3 was writing the full analytics blob to Firestore. Phase 4 replaces that with a purpose-built document. The full profile (monthlyData arrays, trend arrays, sessionAbsences) stays in assessment-app's memory and never reaches Firestore.

**Success Condition:** ✅ Each student has centralized academic intelligence data ready for the portal to read.

---

### ✅ Phase 5 — Main Portal Academic Snapshot
**Status:** COMPLETE
**Date:** 2026-05-12

- [x] `#s-academic-snapshot` div added to `#s-profile` section in `index.html`
- [x] Full CSS for snapshot widget added to `styles.css` (variables, trend badges, alert box, subject blocks, report link)
- [x] `loadAcademicSnapshot(studentId)` added to `app-logic.js` — reads `student_profiles/{sanitizedId}` from Firestore
- [x] Called non-blocking from `loadStudentProfile()` — zero risk to existing portal
- [x] No analytics engine, no Chart.js, no aggregation — read-only Firestore getDoc
- [x] Graceful degradation for missing doc and Firestore errors
- [x] "View Full Academic Report →" button present, enabled via `window._academicAppUrl` (wired in Phase 6)

**Success Condition:** ✅ Student portal shows live academic intelligence without embedding any assessment logic.

---

### ⬜ Phase 6 — Full Report Deep-Link System
**Objective:** Connect main portal to full assessment dashboard.

**Add Button:** `[Open Full Academic Report]`

**Route Example:** `assessment-app/student/{studentId}`

**Tasks:**
- [ ] Create student report route in assessment-app
- [ ] Support direct `student_id` loading via URL parameter
- [ ] Load analytics dynamically
- [ ] Load graphs dynamically
- [ ] Load trends dynamically

**Success Condition:** Main portal opens the full academic intelligence dashboard correctly.

---

### ✅ Phase 7 — Shared Authentication Ecosystem
**Status:** COMPLETE
**Date:** 2026-05-13

- [x] `resolveAuthSession()` added to `auth-service.js` — detects existing Firebase Auth session and auto-populates localStorage
- [x] `init()` in `main.js` awaits `resolveAuthSession()` before rendering — skips login form if already signed in via pro-leo-site
- [x] Teacher/admin roles allowed; student/office roles blocked at the gate
- [x] Access-denied screen shown to blocked users with return link
- [x] Logout via `signOut(auth)` clears shared Firebase session — pro-leo-site detects via `onAuthStateChanged` and redirects to login
- [x] Deep-link flow preserved — auto-login then auto-navigate to student profile

**Success Condition:** ✅ Teachers and admins logged into pro-leo-site open assessment-app without re-entering credentials.

---

### ⬜ Phase 8 — Security Rules + Access Control
**Objective:** Prepare production-grade security architecture.

**Tasks:**
- [ ] Create comprehensive Firestore security rules
- [ ] Restrict teacher access properly
- [ ] Protect analytics data
- [ ] Restrict admin-only data
- [ ] Secure attendance intelligence
- [ ] Secure assessment ownership

**Architecture must remain scalable for:**
- Principal
- Parent portal
- Superadmin
- Mobile app

**Success Condition:** Secure role-based access across ecosystem.

---

### ⬜ Phase 9 — Ecosystem UX Refinement
**Objective:** Make the ecosystem feel unified.

**Tasks:**
- [ ] Improve cross-app navigation
- [ ] Align branding (colors, fonts, logo)
- [ ] Align visual hierarchy
- [ ] Improve mobile consistency
- [ ] Improve route transitions

**Important:** Apps remain separate, but user experience should feel connected.

**Success Condition:** System feels like one ecosystem.

---

### ⬜ Phase 10 — Future Expansion Readiness
**Objective:** Prepare architecture for future features.

**Prepared for (NOT fully implemented):**
- [ ] Parent portal — `users` collection supports `role: 'parent'`
- [ ] PDF report cards — `student_profiles` contains all needed data
- [ ] Realtime alerts — Firestore `onSnapshot` ready
- [ ] Mobile app — same Firebase backend
- [ ] Push notifications — FCM config ready
- [ ] Realtime analytics — `monthly_analytics` supports live aggregation

**Success Condition:** Architecture is scalable and future-ready.

---

## Recommended Firestore Structure (Future)

```
Shared collections:
  students/{studentId}
  teachers/{teacherId}
  users/{uid}

Assessment collections:
  assessment_sessions/{sessionId}
  attendance/{recordId}
  monthly_analytics/{yearMonth_classId}
  weak_students/{studentId_yearMonth}
  student_profiles/{studentId}
  school_health/{yearMonth}
```

---

## Architecture Rules (Always Follow)

1. Continue modular architecture
2. Keep Firebase logic separate from UI
3. Keep analytics separate from portal rendering
4. Reuse engines/services
5. Preserve mobile-first workflow
6. Preserve grading speed
7. Preserve assessment architecture
8. Do NOT duplicate student records
9. Do NOT duplicate analytics calculations
10. Do NOT rebuild existing architecture

---

## Documentation Maintenance

Keep these files updated after every phase:
- `PROJECT_STATUS.md` — Integration progress, what's done
- `ARCHITECTURE.md` — System design, data flow, decisions
- `ROADMAP.md` — Remaining phases, upcoming tasks
