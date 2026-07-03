// scripts/inspect-marks-detail.js
// READ-ONLY. For the marks docs that exist in IX/X, reports how many contain
// ANY non-null mark value vs. being empty drafts. Deletes NOTHING.
// Run: node scripts/inspect-marks-detail.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const TARGETS = ['IX_HY', 'X_HY', 'X_FT'];

function hasRealMarks(data) {
  const ac = data.academics || {};
  for (const subj of Object.keys(ac)) {
    const fields = ac[subj] || {};
    for (const k of Object.keys(fields)) {
      const v = fields[k];
      if (v !== null && v !== undefined && v !== '' && k !== 'total') return true;
      if (k === 'total' && v !== null && v !== undefined && v !== '') return true;
    }
  }
  return false;
}

(async () => {
  for (const t of TARGETS) {
    const snap = await db.collection('marks').doc(t).collection('students').get();
    let withMarks = 0, empty = 0;
    const subjectSet = new Set();
    const withMarksIds = [];
    snap.forEach(d => {
      const data = d.data();
      Object.keys(data.academics || {}).forEach(s => subjectSet.add(s));
      if (hasRealMarks(data)) { withMarks++; withMarksIds.push(d.id); } else empty++;
    });
    console.log(`marks/${t}: ${snap.size} docs | ${empty} empty-draft | ${withMarks} with real marks`);
    console.log(`   subjects seen: [${[...subjectSet].join(', ') || '(none)'}]`);
    if (withMarksIds.length) console.log(`   docs WITH marks: ${withMarksIds.join(', ')}`);
    console.log('');
  }
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
