import { getStudentProfile } from '../services/student-profile-engine.js';
import { toLineChartData, toBarChartData } from '../services/graph-data-engine.js';

export function createStudentProfile({
  studentId,
  className,
  onBack = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel';

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'btn btn-secondary btn-sm';
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', onBack);
  section.append(backBtn);

  const content = document.createElement('div');
  content.className = 'profile-content';
  section.append(content);

  loadProfile(content, studentId, className);

  return section;
}

async function loadProfile(container, studentId, className) {
  container.replaceChildren(createLoading());

  try {
    const profile = await getStudentProfile(studentId, className);

    const header = document.createElement('div');
    header.className = 'profile-header';
    header.innerHTML = `
      <h2 class="section-heading">${profile.full_name || profile.student_id}</h2>
      <div class="profile-meta">Roll No: ${profile.roll_no || '—'} • Class: ${profile.class || className} • Average: ${profile.averageOverall}% • Months: ${profile.totalMonths}</div>
    `;
    container.append(header);

    if (profile.flags.length > 0) {
      const flagsWrap = document.createElement('div');
      flagsWrap.className = 'weak-student-flags';
      profile.flags.forEach(f => {
        const badge = document.createElement('span');
        badge.className = `flag-badge flag-${f}`;
        badge.textContent = f.replace(/_/g, ' ');
        flagsWrap.append(badge);
      });
      container.append(flagsWrap);
    }

    if (profile.reasons.length > 0) {
      const reasons = document.createElement('ul');
      reasons.className = 'weak-student-reasons';
      profile.reasons.forEach(r => {
        const li = document.createElement('li');
        li.textContent = r;
        reasons.append(li);
      });
      container.append(reasons);
    }

    if (profile.strongestSubject) {
      const info = document.createElement('div');
      info.className = 'student-analytics-info';
      info.innerHTML = `
        <div><strong>Strongest:</strong> ${profile.strongestSubject.subject_name} (${profile.strongestSubject.averagePercentage}%)</div>
        <div><strong>Weakest:</strong> ${profile.weakestSubject.subject_name} (${profile.weakestSubject.averagePercentage}%)</div>
      `;
      container.append(info);
    }

    if (profile.monthlyData.length > 1) {
      const chartWrap = document.createElement('div');
      chartWrap.className = 'chart-wrap';
      const canvas = document.createElement('canvas');
      chartWrap.append(canvas);
      container.append(chartWrap);

      const labels = profile.monthlyData.map(m => m.month);
      const data = profile.monthlyData.map(m => m.overallPercentage);
      const config = toLineChartData(labels, [{ label: 'Overall %', data, color: '#226b63', fill: true }]);
      new Chart(canvas, config);
    }

    if (profile.subjectAverages.length > 0) {
      const chartWrap = document.createElement('div');
      chartWrap.className = 'chart-wrap';
      const canvas = document.createElement('canvas');
      chartWrap.append(canvas);
      container.append(chartWrap);

      const labels = profile.subjectAverages.map(s => s.subject_name);
      const data = profile.subjectAverages.map(s => s.averagePercentage);
      const config = toBarChartData(labels, [{ label: 'Subject Average %', data }]);
      new Chart(canvas, config);
    }

    if (profile.subjectAverages.length > 0) {
      const heading = document.createElement('h3');
      heading.className = 'sub-heading';
      heading.textContent = 'Subject Breakdown';
      container.append(heading);

      const list = document.createElement('div');
      list.className = 'summary-list';
      profile.subjectAverages.forEach(s => {
        const item = document.createElement('div');
        item.className = 'summary-item';
        const status = s.averagePercentage < 40 ? 'At Risk' : 'Good';
        const statusClass = s.averagePercentage < 40 ? 'status-danger' : 'status-success';
        item.innerHTML = `<span>${s.subject_name}</span><span>${s.averagePercentage}% <span class="${statusClass}">${status}</span></span>`;
        list.append(item);
      });
      container.append(list);
    }
  } catch (error) {
    console.error(error);
    container.replaceChildren(createMessage('Failed to load student profile.'));
  }
}

function createLoading() {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = 'Loading profile...';
  return p;
}

function createMessage(text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  return p;
}
