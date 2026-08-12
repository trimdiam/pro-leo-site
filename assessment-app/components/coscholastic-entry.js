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

      const current = grades?.[stu.student_id]?.[s.key] || '';
      sel.append(opt('', '—', !current));
      gradeScale.forEach(g => {
        const label = gradeLabels[g] ? `${g} — ${gradeLabels[g]}` : g;
        sel.append(opt(g, label, g === current));
      });

      sel.addEventListener('change', e =>
        onGradeChange(stu.student_id, s.key, e.target.value));
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
  let filled = 0;
  students.forEach(stu => subjects.forEach(s => { if (grades?.[stu.student_id]?.[s.key]) filled++; }));

  const progress = document.createElement('div');
  progress.className = 'session-count';
  progress.textContent = `${filled} of ${total} grades entered${filled < total ? ` — ${total - filled} still blank` : ''}`;
  section.append(progress);

  const actions = document.createElement('div');
  actions.className = 'review-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = saveStatus === 'saving' ? 'Saving…' : 'Save Co-Scholastic Grades';
  saveBtn.disabled = saveStatus === 'saving';
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
