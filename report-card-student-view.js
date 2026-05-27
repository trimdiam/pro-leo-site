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

  // On Capacitor (APK), window.open is unreliable — the new window's print
  // button and window.close don't work in the Android WebView. Render the
  // report as a full-screen iframe overlay inside the portal instead.
  // On desktop, keep the new-tab behaviour.
  const isCapacitor = !!window.Capacitor;
  let w = null;
  if (!isCapacitor) {
    try { w = window.open('', '_blank'); } catch (_) { w = null; }
  }

  if (w) {
    w.document.write(html);
    w.document.close();
    return;
  }

  // Inline overlay fallback (Capacitor or popup-blocked desktop)
  let overlay = document.getElementById('rc-fullscreen-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'rc-fullscreen-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#fff;overflow:hidden';

  // Use document.write() into about:blank (same-origin) instead of a blob: URL.
  // blob: URL iframes have an opaque origin — html2canvas's internal sandbox
  // sub-iframes inherit it and can't load external resources (fonts, images),
  // producing a blank white canvas. about:blank inherits the portal's real origin
  // so html2canvas works correctly.
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'border:0;width:100%;height:100%;display:block';
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();

  function onMessage(e) {
    if (!e || !e.data) return;
    if (e.data.type === 'closeReportOverlay') {
      overlay.remove();
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('message', onMessage);
      return;
    }
    if (e.data.type === 'savePdfRequest') {
      handleSavePdfRequest(e.data, e.source);
      return;
    }
  }
  window.addEventListener('message', onMessage);
}

// Direct PDF download — opens the same visible full-screen overlay as "View Report"
// and auto-triggers the Download PDF button inside it. The overlay stays open so
// the browser can complete the file download — user closes it with "← Back".
//
// WHY visible overlay: html2canvas only captures content the browser has PAINTED.
// Hidden/off-screen iframes are skipped by the paint engine → blank canvas → blank PDF.
// Do NOT await rcDownloadPDF or auto-close — destroying the iframe cancels the download.
function downloadReportPdfDirect(hy1Card, hy2Card, studentInfo) {
  const html = buildPrintableHTML(hy1Card, hy2Card, studentInfo);

  let overlay = document.getElementById('rc-fullscreen-overlay');
  if (overlay) overlay.remove();
  overlay = document.createElement('div');
  overlay.id = 'rc-fullscreen-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#fff;overflow:hidden';

  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'border:0;width:100%;height:100%;display:block';
  overlay.appendChild(iframe);
  document.body.appendChild(overlay);
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  function onMessage(e) {
    if (!e || !e.data) return;
    if (e.data.type === 'closeReportOverlay') {
      overlay.remove();
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('message', onMessage);
      return;
    }
    if (e.data.type === 'savePdfRequest') {
      handleSavePdfRequest(e.data, e.source);
      return;
    }
  }
  window.addEventListener('message', onMessage);

  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();

  const fwin = iframe.contentWindow;

  // Wait for html2canvas + jsPDF to load, then fire the download.
  // Overlay stays alive — user closes via "← Back" after the file saves.
  (async () => {
    for (let i = 0; i < 200 && (!fwin || typeof fwin.rcDownloadPDF !== 'function'); i++) {
      await new Promise(r => setTimeout(r, 50));
    }
    if (fwin && typeof fwin.rcDownloadPDF === 'function') {
      await new Promise(r => setTimeout(r, 400)); // let overlay fully paint
      fwin.rcDownloadPDF(); // intentionally not awaited — overlay must stay alive
    }
  })();
}

// Bridge: report-card iframe asks the portal to save a PDF via Capacitor
// Filesystem plugin (if installed natively). Falls back gracefully if missing.
async function handleSavePdfRequest(req, source) {
  const reply = (data) =>
    source && source.postMessage({ type: 'pdfSaveResult', reqId: req.reqId, ...data }, '*');
  try {
    const cap = window.Capacitor;
    const fs = cap && cap.Plugins && cap.Plugins.Filesystem;
    if (!fs || !fs.writeFile) {
      reply({ ok: false, reason: 'no-plugin' });
      return;
    }
    // Use Documents directory; APK file managers can read it under
    // /Android/data/<pkg>/files/Documents or similar.
    const result = await fs.writeFile({
      path: req.filename,
      data: req.base64,
      directory: 'DOCUMENTS',
      recursive: true
    });
    reply({
      ok: true,
      message: 'PDF saved to Documents: ' + req.filename,
      path: result && result.uri ? result.uri : req.filename
    });
  } catch (err) {
    reply({ ok: false, reason: (err && err.message) || 'save-failed' });
  }
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

        const hy1 = termTitle.includes('First') ? card : null;
        const hy2 = termTitle.includes('Second') ? card : null;

        const viewBtn = el('button', 'rc-view-btn', '📄 View Report');
        viewBtn.type = 'button';
        viewBtn.addEventListener('click', () => openPrintWindow(hy1, hy2, studentInfo));
        tc.append(viewBtn);

        const dlBtn = el('button', 'rc-view-btn rc-download-btn', '📥 Download PDF');
        dlBtn.type = 'button';
        dlBtn.style.marginTop = '6px';
        dlBtn.addEventListener('click', () => {
          downloadReportPdfDirect(hy1, hy2, studentInfo);
        });
        tc.append(dlBtn);
      } else {
        tc.append(el('p', '', 'Not yet available.'));
      }

      return tc;
    }

    if (hy1Card) termCards.append(buildTermCard(hy1Card, '📋 First Half-Yearly Report'));
    if (hy2Card) termCards.append(buildTermCard(hy2Card, '📋 Second Half-Yearly Report'));

    root.append(termCards);

    // ── View / Download complete record ──
    if (hy1Card || hy2Card) {
      const printAllBtn = el('button', 'rc-print-all-btn', '📄 View Complete Academic Record (Both Terms)');
      printAllBtn.type = 'button';
      printAllBtn.addEventListener('click', () => {
        openPrintWindow(hy1Card, hy2Card, studentInfo);
      });
      root.append(printAllBtn);

      const downloadAllBtn = el('button', 'rc-print-all-btn rc-download-all-btn', '📥 Download Complete Academic Record (PDF)');
      downloadAllBtn.type = 'button';
      downloadAllBtn.style.marginTop = '6px';
      downloadAllBtn.addEventListener('click', () => {
        downloadReportPdfDirect(hy1Card, hy2Card, studentInfo);
      });
      root.append(downloadAllBtn);
    }

  } catch (err) {
    loadingMsg?.remove();
    root.append(el('p', 'rc-no-cards', `Error loading report cards: ${err.message}`));
    console.error('Report card student view error:', err);
  }
}
