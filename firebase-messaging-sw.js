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
