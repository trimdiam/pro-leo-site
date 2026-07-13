import { persistClassTest, fetchClassTests, fetchClassTest } from './firestore-service.js';

const STORAGE_KEY = 'sfds_class_test_marks';

function testId(term, className, subjectId) {
  return `${term}_${String(className).replace(/\s+/g, '_')}_${subjectId}`;
}

// ── Local cache helpers ───────────────────────────────────────────────────────

export function getAllClassTests() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalCache(tests) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tests));
  } catch (err) {
    throw new Error('Failed to save class test: storage may be full');
  }
}

// ── Firestore sync ────────────────────────────────────────────────────────────

export async function syncClassTestsFromFirestore() {
  try {
    const remote = await fetchClassTests();
    if (remote.length === 0) return;
    writeLocalCache(remote);
  } catch (err) {
    console.warn('Class test Firestore sync failed, using local cache:', err.message);
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

function buildTestEntryAndWriteLocal(test, marks) {
  if (!test || !test.class || !test.subject_id || !test.term) {
    throw new Error('Invalid class test: class, subject_id and term are required');
  }

  const id = testId(test.term, test.class, test.subject_id);
  const entry = {
    test: { ...test, test_id: id, updated_at: new Date().toISOString() },
    marks: marks || {},
    saved_at: new Date().toISOString()
  };

  const tests = getAllClassTests();
  const idx = tests.findIndex(t => t.test.test_id === id);
  if (idx >= 0) {
    tests[idx] = entry;
  } else {
    tests.push(entry);
  }
  writeLocalCache(tests);

  return entry;
}

// Fire-and-forget — kept for callers that don't need confirmation.
export function saveClassTest(test, marks) {
  const entry = buildTestEntryAndWriteLocal(test, marks);
  persistClassTest(entry.test, entry.marks).catch(err =>
    console.error('Class test Firestore save failed:', err.message)
  );
  return entry;
}

// Awaited — class test entry has no separate "submit" step (unlike weekly
// assessment sessions), so Save IS the final commit here. The teacher must
// see the real outcome, same reasoning as saveSessionAndConfirm().
export async function saveClassTestAndConfirm(test, marks) {
  const entry = buildTestEntryAndWriteLocal(test, marks);
  try {
    await persistClassTest(entry.test, entry.marks);
    return { ok: true, entry };
  } catch (err) {
    return { ok: false, entry, error: err.message || 'Could not reach the server.' };
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export function getClassTest(term, className, subjectId) {
  const id = testId(term, className, subjectId);
  return getAllClassTests().find(t => t.test.test_id === id) || null;
}

export async function getClassTestRemote(term, className, subjectId) {
  try {
    const remote = await fetchClassTest(term, className, subjectId);
    if (remote) return remote;
  } catch {
    // fall through to local cache
  }
  return getClassTest(term, className, subjectId);
}
