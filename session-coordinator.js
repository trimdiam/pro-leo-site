// session-coordinator.js
// Owns the non-auth parts of the page lifecycle. _handleAuthUser in
// app-logic.js is the sole owner of opening the portal — this file does
// not call loginAs() and does not branch on the cached role.
//
// Responsibilities:
//   1. Bfcache  — single pageshow handler that refreshes the current section
//   2. Spinner  — watchdog + tap-to-dismiss for #auth-restore-overlay
//
// The "Restoring your session…" spinner stays up until Firebase resolves
// onAuthStateChanged and _handleAuthUser hides it via _hideAuthOverlay
// (success path) or app-logic.js's deferred null-branch (signed out).

(function () {
  var OVERLAY_ID = 'auth-restore-overlay';  // injected by script.js IIFE

  // ── 1. BFCACHE RESTORE ──────────────────────────────────────────────────
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

  // ── 2. SPINNER WATCHDOG ─────────────────────────────────────────────────
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
