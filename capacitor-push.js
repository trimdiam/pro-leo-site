// capacitor-push.js
// Initialises native push notifications when the web app is running
// inside the SFS Care Capacitor app. Does nothing in a regular browser.

function writeTokenToFirestore(uid, token) {
  return import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js').then(function (fs) {
    var db = fs.getFirestore(window._firebaseApp);
    return fs.setDoc(
      fs.doc(db, 'users', uid),
      { fcmToken: token, fcmUpdatedAt: new Date().toISOString() },
      { merge: true }
    );
  }).then(function () {
    console.log('[push] FCM token saved for uid:', uid);
  }).catch(function (e) {
    console.warn('[push] token save failed:', e.message);
  });
}

function getCurrentUid() {
  var auth = window._firebaseAuth;
  if (auth && auth.currentUser && auth.currentUser.uid) return auth.currentUser.uid;
  return null;
}

// Stash the latest token until auth is ready (FCM registration can fire before sign-in)
window._pendingFcmToken = window._pendingFcmToken || null;

function saveFcmToken(token) {
  try {
    if (!window._firebaseApp) {
      console.warn('[push] _firebaseApp not ready, stashing token');
      window._pendingFcmToken = token;
      return;
    }
    var uid = getCurrentUid();
    if (uid) { writeTokenToFirestore(uid, token); return; }

    console.log('[push] no auth user yet, waiting for sign-in to save token');
    window._pendingFcmToken = token;

    import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js').then(function (a) {
      var auth = window._firebaseAuth || a.getAuth(window._firebaseApp);
      var unsub = a.onAuthStateChanged(auth, function (user) {
        if (user && user.uid && window._pendingFcmToken) {
          writeTokenToFirestore(user.uid, window._pendingFcmToken);
          window._pendingFcmToken = null;
          unsub();
        }
      });
    }).catch(function (e) {
      console.warn('[push] auth import failed:', e.message);
    });
  } catch (e) {
    console.warn('[push] saveFcmToken error:', e.message);
  }
}

// Clear FCM token on logout so a new user on this device doesn't get
// notifications meant for the previous user.
function clearFcmTokenForUid(uid) {
  if (!uid) return Promise.resolve();
  // Returns a promise so logout can AWAIT this delete before signing out.
  return import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js').then(function (fs) {
    var db = fs.getFirestore(window._firebaseApp);
    return fs.updateDoc(fs.doc(db, 'users', uid), { fcmToken: fs.deleteField() });
  }).then(function () {
    console.log('[push] FCM token cleared for uid:', uid);
    window._lastFcmToken = null;
    window._pendingFcmToken = null;
  }).catch(function (e) {
    console.warn('[push] token clear failed:', e.message);
  });
}

// Hook into logout — clear token before sign-out
(function hookLogout() {
  var _interval = setInterval(function () {
    if (typeof window.logout !== 'function') return;
    var _orig = window.logout;
    window.logout = function () {
      var self = this, args = arguments;
      function proceed() { _orig.apply(self, args); }
      var uid = getCurrentUid();
      if (!uid) { proceed(); return; }
      // Delete this device's token from the user's doc BEFORE signing out.
      // The write needs request.auth.uid == uid (firestore.rules), so it must
      // finish while still authenticated — otherwise signOut() revokes the
      // credential first, the delete is denied, and the stale token keeps
      // delivering this user's pushes to whoever logs in next on this device.
      // Guard with a 2.5s cap so logout never hangs (e.g. offline).
      var done = false;
      function once() { if (!done) { done = true; proceed(); } }
      clearFcmTokenForUid(uid).then(once, once);
      setTimeout(once, 2500);
    };
    clearInterval(_interval);
  }, 200);
})();

// Always defined — called by the Enable Notifications button in teacher profile
window.reRegisterPushNotifications = function (statusEl) {
  function setStatus(msg, color) {
    if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || 'var(--text-light)'; }
    console.log('[push]', msg);
  }

  var Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications
    ? window.Capacitor.Plugins.PushNotifications
    : null;

  if (!Push) {
    setStatus('Open this page inside the SFS Care app to enable notifications.', 'var(--warning)');
    return;
  }

  setStatus('Requesting permission…');
  Push.requestPermissions().then(function (result) {
    if (result.receive !== 'granted') {
      setStatus('Permission denied. Go to Settings → Apps → SFS Care → Notifications and enable them.', 'var(--danger)');
      return;
    }
    setStatus('Registering device…');
    Push.register();
    Push.addListener('registration', function (token) {
      saveFcmToken(token.value);
      setStatus('✓ Notifications enabled! Your device is registered.', 'var(--success)');
    });
  }).catch(function (e) {
    setStatus('Error: ' + e.message, 'var(--danger)');
  });
};

// ── Rich in-app notification card (shown when a push arrives with app OPEN) ──
// In the foreground the OS shows nothing — Capacitor hands the push to JS — so
// we render our own glassmorphic card (school logo + brand colours) instead of
// a plain toast. Tapping it deep-links the same way the OS notification would.
function showRichPushCard(notification) {
  try {
    var data   = notification.data || {};
    var title  = notification.title || 'St. Francis School';
    var body   = notification.body || '';
    var screen = data.screen || data.type || '';

    if (!document.getElementById('sfs-push-card-style')) {
      var st = document.createElement('style');
      st.id = 'sfs-push-card-style';
      st.textContent =
        '.sfs-push-card{position:fixed;top:14px;left:50%;z-index:99999;width:min(92vw,420px);' +
        'display:flex;gap:12px;align-items:flex-start;padding:14px 16px 14px 20px;border-radius:18px;' +
        'background:rgba(255,255,255,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);' +
        'border:1px solid var(--border,rgba(139,111,71,.22));box-shadow:0 14px 38px rgba(106,80,48,.28);' +
        'cursor:pointer;font-family:inherit;opacity:0;transform:translateX(-50%) translateY(-140%);' +
        'transition:transform .42s cubic-bezier(.2,.9,.25,1.2),opacity .3s;}' +
        '.sfs-push-card.in{opacity:1;transform:translateX(-50%) translateY(0);}' +
        '.sfs-push-card .bar{position:absolute;left:8px;top:14px;bottom:14px;width:4px;border-radius:4px;' +
        'background:var(--accent,#8b6f47);}' +
        '.sfs-push-card .ic{flex:0 0 42px;width:42px;height:42px;border-radius:12px;object-fit:cover;' +
        'background:var(--accent,#8b6f47);box-shadow:0 3px 10px rgba(106,80,48,.3);}' +
        '.sfs-push-card .tx{flex:1;min-width:0;}' +
        '.sfs-push-card .tt{margin:0 0 2px;font-weight:700;font-size:14.5px;line-height:1.25;' +
        'color:var(--accent-dark,#4a3a26);}' +
        '.sfs-push-card .bd{margin:0;font-size:13px;line-height:1.38;white-space:pre-line;' +
        'color:var(--text-light,#5a4a35);display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;}' +
        '@media(prefers-color-scheme:dark){.sfs-push-card{background:rgba(40,33,24,.88);}}';
      document.head.appendChild(st);
    }

    var card = document.createElement('div');
    card.className = 'sfs-push-card';
    card.setAttribute('role', 'alert');
    card.innerHTML =
      '<span class="bar"></span>' +
      '<img class="ic" src="/assets/images/logo.webp" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<div class="tx"><p class="tt"></p><p class="bd"></p></div>';
    card.querySelector('.tt').textContent = title;
    card.querySelector('.bd').textContent = body;

    function dismiss() {
      clearTimeout(timer);
      card.classList.remove('in');
      setTimeout(function () { if (card.parentNode) card.remove(); }, 440);
    }

    // Tap → same deep-link routing the OS notification uses.
    card.addEventListener('click', function () {
      dismiss();
      var route = {
        daily_routine:   ['navTeacherTo', 't-schedule'],
        period_reminder: ['navTeacherTo', 't-dashboard'],
        leave:           ['navTeacherTo', 't-leave'],
        attendance:      ['navStudentTo', 's-attendance'],
        notice:          ['navStudentTo', 's-notices'],
        message:         ['navStudentTo', 's-dashboard'],
      }[screen];
      if (route && typeof window[route[0]] === 'function') window[route[0]](route[1]);
      else if (data.url) window.location.hash = data.url;
    });

    document.body.appendChild(card);
    setTimeout(function () { card.classList.add('in'); }, 20);
    var timer = setTimeout(dismiss, 6000);
  } catch (e) {
    if (window.showToast) window.showToast((notification.title || '') + ': ' + (notification.body || ''));
  }
}

// Auto-init inside Capacitor APK
(function () {
  var Push = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PushNotifications
    ? window.Capacitor.Plugins.PushNotifications
    : null;
  if (!Push) return;

  function init() {
    Push.requestPermissions().then(function (result) {
      if (result.receive !== 'granted') return;
      Push.register();
    }).catch(function (e) {
      console.warn('[push] requestPermissions failed:', e.message);
    });

    Push.addListener('registration', function (token) {
      window._lastFcmToken = token.value;
      window._pushDebug = '[push] registered ok, token=' + (token.value || '').slice(0, 20) + '…';
      console.log(window._pushDebug);
      if (window.showToast) window.showToast('Push registered ✓');
      saveFcmToken(token.value);
    });

    Push.addListener('registrationError', function (err) {
      window._pushDebug = '[push] registrationError: ' + JSON.stringify(err);
      console.error(window._pushDebug);
      if (window.showToast) window.showToast('Push FAILED: ' + (err && err.error ? err.error : JSON.stringify(err)));
    });

    // If sign-in happens after registration, push the cached token then.
    import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js').then(function (a) {
      var auth = window._firebaseAuth || (window._firebaseApp ? a.getAuth(window._firebaseApp) : null);
      if (!auth) return;
      a.onAuthStateChanged(auth, function (user) {
        if (!user || !user.uid) return;
        var tok = window._pendingFcmToken || window._lastFcmToken;
        if (tok) writeTokenToFirestore(user.uid, tok);
      });
    }).catch(function () {});

    Push.addListener('pushNotificationReceived', function (notification) {
      // App is OPEN: the OS shows nothing, so render our own styled card.
      showRichPushCard(notification);
    });

    Push.addListener('pushNotificationActionPerformed', function (action) {
      var data = action.notification.data || {};

      // Screen-based deep-link routing
      var screen = data.screen || data.type || '';

      // Poll until the nav function is ready (app may still be booting)
      function navWhenReady(fn, sectionId) {
        if (typeof window[fn] === 'function') { window[fn](sectionId); return; }
        var attempts = 0;
        var poll = setInterval(function () {
          attempts++;
          if (typeof window[fn] === 'function') { clearInterval(poll); window[fn](sectionId); }
          if (attempts > 30) clearInterval(poll);
        }, 200);
      }

      if (screen === 'daily_routine') {
        navWhenReady('navTeacherTo', 't-schedule');  // Teacher "My Schedule" page
      } else if (screen === 'attendance') {
        navWhenReady('navStudentTo', 's-attendance');
      } else if (screen === 'notice') {
        navWhenReady('navStudentTo', 's-notices');
      } else if (screen === 'leave') {
        navWhenReady('navTeacherTo', 't-leave');
      } else if (screen === 'message') {
        navWhenReady('navStudentTo', 's-dashboard'); // messages shown on dashboard
      } else if (screen === 'period_reminder') {
        navWhenReady('navTeacherTo', 't-dashboard');
      } else if (data.url) {
        window.location.hash = data.url;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
