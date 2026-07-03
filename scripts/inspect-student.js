// scripts/inspect-student.js — READ-ONLY. Looks up SFS260586 in students.
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  const id = 'SFS260586';
  const doc = await db.collection('students').doc(id).get();
  if (!doc.exists) { console.log(`students/${id}: NOT FOUND`); }
  else {
    const d = doc.data();
    const show = {};
    ['name','studentName','fullName','class','className','rollNo','admissionNo','status','session','active']
      .forEach(k => { if (d[k] !== undefined) show[k] = d[k]; });
    console.log(`students/${id}:`, JSON.stringify(show, null, 2));
  }
  // Also show one real X_HY marks doc for SFS260586 (subject -> sample value)
  const m = await db.doc('marks/X_HY/students/' + id).get();
  if (m.exists) {
    const ac = m.data().academics || {};
    const summary = {};
    Object.keys(ac).forEach(s => summary[s] = ac[s]);
    console.log(`\nmarks/X_HY/students/${id} academics:`, JSON.stringify(summary, null, 2).slice(0, 1500));
  }
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
