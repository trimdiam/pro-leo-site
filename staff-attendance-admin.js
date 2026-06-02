// staff-attendance-admin.js
// Admin view for teacher geo-attendance: today's live board + monthly analytics
// + manual "send checkout reminder" button. Read-only (writes happen in the
// Cloud Functions). PDF export lives in staff-attendance-report.js.
// New feature => new file (does not touch app-logic.js).

(function () {
  var FS_URL  = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
  var FNS_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js';
  var TEACHER_ROLES = ['teacher', 'class_teacher', 'subject_teacher'];
  var monthCache = null; // { ym, rows, teachers } — reused by the PDF export

  // ── small utils ──────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmtMins(m) {
    if (m == null) return '—';
    var h = Math.floor(m / 60), mm = m % 60;
    return (h ? h + 'h ' : '') + mm + 'm';
  }
  function istDateKey() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function thisMonthYM() { return istDateKey().slice(0, 7); } // YYYY-MM
  function minutesToHHMM(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function hhmmToMin(s) { var p = String(s).split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); }

  function chip(txt, color) {
    return '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;' +
      'border-radius:999px;background:' + color + '22;color:' + color + '">' + txt + '</span>';
  }

  // ── data ───────────────────────────────────────────────────────────────
  function fs() { return import(FS_URL); }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim(); }

  // Login accounts (users with a teacher role). Returns uid→account map AND a
  // name→[accounts] index (array, because duplicate signups share a name).
  async function fetchAccounts(m) {
    var db = m.getFirestore(window._firebaseApp);
    var snap = await m.getDocs(m.query(m.collection(db, 'users'), m.where('role', 'in', TEACHER_ROLES)));
    var byUid = {}, byName = {};
    snap.forEach(function (d) {
      var u = d.data();
      var a = { uid: d.id, name: u.name || u.displayName || '(unnamed)', class: u.class || null, hasToken: !!u.fcmToken };
      byUid[d.id] = a;
      var k = norm(a.name);
      (byName[k] = byName[k] || []).push(a);
    });
    return { byUid: byUid, byName: byName };
  }

  // Canonical staff directory (the `teachers` collection — the "28"). Deduped by name.
  async function fetchDirectory(m) {
    var db = m.getFirestore(window._firebaseApp);
    var snap = await m.getDocs(m.collection(db, 'teachers'));
    var seen = {}, list = [];
    snap.forEach(function (d) {
      var t = d.data();
      var name = t.name || t.fullName || '';
      if (!name) return;
      var k = norm(name);
      if (seen[k]) return; seen[k] = 1;
      list.push({ name: name, id: d.id });
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return list;
  }

  // When a name has duplicate accounts, prefer the one that checked in today,
  // else the one with an FCM token, else the first.
  function pickAccount(accts, todayByUid) {
    if (!accts || !accts.length) return null;
    for (var i = 0; i < accts.length; i++) if (todayByUid[accts[i].uid]) return accts[i];
    for (var j = 0; j < accts.length; j++) if (accts[j].hasToken) return accts[j];
    return accts[0];
  }

  async function fetchByDateRange(m, fromKey, toKey) {
    var db = m.getFirestore(window._firebaseApp);
    var q = m.query(m.collection(db, 'staff_attendance'),
      m.where('dateKey', '>=', fromKey), m.where('dateKey', '<=', toKey));
    var snap = await m.getDocs(q);
    var rows = [];
    snap.forEach(function (d) { rows.push(d.data()); });
    return rows;
  }

  // ── TODAY board ──────────────────────────────────────────────────────────
  async function loadToday() {
    var box = el('sa-today-body');
    if (box) box.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
    try {
      var m = await fs();
      var today = istDateKey();
      var accounts = await fetchAccounts(m);
      var dir = await fetchDirectory(m);
      var rows = await fetchByDateRange(m, today, today);
      var todayByUid = {};
      rows.forEach(function (r) { todayByUid[r.uid] = r; });

      var present = 0, late = 0, out = 0, notIn = 0, noAcct = 0;
      var matched = {};

      // Builds one <tr>. acct may be null (no login account for this name).
      function statusRow(name, cls, acct, flagExtra) {
        var statusCell, inCell = '—', outCell = '—', workCell = '—', locCell = '—';
        if (!acct) {
          statusCell = chip('No account', '#9b59b6'); noAcct++;
        } else {
          matched[acct.uid] = 1;
          var r = todayByUid[acct.uid];
          if (!r || !r.morningIn) {
            statusCell = chip('Not checked in', '#7f8c8d'); notIn++;
          } else {
            present++;
            inCell = esc(r.morningIn.localTime);
            locCell = r.morningIn.withinGeofence ? chip('On-site', '#1e8449')
              : chip('Off-site ' + r.morningIn.distanceMeters + 'm', '#b9770e');
            if (r.eveningOut) {
              out++;
              statusCell = chip('Checked out', '#2471a3');
              outCell = esc(r.eveningOut.localTime);
              workCell = fmtMins(r.workedMinutes);
              if (r.eveningOut.earlyBy > 0) outCell += ' ' + chip('early', '#b9770e');
            } else {
              statusCell = r.morningIn.lateBy > 0 ? chip('Late', '#c0392b') : chip('Present', '#1e8449');
            }
            if (r.morningIn.lateBy > 0) { late++; inCell += ' ' + chip('+' + fmtMins(r.morningIn.lateBy), '#c0392b'); }
          }
        }
        return '<tr><td>' + esc(name) + (cls ? ' <span style="color:var(--text-light);font-size:11px">(Cls ' + esc(cls) + ')</span>' : '') +
          (flagExtra ? ' <span title="Has a login but is not in the staff directory" style="color:#9b59b6">*</span>' : '') +
          '</td><td>' + statusCell + '</td><td>' + inCell + '</td><td>' + outCell +
          '</td><td>' + workCell + '</td><td>' + locCell + '</td></tr>';
      }

      var lines = dir.map(function (t) {
        var acct = pickAccount(accounts.byName[norm(t.name)], todayByUid);
        return statusRow(t.name, acct && acct.class, acct, false);
      });

      // Safety net: a login-holder who checked in but isn't in the directory
      // (e.g. name mismatch) must never be hidden — append them, flagged "*".
      Object.keys(accounts.byUid).forEach(function (uid) {
        if (matched[uid] || !todayByUid[uid]) return;
        var a = accounts.byUid[uid];
        lines.push(statusRow(a.name, a.class, a, true));
      });

      if (box) box.innerHTML = lines.join('') || '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-light)">No staff found.</td></tr>';
      var sum = el('sa-today-summary');
      if (sum) sum.innerHTML =
        statCard('Checked in', present, '#1e8449') + statCard('Late', late, '#c0392b') +
        statCard('Checked out', out, '#2471a3') + statCard('Not in yet', notIn, '#7f8c8d') +
        statCard('No account', noAcct, '#9b59b6');
    } catch (e) {
      if (box) box.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--danger)">✗ ' + esc(e.message) + '</td></tr>';
    }
  }

  function statCard(label, val, color) {
    return '<div style="flex:1;min-width:120px;background:var(--glass-bg);border:1.5px solid var(--border);border-radius:12px;padding:12px 14px">' +
      '<div style="font-size:24px;font-weight:800;color:' + color + '">' + val + '</div>' +
      '<div style="font-size:12px;color:var(--text-light)">' + label + '</div></div>';
  }

  // ── MONTHLY analytics ──────────────────────────────────────────────────
  function monthBounds(ym) { // ym "YYYY-MM"
    var y = +ym.slice(0, 4), mo = +ym.slice(5, 7);
    var last = new Date(y, mo, 0).getDate();
    return { from: ym + '-01', to: ym + '-' + String(last).padStart(2, '0') };
  }

  // Aggregate raw docs into per-teacher stats for the month.
  function aggregate(rows, teachers) {
    var byT = {};
    Object.keys(teachers).forEach(function (uid) {
      byT[uid] = { uid: uid, name: teachers[uid].name, class: teachers[uid].class,
        days: 0, late: 0, early: 0, missedOut: 0, worked: 0, inMinSum: 0, inMinN: 0, daily: [] };
    });
    rows.forEach(function (r) {
      var s = byT[r.uid];
      if (!s) { // teacher record exists but no roster entry (role changed) — still count
        s = byT[r.uid] = { uid: r.uid, name: r.teacherName || '(unknown)', class: r.teacherClass || null,
          days: 0, late: 0, early: 0, missedOut: 0, worked: 0, inMinSum: 0, inMinN: 0, daily: [] };
      }
      if (!r.morningIn) return;
      s.days++;
      if (r.morningIn.lateBy > 0) s.late++;
      if (r.earlyDeparture) s.early++;
      if (!r.eveningOut) s.missedOut++;
      if (r.workedMinutes) s.worked += r.workedMinutes;
      s.inMinSum += hhmmToMin(r.morningIn.localTime); s.inMinN++;
      s.daily.push(r);
    });
    return byT;
  }

  async function loadMonth() {
    var ym = (el('sa-month') && el('sa-month').value) || thisMonthYM();
    var body = el('sa-month-body');
    if (body) body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
    try {
      var m = await fs();
      var teachers = (await fetchAccounts(m)).byUid;
      var b = monthBounds(ym);
      var rows = await fetchByDateRange(m, b.from, b.to);
      var agg = aggregate(rows, teachers);
      monthCache = { ym: ym, rows: rows, teachers: teachers, agg: agg };

      var totDays = 0, totLate = 0, totEarly = 0, totMissed = 0;
      var keys = Object.keys(agg).filter(function (u) { return agg[u].days > 0; })
        .sort(function (a, b2) { return agg[b2].days - agg[a].days || agg[a].name.localeCompare(agg[b2].name); });

      var html = keys.map(function (uid) {
        var s = agg[uid];
        totDays += s.days; totLate += s.late; totEarly += s.early; totMissed += s.missedOut;
        var onTime = s.days - s.late;
        var punct = s.days ? Math.round(onTime / s.days * 100) : 0;
        var avgIn = s.inMinN ? minutesToHHMM(s.inMinSum / s.inMinN) : '—';
        var punctColor = punct >= 90 ? '#1e8449' : (punct >= 75 ? '#b9770e' : '#c0392b');
        return '<tr>' +
          '<td>' + esc(s.name) + '</td>' +
          '<td style="text-align:center">' + s.days + '</td>' +
          '<td style="text-align:center">' + onTime + '</td>' +
          '<td style="text-align:center;color:#c0392b">' + s.late + '</td>' +
          '<td style="text-align:center;color:#b9770e">' + s.early + '</td>' +
          '<td style="text-align:center;color:#7f8c8d">' + s.missedOut + '</td>' +
          '<td style="text-align:center">' + avgIn + '</td>' +
          '<td style="text-align:center"><b style="color:' + punctColor + '">' + punct + '%</b> ' +
            '<button class="btn btn-sm btn-outline" style="font-size:10px;padding:2px 8px;margin-left:6px" onclick="saReportTeacher(\'' + uid + '\')"><i class="fas fa-file-pdf"></i></button></td>' +
          '</tr>';
      }).join('');

      if (body) body.innerHTML = html || '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No check-ins recorded this month.</td></tr>';
      var sum = el('sa-month-summary');
      if (sum) sum.innerHTML =
        statCard('Teachers active', keys.length, '#2471a3') +
        statCard('Total check-ins', totDays, '#1e8449') +
        statCard('Late instances', totLate, '#c0392b') +
        statCard('Early departures', totEarly, '#b9770e');
    } catch (e) {
      if (body) body.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--danger)">✗ ' + esc(e.message) + '</td></tr>';
    }
  }

  // ── checkout reminder (manual) ───────────────────────────────────────────
  async function sendReminder() {
    var btn = el('sa-remind-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending…'; }
    try {
      var m = await import(FNS_URL);
      var fns = m.getFunctions(window._firebaseApp, 'asia-south1');
      var res = await m.httpsCallable(fns, 'triggerStaffCheckoutReminder')();
      var d = res.data || {};
      window.showToast && window.showToast('✅ Reminder: ' + (d.sent || 0) + ' sent, ' + (d.candidates || 0) + ' candidate(s).');
    } catch (e) {
      window.showToast && window.showToast('⚠️ ' + (e.message || 'Failed'));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send checkout reminder'; }
    }
  }

  // ── delete a day's records (admin only; server-side Cloud Function) ───────
  async function clearDay() {
    var input = el('sa-del-date');
    var dateKey = (input && input.value) || istDateKey();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      window.showToast && window.showToast('⚠️ Pick a valid date first.');
      return;
    }
    if (!window.confirm('Delete ALL staff attendance records for ' + dateKey +
      '?\n\nThis permanently removes every teacher\'s check-in/out for that day and cannot be undone.')) return;
    var btn = el('sa-del-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting…'; }
    try {
      var m = await import(FNS_URL);
      var fns = m.getFunctions(window._firebaseApp, 'asia-south1');
      var res = await m.httpsCallable(fns, 'clearStaffAttendanceDay')({ dateKey: dateKey });
      var d = res.data || {};
      window.showToast && window.showToast('🗑️ Deleted ' + (d.deleted || 0) + ' record(s) for ' + dateKey + '.');
      loadToday(); loadMonth();
    } catch (e) {
      window.showToast && window.showToast('⚠️ ' + (e.message || 'Delete failed'));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Delete day'; }
    }
  }

  // ── expose ───────────────────────────────────────────────────────────────
  window.saLoadToday = loadToday;
  window.saLoadMonth = loadMonth;
  window.saSendReminder = sendReminder;
  window.saClearDay = clearDay;
  window.saGetMonthCache = function () { return monthCache; };

  // Called by the sidebar button.
  window.loadStaffAttendanceAdmin = function () {
    var root = el('sa-admin-root');
    if (!root) return;
    if (!root.dataset.built) {
      root.dataset.built = '1';
      root.innerHTML = buildShell();
      if (el('sa-month')) el('sa-month').value = thisMonthYM();
      if (el('sa-del-date')) el('sa-del-date').value = istDateKey();
    }
    loadToday();
    loadMonth();
  };

  function buildShell() {
    return '' +
    '<div class="card" style="padding:24px;margin-bottom:18px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">' +
        '<div><h4 style="color:var(--accent-dark);margin:0"><i class="fas fa-fingerprint" style="margin-right:8px;color:var(--accent)"></i>Staff Attendance — Today</h4>' +
        '<p style="font-size:13px;color:var(--text-light);margin:4px 0 0">' + istDateKey() + ' · geo-tagged check-in / check-out</p></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<input type="date" id="sa-del-date" title="Day to delete" style="padding:6px 10px;border-radius:8px;border:1.5px solid var(--border);font-family:var(--font-body);font-size:13px;background:var(--input-bg);color:var(--text)">' +
          '<button id="sa-del-btn" class="btn btn-sm" style="background:var(--danger,#dc3545);color:#fff;border:none" onclick="saClearDay()"><i class="fas fa-trash"></i> Delete day</button>' +
          '<button id="sa-remind-btn" class="btn btn-sm btn-outline" onclick="saSendReminder()"><i class="fas fa-paper-plane"></i> Send checkout reminder</button>' +
          '<button class="btn btn-sm btn-outline" onclick="saLoadToday()"><i class="fas fa-sync-alt"></i> Refresh</button>' +
        '</div>' +
      '</div>' +
      '<div id="sa-today-summary" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px"></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Teacher</th><th>Status</th><th>In</th><th>Out</th><th>Worked</th><th>Location</th></tr></thead>' +
        '<tbody id="sa-today-body"></tbody></table></div>' +
    '</div>' +
    '<div class="card" style="padding:24px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">' +
        '<div><h4 style="color:var(--accent-dark);margin:0"><i class="fas fa-chart-bar" style="margin-right:8px;color:var(--accent)"></i>Monthly Report &amp; Analytics</h4>' +
        '<p style="font-size:13px;color:var(--text-light);margin:4px 0 0">Punctuality, late &amp; early-departure analytics. Download as PDF.</p></div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
          '<input type="month" id="sa-month" style="padding:7px 12px;border-radius:8px;border:1.5px solid var(--border);font-family:var(--font-body);font-size:13px;background:var(--input-bg);color:var(--text)">' +
          '<button class="btn btn-sm btn-primary" onclick="saLoadMonth()"><i class="fas fa-search"></i> Load</button>' +
          '<button class="btn btn-sm btn-outline" onclick="saReportRoster()"><i class="fas fa-file-pdf"></i> Whole-staff PDF</button>' +
        '</div>' +
      '</div>' +
      '<div id="sa-month-summary" style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px"></div>' +
      '<div class="table-wrap"><table><thead><tr><th>Teacher</th><th>Days</th><th>On-time</th><th>Late</th><th>Early-out</th><th>No checkout</th><th>Avg in</th><th>Punctuality</th></tr></thead>' +
        '<tbody id="sa-month-body"></tbody></table></div>' +
    '</div>';
  }
})();
