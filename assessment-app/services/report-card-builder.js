// ── Report Card Builder ───────────────────────────────────────────────────────
// Orchestrates all report card engines: aggregates marks, grades subjects,
// generates a teacher remark via Claude, and persists the full document to
// Firestore in the report_cards collection.

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

import { aggregateStudentForReportCard } from './report-card-aggregator.js';
import { gradeSubject, computeOverallPerformance, getTermLabel } from './report-card-grade-engine.js';
import { generateTeacherRemark } from './report-card-remark-engine.js';
import { loadStudentsForClass } from './student-loader.js';
import { getTermAttendance } from './report-card-attendance.js';

const REPORT_CARDS_COL = 'report_cards';

// ── Internal helpers ──────────────────────────────────────────────────────────

function sanitizeDocId(id) {
  return String(id).replace(/\//g, '_').replace(/\s+/g, '_');
}

/**
 * Fetches a student record from the students Firestore collection.
 * Falls back to the class student list if direct fetch fails.
 * @param {string} studentId
 * @param {string} className
 * @returns {Promise<object|null>}
 */
async function fetchStudentRecord(studentId, className) {
  // Try direct Firestore lookup first
  try {
    const sanId = sanitizeDocId(studentId);
    const snap = await getDoc(doc(db, 'students', sanId));
    if (snap.exists()) return snap.data();
  } catch (err) {
    console.warn('Direct student fetch failed, falling back to class list:', err.message);
  }

  // Fallback: load class list and find by studentId
  try {
    const students = await loadStudentsForClass(className);
    return students.find(s => s.student_id === studentId) || null;
  } catch (err) {
    console.warn('Class student list fallback also failed:', err.message);
    return null;
  }
}

function extractFirstName(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds and saves a complete report card for one student.
 *
 * @param {object} params
 * @param {string} params.studentId     - Universal student ID e.g. "SFS/2025/001"
 * @param {string} params.className     - e.g. "Class I"
 * @param {string} params.term          - "HY1" | "HY2"
 * @param {string} params.academicYear  - "2025-26"
 * @param {string} params.dateFrom      - ISO date
 * @param {string} params.dateTo        - ISO date
 * @param {string} params.generatedBy   - Admin user name
 * @returns {Promise<{ ok: boolean, docId: string, error?: string }>}
 */
export async function buildAndSaveReportCard(params) {
  const { studentId, className, term, academicYear, dateFrom, dateTo, generatedBy } = params;

  try {
    // 1. Load student info
    const studentRec = await fetchStudentRecord(studentId, className);
    const studentName = studentRec?.full_name || studentRec?.name || studentId;
    const firstName   = extractFirstName(studentName);
    const rollNo      = studentRec?.roll_no || studentRec?.rollNo || '';
    const section     = studentRec?.section || '';

    // 2. Aggregate session marks
    const aggregated = await aggregateStudentForReportCard(studentId, dateFrom, dateTo, className);

    // If no sessions at all, skip with a clear signal
    if (aggregated.totalSessionsIncluded === 0) {
      return { ok: false, docId: null, skipped: true, error: 'No finalized sessions found for this student in the selected period.' };
    }

    // 3. Grade each subject
    const gradedSubjects = aggregated.subjects.map(s => gradeSubject(s));

    // 4. Compute overall performance
    const overall = computeOverallPerformance(gradedSubjects);

    // 5. Generate teacher remark
    const termLabel = getTermLabel(term);
    const remarkProfile = {
      firstName,
      className,
      overallGrade:        overall.overallGrade?.code || 'Ex',
      overallLabel:        overall.overallLabel,
      overallAverageScore: overall.overallAverageScore,
      strongestSubject:    overall.strongestSubject?.subject_name || '',
      weakestSubject:      overall.weakestSubject?.subject_name || '',
      improvementAreas:    overall.improvementAreas,
      trendDirection:      'stable',     // placeholder — trend engine not yet wired here
      attendanceRisk:      false,
      term:                termLabel
    };
    const teacherRemark = generateTeacherRemark(remarkProfile);

    // 5b. Pull the student's real attendance for this term (best-effort).
    const attendance = await getTermAttendance({
      studentId, rollNo, className, dateFrom, dateTo
    }).catch(err => {
      console.warn(`Attendance fetch failed for ${studentId}:`, err.message);
      return { attendancePresentDays: null, attendanceWorkingDays: null };
    });

    // 6. Assemble document
    const docId = `${sanitizeDocId(studentId)}_${term}`;

    const reportCard = {
      // Identity
      studentId,
      docId,
      studentName,
      firstName,
      className,
      rollNo:   String(rollNo),
      section,

      // Term
      term,
      termLabel,
      academicYear,
      dateFrom,
      dateTo,

      // Grades
      subjects: gradedSubjects.map(s => ({
        subject_id:     s.subject_id,
        subject_name:   s.subject_name,
        subjectGrade:   s.subjectGrade?.code || 'Ex',
        subjectAverage: s.subjectAverage,
        pending:        s.pending || false,
        pendingNote:    s.pendingNote || null,
        criteria: (s.criteria || []).map(c => ({
          criterion_id:   c.criterion_id,
          criterion_name: c.criterion_name,
          category:       c.category || 'General',
          averageScore:   c.averageScore ?? null,
          grade:          c.grade?.code || 'Ex',
          label:          c.grade?.label || 'Exempt / No Data',
          sessionCount:   c.sessionCount ?? 0,
          absentCount:    c.absentCount  ?? 0
        }))
      })),

      // Overall
      overallAverageScore:  overall.overallAverageScore,
      overallGrade:         overall.overallGrade?.code    || 'Ex',
      overallLabel:         overall.overallLabel          || 'Exempt / No Data',
      strongestSubject:     overall.strongestSubject?.subject_name || null,
      weakestSubject:       overall.weakestSubject?.subject_name   || null,
      improvementAreas:     overall.improvementAreas,
      trendDirection:       'stable',
      attendanceRisk:       false,

      // Remark
      teacherRemark,
      remarkGeneratedByAI:  true,
      remarkEditedByAdmin:  false,

      // Attendance — pulled live from attendance_monthly; null if no snapshot
      // exists for the term (admin can then fill it in manually).
      attendancePresentDays: attendance.attendancePresentDays,
      attendanceWorkingDays: attendance.attendanceWorkingDays,

      // Promotion (HY2 only — admin fills)
      promotedToClass: null,

      // Workflow
      status:         'draft',
      feesCleared:    false,
      generatedBy:    generatedBy || 'Admin',
      generatedAt:    serverTimestamp(),
      releasedBy:     null,
      releasedAt:     null,
      lastModifiedAt: serverTimestamp()
    };

    // 7. Write to Firestore
    await setDoc(doc(db, REPORT_CARDS_COL, docId), reportCard, { merge: false });

    return { ok: true, docId, studentName };

  } catch (err) {
    console.error(`buildAndSaveReportCard failed for ${studentId}:`, err);
    return { ok: false, docId: null, error: err.message };
  }
}
