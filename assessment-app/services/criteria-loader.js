export const MARK_SCALE = Object.freeze([0, 1, 2, 3, 4, 5]);

export class CriteriaLoaderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CriteriaLoaderError';
    this.details = details;
    this.userMessage = details.userMessage || message;
  }
}

export async function loadCriteriaForSubject(subject, className, options = {}) {
  if (!subject || typeof subject !== 'object') {
    throw new CriteriaLoaderError('Subject is required', {
      userMessage: 'Failed to load criteria'
    });
  }
  if (!subject.criteria_path) {
    throw new CriteriaLoaderError('Subject is missing criteria_path', {
      subject_id: subject.subject_id,
      userMessage: 'Criteria not available'
    });
  }
  if (className && Array.isArray(subject.classes) && !subject.classes.includes(className)) {
    console.warn(`${subject.subject_name} is not mapped to ${className}`);
    return [];
  }

  const fetchJson = options.fetchJson || fetchCriteriaJson;
  const criteriaFile = await fetchJson(subject.criteria_path, subject.subject_name);
  return validateCriteriaFile(criteriaFile, className);
}

export function validateCriteriaFile(criteriaFile, className) {
  if (!criteriaFile || typeof criteriaFile !== 'object') {
    throw new CriteriaLoaderError('Criteria file must be an object', {
      userMessage: 'Failed to load criteria'
    });
  }

  const subjectName = criteriaFile.subject_name || criteriaFile.subject_id || 'Subject';
  if (!Array.isArray(criteriaFile.classes) || criteriaFile.classes.length === 0) {
    throw new CriteriaLoaderError('Criteria file is missing class mappings', {
      subjectName,
      userMessage: `Failed to load ${subjectName} criteria`
    });
  }
  if (className && !criteriaFile.classes.includes(className)) {
    console.warn(`${subjectName} is not mapped to ${className}`);
    return [];
  }
  if (!Array.isArray(criteriaFile.criteria) || criteriaFile.criteria.length === 0) {
    throw new CriteriaLoaderError('Criteria array is empty', {
      subjectName,
      userMessage: `${subjectName} criteria are not available`
    });
  }

  const duplicates = findDuplicates(criteriaFile.criteria.map(item => item?.criterion_id));
  if (duplicates.length) {
    throw new CriteriaLoaderError('Duplicate criterion_id values found', {
      subjectName,
      duplicateIds: duplicates,
      userMessage: `Failed to load ${subjectName} criteria`
    });
  }

  return criteriaFile.criteria
    .filter((criterion, index) => validateCriterion(criterion, criteriaFile, className, index))
    .map(criterion => normalizeCriterion(criterion, criteriaFile, className));
}

export function buildAssessmentStructure({ student, subject, criteria, className }) {
  return {
    student_id: student?.student_id || '',
    full_name: student?.full_name || student?.fullName || '',
    class: className || student?.class || '',
    subject_id: subject?.subject_id || '',
    subject_name: subject?.subject_name || '',
    criteria: criteria.map(criterion => ({
      criterion_id: criterion.criterion_id,
      criterion_name: criterion.criterion_name,
      max_marks: 5,
      mark_scale: MARK_SCALE,
      mark: null
    }))
  };
}

async function fetchCriteriaJson(path, subjectName) {
  let response;
  try {
    response = await fetch(path);
  } catch (error) {
    throw new CriteriaLoaderError('Criteria file could not be reached', {
      path,
      cause: error,
      userMessage: 'Criteria not available'
    });
  }
  if (!response.ok) {
    throw new CriteriaLoaderError('Criteria file is missing', {
      path,
      status: response.status,
      userMessage: 'Criteria not available'
    });
  }
  try {
    return await response.json();
  } catch (error) {
    throw new CriteriaLoaderError('Malformed criteria JSON', {
      path,
      cause: error,
      userMessage: `Failed to load ${subjectName} criteria`
    });
  }
}

function validateCriterion(criterion, criteriaFile, className, index) {
  const subjectName = criteriaFile.subject_name || criteriaFile.subject_id || 'Subject';
  if (!criterion || typeof criterion !== 'object') {
    throw new CriteriaLoaderError('Criterion entry must be an object', {
      subjectName,
      index,
      userMessage: `Failed to load ${subjectName} criteria`
    });
  }
  if (!criterion.criterion_id || typeof criterion.criterion_id !== 'string') {
    throw new CriteriaLoaderError('Criterion entry is missing criterion_id', {
      subjectName,
      index,
      userMessage: `Failed to load ${subjectName} criteria`
    });
  }
  if (!criterion.criterion_name || typeof criterion.criterion_name !== 'string') {
    throw new CriteriaLoaderError('Criterion entry is missing criterion_name', {
      subjectName,
      criterion_id: criterion.criterion_id,
      userMessage: `Failed to load ${subjectName} criteria`
    });
  }
  if (criterion.max_marks !== 5) {
    console.warn(`${criterion.criterion_id} max_marks normalized to 5`);
  }
  const classGroup = Array.isArray(criterion.class_group) ? criterion.class_group : criteriaFile.classes;
  return !className || classGroup.includes(className);
}

function normalizeCriterion(criterion, criteriaFile, className) {
  return {
    criterion_id: criterion.criterion_id,
    criterion_name: criterion.criterion_name,
    category: criterion.category || 'General',
    max_marks: 5,
    subject_id: criterion.subject_id || criteriaFile.subject_id,
    class_group: Array.isArray(criterion.class_group) ? criterion.class_group : criteriaFile.classes,
    mark_scale: MARK_SCALE,
    selected_class: className || ''
  };
}

// Group criteria by category, preserving the order in which each category
// first appears. Returns: [{ category: 'Work Habits', items: [...] }, ...]
export function groupCriteriaByCategory(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) return [];
  const order = [];
  const map = new Map();
  criteria.forEach(c => {
    const cat = c.category || 'General';
    if (!map.has(cat)) {
      order.push(cat);
      map.set(cat, []);
    }
    map.get(cat).push(c);
  });
  return order.map(cat => ({ category: cat, items: map.get(cat) }));
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  values.forEach(value => {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  });
  return [...duplicates].filter(Boolean);
}
