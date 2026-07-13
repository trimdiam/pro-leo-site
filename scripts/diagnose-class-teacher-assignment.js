// scripts/diagnose-class-teacher-assignment.js
// READ-ONLY. Checks how Class I / Class II class-teacher assignments resolve,
// since app-logic.js hides the whole "class review" card if _currentTeacherClass
// ends up empty. Writes/deletes NOTHING.
// Run: node scripts/diagnose-class-teacher-assignment.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TA_ROMAN_TO_NUM = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const _R2N = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };

(async () => {
  console.log('=== All teachers with role=class_teacher ===');
  const snap = await db.collection('teachers').where('role', '==', 'class_teacher').get();
  console.log(`Found ${snap.size} class_teacher doc(s):\n`);
  snap.forEach(d => {
    const t = d.data();
    const ctOf = t.classTeacherOf || '';
    const ctRoman = ctOf.split('-')[0];
    const resolvedViaClassNum = (ctRoman && TA_ROMAN_TO_NUM[ctRoman]) || null; // path used at app-logic.js:12990 (classNum)
    const resolvedViaEffectiveClass = _R2N[ctRoman] || parseInt(ctRoman) || t.classTeacher || ''; // path used at app-logic.js:5586-5595 (_currentTeacherClass)
    console.log(`[${d.id}] name=${t.name} classTeacher(raw)=${JSON.stringify(t.classTeacher)} classTeacherOf=${JSON.stringify(t.classTeacherOf)}`);
    console.log(`    -> classNum (line ~12990 path) resolves to: ${resolvedViaClassNum}`);
    console.log(`    -> _currentTeacherClass (line ~5595 path) resolves to: ${JSON.stringify(resolvedViaEffectiveClass)}`);
    console.log('');
  });

  console.log('=== Also checking users collection for tpClassTeacherOf overrides ===');
  const usersSnap = await db.collection('users').where('role', '==', 'class_teacher').get();
  console.log(`Found ${usersSnap.size} users doc(s) with role=class_teacher:\n`);
  usersSnap.forEach(d => {
    const u = d.data();
    console.log(`[${d.id}] name=${u.name} classTeacherOf=${JSON.stringify(u.classTeacherOf)} tpClassTeacherOf=${JSON.stringify(u.tpClassTeacherOf)}`);
  });

  process.exit(0);
})().catch(err => { console.error('ERROR:', err); process.exit(1); });
