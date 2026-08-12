// scripts/diagnose-assessment-gaps.js
// READ-ONLY. Writes and deletes NOTHING.
//
// Counts actual vs expected assessment coverage for every class the
// assessment-app serves (LKG, SKG, Class I, Class II), per subject, per
// fortnight, for a given term. Answers three questions the admin UI cannot:
//
//   1. Which fortnight slots have no session at all?
//   2. Which sessions exist but will NOT reach a report card — either because
//      nobody reviewed/locked them, or because their date range falls outside
//      the term window (the aggregator requires full containment).
//   3. Which sessions look fabricated — default-filled with one repeated value,
//      the failure mode that put 935 identical 4s into Class II Science.
//
// It also reports class_test_marks and coscholastic_marks presence per class.
//
// Subjects and co-scholastic entries are read from the live registries per
// Addendum B — nothing about the curriculum is hardcoded here.
//
// Run: node scripts/diagnose-assessment-gaps.js [--term HY1] [--class "Class I"]

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const APP = path.join(__dirname, '..', 'assessment-app');
const readJson = p => JSON.parse(fs.readFileSync(path.join(APP, p), 'utf8'));

// Mirrors CLASS_MAP in assessment-app/services/student-loader.js — display name
// on the left, the value the students collection actually stores on the right.
const CLASS_MAP = { 'LKG': 'LKG', 'SKG': 'SKG', 'Class I': '1', 'Class II': '2' };
const FALLBACK_ROSTER = {
  'LKG': 'data/students/lkg.json',
  'SKG': 'data/students/skg.json',
  'Class I': 'data/students/class1.json',
  'Class II': 'data/students/class2.json'
};

const args = process.argv.slice(2);
const argOf = name => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : null;
};
const TERM = (argOf('term') || 'HY1').toUpperCase();
const ONLY_CLASS = argOf('class');
const CLASSES = ONLY_CLASS ? [ONLY_CLASS] : Object.keys(CLASS_MAP);

// ── Term window ───────────────────────────────────────────────────────────────
// Replicates getTermDateRange() in assessment-app/services/report-card-grade-engine.js.
// Kept in sync deliberately: if that function changes, this diagnostic lies.
function getCurrentAcademicYear() {
  const now = new Date();
  const m = now.getMonth() + 1;
  const y = now.getFullYear();
  return m >= 4 ? `${y}-${String(y + 1).slice(2)}` : `${y - 1}-${String(y).slice(2)}`;
}

function getTermDateRange(term) {
  const now = new Date();
  const startYear = (now.getMonth() + 1) >= 4 ? now.getFullYear() : now.getFullYear() - 1;

  // One-off exception for 2026-27, confirmed with the school.
  if (getCurrentAcademicYear() === '2026-27') {
    return term === 'HY1'
      ? { dateFrom: `${startYear}-03-01`, dateTo: `${startYear}-06-30` }
      : { dateFrom: `${startYear}-07-01`, dateTo: `${startYear}-11-30` };
  }
  return term === 'HY1'
    ? { dateFrom: `${startYear}-04-01`, dateTo: `${startYear}-09-30` }
    : { dateFrom: `${startYear}-10-01`, dateTo: `${startYear + 1}-03-31` };
}

// The term window and the teaching fortnights are NOT the same range.
//
// For 2026-27 HY1 the window opens 2026-03-01 purely so that anything entered
// early is still picked up (see the comment in report-card-grade-engine.js) —
// but the school teaches six fortnights, April through June. Generating slots
// straight from the window would invent two permanent March gaps in every
// subject of every class and inflate every count in this report.
//
// So: containment is checked against the window, expected slots come from here.
// Sessions that land outside the expected range are still reported, never
// silently dropped.
function expectedSlotRange(term, dateFrom, dateTo) {
  if (getCurrentAcademicYear() === '2026-27' && term === 'HY1') {
    return { from: `${dateFrom.slice(0, 4)}-04-01`, to: dateTo };
  }
  return { from: dateFrom, to: dateTo };
}

// Fortnight slots: 1st-15th and 16th-end for every month in the range.
function fortnightsIn(dateFrom, dateTo) {
  const slots = [];
  const [fy, fm] = dateFrom.split('-').map(Number);
  const [ty, tm] = dateTo.split('-').map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    const mm = String(m).padStart(2, '0');
    const lastDay = new Date(y, m, 0).getDate();
    slots.push({ label: `${y}-${mm} 1st half`,  start: `${y}-${mm}-01`, end: `${y}-${mm}-15` });
    slots.push({ label: `${y}-${mm} 2nd half`, start: `${y}-${mm}-16`, end: `${y}-${mm}-${lastDay}` });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return slots;
}

// ── Data loading ──────────────────────────────────────────────────────────────
async function loadRoster(className) {
  const stored = CLASS_MAP[className];
  if (stored) {
    const snap = await db.collection('students').where('class', '==', stored).get();
    if (!snap.empty) {
      return { source: 'firestore', ids: snap.docs.map(d => d.data().studentId || d.id) };
    }
  }
  const file = FALLBACK_ROSTER[className];
  if (!file) return { source: 'none', ids: [] };
  const arr = readJson(file);
  return { source: 'local JSON fallback', ids: arr.map(s => s.studentId || s._docId) };
}

// Backward compat, same rule as normalizeSession() in firestore-service.js:
// legacy sessions have no weekStart/weekEnd and use `date` for both.
function windowOf(s) {
  return { start: s.weekStart || s.date, end: s.weekEnd || s.date };
}

// A session reaches a report card only if it is reviewed/locked AND fully
// contained in the term window. Aggregator: `start < dateFrom || end > dateTo`.
function containment(s, dateFrom, dateTo) {
  const { start, end } = windowOf(s);
  if (!start || !end) return 'no-dates';
  if (start < dateFrom || end > dateTo) return 'outside';
  return 'inside';
}

const COUNTS = st => (st === 'reviewed' || st === 'locked');

// Detects the default-fill pattern: every recorded criterion value across every
// student identical. Real fortnight marks are never uniform at this scale.
function fabricationCheck(marks) {
  const values = [];
  Object.values(marks || {}).forEach(perStudent => {
    Object.values(perStudent || {}).forEach(v => {
      if (typeof v === 'number') values.push(v);
    });
  });
  if (values.length < 50) return null;
  const distinct = new Set(values);
  if (distinct.size === 1) {
    return `${values.length} recorded values, all identical (${[...distinct][0]})`;
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const { dateFrom, dateTo } = getTermDateRange(TERM);
  const expected = expectedSlotRange(TERM, dateFrom, dateTo);
  const slots = fortnightsIn(expected.from, expected.to);
  const subjects = readJson('data/subjects.json');
  const coSchRegistry = readJson('data/coscholastic.json');

  console.log('='.repeat(78));
  console.log(`ASSESSMENT GAP REPORT — ${TERM} — academic year ${getCurrentAcademicYear()}`);
  console.log(`Term window (containment): ${dateFrom} .. ${dateTo}`);
  console.log(`Expected fortnights:       ${expected.from} .. ${expected.to}  (${slots.length} slots)`);
  console.log(`Generated: ${new Date().toISOString()}   READ-ONLY, nothing was written.`);
  console.log('='.repeat(78));

  const sessSnap = await db.collection('assessment_sessions').get();
  const allSessions = sessSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`\nLoaded ${allSessions.length} assessment_sessions docs (all classes, all dates).`);

  const classTestIds = new Set();
  (await db.collection('class_test_marks').get()).forEach(d => classTestIds.add(d.id));
  const coSchIds = new Set();
  (await db.collection('coscholastic_marks').get()).forEach(d => coSchIds.add(d.id));

  const grandTotals = { expected: 0, missing: 0, counting: 0, unreviewed: 0, outside: 0 };
  const suspicious = [];

  for (const className of CLASSES) {
    const classSubjects = subjects.filter(s => (s.classes || []).includes(className));
    const roster = await loadRoster(className);
    const docSuffix = className.replace(/\s+/g, '_');

    console.log('\n' + '-'.repeat(78));
    console.log(`${className}  —  ${classSubjects.length} academic subject(s), ` +
                `${roster.ids.length} students (${roster.source})`);
    console.log('-'.repeat(78));

    if (!classSubjects.length) {
      console.log('  No academic subjects registered for this class in subjects.json.');
    }

    for (const subject of classSubjects) {
      const mine = allSessions.filter(e => {
        const s = e.session || {};
        return s.class === className && s.subject_id === subject.subject_id;
      });

      const rows = slots.map(slot => {
        const hits = mine.filter(e => {
          const { start } = windowOf(e.session || {});
          return start && start >= slot.start && start <= slot.end;
        });
        return { slot, hits };
      });

      const filled = rows.filter(r => r.hits.length).length;
      const counting = rows.filter(r =>
        r.hits.some(h => COUNTS(h.session.status) &&
                         containment(h.session, dateFrom, dateTo) === 'inside')).length;

      grandTotals.expected += slots.length;
      grandTotals.missing  += slots.length - filled;
      grandTotals.counting += counting;

      const flag = counting === slots.length ? 'OK  ' : 'GAP ';
      console.log(`\n  ${flag} ${subject.subject_id.padEnd(5)} ${subject.subject_name}` +
                  `  —  ${filled}/${slots.length} slots have a session, ` +
                  `${counting}/${slots.length} will reach a report card`);

      rows.forEach(({ slot, hits }) => {
        if (!hits.length) {
          console.log(`         ${slot.label.padEnd(20)} MISSING — no session`);
          return;
        }
        hits.forEach(h => {
          const s = h.session;
          const { start, end } = windowOf(s);
          const contain = containment(s, dateFrom, dateTo);
          const studentsWithMarks = Object.keys(h.marks || {}).length;
          let verdict;
          if (contain === 'outside') {
            verdict = `EXCLUDED — dates ${start}..${end} fall outside the term window`;
            grandTotals.outside++;
          } else if (contain === 'no-dates') {
            verdict = 'EXCLUDED — session has no usable dates';
            grandTotals.outside++;
          } else if (!COUNTS(s.status)) {
            verdict = `NOT COUNTED — status=${s.status}, needs reviewed/locked`;
            grandTotals.unreviewed++;
          } else {
            verdict = `counts (status=${s.status})`;
          }
          const coverage = roster.ids.length
            ? `${studentsWithMarks}/${roster.ids.length} students marked`
            : `${studentsWithMarks} students marked`;
          console.log(`         ${slot.label.padEnd(20)} ${verdict}`);
          console.log(`           ${'-'.padEnd(20)} ${start}..${end} | ${coverage} | ` +
                      `teacher=${s.teacher_name || '?'} | doc=${h.id}`);

          const fab = fabricationCheck(h.marks);
          if (fab) {
            suspicious.push({ className, subject: subject.subject_id, slot: slot.label, id: h.id, why: fab });
            console.log(`           ${'!'.padEnd(20)} SUSPECT DEFAULT-FILL: ${fab}`);
          }
        });
      });

      // Sessions for this subject that matched no expected slot — e.g. dated in
      // the March containment tail, or in another term entirely. Reported so a
      // real session is never silently invisible just because it sits outside
      // the six teaching fortnights.
      const slotted = new Set(rows.flatMap(r => r.hits.map(h => h.id)));
      const orphans = mine.filter(e => !slotted.has(e.id));
      orphans.forEach(o => {
        const { start, end } = windowOf(o.session || {});
        const where = containment(o.session, dateFrom, dateTo) === 'inside'
          ? 'inside the term window but outside the expected fortnights'
          : 'outside this term entirely';
        console.log(`         ${'unslotted'.padEnd(20)} ${start}..${end} — ${where}` +
                    ` | status=${o.session.status} | doc=${o.id}`);
      });

      // Class test for this subject+term.
      const ctId = `${TERM}_${docSuffix}_${subject.subject_id}`;
      if (!classTestIds.has(ctId)) {
        console.log(`         class test        MISSING — no class_test_marks/${ctId}`);
      }
    }

    // Co-scholastic is per class+term, not per subject.
    const csId = `${TERM}_${docSuffix}`;
    const csSubjects = (coSchRegistry.subjects || [])
      .filter(s => (s.classes || []).includes(className));
    if (csSubjects.length === 0) {
      console.log(`\n  CO-SCHOLASTIC  none registered for ${className}`);
    } else if (!coSchIds.has(csId)) {
      console.log(`\n  GAP  CO-SCHOLASTIC  ${csSubjects.length} subject(s) registered, ` +
                  `nothing entered — no coscholastic_marks/${csId}`);
    } else {
      const doc = await db.collection('coscholastic_marks').doc(csId).get();
      const grades = doc.data()?.grades || {};
      const marked = Object.keys(grades).length;
      const complete = Object.values(grades)
        .filter(g => csSubjects.every(s => g && g[s.key])).length;
      console.log(`\n  CO-SCHOLASTIC  ${marked}/${roster.ids.length} students have any grade, ` +
                  `${complete} complete across all ${csSubjects.length} subjects`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(78));
  console.log('SUMMARY');
  console.log('='.repeat(78));
  console.log(`  Fortnight slots expected across all classes : ${grandTotals.expected}`);
  console.log(`  Slots reaching a report card                : ${grandTotals.counting}`);
  console.log(`  Slots with no session at all                : ${grandTotals.missing}`);
  console.log(`  Sessions blocked only by review status      : ${grandTotals.unreviewed}`);
  console.log(`  Sessions excluded by date window            : ${grandTotals.outside}`);

  if (suspicious.length) {
    console.log(`\n  SUSPECT DEFAULT-FILL — ${suspicious.length} session(s) need eyes on them:`);
    suspicious.forEach(s =>
      console.log(`    ${s.className} ${s.subject} ${s.slot} [${s.id}] — ${s.why}`));
  } else {
    console.log('\n  No default-fill patterns detected.');
  }

  console.log('\nNothing was written. Re-run after reviews to watch the gaps close.');
  process.exit(0);
})().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
