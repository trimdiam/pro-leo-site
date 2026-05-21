export function createCriteriaList({
  criteria = [],
  errorMessage = '',
  isLoading = false
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel criteria-panel';

  if (isLoading) {
    section.append(createStatus('Loading criteria...'));
    return section;
  }

  if (errorMessage) {
    section.append(createStatus(errorMessage, 'error-state'));
    return section;
  }

  if (!criteria.length) {
    section.append(createStatus('Select a class and subject to load criteria.'));
    return section;
  }

  const list = document.createElement('ol');
  list.className = 'criteria-list';
  criteria.forEach(criterion => list.append(createCriterionRow(criterion)));
  section.append(list);
  return section;
}

function createCriterionRow(criterion) {
  const item = document.createElement('li');
  item.className = 'criterion-row';
  item.dataset.criterionId = criterion.criterion_id;

  const title = document.createElement('div');
  title.className = 'criterion-title';
  title.textContent = criterion.criterion_name;
  item.append(title);

  const scale = document.createElement('div');
  scale.className = 'mark-scale';
  criterion.mark_scale.forEach(mark => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mark-button';
    button.textContent = String(mark);
    button.dataset.mark = String(mark);
    button.dataset.maxMarks = String(criterion.max_marks);
    button.disabled = true;
    scale.append(button);
  });
  item.append(scale);

  return item;
}

function createStatus(text, className = 'empty-state') {
  const status = document.createElement('p');
  status.className = className;
  status.textContent = text;
  return status;
}
