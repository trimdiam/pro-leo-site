  import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, createUserWithEmailAndPassword, updatePassword } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, addDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit, serverTimestamp, updateDoc, onSnapshot, getCountFromServer, deleteField, writeBatch } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
// ================================================================
// BLOCK 1 — MAIN APP LOGIC
// ================================================================
const pur = s => (window.DOMPurify ? DOMPurify.sanitize(s || '') : (s || '').replace(/</g,'&lt;').replace(/>/g,'&gt;'));
  // Cloudinary handles uploads — Firebase Storage is not used

  const firebaseConfig = {
    apiKey: "AIzaSyBXq3fe0uY8UB7-uLGzGIIvZOQf8YjNqaM",
    authDomain: "st-francis-school-a3e7e.firebaseapp.com",
    projectId: "st-francis-school-a3e7e",
    storageBucket: "st-francis-school-a3e7e.firebasestorage.app",
    messagingSenderId: "180123372524",
    appId: "1:180123372524:web:caed0f2a44d35f19d90ec9"
  };

  const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const auth = getAuth(app);

  // ── FCM: request permission and save token to users/{uid} ──────────────
  async function _registerFCM(uid) {
    try {
      const messaging = getMessaging(app);
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const token = await getToken(messaging, {
        vapidKey: 'BEtmfoNL9kNnmzpHG0lckLDQk_-RBGC2ajS3OEo0khvHvDLkXvA4ol54KU3pBVJu3EoQwwfjbc-ccwMzQhXCGhA'
      });
      if (token) {
        await updateDoc(doc(db, 'users', uid), { fcmToken: token });
        console.log('[FCM] token saved');
      }
    } catch(e) {
      console.warn('[FCM] registration skipped:', e.message);
    }
  }
  const db   = getFirestore(app);

  window._firebaseApp     = app;
  window._firebaseAuth    = auth;
  window.firebaseConfig   = firebaseConfig;
  window.initializeApp    = initializeApp;
  // Phase 6 — deep-link to assessment-app student profile
  window._academicAppUrl  = '../assessment-app/index.html';
  window._firestoreDb     = db;
  window._sfAppReady      = Promise.resolve(app);

  // Expose Firebase utilities for non-module scripts (sibling-system.js, notification-center.js)
  Object.assign(window, { db, auth, getDoc, getDocs, doc, collection, query, where, updateDoc, setDoc, addDoc, deleteDoc, deleteField, serverTimestamp, writeBatch, orderBy, limit, onSnapshot, getCountFromServer });

  // Hide the "loading Firebase" notice now that the module loaded successfully
  const moduleErrEl = document.getElementById('login-module-error');
  if (moduleErrEl) moduleErrEl.style.display = 'none';

  // ================================================================
  //  LOGIN SYSTEM
  // ================================================================
  function idToEmail(id) {
    return id.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '@stfrancis.school';
  }

  window.togglePassVis = function() {
    const inp = document.getElementById('loginPass');
    const btn = document.getElementById('pass-eye-btn');
    if (!inp) return;
    inp.type = inp.type === 'password' ? 'text' : 'password';
    if (btn) btn.innerHTML = inp.type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
  };

  function setLoginLoading(loading) {
    const btn     = document.getElementById('loginSubmitBtn');
    const btnText = document.getElementById('login-btn-text');
    if (!btn) return;
    btn.disabled = loading;
    if (btnText) btnText.textContent = loading ? 'Signing in...' : 'Login';
    btn.innerHTML = loading
      ? '<i class="fas fa-spinner fa-spin"></i> <span>Signing in...</span>'
      : '<i class="fas fa-sign-in-alt"></i> <span id="login-btn-text">Login</span>';
  }

  function showLoginError(msg) {
    const box  = document.getElementById('login-error-msg');
    const text = document.getElementById('login-error-text');
    if (!box) return;
    if (msg) {
      box.style.display = 'flex';
      box.style.alignItems = 'center';
      if (text) text.textContent = msg;
    } else {
      box.style.display = 'none';
    }
  }

  window.doLogin = async function() {
    const rawId   = (document.getElementById('loginUser')?.value || '').trim();
    const password = (document.getElementById('loginPass')?.value || '').trim();
    if (!rawId)    { showLoginError('Please enter your Login ID.'); return; }
    if (!password) { showLoginError('Please enter your password.'); return; }
    showLoginError(null);
    setLoginLoading(true);

    try {
      const loginEmail = (window._loginRole === 'admin' && rawId.includes('@')) ? rawId : idToEmail(rawId);
      const cred = await signInWithEmailAndPassword(auth, loginEmail, password);
      // Save remember-me
      try {
        const remCheck = document.getElementById('rememberMeCheck');
        if (remCheck && remCheck.checked) {
          localStorage.setItem('sf_remembered_id', rawId);
        } else {
          localStorage.removeItem('sf_remembered_id');
        }
      } catch(e) {}
      await _handleAuthUser(cred.user);
    } catch(err) {
      console.error('Login error:', err);
      let msg = 'Login failed. Check your ID and password.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential' || err.code === 'auth/invalid-email') msg = 'ID or password is incorrect. Contact admin if you need help.';
      else if (err.code === 'auth/wrong-password') msg = 'Wrong password. Contact admin to reset it.';
      else if (err.code === 'auth/too-many-requests') msg = 'Too many failed attempts. Please wait a few minutes and try again.';
      else if (err.code) msg = 'Login failed [' + err.code + ']';
      showLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  // ================================================================
  //  FIRST-TIME SETUP — Student ID self-linking
  //
  //  When a Google-authenticated user signs in for the first time,
  //  they have no `users/{uid}` document. Instead of blocking them,
  //  we show a modal asking for their Student ID. We verify the ID
  //  exists in the `students` collection (admin pre-populated via
  //  CSV import), then create the `users/{uid}` link automatically.
  //
  //  An audit row is written to `newAccountLinks` so the admin can
  //  see who self-onboarded and when.
  // ================================================================
  let _pendingFirstTimeUser = null;

  let _ftsTimeoutId = null;

  function _showFirstTimeSetup(user) {
    _pendingFirstTimeUser = user;

    if (_ftsTimeoutId) clearTimeout(_ftsTimeoutId);
    _ftsTimeoutId = setTimeout(() => {
      if (_pendingFirstTimeUser) {
        _showFTSError('Taking too long? Try signing in again or contact admin.');
      }
    }, 2 * 60 * 1000);

    const photo = user.photoURL    || '';
    const name  = user.displayName || 'Student';
    const email = user.email       || '';

    const photoEl = document.getElementById('fts-user-photo');
    const nameEl  = document.getElementById('fts-user-name');
    const emailEl = document.getElementById('fts-user-email');

    if (photoEl) {
      if (photo) {
        photoEl.innerHTML = '<img src="' + photo + '" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover">';
      } else {
        photoEl.textContent = (name.charAt(0) || 'S').toUpperCase();
      }
    }
    if (nameEl)  nameEl.textContent  = name;
    if (emailEl) emailEl.textContent = email;

    _showFTSError(null);
    const input = document.getElementById('fts-student-id');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 250);
    }

    const overlay = document.getElementById('first-time-setup-overlay');
    if (overlay) overlay.style.display = 'flex';
  }

  function _hideFirstTimeSetup() {
    const overlay = document.getElementById('first-time-setup-overlay');
    if (overlay) overlay.style.display = 'none';
    _pendingFirstTimeUser = null;
    if (_ftsTimeoutId) { clearTimeout(_ftsTimeoutId); _ftsTimeoutId = null; }
  }

  function _showFTSError(msg) {
    const box = document.getElementById('fts-error');
    if (!box) return;
    if (msg) {
      box.innerHTML = '<i class="fas fa-exclamation-circle"></i><span style="flex:1">' + msg + '</span>'
        + '<button onclick="linkStudentAccount()" style="margin-left:8px;padding:3px 10px;background:#991b1b;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">Try Again</button>';
      box.style.display = 'flex';
    } else {
      box.style.display = 'none';
      box.innerHTML = '';
    }
  }

  window.linkStudentAccount = async function() {
    if (!_pendingFirstTimeUser) {
      _hideFirstTimeSetup();
      return;
    }

    const input = document.getElementById('fts-student-id');
    const btn   = document.getElementById('fts-link-btn');
    const sid   = (input?.value || '').trim();

    if (!sid) {
      _showFTSError('Please enter your Student ID.');
      return;
    }

    _showFTSError(null);
    if (btn) {
      btn.disabled  = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying…';
    }

    try {
      // 1. Verify the Student ID exists in the `students` collection
      const studentSnap = await getDocs(query(
        collection(db, 'students'),
        where('studentId', '==', sid),
        limit(1)
      ));

      if (studentSnap.empty) {
        _showFTSError('Student ID not found. Please check the ID or contact admin.');
        return;
      }

      const student = studentSnap.docs[0].data();
      const user    = _pendingFirstTimeUser;

      // 2. Block double-linking — refuse if another UID already owns this Student ID
      const existingLinkSnap = await getDocs(query(
        collection(db, 'users'),
        where('studentId', '==', sid),
        limit(1)
      ));
      if (!existingLinkSnap.empty && existingLinkSnap.docs[0].id !== user.uid) {
        _showFTSError('This Student ID is already linked to another Google account. Contact admin if this is wrong.');
        return;
      }

      // 3. Create the linked `users/{uid}` document
      await setDoc(doc(db, 'users', user.uid), {
        role:      'student',
        studentId: sid,
        name:      student.name     || user.displayName || 'Student',
        email:     user.email       || '',
        photoURL:  user.photoURL    || '',
        class:     student.class    || '',
        loginId:   sid,
        linkedAt:  new Date().toISOString(),
        linkedVia: 'google-self-link'
      });

      // 4. Audit trail for the admin (best-effort, non-blocking)
      try {
        await addDoc(collection(db, 'newAccountLinks'), {
          uid:       user.uid,
          studentId: sid,
          name:      student.name  || user.displayName || 'Student',
          email:     user.email    || '',
          class:     student.class || '',
          method:    'google-self-link',
          linkedAt:  serverTimestamp()
        });
      } catch (e) {
        console.warn('[FirstTimeSetup] Audit log skipped:', e.message);
      }

      // 5. Clear the modal and continue with the normal login flow
      showToast('✅ Account linked! Opening your portal…');
      _hideFirstTimeSetup();
      setTimeout(async () => {
        try { await _handleAuthUser(user); }
        catch(e) { console.error('[FTS] _handleAuthUser failed, reloading:', e.message); window.location.reload(); }
      }, 400);

    } catch (e) {
      console.error('[FirstTimeSetup] Link failed:', e);
      _showFTSError('Could not link account: ' + (e.message || 'Unknown error.'));
    } finally {
      if (btn) {
        btn.disabled  = false;
        btn.innerHTML = '<i class="fas fa-link"></i> Link My Account';
      }
    }
  };

  window.cancelFirstTimeSetup = async function() {
    if (_pendingFirstTimeUser) {
      try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
        await signOut(auth).catch(()=>{});
      } catch (e) {}
    }
    _hideFirstTimeSetup();
    showToast('Sign-in cancelled.');
  };

  // ================================================================
  //  GOOGLE SIGN-IN — signInWithPopup + GoogleAuthProvider
  //  Routes through the same _handleAuthUser flow used by email login,
  //  so the user must already exist in the `users` Firestore collection
  //  with a valid role assigned by the admin.
  // ================================================================
  window.doGoogleLogin = async function() {
    showLoginError(null);
    const btn   = document.getElementById('googleSignInBtn');
    const label = document.getElementById('google-btn-text');
    if (btn)   { btn.disabled = true; btn.style.opacity = '0.7'; btn.style.cursor = 'wait'; }
    if (label) label.textContent = 'Opening Google…';

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      await _handleAuthUser(cred.user);
    } catch (err) {
      console.error('Google sign-in error:', err);
      let msg = 'Google sign-in failed. Please try again.';
      if      (err.code === 'auth/popup-closed-by-user')  msg = 'Sign-in cancelled.';
      else if (err.code === 'auth/popup-blocked')         msg = 'Popup blocked — please allow popups for this site.';
      else if (err.code === 'auth/cancelled-popup-request') msg = 'Another sign-in is already in progress.';
      else if (err.code === 'auth/account-exists-with-different-credential')
        msg = 'This email is registered with a different sign-in method.';
      showLoginError(msg);
    } finally {
      if (btn)   { btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; }
      if (label) label.textContent = 'Continue with Google';
    }
  };

  // Guard prevents onAuthStateChanged + doGoogleLogin from running _handleAuthUser concurrently
  let _authHandling = false;

  async function _handleAuthUser(user) {
    if (_authHandling) return;
    _authHandling = true;
    try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      // Detect first-time Google sign-in — offer Student ID self-linking.
      const isGoogle = (user.providerData || []).some(p => p && p.providerId === 'google.com');
      if (isGoogle) {
        _showFirstTimeSetup(user);
        return;
      }
      // Email/password users must be pre-provisioned by admin.
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
      await signOut(auth).catch(()=>{});
      showLoginError('Your account is not set up yet. Contact the school administrator.');
      return;
    }
    const rawRole = (userDoc.data().role || '').toString().trim().toLowerCase();
    const role = rawRole === 'office_staff' ? 'office' : rawRole;
    if (!['student','teacher','admin','office'].includes(role)) { showLoginError('Invalid role. Contact admin.'); return; }
    showToast('✅ Welcome! Opening your portal…');
    setTimeout(async () => {
      loginAs(role);
      window._currentUserRole = role;
      if (role === 'student') {
        await loadStudentProfile(user);
        // Sibling linking system — load linked students after profile
        if (window.detectAndLoadSiblings) {
          try { await window.detectAndLoadSiblings(user); }
          catch (e) { console.warn('[SiblingSystem] init failed:', e.message); }
        }
        // Notification Center fetch is gated by auth — uses user.uid
        if (window.loadStudentNotificationCenter) {
          window.loadStudentNotificationCenter(user).catch(e =>
            console.warn('[NotificationCenter] fetch failed:', e.message)
          );
        }
      }
      if (role === 'teacher') await loadTeacherPortal(user);
      if (role === 'office')  { if (window.loadOfficePortal) await window.loadOfficePortal(user); }
      if (role === 'admin')   { setTimeout(()=>{ if (window.loadAdminDashboardStats) window.loadAdminDashboardStats(); }, 800); }
    }, 400);
    } finally {
      _authHandling = false;
    }
  }

  window.firebaseLogin = window.doLogin;

  window.sendPasswordReset = async function() {
    const email = (document.getElementById('login-email')?.value || '').trim();
    if (!email) { showLoginError('Enter your email address above first.'); return; }
    try {
      const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
      await sendPasswordResetEmail(auth, email);
      showToast('✅ Password reset email sent. Check your inbox.');
    } catch(e) {
      const msg = e.code === 'auth/user-not-found' ? 'No account found for that email.' : e.message;
      showLoginError(msg);
    }
  };

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try { await _handleAuthUser(user); } catch(e) { console.warn('Session restore:', e.message); }
      _registerFCM(user.uid);
    } else {
      window._officePortalLoaded = false;
    }
  });

  // Expose role for cross-script access (script.js uses 'let' which is not on window)
  window._loginRole = 'student';

  const _origSetRole = window.setRole;
  window.setRole = function(role, btn) {
    _origSetRole(role, btn);
    window._loginRole = role; // keep module in sync
    const label   = document.getElementById('login-user-label');
    const hintTxt = document.getElementById('login-hint-text');
    const input   = document.getElementById('loginUser');
    showLoginError(null);
    if (role === 'teacher') {
      if (label)   label.textContent = 'Teacher Login ID';
      if (hintTxt) hintTxt.textContent = 'Enter your Teacher Login ID (e.g. SFST007) and the password set by the admin.';
      if (input)   { input.placeholder = 'e.g. SFST007'; input.style.textTransform = 'uppercase'; }
    } else if (role === 'student') {
      if (label)   label.textContent = 'Student ID';
      if (hintTxt) hintTxt.textContent = 'Enter your Student ID (e.g. SFS/2025/001) and the password set by the admin.';
      if (input)   { input.placeholder = 'e.g. SFS/2025/001'; input.style.textTransform = 'none'; }
    } else if (role === 'office') {
      if (label)   label.textContent = 'Office Staff ID';
      if (hintTxt) hintTxt.textContent = 'Enter your Office Staff Login ID and the password set by the admin.';
      if (input)   { input.placeholder = 'e.g. SFSO001'; input.style.textTransform = 'uppercase'; }
    } else {
      if (label)   label.textContent = 'Admin Email';
      if (hintTxt) hintTxt.textContent = 'Enter your administrator email address and password.';
      if (input)   { input.placeholder = 'admin@school.com'; input.style.textTransform = 'none'; }
    }
  };

  // ================================================================
  //  PUBLIC DATA LOADERS — homepage, staff, notices, events, gallery
  // ================================================================

  // ── Homepage stats from Firestore ────────────────────────────────
  async function loadHomeStats() {
    try {
      const [sCount, tCount] = await Promise.all([
        getCountFromServer(collection(db,'students')),
        getCountFromServer(collection(db,'teachers'))
      ]);
      const sEl = document.getElementById('home-stat-students');
      const tEl = document.getElementById('home-stat-teachers');
      if (sEl && sCount.data().count > 0) sEl.textContent = sCount.data().count.toLocaleString('en-IN') + '+';
      if (tEl && tCount.data().count > 0) tEl.textContent = tCount.data().count.toLocaleString('en-IN') + '+';
    } catch(e) { /* use static fallback */ }
  }

  // ── Ticker from Firestore announcements ───────────────────────────
  async function loadHomeTicker() {
    try {
      const snap = await getDocs(query(collection(db,'announcements'), orderBy('priority','desc'), limit(20)));
      if (snap.empty) return; // keep static defaults
      const today = new Date().toISOString().split('T')[0];
      const items = snap.docs
        .map(d => d.data())
        .filter(a => (!a.activeTo || a.activeTo >= today) && (!a.activeFrom || a.activeFrom <= today));
      if (items.length === 0) return;
      const ticker = document.getElementById('home-ticker-content');
      if (ticker) {
        ticker.innerHTML = items.map(a => `<span>${pur(a.text || a.title)}</span>`).join('');
      }
    } catch(e) { /* keep static */ }
  }

  // ── Staff (public page) ────────────────────────────────────────────
  window.loadPublicStaff = async function() {
    const grid = document.getElementById('public-staff-grid');
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--text-light)"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem"></i></div>';
    try {
      const snap = await getDocs(query(collection(db,'teachers'), orderBy('teacherId')));
      if (snap.empty) {
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-light)">No staff data available.</div>';
        return;
      }
      const classLabel = { PLG:'Play Group', SKG:'SKG', LKG:'LKG' };
      const getClsLabel = c => classLabel[c] || (c ? 'Class ' + c : '');
      // Exclude SFST001 (Principal shown statically) and SFST002 (Head Mistress shown statically)
      const filtered = snap.docs.filter(d => !['SFST001','SFST002'].includes(d.data().teacherId));
      grid.innerHTML = filtered.map(d => {
        const t = d.data();
        const cls = t.classTeacher ? ` · CT: ${getClsLabel(t.classTeacher)}` : '';
        const titleStr = (t.title && t.title !== 'Sir') ? t.title + ' ' : (t.gender === 'M' ? 'Mr. ' : 'Ms. ');
        return `<div class="staff-card">
          <div class="staff-avatar"><i class="fas fa-user${t.gender === 'M' ? '' : ''}"></i></div>
          <div class="staff-name">${titleStr}${t.name}</div>
          <div class="staff-role">${t.subjects || 'Teacher'}${cls}</div>
          <div class="staff-desc">${t.qualification || ''} ${t.experience ? '· ' + t.experience + ' years exp.' : ''}</div>
        </div>`;
      }).join('');
    } catch(e) {
      grid.innerHTML = isPermissionError(e) ? permissionErrorHtml('teachers') : `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--danger)">❌ ${e.message}</div>`;
    }
  };

  // ── Public Notices ────────────────────────────────────────────────
  window.loadPublicNotices = async function() {
    const el = document.getElementById('public-notices-list');
    if (!el) return;
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i></div>';
    try {
      const snap = await getDocs(query(collection(db,'notices'), limit(30)));
      const notices = [...snap.docs]
        .map(d => ({id:d.id,...d.data()}))
        .filter(n => {
          const aud = (n.audience||'all').toLowerCase();
          return aud==='all' || aud==='students' || aud==='both' || aud==='parents';
        })
        .sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      if (!notices.length) { el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-light)">No public notices at this time.</div>'; return; }
      const icon = p => p==='Urgent'?'fa-exclamation-circle':p==='Important'?'fa-bell':'fa-info-circle';
      const bc   = p => p==='Urgent'?'badge-danger':p==='Important'?'badge-warning':'badge-info';
      el.innerHTML = notices.map(n => {
        const fmt = n.postedAt ? new Date(n.postedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
        return `<div class="notice-card">
          <div class="notice-icon"><i class="fas ${icon(n.priority)}"></i></div>
          <div>
            <div class="notice-title">${pur(n.title)}</div>
            <div class="notice-date">📅 ${fmt} &nbsp;|&nbsp; <span class="badge ${bc(n.priority)}">${n.priority||'Normal'}</span></div>
            <div class="notice-body">${pur(n.body)}</div>
          </div>
        </div>`;
      }).join('');
    } catch(e) {
      el.innerHTML = isPermissionError(e) ? permissionErrorHtml('notices') : `<div style="color:var(--danger);padding:16px">❌ ${e.message}</div>`;
    }
  };

  // ── Public Events ─────────────────────────────────────────────────
  window.loadPublicEvents = async function() {
    const grid = document.getElementById('public-events-grid');
    if (!grid) return;
    try {
      const snap = await getDocs(query(collection(db,'events'), limit(20)));
      if (snap.empty) return; // keep static fallback
      const evts = [...snap.docs].map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.date||'').localeCompare(b.date||''));
      const bc = s => s==='Important'||s==='Exam'?'badge-danger':s==='Upcoming'?'badge-warning':s==='Open to All'?'badge-success':'badge-info';
      grid.innerHTML = evts.map(ev => {
        const d = ev.date ? new Date(ev.date+'T00:00:00') : null;
        const day   = d ? d.getDate() : '—';
        const month = d ? d.toLocaleString('en',{month:'short'}).toUpperCase() : '—';
        return `<div class="event-card">
          <div class="event-date-box"><div class="event-day">${day}</div><div class="event-month">${month}</div></div>
          <div class="event-info">
            <h4>${ev.title}</h4>
            <p><i class="fas fa-clock" style="color:var(--accent);font-size:12px"></i> ${ev.time||'TBA'} ${ev.venue?'— '+ev.venue:''}</p>
            ${ev.description?`<p style="margin-top:6px;font-size:13px;color:var(--text-light)">${ev.description}</p>`:''}
            <p style="margin-top:8px"><span class="badge ${bc(ev.status)}">${ev.status||'Upcoming'}</span></p>
          </div>
        </div>`;
      }).join('');
      // Also update homepage events grid (show first 4 with homepage=yes)
      const homeGrid = document.getElementById('home-events-grid');
      if (homeGrid) {
        const homeEvts = evts.filter(ev => ev.homepage !== 'no').slice(0,4);
        if (homeEvts.length > 0) {
          homeGrid.innerHTML = homeEvts.map(ev => {
            const d = ev.date ? new Date(ev.date+'T00:00:00') : null;
            const day   = d ? d.getDate() : '—';
            const month = d ? d.toLocaleString('en',{month:'short'}).toUpperCase() : '—';
            return `<div class="event-card">
              <div class="event-date-box"><div class="event-day">${day}</div><div class="event-month">${month}</div></div>
              <div class="event-info"><h4>${ev.title}</h4><p><i class="fas fa-clock" style="color:var(--accent);font-size:12px"></i> ${ev.time||'TBA'} ${ev.venue?'— '+ev.venue:''}</p>${ev.description?`<p style="margin-top:6px;font-size:13px;color:var(--text-light)">${ev.description}</p>`:''}</div>
            </div>`;
          }).join('');
        }
      }
    } catch(e) { /* keep static fallback */ }
  };

  // ================================================================
  //  PERMISSION ERROR HANDLER — shows fix guidance in UI
  // ================================================================
  function isPermissionError(e) {
    return e && (e.code === 'permission-denied' || (e.message && e.message.toLowerCase().includes('permission')));
  }

  function permissionErrorHtml(collection) {
    return `<div style="background:#fff3cd;border:1.5px solid #ffc107;border-radius:10px;padding:16px 20px;display:flex;gap:12px;align-items:flex-start">
      <i class="fas fa-exclamation-triangle" style="color:#e67e22;font-size:1.3rem;margin-top:2px;flex-shrink:0"></i>
      <div>
        <strong style="color:#856404;display:block;margin-bottom:4px">Firebase Rules Block: "${collection}"</strong>
        <p style="font-size:13px;color:#856404;margin:0 0 10px">Your Firestore Security Rules are blocking this request. Fix it in 3 steps:</p>
        <ol style="font-size:13px;color:#856404;margin:0;padding-left:18px;line-height:1.8">
          <li>Open <a href="https://console.firebase.google.com" target="_blank" style="color:#1a4a8a;font-weight:700">console.firebase.google.com</a></li>
          <li>Go to <strong>Firestore Database → Rules</strong></li>
          <li>Paste the rules from the <strong>firestore.rules</strong> file provided and click <strong>Publish</strong></li>
        </ol>
        <p style="font-size:12px;color:#856404;margin:10px 0 0">For Storage errors: Go to <strong>Storage → Rules</strong> and paste from <strong>storage.rules</strong> file.</p>
      </div>
    </div>`;
  }
  async function loadAdmissionNotice() {
    try {
      const snap = await getDocs(query(collection(db,'settings'), where('key','==','admissionNotice')));
      if (!snap.empty) {
        const notice = snap.docs[0].data().value;
        const box = document.getElementById('admission-notice-box');
        if (box && notice) { box.innerHTML = '<i class="fas fa-info-circle" style="margin-right:8px"></i>' + pur(notice); box.style.display = 'block'; }
        const adminEl = document.getElementById('adm-public-notice');
        if (adminEl) adminEl.value = notice;
      }
    } catch(e) { /* ignore */ }
  }

  // Handle Apply button (can link to external URL or show form)
  window.handleApplyClick = async function() {
    try {
      const snap = await getDocs(query(collection(db,'settings'), where('key','==','admissionLink')));
      if (!snap.empty) {
        const link = snap.docs[0].data().value;
        if (link && link.startsWith('http')) { window.open(link,'_blank'); return; }
      }
    } catch(e) { /* fallback to form */ }
    showPage('admission');
  };

  // Contact form submission to Firestore
  window.submitContactMessage = async function() {
    const name    = (document.getElementById('contact-name')?.value    || '').trim();
    const email   = (document.getElementById('contact-email')?.value   || '').trim();
    const subject = (document.getElementById('contact-subject')?.value || '').trim();
    const message = (document.getElementById('contact-message')?.value || '').trim();
    if (!name || !message) { showToast('⚠️ Please enter your name and message.'); return; }
    try {
      await addDoc(collection(db,'contacts'), { name, email, subject, message, status:'Unread', createdAt: new Date().toISOString() });
      document.getElementById('contact-name').value = '';
      document.getElementById('contact-email').value = '';
      document.getElementById('contact-subject').value = '';
      document.getElementById('contact-message').value = '';
      showToast('✅ Message sent! We will get back to you shortly.');
    } catch(e) { showToast('❌ Could not send: ' + e.message); }
  };

  // Student portal — internal message to administration
  window.sendStudentMessage = async function() {
    const to      = (document.getElementById('s-contact-to')?.value      || '').trim();
    const subject = (document.getElementById('s-contact-subject')?.value || '').trim();
    const message = (document.getElementById('s-contact-message')?.value || '').trim();
    if (!message) { showToast('⚠️ Please write a message before sending.'); return; }
    try {
      await addDoc(collection(db, 'student_messages'), {
        to,
        subject:   subject || '(No subject)',
        message,
        studentId: window._studentId  || '',
        studentName: window._studentName || '',
        studentClass: window._studentClass || '',
        status:    'Unread',
        createdAt: new Date().toISOString(),
      });
      document.getElementById('s-contact-subject').value = '';
      document.getElementById('s-contact-message').value = '';
      showToast('✅ Message sent to the administration.');
    } catch(e) { showToast('❌ Could not send: ' + e.message); }
  };

  // ── Helper: admission doc upload (disabled — Spark plan has no Storage) ──
  async function _uploadAdmissionDoc(file, folder, label) {
    if (!file) return null;
    throw new Error('File uploads not supported. Submit hard copies of documents at the school office.');
  }

  // Admission form submission to Firestore (with file uploads)
  window.submitAdmissionForm = async function() {
    const getVal = id => (document.getElementById(id)?.value || '').trim();
    const getFile = id => document.getElementById(id)?.files?.[0] || null;

    const studentName = getVal('adm-student-name');
    const dob         = getVal('adm-dob');
    const cls         = getVal('adm-class');
    const parentName  = getVal('adm-parent-name');
    const contact     = getVal('adm-contact');
    const address     = getVal('adm-address');
    if (!studentName || !dob || !cls || !parentName || !contact || !address) {
      showToast('⚠️ Please fill in all required fields (*).');
      return;
    }

    // Capture parent details
    const father = {
      name:       getVal('adm-father-name'),
      occupation: getVal('adm-father-occupation'),
      contact:    getVal('adm-father-contact')
    };
    const mother = {
      name:       getVal('adm-mother-name'),
      occupation: getVal('adm-mother-occupation'),
      contact:    getVal('adm-mother-contact')
    };

    // Capture document files
    const photoFile     = getFile('adm-doc-photo');
    const birthFile     = getFile('adm-doc-birth');
    const marksheetFile = getFile('adm-doc-marksheet');

    const btn = document.querySelector('#page-admission .btn-primary');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…'; btn.disabled = true; }

    try {
      // Use a deterministic folder per submission so files stay grouped
      const folder = (studentName.replace(/[^a-zA-Z0-9]/g,'_').toLowerCase() || 'app') + '_' + Date.now();

      // Upload all three documents in parallel
      const [photoDoc, birthDoc, marksheetDoc] = await Promise.all([
        _uploadAdmissionDoc(photoFile,     folder, 'photo'),
        _uploadAdmissionDoc(birthFile,     folder, 'birth_certificate'),
        _uploadAdmissionDoc(marksheetFile, folder, 'marksheet')
      ]);

      const documents = [photoDoc, birthDoc, marksheetDoc].filter(Boolean);

      if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';

      await addDoc(collection(db,'admissions'), {
        studentName,
        // Mirror as `fullName` for downstream readers (Office admissions UI uses fullName)
        fullName: studentName,
        dob, class: cls,
        classApplied: cls,
        year: getVal('adm-year') || '2025–26',
        gender: getVal('adm-gender'),
        parentName, relation: getVal('adm-relation'),
        contact, email: getVal('adm-email'),
        address, previousSchool: getVal('adm-prev-school'),
        medical: getVal('adm-medical'),
        father, mother,
        documents,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      });

      // Clear form
      ['adm-student-name','adm-dob','adm-parent-name','adm-contact','adm-email','adm-address','adm-prev-school','adm-medical',
       'adm-father-name','adm-father-occupation','adm-father-contact',
       'adm-mother-name','adm-mother-occupation','adm-mother-contact',
       'adm-doc-photo','adm-doc-birth','adm-doc-marksheet'
      ].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });

      showToast('✅ Application submitted! Our team will contact you within 3 working days.');
      showPage('home');
    } catch(e) {
      console.error('[Admission] submit failed:', e);
      showToast('❌ Submission failed: ' + e.message);
    } finally {
      if (btn) { btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Application'; btn.disabled = false; }
    }
  };

  // ================================================================
  //  ADMIN — Events management
  // ================================================================
  window.addEvent = async function() {
    const title   = (document.getElementById('ev-title')?.value   || '').trim();
    const date    = document.getElementById('ev-date')?.value     || '';
    const time    = (document.getElementById('ev-time')?.value    || '').trim();
    const venue   = (document.getElementById('ev-venue')?.value   || '').trim();
    const desc    = (document.getElementById('ev-desc')?.value    || '').trim();
    const status  = document.getElementById('ev-status')?.value   || 'Upcoming';
    const homepage = document.getElementById('ev-homepage')?.value || 'yes';
    if (!title || !date) { showToast('⚠️ Title and Date are required.'); return; }
    try {
      await addDoc(collection(db,'events'), { title, date, time, venue, description:desc, status, homepage, createdAt: new Date().toISOString() });
      ['ev-title','ev-time','ev-venue','ev-desc'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
      showToast('✅ Event saved!');
      loadAdminEvents();
      loadPublicEvents();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.loadAdminEvents = async function() {
    const el = document.getElementById('admin-events-list');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
    try {
      const snap = await getDocs(query(collection(db,'events'), limit(30)));
      if (snap.empty) { el.innerHTML = '<p style="color:var(--text-light);font-size:13px">No events yet.</p>'; return; }
      const sorted = [...snap.docs].sort((a,b)=>(a.data().date||'').localeCompare(b.data().date||''));
      el.innerHTML = sorted.map(d => {
        const ev = d.data();
        const fmt = ev.date ? new Date(ev.date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
        return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div><div style="font-weight:700;color:var(--accent-dark)">${ev.title}</div>
          <div style="font-size:12px;color:var(--text-light);margin-top:3px">${fmt} ${ev.time?'· '+ev.time:''} ${ev.venue?'· '+ev.venue:''}</div>
          ${ev.description?`<div style="font-size:12px;font-style:italic;color:var(--text-light)">${ev.description.slice(0,60)}…</div>`:''}
          <span class="badge badge-info" style="margin-top:4px">${ev.status}</span> ${ev.homepage==='yes'?'<span class="badge badge-success" style="margin-left:4px">Homepage</span>':''}</div>
          <button onclick="deleteEvent('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button>
        </div>`;
      }).join('');
    } catch(e) { el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`; }
  };

  window.deleteEvent = async function(docId) {
    if (!confirm('Delete this event?')) return;
    try { await deleteDoc(doc(db,'events',docId)); showToast('🗑️ Event deleted.'); loadAdminEvents(); loadPublicEvents(); }
    catch(e) { showToast('❌ ' + e.message); }
  };

  // ================================================================
  //  ADMIN — Announcements management (homepage ticker)
  // ================================================================
  window.addAnnouncement = async function() {
    const text     = (document.getElementById('ann-text')?.value || '').trim();
    const from     = document.getElementById('ann-from')?.value || '';
    const to       = document.getElementById('ann-to')?.value   || '';
    const priority = document.getElementById('ann-priority')?.value || 'Normal';
    if (!text) { showToast('⚠️ Announcement text is required.'); return; }
    try {
      await addDoc(collection(db,'announcements'), { text, activeFrom:from, activeTo:to, priority, createdAt: new Date().toISOString() });
      document.getElementById('ann-text').value = '';
      showToast('✅ Announcement added! Homepage ticker updated.');
      loadAdminAnnouncements();
      loadHomeTicker();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.loadAdminAnnouncements = async function() {
    const el = document.getElementById('admin-announcements-list');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
    try {
      const snap = await getDocs(query(collection(db,'announcements'), limit(30)));
      if (snap.empty) { el.innerHTML = '<p style="color:var(--text-light);font-size:13px">No announcements yet.</p>'; return; }
      const sorted = [...snap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      el.innerHTML = sorted.map(d => {
        const a = d.data();
        return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div>
            <div style="font-size:14px;color:var(--text)">${pur(a.text)}</div>
            <div style="font-size:11px;color:var(--text-light);margin-top:3px">${a.activeFrom?'From: '+a.activeFrom:''} ${a.activeTo?'Until: '+a.activeTo:''} · <span class="badge ${a.priority==='High'?'badge-danger':'badge-info'}">${a.priority}</span></div>
          </div>
          <button onclick="deleteAnnouncement('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer;flex-shrink:0"><i class="fas fa-trash"></i></button>
        </div>`;
      }).join('');
    } catch(e) { el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`; }
  };

  window.deleteAnnouncement = async function(docId) {
    if (!confirm('Delete this announcement?')) return;
    try { await deleteDoc(doc(db,'announcements',docId)); showToast('🗑️ Announcement deleted.'); loadAdminAnnouncements(); loadHomeTicker(); }
    catch(e) { showToast('❌ ' + e.message); }
  };

  // ================================================================

  // ================================================================
  //  GALLERY — Cloudinary Upload (Firebase Spark plan workaround)
  // ================================================================

  // Restore saved Cloudinary config from localStorage on load
  (function initCloudinaryConfig() {
    try {
      const cn = localStorage.getItem('sf_cloudinary_name');
      const cp = localStorage.getItem('sf_cloudinary_preset');
      if (cn) { const el = document.getElementById('cloudinary-cloud-name'); if (el) el.value = cn; }
      if (cp) { const el = document.getElementById('cloudinary-preset');     if (el) el.value = cp; }
      if (cn && cp) {
        const badge = document.getElementById('cloudinary-status-badge');
        if (badge) badge.style.display = 'inline';
      }
    } catch(e) {}
  })();

  window.saveCloudinaryConfig = function() {
    const cn = (document.getElementById('cloudinary-cloud-name')?.value || '').trim();
    const cp = (document.getElementById('cloudinary-preset')?.value     || '').trim();
    if (!cn || !cp) { showToast('⚠️ Enter both Cloud Name and Preset Name.'); return; }
    try {
      localStorage.setItem('sf_cloudinary_name',   cn);
      localStorage.setItem('sf_cloudinary_preset', cp);
      const badge = document.getElementById('cloudinary-status-badge');
      if (badge) badge.style.display = 'inline';
      showToast('✅ Cloudinary config saved! You can now upload images.');
    } catch(e) { showToast('❌ Could not save: ' + e.message); }
  };

  function getCloudinaryConfig() {
    try {
      return {
        cloudName: localStorage.getItem('sf_cloudinary_name')   || '',
        preset:    localStorage.getItem('sf_cloudinary_preset') || ''
      };
    } catch(e) { return { cloudName: '', preset: '' }; }
  }

  // Preview selected file locally before upload
  window.previewGalleryFile = function(input) {
    const file = input.files[0];
    if (!file) return;
    const preview = document.getElementById('gal-preview');
    if (!preview) return;
    const reader = new FileReader();
    reader.onload = e => {
      preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`;
    };
    reader.readAsDataURL(file);
  };

  window.previewGalleryImage = function() {
    const url = (document.getElementById('gal-url')?.value || '').trim();
    const preview = document.getElementById('gal-preview');
    if (!preview || !url) return;
    preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" onerror="this.parentElement.innerHTML='<i class=\'fas fa-exclamation-triangle\'></i><p>Invalid URL</p>'">`;
  };

  // Upload via Cloudinary unsigned upload API, then save URL to Firestore
  window.uploadGalleryImage = async function() {
    const label     = (document.getElementById('gal-label')?.value || '').trim();
    const category  = document.getElementById('gal-category')?.value || 'Events';
    const isPublic  = document.getElementById('gal-public')?.value   || 'yes';
    const file      = document.getElementById('gal-file')?.files[0];
    const manualUrl = (document.getElementById('gal-url')?.value || '').trim();

    if (!label) { showToast('⚠️ Please enter a caption/label.'); return; }
    if (!file && !manualUrl) { showToast('⚠️ Please select an image file or paste a URL.'); return; }

    const btn          = document.getElementById('gal-upload-btn');
    const progressBox  = document.getElementById('gal-upload-progress');
    const progressBar  = document.getElementById('gal-progress-bar');
    const progressText = document.getElementById('gal-progress-text');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…'; }

    try {
      let imageUrl = manualUrl;

      if (file && !manualUrl) {
        if (file.size > 10 * 1024 * 1024) { showToast('⚠️ Image must be under 10MB.'); return; }

        const { cloudName, preset } = getCloudinaryConfig();
        if (!cloudName || !preset) {
          showToast('⚠️ Save your Cloudinary Cloud Name and Preset first (yellow box above).');
          return;
        }

        if (progressBox) progressBox.style.display = 'block';
        if (progressBar) progressBar.style.width = '5%';
        if (progressText) progressText.textContent = 'Uploading to Cloudinary…';

        const formData = new FormData();
        formData.append('file',          file);
        formData.append('upload_preset', preset);
        formData.append('folder',        'school_gallery');

        imageUrl = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 90) + 5;
              if (progressBar)  progressBar.style.width = pct + '%';
              if (progressText) progressText.textContent = `Uploading… ${pct}%`;
            }
          };
          xhr.onload = () => {
            if (xhr.status === 200) {
              const res = JSON.parse(xhr.responseText);
              if (progressBar)  progressBar.style.width = '100%';
              if (progressText) progressText.textContent = 'Upload complete!';
              resolve(res.secure_url);
            } else {
              try { reject(new Error(JSON.parse(xhr.responseText).error?.message || 'Upload failed')); }
              catch(ex) { reject(new Error('Cloudinary upload failed (status ' + xhr.status + ')')); }
            }
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(formData);
        });

        setTimeout(() => {
          if (progressBox) progressBox.style.display = 'none';
          if (progressBar) progressBar.style.width = '0%';
        }, 1200);
      }

      // Save URL + metadata to Firestore
      await addDoc(collection(db, 'gallery'), {
        label, url: imageUrl, category, public: isPublic,
        createdAt: new Date().toISOString()
      });

      // Reset form
      document.getElementById('gal-label').value = '';
      document.getElementById('gal-url').value   = '';
      const fi = document.getElementById('gal-file'); if (fi) fi.value = '';
      const pv = document.getElementById('gal-preview');
      if (pv) pv.innerHTML = '<i class="fas fa-image" style="font-size:2rem;color:var(--text-light);opacity:.4"></i>';

      showToast('✅ Image uploaded and saved to gallery!');
      loadAdminGallery();
      loadPublicGallery();
    } catch(e) {
      console.error('Gallery upload error:', e);
      showToast('❌ Upload failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload"></i> Upload &amp; Save to Gallery'; }
    }
  };

  window.loadAdminGallery = async function() {
    const el = document.getElementById('admin-gallery-list');
    if (!el) return;
    el.innerHTML = '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
    try {
      const snap = await getDocs(query(collection(db,'gallery'), limit(60)));
      if (snap.empty) { el.innerHTML = '<p style="color:var(--text-light);font-size:13px">No images yet. Upload one above.</p>'; return; }
      const sorted = [...snap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px">` +
        sorted.map(d => {
          const g = d.data();
          return `<div style="border-radius:10px;overflow:hidden;background:var(--bg);position:relative;border:1.5px solid var(--primary)">
            <img src="${g.url}" alt="${g.label}" style="width:100%;aspect-ratio:4/3;object-fit:cover" onerror="this.style.display='none'">
            <div style="padding:8px 10px;font-size:12px;font-weight:700;color:var(--accent-dark)">${g.label}</div>
            <div style="padding:0 10px 8px;font-size:11px;color:var(--text-light)">${g.category||'–'} · ${g.public==='yes'?'<span style="color:var(--success)">Public</span>':'<span style="color:var(--danger)">Private</span>'}</div>
            <button onclick="deleteGalleryImage('${d.id}')" style="position:absolute;top:6px;right:6px;background:rgba(220,53,69,0.85);border:none;color:#fff;border-radius:6px;padding:3px 7px;cursor:pointer;font-size:12px"><i class="fas fa-trash"></i></button>
          </div>`;
        }).join('') + '</div>';
    } catch(e) { el.innerHTML = isPermissionError(e) ? permissionErrorHtml('gallery') : `<p style="color:var(--danger)">❌ ${e.message}</p>`; }
  };

  window.deleteGalleryImage = async function(docId) {
    if (!confirm('Delete this image from gallery?')) return;
    try { await deleteDoc(doc(db,'gallery',docId)); showToast('🗑️ Image deleted.'); loadAdminGallery(); loadPublicGallery(); }
    catch(e) { showToast('❌ ' + e.message); }
  };

  // Keep reference to all loaded gallery items for client-side filtering
  window._galleryItems = [];

  // Load public gallery from Firestore
  window.loadPublicGallery = async function() {
    const grid = document.getElementById('public-gallery-grid');
    if (!grid) return;
    try {
      const snap = await getDocs(query(collection(db,'gallery'), where('public','==','yes'), limit(60)));
      if (snap.empty) return; // keep static icons
      window._galleryItems = [...snap.docs].map(d => ({id:d.id,...d.data()}));
      renderGalleryGrid(window._galleryItems);
    } catch(e) { /* keep static */ }
  };

  function renderGalleryGrid(items) {
    const grid = document.getElementById('public-gallery-grid');
    if (!grid || !items.length) return;
    grid.innerHTML = items.map(g => `
      <div class="gallery-item" style="background:#e8ddd0;cursor:pointer" onclick="openGalleryLightbox('${g.url}','${g.label.replace(/'/g,'\\\'')}')" data-cat="${g.category||''}">
        <img src="${g.url}" alt="${g.label}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none'">
        <div class="gallery-label">${g.label}</div>
        ${g.category?`<div style="position:absolute;top:8px;left:8px;background:rgba(139,111,71,.85);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">${g.category}</div>`:''}
      </div>`).join('');
  }

  // Category filter
  window.filterGallery = function(cat, btn) {
    document.querySelectorAll('.gallery-filter-btn').forEach(b => {
      b.style.background = 'transparent';
      b.style.color = 'var(--accent-dark)';
      b.style.borderColor = 'var(--primary)';
      b.style.fontWeight = '600';
    });
    if (btn) {
      btn.style.background = 'var(--accent)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--accent)';
      btn.style.fontWeight = '700';
    }
    const items = window._galleryItems || [];
    if (cat === 'all') renderGalleryGrid(items);
    else renderGalleryGrid(items.filter(i => i.category === cat));
  };

  // Lightbox for public gallery
  window.openGalleryLightbox = function(url, caption) {
    let lb = document.getElementById('gallery-lightbox');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'gallery-lightbox';
      lb.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:20px;cursor:pointer';
      lb.onclick = () => lb.remove();
      document.body.appendChild(lb);
    }
    lb.innerHTML = `
      <button onclick="this.parentElement.remove()" style="position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;font-size:1.8rem;cursor:pointer"><i class="fas fa-times"></i></button>
      <img src="${url}" alt="${pur(caption)}" style="max-width:90vw;max-height:80vh;border-radius:10px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,.5)">
      ${caption ? `<p style="color:rgba(255,255,255,.8);margin-top:14px;font-size:14px;text-align:center">${pur(caption)}</p>` : ''}`;
    lb.style.display = 'flex';
  };

  // ================================================================
  //  ADMIN — Admissions management (Approve & Assign Class)
  // ================================================================
  let _pendingApproveId   = null;
  let _pendingApproveData = null;

  window.loadAdmissions = async function() {
    const tbody = document.getElementById('admin-admissions-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    const filter = document.getElementById('adm-filter-status')?.value || 'all';
    try {
      let q = filter === 'all'
        ? query(collection(db,'admissions'), limit(60))
        : query(collection(db,'admissions'), where('status','==',filter), limit(60));
      const snap = await getDocs(q);
      if (snap.empty) { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No applications found.</td></tr>'; return; }
      const sorted = [...snap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      tbody.innerHTML = sorted.map(d => {
        const a = d.data();
        const bc = a.status==='Admitted'?'badge-success':a.status==='Rejected'?'badge-danger':a.status==='Shortlisted'?'badge-warning':'badge-info';
        const fmt = a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—';
        return `<tr>
          <td><strong>${a.studentName}</strong></td>
          <td>${a.class||'—'}</td>
          <td style="font-size:12px">${a.dob||'—'}</td>
          <td>${a.parentName||'—'}</td>
          <td style="font-size:12px">${a.contact||'—'}</td>
          <td style="font-size:12px">${fmt}</td>
          <td><span class="badge ${bc}">${a.status}</span></td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn-sm" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;white-space:nowrap" onclick="adminViewAdmission('${d.id}')"><i class="fas fa-edit"></i> View/Edit</button>
              <button class="btn btn-sm" style="background:#475569;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;white-space:nowrap" onclick="adminPrintAdmission('${d.id}')"><i class="fas fa-print"></i> Print</button>
              ${(a.status!=='Admitted' && a.status!=='Rejected')?`<button class="btn btn-sm" style="background:#1a6b3c;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;white-space:nowrap" onclick="openApproveModal('${d.id}','${(a.studentName||'').replace(/'/g,"\\'")}','${a.class||''}')"><i class="fas fa-check"></i> Approve</button>`:''}
              ${a.status!=='Shortlisted'?`<button class="btn btn-sm" style="background:#1a4a8a;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px" onclick="updateAdmStatus('${d.id}','Shortlisted')">Shortlist</button>`:''}
              ${a.status!=='Rejected'?`<button class="btn btn-sm btn-danger" style="font-size:11px;padding:4px 8px" onclick="rejectAdmission('${d.id}','${(a.studentName||'').replace(/'/g,"\\'")}')"><i class="fas fa-times"></i> Reject</button>`:''}
            </div>
          </td>
        </tr>`;
      }).join('');
      // Cache all admission data so Print can fire synchronously (no popup blocking)
      window.__adminAdmCache = {};
      snap.docs.forEach(d => { window.__adminAdmCache[d.id] = d.data(); });
      const countEl = document.getElementById('a-admission-count');
      if (countEl) countEl.textContent = snap.docs.filter(d=>d.data().status==='Pending').length;
    } catch(e) { tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`; }
  };

  window.adminPrintAdmission = async function(docId) {
    if (!docId) { showToast('⚠️ Missing application id.'); return; }
    if (!window._printAdmissionPDF) { showToast('❌ Print module not loaded.'); return; }
    const cached = (window.__adminAdmCache || {})[docId];
    if (cached) { window._printAdmissionPDF(cached); return; }
    try {
      const snap = await getDoc(doc(db, 'admissions', docId));
      if (!snap.exists()) { showToast('❌ Application not found.'); return; }
      window._printAdmissionPDF(snap.data());
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.openApproveModal = async function(docId, name, requestedClass) {
    _pendingApproveId = docId;
    _pendingApproveData = { name, requestedClass };
    // Cache full admission data so the modal's Print button can reuse it
    try {
      const snap = await getDoc(doc(db, 'admissions', docId));
      if (snap.exists()) _pendingApproveData = { ...snap.data(), name, requestedClass };
    } catch(e) { console.warn('[Approve] fetch admission failed:', e.message); }
    const overlay = document.getElementById('approve-modal-overlay');
    const nameEl  = document.getElementById('approve-modal-name');
    const classEl = document.getElementById('approve-class-select');
    if (nameEl)  nameEl.textContent = `Approving application for: ${name}`;
    if (classEl && requestedClass) classEl.value = requestedClass;
    if (overlay) { overlay.style.display = 'flex'; }
  };

  window.printApproveModalAdmission = function() {
    if (!_pendingApproveData || !window._printAdmissionPDF) { showToast('⚠️ No application loaded.'); return; }
    window._printAdmissionPDF(_pendingApproveData);
  };

  window.closeApproveModal = function() {
    const overlay = document.getElementById('approve-modal-overlay');
    if (overlay) overlay.style.display = 'none';
    _pendingApproveId   = null;
    _pendingApproveData = null;
  };

  window.confirmApproveAdmission = async function() {
    if (!_pendingApproveId) return;
    const assignedClass   = document.getElementById('approve-class-select')?.value;
    const section         = document.getElementById('approve-section-select')?.value || 'A';
    const prefix          = (document.getElementById('approve-id-prefix')?.value || 'SFS').trim().toUpperCase();
    if (!assignedClass) { showToast('⚠️ Please select a class/section.'); return; }

    const btn = document.querySelector('#approve-modal-overlay .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

    try {
      // Fetch original admission doc
      const admDoc = await getDoc(doc(db,'admissions',_pendingApproveId));
      if (!admDoc.exists()) { showToast('❌ Application not found.'); return; }
      const adm = admDoc.data();

      // Generate student ID: SFS/YEAR/XXXX
      const year = new Date().getFullYear();
      const countSnap = await getDocs(query(collection(db,'students'), where('class','==',assignedClass)));
      const rollNo = String(countSnap.size + 1).padStart(4,'0');
      const studentId = `${prefix}/${year}/${rollNo}`;

      // Create student record in 'students' collection
      const father = adm.father || {};
      const mother = adm.mother || {};
      await addDoc(collection(db,'students'), {
        name:           adm.studentName || adm.fullName || '',
        dob:            adm.dob || '',
        gender:         adm.gender || '',
        class:          assignedClass,
        classId:        assignedClass,
        section:        section,
        rollNo:         rollNo,
        studentId:      studentId,
        // Primary contact (kept for backward compatibility)
        parentName:     adm.parentName || '',
        contact:        adm.contact || '',
        email:          adm.email || '',
        // Father details
        fatherName:        father.name || '',
        fatherOccupation:  father.occupation || '',
        fatherContact:     father.contact || '',
        // Mother details
        motherName:        mother.name || '',
        motherOccupation:  mother.occupation || '',
        motherContact:     mother.contact || '',
        address:        adm.address || '',
        previousSchool: adm.previousSchool || '',
        medical:        adm.medical || '',
        documents:      adm.documents || [],
        admissionYear:  year,
        status:         'Active',
        admissionDocId: _pendingApproveId,
        createdAt:      new Date().toISOString()
      });

      // Update admission status to Admitted
      await updateDoc(doc(db,'admissions',_pendingApproveId), {
        status:          'Admitted',
        assignedClass:   assignedClass,
        classId:         assignedClass,
        assignedSection: section,
        studentId,
        updatedAt:       new Date().toISOString()
      });

      showToast(`✅ Admitted! Student ID: ${studentId} — Class ${assignedClass}-${section}`);
      closeApproveModal();
      loadAdmissions();
    } catch(e) {
      showToast('❌ Approval failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirm Approval'; }
    }
  };

  window.rejectAdmission = async function(docId, name) {
    if (!confirm(`Reject application for ${name}?`)) return;
    try {
      await updateDoc(doc(db,'admissions',docId), { status:'Rejected', updatedAt: new Date().toISOString() });
      showToast('🗑️ Application rejected.');
      loadAdmissions();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.updateAdmStatus = async function(docId, status) {
    try {
      await updateDoc(doc(db,'admissions',docId), { status, updatedAt: new Date().toISOString() });
      showToast('✅ Status updated to ' + status);
      loadAdmissions();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window._aaeCurrentId = null;

  window.adminViewAdmission = function(docId) {
    const a = (window.__adminAdmCache || {})[docId];
    if (!a) { showToast('⚠️ Application data not in cache. Reload the list first.'); return; }
    window._aaeCurrentId = docId;
    const sv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    sv('aae-name',       a.fullName);
    sv('aae-class',      a.classApplied);
    sv('aae-dob',        a.dob);
    sv('aae-gender',     a.gender);
    sv('aae-year',       a.year);
    sv('aae-prevschool', a.previousSchool);
    sv('aae-address',    a.address);
    sv('aae-medical',    a.medical);
    sv('aae-parent',     a.parentName);
    sv('aae-relation',   a.relation);
    sv('aae-contact',    a.contact);
    sv('aae-email',      a.email);
    const f = a.father || {}, m = a.mother || {};
    sv('aae-father-name', f.name); sv('aae-father-occ', f.occupation); sv('aae-father-tel', f.contact);
    sv('aae-mother-name', m.name); sv('aae-mother-occ', m.occupation); sv('aae-mother-tel', m.contact);
    const docsEl = document.getElementById('aae-docs');
    const docs = a.documents || [];
    docsEl.innerHTML = docs.length
      ? docs.map(d=>`<a href="${d.url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--glass-bg);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--primary);text-decoration:none"><i class="fas fa-file"></i>${d.name}</a>`).join('')
      : '<span style="color:var(--text-light);font-size:13px">No documents attached.</span>';
    const approveBtn = document.getElementById('aae-approve-btn');
    if (approveBtn) approveBtn.style.display = a.status === 'forwarded_to_admin' ? 'inline-flex' : 'none';
    const overlay = document.getElementById('admin-adm-edit-overlay');
    overlay.style.display = 'block';
    overlay.scrollTop = 0;
  };

  window.closeAdminAdmEdit = function() {
    document.getElementById('admin-adm-edit-overlay').style.display = 'none';
    window._aaeCurrentId = null;
  };

  window.triggerAdminApproval = function() {
    const docId = window._aaeCurrentId;
    const a = (window.__adminAdmCache || {})[docId];
    if (!docId || !a) return;
    closeAdminAdmEdit();
    window.openApproveModal(docId, a.fullName || a.studentName || '', a.classApplied || a.class || '');
  };

  window.adminSaveAdmissionChanges = async function() {
    const docId = window._aaeCurrentId;
    if (!docId) { showToast('⚠️ No application selected.'); return; }
    const gv = id => (document.getElementById(id) || {}).value?.trim() || '';
    const payload = {
      fullName: gv('aae-name'), classApplied: gv('aae-class'),
      dob: gv('aae-dob'), gender: gv('aae-gender'),
      year: gv('aae-year'), previousSchool: gv('aae-prevschool'),
      address: gv('aae-address'), medical: gv('aae-medical'),
      parentName: gv('aae-parent'), relation: gv('aae-relation'),
      contact: gv('aae-contact'), email: gv('aae-email'),
      father: { name: gv('aae-father-name'), occupation: gv('aae-father-occ'), contact: gv('aae-father-tel') },
      mother: { name: gv('aae-mother-name'), occupation: gv('aae-mother-occ'), contact: gv('aae-mother-tel') },
      updatedAt: new Date().toISOString(),
    };
    try {
      await updateDoc(doc(db,'admissions',docId), payload);
      if (window.__adminAdmCache) window.__adminAdmCache[docId] = { ...window.__adminAdmCache[docId], ...payload };
      showToast('✅ Application updated.');
    } catch(e) { showToast('❌ ' + e.message); }
  };

  // ================================================================
  //  ADMIN — Homepage Content Manager
  // ================================================================
  window.loadHomepageContent = async function() {
    try {
      const snap = await getDocs(collection(db,'settings'));
      const map = {};
      snap.docs.forEach(d => { map[d.data().key] = d.data().value; });
      if (map.about)         { const el = document.getElementById('hp-about');       if (el) el.value = map.about; }
      if (map.mission)       { const el = document.getElementById('hp-mission');     if (el) el.value = map.mission; }
      if (map.vision)        { const el = document.getElementById('hp-vision');      if (el) el.value = map.vision; }
      if (map.parentsNote)   { const el = document.getElementById('hp-parents');     if (el) el.value = map.parentsNote; }
      if (map.admissionLink) { const el = document.getElementById('hp-apply-link'); if (el) el.value = map.admissionLink; }
      showToast('✅ Content loaded from database.');
    } catch(e) { showToast('❌ Load failed: ' + e.message); }
  };

  async function upsertSetting(key, value) {
    const snap = await getDocs(query(collection(db,'settings'), where('key','==',key)));
    if (!snap.empty) {
      await updateDoc(doc(db,'settings',snap.docs[0].id), { value, updatedAt: new Date().toISOString() });
    } else {
      await addDoc(collection(db,'settings'), { key, value, updatedAt: new Date().toISOString() });
    }
  }

  // ================================================================
  //  ADMIN — Website Management (Hero, Stats, Announcement, Cards)
  //  Single source of truth: Firestore public_settings/homepage
  // ================================================================
  const WM_MAX_CARDS = 8;

  function _renderFeatureCardRow(card, idx) {
    const safe = v => (v == null ? '' : String(v).replace(/"/g, '&quot;'));
    return `<div class="card wm-card-row" style="padding:14px;background:var(--bg);border:1px solid var(--border)" data-idx="${idx}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px">
        <strong style="font-size:13px;color:var(--accent-dark)"><i class="fas fa-grip-vertical" style="color:var(--text-light);margin-right:6px"></i>Card ${idx + 1}</strong>
        <button class="btn btn-sm btn-danger" type="button" onclick="removeFeatureCardRow(${idx})" style="padding:4px 10px;font-size:11px"><i class="fas fa-trash"></i> Remove</button>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Title</label>
          <input type="text" class="wm-card-title" value="${safe(card.title)}" placeholder="e.g. Academic Excellence">
        </div>
        <div class="form-group">
          <label>Icon (FontAwesome class, optional)</label>
          <input type="text" class="wm-card-icon" value="${safe(card.icon)}" placeholder="e.g. fa-graduation-cap">
        </div>
      </div>
      <div class="form-group">
        <label>Description</label>
        <textarea class="wm-card-desc" rows="2" placeholder="Short description of this tradition..." style="resize:vertical">${safe(card.description)}</textarea>
      </div>
    </div>`;
  }

  function _refreshFeatureCardsUI(cards) {
    const list  = document.getElementById('wm-feature-cards-list');
    const empty = document.getElementById('wm-feature-empty');
    if (!list) return;
    if (!cards.length) {
      list.innerHTML = `<div style="font-size:13px;color:var(--text-light);text-align:center;padding:18px;border:1px dashed var(--border);border-radius:10px" id="wm-feature-empty">No cards yet. Click <strong>+ Add Card</strong> to create one.</div>`;
      return;
    }
    list.innerHTML = cards.map((c, i) => _renderFeatureCardRow(c, i)).join('');
  }

  // Cards live in window state; UI is always built from this array
  window._wmFeatureCards = [];

  function _captureFeatureCardsFromUI() {
    const rows = document.querySelectorAll('#wm-feature-cards-list .wm-card-row');
    const cards = [];
    rows.forEach(row => {
      const title = row.querySelector('.wm-card-title')?.value.trim() || '';
      const icon  = row.querySelector('.wm-card-icon')?.value.trim()  || '';
      const desc  = row.querySelector('.wm-card-desc')?.value.trim()  || '';
      if (title || desc) cards.push({ title, icon, description: desc });
    });
    return cards;
  }

  window.addFeatureCardRow = function() {
    window._wmFeatureCards = _captureFeatureCardsFromUI();
    if (window._wmFeatureCards.length >= WM_MAX_CARDS) {
      showToast(`⚠️ Maximum of ${WM_MAX_CARDS} cards.`);
      return;
    }
    window._wmFeatureCards.push({ title: '', icon: '', description: '' });
    _refreshFeatureCardsUI(window._wmFeatureCards);
  };

  window.removeFeatureCardRow = function(idx) {
    window._wmFeatureCards = _captureFeatureCardsFromUI();
    window._wmFeatureCards.splice(idx, 1);
    _refreshFeatureCardsUI(window._wmFeatureCards);
  };

  window.loadWebsiteContent = async function() {
    try {
      const snap = await getDoc(doc(db, 'public_settings', 'homepage'));
      const data = snap.exists() ? snap.data() : {};
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = (v == null ? '' : v); };

      // Hero
      set('wm-hero-headline', data.hero?.headline);
      set('wm-hero-sub',      data.hero?.subheadline);

      // Stats (4 slots)
      const stats = Array.isArray(data.stats) ? data.stats : [];
      for (let i = 1; i <= 4; i++) {
        const s = stats[i - 1] || {};
        set(`wm-stat${i}-label`, s.label);
        set(`wm-stat${i}-value`, s.value);
      }

      // Announcement
      set('wm-ann-text', data.announcement?.text);
      set('wm-ann-tag',  data.announcement?.tag);
      set('wm-ann-date', data.announcement?.date);

      // Feature cards
      window._wmFeatureCards = Array.isArray(data.featureCards) ? data.featureCards : [];
      _refreshFeatureCardsUI(window._wmFeatureCards);

      if (snap.exists()) showToast('✅ Website content loaded.');
    } catch(e) {
      console.error('[WebsiteCMS] load failed', e);
      showToast('❌ Load failed: ' + e.message);
    }
  };

  window.saveWebsiteContent = async function() {
    const get = id => (document.getElementById(id)?.value || '').trim();
    const num = id => {
      const n = parseInt(document.getElementById(id)?.value, 10);
      return Number.isFinite(n) ? n : 0;
    };

    const payload = {
      hero: {
        headline:    get('wm-hero-headline'),
        subheadline: get('wm-hero-sub')
      },
      stats: [
        { label: get('wm-stat1-label'), value: num('wm-stat1-value') },
        { label: get('wm-stat2-label'), value: num('wm-stat2-value') },
        { label: get('wm-stat3-label'), value: num('wm-stat3-value') },
        { label: get('wm-stat4-label'), value: num('wm-stat4-value') }
      ].filter(s => s.label || s.value),
      announcement: {
        text: get('wm-ann-text'),
        tag:  get('wm-ann-tag').toUpperCase(),
        date: get('wm-ann-date')
      },
      featureCards: _captureFeatureCardsFromUI(),
      updatedAt: new Date().toISOString()
    };

    const btn = document.getElementById('wm-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
    try {
      await setDoc(doc(db, 'public_settings', 'homepage'), payload, { merge: true });
      showToast('✅ Website content saved — homepage will refresh on next visit.');
    } catch(e) {
      console.error('[WebsiteCMS] save failed', e);
      showToast('❌ Save failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> Save Website Changes'; }
    }
  };

  window.saveHomepageContent = async function() {
    const about      = (document.getElementById('hp-about')?.value      || '').trim();
    const mission    = (document.getElementById('hp-mission')?.value    || '').trim();
    const vision     = (document.getElementById('hp-vision')?.value     || '').trim();
    const parents    = (document.getElementById('hp-parents')?.value    || '').trim();
    const applyLink  = (document.getElementById('hp-apply-link')?.value || '').trim();
    const btn = document.querySelector('#a-homepage .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }
    try {
      const promises = [];
      if (about)     promises.push(upsertSetting('about',      about));
      if (mission)   promises.push(upsertSetting('mission',    mission));
      if (vision)    promises.push(upsertSetting('vision',     vision));
      if (parents)   promises.push(upsertSetting('parentsNote', parents));
      promises.push(upsertSetting('admissionLink', applyLink));
      await Promise.all(promises);
      // Refresh the live site sections
      loadDynamicHomepageContent();
      showToast('✅ Homepage content saved and updated live!');
    } catch(e) { showToast('❌ Save failed: ' + e.message); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save All Changes'; } }
  };

  // Load dynamic homepage sections from Firestore
  async function loadDynamicHomepageContent() {
    try {
      const keys = ['about','mission','vision','parentsNote'];
      const snap = await getDocs(collection(db,'settings'));
      const map = {};
      snap.docs.forEach(d => { if (keys.includes(d.data().key)) map[d.data().key] = d.data().value; });
      const aboutEl = document.getElementById('dynamic-about-text');
      if (aboutEl && map.about) aboutEl.innerHTML = pur(map.about);
      const missionEl = document.getElementById('dynamic-mission-text');
      if (missionEl && map.mission) missionEl.innerHTML = pur(map.mission);
      const visionEl = document.getElementById('dynamic-vision-text');
      if (visionEl && map.vision) visionEl.innerHTML = pur(map.vision);
      const parentsEl = document.getElementById('dynamic-parents-note');
      if (parentsEl && map.parentsNote) parentsEl.innerHTML = pur(map.parentsNote);
    } catch(e) { /* use static fallback */ }
  }

  window.saveAdmissionNotice = async function() {
    const notice = (document.getElementById('adm-public-notice')?.value || '').trim();
    try {
      const snap = await getDocs(query(collection(db,'settings'), where('key','==','admissionNotice')));
      if (!snap.empty) {
        await setDoc(doc(db,'settings',snap.docs[0].id), { key:'admissionNotice', value:notice, updatedAt:new Date().toISOString() }, {merge:true});
      } else {
        await addDoc(collection(db,'settings'), { key:'admissionNotice', value:notice, updatedAt:new Date().toISOString() });
      }
      showToast('✅ Public notice updated!');
    } catch(e) { showToast('❌ ' + e.message); }
  };

  // ================================================================
  //  ADMIN — Contacts management
  // ================================================================
  async function loadAdminContacts() {
    const tbody = document.getElementById('admin-contacts-tbody');
    if (!tbody) return;
    try {
      const snap = await getDocs(query(collection(db,'contacts'), limit(30)));
      if (snap.empty) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-light)">No messages yet.</td></tr>'; return; }
      const sorted = [...snap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      tbody.innerHTML = sorted.map(d => {
        const c = d.data();
        const fmt = c.createdAt ? new Date(c.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '—';
        const bc = c.status==='Replied'?'badge-success':'badge-warning';
        return `<tr>
          <td><strong>${pur(c.name||'—')}</strong><br><span style="font-size:11px;color:var(--text-light)">${pur(c.email||'')}</span></td>
          <td style="font-size:13px">${pur(c.subject||'—')}</td>
          <td style="font-size:12px;color:var(--text-light);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pur(c.message||'—')}</td>
          <td style="font-size:12px">${fmt}</td>
          <td><span class="badge ${bc}">${c.status||'Unread'}</span></td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="markContactReplied('${d.id}')"><i class="fas fa-check"></i> Replied</button>
          </td>
        </tr>`;
      }).join('');
    } catch(e) { tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);text-align:center">❌ ${e.message}</td></tr>`; }
  }

  window.markContactReplied = async function(docId) {
    try {
      await setDoc(doc(db,'contacts',docId), { status:'Replied', updatedAt:new Date().toISOString() }, { merge:true });
      showToast('✅ Marked as replied.');
      loadAdminContacts();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  // ================================================================
  //  AUTO-LOAD HOOKS — showDash patches
  // ================================================================
  const _origShowDash = window.showDash;
  window.showDash = function(prefix, sectionId, btn) {
    _origShowDash(prefix, sectionId, btn);
    if (prefix === 's' && window.syncStudentBottomNav) window.syncStudentBottomNav(sectionId);
    // Admin section auto-loaders
    if (sectionId === 'a-events')        loadAdminEvents();
    if (sectionId === 'a-announcements') loadAdminAnnouncements();
    if (sectionId === 'a-why-choose')    loadAdminWhyChooseUs();
    if (sectionId === 'a-quotes')        loadAdminQuotes();
    if (sectionId === 'a-house-points')  loadAdminHousePoints();
    if (sectionId === 'a-leaders')       loadAdminLeaders();
    if (sectionId === 'a-gallery')       loadAdminGallery();
    if (sectionId === 'a-homepage')      { loadHomepageContent(); }
    if (sectionId === 'a-website-mgmt')  { loadWebsiteContent(); }
    if (sectionId === 'a-admissions')    { loadAdmissions(); loadAdmissionNotice(); }
    if (sectionId === 'a-contacts')      loadAdminContacts();
    if (sectionId === 'a-holidays')      loadHolidays();
    if (sectionId === 'a-leave')         { if(window.loadLeaveQuota) loadLeaveQuota(); if(window.loadAdminLeave) loadAdminLeave(); }
    if (sectionId === 'a-teachers')      { if(window.seedTeachersIfNeeded) window.seedTeachersIfNeeded().then(()=>{ if(window.loadTeachers) window.loadTeachers(); }); }
    if (sectionId === 'a-dashboard')     { if(window.loadAdminDashboardStats) window.loadAdminDashboardStats(); }
    if (sectionId === 't-attendance') {
      window._attInitialized = false;
      if (window._currentTeacherClass) {
        window._attInitialized = true;
        if(window.initTeacherAttendance) initTeacherAttendance(window._currentTeacherClass);
      }
    }
    if (sectionId === 't-homework') {
      const hwDue = document.getElementById('hw-due');
      if (hwDue) hwDue.min = new Date().toISOString().split('T')[0];
      if(window.populateHwClassSelect) populateHwClassSelect();
      if(window.loadTeacherHomework) loadTeacherHomework();
    }
    if (sectionId === 's-attendance') { if(window.loadStudentAttendance) loadStudentAttendance(); }
    if (sectionId === 's-routine')    { if(window.loadStudentRoutine) loadStudentRoutine(); }
    if (sectionId === 't-schedule')   { if(window.loadTeacherSchedule) loadTeacherSchedule(); }
    if (sectionId === 's-dashboard')  { if(window.loadStudentDashWidgets) loadStudentDashWidgets(); }
    if (sectionId === 't-dashboard')  { if(window.loadTeacherDashWidgets) loadTeacherDashWidgets(); }
    if (sectionId === 's-homework') { if(window.loadStudentHomework) loadStudentHomework(); }
    else if(window._hwUnsubscribe){window._hwUnsubscribe();window._hwUnsubscribe=null;}
    if (sectionId === 's-notices')  { if(window.loadStudentNotices) loadStudentNotices(); }
    if (sectionId === 's-fees')     { if(window.loadStudentFees) loadStudentFees(); }
    if (sectionId === 't-notices')  { if(window.loadTeacherNotices) loadTeacherNotices(); }
    if (sectionId === 't-leave')    { if(window.loadLeaveHistory) window.loadLeaveHistory(); }
    if (sectionId === 't-profile')  { if(window.loadTeacherProfile) loadTeacherProfile(); }
    if (sectionId === 'a-leave')    { if(window.loadLeaveQuota) loadLeaveQuota(); if(window.loadAdminLeave) loadAdminLeave(); }
    if (sectionId === 'a-notices')     { if(window.loadAdminNotices) loadAdminNotices(); }
    if (sectionId === 'a-fees')        { if(window.loadAdminFees) loadAdminFees(); }
    if (sectionId === 'a-monthly-att')    { if(window.loadAdminMonthlyAtt) loadAdminMonthlyAtt(); if(window.loadAcademicSessions) loadAcademicSessions(); }
    // Office section auto-loaders (consolidated from Blocks 5, 7, 8)
    if (sectionId === 'o-fee-structure')    { if(window.officeStaffLoadFeeStructure)  officeStaffLoadFeeStructure();  }
    if (sectionId === 'a-fee-structure')    { if(window.loadAdminFeeStructure)         loadAdminFeeStructure();         }
    if (sectionId === 'a-fee-transactions') { if(window.loadAdminFeeTransactions)      loadAdminFeeTransactions();      }
    if (sectionId === 'o-fee-approvals')    { if(window.loadAdminFeeTransactions)      loadAdminFeeTransactions();      }
    if (sectionId === 'o-dues')             { if(window.loadDuesList)                  loadDuesList();                  }
    if (sectionId === 'o-dashboard')        { if(window.loadOfficeDashboardStats)       loadOfficeDashboardStats();       }
    if (sectionId === 'o-reports')          { if(window.loadOfficeReports)             loadOfficeReports();             }
    if (sectionId === 'o-admissions')       { if(window.loadOfficeAdmissions)          loadOfficeAdmissions();          }
    if (sectionId === 'o-profile')          { if(window.loadOfficeProfile)             loadOfficeProfile();             }
    if (sectionId === 'a-student-records') { if(window.loadStudentRecords)            window.loadStudentRecords();      }
    if (sectionId === 'a-family-mgmt') {
      const famInput = document.getElementById('fam-search-input');
      const famList  = document.getElementById('fam-search-results');
      if (famInput) famInput.value = '';
      if (famList)  famList.innerHTML = '<p style="color:var(--text-light);font-size:13px">Search to find students.</p>';
    }
    if (sectionId === 'o-fee-collection') {
      const pd = document.getElementById('pay-date');
      if (pd && !pd.value) pd.value = new Date().toISOString().split('T')[0];
    }
  };

  // ================================================================
  //  PAGE NAVIGATION HOOKS — load public data when pages open
  // ================================================================
  const _origShowPage = window.showPage;
  window.showPage = function(name) {
    _origShowPage(name);
    if (name === 'staff')   loadPublicStaff();
    if (name === 'notices') loadPublicNotices();
    if (name === 'events')  loadPublicEvents();
    if (name === 'gallery') loadPublicGallery();
    if (name === 'admission') loadAdmissionNotice();
  };

  // ================================================================
  //  BOOTSTRAP — run on load
  // ================================================================
  (async () => {
    loadHomeTicker();
    loadPublicEvents();
    loadAdmissionNotice();
    loadPublicGallery();
    loadDynamicHomepageContent();
    initAnnouncementsRealtime();
    initWhyChooseUsRealtime();
    initQuoteRealtime();
    initLeadersRealtime();
    // These require admin-level Firestore read — skip if a non-admin user is signed in
    const _authUnsub = auth.onAuthStateChanged(async u => {
      _authUnsub();
      if (!u) { loadHomeStats(); initHousePointsRealtime(); return; }
      try {
        const uDoc = await getDoc(doc(db,'users',u.uid));
        const role = uDoc.exists() ? (uDoc.data().role||'') : '';
        if (['admin','super_admin','teacher','office','office_staff'].includes(role)) {
          loadHomeStats(); initHousePointsRealtime();
        }
      } catch(e) { /* non-critical */ }
    });
  })();

  // ================================================================
  //  ANNOUNCEMENTS — real-time (onSnapshot) + admin CRUD
  // ================================================================
  function initAnnouncementsRealtime() {
    const threeDaysAgo = new Date(Date.now() - 3*24*60*60*1000).toISOString().split('T')[0];
    onSnapshot(query(collection(db,'announcements'), limit(30)), snap => {
      // Update ticker
      const ticker = document.getElementById('home-ticker-content');
      const grid   = document.getElementById('home-announcements-grid');
      if (snap.empty) {
        if (ticker) ticker.innerHTML = '<span>No announcements at this time.</span>';
        if (grid)   grid.innerHTML = '<p style="color:var(--text-light);font-size:14px;grid-column:1/-1">No announcements yet.</p>';
        return;
      }
      const items = [...snap.docs]
        .map(d => ({id:d.id,...d.data()}))
        .filter(a => !a.activeTo || a.activeTo >= new Date().toISOString().split('T')[0])
        .sort((a,b) => (b.priority==='High'?1:0)-(a.priority==='High'?1:0) || (b.date||'').localeCompare(a.date||''));

      // Ticker
      if (ticker) {
        ticker.innerHTML = items.map(a =>
          `<span>${a.isNew||a.date>=threeDaysAgo?'🔴 ':''}<strong>${pur(a.title||'')}</strong>${a.title&&a.message?' — ':''}${pur(a.message||a.text||'')}</span>`
        ).join('');
      }
      // Cards
      if (grid) {
        grid.innerHTML = items.map(a => {
          const isNew = a.isNew || (a.date && a.date >= threeDaysAgo);
          const fmt = a.date ? new Date(a.date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '';
          return `<div class="ann-card" style="${a.priority==='High'?'border-left-color:#e53e3e':''}">
            <div class="ann-card-title">
              ${a.priority==='High'?'<i class="fas fa-exclamation-circle" style="color:#e53e3e;font-size:14px"></i>':''}
              ${a.title||'Announcement'}
              ${isNew?'<span class="badge-new">NEW</span>':''}
            </div>
            <p class="ann-card-msg">${a.message||a.text||''}</p>
            ${fmt?`<div class="ann-card-date"><i class="fas fa-calendar-alt" style="margin-right:5px"></i>${fmt}</div>`:''}
          </div>`;
        }).join('');
      }
    }, e => { console.warn('Announcements snapshot:', e.message); });
  }

  window.saveAnnouncement = async function() {
    const editId = document.getElementById('ann-edit-id')?.value || '';
    const title  = (document.getElementById('ann-title')?.value   || '').trim();
    const msg    = (document.getElementById('ann-text')?.value    || '').trim();
    const date   = document.getElementById('ann-date')?.value     || new Date().toISOString().split('T')[0];
    const prio   = document.getElementById('ann-priority')?.value || 'Normal';
    const isNew  = document.getElementById('ann-isnew')?.checked  || false;
    if (!title || !msg) { showToast('⚠️ Title and message are required.'); return; }
    try {
      const data = { title, message:msg, text:`${title} — ${msg}`, date, priority:prio, isNew, updatedAt:new Date().toISOString() };
      if (editId) {
        await setDoc(doc(db,'announcements',editId), data, {merge:true});
        showToast('✅ Announcement updated!');
        cancelAnnEdit();
      } else {
        data.createdAt = new Date().toISOString();
        await addDoc(collection(db,'announcements'), data);
        showToast('✅ Announcement added!');
      }
      ['ann-title','ann-text','ann-date'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
      const ic=document.getElementById('ann-isnew'); if(ic) ic.checked=false;
      loadAdminAnnouncements();
    } catch(e) { showToast('❌ '+e.message); }
  };

  window.cancelAnnEdit = function() {
    document.getElementById('ann-edit-id').value='';
    document.getElementById('ann-form-mode').textContent='Add Announcement';
    document.getElementById('ann-cancel-edit').style.display='none';
    ['ann-title','ann-text','ann-date'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    const ic=document.getElementById('ann-isnew'); if(ic) ic.checked=false;
    document.getElementById('ann-priority').value='Normal';
  };

  window.editAnnouncement = function(id,title,msg,date,prio,isNew) {
    document.getElementById('ann-edit-id').value=id;
    document.getElementById('ann-title').value=title||'';
    document.getElementById('ann-text').value=msg||'';
    document.getElementById('ann-date').value=date||'';
    document.getElementById('ann-priority').value=prio||'Normal';
    const ic=document.getElementById('ann-isnew'); if(ic) ic.checked=!!isNew;
    document.getElementById('ann-form-mode').textContent='Edit Announcement';
    document.getElementById('ann-cancel-edit').style.display='';
    showDash('a','a-announcements');
  };

  window.loadAdminAnnouncements = async function() {
    const el=document.getElementById('admin-announcements-list');
    if(!el)return;
    el.innerHTML='<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
    try {
      const snap=await getDocs(query(collection(db,'announcements'),limit(40)));
      if(snap.empty){el.innerHTML='<p style="color:var(--text-light);font-size:13px">No announcements yet.</p>';return;}
      const sorted=[...snap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      el.innerHTML=sorted.map(d=>{
        const a=d.data(); const newBadge=a.isNew?'<span class="badge-new" style="animation:none;background:#e53e3e">NEW</span>':'';
        return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div style="flex:1"><div style="font-weight:700;font-size:13px;color:var(--accent-dark)">${a.title||'—'} ${newBadge}</div>
          <div style="font-size:12px;color:var(--text-light);margin-top:2px">${(a.message||a.text||'').slice(0,80)}${(a.message||a.text||'').length>80?'…':''}</div>
          <div style="font-size:11px;color:var(--text-light);margin-top:2px">${a.date||''} · <span style="font-weight:600">${a.priority||'Normal'}</span></div></div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button onclick="editAnnouncement('${d.id}','${(a.title||'').replace(/'/g,"\\'")}','${(a.message||a.text||'').replace(/'/g,"\\'")}','${a.date||''}','${a.priority||'Normal'}',${!!a.isNew})" style="background:none;border:none;color:var(--accent);cursor:pointer"><i class="fas fa-edit"></i></button>
            <button onclick="deleteAnnouncement('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button>
          </div></div>`;
      }).join('');
    } catch(e){el.innerHTML=isPermissionError(e)?permissionErrorHtml('announcements'):`<p style="color:var(--danger)">❌ ${e.message}</p>`;}
  };

  window.deleteAnnouncement = async function(docId) {
    if(!confirm('Delete this announcement?'))return;
    try{await deleteDoc(doc(db,'announcements',docId));showToast('🗑️ Deleted.');loadAdminAnnouncements();}
    catch(e){showToast('❌ '+e.message);}
  };

  // ================================================================
  //  WHY CHOOSE US — real-time + admin CRUD
  // ================================================================
  function initWhyChooseUsRealtime() {
    onSnapshot(query(collection(db,'why_choose_us'), orderBy('order'), limit(12)), snap => {
      const grid = document.getElementById('why-choose-us-grid');
      if (!grid) return;
      const defaultItems = [
        {title:'Academic Excellence',description:"Consistent top results in board examinations with holistic curriculum designed to nurture each child's potential.",icon:'fas fa-graduation-cap'},
        {title:'Value-Based Education',description:'Rooted in Franciscan values of compassion, love, and service — we shape character alongside academics.',icon:'fas fa-heart'},
        {title:'Experienced Faculty',description:'Dedicated educators bringing passion and expertise to every classroom, ensuring quality learning for all students.',icon:'fas fa-users'},
        {title:'Sports & Activities',description:'State-level athletes, cultural programs, and 20+ clubs ensure well-rounded development for every student.',icon:'fas fa-running'},
        {title:'Modern Infrastructure',description:'Smart classrooms, a well-stocked library, computer labs, and science labs equipped with modern tools.',icon:'fas fa-laptop'},
        {title:'Safe Environment',description:'CCTV-equipped campus, trained security personnel, and a strict anti-bullying policy ensuring student safety.',icon:'fas fa-shield-alt'},
      ];
      const items = snap.empty ? defaultItems : [...snap.docs].map(d=>d.data());
      grid.innerHTML = items.map(it =>
        `<div class="feature-card" style="cursor:default;transition:transform .2s,box-shadow .2s" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform=''">
          <div class="feature-icon"><i class="${it.icon||'fas fa-star'}"></i></div>
          <h3>${it.title}</h3>
          <p>${it.description}</p>
        </div>`
      ).join('');
    }, e => { console.warn('WhyChooseUs:', e.message); });
  }

  window.saveWhyChooseUs = async function() {
    const editId = document.getElementById('why-edit-id')?.value||'';
    const title  = (document.getElementById('why-title')?.value||'').trim();
    const desc   = (document.getElementById('why-desc')?.value||'').trim();
    const icon   = (document.getElementById('why-icon')?.value||'fas fa-star').trim();
    const order  = parseInt(document.getElementById('why-order')?.value||'99')||99;
    if(!title||!desc){showToast('⚠️ Title and description required.');return;}
    try {
      const data={title,description:desc,icon,order,updatedAt:new Date().toISOString()};
      if(editId){await setDoc(doc(db,'why_choose_us',editId),data,{merge:true});showToast('✅ Updated!');cancelWhyEdit();}
      else{data.createdAt=new Date().toISOString();await addDoc(collection(db,'why_choose_us'),data);showToast('✅ Added!');}
      ['why-title','why-desc','why-icon','why-order'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
      loadAdminWhyChooseUs();
    }catch(e){showToast('❌ '+e.message);}
  };
  window.cancelWhyEdit=function(){document.getElementById('why-edit-id').value='';document.getElementById('why-form-mode').textContent='Add Reason';document.getElementById('why-cancel-edit').style.display='none';['why-title','why-desc','why-icon','why-order'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});};
  window.editWhyItem=function(id,title,desc,icon,order){document.getElementById('why-edit-id').value=id;document.getElementById('why-title').value=title||'';document.getElementById('why-desc').value=desc||'';document.getElementById('why-icon').value=icon||'';document.getElementById('why-order').value=order||'';document.getElementById('why-form-mode').textContent='Edit Reason';document.getElementById('why-cancel-edit').style.display='';showDash('a','a-why-choose');};
  window.loadAdminWhyChooseUs=async function(){const el=document.getElementById('admin-why-list');if(!el)return;el.innerHTML='<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';try{const snap=await getDocs(query(collection(db,'why_choose_us'),orderBy('order'),limit(20)));if(snap.empty){el.innerHTML='<p style="color:var(--text-light);font-size:13px">No items yet. Add one to override the defaults.</p>';return;}el.innerHTML=snap.docs.map(d=>{const it=d.data();return`<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:center;gap:8px"><div><div style="font-weight:700;font-size:13px;color:var(--accent-dark)">${it.title}</div><div style="font-size:12px;color:var(--text-light)">${(it.description||'').slice(0,60)}…</div></div><div style="display:flex;gap:6px"><button onclick="editWhyItem('${d.id}','${(it.title||'').replace(/'/g,"\\'")}','${(it.description||'').replace(/'/g,"\\'")}','${it.icon||''}','${it.order||''}')" style="background:none;border:none;color:var(--accent);cursor:pointer"><i class="fas fa-edit"></i></button><button onclick="deleteWhyItem('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button></div></div>`;}).join('');}catch(e){el.innerHTML=`<p style="color:var(--danger)">❌ ${e.message}</p>`;}};
  window.deleteWhyItem=async function(docId){if(!confirm('Delete?'))return;try{await deleteDoc(doc(db,'why_choose_us',docId));showToast('🗑️ Deleted.');loadAdminWhyChooseUs();}catch(e){showToast('❌ '+e.message);}};

  // ================================================================
  //  QUOTE OF THE DAY — real-time + admin CRUD
  // ================================================================
  function initQuoteRealtime() {
    onSnapshot(query(collection(db,'quotes'), orderBy('date','desc'), limit(30)), snap => {
      if (snap.empty) {
        setQuoteDisplay("Everything by love and not by force.", "St. Francis De Sales", "");
        return;
      }
      const today = new Date().toISOString().split('T')[0];
      const items = [...snap.docs].map(d=>d.data());
      // Pick quote for today by day-of-year modulo
      const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(),0,0)) / 86400000);
      const quote = items[dayOfYear % items.length];
      setQuoteDisplay(quote.quote, quote.author, quote.date);
    }, e => {
      setQuoteDisplay("Everything by love and not by force.", "St. Francis De Sales", "");
    });
  }

  function setQuoteDisplay(text, author, date) {
    const qt = document.getElementById('home-quote-text');
    const qa = document.getElementById('home-quote-author');
    const qd = document.getElementById('home-quote-date');
    if (qt) qt.innerHTML = text ? `"${text}"` : '';
    if (qa) qa.textContent = author ? `— ${author}` : '';
    if (qd) qd.textContent = date ? new Date(date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'}) : '';
  }

  window.saveQuote=async function(){const editId=document.getElementById('quote-edit-id')?.value||'';const qt=(document.getElementById('quote-text')?.value||'').trim();const au=(document.getElementById('quote-author')?.value||'').trim();const dt=document.getElementById('quote-date')?.value||new Date().toISOString().split('T')[0];if(!qt||!au){showToast('⚠️ Quote and author required.');return;}try{const data={quote:qt,author:au,date:dt,updatedAt:new Date().toISOString()};if(editId){await setDoc(doc(db,'quotes',editId),data,{merge:true});showToast('✅ Updated!');cancelQuoteEdit();}else{data.createdAt=new Date().toISOString();await addDoc(collection(db,'quotes'),data);showToast('✅ Added!');}['quote-text','quote-author','quote-date'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});loadAdminQuotes();}catch(e){showToast('❌ '+e.message);}};
  window.cancelQuoteEdit=function(){document.getElementById('quote-edit-id').value='';document.getElementById('quote-form-mode').textContent='Add Quote';document.getElementById('quote-cancel-edit').style.display='none';['quote-text','quote-author','quote-date'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});};
  window.editQuote=function(id,qt,au,dt){document.getElementById('quote-edit-id').value=id;document.getElementById('quote-text').value=qt||'';document.getElementById('quote-author').value=au||'';document.getElementById('quote-date').value=dt||'';document.getElementById('quote-form-mode').textContent='Edit Quote';document.getElementById('quote-cancel-edit').style.display='';showDash('a','a-quotes');};
  window.loadAdminQuotes=async function(){const el=document.getElementById('admin-quotes-list');if(!el)return;el.innerHTML='<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';try{const snap=await getDocs(query(collection(db,'quotes'),orderBy('date','desc'),limit(30)));if(snap.empty){el.innerHTML='<p style="color:var(--text-light);font-size:13px">No quotes yet.</p>';return;}el.innerHTML=snap.docs.map(d=>{const q=d.data();return`<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div style="font-size:13px;color:var(--text);font-style:italic">"${(q.quote||'').slice(0,80)}${(q.quote||'').length>80?'…':''}"</div><div style="font-size:12px;color:var(--text-light);margin-top:2px">— ${q.author||'—'} · ${q.date||''}</div></div><div style="display:flex;gap:6px"><button onclick="editQuote('${d.id}','${(q.quote||'').replace(/'/g,"\\'")}','${(q.author||'').replace(/'/g,"\\'")}','${q.date||''}')" style="background:none;border:none;color:var(--accent);cursor:pointer"><i class="fas fa-edit"></i></button><button onclick="deleteQuote('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button></div></div>`;}).join('');}catch(e){el.innerHTML=`<p style="color:var(--danger)">❌ ${e.message}</p>`;}};
  window.deleteQuote=async function(docId){if(!confirm('Delete?'))return;try{await deleteDoc(doc(db,'quotes',docId));showToast('🗑️ Deleted.');loadAdminQuotes();}catch(e){showToast('❌ '+e.message);}};

  // ================================================================
  //  HOUSE POINTS — real-time + admin CRUD
  // ================================================================
  const HOUSE_COLORS = { Blue:'house-blue', Green:'house-green', Red:'house-red', Yellow:'house-yellow' };
  const HOUSE_EMOJI  = { Blue:'🔵', Green:'🟢', Red:'🔴', Yellow:'🟡' };

  function buildHouseMonthOptions() {
    const sel = document.getElementById('house-month');
    if (!sel) return;
    const now = new Date();
    const opts = [];
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const label = d.toLocaleString('default', {month:'long', year:'numeric'});
      opts.push(`<option value="${key}"${i===0?' selected':''}>${label}</option>`);
    }
    sel.innerHTML = opts.join('');
  }

  function initHousePointsRealtime() {
    buildHouseMonthOptions();
    onSnapshot(collection(db,'house_points'), snap => {
      const grid = document.getElementById('house-points-grid');
      if (!grid) return;
      if (snap.empty) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-light);font-size:14px">No house points data yet. Admin can add them in the portal.</p>';
        return;
      }
      const houseMap = {};
      snap.docs.forEach(d => {
        const data = d.data(); const name = data.houseName; if (!name) return;
        if (!houseMap[name] || (data.totalPoints||0) > (houseMap[name].totalPoints||0)) houseMap[name] = {id:d.id,...data};
      });
      const houses = Object.values(houseMap).sort((a,b) => (b.totalPoints||0) - (a.totalPoints||0));
      if (!houses.length) { grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-light);font-size:14px">No house points data yet.</p>'; return; }
      const ranks = ['🥇','🥈','🥉','4th'];
      grid.innerHTML = houses.map((h,i) => {
        const isLeader = i === 0;
        const cls = HOUSE_COLORS[h.houseName] || 'house-blue';
        const thisMonth = h.currentMonthPoints || h.monthlyPoints || 0;
        return `<div class="house-card ${cls}${isLeader?' leader':''}">
          ${isLeader?'<div class="house-crown">👑</div>':''}
          <div class="house-rank">${ranks[i]||''} ${i===0?'Leading!':''}</div>
          <div class="house-name">${HOUSE_EMOJI[h.houseName]||''} ${h.houseName} House</div>
          <div class="house-pts">${(h.totalPoints||0).toLocaleString()}</div>
          <div class="house-label">Total Points</div>
          ${thisMonth?`<div style="font-size:12px;opacity:.8;margin-top:6px">+${thisMonth} this month</div>`:''}
        </div>`;
      }).join('');
    }, e => { console.warn('House points:', e.message); });
  }

  window.loadMonthlyEntry = async function() {
    const name = document.getElementById('house-name')?.value || '';
    const monthKey = document.getElementById('house-month')?.value || '';
    const ptsEl = document.getElementById('house-monthly-pts');
    if (!name || !monthKey || !ptsEl) return;
    try {
      const snap = await getDoc(doc(db,'house_points',name,'monthly_entries',monthKey));
      ptsEl.value = snap.exists() ? (snap.data().points || 0) : 0;
    } catch(e) { ptsEl.value = 0; }
  };

  window.saveHousePoints = async function() {
    const name = document.getElementById('house-name')?.value || '';
    const monthKey = document.getElementById('house-month')?.value || '';
    const pts = parseInt(document.getElementById('house-monthly-pts')?.value || 0) || 0;
    if (!name || !monthKey) { showToast('⚠️ Select a house and month.'); return; }
    try {
      const [yr, mo] = monthKey.split('-').map(Number);
      const label = new Date(yr, mo-1, 1).toLocaleString('default', {month:'long', year:'numeric'});
      await setDoc(doc(db,'house_points',name,'monthly_entries',monthKey),
        {points:pts, label, year:yr, month:mo, monthKey, updatedAt:new Date().toISOString()}, {merge:true});
      const allEntries = await getDocs(collection(db,'house_points',name,'monthly_entries'));
      const total = allEntries.docs.reduce((sum,d) => sum+(d.data().points||0), 0);
      const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`;
      const curDoc = allEntries.docs.find(d => d.id === nowKey);
      const currentMonthPoints = curDoc ? (curDoc.data().points||0) : 0;
      await setDoc(doc(db,'house_points',name),
        {houseName:name, totalPoints:total, currentMonthPoints, updatedAt:new Date().toISOString()}, {merge:true});
      const dispEl = document.getElementById('house-total-display');
      if (dispEl) dispEl.innerHTML = `<i class="fas fa-calculator" style="margin-right:6px"></i><strong>${name} House total: ${total} pts</strong> (auto-summed)`;
      showToast(`✅ Saved! ${name} House total: ${total} pts`);
      loadAdminHousePoints();
    } catch(e) { showToast('❌ '+e.message); }
  };

  window.loadAdminHousePoints = async function() {
    const el = document.getElementById('admin-house-list'); if (!el) return;
    el.innerHTML = '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
    try {
      const snap = await getDocs(collection(db,'house_points'));
      if (snap.empty) { el.innerHTML = '<p style="color:var(--text-light);font-size:13px">No data yet.</p>'; return; }
      const houseMap = {};
      snap.docs.forEach(d => { const data=d.data(); if(!data.houseName) return; if(!houseMap[data.houseName]||(data.totalPoints||0)>(houseMap[data.houseName].totalPoints||0)) houseMap[data.houseName]={id:d.id,...data}; });
      const sorted = Object.values(houseMap).sort((a,b) => (b.totalPoints||0)-(a.totalPoints||0));
      const withMonthly = await Promise.all(sorted.map(async h => {
        try {
          const entries = await getDocs(collection(db,'house_points',h.houseName,'monthly_entries'));
          const monthly = [...entries.docs].map(d=>d.data()).sort((a,b)=>b.monthKey>a.monthKey?1:-1).slice(0,6);
          return {...h, monthly};
        } catch { return {...h, monthly:[]}; }
      }));
      el.innerHTML = withMonthly.map((h,i) => {
        const rank = ['🥇','🥈','🥉','4th'][i]||'';
        return `<div style="border:1px solid rgba(139,111,71,.15);border-radius:10px;padding:12px 14px;margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
            <strong style="font-size:14px">${rank} ${HOUSE_EMOJI[h.houseName]||''} ${h.houseName} House</strong>
            <span style="font-size:1.15rem;font-weight:800;color:var(--accent-dark)">${(h.totalPoints||0).toLocaleString()} pts</span>
          </div>
          ${h.monthly.length?`<div style="margin-top:8px;font-size:11px;color:var(--text-light);line-height:1.8">${h.monthly.map(m=>`<span style="display:inline-block;background:rgba(139,111,71,.1);border-radius:4px;padding:2px 7px;margin:2px;white-space:nowrap">${m.label}: <strong>${m.points}</strong></span>`).join('')}</div>`:'<p style="font-size:11px;color:var(--text-light);margin-top:6px">No monthly entries yet.</p>'}
        </div>`;
      }).join('');
    } catch(e) { el.innerHTML=`<p style="color:var(--danger)">❌ ${e.message}</p>`; }
  };

  // ================================================================
  //  SCHOOL LEADERS — real-time + admin CRUD + Cloudinary upload
  // ================================================================
  const ROLE_ORDER = {'School Prefect':1,'Vice Prefect':2,'Commander':3,'Blue House Captain':4,'Green House Captain':5,'Red House Captain':6,'Yellow House Captain':7,'Blue House Vice Captain':8,'Green House Vice Captain':9,'Red House Vice Captain':10,'Yellow House Vice Captain':11};
  const HOUSE_BADGE_STYLE = {Blue:'background:#dbeafe;color:#1e40af',Green:'background:#dcfce7;color:#14532d',Red:'background:#fee2e2;color:#991b1b',Yellow:'background:#fef3c7;color:#92400e'};

  function initLeadersRealtime() {
    onSnapshot(query(collection(db,'school_leaders'), limit(20)), snap => {
      const grid = document.getElementById('school-leaders-grid');
      if (!grid) return;
      if (snap.empty) {
        grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-light);font-size:14px">No school leaders added yet. Admin can add them in the portal.</p>';
        return;
      }
      const leaders = [...snap.docs]
        .map(d => ({id:d.id,...d.data()}))
        .sort((a,b) => (a.order||ROLE_ORDER[a.role]||99)-(b.order||ROLE_ORDER[b.role]||99));
      grid.innerHTML = leaders.map(l => {
        const initials = (l.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        const houseStyle = l.house ? (HOUSE_BADGE_STYLE[l.house]||'') : '';
        const portrait = l.imageUrl
          ? `<img src="${l.imageUrl}" alt="${l.name}" class="leader-portrait" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
            + `<div class="leader-avatar" style="display:none">${initials}</div>`
          : `<div class="leader-avatar">${initials}</div>`;
        return `<div class="leader-card">
          ${portrait}
          <div class="leader-name">${l.name||'—'}</div>
          <div class="leader-role">${l.role||'—'}</div>
          ${l.house?`<span class="leader-house-badge" style="${houseStyle}">${l.house} House</span>`:''}
        </div>`;
      }).join('');
    }, e => { console.warn('Leaders snapshot:', e.message); });
  }

  window.previewLeaderPhoto = function(input) {
    const file = input.files[0]; if (!file) return;
    const prev = document.getElementById('leader-photo-preview');
    if (!prev) return;
    const reader = new FileReader();
    reader.onload = e => { prev.innerHTML=`<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`; };
    reader.readAsDataURL(file);
  };

  window.saveLeader = async function() {
    const editId  = document.getElementById('leader-edit-id')?.value||'';
    const name    = (document.getElementById('leader-name')?.value||'').trim();
    const role    = document.getElementById('leader-role')?.value||'';
    const house   = document.getElementById('leader-house')?.value||'';
    const order   = parseInt(document.getElementById('leader-order')?.value||'')||ROLE_ORDER[role]||99;
    let imageUrl  = (document.getElementById('leader-image-url')?.value||'').trim();
    const file    = document.getElementById('leader-photo-file')?.files[0];
    if (!name||!role){showToast('⚠️ Name and role required.');return;}

    const btn=document.querySelector('#a-leaders .btn-primary');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving…';}
    try {
      // Upload photo via Cloudinary if file selected
      if (file && !imageUrl) {
        const {cloudName,preset}=getCloudinaryConfig();
        if(!cloudName||!preset){showToast('⚠️ Set up Cloudinary first (Gallery section).');return;}
        const pb=document.getElementById('leader-upload-progress');
        const bar=document.getElementById('leader-progress-bar');
        const pt=document.getElementById('leader-progress-text');
        if(pb)pb.style.display='block';
        const fd=new FormData(); fd.append('file',file); fd.append('upload_preset',preset); fd.append('folder','school_leaders');
        imageUrl=await new Promise((res,rej)=>{
          const xhr=new XMLHttpRequest();
          xhr.open('POST',`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
          xhr.upload.onprogress=e=>{if(e.lengthComputable){const p=Math.round(e.loaded/e.total*90)+5;if(bar)bar.style.width=p+'%';if(pt)pt.textContent=`Uploading… ${p}%`;}};
          xhr.onload=()=>{if(xhr.status===200){res(JSON.parse(xhr.responseText).secure_url);}else{rej(new Error('Upload failed'));}};
          xhr.onerror=()=>rej(new Error('Network error'));
          xhr.send(fd);
        });
        setTimeout(()=>{if(pb)pb.style.display='none';if(bar)bar.style.width='0%';},1000);
      }
      const data={name,role,house,order,imageUrl:imageUrl||'',updatedAt:new Date().toISOString()};
      if(editId){await setDoc(doc(db,'school_leaders',editId),data,{merge:true});showToast('✅ Leader updated!');cancelLeaderEdit();}
      else{data.createdAt=new Date().toISOString();await addDoc(collection(db,'school_leaders'),data);showToast('✅ Leader added!');}
      ['leader-name','leader-image-url','leader-order'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
      const fi=document.getElementById('leader-photo-file');if(fi)fi.value='';
      const pv=document.getElementById('leader-photo-preview');if(pv)pv.innerHTML='<i class="fas fa-user" style="color:var(--text-light)"></i>';
      loadAdminLeaders();
    }catch(e){showToast('❌ '+e.message);}
    finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-save"></i> Save Leader';}}
  };

  window.cancelLeaderEdit=function(){document.getElementById('leader-edit-id').value='';document.getElementById('leader-form-mode').textContent='Add Leader';document.getElementById('leader-cancel-edit').style.display='none';['leader-name','leader-image-url','leader-order'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});const fi=document.getElementById('leader-photo-file');if(fi)fi.value='';const pv=document.getElementById('leader-photo-preview');if(pv)pv.innerHTML='<i class="fas fa-user" style="color:var(--text-light)"></i>';};
  window.editLeader=function(id,name,role,house,order,imgUrl){document.getElementById('leader-edit-id').value=id;document.getElementById('leader-name').value=name||'';document.getElementById('leader-role').value=role||'';document.getElementById('leader-house').value=house||'';document.getElementById('leader-order').value=order||'';document.getElementById('leader-image-url').value=imgUrl||'';if(imgUrl){const pv=document.getElementById('leader-photo-preview');if(pv)pv.innerHTML=`<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;}document.getElementById('leader-form-mode').textContent='Edit Leader';document.getElementById('leader-cancel-edit').style.display='';showDash('a','a-leaders');};

  window.loadAdminLeaders=async function(){const el=document.getElementById('admin-leaders-list');if(!el)return;el.innerHTML='<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';try{const snap=await getDocs(query(collection(db,'school_leaders'),limit(30)));if(snap.empty){el.innerHTML='<p style="color:var(--text-light);font-size:13px">No leaders yet.</p>';return;}const sorted=[...snap.docs].map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order||ROLE_ORDER[a.role]||99)-(b.order||ROLE_ORDER[b.role]||99));el.innerHTML=sorted.map(l=>{const initials=(l.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();return`<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="display:flex;align-items:center;gap:10px">${l.imageUrl?`<img src="${l.imageUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--accent)" onerror="this.style.display='none'">`:`<div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--accent)">${initials}</div>`}<div><div style="font-weight:700;font-size:13px;color:var(--accent-dark)">${l.name||'—'}</div><div style="font-size:12px;color:var(--text-light)">${l.role||'—'}${l.house?' · '+l.house:''}</div></div></div><div style="display:flex;gap:6px;flex-shrink:0"><button onclick="editLeader('${l.id}','${(l.name||'').replace(/'/g,"\\'")}','${l.role||''}','${l.house||''}',${l.order||99},'${l.imageUrl||''}')" style="background:none;border:none;color:var(--accent);cursor:pointer"><i class="fas fa-edit"></i></button><button onclick="deleteLeader('${l.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button></div></div>`;}).join('');}catch(e){el.innerHTML=`<p style="color:var(--danger)">❌ ${e.message}</p>`;}};
  window.deleteLeader=async function(docId){if(!confirm('Delete this leader?'))return;try{await deleteDoc(doc(db,'school_leaders',docId));showToast('🗑️ Deleted.');loadAdminLeaders();}catch(e){showToast('❌ '+e.message);}};

  // ================================================================
  //  BOOTSTRAP — run on load
  // ================================================================
  (async () => {
    // Load homepage data in background without blocking UI
    loadHomeStats();
    loadHomeTicker();
    loadPublicEvents();
    loadAdmissionNotice();
    loadPublicGallery();
    loadDynamicHomepageContent();
  })();

  // ================================================================
  //  All the original Firebase functions preserved below:
  //  (student CRUD, teacher seed, attendance, homework, notices,
  //   fees, login creation — all identical to original index.html)
  // ================================================================

  window._currentClassFilter = 0;

  window.loadStudents = async function(classNum, filterBtn) {
    window._currentClassFilter = classNum;
    const tbody = document.getElementById('admin-student-tbody');
    const countEl = document.getElementById('student-count');
    if (!tbody) return;
    if (filterBtn) { document.querySelectorAll('.class-filter-btn').forEach(b => b.classList.remove('active-filter')); filterBtn.classList.add('active-filter'); }
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading students...</td></tr>`;
    try {
      let q = classNum === 0 ? query(collection(db,"students"), orderBy("rollNo")) : query(collection(db,"students"), where("class","==",String(classNum)), orderBy("rollNo"));
      const snap = await getDocs(q);
      window._loadedStudentDocs = snap.docs;
      countEl.textContent = `${snap.docs.length} student${snap.docs.length !== 1 ? 's' : ''} loaded`;
      if (snap.docs.length === 0) { tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-light)">No students found.</td></tr>`; return; }
      renderStudentRows(snap.docs);
    } catch (error) { countEl.textContent = 'Load failed'; tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:18px;color:#b91c1c">❌ ${error.message}</td></tr>`; }
  };

  function renderStudentRows(docs) {
    const tbody = document.getElementById('admin-student-tbody');
    const houseMap = { G:"🟢 Green", R:"🔴 Red", Y:"🟡 Yellow", B:"🔵 Blue" };
    const classLabel = { PLG:'Play Group', SKG:'SKG', LKG:'LKG' };
    tbody.innerHTML = docs.map(docSnap => {
      const s = docSnap.data(); const docId = docSnap.id;
      const cls = classLabel[s.class] || (s.class ? 'Class ' + s.class : '—');
      const gender = s.gender === 'M' ? 'Male' : s.gender === 'F' ? 'Female' : (s.gender || '—');
      return `<tr data-name="${(s.name||'').toLowerCase()}">
        <td><strong style="color:var(--accent)">${s.studentId||'—'}</strong></td>
        <td style="text-align:center">${s.rollNo||'—'}</td>
        <td>${s.name||'—'}</td>
        <td style="text-align:center">${cls}</td>
        <td style="text-align:center">${gender}</td>
        <td style="text-align:center"><span class="badge badge-info">${s.bloodGroup||'—'}</span></td>
        <td style="text-align:center">${s.house?(houseMap[s.house]||s.house):'—'}</td>
        <td style="font-size:12px">${s.whatsapp||'—'}</td>
        <td><div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline" title="View" onclick='viewStudentDetails(${JSON.stringify(s)})'><i class="fas fa-eye"></i></button>
          <button class="btn btn-sm btn-outline" title="Edit" onclick='editStudent("${docId}",${JSON.stringify(s)})'><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm" title="Login" onclick='openStudentLoginModal("${(s.studentId||'').replace(/"/g,'')}", "${(s.name||'').replace(/"/g,'')}", "${(s.gender||'F')}", "${(s.email||'').replace(/"/g,'')}")' style="background:#1a4a8a;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px"><i class="fas fa-key"></i></button>
          <button class="btn btn-sm" title="Link Siblings" onclick='openFamilyLinkModal("${(s.studentId||'').replace(/"/g,'')}", "${(s.name||'').replace(/"/g,'')}")' style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px"><i class="fas fa-link"></i></button>
          <button class="btn btn-sm btn-danger" title="Delete" onclick='promptDeleteStudent("${docId}","${(s.name||'').replace(/"/g,'')}")'><i class="fas fa-trash"></i></button>
        </div></td>
      </tr>`;
    }).join('');
  }

  window.filterStudentTable = function() {
    const q = (document.getElementById('student-search')?.value||'').toLowerCase();
    document.querySelectorAll('#admin-student-tbody tr[data-name]').forEach(tr => { tr.style.display = tr.dataset.name.includes(q)?'':'none'; });
  };

  window.openStudentModal = function() { document.getElementById('modal-title').textContent='Add New Student'; document.getElementById('sf-doc-id').value=''; clearStudentForm(); document.getElementById('student-modal-overlay').style.display='block'; document.body.style.overflow='hidden'; };
  window.closeStudentModal = function() { document.getElementById('student-modal-overlay').style.display='none'; document.body.style.overflow=''; };
  window.editStudent = function(docId, s) {
    document.getElementById('modal-title').textContent='Edit Student'; document.getElementById('sf-doc-id').value=docId;
    const fields = {name:s.name,dob:s.dob,gender:s.gender,blood:s.bloodGroup,nationality:s.nationality,studentId:s.studentId,admNo:s.admissionNo,rollNo:s.rollNo,'class':s.class,'section-field':s.section,house:s.house,admYear:s.admissionYear,acadYear:s.academicYear,lastSchool:s.lastSchool,father:s.fatherName,fatherOcc:s.fatherOccupation,mother:s.motherName,motherOcc:s.motherOccupation,whatsapp:s.whatsapp,altContact:s.altContact,email:s.email,address:s.address,city:s.city,pin:s.pinCode,state:s.state,pen:s.penNumber,aadhaar:s.aadhaar,medical:s.medicalNotes,remarks:s.remarks};
    Object.entries(fields).forEach(([k,v])=>setVal('sf-'+k,v));
    document.getElementById('student-modal-overlay').style.display='block'; document.body.style.overflow='hidden';
  };
  window.viewStudentDetails = function(s) {
    const houseMap = {G:'Green',R:'Red',Y:'Yellow',B:'Blue'};
    const classLabel = {PLG:'Play Group',SKG:'SKG',LKG:'LKG'};
    const cls = classLabel[s.class]||(s.class?'Class '+s.class:'—');
    const info = [['Student ID',s.studentId],['Name',s.name],['DOB',s.dob],['Gender',s.gender==='M'?'Male':s.gender==='F'?'Female':s.gender],['Blood Group',s.bloodGroup],['Class',cls],['Section',s.section],['Roll No.',s.rollNo],['House',houseMap[s.house]||s.house],['Father',s.fatherName],['Mother',s.motherName],['WhatsApp',s.whatsapp],['Address',s.address]].filter(([,v])=>v).map(([k,v])=>`<div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #f0ebe3"><span style="min-width:120px;font-size:12px;color:var(--text-light);font-weight:600">${k}</span><span style="font-size:13px">${v}</span></div>`).join('');
    const overlay=document.createElement('div'); overlay.style.cssText='position:fixed;inset:0;z-index:10001;background:rgba(44,31,14,0.6);backdrop-filter:blur(3px);overflow-y:auto;padding:24px 16px;display:flex;align-items:flex-start;justify-content:center';
    overlay.innerHTML=`<div style="background:var(--white);border-radius:18px;max-width:560px;width:100%;box-shadow:0 24px 80px rgba(44,31,14,0.28);overflow:hidden;margin:auto"><div style="background:linear-gradient(135deg,var(--accent-dark),var(--accent));padding:20px 24px;display:flex;justify-content:space-between;align-items:center"><div><h3 style="color:#fff;font-family:var(--font-head);margin:0">${s.name||'Student'}</h3><p style="color:rgba(255,255,255,0.75);font-size:13px;margin:4px 0 0">${cls}</p></div><button onclick="this.closest('div[style]').remove();document.body.style.overflow=''" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer">&#215;</button></div><div style="padding:20px 24px">${info}</div></div>`;
    document.body.appendChild(overlay); document.body.style.overflow='hidden';
  };
  window.saveStudent = async function() {
    const btn=document.getElementById('sf-save-btn');
    const name=getVal('sf-name'),studentId=getVal('sf-studentId'),rollNo=getVal('sf-rollNo'),cls=getVal('sf-class'),gender=getVal('sf-gender'),father=getVal('sf-father'),mother=getVal('sf-mother'),whatsapp=getVal('sf-whatsapp'),address=getVal('sf-address');
    if(!name||!studentId||!rollNo||!cls||!gender||!father||!mother||!whatsapp||!address){showToast('⚠️ Please fill in all required fields (*).'); return;}
    const data={name,studentId,rollNo:parseInt(rollNo)||rollNo,class:cls,section:getVal('sf-section-field'),house:getVal('sf-house'),gender,dob:getVal('sf-dob'),bloodGroup:getVal('sf-blood'),nationality:getVal('sf-nationality'),admissionNo:getVal('sf-admNo'),admissionYear:getVal('sf-admYear'),academicYear:getVal('sf-acadYear'),lastSchool:getVal('sf-lastSchool'),fatherName:father,fatherOccupation:getVal('sf-fatherOcc'),motherName:mother,motherOccupation:getVal('sf-motherOcc'),whatsapp,altContact:getVal('sf-altContact'),email:getVal('sf-email'),address,city:getVal('sf-city'),pinCode:getVal('sf-pin'),state:getVal('sf-state'),penNumber:getVal('sf-pen'),aadhaar:getVal('sf-aadhaar'),medicalNotes:getVal('sf-medical'),remarks:getVal('sf-remarks'),updatedAt:new Date().toISOString()};
    btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving...'; btn.disabled=true;
    try { const docId=document.getElementById('sf-doc-id').value; if(docId){await setDoc(doc(db,"students",docId),data,{merge:true});showToast('✅ Student updated!');}else{data.createdAt=new Date().toISOString();await addDoc(collection(db,"students"),data);showToast('✅ Student added!');} closeStudentModal(); await window.loadStudents(window._currentClassFilter); }
    catch(err){showToast('❌ Save failed: '+err.message);}
    finally{btn.innerHTML='<i class="fas fa-save"></i> Save Student';btn.disabled=false;}
  };
  window._pendingDeleteId=null;
  window.promptDeleteStudent=function(docId,name){window._pendingDeleteId=docId;document.getElementById('delete-confirm-msg').textContent=`Delete "${name}"? This cannot be undone.`;document.getElementById('delete-confirm-overlay').style.display='flex';};
  window.closeDeleteConfirm=function(){document.getElementById('delete-confirm-overlay').style.display='none';window._pendingDeleteId=null;};
  window.confirmDeleteStudent=async function(){const docId=window._pendingDeleteId;if(!docId)return;const btn=document.getElementById('confirm-delete-btn');btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';btn.disabled=true;try{await deleteDoc(doc(db,"students",docId));showToast('🗑️ Student deleted.');closeDeleteConfirm();await window.loadStudents(window._currentClassFilter);}catch(err){showToast('❌ '+err.message);}finally{btn.innerHTML='<i class="fas fa-trash-alt"></i> Yes, Delete';btn.disabled=false;}};
  function getVal(id){return(document.getElementById(id)?.value||'').trim();}
  function setVal(id,val){const el=document.getElementById(id);if(el&&val!==undefined&&val!==null)el.value=val;}

  // ─────────────────────────────────────────────
  // ROUTINE BRIDGE HELPERS (Routine-App ↔ Portal)
  // Used by student & teacher routine widgets.
  // ─────────────────────────────────────────────
  const _ROUTINE_CLASS_MAP = {
    '1':'I','2':'II','3':'III','4':'IV','5':'V',
    '6':'VI','7':'VII','8':'VIII','9':'IX','10':'X',
    'I':'I','II':'II','III':'III','IV':'IV','V':'V',
    'VI':'VI','VII':'VII','VIII':'VIII','IX':'IX','X':'X'
  };
  window.portalClassToRoutine = function(cls) {
    if (cls === null || cls === undefined) return '';
    const k = String(cls).trim().toUpperCase();
    return _ROUTINE_CLASS_MAP[k] || k;
  };
  window.routineHasClass = function(cls) {
    return !!_ROUTINE_CLASS_MAP[String(cls||'').trim().toUpperCase()];
  };
  const _ROUTINE_DAY_NAMES = {
    1:'Day 1 (Mon)', 2:'Day 2 (Tue)', 3:'Day 3 (Wed)',
    4:'Day 4 (Thu)', 5:'Day 5 (Fri)', 6:'Day 6 (Sat)', 7:'Day 7'
  };
  window.routineDayLabel = function(n) {
    return _ROUTINE_DAY_NAMES[Number(n)] || `Day ${n}`;
  };
  window.routineFormatTiming = function(t) {
    if (!t || !t.start || !t.end) return '--:-- to --:--';
    return `${t.start} – ${t.end}`;
  };
  window.routineActivePeriodIndex = function(timings) {
    if (!timings) return -1;
    const now = new Date();
    const cur = now.getHours()*60 + now.getMinutes();
    for (let i = 1; i <= 6; i++) {
      const t = timings[`period${i}`];
      if (!t || !t.start || !t.end) continue;
      const [sh,sm] = t.start.split(':').map(Number);
      const [eh,em] = t.end.split(':').map(Number);
      if (cur >= sh*60+sm && cur < eh*60+em) return i - 1;
    }
    return -1;
  };
  function clearStudentForm(){['sf-name','sf-dob','sf-gender','sf-blood','sf-nationality','sf-studentId','sf-admNo','sf-rollNo','sf-class','sf-section-field','sf-house','sf-admYear','sf-acadYear','sf-lastSchool','sf-father','sf-fatherOcc','sf-mother','sf-motherOcc','sf-whatsapp','sf-altContact','sf-email','sf-address','sf-city','sf-pin','sf-state','sf-pen','sf-aadhaar','sf-medical','sf-remarks'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=id==='sf-nationality'?'Indian':id==='sf-state'?'Meghalaya':id==='sf-acadYear'?'2025-26':'';});}

  window.loadStudentProfile = async function(user) {
    try {
      const userDoc = await getDoc(doc(db,"users",user.uid));
      if(!userDoc.exists())return;
      const userData=userDoc.data(); const studentId=userData.studentId;
      window._studentId=studentId||userData.loginId||''; window._studentName=userData.name||'Student';
      if(!studentId){const nameEl=document.getElementById('student-name');if(nameEl)nameEl.textContent=userData.name||'Student';showToast('ℹ️ No studentId linked.');const _l=document.getElementById('s-portal-loader');if(_l){_l.classList.add('fade-out');setTimeout(()=>{_l.style.display='none';_l.classList.remove('fade-out');},380);}return;}
      let studentSnap={docs:[],empty:true};
      try{studentSnap=await getDocs(query(collection(db,"students"),where("studentId","==",studentId)));}catch(e){}
      if(studentSnap.empty){try{const d=await getDoc(doc(db,"students",studentId));if(d.exists())studentSnap={docs:[d],empty:false};}catch(e){}}
      if(studentSnap.empty){const nameEl=document.getElementById('student-name');if(nameEl)nameEl.textContent=userData.name||'Student';const headerName=document.getElementById('s-header-name');if(headerName)headerName.textContent=userData.name||'Student';window._studentClass=userData.class||'';window._studentRollNo=userData.rollNo||'';const _l2=document.getElementById('s-portal-loader');if(_l2){_l2.classList.add('fade-out');setTimeout(()=>{_l2.style.display='none';_l2.classList.remove('fade-out');},380);}loadStudentHomework();return;}
      const s=studentSnap.docs[0].data();
      window._studentClass=String(s.class||''); window._studentRollNo=s.rollNo; window._studentName=s.name||userData.name||'Student';
      const setTxt=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val||'—';};
      const setPhone=(id,val)=>{
        const el=document.getElementById(id); if(!el) return;
        if(!val||val==='—'){el.textContent='—';return;}
        const clean=val.replace(/[^0-9+\-() ]/g,'');
        if(!clean.replace(/\D/g,'')){el.textContent=val;return;}
        el.innerHTML=`<a href="tel:${clean}" style="color:var(--accent);font-weight:700;text-decoration:none">${val}</a>`;
      };
      const houseMap2={G:'🟢 Green',R:'🔴 Red',Y:'🟡 Yellow',B:'🔵 Blue'};
      const classLabel2={PLG:'Play Group',SKG:'SKG',LKG:'LKG'};
      const getClsLabel=c=>classLabel2[c]||(c?'Class '+c:'—');
      const nameEl=document.getElementById('student-name');if(nameEl)nameEl.textContent=s.name||userData.name||'Student';
      const headerName=document.getElementById('s-header-name');if(headerName)headerName.textContent=s.name||'Student';
      const headerMeta=document.getElementById('s-header-meta');if(headerMeta)headerMeta.textContent=`Student · Class ${s.class} · Roll No. ${s.rollNo}`;
      const headerAvatar=document.getElementById('s-header-avatar');
      const parts=(s.name||'S').split(' ');
      if(headerAvatar) headerAvatar.textContent = parts.length>=2 ? parts[0].charAt(0)+parts[parts.length-1].charAt(0) : parts[0].charAt(0);
      setTxt('s-profile-name', s.name);
      setTxt('s-profile-sub', `Class ${getClsLabel(s.class)} · Roll No. ${s.rollNo}`);
      const tagAdm=document.getElementById('s-tag-admno'); if(tagAdm) tagAdm.textContent='Admission No: '+(s.admissionNo||'—');
      setTxt('s-card-name', s.name);
      setTxt('s-card-class', `${getClsLabel(s.class)}${s.section?' – Section '+s.section:''}`);
      setTxt('s-card-roll', s.rollNo);
      setTxt('s-card-admno', s.admissionNo||'—');
      setTxt('s-card-dob', s.dob||'—');
      setTxt('s-card-blood', s.bloodGroup||'—');
      setTxt('s-card-gender', s.gender==='M'?'Male':s.gender==='F'?'Female':s.gender||'—');
      setTxt('s-card-nationality', s.nationality||'Indian');
      setPhone('s-card-contact', s.whatsapp||'—');
      setTxt('s-card-address', s.address||'—');
      setTxt('s-card-father', s.fatherName||'—');
      setTxt('s-card-mother', s.motherName||'—');
      setPhone('s-card-parent-contact', s.whatsapp||s.altContact||'—');
      setTxt('s-card-pen', s.penNumber||'—');
      setTxt('s-card-house', houseMap2[s.house]||s.house||'—');
      const bal = parseFloat(s.feeBalance ?? s.feeTotal ?? 0);
      const feeDueEl = document.getElementById('s-stat-fee-due');
      if (feeDueEl) feeDueEl.textContent = bal > 0 ? '₹' + bal.toLocaleString('en-IN') : '₹0';
      const _ldr = document.getElementById('s-portal-loader');
      if (_ldr) { _ldr.classList.add('fade-out'); setTimeout(() => { _ldr.style.display = 'none'; _ldr.classList.remove('fade-out'); }, 380); }
      loadStudentHomework(); loadStudentNotices(); loadStudentFees();
      if (window.loadStudentDashWidgets) loadStudentDashWidgets();
      window.loadAcademicSnapshot(studentId); // non-blocking — Phase 5
      checkStudentReportCardRelease(studentId, String(s.class||''), parseFloat(s.feeBalance??s.feeTotal??0)); // non-blocking
    } catch(e){ showToast('⚠️ Could not load profile: '+e.message); const _le=document.getElementById('s-portal-loader');if(_le){_le.classList.add('fade-out');setTimeout(()=>{_le.style.display='none';_le.classList.remove('fade-out');},380);} }
  };

  // ── STUDENT REPORT CARD RELEASE CHECK ───────────────────────────────────────
  async function checkStudentReportCardRelease(studentId, classId, feeBalance) {
    const banner = document.getElementById('s-reportcard-banner');
    if (!banner || !studentId || !classId) return;
    try {
      const ftDoc = await getDoc(doc(db, 'marks', `${classId}_FT`, 'students', studentId));
      if (!ftDoc.exists()) return;
      const released = ftDoc.data()?.releasedToStudent === true;
      const feesCleared = feeBalance <= 0;
      if (released && feesCleared) {
        banner.style.display = 'flex';
        // Store data for when student clicks view
        window._studentRCData = { hyClassId: `${classId}_HY`, ftClassId: `${classId}_FT`, studentId };
      }
    } catch(e) { console.warn('checkStudentReportCardRelease:', e.message); }
  }

  window.studentViewReportCard = async function() {
    const rc = window._studentRCData;
    if (!rc) return;
    showToast('Loading your report card…');
    try {
      const [hyDoc, ftDoc] = await Promise.all([
        getDoc(doc(db, 'marks', rc.hyClassId, 'students', rc.studentId)),
        getDoc(doc(db, 'marks', rc.ftClassId, 'students', rc.studentId))
      ]);
      if (!ftDoc.exists()) { showToast('❌ Report card not found.'); return; }
      const classId = rc.hyClassId.replace('_HY','');
      const payload = { hyData: hyDoc.data()||{}, ftData: ftDoc.data()||{}, classId };
      sessionStorage.setItem('sfds_adminRC', JSON.stringify(payload));
      window.location.href = '/Sfs-report-card/markentry.html?adminRC=' + encodeURIComponent(classId + '/' + rc.studentId);
    } catch(e) { showToast('❌ ' + e.message); }
  };

  // ================================================================
  //  ACADEMIC INTELLIGENCE SNAPSHOT — Phase 5
  //
  //  Reads the pre-computed student_profiles/{sanitizedStudentId}
  //  document written by assessment-app and renders a summary widget
  //  inside #s-academic-snapshot on the My Profile page.
  //
  //  Completely non-blocking. If the document does not exist yet
  //  (assessment-app has not run any sessions for this student),
  //  the card shows a graceful "not available" message.
  //  The rest of the student portal is unaffected either way.
  // ================================================================
  window.loadAcademicSnapshot = async function loadAcademicSnapshot(studentId) {
    const container = document.getElementById('s-academic-snapshot');
    if (!container || !studentId) return;

    // Sanitize studentId to match assessment-app's document ID convention:
    // 'SFS/2025/001' → 'SFS_2025_001'
    const docId = studentId.replace(/\//g, '_').replace(/\s+/g, '_');

    try {
      const snap = await getDoc(doc(db, 'student_profiles', docId));

      if (!snap.exists()) {
        container.innerHTML = `
          <h4><i class="fas fa-chart-line"></i> Academic Performance</h4>
          <p class="academic-snapshot-empty">Academic report not yet available. Reports are generated after assessments are reviewed.</p>`;
        return;
      }

      const p = snap.data();
      const trendClass = p.trendDirection === 'improving' ? 'trend-improving'
                       : p.trendDirection === 'declining'  ? 'trend-declining'
                       : 'trend-stable';
      const trendIcon  = p.trendDirection === 'improving' ? '↑'
                       : p.trendDirection === 'declining'  ? '↓' : '→';

      const strongestPctClass = (p.strongestSubject?.averagePercentage ?? 0) >= 40 ? 'subject-pct-good' : 'subject-pct-risk';
      const weakestPctClass   = (p.weakestSubject?.averagePercentage  ?? 0) >= 40 ? 'subject-pct-good' : 'subject-pct-risk';

      const alertsHtml = (p.activeAlerts?.length > 0) ? `
        <div class="academic-alerts">
          <div class="academic-alerts-title"><i class="fas fa-exclamation-triangle"></i> Alerts</div>
          ${(p.alertReasons || []).map(r => `<div class="academic-alert-item">• ${r}</div>`).join('')}
        </div>` : '';

      // "View Full Academic Report" button — URL wired in Phase 6.
      // Set window._academicAppUrl before this loads to enable the link.
      const reportUrl = (typeof window._academicAppUrl === 'string' && window._academicAppUrl)
        ? `${window._academicAppUrl}?student=${encodeURIComponent(studentId)}`
        : '';
      const linkClass = reportUrl ? '' : ' disabled';
      const linkHref  = reportUrl || '#';

      // Subject breakdown bars
      const subjectBarsHtml = Array.isArray(p.subjectBreakdown) && p.subjectBreakdown.length
        ? `<div class="academic-subject-breakdown">
            <div class="academic-section-title"><i class="fas fa-book"></i> Subject Breakdown</div>
            ${p.subjectBreakdown.sort((a,b) => b.averagePercentage - a.averagePercentage).map(s => {
              const pct = s.averagePercentage ?? 0;
              const barClass = pct >= 75 ? 'bar-good' : pct >= 50 ? 'bar-avg' : pct >= 40 ? 'bar-low' : 'bar-risk';
              return `<div class="subject-bar-row">
                <div class="subject-bar-name">${s.subject_name}</div>
                <div class="subject-bar-track">
                  <div class="subject-bar-fill ${barClass}" style="width:${Math.min(pct,100)}%"></div>
                </div>
                <div class="subject-bar-pct">${pct}%</div>
              </div>`;
            }).join('')}
          </div>` : '';

      // Monthly trend chart (canvas — drawn after innerHTML set)
      const hasTrend = Array.isArray(p.monthlyTrend) && p.monthlyTrend.length > 1;
      const trendChartHtml = hasTrend
        ? `<div class="academic-section-title" style="margin-top:16px"><i class="fas fa-chart-area"></i> Monthly Trend</div>
           <div class="academic-trend-chart-wrap"><canvas id="s-academic-trend-chart" height="120"></canvas></div>` : '';

      container.innerHTML = `
        <h4><i class="fas fa-chart-line"></i> Academic Performance</h4>
        <div class="academic-stat-row">
          <div class="academic-stat">
            <div class="academic-stat-val">${p.overallAverage ?? '—'}%</div>
            <div class="academic-stat-label">Overall Average</div>
            <span class="academic-trend-badge ${trendClass}">${trendIcon} ${p.trendLabel || 'Stable'}</span>
          </div>
          <div class="academic-stat">
            <div class="academic-stat-val">${p.monthsTracked ?? '—'}</div>
            <div class="academic-stat-label">Months Tracked</div>
          </div>
          <div class="academic-stat">
            <div class="academic-stat-val">${p.totalSessions ?? '—'}</div>
            <div class="academic-stat-label">Total Sessions</div>
          </div>
        </div>
        ${alertsHtml}
        ${p.summaryText ? `<div class="academic-summary">${p.summaryText}</div>` : ''}
        ${subjectBarsHtml}
        ${trendChartHtml}
        <div class="academic-report-link">
          <a href="${linkHref}" id="s-academic-report-btn" class="${linkClass}" ${reportUrl ? 'target="_blank"' : ''}>
            <i class="fas fa-external-link-alt"></i> View Full Academic Report
          </a>
        </div>`;

      // Draw monthly trend chart with Chart.js
      if (hasTrend) {
        const canvas = document.getElementById('s-academic-trend-chart');
        if (canvas && window.Chart) {
          new window.Chart(canvas, {
            type: 'line',
            data: {
              labels: p.monthlyTrend.map(m => m.month),
              datasets: [{
                label: 'Overall %',
                data: p.monthlyTrend.map(m => m.overallPercentage),
                borderColor: '#a07735',
                backgroundColor: 'rgba(160,119,53,0.12)',
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: '#a07735',
                fill: true,
                tension: 0.3
              }]
            },
            options: {
              responsive: true,
              plugins: { legend: { display: false } },
              scales: {
                y: { min: 0, max: 100, ticks: { callback: v => v+'%', font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.06)' } },
                x: { ticks: { font: { size: 11 } }, grid: { display: false } }
              }
            }
          });
        }
      }

    } catch (e) {
      container.innerHTML = `
        <h4><i class="fas fa-chart-line"></i> Academic Performance</h4>
        <p class="academic-snapshot-empty">Could not load academic report.</p>`;
      console.warn('Academic snapshot load failed:', e.message);
    }
  }

  // ================================================================
  //  NOTIFICATION CENTER — auth-gated personalized fetch
  //
  //  Triggered ONLY after onAuthStateChanged resolves a valid user.
  //  Pulls attendance, fees, and notices using the authenticated
  //  user's UID (resolved → studentId via the `users` collection).
  //
  //  Hands the assembled payload to NotificationCenter.render() so
  //  the Bento Grid renders real personalized data instead of mocks.
  // ================================================================

  // Class names get stored inconsistently (Roman "I", number 1, string "1",
  // play-group codes "PG/LKG/KG"). Returns up to ~6 plausible variants
  // for use with a Firestore `where('class','in',[...])` query.
  function _classVariants(cls) {
    const R2N = { I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10 };
    const N2R = { 1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII',9:'IX',10:'X' };
    const raw = String(cls || '').trim();
    if (!raw) return [''];
    const out = new Set([raw, raw.toUpperCase(), raw.toLowerCase()]);
    const asNum = parseInt(raw, 10);
    if (!isNaN(asNum)) { out.add(asNum); out.add(String(asNum)); if (N2R[asNum]) out.add(N2R[asNum]); }
    const upper = raw.toUpperCase();
    if (R2N[upper]) { out.add(R2N[upper]); out.add(String(R2N[upper])); }
    return Array.from(out).slice(0, 10);
  }

  window.loadStudentNotificationCenter = async function(user) {
    if (!user || !user.uid || !window.NotificationCenter) return;

    try {
      // 1. Resolve studentId / class from the authenticated UID
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (!userSnap.exists()) return;
      const u   = userSnap.data();
      const sid = (window.getActiveStudentId && window.getActiveStudentId()) || u.studentId || window._studentId || '';
      const cls = window._studentClass || u.class || '';

      // 2. ATTENDANCE — read attendance_daily for this student's class,
      // then check the absent[]/late[] arrays for this student's id.
      // Match is case/whitespace-insensitive so "SFS260101" === "sfs260101 ".
      // Class field may be stored as Roman ("I"), number (1), or string ("1")
      // depending on when/how the record was created — we query all variants.
      let present = 0, absent = 0, total = 0, todayStatus = 'present';
      console.log('[Attendance debug] sid=', sid, 'cls=', cls, 'variants=', _classVariants(cls));
      if (sid && cls) {
        const norm = v => String(v || '').trim().toUpperCase();
        const sidN = norm(sid);
        const attSnap = await getDocs(query(
          collection(db, 'attendance_daily'),
          where('class', 'in', _classVariants(cls)),
          limit(200)
        ));
        console.log('[Attendance debug] docs returned:', attSnap.size);
        const todayKey = new Date().toISOString().split('T')[0];
        attSnap.forEach(d => {
          const a = d.data();
          const isAbsent = Array.isArray(a.absent) && a.absent.some(x => norm(x) === sidN);
          const isLate   = Array.isArray(a.late)   && a.late.some(x => norm(x) === sidN);
          total++;
          if (isAbsent) absent++; else present++;
          if (a.date === todayKey) {
            todayStatus = isAbsent ? 'absent' : isLate ? 'late' : 'present';
          }
        });
      }
      const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

      // 3. FEES — sum unpaid for this student
      let feeData = {
        isPaid: true, amount: 0, term: 'Current Term — 2025–26',
        dueDate: '', paidAmount: 0, upiId: 'stfrancisschool@upi'
      };
      if (sid) {
        const feeSnap = await getDocs(query(
          collection(db, 'fees'),
          where('studentId', '==', sid),
          limit(20)
        ));
        let totalDue = 0, totalPaid = 0, latestDue = '';
        feeSnap.forEach(d => {
          const f   = d.data();
          const amt = parseFloat(f.amount) || 0;
          if ((f.status || '').toLowerCase() === 'approved') totalPaid += amt;
          else { totalDue += amt; if (f.dueDate && f.dueDate > latestDue) latestDue = f.dueDate; }
        });
        feeData = {
          isPaid:     totalDue === 0,
          amount:     totalDue || totalPaid,
          term:       'Current Term — 2025–26',
          dueDate:    latestDue || new Date(Date.now() + 15*86400000).toISOString().split('T')[0],
          paidAmount: totalPaid,
          upiId:      'stfrancisschool@upi'
        };
      }

      // 4. NOTICES — global + class-targeted
      const noticesSnap = await getDocs(query(collection(db, 'notices'), limit(20)));
      const notices = [...noticesSnap.docs]
        .map(d => {
          const n = d.data();
          return {
            audience: (n.audience || 'all').toLowerCase(),
            message:  n.title || n.body || '',
            isUrgent: (n.priority || '').toLowerCase() === 'urgent',
            tag:      n.priority || 'Notice',
            date:     ((n.postedAt || n.createdAt || '') + '').split('T')[0]
          };
        })
        .filter(n => n.audience === 'all' || n.audience === 'students' || n.audience === 'both' || (cls && n.audience === cls.toLowerCase()))
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

      // 4b. Holiday banner for student portal
      _checkHolidayBanner('s-holiday-banner', 's-holiday-banner-msg');

      // 4c. HOLIDAYS — inject upcoming holidays (next 30 days) into notices
      try {
        const today = new Date(); today.setHours(0,0,0,0);
        const in30  = new Date(today); in30.setDate(today.getDate() + 30);
        const todayStr = today.toISOString().split('T')[0];
        const in30Str  = in30.toISOString().split('T')[0];
        const holSnap = await getDocs(query(collection(db, 'holidays'), limit(50)));
        holSnap.forEach(d => {
          const h = d.data();
          if (!h.date || h.date < todayStr || h.date > in30Str) return;
          const fmt = new Date(h.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long' });
          const isToday    = h.date === todayStr;
          const isTomorrow = h.date === new Date(today.getTime() + 86400000).toISOString().split('T')[0];
          const prefix = isToday ? '🎉 Today — ' : isTomorrow ? '📅 Tomorrow — ' : `📅 ${fmt} — `;
          notices.unshift({
            audience: 'all',
            message:  `${prefix}${h.reason} (${h.type || 'Holiday'})`,
            isUrgent: isToday || isTomorrow,
            tag:      'Holiday',
            date:     h.date
          });
        });
      } catch(e) { console.warn('[Holidays] fetch skipped:', e.message); }

      // 5. EXAMS — placeholder (no `exams` collection yet); wire when ready
      const exams = [];

      // 6. Update stat cards with real data
      const setEl = (id, v) => { countUp(document.getElementById(id), v); };
      setEl('s-stat-attendance', total > 0 ? percentage + '%' : '—');
      // Fee due: try to read live feeBalance from the student's own doc.
      // Wrapped in its own try/catch because the Firestore rule for `students`
      // doesn't permit querying by the studentId field — only direct ID reads.
      // A failure here must NOT abort the rest of the NotificationCenter render.
      let stuSnap = null;
      if (sid) {
        try {
          stuSnap = await getDocs(query(collection(db,'students'), where('studentId','==',sid), limit(1)));
        } catch (e) {
          console.warn('[NotificationCenter] student feeBalance lookup skipped:', e.message);
        }
      }
      if (stuSnap && !stuSnap.empty) {
        const bal = parseFloat(stuSnap.docs[0].data().feeBalance || 0);
        setEl('s-stat-fee-due', bal > 0 ? '₹' + bal.toLocaleString('en-IN') : '₹0');
      } else {
        setEl('s-stat-fee-due', feeData.isPaid ? '₹0' : '₹' + (feeData.amount||0).toLocaleString('en-IN'));
      }
      setEl('s-stat-days-exam', '—');

      // 7. Render the personalized payload into the Bento Grid
      if (window.NotificationCenter) {
        window.NotificationCenter.render({
          attendance: { todayStatus, percentage, present, absent, total },
          fees:       feeData,
          exams
        }, notices);
      }
    } catch (e) {
      console.warn('[NotificationCenter] auth-bound fetch failed:', e.message);
    }
  };

  // ================================================================
  //  STUDENT & TEACHER — Routine / Schedule (bridges to Routine-App data)
  // ================================================================
  window._routineState = {
    currentDay: 1,           // server-controlled "today" (1-7)
    viewDay: null,           // user-selected day pill; falls back to currentDay
    timings: null,           // settings/periodTimings
    subjects: null,          // {code: name} map cached in-session
    teachersByInitials: null,// {INI: {fullName,...}} map cached in-session
    daySubs: { s: null, t: null },     // onSnapshot unsubscribers for settings/schoolDay
    timingSubs: { s: null, t: null },  // onSnapshot unsubscribers for settings/periodTimings
    activeTimer: null        // setInterval for active-period refresh
  };

  async function _routineLoadSubjects(force) {
    const s = window._routineState;
    if (s.subjects && !force) return s.subjects;
    const snap = await getDocs(collection(db, 'subjects'));
    const map = {};
    snap.docs.forEach(d => { const x = d.data(); if (x && x.code !== undefined) map[x.code] = x.name; });
    s.subjects = map;
    return map;
  }
  async function _routineLoadTeachers(force) {
    const s = window._routineState;
    if (s.teachersByInitials && !force) return s.teachersByInitials;
    const snap = await getDocs(collection(db, 'teachers'));
    const map = {};
    snap.docs.forEach(d => {
      const t = d.data() || {};
      const ini = (t.initials || t.routineInitials || '').toString().toUpperCase().trim();
      if (ini) map[ini] = { fullName: t.fullName || t.name || ini, name: t.name || t.fullName || ini };
    });
    s.teachersByInitials = map;
    return map;
  }
  async function _routineGetSlotsForPeriod(dayNumber, periodNumber) {
    const ref = collection(db, 'routine', String(dayNumber), 'periods', String(periodNumber), 'slots');
    const snap = await getDocs(ref);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function _routineGetDay(dayNumber) {
    const out = {};
    for (let p = 1; p <= 6; p++) out[`period${p}`] = await _routineGetSlotsForPeriod(dayNumber, p);
    return out;
  }
  function _resolveSubject(code, map) {
    if (Array.isArray(code)) return code.map(c => map[c] || `Subject ${c}`).join(' / ');
    return map[code] || (code !== undefined ? `Subject ${code}` : '—');
  }
  const _ROMAN_PERIODS = ['I','II','III','IV','V','VI'];

  // Bootstrap settings synchronously so the first render reads correct values
  // *before* listeners would have a chance to fire async.
  async function _routineEnsureSettings() {
    const s = window._routineState;
    if (s._settingsLoaded) return;
    const [daySnap, timingsSnap] = await Promise.all([
      getDoc(doc(db, 'settings', 'schoolDay')),
      getDoc(doc(db, 'settings', 'periodTimings'))
    ]);
    if (daySnap.exists()) s.currentDay = Number(daySnap.data().currentDay) || 1;
    s.timings = timingsSnap.exists() ? timingsSnap.data() : null;
    s._settingsLoaded = true;
  }

  // Idempotent: listeners attach once per prefix per session. The latest
  // onChange callback is stashed so updates always re-render the live view.
  function _routineStartListeners(prefix, onChange) {
    const s = window._routineState;
    s[`_cb_${prefix}`] = onChange;
    if (s.daySubs[prefix]) return;
    s.daySubs[prefix] = onSnapshot(doc(db, 'settings', 'schoolDay'), snap => {
      if (!snap.exists()) return;
      const next = Number(snap.data().currentDay) || 1;
      const changed = next !== s.currentDay;
      s.currentDay = next;
      if (changed && s.viewDay === null && s[`_cb_${prefix}`]) s[`_cb_${prefix}`]();
    });
    s.timingSubs[prefix] = onSnapshot(doc(db, 'settings', 'periodTimings'), snap => {
      const next = snap.exists() ? snap.data() : null;
      const changedJSON = JSON.stringify(next) !== JSON.stringify(s.timings);
      s.timings = next;
      if (changedJSON && s[`_cb_${prefix}`]) s[`_cb_${prefix}`]();
    });
    if (!s.activeTimer) {
      s.activeTimer = setInterval(() => {
        const sr = document.getElementById('s-routine'); const tr = document.getElementById('t-schedule');
        if (sr && sr.classList.contains('active') && s._cb_s) s._cb_s();
        if (tr && tr.classList.contains('active') && s._cb_t) s._cb_t();
      }, 60000);
    }
  }

  // ── Student Routine ──────────────────────────────────────────────
  window.loadStudentRoutine = async function(forceReload) {
    const body = document.getElementById('s-routine-body');
    const sub  = document.getElementById('s-routine-sub');
    if (!body) return;
    const cls = window._studentClass || '';
    if (!cls) { body.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:24px">No class info on your profile yet.</p>`; return; }
    if (!window.routineHasClass(cls)) {
      body.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-info-circle"></i> Routine for ${cls} is not configured yet.</p>`;
      if (sub) sub.textContent = `Class ${cls}`;
      return;
    }
    const routineClass = window.portalClassToRoutine(cls);
    if (forceReload) { window._routineState.subjects = null; window._routineState.teachersByInitials = null; window._routineState._settingsLoaded = false; }

    body.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading routine…</p>`;
    try {
      await _routineEnsureSettings();
      _routineStartListeners('s', () => window.loadStudentRoutine());
      await _routineLoadSubjects();
      await _routineLoadTeachers();
      const s = window._routineState;
      const day = s.viewDay || s.currentDay || 1;
      if (sub) sub.textContent = `Class ${cls} · ${window.routineDayLabel(day)}${day === s.currentDay ? ' · TODAY' : ''}`;
      document.querySelectorAll('#s-routine-daypills .routine-day-pill').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.day) === day);
        btn.classList.toggle('btn-primary', Number(btn.dataset.day) === day);
        btn.classList.toggle('btn-outline', Number(btn.dataset.day) !== day);
        btn.onclick = () => { window._routineState.viewDay = Number(btn.dataset.day); window.loadStudentRoutine(); };
      });

      const dayData = await _routineGetDay(day);
      const active = window.routineActivePeriodIndex(s.timings);
      const isToday = (day === s.currentDay);
      const rows = _ROMAN_PERIODS.map((rom, idx) => {
        const slots = dayData[`period${idx+1}`] || [];
        const slot = slots.find(x => x.className === routineClass || (x.involvedClasses && x.involvedClasses.includes(routineClass)));
        const t = s.timings ? s.timings[`period${idx+1}`] : null;
        const tStr = window.routineFormatTiming(t);
        const isActive = isToday && idx === active;
        let subj = '<span style="color:var(--text-light)">—</span>', teach = '';
        if (slot) {
          if (slot.slotType === 'value-cate-split') {
            subj = `Value Ed. / Catechism <span class="badge badge-warning" style="margin-left:4px">Split</span>`;
            teach = `<span style="color:var(--text-light)">Go to your assigned room</span>`;
          } else if (slot.slotType === 'dual-subject') {
            subj = `English I / II <span class="badge badge-info" style="margin-left:4px">I/II</span>`;
            const tt = s.teachersByInitials[(slot.teacherInitials||'').toUpperCase()];
            teach = tt ? tt.fullName : (slot.teacherInitials || '');
          } else {
            subj = _resolveSubject(slot.subjectCode, s.subjects);
            const tt = s.teachersByInitials[(slot.teacherInitials||'').toUpperCase()];
            teach = tt ? tt.fullName : (slot.teacherInitials || '');
          }
        }
        return `<tr class="${isActive ? 'routine-row-active' : ''}"><td style="font-weight:700;padding:10px 12px">Period ${rom}${isActive?' <i class="fas fa-circle" style="color:var(--success);font-size:8px;margin-left:4px" title="Now"></i>':''}</td><td style="padding:10px 12px;color:var(--text-light)">${tStr}</td><td style="padding:10px 12px">${subj}</td><td style="padding:10px 12px">${teach}</td></tr>`;
      }).join('');
      body.innerHTML = `<div class="table-wrap"><table class="routine-table"><thead><tr><th style="padding:10px 12px">Period</th><th style="padding:10px 12px">Time</th><th style="padding:10px 12px">Subject</th><th style="padding:10px 12px">Teacher</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } catch (e) {
      body.innerHTML = `<p style="color:var(--danger);text-align:center;padding:24px"><i class="fas fa-exclamation-triangle"></i> Failed to load routine. ${e.message||''}</p>`;
      console.error(e);
    }
  };

  // ── Teacher Schedule ─────────────────────────────────────────────
  // Resolves the logged-in teacher's "initials" by checking, in order:
  //  1) window._teacherInitials (cached from loadTeacherPortal)
  //  2) the teacher doc's routineInitials / initials field
  //  3) fuzzy match teacher.name → Routine-App teachers' fullName
  async function _resolveTeacherInitials() {
    if (window._teacherInitials) return window._teacherInitials;
    const user = window._firebaseAuth?.currentUser; if (!user) return '';
    let teacherDoc = null;
    try {
      const direct = await getDoc(doc(db, 'teachers', user.uid));
      if (direct.exists()) teacherDoc = direct.data();
    } catch(_) {}
    if (!teacherDoc) {
      const tid = window._teacherId || '';
      if (tid) {
        try {
          let snap = await getDocs(query(collection(db, 'teachers'), where('teacherId','==',tid)));
          if (snap.empty) snap = await getDocs(query(collection(db, 'teachers'), where('teacherId','==',tid.toUpperCase())));
          if (!snap.empty) teacherDoc = snap.docs[0].data();
        } catch(_) {}
      }
    }
    let ini = '';
    if (teacherDoc) ini = (teacherDoc.routineInitials || teacherDoc.initials || '').toString().toUpperCase().trim();
    if (!ini && teacherDoc && (teacherDoc.name || teacherDoc.fullName)) {
      const wantName = (teacherDoc.name || teacherDoc.fullName || '').toLowerCase().trim();
      await _routineLoadTeachers();
      const map = window._routineState.teachersByInitials || {};
      for (const k of Object.keys(map)) {
        if ((map[k].fullName || '').toLowerCase().trim() === wantName) { ini = k; break; }
      }
    }
    window._teacherInitials = ini;
    return ini;
  }

  window.loadTeacherSchedule = async function(forceReload) {
    const body = document.getElementById('t-schedule-body');
    const sub  = document.getElementById('t-schedule-sub');
    if (!body) return;
    if (forceReload) { window._routineState.subjects = null; window._routineState.teachersByInitials = null; window._routineState._settingsLoaded = false; window._teacherInitials = ''; }

    body.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading schedule…</p>`;
    try {
      const ini = await _resolveTeacherInitials();
      if (!ini) {
        body.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-info-circle"></i> Your <strong>Routine Initials</strong> are not set. Ask the admin to update your teacher profile.</p>`;
        if (sub) sub.textContent = 'Routine Initials not linked';
        return;
      }
      await _routineEnsureSettings();
      _routineStartListeners('t', () => window.loadTeacherSchedule());
      await _routineLoadSubjects();
      await _routineLoadTeachers();
      const s = window._routineState;
      const day = s.viewDay || s.currentDay || 1;
      const me = s.teachersByInitials[ini];
      if (sub) sub.textContent = `${me ? me.fullName : ini} (${ini}) · ${window.routineDayLabel(day)}${day === s.currentDay ? ' · TODAY' : ''}`;

      document.querySelectorAll('#t-schedule-daypills .routine-day-pill').forEach(btn => {
        const isSel = Number(btn.dataset.day) === day;
        btn.classList.toggle('active', isSel);
        btn.classList.toggle('btn-primary', isSel);
        btn.classList.toggle('btn-outline', !isSel);
        btn.onclick = () => { window._routineState.viewDay = Number(btn.dataset.day); window.loadTeacherSchedule(); };
      });

      const dayData = await _routineGetDay(day);
      const active = window.routineActivePeriodIndex(s.timings);
      const isToday = (day === s.currentDay);
      const rows = _ROMAN_PERIODS.map((rom, idx) => {
        const slots = dayData[`period${idx+1}`] || [];
        const slot = slots.find(x => (x.teacherInitials || '').toUpperCase() === ini);
        const t = s.timings ? s.timings[`period${idx+1}`] : null;
        const tStr = window.routineFormatTiming(t);
        const isActive = isToday && idx === active;
        let cls = '<span style="color:var(--text-light)">Free</span>', subj = '';
        if (slot) {
          if (slot.slotType === 'value-cate-split') {
            const pool = (slot.involvedClasses || [slot.className]).join(' + ');
            cls = `Class ${pool}`;
            subj = `${slot.track || 'Value Ed. / Catechism'}${slot.room ? ' · '+slot.room : ''} <span class="badge badge-warning" style="margin-left:4px">Split</span>`;
          } else if (slot.slotType === 'dual-subject') {
            cls = `Class ${slot.className}`;
            subj = `English I / II <span class="badge badge-info" style="margin-left:4px">I/II</span>`;
          } else {
            cls = `Class ${slot.className}`;
            subj = _resolveSubject(slot.subjectCode, s.subjects);
          }
        }
        return `<tr class="${isActive ? 'routine-row-active' : ''}"><td style="font-weight:700;padding:10px 12px">Period ${rom}${isActive?' <i class="fas fa-circle" style="color:var(--success);font-size:8px;margin-left:4px" title="Now"></i>':''}</td><td style="padding:10px 12px;color:var(--text-light)">${tStr}</td><td style="padding:10px 12px">${cls}</td><td style="padding:10px 12px">${subj}</td></tr>`;
      }).join('');
      body.innerHTML = `<div class="table-wrap"><table class="routine-table"><thead><tr><th style="padding:10px 12px">Period</th><th style="padding:10px 12px">Time</th><th style="padding:10px 12px">Class</th><th style="padding:10px 12px">Subject</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    } catch (e) {
      body.innerHTML = `<p style="color:var(--danger);text-align:center;padding:24px"><i class="fas fa-exclamation-triangle"></i> Failed to load schedule. ${e.message||''}</p>`;
      console.error(e);
    }
  };

  // ── Dashboard mini-widgets (Today's Schedule + Recent Notices) ──
  async function _loadRecentNotices(elId, audienceFilter) {
    const el = document.getElementById(elId);
    if (!el) return;
    try {
      const snap = await getDocs(query(collection(db, 'notices'), limit(20)));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(n => { const a = (n.audience || 'all').toLowerCase(); return audienceFilter(a, n); })
        .sort((a,b) => (b.postedAt||b.createdAt||'').localeCompare(a.postedAt||a.createdAt||''))
        .slice(0, 4);
      if (!list.length) { el.innerHTML = `<p style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">No notices yet.</p>`; return; }
      const dot = p => p === 'Urgent' ? 'var(--danger)' : p === 'Important' ? 'var(--warning)' : 'var(--info)';
      el.innerHTML = list.map(n => {
        const date = n.postedAt ? new Date(n.postedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}) : '';
        return `<div class="chapter-item"><i class="fas fa-circle" style="color:${dot(n.priority)};font-size:8px;margin-right:8px"></i>${(n.title||'').replace(/[<>]/g,'')} ${date ? `<span style="color:var(--text-light);font-size:11px;margin-left:4px">· ${date}</span>` : ''}</div>`;
      }).join('');
    } catch (e) {
      el.innerHTML = `<p style="color:var(--danger);font-size:13px;padding:12px">${e.message}</p>`;
    }
  }

  async function _renderDashScheduleRows(elId, ini, isStudent, studentRoutineClass) {
    const el = document.getElementById(elId);
    if (!el) return;
    try {
      await _routineEnsureSettings();
      await _routineLoadSubjects();
      await _routineLoadTeachers();
      const s = window._routineState;
      const day = s.currentDay || 1;
      const dayData = await _routineGetDay(day);
      const active = window.routineActivePeriodIndex(s.timings);

      const rows = [];
      for (let i = 0; i < 6; i++) {
        const slots = dayData[`period${i+1}`] || [];
        let slot = null;
        if (isStudent) {
          slot = slots.find(x => x.className === studentRoutineClass || (x.involvedClasses && x.involvedClasses.includes(studentRoutineClass)));
        } else if (ini) {
          slot = slots.find(x => (x.teacherInitials || '').toUpperCase() === ini);
        }
        const t = s.timings ? s.timings[`period${i+1}`] : null;
        const tStr = (t && t.start) ? t.start : '--:--';
        const isActive = i === active;
        let label = isStudent ? 'Free' : 'Free Period';
        if (slot) {
          if (slot.slotType === 'value-cate-split') label = 'Value Ed. / Catechism';
          else if (slot.slotType === 'dual-subject') label = isStudent ? 'English I / II' : `English I/II · Class ${slot.className}`;
          else {
            const subj = Array.isArray(slot.subjectCode)
              ? slot.subjectCode.map(c => s.subjects[c] || `Subj ${c}`).join(' / ')
              : (s.subjects[slot.subjectCode] || `Subject ${slot.subjectCode}`);
            label = isStudent ? subj : `${subj} · Class ${slot.className}`;
          }
        }
        rows.push(`<div class="chapter-item" style="${isActive?'background:rgba(90,138,90,0.12);border-left:3px solid var(--success,#5a8a5a);padding-left:8px':''}"><strong>${tStr}</strong> – ${label}${isActive?' <span style="color:var(--success,#5a8a5a);font-size:10px;font-weight:700;margin-left:4px">● NOW</span>':''}</div>`);
      }
      el.innerHTML = `<p style="font-size:11px;color:var(--text-light);margin:0 0 6px"><i class="fas fa-info-circle"></i> ${window.routineDayLabel(day)}</p>` + rows.join('');
    } catch (e) {
      el.innerHTML = `<p style="color:var(--danger);font-size:13px;padding:12px">${e.message}</p>`;
    }
  }

  // Checks today & tomorrow against holidays collection and shows the
  // green banner at the top of whichever portal is active.
  async function _checkHolidayBanner(bannerId, msgId) {
    const banner = document.getElementById(bannerId);
    const msgEl  = document.getElementById(msgId);
    if (!banner || !msgEl) return;
    try {
      const today    = new Date(); today.setHours(0,0,0,0);
      const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
      const todayStr    = today.toISOString().split('T')[0];
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const snap = await getDocs(query(collection(db,'holidays'), limit(50)));
      let match = null;
      snap.forEach(d => {
        const h = d.data();
        if (h.date === todayStr)    match = { ...h, when: 'today' };
        if (h.date === tomorrowStr && !match) match = { ...h, when: 'tomorrow' };
      });
      if (match) {
        msgEl.textContent = match.when === 'today'
          ? `Today is a holiday — ${match.reason} (${match.type || 'Holiday'}). No classes today.`
          : `Tomorrow is a holiday — ${match.reason} (${match.type || 'Holiday'}). No classes tomorrow.`;
        banner.style.display = 'flex';
      }
    } catch(e) { /* silently skip if holidays unreadable */ }
  }

  window.loadTeacherDashWidgets = async function() {
    const ini = await _resolveTeacherInitials();
    const schedEl = document.getElementById('t-dash-schedule');
    if (schedEl && !ini) {
      schedEl.innerHTML = `<p style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">Routine Initials not linked.</p>`;
    } else if (schedEl) {
      await _renderDashScheduleRows('t-dash-schedule', ini, false, null);
    }
    await _loadRecentNotices('t-dash-notices', (aud) => aud === 'all' || aud === 'teachers' || aud === 'both');
    _checkHolidayBanner('t-holiday-banner', 't-holiday-banner-msg');

    // Upcoming holidays widget
    const holEl = document.getElementById('t-dash-holidays');
    if (holEl) {
      try {
        const today  = new Date(); today.setHours(0,0,0,0);
        const in60   = new Date(today); in60.setDate(today.getDate() + 60);
        const todayStr = today.toISOString().split('T')[0];
        const in60Str  = in60.toISOString().split('T')[0];
        const snap = await getDocs(query(collection(db,'holidays'), limit(50)));
        const upcoming = [...snap.docs]
          .map(d => d.data())
          .filter(h => h.date && h.date >= todayStr && h.date <= in60Str)
          .sort((a,b) => a.date.localeCompare(b.date));
        if (!upcoming.length) {
          holEl.innerHTML = `<p style="color:var(--text-light);font-size:13px;text-align:center;padding:8px">No upcoming holidays in the next 60 days.</p>`;
        } else {
          holEl.innerHTML = upcoming.map(h => {
            const d    = new Date(h.date + 'T00:00:00');
            const fmt  = d.toLocaleDateString('en-IN', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
            const diff = Math.round((d - today) / 86400000);
            const tag  = diff === 0 ? '<span style="background:#dc2626;color:#fff;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;margin-left:6px">TODAY</span>'
                       : diff === 1 ? '<span style="background:#f59e0b;color:#fff;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;margin-left:6px">TOMORROW</span>'
                       : `<span style="background:var(--accent);color:#fff;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;margin-left:6px">in ${diff} days</span>`;
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">
              <div>
                <div style="font-size:13px;font-weight:600;color:var(--accent-dark)">${h.reason || '—'}${tag}</div>
                <div style="font-size:11px;color:var(--text-light);margin-top:2px">${fmt} &nbsp;·&nbsp; ${h.type || 'Holiday'}</div>
              </div>
              <i class="fas fa-umbrella-beach" style="color:var(--accent);font-size:18px;opacity:0.6"></i>
            </div>`;
          }).join('');
        }
      } catch(e) {
        holEl.innerHTML = `<p style="color:var(--text-light);font-size:13px;text-align:center;padding:8px">Could not load holidays.</p>`;
      }
    }
  };

  window.loadStudentDashWidgets = async function() {
    const cls = window._studentClass || '';
    const schedEl = document.getElementById('s-dash-schedule');
    if (schedEl && !cls) {
      schedEl.innerHTML = `<p style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">Class not set on profile.</p>`;
    } else if (schedEl && !window.routineHasClass(cls)) {
      schedEl.innerHTML = `<p style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">Routine for ${cls} not configured.</p>`;
    } else if (schedEl) {
      await _renderDashScheduleRows('s-dash-schedule', null, true, window.portalClassToRoutine(cls));
    }
    await _loadRecentNotices('s-dash-notices', (aud) => aud === 'all' || aud === 'students' || aud === 'both' || aud === cls);
  };

  //  STUDENT — Homework
  // ================================================================
  window._hwUnsubscribe = null;

  window.loadStudentHomework = function() {
    const tbody=document.getElementById('s-homework-tbody');
    if(!tbody) return;
    if(window._hwUnsubscribe){window._hwUnsubscribe();window._hwUnsubscribe=null;}
    const cls=window._studentClass||'';
    if(!cls){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-light)">Class not assigned.</td></tr>';return;}
    const _hwSkel = () => `<tr><td><div class="skel" style="width:70px;height:13px"></div></td><td><div class="skel" style="width:130px;height:13px;margin-bottom:4px"></div><div class="skel" style="width:90px;height:10px"></div></td><td><div class="skel" style="width:65px;height:13px"></div></td><td><div class="skel" style="width:55px;height:13px"></div></td><td><div class="skel" style="width:52px;height:20px;border-radius:10px"></div></td></tr>`;
    tbody.innerHTML = _hwSkel() + _hwSkel() + _hwSkel();
    window._hwUnsubscribe=onSnapshot(
      query(collection(db,'homework'),where('class','==',cls),limit(20)),
      snap=>{
        if(snap.empty){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-light)">No homework assigned yet.</td></tr>';return;}
        const today=new Date().toISOString().split('T')[0]; let pending=0;
        const sorted=[...snap.docs].sort((a,b)=>(b.data().dueDate||'').localeCompare(a.data().dueDate||''));
        tbody.innerHTML=sorted.map(d=>{
          const hw=d.data(); const isPast=hw.dueDate&&hw.dueDate<today;
          const status=isPast?'<span class="badge badge-danger">Overdue</span>':'<span class="badge badge-warning">Pending</span>';
          if(!isPast) pending++;
          return `<tr><td>${hw.subject||'—'}</td><td><strong>${hw.title||'—'}</strong><br><span style="font-size:11px;color:var(--text-light)">${hw.description||''}</span></td><td>${hw.postedBy||'—'}</td><td style="font-size:13px">${hw.dueDate||'—'}</td><td>${status}</td></tr>`;
        }).join('');
        const pendEl=document.getElementById('s-stat-pending-hw'); if(pendEl) countUp(pendEl, String(pending));
      },
      e=>{tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;}
    );
  };

  // ================================================================
  //  STUDENT — Notices
  // ================================================================
  window.loadStudentNotices = async function() {
    const el=document.getElementById('s-notices-list');
    if(!el) return;
    const _nSkel = () => `<div class="notice-card"><div class="skel" style="width:20px;height:20px;border-radius:50%;flex-shrink:0;margin-top:2px"></div><div style="flex:1"><div class="skel" style="width:60%;height:14px;margin-bottom:8px"></div><div class="skel" style="width:35%;height:10px;margin-bottom:8px"></div><div class="skel" style="width:90%;height:10px;margin-bottom:4px"></div><div class="skel" style="width:70%;height:10px"></div></div></div>`;
    el.innerHTML = _nSkel() + _nSkel() + _nSkel();
    try {
      const snap=await getDocs(query(collection(db,'notices'),limit(20)));
      const cls=window._studentClass||'';
      const notices=[...snap.docs].map(d=>({id:d.id,...d.data()}))
        .filter(n=>{const aud=(n.audience||'all').toLowerCase();return aud==='all'||aud==='students'||aud==='both'||(cls&&aud===cls);})
        .sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      if(!notices.length){el.innerHTML='<div style="text-align:center;padding:24px;color:var(--text-light)">No notices available.</div>';return;}
      const icon=p=>p==='Urgent'?'fa-exclamation-circle':p==='Important'?'fa-bell':'fa-info-circle';
      const bc=p=>p==='Urgent'?'badge-danger':p==='Important'?'badge-warning':'badge-info';
      el.innerHTML=notices.map(n=>{
        const fmt=n.postedAt?new Date(n.postedAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
        return `<div class="notice-card"><div class="notice-icon"><i class="fas ${icon(n.priority)}"></i></div><div><div class="notice-title">${n.title}</div><div class="notice-date">📅 ${fmt} &nbsp;|&nbsp; <span class="badge ${bc(n.priority)}">${n.priority||'Normal'}</span></div><div class="notice-body">${n.body}</div></div></div>`;
      }).join('');
    } catch(e){el.innerHTML=`<div style="color:var(--danger);padding:16px">❌ ${e.message}</div>`;}
  };

  // ================================================================
  //  STUDENT — Attendance (dynamic, sibling-aware)
  // ================================================================
  window.loadStudentAttendance = async function() {
    const sid = (window.getActiveStudentId && window.getActiveStudentId()) || window._studentId || '';
    const cls = window._studentClass || '';
    if (!sid) return;

    // Summary card elements
    const pctEl   = document.querySelector('#s-attendance .attendance-pct');
    const msgEl   = document.querySelector('#s-attendance > .card > p');
    const presEl  = document.querySelector('#s-attendance .card div[style*="gap:32px"] div:nth-child(1) div:first-child');
    const absEl   = document.querySelector('#s-attendance .card div[style*="gap:32px"] div:nth-child(2) div:first-child');
    const totalEl = document.querySelector('#s-attendance .card div[style*="gap:32px"] div:nth-child(3) div:first-child');
    const tbody   = document.querySelector('#s-attendance .table-wrap tbody');

    try {
      if (!cls) {
        if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:16px">Class not set on your profile.</td></tr>';
        return;
      }
      const snap = await getDocs(query(collection(db, 'attendance_daily'), where('class', 'in', _classVariants(cls)), limit(300)));
      let present = 0, absent = 0, total = 0;
      const byMonth = {};
      const norm = v => String(v || '').trim().toUpperCase();
      const sidN = norm(sid);

      snap.forEach(d => {
        const a = d.data();
        const isAbsent = Array.isArray(a.absent) && a.absent.some(x => norm(x) === sidN);
        total++;
        if (isAbsent) absent++; else present++;
        // Group by month
        const month = (a.date || '').substring(0, 7); // 'YYYY-MM'
        if (month) {
          if (!byMonth[month]) byMonth[month] = { present: 0, absent: 0, total: 0 };
          byMonth[month].total++;
          if (isAbsent) byMonth[month].absent++; else byMonth[month].present++;
        }
      });

      const pct = total > 0 ? Math.round((present / total) * 100) : 0;
      const pctClass = pct >= 90 ? 'var(--success)' : pct >= 75 ? 'var(--warning)' : 'var(--danger)';
      const pctLabel = pct >= 90 ? 'Good Standing' : pct >= 75 ? 'Needs Improvement' : 'Below Minimum';

      if (pctEl) pctEl.textContent = pct + '%';
      const circleEl = document.querySelector('#s-attendance .attendance-circle');
      if (circleEl) circleEl.style.background = `conic-gradient(var(--success) 0% ${pct}%, var(--danger) ${pct}% 100%)`;
      if (msgEl) msgEl.innerHTML = `${pct}% Attendance — <span style="color:${pctClass};font-weight:700">${pctLabel}</span>`;
      if (presEl) presEl.textContent = present;
      if (absEl) absEl.textContent = absent;
      if (totalEl) totalEl.textContent = total;

      if (tbody) {
        const months = Object.keys(byMonth).sort().reverse();
        if (!months.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:16px">No attendance records yet.</td></tr>';
        } else {
          tbody.innerHTML = months.map(m => {
            const r = byMonth[m];
            const mp = r.total > 0 ? Math.round((r.present / r.total) * 100) : 0;
            const badge = mp >= 90 ? 'badge-success' : mp >= 75 ? 'badge-warning' : 'badge-danger';
            const label = new Date(m + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
            return `<tr><td>${label}</td><td>${r.total}</td><td>${r.present}</td><td>${r.absent}</td><td><span class="badge ${badge}">${mp}%</span></td></tr>`;
          }).join('');
        }
      }
    } catch (e) {
      console.warn('[Attendance] load failed:', e.message);
    }
  };

  // ================================================================
  //  STUDENT — Fees
  // ================================================================
  window.loadStudentFees = async function() {
    const listEl  = document.getElementById('s-fees-list');
    const totalEl = document.getElementById('s-fees-total');
    const badgeEl = document.getElementById('s-fees-total-badge');
    if (!listEl) return;
    const _fSkel = () => `<div class="fee-row"><div><div class="skel" style="width:110px;height:14px;margin-bottom:5px"></div><div class="skel" style="width:75px;height:10px"></div></div><div class="skel" style="width:55px;height:14px"></div></div>`;
    listEl.innerHTML = _fSkel() + _fSkel() + _fSkel() + _fSkel();
    try {
      const sid = window._studentId || '';
      if (!sid) { listEl.innerHTML = '<p style="color:var(--text-light);font-size:13px">Student ID not set.</p>'; return; }

      const snap = await getDocs(query(
        collection(db, 'fee_transactions'),
        where('studentId', '==', sid),
        limit(30)
      ));

      // Also get the student's current balance from students collection
      let currentBalance = 0, feeTotal = 0;
      const sSnap = await getDocs(query(collection(db, 'students'), where('studentId', '==', sid), limit(1)));
      if (!sSnap.empty) {
        const sd = sSnap.docs[0].data();
        feeTotal       = parseFloat(sd.feeTotal   || 0);
        currentBalance = parseFloat(sd.feeBalance !== undefined ? sd.feeBalance : feeTotal);
      }

      if (snap.empty) {
        listEl.innerHTML = '<p style="color:var(--text-light);font-size:13px;text-align:center;padding:16px">No payment records yet.</p>';
        if (totalEl) totalEl.textContent = currentBalance > 0 ? '₹' + currentBalance.toLocaleString('en-IN') : '₹0';
        if (badgeEl) {
          badgeEl.textContent  = currentBalance > 0 ? `₹${currentBalance.toLocaleString('en-IN')} Due` : 'All Paid';
          badgeEl.className    = 'badge ' + (currentBalance > 0 ? 'badge-danger' : 'badge-success');
          badgeEl.style.cssText = 'font-size:13px;padding:6px 14px';
        }
        return;
      }

      // Sort newest first client-side
      const docs = snap.docs.slice().sort((a, b) => {
        const ta = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : new Date(a.data().submittedAt || 0).getTime();
        const tb = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : new Date(b.data().submittedAt || 0).getTime();
        return tb - ta;
      });

      // Calculate total paid to detect excess
      let totalPaid = 0;
      docs.forEach(d => { if ((d.data().status||'').toLowerCase()==='approved') totalPaid += parseFloat(d.data().amount)||0; });
      const excess = feeTotal > 0 && totalPaid > feeTotal ? totalPaid - feeTotal : 0;

      const rows = docs.map(d => {
        const f  = d.data();
        const st = (f.status || 'pending').toLowerCase();
        const bc = st === 'approved' ? 'badge-success' : st === 'rejected' ? 'badge-danger' : 'badge-warning';
        const label = st === 'approved' ? 'Approved' : st === 'rejected' ? 'Rejected' : 'Pending';
        const source = f.source === 'student-portal' ? '<span style="font-size:10px;color:var(--text-light)"> · Online</span>' : '<span style="font-size:10px;color:var(--text-light)"> · Office</span>';
        const rcpt = f.receiptNo ? `<span style="font-size:11px;color:var(--text-light)"> · ${f.receiptNo}</span>` : '';
        const rcptBtn = st === 'approved'
          ? `<button onclick="showStudentReceipt('${d.id}')" style="margin-top:6px;padding:3px 10px;font-size:11px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer"><i class="fas fa-receipt" style="margin-right:4px"></i>View Receipt</button>`
          : '';
        return `<div class="fee-row" style="flex-direction:column;align-items:flex-start;gap:6px">
          <div style="display:flex;justify-content:space-between;width:100%;align-items:flex-start">
            <div>
              <div class="fee-name">${f.feeType || f.paymentMode || 'Payment'}${source}</div>
              <div class="fee-amount">₹${(f.amount || 0).toLocaleString('en-IN')} · ${f.paymentMode || f.mode || '—'}${rcpt}</div>
              <div style="font-size:11px;color:var(--text-light);margin-top:2px">${f.date || ''}</div>
            </div>
            <span class="badge ${bc}" style="align-self:flex-start">${label}</span>
          </div>
          ${rcptBtn}
        </div>`;
      }).join('');

      listEl.innerHTML = rows;

      // Excess refund message
      const exBox = document.getElementById('s-fees-excess-msg');
      const exTxt = document.getElementById('s-fees-excess-text');
      if (exBox) exBox.style.display = excess > 0 ? 'block' : 'none';
      if (exTxt && excess > 0) exTxt.textContent = `You have overpaid by ₹${excess.toLocaleString('en-IN')}. The excess amount will be refunded to you by the school office.`;

      if (totalEl) totalEl.textContent = currentBalance > 0 ? '₹' + currentBalance.toLocaleString('en-IN') : '₹0';
      if (badgeEl) {
        badgeEl.textContent   = currentBalance > 0 ? `₹${currentBalance.toLocaleString('en-IN')} Due` : 'All Paid';
        badgeEl.className     = 'badge ' + (currentBalance > 0 ? 'badge-danger' : 'badge-success');
        badgeEl.style.cssText = 'font-size:13px;padding:6px 14px';
      }
    } catch(e) { listEl.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`; }
  };

  window.submitFeeReceipt = async function() {
    const feeType = document.getElementById('s-fee-type-sel')?.value || '';
    const amount  = (document.getElementById('s-fee-amount')?.value || '').trim();
    const mode    = document.getElementById('s-fee-mode')?.value || '';
    const txn     = (document.getElementById('s-fee-txn')?.value || '').trim();
    const date    = document.getElementById('s-fee-date')?.value || '';
    const file    = document.getElementById('s-fee-receipt-img')?.files[0];
    let _valid = true;
    const _markErr = id => {
      const el = document.getElementById(id); if (!el) return;
      el.classList.add('field-error');
      el.addEventListener('input', () => el.classList.remove('field-error'), { once: true });
    };
    if (!feeType)                        { _markErr('s-fee-type-sel'); _valid = false; }
    if (!amount || parseFloat(amount) <= 0) { _markErr('s-fee-amount');   _valid = false; }
    if (!txn)                            { _markErr('s-fee-txn');      _valid = false; }
    if (!date)                           { _markErr('s-fee-date');      _valid = false; }
    if (!_valid) { showToast('⚠️ Please fill in all required fields.'); return; }

    const btn      = document.getElementById('s-fee-submit-btn');
    const progBox  = document.getElementById('s-fee-upload-progress');
    const progBar  = document.getElementById('s-fee-progress-bar');
    const progText = document.getElementById('s-fee-progress-text');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…'; }

    try {
      // 1. Upload receipt screenshot to Cloudinary if provided
      let receiptUrl = '';
      if (file) {
        const { cloudName, preset } = getCloudinaryConfig();
        if (!cloudName || !preset) { showToast('⚠️ Cloudinary not configured. Ask admin to set it up.'); return; }
        if (progBox) progBox.style.display = 'block';
        const fd = new FormData();
        fd.append('file', file);
        fd.append('upload_preset', preset);
        fd.append('folder', 'fee_receipts');
        receiptUrl = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`);
          xhr.upload.onprogress = e => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 90) + 5;
              if (progBar)  progBar.style.width = pct + '%';
              if (progText) progText.textContent = `Uploading receipt… ${pct}%`;
            }
          };
          xhr.onload = () => {
            if (xhr.status === 200) { resolve(JSON.parse(xhr.responseText).secure_url); }
            else { try { reject(new Error(JSON.parse(xhr.responseText).error?.message || 'Upload failed')); } catch { reject(new Error('Upload failed')); } }
          };
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(fd);
        });
        if (progBar)  progBar.style.width = '100%';
        if (progText) progText.textContent = 'Upload complete!';
      }

      // 2. Get current student balance
      const sid = window._studentId || '';
      let balanceBefore = 0, feeTotal = 0;
      if (sid) {
        const sSnap = await getDocs(query(collection(db, 'students'), where('studentId', '==', sid), limit(1)));
        if (!sSnap.empty) {
          const sd = sSnap.docs[0].data();
          feeTotal      = parseFloat(sd.feeTotal  || 0);
          balanceBefore = parseFloat(sd.feeBalance !== undefined ? sd.feeBalance : feeTotal);
        }
      }
      const amtNum      = parseFloat(amount);
      const balanceAfter = Math.max(0, balanceBefore - amtNum);

      // 3. Save to fee_transactions as pending
      await addDoc(collection(db, 'fee_transactions'), {
        studentId:    sid,
        studentName:  window._studentName  || '',
        studentClass: window._studentClass || '',
        feeType,
        amount:       amtNum,
        paymentMode:  mode,
        receiptNo:    txn,
        date,
        status:       'pending',
        receiptUrl,
        staffName:    (window._studentName || 'Student') + ' (self)',
        balanceBefore,
        balanceAfter,
        feeTotal,
        source:       'student-portal',
        submittedAt:  new Date().toISOString(),
        createdAt:    serverTimestamp()
      });

      // 4. Reset form
      ['s-fee-type-sel','s-fee-amount','s-fee-txn','s-fee-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      const fi = document.getElementById('s-fee-receipt-img'); if (fi) fi.value = '';
      showToast('✅ Payment submitted — awaiting office approval.');
      loadStudentFees();
    } catch(e) {
      showToast('❌ ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit for Approval'; }
      setTimeout(() => { if (progBox) progBox.style.display = 'none'; if (progBar) progBar.style.width = '0%'; }, 1500);
    }
  };

  // ================================================================
  //  TEACHER — Portal loader
  // ================================================================
  window.loadTeacherPortal = async function(user) {
    try {
      const userDoc=await getDoc(doc(db,'users',user.uid));
      if(!userDoc.exists()) return;
      const userData=userDoc.data();
      const teacherId=userData.teacherId||userData.loginId||'';
      window._teacherId=teacherId; window._teacherName=userData.name||'Teacher';
      if(!teacherId) return;

      // 1. Try direct uid lookup (populated by TA save mirror sync)
      let t = null;
      const directSnap = await getDoc(doc(db,'teachers',user.uid));
      if (directSnap.exists()) t = directSnap.data();

      // 2. Fall back to teacherId field query (all case variants)
      if (!t) {
        let snap=await getDocs(query(collection(db,'teachers'),where('teacherId','==',teacherId)));
        if(snap.empty) snap=await getDocs(query(collection(db,'teachers'),where('teacherId','==',teacherId.toUpperCase())));
        if(snap.empty) snap=await getDocs(query(collection(db,'teachers'),where('loginId','==',teacherId)));
        if(!snap.empty) t=snap.docs[0].data();
      }

      if(!t){ showToast('⚠️ Teacher profile not found. Ask admin to open your assignment panel and click Save.'); return; }

      // Prefer classTeacherOf (TA panel) over classTeacher (legacy profile field)
      const _R2N={I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10};
      let effectiveClass = t.classTeacher || '';
      if (t.classTeacherOf) {
        const ctRoman = t.classTeacherOf.split('-')[0];
        effectiveClass = _R2N[ctRoman] || parseInt(ctRoman) || effectiveClass;
      }
      // Also check /users fields synced by TA panel
      if (userData.tpClassTeacherOf) {
        const ctRoman = userData.tpClassTeacherOf.split('-')[0];
        effectiveClass = _R2N[ctRoman] || parseInt(ctRoman) || effectiveClass;
      }

      window._currentTeacherClass=effectiveClass||''; window._teacherSubjects=t.subjects||'';
      const classLabel={PLG:'Play Group',SKG:'SKG',LKG:'LKG'};
      const getClsLabel=c=>classLabel[c]||(c?'Class '+c:'—');
      const titleStr=(t.title&&t.title!=='Miss'?t.title+' ':t.gender==='M'?'Mr. ':'Ms. ');
      const hdrName=document.querySelector('#page-teacher-dash .dash-username');
      if(hdrName) hdrName.textContent=titleStr+t.name;
      const hdrRole=document.querySelector('#page-teacher-dash .dash-role');
      if(hdrRole) hdrRole.textContent=`${t.subjects||'Teacher'} · ${effectiveClass?getClsLabel(effectiveClass):'—'}`;
      const tStatClass=document.getElementById('t-stat-class'); if(tStatClass) tStatClass.textContent=effectiveClass?getClsLabel(effectiveClass):'—';
      const tStatSub=document.getElementById('t-stat-subjects'); if(tStatSub) tStatSub.textContent=t.subjects||'—';
      const tClassHd=document.getElementById('t-class-heading'); if(tClassHd) tClassHd.textContent=effectiveClass?getClsLabel(effectiveClass):'My Class';
      const tAttHd=document.getElementById('t-att-heading'); if(tAttHd) tAttHd.textContent=effectiveClass?getClsLabel(effectiveClass):'My Class';
      if(effectiveClass){
        const sSnap=await getDocs(query(collection(db,'students'),where('class','==',String(effectiveClass)),orderBy('rollNo')));
        const tStatStu=document.getElementById('t-stat-students'); if(tStatStu) tStatStu.textContent=sSnap.size;
        window._teacherStudentDocs=sSnap.docs;
        renderTeacherStudentList(sSnap.docs);
        initTeacherAttendance(effectiveClass);
      }
      populateHwClassSelect(); loadTeacherHomework(); loadTeacherNotices();
      if (window.loadTeacherDashWidgets) loadTeacherDashWidgets();
      loadLeaveHistory();
    } catch(e){ showToast('⚠️ Teacher portal: '+e.message); }
  };

  window.loadTeacherProfile = async function() {
    const user = window._firebaseAuth?.currentUser; if (!user) return;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || '—'; };
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      const teacherId = userData.teacherId || userData.loginId || '';
      set('t-profile-email', user.email);
      if (teacherId) {
        const snap = await getDocs(query(collection(db, 'teachers'), where('teacherId', '==', teacherId)));
        if (!snap.empty) {
          const t = snap.docs[0].data();
          const classLabel = { PLG:'Play Group', SKG:'SKG', LKG:'LKG' };
          const getClsLabel = c => classLabel[c] || (c ? 'Class '+c : '—');
          const initials = (t.name||'T').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
          const avatar = document.getElementById('t-profile-avatar'); if (avatar) avatar.textContent = initials;
          set('t-profile-name',     (t.title ? t.title+' ' : '') + (t.name||''));
          set('t-profile-role',     t.subjects || 'Teacher');
          set('t-profile-id',       teacherId);
          set('t-profile-class',    t.classTeacher ? getClsLabel(t.classTeacher) : '—');
          set('t-profile-subjects', t.subjects || '—');
          set('t-profile-gender',   t.gender === 'M' ? 'Male' : t.gender === 'F' ? 'Female' : t.gender || '—');
          set('t-profile-phone',    t.phone || t.mobile || '—');
        }
      }
    } catch(e) { showToast('⚠️ Could not load profile: ' + e.message); }
  };

  window.teacherChangePassword = async function() {
    const current = document.getElementById('t-pwd-current')?.value || '';
    const newPwd  = document.getElementById('t-pwd-new')?.value || '';
    const confirm = document.getElementById('t-pwd-confirm')?.value || '';
    if (!current || !newPwd || !confirm) { showToast('⚠️ All password fields are required.'); return; }
    if (newPwd.length < 6) { showToast('⚠️ New password must be at least 6 characters.'); return; }
    if (newPwd !== confirm) { showToast('⚠️ New passwords do not match.'); return; }
    const user = window._firebaseAuth?.currentUser; if (!user) { showToast('⚠️ Not logged in.'); return; }
    try {
      const { EmailAuthProvider, reauthenticateWithCredential } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
      const cred = EmailAuthProvider.credential(user.email, current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPwd);
      ['t-pwd-current','t-pwd-new','t-pwd-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
      showToast('✅ Password updated successfully.');
    } catch(e) {
      if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') showToast('❌ Current password is incorrect.');
      else showToast('❌ ' + e.message);
    }
  };

  window.submitLeaveApplication = async function() {
    const from   = (document.getElementById('lv-from')?.value   || '').trim();
    const to     = (document.getElementById('lv-to')?.value     || '').trim();
    const type   = (document.getElementById('lv-type')?.value   || '').trim();
    const reason = (document.getElementById('lv-reason')?.value || '').trim();
    if (!from || !to || !reason) { showToast('⚠️ From date, To date and Reason are required.'); return; }
    if (from > to) { showToast('⚠️ "From" date cannot be after "To" date.'); return; }
    const auth = window._firebaseAuth;
    const user = auth?.currentUser;
    if (!user) { showToast('⚠️ Not logged in.'); return; }
    try {
      // Overlap and quota checks
      const existingSnap = await getDocs(query(
        collection(db, 'leave_applications'),
        where('uid', '==', user.uid),
        where('status', 'in', ['Pending', 'Approved'])
      ));
      const hasOverlap = existingSnap.docs.some(d => {
        const l = d.data();
        return l.from <= to && l.to >= from;
      });
      if (hasOverlap) {
        showToast('⚠️ You already have a Pending or Approved leave overlapping these dates.');
        return;
      }
      const settingsSnap = await getDoc(doc(db, 'settings', 'leave_config'));
      const quota = settingsSnap.exists() ? (settingsSnap.data().annualQuota || 15) : 15;
      const daysTaken = existingSnap.docs.filter(d => d.data().status === 'Approved')
        .reduce((sum, d) => sum + _calcDays(d.data().from, d.data().to), 0);
      const requested = _calcDays(from, to);
      if (daysTaken + requested > quota) {
        showToast(`⚠️ This leave (${requested}d) would exceed your annual quota of ${quota} days (${quota - daysTaken}d remaining). Submitting anyway.`);
      }
      await addDoc(collection(db, 'leave_applications'), {
        uid: user.uid,
        teacherId: window._teacherId || '',
        teacherName: window._teacherName || user.displayName || user.email,
        teacherClass: window._currentTeacherClass || '—',
        from, to, type, reason,
        status: 'Pending',
        createdAt: new Date().toISOString(),
      });
      ['lv-from','lv-to','lv-reason'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
      showToast('✅ Leave application submitted for approval.');
      loadLeaveHistory();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  function _calcDays(from, to) {
    if (!from || !to) return 1;
    return Math.max(1, Math.round((new Date(to+'T00:00:00') - new Date(from+'T00:00:00')) / 86400000));
  }

  async function loadLeaveSummary(uid) {
    try {
      const [settingsSnap, leaveSnap] = await Promise.all([
        getDoc(doc(db,'settings','leave_config')),
        getDocs(query(collection(db,'leave_applications'), where('uid','==',uid)))
      ]);
      const quota = settingsSnap.exists() ? (settingsSnap.data().annualQuota || 15) : 15;
      const daysTaken = leaveSnap.docs.filter(d=>d.data().status==='Approved').reduce((sum,d)=>sum+_calcDays(d.data().from,d.data().to),0);
      const balance = quota - daysTaken;
      const pct = Math.min(100, Math.round((daysTaken/quota)*100));
      const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      set('lv-quota-val', quota); set('lv-taken-val', daysTaken); set('lv-balance-val', Math.max(0,balance));
      set('lv-year-label', 'Academic year '+new Date().getFullYear());
      const fill = document.getElementById('lv-quota-bar-fill');
      if (fill) { fill.style.width=pct+'%'; fill.style.background=pct>=100?'#dc2626':pct>=70?'#d97706':'#16a34a'; }
      const cap = document.getElementById('lv-quota-bar-caption');
      if (cap) cap.textContent=`${daysTaken} of ${quota} days used (${pct}%)`;
      const stat = document.getElementById('lv-balance-stat');
      if (stat) stat.className='lv-stat lv-stat-balance'+(balance<=0?' over':balance<=3?' warn':'');
    } catch(e) { console.warn('Leave summary:',e.message); }
  }

  window.loadLeaveHistory = async function loadLeaveHistory() {
    const tbody = document.getElementById('lv-history-tbody');
    if (!tbody) return;
    const user = window._firebaseAuth?.currentUser;
    if (!user) return;
    try {
      const snap = await getDocs(query(collection(db,'leave_applications'), where('uid','==',user.uid), orderBy('createdAt','desc'), limit(30)));
      await loadLeaveSummary(user.uid);
      if (snap.empty) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:16px">No leave applications yet.</td></tr>'; return; }
      const fmt = s => s ? new Date(s+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
      const bc  = { Pending:'badge-warning', Approved:'badge-success', Rejected:'badge-danger' };
      tbody.innerHTML = snap.docs.map(d => {
        const l = d.data(); const days = _calcDays(l.from, l.to); const cls = (l.status||'pending').toLowerCase();
        return `<tr class="lv-ledger-row ${cls}">
          <td>${fmt(l.from)} → ${fmt(l.to)}</td>
          <td><span class="lv-days-chip">${days}d</span></td>
          <td style="font-size:12px">${l.type||'—'}</td>
          <td style="font-size:12px;max-width:180px;white-space:normal">${l.reason||'—'}</td>
          <td><span class="badge ${bc[l.status]||'badge-info'}">${l.status||'—'}</span></td>
        </tr>`;
      }).join('');
    } catch(e) { tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`; }
  };

  window.saveLeaveQuota = async function() {
    const quota = parseInt(document.getElementById('a-leave-quota-input')?.value || 0);
    if (!quota || quota < 1) { showToast('⚠️ Enter a valid quota (minimum 1 day).'); return; }
    try {
      await setDoc(doc(db,'settings','leave_config'), {annualQuota:quota, updatedAt:new Date().toISOString()}, {merge:true});
      showToast('✅ Quota set to '+quota+' days for all teachers.');
      const disp = document.getElementById('a-leave-quota-display'); if (disp) disp.textContent = quota+' days';
    } catch(e) { showToast('❌ '+e.message); }
  };

  window.loadLeaveQuota = async function() {
    try {
      const d = await getDoc(doc(db,'settings','leave_config'));
      const quota = d.exists() ? (d.data().annualQuota||15) : 15;
      const inp = document.getElementById('a-leave-quota-input'); if(inp) inp.value=quota;
      const disp = document.getElementById('a-leave-quota-display'); if(disp) disp.textContent=quota+' days';
    } catch(e) { console.warn('loadLeaveQuota:',e.message); }
  };

  // ── ADMIN REPORT CARD CONTROL PANEL ─────────────────────────────────────────

  // Populate class dropdown once from Firestore 'classes' collection
  async function arcLoadClasses() {
    const sel = document.getElementById('arc-class-select');
    if (!sel || sel.options.length > 1) return; // already loaded
    try {
      const snap = await getDocs(collection(db, 'classes'));
      snap.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id.split('-')[0].trim(); // "IX-A" → "IX", "III-B" → "III"
        opt.textContent = d.id;
        sel.appendChild(opt);
      });
    } catch(e) { console.warn('arcLoadClasses:', e.message); }
  }

  window.loadAdminReportCards = async function() {
    await arcLoadClasses();
    const classId = document.getElementById('arc-class-select')?.value;
    const tbody   = document.getElementById('arc-tbody');
    const msg     = document.getElementById('arc-status-msg');
    const relBtn  = document.getElementById('arc-release-all-btn');
    if (!tbody) return;
    if (!classId) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">Select a class above.</td></tr>';
      if (msg) msg.textContent = 'Select a class to view locked report cards.';
      if (relBtn) relBtn.style.display = 'none';
      return;
    }
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';

    try {
      // Read FT docs (final term has the promotion decision)
      const ftSnap = await getDocs(collection(db, 'marks', `${classId}_FT`, 'students'));
      const hySnap = await getDocs(collection(db, 'marks', `${classId}_HY`, 'students'));
      const hyMap  = {};
      hySnap.forEach(d => { hyMap[d.id] = d.data(); });

      if (ftSnap.empty) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No locked records found for this class.</td></tr>';
        if (msg) msg.textContent = 'No data yet.';
        if (relBtn) relBtn.style.display = 'none';
        return;
      }

      // Sort by roll number
      const rows = [];
      ftSnap.forEach(d => rows.push({ id: d.id, ft: d.data(), hy: hyMap[d.id] || {} }));
      rows.sort((a,b) => (a.ft.rollNo||999) - (b.ft.rollNo||999));

      tbody.innerHTML = '';
      let lockedCount = 0;

      rows.forEach(({ id, ft, hy }) => {
        if (ft.status !== 'locked') return; // only show locked
        lockedCount++;
        const hyTotal = _arcCalcTotal(hy.academics);
        const ftTotal = _arcCalcTotal(ft.academics);
        const autoPass = _arcAutoPass(ft.academics);
        const decision = ft.adminDecision || '';
        const released = ft.releasedToStudent === true;

        const resultLabel = decision
          ? `<span style="color:${decision==='Detained'?'#ef4444':'#16a34a'};font-weight:600">${decision}</span>`
          : (autoPass
              ? '<span style="color:#16a34a;font-weight:600">PASS</span>'
              : '<span style="color:#ef4444;font-weight:600">FAIL</span>');

        const decisionSelect = (!autoPass && !decision) || decision === 'Detained' || decision === 'Promoted with Grace'
          ? `<select onchange="arcSetDecision('${id}','${classId}',this.value)" style="padding:4px 8px;border-radius:6px;border:1.5px solid #ccc;font-size:12px">
               <option value="" ${!decision?'selected':''}>— Set Decision —</option>
               <option value="Promoted with Grace" ${decision==='Promoted with Grace'?'selected':''}>Promoted with Grace</option>
               <option value="Detained" ${decision==='Detained'?'selected':''}>Detained</option>
             </select>`
          : `<span style="color:#6b7280;font-size:12px">${decision || 'Auto-Promoted'}</span>`;

        const relIcon = released
          ? '<i class="fas fa-check-circle" style="color:#16a34a"></i> Yes'
          : '<i class="fas fa-times-circle" style="color:#9ca3af"></i> No';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${ft.rollNo||'—'}</td>
          <td>${ft.studentName||id}</td>
          <td>${hyTotal !== null ? hyTotal : '—'}</td>
          <td>${ftTotal !== null ? ftTotal : '—'}</td>
          <td>${resultLabel}</td>
          <td>${decisionSelect}</td>
          <td>${relIcon}</td>
          <td>
            <button class="btn btn-sm btn-outline" style="font-size:11px" onclick="arcViewReportCard('${id}','${classId}')"><i class="fas fa-eye"></i> View</button>
            ${!released ? `<button class="btn btn-sm" style="font-size:11px;background:#2563eb;color:#fff;border:none;margin-left:4px" onclick="arcReleaseOne('${id}','${classId}')"><i class="fas fa-unlock"></i> Release</button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      });

      if (lockedCount === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No locked records yet. Class teacher must lock the records first.</td></tr>';
      }
      if (msg) msg.textContent = `${lockedCount} locked student record(s) for Class ${classId}.`;
      if (relBtn) relBtn.style.display = lockedCount > 0 ? '' : 'none';
      relBtn.dataset.classId = classId;

    } catch(e) {
      console.error('loadAdminReportCards:', e);
      tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444;text-align:center;padding:18px">${e.message}</td></tr>`;
    }
  };

  // Sum all subject totals from academics object
  function _arcCalcTotal(academics) {
    if (!academics) return null;
    let sum = 0, found = false;
    for (const v of Object.values(academics)) {
      if (v && typeof v.total === 'number') { sum += v.total; found = true; }
    }
    return found ? sum : null;
  }

  // Auto-pass: true if every subject total >= passmark (30)
  function _arcAutoPass(academics) {
    if (!academics) return false;
    return Object.values(academics).every(v => !v || v.total >= 30);
  }

  window.arcSetDecision = async function(studentId, classId, decision) {
    if (!decision) return;
    try {
      const ref = doc(db, 'marks', `${classId}_FT`, 'students', studentId);
      await setDoc(ref, { adminDecision: decision, adminDecisionAt: new Date().toISOString() }, { merge: true });
      showToast('✅ Decision saved: ' + decision);
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.arcReleaseOne = async function(studentId, classId) {
    try {
      const ref = doc(db, 'marks', `${classId}_FT`, 'students', studentId);
      await setDoc(ref, { releasedToStudent: true, releasedAt: new Date().toISOString() }, { merge: true });
      showToast('✅ Report card released to student.');
      loadAdminReportCards();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.arcReleaseAll = async function() {
    const classId = document.getElementById('arc-release-all-btn')?.dataset.classId;
    if (!classId) return;
    if (!confirm(`Release ALL locked report cards for Class ${classId} to students? Only students with cleared fees will be able to view them.`)) return;
    try {
      const snap = await getDocs(collection(db, 'marks', `${classId}_FT`, 'students'));
      const batch = writeBatch(db);
      snap.forEach(d => {
        if (d.data().status === 'locked') {
          batch.set(d.ref, { releasedToStudent: true, releasedAt: new Date().toISOString() }, { merge: true });
        }
      });
      await batch.commit();
      showToast('✅ All report cards released.');
      loadAdminReportCards();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.arcViewReportCard = async function(studentId, classId) {
    showToast('Loading report card…');
    try {
      const hyDoc = await getDoc(doc(db, 'marks', `${classId}_HY`, 'students', studentId));
      const ftDoc = await getDoc(doc(db, 'marks', `${classId}_FT`, 'students', studentId));
      if (!ftDoc.exists()) { showToast('❌ No FT data found.'); return; }
      // Store in sessionStorage and open reportcard.html
      const payload = { hyData: hyDoc.data()||{}, ftData: ftDoc.data()||{}, classId };
      sessionStorage.setItem('sfds_adminRC', JSON.stringify(payload));
      window.open('/Sfs-report-card/markentry.html?adminRC=' + encodeURIComponent(classId + '/' + studentId), '_blank');
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.loadAdminLeave = async function() {
    const tbody = document.getElementById('a-leave-tbody'); if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
    const filter = document.getElementById('a-leave-filter')?.value || 'Pending';
    try {
      let q = collection(db,'leave_applications');
      const snap = await getDocs(filter === 'all' ? q : query(q, where('status','==',filter)));
      if (snap.empty) { tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:18px;color:var(--text-light)">No leave applications found.</td></tr>'; return; }
      const fmt = s => s ? new Date(s+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
      const fmtTs = s => s ? new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
      const bc = { Pending:'badge-warning', Approved:'badge-success', Rejected:'badge-danger' };
      const sorted = [...snap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      tbody.innerHTML = sorted.map(d => {
        const l = d.data();
        const actions = l.status==='Pending'
          ? `<div style="display:flex;gap:4px"><button class="btn btn-sm" style="background:var(--success);color:#fff" onclick="adminApproveLeave('${d.id}')"><i class="fas fa-check"></i> Approve</button><button class="btn btn-sm" style="background:var(--danger);color:#fff" onclick="adminRejectLeave('${d.id}')"><i class="fas fa-times"></i> Reject</button></div>`
          : `<span class="badge ${bc[l.status]||'badge-info'}">${l.status}</span>`;
        return `<tr><td>${l.teacherName||'—'}</td><td style="font-size:12px">${l.teacherId||'—'}</td><td>${l.teacherClass||'—'}</td><td style="font-size:12px">${l.type||'—'}</td><td>${fmt(l.from)}</td><td>${fmt(l.to)}</td><td style="font-size:12px;max-width:120px;white-space:normal">${l.reason||'—'}</td><td style="font-size:11px;color:var(--text-light)">${fmtTs(l.createdAt)}</td><td><span class="badge ${bc[l.status]||'badge-info'}">${l.status||'—'}</span></td><td>${actions}</td></tr>`;
      }).join('');
    } catch(e) { tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`; }
  };

  window.adminApproveLeave = async function(docId) {
    try { await setDoc(doc(db,'leave_applications',docId),{status:'Approved',updatedAt:new Date().toISOString()},{merge:true}); showToast('✅ Leave approved.'); loadAdminLeave(); } catch(e){showToast('❌ '+e.message);}
  };
  window.adminRejectLeave = async function(docId) {
    try { await setDoc(doc(db,'leave_applications',docId),{status:'Rejected',updatedAt:new Date().toISOString()},{merge:true}); showToast('Leave rejected.'); loadAdminLeave(); } catch(e){showToast('❌ '+e.message);}
  };

  window.renderTeacherStudentList = function renderTeacherStudentList(docs) {
    const tbody=document.getElementById('teacher-student-tbody');
    if(!tbody) return;
    if(!docs||!docs.length){tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-light)">No students found.</td></tr>';return;}
    tbody.innerHTML=docs.map(d=>{
      const s=d.data();
      const waNum=(s.whatsapp||'').replace(/[^0-9]/g,'');
      return `<tr><td>${s.rollNo||'—'}</td><td><strong>${s.name||'—'}</strong></td><td>${s.gender==='M'?'Male':s.gender==='F'?'Female':s.gender||'—'}</td><td><span class="badge badge-info">${s.bloodGroup||'—'}</span></td><td style="font-size:12px">${s.whatsapp||'—'}</td><td>${waNum?`<a href="https://wa.me/${waNum}" target="_blank" class="btn btn-sm btn-success" style="font-size:11px"><i class="fab fa-whatsapp"></i></a>`:'—'}</td></tr>`;
    }).join('');
  };

  window.exportTeacherClassList = function() {
    const docs = window._teacherStudentDocs;
    if (!docs || !docs.length) { showToast('⚠️ No student data to export.'); return; }
    const rows = [['Roll No', 'Name', 'Gender', 'Blood Group', 'WhatsApp', 'Class']];
    docs.forEach(d => {
      const s = d.data();
      rows.push([s.rollNo||'', s.name||'', s.gender||'', s.bloodGroup||'', s.whatsapp||'', s.class||'']);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Class_${window._currentTeacherClass||'List'}_Students.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ================================================================
  //  TEACHER — Attendance (card-based exceptions-only UI)
  // ================================================================
  window.initTeacherAttendance = async function(classNum) {
    window._attClass = classNum;
    window._attEditMode = false;
    window._monthLockCache = {};
    window._teacherStudentDocs = null;
    const dateInp = document.getElementById('t-att-date');
    if (dateInp && !dateInp.value) dateInp.value = new Date().toISOString().split('T')[0];
    const search = document.getElementById('att-search');
    if (search) search.value = '';
    try {
      const snap = await getDocs(query(collection(db,'students'), where('class','==',String(classNum)), orderBy('rollNo')));
      window._teacherStudentDocs = snap.docs;
    } catch(e) { showToast('⚠️ Could not load students: ' + e.message); }
    loadAttendanceForDate();
  };

  async function isMonthLocked(classNum, date) {
    const cacheKey = classNum + '_' + date.slice(0, 7);
    if (window._monthLockCache && cacheKey in window._monthLockCache) return window._monthLockCache[cacheKey];
    if (!window._monthLockCache) window._monthLockCache = {};
    const monthYear = date.substring(0,4) + '_' + date.substring(5,7);
    try {
      const mDoc = await getDoc(doc(db,'attendance_monthly',`${classNum}_${monthYear}`));
      window._monthLockCache[cacheKey] = mDoc.exists() && mDoc.data().status === 'locked';
      return window._monthLockCache[cacheKey];
    } catch(e) { return false; }
  }

  window.loadAttendanceForDate = async function() {
    const date = document.getElementById('t-att-date')?.value; if (!date) return;
    const classNum = window._attClass || window._currentTeacherClass; if (!classNum) return;
    const lockBanner  = document.getElementById('t-att-lock-banner');
    const holidayBanner = document.getElementById('t-att-holiday-banner');
    const alreadyMarked = document.getElementById('t-att-already-marked');
    const saveBtn = document.getElementById('t-save-att-btn');
    if (lockBanner)    lockBanner.style.display = 'none';
    if (holidayBanner) holidayBanner.style.display = 'none';
    if (alreadyMarked) alreadyMarked.style.display = 'none';
    try {
      const locked = await isMonthLocked(classNum, date);
      if (locked) {
        if (lockBanner) lockBanner.style.display = 'block';
        if (saveBtn) saveBtn.style.display = 'none';
        const attDoc = await getDoc(doc(db,'attendance_daily',`${classNum}_${date}`));
        renderAttendanceCards(window._teacherStudentDocs || [], attDoc.exists()?attDoc.data():null, false, true);
        return;
      }
      const hSnap = await getDocs(query(collection(db,'holidays'), where('date','==',date)));
      if (!hSnap.empty) {
        const h = hSnap.docs[0].data();
        if (holidayBanner) { holidayBanner.style.display='block'; document.getElementById('t-att-holiday-msg').textContent=`${h.reason} (${h.type})`; }
        if (saveBtn) saveBtn.style.display = 'none';
        renderAttendanceCards([], null, true); return;
      }
      if (saveBtn) saveBtn.style.display = '';
      const attId = `${classNum}_${date}`;
      const attDoc = await getDoc(doc(db,'attendance_daily',attId));
      const existingData = attDoc.exists() ? attDoc.data() : null;
      const viewOnly = !!(existingData && !window._attEditMode);
      if (viewOnly) { if (alreadyMarked) alreadyMarked.style.display = 'block'; }
      renderAttendanceCards(window._teacherStudentDocs || [], existingData, false, viewOnly);
    } catch(e) { showToast('⚠️ ' + e.message); }
  };

  function renderAttendanceCards(students, existingData, isHoliday=false, readOnly=false) {
    const grid = document.getElementById('att-card-grid'); if (!grid) return;
    const saveBtn = document.getElementById('t-save-att-btn');
    if (isHoliday || !students.length) {
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-light)">${isHoliday ? '<i class="fas fa-calendar-times" style="margin-right:6px"></i>Holiday — no attendance required.' : '<i class="fas fa-info-circle" style="margin-right:6px"></i>No students found for this class.'}</p>`;
      if (saveBtn && isHoliday) saveBtn.style.display = 'none';
      document.getElementById('att-summary').textContent = '';
      return;
    }
    const absentSet = new Set(existingData?.absent || []);
    const lateSet   = new Set(existingData?.late   || []);
    grid.innerHTML = students.map(d => {
      const s = d.data();
      const sid = s.studentId || String(s.rollNo);
      const state = absentSet.has(sid) ? 1 : lateSet.has(sid) ? 2 : 0;
      const cls   = state===1 ? 'absent' : state===2 ? 'late' : 'present';
      const badge = state===1 ? 'Absent'  : state===2 ? 'Late'  : 'Present';
      const clickAttr = readOnly ? '' : 'onclick="toggleAttCard(this)"';
      const cursor = readOnly ? 'cursor:default;opacity:0.8;' : '';
      return `<div class="att-card ${cls}" data-sid="${sid}" data-roll="${s.rollNo}" data-name="${s.name}" data-state="${state}" ${clickAttr} style="${cursor}">
        <div class="att-card-roll">${s.rollNo}</div>
        <div class="att-card-name">${s.name}</div>
        <div class="att-card-badge">${badge}</div>
      </div>`;
    }).join('');
    updateAttSummary();
  }

  window.toggleAttCard = function(card) {
    const state = (parseInt(card.dataset.state) + 1) % 3;
    card.dataset.state = state;
    card.className = 'att-card ' + (state===0 ? 'present' : state===1 ? 'absent' : 'late');
    card.querySelector('.att-card-badge').textContent = state===0 ? 'Present' : state===1 ? 'Absent' : 'Late';
    updateAttSummary();
  };

  window.filterAttCards = function(q) {
    const term = q.trim().toLowerCase();
    document.querySelectorAll('#att-card-grid .att-card').forEach(c => {
      const match = !term || c.dataset.name.toLowerCase().includes(term) || String(c.dataset.roll).includes(term);
      c.style.display = match ? '' : 'none';
    });
  };

  function updateAttSummary() {
    const cards = document.querySelectorAll('#att-card-grid .att-card');
    let present=0, absent=0, late=0;
    cards.forEach(c => { const s=parseInt(c.dataset.state); if(s===1) absent++; else if(s===2) late++; else present++; });
    const el = document.getElementById('att-summary');
    if (el) el.textContent = `${present} Present · ${absent} Absent · ${late} Late`;
  }

  window.markAllAttendance = function(status) {
    const stateMap = { P:0, A:1, L:2 };
    const clsMap   = { P:'present', A:'absent', L:'late' };
    const lblMap   = { P:'Present', A:'Absent', L:'Late' };
    const state = stateMap[status];
    document.querySelectorAll('#att-card-grid .att-card').forEach(c => {
      if (c.style.display === 'none') return;
      c.dataset.state = state;
      c.className = 'att-card ' + clsMap[status];
      c.querySelector('.att-card-badge').textContent = lblMap[status];
    });
    updateAttSummary();
  };

  window.saveAttendance = async function() {
    const date = document.getElementById('t-att-date')?.value;
    const classNum = window._attClass || window._currentTeacherClass;
    if (!date || !classNum) { showToast('⚠️ Date or class missing.'); return; }
    if (await isMonthLocked(classNum, date)) { showToast('🔒 This month\'s records have been locked by Admin.'); return; }
    const cards = document.querySelectorAll('#att-card-grid .att-card');
    if (!cards.length) { showToast('⚠️ No students loaded.'); return; }
    const absent=[], late=[];
    cards.forEach(c => { const s=parseInt(c.dataset.state); if(s===1) absent.push(c.dataset.sid); else if(s===2) late.push(c.dataset.sid); });
    const total = cards.length;
    const present = total - absent.length - late.length;
    const btn = document.getElementById('t-save-att-btn');
    if (btn) { btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving...'; btn.disabled=true; }
    try {
      await setDoc(doc(db,'attendance_daily',`${classNum}_${date}`), {
        class: classNum, date, absent, late, present, total,
        savedBy: window._teacherId||'teacher', savedAt: new Date().toISOString()
      });
      showToast('✅ Attendance saved!');
      const am = document.getElementById('t-att-already-marked'); if (am) am.style.display='block';
    } catch(e) { showToast('❌ ' + e.message); }
    finally { if (btn) { btn.innerHTML='<i class="fas fa-save"></i> Save Attendance'; btn.disabled=false; } }
  };

  window.loadAttendanceHistory = async function() {
    const tbody = document.getElementById('t-att-history-tbody'); if (!tbody) return;
    const classNum = window._attClass || window._currentTeacherClass;
    if (!classNum) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--text-light)">Class not set.</td></tr>'; return; }
    const monthFilter = document.getElementById('att-history-month')?.value || '';
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    try {
      let q = query(collection(db,'attendance_daily'), where('class','==',String(classNum)), limit(90));
      const snap = await getDocs(q);
      if (snap.empty) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--text-light)">No history found.</td></tr>'; return; }
      let docs = [...snap.docs].sort((a,b)=>b.data().date.localeCompare(a.data().date));
      if (monthFilter) docs = docs.filter(d => (d.data().date||'').startsWith(monthFilter));
      if (!docs.length) { tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--text-light)">No records for selected month.</td></tr>'; return; }
      window._attHistoryDocs = docs;
      tbody.innerHTML = docs.map(d => {
        const a=d.data();
        const pct = a.total>0 ? Math.round((a.present/a.total)*100) : 0;
        const day = a.date ? new Date(a.date+'T00:00:00').toLocaleDateString('en',{weekday:'short'}) : '—';
        const bc  = pct>=90 ? 'badge-success' : pct>=75 ? 'badge-warning' : 'badge-danger';
        return `<tr><td>${a.date||'—'}</td><td>${day}</td><td style="color:var(--success);font-weight:700">${a.present||0}</td><td style="color:var(--danger);font-weight:700">${(a.absent||[]).length}</td><td style="color:#856404;font-weight:700">${(a.late||[]).length}</td><td>${a.total||0}</td><td><span class="badge ${bc}">${pct}%</span></td></tr>`;
      }).join('');
    } catch(e) { tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`; }
  };

  window.exportAttendanceHistory = function() {
    const docs = window._attHistoryDocs;
    if (!docs || !docs.length) { showToast('⚠️ Load history first, then export.'); return; }
    const rows = [['Date','Day','Present','Absent','Late','Total','%']];
    docs.forEach(d => {
      const a = d.data();
      const pct = a.total>0 ? Math.round((a.present/a.total)*100) : 0;
      const day = a.date ? new Date(a.date+'T00:00:00').toLocaleDateString('en',{weekday:'short'}) : '';
      rows.push([a.date||'', day, a.present||0, (a.absent||[]).length, (a.late||[]).length, a.total||0, pct+'%']);
    });
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const month = document.getElementById('att-history-month')?.value || 'All';
    a.download = `Attendance_Class${window._attClass||''}_${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ================================================================
  //  ADMIN — Monthly Attendance Aggregation & Lock
  // ================================================================

  window.loadAdminMonthlyAtt = async function() {
    const classNum = document.getElementById('am-class-sel')?.value;
    const tbody = document.getElementById('am-list-tbody'); if (!tbody) return;
    if (!classNum) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--text-light)">Please select a class first.</td></tr>'; return; }
    tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
    try {
      const snap = await getDocs(query(collection(db,'attendance_monthly'), where('class_id','==',String(classNum)), orderBy('month','desc'), limit(24)));
      if (snap.empty) { tbody.innerHTML='<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--text-light)">No snapshots found. Generate one above.</td></tr>'; return; }
      tbody.innerHTML = snap.docs.map(d => {
        const r = d.data();
        const badge = r.status==='locked' ? '<span class="am-badge-locked"><i class="fas fa-lock" style="margin-right:4px"></i>Locked</span>' : '<span class="am-badge-draft"><i class="fas fa-clock" style="margin-right:4px"></i>Draft</span>';
        const genAt = r.generated_at?.toDate ? r.generated_at.toDate().toLocaleDateString('en-GB') : '—';
        const wdays = r.working_days || '—';
        const [yr, mo] = (r.month||'').split('_');
        const mLabel = yr && mo ? new Date(yr,parseInt(mo)-1,1).toLocaleDateString('en',{month:'long',year:'numeric'}) : r.month;
        return `<tr>
          <td><strong>${r.class_id}</strong></td>
          <td>${mLabel}</td>
          <td>${wdays}</td>
          <td>${badge}</td>
          <td>${genAt}</td>
          <td><button class="btn btn-sm btn-outline" onclick="openMonthlyDetail('${r.class_id}','${r.month}')"><i class="fas fa-eye"></i> Open</button></td>
        </tr>`;
      }).join('');
    } catch(e) { tbody.innerHTML=`<tr><td colspan="6" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`; }
  };

  async function runMonthlyAggregation(classNum, yyyy, mm) {
    const monthPrefix = `${yyyy}-${mm}-`; // e.g. "2026-05-"
    // Query only by class (single-field, no composite index needed),
    // then filter to the target month client-side.
    const [studSnap, dailySnap] = await Promise.all([
      getDocs(query(collection(db,'students'), where('class','==',String(classNum)), orderBy('rollNo'))),
      getDocs(query(collection(db,'attendance_daily'), where('class','==',String(classNum))))
    ]);
    const students = studSnap.docs.map(d => d.data());
    const dailyDocs = dailySnap.docs.map(d => d.data()).filter(d => (d.date||'').startsWith(monthPrefix));
    const workingDays = dailyDocs.length;
    const totals = {};
    students.forEach(s => {
      const sid = s.studentId || String(s.rollNo);
      totals[sid] = { name: s.name, gender: s.gender||'', rollNo: s.rollNo, present:0, late:0, absent:0 };
    });
    dailyDocs.forEach(day => {
      const absentSet = new Set(day.absent||[]);
      const lateSet   = new Set(day.late||[]);
      students.forEach(s => {
        const sid = s.studentId || String(s.rollNo);
        if (!totals[sid]) return;
        if (absentSet.has(sid))    totals[sid].absent++;
        else if (lateSet.has(sid)) totals[sid].late++;
        else                       totals[sid].present++;
      });
    });
    const mkSummary = gender => {
      const subset = Object.values(totals).filter(t => gender==='M' ? t.gender==='M' : t.gender!=='M');
      const p = subset.reduce((a,t)=>a+t.present,0), l = subset.reduce((a,t)=>a+t.late,0), ab = subset.reduce((a,t)=>a+t.absent,0);
      const total = p+l+ab;
      return { present:p, late:l, absent:ab, percentage: total>0 ? +((( p+l)/total)*100).toFixed(2) : 0 };
    };
    const studentsOut = {};
    Object.entries(totals).forEach(([sid,t]) => {
      const total = t.present+t.late+t.absent;
      studentsOut[sid] = { name:t.name, gender:t.gender, rollNo:t.rollNo, present:t.present, late:t.late, absent:t.absent,
        percentage: total>0 ? +((( t.present+t.late)/total)*100).toFixed(2) : 0 };
    });
    return { boys_summary: mkSummary('M'), girls_summary: mkSummary('F'), students: studentsOut, working_days: workingDays };
  }

  window.loadAcademicSessions = async function() {
    const sel = document.getElementById('am-session-sel');
    if (!sel) return;
    try {
      const snap = await getDocs(collection(db, 'academicSessions'));
      const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a,b) => (b.startDate||'').localeCompare(a.startDate||''));
      const active = sessions.find(s => s.active);
      sel.innerHTML = '<option value="">— Select Session —</option>' +
        sessions.map(s => {
          const label = s.label || `${s.startDate?.slice(0,4) || ''}–${s.endDate?.slice(0,4) || ''}`;
          return `<option value="${label}"${s.active?' selected':''}>${label}${s.active?' (Active)':''}</option>`;
        }).join('');
    } catch(e) {
      // Fallback: auto-generate current and next session labels
      const yr = new Date().getFullYear();
      const opts = [`${yr-1}–${yr}`,`${yr}–${yr+1}`,`${yr+1}–${yr+2}`];
      sel.innerHTML = '<option value="">— Select Session —</option>' +
        opts.map((o,i) => `<option value="${o}"${i===1?' selected':''}>${o}</option>`).join('');
    }
  };

  window.generateMonthlySnapshot = async function() {
    const classNum = document.getElementById('am-class-sel')?.value;
    const mm = document.getElementById('am-month-sel')?.value;
    const yyyy = document.getElementById('am-year-inp')?.value;
    const session = document.getElementById('am-session-sel')?.value || '';
    if (!classNum||!mm||!yyyy) { showToast('⚠️ Please fill in class, month, and year.'); return; }
    const monthYear = `${yyyy}_${mm}`;
    const docId = `${classNum}_${monthYear}`;
    const existing = await getDoc(doc(db,'attendance_monthly',docId));
    if (existing.exists() && existing.data().status==='locked') { showToast('🔒 This month is locked. Cannot regenerate.'); return; }
    if (existing.exists()) {
      if (!confirm('A snapshot for this month already exists. Overwrite it?')) return;
    }
    showToast('⏳ Aggregating attendance data...');
    try {
      const result = await runMonthlyAggregation(classNum, yyyy, mm);
      await setDoc(doc(db,'attendance_monthly',docId), {
        month: monthYear, class_id: String(classNum), status: 'draft',
        session: session,
        generated_at: serverTimestamp(), working_days: result.working_days,
        boys_summary: result.boys_summary, girls_summary: result.girls_summary, students: result.students
      });
      showToast('✅ Monthly snapshot generated!');
      loadAdminMonthlyAtt();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.openMonthlyDetail = async function(classNum, monthYear) {
    const wrap = document.getElementById('am-detail-wrap');
    const title = document.getElementById('am-detail-title');
    const statusBadge = document.getElementById('am-detail-status-badge');
    const lockBtn = document.getElementById('am-lock-btn');
    const summaryGrid = document.getElementById('am-summary-grid');
    const tbody = document.getElementById('am-detail-tbody');
    wrap.classList.add('open');
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    summaryGrid.innerHTML = '';
    wrap.scrollIntoView({ behavior:'smooth', block:'start' });
    try {
      const snap = await getDoc(doc(db,'attendance_monthly',`${classNum}_${monthYear}`));
      if (!snap.exists()) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;color:var(--danger)">Record not found.</td></tr>'; return; }
      const r = snap.data();
      window._amCurrentDoc = { classNum, monthYear, status: r.status };
      const [yr,mo] = monthYear.split('_');
      const mLabel = new Date(yr, parseInt(mo)-1, 1).toLocaleDateString('en',{month:'long',year:'numeric'});
      const sessionTag = r.session ? `<span style="font-size:11px;font-weight:600;color:var(--text-light);margin-left:10px;background:rgba(139,111,71,0.1);padding:2px 8px;border-radius:10px">Academic Session: ${r.session}</span>` : '';
      title.innerHTML = `<i class="fas fa-calendar-check" style="margin-right:8px;color:var(--accent)"></i>Class ${classNum} — ${mLabel}${sessionTag}`;
      statusBadge.innerHTML = r.status==='locked'
        ? '<span class="am-badge-locked"><i class="fas fa-lock" style="margin-right:4px"></i>Locked</span>'
        : '<span class="am-badge-draft"><i class="fas fa-clock" style="margin-right:4px"></i>Draft</span>';
      lockBtn.style.display = r.status==='locked' ? 'none' : '';
      const bs = r.boys_summary||{}, gs = r.girls_summary||{};
      const totalP=(bs.present||0)+(gs.present||0), totalL=(bs.late||0)+(gs.late||0), totalA=(bs.absent||0)+(gs.absent||0);
      const totalAll=totalP+totalL+totalA;
      const overallPct = totalAll>0 ? (((totalP+totalL)/totalAll)*100).toFixed(1) : '0.0';
      const mkCard = (label,data,bg) => `<div class="am-summary-card" style="background:${bg}">
        <div class="am-sc-label">${label}</div>
        <div class="am-sc-pct">${data.percentage??0}%</div>
        <div class="am-sc-sub">P:${data.present||0} · L:${data.late||0} · A:${data.absent||0}</div>
      </div>`;
      summaryGrid.innerHTML =
        mkCard('Boys',bs,'rgba(173,216,230,0.35)') +
        mkCard('Girls',gs,'rgba(255,182,193,0.35)') +
        `<div class="am-summary-card" style="background:rgba(214,195,163,0.3)">
          <div class="am-sc-label">Overall</div>
          <div class="am-sc-pct">${overallPct}%</div>
          <div class="am-sc-sub">P:${totalP} · L:${totalL} · A:${totalA}</div>
        </div>`;
      const studs = Object.entries(r.students||{}).sort((a,b)=>(a[1].rollNo||0)-(b[1].rollNo||0));
      window._amSnapshotData = { r, studs, mLabel, classNum, monthYear, overallPct, bs, gs };
      if (!studs.length) { tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--text-light)">No student data.</td></tr>'; return; }
      tbody.innerHTML = studs.map(([,s]) => {
        const pct = s.percentage??0;
        const bc = pct>=90?'badge-success':pct>=75?'badge-warning':'badge-danger';
        const gLabel = s.gender==='M'?'Male':s.gender==='F'?'Female':'—';
        return `<tr>
          <td>${s.rollNo||'—'}</td>
          <td><strong>${s.name}</strong></td>
          <td>${gLabel}</td>
          <td style="color:var(--success);font-weight:700">${s.present}</td>
          <td style="color:#856404;font-weight:700">${s.late}</td>
          <td style="color:var(--danger);font-weight:700">${s.absent}</td>
          <td>${r.working_days||'—'}</td>
          <td><span class="badge ${bc}">${pct}%</span></td>
        </tr>`;
      }).join('');
      renderAttendanceRanking(studs);
    } catch(e) { tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`; }
  };

  window.lockMonthlyRecord = async function() {
    const cur = window._amCurrentDoc;
    if (!cur) return;
    if (!confirm(`Lock attendance for Class ${cur.classNum} — ${cur.monthYear}?\n\nThis cannot be undone. Teachers will no longer be able to edit daily records for this month.`)) return;
    try {
      await updateDoc(doc(db,'attendance_monthly',`${cur.classNum}_${cur.monthYear}`), {
        status: 'locked', locked_at: serverTimestamp(), locked_by: auth.currentUser?.uid||'admin'
      });
      showToast('🔒 Records locked successfully!');
      window._amCurrentDoc.status = 'locked';
      openMonthlyDetail(cur.classNum, cur.monthYear);
      loadAdminMonthlyAtt();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  // ================================================================
  //  ATTENDANCE — PDF Export
  // ================================================================
  window.pdfExportAttendance = function() {
    const d = window._amSnapshotData;
    if (!d) { showToast('⚠️ Open a monthly record first.'); return; }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const pw = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 14;

    // Header block
    pdf.setFontSize(14); pdf.setFont('helvetica','bold');
    pdf.text('St. Francis De Sales Sec. School', pw/2, 18, {align:'center'});
    pdf.setFontSize(9); pdf.setFont('helvetica','normal');
    pdf.text('Laitkor, Shillong, Meghalaya', pw/2, 23, {align:'center'});
    pdf.setFontSize(12); pdf.setFont('helvetica','bold');
    pdf.text('Monthly Attendance Report', pw/2, 31, {align:'center'});
    pdf.setFontSize(9); pdf.setFont('helvetica','normal');
    const [yr,mo] = d.monthYear.split('_');
    pdf.text(`Class: ${d.classNum}   |   Month: ${d.mLabel}   |   Generated: ${new Date().toLocaleString()}`, pw/2, 37, {align:'center'});
    pdf.setDrawColor(139,111,71); pdf.setLineWidth(0.5);
    pdf.line(margin, 40, pw-margin, 40);

    // Analytics summary row
    pdf.setFontSize(9); pdf.setFont('helvetica','bold');
    pdf.text(`Boys: ${d.bs.percentage??0}%`, margin, 47);
    pdf.text(`Girls: ${d.gs.percentage??0}%`, pw/2-10, 47);
    pdf.text(`Overall: ${d.overallPct}%`, pw-margin-22, 47);
    pdf.line(margin, 50, pw-margin, 50);

    // Student table
    const rows = d.studs.map(([,s]) => [
      s.rollNo||'—', s.name, s.gender==='M'?'M':s.gender==='F'?'F':'—',
      s.present, s.late, s.absent, d.r.working_days||'—',
      (s.percentage??0)+'%'
    ]);
    pdf.autoTable({
      startY: 53,
      head: [['Roll','Name','Gen','Present','Late','Absent','Work Days','%']],
      body: rows,
      margin: { left: margin, right: margin },
      headStyles: { fillColor:[139,111,71], textColor:255, fontStyle:'bold', fontSize:8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1:{cellWidth:42} },
      didParseCell(data) {
        if (data.section==='body' && data.column.index===7) {
          const pct = parseFloat(data.cell.raw);
          if (pct>=95) data.cell.styles.fillColor=[209,236,214];
          else if (pct>=75) data.cell.styles.fillColor=[255,243,205];
          else data.cell.styles.fillColor=[248,215,218];
        }
      },
      didDrawPage(data) {
        const pg = pdf.internal.getCurrentPageInfo().pageNumber;
        pdf.setFontSize(8); pdf.setFont('helvetica','normal');
        pdf.text('Generated by School Management System', margin, pageH-8);
        pdf.text(`Page ${pg}`, pw-margin, pageH-8, {align:'right'});
      }
    });

    // Signature lines on last page
    const finalY = pdf.lastAutoTable.finalY + 14;
    pdf.setFontSize(9);
    pdf.text('Admin Signature: ___________________', margin, finalY);
    pdf.text('Principal Signature: ___________________', pw-margin-52, finalY);

    const monLabel = new Date(+yr, parseInt(mo)-1, 1).toLocaleString('en',{month:'long'});
    pdf.save(`Class_${d.classNum}_${monLabel}_${yr}_Attendance_Report.pdf`);
  };

  // ================================================================
  //  ATTENDANCE — Excel Export
  // ================================================================
  window.excelExportAttendance = function() {
    const d = window._amSnapshotData;
    if (!d) { showToast('⚠️ Open a monthly record first.'); return; }
    const [yr, mo] = d.monthYear.split('_');
    const monLabel = new Date(+yr, parseInt(mo)-1, 1).toLocaleString('en',{month:'long'});
    const wb = window.XLSX.utils.book_new();
    const rows = [];

    // Info header rows
    rows.push(['St. Francis De Sales Sec. School']);
    rows.push(['Laitkor, Shillong, Meghalaya']);
    rows.push([`Monthly Attendance Report — Class ${d.classNum}`]);
    rows.push([`Month: ${d.mLabel}   |   Generated: ${new Date().toLocaleString()}`]);
    rows.push([]);
    rows.push(['Analytics Summary']);
    rows.push(['Boys %', `${d.bs.percentage??0}%`, 'Girls %', `${d.gs.percentage??0}%`, 'Overall %', `${d.overallPct}%`]);
    rows.push([]);

    // Column headers
    rows.push(['Roll No','Name','Gender','Present','Late','Absent','Working Days','Attendance %']);

    // Data rows
    d.studs.forEach(([,s]) => {
      rows.push([
        s.rollNo||'',
        s.name,
        s.gender==='M'?'Male':s.gender==='F'?'Female':'—',
        s.present,
        s.late,
        s.absent,
        d.r.working_days||'',
        (s.percentage??0)/100
      ]);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(rows);

    // Bold header rows (rows 0–2 are school info, row 8 is column header)
    const headerRowIdx = 8;
    ['A','B','C','D','E','F','G','H'].forEach(col => {
      const cell = ws[`${col}${headerRowIdx+1}`];
      if (cell) cell.s = { font:{ bold:true }, fill:{ fgColor:{ rgb:'8B6F47' } } };
    });

    // Format Attendance % column as percentage
    const dataStart = headerRowIdx + 2;
    d.studs.forEach((_, i) => {
      const cell = ws[`H${dataStart + i}`];
      if (cell) { cell.t='n'; cell.z='0.0%'; }
    });

    // Auto column widths
    ws['!cols'] = [
      {wch:8},{wch:28},{wch:10},{wch:10},{wch:8},{wch:10},{wch:14},{wch:14}
    ];
    // Freeze top header row
    ws['!freeze'] = { xSplit:0, ySplit:headerRowIdx+1 };

    window.XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    window.XLSX.writeFile(wb, `Class_${d.classNum}_${monLabel}_${yr}_Attendance.xlsx`);
  };

  // ================================================================
  //  ATTENDANCE — Print
  // ================================================================
  window.printAttendance = function() {
    const d = window._amSnapshotData;
    if (!d) { showToast('⚠️ Open a monthly record first.'); return; }
    document.body.classList.add('att-printing');
    window.print();
    document.body.classList.remove('att-printing');
  };

  // ================================================================
  //  ATTENDANCE — Ranking
  // ================================================================
  window.renderAttendanceRanking = function(studs) {
    const wrap = document.getElementById('am-ranking-wrap');
    if (!wrap) return;
    if (!studs || !studs.length) { wrap.style.display='none'; return; }

    const sorted = [...studs]
      .map(([,s]) => s)
      .sort((a,b) => (b.percentage??0) - (a.percentage??0));

    const badge = (pct, rank) => {
      if (pct === 100) return '<span class="att-rank-badge perfect">🏆 Perfect Attendance</span>';
      if (pct >= 95)  return '<span class="att-rank-badge excellent">🥈 Excellent Attendance</span>';
      if (pct < 75)   return '<span class="att-rank-badge warning">⚠ Attendance Warning</span>';
      return '';
    };

    const rows = sorted.map((s, i) => {
      const rank = i + 1;
      const pct  = s.percentage ?? 0;
      const top  = rank <= 3 ? `att-rank-top att-rank-${rank}` : '';
      return `<tr class="${top}">
        <td class="att-rank-num">${rank}</td>
        <td><strong>${s.name}</strong></td>
        <td>${pct}%</td>
        <td>${badge(pct, rank)}</td>
      </tr>`;
    }).join('');

    wrap.style.display = 'block';
    wrap.innerHTML = `
      <div class="att-ranking-card">
        <div class="att-ranking-title"><i class="fas fa-trophy" style="color:#D4AF37;margin-right:8px"></i>Top Attendance Students</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Rank</th><th>Name</th><th>Attendance %</th><th>Badge</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  };

  // ================================================================
  //  TEACHER — Homework
  // ================================================================
  window.populateHwClassSelect = async function(){
    const sel=document.getElementById('hw-class-select'); if(!sel) return;
    const classes=['PLG','SKG','LKG','1','2','3','4','5','6','7','8','9','10'];
    const classLabel={PLG:'Play Group',SKG:'SKG',LKG:'LKG'};
    const getL=c=>classLabel[c]||(c?'Class '+c:'');
    sel.innerHTML='<option value="">— Select Class —</option>'+classes.map(c=>`<option value="${c}"${c===String(window._currentTeacherClass)?'selected':''}>${getL(c)}</option>`).join('');
  };

  window._hwEditId = null;

  window.prefillHwForm = function(docId, data){
    window._hwEditId = docId;
    const sel=document.getElementById('hw-class-select');
    if(sel){sel.value=data.class||'';}
    ['hw-subject','hw-title','hw-desc','hw-due'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el)return;
      if(id==='hw-subject')el.value=data.subject||'';
      else if(id==='hw-title')el.value=data.title||'';
      else if(id==='hw-desc')el.value=data.description||'';
      else if(id==='hw-due')el.value=data.dueDate||'';
    });
    const titleEl=document.getElementById('hw-form-title');
    if(titleEl)titleEl.innerHTML='<i class="fas fa-edit" style="margin-right:8px;color:var(--accent)"></i>Edit Homework';
    const btn=document.getElementById('hw-submit-btn');
    if(btn)btn.innerHTML='<i class="fas fa-save"></i> Update Homework';
    const cancelBtn=document.getElementById('hw-cancel-btn');
    if(cancelBtn)cancelBtn.style.display='';
    document.getElementById('hw-form-title')?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  window.cancelHwEdit = function(){
    window._hwEditId = null;
    ['hw-subject','hw-title','hw-desc','hw-due'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const titleEl=document.getElementById('hw-form-title');
    if(titleEl)titleEl.innerHTML='<i class="fas fa-book-open" style="margin-right:8px;color:var(--accent)"></i>Post New Homework';
    const btn=document.getElementById('hw-submit-btn');
    if(btn)btn.innerHTML='<i class="fas fa-plus"></i> Post Homework';
    const cancelBtn=document.getElementById('hw-cancel-btn');
    if(cancelBtn)cancelBtn.style.display='none';
  };

  window.postHomework = async function(){
    const cls=(document.getElementById('hw-class-select')?.value||'').trim();
    const subject=(document.getElementById('hw-subject')?.value||'').trim();
    const title=(document.getElementById('hw-title')?.value||'').trim();
    const desc=(document.getElementById('hw-desc')?.value||'').trim();
    const due=(document.getElementById('hw-due')?.value||'').trim();
    if(!cls||!subject||!title||!due){showToast('⚠️ Class, subject, title and due date are required.');return;}
    if(due < new Date().toISOString().split('T')[0]){showToast('⚠️ Due date cannot be in the past.');return;}
    try{
      if(window._hwEditId){
        await updateDoc(doc(db,'homework',window._hwEditId),{class:cls,subject,title,description:desc,dueDate:due,updatedAt:new Date().toISOString()});
        showToast('✅ Homework updated!');
        cancelHwEdit();
      } else {
        await addDoc(collection(db,'homework'),{class:cls,subject,title,description:desc,dueDate:due,postedBy:window._teacherName||'Teacher',teacherId:window._teacherId||'',createdAt:new Date().toISOString(),postedAt:new Date().toISOString()});
        ['hw-subject','hw-title','hw-desc','hw-due'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
        showToast('✅ Homework posted!');
      }
      loadTeacherHomework();
    }catch(e){showToast('❌ '+e.message);}
  };

  window.loadTeacherHomework = async function(){
    const el=document.getElementById('teacher-hw-list'); if(!el) return;
    try{
      const tid=window._teacherId||'';
      const snap=await getDocs(tid?query(collection(db,'homework'),where('teacherId','==',tid),limit(15)):query(collection(db,'homework'),limit(15)));
      const hwStat=document.getElementById('t-stat-hw'); if(hwStat) hwStat.textContent=snap.size;
      if(snap.empty){el.innerHTML='<p style="color:var(--text-light);font-size:13px">No homework posted yet.</p>';return;}
      el.innerHTML=[...snap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||'')).map(d=>{
        const hw=d.data();
        const dataJson=JSON.stringify({class:hw.class,subject:hw.subject,title:hw.title,description:hw.description||'',dueDate:hw.dueDate||''}).replace(/'/g,'&#39;');
        return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div style="font-weight:700;color:var(--accent-dark)">${hw.subject} – ${hw.title}</div><div style="font-size:12px;color:var(--text-light)">Class ${hw.class} · Due: ${hw.dueDate||'—'}</div></div><div style="display:flex;gap:6px;flex-shrink:0"><button onclick="prefillHwForm('${d.id}',JSON.parse(this.dataset.hw))" data-hw='${dataJson}' style="background:none;border:none;color:var(--accent);cursor:pointer" title="Edit"><i class="fas fa-edit"></i></button><button onclick="deleteHomework('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer" title="Delete"><i class="fas fa-trash"></i></button></div></div>`;
      }).join('');
    }catch(e){el.innerHTML=`<p style="color:var(--danger);font-size:13px">❌ ${e.message}</p>`;}
  };

  window.deleteHomework = async function(docId){
    if(!confirm('Delete this homework?'))return;
    try{await deleteDoc(doc(db,'homework',docId));showToast('🗑️ Deleted.');loadTeacherHomework();}catch(e){showToast('❌ '+e.message);}
  };

  // ================================================================
  //  TEACHER — Notices
  // ================================================================
  window._tnEditId = null;

  window.prefillNoticeForm = function(docId, data){
    window._tnEditId = docId;
    const titleEl=document.getElementById('tn-title');   if(titleEl) titleEl.value=data.title||'';
    const bodyEl=document.getElementById('tn-body');     if(bodyEl)  bodyEl.value=data.body||'';
    const audEl=document.getElementById('tn-audience');  if(audEl)   audEl.value=data.audience||'class';
    const priEl=document.getElementById('tn-priority');  if(priEl)   priEl.value=data.priority||'Normal';
    const hdr=document.getElementById('tn-form-title');
    if(hdr) hdr.innerHTML='<i class="fas fa-edit" style="margin-right:8px;color:var(--accent)"></i>Edit Notice';
    const btn=document.getElementById('tn-submit-btn');
    if(btn) btn.innerHTML='<i class="fas fa-save"></i> Update Notice';
    const cancelBtn=document.getElementById('tn-cancel-btn');
    if(cancelBtn) cancelBtn.style.display='';
    document.getElementById('tn-form-title')?.scrollIntoView({behavior:'smooth',block:'start'});
  };

  window.cancelNoticeEdit = function(){
    window._tnEditId = null;
    ['tn-title','tn-body'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
    const hdr=document.getElementById('tn-form-title');
    if(hdr) hdr.innerHTML='<i class="fas fa-bullhorn" style="margin-right:8px;color:var(--accent)"></i>Post a Notice';
    const btn=document.getElementById('tn-submit-btn');
    if(btn) btn.innerHTML='<i class="fas fa-paper-plane"></i> Publish Notice';
    const cancelBtn=document.getElementById('tn-cancel-btn');
    if(cancelBtn) cancelBtn.style.display='none';
  };

  window.postTeacherNotice = async function(){
    const title=(document.getElementById('tn-title')?.value||'').trim();
    const body=(document.getElementById('tn-body')?.value||'').trim();
    const audience=document.getElementById('tn-audience')?.value||'class';
    const priority=document.getElementById('tn-priority')?.value||'Normal';
    if(!title||!body){showToast('⚠️ Title and content are required.');return;}
    try{
      if(window._tnEditId){
        await updateDoc(doc(db,'notices',window._tnEditId),{title,body,audience,priority,updatedAt:new Date().toISOString()});
        showToast('✅ Notice updated!');
        cancelNoticeEdit();
      } else {
        await addDoc(collection(db,'notices'),{title,body,audience,priority,postedBy:window._teacherName||'Teacher',teacherId:window._teacherId||'',class:window._currentTeacherClass||'',postedAt:new Date().toISOString(),createdAt:new Date().toISOString()});
        document.getElementById('tn-title').value=''; document.getElementById('tn-body').value='';
        showToast('✅ Notice published!');
      }
      loadTeacherNotices();
    }catch(e){showToast('❌ '+e.message);}
  };

  window.loadTeacherNotices = async function(){
    const el=document.getElementById('t-notices-list'); if(!el) return;
    try{
      const tid=window._teacherId||'';
      const snap=await getDocs(tid?query(collection(db,'notices'),where('teacherId','==',tid),limit(20)):query(collection(db,'notices'),limit(15)));
      if(snap.empty){
        el.innerHTML='<p style="color:var(--text-light);font-size:13px">No notices posted yet.</p>';
        const dashEl=document.getElementById('t-dash-notices');
        if(dashEl) dashEl.innerHTML='<p style="color:var(--text-light);font-size:13px">No recent notices.</p>';
        return;
      }
      const bc=p=>p==='Urgent'?'badge-danger':p==='Important'?'badge-warning':'badge-info';
      const sorted=[...snap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      const dashEl=document.getElementById('t-dash-notices');
      if(dashEl) dashEl.innerHTML=sorted.slice(0,3).map(d=>{
        const n=d.data();
        const dot=n.priority==='Urgent'?'var(--danger)':n.priority==='Important'?'var(--warning)':'var(--info)';
        return `<div class="chapter-item"><i class="fas fa-circle" style="color:${dot};font-size:8px;margin-right:8px"></i>${n.title}</div>`;
      }).join('');
      el.innerHTML=sorted.map(d=>{
        const n=d.data();
        const dataJson=JSON.stringify({title:n.title,body:n.body||'',audience:n.audience||'class',priority:n.priority||'Normal'}).replace(/'/g,'&#39;');
        return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div style="font-weight:700">${n.title}</div><div style="font-size:12px;color:var(--text-light)">${(n.body||'').slice(0,60)}…</div><span class="badge ${bc(n.priority)}" style="margin-top:4px">${n.priority||'Normal'}</span></div><div style="display:flex;gap:6px;flex-shrink:0"><button onclick="prefillNoticeForm('${d.id}',JSON.parse(this.dataset.n))" data-n='${dataJson}' style="background:none;border:none;color:var(--accent);cursor:pointer" title="Edit"><i class="fas fa-edit"></i></button><button onclick="deleteNotice('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer" title="Delete"><i class="fas fa-trash"></i></button></div></div>`;
      }).join('');
    }catch(e){el.innerHTML=`<p style="color:var(--danger);font-size:13px">❌ ${e.message}</p>`;}
  };

  // ================================================================
  //  ADMIN — Notices
  // ================================================================
  window.postAdminNotice = async function(){
    const title=(document.getElementById('an-title')?.value||'').trim();
    const body=(document.getElementById('an-body')?.value||'').trim();
    const audience=document.getElementById('an-audience')?.value||'all';
    const priority=document.getElementById('an-priority')?.value||'Normal';
    if(!title||!body){showToast('⚠️ Title and content are required.');return;}
    try{
      await addDoc(collection(db,'notices'),{title,body,audience,priority,postedBy:'Admin',postedAt:new Date().toISOString(),createdAt:new Date().toISOString()});
      document.getElementById('an-title').value=''; document.getElementById('an-body').value='';
      showToast('✅ Notice published!'); loadAdminNotices();
    }catch(e){showToast('❌ '+e.message);}
  };

  window.loadAdminNotices = async function() {
    const el = document.getElementById('a-notices-list'); if (!el) return;
    el.innerHTML = '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
    try {
      const snap = await getDocs(query(collection(db,'notices'), limit(30)));
      if (snap.empty) { el.innerHTML = '<p style="color:var(--text-light);font-size:13px">No notices yet.</p>'; return; }
      const AUDIENCE_LABEL = { all:'All Students', teachers:'Teachers', both:'Students + Teachers', parents:'Parents' };
      const sorted = [...snap.docs].sort((a,b) => (b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      el.innerHTML = sorted.map(d => {
        const n = d.data(); const priority = n.priority || 'Normal';
        let cardClass, badgeClass, icon;
        switch (priority) {
          case 'Urgent':    cardClass='priority-urgent';    badgeClass='urgent';    icon='fa-circle-exclamation'; break;
          case 'Important': cardClass='priority-important'; badgeClass='important'; icon='fa-triangle-exclamation'; break;
          default:          cardClass='priority-normal';    badgeClass='normal';    icon='fa-circle-info';
        }
        const date = n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
        const audience = AUDIENCE_LABEL[n.audience] || n.audience || 'All';
        return `<div class="an-notice-card ${cardClass}">
          <div class="an-notice-header">
            <div class="an-notice-title"><i class="fas ${icon}" style="margin-right:6px;opacity:.75"></i>${n.title}</div>
            <span class="an-notice-badge ${badgeClass}">${priority}</span>
          </div>
          <div class="an-notice-meta">
            <span><i class="fas fa-clock" style="margin-right:3px"></i>${date}</span>
            <span><i class="fas fa-users" style="margin-right:3px"></i>${audience}</span>
            <span><i class="fas fa-user-shield" style="margin-right:3px"></i>${n.postedBy||'Admin'}</span>
          </div>
          ${n.body?`<div class="an-notice-body">${(n.body).slice(0,160)}${n.body.length>160?'…':''}</div>`:''}
          <div class="an-notice-footer">
            <span style="font-size:11px;color:var(--text-light);opacity:.6">ID: ${d.id.slice(0,8)}…</span>
            <button class="an-delete-btn" onclick="deleteNotice('${d.id}')"><i class="fas fa-trash-alt" style="margin-right:4px"></i>Delete</button>
          </div>
        </div>`;
      }).join('');
    } catch(e) { el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`; }
  };

  window.updatePriorityPreview = function() {
    const val = document.getElementById('an-priority')?.value || 'Normal';
    const dot = document.getElementById('an-priority-dot'); const hint = document.getElementById('an-priority-hint');
    const map = { Urgent:{color:'#dc2626',text:'Urgent — red card with alert icon.'}, Important:{color:'#d97706',text:'Important — amber card with warning icon.'}, Normal:{color:'#3b82f6',text:'Standard — blue indicator.'} };
    const cfg = map[val]||map.Normal;
    if (dot) dot.style.background=cfg.color; if (hint) { hint.textContent=cfg.text; hint.style.color=cfg.color; }
  };

  window.deleteNotice = async function(docId){
    if(!confirm('Delete this notice?'))return;
    try{await deleteDoc(doc(db,'notices',docId));showToast('🗑️ Notice deleted.');if(window._currentUserRole==='admin')loadAdminNotices();else loadTeacherNotices();}
    catch(e){showToast('❌ '+e.message);}
  };

  // ================================================================
  //  ADMIN — Fees
  // ================================================================
  window.loadAdminFees = async function(){
    const tbody=document.getElementById('admin-fees-tbody'); if(!tbody) return;
    tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    const filter=(document.getElementById('a-fee-filter')?.value||'all').toLowerCase();
    try{
      const q=filter==='all'
        ?query(collection(db,'fee_transactions'),orderBy('createdAt','desc'),limit(50))
        :query(collection(db,'fee_transactions'),where('status','==',filter),orderBy('createdAt','desc'),limit(50));
      const snap=await getDocs(q);
      if(snap.empty){tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-light)">No fee records found.</td></tr>';return;}
      tbody.innerHTML=snap.docs.map(d=>{
        const f=d.data();
        const bc=f.status==='approved'?'badge-success':f.status==='rejected'?'badge-danger':'badge-warning';
        const label=f.status?f.status.charAt(0).toUpperCase()+f.status.slice(1):'Pending';
        const fmt=f.date||(f.createdAt?new Date(f.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}):'—');
        const isPending=f.status==='pending';
        const actions=isPending
          ?`<div style="display:flex;gap:4px"><button class="btn btn-sm btn-success" style="font-size:11px;padding:3px 7px" onclick="approveFeeTransaction('${d.id}')"><i class="fas fa-check"></i></button><button class="btn btn-sm btn-danger" style="font-size:11px;padding:3px 7px" onclick="rejectFeeTransaction('${d.id}')"><i class="fas fa-times"></i></button></div>`
          :`<span style="font-size:11px;color:var(--text-light)">${f.approvedBy||f.rejectedBy||'—'}</span>`;
        return `<tr><td><strong>${f.studentName||'—'}</strong></td><td style="font-size:12px;font-family:monospace">${f.studentId||'—'}</td><td>${f.feeType||f.notes||'—'}</td><td style="font-weight:700">₹${(f.amount||0).toLocaleString('en-IN')}</td><td style="font-size:12px">${f.paymentMode||f.mode||'—'}</td><td style="font-size:12px;font-family:monospace">${f.receiptNo||f.txnNo||'—'}</td><td style="font-size:12px">${fmt}</td><td><span class="badge ${bc}">${label}</span></td><td>${actions}</td></tr>`;
      }).join('');
    }catch(e){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;}
  };

  window.adminAddFeeRecord = async function(){
    const sid=(document.getElementById('af-sid')?.value||'').trim();
    const name=(document.getElementById('af-name')?.value||'').trim();
    const cls=(document.getElementById('af-class')?.value||'').trim();
    const feeType=document.getElementById('af-type')?.value||'';
    const amount=parseFloat(document.getElementById('af-amount')?.value||0);
    const status=(document.getElementById('af-status')?.value||'pending').toLowerCase();
    if(!sid||!name||!amount){showToast('⚠️ Student ID, name and amount are required.');return;}
    const now=new Date().toISOString();
    try{
      await addDoc(collection(db,'fee_transactions'),{
        studentId:sid,studentName:name,studentClass:cls,
        feeType,amount,paymentMode:'Manual',receiptNo:'MANUAL-'+Date.now(),
        status,source:'admin',staffName:'Admin',
        createdAt:now,date:now.split('T')[0]
      });
      ['af-sid','af-name','af-class','af-amount'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
      showToast('✅ Fee record added.'); loadAdminFees();
    }catch(e){showToast('❌ '+e.message);}
  };

  // ================================================================
  //  ADMIN — Dashboard Stats
  // ================================================================
  window.loadAdminDashboardStats = async function(){
    try{
      const [sSnap,tSnap,oSnap,fSnap,aSnap,cSnap,lSnap]=await Promise.all([
        getDocs(collection(db,'students')),
        getDocs(collection(db,'teachers')),
        getDocs(query(collection(db,'users'),where('role','==','office'))),
        getDocs(query(collection(db,'fee_transactions'),where('status','==','pending'),limit(500))),
        getDocs(collection(db,'admissions')),
        getDocs(query(collection(db,'contacts'),where('status','==','Unread'),limit(200))),
        getDocs(query(collection(db,'leave_applications'),where('status','==','Pending'),limit(200))),
      ]);
      const set=(id,val)=>{const el=document.getElementById(id);if(el)el.textContent=val;};
      set('a-stat-students',    sSnap.size);
      set('a-stat-teachers',    tSnap.size);
      set('a-stat-office-staff',oSnap.size);
      set('a-stat-fee-pending', fSnap.size);
      const activeAdm=aSnap.docs.filter(d=>!['Admitted','Rejected'].includes(d.data().status)).length;
      set('a-admission-count', activeAdm);
      set('a-inbox-fee',      fSnap.size);
      set('a-inbox-contacts', cSnap.size);
      set('a-inbox-leave',    lSnap.size);
      if (window.loadAdminNotifications) window.loadAdminNotifications();
      const tbody=document.getElementById('classwise-tbody');
      if(tbody&&sSnap.size>0){
        const classMap={};
        sSnap.docs.forEach(d=>{const s=d.data();const c=s.class||'?';if(!classMap[c])classMap[c]={boys:0,girls:0};if(s.gender==='M')classMap[c].boys++;else classMap[c].girls++;});
        const teacherMap={};
        tSnap.docs.forEach(d=>{const t=d.data();if(t.classTeacher)teacherMap[t.classTeacher]=t.name||'—';});
        const order=['PLG','SKG','LKG','1','2','3','4','5','6','7','8','9','10'];
        const classLabel={PLG:'Play Group',SKG:'SKG',LKG:'LKG'};
        const getL=c=>classLabel[c]||(c?'Class '+c:c);
        tbody.innerHTML=order.filter(c=>classMap[c]).map(c=>{
          const {boys,girls}=classMap[c];
          const ct=teacherMap[c]||'<span style="color:var(--text-light);font-style:italic">—</span>';
          return `<tr><td>${getL(c)}</td><td>${boys}</td><td>${girls}</td><td><strong>${boys+girls}</strong></td><td style="font-size:13px">${ct}</td></tr>`;
        }).join('');
      }
      const homeS=document.getElementById('home-stat-students');const homeT=document.getElementById('home-stat-teachers');
      if(homeS&&sSnap.size>0) homeS.textContent=sSnap.size.toLocaleString('en-IN')+'+';
      if(homeT&&tSnap.size>0) homeT.textContent=tSnap.size.toLocaleString('en-IN')+'+';
    }catch(e){console.warn('Dashboard stats:',e.message);}
  };

  window.loadAdminNotifications = async function() {
    try {
      const snap = await getDocs(query(
        collection(db, 'admin_notifications'),
        where('read', '==', false),
        where('type', '==', 'admission_forwarded'),
        limit(100)
      ));
      const el = document.getElementById('a-inbox-forwarded');
      if (el) el.textContent = snap.size;
    } catch(e) { console.warn('Admin notifications:', e.message); }
  };

  // ================================================================
  //  ADMIN — Holidays
  // ================================================================
  window.loadHolidays = async function(){
    const tbody=document.getElementById('holidays-tbody'); if(!tbody) return;
    tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    try{
      const snap=await getDocs(query(collection(db,'holidays'),limit(50)));
      if(snap.empty){tbody.innerHTML='<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-light)">No holidays declared yet.</td></tr>';return;}
      tbody.innerHTML=[...snap.docs].sort((a,b)=>(a.data().date||'').localeCompare(b.data().date||'')).map(d=>{
        const h=d.data();
        const day=h.date?new Date(h.date+'T00:00:00').toLocaleDateString('en',{weekday:'long'}):'—';
        const fmt=h.date?new Date(h.date+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'—';
        return `<tr><td>${fmt}</td><td>${day}</td><td><strong>${h.reason||'—'}</strong></td><td><span class="badge badge-info">${h.type||'—'}</span></td><td><button onclick="deleteHoliday('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button></td></tr>`;
      }).join('');
    }catch(e){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;}
  };

  window.addHoliday = async function(){
    const date=(document.getElementById('h-date')?.value||'').trim();
    const reason=(document.getElementById('h-reason')?.value||'').trim();
    const type=document.getElementById('h-type')?.value||'National';
    if(!date||!reason){showToast('⚠️ Date and reason are required.');return;}
    try{
      await setDoc(doc(db,'holidays',date),{date,reason,type,createdAt:new Date().toISOString()});
      document.getElementById('h-date').value=''; document.getElementById('h-reason').value='';
      showToast('✅ Holiday declared!'); loadHolidays();
    }catch(e){showToast('❌ '+e.message);}
  };

  window.deleteHoliday = async function(docId){
    if(!confirm('Remove this holiday?'))return;
    try{await deleteDoc(doc(db,'holidays',docId));showToast('🗑️ Holiday removed.');loadHolidays();}
    catch(e){showToast('❌ '+e.message);}
  };

  // ================================================================
  //  ADMIN — Teachers CRUD
  // ================================================================
  window._teacherSeedDone=false;
  window.seedTeachersIfNeeded = async function(){
    if(window._teacherSeedDone) return; window._teacherSeedDone=true;
    try{
      const snap=await getDocs(query(collection(db,'teachers'),limit(1)));
      if(!snap.empty) return;
      const seed=[
        {teacherId:'SFST001',name:'Emilia Lyngdoh Nongbri',title:'Miss',gender:'F',subjects:'Principal',classTeacher:'',qualification:'M.A.',experience:20,whatsapp:'',status:'Active'},
        {teacherId:'SFST002',name:'Asha Mary Nongkhlaw',title:'Miss',gender:'F',subjects:'Khasi',classTeacher:'',qualification:'M.A., B.Ed.',experience:18,whatsapp:'',status:'Active'}
      ];
      for(const t of seed) await setDoc(doc(db,'teachers',t.teacherId),{...t,createdAt:new Date().toISOString()});
    }catch(e){console.warn('Seed:',e.message);}
  };

  window.loadTeachers = async function(){
    const tbody=document.getElementById('admin-teacher-tbody'),countEl=document.getElementById('teacher-count');
    if(!tbody) return;
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    try{
      const [snap, classSnap] = await Promise.all([
        getDocs(query(collection(db,'teachers'),orderBy('teacherId'))),
        getDocs(collection(db,'classes'))
      ]);
      // Build map: teacherId/initials → class label from live classes collection
      const classLabel={PLG:'Play Group',SKG:'SKG',LKG:'LKG'};
      const getL=c=>classLabel[c]||(c?'Class '+c:'—');
      const ctMap={}; // routineInitials → class display label
      classSnap.docs.forEach(cd=>{
        const cls=cd.data();
        const tid=(cls.classTeacherId||cls.classTeacherUid||'').trim();
        // doc id format: "6-A", "SKG-A", "9-B" — take part before '-'
        if(tid) ctMap[tid]=(cd.id||'').split('-')[0].trim();
      });
      window._loadedTeacherDocs=snap.docs;
      window._teacherClassMap=ctMap;
      if(countEl) countEl.textContent=`${snap.size} teacher${snap.size!==1?'s':''}`;
      if(snap.empty){tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No teachers found.</td></tr>';return;}
      renderTeacherRows(snap.docs, ctMap);
    }catch(e){tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;}
  };

  function renderTeacherRows(docs, ctMap){
    ctMap = ctMap || window._teacherClassMap || {};
    const tbody=document.getElementById('admin-teacher-tbody');
    const classLabel={PLG:'Play Group',SKG:'SKG',LKG:'LKG'};
    const getL=c=>classLabel[c]||(c?'Class '+c:'—');
    tbody.innerHTML=docs.map(d=>{
      const t=d.data(); const bc=t.status==='Active'?'badge-success':t.status==='On Leave'?'badge-warning':'badge-danger';
      // Class teacher: prefer live classes collection lookup, fall back to teachers doc field
      const initials=(t.routineInitials||t.initials||'').toUpperCase();
      const liveClass = initials && ctMap[initials] ? getL(ctMap[initials]) : null;
      const classTeacherDisplay = liveClass || (t.classTeacher ? getL(t.classTeacher) : '—');
      return `<tr data-tname="${(t.name||'').toLowerCase()}">
        <td><strong style="font-family:monospace;color:var(--accent)">${t.teacherId||'—'}</strong></td>
        <td>${t.title||'—'}</td><td>${t.name||'—'}</td>
        <td>${classTeacherDisplay}</td>
        <td style="font-size:13px">${t.subjects||'—'}</td>
        <td style="font-size:12px">${t.whatsapp||'—'}</td>
        <td><span class="badge ${bc}">${t.status||'Active'}</span></td>
        <td><div style="display:flex;gap:4px;flex-wrap:wrap">
          <button class="btn btn-sm btn-outline" onclick='editTeacher("${d.id}",${JSON.stringify(t).replace(/'/g,"\\'")})'><i class="fas fa-edit"></i></button>
          <button class="btn btn-sm" style="background:#1a3a6b;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px" onclick='openTeacherLoginModal("${(t.teacherId||'').replace(/"/g,'')}","${(t.name||'').replace(/"/g,'')}","${(t.email||'').replace(/"/g,'')}")' ><i class="fas fa-key"></i></button>
          <button class="btn btn-sm" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px" onclick='openTeacherLeavePanel("${(t.teacherId||'').replace(/"/g,'')}","${(t.name||'').replace(/"/g,'')}")'><i class="fas fa-calendar-times"></i> Leaves</button>
          <button class="btn btn-sm btn-danger" onclick='promptDeleteTeacher("${d.id}","${(t.name||'').replace(/"/g,'')}")'><i class="fas fa-trash"></i></button>
        </div></td></tr>`;
    }).join('');
  }

  let _tlpCurrentTeacherId = null;

  window.openTeacherLeavePanel = async function(teacherId, teacherName) {
    _tlpCurrentTeacherId = teacherId;
    document.getElementById('tlp-teacher-name').textContent = teacherName + ' · ' + teacherId;
    ['tlp-count-pending','tlp-count-approved','tlp-count-total'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='—'; });
    document.getElementById('tlp-tbody').innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    document.getElementById('teacher-leave-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
    await _loadTeacherLeaves(teacherId);
  };

  window.closeTeacherLeavePanel = function() {
    document.getElementById('teacher-leave-overlay').style.display = 'none';
    document.body.style.overflow = '';
    _tlpCurrentTeacherId = null;
  };

  async function _loadTeacherLeaves(teacherId) {
    const tbody = document.getElementById('tlp-tbody');
    try {
      const snap = await getDocs(query(collection(db,'leave_applications'), where('teacherId','==',teacherId)));
      const docs = snap.docs.sort((a,b) => (b.data().createdAt||'').localeCompare(a.data().createdAt||''));
      const pending  = docs.filter(d => d.data().status === 'Pending').length;
      const approved = docs.filter(d => d.data().status === 'Approved').length;
      const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
      set('tlp-count-pending',  pending);
      set('tlp-count-approved', approved);
      set('tlp-count-total',    docs.length);
      if (!docs.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-light)">No leave applications yet.</td></tr>';
        return;
      }
      const bc = { Pending:'badge-warning', Approved:'badge-success', Rejected:'badge-danger' };
      const fmt = s => s ? new Date(s+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
      const fmtDate = s => s ? new Date(s).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
      tbody.innerHTML = docs.map(d => {
        const l = d.data();
        const actions = l.status === 'Pending'
          ? `<div style="display:flex;gap:4px">
               <button onclick="approveTeacherLeave('${d.id}','${teacherId}')" style="padding:4px 10px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600"><i class="fas fa-check"></i> Approve</button>
               <button onclick="rejectTeacherLeave('${d.id}','${teacherId}')"  style="padding:4px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600"><i class="fas fa-times"></i> Reject</button>
             </div>`
          : '<span style="font-size:12px;color:var(--text-light)">—</span>';
        return `<tr>
          <td>${fmt(l.from)}</td><td>${fmt(l.to)}</td>
          <td style="font-size:12px">${l.type||'—'}</td>
          <td style="font-size:12px;max-width:160px;white-space:normal">${l.reason||'—'}</td>
          <td style="font-size:11px;color:var(--text-light)">${fmtDate(l.createdAt)}</td>
          <td><span class="badge ${bc[l.status]||'badge-info'}">${l.status||'—'}</span></td>
          <td>${actions}</td>
        </tr>`;
      }).join('');
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  }

  window.approveTeacherLeave = async function(leaveDocId, teacherId) {
    try {
      await updateDoc(doc(db,'leave_applications',leaveDocId), { status:'Approved', decidedAt: new Date().toISOString() });
      await _loadTeacherLeaves(teacherId);
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.rejectTeacherLeave = async function(leaveDocId, teacherId) {
    try {
      await updateDoc(doc(db,'leave_applications',leaveDocId), { status:'Rejected', decidedAt: new Date().toISOString() });
      await _loadTeacherLeaves(teacherId);
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.filterTeacherTable=function(){
    const q=(document.getElementById('teacher-search')?.value||'').toLowerCase();
    document.querySelectorAll('#admin-teacher-tbody tr[data-tname]').forEach(tr=>{tr.style.display=(tr.dataset.tname.includes(q)||tr.textContent.toLowerCase().includes(q))?'':'none';});
  };

  window.openTeacherModal=function(){document.getElementById('teacher-modal-title').textContent='Add New Teacher';document.getElementById('tf-doc-id').value='';clearTeacherForm();document.getElementById('teacher-modal-overlay').style.display='block';document.body.style.overflow='hidden';};
  window.closeTeacherModal=function(){document.getElementById('teacher-modal-overlay').style.display='none';document.body.style.overflow='';};
  window.editTeacher=function(docId,t){
    document.getElementById('teacher-modal-title').textContent='Edit Teacher';document.getElementById('tf-doc-id').value=docId;
    const f={teacherId:t.teacherId,title:t.title,name:t.name,dob:t.dob,gender:t.gender,blood:t.bloodGroup,nationality:t.nationality,classTeacher:t.classTeacher,section:t.section,subjects:t.subjects,classesTaught:t.classesTaught,empType:t.empType,joiningDate:t.joiningDate,qualification:t.qualification,experience:t.experience,whatsapp:t.whatsapp,altContact:t.altContact,email:t.email,address:t.address,pen:t.penNumber,aadhaar:t.aadhaar,empId:t.empId,status:t.status,remarks:t.remarks,routineInitials:t.routineInitials||t.initials||''};
    Object.entries(f).forEach(([k,v])=>setVal('tf-'+k,v));
    document.getElementById('teacher-modal-overlay').style.display='block';document.body.style.overflow='hidden';
  };
  window.saveTeacher=async function(){
    const btn=document.getElementById('tf-save-btn');
    const teacherId=getVal('tf-teacherId'),title=getVal('tf-title'),name=getVal('tf-name'),subjects=getVal('tf-subjects');
    if(!teacherId||!title||!name||!subjects){showToast('⚠️ Teacher ID, title, name and subjects are required.');return;}
    const routineInitials=(getVal('tf-routineInitials')||'').toUpperCase().trim();
    const data={teacherId,title,name,dob:getVal('tf-dob'),gender:getVal('tf-gender'),bloodGroup:getVal('tf-blood'),nationality:getVal('tf-nationality')||'Indian',classTeacher:getVal('tf-classTeacher'),section:getVal('tf-section'),subjects,classesTaught:getVal('tf-classesTaught'),empType:getVal('tf-empType')||'Permanent',joiningDate:getVal('tf-joiningDate'),qualification:getVal('tf-qualification'),experience:getVal('tf-experience'),whatsapp:getVal('tf-whatsapp'),altContact:getVal('tf-altContact'),email:getVal('tf-email'),address:getVal('tf-address'),penNumber:getVal('tf-pen'),aadhaar:getVal('tf-aadhaar'),empId:getVal('tf-empId'),status:getVal('tf-status')||'Active',remarks:getVal('tf-remarks'),routineInitials,initials:routineInitials,updatedAt:new Date().toISOString()};
    btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';btn.disabled=true;
    try{
      const docId=document.getElementById('tf-doc-id').value;
      if(docId){await setDoc(doc(db,'teachers',docId),data,{merge:true});showToast('✅ Teacher updated!');}
      else{data.createdAt=new Date().toISOString();await addDoc(collection(db,'teachers'),data);showToast('✅ Teacher added!');}
      closeTeacherModal(); loadTeachers();
    }catch(e){showToast('❌ '+e.message);}
    finally{btn.innerHTML='<i class="fas fa-save"></i> Save Teacher';btn.disabled=false;}
  };
  window._pendingDeleteTeacherId=null;
  window.promptDeleteTeacher=function(docId,name){window._pendingDeleteTeacherId=docId;document.getElementById('teacher-delete-msg').textContent=`Delete "${name}"? This cannot be undone.`;document.getElementById('teacher-delete-overlay').style.display='flex';};
  window.closeTeacherDeleteConfirm=function(){document.getElementById('teacher-delete-overlay').style.display='none';window._pendingDeleteTeacherId=null;};
  window.confirmDeleteTeacher=async function(){
    const docId=window._pendingDeleteTeacherId; if(!docId) return;
    const btn=document.getElementById('confirm-teacher-delete-btn');btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';btn.disabled=true;
    try{await deleteDoc(doc(db,'teachers',docId));showToast('🗑️ Teacher deleted.');closeTeacherDeleteConfirm();loadTeachers();}
    catch(e){showToast('❌ '+e.message);}
    finally{btn.innerHTML='<i class="fas fa-trash-alt"></i> Yes, Delete';btn.disabled=false;}
  };
  function clearTeacherForm(){['tf-teacherId','tf-routineInitials','tf-title','tf-name','tf-dob','tf-gender','tf-blood','tf-classTeacher','tf-section','tf-subjects','tf-classesTaught','tf-empType','tf-joiningDate','tf-qualification','tf-experience','tf-whatsapp','tf-altContact','tf-email','tf-address','tf-pen','tf-aadhaar','tf-empId','tf-status','tf-remarks'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=id==='tf-nationality'?'Indian':id==='tf-status'?'Active':'';});}

  // ================================================================
  //  LOGIN CREATION — helpers
  // ================================================================

  // Resets password for an existing Firebase Auth account using a temporary secondary auth instance.
  // Signs in as the user on a secondary app, updates their password, then signs out. Admin session untouched.
  async function resetAuthPasswordByUid(uid, email, newPassword) {
    const { initializeApp, getApp, getApps } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js');
    const { getAuth, signInWithEmailAndPassword: signInTemp, updatePassword } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js');
    // We cannot sign in without knowing the current password.
    // Use accounts:update via admin lookup — not available on client.
    // Fallback: delete via REST then recreate.
    // DELETE requires idToken — not available without current password.
    // FINAL APPROACH: use accounts:update with localId (works on Identity Toolkit emulator only).
    // For production: guide admin to Firebase Console.
    throw new Error('NEEDS_CONSOLE_RESET');
  }

  // Creates a Firebase Auth account via REST API — admin session is never touched.
  async function createAuthAccountSafe(email, password) {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: false }) }
    );
    const data = await res.json();
    if (!res.ok) {
      const msg = data?.error?.message || 'UNKNOWN';
      console.error('[createAuthAccountSafe] Firebase error:', msg, data);
      if (msg === 'EMAIL_EXISTS') { const err = new Error('auth/email-already-in-use'); err.code = 'auth/email-already-in-use'; throw err; }
      throw new Error('Failed to create account: ' + msg);
    }
    return data.localId; // UID
  }

  window.generatePassword=function(seed=''){
    const chars='ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#';
    const base=(seed||'').replace(/[^a-zA-Z0-9]/g,'').slice(-4).toUpperCase();
    let rand=''; for(let i=0;i<4;i++) rand+=chars[Math.floor(Math.random()*chars.length)];
    return base+rand;
  };

  function idToEmailLocal(id){return id.trim().toLowerCase().replace(/[^a-z0-9]/g,'_')+'@stfrancis.school';}

  // Teacher login modal
  window.openTeacherLoginModal=async function(teacherId,name,email){
    const modal=document.getElementById('teacher-login-modal'); if(!modal) return;
    document.getElementById('tlm-name').textContent=name||teacherId;
    document.getElementById('tlm-id').textContent=teacherId;
    document.getElementById('tlm-tid').value=teacherId;
    document.getElementById('tlm-existing-box').style.display='none';
    document.getElementById('tlm-create-form').style.display='block';
    document.getElementById('tlm-reset-form').style.display='none';
    document.getElementById('tlm-success-box').style.display='none';
    document.getElementById('tlm-actions').style.display='flex';
    const av=document.getElementById('tlm-avatar');
    if(av){const p=(name||'T').split(' ');av.textContent=p.length>=2?p[0].charAt(0)+p[p.length-1].charAt(0):p[0].charAt(0).toUpperCase();}
    try{
      const snap=await getDocs(query(collection(db,'users'),where('loginId','==',teacherId)));
      if(!snap.empty){
        document.getElementById('tlm-existing-box').style.display='block';
        document.getElementById('tlm-existing-email').textContent=idToEmailLocal(teacherId);
        document.getElementById('tlm-create-btn').innerHTML='<i class="fas fa-key"></i> Reset Password';
        document.getElementById('tlm-create-form').style.display='none';
        document.getElementById('tlm-reset-form').style.display='block';
      } else {
        document.getElementById('tlm-create-btn').innerHTML='<i class="fas fa-user-plus"></i> Create Login Account';
      }
    }catch(e){}
    modal.style.display='flex'; document.body.style.overflow='hidden';
  };
  window.closeLoginModal=function(){const m=document.getElementById('teacher-login-modal');if(m){m.style.display='none';document.body.style.overflow='';}};

  window.createTeacherLogin=async function(){
    const tid=document.getElementById('tlm-tid')?.value||'';
    const password=(document.getElementById('tlm-password')?.value||document.getElementById('tlm-new-password')?.value||'').trim();
    if(!tid||!password){showToast('⚠️ Teacher ID and password required.');return;}
    if(password.length<6){showToast('⚠️ Password must be at least 6 characters.');return;}
    const btn=document.getElementById('tlm-create-btn');
    btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Creating...';btn.disabled=true;
    try{
      const loginEmail=idToEmailLocal(tid); let uid='';
      try{ uid = await createAuthAccountSafe(loginEmail, password); }
      catch(e){
        if(e.code==='auth/email-already-in-use'){
          const snap=await getDocs(query(collection(db,'users'),where('loginId','==',tid)));
          if(!snap.empty){
            uid=snap.docs[0].id;
            try{ await resetAuthPasswordByUid(uid, loginEmail, password); }
            catch(re){
              if(re.message==='NEEDS_CONSOLE_RESET'){
                // Can't reset password client-side — guide admin to Firebase Console
                document.getElementById('tlm-done-tid').textContent=tid;
                document.getElementById('tlm-done-pass').textContent='(see instructions below)';
                document.getElementById('tlm-success-box').style.display='block';
                document.getElementById('tlm-success-box').innerHTML=`<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-top:8px;font-size:13px"><b>⚠️ Password Reset Required via Firebase Console</b><br>To reset this teacher\'s password:<br>1. Go to <a href="https://console.firebase.google.com/project/st-francis-school-a3e7e/authentication/users" target="_blank" style="color:#1a3a6b">Firebase Console → Authentication</a><br>2. Find <b>${loginEmail}</b><br>3. Click ⋮ → <b>Reset password</b> or set new password<br>Then share the new password with the teacher.</div>`;
                document.getElementById('tlm-actions').style.display='none';
                return;
              }
              throw re;
            }
          } else throw new Error('Account exists but no portal record found. Delete from Firebase Console and retry.');
        } else throw e;
      }
      if(uid){
        await setDoc(doc(db,'users',uid),{role:'teacher',teacherId:tid,loginId:tid,email:loginEmail,name:document.getElementById('tlm-name')?.textContent||tid,updatedAt:new Date().toISOString()},{merge:true});
      }
      document.getElementById('tlm-done-tid').textContent=tid;
      document.getElementById('tlm-done-pass').textContent=password;
      document.getElementById('tlm-success-box').style.display='block';
      document.getElementById('tlm-actions').style.display='none';
      showToast('✅ Teacher login ready!');
    }catch(e){showToast('❌ '+e.message);}
    finally{btn.innerHTML='<i class="fas fa-user-plus"></i> Create Login Account';btn.disabled=false;}
  };

  window.copyTeacherCredentials=function(){
    const tid=document.getElementById('tlm-done-tid')?.textContent||'';
    const pass=document.getElementById('tlm-done-pass')?.textContent||'';
    navigator.clipboard?.writeText(`Teacher Login ID: ${tid}\nPassword: ${pass}`).then(()=>showToast('✅ Copied!')).catch(()=>showToast('⚠️ Copy manually'));
  };

  // Student login modal
  window.openStudentLoginModal=async function(studentId,name,gender,email){
    const modal=document.getElementById('student-login-modal'); if(!modal) return;
    document.getElementById('slm-name').textContent=name||studentId;
    document.getElementById('slm-id').textContent=studentId;
    document.getElementById('slm-sid').value=studentId;
    document.getElementById('slm-existing-box').style.display='none';
    document.getElementById('slm-create-form').style.display='block';
    document.getElementById('slm-reset-form').style.display='none';
    document.getElementById('slm-success-box').style.display='none';
    document.getElementById('slm-actions').style.display='flex';
    const av=document.getElementById('slm-avatar');
    if(av){const p=(name||'S').split(' ');av.textContent=p.length>=2?p[0].charAt(0)+p[p.length-1].charAt(0):p[0].charAt(0).toUpperCase();}
    try{
      const snap=await getDocs(query(collection(db,'users'),where('loginId','==',studentId)));
      if(!snap.empty){
        document.getElementById('slm-existing-box').style.display='block';
        document.getElementById('slm-existing-email').textContent=idToEmailLocal(studentId);
        document.getElementById('slm-create-btn').innerHTML='<i class="fas fa-key"></i> Reset Password';
        document.getElementById('slm-create-form').style.display='none';
        document.getElementById('slm-reset-form').style.display='block';
      } else {
        document.getElementById('slm-create-btn').innerHTML='<i class="fas fa-user-plus"></i> Create Login Account';
      }
    }catch(e){}
    modal.style.display='flex'; document.body.style.overflow='hidden';
  };
  window.closeStudentLoginModal=function(){const m=document.getElementById('student-login-modal');if(m){m.style.display='none';document.body.style.overflow='';}};

  window.createStudentLogin=async function(){
    const sid=document.getElementById('slm-sid')?.value||'';
    const password=(document.getElementById('slm-password')?.value||document.getElementById('slm-new-password')?.value||'').trim();
    if(!sid||!password){showToast('⚠️ Student ID and password required.');return;}
    if(password.length<6){showToast('⚠️ Password must be at least 6 characters.');return;}
    const btn=document.getElementById('slm-create-btn');
    btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Creating...';btn.disabled=true;
    try{
      const loginEmail=idToEmailLocal(sid); let uid='';
      try{ uid = await createAuthAccountSafe(loginEmail, password); }
      catch(e){
        if(e.code==='auth/email-already-in-use'){
          const snap=await getDocs(query(collection(db,'users'),where('loginId','==',sid)));
          if(!snap.empty){
            uid=snap.docs[0].id;
            try{ await resetAuthPasswordByUid(uid, loginEmail, password); }
            catch(re){
              if(re.message==='NEEDS_CONSOLE_RESET'){
                document.getElementById('slm-success-box').style.display='block';
                document.getElementById('slm-success-box').innerHTML=`<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;font-size:13px"><b>⚠️ Password Reset via Firebase Console</b><br>1. Go to <a href="https://console.firebase.google.com/project/st-francis-school-a3e7e/authentication/users" target="_blank" style="color:#1a3a6b">Firebase Console → Authentication</a><br>2. Find <b>${loginEmail}</b> → reset password<br>3. Share the new password with the student.</div>`;
                document.getElementById('slm-actions').style.display='none';
                return;
              }
              throw re;
            }
          } else{throw new Error('A login account already exists for this student but no portal record was found. Delete the account from Firebase Console and try again.');}
        }
        else throw e;
      }
      if(uid){
        const sSnap=await getDocs(query(collection(db,'students'),where('studentId','==',sid)));
        const sData=sSnap.empty?{}:sSnap.docs[0].data();
        await setDoc(doc(db,'users',uid),{role:'student',studentId:sid,loginId:sid,email:loginEmail,name:document.getElementById('slm-name')?.textContent||sid,class:sData.class||'',rollNo:sData.rollNo||'',updatedAt:new Date().toISOString()},{merge:true});
      }
      document.getElementById('slm-done-sid').textContent=sid;
      document.getElementById('slm-done-pass').textContent=password;
      document.getElementById('slm-success-box').style.display='block';
      document.getElementById('slm-actions').style.display='none';
      showToast('✅ Student login ready!');
    }catch(e){showToast('❌ '+e.message);}
    finally{btn.innerHTML='<i class="fas fa-user-plus"></i> Create Login Account';btn.disabled=false;}
  };

  window.copyStudentCredentials=function(){
    const sid=document.getElementById('slm-done-sid')?.textContent||'';
    const pass=document.getElementById('slm-done-pass')?.textContent||'';
    navigator.clipboard?.writeText(`Student ID: ${sid}\nPassword: ${pass}`).then(()=>showToast('✅ Copied!')).catch(()=>showToast('⚠️ Copy manually'));
  };


// ================================================================
// BLOCK 2 — FEE MODULE PART 1
// ================================================================
/* ================================================================
   FEE MANAGEMENT MODULE  (Part 1 of 5)
   Office Portal Bootstrap · Stats · Recent Transactions
================================================================ */
(async () => {
  let app;
  for (let i = 0; i < 60; i++) {
    const apps = getApps();
    if (apps.length > 0) { app = getApp(); break; }
    await new Promise(r => setTimeout(r, 150));
  }
  if (!app) { console.error('[FeeModule] Firebase app unavailable'); return; }

  const db = getFirestore(app);

  const CLS = { PLG:'Play Group', SKG:'SKG', LKG:'LKG' };
  const clsLabel = c => CLS[c] || (c ? 'Class ' + c : '—');
  const fmtINR   = n => '₹' + (parseFloat(n) || 0).toLocaleString('en-IN');

  window._officeStaffId       = '';
  window._officeStaffName     = '';
  window._feeSelectedStudent  = null;
  window._feeSelectedFeeData  = null;

  window._officePortalLoaded = false;

  window.loadOfficePortal = async function(user) {
    if (window._officePortalLoaded) return;
    window._officePortalLoaded = true;
    try {
      const uSnap = await getDoc(doc(db, 'users', user.uid));
      if (!uSnap.exists()) { window._officePortalLoaded = false; return; }
      const u = uSnap.data();
      window._officeStaffId   = u.staffId || u.loginId || user.uid;
      window._officeStaffName = u.name || 'Office Staff';
      const nm = document.getElementById('o-header-name');
      if (nm) nm.textContent = window._officeStaffName;
      const av = document.getElementById('o-header-avatar');
      if (av) {
        const parts = window._officeStaffName.split(' ');
        av.textContent = parts.length >= 2
          ? parts[0][0] + parts[parts.length - 1][0]
          : (parts[0][0] || 'O').toUpperCase();
      }
      const payDateEl = document.getElementById('pay-date');
      if (payDateEl && !payDateEl.value)
        payDateEl.value = new Date().toISOString().split('T')[0];
      loadOfficeDashboardStats();
    } catch(e) { console.warn('[OfficePortal]', e.message); }
  };

  window.loadOfficeProfile = function() {
    const u = auth.currentUser;
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v || '—'; };
    set('op-name',    window._officeStaffName || (u?.displayName) || '—');
    set('op-staffid', window._officeStaffId   || '—');
    set('op-email',   u?.email                || '—');
    set('op-role',    'Office Staff');
  };

  window.changeOfficePassword = async function() {
    const current = document.getElementById('op-current-pw')?.value || '';
    const newPw   = document.getElementById('op-new-pw')?.value     || '';
    const confirm = document.getElementById('op-confirm-pw')?.value || '';
    if (!current || !newPw) { showToast('⚠️ Fill in current and new password.'); return; }
    if (newPw.length < 6)   { showToast('⚠️ New password must be at least 6 characters.'); return; }
    if (newPw !== confirm)  { showToast('⚠️ Passwords do not match.'); return; }
    try {
      const u = auth.currentUser;
      const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
      const cred = EmailAuthProvider.credential(u.email, current);
      await reauthenticateWithCredential(u, cred);
      await updatePassword(u, newPw);
      ['op-current-pw','op-new-pw','op-confirm-pw'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      showToast('✅ Password updated successfully.');
    } catch(e) {
      const msg = e.code === 'auth/wrong-password' ? 'Current password is incorrect.' : e.message;
      showToast('❌ ' + msg);
    }
  };

  window.loadOfficeDashboardStats = function() {
    const today    = new Date().toISOString().split('T')[0];
    const monthPfx = today.slice(0, 7);
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    // Real-time listener for pending count
    if (window._officeStatsUnsub) { window._officeStatsUnsub(); window._officeStatsUnsub = null; }
    window._officeStatsUnsub = onSnapshot(
      query(collection(db, 'fee_transactions'), where('status', '==', 'pending'), limit(500)),
      snap => { set('o-stat-pending', snap.size); },
      e => console.warn('[OfficeDash:pending]', e.message)
    );

    // One-shot queries for remaining stats
    Promise.all([
      getDocs(query(collection(db,'fee_transactions'), where('date','==',today), limit(500))),
      getDocs(query(collection(db,'fee_transactions'), where('status','==','approved'), where('date','>=',monthPfx+'-01'), where('date','<=',monthPfx+'-31'), limit(500))),
      getDocs(query(collection(db,'students'), limit(500)))
    ]).then(([todaySnap, monthSnap, studentsSnap]) => {
      set('o-stat-today', todaySnap.size);
      let approvedAmt = 0, approvedCount = 0;
      todaySnap.forEach(d => {
        if (d.data().status === 'approved') { approvedAmt += parseFloat(d.data().amount) || 0; approvedCount++; }
      });
      set('o-stat-total-today',    fmtINR(approvedAmt));
      set('o-stat-approved-today', approvedCount);
      let monthCollected = 0;
      monthSnap.forEach(d => { monthCollected += parseFloat(d.data().amount) || 0; });
      set('o-stat-month-collected', fmtINR(monthCollected));
      let totalOutstanding = 0;
      studentsSnap.forEach(d => { totalOutstanding += parseFloat(d.data().feeBalance) || 0; });
      set('o-stat-total-outstanding', fmtINR(totalOutstanding));
      loadOfficeRecentTransactions();
    }).catch(e => console.warn('[OfficeDash]', e.message));
  };

  window.loadOfficeRecentTransactions = async function() {
    const tbody = document.getElementById('o-recent-txn-tbody');
    if (!tbody) return;
    try {
      const snap = await getDocs(query(
        collection(db,'fee_transactions'), orderBy('createdAt','desc'), limit(20)
      ));
      if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--text-light)">No transactions yet.</td></tr>';
        return;
      }
      const bc = s => s==='approved'?'badge-success':s==='rejected'?'badge-danger':'badge-warning';
      tbody.innerHTML = snap.docs.map(d => {
        const t = d.data();
        return `<tr>
          <td style="font-size:12px">${t.date||'—'}</td>
          <td><strong>${t.studentName||'—'}</strong></td>
          <td>${clsLabel(t.studentClass)}</td>
          <td style="font-weight:700">${fmtINR(t.amount)}</td>
          <td style="font-size:12px">${t.paymentMode||'—'}</td>
          <td><span class="badge ${bc(t.status)}">${t.status||'pending'}</span></td>
        </tr>`;
      }).join('');
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  };

  window.__feeModuleDb = db;
  window.__feeModuleHelpers = { clsLabel, fmtINR };

  /* ============================================================
     PART 2 — Student Search, Select, Clear, Fee Data
  ============================================================ */
  let _searchTimer = null;
  window.searchStudentForFee = function(val) {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => _execFeeSearch(val), 300);
  };

  async function _execFeeSearch(raw) {
    const resultsBox = document.getElementById('fee-search-results');
    const listEl     = document.getElementById('fee-search-list');
    if (!resultsBox || !listEl) return;
    const classFilter = document.getElementById('fee-class-filter')?.value || '';
    const q = (raw || '').trim().toLowerCase();
    if (!q && !classFilter) { resultsBox.style.display = 'none'; return; }
    listEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i></div>';
    resultsBox.style.display = 'block';
    try {
      const snap = classFilter
        ? await getDocs(query(collection(db,'students'), where('class','==',classFilter), orderBy('rollNo'), limit(40)))
        : await getDocs(query(collection(db,'students'), orderBy('name'), limit(60)));
      let students = snap.docs.map(d => ({ _docId: d.id, ...d.data() }));
      if (q) students = students.filter(s =>
        (s.name||'').toLowerCase().includes(q) ||
        (s.studentId||'').toLowerCase().includes(q) ||
        String(s.rollNo||'').includes(q)
      );
      if (!students.length) {
        listEl.innerHTML = '<div style="font-size:13px;color:var(--text-light);padding:10px">No students found.</div>';
        return;
      }
      window.__feeSearchStudents = students.slice(0, 15);
      listEl.innerHTML = window.__feeSearchStudents.map((s, i) => {
        const initials = (s.name||'S').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
        return `<div class="fee-search-item" data-idx="${i}" style="cursor:pointer">
          <div style="display:flex;align-items:center;gap:10px">
            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-dark));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0">${initials}</div>
            <div>
              <div style="font-weight:700;font-size:13px;color:var(--text)">${s.name||'—'}</div>
              <div style="font-size:11px;color:var(--text-light)">${s.studentId||'—'} · ${clsLabel(s.class)} · Roll: ${s.rollNo||'—'}</div>
            </div>
          </div>
          <div style="font-size:12px;color:var(--accent);font-weight:600">${clsLabel(s.class)}</div>
        </div>`;
      }).join('');
    } catch(e) {
      listEl.innerHTML = `<div style="color:var(--danger);font-size:13px;padding:10px">❌ ${e.message}</div>`;
    }
  }

  window.selectStudentForFee = async function(sStr) {
    console.log('Student clicked:', sStr ? JSON.parse(sStr)?.name : 'unknown');
    let s; try { s = JSON.parse(sStr); } catch(e) { console.error('[FeeSelect] parse error', e); return; }
    window._feeSelectedStudent = s;
    document.getElementById('fee-search-results').style.display  = 'none';
    document.getElementById('fee-student-panel').style.display   = 'block';
    document.getElementById('fee-ledger-container').style.display = 'none'; // reset while loading
    const initials = (s.name||'S').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
    const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
    const avEl = document.getElementById('fee-avatar'); if (avEl) avEl.textContent = initials;
    set('fee-sname', s.name||'—');
    set('fee-sinfo', `${s.studentId||'—'} · ${clsLabel(s.class)} · Roll No. ${s.rollNo||'—'}`);
    await _loadFeeDataForStudent(s);
    document.getElementById('fee-ledger-container').style.display = 'block';
    document.getElementById('fee-student-panel')?.scrollIntoView({ behavior:'smooth', block:'start' });
  };

  window.clearFeeStudent = function() {
    window._feeSelectedStudent = null;
    window._feeSelectedFeeData = null;
    document.getElementById('fee-student-panel').style.display    = 'none';
    document.getElementById('fee-ledger-container').style.display = 'none';
    const si = document.getElementById('fee-student-search'); if (si) si.value = '';
    document.getElementById('fee-search-results').style.display = 'none';
  };

  async function _loadFeeDataForStudent(s) {
    try {
      const [fsSnap, txnSnap] = await Promise.all([
        getDoc(doc(db,'fee_structure', String(s.class))),
        getDocs(query(collection(db,'fee_transactions'), where('studentId','==',s.studentId||''), limit(100)))
      ]);
      const annualFee = fsSnap.exists() ? (parseFloat(fsSnap.data().annualFee)||0) : 0;
      let sDocFeeTotal = 0;
      if (s._docId) {
        const sDocSnap = await getDoc(doc(db,'students',s._docId));
        if (sDocSnap.exists()) sDocFeeTotal = parseFloat(sDocSnap.data().feeTotal||0);
      }
      const _fs = fsSnap.exists() ? fsSnap.data() : {};
      const compTotal = (parseFloat(_fs.tuition)||0) + (parseFloat(_fs.examFee)||0) + (parseFloat(_fs.sportsFee)||0) + (parseFloat(_fs.annualCharge)||0);
      const feeTotal = compTotal > 0 ? compTotal : (annualFee || sDocFeeTotal);
      let feePaid = 0;
      txnSnap.forEach(d => { if (d.data().status==='approved') feePaid += parseFloat(d.data().amount)||0; });
      const feeBalance = Math.max(0, feeTotal - feePaid);
      const excess = feeTotal > 0 && feePaid > feeTotal ? feePaid - feeTotal : 0;
      const pct = feeTotal > 0 ? Math.min(100, Math.round((feePaid/feeTotal)*100)) : 0;
      window._feeSelectedFeeData = { feeTotal, feePaid, feeBalance, pct };
      const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
      set('fee-total-amt',   feeTotal>0 ? fmtINR(feeTotal)   : '₹—');
      set('fee-paid-amt',    fmtINR(feePaid));
      set('fee-balance-amt', feeTotal>0 ? fmtINR(feeBalance) : '₹—');
      const exBox = document.getElementById('fee-excess-msg');
      const exTxt = document.getElementById('fee-excess-text');
      if (exBox) exBox.style.display = excess > 0 ? 'block' : 'none';
      if (exTxt && excess > 0) exTxt.textContent = `Student has overpaid by ${fmtINR(excess)}. Excess amount will be refunded to the student.`;
      set('fee-progress-pct', pct+'%');
      // ── Ledger breakdown ──
      const fs = fsSnap.exists() ? fsSnap.data() : {};
      const fmt = v => v ? fmtINR(parseFloat(v)) : '—';
      set('ldg-tuition', fmt(fs.tuition));
      set('ldg-exam',    fmt(fs.examFee));
      set('ldg-sports',  fmt(fs.sportsFee));
      set('ldg-annual',  fmt(fs.annualCharge));
      set('ldg-total',   feeTotal>0 ? fmtINR(feeTotal) : '—');
      set('ldg-paid',    fmtINR(feePaid));
      set('ldg-balance', feeTotal>0 ? fmtINR(feeBalance) : '—');
      const bar = document.getElementById('fee-progress-bar');
      if (bar) bar.style.width = pct+'%';
      const bb = document.getElementById('fee-balance-block');
      if (bb) bb.classList.toggle('cleared', feeBalance===0 && feeTotal>0);
      const allTxns = [...txnSnap.docs].sort((a,b)=>(b.data().createdAt||'').localeCompare(a.data().createdAt||'')).slice(0,10);
      const mini = document.getElementById('fee-txn-mini-list');
      if (mini) {
        if (!allTxns.length) {
          mini.innerHTML = '<p style="font-size:12px;color:var(--text-light)">No payment history.</p>';
        } else {
          const col = st => st==='approved'?'#16a34a':st==='rejected'?'#dc2626':'#d97706';
          mini.innerHTML = allTxns.map(d => {
            const t = d.data();
            return `<div class="txn-mini-item" style="flex-wrap:wrap;gap:6px">
              <div style="flex:1;min-width:120px">
                <div style="font-weight:700;color:var(--text)">${fmtINR(t.amount)}</div>
                <div style="font-size:11px;color:var(--text-light)">${t.date||'—'} · ${t.paymentMode||'—'}</div>
              </div>
              <span style="color:${col(t.status)};font-weight:700;font-size:10px;white-space:nowrap;text-transform:uppercase;align-self:center">${t.status||'—'}</span>
              <div style="display:flex;gap:4px;align-self:center">
                <button onclick="editFeeTransaction('${d.id}')" style="padding:3px 8px;font-size:11px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer" title="Edit"><i class="fas fa-edit"></i></button>
                <button onclick="deleteFeeTransaction('${d.id}')" style="padding:3px 8px;font-size:11px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer" title="Delete"><i class="fas fa-trash"></i></button>
              </div>
            </div>`;
          }).join('');
        }
      }
    } catch(e) { console.warn('[FeeData]',e.message); showToast('⚠️ Could not load fee data: '+e.message); }
  }
  window._loadFeeDataForStudent = _loadFeeDataForStudent;

  // ── Edit fee transaction ──────────────────────────────────────────
  window.editFeeTransaction = async function(txnId) {
    try {
      const snap = await getDoc(doc(db, 'fee_transactions', txnId));
      if (!snap.exists()) { showToast('⚠️ Transaction not found.'); return; }
      const t = snap.data();
      document.getElementById('edit-txn-id').value           = txnId;
      document.getElementById('edit-txn-prev-amount').value  = t.amount || 0;
      document.getElementById('edit-txn-status').value       = t.status || 'pending';
      document.getElementById('edit-txn-amount').value       = t.amount || '';
      document.getElementById('edit-txn-mode').value         = t.paymentMode || 'Cash';
      document.getElementById('edit-txn-receipt').value      = t.receiptNo || '';
      document.getElementById('edit-txn-date').value         = t.date || '';
      document.getElementById('edit-txn-notes').value        = t.notes || '';
      const modal = document.getElementById('edit-txn-modal');
      if (modal) modal.style.display = 'flex';
    } catch(e) { showToast('❌ Could not load transaction: ' + e.message); }
  };

  window.saveEditFeeTransaction = async function() {
    const txnId     = document.getElementById('edit-txn-id')?.value || '';
    const prevAmt   = parseFloat(document.getElementById('edit-txn-prev-amount')?.value || 0);
    const status    = document.getElementById('edit-txn-status')?.value || '';
    const newAmt    = parseFloat(document.getElementById('edit-txn-amount')?.value || 0);
    const mode      = document.getElementById('edit-txn-mode')?.value || '';
    const receiptNo = (document.getElementById('edit-txn-receipt')?.value || '').trim();
    const date      = document.getElementById('edit-txn-date')?.value || '';
    const notes     = (document.getElementById('edit-txn-notes')?.value || '').trim();
    if (!txnId || !newAmt) { showToast('⚠️ Amount is required.'); return; }

    const btn = document.getElementById('edit-txn-save-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }
    try {
      const txnRef  = doc(db, 'fee_transactions', txnId);
      const txnSnap = await getDoc(txnRef);
      if (!txnSnap.exists()) { showToast('❌ Transaction no longer exists.'); return; }
      const t = txnSnap.data();

      // Recalculate balances if amount changed
      const amtDiff = newAmt - prevAmt;
      const newBalBefore = t.balanceBefore;
      const newBalAfter  = Math.max(0, (t.balanceAfter || 0) - amtDiff);

      await updateDoc(txnRef, {
        amount: newAmt, paymentMode: mode, receiptNo, date, notes,
        balanceAfter: newBalAfter, updatedAt: new Date().toISOString()
      });

      // If approved, adjust student balance for the amount difference
      if (status === 'approved' && amtDiff !== 0) {
        try {
          const sSnap = await getDocs(query(collection(db,'students'), where('studentId','==', t.studentId||''), limit(1)));
          if (!sSnap.empty) {
            const sRef  = doc(db,'students', sSnap.docs[0].id);
            const sData = sSnap.docs[0].data();
            const newPaid = Math.max(0, parseFloat(sData.feePaid||0) + amtDiff);
            const newBal  = Math.max(0, parseFloat(sData.feeTotal||0) - newPaid);
            await updateDoc(sRef, { feePaid: newPaid, feeBalance: newBal, updatedAt: new Date().toISOString() });
          }
        } catch(e) { console.warn('[editTxn] student balance update:', e.message); }
      }

      document.getElementById('edit-txn-modal').style.display = 'none';
      showToast('✅ Payment updated.');
      if (window._feeSelectedStudent && window._loadFeeDataForStudent)
        await window._loadFeeDataForStudent(window._feeSelectedStudent);
    } catch(e) {
      showToast('❌ Update failed: ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save Changes'; }
    }
  };

  // ── Delete fee transaction ────────────────────────────────────────
  window.deleteFeeTransaction = async function(txnId) {
    if (!confirm('Delete this payment record? This cannot be undone.')) return;
    try {
      const txnSnap = await getDoc(doc(db, 'fee_transactions', txnId));
      if (!txnSnap.exists()) { showToast('⚠️ Transaction not found.'); return; }
      const t = txnSnap.data();

      // Reverse student balance if the payment was approved
      if (t.status === 'approved') {
        try {
          const sSnap = await getDocs(query(collection(db,'students'), where('studentId','==', t.studentId||''), limit(1)));
          if (!sSnap.empty) {
            const sRef  = doc(db,'students', sSnap.docs[0].id);
            const sData = sSnap.docs[0].data();
            const newPaid = Math.max(0, parseFloat(sData.feePaid||0) - parseFloat(t.amount||0));
            const newBal  = Math.max(0, parseFloat(sData.feeTotal||0) - newPaid);
            await updateDoc(sRef, { feePaid: newPaid, feeBalance: newBal, updatedAt: new Date().toISOString() });
          }
        } catch(e) { console.warn('[deleteTxn] balance reversal:', e.message); }
      }

      await deleteDoc(doc(db, 'fee_transactions', txnId));
      showToast('🗑️ Payment deleted.');
      if (window._feeSelectedStudent && window._loadFeeDataForStudent)
        await window._loadFeeDataForStudent(window._feeSelectedStudent);
      if (window.loadAdminFeeTransactions) window.loadAdminFeeTransactions();
    } catch(e) { showToast('❌ Delete failed: ' + e.message); }
  };

  // Event delegation — handles dynamically rendered student cards
  document.addEventListener('click', function(e) {
    const item = e.target.closest('.fee-search-item[data-idx]');
    if (!item) return;
    const idx = parseInt(item.dataset.idx, 10);
    const students = window.__feeSearchStudents || [];
    if (students[idx]) window.selectStudentForFee(JSON.stringify(students[idx]));
  });

})();

// ================================================================
// BLOCK 3 — FEE MODULE PART 3
// ================================================================
/* ================================================================
   FEE MANAGEMENT MODULE — Part 3
   processPayment · _populateReceipt · loadOfficeReports
================================================================ */
(async () => {
  const app = await window._sfAppReady;
  const db = getFirestore(app);
  const CLS = { PLG:'Play Group', SKG:'SKG', LKG:'LKG' };
  const clsLabel = c => CLS[c] || (c ? 'Class ' + c : '—');
  const fmtINR   = n => '₹' + (parseFloat(n)||0).toLocaleString('en-IN');
  const fmtDate  = d => d ? new Date(d+'T00:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'}) : '—';

  window.processPayment = async function() {
    if (!window._feeSelectedStudent) { showToast('⚠️ No student selected.'); return; }
    const amount    = parseFloat(document.getElementById('pay-amount')?.value||0);
    const mode      = document.getElementById('pay-mode')?.value||'Cash';
    const receiptNo = (document.getElementById('pay-receipt-no')?.value||'').trim();
    const date      = document.getElementById('pay-date')?.value||new Date().toISOString().split('T')[0];
    const notes     = (document.getElementById('pay-notes')?.value||'').trim();
    if (!amount||amount<=0) { showToast('⚠️ Enter a valid payment amount.'); return; }
    if (!date)              { showToast('⚠️ Select a payment date.'); return; }
    const s  = window._feeSelectedStudent;
    const fd = window._feeSelectedFeeData||{};
    const balBefore = fd.feeBalance!==undefined ? fd.feeBalance : fd.feeTotal||0;
    const balAfter  = Math.max(0, balBefore - amount);
    const btn = document.querySelector('#o-fee-collection .btn-primary');
    if (btn) { btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Saving…'; btn.disabled=true; }
    try {
      const staffName = window._officeStaffName || 'Office Staff';
      const now       = new Date().toISOString();
      const txnData = {
        studentId:     s.studentId || '',
        studentName:   s.name      || '',
        studentClass:  String(s.class  || ''),
        studentRollNo: String(s.rollNo || ''),
        amount, paymentMode: mode,
        receiptNo:    receiptNo || ('RCP-' + Date.now()),
        date, notes,
        staffId:      window._officeStaffId || '',
        staffName,
        balanceBefore: balBefore,
        balanceAfter:  balAfter,
        feeTotal:      fd.feeTotal || 0,
        status:        'approved',
        approvedBy:    staffName,
        approvedAt:    now,
        source:        'office',
        createdAt:     now
      };
      const txnRef = await addDoc(collection(db, 'fee_transactions'), txnData);

      // Immediately update student's feePaid and feeBalance (non-blocking — receipt still prints if this fails)
      try {
        const sSnap = await getDocs(query(collection(db,'students'), where('studentId','==', s.studentId||''), limit(1)));
        if (!sSnap.empty) {
          const sRef     = doc(db, 'students', sSnap.docs[0].id);
          const sData    = sSnap.docs[0].data();
          const prevPaid = parseFloat(sData.feePaid  || 0);
          const total    = parseFloat(sData.feeTotal || fd.feeTotal || 0);
          const newPaid  = prevPaid + amount;
          const newBal   = Math.max(0, total - newPaid);
          await updateDoc(sRef, { feePaid: newPaid, feeBalance: newBal, feeTotal: total, updatedAt: now });
          if (window._feeSelectedFeeData) {
            window._feeSelectedFeeData.feePaid    = newPaid;
            window._feeSelectedFeeData.feeBalance = newBal;
          }
        }
      } catch(updateErr) {
        console.warn('[processPayment] student doc update failed:', updateErr.message);
      }

      // Notify the student
      if (window._triggerFeeNotification) {
        window._triggerFeeNotification(s.studentId || '', amount, balAfter, txnRef.id).catch(() => {});
      }

      showToast('✅ Payment recorded and approved. Opening receipt…');
      _populateReceipt({ ...txnData, txnId: txnRef.id, receiptType: 'official' });
      ['pay-amount','pay-receipt-no','pay-notes'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      if (window._loadFeeDataForStudent) await window._loadFeeDataForStudent(s);
    } catch(e) {
      showToast('❌ Could not record payment: ' + e.message);
    } finally {
      if (btn) { btn.innerHTML = '<i class="fas fa-save"></i> Record Payment'; btn.disabled = false; }
    }
  };

  function _populateReceipt(txn) {
    const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v||'—'; };
    set('rcp-no',           txn.receiptNo||(txn.txnId||'').slice(0,8).toUpperCase());
    set('rcp-date',         fmtDate(txn.date));
    set('rcp-student-name', txn.studentName);
    set('rcp-student-id',   txn.studentId);
    set('rcp-class',        clsLabel(txn.studentClass));
    set('rcp-roll',         txn.studentRollNo||'—');
    set('rcp-description',  (txn.notes||'Fee Payment')+' — '+clsLabel(txn.studentClass));
    set('rcp-amount',       fmtINR(txn.amount));
    set('rcp-total',        txn.feeTotal>0 ? fmtINR(txn.feeTotal) : '₹—');
    set('rcp-paid-this',    fmtINR(txn.amount));
    set('rcp-balance',      fmtINR(txn.balanceAfter));
    set('rcp-mode',         txn.paymentMode);
    set('rcp-notes',        txn.notes||'N/A');
    set('rcp-staff-name',   txn.staffName);
    set('rcp-generated-at', new Date().toLocaleString('en-IN'));
    const isOfficial = txn.receiptType !== 'provisional';
    const badge = document.getElementById('rcp-type-badge');
    if (badge) {
      badge.textContent = isOfficial ? 'Official Receipt' : 'Provisional Receipt';
      badge.style.color = isOfficial ? 'var(--accent)' : '#d97706';
      badge.style.borderColor = isOfficial ? 'var(--accent)' : '#d97706';
    }
    const disc = document.getElementById('rcp-disclaimer');
    if (disc) {
      if (isOfficial) {
        disc.style.background = '#d4edda'; disc.style.color = '#155724';
        disc.innerHTML = '<i class="fas fa-check-circle" style="margin-right:5px"></i>This is an <strong>official receipt</strong> issued by St. Francis De Sales Secondary School.';
      } else {
        disc.style.background = '#fff3cd'; disc.style.color = '#856404';
        disc.innerHTML = '<i class="fas fa-clock" style="margin-right:5px"></i>This is a <strong>provisional receipt</strong> — pending office approval. Official confirmation will be issued upon approval.';
      }
    }
    const rcpEl = document.getElementById('printable-receipt');
    if (rcpEl) rcpEl.style.display='block';
  }

  window._populateReceipt = _populateReceipt;

  window.showStudentReceipt = async function(txnId) {
    const populate = window._populateReceipt || _populateReceipt;
    if (!populate) {
      // Block 3 not yet ready — retry once after a short delay
      setTimeout(() => window.showStudentReceipt(txnId), 600);
      return;
    }
    try {
      const snap = await getDoc(doc(db, 'fee_transactions', txnId));
      if (!snap.exists()) { showToast('⚠️ Receipt not found.'); return; }
      const txnData = snap.data();
      const receiptType = txnData.status === 'approved' ? 'official' : 'provisional';
      populate({ ...txnData, txnId, receiptType });
      const rcpEl = document.getElementById('printable-receipt');
      if (rcpEl) rcpEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch(e) { showToast('⚠️ Could not load receipt: ' + e.message); }
  };

  window.loadOfficeReports = async function() {
    const tbody = document.getElementById('o-reports-tbody');
    if (!tbody) return;
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    const filter = document.getElementById('o-report-filter')?.value||'all';
    try {
      const snap = filter==='all'
        ? await getDocs(query(collection(db,'fee_transactions'), orderBy('createdAt','desc'), limit(60)))
        : await getDocs(query(collection(db,'fee_transactions'), where('status','==',filter), orderBy('createdAt','desc'), limit(60)));
      if (snap.empty) {
        tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--text-light)">No records found.</td></tr>';
        return;
      }
      const bc = s => s==='approved'?'badge-success':s==='rejected'?'badge-danger':'badge-warning';
      tbody.innerHTML = snap.docs.map(d => {
        const t=d.data();
        return `<tr>
          <td style="font-size:12px">${t.date||'—'}</td>
          <td><strong>${t.studentName||'—'}</strong></td>
          <td>${clsLabel(t.studentClass)}</td>
          <td style="font-weight:700">${fmtINR(t.amount)}</td>
          <td style="font-size:12px">${t.paymentMode||'—'}</td>
          <td style="font-size:12px;font-family:monospace">${t.receiptNo||'—'}</td>
          <td style="font-size:12px">${t.staffName||'—'}</td>
          <td><span class="badge ${bc(t.status)}">${t.status||'pending'}</span></td>
        </tr>`;
      }).join('');
    } catch(e) {
      tbody.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  };

  window.loadClasswiseDueReport = async function() {
    const cls    = document.getElementById('o-classwise-filter')?.value || '';
    const tbody  = document.getElementById('o-classwise-tbody');
    const summary= document.getElementById('o-classwise-summary');
    if (!tbody) return;
    if (!cls) { showToast('⚠️ Please select a class.'); return; }
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>`;
    if (summary) summary.innerHTML = '';
    try {
      const snap = await getDocs(query(collection(db,'students'), where('class','==',cls), limit(200)));
      if (snap.empty) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-light)">No students found in this class.</td></tr>`;
        return;
      }
      const students = snap.docs.map(d => d.data())
        .sort((a,b) => (parseInt(a.rollNo)||0) - (parseInt(b.rollNo)||0));
      let totalBalance = 0, cleared = 0;
      tbody.innerHTML = students.map(s => {
        const total   = parseFloat(s.feeTotal  || 0);
        const paid    = parseFloat(s.feePaid   || 0);
        const balance = parseFloat(s.feeBalance|| Math.max(0, total - paid));
        if (balance <= 0) cleared++;
        totalBalance += balance;
        const rowColor = balance <= 0 ? 'background:#d4edda' : 'background:#fff3cd';
        const badge    = balance <= 0
          ? `<span class="badge badge-success">Cleared</span>`
          : `<span class="badge badge-danger">Due: ${fmtINR(balance)}</span>`;
        return `<tr style="${rowColor}">
          <td style="font-size:12px">${s.rollNo||'—'}</td>
          <td><strong>${s.name||'—'}</strong></td>
          <td style="font-weight:700">${fmtINR(total)}</td>
          <td style="color:#28a745;font-weight:700">${fmtINR(paid)}</td>
          <td style="color:#dc3545;font-weight:700">${fmtINR(balance)}</td>
          <td>${badge}</td>
        </tr>`;
      }).join('');
      if (summary) summary.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <span style="background:#d4edda;color:#155724;border:1px solid #c3e6cb;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700"><i class="fas fa-check-circle"></i> ${cleared} Cleared</span>
          <span style="background:#fff3cd;color:#856404;border:1px solid #ffc107;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700"><i class="fas fa-exclamation-triangle"></i> ${students.length - cleared} With Dues</span>
          <span style="background:#f8d7da;color:#721c24;border:1px solid #dc3545;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700"><i class="fas fa-rupee-sign"></i> ${fmtINR(totalBalance)} Outstanding</span>
        </div>`;
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  };
})();

// ================================================================
// BLOCK 4 — FEE MODULE PART 4
// ================================================================
/* ================================================================
   FEE MANAGEMENT MODULE — Part 4
   Admin Fee Structure CRUD · loadAdminFeeTransactions
================================================================ */
(async () => {
  const app = await window._sfAppReady;
  const db = getFirestore(app);
  const CLS = { PLG:'Play Group', SKG:'SKG', LKG:'LKG' };
  const clsLabel = c => CLS[c] || (c ? 'Class ' + c : '—');
  const fmtINR   = n => '₹' + (parseFloat(n)||0).toLocaleString('en-IN');

  window.saveFeeStructure = async function() {
    const cls       = document.getElementById('fs-class')?.value||'';
    const annualFee = parseFloat(document.getElementById('fs-annual-fee')?.value||0);
    if (!cls||!annualFee) { showToast('⚠️ Class and annual fee are required.'); return; }
    const data = {
      class: cls, annualFee,
      tuition:      parseFloat(document.getElementById('fs-tuition')?.value     ||0)||0,
      examFee:      parseFloat(document.getElementById('fs-exam-fee')?.value    ||0)||0,
      sportsFee:    parseFloat(document.getElementById('fs-sports-fee')?.value  ||0)||0,
      annualCharge: parseFloat(document.getElementById('fs-annual-charge')?.value||0)||0,
      notes:       (document.getElementById('fs-notes')?.value||'').trim(),
      updatedAt:    new Date().toISOString()
    };
    try {
      await setDoc(doc(db,'fee_structure',cls), data, { merge:true });
      showToast('✅ Fee structure saved for '+clsLabel(cls));
      loadAdminFeeStructure();
    } catch(e) { showToast('❌ '+e.message); }
  };

  window.loadAdminFeeStructure = async function() {
    const el = document.getElementById('admin-fee-structure-list');
    if (!el) return;
    el.innerHTML='<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
    try {
      const snap = await getDocs(collection(db,'fee_structure'));
      if (snap.empty) { el.innerHTML='<p style="color:var(--text-light);font-size:13px">No fee structure set yet.</p>'; return; }
      const ORDER = ['PLG','SKG','LKG','1','2','3','4','5','6','7','8','9','10'];
      const sorted = [...snap.docs].sort((a,b)=>ORDER.indexOf(a.data().class)-ORDER.indexOf(b.data().class));
      el.innerHTML = `<div class="table-wrap"><table style="width:100%;font-size:13px;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;padding:8px 4px;border-bottom:1.5px solid var(--bg);color:var(--accent-dark)">Class</th>
          <th style="text-align:right;padding:8px 4px;border-bottom:1.5px solid var(--bg);color:var(--accent-dark)">Annual Fee</th>
          <th style="text-align:right;padding:8px 4px;border-bottom:1.5px solid var(--bg)"></th>
        </tr></thead><tbody>`+
        sorted.map(d => {
          const f=d.data();
          return `<tr>
            <td style="padding:8px 4px;border-bottom:1px solid var(--bg)"><strong>${clsLabel(f.class)}</strong>${f.notes?`<div style="font-size:11px;color:var(--text-light)">${f.notes}</div>`:''}</td>
            <td style="padding:8px 4px;border-bottom:1px solid var(--bg);text-align:right;font-weight:700;color:var(--accent-dark)">${fmtINR(f.annualFee)}</td>
            <td style="padding:8px 4px;border-bottom:1px solid var(--bg);text-align:right;white-space:nowrap">
              <button onclick="prefillFeeStructure('${f.class}',${f.annualFee||0},${f.tuition||0},${f.examFee||0},${f.sportsFee||0},${f.annualCharge||0})" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px"><i class="fas fa-edit"></i></button>
              <button onclick="deleteFeeStructure('${f.class}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px;margin-left:8px"><i class="fas fa-trash"></i></button>
            </td>
          </tr>`;
        }).join('')+`</tbody></table></div>`;
    } catch(e) { el.innerHTML=`<p style="color:var(--danger)">❌ ${e.message}</p>`; }
  };

  window.prefillFeeStructure = function(cls,annual,tuition,exam,sports,annualCharge) {
    const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=v; };
    set('fs-class',cls); set('fs-annual-fee',annual); set('fs-tuition',tuition);
    set('fs-exam-fee',exam); set('fs-sports-fee',sports); set('fs-annual-charge',annualCharge);
  };

  window.deleteFeeStructure = async function(cls) {
    if (!confirm('Delete fee structure for '+clsLabel(cls)+'?')) return;
    try {
      await deleteDoc(doc(db,'fee_structure',cls));
      showToast('🗑️ Fee structure deleted.');
      loadAdminFeeStructure();
    } catch(e) { showToast('❌ '+e.message); }
  };

  window.loadAdminFeeTransactions = async function() {
    const tbody = document.getElementById('admin-fee-txn-tbody');
    if (!tbody) return;
    tbody.innerHTML='<tr><td colspan="11" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    const filter = (document.getElementById('a-txn-filter') || document.getElementById('o-txn-filter'))?.value || 'pending';
    try {
      const snap = filter==='all'
        ? await getDocs(query(collection(db,'fee_transactions'), limit(100)))
        : await getDocs(query(collection(db,'fee_transactions'), where('status','==',filter), limit(100)));
      if (snap.empty) {
        tbody.innerHTML='<tr><td colspan="11" style="text-align:center;padding:18px;color:var(--text-light)">No records found.</td></tr>';
        return;
      }
      // Sort newest first client-side to avoid needing a composite Firestore index
      const docs = snap.docs.slice().sort((a,b) => {
        const ta = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : new Date(a.data().createdAt||0).getTime();
        const tb = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : new Date(b.data().createdAt||0).getTime();
        return tb - ta;
      });
      const bc = s => s==='approved'?'badge-success':s==='rejected'?'badge-danger':'badge-warning';
      tbody.innerHTML = docs.map(d => {
        const t=d.data();
        const receiptCell = t.receiptUrl
          ? `<div style="font-family:monospace;font-size:12px">${t.receiptNo||'—'}</div>
             <a href="${t.receiptUrl}" target="_blank" rel="noopener"
                style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:11px;color:var(--primary);text-decoration:none;background:rgba(99,102,241,.08);padding:3px 8px;border-radius:6px;border:1px solid var(--primary)">
               <i class="fas fa-image"></i> View Receipt
             </a>`
          : `<span style="font-family:monospace;font-size:12px">${t.receiptNo||'—'}</span>`;
        const sourceTag = t.source==='student-portal'
          ? `<div style="font-size:10px;color:var(--primary);margin-top:2px"><i class="fas fa-mobile-alt"></i> Online</div>`
          : '';
        const editDelBtns = `<button onclick="editFeeTransaction('${d.id}')" style="padding:3px 8px;font-size:11px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer" title="Edit"><i class="fas fa-edit"></i></button>
               <button onclick="deleteFeeTransaction('${d.id}')" style="padding:3px 8px;font-size:11px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer" title="Delete"><i class="fas fa-trash"></i></button>`;
        const acts = t.status==='pending'
          ? `<div style="display:flex;gap:4px;flex-wrap:wrap">
               <button class="btn btn-sm btn-success" style="font-size:11px;padding:3px 8px" onclick="approveFeeTransaction('${d.id}')"><i class="fas fa-check"></i> Approve</button>
               <button class="btn btn-sm btn-danger"  style="font-size:11px;padding:3px 7px" onclick="rejectFeeTransaction('${d.id}')"><i class="fas fa-times"></i></button>
               ${editDelBtns}
             </div>`
          : `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">
               <span style="font-size:11px;color:var(--text-light)">${t.status==='approved'?(t.approvedBy||'Staff'):'Rejected'}</span>
               ${editDelBtns}
             </div>`;
        return `<tr>
          <td style="font-size:12px">${t.date||'—'}</td>
          <td><strong>${t.studentName||'—'}</strong>${sourceTag}</td>
          <td>${clsLabel(t.studentClass)}</td>
          <td style="font-weight:700">${fmtINR(t.amount)}</td>
          <td style="font-size:12px">${t.paymentMode||'—'}</td>
          <td>${receiptCell}</td>
          <td style="font-size:12px">${fmtINR(t.balanceBefore)}</td>
          <td style="font-size:12px;font-weight:700;color:var(--accent-dark)">${fmtINR(t.balanceAfter)}</td>
          <td style="font-size:12px">${t.staffName||'—'}</td>
          <td><span class="badge ${bc(t.status)}">${t.status||'pending'}</span></td>
          <td>${acts}</td>
        </tr>`;
      }).join('');
    } catch(e) {
      tbody.innerHTML=`<tr><td colspan="11" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  };
})();

// ================================================================
// BLOCK 5 — OFFICE STAFF FEE STRUCTURE LOGIC
// ================================================================
/* ================================================================
   OFFICE STAFF — Fee Structure Logic (Step 2)
================================================================ */
(async () => {
  const app = await window._sfAppReady;
  const db = getFirestore(app);

  const CLS   = { PLG:'Play Group', SKG:'SKG', LKG:'LKG' };
  const clsLabel = c => CLS[c] || (c ? 'Class ' + c : '—');
  const fmtINR   = n => '₹' + (parseFloat(n)||0).toLocaleString('en-IN');
  const ORDER    = ['PLG','SKG','LKG','1','2','3','4','5','6','7','8','9','10'];

  window.officeStaffSaveFeeStructure = async function() {
    const cls       = (document.getElementById('ofs-class')?.value       || '').trim();
    const annualFee = parseFloat(document.getElementById('ofs-annual-fee')?.value || 0);
    if (!cls)       { showToast('⚠️ Please select a class.'); return; }
    if (!annualFee) { showToast('⚠️ Annual fee is required.'); return; }

    const data = {
      class:        cls,
      annualFee,
      tuition:      parseFloat(document.getElementById('ofs-tuition')?.value      ||0)||0,
      examFee:      parseFloat(document.getElementById('ofs-exam-fee')?.value     ||0)||0,
      sportsFee:    parseFloat(document.getElementById('ofs-sports-fee')?.value   ||0)||0,
      annualCharge: parseFloat(document.getElementById('ofs-annual-charge')?.value||0)||0,
      notes:        (document.getElementById('ofs-notes')?.value||'').trim(),
      updatedAt:    new Date().toISOString(),
      updatedBy:    window._officeStaffName || 'Office Staff'
    };

    try {
      await setDoc(doc(db, 'fee_structure', cls), data, { merge: true });
      showToast('✅ Fee structure saved for ' + clsLabel(cls));
      // Clear form
      ['ofs-class','ofs-annual-fee','ofs-tuition','ofs-exam-fee','ofs-sports-fee','ofs-annual-charge','ofs-notes']
        .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
      officeStaffLoadFeeStructure();
    } catch(e) { showToast('❌ ' + e.message); }
  };

  window.officeStaffLoadFeeStructure = async function() {
    const el = document.getElementById('ofs-structure-list');
    if (!el) return;
    el.innerHTML = '<p style="font-size:13px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
    try {
      const snap = await getDocs(collection(db, 'fee_structure'));
      if (snap.empty) {
        el.innerHTML = '<p style="font-size:13px;color:var(--text-light)">No fee structure set yet.</p>';
        return;
      }
      const sorted = [...snap.docs].sort((a,b) => ORDER.indexOf(a.data().class) - ORDER.indexOf(b.data().class));
      el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Class</th><th>Annual Fee</th><th>Updated By</th><th></th></tr></thead><tbody>' +
        sorted.map(d => {
          const f = d.data();
          return `<tr>
            <td><strong>${clsLabel(f.class)}</strong>${f.notes ? `<div style="font-size:11px;color:var(--text-light)">${f.notes}</div>` : ''}</td>
            <td style="font-weight:700;color:var(--accent-dark)">${fmtINR(f.annualFee)}</td>
            <td style="font-size:12px;color:var(--text-light)">${f.updatedBy||'—'}</td>
            <td>
              <button onclick="officeStaffPrefillFeeForm('${f.class}',${f.annualFee||0},${f.tuition||0},${f.examFee||0},${f.sportsFee||0},${f.annualCharge||0})"
                style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px" title="Edit">
                <i class="fas fa-edit"></i>
              </button>
            </td>
          </tr>`;
        }).join('') + '</tbody></table></div>';
    } catch(e) {
      el.innerHTML = `<p style="color:var(--danger);font-size:13px">❌ ${e.message}</p>`;
    }
  };

  window.officeStaffPrefillFeeForm = function(cls, annual, tuition, exam, sports, annualCharge) {
    const set = (id, v) => { const e=document.getElementById(id); if(e) e.value=v; };
    set('ofs-class', cls);       set('ofs-annual-fee', annual);
    set('ofs-tuition', tuition); set('ofs-exam-fee', exam);
    set('ofs-sports-fee', sports); set('ofs-annual-charge', annualCharge);
  };

  /* Auto-load when the section is opened */
  console.log('[OfficeFeeStructure] ✅ Loaded');
})();

// ================================================================
// BLOCK 6 — OFFICE STAFF ACCOUNT MANAGEMENT
// ================================================================
/* ================================================================
   OFFICE STAFF ACCOUNT MANAGEMENT
   Admin can create / list / delete Office Staff logins
================================================================ */
(async () => {
  const app = await window._sfAppReady;
  const auth = getAuth(app);
  const db   = getFirestore(app);

  const idToEmail = id => id.trim().toLowerCase().replace(/[^a-z0-9]/g,'_') + '@stfrancis.school';

  function _osMsg(type, text) {
    const errEl = document.getElementById('os-create-error');
    const okEl  = document.getElementById('os-create-success');
    if (!errEl || !okEl) return;
    errEl.style.display = 'none';
    okEl.style.display  = 'none';
    if (type === 'error') { errEl.textContent = text; errEl.style.display = 'block'; }
    if (type === 'ok')    { okEl.textContent  = text; okEl.style.display  = 'block'; }
  }

  window.createOfficeStaffAccount = async function() {
    const name     = (document.getElementById('os-name')?.value     || '').trim();
    const staffId  = (document.getElementById('os-staffid')?.value  || '').trim().toUpperCase();
    const password = (document.getElementById('os-password')?.value || '').trim();

    if (!name)              { _osMsg('error','Full name is required.');           return; }
    if (!staffId)           { _osMsg('error','Staff Login ID is required.');      return; }
    if (password.length < 6){ _osMsg('error','Password must be at least 6 characters.'); return; }

    const btn = document.getElementById('os-create-btn');
    if (btn) { btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Creating…'; btn.disabled=true; }
    _osMsg('', '');

    try {
      const email = idToEmail(staffId);
      let uid = '';

      try {
        uid = await createAuthAccountSafe(email, password);
      } catch(e) {
        if (e.code === 'auth/email-already-in-use') {
          const snap = await getDocs(query(collection(db,'users'), where('loginId','==',staffId), limit(1)));
          if (!snap.empty) uid = snap.docs[0].id;
          else { _osMsg('error','Login ID already taken. Choose a different ID.'); return; }
        } else throw e;
      }

      await setDoc(doc(db,'users',uid), {
        name, staffId, loginId: staffId,
        email, role: 'office',
        createdAt: new Date().toISOString()
      }, { merge: true });

      _osMsg('ok', `✅ Account created! Staff ID: ${staffId} · Password: ${password}`);
      document.getElementById('os-name').value     = '';
      document.getElementById('os-staffid').value  = '';
      document.getElementById('os-password').value = '';
      loadOfficeStaffList();
    } catch(e) {
      _osMsg('error', '❌ ' + (e.message || 'Could not create account.'));
    } finally {
      if (btn) { btn.innerHTML='<i class="fas fa-user-plus"></i> Create Account'; btn.disabled=false; }
    }
  };

  window.loadOfficeStaffList = async function() {
    const el = document.getElementById('os-staff-list');
    if (!el) return;
    el.innerHTML = '<p style="font-size:13px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
    try {
      const snap = await getDocs(query(collection(db,'users'), where('role','==','office'), orderBy('createdAt','desc'), limit(50)));
      if (snap.empty) { el.innerHTML='<p style="font-size:13px;color:var(--text-light)">No office staff accounts yet.</p>'; return; }
      el.innerHTML = '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Login ID</th><th>Created</th><th></th></tr></thead><tbody>' +
        snap.docs.map(d => {
          const u = d.data();
          const date = u.createdAt ? u.createdAt.split('T')[0] : '—';
          return `<tr>
            <td><strong>${u.name||'—'}</strong></td>
            <td style="font-family:monospace;font-size:13px">${u.loginId||u.staffId||'—'}</td>
            <td style="font-size:12px;color:var(--text-light)">${date}</td>
            <td><button onclick="deleteOfficeStaff('${d.id}','${u.name||''}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px" title="Remove"><i class="fas fa-trash"></i></button></td>
          </tr>`;
        }).join('') + '</tbody></table></div>';
    } catch(e) {
      el.innerHTML = `<p style="color:var(--danger);font-size:13px">❌ ${e.message}</p>`;
    }
  };

  window.deleteOfficeStaff = async function(uid, name) {
    if (!confirm(`Remove "${name}" from office staff? Their Firebase Auth account will remain but portal access will be revoked.`)) return;
    try {
      await deleteDoc(doc(db,'users',uid));
      showToast('🗑️ Staff record removed.');
      loadOfficeStaffList();
    } catch(e) { showToast('❌ '+e.message); }
  };

  console.log('[OfficeStaffMgmt] ✅ Loaded');
})();

// ================================================================
// BLOCK 7 — FEE MODULE PART 5 FINAL
// ================================================================
/* ================================================================
   FEE MANAGEMENT MODULE — Part 5 (Final)
   Approve/Reject · Student Notifications · showDash hooks · loginAs
================================================================ */
(async () => {
  const app = await window._sfAppReady;
  const db = getFirestore(app);
  const fmtINR = n => '₹' + (parseFloat(n)||0).toLocaleString('en-IN');

  window.approveFeeTransaction = async function(txnId) {
    if (!confirm('Approve this payment? Student balance will be officially updated.')) return;
    const clickedBtn = document.activeElement;
    if (clickedBtn) { clickedBtn.disabled=true; clickedBtn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; }
    try {
      const txnRef  = doc(db,'fee_transactions',txnId);
      const txnSnap = await getDoc(txnRef);
      if (!txnSnap.exists())                   { showToast('❌ Transaction not found.'); return; }
      if (txnSnap.data().status !== 'pending') { showToast('⚠️ Already processed.');   return; }
      const txn = txnSnap.data();

      await updateDoc(txnRef, {
        status: 'approved', approvedBy: 'Admin', approvedAt: new Date().toISOString()
      });

      const sSnap = await getDocs(query(collection(db,'students'), where('studentId','==',txn.studentId), limit(1)));
      let newBalance = txn.balanceAfter;
      if (!sSnap.empty) {
        const sRef  = doc(db,'students',sSnap.docs[0].id);
        const sData = sSnap.docs[0].data();
        const prevPaid   = parseFloat(sData.feePaid  ||0);
        const feeTotal   = parseFloat(sData.feeTotal ||txn.feeTotal||0);
        const newFeePaid = prevPaid + parseFloat(txn.amount);
        newBalance       = Math.max(0, feeTotal - newFeePaid);
        await updateDoc(sRef, {
          feePaid: newFeePaid, feeBalance: newBalance,
          feeTotal, updatedAt: new Date().toISOString()
        });
      }

      await _triggerFeeNotification(txn.studentId, txn.amount, newBalance, txnId);
      showToast('✅ Approved! Balance updated and notification sent.');
      if (window.loadAdminFeeTransactions) loadAdminFeeTransactions();
    } catch(e) {
      showToast('❌ Approval failed: '+e.message);
    } finally {
      if (clickedBtn) { clickedBtn.disabled=false; clickedBtn.innerHTML='<i class="fas fa-check"></i> Approve'; }
    }
  };

  window.rejectFeeTransaction = async function(txnId) {
    if (!confirm('Reject this transaction? No balance change will occur.')) return;
    try {
      await updateDoc(doc(db,'fee_transactions',txnId), {
        status:'rejected', rejectedBy:'Admin', rejectedAt: new Date().toISOString()
      });
      showToast('🗑️ Transaction rejected.');
      if (window.loadAdminFeeTransactions) loadAdminFeeTransactions();
    } catch(e) { showToast('❌ '+e.message); }
  };

  async function _triggerFeeNotification(studentId, amountPaid, remainingBalance, txnId) {
    try {
      const uSnap = await getDocs(query(collection(db,'users'), where('studentId','==',studentId), limit(1)));
      if (uSnap.empty) return;
      const uid = uSnap.docs[0].id;
      const msg = `Thank you, your payment of ${fmtINR(amountPaid)} is completed. This is for your acknowledgement. Remaining Balance: ${fmtINR(remainingBalance)}.`;
      await addDoc(collection(db,'users',uid,'notifications'), {
        message: msg, type: 'fee_payment', icon: 'fas fa-check-circle',
        amountPaid: parseFloat(amountPaid), remainingBalance: parseFloat(remainingBalance),
        txnId, read: false, createdAt: new Date().toISOString()
      });
    } catch(e) { console.warn('[FeeNotif]',e.message); }
  }

  window.loadStudentFeeNotifications = async function(uid) {
    if (!uid) return [];
    try {
      const snap = await getDocs(query(
        collection(db,'users',uid,'notifications'),
        where('type','==','fee_payment'), orderBy('createdAt','desc'), limit(5)
      ));
      return snap.docs.map(d => ({ id:d.id, ...d.data() }));
    } catch(e) { return []; }
  };

  window.markFeeNotifRead = async function(uid, notifId) {
    try { await updateDoc(doc(db,'users',uid,'notifications',notifId), { read:true }); } catch(e) {}
  };

  /* ── Patch NC to surface fee payment confirmations ── */
  const _origNC = window.loadStudentNotificationCenter;
  window.loadStudentNotificationCenter = async function(user) {
    if (_origNC) await _origNC(user);
    if (!user?.uid) return;
    try {
      const notifs = await window.loadStudentFeeNotifications(user.uid);
      const latest = notifs[0]; // most recent regardless of read state
      const unread = notifs.find(n => !n.read);
      if (unread && window.NotificationCenter) {
        window.NotificationCenter.render(undefined, [{
          message: unread.message, isUrgent: false,
          tag: 'Payment Confirmed', date: (unread.createdAt||'').split('T')[0]
        }]);
        setTimeout(() => window.markFeeNotifRead(user.uid, unread.id), 3000);
      }
      // Inject "View Receipt" button into the fee card in notification center
      if (latest?.txnId) {
        setTimeout(() => {
          const feeCard = document.getElementById('nc-fee-card');
          if (feeCard && !feeCard.querySelector('.nc-receipt-btn')) {
            const btn = document.createElement('button');
            btn.className = 'nc-receipt-btn';
            btn.innerHTML = '<i class="fas fa-receipt" style="margin-right:5px"></i>View Latest Receipt';
            btn.style.cssText = 'margin-top:10px;width:100%;padding:7px 12px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer';
            btn.onclick = () => { if(window.showStudentReceipt) window.showStudentReceipt(latest.txnId); showDash('s','s-fees',null); };
            feeCard.appendChild(btn);
          }
        }, 800);
      }
    } catch(e) {}
  };

  console.log('[FeeModule] ✅ Loaded — Office Portal · Fee Structure · Approvals · Notifications');
})();

// ================================================================
// BLOCK 8 — ADMISSIONS LOGIC (OFFICE STAFF PORTAL)
// ================================================================
(async () => {
  let currentAdmissionId = null, currentAdmissionData = null;
  // db and Firestore functions are available from module-level imports

  // ── Load admissions list ──────────────────────────────────────
  window.loadOfficeAdmissions = async function() {
    const tbody = document.getElementById('adm-list-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
    try {
      const statusFilter = document.getElementById('adm-filter-status')?.value || 'pending';
      let q;
      if (statusFilter === 'all') {
        q = query(collection(db, 'admissions'));
      } else {
        q = query(collection(db, 'admissions'), where('status', '==', statusFilter));
      }
      const snap = await getDocs(q);
      // Sort client-side to avoid requiring a composite Firestore index
      const sortedDocs = snap.docs.slice().sort((a, b) => {
        const ta = a.data().submittedAt?.toMillis ? a.data().submittedAt.toMillis() : 0;
        const tb = b.data().submittedAt?.toMillis ? b.data().submittedAt.toMillis() : 0;
        return tb - ta;
      });
      if (snap.empty) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-light)">No applications found.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      sortedDocs.forEach(d => {
        const a = d.data();
        const date = a.submittedAt?.toDate ? a.submittedAt.toDate().toLocaleDateString('en-IN') : '—';
        const statusBadge = a.status === 'forwarded_to_admin'
          ? '<span style="background:#d1fae5;color:#065f46;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600">Forwarded</span>'
          : '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600">Pending</span>';
        const tr = document.createElement('tr');
        tr.style.cssText = 'border-bottom:1px solid var(--border);cursor:pointer';
        tr.innerHTML = `
          <td style="padding:10px 12px;font-size:13px;white-space:nowrap">${a.fullName || '—'}</td>
          <td style="padding:10px 12px;font-size:13px;white-space:nowrap">${a.classApplied || '—'}</td>
          <td style="padding:10px 12px;font-size:13px;white-space:nowrap">${date}</td>
          <td style="padding:10px 12px;font-size:13px">${statusBadge}</td>
          <td style="padding:10px 12px;white-space:nowrap;display:flex;gap:6px">
            <button onclick="viewAdmission('${d.id}')" style="padding:6px 12px;background:var(--primary);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer"><i class="fas fa-eye"></i> View</button>
            <button onclick="printAdmissionById('${d.id}')" style="padding:6px 10px;background:#6b7280;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer" title="Print"><i class="fas fa-print"></i></button>
          </td>`;
        tbody.appendChild(tr);
      });
      window.__admissionsCache = {};
      sortedDocs.forEach(d => { window.__admissionsCache[d.id] = d.data(); });
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:#ef4444">Error: ${e.message}</td></tr>`;
    }
  };

  window.printAdmissionById = async function(id) {
    const cached = (window.__admissionsCache || {})[id];
    if (cached) { window._printAdmissionPDF(cached); return; }
    try {
      const snap = await getDoc(doc(db, 'admissions', id));
      if (!snap.exists()) { showToast('⚠️ Application not found.'); return; }
      window._printAdmissionPDF(snap.data());
    } catch(e) { showToast('❌ Could not load application: ' + e.message); }
  };

  // ── View single application ───────────────────────────────────
  window.viewAdmission = function(id) {
    const a = (window.__admissionsCache || {})[id];
    if (!a) { showToast('⚠️ Application data not loaded.'); return; }
    currentAdmissionId   = id;
    currentAdmissionData = a;

    const sv = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    sv('adm-d-name',       a.fullName);
    sv('adm-d-class',      a.classApplied);
    sv('adm-d-dob',        a.dob);
    sv('adm-d-gender',     a.gender);
    sv('adm-d-year',       a.year);
    sv('adm-d-prevschool', a.previousSchool);
    sv('adm-d-address',    a.address);
    sv('adm-d-medical',    a.medical);
    sv('adm-d-parent',     a.parentName);
    sv('adm-d-relation',   a.relation);
    sv('adm-d-contact',    a.contact);
    sv('adm-d-email',      a.email);
    const f = a.father || {}, m = a.mother || {};
    sv('adm-d-father-name', f.name);
    sv('adm-d-father-occ',  f.occupation);
    sv('adm-d-father-tel',  f.contact);
    sv('adm-d-mother-name', m.name);
    sv('adm-d-mother-occ',  m.occupation);
    sv('adm-d-mother-tel',  m.contact);
    document.getElementById('adm-d-notes').value = '';

    // Documents
    const docsEl = document.getElementById('adm-d-docs');
    const docs = a.documents || [];
    if (docs.length) {
      docsEl.innerHTML = docs.map(d =>
        `<a href="${d.url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--glass-bg);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--primary);text-decoration:none"><i class="fas fa-file"></i>${d.name}</a>`
      ).join('');
    } else {
      docsEl.innerHTML = '<span style="color:var(--text-light);font-size:13px">No documents attached.</span>';
    }

    // Status badge
    const badge = document.getElementById('adm-d-status-badge');
    if (badge) {
      const statusColors = {
        pending: '#d97706,#fef3c7', forwarded_to_admin: '#2563eb,#dbeafe',
        Shortlisted: '#7c3aed,#ede9fe', Admitted: '#059669,#d1fae5', Rejected: '#dc2626,#fee2e2'
      };
      const [fg, bg] = (statusColors[a.status] || '#475569,#f1f5f9').split(',');
      badge.textContent = a.status || 'unknown';
      badge.style.cssText += `;display:inline-block;color:${fg};background:${bg};`;
    }

    // Forward button state
    const isTerminal = ['Admitted','Rejected'].includes(a.status);
    const fwdBtn = document.getElementById('adm-forward-btn');
    if (fwdBtn) {
      if (a.status === 'forwarded_to_admin' || isTerminal) {
        fwdBtn.disabled = true;
        fwdBtn.textContent = a.status === 'forwarded_to_admin' ? '✓ Already Forwarded' : '— ' + a.status;
        fwdBtn.style.opacity = '0.5';
      } else {
        fwdBtn.disabled = false;
        fwdBtn.innerHTML = '<i class="fas fa-share" style="margin-right:6px"></i>Forward to Admin';
        fwdBtn.style.opacity = '1';
      }
    }

    // Save button state — disable for terminal statuses
    const saveBtn = document.querySelector('#adm-detail-panel button[onclick="saveAdmissionChanges()"]');
    if (saveBtn) { saveBtn.disabled = isTerminal; saveBtn.style.opacity = isTerminal ? '0.5' : '1'; }

    document.getElementById('adm-detail-panel').style.display = 'block';
    document.getElementById('adm-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Close detail panel ────────────────────────────────────────
  window.closeAdmissionDetail = function() {
    currentAdmissionId   = null;
    currentAdmissionData = null;
    document.getElementById('adm-detail-panel').style.display = 'none';
  };

  window.saveAdmissionChanges = async function() {
    if (!currentAdmissionId) { showToast('⚠️ No application selected.'); return; }
    const gv = id => (document.getElementById(id) || {}).value?.trim() || '';
    const payload = {
      fullName: gv('adm-d-name'), classApplied: gv('adm-d-class'),
      dob: gv('adm-d-dob'), gender: gv('adm-d-gender'),
      year: gv('adm-d-year'), previousSchool: gv('adm-d-prevschool'),
      address: gv('adm-d-address'), medical: gv('adm-d-medical'),
      parentName: gv('adm-d-parent'), relation: gv('adm-d-relation'),
      contact: gv('adm-d-contact'), email: gv('adm-d-email'),
      father: { name: gv('adm-d-father-name'), occupation: gv('adm-d-father-occ'), contact: gv('adm-d-father-tel') },
      mother: { name: gv('adm-d-mother-name'), occupation: gv('adm-d-mother-occ'), contact: gv('adm-d-mother-tel') },
    };
    try {
      await updateDoc(doc(db, 'admissions', currentAdmissionId), payload);
      currentAdmissionData = { ...currentAdmissionData, ...payload };
      if (window.__admissionsCache) window.__admissionsCache[currentAdmissionId] = currentAdmissionData;
      showToast('✅ Changes saved.');
    } catch(e) { showToast('❌ ' + e.message); }
  };

  // ── Print / Save PDF ──────────────────────────────────────────
  // ── Shared PDF print builder — reused by Office and Admin portals ──
  window._printAdmissionPDF = function(a) {
    if (!a) { showToast('⚠️ No application data.'); return; }
    const frame = document.getElementById('adm-print-frame');
    if (!frame) { showToast('⚠️ Print frame missing.'); return; }
    const esc = v => (v == null ? '—' : String(v).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])));
    const date = a.submittedAt?.toDate
      ? a.submittedAt.toDate().toLocaleDateString('en-IN')
      : (a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-IN') : 'N/A');
    const f = a.father || {};
    const m = a.mother || {};
    const docs = a.documents || [];
    const docsHtml = docs.length
      ? docs.map(d => `<li><strong>${esc(d.label || d.name)}</strong> — ${esc(d.name)}</li>`).join('')
      : '<li>No documents attached.</li>';
    const name = esc(a.fullName || a.studentName || '—');
    const cls  = esc(a.classApplied || a.class || '—');
    frame.innerHTML = `
<h2 style="text-align:center;color:#4f46e5;margin:0 0 4px">St. Francis De Sales Secondary School</h2>
<h3 style="text-align:center;color:#64748b;margin:0 0 24px;font-weight:500">Admission Application Form</h3>

<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Student Information</h4>
<table style="width:100%;border-collapse:collapse;margin-top:6px">
  <tr><td class="pf-label">Full Name</td><td>${name}</td><td class="pf-label">Class Applied</td><td>${cls}</td></tr>
  <tr><td class="pf-label">Date of Birth</td><td>${esc(a.dob)}</td><td class="pf-label">Gender</td><td>${esc(a.gender)}</td></tr>
  <tr><td class="pf-label">Academic Year</td><td>${esc(a.year)}</td><td class="pf-label">Previous School</td><td>${esc(a.previousSchool)}</td></tr>
  <tr><td class="pf-label">Address</td><td colspan="3">${esc(a.address)}</td></tr>
  <tr><td class="pf-label">Medical / Special Needs</td><td colspan="3">${esc(a.medical) || '—'}</td></tr>
</table>

<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Primary Contact</h4>
<table style="width:100%;border-collapse:collapse;margin-top:6px">
  <tr><td class="pf-label">Name</td><td>${esc(a.parentName)}</td><td class="pf-label">Relation</td><td>${esc(a.relation)}</td></tr>
  <tr><td class="pf-label">Contact No.</td><td>${esc(a.contact)}</td><td class="pf-label">Email</td><td>${esc(a.email)}</td></tr>
</table>

<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Father's Details</h4>
<table style="width:100%;border-collapse:collapse;margin-top:6px">
  <tr><td class="pf-label">Name</td><td>${esc(f.name)}</td><td class="pf-label">Occupation</td><td>${esc(f.occupation)}</td></tr>
  <tr><td class="pf-label">Contact No.</td><td colspan="3">${esc(f.contact)}</td></tr>
</table>

<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Mother's Details</h4>
<table style="width:100%;border-collapse:collapse;margin-top:6px">
  <tr><td class="pf-label">Name</td><td>${esc(m.name)}</td><td class="pf-label">Occupation</td><td>${esc(m.occupation)}</td></tr>
  <tr><td class="pf-label">Contact No.</td><td colspan="3">${esc(m.contact)}</td></tr>
</table>

<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Submitted Documents</h4>
<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">${docsHtml}</ul>

<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Application Meta</h4>
<table style="width:100%;border-collapse:collapse;margin-top:6px">
  <tr><td class="pf-label">Status</td><td>${esc(a.status)}</td><td class="pf-label">Submitted On</td><td>${esc(date)}</td></tr>
</table>

<div style="margin-top:40px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px">
  St. Francis De Sales Secondary School · Laitkor, Shillong · Generated ${new Date().toLocaleString('en-IN')}
</div>`;
    document.body.classList.add('adm-printing');
    window.print();
    setTimeout(() => document.body.classList.remove('adm-printing'), 500);
  };

  // Office portal wrapper — uses currentAdmissionData
  window.printAdmissionForm = function() {
    if (!currentAdmissionData) { showToast('⚠️ No application selected.'); return; }
    window._printAdmissionPDF(currentAdmissionData);
  };

  // ── Forward to Admin ──────────────────────────────────────────
  window.forwardAdmissionToAdmin = async function() {
    if (!currentAdmissionId) { showToast('⚠️ No application selected.'); return; }
    const btn = document.getElementById('adm-forward-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Forwarding…'; }
    try {
      const notes = document.getElementById('adm-d-notes')?.value || '';
      await updateDoc(doc(db, 'admissions', currentAdmissionId), {
        status: 'forwarded_to_admin',
        officeNotes: notes,
        forwardedAt: serverTimestamp()
      });
      await addDoc(collection(db, 'admin_notifications'), {
        type: 'admission_forwarded',
        admissionId: currentAdmissionId,
        studentName: currentAdmissionData?.fullName || '',
        forwardedBy: window._officeStaffName || 'Office Staff',
        read: false,
        createdAt: new Date().toISOString()
      });
      showToast('✅ Application forwarded to Admin.');
      if (window.__admissionsCache?.[currentAdmissionId]) {
        window.__admissionsCache[currentAdmissionId].status = 'forwarded_to_admin';
      }
      if (btn) { btn.disabled = true; btn.innerHTML = '✓ Already Forwarded'; btn.style.opacity = '0.6'; }
      await window.loadOfficeAdmissions();
    } catch(e) {
      showToast('❌ Error: ' + e.message);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-share" style="margin-right:6px"></i>Forward to Admin'; }
    }
  };

  // Auto-load when navigating to admissions section
  console.log('[Admissions] ✅ Loaded — Office Staff admissions review module');
})();

// ================================================================
// BLOCK 8B — BULK FEE ENTRY
// ================================================================
(async () => {
  const clsLabel = c => ({ PLG:'Play Group', SKG:'SKG', LKG:'LKG' }[c] || (c ? 'Class ' + c : '—'));
  const fmtINR   = n => '₹' + (parseFloat(n)||0).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  window.loadBulkFeeClass = async function() {
    const cls  = document.getElementById('bulk-class-sel')?.value;
    if (!cls) { showToast('⚠️ Select a class first.'); return; }
    const wrap = document.getElementById('bulk-fee-table-wrap');
    const tbody = document.getElementById('bulk-fee-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
    if (wrap) wrap.style.display = 'block';
    try {
      const snap = await getDocs(query(
        collection(db, 'students'),
        where('class', '==', cls),
        limit(200)
      ));
      const students = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (parseInt(a.rollNo)||0) - (parseInt(b.rollNo)||0));
      if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-light)">No students found for this class.</td></tr>';
        return;
      }
      tbody.innerHTML = students.map(s => {
        const bal = parseFloat(s.feeBalance ?? s.feeTotal ?? 0);
        return `<tr>
          <td style="padding:7px 6px"><input type="checkbox" class="bulk-row-chk" data-sid="${s.id}" data-student='${JSON.stringify({id:s.id,studentId:s.studentId||'',name:s.name||'',class:s.class||'',rollNo:s.rollNo||'',feeBalance:bal,feeTotal:parseFloat(s.feeTotal||0)})}' onchange="document.getElementById('bulk-selected-count').textContent=document.querySelectorAll('.bulk-row-chk:checked').length+' selected'"></td>
          <td style="padding:7px 6px">${s.rollNo||'—'}</td>
          <td style="padding:7px 6px;font-weight:600">${s.name||'—'}</td>
          <td style="padding:7px 6px;color:${bal>0?'#dc2626':'#16a34a'}">${fmtINR(bal)}</td>
          <td style="padding:7px 6px"><input type="number" class="bulk-amt-input" data-sid="${s.id}" value="${bal>0?bal:''}" min="0" style="width:100px;padding:4px 8px;border:1.5px solid var(--primary);border-radius:6px;font-family:var(--font-body);font-size:13px"></td>
        </tr>`;
      }).join('');
      document.getElementById('bulk-selected-count').textContent = '0 selected';
      const selectAll = document.getElementById('bulk-select-all');
      if (selectAll) selectAll.checked = false;
    } catch(e) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:12px">${e.message}</td></tr>`;
    }
  };

  window.recordBulkFeePayments = async function() {
    const checked = [...document.querySelectorAll('.bulk-row-chk:checked')];
    if (!checked.length) { showToast('⚠️ Select at least one student.'); return; }
    const feeType = document.getElementById('bulk-fee-type')?.value || 'Annual Fee';
    const mode    = document.getElementById('bulk-mode')?.value    || 'Cash';
    const staffName = window._officeStaffName || 'Office Staff';
    let ok = 0, fail = 0;
    for (const chk of checked) {
      try {
        const s   = JSON.parse(chk.dataset.student);
        const amt = parseFloat(document.querySelector(`.bulk-amt-input[data-sid="${chk.dataset.sid}"]`)?.value || 0);
        if (!amt || amt <= 0) { fail++; continue; }
        const balAfter = Math.max(0, (s.feeBalance || 0) - amt);
        await addDoc(collection(db, 'fee_transactions'), {
          studentId:    s.studentId,
          studentName:  s.name,
          studentClass: s.class,
          feeType,
          amount:       amt,
          paymentMode:  mode,
          receiptNo:    '',
          date:         new Date().toISOString().slice(0, 10),
          status:       'approved',
          staffName,
          balanceBefore: s.feeBalance || 0,
          balanceAfter:  balAfter,
          feeTotal:      s.feeTotal   || 0,
          source:        'bulk-entry',
          createdAt:     serverTimestamp()
        });
        ok++;
      } catch(e) { fail++; console.warn('Bulk entry error:', e.message); }
    }
    showToast(ok ? `✅ ${ok} payment(s) recorded${fail ? ', ' + fail + ' failed' : ''}.` : '❌ All entries failed.');
    if (ok) window.loadBulkFeeClass();
  };
})();

// ================================================================
// BLOCK 9 — FEE LEDGER SUBMIT PAYMENT
// ================================================================
(async () => {
  // db, auth, and Firestore functions are available from module-level imports

  window.ledgerSubmitPayment = async function() {
    const s  = window._feeSelectedStudent;
    const fd = window._feeSelectedFeeData || {};
    if (!s) { showToast('⚠️ No student selected.'); return; }

    const amtRaw = parseFloat(document.getElementById('ldg-pay-amount')?.value || 0);
    if (!amtRaw || amtRaw <= 0) { showToast('⚠️ Enter a valid payment amount.'); return; }
    if (fd.feeBalance !== undefined && amtRaw > fd.feeBalance + 0.01) {
      showToast('⚠️ Amount exceeds remaining balance of ₹' + fd.feeBalance.toFixed(2)); return;
    }

    const txnNo   = document.getElementById('ldg-pay-txn')?.value.trim() || '';
    const remarks = document.getElementById('ldg-pay-remarks')?.value.trim() || '';
    const btn     = document.getElementById('ldg-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

    try {
      const staffEmail = auth.currentUser?.email || 'office';
      const today = new Date().toISOString().split('T')[0];

      // 1. Write transaction record (pending — Admin approves)
      await addDoc(collection(db, 'fee_transactions'), {
        studentId:   s.studentId || s._docId || '',
        studentName: s.name  || '—',
        class:       s.class || '—',
        amount:      amtRaw,
        txnNo:       txnNo,
        remarks:     remarks,
        paymentMode: 'Cash',
        date:        today,
        status:      'pending',
        recordedBy:  staffEmail,
        createdAt:   serverTimestamp()
      });

      // 2. Real-time update of HTML ledger numbers
      const newPaid    = (fd.feePaid    || 0) + amtRaw;
      const newBalance = Math.max(0, (fd.feeBalance || 0) - amtRaw);
      const newPct     = fd.feeTotal > 0 ? Math.min(100, Math.round((newPaid / fd.feeTotal) * 100)) : 0;

      const fmtINR = n => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

      set('ldg-paid',    fmtINR(newPaid));
      set('ldg-balance', fmtINR(newBalance));
      set('fee-paid-amt',    fmtINR(newPaid));
      set('fee-balance-amt', fmtINR(newBalance));
      set('fee-progress-pct', newPct + '%');
      const bar = document.getElementById('fee-progress-bar');
      if (bar) bar.style.width = newPct + '%';
      const bb = document.getElementById('fee-balance-block');
      if (bb) bb.classList.toggle('cleared', newBalance === 0 && fd.feeTotal > 0);

      // 3. Update cached fee data so subsequent submissions stay accurate
      window._feeSelectedFeeData = { ...fd, feePaid: newPaid, feeBalance: newBalance, pct: newPct };

      // 4. Clear form
      const clear = id => { const e = document.getElementById(id); if (e) e.value = ''; };
      clear('ldg-pay-amount'); clear('ldg-pay-txn'); clear('ldg-pay-remarks');

      showToast('✅ Payment of ' + fmtINR(amtRaw) + ' recorded — pending Admin approval.');
    } catch(e) {
      showToast('❌ Error: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save" style="margin-right:6px"></i>Submit Payment';
      }
    }
  };

  console.log('[FeeledgerSubmit] ✅ Loaded');
})();

// ================================================================
// BLOCK 10 — HOMEPAGE DYNAMIC FETCH + DUES & REMINDERS
// ================================================================
(async () => {
  // db, doc, getDoc are available from module-level imports

  const esc = v => (v == null ? '' : String(v).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])));

  // ── Hero ──────────────────────────────────────────────────────
  function applyHero(hero = {}) {
    if (hero.headline) {
      const h = document.getElementById('home-hero-headline');
      if (h) h.textContent = hero.headline;
    }
    if (hero.subheadline) {
      const s = document.getElementById('home-hero-sub');
      if (s) s.textContent = hero.subheadline;
    }
  }

  // ── Announcement ──────────────────────────────────────────────
  function applyAnnouncement(ann = {}) {
    const card = document.getElementById('home-featured-announcement');
    if (!card) return;
    const text = (ann.text || '').trim();
    if (!text) { card.style.display = 'none'; return; }
    const tagEl  = document.querySelector('#home-ann-tag span');
    const txtEl  = document.getElementById('home-ann-text');
    const dateEl = document.getElementById('home-ann-date');
    if (tagEl)  tagEl.textContent  = (ann.tag || 'NEW').toUpperCase();
    if (txtEl)  txtEl.textContent  = text;
    if (dateEl && ann.date) {
      try {
        dateEl.textContent = new Date(ann.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      } catch(e) { dateEl.textContent = ann.date; }
    } else if (dateEl) {
      dateEl.textContent = '';
    }
    card.style.display = 'block';
  }

  // ── Stats (count-up on scroll into view) ──────────────────────
  function animateCountTo(el, target, suffix = '') {
    if (!el) return;
    const n = Number(target) || 0;
    if (n <= 0) { el.textContent = String(target); return; }
    el.classList.add('counting');
    const duration = 1400;
    const start = performance.now();
    const from = 0;
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const current = Math.round(from + (n - from) * eased);
      el.textContent = current + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.classList.remove('counting');
    }
    requestAnimationFrame(tick);
  }

  function applyStats(stats = []) {
    for (let i = 0; i < 4; i++) {
      const s = stats[i] || {};
      const numEl = document.getElementById(`home-stat-${i + 1}`);
      const lblEl = document.getElementById(`home-stat-${i + 1}-label`);
      if (lblEl && s.label) lblEl.textContent = s.label;
      if (numEl && Number.isFinite(Number(s.value)) && Number(s.value) > 0) {
        numEl.dataset.target = String(s.value);
        numEl.textContent = '0';
      }
    }
    // Lazy count-up via IntersectionObserver
    const bar = document.getElementById('home-stats-bar');
    if (!bar) return;
    if (!('IntersectionObserver' in window)) {
      // Fallback: fire immediately
      bar.querySelectorAll('.stat-num[data-target]').forEach(el => animateCountTo(el, el.dataset.target, '+'));
      return;
    }
    const obs = new IntersectionObserver((entries, o) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          bar.querySelectorAll('.stat-num[data-target]').forEach(el => {
            if (!el.dataset.animated) {
              el.dataset.animated = '1';
              animateCountTo(el, el.dataset.target, '+');
            }
          });
          o.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    obs.observe(bar);
  }

  // ── Feature Cards ─────────────────────────────────────────────
  function applyFeatureCards(cards = []) {
    const container = document.getElementById('home-feature-cards');
    const legacy    = document.getElementById('why-choose-us-grid');
    if (!container) return;
    if (!Array.isArray(cards) || !cards.length) {
      container.style.display = 'none';
      return;
    }
    container.innerHTML = cards.map(c => `
      <div class="feature-card">
        <div class="feature-card-icon"><i class="fas ${esc(c.icon || 'fa-star')}"></i></div>
        <h3 class="feature-card-title">${esc(c.title || '')}</h3>
        <p class="feature-card-desc">${esc(c.description || '')}</p>
      </div>
    `).join('');
    container.style.display = 'grid';
    // CMS cards take precedence over the legacy why-choose-us collection
    if (legacy) legacy.style.display = 'none';
  }

  // ── Boot ──────────────────────────────────────────────────────
  async function loadHomepageDynamic() {
    try {
      const snap = await getDoc(doc(db, 'public_settings', 'homepage'));
      const data = snap.exists() ? snap.data() : {};
      applyHero(data.hero || {});
      applyAnnouncement(data.announcement || {});
      applyStats(Array.isArray(data.stats) ? data.stats : []);
      applyFeatureCards(Array.isArray(data.featureCards) ? data.featureCards : []);
      console.log('[HomepageCMS] ✅ Loaded');
    } catch(e) {
      console.warn('[HomepageCMS] load failed:', e.message);
      // Even if Firestore fails, animate the static fallback stats so the page still feels alive
      applyStats([]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadHomepageDynamic);
  } else {
    loadHomepageDynamic();
  }

  // Expose for manual refresh after admin saves
  window.refreshHomepageDynamic = loadHomepageDynamic;
})();

// ============================================================
// DUES & REMINDERS — Office Portal
// ============================================================
window.loadDuesList = async function() {
  const tbody     = document.getElementById('dues-table-body');
  const chipsEl   = document.getElementById('dues-summary-chips');
  const countLabel= document.getElementById('dues-count-label');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-light);"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>`;
  if (chipsEl)    chipsEl.innerHTML   = '';
  if (countLabel) countLabel.textContent = '';

  try {
    const { getFirestore, collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    const db2 = getFirestore();

    const filterClass  = document.getElementById('dues-filter-class')?.value  || '';
    const filterType   = document.getElementById('dues-filter-type')?.value   || '';
    const filterStatus = document.getElementById('dues-filter-status')?.value || '';

    const snap = await getDocs(query(collection(db2, 'fee_transactions'), where('status', '==', 'pending')));

    let records = [];
    snap.forEach(doc => {
      const d = { id: doc.id, ...doc.data() };
      const cls = d.studentClass || d.class || '';
      if (filterClass  && cls         !== filterClass)  return;
      if (filterType   && d.feeType   !== filterType)   return;
      if (filterStatus && d.status    !== filterStatus) return;
      records.push({ ...d, _cls: cls });
    });

    // Batch-fetch WhatsApp numbers from students collection
    const uniqueIds = [...new Set(records.map(r => r.studentId).filter(Boolean))];
    const waMap = {};
    for (let i = 0; i < uniqueIds.length; i += 30) {
      const batch = uniqueIds.slice(i, i + 30);
      const sSnap = await getDocs(query(collection(db2, 'students'), where('studentId', 'in', batch)));
      sSnap.forEach(d => { const s = d.data(); if (s.studentId) waMap[s.studentId] = s.whatsapp || ''; });
    }

    const totalDue = records.reduce((s, r) => s + (r.amount || 0), 0);
    if (chipsEl) chipsEl.innerHTML = `
      <span style="background:#fff3cd;color:#856404;border:1px solid #ffc107;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;">
        <i class="fas fa-users"></i> ${records.length} Pending Transactions
      </span>
      <span style="background:#f8d7da;color:#721c24;border:1px solid #dc3545;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;">
        <i class="fas fa-rupee-sign"></i> ₹${totalDue.toLocaleString('en-IN')} Total Pending
      </span>`;

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:32px;color:#28a745;font-weight:600;"><i class="fas fa-check-circle"></i> No pending dues found — all clear!</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(r => {
      const reminded = r.lastRemindedDate ? new Date(r.lastRemindedDate).toLocaleDateString('en-IN') : '—';
      const badge    = `<span class="badge badge-warning">Pending</span>`;
      const waNum    = (waMap[r.studentId] || '').replace(/\D/g, '');
      const waMsg    = encodeURIComponent(
        `Dear Parent of ${r.studentName || r.studentId},\nThis is a reminder from St. Francis De Sales Sec. School, Laitkor.\nYour fee payment of ₹${(r.amount||0).toLocaleString('en-IN')} is awaiting approval.\nKindly contact the school office.\nThank you.`
      );
      const waBtn = waNum
        ? `<a href="https://wa.me/91${waNum}?text=${waMsg}" target="_blank" class="btn btn-success btn-sm" onclick="window.markReminded('${r.id}')"><i class="fab fa-whatsapp"></i> Remind</a>`
        : `<span style="font-size:12px;color:var(--text-light);">No WhatsApp</span>`;
      return `<tr>
        <td><strong>${r.studentName || r.studentId || '—'}</strong><br><span style="font-size:11px;color:var(--text-light);">${r.studentId || ''}</span></td>
        <td>${r._cls || '—'}</td>
        <td>${r.feeType || r.notes || '—'}</td>
        <td style="font-weight:700;color:#dc3545;">₹${(r.amount||0).toLocaleString('en-IN')}</td>
        <td>${badge}</td>
        <td style="font-size:12px;">${reminded}</td>
        <td>${waBtn}</td>
      </tr>`;
    }).join('');

    if (countLabel) countLabel.textContent = `Showing ${records.length} record(s)`;

  } catch(err) {
    console.error('Dues load error:', err);
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:#dc3545;">Error loading dues: ${err.message}</td></tr>`;
  }
};

window.markReminded = async function(docId) {
  try {
    const { getFirestore, doc, updateDoc } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    await updateDoc(doc(getFirestore(), 'fee_transactions', docId), {
      lastRemindedDate: new Date().toISOString().split('T')[0]
    });
  } catch(e) { console.warn('markReminded:', e.message); }
};
// ============================================================
// END DUES & REMINDERS

// ============================================================
// STUDENT RECORDS MODULE
// ============================================================
(async () => {

  let _srAllRecords   = [];
  let _srFiltered     = [];
  let _srPage         = 1;
  const _srPageSize   = 25;
  let _srSortKey      = 'class';
  let _srSortDir      = 1;

  const CLASS_ORDER = ['PLG','SKG','LKG','1','2','3','4','5','6','7','8','9','10'];
  const CLASS_LABEL = { PLG: 'Play Group', SKG: 'SKG', LKG: 'LKG' };
  const getLabel    = c => CLASS_LABEL[c] || (c ? 'Class ' + c : '—');

  function calcAge(dob) {
    if (!dob) return '—';
    const d = new Date(dob);
    if (isNaN(d)) return '—';
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    if (today < new Date(today.getFullYear(), d.getMonth(), d.getDate())) age--;
    return age;
  }

  window.loadStudentRecords = async function(showSyncMsg = false) {
    const db = window._firestoreDb;
    if (!db) return;

    const tbody = document.getElementById('sr-tbody');
    const cards = document.getElementById('sr-cards');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading records…</td></tr>`;
    if (cards) cards.innerHTML = `<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading…</div>`;

    const syncBtn = document.getElementById('sr-sync-btn');
    if (syncBtn) { syncBtn.disabled = true; syncBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing…'; }

    try {
      const { getDocs, collection, orderBy, query } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
      const snap = await getDocs(query(collection(db, 'students'), orderBy('class')));

      _srAllRecords = snap.docs.map(d => {
        const s = d.data();
        return {
          _docId:    d.id,
          studentId: s.studentId || '—',
          name:      s.name || s.fullName || '—',
          class:     s.class || '?',
          section:   s.section || '—',
          rollNo:    s.rollNo || '—',
          gender:    s.gender || '—',
          dob:       s.dob || '',
          age:       calcAge(s.dob),
        };
      });

      const classSelect = document.getElementById('sr-filter-class');
      if (classSelect) {
        const presentClasses = [...new Set(_srAllRecords.map(r => r.class))];
        const sorted = CLASS_ORDER.filter(c => presentClasses.includes(c));
        classSelect.innerHTML = `<option value="">All Classes</option>` +
          sorted.map(c => `<option value="${c}">${getLabel(c)}</option>`).join('');
      }

      const total    = _srAllRecords.length;
      const boys     = _srAllRecords.filter(r => r.gender === 'M').length;
      const girls    = _srAllRecords.filter(r => r.gender === 'F').length;
      const clsCount = new Set(_srAllRecords.map(r => r.class)).size;
      const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      set('sr-total',   total);
      set('sr-boys',    boys);
      set('sr-girls',   girls);
      set('sr-classes', clsCount);

      const now = new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
      const syncEl = document.getElementById('sr-last-synced');
      if (syncEl) syncEl.textContent = `Last synced: ${now}`;

      if (showSyncMsg) window.showToast?.('✅ Student records synced!');

      _srPage = 1;
      window.srFilter();

    } catch (err) {
      console.error('Student Records load error:', err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:24px">❌ Failed to load: ${err.message}</td></tr>`;
      if (cards) cards.innerHTML = `<div style="color:var(--danger);text-align:center;padding:24px">❌ ${err.message}</div>`;
    } finally {
      if (syncBtn) { syncBtn.disabled = false; syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync Now'; }
    }
  };

  window.srFilter = function() {
    const q      = (document.getElementById('sr-search')?.value || '').toLowerCase();
    const cls    = document.getElementById('sr-filter-class')?.value || '';
    const gender = document.getElementById('sr-filter-gender')?.value || '';

    _srFiltered = _srAllRecords.filter(r => {
      const matchQ = !q || r.name.toLowerCase().includes(q) || r.studentId.toLowerCase().includes(q);
      const matchC = !cls    || r.class  === cls;
      const matchG = !gender || r.gender === gender;
      return matchQ && matchC && matchG;
    });

    _srFiltered.sort((a, b) => {
      let av = a[_srSortKey] || '', bv = b[_srSortKey] || '';
      if (_srSortKey === 'class') {
        av = CLASS_ORDER.indexOf(av); bv = CLASS_ORDER.indexOf(bv);
      } else if (_srSortKey === 'rollNo') {
        av = parseInt(av) || 0; bv = parseInt(bv) || 0;
      } else {
        av = av.toString().toLowerCase(); bv = bv.toString().toLowerCase();
      }
      return av < bv ? -_srSortDir : av > bv ? _srSortDir : 0;
    });

    _srPage = 1;
    srRender();
  };

  window.srSort = function(key) {
    _srSortDir = _srSortKey === key ? -_srSortDir : 1;
    _srSortKey = key;
    window.srFilter();
  };

  function srRender() {
    const total    = _srFiltered.length;
    const pages    = Math.max(1, Math.ceil(total / _srPageSize));
    if (_srPage > pages) _srPage = pages;
    const start    = (_srPage - 1) * _srPageSize;
    const pageData = _srFiltered.slice(start, start + _srPageSize);

    const countEl = document.getElementById('sr-count-label');
    if (countEl) countEl.textContent = `Showing ${pageData.length} of ${total} student${total !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('sr-tbody');
    if (tbody) {
      if (pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-light)"><i class="fas fa-inbox" style="font-size:28px;display:block;margin-bottom:8px"></i>No students found.</td></tr>`;
      } else {
        tbody.innerHTML = pageData.map(r => `
          <tr>
            <td><code style="font-size:12px">${r.studentId}</code></td>
            <td><strong>${r.name}</strong></td>
            <td>${getLabel(r.class)}</td>
            <td>${r.section}</td>
            <td>${r.rollNo}</td>
            <td><span class="badge ${r.gender === 'M' ? 'badge-info' : 'badge-success'}">${r.gender === 'M' ? 'Boy' : r.gender === 'F' ? 'Girl' : '—'}</span></td>
            <td style="font-size:12px">${r.dob || '—'}</td>
            <td>${r.age}</td>
          </tr>`).join('');
      }
    }

    const cards = document.getElementById('sr-cards');
    if (cards) {
      if (pageData.length === 0) {
        cards.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-light)">No students found.</div>`;
      } else {
        cards.innerHTML = pageData.map(r => `
          <div class="sr-student-card">
            <div class="sr-card-top">
              <strong>${r.name}</strong>
              <span class="badge ${r.gender === 'M' ? 'badge-info' : 'badge-success'}">${r.gender === 'M' ? 'Boy' : 'Girl'}</span>
            </div>
            <div class="sr-card-row"><label>ID</label><span><code>${r.studentId}</code></span></div>
            <div class="sr-card-row"><label>Class</label><span>${getLabel(r.class)} — ${r.section}</span></div>
            <div class="sr-card-row"><label>Roll No</label><span>${r.rollNo}</span></div>
            <div class="sr-card-row"><label>DOB</label><span>${r.dob || '—'}</span></div>
            <div class="sr-card-row"><label>Age</label><span>${r.age}</span></div>
          </div>`).join('');
      }
    }

    const pg = document.getElementById('sr-pagination');
    if (pg) {
      if (pages <= 1) { pg.innerHTML = ''; return; }
      let btns = '';
      btns += `<button ${_srPage===1?'disabled':''} onclick="window._srGoPage(${_srPage-1})"><i class="fas fa-chevron-left"></i></button>`;
      for (let i = 1; i <= pages; i++) {
        if (i === 1 || i === pages || Math.abs(i - _srPage) <= 1) {
          btns += `<button class="${i===_srPage?'active':''}" onclick="window._srGoPage(${i})">${i}</button>`;
        } else if (Math.abs(i - _srPage) === 2) {
          btns += `<span>…</span>`;
        }
      }
      btns += `<button ${_srPage===pages?'disabled':''} onclick="window._srGoPage(${_srPage+1})"><i class="fas fa-chevron-right"></i></button>`;
      pg.innerHTML = btns;
    }
  }

  window._srGoPage = function(p) { _srPage = p; srRender(); };

  window.srExport = function(format) {
    const data = _srFiltered.length ? _srFiltered : _srAllRecords;
    if (!data.length) { window.showToast?.('⚠️ No data to export.'); return; }

    const rows = data.map(r => ({
      'Student ID':  r.studentId,
      'Full Name':   r.name,
      'Class':       getLabel(r.class),
      'Section':     r.section,
      'Roll No':     r.rollNo,
      'Gender':      r.gender === 'M' ? 'Male' : r.gender === 'F' ? 'Female' : r.gender,
      'DOB':         r.dob || '—',
      'Age':         r.age,
    }));

    if (format === 'csv') {
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(','), ...rows.map(r => headers.map(h => `"${r[h]}"`).join(','))].join('\n');
      srDownload('student-records.csv', 'text/csv', csv);
    } else if (format === 'json') {
      srDownload('student-records.json', 'application/json', JSON.stringify(data, null, 2));
    } else if (format === 'xlsx') {
      if (!window.XLSX) { window.showToast?.('❌ Excel library not loaded.'); return; }
      const ws = window.XLSX.utils.json_to_sheet(rows);
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, 'Students');
      window.XLSX.writeFile(wb, 'student-records.xlsx');
    } else if (format === 'pdf') {
      if (!window.jspdf?.jsPDF) { window.showToast?.('❌ PDF library not loaded.'); return; }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.setFontSize(14);
      doc.text('St. Francis De Sales Sec. School — Student Records', 14, 15);
      doc.setFontSize(9);
      doc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}  |  Total: ${data.length}`, 14, 22);
      doc.autoTable({
        startY: 28,
        head: [Object.keys(rows[0])],
        body: rows.map(r => Object.values(r)),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [44, 62, 80] },
        alternateRowStyles: { fillColor: [245, 245, 245] },
      });
      doc.save('student-records.pdf');
    }
  };

  function srDownload(filename, type, content) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

})();
// ============================================================
// END STUDENT RECORDS MODULE
// ============================================================

// ============================================================
// TEACHER ASSIGNMENT MODULE  (Phase 1)
// ============================================================

const TA_CLASS_MAP   = { 'I':1,'II':2,'III':3,'IV':4,'V':5,'VI':6,'VII':7,'VIII':8,'IX':9,'X':10 };
const TA_CLASS_NAMES = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
const TA_CLASS_NUMS  = [1,2,3,4,5,6,7,8,9,10];

// Valid classes per subject key (for multi-class helper)
const TA_SUBJECT_CLASSES = {
  mathematics:       [1,2,3,4,5,6,7,8,9,10],
  science:           [1,2,3,4,5,6,7,8],
  english_i:         [1,2,3,4,5,6,7,8,9,10],
  english_ii:        [1,2,3,4,5,6,7,8,9,10],
  khasi_alt_english: [1,2,3,4,5,6,7,8,9,10],
  hindi:             [1,2,3,4,5,6],
  spelling:          [1,2,3,4,5],
  computer:          [4,5,6,7,8],
  social_studies:    [3,4,5],
  geography:         [6,7,8,9,10],
  civics:            [6,7,8,9,10],
  history:           [6,7,8,9,10],
  health_education:  [6],
  h_education:       [7,8,9,10],
  physics:           [9,10],
  chemistry:         [9,10],
  biology:           [9,10],
  economics:         [9,10]
};

let _taCurrentUid  = null;
let _taCurrentData = null;
let _taAssignments = [];

// ── Teacher list ────────────────────────────────────────────

window.loadTeacherAssignList = async function() {
  const listEl = document.getElementById('ta-teacher-list');
  if (!listEl) return;
  listEl.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
  try {
    const snap = await getDocs(collection(db, 'teachers'));
    window._taAllTeachers = [];
    snap.forEach(d => window._taAllTeachers.push({ uid: d.id, ...d.data() }));
    renderTAList(window._taAllTeachers);
  } catch(e) {
    listEl.innerHTML = `<p style="color:var(--danger);padding:16px">Error: ${e.message}</p>`;
  }
};

function renderTAList(teachers) {
  const listEl = document.getElementById('ta-teacher-list');
  if (!teachers.length) {
    listEl.innerHTML = '<p style="color:var(--text-light);padding:16px;text-align:center">No teachers found.</p>';
    return;
  }
  listEl.innerHTML = teachers.map(t => {
    const badge = taBadge(t.role);
    const ctOf  = t.classTeacherOf ? `Class Teacher of: <strong>${t.classTeacherOf}</strong> &nbsp;·&nbsp; ` : '';
    const subs  = taSubjectSummary(t.assignments || []);
    const ini   = t.routineInitials || t.initials || '';
    const sid   = t.teacherId || t.staffId || '';
    const iniChip = ini ? `<span style="background:#e0e7ff;color:#1a4a8a;border:1px solid #c7d2fe;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;letter-spacing:0.5px;margin-left:6px" title="Routine Initials">${taEsc(ini)}</span>` : '';
    const sidChip = sid ? `<span style="color:var(--text-light);font-size:12px;margin-left:6px">· ${taEsc(sid)}</span>` : '';
    const ptChip = t.isPartTime ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600;margin-left:6px">Part-time</span>` : '';
    return `<div class="admin-ta-card">
      <div class="admin-ta-card-info">
        <div class="admin-ta-card-name">
          <i class="fas fa-user-circle" style="color:var(--accent);font-size:18px"></i>
          ${taEsc(t.name || 'Unnamed')}${iniChip}${sidChip}${ptChip} ${badge}
        </div>
        <div class="admin-ta-card-meta">${ctOf}${taEsc(t.email || '')}</div>
        ${subs ? `<div class="admin-ta-card-subjects"><i class="fas fa-book" style="margin-right:4px;color:var(--accent)"></i>${subs}</div>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${!t.role ? `<button onclick="deleteTARecord('${t.uid}','${taEsc(t.name||'Unnamed')}')" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-trash"></i></button>` : ''}
        <button class="admin-ta-assign-btn" onclick="openTAPanel('${t.uid}')">
          <i class="fas fa-pen"></i> Assign →
        </button>
      </div>
    </div>`;
  }).join('');
}

window.deleteTARecord = async function(uid, name) {
  if (!confirm(`Delete "${name}" from the assignments list? This only removes the unassigned duplicate record.`)) return;
  try {
    await deleteDoc(doc(db, 'teachers', uid));
    showToast(`🗑️ Deleted duplicate record for ${name}`);
    loadTeacherAssignList();
  } catch(e) { showToast('❌ ' + e.message); }
};

// ──────────────────────────────────────────────────────────────────
// TEACHER DIRECTORY SYNC — one-shot reconciliation tool.
// Source of truth: SFS Teacher Directory (24 entries).
// Goal: exactly one doc per teacher, keyed by initials, with all fields.
// ──────────────────────────────────────────────────────────────────
const SFS_TEACHER_DIRECTORY = [
  { initials:'ELN',  fullName:'Emilia Lyngdoh Nongbri',           staffId:'SFST001', isPartTime:false },
  { initials:'AN',   fullName:'Asha Mary Nongkhlaw',              staffId:'SFST002', isPartTime:false },
  { initials:'ARLN', fullName:'Andrea Rafelline Lyngdoh Nongbri', staffId:'SFST003', isPartTime:false },
  { initials:'QM',   fullName:'Queency Mary Mawrie',              staffId:'SFST004', isPartTime:false },
  { initials:'FS',   fullName:'Felicia Synjri',                   staffId:'SFST005', isPartTime:false },
  { initials:'IM',   fullName:'Idahun Mawrie',                    staffId:'SFST006', isPartTime:false },
  { initials:'MP',   fullName:'Michael Pamthet',                  staffId:'SFST007', isPartTime:false },
  { initials:'DP',   fullName:'Dilang Pohshna',                   staffId:'SFST008', isPartTime:false },
  { initials:'PK',   fullName:'Phisabet Kharumnuid',              staffId:'SFST009', isPartTime:false },
  { initials:'MBK',  fullName:'Mary Banri Kharsyntiew',           staffId:'SFST010', isPartTime:false },
  { initials:'DS',   fullName:'Dariker Songthiang',               staffId:'SFST011', isPartTime:false },
  { initials:'DN',   fullName:'Darisha Nongrum',                  staffId:'SFST012', isPartTime:false },
  { initials:'ID',   fullName:'Ittrila Dkhar',                    staffId:'SFST013', isPartTime:false },
  { initials:'YL',   fullName:'Youlinda Lyngdoh',                 staffId:'SFST014', isPartTime:false },
  { initials:'IOH',  fullName:'Iohhunlang Nongkhlaw',             staffId:'SFST015', isPartTime:false },
  { initials:'DOL',  fullName:'Dolly Nongsiej',                   staffId:'SFST016', isPartTime:false },
  { initials:'MJ',   fullName:'Merilin Jyndiang',                 staffId:'SFST018', isPartTime:false },
  { initials:'NS',   fullName:'Niwanki Shylla',                   staffId:'SFST019', isPartTime:false },
  { initials:'VMK',  fullName:'Vanessa Mary Kharkongor',          staffId:'SFST020', isPartTime:false },
  { initials:'AKK',  fullName:'Audilia Kharkongor',               staffId:'SFST021', isPartTime:false },
  { initials:'AM',   fullName:'Aidahunshisha Mawrie',             staffId:'SFST022', isPartTime:false },
  { initials:'BK',   fullName:'Babit Kharsahnoh',                 staffId:'SFST025', isPartTime:false },
  { initials:'DM',   fullName:'Daprikmen Massar',                 staffId:'',         isPartTime:true  },
  { initials:'AP',   fullName:'Anando Pohtam',                    staffId:'',         isPartTime:true  }
];

function _normName(s) { return (s||'').toString().toLowerCase().replace(/\s+/g,' ').trim(); }

window.planSyncDirectory = async function() {
  const snap = await getDocs(collection(db, 'teachers'));
  const docs = snap.docs.map(d => ({ docId: d.id, ...d.data() }));
  const plan = { update: [], merge: [], create: [], orphans: [] };
  const usedDocIds = new Set();

  for (const dir of SFS_TEACHER_DIRECTORY) {
    const primary = docs.find(d => d.docId === dir.initials);
    const dirNameKey = _normName(dir.fullName);
    const dirIni = (dir.initials || '').toUpperCase();
    const secondaries = docs.filter(d =>
      d.docId !== dir.initials && (
        (d.name && _normName(d.name) === dirNameKey) ||
        (d.fullName && _normName(d.fullName) === dirNameKey) ||
        (d.displayName && _normName(d.displayName) === dirNameKey) ||
        (dir.staffId && d.teacherId && d.teacherId.toUpperCase() === dir.staffId.toUpperCase()) ||
        (dir.staffId && d.staffId && d.staffId.toUpperCase() === dir.staffId.toUpperCase()) ||
        (dirIni && d.initials && d.initials.toUpperCase() === dirIni) ||
        (dirIni && d.routineInitials && d.routineInitials.toUpperCase() === dirIni)
      )
    );

    if (primary && secondaries.length === 0) {
      plan.update.push({ dir, primary });
      usedDocIds.add(primary.docId);
    } else if (primary || secondaries.length > 0) {
      plan.merge.push({ dir, primary, secondaries });
      if (primary) usedDocIds.add(primary.docId);
      secondaries.forEach(s => usedDocIds.add(s.docId));
    } else {
      plan.create.push({ dir });
    }
  }

  plan.orphans = docs.filter(d => !usedDocIds.has(d.docId));
  return plan;
};

window._syncDirPlan = null;

window.openSyncDirectoryPanel = async function() {
  document.getElementById('sync-dir-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  const body = document.getElementById('sync-dir-body');
  const summary = document.getElementById('sync-dir-summary');
  const applyBtn = document.getElementById('sync-dir-apply-btn');
  body.innerHTML = `<p style="text-align:center;color:var(--text-light);padding:32px"><i class="fas fa-spinner fa-spin"></i> Analyzing teacher records…</p>`;
  applyBtn.disabled = true; applyBtn.style.opacity = '0.5';
  try {
    const plan = await window.planSyncDirectory();
    window._syncDirPlan = plan;
    renderSyncDirPreview(plan);
    const total = plan.update.length + plan.merge.length + plan.create.length;
    summary.innerHTML = `<strong>${total}</strong> directory entries will be processed · <strong>${plan.merge.length}</strong> duplicates will be consolidated · <strong>${plan.orphans.length}</strong> orphans for your review`;
    applyBtn.disabled = false; applyBtn.style.opacity = '1';
  } catch (e) {
    body.innerHTML = `<p style="color:var(--danger);padding:24px">❌ ${e.message}</p>`;
    console.error(e);
  }
};

window.closeSyncDirectoryPanel = function() {
  document.getElementById('sync-dir-overlay').style.display = 'none';
  document.body.style.overflow = '';
  window._syncDirPlan = null;
};

function _syncEsc(s) {
  return (s||'').toString().replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function renderSyncDirPreview(plan) {
  const body = document.getElementById('sync-dir-body');
  const sec = (title, color, items, render) => items.length === 0 ? '' : `
    <div style="margin-bottom:22px">
      <h5 style="color:${color};margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700">${title} <span style="background:${color};color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;margin-left:6px">${items.length}</span></h5>
      <div style="border:1px solid #eee;border-radius:10px;overflow:hidden">${items.map(render).join('')}</div>
    </div>`;

  const rowStyle = 'padding:10px 14px;border-bottom:1px solid #f3f3f3;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px';
  const updateRow = (it) => `<div style="${rowStyle}">
    <div><strong>${_syncEsc(it.dir.fullName)}</strong> <span style="color:var(--text-light)">· ${it.dir.initials} · ${it.dir.staffId || '<em>no staff ID</em>'}</span></div>
    <span style="color:#5a8a5a;font-size:12px"><i class="fas fa-edit"></i> enrich</span>
  </div>`;
  const mergeRow = (it) => `<div style="${rowStyle}">
    <div>
      <strong>${_syncEsc(it.dir.fullName)}</strong> <span style="color:var(--text-light)">· ${it.dir.initials} · ${it.dir.staffId || '<em>no staff ID</em>'}</span>
      <div style="font-size:11px;color:var(--text-light);margin-top:2px">Consolidating: ${it.primary ? 'initials doc' : ''}${it.primary && it.secondaries.length ? ' + ' : ''}${it.secondaries.length ? it.secondaries.length + ' duplicate doc' + (it.secondaries.length>1?'s':'') : ''}</div>
    </div>
    <span style="color:#b45309;font-size:12px"><i class="fas fa-compress-arrows-alt"></i> merge</span>
  </div>`;
  const createRow = (it) => `<div style="${rowStyle}">
    <div><strong>${_syncEsc(it.dir.fullName)}</strong> <span style="color:var(--text-light)">· ${it.dir.initials} · ${it.dir.staffId || '<em>no staff ID</em>'}</span></div>
    <span style="color:#1a6b3c;font-size:12px"><i class="fas fa-plus-circle"></i> create</span>
  </div>`;
  const orphanRow = (d) => {
    const name = d.name || d.fullName || '(no name)';
    const hint = d.role ? `<span style="color:#1a4a8a">role: ${_syncEsc(d.role)}</span>` :
                 d.email ? `<span style="color:var(--text-light)">${_syncEsc(d.email)}</span>` :
                 `<span style="color:#dc2626">unnamed stub</span>`;
    return `<div style="${rowStyle}">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1">
        <input type="checkbox" class="sync-orphan-delete" data-doc-id="${_syncEsc(d.docId)}" style="width:16px;height:16px;cursor:pointer">
        <div>
          <strong>${_syncEsc(name)}</strong> <span style="color:var(--text-light)">· doc: <code>${_syncEsc(d.docId)}</code></span>
          <div style="font-size:11px;margin-top:2px">${hint}</div>
        </div>
      </label>
      <span style="color:#dc2626;font-size:12px">tick to delete</span>
    </div>`;
  };

  let html = '';
  html += sec('Will Update (existing record + enrich)', '#5a8a5a', plan.update, updateRow);
  html += sec('Will Merge & Deduplicate', '#b45309', plan.merge, mergeRow);
  html += sec('Will Create (new record)', '#1a6b3c', plan.create, createRow);
  html += sec('Orphans — review before deleting', '#dc2626', plan.orphans, orphanRow);
  if (plan.orphans.length > 0) {
    html += `<p style="font-size:12px;color:var(--text-light);background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-top:8px"><i class="fas fa-info-circle" style="color:#b45309"></i> Tick only the orphans you want to <strong>delete</strong>. Unticked orphans (e.g., office staff like Ibankyntiew Mawrie) are left untouched.</p>`;
  }
  if (!html) html = `<p style="text-align:center;color:var(--text-light);padding:24px">Nothing to do — directory is fully in sync.</p>`;
  body.innerHTML = html;
}

window.applySyncDirectory = async function() {
  const plan = window._syncDirPlan;
  if (!plan) { showToast('⚠️ No plan loaded. Re-open the preview.'); return; }

  const orphanIds = Array.from(document.querySelectorAll('.sync-orphan-delete:checked'))
    .map(el => el.dataset.docId);

  const total = plan.update.length + plan.merge.length + plan.create.length;
  const dupesToDelete = plan.merge.reduce((n,it) => n + it.secondaries.filter(s => s.docId !== it.dir.initials).length, 0);
  const totalDeletes = dupesToDelete + orphanIds.length;
  const msg = `This will write ${total} teacher records and delete ${totalDeletes} doc(s) (${dupesToDelete} duplicate(s) + ${orphanIds.length} orphan(s)).\n\nThis cannot be undone. Continue?`;
  if (!confirm(msg)) return;

  const applyBtn = document.getElementById('sync-dir-apply-btn');
  applyBtn.disabled = true; applyBtn.style.opacity = '0.6';
  applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Writing…';

  const stats = { updated: 0, merged: 0, created: 0, deleted: 0 };
  try {
    const batch = writeBatch(db);
    const ts = new Date().toISOString();

    // 1. UPDATE — enrich existing initials-keyed docs (merge: true preserves untouched fields)
    for (const it of plan.update) {
      batch.set(doc(db, 'teachers', it.dir.initials), {
        name:            it.dir.fullName,
        fullName:        it.dir.fullName,
        initials:        it.dir.initials,
        routineInitials: it.dir.initials,
        teacherId:       it.dir.staffId || '',
        staffId:         it.dir.staffId || '',
        isPartTime:      !!it.dir.isPartTime,
        updatedAt:       ts
      }, { merge: true });
      stats.updated++;
    }

    // 2. MERGE — consolidate primary + secondaries into one initials-keyed doc
    const ROLE_RANK = { class_teacher: 3, admin: 2, subject_teacher: 1 };
    const _rank = r => ROLE_RANK[r] || 0;
    const classesToUpdate = []; // {classKey, oldId, newId: it.dir.initials, name}

    for (const it of plan.merge) {
      const merged = {};
      if (it.primary) Object.assign(merged, it.primary);
      for (const s of it.secondaries) Object.assign(merged, s);
      delete merged.docId;

      // Role priority: keep the most senior role across all sources, not "whichever came last"
      let bestRole = it.primary?.role || null;
      let bestClassTeacherOf = it.primary?.classTeacherOf || null;
      let bestClassTeacher   = it.primary?.classTeacher   || null;
      const allAssignments   = it.primary?.assignments ? [...it.primary.assignments] : [];
      for (const s of it.secondaries) {
        if (_rank(s.role) > _rank(bestRole)) bestRole = s.role;
        if (s.classTeacherOf && !bestClassTeacherOf) bestClassTeacherOf = s.classTeacherOf;
        if (s.classTeacher   && !bestClassTeacher)   bestClassTeacher   = s.classTeacher;
        if (Array.isArray(s.assignments)) allAssignments.push(...s.assignments);
      }
      // Dedupe assignments by class + subjectKey
      const seenAsg = new Set();
      const dedupedAsg = allAssignments.filter(a => {
        const k = `${a.class}|${a.subjectKey}`;
        if (seenAsg.has(k)) return false;
        seenAsg.add(k); return true;
      });
      merged.role           = bestRole;
      merged.classTeacherOf = bestClassTeacherOf;
      merged.classTeacher   = bestClassTeacher;
      merged.assignments    = dedupedAsg;

      // Directory values authoritative
      merged.name            = it.dir.fullName;
      merged.fullName        = it.dir.fullName;
      merged.initials        = it.dir.initials;
      merged.routineInitials = it.dir.initials;
      merged.teacherId       = it.dir.staffId || merged.teacherId || '';
      merged.staffId         = it.dir.staffId || merged.staffId || '';
      merged.isPartTime      = !!it.dir.isPartTime;
      merged.updatedAt       = ts;
      if (!merged.createdAt) merged.createdAt = ts;

      batch.set(doc(db, 'teachers', it.dir.initials), merged);

      // Queue classes/{key} update if any deleted doc was the registered classTeacher
      const oldClassRefs = new Set();
      if (it.primary?.classTeacherOf) oldClassRefs.add(it.primary.classTeacherOf);
      for (const s of it.secondaries) if (s.classTeacherOf) oldClassRefs.add(s.classTeacherOf);
      for (const classKey of oldClassRefs) {
        classesToUpdate.push({ classKey, newId: it.dir.initials, name: it.dir.fullName });
      }

      // Delete duplicate docs
      for (const s of it.secondaries) {
        if (s.docId !== it.dir.initials) {
          batch.delete(doc(db, 'teachers', s.docId));
          stats.deleted++;
        }
      }
      stats.merged++;
    }

    // 2b. Rewrite classes/{key}.classTeacherId/Name to point at the consolidated initials-keyed doc
    for (const u of classesToUpdate) {
      batch.set(doc(db, 'classes', u.classKey), {
        classTeacherId: u.newId,
        classTeacherName: u.name
      }, { merge: true });
    }

    // 3. CREATE — fresh initials-keyed docs
    for (const it of plan.create) {
      batch.set(doc(db, 'teachers', it.dir.initials), {
        name:            it.dir.fullName,
        fullName:        it.dir.fullName,
        initials:        it.dir.initials,
        routineInitials: it.dir.initials,
        teacherId:       it.dir.staffId || '',
        staffId:         it.dir.staffId || '',
        isPartTime:      !!it.dir.isPartTime,
        status:          'Active',
        createdAt:       ts,
        updatedAt:       ts
      });
      stats.created++;
    }

    // 4. DELETE — user-checked orphans
    for (const oid of orphanIds) {
      batch.delete(doc(db, 'teachers', oid));
      stats.deleted++;
    }

    await batch.commit();
    showToast(`✅ Sync complete · ${stats.updated} updated · ${stats.merged} merged · ${stats.created} created · ${stats.deleted} deleted`);
    closeSyncDirectoryPanel();
    if (window.loadTeacherAssignList) loadTeacherAssignList();
  } catch (e) {
    console.error('[applySyncDirectory] failed:', e);
    showToast('❌ Sync failed: ' + e.message);
    applyBtn.disabled = false; applyBtn.style.opacity = '1';
    applyBtn.innerHTML = '<i class="fas fa-check"></i> Apply Changes';
  }
};

function taBadge(role) {
  const map = { admin:'admin', class_teacher:'class', subject_teacher:'subject' };
  const cls = map[role];
  if (!cls) return '<span class="admin-ta-badge admin-ta-badge-none">Unassigned</span>';
  const lbl = { admin:'Admin', class:'Class Teacher', subject:'Subject Teacher' };
  return `<span class="admin-ta-badge admin-ta-badge-${cls}">${lbl[cls]}</span>`;
}

function taSubjectSummary(assignments) {
  if (!assignments.length) return '';
  const map = {};
  assignments.forEach(a => {
    if (!map[a.subjectLabel]) map[a.subjectLabel] = [];
    map[a.subjectLabel].push(a.class);
  });
  return Object.entries(map).map(([lbl, cls]) => `${lbl} (${cls.join(', ')})`).join(' &nbsp;|&nbsp; ');
}

window.filterTAList = function() {
  const q = (document.getElementById('ta-search').value || '').toLowerCase();
  const filtered = (window._taAllTeachers || []).filter(t =>
    (t.name||'').toLowerCase().includes(q) ||
    (t.email||'').toLowerCase().includes(q) ||
    (t.assignments||[]).some(a => (a.subjectLabel||'').toLowerCase().includes(q))
  );
  renderTAList(filtered);
};

// ──────────────────────────────────────────────────────────────────
// LOGIN LINKAGE CHECK — verifies users/{uid} → teachers/{initials}
// resolves correctly via the same lookup chain as loadTeacherPortal.
// Read-only diagnostic. No writes.
// ──────────────────────────────────────────────────────────────────

window.openLoginCheckPanel = async function() {
  document.getElementById('login-check-overlay').style.display = 'block';
  document.body.style.overflow = 'hidden';
  const body = document.getElementById('login-check-body');
  body.innerHTML = `<p style="text-align:center;color:var(--text-light);padding:32px"><i class="fas fa-spinner fa-spin"></i> Tracing login linkages…</p>`;
  try {
    const report = await runLoginCheck();
    renderLoginCheck(report);
  } catch (e) {
    body.innerHTML = `<p style="color:var(--danger);padding:24px">❌ ${e.message}</p>`;
    console.error(e);
  }
};

window.closeLoginCheckPanel = function() {
  document.getElementById('login-check-overlay').style.display = 'none';
  document.body.style.overflow = '';
};

async function runLoginCheck() {
  const [usersSnap, teachersSnap] = await Promise.all([
    getDocs(collection(db, 'users')),
    getDocs(collection(db, 'teachers'))
  ]);
  const users    = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
  const teachers = teachersSnap.docs.map(d => ({ docId: d.id, ...d.data() }));

  // Index helpers
  const teacherByDocId = new Map(teachers.map(t => [t.docId, t]));
  const teachersByTeacherId = new Map();
  for (const t of teachers) {
    if (t.teacherId) teachersByTeacherId.set(String(t.teacherId).toUpperCase(), t);
  }

  const report = [];
  for (const dir of SFS_TEACHER_DIRECTORY) {
    const teacherDoc = teacherByDocId.get(dir.initials);

    // Find users that point at this teacher via teacherId or loginId
    const candidates = users.filter(u => {
      const ut = String(u.teacherId || u.loginId || '').toUpperCase();
      if (!ut) return false;
      return (dir.staffId && ut === dir.staffId.toUpperCase()) ||
             (ut === dir.initials.toUpperCase());
    });

    let status, detail, fix = '';
    if (!teacherDoc) {
      status = 'NO_DOC'; detail = 'Teacher doc not found. Run Sync.';
      fix = 'Sync';
    } else if (candidates.length === 0) {
      status = dir.staffId ? 'NO_LOGIN' : 'PENDING';
      detail = dir.staffId
        ? 'No Firebase Auth account linked. Teacher cannot log in.'
        : 'Pending staff ID — login account expected later.';
    } else if (candidates.length > 1) {
      status = 'AMBIGUOUS';
      detail = `${candidates.length} user docs claim this teacher: ${candidates.map(c => c.uid.slice(0,8)).join(', ')}`;
    } else {
      // Simulate the portal's lookup chain
      const u = candidates[0];
      const tid = String(u.teacherId || u.loginId || '').toUpperCase();
      const directHit = teacherByDocId.get(u.uid);
      const tidHit    = teachersByTeacherId.get(tid);
      const resolved  = directHit || tidHit;
      if (resolved && resolved.docId === dir.initials) {
        status = 'OK';
        detail = `Logs in as <code>${(u.loginId || u.email || '?').replace(/</g,'&lt;')}</code>`;
      } else if (resolved) {
        status = 'WRONG_DOC';
        detail = `Lookup resolves to <code>${resolved.docId}</code> (expected <code>${dir.initials}</code>).`;
      } else {
        status = 'BROKEN';
        detail = `users/${u.uid.slice(0,8)}… has teacherId="${tid}" but no matching teacher doc.`;
      }
    }
    report.push({ dir, status, detail, fix, teacherDoc, candidates });
  }

  // Also report orphan user accounts that claim to be teachers but match no directory entry
  const claimedDirIds = new Set(SFS_TEACHER_DIRECTORY.flatMap(d => [d.initials.toUpperCase(), (d.staffId||'').toUpperCase()].filter(Boolean)));
  const orphans = users.filter(u => {
    const ut = String(u.teacherId || u.loginId || '').toUpperCase();
    if (!ut) return false;
    if (claimedDirIds.has(ut)) return false;
    const role = (u.role || '').toLowerCase();
    return role.includes('teacher');
  });
  return { report, orphans };
}

function renderLoginCheck({ report, orphans }) {
  const body = document.getElementById('login-check-body');
  const summary = document.getElementById('login-check-summary');

  const counts = report.reduce((a, r) => { a[r.status] = (a[r.status]||0)+1; return a; }, {});
  const ok = counts.OK || 0;
  const issues = (counts.NO_LOGIN||0) + (counts.WRONG_DOC||0) + (counts.BROKEN||0) + (counts.AMBIGUOUS||0) + (counts.NO_DOC||0);
  const pending = counts.PENDING || 0;
  summary.innerHTML = `<span style="color:#1a6b3c;font-weight:700">✓ ${ok} OK</span> · <span style="color:#dc2626;font-weight:700">${issues} issue${issues===1?'':'s'}</span> · <span style="color:var(--text-light)">${pending} pending</span>${orphans.length ? ` · <span style="color:#b45309;font-weight:700">${orphans.length} orphan login${orphans.length===1?'':'s'}</span>` : ''}`;

  const badge = (status) => {
    const map = {
      OK:        { bg:'#dcfce7', fg:'#166534', icon:'fa-check-circle',     label:'OK' },
      NO_LOGIN:  { bg:'#fee2e2', fg:'#991b1b', icon:'fa-user-slash',       label:'No Login' },
      PENDING:   { bg:'#fef3c7', fg:'#92400e', icon:'fa-clock',            label:'Pending' },
      WRONG_DOC: { bg:'#fee2e2', fg:'#991b1b', icon:'fa-exclamation-triangle', label:'Wrong Doc' },
      BROKEN:    { bg:'#fee2e2', fg:'#991b1b', icon:'fa-unlink',           label:'Broken' },
      AMBIGUOUS: { bg:'#fef3c7', fg:'#92400e', icon:'fa-question-circle',  label:'Ambiguous' },
      NO_DOC:    { bg:'#fee2e2', fg:'#991b1b', icon:'fa-times-circle',     label:'No Teacher Doc' }
    };
    const m = map[status] || map.BROKEN;
    return `<span style="background:${m.bg};color:${m.fg};padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;letter-spacing:0.3px"><i class="fas ${m.icon}" style="margin-right:4px"></i>${m.label}</span>`;
  };

  const rows = report.map(r => `<tr>
    <td style="padding:10px 12px"><strong>${r.dir.fullName}</strong></td>
    <td style="padding:10px 12px"><span style="background:#e0e7ff;color:#1a4a8a;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700">${r.dir.initials}</span></td>
    <td style="padding:10px 12px;color:var(--text-light);font-size:12px">${r.dir.staffId || '—'}</td>
    <td style="padding:10px 12px">${badge(r.status)}</td>
    <td style="padding:10px 12px;font-size:12px;color:var(--text-light)">${r.detail}</td>
  </tr>`).join('');

  let html = `<div class="table-wrap"><table style="width:100%;font-size:13px"><thead><tr style="background:#eff6ff"><th style="padding:10px 12px;text-align:left">Teacher</th><th style="padding:10px 12px;text-align:left">Initials</th><th style="padding:10px 12px;text-align:left">Staff ID</th><th style="padding:10px 12px;text-align:left">Status</th><th style="padding:10px 12px;text-align:left">Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;

  if (orphans.length) {
    html += `<div style="margin-top:24px"><h5 style="color:#b45309;margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Orphan Login Accounts <span style="background:#b45309;color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;margin-left:6px">${orphans.length}</span></h5>
      <p style="font-size:12px;color:var(--text-light);margin:0 0 8px">User accounts with role=teacher whose teacherId/loginId doesn't match any directory entry.</p>
      <div style="border:1px solid #f3d9b1;border-radius:8px;overflow:hidden">${orphans.map(o => `<div style="padding:8px 14px;border-bottom:1px solid #fbeed5;font-size:12px;display:flex;justify-content:space-between"><span><strong>${(o.name||o.email||o.uid.slice(0,8)).replace(/</g,'&lt;')}</strong></span><span style="color:var(--text-light)">teacherId: <code>${o.teacherId||o.loginId||'—'}</code></span></div>`).join('')}</div></div>`;
  }

  body.innerHTML = html;
}

// ── Panel open / close ──────────────────────────────────────

window.openTAPanel = async function(uid) {
  const teacher = (window._taAllTeachers || []).find(t => t.uid === uid);
  if (!teacher) return;
  _taCurrentUid  = uid;
  _taCurrentData = teacher;
  _taAssignments = JSON.parse(JSON.stringify(teacher.assignments || []));

  document.getElementById('ta-panel-title').textContent = `Assign Roles — ${teacher.name || 'Teacher'}`;

  // Identity · Routine Link (pre-fill)
  const riEl = document.getElementById('ta-routineInitials');
  const sidEl = document.getElementById('ta-staffId');
  const ptEl = document.getElementById('ta-isPartTime');
  if (riEl)  riEl.value  = (teacher.routineInitials || teacher.initials || '').toString().toUpperCase();
  if (sidEl) sidEl.value = teacher.teacherId || teacher.staffId || '';
  if (ptEl)  ptEl.checked = !!teacher.isPartTime;

  // Role radio
  document.querySelectorAll('input[name="ta-role"]').forEach(r => { r.checked = (r.value === (teacher.role || '')); });
  onTARoleChange();

  // Class teacher dropdown
  document.getElementById('ta-ct-class').value = teacher.classTeacherOf || '';
  document.getElementById('ta-ct-conflict').style.display = 'none';

  // Reset add-row controls
  document.getElementById('ta-sub-class').value = '';
  document.getElementById('ta-sub-subject').innerHTML = '<option value="">— Select Class First —</option>';
  document.getElementById('ta-sub-error').style.display = 'none';

  renderTAAssignTable();
  document.getElementById('ta-panel-overlay').style.display = 'block';
  document.getElementById('ta-panel').classList.add('open');
};

window.closeTAPanel = function() {
  document.getElementById('ta-panel').classList.remove('open');
  document.getElementById('ta-panel-overlay').style.display = 'none';
  _taCurrentUid = null; _taCurrentData = null; _taAssignments = [];
};

// ── Section A — role change ─────────────────────────────────

window.onTARoleChange = function() {
  const role = document.querySelector('input[name="ta-role"]:checked')?.value;
  document.getElementById('ta-section-b').style.display = (role === 'class_teacher') ? '' : 'none';
};

// ── Section B — conflict check ──────────────────────────────

window.onTACTClassChange = async function() {
  const cls = document.getElementById('ta-ct-class').value;
  const sec = 'A';
  const conflictEl = document.getElementById('ta-ct-conflict');
  conflictEl.style.display = 'none';
  if (!cls || !sec) return;
  try {
    const snap = await getDoc(doc(db, 'classes', `${cls}-${sec}`));
    if (snap.exists()) {
      const d = snap.data();
      if (d.classTeacherId && d.classTeacherId !== _taCurrentUid) {
        conflictEl.textContent = `⚠ ${cls}-${sec} already has a class teacher: ${d.classTeacherName || d.classTeacherId}. Saving will reassign this class.`;
        conflictEl.style.display = 'block';
      }
    }
  } catch(e) { /* ignore */ }
};

// ── Section C — subject dropdown ────────────────────────────

window.onTASubClassChange = function() {
  const cls     = document.getElementById('ta-sub-class').value;
  const subjSel = document.getElementById('ta-sub-subject');
  subjSel.innerHTML = '<option value="">— Subject —</option>';
  if (!cls) return;
  const cfg = window.CONFIG && window.CONFIG[TA_CLASS_MAP[cls]];
  if (!cfg) return;
  cfg.subjects.filter(s => !s.isAggregate).forEach(s => {
    const o = document.createElement('option');
    o.value = s.key; o.textContent = s.label;
    subjSel.appendChild(o);
  });
};

window.addTASubjectRow = function() {
  const cls      = document.getElementById('ta-sub-class').value;
  const sec      = 'A';
  const subjSel  = document.getElementById('ta-sub-subject');
  const key      = subjSel.value;
  const label    = subjSel.options[subjSel.selectedIndex]?.text || '';
  const errEl    = document.getElementById('ta-sub-error');
  errEl.style.display = 'none';
  if (!cls || !key) { errEl.textContent = 'Select a class and subject.'; errEl.style.display = 'block'; return; }
  if (_taAssignments.some(a => a.class === cls && a.subjectKey === key)) {
    errEl.textContent = 'Already added.'; errEl.style.display = 'block'; return;
  }
  _taAssignments.push({ class: cls, subjectKey: key, subjectLabel: label });
  renderTAAssignTable();
};

// ── Multi-class helper ──────────────────────────────────────

window.onTAMultiSubjectChange = function() {
  const key       = document.getElementById('ta-multi-subject').value;
  const container = document.getElementById('ta-multi-classes');
  container.innerHTML = '';
  if (!key) return;
  const validNums = TA_SUBJECT_CLASSES[key] || [];
  TA_CLASS_NAMES.forEach((name, i) => {
    if (!validNums.includes(TA_CLASS_NUMS[i])) return;
    const lbl = document.createElement('label');
    lbl.style.cssText = 'display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:#fff';
    lbl.innerHTML = `<input type="checkbox" value="${name}"> ${name}`;
    container.appendChild(lbl);
  });
};

window.addTAMultiRows = function() {
  const key     = document.getElementById('ta-multi-subject').value;
  const sec     = 'A';
  if (!key) { showToast('Select a subject first.'); return; }
  const checked = [...document.querySelectorAll('#ta-multi-classes input:checked')].map(c => c.value);
  if (!checked.length) { showToast('Select at least one class.'); return; }
  let added = 0;
  checked.forEach(cls => {
    const cfg  = window.CONFIG && window.CONFIG[TA_CLASS_MAP[cls]];
    const subj = cfg?.subjects.find(s => s.key === key && !s.isAggregate);
    if (!subj) return;
    if (_taAssignments.some(a => a.class === cls && a.subjectKey === key)) return;
    _taAssignments.push({ class: cls, subjectKey: key, subjectLabel: subj.label });
    added++;
  });
  renderTAAssignTable();
  showToast(added ? `✅ Added ${added} assignment${added > 1 ? 's' : ''}.` : 'All selected were already added.');
};

window.removeTARow = function(idx) {
  _taAssignments.splice(idx, 1);
  renderTAAssignTable();
};

function renderTAAssignTable() {
  const tbody = document.getElementById('ta-assign-tbody');
  if (!_taAssignments.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-light);padding:12px;font-size:13px">No assignments yet.</td></tr>';
    return;
  }
  tbody.innerHTML = _taAssignments.map((a, i) => `
    <tr>
      <td>${taEsc(a.class)}</td>
      <td>${taEsc(a.subjectLabel)}</td>
      <td><button onclick="removeTARow(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:15px" title="Remove">✕</button></td>
    </tr>`).join('');
}

// ── Save (Firestore batch) ──────────────────────────────────

window.saveTAAssignments = async function() {
  const role = document.querySelector('input[name="ta-role"]:checked')?.value;
  if (!role) { showToast('⚠ Please select a role.'); return; }

  let classTeacherOf = null;
  if (role === 'class_teacher') {
    const cls = document.getElementById('ta-ct-class').value;
    if (!cls) { showToast('⚠ Select a class for Class Teacher assignment.'); return; }
    classTeacherOf = cls;
  }

  const oldCT = _taCurrentData?.classTeacherOf || null;
  const batch = writeBatch(db);

  // Also write classTeacher as Arabic number so base loadTeacherPortal reads it correctly
  const _ctNum = classTeacherOf ? (TA_ROMAN_TO_NUM[classTeacherOf.split('-')[0]] || null) : null;

  // Identity · Routine Link fields
  const riVal  = (document.getElementById('ta-routineInitials')?.value || '').toUpperCase().trim();
  const sidVal = (document.getElementById('ta-staffId')?.value || '').trim();
  const ptVal  = !!document.getElementById('ta-isPartTime')?.checked;

  batch.set(doc(db, 'teachers', _taCurrentUid), {
    role,
    classTeacherOf: classTeacherOf,
    classTeacher:   _ctNum,
    assignments:    _taAssignments,
    name:           _taCurrentData?.name  || '',
    email:          _taCurrentData?.email || '',
    routineInitials: riVal,
    initials:       riVal,
    teacherId:      sidVal || _taCurrentData?.teacherId || '',
    staffId:        sidVal || _taCurrentData?.staffId || '',
    isPartTime:     ptVal,
    updatedAt:      serverTimestamp()
  }, { merge: true });

  if (oldCT && oldCT !== classTeacherOf) {
    batch.set(doc(db, 'classes', oldCT), { classTeacherId: null, classTeacherName: null }, { merge: true });
  }
  if (classTeacherOf) {
    batch.set(doc(db, 'classes', classTeacherOf), {
      classTeacherId:   _taCurrentUid,
      classTeacherName: _taCurrentData?.name || ''
    }, { merge: true });
  }

  try {
    await batch.commit();

    // Sync assignments into /users/{authUid} so the teacher portal reads them directly
    // without needing a cross-collection query (avoids Firestore security rule issues).
    const tid = _taCurrentData?.teacherId || '';
    if (tid) {
      const portalPayload = {
        tpRole: role,
        tpClassTeacherOf: classTeacherOf || null,
        tpAssignments: _taAssignments,
        tpUpdatedAt: new Date().toISOString()
      };
      try {
        let uSnap = await getDocs(query(collection(db,'users'), where('loginId','==',tid)));
        if (uSnap.empty) uSnap = await getDocs(query(collection(db,'users'), where('loginId','==',tid.toUpperCase())));
        if (uSnap.empty) uSnap = await getDocs(query(collection(db,'users'), where('loginId','==',tid.toLowerCase())));
        if (uSnap.empty && _taCurrentData?.email) uSnap = await getDocs(query(collection(db,'users'), where('email','==',_taCurrentData.email)));
        if (!uSnap.empty) {
          const authUid = uSnap.docs[0].id;
          await setDoc(doc(db,'users',authUid), portalPayload, { merge: true });
        }
      } catch(e2) { console.warn('Portal sync failed:', e2.message); }
    }

    showToast(`✅ Assignments saved for ${_taCurrentData?.name || 'teacher'}`);
    closeTAPanel();
    loadTeacherAssignList();
  } catch(e) {
    showToast(`❌ Save failed: ${e.message}`);
  }
};

window.openAddTeacherForAssign = function() {
  if (typeof openTeacherModal === 'function') openTeacherModal();
  else showToast('Use the Teachers tab to add new teachers.');
};

function taEsc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================================
// END TEACHER ASSIGNMENT MODULE
// ============================================================

// ============================================================
// TEACHER PORTAL — REFLECT ASSIGNMENTS  (Phase 2)
// ============================================================

let _tpAssignUnsubscribe = null; // holds onSnapshot unsubscribe fn

// Called from loadTeacherPortal after the teacher doc is found
window.initTeacherAssignments = function(teacherDocId, teacherData) {
  // Render immediately with current data
  renderTPAssignments(teacherData);

  // Live listener — update if admin changes assignments while logged in
  if (_tpAssignUnsubscribe) _tpAssignUnsubscribe();
  _tpAssignUnsubscribe = onSnapshot(
    doc(db, 'teachers', teacherDocId),
    (snap) => {
      if (!snap.exists()) return;
      const fresh = snap.data();
      renderTPAssignments(fresh);
      // Only show toast after initial load (avoid firing on first attach)
      if (window._tpAssignLoaded) showTPLiveToast('📋 Your assignments have been updated.');
      window._tpAssignLoaded = true;
    },
    (err) => { console.warn('TP onSnapshot error:', err.message); }
  );
};

// ───────────────────────────────────────────────────────────────────────
// CT pending-review status — counts how many subjects subject-teachers
// have submitted for the class teacher's class, per term, and highlights
// "+N NEW" submissions arrived since the CT last clicked Review.
// ───────────────────────────────────────────────────────────────────────
async function loadCTPendingReviews(classId) {
  if (!classId) return;
  const card = document.getElementById('tp-class-card');
  if (!card) return;

  renderCTStatusRow(card, classId, null); // loading state

  try {
    const results = {};
    for (const term of ['HY', 'FT']) {
      const termKey = `${classId}_${term}`;
      const snap    = await getDocs(query(
        collection(db, 'marks', termKey, 'students'),
        limit(100)
      ));

      const aggregate     = {};
      const academicsKeys = new Set();
      let isLocked = false;
      snap.forEach(d => {
        const data = d.data();
        if (data.status === 'locked') isLocked = true;
        const sub = data.submittedSubjects || {};
        for (const [k, v] of Object.entries(sub)) {
          if (!aggregate[k] || (v?.status === 'submitted' && aggregate[k]?.status !== 'submitted')) {
            aggregate[k] = v;
          }
        }
        Object.keys(data.academics || {}).forEach(k => academicsKeys.add(k));
      });
      Object.keys(aggregate).forEach(k => academicsKeys.add(k));

      results[term] = {
        submitted: Object.values(aggregate).filter(v => v?.status === 'submitted').length,
        total:     academicsKeys.size,
        locked:    isLocked
      };
    }
    renderCTStatusRow(card, classId, results);
  } catch (err) {
    console.warn('loadCTPendingReviews failed:', err.message);
    renderCTStatusRow(card, classId, 'error');
  }
}

function renderCTStatusRow(card, classId, results) {
  const existing = document.getElementById('tp-ct-status-row');
  if (existing) existing.remove();

  const row = document.createElement('div');
  row.id = 'tp-ct-status-row';
  row.style.cssText =
    'margin-top:14px;padding-top:12px;border-top:1px dashed var(--border,#e2d8c5);' +
    'display:flex;gap:18px;flex-wrap:wrap;font-size:13px';

  if (results === null) {
    row.innerHTML = '<span style="color:var(--text-light)">' +
      '<i class="fas fa-spinner fa-spin"></i> Checking pending reviews…</span>';
  } else if (results === 'error') {
    row.innerHTML = '<span style="color:var(--text-light)">Could not load pending reviews.</span>';
  } else {
    const lastSeenKey = `tp_ct_last_seen_${classId}`;
    let lastSeen = {};
    try { lastSeen = JSON.parse(localStorage.getItem(lastSeenKey) || '{}'); } catch (_) {}

    ['HY', 'FT'].forEach(term => {
      const r        = results[term];
      const label    = term === 'HY' ? 'Half Yearly' : 'Final Term';
      const newCount = Math.max(0, r.submitted - (lastSeen[term] || 0));
      const totalStr = r.total > 0 ? r.total : '—';
      const valColor = r.submitted > 0 ? '#16a34a' : 'var(--text-light)';

      let badge = '';
      if (r.locked) {
        badge = ' <span style="background:#e0e0e0;color:#555;padding:2px 8px;' +
                'border-radius:10px;font-size:10.5px;font-weight:700;letter-spacing:.3px">LOCKED</span>';
      } else if (newCount > 0) {
        badge = ` <span class="badge-new" style="margin-left:0">+${newCount} NEW</span>`;
      }

      row.innerHTML +=
        '<div style="display:flex;align-items:center;gap:6px">' +
          `<strong style="color:var(--accent-dark)">${label}:</strong>` +
          `<span style="color:${valColor};font-weight:700">${r.submitted}</span>` +
          `<span style="color:var(--text-light)">/${totalStr} submitted</span>` +
          badge +
        '</div>';
    });

    // Wire "last seen" update onto the Review button so the NEW badge clears
    // after the CT actually opens the mark entry app.
    const reviewBtn = card.querySelector('.tp-review-lock-btn');
    if (reviewBtn && !reviewBtn._lastSeenWired) {
      reviewBtn._lastSeenWired = true;
      reviewBtn.addEventListener('click', () => {
        try {
          localStorage.setItem(lastSeenKey, JSON.stringify({
            HY: results.HY.submitted,
            FT: results.FT.submitted
          }));
        } catch (_) {}
      });
    }
  }

  card.appendChild(row);
}

function renderTPAssignments(data) {
  const role            = data.role || '';
  const classTeacherOf  = data.classTeacherOf || null;
  const assignments     = data.assignments || [];

  // ── Class card (only for class_teacher) ──────────────────
  const classCard = document.getElementById('tp-class-card');
  const classLabel = document.getElementById('tp-class-label');
  if (classCard) {
    if (role === 'class_teacher' && classTeacherOf) {
      classCard.style.display = '';
      if (classLabel) classLabel.textContent = `Class ${classTeacherOf.replace(/-A$/,'')}`;
      const reviewBtn = classCard.querySelector('.tp-review-lock-btn');
      if (reviewBtn) {
        reviewBtn.style.opacity = '';
        reviewBtn.style.cursor  = '';
        reviewBtn.removeAttribute('title');
        reviewBtn.onclick = () => {
          window.location.href = `../Sfs-report-card/markentry.html?classId=${classTeacherOf}&action=review`;
        };
      }
      loadCTPendingReviews(classTeacherOf);
    } else {
      classCard.style.display = 'none';
    }
  }

  // ── Subjects table ────────────────────────────────────────
  const wrap = document.getElementById('tp-subjects-wrap');
  if (!wrap) return;

  if (!assignments.length) {
    wrap.innerHTML = `<div class="tp-assign-empty">
      <i class="fas fa-exclamation-triangle" style="color:#f0c040;margin-right:8px"></i>
      ${role === 'class_teacher'
        ? 'You are assigned as Class Teacher only. Subject marks will be entered by individual subject teachers.'
        : 'No subjects have been assigned to you yet. Please contact the Admin.'}
    </div>`;
    return;
  }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table class="tp-assign-table">
        <thead>
          <tr><th>Class</th><th>Subject</th><th>Term</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${assignments.map(a => {
            const classId = a.classId || (a.class + (a.section ? '-' + a.section : '-A'));
            const term    = a.term || 'HY';
            return `
            <tr>
              <td data-label="Class">${taEsc(classId)}</td>
              <td data-label="Subject">${taEsc(a.subjectLabel)}</td>
              <td data-label="Term">${term === 'HY' ? 'Half Yearly' : 'Final Term'}</td>
              <td data-label="Action">
                <button class="tp-enter-marks-btn"
                  data-class-id="${taEsc(classId)}"
                  data-subject-key="${taEsc(a.subjectKey)}"
                  data-term="${taEsc(term)}"
                  onclick="tpOpenMarkEntry(this)">
                  <i class="fas fa-pen"></i> Enter Marks →
                </button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  // Also update dashboard stat card
  const statSub = document.getElementById('t-stat-subjects');
  if (statSub) {
    const unique = [...new Set(assignments.map(a => a.subjectLabel))];
    statSub.textContent = unique.slice(0, 2).join(', ') + (unique.length > 2 ? ` +${unique.length - 2}` : '');
  }
}

window.tpOpenMarkEntry = function(btn) {
  const classId    = btn.dataset.classId;
  const subjectKey = btn.dataset.subjectKey;
  const term       = btn.dataset.term || 'HY';
  window.location.href = `/Sfs-report-card/markentry.html?classId=${classId}&subject=${subjectKey}&term=${term}&_t=${Date.now()}`;
};

function showTPLiveToast(msg) {
  const existing = document.querySelector('.tp-live-toast');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.className = 'tp-live-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ── Hook into existing loadTeacherPortal ─────────────────────
// Roman numeral → Arabic number for _currentTeacherClass and student queries
const TA_ROMAN_TO_NUM = { I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10 };

// Patch: override loadTeacherPortal to use Phase 1 assignment fields
const _origLoadTeacherPortal = window.loadTeacherPortal;
window.loadTeacherPortal = async function(user) {
  // Run original first (sets up base portal, but may use stale class/subject fields)
  await _origLoadTeacherPortal(user);

  try {
    window._tpAssignLoaded = false;
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) return;
    const userData = userDoc.data();
    const teacherId = userData.teacherId || userData.loginId || '';
    if (!teacherId) return;

    // PRIMARY: read assignment fields from /users/{uid} — written by saveTAAssignments.
    // This works regardless of Firestore security rules on /teachers.
    let newRole    = userData.tpRole    || null;
    let rawCTOf    = userData.tpClassTeacherOf || null;
    let newAssigns = userData.tpAssignments    || [];

    // FALLBACK: if /users fields not yet synced (or tpAssignments empty), try /teachers/{uid} mirror doc
    if (!newRole || !newAssigns.length) {
      try {
        const mirrorSnap = await getDoc(doc(db, 'teachers', user.uid));
        if (mirrorSnap.exists()) {
          const m = mirrorSnap.data();
          if (!newRole)         { newRole = m.role || null; rawCTOf = m.classTeacherOf || null; }
          if (!newAssigns.length) newAssigns = m.assignments || [];
        }
      } catch(ef) { /* security rules — skip */ }
    }

    // LAST RESORT: query /teachers by teacherId
    let teacherDocId = user.uid;
    let profileData  = {};
    try {
      let snap = await getDocs(query(collection(db,'teachers'), where('teacherId','==',teacherId)));
      if (snap.empty) snap = await getDocs(query(collection(db,'teachers'), where('teacherId','==',teacherId.toUpperCase())));
      if (snap.empty) snap = await getDocs(query(collection(db,'teachers'), where('teacherId','==',teacherId.toLowerCase())));
      if (!snap.empty) {
        teacherDocId = snap.docs[0].id;
        profileData  = snap.docs[0].data();
        if (!newRole)         { newRole = profileData.role||null; rawCTOf = profileData.classTeacherOf||null; }
        if (!newAssigns.length) newAssigns = profileData.assignments||[];
      }
    } catch(eq) { /* blocked by rules */ }

    const newCTOf = rawCTOf ? rawCTOf.split('-')[0] : null;

    if (!newRole) {
      initTeacherAssignments(teacherDocId, { ...profileData, ...userData });
      return;
    }

    // ── Convert Roman → Arabic for student/attendance queries ───────────
    const classNum = newCTOf ? (TA_ROMAN_TO_NUM[newCTOf] || null) : null;
    const classLabel = { PLG:'Play Group', SKG:'SKG', LKG:'LKG' };
    const getClsLabel = c => classLabel[c] || (c ? 'Class ' + c : '—');
    const classDisplay = newCTOf ? `Class ${newCTOf}` : '—';

    // ── Build subject display string from assignments ─────────────────────
    const uniqueSubjects = [...new Set(newAssigns.map(a => a.subjectLabel))];
    const subjectsStr = uniqueSubjects.join(', ') || '—';

    // ── Update header ─────────────────────────────────────────────────────
    const hdrRole = document.querySelector('#page-teacher-dash .dash-role');
    if (hdrRole) {
      const roleLabel = newRole === 'class_teacher' ? 'Class Teacher' : newRole === 'admin' ? 'Admin' : 'Subject Teacher';
      hdrRole.textContent = `${subjectsStr !== '—' ? subjectsStr : roleLabel} · ${classDisplay}`;
    }
    const subtitle = document.getElementById('t-dash-subtitle');
    if (subtitle) {
      const roleLabel = newRole === 'class_teacher' ? `Class Teacher – ${classDisplay}` : newRole === 'admin' ? 'Admin' : `Subject Teacher · ${classDisplay}`;
      subtitle.textContent = roleLabel;
    }

    // ── Update stat cards ─────────────────────────────────────────────────
    const tStatClass = document.getElementById('t-stat-class');
    if (tStatClass) tStatClass.textContent = classDisplay;

    const tStatSub = document.getElementById('t-stat-subjects');
    if (tStatSub) {
      const preview = uniqueSubjects.slice(0, 2).join(', ') + (uniqueSubjects.length > 2 ? ` +${uniqueSubjects.length - 2}` : '');
      tStatSub.textContent = preview || '—';
    }

    // ── Update class headings (student list, attendance) ──────────────────
    const tClassHd = document.getElementById('t-class-heading');
    if (tClassHd) tClassHd.textContent = classDisplay;

    const tAttHd = document.getElementById('t-att-heading');
    if (tAttHd) tAttHd.textContent = classDisplay;

    // ── Re-fetch students and re-init attendance with correct class ────────
    if (newRole === 'class_teacher' && classNum) {
      window._currentTeacherClass = classNum;

      // Re-fetch student list for the correct class
      const sSnap = await getDocs(query(
        collection(db, 'students'),
        where('class', '==', String(classNum)),
        orderBy('rollNo')
      ));
      const tStatStu = document.getElementById('t-stat-students');
      if (tStatStu) tStatStu.textContent = sSnap.size;
      window._teacherStudentDocs = sSnap.docs;
      if (typeof window.renderTeacherStudentList === 'function') window.renderTeacherStudentList(sSnap.docs);

      // Re-init attendance for correct class
      if (typeof window.initTeacherAttendance === 'function') window.initTeacherAttendance(classNum);
    } else if (newRole === 'subject_teacher') {
      // Subject teacher — clear stale class data
      window._currentTeacherClass = '';
      const tStatStu = document.getElementById('t-stat-students');
      if (tStatStu) tStatStu.textContent = '—';
    }

    // ── Render My Subjects panel ──────────────────────────────────────────
    // teacherDocId is the auth-uid mirror doc (kept in sync by saveTAAssignments)
    const tForPanel = { ...profileData, role: newRole, classTeacherOf: rawCTOf, assignments: newAssigns };
    initTeacherAssignments(teacherDocId, tForPanel);

  } catch(e) {
    console.warn('Phase 2 assignments load:', e.message);
  }
};


// Cleanup listener on logout
const _origLogout = window.logout;
window.logout = function() {
  if (_tpAssignUnsubscribe) { _tpAssignUnsubscribe(); _tpAssignUnsubscribe = null; }
  window._tpAssignLoaded = false;
  if (typeof _origLogout === 'function') _origLogout();
};

// ============================================================
// END TEACHER PORTAL ASSIGNMENTS MODULE
// ============================================================
