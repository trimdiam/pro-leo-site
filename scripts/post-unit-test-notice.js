// Posts the 2nd Unit Test routine notice to the `notices` collection.
//
// audience 'teachers' -> shows on the teacher dashboard notice widget only.
// Deliberately NOT 'all'/'both': the notifyNewNotice Cloud Function pushes to
// STUDENT devices for those audiences, and this routine is for teachers to
// hand out themselves ("Class Teachers are advised to share the routine to the
// students"). A teachers-audience notice sends no push.
//
// Dry run (default):  node scripts/post-unit-test-notice.js
// Apply:              node scripts/post-unit-test-notice.js --apply

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const now = new Date().toISOString();

const NOTICE = {
  title: 'Unit Test (Final Term) Routine — 07 to 22 September 2026',
  body: [
    'The routine for the Unit Test leading to the Final Examination 2026-27 is now published.',
    '',
    'Dates: 07-09-2026 to 22-09-2026',
    'Timing: 8:20 am – 9:55 am',
    'Classes: III to IX',
    '',
    'The full class-wise timetable is available in your portal under Exam Schedule, filtered to the classes you handle.',
    '',
    'Class Teachers are advised to share the routine with their students at the earliest.'
  ].join('\n'),
  audience: 'teachers',
  priority: 'Important',
  postedBy: 'School Administration',
  teacherId: '',
  class: '',
  postedAt: now,
  createdAt: now
};

(async () => {
  // Don't post the same notice twice if this is re-run.
  const existing = await db.collection('notices')
    .where('title', '==', NOTICE.title).get();
  if (!existing.empty) {
    console.log(`A notice with this exact title already exists (${existing.size}):`);
    existing.forEach(d => console.log(`  ${d.id}  postedAt=${d.data().postedAt}`));
    console.log('Nothing posted. Delete the existing doc first if you meant to replace it.');
    process.exit(0);
  }

  console.log(APPLY ? '*** APPLY MODE ***\n' : '--- DRY RUN (pass --apply to post) ---\n');
  console.log(JSON.stringify(NOTICE, null, 2));

  if (!APPLY) { console.log('\nNothing written.'); process.exit(0); }

  const ref = await db.collection('notices').add(NOTICE);
  console.log(`\nPosted. notices/${ref.id}`);
  console.log('Visible on the teacher dashboard notice widget. No push sent (audience is teachers).');
  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
