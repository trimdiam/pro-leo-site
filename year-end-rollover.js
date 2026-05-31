// year-end-rollover.js
// ─────────────────────────────────────────────────────────────────────────────
// Year-End Rollover engine for St. Francis De Sales School.
//
// Purpose: at the close of an academic session (e.g. 2026-27), safely move the
// year forward to the next session (e.g. 2027-28):
//   1. Backup     — confirm a full Firestore export exists (manual gate).
//   2. Archive    — copy session-bound academic data into archive_<year>/*.
//   3. Promote    — advance each student's class; Class X → alumni.
//   4. Clear      — wipe the now-archived live academic collections.
//   5. New session— create the next academicSessions doc, active:true.
//
// STEP-1 SCOPE (this file, for now): READ-ONLY. It only knows the config and can
// build a DRY-RUN preview that COUNTS what each step would touch. No writes.
// Destructive steps (archive/promote/clear) are added in the next step.
// ─────────────────────────────────────────────────────────────────────────────

import {
  collection, getDocs, getCountFromServer, doc, getDoc, setDoc, writeBatch, query, where
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const BATCH_LIMIT = 400; // Firestore hard cap is 500 ops/batch; stay clear of it.

// ── Class progression ────────────────────────────────────────────────────────
// Students' `class` field (written by the #sf-class dropdown in index.html) is
// stored as the codes "PLG" (Play Group), "LKG", "SKG" for pre-primary, and as
// Arabic numerals "1".."10" for Class I-X. Roman numerals appear only in report
// cards / teacher-assignment UI, never in students.class. Map normalized → next.
export const ROMAN = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const TERMS = ['HY', 'FT'];

// Ordered educational progression of normalized class keys (PLG → LKG → SKG →
// 1 → … → 10). Last entry (Class 10 / X) graduates to alumni.
const PROGRESSION = ['PLG', 'LKG', 'SKG', '1','2','3','4','5','6','7','8','9','10'];

function normClass(raw) {
  return String(raw == null ? '' : raw).trim().toUpperCase();
}

// Returns { next: <string|null>, graduate: <bool> }. next=null when unknown.
export function nextClass(raw) {
  const key = normClass(raw);
  const i = PROGRESSION.indexOf(key);
  if (i === -1) return { next: null, graduate: false };       // unrecognised
  if (i === PROGRESSION.length - 1) return { next: null, graduate: true }; // Class X
  return { next: PROGRESSION[i + 1], graduate: false };
}

// ── Collection plan ──────────────────────────────────────────────────────────
// Session-bound academic data: archived to archive_<year>/* then cleared.
// `report_cards` is moved too (kept under archive, not lost) so the new year
// starts with a clean live collection.
export const ACADEMIC_FLAT = [
  'report_cards',
  'attendance_daily',
  'attendance_monthly',
  'assessment_sessions',
  'monthly_analytics',
  'weak_students',
  'student_profiles',
  'homework',
  'leave_applications',
];

// Counters reset (cleared) but not archived — purely transient.
export const RESET_COLLECTIONS = ['admin_notifications'];

// Never touched by the rollover (shown in preview as "untouched" for assurance).
export const KEEP_COLLECTIONS = [
  'teachers', 'subjects', 'classes', 'settings',
  'fee_structure', 'fee_transactions', 'fees',
  'users', 'announcements', 'notices', 'events', 'gallery',
  'why_choose_us', 'school_leaders', 'quotes',
];

// ── Counting helpers ─────────────────────────────────────────────────────────
async function safeCount(db, path) {
  try {
    const snap = await getCountFromServer(collection(db, path));
    return snap.data().count;
  } catch (e) {
    return 0; // collection may not exist
  }
}

// marks live under marks/{ROMAN}_{TERM}/students — count across all class/terms.
async function countMarks(db) {
  let total = 0;
  const breakdown = {};
  for (const cls of ROMAN) {
    for (const term of TERMS) {
      const path = `marks/${cls}_${term}/students`;
      const n = await safeCount(db, path);
      if (n > 0) { breakdown[`${cls}_${term}`] = n; total += n; }
    }
  }
  return { total, breakdown };
}

// ── Promotion plan (read-only) ───────────────────────────────────────────────
// Builds the proposed class movements. Detention is read from each student's
// report card finalStatus when available; otherwise everyone is promoted.
async function buildPromotionPlan(db) {
  // Map studentId -> finalStatus from report_cards (single pass).
  const statusById = {};
  try {
    const rcSnap = await getDocs(collection(db, 'report_cards'));
    rcSnap.forEach(d => {
      const r = d.data();
      const sid = r.studentId || d.id;
      if (r.finalStatus) statusById[sid] = String(r.finalStatus).toUpperCase();
    });
  } catch (e) { /* no report cards — promote all */ }

  const plan = { promote: 0, detain: 0, graduate: 0, unknown: 0, byClass: {} };
  let total = 0;

  try {
    const sSnap = await getDocs(collection(db, 'students'));
    sSnap.forEach(d => {
      total++;
      const s = d.data();
      const sid = s.studentId || d.id;
      const fromKey = normClass(s.class);
      const status = statusById[sid] || '';
      const { next, graduate } = nextClass(s.class);

      let action;
      if (status === 'DETAINED') { action = 'detain'; plan.detain++; }
      else if (graduate)         { action = 'graduate'; plan.graduate++; }
      else if (next === null)    { action = 'unknown'; plan.unknown++; }
      else                       { action = 'promote'; plan.promote++; }

      const bucket = plan.byClass[fromKey] || (plan.byClass[fromKey] = {
        promote: 0, detain: 0, graduate: 0, unknown: 0, next: next,
      });
      bucket[action]++;
    });
  } catch (e) { /* students unreadable */ }

  plan.totalStudents = total;
  return plan;
}

// ── Public: build full dry-run preview ───────────────────────────────────────
// Returns a structured report object. Performs NO writes. `fromYear`/`toYear`
// are display labels, e.g. "2026-27" / "2027-28".
export async function buildPreview(db, fromYear, toYear) {
  const report = {
    fromYear, toYear,
    archiveTarget: `archive_${fromYear}`,
    promotion: await buildPromotionPlan(db),
    marks: await countMarks(db),
    academic: {},
    reset: {},
    keep: {},
    generatedAt: new Date().toISOString(),
  };

  for (const c of ACADEMIC_FLAT)    report.academic[c] = await safeCount(db, c);
  for (const c of RESET_COLLECTIONS) report.reset[c]   = await safeCount(db, c);
  for (const c of KEEP_COLLECTIONS)  report.keep[c]    = await safeCount(db, c);

  // Totals for headline summary.
  report.totalArchiveDocs =
    report.marks.total +
    Object.values(report.academic).reduce((a, n) => a + n, 0);
  report.totalResetDocs =
    Object.values(report.reset).reduce((a, n) => a + n, 0);

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 — ARCHIVE ENGINE  (copy-only; never modifies or deletes the source)
//
// Each source collection is copied to a year-namespaced top-level collection:
//     report_cards            → archive_<year>_report_cards
//     attendance_daily        → archive_<year>_attendance_daily   ...etc
// marks live under marks/{class}_{term}/students and are flattened into one
// collection, with the original location preserved in the doc id + metadata:
//     marks/III_HY/students/<sid> → archive_<year>_marks / III_HY__<sid>
//
// Every archived doc gets a `_archive` field recording where it came from, so a
// future restore (or audit) is unambiguous.
// ─────────────────────────────────────────────────────────────────────────────

// Sanitise a year label for use inside a collection name ("2026-27" is valid as
// a Firestore collection-name segment, but normalise whitespace just in case).
function yearTag(year) {
  return String(year).trim().replace(/\s+/g, '');
}

export function archiveCollectionName(year, source) {
  return `archive_${yearTag(year)}_${source}`;
}

export const ARCHIVE_MARKS_COLLECTION = (year) => `archive_${yearTag(year)}_marks`;

// Copy an array of {id, data} records into a target collection in safe batches.
// Returns the number of docs written. `meta` is merged into each doc under
// `_archive` so provenance is never lost.
async function copyRecords(db, records, targetCol, meta) {
  let written = 0;
  for (let i = 0; i < records.length; i += BATCH_LIMIT) {
    const slice = records.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const rec of slice) {
      batch.set(doc(db, targetCol, rec.id), {
        ...rec.data,
        _archive: { ...meta, sourceId: rec.id, at: new Date().toISOString() },
      });
    }
    await batch.commit();
    written += slice.length;
  }
  return written;
}

// Archive one flat top-level collection. Returns { source, read, written }.
async function archiveFlatCollection(db, source, year, onProgress) {
  const target = archiveCollectionName(year, source);
  let records;
  try {
    const snap = await getDocs(collection(db, source));
    records = snap.docs.map(d => ({ id: d.id, data: d.data() }));
  } catch (e) {
    onProgress && onProgress(`   ${source}: unreadable (${e.message}) — skipped`, 'red');
    return { source, read: 0, written: 0, error: e.message };
  }
  if (records.length === 0) {
    onProgress && onProgress(`   ${source}: 0 docs — nothing to copy`, 'dim');
    return { source, read: 0, written: 0 };
  }
  const written = await copyRecords(db, records, target,
    { sourceCollection: source, year: yearTag(year) });
  onProgress && onProgress(`   ${source} → ${target}: ${written} copied`, 'green');
  return { source, read: records.length, written };
}

// Archive all marks/{class}_{term}/students into one flattened collection.
async function archiveMarks(db, year, onProgress) {
  const target = ARCHIVE_MARKS_COLLECTION(year);
  let read = 0, written = 0;
  for (const cls of ROMAN) {
    for (const term of TERMS) {
      const path = `marks/${cls}_${term}/students`;
      let records;
      try {
        const snap = await getDocs(collection(db, path));
        records = snap.docs.map(d => ({
          id: `${cls}_${term}__${d.id}`,
          data: d.data(),
        }));
      } catch (e) { continue; } // subcollection may not exist
      if (records.length === 0) continue;
      read += records.length;
      written += await copyRecords(db, records, target,
        { sourceCollection: 'marks', sourcePath: path, classTerm: `${cls}_${term}`, year: yearTag(year) });
      onProgress && onProgress(`   marks/${cls}_${term}: ${records.length} copied`, 'green');
    }
  }
  if (read === 0) onProgress && onProgress(`   marks: 0 docs — nothing to copy`, 'dim');
  else onProgress && onProgress(`   marks → ${target}: ${written} total`, 'green');
  return { source: 'marks', read, written };
}

// Orchestrate the full archive. onProgress(msg, cssClass) streams log lines.
// Returns { results: [...], totalWritten, target }.
export async function runArchive(db, year, onProgress) {
  onProgress && onProgress(`Archiving session ${year} → archive_${yearTag(year)}_*`, 'cyan');
  const results = [];

  onProgress && onProgress(`\nmarks (flattened):`, 'yellow');
  results.push(await archiveMarks(db, year, onProgress));

  for (const source of ACADEMIC_FLAT) {
    onProgress && onProgress(`\n${source}:`, 'yellow');
    results.push(await archiveFlatCollection(db, source, year, onProgress));
  }

  const totalWritten = results.reduce((a, r) => a + (r.written || 0), 0);
  return { results, totalWritten };
}

// Re-count every archive collection and compare against the live source counts.
// Returns { ok, rows: [{ name, expected, archived, ok }] }. Used to gate the
// next (destructive) step — Clear stays locked unless ok === true.
export async function verifyArchive(db, year, preview) {
  const rows = [];

  // marks: expected from preview.marks.total
  rows.push({
    name: 'marks',
    expected: preview.marks.total,
    archived: await safeCount(db, ARCHIVE_MARKS_COLLECTION(year)),
  });

  for (const source of ACADEMIC_FLAT) {
    rows.push({
      name: source,
      expected: preview.academic[source] || 0,
      archived: await safeCount(db, archiveCollectionName(year, source)),
    });
  }

  rows.forEach(r => { r.ok = r.archived >= r.expected; });
  const ok = rows.every(r => r.ok);
  return { ok, rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 — PROMOTE ENGINE  (modifies the students collection)
//
//   • PROMOTED student → class advances one step, academicYear = <toYear>.
//   • DETAINED student → class unchanged, academicYear = <toYear> (repeats).
//   • Class 10 / X graduate → copied to `alumni`, then removed from `students`.
//   • unknown class      → left untouched and reported (manual fix needed).
//
// Roll numbers are deliberately NOT reassigned — that mixes promoted-in and
// detained pupils and is an office decision; do it manually after rollover.
// Safe to run only after the archive is verified, and recoverable from the
// Step-1 backup if needed.
// ─────────────────────────────────────────────────────────────────────────────

const ALUMNI_COLLECTION = 'alumni';

// Execute a list of {type:'set'|'update'|'delete', ref, data?} ops in batches.
async function runBatched(db, ops, onProgress) {
  let done = 0;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const slice = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of slice) {
      if (op.type === 'set')         batch.set(op.ref, op.data);
      else if (op.type === 'update') batch.update(op.ref, op.data);
      else if (op.type === 'delete') batch.delete(op.ref);
    }
    await batch.commit();
    done += slice.length;
    onProgress && onProgress(`   …committed ${done}/${ops.length} write op(s)`, 'dim');
  }
}

// Promote all students. Returns { promoted, detained, graduated, unknown, total }.
export async function runPromotion(db, fromYear, toYear, onProgress) {
  // DETAINED status comes from each student's report card finalStatus.
  const statusById = {};
  try {
    const rc = await getDocs(collection(db, 'report_cards'));
    rc.forEach(d => {
      const r = d.data();
      const sid = r.studentId || d.id;
      if (r.finalStatus) statusById[sid] = String(r.finalStatus).toUpperCase();
    });
  } catch (e) { /* no report cards — promote all */ }

  const sSnap = await getDocs(collection(db, 'students'));
  const ops = [];
  const summary = { promoted: 0, detained: 0, graduated: 0, unknown: 0, total: sSnap.size };
  const stamp = new Date().toISOString();

  sSnap.forEach(d => {
    const s = d.data();
    const sid = s.studentId || d.id;
    const status = statusById[sid] || '';
    const { next, graduate } = nextClass(s.class);
    const ref = doc(db, 'students', d.id);

    if (status === 'DETAINED') {                      // repeats current class
      ops.push({ type: 'update', ref, data: {
        academicYear: toYear, promotionStatus: 'DETAINED', updatedAt: stamp } });
      summary.detained++;
    } else if (graduate) {                            // Class 10 → alumni
      ops.push({ type: 'set', ref: doc(db, ALUMNI_COLLECTION, d.id), data: {
        ...s, graduatedFrom: fromYear, graduatedClass: s.class, movedAt: stamp } });
      ops.push({ type: 'delete', ref });
      summary.graduated++;
    } else if (next === null) {                       // unrecognised — skip
      summary.unknown++;
    } else {                                          // normal promotion
      ops.push({ type: 'update', ref, data: {
        class: next, previousClass: s.class, academicYear: toYear,
        promotionStatus: 'PROMOTED', updatedAt: stamp } });
      summary.promoted++;
    }
  });

  onProgress && onProgress(
    `Prepared ${ops.length} write op(s) across ${summary.total} student(s).`, 'dim');
  await runBatched(db, ops, onProgress);

  // Sync users.class to match the promoted students.class.
  // users docs are keyed by Firebase Auth UID and have a `studentId` field.
  // We query in chunks of 30 (Firestore `in` limit) across all studentIds.
  onProgress && onProgress(`\nSyncing users collection…`, 'cyan');
  const newClassBySid = {};
  (await getDocs(collection(db, 'students'))).forEach(d => {
    const s = d.data();
    const sid = s.studentId || d.id;
    newClassBySid[sid] = s.class || '';
  });
  const sids = Object.keys(newClassBySid);
  const userOps = [];
  for (let i = 0; i < sids.length; i += 30) {
    const chunk = sids.slice(i, i + 30);
    const uSnap = await getDocs(query(collection(db, 'users'), where('studentId', 'in', chunk)));
    uSnap.forEach(d => {
      const sid = d.data().studentId;
      const newClass = newClassBySid[sid];
      if (newClass !== undefined) {
        userOps.push({ type: 'update', ref: doc(db, 'users', d.id), data: { class: newClass } });
      }
    });
  }
  if (userOps.length > 0) {
    await runBatched(db, userOps, onProgress);
    onProgress && onProgress(`   users synced: ${userOps.length} doc(s) updated`, 'green');
  } else {
    onProgress && onProgress(`   users: no linked accounts found`, 'dim');
  }

  return summary;
}

// Re-read students and confirm the promotion landed cleanly.
// ok === true means no non-detained graduate remains in `students` and users are synced.
export async function verifyPromotion(db, toYear) {
  const sSnap = await getDocs(collection(db, 'students'));
  let onNewYear = 0, leftover = 0, stuckGraduates = 0;
  const classBySid = {};
  sSnap.forEach(d => {
    const s = d.data();
    const sid = s.studentId || d.id;
    classBySid[sid] = s.class || '';
    if (s.academicYear === toYear) onNewYear++; else leftover++;
    const { graduate } = nextClass(s.class);
    if (graduate && s.promotionStatus !== 'DETAINED') stuckGraduates++;
  });
  const alumni = await safeCount(db, ALUMNI_COLLECTION);

  // Check users are in sync
  const sids = Object.keys(classBySid);
  let usersOutOfSync = 0;
  for (let i = 0; i < sids.length; i += 30) {
    const chunk = sids.slice(i, i + 30);
    const uSnap = await getDocs(query(collection(db, 'users'), where('studentId', 'in', chunk)));
    uSnap.forEach(d => {
      const u = d.data();
      if (u.class !== classBySid[u.studentId]) usersOutOfSync++;
    });
  }

  return {
    ok: stuckGraduates === 0 && usersOutOfSync === 0,
    total: sSnap.size, onNewYear, leftover, stuckGraduates, alumni, usersOutOfSync,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 — CLEAR & RESET ENGINE  (deletes data — the point of no return)
//
// Deletes the live academic collections that were archived in Step 2, plus the
// transient counters, so the new session starts empty. Before deleting ANYTHING
// it re-runs verifyArchive — if a single archive count falls short, the whole
// operation aborts and nothing is deleted. Gated behind a verified promotion.
// ─────────────────────────────────────────────────────────────────────────────

// Delete every doc in a flat collection. Returns the number deleted.
async function deleteCollectionDocs(db, path) {
  let snap;
  try { snap = await getDocs(collection(db, path)); }
  catch (e) { return 0; } // missing collection
  const ops = snap.docs.map(d => ({ type: 'delete', ref: doc(db, path, d.id) }));
  await runBatched(db, ops);
  return ops.length;
}

// Clear marks: delete every students subcollection doc, then the parent
// marks/{class}_{term} doc so its lock/status resets for the new year.
async function clearMarks(db, onProgress) {
  let deleted = 0;
  for (const cls of ROMAN) {
    for (const term of TERMS) {
      const n = await deleteCollectionDocs(db, `marks/${cls}_${term}/students`);
      if (n > 0) {
        deleted += n;
        onProgress && onProgress(`   marks/${cls}_${term}: ${n} deleted`, 'green');
      }
      // Remove the parent doc (resets any "locked" status). No-op if absent.
      try { await runBatched(db, [{ type: 'delete', ref: doc(db, 'marks', `${cls}_${term}`) }]); }
      catch (e) { /* ignore */ }
    }
  }
  return deleted;
}

// Orchestrate clear. SAFETY: aborts before any delete if the archive no longer
// matches. Returns { aborted, verify?, totalDeleted, resetDeleted }.
export async function runClear(db, year, preview, onProgress) {
  onProgress && onProgress(`Re-verifying archive before deletion…`, 'cyan');
  const verify = await verifyArchive(db, year, preview);
  if (!verify.ok) {
    onProgress && onProgress(`✗ Archive verification FAILED — aborting. Nothing deleted.`, 'red');
    verify.rows.filter(r => !r.ok).forEach(r =>
      onProgress && onProgress(`   ${r.name}: live ${r.expected} > archived ${r.archived}`, 'red'));
    return { aborted: true, verify };
  }
  onProgress && onProgress(`✓ Archive re-verified — safe to delete.\n`, 'green');

  let totalDeleted = 0;
  onProgress && onProgress(`marks:`, 'yellow');
  totalDeleted += await clearMarks(db, onProgress);

  for (const source of ACADEMIC_FLAT) {
    const n = await deleteCollectionDocs(db, source);
    totalDeleted += n;
    onProgress && onProgress(`   ${source}: ${n} deleted`, n ? 'green' : 'dim');
  }

  let resetDeleted = 0;
  onProgress && onProgress(`\nreset counters (not archived — transient):`, 'yellow');
  for (const source of RESET_COLLECTIONS) {
    const n = await deleteCollectionDocs(db, source);
    resetDeleted += n;
    onProgress && onProgress(`   ${source}: ${n} cleared`, n ? 'green' : 'dim');
  }

  return { aborted: false, totalDeleted, resetDeleted };
}

// Confirm every cleared collection is now empty. ok === true when all are 0.
export async function verifyClear(db) {
  const rows = [];
  rows.push({ name: 'marks', remaining: (await countMarks(db)).total });
  for (const s of ACADEMIC_FLAT)     rows.push({ name: s, remaining: await safeCount(db, s) });
  for (const s of RESET_COLLECTIONS) rows.push({ name: s, remaining: await safeCount(db, s) });
  rows.forEach(r => { r.ok = r.remaining === 0; });
  return { ok: rows.every(r => r.ok), rows };
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 — OPEN NEW SESSION
//
// Deactivates any currently-active academicSessions doc and creates (or updates)
// the new session as active, so the app's session dropdown points at the new
// year. Indian academic year runs April → March, derived from the toYear label.
// Idempotent: re-running just re-asserts the same doc.
// ─────────────────────────────────────────────────────────────────────────────

const ACADEMIC_SESSIONS = 'academicSessions';

export async function openNewSession(db, fromYear, toYear, onProgress) {
  const label = String(toYear).trim();
  const id = label.replace(/\s+/g, '');

  // Flip any existing active sessions to inactive.
  const snap = await getDocs(collection(db, ACADEMIC_SESSIONS));
  const ops = [];
  snap.forEach(d => {
    if (d.data().active) ops.push({
      type: 'update', ref: doc(db, ACADEMIC_SESSIONS, d.id), data: { active: false } });
  });
  if (ops.length) {
    await runBatched(db, ops);
    onProgress && onProgress(`Deactivated ${ops.length} previous active session(s).`, 'dim');
  }

  // Derive April→March span from the leading year in the label (e.g. "2027-28").
  const startYear = parseInt(label.slice(0, 4), 10) || new Date().getFullYear();
  const data = {
    label,
    startDate: `${startYear}-04-01`,
    endDate: `${startYear + 1}-03-31`,
    active: true,
    createdAt: new Date().toISOString(),
    rolledOverFrom: String(fromYear).trim(),
  };
  await setDoc(doc(db, ACADEMIC_SESSIONS, id), data, { merge: true });
  onProgress && onProgress(
    `Created session "${label}" (${data.startDate} → ${data.endDate}), marked active.`, 'green');

  return { id, ...data, deactivated: ops.length };
}

// Confirm exactly one session is active and it is the new one.
export async function verifyNewSession(db, toYear) {
  const label = String(toYear).trim();
  const snap = await getDocs(collection(db, ACADEMIC_SESSIONS));
  const active = [];
  snap.forEach(d => { if (d.data().active) active.push(d.data().label || d.id); });
  return { ok: active.length === 1 && active[0] === label, active };
}
