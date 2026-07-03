const DEFAULT_CONFIG_PATH = 'data/class-test-config.json';

let _cache = null;

export async function loadClassTestConfig(options = {}) {
  if (_cache && !options.force) return _cache;
  const fetchJson = options.fetchJson || fetchJsonFile;
  _cache = await fetchJson(options.configPath || DEFAULT_CONFIG_PATH);
  return _cache;
}

// Intersects class-test-config's subject list with the main subject registry's
// per-subject class mapping, so e.g. Hindi (Class II only) doesn't show up
// as a class-test option for Class I.
export function getClassTestSubjectsForClass(config, subjectRegistry, className) {
  if (!config || !className) return [];
  const registryBySubjectId = new Map((subjectRegistry || []).map(s => [s.subject_id, s]));

  return Object.entries(config.subjects || {})
    .filter(([subjectId]) => {
      const reg = registryBySubjectId.get(subjectId);
      return reg ? reg.classes.includes(className) : false;
    })
    .map(([subjectId, def]) => ({
      subject_id: subjectId,
      subject_name: def.subject_name,
      max_marks: def.max_marks
    }));
}

async function fetchJsonFile(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load class test config (${response.status})`);
  }
  return response.json();
}
