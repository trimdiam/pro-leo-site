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

// Hard-deletes one report card. Draft-only by policy (see the Delete button):
// a released card is revoked, never deleted, so a parent who has already been
// told a card exists is never left with a dangling link. Nothing else in
// Firestore references a report_cards doc, so this needs no cascade.
async function deleteCard(docId) {
  const database = await ensureDb();
  const { doc, deleteDoc } = await fsImport();
  await deleteDoc(doc(database, 'report_cards', docId));
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
  feeFilter:    '',
  cards:        []
};

// ── Fetch cards ────────────────────────────────────────────────────────────────

// Filters are applied in memory, and that is deliberate.
//
// This previously sent every filter to Firestore as a where() plus two
// orderBy()s, which needs a COMPOSITE INDEX per filter combination —
// class+term, class+status, term+status, all three, and so on. Picking a
// combination nobody had indexed yet failed the whole screen with
// "The query requires an index" (className + term + rollNo, 2026-08-19).
// Indexing every permutation is not worth it here: report_cards holds at most
// ~237 documents per term (75 LKG + 48 SKG + 59 I + 55 II), so one equality
// filter server-side and the rest in JS is both faster to load and impossible
// to break by choosing a new filter combination.
//
// The single server-side filter is className when set, because it is the most
// selective and keeps the payload to one class. Report card documents carry
// their full criteria arrays and are not small.
async function fetchCards() {
  const database = await ensureDb();
  const { collection, query, where, getDocs } = await fsImport();

  const base = collection(database, 'report_cards');
  // One equality filter only — never combined, so no composite index is needed.
  const q = _state.classFilter
    ? query(base, where('className', '==', _state.classFilter))
    : query(base);

  const snap = await getDocs(q);
  let cards = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (_state.termFilter)   cards = cards.filter(c => c.term === _state.termFilter);
  if (_state.statusFilter) cards = cards.filter(c => c.status === _state.statusFilter);
  // Isolating who still owes money is the slow part of a release day, so it is
  // a first-class filter rather than something to eyeball down a 59-row table.
  if (_state.feeFilter === 'cleared') cards = cards.filter(c => c.feesCleared);
  if (_state.feeFilter === 'pending') cards = cards.filter(c => !c.feesCleared);

  // Same ordering the query used to ask Firestore for: class, then roll.
  cards.sort((a, b) =>
    String(a.className || '').localeCompare(String(b.className || '')) ||
    (Number(a.rollNo) || 0) - (Number(b.rollNo) || 0)
  );
  return cards;
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
  if (card.subjectsPendingReview?.length) {
    const warnIcon = el('span', 'rc-pending-review-flag', '⚠');
    warnIcon.title = `Excluded (unreviewed sessions): ${card.subjectsPendingReview.join(', ')}`;
    tdStatus.append(warnIcon);
  }
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

  // ── Edit Attendance ──
  // Manually typed present/total days, same procedure as Sfs-report-card's
  // Class III-X mark-entry form — there's no automated attendance source for
  // this pipeline, so this is the only way to set it for a card generated via
  // "Generate for Entire Class" (which has no per-student attendance inputs).
  const attBtn = el('button', 'rc-action-btn', 'Edit Attendance');
  attBtn.type = 'button';

  const attWrap = el('div', 'rc-remark-wrap');
  attWrap.style.display = 'none';
  const attPresentInput = document.createElement('input');
  attPresentInput.type = 'number';
  attPresentInput.min = '0';
  attPresentInput.className = 'rc-att-input';
  attPresentInput.placeholder = 'Present days';
  attPresentInput.value = card.attendancePresentDays ?? '';
  const attWorkingInput = document.createElement('input');
  attWorkingInput.type = 'number';
  attWorkingInput.min = '0';
  attWorkingInput.className = 'rc-att-input';
  attWorkingInput.placeholder = 'Total working days';
  attWorkingInput.value = card.attendanceWorkingDays ?? '';
  const saveAttBtn = el('button', 'rc-remark-save-btn', 'Save Attendance');
  attWrap.append(attPresentInput, attWorkingInput, saveAttBtn);

  attBtn.addEventListener('click', () => {
    attWrap.style.display = attWrap.style.display === 'none' ? 'block' : 'none';
  });

  saveAttBtn.addEventListener('click', async () => {
    saveAttBtn.disabled = true;
    saveAttBtn.textContent = 'Saving…';
    try {
      const present = attPresentInput.value.trim();
      const working = attWorkingInput.value.trim();
      const fields = {
        attendancePresentDays: present === '' ? null : parseInt(present, 10),
        attendanceWorkingDays: working === '' ? null : parseInt(working, 10)
      };
      await updateCardField(card.id, fields);
      Object.assign(card, fields);
      saveAttBtn.textContent = '✅ Saved';
      setTimeout(() => { saveAttBtn.disabled = false; saveAttBtn.textContent = 'Save Attendance'; }, 1500);
    } catch (err) {
      saveAttBtn.textContent = '❌ Error';
      saveAttBtn.disabled = false;
      console.error(err);
    }
  });

  tdActions.append(attBtn, attWrap);

  // ── Mark Ready ──
  if (card.status === 'draft') {
    const readyBtn = el('button', 'rc-action-btn', 'Mark Ready');
    readyBtn.type = 'button';
    readyBtn.addEventListener('click', async () => {
      readyBtn.disabled = true;
      await updateCardField(card.id, { status: 'ready' });
      Object.assign(card, { status: 'ready' });
      tr.replaceWith(buildRow(card, container, onRefresh));
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
      Object.assign(card, { ...updates, releasedAt: new Date() });
      tr.replaceWith(buildRow(card, container, onRefresh));
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
      Object.assign(card, { status: 'ready', releasedBy: null, releasedAt: null });
      tr.replaceWith(buildRow(card, container, onRefresh));
    });
    tdActions.append(revokeBtn);
  }

  // ── Delete (draft only) ──
  // Deliberately NOT offered for ready/released cards: 'Revoke' already covers
  // taking a released card back, and deletion there would strand a parent who
  // had already been pointed at it. A draft is the only state where the card is
  // pure work-in-progress, which is the real cleanup case (a mis-generation).
  // Destructive and irreversible — the AI-written remark and any hand-entered
  // attendance go with it — so it confirms against the student's name.
  if (card.status === 'draft') {
    const deleteBtn = el('button', 'rc-action-btn rc-delete-btn', '🗑 Delete');
    deleteBtn.type = 'button';
    deleteBtn.title = 'Permanently delete this draft report card';
    deleteBtn.addEventListener('click', async () => {
      const who = card.studentName || card.studentId;
      const msg =
        `Permanently delete the draft report card for ${who} (${card.termLabel || card.term})?

This cannot be undone. The generated remark and any attendance entered on it will be lost.
The student's marks and attendance records are NOT affected — the card can be generated again.`;
      if (!confirm(msg)) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting…';
      try {
        await deleteCard(card.id);
        tr.remove();
      } catch (err) {
        deleteBtn.textContent = '❌ Failed';
        deleteBtn.disabled = false;
        console.error('Report card delete failed:', err);
        alert('Could not delete: ' + (err.message || 'unknown error'));
      }
    });
    tdActions.append(deleteBtn);
  }

  // ── Preview E-Book ──
  const previewBtn = el('button', 'rc-action-btn', '👁 Preview');
  previewBtn.type = 'button';
  previewBtn.title = 'Preview the e-book print layout';
  previewBtn.addEventListener('click', async () => {
    const database = await ensureDb();
    const { collection, query, where, getDocs } = await fsImport();
    // Scope to this card's own academicYear — studentId alone is no longer
    // unique per term now that report_cards docIds include the year, so
    // without this a returning student's HY1/HY2 could mix across years.
    const q = query(
      collection(database, 'report_cards'),
      where('studentId', '==', card.studentId),
      where('academicYear', '==', card.academicYear)
    );
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

  const heading = el('h2', '', '📋 Play Group – Class II Report Cards');

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
  ['', 'Play Group', 'LKG', 'SKG', 'Class I', 'Class II'].forEach(c => {
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

  const feeLabel = el('label', '', 'Fees');
  const feeSelect = document.createElement('select');
  [['', '— All Fees —'], ['cleared', '🟢 Fees Clear'], ['pending', '🔴 Fees Pending']].forEach(([v, t]) => {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    feeSelect.append(o);
  });
  feeSelect.value = _state.feeFilter;
  feeLabel.append(feeSelect);

  const refreshBtn = el('button', '', '🔄 Refresh');
  refreshBtn.type = 'button';

  filterBar.append(classLabel, termLabel, statusLabel, feeLabel, refreshBtn);
  root.append(filterBar);

  // ── Bulk actions ──
  const bulkBar = el('div', 'rc-bulk-bar');

  // Releasing a class means every card must first be moved draft -> ready.
  // Doing that one row at a time is 59 clicks for Class I alone, which is why
  // the bulk release appeared to do nothing: it only ever matched 'ready' cards.
  const markReadyAllBtn = el('button', 'rc-bulk-btn', 'Mark All Ready');
  markReadyAllBtn.type = 'button';
  const releaseAllBtn = el('button', 'rc-bulk-btn rc-bulk-primary', 'Release All (Fees Cleared)');
  releaseAllBtn.type = 'button';
  const refreshFeeBtn = el('button', 'rc-bulk-btn', 'Refresh Fee Status');
  refreshFeeBtn.type = 'button';

  bulkBar.append(markReadyAllBtn, releaseAllBtn, refreshFeeBtn);
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
      _state.feeFilter    = feeSelect.value;

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
  // Changing a filter should just work — previously it needed a separate
  // Refresh click, which is why the table looked stuck on 'all classes'.
  [classSelect, termSelect, statusSelect, feeSelect].forEach(sel =>
    sel.addEventListener('change', loadAndRender));

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

  // ── Bulk: draft -> ready ──
  // Deliberately does NOT release. Fees are still the gate; this only clears the
  // clerical hurdle of promoting 59 drafts one at a time so that Release All has
  // something to act on.
  markReadyAllBtn.addEventListener('click', async () => {
    const drafts = _state.cards.filter(c => c.status === 'draft');
    if (drafts.length === 0) { alert('No draft cards in the current view.'); return; }
    if (!confirm(`Mark ${drafts.length} draft card(s) as Ready?\n\nThis does not release them — fees still have to be cleared before release.`)) return;
    markReadyAllBtn.disabled = true;
    let done = 0;
    for (const card of drafts) {
      markReadyAllBtn.textContent = `Marking ${++done}/${drafts.length}…`;
      await updateCardField(card.id, { status: 'ready' });
    }
    await loadAndRender();
    markReadyAllBtn.disabled = false;
    markReadyAllBtn.textContent = 'Mark All Ready';
  });

  // ── Bulk release ──
  releaseAllBtn.addEventListener('click', async () => {
    // The fee gate is the original design and stays: a card is never released
    // while money is outstanding. What changed is the reporting — a bare 'no
    // cards ready' told an admin nothing about WHY, when the real reason was
    // usually 59 unpromoted drafts or an unrefreshed fee flag.
    const eligible   = _state.cards.filter(c => c.feesCleared && c.status === 'ready');
    const feeBlocked = _state.cards.filter(c => !c.feesCleared && c.status === 'ready');
    const stillDraft = _state.cards.filter(c => c.status === 'draft');

    if (eligible.length === 0) {
      const why = [];
      if (stillDraft.length) why.push(`${stillDraft.length} still Draft — use "Mark All Ready" first`);
      if (feeBlocked.length) why.push(`${feeBlocked.length} Ready but fees pending — filter Fees: Pending to deal with them`);
      alert('Nothing to release.' + (why.length ? '\n\n' + why.join('\n') : ''));
      return;
    }
    const note = feeBlocked.length
      ? `\n\n${feeBlocked.length} card(s) will be SKIPPED — fees still pending.`
      : '';
    if (!confirm(`Release ${eligible.length} card(s) with fees cleared?${note}`)) return;

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
