// auth-fast-restore.js
// Optimistic portal restore + bulletproof spinner kill.
// MUST load BEFORE app-logic.js (no defer, placed early in <head>).
//
// Two jobs:
//   1. If a cached role exists, immediately show the right portal page
//      (no spinner-then-home flash on cold start).
//   2. ALWAYS install a watchdog that kills the auth spinner if it gets
//      stuck — this is the safety net for the "infinite spinner" bug.

(function () {
  var ROLE_KEY = 'sf_session_role';
  var OVERLAY_ID = 'login-check-overlay';

  var role = '';
  try { role = localStorage.getItem(ROLE_KEY) || ''; } catch (_) {}

  // ── Inject a CSS kill-switch up front. Once <html data-fast-restore> is
  //    set, NOTHING can show the overlay until we explicitly remove it.
  //    This beats any inline style.display = 'flex' that app code might set.
  try {
    var styleEl = document.createElement('style');
    styleEl.id = 'fast-restore-style';
    styleEl.textContent =
      'html[data-fast-restore="1"] #' + OVERLAY_ID + ' { display: none !important; visibility: hidden !important; }';
    (document.head || document.documentElement).appendChild(styleEl);
  } catch (_) {}

  var PAGE_MAP = {
    teacher: 'page-teacher-dash',
    admin:   'page-admin-dash',
    student: 'page-student-dash',
    office:  'page-office-dash'
  };

  if (role && PAGE_MAP[role]) {
    window._fastRestoreActive = true;
    window._fastRestoreRole = role;
    document.documentElement.setAttribute('data-fast-restore', '1');
    showPortalWhenReady(PAGE_MAP[role]);
  }

  function showPortalWhenReady(pageId) {
    function tryShow() {
      var page = document.getElementById(pageId);
      if (!page) { setTimeout(tryShow, 30); return; }
      try {
        document.querySelectorAll('.page').forEach(function (p) {
          p.classList.remove('active');
        });
        page.classList.add('active');
        var nav = document.getElementById('public-nav');
        if (nav) nav.style.display = 'none';
        window.isLoggedIn = true;
        window._currentUserRole = role;
      } catch (_) {}
    }
    tryShow();
  }

  // ── Spinner watchdog: poll every 400ms for the first 20s. If the
  //    overlay is visible at any point, force-hide it. Runs ALWAYS,
  //    regardless of whether fast-restore activated — this is the
  //    safety net for the "stuck on spinner" bug.
  var watchdogStart = Date.now();
  var watchdogInterval = setInterval(function () {
    var elapsed = Date.now() - watchdogStart;
    if (elapsed > 20000) { clearInterval(watchdogInterval); return; }
    var ov = document.getElementById(OVERLAY_ID);
    if (!ov) return;
    var visible = ov.offsetParent !== null ||
                  getComputedStyle(ov).display !== 'none';
    if (!visible) return;
    // Spinner visible — kill it after the grace period (4s) if no Firebase
    // resolution happened. Fast-restore users get instant kill.
    if (window._fastRestoreActive || elapsed > 4000) {
      ov.style.setProperty('display', 'none', 'important');
      ov.style.setProperty('visibility', 'hidden', 'important');
    }
  }, 400);

  // ── Emergency escape hatch: tap the overlay to dismiss it. Last resort
  //    for users if something we haven't anticipated goes wrong.
  document.addEventListener('click', function (e) {
    var ov = document.getElementById(OVERLAY_ID);
    if (!ov) return;
    if (e.target === ov || ov.contains(e.target)) {
      ov.style.setProperty('display', 'none', 'important');
    }
  }, true);
})();
