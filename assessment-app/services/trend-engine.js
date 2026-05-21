import { aggregateByMonth } from './aggregation-engine.js';

export async function getStudentTrend(studentId, className, currentYearMonth) {
  const prevYearMonth = getPreviousMonth(currentYearMonth);

  const [currentAgg, prevAgg] = await Promise.all([
    aggregateByMonth(currentYearMonth, className),
    prevYearMonth ? aggregateByMonth(prevYearMonth, className) : null
  ]);

  const current = currentAgg?.students?.find(s => s.student_id === studentId);
  const previous = prevAgg?.students?.find(s => s.student_id === studentId);

  if (!current) return { direction: 'stable', label: 'No Data', delta: 0 };
  if (!previous) return { direction: 'stable', label: 'New', delta: 0 };

  const delta = current.overallPercentage - previous.overallPercentage;

  if (delta >= 5) return { direction: 'improving', label: 'Improving', delta };
  if (delta <= -5) return { direction: 'declining', label: 'Declining', delta };
  return { direction: 'stable', label: 'Stable', delta };
}

function getPreviousMonth(yearMonth) {
  if (!yearMonth || typeof yearMonth !== 'string') return null;
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return null;

  const d = new Date(year, month - 1, 1);
  d.setMonth(d.getMonth() - 1);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}
