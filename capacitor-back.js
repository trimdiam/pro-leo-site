// capacitor-back.js
// Handles Android back button navigation inside the SFS Care Capacitor app.
// Does nothing in a regular browser.

(function () {
  if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.App) return;

  var App = window.Capacitor.Plugins.App;
  var _navStack = [];
  var _backPressedOnce = false;
  var _backPressTimer = null;

  // Portal pages — navigating TO one of these always clears the back stack
  // so "home" is never kept as a back destination for a logged-in user.
  var PORTAL_PAGES = ['teacher-dash', 'admin-dash', 'student-dash', 'office-dash'];

  // Hook into showPage so every navigation is tracked
  var _originalShowPage = null;
  function hookShowPage() {
    if (typeof window.showPage !== 'function') {
      setTimeout(hookShowPage, 100);
      return;
    }
    _originalShowPage = window.showPage;
    window.showPage = function (name) {
      var current = _getCurrentPage();
      if (PORTAL_PAGES.indexOf(name) !== -1) {
        // Arriving at a portal clears any pre-login pages from the stack
        _navStack = _navStack.filter(function (p) {
          return PORTAL_PAGES.indexOf(p) !== -1;
        });
      } else if (current && current !== name) {
        // Normal intra-portal navigation: push current so back works
        _navStack.push(current);
        if (_navStack.length > 20) _navStack.shift();
      }
      _originalShowPage(name);
    };
  }

  function _getCurrentPage() {
    var pages = document.querySelectorAll('.page.active');
    if (!pages.length) return null;
    var id = pages[0].id; // e.g. "page-teacher-dash"
    return id.replace(/^page-/, '');
  }

  function _goBack() {
    if (_navStack.length > 0) {
      var prev = _navStack.pop();
      _originalShowPage(prev);
    } else {
      // No history left — double-press to exit
      if (_backPressedOnce) {
        clearTimeout(_backPressTimer);
        App.exitApp();
        return;
      }
      _backPressedOnce = true;
      if (window.showToast) window.showToast('Press back again to exit');
      _backPressTimer = setTimeout(function () {
        _backPressedOnce = false;
      }, 2000);
    }
  }

  App.addListener('backButton', function (data) {
    // data.canGoBack reflects WebView history (always false in SPA)
    _goBack();
  });

  // Wait for showPage to be defined (script.js loads first, but just in case)
  hookShowPage();
})();
