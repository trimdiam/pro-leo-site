// view-refresh.js
// Re-fires section data loaders when the app returns from background or
// from a native app switch. The bfcache/pageshow case is owned by
// session-coordinator.js to avoid duplicate handlers.

(function () {

  // App returning from background (Android task switcher / WebView resume)
  var hiddenSince = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      hiddenSince = Date.now();
      return;
    }
    // Only refresh if hidden for >3s (ignore brief focus losses)
    if (hiddenSince && Date.now() - hiddenSince > 3000) {
      window._refreshCurrentSection && window._refreshCurrentSection();
    }
    hiddenSince = 0;
  });

  // Capacitor App resume event (user returns from another native app)
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    try {
      window.Capacitor.Plugins.App.addListener('appStateChange', function (state) {
        if (state && state.isActive) {
          setTimeout(function () {
            window._refreshCurrentSection && window._refreshCurrentSection();
          }, 200);
        }
      });
    } catch (_) {}
  }

})();
