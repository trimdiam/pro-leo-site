import { getSessionsByFilter, SESSION_STATUS } from '../services/session-review-engine.js';

export function createSessionList({
  classes = [],
  subjects = [],
  filters = {},
  onFilterChange = () => {},
  onViewSession = () => {},
  onStatusChange = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel';

  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.textContent = 'Assessments';
  section.append(heading);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  const searchInput = createTextInput('Search...', filters.search || '');
  searchInput.addEventListener('input', e => onFilterChange({ ...filters, search: e.target.value }));

  const classSelect = createSelect('All Classes');
  classSelect.append(createOption('', 'All Classes'));
  classes.forEach(c => classSelect.append(createOption(c, c, filters.class === c)));
  classSelect.addEventListener('change', e => onFilterChange({ ...filters, class: e.target.value }));

  const statusSelect = createSelect('All Statuses');
  statusSelect.append(createOption('', 'All Statuses'));
  Object.values(SESSION_STATUS).forEach(s => statusSelect.append(createOption(s, capitalize(s), filters.status === s)));
  statusSelect.addEventListener('change', e => onFilterChange({ ...filters, status: e.target.value }));

  const subjectSelect = createSelect('All Subjects');
  subjectSelect.append(createOption('', 'All Subjects'));
  subjects.forEach(s => subjectSelect.append(createOption(s.subject_id, s.subject_name, filters.subject_id === s.subject_id)));
  subjectSelect.addEventListener('change', e => onFilterChange({ ...filters, subject_id: e.target.value }));

  filterBar.append(searchInput, classSelect, statusSelect, subjectSelect);
  section.append(filterBar);

  const sessions = getSessionsByFilter(filters);

  const countLabel = document.createElement('div');
  countLabel.className = 'session-count';
  countLabel.textContent = `${sessions.length} week(s) found`;
  section.append(countLabel);

  if (sessions.length === 0) {
    section.append(createMessage('No sessions match the filters.'));
  } else {
    const list = document.createElement('div');
    list.className = 'session-list';

    sessions.forEach(entry => {
      list.append(createSessionRow(entry, onViewSession, onStatusChange));
    });

    section.append(list);
  }

  return section;
}

function createSessionRow(entry, onViewSession, onStatusChange) {
  const sess = entry.session;
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = sess.dueDate && today > sess.dueDate && sess.status !== 'locked';

  const row = document.createElement('div');
  row.className = 'session-row';

  const info = document.createElement('div');
  info.className = 'session-row-info';

  const title = document.createElement('div');
  title.className = 'session-row-title';
  title.textContent = `${sess.subject_name} — ${sess.class}`;

  const meta = document.createElement('div');
  meta.className = 'session-row-meta';
  if (sess.sessionType !== 'legacy' && sess.weekStart) {
    meta.textContent = `Period: ${formatWeekRange(sess.weekStart, sess.weekEnd)} | Due: ${formatDate(sess.dueDate)} | ${sess.teacher_name}`;
  } else {
    meta.textContent = `${sess.teacher_name} • ${formatDate(sess.date)}`;
  }

  info.append(title, meta);

  const badgesDiv = document.createElement('div');
  badgesDiv.className = 'session-badges';

  const badge = document.createElement('span');
  badge.className = `status-badge status-${sess.status}`;
  badge.textContent = capitalize(sess.status);
  badgesDiv.append(badge);

  if (isOverdue) {
    const overdueBadge = document.createElement('span');
    overdueBadge.className = 'status-badge status-overdue';
    overdueBadge.textContent = 'Overdue';
    badgesDiv.append(overdueBadge);
  }

  const actions = document.createElement('div');
  actions.className = 'session-row-actions';

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'btn btn-sm';
  viewBtn.textContent = 'View';
  viewBtn.addEventListener('click', () => onViewSession(sess.session_id));

  actions.append(viewBtn);

  if (sess.status === 'draft') {
    const submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'btn btn-sm btn-primary';
    submitBtn.textContent = 'Submit';
    submitBtn.addEventListener('click', () => onStatusChange(sess.session_id, 'submitted'));
    actions.append(submitBtn);
  }

  if (sess.status === 'submitted') {
    const reviewBtn = document.createElement('button');
    reviewBtn.type = 'button';
    reviewBtn.className = 'btn btn-sm btn-primary';
    reviewBtn.textContent = 'Review';
    reviewBtn.addEventListener('click', () => onStatusChange(sess.session_id, 'reviewed'));
    actions.append(reviewBtn);
  }

  if (sess.status === 'reviewed') {
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'btn btn-sm btn-danger';
    lockBtn.textContent = 'Lock';
    lockBtn.addEventListener('click', () => onStatusChange(sess.session_id, 'locked'));
    actions.append(lockBtn);
  }

  if (sess.status !== 'draft') {
    const reopenBtn = document.createElement('button');
    reopenBtn.type = 'button';
    reopenBtn.className = 'btn btn-sm btn-secondary';
    reopenBtn.textContent = 'Reopen';
    reopenBtn.addEventListener('click', () => onStatusChange(sess.session_id, 'draft'));
    actions.append(reopenBtn);
  }

  row.append(info, badgesDiv, actions);
  return row;
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

function createTextInput(placeholder, value) {
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;
  input.className = 'text-input';
  return input;
}

function createSelect(placeholder) {
  const select = document.createElement('select');
  select.className = 'text-input';
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

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
