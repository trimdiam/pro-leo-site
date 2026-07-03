/**
 * firebase-init.js — SFS Connect Mark Entry System
 * Firebase initialization (compat SDK v9)
 * TODO: Replace firebaseConfig values with your actual Firebase project config.
 */

const firebaseConfig = {
  apiKey:            "AIzaSyBXq3fe0uY8UB7-uLGzGIIvZOQf8YjNqaM",
  authDomain:        "st-francis-school-a3e7e.firebaseapp.com",
  projectId:         "st-francis-school-a3e7e",
  storageBucket:     "st-francis-school-a3e7e.firebasestorage.app",
  messagingSenderId: "180123372524",
  appId:             "1:180123372524:web:caed0f2a44d35f19d90ec9",
  measurementId:     "G-TD628HY5XY"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db   = firebase.firestore();

// ── Offline persistence ─────────────────────────────────────────────────────
// Queues writes to on-device storage (not just memory) so they survive the
// tab/app being closed or the connection dropping mid-entry, and replays them
// automatically once back online. Without this, a write made while offline is
// only held in memory — closing the app before reconnecting silently loses it.
// synchronizeTabs lets multiple open tabs share one persisted queue instead of
// each fighting over the IndexedDB lock (which would otherwise fail with
// 'failed-precondition' in the second tab).
db.enablePersistence({ synchronizeTabs: true }).then(() => {
  window.SFS_PERSISTENCE_READY = true;
}).catch(err => {
  // 'failed-precondition' — another tab grabbed the lock before synchronizeTabs
  // kicked in (rare race); 'unimplemented' — browser/in-app-webview lacks
  // IndexedDB (very old browsers, some embedded webviews). Either way the app
  // still works online; it just won't survive being closed while offline.
  window.SFS_PERSISTENCE_READY = false;
  console.warn('Offline persistence unavailable:', err.code || err.message);
});
