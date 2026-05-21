import { getStudentAnalytics } from './analytics-engine.js';
import { detectWeakStudents } from './weak-student-engine.js';
import { aggregateByMonth } from './aggregation-engine.js';
import { getStudentAbsences } from './attendance-engine.js';
import { persistStudentProfile } from './firestore-service.js';
import { buildStudentSnapshot } from './student-snapshot-engine.js';

export async function getStudentProfile(studentId, className) {
  const analytics = await getStudentAnalytics(studentId, className);
  const agg = await aggregateByMonth(null, className);
  const weak = detectWeakStudents(agg);
  const weakRecord = weak.find(w => w.student_id === studentId);
  const attendance = getStudentAbsences(studentId, className);

  // Full profile — returned to the assessment-app UI, never written to Firestore.
  const profile = {
    ...analytics,
    flags:    weakRecord?.flags   || [],
    reasons:  weakRecord?.reasons || [],
    attendance
  };

  // Lean snapshot — the canonical cross-app document written to Firestore.
  // pro-leo-site reads this in Phase 5 without importing the analytics engine.
  const snapshot = buildStudentSnapshot(studentId, profile);
  persistStudentProfile(studentId, snapshot).catch(err =>
    console.warn('Failed to persist student profile snapshot to Firestore:', err.message)
  );

  return profile;
}
