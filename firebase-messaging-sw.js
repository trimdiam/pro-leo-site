importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyBXq3fe0uY8UB7-uLGzGIIvZOQf8YjNqaM",
  authDomain:        "st-francis-school-a3e7e.firebaseapp.com",
  projectId:         "st-francis-school-a3e7e",
  storageBucket:     "st-francis-school-a3e7e.firebasestorage.app",
  messagingSenderId: "180123372524",
  appId:             "1:180123372524:web:caed0f2a44d35f19d90ec9"
});

const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'St. Francis School', {
    body:  body || '',
    icon:  '/assets/images/logo.jpg',
    badge: '/assets/images/logo.jpg',
    data:  payload.data || {}
  });
});

// ── Notification tap → deep-link routing (web background) ────────────────
// Maps data.screen values to the section the app should open on.
// Focuses an existing app window if one is open; otherwise opens a new tab.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data   = event.notification.data || {};
  const screen = data.screen || data.type || '';

  // Map screen value → URL fragment the app understands.
  const screenToHash = {
    'daily_routine':  '/?screen=t-schedule',
    'period_reminder':'/?screen=t-dashboard',
    'attendance':     '/?screen=s-attendance',
    'notice':         '/?screen=s-notices',
    'leave':          '/?screen=t-leave',
    'message':        '/?screen=s-dashboard',
  };
  const targetPath = screenToHash[screen] || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Find an already-open app window and focus it, posting a nav message.
      for (const client of windowClients) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin) {
          client.focus();
          client.postMessage({ type: 'PUSH_NAV', screen, data });
          return;
        }
      }
      // No open window — open the app at the right path.
      return clients.openWindow(targetPath);
    })
  );
});
