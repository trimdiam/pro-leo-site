// office-attendance.js
// Self check-in / check-out card for office staff on the office portal.
// Mirrors staff-attendance.js behaviour; targets #staff-attendance-card-office.
// New feature => new file (does not touch app-logic.js or staff-attendance.js).

(function () {
  var FS_URL  = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
  var FNS_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js';
  var busy = false;

  // ── Helpers ────────────────────────────────────────────────────────────
  function isOfficeStaff() {
    var r = window._currentUserRole;
    return r === 'office' || r === 'office_staff';
  }
  function uid() { var a = window._firebaseAuth; return a && a.currentUser && a.currentUser.uid; }

  function istDateKey() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
  }

  function fmtMins(m) {
    if (!m && m !== 0) return '';
    var h = Math.floor(m / 60), mm = m % 60;
    return (h ? h + 'h ' : '') + mm + 'm';
  }

  function geoErr(err) {
    if (!err) return 'Could not get location.';
    if (err.code === 1) return 'Location permission denied. Enable it in settings.';
    if (err.code === 2) return 'Location unavailable. Move to open sky and retry.';
    if (err.code === 3) return 'Location timed out. Retry.';
    return err.message || 'Could not get location.';
  }

  function getPosition() {
    return new Promise(function (resolve, reject) {
      var Geo = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation;
      if (Geo && Geo.getCurrentPosition) {
        Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 })
          .then(function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); })
          .catch(function (e) { reject(new Error(e && e.message ? e.message : 'Could not get location.')); });
        return;
      }
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          function (p) { resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }); },
          function (e) { reject(new Error(geoErr(e))); },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
        return;
      }
      reject(new Error('Location is not supported on this device.'));
    });
  }

  function loadToday() {
    var u = uid();
    if (!u || !window._firebaseApp) return Promise.resolve(null);
    return import(FS_URL).then(function (fs) {
      var db = fs.getFirestore(window._firebaseApp);
      return fs.getDoc(fs.doc(db, 'staff_attendance', u + '_' + istDateKey()))
        .then(function (s) { return s.exists() ? s.data() : null; });
    });
  }

  function callRecord(phase, pos) {
    return import(FNS_URL).then(function (m) {
      var fns = m.getFunctions(window._firebaseApp, 'asia-south1');
      var fn  = m.httpsCallable(fns, 'recordStaffAttendance');
      return fn({ phase: phase, lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy });
    });
  }

  function chip(txt, color) {
    return '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;background:' +
      color + '22;color:' + color + ';margin-left:6px">' + txt + '</span>';
  }

  // ── Styles (scoped to #staff-attendance-card-office) ───────────────────
  function injectStyles() {
    if (document.getElementById('sa-office-styles')) return;
    var css =
      '#staff-attendance-card-office .sa-wrap{border-radius:16px;overflow:hidden;margin-bottom:18px;' +
        'background:var(--glass-bg,rgba(255,255,255,.72));border:1.5px solid var(--border,rgba(139,111,71,.18));' +
        'box-shadow:var(--card-shadow);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);animation:saIn .45s ease both}' +
      '@keyframes saIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
      '#staff-attendance-card-office .sa-head{position:relative;display:flex;align-items:center;gap:13px;padding:16px 20px;overflow:hidden;' +
        'background:linear-gradient(135deg,#6b5030 0%,#8b6f47 55%,#b8925b 100%);color:#fff}' +
      '#staff-attendance-card-office .sa-head::after{content:"";position:absolute;inset:0;pointer-events:none;' +
        'background:radial-gradient(circle at 85% -25%,rgba(240,216,130,.5),transparent 55%)}' +
      '#staff-attendance-card-office .sa-hic{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.2);' +
        'display:flex;align-items:center;justify-content:center;font-size:19px;flex-shrink:0;z-index:1}' +
      '#staff-attendance-card-office .sa-htitle{margin:0;font-size:16px;font-weight:700;color:#fff;font-family:var(--font-head,serif);z-index:1}' +
      '#staff-attendance-card-office .sa-hdate{font-size:12px;opacity:.9;margin-top:1px}' +
      '#staff-attendance-card-office .sa-body{padding:20px}' +
      '#staff-attendance-card-office .sa-center{text-align:center}' +
      '#staff-attendance-card-office .sa-big{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;margin:2px auto 12px}' +
      '#staff-attendance-card-office .sa-big.pend{background:rgba(212,175,55,.16);color:#b9770e;animation:saoPulse 2s ease-in-out infinite}' +
      '#staff-attendance-card-office .sa-big.ok{background:rgba(30,132,73,.14);color:#1e8449}' +
      '@keyframes saoPulse{0%,100%{box-shadow:0 0 0 0 rgba(212,175,55,.4)}50%{box-shadow:0 0 0 13px rgba(212,175,55,0)}}' +
      '#staff-attendance-card-office .sa-h2{font-size:16px;font-weight:700;color:var(--text)}' +
      '#staff-attendance-card-office .sa-sub{font-size:13px;color:var(--text-light);margin:4px 0 16px}' +
      '#staff-attendance-card-office .sa-row{display:flex;align-items:center;gap:14px;margin-bottom:16px}' +
      '#staff-attendance-card-office .sa-row .sa-big{margin:0}' +
      '#staff-attendance-card-office .sa-label{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:var(--text-light);font-weight:700}' +
      '#staff-attendance-card-office .sa-time{font-size:26px;font-weight:800;color:var(--accent-dark);line-height:1.15;font-family:var(--font-head,serif)}' +
      '#staff-attendance-card-office .sa-tiles{display:flex;gap:10px;flex-wrap:wrap}' +
      '#staff-attendance-card-office .sa-tile{flex:1;min-width:88px;background:var(--bg,rgba(229,211,179,.4));border:1px solid var(--border,rgba(139,111,71,.15));border-radius:12px;padding:11px 10px;text-align:center}' +
      '#staff-attendance-card-office .sa-tile.acc{background:linear-gradient(135deg,rgba(139,111,71,.18),rgba(212,175,55,.16));border-color:rgba(139,111,71,.32)}' +
      '#staff-attendance-card-office .sa-tval{font-size:19px;font-weight:800;color:var(--accent-dark);margin-top:3px;font-family:var(--font-head,serif)}' +
      '#staff-attendance-card-office .sa-done{display:inline-flex;align-items:center;gap:7px;background:rgba(30,132,73,.12);color:#1e8449;font-weight:700;font-size:13px;padding:6px 14px;border-radius:999px;margin-bottom:14px}' +
      '#staff-attendance-card-office .sa-chips{margin-top:6px}' +
      '#staff-attendance-card-office .sa-btn{width:100%;border:none;border-radius:12px;padding:14px;font-family:var(--font-body,sans-serif);font-weight:700;font-size:15px;color:#fff;cursor:pointer;' +
        'display:flex;align-items:center;justify-content:center;gap:9px;box-shadow:0 6px 18px rgba(139,111,71,.32);transition:transform .15s ease,box-shadow .2s ease,opacity .2s}' +
      '#staff-attendance-card-office .sa-btn:hover{transform:translateY(-2px);box-shadow:0 9px 24px rgba(139,111,71,.42)}' +
      '#staff-attendance-card-office .sa-btn:active{transform:translateY(0)}' +
      '#staff-attendance-card-office .sa-btn:disabled{opacity:.7;cursor:wait;transform:none;box-shadow:none}' +
      '#staff-attendance-card-office .sa-btn.in{background:linear-gradient(135deg,#8b6f47,#6b5030)}' +
      '#staff-attendance-card-office .sa-btn.out{background:linear-gradient(135deg,#c0392b,#922b21)}';
    var st = document.createElement('style');
    st.id = 'sa-office-styles'; st.textContent = css;
    document.head.appendChild(st);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  function render(data) {
    var el = document.getElementById('staff-attendance-card-office');
    if (!el) return;
    injectStyles();

    var dateStr = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    var head =
      '<div class="sa-head"><div class="sa-hic"><i class="fas fa-fingerprint"></i></div>' +
        '<div><h4 class="sa-htitle">My Attendance</h4><div class="sa-hdate">' + dateStr + '</div></div></div>';

    var inner, centerClass = '';

    if (!data || !data.morningIn) {
      centerClass = ' sa-center';
      inner =
        '<div class="sa-big pend"><i class="fas fa-clock"></i></div>' +
        '<div class="sa-h2">Ready to check in</div>' +
        '<div class="sa-sub">Tap below — your location &amp; time are logged.</div>' +
        '<button id="sao-btn-in" class="sa-btn in"><i class="fas fa-sign-in-alt"></i> Check In</button>';
    } else if (!data.eveningOut) {
      var inLate = data.morningIn.lateBy > 0 ? chip('Late ' + fmtMins(data.morningIn.lateBy), '#c0392b') : chip('On time', '#1e8449');
      var inGeo  = data.morningIn.withinGeofence ? chip('On-site', '#1e8449') : chip('⚠ Off-site ' + data.morningIn.distanceMeters + 'm', '#b9770e');
      inner =
        '<div class="sa-row"><div class="sa-big ok"><i class="fas fa-check"></i></div>' +
          '<div><div class="sa-label">Checked in at</div><div class="sa-time">' + data.morningIn.localTime + '</div>' +
          '<div class="sa-chips">' + inLate + inGeo + '</div></div></div>' +
        '<button id="sao-btn-out" class="sa-btn out"><i class="fas fa-sign-out-alt"></i> Check Out</button>';
    } else {
      var outEarly = data.earlyDeparture ? chip('Early ' + fmtMins(data.eveningOut.earlyBy), '#b9770e') : '';
      var outGeo   = data.eveningOut.withinGeofence ? '' : chip('⚠ ' + data.eveningOut.distanceMeters + 'm', '#b9770e');
      inner =
        '<div class="sa-done"><i class="fas fa-circle-check"></i> Day complete</div>' +
        '<div class="sa-tiles">' +
          '<div class="sa-tile"><div class="sa-label">In</div><div class="sa-tval">' + data.morningIn.localTime + '</div></div>' +
          '<div class="sa-tile"><div class="sa-label">Out</div><div class="sa-tval">' + data.eveningOut.localTime + '</div>' +
            (outEarly || outGeo ? '<div class="sa-chips">' + outEarly + outGeo + '</div>' : '') + '</div>' +
          '<div class="sa-tile acc"><div class="sa-label">Worked</div><div class="sa-tval">' + (fmtMins(data.workedMinutes) || '—') + '</div></div>' +
        '</div>';
    }

    el.innerHTML = '<div class="sa-wrap">' + head +
      '<div class="sa-body' + centerClass + '">' + inner +
        '<p id="sao-status" style="margin:12px 0 0;font-size:12px;min-height:16px"></p>' +
      '</div></div>';

    var bIn  = document.getElementById('sao-btn-in');  if (bIn)  bIn.onclick  = function () { doRecord('in'); };
    var bOut = document.getElementById('sao-btn-out'); if (bOut) bOut.onclick = function () { doRecord('out'); };
  }

  function setStatus(msg, color) {
    var s = document.getElementById('sao-status');
    if (s) { s.style.color = color || 'var(--text-light)'; s.textContent = msg; }
  }

  function setBtnBusy(phase, on) {
    var b = document.getElementById(phase === 'in' ? 'sao-btn-in' : 'sao-btn-out');
    if (!b) return;
    b.disabled = on;
    if (on) b.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Getting location…';
  }

  function doRecord(phase) {
    if (busy) return; busy = true;
    setBtnBusy(phase, true);
    setStatus('Getting your location…');
    getPosition()
      .then(function (pos) { setStatus('Recording…'); return callRecord(phase, pos); })
      .then(function (res) {
        var d = res.data || {};
        var warn = d.withinGeofence ? '' : ' (⚠ off-site, ' + d.distanceMeters + 'm)';
        window.showToast && window.showToast('✅ Checked ' + (phase === 'in' ? 'in' : 'out') + ' at ' + d.localTime + warn);
        return loadToday().then(render);
      })
      .catch(function (e) {
        var msg = (e && e.message) || 'Something went wrong.';
        setStatus('✗ ' + msg, 'var(--danger)');
        window.showToast && window.showToast('⚠️ ' + msg);
        loadToday().then(render);
      })
      .finally(function () { busy = false; });
  }

  // ── Mount ──────────────────────────────────────────────────────────────
  function mount() {
    var el = document.getElementById('staff-attendance-card-office');
    if (!el) return;
    if (!isOfficeStaff()) { el.innerHTML = ''; return; }
    render(null);
    loadToday().then(render).catch(function () { el.innerHTML = ''; });
  }

  // Render whenever the office attendance section becomes active.
  var _origShowDash = window.showDash;
  window.showDash = function (prefix, sectionId, btn) {
    if (typeof _origShowDash === 'function') _origShowDash.apply(this, arguments);
    if (prefix === 'o' && sectionId === 'o-attendance') setTimeout(mount, 50);
  };

  // Restored sessions that land directly on the office portal.
  function pollMount() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var page = document.getElementById('page-office-dash');
      if (page && page.classList.contains('active') && uid()) { clearInterval(iv); mount(); }
      if (tries > 50) clearInterval(iv);
    }, 200);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pollMount);
  } else { pollMount(); }
})();
