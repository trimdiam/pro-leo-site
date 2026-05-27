// ── Subject Drill-Down Panel ──────────────────────────────────────────────────
// Renders full per-subject analytics for the admin dashboard.
// Called from analytics-dashboard.js when a subject row is clicked.
//
// Export: renderSubjectDrillDown(container, drillData)

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function bandClass(level) {
  return `drill-band drill-band--${level}`;
}

// ── Section: Header (strongest / weakest + summary line) ─────────────────────

function renderHeader(data) {
  const wrap = el('div', 'drill-header');

  if (data.strongest) {
    const s = el('div', 'drill-intel drill-intel--strong');
    s.innerHTML = `💪 <strong>Strongest:</strong> ${data.strongest.category} — ${data.strongest.averagePercentage}%`;
    wrap.append(s);
  }
  if (data.weakest && data.weakest.category !== data.strongest?.category) {
    const w = el('div', 'drill-intel drill-intel--weak');
    w.innerHTML = `⚠️ <strong>Needs Work:</strong> ${data.weakest.category} — ${data.weakest.averagePercentage}%`;
    wrap.append(w);
  }

  const meta = el('p', 'drill-meta',
    `${data.studentList.length} students · ${data.monthsTracked} month(s) of data`);
  wrap.append(meta);
  return wrap;
}

// ── Section: Alerts (decline / improvement / skill gap / quick win) ───────────

function renderAlerts(data) {
  const frag = document.createDocumentFragment();

  data.alerts.forEach(a => {
    const d = el('div', `drill-alert drill-alert--${a.type}`);
    d.textContent = a.type === 'decline' ? `📉 ${a.message}` : `📈 ${a.message}`;
    frag.append(d);
  });

  data.skillGaps.forEach(g => {
    const d = el('div', 'drill-alert drill-alert--gap');
    d.textContent = `🔴 ${g.message}`;
    frag.append(d);
  });

  if (data.quickWin) {
    const d = el('div', 'drill-alert drill-alert--quickwin');
    d.textContent = `🎯 ${data.quickWin.message}`;
    frag.append(d);
  }

  return frag;
}

// ── Section: Category progress bars ──────────────────────────────────────────

function renderCategoryBars(data, onCategoryClick) {
  const wrap = el('div', 'drill-section');
  wrap.append(el('h4', 'drill-section-title', 'Category Breakdown'));

  data.categories.forEach(cat => {
    const row = el('div', 'drill-cat-row');
    row.title = 'Click to see individual criteria';

    const nameWrap = el('div', 'drill-cat-name');
    nameWrap.append(el('span', '', cat.category));
    const badge = el('span', bandClass(cat.level), cat.label);
    nameWrap.append(badge);
    row.append(nameWrap);

    const barWrap = el('div', 'drill-bar-wrap');
    const bar = el('div', 'drill-bar');
    bar.style.width = `${cat.averagePercentage}%`;
    bar.style.background = cat.color;
    barWrap.append(bar);
    row.append(barWrap);

    const pctLabel = el('span', 'drill-pct', `${cat.averagePercentage}%`);
    row.append(pctLabel);

    // Click → expand criteria for this category
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => onCategoryClick(cat.category, row));
    wrap.append(row);

    // Placeholder for criteria expansion (inserted after this row on click)
    const expandSlot = el('div', 'drill-expand-slot');
    expandSlot.dataset.cat = cat.category;
    wrap.append(expandSlot);
  });

  return wrap;
}

// ── Section: Criteria list (expanded inside a category) ──────────────────────

function renderCriteriaExpansion(criteria, category) {
  const box = el('div', 'drill-criteria-box');
  const filtered = criteria.filter(c => c.category === category);

  if (filtered.length === 0) {
    box.append(el('p', 'drill-empty', 'No criteria data available.'));
    return box;
  }

  filtered.forEach(c => {
    const row = el('div', 'drill-criterion-row');

    const name = el('span', 'drill-criterion-name', c.criterion_name);
    row.append(name);

    const barWrap = el('div', 'drill-bar-wrap drill-bar-wrap--sm');
    const bar = el('div', 'drill-bar');
    bar.style.width = `${c.averagePercentage}%`;
    bar.style.background = c.color;
    barWrap.append(bar);
    row.append(barWrap);

    const right = el('div', 'drill-criterion-right');
    right.append(el('span', 'drill-pct', `${c.averagePercentage}%`));
    right.append(el('span', bandClass(c.level), c.label));
    row.append(right);

    box.append(row);
  });

  return box;
}

// ── Section: Heat grid ────────────────────────────────────────────────────────

function renderHeatGrid(data) {
  const wrap = el('div', 'drill-section');
  wrap.append(el('h4', 'drill-section-title', 'Student Heat Map'));

  const subNote = el('p', 'drill-meta',
    data.hasCategories
      ? 'Each cell = student\'s average % in that category. Red = weak, green = strong.'
      : 'Each cell = student\'s score on that skill. Scroll right to see all criteria.');
  wrap.append(subNote);

  const tableWrap = el('div', 'drill-table-wrap');
  const table = el('table', 'drill-heat-table');

  // Header row
  const thead = document.createElement('thead');
  const hrow = document.createElement('tr');
  hrow.append(el('th', 'drill-th drill-th--name', 'Student'));
  hrow.append(el('th', 'drill-th drill-th--overall', 'Overall'));
  data.heatGrid.columns.forEach(col => {
    const th = el('th', 'drill-th');
    // Abbreviate long column labels
    th.textContent = col.length > 12 ? col.slice(0, 11) + '…' : col;
    th.title = col;
    hrow.append(th);
  });
  thead.append(hrow);
  table.append(thead);

  // Data rows
  const tbody = document.createElement('tbody');
  data.heatGrid.rows.forEach(row => {
    const tr = document.createElement('tr');

    const nameTd = el('td', 'drill-td drill-td--name', row.full_name || row.student_id);
    tr.append(nameTd);

    const overallTd = el('td', 'drill-td drill-td--overall');
    overallTd.textContent = `${row.overallPercentage}%`;
    overallTd.style.background = heatColor(row.overallPercentage);
    overallTd.style.color = row.overallPercentage < 50 ? '#fff' : '#1a1a1a';
    tr.append(overallTd);

    data.heatGrid.columns.forEach(col => {
      const val = row.cells[col] ?? null;
      const td = el('td', 'drill-td');
      if (val === null) {
        td.textContent = '—';
        td.style.background = '#f0f0f0';
      } else {
        td.textContent = `${val}%`;
        td.style.background = heatColor(val);
        td.style.color = val < 50 ? '#fff' : '#1a1a1a';
      }
      tr.append(td);
    });

    tbody.append(tr);
  });
  table.append(tbody);
  tableWrap.append(table);
  wrap.append(tableWrap);
  return wrap;
}

function heatColor(pct) {
  if (pct >= 80) return '#1a7a5e';
  if (pct >= 60) return '#52b788';
  if (pct >= 40) return '#f4a261';
  if (pct >= 20) return '#e76f51';
  return '#c0392b';
}

// ── Section: Student ranked list ──────────────────────────────────────────────

function renderStudentList(data) {
  const wrap = el('div', 'drill-section');
  wrap.append(el('h4', 'drill-section-title', 'Student Rankings'));

  data.studentList.forEach((st, i) => {
    const row = el('div', 'drill-student-row');

    const rank = el('span', 'drill-rank', `#${i + 1}`);
    const name = el('span', 'drill-student-name', st.full_name || st.student_id);
    const badge = el('span', bandClass(st.level), st.label);
    const pctSpan = el('span', 'drill-pct', `${st.overallPercentage}%`);

    row.append(rank, name, badge, pctSpan);

    // Mini category pills
    if (data.hasCategories && st.categoryBreakdown) {
      const pills = el('div', 'drill-mini-pills');
      Object.entries(st.categoryBreakdown).forEach(([cat, p]) => {
        const pill = el('span', 'drill-mini-pill');
        pill.textContent = `${cat.split(' ')[0]} ${p}%`;
        pill.style.background = heatColor(p);
        pill.style.color = p < 50 ? '#fff' : '#1a1a1a';
        pill.title = `${cat}: ${p}%`;
        pills.append(pill);
      });
      row.append(pills);
    }

    wrap.append(row);
  });

  return wrap;
}

// ── Category click handler ────────────────────────────────────────────────────

function handleCategoryClick(category, rowEl, criteria, openSlots) {
  const slot = rowEl.parentElement.querySelector(`.drill-expand-slot[data-cat="${CSS.escape(category)}"]`);
  if (!slot) return;

  const isOpen = slot.dataset.open === '1';
  // Close all other open slots first
  openSlots.forEach((s) => {
    if (s !== slot) { s.replaceChildren(); s.dataset.open = '0'; }
  });

  if (isOpen) {
    slot.replaceChildren();
    slot.dataset.open = '0';
  } else {
    slot.replaceChildren(renderCriteriaExpansion(criteria, category));
    slot.dataset.open = '1';
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Renders the full subject drill-down into `container`.
 * @param {HTMLElement} container  The element to render into (will be cleared)
 * @param {Object}      drillData  Return value of getSubjectDrillDown()
 */
export function renderSubjectDrillDown(container, drillData) {
  container.replaceChildren();
  container.className = 'drill-panel';

  if (!drillData.hasData) {
    container.append(el('p', 'drill-empty', 'No assessment data available for this subject yet.'));
    return;
  }

  // Collect all expand slots so we can close siblings on open
  const openSlots = [];

  container.append(renderHeader(drillData));
  container.append(renderAlerts(drillData));

  // Category bars — clicking expands criteria inline
  const catSection = renderCategoryBars(drillData, (category, rowEl) => {
    handleCategoryClick(category, rowEl, drillData.criteria, openSlots);
  });
  container.append(catSection);

  // Populate openSlots after DOM is attached
  catSection.querySelectorAll('.drill-expand-slot').forEach(s => openSlots.push(s));

  container.append(renderHeatGrid(drillData));
  container.append(renderStudentList(drillData));
}
