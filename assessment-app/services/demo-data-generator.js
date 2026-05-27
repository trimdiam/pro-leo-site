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

// ── Class I — April & May 2026 — Full Subject Drill-Down Demo ────────────────
// Covers all 5 Class I subjects with real criterion IDs.
// Designed to exercise the drill-down panel:
//   • Work Habits    → consistently strong (82–86%)
//   • Writing Skills → average (60–64%)
//   • Reading Skills → skill gap (48–52% — majority below 60%)
//   • Speaking Skills→ DECLINING April→May (75% → 58%) triggers alert
//   • Solving Skills (Math only) → rising April→May

const CLASS1_STUDENTS = [
  { id: 'SFS260101', name: 'ALVINSON MAWRIE'               },
  { id: 'SFS260102', name: 'BANHOISHAPHRANG S PASSAH'       },
  { id: 'SFS260103', name: 'BANSHANSKHEM RYNGKHLEM'         },
  { id: 'SFS260104', name: 'DABITHEIKIN KHONGMALAI'         },
  { id: 'SFS260105', name: 'DAMANGNAME SOHTUN'              },
  { id: 'SFS260106', name: 'DAMEIAKI KHARKONGOR'            },
  { id: 'SFS260107', name: 'DANNY BANSHAN MAWRIE'           },
  { id: 'SFS260108', name: 'DARRYN COOPER KHARSHIING'       },
  { id: 'SFS260109', name: 'GABRIEL MAWRIE'                 },
  { id: 'SFS260110', name: 'GIDEON GERRY PYNGROPE'          },
  { id: 'SFS260111', name: 'HAMEBANKHRAW MAWRIE'            },
  { id: 'SFS260112', name: 'HAMEBANTEI KHARKONGOR'          },
  { id: 'SFS260113', name: 'HANIEL EZEKIEL BASAIWMOIT'      },
  { id: 'SFS260114', name: 'JOVIAL RANI'                    },
  { id: 'SFS260115', name: 'KYNSAI KUPAR LYNGDOH'           },
  { id: 'SFS260116', name: 'LAJIED KHARKONGOR'              },
  { id: 'SFS260117', name: 'LAKYRPANG MAWRIE'               },
  { id: 'SFS260118', name: 'LAWANSAME KURKALANG'            },
  { id: 'SFS260119', name: 'MARKORDOR SUTING'               },
  { id: 'SFS260120', name: 'MEDASHANLANG ETHAN PYNGROPE'    },
  { id: 'SFS260121', name: 'MELAMPHRANG JOEL KHARKONGOR'    },
  { id: 'SFS260122', name: 'MELAMSHWA MAWRIE'               },
  { id: 'SFS260123', name: 'NATHANIEL SKHEM DKHAR'          },
  { id: 'SFS260124', name: 'NI-O-ELAD RANI'                 },
  { id: 'SFS260125', name: 'RENIAL WANSHAN WANSHONG'        },
  { id: 'SFS260126', name: 'RODRICK K MAWRIE'               },
  { id: 'SFS260127', name: 'TEIBANDAP MAWRIE'               },
  { id: 'SFS260128', name: 'WANHIAM HAME SOHTUN'            },
  { id: 'SFS260129', name: 'WANSALANMI SOHTUN'              },
  { id: 'SFS260130', name: 'WANSHUA NATHANIEL KHARKONGOR'   },
  { id: 'SFS260131', name: 'ZAYDEN MAWRIE'                  },
  { id: 'SFS260132', name: 'ABIGAIL HAPHIBANBHA KHARKONGOR' },
  { id: 'SFS260133', name: 'BAAIJINGSUK SONGTHIANG'         },
  { id: 'SFS260134', name: 'BALAPYNTNGEN KHARKONGOR'        },
  { id: 'SFS260135', name: 'BANNEHDAPHI B MAWRIE'           },
  { id: 'SFS260136', name: 'CAREFEODOLEEN N.KHARUMNUID'     },
  { id: 'SFS260137', name: 'DA I HUNSHA LAWAI'              },
  { id: 'SFS260138', name: 'DA I LASHONGKUN MAWRIE'         },
  { id: 'SFS260139', name: 'DABETJINGKMEN LYNGDOH'          },
  { id: 'SFS260140', name: 'DARI PALEI KHARKONGOR'          },
  { id: 'SFS260141', name: 'DARIJINGKMEN MAWRIE'            },
  { id: 'SFS260142', name: 'ELLEEN NORA KHYRIEMMUJAT'       },
  { id: 'SFS260143', name: 'EMIDABIANG KHARMAWPHLANG'       },
  { id: 'SFS260144', name: 'EVELYNE VICUNA KHARUMNUID'      },
  { id: 'SFS260145', name: 'EYANA VANESSA KHARKONGOR'       },
  { id: 'SFS260146', name: 'HAKA LADAPBIANG RANI'           },
  { id: 'SFS260147', name: 'INDAMANBHA SUTING'              },
  { id: 'SFS260148', name: 'MELISA BASAIAWMOIT'             },
  { id: 'SFS260149', name: 'MERIIAKA KHARKONGOR'            },
  { id: 'SFS260150', name: 'NATANYA MUKHIM'                 },
  { id: 'SFS260151', name: 'NELATHEHSEI K SYIEMIONG'        },
  { id: 'SFS260152', name: 'ODELIA JONES KHARKONGOR'        },
  { id: 'SFS260153', name: 'PRIYANKA RYMBAI'                },
  { id: 'SFS260154', name: 'RIDAHUN TARIANG'                },
  { id: 'SFS260155', name: 'RIMEKA MAWRIE'                  },
  { id: 'SFS260156', name: 'RISAWANKMEN MYNLONG'            },
  { id: 'SFS260157', name: "SA I MEAIHUN L.LANGSTIEH"       },
  { id: 'SFS260158', name: 'SAIBANPDIANG MARBANIANG'        },
  { id: 'SFS260159', name: 'SHIMKHIALANG MAWRIE'            }
];

// Per-subject, per-category bias tables: [aprilBias, mayBias]
// Positive = higher marks, negative = lower marks
const DRILL_DEMO_SUBJECTS = [
  {
    subject_id: 'ENG1', subject_name: 'English I',
    criteria: {
      'Work Habits':     { ids: ['ENG1_WH1','ENG1_WH2','ENG1_WH3','ENG1_WH4','ENG1_WH5','ENG1_WH6'], bias: [1, 1]   },
      'Writing Skills':  { ids: ['ENG1_WS1','ENG1_WS2','ENG1_WS3'],                                   bias: [0, 0]   },
      'Reading Skills':  { ids: ['ENG1_RS1','ENG1_RS2','ENG1_RS3','ENG1_RS4'],                         bias: [-1, -1] },
      'Speaking Skills': { ids: ['ENG1_SS1','ENG1_SS2','ENG1_SS3','ENG1_SS4'],                         bias: [1, -1]  }  // declining
    }
  },
  {
    subject_id: 'ENG2', subject_name: 'English II',
    criteria: {
      'Work Habits':     { ids: ['ENG2_WH1','ENG2_WH2','ENG2_WH3','ENG2_WH4','ENG2_WH5','ENG2_WH6'], bias: [1, 1]   },
      'Writing Skills':  { ids: ['ENG2_WS1','ENG2_WS2','ENG2_WS3'],                                   bias: [0, 0]   },
      'Reading Skills':  { ids: ['ENG2_RS1','ENG2_RS2','ENG2_RS3','ENG2_RS4'],                         bias: [-1, -1] },
      'Speaking Skills': { ids: ['ENG2_SS1','ENG2_SS2','ENG2_SS3','ENG2_SS4'],                         bias: [0, -1]  }
    }
  },
  {
    subject_id: 'MATH', subject_name: 'Mathematics',
    criteria: {
      'Work Habits':     { ids: ['MATH_WH1','MATH_WH2','MATH_WH3','MATH_WH4','MATH_WH5','MATH_WH6'], bias: [1, 1]   },
      'Writing Skills':  { ids: ['MATH_WS1','MATH_WS2','MATH_WS3'],                                   bias: [0, 0]   },
      'Solving Skills':  { ids: ['MATH_SV1','MATH_SV2','MATH_SV3','MATH_SV4','MATH_SV5'],             bias: [-1, 0]  }  // rising
    }
  },
  {
    subject_id: 'SCI', subject_name: 'Science',
    criteria: {
      'Work Habits':                         { ids: ['SCI_WH1','SCI_WH2','SCI_WH3','SCI_WH4','SCI_WH5','SCI_WH6'], bias: [1, 1]   },
      'Writing Skills':                      { ids: ['SCI_WS1','SCI_WS2','SCI_WS3'],                                bias: [0, 0]   },
      'Reading Skills':                      { ids: ['SCI_RS1','SCI_RS2','SCI_RS3','SCI_RS4'],                      bias: [-1, -1] },
      'Social & Emotional / Subject Learning': { ids: ['SCI_SE1','SCI_SE2','SCI_SE3','SCI_SE4'],                    bias: [0, 1]   }
    }
  },
  {
    subject_id: 'KHA', subject_name: 'Khasi',
    criteria: {
      'Work Habits':     { ids: ['KHA_WH1','KHA_WH2','KHA_WH3','KHA_WH4','KHA_WH5','KHA_WH6'], bias: [1, 1]   },
      'Writing Skills':  { ids: ['KHA_WS1','KHA_WS2','KHA_WS3'],                               bias: [-1, 0]  },
      'Reading Skills':  { ids: ['KHA_RS1','KHA_RS2','KHA_RS3','KHA_RS4'],                      bias: [-1, -1] },
      'Speaking Skills': { ids: ['KHA_SS1','KHA_SS2','KHA_SS3','KHA_SS4'],                      bias: [0, 0]   }
    }
  }
];

const DRILL_MONTHS = [
  { date: '2026-04-15', monthIndex: 0 },
  { date: '2026-05-15', monthIndex: 1 }
];

function drillTier(idx, total) {
  const p = idx / total;
  if (p < 0.18) return 'strong';
  if (p < 0.65) return 'average';
  return 'weak';
}

function drillMark(tier, bias) {
  const r = Math.random();
  let mark;
  if (tier === 'strong') {
    mark = r < 0.5 ? 5 : r < 0.85 ? 4 : 3;
  } else if (tier === 'average') {
    mark = r < 0.12 ? 5 : r < 0.45 ? 4 : r < 0.80 ? 3 : 2;
  } else {
    mark = r < 0.06 ? 4 : r < 0.30 ? 3 : r < 0.65 ? 2 : r < 0.88 ? 1 : 0;
  }
  return Math.min(5, Math.max(0, mark + bias));
}

function buildDrillMarks(subject, monthIndex) {
  const marks = {};
  CLASS1_STUDENTS.forEach((st, idx) => {
    const tier = drillTier(idx, CLASS1_STUDENTS.length);
    marks[st.id] = { _full_name: st.name };
    Object.values(subject.criteria).forEach(({ ids, bias }) => {
      const b = bias[monthIndex];
      ids.forEach(cid => {
        // Bottom 15%: occasional absent on first criterion in April
        const isBottom = idx / CLASS1_STUDENTS.length > 0.85;
        if (isBottom && monthIndex === 0 && Math.random() < 0.15) {
          marks[st.id][cid] = { attendance: 'absent' };
        } else {
          marks[st.id][cid] = drillMark(tier, b);
        }
      });
    });
  });
  return marks;
}

export async function generateClass1DrillDemo() {
  clearCache();
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const sessions = [];

  DRILL_MONTHS.forEach(({ date, monthIndex }) => {
    DRILL_DEMO_SUBJECTS.forEach(subject => {
      const sessionId = `drillDemo_ClassI_${subject.subject_id}_${date}`;
      sessions.push({
        session: {
          session_id:   sessionId,
          teacher_name: 'Demo Teacher',
          class:        'Class I',
          subject_id:   subject.subject_id,
          subject_name: subject.subject_name,
          date,
          status:       'locked',
          created_at:   new Date().toISOString(),
          updated_at:   new Date().toISOString()
        },
        marks:    buildDrillMarks(subject, monthIndex),
        saved_at: new Date().toISOString()
      });
    });
  });

  const merged = [...existing];
  sessions.forEach(sess => {
    const idx = merged.findIndex(s => s.session.session_id === sess.session.session_id);
    if (idx >= 0) merged[idx] = sess; else merged.push(sess);
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));

  clearCache();
  return sessions.length;
}

export function clearClass1DrillDemo() {
  clearCache();
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  const filtered = existing.filter(s => !s.session.session_id.startsWith('drillDemo_'));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
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
