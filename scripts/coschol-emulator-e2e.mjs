/**
 * coschol-emulator-e2e.mjs — End-to-end test of co-scholastic grade entry
 * against the REAL firestore.rules, running on the Firestore emulator.
 *
 * Proves the chain the app relies on:
 *   subject teacher (role) → writes coScholastic[key].{T1,T2} to marks docs
 *   → rules ALLOW it → round-trips → report-card reader surfaces the grade.
 *
 * Run: node scripts/coschol-emulator-e2e.mjs   (emulator must be running on :8080)
 */
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment, assertSucceeds, assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const PROJECT_ID = 'st-francis-school-a3e7e';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  PASS:', m); };
const bad = (m) => { fail++; console.log('  FAIL:', m); };

const TEACHER_UID = 'teacher_pe_01';
const CLASS = 'V';
const STUDENTS = [
  { id: 's1', name: 'Arjun Sharma',  rollNo: 1, class: '5' },
  { id: 's2', name: 'Neha Chauhan',  rollNo: 2, class: '5' },
];

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: { rules, host: '127.0.0.1', port: 8080 },
});

// ── Seed baseline data bypassing rules (admin-equivalent) ────────────────────
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  // The marks-write rule reads /users/{uid}.role → must be a teacher role.
  await setDoc(doc(db, 'users', TEACHER_UID), {
    role: 'subject_teacher', teacherId: 'T-PE', loginId: 'T-PE', name: 'PE Teacher',
  });
  await setDoc(doc(db, 'teachers', TEACHER_UID), {
    name: 'PE Teacher', role: 'subject_teacher', teacherId: 'T-PE',
    assignments: [{ class: CLASS, subjectKey: 'pe', subjectLabel: 'P.E.' }],
  });
  for (const s of STUDENTS) await setDoc(doc(db, 'students', s.id), s);
});
console.log('\n[seed] users/teachers/students written (rules bypassed).');

// ── As the subject teacher: write co-scholastic grades exactly like the grid ──
console.log('\n[1] Subject teacher writes co-scholastic grade — rules must ALLOW');
const teacher = env.authenticatedContext(TEACHER_UID).firestore();
const stamp = new Date();
// Mirror flushSaves/btnConfirmSubmit EXACTLY: each term's grid writes its slot
// (T1 for HY, T2 for FT) to BOTH the _HY and _FT docs, so any reader that picks
// hyData.coScholastic finds the full {T1,T2} set. The grade for s1 differs by
// term (HY=A, FT=O) to prove both slots independently.
const GRADES_BY_STUDENT = {
  s1: { HY: 'A', FT: 'O' },
  s2: { HY: 'B+', FT: 'B' },
};
for (const s of STUDENTS) {
  for (const enteredTerm of ['HY', 'FT']) {     // teacher opens HY grid, then FT grid
    const slot  = enteredTerm === 'HY' ? 'T1' : 'T2';
    const grade = GRADES_BY_STUDENT[s.id][enteredTerm];
    for (const t of ['HY', 'FT']) {             // app writes to BOTH term docs
      const ref = doc(teacher, 'marks', `${CLASS}_${t}`, 'students', s.id);
      await assertSucceeds(setDoc(ref, {
        coScholastic:      { pe: { [slot]: grade } },
        submittedSubjects: { pe: { by: TEACHER_UID, at: stamp, status: 'submitted' } },
        lastUpdatedBy: TEACHER_UID, lastUpdatedAt: stamp,
      }, { merge: true }));
    }
  }
}
ok('all co-scholastic writes accepted by firestore.rules (isTeacherAny)');

// ── Read back as staff and run the report-card reader logic ──────────────────
console.log('\n[2] Round-trip + report-card reader');
const hySnap = await getDoc(doc(teacher, 'marks', `${CLASS}_HY`, 'students', 's1'));
const ftSnap = await getDoc(doc(teacher, 'marks', `${CLASS}_FT`, 'students', 's1'));
const hyData = hySnap.data() || {}, ftData = ftSnap.data() || {};
// Exact reader used by render.js / markentry report card:
const csSrc = hyData.coScholastic || ftData.coScholastic || {};
const reportPE = { halfYearly: csSrc.pe?.T1 || '', finalTerm: csSrc.pe?.T2 || '' };
reportPE.halfYearly === 'A'
  ? ok(`report card reads s1 pe HY grade = "${reportPE.halfYearly}" (from Firestore)`)
  : bad(`expected HY grade A, got "${reportPE.halfYearly}"`);
reportPE.finalTerm === 'O'
  ? ok(`report card reads s1 pe FT grade = "${reportPE.finalTerm}" (both slots in one doc)`)
  : bad(`expected FT grade O, got "${reportPE.finalTerm}"`);
hyData.submittedSubjects?.pe?.status === 'submitted'
  ? ok('submission flag present → subject-teacher dashboard would show "Submitted"')
  : bad('submission flag missing');

// ── Negative: an unauthenticated user must NOT be able to write marks ─────────
console.log('\n[3] Negative control — rules are actually enforced');
const anon = env.unauthenticatedContext().firestore();
await assertFails(setDoc(doc(anon, 'marks', `${CLASS}_HY`, 'students', 's1'),
  { coScholastic: { pe: { T1: 'HACK' } } }, { merge: true }));
ok('unauthenticated co-scholastic write correctly REJECTED');

await env.cleanup();
console.log(`\n=== ${fail === 0 ? 'ALL PASSED ✅' : 'FAILURES ❌'} — ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
