// scripts/diagnose-test-account.js
// READ-ONLY. Looks up the TEST teacher account so we know its role/class
// before logging in with it — need to know blast radius before writing
// anything through it. Writes/deletes NOTHING.
// Run: node scripts/diagnose-test-account.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  console.log('=== teachers collection: teacherId/loginId = TEST (case variants) ===');
  for (const id of ['TEST', 'test', 'Test']) {
    const snap = await db.collection('teachers').where('teacherId', '==', id).get();
    snap.forEach(d => console.log(`[teachers/${d.id}] teacherId=${id}`, JSON.stringify(d.data())));
    const snap2 = await db.collection('teachers').where('loginId', '==', id).get();
    snap2.forEach(d => console.log(`[teachers/${d.id}] loginId=${id}`, JSON.stringify(d.data())));
  }

  console.log('\n=== users collection: teacherId/loginId = TEST (case variants) ===');
  for (const id of ['TEST', 'test', 'Test']) {
    const snap = await db.collection('users').where('teacherId', '==', id).get();
    snap.forEach(d => console.log(`[users/${d.id}] teacherId=${id}`, JSON.stringify(d.data())));
    const snap2 = await db.collection('users').where('loginId', '==', id).get();
    snap2.forEach(d => console.log(`[users/${d.id}] loginId=${id}`, JSON.stringify(d.data())));
  }

  process.exit(0);
})().catch(err => { console.error('ERROR:', err); process.exit(1); });
