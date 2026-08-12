// ── Co-Scholastic Service ─────────────────────────────────────────────────────
// Co-scholastic subjects (P.E., Singing, Discipline, ...) are graded, not
// criteria-scored: one letter grade per student per subject per term, matching
// the Class III-X convention in Sfs-report-card. They are reported in their own
// section and are deliberately EXCLUDED from the academic overall average, the
// same way Sfs-report-card marks them countInTotal:false.
//
// Firestore: collection `coscholastic_marks`, one doc per class+term.
//   docId : `${term}_${sanitizedClass}`      e.g. "HY1_Class_II"
//   shape : { term, class, grades: { [studentId]: { [subjectKey]: 'A+' } },
//             updated_at, persistedAt }
// One doc per class+term (rather than per subject) because co-scholastic is
// filled in as a single class-teacher form, not per-subject like class tests.

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const COLLECTION = 'coscholastic_marks';
const REGISTRY_PATH = 'data/coscholastic.json';
const STORAGE_KEY = 'sfds_coscholastic';

let _registry = null;

// ── Registry ──────────────────────────────────────────────────────────────────

export async function loadCoScholasticRegistry(options = {}) {
  if (_registry && !options.force) return _registry;
  const path = options.registryPath || REGISTRY_PATH;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path}: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.subjects)) throw new Error('coscholastic.json: "subjects" must be an array');
  if (!Array.isArray(data.gradeScale) || !data.gradeScale.length) {
    throw new Error('coscholastic.json: "gradeScale" must be a non-empty array');
  }
  _registry = data;
  return data;
}

export function getCoScholasticForClass(registry, className) {
  if (!registry || !className) return [];
  return (registry.subjects || []).filter(s => (s.classes || []).includes(className));
}

export async function loadCoScholasticForClass(className, options = {}) {
  const reg = await loadCoScholasticRegistry(options);
  return getCoScholasticForClass(reg, className);
}

/** True when `grade` is one of the configured grades. Blank/undefined = not graded yet. */
export function isValidGrade(registry, grade) {
  if (grade === '' || grade === null || grade === undefined) return true;
  return (registry?.gradeScale || []).includes(grade);
}

// ── Doc id ────────────────────────────────────────────────────────────────────

function sanitize(v) {
  return String(v).replace(/\//g, '_').replace(/\s+/g, '_');
}

export function coScholasticDocId(term, className) {
  return `${sanitize(term)}_${sanitize(className)}`;
}

// ── Local cache (mirrors session/class-test local-first behaviour) ────────────

function readCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    throw new Error('Failed to save co-scholastic grades: storage may be full');
  }
}

// See syncSessionsFromFirestore — `strict` rethrows for callers that must not
// silently proceed on a stale cache.
export async function syncCoScholasticFromFirestore({ strict = false } = {}) {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const map = {};
    snap.forEach(d => { map[d.id] = d.data(); });
    writeCache(map);
    return map;
  } catch (err) {
    console.warn('Co-scholastic sync failed, using local cache:', err.message);
    if (strict) throw err;
    return readCache();
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Local-cache read — used by the report card builder, same as getClassTest(). */
export function getCoScholastic(term, className) {
  return readCache()[coScholasticDocId(term, className)] || null;
}

export async function getCoScholasticRemote(term, className) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, coScholasticDocId(term, className)));
    return snap.exists() ? snap.data() : null;
  } catch {
    return getCoScholastic(term, className);
  }
}

/**
 * One student's co-scholastic grades for a term, resolved against the registry
 * so the report card always reflects the configured subject list.
 * @returns {Array<{key, label, grade}>} grade is null when not yet entered.
 */
export function getStudentCoScholastic(term, className, studentId, subjects) {
  const rec = getCoScholastic(term, className);
  const grades = rec?.grades?.[studentId] || {};
  return (subjects || []).map(s => ({
    key: s.key,
    label: s.label,
    grade: grades[s.key] || null
  }));
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persists the whole class+term co-scholastic grid.
 * @param {string} term      'HY1' | 'HY2'
 * @param {string} className e.g. 'Class II'
 * @param {object} grades    { [studentId]: { [subjectKey]: grade } }
 */
/** Strips undefined/blank grade cells, and students left with no grades at all. */
function pruneBlank(grades) {
  const out = {};
  Object.entries(grades || {}).forEach(([studentId, subjectMap]) => {
    const kept = {};
    Object.entries(subjectMap || {}).forEach(([key, grade]) => {
      if (grade !== undefined && grade !== null && grade !== '') kept[key] = grade;
    });
    if (Object.keys(kept).length) out[studentId] = kept;
  });
  return out;
}

export async function saveCoScholastic(term, className, grades, meta = {}) {
  if (!term || !className) throw new Error('Invalid co-scholastic save: term and class are required');
  const docId = coScholasticDocId(term, className);
  const now = new Date().toISOString();
  const payload = {
    term,
    class: className,
    // Firestore rejects `undefined` outright, which would fail the whole write.
    // Drop blank/undefined cells instead — "not graded yet" is simply absence.
    grades: pruneBlank(grades),
    // Carried forward, never set from here. setDoc replaces the whole document,
    // so omitting status would drop the field and read back as 'draft' — a
    // teacher's save would silently clear an admin's lock. The rules reject
    // that too, but the client must not depend on being told no.
    status: getCoScholastic(term, className)?.status || 'draft',
    enteredBy: meta.enteredBy || null,
    updated_at: now,
    persistedAt: now
  };

  const cache = readCache();
  cache[docId] = payload;
  writeCache(cache);

  await setDoc(doc(db, COLLECTION, docId), payload);
  return payload;
}

export async function saveCoScholasticAndConfirm(term, className, grades, meta = {}) {
  try {
    const saved = await saveCoScholastic(term, className, grades, meta);
    return { ok: true, saved };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not reach the server.' };
  }
}

// ── Lock (admin only) ─────────────────────────────────────────────────────────

/** True when this class+term has been locked by an admin. */
export function isCoScholasticLocked(term, className) {
  return (getCoScholastic(term, className)?.status || 'draft') === 'locked';
}

/**
 * Locks or unlocks one class+term. Admin only — firestore.rules is the actual
 * boundary; a teacher calling this is rejected server-side.
 *
 * Uses merge so it only ever touches the status fields: locking must never
 * rewrite the grades, and there is no reason for the lock button to hold a copy
 * of the whole grid to put back.
 */
export async function setCoScholasticLock(term, className, locked, meta = {}) {
  if (!term || !className) throw new Error('Invalid lock: term and class are required');
  const docId = coScholasticDocId(term, className);
  const now = new Date().toISOString();
  const patch = {
    status: locked ? 'locked' : 'draft',
    lockedBy: locked ? (meta.lockedBy || null) : null,
    lockedAt: locked ? now : null,
    updated_at: now
  };

  await setDoc(doc(db, COLLECTION, docId), patch, { merge: true });

  const cache = readCache();
  if (cache[docId]) {
    cache[docId] = { ...cache[docId], ...patch };
    writeCache(cache);
  }
  return patch;
}
