import { getAllSessions } from './session-storage.js';
import { getMarkValue } from './totals-engine.js';

export function getStudentAbsences(studentId, className, yearMonth = '') {
  const sessions = getAllSessions().filter(s => {
    if (s.session.class !== className) return false;
    if (yearMonth && !s.session.date.startsWith(yearMonth)) return false;
    return true;
  });

  let totalAbsences = 0;
  let totalCriteria = 0;
  const sessionAbsences = [];

  sessions.forEach(entry => {
    const marks = entry.marks?.[studentId];
    if (!marks) return;

    let sessionAbsent = 0;
    let sessionCriteria = 0;

    Object.entries(marks).forEach(([criterionId, value]) => {
      sessionCriteria++;
      totalCriteria++;
      if (value && typeof value === 'object' && value.attendance === 'absent') {
        sessionAbsent++;
        totalAbsences++;
      }
    });

    if (sessionAbsent > 0) {
      sessionAbsences.push({
        session_id: entry.session.session_id,
        subject_name: entry.session.subject_name,
        date: entry.session.date,
        absentCriteria: sessionAbsent,
        totalCriteria: sessionCriteria
      });
    }
  });

  return {
    totalAbsences,
    totalCriteria,
    absenceRate: totalCriteria > 0 ? Math.round((totalAbsences / totalCriteria) * 100) : 0,
    sessionAbsences,
    sessionsAffected: sessionAbsences.length
  };
}

export function getClassAttendanceOverview(className, yearMonth = '') {
  const sessions = getAllSessions().filter(s => {
    if (s.session.class !== className) return false;
    if (yearMonth && !s.session.date.startsWith(yearMonth)) return false;
    return true;
  });

  const studentAbsenceMap = new Map();
  let classTotalCriteria = 0;
  let classTotalAbsences = 0;

  sessions.forEach(entry => {
    Object.entries(entry.marks || {}).forEach(([studentId, criterionMarks]) => {
      if (!studentAbsenceMap.has(studentId)) {
        studentAbsenceMap.set(studentId, { totalAbsences: 0, totalCriteria: 0, sessionsAffected: 0 });
      }
      const rec = studentAbsenceMap.get(studentId);
      let sessionAbsent = 0;

      Object.entries(criterionMarks).forEach(([_, value]) => {
        rec.totalCriteria++;
        classTotalCriteria++;
        if (value && typeof value === 'object' && value.attendance === 'absent') {
          rec.totalAbsences++;
          classTotalAbsences++;
          sessionAbsent++;
        }
      });

      if (sessionAbsent > 0) {
        rec.sessionsAffected++;
      }
    });
  });

  const studentList = Array.from(studentAbsenceMap.entries()).map(([studentId, data]) => ({
    student_id: studentId,
    totalAbsences: data.totalAbsences,
    totalCriteria: data.totalCriteria,
    absenceRate: data.totalCriteria > 0 ? Math.round((data.totalAbsences / data.totalCriteria) * 100) : 0,
    sessionsAffected: data.sessionsAffected
  })).sort((a, b) => b.absenceRate - a.absenceRate);

  const chronicAbsentees = studentList.filter(s => s.absenceRate >= 25);
  const highRisk = studentList.filter(s => s.absenceRate >= 15 && s.absenceRate < 25);

  return {
    className,
    yearMonth,
    totalStudents: studentList.length,
    classTotalAbsences,
    classTotalCriteria,
    classAbsenceRate: classTotalCriteria > 0 ? Math.round((classTotalAbsences / classTotalCriteria) * 100) : 0,
    chronicAbsentees,
    highRisk,
    studentList
  };
}

export function getAttendanceRiskLevel(absenceRate) {
  if (absenceRate >= 25) return { level: 'critical', label: 'Critical' };
  if (absenceRate >= 15) return { level: 'high', label: 'High Risk' };
  if (absenceRate >= 5) return { level: 'moderate', label: 'Moderate' };
  return { level: 'low', label: 'Low Risk' };
}
