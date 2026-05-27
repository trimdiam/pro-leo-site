// ── Report Card Admin Panel ───────────────────────────────────────────────────
// Renders into #rc-admin-root inside pro-leo-site admin dashboard.
// Lists all report cards, allows editing remarks, fee checks, and releasing.

import { buildPrintableHTML } from './report-card-print.js';

// ── Firebase (CDN imports matching pro-leo-site pattern) ──────────────────────

const FB_VERSION = '10.13.0';
const FB_BASE    = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

let db;

async function ensureDb() {
  if (db) return db;
  const { getFirestore } = await import(`${FB_BASE}/firebase-firestore.js`);
  // Re-use the already-initialised Firebase app from the host page
  const { getApp } = await import(`${FB_BASE}/firebase-app.js`);
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

function statusBadge(status) {
  const s = el('span', `rc-status-badge rc-status-${status}`, status.charAt(0).toUpperCase() + status.slice(1));
  return s;
}

function feeBadge(cleared) {
  const s = el('span', `rc-fee-badge ${cleared ? 'rc-fee-clear' : 'rc-fee-pending'}`);
  s.textContent = cleared ? '🟢 Fees Clear' : '🔴 Fees Pending';
  return s;
}

async function checkFeesCleared(studentId) {
  const database = await ensureDb();
  const { collection, query, where, getDocs } = await fsImport();
  try {
    // 'pending' is the status set when a transaction is created.
    // 'approved'/'rejected' mean the admin has reviewed it — those are not outstanding.
    // The old check used '!= paid' but 'paid' is never written anywhere in the app.
    const q = query(
      collection(database, 'fee_transactions'),
      where('studentId', '==', studentId),
      where('status', '==', 'pending')
    );
    const snap = await getDocs(q);
    return snap.empty;
  } catch {
    return false;
  }
}

async function updateCardField(docId, fields) {
  const database = await ensureDb();
  const { doc, updateDoc, serverTimestamp } = await fsImport();
  await updateDoc(doc(database, 'report_cards', docId), {
    ...fields,
    lastModifiedAt: serverTimestamp()
  });
}

// ── State ──────────────────────────────────────────────────────────────────────

let _state = {
  classFilter:  '',
  termFilter:   '',
  statusFilter: '',
  cards:        []
};

// ── Fetch cards ────────────────────────────────────────────────────────────────

async function fetchCards() {
  const database = await ensureDb();
  const { collection, query, where, getDocs, orderBy } = await fsImport();

  const constraints = [];
  if (_state.classFilter)  constraints.push(where('className', '==', _state.classFilter));
  if (_state.termFilter)   constraints.push(where('term', '==', _state.termFilter));
  if (_state.statusFilter) constraints.push(where('status', '==', _state.statusFilter));
  constraints.push(orderBy('className'));
  constraints.push(orderBy('rollNo'));

  const q = query(collection(database, 'report_cards'), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Row builder ────────────────────────────────────────────────────────────────

function buildRow(card, container, onRefresh) {
  const tr = document.createElement('tr');

  // Roll
  const tdRoll = el('td', '', card.rollNo || '—');
  // Name
  const tdName = el('td', '', card.studentName || card.studentId);
  // Class
  const tdClass = el('td', '', card.className || '—');
  // Term
  const tdTerm = el('td', '', card.termLabel || card.term || '—');
  // Overall
  const tdOverall = document.createElement('td');
  const gradeBadge = el('span', `grade-badge grade-${(card.overallGrade || 'ex').toLowerCase()}`, gradeWord(card.overallGrade));
  tdOverall.append(gradeBadge);
  // Fee status
  const tdFee = document.createElement('td');
  tdFee.append(feeBadge(card.feesCleared));
  // Card status
  const tdStatus = document.createElement('td');
  tdStatus.append(statusBadge(card.status));
  // Actions
  const tdActions = document.createElement('td');

  // ── Edit Remark ──
  const editBtn = el('button', 'rc-action-btn', 'Edit Remark');
  editBtn.type = 'button';

  const remarkWrap = el('div', 'rc-remark-wrap');
  remarkWrap.style.display = 'none';
  const remarkArea = document.createElement('textarea');
  remarkArea.className = 'rc-remark-editor';
  remarkArea.value = card.teacherRemark || '';
  const saveRemarkBtn = el('button', 'rc-remark-save-btn', 'Save Remark');
  remarkWrap.append(remarkArea, saveRemarkBtn);

  editBtn.addEventListener('click', () => {
    remarkWrap.style.display = remarkWrap.style.display === 'none' ? 'block' : 'none';
  });

  saveRemarkBtn.addEventListener('click', async () => {
    saveRemarkBtn.disabled = true;
    saveRemarkBtn.textContent = 'Saving…';
    try {
      await updateCardField(card.id, { teacherRemark: remarkArea.value, remarkEditedByAdmin: true });
      card.teacherRemark = remarkArea.value;
      saveRemarkBtn.textContent = '✅ Saved';
      setTimeout(() => { saveRemarkBtn.disabled = false; saveRemarkBtn.textContent = 'Save Remark'; }, 1500);
    } catch (err) {
      saveRemarkBtn.textContent = '❌ Error';
      saveRemarkBtn.disabled = false;
      console.error(err);
    }
  });

  tdActions.append(editBtn, remarkWrap);

  // ── Mark Ready ──
  if (card.status === 'draft') {
    const readyBtn = el('button', 'rc-action-btn', 'Mark Ready');
    readyBtn.type = 'button';
    readyBtn.addEventListener('click', async () => {
      readyBtn.disabled = true;
      await updateCardField(card.id, { status: 'ready' });
      onRefresh();
    });
    tdActions.append(readyBtn);
  }

  // ── Release ──
  if (card.status === 'ready') {
    const releaseBtn = el('button', 'rc-action-btn rc-release-btn', 'Release');
    releaseBtn.type = 'button';
    if (!card.feesCleared) releaseBtn.title = 'Fees are pending — confirm to release anyway';

    // HY2: show promotion input
    let promotionInput = null;
    if (card.term === 'HY2') {
      const promoWrap = el('div', 'rc-promotion-field');
      const promoLabel = el('label', '', 'Promoted to Class:');
      promotionInput = document.createElement('input');
      promotionInput.type = 'text';
      promotionInput.placeholder = 'e.g. Class II';
      promotionInput.value = card.promotedToClass || '';
      promoLabel.append(promotionInput);
      promoWrap.append(promoLabel, el('div', '', '(leave blank if not applicable)'));
      tdActions.append(promoWrap);
    }

    releaseBtn.addEventListener('click', async () => {
      const feeMsg = !card.feesCleared ? 'Fees are pending for this student. Release anyway?' : '';
      if (feeMsg && !confirm(feeMsg)) return;

      releaseBtn.disabled = true;
      const { serverTimestamp } = await fsImport();
      const updates = {
        status:      'released',
        releasedBy:  'Admin',
        releasedAt:  serverTimestamp()
      };
      if (promotionInput) updates.promotedToClass = promotionInput.value.trim() || null;
      await updateCardField(card.id, updates);
      onRefresh();
    });
    tdActions.append(releaseBtn);
  }

  // ── Revoke ──
  if (card.status === 'released') {
    const revokeBtn = el('button', 'rc-action-btn rc-revoke-btn', 'Revoke');
    revokeBtn.type = 'button';
    revokeBtn.addEventListener('click', async () => {
      if (!confirm('Revoke release? The student will no longer see this card.')) return;
      revokeBtn.disabled = true;
      await updateCardField(card.id, { status: 'ready', releasedBy: null, releasedAt: null });
      onRefresh();
    });
    tdActions.append(revokeBtn);
  }

  // ── Preview E-Book ──
  const previewBtn = el('button', 'rc-action-btn', '👁 Preview');
  previewBtn.type = 'button';
  previewBtn.title = 'Preview the e-book print layout';
  previewBtn.addEventListener('click', async () => {
    const database = await ensureDb();
    const { collection, query, where, getDocs } = await fsImport();
    const q = query(collection(database, 'report_cards'), where('studentId', '==', card.studentId));
    const snap = await getDocs(q);
    let hy1 = null; let hy2 = null;
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.term === 'HY1') hy1 = data;
      if (data.term === 'HY2') hy2 = data;
    });
    const html = buildPrintableHTML(hy1, hy2, {
      studentName: card.studentName,
      className:   card.className,
      rollNo:      card.rollNo,
      studentId:   card.studentId
    });
    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
  });
  tdActions.append(previewBtn);

  tr.append(tdRoll, tdName, tdClass, tdTerm, tdOverall, tdFee, tdStatus, tdActions);
  return tr;
}

// ── Main render ────────────────────────────────────────────────────────────────

export async function initReportCardAdmin() {
  const root = document.getElementById('rc-admin-root');
  if (!root) return;

  root.innerHTML = '';
  root.className = 'rc-admin-panel';

  const heading = el('h2', '', '📋 SKG – Class II Report Cards');

  const sourceLabel = el('p', '');
  sourceLabel.style.cssText = 'font-size:12px;color:#6b7280;margin:2px 0 16px';
  sourceLabel.innerHTML = 'Data source: <strong>Assessment App</strong> &nbsp;·&nbsp; '
    + '<a href="../assessment-app/" target="_blank" style="color:#8B6F47;font-weight:600;text-decoration:none">'
    + '<i class="fas fa-external-link-alt" style="font-size:10px"></i> Open Assessment App</a>';

  root.append(heading, sourceLabel);

  // ── Filter bar ──
  const filterBar = el('div', 'rc-filter-bar');

  const classLabel = el('label', '', 'Class');
  const classSelect = document.createElement('select');
  ['', 'LKG', 'SKG', 'Class I', 'Class II'].forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c || '— All Classes —';
    classSelect.append(o);
  });
  classSelect.value = _state.classFilter;
  classLabel.append(classSelect);

  const termLabel = el('label', '', 'Term');
  const termSelect = document.createElement('select');
  [['', '— All Terms —'], ['HY1', 'First Half-Yearly'], ['HY2', 'Second Half-Yearly']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    termSelect.append(o);
  });
  termSelect.value = _state.termFilter;
  termLabel.append(termSelect);

  const statusLabel = el('label', '', 'Status');
  const statusSelect = document.createElement('select');
  [['', '— All Status —'], ['draft', 'Draft'], ['ready', 'Ready'], ['released', 'Released']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    statusSelect.append(o);
  });
  statusSelect.value = _state.statusFilter;
  statusLabel.append(statusSelect);

  const refreshBtn = el('button', '', '🔄 Refresh');
  refreshBtn.type = 'button';

  filterBar.append(classLabel, termLabel, statusLabel, refreshBtn);
  root.append(filterBar);

  // ── Bulk actions ──
  const bulkBar = el('div', 'rc-bulk-bar');

  const releaseAllBtn = el('button', 'rc-bulk-btn', 'Release All (Fees Cleared)');
  releaseAllBtn.type = 'button';
  const refreshFeeBtn = el('button', 'rc-bulk-btn', 'Refresh Fee Status');
  refreshFeeBtn.type = 'button';

  bulkBar.append(releaseAllBtn, refreshFeeBtn);
  root.append(bulkBar);

  // ── Table ──
  const tableWrap = el('div', 'rc-table-wrap');
  const table = el('table', 'rc-table');
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Roll', 'Student Name', 'Class', 'Term', 'Overall', 'Fee Status', 'Card Status', 'Actions'].forEach(h => {
    headerRow.append(el('th', '', h));
  });
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  const loadingRow = document.createElement('tr');
  const loadingTd = el('td', '', 'Loading…');
  loadingTd.colSpan = 8;
  loadingTd.style.textAlign = 'center';
  loadingTd.style.color = '#888';
  loadingRow.append(loadingTd);
  tbody.append(loadingRow);

  table.append(tbody);
  tableWrap.append(table);
  root.append(tableWrap);

  // ── Load data ──
  async function loadAndRender() {
    tbody.innerHTML = '';
    const loadRow = document.createElement('tr');
    const loadTd = el('td', '', 'Loading…');
    loadTd.colSpan = 8;
    loadTd.style.textAlign = 'center';
    loadRow.append(loadTd);
    tbody.append(loadRow);

    try {
      _state.classFilter  = classSelect.value;
      _state.termFilter   = termSelect.value;
      _state.statusFilter = statusSelect.value;

      const cards = await fetchCards();
      _state.cards = cards;

      tbody.innerHTML = '';
      if (cards.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyTd = el('td', '', 'No report cards found for the selected filters.');
        emptyTd.colSpan = 8;
        emptyTd.style.textAlign = 'center';
        emptyTd.style.color = '#888';
        emptyTd.style.fontStyle = 'italic';
        emptyRow.append(emptyTd);
        tbody.append(emptyRow);
      } else {
        cards.forEach(card => {
          tbody.append(buildRow(card, tbody, loadAndRender));
        });
      }
    } catch (err) {
      tbody.innerHTML = '';
      const errRow = document.createElement('tr');
      const errTd = el('td', '', `Error loading cards: ${err.message}`);
      errTd.colSpan = 8;
      errTd.style.color = '#cc5500';
      errRow.append(errTd);
      tbody.append(errRow);
    }
  }

  refreshBtn.addEventListener('click', loadAndRender);

  // ── Refresh fee status for all loaded cards ──
  refreshFeeBtn.addEventListener('click', async () => {
    refreshFeeBtn.disabled = true;
    refreshFeeBtn.textContent = 'Refreshing…';
    for (const card of _state.cards) {
      const cleared = await checkFeesCleared(card.studentId);
      if (cleared !== card.feesCleared) {
        await updateCardField(card.id, { feesCleared: cleared });
      }
    }
    refreshFeeBtn.textContent = '✅ Done';
    await loadAndRender();
    setTimeout(() => { refreshFeeBtn.disabled = false; refreshFeeBtn.textContent = 'Refresh Fee Status'; }, 1000);
  });

  // ── Bulk release ──
  releaseAllBtn.addEventListener('click', async () => {
    const eligible = _state.cards.filter(c => c.feesCleared && c.status === 'ready');
    if (eligible.length === 0) { alert('No cards ready for release with fees cleared.'); return; }
    if (!confirm(`Release ${eligible.length} card(s) with fees cleared?`)) return;

    releaseAllBtn.disabled = true;
    releaseAllBtn.textContent = 'Releasing…';
    const { serverTimestamp } = await fsImport();
    for (const card of eligible) {
      await updateCardField(card.id, { status: 'released', releasedBy: 'Admin (Bulk)', releasedAt: serverTimestamp() });
    }
    await loadAndRender();
    releaseAllBtn.disabled = false;
    releaseAllBtn.textContent = 'Release All (Fees Cleared)';
  });

  await loadAndRender();
}
