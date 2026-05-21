import { findDuplicateSession } from './session-storage.js';

export function createSession({ teacher_name, class: className, subject, date, weekStart, weekEnd, dueDate, force = false }) {
  const errors = validateSessionFields({ teacher_name, class: className, subject, weekStart, weekEnd, dueDate });
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const resolvedDate = weekStart || date;

  const duplicate = findDuplicateSession({
    teacher_name: teacher_name.trim(),
    class: className,
    subject_id: subject.subject_id,
    date: resolvedDate
  });

  if (duplicate && !force) {
    return {
      ok: false,
      duplicate: duplicate.session,
      errors: ['A session already exists for this teacher, class, subject, and week.']
    };
  }

  const session_id = duplicate && force ? duplicate.session.session_id : generateSessionId();

  const session = {
    session_id,
    teacher_name: teacher_name.trim(),
    class: className,
    subject_id: subject.subject_id,
    subject_name: subject.subject_name,
    date: resolvedDate,
    weekStart,
    weekEnd,
    dueDate,
    sessionType: 'weekly',
    status: 'draft',
    created_at: duplicate && force ? duplicate.session.created_at : new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return { ok: true, session };
}

export function generateSessionId() {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

export function initializeMarksState(students, criteria) {
  const marks = {};
  students.forEach(student => {
    marks[student.student_id] = {};
    criteria.forEach(criterion => {
      marks[student.student_id][criterion.criterion_id] = null;
    });
  });
  return marks;
}

export function validateMark(mark) {
  if (mark === null) return true;
  if (mark && typeof mark === 'object' && mark.attendance === 'absent') return true;
  return Number.isInteger(mark) && mark >= 0 && mark <= 5;
}

function validateSessionFields({ teacher_name, class: className, subject, weekStart, weekEnd, dueDate }) {
  const errors = [];
  if (!teacher_name || !teacher_name.trim()) errors.push('Teacher name is required');
  if (!className) errors.push('Class is required');
  if (!subject || typeof subject !== 'object') errors.push('Subject is required');
  if (!weekStart) errors.push('Week start date is required');
  if (!weekEnd) errors.push('Week end date is required');
  if (!dueDate) errors.push('Due date is required');
  if (weekStart && weekEnd && new Date(weekEnd) < new Date(weekStart)) {
    errors.push('Week end cannot be before week start');
  }
  if (weekEnd && dueDate && new Date(dueDate) < new Date(weekEnd)) {
    errors.push('Due date must be on or after week end');
  }
  return errors;
}
