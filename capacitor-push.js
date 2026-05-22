// capacitor-push.js
// Initialises native push notifications when the web app is running
// inside the SFS Care Capacitor app. Does nothing in a regular browser.

function saveFcmToken(token) {
  try {
    var stored = localStorage.getItem('sfds_auth_user');
    if (!stored) { console.warn('[push] no sfds_auth_user in localStorage'); return; }
    var user = JSON.parse(stored);
    if (!user || !user.uid) { console.warn('[push] no uid in sfds_auth_user'); return; }

    import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js').then(function (fs) {
      var db = fs.getFirestore(window._firebaseApp);
      return fs.setDoc(
        fs.doc(db, 'users', user.uid),
        { fcmToken: token, fcmUpdatedAt: new Date().toISOString() },
        { merge: true }
      );
    }).then(function () {
      console.log('[push] FCM token saved for uid:', user.uid);
    }).catch(function (e) {
      console.warn('[push] token save failed:', e.message);
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
      saveFcmToken(token.value);
    });

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
