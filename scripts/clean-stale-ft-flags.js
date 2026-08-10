// Clears stale "submitted" flags from the Class III-X FINAL TERM marks docs.
//
// Cause: markentry.js wrote submittedSubjects to BOTH term docs when a
// co-scholastic (grade) subject was submitted. Submitting a Half-Yearly grade
// therefore also marked that subject "Submitted" for Final Term. When FT opened
// on 2026-08-10 those subjects showed as already submitted with no T2 grade
// behind them, and inflated the class teacher's FT review progress. The write
// itself is fixed in markentry.js; this clears the residue.
//
// A flag is STALE only when the subject has no Final Term content behind it:
// no coScholastic[key].T2 and no academics[key]. Anything real is left alone,
// so this stays safe if teachers start entering marks before it runs.
//
// HALF-YEARLY IS NEVER TOUCHED. Every write target is asserted to end in "_FT"
// before the batch is built; the script aborts if that assertion ever fails.
//
// Dry run (default):  node scripts/clean-stale-ft-flags.js
// Apply:              node scripts/clean-stale-ft-flags.js --apply

const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../serviceAccountKey.json')) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const CLASSES = ['III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const isBlank = v => v === undefined || v === null || v === '';

(async () => {
  console.log(APPLY ? '*** APPLY MODE — writes are real ***\n'
                    : '--- DRY RUN — nothing is written (pass --apply to commit) ---\n');

  const backup = { takenAt: new Date().toISOString(), docs: {} };
  const ops = [];
  const perClass = {};
  let kept = 0;

  for (const cls of CLASSES) {
    const parentId = `${cls}_FT`;

    // Hard guard: this script must never address a Half-Yearly document.
    if (!parentId.endsWith('_FT')) {
      console.error(`ABORT: refusing to touch non-FT document "${parentId}"`);
      process.exit(1);
    }

    const snap = await db.collection('marks').doc(parentId).collection('students').get();
    const tally = {};

    snap.forEach(d => {
      const x  = d.data();
      const ss = x.submittedSubjects || {};
      const co = x.coScholastic || {};
      const ac = x.academics || {};
      const staleKeys = [];

      for (const [k, v] of Object.entries(ss)) {
        if (!v || v.status !== 'submitted') continue;
        const hasT2   = !isBlank((co[k] || {}).T2);
        const hasAcad = ac[k] && Object.keys(ac[k]).length > 0;
        if (hasT2 || hasAcad) { kept++; continue; }
        staleKeys.push(k);
        tally[k] = (tally[k] || 0) + 1;
      }

      if (!staleKeys.length) return;

      backup.docs[`${parentId}/${d.id}`] = staleKeys.reduce((o, k) => (o[k] = ss[k], o), {});

      const update = {};
      for (const k of staleKeys) {
        update[`submittedSubjects.${k}`] = admin.firestore.FieldValue.delete();
      }
      ops.push({ ref: d.ref, update, n: staleKeys.length });
    });

    perClass[cls] = tally;
    const keys = Object.keys(tally);
    console.log(`${cls.padEnd(5)} ${keys.length ? keys.map(k => `${k}:${tally[k]}`).join('  ') : '(nothing stale)'}`);
  }

  const totalFlags = ops.reduce((n, o) => n + o.n, 0);
  console.log(`\ndocs to update : ${ops.length}`);
  console.log(`flags to clear : ${totalFlags}`);
  console.log(`real flags kept: ${kept}`);

  // Second guard: verify every resolved path really is under a _FT parent.
  const bad = ops.filter(o => !o.ref.path.includes('_FT/'));
  if (bad.length) {
    console.error(`ABORT: ${bad.length} write target(s) are not Final Term docs. Example: ${bad[0].ref.path}`);
    process.exit(1);
  }
  console.log(`path check     : all ${ops.length} targets are under a _FT document`);

  if (!APPLY) { console.log('\nDry run complete. Nothing written.'); process.exit(0); }
  if (!ops.length) { console.log('\nNothing to do.'); process.exit(0); }

  const dir = path.join(__dirname, 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `clean-stale-ft-flags-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 2), 'utf8');
  console.log(`\nBackup written: ${file}`);

  let done = 0;
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(o => batch.update(o.ref, o.update));
    await batch.commit();
    done += Math.min(400, ops.length - i);
    process.stdout.write(`\r  committed ${done}/${ops.length} docs`);
  }
  console.log(`\n\nDone. ${totalFlags} stale flags cleared across ${done} Final Term docs. Half Yearly untouched.`);
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
