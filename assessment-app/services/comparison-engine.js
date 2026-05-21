import { aggregateByMonth, getEligibleSessions, extractYearMonth } from './aggregation-engine.js';
import { getCompletionAnalytics } from './analytics-engine.js';

export async function getMonthTrend(className, currentYearMonth) {
  const prevYearMonth = getPreviousMonth(currentYearMonth);
  if (!prevYearMonth) return { delta: 0, direction: 'stable', label: 'No previous data' };

  const [current, previous] = await Promise.all([
    aggregateByMonth(currentYearMonth, className),
    aggregateByMonth(prevYearMonth, className)
  ]);

  if (!current || !previous || current.classAverage === undefined || previous.classAverage === undefined) {
    return { delta: 0, direction: 'stable', label: 'Insufficient data' };
  }

  const delta = current.classAverage - previous.classAverage;

  if (delta >= 3) return { delta, direction: 'improving', label: `↑ +${delta}%` };
  if (delta <= -3) return { delta, direction: 'declining', label: `↓ ${delta}%` };
  return { delta, direction: 'stable', label: '→ Stable' };
}

export function getPreviousMonth(yearMonth) {
  if (!yearMonth || typeof yearMonth !== 'string') return null;
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return null;
  const d = new Date(year, month - 1, 1);
  d.setMonth(d.getMonth() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function classifyPerformance(percentage) {
  if (percentage >= 75) return { label: 'Strong', className: 'perf-strong', color: '#1d7a3e' };
  if (percentage >= 60) return { label: 'Average', className: 'perf-average', color: '#226b63' };
  if (percentage >= 40) return { label: 'Needs Attention', className: 'perf-needs', color: '#be7c2f' };
  return { label: 'Critical', className: 'perf-critical', color: '#9f1d1d' };
}

export async function getClassComparison(classes, yearMonth) {
  const results = [];

  for (const className of classes) {
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

  if (results.length < 2) return { best: null, worst: null, comparisons: [] };

  results.sort((a, b) => b.average - a.average);

  const best = results[0];
  const worst = results[results.length - 1];
  const comparisons = [];

  for (let i = 1; i < results.length; i++) {
    const diff = results[0].average - results[i].average;
    comparisons.push(`${results[i].class} is ${diff}% below ${results[0].class}`);
  }

  return { best, worst, comparisons };
}

export async function getSubjectComparison(className, yearMonth) {
  const agg = await aggregateByMonth(yearMonth, className);

  if (agg.subjects.length < 2) return { best: null, worst: null, comparisons: [] };

  const sorted = [...agg.subjects].sort((a, b) => b.averagePercentage - a.averagePercentage);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const comparisons = [];

  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[0].averagePercentage - sorted[i].averagePercentage;
    comparisons.push(`${sorted[i].subject_name} trails ${sorted[0].subject_name} by ${diff}%`);
  }

  return { best, worst, comparisons };
}

export async function getCompletionTrend(className, yearMonth) {
  const current = getCompletionAnalytics(className, yearMonth);
  const prevYearMonth = getPreviousMonth(yearMonth);
  const previous = prevYearMonth ? getCompletionAnalytics(className, prevYearMonth) : null;

  if (!previous || previous.total === 0) {
    return { delta: 0, direction: 'stable', label: `${current.completionRate}% completion` };
  }

  const delta = current.completionRate - previous.completionRate;

  if (delta >= 5) return { delta, direction: 'improving', label: `↑ ${current.completionRate}% (+${delta}%)` };
  if (delta <= -5) return { delta, direction: 'declining', label: `↓ ${current.completionRate}% (${delta}%)` };
  return { delta, direction: 'stable', label: `${current.completionRate}% completion` };
}
