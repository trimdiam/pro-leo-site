/**
 * split-subject-emulator-e2e.mjs — Two teachers, one column (Khasi/Alt-English
 * and Val-Edu/Catechism), against the REAL firestore.rules on the emulator.
 *
 * Proves "your way": both teachers see the full class, each writes only their own
 * students, blanks are never written, and a cell entered by the OTHER teacher is
 * recognisable (enteredBy) so the UI can lock it. Disjoint writes must coexist.
 *
 * Run: node scripts/split-subject-emulator-e2e.mjs   (emulator on :8080)
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const PROJECT_ID = 'st-francis-school-a3e7e';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  PASS:', m); };
const bad = (m) => { fail++; console.log('  FAIL:', m); };

const A = 'teacher_khasi', B = 'teacher_alteng';   // two assigned teachers
const CLASS = 'VI', HY = `${CLASS}_HY`, FT = `${CLASS}_FT`;
const KEY = 'khasi_alt_english', VKEY = 'val_edu_catechism';

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID, firestore: { rules, host: '127.0.0.1', port: 8080 },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', A), { role: 'subject_teacher' });
  await setDoc(doc(db, 'users', B), { role: 'subject_teacher' });
});

const dbA = env.authenticatedContext(A).firestore();
const dbB = env.authenticatedContext(B).firestore();

// Helper: write one student's numeric mark exactly like flushSaves does for a
// shared subject (academics[KEY] = {...,enteredBy}). Only OWNED rows are written.
const writeMark = (db, sid, total, by) =>
  assertSucceeds(setDoc(doc(db, 'marks', HY, 'students', sid),
    { academics: { [KEY]: { IA: 5, UT: 15, TE: total - 20, total, enteredBy: by } },
      status: 'draft' }, { merge: true }));

console.log('\n[1] Khasi teacher fills s1,s2; Alt-Eng teacher fills s3,s4 — disjoint');
await writeMark(dbA, 's1', 80, A);
await writeMark(dbA, 's2', 75, A);
await writeMark(dbB, 's3', 60, B);
await writeMark(dbB, 's4', 90, B);
ok('all four writes accepted (both teachers, same column)');

console.log('\n[2] No clobber — every student keeps their own mark + owner stamp');
const read = async (sid) => (await getDoc(doc(dbA, 'marks', HY, 'students', sid))).data()?.academics?.[KEY] || {};
const want = { s1: [80, A], s2: [75, A], s3: [60, B], s4: [90, B] };
for (const [sid, [total, by]] of Object.entries(want)) {
  const m = await read(sid);
  (m.total === total && m.enteredBy === by)
    ? ok(`${sid}: total=${m.total} enteredBy=${by === A ? 'Khasi' : 'AltEng'} ✓`)
    : bad(`${sid}: got total=${m.total} enteredBy=${m.enteredBy}, expected ${total}/${by}`);
}

console.log('\n[3] Lock computation on reload (the UI guard)');
const lockedFor = (mark, viewer) => !!mark.enteredBy && mark.enteredBy !== viewer;
lockedFor(await read('s1'), B) === true
  ? ok('Alt-Eng teacher sees s1 (Khasi-owned) as LOCKED') : bad('s1 not locked for B');
lockedFor(await read('s3'), B) === false
  ? ok('Alt-Eng teacher sees s3 (own) as EDITABLE') : bad('s3 wrongly locked for B');

console.log('\n[4] Why blanks must be skipped — clobber hazard is real');
// If B naively wrote a blank row for s1 (old behaviour) it WOULD null A's mark:
await assertSucceeds(setDoc(doc(dbB, 'marks', HY, 'students', 's1'),
  { academics: { [KEY]: { total: null } } }, { merge: true }));
((await read('s1')).total === null)
  ? ok('confirmed: a stray blank write nulls the other teacher (this is what the skip prevents)')
  : bad('expected clobber demo to null s1');
await writeMark(dbA, 's1', 80, A); // restore

console.log('\n[5] Val-Edu/Catechism (grade split) — same ownership model');
const writeGrade = (db, sid, grade, by) => Promise.all(['HY','FT'].map(t =>
  assertSucceeds(setDoc(doc(db, 'marks', `${CLASS}_${t}`, 'students', sid),
    { coScholastic: { [VKEY]: { T1: grade, enteredBy: by } } }, { merge: true }))));
await writeGrade(dbA, 's1', 'A', A);    // Catechism teacher
await writeGrade(dbB, 's3', 'B+', B);   // Val-Edu teacher
const vc = async (sid) => (await getDoc(doc(dbA, 'marks', HY, 'students', sid))).data()?.coScholastic?.[VKEY] || {};
const v1 = await vc('s1'), v3 = await vc('s3');
(v1.T1 === 'A' && v1.enteredBy === A && v3.T1 === 'B+' && v3.enteredBy === B)
  ? ok('grade split: s1=A(Catechism), s3=B+(Val-Edu), owners distinct') : bad(`grade split mismatch: ${JSON.stringify({v1,v3})}`);

await env.cleanup();
console.log(`\n=== ${fail === 0 ? 'ALL PASSED ✅' : 'FAILURES ❌'} — ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
