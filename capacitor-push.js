// capacitor-push.js
// Initialises native push notifications when the web app is running
// inside the SFS Care Capacitor app. Does nothing in a regular browser.

(function () {
  if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.PushNotifications) return;

  var Push = window.Capacitor.Plugins.PushNotifications;

  function saveFcmToken(token) {
    try {
      var stored = localStorage.getItem('sfds_auth_user');
      if (!stored) return;
      var user = JSON.parse(stored);
      if (!user || !user.uid) return;

      // Save token to Firestore via the global firebase instance (loaded by the main app)
      var waitForFirebase = setInterval(function () {
        if (!window.firebase || !window.firebase.firestore) return;
        clearInterval(waitForFirebase);
        window.firebase.firestore()
          .collection('users').doc(user.uid)
          .set({ fcmToken: token, fcmUpdatedAt: new Date().toISOString() }, { merge: true })
          .catch(function (e) { console.warn('[push] token save failed:', e.message); });
      }, 500);
    } catch (e) {
      console.warn('[push] saveFcmToken error:', e.message);
    }
  }

  function init() {
    Push.requestPermissions().then(function (result) {
      if (result.receive !== 'granted') return;
      Push.register();
    }).catch(function (e) {
      console.warn('[push] requestPermissions failed:', e.message);
    });

    // Token received — save to Firestore
    Push.addListener('registration', function (token) {
      saveFcmToken(token.value);
    });

    // Notification received while app is open — show using the web app's own UI if available
    Push.addListener('pushNotificationReceived', function (notification) {
      if (window.showToast) {
        window.showToast(notification.title + ': ' + (notification.body || ''));
      }
    });

    // Notification tapped — navigate if a deep link is provided
    Push.addListener('pushNotificationActionPerformed', function (action) {
      var data = action.notification.data || {};
      if (data.url) {
        window.location.hash = data.url;
      }
    });
  }

  // Wait for the page to be ready before initialising
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
