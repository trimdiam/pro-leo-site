/**
 * marksheet.js — SFDS Report Card System
 * Reads classListArray from sessionStorage, renders consolidated table
 */

function loadClassList() {
  const raw = sessionStorage.getItem('sfds_classList');
  if (!raw) { console.error('No class list found in sessionStorage.'); return []; }
  try { return JSON.parse(raw); } catch (e) { console.error('Failed to parse class list:', e); return []; }
}

function formatPct(value) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/* Reduced-subject / special-needs students — % is suppressed (misleading
   against the full-class max). Self-contained copy (this page doesn't load
   render.js). Keep the name list in sync with render.js / markentry.js.       */
const REDUCED_SUBJECT_STUDENTS = ['LUCIA LAPDIANGHUN KHARKONOR'];
function isReducedSubjectStudent(name) {
  if (!name) return false;
  const norm = String(name).trim().toUpperCase().replace(/\s+/g, ' ');
  return REDUCED_SUBJECT_STUDENTS.includes(norm);
}

function renderMarksheet() {
  const list = loadClassList();
  if (!list.length) {
    document.getElementById('msTableBody').innerHTML = '<tr><td colspan="100">No students added to class list yet.</td></tr>';
    return;
  }

  const first  = list[0];
  const config = getClassConfig(parseInt(first.class, 10));
  if (!config) { console.error('Unknown class:', first.class); return; }

  const isStandard = config.markScheme === 'standard';

  // Read term from sessionStorage (set by viewCTMarksheet / generateClassMarksheet)
  const savedTerm = sessionStorage.getItem('sfds_marksheetTerm') || 'finalTerm';
  const termKey   = savedTerm;
  const termLabel = savedTerm === 'halfYearly' ? 'Half Yearly' : 'Final Term';

  const schoolName = first.schoolName || config.schoolName || 'St. Francis De Sales Secondary School';
  const classNum   = first.class || '—';
  const session    = first.session || '2026–2027';
  const dateStr    = new Date().toLocaleDateString('en-IN');

  document.getElementById('msSchoolName').textContent = schoolName;
  document.getElementById('msClass').textContent      = classNum;
  document.getElementById('msTerm').textContent       = termLabel;
  document.getElementById('msTermLabel').textContent  = termLabel;
  document.getElementById('msSession').textContent    = session;
  document.getElementById('msDate').textContent       = dateStr;

  // Page 2 header
  document.querySelectorAll('.ms-school-name-p2').forEach(el => el.textContent = schoolName);
  document.querySelectorAll('.ms-class-p2').forEach(el => el.textContent = classNum);
  document.querySelectorAll('.ms-session-p2').forEach(el => el.textContent = session);
  document.querySelectorAll('.ms-date-p2').forEach(el => el.textContent = dateStr);

  list.sort((a, b) => (a.student.rollNo || 0) - (b.student.rollNo || 0));

  // Show ALL subjects (matching report card format — includes components + aggregates)
  const subjects = config.subjects;

  document.getElementById('msTableHead').innerHTML = buildHeader(subjects, isStandard);
  document.getElementById('msTableBody').innerHTML = buildRows(list, subjects, config, isStandard, termKey);
  document.getElementById('msTableFoot').innerHTML = buildAverageRow(list, subjects, config, isStandard, termKey);

  // Co-scholastic and remarks tables
  buildCoScholasticTable(list, config);
  buildRemarksTable(list, config);
}

/* ─── CO-SCHOLASTIC TABLE ─────────────────────────────────────────────────── */
function buildCoScholasticTable(list, config) {
  const head = document.getElementById('msCoSchHead');
  const body = document.getElementById('msCoSchBody');
  if (!head || !body) return;

  const activities = (list[0] && list[0].coScholasticConfig) || config.coScholastic || [];
  if (!activities.length) {
    head.innerHTML = '';
    body.innerHTML = '<tr><td style="text-align:center;color:#666;padding:8px">No co-scholastic activities configured.</td></tr>';
    return;
  }

  // Header: Sl | Roll | Name | Activity1(T1|T2) | Activity2(T1|T2) | ... | Attendance HY% | Attendance FT%
  let hHtml = '<tr>';
  hHtml += '<th rowspan="2" style="width:28px">Sl.</th>';
  hHtml += '<th rowspan="2" style="width:38px">Roll</th>';
  hHtml += '<th rowspan="2" class="ms-student-name" style="text-align:left">Student Name</th>';
  for (const act of activities) {
    hHtml += `<th colspan="2" class="ms-subj-group"><span class="ms-subj-name">${act.label}</span></th>`;
  }
  hHtml += '<th colspan="2" class="ms-subj-group"><span class="ms-subj-name">Attendance</span></th>';
  hHtml += '</tr>';
  hHtml += '<tr class="ms-subheader">';
  for (let i = 0; i < activities.length; i++) hHtml += '<th>T1</th><th>T2</th>';
  hHtml += '<th>HY %</th><th>FT %</th>';
  hHtml += '</tr>';
  head.innerHTML = hHtml;

  // Rows
  let bHtml = '';
  list.forEach((data, idx) => {
    const co = data.coScholastic || {};
    const at = data.attendance || { hy: {}, ft: {} };
    bHtml += '<tr>';
    bHtml += `<td>${idx + 1}</td>`;
    bHtml += `<td>${data.student.rollNo}</td>`;
    bHtml += `<td class="ms-student-name">${data.student.name}</td>`;
    for (const act of activities) {
      const entry = co[act.key] || {};
      const t1 = entry.T1 ?? entry.t1 ?? entry.term1 ?? '—';
      const t2 = entry.T2 ?? entry.t2 ?? entry.term2 ?? '—';
      bHtml += `<td>${t1}</td><td>${t2}</td>`;
    }
    const hyPct = at.hy?.total ? ((at.hy.present / at.hy.total) * 100).toFixed(1) + '%' : '—';
    const ftPct = at.ft?.total ? ((at.ft.present / at.ft.total) * 100).toFixed(1) + '%' : '—';
    bHtml += `<td>${hyPct}</td><td>${ftPct}</td>`;
    bHtml += '</tr>';
  });
  body.innerHTML = bHtml;
}

/* ─── REMARKS TABLE ───────────────────────────────────────────────────────── */
// Falls back to the auto-generated remark when no teacher-entered remark
// exists, same as the individual report card (render.js). Self-contained
// copy of generateRemark() below — this page doesn't load render.js.
function buildRemarksTable(list, config) {
  const body = document.getElementById('msRemarksBody');
  if (!body) return;
  let html = '';
  list.forEach((data, idx) => {
    const ftNotAssessed = (data.finalTerm?.grandTotal || 0) === 0;
    const hy = ((data.remarks?.halfYearly || generateRemark(data, config, 'hy')) || '').replace(/[<>]/g, '');
    const ft = ((data.remarks?.finalTerm || (ftNotAssessed ? '' : generateRemark(data, config, 'ft'))) || '').replace(/[<>]/g, '');
    html += `<tr>
      <td>${idx + 1}</td>
      <td>${data.student.rollNo}</td>
      <td class="ms-student-name">${data.student.name}</td>
      <td style="text-align:left;font-style:italic;font-size:0.7rem;padding:4px 6px;line-height:1.4">${hy || '<span style="color:#aaa">—</span>'}</td>
      <td style="text-align:left;font-style:italic;font-size:0.7rem;padding:4px 6px;line-height:1.4">${ft || '<span style="color:#aaa">—</span>'}</td>
    </tr>`;
  });
  body.innerHTML = html;
}

/**
 * generateRemark(data, config, term) — self-contained copy of the remark
 * engine in render.js. Keep in sync with that file if the engine changes.
 * term: 'hy' (Half Yearly) | 'ft' (Final Term)
 */
function generateRemark(data, config, term) {
  const cls      = parseInt(data.class, 10);
  const termData = term === 'hy' ? data.halfYearly : data.finalTerm;
  const isStd    = config.markScheme === 'standard';
  const passmark = config.passmark || 40;
  const pmRatio  = passmark / 100;
  const iaThreshSen   = Math.round(20 * pmRatio);
  const examThreshSen = Math.round(80 * pmRatio);

  const scorable = config.subjects.filter(s => s.countInTotal);
  const analyzed = [];
  for (const subj of scorable) {
    const sd = termData.subjects[subj.key];
    if (!sd || sd.total == null) continue;
    const componentFail = !isStd && !subj.singleTotal &&
      (sd.ia < iaThreshSen || sd.exam < examThreshSen);
    const fails = sd.total < passmark || componentFail;
    analyzed.push({ subj, total: sd.total, ia: sd.ia, exam: sd.exam, fails });
  }
  const failed = analyzed.filter(a => a.fails);
  const byTotalDesc = [...analyzed].sort((a, b) => b.total - a.total);
  const byTotalAsc  = [...analyzed].sort((a, b) => a.total - b.total);

  const termPct = config.grandTotalMax > 0
    ? (termData.grandTotal / config.grandTotalMax) * 100
    : 0;
  const majorityFailing = analyzed.length > 0 && (failed.length / analyzed.length) >= 0.5;
  const band = majorityFailing ? 'critical'
             : termPct >= 90 ? 'excellent'
             : termPct >= 80 ? 'vgood'
             : termPct >= 70 ? 'good'
             : termPct >= 40 ? 'average'
             :                 'weak';

  const best      = byTotalDesc[0] || null;
  const bestLabel = best ? best.subj.label : 'core subjects';
  const bestPct   = best ? Math.round(best.total) : null;

  const worstCandidate = byTotalAsc[0] || null;
  const focusSubjects = (band === 'critical' || band === 'weak')
    ? byTotalAsc.filter(a => a.fails).slice(0, 2)
    : (worstCandidate && best && worstCandidate.subj.key !== best.subj.key)
      ? [worstCandidate]
      : [];
  const focusLabels = focusSubjects.map(a => a.subj.label);

  const att     = termData.attendance || { present: 0, total: 0 };
  const attPct  = att.total > 0 ? (att.present / att.total) * 100 : 100;
  const lowAtt  = attPct < 75;
  const highAtt = attPct >= 95;

  let utInsight = '';
  if (isStd) {
    const normal = scorable.filter(s => !s.isAggregate && !s.singleTotal);
    let widestSubj = null, widestGap = 0, sumUT = 0, sumTE = 0, n = 0;
    for (const subj of normal) {
      const sd = termData.subjects[subj.key];
      if (!sd || sd.ut == null || sd.exam == null) continue;
      const utPctN = (sd.ut / 30) * 100, tePctN = (sd.exam / 60) * 100;
      sumUT += utPctN; sumTE += tePctN; n++;
      const gap = utPctN - tePctN;
      if (Math.abs(gap) > Math.abs(widestGap)) { widestGap = gap; widestSubj = subj; }
    }
    if (n >= 2 && widestSubj && Math.abs(widestGap) > 15) {
      utInsight = widestGap > 0
        ? `Classwork in ${widestSubj.label} is steady, but marks drop in the term exam — focused exam preparation would help.`
        : `${widestSubj.label} shows stronger exam results than classwork — more consistent classwork effort would help.`;
    } else if (n >= 2) {
      const diff = (sumUT / n) - (sumTE / n);
      if (diff > 12) utInsight = 'Consistent preparation for examinations is advised.';
      else if (diff < -12) utInsight = 'Improvement in the term examination is commendable.';
    }
  }

  let trendLine = '';
  if (term === 'ft' && config.grandTotalMax > 0 && (data.halfYearly.grandTotal || 0) > 0) {
    const hyPct  = (data.halfYearly.grandTotal / config.grandTotalMax) * 100;
    const delta  = termPct - hyPct;
    if (delta >= 8) trendLine = 'This marks a clear improvement over the half-yearly result.';
    else if (delta <= -8) trendLine = 'This is a dip compared to the half-yearly performance, worth addressing early next session.';
  }

  const firstName = (data.student && data.student.name)
    ? data.student.name.trim().split(/\s+/)[0]
    : 'The student';
  const seedStr = `${(data.student && data.student.name) || firstName}|${cls}|${term}`;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;

  const s1Pool = {
    excellent: [
      `${firstName} has delivered an excellent performance this term, excelling particularly in ${bestLabel}${bestPct ? ` (${bestPct}%)` : ''}.`,
      `An outstanding term — ${firstName} shows exceptional ability in ${bestLabel} and maintains a high academic standard throughout.`,
      `${firstName} has set a strong benchmark this term, with ${bestLabel} standing out as a particular highlight.`,
      `A truly impressive term for ${firstName}, marked by consistent excellence and standout results in ${bestLabel}.`
    ],
    vgood: [
      `${firstName} has performed very well this term, demonstrating notable strength in ${bestLabel}${bestPct ? ` (${bestPct}%)` : ''}.`,
      `A commendable term for ${firstName}, who shows strong aptitude in ${bestLabel} across assessments.`,
      `${firstName} continues to perform strongly, with ${bestLabel} a clear area of confidence this term.`,
      `Solid, consistent work from ${firstName} this term, particularly in ${bestLabel}.`
    ],
    good: [
      `${firstName} has shown a good performance this term with commendable results in ${bestLabel}.`,
      `A solid effort this term; ${firstName} performs well in ${bestLabel} and has scope for further growth.`,
      `${firstName} is building a good academic foundation, with encouraging results in ${bestLabel} this term.`,
      `A steady term overall for ${firstName}, with ${bestLabel} among the stronger subjects.`
    ],
    average: [
      `${firstName} has shown moderate performance this term, with relative strength observed in ${bestLabel}.`,
      `This term, ${firstName} demonstrates an average standard; some strength is seen in ${bestLabel}.`,
      `${firstName}'s results this term are around the class average, with ${bestLabel} a comparative bright spot.`,
      `A middling term for ${firstName} overall, though ${bestLabel} shows promise.`
    ],
    weak: [
      `${firstName} has good potential still to unlock this term, with a promising start shown in ${bestLabel}.`,
      `There is real room to grow this term for ${firstName}, who shows encouraging effort in ${bestLabel}.`,
      `${firstName} is finding their footing this term, with ${bestLabel} a nice sign of what's possible.`,
      `This term calls for a bit more support for ${firstName}, though ${bestLabel} shows a genuine spark.`
    ],
    critical: [
      `${firstName} has a clear opportunity to grow this term, with results currently below the pass mark in ${failed.length} of ${analyzed.length} subjects.`,
      `This term has been a tough stretch for ${firstName}, with ${failed.length} of ${analyzed.length} subjects yet to reach the pass mark.`,
      `${firstName} is at an important turning point this term, with ${failed.length} of ${analyzed.length} subjects needing a bit more support to reach the pass mark.`
    ]
  };
  const pool1 = s1Pool[band];
  const s1 = pool1[seed % pool1.length];

  let s2 = '';
  if (band === 'critical' || band === 'weak') {
    const focusPool = focusLabels.length === 2
      ? [
          `${focusLabels[0]} and ${focusLabels[1]} would benefit most from some extra practice and support.`,
          `With a little extra help in ${focusLabels[0]} and ${focusLabels[1]}, real progress is within reach.`
        ]
      : focusLabels.length === 1
        ? [
            `${focusLabels[0]} would benefit most from some extra practice and support.`,
            `A bit more support in ${focusLabels[0]} could make a real difference.`
          ]
        : [];
    if (focusPool.length) s2 = focusPool[seed % focusPool.length];
  } else if (focusLabels.length) {
    const gentlePool = [
      `A little more focus on ${focusLabels[0]} could help ${firstName} shine there too.`,
      `With some extra practice, ${focusLabels[0]} has good potential to become another strong area.`,
      `${focusLabels[0]} offers good room to grow further with a bit more attention.`
    ];
    s2 = gentlePool[seed % gentlePool.length];
  }

  const encPool = {
    excellent: ['Sustaining this standard with the same discipline will serve well ahead.', 'Continuing this level of consistency will keep results at the very top.'],
    vgood:     ['With the same consistency, an even stronger result is well within reach.', 'Continued focus on this momentum will bring excellent results ahead.'],
    good:      ['With consistent effort and regular revision, much more can be achieved.', 'Continued dedication will lead to further progress and success.'],
    average:   ['Steady effort and focused study will bring noticeably better results ahead.', 'A more consistent study routine would help translate effort into results.'],
    weak:      ['With focused revision and consistent support, a much stronger result is achievable next term.', 'Regular practice and additional support at home will help build a stronger foundation.'],
    critical:  ['With focused revision and additional support, a much stronger result is well within reach next term.', 'Consistent daily practice and extra support in the weaker subjects can turn this around next term.']
  };
  const encList = encPool[band];
  const s3 = encList[seed % encList.length];

  let anchorLine = '';
  if (band === 'critical') {
    anchorLine = attPct >= 85
      ? 'Regular attendance this term is a good foundation to build from.'
      : `${firstName} has the ability to turn this around with the right support and consistent effort.`;
  }

  let attLine = '';
  if (band !== 'critical') {
    if (lowAtt) attLine = 'More regular attendance would help support stronger progress.';
    else if (highAtt) attLine = 'Regular attendance this term is commendable.';
  }

  const maxSentences = cls >= 9 ? 4 : 5;
  const candidates = band === 'critical'
    ? [s1, s2, utInsight, trendLine, anchorLine, s3]
    : [s1, s2, utInsight, trendLine, attLine, s3];
  const parts = candidates.filter(Boolean).slice(0, maxSentences);
  if (parts.length === maxSentences && parts[parts.length - 1] !== s3) {
    parts[parts.length - 1] = s3;
  }

  let remark = parts.join(' ');

  const CHAR_LIMIT = 420;
  if (remark.length > CHAR_LIMIT) {
    while (parts.length > 2 && remark.length > CHAR_LIMIT) {
      parts.splice(parts.length - 2, 1);
      remark = parts.join(' ');
    }
    if (remark.length > CHAR_LIMIT) {
      remark = remark.slice(0, CHAR_LIMIT - 3) + '...';
    }
  }

  return remark;
}

/* ─── HEADER ──────────────────────────────────────────────────────────────── */
function buildHeader(subjects, isStandard) {
  let html = '<tr>';
  html += '<th rowspan="2">Sl.</th>';
  html += '<th rowspan="2">Roll</th>';
  html += '<th rowspan="2" class="ms-student-name">Student Name</th>';

  for (const subj of subjects) {
    const isAgg = subj.isAggregate;
    if (isStandard) {
      // Aggregates: IA/UT/TE don't apply → 2 cols (— | Total) instead of 4
      const span = isAgg ? 2 : 4;
      html += `<th colspan="${span}" class="ms-subj-group"><span class="ms-subj-name">${subj.label}</span></th>`;
    } else {
      // Senior: IA | Exam | Total (aggregates: — | — | Total)
      const span = isAgg ? 2 : 3;
      html += `<th colspan="${span}" class="ms-subj-group"><span class="ms-subj-name">${subj.label}</span></th>`;
    }
  }

  html += '<th rowspan="2">Total</th>';
  html += '<th rowspan="2">%</th>';
  html += '<th rowspan="2">Rank</th>';
  html += '<th rowspan="2">Result</th>';
  html += '</tr>';

  // Sub-header
  html += '<tr class="ms-subheader">';
  for (const subj of subjects) {
    const isAgg = subj.isAggregate;
    if (isStandard) {
      if (isAgg) {
        html += '<th>—</th><th>Total</th>';
      } else {
        html += '<th>IA</th><th>UT</th><th>TE</th><th>Total</th>';
      }
    } else {
      if (isAgg) {
        html += '<th>—</th><th>Total</th>';
      } else {
        html += '<th>IA</th><th>Exam</th><th>Total</th>';
      }
    }
  }
  html += '</tr>';

  return html;
}

/* ─── ROWS ────────────────────────────────────────────────────────────────── */
function buildRows(list, subjects, config, isStandard, termKey) {
  const passmark = config.passmark || 40;
  const iaFloor   = Math.round(20 * passmark / 100);
  const examFloor = Math.round(80 * passmark / 100);
  let html = '';

  list.forEach((data, idx) => {
    const termData = data[termKey] || { subjects: {}, grandTotal: 0, percentage: 0 };
    const consol   = data.consolidated || {};

    html += '<tr>';
    html += `<td>${idx + 1}</td>`;
    html += `<td>${data.student.rollNo}</td>`;
    html += `<td class="ms-student-name">${data.student.name}</td>`;

    for (const subj of subjects) {
      const subjData = termData.subjects[subj.key] || {};
      const total    = subjData.total ?? 0;
      // Senior scheme (class 9/10): total clearing the passmark isn't
      // enough if IA or Theory individually miss their proportional floor.
      const componentFail = !isStandard && !subj.singleTotal &&
        (subjData.ia < iaFloor || subjData.exam < examFloor);
      const fail     = total > 0 && (total < passmark || componentFail);
      const isAgg    = subj.isAggregate;

      if (isStandard) {
        if (isAgg) {
          html += `<td style="color:#aaa">—</td>`;
          html += `<td class="${fail ? 'ms-fail' : ''}">${total || '—'}</td>`;
        } else {
          html += `<td>${subjData.ia !== undefined ? subjData.ia : '—'}</td>`;
          html += `<td>${subjData.ut !== undefined ? subjData.ut : '—'}</td>`;
          html += `<td>${subjData.exam !== undefined ? subjData.exam : '—'}</td>`;
          html += `<td class="${fail ? 'ms-fail' : ''}">${total || '—'}</td>`;
        }
      } else if (isAgg) {
        // Senior scheme aggregate: — | Total
        html += `<td style="color:#aaa">—</td>`;
        html += `<td class="${fail ? 'ms-fail' : ''}">${total || '—'}</td>`;
      } else {
        // Senior scheme leaf subject: IA | Exam | Total
        html += `<td>${subjData.ia !== undefined ? subjData.ia : '—'}</td>`;
        html += `<td>${subjData.exam !== undefined ? subjData.exam : '—'}</td>`;
        html += `<td class="${fail ? 'ms-fail' : ''}">${total || '—'}</td>`;
      }
    }

    const grandTotal = termData.grandTotal || 0;
    const pct        = termData.percentage ?? 0;
    const result     = consol.result || '—';
    const pass       = result === 'PASS' || result === 'PROMOTED' || result === 'PROMOTED WITH GRACE';
    // Rank is shown only for students who passed all subjects. Belt-and-braces
    // on top of the fresh recompute in markentry.js — a non-pass result never
    // displays a rank number, even if stale data carried one.
    const rank       = pass ? (termData.rank || '—') : '—';

    html += `<td class="ms-grand-total">${grandTotal}</td>`;
    // Reduced-subject students: suppress % (misleading against the full-class
    // max). Helper is defined in render.js, loaded on the same pages.
    html += `<td>${(typeof isReducedSubjectStudent === 'function' && isReducedSubjectStudent(data.student && data.student.name)) ? '—' : formatPct(pct) + '%'}</td>`;
    html += `<td class="ms-rank">${rank}</td>`;
    html += `<td class="${pass ? 'ms-pass' : 'ms-fail-result'}">${result}</td>`;
    html += '</tr>';
  });

  return html;
}

/* ─── CLASS AVERAGE ───────────────────────────────────────────────────────── */
function buildAverageRow(list, subjects, config, isStandard, termKey) {
  const n = list.length;
  if (!n) return '';

  const sums = {};
  for (const subj of subjects) sums[subj.key] = { ia: 0, ut: 0, exam: 0, total: 0 };
  let grandTotalSum = 0, pctSum = 0;

  for (const data of list) {
    const termData = data[termKey] || { subjects: {}, grandTotal: 0, percentage: 0 };
    grandTotalSum += termData.grandTotal || 0;
    pctSum        += termData.percentage || 0;
    for (const subj of subjects) {
      const sd = termData.subjects[subj.key] || {};
      sums[subj.key].ia    += sd.ia    || 0;
      sums[subj.key].ut    += sd.ut    || 0;
      sums[subj.key].exam  += sd.exam  || 0;
      sums[subj.key].total += sd.total || 0;
    }
  }

  const fmt = v => Number.isFinite(v) ? (Math.round(v * 10) / 10).toFixed(1) : '—';

  let html = '<tr>';
  html += '<td colspan="3" style="text-align:right;padding-right:6px;font-weight:700">Class Average</td>';

  for (const subj of subjects) {
    const s   = sums[subj.key];
    const isAgg = subj.isAggregate;
    if (isStandard) {
      if (isAgg) {
        html += `<td>—</td><td>${fmt(s.total / n)}</td>`;
      } else {
        html += `<td>${fmt(s.ia / n)}</td><td>${fmt(s.ut / n)}</td><td>${fmt(s.exam / n)}</td><td>${fmt(s.total / n)}</td>`;
      }
    } else if (isAgg) {
      html += `<td>—</td><td>${fmt(s.total / n)}</td>`;
    } else {
      html += `<td>${fmt(s.ia / n)}</td><td>${fmt(s.exam / n)}</td><td>${fmt(s.total / n)}</td>`;
    }
  }

  html += `<td>${fmt(grandTotalSum / n)}</td>`;
  html += `<td>${formatPct(pctSum / n)}%</td>`;
  html += '<td>—</td><td>—</td>';
  html += '</tr>';

  return html;
}

document.addEventListener('DOMContentLoaded', renderMarksheet);
