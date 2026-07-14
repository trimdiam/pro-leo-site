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
  buildRemarksTable(list);
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
function buildRemarksTable(list) {
  const body = document.getElementById('msRemarksBody');
  if (!body) return;
  let html = '';
  list.forEach((data, idx) => {
    const hy = (data.remarks?.halfYearly || '').replace(/[<>]/g, '');
    const ft = (data.remarks?.finalTerm   || '').replace(/[<>]/g, '');
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
  const passmark = config.passmark || 33;
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
    const rank       = termData.rank || '—';
    const result     = consol.result || '—';
    const pass       = result === 'PASS' || result === 'PROMOTED' || result === 'PROMOTED WITH GRACE';

    html += `<td class="ms-grand-total">${grandTotal}</td>`;
    html += `<td>${formatPct(pct)}%</td>`;
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
