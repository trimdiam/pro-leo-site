// ── Subject Drill-Down Engine ─────────────────────────────────────────────────
// Computes deep per-subject analytics for the admin dashboard.
// Reads from local session storage — no Firestore calls.
//
// Main export: getSubjectDrillDown(className, subjectId)
// Returns: categories, heat grid, alerts, quick win, skill gaps, student list

import { getEligibleSessions, extractYearMonth } from './aggregation-engine.js';
import { getMarkValue } from './totals-engine.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(marks, max) {
  return max > 0 ? Math.round((marks / max) * 100) : 0;
}

function bandLabel(p) {
  if (p >= 80) return { label: 'Strong',   color: '#1a7a5e', level: 'strong'   };
  if (p >= 60) return { label: 'Good',     color: '#2d8c6e', level: 'good'     };
  if (p >= 40) return { label: 'Average',  color: '#b07d2a', level: 'average'  };
  if (p >= 20) return { label: 'Weak',     color: '#c0392b', level: 'weak'     };
  return             { label: 'Critical',  color: '#922b21', level: 'critical' };
}

// Assigns a category to a flat criterion (LKG/SKG subjects have no category field).
// Groups by rough skill area inferred from criterion name keywords.
function inferCategory(criterionName) {
  const n = criterionName.toLowerCase();
  if (/pencil|grip|tracing|formation|writing|copy|neatness|coordinat|control/.test(n)) return 'Motor Skills';
  if (/listen|attention|task|instruct|independent|complet|stays|focus/.test(n))        return 'Work Habits';
  if (/pronounc|sentence|speak|express|communicat|confidence|fluency/.test(n))         return 'Oral Skills';
  if (/identif|recogni|match|count|number|alphabet|letter|shape|sequenc/.test(n))      return 'Knowledge';
  if (/participat|interest|engage|cooperat|bonding|enjoy|moral|creativity|imagination/.test(n)) return 'Engagement';
  return 'General';
}

// ── Core computation ──────────────────────────────────────────────────────────

/**
 * Build a map of criterionId → { criterion_name, category }
 * from raw criteria array (handles both flat and categorised formats).
 */
function buildCriterionMap(criteriaArray) {
  const map = new Map();
  criteriaArray.forEach(c => {
    map.set(c.criterion_id, {
      criterion_name: c.criterion_name,
      category: c.category || inferCategory(c.criterion_name)
    });
  });
  return map;
}

/**
 * From eligible sessions for className + subjectId, collect per-student
 * per-criterion mark totals. Returns:
 *   { studentMap, allCriterionIds, monthSet }
 *
 * studentMap: Map<studentId, { full_name, criteria: Map<criterionId, {total,count}>, months: Set }>
 */
function collectMarks(className, subjectId) {
  const sessions = getEligibleSessions({ class: className, subject_id: subjectId });

  const studentMap = new Map();
  const allCriterionIds = new Set();
  const monthSet = new Set();

  sessions.forEach(({ session, marks }) => {
    if (!marks) return;
    const ym = extractYearMonth(session.date);
    if (ym) monthSet.add(ym);

    Object.entries(marks).forEach(([studentId, studentMarks]) => {
      if (!studentMarks || typeof studentMarks !== 'object') return;

      if (!studentMap.has(studentId)) {
        studentMap.set(studentId, {
          student_id: studentId,
          full_name: studentMarks._full_name || studentId,
          criteria: new Map(),
          months: new Set()
        });
      }
      const st = studentMap.get(studentId);
      if (ym) st.months.add(ym);

      Object.entries(studentMarks).forEach(([criterionId, entry]) => {
        if (criterionId.startsWith('_')) return; // skip meta fields
        const val = getMarkValue(entry);
        if (val === null) return; // absent or unscored
        allCriterionIds.add(criterionId);
        if (!st.criteria.has(criterionId)) {
          st.criteria.set(criterionId, { total: 0, count: 0 });
        }
        const cm = st.criteria.get(criterionId);
        cm.total += val;
        cm.count += 1;
      });
    });
  });

  return { studentMap, allCriterionIds, monthSet, sessions };
}

/**
 * Build monthly averages per category for decline detection.
 * Returns Map<yearMonth, Map<category, { total, count }>>
 */
function buildMonthlyCategory(className, subjectId, criterionMap) {
  const sessions = getEligibleSessions({ class: className, subject_id: subjectId });
  const monthly = new Map(); // ym → Map<category, {total, count}>

  sessions.forEach(({ session, marks }) => {
    if (!marks) return;
    const ym = extractYearMonth(session.date);
    if (!ym) return;
    if (!monthly.has(ym)) monthly.set(ym, new Map());
    const catMap = monthly.get(ym);

    Object.values(marks).forEach(studentMarks => {
      if (!studentMarks || typeof studentMarks !== 'object') return;
      Object.entries(studentMarks).forEach(([criterionId, entry]) => {
        if (criterionId.startsWith('_')) return;
        const val = getMarkValue(entry);
        if (val === null) return;
        const info = criterionMap.get(criterionId);
        if (!info) return;
        const cat = info.category;
        if (!catMap.has(cat)) catMap.set(cat, { total: 0, count: 0 });
        const cm = catMap.get(cat);
        cm.total += val;
        cm.count += 1;
      });
    });
  });

  return monthly;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Main entry point.
 *
 * @param {string} className   e.g. "Class I", "LKG"
 * @param {string} subjectId   e.g. "ENG1", "LIT"
 * @param {Array}  criteriaArray  Raw criteria array from the subject's JSON file
 * @returns {Object} Full drill-down analytics object
 */
export function getSubjectDrillDown(className, subjectId, criteriaArray) {
  const criterionMap = buildCriterionMap(criteriaArray);
  const { studentMap, allCriterionIds, monthSet, sessions } = collectMarks(className, subjectId);

  if (studentMap.size === 0) {
    return {
      subjectId,
      className,
      hasData: false,
      categories: [],
      criteria: [],
      heatGrid: { students: [], columns: [], rows: [] },
      alerts: [],
      quickWin: null,
      skillGaps: [],
      strongest: null,
      weakest: null,
      studentList: [],
      monthsTracked: 0
    };
  }

  // ── 1. Category averages ──────────────────────────────────────────────────

  const catAccum = new Map(); // category → { total, count, criterionIds: Set }
  criteriaArray.forEach(c => {
    const cat = c.category || inferCategory(c.criterion_name);
    if (!catAccum.has(cat)) catAccum.set(cat, { total: 0, count: 0, criterionIds: new Set() });
    catAccum.get(cat).criterionIds.add(c.criterion_id);
  });

  studentMap.forEach(st => {
    st.criteria.forEach((cm, criterionId) => {
      const info = criterionMap.get(criterionId);
      if (!info) return;
      const cat = info.category;
      if (!catAccum.has(cat)) catAccum.set(cat, { total: 0, count: 0, criterionIds: new Set() });
      const ca = catAccum.get(cat);
      ca.total += cm.total;
      ca.count += cm.count;
    });
  });

  const categories = [];
  catAccum.forEach((ca, category) => {
    const avgPct = pct(ca.total, ca.count * 5);
    categories.push({
      category,
      averagePercentage: avgPct,
      ...bandLabel(avgPct),
      criterionCount: ca.criterionIds.size
    });
  });
  categories.sort((a, b) => b.averagePercentage - a.averagePercentage);

  const strongest = categories[0] || null;
  const weakest   = categories[categories.length - 1] || null;

  // ── 2. Individual criterion averages ─────────────────────────────────────

  const criteriaStats = new Map(); // criterionId → { total, count }
  studentMap.forEach(st => {
    st.criteria.forEach((cm, cid) => {
      if (!criteriaStats.has(cid)) criteriaStats.set(cid, { total: 0, count: 0 });
      const s = criteriaStats.get(cid);
      s.total += cm.total;
      s.count += cm.count;
    });
  });

  const criteria = criteriaArray.map(c => {
    const s = criteriaStats.get(c.criterion_id) || { total: 0, count: 0 };
    const avgPct = pct(s.total, s.count * 5);
    return {
      criterion_id: c.criterion_id,
      criterion_name: c.criterion_name,
      category: c.category || inferCategory(c.criterion_name),
      averagePercentage: avgPct,
      ...bandLabel(avgPct),
      sessions: s.count
    };
  });
  criteria.sort((a, b) => a.averagePercentage - b.averagePercentage); // weakest first

  // ── 3. Heat grid ──────────────────────────────────────────────────────────
  // Columns = categories (or individual criteria for flat subjects)
  // Rows    = students
  // Cell    = average % for that student in that category

  const hasCategories = criteriaArray.some(c => c.category);
  const gridColumns   = hasCategories
    ? categories.map(c => c.category)
    : criteriaArray.map(c => c.criterion_name);

  const heatRows = [];
  studentMap.forEach(st => {
    const cells = {};

    if (hasCategories) {
      // Group criteria by category, average per student
      const catTotals = new Map();
      st.criteria.forEach((cm, criterionId) => {
        const info = criterionMap.get(criterionId);
        if (!info) return;
        const cat = info.category;
        if (!catTotals.has(cat)) catTotals.set(cat, { total: 0, count: 0 });
        const ct = catTotals.get(cat);
        ct.total += cm.total;
        ct.count += cm.count;
      });
      gridColumns.forEach(cat => {
        const ct = catTotals.get(cat) || { total: 0, count: 0 };
        cells[cat] = pct(ct.total, ct.count * 5);
      });
    } else {
      // Flat: one cell per criterion
      criteriaArray.forEach(c => {
        const cm = st.criteria.get(c.criterion_id) || { total: 0, count: 0 };
        cells[c.criterion_name] = pct(cm.total, cm.count * 5);
      });
    }

    const overallTotal = Array.from(st.criteria.values()).reduce((s, c) => s + c.total, 0);
    const overallCount = Array.from(st.criteria.values()).reduce((s, c) => s + c.count, 0);

    heatRows.push({
      student_id: st.student_id,
      full_name: st.full_name,
      overallPercentage: pct(overallTotal, overallCount * 5),
      cells
    });
  });
  heatRows.sort((a, b) => b.overallPercentage - a.overallPercentage);

  // ── 4. Decline alerts ─────────────────────────────────────────────────────

  const alerts = [];
  const sortedMonths = Array.from(monthSet).sort();

  if (sortedMonths.length >= 2) {
    const monthly = buildMonthlyCategory(className, subjectId, criterionMap);
    const lastTwo = sortedMonths.slice(-2);
    const [prevYm, currYm] = lastTwo;

    const prevCats = monthly.get(prevYm) || new Map();
    const currCats = monthly.get(currYm) || new Map();

    catAccum.forEach((_, category) => {
      const prev = prevCats.get(category);
      const curr = currCats.get(category);
      if (!prev || !curr) return;
      const prevPct = pct(prev.total, prev.count * 5);
      const currPct = pct(curr.total, curr.count * 5);
      const drop = prevPct - currPct;
      if (drop >= 10) {
        alerts.push({
          type: 'decline',
          category,
          drop,
          prevPct,
          currPct,
          message: `${category} dropped ${drop}% (${prevPct}% → ${currPct}%) since last month`
        });
      }
      if (currPct - prevPct >= 10) {
        alerts.push({
          type: 'improvement',
          category,
          rise: currPct - prevPct,
          prevPct,
          currPct,
          message: `${category} improved ${currPct - prevPct}% (${prevPct}% → ${currPct}%) since last month`
        });
      }
    });
  }

  // ── 5. Quick win ──────────────────────────────────────────────────────────
  // Category closest to the next performance band threshold from below

  const THRESHOLDS = [80, 60, 40, 20];
  let quickWin = null;
  let minGap = Infinity;

  categories.forEach(cat => {
    const p = cat.averagePercentage;
    THRESHOLDS.forEach(threshold => {
      if (p < threshold) {
        const gap = threshold - p;
        if (gap < minGap) {
          minGap = gap;
          quickWin = {
            category: cat.category,
            currentPct: p,
            targetPct: threshold,
            gap,
            message: `${cat.category} is ${gap}% away from ${bandLabel(threshold).label} — focus here for fastest improvement`
          };
        }
      }
    });
  });

  // ── 6. Skill gaps ─────────────────────────────────────────────────────────
  // Categories where > 50% of students score below 40%

  const skillGaps = [];
  const studentCount = studentMap.size;

  if (hasCategories) {
    catAccum.forEach((ca, category) => {
      let weakCount = 0;
      studentMap.forEach(st => {
        const catTotals = { total: 0, count: 0 };
        st.criteria.forEach((cm, criterionId) => {
          const info = criterionMap.get(criterionId);
          if (info && info.category === category) {
            catTotals.total += cm.total;
            catTotals.count += cm.count;
          }
        });
        const studentCatPct = pct(catTotals.total, catTotals.count * 5);
        if (studentCatPct < 40) weakCount++;
      });
      const weakRatio = studentCount > 0 ? weakCount / studentCount : 0;
      if (weakRatio > 0.5) {
        skillGaps.push({
          category,
          weakCount,
          totalStudents: studentCount,
          weakPercent: Math.round(weakRatio * 100),
          message: `${weakCount} of ${studentCount} students are weak in ${category} — class-wide gap`
        });
      }
    });
  }

  // ── 7. Student list (ranked) ───────────────────────────────────────────────

  const studentList = heatRows.map(r => ({
    student_id: r.student_id,
    full_name: r.full_name,
    overallPercentage: r.overallPercentage,
    ...bandLabel(r.overallPercentage),
    categoryBreakdown: r.cells
  }));

  return {
    subjectId,
    className,
    hasData: true,
    categories,      // [{category, averagePercentage, label, color, level, criterionCount}]
    criteria,        // [{criterion_id, criterion_name, category, averagePercentage, ...band}]
    heatGrid: {
      columns: gridColumns,
      rows: heatRows   // [{student_id, full_name, overallPercentage, cells:{col→pct}}]
    },
    alerts,          // [{type:'decline'|'improvement', category, message, ...}]
    quickWin,        // {category, currentPct, targetPct, gap, message} | null
    skillGaps,       // [{category, weakCount, totalStudents, weakPercent, message}]
    strongest,       // {category, averagePercentage, ...band}
    weakest,         // {category, averagePercentage, ...band}
    studentList,     // [{student_id, full_name, overallPercentage, categoryBreakdown}]
    monthsTracked: sortedMonths.length,
    hasCategories    // false for LKG/SKG flat subjects
  };
}
