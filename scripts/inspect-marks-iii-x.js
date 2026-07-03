// scripts/inspect-marks-iii-x.js
// READ-ONLY. Inventories marks for classes III–X (both terms HY, FT).
// Shows how many student mark-docs exist per class/term + a sample doc so we
// can confirm it's test data BEFORE deleting anything. Deletes NOTHING.
// Run: node scripts/inspect-marks-iii-x.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLASSES = ['III','IV','V','VI','VII','VIII','IX','X'];
const TERMS = ['HY', 'FT'];

(async () => {
  console.log(`Project: ${serviceAccount.project_id}`);
  console.log('Inventory of marks/{class}_{term}/students  (classes III–X)\n');

  let grandTotal = 0;
  let firstSample = null;

  for (const cls of CLASSES) {
    for (const term of TERMS) {
      const parentPath = `marks/${cls}_${term}`;
      const studentsCol = db.collection('marks').doc(`${cls}_${term}`).collection('students');
      const snap = await studentsCol.get();
      const parentDoc = await db.doc(parentPath).get();
      const parentFields = parentDoc.exists ? Object.keys(parentDoc.data() || {}) : [];

      if (snap.size > 0 || parentDoc.exists) {
        console.log(`${parentPath}  ->  ${snap.size} student doc(s)` +
          (parentDoc.exists ? `  | parent fields: [${parentFields.join(', ')}]` : '  | (no parent doc)'));
        grandTotal += snap.size;
        if (!firstSample && snap.size > 0) {
          firstSample = { path: `${parentPath}/students/${snap.docs[0].id}`, data: snap.docs[0].data() };
        }
      }
    }
  }

  console.log(`\nTOTAL student mark-docs across III–X: ${grandTotal}`);

  if (firstSample) {
    console.log(`\nSAMPLE doc: ${firstSample.path}`);
    console.log(JSON.stringify(firstSample.data, null, 2).slice(0, 2000));
  } else {
    console.log('\nNo student mark-docs found — nothing to clear.');
  }

  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
