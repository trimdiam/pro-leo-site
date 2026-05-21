import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const AUTH_KEY = 'sfds_auth_user';

// Converts a staff ID to its Firebase Auth email (must match main app logic exactly)
function idToEmail(id) {
  if (id.includes('@')) return id; // admin uses real email e.g. admin@test.com
  return id.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '@stfrancis.school';
}

export async function login(loginId, password) {
  const email = idToEmail(loginId);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  // 1. Get role from users collection
  const userDoc = await getDoc(doc(db, 'users', uid));
  const role = userDoc.exists() ? (userDoc.data().role || 'teacher') : 'teacher';

  // 2. Get name — for teachers, look up from teachers collection by teacherId
  //    For admin, fall back to users collection name or email
  let name = '';
  let teacherId = '';

  if (role === 'teacher' || role === 'staff') {
    // The loginId IS the teacher's staff ID (e.g. SFST007)
    teacherId = loginId.trim().toUpperCase();
    const teacherDoc = await getDoc(doc(db, 'teachers', teacherId));
    if (teacherDoc.exists()) {
      const t = teacherDoc.data();
      name = (t.title ? t.title + ' ' : '') + (t.name || '');
    }
  }

  if (!name) {
    // Fallback: use name from users collection or the email itself
    name = userDoc.exists() ? (userDoc.data().name || loginId) : loginId;
  }

  const authUser = { uid, email, name: name.trim(), role, teacherId };
  localStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
  return authUser;
}

export async function logout() {
  await signOut(auth);
  localStorage.removeItem(AUTH_KEY);
}

export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return !!getCurrentUser();
}

export function isTeacher() {
  const role = getCurrentUser()?.role;
  return role === 'teacher' || role === 'admin' || role === 'super_admin';
}

export function isAdmin() {
  const role = getCurrentUser()?.role;
  return role === 'admin' || role === 'super_admin';
}

export function requireAuth() {
  if (!isLoggedIn()) throw new Error('Authentication required');
}

export function requireRole(role) {
  const user = getCurrentUser();
  if (!user || user.role !== role) {
    throw new Error(`Access denied: ${role} role required`);
  }
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// Detects an existing Firebase Auth session (e.g. logged in via pro-leo-site)
// and auto-populates the assessment-app localStorage session without re-login.
// Only teacher / admin roles are allowed into the assessment-app.
export function resolveAuthSession() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      unsub();
      if (!firebaseUser) { resolve(); return; }
      // Already have a valid local session — nothing to do
      if (getCurrentUser()) { resolve(); return; }
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (!userDoc.exists()) { resolve(); return; }
        const data = userDoc.data();
        const role = data.role || '';
        // Students and office staff are not allowed in the assessment-app
        if (!['teacher', 'admin', 'super_admin'].includes(role)) { resolve(); return; }
        let name = data.name || firebaseUser.email;
        const teacherId = (data.teacherId || data.loginId || '').toUpperCase();
        if ((role === 'teacher') && teacherId) {
          try {
            const tDoc = await getDoc(doc(db, 'teachers', teacherId));
            if (tDoc.exists()) {
              const t = tDoc.data();
              name = (t.title ? t.title + ' ' : '') + (t.name || name);
            }
          } catch (e) { /* use fallback name */ }
        }
        const authUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          name: name.trim(),
          role,
          teacherId
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
      } catch (e) {
        console.warn('[auth] Auto-login from shared Firebase session failed:', e.message);
      }
      resolve();
    });
  });
}
