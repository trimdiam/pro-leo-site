// staff-attendance-report.js
// Monthly PDF export for staff attendance — two modes:
//   • saReportTeacher(uid) → per-teacher daily sheet
//   • saReportRoster()     → whole-staff monthly roster
// Reads the month data already fetched by staff-attendance-admin.js
// (window.saGetMonthCache). Uses jsPDF + autoTable (vector tables), loaded
// on demand from CDN. New feature => new file.

(function () {
  var JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var AUTOTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
  var BRAND = [139, 111, 71];          // #8b6f47
  var loaded = false;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }
  // jsPDF must load before its autoTable plugin.
  async function ensureLibs() {
    if (loaded) return;
    await loadScript(JSPDF_URL);
    await loadScript(AUTOTABLE_URL);
    loaded = true;
  }

  function schoolName() {
    try { if (window.CONFIG && window.CONFIG[1] && window.CONFIG[1].schoolName) return window.CONFIG[1].schoolName; } catch (e) {}
    return 'St. Francis De Sales School';
  }
  function monthLabel(ym) {
    return new Date(ym + '-01T00:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  function dow(dateKey) {
    return new Date(dateKey + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short' });
  }
  function fmtMins(m) {
    if (m == null) return '—';
    var h = Math.floor(m / 60), mm = m % 60;
    return (h ? h + 'h ' : '') + mm + 'm';
  }
  function header(doc, title, subtitle) {
    doc.setFontSize(15); doc.setTextColor(BRAND[0], BRAND[1], BRAND[2]); doc.setFont(undefined, 'bold');
    doc.text(schoolName(), 40, 46);
    doc.setFontSize(11); doc.setTextColor(60); doc.setFont(undefined, 'normal');
    doc.text(title, 40, 64);
    if (subtitle) { doc.setFontSize(9); doc.setTextColor(120); doc.text(subtitle, 40, 79); }
    doc.setDrawColor(BRAND[0], BRAND[1], BRAND[2]); doc.setLineWidth(1);
    doc.line(40, 86, doc.internal.pageSize.getWidth() - 40, 86);
  }
  function footer(doc) {
    var w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text('Generated ' + new Date().toLocaleString('en-IN'), 40, h - 24);
    doc.text('St. Francis De Sales School', w - 40, h - 24, { align: 'right' });
  }

  // Output the PDF. Plain downloads (doc.save) often do nothing in the APK
  // WebView, so inside the app we write the file and open the native share
  // sheet (Filesystem + Share plugins). On web we keep the normal download.
  async function outputPdf(doc, filename) {
    var C = window.Capacitor, P = C && C.Plugins;
    var isNative = !!(C && (typeof C.isNativePlatform === 'function' ? C.isNativePlatform() : C.isNative));
    var Fs = P && P.Filesystem, Sh = P && P.Share;
    if (isNative && Fs && Fs.writeFile && Sh && Sh.share) {
      try {
        var b64 = doc.output('datauristring').split(',')[1];
        var w = await Fs.writeFile({ path: filename, data: b64, directory: 'CACHE' });
        await Sh.share({ title: filename, url: w.uri, files: [w.uri], dialogTitle: 'Share attendance PDF' });
        window.showToast && window.showToast('✅ PDF ready to share.');
        return;
      } catch (e) {
        if (e && /cancel/i.test(e.message || '')) return; // user dismissed the sheet
        // otherwise fall through to a normal download attempt
      }
    }
    doc.save(filename);
    window.showToast && window.showToast('✅ PDF downloaded.');
  }

  // ── PER-TEACHER daily sheet ──────────────────────────────────────────────
  window.saReportTeacher = async function (uid) {
    var cache = window.saGetMonthCache && window.saGetMonthCache();
    if (!cache || !cache.agg || !cache.agg[uid]) { window.showToast && window.showToast('⚠️ Load the month first.'); return; }
    window.showToast && window.showToast('Building PDF…');
    try {
      await ensureLibs();
      var s = cache.agg[uid];
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

      header(doc, 'Staff Attendance — ' + monthLabel(cache.ym),
        s.name + (s.class ? '  ·  Class ' + s.class : ''));

      var onTime = s.days - s.late;
      var punct = s.days ? Math.round(onTime / s.days * 100) : 0;
      doc.setFontSize(10); doc.setTextColor(40);
      doc.text('Days present: ' + s.days + '    On-time: ' + onTime + '    Late: ' + s.late +
        '    Early-out: ' + s.early + '    No-checkout: ' + s.missedOut +
        '    Total worked: ' + fmtMins(s.worked) + '    Punctuality: ' + punct + '%', 40, 104);

      var body = s.daily.slice().sort(function (a, b) { return a.dateKey < b.dateKey ? -1 : 1; }).map(function (r) {
        return [
          r.dateKey, dow(r.dateKey),
          r.morningIn ? r.morningIn.localTime : '—',
          r.eveningOut ? r.eveningOut.localTime : '—',
          (r.morningIn && r.morningIn.lateBy > 0) ? '+' + fmtMins(r.morningIn.lateBy) : '—',
          r.earlyDeparture ? 'yes' : '—',
          fmtMins(r.workedMinutes),
          r.morningIn ? (r.morningIn.withinGeofence ? 'on-site' : r.morningIn.distanceMeters + 'm off') : '—',
        ];
      });

      doc.autoTable({
        startY: 116,
        head: [['Date', 'Day', 'In', 'Out', 'Late', 'Early', 'Worked', 'Location']],
        body: body.length ? body : [['—', '—', '—', '—', '—', '—', '—', 'No records']],
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: BRAND, textColor: 255 },
        alternateRowStyles: { fillColor: [245, 242, 238] },
        margin: { left: 40, right: 40 },
        didDrawPage: function () { footer(doc); },
      });

      await outputPdf(doc, 'Staff_Attendance_' + s.name.replace(/[^\w]+/g, '_') + '_' + cache.ym + '.pdf');
    } catch (e) {
      window.showToast && window.showToast('⚠️ ' + (e.message || 'PDF failed'));
    }
  };

  // ── WHOLE-STAFF roster ───────────────────────────────────────────────────
  window.saReportRoster = async function () {
    var cache = window.saGetMonthCache && window.saGetMonthCache();
    if (!cache || !cache.agg) { window.showToast && window.showToast('⚠️ Load the month first.'); return; }
    window.showToast && window.showToast('Building PDF…');
    try {
      await ensureLibs();
      var jsPDF = window.jspdf.jsPDF;
      var doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      header(doc, 'Staff Attendance Roster — ' + monthLabel(cache.ym),
        'All teachers · punctuality summary');

      var agg = cache.agg;
      var keys = Object.keys(agg).filter(function (u) { return agg[u].days > 0; })
        .sort(function (a, b) { return agg[b].days - agg[a].days || agg[a].name.localeCompare(agg[b].name); });

      var tD = 0, tL = 0, tE = 0, tM = 0;
      var body = keys.map(function (uid) {
        var s = agg[uid]; tD += s.days; tL += s.late; tE += s.early; tM += s.missedOut;
        var onTime = s.days - s.late;
        var punct = s.days ? Math.round(onTime / s.days * 100) : 0;
        var avgIn = s.inMinN ? (function () { var x = s.inMinSum / s.inMinN; return String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(Math.round(x % 60)).padStart(2, '0'); })() : '—';
        return [s.name, s.class || '—', s.days, onTime, s.late, s.early, s.missedOut, avgIn, punct + '%'];
      });
      body.push([{ content: 'TOTALS', styles: { fontStyle: 'bold' } }, '', tD, (tD - tL), tL, tE, tM, '', '']);

      doc.autoTable({
        startY: 100,
        head: [['Teacher', 'Class', 'Days', 'On-time', 'Late', 'Early-out', 'No checkout', 'Avg in', 'Punctuality']],
        body: body,
        styles: { fontSize: 9, cellPadding: 4 },
        headStyles: { fillColor: BRAND, textColor: 255 },
        alternateRowStyles: { fillColor: [245, 242, 238] },
        margin: { left: 40, right: 40 },
        didDrawPage: function () { footer(doc); },
      });

      await outputPdf(doc, 'Staff_Attendance_Roster_' + cache.ym + '.pdf');
    } catch (e) {
      window.showToast && window.showToast('⚠️ ' + (e.message || 'PDF failed'));
    }
  };
})();
