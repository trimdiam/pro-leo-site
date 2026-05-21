export function createSubjectSelector({
  classes = [],
  subjects = [],
  selectedClass = '',
  selectedSubjectId = '',
  onClassChange = () => {},
  onSubjectChange = () => {}
} = {}) {
  const section = document.createElement('section');
  section.className = 'panel selector-panel';

  const classField = createField('Class');
  const classSelect = createSelect('Select class');
  classes.forEach(className => {
    classSelect.append(createOption(className, className, className === selectedClass));
  });
  classSelect.addEventListener('change', event => onClassChange(event.target.value));
  classField.append(classSelect);
  section.append(classField);

  const subjectField = createField('Subject');
  const subjectSelect = createSelect('Select subject');
  subjectSelect.disabled = subjects.length === 0;
  subjects.forEach(subject => {
    subjectSelect.append(
      createOption(subject.subject_id, subject.subject_name, subject.subject_id === selectedSubjectId)
    );
  });
  subjectSelect.addEventListener('change', event => {
    onSubjectChange(subjects.find(subject => subject.subject_id === event.target.value) || null);
  });
  subjectField.append(subjectSelect);
  section.append(subjectField);

  if (selectedClass && subjects.length === 0) {
    section.append(createMessage('No subjects found for this class'));
  }

  return section;
}

function createField(labelText) {
  const label = document.createElement('label');
  label.className = 'field';
  label.textContent = labelText;
  return label;
}

function createSelect(placeholder) {
  const select = document.createElement('select');
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

function createMessage(text) {
  const message = document.createElement('p');
  message.className = 'empty-state';
  message.textContent = text;
  return message;
}
