const TERM_LABELS = { HY1: 'First Half-Yearly', HY2: 'Second Half-Yearly' };

export function createClassTestEntry({
  classes = [],
  subjects = [],           // subjects available for selectedClass: [{ subject_id, subject_name, max_marks }]
  selectedClass = '',
  selectedSubjectId = '',
  selectedTerm = 'HY1',
  teacherName = '',
  students = [],
  marks = {},
  maxMarks = 30,
  saveStatus = 'idle',
  lastSaved = null,
  onClassChange = () => {},
  onSubjectChange = () => {},
  onTermChange = () => {},
  onTeacherNameChange = () => {},
  onMarkChange = () => {},
  onSave = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel selector-panel';

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = 'Class Test Entry';
  section.append(heading);

  const sub = document.createElement('p');
  sub.className = 'class-test-subtitle';
  sub.textContent = 'One test per subject per Half-Yearly term — contributes 30% to the final blended score (assessment criteria = 70%).';
  section.append(sub);

  const teacherField = createField('Teacher Name');
  const teacherInput = document.createElement('input');
  teacherInput.type = 'text';
  teacherInput.className = 'text-input';
  teacherInput.value = teacherName;
  teacherInput.placeholder = 'e.g. Mr. John';
  teacherInput.addEventListener('input', e => onTeacherNameChange(e.target.value));
  teacherField.append(teacherInput);
  section.append(teacherField);

  const termField = createField('Term');
  const termSelect = document.createElement('select');
  Object.keys(TERM_LABELS).forEach(term => {
    termSelect.append(createOption(term, TERM_LABELS[term], term === selectedTerm));
  });
  termSelect.addEventListener('change', e => onTermChange(e.target.value));
  termField.append(termSelect);
  section.append(termField);

  const classField = createField('Class');
  const classSelect = createSelect('Select class');
  classes.forEach(c => classSelect.append(createOption(c, c, c === selectedClass)));
  classSelect.addEventListener('change', e => onClassChange(e.target.value));
  classField.append(classSelect);
  section.append(classField);

  const subjectField = createField('Subject');
  const subjectSelect = createSelect('Select subject');
  subjectSelect.disabled = subjects.length === 0;
  subjects.forEach(s => {
    subjectSelect.append(createOption(s.subject_id, `${s.subject_name} (out of ${s.max_marks})`, s.subject_id === selectedSubjectId));
  });
  subjectSelect.addEventListener('change', e => {
    onSubjectChange(subjects.find(s => s.subject_id === e.target.value) || null);
  });
  subjectField.append(subjectSelect);
  section.append(subjectField);

  if (selectedClass && subjects.length === 0) {
    section.append(createMessage('No class-test subjects configured for this class.'));
  }

  if (!selectedClass || !selectedSubjectId) {
    section.append(createMessage('Select a class and subject to enter marks.'));
    return section;
  }

  if (!students.length) {
    section.append(createMessage('No students found for this class.'));
    return section;
  }

  const grid = document.createElement('div');
  grid.className = 'quick-student-grid';

  students.forEach(student => {
    const row = document.createElement('div');
    row.className = 'quick-student-row';

    const nameEl = document.createElement('div');
    nameEl.className = 'quick-student-name';
    nameEl.textContent = student.full_name;

    const rollEl = document.createElement('div');
    rollEl.className = 'quick-student-roll';
    rollEl.textContent = `Roll ${student.roll_no || '—'}`;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'text-input';
    input.style.width = '80px';
    input.min = '0';
    input.max = String(maxMarks);
    input.step = '1';
    let lastValid = marks[student.student_id];
    input.value = lastValid === null || lastValid === undefined ? '' : lastValid;
    input.placeholder = `/ ${maxMarks}`;
    input.title = `Whole number, 0–${maxMarks}`;
    input.addEventListener('change', e => {
      const raw = e.target.value;
      if (raw === '') {
        lastValid = null;
        onMarkChange(student.student_id, null);
        return;
      }
      const num = Number(raw);
      if (!Number.isInteger(num) || num < 0 || num > maxMarks) {
        e.target.value = lastValid === null || lastValid === undefined ? '' : lastValid;
        flashInvalid(e.target, maxMarks);
        return;
      }
      lastValid = num;
      onMarkChange(student.student_id, num);
    });

    row.append(nameEl, rollEl, input);
    grid.append(row);
  });

  section.append(grid);

  const filled = Object.values(marks).filter(m => m !== null && m !== undefined).length;
  const progress = document.createElement('p');
  progress.className = 'quick-student-roll';
  progress.textContent = `${filled}/${students.length} entered`;
  section.append(progress);

  const actionArea = document.createElement('div');
  actionArea.className = 'action-area';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = saveStatus === 'saving' ? 'Saving…' : 'Save Class Test';
  saveBtn.addEventListener('click', () => onSave());
  actionArea.append(saveBtn);

  if (lastSaved) {
    const savedNote = document.createElement('span');
    savedNote.className = 'saved-note';
    savedNote.style.marginLeft = '12px';
    savedNote.textContent = `Last saved: ${formatTime(lastSaved)}`;
    actionArea.append(savedNote);
  }

  section.append(actionArea);

  return section;
}

function createField(labelText) {
  const label = document.createElement('label');
  label.className = 'field';
  label.textContent = labelText;
  return label;
}

function createSelect(placeholder) {
  const select = document.createElement('select');
  select.append(createOption('', placeholder));
  return select;
}

function createOption(value, text, selected = false) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  option.selected = selected;
  return option;
}

function createMessage(text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  return p;
}

function flashInvalid(input, maxMarks) {
  input.style.borderColor = '#c0392b';
  input.title = `Enter a whole number between 0 and ${maxMarks}.`;
  setTimeout(() => {
    input.style.borderColor = '';
    input.title = `Whole number, 0–${maxMarks}`;
  }, 1200);
}

function formatTime(dateObj) {
  const d = new Date(dateObj);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
