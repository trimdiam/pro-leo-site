// ── Report Card Builder ───────────────────────────────────────────────────────
// Orchestrates all report card engines: aggregates marks, grades subjects,
// generates a teacher remark via Claude, and persists the full document to
// Firestore in the report_cards collection.

import { db } from './firebase-config.js';
import {
  doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

import { aggregateStudentForReportCard } from './report-card-aggregator.js';
import { gradeSubject, computeOverallPerformance, getTermLabel } from './report-card-grade-engine.js';
import { generateTeacherRemark } from './report-card-remark-engine.js';
import { loadStudentsForClass } from './student-loader.js';
import { getTermAttendance } from './report-card-attendance.js';
import { getClassTest } from './class-test-storage.js';
import { loadCoScholasticForClass, getStudentCoScholastic } from './coscholastic-service.js';
import {
  loadGrowthPromptsForClass,
  getStudentNarrative,
  syncNarrativesFromFirestore
} from './playgroup-narrative-service.js';

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
    const students = await loadStudentsForClass(className, { includeInactive: true });
    return students.find(s => s.student_id === studentId) || null;
  } catch (err) {
    console.warn('Class student list fallback also failed:', err.message);
    return null;
  }
}

// True when the student has no outstanding fee transaction.
//
// This used to be hardcoded false at generation, so every freshly generated
// card displayed a red "Fees Pending" badge whether or not the family owed
// anything — and, because releasing is gated on fees being clear, "Release All"
// silently matched nothing until an admin happened to click "Refresh Fee
// Status". Computing it here means the card is right the moment it exists.
//
// Mirrors checkFeesCleared() in report-card-admin.js: 'pending' is the status
// set when a transaction is raised; 'approved'/'rejected' have been dealt with.
// Fails CLOSED (returns false) so a lookup error can never release a card that
// should have been held.
async function hasClearedFees(studentId) {
  try {
    const snap = await getDocs(query(
      collection(db, 'fee_transactions'),
      where('studentId', '==', studentId),
      where('status', '==', 'pending')
    ));
    return snap.empty;
  } catch (err) {
    console.warn(`Fee check failed for ${studentId}:`, err.message);
    return false;
  }
}

function extractFirstName(fullName) {
  if (!fullName) return '';
  return fullName.trim().split(/\s+/)[0];
}

// Looks up this student's Half-Yearly class test mark for one subject, from
// the locally-synced cache (same local-first assumption as the rest of this
// report-card pipeline, which reads sessions via getAllSessions()). Returns
// null wherever no class test is configured/entered — gradeSubject() then
// falls back to assessment-only, exactly as before this feature existed.
function getClassTestForSubject(className, term, subjectId, studentId) {
  const record = getClassTest(term, className, subjectId);
  if (!record) return null;
  const marksObtained = record.marks?.[studentId];
  if (typeof marksObtained !== 'number') return null;
  return { marksObtained, maxMarks: record.test?.max_marks };
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
 * @param {number} [params.attendancePresentDays] - Manually entered by the admin
 *   generating the card — same procedure as Sfs-report-card's Class III-X
 *   markentry.html (plain typed-in present/total days), not pulled from any
 *   attendance_daily/attendance_monthly snapshot. Omit to leave blank.
 * @param {number} [params.attendanceWorkingDays]
 * @returns {Promise<{ ok: boolean, docId: string, error?: string }>}
 */
export async function buildAndSaveReportCard(params) {
  const {
    studentId, className, term, academicYear, dateFrom, dateTo, generatedBy,
    attendancePresentDays = null, attendanceWorkingDays = null
  } = params;

  try {
    // 1. Load student info
    const studentRec = await fetchStudentRecord(studentId, className);
    const studentName = studentRec?.full_name || studentRec?.name || studentId;
    const firstName   = extractFirstName(studentName);
    const rollNo      = studentRec?.roll_no || studentRec?.rollNo || '';
    const section     = studentRec?.section || '';

    // 1b. Narrative classes (Play Group) never reach the academic pipeline.
    // They have no subjects in subjects.json, so no sessions can exist for
    // them, so the totalSessionsIncluded === 0 guard below would reject every
    // card forever. Their card is assembled from hand-entered data instead:
    // co-scholastic grades, observations, remarks and attendance.
    const growthPrompts = await loadGrowthPromptsForClass(className).catch(() => []);
    if (growthPrompts.length) {
      return await buildNarrativeReportCard({
        studentId, studentName, firstName, rollNo, section,
        className, term, academicYear, dateFrom, dateTo, generatedBy,
        growthPrompts,
        attendancePresentDays, attendanceWorkingDays
      });
    }

    // 2. Aggregate session marks
    const aggregated = await aggregateStudentForReportCard(studentId, dateFrom, dateTo, className);

    // If no sessions at all, skip with a clear signal — distinguishing "no
    // data was ever entered" from "data exists but nobody has reviewed it
    // yet", since the latter is silently invisible otherwise.
    if (aggregated.totalSessionsIncluded === 0) {
      const error = aggregated.totalSessionsPendingReview > 0
        ? `${aggregated.totalSessionsPendingReview} session(s) with marks exist for this student in the selected period, but none are reviewed/locked yet — nothing to include.`
        : 'No finalized sessions found for this student in the selected period.';
      return { ok: false, docId: null, skipped: true, error };
    }

    // 3. Grade each subject — blend in the Half-Yearly class test where one
    // exists (Class I/II subjects only; LKG/SKG and any subject without a
    // configured class test fall back to assessment-only, unchanged).
    const gradedSubjects = aggregated.subjects.map(s =>
      gradeSubject(s, getClassTestForSubject(className, term, s.subject_id, studentId))
    );

    // 4. Compute overall performance
    const overall = computeOverallPerformance(gradedSubjects);

    // 4a. Co-scholastic — letter-graded per term, not criteria-scored. Kept out
    // of `overall` on purpose: Sfs-report-card marks these countInTotal:false
    // for Class III-X, so including them here would make Class I/II inconsistent
    // with the rest of the school and let conduct grades move an academic grade.
    let coScholastic = [];
    try {
      const csSubjects = await loadCoScholasticForClass(className);
      if (csSubjects.length) {
        coScholastic = getStudentCoScholastic(term, className, studentId, csSubjects);
      }
    } catch (err) {
      console.warn(`Co-scholastic unavailable for ${studentId}:`, err.message);
    }

    // 4b. Data-completeness signal: subjects that have unreviewed sessions
    // excluded from this card, so admins can tell "no data" apart from "data
    // exists but wasn't reviewed/locked yet" instead of it silently vanishing.
    const subjectNameById = Object.fromEntries(aggregated.subjects.map(s => [s.subject_id, s.subject_name]));
    const subjectsPendingReviewNames = (aggregated.subjectsPendingReview || []).map(id => subjectNameById[id] || id);

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

    // 5b. Attendance — read from the same Class Attendance grid the Class III-X
    // system uses (marks/{classId}_{HY|FT}/students/{id}.attendance). An
    // explicitly passed value still wins, so the admin panel's Edit Attendance
    // can correct a card without the grid overwriting it on regeneration.
    let attendance = { attendancePresentDays, attendanceWorkingDays };
    if (attendancePresentDays === null && attendanceWorkingDays === null) {
      attendance = await getTermAttendance({ studentId, className, term })
        .catch(err => {
          console.warn(`Attendance lookup failed for ${studentId}:`, err.message);
          return { attendancePresentDays: null, attendanceWorkingDays: null };
        });
    }

    // 6. Assemble document
    // academicYear is part of the id — without it, generating this term's
    // report card again next academic year would overwrite this one, since
    // studentId stays the same across years (only className changes).
    const docId = `${sanitizeDocId(studentId)}_${sanitizeDocId(academicYear)}_${term}`;

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
        subject_id:        s.subject_id,
        subject_name:      s.subject_name,
        subjectGrade:      s.subjectGrade?.code || 'Ex',
        subjectAverage:    s.subjectAverage,
        assessmentAverage: s.assessmentAverage ?? null,
        classTestScore:    s.classTestScore ?? null,
        classTestMarks:    s.classTestMarks ?? null,
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

      // Co-scholastic — letter grades, reported separately from academics and
      // excluded from overallAverageScore by design (see step 4a).
      coScholastic: coScholastic.map(c => ({
        key:   c.key,
        label: c.label,
        grade: c.grade || null
      })),
      coScholasticPending: coScholastic.filter(c => !c.grade).map(c => c.label),

      // Promotion (HY2 only — admin fills)
      promotedToClass: null,

      // Data completeness — subjects with real marks entered but excluded
      // because their sessions aren't reviewed/locked yet. Lets the admin
      // panel warn before releasing an incomplete card.
      subjectsPendingReview: subjectsPendingReviewNames,

      // Workflow
      status:         'draft',
      feesCleared:    await hasClearedFees(studentId),
      generatedBy:    generatedBy || 'Admin',
      generatedAt:    serverTimestamp(),
      releasedBy:     null,
      releasedAt:     null,
      lastModifiedAt: serverTimestamp()
    };

    // 7. Write to Firestore
    await setDoc(doc(db, REPORT_CARDS_COL, docId), reportCard, { merge: false });

    return { ok: true, docId, studentName, subjectsPendingReview: subjectsPendingReviewNames };

  } catch (err) {
    console.error(`buildAndSaveReportCard failed for ${studentId}:`, err);
    return { ok: false, docId: null, error: err.message };
  }
}

/**
 * Builds a card for a class whose report is written rather than computed —
 * currently Play Group only.
 *
 * Everything here is typed in by the class teacher: letter grades on the
 * co-scholastic screen, and observations, remarks and attendance on the
 * Observations screen. Nothing is aggregated, graded or AI-generated, so the
 * academic fields are present but empty rather than absent: the report card
 * admin panel, the release flow and the parent lookup all read this same shape
 * for every class, and a card missing `subjects` or `overallGrade` would break
 * them in ways that only show up at release time.
 */
async function buildNarrativeReportCard({
  studentId, studentName, firstName, rollNo, section,
  className, term, academicYear, dateFrom, dateTo, generatedBy,
  growthPrompts, attendancePresentDays, attendanceWorkingDays
}) {
  const docId = `${sanitizeDocId(studentId)}_${sanitizeDocId(academicYear)}_${term}`;
  const termLabel = getTermLabel(term);

  // The narrative service is local-cache-first; the admin generating cards may
  // never have opened the Observations screen in this browser, so pull the
  // collection down before reading it or every card comes out blank.
  await syncNarrativesFromFirestore().catch(() => null);
  const narrative = getStudentNarrative(className, studentId, growthPrompts);

  // Co-scholastic letter grades — the same source and helper every other class
  // uses, so Play Group's grades are read exactly like Class I's.
  let coScholastic = [];
  try {
    const csSubjects = await loadCoScholasticForClass(className);
    if (csSubjects.length) {
      coScholastic = getStudentCoScholastic(term, className, studentId, csSubjects);
    }
  } catch (err) {
    console.warn(`Co-scholastic unavailable for ${studentId}:`, err.message);
  }

  // Attendance: an explicitly passed value (admin's Edit Attendance) wins,
  // otherwise use what the teacher typed on the Observations screen. Note the
  // `??` — a genuine 0 days present must not fall through to the teacher's
  // value the way `||` would let it.
  const typed = narrative.attendance?.[term] || { present: null, total: null };
  const presentDays = attendancePresentDays ?? typed.present ?? null;
  const workingDays = attendanceWorkingDays ?? typed.total   ?? null;

  const teacherRemark = narrative.remarks?.[term] || '';

  const reportCard = {
    studentId, docId, studentName, firstName, className,
    rollNo: String(rollNo), section,

    term, termLabel, academicYear, dateFrom, dateTo,

    // No academic subjects by design — see the doc comment above.
    subjects: [],
    overallAverageScore: null,
    overallGrade:        'Ex',
    overallLabel:        'Not Applicable',
    strongestSubject:    null,
    weakestSubject:      null,
    improvementAreas:    [],
    trendDirection:      'stable',
    attendanceRisk:      false,

    // Written by the class teacher, not generated — so the two "was this
    // touched by a human" flags are the inverse of every other class's.
    teacherRemark,
    remarkGeneratedByAI: false,
    remarkEditedByAdmin: false,

    attendancePresentDays: presentDays,
    attendanceWorkingDays: workingDays,

    coScholastic: coScholastic.map(c => ({ key: c.key, label: c.label, grade: c.grade || null })),
    coScholasticPending: coScholastic.filter(c => !c.grade).map(c => c.label),

    // The one field no other class has: the three-column running record. Stored
    // resolved against the configured prompts so the printed card does not have
    // to re-read the registry to know how many rows there are.
    growthObservation: (narrative.growth || []).map(g => ({
      key: g.key, prompt: g.prompt, start: g.start, half: g.half, end: g.end
    })),

    promotedToClass: null,
    subjectsPendingReview: [],

    status:         'draft',
    feesCleared:    await hasClearedFees(studentId),
    generatedBy:    generatedBy || 'Admin',
    generatedAt:    serverTimestamp(),
    releasedBy:     null,
    releasedAt:     null,
    lastModifiedAt: serverTimestamp()
  };

  await setDoc(doc(db, REPORT_CARDS_COL, docId), reportCard, { merge: false });
  return { ok: true, docId, studentName, subjectsPendingReview: [] };
}
