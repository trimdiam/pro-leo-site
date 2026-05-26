// auth-fast-restore.js
// Optimistic session restore: as soon as window.loginAs is available
// (defined in script.js), call it with the cached role so the portal
// opens BEFORE Firebase resolves the persisted session from IndexedDB.
//
// This routes through the proper login flow (showPage → loadPortalLibs →
// navStudentTo/navTeacherTo) — no manual page toggling, no interference
// with the existing routing logic (CLAUDE.md rule #1).
//
// MUST load BEFORE script.js so we're polling early. No defer.

(function () {
  var ROLE_KEY = 'sf_session_role';
  var OVERLAY_ID = 'auth-restore-overlay'; // the real one, injected by script.js

  var role = '';
  try { role = localStorage.getItem(ROLE_KEY) || ''; } catch (_) {}

  // No cached session — let normal flow handle it.
  if (!role) {
    installSpinnerWatchdog();
    return;
  }

  if (!['teacher','admin','student','office'].includes(role)) {
    installSpinnerWatchdog();
    return;
  }

  window._fastRestoreActive = true;
  window._fastRestoreRole = role;

  // Poll for window.loginAs to be defined (script.js loads with defer).
  // Once available, call it — that triggers the full proper login flow.
  var started = Date.now();
  var pollId = setInterval(function () {
    if (typeof window.loginAs === 'function') {
      clearInterval(pollId);
      try {
        window.loginAs(role);
        // loginAs sets isLoggedIn and persists role; spinner stays until
        // Firebase resolves and _handleAuthUser fires _hideAuthOverlay.
        // We can speed that up — once the portal is active, kill the spinner
        // optimistically (Firebase will re-validate in background and either
        // confirm or sign out cleanly).
        setTimeout(function () {
          try { window._hideAuthOverlay && window._hideAuthOverlay(); } catch (_) {}
        }, 100);
      } catch (e) {
        // If loginAs throws for any reason, let the normal flow take over.
        window._fastRestoreActive = false;
      }
      return;
    }
    // Give up after 4s — script.js should be ready well before that.
    if (Date.now() - started > 4000) {
      clearInterval(pollId);
      window._fastRestoreActive = false;
    }
  }, 30);

  installSpinnerWatchdog();

  // Watchdog: if the auth-restore-overlay is still visible after 10s
  // (Firebase taking too long or _handleAuthUser hung), force-dismiss it
  // so the user isn't stuck on the spinner. This is the safety net.
  function installSpinnerWatchdog() {
    var watchStart = Date.now();
    var interval = setInterval(function () {
      var elapsed = Date.now() - watchStart;
      if (elapsed > 15000) { clearInterval(interval); return; }
      var ov = document.getElementById(OVERLAY_ID);
      if (!ov) { if (elapsed > 6000) clearInterval(interval); return; }
      // Visible if still in DOM and not opacity:0
      var cs = getComputedStyle(ov);
      if (cs.opacity === '0' || cs.display === 'none') return;
      if (elapsed > 10000) {
        // Hard kill — call the real hide function or force-remove
        try { window._hideAuthOverlay && window._hideAuthOverlay(); } catch (_) {}
        setTimeout(function () {
          var still = document.getElementById(OVERLAY_ID);
          if (still) still.remove();
        }, 400);
      }
    }, 500);

    // Tap-to-dismiss: if the spinner gets stuck and watchdog hasn't fired,
    // user can tap it to dismiss. Last-resort escape hatch.
    document.addEventListener('click', function (e) {
      var ov = document.getElementById(OVERLAY_ID);
      if (!ov) return;
      if (e.target === ov || ov.contains(e.target)) {
        try { window._hideAuthOverlay && window._hideAuthOverlay(); } catch (_) {}
        setTimeout(function () {
          var still = document.getElementById(OVERLAY_ID);
          if (still) still.remove();
        }, 350);
      }
    }, true);
  }
})();
