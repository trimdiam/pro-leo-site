// ── Report Card Aggregator ────────────────────────────────────────────────────
// Reads all reviewed/locked sessions for a student within a date window,
// cross-references the live subject+criteria engine (Addendum B — never hardcode),
// and returns a structured AggregatedStudentData object.

import { getAllSessions } from './session-storage.js';
import { loadSubjects, getSubjectsForClass } from './subject-loader.js';
import { loadCriteriaForSubject } from './criteria-loader.js';

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Builds the authoritative subject+criteria map for a class from the live loaders.
 * This is the single source of truth — report cards always reflect the curriculum.
 * @param {string} className
 * @returns {Promise<Array>}
 */
async function buildSubjectCriteriaMap(className) {
  const allSubjects = await loadSubjects();
  const classSubjects = getSubjectsForClass(allSubjects, className);

  const map = [];

  for (const subject of classSubjects) {
    let criteria = [];
    try {
      criteria = await loadCriteriaForSubject(subject, className);
    } catch (err) {
      console.warn(`Criteria not available for ${subject.subject_name} in ${className}:`, err.message);
      criteria = [];
    }

    if (!criteria || criteria.length === 0) {
      // LKG/SKG or subjects not yet defined — flag as pending, do not crash
      map.push({
        subject_id:   subject.subject_id,
        subject_name: subject.subject_name,
        criteria:     [],
        pending:      true,
        pendingNote:  'Assessment criteria for this subject are being finalized.'
      });
    } else {
      map.push({
        subject_id:   subject.subject_id,
        subject_name: subject.subject_name,
        criteria:     criteria.map(c => ({
          criterion_id:   c.criterion_id,
          criterion_name: c.criterion_name,
          category:       c.category || 'General'
        }))
      });
    }
  }

  return map;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Aggregates all reviewed/locked session marks for a student
 * across a given half-year window.
 *
 * @param {string} studentId   - Universal student ID e.g. "SFS/2025/001"
 * @param {string} dateFrom    - ISO date string "2025-04-01"
 * @param {string} dateTo      - ISO date string "2025-09-30"
 * @param {string} className   - e.g. "Class I"
 * @returns {Promise<object>}  - AggregatedStudentData
 */
export async function aggregateStudentForReportCard(studentId, dateFrom, dateTo, className) {
  // 1. Get the live curriculum structure
  const subjectMap = await buildSubjectCriteriaMap(className);

  // 2. Load all local sessions and filter to finalized ones in the date window
  const allEntries = getAllSessions();

  const finalized = allEntries.filter(entry => {
    const s = entry.session;
    if (!s) return false;
    if (s.status !== 'reviewed' && s.status !== 'locked') return false;

    // Backward compat: sessions without weekStart use date as both start/end
    const start = s.weekStart || s.date;
    const end   = s.weekEnd   || s.date;
    if (!start || !end) return false;

    if (start < dateFrom || end > dateTo) return false;
    if (!entry.marks || !entry.marks[studentId]) return false;
    return true;
  });

  // 3. Build result: for each subject → for each criterion → collect scores
  const subjects = subjectMap.map(subjectDef => {
    if (subjectDef.pending) {
      return {
        subject_id:   subjectDef.subject_id,
        subject_name: subjectDef.subject_name,
        criteria:     [],
        pending:      true,
        pendingNote:  subjectDef.pendingNote
      };
    }

    // All sessions for this subject
    const subjectSessions = finalized.filter(e => e.session.subject_id === subjectDef.subject_id);

    const criteria = subjectDef.criteria.map(criterionDef => {
      const scores = [];
      let absentCount = 0;

      subjectSessions.forEach(entry => {
        const studentMarks = entry.marks[studentId];
        const raw = studentMarks?.[criterionDef.criterion_id];

        if (raw === null || raw === undefined) return;

        if (typeof raw === 'object' && raw.attendance === 'absent') {
          absentCount++;
          return;
        }

        if (typeof raw === 'number') {
          scores.push(raw);
        }
      });

      const averageScore = scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        : null;

      return {
        criterion_id:   criterionDef.criterion_id,
        criterion_name: criterionDef.criterion_name,
        category:       criterionDef.category || 'General',
        scores,
        absentCount,
        averageScore,
        sessionCount: subjectSessions.length
      };
    });

    return {
      subject_id:   subjectDef.subject_id,
      subject_name: subjectDef.subject_name,
      criteria
    };
  });

  return {
    studentId,
    dateFrom,
    dateTo,
    className,
    totalSessionsIncluded: finalized.length,
    subjects
  };
}
