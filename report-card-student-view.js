// ── Report Card Student View ──────────────────────────────────────────────────
// Renders into #rc-student-root inside the student portal.
// Shows released report cards as summary cards and drives e-book printing.

import { buildPrintableHTML } from './report-card-print.js';

const FB_VERSION = '10.13.0';
const FB_BASE    = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

let db;

async function ensureDb() {
  if (db) return db;
  const { getFirestore } = await import(`${FB_BASE}/firebase-firestore.js`);
  const { getApp }       = await import(`${FB_BASE}/firebase-app.js`);
  db = getFirestore(getApp());
  return db;
}

async function fsImport() {
  return import(`${FB_BASE}/firebase-firestore.js`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function gradeWord(code) {
  const map = { Adv: 'Advanced', Prof: 'Proficient', Dev: 'Developing', Beg: 'Beginning', NY: 'Not Yet', Ex: 'Exempt' };
  return code ? (map[code] || code) : '—';
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

function openPrintWindow(hy1Card, hy2Card, studentInfo) {
  const html = buildPrintableHTML(hy1Card, hy2Card, studentInfo);
  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  // Brief delay to ensure styles render before print dialog
  setTimeout(() => w.print(), 300);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Initialises the student report card view inside #rc-student-root.
 * @param {string} studentId - The logged-in student's universal ID e.g. "SFS/2025/001"
 */
export async function initReportCardStudentView(studentId) {
  const root = document.getElementById('rc-student-root');
  if (!root) return;

  root.innerHTML = '';
  root.className = 'rc-student-panel';

  const heading = el('h2', '', '📋 My Report Cards');
  root.append(heading);

  if (!studentId) {
    root.append(el('p', 'rc-no-cards', 'Student ID not found. Please contact the school office.'));
    return;
  }

  const loadingMsg = el('p', 'rc-no-cards', 'Loading your report cards…');
  root.append(loadingMsg);

  try {
    const database = await ensureDb();
    const { collection, query, where, getDocs } = await fsImport();

    const q = query(
      collection(database, 'report_cards'),
      where('studentId', '==', studentId),
      where('status', '==', 'released')
    );
    const snap = await getDocs(q);

    loadingMsg.remove();

    let hy1Card = null;
    let hy2Card = null;

    snap.docs.forEach(d => {
      const data = d.data();
      if (data.term === 'HY1') hy1Card = data;
      if (data.term === 'HY2') hy2Card = data;
    });

    if (!hy1Card && !hy2Card) {
      root.append(el('p', 'rc-no-cards', 'No report cards have been released for you yet. Please check back later or contact your class teacher.'));
      return;
    }

    const studentInfo = {
      studentName: hy1Card?.studentName || hy2Card?.studentName || '—',
      className:   hy1Card?.className   || hy2Card?.className   || '—',
      rollNo:      hy1Card?.rollNo      || hy2Card?.rollNo      || '—',
      studentId
    };

    // ── Term summary cards ──
    const termCards = el('div', 'rc-term-cards');

    function buildTermCard(card, termTitle) {
      const tc = el('div', 'rc-term-card');
      tc.append(el('h3', '', termTitle));

      if (card) {
        const gradeCode = card.overallGrade || 'Ex';
        const overallP = el('p', '', `Overall: ${gradeWord(gradeCode)}`);
        const overallBadge = el('span', `grade-badge grade-${gradeCode.toLowerCase()}`, gradeCode);
        overallP.append(' ', overallBadge);
        tc.append(overallP);
        tc.append(el('p', '', `Released: ${formatDate(card.releasedAt)}`));

        const viewBtn = el('button', 'rc-view-btn', '📄 View Full Report Card');
        viewBtn.type = 'button';
        viewBtn.addEventListener('click', () => {
          const hy1 = termTitle.includes('First') ? card : null;
          const hy2 = termTitle.includes('Second') ? card : null;
          openPrintWindow(hy1, hy2, studentInfo);
        });
        tc.append(viewBtn);
      } else {
        tc.append(el('p', '', 'Not yet available.'));
      }

      return tc;
    }

    if (hy1Card) termCards.append(buildTermCard(hy1Card, '📋 First Half-Yearly Report'));
    if (hy2Card) termCards.append(buildTermCard(hy2Card, '📋 Second Half-Yearly Report'));

    root.append(termCards);

    // ── Print complete record button ──
    if (hy1Card || hy2Card) {
      const printAllBtn = el('button', 'rc-print-all-btn', '🖨 Print Complete Academic Record (Both Terms)');
      printAllBtn.type = 'button';
      printAllBtn.addEventListener('click', () => {
        openPrintWindow(hy1Card, hy2Card, studentInfo);
      });
      root.append(printAllBtn);
    }

  } catch (err) {
    loadingMsg?.remove();
    root.append(el('p', 'rc-no-cards', `Error loading report cards: ${err.message}`));
    console.error('Report card student view error:', err);
  }
}
