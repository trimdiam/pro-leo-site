// ── Student Status ────────────────────────────────────────────────────────────
// One rule, one place: who is still on the roll.
//
// A student who leaves mid-year must NOT be hard-deleted. Deleting the students
// document removes the roster entry only — every reference to them survives as an
// orphan (one LKG pupil traced to 51: 23 assessment_sessions, 25 attendance_daily,
// 2 marks docs, 1 coscholastic_marks). Worse, a released report card becomes
// unreachable, because lookupReportCard matches class + roll + DOB against
// `students` before it will hand the card over.
//
// So departure is a FLAG, not a deletion:
//   status: 'left'   + leftOn: 'YYYY-MM-DD'   → off the roll
//   status absent    → on the roll (all 647 existing records have no status,
//                      so "missing means active" is required for back-compat and
//                      must never be inverted)
//
// Entry surfaces filter these out; history surfaces keep them.
(function () {
  'use strict';

  const ACTIVE = 'active';

  function isStudentActive(data) {
    if (!data) return false;
    const s = data.status;
    return !s || String(s).toLowerCase() === ACTIVE;
  }

  // Firestore QueryDocumentSnapshot[] -> only those still on the roll
  function filterActiveStudentDocs(docs) {
    return (docs || []).filter(d => {
      try { return isStudentActive(d.data()); } catch (e) { return true; }
    });
  }

  window.isStudentActive = isStudentActive;
  window.filterActiveStudentDocs = filterActiveStudentDocs;
})();
