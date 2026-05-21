import { getPreviousMonth, classifyPerformance } from './comparison-engine.js';
import { detectWeakStudents } from './weak-student-engine.js';
import { aggregateByMonth } from './aggregation-engine.js';
import { getStudentTrend } from './trend-engine.js';

export async function getMonthlyInsights(yearMonth, className) {
  const prevYearMonth = getPreviousMonth(yearMonth);

  const [current, previous] = await Promise.all([
    aggregateByMonth(yearMonth, className),
    prevYearMonth ? aggregateByMonth(prevYearMonth, className) : null
  ]);

  const insights = {
    current,
    previous,
    subjects: [],
    students: [],
    extremes: {},
    weakSnapshot: {},
    trends: {},
    comparisons: []
  };

  if (current.subjects.length > 0) {
    const ranked = [...current.subjects].sort((a, b) => b.averagePercentage - a.averagePercentage);
    insights.subjects = ranked.map((sub, idx) => {
      const prevSub = previous?.subjects.find(p => p.subject_id === sub.subject_id);
      const delta = prevSub ? sub.averagePercentage - prevSub.averagePercentage : 0;
      const perf = classifyPerformance(sub.averagePercentage);
      return {
        ...sub,
        rank: idx + 1,
        delta,
        trend: delta >= 3 ? 'improving' : delta <= -3 ? 'declining' : 'stable',
        trendLabel: delta >= 3 ? `↑ +${delta}%` : delta <= -3 ? `↓ ${delta}%` : '→ Stable',
        performance: perf
      };
    });
  }

  if (current.students.length > 0) {
    const studentPromises = current.students.map(async s => {
      const prevStu = previous?.students.find(p => p.student_id === s.student_id);
      const delta = prevStu ? s.overallPercentage - prevStu.overallPercentage : 0;
      const perf = classifyPerformance(s.overallPercentage);
      const weak = s.overallPercentage < 40;
      return {
        ...s,
        delta,
        trend: delta >= 5 ? 'improving' : delta <= -5 ? 'declining' : 'stable',
        trendLabel: delta >= 5 ? `↑ +${delta}%` : delta <= -5 ? `↓ ${delta}%` : '→ Stable',
        performance: perf,
        isWeak: weak
      };
    });
    insights.students = await Promise.all(studentPromises);
    insights.students.sort((a, b) => b.overallPercentage - a.overallPercentage);
  }

  if (insights.students.length > 0) {
    const highest = insights.students[0];
    const lowest = insights.students[insights.students.length - 1];
    const improving = [...insights.students].sort((a, b) => b.delta - a.delta)[0];
    const declining = [...insights.students].sort((a, b) => a.delta - b.delta)[0];
    const mostConsistent = insights.students.filter(s => s.trend === 'stable')[0] || null;

    insights.extremes = { highest, lowest, improving, declining, mostConsistent };
  }

  const weakStudents = detectWeakStudents(current);
  insights.weakSnapshot = {
    critical: weakStudents.filter(s => s.overallPercentage < 25).length,
    moderate: weakStudents.filter(s => s.overallPercentage >= 25 && s.overallPercentage < 40).length,
    improving: insights.students.filter(s => s.trend === 'improving' && s.isWeak).length,
    declining: insights.students.filter(s => s.trend === 'declining').length,
    total: weakStudents.length
  };

  if (previous && current.classAverage !== undefined && previous.classAverage !== undefined) {
    const classDelta = current.classAverage - previous.classAverage;
    insights.trends.classTrend = {
      delta: classDelta,
      label: classDelta >= 3 ? `↑ +${classDelta}%` : classDelta <= -3 ? `↓ ${classDelta}%` : '→ Stable',
      direction: classDelta >= 3 ? 'improving' : classDelta <= -3 ? 'declining' : 'stable'
    };
  }

  insights.trends.subjectTrends = insights.subjects.filter(s => s.trend !== 'stable');

  return insights;
}

export function getSubjectRanking(subjects) {
  return [...subjects].sort((a, b) => b.averagePercentage - a.averagePercentage).map((s, i) => ({
    ...s,
    rank: i + 1
  }));
}

export async function getClassComparisonForMonth(yearMonth, allClasses) {
  const results = [];
  for (const className of allClasses) {
    const agg = await aggregateByMonth(yearMonth, className);
    if (agg.students.length > 0) {
      results.push({
        class: className,
        average: agg.classAverage,
        students: agg.students.length,
        assessments: agg.totalAssessments
      });
    }
  }
  results.sort((a, b) => b.average - a.average);
  return results;
}
