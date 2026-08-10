// READ-ONLY audit. Answers two questions before opening Final Term for Class III-X:
//   1. How many teacher assignment rows would a HY->FT change touch, and for which classes?
//   2. Is Half Yearly actually already locked for Class III-X, or are there open records?
// Deletes/writes NOTHING.
// Run: node scripts/audit-term-open-3-10.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const ROMAN = { III:3, IV:4, V:5, VI:6, VII:7, VIII:8, IX:9, X:10 };
const TARGET = Object.keys(ROMAN);

function classNumOf(classId) {
  if (!classId) return null;
  const head = String(classId).split('-')[0].trim().toUpperCase();
  return ROMAN[head] ?? (parseInt(head, 10) || null);
}

(async () => {
  // ── 1. TEACHER ASSIGNMENTS ────────────────────────────────────────────────
  console.log('=== TEACHER ASSIGNMENTS ===');
  const teachers = await db.collection('teachers').get();
  let docsWithAssigns = 0, totalRows = 0, inScope = 0, outOfScope = 0;
  const byTerm = {}, byClass = {}, affectedTeachers = [];

  teachers.forEach(d => {
    const t = d.data();
    const assigns = t.assignments || [];
    if (!assigns.length) return;
    docsWithAssigns++;
    let touched = 0;
    assigns.forEach(a => {
      totalRows++;
      const term = a.term || 'HY';
      byTerm[term] = (byTerm[term] || 0) + 1;
      const classId = a.classId || (a.class ? `${a.class}-${a.section || 'A'}` : '');
      const n = classNumOf(classId);
      if (n && n >= 3 && n <= 10) {
        inScope++;
        byClass[n] = (byClass[n] || 0) + 1;
        if (term === 'HY') touched++;
      } else {
        outOfScope++;
      }
    });
    if (touched) affectedTeachers.push({ id: d.id, name: t.name || t.teacherId || '(unnamed)', rows: touched });
  });

  console.log(`teacher docs with assignments : ${docsWithAssigns} / ${teachers.size}`);
  console.log(`assignment rows total         : ${totalRows}`);
  console.log(`  in scope (class 3-10)       : ${inScope}`);
  console.log(`  out of scope                : ${outOfScope}`);
  console.log(`rows by term                  :`, byTerm);
  console.log(`in-scope rows by class        :`, byClass);
  console.log(`\nteachers whose HY rows would change: ${affectedTeachers.length}`);
  affectedTeachers
    .sort((a, b) => b.rows - a.rows)
    .forEach(t => console.log(`  ${String(t.rows).padStart(3)} rows  ${t.name}  (${t.id})`));

  // ── 2. MIRRORED COPIES ON users/* ─────────────────────────────────────────
  console.log('\n=== users/* MIRROR (tpAssignments) ===');
  const users = await db.collection('users').get();
  let mirrorDocs = 0, mirrorRows = 0, mirrorHY = 0;
  users.forEach(d => {
    const rows = d.data().tpAssignments || [];
    if (!rows.length) return;
    mirrorDocs++;
    rows.forEach(a => {
      mirrorRows++;
      const n = classNumOf(a.classId || (a.class ? `${a.class}-${a.section || 'A'}` : ''));
      if (n >= 3 && n <= 10 && (a.term || 'HY') === 'HY') mirrorHY++;
    });
  });
  console.log(`user docs with tpAssignments  : ${mirrorDocs}`);
  console.log(`mirror rows total             : ${mirrorRows}`);
  console.log(`  in-scope HY rows to change  : ${mirrorHY}`);

  // ── 3. HALF-YEARLY LOCK STATE, CLASS III-X ────────────────────────────────
  console.log('\n=== HALF YEARLY LOCK STATE (Class III-X) ===');
  console.log('class  students  locked  draft/none  other');
  let anyUnlocked = 0;
  for (const cls of TARGET) {
    const snap = await db.collection('marks').doc(`${cls}_HY`).collection('students').get();
    let locked = 0, draft = 0;
    const other = new Set();
    snap.forEach(d => {
      const s = d.data().status;
      if (s === 'locked') locked++;
      else if (!s || s === 'draft') draft++;
      else other.add(s);
    });
    anyUnlocked += draft + other.size;
    console.log(
      `${cls.padEnd(6)} ${String(snap.size).padStart(8)} ${String(locked).padStart(7)} ` +
      `${String(draft).padStart(11)}  ${[...other].join(',') || '-'}`
    );
  }
  console.log(anyUnlocked === 0
    ? '\n=> HY is fully locked for III-X. Nothing to lock.'
    : `\n=> ${anyUnlocked} HY records are NOT locked and would be changed by a lock pass.`);

  // ── 4. EXISTING FT DATA (would opening FT collide with anything?) ─────────
  console.log('\n=== EXISTING FINAL TERM DATA (Class III-X) ===');
  for (const cls of TARGET) {
    const snap = await db.collection('marks').doc(`${cls}_FT`).collection('students').get();
    let withMarks = 0, locked = 0;
    snap.forEach(d => {
      const data = d.data();
      if (data.academics && Object.keys(data.academics).length) withMarks++;
      if (data.status === 'locked') locked++;
    });
    console.log(`${cls.padEnd(6)} docs=${String(snap.size).padStart(4)}  with-marks=${String(withMarks).padStart(4)}  locked=${locked}`);
  }

  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
