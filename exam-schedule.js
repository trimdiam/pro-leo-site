// exam-schedule.js — Half-Yearly Examination Schedule 2026-27
// Renders the exam timetable into any container by class.
// Called by teacher portal (filtered to their class) and admin/student portals.

const EXAM_TITLE = 'Half-Yearly Examination 2026-27';
const EXAM_NOTES = [
  { label: 'Submission of Question Paper', value: '05-06-2026' },
  { label: 'Summer Break',                 value: '01-07-2026 till 10-07-2026' },
  { label: 'School Resume',                value: '13-07-2026' }
];

// Classes available in this schedule
const EXAM_CLASSES = ['III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

// Full schedule — each row is one date, subjects keyed by class
const EXAM_ROWS = [
  { date: '15-06-2026', day: 'Monday',
    subjects: { III:'SOCIAL', IV:'SCIENCE', V:'ENG-I', VI:'SCIENCE', VII:'SCIENCE', VIII:'ENG-I', IX:'MATHS', X:'MATHS' } },
  { date: '16-06-2026', day: 'Tuesday',
    subjects: { VI:'HINDI', IX:'KHASI', X:'KHASI' } },
  { date: '17-06-2026', day: 'Wednesday',
    subjects: { III:'ENG-II', IV:'COMP', V:'COMP', VI:'ENG-II', VII:'ENG-I', VIII:'GEO', IX:'H.EDU', X:'H.EDU' } },
  { date: '18-06-2026', day: 'Thursday',
    subjects: { IX:'PHYSICS', X:'PHYSICS' } },
  { date: '19-06-2026', day: 'Friday',
    subjects: { III:'ENG-I', IV:'ENG-II', V:'SCIENCE', VI:'HISTORY', VII:'HISTORY', VIII:'HISTORY', IX:'ENG-II', X:'ENG-II' } },
  { date: '20-06-2026', day: 'Saturday', subjects: {} },
  { date: '21-06-2026', day: 'Sunday',   subjects: {} },
  { date: '22-06-2026', day: 'Monday',
    subjects: { III:'MATHS', IV:'SOCIAL', V:'MATHS', VI:'MATHS', VII:'MATHS', VIII:'SCIENCE', IX:'GEO', X:'GEO' } },
  { date: '23-06-2026', day: 'Tuesday',
    subjects: { VI:'KHASI', VII:'KHASI', VIII:'CIVICS', IX:'ENG-I', X:'ENG-I' } },
  { date: '24-06-2026', day: 'Wednesday',
    subjects: { III:'HINDI', IV:'ENG-I', V:'ENG-II', VI:'GEO', VII:'GEO', VIII:'H.EDU', IX:'CIVICS', X:'CIVICS' } },
  { date: '25-06-2026', day: 'Thursday',
    subjects: { VI:'CIVICS', VII:'COMP', VIII:'ENG-II', IX:'CHEMISTRY', X:'CHEMISTRY' } },
  { date: '26-06-2026', day: 'Friday',
    subjects: { III:'KHASI', IV:'KHASI', V:'KHASI', VI:'H.EDU', VII:'ENG-II', VIII:'COMP', IX:'BIOLOGY', X:'BIOLOGY' } },
  { date: '27-06-2026', day: 'Saturday', subjects: {} },
  { date: '28-06-2026', day: 'Sunday',   subjects: {} },
  { date: '29-06-2026', day: 'Monday',
    subjects: { III:'SCIENCE', IV:'MATHS', V:'SOCIAL', VI:'ENG-I', VII:'CIVICS', VIII:'MATHS', IX:'HISTORY', X:'HISTORY' } },
  { date: '30-06-2026', day: 'Tuesday',
    subjects: { IV:'HINDI', V:'HINDI', VI:'COMP', VII:'H.EDU', VIII:'KHASI', IX:'ECONOMICS', X:'ECONOMICS' } }
];

// Subject colour map — matches the physical timetable colours
const SUBJECT_COLORS = {
  'MATHS':     { bg:'#fff176', color:'#5d4037' },
  'SCIENCE':   { bg:'#a5d6a7', color:'#1b5e20' },
  'SOCIAL':    { bg:'#80cbc4', color:'#004d40' },
  'ENG-I':     { bg:'#ffab91', color:'#bf360c' },
  'ENG-II':    { bg:'#ef9a9a', color:'#b71c1c' },
  'HINDI':     { bg:'#ffe082', color:'#e65100' },
  'KHASI':     { bg:'#ce93d8', color:'#4a148c' },
  'COMP':      { bg:'#90caf9', color:'#0d47a1' },
  'HISTORY':   { bg:'#f48fb1', color:'#880e4f' },
  'GEO':       { bg:'#b0bec5', color:'#263238' },
  'CIVICS':    { bg:'#bcaaa4', color:'#3e2723' },
  'H.EDU':     { bg:'#b2dfdb', color:'#004d40' },
  'PHYSICS':   { bg:'#80deea', color:'#006064' },
  'CHEMISTRY': { bg:'#a5d6a7', color:'#1b5e20' },
  'BIOLOGY':   { bg:'#dcedc8', color:'#33691e' },
  'ECONOMICS': { bg:'#ffe0b2', color:'#e65100' },
};

const WEEKEND = ['Saturday', 'Sunday'];

function subjectBadge(subject) {
  if (!subject) return '<td style="background:#fafafa"></td>';
  const c = SUBJECT_COLORS[subject] || { bg:'#e8e8e8', color:'#333' };
  return `<td style="background:${c.bg};color:${c.color};font-weight:700;font-size:11px;
    text-align:center;padding:5px 4px;white-space:nowrap;border:1px solid rgba(0,0,0,0.08)">${subject}</td>`;
}

// ── Render full table (admin view — all classes) ───────────────────────────
export function renderFullSchedule(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const visibleRows = EXAM_ROWS.filter(r => !WEEKEND.includes(r.day));
  const allRows     = EXAM_ROWS;

  el.innerHTML = `
    <div style="margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <h4 style="color:var(--accent-dark);margin:0">
        <i class="fas fa-calendar-check" style="margin-right:8px;color:var(--accent)"></i>${EXAM_TITLE}
      </h4>
      <button class="btn btn-sm btn-outline" onclick="window.print()">
        <i class="fas fa-print"></i> Print
      </button>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--primary)">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px">
        <thead>
          <tr style="background:var(--accent-dark)">
            <th style="padding:10px 12px;text-align:left;white-space:nowrap;color:#f5f0e8;font-weight:700">Date</th>
            <th style="padding:10px 12px;text-align:left;color:#f5f0e8;font-weight:700">Day</th>
            ${EXAM_CLASSES.map(c => `<th style="padding:10px 8px;text-align:center;color:#f5f0e8;font-weight:700;font-size:12px">Class ${c}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${allRows.map(row => {
            const isWeekend  = WEEKEND.includes(row.day);
            const hasExam    = Object.keys(row.subjects).length > 0;
            const rowBg      = isWeekend ? '#f0f0f0' : (hasExam ? '#fff' : '#fafafa');
            const dayColor   = isWeekend ? '#999' : '#333';
            return `<tr style="background:${rowBg}">
              <td style="padding:7px 12px;font-weight:${hasExam?'700':'400'};
                color:${isWeekend?'#aaa':'#222'};white-space:nowrap;
                border-bottom:1px solid #eee">${row.date}</td>
              <td style="padding:7px 12px;color:${dayColor};
                border-bottom:1px solid #eee">${row.day}</td>
              ${EXAM_CLASSES.map(cls => subjectBadge(row.subjects[cls])).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${renderNotes()}`;
}

// ── Render class-filtered table (student view) ─────────────────────────────
export function renderClassSchedule(containerId, className) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // className can be like "Class IX" or "IX"
  const cls = className.replace(/^Class\s*/i, '').trim().toUpperCase();

  if (!EXAM_CLASSES.includes(cls)) {
    el.innerHTML = `<p style="color:var(--text-light);font-size:13px;padding:16px">
      Exam schedule not available for your class (${className}).
    </p>`;
    return;
  }

  const examDays = EXAM_ROWS.filter(r => r.subjects[cls]);

  el.innerHTML = `
    <div style="margin-bottom:14px">
      <h4 style="color:var(--accent-dark);margin:0 0 4px">
        <i class="fas fa-calendar-check" style="margin-right:8px;color:var(--accent)"></i>${EXAM_TITLE}
      </h4>
      <p style="font-size:12px;color:var(--text-light);margin:0">Class ${cls} Schedule</p>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--primary)">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--accent-dark);color:#f5f0e8">
            <th style="padding:10px 14px;text-align:left">Date</th>
            <th style="padding:10px 14px;text-align:left">Day</th>
            <th style="padding:10px 14px;text-align:center">Subject</th>
          </tr>
        </thead>
        <tbody>
          ${examDays.map(row => {
            const c = SUBJECT_COLORS[row.subjects[cls]] || { bg:'#e8e8e8', color:'#333' };
            return `<tr style="border-bottom:1px solid #f0ebe3">
              <td style="padding:9px 14px;font-weight:700;color:#222;white-space:nowrap">${row.date}</td>
              <td style="padding:9px 14px;color:#555">${row.day}</td>
              <td style="padding:9px 14px;text-align:center">
                <span style="background:${c.bg};color:${c.color};font-weight:700;
                  padding:4px 14px;border-radius:20px;font-size:12px;
                  border:1px solid rgba(0,0,0,0.08)">${row.subjects[cls]}</span>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${renderNotes()}`;
}

// ── Render teacher view — pick which classes to show ──────────────────────
export function renderTeacherSchedule(containerId, teacherClasses) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Filter to only classes this teacher handles; fall back to all
  const classes = (teacherClasses && teacherClasses.length)
    ? teacherClasses.map(c => c.replace(/^Class\s*/i,'').trim().toUpperCase())
        .filter(c => EXAM_CLASSES.includes(c))
    : EXAM_CLASSES;

  el.innerHTML = `
    <div style="margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
      <h4 style="color:var(--accent-dark);margin:0">
        <i class="fas fa-calendar-check" style="margin-right:8px;color:var(--accent)"></i>${EXAM_TITLE}
      </h4>
      <button class="btn btn-sm btn-outline" onclick="window.print()">
        <i class="fas fa-print"></i> Print
      </button>
    </div>
    <div style="overflow-x:auto;border-radius:10px;border:1px solid var(--primary)">
      <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:500px">
        <thead>
          <tr style="background:var(--accent-dark);color:#f5f0e8">
            <th style="padding:10px 12px;text-align:left;white-space:nowrap">Date</th>
            <th style="padding:10px 10px;text-align:left">Day</th>
            ${classes.map(c => `<th style="padding:10px 8px;text-align:center;color:#f5f0e8;font-weight:700;font-size:12px">Class ${c}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${EXAM_ROWS.map(row => {
            const isWeekend = WEEKEND.includes(row.day);
            const hasExam   = classes.some(c => row.subjects[c]);
            if (!hasExam && !isWeekend) return '';
            const rowBg = isWeekend ? '#f5f5f5' : '#fff';
            return `<tr style="background:${rowBg};border-bottom:1px solid #eee">
              <td style="padding:7px 12px;font-weight:${hasExam?'700':'400'};
                color:${isWeekend?'#aaa':'#222'};white-space:nowrap">${row.date}</td>
              <td style="padding:7px 10px;color:${isWeekend?'#aaa':'#555'}">${row.day}</td>
              ${classes.map(cls => subjectBadge(row.subjects[cls])).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${renderNotes()}`;
}

function renderNotes() {
  return `<div style="margin-top:14px;padding:12px 16px;background:var(--bg);
    border:1px solid var(--primary);border-radius:8px;font-size:12px;
    display:flex;flex-wrap:wrap;gap:10px 24px">
    ${EXAM_NOTES.map(n =>
      `<span><strong style="color:var(--accent-dark)">${n.label}:</strong>
       <span style="color:var(--text);margin-left:6px">${n.value}</span></span>`
    ).join('')}
  </div>`;
}

// ── Auto-init on load ─────────────────────────────────────────────────────
window._examSchedule = { renderFullSchedule, renderClassSchedule, renderTeacherSchedule };

// Admin — render full table as soon as section exists in DOM
window.addEventListener('load', () => {
  renderFullSchedule('a-exam-schedule-wrap');

  // Teacher — render with their classes once app-logic sets window._currentTeacherClasses
  // Falls back to full table if no class data yet
  window._loadTeacherExamSchedule = function () {
    const classes = window._currentTeacherClasses || [];
    renderTeacherSchedule('t-exam-schedule-wrap', classes);
  };
  window._loadTeacherExamSchedule();

  // Student — render filtered by student's class (set by app-logic as window._currentStudentClass)
  window._loadStudentExamSchedule = function () {
    const cls = window._currentStudentClass || '';
    if (cls) {
      renderClassSchedule('s-exam-schedule-wrap', cls);
    } else {
      // Wait a moment for app-logic to populate student class, then retry
      setTimeout(() => {
        renderClassSchedule('s-exam-schedule-wrap', window._currentStudentClass || '');
      }, 1500);
    }
  };
});
