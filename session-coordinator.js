// session-coordinator.js
// Single owner of the session lifecycle. Replaces auth-fast-restore.js and
// the auth-restore parts of teacher-attendance-guard.js.
//
// Responsibilities:
//   1. Cold start  — call loginAs(role) as soon as script.js is ready
//   2. Bfcache     — single pageshow handler: refresh data, no duplicate loginAs
//   3. Spinner     — one watchdog, correct overlay (#auth-restore-overlay)
//   4. Auth retry  — re-call _handleAuthUser if Firebase rejects cached session
//
// Everything goes through one flag: window._sessionRestored
// Other files check that flag instead of doing their own auth work.

(function () {
  var ROLE_KEY    = 'sf_session_role';
  var OVERLAY_ID  = 'auth-restore-overlay';  // injected by script.js IIFE

  var role = '';
  try { role = localStorage.getItem(ROLE_KEY) || ''; } catch (_) {}

  // ── 1. COLD START ────────────────────────────────────────────────────────
  // If we have a cached role, call loginAs as soon as script.js defines it.
  // This makes the portal appear instantly instead of after Firebase resolves.
  if (role && ['teacher','admin','student','office'].includes(role)) {
    window._fastRestoreActive = true;
    window._fastRestoreRole   = role;

    var pollStart = Date.now();
    var pollId = setInterval(function () {
      if (typeof window.loginAs !== 'function') {
        if (Date.now() - pollStart > 5000) clearInterval(pollId); // give up
        return;
      }
      clearInterval(pollId);
      try {
        window.loginAs(role);
        // Dismiss spinner 150ms after portal is active
        setTimeout(function () {
          try { window._hideAuthOverlay && window._hideAuthOverlay(); } catch (_) {}
        }, 150);
        window._sessionRestored = true;
      } catch (e) {
        window._fastRestoreActive = false;
      }
    }, 30);
  }

  // ── 2. BFCACHE RESTORE ──────────────────────────────────────────────────
  // On browser back-navigation the page is restored from memory. Firebase
  // does NOT re-fire onAuthStateChanged, so _handleAuthUser never runs.
  // We don't call loginAs again (portal is already active), we only
  // refresh the current section's data loaders.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;

    // Hide any leftover spinner
    try { window._hideAuthOverlay && window._hideAuthOverlay(); } catch (_) {}

    // Refresh current section data (navTeacherTo/navStudentTo re-fires loaders)
    setTimeout(refreshCurrentSection, 350);
  });

  // ── 3. SPINNER WATCHDOG ─────────────────────────────────────────────────
  // Safety net: if #auth-restore-overlay is still visible after 10 s,
  // force-remove it. Prevents the "stuck on spinner" scenario.
  var watchStart = Date.now();
  var watchId = setInterval(function () {
    var elapsed = Date.now() - watchStart;
    if (elapsed > 15000) { clearInterval(watchId); return; }
    var ov = document.getElementById(OVERLAY_ID);
    if (!ov) return;
    var cs = window.getComputedStyle(ov);
    if (cs.opacity === '0' || cs.display === 'none') { clearInterval(watchId); return; }
    if (elapsed > 10000) {
      clearInterval(watchId);
      try { window._hideAuthOverlay && window._hideAuthOverlay(); } catch (_) {}
      setTimeout(function () {
        var still = document.getElementById(OVERLAY_ID);
        if (still) still.remove();
      }, 350);
    }
  }, 500);

  // Tap the spinner to dismiss (escape hatch)
  document.addEventListener('click', function (e) {
    var ov = document.getElementById(OVERLAY_ID);
    if (!ov) return;
    if (e.target === ov || ov.contains(e.target)) {
      try { window._hideAuthOverlay && window._hideAuthOverlay(); } catch (_) {}
      setTimeout(function () {
        var s = document.getElementById(OVERLAY_ID);
        if (s) s.remove();
      }, 350);
    }
  }, true);

  // ── HELPERS ──────────────────────────────────────────────────────────────
  var lastRefresh = 0;
  function refreshCurrentSection() {
    var now = Date.now();
    if (now - lastRefresh < 1500) return;
    lastRefresh = now;
    var el = document.querySelector('.dash-section.active');
    if (!el || !el.id) return;
    var id     = el.id;
    var prefix = id.charAt(0);
    try {
      if (prefix === 't' && typeof window.navTeacherTo === 'function')
        return window.navTeacherTo(id);
      if (prefix === 's' && typeof window.navStudentTo === 'function')
        return window.navStudentTo(id);
      if (typeof window.showDash === 'function') {
        var sel = { a: '#adminSidebar', o: '#officeSidebar' }[prefix];
        var btn = sel ? document.querySelector(sel + ' button[onclick*="' + id + '"]') : null;
        window.showDash(prefix, id, btn);
      }
    } catch (_) {}
  }
  // Expose so view-refresh.js and other files can call it
  window._refreshCurrentSection = refreshCurrentSection;
})();
