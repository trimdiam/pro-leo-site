// auth-login-retry.js
// Suppresses the false-positive "Invalid role" error on first login attempt
// and silently retries doLogin. The error is a known race condition:
// signInWithEmailAndPassword resolves before the Firebase auth token has
// propagated to Firestore, so the first getDoc() of users/{uid} returns a
// stripped document where the `role` field is empty — which fails the role
// whitelist check in _handleAuthUser and shows "Invalid role".
//
// We can't patch _handleAuthUser (module-scoped) or showLoginError (also
// module-scoped). Instead we watch the #login-error-msg DOM element and
// react when the bad message appears.

(function () {
  var retried = false;       // limit to ONE silent retry per error window
  var retryWindowMs = 20000; // re-arm after 20s so genuine role errors show

  function isLoginActive() {
    var p = document.getElementById('page-login');
    return p && p.classList.contains('active');
  }

  function hideError() {
    var box = document.getElementById('login-error-msg');
    if (box) box.style.display = 'none';
  }

  function startObserver() {
    var box  = document.getElementById('login-error-msg');
    var text = document.getElementById('login-error-text');
    if (!box || !text) { setTimeout(startObserver, 200); return; }

    var obs = new MutationObserver(function () {
      if (retried) return;
      if (box.style.display === 'none') return;
      var msg = (text.textContent || '').toLowerCase();
      if (msg.indexOf('invalid role') === -1) return;

      // Caught the race-condition error. Suppress + retry.
      retried = true;
      setTimeout(function () { retried = false; }, retryWindowMs);
      hideError();

      setTimeout(function () {
        if (!isLoginActive()) return;            // user already moved on
        if (typeof window.doLogin !== 'function') return;
        try { window.doLogin(); } catch (_) {}
      }, 700);
    });

    // Watch both the box (display style toggles) and the text content
    obs.observe(box,  { attributes: true, attributeFilter: ['style'] });
    obs.observe(text, { characterData: true, childList: true, subtree: true });
  }

  startObserver();
})();
