import { updateTotal } from './assessment-card.js';
import { calculateStudentTotal } from '../services/totals-engine.js';

export function createQuickEntryGrid({
  students,
  criteria,
  marks,
  onMarkChange = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'quick-entry-panel';

  if (!criteria.length) {
    section.append(createMessage('No criteria loaded.'));
    return section;
  }

  criteria.forEach((criterion, cIndex) => {
    const criterionBlock = document.createElement('div');
    criterionBlock.className = 'quick-criterion-block';

    const header = document.createElement('div');
    header.className = 'quick-criterion-header';
    const catLabel = criterion.category ? `<div class="quick-criterion-category">${criterion.category}</div>` : '';
    header.innerHTML = `${catLabel}<strong>${criterion.criterion_name}</strong> <span class="quick-progress">${cIndex + 1}/${criteria.length}</span>`;
    criterionBlock.append(header);

    const grid = document.createElement('div');
    grid.className = 'quick-student-grid';

    students.forEach(student => {
      const currentMark = marks[student.student_id]?.[criterion.criterion_id] ?? null;

      const row = document.createElement('div');
      row.className = 'quick-student-row';

      const nameEl = document.createElement('div');
      nameEl.className = 'quick-student-name';
      nameEl.textContent = `${student.full_name}`;

      const rollEl = document.createElement('div');
      rollEl.className = 'quick-student-roll';
      rollEl.textContent = `Roll ${student.roll_no || '—'}`;

      const scale = document.createElement('div');
      scale.className = 'mark-scale quick-scale';

      [0, 1, 2, 3, 4, 5].forEach(mark => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mark-button';
        button.textContent = String(mark);
        if (currentMark !== null && currentMark === mark) {
          button.classList.add('selected');
        }
        button.addEventListener('click', () => {
          const isSame = button.classList.contains('selected');
          const newMark = isSame ? null : mark;

          scale.querySelectorAll('.mark-button').forEach(btn => btn.classList.remove('selected'));
          if (!isSame) button.classList.add('selected');

          onMarkChange(student.student_id, criterion.criterion_id, newMark);

          const totalEl = row.querySelector('.quick-total');
          if (totalEl) {
            const updatedMarks = { ...marks[student.student_id], [criterion.criterion_id]: newMark };
            const { total, max, completed, totalCriteria } = calculateStudentTotal(updatedMarks, criteria);
            totalEl.textContent = `${completed === totalCriteria ? '' : '• '}${total}/${max}`;
            totalEl.className = `quick-total ${completed === totalCriteria ? 'complete' : 'partial'}`;
          }
        });
        scale.append(button);
      });

      const totalBlock = document.createElement('div');
      const { total, max, completed, totalCriteria } = calculateStudentTotal(
        marks[student.student_id] || {},
        criteria
      );
      totalBlock.className = 'quick-total';
      totalBlock.textContent = `${completed === totalCriteria ? '' : '• '}${total}/${max}`;
      if (completed === totalCriteria) totalBlock.classList.add('complete');
      else totalBlock.classList.add('partial');

      row.append(nameEl, rollEl, scale, totalBlock);
      grid.append(row);
    });

    criterionBlock.append(grid);
    section.append(criterionBlock);
  });

  return section;
}

function createMessage(text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  return p;
}
