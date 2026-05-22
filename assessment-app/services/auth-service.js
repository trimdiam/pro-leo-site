import { auth, db } from './firebase-config.js';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const AUTH_KEY = 'sfds_auth_user';

// Roles the main portal assigns to teachers
const TEACHER_ROLES = ['teacher', 'class_teacher', 'subject_teacher'];
const ADMIN_ROLES   = ['admin', 'super_admin'];
const ALLOWED_ROLES = [...TEACHER_ROLES, ...ADMIN_ROLES];

function idToEmail(id) {
  if (id.includes('@')) return id;
  return id.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '@stfrancis.school';
}

async function buildAuthUser(uid, email, data, loginId) {
  const rawRole = (data.role || '').toLowerCase();
  const role    = rawRole; // keep original role — isTeacher/isAdmin use it

  let name = data.name || email;
  const teacherId = (loginId || data.teacherId || data.loginId || data.staffId || '').toUpperCase();

  if (TEACHER_ROLES.includes(rawRole) && teacherId) {
    try {
      const tDoc = await getDoc(doc(db, 'teachers', teacherId));
      if (tDoc.exists()) {
        const t = tDoc.data();
        name = (t.title ? t.title + ' ' : '') + (t.name || name);
      }
    } catch (e) { /* use fallback */ }
  }

  return { uid, email, name: name.trim(), role, teacherId };
}

export async function login(loginId, password) {
  const email      = idToEmail(loginId);
  const credential = await signInWithEmailAndPassword(auth, email, password);
  const uid        = credential.user.uid;

  const userDoc = await getDoc(doc(db, 'users', uid));
  if (!userDoc.exists()) throw new Error('Your account is not set up. Contact admin.');

  const data    = userDoc.data();
  const rawRole = (data.role || '').toLowerCase();
  if (!ALLOWED_ROLES.includes(rawRole)) throw new Error('Access denied. This app is for teachers and administrators only.');

  const authUser = await buildAuthUser(uid, credential.user.email, data, loginId);
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

// True for teachers (any teacher role) — NOT admins
export function isTeacher() {
  const role = getCurrentUser()?.role || '';
  return TEACHER_ROLES.includes(role);
}

// True only for admins
export function isAdmin() {
  const role = getCurrentUser()?.role || '';
  return ADMIN_ROLES.includes(role);
}

export function requireAuth() {
  if (!isLoggedIn()) throw new Error('Authentication required');
}

export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// Auto-populates localStorage from an existing Firebase Auth session (SSO from main portal).
// Refreshes the stored session if the role has changed since last login.
export function resolveAuthSession() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, async firebaseUser => {
      unsub();
      if (!firebaseUser) { resolve(); return; }

      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (!userDoc.exists()) { resolve(); return; }

        const data    = userDoc.data();
        const rawRole = (data.role || '').toLowerCase();
        if (!ALLOWED_ROLES.includes(rawRole)) { resolve(); return; }

        // Always refresh — role may have changed since the cached session was written
        const authUser = await buildAuthUser(firebaseUser.uid, firebaseUser.email, data, '');
        localStorage.setItem(AUTH_KEY, JSON.stringify(authUser));
      } catch (e) {
        console.warn('[auth] SSO session resolve failed:', e.message);
      }
      resolve();
    });
  });
}
