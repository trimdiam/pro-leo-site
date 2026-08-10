// READ-ONLY. Full inventory of what is sitting on the Class III-X Final Term
// marks docs, to separate genuine FT data from Half-Yearly state that leaked
// across via the dual-writes in markentry.js.
// Deletes/writes NOTHING.
// Run: node scripts/audit-ft-contamination.js

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('../serviceAccountKey.json')) });
const db = admin.firestore();

const CLASSES = ['III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const isBlank = v => v === undefined || v === null || v === '';

(async () => {
  const totals = {
    docs: 0,
    staleSubmitted: 0, realSubmitted: 0,
    ftRemarkPresent: 0, hyRemarkOnFtDoc: 0,
    ftRankPresent: 0, hyRankOnFtDoc: 0,
    adminDecision: 0,
    academicsAny: 0, academicsSubjects: {},
    coT2Filled: 0, coT1OnFtDoc: 0,
    ftAttendance: 0, hyAttendanceOnFtDoc: 0,
    statuses: {}
  };
  const perClass = {};
  const fieldSeen = {};

  for (const cls of CLASSES) {
    const snap = await db.collection('marks').doc(`${cls}_FT`).collection('students').get();
    const c = perClass[cls] = {
      docs: snap.size, staleSubmitted: 0, realSubmitted: 0, academicsAny: 0,
      coT2Filled: 0, ftAttendance: 0, ftRemark: 0, ftRank: 0, adminDecision: 0
    };

    snap.forEach(d => {
      const x = d.data();
      totals.docs++;
      Object.keys(x).forEach(k => { fieldSeen[k] = (fieldSeen[k] || 0) + 1; });
      totals.statuses[x.status || '(none)'] = (totals.statuses[x.status || '(none)'] || 0) + 1;

      // submittedSubjects: stale if flagged submitted but no FT content behind it
      const ss = x.submittedSubjects || {}, co = x.coScholastic || {}, ac = x.academics || {};
      for (const [k, v] of Object.entries(ss)) {
        if (!v || v.status !== 'submitted') continue;
        const hasT2 = !isBlank((co[k] || {}).T2);
        const hasAcad = ac[k] && Object.keys(ac[k]).length > 0;
        if (hasT2 || hasAcad) { totals.realSubmitted++; c.realSubmitted++; }
        else { totals.staleSubmitted++; c.staleSubmitted++; }
      }

      // academics on an FT doc = real Final Term marks (should be none yet)
      if (Object.keys(ac).length) {
        totals.academicsAny++; c.academicsAny++;
        Object.keys(ac).forEach(k => totals.academicsSubjects[k] = (totals.academicsSubjects[k] || 0) + 1);
      }

      // coScholastic: T2 is FT's own; T1 present on an FT doc is HY leakage
      for (const v of Object.values(co)) {
        if (!isBlank(v.T2)) { totals.coT2Filled++; c.coT2Filled++; }
        if (!isBlank(v.T1)) totals.coT1OnFtDoc++;
      }

      const rem = x.remarks || {};
      if (!isBlank(rem.finalTerm))  { totals.ftRemarkPresent++; c.ftRemark++; }
      if (!isBlank(rem.halfYearly)) totals.hyRemarkOnFtDoc++;

      const rk = x.rank || {};
      if (rk.ftRank) { totals.ftRankPresent++; c.ftRank++; }
      if (rk.hyRank) totals.hyRankOnFtDoc++;

      if (!isBlank(x.adminDecision)) { totals.adminDecision++; c.adminDecision++; }

      const at = x.attendance || {};
      if (at.ftPresent || at.ftTotal) { totals.ftAttendance++; c.ftAttendance++; }
      if (at.hyPresent || at.hyTotal) totals.hyAttendanceOnFtDoc++;
    });
  }

  console.log('=== FIELDS PRESENT ON FT DOCS (doc counts) ===');
  Object.entries(fieldSeen).sort((a, b) => b[1] - a[1])
    .forEach(([k, n]) => console.log(`  ${k.padEnd(20)} ${n}`));

  console.log('\n=== PER CLASS ===');
  console.log('cls   docs  staleSub  realSub  academics  coT2  ftAtt  ftRemark  ftRank  adminDec');
  for (const cls of CLASSES) {
    const c = perClass[cls];
    console.log(
      cls.padEnd(6) + String(c.docs).padStart(4) + String(c.staleSubmitted).padStart(10) +
      String(c.realSubmitted).padStart(9) + String(c.academicsAny).padStart(11) +
      String(c.coT2Filled).padStart(6) + String(c.ftAttendance).padStart(7) +
      String(c.ftRemark).padStart(10) + String(c.ftRank).padStart(8) +
      String(c.adminDecision).padStart(10));
  }

  console.log('\n=== TOTALS ===');
  console.log('docs                       :', totals.docs);
  console.log('statuses                   :', JSON.stringify(totals.statuses));
  console.log('STALE submitted flags      :', totals.staleSubmitted, '  <- to clear');
  console.log('real submitted flags       :', totals.realSubmitted);
  console.log('docs with FT academics     :', totals.academicsAny,
              Object.keys(totals.academicsSubjects).length
                ? JSON.stringify(totals.academicsSubjects) : '');
  console.log('coScholastic T2 filled     :', totals.coT2Filled);
  console.log('coScholastic T1 on FT doc  :', totals.coT1OnFtDoc, '(expected - shared store, read by report card)');
  console.log('FT remark present          :', totals.ftRemarkPresent, '  <- stale if >0 before entry');
  console.log('HY remark on FT doc        :', totals.hyRemarkOnFtDoc, '(expected - dual-write)');
  console.log('ftRank present             :', totals.ftRankPresent, '  <- stale if >0 before entry');
  console.log('hyRank on FT doc           :', totals.hyRankOnFtDoc, '(expected - dual-write)');
  console.log('adminDecision on FT doc    :', totals.adminDecision, '  <- carries last year/term promotion call');
  console.log('FT attendance entered      :', totals.ftAttendance);
  console.log('HY attendance on FT doc    :', totals.hyAttendanceOnFtDoc, '(expected - shared store)');

  process.exit(0);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
