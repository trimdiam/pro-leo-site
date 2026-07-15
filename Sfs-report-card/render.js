/**
 * render.js — SFDS Report Card System
 * Reads studentData from sessionStorage and populates reportcard.html
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1. LOAD DATA
   ═══════════════════════════════════════════════════════════════════════════ */
function loadData() {
  const raw = sessionStorage.getItem('sfds_studentData');
  if (!raw) {
    console.error('No student data found in sessionStorage.');
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse student data:', e);
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. GRADE HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
// passmark: 40 for Class III-VIII, 30 for Class IX-X (config.passmark). The
// 'D' band only exists below 40 when the class's own pass mark is lower than
// 40 (senior classes) — otherwise anything under 40 is a fail, full stop.
function getGradeFromMarks(marks, passmark = 40) {
  if (marks >= 90) return 'O';
  if (marks >= 80) return 'A+';
  if (marks >= 70) return 'A';
  if (marks >= 60) return 'B+';
  if (marks >= 50) return 'B';
  if (marks >= 40) return 'C';
  if (marks >= passmark) return 'D';
  return 'F';
}

function formatPct(value) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

/* ── Reduced-subject / special-needs students ────────────────────────────────
   These students take a reduced subject load, so a percentage computed against
   the full-class max reads as misleadingly low. For them the overall percentage
   is suppressed (shown as "—") on the report card and class marksheet. Their
   marks, totals, grades and pass/fail are otherwise untouched.
   Matching is case- and whitespace-insensitive; an unmatched name changes
   nothing, so adding/removing entries here is always safe.
   To exempt another student, add their full name in UPPERCASE.               */
const REDUCED_SUBJECT_STUDENTS = ['LUCIA LAPDIANGHUN KHARKONOR'];
function isReducedSubjectStudent(name) {
  if (!name) return false;
  const norm = String(name).trim().toUpperCase().replace(/\s+/g, ' ');
  return REDUCED_SUBJECT_STUDENTS.includes(norm);
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. MAIN RENDER
   ═══════════════════════════════════════════════════════════════════════════ */
function render() {
  const data = loadData();
  if (!data) {
    document.body.innerHTML = `
      <div style="font-family:'Segoe UI',sans-serif;text-align:center;padding:60px 20px;color:#555;background:#FAF8F3;min-height:100vh;box-sizing:border-box;">
        <p style="font-size:2rem;margin-bottom:8px;">📋</p>
        <h2 style="color:#2C2C2C;margin-bottom:12px;">No student data found</h2>
        <p style="font-size:0.9rem;color:#888;margin-bottom:24px;">Please fill the mark entry form and click <strong>Preview Report Card</strong>.</p>
        <a href="index.html" style="display:inline-block;background:#C9A84C;color:#fff;padding:8px 20px;border-radius:4px;font-weight:600;text-decoration:none;font-size:0.9rem;">← Go to Mark Entry Form</a>
      </div>
    `;
    return;
  }

  const config = getClassConfig(parseInt(data.class, 10));
  if (!config) {
    console.error('Unknown class:', data.class);
    return;
  }

  renderHeader(data, config);
  renderLeftPanel(data, config);
  renderCenterPanel(data, config);
  renderRightPanel(data, config);

  // Auto-print if requested via URL param
  if (window.location.search.includes('print=1')) {
    setTimeout(() => window.print(), 800);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. HEADER
   ═══════════════════════════════════════════════════════════════════════════ */
function renderHeader(data, config) {
  document.getElementById('rcSchoolName').textContent = data.schoolName || config.schoolName;
  document.getElementById('rcClassNum').textContent = data.class || '—';
  document.getElementById('rcSection').textContent = data.section || '—';

  const passmark = config.passmark || 40;
  const scaleEl = document.getElementById('rcGradeScale');
  if (scaleEl) {
    // D band only exists below 40 when the pass mark itself is under 40
    // (senior classes, passmark 30) — otherwise anything under 40 is F.
    const dBand = passmark < 40 ? ` | D ${passmark}–39%` : '';
    let scaleText =
      `O ≥90% | A+ 80–89% | A 70–79% | B+ 60–69% | B 50–59% | C 40–49%${dBand} | F <${passmark}% – Fail | Pass mark: ${passmark}/100`;
    if (config.markScheme === 'senior') {
      const iaFloor   = Math.round(20 * passmark / 100);
      const examFloor = Math.round(80 * passmark / 100);
      scaleText += ` (IA ≥${iaFloor} & Theory ≥${examFloor} required)`;
    }
    scaleEl.textContent = scaleText;
  }

  const logo = document.getElementById('rcLogo');
  if (logo) {
    logo.onerror = function () {
      this.style.display = 'none';
      const placeholder = document.createElement('div');
      placeholder.style.cssText = 'width:40px;height:40px;border-radius:50%;background:#2C2C2C;color:#C9A84C;display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;flex-shrink:0;';
      placeholder.textContent = 'SFS';
      this.parentNode.insertBefore(placeholder, this);
    };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. LEFT PANEL
   ═══════════════════════════════════════════════════════════════════════════ */
function renderLeftPanel(data, config) {
  const s = data.student;
  document.getElementById('rcStudentName').textContent = s.name || 'Student Name';
  document.getElementById('rcRollNo').textContent = s.rollNo || '—';
  document.getElementById('rcSection2').textContent = data.section || '—';
  document.getElementById('rcClass2').textContent = data.class || '—';
  document.getElementById('rcAdmissionNo').textContent = s.admissionNo || '—';
  document.getElementById('rcDob').textContent = s.dob || '—';
  document.getElementById('rcAcademicYear').textContent = data.session || '2026–2027';
  document.getElementById('rcClassSection').textContent = `Class ${data.class || '—'}${data.section ? ' (' + data.section + ')' : ''}`;
  document.getElementById('rcHouse').textContent = s.house || '—';

  // Attendance
  const hyAtt = data.halfYearly.attendance;
  const ftAtt = data.finalTerm.attendance;
  const hyPct = hyAtt.total > 0 ? ((hyAtt.present / hyAtt.total) * 100) : 0;
  const ftPct = ftAtt.total > 0 ? ((ftAtt.present / ftAtt.total) * 100) : 0;

  // Helper: attendance visual category
  const attCls = (pct) => pct >= 75 ? 'att-good' : (pct >= 60 ? 'att-moderate' : 'att-poor');

  const hyPctEl = document.getElementById('rcHyAttPct');
  hyPctEl.textContent = formatPct(hyPct) + '%';
  hyPctEl.className = 'rc-att-pct ' + attCls(hyPct);
  const hyBarEl = document.getElementById('rcHyAttBar');
  hyBarEl.style.width = hyPct + '%';
  hyBarEl.className = 'rc-att-fill ' + attCls(hyPct);

  const ftPctEl = document.getElementById('rcFtAttPct');
  ftPctEl.textContent = formatPct(ftPct) + '%';
  ftPctEl.className = 'rc-att-pct ' + attCls(ftPct);
  const ftBarEl = document.getElementById('rcFtAttBar');
  ftBarEl.style.width = ftPct + '%';
  ftBarEl.className = 'rc-att-fill ' + attCls(ftPct);

  // Overall result (based on consolidated data)
  const consol = data.consolidated;
  const resultBadge = document.getElementById('rcResultBadge');
  resultBadge.textContent = consol.result || '—';
  resultBadge.className = 'rc-result-badge ' + (consol.result === 'PASS' ? '' : 'fail');

  // When Term 2 isn't assessed yet (half-yearly-only card), the overall grade
  // and percentage must reflect Half-Yearly figures — the consolidated values
  // divide by both terms' max and would read as a misleading ~half. The result
  // badge already reflects HY-only pass/fail (no FT marks → no FT fail).
  const ovExempt = isReducedSubjectStudent(s.name);
  const ovFtEmpty = (data.finalTerm.grandTotal || 0) === 0;
  document.getElementById('rcOverallGrade').textContent = ovExempt
    ? '—'
    : (ovFtEmpty ? (data.halfYearly.grade || '—') : (consol.grade || '—'));
  document.getElementById('rcOverallPct').textContent = ovExempt
    ? '—'
    : (ovFtEmpty ? formatPct(data.halfYearly.percentage) + '%' : formatPct(consol.percentage) + '%');
  // Rank only for students who passed all subjects; reduced-subject students are
  // excluded from the rank pool entirely.
  const ovRankEligible = !isReducedSubjectStudent(s.name) &&
    (consol.result === 'PASS' || consol.result === 'PROMOTED' || consol.result === 'PROMOTED WITH GRACE');
  document.getElementById('rcOverallRank').textContent = ovRankEligible && data.finalTerm.rank && data.finalTerm.totalStudents
    ? `${data.finalTerm.rank} / ${data.finalTerm.totalStudents}`
    : '—';
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. CENTER PANEL — TERM 1
   ═══════════════════════════════════════════════════════════════════════════ */
function renderCenterPanel(data, config) {
  const isStandard = config.markScheme === 'standard';

  // Table header
  const hyHead = document.getElementById('rcHyTableHead');
  let h = '<th>Subject</th>';
  if (isStandard) {
    h += '<th>IA /10</th><th>UT /30</th><th>TE /60</th>';
  } else {
    h += '<th>IA /20</th><th>TE /80</th>';
  }
  h += '<th>Total /100</th><th>Grade</th>';
  hyHead.innerHTML = h;

  // Table body
  document.getElementById('rcHyTableBody').innerHTML = buildTableRows('hy', data, config, isStandard, false);

  // Footer
  const hyCols = isStandard ? 6 : 5;
  const hyColspan = hyCols - 3;
  // Rank only for students who passed all subjects (gated on the result).
  const hyRankEligible = !isReducedSubjectStudent(data.student && data.student.name) &&
    data.consolidated && (data.consolidated.result === 'PASS' || data.consolidated.result === 'PROMOTED' || data.consolidated.result === 'PROMOTED WITH GRACE');
  const hyRankStr = (hyRankEligible && data.halfYearly.rank)
    ? `Term 1 Rank: ${data.halfYearly.rank} / ${data.halfYearly.totalStudents || '—'}`
    : '';
  document.getElementById('rcHyTableFoot').innerHTML = `
    <tr class="rc-term-total">
      <td colspan="${hyColspan}" class="rc-tt-label">Term 1 Total</td>
      <td class="rc-tt-max">Max: ${config.grandTotalMax}</td>
      <td class="rc-tt-val">${data.halfYearly.grandTotal}</td>
      <td class="rc-tt-grade">${data.halfYearly.grade}</td>
    </tr>
    ${hyRankStr ? `<tr class="rc-rank-row"><td colspan="${hyCols}" class="rc-rank-cell">${hyRankStr}</td></tr>` : ''}
  `;

  // Co-scholastic (show Final Term grades as annual assessment)
  document.getElementById('rcHyCoscholastic').innerHTML = buildCoScholastic(data.coScholastic, config);

  // Remarks — use teacher-entered text if present, otherwise generate intelligently
  const ftNotAssessed = (data.finalTerm.grandTotal || 0) === 0;
  const hyRemark = (data.remarks && data.remarks.halfYearly) || generateRemark(data, config, 'hy');
  // Don't auto-generate a Term 2 remark before the final term is assessed — it
  // would be computed from zero marks and read as "weak". Use a teacher-entered
  // remark if one exists, otherwise leave it blank.
  const ftRemark = (data.remarks && data.remarks.finalTerm)
    || (ftNotAssessed ? '' : generateRemark(data, config, 'ft'));
  document.getElementById('rcHyRemark').textContent = `"${hyRemark}"`;
  document.getElementById('rcFtRemark').textContent = ftRemark ? `"${ftRemark}"` : '—';
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. RIGHT PANEL — TERM 2
   ═══════════════════════════════════════════════════════════════════════════ */
function renderRightPanel(data, config) {
  const isStandard = config.markScheme === 'standard';

  // Table header
  const ftHead = document.getElementById('rcFtTableHead');
  let h = '<th>Subject</th>';
  if (isStandard) {
    h += '<th>IA /10</th><th>UT /30</th><th>TE /60</th>';
  } else {
    h += '<th>IA /20</th><th>TE /80</th>';
  }
  h += '<th>Total /100</th><th>Csl. /200</th><th>Grade</th>';
  ftHead.innerHTML = h;

  // Table body
  document.getElementById('rcFtTableBody').innerHTML = buildTableRows('ft', data, config, isStandard, true);

  // Footer
  const ftCols = isStandard ? 7 : 6;
  const ftColspan = ftCols - 4;
  // Term 2 not yet assessed → blank the totals row rather than show 0 / F.
  const ftEmpty = (data.finalTerm.grandTotal || 0) === 0;
  document.getElementById('rcFtTableFoot').innerHTML = `
    <tr class="rc-term-total">
      <td colspan="${ftColspan}" class="rc-tt-label">Term 2 Total</td>
      <td class="rc-tt-max">Max: ${config.grandTotalMax}</td>
      <td class="rc-tt-val">${ftEmpty ? '' : data.finalTerm.grandTotal}</td>
      <td class="rc-tt-consol">${ftEmpty ? '' : (data.halfYearly.grandTotal + data.finalTerm.grandTotal)}</td>
      <td class="rc-tt-grade">${ftEmpty ? '' : data.finalTerm.grade}</td>
    </tr>
  `;

  // Summary
  const consol = data.consolidated;
  // Half-yearly-only card (Term 2 not assessed): the Final Result Summary is a
  // final-term/annual judgment, so it stays blank until Term 2 is assessed —
  // matching the Term 2 Summary block above, rather than showing a HY-basis
  // result that could be mistaken for the final outcome.
  document.getElementById('rcSumTotal').textContent = ftEmpty ? '—' : consol.grandTotal;
  document.getElementById('rcSumMax').textContent = ftEmpty ? '—' : (config.grandTotalMax * 2);
  const sumExempt = isReducedSubjectStudent(data.student && data.student.name);
  document.getElementById('rcSumPct').textContent = (sumExempt || ftEmpty)
    ? '—'
    : formatPct(consol.percentage) + '%';
  document.getElementById('rcSumGrade').textContent = (sumExempt || ftEmpty)
    ? '—'
    : consol.grade;
  // Rank shown only for students who passed all subjects — a failed student
  // never displays a rank on the report card, matching the marksheet rule.
  // Reduced-subject students are excluded from ranking entirely.
  const rankEligible = !sumExempt &&
    (consol.result === 'PASS' || consol.result === 'PROMOTED' || consol.result === 'PROMOTED WITH GRACE');
  document.getElementById('rcSumRank').textContent = (rankEligible && data.finalTerm.rank) ? data.finalTerm.rank : '—';
  document.getElementById('rcSumTotalStudents').textContent = (rankEligible && data.finalTerm.totalStudents) ? data.finalTerm.totalStudents : '—';

  // ── ADMIN-CONTROLLED FINAL STATUS (all classes III–X) ──────────────────────
  // Fields: data.finalStatus = "PROMOTED" | "DETAINED"
  //         data.promotedToClass = e.g. "VII", "VIII", "IX"
  // Fallback: show PASS / FAIL from internal calculation when not set by admin
  const resultEl   = document.getElementById('rcSumResult');
  const finalStatus = data.finalStatus;

  if (ftEmpty) {
    resultEl.textContent      = '—';
    resultEl.style.color      = '';
    resultEl.style.fontSize   = '';
    resultEl.style.letterSpacing = '';
    resultEl.dataset.status   = '';
  } else if (finalStatus === 'PROMOTED') {
    const toClass = (data.promotedToClass || '').toString().trim().toUpperCase();
    resultEl.textContent  = toClass ? 'PROMOTED TO CLASS ' + toClass : 'PROMOTED';
    resultEl.style.color      = '#1B6B2F';
    resultEl.style.fontSize   = toClass ? '0.72rem' : '0.92rem';
    resultEl.style.letterSpacing = '0.5px';
    resultEl.dataset.status   = 'promoted';
  } else if (finalStatus === 'DETAINED') {
    resultEl.textContent      = 'DETAINED';
    resultEl.style.color      = '#B71C1C';
    resultEl.style.fontSize   = '0.92rem';
    resultEl.style.letterSpacing = '1px';
    resultEl.dataset.status   = 'detained';
  } else {
    // Fallback — PASS / FAIL from consolidated calculation
    resultEl.textContent      = consol.result || '—';
    resultEl.style.color      = consol.result === 'PASS' ? '#2E7D32' : '#C62828';
    resultEl.style.fontSize   = '';
    resultEl.style.letterSpacing = '';
    resultEl.dataset.status   = (consol.result || '').toLowerCase();
  }
  // ───────────────────────────────────────────────────────────────────────────

  const hyAtt = data.halfYearly.attendance;
  const ftAtt = data.finalTerm.attendance;
  const avgAtt = (hyAtt.total + ftAtt.total) > 0
    ? (((hyAtt.present + ftAtt.present) / (hyAtt.total + ftAtt.total)) * 100)
    : 0;
  document.getElementById('rcSumAtt').textContent = formatPct(avgAtt) + '%';

  const principalEl = document.getElementById('rcPrincipalRemark');
  if (principalEl) {
    // Same rule as the Term 2 class-teacher remark: no auto-generated remark
    // until the final term is assessed.
    const ftRemark = (data.remarks && data.remarks.finalTerm)
      || (ftEmpty ? '' : generateRemark(data, config, 'ft'));
    principalEl.textContent = ftRemark ? `"${ftRemark}"` : '—';
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   8. TABLE ROW BUILDER
   ═══════════════════════════════════════════════════════════════════════════ */
function buildTableRows(term, data, config, isStandard, showConsol) {
  let html = '';
  const subjects = config.subjects;
  const termData = term === 'hy' ? data.halfYearly : data.finalTerm;
  const passmark = config.passmark || 40;
  const pmRatio  = passmark / 100;

  // Proportional sub-component fail thresholds
  const iaThreshStd   = Math.round(10 * pmRatio);
  const utThresh      = Math.round(30 * pmRatio);
  const examThreshStd = Math.round(60 * pmRatio);
  const iaThreshSen   = Math.round(20 * pmRatio);
  const examThreshSen = Math.round(80 * pmRatio);

  // Combined mark styling: red+underline below the field's fail threshold,
  // green when the mark is >=80% of that field's own max (IA/UT/Exam each
  // have a different max, so this is computed per field, not on raw value).
  const markCls = (val, threshold, max) => {
    if (val === undefined || val === null || val === '') return '';
    if (val < threshold) return ' rc-cell-fail';
    if (max > 0 && (val / max) * 100 >= 80) return ' rc-cell-high';
    return '';
  };

  for (const subj of subjects) {
    const subjData = termData.subjects[subj.key] || {};
    const total = subjData.total || 0;
    const grade = getGradeFromMarks(total, passmark);
    // Reduced-subject student: a subject with no marks entered at all is one
    // they don't take — render it blank (not 0/F, no fail styling) rather than
    // as a failed row. Only applies to the exempt student.
    const notTaken = isReducedSubjectStudent(data.student && data.student.name)
      && subjData.total === undefined;
    // Term 2 (Final Term) not yet assessed → render the whole term blank rather
    // than 0 / F. Detected by a zero grand total for that term (a real assessed
    // term always has marks). HY is unaffected (term !== 'ft').
    const ftEmpty = term === 'ft' && (data.finalTerm.grandTotal || 0) === 0;
    const blank = notTaken || ftEmpty;
    const totalDisp = blank ? '' : total;
    const gradeDisp = blank ? '' : grade;

    // A subject fails if the total misses the passmark, OR (senior scheme
    // only) the total clears it but IA/Exam individually miss their
    // proportional floors (2026-07 rule: 30 in combination doesn't qualify
    // as pass if either component is below its own floor).
    const componentFail = !isStandard && !subj.singleTotal &&
      (subjData.ia < iaThreshSen || subjData.exam < examThreshSen);
    const totalFails = !blank && (total < passmark || componentFail);
    const gradeFail = totalFails ? ' fail' : '';
    const totalMarkCls = blank ? '' : (totalFails ? ' rc-cell-fail' : (total >= 80 ? ' rc-cell-high' : ''));

    let cls = 'rc-row-normal';
    if (subj.isAggregate) cls = 'rc-row-aggregate';
    else if (subj.singleTotal) cls = 'rc-row-single';
    else if (!subj.countInTotal) cls = 'rc-row-component';

    html += `<tr class="${cls}"><td>${subj.label}</td>`;

    const consolSubj = data.consolidated.subjects[subj.key];
    const consolTotal = consolSubj?.total || 0;

    if (subj.isAggregate) {
      const blanks = isStandard ? 3 : 2;
      for (let i = 0; i < blanks; i++) html += '<td>—</td>';
      html += `<td class="rc-cell-total${totalMarkCls}">${totalDisp}</td>`;
      if (showConsol) {
        html += `<td class="rc-cell-consol${blank ? '' : markCls(consolSubj?.total, passmark * 2, 200)}">${blank ? '' : consolTotal}</td>`;
      }
      html += `<td class="rc-cell-grade"><span class="rc-grade-pill${gradeFail}">${gradeDisp}</span></td>`;
    }
    else if (subj.singleTotal) {
      const blanks = isStandard ? 3 : 2;
      for (let i = 0; i < blanks; i++) html += '<td></td>';
      html += `<td class="rc-cell-total${totalMarkCls}">${totalDisp}</td>`;
      if (showConsol) {
        html += `<td class="rc-cell-consol${blank ? '' : markCls(consolSubj?.total, passmark * 2, 200)}">${blank ? '' : consolTotal}</td>`;
      }
      html += `<td class="rc-cell-grade"><span class="rc-grade-pill${gradeFail}">${gradeDisp}</span></td>`;
    }
    else {
      if (isStandard) {
        html += `<td class="${blank ? '' : markCls(subjData.ia, iaThreshStd, 10)}">${blank ? '' : (subjData.ia !== undefined ? subjData.ia : '—')}</td>`;
        html += `<td class="${blank ? '' : markCls(subjData.ut, utThresh, 30)}">${blank ? '' : (subjData.ut !== undefined ? subjData.ut : '—')}</td>`;
        html += `<td class="${blank ? '' : markCls(subjData.exam, examThreshStd, 60)}">${blank ? '' : (subjData.exam !== undefined ? subjData.exam : '—')}</td>`;
      } else {
        html += `<td class="${blank ? '' : markCls(subjData.ia, iaThreshSen, 20)}">${blank ? '' : (subjData.ia !== undefined ? subjData.ia : '—')}</td>`;
        html += `<td class="${blank ? '' : markCls(subjData.exam, examThreshSen, 80)}">${blank ? '' : (subjData.exam !== undefined ? subjData.exam : '—')}</td>`;
      }
      html += `<td class="rc-cell-total${totalMarkCls}">${totalDisp}</td>`;
      if (showConsol) {
        html += `<td class="rc-cell-consol${blank ? '' : markCls(consolSubj?.total, passmark * 2, 200)}">${blank ? '' : consolTotal}</td>`;
      }
      html += `<td class="rc-cell-grade"><span class="rc-grade-pill${gradeFail}">${gradeDisp}</span></td>`;
    }

    html += '</tr>';
  }

  return html;
}

/* ═══════════════════════════════════════════════════════════════════════════
   9. CO-SCHOLASTIC BUILDER
   ═══════════════════════════════════════════════════════════════════════════ */
function buildCoScholastic(coData, config) {
  if (!coData) return '';
  let html = `
    <div class="rc-coschol-header">
      <span></span>
      <span class="rc-coschol-hdr-terms"><span>T1</span><span>T2</span></span>
    </div>
  `;
  for (const item of config.coScholastic) {
    const vals = coData[item.key];
    const hyGrade = vals?.halfYearly || '—';
    const ftGrade = vals?.finalTerm  || '—';
    html += `
      <div class="rc-coschol-item">
        <span class="rc-coschol-label">${item.label}</span>
        <span class="rc-coschol-terms">
          <span class="rc-coschol-grade">${hyGrade}</span>
          <span class="rc-coschol-grade">${ftGrade}</span>
        </span>
      </div>
    `;
  }
  return html;
}

/* ═══════════════════════════════════════════════════════════════════════════
   11. REMARK ENGINE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * generateRemark(data, config, term)
 *
 * Produces a personalised, school-appropriate remark for the given term.
 * term: 'hy' (Half Yearly) | 'ft' (Final Term)
 *
 * Rules:
 *  - Observational only — no promotion / detention language
 *  - Max 420 characters
 *  - Sentence budget: Class ≤8 up to 5 sentences | Class 9–10 up to 4 (stays a
 *    notch terser/more formal)
 *  - Bands: excellent / vgood / good / average / weak / critical. 'critical'
 *    triggers when at least half the scorable subjects individually miss the
 *    pass mark, even if the aggregate % looks passable/weak — the aggregate
 *    can hide a majority-fail. In 'critical', the engine never cites a
 *    failing subject as a "strength"; it names the subjects most in need of
 *    attention (max 2) and anchors the encouraging line on something
 *    genuinely true (attendance or a real co-scholastic strength) instead.
 */
function generateRemark(data, config, term) {
  const cls      = parseInt(data.class, 10);
  const termData = term === 'hy' ? data.halfYearly : data.finalTerm;
  const isStd    = config.markScheme === 'standard';
  const passmark = config.passmark || 40;
  const pmRatio  = passmark / 100;
  const iaThreshSen   = Math.round(20 * pmRatio);
  const examThreshSen = Math.round(80 * pmRatio);

  // ── 1. Per-subject analysis — pass/fail against the real passmark rule,
  //       not just the aggregate percentage ─────────────────────────────────
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

  // ── 2. Performance band ────────────────────────────────────────────────────
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

  // ── 3. Best subject (cited only for non-critical bands) & focus subjects ──
  const best      = byTotalDesc[0] || null;
  const bestLabel = best ? best.subj.label : 'core subjects';
  const bestPct   = best ? Math.round(best.total) : null;

  // Critical/weak: only ever name a subject that's an actual fail (never
  // dress up a fail as the "best" subject). Other bands: still call out the
  // relatively weakest subject even if it's technically passing — that's
  // useful, honest feedback and matches how this always worked.
  const worstCandidate = byTotalAsc[0] || null;
  const focusSubjects = (band === 'critical' || band === 'weak')
    ? byTotalAsc.filter(a => a.fails).slice(0, 2)
    : (worstCandidate && best && worstCandidate.subj.key !== best.subj.key)
      ? [worstCandidate]
      : [];
  const focusLabels = focusSubjects.map(a => a.subj.label);

  // ── 4. Attendance ──────────────────────────────────────────────────────────
  const att     = termData.attendance || { present: 0, total: 0 };
  const attPct  = att.total > 0 ? (att.present / att.total) * 100 : 100;
  const lowAtt  = attPct < 75;
  const highAtt = attPct >= 95;

  // ── 5. UT vs TE — per-subject, so the remark can name the actual subject
  //       instead of speaking only in aggregate terms (standard scheme only) ─
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

  // ── 6. Term-over-term trend (Final Term remarks only) ──────────────────────
  let trendLine = '';
  if (term === 'ft' && config.grandTotalMax > 0 && (data.halfYearly.grandTotal || 0) > 0) {
    const hyPct  = (data.halfYearly.grandTotal / config.grandTotalMax) * 100;
    const delta  = termPct - hyPct;
    if (delta >= 8) trendLine = 'This marks a clear improvement over the half-yearly result.';
    else if (delta <= -8) trendLine = 'This is a dip compared to the half-yearly performance, worth addressing early next session.';
  }

  // ── 7. Personalisation & deterministic phrasing seed ───────────────────────
  // Seeded (not random) so the same student/term always reproduces the exact
  // same remark on reprint, while varying phrasing across different students.
  const firstName = (data.student && data.student.name)
    ? data.student.name.trim().split(/\s+/)[0]
    : 'The student';
  const seedStr = `${(data.student && data.student.name) || firstName}|${cls}|${term}`;
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;

  // ── 8. Opening sentence pools ───────────────────────────────────────────────
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

  // ── 9. Focus / weakness sentence — names subjects gently, frames as
  //       opportunity rather than deficiency ────────────────────────────────
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

  // ── 10. Closing encouragement — present for every band, effort-calibrated ─
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

  // ── 11. Positive anchor for the critical band — keeps the tone encouraging
  //        even when no subject can honestly be called a strength ──────────
  let anchorLine = '';
  if (band === 'critical') {
    anchorLine = attPct >= 85
      ? 'Regular attendance this term is a good foundation to build from.'
      : `${firstName} has the ability to turn this around with the right support and consistent effort.`;
  }

  // ── 12. Attendance sentence for non-critical bands (critical uses the
  //        anchor line above instead) ────────────────────────────────────────
  let attLine = '';
  if (band !== 'critical') {
    if (lowAtt) attLine = 'More regular attendance would help support stronger progress.';
    else if (highAtt) attLine = 'Regular attendance this term is commendable.';
  }

  // ── 13. Assemble, priority-ordered, capped by class tier ───────────────────
  // Class 9–10 stays a notch terser/more formal; Class ≤8 gets more room.
  const maxSentences = cls >= 9 ? 4 : 5;
  const candidates = band === 'critical'
    ? [s1, s2, utInsight, trendLine, anchorLine, s3]
    : [s1, s2, utInsight, trendLine, attLine, s3];
  const parts = candidates.filter(Boolean).slice(0, maxSentences);
  // The closing encouragement line always survives the cap, even if lower-
  // priority filler (e.g. attendance) has to give way for it.
  if (parts.length === maxSentences && parts[parts.length - 1] !== s3) {
    parts[parts.length - 1] = s3;
  }

  let remark = parts.join(' ');

  // ── 14. Enforce a hard character ceiling ────────────────────────────────
  const CHAR_LIMIT = 420;
  if (remark.length > CHAR_LIMIT) {
    while (parts.length > 2 && remark.length > CHAR_LIMIT) {
      parts.splice(parts.length - 2, 1); // drop from the middle, keep opener + closer
      remark = parts.join(' ');
    }
    if (remark.length > CHAR_LIMIT) {
      remark = remark.slice(0, CHAR_LIMIT - 3) + '...';
    }
  }

  return remark;
}

/* ═══════════════════════════════════════════════════════════════════════════
   10. FUTURE-READY API SURFACE
   ═══════════════════════════════════════════════════════════════════════════
   The window.SFDS namespace exposes the report-card renderer for external
   orchestration (e.g., bulk-print loops, Firebase hydration, JSON import).
   JSON schema expected in sessionStorage key "sfds_studentData":
   {
     "class": number,
     "section": string,
     "session": string,
     "student": { name, rollNo, admissionNo, dob, house },
     "halfYearly": { attendance:{present,total}, grandTotal, grade, subjects:{...} },
     "finalTerm":  { attendance:{present,total}, grandTotal, grade, rank, totalStudents, subjects:{...} },
     "consolidated": { grandTotal, percentage, grade, result, subjects:{...} },
     "coScholastic": { key: { halfYearly, finalTerm } },
     "remarks": { halfYearly, finalTerm }
   }
   ═══════════════════════════════════════════════════════════════════════════ */
window.SFDS = window.SFDS || {};
window.SFDS.version = '1.1';
window.SFDS.renderReportCard = render;
window.SFDS.getGradeFromMarks = getGradeFromMarks;
window.SFDS.formatPct = formatPct;
window.SFDS.generateRemark = generateRemark;

/* ═══════════════════════════════════════════════════════════════════════════
   12. INIT
   ═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', render);
