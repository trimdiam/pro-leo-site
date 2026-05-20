// ── Report Card Print Engine ──────────────────────────────────────────────────
// Self-contained e-book HTML builder. No Firebase, no imports.
// Receives plain data objects and returns a full HTML string ready for printing.
// Addendum C: 4-page structure — Cover | HY1 | HY2 | Annual Summary.

/**
 * Computes annual summary by averaging HY1 and HY2 subject/criterion scores.
 * @param {object} hy1Card
 * @param {object} hy2Card
 * @returns {object} annualSummary
 */
export function computeAnnualSummary(hy1Card, hy2Card) {
  const subjectMap = {};

  function addCard(card, termKey) {
    if (!card || !card.subjects) return;
    card.subjects.forEach(subj => {
      if (!subjectMap[subj.subject_id]) {
        subjectMap[subj.subject_id] = { subject_id: subj.subject_id, subject_name: subj.subject_name, hy1: null, hy2: null };
      }
      subjectMap[subj.subject_id][termKey] = subj.subjectAverage ?? null;
    });
  }

  addCard(hy1Card, 'hy1');
  addCard(hy2Card, 'hy2');

  const subjects = Object.values(subjectMap).map(s => {
    const scores = [s.hy1, s.hy2].filter(v => v !== null);
    const annualAvg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return {
      subject_id:   s.subject_id,
      subject_name: s.subject_name,
      hy1Grade:     hy1Card?.subjects?.find(x => x.subject_id === s.subject_id)?.subjectGrade || 'Ex',
      hy2Grade:     hy2Card?.subjects?.find(x => x.subject_id === s.subject_id)?.subjectGrade || 'Ex',
      annualAvg:    annualAvg !== null ? Math.round(annualAvg * 100) / 100 : null,
      annualGrade:  gradeCode(annualAvg)
    };
  });

  const hy1Avg = hy1Card?.overallAverageScore ?? null;
  const hy2Avg = hy2Card?.overallAverageScore ?? null;
  const avgs = [hy1Avg, hy2Avg].filter(v => v !== null);
  const annualOverallAvg = avgs.length > 0 ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;

  // Detect most improved: compare hy1 → hy2 subject averages
  let mostImproved = null;
  let bestDelta = -Infinity;
  subjects.forEach(s => {
    const d1 = hy1Card?.subjects?.find(x => x.subject_id === s.subject_id)?.subjectAverage ?? null;
    const d2 = hy2Card?.subjects?.find(x => x.subject_id === s.subject_id)?.subjectAverage ?? null;
    if (d1 !== null && d2 !== null) {
      const delta = d2 - d1;
      if (delta > bestDelta) { bestDelta = delta; mostImproved = s.subject_name; }
    }
  });

  return {
    subjects,
    annualOverallAvg:  annualOverallAvg !== null ? Math.round(annualOverallAvg * 100) / 100 : null,
    annualOverallGrade: gradeCode(annualOverallAvg),
    annualOverallLabel: gradeWord(annualOverallAvg),
    hy1OverallLabel:   hy1Card?.overallLabel || '—',
    hy2OverallLabel:   hy2Card?.overallLabel || '—',
    mostImprovedArea:  mostImproved,
    promotedToClass:   hy2Card?.promotedToClass || null
  };
}

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

function gradeBg(code) {
  const map = {
    Adv:  '#d4f5e2', Prof: '#d6eaf8', Dev: '#fef3d0',
    Beg:  '#fde8d8', NY:   '#f0f0f0', Ex:  '#f5f5f5'
  };
  return map[code] || '#f5f5f5';
}

function gradeFg(code) {
  const map = {
    Adv:  '#0a6e3a', Prof: '#1a5fb4', Dev: '#b87600',
    Beg:  '#cc5500', NY:   '#666',    Ex:  '#999'
  };
  return map[code] || '#999';
}

function gradeBadge(code) {
  const bg = gradeBg(code);
  const fg = gradeFg(code);
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;background:${bg};color:${fg}">${code}</span>`;
}

// ── CSS string ────────────────────────────────────────────────────────────────

const INLINE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Georgia', serif; font-size: 13px; color: #2C1F0E; background: #fff; }
  .ebook-page { width: 210mm; min-height: 297mm; padding: 15mm 18mm; background: #fff; }
  .cover { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 297mm; text-align: center; }
  .cover-crest { font-size: 48px; font-weight: 900; color: #8B6F47; letter-spacing: 4px; margin-bottom: 12px; }
  .cover-school { font-size: 22px; font-weight: 700; color: #2C1F0E; margin-bottom: 4px; }
  .cover-location { font-size: 14px; color: #5A4A35; margin-bottom: 24px; }
  .cover-divider { width: 60mm; height: 2px; background: #8B6F47; margin: 16px auto; }
  .cover-doc-title { font-size: 18px; font-weight: 600; color: #2C1F0E; margin-bottom: 4px; }
  .cover-year { font-size: 15px; color: #5A4A35; margin-bottom: 24px; }
  .cover-student-name { font-size: 20px; font-weight: 700; color: #8B6F47; margin-bottom: 4px; }
  .cover-student-meta { font-size: 13px; color: #5A4A35; margin-bottom: 4px; }
  .cover-footer { font-size: 11px; color: #888; margin-top: 24px; max-width: 130mm; line-height: 1.5; }
  .card-header { text-align: center; border-bottom: 2px solid #8B6F47; padding-bottom: 10px; margin-bottom: 14px; }
  .card-header h1 { font-size: 16px; color: #2C1F0E; }
  .card-header h2 { font-size: 13px; color: #5A4A35; font-weight: 400; }
  .card-meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 14px; padding: 8px; background: #f9f6f0; border-radius: 4px; }
  .card-meta span { color: #2C1F0E; }
  .subject-block { margin-bottom: 14px; page-break-inside: avoid; }
  .subject-name { font-size: 13px; font-weight: 700; color: #8B6F47; border-bottom: 1px solid #D6C3A3; padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { background: #f5efe4; text-align: left; padding: 5px 8px; font-weight: 600; color: #5A4A35; }
  td { padding: 4px 8px; border-bottom: 1px solid #ede4d6; }
  .overall-bar { display: flex; justify-content: space-between; align-items: center; background: #f9f6f0; padding: 8px 12px; border-radius: 4px; margin: 10px 0; font-size: 13px; }
  .remark-box { border: 1px solid #D6C3A3; border-radius: 4px; padding: 10px 12px; margin: 10px 0; font-size: 12px; color: #2C1F0E; line-height: 1.6; font-style: italic; }
  .attendance-row { display: flex; gap: 24px; font-size: 12px; margin: 8px 0; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 20px; font-size: 12px; }
  .sig-block { text-align: center; min-width: 60mm; }
  .sig-line { border-top: 1px solid #888; margin-top: 24px; padding-top: 4px; color: #5A4A35; }
  .pending-page { display: flex; align-items: center; justify-content: center; min-height: 200px; color: #888; font-style: italic; font-size: 13px; }
  .annual-table th, .annual-table td { padding: 5px 10px; }
  .print-bar { text-align: center; padding: 16px; background: #f5efe4; }
  .print-btn { padding: 10px 28px; background: #8B6F47; color: #fff; border: none; border-radius: 6px; font-size: 15px; cursor: pointer; margin-right: 10px; }
  .print-hint { font-size: 12px; color: #888; }
  @media print {
    .print-bar { display: none !important; }
    .ebook-page { page-break-after: always; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

// ── Page builders ─────────────────────────────────────────────────────────────

function buildCoverPage(studentInfo, academicYear) {
  const yr = academicYear || '2025–2026';
  return `
    <div class="ebook-page cover">
      <div class="cover-crest">SFDS</div>
      <div class="cover-school">St. Francis de Sales School</div>
      <div class="cover-location">Laitkor, Shillong — Meghalaya</div>
      <div class="cover-divider"></div>
      <div class="cover-doc-title">Academic Progress Report</div>
      <div class="cover-year">${yr}</div>
      <div class="cover-divider"></div>
      <div class="cover-student-name">${esc(studentInfo.studentName)}</div>
      <div class="cover-student-meta">Class: ${esc(studentInfo.className)} &nbsp;|&nbsp; Roll No: ${esc(studentInfo.rollNo)}</div>
      <div class="cover-student-meta">Student ID: ${esc(studentInfo.studentId)}</div>
      <div class="cover-footer">
        This document contains the First Half-Yearly and Second Half-Yearly Progress Reports for the academic year ${yr}.
      </div>
    </div>`;
}

function buildSubjectsHTML(subjects) {
  if (!subjects || subjects.length === 0) return '<p style="color:#888;font-style:italic">No subjects found.</p>';

  return subjects.map(subj => {
    if (subj.pending) {
      return `<div class="subject-block">
        <div class="subject-name">${esc(subj.subject_name)}</div>
        <p style="color:#888;font-style:italic;font-size:12px">Criteria for this subject are being finalised for this class.</p>
      </div>`;
    }

    const criteriaRows = (subj.criteria || []).map(c => {
      const code = c.grade || 'Ex';
      return `<tr>
        <td>${esc(c.criterion_name)}</td>
        <td style="text-align:center">${c.averageScore !== null ? c.averageScore.toFixed(2) : '—'}</td>
        <td style="text-align:center">${gradeBadge(code)}</td>
      </tr>`;
    }).join('');

    const subjectCode = subj.subjectGrade || 'Ex';
    return `<div class="subject-block">
      <div class="subject-name">
        <span>${esc(subj.subject_name)}</span>
        ${gradeBadge(subjectCode)}
      </div>
      <table>
        <thead><tr><th>Criterion</th><th style="text-align:center">Average</th><th style="text-align:center">Grade</th></tr></thead>
        <tbody>${criteriaRows}</tbody>
      </table>
    </div>`;
  }).join('');
}

function buildTermPage(card, termHeader) {
  if (!card) {
    return `<div class="ebook-page">
      <div class="card-header"><h1>St. Francis de Sales School, Laitkor</h1><h2>${termHeader}</h2></div>
      <div class="pending-page">Results for this term will be published when available.</div>
    </div>`;
  }

  const overallCode = card.overallGrade || 'Ex';
  const presentDays = card.attendancePresentDays !== null ? card.attendancePresentDays : '___';
  const workingDays = card.attendanceWorkingDays !== null ? card.attendanceWorkingDays : '___';

  return `<div class="ebook-page">
    <div class="card-header">
      <h1>St. Francis de Sales School, Laitkor</h1>
      <h2>${termHeader}</h2>
    </div>
    <div class="card-meta">
      <span><strong>Name:</strong> ${esc(card.studentName)}</span>
      <span><strong>Class:</strong> ${esc(card.className)}</span>
      <span><strong>Roll No:</strong> ${esc(card.rollNo)}</span>
    </div>

    <div style="font-weight:700;font-size:12px;color:#8B6F47;margin-bottom:8px">SCHOLASTIC ASSESSMENT</div>
    ${buildSubjectsHTML(card.subjects)}

    <div class="overall-bar">
      <span><strong>Overall Performance:</strong> ${gradeBadge(overallCode)} ${esc(card.overallLabel || '')}</span>
      ${card.overallAverageScore !== null ? `<span>Avg: ${card.overallAverageScore.toFixed(2)} / 5</span>` : ''}
    </div>

    <div style="margin:8px 0;font-size:12px;color:#5A4A35">
      <strong>Trend:</strong> ${esc(card.trendDirection || 'Stable')}
    </div>

    <div style="font-weight:700;font-size:12px;color:#8B6F47;margin-top:10px;margin-bottom:4px">TEACHER'S REMARK</div>
    <div class="remark-box">${esc(card.teacherRemark || '')}</div>

    <div class="attendance-row">
      <span><strong>Attendance:</strong> Present: ${presentDays} / Working Days: ${workingDays}</span>
    </div>

    <div class="sig-row">
      <div class="sig-block"><div class="sig-line">Class Teacher</div></div>
      <div class="sig-block"><div class="sig-line">Principal</div></div>
    </div>
  </div>`;
}

function buildAnnualPage(hy1Card, hy2Card) {
  if (!hy1Card || !hy2Card) {
    return `<div class="ebook-page">
      <div class="card-header"><h1>St. Francis de Sales School, Laitkor</h1><h2>Annual Academic Summary</h2></div>
      <div class="pending-page">Annual summary will be generated once both terms are complete.</div>
    </div>`;
  }

  const summary = computeAnnualSummary(hy1Card, hy2Card);
  const totalPresent = (hy1Card.attendancePresentDays || 0) + (hy2Card.attendancePresentDays || 0);
  const totalWorking = (hy1Card.attendanceWorkingDays || 0) + (hy2Card.attendanceWorkingDays || 0);
  const attendancePct = totalWorking > 0 ? Math.round((totalPresent / totalWorking) * 100) : null;

  const subjectRows = summary.subjects.map(s => `
    <tr>
      <td>${esc(s.subject_name)}</td>
      <td style="text-align:center">${gradeBadge(s.hy1Grade)}</td>
      <td style="text-align:center">${gradeBadge(s.hy2Grade)}</td>
      <td style="text-align:center">${gradeBadge(s.annualGrade)}</td>
    </tr>`).join('');

  const promotionLine = summary.promotedToClass
    ? `<strong>Promoted to:</strong> ${esc(summary.promotedToClass)}`
    : '<strong>Promotion:</strong> Pending';

  const attendanceLine = totalWorking > 0
    ? `Total Attendance: ${totalPresent} / ${totalWorking} days${attendancePct !== null ? ` (${attendancePct}%)` : ''}`
    : 'Attendance: —';

  return `<div class="ebook-page">
    <div class="card-header">
      <h1>St. Francis de Sales School, Laitkor</h1>
      <h2>Annual Academic Summary — 2025–2026</h2>
    </div>
    <div class="card-meta">
      <span><strong>Name:</strong> ${esc(hy1Card.studentName)}</span>
      <span><strong>Class:</strong> ${esc(hy1Card.className)}</span>
    </div>

    <table class="annual-table" style="margin-bottom:14px">
      <thead>
        <tr>
          <th>Subject</th>
          <th style="text-align:center">HY1 Grade</th>
          <th style="text-align:center">HY2 Grade</th>
          <th style="text-align:center">Annual</th>
        </tr>
      </thead>
      <tbody>${subjectRows}</tbody>
    </table>

    <div class="overall-bar" style="flex-direction:column;align-items:flex-start;gap:4px">
      <span><strong>Overall HY1:</strong> ${esc(summary.hy1OverallLabel)}</span>
      <span><strong>Overall HY2:</strong> ${esc(summary.hy2OverallLabel)}</span>
      <span><strong>Annual Standing:</strong> ${gradeBadge(summary.annualOverallGrade)} ${esc(summary.annualOverallLabel)}</span>
    </div>

    ${summary.mostImprovedArea ? `<div style="font-size:12px;margin:8px 0"><strong>Most Improved Area:</strong> ${esc(summary.mostImprovedArea)}</div>` : ''}
    <div style="font-size:12px;margin:8px 0">${attendanceLine}</div>
    <div style="font-size:12px;margin:8px 0">${promotionLine}</div>

    <div class="sig-row">
      <div class="sig-block"><div class="sig-line">Class Teacher</div></div>
      <div class="sig-block"><div class="sig-line">Principal</div></div>
    </div>
  </div>`;
}

// ── HTML escape ───────────────────────────────────────────────────────────────

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Builds a self-contained, printable A4 e-book HTML document.
 * All CSS inline. No Firebase calls. No external dependencies.
 *
 * @param {object|null} hy1Card     - HY1 report card doc, or null if not released
 * @param {object|null} hy2Card     - HY2 report card doc, or null if not released
 * @param {object} studentInfo      - { studentName, className, rollNo, studentId }
 * @returns {string}                - Full self-contained HTML
 */
export function buildPrintableHTML(hy1Card, hy2Card, studentInfo) {
  const info = studentInfo || {
    studentName: hy1Card?.studentName || hy2Card?.studentName || '—',
    className:   hy1Card?.className   || hy2Card?.className   || '—',
    rollNo:      hy1Card?.rollNo      || hy2Card?.rollNo      || '—',
    studentId:   hy1Card?.studentId   || hy2Card?.studentId   || '—'
  };

  const academicYear = hy1Card?.academicYear || hy2Card?.academicYear || '2025–2026';

  const cover   = buildCoverPage(info, academicYear);
  const hy1Page = buildTermPage(hy1Card, 'First Half-Yearly Progress Report | April – September');
  const hy2Page = buildTermPage(hy2Card, 'Second Half-Yearly Progress Report | October – March');
  const annualPage = buildAnnualPage(hy1Card, hy2Card);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report Card — ${esc(info.studentName)}</title>
  <style>${INLINE_CSS}</style>
</head>
<body>
  <div class="print-bar">
    <button class="print-btn" onclick="window.print()">🖨 Print / Download Report Card</button>
    <span class="print-hint">To save as PDF: choose "Save as PDF" in your browser's print dialog.</span>
  </div>
  ${cover}
  ${hy1Page}
  ${hy2Page}
  ${annualPage}
</body>
</html>`;
}
