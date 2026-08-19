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
// BASE_CSS is the single source of truth for the report card layout. Both
// the visible view (in the iframe overlay) and the PDF capture render from
// it directly. CSS Grid was replaced with flexbox so the layout doesn't
// collapse on narrow mobile viewports AND so the alpha html2canvas bundled
// in html2pdf 0.10.1 renders it correctly. MOBILE_CSS and PDF_LOCK_CSS are
// kept for reference but no longer included in any emitted HTML.

const BASE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  @page { size: 14in 8.5in; margin: 0; }

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

  /* Info strip — flexbox (was grid) for narrow-viewport + alpha-h2c reliability */
  .info-strip {
    display:flex; flex-direction:row; align-items:stretch;
    border-bottom:2px solid var(--edge); background:var(--cream-3); flex-shrink:0;
  }
  .info-cell { padding:5px 12px 6px; border-right:1px solid var(--cd-200); display:flex; flex-direction:column; gap:2px; flex:1 1 0; min-width:0; }
  .info-strip .info-cell:nth-child(1) { flex-grow:1.6; }
  .info-strip .info-cell:nth-child(2) { flex-grow:0.9; }
  .info-strip .info-cell:nth-child(3) { flex-grow:0.7; }
  .info-cell:last-child { border-right:none; }
  .info-eyebrow { font-size:7.5px; font-weight:700; letter-spacing:1.4px; color:var(--cd-500); text-transform:uppercase; }
  .info-value   { font-size:11.5px; font-weight:700; color:var(--txt); }
  .info-value .sl { color:var(--cd-400); margin:0 3px; font-weight:500; }
  .info-value .dim { font-size:9.5px; color:var(--txt-dim); font-weight:500; }

  /* Body — flexbox (was grid) so layout doesn't collapse on narrow mobile
     viewports and so the alpha html2canvas bundled in html2pdf renders it. */
  .body { flex:1; display:flex; flex-direction:row; align-items:stretch; min-height:0; }
  .body > .marks   { flex:1 1 auto; min-width:0; }
  .body > .summary { flex:0 0 4.2in; width:4.2in; min-width:4.2in; }

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

  /* Category-row detail expand — screen only, see @media print below.
     .crit-row is the individual-criterion rows a category rolls up from;
     hidden until the parent .cat-row is clicked. */
  .marks-tbl tr.cat-row { cursor:pointer; }
  .marks-tbl tr.cat-row td.subj-col::before {
    content:'▸'; display:inline-block; width:11px; color:var(--cd-500); font-size:8px;
    transition:transform 0.15s ease;
  }
  .marks-tbl tr.cat-row.expanded td.subj-col::before { transform:rotate(90deg); }
  .marks-tbl tr.crit-row { display:none; }
  .marks-tbl tr.crit-row td.subj-col { padding-left:30px; font-size:9px; color:var(--txt-dim); }
  .marks-tbl tr.crit-row td { font-size:9px; }

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
    padding:4px 12px; border-bottom:1px solid var(--edge); display:flex; align-items:center; gap:6px;
  }
  .panel-bar::before { content:'▸'; color:var(--cd-200); font-size:10px; }
  .panel-bar.annual  { background:var(--cd-900); }
  .panel-body { padding:5px 12px 6px; background:var(--cream); display:flex; flex-direction:column; gap:4px; flex:1; }
  .stat-row { display:flex; flex-direction:row; flex-wrap:wrap; gap:4px; }
  .stat-row > .stat { flex:1 1 calc(50% - 4px); min-width:0; }
  .stat { background:var(--cd-050); border:1px solid var(--cd-200); border-radius:3px; padding:4px 7px; display:flex; flex-direction:column; gap:1px; }
  .stat .eyebrow { font-size:7.5px; font-weight:700; letter-spacing:1.2px; color:var(--cd-500); text-transform:uppercase; }
  .stat .value   { font-size:12px; font-weight:800; color:var(--txt); line-height:1.15; display:flex; align-items:baseline; gap:4px; }
  .stat .value .ach { font-size:9.5px; padding:1.5px 6px; }
  .arrow    { color:var(--adv-c); font-weight:800; }
  .arrow.dn { color:var(--ny-c); }
  .remark {
    font-size:9.5px; font-style:italic; color:var(--cd-900); line-height:1.4;
    border-top:1px dashed var(--cd-200); padding-top:4px; text-wrap:pretty;
    /* Hard cap, not just a style choice: .rc is a fixed 8.5in page with
       overflow:hidden, so remark length was the one variable-height piece
       pushing the summary panels past their budget and silently clipping the
       bottom of the Annual panel. Capping it guarantees that can't recur
       regardless of what the remark engine generates. */
    display:-webkit-box; -webkit-line-clamp:4; -webkit-box-orient:vertical; overflow:hidden;
  }
  .remark::before { content:'“'; color:var(--cd-400); font-weight:800; font-size:14px; line-height:0; vertical-align:-2px; margin-right:1px; }
  .remark::after  { content:'”'; color:var(--cd-400); font-weight:800; font-size:14px; line-height:0; vertical-align:-4px; margin-left:1px; }

  /* Co-scholastic strip — letter grades, sits between the body and the footer */
  .coschol { border-top:2px solid var(--edge); background:var(--cream); flex-shrink:0; padding:5px 22px 6px; }
  .cs-head { display:flex; align-items:baseline; gap:12px; margin-bottom:4px; }
  .cs-title { font-size:8.5px; font-weight:800; color:var(--cd-700); letter-spacing:1.4px; text-transform:uppercase; white-space:nowrap; }
  .cs-legend { font-size:8px; color:var(--txt-mid); letter-spacing:0.3px; }
  .cs-grid { display:flex; gap:6px; flex-wrap:nowrap; }
  .cs-item { flex:1 1 0; min-width:0; border:1px solid var(--cd-200); border-radius:4px; padding:3px 5px; background:#fff; }
  .cs-name { font-size:7.5px; font-weight:700; color:var(--txt); line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cs-grades { display:flex; gap:4px; margin-top:2px; }
  .cs-g { flex:1 1 0; text-align:center; font-size:10px; font-weight:800; color:var(--txt); font-variant-numeric:tabular-nums;
          background:var(--cream-3); border-radius:3px; padding:1px 0; }

  /* Footer */
  .footer { border-top:2px solid var(--edge); background:var(--cream-3); flex-shrink:0; display:flex; flex-direction:column; }
  .scale-row { padding:6px 22px 7px; display:flex; align-items:center; gap:18px; border-bottom:1px solid var(--cd-200); }
  .scale-label { font-size:8.5px; font-weight:800; color:var(--cd-700); letter-spacing:1.4px; text-transform:uppercase; white-space:nowrap; }
  .scale-items { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .scale-item  { display:inline-flex; align-items:baseline; gap:5px; font-size:9.5px; color:var(--txt-mid); }
  .scale-item .ach   { font-size:8.5px; padding:1px 6px; }
  .scale-item .sname { font-weight:700; color:var(--txt); }
  .scale-item .range { color:var(--txt-dim); font-variant-numeric:tabular-nums; }
  .sign-row  { padding:10px 32px 8px; display:flex; flex-direction:row; align-items:flex-end; gap:48px; }
  .sign-row > .sign { flex:1 1 0; min-width:0; }
  .sign      { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:6px; min-height:30px; }
  .sign-line { width:100%; border-top:1px solid var(--edge); }
  .sign-label { font-size:9px; font-weight:700; color:var(--cd-700); text-transform:uppercase; letter-spacing:1.4px; }
  /* Seal — same asset + placeholder convention as Sfs-report-card (Class III-X),
     so both report card systems read as one family. Sits with the signatures,
     not the header crest: a seal is a stamp of authenticity applied at
     sign-off, distinct from the school's identifying logo up top. Sized to
     .sign's 30px min-height budget so adding it doesn't grow the footer and
     starve the summary panels above (it did once — this is the fix for that). */
  .seal      { flex:0 0 auto; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; gap:4px; min-height:30px; }
  .seal-box  { width:30px; height:30px; border-radius:50%; flex-shrink:0;
    display:flex; align-items:center; justify-content:center; position:relative; }
  .seal-box.placeholder { border:1.5px dashed var(--cd-400); background:var(--cream-3); }
  .seal-box.placeholder::after {
    content:"OFFICIAL\A SEAL"; white-space:pre; text-align:center;
    font-size:4px; font-weight:700; letter-spacing:0.5px; color:var(--cd-400); text-transform:uppercase;
  }
  .seal-img  { width:100%; height:100%; object-fit:contain; }
  .disclaimer { padding:0 22px 4px; font-size:7px; color:var(--txt-dim); letter-spacing:0.3px; text-align:center; font-weight:500; }

  @media print {
    html, body { background:#fff !important; padding:0; display:block; }
    .print-bar { display:none !important; }
    /* @page above is 14x8.5in — the card's real size — so no scaling is
       needed here. zoom was previously used to shrink onto an A4 @page, but
       zoom isn't honored by every print/print-to-pdf engine, which clipped
       the card instead of scaling it. Printing this onto A4 paper is a
       printer-driver "fit to page" setting now, not something this CSS does. */
    .rc { box-shadow:none !important; margin:0; width:14in; height:8.5in; }
    .rc-wrap { padding:0 !important; overflow:visible !important; }
    /* Detail expand is an on-screen-only affordance — force it collapsed for
       print/PDF regardless of what a parent had expanded on screen, so the
       printed card always stays the same compact size it was fixed to be. */
    .marks-tbl tr.crit-row { display:none !important; }
    .marks-tbl tr.cat-row td.subj-col::before { display:none !important; }
  }
`;

// Mobile ebook view — used on phones and inside the Capacitor APK overlay.
// Stripped out in pdfMode so PDF captures always render at desktop size.
const MOBILE_CSS = `
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

    /* Co-scholastic — wrap to a grid instead of one squeezed row */
    .coschol { padding: 8px 12px; }
    .cs-grid { flex-wrap: wrap; gap: 6px; }
    .cs-item { flex: 1 1 30%; }
    .cs-name { font-size: 9px; white-space: normal; }
    .cs-g    { font-size: 11px; }

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

// PDF capture lock — appended after BASE_CSS in pdfMode. Forces deterministic
// 14×8.5in (1344×816 @ 96dpi) single-page sizing AND converts CSS Grid layouts
// to flexbox. Reason: html2pdf 0.10.1 bundles html2canvas v1.0.0-alpha.12 which
// predates CSS Grid support — mixed-unit `grid-template-columns:1fr 4.2in`
// gets rendered as a single collapsed column. Flexbox is fully supported.
const PDF_LOCK_CSS = `
  html, body {
    width: 1344px !important;
    min-width: 1344px !important;
    max-width: 1344px !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    overflow: hidden !important;
    display: block !important;
  }
  body > * { padding: 0 !important; margin: 0 !important; }
  body .rc {
    width: 14in !important;
    max-width: 14in !important;
    min-width: 14in !important;
    height: 8.5in !important;
    min-height: 8.5in !important;
    max-height: 8.5in !important;
    margin: 0 !important;
    overflow: hidden !important;
    box-shadow: none !important;
  }

  /* ── Grid → Flex conversions (html2canvas grid-renderer is broken) ──── */
  /* Main body: marks left, summary right (was: grid 1fr 4.2in) */
  body .rc .body {
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important;
    flex: 1 1 auto !important;
    min-height: 0 !important;
  }
  body .rc .body > .marks {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    width: auto !important;
    border-right: 2px solid var(--edge) !important;
  }
  body .rc .body > .summary {
    flex: 0 0 4.2in !important;
    width: 4.2in !important;
    min-width: 4.2in !important;
    max-width: 4.2in !important;
  }

  /* Info strip: 7 cells in a row (was: grid 1.6fr 0.9fr 0.7fr 1fr 1fr 1fr 1fr) */
  body .rc .info-strip {
    display: flex !important;
    flex-direction: row !important;
    align-items: stretch !important;
  }
  body .rc .info-strip .info-cell {
    flex: 1 1 0 !important;
    min-width: 0 !important;
  }
  body .rc .info-strip .info-cell:nth-child(1) { flex-grow: 1.6 !important; }
  body .rc .info-strip .info-cell:nth-child(2) { flex-grow: 0.9 !important; }
  body .rc .info-strip .info-cell:nth-child(3) { flex-grow: 0.7 !important; }

  /* Stat rows inside summary panels: 2 cols (was: grid 1fr 1fr) */
  body .rc .stat-row {
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: wrap !important;
    gap: 6px !important;
  }
  body .rc .stat-row > .stat {
    flex: 1 1 calc(50% - 6px) !important;
    min-width: 0 !important;
  }

  /* Signature row: 3 cols (was: grid repeat(3, 1fr)) */
  body .rc .sign-row {
    display: flex !important;
    flex-direction: row !important;
    gap: 48px !important;
  }
  body .rc .sign-row > .sign {
    flex: 1 1 0 !important;
    min-width: 0 !important;
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

function buildTableRows(hy1Card, hy2Card, opts = {}) {
  // Back-compat: a boolean third arg means "groupByCategory".
  const { groupByCategory = false, gradesOnly = false } =
    typeof opts === 'boolean' ? { groupByCategory: opts } : opts;

  // Column helpers — kindergarten (gradesOnly) shows a single Level pill per term;
  // all other classes show a Score cell + a Level pill.
  const termCell = (avg) => gradesOnly
    ? `<td>${ach(gradeCode(avg))}</td>`
    : (avg !== null && avg !== undefined
        ? `<td class="score">${avg.toFixed(1)}</td><td>${ach(gradeCode(avg))}</td>`
        : `<td>—</td><td>${ach('Ex')}</td>`);
  // Subject-header blank middle cells: 2 per term (Score+Level) normally, 1 in gradesOnly.
  const headBlanks = gradesOnly ? `<td></td><td></td>` : `<td></td><td></td><td></td><td></td>`;
  const subjNameSpan = gradesOnly ? 1 : 3;
  const emptyColspan = gradesOnly ? 4 : 6;

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

    if (groupByCategory) {
      // Primary (I & II) and Kindergarten (LKG/SKG): subject header + one row per CATEGORY
      rows += `<tr class="subj-head">
        <td class="subj-col" colspan="${subjNameSpan}">${esc(subj.name)}</td>
        ${headBlanks}
        <td>${ach(annSCode)}</td>
      </tr>`;

      // Build category → criteria map from both terms. Individual criteria are
      // kept (not just averaged away) so the on-screen view can expand a
      // category into the criteria behind it — see .cat-row/.crit-row above.
      const catMap = new Map(); // category → { hy1Scores[], hy2Scores[], criteria: Map(critId -> {name, hy1Score, hy2Score}) }
      const addToCat = (criteria, term) => {
        (criteria || []).forEach(c => {
          const cat = c.category || inferCategory(c.criterion_id) || 'General';
          if (!catMap.has(cat)) catMap.set(cat, { hy1Scores: [], hy2Scores: [], criteria: new Map() });
          const bucket = catMap.get(cat);
          if (term === 'hy1' && c.averageScore != null) bucket.hy1Scores.push(c.averageScore);
          if (term === 'hy2' && c.averageScore != null) bucket.hy2Scores.push(c.averageScore);
          if (!bucket.criteria.has(c.criterion_id)) {
            bucket.criteria.set(c.criterion_id, { name: c.criterion_name, hy1Score: null, hy2Score: null });
          }
          const crit = bucket.criteria.get(c.criterion_id);
          if (term === 'hy1') crit.hy1Score = c.averageScore ?? null;
          if (term === 'hy2') crit.hy2Score = c.averageScore ?? null;
        });
      };
      addToCat(hy1Subj?.criteria, 'hy1');
      addToCat(hy2Subj?.criteria, 'hy2');

      let catIdx = 0;
      catMap.forEach((cat, catName) => {
        catIdx++;
        const catId = `cat-${subjId}-${catIdx}`;
        const hy1Avg = cat.hy1Scores.length ? cat.hy1Scores.reduce((a, b) => a + b, 0) / cat.hy1Scores.length : null;
        const hy2Avg = cat.hy2Scores.length ? cat.hy2Scores.reduce((a, b) => a + b, 0) / cat.hy2Scores.length : null;
        const annAvgs = [hy1Avg, hy2Avg].filter(v => v !== null);
        const annAvg  = annAvgs.length ? annAvgs.reduce((a, b) => a + b, 0) / annAvgs.length : null;

        rows += `<tr class="cat-row" data-target="${catId}">
          <td class="subj-col" style="padding-left:18px">${esc(catName)}</td>
          ${termCell(hy1Avg)}
          ${termCell(hy2Avg)}
          <td>${ach(gradeCode(annAvg))}</td>
        </tr>`;

        cat.criteria.forEach(c => {
          const ca = [c.hy1Score, c.hy2Score].filter(v => v !== null);
          const annCAvg = ca.length ? ca.reduce((a, b) => a + b, 0) / ca.length : null;
          rows += `<tr class="crit-row" data-group="${catId}">
            <td class="subj-col">${esc(c.name)}</td>
            ${termCell(c.hy1Score)}
            ${termCell(c.hy2Score)}
            <td>${ach(gradeCode(annCAvg))}</td>
          </tr>`;
        });
      });
    } else {
      // All other classes: subject header + individual criteria rows
      rows += `<tr class="subj-head">
        <td class="subj-col" colspan="${subjNameSpan}">${esc(subj.name)}</td>
        ${headBlanks}
        <td>${ach(annSCode)}</td>
      </tr>`;

      // Criteria rows
      const criteriaMap = new Map();
      (hy1Subj?.criteria || []).forEach(c => criteriaMap.set(c.criterion_id, { name: c.criterion_name, hy1Score: c.averageScore ?? null, hy2Score: null }));
      (hy2Subj?.criteria || []).forEach(c => {
        if (!criteriaMap.has(c.criterion_id)) criteriaMap.set(c.criterion_id, { name: c.criterion_name, hy1Score: null, hy2Score: null });
        criteriaMap.get(c.criterion_id).hy2Score = c.averageScore ?? null;
      });

      criteriaMap.forEach(c => {
        const ca = [c.hy1Score, c.hy2Score].filter(v => v !== null);
        const annCAvg = ca.length ? ca.reduce((a, b) => a + b, 0) / ca.length : null;

        rows += `<tr>
          <td class="subj-col">${esc(c.name)}</td>
          ${termCell(c.hy1Score)}
          ${termCell(c.hy2Score)}
          <td>${ach(gradeCode(annCAvg))}</td>
        </tr>`;
      });
    }
  });

  return rows || `<tr><td colspan="${emptyColspan}" style="color:#888;font-style:italic;padding:12px">No assessment data found.</td></tr>`;
}

// ── Right summary panels ──────────────────────────────────────────────────────

// The single criterion most in need of attention: the LOWEST-scoring one that
// is actually flagged (Beg/NY). improvementAreas[] cannot be used for this --
// computeOverallPerformance() pushes flagged criteria in subject-then-file
// order, so [0] is whichever criterion is listed first (in practice always
// "Understand simple instructions in English I"). That made the panel read as
// static boilerplate, and could contradict the same card's own weakest
// subject. Recomputed from the card's stored criteria so already-generated
// cards render correctly without being regenerated.
function pickNeedsAttention(card) {
  let worst = null;
  (card && card.subjects || []).forEach(function (subj) {
    (subj.criteria || []).forEach(function (c) {
      if (typeof c.averageScore !== "number") return;
      if (c.grade !== "Beg" && c.grade !== "NY") return;
      if (!worst || c.averageScore < worst.score) {
        worst = { score: c.averageScore, text: `${c.criterion_name} in ${subj.subject_name}` };
      }
    });
  });
  return worst ? worst.text : null;
}

function buildPanel(card, term, label, dateRange, isAnnual = false, gradesOnly = false) {
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
  const weakest   = pickNeedsAttention(card) || card.weakestSubject || null;
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
          <div class="eyebrow">${gradesOnly ? 'Overall Grade' : 'Average Score'}</div>
          <div class="value">${gradesOnly
            ? esc(overallWord)
            : `${avg !== null ? avg.toFixed(2) : '—'} <span style="font-size:9px;color:var(--txt-dim);font-weight:600">/ 5.0</span>`}</div>
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

function buildAnnualPanel(hy1Card, hy2Card, gradesOnly = false) {
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
          <div class="eyebrow">${gradesOnly ? 'Year Grade' : 'Year Average'}</div>
          <div class="value">${gradesOnly
            ? esc(summary.annualOverallLabel)
            : `${summary.annualOverallAvg !== null ? summary.annualOverallAvg.toFixed(2) : '—'} <span style="font-size:9px;color:var(--txt-dim);font-weight:600">/ 5.0</span>`}</div>
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
// Co-scholastic strip. These carry a letter grade per term (O/A+/A/B+/B/C),
// not the 1-5 achievement scale, and are deliberately kept out of the academic
// table and the overall average — matching Sfs-report-card's countInTotal:false
// treatment for Class III-X. Renders nothing at all when a card has no
// co-scholastic data, so cards generated before this feature are unaffected.
function buildCoScholasticSection(hy1Card, hy2Card, className) {
  const merged = new Map();
  [[hy1Card, 'hy1'], [hy2Card, 'hy2']].forEach(([card, slot]) => {
    (card?.coScholastic || []).forEach(item => {
      if (!item || !item.key) return;
      const row = merged.get(item.key) || { label: item.label || item.key, hy1: null, hy2: null };
      if (item.grade) row[slot] = item.grade;
      if (item.label) row.label = item.label;
      merged.set(item.key, row);
    });
  });

  if (!merged.size) return '';

  const cells = [...merged.values()].map(r => `
        <div class="cs-item">
          <div class="cs-name">${esc(r.label)}</div>
          <div class="cs-grades">
            <span class="cs-g">${r.hy1 ? esc(r.hy1) : '<span class="dim">&mdash;</span>'}</span>
            <span class="cs-g">${r.hy2 ? esc(r.hy2) : '<span class="dim">&mdash;</span>'}</span>
          </div>
        </div>`).join('');

  // LKG/SKG use a 9-value scale (D/E added below C, plus NA for "not available")
  // instead of the 6-value scale everyone else uses — mirrors gradeScaleByClass
  // in assessment-app/data/coscholastic.json.
  const legendScale = (className === 'LKG' || className === 'SKG')
    ? 'O &middot; A+ &middot; A &middot; B+ &middot; B &middot; C &middot; D &middot; E &middot; NA'
    : 'O &middot; A+ &middot; A &middot; B+ &middot; B &middot; C';

  return `
    <section class="coschol">
      <div class="cs-head">
        <span class="cs-title">Co-Scholastic</span>
        <span class="cs-legend">${legendScale} &nbsp;<span class="dim">(HY1 / HY2 &mdash; not counted in the overall grade)</span></span>
      </div>
      <div class="cs-grid">${cells}
      </div>
    </section>`;
}

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

  // Same seal asset and default-on-unless-explicitly-empty convention as the
  // logo above — 'sealUrl' in opts (not just falsy logoUrl) lets a caller
  // suppress it (e.g. the offline demo generator) without guessing a path.
  const sealUrl = 'sealUrl' in opts ? opts.sealUrl : (baseOrigin + 'assets/images/schoolsea.jpeg');
  const sealHTML = sealUrl
    ? `<div class="seal-box"><img class="seal-img" src="${esc(sealUrl)}" alt="School seal" /></div>`
    : `<div class="seal-box placeholder"></div>`;

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

  // Primary (I & II) and Kindergarten (LKG & SKG) show category-grouped rows,
  // not individual criteria. Grouping keeps the card to a single page.
  const classNorm = (info.className || '').toLowerCase().trim();
  const isClassI  = ['class i', 'class 1', 'i', '1'].includes(classNorm);
  const isClassII = ['class ii', 'class 2', 'ii', '2'].includes(classNorm);
  const isKg      = ['lkg', 'skg'].includes(classNorm);
  const isPrimary = isClassI || isClassII;
  const groupByCategory = isPrimary || isKg;
  // Kindergarten (LKG/SKG) is reported by grade only — no numeric scores.
  const gradesOnly = isKg;
  // Classes with fewer rows → stretch rows to fill page height
  const stretchRows = isClassI || isKg;
  const tableRows = buildTableRows(hy1Card, hy2Card, { groupByCategory, gradesOnly });

  // Term date ranges — this file has no imports by design (self-contained
  // template), so it can't read the live term calendar from
  // report-card-grade-engine.js. Rather than guess a hardcoded range that can
  // silently drift out of sync with a one-off yearly exception there, fall
  // back to a neutral placeholder: this only shows before a card exists.
  const hy1Range = hy1Card?.dateFrom ? `${hy1Card.dateFrom} – ${hy1Card.dateTo}` : 'Not yet generated';
  const hy2Range = hy2Card?.dateFrom ? `${hy2Card.dateFrom} – ${hy2Card.dateTo}` : 'Not yet generated';

  const safeName = (info.studentName || 'student').replace(/[^a-zA-Z0-9]+/g, '_');
  const safeClass = (info.className || '').replace(/[^a-zA-Z0-9]+/g, '_');
  const pdfFilename = `ReportCard_${safeName}${safeClass ? '_' + safeClass : ''}.pdf`;

  // ── Reusable inner card markup ──────────────────────────────────────────────
  // Built once, reused by both the visible template and the pdfMode capture
  // doc. Single source of truth → the PDF you download matches exactly what
  // the admin preview window shows on desktop.
  const cardHTML = `<main class="rc">

  <header class="hdr">
    ${crestHTML}
    <div class="hdr-school">
      <div class="hdr-name">St. Francis De Sales School</div>
      <div class="hdr-loc">Laitkor, Shillong — Meghalaya</div>
      <div class="hdr-meta">Ph: 9612946550</div>
    </div>
    <div class="hdr-right">
      <div class="hdr-title">Annual Progress Report</div>
      <div class="hdr-year">Academic Year ${esc(academicYear)}</div>
      <div class="hdr-class">${isKg ? 'Kindergarten Section' : 'Primary Section'} · ${esc(info.className)}</div>
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
        <colgroup>${gradesOnly
          ? `
          <col style="width:46%" />
          <col style="width:18%" />
          <col style="width:18%" />
          <col style="width:18%" />`
          : `
          <col style="width:32%" />
          <col style="width:13%" />
          <col style="width:13%" />
          <col style="width:13%" />
          <col style="width:13%" />
          <col style="width:16%" />`}
        </colgroup>
        <thead>${gradesOnly
          ? `
          <tr class="term-head">
            <th>Subject &amp; Skill Area</th>
            <th>First Half-Yearly</th>
            <th>Second Half-Yearly</th>
            <th>Annual<br/><span style="font-weight:500;letter-spacing:0.5px;font-size:7.5px;opacity:0.7">overall</span></th>
          </tr>`
          : `
          <tr class="term-head">
            <th rowspan="2">Subject &amp; Criterion</th>
            <th colspan="2">First Half-Yearly</th>
            <th colspan="2">Second Half-Yearly</th>
            <th rowspan="2">Annual<br/><span style="font-weight:500;letter-spacing:0.5px;font-size:7.5px;opacity:0.7">overall</span></th>
          </tr>
          <tr class="col-head">
            <th>Score</th><th>Level</th>
            <th>Score</th><th>Level</th>
          </tr>`}
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
      <script>
        // Category-row detail expand — on screen only (forced hidden for
        // print/PDF via @media print above). Data was already sent to the
        // browser for the collapsed rollup; this just reveals rows that were
        // rendered but hidden, no extra fetch.
        document.querySelectorAll('.marks-tbl tr.cat-row').forEach(function (row) {
          row.addEventListener('click', function () {
            var target = row.getAttribute('data-target');
            var expanded = row.classList.toggle('expanded');
            document.querySelectorAll('.crit-row[data-group="' + target + '"]').forEach(function (cr) {
              cr.style.display = expanded ? 'table-row' : 'none';
            });
          });
        });
      </script>
    </section>

    <aside class="summary">
      ${buildPanel(hy1Card, 'HY1', 'First Half-Yearly', hy1Range, false, gradesOnly)}
      ${buildPanel(hy2Card, 'HY2', 'Second Half-Yearly', hy2Range, false, gradesOnly)}
      ${buildAnnualPanel(hy1Card, hy2Card, gradesOnly)}
    </aside>

  </div>

  ${buildCoScholasticSection(hy1Card, hy2Card, info.className)}

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
      <div class="sign"><div class="sign-line"></div><div class="sign-label">Headmistress</div></div>
      <div class="seal">${sealHTML}<div class="sign-label">School Seal</div></div>
    </div>
    <div class="disclaimer">Doc ID: ${esc(hy1Card?.docId || hy2Card?.docId || `${info.studentId}_${academicYear}`)} &nbsp;·&nbsp; Generated ${esc(new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }))} &nbsp;|&nbsp; Computer-generated document &nbsp;|&nbsp; Verify with school records &nbsp;|&nbsp; No signature required for validity</div>
  </footer>

</main>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1400, initial-scale=1.0, user-scalable=yes" />
  <title>Annual Progress Report — ${esc(info.studentName)}</title>
  <style>${BASE_CSS}</style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
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

    // Wait for fonts, images, and a paint frame inside the given document
    // before capturing — critical for deterministic output on slower devices.
    async function rcWaitForReady(fdoc) {
      if (fdoc.fonts && fdoc.fonts.ready) {
        try { await fdoc.fonts.ready; } catch (_) {}
      }
      const imgs = Array.from(fdoc.images || []);
      await Promise.all(imgs.map((img) => {
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise((res) => {
          const t = setTimeout(res, 4000);
          img.addEventListener('load',  () => { clearTimeout(t); res(); }, { once: true });
          img.addEventListener('error', () => { clearTimeout(t); res(); }, { once: true });
        });
      }));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    // Generate one-page PDF by capturing the .rc element IN THIS document.
    // The card has a fixed 14×8.5in size and uses flexbox (not grid) so it
    // renders at desktop layout regardless of the iframe's actual viewport.
    // Capturing in-document avoids the cross-frame html2canvas issues we
    // hit with hidden-iframe approaches on Capacitor WebView.
    //
    // Output path priority: Capacitor Filesystem (APK) → Web Share → anchor download.
    async function rcDownloadPDF() {
      const btn = document.getElementById('rc-pdf-btn');
      const orig = btn ? btn.textContent : '';
      if (btn) { btn.textContent = '⏳ Generating PDF…'; btn.disabled = true; }

      try {
        const h2c   = window.html2canvas;
        const JsPDF = window.jspdf && window.jspdf.jsPDF;
        if (!h2c || !JsPDF) {
          throw new Error('PDF library not loaded. Check your connection and try again.');
        }
        const filename = ${JSON.stringify(pdfFilename)};

        await rcWaitForReady(document);

        const rc = document.querySelector('.rc');
        if (!rc) throw new Error('Report card content not found');

        // Capture the .rc element at its natural 14×8.5in (1344×816px) size.
        // scale:2 → 2688×1632 canvas for sharp output.
        // logging:false suppresses alpha console noise.
        const canvas = await h2c(rc, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          backgroundColor: '#FFFCF0',
          logging: false,
          width:        rc.offsetWidth  || 1344,
          height:       rc.offsetHeight || 816,
          windowWidth:  rc.offsetWidth  || 1344,
          windowHeight: rc.offsetHeight || 816,
        });

        const pdf = new JsPDF({ unit: 'in', format: [14, 8.5], orientation: 'landscape' });
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 14, 8.5, undefined, 'FAST');
        const pdfBlob = pdf.output('blob');
        // (pdfBlob used below)

        const file = new File([pdfBlob], filename, { type: 'application/pdf' });

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
            reader.readAsDataURL(pdfBlob);
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
        const dlUrl = URL.createObjectURL(pdfBlob);
        const a = document.createElement('a');
        a.href = dlUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(dlUrl), 4000);
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

<div class="rc-wrap" style="width:100%;box-sizing:border-box;padding:20px;overflow:auto;-webkit-overflow-scrolling:touch">
${cardHTML}
</div>

</body>
</html>`;
}
