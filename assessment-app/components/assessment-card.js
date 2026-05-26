import { calculateStudentTotal } from '../services/totals-engine.js';
import { groupCriteriaByCategory } from '../services/criteria-loader.js';

export function createAssessmentCard({
  student,
  criteria,
  marks,
  onMarkChange = () => {},
  onToggleExpand = () => {},
  onApplyDefault = () => {},
  expanded = true,
  showAbsent = true,
  onAbsentToggle = () => {}
} = {}) {
  const card = document.createElement('article');
  card.className = 'assessment-card';
  card.dataset.studentId = student.student_id;
  card.dataset.expanded = String(expanded);

  const header = document.createElement('div');
  header.className = 'card-header assessment-card-header';
  header.addEventListener('click', e => {
    if (e.target.closest('.mark-scale') || e.target.closest('.absent-btn')) return;
    onToggleExpand(student.student_id);
  });

  const identityBlock = document.createElement('div');
  identityBlock.className = 'identity-block';

  const nameEl = document.createElement('div');
  nameEl.className = 'student-name';
  nameEl.textContent = student.full_name.toUpperCase();

  const metaEl = document.createElement('div');
  metaEl.className = 'student-meta enhanced-meta';
  metaEl.innerHTML = `<span>Roll: ${student.roll_no || '—'}</span><span>ID: ${student.student_id}</span>`;

  const completionEl = document.createElement('div');
  completionEl.className = 'completion-dot';

  identityBlock.append(nameEl, metaEl, completionEl);

  const rightBlock = document.createElement('div');
  rightBlock.className = 'card-right-block';

  const totalBlock = document.createElement('div');
  totalBlock.className = 'total-block';
  const totalEl = document.createElement('div');
  totalEl.className = 'total-score';
  totalEl.id = `total-${student.student_id}`;
  totalEl.textContent = '— / —';
  totalBlock.append(totalEl);

  const expandIcon = document.createElement('div');
  expandIcon.className = 'expand-icon';
  expandIcon.textContent = expanded ? '▼' : '▶';

  rightBlock.append(totalBlock, expandIcon);
  header.append(identityBlock, rightBlock);
  card.append(header);

  if (expanded) {
    const criteriaList = document.createElement('div');
    criteriaList.className = 'card-criteria';

    const grouped = groupCriteriaByCategory(criteria);
    grouped.forEach(group => {
      // Category header (subheading)
      const groupHeader = document.createElement('div');
      groupHeader.className = 'criteria-group-header';
      groupHeader.textContent = group.category;
      criteriaList.append(groupHeader);

    group.items.forEach(criterion => {
      const row = document.createElement('div');
      row.className = 'criterion-row';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'criterion-title-wrap';

      const title = document.createElement('div');
      title.className = 'criterion-title';
      title.textContent = criterion.criterion_name;
      titleWrap.append(title);

      const currentEntry = marks && marks[criterion.criterion_id] !== undefined ? marks[criterion.criterion_id] : null;
      const isAbsent = currentEntry && typeof currentEntry === 'object' && currentEntry.attendance === 'absent';
      const currentMark = isAbsent ? null : currentEntry;

      const scale = document.createElement('div');
      scale.className = 'mark-scale';

      [0, 1, 2, 3, 4, 5].forEach(mark => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mark-button';
        button.textContent = String(mark);
        button.dataset.mark = String(mark);
        button.dataset.criterionId = criterion.criterion_id;

        if (!isAbsent && currentMark !== null && currentMark === mark) {
          button.classList.add('selected');
        }

        button.addEventListener('click', () => {
          const isSame = button.classList.contains('selected');
          const newMark = isSame ? null : mark;

          scale.querySelectorAll('.mark-button').forEach(btn => btn.classList.remove('selected'));
          absentBtn.classList.remove('selected');
          if (!isSame) {
            button.classList.add('selected');
          }

          onMarkChange(student.student_id, criterion.criterion_id, newMark);
        });

        scale.append(button);
      });

      // Absent button
      const absentBtn = document.createElement('button');
      absentBtn.type = 'button';
      absentBtn.className = `mark-button absent-btn${isAbsent ? ' selected' : ''}`;
      absentBtn.textContent = 'A';
      absentBtn.title = 'Absent';
      absentBtn.addEventListener('click', () => {
        const isSame = absentBtn.classList.contains('selected');
        scale.querySelectorAll('.mark-button').forEach(btn => btn.classList.remove('selected'));
        if (!isSame) {
          absentBtn.classList.add('selected');
          onAbsentToggle(student.student_id, criterion.criterion_id, true);
        } else {
          absentBtn.classList.remove('selected');
          onAbsentToggle(student.student_id, criterion.criterion_id, false);
        }
      });
      scale.append(absentBtn);

      // Apply-default-to-all for this criterion
      const applyWrap = document.createElement('div');
      applyWrap.className = 'apply-default-wrap';
      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.className = 'apply-default-btn';
      applyBtn.textContent = 'Apply 4 to All';
      applyBtn.title = 'Apply score 4 to all students for this criterion';
      applyBtn.addEventListener('click', () => {
        onApplyDefault(criterion.criterion_id, 4);
      });
      applyWrap.append(applyBtn);

      row.append(titleWrap, scale, applyWrap);
      criteriaList.append(row);
    });
    });

    card.append(criteriaList);
  }

  updateTotal(card, marks, criteria);
  updateCompletionDot(card, marks, criteria);

  return card;
}

export function updateTotal(cardElement, marks, criteria) {
  const totalEl = cardElement.querySelector('.total-score');
  if (!totalEl) return;

  const { total, max, completed, totalCriteria } = calculateStudentTotal(marks, criteria);

  if (completed === 0) {
    totalEl.textContent = `— / ${max}`;
    totalEl.className = 'total-score';
  } else {
    totalEl.textContent = `${total} / ${max}`;
    totalEl.className = completed === totalCriteria ? 'total-score complete' : 'total-score partial';
  }
}

function updateCompletionDot(cardElement, marks, criteria) {
  const dot = cardElement.querySelector('.completion-dot');
  if (!dot) return;

  const { completed, totalCriteria } = calculateStudentTotal(marks, criteria);
  dot.dataset.status = completed === totalCriteria ? 'complete' : completed > 0 ? 'partial' : 'empty';
}
