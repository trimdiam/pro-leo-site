export function createSessionSetup({
  classes = [],
  subjects = [],
  selectedClass = '',
  selectedSubjectId = '',
  teacherName = '',
  weekStart = getWeekStart(),
  weekEnd = getWeekEnd(),
  dueDate = getWeekEnd(),
  savedSessions = [],
  onClassChange = () => {},
  onSubjectChange = () => {},
  onTeacherNameChange = () => {},
  onWeekStartChange = () => {},
  onWeekEndChange = () => {},
  onDueDateChange = () => {},
  onStartSession = () => {},
  onResumeSession = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel selector-panel';

  const teacherField = createField('Teacher Name');
  const teacherInput = document.createElement('input');
  teacherInput.type = 'text';
  teacherInput.placeholder = 'e.g. Mr. John';
  teacherInput.value = teacherName;
  teacherInput.className = 'text-input';
  teacherInput.addEventListener('input', event => onTeacherNameChange(event.target.value));
  teacherField.append(teacherInput);
  section.append(teacherField);

  const weekStartField = createField('Week Start');
  const weekStartInput = document.createElement('input');
  weekStartInput.type = 'date';
  weekStartInput.value = weekStart;
  weekStartInput.className = 'text-input';
  weekStartInput.addEventListener('change', event => onWeekStartChange(event.target.value));
  weekStartField.append(weekStartInput);
  section.append(weekStartField);

  const weekEndField = createField('Week End');
  const weekEndInput = document.createElement('input');
  weekEndInput.type = 'date';
  weekEndInput.value = weekEnd;
  weekEndInput.className = 'text-input';
  weekEndInput.addEventListener('change', event => onWeekEndChange(event.target.value));
  weekEndField.append(weekEndInput);
  section.append(weekEndField);

  const dueDateField = createField('Due Date');
  const dueDateInput = document.createElement('input');
  dueDateInput.type = 'date';
  dueDateInput.value = dueDate;
  dueDateInput.className = 'text-input';
  dueDateInput.addEventListener('change', event => onDueDateChange(event.target.value));
  dueDateField.append(dueDateInput);
  section.append(dueDateField);

  const classField = createField('Class');
  const classSelect = createSelect('Select class');
  classes.forEach(className => {
    classSelect.append(createOption(className, className, className === selectedClass));
  });
  classSelect.addEventListener('change', event => onClassChange(event.target.value));
  classField.append(classSelect);
  section.append(classField);

  const subjectField = createField('Subject');
  const subjectSelect = createSelect('Select subject');
  subjectSelect.disabled = subjects.length === 0;
  subjects.forEach(subject => {
    subjectSelect.append(createOption(subject.subject_id, subject.subject_name, subject.subject_id === selectedSubjectId));
  });
  subjectSelect.addEventListener('change', event => {
    onSubjectChange(subjects.find(s => s.subject_id === event.target.value) || null);
  });
  subjectField.append(subjectSelect);
  section.append(subjectField);

  if (selectedClass && subjects.length === 0) {
    section.append(createMessage('No subjects found for this class'));
  }

  const actionArea = document.createElement('div');
  actionArea.className = 'action-area';

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'btn btn-primary';
  startBtn.textContent = 'Start New Weekly Assessment Entry';
  startBtn.addEventListener('click', () => onStartSession());
  actionArea.append(startBtn);
  section.append(actionArea);

  const draftSection = createDraftSessions(savedSessions, onResumeSession);
  if (draftSection) {
    section.append(draftSection);
  }

  return section;
}

function createDraftSessions(savedSessions, onResumeSession) {
  const drafts = savedSessions.filter(entry => entry.session.status === 'draft');
  if (drafts.length === 0) return null;

  const container = document.createElement('div');
  container.className = 'draft-section';

  const heading = document.createElement('h3');
  heading.className = 'draft-heading';
  heading.textContent = 'Unfinished Weeks';
  container.append(heading);

  const list = document.createElement('div');
  list.className = 'draft-list';

  drafts.forEach(entry => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'draft-item';
    const sess = entry.session;
    const weekInfo = sess.sessionType !== 'legacy' && sess.weekStart
      ? `Week: ${formatWeekRange(sess.weekStart, sess.weekEnd)} | Due: ${formatDate(sess.dueDate)}`
      : formatDate(sess.date);
    item.innerHTML = `
      <span class="draft-info">${sess.subject_name} — ${sess.class} — ${weekInfo}</span>
      <span class="draft-meta">${sess.teacher_name} | Status: Draft</span>
    `;
    item.addEventListener('click', () => onResumeSession(sess.session_id));
    list.append(item);
  });

  container.append(list);
  return container;
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
  const message = document.createElement('p');
  message.className = 'empty-state';
  message.textContent = text;
  return message;
}

function formatWeekRange(weekStart, weekEnd) {
  if (!weekStart || !weekEnd) return '';
  const start = new Date(weekStart + 'T00:00:00');
  const end = new Date(weekEnd + 'T00:00:00');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = months[start.getMonth()];
  const endMonth = months[end.getMonth()];
  if (startMonth === endMonth) {
    return `${startDay}–${endDay} ${endMonth}`;
  }
  return `${startDay} ${startMonth}–${endDay} ${endMonth}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

function getWeekEnd() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}
