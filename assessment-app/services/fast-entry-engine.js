const DEFAULT_SCORE = 4;

export function getDefaultScore() {
  return DEFAULT_SCORE;
}

export function initializeMarksWithDefault(students, criteria) {
  const marks = {};
  students.forEach(student => {
    marks[student.student_id] = {};
    criteria.forEach(criterion => {
      marks[student.student_id][criterion.criterion_id] = DEFAULT_SCORE;
    });
  });
  return marks;
}

export function applyDefaultToAll(marks, students, criteria) {
  students.forEach(student => {
    if (!marks[student.student_id]) marks[student.student_id] = {};
    criteria.forEach(criterion => {
      if (marks[student.student_id][criterion.criterion_id] === null || marks[student.student_id][criterion.criterion_id] === undefined) {
        marks[student.student_id][criterion.criterion_id] = DEFAULT_SCORE;
      }
    });
  });
  return marks;
}

export function applyDefaultToStudent(marks, studentId, criteria) {
  if (!marks[studentId]) marks[studentId] = {};
  criteria.forEach(criterion => {
    if (marks[studentId][criterion.criterion_id] === null || marks[studentId][criterion.criterion_id] === undefined) {
      marks[studentId][criterion.criterion_id] = DEFAULT_SCORE;
    }
  });
  return marks;
}
