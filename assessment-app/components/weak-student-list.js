import {
  detectWeakStudents,
  getWeakStudentRules,
  saveWeakStudentRules,
  resetRulesToDefault
} from '../services/weak-student-engine.js';
import { aggregateByMonth, extractYearMonth } from '../services/aggregation-engine.js';
import { getStudentTrend } from '../services/trend-engine.js';
import { classifySeverity, getSeverityPriority, getSeveritySummary } from '../services/severity-engine.js';
import { buildStudentSummary, filterStudents } from '../services/weak-student-summary-engine.js';

export function createWeakStudentList({
  classes = [],
  yearMonth = extractYearMonth(new Date().toISOString()),
  selectedClass = '',
  onClassChange = () => {},
  onYearMonthChange = () => {},
  onViewProfile = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel weak-student-panel';

  section.append(createHeader());
  section.append(createControls(classes, selectedClass, yearMonth, onClassChange, onYearMonthChange));

  const rules = getWeakStudentRules();
  section.append(createRulesPanel(rules));

  const resultsArea = document.createElement('div');
  resultsArea.className = 'weak-results';
  section.append(resultsArea);

  loadResults(resultsArea, yearMonth, selectedClass, onViewProfile);

  return section;
}

function createHeader() {
  const header = document.createElement('div');
  header.className = 'weak-student-header-bar';
  header.innerHTML = `
    <h2 class="section-heading">Student Intelligence</h2>
    <span class="weak-subtitle">Actionable weak student insights</span>
  `;
  return header;
}

function createControls(classes, selectedClass, yearMonth, onClassChange, onYearMonthChange) {
  const controls = document.createElement('div');
  controls.className = 'filter-bar';

  const classSelect = createSelect('All Classes');
  classSelect.append(createOption('', 'All Classes'));
  classes.forEach(c => classSelect.append(createOption(c, c, selectedClass === c)));
  classSelect.addEventListener('change', e => onClassChange(e.target.value));

  const monthInput = document.createElement('input');
  monthInput.type = 'month';
  monthInput.value = yearMonth;
  monthInput.className = 'text-input';
  monthInput.addEventListener('change', e => onYearMonthChange(e.target.value));

  controls.append(classSelect, monthInput);
  return controls;
}

function createRulesPanel(rules) {
  const panel = document.createElement('details');
  panel.className = 'rules-panel';

  const summary = document.createElement('summary');
  summary.textContent = 'Detection Rules';
  panel.append(summary);

  const grid = document.createElement('div');
  grid.className = 'rules-grid';

  Object.entries(rules).forEach(([key, rule]) => {
    const item = document.createElement('label');
    item.className = 'rule-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rule.enabled;
    checkbox.addEventListener('change', e => {
      const updated = getWeakStudentRules();
      updated[key].enabled = e.target.checked;
      saveWeakStudentRules(updated);
    });

    const text = document.createElement('span');
    text.textContent = `${rule.description} (threshold: ${rule.threshold})`;

    item.append(checkbox, text);
    grid.append(item);
  });

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'btn btn-sm btn-secondary';
  resetBtn.textContent = 'Reset to Default';
  resetBtn.addEventListener('click', () => {
    resetRulesToDefault();
    location.reload();
  });

  panel.append(grid, resetBtn);
  return panel;
}

async function loadResults(container, yearMonth, selectedClass, onViewProfile) {
  container.replaceChildren(createLoading());

  try {
    const data = await aggregateByMonth(yearMonth, selectedClass);
    const flagged = detectWeakStudents(data);

    const enhanced = await Promise.all(
      flagged.map(async student => {
        const [trend, summary] = await Promise.all([
          getStudentTrend(student.student_id, selectedClass || '', yearMonth),
          Promise.resolve(buildStudentSummary(student, data.totalAssessments))
        ]);
        return {
          ...student,
          trend,
          ...summary,
          severity: classifySeverity(student.overallPercentage, student.flags)
        };
      })
    );

    enhanced.sort((a, b) => getSeverityPriority(a.severity.level) - getSeverityPriority(b.severity.level));

    renderResults(container, enhanced, data.totalAssessments, onViewProfile);
  } catch (error) {
    console.error(error);
    container.replaceChildren(createMessage('Failed to load data.'));
  }
}

function renderResults(container, flagged, totalAssessments, onViewProfile) {
  container.replaceChildren();

  if (flagged.length === 0) {
    container.append(createMessage('No weak students detected for this period.'));
    return;
  }

  const summary = getSeveritySummary(flagged);
  container.append(createSummaryBar(summary));

  const filterBar = createFilterBar(flagged, (filtered) => {
    list.replaceChildren();
    filtered.forEach(student => list.append(createStudentCard(student, totalAssessments, onViewProfile)));
  });
  container.append(filterBar);

  const list = document.createElement('div');
  list.className = 'weak-student-grid';
  flagged.forEach(student => list.append(createStudentCard(student, totalAssessments, onViewProfile)));
  container.append(list);
}

function createSummaryBar(summary) {
  const bar = document.createElement('div');
  bar.className = 'intelligence-bar';

  const items = [
    { key: 'critical', label: 'Critical', className: 'intel-critical' },
    { key: 'moderate', label: 'Moderate', className: 'intel-moderate' },
    { key: 'caution', label: 'Caution', className: 'intel-caution' },
    { key: 'improving', label: 'Improving', className: 'intel-improving' },
    { key: 'declining', label: 'Declining', className: 'intel-declining' }
  ];

  items.forEach(item => {
    const count = summary[item.key] || 0;
    if (count === 0) return;
    const chip = document.createElement('div');
    chip.className = `intel-chip ${item.className}`;
    chip.innerHTML = `<span class="intel-count">${count}</span><span class="intel-label">${item.label}</span>`;
    bar.append(chip);
  });

  const totalChip = document.createElement('div');
  totalChip.className = 'intel-chip intel-total';
  totalChip.innerHTML = `<span class="intel-count">${summary.total}</span><span class="intel-label">Total Flagged</span>`;
  bar.append(totalChip);

  return bar;
}

function createFilterBar(allStudents, onFilter) {
  const bar = document.createElement('div');
  bar.className = 'search-filter-bar';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'text-input search-input';
  searchInput.placeholder = 'Search by name, ID, or roll...';

  const severityFilter = document.createElement('select');
  severityFilter.className = 'text-input filter-select';
  severityFilter.innerHTML = `
    <option value="">All Severities</option>
    <option value="critical">Critical</option>
    <option value="moderate">Moderate</option>
    <option value="caution">Caution</option>
  `;

  const trendFilter = document.createElement('select');
  trendFilter.className = 'text-input filter-select';
  trendFilter.innerHTML = `
    <option value="">All Trends</option>
    <option value="improving">Improving</option>
    <option value="declining">Declining</option>
    <option value="stable">Stable</option>
  `;

  function applyFilters() {
    const filters = {};
    if (searchInput.value.trim()) filters.search = searchInput.value.trim();
    if (severityFilter.value) filters.severity = [severityFilter.value];
    if (trendFilter.value) filters.trend = [trendFilter.value];
    onFilter(filterStudents(allStudents, filters));
  }

  searchInput.addEventListener('input', applyFilters);
  severityFilter.addEventListener('change', applyFilters);
  trendFilter.addEventListener('change', applyFilters);

  bar.append(searchInput, severityFilter, trendFilter);
  return bar;
}

function createStudentCard(student, totalAssessments, onViewProfile) {
  const card = document.createElement('div');
  card.className = `student-intel-card severity-${student.severity.level}`;
  card.style.borderLeft = `4px solid ${student.severity.borderColor}`;
  card.style.background = student.severity.bgColor;

  const header = document.createElement('div');
  header.className = 'intel-card-header';

  const identity = document.createElement('div');
  identity.className = 'intel-identity';
  identity.innerHTML = `
    <div class="intel-name">${student.full_name || student.student_id}</div>
    <div class="intel-id">${student.student_id}${student.roll_no ? ` • Roll ${student.roll_no}` : ''}</div>
  `;

  const meta = document.createElement('div');
  meta.className = 'intel-meta';

  const trendBadge = document.createElement('span');
  trendBadge.className = `trend-badge trend-${student.trend?.direction || 'stable'}`;
  trendBadge.textContent = getTrendIcon(student.trend?.direction) + ' ' + (student.trend?.label || 'Stable');

  const pctBadge = document.createElement('span');
  pctBadge.className = `pct-badge pct-${student.severity.level}`;
  pctBadge.textContent = `${student.overallPercentage}%`;

  meta.append(trendBadge, pctBadge);
  header.append(identity, meta);

  const severityRow = document.createElement('div');
  severityRow.className = 'severity-row';
  const sevBadge = document.createElement('span');
  sevBadge.className = `severity-badge sev-${student.severity.level}`;
  sevBadge.textContent = student.severity.label;
  severityRow.append(sevBadge);

  if (student.weakSubjects.length > 0) {
    const weakTag = document.createElement('span');
    weakTag.className = 'weak-subjects-tag';
    weakTag.textContent = student.weakSubjects.join(', ');
    severityRow.append(weakTag);
  }

  if (student.missingCount > 0) {
    const missingTag = document.createElement('span');
    missingTag.className = 'missing-tag';
    missingTag.textContent = `${student.missingCount} missing`;
    severityRow.append(missingTag);
  }

  const actions = document.createElement('div');
  actions.className = 'intel-actions';

  const viewBtn = document.createElement('button');
  viewBtn.type = 'button';
  viewBtn.className = 'btn btn-primary btn-sm';
  viewBtn.textContent = 'View Full Profile';
  viewBtn.addEventListener('click', () => onViewProfile(student.student_id));

  actions.append(viewBtn);

  card.append(header, severityRow, actions);
  return card;
}

function getTrendIcon(direction) {
  if (direction === 'improving') return '↗';
  if (direction === 'declining') return '↘';
  return '→';
}

function createSelect(placeholder) {
  const select = document.createElement('select');
  select.className = 'text-input';
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

function createLoading() {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = 'Analyzing student data...';
  return p;
}

function createMessage(text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  return p;
}
