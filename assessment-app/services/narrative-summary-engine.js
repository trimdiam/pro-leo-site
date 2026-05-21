import { classifyPerformance } from './comparison-engine.js';

export function generateNarrativeSummary(insights) {
  const { current, subjects, extremes, weakSnapshot, trends } = insights;
  const parts = [];

  if (!current || current.students.length === 0) {
    return 'No assessment data available for this period.';
  }

  const perf = classifyPerformance(current.classAverage);
  parts.push(`Overall school performance is ${perf.label.toLowerCase()} at ${current.classAverage}%.`);

  if (trends.classTrend) {
    if (trends.classTrend.direction === 'improving') {
      parts.push(`Class average improved by ${trends.classTrend.delta}% compared to last month.`);
    } else if (trends.classTrend.direction === 'declining') {
      parts.push(`Class average declined by ${Math.abs(trends.classTrend.delta)}% compared to last month.`);
    } else {
      parts.push(`Performance remained stable compared to last month.`);
    }
  }

  const improvingSubjects = subjects.filter(s => s.trend === 'improving');
  const decliningSubjects = subjects.filter(s => s.trend === 'declining');

  if (improvingSubjects.length > 0) {
    const names = improvingSubjects.map(s => s.subject_name).join(', ');
    parts.push(`${names} showed improvement this month.`);
  }

  if (decliningSubjects.length > 0) {
    const names = decliningSubjects.map(s => s.subject_name).join(', ');
    parts.push(`${names} experienced a decline and may need attention.`);
  }

  if (weakSnapshot.total > 0) {
    if (weakSnapshot.critical > 0) {
      parts.push(`${weakSnapshot.critical} student(s) are in critical condition and require immediate intervention.`);
    }
    if (weakSnapshot.moderate > 0) {
      parts.push(`${weakSnapshot.moderate} student(s) need additional support.`);
    }
    if (weakSnapshot.improving > 0) {
      parts.push(`${weakSnapshot.improving} previously weak student(s) are showing improvement.`);
    }
  } else {
    parts.push('No weak students were detected this month.');
  }

  if (extremes.highest && extremes.lowest) {
    parts.push(`Top performer: ${extremes.highest.full_name} (${extremes.highest.overallPercentage}%). Lowest: ${extremes.lowest.full_name} (${extremes.lowest.overallPercentage}%).`);
  }

  return parts.join(' ');
}
