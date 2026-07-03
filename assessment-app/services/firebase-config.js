import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBXq3fe0uY8UB7-uLGzGIIvZOQf8YjNqaM',
  authDomain: 'st-francis-school-a3e7e.firebaseapp.com',
  projectId: 'st-francis-school-a3e7e',
  storageBucket: 'st-francis-school-a3e7e.firebasestorage.app',
  messagingSenderId: '180123372524',
  appId: '1:180123372524:web:caed0f2a44d35f19d90ec9',
  measurementId: 'G-TD628HY5XY'
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Local dev only — never true on the deployed site (served from a real domain,
// not localhost/127.0.0.1). Lets `firebase emulators:start` back this app
// without touching production Firebase.
const isLocalDev = typeof location !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(location.hostname);

if (isLocalDev) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
