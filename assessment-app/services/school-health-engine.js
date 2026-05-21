import { getSchoolOverview, getCompletionAnalytics } from './analytics-engine.js';
import { aggregateByMonth } from './aggregation-engine.js';
import { detectWeakStudents } from './weak-student-engine.js';
import { getClassAttendanceOverview } from './attendance-engine.js';

export async function getSchoolHealthScore(yearMonth, className) {
  const overview = await getSchoolOverview();

  let classAgg = null;
  let weakCount = 0;
  let totalStudents = 0;

  if (className && yearMonth) {
    classAgg = await aggregateByMonth(yearMonth, className);
    if (classAgg.students.length > 0) {
      const weak = detectWeakStudents(classAgg);
      weakCount = weak.length;
      totalStudents = classAgg.students.length;
    }
  } else {
    const sessions = overview.classData || [];
    for (const cls of sessions) {
      if (yearMonth) {
        const agg = await aggregateByMonth(yearMonth, cls.class);
        if (agg.students.length > 0) {
          const weak = detectWeakStudents(agg);
          weakCount += weak.length;
          totalStudents += agg.students.length;
        }
      }
    }
  }

  const completion = getCompletionAnalytics(className || '', yearMonth || '');

  const avgScore = overview.classData.length > 0
    ? Math.round(overview.classData.reduce((sum, c) => sum + c.averagePercentage, 0) / overview.classData.length)
    : 0;

  const completionScore = completion.completionRate;
  const weakRatio = totalStudents > 0 ? (weakCount / totalStudents) : 0;
  const weakScore = Math.max(0, Math.round((1 - weakRatio) * 100));

  // Attendance health
  let attendanceScore = 100;
  let classAbsenceRate = 0;
  if (className) {
    const att = getClassAttendanceOverview(className, yearMonth || '');
    classAbsenceRate = att.classAbsenceRate;
    attendanceScore = Math.max(0, Math.round((1 - (classAbsenceRate / 100)) * 100));
  }

  const healthScore = Math.round((avgScore * 0.4) + (completionScore * 0.25) + (weakScore * 0.2) + (attendanceScore * 0.15));

  let statusLabel = 'Critical';
  let statusClass = 'health-critical';
  if (healthScore >= 75) { statusLabel = 'Strong'; statusClass = 'health-strong'; }
  else if (healthScore >= 60) { statusLabel = 'Good'; statusClass = 'health-good'; }
  else if (healthScore >= 40) { statusLabel = 'Moderate'; statusClass = 'health-moderate'; }

  return {
    score: healthScore,
    statusLabel,
    statusClass,
    breakdown: {
      academic: avgScore,
      completion: completionScore,
      studentHealth: weakScore,
      attendance: attendanceScore
    },
    metrics: {
      totalClasses: overview.totalClasses,
      totalStudents: overview.totalStudents,
      totalSessions: overview.totalSessions,
      completedSessions: overview.completedSessions,
      weakStudents: weakCount,
      completionRate: completionScore,
      classAbsenceRate
    }
  };
}
