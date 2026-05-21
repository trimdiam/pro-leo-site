export function classifySeverity(overallPercentage, flags = []) {
  if (overallPercentage < 25) {
    return { level: 'critical', label: 'Critical', color: '#dc3545', borderColor: '#dc3545', bgColor: '#fff5f5' };
  }
  if (overallPercentage < 40) {
    return { level: 'moderate', label: 'Moderate', color: '#e67e22', borderColor: '#e67e22', bgColor: '#fff8f0' };
  }
  if (flags.includes('attendance_risk') || flags.includes('missing_assessments')) {
    return { level: 'caution', label: 'Caution', color: '#f1c40f', borderColor: '#f1c40f', bgColor: '#fffdf5' };
  }
  return { level: 'low', label: 'At Risk', color: '#6c757d', borderColor: '#adb5bd', bgColor: '#f8f9fa' };
}

export function getSeverityPriority(level) {
  const priorities = { critical: 0, moderate: 1, caution: 2, low: 3 };
  return priorities[level] ?? 3;
}

export function getSeveritySummary(flaggedStudents) {
  const summary = {
    critical: 0,
    moderate: 0,
    caution: 0,
    improving: 0,
    declining: 0,
    stable: 0,
    total: flaggedStudents.length
  };

  flaggedStudents.forEach(s => {
    const sev = classifySeverity(s.overallPercentage, s.flags);
    summary[sev.level]++;
    if (s.trend?.direction === 'improving') summary.improving++;
    if (s.trend?.direction === 'declining') summary.declining++;
    if (s.trend?.direction === 'stable') summary.stable++;
  });

  return summary;
}
