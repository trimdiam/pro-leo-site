// teacher-attendance-guard.js
// Prevents non-class teachers from accessing the Attendance section.
// Fixes stale-global leak between teacher sessions.
// Also guards the auth-restore overlay against premature dismissal.

(function () {

  // ── 0. Guard _hideAuthOverlay against Firebase's null-first behavior ───────
  // Firebase fires onAuthStateChanged(null) first on every load.
  // app-logic.js REMOVES sf_session_role from localStorage then calls _hideAuthOverlay.
  // So we must capture the role NOW — before any Firebase code runs — while it
  // still exists in localStorage. The guard then uses this cached value.
  var _cachedRole = '';
  try { _cachedRole = localStorage.getItem('sf_session_role') || ''; } catch (_) {}
  var PORTAL_PAGE_IDS = ['page-teacher-dash','page-admin-dash','page-student-dash','page-office-dash'];

  function isPortalActive() {
    return PORTAL_PAGE_IDS.some(function (id) {
      var el = document.getElementById(id);
      return el && el.classList.contains('active');
    });
  }

  function patchHideOverlay() {
    if (typeof window._hideAuthOverlay !== 'function') {
      setTimeout(patchHideOverlay, 50);
      return;
    }
    var _origHide = window._hideAuthOverlay;
    var _guardRetries = 0;
    window._hideAuthOverlay = function () {
      // Use the role captured at script load time — localStorage may already
      // have been cleared by app-logic.js's onAuthStateChanged(null) handler.
      var role = _cachedRole;

      // No saved session — dismiss immediately (login page / home is correct)
      if (!role) { _origHide(); return; }

      // Session should exist but portal not shown yet — wait for Firebase
      if (!isPortalActive()) {
        _guardRetries++;
        if (_guardRetries >= 15) { _origHide(); return; } // hard limit ~4.5s
        setTimeout(function () { window._hideAuthOverlay && window._hideAuthOverlay(); }, 300);
        return;
      }
      _guardRetries = 0;
      _origHide();
    };
  }
  patchHideOverlay();

  // ── 1. Clear teacher globals on logout ───────────────────────────────────
  var _origLogout = window.logout;
  window.logout = function () {
    window._currentTeacherClass = '';
    window._teacherStudentDocs  = null;
    window._attClass            = null;
    window._attInitialized      = false;
    window._attEditMode         = false;
    if (typeof _origLogout === 'function') _origLogout.apply(this, arguments);
  };

  // ── 2. Block t-attendance in showDash for non-class teachers ─────────────
  var _origShowDash = window.showDash;
  window.showDash = function (prefix, sectionId, btn) {
    if (prefix === 't' && sectionId === 't-attendance') {
      // Re-check at the moment of navigation — always current
      if (!window._currentTeacherClass) {
        window.showToast && window.showToast('⚠️ Attendance is only available to class teachers.');
        // Redirect to dashboard instead
        _origShowDash && _origShowDash('t', 't-dashboard',
          document.querySelector('#teacherSidebar .active') ||
          document.querySelector('#teacherSidebar button'));
        return;
      }
    }
    if (typeof _origShowDash === 'function') _origShowDash.apply(this, arguments);
  };

  // Also patch navTeacherTo which the bottom nav uses
  var _origNavTeacherTo = window.navTeacherTo;
  window.navTeacherTo = function (sectionId) {
    if (sectionId === 't-attendance' && !window._currentTeacherClass) {
      window.showToast && window.showToast('⚠️ Attendance is only available to class teachers.');
      return;
    }
    if (typeof _origNavTeacherTo === 'function') _origNavTeacherTo.apply(this, arguments);
  };

  // ── 3. Hide/show sidebar & bottom nav button once profile is loaded ───────
  function applyVisibility() {
    var isClassTeacher = !!window._currentTeacherClass;

    var sidebarBtn = document.querySelector('#teacherSidebar button[onclick*="t-attendance"]');
    if (sidebarBtn) sidebarBtn.style.display = isClassTeacher ? '' : 'none';

    var bottomBtn = document.querySelector('#teacherBottomNav button[data-section="t-attendance"]');
    if (bottomBtn) bottomBtn.style.display = isClassTeacher ? '' : 'none';
  }

  // ── 4. Watch for profile load completion ─────────────────────────────────
  // app-logic.js sets _currentTeacherClass during profile load.
  // We poll until the teacher dash is active AND the value has settled.
  function startGuardPoll() {
    // Mark as pending so we don't act on a stale value from a prior session
    var settled = false;
    var poll = setInterval(function () {
      var teacherPage = document.getElementById('page-teacher-dash');
      if (!teacherPage || !teacherPage.classList.contains('active')) return;

      // Wait for app-logic to write _currentTeacherClass (it sets it to "" or a class number)
      // We know it's settled when it's no longer undefined
      if (window._currentTeacherClass === undefined) return;

      if (!settled) {
        settled = true;
        clearInterval(poll);
        applyVisibility();
      }
    }, 200);
  }

  // Patch loginAs to reset _currentTeacherClass before each teacher login
  // so the poll always waits for a fresh value from app-logic
  var _origLoginAs = window.loginAs;
  window.loginAs = function (role) {
    if (role === 'teacher') {
      window._currentTeacherClass = undefined; // force poll to wait for fresh value
      startGuardPoll();
    }
    if (typeof _origLoginAs === 'function') _origLoginAs.apply(this, arguments);
  };

  // Start guard poll on page load for restored sessions
  startGuardPoll();

  // ── Fix: bfcache restore (browser back button) ───────────────────────────
  // When the user navigates back from the assessment app the browser restores
  // the page from memory (bfcache). onAuthStateChanged never re-fires, so the
  // spinner runs forever AND the portal stays on whichever page was behind it.
  // We detect this with pageshow.persisted and restore the session ourselves.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;

    // Hide spinner first
    window._hideAuthOverlay && window._hideAuthOverlay();

    // Use cached role — localStorage may have been cleared already
    var role = _cachedRole || '';
    try { role = role || localStorage.getItem('sf_session_role') || ''; } catch (_) {}

    if (!role) return; // not logged in — home page is correct

    // Navigate straight to the right portal without waiting for Firebase
    var pageMap = {
      teacher: 'teacher-dash',
      admin:   'admin-dash',
      student: 'student-dash',
      office:  'office-dash'
    };
    var pageId = pageMap[role];
    if (!pageId) return;

    // Restore via loginAs — sets isLoggedIn, goes through capacitor-back nav stack cleanup
    if (typeof window.loginAs === 'function') {
      window.loginAs(role);
    } else {
      // Fallback: direct CSS (loginAs not ready yet — shouldn't happen on bfcache)
      document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
      var page = document.getElementById('page-' + pageId);
      if (page) page.classList.add('active');
      var nav = document.getElementById('public-nav');
      if (nav) nav.style.display = 'none';
    }

    // Re-run the attendance guard in case we restored a teacher session
    if (role === 'teacher') applyVisibility();
  });

  // ── Hard fallback: hide overlay after 5s if auth resolves slowly.
  // The fast-restore watchdog also covers this case at 10s; keeping the
  // shorter 5s fallback for non-fast-restore loads (no cached role).
  if (!window._fastRestoreActive) {
    setTimeout(function () {
      try { window._hideAuthOverlay && window._hideAuthOverlay(); } catch (_) {}
    }, 5000);
  }

})();
