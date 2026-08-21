// ── Play Group Narrative Entry ────────────────────────────────────────────────
// The written half of a Play Group report card: a Growth Observation grid (each
// configured observation area answered for start-of-year / half-yearly / term
// end) plus one overall remark per term.
//
// Worked one student at a time, not as a class grid. Six children x five areas
// x three columns is ninety textareas — a single grid of that is unreadable on
// a phone and invites writing into the wrong row. The student strip along the
// top doubles as a progress indicator so the teacher can see at a glance who
// still has nothing written.
//
// Like coscholastic-entry.js this deliberately does NOT re-render on input:
// onNarrativeChange updates the parent's state object only, so the caret,
// scroll position and selected student all survive typing.

import {
  GROWTH_COLUMNS,
  REMARK_TERMS,
  ATTENDANCE_TERMS,
  attendancePercent
} from '../services/playgroup-narrative-service.js';

export function createPlaygroupNarrativeEntry({
  classes = [],
  selectedClass = '',
  students = [],
  prompts = [],
  narratives = {},          // { [studentId]: { growth: {...}, remarks: {...} } }
  selectedStudentId = '',
  locked = false,
  saveStatus = 'idle',
  lastSaved = null,
  onClassChange = () => {},
  onStudentChange = () => {},
  onNarrativeChange = () => {},   // (studentId, kind, key, col, value)
  onWorkingDaysChange = () => {}, // (termKey, value) — applies to the whole class
  onSave = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel selector-panel pg-narrative-panel';

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = 'Play Group — Observations & Remarks';
  section.append(heading);

  const sub = document.createElement('p');
  sub.className = 'class-test-subtitle';
  sub.textContent =
    'Written in the teacher\'s own words and printed on the report card as-is. ' +
    'Grades are entered separately under Co-Scholastic Grades.';
  section.append(sub);

  // ── Class ───────────────────────────────────────────────────────────────────
  const classField = createField('Class');
  const classSelect = document.createElement('select');
  classSelect.className = 'text-input';
  classSelect.append(opt('', '— Select class —', !selectedClass));
  classes.forEach(c => classSelect.append(opt(c, c, c === selectedClass)));
  classSelect.addEventListener('change', e => onClassChange(e.target.value));
  classField.append(classSelect);
  section.append(classField);

  if (!selectedClass) {
    section.append(msg('Select a class to begin.'));
    return section;
  }
  if (!prompts.length) {
    section.append(msg(
      'No observation areas are configured for this class. ' +
      'Only Play Group uses this screen.'
    ));
    return section;
  }
  if (!students.length) {
    section.append(msg('No students found for this class.'));
    return section;
  }

  if (locked) {
    const banner = document.createElement('p');
    banner.className = 'locked-banner';
    banner.textContent =
      'Locked by admin — these observations are final and can no longer be edited. ' +
      'Contact an admin if something needs to change.';
    section.append(banner);
  }

  // ── Student strip ───────────────────────────────────────────────────────────
  // Doubles as a progress indicator: a filled dot means something is written for
  // that child, so an unfinished class is visible without opening each one.
  const active = selectedStudentId || students[0]?.studentId || '';

  const stripLabel = document.createElement('p');
  stripLabel.className = 'field-label';
  stripLabel.textContent = 'Student';
  section.append(stripLabel);

  const strip = document.createElement('div');
  strip.className = 'status-chips pg-student-strip';
  students.forEach(stu => {
    const id = stu.studentId;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'status-chip' + (id === active ? ' active' : '');
    b.dataset.studentId = id;
    b.textContent = `${hasContent(narratives[id]) ? '●' : '○'} ${shortName(stu.name)}`;
    b.title = stu.name;
    b.addEventListener('click', () => onStudentChange(id));
    strip.append(b);
  });
  section.append(strip);

  const student = students.find(s => s.studentId === active) || students[0];
  const rec = narratives[student.studentId] || {};

  const who = document.createElement('p');
  who.className = 'pg-current-student';
  who.textContent = `Roll ${student.rollNo ?? '—'} · ${student.name}`;
  section.append(who);

  // ── Growth Observation ──────────────────────────────────────────────────────
  const growthHead = document.createElement('h3');
  growthHead.className = 'section-subheading';
  growthHead.textContent = 'Growth Observation';
  section.append(growthHead);

  const growthNote = document.createElement('p');
  growthNote.className = 'class-test-subtitle';
  growthNote.textContent =
    'Five rows, each read across the three columns. What each row is about is up ' +
    'to you — the "Observation 1…5" headings are only there to tell them apart ' +
    'and are not printed. Only what you write appears on the card, so leave any ' +
    'column blank until you have observed it.';
  section.append(growthNote);

  prompts.forEach((p, i) => {
    const block = document.createElement('div');
    block.className = 'pg-prompt-block';

    // A blank prompt is the normal case — the teacher decides what each row is
    // about. Number it so she can tell the five rows apart while typing; this
    // heading is never printed. A configured prompt, if one is ever added,
    // shows instead.
    const promptLabel = document.createElement('div');
    const text = String(p.prompt || '').trim();
    promptLabel.className = 'pg-prompt-label' + (text ? '' : ' pg-prompt-label-blank');
    promptLabel.textContent = text || `Observation ${i + 1}`;
    block.append(promptLabel);

    const cols = document.createElement('div');
    cols.className = 'pg-prompt-cols';

    GROWTH_COLUMNS.forEach(col => {
      const wrap = document.createElement('label');
      wrap.className = 'pg-col';

      const lab = document.createElement('span');
      lab.className = 'pg-col-label';
      lab.textContent = col.label;
      wrap.append(lab);

      const ta = document.createElement('textarea');
      ta.className = 'text-input pg-textarea';
      ta.rows = 3;
      ta.value = rec.growth?.[p.key]?.[col.key] || '';
      ta.disabled = locked;
      ta.placeholder = locked ? '' : 'Not yet written';
      ta.addEventListener('input', e => {
        onNarrativeChange(student.studentId, 'growth', p.key, col.key, e.target.value);
        markDirty(strip, student.studentId);
      });
      wrap.append(ta);
      cols.append(wrap);
    });

    block.append(cols);
    section.append(block);
  });

  // ── Attendance ──────────────────────────────────────────────────────────────
  // Typed in by hand, like Class III-X. Working Days is one value for the whole
  // class; Days Present is per child. Editing Working Days here rewrites it for
  // every student in the class, which is why it is labelled as such — a teacher
  // who thought it applied only to the child on screen would be wrong in a way
  // that quietly corrupts five other cards.
  const attHead = document.createElement('h3');
  attHead.className = 'section-subheading';
  attHead.textContent = 'Attendance';
  section.append(attHead);

  const attNote = document.createElement('p');
  attNote.className = 'class-test-subtitle';
  attNote.textContent =
    'Entered by hand for Play Group. Working Days is shared by the whole class; ' +
    'Days Present is for the child shown above.';
  section.append(attNote);

  const attWrap = document.createElement('div');
  attWrap.className = 'pg-att-grid';

  ATTENDANCE_TERMS.forEach(t => {
    const card = document.createElement('div');
    card.className = 'pg-att-card';

    const title = document.createElement('div');
    title.className = 'pg-att-title';
    title.textContent = t.label;
    card.append(title);

    const row = document.createElement('div');
    row.className = 'pg-att-row';

    // Days present — per student
    const presWrap = document.createElement('label');
    presWrap.className = 'pg-att-field';
    const presLab = document.createElement('span');
    presLab.className = 'pg-col-label';
    presLab.textContent = 'Days Present';
    presWrap.append(presLab);
    const presInput = numberInput(rec.attendance?.[t.presentKey], locked);
    presWrap.append(presInput);
    row.append(presWrap);

    // Working days — class-wide
    const totWrap = document.createElement('label');
    totWrap.className = 'pg-att-field';
    const totLab = document.createElement('span');
    totLab.className = 'pg-col-label';
    totLab.textContent = 'Working Days (class)';
    totWrap.append(totLab);
    const totInput = numberInput(rec.attendance?.[t.totalKey], locked);
    totWrap.append(totInput);
    row.append(totWrap);

    const pct = document.createElement('div');
    pct.className = 'pg-att-pct';
    card.append(row, pct);
    attWrap.append(card);

    const refresh = () => {
      const p = attendancePercent(presInput.value, totInput.value);
      if (p === null) {
        pct.textContent = '—';
        pct.classList.remove('low', 'ok');
        return;
      }
      pct.textContent = p + '%';
      pct.classList.toggle('low', p < 75);
      pct.classList.toggle('ok', p >= 75);
    };
    refresh();

    presInput.addEventListener('input', e => {
      onNarrativeChange(student.studentId, 'attendance', t.presentKey, null, e.target.value);
      markDirty(strip, student.studentId);
      refresh();
    });
    totInput.addEventListener('input', e => {
      onWorkingDaysChange(t.totalKey, e.target.value);
      markDirty(strip, student.studentId);
      refresh();
    });
  });

  section.append(attWrap);

  // ── Remarks ─────────────────────────────────────────────────────────────────
  const remarkHead = document.createElement('h3');
  remarkHead.className = 'section-subheading';
  remarkHead.textContent = 'Overall Remark';
  section.append(remarkHead);

  const remarkNote = document.createElement('p');
  remarkNote.className = 'class-test-subtitle';
  remarkNote.textContent =
    'One short paragraph per term, printed under that term\'s grades. ' +
    'The Final Term remark is also where the promotion line goes.';
  section.append(remarkNote);

  REMARK_TERMS.forEach(t => {
    const wrap = document.createElement('label');
    wrap.className = 'pg-col pg-remark';

    const lab = document.createElement('span');
    lab.className = 'pg-col-label';
    lab.textContent = t.label;
    wrap.append(lab);

    const ta = document.createElement('textarea');
    ta.className = 'text-input pg-textarea';
    ta.rows = 4;
    ta.value = rec.remarks?.[t.key] || '';
    ta.disabled = locked;
    ta.placeholder = locked
      ? ''
      : (t.key === 'HY2' ? 'e.g. Promoted to Class — SKG' : 'Not yet written');
    ta.addEventListener('input', e => {
      onNarrativeChange(student.studentId, 'remarks', t.key, null, e.target.value);
      markDirty(strip, student.studentId);
    });
    wrap.append(ta);
    section.append(wrap);
  });

  // ── Save ────────────────────────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'review-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = locked
    ? 'Locked by admin'
    : (saveStatus === 'saving' ? 'Saving…' : 'Save Observations & Remarks');
  saveBtn.disabled = locked || saveStatus === 'saving';
  saveBtn.addEventListener('click', onSave);
  actions.append(saveBtn);

  // Saving writes the whole class in one document, so this is not a per-student
  // action — say so, or a teacher who edits three children and saves once will
  // reasonably wonder whether the other two were kept.
  const scope = document.createElement('span');
  scope.className = 'muted';
  scope.style.cssText = 'margin-left:10px;font-size:0.85rem;color:#666';
  scope.textContent = 'Saves every student in this class, not just the one shown.';
  actions.append(scope);

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function numberInput(value, disabled) {
  const el = document.createElement('input');
  el.type = 'number';
  el.min = '0';
  el.className = 'text-input pg-att-input';
  // `?? ''` not `|| ''`: a stored 0 is a real value and must render as 0.
  el.value = value ?? '';
  el.disabled = disabled;
  el.placeholder = '—';
  return el;
}

function hasContent(rec) {
  if (!rec) return false;
  const g = Object.values(rec.growth || {}).some(cell =>
    GROWTH_COLUMNS.some(({ key }) => String(cell?.[key] || '').trim())
  );
  const r = REMARK_TERMS.some(({ key }) => String(rec.remarks?.[key] || '').trim());
  const a = ATTENDANCE_TERMS.some(({ presentKey, totalKey }) =>
    rec.attendance?.[presentKey] != null || rec.attendance?.[totalKey] != null
  );
  return g || r || a;
}

/**
 * Flip the current student's dot to filled as soon as they type, without a
 * re-render. Without this the strip keeps claiming the child is empty until the
 * screen is rebuilt, which reads as "my typing is not registering".
 */
function markDirty(strip, studentId) {
  const chip = strip.querySelector(`[data-student-id="${CSS.escape(studentId)}"]`);
  if (chip && chip.textContent.startsWith('○')) {
    chip.textContent = '●' + chip.textContent.slice(1);
  }
}

/**
 * Given name plus a surname initial — the strip has six chips to fit on a phone.
 *
 * Takes leading tokens until there is enough to identify the child, rather than
 * just the first one: 'NA I BANKYNTIEW KHARKONGOR' (a hyphenated Khasi given
 * name stored with spaces) would otherwise render as 'NA K.', which reads as
 * "not available" rather than a name.
 */
function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  if (parts.length === 1) return parts[0];

  const surname = parts[parts.length - 1];
  const given = parts.slice(0, -1);
  let taken = [given[0]];
  for (let i = 1; i < given.length && taken.join(' ').length < 6; i++) {
    taken.push(given[i]);
  }
  return `${taken.join(' ')} ${surname[0]}.`;
}

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

function msg(text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  return p;
}
