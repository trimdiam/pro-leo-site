// ── Report Card Attendance ────────────────────────────────────────────────────
// Pulls a student's REAL attendance for a half-yearly term from the
// `attendance_monthly` Firestore collection (the same snapshots the admin
// attendance panel generates in pro-leo-site).
//
// Document contract (written by app-logic.js generateMonthlySnapshot):
//   id:           `${classNum}_${yyyy}_${mm}`   e.g. "1_2025_04"
//   working_days: <number>
//   students:     { [studentId|rollNo]: { present, late, absent, ... } }
//
// "Present days" for the report card counts present + late (the student was
// physically in attendance). Working days are summed across the term's months.

import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { CLASS_MAP } from './student-loader.js';

/**
 * Lists the "YYYY_MM" month keys spanning a date window, inclusive.
 * @param {string} dateFrom ISO date e.g. "2025-04-01"
 * @param {string} dateTo   ISO date e.g. "2025-09-30"
 * @returns {string[]}      e.g. ["2025_04", ..., "2025_09"]
 */
function monthsBetween(dateFrom, dateTo) {
  const out = [];
  const start = new Date(dateFrom + 'T00:00:00');
  const end   = new Date(dateTo   + 'T00:00:00');
  let y = start.getFullYear();
  let m = start.getMonth(); // 0-based
  while (y < end.getFullYear() || (y === end.getFullYear() && m <= end.getMonth())) {
    out.push(`${y}_${String(m + 1).padStart(2, '0')}`);
    if (++m > 11) { m = 0; y++; }
  }
  return out;
}

/**
 * Aggregates a student's real attendance across a term.
 *
 * @param {object} params
 * @param {string} params.studentId  - Universal student ID (attendance key)
 * @param {string} [params.rollNo]   - Fallback key if studentId not in snapshot
 * @param {string} params.className  - Display name e.g. "Class I"
 * @param {string} params.dateFrom   - ISO date (term start)
 * @param {string} params.dateTo     - ISO date (term end)
 * @returns {Promise<{ attendancePresentDays: number|null, attendanceWorkingDays: number|null, monthsFound: number }>}
 */
export async function getTermAttendance({ studentId, rollNo, className, dateFrom, dateTo }) {
  const classNum = CLASS_MAP[className] || className;
  const months = monthsBetween(dateFrom, dateTo);

  let present = 0;
  let working = 0;
  let monthsFound = 0;

  const snaps = await Promise.all(
    months.map(my => getDoc(doc(db, 'attendance_monthly', `${classNum}_${my}`)).catch(() => null))
  );

  for (const snap of snaps) {
    if (!snap || !snap.exists()) continue;
    const data = snap.data();
    const rec = data.students?.[studentId]
      ?? (rollNo != null ? data.students?.[String(rollNo)] : undefined);
    if (!rec) continue;            // student not in this month's snapshot — skip

    monthsFound++;
    working += Number(data.working_days) || 0;
    present += (Number(rec.present) || 0) + (Number(rec.late) || 0);
  }

  if (monthsFound === 0) {
    // No attendance snapshots for this term → leave blank for admin to fill.
    return { attendancePresentDays: null, attendanceWorkingDays: null, monthsFound: 0 };
  }

  return { attendancePresentDays: present, attendanceWorkingDays: working, monthsFound };
}
