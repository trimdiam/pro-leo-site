// ── Student Progress View ─────────────────────────────────────────────────────
// Renders personal subject progress into #sp-student-root inside the student portal.
// Data comes from student-progress-engine.js (Firestore assessment_sessions).
//
// Export: initStudentProgressView(studentId, studentClass)

import { getStudentProgress } from './student-progress-engine.js';

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function bandCls(level) {
  return `sp-band sp-band--${level}`;
}

// ── Section: Subject card header ──────────────────────────────────────────────

function renderSubjectHeader(subject) {
  const header = el('div', 'sp-subject-header');

  const left = el('div', 'sp-subject-left');
  left.append(el('span', 'sp-subject-name', subject.subject_name));
  left.append(el('span', bandCls(subject.level), subject.label));
  header.append(left);

  const right = el('div', 'sp-subject-right');
  right.append(el('span', 'sp-subject-pct', `${subject.overallPercentage}%`));
  right.append(el('span', 'sp-subject-arrow', '▸'));
  header.append(right);

  return header;
}

// ── Section: Alerts ───────────────────────────────────────────────────────────

function renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) return null;
  const wrap = el('div', 'sp-alerts');
  alerts.forEach(a => {
    const d = el('div', `sp-alert sp-alert--${a.type}`);
    if (a.type === 'decline') {
      d.textContent = `📉 Your ${a.category} dropped ${a.diff}% since last month (${a.prevPct}% → ${a.currPct}%)`;
    } else {
      d.textContent = `📈 Your ${a.category} improved ${a.diff}% since last month (${a.prevPct}% → ${a.currPct}%) — well done!`;
    }
    wrap.append(d);
  });
  return wrap;
}

// ── Section: Strongest / weakest callout ──────────────────────────────────────

function renderStrengthCallout(subject) {
  const wrap = el('div', 'sp-callout-row');
  if (subject.strongest) {
    const s = el('div', 'sp-callout sp-callout--strong');
    s.innerHTML = `💪 <strong>Strongest:</strong> ${subject.strongest.category} — ${subject.strongest.averagePercentage}%`;
    wrap.append(s);
  }
  if (subject.weakest && subject.weakest.category !== subject.strongest?.category) {
    const w = el('div', 'sp-callout sp-callout--weak');
    w.innerHTML = `⚠️ <strong>Needs Practice:</strong> ${subject.weakest.category} — ${subject.weakest.averagePercentage}%`;
    wrap.append(w);
  }
  return wrap;
}

// ── Section: Focus tip ────────────────────────────────────────────────────────

function renderFocusTip(focusCriterion) {
  if (!focusCriterion) return null;
  const tip = el('div', 'sp-focus-tip');
  tip.innerHTML = `🎯 <strong>Focus on:</strong> ${focusCriterion.criterion_name} — ${focusCriterion.averagePercentage}% (your weakest skill right now)`;
  return tip;
}

// ── Section: Category bars ────────────────────────────────────────────────────

function renderCategoryBars(subject) {
  const wrap = el('div', 'sp-categories');

  subject.categories.forEach(cat => {
    const row = el('div', 'sp-cat-row');

    const nameWrap = el('div', 'sp-cat-name');
    nameWrap.append(el('span', '', cat.category));
    nameWrap.append(el('span', bandCls(cat.level), cat.label));
    row.append(nameWrap);

    const barWrap = el('div', 'sp-bar-wrap');
    const bar = el('div', 'sp-bar');
    bar.style.width     = `${cat.averagePercentage}%`;
    bar.style.background = cat.color;
    barWrap.append(bar);
    row.append(barWrap);

    row.append(el('span', 'sp-pct', `${cat.averagePercentage}%`));
    wrap.append(row);

    // Criteria expansion slot (toggled by "See all criteria" button)
    const slot = el('div', 'sp-criteria-slot');
    slot.dataset.cat = cat.category;
    wrap.append(slot);
  });

  return wrap;
}

// ── Section: Criteria list (expanded per category) ────────────────────────────

function renderCriteriaList(criteria, category) {
  const box = el('div', 'sp-criteria-box');
  const filtered = criteria.filter(c => c.category === category);
  if (filtered.length === 0) return box;

  filtered.forEach(c => {
    const row = el('div', 'sp-criterion-row');

    row.append(el('span', 'sp-criterion-name', c.criterion_name));

    const barWrap = el('div', 'sp-bar-wrap sp-bar-wrap--sm');
    const bar = el('div', 'sp-bar');
    bar.style.width      = `${c.averagePercentage}%`;
    bar.style.background  = c.color;
    barWrap.append(bar);
    row.append(barWrap);

    const right = el('div', 'sp-criterion-right');
    right.append(el('span', 'sp-pct', `${c.averagePercentage}%`));
    right.append(el('span', bandCls(c.level), c.label));
    row.append(right);

    box.append(row);
  });
  return box;
}

// ── Section: Toggle criteria button ──────────────────────────────────────────

function renderCriteriaToggle(subject, catSection) {
  if (!subject.hasCategories) return null;

  const btn = el('button', 'sp-toggle-btn');
  btn.type = 'button';
  btn.textContent = '▸ See individual criteria';

  let open = false;
  btn.addEventListener('click', () => {
    open = !open;
    btn.textContent = open ? '▾ Hide criteria' : '▸ See individual criteria';

    catSection.querySelectorAll('.sp-criteria-slot').forEach(slot => {
      if (open) {
        const cat = slot.dataset.cat;
        slot.replaceChildren(renderCriteriaList(subject.criteria, cat));
      } else {
        slot.replaceChildren();
      }
    });
  });

  return btn;
}

// ── Subject card (collapsed → expanded on click) ──────────────────────────────

function buildSubjectCard(subject) {
  const card = el('div', 'sp-subject-card');
  const header = renderSubjectHeader(subject);
  card.append(header);

  const body = el('div', 'sp-subject-body');
  card.append(body);

  let expanded = false;

  header.style.cursor = 'pointer';
  header.addEventListener('click', () => {
    expanded = !expanded;
    const arrow = header.querySelector('.sp-subject-arrow');
    if (arrow) arrow.textContent = expanded ? '▾' : '▸';
    card.classList.toggle('sp-subject-card--open', expanded);

    if (!expanded) { body.replaceChildren(); return; }

    // Build body on first open
    const alerts = renderAlerts(subject.alerts);
    if (alerts) body.append(alerts);

    body.append(renderStrengthCallout(subject));

    const catSection = renderCategoryBars(subject);
    body.append(catSection);

    const toggle = renderCriteriaToggle(subject, catSection);
    if (toggle) body.append(toggle);

    const tip = renderFocusTip(subject.focusCriterion);
    if (tip) body.append(tip);

    if (subject.monthsTracked > 0) {
      body.append(el('p', 'sp-meta', `Based on ${subject.monthsTracked} month(s) of assessments`));
    }
  });

  return card;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Initialises the student progress view inside #sp-student-root.
 * @param {string} studentId    The logged-in student's ID e.g. "SFS260101"
 * @param {string} studentClass The student's class e.g. "Class I"
 */
export async function initStudentProgressView(studentId, studentClass) {
  const root = document.getElementById('sp-student-root');
  if (!root) return;

  root.innerHTML = '';
  root.className = 'sp-panel';

  root.append(el('h2', '', '📊 My Progress'));

  if (!studentId || !studentClass) {
    root.append(el('p', 'sp-empty', 'Student information not found. Please contact the school office.'));
    return;
  }

  const loading = el('p', 'sp-empty', 'Loading your progress…');
  root.append(loading);

  try {
    const subjects = await getStudentProgress(studentId, studentClass);
    loading.remove();
    renderStudentProgress(root, subjects);
  } catch (err) {
    loading?.remove();
    root.append(el('p', 'sp-empty', `Error loading progress: ${err.message}`));
    console.error('Student progress view error:', err);
  }
}

/**
 * Renders an already-computed progress array into a root element.
 * Shared by the live portal and offline demos so both look identical.
 * Assumes the loading placeholder (if any) has been removed by the caller.
 *
 * @param {HTMLElement} root
 * @param {Array} subjects - output of getStudentProgress / computeProgressFromSessions
 */
export function renderStudentProgress(root, subjects) {
  if (!root) return;

  if (!subjects || subjects.length === 0) {
    root.append(el('p', 'sp-empty', 'No assessment data available yet. Check back after your teacher completes an assessment.'));
    return;
  }

  const intro = el('p', 'sp-intro',
    'Tap any subject to see your detailed breakdown. Subjects needing most attention are shown first.');
  root.append(intro);

  subjects.forEach(subject => root.append(buildSubjectCard(subject)));
}
