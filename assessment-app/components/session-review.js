import { calculateStudentTotal } from '../services/totals-engine.js';

export function createSessionReview({
  sessionData,
  onBack = () => {},
  onLock = () => {},
  onReopen = () => {}
} = {}) {
  const { session, marks, students, criteria } = sessionData;

  const section = document.createElement('section');
  section.className = 'panel';

  const header = document.createElement('div');
  header.className = 'review-header';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-secondary';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', onBack);

  const title = document.createElement('h2');
  title.className = 'section-heading';
  title.textContent = 'Session Review';

  header.append(backBtn, title);
  section.append(header);

  const infoCard = document.createElement('div');
  infoCard.className = 'review-info';
  infoCard.innerHTML = `
    <div><strong>Teacher:</strong> ${session.teacher_name}</div>
    <div><strong>Class:</strong> ${session.class}</div>
    <div><strong>Subject:</strong> ${session.subject_name}</div>
    <div><strong>Date:</strong> ${formatDate(session.date)}</div>
    <div><strong>Status:</strong> <span class="status-badge status-${session.status}">${capitalize(session.status)}</span></div>
  `;
  section.append(infoCard);

  const actions = document.createElement('div');
  actions.className = 'review-actions';

  if (session.status !== 'locked') {
    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'btn btn-danger';
    lockBtn.textContent = 'Lock Session';
    lockBtn.addEventListener('click', onLock);
    actions.append(lockBtn);
  }

  if (session.status === 'locked') {
    const reopenBtn = document.createElement('button');
    reopenBtn.type = 'button';
    reopenBtn.className = 'btn btn-secondary';
    reopenBtn.textContent = 'Reopen Session';
    reopenBtn.addEventListener('click', onReopen);
    actions.append(reopenBtn);
  }

  section.append(actions);

  if (session.status === 'locked') {
    const warning = document.createElement('div');
    warning.className = 'locked-banner';
    warning.textContent = 'This session is locked. No further edits are allowed.';
    section.append(warning);
  }

  const tableContainer = document.createElement('div');
  tableContainer.className = 'review-table-wrap';

  const table = document.createElement('table');
  table.className = 'review-table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.append(createTh('Student'));
  headerRow.append(createTh('Roll No'));
  criteria.forEach(c => headerRow.append(createTh(c.criterion_name)));
  headerRow.append(createTh('Total'));
  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement('tbody');
  students.forEach(student => {
    const studentMarks = marks[student.student_id] || {};
    const { total, max } = calculateStudentTotal(studentMarks, criteria);

    const tr = document.createElement('tr');
    tr.append(createTd(student.full_name, 'student-cell'));
    tr.append(createTd(student.roll_no || '—'));

    criteria.forEach(c => {
      const mark = studentMarks[c.criterion_id];
      tr.append(createTd(mark !== null && mark !== undefined ? mark : '—', 'mark-cell'));
    });

    tr.append(createTd(`${total} / ${max}`, 'total-cell'));
    tbody.append(tr);
  });

  table.append(tbody);
  tableContainer.append(table);
  section.append(tableContainer);

  return section;
}

function createTh(text) {
  const th = document.createElement('th');
  th.textContent = text;
  return th;
}

function createTd(text, className = '') {
  const td = document.createElement('td');
  td.textContent = text;
  if (className) td.className = className;
  return td;
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
