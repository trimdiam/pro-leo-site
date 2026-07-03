import { getAllSessions } from './session-storage.js';
import { loadStudentsForClass } from './student-loader.js';
import { calculateStudentTotal, getMarkValue } from './totals-engine.js';
import {
  persistMonthlyAnalytics, fetchMonthlyAnalytics,
  persistTermAnalytics, fetchTermAnalytics
} from './firestore-service.js';
import { getTermDateRange } from './report-card-grade-engine.js';

const AGGREGATION_CACHE_KEY = 'sfds_aggregation_cache';

export function getAggregationCache() {
  try {
    const raw = localStorage.getItem(AGGREGATION_CACHE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function saveAggregationCache(cache) {
  try {
    localStorage.setItem(AGGREGATION_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to save aggregation cache', error);
  }
}

export function clearAggregationCache() {
  localStorage.removeItem(AGGREGATION_CACHE_KEY);
}

export function getEligibleSessions(filters = {}) {
  const sessions = getAllSessions();
  return sessions.filter(s => {
    const status = s.session.status;
    // Include submitted sessions so admin can see data before formal review/lock.
    // Draft sessions are excluded — they may be incomplete.
    if (status !== 'submitted' && status !== 'reviewed' && status !== 'locked') return false;
    if (filters.class && s.session.class !== filters.class) return false;
    if (filters.subject_id && s.session.subject_id !== filters.subject_id) return false;
    if (filters.yearMonth && !s.session.date.startsWith(filters.yearMonth)) return false;
    if (filters.dateFrom && filters.dateTo) {
      const date = s.session.date;
      if (!date || date < filters.dateFrom || date > filters.dateTo) return false;
    }
    return true;
  });
}

export function extractYearMonth(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  return dateStr.slice(0, 7);
}

// Core aggregation shared by month- and term-level rollups. Computes both the
// existing 0-100 percentage (used by analytics dashboards) and a 0-5
// averageScore (used by the assessment/class-test blend in report cards) per
// subject and per student-subject.
async function buildAggregationResult(sessions, className) {
  const students = className ? await loadStudentsForClass(className).catch(() => []) : [];
  const studentMap = new Map(students.map(s => [s.student_id, s]));

  const subjectAggregates = new Map();
  const studentSubjectTotals = new Map();

  for (const entry of sessions) {
    const sess = entry.session;
    const marks = entry.marks || {};
    // Count only actual mark entries (numeric, or an absent-marker object) — some
    // demo/test data stores extra metadata (e.g. _full_name) alongside a
    // student's criterion marks, which must not be counted as a criterion.
    const firstStudentMarks = Object.values(marks)[0] || {};
    const criteriaCount = Object.values(firstStudentMarks)
      .filter(v => typeof v === 'number' || (v && typeof v === 'object' && v.attendance === 'absent'))
      .length;
    const maxPerSession = criteriaCount * 5;

    if (!subjectAggregates.has(sess.subject_id)) {
      subjectAggregates.set(sess.subject_id, {
        subject_id: sess.subject_id,
        subject_name: sess.subject_name,
        sessions: 0,
        totalMarks: 0,
        totalMax: 0,
        studentCount: new Set()
      });
    }
    const subAgg = subjectAggregates.get(sess.subject_id);
    subAgg.sessions++;

    for (const [studentId, criterionMarks] of Object.entries(marks)) {
      subAgg.studentCount.add(studentId);
      let studentTotal = 0;
      let absentCount = 0;
      Object.values(criterionMarks).forEach(m => {
        const val = getMarkValue(m);
        if (typeof val === 'number') {
          studentTotal += val;
        } else if (m && typeof m === 'object' && m.attendance === 'absent') {
          absentCount++;
        }
      });
      const effectiveMax = Math.max(0, maxPerSession - absentCount * 5);
      subAgg.totalMarks += studentTotal;
      subAgg.totalMax += effectiveMax;

      const key = `${studentId}_${sess.subject_id}`;
      if (!studentSubjectTotals.has(key)) {
        studentSubjectTotals.set(key, {
          student_id: studentId,
          subject_id: sess.subject_id,
          subject_name: sess.subject_name,
          totalMarks: 0,
          totalMax: 0,
          sessions: 0,
          totalAbsences: 0
        });
      }
      const sst = studentSubjectTotals.get(key);
      sst.totalMarks += studentTotal;
      sst.totalMax += effectiveMax;
      sst.sessions++;
      sst.totalAbsences += absentCount;
    }
  }

  const studentAggregates = new Map();
  for (const [key, sst] of studentSubjectTotals) {
    if (!studentAggregates.has(sst.student_id)) {
      const stu = studentMap.get(sst.student_id);
      studentAggregates.set(sst.student_id, {
        student_id: sst.student_id,
        full_name: stu?.full_name || sst.student_id,
        roll_no: stu?.roll_no || '',
        class: className || stu?.class || '',
        subjects: [],
        overallTotal: 0,
        overallMax: 0,
        overallPercentage: 0,
        totalSessions: 0
      });
    }
    const sa = studentAggregates.get(sst.student_id);
    const pct = sst.totalMax > 0 ? Math.round((sst.totalMarks / sst.totalMax) * 100) : 0;
    sa.subjects.push({
      subject_id: sst.subject_id,
      subject_name: sst.subject_name,
      totalMarks: sst.totalMarks,
      totalMax: sst.totalMax,
      percentage: pct,
      averageScore: sst.totalMax > 0 ? Math.round((sst.totalMarks / sst.totalMax) * 5 * 100) / 100 : null,
      sessions: sst.sessions
    });
    sa.overallTotal += sst.totalMarks;
    sa.overallMax += sst.totalMax;
    sa.totalSessions += sst.sessions;
  }

  for (const sa of studentAggregates.values()) {
    sa.overallPercentage = sa.overallMax > 0 ? Math.round((sa.overallTotal / sa.overallMax) * 100) : 0;
  }

  const subjectResults = [];
  let grandTotalMarks = 0;
  let grandTotalMax = 0;

  for (const subAgg of subjectAggregates.values()) {
    const pct = subAgg.totalMax > 0 ? Math.round((subAgg.totalMarks / subAgg.totalMax) * 100) : 0;
    subjectResults.push({
      subject_id: subAgg.subject_id,
      subject_name: subAgg.subject_name,
      sessions: subAgg.sessions,
      averagePercentage: pct,
      averageScore: subAgg.totalMax > 0 ? Math.round((subAgg.totalMarks / subAgg.totalMax) * 5 * 100) / 100 : null,
      studentCount: subAgg.studentCount.size,
      totalMarks: subAgg.totalMarks,
      totalMax: subAgg.totalMax
    });
    grandTotalMarks += subAgg.totalMarks;
    grandTotalMax += subAgg.totalMax;
  }

  const classAverage = grandTotalMax > 0 ? Math.round((grandTotalMarks / grandTotalMax) * 100) : 0;

  return {
    sessions: sessions.map(s => ({
      session_id: s.session.session_id,
      teacher_name: s.session.teacher_name,
      subject_name: s.session.subject_name,
      date: s.session.date,
      status: s.session.status
    })),
    students: Array.from(studentAggregates.values()).sort((a, b) => (a.roll_no || 0) - (b.roll_no || 0)),
    subjects: subjectResults,
    classAverage,
    totalAssessments: sessions.length,
    generatedAt: new Date().toISOString()
  };
}

function emptyAggregationResult(className) {
  return {
    class: className,
    sessions: [],
    students: [],
    subjects: [],
    classAverage: 0,
    totalAssessments: 0,
    generatedAt: new Date().toISOString()
  };
}

export async function aggregateByMonth(yearMonth, className, options = {}) {
  const cacheKey = `${yearMonth || 'all'}_${className || 'all'}`;
  const cache = getAggregationCache();

  if (!options.force && cache[cacheKey]) {
    return cache[cacheKey];
  }

  // Check local eligible sessions first. If any exist, always recompute locally
  // so stale Firestore snapshots (e.g. an old empty result) never hide real data.
  // Only fall back to Firestore when this device has no local sessions at all
  // (cross-device read scenario).
  const sessions = getEligibleSessions({ yearMonth, class: className });

  if (!options.force && sessions.length === 0 && yearMonth && className) {
    try {
      const remote = await fetchMonthlyAnalytics(yearMonth, className);
      if (remote && (remote.sessions?.length ?? 0) > 0) {
        cache[cacheKey] = remote;
        saveAggregationCache(cache);
        return remote;
      }
    } catch (err) {
      console.warn('Firestore analytics fetch failed, computing locally:', err.message);
    }
  }
  if (sessions.length === 0) {
    return { yearMonth, ...emptyAggregationResult(className) };
  }

  const built = await buildAggregationResult(sessions, className);
  const result = { yearMonth, class: className, ...built };

  cache[cacheKey] = result;
  saveAggregationCache(cache);

  // Persist to Firestore in the background so other devices can read it.
  if (yearMonth && className) {
    persistMonthlyAnalytics(yearMonth, className, result).catch(err =>
      console.warn('Failed to persist monthly analytics to Firestore:', err.message)
    );
  }

  return result;
}

// Half-Yearly term rollup, used to blend the assessment-criteria average (70%)
// with the class test (30%) for Class I/II report cards. Mirrors
// aggregateByMonth but spans a whole term's date range (see getTermDateRange)
// instead of one calendar month.
export async function aggregateByTerm(term, className, options = {}) {
  const { dateFrom, dateTo, termLabel } = getTermDateRange(term);
  const cacheKey = `${term}_${className || 'all'}`;
  const cache = getAggregationCache();

  if (!options.force && cache[cacheKey]) {
    return cache[cacheKey];
  }

  const sessions = getEligibleSessions({ dateFrom, dateTo, class: className });

  if (!options.force && sessions.length === 0 && className) {
    try {
      const remote = await fetchTermAnalytics(term, className);
      if (remote && (remote.sessions?.length ?? 0) > 0) {
        cache[cacheKey] = remote;
        saveAggregationCache(cache);
        return remote;
      }
    } catch (err) {
      console.warn('Firestore term analytics fetch failed, computing locally:', err.message);
    }
  }
  if (sessions.length === 0) {
    return { term, termLabel, ...emptyAggregationResult(className) };
  }

  const built = await buildAggregationResult(sessions, className);
  const result = { term, termLabel, class: className, ...built };

  cache[cacheKey] = result;
  saveAggregationCache(cache);

  if (className) {
    persistTermAnalytics(term, className, result).catch(err =>
      console.warn('Failed to persist term analytics to Firestore:', err.message)
    );
  }

  return result;
}

export function findHighestPerformer(students) {
  if (!students || students.length === 0) return null;
  return students.reduce((best, s) => s.overallPercentage > best.overallPercentage ? s : best, students[0]);
}

export function findLowestPerformer(students) {
  if (!students || students.length === 0) return null;
  return students.reduce((worst, s) => s.overallPercentage < worst.overallPercentage ? s : worst, students[0]);
}
