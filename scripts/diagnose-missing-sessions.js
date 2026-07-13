// scripts/diagnose-missing-sessions.js
// READ-ONLY. Investigates the reported missing-submission complaint:
// Science Class I (week 3 & 4, May) and Hindi Class II submissions that
// never appeared in the class teacher's review. Writes/deletes NOTHING.
// Run: node scripts/diagnose-missing-sessions.js

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

(async () => {
  console.log('=== 1. Rollover lock state ===');
  const lockSnap = await db.doc('settings/rollover_lock').get();
  if (!lockSnap.exists) {
    console.log('settings/rollover_lock: does not exist (never set) — writes were never blocked by this.');
  } else {
    console.log('settings/rollover_lock:', JSON.stringify(lockSnap.data()));
  }

  console.log('\n=== 2. All assessment_sessions for Class I, subject Science (May) ===');
  const sciSnap = await db.collection('assessment_sessions')
    .where('session.class', '==', 'Class I')
    .where('session.subject_id', '==', 'SCI')
    .get();
  console.log(`Found ${sciSnap.size} Science/Class I session doc(s) total (all dates):`);
  sciSnap.forEach(d => {
    const s = d.data().session || {};
    console.log(`  [${d.id}] status=${s.status} date=${s.date} weekStart=${s.weekStart} weekEnd=${s.weekEnd} teacher=${s.teacher_name} updated_at=${s.updated_at}`);
  });

  console.log('\n=== 3. All assessment_sessions for Class II, subject Hindi ===');
  const hinSnap = await db.collection('assessment_sessions')
    .where('session.class', '==', 'Class II')
    .where('session.subject_id', '==', 'HIN')
    .get();
  console.log(`Found ${hinSnap.size} Hindi/Class II session doc(s) total (all dates):`);
  hinSnap.forEach(d => {
    const s = d.data().session || {};
    console.log(`  [${d.id}] status=${s.status} date=${s.date} weekStart=${s.weekStart} weekEnd=${s.weekEnd} teacher=${s.teacher_name} updated_at=${s.updated_at}`);
  });

  console.log('\n=== 4. Sanity check: any Class I session at all in May 2026? ===');
  const mayClass1 = await db.collection('assessment_sessions')
    .where('session.class', '==', 'Class I')
    .get();
  let mayCount = 0;
  mayClass1.forEach(d => {
    const s = d.data().session || {};
    if ((s.weekStart || s.date || '').startsWith('2026-05')) {
      mayCount++;
      console.log(`  [${d.id}] subject=${s.subject_id} status=${s.status} date=${s.date} weekStart=${s.weekStart} weekEnd=${s.weekEnd}`);
    }
  });
  console.log(`Total Class I sessions with a May 2026 date: ${mayCount}`);

  console.log('\n=== 5. Sanity check: any Class II session at all (any month)? ===');
  const class2Snap = await db.collection('assessment_sessions')
    .where('session.class', '==', 'Class II')
    .get();
  console.log(`Total Class II sessions (any subject/date): ${class2Snap.size}`);
  class2Snap.forEach(d => {
    const s = d.data().session || {};
    console.log(`  [${d.id}] subject=${s.subject_id} status=${s.status} date=${s.date}`);
  });

  console.log('\n=== 6. SKG / LKG sanity check (same architecture, does the bug reach them too?) ===');
  for (const cls of ['SKG', 'LKG']) {
    const snap = await db.collection('assessment_sessions').where('session.class', '==', cls).get();
    console.log(`Total ${cls} sessions: ${snap.size}`);
    snap.forEach(d => {
      const s = d.data().session || {};
      console.log(`  [${d.id}] subject=${s.subject_id} status=${s.status} date=${s.date} weekStart=${s.weekStart}`);
    });
  }

  console.log('\nDone. No writes performed.');
  process.exit(0);
})().catch(err => { console.error('ERROR:', err); process.exit(1); });
