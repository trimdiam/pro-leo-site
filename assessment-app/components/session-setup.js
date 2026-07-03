export function createSessionSetup({
  classes = [],
  subjects = [],
  selectedClass = '',
  selectedSubjectId = '',
  teacherName = '',
  periodMonth = getCurrentPeriodMonth(),
  periodNumber = getCurrentPeriodNumber(),
  weekStart = '',
  weekEnd = '',
  dueDate = '',
  savedSessions = [],
  onClassChange = () => {},
  onSubjectChange = () => {},
  onTeacherNameChange = () => {},
  onPeriodMonthChange = () => {},
  onPeriodNumberChange = () => {},
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

  // Bi-weekly cadence: 2 assessments/month, not weekly. Month + Period pick
  // the range; the actual computed dates (weekStart/weekEnd/dueDate) are
  // shown read-only below so the teacher knows exactly what they're entering.
  const monthField = createField('Month');
  const monthInput = document.createElement('input');
  monthInput.type = 'month';
  monthInput.value = periodMonth;
  monthInput.className = 'text-input';
  monthInput.addEventListener('change', event => onPeriodMonthChange(event.target.value));
  monthField.append(monthInput);
  section.append(monthField);

  const periodField = createField('Assessment Period');
  const periodSelect = document.createElement('select');
  periodSelect.append(createOption('1', 'Period 1 (1st–15th)', periodNumber === 1));
  periodSelect.append(createOption('2', 'Period 2 (16th–end of month)', periodNumber === 2));
  periodSelect.addEventListener('change', event => onPeriodNumberChange(event.target.value));
  periodField.append(periodSelect);
  section.append(periodField);

  if (weekStart && weekEnd) {
    const rangePreview = document.createElement('p');
    rangePreview.className = 'empty-state';
    rangePreview.textContent = `Covers: ${formatWeekRange(weekStart, weekEnd)} · Due: ${formatDate(dueDate)}`;
    section.append(rangePreview);
  }

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
  startBtn.textContent = 'Start New Assessment Entry';
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
  heading.textContent = 'Unfinished Periods';
  container.append(heading);

  const list = document.createElement('div');
  list.className = 'draft-list';

  drafts.forEach(entry => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'draft-item';
    const sess = entry.session;
    const weekInfo = sess.sessionType !== 'legacy' && sess.weekStart
      ? `Period: ${formatWeekRange(sess.weekStart, sess.weekEnd)} | Due: ${formatDate(sess.dueDate)}`
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

function getCurrentPeriodMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentPeriodNumber() {
  return new Date().getDate() <= 15 ? 1 : 2;
}
