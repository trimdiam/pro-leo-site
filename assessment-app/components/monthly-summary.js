import { getMonthlyInsights, getClassComparisonForMonth } from '../services/monthly-insight-engine.js';
import { getSchoolHealthScore } from '../services/school-health-engine.js';
import { generateNarrativeSummary } from '../services/narrative-summary-engine.js';
import { getTopConcerns } from '../services/concern-engine.js';

export function createMonthlySummary({
  classes = [],
  yearMonth = '',
  className = '',
  aggregatedData,
  onBack = () => {},
  onViewStudentProfile = () => {},
  onViewWeakStudents = () => {},
  onViewAnalytics = () => {},
  onClassChange = () => {},
  onYearMonthChange = () => {}
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
  title.textContent = 'Monthly School Intelligence';
  header.append(backBtn, title);
  section.append(header);

  const contextBar = document.createElement('div');
  contextBar.className = 'analytics-context';
  contextBar.textContent = `${className || 'All Classes'} • ${formatMonth(yearMonth)}`;
  section.append(contextBar);

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar';

  const classSelect = document.createElement('select');
  classSelect.className = 'text-input';
  classSelect.append(createOption('', 'All Classes'));
  classes.forEach(c => classSelect.append(createOption(c, c, c === className)));
  classSelect.addEventListener('change', e => onClassChange(e.target.value));
  filterBar.append(classSelect);

  const monthInput = document.createElement('input');
  monthInput.type = 'month';
  monthInput.value = yearMonth;
  monthInput.className = 'text-input';
  monthInput.addEventListener('change', e => onYearMonthChange(e.target.value));
  filterBar.append(monthInput);

  section.append(filterBar);

  const content = document.createElement('div');
  content.className = 'monthly-content';
  section.append(content);

  loadContent(content, aggregatedData, yearMonth, className, classes, onViewStudentProfile, onViewWeakStudents, onViewAnalytics);

  return section;
}

async function loadContent(container, aggregatedData, yearMonth, className, classes, onViewStudentProfile, onViewWeakStudents, onViewAnalytics) {
  container.replaceChildren(createSkeleton());

  try {
    const [insights, health, concerns, classComparison] = await Promise.all([
      getMonthlyInsights(yearMonth, className),
      getSchoolHealthScore(yearMonth, className),
      getTopConcerns(className, yearMonth),
      getClassComparisonForMonth(yearMonth, classes)
    ]);

    const narrative = generateNarrativeSummary(insights);

    container.replaceChildren();

    container.append(createHealthCard(health));

    const narrativeBlock = document.createElement('div');
    narrativeBlock.className = 'narrative-summary';
    narrativeBlock.textContent = narrative;
    container.append(narrativeBlock);

    const quickActions = document.createElement('div');
    quickActions.className = 'quick-actions';
    [
      { label: 'View Weak Students', onClick: onViewWeakStudents },
      { label: 'Open Analytics', onClick: onViewAnalytics }
    ].forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = a.label;
      btn.addEventListener('click', a.onClick);
      quickActions.append(btn);
    });
    container.append(quickActions);

    if (concerns.length > 0 && concerns[0].level !== 'success') {
      const concernPanel = document.createElement('div');
      concernPanel.className = 'concern-panel';
      const concernHeading = document.createElement('h3');
      concernHeading.className = 'sub-heading';
      concernHeading.textContent = 'Top Concerns';
      concernPanel.append(concernHeading);
      concerns.forEach(c => {
        const item = document.createElement('div');
        item.className = `concern-item concern-${c.level}`;
        item.textContent = c.message;
        concernPanel.append(item);
      });
      container.append(concernPanel);
    }

    if (insights.weakSnapshot.total > 0) {
      const weakPanel = document.createElement('div');
      weakPanel.className = 'weak-snapshot-bar';
      weakPanel.innerHTML = `
        <div class="snap-chip snap-critical"><strong>${insights.weakSnapshot.critical}</strong> Critical</div>
        <div class="snap-chip snap-moderate"><strong>${insights.weakSnapshot.moderate}</strong> Moderate</div>
        <div class="snap-chip snap-improving"><strong>${insights.weakSnapshot.improving}</strong> Improving</div>
        <div class="snap-chip snap-declining"><strong>${insights.weakSnapshot.declining}</strong> Declining</div>
      `;
      container.append(weakPanel);
    }

    if (classComparison.length > 1) {
      const compPanel = document.createElement('div');
      compPanel.className = 'comparison-insight';
      const best = classComparison[0];
      compPanel.textContent = `${best.class} leads with ${best.average}% average across ${best.students} students.`;
      container.append(compPanel);
    }

    if (insights.subjects.length > 0) {
      const subjHeading = document.createElement('h3');
      subjHeading.className = 'sub-heading';
      subjHeading.textContent = 'Subject Rankings';
      container.append(subjHeading);

      const subjGrid = document.createElement('div');
      subjGrid.className = 'subject-rank-grid';
      insights.subjects.forEach(sub => {
        const card = document.createElement('div');
        card.className = 'subject-rank-card';
        card.innerHTML = `
          <div class="rank-number">#${sub.rank}</div>
          <div class="rank-body">
            <div class="rank-name">${sub.subject_name}</div>
            <div class="rank-meta">
              <span class="perf-label ${sub.performance.className}">${sub.performance.label}</span>
              <span class="rank-trend trend-${sub.trend}">${sub.trendLabel}</span>
            </div>
            <div class="rank-score">${sub.averagePercentage}% • ${sub.sessions} session(s)</div>
          </div>
        `;
        subjGrid.append(card);
      });
      container.append(subjGrid);
    }

    if (insights.extremes.highest || insights.extremes.lowest) {
      const extremesHeading = document.createElement('h3');
      extremesHeading.className = 'sub-heading';
      extremesHeading.textContent = 'Performance Extremes';
      container.append(extremesHeading);

      const grid = document.createElement('div');
      grid.className = 'stats-grid';

      if (insights.extremes.highest) {
        grid.append(createExtremeCard('Highest Performer', insights.extremes.highest.full_name, `${insights.extremes.highest.overallPercentage}%`, 'perf-strong'));
      }
      if (insights.extremes.lowest) {
        grid.append(createExtremeCard('Lowest Performer', insights.extremes.lowest.full_name, `${insights.extremes.lowest.overallPercentage}%`, 'perf-critical'));
      }
      if (insights.extremes.improving && insights.extremes.improving.delta > 0) {
        grid.append(createExtremeCard('Fastest Improving', insights.extremes.improving.full_name, insights.extremes.improving.trendLabel, 'trend-improving'));
      }
      if (insights.extremes.declining && insights.extremes.declining.delta < 0) {
        grid.append(createExtremeCard('Fastest Declining', insights.extremes.declining.full_name, insights.extremes.declining.trendLabel, 'trend-declining'));
      }
      container.append(grid);
    }

    if (insights.students.length > 0) {
      const stuHeading = document.createElement('h3');
      stuHeading.className = 'sub-heading';
      stuHeading.textContent = `Student Overview (${insights.students.length})`;
      container.append(stuHeading);

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
      sortSelect.append(createOption('trend', 'Trend'));
      searchBar.append(searchInput, sortSelect);
      container.append(searchBar);

      const tableWrap = document.createElement('div');
      tableWrap.className = 'review-table-wrap';

      const table = document.createElement('table');
      table.className = 'review-table';

      const thead = document.createElement('thead');
      const hRow = document.createElement('tr');
      hRow.append(createTh('Student'));
      hRow.append(createTh('Trend'));
      hRow.append(createTh('Overall'));
      hRow.append(createTh('Status'));
      hRow.append(createTh('Action'));
      thead.append(hRow);
      table.append(thead);

      const tbody = document.createElement('tbody');
      let displayed = insights.students;

      function renderRows() {
        tbody.replaceChildren();
        const term = searchInput.value.toLowerCase();
        const sort = sortSelect.value;
        let filtered = displayed.filter(s => s.full_name.toLowerCase().includes(term) || s.student_id.toLowerCase().includes(term));

        if (sort === 'name') {
          filtered.sort((a, b) => a.full_name.localeCompare(b.full_name));
        } else if (sort === 'trend') {
          filtered.sort((a, b) => b.delta - a.delta);
        } else {
          filtered.sort((a, b) => b.overallPercentage - a.overallPercentage);
        }

        filtered.forEach(s => {
          const tr = document.createElement('tr');

          const nameCell = document.createElement('td');
          nameCell.className = 'student-cell';
          nameCell.innerHTML = `<div class="table-name">${s.full_name}</div><div class="table-id">${s.student_id} • Roll ${s.roll_no || '—'}</div>`;
          tr.append(nameCell);

          const trendCell = document.createElement('td');
          trendCell.innerHTML = `<span class="trend-mini trend-${s.trend}">${s.trendLabel}</span>`;
          tr.append(trendCell);

          const overallCell = document.createElement('td');
          overallCell.className = 'mark-cell';
          overallCell.textContent = `${s.overallPercentage}%`;
          tr.append(overallCell);

          const statusCell = document.createElement('td');
          statusCell.innerHTML = `<span class="perf-label ${s.performance.className}">${s.performance.label}</span>`;
          if (s.isWeak) {
            statusCell.innerHTML += ` <span class="weak-flag">⚠</span>`;
          }
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
      container.append(tableWrap);
    }
  } catch (error) {
    console.error(error);
    container.replaceChildren(createMessage('Failed to load monthly intelligence.'));
  }
}

function createHealthCard(health) {
  const card = document.createElement('div');
  card.className = 'health-score-card';
  card.innerHTML = `
    <div class="health-score-main">
      <div class="health-score-value ${health.statusClass}">${health.score}%</div>
      <div class="health-score-label">School Health Score</div>
      <div class="health-score-status ${health.statusClass}">${health.statusLabel}</div>
    </div>
    <div class="health-breakdown">
      <div class="health-metric"><span>Academic</span><strong>${health.breakdown.academic}%</strong></div>
      <div class="health-metric"><span>Completion</span><strong>${health.breakdown.completion}%</strong></div>
      <div class="health-metric"><span>Student Health</span><strong>${health.breakdown.studentHealth}%</strong></div>
    </div>
  `;
  return card;
}

function createExtremeCard(label, name, value, colorClass) {
  const card = document.createElement('div');
  card.className = 'stat-card enhanced-stat';
  card.innerHTML = `
    <div class="stat-value ${colorClass}">${value}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-subtitle">${name}</div>
  `;
  return card;
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

function formatMonth(yearMonth) {
  if (!yearMonth) return 'All Time';
  const [y, m] = yearMonth.split('-');
  const date = new Date(Number(y), Number(m) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
