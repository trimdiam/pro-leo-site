// staff-attendance.js
// Teacher self check-in / check-out card (geo-tagged) on the teacher dashboard.
// Writes go through the recordStaffAttendance Cloud Function (server-stamped
// time + geofence). This file only reads today's doc and renders state.
// New feature => new file (does not touch app-logic.js).

(function () {
  var FS_URL  = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
  var FNS_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js';
  var busy = false;

  // ── Helpers ────────────────────────────────────────────────────────────
  function isTeacher() { return window._currentUserRole === 'teacher' || window._currentUserRole === 'admin'; }
  function uid() { var a = window._firebaseAuth; return a && a.currentUser && a.currentUser.uid; }

  // Today's date key in the school's timezone (IST) — must match the doc id
  // the Cloud Function writes ("{uid}_{YYYY-MM-DD}").
  function istDateKey() {
    var p = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(new Date());
    return p; // en-CA already yields YYYY-MM-DD
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

  // Prefer the native Capacitor Geolocation plugin (APK); fall back to the
  // browser API (desktop / WebView with web geolocation enabled).
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

  // ── Render ─────────────────────────────────────────────────────────────
  function chip(txt, color) {
    return '<span style="display:inline-block;font-size:11px;font-weight:600;padding:2px 9px;border-radius:999px;background:' +
      color + '22;color:' + color + ';margin-left:6px">' + txt + '</span>';
  }

  function render(data) {
    var el = document.getElementById('staff-attendance-card');
    if (!el) return;

    var head = '<h4 style="color:var(--accent-dark);margin:0 0 14px"><i class="fas fa-fingerprint" style="margin-right:8px;color:var(--accent)"></i>My Attendance</h4>';
    var body;

    if (!data || !data.morningIn) {
      body =
        '<p style="font-size:13px;color:var(--text-light);margin:0 0 14px">Tap to record your arrival. Your location and time are logged.</p>' +
        '<button id="sa-btn-in" class="btn btn-primary" style="width:100%"><i class="fas fa-sign-in-alt" style="margin-right:8px"></i>Check In</button>';
    } else if (!data.eveningOut) {
      var inLate = data.morningIn.lateBy > 0 ? chip('Late ' + fmtMins(data.morningIn.lateBy), '#c0392b') : chip('On time', '#1e8449');
      var inGeo  = data.morningIn.withinGeofence ? '' : chip('⚠ Off-site (' + data.morningIn.distanceMeters + 'm)', '#b9770e');
      body =
        '<div style="font-size:14px;margin:0 0 14px"><i class="fas fa-check-circle" style="color:#1e8449;margin-right:8px"></i>Checked in at <b>' + data.morningIn.localTime + '</b>' + inLate + inGeo + '</div>' +
        '<button id="sa-btn-out" class="btn btn-primary" style="width:100%"><i class="fas fa-sign-out-alt" style="margin-right:8px"></i>Check Out</button>';
    } else {
      var outEarly = data.earlyDeparture ? chip('Early ' + fmtMins(data.eveningOut.earlyBy), '#b9770e') : '';
      var outGeo   = data.eveningOut.withinGeofence ? '' : chip('⚠ Off-site (' + data.eveningOut.distanceMeters + 'm)', '#b9770e');
      body =
        '<div style="font-size:14px;line-height:1.9">' +
          '<div><i class="fas fa-sign-in-alt" style="color:var(--accent);width:20px"></i> In: <b>' + data.morningIn.localTime + '</b></div>' +
          '<div><i class="fas fa-sign-out-alt" style="color:var(--accent);width:20px"></i> Out: <b>' + data.eveningOut.localTime + '</b>' + outEarly + outGeo + '</div>' +
          '<div style="margin-top:6px;color:var(--text-light);font-size:13px">Worked ' + fmtMins(data.workedMinutes) + ' today.</div>' +
        '</div>';
    }

    el.innerHTML = '<div class="card" style="padding:20px;margin-bottom:18px">' + head + body +
      '<p id="sa-status" style="margin:10px 0 0;font-size:12px;min-height:16px"></p></div>';

    var bIn = document.getElementById('sa-btn-in');   if (bIn)  bIn.onclick  = function () { doRecord('in'); };
    var bOut = document.getElementById('sa-btn-out'); if (bOut) bOut.onclick = function () { doRecord('out'); };
  }

  function setStatus(msg, color) {
    var s = document.getElementById('sa-status');
    if (s) { s.style.color = color || 'var(--text-light)'; s.textContent = msg; }
  }
  function setBtnBusy(phase, on) {
    var b = document.getElementById(phase === 'in' ? 'sa-btn-in' : 'sa-btn-out');
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
        // restore button label
        loadToday().then(render);
      })
      .finally(function () { busy = false; });
  }

  // ── Mount ──────────────────────────────────────────────────────────────
  function mount() {
    var el = document.getElementById('staff-attendance-card');
    if (!el) return;
    if (!isTeacher()) { el.innerHTML = ''; return; }
    render(null); // skeleton-ish; immediately replaced
    loadToday().then(render).catch(function () { el.innerHTML = ''; });
  }

  // Render whenever the teacher dashboard becomes active.
  var _origShowDash = window.showDash;
  window.showDash = function (prefix, sectionId, btn) {
    if (typeof _origShowDash === 'function') _origShowDash.apply(this, arguments);
    if (prefix === 't' && sectionId === 't-dashboard') setTimeout(mount, 50);
  };

  // Restored sessions land on the teacher dash without a showDash call.
  function pollMount() {
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var page = document.getElementById('page-teacher-dash');
      if (page && page.classList.contains('active') && uid()) { clearInterval(iv); mount(); }
      if (tries > 50) clearInterval(iv);
    }, 200);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pollMount);
  } else { pollMount(); }
})();
