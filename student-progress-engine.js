// ── Student Progress Engine ───────────────────────────────────────────────────
// Fetches assessment session data from Firestore for a specific student and
// computes per-subject, per-category personal analytics.
//
// Used by student-progress-view.js in the student portal.
// No class averages — everything is filtered to the individual student only.

const FB_VERSION = '10.13.0';
const FB_BASE    = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

// Subjects registry + criteria paths (mirrors assessment-app/data/subjects.json)
const SUBJECTS_PATH  = 'assessment-app/data/subjects.json';
const ELIGIBLE_STATUSES = new Set(['submitted', 'reviewed', 'locked']);

let _db = null;
let _subjectsCache = null;
const _criteriaCache = new Map();
const _sessionsCache = new Map();

async function ensureDb() {
  if (_db) return _db;
  const { getFirestore } = await import(`${FB_BASE}/firebase-firestore.js`);
  const { getApp }       = await import(`${FB_BASE}/firebase-app.js`);
  _db = getFirestore(getApp());
  return _db;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(total, max) {
  return max > 0 ? Math.round((total / max) * 100) : 0;
}

function bandLabel(p) {
  if (p >= 80) return { label: 'Strong',   color: '#1a7a5e', level: 'strong'   };
  if (p >= 60) return { label: 'Good',     color: '#2d8c6e', level: 'good'     };
  if (p >= 40) return { label: 'Average',  color: '#b07d2a', level: 'average'  };
  if (p >= 20) return { label: 'Weak',     color: '#c0392b', level: 'weak'     };
  return             { label: 'Critical',  color: '#922b21', level: 'critical' };
}

function extractYM(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : '';
}

function inferCategory(name) {
  const n = name.toLowerCase();
  if (/pencil|grip|tracing|formation|writing|copy|neatness|coordinat|control/.test(n)) return 'Motor Skills';
  if (/listen|attention|task|instruct|independent|complet|stays|focus/.test(n))        return 'Work Habits';
  if (/pronounc|sentence|speak|express|communicat|confidence|fluency/.test(n))         return 'Oral Skills';
  if (/identif|recogni|match|count|number|alphabet|letter|shape|sequenc/.test(n))      return 'Knowledge';
  if (/participat|interest|engage|cooperat|bonding|enjoy|moral|creativity|imagination/.test(n)) return 'Engagement';
  return 'General';
}

function getMarkValue(entry) {
  if (entry === null || entry === undefined) return null;
  if (typeof entry === 'object' && entry.attendance === 'absent') return null;
  return typeof entry === 'number' ? entry : null;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

async function fetchSubjects() {
  if (_subjectsCache) return _subjectsCache;
  const res = await fetch(SUBJECTS_PATH);
  if (!res.ok) throw new Error('Could not load subjects registry');
  _subjectsCache = await res.json();
  return _subjectsCache;
}

async function fetchCriteria(criteriaPath) {
  if (_criteriaCache.has(criteriaPath)) return _criteriaCache.get(criteriaPath);
  const url = criteriaPath.startsWith('assessment-app/')
    ? criteriaPath
    : `assessment-app/${criteriaPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load criteria: ${url}`);
  const data = await res.json();
  _criteriaCache.set(criteriaPath, data);
  return data;
}

async function fetchStudentSessions(studentClass) {
  if (_sessionsCache.has(studentClass)) return _sessionsCache.get(studentClass);
  const db = await ensureDb();
  const { collection, query, where, getDocs } =
    await import(`${FB_BASE}/firebase-firestore.js`);

  const q = query(
    collection(db, 'assessment_sessions'),
    where('session.class', '==', studentClass)
  );
  const snap = await getDocs(q);
  const sessions = snap.docs
    .map(d => d.data())
    .filter(d => d.session && ELIGIBLE_STATUSES.has(d.session.status));
  _sessionsCache.set(studentClass, sessions);
  return sessions;
}

// ── Core computation ──────────────────────────────────────────────────────────

function computeSubjectProgress(studentId, sessions, subjectId, criteriaArray) {
  const subjectSessions = sessions.filter(s => s.session.subject_id === subjectId);
  if (subjectSessions.length === 0) return null;

  // Build criterion → category map
  const criterionMap = new Map();
  criteriaArray.forEach(c => {
    criterionMap.set(c.criterion_id, {
      criterion_name: c.criterion_name,
      category: c.category || inferCategory(c.criterion_name)
    });
  });

  const hasCategories = criteriaArray.some(c => c.category);

  // Accumulate marks per criterion across all sessions
  const criterionAccum = new Map(); // criterionId → {total, count}
  const monthlyAccum   = new Map(); // ym → { catMap: Map<cat, {total,count}> }

  subjectSessions.forEach(({ session, marks }) => {
    if (!marks) return;
    const studentMarks = marks[studentId];
    if (!studentMarks || typeof studentMarks !== 'object') return;

    const ym = extractYM(session.date);

    Object.entries(studentMarks).forEach(([cid, entry]) => {
      if (cid.startsWith('_')) return;
      const val = getMarkValue(entry);
      if (val === null) return;

      // Per-criterion total
      if (!criterionAccum.has(cid)) criterionAccum.set(cid, { total: 0, count: 0 });
      const ca = criterionAccum.get(cid);
      ca.total += val;
      ca.count += 1;

      // Monthly per-category total
      if (ym) {
        if (!monthlyAccum.has(ym)) monthlyAccum.set(ym, new Map());
        const catMap = monthlyAccum.get(ym);
        const info = criterionMap.get(cid);
        const cat  = info ? info.category : 'General';
        if (!catMap.has(cat)) catMap.set(cat, { total: 0, count: 0 });
        const cm = catMap.get(cat);
        cm.total += val;
        cm.count += 1;
      }
    });
  });

  if (criterionAccum.size === 0) return null;

  // ── Category averages ──
  const catAccum = new Map();
  criteriaArray.forEach(c => {
    const cat = c.category || inferCategory(c.criterion_name);
    if (!catAccum.has(cat)) catAccum.set(cat, { total: 0, count: 0 });
  });

  criterionAccum.forEach((cm, cid) => {
    const info = criterionMap.get(cid);
    const cat  = info ? info.category : 'General';
    if (!catAccum.has(cat)) catAccum.set(cat, { total: 0, count: 0 });
    const ca = catAccum.get(cat);
    ca.total += cm.total;
    ca.count += cm.count;
  });

  const categories = [];
  catAccum.forEach((ca, category) => {
    if (ca.count === 0) return;
    const avgPct = pct(ca.total, ca.count * 5);
    categories.push({ category, averagePercentage: avgPct, ...bandLabel(avgPct) });
  });
  categories.sort((a, b) => b.averagePercentage - a.averagePercentage);

  // ── Individual criteria ──
  const criteria = criteriaArray
    .map(c => {
      const cm = criterionAccum.get(c.criterion_id);
      if (!cm || cm.count === 0) return null;
      const avgPct = pct(cm.total, cm.count * 5);
      return {
        criterion_id: c.criterion_id,
        criterion_name: c.criterion_name,
        category: c.category || inferCategory(c.criterion_name),
        averagePercentage: avgPct,
        ...bandLabel(avgPct)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.averagePercentage - b.averagePercentage); // weakest first

  // ── Overall subject average ──
  let totalMarks = 0, totalCount = 0;
  criterionAccum.forEach(cm => { totalMarks += cm.total; totalCount += cm.count; });
  const overallPct = pct(totalMarks, totalCount * 5);

  // ── Month-over-month change ──
  const sortedMonths = Array.from(monthlyAccum.keys()).sort();
  const alerts = [];

  if (sortedMonths.length >= 2) {
    const [prevYm, currYm] = sortedMonths.slice(-2);
    const prevCats = monthlyAccum.get(prevYm);
    const currCats = monthlyAccum.get(currYm);

    catAccum.forEach((_, category) => {
      const prev = prevCats && prevCats.get(category);
      const curr = currCats && currCats.get(category);
      if (!prev || !curr) return;
      const prevPct = pct(prev.total, prev.count * 5);
      const currPct = pct(curr.total, curr.count * 5);
      const diff = currPct - prevPct;
      if (diff <= -10) alerts.push({ type: 'decline',     category, diff: Math.abs(diff), prevPct, currPct });
      if (diff >= 10)  alerts.push({ type: 'improvement', category, diff,                 prevPct, currPct });
    });
  }

  // ── Quick focus tip (weakest criterion) ──
  const focusCriterion = criteria.length > 0 ? criteria[0] : null;

  return {
    subjectId,
    overallPercentage: overallPct,
    ...bandLabel(overallPct),
    categories,
    criteria,
    strongest:      categories[0]                    || null,
    weakest:        categories[categories.length - 1] || null,
    focusCriterion,
    alerts,
    monthsTracked:  sortedMonths.length,
    hasCategories
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetches and computes personal subject progress for a student.
 *
 * @param {string} studentId    e.g. "SFS260101"
 * @param {string} studentClass e.g. "Class I"
 * @returns {Array} [ { subject_id, subject_name, ...progress } ] — one entry per subject with data
 */
export async function getStudentProgress(studentId, studentClass) {
  if (!studentId || !studentClass) return [];
  const sessions = await fetchStudentSessions(studentClass);
  return computeProgressFromSessions(studentId, studentClass, sessions);
}

/**
 * Pure computation entry point — same logic as getStudentProgress but takes
 * sessions in memory instead of reading Firestore. Used by getStudentProgress
 * and by offline demos/tests. Criteria definitions are still fetched from the
 * static JSON files (works in any browser context).
 *
 * @param {string} studentId
 * @param {string} studentClass
 * @param {Array}  sessions  - [{ session, marks }] already filtered/eligible
 * @returns {Array}
 */
export async function computeProgressFromSessions(studentId, studentClass, sessions) {
  if (!studentId || !studentClass) return [];

  const subjects = await fetchSubjects();

  const classSubjects = subjects.filter(s =>
    Array.isArray(s.classes) && s.classes.includes(studentClass)
  );

  const settled = await Promise.all(
    classSubjects.map(async subject => {
      let criteriaFile;
      try {
        criteriaFile = await fetchCriteria(subject.criteria_path);
      } catch {
        return null;
      }
      const criteriaArray = criteriaFile.criteria || [];
      const progress = computeSubjectProgress(studentId, sessions, subject.subject_id, criteriaArray);
      if (!progress) return null;
      return { subject_id: subject.subject_id, subject_name: subject.subject_name, ...progress };
    })
  );

  return settled
    .filter(Boolean)
    .sort((a, b) => a.overallPercentage - b.overallPercentage);
}
