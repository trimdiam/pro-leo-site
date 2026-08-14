import { getAllSessions, saveSessionAndConfirm, getSession } from './session-storage.js';
import { loadStudentsForClass } from './student-loader.js';
import { loadCriteriaForSubject } from './criteria-loader.js';
import { getSubjectsForClass, loadSubjects } from './subject-loader.js';
import { aggregateByMonth, extractYearMonth, clearAggregationCache } from './aggregation-engine.js';
import { detectAndPersistWeakStudents } from './weak-student-engine.js';
import { getStudentProfile } from './student-profile-engine.js';
import { getTermDateRange } from './report-card-grade-engine.js';

export const SESSION_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REVIEWED: 'reviewed',
  LOCKED: 'locked'
});

export const STATUS_FLOW = Object.freeze({
  [SESSION_STATUS.DRAFT]: [SESSION_STATUS.SUBMITTED],
  [SESSION_STATUS.SUBMITTED]: [SESSION_STATUS.REVIEWED, SESSION_STATUS.DRAFT],
  [SESSION_STATUS.REVIEWED]: [SESSION_STATUS.LOCKED, SESSION_STATUS.DRAFT],
  [SESSION_STATUS.LOCKED]: [SESSION_STATUS.DRAFT]
});

export function getSessionsByFilter(filters = {}) {
  let sessions = getAllSessions();

  if (filters.status) {
    sessions = sessions.filter(s => s.session.status === filters.status);
  }
  if (filters.class) {
    sessions = sessions.filter(s => s.session.class === filters.class);
  }
  if (filters.subject_id) {
    sessions = sessions.filter(s => s.session.subject_id === filters.subject_id);
  }
  if (filters.teacher_name) {
    const term = filters.teacher_name.toLowerCase();
    sessions = sessions.filter(s => s.session.teacher_name.toLowerCase().includes(term));
  }
  if (filters.date) {
    sessions = sessions.filter(s => s.session.date === filters.date);
  }
  if (filters.date_from) {
    sessions = sessions.filter(s => s.session.date >= filters.date_from);
  }
  if (filters.date_to) {
    sessions = sessions.filter(s => s.session.date <= filters.date_to);
  }
  if (filters.search) {
    const term = filters.search.toLowerCase();
    sessions = sessions.filter(s =>
      s.session.teacher_name.toLowerCase().includes(term) ||
      s.session.subject_name.toLowerCase().includes(term) ||
      s.session.class.toLowerCase().includes(term)
    );
  }

  return sessions.sort((a, b) => new Date(b.session.created_at) - new Date(a.session.created_at));
}

export function canEditSession(session) {
  return session && session.status === SESSION_STATUS.DRAFT;
}

export function canTransitionStatus(currentStatus, newStatus) {
  const allowed = STATUS_FLOW[currentStatus];
  return allowed && allowed.includes(newStatus);
}

export async function updateSessionStatus(sessionId, newStatus) {
  const stored = getSession(sessionId);
  if (!stored) {
    return { ok: false, error: 'Session not found' };
  }

  const currentStatus = stored.session.status;
  if (!canTransitionStatus(currentStatus, newStatus)) {
    return { ok: false, error: `Cannot transition from ${currentStatus} to ${newStatus}` };
  }

  stored.session.status = newStatus;
  stored.session.updated_at = new Date().toISOString();

  try {
    // Waits for the actual Firestore outcome (not fire-and-forget) — this is
    // the review/lock step, now gated by the class-teacher-only permission
    // in firestore.rules, so a real permission denial must be reported back
    // instead of silently failing server-side while the UI shows success.
    const saveResult = await saveSessionAndConfirm(stored.session, stored.marks);
    if (!saveResult.ok) {
      return { ok: false, error: saveResult.error || 'Could not save the status change.' };
    }

    // Every status change recomputes analytics + persists every student
    // profile in this class so the portal always reflects current data,
    // regardless of which state the session is moving into.
    const yearMonth = extractYearMonth(stored.session.date);
    const className = stored.session.class;
    clearAggregationCache();
    aggregateByMonth(yearMonth, className, { force: true })
      .then(agg => detectAndPersistWeakStudents(agg))
      .then(() => loadStudentsForClass(className))
      .then(students => {
        students.forEach(s => {
          getStudentProfile(s.student_id, className)
            .catch(err => console.warn(`Profile snapshot failed for ${s.student_id}:`, err.message));
        });
      })
      .catch(err => console.warn('Background analytics persist failed:', err.message));

    return { ok: true, session: stored.session };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function lockSession(sessionId) {
  return updateSessionStatus(sessionId, SESSION_STATUS.LOCKED);
}

// Sessions in this class whose date falls inside the term's window — same
// weekStart/weekEnd-falls-back-to-date rule report-card-aggregator.js uses,
// so "in this term" means the same thing everywhere it's asked.
function getSessionsInTermWindow(className, term) {
  const { dateFrom, dateTo } = getTermDateRange(term);
  return getAllSessions().filter(entry => {
    const s = entry.session;
    if (!s || s.class !== className) return false;
    const start = s.weekStart || s.date;
    const end = s.weekEnd || s.date;
    if (!start || !end) return false;
    return start >= dateFrom && end <= dateTo;
  });
}

/**
 * Cascades an admin's co-scholastic term-lock onto assessment sessions: every
 * REVIEWED session for this class in this term's window also becomes LOCKED.
 * Draft/submitted sessions are left untouched — STATUS_FLOW has no direct path
 * to 'locked' for them, and force-locking incomplete data would let it count
 * as final on a report card. Call sites must sync sessions from Firestore
 * first; this reads only the local cache.
 *
 * One-directional by design: this never runs on co-scholastic *unlock*, so
 * reopening the co-scholastic grid does not silently reopen tests a teacher
 * already finalized.
 */
export async function lockReviewedSessionsForClassTerm(term, className) {
  const inWindow = getSessionsInTermWindow(className, term);
  const toLock = inWindow.filter(e => e.session.status === SESSION_STATUS.REVIEWED);
  const alreadyLocked = inWindow.filter(e => e.session.status === SESSION_STATUS.LOCKED).length;
  const skippedUnreviewed = inWindow.filter(e =>
    e.session.status === SESSION_STATUS.DRAFT || e.session.status === SESSION_STATUS.SUBMITTED
  ).length;

  const failures = [];
  for (const entry of toLock) {
    const result = await lockSession(entry.session.session_id);
    if (!result.ok) failures.push({ sessionId: entry.session.session_id, error: result.error });
  }

  return {
    lockedCount: toLock.length - failures.length,
    alreadyLocked,
    skippedUnreviewed,
    failures
  };
}

export function reopenSession(sessionId) {
  return updateSessionStatus(sessionId, SESSION_STATUS.DRAFT);
}

export function submitSession(sessionId) {
  return updateSessionStatus(sessionId, SESSION_STATUS.SUBMITTED);
}

export function reviewSession(sessionId) {
  return updateSessionStatus(sessionId, SESSION_STATUS.REVIEWED);
}

export async function loadFullSessionData(sessionId) {
  const stored = getSession(sessionId);
  if (!stored) return null;

  const sess = stored.session;
  const allSubjects = await loadSubjects().catch(() => []);
  const subject = allSubjects.find(s => s.subject_id === sess.subject_id) || null;

  let criteria = [];
  if (subject) {
    criteria = await loadCriteriaForSubject(subject, sess.class).catch(() => []);
  }

  const students = await loadStudentsForClass(sess.class).catch(() => []);

  return {
    stored,
    session: sess,
    marks: stored.marks,
    students,
    criteria,
    subject
  };
}

export function getSessionStats(storedSession, students, criteria) {
  const sess = storedSession.session;
  const marks = storedSession.marks || {};

  let completedStudents = 0;
  const totalStudents = students.length;
  const totalCriteria = criteria.length;

  students.forEach(student => {
    const studentMarks = marks[student.student_id] || {};
    let complete = true;
    criteria.forEach(c => {
      if (studentMarks[c.criterion_id] === null || studentMarks[c.criterion_id] === undefined) {
        complete = false;
      }
    });
    if (complete) completedStudents++;
  });

  return {
    totalStudents,
    completedStudents,
    totalCriteria,
    status: sess.status,
    teacher_name: sess.teacher_name,
    class: sess.class,
    subject_name: sess.subject_name,
    date: sess.date,
    updated_at: sess.updated_at
  };
}
