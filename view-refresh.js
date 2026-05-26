// view-refresh.js
// Re-triggers section data loaders when the user returns to the app from a
// sub-app (assessment-app, routine-app, etc.) or from the background.
//
// Why: navigating to /assessment-app/ is a full WebView navigation. Coming
// back is either a bfcache restore (page frozen mid-load — "Loading..." text
// still sitting there) or a fresh page load. In either case, the existing
// restore path only calls loginAs(role) → showPage(...), which doesn't fire
// section-specific data loaders like loadTeacherDashWidgets,
// loadTeacherSchedule, loadTeacherNotices, etc. Result: stuck on "Loading...".
//
// Fix: when the page returns to focus, find the currently active .dash-section
// and re-route through navTeacherTo / navStudentTo / showDash — those go
// through the existing routing logic which DOES fire the data loaders.

(function () {
  var lastRefresh = 0;
  var REFRESH_COOLDOWN_MS = 1500; // don't spam loaders

  function getActiveSection() {
    var el = document.querySelector('.dash-section.active');
    if (!el || !el.id) return null;
    return el.id; // e.g. "t-dashboard", "s-routine", "a-fees"
  }

  function refreshCurrentSection() {
    var now = Date.now();
    if (now - lastRefresh < REFRESH_COOLDOWN_MS) return;
    lastRefresh = now;

    var sectionId = getActiveSection();
    if (!sectionId) return;

    var prefix = sectionId.charAt(0); // 't' | 's' | 'a' | 'o'

    try {
      if (prefix === 't' && typeof window.navTeacherTo === 'function') {
        window.navTeacherTo(sectionId);
        return;
      }
      if (prefix === 's' && typeof window.navStudentTo === 'function') {
        window.navStudentTo(sectionId);
        return;
      }
      // admin / office portals don't have a dedicated nav function — call
      // showDash directly with the matching sidebar button (or null).
      if (typeof window.showDash === 'function') {
        var sidebar = { a: '#adminSidebar', o: '#officeSidebar' }[prefix];
        var btn = sidebar
          ? document.querySelector(sidebar + ' button[onclick*="' + sectionId + '"]')
          : null;
        window.showDash(prefix, sectionId, btn);
      }
    } catch (e) {
      console.warn('[view-refresh] failed:', e && e.message);
    }
  }

  // bfcache restore (browser back navigation from sub-app)
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) {
      // Give the bfcache restore handler in teacher-attendance-guard.js a
      // moment to run loginAs first, then refresh data.
      setTimeout(refreshCurrentSection, 400);
    }
  });

  // App returning from background (Android task switcher / WebView resumed)
  var hiddenSince = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
      return;
    }
    // Only refresh if app was hidden for >3s (avoid refreshing on brief blurs)
    if (hiddenSince && Date.now() - hiddenSince > 3000) {
      refreshCurrentSection();
    }
    hiddenSince = 0;
  });

  // Capacitor App resume event (when user returns from another app)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    try {
      window.Capacitor.Plugins.App.addListener('appStateChange', function (state) {
        if (state && state.isActive) {
          setTimeout(refreshCurrentSection, 200);
        }
      });
    } catch (_) {}
  }
})();
