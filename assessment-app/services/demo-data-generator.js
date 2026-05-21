import { getStudentProfile } from './student-profile-engine.js';

const STORAGE_KEY = 'sfds_assessment_sessions';
const TEACHER_NAME = 'Demo Teacher';

// 3 months of data with different performance levels to show trends
const MONTHS = [
  { date: '2026-03-15', label: 'March',  performance: 'low'    },
  { date: '2026-04-15', label: 'April',  performance: 'medium' },
  { date: '2026-05-15', label: 'May',    performance: 'high'   }
];

const subjects = [
  { subject_id: 'MATH', subject_name: 'Mathematics',  criteria: ['MATH_C1','MATH_C2','MATH_C3','MATH_C4','MATH_C5'] }
];

// Maths rises steadily across months
const SUBJECT_TRENDS = {
  MATH: 'rising'
};

const class1Students = [
  'SFS260101','SFS260102','SFS260103','SFS260104','SFS260105','SFS260106','SFS260107','SFS260108',
  'SFS260109','SFS260110','SFS260111','SFS260112','SFS260113','SFS260114','SFS260115','SFS260116',
  'SFS260117','SFS260118','SFS260119','SFS260120','SFS260121','SFS260122','SFS260123','SFS260124',
  'SFS260125','SFS260126','SFS260127','SFS260128','SFS260129','SFS260130','SFS260131','SFS260132',
  'SFS260133','SFS260134','SFS260135','SFS260136','SFS260137','SFS260138','SFS260139','SFS260140',
  'SFS260141','SFS260142','SFS260143','SFS260144','SFS260145','SFS260146','SFS260147','SFS260148',
  'SFS260149','SFS260150','SFS260151','SFS260152','SFS260153','SFS260154','SFS260155','SFS260156',
  'SFS260157','SFS260158','SFS260159'
];

const class2Students = [
  'SFS260160','SFS260161','SFS260162','SFS260163','SFS260164','SFS260165','SFS260166','SFS260167',
  'SFS260168','SFS260169','SFS260170','SFS260171','SFS260172','SFS260173','SFS260174','SFS260175',
  'SFS260176','SFS260177','SFS260178','SFS260179','SFS260180','SFS260181','SFS260182','SFS260183',
  'SFS260184','SFS260185','SFS260186','SFS260187','SFS260188','SFS260189','SFS260190','SFS260191',
  'SFS260192','SFS260193','SFS260194','SFS260195','SFS260196','SFS260197','SFS260198','SFS260199',
  'SFS260200','SFS260201','SFS260202','SFS260203','SFS260204','SFS260205','SFS260206','SFS260207',
  'SFS260208','SFS260209','SFS260210','SFS260211','SFS260212','SFS260213','SFS260214'
];

// Student tiers — top 20% strong, middle 50% average, bottom 30% weak
function getTier(idx, total) {
  const pct = idx / total;
  if (pct < 0.2) return 'strong';
  if (pct < 0.7) return 'average';
  return 'weak';
}

// Bias shifts mark distribution up or down based on month & subject trend
function getTrendBias(subjectId, monthIndex) {
  const trend = SUBJECT_TRENDS[subjectId] || 'stable';
  if (trend === 'rising')  return monthIndex;       //  0, +1, +2
  if (trend === 'falling') return -monthIndex;      //  0, -1, -2
  return 0;
}

function randomMark(tier, bias = 0) {
  const r = Math.random();
  let mark;
  if (tier === 'strong') {
    if (r < 0.55) mark = 5;
    else if (r < 0.88) mark = 4;
    else mark = 3;
  } else if (tier === 'average') {
    if (r < 0.15) mark = 5;
    else if (r < 0.50) mark = 4;
    else if (r < 0.82) mark = 3;
    else mark = 2;
  } else {
    // weak
    if (r < 0.08) mark = 4;
    else if (r < 0.35) mark = 3;
    else if (r < 0.70) mark = 2;
    else if (r < 0.92) mark = 1;
    else mark = 0;
  }
  return Math.min(5, Math.max(0, mark + bias));
}

function generateMarks(students, criteria, subjectId, monthIndex) {
  const bias = getTrendBias(subjectId, monthIndex);
  const marks = {};
  students.forEach((studentId, idx) => {
    const tier = getTier(idx, students.length);
    marks[studentId] = {};
    criteria.forEach((criterionId, ci) => {
      // Bottom 10% of students get occasional absent marks
      const isWeak = idx / students.length > 0.90;
      const absentChance = isWeak && ci === 0 && monthIndex === 0 ? 0.25 : 0;
      if (Math.random() < absentChance) {
        marks[studentId][criterionId] = { attendance: 'absent' };
      } else {
        marks[studentId][criterionId] = randomMark(tier, bias);
      }
    });
  });
  return marks;
}

function generateSession(className, students, subject, date, monthIndex) {
  const sessionId = `demo_${className.replace(/\s+/g, '')}_${subject.subject_id}_${date}`;
  return {
    session: {
      session_id: sessionId,
      teacher_name: TEACHER_NAME,
      class: className,
      subject_id: subject.subject_id,
      subject_name: subject.subject_name,
      date,
      status: 'locked',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    marks: generateMarks(students, subject.criteria, subject.subject_id, monthIndex),
    saved_at: new Date().toISOString()
  };
}

function clearCache() {
  localStorage.removeItem('sfds_aggregation_cache');
  localStorage.removeItem('sfds_weak_student_cache');
}

// Rebuild Firestore student_profiles for every student in a class so the
// portal reflects the current localStorage sessions (not stale Firestore data).
async function rebuildProfiles(className, studentIds) {
  for (const studentId of studentIds) {
    try {
      await getStudentProfile(studentId, className);
    } catch (err) {
      console.warn(`Profile rebuild skipped for ${studentId}:`, err.message);
    }
  }
}

export async function generateDemoData() {
  clearCache();
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const sessions = [];

  MONTHS.forEach(({ date }, monthIndex) => {
    subjects.forEach(subject => {
      sessions.push(generateSession('Class I',  class1Students, subject, date, monthIndex));
      sessions.push(generateSession('Class II', class2Students, subject, date, monthIndex));
    });
  });

  const merged = [...existing];
  sessions.forEach(sess => {
    const idx = merged.findIndex(s => s.session.session_id === sess.session.session_id);
    if (idx >= 0) merged[idx] = sess;
    else merged.push(sess);
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

  // Overwrite Firestore student_profiles so the portal reflects the new data.
  await rebuildProfiles('Class I',  class1Students);
  await rebuildProfiles('Class II', class2Students);

  return sessions.length;
}

export function clearDemoData() {
  clearCache();
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const filtered = existing.filter(s => !s.session.session_id.startsWith('demo_'));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

// ── Weekly Maths Demo — Class I, 4 consecutive weeks ─────────────────────────
// Statuses chosen to exercise every UI state:
//   Week 1 (28 Apr–4 May)  → locked   (fully processed, shows in analytics)
//   Week 2 (5–11 May)      → locked   (fully processed)
//   Week 3 (12–18 May)     → draft    → OVERDUE  (due 18 May, today > 18 May)
//   Week 4 (19–25 May)     → draft    → NOT overdue yet (due 25 May)
//
// Performance rises each week to produce a visible upward trend in analytics.

const MATH_SUBJECT = {
  subject_id:   'MATH',
  subject_name: 'Mathematics',
  criteria:     ['MATH_C1', 'MATH_C2', 'MATH_C3', 'MATH_C4', 'MATH_C5']
};

const WEEKLY_MATH_WEEKS = [
  { weekStart: '2026-04-28', weekEnd: '2026-05-04', dueDate: '2026-05-04', status: 'locked',  bias: 0  },
  { weekStart: '2026-05-05', weekEnd: '2026-05-11', dueDate: '2026-05-11', status: 'locked',  bias: 1  },
  { weekStart: '2026-05-12', weekEnd: '2026-05-18', dueDate: '2026-05-18', status: 'draft',   bias: 2  },
  { weekStart: '2026-05-19', weekEnd: '2026-05-25', dueDate: '2026-05-25', status: 'draft',   bias: 2  }
];

function generateWeeklyMarks(students, criteria, bias) {
  const marks = {};
  students.forEach((studentId, idx) => {
    const tier = getTier(idx, students.length);
    marks[studentId] = {};
    criteria.forEach((criterionId, ci) => {
      const isBottom = idx / students.length > 0.90;
      const absentChance = isBottom && ci === 0 && bias === 0 ? 0.25 : 0;
      if (Math.random() < absentChance) {
        marks[studentId][criterionId] = { attendance: 'absent' };
      } else {
        marks[studentId][criterionId] = randomMark(tier, bias);
      }
    });
  });
  return marks;
}

export async function generateWeeklyMathDemo() {
  clearCache();
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const sessions = [];

  WEEKLY_MATH_WEEKS.forEach(({ weekStart, weekEnd, dueDate, status, bias }) => {
    const sessionId = `demo_ClassI_MATH_${weekStart}`;
    const entry = {
      session: {
        session_id:   sessionId,
        teacher_name: TEACHER_NAME,
        class:        'Class I',
        subject_id:   MATH_SUBJECT.subject_id,
        subject_name: MATH_SUBJECT.subject_name,
        date:         weekStart,
        weekStart,
        weekEnd,
        dueDate,
        sessionType:  'weekly',
        status,
        created_at:   new Date().toISOString(),
        updated_at:   new Date().toISOString()
      },
      marks:    generateWeeklyMarks(class1Students, MATH_SUBJECT.criteria, bias),
      saved_at: new Date().toISOString()
    };
    sessions.push(entry);
  });

  const merged = [...existing];
  sessions.forEach(sess => {
    const idx = merged.findIndex(s => s.session.session_id === sess.session.session_id);
    if (idx >= 0) merged[idx] = sess;
    else merged.push(sess);
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

  // Overwrite Firestore student_profiles so the portal drops the old subjects.
  await rebuildProfiles('Class I', class1Students);

  return sessions.length;
}
