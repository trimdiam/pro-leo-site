// ── Attendance Range Report ───────────────────────────────────────────────────
// Admin-side attendance totals across an arbitrary span of months (1, 3, 6, or
// any custom From/To), rather than the single month the Monthly Attendance
// screen reports on.
//
// SOURCE: attendance_daily, deliberately.
//   attendance_monthly is NOT used. Those snapshots are themselves generated
//   from attendance_daily (see generateMonthlySnapshot in app-logic.js), so
//   reading them as well would double-count, and in practice they are mostly
//   empty shells: of the 7 that exist, 5 have working_days = 0 because they were
//   generated for months that had no daily data. Daily is the only complete
//   record, and it is what the class teachers actually fill in.
//
// LATE COUNTS AS PRESENT. A late pupil attended. This matches the percentage the
// existing monthly report already prints ((present + late) / total), and the
// school's instruction. Late is still shown as its own column so nothing is
// hidden -- "Present" is strictly on-time, "Total Present" includes late.

const FB_VERSION = '10.13.0';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

let _db = null;
async function ensureDb() {
  if (_db) return _db;
  const { getFirestore } = await import(`${FB_BASE}/firebase-firestore.js`);
  const { getApp } = await import(`${FB_BASE}/firebase-app.js`);
  _db = getFirestore(getApp());
  return _db;
}
const fs = () => import(`${FB_BASE}/firebase-firestore.js`);

const $ = (id) => document.getElementById(id);
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return MONTHS[Number(m) - 1] + ' ' + y;
}

// "2026-03" -> first/last calendar day, so the filter is a plain string compare
function rangeBounds(fromYM, toYM) {
  const [ty, tm] = toYM.split('-').map(Number);
  const lastDay = new Date(ty, tm, 0).getDate();
  return { start: fromYM + '-01', end: toYM + '-' + String(lastDay).padStart(2, '0') };
}

// ── Core aggregation ──────────────────────────────────────────────────────────

export async function computeRange(classId, fromYM, toYM) {
  const db = await ensureDb();
  const { collection, query, where, getDocs, orderBy } = await fs();
  const { start, end } = rangeBounds(fromYM, toYM);

  // Filter by class server-side, by date in memory: the daily docs carry a plain
  // `date` string and adding a range filter here would need a composite index.
  const [dailySnap, studSnap] = await Promise.all([
    getDocs(query(collection(db, 'attendance_daily'), where('class', '==', String(classId)))),
    getDocs(query(collection(db, 'students'), where('class', '==', String(classId)), orderBy('rollNo')))
  ]);

  const days = [];
  dailySnap.forEach(d => {
    const x = d.data();
    if (x.date >= start && x.date <= end) days.push(x);
  });
  days.sort((a, b) => a.date.localeCompare(b.date));

  const students = [];
  const seenRoll = new Set();
  studSnap.forEach(d => {
    const s = d.data();
    // The roster occasionally carries a duplicate roll; keep the first.
    if (seenRoll.has(s.rollNo)) return;
    seenRoll.add(s.rollNo);
    // Pupils who have LEFT are deliberately kept here. They are off the roll for
    // mark entry and attendance-taking, but this is a historical report: a child
    // who left in April genuinely attended February and March, and dropping them
    // would quietly shrink the class and understate the days actually taught.
    // Flagged instead, so the reader can see why a row stops part-way.
    const hasLeft = String(s.status || '').toLowerCase() === 'left';
    students.push({
      id: s.studentId || d.id,
      name: (s.name || '—') + (hasLeft ? ' (left)' : ''),
      gender: s.gender || '', rollNo: s.rollNo || 0, hasLeft
    });
  });

  const absentC = {}, lateC = {};
  days.forEach(d => {
    (d.absent || []).forEach(i => { absentC[i] = (absentC[i] || 0) + 1; });
    (d.late   || []).forEach(i => { lateC[i]   = (lateC[i]   || 0) + 1; });
  });

  const workingDays = days.length;
  const rows = students.map(s => {
    const absent = absentC[s.id] || 0;
    const late   = lateC[s.id]   || 0;
    const present = workingDays - absent - late;      // strictly on time
    const totalPresent = workingDays - absent;        // present + late
    return {
      ...s, present, late, absent, totalPresent, workingDays,
      percentage: workingDays > 0 ? Math.round((totalPresent / workingDays) * 1000) / 10 : 0
    };
  });

  // Which months actually contributed, so a gap is visible rather than silent.
  const monthsFound = [...new Set(days.map(d => d.date.slice(0, 7)))].sort();
  const monthsAsked = [];
  {
    let [y, m] = fromYM.split('-').map(Number);
    const [ty, tm] = toYM.split('-').map(Number);
    while (y < ty || (y === ty && m <= tm)) {
      monthsAsked.push(y + '-' + String(m).padStart(2, '0'));
      if (++m > 12) { m = 1; y++; }
    }
  }

  return {
    classId, fromYM, toYM, workingDays, rows, days,
    monthsFound,
    monthsMissing: monthsAsked.filter(m => !monthsFound.includes(m)),
    perMonth: monthsFound.map(m => ({ month: m, days: days.filter(d => d.date.slice(0, 7) === m).length })),
    totals: {
      present:      rows.reduce((a, r) => a + r.present, 0),
      late:         rows.reduce((a, r) => a + r.late, 0),
      absent:       rows.reduce((a, r) => a + r.absent, 0),
      totalPresent: rows.reduce((a, r) => a + r.totalPresent, 0),
      students:     rows.length
    }
  };
}

// ── Render ────────────────────────────────────────────────────────────────────

let _last = null;   // last computed result, reused by the export buttons

function pctClass(p) { return p >= 90 ? 'badge-success' : p >= 75 ? 'badge-warning' : 'badge-danger'; }

function renderRange(res) {
  const tbody = $('ar-tbody');
  const summary = $('ar-summary');
  if (!tbody) return;

  const span = monthLabel(res.fromYM) + (res.fromYM === res.toYM ? '' : ' — ' + monthLabel(res.toYM));
  const title = $('ar-title');
  if (title) title.textContent = 'Class ' + res.classId + '  ·  ' + span;

  if (!res.workingDays) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--text-light)">' +
      'No attendance was recorded for this class in that period.</td></tr>';
    if (summary) summary.innerHTML = '';
    return;
  }

  const t = res.totals;
  const overallPct = res.workingDays && t.students
    ? Math.round((t.totalPresent / (res.workingDays * t.students)) * 1000) / 10 : 0;

  const gap = res.monthsMissing.length
    ? '<div style="margin-top:10px;padding:8px 12px;background:#fff3cd;border-radius:8px;font-size:12px;color:#7a5c00">' +
      '<strong>No records for:</strong> ' + res.monthsMissing.map(monthLabel).join(', ') +
      ' — these months contribute 0 days to the totals below.</div>'
    : '';

  if (summary) {
    summary.innerHTML =
      '<div class="am-summary-grid">' +
        '<div class="am-summary-card" style="background:rgba(214,195,163,0.3)">' +
          '<div class="am-sc-label">Working Days</div><div class="am-sc-pct">' + res.workingDays + '</div>' +
          '<div class="am-sc-sub">' + res.perMonth.map(p => monthLabel(p.month).slice(0, 3) + ' ' + p.days).join(' · ') + '</div></div>' +
        '<div class="am-summary-card" style="background:rgba(173,216,230,0.35)">' +
          '<div class="am-sc-label">Total Days Present</div><div class="am-sc-pct">' + t.totalPresent + '</div>' +
          '<div class="am-sc-sub">on time ' + t.present + ' · late ' + t.late + '</div></div>' +
        '<div class="am-summary-card" style="background:rgba(255,182,193,0.35)">' +
          '<div class="am-sc-label">Total Absences</div><div class="am-sc-pct">' + t.absent + '</div>' +
          '<div class="am-sc-sub">across ' + t.students + ' students</div></div>' +
        '<div class="am-summary-card" style="background:rgba(200,230,201,0.45)">' +
          '<div class="am-sc-label">Overall</div><div class="am-sc-pct">' + overallPct + '%</div>' +
          '<div class="am-sc-sub">' + t.totalPresent + ' of ' + (res.workingDays * t.students) + ' possible</div></div>' +
      '</div>' + gap;
  }

  tbody.innerHTML = res.rows.map(r =>
    '<tr>' +
      '<td>' + (r.rollNo || '—') + '</td>' +
      '<td>' + r.name + '</td>' +
      '<td>' + (r.gender === 'M' ? 'M' : r.gender === 'F' ? 'F' : '—') + '</td>' +
      '<td>' + r.present + '</td>' +
      '<td>' + r.late + '</td>' +
      '<td>' + r.absent + '</td>' +
      '<td>' + r.workingDays + '</td>' +
      '<td style="font-weight:700">' + r.totalPresent + '</td>' +
      '<td><span class="badge ' + pctClass(r.percentage) + '">' + r.percentage + '%</span></td>' +
    '</tr>').join('');
}

// ── Public entry points (wired to the buttons in index.html) ──────────────────

window.loadAttendanceRange = async function () {
  const classId = $('ar-class-sel')?.value;
  const fromYM  = $('ar-from')?.value;
  const toYM    = $('ar-to')?.value;
  if (!classId) return window.showToast?.('⚠️ Select a class first.');
  if (!fromYM || !toYM) return window.showToast?.('⚠️ Choose both From and To months.');
  if (fromYM > toYM) return window.showToast?.('⚠️ "From" month is after "To" month.');

  const tbody = $('ar-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--text-light)">Loading…</td></tr>';
  try {
    _last = await computeRange(classId, fromYM, toYM);
    renderRange(_last);
    $('ar-detail-wrap')?.classList.add('open');
  } catch (err) {
    console.error('Attendance range failed:', err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:16px;color:var(--danger)">Failed: ' + (err.message || 'unknown error') + '</td></tr>';
  }
};

// Preset buttons: last N calendar months, ending with the current month.
window.setAttendanceRangePreset = function (months) {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const ym = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if ($('ar-from')) $('ar-from').value = ym(from);
  if ($('ar-to'))   $('ar-to').value   = ym(to);
};

// ── Exports ───────────────────────────────────────────────────────────────────

function requireData() {
  if (!_last || !_last.workingDays) {
    window.showToast && window.showToast('Load a range first.');
    return null;
  }
  return _last;
}

function spanLabel(res) {
  return monthLabel(res.fromYM) + (res.fromYM === res.toYM ? '' : ' to ' + monthLabel(res.toYM));
}

function fileStem(res) {
  return 'Class_' + res.classId + '_' + res.fromYM + '_to_' + res.toYM + '_Attendance';
}

function overallPctOf(res) {
  const possible = res.workingDays * res.totals.students;
  return possible ? Math.round((res.totals.totalPresent / possible) * 1000) / 10 : 0;
}

window.pdfExportAttendanceRange = async function () {
  const res = requireData(); if (!res) return;
  window.showToast && window.showToast('Generating PDF...');
  try { if (window.loadPortalLibs) await window.loadPortalLibs(); } catch (e) {}
  try { if (window._ensureJsPDF) await window._ensureJsPDF(); } catch (e) {}
  if (!(window.jspdf && window.jspdf.jsPDF)) { window.showToast && window.showToast('PDF library failed to load.'); return; }

  const jsPDF = window.jspdf.jsPDF;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  if (typeof pdf.autoTable !== 'function') { window.showToast && window.showToast('PDF table plugin not ready.'); return; }

  const t = res.totals;
  const pct = overallPctOf(res).toFixed(1);

  pdf.setFontSize(14); pdf.setFont('helvetica', 'bold');
  pdf.text('St. Francis De Sales Sec. School', pw / 2, 18, { align: 'center' });
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
  pdf.text('Laitkor, Shillong, Meghalaya', pw / 2, 23, { align: 'center' });
  pdf.setFontSize(12); pdf.setFont('helvetica', 'bold');
  pdf.text('Attendance Report', pw / 2, 31, { align: 'center' });
  pdf.setFontSize(9); pdf.setFont('helvetica', 'normal');
  pdf.text('Class: ' + res.classId + '   |   Period: ' + spanLabel(res) + '   |   Generated: ' + new Date().toLocaleString(), pw / 2, 37, { align: 'center' });
  pdf.setDrawColor(139, 111, 71); pdf.setLineWidth(0.5); pdf.line(14, 40, pw - 14, 40);

  pdf.setFontSize(9); pdf.setFont('helvetica', 'bold');
  pdf.text('Working Days: ' + res.workingDays, 14, 47);
  pdf.text('Total Days Present: ' + t.totalPresent, pw / 2 - 24, 47);
  pdf.text('Overall: ' + pct + '%', pw - 14 - 24, 47);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8);
  pdf.text('Months counted: ' + res.perMonth.map(function (p) { return monthLabel(p.month) + ' (' + p.days + 'd)'; }).join(', '), 14, 52);
  let y = 55;
  if (res.monthsMissing.length) {
    pdf.text('No records for: ' + res.monthsMissing.map(monthLabel).join(', '), 14, y);
    y += 3;
  }
  pdf.line(14, y, pw - 14, y);

  pdf.autoTable({
    startY: y + 3,
    head: [['Roll', 'Name', 'Gen', 'Present', 'Late', 'Absent', 'Work Days', 'Total Present', '%']],
    body: res.rows.map(function (r) {
      return [r.rollNo || '-', r.name, r.gender === 'M' ? 'M' : r.gender === 'F' ? 'F' : '-',
        r.present, r.late, r.absent, r.workingDays, r.totalPresent, r.percentage + '%'];
    }),
    foot: [['', 'CLASS TOTAL', '', t.present, t.late, t.absent, res.workingDays, t.totalPresent, pct + '%']],
    margin: { left: 14, right: 14 },
    headStyles: { fillColor: [139, 111, 71], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [230, 220, 200], textColor: 20, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    columnStyles: { 1: { cellWidth: 38 }, 7: { fontStyle: 'bold' } },
    didParseCell: function (data) {
      if (data.section === 'body' && data.column.index === 8) {
        const p = parseFloat(data.cell.raw);
        data.cell.styles.fillColor = p >= 90 ? [209, 236, 214] : p >= 75 ? [255, 243, 205] : [248, 215, 218];
      }
    },
    didDrawPage: function () {
      const pg = pdf.internal.getCurrentPageInfo().pageNumber;
      pdf.setFontSize(8); pdf.setFont('helvetica', 'normal');
      pdf.text('Generated by School Management System', 14, pageH - 8);
      pdf.text('Page ' + pg, pw - 14, pageH - 8, { align: 'right' });
    }
  });

  const finalY = pdf.lastAutoTable.finalY + 14;
  pdf.setFontSize(9);
  pdf.text('Admin Signature: ___________________', 14, finalY);
  pdf.text('Headmistress Signature: ___________________', pw - 14 - 62, finalY);
  pdf.save(fileStem(res) + '.pdf');
};

window.excelExportAttendanceRange = function () {
  const res = requireData(); if (!res) return;
  if (!window.XLSX) { window.showToast && window.showToast('Excel library not loaded.'); return; }
  const t = res.totals;
  const pct = overallPctOf(res);

  const aoa = [
    ['St. Francis De Sales Sec. School'],
    ['Attendance Report'],
    ['Class', res.classId],
    ['Period', spanLabel(res)],
    ['Working Days', res.workingDays],
    ['Months counted', res.perMonth.map(function (p) { return monthLabel(p.month) + ' (' + p.days + ')'; }).join(', ')],
    ['Months with no records', res.monthsMissing.length ? res.monthsMissing.map(monthLabel).join(', ') : 'none'],
    ['Generated', new Date().toLocaleString()],
    [],
    ['Roll', 'Name', 'Gender', 'Present', 'Late', 'Absent', 'Working Days', 'Total Days Present', '%']
  ];
  res.rows.forEach(function (r) {
    aoa.push([r.rollNo || '', r.name, r.gender || '', r.present, r.late, r.absent, r.workingDays, r.totalPresent, r.percentage]);
  });
  aoa.push([]);
  aoa.push(['', 'CLASS TOTAL', '', t.present, t.late, t.absent, res.workingDays, t.totalPresent, pct]);

  const wb = window.XLSX.utils.book_new();
  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 8 }, { wch: 9 }, { wch: 7 }, { wch: 8 }, { wch: 12 }, { wch: 18 }, { wch: 7 }];
  window.XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
  window.XLSX.writeFile(wb, fileStem(res) + '.xlsx');
};

window.printAttendanceRange = function () {
  const res = requireData(); if (!res) return;
  const t = res.totals;
  const pct = overallPctOf(res).toFixed(1);
  const esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  let html = '';
  html += '<!doctype html><meta charset="utf-8"><title>' + esc(fileStem(res)) + '</title>';
  html += '<style>body{font-family:Arial,sans-serif;padding:18px;color:#222}';
  html += 'h1{font-size:16px;margin:0;text-align:center}';
  html += 'h2{font-size:13px;margin:2px 0 10px;text-align:center;font-weight:normal}';
  html += 'table{width:100%;border-collapse:collapse;font-size:11px;margin-top:10px}';
  html += 'th,td{border:1px solid #bbb;padding:4px 6px;text-align:center}';
  html += 'th{background:#8b6f47;color:#fff}';
  html += 'td:nth-child(2){text-align:left}';
  html += 'tfoot td{font-weight:bold;background:#eee}';
  html += '.meta{font-size:11px;text-align:center;margin-bottom:6px}';
  html += '@media print{@page{margin:12mm}}</style>';
  html += '<h1>St. Francis De Sales Sec. School</h1><h2>Attendance Report</h2>';
  html += '<div class="meta">Class ' + esc(res.classId) + ' | ' + esc(spanLabel(res));
  html += ' | Working Days: <b>' + res.workingDays + '</b>';
  html += ' | Total Days Present: <b>' + t.totalPresent + '</b>';
  html += ' | Overall: <b>' + pct + '%</b></div>';
  if (res.monthsMissing.length) {
    html += '<div class="meta">No records for: ' + esc(res.monthsMissing.map(monthLabel).join(', ')) + '</div>';
  }
  html += '<table><thead><tr><th>Roll</th><th>Name</th><th>Gen</th><th>Present</th><th>Late</th>';
  html += '<th>Absent</th><th>Work Days</th><th>Total Present</th><th>%</th></tr></thead><tbody>';
  res.rows.forEach(function (r) {
    html += '<tr><td>' + (r.rollNo || '-') + '</td><td>' + esc(r.name) + '</td><td>' + (r.gender || '-') + '</td>';
    html += '<td>' + r.present + '</td><td>' + r.late + '</td><td>' + r.absent + '</td>';
    html += '<td>' + r.workingDays + '</td><td><b>' + r.totalPresent + '</b></td><td>' + r.percentage + '%</td></tr>';
  });
  html += '</tbody><tfoot><tr><td></td><td>CLASS TOTAL</td><td></td><td>' + t.present + '</td>';
  html += '<td>' + t.late + '</td><td>' + t.absent + '</td><td>' + res.workingDays + '</td>';
  html += '<td>' + t.totalPresent + '</td><td>' + pct + '%</td></tr></tfoot></table>';

  const w = window.open('', '_blank');
  if (!w) { window.showToast && window.showToast('Pop-up blocked - allow pop-ups to print.'); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
};
