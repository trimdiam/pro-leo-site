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
      if (window.showToast) {
        window.showToast(notification.title + ': ' + (notification.body || ''));
      }
    });

    Push.addListener('pushNotificationActionPerformed', function (action) {
      var data = action.notification.data || {};
      if (data.url) { window.location.hash = data.url; }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
