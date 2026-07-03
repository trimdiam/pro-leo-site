import { aggregateByTerm } from '../services/aggregation-engine.js';
import { classifyPerformance } from '../services/comparison-engine.js';
import { mapScoreToGrade } from '../services/report-card-grade-engine.js';

const OTHER_TERM = { HY1: 'HY2', HY2: 'HY1' };
const TERM_LABELS = { HY1: 'First Half-Yearly', HY2: 'Second Half-Yearly' };

export function createTermSummary({
  classes = [],
  term = 'HY1',
  className = '',
  onBack = () => {},
  onClassChange = () => {},
  onTermChange = () => {},
  onViewStudentProfile = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel monthly-summary-panel';

  const header = document.createElement('div');
  header.className = 'review-header';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-secondary';
  backBtn.textContent = '← Return to Dashboard';
  backBtn.addEventListener('click', onBack);

  const title = document.createElement('h2');
  title.className = 'section-heading';
  title.textContent = 'Half-Yearly Term Summary';
  header.append(backBtn, title);
  section.append(header);

  const contextBar = document.createElement('div');
  contextBar.className = 'analytics-context';
  contextBar.textContent = `${className || 'All Classes'} • ${TERM_LABELS[term] || term}`;
  section.append(contextBar);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  const classSelect = document.createElement('select');
  classSelect.className = 'text-input';
  classSelect.append(createOption('', 'All Classes'));
  classes.forEach(c => classSelect.append(createOption(c, c, c === className)));
  classSelect.addEventListener('change', e => onClassChange(e.target.value));
  filterBar.append(classSelect);

  const termSelect = document.createElement('select');
  termSelect.className = 'text-input';
  termSelect.append(createOption('HY1', 'First Half-Yearly', term === 'HY1'));
  termSelect.append(createOption('HY2', 'Second Half-Yearly', term === 'HY2'));
  termSelect.addEventListener('change', e => onTermChange(e.target.value));
  filterBar.append(termSelect);

  section.append(filterBar);

  const content = document.createElement('div');
  content.className = 'monthly-content';
  section.append(content);

  loadContent(content, term, className, classes, onViewStudentProfile);

  return section;
}

async function loadContent(container, term, className, classes, onViewStudentProfile) {
  container.replaceChildren(createSkeleton());

  try {
    const [current, previous] = await Promise.all([
      aggregateByTerm(term, className),
      aggregateByTerm(OTHER_TERM[term], className)
    ]);

    const classComparison = className ? [] : await getClassComparisonForTerm(term, classes);

    container.replaceChildren();

    if (current.students.length === 0) {
      container.append(createMessage(`No finalized assessments found for ${TERM_LABELS[term] || term}${className ? ` — ${className}` : ''}.`));
      return;
    }

    container.append(createStatsRow(current));

    if (classComparison.length > 1) {
      const compPanel = document.createElement('div');
      compPanel.className = 'comparison-insight';
      const best = classComparison[0];
      compPanel.textContent = `${best.class} leads with ${best.average}% average across ${best.students} students.`;
      container.append(compPanel);
    }

    if (current.subjects.length > 0) {
      const subjHeading = document.createElement('h3');
      subjHeading.className = 'sub-heading';
      subjHeading.textContent = 'Subject Rankings';
      container.append(subjHeading);

      const ranked = [...current.subjects].sort((a, b) => b.averagePercentage - a.averagePercentage);
      const subjGrid = document.createElement('div');
      subjGrid.className = 'subject-rank-grid';
      ranked.forEach((sub, idx) => {
        subjGrid.append(createSubjectCard(sub, idx + 1, previous));
      });
      container.append(subjGrid);
    }

    container.append(createStudentTable(current, onViewStudentProfile));
  } catch (error) {
    console.error(error);
    container.replaceChildren(createMessage('Failed to load term summary.'));
  }
}

async function getClassComparisonForTerm(term, allClasses) {
  const results = [];
  for (const cls of allClasses) {
    const agg = await aggregateByTerm(term, cls);
    if (agg.students.length > 0) {
      results.push({ class: cls, average: agg.classAverage, students: agg.students.length, assessments: agg.totalAssessments });
    }
  }
  results.sort((a, b) => b.average - a.average);
  return results;
}

function createStatsRow(current) {
  const grid = document.createElement('div');
  grid.className = 'stats-grid';
  grid.append(createStatCard('Class Average', `${current.classAverage}%`, classifyPerformance(current.classAverage).className));
  grid.append(createStatCard('Students', String(current.students.length), ''));
  grid.append(createStatCard('Assessments Included', String(current.totalAssessments), ''));
  return grid;
}

function createStatCard(label, value, colorClass) {
  const card = document.createElement('div');
  card.className = 'stat-card enhanced-stat';
  card.innerHTML = `
    <div class="stat-value ${colorClass}">${value}</div>
    <div class="stat-label">${label}</div>
  `;
  return card;
}

function createSubjectCard(sub, rank, previous) {
  const prevSub = previous?.subjects?.find(p => p.subject_id === sub.subject_id);
  const delta = prevSub ? sub.averagePercentage - prevSub.averagePercentage : null;
  const trend = delta === null ? null : delta >= 3 ? 'improving' : delta <= -3 ? 'declining' : 'stable';
  const trendLabel = delta === null ? 'No prior term data' : delta >= 3 ? `↑ +${delta}%` : delta <= -3 ? `↓ ${delta}%` : '→ Stable';
  const perf = classifyPerformance(sub.averagePercentage);
  const grade = typeof sub.averageScore === 'number' ? mapScoreToGrade(sub.averageScore) : null;

  const card = document.createElement('div');
  card.className = 'subject-rank-card';
  card.innerHTML = `
    <div class="rank-number">#${rank}</div>
    <div class="rank-body">
      <div class="rank-name">${sub.subject_name}</div>
      <div class="rank-meta">
        <span class="perf-label ${perf.className}">${perf.label}</span>
        ${trend ? `<span class="rank-trend trend-${trend}">${trendLabel}</span>` : `<span class="rank-trend">${trendLabel}</span>`}
      </div>
      <div class="rank-score">${sub.averagePercentage}% ${grade ? `• ${grade.word} (${sub.averageScore}/5)` : ''} • ${sub.sessions} session(s)</div>
    </div>
  `;
  return card;
}

function createStudentTable(current, onViewStudentProfile) {
  const wrap = document.createElement('div');

  const heading = document.createElement('h3');
  heading.className = 'sub-heading';
  heading.textContent = `Student Overview (${current.students.length})`;
  wrap.append(heading);

  const searchBar = document.createElement('div');
  searchBar.className = 'search-filter-bar';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'text-input search-input';
  searchInput.placeholder = 'Search by name...';
  const sortSelect = document.createElement('select');
  sortSelect.className = 'text-input filter-select';
  sortSelect.append(createOption('score', 'Score'));
  sortSelect.append(createOption('name', 'Name'));
  searchBar.append(searchInput, sortSelect);
  wrap.append(searchBar);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'review-table-wrap';

  const table = document.createElement('table');
  table.className = 'review-table';

  const thead = document.createElement('thead');
  const hRow = document.createElement('tr');
  hRow.append(createTh('Student'), createTh('Term Average'), createTh('Status'), createTh('Action'));
  thead.append(hRow);
  table.append(thead);

  const tbody = document.createElement('tbody');

  function renderRows() {
    tbody.replaceChildren();
    const q = searchInput.value.toLowerCase();
    const sort = sortSelect.value;
    let filtered = current.students.filter(s => s.full_name.toLowerCase().includes(q) || s.student_id.toLowerCase().includes(q));

    filtered = sort === 'name'
      ? [...filtered].sort((a, b) => a.full_name.localeCompare(b.full_name))
      : [...filtered].sort((a, b) => b.overallPercentage - a.overallPercentage);

    filtered.forEach(s => {
      const tr = document.createElement('tr');
      const perf = classifyPerformance(s.overallPercentage);

      const nameCell = document.createElement('td');
      nameCell.className = 'student-cell';
      nameCell.innerHTML = `<div class="table-name">${s.full_name}</div><div class="table-id">${s.student_id} • Roll ${s.roll_no || '—'}</div>`;
      tr.append(nameCell);

      const scoreCell = document.createElement('td');
      scoreCell.className = 'mark-cell';
      scoreCell.textContent = `${s.overallPercentage}%`;
      tr.append(scoreCell);

      const statusCell = document.createElement('td');
      statusCell.innerHTML = `<span class="perf-label ${perf.className}">${perf.label}</span>`;
      tr.append(statusCell);

      const actionCell = document.createElement('td');
      const profileBtn = document.createElement('button');
      profileBtn.type = 'button';
      profileBtn.className = 'btn btn-sm btn-secondary';
      profileBtn.textContent = 'Profile';
      profileBtn.addEventListener('click', () => onViewStudentProfile(s.student_id));
      actionCell.append(profileBtn);
      tr.append(actionCell);

      tbody.append(tr);
    });
  }

  searchInput.addEventListener('input', renderRows);
  sortSelect.addEventListener('change', renderRows);
  renderRows();

  table.append(tbody);
  tableWrap.append(table);
  wrap.append(tableWrap);
  return wrap;
}

function createSkeleton() {
  const wrap = document.createElement('div');
  wrap.className = 'skeleton-wrap';
  for (let i = 0; i < 4; i++) {
    const block = document.createElement('div');
    block.className = 'skeleton-block';
    wrap.append(block);
  }
  return wrap;
}

function createOption(value, text, selected = false) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  option.selected = selected;
  return option;
}

function createTh(text) {
  const th = document.createElement('th');
  th.textContent = text;
  return th;
}

function createMessage(text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  return p;
}
