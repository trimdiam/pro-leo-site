export function calculateStudentTotal(studentMarks, criteria) {
  if (!studentMarks || !criteria) {
    return { total: 0, max: 0, percentage: 0, completed: 0, totalCriteria: 0 };
  }

  let total = 0;
  let completed = 0;
  let absentCount = 0;
  const totalCriteria = criteria.length;

  criteria.forEach(criterion => {
    const entry = studentMarks[criterion.criterion_id];
    const isAbsent = entry && typeof entry === 'object' && entry.attendance === 'absent';
    if (isAbsent) {
      absentCount++;
    } else if (entry !== null && entry !== undefined) {
      total += entry;
      completed++;
    }
  });

  const max = Math.max(0, (totalCriteria - absentCount) * 5);
  const percentage = max > 0 ? Math.round((total / max) * 100) : 0;

  return { total, max, percentage, completed, totalCriteria };
}

export function isCriterionAbsent(studentMarks, criterionId) {
  const entry = studentMarks?.[criterionId];
  return entry && typeof entry === 'object' && entry.attendance === 'absent';
}

export function getMarkValue(entry) {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'object' && entry.attendance === 'absent') return null;
  return entry;
}

export function calculateSessionProgress(marks, students, criteria) {
  if (!marks || !students || !criteria) {
    return { totalStudents: 0, completedStudents: 0, overallPercentage: 0 };
  }

  const totalStudents = students.length;
  let completedStudents = 0;
  let totalMarksCount = 0;
  let filledMarksCount = 0;

  students.forEach(student => {
    const studentMarks = marks[student.student_id] || {};
    let studentComplete = true;

    criteria.forEach(criterion => {
      totalMarksCount++;
      const mark = studentMarks[criterion.criterion_id];
      if (mark !== null && mark !== undefined) {
        filledMarksCount++;
      } else {
        studentComplete = false;
      }
    });

    if (studentComplete) completedStudents++;
  });

  return {
    totalStudents,
    completedStudents,
    overallPercentage: totalMarksCount > 0 ? Math.round((filledMarksCount / totalMarksCount) * 100) : 0
  };
}
