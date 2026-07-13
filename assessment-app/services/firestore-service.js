import { db } from './firebase-config.js';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const COLLECTION            = 'assessment_sessions';
const ANALYTICS_COLLECTION  = 'monthly_analytics';
const TERM_ANALYTICS_COLLECTION = 'term_analytics';
const CLASS_TEST_COLLECTION = 'class_test_marks';
const WEAK_COL              = 'weak_students';
const PROFILES_COL          = 'student_profiles';

// Firestore document ID for a class+month pair. Spaces → underscores so
// 'Class I' becomes 'Class_I', safe for use as a doc ID.
function analyticsDocId(yearMonth, className) {
  return `${yearMonth}_${String(className).replace(/\s+/g, '_')}`;
}

// Firestore document ID for a class+term pair, e.g. 'HY1_Class_I'.
function termAnalyticsDocId(term, className) {
  return `${term}_${String(className).replace(/\s+/g, '_')}`;
}

// Firestore document ID for a class test, e.g. 'HY1_Class_I_MATH'.
function classTestDocId(term, className, subjectId) {
  return `${term}_${String(className).replace(/\s+/g, '_')}_${subjectId}`;
}

// studentId values like 'SFS/2025/001' contain slashes which are illegal in
// Firestore document IDs. Replace with underscores: 'SFS_2025_001'.
function sanitizeDocId(id) {
  return String(id).replace(/\//g, '_').replace(/\s+/g, '_');
}

// Backward-compat: older sessions lack weekStart/weekEnd/dueDate.
// All reads must pass through this so legacy and new data are uniform.
export function normalizeSession(session) {
  if (!session) return session;
  if (!session.weekStart) {
    return {
      ...session,
      weekStart: session.date,
      weekEnd: session.date,
      dueDate: session.date,
      sessionType: 'legacy'
    };
  }
  return session;
}

export async function fetchSessions(filters = {}) {
  let q = collection(db, COLLECTION);
  const constraints = [];

  if (filters.class)   constraints.push(where('session.class', '==', filters.class));
  if (filters.teacher) constraints.push(where('session.teacher_name', '==', filters.teacher));
  if (filters.status)  constraints.push(where('session.status', '==', filters.status));

  if (constraints.length > 0) q = query(q, ...constraints);

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => {
    const data = d.data();
    return { ...data, session: normalizeSession(data.session) };
  });
}

export async function persistSession(session, marks) {
  if (!session || !session.session_id) throw new Error('Invalid session');

  const entry = {
    session: { ...session, updated_at: new Date().toISOString() },
    marks: marks || {},
    saved_at: new Date().toISOString()
  };

  await setDoc(doc(db, COLLECTION, session.session_id), entry);
  return entry;
}

export async function fetchSession(sessionId) {
  if (!sessionId) return null;
  const snap = await getDoc(doc(db, COLLECTION, sessionId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { ...data, session: normalizeSession(data.session) };
}

// Sessions are never hard-deleted by teachers — status transitions instead.
// Admins can hard-delete (e.g. junk/test sessions) via deleteSessionRemote;
// enforced server-side by firestore.rules (admin-only on this collection).
export async function removeSession(_sessionId) {
  console.warn('Session deletion is disabled for this role. Use status transitions instead.');
}

export async function deleteSessionRemote(sessionId) {
  if (!sessionId) throw new Error('Invalid session id');
  await deleteDoc(doc(db, COLLECTION, sessionId));
}

// ── Monthly analytics ─────────────────────────────────────────────────────────

export async function persistMonthlyAnalytics(yearMonth, className, data) {
  const docId = analyticsDocId(yearMonth, className);
  await setDoc(doc(db, ANALYTICS_COLLECTION, docId), {
    ...data,
    persistedAt: new Date().toISOString()
  });
}

export async function fetchMonthlyAnalytics(yearMonth, className) {
  const docId = analyticsDocId(yearMonth, className);
  const snap = await getDoc(doc(db, ANALYTICS_COLLECTION, docId));
  return snap.exists() ? snap.data() : null;
}

// ── Term analytics (Half-Yearly) ────────────────────────────────────────────────

export async function persistTermAnalytics(term, className, data) {
  const docId = termAnalyticsDocId(term, className);
  await setDoc(doc(db, TERM_ANALYTICS_COLLECTION, docId), {
    ...data,
    persistedAt: new Date().toISOString()
  });
}

export async function fetchTermAnalytics(term, className) {
  const docId = termAnalyticsDocId(term, className);
  const snap = await getDoc(doc(db, TERM_ANALYTICS_COLLECTION, docId));
  return snap.exists() ? snap.data() : null;
}

// ── Class test marks (once per Half-Yearly term) ────────────────────────────────
// One doc per class+subject+term, shaped like { test, marks } — mirrors the
// { session, marks } shape used for weekly/bi-weekly assessment_sessions.

export async function persistClassTest(test, marks) {
  if (!test || !test.class || !test.subject_id || !test.term) throw new Error('Invalid class test');
  const docId = classTestDocId(test.term, test.class, test.subject_id);
  await setDoc(doc(db, CLASS_TEST_COLLECTION, docId), {
    test: { ...test, updated_at: new Date().toISOString() },
    marks: marks || {},
    persistedAt: new Date().toISOString()
  });
}

export async function fetchClassTest(term, className, subjectId) {
  const docId = classTestDocId(term, className, subjectId);
  const snap = await getDoc(doc(db, CLASS_TEST_COLLECTION, docId));
  return snap.exists() ? snap.data() : null;
}

export async function fetchClassTests(filters = {}) {
  let q = collection(db, CLASS_TEST_COLLECTION);
  const constraints = [];

  if (filters.class) constraints.push(where('test.class', '==', filters.class));
  if (filters.term)  constraints.push(where('test.term', '==', filters.term));

  if (constraints.length > 0) q = query(q, ...constraints);

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => d.data());
}

// ── Weak students ─────────────────────────────────────────────────────────────

export async function persistWeakStudents(yearMonth, className, flaggedList) {
  const docId = analyticsDocId(yearMonth, className);
  await setDoc(doc(db, WEAK_COL, docId), {
    yearMonth,
    class: className,
    flaggedStudents: flaggedList,
    persistedAt: new Date().toISOString()
  });
}

export async function fetchWeakStudents(yearMonth, className) {
  const docId = analyticsDocId(yearMonth, className);
  const snap = await getDoc(doc(db, WEAK_COL, docId));
  return snap.exists() ? snap.data().flaggedStudents : null;
}

// ── Student profiles ──────────────────────────────────────────────────────────

export async function persistStudentProfile(studentId, profileData) {
  const docId = sanitizeDocId(studentId);
  await setDoc(doc(db, PROFILES_COL, docId), {
    ...profileData,
    studentId,
    persistedAt: new Date().toISOString()
  });
}

export async function fetchStudentProfile(studentId) {
  const docId = sanitizeDocId(studentId);
  const snap = await getDoc(doc(db, PROFILES_COL, docId));
  return snap.exists() ? snap.data() : null;
}
