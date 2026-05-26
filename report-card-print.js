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
  @page { size: A4 landscape; margin: 0; }

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
  /* Stretch table to fill remaining height when rows are few (e.g. Class II) */
  table.marks-tbl.stretch-rows { height:100%; }
  table.marks-tbl.stretch-rows tbody { height:100%; }
  table.marks-tbl.stretch-rows tbody tr { height:1px; } /* equal distribution trick */
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
    /* Card was designed for 14×8.5in (legal landscape). Scale to A4 landscape
       (297mm × 210mm ≈ 11.69×8.27in) — single-page fit on most printers. */
    .rc { box-shadow:none !important; margin:0; width:14in; height:8.5in; zoom:0.835; }
  }

  /* ── Mobile ebook view ───────────────────────────────── */
  @media (max-width: 900px) {
    html { overflow-x: hidden; }
    body { background: #2B270A; padding: 0; overflow-x: hidden; }

    /* Sticky top bar */
    .print-bar { position: sticky; top: 0; z-index: 100; padding: 8px 14px; gap: 8px; }
    .print-bar span { font-size: 11px; }
    .print-btn { padding: 6px 14px; font-size: 12px; white-space: nowrap; }

    /* Card: full viewport width, auto height, no overflow clipping */
    body > div { padding: 0 !important; display: block !important; }
    .rc {
      width: 100vw !important; max-width: 100vw !important;
      height: auto !important; margin: 0 !important;
      border-left: none !important; border-right: none !important;
      box-shadow: none !important; overflow: hidden !important;
    }

    /* Header: stack vertically */
    .hdr {
      flex-wrap: wrap; padding: 10px 12px; gap: 8px; align-items: flex-start;
    }
    .crest-wrap { width: 40px; height: 40px; flex-shrink: 0; }
    .hdr-school { flex: 1; min-width: 0; }
    .hdr-name { font-size: 13px; letter-spacing: 0.4px; line-height: 1.3; white-space: normal; }
    .hdr-loc  { font-size: 9px; white-space: normal; }
    .hdr-meta { font-size: 8px; }
    /* Right side drops below on very small screens */
    .hdr-right {
      width: 100%; text-align: left; border-top: 1px solid rgba(255,255,255,0.15);
      padding-top: 6px; margin-top: 2px;
      display: flex; flex-direction: row; gap: 12px; align-items: baseline; flex-wrap: wrap;
    }
    .hdr-title { font-size: 11px; letter-spacing: 0.8px; }
    .hdr-year  { font-size: 10px; }
    .hdr-class { font-size: 9px; letter-spacing: 0.6px; margin-top: 0; }

    /* Info strip: 2-column grid, all cells visible */
    .info-strip {
      grid-template-columns: 1fr 1fr !important;
      width: 100%; overflow: hidden;
    }
    .info-cell { padding: 6px 10px; border-right: 1px solid var(--cd-200); overflow: hidden; }
    .info-cell:last-child { border-right: none; }
    .info-eyebrow { font-size: 7.5px; letter-spacing: 0.8px; }
    .info-value   { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    /* Body: single column stack */
    .body { display: flex !important; flex-direction: column !important; min-height: unset !important; }

    /* Marks section: scroll only inside this box */
    .marks {
      border-right: none !important;
      border-bottom: 2px solid var(--edge);
      overflow-x: auto !important;
      overflow-y: visible !important;
      -webkit-overflow-scrolling: touch;
      width: 100%;
    }
    table.marks-tbl { table-layout: auto !important; min-width: 380px; font-size: 11px; }

    /* Sticky first column — subject/criterion stays pinned */
    .marks-tbl thead .term-head th:first-child,
    .marks-tbl thead .col-head th.col-sub,
    .marks-tbl td.subj-col {
      position: sticky; left: 0; z-index: 2;
      width: 120px; min-width: 120px; max-width: 120px;
      white-space: normal; word-break: break-word;
    }
    .marks-tbl thead .term-head th:first-child { background: var(--cd-900) !important; }
    .marks-tbl thead .col-head th.col-sub      { background: var(--cd-100) !important; }
    .marks-tbl td.subj-col                     { background: var(--cream) !important; }
    .marks-tbl tr.subj-head td.subj-col        { background: var(--cream-2) !important; }

    .marks-tbl thead .term-head th { font-size: 8.5px; padding: 4px 6px; }
    .marks-tbl thead .col-head  th { font-size: 8px; padding: 3px 5px; }
    .marks-tbl td    { font-size: 10.5px; padding: 3px 7px; }
    .marks-tbl td.subj-col { padding-left: 8px; font-size: 10px; }
    .marks-tbl tr.subj-head td { font-size: 9.5px; padding: 3px 6px; letter-spacing: 0.6px; }
    .marks-tbl tr.subj-head td.subj-col { padding-left: 7px; }
    .ach { font-size: 9.5px; padding: 1px 5px; min-width: 34px; }

    /* Summary panels: full width stacked */
    .summary { border-top: none; }
    .panel + .panel { border-top: 2px solid var(--edge); }
    .panel-bar  { font-size: 10px; padding: 8px 12px; letter-spacing: 1px; }
    .panel-body { padding: 10px 12px; gap: 8px; }
    .stat-row   { grid-template-columns: 1fr 1fr; gap: 7px; }
    .stat { padding: 7px 9px; }
    .stat .eyebrow { font-size: 8px; }
    .stat .value   { font-size: 13px; }
    .remark { font-size: 11px; line-height: 1.6; padding-top: 8px; }

    /* Footer */
    .footer { width: 100%; }
    .scale-row  { flex-wrap: wrap; padding: 8px 12px; gap: 8px; }
    .scale-label { font-size: 8.5px; }
    .scale-items { gap: 7px; flex-wrap: wrap; }
    .scale-item  { font-size: 9.5px; }
    .sign-row   { padding: 16px 16px 12px; gap: 12px; grid-template-columns: repeat(3,1fr); }
    .sign-label { font-size: 8.5px; letter-spacing: 0.7px; }
    .disclaimer { font-size: 7.5px; padding: 0 12px 8px; }
  }
`;

// ── Table row builders ────────────────────────────────────────────────────────

// Fallback: derive category from criterion_id suffix for older saved cards
function inferCategory(id) {
  if (!id) return 'General';
  const u = id.toUpperCase();
  if (u.includes('_WH')) return 'Work Habits';
  if (u.includes('_WS')) return 'Writing Skills';
  if (u.includes('_RS')) return 'Reading Skills';
  if (u.includes('_SS')) return 'Speaking Skills';
  return 'General';
}

function buildTableRows(hy1Card, hy2Card, isPrimary = false) {
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

    if (isPrimary) {
      // Primary (Class I & II): subject header + one row per CATEGORY (e.g. Work Habits)
      rows += `<tr class="subj-head">
        <td class="subj-col" colspan="3">${esc(subj.name)}</td>
        <td></td><td></td>
        <td>${ach(annSCode)}</td>
      </tr>`;

      // Build category → criteria map from both terms
      const catMap = new Map(); // category → { hy1Scores[], hy2Scores[], hy1Grade, hy2Grade }
      const addToCat = (criteria, term) => {
        (criteria || []).forEach(c => {
          const cat = c.category || inferCategory(c.criterion_id) || 'General';
          if (!catMap.has(cat)) catMap.set(cat, { hy1Scores: [], hy2Scores: [] });
          if (term === 'hy1' && c.averageScore != null) catMap.get(cat).hy1Scores.push(c.averageScore);
          if (term === 'hy2' && c.averageScore != null) catMap.get(cat).hy2Scores.push(c.averageScore);
        });
      };
      addToCat(hy1Subj?.criteria, 'hy1');
      addToCat(hy2Subj?.criteria, 'hy2');

      catMap.forEach((cat, catName) => {
        const hy1Avg = cat.hy1Scores.length ? cat.hy1Scores.reduce((a, b) => a + b, 0) / cat.hy1Scores.length : null;
        const hy2Avg = cat.hy2Scores.length ? cat.hy2Scores.reduce((a, b) => a + b, 0) / cat.hy2Scores.length : null;
        const annAvgs = [hy1Avg, hy2Avg].filter(v => v !== null);
        const annAvg  = annAvgs.length ? annAvgs.reduce((a, b) => a + b, 0) / annAvgs.length : null;

        const hy1Cell = hy1Avg !== null
          ? `<td class="score">${hy1Avg.toFixed(1)}</td><td>${ach(gradeCode(hy1Avg))}</td>`
          : `<td>—</td><td>${ach('Ex')}</td>`;
        const hy2Cell = hy2Avg !== null
          ? `<td class="score">${hy2Avg.toFixed(1)}</td><td>${ach(gradeCode(hy2Avg))}</td>`
          : `<td>—</td><td>${ach('Ex')}</td>`;

        rows += `<tr>
          <td class="subj-col" style="padding-left:18px">${esc(catName)}</td>
          ${hy1Cell}
          ${hy2Cell}
          <td>${ach(gradeCode(annAvg))}</td>
        </tr>`;
      });
    } else {
      // All other classes: subject header + individual criteria rows
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
    }
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

  // Resolve relative asset URLs against the current origin so the report HTML
  // works in any context — new window (about:blank), iframe with blob URL, etc.
  const baseOrigin = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin + '/'
    : '/';
  const logoUrl = opts.logoUrl || (baseOrigin + 'assets/images/logo.webp');
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

  // Primary classes (I & II) show category-grouped rows, not individual criteria
  const classNorm = (info.className || '').toLowerCase().trim();
  const isClassI  = ['class i', 'class 1', 'i', '1'].includes(classNorm);
  const isClassII = ['class ii', 'class 2', 'ii', '2'].includes(classNorm);
  const isPrimary = isClassI || isClassII;
  // Class I has fewer subjects (no Hindi) → stretch rows to fill page height
  const stretchRows = isClassI;
  const tableRows = buildTableRows(hy1Card, hy2Card, isPrimary);

  // Term date ranges
  const hy1Range = hy1Card?.dateFrom ? `${hy1Card.dateFrom} – ${hy1Card.dateTo}` : 'Apr – Sep';
  const hy2Range = hy2Card?.dateFrom ? `${hy2Card.dateFrom} – ${hy2Card.dateTo}` : 'Oct – Mar';

  const safeName = (info.studentName || 'student').replace(/[^a-zA-Z0-9]+/g, '_');
  const safeClass = (info.className || '').replace(/[^a-zA-Z0-9]+/g, '_');
  const pdfFilename = `ReportCard_${safeName}${safeClass ? '_' + safeClass : ''}.pdf`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Annual Progress Report — ${esc(info.studentName)}</title>
  <style>${INLINE_CSS}</style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  <script>
    // Back button — works for new-window (desktop), iframe overlay (Capacitor APK),
    // and as a last resort, navigates to root.
    function rcGoBack() {
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: 'closeReportOverlay' }, '*');
          return;
        }
      } catch (_) {}
      if (window.opener) {
        try { window.opener.focus(); } catch (_) {}
        try { window.close(); return; } catch (_) {}
      }
      if (history.length > 1) { history.back(); return; }
      window.location.href = '/';
    }

    // Generate one-page PDF client-side. Try Web Share first (Capacitor APK,
    // mobile browsers) so the user can save/share via the system sheet, then
    // fall back to anchor-download (desktop browsers).
    async function rcDownloadPDF() {
      const btn = document.getElementById('rc-pdf-btn');
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.textContent = '⏳ Generating PDF…'; btn.disabled = true; }
      try {
        if (typeof html2pdf === 'undefined') {
          throw new Error('PDF library not loaded. Check your connection and try again.');
        }
        const rc = document.querySelector('.rc');
        if (!rc) throw new Error('Report card content not found');
        const filename = ${JSON.stringify(pdfFilename)};

        // Force desktop landscape layout for capture regardless of the actual
        // device viewport. Three defensive measures:
        //   1) windowWidth/Height: tell html2canvas to render at 14×8.5in @96dpi
        //   2) Strip the mobile @media block from cloned <style> by brace count
        //      (more reliable than regex with nested rules)
        //   3) Append a final override <style> with !important desktop rules,
        //      in case the strip missed anything
        function applyDesktopLayoutForCapture(clonedDoc) {
          var styles = clonedDoc.querySelectorAll('style');
          for (var i = 0; i < styles.length; i++) {
            var css = styles[i].textContent || '';
            var idx = css.indexOf('@media (max-width: 900px)');
            if (idx < 0) idx = css.indexOf('@media(max-width: 900px)');
            if (idx < 0) idx = css.indexOf('@media (max-width:900px)');
            if (idx < 0) continue;
            var braceStart = css.indexOf('{', idx);
            if (braceStart < 0) continue;
            var depth = 1, j = braceStart + 1;
            while (j < css.length && depth > 0) {
              if (css[j] === '{') depth++;
              else if (css[j] === '}') depth--;
              j++;
            }
            if (depth === 0) {
              styles[i].textContent = css.substring(0, idx) + css.substring(j);
            }
          }
          var override = clonedDoc.createElement('style');
          override.textContent =
            // height:auto + overflow:visible let the report grow to fit ALL
            // content (subjects, signatures, scale). The PDF page below is
            // sized to match the captured height so nothing is clipped.
            "body .rc{width:14in!important;max-width:14in!important;height:auto!important;min-height:8.5in!important;margin:0!important;border:3px solid #0C0C0C!important;overflow:visible!important}" +
            "body .rc .body{display:grid!important;grid-template-columns:1fr 4.2in!important;flex-direction:row!important;min-height:0!important}" +
            "body .rc .info-strip{grid-template-columns:1.6fr 0.9fr 0.7fr 1fr 1fr 1fr 1fr!important;overflow:visible!important;width:auto!important}" +
            "body .rc .info-cell{overflow:visible!important}" +
            "body .rc .info-value{overflow:visible!important;text-overflow:clip!important;white-space:normal!important}" +
            "body .rc .hdr{flex-wrap:nowrap!important;padding:7px 22px!important;gap:16px!important;align-items:center!important}" +
            "body .rc .crest-wrap{width:52px!important;height:52px!important}" +
            "body .rc .hdr-right{width:auto!important;text-align:right!important;display:flex!important;flex-direction:column!important;gap:3px!important;border-top:0!important;padding-top:0!important;margin-top:0!important;align-items:stretch!important;flex-wrap:nowrap!important}" +
            "body .rc .marks{border-right:1px solid var(--cd-200)!important;border-bottom:0!important;overflow:visible!important;width:auto!important}" +
            "body .rc table.marks-tbl{table-layout:auto!important;min-width:0!important;font-size:inherit!important}" +
            "body .rc .marks-tbl thead .term-head th:first-child,body .rc .marks-tbl thead .col-head th.col-sub,body .rc .marks-tbl td.subj-col{position:static!important;width:auto!important;min-width:0!important;max-width:none!important;white-space:nowrap!important;word-break:normal!important}" +
            "body .rc .summary{border-top:0!important}" +
            "body .rc .panel+.panel{border-top:0!important}" +
            "body .rc .footer{width:auto!important}" +
            "body .rc .scale-row{flex-wrap:nowrap!important}" +
            "body .rc .scale-items{flex-wrap:nowrap!important}";
          clonedDoc.head.appendChild(override);
        }
        var h2cOpts = {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          // Fix width to 14in × 96dpi = 1344px. Height is NOT fixed —
          // html2canvas will use the natural rendered height of .rc
          // (height:auto + min-height:8.5in via onclone override).
          width:        1344,
          windowWidth:  1344,
          windowHeight: 2400, // generous: allows long reports to render fully
          scrollX: 0, scrollY: 0,
          onclone: applyDesktopLayoutForCapture
        };

        // Use html2canvas + jsPDF directly when both globals are exposed by
        // the bundle — gives us one-shot, single-page output. Otherwise fall
        // back to the html2pdf chain with the same options.
        const h2c    = window.html2canvas;
        const JsPDF  = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!h2c || !JsPDF) {
          var optFb = {
            margin: 0, filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: h2cOpts,
            jsPDF: { unit: 'in', format: [14, 8.5], orientation: 'landscape' },
            pagebreak: { mode: ['avoid-all'] }
          };
          var blob = await html2pdf().set(optFb).from(rc).outputPdf('blob');
          var file = new File([blob], filename, { type: 'application/pdf' });
        } else {
          var canvas = await h2c(rc, h2cOpts);
          // PDF page = 14in wide, height proportional to captured content.
          // Minimum 8.5in (so short reports still look like legal landscape).
          var pdfW = 14;
          var pdfH = (canvas.height / canvas.width) * pdfW;
          if (pdfH < 8.5) pdfH = 8.5;
          var pdf = new JsPDF({ unit: 'in', format: [pdfW, pdfH], orientation: 'landscape' });
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', 0, 0, pdfW, pdfH, undefined, 'FAST');
          var blob = pdf.output('blob');
          var file = new File([blob], filename, { type: 'application/pdf' });
        }

        // 1) Capacitor Filesystem via parent bridge — best UX on APK if the
        //    @capacitor/filesystem plugin is installed natively.
        const inIframe = (function(){ try { return window.parent !== window; } catch(_) { return false; } })();
        if (inIframe) {
          const fsResult = await new Promise((resolve) => {
            const reqId = 'pdf_' + Date.now() + '_' + Math.random().toString(36).slice(2);
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = String(reader.result || '').split(',')[1] || '';
              function onMsg(e) {
                if (!e || !e.data || e.data.type !== 'pdfSaveResult' || e.data.reqId !== reqId) return;
                window.removeEventListener('message', onMsg);
                resolve(e.data);
              }
              window.addEventListener('message', onMsg);
              window.parent.postMessage({ type: 'savePdfRequest', reqId, filename, base64 }, '*');
              setTimeout(() => {
                window.removeEventListener('message', onMsg);
                resolve({ ok: false, reason: 'timeout' });
              }, 30000);
            };
            reader.onerror = () => resolve({ ok: false, reason: 'read-error' });
            reader.readAsDataURL(blob);
          });
          if (fsResult.ok) {
            alert(fsResult.message || ('Saved: ' + filename));
            return;
          }
          // If parent has no Filesystem plugin, reason is 'no-plugin' — fall through.
        }

        // 2) Web Share API with files (modern mobile browsers, Capacitor on newer WebViews)
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'Report Card' });
            return;
          } catch (err) {
            if (err && err.name === 'AbortError') return; // user cancelled
            // share unavailable — fall through
          }
        }

        // 3) Anchor download (desktop browsers)
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } catch (e) {
        alert('Could not generate PDF: ' + (e && e.message ? e.message : e));
      } finally {
        if (btn) { btn.textContent = orig; btn.disabled = false; }
      }
    }
  </script>
</head>
<body>

<div class="print-bar">
  <span>Annual Progress Report &nbsp;·&nbsp; ${esc(info.studentName)} &nbsp;·&nbsp; ${classLabel}</span>
  <div style="display:flex;gap:8px;align-items:center">
    <button class="print-btn" onclick="rcGoBack()" style="background:#4b5563;">← Back to Portal</button>
    <button class="print-btn" id="rc-pdf-btn" onclick="rcDownloadPDF()">📥 Download PDF</button>
  </div>
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
      <table class="marks-tbl${stretchRows ? ' stretch-rows' : ''}">
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
