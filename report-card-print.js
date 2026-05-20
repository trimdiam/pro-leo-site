// ── Report Card Print Engine ──────────────────────────────────────────────────
// Self-contained HTML builder. No Firebase, no imports.
// Outputs a single legal-landscape page with both half-yearly terms + annual summary.
// Design: "Cow Dung · Cream White · Black Edge" — Inter font, professional layout.

// ── Grade helpers (inline — no imports) ──────────────────────────────────────

function gradeCode(avg) {
  if (avg === null || avg === undefined) return 'Ex';
  if (avg >= 4.5) return 'Adv';
  if (avg >= 3.5) return 'Prof';
  if (avg >= 2.5) return 'Dev';
  if (avg >= 1.5) return 'Beg';
  return 'NY';
}

function gradeWord(avg) {
  const map = { Adv: 'Advanced', Prof: 'Proficient', Dev: 'Developing', Beg: 'Beginning', NY: 'Not Yet', Ex: 'Exempt' };
  return map[gradeCode(avg)] || 'Exempt';
}

function achClass(codeOrAvg) {
  const code = typeof codeOrAvg === 'string' ? codeOrAvg : gradeCode(codeOrAvg);
  const map = { Adv: 'adv', Prof: 'prof', Dev: 'dev', Beg: 'beg', NY: 'ny', Ex: 'ex' };
  return map[code] || 'ex';
}

function ach(codeOrAvg) {
  const code = typeof codeOrAvg === 'string' ? codeOrAvg : gradeCode(codeOrAvg);
  return `<span class="ach ${achClass(code)}">${code}</span>`;
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Annual summary computation ────────────────────────────────────────────────

export function computeAnnualSummary(hy1Card, hy2Card) {
  const subjectMap = {};

  function addCard(card, termKey) {
    if (!card || !card.subjects) return;
    card.subjects.forEach(subj => {
      if (!subjectMap[subj.subject_id]) {
        subjectMap[subj.subject_id] = {
          subject_id: subj.subject_id,
          subject_name: subj.subject_name,
          criteria: subj.criteria || [],
          hy1SubjAvg: null, hy2SubjAvg: null,
          hy1Grade: 'Ex', hy2Grade: 'Ex'
        };
      }
      subjectMap[subj.subject_id][termKey + 'SubjAvg'] = subj.subjectAverage ?? null;
      subjectMap[subj.subject_id][termKey + 'Grade']   = subj.subjectGrade || 'Ex';
      if (termKey === 'hy1') subjectMap[subj.subject_id].criteria = subj.criteria || [];
    });
  }

  addCard(hy1Card, 'hy1');
  addCard(hy2Card, 'hy2');

  let mostImproved = null, bestDelta = -Infinity;

  const subjects = Object.values(subjectMap).map(s => {
    const avgs = [s.hy1SubjAvg, s.hy2SubjAvg].filter(v => v !== null);
    const annualAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    if (s.hy1SubjAvg !== null && s.hy2SubjAvg !== null) {
      const delta = s.hy2SubjAvg - s.hy1SubjAvg;
      if (delta > bestDelta) { bestDelta = delta; mostImproved = s.subject_name; }
    }

    // Build per-criterion annual average
    const criteriaMap = {};
    (hy1Card?.subjects?.find(x => x.subject_id === s.subject_id)?.criteria || []).forEach(c => {
      criteriaMap[c.criterion_id] = { name: c.criterion_name, hy1: c.averageScore ?? null, hy2: null };
    });
    (hy2Card?.subjects?.find(x => x.subject_id === s.subject_id)?.criteria || []).forEach(c => {
      if (!criteriaMap[c.criterion_id]) criteriaMap[c.criterion_id] = { name: c.criterion_name, hy1: null, hy2: null };
      criteriaMap[c.criterion_id].hy2 = c.averageScore ?? null;
    });
    const criteria = Object.values(criteriaMap).map(c => {
      const ca = [c.hy1, c.hy2].filter(v => v !== null);
      const ann = ca.length ? ca.reduce((a, b) => a + b, 0) / ca.length : null;
      return { name: c.name, hy1Score: c.hy1, hy2Score: c.hy2, annualAvg: ann };
    });

    return {
      subject_id:   s.subject_id,
      subject_name: s.subject_name,
      hy1Grade:     s.hy1Grade,
      hy2Grade:     s.hy2Grade,
      annualAvg:    annualAvg !== null ? Math.round(annualAvg * 100) / 100 : null,
      annualGrade:  gradeCode(annualAvg),
      criteria
    };
  });

  const hy1Avg = hy1Card?.overallAverageScore ?? null;
  const hy2Avg = hy2Card?.overallAverageScore ?? null;
  const overallAvgs = [hy1Avg, hy2Avg].filter(v => v !== null);
  const annualOverallAvg = overallAvgs.length ? overallAvgs.reduce((a, b) => a + b, 0) / overallAvgs.length : null;

  return {
    subjects,
    annualOverallAvg:   annualOverallAvg !== null ? Math.round(annualOverallAvg * 100) / 100 : null,
    annualOverallGrade: gradeCode(annualOverallAvg),
    annualOverallLabel: gradeWord(annualOverallAvg),
    hy1OverallLabel:    hy1Card?.overallLabel || '—',
    hy2OverallLabel:    hy2Card?.overallLabel || '—',
    hy1OverallGrade:    hy1Card?.overallGrade || 'Ex',
    hy2OverallGrade:    hy2Card?.overallGrade || 'Ex',
    hy1Avg,
    hy2Avg,
    mostImprovedArea:   mostImproved,
    promotedToClass:    hy2Card?.promotedToClass || null
  };
}

// ── Inline CSS ────────────────────────────────────────────────────────────────

const INLINE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  @page { size: legal landscape; margin: 0; }

  :root {
    --cd-900:#2B270A; --cd-700:#4E471A; --cd-500:#7A7030;
    --cd-400:#A09448; --cd-200:#CEBF7A; --cd-100:#E0D49A; --cd-050:#F0EBCA;
    --cream:#FFFCF0; --cream-2:#FAF4DC; --cream-3:#FAF8F0;
    --edge:#0C0C0C;
    --txt:#18140A; --txt-mid:#4A4228; --txt-dim:#6E6745;
    --adv-c:#1D6A3A; --adv-bg:#E4F4E8;
    --prof-c:#154360; --prof-bg:#E1ECF6;
    --dev-c:#784212; --dev-bg:#FCE9CE;
    --beg-c:#6E2C00; --beg-bg:#F8DCBE;
    --ny-c:#7B241C; --ny-bg:#FADBD8;
    --ex-c:#555; --ex-bg:#f0f0f0;
    --pass:#145A32;
    --font-sans:'Inter','Segoe UI','Helvetica Neue',Arial,sans-serif;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    font-family: var(--font-sans);
    color: var(--txt);
    background: #fff;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  body { display: flex; flex-direction: column; align-items: center; padding: 0; }

  .print-bar {
    width: 100%; padding: 10px 24px;
    background: var(--cd-900); color: var(--cream);
    display: flex; align-items: center; gap: 12px; flex-shrink: 0;
  }
  .print-bar span { font-size: 12px; color: var(--cd-200); flex: 1; }
  .print-btn {
    padding: 7px 18px; background: var(--cd-400); color: var(--cream);
    border: none; border-radius: 4px; font-size: 13px; font-weight: 700;
    cursor: pointer; font-family: var(--font-sans);
  }

  .rc {
    width: 14in; height: 8.5in;
    background: var(--cream);
    border: 3px solid var(--edge);
    display: flex; flex-direction: column;
    overflow: hidden;
    color: var(--txt);
    margin: 20px;
  }

  /* Header */
  .hdr {
    background: var(--cd-900); border-bottom: 2px solid var(--edge);
    display: flex; align-items: center; padding: 7px 22px; gap: 16px;
    color: var(--cream); flex-shrink: 0;
  }
  .crest-wrap {
    width:52px; height:52px; border-radius:50%;
    background:var(--cream); border:1.5px solid var(--cd-400);
    padding:2px; flex-shrink:0; overflow:hidden;
    display:flex; align-items:center; justify-content:center;
  }
  .crest-wrap img { width:100%; height:100%; object-fit:contain; border-radius:50%; }
  .crest-wrap .no-img {
    font-size:8px; font-weight:800; color:var(--cd-700);
    text-align:center; line-height:1.2; letter-spacing:0.3px;
  }
  .hdr-school { flex:1; display:flex; flex-direction:column; gap:3px; line-height:1.1; }
  .hdr-name { font-size:22px; font-weight:900; letter-spacing:1.4px; text-transform:uppercase; }
  .hdr-loc  { font-size:10.5px; font-weight:500; color:var(--cd-100); letter-spacing:0.6px; }
  .hdr-meta { font-size:9px; font-weight:500; color:var(--cd-200); letter-spacing:0.4px; margin-top:2px; }
  .hdr-right { text-align:right; display:flex; flex-direction:column; gap:3px; line-height:1.15; }
  .hdr-title { font-size:14px; font-weight:800; letter-spacing:2.2px; text-transform:uppercase; }
  .hdr-year  { font-size:10px; font-weight:500; color:var(--cd-100); letter-spacing:0.8px; }
  .hdr-class { font-size:9px; font-weight:600; color:var(--cd-200); letter-spacing:1.4px; text-transform:uppercase; margin-top:2px; }

  /* Info strip */
  .info-strip {
    display:grid; grid-template-columns:1.6fr 0.9fr 0.7fr 1fr 1fr 1fr 1fr;
    border-bottom:2px solid var(--edge); background:var(--cream-3); flex-shrink:0;
  }
  .info-cell { padding:5px 12px 6px; border-right:1px solid var(--cd-200); display:flex; flex-direction:column; gap:2px; }
  .info-cell:last-child { border-right:none; }
  .info-eyebrow { font-size:7.5px; font-weight:700; letter-spacing:1.4px; color:var(--cd-500); text-transform:uppercase; }
  .info-value   { font-size:11.5px; font-weight:700; color:var(--txt); }
  .info-value .sl { color:var(--cd-400); margin:0 3px; font-weight:500; }
  .info-value .dim { font-size:9.5px; color:var(--txt-dim); font-weight:500; }

  /* Body */
  .body { flex:1; display:grid; grid-template-columns:1fr 4.2in; min-height:0; }

  /* Marks table */
  .marks { border-right:2px solid var(--edge); display:flex; flex-direction:column; overflow:hidden; }
  table.marks-tbl { width:100%; border-collapse:collapse; table-layout:fixed; font-size:10px; }
  .marks-tbl thead .term-head th {
    background:var(--cd-700); color:var(--cream);
    font-size:8.5px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase;
    padding:4px 8px; border-right:1px solid var(--cd-400); border-bottom:1px solid var(--edge); text-align:center;
  }
  .marks-tbl thead .term-head th:first-child { background:var(--cd-900); text-align:left; }
  .marks-tbl thead .term-head th:last-child  { border-right:none; }
  .marks-tbl thead .col-head th {
    background:var(--cd-200); color:var(--cd-900);
    font-size:8px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase;
    padding:2.5px 6px; border-right:1px solid var(--cd-400); border-bottom:1.5px solid var(--edge); text-align:center;
  }
  .marks-tbl thead .col-head th.col-sub { background:var(--cd-100); text-align:left; padding-left:10px; }
  .marks-tbl thead .col-head th:last-child { border-right:none; }
  .marks-tbl td {
    padding:1px 8px; border-bottom:1px solid var(--cd-100); border-right:1px solid var(--cd-100);
    font-size:10px; text-align:center; color:var(--txt); background:var(--cream); line-height:1.1;
  }
  .marks-tbl td:last-child  { border-right:none; }
  .marks-tbl td.subj-col   { text-align:left; padding-left:18px; color:var(--txt-mid); }
  .marks-tbl tr.subj-head td {
    background:var(--cream-2); border-bottom:1px solid var(--cd-200); border-top:1px solid var(--cd-200);
    font-weight:800; color:var(--cd-900); font-size:10px; letter-spacing:1.2px; text-transform:uppercase; padding:1px 8px;
  }
  .marks-tbl tr.subj-head td.subj-col { padding-left:10px; }
  .score { font-weight:700; color:var(--txt); font-variant-numeric:tabular-nums; }

  /* Achievement pill */
  .ach {
    display:inline-block; font-size:9px; font-weight:800;
    padding:0.5px 7px; border-radius:3px; letter-spacing:0.4px; line-height:1.3; min-width:36px; text-align:center;
  }
  .ach.adv  { color:var(--adv-c);  background:var(--adv-bg);  }
  .ach.prof { color:var(--prof-c); background:var(--prof-bg); }
  .ach.dev  { color:var(--dev-c);  background:var(--dev-bg);  }
  .ach.beg  { color:var(--beg-c);  background:var(--beg-bg);  }
  .ach.ny   { color:var(--ny-c);   background:var(--ny-bg);   }
  .ach.ex   { color:var(--ex-c);   background:var(--ex-bg);   }

  /* Right summary panels */
  .summary { display:flex; flex-direction:column; background:var(--cream); }
  .panel + .panel { border-top:2px solid var(--edge); }
  .panel { display:flex; flex-direction:column; }
  .panel-bar {
    background:var(--cd-700); color:var(--cream);
    font-size:9px; font-weight:800; letter-spacing:2px; text-transform:uppercase;
    padding:5px 12px; border-bottom:1px solid var(--edge); display:flex; align-items:center; gap:6px;
  }
  .panel-bar::before { content:'▸'; color:var(--cd-200); font-size:10px; }
  .panel-bar.annual  { background:var(--cd-900); }
  .panel-body { padding:7px 12px 9px; background:var(--cream); display:flex; flex-direction:column; gap:6px; flex:1; }
  .stat-row { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  .stat { background:var(--cd-050); border:1px solid var(--cd-200); border-radius:3px; padding:5px 8px; display:flex; flex-direction:column; gap:2px; }
  .stat .eyebrow { font-size:7.5px; font-weight:700; letter-spacing:1.2px; color:var(--cd-500); text-transform:uppercase; }
  .stat .value   { font-size:12px; font-weight:800; color:var(--txt); line-height:1.15; display:flex; align-items:baseline; gap:4px; }
  .stat .value .ach { font-size:9.5px; padding:1.5px 6px; }
  .arrow    { color:var(--adv-c); font-weight:800; }
  .arrow.dn { color:var(--ny-c); }
  .remark {
    font-size:9.5px; font-style:italic; color:var(--cd-900); line-height:1.5;
    border-top:1px dashed var(--cd-200); padding-top:6px; text-wrap:pretty;
  }
  .remark::before { content:'“'; color:var(--cd-400); font-weight:800; font-size:14px; line-height:0; vertical-align:-2px; margin-right:1px; }
  .remark::after  { content:'”'; color:var(--cd-400); font-weight:800; font-size:14px; line-height:0; vertical-align:-4px; margin-left:1px; }

  /* Footer */
  .footer { border-top:2px solid var(--edge); background:var(--cream-3); flex-shrink:0; display:flex; flex-direction:column; }
  .scale-row { padding:6px 22px 7px; display:flex; align-items:center; gap:18px; border-bottom:1px solid var(--cd-200); }
  .scale-label { font-size:8.5px; font-weight:800; color:var(--cd-700); letter-spacing:1.4px; text-transform:uppercase; white-space:nowrap; }
  .scale-items { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .scale-item  { display:inline-flex; align-items:baseline; gap:5px; font-size:9.5px; color:var(--txt-mid); }
  .scale-item .ach   { font-size:8.5px; padding:1px 6px; }
  .scale-item .sname { font-weight:700; color:var(--txt); }
  .scale-item .range { color:var(--txt-dim); font-variant-numeric:tabular-nums; }
  .sign-row  { padding:18px 32px 16px; display:grid; grid-template-columns:repeat(3,1fr); gap:48px; }
  .sign      { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:8px; min-height:36px; }
  .sign-line { width:100%; border-top:1px solid var(--edge); }
  .sign-label { font-size:9px; font-weight:700; color:var(--cd-700); text-transform:uppercase; letter-spacing:1.4px; }
  .disclaimer { padding:0 22px 8px; font-size:7.5px; color:var(--txt-dim); letter-spacing:0.4px; text-align:center; font-weight:500; }

  @media print {
    html, body { background:#fff !important; padding:0; display:block; }
    .print-bar { display:none !important; }
    .rc { box-shadow:none !important; margin:0; width:14in; height:8.5in; }
  }
`;

// ── Table row builders ────────────────────────────────────────────────────────

function buildTableRows(hy1Card, hy2Card) {
  // Build merged subject list from both cards
  const subjectMap = new Map();
  const addSubjects = (card) => {
    if (!card?.subjects) return;
    card.subjects.forEach(s => {
      if (!subjectMap.has(s.subject_id)) {
        subjectMap.set(s.subject_id, { name: s.subject_name, criteria: [] });
        // Gather criterion names
        (s.criteria || []).forEach(c => {
          subjectMap.get(s.subject_id).criteria.push(c.criterion_id);
        });
      }
    });
  };
  addSubjects(hy1Card);
  addSubjects(hy2Card);

  let rows = '';

  subjectMap.forEach((subj, subjId) => {
    const hy1Subj = hy1Card?.subjects?.find(x => x.subject_id === subjId);
    const hy2Subj = hy2Card?.subjects?.find(x => x.subject_id === subjId);

    const hy1SCode = hy1Subj?.subjectGrade || (hy1Card ? 'Ex' : null);
    const hy2SCode = hy2Subj?.subjectGrade || (hy2Card ? 'Ex' : null);

    // Compute annual subject grade
    const avgs = [hy1Subj?.subjectAverage, hy2Subj?.subjectAverage].filter(v => v != null);
    const annAvg = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
    const annSCode = gradeCode(annAvg);

    rows += `<tr class="subj-head">
      <td class="subj-col" colspan="3">${esc(subj.name)}</td>
      <td></td><td></td>
      <td>${ach(annSCode)}</td>
    </tr>`;

    // Criteria rows
    const criteriaMap = new Map();
    (hy1Subj?.criteria || []).forEach(c => criteriaMap.set(c.criterion_id, { name: c.criterion_name, hy1Score: c.averageScore ?? null, hy1Grade: c.grade || gradeCode(c.averageScore), hy2Score: null, hy2Grade: null }));
    (hy2Subj?.criteria || []).forEach(c => {
      if (!criteriaMap.has(c.criterion_id)) criteriaMap.set(c.criterion_id, { name: c.criterion_name, hy1Score: null, hy1Grade: null, hy2Score: null, hy2Grade: null });
      criteriaMap.get(c.criterion_id).hy2Score = c.averageScore ?? null;
      criteriaMap.get(c.criterion_id).hy2Grade = c.grade || gradeCode(c.averageScore);
    });

    criteriaMap.forEach(c => {
      const ca = [c.hy1Score, c.hy2Score].filter(v => v !== null);
      const annCAvg = ca.length ? ca.reduce((a, b) => a + b, 0) / ca.length : null;
      const annCCode = gradeCode(annCAvg);

      const hy1ScoreCell = c.hy1Score !== null ? `<td class="score">${c.hy1Score.toFixed(1)}</td><td>${ach(c.hy1Grade || 'Ex')}</td>` : `<td>—</td><td>${ach('Ex')}</td>`;
      const hy2ScoreCell = c.hy2Score !== null ? `<td class="score">${c.hy2Score.toFixed(1)}</td><td>${ach(c.hy2Grade || 'Ex')}</td>` : `<td>—</td><td>${ach('Ex')}</td>`;

      rows += `<tr>
        <td class="subj-col">${esc(c.name)}</td>
        ${hy1ScoreCell}
        ${hy2ScoreCell}
        <td>${ach(annCCode)}</td>
      </tr>`;
    });
  });

  return rows || `<tr><td colspan="6" style="color:#888;font-style:italic;padding:12px">No assessment data found.</td></tr>`;
}

// ── Right summary panels ──────────────────────────────────────────────────────

function buildPanel(card, term, label, dateRange, isAnnual = false) {
  const barClass = isAnnual ? 'panel-bar annual' : 'panel-bar';
  if (!card) {
    return `<section class="panel">
      <div class="${barClass}">${esc(label)} · ${esc(dateRange)}</div>
      <div class="panel-body" style="align-items:center;justify-content:center">
        <div style="font-size:9.5px;color:var(--txt-dim);font-style:italic">Results not yet released.</div>
      </div>
    </section>`;
  }

  const overallCode = card.overallGrade || gradeCode(card.overallAverageScore);
  const overallWord = card.overallLabel  || gradeWord(card.overallAverageScore);
  const avg = card.overallAverageScore;

  const strongest = card.strongestSubject || '—';
  const weakest   = card.improvementAreas?.[0] || card.weakestSubject || null;
  const mostImproved = card.mostImprovedSubject || null;

  const stat3Label = term === 'HY2' && mostImproved ? 'Most Improved' : 'Strongest Subject';
  const stat3Value = term === 'HY2' && mostImproved
    ? `${esc(mostImproved)} <span class="arrow">↑</span>`
    : `<span style="font-size:11px">${esc(strongest)}</span>`;

  const stat4Label = weakest ? 'Needs Attention' : 'Trend';
  const stat4Value = weakest
    ? `<span style="font-size:11px;color:var(--ny-c)">${esc(weakest)}</span>`
    : `<span style="font-size:11px"><span class="arrow">↑</span> ${esc(card.trendDirection || 'Stable')}</span>`;

  return `<section class="panel">
    <div class="${barClass}">${esc(label)} · ${esc(dateRange)}</div>
    <div class="panel-body">
      <div class="stat-row">
        <div class="stat">
          <div class="eyebrow">Overall Level</div>
          <div class="value">${ach(overallCode)} ${esc(overallWord)}</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Average Score</div>
          <div class="value">${avg !== null ? avg.toFixed(2) : '—'} <span style="font-size:9px;color:var(--txt-dim);font-weight:600">/ 5.0</span></div>
        </div>
        <div class="stat">
          <div class="eyebrow">${stat3Label}</div>
          <div class="value">${stat3Value}</div>
        </div>
        <div class="stat">
          <div class="eyebrow">${stat4Label}</div>
          <div class="value">${stat4Value}</div>
        </div>
      </div>
      <div class="remark">${esc(card.teacherRemark || '')}</div>
    </div>
  </section>`;
}

function buildAnnualPanel(hy1Card, hy2Card) {
  if (!hy1Card && !hy2Card) {
    return `<section class="panel">
      <div class="panel-bar annual">Annual Standing</div>
      <div class="panel-body" style="align-items:center;justify-content:center">
        <div style="font-size:9.5px;color:var(--txt-dim);font-style:italic">Available when both terms are released.</div>
      </div>
    </section>`;
  }

  const summary = computeAnnualSummary(hy1Card, hy2Card);
  const promoted = summary.promotedToClass;
  const trend = (summary.hy1Avg !== null && summary.hy2Avg !== null)
    ? (summary.hy2Avg >= summary.hy1Avg ? '↑ Improving' : '↓ Declining')
    : 'In Progress';

  const yearRange = `${hy1Card?.academicYear || hy2Card?.academicYear || '2025–2026'}`;

  return `<section class="panel">
    <div class="panel-bar annual">Annual Standing · ${yearRange}</div>
    <div class="panel-body">
      <div class="stat-row">
        <div class="stat">
          <div class="eyebrow">Annual Level</div>
          <div class="value">${ach(summary.annualOverallGrade)} ${esc(summary.annualOverallLabel)}</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Year Average</div>
          <div class="value">${summary.annualOverallAvg !== null ? summary.annualOverallAvg.toFixed(2) : '—'} <span style="font-size:9px;color:var(--txt-dim);font-weight:600">/ 5.0</span></div>
        </div>
        <div class="stat">
          <div class="eyebrow">Year Trend</div>
          <div class="value" style="font-size:11px">${esc(trend)}</div>
        </div>
        <div class="stat">
          <div class="eyebrow">Promoted To</div>
          <div class="value" style="font-size:11px;color:var(--pass)">${promoted ? esc(promoted) + ' ✓' : 'Pending'}</div>
        </div>
      </div>
      <div class="remark">${esc(hy2Card?.annualRemark || hy1Card?.annualRemark || 'Annual remarks will appear here once both terms are finalised.')}</div>
    </div>
  </section>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a self-contained, printable legal-landscape HTML document.
 * Single page containing both half-yearly terms and annual summary.
 * All CSS inline. No Firebase. No external dependencies (except Google Fonts via CDN).
 *
 * @param {object|null} hy1Card     - HY1 report card Firestore doc, or null
 * @param {object|null} hy2Card     - HY2 report card Firestore doc, or null
 * @param {object}      studentInfo - { studentName, className, rollNo, studentId, section?, phone? }
 * @param {object}      [opts]      - { logoUrl? }
 * @returns {string}                - Full self-contained HTML
 */
export function buildPrintableHTML(hy1Card, hy2Card, studentInfo, opts = {}) {
  const info = studentInfo || {
    studentName: hy1Card?.studentName || hy2Card?.studentName || '—',
    className:   hy1Card?.className   || hy2Card?.className   || '—',
    rollNo:      hy1Card?.rollNo      || hy2Card?.rollNo      || '—',
    studentId:   hy1Card?.studentId   || hy2Card?.studentId   || '—',
  };

  const section     = info.section || '';
  const classLabel  = section ? `${esc(info.className)} — ${esc(section)}` : esc(info.className);
  const academicYear = hy1Card?.academicYear || hy2Card?.academicYear || '2025–2026';

  const logoUrl = opts.logoUrl || '';
  const crestHTML = logoUrl
    ? `<div class="crest-wrap"><img src="${esc(logoUrl)}" alt="School crest" /></div>`
    : `<div class="crest-wrap"><div class="no-img">SFDS<br>CREST</div></div>`;

  // Attendance values
  const hy1Present = hy1Card?.attendancePresentDays ?? null;
  const hy1Working = hy1Card?.attendanceWorkingDays ?? null;
  const hy2Present = hy2Card?.attendancePresentDays ?? null;
  const hy2Working = hy2Card?.attendanceWorkingDays ?? null;

  const totalPresent = (hy1Present ?? 0) + (hy2Present ?? 0);
  const totalWorking = (hy1Working ?? 0) + (hy2Working ?? 0);

  function attCell(present, working) {
    if (present === null || working === null) return `___ <span class="sl">/</span> ___ <span class="dim">days</span>`;
    return `${present}<span class="sl">/</span>${working} <span class="dim">days</span>`;
  }

  const tableRows = buildTableRows(hy1Card, hy2Card);

  // Term date ranges
  const hy1Range = hy1Card?.dateFrom ? `${hy1Card.dateFrom} – ${hy1Card.dateTo}` : 'Apr – Sep';
  const hy2Range = hy2Card?.dateFrom ? `${hy2Card.dateFrom} – ${hy2Card.dateTo}` : 'Oct – Mar';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Annual Progress Report — ${esc(info.studentName)}</title>
  <style>${INLINE_CSS}</style>
</head>
<body>

<div class="print-bar">
  <span>Annual Progress Report &nbsp;·&nbsp; ${esc(info.studentName)} &nbsp;·&nbsp; ${classLabel}</span>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
</div>

<div style="padding:20px;display:flex;justify-content:center">
<main class="rc">

  <header class="hdr">
    ${crestHTML}
    <div class="hdr-school">
      <div class="hdr-name">St. Francis De Sales School</div>
      <div class="hdr-loc">Laitkor, Shillong — Meghalaya · Affiliated to CBSE</div>
      <div class="hdr-meta">Ph: 9612946550</div>
    </div>
    <div class="hdr-right">
      <div class="hdr-title">Annual Progress Report</div>
      <div class="hdr-year">Academic Year ${esc(academicYear)}</div>
      <div class="hdr-class">Primary Section · ${esc(info.className)}</div>
    </div>
  </header>

  <section class="info-strip">
    <div class="info-cell">
      <div class="info-eyebrow">Student Name</div>
      <div class="info-value">${esc(info.studentName)}</div>
    </div>
    <div class="info-cell">
      <div class="info-eyebrow">Class &amp; Section</div>
      <div class="info-value">${classLabel}</div>
    </div>
    <div class="info-cell">
      <div class="info-eyebrow">Roll No.</div>
      <div class="info-value">${esc(info.rollNo)}</div>
    </div>
    <div class="info-cell">
      <div class="info-eyebrow">Student ID</div>
      <div class="info-value">${esc(info.studentId)}</div>
    </div>
    <div class="info-cell">
      <div class="info-eyebrow">HY1 Attendance</div>
      <div class="info-value">${attCell(hy1Present, hy1Working)}</div>
    </div>
    <div class="info-cell">
      <div class="info-eyebrow">HY2 Attendance</div>
      <div class="info-value">${attCell(hy2Present, hy2Working)}</div>
    </div>
    <div class="info-cell">
      <div class="info-eyebrow">Total Attendance</div>
      <div class="info-value">${totalWorking > 0 ? attCell(totalPresent, totalWorking) : '___ <span class="sl">/</span> ___ <span class="dim">days</span>'}</div>
    </div>
  </section>

  <div class="body">

    <section class="marks">
      <table class="marks-tbl">
        <colgroup>
          <col style="width:32%" />
          <col style="width:13%" />
          <col style="width:13%" />
          <col style="width:13%" />
          <col style="width:13%" />
          <col style="width:16%" />
        </colgroup>
        <thead>
          <tr class="term-head">
            <th rowspan="2">Subject &amp; Criterion</th>
            <th colspan="2">First Half-Yearly</th>
            <th colspan="2">Second Half-Yearly</th>
            <th rowspan="2">Annual<br/><span style="font-weight:500;letter-spacing:0.5px;font-size:7.5px;opacity:0.7">overall</span></th>
          </tr>
          <tr class="col-head">
            <th>Score</th><th>Level</th>
            <th>Score</th><th>Level</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </section>

    <aside class="summary">
      ${buildPanel(hy1Card, 'HY1', 'First Half-Yearly', hy1Range)}
      ${buildPanel(hy2Card, 'HY2', 'Second Half-Yearly', hy2Range)}
      ${buildAnnualPanel(hy1Card, hy2Card)}
    </aside>

  </div>

  <footer class="footer">
    <div class="scale-row">
      <div class="scale-label">Achievement Scale</div>
      <div class="scale-items">
        <div class="scale-item"><span class="ach adv">Adv</span><span class="sname">Advanced</span><span class="range">4.5 – 5.0</span></div>
        <div class="scale-item"><span class="ach prof">Prof</span><span class="sname">Proficient</span><span class="range">3.5 – 4.4</span></div>
        <div class="scale-item"><span class="ach dev">Dev</span><span class="sname">Developing</span><span class="range">2.5 – 3.4</span></div>
        <div class="scale-item"><span class="ach beg">Beg</span><span class="sname">Beginning</span><span class="range">1.5 – 2.4</span></div>
        <div class="scale-item"><span class="ach ny">NY</span><span class="sname">Not Yet</span><span class="range">0 – 1.4</span></div>
      </div>
    </div>
    <div class="sign-row">
      <div class="sign"><div class="sign-line"></div><div class="sign-label">Class Teacher</div></div>
      <div class="sign"><div class="sign-line"></div><div class="sign-label">Parent / Guardian</div></div>
      <div class="sign"><div class="sign-line"></div><div class="sign-label">Principal</div></div>
    </div>
    <div class="disclaimer">Computer-generated document &nbsp;|&nbsp; Verify with school records &nbsp;|&nbsp; No signature required for validity</div>
  </footer>

</main>
</div>

</body>
</html>`;
}
