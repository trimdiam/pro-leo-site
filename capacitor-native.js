// capacitor-native.js
// Wires StatusBar, SplashScreen and Keyboard native plugins when the web app
// runs inside the SFS Care Capacitor APK. Does nothing in a regular browser.
// Plugins must be present in the installed APK (v2.1+); on older builds the
// individual guards just skip.

(function () {
  var AUTH_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';

  function isNative() {
    var C = window.Capacitor;
    return !!(C && (typeof C.isNativePlatform === 'function'
      ? C.isNativePlatform() : C.isNative));
  }
  if (!isNative()) return; // browser / old web — leave everything default

  function plugin(name) {
    var C = window.Capacitor;
    return (C && C.Plugins && C.Plugins[name]) || null;
  }

  // ── StatusBar — match the app's dark, gold-accented theme ────────────────
  // Nav + hero use very dark browns (#1a0e05); use light icons over a dark bar.
  function initStatusBar() {
    var SB = plugin('StatusBar');
    if (!SB) return;
    try {
      if (SB.setOverlaysWebView) SB.setOverlaysWebView({ overlay: false });
      if (SB.setStyle) SB.setStyle({ style: 'DARK' });            // light icons
      if (SB.setBackgroundColor) SB.setBackgroundColor({ color: '#1a0e05' });
    } catch (e) { console.warn('[native] StatusBar:', e && e.message); }
  }

  // ── SplashScreen — hide once the shell has had a beat to paint ───────────
  // (config also auto-hides after 2s; this makes it snappier on fast loads.)
  function hideSplash() {
    var SS = plugin('SplashScreen');
    if (!SS || !SS.hide) return;
    try { SS.hide(); } catch (e) { console.warn('[native] SplashScreen:', e && e.message); }
  }

  // ── Keyboard — keep the focused input visible above the keyboard ─────────
  function initKeyboard() {
    var KB = plugin('Keyboard');
    if (!KB || !KB.addListener) return;
    try {
      KB.addListener('keyboardDidShow', function () {
        var ae = document.activeElement;
        if (ae && ae.scrollIntoView) {
          try { ae.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
        }
      });
    } catch (e) { console.warn('[native] Keyboard:', e && e.message); }
  }

  // ── Crashlytics — enable + report uncaught JS errors, tagged with the uid ─
  function initCrashlytics() {
    var FC = plugin('FirebaseCrashlytics');
    if (!FC) return;
    try { if (FC.setEnabled) FC.setEnabled({ enabled: true }); } catch (_) {}

    function record(message, stack) {
      try {
        if (stack && FC.log) FC.log({ message: String(stack).slice(0, 2000) });
        if (FC.recordException)
          FC.recordException({ message: String(message || 'Uncaught error').slice(0, 500) });
      } catch (_) {}
    }
    window.addEventListener('error', function (e) {
      record((e && e.message) || 'error', e && e.error && e.error.stack);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      record((r && r.message) || ('Unhandled rejection: ' + r), r && r.stack);
    });

    // Attribute crashes to the signed-in user.
    import(AUTH_URL).then(function (a) {
      var auth = window._firebaseAuth || a.getAuth(window._firebaseApp);
      a.onAuthStateChanged(auth, function (user) {
        try { if (user && user.uid && FC.setUserId) FC.setUserId({ userId: user.uid }); } catch (_) {}
      });
    }).catch(function () {});
  }

  // ── Network — show a banner while offline so saves aren't lost silently ──
  function showOfflineBanner(show) {
    var id = 'sfs-offline-banner';
    var b = document.getElementById(id);
    if (show) {
      if (!b) {
        b = document.createElement('div');
        b.id = id;
        b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
          'background:#c0392b;color:#fff;font-family:var(--font-body),sans-serif;' +
          'font-size:13px;font-weight:600;text-align:center;padding:10px 14px;' +
          'box-shadow:0 -2px 12px rgba(0,0,0,.3)';
        b.innerHTML = '<i class="fas fa-wifi" style="margin-right:8px;opacity:.8"></i>' +
          'No internet connection — changes may not save until you’re back online.';
        document.body.appendChild(b);
      }
      b.style.display = 'block';
    } else if (b) {
      b.style.display = 'none';
    }
  }

  function initNetwork() {
    var NET = plugin('Network');
    if (!NET) return;
    try {
      if (NET.getStatus)
        NET.getStatus().then(function (s) { showOfflineBanner(!s.connected); }).catch(function () {});
      if (NET.addListener)
        NET.addListener('networkStatusChange', function (s) { showOfflineBanner(!s.connected); });
    } catch (e) { console.warn('[native] Network:', e && e.message); }
  }

  function boot() {
    initStatusBar();
    initKeyboard();
    initCrashlytics();
    initNetwork();
    setTimeout(hideSplash, 400); // let the portal paint first
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
