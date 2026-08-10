// Opens Final Term mark entry for Class III-X.
//
// Two changes, both scoped strictly to classes 3-10:
//   1. teachers/{id}.assignments[] and users/{uid}.tpAssignments[]
//      -> rows with term 'HY' become term 'FT'. Out-of-scope rows
//         (SKG/LKG/I/II) are left exactly as they are.
//   2. marks/{ROMAN}_FT/students/* -> status 'locked' becomes 'draft',
//      so the entry grid is editable. These docs hold zero marks, so
//      nothing is overwritten.
//
// Half Yearly is already fully locked (63/63/59/48/50/44/44/38) and is
// NOT touched by this script.
//
// Dry run (default, writes nothing):  node scripts/open-final-term-3-10.js
// Apply:                              node scripts/open-final-term-3-10.js --apply
//
// Before applying, the current state of every doc it will modify is written
// to F:\11 HOUR\pro-leo-site\scripts\backups\ so the change can be reversed.

const fs   = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const ROMAN = { III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10 };
const TARGET_CLASSES = Object.keys(ROMAN);

function classNumOf(a) {
  const classId = a.classId || (a.class ? `${a.class}-${a.section || 'A'}` : '');
  if (!classId) return null;
  const head = String(classId).split('-')[0].trim().toUpperCase();
  return ROMAN[head] ?? (parseInt(head, 10) || null);
}
const inScope = a => { const n = classNumOf(a); return n >= 3 && n <= 10; };

function saveBackup(name, payload) {
  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${name}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

(async () => {
  console.log(APPLY ? '*** APPLY MODE — writes are real ***\n' : '--- DRY RUN — nothing is written (pass --apply to commit) ---\n');

  const backup = { takenAt: new Date().toISOString(), teachers: {}, users: {}, marks: {} };

  // ── 1. TEACHER ASSIGNMENTS ────────────────────────────────────────────────
  console.log('=== teachers/*.assignments ===');
  const teachers = await db.collection('teachers').get();
  const teacherWrites = [];

  teachers.forEach(d => {
    const data = d.data();
    const assigns = data.assignments || [];
    if (!assigns.length) return;

    let changed = 0;
    const next = assigns.map(a => {
      if (inScope(a) && (a.term || 'HY') === 'HY') { changed++; return { ...a, term: 'FT' }; }
      return a;
    });
    if (!changed) return;

    backup.teachers[d.id] = assigns;
    teacherWrites.push({ ref: d.ref, next });
    console.log(`  ${String(changed).padStart(3)} rows -> FT   ${data.name || data.teacherId || d.id}  (${d.id})`);
  });
  console.log(`  teacher docs to update: ${teacherWrites.length}`);

  // ── 2. users/* MIRROR ─────────────────────────────────────────────────────
  console.log('\n=== users/*.tpAssignments ===');
  const users = await db.collection('users').get();
  const userWrites = [];

  users.forEach(d => {
    const rows = d.data().tpAssignments || [];
    if (!rows.length) return;

    let changed = 0;
    const next = rows.map(a => {
      if (inScope(a) && (a.term || 'HY') === 'HY') { changed++; return { ...a, term: 'FT' }; }
      return a;
    });
    if (!changed) return;

    backup.users[d.id] = rows;
    userWrites.push({ ref: d.ref, next });
    console.log(`  ${String(changed).padStart(3)} rows -> FT   ${d.id}`);
  });
  console.log(`  user docs to update: ${userWrites.length}`);

  // ── 3. UNLOCK FINAL TERM RECORDS ──────────────────────────────────────────
  console.log('\n=== marks/{class}_FT/students — unlock ===');
  const markWrites = [];

  for (const cls of TARGET_CLASSES) {
    const snap = await db.collection('marks').doc(`${cls}_FT`).collection('students').get();
    let toUnlock = 0, hasMarks = 0;

    snap.forEach(d => {
      const data = d.data();
      if (data.academics && Object.keys(data.academics).length) hasMarks++;
      if (data.status === 'locked') {
        toUnlock++;
        backup.marks[`${cls}_FT/${d.id}`] = data.status;
        markWrites.push(d.ref);
      }
    });

    // Safety: this script is only meant to open an unstarted term. If real
    // marks already exist, unlocking is still safe (status only) but the
    // operator should know about it.
    console.log(`  ${cls.padEnd(5)} unlock ${String(toUnlock).padStart(3)} of ${String(snap.size).padStart(3)}` +
                (hasMarks ? `   !! ${hasMarks} already hold marks` : ''));
  }
  console.log(`  FT records to unlock: ${markWrites.length}`);

  // ── SUMMARY / COMMIT ──────────────────────────────────────────────────────
  console.log('\n=== SUMMARY ===');
  console.log(`teacher docs : ${teacherWrites.length}`);
  console.log(`user docs    : ${userWrites.length}`);
  console.log(`FT records   : ${markWrites.length}`);

  if (!APPLY) {
    console.log('\nDry run complete. Nothing was written. Re-run with --apply to commit.');
    process.exit(0);
  }

  const backupFile = saveBackup('open-final-term-3-10', backup);
  console.log(`\nBackup written: ${backupFile}`);

  let n = 0;
  const commit = async ops => {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = db.batch();
      ops.slice(i, i + 400).forEach(op => op(batch));
      await batch.commit();
      n += Math.min(400, ops.length - i);
      process.stdout.write(`\r  committed ${n} writes`);
    }
  };

  await commit([
    ...teacherWrites.map(w => b => b.update(w.ref, { assignments: w.next })),
    ...userWrites.map(w => b => b.update(w.ref, { tpAssignments: w.next })),
    ...markWrites.map(ref => b => b.update(ref, { status: 'draft' })),
  ]);

  console.log(`\n\nDone. ${n} writes committed.`);
  console.log('Final Term is now open for Class III-X. Half Yearly remains locked.');
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
