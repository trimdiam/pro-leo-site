export function extractWeakSubjects(student, threshold = 40) {
  if (!student.subjects || student.subjects.length === 0) return [];
  return student.subjects
    .filter(sub => sub.percentage < threshold)
    .map(sub => sub.subject_name);
}

export function extractMissingAssessments(student, totalAssessments) {
  if (!totalAssessments || totalAssessments <= 0) return 0;
  return Math.max(0, totalAssessments - (student.totalSessions || 0));
}

export function buildStudentSummary(student, totalAssessments) {
  const weakSubjects = extractWeakSubjects(student);
  const missingCount = extractMissingAssessments(student, totalAssessments);

  const parts = [];
  if (weakSubjects.length > 0) {
    parts.push(`Weak: ${weakSubjects.join(', ')}`);
  }
  if (missingCount > 0) {
    parts.push(`Missing: ${missingCount}`);
  }

  return {
    weakSubjects,
    missingCount,
    summaryText: parts.join(' • ') || 'No issues'
  };
}

export function filterStudents(flagged, filters = {}) {
  return flagged.filter(s => {
    if (filters.severity && filters.severity.length > 0) {
      if (!filters.severity.includes(s.severity?.level)) return false;
    }
    if (filters.search) {
      const term = filters.search.toLowerCase();
      const matchName = (s.full_name || '').toLowerCase().includes(term);
      const matchId = (s.student_id || '').toLowerCase().includes(term);
      const matchRoll = String(s.roll_no || '').includes(term);
      if (!matchName && !matchId && !matchRoll) return false;
    }
    if (filters.trend && filters.trend.length > 0) {
      if (!filters.trend.includes(s.trend?.direction)) return false;
    }
    return true;
  });
}
