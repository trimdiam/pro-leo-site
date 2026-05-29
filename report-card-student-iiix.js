// ── Student Report Card — Class III–X ─────────────────────────────────────────
// Class III–X marks live in the `marks` collection (Sfs-report-card system), not
// in `report_cards`. This module lets a III–X student view/download their OWN
// report card in the portal — gated on admin release (releasedToStudent on the
// Final Term doc) — rendered with the existing III–X design (reportcard.html +
// render.js) via the same sessionStorage bridge the admin uses.

const FB_VERSION = '10.13.0';
const FB_BASE    = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

// Student class is stored Arabic ("9"); marks docs use Roman ("IX").
const ROMAN = { '3':'III', '4':'IV', '5':'V', '6':'VI', '7':'VII', '8':'VIII', '9':'IX', '10':'X' };

let _db;
async function ensureDb() {
  if (_db) return _db;
  const { getFirestore } = await import(`${FB_BASE}/firebase-firestore.js`);
  const { getApp }       = await import(`${FB_BASE}/firebase-app.js`);
  _db = getFirestore(getApp());
  return _db;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** True for classes 3–10 (the marks-based report card system). */
export function isClassIIIToX(classRaw) {
  return Object.prototype.hasOwnProperty.call(ROMAN, String(classRaw));
}

/** Maps a student's class + section to the marks doc classId (e.g. "IX" or "X-A"). */
function resolveClassId(classRaw, section) {
  const roman = ROMAN[String(classRaw)];
  if (!roman) return null;
  const sec = section && section !== 'undefined' ? String(section).trim() : '';
  return sec ? `${roman}-${sec}` : roman;
}

const NOT_RELEASED_MSG =
  'No report card has been released for you yet. Please check back after your results are published.';

// Opens the III–X report card using the existing reportcard.html + render.js.
// Mirrors the admin path (arcViewReportCard): stash the data in sessionStorage,
// then open reportcard.html. New tab on desktop (inherits sessionStorage),
// in-portal iframe overlay on Capacitor APK where window.open is unreliable.
function openReport(hyData, ftData, classId, studentName) {
  sessionStorage.setItem('sfds_adminRC', JSON.stringify({ hyData, ftData, classId }));
  const url = '/Sfs-report-card/reportcard.html';

  if (!window.Capacitor) {
    const w = window.open(url, '_blank');
    if (w) return;
  }

  let overlay = document.getElementById('rc-iiix-overlay');
  if (overlay) overlay.remove();
  overlay = el('div');
  overlay.id = 'rc-iiix-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#fff;display:flex;flex-direction:column';

  const bar = el('div');
  bar.style.cssText = 'flex:0 0 auto;background:#2C1F0E;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;font-weight:600';
  bar.append(el('span', '', studentName ? `${studentName} — Report Card` : 'Report Card'));
  const closeBtn = el('button', '', '✕ Close');
  closeBtn.type = 'button';
  closeBtn.style.cssText = 'background:#8B6F47;color:#fff;border:none;border-radius:6px;padding:6px 14px;font-weight:700;cursor:pointer';
  const prevOverflow = document.body.style.overflow;
  closeBtn.addEventListener('click', () => { overlay.remove(); document.body.style.overflow = prevOverflow; });
  bar.append(closeBtn);

  const iframe = el('iframe');
  iframe.src = url;
  iframe.style.cssText = 'flex:1 1 auto;border:0;width:100%';

  overlay.append(bar, iframe);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
}

/**
 * Renders the III–X student report card panel into `root`.
 * @param {HTMLElement} root
 * @param {string} studentId
 * @param {string} classRaw  - student's class, Arabic ("3".."10")
 * @param {string} [section]
 */
export async function renderClassIIIToXReportCard(root, studentId, classRaw, section) {
  root.innerHTML = '';
  root.className = 'rc-student-panel';
  root.append(el('h2', '', '📋 My Report Card'));

  const classId = resolveClassId(classRaw, section);
  if (!studentId || !classId) {
    root.append(el('p', 'rc-no-cards', 'Student information not found. Please contact the school office.'));
    return;
  }

  const loading = el('p', 'rc-no-cards', 'Loading your report card…');
  root.append(loading);

  try {
    const db = await ensureDb();
    const { doc, getDoc } = await import(`${FB_BASE}/firebase-firestore.js`);

    // The Final Term doc carries the release flag. Until released, the security
    // rule denies the read — so a permission error here means "not released".
    let ftSnap = null;
    try {
      ftSnap = await getDoc(doc(db, 'marks', `${classId}_FT`, 'students', studentId));
    } catch (_) {
      loading.remove();
      root.append(el('p', 'rc-no-cards', NOT_RELEASED_MSG));
      return;
    }

    if (!ftSnap.exists() || ftSnap.data().releasedToStudent !== true) {
      loading.remove();
      root.append(el('p', 'rc-no-cards', NOT_RELEASED_MSG));
      return;
    }

    const ftData = ftSnap.data();
    let hyData = {};
    try {
      const hySnap = await getDoc(doc(db, 'marks', `${classId}_HY`, 'students', studentId));
      if (hySnap.exists()) hyData = hySnap.data();
    } catch (_) { /* HY optional */ }

    loading.remove();

    const name = ftData.studentName || '';
    const card = el('div', 'rc-term-card');
    card.append(el('h3', '', 'Annual Report Card'));
    if (name) card.append(el('p', '', name));
    card.append(el('p', '', `Class ${classId.replace('-', ' · Section ')}`));
    if (ftData.releasedAt) {
      const when = new Date(ftData.releasedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      card.append(el('p', '', `Released: ${when}`));
    }

    const viewBtn = el('button', 'rc-view-btn', '📄 View / Download Report Card');
    viewBtn.type = 'button';
    viewBtn.addEventListener('click', () => openReport(hyData, ftData, classId, name));
    card.append(viewBtn);

    root.append(card);
  } catch (err) {
    loading.remove();
    root.append(el('p', 'rc-no-cards', `Error loading report card: ${err.message}`));
    console.error('III–X report card view error:', err);
  }
}
