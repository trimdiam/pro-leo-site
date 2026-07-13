import { persistSession, fetchSessions, fetchSession, normalizeSession } from './firestore-service.js';

const STORAGE_KEY = 'sfds_assessment_sessions';

// ── Local cache helpers ───────────────────────────────────────────────────────

export function getAllSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(entry => ({ ...entry, session: normalizeSession(entry.session) }));
  } catch {
    return [];
  }
}

function writeLocalCache(sessions) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    throw new Error('Failed to save session: storage may be full');
  }
}

// ── Firestore sync ────────────────────────────────────────────────────────────

// Called once on app init — pulls all sessions from Firestore into localStorage.
export async function syncSessionsFromFirestore() {
  try {
    const remote = await fetchSessions();
    if (remote.length === 0) return;

    // Firestore is the source of truth — overwrite local cache entirely,
    // including any leftover demo_/drillDemo_ sessions from local generation.
    writeLocalCache(remote);
  } catch (err) {
    console.warn('Firestore sync failed, using local cache:', err.message);
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

function buildEntryAndWriteLocal(session, marks) {
  if (!session || !session.session_id) throw new Error('Invalid session');

  const entry = {
    session: { ...session, updated_at: new Date().toISOString() },
    marks: marks || {},
    saved_at: new Date().toISOString()
  };

  const sessions = getAllSessions();
  const idx = sessions.findIndex(s => s.session.session_id === session.session_id);
  if (idx >= 0) {
    sessions[idx] = entry;
  } else {
    sessions.push(entry);
  }
  writeLocalCache(sessions);

  return entry;
}

// Fire-and-forget save — local write is immediate, Firestore write happens in
// the background. Used for autosave, where blocking on the network every
// ~30s would hurt UX and a missed sync just gets picked up by the next tick.
export function saveSession(session, marks) {
  const entry = buildEntryAndWriteLocal(session, marks);

  persistSession(entry.session, entry.marks)
    .then(() => refreshProfilesForSession(entry.session, entry.marks))
    .catch(err => console.error('Firestore save failed:', err.message));

  return entry;
}

// Awaited save — local write is still immediate, but the caller gets the real
// Firestore outcome instead of finding out never. Use this for any action
// that tells the teacher "submitted" / "saved" — autosave should keep using
// saveSession() above so it doesn't block typing on network latency.
export async function saveSessionAndConfirm(session, marks) {
  const entry = buildEntryAndWriteLocal(session, marks);

  try {
    await persistSession(entry.session, entry.marks);
    refreshProfilesForSession(entry.session, entry.marks);
    return { ok: true, entry };
  } catch (err) {
    return { ok: false, entry, error: err.message || 'Could not reach the server.' };
  }
}

// ── Dynamic profile refresh ─────────────────────────────────────────────────
// Triggered after every Firestore save so student_profiles in Firestore — read
// by pro-leo-site — always reflects the latest assessment data, not a stale
// snapshot. Debounced to one run every 5s to absorb autosave bursts.

let _lastProfileRefresh = 0;
let _pendingRefresh = null;
const PROFILE_REFRESH_DEBOUNCE_MS = 5000;

function refreshProfilesForSession(session, marks) {
  const studentIds = Object.keys(marks || {});
  if (!studentIds.length || !session?.class) return;

  const now = Date.now();
  const elapsed = now - _lastProfileRefresh;

  if (elapsed < PROFILE_REFRESH_DEBOUNCE_MS) {
    // A refresh ran recently — schedule one for the remaining window.
    if (_pendingRefresh) return;
    _pendingRefresh = setTimeout(() => {
      _pendingRefresh = null;
      runProfileRefresh(session.class, studentIds);
    }, PROFILE_REFRESH_DEBOUNCE_MS - elapsed);
    return;
  }

  runProfileRefresh(session.class, studentIds);
}

async function runProfileRefresh(className, studentIds) {
  _lastProfileRefresh = Date.now();
  try {
    const { clearAggregationCache } = await import('./aggregation-engine.js');
    const { getStudentProfile }     = await import('./student-profile-engine.js');
    clearAggregationCache();
    for (const studentId of studentIds) {
      try {
        await getStudentProfile(studentId, className);
      } catch (err) {
        console.warn(`Profile refresh skipped for ${studentId}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('Profile refresh module load failed:', err.message);
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getSession(sessionId) {
  if (!sessionId) return null;
  return getAllSessions().find(s => s.session.session_id === sessionId) || null;
}

export async function getSessionRemote(sessionId) {
  if (!sessionId) return null;
  try {
    return await fetchSession(sessionId);
  } catch {
    return getSession(sessionId);
  }
}

// ── Delete ────────────────────────────────────────────────────────────────────

// Per security rules, sessions are never hard-deleted — use status transitions.
export function deleteSession(sessionId) {
  const sessions = getAllSessions().filter(s => s.session.session_id !== sessionId);
  try {
    writeLocalCache(sessions);
  } catch (err) {
    console.error('Failed to delete session from cache', err);
  }
}

// ── Storage health ────────────────────────────────────────────────────────────

export function getStorageUsageKB() {
  let total = 0;
  for (const key of Object.keys(localStorage)) {
    total += (localStorage.getItem(key) || '').length;
  }
  return Math.round(total / 1024);
}

export function archiveOldSessions(keepMonths = 3) {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - keepMonths);
  const sessions = getAllSessions().filter(s => {
    const d = new Date(s.session.date);
    return d >= cutoff || s.session.status === 'draft';
  });
  writeLocalCache(sessions);
}

// ── Duplicate check ───────────────────────────────────────────────────────────

export function findDuplicateSession({ teacher_name, class: className, subject_id, date }) {
  if (!teacher_name || !className || !subject_id || !date) return null;
  return getAllSessions().find(s =>
    s.session.teacher_name === teacher_name &&
    s.session.class === className &&
    s.session.subject_id === subject_id &&
    s.session.date === date
  ) || null;
}
