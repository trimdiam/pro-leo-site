// scripts/check-classtest-vs-reportcard.js
// READ-ONLY. Checks whether Class I/II report_cards were generated before or
// after the matching class_test_marks doc existed, to see if the 30% class-test
// blend in report-card-builder.js was actually applied or silently skipped.
// Run: node scripts/check-classtest-vs-reportcard.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLASSES = ['Class I', 'Class II'];
const TERMS = ['HY1', 'HY2'];

(async () => {
  console.log('--- report_cards for Class I / Class II ---');
  const rcSnap = await db.collection('report_cards').get();
  const reportCards = [];
  rcSnap.forEach(d => {
    const data = d.data();
    if (CLASSES.includes(data.className || data.class)) {
      reportCards.push({ id: d.id, ...data });
    }
  });
  console.log(`Found ${reportCards.length} report_cards docs for Class I/II`);

  console.log('\n--- class_test_marks docs ---');
  const ctSnap = await db.collection('class_test_marks').get();
  const classTests = {};
  ctSnap.forEach(d => {
    classTests[d.id] = d.data();
  });
  console.log(`Found ${ctSnap.size} class_test_marks docs total`);
  console.log('IDs:', Object.keys(classTests).join(', ') || '(none)');

  console.log('\n--- Cross-check ---');
  for (const rc of reportCards) {
    const term = rc.term;
    const className = (rc.className || rc.class || '').replace(/\s+/g, '_');
    // report-card-builder.js docIds classTest as `${term}_${className}_${subjectId}`
    const matchingCT = Object.keys(classTests).filter(id => id.startsWith(`${term}_${className}_`));
    const generatedAt = rc.generatedAt || rc.createdAt || rc.updatedAt || '(unknown)';
    console.log(`report_cards/${rc.id} | student=${rc.studentId} | term=${term} | class=${rc.className || rc.class} | status=${rc.status} | generatedAt=${JSON.stringify(generatedAt)}`);
    if (matchingCT.length) {
      matchingCT.forEach(id => {
        const ct = classTests[id];
        console.log(`   -> matching class_test_marks/${id} | savedAt=${JSON.stringify(ct.savedAt || ct.createdAt || '(unknown)')} | marks for this student present: ${ct.marks && rc.studentId in (ct.marks || {})}`);
      });
    } else {
      console.log('   -> NO matching class_test_marks doc found for this term/class (would have used 100% assessment average, no blend)');
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
