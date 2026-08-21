import { db } from './firebase-config.js';
import { collection, query, where, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// Canonical class name contract for the entire ecosystem.
// Display names (left) are used throughout assessment-app UI and session data.
// Firestore values (right) are stored in the students collection by pro-leo-site.
// Display name -> the value actually stored on the student doc's `class` field.
// 'Play Group' maps to 'PLG', which is what the office-side admission flow in
// app-logic.js has always written (its classLabel maps read PLG -> "Play Group"
// in ~20 places). The display name keeps the space for the same reason: it is
// the label the rest of the school already uses, and coScholasticDocId()
// derives the Firestore doc id from it, so a "Playgroup" spelling here would
// quietly write grades to a second, wrong document.
export const CLASS_MAP = {
  'Play Group': 'PLG',
  'LKG':      'LKG',
  'SKG':      'SKG',
  'Class I':  '1',
  'Class II': '2',
  'Class 9':  '9'
};

// Reverse of CLASS_MAP — converts Firestore-stored short form back to display name.
export const FIRESTORE_TO_DISPLAY_CLASS = Object.fromEntries(
  Object.entries(CLASS_MAP).map(([display, stored]) => [stored, display])
);

// Local JSON fallback paths (used if Firestore fetch fails)
const FALLBACK_FILES = {
  'Play Group': 'data/students/playgroup.json',
  'LKG':      'data/students/lkg.json',
  'SKG':      'data/students/skg.json',
  'Class I':  'data/students/class1.json',
  'Class II': 'data/students/class2.json',
  'Class 9':  'data/students/class9.json'
};

// A student who has left is off the roll: no marks, no attendance, no new report
// card. Departure is a flag (status:'left'), never a deletion — see
// student-status.js for why. Missing status means active: all 647 existing
// records predate the field, so this default must never be inverted.
//
// `includeInactive` exists for HISTORY, not convenience. Reviewing a session a
// departed pupil was marked in, or rendering a card already generated for them,
// still needs their name — hiding it there would make real saved marks look
// like they belonged to nobody.
export function isActiveStudent(record) {
  const s = record && record.status;
  return !s || String(s).toLowerCase() === 'active';
}

export async function loadStudentsForClass(className, { includeInactive = false } = {}) {
  const firestoreClass = CLASS_MAP[className];
  if (!firestoreClass) return [];

  try {
    const q = query(
      collection(db, 'students'),
      where('class', '==', firestoreClass),
      orderBy('rollNo')
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs
        .filter(d => includeInactive || isActiveStudent(d.data()))
        .map(d => normalizeStudent(d.data()));
    }
  } catch (err) {
    console.warn(`Firestore student fetch failed for ${className}, falling back to local JSON:`, err);
  }

  // Fallback to local JSON
  const path = FALLBACK_FILES[className];
  if (!path) return [];
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = normalizeStudents(data);
    // Same rule on the offline path, or a departed pupil reappears the moment
    // Firestore is unreachable.
    return includeInactive ? list : list.filter(isActiveStudent);
  } catch (err) {
    console.error(`Failed to load students for ${className}:`, err);
    return [];
  }
}

function normalizeStudent(s) {
  const rawId    = s.studentId  || s.student_id  || '';
  const rawClass = s.class      || '';
  const rawRoll  = s.rollNo     || s.roll_no     || '';

  if (!rawId) {
    console.warn('normalizeStudent: student record is missing a student_id', s);
  }

  return {
    student_id: rawId,
    full_name:  s.name      || s.full_name  || '',
    // Always resolve to display class name (e.g. 'Class I', not '1')
    class:      FIRESTORE_TO_DISPLAY_CLASS[rawClass] || rawClass,
    section:    s.section   || '',
    // Coerce to string so roll_no is always consistently typed
    roll_no:    rawRoll !== '' ? String(rawRoll) : '',
    gender:     s.gender    || '',
    dob:        s.dob       || '',
    age:        s.age       || ''
  };
}

export function normalizeStudents(students) {
  if (!Array.isArray(students)) return [];
  return students.map(normalizeStudent);
}
