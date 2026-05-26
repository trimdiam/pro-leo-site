// teacher-attendance-guard.js
// ONLY job: prevent non-class teachers from accessing Attendance,
// and clean up teacher globals on logout.
// Auth restore / spinner / bfcache are owned by session-coordinator.js.

(function () {

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
      if (!window._currentTeacherClass) {
        window.showToast && window.showToast('⚠️ Attendance is only available to class teachers.');
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

  // ── 3. Hide/show sidebar & bottom nav attendance button ──────────────────
  function applyVisibility() {
    var isClassTeacher = !!window._currentTeacherClass;
    var sidebarBtn = document.querySelector('#teacherSidebar button[onclick*="t-attendance"]');
    if (sidebarBtn) sidebarBtn.style.display = isClassTeacher ? '' : 'none';
    var bottomBtn = document.querySelector('#teacherBottomNav button[data-section="t-attendance"]');
    if (bottomBtn) bottomBtn.style.display = isClassTeacher ? '' : 'none';
  }

  // ── 4. Poll until _currentTeacherClass is set, then apply visibility ─────
  function startGuardPoll() {
    var settled = false;
    var poll = setInterval(function () {
      var teacherPage = document.getElementById('page-teacher-dash');
      if (!teacherPage || !teacherPage.classList.contains('active')) return;
      if (window._currentTeacherClass === undefined) return;
      if (!settled) {
        settled = true;
        clearInterval(poll);
        applyVisibility();
      }
    }, 200);
  }

  // Reset _currentTeacherClass before each teacher login so poll always
  // waits for a fresh value from app-logic.js
  var _origLoginAs = window.loginAs;
  window.loginAs = function (role) {
    if (role === 'teacher') {
      window._currentTeacherClass = undefined;
      startGuardPoll();
    }
    if (typeof _origLoginAs === 'function') _origLoginAs.apply(this, arguments);
  };

  // Start poll for restored sessions (loginAs already called by coordinator)
  startGuardPoll();

})();
