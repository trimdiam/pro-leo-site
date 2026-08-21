// ── Play Group Narrative Service ──────────────────────────────────────────────
// Play Group's report card carries two pieces of teacher-written text that no
// other class has, and that nothing else in this app can supply:
//
//   1. Growth Observation — a fixed list of observation areas (the prompts in
//      coscholastic.json's growthPromptsByClass), each answered three times
//      across the year: as noted at the START, as observed at HALF YEARLY, and
//      as TERM END progress.
//   2. One overall remark per term (HY1 / HY2).
//
// Why this is not handled by the existing remark engine: report-card-remark-
// engine.js assembles remarks from a phrase bank driven by CRITERIA scores.
// Play Group has no criteria and no academic subjects at all — only letter
// grades — so there is nothing for that engine to read. These are typed by the
// class teacher instead.
//
// Firestore: collection `playgroup_narratives`, ONE doc per class.
//   docId : sanitized class name          e.g. "Play_Group"
//   shape : { class,
//             students: { [studentId]: {
//               growth:  { [promptKey]: { start, half, end } },
//               remarks: { HY1, HY2 }
//             } },
//             status, enteredBy, updated_at, persistedAt }
//
// One doc per CLASS rather than per class+term (which is what coscholastic_marks
// does) because a growth row spans the whole year: its three columns are one
// record read left to right. Splitting by term would store the start-of-year
// column twice and let the two copies disagree.

import { db } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
import { loadCoScholasticRegistry } from './coscholastic-service.js';

const COLLECTION = 'playgroup_narratives';
const STORAGE_KEY = 'sfds_playgroup_narratives';

/** The three growth columns, in the order they print on the card. */
export const GROWTH_COLUMNS = [
  { key: 'start', label: 'As Noted in the Beginning of the Year' },
  { key: 'half',  label: 'As Observed in Half Yearly' },
  { key: 'end',   label: 'Term End Progress' }
];

export const REMARK_TERMS = [
  { key: 'HY1', label: 'Half Yearly' },
  { key: 'HY2', label: 'Final Term' }
];

/**
 * Attendance is typed in by hand for Play Group, the same way the Class III-X
 * class teachers do it in Sfs-report-card/markentry.js — not derived from the
 * daily attendance system the way LKG/SKG report cards are.
 *
 * The field names are deliberately identical to that system's
 * (hyPresent/hyTotal/ftPresent/ftTotal) so the school's two report card
 * pipelines describe attendance with one vocabulary rather than two. `total` is
 * the class's working days: it is stored per student, again matching Class
 * III-X, so a card can be read on its own without needing a class-level lookup.
 */
export const ATTENDANCE_TERMS = [
  { key: 'HY1', label: 'Half Yearly', presentKey: 'hyPresent', totalKey: 'hyTotal' },
  { key: 'HY2', label: 'Final Term',  presentKey: 'ftPresent', totalKey: 'ftTotal' }
];

// ── Prompts ───────────────────────────────────────────────────────────────────

/**
 * Observation areas configured for a class, or [] for classes that have none.
 * Reading these from the shared registry (rather than hardcoding here) is what
 * keeps this screen and the printed card asking the same questions — change the
 * list in coscholastic.json and both follow.
 */
export function getGrowthPromptsForClass(registry, className) {
  if (!registry || !className) return [];
  const list = registry.growthPromptsByClass?.[className];
  return Array.isArray(list) ? list : [];
}

export async function loadGrowthPromptsForClass(className, options = {}) {
  const reg = await loadCoScholasticRegistry(options);
  return getGrowthPromptsForClass(reg, className);
}

/** True when this class uses the narrative screen at all. */
export function classUsesNarrative(registry, className) {
  return getGrowthPromptsForClass(registry, className).length > 0;
}

// ── Doc id ────────────────────────────────────────────────────────────────────
// Same sanitize rule as coScholasticDocId, deliberately: 'Play Group' must
// produce 'Play_Group' here exactly as it produces 'HY1_Play_Group' there, so
// the two collections never disagree about what this class is called.

function sanitize(v) {
  return String(v).replace(/\//g, '_').replace(/\s+/g, '_');
}

export function narrativeDocId(className) {
  return sanitize(className);
}

// ── Local cache (mirrors the co-scholastic local-first behaviour) ─────────────

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
  } catch {
    throw new Error('Failed to save Play Group narratives: storage may be full');
  }
}

export async function syncNarrativesFromFirestore({ strict = false } = {}) {
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const map = {};
    snap.forEach(d => { map[d.id] = d.data(); });
    writeCache(map);
    return map;
  } catch (err) {
    console.warn('Play Group narrative sync failed, using local cache:', err.message);
    if (strict) throw err;
    return readCache();
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** Local-cache read — used by the report card builder, same as getCoScholastic(). */
export function getNarrative(className) {
  return readCache()[narrativeDocId(className)] || null;
}

export async function getNarrativeRemote(className) {
  try {
    const snap = await getDoc(doc(db, COLLECTION, narrativeDocId(className)));
    return snap.exists() ? snap.data() : null;
  } catch {
    return getNarrative(className);
  }
}

/**
 * One student's narrative content, resolved against the configured prompts so
 * the card always reflects the current prompt list rather than whatever keys
 * happen to be stored. A prompt with nothing written against it comes back with
 * empty strings, never undefined, so the template can render a blank row
 * without special-casing.
 *
 * @returns {{ growth: Array<{key,prompt,start,half,end}>, remarks: {HY1,HY2} }}
 */
export function getStudentNarrative(className, studentId, prompts = []) {
  const rec = getNarrative(className);
  const stu = rec?.students?.[studentId] || {};
  const growthSrc = stu.growth || {};
  const growth = prompts.map(p => {
    const cell = growthSrc[p.key] || {};
    return {
      key: p.key,
      prompt: p.prompt,
      start: cell.start || '',
      half:  cell.half  || '',
      end:   cell.end   || ''
    };
  });
  const att = stu.attendance || {};
  const attendance = {};
  ATTENDANCE_TERMS.forEach(t => {
    attendance[t.key] = {
      present: att[t.presentKey] ?? null,
      total:   att[t.totalKey]   ?? null
    };
  });

  return {
    growth,
    remarks: {
      HY1: stu.remarks?.HY1 || '',
      HY2: stu.remarks?.HY2 || ''
    },
    attendance
  };
}

/**
 * Missing vs zero. Number(null), Number(undefined ?? '') and Number('') all
 * coerce to 0, which is finite — so without this guard an attendance that was
 * never entered would render as "0/79" and "0%", telling a parent their child
 * attended no days at all. Nothing entered must stay nothing.
 */
function numOrNull(v) {
  if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * "18/79" for a term, or null when either half is missing. Centralised here so
 * the entry screen's preview and the printed card can never disagree about how
 * a partially-filled attendance renders.
 */
export function formatAttendance(present, total) {
  const p = numOrNull(present), t = numOrNull(total);
  if (p === null || t === null || t <= 0) return null;
  return `${p}/${t}`;
}

/** Whole-number percent, or null when it cannot be computed. */
export function attendancePercent(present, total) {
  const p = numOrNull(present), t = numOrNull(total);
  if (p === null || t === null || t <= 0) return null;
  return Math.round((p / t) * 1000) / 10;
}

/** True when a student has nothing written at all — used to flag gaps before release. */
export function isStudentNarrativeEmpty(className, studentId, prompts = []) {
  const { growth, remarks, attendance } = getStudentNarrative(className, studentId, prompts);
  const anyGrowth = growth.some(g => g.start || g.half || g.end);
  const anyAtt = ATTENDANCE_TERMS.some(t =>
    attendance[t.key]?.present !== null || attendance[t.key]?.total !== null
  );
  return !anyGrowth && !remarks.HY1 && !remarks.HY2 && !anyAtt;
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Drops empty strings, then any student left with nothing. Firestore rejects
 * `undefined` outright and would fail the whole write; "not written yet" is
 * simply absence, exactly as a blank grade is in coscholastic_marks.
 */
function pruneBlank(students) {
  const out = {};
  Object.entries(students || {}).forEach(([studentId, rec]) => {
    const growth = {};
    Object.entries(rec?.growth || {}).forEach(([promptKey, cell]) => {
      const kept = {};
      GROWTH_COLUMNS.forEach(({ key }) => {
        const v = cell?.[key];
        if (typeof v === 'string' && v.trim()) kept[key] = v.trim();
      });
      if (Object.keys(kept).length) growth[promptKey] = kept;
    });

    const remarks = {};
    REMARK_TERMS.forEach(({ key }) => {
      const v = rec?.remarks?.[key];
      if (typeof v === 'string' && v.trim()) remarks[key] = v.trim();
    });

    // Attendance is numeric, so blank means "not entered" and must be dropped,
    // but 0 is a real value (a child present on no days) and must survive —
    // a plain falsy check here would silently discard it.
    const attendance = {};
    ATTENDANCE_TERMS.forEach(t => {
      [t.presentKey, t.totalKey].forEach(k => {
        const raw = rec?.attendance?.[k];
        if (raw === '' || raw === null || raw === undefined) return;
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) attendance[k] = n;
      });
    });

    const keep = {};
    if (Object.keys(growth).length)     keep.growth     = growth;
    if (Object.keys(remarks).length)    keep.remarks    = remarks;
    if (Object.keys(attendance).length) keep.attendance = attendance;
    if (Object.keys(keep).length)       out[studentId] = keep;
  });
  return out;
}

/**
 * Persists the whole class's narrative content in one write.
 * @param {string} className e.g. 'Play Group'
 * @param {object} students  { [studentId]: { growth: {...}, remarks: {...} } }
 */
export async function saveNarrative(className, students, meta = {}) {
  if (!className) throw new Error('Invalid narrative save: class is required');
  const docId = narrativeDocId(className);
  const now = new Date().toISOString();
  const payload = {
    class: className,
    students: pruneBlank(students),
    // Carried forward, never set from here — setDoc replaces the whole
    // document, so omitting status would drop the field, read back as 'draft',
    // and silently clear an admin's lock. Same reasoning as saveCoScholastic.
    status: getNarrative(className)?.status || 'draft',
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

export async function saveNarrativeAndConfirm(className, students, meta = {}) {
  try {
    const saved = await saveNarrative(className, students, meta);
    return { ok: true, saved };
  } catch (err) {
    return { ok: false, error: err.message || 'Could not reach the server.' };
  }
}

// ── Lock (admin only) ─────────────────────────────────────────────────────────

export function isNarrativeLocked(className) {
  return (getNarrative(className)?.status || 'draft') === 'locked';
}

/**
 * Locks or unlocks a class's narratives. Admin only — firestore.rules is the
 * actual boundary; a teacher calling this is rejected server-side.
 */
export async function setNarrativeLock(className, locked, meta = {}) {
  const docId = narrativeDocId(className);
  const existing = getNarrative(className);
  if (!existing) throw new Error('Nothing has been written for this class yet.');
  const now = new Date().toISOString();
  const payload = {
    ...existing,
    status: locked ? 'locked' : 'draft',
    lockedBy: locked ? (meta.lockedBy || null) : null,
    updated_at: now,
    persistedAt: now
  };
  const cache = readCache();
  cache[docId] = payload;
  writeCache(cache);
  await setDoc(doc(db, COLLECTION, docId), payload);
  return payload;
}
