// ── Co-Scholastic Entry ───────────────────────────────────────────────────────
// One grid per class + term: every student × every co-scholastic subject, each
// cell a letter grade (O/A+/A/B+/B/C). Unlike academic assessment there are no
// fortnightly sessions and no criteria — a single grade per term, matching the
// Class III-X convention. Blank means "not graded yet" and is allowed.

const TERM_LABELS = { HY1: 'First Half-Yearly', HY2: 'Second Half-Yearly' };

export function createCoScholasticEntry({
  classes = [],
  subjects = [],            // [{ key, label }] for selectedClass
  gradeScale = [],          // ['O','A+','A','B+','B','C']
  gradeLabels = {},
  selectedClass = '',
  selectedTerm = 'HY1',
  students = [],
  grades = {},              // { [studentId]: { [key]: grade } }
  locked = false,           // admin has locked this class+term — read only
  saveStatus = 'idle',
  lastSaved = null,
  onClassChange = () => {},
  onTermChange = () => {},
  onGradeChange = () => {},
  onSave = () => {}
} = {}) {
  const section = document.createElement('section');
  // coschol-panel scopes the full-width grid overrides in styles.css. Without
  // it the 48x7 grid inherits the panel's two-column layout and renders into a
  // half-width cell, clipping every subject column after the first.
  section.className = 'panel selector-panel coschol-panel';

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = 'Co-Scholastic Grades';
  section.append(heading);

  const sub = document.createElement('p');
  sub.className = 'class-test-subtitle';
  sub.textContent = 'One letter grade per subject per Half-Yearly term. Shown in its own section on the report card and NOT counted in the academic overall grade.';
  section.append(sub);

  // ── Controls ────────────────────────────────────────────────────────────────
  const classField = createField('Class');
  const classSelect = document.createElement('select');
  classSelect.className = 'text-input';
  classSelect.append(opt('', '— Select class —', !selectedClass));
  classes.forEach(c => classSelect.append(opt(c, c, c === selectedClass)));
  classSelect.addEventListener('change', e => onClassChange(e.target.value));
  classField.append(classSelect);
  section.append(classField);

  const termField = createField('Term');
  const termSelect = document.createElement('select');
  termSelect.className = 'text-input';
  Object.entries(TERM_LABELS).forEach(([k, v]) => termSelect.append(opt(k, v, k === selectedTerm)));
  termSelect.addEventListener('change', e => onTermChange(e.target.value));
  termField.append(termSelect);
  section.append(termField);

  if (!selectedClass) {
    section.append(msg('Select a class to begin.'));
    return section;
  }
  if (!subjects.length) {
    section.append(msg('No co-scholastic subjects are configured for this class.'));
    return section;
  }
  if (!students.length) {
    section.append(msg('No students found for this class.'));
    return section;
  }

  // A locked grid stays fully visible and navigable — the teacher can still
  // read what was submitted — but nothing accepts input. firestore.rules is the
  // real boundary; this exists so the refusal is obvious before someone spends
  // ten minutes re-entering a class and only then hits a rejected save.
  if (locked) {
    const banner = document.createElement('p');
    banner.className = 'locked-banner coschol-locked';
    banner.textContent = 'Locked by admin — these grades are final and can no longer be edited. Contact an admin if something needs to change.';
    section.append(banner);
  }

  // ── Entry mode ──────────────────────────────────────────────────────────────
  // Quick entry mirrors the assessment flow (components/quick-entry-grid.js):
  // one subject at a time, every student on screen, a single tap per grade
  // instead of open-scroll-select on a <select>. 336 dropdowns for SKG was the
  // problem; this is 336 taps, or far fewer with the bulk fill.
  //
  // Neither view re-renders on a grade change — onGradeChange deliberately does
  // not call render(), so the DOM is updated in place here and the chosen
  // subject survives every tap.
  let mode = 'quick';
  let activeKey = subjects[0].key;

  const modeBar = document.createElement('div');
  modeBar.className = 'status-chips coschol-modes';
  const quickChip = chip('Quick entry', true);
  const gridChip  = chip('Full grid', false);
  modeBar.append(quickChip, gridChip);
  section.append(modeBar);

  quickChip.addEventListener('click', () => setMode('quick'));
  gridChip.addEventListener('click', () => setMode('grid'));

  function setMode(next) {
    mode = next;
    quickChip.classList.toggle('active', next === 'quick');
    gridChip.classList.toggle('active', next === 'grid');
    quickView.hidden = next !== 'quick';
    wrap.hidden = next !== 'grid';
    // Rebuild on entry so grades typed into the grid show up here, and vice
    // versa — the two views must never disagree about the same cell.
    if (next === 'quick') renderSubjectBlock();
    else syncGrid();
  }

  // ── Quick entry: one subject, every student, one tap ────────────────────────
  const quickView = document.createElement('div');
  quickView.className = 'quick-entry-panel coschol-quick';

  const subjectBar = document.createElement('div');
  subjectBar.className = 'status-chips coschol-subjects';
  const subjectChips = subjects.map(s => {
    const c = chip(s.label, s.key === activeKey);
    c.addEventListener('click', () => setSubject(s.key));
    subjectBar.append(c);
    return { key: s.key, el: c };
  });
  quickView.append(subjectBar);

  const subjectBlock = document.createElement('div');
  subjectBlock.className = 'quick-criterion-block';
  quickView.append(subjectBlock);
  section.append(quickView);

  function setSubject(key) {
    activeKey = key;
    subjectChips.forEach(c => c.el.classList.toggle('active', c.key === key));
    renderSubjectBlock();
  }

  function gradeOf(studentId, key) {
    return grades?.[studentId]?.[key] || '';
  }

  function countFor(key) {
    const values = students.map(s => gradeOf(s.student_id, key)).filter(Boolean);
    const distinct = new Set(values);
    return { done: values.length, uniform: values.length === students.length && distinct.size === 1 ? [...distinct][0] : null };
  }

  function renderSubjectBlock() {
    const subject = subjects.find(s => s.key === activeKey) || subjects[0];
    subjectBlock.replaceChildren();

    const head = document.createElement('div');
    head.className = 'quick-criterion-header';
    const idx = subjects.findIndex(s => s.key === subject.key) + 1;
    head.innerHTML = `<strong>${subject.label}</strong> <span class="quick-progress">${idx}/${subjects.length}</span>`;
    subjectBlock.append(head);

    // Bulk fill. Deliberately fills only BLANK cells: a teacher who has already
    // corrected individual students must never have that silently overwritten
    // by a later tap on the bulk row.
    const bulk = document.createElement('div');
    bulk.className = 'coschol-bulk';
    const bulkLabel = document.createElement('span');
    bulkLabel.className = 'coschol-bulk-label';
    bulkLabel.textContent = 'Fill blanks with';
    bulk.append(bulkLabel);

    const bulkScale = document.createElement('div');
    bulkScale.className = 'mark-scale coschol-scale';
    gradeScale.forEach(g => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mark-button';
      b.textContent = g;
      b.title = gradeLabels[g] || g;
      b.disabled = locked;
      b.addEventListener('click', () => {
        if (locked) return;
        students.forEach(stu => {
          if (!gradeOf(stu.student_id, subject.key)) onGradeChange(stu.student_id, subject.key, g);
        });
        renderSubjectBlock();
        refreshProgress();
      });
      bulkScale.append(b);
    });
    bulk.append(bulkScale);
    subjectBlock.append(bulk);

    const counts = countFor(subject.key);
    const subProgress = document.createElement('div');
    subProgress.className = 'quick-progress coschol-subject-progress';
    subProgress.textContent = `${counts.done} of ${students.length} graded`;
    if (counts.uniform) {
      // The 935-identical-4s fabrication in Class II Science started as an
      // unremarkable default-fill that nobody looked at again. Say it out loud.
      subProgress.textContent += ` — every student is ${counts.uniform}`;
      subProgress.classList.add('coschol-uniform');
    }
    subjectBlock.append(subProgress);

    const list = document.createElement('div');
    list.className = 'quick-student-grid';

    students.forEach(stu => {
      const row = document.createElement('div');
      row.className = 'quick-student-row';

      const nameEl = document.createElement('div');
      nameEl.className = 'quick-student-name';
      nameEl.textContent = stu.full_name;

      const rollEl = document.createElement('div');
      rollEl.className = 'quick-student-roll';
      rollEl.textContent = `Roll ${stu.roll_no || '—'}`;

      const scale = document.createElement('div');
      scale.className = 'mark-scale coschol-scale';
      const current = gradeOf(stu.student_id, subject.key);

      gradeScale.forEach(g => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'mark-button' + (g === current ? ' selected' : '');
        b.textContent = g;
        b.title = gradeLabels[g] || g;
        b.disabled = locked;
        b.addEventListener('click', () => {
          if (locked) return;
          const isSame = b.classList.contains('selected');
          scale.querySelectorAll('.mark-button').forEach(x => x.classList.remove('selected'));
          if (!isSame) b.classList.add('selected');
          onGradeChange(stu.student_id, subject.key, isSame ? '' : g);
          const c = countFor(subject.key);
          subProgress.textContent = `${c.done} of ${students.length} graded`
            + (c.uniform ? ` — every student is ${c.uniform}` : '');
          subProgress.classList.toggle('coschol-uniform', !!c.uniform);
          refreshProgress();
        });
        scale.append(b);
      });

      row.append(nameEl, rollEl, scale);
      list.append(row);
    });

    subjectBlock.append(list);
  }

  // Re-points every <select> at the current grades before the grid is shown.
  // Done wholesale on view switch rather than per keystroke: an earlier version
  // synced only from the per-student tap handler, so anything written by the
  // bulk fill silently showed as blank in the grid. One path, nothing to forget.
  function syncGrid() {
    wrap.querySelectorAll('select.coschol-grade').forEach(sel => {
      sel.value = gradeOf(sel.dataset.student, sel.dataset.subject);
    });
  }

  // ── Grid ────────────────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'review-table-wrap';

  const table = document.createElement('table');
  table.className = 'review-table';

  const thead = document.createElement('thead');
  const hr = document.createElement('tr');
  hr.append(th('Roll'), th('Student'));
  subjects.forEach(s => hr.append(th(s.label)));
  thead.append(hr);
  table.append(thead);

  const tbody = document.createElement('tbody');
  students.forEach(stu => {
    const tr = document.createElement('tr');
    tr.append(td(stu.roll_no || '—'), td(stu.full_name, 'student-cell'));

    subjects.forEach(s => {
      const cell = document.createElement('td');
      const sel = document.createElement('select');
      sel.className = 'text-input coschol-grade';
      sel.dataset.student = stu.student_id;
      sel.dataset.subject = s.key;
      sel.disabled = locked;

      const current = grades?.[stu.student_id]?.[s.key] || '';
      sel.append(opt('', '—', !current));
      gradeScale.forEach(g => {
        const label = gradeLabels[g] ? `${g} — ${gradeLabels[g]}` : g;
        sel.append(opt(g, label, g === current));
      });

      sel.addEventListener('change', e => {
        onGradeChange(stu.student_id, s.key, e.target.value);
        refreshProgress();
      });
      cell.append(sel);
      tr.append(cell);
    });

    tbody.append(tr);
  });
  table.append(tbody);
  wrap.append(table);
  section.append(wrap);

  // ── Progress + save ─────────────────────────────────────────────────────────
  const total = students.length * subjects.length;

  const progress = document.createElement('div');
  progress.className = 'session-count';
  section.append(progress);

  // Recomputed rather than incremented: quick entry, the bulk fill and the grid
  // all write through the same grades object, and a running counter would drift
  // the first time one of them cleared a cell.
  function refreshProgress() {
    let filled = 0;
    students.forEach(stu => subjects.forEach(s => { if (grades?.[stu.student_id]?.[s.key]) filled++; }));
    progress.textContent =
      `${filled} of ${total} grades entered${filled < total ? ` — ${total - filled} still blank` : ''}`;
  }
  refreshProgress();

  // Both views exist in the DOM; mode decides which is shown. Quick entry first
  // — it is the faster path and the only usable one on a phone.
  setMode('quick');

  const actions = document.createElement('div');
  actions.className = 'review-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = locked
    ? 'Locked by admin'
    : (saveStatus === 'saving' ? 'Saving…' : 'Save Co-Scholastic Grades');
  saveBtn.disabled = locked || saveStatus === 'saving';
  saveBtn.addEventListener('click', onSave);
  actions.append(saveBtn);

  if (lastSaved) {
    const stamp = document.createElement('span');
    stamp.className = 'muted';
    stamp.style.cssText = 'margin-left:10px;font-size:0.85rem;color:#666';
    stamp.textContent = `Last saved ${new Date(lastSaved).toLocaleString('en-IN')}`;
    actions.append(stamp);
  }

  section.append(actions);
  return section;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function createField(labelText) {
  const field = document.createElement('label');
  field.className = 'field';
  const span = document.createElement('span');
  span.className = 'field-label';
  span.textContent = labelText;
  field.append(span);
  return field;
}

function opt(value, text, selected = false) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  o.selected = selected;
  return o;
}

function th(text) {
  const el = document.createElement('th');
  el.textContent = text;
  return el;
}

function td(text, className = '') {
  const el = document.createElement('td');
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function msg(text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  return p;
}

function chip(text, active) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'status-chip' + (active ? ' active' : '');
  b.textContent = text;
  return b;
}
