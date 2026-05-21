import { aggregateByMonth, extractYearMonth, getEligibleSessions } from './aggregation-engine.js';
import { getAllSessions } from './session-storage.js';
import { loadStudentsForClass } from './student-loader.js';

export function getAvailableMonths(className) {
  const sessions = getEligibleSessions({ class: className });
  const months = new Set();
  sessions.forEach(s => {
    const ym = extractYearMonth(s.session.date);
    if (ym) months.add(ym);
  });
  return Array.from(months).sort();
}

export async function getStudentAnalytics(studentId, className, monthsBack = 6) {
  const months = getAvailableMonths(className).slice(-monthsBack);
  const monthlyData = [];
  let strongestSubject = null;
  let weakestSubject = null;
  const subjectMap = new Map();

  let studentInfo = { full_name: studentId, roll_no: '', class: className };

  for (const ym of months) {
    const agg = await aggregateByMonth(ym, className);
    const student = agg.students.find(s => s.student_id === studentId);
    if (student) {
      studentInfo = {
        full_name: student.full_name || studentId,
        roll_no: student.roll_no || '',
        class: student.class || className
      };
      monthlyData.push({
        month: ym,
        overallPercentage: student.overallPercentage,
        totalSessions: student.totalSessions,
        subjects: student.subjects
      });

      student.subjects.forEach(sub => {
        if (!subjectMap.has(sub.subject_id)) {
          subjectMap.set(sub.subject_id, {
            subject_id: sub.subject_id,
            subject_name: sub.subject_name,
            percentages: [],
            totalMarks: 0,
            totalMax: 0,
            sessions: 0
          });
        }
        const sm = subjectMap.get(sub.subject_id);
        sm.percentages.push(sub.percentage);
        sm.totalMarks += sub.totalMarks;
        sm.totalMax += sub.totalMax;
        sm.sessions += sub.sessions;
      });
    }
  }

  const subjectAverages = [];
  for (const sm of subjectMap.values()) {
    const avgPct = sm.totalMax > 0 ? Math.round((sm.totalMarks / sm.totalMax) * 100) : 0;
    subjectAverages.push({
      subject_id: sm.subject_id,
      subject_name: sm.subject_name,
      averagePercentage: avgPct,
      sessions: sm.sessions,
      trend: sm.percentages
    });
  }

  if (subjectAverages.length > 0) {
    strongestSubject = subjectAverages.reduce((best, s) => s.averagePercentage > best.averagePercentage ? s : best, subjectAverages[0]);
    weakestSubject = subjectAverages.reduce((worst, s) => s.averagePercentage < worst.averagePercentage ? s : worst, subjectAverages[0]);
  }

  const overallTrend = monthlyData.map(m => m.overallPercentage);
  const avgOverall = overallTrend.length > 0 ? Math.round(overallTrend.reduce((a, b) => a + b, 0) / overallTrend.length) : 0;

  return {
    student_id: studentId,
    full_name: studentInfo.full_name,
    roll_no: studentInfo.roll_no,
    class: studentInfo.class,
    monthlyData,
    subjectAverages,
    strongestSubject,
    weakestSubject,
    averageOverall: avgOverall,
    totalMonths: monthlyData.length
  };
}

export async function getClassAnalytics(className, monthsBack = 6) {
  const months = getAvailableMonths(className).slice(-monthsBack);
  const monthlyData = [];
  const allStudents = new Map();

  for (const ym of months) {
    const agg = await aggregateByMonth(ym, className);
    monthlyData.push({
      month: ym,
      classAverage: agg.classAverage,
      totalAssessments: agg.totalAssessments,
      subjects: agg.subjects,
      studentCount: agg.students.length,
      highest: agg.students.length > 0 ? agg.students.reduce((best, s) => s.overallPercentage > best.overallPercentage ? s : best, agg.students[0]) : null,
      lowest: agg.students.length > 0 ? agg.students.reduce((worst, s) => s.overallPercentage < worst.overallPercentage ? s : worst, agg.students[0]) : null
    });

    agg.students.forEach(s => {
      if (!allStudents.has(s.student_id)) {
        allStudents.set(s.student_id, { ...s, months: 0, totalPct: 0 });
      }
      const st = allStudents.get(s.student_id);
      st.months++;
      st.totalPct += s.overallPercentage;
    });
  }

  const studentList = Array.from(allStudents.values())
    .map(s => ({
      ...s,
      averagePercentage: s.months > 0 ? Math.round(s.totalPct / s.months) : 0
    }))
    .sort((a, b) => b.averagePercentage - a.averagePercentage);

  const subjectTrends = new Map();
  monthlyData.forEach(md => {
    md.subjects.forEach(sub => {
      if (!subjectTrends.has(sub.subject_id)) {
        subjectTrends.set(sub.subject_id, {
          subject_id: sub.subject_id,
          subject_name: sub.subject_name,
          months: []
        });
      }
      subjectTrends.get(sub.subject_id).months.push({ month: md.month, averagePercentage: sub.averagePercentage });
    });
  });

  return {
    className,
    monthlyData,
    students: studentList,
    subjectTrends: Array.from(subjectTrends.values()),
    totalMonths: monthlyData.length
  };
}

export async function getSubjectAnalytics(className) {
  const months = getAvailableMonths(className);
  const subjectMap = new Map();

  for (const ym of months) {
    const agg = await aggregateByMonth(ym, className);
    agg.subjects.forEach(sub => {
      if (!subjectMap.has(sub.subject_id)) {
        subjectMap.set(sub.subject_id, {
          subject_id: sub.subject_id,
          subject_name: sub.subject_name,
          totalMarks: 0,
          totalMax: 0,
          sessions: 0,
          months: []
        });
      }
      const sm = subjectMap.get(sub.subject_id);
      sm.totalMarks += sub.totalMarks;
      sm.totalMax += sub.totalMax;
      sm.sessions += sub.sessions;
      sm.months.push({ month: ym, averagePercentage: sub.averagePercentage, studentCount: sub.studentCount });
    });
  }

  return Array.from(subjectMap.values()).map(sm => ({
    subject_id: sm.subject_id,
    subject_name: sm.subject_name,
    averagePercentage: sm.totalMax > 0 ? Math.round((sm.totalMarks / sm.totalMax) * 100) : 0,
    sessions: sm.sessions,
    months: sm.months,
    trend: sm.months.map(m => m.averagePercentage)
  }));
}

export async function getSchoolOverview() {
  const sessions = getAllSessions();
  const allClasses = [...new Set(sessions.map(s => s.session.class))];
  const classData = [];

  for (const className of allClasses) {
    const months = getAvailableMonths(className);
    if (months.length === 0) continue;

    let totalClassAvg = 0;
    let totalAssessments = 0;

    for (const ym of months) {
      const agg = await aggregateByMonth(ym, className);
      totalClassAvg += agg.classAverage;
      totalAssessments += agg.totalAssessments;
    }

    classData.push({
      class: className,
      averagePercentage: months.length > 0 ? Math.round(totalClassAvg / months.length) : 0,
      totalAssessments,
      monthsTracked: months.length
    });
  }

  const reviewedLocked = sessions.filter(s => s.session.status === 'reviewed' || s.session.status === 'locked');
  const totalStudents = new Set();
  reviewedLocked.forEach(s => {
    Object.keys(s.marks || {}).forEach(id => totalStudents.add(id));
  });

  return {
    totalSessions: sessions.length,
    completedSessions: reviewedLocked.length,
    totalClasses: allClasses.length,
    totalStudents: totalStudents.size,
    classData: classData.sort((a, b) => b.averagePercentage - a.averagePercentage)
  };
}

export function getCompletionAnalytics(className, yearMonth) {
  const sessions = getAllSessions();
  let filtered = sessions;

  if (className) {
    filtered = filtered.filter(s => s.session.class === className);
  }
  if (yearMonth) {
    filtered = filtered.filter(s => s.session.date.startsWith(yearMonth));
  }

  const counts = { draft: 0, submitted: 0, reviewed: 0, locked: 0 };
  const teacherCounts = new Map();
  const subjectCounts = new Map();

  filtered.forEach(s => {
    counts[s.session.status]++;

    if (!teacherCounts.has(s.session.teacher_name)) {
      teacherCounts.set(s.session.teacher_name, { teacher: s.session.teacher_name, total: 0, completed: 0 });
    }
    const tc = teacherCounts.get(s.session.teacher_name);
    tc.total++;
    if (s.session.status === 'reviewed' || s.session.status === 'locked') tc.completed++;

    if (!subjectCounts.has(s.session.subject_id)) {
      subjectCounts.set(s.session.subject_id, { subject_id: s.session.subject_id, subject_name: s.session.subject_name, total: 0, completed: 0 });
    }
    const sc = subjectCounts.get(s.session.subject_id);
    sc.total++;
    if (s.session.status === 'reviewed' || s.session.status === 'locked') sc.completed++;
  });

  return {
    counts,
    total: filtered.length,
    completionRate: filtered.length > 0 ? Math.round(((counts.reviewed + counts.locked) / filtered.length) * 100) : 0,
    teachers: Array.from(teacherCounts.values()),
    subjects: Array.from(subjectCounts.values())
  };
}
