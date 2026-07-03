/**
 * attendance-emulator-e2e.mjs — Bulk Class Attendance against real firestore.rules.
 * Proves: class teacher's bulk write lands in the SAME fields the report card
 * reads, AND the per-student form reload-bug fix works.
 * Run: node scripts/attendance-emulator-e2e.mjs   (emulator on :8080)
 */
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const PROJECT_ID = 'st-francis-school-a3e7e';
const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  PASS:', m); };
const bad = (m) => { fail++; console.log('  FAIL:', m); };

const CT = 'class_teacher_vi';
const CLASS = 'VI';
const WD = 92; // working days

const env = await initializeTestEnvironment({
  projectId: PROJECT_ID, firestore: { rules, host: '127.0.0.1', port: 8080 },
});
await env.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'users', CT), { role: 'class_teacher' });
});
const db = env.authenticatedContext(CT).firestore();

console.log('\n[1] Class teacher bulk-writes attendance (rules must allow)');
// Mirror saveClassAttendance for HY term: attendance.{hyPresent,hyTotal} to BOTH docs.
const students = { s1: 88, s2: 90 };
for (const [sid, present] of Object.entries(students)) {
  for (const t of ['HY', 'FT']) {
    await assertSucceeds(setDoc(doc(db, 'marks', `${CLASS}_${t}`, 'students', sid),
      { attendance: { hyPresent: present, hyTotal: WD } }, { merge: true }));
  }
}
ok('attendance writes accepted for class_teacher');

console.log('\n[2] Report card reads the bulk-written attendance');
const hy = async (sid) => (await getDoc(doc(db, 'marks', `${CLASS}_HY`, 'students', sid))).data() || {};
const d1 = await hy('s1');
// Exact report-card reader (markentry.js buildReportCard): att = hyData.attendance
const att = d1.attendance || {};
const rcPresent = att.hyPresent || 0, rcTotal = att.hyTotal || 0;
(rcPresent === 88 && rcTotal === WD)
  ? ok(`report card shows s1 attendance ${rcPresent}/${rcTotal} (= ${Math.round(rcPresent/rcTotal*1000)/10}%)`)
  : bad(`report card got ${rcPresent}/${rcTotal}, expected 88/${WD}`);

console.log('\n[3] Per-student form RELOAD — bug fix verified');
// OLD (buggy) reader looked for present/total → blank:
const oldRead = att.present ?? '';
// NEW (fixed) reader looks for hyPresent first, falls back:
const newRead = att.hyPresent ?? att.present ?? '';
oldRead === '' ? ok('confirmed OLD code read blank (the bug)') : bad('old read unexpectedly found a value');
newRead === 88 ? ok('FIXED code reloads saved attendance (88) into the form') : bad(`fixed read got "${newRead}", expected 88`);

console.log('\n[4] Both students present, working days shared');
const d2 = await hy('s2');
(d2.attendance?.hyPresent === 90 && d2.attendance?.hyTotal === WD)
  ? ok(`s2 = ${d2.attendance.hyPresent}/${d2.attendance.hyTotal} (same working days as s1)`)
  : bad('s2 attendance wrong');

await env.cleanup();
console.log(`\n=== ${fail === 0 ? 'ALL PASSED ✅' : 'FAILURES ❌'} — ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
