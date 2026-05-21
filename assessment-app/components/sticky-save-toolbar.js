export function createStickySaveToolbar({
  onSave = () => {},
  onSubmit = () => {},
  onClose = () => {},
  saveStatus = 'idle',
  lastSaved = null,
  progress = {}
} = {}) {
  const toolbar = document.createElement('div');
  toolbar.className = 'sticky-save-toolbar';

  const inner = document.createElement('div');
  inner.className = 'sticky-save-inner';

  const statusBlock = document.createElement('div');
  statusBlock.className = 'sticky-status-block';

  const statusText = document.createElement('div');
  statusText.className = 'sticky-status-text';
  statusText.dataset.status = saveStatus;

  if (saveStatus === 'saving') {
    statusText.textContent = 'Saving…';
  } else if (saveStatus === 'saved') {
    statusText.textContent = 'Saved ✓';
  } else if (saveStatus === 'unsaved') {
    statusText.textContent = 'Unsaved Changes';
  } else {
    statusText.textContent = lastSaved ? `Saved ${formatTime(lastSaved)}` : 'Ready';
  }
  statusBlock.append(statusText);

  if (progress.overallPercentage !== undefined) {
    const pctText = document.createElement('div');
    pctText.className = 'sticky-pct-text';
    pctText.textContent = `${progress.overallPercentage}%`;
    statusBlock.append(pctText);
  }

  const actions = document.createElement('div');
  actions.className = 'sticky-actions';

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary btn-sm';
  saveBtn.textContent = 'Save';
  saveBtn.addEventListener('click', onSave);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'button';
  submitBtn.className = 'btn btn-secondary btn-sm';
  submitBtn.textContent = 'Submit';
  submitBtn.addEventListener('click', onSubmit);

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-secondary btn-sm';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', onClose);

  actions.append(saveBtn, submitBtn, closeBtn);

  inner.append(statusBlock, actions);
  toolbar.append(inner);

  return toolbar;
}

function formatTime(dateObj) {
  if (!dateObj) return '';
  const d = new Date(dateObj);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
