import { detectWeakStudents } from './weak-student-engine.js';
import { aggregateByMonth, extractYearMonth } from './aggregation-engine.js';
import { getPreviousMonth } from './comparison-engine.js';

export async function getTopConcerns(className, yearMonth) {
  const concerns = [];

  const { aggregateByMonth: aggFn } = await import('./aggregation-engine.js');
  const current = await aggFn(yearMonth, className);
  const prevYearMonth = getPreviousMonth(yearMonth);
  const previous = prevYearMonth ? await aggFn(prevYearMonth, className) : null;

  if (!current || current.students.length === 0) {
    return [{ level: 'info', message: 'No assessment data available for analysis.' }];
  }

  const weakStudents = detectWeakStudents(current);

  if (weakStudents.length > 0) {
    const criticalCount = weakStudents.filter(s => s.overallPercentage < 25).length;
    const moderateCount = weakStudents.filter(s => s.overallPercentage >= 25 && s.overallPercentage < 40).length;

    if (criticalCount > 0) {
      concerns.push({
        level: 'critical',
        message: `${criticalCount} student(s) in critical condition (below 25%)`
      });
    }
    if (moderateCount > 0) {
      concerns.push({
        level: 'moderate',
        message: `${moderateCount} student(s) need attention (25–40%)`
      });
    }
  }

  if (current.subjects.length > 0) {
    const sortedSubjects = [...current.subjects].sort((a, b) => a.averagePercentage - b.averagePercentage);
    const weakest = sortedSubjects[0];
    const strongest = sortedSubjects[sortedSubjects.length - 1];

    if (weakest.averagePercentage < 40) {
      concerns.push({
        level: 'warning',
        message: `${weakest.subject_name} is underperforming at ${weakest.averagePercentage}%`
      });
    }

    if (strongest.averagePercentage - weakest.averagePercentage > 20) {
      concerns.push({
        level: 'info',
        message: `Large performance gap: ${strongest.subject_name} (${strongest.averagePercentage}%) vs ${weakest.subject_name} (${weakest.averagePercentage}%)`
      });
    }

    if (previous && previous.subjects.length > 0) {
      current.subjects.forEach(sub => {
        const prevSub = previous.subjects.find(p => p.subject_id === sub.subject_id);
        if (prevSub) {
          const decline = prevSub.averagePercentage - sub.averagePercentage;
          if (decline >= 5) {
            concerns.push({
              level: 'warning',
              message: `${sub.subject_name} declined by ${decline}% since last month`
            });
          }
        }
      });
    }
  }

  const lowPerformers = current.students.filter(s => s.overallPercentage < 40);
  if (lowPerformers.length > current.students.length * 0.3) {
    concerns.push({
      level: 'critical',
      message: `Over 30% of students are underperforming (${lowPerformers.length}/${current.students.length})`
    });
  }

  const completionRate = current.totalAssessments > 0
    ? Math.round((current.sessions.filter(s => s.status === 'locked').length / current.totalAssessments) * 100)
    : 0;

  if (completionRate < 50) {
    concerns.push({
      level: 'warning',
      message: `Assessment completion is low (${completionRate}%)`
    });
  }

  if (concerns.length === 0) {
    concerns.push({ level: 'success', message: 'No major concerns detected. School is performing well.' });
  }

  return concerns;
}
