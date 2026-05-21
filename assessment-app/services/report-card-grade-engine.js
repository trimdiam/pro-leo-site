// ── Report Card Grade Engine ──────────────────────────────────────────────────
// Maps numeric average scores (1–5) to the school's Adv/Prof/Dev/Beg/NY/Ex
// descriptors, grades subjects, and computes overall student performance.
// Addendum A overrides: this scale replaces all A+/A/B/C/D references.

/**
 * Maps a numeric average score to a grade descriptor.
 * @param {number|null} averageScore
 * @returns {{ code: string, word: string, label: string, colorClass: string, footnote?: string }}
 */
export function mapScoreToGrade(averageScore) {
  if (averageScore === null || averageScore === undefined) {
    return { code: 'Ex', word: 'Exempt', label: 'Exempt / No Data', colorClass: 'grade-ex' };
  }
  if (averageScore >= 4.5) {
    return { code: 'Adv',  word: 'Advanced',   label: 'Advanced',   colorClass: 'grade-adv' };
  }
  if (averageScore >= 3.5) {
    return { code: 'Prof', word: 'Proficient', label: 'Proficient', colorClass: 'grade-prof' };
  }
  if (averageScore >= 2.5) {
    return { code: 'Dev',  word: 'Developing', label: 'Developing', colorClass: 'grade-dev' };
  }
  if (averageScore >= 1.5) {
    return { code: 'Beg',  word: 'Beginning',  label: 'Beginning',  colorClass: 'grade-beg' };
  }
  return {
    code: 'NY', word: 'Not Yet', label: 'Not Yet', colorClass: 'grade-ny',
    footnote: 'Indicates the student has the potential to still achieve this milestone.'
  };
}

/**
 * Grades all criteria within a subject and computes the subject-level grade.
 * @param {{ subject_id: string, subject_name: string, criteria: Array, pending?: boolean }} subjectData
 * @returns {object} GradedSubject
 */
export function gradeSubject(subjectData) {
  if (subjectData.pending) {
    return {
      ...subjectData,
      subjectGrade: mapScoreToGrade(null),
      subjectAverage: null
    };
  }

  const gradedCriteria = subjectData.criteria.map(c => ({
    ...c,
    grade: mapScoreToGrade(c.averageScore ?? null)
  }));

  // Subject average = mean of criteria that have a numeric average
  const scored = gradedCriteria.filter(c => typeof c.averageScore === 'number');
  const subjectAverage = scored.length > 0
    ? scored.reduce((sum, c) => sum + c.averageScore, 0) / scored.length
    : null;

  return {
    subject_id:     subjectData.subject_id,
    subject_name:   subjectData.subject_name,
    criteria:       gradedCriteria,
    subjectAverage: subjectAverage !== null ? Math.round(subjectAverage * 100) / 100 : null,
    subjectGrade:   mapScoreToGrade(subjectAverage)
  };
}

/**
 * Computes overall performance grade across all subjects.
 * Identifies strongest/weakest subject and criteria needing improvement.
 * @param {object[]} gradedSubjects
 * @returns {object} OverallPerformance
 */
export function computeOverallPerformance(gradedSubjects) {
  const scoredSubjects = gradedSubjects.filter(s => typeof s.subjectAverage === 'number');

  let overallAverageScore = null;
  let overallGrade = mapScoreToGrade(null);
  let strongestSubject = null;
  let weakestSubject = null;

  if (scoredSubjects.length > 0) {
    overallAverageScore = scoredSubjects.reduce((sum, s) => sum + s.subjectAverage, 0) / scoredSubjects.length;
    overallAverageScore = Math.round(overallAverageScore * 100) / 100;
    overallGrade = mapScoreToGrade(overallAverageScore);

    const sorted = [...scoredSubjects].sort((a, b) => b.subjectAverage - a.subjectAverage);
    strongestSubject = { subject_name: sorted[0].subject_name, averageScore: sorted[0].subjectAverage, grade: sorted[0].subjectGrade };
    weakestSubject   = { subject_name: sorted[sorted.length - 1].subject_name, averageScore: sorted[sorted.length - 1].subjectAverage, grade: sorted[sorted.length - 1].subjectGrade };
  }

  // Collect criteria graded Beg or NY as improvement areas
  const flaggedCriteria = [];
  const improvementAreas = [];
  gradedSubjects.forEach(s => {
    (s.criteria || []).forEach(c => {
      if (c.grade && (c.grade.code === 'Beg' || c.grade.code === 'NY')) {
        flaggedCriteria.push({ subject_name: s.subject_name, criterion_name: c.criterion_name, grade: c.grade });
        improvementAreas.push(`${c.criterion_name} in ${s.subject_name}`);
      }
    });
  });

  return {
    overallAverageScore,
    overallGrade,
    overallLabel: overallGrade.word,
    strongestSubject,
    weakestSubject,
    flaggedCriteria,
    improvementAreas
  };
}

// ── Academic Year Utilities ───────────────────────────────────────────────────

/**
 * Returns academic year string based on current date (school year: April–March).
 * e.g. May 2026 → "2025-26", January 2026 → "2025-26", April 2026 → "2026-27"
 * @returns {string}
 */
export function getCurrentAcademicYear() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 4) {
    return `${year}-${String(year + 1).slice(2)}`;
  }
  return `${year - 1}-${String(year).slice(2)}`;
}

/**
 * Returns date range and label for a given term in the current academic year.
 * @param {'HY1'|'HY2'} term
 * @returns {{ dateFrom: string, dateTo: string, termLabel: string }}
 */
export function getTermDateRange(term) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const startYear = month >= 4 ? year : year - 1;

  if (term === 'HY1') {
    return {
      dateFrom:  `${startYear}-04-01`,
      dateTo:    `${startYear}-09-30`,
      termLabel: 'First Half-Yearly'
    };
  }
  return {
    dateFrom:  `${startYear}-10-01`,
    dateTo:    `${startYear + 1}-03-31`,
    termLabel: 'Second Half-Yearly'
  };
}

/**
 * Maps a term key to a human-readable label.
 * @param {'HY1'|'HY2'} term
 * @returns {string}
 */
export function getTermLabel(term) {
  return term === 'HY1' ? 'First Half-Yearly' : 'Second Half-Yearly';
}
