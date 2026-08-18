// ── Report Card Attendance ────────────────────────────────────────────────────
// Reads a student's attendance from the SAME place the Class III-X system uses:
// the "Class Attendance" bulk-entry grid in Sfs-report-card/markentry.js, which
// writes one Working Days value for the class + Days Present per student into
//   marks/{classId}_{HY|FT}/students/{studentId}.attendance
// as { hyPresent, hyTotal, ftPresent, ftTotal } (saveClassAttendance mirrors the
// same leaf into BOTH term docs).
//
// This is deliberately NOT the attendance_daily/attendance_monthly snapshot
// pipeline. That path was tried first and always came back blank: no monthly
// snapshot has ever been generated for SKG/LKG/Class I/Class II, whereas the
// Class Attendance grid already holds real, complete data for Class I (59/59
// students) and Class II (55/55).
//
// Class label → marks docId prefix. The marks collection keys classes by ROMAN
// numeral ("I_HY", "II_HY"), while kindergarten keeps its own label ("SKG_HY").
// Getting this wrong reads an empty subcollection and silently reports no
// attendance, so it is a lookup table rather than a derived string.

import { db } from './firebase-config.js';
import {
  doc, getDoc, collection, query, where, getDocs, limit
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const CLASS_TO_MARKS_ID = {
  'SKG':      'SKG',
  'LKG':      'LKG',
  'Class I':  'I',
  'Class II': 'II'
};

// HY1 is the school's Half Yearly, HY2 its Final Term — matching the two-term
// HY/FT split the marks system and its attendance grid are built around.
const TERM_TO_MARKS = {
  HY1: { docSuffix: 'HY', presentKey: 'hyPresent', totalKey: 'hyTotal' },
  HY2: { docSuffix: 'FT', presentKey: 'ftPresent', totalKey: 'ftTotal' }
};

/**
 * Reads one student's attendance for a term from the Class Attendance grid's data.
 *
 * @param {object} params
 * @param {string} params.studentId - e.g. "SFS260101" (same id the grid writes under)
 * @param {string} params.className - e.g. "Class I"
 * @param {string} params.term      - "HY1" | "HY2"
 * @returns {Promise<{ attendancePresentDays: number|null, attendanceWorkingDays: number|null }>}
 */
export async function getTermAttendance({ studentId, className, term }) {
  const classId = CLASS_TO_MARKS_ID[className];
  const termCfg = TERM_TO_MARKS[term];
  const blank = { attendancePresentDays: null, attendanceWorkingDays: null };
  if (!classId || !termCfg || !studentId) return blank;

  const termDocId = `${classId}_${termCfg.docSuffix}`;
  let snap = await getDoc(doc(db, 'marks', termDocId, 'students', String(studentId)));

  // The attendance grid keys mark docs by the student's Firestore DOCUMENT id,
  // which is normally identical to studentId — but not always (two records were
  // created with an auto-generated id, e.g. SKG roll 48). Resolve the real
  // document id before giving up, or that student's card silently loses its
  // attendance while the rest of the class is fine.
  if (!snap.exists()) {
    const alt = await getDocs(query(
      collection(db, 'students'), where('studentId', '==', String(studentId)), limit(1)
    ));
    if (alt.empty || alt.docs[0].id === String(studentId)) return blank;
    snap = await getDoc(doc(db, 'marks', termDocId, 'students', alt.docs[0].id));
    if (!snap.exists()) return blank;
  }

  const att = snap.data()?.attendance || {};
  const present = att[termCfg.presentKey];
  const total   = att[termCfg.totalKey];

  // The grid writes all four keys at once and leaves the other term's pair at 0,
  // so a 0 working-days total means "this term not entered yet", not "zero days".
  if (!total) return blank;

  return {
    attendancePresentDays: typeof present === 'number' ? present : null,
    attendanceWorkingDays: total
  };
}
