// ── Student "My Progress" Demo ────────────────────────────────────────────────
// Builds 3 months of synthetic Class I assessment sessions across ALL subjects,
// then drives the REAL engine + REAL view so this looks exactly like what a
// student sees in the portal. No Firestore — sessions are in-memory.

import { computeProgressFromSessions } from '../../student-progress-engine.js';
import { renderStudentProgress } from '../../student-progress-view.js';

const STUDENT_ID    = 'SFS260101';
const STUDENT_CLASS = 'Class I';
// Three consecutive months (engine groups by YYYY-MM from session.date).
const MONTHS = ['2026-03-15', '2026-04-15', '2026-05-15'];

// Per-subject starting level (0–5) → gives a weakest-first ordering + variety.
const SUBJECT_BASE = { ENG1: 3.8, ENG2: 3.3, MATH: 4.3, SCI: 2.6, KHA: 3.0 };

const clamp = v => Math.max(1, Math.min(5, Math.round(v * 10) / 10));

async function fetchJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`fetch failed: ${path}`);
  return res.json();
}

async function build() {
  const root = document.getElementById('sp-student-root');
  const subjectsReg = await fetchJSON('assessment-app/data/subjects.json');
  const classSubs = subjectsReg.filter(s => Array.isArray(s.classes) && s.classes.includes(STUDENT_CLASS));

  const sessions = [];
  for (const subj of classSubs) {
    const cj   = await fetchJSON(`assessment-app/${subj.criteria_path}`);
    const crit = cj.criteria || [];
    const cats = [...new Set(crit.map(c => c.category || 'General'))];

    MONTHS.forEach((date, m) => {
      const studentMarks = {};
      crit.forEach((c, i) => {
        const base   = SUBJECT_BASE[subj.subject_id] ?? 3.2;
        const catIdx = cats.indexOf(c.category || 'General');
        const catVar = (catIdx - (cats.length - 1) / 2) * 0.5;   // spread categories
        const wave   = Math.sin((i + 1) * 1.7) * 0.3;            // per-criterion texture
        const trend  = m * 0.45;                                 // improve month over month
        studentMarks[c.criterion_id] = clamp(base + catVar + wave + trend);
      });
      sessions.push({
        session: { class: STUDENT_CLASS, subject_id: subj.subject_id, date, status: 'reviewed' },
        marks:   { [STUDENT_ID]: studentMarks }
      });
    });
  }

  const progress = await computeProgressFromSessions(STUDENT_ID, STUDENT_CLASS, sessions);

  root.className = 'sp-panel';
  root.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = '📊 My Progress';
  root.append(h);
  renderStudentProgress(root, progress);
}

build().catch(err => {
  const root = document.getElementById('sp-student-root');
  root.textContent = 'Demo error: ' + err.message;
  console.error(err);
});
