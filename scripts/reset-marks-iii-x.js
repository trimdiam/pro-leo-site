// scripts/reset-marks-iii-x.js
// DESTRUCTIVE. Clears test marks for classes III–X (terms HY, FT) so teachers
// start fresh. Backs every doc up to a local JSON file BEFORE deleting, then:
//   1. deletes each marks/{class}_{term}/students/* doc
//   2. deletes the parent marks/{class}_{term} doc (resets lock/status)
//   3. re-reads to verify the subcollections are empty.
// Run: node scripts/reset-marks-iii-x.js

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CLASSES = ['III','IV','V','VI','VII','VIII','IX','X'];
const TERMS = ['HY', 'FT'];

(async () => {
  const backup = { project: serviceAccount.project_id, takenAt: new Date().toISOString(), docs: [] };
  const toDelete = []; // { parentId, studentRef }

  // 1. Collect + back up
  for (const cls of CLASSES) {
    for (const term of TERMS) {
      const parentId = `${cls}_${term}`;
      const col = db.collection('marks').doc(parentId).collection('students');
      const snap = await col.get();
      snap.forEach(d => {
        backup.docs.push({ path: `marks/${parentId}/students/${d.id}`, data: d.data() });
        toDelete.push({ parentId, id: d.id });
      });
    }
  }

  const backupFile = path.join(__dirname, `marks-backup-${Date.now()}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`Backed up ${backup.docs.length} doc(s) -> ${backupFile}\n`);

  if (toDelete.length === 0) { console.log('Nothing to delete.'); process.exit(0); }

  // 2. Delete student docs in batches of 400
  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 400) {
    const chunk = toDelete.slice(i, i + 400);
    const batch = db.batch();
    chunk.forEach(({ parentId, id }) =>
      batch.delete(db.collection('marks').doc(parentId).collection('students').doc(id)));
    await batch.commit();
    deleted += chunk.length;
    console.log(`Deleted ${deleted}/${toDelete.length} student mark-docs...`);
  }

  // 3. Delete parent docs (resets any locked status). No-op if absent.
  for (const cls of CLASSES) {
    for (const term of TERMS) {
      await db.collection('marks').doc(`${cls}_${term}`).delete().catch(() => {});
    }
  }

  // 4. Verify empty
  let remaining = 0;
  for (const cls of CLASSES) {
    for (const term of TERMS) {
      const s = await db.collection('marks').doc(`${cls}_${term}`).collection('students').get();
      remaining += s.size;
    }
  }
  console.log(`\nDONE. Deleted ${deleted} doc(s). Remaining across III–X: ${remaining} (should be 0).`);
  console.log(`Restore source if ever needed: ${backupFile}`);
  process.exit(0);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
