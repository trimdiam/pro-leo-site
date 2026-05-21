const DEFAULT_SUBJECTS_PATH = 'data/subjects.json';

export class SubjectLoaderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'SubjectLoaderError';
    this.details = details;
  }
}

export async function loadSubjects(options = {}) {
  const registryPath = options.registryPath || DEFAULT_SUBJECTS_PATH;
  const fetchJson = options.fetchJson || fetchJsonFile;
  const subjects = await fetchJson(registryPath);
  return validateSubjects(subjects);
}

export function getSubjectsForClass(subjects, className) {
  if (!className) return [];
  return validateSubjects(subjects).filter(subject => subject.classes.includes(className));
}

export async function loadSubjectsForClass(className, options = {}) {
  const subjects = await loadSubjects(options);
  return getSubjectsForClass(subjects, className);
}

export function validateSubjects(subjects) {
  if (!Array.isArray(subjects)) {
    throw new SubjectLoaderError('Subject registry must be an array');
  }

  const ids = new Set();
  subjects.forEach((subject, index) => {
    if (!subject || typeof subject !== 'object') {
      throw new SubjectLoaderError('Subject entry must be an object', { index });
    }
    requireString(subject.subject_id, 'subject_id', index);
    requireString(subject.subject_name, 'subject_name', index);
    requireString(subject.criteria_path, 'criteria_path', index);
    if (!Array.isArray(subject.classes) || subject.classes.length === 0) {
      throw new SubjectLoaderError('Subject must include class mappings', {
        subject_id: subject.subject_id
      });
    }
    if (ids.has(subject.subject_id)) {
      throw new SubjectLoaderError('Duplicate subject_id in registry', {
        subject_id: subject.subject_id
      });
    }
    ids.add(subject.subject_id);
  });

  return subjects;
}

async function fetchJsonFile(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new SubjectLoaderError('Failed to load subjects', {
      path,
      status: response.status
    });
  }
  return response.json();
}

function requireString(value, field, index) {
  if (!value || typeof value !== 'string') {
    throw new SubjectLoaderError(`Subject entry is missing ${field}`, { index });
  }
}
