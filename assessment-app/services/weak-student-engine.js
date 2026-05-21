import { getClassAttendanceOverview } from './attendance-engine.js';
import { persistWeakStudents } from './firestore-service.js';

const DEFAULT_RULES = Object.freeze({
  weak_overall: {
    enabled: true,
    threshold: 40,
    description: 'Overall average below 40%'
  },
  weak_subject: {
    enabled: true,
    threshold: 40,
    description: 'Any subject average below 40%'
  },
  attendance_risk: {
    enabled: true,
    threshold: 3,
    description: '3 or more missing assessments'
  },
  missing_assessments: {
    enabled: true,
    threshold: 1,
    description: 'Any missing assessment'
  }
});

export function getWeakStudentRules() {
  try {
    const raw = localStorage.getItem('sfds_weak_student_rules');
    if (!raw) return { ...DEFAULT_RULES };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_RULES, ...parsed };
  } catch {
    return { ...DEFAULT_RULES };
  }
}

export function saveWeakStudentRules(rules) {
  try {
    localStorage.setItem('sfds_weak_student_rules', JSON.stringify(rules));
  } catch (error) {
    console.error('Failed to save rules', error);
  }
}

export function detectWeakStudents(aggregatedData, customRules = null) {
  const rules = customRules || getWeakStudentRules();
  const flagged = [];

  if (!aggregatedData || !aggregatedData.students) {
    return flagged;
  }

  const totalAssessments = aggregatedData.totalAssessments || 0;

  // Load attendance data for this class
  const classAttendance = aggregatedData.class
    ? getClassAttendanceOverview(aggregatedData.class, aggregatedData.yearMonth || '')
    : null;

  const attendanceMap = new Map();
  if (classAttendance?.studentList) {
    classAttendance.studentList.forEach(a => {
      attendanceMap.set(a.student_id, a);
    });
  }

  for (const student of aggregatedData.students) {
    const flags = [];
    const reasons = [];

    if (rules.weak_overall?.enabled && student.overallPercentage < rules.weak_overall.threshold) {
      flags.push('weak_overall');
      reasons.push(`Overall average ${student.overallPercentage}% (below ${rules.weak_overall.threshold}%)`);
    }

    if (student.subjects) {
      for (const sub of student.subjects) {
        if (rules.weak_subject?.enabled && sub.percentage < rules.weak_subject.threshold) {
          if (!flags.includes('weak_subject')) {
            flags.push('weak_subject');
          }
          reasons.push(`${sub.subject_name}: ${sub.percentage}% (below ${rules.weak_subject.threshold}%)`);
        }
      }
    }

    if (totalAssessments > 0 && rules.attendance_risk?.enabled) {
      const missing = totalAssessments - Math.min(student.totalSessions, totalAssessments);
      if (missing >= rules.attendance_risk.threshold) {
        flags.push('attendance_risk');
        reasons.push(`${missing} missing assessment(s)`);
      }
    }

    if (rules.missing_assessments?.enabled && student.totalSessions < totalAssessments) {
      const missing = totalAssessments - student.totalSessions;
      if (missing >= rules.missing_assessments.threshold && !flags.includes('attendance_risk')) {
        flags.push('missing_assessments');
        reasons.push(`${missing} incomplete assessment(s)`);
      }
    }

    // Real absence-based attendance risk from attendance engine
    const att = attendanceMap.get(student.student_id);
    if (att && att.absenceRate >= 15 && !flags.includes('attendance_risk')) {
      flags.push('attendance_risk');
      reasons.push(`Absence rate ${att.absenceRate}% (${att.totalAbsences} absent criteria)`);
    }

    if (flags.length > 0) {
      flagged.push({
        student_id: student.student_id,
        full_name: student.full_name,
        roll_no: student.roll_no,
        class: student.class,
        overallPercentage: student.overallPercentage,
        flags: [...flags],
        reasons: [...reasons]
      });
    }
  }

  return flagged.sort((a, b) => a.overallPercentage - b.overallPercentage);
}

export function resetRulesToDefault() {
  saveWeakStudentRules({ ...DEFAULT_RULES });
  return { ...DEFAULT_RULES };
}

// Async wrapper: runs detectWeakStudents() and persists the result to Firestore
// in the background. Returns the same synchronous flagged array so callers are
// unaffected. Use this instead of detectWeakStudents() at aggregation boundaries.
export async function detectAndPersistWeakStudents(aggregatedData, customRules = null) {
  const flagged = detectWeakStudents(aggregatedData, customRules);
  const ym = aggregatedData?.yearMonth;
  const cls = aggregatedData?.class;
  if (ym && cls) {
    persistWeakStudents(ym, cls, flagged).catch(err =>
      console.warn('Failed to persist weak students to Firestore:', err.message)
    );
  }
  return flagged;
}
