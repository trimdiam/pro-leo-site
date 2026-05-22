import {
  initializeApp,
  getApps,
  getApp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  updateDoc,
  onSnapshot,
  getCountFromServer,
  deleteField,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  getMessaging,
  getToken,
  onMessage,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging.js";
import {
  getStorage,
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";
const pur = (s) =>
    window.DOMPurify
      ? DOMPurify.sanitize(s || "")
      : (s || "").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  firebaseConfig = {
    apiKey: "AIzaSyBXq3fe0uY8UB7-uLGzGIIvZOQf8YjNqaM",
    authDomain: "st-francis-school-a3e7e.firebaseapp.com",
    projectId: "st-francis-school-a3e7e",
    storageBucket: "st-francis-school-a3e7e.firebasestorage.app",
    messagingSenderId: "180123372524",
    appId: "1:180123372524:web:caed0f2a44d35f19d90ec9",
  },
  app = getApps().length ? getApp() : initializeApp(firebaseConfig),
  auth = getAuth(app),
  storage = getStorage(app);
const db = getFirestore(app);
((window._firebaseApp = app),
  (window._firebaseAuth = auth),
  (window.firebaseConfig = firebaseConfig),
  (window.initializeApp = initializeApp),
  (window._academicAppUrl = "../assessment-app/index.html"),
  (window._firestoreDb = db),
  (window._sfAppReady = Promise.resolve(app)),
  Object.assign(window, {
    db: db,
    auth: auth,
    getDoc: getDoc,
    getDocs: getDocs,
    doc: doc,
    collection: collection,
    query: query,
    where: where,
    updateDoc: updateDoc,
    setDoc: setDoc,
    addDoc: addDoc,
    deleteDoc: deleteDoc,
    deleteField: deleteField,
    serverTimestamp: serverTimestamp,
    writeBatch: writeBatch,
    orderBy: orderBy,
    limit: limit,
    onSnapshot: onSnapshot,
    getCountFromServer: getCountFromServer,
  }));
const moduleErrEl = document.getElementById("login-module-error");
function setLoginLoading(loading) {
  const btn = document.getElementById("loginSubmitBtn"),
    btnText = document.getElementById("login-btn-text");
  btn &&
    ((btn.disabled = loading),
    btnText && (btnText.textContent = loading ? "Signing in..." : "Login"),
    (btn.innerHTML = loading
      ? '<i class="fas fa-spinner fa-spin"></i> <span>Signing in...</span>'
      : '<i class="fas fa-sign-in-alt"></i> <span id="login-btn-text">Login</span>'));
}
function showLoginError(msg) {
  const box = document.getElementById("login-error-msg"),
    text = document.getElementById("login-error-text");
  box &&
    (msg
      ? ((box.style.display = "flex"),
        (box.style.alignItems = "center"),
        text && (text.textContent = msg))
      : (box.style.display = "none"));
}
(moduleErrEl && (moduleErrEl.style.display = "none"),
  (window.togglePassVis = function () {
    const inp = document.getElementById("loginPass"),
      btn = document.getElementById("pass-eye-btn");
    inp &&
      ((inp.type = "password" === inp.type ? "text" : "password"),
      btn &&
        (btn.innerHTML =
          "password" === inp.type
            ? '<i class="fas fa-eye"></i>'
            : '<i class="fas fa-eye-slash"></i>'));
  }),
  (window.doLogin = async function () {
    const rawId = (document.getElementById("loginUser")?.value || "").trim(),
      password = (document.getElementById("loginPass")?.value || "").trim();
    if (rawId)
      if (password) {
        (showLoginError(null), setLoginLoading(!0));
        try {
          const loginEmail =
              "admin" === window._loginRole && rawId.includes("@")
                ? rawId
                : rawId
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, "_") + "@stfrancis.school",
            cred = await signInWithEmailAndPassword(auth, loginEmail, password);
          try {
            const remCheck = document.getElementById("rememberMeCheck");
            remCheck && remCheck.checked
              ? localStorage.setItem("sf_remembered_id", rawId)
              : localStorage.removeItem("sf_remembered_id");
          } catch (e) {}
          await _handleAuthUser(cred.user);
        } catch (err) {
          console.error("Login error:", err);
          let msg = "Login failed. Check your ID and password.";
          ("auth/user-not-found" === err.code ||
          "auth/invalid-credential" === err.code ||
          "auth/invalid-email" === err.code
            ? (msg =
                "ID or password is incorrect. Contact admin if you need help.")
            : "auth/wrong-password" === err.code
              ? (msg = "Wrong password. Contact admin to reset it.")
              : "auth/too-many-requests" === err.code
                ? (msg =
                    "Too many failed attempts. Please wait a few minutes and try again.")
                : err.code && (msg = "Login failed [" + err.code + "]"),
            showLoginError(msg));
        } finally {
          setLoginLoading(!1);
        }
      } else showLoginError("Please enter your password.");
    else showLoginError("Please enter your Login ID.");
  }));
let _pendingFirstTimeUser = null,
  _ftsTimeoutId = null;
function _hideFirstTimeSetup() {
  const overlay = document.getElementById("first-time-setup-overlay");
  (overlay && (overlay.style.display = "none"),
    (_pendingFirstTimeUser = null),
    _ftsTimeoutId && (clearTimeout(_ftsTimeoutId), (_ftsTimeoutId = null)));
}
function _showFTSError(msg) {
  const box = document.getElementById("fts-error");
  box &&
    (msg
      ? ((box.innerHTML =
          '<i class="fas fa-exclamation-circle"></i><span style="flex:1">' +
          msg +
          '</span><button onclick="linkStudentAccount()" style="margin-left:8px;padding:3px 10px;background:#991b1b;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;white-space:nowrap">Try Again</button>'),
        (box.style.display = "flex"))
      : ((box.style.display = "none"), (box.innerHTML = "")));
}
((window.linkStudentAccount = async function () {
  if (!_pendingFirstTimeUser) return void _hideFirstTimeSetup();
  const input = document.getElementById("fts-student-id"),
    btn = document.getElementById("fts-link-btn"),
    sid = (input?.value || "").trim();
  if (sid) {
    (_showFTSError(null),
      btn &&
        ((btn.disabled = !0),
        (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying…')));
    try {
      const studentSnap = await getDocs(
        query(
          collection(db, "students"),
          where("studentId", "==", sid),
          limit(1),
        ),
      );
      if (studentSnap.empty)
        return void _showFTSError(
          "Student ID not found. Please check the ID or contact admin.",
        );
      const student = studentSnap.docs[0].data(),
        user = _pendingFirstTimeUser,
        existingLinkSnap = await getDocs(
          query(
            collection(db, "users"),
            where("studentId", "==", sid),
            limit(1),
          ),
        );
      if (!existingLinkSnap.empty && existingLinkSnap.docs[0].id !== user.uid)
        return void _showFTSError(
          "This Student ID is already linked to another Google account. Contact admin if this is wrong.",
        );
      await setDoc(doc(db, "users", user.uid), {
        role: "student",
        studentId: sid,
        name: student.name || user.displayName || "Student",
        email: user.email || "",
        photoURL: user.photoURL || "",
        class: student.class || "",
        loginId: sid,
        linkedAt: new Date().toISOString(),
        linkedVia: "google-self-link",
      });
      try {
        await addDoc(collection(db, "newAccountLinks"), {
          uid: user.uid,
          studentId: sid,
          name: student.name || user.displayName || "Student",
          email: user.email || "",
          class: student.class || "",
          method: "google-self-link",
          linkedAt: serverTimestamp(),
        });
      } catch (e) {
        console.warn("[FirstTimeSetup] Audit log skipped:", e.message);
      }
      (showToast("✅ Account linked! Opening your portal…"),
        _hideFirstTimeSetup(),
        setTimeout(async () => {
          try {
            await _handleAuthUser(user);
          } catch (e) {
            (console.error(
              "[FTS] _handleAuthUser failed, reloading:",
              e.message,
            ),
              window.location.reload());
          }
        }, 400));
    } catch (e) {
      (console.error("[FirstTimeSetup] Link failed:", e),
        _showFTSError(
          "Could not link account: " + (e.message || "Unknown error."),
        ));
    } finally {
      btn &&
        ((btn.disabled = !1),
        (btn.innerHTML = '<i class="fas fa-link"></i> Link My Account'));
    }
  } else _showFTSError("Please enter your Student ID.");
}),
  (window.cancelFirstTimeSetup = async function () {
    if (_pendingFirstTimeUser)
      try {
        const { signOut: signOut } =
          await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js");
        await signOut(auth).catch(() => {});
      } catch (e) {}
    (_hideFirstTimeSetup(), showToast("Sign-in cancelled."));
  }),
  (window.doGoogleLogin = async function () {
    showLoginError(null);
    const btn = document.getElementById("googleSignInBtn"),
      label = document.getElementById("google-btn-text");
    (btn &&
      ((btn.disabled = !0),
      (btn.style.opacity = "0.7"),
      (btn.style.cursor = "wait")),
      label && (label.textContent = "Opening Google…"));
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const cred = await signInWithPopup(auth, provider);
      await _handleAuthUser(cred.user);
    } catch (err) {
      console.error("Google sign-in error:", err);
      let msg = "Google sign-in failed. Please try again.";
      ("auth/popup-closed-by-user" === err.code
        ? (msg = "Sign-in cancelled.")
        : "auth/popup-blocked" === err.code
          ? (msg = "Popup blocked — please allow popups for this site.")
          : "auth/cancelled-popup-request" === err.code
            ? (msg = "Another sign-in is already in progress.")
            : "auth/account-exists-with-different-credential" === err.code &&
              (msg =
                "This email is registered with a different sign-in method."),
        showLoginError(msg));
    } finally {
      (btn &&
        ((btn.disabled = !1),
        (btn.style.opacity = "1"),
        (btn.style.cursor = "pointer")),
        label && (label.textContent = "Continue with Google"));
    }
  }));
let _authHandling = !1;
async function _handleAuthUser(user) {
  if (!_authHandling) {
    _authHandling = !0;
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) {
        if (
          (user.providerData || []).some(
            (p) => p && "google.com" === p.providerId,
          )
        )
          return void (function (user) {
            ((_pendingFirstTimeUser = user),
              _ftsTimeoutId && clearTimeout(_ftsTimeoutId),
              (_ftsTimeoutId = setTimeout(() => {
                _pendingFirstTimeUser &&
                  _showFTSError(
                    "Taking too long? Try signing in again or contact admin.",
                  );
              }, 12e4)));
            const photo = user.photoURL || "",
              name = user.displayName || "Student",
              email = user.email || "",
              photoEl = document.getElementById("fts-user-photo"),
              nameEl = document.getElementById("fts-user-name"),
              emailEl = document.getElementById("fts-user-email");
            (photoEl &&
              (photo
                ? (photoEl.innerHTML =
                    '<img src="' +
                    photo +
                    '" alt="" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover">')
                : (photoEl.textContent = (
                    name.charAt(0) || "S"
                  ).toUpperCase())),
              nameEl && (nameEl.textContent = name),
              emailEl && (emailEl.textContent = email),
              _showFTSError(null));
            const input = document.getElementById("fts-student-id");
            input && ((input.value = ""), setTimeout(() => input.focus(), 250));
            const overlay = document.getElementById("first-time-setup-overlay");
            overlay && (overlay.style.display = "flex");
          })(user);
        const { signOut: signOut } =
          await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js");
        return (
          await signOut(auth).catch(() => {}),
          void showLoginError(
            "Your account is not set up yet. Contact the school administrator.",
          )
        );
      }
      const rawRole = (userDoc.data().role || "")
          .toString()
          .trim()
          .toLowerCase(),
        role = "office_staff" === rawRole ? "office" : rawRole;
      if (!["student", "teacher", "admin", "office"].includes(role))
        return void showLoginError("Invalid role. Contact admin.");
      (showToast("✅ Welcome! Opening your portal…"),
        setTimeout(async () => {
          if (
            (loginAs(role),
            (window._currentUserRole = role),
            window._hideAuthOverlay && window._hideAuthOverlay(),
            "student" === role)
          ) {
            if ((await loadStudentProfile(user), window.detectAndLoadSiblings))
              try {
                await window.detectAndLoadSiblings(user);
              } catch (e) {
                console.warn("[SiblingSystem] init failed:", e.message);
              }
            window.loadStudentNotificationCenter &&
              window
                .loadStudentNotificationCenter(user)
                .catch((e) =>
                  console.warn("[NotificationCenter] fetch failed:", e.message),
                );
          }
          ("teacher" === role && (await loadTeacherPortal(user)),
            "office" === role &&
              window.loadOfficePortal &&
              (await window.loadOfficePortal(user)),
            "admin" === role &&
              setTimeout(() => {
                window.loadAdminDashboardStats &&
                  window.loadAdminDashboardStats();
              }, 800));
        }, 400));
    } finally {
      _authHandling = !1;
    }
  }
}
((window.firebaseLogin = window.doLogin),
  (window.sendPasswordReset = async function () {
    const email = (document.getElementById("login-email")?.value || "").trim();
    if (email)
      try {
        const { sendPasswordResetEmail: sendPasswordResetEmail } =
          await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js");
        (await sendPasswordResetEmail(auth, email),
          showToast("✅ Password reset email sent. Check your inbox."));
      } catch (e) {
        showLoginError(
          "auth/user-not-found" === e.code
            ? "No account found for that email."
            : e.message,
        );
      }
    else showLoginError("Enter your email address above first.");
  }),
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        await _handleAuthUser(user);
      } catch (e) {
        console.warn("Session restore:", e.message);
      }
      !(async function (uid) {
        try {
          const messaging = getMessaging(app);
          if ("granted" !== (await Notification.requestPermission())) return;
          const token = await getToken(messaging, {
            vapidKey:
              "BEtmfoNL9kNnmzpHG0lckLDQk_-RBGC2ajS3OEo0khvHvDLkXvA4ol54KU3pBVJu3EoQwwfjbc-ccwMzQhXCGhA",
          });
          token &&
            (await updateDoc(doc(db, "users", uid), { fcmToken: token }),
            console.log("[FCM] token saved"));
        } catch (e) {
          console.warn("[FCM] registration skipped:", e.message);
        }
      })(user.uid);
    } else {
      window._officePortalLoaded = !1;
      try {
        localStorage.removeItem("sf_session_role");
      } catch (e) {}
      window._hideAuthOverlay && window._hideAuthOverlay();
    }
  }),
  (window._loginRole = "student"));
const _origSetRole = window.setRole;
async function loadHomeStats() {
  try {
    const [sCount, tCount] = await Promise.all([
        getCountFromServer(collection(db, "students")),
        getCountFromServer(collection(db, "teachers")),
      ]),
      sEl = document.getElementById("home-stat-students"),
      tEl = document.getElementById("home-stat-teachers");
    (sEl &&
      sCount.data().count > 0 &&
      (sEl.textContent = sCount.data().count.toLocaleString("en-IN") + "+"),
      tEl &&
        tCount.data().count > 0 &&
        (tEl.textContent = tCount.data().count.toLocaleString("en-IN") + "+"));
  } catch (e) {}
}
async function loadHomeTicker() {
  try {
    const snap = await getDocs(
      query(
        collection(db, "announcements"),
        orderBy("priority", "desc"),
        limit(20),
      ),
    );
    if (snap.empty) return;
    const today = new Date().toISOString().split("T")[0],
      items = snap.docs
        .map((d) => d.data())
        .filter(
          (a) =>
            (!a.activeTo || a.activeTo >= today) &&
            (!a.activeFrom || a.activeFrom <= today),
        );
    if (0 === items.length) return;
    const ticker = document.getElementById("home-ticker-content");
    ticker &&
      (ticker.innerHTML = items
        .map((a) => `<span>${pur(a.text || a.title)}</span>`)
        .join(""));
  } catch (e) {}
}
function isPermissionError(e) {
  return (
    e &&
    ("permission-denied" === e.code ||
      (e.message && e.message.toLowerCase().includes("permission")))
  );
}
function permissionErrorHtml(collection) {
  return `<div style="background:#fff3cd;border:1.5px solid #ffc107;border-radius:10px;padding:16px 20px;display:flex;gap:12px;align-items:flex-start">\n      <i class="fas fa-exclamation-triangle" style="color:#e67e22;font-size:1.3rem;margin-top:2px;flex-shrink:0"></i>\n      <div>\n        <strong style="color:#856404;display:block;margin-bottom:4px">Firebase Rules Block: "${collection}"</strong>\n        <p style="font-size:13px;color:#856404;margin:0 0 10px">Your Firestore Security Rules are blocking this request. Fix it in 3 steps:</p>\n        <ol style="font-size:13px;color:#856404;margin:0;padding-left:18px;line-height:1.8">\n          <li>Open <a href="https://console.firebase.google.com" target="_blank" style="color:#1a4a8a;font-weight:700">console.firebase.google.com</a></li>\n          <li>Go to <strong>Firestore Database → Rules</strong></li>\n          <li>Paste the rules from the <strong>firestore.rules</strong> file provided and click <strong>Publish</strong></li>\n        </ol>\n        <p style="font-size:12px;color:#856404;margin:10px 0 0">For Storage errors: Go to <strong>Storage → Rules</strong> and paste from <strong>storage.rules</strong> file.</p>\n      </div>\n    </div>`;
}
async function loadAdmissionNotice() {
  try {
    const snap = await getDocs(
      query(collection(db, "settings"), where("key", "==", "admissionNotice")),
    );
    if (!snap.empty) {
      const notice = snap.docs[0].data().value,
        box = document.getElementById("admission-notice-box");
      box &&
        notice &&
        ((box.innerHTML =
          '<i class="fas fa-info-circle" style="margin-right:8px"></i>' +
          pur(notice)),
        (box.style.display = "block"));
      const adminEl = document.getElementById("adm-public-notice");
      adminEl && (adminEl.value = notice);
    }
  } catch (e) {}
}
async function _uploadAdmissionDoc(file, folder, label) {
  if (!file) return null;
  throw new Error(
    "File uploads not supported. Submit hard copies of documents at the school office.",
  );
}
function renderGalleryGrid(items) {
  const grid = document.getElementById("public-gallery-grid");
  grid &&
    items.length &&
    (grid.innerHTML = items
      .map(
        (g) =>
          `\n      <div class="gallery-item" style="background:#e8ddd0;cursor:pointer" onclick="openGalleryLightbox('${g.url}','${g.label.replace(/'/g, "\\'")}')" data-cat="${g.category || ""}">\n        <img src="${g.url}" alt="${g.label}" style="width:100%;height:100%;object-fit:cover" loading="lazy" onerror="this.style.display='none'">\n        <div class="gallery-label">${g.label}</div>\n        ${g.category ? `<div style="position:absolute;top:8px;left:8px;background:rgba(139,111,71,.85);color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px">${g.category}</div>` : ""}\n      </div>`,
      )
      .join(""));
}
((window.setRole = function (role, btn) {
  (_origSetRole(role, btn), (window._loginRole = role));
  const label = document.getElementById("login-user-label"),
    hintTxt = document.getElementById("login-hint-text"),
    input = document.getElementById("loginUser");
  (showLoginError(null),
    "teacher" === role
      ? (label && (label.textContent = "Teacher Login ID"),
        hintTxt &&
          (hintTxt.textContent =
            "Enter your Teacher Login ID (e.g. SFST007) and the password set by the admin."),
        input &&
          ((input.placeholder = "e.g. SFST007"),
          (input.style.textTransform = "uppercase")))
      : "student" === role
        ? (label && (label.textContent = "Student ID"),
          hintTxt &&
            (hintTxt.textContent =
              "Enter your Student ID (e.g. SFS/2025/001) and the password set by the admin."),
          input &&
            ((input.placeholder = "e.g. SFS/2025/001"),
            (input.style.textTransform = "none")))
        : "office" === role
          ? (label && (label.textContent = "Office Staff ID"),
            hintTxt &&
              (hintTxt.textContent =
                "Enter your Office Staff Login ID and the password set by the admin."),
            input &&
              ((input.placeholder = "e.g. SFSO001"),
              (input.style.textTransform = "uppercase")))
          : (label && (label.textContent = "Admin Email"),
            hintTxt &&
              (hintTxt.textContent =
                "Enter your administrator email address and password."),
            input &&
              ((input.placeholder = "admin@school.com"),
              (input.style.textTransform = "none"))));
}),
  (window.loadPublicStaff = async function () {
    const grid = document.getElementById("public-staff-grid"),
      leaderGrid = document.getElementById("leadership-grid");
    if (grid) {
      grid.innerHTML =
        '<div style="grid-column:1/-1;text-align:center;padding:28px;color:var(--text-light)"><i class="fas fa-spinner fa-spin" style="font-size:1.5rem"></i></div>';
      try {
        const snap = await getDocs(
          query(collection(db, "teachers"), orderBy("teacherId")),
        );
        if (snap.empty)
          return (
            (grid.innerHTML =
              '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-light)">No staff data available.</div>'),
            void (leaderGrid && (leaderGrid.innerHTML = ""))
          );
        const classLabel = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
          getClsLabel = (c) => classLabel[c] || (c ? "Class " + c : ""),
          leaderIds = {
            SFST001: { role: "Headmistress", title: "Sr." },
            SFST002: { role: "Asst. Headmistress", title: "Mr." },
          },
          leaders = [],
          others = [];
        snap.docs.forEach((d) => {
          const t = d.data();
          leaderIds[t.teacherId]
            ? leaders.push({
                t: t,
                role: leaderIds[t.teacherId].role,
                titleOverride: leaderIds[t.teacherId].title,
              })
            : others.push(d);
        });
        const principalData = leaders.find((l) => l.t.teacherId === "SFST001");
        if (principalData && principalData.t.photoURL) {
          const pp = document.getElementById("principal-photo"),
            pi = document.getElementById("principal-icon");
          if (pp) {
            pp.src = principalData.t.photoURL;
            pp.style.display = "block";
            pi && (pi.style.display = "none");
          }
        }
        (leaderGrid &&
          (leaderGrid.innerHTML = leaders.length
            ? leaders
                .map(({ t: t, role: role, titleOverride: titleOverride }) =>
                  (function (t, role, titleOverride) {
                    return `<div class="staff-card">${t.photoURL ? `<img src="${t.photoURL}" alt="${t.name}" class="staff-avatar-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="staff-avatar" style="display:none"><i class="fas fa-user"></i></div>` : '<div class="staff-avatar"><i class="fas fa-user-tie"></i></div>'}<div class="staff-name">${titleOverride ? titleOverride + " " : t.title && "Sir" !== t.title ? t.title + " " : "M" === t.gender ? "Mr. " : "Ms. "}${t.name}</div><div class="staff-role">${role}</div><div class="staff-desc">${t.qualification || ""} ${t.experience ? "· " + t.experience + " years exp." : ""}</div></div>`;
                  })(t, role, titleOverride),
                )
                .join("")
            : '<div style="grid-column:1/-1;text-align:center;padding:12px;color:var(--text-light)">No leadership data.</div>'),
          (grid.innerHTML = others
            .map((d) => {
              const t = d.data(),
                cls = t.classTeacher
                  ? ` · CT: ${getClsLabel(t.classTeacher)}`
                  : "",
                titleStr =
                  t.title && "Sir" !== t.title
                    ? t.title + " "
                    : "M" === t.gender
                      ? "Mr. "
                      : "Ms. ";
              return `<div class="staff-card">${t.photoURL ? `<img src="${t.photoURL}" alt="${t.name}" class="staff-avatar-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="staff-avatar" style="display:none"><i class="fas fa-user"></i></div>` : '<div class="staff-avatar"><i class="fas fa-user"></i></div>'}<div class="staff-name">${titleStr}${t.name}</div><div class="staff-role">${t.subjects || "Teacher"}${cls}</div><div class="staff-desc">${t.qualification || ""} ${t.experience ? "· " + t.experience + " years exp." : ""}</div></div>`;
            })
            .join("")));
      } catch (e) {
        grid.innerHTML = isPermissionError(e)
          ? permissionErrorHtml("teachers")
          : `<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--danger)">❌ ${e.message}</div>`;
      }
    }
  }),
  (window.loadPublicNotices = async function () {
    const el = document.getElementById("public-notices-list");
    if (el) {
      el.innerHTML =
        '<div style="text-align:center;padding:24px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i></div>';
      try {
        const notices = [
          ...(await getDocs(query(collection(db, "notices"), limit(30)))).docs,
        ]
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((n) => {
            const aud = (n.audience || "all").toLowerCase();
            return (
              "all" === aud ||
              "students" === aud ||
              "both" === aud ||
              "parents" === aud
            );
          })
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
        if (!notices.length)
          return void (el.innerHTML =
            '<div style="text-align:center;padding:24px;color:var(--text-light)">No public notices at this time.</div>');
        const icon = (p) =>
            "Urgent" === p
              ? "fa-exclamation-circle"
              : "Important" === p
                ? "fa-bell"
                : "fa-info-circle",
          bc = (p) =>
            "Urgent" === p
              ? "badge-danger"
              : "Important" === p
                ? "badge-warning"
                : "badge-info";
        el.innerHTML = notices
          .map((n) => {
            const fmt = n.postedAt
              ? new Date(n.postedAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
              : "—";
            return `<div class="notice-card">\n          <div class="notice-icon"><i class="fas ${icon(n.priority)}"></i></div>\n          <div>\n            <div class="notice-title">${pur(n.title)}</div>\n            <div class="notice-date">📅 ${fmt} &nbsp;|&nbsp; <span class="badge ${bc(n.priority)}">${n.priority || "Normal"}</span></div>\n            <div class="notice-body">${pur(n.body)}</div>\n          </div>\n        </div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = isPermissionError(e)
          ? permissionErrorHtml("notices")
          : `<div style="color:var(--danger);padding:16px">❌ ${e.message}</div>`;
      }
    }
  }),
  (window.loadPublicEvents = async function () {
    const grid = document.getElementById("public-events-grid");
    if (grid)
      try {
        const snap = await getDocs(query(collection(db, "events"), limit(20)));
        if (snap.empty) return;
        const evts = [...snap.docs]
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.date || "").localeCompare(b.date || "")),
          bc = (s) =>
            "Important" === s || "Exam" === s
              ? "badge-danger"
              : "Upcoming" === s
                ? "badge-warning"
                : "Open to All" === s
                  ? "badge-success"
                  : "badge-info";
        grid.innerHTML = evts
          .map((ev) => {
            const d = ev.date ? new Date(ev.date + "T00:00:00") : null;
            return `<div class="event-card">\n          <div class="event-date-box"><div class="event-day">${d ? d.getDate() : "—"}</div><div class="event-month">${d ? d.toLocaleString("en", { month: "short" }).toUpperCase() : "—"}</div></div>\n          <div class="event-info">\n            <h4>${ev.title}</h4>\n            <p><i class="fas fa-clock" style="color:var(--accent);font-size:12px"></i> ${ev.time || "TBA"} ${ev.venue ? "— " + ev.venue : ""}</p>\n            ${ev.description ? `<p style="margin-top:6px;font-size:13px;color:var(--text-light)">${ev.description}</p>` : ""}\n            <p style="margin-top:8px"><span class="badge ${bc(ev.status)}">${ev.status || "Upcoming"}</span></p>\n          </div>\n        </div>`;
          })
          .join("");
        const homeGrid = document.getElementById("home-events-grid");
        if (homeGrid) {
          const homeEvts = evts
            .filter((ev) => "no" !== ev.homepage)
            .slice(0, 4);
          homeEvts.length > 0 &&
            (homeGrid.innerHTML = homeEvts
              .map((ev) => {
                const d = ev.date ? new Date(ev.date + "T00:00:00") : null;
                return `<div class="event-card">\n              <div class="event-date-box"><div class="event-day">${d ? d.getDate() : "—"}</div><div class="event-month">${d ? d.toLocaleString("en", { month: "short" }).toUpperCase() : "—"}</div></div>\n              <div class="event-info"><h4>${ev.title}</h4><p><i class="fas fa-clock" style="color:var(--accent);font-size:12px"></i> ${ev.time || "TBA"} ${ev.venue ? "— " + ev.venue : ""}</p>${ev.description ? `<p style="margin-top:6px;font-size:13px;color:var(--text-light)">${ev.description}</p>` : ""}</div>\n            </div>`;
              })
              .join(""));
        }
      } catch (e) {}
  }),
  (window.handleApplyClick = async function () {
    try {
      const snap = await getDocs(
        query(collection(db, "settings"), where("key", "==", "admissionLink")),
      );
      if (!snap.empty) {
        const link = snap.docs[0].data().value;
        if (link && link.startsWith("http"))
          return void window.open(link, "_blank");
      }
    } catch (e) {}
    showPage("admission");
  }),
  (window.submitContactMessage = async function () {
    const name = (document.getElementById("contact-name")?.value || "").trim(),
      email = (document.getElementById("contact-email")?.value || "").trim(),
      subject = (
        document.getElementById("contact-subject")?.value || ""
      ).trim(),
      message = (
        document.getElementById("contact-message")?.value || ""
      ).trim();
    if (name && message)
      try {
        (await addDoc(collection(db, "contacts"), {
          name: name,
          email: email,
          subject: subject,
          message: message,
          status: "Unread",
          createdAt: new Date().toISOString(),
        }),
          (document.getElementById("contact-name").value = ""),
          (document.getElementById("contact-email").value = ""),
          (document.getElementById("contact-subject").value = ""),
          (document.getElementById("contact-message").value = ""),
          showToast("✅ Message sent! We will get back to you shortly."));
      } catch (e) {
        showToast("❌ Could not send: " + e.message);
      }
    else showToast("⚠️ Please enter your name and message.");
  }),
  (window.sendStudentMessage = async function () {
    const to = (document.getElementById("s-contact-to")?.value || "").trim(),
      subject = (
        document.getElementById("s-contact-subject")?.value || ""
      ).trim(),
      message = (
        document.getElementById("s-contact-message")?.value || ""
      ).trim();
    if (message)
      try {
        (await addDoc(collection(db, "student_messages"), {
          to: to,
          subject: subject || "(No subject)",
          message: message,
          studentId: window._studentId || "",
          studentName: window._studentName || "",
          studentClass: window._studentClass || "",
          status: "Unread",
          createdAt: new Date().toISOString(),
        }),
          (document.getElementById("s-contact-subject").value = ""),
          (document.getElementById("s-contact-message").value = ""),
          showToast("✅ Message sent to the administration."));
      } catch (e) {
        showToast("❌ Could not send: " + e.message);
      }
    else showToast("⚠️ Please write a message before sending.");
  }),
  (window.submitAdmissionForm = async function () {
    const getVal = (id) => (document.getElementById(id)?.value || "").trim(),
      getFile = (id) => document.getElementById(id)?.files?.[0] || null,
      studentName = getVal("adm-student-name"),
      dob = getVal("adm-dob"),
      cls = getVal("adm-class"),
      parentName = getVal("adm-parent-name"),
      contact = getVal("adm-contact"),
      address = getVal("adm-address");
    if (!(studentName && dob && cls && parentName && contact && address))
      return void showToast("⚠️ Please fill in all required fields (*).");
    const father = {
        name: getVal("adm-father-name"),
        occupation: getVal("adm-father-occupation"),
        contact: getVal("adm-father-contact"),
      },
      mother = {
        name: getVal("adm-mother-name"),
        occupation: getVal("adm-mother-occupation"),
        contact: getVal("adm-mother-contact"),
      },
      photoFile = getFile("adm-doc-photo"),
      birthFile = getFile("adm-doc-birth"),
      marksheetFile = getFile("adm-doc-marksheet"),
      btn = document.querySelector("#page-admission .btn-primary");
    btn &&
      ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…'),
      (btn.disabled = !0));
    try {
      (studentName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase(), Date.now());
      const [photoDoc, birthDoc, marksheetDoc] = await Promise.all([
          _uploadAdmissionDoc(photoFile),
          _uploadAdmissionDoc(birthFile),
          _uploadAdmissionDoc(marksheetFile),
        ]),
        documents = [photoDoc, birthDoc, marksheetDoc].filter(Boolean);
      (btn &&
        (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…'),
        await addDoc(collection(db, "admissions"), {
          studentName: studentName,
          fullName: studentName,
          dob: dob,
          class: cls,
          classApplied: cls,
          year: getVal("adm-year") || "2025–26",
          gender: getVal("adm-gender"),
          parentName: parentName,
          relation: getVal("adm-relation"),
          contact: contact,
          email: getVal("adm-email"),
          address: address,
          previousSchool: getVal("adm-prev-school"),
          medical: getVal("adm-medical"),
          father: father,
          mother: mother,
          documents: documents,
          status: "pending",
          submittedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }),
        [
          "adm-student-name",
          "adm-dob",
          "adm-parent-name",
          "adm-contact",
          "adm-email",
          "adm-address",
          "adm-prev-school",
          "adm-medical",
          "adm-father-name",
          "adm-father-occupation",
          "adm-father-contact",
          "adm-mother-name",
          "adm-mother-occupation",
          "adm-mother-contact",
          "adm-doc-photo",
          "adm-doc-birth",
          "adm-doc-marksheet",
        ].forEach((id) => {
          const el = document.getElementById(id);
          el && (el.value = "");
        }),
        showToast(
          "✅ Application submitted! Our team will contact you within 3 working days.",
        ),
        showPage("home"));
    } catch (e) {
      (console.error("[Admission] submit failed:", e),
        showToast("❌ Submission failed: " + e.message));
    } finally {
      btn &&
        ((btn.innerHTML =
          '<i class="fas fa-paper-plane"></i> Submit Application'),
        (btn.disabled = !1));
    }
  }),
  (window.addEvent = async function () {
    const title = (document.getElementById("ev-title")?.value || "").trim(),
      date = document.getElementById("ev-date")?.value || "",
      time = (document.getElementById("ev-time")?.value || "").trim(),
      venue = (document.getElementById("ev-venue")?.value || "").trim(),
      desc = (document.getElementById("ev-desc")?.value || "").trim(),
      status = document.getElementById("ev-status")?.value || "Upcoming",
      homepage = document.getElementById("ev-homepage")?.value || "yes";
    if (title && date)
      try {
        (await addDoc(collection(db, "events"), {
          title: title,
          date: date,
          time: time,
          venue: venue,
          description: desc,
          status: status,
          homepage: homepage,
          createdAt: new Date().toISOString(),
        }),
          ["ev-title", "ev-time", "ev-venue", "ev-desc"].forEach((id) => {
            const el = document.getElementById(id);
            el && (el.value = "");
          }),
          showToast("✅ Event saved!"),
          loadAdminEvents(),
          loadPublicEvents());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Title and Date are required.");
  }),
  (window.loadAdminEvents = async function () {
    const el = document.getElementById("admin-events-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
      try {
        const snap = await getDocs(query(collection(db, "events"), limit(30)));
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No events yet.</p>');
        const sorted = [...snap.docs].sort((a, b) =>
          (a.data().date || "").localeCompare(b.data().date || ""),
        );
        el.innerHTML = sorted
          .map((d) => {
            const ev = d.data(),
              fmt = ev.date
                ? new Date(ev.date + "T00:00:00").toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—";
            return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px">\n          <div><div style="font-weight:700;color:var(--accent-dark)">${ev.title}</div>\n          <div style="font-size:12px;color:var(--text-light);margin-top:3px">${fmt} ${ev.time ? "· " + ev.time : ""} ${ev.venue ? "· " + ev.venue : ""}</div>\n          ${ev.description ? `<div style="font-size:12px;font-style:italic;color:var(--text-light)">${ev.description.slice(0, 60)}…</div>` : ""}\n          <span class="badge badge-info" style="margin-top:4px">${ev.status}</span> ${"yes" === ev.homepage ? '<span class="badge badge-success" style="margin-left:4px">Homepage</span>' : ""}</div>\n          <button onclick="deleteEvent('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button>\n        </div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }),
  (window.deleteEvent = async function (docId) {
    if (confirm("Delete this event?"))
      try {
        (await deleteDoc(doc(db, "events", docId)),
          showToast("🗑️ Event deleted."),
          loadAdminEvents(),
          loadPublicEvents());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.addAnnouncement = async function () {
    const text = (document.getElementById("ann-text")?.value || "").trim(),
      from = document.getElementById("ann-from")?.value || "",
      to = document.getElementById("ann-to")?.value || "",
      priority = document.getElementById("ann-priority")?.value || "Normal";
    if (text)
      try {
        (await addDoc(collection(db, "announcements"), {
          text: text,
          activeFrom: from,
          activeTo: to,
          priority: priority,
          createdAt: new Date().toISOString(),
        }),
          (document.getElementById("ann-text").value = ""),
          showToast("✅ Announcement added! Homepage ticker updated."),
          loadAdminAnnouncements(),
          loadHomeTicker());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Announcement text is required.");
  }),
  (window.loadAdminAnnouncements = async function () {
    const el = document.getElementById("admin-announcements-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
      try {
        const snap = await getDocs(
          query(collection(db, "announcements"), limit(30)),
        );
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No announcements yet.</p>');
        const sorted = [...snap.docs].sort((a, b) =>
          (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
        );
        el.innerHTML = sorted
          .map((d) => {
            const a = d.data();
            return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:center;gap:8px">\n          <div>\n            <div style="font-size:14px;color:var(--text)">${pur(a.text)}</div>\n            <div style="font-size:11px;color:var(--text-light);margin-top:3px">${a.activeFrom ? "From: " + a.activeFrom : ""} ${a.activeTo ? "Until: " + a.activeTo : ""} · <span class="badge ${"High" === a.priority ? "badge-danger" : "badge-info"}">${a.priority}</span></div>\n          </div>\n          <button onclick="deleteAnnouncement('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer;flex-shrink:0"><i class="fas fa-trash"></i></button>\n        </div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }),
  (window.deleteAnnouncement = async function (docId) {
    if (confirm("Delete this announcement?"))
      try {
        (await deleteDoc(doc(db, "announcements", docId)),
          showToast("🗑️ Announcement deleted."),
          loadAdminAnnouncements(),
          loadHomeTicker());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (function () {
    try {
      const cn = localStorage.getItem("sf_cloudinary_name"),
        cp = localStorage.getItem("sf_cloudinary_preset");
      if (cn) {
        const el = document.getElementById("cloudinary-cloud-name");
        el && (el.value = cn);
      }
      if (cp) {
        const el = document.getElementById("cloudinary-preset");
        el && (el.value = cp);
      }
      if (cn && cp) {
        const badge = document.getElementById("cloudinary-status-badge");
        badge && (badge.style.display = "inline");
      }
    } catch (e) {}
  })(),
  (window.saveCloudinaryConfig = function () {
    showToast("ℹ️ Uploads now use Firebase Storage.");
  }),
  (window.previewGalleryFile = function (input) {
    const file = input.files[0];
    if (!file) return;
    const preview = document.getElementById("gal-preview");
    if (!preview) return;
    const reader = new FileReader();
    ((reader.onload = (e) => {
      preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:10px">`;
    }),
      reader.readAsDataURL(file));
  }),
  (window.previewGalleryImage = function () {
    const url = (document.getElementById("gal-url")?.value || "").trim(),
      preview = document.getElementById("gal-preview");
    preview &&
      url &&
      (preview.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" onerror="this.parentElement.innerHTML='<i class='fas fa-exclamation-triangle'></i><p>Invalid URL</p>'">`);
  }),
  (window.uploadGalleryImage = async function () {
    const label = (document.getElementById("gal-label")?.value || "").trim(),
      category = document.getElementById("gal-category")?.value || "Events",
      isPublic = document.getElementById("gal-public")?.value || "yes",
      file = document.getElementById("gal-file")?.files[0],
      manualUrl = (document.getElementById("gal-url")?.value || "").trim();
    if (!label) return void showToast("⚠️ Please enter a caption/label.");
    if (!file && !manualUrl)
      return void showToast("⚠️ Please select an image file or paste a URL.");
    const btn = document.getElementById("gal-upload-btn"),
      progressBox = document.getElementById("gal-upload-progress"),
      progressBar = document.getElementById("gal-progress-bar"),
      progressText = document.getElementById("gal-progress-text");
    btn &&
      ((btn.disabled = !0),
      (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…'));
    try {
      let imageUrl = manualUrl;
      if (file && !manualUrl) {
        if (file.size > 10485760)
          return void showToast("⚠️ Image must be under 10MB.");
        (progressBox && (progressBox.style.display = "block"),
          progressBar && (progressBar.style.width = "5%"),
          progressText &&
            (progressText.textContent = "Uploading to Cloudinary…"));
        const _gRef = storageRef(
          storage,
          `gallery/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        );
        const _gTask = uploadBytesResumable(_gRef, file);
        ((imageUrl = await new Promise((resolve, reject) => {
          _gTask.on(
            "state_changed",
            (snap) => {
              const pct =
                Math.round((snap.bytesTransferred / snap.totalBytes) * 90) + 5;
              (progressBar && (progressBar.style.width = pct + "%"),
                progressText &&
                  (progressText.textContent = `Uploading… ${pct}%`));
            },
            reject,
            () =>
              getDownloadURL(_gTask.snapshot.ref).then((url) => {
                (progressBar && (progressBar.style.width = "100%"),
                  progressText &&
                    (progressText.textContent = "Upload complete!"),
                  resolve(url));
              }),
          );
        })),
          setTimeout(() => {
            (progressBox && (progressBox.style.display = "none"),
              progressBar && (progressBar.style.width = "0%"));
          }, 1200));
      }
      (await addDoc(collection(db, "gallery"), {
        label: label,
        url: imageUrl,
        category: category,
        public: isPublic,
        createdAt: new Date().toISOString(),
      }),
        (document.getElementById("gal-label").value = ""),
        (document.getElementById("gal-url").value = ""));
      const fi = document.getElementById("gal-file");
      fi && (fi.value = "");
      const pv = document.getElementById("gal-preview");
      (pv &&
        (pv.innerHTML =
          '<i class="fas fa-image" style="font-size:2rem;color:var(--text-light);opacity:.4"></i>'),
        showToast("✅ Image uploaded and saved to gallery!"),
        loadAdminGallery(),
        loadPublicGallery());
    } catch (e) {
      (console.error("Gallery upload error:", e),
        showToast("❌ Upload failed: " + e.message));
    } finally {
      btn &&
        ((btn.disabled = !1),
        (btn.innerHTML =
          '<i class="fas fa-upload"></i> Upload &amp; Save to Gallery'));
    }
  }),
  (window.loadAdminGallery = async function () {
    const el = document.getElementById("admin-gallery-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
      try {
        const snap = await getDocs(query(collection(db, "gallery"), limit(60)));
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No images yet. Upload one above.</p>');
        const sorted = [...snap.docs].sort((a, b) =>
          (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
        );
        el.innerHTML =
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px">' +
          sorted
            .map((d) => {
              const g = d.data();
              return `<div style="border-radius:10px;overflow:hidden;background:var(--bg);position:relative;border:1.5px solid var(--primary)">\n            <img src="${g.url}" alt="${g.label}" style="width:100%;aspect-ratio:4/3;object-fit:cover" onerror="this.style.display='none'">\n            <div style="padding:8px 10px;font-size:12px;font-weight:700;color:var(--accent-dark)">${g.label}</div>\n            <div style="padding:0 10px 8px;font-size:11px;color:var(--text-light)">${g.category || "–"} · ${"yes" === g.public ? '<span style="color:var(--success)">Public</span>' : '<span style="color:var(--danger)">Private</span>'}</div>\n            <button onclick="deleteGalleryImage('${d.id}')" style="position:absolute;top:6px;right:6px;background:rgba(220,53,69,0.85);border:none;color:#fff;border-radius:6px;padding:3px 7px;cursor:pointer;font-size:12px"><i class="fas fa-trash"></i></button>\n          </div>`;
            })
            .join("") +
          "</div>";
      } catch (e) {
        el.innerHTML = isPermissionError(e)
          ? permissionErrorHtml("gallery")
          : `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }),
  (window.deleteGalleryImage = async function (docId) {
    if (confirm("Delete this image from gallery?"))
      try {
        (await deleteDoc(doc(db, "gallery", docId)),
          showToast("🗑️ Image deleted."),
          loadAdminGallery(),
          loadPublicGallery());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window._galleryItems = []),
  (window.loadPublicGallery = async function () {
    if (document.getElementById("public-gallery-grid"))
      try {
        const snap = await getDocs(
          query(
            collection(db, "gallery"),
            where("public", "==", "yes"),
            limit(60),
          ),
        );
        if (snap.empty) return;
        ((window._galleryItems = [...snap.docs].map((d) => ({
          id: d.id,
          ...d.data(),
        }))),
          renderGalleryGrid(window._galleryItems));
      } catch (e) {}
  }),
  (window.filterGallery = function (cat, btn) {
    (document.querySelectorAll(".gallery-filter-btn").forEach((b) => {
      ((b.style.background = "transparent"),
        (b.style.color = "var(--accent-dark)"),
        (b.style.borderColor = "var(--primary)"),
        (b.style.fontWeight = "600"));
    }),
      btn &&
        ((btn.style.background = "var(--accent)"),
        (btn.style.color = "#fff"),
        (btn.style.borderColor = "var(--accent)"),
        (btn.style.fontWeight = "700")));
    const items = window._galleryItems || [];
    renderGalleryGrid(
      "all" === cat ? items : items.filter((i) => i.category === cat),
    );
  }),
  (window.openGalleryLightbox = function (url, caption) {
    let lb = document.getElementById("gallery-lightbox");
    (lb ||
      ((lb = document.createElement("div")),
      (lb.id = "gallery-lightbox"),
      (lb.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:20px;cursor:pointer"),
      (lb.onclick = () => lb.remove()),
      document.body.appendChild(lb)),
      (lb.innerHTML = `\n      <button onclick="this.parentElement.remove()" style="position:absolute;top:16px;right:20px;background:none;border:none;color:#fff;font-size:1.8rem;cursor:pointer"><i class="fas fa-times"></i></button>\n      <img src="${url}" alt="${pur(caption)}" style="max-width:90vw;max-height:80vh;border-radius:10px;object-fit:contain;box-shadow:0 20px 60px rgba(0,0,0,.5)">\n      ${caption ? `<p style="color:rgba(255,255,255,.8);margin-top:14px;font-size:14px;text-align:center">${pur(caption)}</p>` : ""}`),
      (lb.style.display = "flex"));
  }));
let _pendingApproveId = null,
  _pendingApproveData = null;
async function upsertSetting(key, value) {
  const snap = await getDocs(
    query(collection(db, "settings"), where("key", "==", key)),
  );
  snap.empty
    ? await addDoc(collection(db, "settings"), {
        key: key,
        value: value,
        updatedAt: new Date().toISOString(),
      })
    : await updateDoc(doc(db, "settings", snap.docs[0].id), {
        value: value,
        updatedAt: new Date().toISOString(),
      });
}
((window.loadAdmissions = async function () {
  const tbody = document.getElementById("admin-admissions-tbody");
  if (!tbody) return;
  tbody.innerHTML =
    '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i></td></tr>';
  const filter = document.getElementById("adm-filter-status")?.value || "all";
  try {
    let q =
      "all" === filter
        ? query(collection(db, "admissions"), limit(60))
        : query(
            collection(db, "admissions"),
            where("status", "==", filter),
            limit(60),
          );
    const snap = await getDocs(q);
    if (snap.empty)
      return void (tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No applications found.</td></tr>');
    const sorted = [...snap.docs].sort((a, b) =>
      (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
    );
    ((tbody.innerHTML = sorted
      .map((d) => {
        const a = d.data(),
          bc =
            "Admitted" === a.status
              ? "badge-success"
              : "Rejected" === a.status
                ? "badge-danger"
                : "Shortlisted" === a.status
                  ? "badge-warning"
                  : "badge-info",
          fmt = a.submittedAt
            ? new Date(a.submittedAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              })
            : "—";
        return `<tr>\n          <td><strong>${a.studentName}</strong></td>\n          <td>${a.class || "—"}</td>\n          <td style="font-size:12px">${a.dob || "—"}</td>\n          <td>${a.parentName || "—"}</td>\n          <td style="font-size:12px">${a.contact || "—"}</td>\n          <td style="font-size:12px">${fmt}</td>\n          <td><span class="badge ${bc}">${a.status}</span></td>\n          <td>\n            <div style="display:flex;gap:4px;flex-wrap:wrap">\n              <button class="btn btn-sm" style="background:#3b82f6;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;white-space:nowrap" onclick="adminViewAdmission('${d.id}')"><i class="fas fa-edit"></i> View/Edit</button>\n              <button class="btn btn-sm" style="background:#475569;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;white-space:nowrap" onclick="adminPrintAdmission('${d.id}')"><i class="fas fa-print"></i> Print</button>\n              ${"Admitted" !== a.status && "Rejected" !== a.status ? `<button class="btn btn-sm" style="background:#1a6b3c;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px;white-space:nowrap" onclick="openApproveModal('${d.id}','${(a.studentName || "").replace(/'/g, "\\'")}','${a.class || ""}')"><i class="fas fa-check"></i> Approve</button>` : ""}\n              ${"Shortlisted" !== a.status ? `<button class="btn btn-sm" style="background:#1a4a8a;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:11px" onclick="updateAdmStatus('${d.id}','Shortlisted')">Shortlist</button>` : ""}\n              ${"Rejected" !== a.status ? `<button class="btn btn-sm btn-danger" style="font-size:11px;padding:4px 8px" onclick="rejectAdmission('${d.id}','${(a.studentName || "").replace(/'/g, "\\'")}')"><i class="fas fa-times"></i> Reject</button>` : ""}\n            </div>\n          </td>\n        </tr>`;
      })
      .join("")),
      (window.__adminAdmCache = {}),
      snap.docs.forEach((d) => {
        window.__adminAdmCache[d.id] = d.data();
      }));
    const countEl = document.getElementById("a-admission-count");
    countEl &&
      (countEl.textContent = snap.docs.filter(
        (d) => "Pending" === d.data().status,
      ).length);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
  }
}),
  (window.adminPrintAdmission = async function (docId) {
    if (!docId) return void showToast("⚠️ Missing application id.");
    if (!window._printAdmissionPDF)
      return void showToast("❌ Print module not loaded.");
    const cached = (window.__adminAdmCache || {})[docId];
    if (cached) window._printAdmissionPDF(cached);
    else
      try {
        const snap = await getDoc(doc(db, "admissions", docId));
        if (!snap.exists()) return void showToast("❌ Application not found.");
        window._printAdmissionPDF(snap.data());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.openApproveModal = async function (docId, name, requestedClass) {
    ((_pendingApproveId = docId),
      (_pendingApproveData = { name: name, requestedClass: requestedClass }));
    try {
      const snap = await getDoc(doc(db, "admissions", docId));
      snap.exists() &&
        (_pendingApproveData = {
          ...snap.data(),
          name: name,
          requestedClass: requestedClass,
        });
    } catch (e) {
      console.warn("[Approve] fetch admission failed:", e.message);
    }
    const overlay = document.getElementById("approve-modal-overlay"),
      nameEl = document.getElementById("approve-modal-name"),
      classEl = document.getElementById("approve-class-select");
    (nameEl && (nameEl.textContent = `Approving application for: ${name}`),
      classEl && requestedClass && (classEl.value = requestedClass),
      overlay && (overlay.style.display = "flex"));
  }),
  (window.printApproveModalAdmission = function () {
    _pendingApproveData && window._printAdmissionPDF
      ? window._printAdmissionPDF(_pendingApproveData)
      : showToast("⚠️ No application loaded.");
  }),
  (window.closeApproveModal = function () {
    const overlay = document.getElementById("approve-modal-overlay");
    (overlay && (overlay.style.display = "none"),
      (_pendingApproveId = null),
      (_pendingApproveData = null));
  }),
  (window.confirmApproveAdmission = async function () {
    if (!_pendingApproveId) return;
    const assignedClass = document.getElementById(
        "approve-class-select",
      )?.value,
      section = document.getElementById("approve-section-select")?.value || "A",
      prefix = (document.getElementById("approve-id-prefix")?.value || "SFS")
        .trim()
        .toUpperCase();
    if (!assignedClass)
      return void showToast("⚠️ Please select a class/section.");
    const btn = document.querySelector("#approve-modal-overlay .btn-primary");
    btn &&
      ((btn.disabled = !0),
      (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'));
    try {
      const admDoc = await getDoc(doc(db, "admissions", _pendingApproveId));
      if (!admDoc.exists()) return void showToast("❌ Application not found.");
      const adm = admDoc.data(),
        year = new Date().getFullYear(),
        countSnap = await getDocs(
          query(
            collection(db, "students"),
            where("class", "==", assignedClass),
          ),
        ),
        rollNo = String(countSnap.size + 1).padStart(4, "0"),
        studentId = `${prefix}/${year}/${rollNo}`,
        father = adm.father || {},
        mother = adm.mother || {};
      (await addDoc(collection(db, "students"), {
        name: adm.studentName || adm.fullName || "",
        dob: adm.dob || "",
        gender: adm.gender || "",
        class: assignedClass,
        classId: assignedClass,
        section: section,
        rollNo: rollNo,
        studentId: studentId,
        parentName: adm.parentName || "",
        contact: adm.contact || "",
        email: adm.email || "",
        fatherName: father.name || "",
        fatherOccupation: father.occupation || "",
        fatherContact: father.contact || "",
        motherName: mother.name || "",
        motherOccupation: mother.occupation || "",
        motherContact: mother.contact || "",
        address: adm.address || "",
        previousSchool: adm.previousSchool || "",
        medical: adm.medical || "",
        documents: adm.documents || [],
        admissionYear: year,
        status: "Active",
        admissionDocId: _pendingApproveId,
        createdAt: new Date().toISOString(),
      }),
        await updateDoc(doc(db, "admissions", _pendingApproveId), {
          status: "Admitted",
          assignedClass: assignedClass,
          classId: assignedClass,
          assignedSection: section,
          studentId: studentId,
          updatedAt: new Date().toISOString(),
        }),
        showToast(
          `✅ Admitted! Student ID: ${studentId} — Class ${assignedClass}-${section}`,
        ),
        closeApproveModal(),
        loadAdmissions());
    } catch (e) {
      showToast("❌ Approval failed: " + e.message);
    } finally {
      btn &&
        ((btn.disabled = !1),
        (btn.innerHTML = '<i class="fas fa-check"></i> Confirm Approval'));
    }
  }),
  (window.rejectAdmission = async function (docId, name) {
    if (confirm(`Reject application for ${name}?`))
      try {
        (await updateDoc(doc(db, "admissions", docId), {
          status: "Rejected",
          updatedAt: new Date().toISOString(),
        }),
          showToast("🗑️ Application rejected."),
          loadAdmissions());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.updateAdmStatus = async function (docId, status) {
    try {
      (await updateDoc(doc(db, "admissions", docId), {
        status: status,
        updatedAt: new Date().toISOString(),
      }),
        showToast("✅ Status updated to " + status),
        loadAdmissions());
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window._aaeCurrentId = null),
  (window.adminViewAdmission = function (docId) {
    const a = (window.__adminAdmCache || {})[docId];
    if (!a)
      return void showToast(
        "⚠️ Application data not in cache. Reload the list first.",
      );
    window._aaeCurrentId = docId;
    const sv = (id, val) => {
      const el = document.getElementById(id);
      el && (el.value = val || "");
    };
    (sv("aae-name", a.fullName),
      sv("aae-class", a.classApplied),
      sv("aae-dob", a.dob),
      sv("aae-gender", a.gender),
      sv("aae-year", a.year),
      sv("aae-prevschool", a.previousSchool),
      sv("aae-address", a.address),
      sv("aae-medical", a.medical),
      sv("aae-parent", a.parentName),
      sv("aae-relation", a.relation),
      sv("aae-contact", a.contact),
      sv("aae-email", a.email));
    const f = a.father || {},
      m = a.mother || {};
    (sv("aae-father-name", f.name),
      sv("aae-father-occ", f.occupation),
      sv("aae-father-tel", f.contact),
      sv("aae-mother-name", m.name),
      sv("aae-mother-occ", m.occupation),
      sv("aae-mother-tel", m.contact));
    const docsEl = document.getElementById("aae-docs"),
      docs = a.documents || [];
    docsEl.innerHTML = docs.length
      ? docs
          .map(
            (d) =>
              `<a href="${d.url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--glass-bg);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--primary);text-decoration:none"><i class="fas fa-file"></i>${d.name}</a>`,
          )
          .join("")
      : '<span style="color:var(--text-light);font-size:13px">No documents attached.</span>';
    const approveBtn = document.getElementById("aae-approve-btn");
    approveBtn &&
      (approveBtn.style.display =
        "forwarded_to_admin" === a.status ? "inline-flex" : "none");
    const overlay = document.getElementById("admin-adm-edit-overlay");
    ((overlay.style.display = "block"), (overlay.scrollTop = 0));
  }),
  (window.closeAdminAdmEdit = function () {
    ((document.getElementById("admin-adm-edit-overlay").style.display = "none"),
      (window._aaeCurrentId = null));
  }),
  (window.triggerAdminApproval = function () {
    const docId = window._aaeCurrentId,
      a = (window.__adminAdmCache || {})[docId];
    docId &&
      a &&
      (closeAdminAdmEdit(),
      window.openApproveModal(
        docId,
        a.fullName || a.studentName || "",
        a.classApplied || a.class || "",
      ));
  }),
  (window.adminSaveAdmissionChanges = async function () {
    const docId = window._aaeCurrentId;
    if (!docId) return void showToast("⚠️ No application selected.");
    const gv = (id) => (document.getElementById(id) || {}).value?.trim() || "",
      payload = {
        fullName: gv("aae-name"),
        classApplied: gv("aae-class"),
        dob: gv("aae-dob"),
        gender: gv("aae-gender"),
        year: gv("aae-year"),
        previousSchool: gv("aae-prevschool"),
        address: gv("aae-address"),
        medical: gv("aae-medical"),
        parentName: gv("aae-parent"),
        relation: gv("aae-relation"),
        contact: gv("aae-contact"),
        email: gv("aae-email"),
        father: {
          name: gv("aae-father-name"),
          occupation: gv("aae-father-occ"),
          contact: gv("aae-father-tel"),
        },
        mother: {
          name: gv("aae-mother-name"),
          occupation: gv("aae-mother-occ"),
          contact: gv("aae-mother-tel"),
        },
        updatedAt: new Date().toISOString(),
      };
    try {
      (await updateDoc(doc(db, "admissions", docId), payload),
        window.__adminAdmCache &&
          (window.__adminAdmCache[docId] = {
            ...window.__adminAdmCache[docId],
            ...payload,
          }),
        showToast("✅ Application updated."));
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.loadHomepageContent = async function () {
    try {
      const snap = await getDocs(collection(db, "settings")),
        map = {};
      if (
        (snap.docs.forEach((d) => {
          map[d.data().key] = d.data().value;
        }),
        map.about)
      ) {
        const el = document.getElementById("hp-about");
        el && (el.value = map.about);
      }
      if (map.mission) {
        const el = document.getElementById("hp-mission");
        el && (el.value = map.mission);
      }
      if (map.vision) {
        const el = document.getElementById("hp-vision");
        el && (el.value = map.vision);
      }
      if (map.parentsNote) {
        const el = document.getElementById("hp-parents");
        el && (el.value = map.parentsNote);
      }
      if (map.admissionLink) {
        const el = document.getElementById("hp-apply-link");
        el && (el.value = map.admissionLink);
      }
      showToast("✅ Content loaded from database.");
    } catch (e) {
      showToast("❌ Load failed: " + e.message);
    }
  }));
function _refreshFeatureCardsUI(cards) {
  const list = document.getElementById("wm-feature-cards-list");
  document.getElementById("wm-feature-empty");
  list &&
    (cards.length
      ? (list.innerHTML = cards
          .map((c, i) =>
            (function (card, idx) {
              const safe = (v) =>
                null == v ? "" : String(v).replace(/"/g, "&quot;");
              return `<div class="card wm-card-row" style="padding:14px;background:var(--bg);border:1px solid var(--border)" data-idx="${idx}">\n      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px">\n        <strong style="font-size:13px;color:var(--accent-dark)"><i class="fas fa-grip-vertical" style="color:var(--text-light);margin-right:6px"></i>Card ${idx + 1}</strong>\n        <button class="btn btn-sm btn-danger" type="button" onclick="removeFeatureCardRow(${idx})" style="padding:4px 10px;font-size:11px"><i class="fas fa-trash"></i> Remove</button>\n      </div>\n      <div class="form-row">\n        <div class="form-group">\n          <label>Title</label>\n          <input type="text" class="wm-card-title" value="${safe(card.title)}" placeholder="e.g. Academic Excellence">\n        </div>\n        <div class="form-group">\n          <label>Icon (FontAwesome class, optional)</label>\n          <input type="text" class="wm-card-icon" value="${safe(card.icon)}" placeholder="e.g. fa-graduation-cap">\n        </div>\n      </div>\n      <div class="form-group">\n        <label>Description</label>\n        <textarea class="wm-card-desc" rows="2" placeholder="Short description of this tradition..." style="resize:vertical">${safe(card.description)}</textarea>\n      </div>\n    </div>`;
            })(c, i),
          )
          .join(""))
      : (list.innerHTML =
          '<div style="font-size:13px;color:var(--text-light);text-align:center;padding:18px;border:1px dashed var(--border);border-radius:10px" id="wm-feature-empty">No cards yet. Click <strong>+ Add Card</strong> to create one.</div>'));
}
function _captureFeatureCardsFromUI() {
  const rows = document.querySelectorAll("#wm-feature-cards-list .wm-card-row"),
    cards = [];
  return (
    rows.forEach((row) => {
      const title = row.querySelector(".wm-card-title")?.value.trim() || "",
        icon = row.querySelector(".wm-card-icon")?.value.trim() || "",
        desc = row.querySelector(".wm-card-desc")?.value.trim() || "";
      (title || desc) &&
        cards.push({ title: title, icon: icon, description: desc });
    }),
    cards
  );
}
async function loadDynamicHomepageContent() {
  try {
    const keys = ["about", "mission", "vision", "parentsNote"],
      snap = await getDocs(collection(db, "settings")),
      map = {};
    snap.docs.forEach((d) => {
      keys.includes(d.data().key) && (map[d.data().key] = d.data().value);
    });
    const aboutEl = document.getElementById("dynamic-about-text");
    aboutEl && map.about && (aboutEl.innerHTML = pur(map.about));
    const missionEl = document.getElementById("dynamic-mission-text");
    missionEl && map.mission && (missionEl.innerHTML = pur(map.mission));
    const visionEl = document.getElementById("dynamic-vision-text");
    visionEl && map.vision && (visionEl.innerHTML = pur(map.vision));
    const parentsEl = document.getElementById("dynamic-parents-note");
    parentsEl &&
      map.parentsNote &&
      (parentsEl.innerHTML = pur(map.parentsNote));
  } catch (e) {}
}
async function loadAdminContacts() {
  const tbody = document.getElementById("admin-contacts-tbody");
  if (tbody)
    try {
      const snap = await getDocs(query(collection(db, "contacts"), limit(30)));
      if (snap.empty)
        return void (tbody.innerHTML =
          '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-light)">No messages yet.</td></tr>');
      const sorted = [...snap.docs].sort((a, b) =>
        (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
      );
      tbody.innerHTML = sorted
        .map((d) => {
          const c = d.data(),
            fmt = c.createdAt
              ? new Date(c.createdAt).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                })
              : "—",
            bc = "Replied" === c.status ? "badge-success" : "badge-warning";
          return `<tr>\n          <td><strong>${pur(c.name || "—")}</strong><br><span style="font-size:11px;color:var(--text-light)">${pur(c.email || "")}</span></td>\n          <td style="font-size:13px">${pur(c.subject || "—")}</td>\n          <td style="font-size:12px;color:var(--text-light);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${pur(c.message || "—")}</td>\n          <td style="font-size:12px">${fmt}</td>\n          <td><span class="badge ${bc}">${c.status || "Unread"}</span></td>\n          <td style="display:flex;gap:6px;flex-wrap:wrap">\n            <button class="btn btn-sm btn-outline" onclick="markContactReplied('${d.id}')"><i class="fas fa-check"></i> Replied</button>\n            <button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;border:none" onclick="deleteContact('${d.id}')"><i class="fas fa-trash"></i></button>\n          </td>\n        </tr>`;
        })
        .join("");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);text-align:center">❌ ${e.message}</td></tr>`;
    }
}
((window._wmFeatureCards = []),
  (window.addFeatureCardRow = function () {
    ((window._wmFeatureCards = _captureFeatureCardsFromUI()),
      window._wmFeatureCards.length >= 8
        ? showToast("⚠️ Maximum of 8 cards.")
        : (window._wmFeatureCards.push({
            title: "",
            icon: "",
            description: "",
          }),
          _refreshFeatureCardsUI(window._wmFeatureCards)));
  }),
  (window.removeFeatureCardRow = function (idx) {
    ((window._wmFeatureCards = _captureFeatureCardsFromUI()),
      window._wmFeatureCards.splice(idx, 1),
      _refreshFeatureCardsUI(window._wmFeatureCards));
  }),
  (window.loadWebsiteContent = async function () {
    try {
      const snap = await getDoc(doc(db, "public_settings", "homepage")),
        data = snap.exists() ? snap.data() : {},
        set = (id, v) => {
          const e = document.getElementById(id);
          e && (e.value = null == v ? "" : v);
        };
      set("wm-hero-sub", data.hero?.subheadline);
      const stats = Array.isArray(data.stats) ? data.stats : [];
      for (let i = 1; i <= 4; i++) {
        const s = stats[i - 1] || {};
        (set(`wm-stat${i}-label`, s.label), set(`wm-stat${i}-value`, s.value));
      }
      (set("wm-ann-text", data.announcement?.text),
        set("wm-ann-tag", data.announcement?.tag),
        set("wm-ann-date", data.announcement?.date),
        (window._wmFeatureCards = Array.isArray(data.featureCards)
          ? data.featureCards
          : []),
        _refreshFeatureCardsUI(window._wmFeatureCards),
        snap.exists() && showToast("✅ Website content loaded."));
    } catch (e) {
      (console.error("[WebsiteCMS] load failed", e),
        showToast("❌ Load failed: " + e.message));
    }
  }),
  (window.saveWebsiteContent = async function () {
    const get = (id) => (document.getElementById(id)?.value || "").trim(),
      num = (id) => {
        const n = parseInt(document.getElementById(id)?.value, 10);
        return Number.isFinite(n) ? n : 0;
      },
      payload = {
        hero: { subheadline: get("wm-hero-sub") },
        stats: [
          { label: get("wm-stat1-label"), value: num("wm-stat1-value") },
          { label: get("wm-stat2-label"), value: num("wm-stat2-value") },
          { label: get("wm-stat3-label"), value: num("wm-stat3-value") },
          { label: get("wm-stat4-label"), value: num("wm-stat4-value") },
        ].filter((s) => s.label || s.value),
        announcement: {
          text: get("wm-ann-text"),
          tag: get("wm-ann-tag").toUpperCase(),
          date: get("wm-ann-date"),
        },
        featureCards: _captureFeatureCardsFromUI(),
        updatedAt: new Date().toISOString(),
      },
      btn = document.getElementById("wm-save-btn");
    btn &&
      ((btn.disabled = !0),
      (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'));
    try {
      (await setDoc(doc(db, "public_settings", "homepage"), payload, {
        merge: !0,
      }),
        showToast(
          "✅ Website content saved — homepage will refresh on next visit.",
        ));
    } catch (e) {
      (console.error("[WebsiteCMS] save failed", e),
        showToast("❌ Save failed: " + e.message));
    } finally {
      btn &&
        ((btn.disabled = !1),
        (btn.innerHTML =
          '<i class="fas fa-cloud-upload-alt"></i> Save Website Changes'));
    }
  }),
  (window.saveHomepageContent = async function () {
    const about = (document.getElementById("hp-about")?.value || "").trim(),
      mission = (document.getElementById("hp-mission")?.value || "").trim(),
      vision = (document.getElementById("hp-vision")?.value || "").trim(),
      parents = (document.getElementById("hp-parents")?.value || "").trim(),
      applyLink = (
        document.getElementById("hp-apply-link")?.value || ""
      ).trim(),
      btn = document.querySelector("#a-homepage .btn-primary");
    btn &&
      ((btn.disabled = !0),
      (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'));
    try {
      const promises = [];
      (about && promises.push(upsertSetting("about", about)),
        mission && promises.push(upsertSetting("mission", mission)),
        vision && promises.push(upsertSetting("vision", vision)),
        parents && promises.push(upsertSetting("parentsNote", parents)),
        promises.push(upsertSetting("admissionLink", applyLink)),
        await Promise.all(promises),
        loadDynamicHomepageContent(),
        showToast("✅ Homepage content saved and updated live!"));
    } catch (e) {
      showToast("❌ Save failed: " + e.message);
    } finally {
      btn &&
        ((btn.disabled = !1),
        (btn.innerHTML = '<i class="fas fa-save"></i> Save All Changes'));
    }
  }),
  (window.saveAdmissionNotice = async function () {
    const notice = (
      document.getElementById("adm-public-notice")?.value || ""
    ).trim();
    try {
      const snap = await getDocs(
        query(
          collection(db, "settings"),
          where("key", "==", "admissionNotice"),
        ),
      );
      (snap.empty
        ? await addDoc(collection(db, "settings"), {
            key: "admissionNotice",
            value: notice,
            updatedAt: new Date().toISOString(),
          })
        : await setDoc(
            doc(db, "settings", snap.docs[0].id),
            {
              key: "admissionNotice",
              value: notice,
              updatedAt: new Date().toISOString(),
            },
            { merge: !0 },
          ),
        showToast("✅ Public notice updated!"));
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.markContactReplied = async function (docId) {
    try {
      (await setDoc(
        doc(db, "contacts", docId),
        { status: "Replied", updatedAt: new Date().toISOString() },
        { merge: !0 },
      ),
        showToast("✅ Marked as replied."),
        loadAdminContacts());
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.deleteContact = async function (docId) {
    if (confirm("Delete this contact message? This cannot be undone."))
      try {
        (await deleteDoc(doc(db, "contacts", docId)),
          showToast("🗑️ Message deleted."),
          loadAdminContacts());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }));
const _origShowDash = window.showDash;
window.showDash = function (prefix, sectionId, btn) {
  if (
    (_origShowDash(prefix, sectionId, btn),
    "s" === prefix &&
      window.syncStudentBottomNav &&
      window.syncStudentBottomNav(sectionId),
    "a-events" === sectionId && loadAdminEvents(),
    "a-announcements" === sectionId && loadAdminAnnouncements(),
    "a-why-choose" === sectionId && loadAdminWhyChooseUs(),
    "a-quotes" === sectionId && loadAdminQuotes(),
    "a-house-points" === sectionId && loadAdminHousePoints(),
    "a-leaders" === sectionId && loadAdminLeaders(),
    "a-gallery" === sectionId && loadAdminGallery(),
    "a-homepage" === sectionId && loadHomepageContent(),
    "a-website-mgmt" === sectionId && loadWebsiteContent(),
    "a-admissions" === sectionId && (loadAdmissions(), loadAdmissionNotice()),
    "a-contacts" === sectionId && loadAdminContacts(),
    "a-holidays" === sectionId && loadHolidays(),
    "a-leave" === sectionId &&
      (window.loadLeaveQuota && loadLeaveQuota(),
      window.loadAdminLeave && loadAdminLeave()),
    "a-teachers" === sectionId &&
      window.seedTeachersIfNeeded &&
      window.seedTeachersIfNeeded().then(() => {
        window.loadTeachers && window.loadTeachers();
      }),
    "a-dashboard" === sectionId &&
      window.loadAdminDashboardStats &&
      window.loadAdminDashboardStats(),
    "t-attendance" === sectionId &&
      ((window._attInitialized = !1),
      window._currentTeacherClass &&
        ((window._attInitialized = !0),
        window.initTeacherAttendance &&
          initTeacherAttendance(window._currentTeacherClass))),
    "t-homework" === sectionId)
  ) {
    const hwDue = document.getElementById("hw-due");
    (hwDue && (hwDue.min = new Date().toISOString().split("T")[0]),
      window.populateHwClassSelect && populateHwClassSelect(),
      window.loadTeacherHomework && loadTeacherHomework());
  }
  if (
    ("s-attendance" === sectionId &&
      window.loadStudentAttendance &&
      loadStudentAttendance(),
    "s-routine" === sectionId &&
      window.loadStudentRoutine &&
      loadStudentRoutine(),
    "t-schedule" === sectionId &&
      window.loadTeacherSchedule &&
      loadTeacherSchedule(),
    "s-dashboard" === sectionId &&
      window.loadStudentDashWidgets &&
      loadStudentDashWidgets(),
    "t-dashboard" === sectionId &&
      window.loadTeacherDashWidgets &&
      loadTeacherDashWidgets(),
    "s-homework" === sectionId
      ? window.loadStudentHomework && loadStudentHomework()
      : window._hwUnsubscribe &&
        (window._hwUnsubscribe(), (window._hwUnsubscribe = null)),
    "s-notices" === sectionId &&
      window.loadStudentNotices &&
      loadStudentNotices(),
    "s-fees" === sectionId && window.loadStudentFees && loadStudentFees(),
    "t-notices" === sectionId &&
      window.loadTeacherNotices &&
      loadTeacherNotices(),
    "t-leave" === sectionId &&
      window.loadLeaveHistory &&
      window.loadLeaveHistory(),
    "t-profile" === sectionId &&
      window.loadTeacherProfile &&
      loadTeacherProfile(),
    "a-leave" === sectionId &&
      (window.loadLeaveQuota && loadLeaveQuota(),
      window.loadAdminLeave && loadAdminLeave()),
    "a-notices" === sectionId && window.loadAdminNotices && loadAdminNotices(),
    "a-fees" === sectionId && window.loadAdminFees && loadAdminFees(),
    "a-monthly-att" === sectionId &&
      (window.loadAdminMonthlyAtt && loadAdminMonthlyAtt(),
      window.loadAcademicSessions && loadAcademicSessions()),
    "o-fee-structure" === sectionId &&
      window.officeStaffLoadFeeStructure &&
      officeStaffLoadFeeStructure(),
    "a-fee-structure" === sectionId &&
      window.loadAdminFeeStructure &&
      loadAdminFeeStructure(),
    "a-fee-transactions" === sectionId &&
      window.loadAdminFeeTransactions &&
      loadAdminFeeTransactions(),
    "o-fee-approvals" === sectionId &&
      window.loadAdminFeeTransactions &&
      loadAdminFeeTransactions(),
    "o-dues" === sectionId && window.loadDuesList && loadDuesList(),
    "o-dashboard" === sectionId &&
      window.loadOfficeDashboardStats &&
      loadOfficeDashboardStats(),
    "o-reports" === sectionId &&
      window.loadOfficeReports &&
      loadOfficeReports(),
    "o-admissions" === sectionId &&
      window.loadOfficeAdmissions &&
      loadOfficeAdmissions(),
    "o-profile" === sectionId &&
      window.loadOfficeProfile &&
      loadOfficeProfile(),
    "a-student-records" === sectionId &&
      window.loadStudentRecords &&
      window.loadStudentRecords(),
    "a-family-mgmt" === sectionId)
  ) {
    const famInput = document.getElementById("fam-search-input"),
      famList = document.getElementById("fam-search-results");
    (famInput && (famInput.value = ""),
      famList &&
        (famList.innerHTML =
          '<p style="color:var(--text-light);font-size:13px">Search to find students.</p>'));
  }
  if ("o-fee-collection" === sectionId) {
    const pd = document.getElementById("pay-date");
    pd && !pd.value && (pd.value = new Date().toISOString().split("T")[0]);
  }
};
const _origShowPage = window.showPage;
function setQuoteDisplay(text, author, date) {
  const qt = document.getElementById("home-quote-text"),
    qa = document.getElementById("home-quote-author"),
    qd = document.getElementById("home-quote-date");
  (qt && (qt.innerHTML = text ? `"${text}"` : ""),
    qa && (qa.textContent = author ? `— ${author}` : ""),
    qd &&
      (qd.textContent = date
        ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })
        : ""));
}
((window.showPage = function (name) {
  (_origShowPage(name),
    "staff" === name && loadPublicStaff(),
    "notices" === name && loadPublicNotices(),
    "events" === name && loadPublicEvents(),
    "gallery" === name && loadPublicGallery(),
    "admission" === name && loadAdmissionNotice());
}),
  (async () => {
    (loadHomeTicker(),
      loadPublicEvents(),
      loadAdmissionNotice(),
      loadPublicGallery(),
      loadDynamicHomepageContent(),
      (function () {
        const threeDaysAgo = new Date(Date.now() - 2592e5)
          .toISOString()
          .split("T")[0];
        onSnapshot(
          query(collection(db, "announcements"), limit(30)),
          (snap) => {
            const ticker = document.getElementById("home-ticker-content"),
              grid = document.getElementById("home-announcements-grid");
            if (snap.empty)
              return (
                ticker &&
                  (ticker.innerHTML =
                    "<span>No announcements at this time.</span>"),
                void (
                  grid &&
                  (grid.innerHTML =
                    '<p style="color:var(--text-light);font-size:14px;grid-column:1/-1">No announcements yet.</p>')
                )
              );
            const items = [...snap.docs]
              .map((d) => ({ id: d.id, ...d.data() }))
              .filter(
                (a) =>
                  !a.activeTo ||
                  a.activeTo >= new Date().toISOString().split("T")[0],
              )
              .sort(
                (a, b) =>
                  ("High" === b.priority ? 1 : 0) -
                    ("High" === a.priority ? 1 : 0) ||
                  (b.date || "").localeCompare(a.date || ""),
              );
            (ticker &&
              (ticker.innerHTML = items
                .map(
                  (a) =>
                    `<span>${a.isNew || a.date >= threeDaysAgo ? "🔴 " : ""}<strong>${pur(a.title || "")}</strong>${a.title && a.message ? " — " : ""}${pur(a.message || a.text || "")}</span>`,
                )
                .join("")),
              grid &&
                (grid.innerHTML = items
                  .map((a) => {
                    const isNew = a.isNew || (a.date && a.date >= threeDaysAgo),
                      fmt = a.date
                        ? new Date(a.date + "T00:00:00").toLocaleDateString(
                            "en-IN",
                            { day: "2-digit", month: "short", year: "numeric" },
                          )
                        : "";
                    return `<div class="ann-card" style="${"High" === a.priority ? "border-left-color:#e53e3e" : ""}">\n            <div class="ann-card-title">\n              ${"High" === a.priority ? '<i class="fas fa-exclamation-circle" style="color:#e53e3e;font-size:14px"></i>' : ""}\n              ${a.title || "Announcement"}\n              ${isNew ? '<span class="badge-new">NEW</span>' : ""}\n            </div>\n            <p class="ann-card-msg">${a.message || a.text || ""}</p>\n            ${fmt ? `<div class="ann-card-date"><i class="fas fa-calendar-alt" style="margin-right:5px"></i>${fmt}</div>` : ""}\n          </div>`;
                  })
                  .join("")));
          },
          (e) => {
            console.warn("Announcements snapshot:", e.message);
          },
        );
      })(),
      onSnapshot(
        query(collection(db, "why_choose_us"), orderBy("order"), limit(12)),
        (snap) => {
          const grid = document.getElementById("why-choose-us-grid");
          if (!grid) return;
          const defaultItems = [
              {
                title: "Academic Excellence",
                description:
                  "Consistent top results in board examinations with holistic curriculum designed to nurture each child's potential.",
                icon: "fas fa-graduation-cap",
              },
              {
                title: "Value-Based Education",
                description:
                  "Rooted in Franciscan values of compassion, love, and service — we shape character alongside academics.",
                icon: "fas fa-heart",
              },
              {
                title: "Experienced Faculty",
                description:
                  "Dedicated educators bringing passion and expertise to every classroom, ensuring quality learning for all students.",
                icon: "fas fa-users",
              },
              {
                title: "Sports & Activities",
                description:
                  "State-level athletes, cultural programs, and 20+ clubs ensure well-rounded development for every student.",
                icon: "fas fa-running",
              },
              {
                title: "Modern Infrastructure",
                description:
                  "Smart classrooms, a well-stocked library, computer labs, and science labs equipped with modern tools.",
                icon: "fas fa-laptop",
              },
              {
                title: "Safe Environment",
                description:
                  "CCTV-equipped campus, trained security personnel, and a strict anti-bullying policy ensuring student safety.",
                icon: "fas fa-shield-alt",
              },
            ],
            items = snap.empty
              ? defaultItems
              : [...snap.docs].map((d) => d.data());
          grid.innerHTML = items
            .map(
              (it) =>
                `<div class="feature-card" style="cursor:default;transition:transform .2s,box-shadow .2s" onmouseenter="this.style.transform='translateY(-4px)'" onmouseleave="this.style.transform=''">\n          <div class="feature-icon"><i class="${it.icon || "fas fa-star"}"></i></div>\n          <h3>${it.title}</h3>\n          <p>${it.description}</p>\n        </div>`,
            )
            .join("");
        },
        (e) => {
          console.warn("WhyChooseUs:", e.message);
        },
      ),
      onSnapshot(
        query(collection(db, "quotes"), orderBy("date", "desc"), limit(30)),
        (snap) => {
          if (snap.empty)
            return void setQuoteDisplay(
              "Everything by love and not by force.",
              "St. Francis De Sales",
              "",
            );
          new Date().toISOString().split("T")[0];
          const items = [...snap.docs].map((d) => d.data()),
            quote =
              items[
                Math.floor(
                  (Date.now() - new Date(new Date().getFullYear(), 0, 0)) /
                    864e5,
                ) % items.length
              ];
          setQuoteDisplay(quote.quote, quote.author, quote.date);
        },
        (e) => {
          setQuoteDisplay(
            "Everything by love and not by force.",
            "St. Francis De Sales",
            "",
          );
        },
      ),
      onSnapshot(
        query(collection(db, "school_leaders"), limit(20)),
        (snap) => {
          const grid = document.getElementById("school-leaders-grid");
          if (!grid) return;
          if (snap.empty)
            return void (grid.innerHTML =
              '<p style="grid-column:1/-1;text-align:center;color:var(--text-light);font-size:14px">No school leaders added yet. Admin can add them in the portal.</p>');
          const leaders = [...snap.docs]
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort(
              (a, b) =>
                (a.order || ROLE_ORDER[a.role] || 99) -
                (b.order || ROLE_ORDER[b.role] || 99),
            );
          grid.innerHTML = leaders
            .map((l) => {
              const initials = (l.name || "?")
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase(),
                houseStyle = (l.house && HOUSE_BADGE_STYLE[l.house]) || "";
              return `<div class="leader-card">\n          ${l.imageUrl ? `<img src="${l.imageUrl}" alt="${l.name}" class="leader-portrait" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><div class="leader-avatar" style="display:none">${initials}</div>` : `<div class="leader-avatar">${initials}</div>`}\n          <div class="leader-name">${l.name || "—"}</div>\n          <div class="leader-role">${l.role || "—"}</div>\n          ${l.house ? `<span class="leader-house-badge" style="${houseStyle}">${l.house} House</span>` : ""}\n        </div>`;
            })
            .join("");
        },
        (e) => {
          console.warn("Leaders snapshot:", e.message);
        },
      ));
    const _authUnsub = auth.onAuthStateChanged(async (u) => {
      if ((_authUnsub(), !u))
        return (loadHomeStats(), void initHousePointsRealtime());
      try {
        const uDoc = await getDoc(doc(db, "users", u.uid)),
          role = (uDoc.exists() && uDoc.data().role) || "";
        ["admin", "super_admin", "teacher", "office", "office_staff"].includes(
          role,
        ) && (loadHomeStats(), initHousePointsRealtime());
      } catch (e) {}
    });
  })(),
  (window.saveAnnouncement = async function () {
    const editId = document.getElementById("ann-edit-id")?.value || "",
      title = (document.getElementById("ann-title")?.value || "").trim(),
      msg = (document.getElementById("ann-text")?.value || "").trim(),
      date =
        document.getElementById("ann-date")?.value ||
        new Date().toISOString().split("T")[0],
      prio = document.getElementById("ann-priority")?.value || "Normal",
      isNew = document.getElementById("ann-isnew")?.checked || !1;
    if (title && msg)
      try {
        const data = {
          title: title,
          message: msg,
          text: `${title} — ${msg}`,
          date: date,
          priority: prio,
          isNew: isNew,
          updatedAt: new Date().toISOString(),
        };
        (editId
          ? (await setDoc(doc(db, "announcements", editId), data, {
              merge: !0,
            }),
            showToast("✅ Announcement updated!"),
            cancelAnnEdit())
          : ((data.createdAt = new Date().toISOString()),
            await addDoc(collection(db, "announcements"), data),
            showToast("✅ Announcement added!")),
          ["ann-title", "ann-text", "ann-date"].forEach((id) => {
            const e = document.getElementById(id);
            e && (e.value = "");
          }));
        const ic = document.getElementById("ann-isnew");
        (ic && (ic.checked = !1), loadAdminAnnouncements());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Title and message are required.");
  }),
  (window.cancelAnnEdit = function () {
    ((document.getElementById("ann-edit-id").value = ""),
      (document.getElementById("ann-form-mode").textContent =
        "Add Announcement"),
      (document.getElementById("ann-cancel-edit").style.display = "none"),
      ["ann-title", "ann-text", "ann-date"].forEach((id) => {
        const e = document.getElementById(id);
        e && (e.value = "");
      }));
    const ic = document.getElementById("ann-isnew");
    (ic && (ic.checked = !1),
      (document.getElementById("ann-priority").value = "Normal"));
  }),
  (window.editAnnouncement = function (id, title, msg, date, prio, isNew) {
    ((document.getElementById("ann-edit-id").value = id),
      (document.getElementById("ann-title").value = title || ""),
      (document.getElementById("ann-text").value = msg || ""),
      (document.getElementById("ann-date").value = date || ""),
      (document.getElementById("ann-priority").value = prio || "Normal"));
    const ic = document.getElementById("ann-isnew");
    (ic && (ic.checked = !!isNew),
      (document.getElementById("ann-form-mode").textContent =
        "Edit Announcement"),
      (document.getElementById("ann-cancel-edit").style.display = ""),
      showDash("a", "a-announcements"));
  }),
  (window.loadAdminAnnouncements = async function () {
    const el = document.getElementById("admin-announcements-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
      try {
        const snap = await getDocs(
          query(collection(db, "announcements"), limit(40)),
        );
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No announcements yet.</p>');
        const sorted = [...snap.docs].sort((a, b) =>
          (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
        );
        el.innerHTML = sorted
          .map((d) => {
            const a = d.data(),
              newBadge = a.isNew
                ? '<span class="badge-new" style="animation:none;background:#e53e3e">NEW</span>'
                : "";
            return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px">\n          <div style="flex:1"><div style="font-weight:700;font-size:13px;color:var(--accent-dark)">${a.title || "—"} ${newBadge}</div>\n          <div style="font-size:12px;color:var(--text-light);margin-top:2px">${(a.message || a.text || "").slice(0, 80)}${(a.message || a.text || "").length > 80 ? "…" : ""}</div>\n          <div style="font-size:11px;color:var(--text-light);margin-top:2px">${a.date || ""} · <span style="font-weight:600">${a.priority || "Normal"}</span></div></div>\n          <div style="display:flex;gap:6px;flex-shrink:0">\n            <button onclick="editAnnouncement('${d.id}','${(a.title || "").replace(/'/g, "\\'")}','${(a.message || a.text || "").replace(/'/g, "\\'")}','${a.date || ""}','${a.priority || "Normal"}',${!!a.isNew})" style="background:none;border:none;color:var(--accent);cursor:pointer"><i class="fas fa-edit"></i></button>\n            <button onclick="deleteAnnouncement('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button>\n          </div></div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = isPermissionError(e)
          ? permissionErrorHtml("announcements")
          : `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }),
  (window.deleteAnnouncement = async function (docId) {
    if (confirm("Delete this announcement?"))
      try {
        (await deleteDoc(doc(db, "announcements", docId)),
          showToast("🗑️ Deleted."),
          loadAdminAnnouncements());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.saveWhyChooseUs = async function () {
    const editId = document.getElementById("why-edit-id")?.value || "",
      title = (document.getElementById("why-title")?.value || "").trim(),
      desc = (document.getElementById("why-desc")?.value || "").trim(),
      icon = (
        document.getElementById("why-icon")?.value || "fas fa-star"
      ).trim(),
      order =
        parseInt(document.getElementById("why-order")?.value || "99") || 99;
    if (title && desc)
      try {
        const data = {
          title: title,
          description: desc,
          icon: icon,
          order: order,
          updatedAt: new Date().toISOString(),
        };
        (editId
          ? (await setDoc(doc(db, "why_choose_us", editId), data, {
              merge: !0,
            }),
            showToast("✅ Updated!"),
            cancelWhyEdit())
          : ((data.createdAt = new Date().toISOString()),
            await addDoc(collection(db, "why_choose_us"), data),
            showToast("✅ Added!")),
          ["why-title", "why-desc", "why-icon", "why-order"].forEach((id) => {
            const e = document.getElementById(id);
            e && (e.value = "");
          }),
          loadAdminWhyChooseUs());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Title and description required.");
  }),
  (window.cancelWhyEdit = function () {
    ((document.getElementById("why-edit-id").value = ""),
      (document.getElementById("why-form-mode").textContent = "Add Reason"),
      (document.getElementById("why-cancel-edit").style.display = "none"),
      ["why-title", "why-desc", "why-icon", "why-order"].forEach((id) => {
        const e = document.getElementById(id);
        e && (e.value = "");
      }));
  }),
  (window.editWhyItem = function (id, title, desc, icon, order) {
    ((document.getElementById("why-edit-id").value = id),
      (document.getElementById("why-title").value = title || ""),
      (document.getElementById("why-desc").value = desc || ""),
      (document.getElementById("why-icon").value = icon || ""),
      (document.getElementById("why-order").value = order || ""),
      (document.getElementById("why-form-mode").textContent = "Edit Reason"),
      (document.getElementById("why-cancel-edit").style.display = ""),
      showDash("a", "a-why-choose"));
  }),
  (window.loadAdminWhyChooseUs = async function () {
    const el = document.getElementById("admin-why-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
      try {
        const snap = await getDocs(
          query(collection(db, "why_choose_us"), orderBy("order"), limit(20)),
        );
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No items yet. Add one to override the defaults.</p>');
        el.innerHTML = snap.docs
          .map((d) => {
            const it = d.data();
            return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:center;gap:8px"><div><div style="font-weight:700;font-size:13px;color:var(--accent-dark)">${it.title}</div><div style="font-size:12px;color:var(--text-light)">${(it.description || "").slice(0, 60)}…</div></div><div style="display:flex;gap:6px"><button onclick="editWhyItem('${d.id}','${(it.title || "").replace(/'/g, "\\'")}','${(it.description || "").replace(/'/g, "\\'")}','${it.icon || ""}','${it.order || ""}')" style="background:none;border:none;color:var(--accent);cursor:pointer"><i class="fas fa-edit"></i></button><button onclick="deleteWhyItem('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button></div></div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }),
  (window.deleteWhyItem = async function (docId) {
    if (confirm("Delete?"))
      try {
        (await deleteDoc(doc(db, "why_choose_us", docId)),
          showToast("🗑️ Deleted."),
          loadAdminWhyChooseUs());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.saveQuote = async function () {
    const editId = document.getElementById("quote-edit-id")?.value || "",
      qt = (document.getElementById("quote-text")?.value || "").trim(),
      au = (document.getElementById("quote-author")?.value || "").trim(),
      dt =
        document.getElementById("quote-date")?.value ||
        new Date().toISOString().split("T")[0];
    if (qt && au)
      try {
        const data = {
          quote: qt,
          author: au,
          date: dt,
          updatedAt: new Date().toISOString(),
        };
        (editId
          ? (await setDoc(doc(db, "quotes", editId), data, { merge: !0 }),
            showToast("✅ Updated!"),
            cancelQuoteEdit())
          : ((data.createdAt = new Date().toISOString()),
            await addDoc(collection(db, "quotes"), data),
            showToast("✅ Added!")),
          ["quote-text", "quote-author", "quote-date"].forEach((id) => {
            const e = document.getElementById(id);
            e && (e.value = "");
          }),
          loadAdminQuotes());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Quote and author required.");
  }),
  (window.cancelQuoteEdit = function () {
    ((document.getElementById("quote-edit-id").value = ""),
      (document.getElementById("quote-form-mode").textContent = "Add Quote"),
      (document.getElementById("quote-cancel-edit").style.display = "none"),
      ["quote-text", "quote-author", "quote-date"].forEach((id) => {
        const e = document.getElementById(id);
        e && (e.value = "");
      }));
  }),
  (window.editQuote = function (id, qt, au, dt) {
    ((document.getElementById("quote-edit-id").value = id),
      (document.getElementById("quote-text").value = qt || ""),
      (document.getElementById("quote-author").value = au || ""),
      (document.getElementById("quote-date").value = dt || ""),
      (document.getElementById("quote-form-mode").textContent = "Edit Quote"),
      (document.getElementById("quote-cancel-edit").style.display = ""),
      showDash("a", "a-quotes"));
  }),
  (window.loadAdminQuotes = async function () {
    const el = document.getElementById("admin-quotes-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
      try {
        const snap = await getDocs(
          query(collection(db, "quotes"), orderBy("date", "desc"), limit(30)),
        );
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No quotes yet.</p>');
        el.innerHTML = snap.docs
          .map((d) => {
            const q = d.data();
            return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div style="font-size:13px;color:var(--text);font-style:italic">"${(q.quote || "").slice(0, 80)}${(q.quote || "").length > 80 ? "…" : ""}"</div><div style="font-size:12px;color:var(--text-light);margin-top:2px">— ${q.author || "—"} · ${q.date || ""}</div></div><div style="display:flex;gap:6px"><button onclick="editQuote('${d.id}','${(q.quote || "").replace(/'/g, "\\'")}','${(q.author || "").replace(/'/g, "\\'")}','${q.date || ""}')" style="background:none;border:none;color:var(--accent);cursor:pointer"><i class="fas fa-edit"></i></button><button onclick="deleteQuote('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button></div></div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }),
  (window.deleteQuote = async function (docId) {
    if (confirm("Delete?"))
      try {
        (await deleteDoc(doc(db, "quotes", docId)),
          showToast("🗑️ Deleted."),
          loadAdminQuotes());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }));
const HOUSE_COLORS = {
    Blue: "house-blue",
    Green: "house-green",
    Red: "house-red",
    Yellow: "house-yellow",
  },
  HOUSE_EMOJI = { Blue: "🔵", Green: "🟢", Red: "🔴", Yellow: "🟡" };
function initHousePointsRealtime() {
  (!(function () {
    const sel = document.getElementById("house-month");
    if (!sel) return;
    const now = new Date(),
      opts = [];
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1),
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        label = d.toLocaleString("default", { month: "long", year: "numeric" });
      opts.push(
        `<option value="${key}"${0 === i ? " selected" : ""}>${label}</option>`,
      );
    }
    sel.innerHTML = opts.join("");
  })(),
    onSnapshot(
      collection(db, "house_points"),
      (snap) => {
        const grid = document.getElementById("house-points-grid");
        if (!grid) return;
        if (snap.empty)
          return void (grid.innerHTML =
            '<p style="grid-column:1/-1;text-align:center;color:var(--text-light);font-size:14px">No house points data yet. Admin can add them in the portal.</p>');
        const houseMap = {};
        snap.docs.forEach((d) => {
          const data = d.data(),
            name = data.houseName;
          name &&
            (!houseMap[name] ||
              (data.totalPoints || 0) > (houseMap[name].totalPoints || 0)) &&
            (houseMap[name] = { id: d.id, ...data });
        });
        const houses = Object.values(houseMap).sort(
          (a, b) => (b.totalPoints || 0) - (a.totalPoints || 0),
        );
        if (!houses.length)
          return void (grid.innerHTML =
            '<p style="grid-column:1/-1;text-align:center;color:var(--text-light);font-size:14px">No house points data yet.</p>');
        const ranks = ["🥇", "🥈", "🥉", "4th"];
        grid.innerHTML = houses
          .map((h, i) => {
            const isLeader = 0 === i,
              cls = HOUSE_COLORS[h.houseName] || "house-blue",
              thisMonth = h.currentMonthPoints || h.monthlyPoints || 0;
            return `<div class="house-card ${cls}${isLeader ? " leader" : ""}">\n          ${isLeader ? '<div class="house-crown">👑</div>' : ""}\n          <div class="house-rank">${ranks[i] || ""} ${0 === i ? "Leading!" : ""}</div>\n          <div class="house-name">${HOUSE_EMOJI[h.houseName] || ""} ${h.houseName} House</div>\n          <div class="house-pts">${(h.totalPoints || 0).toLocaleString()}</div>\n          <div class="house-label">Total Points</div>\n          ${thisMonth ? `<div style="font-size:12px;opacity:.8;margin-top:6px">+${thisMonth} this month</div>` : ""}\n        </div>`;
          })
          .join("");
      },
      (e) => {
        console.warn("House points:", e.message);
      },
    ));
}
((window.loadMonthlyEntry = async function () {
  const name = document.getElementById("house-name")?.value || "",
    monthKey = document.getElementById("house-month")?.value || "",
    ptsEl = document.getElementById("house-monthly-pts");
  if (name && monthKey && ptsEl)
    try {
      const snap = await getDoc(
        doc(db, "house_points", name, "monthly_entries", monthKey),
      );
      ptsEl.value = (snap.exists() && snap.data().points) || 0;
    } catch (e) {
      ptsEl.value = 0;
    }
}),
  (window.saveHousePoints = async function () {
    const name = document.getElementById("house-name")?.value || "",
      monthKey = document.getElementById("house-month")?.value || "",
      pts =
        parseInt(document.getElementById("house-monthly-pts")?.value || 0) || 0;
    if (name && monthKey)
      try {
        const [yr, mo] = monthKey.split("-").map(Number),
          label = new Date(yr, mo - 1, 1).toLocaleString("default", {
            month: "long",
            year: "numeric",
          });
        await setDoc(
          doc(db, "house_points", name, "monthly_entries", monthKey),
          {
            points: pts,
            label: label,
            year: yr,
            month: mo,
            monthKey: monthKey,
            updatedAt: new Date().toISOString(),
          },
          { merge: !0 },
        );
        const allEntries = await getDocs(
            collection(db, "house_points", name, "monthly_entries"),
          ),
          total = allEntries.docs.reduce(
            (sum, d) => sum + (d.data().points || 0),
            0,
          ),
          nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
          curDoc = allEntries.docs.find((d) => d.id === nowKey),
          currentMonthPoints = (curDoc && curDoc.data().points) || 0;
        await setDoc(
          doc(db, "house_points", name),
          {
            houseName: name,
            totalPoints: total,
            currentMonthPoints: currentMonthPoints,
            updatedAt: new Date().toISOString(),
          },
          { merge: !0 },
        );
        const dispEl = document.getElementById("house-total-display");
        (dispEl &&
          (dispEl.innerHTML = `<i class="fas fa-calculator" style="margin-right:6px"></i><strong>${name} House total: ${total} pts</strong> (auto-summed)`),
          showToast(`✅ Saved! ${name} House total: ${total} pts`),
          loadAdminHousePoints());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Select a house and month.");
  }),
  (window.loadAdminHousePoints = async function () {
    const el = document.getElementById("admin-house-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
      try {
        const snap = await getDocs(collection(db, "house_points"));
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No data yet.</p>');
        const houseMap = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          data.houseName &&
            (!houseMap[data.houseName] ||
              (data.totalPoints || 0) >
                (houseMap[data.houseName].totalPoints || 0)) &&
            (houseMap[data.houseName] = { id: d.id, ...data });
        });
        const sorted = Object.values(houseMap).sort(
            (a, b) => (b.totalPoints || 0) - (a.totalPoints || 0),
          ),
          withMonthly = await Promise.all(
            sorted.map(async (h) => {
              try {
                const monthly = [
                  ...(
                    await getDocs(
                      collection(
                        db,
                        "house_points",
                        h.houseName,
                        "monthly_entries",
                      ),
                    )
                  ).docs,
                ]
                  .map((d) => d.data())
                  .sort((a, b) => (b.monthKey > a.monthKey ? 1 : -1))
                  .slice(0, 6);
                return { ...h, monthly: monthly };
              } catch {
                return { ...h, monthly: [] };
              }
            }),
          );
        el.innerHTML = withMonthly
          .map(
            (h, i) =>
              `<div style="border:1px solid rgba(139,111,71,.15);border-radius:10px;padding:12px 14px;margin-bottom:10px">\n          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">\n            <strong style="font-size:14px">${["🥇", "🥈", "🥉", "4th"][i] || ""} ${HOUSE_EMOJI[h.houseName] || ""} ${h.houseName} House</strong>\n            <span style="font-size:1.15rem;font-weight:800;color:var(--accent-dark)">${(h.totalPoints || 0).toLocaleString()} pts</span>\n          </div>\n          ${h.monthly.length ? `<div style="margin-top:8px;font-size:11px;color:var(--text-light);line-height:1.8">${h.monthly.map((m) => `<span style="display:inline-block;background:rgba(139,111,71,.1);border-radius:4px;padding:2px 7px;margin:2px;white-space:nowrap">${m.label}: <strong>${m.points}</strong></span>`).join("")}</div>` : '<p style="font-size:11px;color:var(--text-light);margin-top:6px">No monthly entries yet.</p>'}\n        </div>`,
          )
          .join("");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }));
const ROLE_ORDER = {
    "School Prefect": 1,
    "Vice Prefect": 2,
    Commander: 3,
    "Blue House Captain": 4,
    "Green House Captain": 5,
    "Red House Captain": 6,
    "Yellow House Captain": 7,
    "Blue House Vice Captain": 8,
    "Green House Vice Captain": 9,
    "Red House Vice Captain": 10,
    "Yellow House Vice Captain": 11,
  },
  HOUSE_BADGE_STYLE = {
    Blue: "background:#dbeafe;color:#1e40af",
    Green: "background:#dcfce7;color:#14532d",
    Red: "background:#fee2e2;color:#991b1b",
    Yellow: "background:#fef3c7;color:#92400e",
  };
function getVal(id) {
  return (document.getElementById(id)?.value || "").trim();
}
function setVal(id, val) {
  const el = document.getElementById(id);
  el && null != val && (el.value = val);
}
((window.previewLeaderPhoto = function (input) {
  const file = input.files[0];
  if (!file) return;
  const prev = document.getElementById("leader-photo-preview");
  if (!prev) return;
  const reader = new FileReader();
  ((reader.onload = (e) => {
    prev.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover">`;
  }),
    reader.readAsDataURL(file));
}),
  (window.saveLeader = async function () {
    const editId = document.getElementById("leader-edit-id")?.value || "",
      name = (document.getElementById("leader-name")?.value || "").trim(),
      role = document.getElementById("leader-role")?.value || "",
      house = document.getElementById("leader-house")?.value || "",
      order =
        parseInt(document.getElementById("leader-order")?.value || "") ||
        ROLE_ORDER[role] ||
        99;
    let imageUrl = (
      document.getElementById("leader-image-url")?.value || ""
    ).trim();
    const file = document.getElementById("leader-photo-file")?.files[0];
    if (!name || !role) return void showToast("⚠️ Name and role required.");
    const btn = document.querySelector("#a-leaders .btn-primary");
    btn &&
      ((btn.disabled = !0),
      (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'));
    try {
      if (file && !imageUrl) {
        const pb = document.getElementById("leader-upload-progress"),
          bar = document.getElementById("leader-progress-bar"),
          pt = document.getElementById("leader-progress-text");
        pb && (pb.style.display = "block");
        const _lRef = storageRef(
          storage,
          `teachers/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        );
        const _lTask = uploadBytesResumable(_lRef, file);
        ((imageUrl = await new Promise((res, rej) => {
          _lTask.on(
            "state_changed",
            (snap) => {
              const p =
                Math.round((snap.bytesTransferred / snap.totalBytes) * 90) + 5;
              (bar && (bar.style.width = p + "%"),
                pt && (pt.textContent = `Uploading… ${p}%`));
            },
            rej,
            () => getDownloadURL(_lTask.snapshot.ref).then(res),
          );
        })),
          setTimeout(() => {
            (pb && (pb.style.display = "none"),
              bar && (bar.style.width = "0%"));
          }, 1e3));
      }
      const data = {
        name: name,
        role: role,
        house: house,
        order: order,
        imageUrl: imageUrl || "",
        updatedAt: new Date().toISOString(),
      };
      (editId
        ? (await setDoc(doc(db, "school_leaders", editId), data, { merge: !0 }),
          showToast("✅ Leader updated!"),
          cancelLeaderEdit())
        : ((data.createdAt = new Date().toISOString()),
          await addDoc(collection(db, "school_leaders"), data),
          showToast("✅ Leader added!")),
        ["leader-name", "leader-image-url", "leader-order"].forEach((id) => {
          const e = document.getElementById(id);
          e && (e.value = "");
        }));
      const fi = document.getElementById("leader-photo-file");
      fi && (fi.value = "");
      const pv = document.getElementById("leader-photo-preview");
      (pv &&
        (pv.innerHTML =
          '<i class="fas fa-user" style="color:var(--text-light)"></i>'),
        loadAdminLeaders());
    } catch (e) {
      showToast("❌ " + e.message);
    } finally {
      btn &&
        ((btn.disabled = !1),
        (btn.innerHTML = '<i class="fas fa-save"></i> Save Leader'));
    }
  }),
  (window.cancelLeaderEdit = function () {
    ((document.getElementById("leader-edit-id").value = ""),
      (document.getElementById("leader-form-mode").textContent = "Add Leader"),
      (document.getElementById("leader-cancel-edit").style.display = "none"),
      ["leader-name", "leader-image-url", "leader-order"].forEach((id) => {
        const e = document.getElementById(id);
        e && (e.value = "");
      }));
    const fi = document.getElementById("leader-photo-file");
    fi && (fi.value = "");
    const pv = document.getElementById("leader-photo-preview");
    pv &&
      (pv.innerHTML =
        '<i class="fas fa-user" style="color:var(--text-light)"></i>');
  }),
  (window.editLeader = function (id, name, role, house, order, imgUrl) {
    if (
      ((document.getElementById("leader-edit-id").value = id),
      (document.getElementById("leader-name").value = name || ""),
      (document.getElementById("leader-role").value = role || ""),
      (document.getElementById("leader-house").value = house || ""),
      (document.getElementById("leader-order").value = order || ""),
      (document.getElementById("leader-image-url").value = imgUrl || ""),
      imgUrl)
    ) {
      const pv = document.getElementById("leader-photo-preview");
      pv &&
        (pv.innerHTML = `<img src="${imgUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`);
    }
    ((document.getElementById("leader-form-mode").textContent = "Edit Leader"),
      (document.getElementById("leader-cancel-edit").style.display = ""),
      showDash("a", "a-leaders"));
  }),
  (window.loadAdminLeaders = async function () {
    const el = document.getElementById("admin-leaders-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
      try {
        const snap = await getDocs(
          query(collection(db, "school_leaders"), limit(30)),
        );
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No leaders yet.</p>');
        const sorted = [...snap.docs]
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort(
            (a, b) =>
              (a.order || ROLE_ORDER[a.role] || 99) -
              (b.order || ROLE_ORDER[b.role] || 99),
          );
        el.innerHTML = sorted
          .map((l) => {
            const initials = (l.name || "?")
              .split(" ")
              .map((w) => w[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();
            return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:center;gap:8px"><div style="display:flex;align-items:center;gap:10px">${l.imageUrl ? `<img src="${l.imageUrl}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--accent)" onerror="this.style.display='none'">` : `<div style="width:36px;height:36px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--accent)">${initials}</div>`}<div><div style="font-weight:700;font-size:13px;color:var(--accent-dark)">${l.name || "—"}</div><div style="font-size:12px;color:var(--text-light)">${l.role || "—"}${l.house ? " · " + l.house : ""}</div></div></div><div style="display:flex;gap:6px;flex-shrink:0"><button onclick="editLeader('${l.id}','${(l.name || "").replace(/'/g, "\\'")}','${l.role || ""}','${l.house || ""}',${l.order || 99},'${l.imageUrl || ""}')" style="background:none;border:none;color:var(--accent);cursor:pointer"><i class="fas fa-edit"></i></button><button onclick="deleteLeader('${l.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button></div></div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }),
  (window.deleteLeader = async function (docId) {
    if (confirm("Delete this leader?"))
      try {
        (await deleteDoc(doc(db, "school_leaders", docId)),
          showToast("🗑️ Deleted."),
          loadAdminLeaders());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (async () => {
    (loadHomeStats(),
      loadHomeTicker(),
      loadPublicEvents(),
      loadAdmissionNotice(),
      loadPublicGallery(),
      loadDynamicHomepageContent());
  })(),
  (window._currentClassFilter = 0),
  (window.loadStudents = async function (classNum, filterBtn) {
    window._currentClassFilter = classNum;
    const tbody = document.getElementById("admin-student-tbody"),
      countEl = document.getElementById("student-count");
    if (tbody) {
      (filterBtn &&
        (document
          .querySelectorAll(".class-filter-btn")
          .forEach((b) => b.classList.remove("active-filter")),
        filterBtn.classList.add("active-filter")),
        (tbody.innerHTML =
          '<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading students...</td></tr>'));
      try {
        let q =
          0 === classNum
            ? query(collection(db, "students"), orderBy("rollNo"))
            : query(
                collection(db, "students"),
                where("class", "==", String(classNum)),
                orderBy("rollNo"),
              );
        const snap = await getDocs(q);
        if (
          ((window._loadedStudentDocs = snap.docs),
          (countEl.textContent = `${snap.docs.length} student${1 !== snap.docs.length ? "s" : ""} loaded`),
          0 === snap.docs.length)
        )
          return void (tbody.innerHTML =
            '<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-light)">No students found.</td></tr>');
        !(function (docs) {
          const tbody = document.getElementById("admin-student-tbody"),
            houseMap = {
              G: "🟢 Green",
              R: "🔴 Red",
              Y: "🟡 Yellow",
              B: "🔵 Blue",
            },
            classLabel = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" };
          tbody.innerHTML = docs
            .map((docSnap) => {
              const s = docSnap.data(),
                docId = docSnap.id,
                cls =
                  classLabel[s.class] || (s.class ? "Class " + s.class : "—"),
                gender =
                  "M" === s.gender
                    ? "Male"
                    : "F" === s.gender
                      ? "Female"
                      : s.gender || "—";
              return `<tr data-name="${(s.name || "").toLowerCase()}">\n        <td><strong style="color:var(--accent)">${s.studentId || "—"}</strong></td>\n        <td style="text-align:center">${s.rollNo || "—"}</td>\n        <td>${s.name || "—"}</td>\n        <td style="text-align:center">${cls}</td>\n        <td style="text-align:center">${gender}</td>\n        <td style="text-align:center"><span class="badge badge-info">${s.bloodGroup || "—"}</span></td>\n        <td style="text-align:center">${s.house ? houseMap[s.house] || s.house : "—"}</td>\n        <td style="font-size:12px">${s.whatsapp || s.contact || "—"}</td>\n        <td><div style="display:flex;gap:6px;flex-wrap:wrap">\n          <button class="btn btn-sm btn-outline" title="View" onclick='viewStudentDetails(${JSON.stringify(s)})'><i class="fas fa-eye"></i></button>\n          <button class="btn btn-sm btn-outline" title="Edit" onclick='editStudent("${docId}",${JSON.stringify(s)})'><i class="fas fa-edit"></i></button>\n          <button class="btn btn-sm" title="Login" onclick='openStudentLoginModal("${(s.studentId || "").replace(/"/g, "")}", "${(s.name || "").replace(/"/g, "")}", "${s.gender || "F"}", "${(s.email || "").replace(/"/g, "")}")' style="background:#1a4a8a;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px"><i class="fas fa-key"></i></button>\n          <button class="btn btn-sm" title="Link Siblings" onclick='openFamilyLinkModal("${(s.studentId || "").replace(/"/g, "")}", "${(s.name || "").replace(/"/g, "")}")' style="background:#16a34a;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px"><i class="fas fa-link"></i></button>\n          <button class="btn btn-sm btn-danger" title="Delete" onclick='promptDeleteStudent("${docId}","${(s.name || "").replace(/"/g, "")}")'><i class="fas fa-trash"></i></button>\n        </div></td>\n      </tr>`;
            })
            .join("");
        })(snap.docs);
      } catch (error) {
        ((countEl.textContent = "Load failed"),
          (tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:18px;color:#b91c1c">❌ ${error.message}</td></tr>`));
      }
    }
  }),
  (window.filterStudentTable = function () {
    const q = (
      document.getElementById("student-search")?.value || ""
    ).toLowerCase();
    document
      .querySelectorAll("#admin-student-tbody tr[data-name]")
      .forEach((tr) => {
        tr.style.display = tr.dataset.name.includes(q) ? "" : "none";
      });
  }),
  (window.openStudentModal = function () {
    ((document.getElementById("modal-title").textContent = "Add New Student"),
      (document.getElementById("sf-doc-id").value = ""),
      [
        "sf-name",
        "sf-dob",
        "sf-gender",
        "sf-blood",
        "sf-nationality",
        "sf-studentId",
        "sf-admNo",
        "sf-rollNo",
        "sf-class",
        "sf-section-field",
        "sf-house",
        "sf-admYear",
        "sf-acadYear",
        "sf-lastSchool",
        "sf-father",
        "sf-fatherOcc",
        "sf-mother",
        "sf-motherOcc",
        "sf-whatsapp",
        "sf-altContact",
        "sf-email",
        "sf-address",
        "sf-city",
        "sf-pin",
        "sf-state",
        "sf-pen",
        "sf-aadhaar",
        "sf-medical",
        "sf-remarks",
      ].forEach((id) => {
        const el = document.getElementById(id);
        el &&
          (el.value =
            "sf-nationality" === id
              ? "Indian"
              : "sf-state" === id
                ? "Meghalaya"
                : "sf-acadYear" === id
                  ? "2025-26"
                  : "");
      }),
      (document.getElementById("student-modal-overlay").style.display =
        "block"),
      (document.body.style.overflow = "hidden"));
  }),
  (window.closeStudentModal = function () {
    ((document.getElementById("student-modal-overlay").style.display = "none"),
      (document.body.style.overflow = ""));
  }),
  (window.editStudent = function (docId, s) {
    ((document.getElementById("modal-title").textContent = "Edit Student"),
      (document.getElementById("sf-doc-id").value = docId));
    const fields = {
      name: s.name,
      dob: s.dob,
      gender: s.gender,
      blood: s.bloodGroup,
      nationality: s.nationality,
      studentId: s.studentId,
      admNo: s.admissionNo,
      rollNo: s.rollNo,
      class: s.class,
      "section-field": s.section,
      house: s.house,
      admYear: s.admissionYear,
      acadYear: s.academicYear,
      lastSchool: s.lastSchool,
      father: s.fatherName,
      fatherOcc: s.fatherOccupation,
      mother: s.motherName,
      motherOcc: s.motherOccupation,
      whatsapp: s.whatsapp || s.contact,
      altContact: s.altContact,
      email: s.email,
      address: s.address,
      city: s.city,
      pin: s.pinCode,
      state: s.state,
      pen: s.penNumber || s.pen,
      aadhaar: s.aadhaar,
      medical: s.medicalNotes,
      remarks: s.remarks,
    };
    (Object.entries(fields).forEach(([k, v]) => setVal("sf-" + k, v)),
      (document.getElementById("student-modal-overlay").style.display =
        "block"),
      (document.body.style.overflow = "hidden"));
  }),
  (window.viewStudentDetails = function (s) {
    const cls =
        { PLG: "Play Group", SKG: "SKG", LKG: "LKG" }[s.class] ||
        (s.class ? "Class " + s.class : "—"),
      info = [
        ["Student ID", s.studentId],
        ["Name", s.name],
        ["DOB", s.dob],
        [
          "Gender",
          "M" === s.gender ? "Male" : "F" === s.gender ? "Female" : s.gender,
        ],
        ["Blood Group", s.bloodGroup],
        ["Class", cls],
        ["Section", s.section],
        ["Roll No.", s.rollNo],
        [
          "House",
          { G: "Green", R: "Red", Y: "Yellow", B: "Blue" }[s.house] || s.house,
        ],
        ["Father", s.fatherName],
        ["Mother", s.motherName],
        ["Contact", s.whatsapp || s.contact],
        ["Alt Contact", s.altContact],
        ["Address", s.address],
        ["PEN", s.penNumber || s.pen],
        ["Aadhaar", s.aadhaar],
      ]
        .filter(([, v]) => v)
        .map(
          ([k, v]) =>
            `<div style="display:flex;gap:12px;padding:7px 0;border-bottom:1px solid #f0ebe3"><span style="min-width:120px;font-size:12px;color:var(--text-light);font-weight:600">${k}</span><span style="font-size:13px">${v}</span></div>`,
        )
        .join(""),
      overlay = document.createElement("div");
    ((overlay.style.cssText =
      "position:fixed;inset:0;z-index:10001;background:rgba(44,31,14,0.6);backdrop-filter:blur(3px);overflow-y:auto;padding:24px 16px;display:flex;align-items:flex-start;justify-content:center"),
      (overlay.innerHTML = `<div style="background:var(--white);border-radius:18px;max-width:560px;width:100%;box-shadow:0 24px 80px rgba(44,31,14,0.28);overflow:hidden;margin:auto"><div style="background:linear-gradient(135deg,var(--accent-dark),var(--accent));padding:20px 24px;display:flex;justify-content:space-between;align-items:center"><div><h3 style="color:#fff;font-family:var(--font-head);margin:0">${s.name || "Student"}</h3><p style="color:rgba(255,255,255,0.75);font-size:13px;margin:4px 0 0">${cls}</p></div><button onclick="this.closest('div[style]').remove();document.body.style.overflow=''" style="background:rgba(255,255,255,0.15);border:none;color:#fff;width:36px;height:36px;border-radius:50%;font-size:18px;cursor:pointer">&#215;</button></div><div style="padding:20px 24px">${info}</div></div>`),
      document.body.appendChild(overlay),
      (document.body.style.overflow = "hidden"));
  }),
  (window.saveStudent = async function () {
    const btn = document.getElementById("sf-save-btn"),
      name = getVal("sf-name"),
      studentId = getVal("sf-studentId"),
      rollNo = getVal("sf-rollNo"),
      cls = getVal("sf-class"),
      gender = getVal("sf-gender"),
      father = getVal("sf-father"),
      mother = getVal("sf-mother"),
      whatsapp = getVal("sf-whatsapp"),
      address = getVal("sf-address");
    if (
      !(
        name &&
        studentId &&
        rollNo &&
        cls &&
        gender &&
        father &&
        mother &&
        whatsapp &&
        address
      )
    )
      return void showToast("⚠️ Please fill in all required fields (*).");
    const data = {
      name: name,
      studentId: studentId,
      rollNo: parseInt(rollNo) || rollNo,
      class: cls,
      section: getVal("sf-section-field"),
      house: getVal("sf-house"),
      gender: gender,
      dob: getVal("sf-dob"),
      bloodGroup: getVal("sf-blood"),
      nationality: getVal("sf-nationality"),
      admissionNo: getVal("sf-admNo"),
      admissionYear: getVal("sf-admYear"),
      academicYear: getVal("sf-acadYear"),
      lastSchool: getVal("sf-lastSchool"),
      fatherName: father,
      fatherOccupation: getVal("sf-fatherOcc"),
      motherName: mother,
      motherOccupation: getVal("sf-motherOcc"),
      whatsapp: whatsapp,
      altContact: getVal("sf-altContact"),
      email: getVal("sf-email"),
      address: address,
      city: getVal("sf-city"),
      pinCode: getVal("sf-pin"),
      state: getVal("sf-state"),
      penNumber: getVal("sf-pen"),
      aadhaar: getVal("sf-aadhaar"),
      medicalNotes: getVal("sf-medical"),
      remarks: getVal("sf-remarks"),
      updatedAt: new Date().toISOString(),
    };
    ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'),
      (btn.disabled = !0));
    try {
      const docId = document.getElementById("sf-doc-id").value;
      (docId
        ? (await setDoc(doc(db, "students", docId), data, { merge: !0 }),
          showToast("✅ Student updated!"))
        : ((data.createdAt = new Date().toISOString()),
          await addDoc(collection(db, "students"), data),
          showToast("✅ Student added!")),
        closeStudentModal(),
        await window.loadStudents(window._currentClassFilter));
    } catch (err) {
      showToast("❌ Save failed: " + err.message);
    } finally {
      ((btn.innerHTML = '<i class="fas fa-save"></i> Save Student'),
        (btn.disabled = !1));
    }
  }),
  (window._pendingDeleteId = null),
  (window.promptDeleteStudent = function (docId, name) {
    ((window._pendingDeleteId = docId),
      (document.getElementById("delete-confirm-msg").textContent =
        `Delete "${name}"? This cannot be undone.`),
      (document.getElementById("delete-confirm-overlay").style.display =
        "flex"));
  }),
  (window.closeDeleteConfirm = function () {
    ((document.getElementById("delete-confirm-overlay").style.display = "none"),
      (window._pendingDeleteId = null));
  }),
  (window.confirmDeleteStudent = async function () {
    const docId = window._pendingDeleteId;
    if (!docId) return;
    const btn = document.getElementById("confirm-delete-btn");
    ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'),
      (btn.disabled = !0));
    try {
      (await deleteDoc(doc(db, "students", docId)),
        showToast("🗑️ Student deleted."),
        closeDeleteConfirm(),
        await window.loadStudents(window._currentClassFilter));
    } catch (err) {
      showToast("❌ " + err.message);
    } finally {
      ((btn.innerHTML = '<i class="fas fa-trash-alt"></i> Yes, Delete'),
        (btn.disabled = !1));
    }
  }));
const _ROUTINE_CLASS_MAP = {
  1: "I",
  2: "II",
  3: "III",
  4: "IV",
  5: "V",
  6: "VI",
  7: "VII",
  8: "VIII",
  9: "IX",
  10: "X",
  I: "I",
  II: "II",
  III: "III",
  IV: "IV",
  V: "V",
  VI: "VI",
  VII: "VII",
  VIII: "VIII",
  IX: "IX",
  X: "X",
};
((window.portalClassToRoutine = function (cls) {
  if (null == cls) return "";
  const k = String(cls).trim().toUpperCase();
  return _ROUTINE_CLASS_MAP[k] || k;
}),
  (window.routineHasClass = function (cls) {
    return !!_ROUTINE_CLASS_MAP[
      String(cls || "")
        .trim()
        .toUpperCase()
    ];
  }));
const _ROUTINE_DAY_NAMES = {
  1: "Day 1",
  2: "Day 2",
  3: "Day 3",
  4: "Day 4",
  5: "Day 5",
  6: "Day 6",
  7: "Day 7",
};
function _classVariants(cls) {
  const R2N = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
    },
    N2R = {
      1: "I",
      2: "II",
      3: "III",
      4: "IV",
      5: "V",
      6: "VI",
      7: "VII",
      8: "VIII",
      9: "IX",
      10: "X",
    },
    raw = String(cls || "").trim();
  if (!raw) return [""];
  const out = new Set([raw, raw.toUpperCase(), raw.toLowerCase()]),
    asNum = parseInt(raw, 10);
  isNaN(asNum) ||
    (out.add(asNum), out.add(String(asNum)), N2R[asNum] && out.add(N2R[asNum]));
  const upper = raw.toUpperCase();
  return (
    R2N[upper] && (out.add(R2N[upper]), out.add(String(R2N[upper]))),
    Array.from(out).slice(0, 10)
  );
}
async function _routineLoadSubjects(force) {
  const s = window._routineState;
  if (s.subjects && !force) return s.subjects;
  const snap = await getDocs(collection(db, "subjects")),
    map = {};
  return (
    snap.docs.forEach((d) => {
      const x = d.data();
      x && void 0 !== x.code && (map[x.code] = x.name);
    }),
    (s.subjects = map),
    map
  );
}
async function _routineLoadTeachers(force) {
  const s = window._routineState;
  if (s.teachersByInitials && !force) return s.teachersByInitials;
  const snap = await getDocs(collection(db, "teachers")),
    map = {};
  return (
    snap.docs.forEach((d) => {
      const t = d.data() || {},
        ini = (t.initials || t.routineInitials || "")
          .toString()
          .toUpperCase()
          .trim();
      ini &&
        (map[ini] = {
          fullName: t.fullName || t.name || ini,
          name: t.name || t.fullName || ini,
        });
    }),
    (s.teachersByInitials = map),
    map
  );
}
async function _routineGetSlotsForPeriod(dayNumber, periodNumber) {
  const ref = collection(
    db,
    "routine",
    String(dayNumber),
    "periods",
    String(periodNumber),
    "slots",
  );
  return (await getDocs(ref)).docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function _routineGetDay(dayNumber) {
  const out = {};
  for (let p = 1; p <= 6; p++)
    out[`period${p}`] = await _routineGetSlotsForPeriod(dayNumber, p);
  return out;
}
function _resolveSubject(code, map) {
  return Array.isArray(code)
    ? code.map((c) => map[c] || `Subject ${c}`).join(" / ")
    : map[code] || (void 0 !== code ? `Subject ${code}` : "—");
}
((window.routineDayLabel = function (n) {
  return _ROUTINE_DAY_NAMES[Number(n)] || `Day ${n}`;
}),
  (window.routineFormatTiming = function (t) {
    return t && t.start && t.end ? `${t.start} – ${t.end}` : "--:-- to --:--";
  }),
  (window.routineActivePeriodIndex = function (timings) {
    if (!timings) return -1;
    const now = new Date(),
      cur = 60 * now.getHours() + now.getMinutes();
    for (let i = 1; i <= 6; i++) {
      const t = timings[`period${i}`];
      if (!t || !t.start || !t.end) continue;
      const [sh, sm] = t.start.split(":").map(Number),
        [eh, em] = t.end.split(":").map(Number);
      if (cur >= 60 * sh + sm && cur < 60 * eh + em) return i - 1;
    }
    return -1;
  }),
  (window.loadStudentProfile = async function (user) {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) return;
      const userData = userDoc.data(),
        studentId = userData.studentId;
      if (
        ((window._studentId = studentId || userData.loginId || ""),
        (window._studentName = userData.name || "Student"),
        !studentId)
      ) {
        const nameEl = document.getElementById("student-name");
        (nameEl && (nameEl.textContent = userData.name || "Student"),
          showToast("ℹ️ No studentId linked."));
        const _l = document.getElementById("s-portal-loader");
        return void (
          _l &&
          (_l.classList.add("fade-out"),
          setTimeout(() => {
            ((_l.style.display = "none"), _l.classList.remove("fade-out"));
          }, 380))
        );
      }
      let studentSnap = { docs: [], empty: !0 };
      try {
        studentSnap = await getDocs(
          query(
            collection(db, "students"),
            where("studentId", "==", studentId),
          ),
        );
      } catch (e) {}
      if (studentSnap.empty)
        try {
          const d = await getDoc(doc(db, "students", studentId));
          d.exists() && (studentSnap = { docs: [d], empty: !1 });
        } catch (e) {}
      if (studentSnap.empty) {
        const nameEl = document.getElementById("student-name");
        nameEl && (nameEl.textContent = userData.name || "Student");
        const headerName = document.getElementById("s-header-name");
        (headerName && (headerName.textContent = userData.name || "Student"),
          (window._studentClass = userData.class || ""),
          (window._studentRollNo = userData.rollNo || ""));
        const _l2 = document.getElementById("s-portal-loader");
        return (
          _l2 &&
            (_l2.classList.add("fade-out"),
            setTimeout(() => {
              ((_l2.style.display = "none"), _l2.classList.remove("fade-out"));
            }, 380)),
          void loadStudentHomework()
        );
      }
      const s = studentSnap.docs[0].data();
      ((window._studentClass = String(s.class || "")),
        (window._studentRollNo = s.rollNo),
        (window._studentName = s.name || userData.name || "Student"));
      const setTxt = (id, val) => {
          const el = document.getElementById(id);
          el && (el.textContent = val || "—");
        },
        setPhone = (id, val) => {
          const el = document.getElementById(id);
          if (!el) return;
          if (!val || "—" === val) return void (el.textContent = "—");
          const clean = val.replace(/[^0-9+\-() ]/g, "");
          clean.replace(/\D/g, "")
            ? (el.innerHTML = `<a href="tel:${clean}" style="color:var(--accent);font-weight:700;text-decoration:none">${val}</a>`)
            : (el.textContent = val);
        },
        houseMap2 = {
          G: "🟢 Green",
          R: "🔴 Red",
          Y: "🟡 Yellow",
          B: "🔵 Blue",
        },
        classLabel2 = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
        getClsLabel = (c) => classLabel2[c] || (c ? "Class " + c : "—"),
        nameEl = document.getElementById("student-name");
      nameEl && (nameEl.textContent = s.name || userData.name || "Student");
      const headerName = document.getElementById("s-header-name");
      headerName && (headerName.textContent = s.name || "Student");
      const headerMeta = document.getElementById("s-header-meta");
      headerMeta &&
        (headerMeta.textContent = `Student · Class ${s.class} · Roll No. ${s.rollNo}`);
      const headerAvatar = document.getElementById("s-header-avatar"),
        parts = (s.name || "S").split(" ");
      (headerAvatar &&
        (headerAvatar.textContent =
          parts.length >= 2
            ? parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
            : parts[0].charAt(0)),
        setTxt("s-profile-name", s.name),
        setTxt(
          "s-profile-sub",
          `Class ${getClsLabel(s.class)} · Roll No. ${s.rollNo}`,
        ));
      const tagAdm = document.getElementById("s-tag-admno");
      (tagAdm &&
        (tagAdm.textContent = "Admission No: " + (s.admissionNo || "—")),
        setTxt("s-card-name", s.name),
        setTxt(
          "s-card-class",
          `${getClsLabel(s.class)}${s.section ? " – Section " + s.section : ""}`,
        ),
        setTxt("s-card-roll", s.rollNo),
        setTxt("s-card-admno", s.admissionNo || "—"),
        setTxt("s-card-dob", s.dob || "—"),
        setTxt("s-card-blood", s.bloodGroup || "—"),
        setTxt(
          "s-card-gender",
          "M" === s.gender
            ? "Male"
            : "F" === s.gender
              ? "Female"
              : s.gender || "—",
        ),
        setTxt("s-card-nationality", s.nationality || "Indian"),
        setPhone("s-card-contact", s.whatsapp || s.contact || "—"),
        setTxt("s-card-address", s.address || "—"),
        setTxt("s-card-father", s.fatherName || "—"),
        setTxt("s-card-mother", s.motherName || "—"),
        setPhone(
          "s-card-parent-contact",
          s.whatsapp || s.contact || s.altContact || "—",
        ),
        setTxt("s-card-pen", s.penNumber || s.pen || "—"),
        setTxt("s-card-house", houseMap2[s.house] || s.house || "—"));
      const bal = parseFloat(s.feeBalance ?? s.feeTotal ?? 0),
        feeDueEl = document.getElementById("s-stat-fee-due");
      feeDueEl &&
        (feeDueEl.textContent =
          bal > 0 ? "₹" + bal.toLocaleString("en-IN") : "₹0");
      const _ldr = document.getElementById("s-portal-loader");
      (_ldr &&
        (_ldr.classList.add("fade-out"),
        setTimeout(() => {
          ((_ldr.style.display = "none"), _ldr.classList.remove("fade-out"));
        }, 380)),
        loadStudentHomework(),
        loadStudentNotices(),
        loadStudentFees(),
        window.loadStudentDashWidgets && loadStudentDashWidgets(),
        window.loadAcademicSnapshot(studentId),
        (async function (studentId, classId, feeBalance) {
          const banner = document.getElementById("s-reportcard-banner"),
            feeBanner = document.getElementById("s-reportcard-feebanner");
          if (!banner || !studentId || !classId) return;
          try {
            const ftDoc = await getDoc(
              doc(db, "marks", `${classId}_FT`, "students", studentId),
            );
            if (!ftDoc.exists()) return;
            const data = ftDoc.data(),
              released = !0 === data?.releasedToStudent,
              feeHeld = !0 === data?.feeHold,
              feesCleared = feeBalance <= 0;
            released && feesCleared
              ? ((banner.style.display = "flex"),
                (window._studentRCData = {
                  hyClassId: `${classId}_HY`,
                  ftClassId: `${classId}_FT`,
                  studentId: studentId,
                }))
              : (feeHeld || (released && !feesCleared)) &&
                feeBanner &&
                (feeBanner.style.display = "flex");
          } catch (e) {
            console.warn("checkStudentReportCardRelease:", e.message);
          }
        })(
          studentId,
          String(s.class || ""),
          parseFloat(s.feeBalance ?? s.feeTotal ?? 0),
        ));
    } catch (e) {
      showToast("⚠️ Could not load profile: " + e.message);
      const _le = document.getElementById("s-portal-loader");
      _le &&
        (_le.classList.add("fade-out"),
        setTimeout(() => {
          ((_le.style.display = "none"), _le.classList.remove("fade-out"));
        }, 380));
    }
  }),
  (window.studentViewReportCard = async function () {
    const rc = window._studentRCData;
    if (rc) {
      showToast("Loading your report card…");
      try {
        const [hyDoc, ftDoc] = await Promise.all([
          getDoc(doc(db, "marks", rc.hyClassId, "students", rc.studentId)),
          getDoc(doc(db, "marks", rc.ftClassId, "students", rc.studentId)),
        ]);
        if (!ftDoc.exists()) return void showToast("❌ Report card not found.");
        const classId = rc.hyClassId.replace("_HY", "");
        (sessionStorage.setItem(
          "sfds_adminRC",
          JSON.stringify({
            hyData: hyDoc.data() || {},
            ftData: ftDoc.data() || {},
            classId: classId,
          }),
        ),
          window.open("/Sfs-report-card/reportcard.html", "_blank"));
      } catch (e) {
        showToast("❌ " + e.message);
      }
    }
  }),
  (window.loadAcademicSnapshot = async function (studentId) {
    const container = document.getElementById("s-academic-snapshot");
    if (!container || !studentId) return;
    const docId = studentId.replace(/\//g, "_").replace(/\s+/g, "_");
    try {
      const snap = await getDoc(doc(db, "student_profiles", docId));
      if (!snap.exists())
        return void (container.innerHTML =
          '\n          <h4><i class="fas fa-chart-line"></i> Academic Performance</h4>\n          <p class="academic-snapshot-empty">Academic report not yet available. Reports are generated after assessments are reviewed.</p>');
      const p = snap.data(),
        trendClass =
          "improving" === p.trendDirection
            ? "trend-improving"
            : "declining" === p.trendDirection
              ? "trend-declining"
              : "trend-stable",
        trendIcon =
          "improving" === p.trendDirection
            ? "↑"
            : "declining" === p.trendDirection
              ? "↓"
              : "→",
        alertsHtml =
          (p.strongestSubject,
          p.weakestSubject,
          p.activeAlerts?.length > 0
            ? `\n        <div class="academic-alerts">\n          <div class="academic-alerts-title"><i class="fas fa-exclamation-triangle"></i> Alerts</div>\n          ${(p.alertReasons || []).map((r) => `<div class="academic-alert-item">• ${r}</div>`).join("")}\n        </div>`
            : ""),
        reportUrl =
          "string" == typeof window._academicAppUrl && window._academicAppUrl
            ? `${window._academicAppUrl}?student=${encodeURIComponent(studentId)}`
            : "",
        linkClass = reportUrl ? "" : " disabled",
        linkHref = reportUrl || "#",
        subjectBarsHtml =
          Array.isArray(p.subjectBreakdown) && p.subjectBreakdown.length
            ? `<div class="academic-subject-breakdown">\n            <div class="academic-section-title"><i class="fas fa-book"></i> Subject Breakdown</div>\n            ${p.subjectBreakdown
                .sort((a, b) => b.averagePercentage - a.averagePercentage)
                .map((s) => {
                  const pct = s.averagePercentage ?? 0,
                    barClass =
                      pct >= 75
                        ? "bar-good"
                        : pct >= 50
                          ? "bar-avg"
                          : pct >= 40
                            ? "bar-low"
                            : "bar-risk";
                  return `<div class="subject-bar-row">\n                <div class="subject-bar-name">${s.subject_name}</div>\n                <div class="subject-bar-track">\n                  <div class="subject-bar-fill ${barClass}" style="width:${Math.min(pct, 100)}%"></div>\n                </div>\n                <div class="subject-bar-pct">${pct}%</div>\n              </div>`;
                })
                .join("")}\n          </div>`
            : "",
        hasTrend = Array.isArray(p.monthlyTrend) && p.monthlyTrend.length > 1,
        trendChartHtml = hasTrend
          ? '<div class="academic-section-title" style="margin-top:16px"><i class="fas fa-chart-area"></i> Monthly Trend</div>\n           <div class="academic-trend-chart-wrap"><canvas id="s-academic-trend-chart" height="120"></canvas></div>'
          : "";
      if (
        ((container.innerHTML = `\n        <h4><i class="fas fa-chart-line"></i> Academic Performance</h4>\n        <div class="academic-stat-row">\n          <div class="academic-stat">\n            <div class="academic-stat-val">${p.overallAverage ?? "—"}%</div>\n            <div class="academic-stat-label">Overall Average</div>\n            <span class="academic-trend-badge ${trendClass}">${trendIcon} ${p.trendLabel || "Stable"}</span>\n          </div>\n          <div class="academic-stat">\n            <div class="academic-stat-val">${p.monthsTracked ?? "—"}</div>\n            <div class="academic-stat-label">Months Tracked</div>\n          </div>\n          <div class="academic-stat">\n            <div class="academic-stat-val">${p.totalSessions ?? "—"}</div>\n            <div class="academic-stat-label">Total Sessions</div>\n          </div>\n        </div>\n        ${alertsHtml}\n        ${p.summaryText ? `<div class="academic-summary">${p.summaryText}</div>` : ""}\n        ${subjectBarsHtml}\n        ${trendChartHtml}\n        <div class="academic-report-link">\n          <a href="${linkHref}" id="s-academic-report-btn" class="${linkClass}" ${reportUrl ? 'target="_blank"' : ""}>\n            <i class="fas fa-external-link-alt"></i> View Full Academic Report\n          </a>\n        </div>`),
        hasTrend)
      ) {
        const canvas = document.getElementById("s-academic-trend-chart");
        canvas &&
          window.Chart &&
          new window.Chart(canvas, {
            type: "line",
            data: {
              labels: p.monthlyTrend.map((m) => m.month),
              datasets: [
                {
                  label: "Overall %",
                  data: p.monthlyTrend.map((m) => m.overallPercentage),
                  borderColor: "#a07735",
                  backgroundColor: "rgba(160,119,53,0.12)",
                  borderWidth: 2,
                  pointRadius: 4,
                  pointBackgroundColor: "#a07735",
                  fill: !0,
                  tension: 0.3,
                },
              ],
            },
            options: {
              responsive: !0,
              plugins: { legend: { display: !1 } },
              scales: {
                y: {
                  min: 0,
                  max: 100,
                  ticks: { callback: (v) => v + "%", font: { size: 11 } },
                  grid: { color: "rgba(0,0,0,0.06)" },
                },
                x: { ticks: { font: { size: 11 } }, grid: { display: !1 } },
              },
            },
          });
      }
    } catch (e) {
      ((container.innerHTML =
        '\n        <h4><i class="fas fa-chart-line"></i> Academic Performance</h4>\n        <p class="academic-snapshot-empty">Could not load academic report.</p>'),
        console.warn("Academic snapshot load failed:", e.message));
    }
  }),
  (window.loadStudentNotificationCenter = async function (user) {
    if (user && user.uid && window.NotificationCenter)
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (!userSnap.exists()) return;
        const u = userSnap.data(),
          sid =
            (window.getActiveStudentId && window.getActiveStudentId()) ||
            u.studentId ||
            window._studentId ||
            "",
          cls = window._studentClass || u.class || "";
        let present = 0,
          absent = 0,
          total = 0,
          todayStatus = "present";
        if (
          (console.log(
            "[Attendance debug] sid=",
            sid,
            "cls=",
            cls,
            "variants=",
            _classVariants(cls),
          ),
          sid && cls)
        ) {
          const norm = (v) =>
              String(v || "")
                .trim()
                .toUpperCase(),
            sidN = norm(sid),
            attSnap = await getDocs(
              query(
                collection(db, "attendance_daily"),
                where("class", "in", _classVariants(cls)),
                limit(200),
              ),
            );
          console.log("[Attendance debug] docs returned:", attSnap.size);
          const todayKey = new Date().toISOString().split("T")[0];
          attSnap.forEach((d) => {
            const a = d.data(),
              isAbsent =
                Array.isArray(a.absent) &&
                a.absent.some((x) => norm(x) === sidN),
              isLate =
                Array.isArray(a.late) && a.late.some((x) => norm(x) === sidN);
            (total++,
              isAbsent ? absent++ : present++,
              a.date === todayKey &&
                (todayStatus = isAbsent
                  ? "absent"
                  : isLate
                    ? "late"
                    : "present"));
          });
        }
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
        let feeData = {
          isPaid: !0,
          amount: 0,
          term: "Current Term — 2025–26",
          dueDate: "",
          paidAmount: 0,
          upiId: "stfrancisschool@upi",
        };
        if (sid) {
          const feeSnap = await getDocs(
            query(
              collection(db, "fees"),
              where("studentId", "==", sid),
              limit(20),
            ),
          );
          let totalDue = 0,
            totalPaid = 0,
            latestDue = "";
          (feeSnap.forEach((d) => {
            const f = d.data(),
              amt = parseFloat(f.amount) || 0;
            "approved" === (f.status || "").toLowerCase()
              ? (totalPaid += amt)
              : ((totalDue += amt),
                f.dueDate && f.dueDate > latestDue && (latestDue = f.dueDate));
          }),
            (feeData = {
              isPaid: 0 === totalDue,
              amount: totalDue || totalPaid,
              term: "Current Term — 2025–26",
              dueDate:
                latestDue ||
                new Date(Date.now() + 1296e6).toISOString().split("T")[0],
              paidAmount: totalPaid,
              upiId: "stfrancisschool@upi",
            }));
        }
        const notices = [
          ...(await getDocs(query(collection(db, "notices"), limit(20)))).docs,
        ]
          .map((d) => {
            const n = d.data();
            return {
              audience: (n.audience || "all").toLowerCase(),
              message: n.title || n.body || "",
              isUrgent: "urgent" === (n.priority || "").toLowerCase(),
              tag: n.priority || "Notice",
              date: ((n.postedAt || n.createdAt || "") + "").split("T")[0],
            };
          })
          .filter(
            (n) =>
              "all" === n.audience ||
              "students" === n.audience ||
              "both" === n.audience ||
              (cls && n.audience === cls.toLowerCase()),
          )
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        _checkHolidayBanner("s-holiday-banner", "s-holiday-banner-msg");
        try {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const in30 = new Date(today);
          in30.setDate(today.getDate() + 30);
          const todayStr = today.toISOString().split("T")[0],
            in30Str = in30.toISOString().split("T")[0];
          (await getDocs(query(collection(db, "holidays"), limit(50)))).forEach(
            (d) => {
              const h = d.data();
              if (!h.date || h.date < todayStr || h.date > in30Str) return;
              const fmt = new Date(h.date + "T00:00:00").toLocaleDateString(
                  "en-IN",
                  { weekday: "long", day: "numeric", month: "long" },
                ),
                isToday = h.date === todayStr,
                isTomorrow =
                  h.date ===
                  new Date(today.getTime() + 864e5).toISOString().split("T")[0],
                prefix = isToday
                  ? "🎉 Today — "
                  : isTomorrow
                    ? "📅 Tomorrow — "
                    : `📅 ${fmt} — `;
              notices.unshift({
                audience: "all",
                message: `${prefix}${h.reason} (${h.type || "Holiday"})`,
                isUrgent: isToday || isTomorrow,
                tag: "Holiday",
                date: h.date,
              });
            },
          );
        } catch (e) {
          console.warn("[Holidays] fetch skipped:", e.message);
        }
        const exams = [],
          setEl = (id, v) => {
            countUp(document.getElementById(id), v);
          };
        setEl("s-stat-attendance", total > 0 ? percentage + "%" : "—");
        let stuSnap = null;
        if (sid)
          try {
            stuSnap = await getDocs(
              query(
                collection(db, "students"),
                where("studentId", "==", sid),
                limit(1),
              ),
            );
          } catch (e) {
            console.warn(
              "[NotificationCenter] student feeBalance lookup skipped:",
              e.message,
            );
          }
        if (stuSnap && !stuSnap.empty) {
          const bal = parseFloat(stuSnap.docs[0].data().feeBalance || 0);
          setEl(
            "s-stat-fee-due",
            bal > 0 ? "₹" + bal.toLocaleString("en-IN") : "₹0",
          );
        } else
          setEl(
            "s-stat-fee-due",
            feeData.isPaid
              ? "₹0"
              : "₹" + (feeData.amount || 0).toLocaleString("en-IN"),
          );
        (setEl("s-stat-days-exam", "—"),
          window.NotificationCenter &&
            window.NotificationCenter.render(
              {
                attendance: {
                  todayStatus: todayStatus,
                  percentage: percentage,
                  present: present,
                  absent: absent,
                  total: total,
                },
                fees: feeData,
                exams: exams,
              },
              notices,
            ));
      } catch (e) {
        console.warn(
          "[NotificationCenter] auth-bound fetch failed:",
          e.message,
        );
      }
  }),
  (window._routineState = {
    currentDay: 1,
    viewDay: null,
    timings: null,
    subjects: null,
    teachersByInitials: null,
    daySubs: { s: null, t: null },
    timingSubs: { s: null, t: null },
    activeTimer: null,
  }));
const _ROMAN_PERIODS = ["I", "II", "III", "IV", "V", "VI"];
async function _routineEnsureSettings() {
  const s = window._routineState;
  if (s._settingsLoaded) return;
  const [daySnap, timingsSnap] = await Promise.all([
    getDoc(doc(db, "settings", "schoolDay")),
    getDoc(doc(db, "settings", "periodTimings")),
  ]);
  (daySnap.exists() && (s.currentDay = Number(daySnap.data().currentDay) || 1),
    (s.timings = timingsSnap.exists() ? timingsSnap.data() : null),
    (s._settingsLoaded = !0));
}
function _routineStartListeners(prefix, onChange) {
  const s = window._routineState;
  ((s[`_cb_${prefix}`] = onChange),
    s.daySubs[prefix] ||
      ((s.daySubs[prefix] = onSnapshot(
        doc(db, "settings", "schoolDay"),
        (snap) => {
          if (!snap.exists()) return;
          const next = Number(snap.data().currentDay) || 1,
            changed = next !== s.currentDay;
          ((s.currentDay = next),
            changed &&
              null === s.viewDay &&
              s[`_cb_${prefix}`] &&
              s[`_cb_${prefix}`]());
        },
      )),
      (s.timingSubs[prefix] = onSnapshot(
        doc(db, "settings", "periodTimings"),
        (snap) => {
          const next = snap.exists() ? snap.data() : null,
            changedJSON = JSON.stringify(next) !== JSON.stringify(s.timings);
          ((s.timings = next),
            changedJSON && s[`_cb_${prefix}`] && s[`_cb_${prefix}`]());
        },
      )),
      s.activeTimer ||
        (s.activeTimer = setInterval(() => {
          const sr = document.getElementById("s-routine"),
            tr = document.getElementById("t-schedule");
          (sr && sr.classList.contains("active") && s._cb_s && s._cb_s(),
            tr && tr.classList.contains("active") && s._cb_t && s._cb_t());
        }, 6e4))));
}
async function _resolveTeacherInitials() {
  if (window._teacherInitials) return window._teacherInitials;
  const user = window._firebaseAuth?.currentUser;
  if (!user) return "";
  let teacherDoc = null;
  try {
    const direct = await getDoc(doc(db, "teachers", user.uid));
    direct.exists() && (teacherDoc = direct.data());
  } catch (_) {}
  if (!teacherDoc) {
    const tid = window._teacherId || "";
    if (tid)
      try {
        let snap = await getDocs(
          query(collection(db, "teachers"), where("teacherId", "==", tid)),
        );
        (snap.empty &&
          (snap = await getDocs(
            query(
              collection(db, "teachers"),
              where("teacherId", "==", tid.toUpperCase()),
            ),
          )),
          snap.empty || (teacherDoc = snap.docs[0].data()));
      } catch (_) {}
  }
  let ini = "";
  if (
    (teacherDoc &&
      (ini = (teacherDoc.routineInitials || teacherDoc.initials || "")
        .toString()
        .toUpperCase()
        .trim()),
    !ini && teacherDoc && (teacherDoc.name || teacherDoc.fullName))
  ) {
    const wantName = (teacherDoc.name || teacherDoc.fullName || "")
      .toLowerCase()
      .trim();
    await _routineLoadTeachers();
    const map = window._routineState.teachersByInitials || {};
    for (const k of Object.keys(map))
      if ((map[k].fullName || "").toLowerCase().trim() === wantName) {
        ini = k;
        break;
      }
  }
  return ((window._teacherInitials = ini), ini);
}
function _syncSchedTabs(active) {
  const mine = document.getElementById("t-sched-tab-mine"),
    school = document.getElementById("t-sched-tab-school"),
    title = document.getElementById("t-schedule-title");
  mine &&
    school &&
    ("school" === active
      ? ((mine.style.background = "transparent"),
        (mine.style.color = "var(--text-light)"),
        (school.style.background = "var(--accent)"),
        (school.style.color = "#fff"),
        title &&
          (title.innerHTML =
            '<i class="fas fa-school" style="margin-right:8px;color:var(--accent)"></i>School Day Schedule'))
      : ((school.style.background = "transparent"),
        (school.style.color = "var(--text-light)"),
        (mine.style.background = "var(--accent)"),
        (mine.style.color = "#fff"),
        title &&
          (title.innerHTML =
            '<i class="fas fa-clock" style="margin-right:8px;color:var(--accent)"></i>My Teaching Schedule')));
}
async function _loadRecentNotices(elId, audienceFilter) {
  const el = document.getElementById(elId);
  if (el)
    try {
      const list = (
        await getDocs(query(collection(db, "notices"), limit(20)))
      ).docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((n) => {
          const a = (n.audience || "all").toLowerCase();
          return audienceFilter(a, n);
        })
        .sort((a, b) =>
          (b.postedAt || b.createdAt || "").localeCompare(
            a.postedAt || a.createdAt || "",
          ),
        )
        .slice(0, 4);
      if (!list.length)
        return void (el.innerHTML =
          '<p style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">No notices yet.</p>');
      const dot = (p) =>
        "Urgent" === p
          ? "var(--danger)"
          : "Important" === p
            ? "var(--warning)"
            : "var(--info)";
      el.innerHTML = list
        .map((n) => {
          const date = n.postedAt
            ? new Date(n.postedAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
              })
            : "";
          return (
            ((window._noticeModalData = window._noticeModalData || {})[n.id] =
              n),
            `<div class="chapter-item" style="cursor:pointer" onclick="openNoticeModal('${(n.id || "").replace(/'/g, "&#39;")}')"><i class="fas fa-circle" style="color:${dot(n.priority)};font-size:8px;margin-right:8px"></i>${(n.title || "").replace(/[<>]/g, "")} ${date ? `<span style="color:var(--text-light);font-size:11px;margin-left:4px">· ${date}</span>` : ""}</div>`
          );
        })
        .join("");
    } catch (e) {
      el.innerHTML = `<p style="color:var(--danger);font-size:13px;padding:12px">${e.message}</p>`;
    }
}
function _scheduleEmoji(label) {
  const l = label.toLowerCase();
  return l.includes("english")
    ? "📘"
    : l.includes("hindi")
      ? "📗"
      : l.includes("math")
        ? "📐"
        : l.includes("science") ||
            l.includes("physics") ||
            l.includes("chemistry") ||
            l.includes("biology")
          ? "🔬"
          : l.includes("computer")
            ? "💻"
            : l.includes("social") ||
                l.includes("history") ||
                l.includes("civics") ||
                l.includes("geography")
              ? "🌍"
              : l.includes("free")
                ? "☕"
                : l.includes("value") || l.includes("catechism")
                  ? "✝️"
                  : "📖";
}
async function _renderDashScheduleRows(
  elId,
  ini,
  isStudent,
  studentRoutineClass,
) {
  const el = document.getElementById(elId);
  if (el)
    try {
      (await _routineEnsureSettings(),
        await _routineLoadSubjects(),
        await _routineLoadTeachers());
      const s = window._routineState,
        day = s.currentDay || 1,
        dayData = await _routineGetDay(day),
        active = window.routineActivePeriodIndex(s.timings),
        rows = [];
      for (let i = 0; i < 6; i++) {
        const slots = dayData[`period${i + 1}`] || [];
        let slot = null;
        isStudent
          ? (slot = slots.find(
              (x) =>
                x.className === studentRoutineClass ||
                (x.involvedClasses &&
                  x.involvedClasses.includes(studentRoutineClass)),
            ))
          : ini &&
            (slot = slots.find(
              (x) => (x.teacherInitials || "").toUpperCase() === ini,
            ));
        const t = s.timings ? s.timings[`period${i + 1}`] : null,
          tStr = t && t.start ? t.start : "--:--",
          isActive = i === active;
        let label = isStudent ? "Free" : "Free Period";
        if (slot)
          if ("value-cate-split" === slot.slotType)
            label = "Value Ed. / Catechism";
          else if ("dual-subject" === slot.slotType)
            label = isStudent
              ? "English I / II"
              : `English I/II · Class ${slot.className}`;
          else {
            const subj = Array.isArray(slot.subjectCode)
              ? slot.subjectCode
                  .map((c) => s.subjects[c] || `Subj ${c}`)
                  .join(" / ")
              : s.subjects[slot.subjectCode] || `Subject ${slot.subjectCode}`;
            label = isStudent ? subj : `${subj} · Class ${slot.className}`;
          }
        const isFree = !slot,
          emoji = _scheduleEmoji(label),
          classLabel = slot
            ? isStudent
              ? ""
              : `<span class="sched-class">${slot.className ? "Class " + slot.className : ""}</span>`
            : "";
        rows.push(
          `\n          <div class="sched-card${isActive ? " sched-card--active" : ""}${isFree ? " sched-card--free" : ""}">\n            <span class="sched-time">${tStr}</span>\n            <span class="sched-subject">${emoji} ${label}</span>\n            ${classLabel}\n            ${isActive ? '<span class="sched-now-badge">NOW</span>' : ""}\n          </div>`,
        );
      }
      const dayBadge = `<div class="sched-day-badge"><i class="fas fa-calendar-day"></i> ${window.routineDayLabel(day)}</div>`;
      el.innerHTML = dayBadge + rows.join("");
    } catch (e) {
      el.innerHTML = `<p style="color:var(--danger);font-size:13px;padding:12px">${e.message}</p>`;
    }
}
async function _checkHolidayBanner(bannerId, msgId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const toLocalDate = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      todayStr = toLocalDate(today),
      tomorrowStr = toLocalDate(tomorrow),
      snap = await getDocs(query(collection(db, "holidays"), limit(50)));
    let match = null;
    if (
      (snap.forEach((d) => {
        const h = d.data();
        (h.date === todayStr && (match = { ...h, when: "today" }),
          h.date !== tomorrowStr ||
            match ||
            (match = { ...h, when: "tomorrow" }));
      }),
      !match)
    )
      return;
    const msg =
      "today" === match.when
        ? `Today is a holiday — ${match.reason} (${match.type || "Holiday"}). No classes today.`
        : `Tomorrow is a holiday — ${match.reason} (${match.type || "Holiday"}). No classes tomorrow.`;
    document.getElementById(bannerId)?.remove();
    const portalPage = bannerId.startsWith("t-") ? "teacher" : "student",
      header = document.querySelector(`#page-${portalPage}-dash .dash-header`);
    if (!header) return;
    const bar = document.createElement("div");
    ((bar.id = bannerId),
      (bar.style.cssText =
        "background:linear-gradient(90deg,#059669,#047857);color:#fff;padding:10px 24px;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:12px;"),
      (bar.innerHTML = `<span><i class="fas fa-umbrella-beach" style="margin-right:8px"></i>${msg}</span>\n        <button onclick="this.parentElement.remove()" style="background:rgba(255,255,255,0.25);border:none;color:#fff;border-radius:6px;padding:3px 12px;cursor:pointer;font-size:12px;font-weight:700;white-space:nowrap">✕ Dismiss</button>`),
      header.insertAdjacentElement("afterend", bar));
  } catch (e) {}
}
function _calcDays(from, to) {
  return from && to
    ? Math.max(
        1,
        Math.round(
          (new Date(to + "T00:00:00") - new Date(from + "T00:00:00")) / 864e5,
        ),
      )
    : 1;
}
function _arcCalcTotal(academics) {
  if (!academics) return null;
  let sum = 0,
    found = !1;
  for (const v of Object.values(academics))
    v && "number" == typeof v.total && ((sum += v.total), (found = !0));
  return found ? sum : null;
}
((window.loadStudentRoutine = async function (forceReload) {
  const body = document.getElementById("s-routine-body"),
    sub = document.getElementById("s-routine-sub");
  if (!body) return;
  const cls = window._studentClass || "";
  if (!cls)
    return void (body.innerHTML =
      '<p style="color:var(--text-light);text-align:center;padding:24px">No class info on your profile yet.</p>');
  if (!window.routineHasClass(cls))
    return (
      (body.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-info-circle"></i> Routine for ${cls} is not configured yet.</p>`),
      void (sub && (sub.textContent = `Class ${cls}`))
    );
  const routineClass = window.portalClassToRoutine(cls);
  (forceReload &&
    ((window._routineState.subjects = null),
    (window._routineState.teachersByInitials = null),
    (window._routineState._settingsLoaded = !1)),
    (body.innerHTML =
      '<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading routine…</p>'));
  try {
    (await _routineEnsureSettings(),
      _routineStartListeners("s", () => window.loadStudentRoutine()),
      await _routineLoadSubjects(),
      await _routineLoadTeachers());
    const s = window._routineState,
      day = s.viewDay || s.currentDay || 1;
    (sub &&
      (sub.textContent = `Class ${cls} · ${window.routineDayLabel(day)}${day === s.currentDay ? " · TODAY" : ""}`),
      document
        .querySelectorAll("#s-routine-daypills .routine-day-pill")
        .forEach((btn) => {
          (btn.classList.toggle("active", Number(btn.dataset.day) === day),
            btn.classList.toggle(
              "btn-primary",
              Number(btn.dataset.day) === day,
            ),
            btn.classList.toggle(
              "btn-outline",
              Number(btn.dataset.day) !== day,
            ),
            (btn.onclick = () => {
              ((window._routineState.viewDay = Number(btn.dataset.day)),
                window.loadStudentRoutine());
            }));
        }));
    const dayData = await _routineGetDay(day),
      active = window.routineActivePeriodIndex(s.timings),
      isToday = day === s.currentDay,
      rows = _ROMAN_PERIODS
        .map((rom, idx) => {
          const slot = (dayData[`period${idx + 1}`] || []).find(
              (x) =>
                x.className === routineClass ||
                (x.involvedClasses && x.involvedClasses.includes(routineClass)),
            ),
            t = s.timings ? s.timings[`period${idx + 1}`] : null,
            tStr = window.routineFormatTiming(t),
            isActive = isToday && idx === active;
          let subj = '<span style="color:var(--text-light)">—</span>',
            teach = "";
          if (slot)
            if ("value-cate-split" === slot.slotType)
              ((subj =
                'Value Ed. / Catechism <span class="badge badge-warning" style="margin-left:4px">Split</span>'),
                (teach =
                  '<span style="color:var(--text-light)">Go to your assigned room</span>'));
            else if ("dual-subject" === slot.slotType) {
              subj =
                'English I / II <span class="badge badge-info" style="margin-left:4px">I/II</span>';
              const tt =
                s.teachersByInitials[
                  (slot.teacherInitials || "").toUpperCase()
                ];
              teach = tt ? tt.fullName : slot.teacherInitials || "";
            } else {
              subj = _resolveSubject(slot.subjectCode, s.subjects);
              const tt =
                s.teachersByInitials[
                  (slot.teacherInitials || "").toUpperCase()
                ];
              teach = tt ? tt.fullName : slot.teacherInitials || "";
            }
          const isFree = !slot;
          return `\n          <div class="sched-card sched-card--full${isActive ? " sched-card--active" : ""}${isFree ? " sched-card--free" : ""}">\n            <div class="sched-period-num">P${idx + 1}</div>\n            <div class="sched-time">${tStr}</div>\n            <div class="sched-subject">${_scheduleEmoji(isFree ? "Free Period" : "value-cate-split" === slot.slotType ? "Value Ed. / Catechism" : "dual-subject" === slot.slotType ? "English I / II" : _resolveSubject(slot.subjectCode, s.subjects))} ${subj}</div>\n            <div class="sched-teacher">${teach || (isFree ? "" : "—")}</div>\n            ${isActive ? '<span class="sched-now-badge">NOW</span>' : ""}\n          </div>`;
        })
        .join("");
    body.innerHTML = rows;
  } catch (e) {
    ((body.innerHTML = `<p style="color:var(--danger);text-align:center;padding:24px"><i class="fas fa-exclamation-triangle"></i> Failed to load routine. ${e.message || ""}</p>`),
      console.error(e));
  }
}),
  (window.loadSchoolSchedule = async function () {
    _syncSchedTabs("school");
    const body = document.getElementById("t-schedule-body"),
      sub = document.getElementById("t-schedule-sub");
    if (body) {
      body.innerHTML =
        '<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading school schedule…</p>';
      try {
        (await _routineEnsureSettings(),
          await _routineLoadSubjects(),
          await _routineLoadTeachers());
        const s = window._routineState,
          day = s.viewDay || s.currentDay || 1;
        (sub &&
          (sub.textContent = `All Classes · ${window.routineDayLabel(day)}${day === s.currentDay ? " · TODAY" : ""}`),
          document
            .querySelectorAll("#t-schedule-daypills .routine-day-pill")
            .forEach((btn) => {
              const isSel = Number(btn.dataset.day) === day;
              (btn.classList.toggle("active", isSel),
                btn.classList.toggle("btn-primary", isSel),
                btn.classList.toggle("btn-outline", !isSel),
                (btn.onclick = () => {
                  ((window._routineState.viewDay = Number(btn.dataset.day)),
                    window.loadSchoolSchedule());
                }));
            }));
        const dayData = await _routineGetDay(day),
          active = window.routineActivePeriodIndex(s.timings),
          isToday = day === s.currentDay,
          cards = _ROMAN_PERIODS
            .map((rom, idx) => {
              const slots = dayData[`period${idx + 1}`] || [],
                t = s.timings ? s.timings[`period${idx + 1}`] : null,
                tStr = window.routineFormatTiming(t),
                isAct = isToday && idx === active;
              let rowsHtml = "";
              if (slots.length) {
                [...slots]
                  .sort((a, b) =>
                    (a.className || "").localeCompare(
                      b.className || "",
                      void 0,
                      { numeric: !0 },
                    ),
                  )
                  .forEach((slot) => {
                    const cls =
                      slot.className ||
                      (slot.involvedClasses || []).join(" + ") ||
                      "—";
                    let subj = "";
                    subj =
                      "value-cate-split" === slot.slotType
                        ? slot.track || "Value Ed. / Catechism"
                        : "dual-subject" === slot.slotType
                          ? "English I / II"
                          : _resolveSubject(slot.subjectCode, s.subjects);
                    const teacherRec =
                        s.teachersByInitials[slot.teacherInitials || ""],
                      teacherName = teacherRec
                        ? teacherRec.fullName
                        : slot.teacherInitials || "",
                      vacant = !slot.teacherInitials;
                    rowsHtml += `<tr style="${vacant ? "background:rgba(245,158,11,0.08)" : ""}">\n              <td style="padding:5px 8px;font-size:12px;font-weight:600;color:var(--accent-dark);white-space:nowrap">Class ${cls}</td>\n              <td style="padding:5px 8px;font-size:12px;color:var(--text)">${_scheduleEmoji(subj)} ${subj || "—"}</td>\n              <td style="padding:5px 8px;font-size:12px;color:${vacant ? "#d97706" : "var(--text-light)"};white-space:nowrap">${vacant ? "⚠️ Vacant" : teacherName}</td>\n            </tr>`;
                  });
              } else
                rowsHtml =
                  '<tr><td colspan="3" style="text-align:center;color:var(--text-light);font-style:italic;font-size:12px;padding:6px 0">No classes scheduled</td></tr>';
              return `<div class="sched-card${isAct ? " sched-card--active" : ""}" style="display:block;padding:12px 16px;margin-bottom:10px;border-radius:10px;background:#f9f7f4">\n          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">\n            <span style="font-size:11px;font-weight:700;color:#fff;background:var(--accent-dark);border-radius:6px;padding:2px 7px;white-space:nowrap">P${idx + 1}</span>\n            <span style="font-size:13px;font-weight:700;color:var(--accent-dark)">${tStr}</span>\n            ${isAct ? '<span class="sched-now-badge">NOW</span>' : ""}\n          </div>\n          <table style="width:100%;border-collapse:collapse">\n            <thead><tr>\n              <th style="text-align:left;font-size:11px;color:var(--text-light);padding:0 8px 4px;font-weight:600">Class</th>\n              <th style="text-align:left;font-size:11px;color:var(--text-light);padding:0 8px 4px;font-weight:600">Subject</th>\n              <th style="text-align:left;font-size:11px;color:var(--text-light);padding:0 8px 4px;font-weight:600">Teacher</th>\n            </tr></thead>\n            <tbody>${rowsHtml}</tbody>\n          </table>\n        </div>`;
            })
            .join("");
        body.innerHTML = cards;
      } catch (e) {
        body.innerHTML = `<p style="color:var(--danger);text-align:center;padding:24px"><i class="fas fa-exclamation-triangle"></i> Failed to load. ${e.message || ""}</p>`;
      }
    }
  }),
  (window.loadTeacherSchedule = async function (forceReload) {
    const body = document.getElementById("t-schedule-body"),
      sub = document.getElementById("t-schedule-sub");
    if (body) {
      (forceReload &&
        ((window._routineState.subjects = null),
        (window._routineState.teachersByInitials = null),
        (window._routineState._settingsLoaded = !1),
        (window._teacherInitials = "")),
        _syncSchedTabs("mine"),
        (body.innerHTML =
          '<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading schedule…</p>'));
      try {
        const ini = await _resolveTeacherInitials();
        if (!ini)
          return (
            (body.innerHTML =
              '<p style="color:var(--text-light);text-align:center;padding:24px"><i class="fas fa-info-circle"></i> Your <strong>Routine Initials</strong> are not set. Ask the admin to update your teacher profile.</p>'),
            void (sub && (sub.textContent = "Routine Initials not linked"))
          );
        (await _routineEnsureSettings(),
          _routineStartListeners("t", () =>
            "school" === window._schedView
              ? window.loadSchoolSchedule()
              : window.loadTeacherSchedule(),
          ),
          await _routineLoadSubjects(),
          await _routineLoadTeachers());
        const s = window._routineState,
          day = s.viewDay || s.currentDay || 1,
          me = s.teachersByInitials[ini];
        (sub &&
          (sub.textContent = `${me ? me.fullName : ini} (${ini}) · ${window.routineDayLabel(day)}${day === s.currentDay ? " · TODAY" : ""}`),
          document
            .querySelectorAll("#t-schedule-daypills .routine-day-pill")
            .forEach((btn) => {
              const isSel = Number(btn.dataset.day) === day;
              (btn.classList.toggle("active", isSel),
                btn.classList.toggle("btn-primary", isSel),
                btn.classList.toggle("btn-outline", !isSel),
                (btn.onclick = () => {
                  ((window._routineState.viewDay = Number(btn.dataset.day)),
                    "school" === window._schedView
                      ? window.loadSchoolSchedule()
                      : window.loadTeacherSchedule());
                }));
            }));
        const dayData = await _routineGetDay(day),
          active = window.routineActivePeriodIndex(s.timings),
          isToday = day === s.currentDay,
          rows = _ROMAN_PERIODS
            .map((rom, idx) => {
              const slot = (dayData[`period${idx + 1}`] || []).find(
                  (x) => (x.teacherInitials || "").toUpperCase() === ini,
                ),
                t = s.timings ? s.timings[`period${idx + 1}`] : null,
                tStr = window.routineFormatTiming(t),
                isActive = isToday && idx === active;
              let cls = '<span style="color:var(--text-light)">Free</span>',
                subj = "";
              if (slot)
                if ("value-cate-split" === slot.slotType) {
                  ((cls = `Class ${(slot.involvedClasses || [slot.className]).join(" + ")}`),
                    (subj = `${slot.track || "Value Ed. / Catechism"}${slot.room ? " · " + slot.room : ""} <span class="badge badge-warning" style="margin-left:4px">Split</span>`));
                } else
                  "dual-subject" === slot.slotType
                    ? ((cls = `Class ${slot.className}`),
                      (subj =
                        'English I / II <span class="badge badge-info" style="margin-left:4px">I/II</span>'))
                    : ((cls = `Class ${slot.className}`),
                      (subj = _resolveSubject(slot.subjectCode, s.subjects)));
              const isFree = !slot;
              return `\n          <div class="sched-card sched-card--full${isActive ? " sched-card--active" : ""}${isFree ? " sched-card--free" : ""}">\n            <div class="sched-period-num">P${idx + 1}</div>\n            <div class="sched-time">${tStr}</div>\n            <div class="sched-subject">${_scheduleEmoji(isFree ? "Free Period" : subj || "Free Period")} ${isFree ? '<span style="color:var(--text-light);font-style:italic">Free Period</span>' : subj}</div>\n            <div class="sched-teacher">${isFree ? "" : cls}</div>\n            ${isActive ? '<span class="sched-now-badge">NOW</span>' : ""}\n          </div>`;
            })
            .join("");
        body.innerHTML = rows;
      } catch (e) {
        ((body.innerHTML = `<p style="color:var(--danger);text-align:center;padding:24px"><i class="fas fa-exclamation-triangle"></i> Failed to load schedule. ${e.message || ""}</p>`),
          console.error(e));
      }
    }
  }),
  (window.loadTeacherDashWidgets = async function () {
    const ini = await _resolveTeacherInitials(),
      schedEl = document.getElementById("t-dash-schedule");
    (schedEl && !ini
      ? (schedEl.innerHTML =
          '<p style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">Routine Initials not linked.</p>')
      : schedEl &&
        (await _renderDashScheduleRows("t-dash-schedule", ini, !1, null)),
      await _loadRecentNotices(
        "t-dash-notices",
        (aud) => "all" === aud || "teachers" === aud || "both" === aud,
      ),
      _checkHolidayBanner("t-holiday-banner"));
    const holEl = document.getElementById("t-dash-holidays");
    if (holEl)
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const in60 = new Date(today);
        in60.setDate(today.getDate() + 60);
        const todayStr = today.toISOString().split("T")[0],
          in60Str = in60.toISOString().split("T")[0],
          upcoming = [
            ...(await getDocs(query(collection(db, "holidays"), limit(50))))
              .docs,
          ]
            .map((d) => d.data())
            .filter((h) => h.date && h.date >= todayStr && h.date <= in60Str)
            .sort((a, b) => a.date.localeCompare(b.date));
        upcoming.length
          ? (holEl.innerHTML = upcoming
              .map((h) => {
                const d = new Date(h.date + "T00:00:00"),
                  fmt = d.toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  }),
                  diff = Math.round((d - today) / 864e5),
                  tag =
                    0 === diff
                      ? '<span style="background:#dc2626;color:#fff;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;margin-left:6px">TODAY</span>'
                      : 1 === diff
                        ? '<span style="background:#f59e0b;color:#fff;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:700;margin-left:6px">TOMORROW</span>'
                        : `<span style="background:var(--accent);color:#fff;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;margin-left:6px">in ${diff} days</span>`;
                return `<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border)">\n              <div>\n                <div style="font-size:13px;font-weight:600;color:var(--accent-dark)">${h.reason || "—"}${tag}</div>\n                <div style="font-size:11px;color:var(--text-light);margin-top:2px">${fmt} &nbsp;·&nbsp; ${h.type || "Holiday"}</div>\n              </div>\n              <i class="fas fa-umbrella-beach" style="color:var(--accent);font-size:18px;opacity:0.6"></i>\n            </div>`;
              })
              .join(""))
          : (holEl.innerHTML =
              '<p style="color:var(--text-light);font-size:13px;text-align:center;padding:8px">No upcoming holidays in the next 60 days.</p>');
      } catch (e) {
        holEl.innerHTML =
          '<p style="color:var(--text-light);font-size:13px;text-align:center;padding:8px">Could not load holidays.</p>';
      }
  }),
  (window.loadStudentDashWidgets = async function () {
    const cls = window._studentClass || "",
      schedEl = document.getElementById("s-dash-schedule");
    (schedEl && !cls
      ? (schedEl.innerHTML =
          '<p style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">Class not set on profile.</p>')
      : schedEl && !window.routineHasClass(cls)
        ? (schedEl.innerHTML = `<p style="color:var(--text-light);font-size:13px;text-align:center;padding:12px">Routine for ${cls} not configured.</p>`)
        : schedEl &&
          (await _renderDashScheduleRows(
            "s-dash-schedule",
            null,
            !0,
            window.portalClassToRoutine(cls),
          )),
      await _loadRecentNotices(
        "s-dash-notices",
        (aud) =>
          "all" === aud || "students" === aud || "both" === aud || aud === cls,
      ));
  }),
  (window._hwUnsubscribe = null),
  (window.loadStudentHomework = function () {
    const tbody = document.getElementById("s-homework-tbody");
    if (!tbody) return;
    window._hwUnsubscribe &&
      (window._hwUnsubscribe(), (window._hwUnsubscribe = null));
    const cls = window._studentClass || "";
    if (!cls)
      return void (tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-light)">Class not assigned.</td></tr>');
    ((tbody.innerHTML =
      '<tr><td><div class="skel" style="width:70px;height:13px"></div></td><td><div class="skel" style="width:130px;height:13px;margin-bottom:4px"></div><div class="skel" style="width:90px;height:10px"></div></td><td><div class="skel" style="width:65px;height:13px"></div></td><td><div class="skel" style="width:55px;height:13px"></div></td><td><div class="skel" style="width:52px;height:20px;border-radius:10px"></div></td></tr><tr><td><div class="skel" style="width:70px;height:13px"></div></td><td><div class="skel" style="width:130px;height:13px;margin-bottom:4px"></div><div class="skel" style="width:90px;height:10px"></div></td><td><div class="skel" style="width:65px;height:13px"></div></td><td><div class="skel" style="width:55px;height:13px"></div></td><td><div class="skel" style="width:52px;height:20px;border-radius:10px"></div></td></tr><tr><td><div class="skel" style="width:70px;height:13px"></div></td><td><div class="skel" style="width:130px;height:13px;margin-bottom:4px"></div><div class="skel" style="width:90px;height:10px"></div></td><td><div class="skel" style="width:65px;height:13px"></div></td><td><div class="skel" style="width:55px;height:13px"></div></td><td><div class="skel" style="width:52px;height:20px;border-radius:10px"></div></td></tr>'),
      (window._hwUnsubscribe = onSnapshot(
        query(collection(db, "homework"), where("class", "==", cls), limit(20)),
        (snap) => {
          if (snap.empty)
            return void (tbody.innerHTML =
              '<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text-light)">No homework assigned yet.</td></tr>');
          const today = new Date().toISOString().split("T")[0];
          let pending = 0;
          const sorted = [...snap.docs].sort((a, b) =>
            (b.data().dueDate || "").localeCompare(a.data().dueDate || ""),
          );
          tbody.innerHTML = sorted
            .map((d) => {
              const hw = d.data(),
                isPast = hw.dueDate && hw.dueDate < today,
                status = isPast
                  ? '<span class="badge badge-danger">Overdue</span>'
                  : '<span class="badge badge-warning">Pending</span>';
              return (
                isPast || pending++,
                `<tr><td>${hw.subject || "—"}</td><td><strong>${hw.title || "—"}</strong><br><span style="font-size:11px;color:var(--text-light)">${hw.description || ""}</span></td><td>${hw.postedBy || "—"}</td><td style="font-size:13px">${hw.dueDate || "—"}</td><td>${status}</td></tr>`
              );
            })
            .join("");
          const pendEl = document.getElementById("s-stat-pending-hw");
          pendEl && countUp(pendEl, String(pending));
        },
        (e) => {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
        },
      )));
  }),
  (window.loadStudentNotices = async function () {
    const el = document.getElementById("s-notices-list");
    if (!el) return;
    el.innerHTML =
      '<div class="notice-card"><div class="skel" style="width:20px;height:20px;border-radius:50%;flex-shrink:0;margin-top:2px"></div><div style="flex:1"><div class="skel" style="width:60%;height:14px;margin-bottom:8px"></div><div class="skel" style="width:35%;height:10px;margin-bottom:8px"></div><div class="skel" style="width:90%;height:10px;margin-bottom:4px"></div><div class="skel" style="width:70%;height:10px"></div></div></div><div class="notice-card"><div class="skel" style="width:20px;height:20px;border-radius:50%;flex-shrink:0;margin-top:2px"></div><div style="flex:1"><div class="skel" style="width:60%;height:14px;margin-bottom:8px"></div><div class="skel" style="width:35%;height:10px;margin-bottom:8px"></div><div class="skel" style="width:90%;height:10px;margin-bottom:4px"></div><div class="skel" style="width:70%;height:10px"></div></div></div><div class="notice-card"><div class="skel" style="width:20px;height:20px;border-radius:50%;flex-shrink:0;margin-top:2px"></div><div style="flex:1"><div class="skel" style="width:60%;height:14px;margin-bottom:8px"></div><div class="skel" style="width:35%;height:10px;margin-bottom:8px"></div><div class="skel" style="width:90%;height:10px;margin-bottom:4px"></div><div class="skel" style="width:70%;height:10px"></div></div></div>';
    try {
      const snap = await getDocs(query(collection(db, "notices"), limit(20))),
        cls = window._studentClass || "",
        notices = [...snap.docs]
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((n) => {
            const aud = (n.audience || "all").toLowerCase();
            return (
              "all" === aud ||
              "students" === aud ||
              "both" === aud ||
              (cls && aud === cls)
            );
          })
          .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      if (!notices.length)
        return void (el.innerHTML =
          '<div style="text-align:center;padding:24px;color:var(--text-light)">No notices available.</div>');
      const icon = (p) =>
          "Urgent" === p
            ? "fa-exclamation-circle"
            : "Important" === p
              ? "fa-bell"
              : "fa-info-circle",
        bc = (p) =>
          "Urgent" === p
            ? "badge-danger"
            : "Important" === p
              ? "badge-warning"
              : "badge-info";
      el.innerHTML = notices
        .map((n) => {
          const fmt = n.postedAt
            ? new Date(n.postedAt).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "—";
          return (
            ((window._noticeModalData = window._noticeModalData || {})[n.id] =
              n),
            `<div class="notice-card" style="cursor:pointer" onclick="openNoticeModal('${(n.id || "").replace(/'/g, "&#39;")}')"><div class="notice-icon"><i class="fas ${icon(n.priority)}"></i></div><div><div class="notice-title">${n.title}</div><div class="notice-date">📅 ${fmt} &nbsp;|&nbsp; <span class="badge ${bc(n.priority)}">${n.priority || "Normal"}</span></div><div class="notice-body" style="white-space:pre-wrap">${(n.body || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div></div></div>`
          );
        })
        .join("");
    } catch (e) {
      el.innerHTML = `<div style="color:var(--danger);padding:16px">❌ ${e.message}</div>`;
    }
  }),
  (window.loadStudentAttendance = async function () {
    const sid =
        (window.getActiveStudentId && window.getActiveStudentId()) ||
        window._studentId ||
        "",
      cls = window._studentClass || "";
    if (!sid) return;
    const pctEl = document.querySelector("#s-attendance .attendance-pct"),
      msgEl = document.querySelector("#s-attendance > .card > p"),
      presEl = document.querySelector(
        '#s-attendance .card div[style*="gap:32px"] div:nth-child(1) div:first-child',
      ),
      absEl = document.querySelector(
        '#s-attendance .card div[style*="gap:32px"] div:nth-child(2) div:first-child',
      ),
      totalEl = document.querySelector(
        '#s-attendance .card div[style*="gap:32px"] div:nth-child(3) div:first-child',
      ),
      tbody = document.querySelector("#s-attendance .table-wrap tbody");
    try {
      if (!cls)
        return void (
          tbody &&
          (tbody.innerHTML =
            '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:16px">Class not set on your profile.</td></tr>')
        );
      const snap = await getDocs(
        query(
          collection(db, "attendance_daily"),
          where("class", "in", _classVariants(cls)),
          limit(300),
        ),
      );
      let present = 0,
        absent = 0,
        total = 0;
      const byMonth = {},
        norm = (v) =>
          String(v || "")
            .trim()
            .toUpperCase(),
        sidN = norm(sid);
      snap.forEach((d) => {
        const a = d.data(),
          isAbsent =
            Array.isArray(a.absent) && a.absent.some((x) => norm(x) === sidN);
        (total++, isAbsent ? absent++ : present++);
        const month = (a.date || "").substring(0, 7);
        month &&
          (byMonth[month] ||
            (byMonth[month] = { present: 0, absent: 0, total: 0 }),
          byMonth[month].total++,
          isAbsent ? byMonth[month].absent++ : byMonth[month].present++);
      });
      const pct = total > 0 ? Math.round((present / total) * 100) : 0,
        pctClass =
          pct >= 90
            ? "var(--success)"
            : pct >= 75
              ? "var(--warning)"
              : "var(--danger)",
        pctLabel =
          pct >= 90
            ? "Good Standing"
            : pct >= 75
              ? "Needs Improvement"
              : "Below Minimum";
      pctEl && (pctEl.textContent = pct + "%");
      const circleEl = document.querySelector(
        "#s-attendance .attendance-circle",
      );
      if (
        (circleEl &&
          (circleEl.style.background = `conic-gradient(var(--success) 0% ${pct}%, var(--danger) ${pct}% 100%)`),
        msgEl &&
          (msgEl.innerHTML = `${pct}% Attendance — <span style="color:${pctClass};font-weight:700">${pctLabel}</span>`),
        presEl && (presEl.textContent = present),
        absEl && (absEl.textContent = absent),
        totalEl && (totalEl.textContent = total),
        tbody)
      ) {
        const months = Object.keys(byMonth).sort().reverse();
        months.length
          ? (tbody.innerHTML = months
              .map((m) => {
                const r = byMonth[m],
                  mp =
                    r.total > 0 ? Math.round((r.present / r.total) * 100) : 0,
                  badge =
                    mp >= 90
                      ? "badge-success"
                      : mp >= 75
                        ? "badge-warning"
                        : "badge-danger";
                return `<tr><td>${new Date(m + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</td><td>${r.total}</td><td>${r.present}</td><td>${r.absent}</td><td><span class="badge ${badge}">${mp}%</span></td></tr>`;
              })
              .join(""))
          : (tbody.innerHTML =
              '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:16px">No attendance records yet.</td></tr>');
      }
    } catch (e) {
      console.warn("[Attendance] load failed:", e.message);
    }
  }),
  (window.loadStudentFees = async function () {
    const listEl = document.getElementById("s-fees-list"),
      totalEl = document.getElementById("s-fees-total"),
      badgeEl = document.getElementById("s-fees-total-badge");
    if (!listEl) return;
    listEl.innerHTML =
      '<div class="fee-row"><div><div class="skel" style="width:110px;height:14px;margin-bottom:5px"></div><div class="skel" style="width:75px;height:10px"></div></div><div class="skel" style="width:55px;height:14px"></div></div><div class="fee-row"><div><div class="skel" style="width:110px;height:14px;margin-bottom:5px"></div><div class="skel" style="width:75px;height:10px"></div></div><div class="skel" style="width:55px;height:14px"></div></div><div class="fee-row"><div><div class="skel" style="width:110px;height:14px;margin-bottom:5px"></div><div class="skel" style="width:75px;height:10px"></div></div><div class="skel" style="width:55px;height:14px"></div></div><div class="fee-row"><div><div class="skel" style="width:110px;height:14px;margin-bottom:5px"></div><div class="skel" style="width:75px;height:10px"></div></div><div class="skel" style="width:55px;height:14px"></div></div>';
    try {
      const sid = window._studentId || "";
      if (!sid)
        return void (listEl.innerHTML =
          '<p style="color:var(--text-light);font-size:13px">Student ID not set.</p>');
      const snap = await getDocs(
        query(
          collection(db, "fee_transactions"),
          where("studentId", "==", sid),
          limit(30),
        ),
      );
      let currentBalance = 0,
        feeTotal = 0;
      const sSnap = await getDocs(
        query(
          collection(db, "students"),
          where("studentId", "==", sid),
          limit(1),
        ),
      );
      if (!sSnap.empty) {
        const sd = sSnap.docs[0].data();
        ((feeTotal = parseFloat(sd.feeTotal || 0)),
          (currentBalance = parseFloat(
            void 0 !== sd.feeBalance ? sd.feeBalance : feeTotal,
          )));
      }
      if (snap.empty)
        return (
          (listEl.innerHTML =
            '<p style="color:var(--text-light);font-size:13px;text-align:center;padding:16px">No payment records yet.</p>'),
          totalEl &&
            (totalEl.textContent =
              currentBalance > 0
                ? "₹" + currentBalance.toLocaleString("en-IN")
                : "₹0"),
          void (
            badgeEl &&
            ((badgeEl.textContent =
              currentBalance > 0
                ? `₹${currentBalance.toLocaleString("en-IN")} Due`
                : "All Paid"),
            (badgeEl.className =
              "badge " +
              (currentBalance > 0 ? "badge-danger" : "badge-success")),
            (badgeEl.style.cssText = "font-size:13px;padding:6px 14px"))
          )
        );
      const docs = snap.docs.slice().sort((a, b) => {
        const ta = a.data().createdAt?.toMillis
          ? a.data().createdAt.toMillis()
          : new Date(a.data().submittedAt || 0).getTime();
        return (
          (b.data().createdAt?.toMillis
            ? b.data().createdAt.toMillis()
            : new Date(b.data().submittedAt || 0).getTime()) - ta
        );
      });
      let totalPaid = 0;
      docs.forEach((d) => {
        "approved" === (d.data().status || "").toLowerCase() &&
          (totalPaid += parseFloat(d.data().amount) || 0);
      });
      const excess =
          feeTotal > 0 && totalPaid > feeTotal ? totalPaid - feeTotal : 0,
        rows = docs
          .map((d) => {
            const f = d.data(),
              st = (f.status || "pending").toLowerCase(),
              bc =
                "approved" === st
                  ? "badge-success"
                  : "rejected" === st
                    ? "badge-danger"
                    : "badge-warning",
              label =
                "approved" === st
                  ? "Approved"
                  : "rejected" === st
                    ? "Rejected"
                    : "Pending",
              source =
                "student-portal" === f.source
                  ? '<span style="font-size:10px;color:var(--text-light)"> · Online</span>'
                  : '<span style="font-size:10px;color:var(--text-light)"> · Office</span>',
              rcpt = f.receiptNo
                ? `<span style="font-size:11px;color:var(--text-light)"> · ${f.receiptNo}</span>`
                : "",
              rcptBtn =
                "approved" === st
                  ? `<button onclick="showStudentReceipt('${d.id}')" style="margin-top:6px;padding:3px 10px;font-size:11px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer"><i class="fas fa-receipt" style="margin-right:4px"></i>View Receipt</button>`
                  : "";
            return `<div class="fee-row" style="flex-direction:column;align-items:flex-start;gap:6px">\n          <div style="display:flex;justify-content:space-between;width:100%;align-items:flex-start">\n            <div>\n              <div class="fee-name">${f.feeType || f.paymentMode || "Payment"}${source}</div>\n              <div class="fee-amount">₹${(f.amount || 0).toLocaleString("en-IN")} · ${f.paymentMode || f.mode || "—"}${rcpt}</div>\n              <div style="font-size:11px;color:var(--text-light);margin-top:2px">${f.date || ""}</div>\n            </div>\n            <span class="badge ${bc}" style="align-self:flex-start">${label}</span>\n          </div>\n          ${rcptBtn}\n        </div>`;
          })
          .join("");
      listEl.innerHTML = rows;
      const exBox = document.getElementById("s-fees-excess-msg"),
        exTxt = document.getElementById("s-fees-excess-text");
      (exBox && (exBox.style.display = excess > 0 ? "block" : "none"),
        exTxt &&
          excess > 0 &&
          (exTxt.textContent = `You have overpaid by ₹${excess.toLocaleString("en-IN")}. The excess amount will be refunded to you by the school office.`),
        totalEl &&
          (totalEl.textContent =
            currentBalance > 0
              ? "₹" + currentBalance.toLocaleString("en-IN")
              : "₹0"),
        badgeEl &&
          ((badgeEl.textContent =
            currentBalance > 0
              ? `₹${currentBalance.toLocaleString("en-IN")} Due`
              : "All Paid"),
          (badgeEl.className =
            "badge " + (currentBalance > 0 ? "badge-danger" : "badge-success")),
          (badgeEl.style.cssText = "font-size:13px;padding:6px 14px")));
    } catch (e) {
      listEl.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
    }
  }),
  (window.submitFeeReceipt = async function () {
    const feeType = document.getElementById("s-fee-type-sel")?.value || "",
      amount = (document.getElementById("s-fee-amount")?.value || "").trim(),
      mode = document.getElementById("s-fee-mode")?.value || "",
      txn = (document.getElementById("s-fee-txn")?.value || "").trim(),
      date = document.getElementById("s-fee-date")?.value || "",
      file = document.getElementById("s-fee-receipt-img")?.files[0];
    let _valid = !0;
    const _markErr = (id) => {
      const el = document.getElementById(id);
      el &&
        (el.classList.add("field-error"),
        el.addEventListener("input", () => el.classList.remove("field-error"), {
          once: !0,
        }));
    };
    if (
      (feeType || (_markErr("s-fee-type-sel"), (_valid = !1)),
      (!amount || parseFloat(amount) <= 0) &&
        (_markErr("s-fee-amount"), (_valid = !1)),
      txn || (_markErr("s-fee-txn"), (_valid = !1)),
      date || (_markErr("s-fee-date"), (_valid = !1)),
      !_valid)
    )
      return void showToast("⚠️ Please fill in all required fields.");
    const btn = document.getElementById("s-fee-submit-btn"),
      progBox = document.getElementById("s-fee-upload-progress"),
      progBar = document.getElementById("s-fee-progress-bar"),
      progText = document.getElementById("s-fee-progress-text");
    btn &&
      ((btn.disabled = !0),
      (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…'));
    try {
      let receiptUrl = "";
      if (file) {
        progBox && (progBox.style.display = "block");
        const _rRef = storageRef(
          storage,
          `receipts/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
        );
        const _rTask = uploadBytesResumable(_rRef, file);
        ((receiptUrl = await new Promise((resolve, reject) => {
          _rTask.on(
            "state_changed",
            (snap) => {
              const pct =
                Math.round((snap.bytesTransferred / snap.totalBytes) * 90) + 5;
              (progBar && (progBar.style.width = pct + "%"),
                progText &&
                  (progText.textContent = `Uploading receipt… ${pct}%`));
            },
            reject,
            () => getDownloadURL(_rTask.snapshot.ref).then(resolve),
          );
        })),
          progBar && (progBar.style.width = "100%"),
          progText && (progText.textContent = "Upload complete!"));
      }
      const sid = window._studentId || "";
      let balanceBefore = 0,
        feeTotal = 0;
      if (sid) {
        const sSnap = await getDocs(
          query(
            collection(db, "students"),
            where("studentId", "==", sid),
            limit(1),
          ),
        );
        if (!sSnap.empty) {
          const sd = sSnap.docs[0].data();
          ((feeTotal = parseFloat(sd.feeTotal || 0)),
            (balanceBefore = parseFloat(
              void 0 !== sd.feeBalance ? sd.feeBalance : feeTotal,
            )));
        }
      }
      const amtNum = parseFloat(amount),
        balanceAfter = Math.max(0, balanceBefore - amtNum);
      (await addDoc(collection(db, "fee_transactions"), {
        studentId: sid,
        studentName: window._studentName || "",
        studentClass: window._studentClass || "",
        feeType: feeType,
        amount: amtNum,
        paymentMode: mode,
        receiptNo: txn,
        date: date,
        status: "pending",
        receiptUrl: receiptUrl,
        staffName: (window._studentName || "Student") + " (self)",
        balanceBefore: balanceBefore,
        balanceAfter: balanceAfter,
        feeTotal: feeTotal,
        source: "student-portal",
        submittedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
      }),
        ["s-fee-type-sel", "s-fee-amount", "s-fee-txn", "s-fee-date"].forEach(
          (id) => {
            const el = document.getElementById(id);
            el && (el.value = "");
          },
        ));
      const fi = document.getElementById("s-fee-receipt-img");
      (fi && (fi.value = ""),
        showToast("✅ Payment submitted — awaiting office approval."),
        loadStudentFees());
    } catch (e) {
      showToast("❌ " + e.message);
    } finally {
      (btn &&
        ((btn.disabled = !1),
        (btn.innerHTML =
          '<i class="fas fa-paper-plane"></i> Submit for Approval')),
        setTimeout(() => {
          (progBox && (progBox.style.display = "none"),
            progBar && (progBar.style.width = "0%"));
        }, 1500));
    }
  }),
  (window.loadTeacherPortal = async function (user) {
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (!userDoc.exists()) return;
      const userData = userDoc.data(),
        teacherId = userData.teacherId || userData.loginId || "";
      if (
        ((window._teacherId = teacherId),
        (window._teacherName = userData.name || "Teacher"),
        !teacherId)
      )
        return;
      let t = null;
      const directSnap = await getDoc(doc(db, "teachers", user.uid));
      if ((directSnap.exists() && (t = directSnap.data()), !t)) {
        let snap = await getDocs(
          query(
            collection(db, "teachers"),
            where("teacherId", "==", teacherId),
          ),
        );
        (snap.empty &&
          (snap = await getDocs(
            query(
              collection(db, "teachers"),
              where("teacherId", "==", teacherId.toUpperCase()),
            ),
          )),
          snap.empty &&
            (snap = await getDocs(
              query(
                collection(db, "teachers"),
                where("loginId", "==", teacherId),
              ),
            )),
          snap.empty || (t = snap.docs[0].data()));
      }
      if (!t)
        return void showToast(
          "⚠️ Teacher profile not found. Ask admin to open your assignment panel and click Save.",
        );
      const _R2N = {
        I: 1,
        II: 2,
        III: 3,
        IV: 4,
        V: 5,
        VI: 6,
        VII: 7,
        VIII: 8,
        IX: 9,
        X: 10,
      };
      let effectiveClass = t.classTeacher || "";
      if (t.classTeacherOf) {
        const ctRoman = t.classTeacherOf.split("-")[0];
        effectiveClass = _R2N[ctRoman] || parseInt(ctRoman) || effectiveClass;
      }
      if (userData.tpClassTeacherOf) {
        const ctRoman = userData.tpClassTeacherOf.split("-")[0];
        effectiveClass = _R2N[ctRoman] || parseInt(ctRoman) || effectiveClass;
      }
      ((window._currentTeacherClass = effectiveClass || ""),
        (window._teacherSubjects = t.subjects || ""));
      const classLabel = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
        getClsLabel = (c) => classLabel[c] || (c ? "Class " + c : "—"),
        titleStr =
          t.title && "Miss" !== t.title
            ? t.title + " "
            : "M" === t.gender
              ? "Mr. "
              : "Ms. ",
        hdrName = document.getElementById("t-header-name");
      hdrName && (hdrName.textContent = titleStr + t.name);
      const hdrRole = document.getElementById("t-header-role");
      hdrRole &&
        (hdrRole.textContent = `${t.subjects || "Teacher"} · ${effectiveClass ? getClsLabel(effectiveClass) : "—"}`);
      const hdrAvatar = document.getElementById("t-header-avatar");
      if (hdrAvatar)
        if (t.photoURL)
          hdrAvatar.innerHTML = `<img src="${t.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        else {
          const parts = (t.name || "T").trim().split(" ");
          hdrAvatar.textContent =
            parts.length >= 2
              ? parts[0][0] + parts[parts.length - 1][0]
              : parts[0][0];
        }
      const tStatClass = document.getElementById("t-stat-class");
      tStatClass &&
        (tStatClass.textContent = effectiveClass
          ? getClsLabel(effectiveClass)
          : "—");
      const tStatSub = document.getElementById("t-stat-subjects");
      tStatSub && (tStatSub.textContent = t.subjects || "—");
      const tClassHd = document.getElementById("t-class-heading");
      tClassHd &&
        (tClassHd.textContent = effectiveClass
          ? getClsLabel(effectiveClass)
          : "My Class");
      const tAttHd = document.getElementById("t-att-heading");
      if (
        (tAttHd &&
          (tAttHd.textContent = effectiveClass
            ? getClsLabel(effectiveClass)
            : "My Class"),
        effectiveClass)
      ) {
        const sSnap = await getDocs(
            query(
              collection(db, "students"),
              where("class", "==", String(effectiveClass)),
              orderBy("rollNo"),
            ),
          ),
          tStatStu = document.getElementById("t-stat-students");
        (tStatStu && (tStatStu.textContent = sSnap.size),
          (window._teacherStudentDocs = sSnap.docs),
          renderTeacherStudentList(sSnap.docs),
          initTeacherAttendance(effectiveClass));
      }
      (populateHwClassSelect(),
        loadTeacherHomework(),
        loadTeacherNotices(),
        window.loadTeacherDashWidgets && loadTeacherDashWidgets(),
        loadLeaveHistory());
    } catch (e) {
      showToast("⚠️ Teacher portal: " + e.message);
    }
  }),
  (window.loadTeacherProfile = async function () {
    const user = window._firebaseAuth?.currentUser;
    if (!user) return;
    const set = (id, v) => {
      const el = document.getElementById(id);
      el && (el.textContent = v || "—");
    };
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid)),
        userData = userDoc.exists() ? userDoc.data() : {},
        teacherId = userData.teacherId || userData.loginId || "";
      if ((set("t-profile-email", user.email), teacherId)) {
        const snap = await getDocs(
          query(
            collection(db, "teachers"),
            where("teacherId", "==", teacherId),
          ),
        );
        if (!snap.empty) {
          const t = snap.docs[0].data(),
            classLabel = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
            getClsLabel = (c) => classLabel[c] || (c ? "Class " + c : "—"),
            avatar = document.getElementById("t-profile-avatar");
          (avatar &&
            (t.photoURL
              ? (avatar.innerHTML = `<img src="${t.photoURL}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`)
              : (avatar.textContent = (t.name || "T")
                  .split(" ")
                  .map((w) => w[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase())),
            set(
              "t-profile-name",
              (t.title ? t.title + " " : "") + (t.name || ""),
            ),
            set("t-profile-role", t.subjects || "Teacher"),
            set("t-profile-id", teacherId),
            set(
              "t-profile-class",
              t.classTeacher ? getClsLabel(t.classTeacher) : "—",
            ),
            set("t-profile-subjects", t.subjects || "—"),
            set(
              "t-profile-gender",
              "M" === t.gender
                ? "Male"
                : "F" === t.gender
                  ? "Female"
                  : t.gender || "—",
            ),
            set("t-profile-phone", t.phone || t.mobile || "—"));
        }
      }
    } catch (e) {
      showToast("⚠️ Could not load profile: " + e.message);
    }
  }),
  (window.teacherChangePassword = async function () {
    const current = document.getElementById("t-pwd-current")?.value || "",
      newPwd = document.getElementById("t-pwd-new")?.value || "",
      confirm = document.getElementById("t-pwd-confirm")?.value || "";
    if (!current || !newPwd || !confirm)
      return void showToast("⚠️ All password fields are required.");
    if (newPwd.length < 6)
      return void showToast("⚠️ New password must be at least 6 characters.");
    if (newPwd !== confirm)
      return void showToast("⚠️ New passwords do not match.");
    const user = window._firebaseAuth?.currentUser;
    if (user)
      try {
        const {
            EmailAuthProvider: EmailAuthProvider,
            reauthenticateWithCredential: reauthenticateWithCredential,
          } =
            await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js"),
          cred = EmailAuthProvider.credential(user.email, current);
        (await reauthenticateWithCredential(user, cred),
          await updatePassword(user, newPwd),
          ["t-pwd-current", "t-pwd-new", "t-pwd-confirm"].forEach((id) => {
            const el = document.getElementById(id);
            el && (el.value = "");
          }),
          showToast("✅ Password updated successfully."));
      } catch (e) {
        "auth/wrong-password" === e.code || "auth/invalid-credential" === e.code
          ? showToast("❌ Current password is incorrect.")
          : showToast("❌ " + e.message);
      }
    else showToast("⚠️ Not logged in.");
  }),
  (window.submitLeaveApplication = async function () {
    const from = (document.getElementById("lv-from")?.value || "").trim(),
      to = (document.getElementById("lv-to")?.value || "").trim(),
      type = (document.getElementById("lv-type")?.value || "").trim(),
      reason = (document.getElementById("lv-reason")?.value || "").trim();
    if (!from || !to || !reason)
      return void showToast("⚠️ From date, To date and Reason are required.");
    if (from > to)
      return void showToast('⚠️ "From" date cannot be after "To" date.');
    const auth = window._firebaseAuth,
      user = auth?.currentUser;
    if (user)
      try {
        const existingSnap = await getDocs(
          query(
            collection(db, "leave_applications"),
            where("uid", "==", user.uid),
            where("status", "in", ["Pending", "Approved"]),
          ),
        );
        if (
          existingSnap.docs.some((d) => {
            const l = d.data();
            return l.from <= to && l.to >= from;
          })
        )
          return void showToast(
            "⚠️ You already have a Pending or Approved leave overlapping these dates.",
          );
        const settingsSnap = await getDoc(doc(db, "settings", "leave_config")),
          quota =
            (settingsSnap.exists() && settingsSnap.data().annualQuota) || 15,
          daysTaken = existingSnap.docs
            .filter((d) => "Approved" === d.data().status)
            .reduce((sum, d) => sum + _calcDays(d.data().from, d.data().to), 0),
          requested = _calcDays(from, to);
        (daysTaken + requested > quota &&
          showToast(
            `⚠️ This leave (${requested}d) would exceed your annual quota of ${quota} days (${quota - daysTaken}d remaining). Submitting anyway.`,
          ),
          await addDoc(collection(db, "leave_applications"), {
            uid: user.uid,
            teacherId: window._teacherId || "",
            teacherName: window._teacherName || user.displayName || user.email,
            teacherClass: window._currentTeacherClass || "—",
            from: from,
            to: to,
            type: type,
            reason: reason,
            status: "Pending",
            createdAt: new Date().toISOString(),
          }),
          ["lv-from", "lv-to", "lv-reason"].forEach((id) => {
            const el = document.getElementById(id);
            el && (el.value = "");
          }),
          showToast("✅ Leave application submitted for approval."),
          loadLeaveHistory());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Not logged in.");
  }),
  (window.loadLeaveHistory = async function () {
    const tbody = document.getElementById("lv-history-tbody");
    if (!tbody) return;
    const user = window._firebaseAuth?.currentUser;
    if (user)
      try {
        const snap = await getDocs(
          query(
            collection(db, "leave_applications"),
            where("uid", "==", user.uid),
            orderBy("createdAt", "desc"),
            limit(30),
          ),
        );
        if (
          (await (async function (uid) {
            try {
              const [settingsSnap, leaveSnap] = await Promise.all([
                  getDoc(doc(db, "settings", "leave_config")),
                  getDocs(
                    query(
                      collection(db, "leave_applications"),
                      where("uid", "==", uid),
                    ),
                  ),
                ]),
                quota =
                  (settingsSnap.exists() && settingsSnap.data().annualQuota) ||
                  15,
                daysTaken = leaveSnap.docs
                  .filter((d) => "Approved" === d.data().status)
                  .reduce(
                    (sum, d) => sum + _calcDays(d.data().from, d.data().to),
                    0,
                  ),
                balance = quota - daysTaken,
                pct = Math.min(100, Math.round((daysTaken / quota) * 100)),
                set = (id, v) => {
                  const el = document.getElementById(id);
                  el && (el.textContent = v);
                };
              (set("lv-quota-val", quota),
                set("lv-taken-val", daysTaken),
                set("lv-balance-val", Math.max(0, balance)),
                set(
                  "lv-year-label",
                  "Academic year " + new Date().getFullYear(),
                ));
              const fill = document.getElementById("lv-quota-bar-fill");
              fill &&
                ((fill.style.width = pct + "%"),
                (fill.style.background =
                  pct >= 100 ? "#dc2626" : pct >= 70 ? "#d97706" : "#16a34a"));
              const cap = document.getElementById("lv-quota-bar-caption");
              cap &&
                (cap.textContent = `${daysTaken} of ${quota} days used (${pct}%)`);
              const stat = document.getElementById("lv-balance-stat");
              stat &&
                (stat.className =
                  "lv-stat lv-stat-balance" +
                  (balance <= 0 ? " over" : balance <= 3 ? " warn" : ""));
            } catch (e) {
              console.warn("Leave summary:", e.message);
            }
          })(user.uid),
          snap.empty)
        )
          return void (tbody.innerHTML =
            '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:16px">No leave applications yet.</td></tr>');
        const fmt = (s) =>
            s
              ? new Date(s + "T00:00:00").toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                })
              : "—",
          bc = {
            Pending: "badge-warning",
            Approved: "badge-success",
            Rejected: "badge-danger",
          };
        tbody.innerHTML = snap.docs
          .map((d) => {
            const l = d.data(),
              days = _calcDays(l.from, l.to);
            return `<tr class="lv-ledger-row ${(l.status || "pending").toLowerCase()}">\n          <td>${fmt(l.from)} → ${fmt(l.to)}</td>\n          <td><span class="lv-days-chip">${days}d</span></td>\n          <td style="font-size:12px">${l.type || "—"}</td>\n          <td style="font-size:12px;max-width:180px;white-space:normal">${l.reason || "—"}</td>\n          <td><span class="badge ${bc[l.status] || "badge-info"}">${l.status || "—"}</span></td>\n        </tr>`;
          })
          .join("");
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
      }
  }),
  (window.saveLeaveQuota = async function () {
    const quota = parseInt(
      document.getElementById("a-leave-quota-input")?.value || 0,
    );
    if (!quota || quota < 1)
      showToast("⚠️ Enter a valid quota (minimum 1 day).");
    else
      try {
        (await setDoc(
          doc(db, "settings", "leave_config"),
          { annualQuota: quota, updatedAt: new Date().toISOString() },
          { merge: !0 },
        ),
          showToast("✅ Quota set to " + quota + " days for all teachers."));
        const disp = document.getElementById("a-leave-quota-display");
        disp && (disp.textContent = quota + " days");
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.loadLeaveQuota = async function () {
    try {
      const d = await getDoc(doc(db, "settings", "leave_config")),
        quota = (d.exists() && d.data().annualQuota) || 15,
        inp = document.getElementById("a-leave-quota-input");
      inp && (inp.value = quota);
      const disp = document.getElementById("a-leave-quota-display");
      disp && (disp.textContent = quota + " days");
    } catch (e) {
      console.warn("loadLeaveQuota:", e.message);
    }
  }),
  (window.loadAdminReportCards = async function () {
    await (async function () {
      const sel = document.getElementById("arc-class-select");
      if (sel && !(sel.options.length > 1))
        try {
          const snap = await getDocs(collection(db, "classes")),
            seen = new Set(),
            entries = [];
          (snap.forEach((d) => entries.push(d.id)),
            entries.sort((a, b) => a.length - b.length || a.localeCompare(b)),
            entries.forEach((id) => {
              const base = id.split("-")[0].trim();
              if (seen.has(base)) return;
              seen.add(base);
              const opt = document.createElement("option");
              ((opt.value = id),
                (opt.textContent = base),
                sel.appendChild(opt));
            }));
        } catch (e) {
          console.warn("arcLoadClasses:", e.message);
        }
    })();
    const rawId = document.getElementById("arc-class-select")?.value,
      classId = rawId ? rawId.split("-")[0].trim() : "",
      tbody = document.getElementById("arc-tbody"),
      msg = document.getElementById("arc-status-msg"),
      relBtn = document.getElementById("arc-release-all-btn");
    if (tbody) {
      if (!classId)
        return (
          (tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">Select a class above.</td></tr>'),
          msg &&
            (msg.textContent = "Select a class to view locked report cards."),
          void (relBtn && (relBtn.style.display = "none"))
        );
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
      try {
        const ftSnap = await getDocs(
            collection(db, "marks", `${classId}_FT`, "students"),
          ),
          hySnap = await getDocs(
            collection(db, "marks", `${classId}_HY`, "students"),
          ),
          hyMap = {};
        if (
          (hySnap.forEach((d) => {
            hyMap[d.id] = d.data();
          }),
          ftSnap.empty)
        )
          return (
            (tbody.innerHTML =
              '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No locked records found for this class.</td></tr>'),
            msg && (msg.textContent = "No data yet."),
            void (relBtn && (relBtn.style.display = "none"))
          );
        const rows = [];
        (ftSnap.forEach((d) =>
          rows.push({ id: d.id, ft: d.data(), hy: hyMap[d.id] || {} }),
        ),
          rows.sort((a, b) => (a.ft.rollNo || 999) - (b.ft.rollNo || 999)),
          (tbody.innerHTML = ""));
        let lockedCount = 0;
        (rows.forEach(({ id: id, ft: ft, hy: hy }) => {
          if ("locked" !== ft.status) return;
          lockedCount++;
          const hyTotal = _arcCalcTotal(hy.academics),
            ftTotal = _arcCalcTotal(ft.academics),
            autoPass =
              !!(academics = ft.academics) &&
              Object.values(academics).every((v) => !v || v.total >= 30);
          var academics;
          const decision = ft.adminDecision || "",
            released = !0 === ft.releasedToStudent,
            resultLabel = decision
              ? `<span style="color:${"Detained" === decision ? "#ef4444" : "#16a34a"};font-weight:600">${decision}</span>`
              : autoPass
                ? '<span style="color:#16a34a;font-weight:600">PASS</span>'
                : '<span style="color:#ef4444;font-weight:600">FAIL</span>',
            decisionSelect =
              (!autoPass && !decision) ||
              "Detained" === decision ||
              "Promoted with Grace" === decision
                ? `<select onchange="arcSetDecision('${id}','${classId}',this.value)" style="padding:4px 8px;border-radius:6px;border:1.5px solid #ccc;font-size:12px">\n               <option value="" ${decision ? "" : "selected"}>— Set Decision —</option>\n               <option value="Promoted with Grace" ${"Promoted with Grace" === decision ? "selected" : ""}>Promoted with Grace</option>\n               <option value="Detained" ${"Detained" === decision ? "selected" : ""}>Detained</option>\n             </select>`
                : `<span style="color:#6b7280;font-size:12px">${decision || "Auto-Promoted"}</span>`,
            relIcon = released
              ? '<i class="fas fa-check-circle" style="color:#16a34a"></i> Yes'
              : '<i class="fas fa-times-circle" style="color:#9ca3af"></i> No',
            tr = document.createElement("tr");
          ((tr.innerHTML = `\n          <td>${ft.rollNo || "—"}</td>\n          <td>${ft.studentName || id}</td>\n          <td>${null !== hyTotal ? hyTotal : "—"}</td>\n          <td>${null !== ftTotal ? ftTotal : "—"}</td>\n          <td>${resultLabel}</td>\n          <td>${decisionSelect}</td>\n          <td>${relIcon}</td>\n          <td>\n            <button class="btn btn-sm btn-outline" style="font-size:11px" onclick="arcViewReportCard('${id}','${classId}')"><i class="fas fa-eye"></i> View</button>\n            ${released ? "" : `<button class="btn btn-sm" style="font-size:11px;background:#2563eb;color:#fff;border:none;margin-left:4px" onclick="arcReleaseOne('${id}','${classId}')"><i class="fas fa-unlock"></i> Release</button>`}\n          </td>\n        `),
            tbody.appendChild(tr));
        }),
          0 === lockedCount &&
            (tbody.innerHTML =
              '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No locked records yet. Class teacher must lock the records first.</td></tr>'),
          msg &&
            (msg.textContent = `${lockedCount} locked student record(s) for Class ${classId}.`),
          relBtn && (relBtn.style.display = lockedCount > 0 ? "" : "none"),
          (relBtn.dataset.classId = classId));
      } catch (e) {
        (console.error("loadAdminReportCards:", e),
          (tbody.innerHTML = `<tr><td colspan="8" style="color:#ef4444;text-align:center;padding:18px">${e.message}</td></tr>`));
      }
    }
  }),
  (window.arcSetDecision = async function (studentId, classId, decision) {
    if (decision)
      try {
        const ref = doc(db, "marks", `${classId}_FT`, "students", studentId);
        (await setDoc(
          ref,
          {
            adminDecision: decision,
            adminDecisionAt: new Date().toISOString(),
          },
          { merge: !0 },
        ),
          showToast("✅ Decision saved: " + decision));
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.arcReleaseOne = async function (studentId, classId) {
    try {
      const ref = doc(db, "marks", `${classId}_FT`, "students", studentId);
      (await setDoc(
        ref,
        { releasedToStudent: !0, releasedAt: new Date().toISOString() },
        { merge: !0 },
      ),
        showToast("✅ Report card released to student."),
        loadAdminReportCards());
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }));
let _arcRMStudents = [],
  _arcRMClassId = "";
function _arcRMRender() {
  const tbody = document.getElementById("arc-rm-tbody");
  tbody &&
    ((tbody.innerHTML = _arcRMStudents
      .map((s, i) => {
        const feeLabel = s.feeHold
          ? '<span style="color:#d97706;font-weight:600"><i class="fas fa-exclamation-triangle"></i> Fee Pending</span>'
          : '<span style="color:#16a34a"><i class="fas fa-check-circle"></i> Cleared</span>';
        return `<tr style="${s.feeHold ? "background:#fffbeb" : ""}">\n        <td style="text-align:center;padding:8px 16px">\n          <input type="checkbox" ${s.checked ? "checked" : ""} onchange="arcRMToggle(${i},this.checked)"\n            style="width:16px;height:16px;cursor:pointer;accent-color:#2563eb">\n        </td>\n        <td style="text-align:center;padding:8px;color:#6b7280">${s.rollNo}</td>\n        <td style="padding:8px;font-weight:500">${s.name}</td>\n        <td style="text-align:center;padding:8px 16px">${feeLabel}</td>\n      </tr>`;
      })
      .join("")),
    _arcRMUpdateSummary());
}
function _arcRMUpdateSummary() {
  const total = _arcRMStudents.length,
    selected = _arcRMStudents.filter((s) => s.checked).length,
    held = _arcRMStudents.filter((s) => s.feeHold && !s.checked).length,
    summaryEl = document.getElementById("arc-rm-summary"),
    footerEl = document.getElementById("arc-rm-footer-note"),
    btnLabel = document.getElementById("arc-rm-btn-label");
  (summaryEl && (summaryEl.textContent = `${selected} of ${total} selected`),
    footerEl &&
      (footerEl.textContent =
        held > 0 ? `${held} student(s) withheld — fee pending` : ""),
    btnLabel && (btnLabel.textContent = `Release Selected (${selected})`));
}
async function isMonthLocked(classNum, date) {
  const cacheKey = classNum + "_" + date.slice(0, 7);
  if (window._monthLockCache && cacheKey in window._monthLockCache)
    return window._monthLockCache[cacheKey];
  window._monthLockCache || (window._monthLockCache = {});
  const monthYear = date.substring(0, 4) + "_" + date.substring(5, 7);
  try {
    const mDoc = await getDoc(
      doc(db, "attendance_monthly", `${classNum}_${monthYear}`),
    );
    return (
      (window._monthLockCache[cacheKey] =
        mDoc.exists() && "locked" === mDoc.data().status),
      window._monthLockCache[cacheKey]
    );
  } catch (e) {
    return !1;
  }
}
function renderAttendanceCards(
  students,
  existingData,
  isHoliday = !1,
  readOnly = !1,
) {
  const grid = document.getElementById("att-card-grid");
  if (!grid) return;
  const saveBtn = document.getElementById("t-save-att-btn");
  if (isHoliday || !students.length)
    return (
      (grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;padding:20px;color:var(--text-light)">${isHoliday ? '<i class="fas fa-calendar-times" style="margin-right:6px"></i>Holiday — no attendance required.' : '<i class="fas fa-info-circle" style="margin-right:6px"></i>No students found for this class.'}</p>`),
      saveBtn && isHoliday && (saveBtn.style.display = "none"),
      void (document.getElementById("att-summary").textContent = "")
    );
  const absentSet = new Set(existingData?.absent || []),
    lateSet = new Set(existingData?.late || []);
  ((grid.innerHTML = students
    .map((d) => {
      const s = d.data(),
        sid = s.studentId || String(s.rollNo),
        state = absentSet.has(sid) ? 1 : lateSet.has(sid) ? 2 : 0,
        badge = 1 === state ? "Absent" : 2 === state ? "Late" : "Present",
        clickAttr = readOnly ? "" : 'onclick="toggleAttCard(this)"',
        cursor = readOnly ? "cursor:default;opacity:0.8;" : "";
      return `<div class="att-card ${1 === state ? "absent" : 2 === state ? "late" : "present"}" data-sid="${sid}" data-roll="${s.rollNo}" data-name="${s.name}" data-state="${state}" ${clickAttr} style="${cursor}">\n        <div class="att-card-roll">${s.rollNo}</div>\n        <div class="att-card-name">${s.name}</div>\n        <div class="att-card-badge">${badge}</div>\n      </div>`;
    })
    .join("")),
    updateAttSummary());
}
function updateAttSummary() {
  const cards = document.querySelectorAll("#att-card-grid .att-card");
  let present = 0,
    absent = 0,
    late = 0;
  cards.forEach((c) => {
    const s = parseInt(c.dataset.state);
    1 === s ? absent++ : 2 === s ? late++ : present++;
  });
  const el = document.getElementById("att-summary");
  el &&
    (el.textContent = `${present} Present · ${absent} Absent · ${late} Late`);
}
((window.arcReleaseAll = async function () {
  const classId = document.getElementById("arc-release-all-btn")?.dataset
    .classId;
  if (!classId) return;
  _arcRMClassId = classId;
  const modal = document.getElementById("arc-release-modal"),
    tbody = document.getElementById("arc-rm-tbody");
  if (modal && tbody) {
    ((document.getElementById("arc-rm-class").textContent = "Class " + classId),
      (tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;padding:20px;color:#6b7280"><i class="fas fa-spinner fa-spin"></i> Loading students & fee data…</td></tr>'),
      (modal.style.display = "flex"));
    try {
      const ftSnap = await getDocs(
          collection(db, "marks", `${classId}_FT`, "students"),
        ),
        locked = [];
      if (
        (ftSnap.forEach((d) => {
          "locked" === d.data().status &&
            locked.push({ id: d.id, ...d.data() });
        }),
        !locked.length)
      )
        return void (tbody.innerHTML =
          '<tr><td colspan="4" style="text-align:center;padding:20px;color:#6b7280">No locked students found.</td></tr>');
      const feeMap = {};
      try {
        (await getDocs(collection(db, "students"))).forEach((d) => {
          feeMap[d.id] = parseFloat(
            d.data().feeBalance ?? d.data().feeTotal ?? 0,
          );
        });
      } catch (_) {}
      ((_arcRMStudents = locked
        .sort((a, b) => (a.rollNo || 999) - (b.rollNo || 999))
        .map((s) => ({
          id: s.id,
          rollNo: s.rollNo || "—",
          name: s.studentName || s.id,
          feeHold: (feeMap[s.id] ?? 0) > 0,
          checked: (feeMap[s.id] ?? 0) <= 0,
        }))),
        _arcRMRender());
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="4" style="color:#ef4444;text-align:center;padding:18px">${e.message}</td></tr>`;
    }
  }
}),
  (window.arcRMToggle = function (i, checked) {
    (_arcRMStudents[i] && (_arcRMStudents[i].checked = checked),
      _arcRMUpdateSummary());
  }),
  (window.arcRMSelectAll = function (checked) {
    (_arcRMStudents.forEach((s) => (s.checked = checked)), _arcRMRender());
  }),
  (window.arcRMConfirmRelease = async function () {
    const toRelease = _arcRMStudents.filter((s) => s.checked),
      toHold = _arcRMStudents.filter((s) => !s.checked);
    if (!toRelease.length) return void showToast("⚠️ No students selected.");
    const btn = document.getElementById("arc-rm-confirm-btn");
    ((btn.disabled = !0),
      (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Releasing…'));
    try {
      const batch = writeBatch(db),
        now = new Date().toISOString();
      (toRelease.forEach((s) => {
        const ref = doc(db, "marks", `${_arcRMClassId}_FT`, "students", s.id);
        batch.set(
          ref,
          { releasedToStudent: !0, releasedAt: now, feeHold: !1 },
          { merge: !0 },
        );
      }),
        toHold.forEach((s) => {
          const ref = doc(db, "marks", `${_arcRMClassId}_FT`, "students", s.id);
          batch.set(ref, { releasedToStudent: !1, feeHold: !0 }, { merge: !0 });
        }),
        await batch.commit(),
        (document.getElementById("arc-release-modal").style.display = "none"),
        showToast(
          `✅ ${toRelease.length} report card(s) released. ${toHold.length} withheld.`,
        ),
        loadAdminReportCards());
    } catch (e) {
      showToast("❌ " + e.message);
    } finally {
      ((btn.disabled = !1),
        (btn.innerHTML =
          '<i class="fas fa-unlock"></i> <span id="arc-rm-btn-label">Release Selected</span>'));
    }
  }),
  (window.arcViewReportCard = async function (studentId, classId) {
    showToast("Loading report card…");
    try {
      const hyDoc = await getDoc(
          doc(db, "marks", `${classId}_HY`, "students", studentId),
        ),
        ftDoc = await getDoc(
          doc(db, "marks", `${classId}_FT`, "students", studentId),
        );
      if (!ftDoc.exists()) return void showToast("❌ No FT data found.");
      (sessionStorage.setItem(
        "sfds_adminRC",
        JSON.stringify({
          hyData: hyDoc.data() || {},
          ftData: ftDoc.data() || {},
          classId: classId,
        }),
      ),
        window.open("/Sfs-report-card/reportcard.html", "_blank"));
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.loadAdminLeave = async function () {
    const tbody = document.getElementById("a-leave-tbody");
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="10" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
    const filter =
      document.getElementById("a-leave-filter")?.value || "Pending";
    try {
      let q = collection(db, "leave_applications");
      const snap = await getDocs(
        "all" === filter ? q : query(q, where("status", "==", filter)),
      );
      if (snap.empty)
        return void (tbody.innerHTML =
          '<tr><td colspan="10" style="text-align:center;padding:18px;color:var(--text-light)">No leave applications found.</td></tr>');
      const fmt = (s) =>
          s
            ? new Date(s + "T00:00:00").toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "2-digit",
              })
            : "—",
        fmtTs = (s) =>
          s
            ? new Date(s).toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "2-digit",
              })
            : "—",
        bc = {
          Pending: "badge-warning",
          Approved: "badge-success",
          Rejected: "badge-danger",
        },
        sorted = [...snap.docs].sort((a, b) =>
          (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
        );
      tbody.innerHTML = sorted
        .map((d) => {
          const l = d.data(),
            actions =
              "Pending" === l.status
                ? `<div style="display:flex;gap:4px"><button class="btn btn-sm" style="background:var(--success);color:#fff" onclick="adminApproveLeave('${d.id}')"><i class="fas fa-check"></i> Approve</button><button class="btn btn-sm" style="background:var(--danger);color:#fff" onclick="adminRejectLeave('${d.id}')"><i class="fas fa-times"></i> Reject</button></div>`
                : `<span class="badge ${bc[l.status] || "badge-info"}">${l.status}</span>`;
          return `<tr><td>${l.teacherName || "—"}</td><td style="font-size:12px">${l.teacherId || "—"}</td><td>${l.teacherClass || "—"}</td><td style="font-size:12px">${l.type || "—"}</td><td>${fmt(l.from)}</td><td>${fmt(l.to)}</td><td style="font-size:12px;max-width:120px;white-space:normal">${l.reason || "—"}</td><td style="font-size:11px;color:var(--text-light)">${fmtTs(l.createdAt)}</td><td><span class="badge ${bc[l.status] || "badge-info"}">${l.status || "—"}</span></td><td>${actions}</td></tr>`;
        })
        .join("");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  }),
  (window.adminApproveLeave = async function (docId) {
    try {
      (await setDoc(
        doc(db, "leave_applications", docId),
        { status: "Approved", updatedAt: new Date().toISOString() },
        { merge: !0 },
      ),
        showToast("✅ Leave approved."),
        loadAdminLeave());
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.adminRejectLeave = async function (docId) {
    try {
      (await setDoc(
        doc(db, "leave_applications", docId),
        { status: "Rejected", updatedAt: new Date().toISOString() },
        { merge: !0 },
      ),
        showToast("Leave rejected."),
        loadAdminLeave());
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.renderTeacherStudentList = function (docs) {
    const tbody = document.getElementById("teacher-student-tbody");
    tbody &&
      (docs && docs.length
        ? (tbody.innerHTML = docs
            .map((d) => {
              const s = d.data(),
                waNum = (s.whatsapp || s.contact || "").replace(/[^0-9]/g, "");
              return `<tr><td>${s.rollNo || "—"}</td><td><strong>${s.name || "—"}</strong></td><td>${"M" === s.gender ? "Male" : "F" === s.gender ? "Female" : s.gender || "—"}</td><td><span class="badge badge-info">${s.bloodGroup || "—"}</span></td><td style="font-size:12px">${s.whatsapp || s.contact || "—"}</td><td>${waNum ? `<a href="https://wa.me/${waNum}" target="_blank" class="btn btn-sm btn-success" style="font-size:11px"><i class="fab fa-whatsapp"></i></a>` : "—"}</td></tr>`;
            })
            .join(""))
        : (tbody.innerHTML =
            '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-light)">No students found.</td></tr>'));
  }),
  (window.exportTeacherClassList = function () {
    const docs = window._teacherStudentDocs;
    if (!docs || !docs.length)
      return void showToast("⚠️ No student data to export.");
    const rows = [
      ["Roll No", "Name", "Gender", "Blood Group", "WhatsApp", "Class"],
    ];
    docs.forEach((d) => {
      const s = d.data();
      rows.push([
        s.rollNo || "",
        s.name || "",
        s.gender || "",
        s.bloodGroup || "",
        s.whatsapp || s.contact || "",
        s.class || "",
      ]);
    });
    const csv = rows
        .map((r) =>
          r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
        )
        .join("\r\n"),
      blob = new Blob([csv], { type: "text/csv" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    ((a.href = url),
      (a.download = `Class_${window._currentTeacherClass || "List"}_Students.csv`),
      a.click(),
      URL.revokeObjectURL(url));
  }),
  (window.initTeacherAttendance = async function (classNum) {
    ((window._attClass = classNum),
      (window._attEditMode = !1),
      (window._monthLockCache = {}),
      (window._teacherStudentDocs = null));
    const dateInp = document.getElementById("t-att-date");
    dateInp &&
      !dateInp.value &&
      (dateInp.value = new Date().toISOString().split("T")[0]);
    const search = document.getElementById("att-search");
    search && (search.value = "");
    try {
      const snap = await getDocs(
        query(
          collection(db, "students"),
          where("class", "==", String(classNum)),
          orderBy("rollNo"),
        ),
      );
      window._teacherStudentDocs = snap.docs;
    } catch (e) {
      showToast("⚠️ Could not load students: " + e.message);
    }
    loadAttendanceForDate();
  }),
  (window.loadAttendanceForDate = async function () {
    const date = document.getElementById("t-att-date")?.value;
    if (!date) return;
    const classNum = window._attClass || window._currentTeacherClass;
    if (!classNum) return;
    const lockBanner = document.getElementById("t-att-lock-banner"),
      holidayBanner = document.getElementById("t-att-holiday-banner"),
      alreadyMarked = document.getElementById("t-att-already-marked"),
      saveBtn = document.getElementById("t-save-att-btn");
    (lockBanner && (lockBanner.style.display = "none"),
      holidayBanner && (holidayBanner.style.display = "none"),
      alreadyMarked && (alreadyMarked.style.display = "none"));
    try {
      if (await isMonthLocked(classNum, date)) {
        (lockBanner && (lockBanner.style.display = "block"),
          saveBtn && (saveBtn.style.display = "none"));
        const attDoc = await getDoc(
          doc(db, "attendance_daily", `${classNum}_${date}`),
        );
        return void renderAttendanceCards(
          window._teacherStudentDocs || [],
          attDoc.exists() ? attDoc.data() : null,
          !1,
          !0,
        );
      }
      const hSnap = await getDocs(
        query(collection(db, "holidays"), where("date", "==", date)),
      );
      if (!hSnap.empty) {
        const h = hSnap.docs[0].data();
        return (
          holidayBanner &&
            ((holidayBanner.style.display = "block"),
            (document.getElementById("t-att-holiday-msg").textContent =
              `${h.reason} (${h.type})`)),
          saveBtn && (saveBtn.style.display = "none"),
          void renderAttendanceCards([], null, !0)
        );
      }
      saveBtn && (saveBtn.style.display = "");
      const attId = `${classNum}_${date}`,
        attDoc = await getDoc(doc(db, "attendance_daily", attId)),
        existingData = attDoc.exists() ? attDoc.data() : null,
        viewOnly = !(!existingData || window._attEditMode);
      (viewOnly && alreadyMarked && (alreadyMarked.style.display = "block"),
        renderAttendanceCards(
          window._teacherStudentDocs || [],
          existingData,
          !1,
          viewOnly,
        ));
    } catch (e) {
      showToast("⚠️ " + e.message);
    }
  }),
  (window.toggleAttCard = function (card) {
    const state = (parseInt(card.dataset.state) + 1) % 3;
    ((card.dataset.state = state),
      (card.className =
        "att-card " +
        (0 === state ? "present" : 1 === state ? "absent" : "late")),
      (card.querySelector(".att-card-badge").textContent =
        0 === state ? "Present" : 1 === state ? "Absent" : "Late"),
      updateAttSummary());
  }),
  (window.filterAttCards = function (q) {
    const term = q.trim().toLowerCase();
    document.querySelectorAll("#att-card-grid .att-card").forEach((c) => {
      const match =
        !term ||
        c.dataset.name.toLowerCase().includes(term) ||
        String(c.dataset.roll).includes(term);
      c.style.display = match ? "" : "none";
    });
  }),
  (window.markAllAttendance = function (status) {
    const clsMap = { P: "present", A: "absent", L: "late" },
      lblMap = { P: "Present", A: "Absent", L: "Late" },
      state = { P: 0, A: 1, L: 2 }[status];
    (document.querySelectorAll("#att-card-grid .att-card").forEach((c) => {
      "none" !== c.style.display &&
        ((c.dataset.state = state),
        (c.className = "att-card " + clsMap[status]),
        (c.querySelector(".att-card-badge").textContent = lblMap[status]));
    }),
      updateAttSummary());
  }),
  (window.saveAttendance = async function () {
    const date = document.getElementById("t-att-date")?.value,
      classNum = window._attClass || window._currentTeacherClass;
    if (!date || !classNum) return void showToast("⚠️ Date or class missing.");
    if (await isMonthLocked(classNum, date))
      return void showToast(
        "🔒 This month's records have been locked by Admin.",
      );
    const cards = document.querySelectorAll("#att-card-grid .att-card");
    if (!cards.length) return void showToast("⚠️ No students loaded.");
    const absent = [],
      late = [];
    cards.forEach((c) => {
      const s = parseInt(c.dataset.state);
      1 === s
        ? absent.push(c.dataset.sid)
        : 2 === s && late.push(c.dataset.sid);
    });
    const total = cards.length,
      present = total - absent.length - late.length,
      btn = document.getElementById("t-save-att-btn");
    btn &&
      ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'),
      (btn.disabled = !0));
    try {
      (await setDoc(doc(db, "attendance_daily", `${classNum}_${date}`), {
        class: String(classNum),
        date: date,
        absent: absent,
        late: late,
        present: present,
        total: total,
        savedBy: window._teacherId || "teacher",
        savedAt: new Date().toISOString(),
      }),
        showToast("✅ Attendance saved!"));
      const am = document.getElementById("t-att-already-marked");
      am && (am.style.display = "block");
    } catch (e) {
      showToast("❌ " + e.message);
    } finally {
      btn &&
        ((btn.innerHTML = '<i class="fas fa-save"></i> Save Attendance'),
        (btn.disabled = !1));
    }
  }),
  (window.loadAttendanceHistory = async function () {
    const tbody = document.getElementById("t-att-history-tbody");
    if (!tbody) return;
    const classNum = window._attClass || window._currentTeacherClass;
    if (!classNum)
      return void (tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;color:var(--text-light)">Class not set.</td></tr>');
    const monthFilter =
      document.getElementById("att-history-month")?.value || "";
    tbody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    try {
      let q = query(
        collection(db, "attendance_daily"),
        where("class", "==", String(classNum)),
        limit(90),
      );
      const snap = await getDocs(q);
      if (snap.empty)
        return void (tbody.innerHTML =
          '<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--text-light)">No history found.</td></tr>');
      let docs = [...snap.docs].sort((a, b) =>
        b.data().date.localeCompare(a.data().date),
      );
      if (
        (monthFilter &&
          (docs = docs.filter((d) =>
            (d.data().date || "").startsWith(monthFilter),
          )),
        !docs.length)
      )
        return void (tbody.innerHTML =
          '<tr><td colspan="7" style="text-align:center;padding:14px;color:var(--text-light)">No records for selected month.</td></tr>');
      ((window._attHistoryDocs = docs),
        (tbody.innerHTML = docs
          .map((d) => {
            const a = d.data(),
              pct = a.total > 0 ? Math.round((a.present / a.total) * 100) : 0,
              day = a.date
                ? new Date(a.date + "T00:00:00").toLocaleDateString("en", {
                    weekday: "short",
                  })
                : "—",
              bc =
                pct >= 90
                  ? "badge-success"
                  : pct >= 75
                    ? "badge-warning"
                    : "badge-danger";
            return `<tr><td>${a.date || "—"}</td><td>${day}</td><td style="color:var(--success);font-weight:700">${a.present || 0}</td><td style="color:var(--danger);font-weight:700">${(a.absent || []).length}</td><td style="color:#856404;font-weight:700">${(a.late || []).length}</td><td>${a.total || 0}</td><td><span class="badge ${bc}">${pct}%</span></td></tr>`;
          })
          .join("")));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  }),
  (window.exportAttendanceHistory = function () {
    const docs = window._attHistoryDocs;
    if (!docs || !docs.length)
      return void showToast("⚠️ Load history first, then export.");
    const rows = [["Date", "Day", "Present", "Absent", "Late", "Total", "%"]];
    docs.forEach((d) => {
      const a = d.data(),
        pct = a.total > 0 ? Math.round((a.present / a.total) * 100) : 0,
        day = a.date
          ? new Date(a.date + "T00:00:00").toLocaleDateString("en", {
              weekday: "short",
            })
          : "";
      rows.push([
        a.date || "",
        day,
        a.present || 0,
        (a.absent || []).length,
        (a.late || []).length,
        a.total || 0,
        pct + "%",
      ]);
    });
    const csv = rows
        .map((r) =>
          r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
        )
        .join("\r\n"),
      blob = new Blob([csv], { type: "text/csv" }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    const month = document.getElementById("att-history-month")?.value || "All";
    ((a.download = `Attendance_Class${window._attClass || ""}_${month}.csv`),
      a.click(),
      URL.revokeObjectURL(url));
  }),
  (window.loadAdminMonthlyAtt = async function () {
    const classNum = document.getElementById("am-class-sel")?.value,
      tbody = document.getElementById("am-list-tbody");
    if (tbody)
      if (classNum) {
        tbody.innerHTML =
          '<tr><td colspan="6" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i> Loading...</td></tr>';
        try {
          const snap = await getDocs(
            query(
              collection(db, "attendance_monthly"),
              where("class_id", "==", String(classNum)),
              orderBy("month", "desc"),
              limit(24),
            ),
          );
          if (snap.empty)
            return void (tbody.innerHTML =
              '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--text-light)">No snapshots found. Generate one above.</td></tr>');
          tbody.innerHTML = snap.docs
            .map((d) => {
              const r = d.data(),
                badge =
                  "locked" === r.status
                    ? '<span class="am-badge-locked"><i class="fas fa-lock" style="margin-right:4px"></i>Locked</span>'
                    : '<span class="am-badge-draft"><i class="fas fa-clock" style="margin-right:4px"></i>Draft</span>',
                genAt = r.generated_at?.toDate
                  ? r.generated_at.toDate().toLocaleDateString("en-GB")
                  : "—",
                wdays = r.working_days || "—",
                [yr, mo] = (r.month || "").split("_"),
                mLabel =
                  yr && mo
                    ? new Date(yr, parseInt(mo) - 1, 1).toLocaleDateString(
                        "en",
                        { month: "long", year: "numeric" },
                      )
                    : r.month;
              return `<tr>\n          <td><strong>${r.class_id}</strong></td>\n          <td>${mLabel}</td>\n          <td>${wdays}</td>\n          <td>${badge}</td>\n          <td>${genAt}</td>\n          <td><button class="btn btn-sm btn-outline" onclick="openMonthlyDetail('${r.class_id}','${r.month}')"><i class="fas fa-eye"></i> Open</button></td>\n        </tr>`;
            })
            .join("");
        } catch (e) {
          tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
        }
      } else
        tbody.innerHTML =
          '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--text-light)">Please select a class first.</td></tr>';
  }),
  (window.loadAcademicSessions = async function () {
    const sel = document.getElementById("am-session-sel");
    if (sel)
      try {
        const sessions = (
          await getDocs(collection(db, "academicSessions"))
        ).docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""));
        sessions.find((s) => s.active);
        sel.innerHTML =
          '<option value="">— Select Session —</option>' +
          sessions
            .map((s) => {
              const label =
                s.label ||
                `${s.startDate?.slice(0, 4) || ""}–${s.endDate?.slice(0, 4) || ""}`;
              return `<option value="${label}"${s.active ? " selected" : ""}>${label}${s.active ? " (Active)" : ""}</option>`;
            })
            .join("");
      } catch (e) {
        const yr = new Date().getFullYear(),
          opts = [`${yr - 1}–${yr}`, `${yr}–${yr + 1}`, `${yr + 1}–${yr + 2}`];
        sel.innerHTML =
          '<option value="">— Select Session —</option>' +
          opts
            .map(
              (o, i) =>
                `<option value="${o}"${1 === i ? " selected" : ""}>${o}</option>`,
            )
            .join("");
      }
  }),
  (window.generateMonthlySnapshot = async function () {
    const classNum = document.getElementById("am-class-sel")?.value,
      mm = document.getElementById("am-month-sel")?.value,
      yyyy = document.getElementById("am-year-inp")?.value,
      session = document.getElementById("am-session-sel")?.value || "";
    if (!classNum || !mm || !yyyy)
      return void showToast("⚠️ Please fill in class, month, and year.");
    const monthYear = `${yyyy}_${mm}`,
      docId = `${classNum}_${monthYear}`,
      existing = await getDoc(doc(db, "attendance_monthly", docId));
    if (existing.exists() && "locked" === existing.data().status)
      showToast("🔒 This month is locked. Cannot regenerate.");
    else if (
      !existing.exists() ||
      confirm("A snapshot for this month already exists. Overwrite it?")
    ) {
      showToast("⏳ Aggregating attendance data...");
      try {
        const result = await (async function (classNum, yyyy, mm) {
          const monthPrefix = `${yyyy}-${mm}-`,
            classVariants = [String(classNum), ...(!isNaN(Number(classNum)) && classNum !== "" ? [Number(classNum)] : [])],
            [studSnap, dailySnap] = await Promise.all([
              getDocs(
                query(
                  collection(db, "students"),
                  where("class", "==", String(classNum)),
                  orderBy("rollNo"),
                ),
              ),
              getDocs(
                query(
                  collection(db, "attendance_daily"),
                  where("class", "in", classVariants),
                ),
              ),
            ]),
            students = studSnap.docs.map((d) => d.data()),
            dailyDocs = dailySnap.docs
              .map((d) => d.data())
              .filter((d) => (d.date || "").startsWith(monthPrefix)),
            workingDays = dailyDocs.length,
            totals = {};
          (students.forEach((s) => {
            const sid = s.studentId || String(s.rollNo);
            totals[sid] = {
              name: s.name,
              gender: s.gender || "",
              rollNo: s.rollNo,
              present: 0,
              late: 0,
              absent: 0,
            };
          }),
            dailyDocs.forEach((day) => {
              const absentSet = new Set(day.absent || []),
                lateSet = new Set(day.late || []);
              students.forEach((s) => {
                const sid = s.studentId || String(s.rollNo);
                totals[sid] &&
                  (absentSet.has(sid)
                    ? totals[sid].absent++
                    : lateSet.has(sid)
                      ? totals[sid].late++
                      : totals[sid].present++);
              });
            }));
          const mkSummary = (gender) => {
              const subset = Object.values(totals).filter((t) =>
                  "M" === gender ? "M" === t.gender : "M" !== t.gender,
                ),
                p = subset.reduce((a, t) => a + t.present, 0),
                l = subset.reduce((a, t) => a + t.late, 0),
                ab = subset.reduce((a, t) => a + t.absent, 0),
                total = p + l + ab;
              return {
                present: p,
                late: l,
                absent: ab,
                percentage:
                  total > 0 ? +(((p + l) / total) * 100).toFixed(2) : 0,
              };
            },
            studentsOut = {};
          return (
            Object.entries(totals).forEach(([sid, t]) => {
              const total = t.present + t.late + t.absent;
              studentsOut[sid] = {
                name: t.name,
                gender: t.gender,
                rollNo: t.rollNo,
                present: t.present,
                late: t.late,
                absent: t.absent,
                percentage:
                  total > 0
                    ? +(((t.present + t.late) / total) * 100).toFixed(2)
                    : 0,
              };
            }),
            {
              boys_summary: mkSummary("M"),
              girls_summary: mkSummary("F"),
              students: studentsOut,
              working_days: workingDays,
            }
          );
        })(classNum, yyyy, mm);
        (await setDoc(doc(db, "attendance_monthly", docId), {
          month: monthYear,
          class_id: String(classNum),
          status: "draft",
          session: session,
          generated_at: serverTimestamp(),
          working_days: result.working_days,
          boys_summary: result.boys_summary,
          girls_summary: result.girls_summary,
          students: result.students,
        }),
          showToast("✅ Monthly snapshot generated!"),
          loadAdminMonthlyAtt());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    }
  }),
  (window.openMonthlyDetail = async function (classNum, monthYear) {
    const wrap = document.getElementById("am-detail-wrap"),
      title = document.getElementById("am-detail-title"),
      statusBadge = document.getElementById("am-detail-status-badge"),
      lockBtn = document.getElementById("am-lock-btn"),
      summaryGrid = document.getElementById("am-summary-grid"),
      tbody = document.getElementById("am-detail-tbody");
    (wrap.classList.add("open"),
      (tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i></td></tr>'),
      (summaryGrid.innerHTML = ""),
      wrap.scrollIntoView({ behavior: "smooth", block: "start" }));
    try {
      const snap = await getDoc(
        doc(db, "attendance_monthly", `${classNum}_${monthYear}`),
      );
      if (!snap.exists())
        return void (tbody.innerHTML =
          '<tr><td colspan="8" style="text-align:center;color:var(--danger)">Record not found.</td></tr>');
      const r = snap.data();
      window._amCurrentDoc = {
        classNum: classNum,
        monthYear: monthYear,
        status: r.status,
      };
      const [yr, mo] = monthYear.split("_"),
        mLabel = new Date(yr, parseInt(mo) - 1, 1).toLocaleDateString("en", {
          month: "long",
          year: "numeric",
        }),
        sessionTag = r.session
          ? `<span style="font-size:11px;font-weight:600;color:var(--text-light);margin-left:10px;background:rgba(139,111,71,0.1);padding:2px 8px;border-radius:10px">Academic Session: ${r.session}</span>`
          : "";
      ((title.innerHTML = `<i class="fas fa-calendar-check" style="margin-right:8px;color:var(--accent)"></i>Class ${classNum} — ${mLabel}${sessionTag}`),
        (statusBadge.innerHTML =
          "locked" === r.status
            ? '<span class="am-badge-locked"><i class="fas fa-lock" style="margin-right:4px"></i>Locked</span>'
            : '<span class="am-badge-draft"><i class="fas fa-clock" style="margin-right:4px"></i>Draft</span>'),
        (lockBtn.style.display = "locked" === r.status ? "none" : ""));
      const bs = r.boys_summary || {},
        gs = r.girls_summary || {},
        totalP = (bs.present || 0) + (gs.present || 0),
        totalL = (bs.late || 0) + (gs.late || 0),
        totalA = (bs.absent || 0) + (gs.absent || 0),
        totalAll = totalP + totalL + totalA,
        overallPct =
          totalAll > 0
            ? (((totalP + totalL) / totalAll) * 100).toFixed(1)
            : "0.0",
        mkCard = (label, data, bg) =>
          `<div class="am-summary-card" style="background:${bg}">\n        <div class="am-sc-label">${label}</div>\n        <div class="am-sc-pct">${data.percentage ?? 0}%</div>\n        <div class="am-sc-sub">P:${data.present || 0} · L:${data.late || 0} · A:${data.absent || 0}</div>\n      </div>`;
      summaryGrid.innerHTML =
        mkCard("Boys", bs, "rgba(173,216,230,0.35)") +
        mkCard("Girls", gs, "rgba(255,182,193,0.35)") +
        `<div class="am-summary-card" style="background:rgba(214,195,163,0.3)">\n          <div class="am-sc-label">Overall</div>\n          <div class="am-sc-pct">${overallPct}%</div>\n          <div class="am-sc-sub">P:${totalP} · L:${totalL} · A:${totalA}</div>\n        </div>`;
      const studs = Object.entries(r.students || {}).sort(
        (a, b) => (a[1].rollNo || 0) - (b[1].rollNo || 0),
      );
      if (
        ((window._amSnapshotData = {
          r: r,
          studs: studs,
          mLabel: mLabel,
          classNum: classNum,
          monthYear: monthYear,
          overallPct: overallPct,
          bs: bs,
          gs: gs,
        }),
        !studs.length)
      )
        return void (tbody.innerHTML =
          '<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--text-light)">No student data.</td></tr>');
      ((tbody.innerHTML = studs
        .map(([, s]) => {
          const pct = s.percentage ?? 0,
            bc =
              pct >= 90
                ? "badge-success"
                : pct >= 75
                  ? "badge-warning"
                  : "badge-danger",
            gLabel =
              "M" === s.gender ? "Male" : "F" === s.gender ? "Female" : "—";
          return `<tr>\n          <td>${s.rollNo || "—"}</td>\n          <td><strong>${s.name}</strong></td>\n          <td>${gLabel}</td>\n          <td style="color:var(--success);font-weight:700">${s.present}</td>\n          <td style="color:#856404;font-weight:700">${s.late}</td>\n          <td style="color:var(--danger);font-weight:700">${s.absent}</td>\n          <td>${r.working_days || "—"}</td>\n          <td><span class="badge ${bc}">${pct}%</span></td>\n        </tr>`;
        })
        .join("")),
        renderAttendanceRanking(studs));
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  }),
  (window.lockMonthlyRecord = async function () {
    const cur = window._amCurrentDoc;
    if (
      cur &&
      confirm(
        `Lock attendance for Class ${cur.classNum} — ${cur.monthYear}?\n\nThis cannot be undone. Teachers will no longer be able to edit daily records for this month.`,
      )
    )
      try {
        (await updateDoc(
          doc(db, "attendance_monthly", `${cur.classNum}_${cur.monthYear}`),
          {
            status: "locked",
            locked_at: serverTimestamp(),
            locked_by: auth.currentUser?.uid || "admin",
          },
        ),
          showToast("🔒 Records locked successfully!"),
          (window._amCurrentDoc.status = "locked"),
          openMonthlyDetail(cur.classNum, cur.monthYear),
          loadAdminMonthlyAtt());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.pdfExportAttendance = function () {
    const d = window._amSnapshotData;
    if (!d) return void showToast("⚠️ Open a monthly record first.");
    const { jsPDF: jsPDF } = window.jspdf,
      pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }),
      pw = pdf.internal.pageSize.getWidth(),
      pageH = pdf.internal.pageSize.getHeight();
    (pdf.setFontSize(14),
      pdf.setFont("helvetica", "bold"),
      pdf.text("St. Francis De Sales Sec. School", pw / 2, 18, {
        align: "center",
      }),
      pdf.setFontSize(9),
      pdf.setFont("helvetica", "normal"),
      pdf.text("Laitkor, Shillong, Meghalaya", pw / 2, 23, { align: "center" }),
      pdf.setFontSize(12),
      pdf.setFont("helvetica", "bold"),
      pdf.text("Monthly Attendance Report", pw / 2, 31, { align: "center" }),
      pdf.setFontSize(9),
      pdf.setFont("helvetica", "normal"));
    const [yr, mo] = d.monthYear.split("_");
    (pdf.text(
      `Class: ${d.classNum}   |   Month: ${d.mLabel}   |   Generated: ${new Date().toLocaleString()}`,
      pw / 2,
      37,
      { align: "center" },
    ),
      pdf.setDrawColor(139, 111, 71),
      pdf.setLineWidth(0.5),
      pdf.line(14, 40, pw - 14, 40),
      pdf.setFontSize(9),
      pdf.setFont("helvetica", "bold"),
      pdf.text(`Boys: ${d.bs.percentage ?? 0}%`, 14, 47),
      pdf.text(`Girls: ${d.gs.percentage ?? 0}%`, pw / 2 - 10, 47),
      pdf.text(`Overall: ${d.overallPct}%`, pw - 14 - 22, 47),
      pdf.line(14, 50, pw - 14, 50));
    const rows = d.studs.map(([, s]) => [
      s.rollNo || "—",
      s.name,
      "M" === s.gender ? "M" : "F" === s.gender ? "F" : "—",
      s.present,
      s.late,
      s.absent,
      d.r.working_days || "—",
      (s.percentage ?? 0) + "%",
    ]);
    pdf.autoTable({
      startY: 53,
      head: [
        ["Roll", "Name", "Gen", "Present", "Late", "Absent", "Work Days", "%"],
      ],
      body: rows,
      margin: { left: 14, right: 14 },
      headStyles: {
        fillColor: [139, 111, 71],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
      },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 1: { cellWidth: 42 } },
      didParseCell(data) {
        if ("body" === data.section && 7 === data.column.index) {
          const pct = parseFloat(data.cell.raw);
          data.cell.styles.fillColor =
            pct >= 95
              ? [209, 236, 214]
              : pct >= 75
                ? [255, 243, 205]
                : [248, 215, 218];
        }
      },
      didDrawPage(data) {
        const pg = pdf.internal.getCurrentPageInfo().pageNumber;
        (pdf.setFontSize(8),
          pdf.setFont("helvetica", "normal"),
          pdf.text("Generated by School Management System", 14, pageH - 8),
          pdf.text(`Page ${pg}`, pw - 14, pageH - 8, { align: "right" }));
      },
    });
    const finalY = pdf.lastAutoTable.finalY + 14;
    (pdf.setFontSize(9),
      pdf.text("Admin Signature: ___________________", 14, finalY),
      pdf.text(
        "Principal Signature: ___________________",
        pw - 14 - 52,
        finalY,
      ));
    const monLabel = new Date(+yr, parseInt(mo) - 1, 1).toLocaleString("en", {
      month: "long",
    });
    pdf.save(`Class_${d.classNum}_${monLabel}_${yr}_Attendance_Report.pdf`);
  }),
  (window.excelExportAttendance = function () {
    const d = window._amSnapshotData;
    if (!d) return void showToast("⚠️ Open a monthly record first.");
    const [yr, mo] = d.monthYear.split("_"),
      monLabel = new Date(+yr, parseInt(mo) - 1, 1).toLocaleString("en", {
        month: "long",
      }),
      wb = window.XLSX.utils.book_new(),
      rows = [];
    (rows.push(["St. Francis De Sales Sec. School"]),
      rows.push(["Laitkor, Shillong, Meghalaya"]),
      rows.push([`Monthly Attendance Report — Class ${d.classNum}`]),
      rows.push([
        `Month: ${d.mLabel}   |   Generated: ${new Date().toLocaleString()}`,
      ]),
      rows.push([]),
      rows.push(["Analytics Summary"]),
      rows.push([
        "Boys %",
        `${d.bs.percentage ?? 0}%`,
        "Girls %",
        `${d.gs.percentage ?? 0}%`,
        "Overall %",
        `${d.overallPct}%`,
      ]),
      rows.push([]),
      rows.push([
        "Roll No",
        "Name",
        "Gender",
        "Present",
        "Late",
        "Absent",
        "Working Days",
        "Attendance %",
      ]),
      d.studs.forEach(([, s]) => {
        rows.push([
          s.rollNo || "",
          s.name,
          "M" === s.gender ? "Male" : "F" === s.gender ? "Female" : "—",
          s.present,
          s.late,
          s.absent,
          d.r.working_days || "",
          (s.percentage ?? 0) / 100,
        ]);
      }));
    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    ["A", "B", "C", "D", "E", "F", "G", "H"].forEach((col) => {
      const cell = ws[`${col}9`];
      cell &&
        (cell.s = { font: { bold: !0 }, fill: { fgColor: { rgb: "8B6F47" } } });
    });
    (d.studs.forEach((_, i) => {
      const cell = ws[`H${10 + i}`];
      cell && ((cell.t = "n"), (cell.z = "0.0%"));
    }),
      (ws["!cols"] = [
        { wch: 8 },
        { wch: 28 },
        { wch: 10 },
        { wch: 10 },
        { wch: 8 },
        { wch: 10 },
        { wch: 14 },
        { wch: 14 },
      ]),
      (ws["!freeze"] = { xSplit: 0, ySplit: 9 }),
      window.XLSX.utils.book_append_sheet(wb, ws, "Attendance"),
      window.XLSX.writeFile(
        wb,
        `Class_${d.classNum}_${monLabel}_${yr}_Attendance.xlsx`,
      ));
  }),
  (window.printAttendance = function () {
    window._amSnapshotData
      ? (document.body.classList.add("att-printing"),
        window.print(),
        document.body.classList.remove("att-printing"))
      : showToast("⚠️ Open a monthly record first.");
  }),
  (window.renderAttendanceRanking = function (studs) {
    const wrap = document.getElementById("am-ranking-wrap");
    if (!wrap) return;
    if (!studs || !studs.length) return void (wrap.style.display = "none");
    const sorted = [...studs]
        .map(([, s]) => s)
        .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)),
      rows = sorted
        .map((s, i) => {
          const rank = i + 1,
            pct = s.percentage ?? 0;
          return `<tr class="${rank <= 3 ? `att-rank-top att-rank-${rank}` : ""}">\n        <td class="att-rank-num">${rank}</td>\n        <td><strong>${s.name}</strong></td>\n        <td>${pct}%</td>\n        <td>${((pct) => (100 === pct ? '<span class="att-rank-badge perfect">🏆 Perfect Attendance</span>' : pct >= 95 ? '<span class="att-rank-badge excellent">🥈 Excellent Attendance</span>' : pct < 75 ? '<span class="att-rank-badge warning">⚠ Attendance Warning</span>' : ""))(pct)}</td>\n      </tr>`;
        })
        .join("");
    ((wrap.style.display = "block"),
      (wrap.innerHTML = `\n      <div class="att-ranking-card">\n        <div class="att-ranking-title"><i class="fas fa-trophy" style="color:#D4AF37;margin-right:8px"></i>Top Attendance Students</div>\n        <div class="table-wrap">\n          <table>\n            <thead><tr><th>Rank</th><th>Name</th><th>Attendance %</th><th>Badge</th></tr></thead>\n            <tbody>${rows}</tbody>\n          </table>\n        </div>\n      </div>`));
  }),
  (window.populateHwClassSelect = async function () {
    const sel = document.getElementById("hw-class-select");
    if (!sel) return;
    const classLabel = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" };
    sel.innerHTML =
      '<option value="">— Select Class —</option>' +
      ["PLG", "SKG", "LKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]
        .map(
          (c) =>
            `<option value="${c}"${c === String(window._currentTeacherClass) ? "selected" : ""}>${((c) => classLabel[c] || (c ? "Class " + c : ""))(c)}</option>`,
        )
        .join("");
  }),
  (window._hwEditId = null),
  (window.prefillHwForm = function (docId, data) {
    window._hwEditId = docId;
    const sel = document.getElementById("hw-class-select");
    (sel && (sel.value = data.class || ""),
      ["hw-subject", "hw-title", "hw-desc", "hw-due"].forEach((id) => {
        const el = document.getElementById(id);
        el &&
          ("hw-subject" === id
            ? (el.value = data.subject || "")
            : "hw-title" === id
              ? (el.value = data.title || "")
              : "hw-desc" === id
                ? (el.value = data.description || "")
                : "hw-due" === id && (el.value = data.dueDate || ""));
      }));
    const titleEl = document.getElementById("hw-form-title");
    titleEl &&
      (titleEl.innerHTML =
        '<i class="fas fa-edit" style="margin-right:8px;color:var(--accent)"></i>Edit Homework');
    const btn = document.getElementById("hw-submit-btn");
    btn && (btn.innerHTML = '<i class="fas fa-save"></i> Update Homework');
    const cancelBtn = document.getElementById("hw-cancel-btn");
    (cancelBtn && (cancelBtn.style.display = ""),
      document
        .getElementById("hw-form-title")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }),
  (window.cancelHwEdit = function () {
    ((window._hwEditId = null),
      ["hw-subject", "hw-title", "hw-desc", "hw-due"].forEach((id) => {
        const el = document.getElementById(id);
        el && (el.value = "");
      }));
    const titleEl = document.getElementById("hw-form-title");
    titleEl &&
      (titleEl.innerHTML =
        '<i class="fas fa-book-open" style="margin-right:8px;color:var(--accent)"></i>Post New Homework');
    const btn = document.getElementById("hw-submit-btn");
    btn && (btn.innerHTML = '<i class="fas fa-plus"></i> Post Homework');
    const cancelBtn = document.getElementById("hw-cancel-btn");
    cancelBtn && (cancelBtn.style.display = "none");
  }),
  (window.postHomework = async function () {
    const cls = (
        document.getElementById("hw-class-select")?.value || ""
      ).trim(),
      subject = (document.getElementById("hw-subject")?.value || "").trim(),
      title = (document.getElementById("hw-title")?.value || "").trim(),
      desc = (document.getElementById("hw-desc")?.value || "").trim(),
      due = (document.getElementById("hw-due")?.value || "").trim();
    if (cls && subject && title && due)
      if (due < new Date().toISOString().split("T")[0])
        showToast("⚠️ Due date cannot be in the past.");
      else
        try {
          (window._hwEditId
            ? (await updateDoc(doc(db, "homework", window._hwEditId), {
                class: cls,
                subject: subject,
                title: title,
                description: desc,
                dueDate: due,
                updatedAt: new Date().toISOString(),
              }),
              showToast("✅ Homework updated!"),
              cancelHwEdit())
            : (await addDoc(collection(db, "homework"), {
                class: cls,
                subject: subject,
                title: title,
                description: desc,
                dueDate: due,
                postedBy: window._teacherName || "Teacher",
                teacherId: window._teacherId || "",
                createdAt: new Date().toISOString(),
                postedAt: new Date().toISOString(),
              }),
              ["hw-subject", "hw-title", "hw-desc", "hw-due"].forEach((id) => {
                const el = document.getElementById(id);
                el && (el.value = "");
              }),
              showToast("✅ Homework posted!")),
            loadTeacherHomework());
        } catch (e) {
          showToast("❌ " + e.message);
        }
    else showToast("⚠️ Class, subject, title and due date are required.");
  }),
  (window.loadTeacherHomework = async function () {
    const el = document.getElementById("teacher-hw-list");
    if (el)
      try {
        const tid = window._teacherId || "",
          snap = await getDocs(
            tid
              ? query(
                  collection(db, "homework"),
                  where("teacherId", "==", tid),
                  limit(15),
                )
              : query(collection(db, "homework"), limit(15)),
          ),
          hwStat = document.getElementById("t-stat-hw");
        if ((hwStat && (hwStat.textContent = snap.size), snap.empty))
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No homework posted yet.</p>');
        el.innerHTML = [...snap.docs]
          .sort((a, b) =>
            (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
          )
          .map((d) => {
            const hw = d.data(),
              dataJson = JSON.stringify({
                class: hw.class,
                subject: hw.subject,
                title: hw.title,
                description: hw.description || "",
                dueDate: hw.dueDate || "",
              }).replace(/'/g, "&#39;");
            return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div style="font-weight:700;color:var(--accent-dark)">${hw.subject} – ${hw.title}</div><div style="font-size:12px;color:var(--text-light)">Class ${hw.class} · Due: ${hw.dueDate || "—"}</div></div><div style="display:flex;gap:6px;flex-shrink:0"><button onclick="prefillHwForm('${d.id}',JSON.parse(this.dataset.hw))" data-hw='${dataJson}' style="background:none;border:none;color:var(--accent);cursor:pointer" title="Edit"><i class="fas fa-edit"></i></button><button onclick="deleteHomework('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer" title="Delete"><i class="fas fa-trash"></i></button></div></div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger);font-size:13px">❌ ${e.message}</p>`;
      }
  }),
  (window.deleteHomework = async function (docId) {
    if (confirm("Delete this homework?"))
      try {
        (await deleteDoc(doc(db, "homework", docId)),
          showToast("🗑️ Deleted."),
          loadTeacherHomework());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window._tnEditId = null),
  (window.prefillNoticeForm = function (docId, data) {
    window._tnEditId = docId;
    const titleEl = document.getElementById("tn-title");
    titleEl && (titleEl.value = data.title || "");
    const bodyEl = document.getElementById("tn-body");
    bodyEl && (bodyEl.value = data.body || "");
    const audEl = document.getElementById("tn-audience");
    audEl && (audEl.value = data.audience || "class");
    const priEl = document.getElementById("tn-priority");
    priEl && (priEl.value = data.priority || "Normal");
    const hdr = document.getElementById("tn-form-title");
    hdr &&
      (hdr.innerHTML =
        '<i class="fas fa-edit" style="margin-right:8px;color:var(--accent)"></i>Edit Notice');
    const btn = document.getElementById("tn-submit-btn");
    btn && (btn.innerHTML = '<i class="fas fa-save"></i> Update Notice');
    const cancelBtn = document.getElementById("tn-cancel-btn");
    (cancelBtn && (cancelBtn.style.display = ""),
      document
        .getElementById("tn-form-title")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }),
  (window.cancelNoticeEdit = function () {
    ((window._tnEditId = null),
      ["tn-title", "tn-body"].forEach((id) => {
        const el = document.getElementById(id);
        el && (el.value = "");
      }));
    const hdr = document.getElementById("tn-form-title");
    hdr &&
      (hdr.innerHTML =
        '<i class="fas fa-bullhorn" style="margin-right:8px;color:var(--accent)"></i>Post a Notice');
    const btn = document.getElementById("tn-submit-btn");
    btn &&
      (btn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Notice');
    const cancelBtn = document.getElementById("tn-cancel-btn");
    cancelBtn && (cancelBtn.style.display = "none");
  }),
  (window.postTeacherNotice = async function () {
    const title = (document.getElementById("tn-title")?.value || "").trim(),
      body = (document.getElementById("tn-body")?.value || "").trim(),
      audience = document.getElementById("tn-audience")?.value || "class",
      priority = document.getElementById("tn-priority")?.value || "Normal";
    if (title && body)
      try {
        (window._tnEditId
          ? (await updateDoc(doc(db, "notices", window._tnEditId), {
              title: title,
              body: body,
              audience: audience,
              priority: priority,
              updatedAt: new Date().toISOString(),
            }),
            showToast("✅ Notice updated!"),
            cancelNoticeEdit())
          : (await addDoc(collection(db, "notices"), {
              title: title,
              body: body,
              audience: audience,
              priority: priority,
              postedBy: window._teacherName || "Teacher",
              teacherId: window._teacherId || "",
              class: window._currentTeacherClass || "",
              postedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            }),
            (document.getElementById("tn-title").value = ""),
            (document.getElementById("tn-body").value = ""),
            showToast("✅ Notice published!")),
          loadTeacherNotices());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Title and content are required.");
  }),
  (window.loadTeacherNotices = async function () {
    const el = document.getElementById("t-notices-list");
    if (el)
      try {
        const tid = window._teacherId || "",
          snap = await getDocs(
            tid
              ? query(
                  collection(db, "notices"),
                  where("teacherId", "==", tid),
                  limit(20),
                )
              : query(collection(db, "notices"), limit(15)),
          );
        if (snap.empty) {
          el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No notices posted yet.</p>';
          const dashEl = document.getElementById("t-dash-notices");
          return void (
            dashEl &&
            (dashEl.innerHTML =
              '<p style="color:var(--text-light);font-size:13px">No recent notices.</p>')
          );
        }
        const bc = (p) =>
            "Urgent" === p
              ? "badge-danger"
              : "Important" === p
                ? "badge-warning"
                : "badge-info",
          sorted = [...snap.docs].sort((a, b) =>
            (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
          ),
          dashEl = document.getElementById("t-dash-notices");
        (dashEl &&
          (dashEl.innerHTML = sorted
            .slice(0, 3)
            .map((d) => {
              const n = d.data();
              return (
                ((window._noticeModalData = window._noticeModalData || {})[
                  d.id
                ] = n),
                `<div class="chapter-item" style="cursor:pointer" onclick="openNoticeModal('${d.id}')"><i class="fas fa-circle" style="color:${"Urgent" === n.priority ? "var(--danger)" : "Important" === n.priority ? "var(--warning)" : "var(--info)"};font-size:8px;margin-right:8px"></i>${n.title}</div>`
              );
            })
            .join("")),
          (el.innerHTML = sorted
            .map((d) => {
              const n = d.data(),
                dataJson = JSON.stringify({
                  title: n.title,
                  body: n.body || "",
                  audience: n.audience || "class",
                  priority: n.priority || "Normal",
                }).replace(/'/g, "&#39;");
              return `<div style="padding:10px 0;border-bottom:1px solid var(--bg);display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><div><div style="font-weight:700">${n.title}</div><div style="font-size:12px;color:var(--text-light)">${(((window._noticeModalData = window._noticeModalData || {})[d.id] = n), (n.body || "").slice(0, 120))}${(n.body || "").length > 120 ? "…" : ""}${(n.body || "").length > 60 ? ` <span style="color:var(--accent);cursor:pointer;font-size:11px" onclick="openNoticeModal('${d.id}')">View full →</span>` : ""}</div><span class="badge ${bc(n.priority)}" style="margin-top:4px">${n.priority || "Normal"}</span></div><div style="display:flex;gap:6px;flex-shrink:0"><button onclick="prefillNoticeForm('${d.id}',JSON.parse(this.dataset.n))" data-n='${dataJson}' style="background:none;border:none;color:var(--accent);cursor:pointer" title="Edit"><i class="fas fa-edit"></i></button><button onclick="deleteNotice('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer" title="Delete"><i class="fas fa-trash"></i></button></div></div>`;
            })
            .join("")));
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger);font-size:13px">❌ ${e.message}</p>`;
      }
  }),
  (window.postAdminNotice = async function () {
    const title = (document.getElementById("an-title")?.value || "").trim(),
      body = (document.getElementById("an-body")?.value || "").trim(),
      audience = document.getElementById("an-audience")?.value || "all",
      priority = document.getElementById("an-priority")?.value || "Normal";
    if (title && body)
      try {
        (await addDoc(collection(db, "notices"), {
          title: title,
          body: body,
          audience: audience,
          priority: priority,
          postedBy: "Admin",
          postedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }),
          (document.getElementById("an-title").value = ""),
          (document.getElementById("an-body").value = ""),
          showToast("✅ Notice published!"),
          loadAdminNotices());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Title and content are required.");
  }),
  (window.loadAdminNotices = async function () {
    const el = document.getElementById("a-notices-list");
    if (el) {
      el.innerHTML =
        '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
      try {
        const snap = await getDocs(query(collection(db, "notices"), limit(30)));
        if (snap.empty)
          return void (el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px">No notices yet.</p>');
        const AUDIENCE_LABEL = {
            all: "All Students",
            teachers: "Teachers",
            both: "Students + Teachers",
            parents: "Parents",
          },
          sorted = [...snap.docs].sort((a, b) =>
            (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
          );
        el.innerHTML = sorted
          .map((d) => {
            const n = d.data(),
              priority = n.priority || "Normal";
            let cardClass, badgeClass, icon;
            switch (priority) {
              case "Urgent":
                ((cardClass = "priority-urgent"),
                  (badgeClass = "urgent"),
                  (icon = "fa-circle-exclamation"));
                break;
              case "Important":
                ((cardClass = "priority-important"),
                  (badgeClass = "important"),
                  (icon = "fa-triangle-exclamation"));
                break;
              default:
                ((cardClass = "priority-normal"),
                  (badgeClass = "normal"),
                  (icon = "fa-circle-info"));
            }
            const date = n.createdAt
                ? new Date(n.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—",
              audience = AUDIENCE_LABEL[n.audience] || n.audience || "All";
            return `<div class="an-notice-card ${cardClass}">\n          <div class="an-notice-header">\n            <div class="an-notice-title"><i class="fas ${icon}" style="margin-right:6px;opacity:.75"></i>${n.title}</div>\n            <span class="an-notice-badge ${badgeClass}">${priority}</span>\n          </div>\n          <div class="an-notice-meta">\n            <span><i class="fas fa-clock" style="margin-right:3px"></i>${date}</span>\n            <span><i class="fas fa-users" style="margin-right:3px"></i>${audience}</span>\n            <span><i class="fas fa-user-shield" style="margin-right:3px"></i>${n.postedBy || "Admin"}</span>\n          </div>\n          ${n.body ? `<div class="an-notice-body">${n.body.slice(0, 160)}${n.body.length > 160 ? "…" : ""}</div>` : ""}\n          <div class="an-notice-footer">\n            <span style="font-size:11px;color:var(--text-light);opacity:.6">ID: ${d.id.slice(0, 8)}…</span>\n            <button class="an-delete-btn" onclick="deleteNotice('${d.id}')"><i class="fas fa-trash-alt" style="margin-right:4px"></i>Delete</button>\n          </div>\n        </div>`;
          })
          .join("");
      } catch (e) {
        el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
      }
    }
  }),
  (window.updatePriorityPreview = function () {
    const val = document.getElementById("an-priority")?.value || "Normal",
      dot = document.getElementById("an-priority-dot"),
      hint = document.getElementById("an-priority-hint"),
      map = {
        Urgent: {
          color: "#dc2626",
          text: "Urgent — red card with alert icon.",
        },
        Important: {
          color: "#d97706",
          text: "Important — amber card with warning icon.",
        },
        Normal: { color: "#3b82f6", text: "Standard — blue indicator." },
      },
      cfg = map[val] || map.Normal;
    (dot && (dot.style.background = cfg.color),
      hint && ((hint.textContent = cfg.text), (hint.style.color = cfg.color)));
  }),
  (window.deleteNotice = async function (docId) {
    if (confirm("Delete this notice?"))
      try {
        (await deleteDoc(doc(db, "notices", docId)),
          showToast("🗑️ Notice deleted."),
          "admin" === window._currentUserRole
            ? loadAdminNotices()
            : loadTeacherNotices());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window.loadAdminFees = async function () {
    const tbody = document.getElementById("admin-fees-tbody");
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    const filter = (
      document.getElementById("a-fee-filter")?.value || "all"
    ).toLowerCase();
    try {
      const q =
          "all" === filter
            ? query(
                collection(db, "fee_transactions"),
                orderBy("createdAt", "desc"),
                limit(50),
              )
            : query(
                collection(db, "fee_transactions"),
                where("status", "==", filter),
                orderBy("createdAt", "desc"),
                limit(50),
              ),
        snap = await getDocs(q);
      if (snap.empty)
        return void (tbody.innerHTML =
          '<tr><td colspan="9" style="text-align:center;padding:18px;color:var(--text-light)">No fee records found.</td></tr>');
      tbody.innerHTML = snap.docs
        .map((d) => {
          const f = d.data(),
            bc =
              "approved" === f.status
                ? "badge-success"
                : "rejected" === f.status
                  ? "badge-danger"
                  : "badge-warning",
            label = f.status
              ? f.status.charAt(0).toUpperCase() + f.status.slice(1)
              : "Pending",
            fmt =
              f.date ||
              (f.createdAt
                ? new Date(f.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                  })
                : "—"),
            actions =
              "pending" === f.status
                ? `<div style="display:flex;gap:4px"><button class="btn btn-sm btn-success" style="font-size:11px;padding:3px 7px" onclick="approveFeeTransaction('${d.id}')"><i class="fas fa-check"></i></button><button class="btn btn-sm btn-danger" style="font-size:11px;padding:3px 7px" onclick="rejectFeeTransaction('${d.id}')"><i class="fas fa-times"></i></button></div>`
                : `<span style="font-size:11px;color:var(--text-light)">${f.approvedBy || f.rejectedBy || "—"}</span>`;
          return `<tr><td><strong>${f.studentName || "—"}</strong></td><td style="font-size:12px;font-family:monospace">${f.studentId || "—"}</td><td>${f.feeType || f.notes || "—"}</td><td style="font-weight:700">₹${(f.amount || 0).toLocaleString("en-IN")}</td><td style="font-size:12px">${f.paymentMode || f.mode || "—"}</td><td style="font-size:12px;font-family:monospace">${f.receiptNo || f.txnNo || "—"}</td><td style="font-size:12px">${fmt}</td><td><span class="badge ${bc}">${label}</span></td><td>${actions}</td></tr>`;
        })
        .join("");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  }),
  (window.adminAddFeeRecord = async function () {
    const sid = (document.getElementById("af-sid")?.value || "").trim(),
      name = (document.getElementById("af-name")?.value || "").trim(),
      cls = (document.getElementById("af-class")?.value || "").trim(),
      feeType = document.getElementById("af-type")?.value || "",
      amount = parseFloat(document.getElementById("af-amount")?.value || 0),
      status = (
        document.getElementById("af-status")?.value || "pending"
      ).toLowerCase();
    if (!sid || !name || !amount)
      return void showToast("⚠️ Student ID, name and amount are required.");
    const now = new Date().toISOString();
    try {
      (await addDoc(collection(db, "fee_transactions"), {
        studentId: sid,
        studentName: name,
        studentClass: cls,
        feeType: feeType,
        amount: amount,
        paymentMode: "Manual",
        receiptNo: "MANUAL-" + Date.now(),
        status: status,
        source: "admin",
        staffName: "Admin",
        createdAt: now,
        date: now.split("T")[0],
      }),
        ["af-sid", "af-name", "af-class", "af-amount"].forEach((id) => {
          const el = document.getElementById(id);
          el && (el.value = "");
        }),
        showToast("✅ Fee record added."),
        loadAdminFees());
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.loadAdminDashboardStats = async function () {
    try {
      const [sSnap, tSnap, oSnap, fSnap, aSnap, cSnap, lSnap, clSnap] =
          await Promise.all([
            getDocs(collection(db, "students")),
            getDocs(collection(db, "teachers")),
            getDocs(
              query(collection(db, "users"), where("role", "==", "office")),
            ),
            getDocs(
              query(
                collection(db, "fee_transactions"),
                where("status", "==", "pending"),
                limit(500),
              ),
            ),
            getDocs(collection(db, "admissions")),
            getDocs(
              query(
                collection(db, "contacts"),
                where("status", "==", "Unread"),
                limit(200),
              ),
            ),
            getDocs(
              query(
                collection(db, "leave_applications"),
                where("status", "==", "Pending"),
                limit(200),
              ),
            ),
            getDocs(collection(db, "classes")),
          ]),
        set = (id, val) => {
          const el = document.getElementById(id);
          el && (el.textContent = val);
        };
      let totalBoys = 0,
        totalGirls = 0;
      (sSnap.docs.forEach((d) => {
        const g = d.data().gender;
        "M" === g ? totalBoys++ : "F" === g && totalGirls++;
      }),
        set("a-stat-students", sSnap.size),
        set("a-stat-boys", totalBoys),
        set("a-stat-girls", totalGirls),
        set("a-stat-teachers", tSnap.size),
        set("a-stat-office-staff", oSnap.size),
        set("a-stat-fee-pending", fSnap.size));
      (set(
        "a-admission-count",
        aSnap.docs.filter(
          (d) => !["Admitted", "Rejected"].includes(d.data().status),
        ).length,
      ),
        set("a-inbox-fee", fSnap.size),
        set("a-inbox-contacts", cSnap.size),
        set("a-inbox-leave", lSnap.size),
        window.loadAdminNotifications && window.loadAdminNotifications());
      const tbody = document.getElementById("classwise-tbody");
      if (tbody && sSnap.size > 0) {
        const classMap = {};
        sSnap.docs.forEach((d) => {
          const s = d.data(),
            c = s.class || "?";
          (classMap[c] || (classMap[c] = { boys: 0, girls: 0 }),
            "M" === s.gender ? classMap[c].boys++ : classMap[c].girls++);
        });
        const _romanToInt2 = {
            I: 1,
            II: 2,
            III: 3,
            IV: 4,
            V: 5,
            VI: 6,
            VII: 7,
            VIII: 8,
            IX: 9,
            X: 10,
          },
          teacherMap = {};
        clSnap.docs.forEach((d) => {
          const name = d.data().classTeacherName || "";
          if (!name) return;
          const raw = String(d.id).split("-")[0].trim().toUpperCase(),
            num = _romanToInt2[raw] || parseInt(raw) || null;
          num ? (teacherMap[String(num)] = name) : (teacherMap[raw] = name);
        });
        const order = [
            "PLG",
            "SKG",
            "LKG",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "10",
          ],
          classLabel = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
          getL = (c) => classLabel[c] || (c ? "Class " + c : c);
        tbody.innerHTML = order
          .filter((c) => classMap[c])
          .map((c) => {
            const { boys: boys, girls: girls } = classMap[c],
              ct =
                teacherMap[c] ||
                '<span style="color:var(--text-light);font-style:italic">—</span>';
            return `<tr><td>${getL(c)}</td><td>${boys}</td><td>${girls}</td><td><strong>${boys + girls}</strong></td><td style="font-size:13px">${ct}</td></tr>`;
          })
          .join("");
      }
      const homeS = document.getElementById("home-stat-students"),
        homeT = document.getElementById("home-stat-teachers");
      (homeS &&
        sSnap.size > 0 &&
        (homeS.textContent = sSnap.size.toLocaleString("en-IN") + "+"),
        homeT &&
          tSnap.size > 0 &&
          (homeT.textContent = tSnap.size.toLocaleString("en-IN") + "+"));
    } catch (e) {
      console.warn("Dashboard stats:", e.message);
    }
  }),
  (window.loadAdminNotifications = async function () {
    try {
      const snap = await getDocs(
          query(
            collection(db, "admin_notifications"),
            where("read", "==", !1),
            where("type", "==", "admission_forwarded"),
            limit(100),
          ),
        ),
        el = document.getElementById("a-inbox-forwarded");
      el && (el.textContent = snap.size);
    } catch (e) {
      console.warn("Admin notifications:", e.message);
    }
  }),
  (window.loadHolidays = async function () {
    const tbody = document.getElementById("holidays-tbody");
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="5" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
      try {
        const snap = await getDocs(
          query(collection(db, "holidays"), limit(50)),
        );
        if (snap.empty)
          return void (tbody.innerHTML =
            '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-light)">No holidays declared yet.</td></tr>');
        tbody.innerHTML = [...snap.docs]
          .sort((a, b) =>
            (a.data().date || "").localeCompare(b.data().date || ""),
          )
          .map((d) => {
            const h = d.data(),
              day = h.date
                ? new Date(h.date + "T00:00:00").toLocaleDateString("en", {
                    weekday: "long",
                  })
                : "—";
            return `<tr><td>${h.date ? new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}</td><td>${day}</td><td><strong>${h.reason || "—"}</strong></td><td><span class="badge badge-info">${h.type || "—"}</span></td><td><button onclick="deleteHoliday('${d.id}')" style="background:none;border:none;color:var(--danger);cursor:pointer"><i class="fas fa-trash"></i></button></td></tr>`;
          })
          .join("");
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
      }
    }
  }),
  (window.addHoliday = async function () {
    const date = (document.getElementById("h-date")?.value || "").trim(),
      reason = (document.getElementById("h-reason")?.value || "").trim(),
      type = document.getElementById("h-type")?.value || "National";
    if (date && reason)
      try {
        (await setDoc(doc(db, "holidays", date), {
          date: date,
          reason: reason,
          type: type,
          createdAt: new Date().toISOString(),
        }),
          (document.getElementById("h-date").value = ""),
          (document.getElementById("h-reason").value = ""),
          showToast("✅ Holiday declared!"),
          loadHolidays());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    else showToast("⚠️ Date and reason are required.");
  }),
  (window.deleteHoliday = async function (docId) {
    if (confirm("Remove this holiday?"))
      try {
        (await deleteDoc(doc(db, "holidays", docId)),
          showToast("🗑️ Holiday removed."),
          loadHolidays());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }),
  (window._teacherSeedDone = !1),
  (window.seedTeachersIfNeeded = async function () {
    if (!window._teacherSeedDone) {
      window._teacherSeedDone = !0;
      try {
        if (!(await getDocs(query(collection(db, "teachers"), limit(1)))).empty)
          return;
        const seed = [
          {
            teacherId: "SFST001",
            name: "Emilia Lyngdoh Nongbri",
            title: "Miss",
            gender: "F",
            subjects: "Principal",
            classTeacher: "",
            qualification: "M.A.",
            experience: 20,
            whatsapp: "",
            status: "Active",
          },
          {
            teacherId: "SFST002",
            name: "Asha Mary Nongkhlaw",
            title: "Miss",
            gender: "F",
            subjects: "Khasi",
            classTeacher: "",
            qualification: "M.A., B.Ed.",
            experience: 18,
            whatsapp: "",
            status: "Active",
          },
        ];
        for (const t of seed)
          await setDoc(doc(db, "teachers", t.teacherId), {
            ...t,
            createdAt: new Date().toISOString(),
          });
      } catch (e) {
        console.warn("Seed:", e.message);
      }
    }
  }),
  (window.loadTeachers = async function () {
    const tbody = document.getElementById("admin-teacher-tbody"),
      countEl = document.getElementById("teacher-count");
    if (tbody) {
      tbody.innerHTML =
        '<tr><td colspan="8" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
      try {
        const [snap, classSnap] = await Promise.all([
            getDocs(query(collection(db, "teachers"), orderBy("teacherId"))),
            getDocs(collection(db, "classes")),
          ]),
          ctMap = {};
        if (
          (classSnap.docs.forEach((cd) => {
            const cls = cd.data(),
              tid = (cls.classTeacherId || cls.classTeacherUid || "").trim();
            tid && (ctMap[tid] = (cd.id || "").split("-")[0].trim());
          }),
          (window._loadedTeacherDocs = snap.docs),
          (window._teacherClassMap = ctMap),
          countEl &&
            (countEl.textContent = `${snap.size} teacher${1 !== snap.size ? "s" : ""}`),
          snap.empty)
        )
          return void (tbody.innerHTML =
            '<tr><td colspan="8" style="text-align:center;padding:18px;color:var(--text-light)">No teachers found.</td></tr>');
        !(function (docs, ctMap) {
          ctMap = ctMap || window._teacherClassMap || {};
          const tbody = document.getElementById("admin-teacher-tbody"),
            classLabel = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
            getL = (c) => classLabel[c] || (c ? "Class " + c : "—");
          tbody.innerHTML = docs
            .map((d) => {
              const t = d.data(),
                bc =
                  "Active" === t.status
                    ? "badge-success"
                    : "On Leave" === t.status
                      ? "badge-warning"
                      : "badge-danger",
                initials = (
                  t.routineInitials ||
                  t.initials ||
                  ""
                ).toUpperCase(),
                classTeacherDisplay =
                  (initials && ctMap[initials]
                    ? getL(ctMap[initials])
                    : null) || (t.classTeacher ? getL(t.classTeacher) : "—");
              return `<tr data-tname="${(t.name || "").toLowerCase()}">\n        <td><strong style="font-family:monospace;color:var(--accent)">${t.teacherId || "—"}</strong></td>\n        <td>${t.title || "—"}</td><td>${t.name || "—"}</td>\n        <td>${classTeacherDisplay}</td>\n        <td style="font-size:13px">${t.subjects || "—"}</td>\n        <td style="font-size:12px">${t.whatsapp || "—"}</td>\n        <td><span class="badge ${bc}">${t.status || "Active"}</span></td>\n        <td><div style="display:flex;gap:4px;flex-wrap:wrap">\n          <button class="btn btn-sm btn-outline" onclick='editTeacher("${d.id}")'><i class="fas fa-edit"></i></button>\n          <button class="btn btn-sm" style="background:#1a3a6b;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px" onclick='openTeacherLoginModal("${(t.teacherId || "").replace(/"/g, "")}","${(t.name || "").replace(/"/g, "")}","${(t.email || "").replace(/"/g, "")}")' ><i class="fas fa-key"></i></button>\n          <button class="btn btn-sm" style="background:#7c3aed;color:#fff;border:none;border-radius:6px;padding:4px 8px;cursor:pointer;font-size:12px" onclick='openTeacherLeavePanel("${(t.teacherId || "").replace(/"/g, "")}","${(t.name || "").replace(/"/g, "")}")'><i class="fas fa-calendar-times"></i> Leaves</button>\n          <button class="btn btn-sm btn-danger" onclick='promptDeleteTeacher("${d.id}","${(t.name || "").replace(/"/g, "")}")'><i class="fas fa-trash"></i></button>\n        </div></td></tr>`;
            })
            .join("");
        })(snap.docs, ctMap);
      } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
      }
    }
  }));
let _tlpCurrentTeacherId = null;
async function _loadTeacherLeaves(teacherId) {
  const tbody = document.getElementById("tlp-tbody");
  try {
    const docs = (
        await getDocs(
          query(
            collection(db, "leave_applications"),
            where("teacherId", "==", teacherId),
          ),
        )
      ).docs.sort((a, b) =>
        (b.data().createdAt || "").localeCompare(a.data().createdAt || ""),
      ),
      pending = docs.filter((d) => "Pending" === d.data().status).length,
      approved = docs.filter((d) => "Approved" === d.data().status).length,
      set = (id, v) => {
        const el = document.getElementById(id);
        el && (el.textContent = v);
      };
    if (
      (set("tlp-count-pending", pending),
      set("tlp-count-approved", approved),
      set("tlp-count-total", docs.length),
      !docs.length)
    )
      return void (tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-light)">No leave applications yet.</td></tr>');
    const bc = {
        Pending: "badge-warning",
        Approved: "badge-success",
        Rejected: "badge-danger",
      },
      fmt = (s) =>
        s
          ? new Date(s + "T00:00:00").toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            })
          : "—",
      fmtDate = (s) =>
        s
          ? new Date(s).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "2-digit",
            })
          : "—";
    tbody.innerHTML = docs
      .map((d) => {
        const l = d.data(),
          actions =
            "Pending" === l.status
              ? `<div style="display:flex;gap:4px">\n               <button onclick="approveTeacherLeave('${d.id}','${teacherId}')" style="padding:4px 10px;background:#059669;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600"><i class="fas fa-check"></i> Approve</button>\n               <button onclick="rejectTeacherLeave('${d.id}','${teacherId}')"  style="padding:4px 10px;background:#dc2626;color:#fff;border:none;border-radius:6px;font-size:11px;cursor:pointer;font-weight:600"><i class="fas fa-times"></i> Reject</button>\n             </div>`
              : '<span style="font-size:12px;color:var(--text-light)">—</span>';
        return `<tr>\n          <td>${fmt(l.from)}</td><td>${fmt(l.to)}</td>\n          <td style="font-size:12px">${l.type || "—"}</td>\n          <td style="font-size:12px;max-width:160px;white-space:normal">${l.reason || "—"}</td>\n          <td style="font-size:11px;color:var(--text-light)">${fmtDate(l.createdAt)}</td>\n          <td><span class="badge ${bc[l.status] || "badge-info"}">${l.status || "—"}</span></td>\n          <td>${actions}</td>\n        </tr>`;
      })
      .join("");
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
  }
}
async function resetAuthPasswordByUid(uid, email, newPassword) {
  const {
      initializeApp: initializeApp,
      getApp: getApp,
      getApps: getApps,
    } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js"),
    {
      getAuth: getAuth,
      signInWithEmailAndPassword: signInTemp,
      updatePassword: updatePassword,
    } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js");
  throw new Error("NEEDS_CONSOLE_RESET");
}
async function createAuthAccountSafe(email, password) {
  const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          password: password,
          returnSecureToken: !1,
        }),
      },
    ),
    data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || "UNKNOWN";
    if (
      (console.error("[createAuthAccountSafe] Firebase error:", msg, data),
      "EMAIL_EXISTS" === msg)
    ) {
      const err = new Error("auth/email-already-in-use");
      throw ((err.code = "auth/email-already-in-use"), err);
    }
    throw new Error("Failed to create account: " + msg);
  }
  return data.localId;
}
function idToEmailLocal(id) {
  return (
    id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_") + "@stfrancis.school"
  );
}
((window.openTeacherLeavePanel = async function (teacherId, teacherName) {
  ((_tlpCurrentTeacherId = teacherId),
    (document.getElementById("tlp-teacher-name").textContent =
      teacherName + " · " + teacherId),
    ["tlp-count-pending", "tlp-count-approved", "tlp-count-total"].forEach(
      (id) => {
        const el = document.getElementById(id);
        el && (el.textContent = "—");
      },
    ),
    (document.getElementById("tlp-tbody").innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i></td></tr>'),
    (document.getElementById("teacher-leave-overlay").style.display = "block"),
    (document.body.style.overflow = "hidden"),
    await _loadTeacherLeaves(teacherId));
}),
  (window.closeTeacherLeavePanel = function () {
    ((document.getElementById("teacher-leave-overlay").style.display = "none"),
      (document.body.style.overflow = ""),
      (_tlpCurrentTeacherId = null));
  }),
  (window.approveTeacherLeave = async function (leaveDocId, teacherId) {
    try {
      (await updateDoc(doc(db, "leave_applications", leaveDocId), {
        status: "Approved",
        decidedAt: new Date().toISOString(),
      }),
        await _loadTeacherLeaves(teacherId));
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.rejectTeacherLeave = async function (leaveDocId, teacherId) {
    try {
      (await updateDoc(doc(db, "leave_applications", leaveDocId), {
        status: "Rejected",
        decidedAt: new Date().toISOString(),
      }),
        await _loadTeacherLeaves(teacherId));
    } catch (e) {
      showToast("❌ " + e.message);
    }
  }),
  (window.filterTeacherTable = function () {
    const q = (
      document.getElementById("teacher-search")?.value || ""
    ).toLowerCase();
    document
      .querySelectorAll("#admin-teacher-tbody tr[data-tname]")
      .forEach((tr) => {
        tr.style.display =
          tr.dataset.tname.includes(q) ||
          tr.textContent.toLowerCase().includes(q)
            ? ""
            : "none";
      });
  }),
  (window.openTeacherModal = function () {
    ((document.getElementById("teacher-modal-title").textContent =
      "Add New Teacher"),
      (document.getElementById("tf-doc-id").value = ""),
      (function () {
        ((window._teacherPhotoURL = ""),
          [
            "tf-teacherId",
            "tf-routineInitials",
            "tf-title",
            "tf-name",
            "tf-dob",
            "tf-gender",
            "tf-blood",
            "tf-classTeacher",
            "tf-section",
            "tf-subjects",
            "tf-classesTaught",
            "tf-empType",
            "tf-joiningDate",
            "tf-qualification",
            "tf-experience",
            "tf-whatsapp",
            "tf-altContact",
            "tf-email",
            "tf-address",
            "tf-pen",
            "tf-aadhaar",
            "tf-empId",
            "tf-status",
            "tf-remarks",
          ].forEach((id) => {
            const el = document.getElementById(id);
            el &&
              (el.value =
                "tf-nationality" === id
                  ? "Indian"
                  : "tf-status" === id
                    ? "Active"
                    : "");
          }));
        const preview = document.getElementById("tf-photo-preview"),
          placeholder = document.getElementById("tf-photo-placeholder"),
          uploadBtn = document.getElementById("tf-photo-upload-btn"),
          status = document.getElementById("tf-photo-upload-status");
        preview && ((preview.src = ""), (preview.style.display = "none"));
        placeholder && (placeholder.style.display = "flex");
        uploadBtn && (uploadBtn.style.display = "none");
        status && (status.textContent = "");
        const fileInput = document.getElementById("tf-photo-file");
        fileInput && (fileInput.value = "");
      })(),
      (document.getElementById("teacher-modal-overlay").style.display =
        "block"),
      (document.body.style.overflow = "hidden"));
  }),
  (window.closeTeacherModal = function () {
    ((document.getElementById("teacher-modal-overlay").style.display = "none"),
      (document.body.style.overflow = ""));
  }),
  (window.previewTeacherPhoto = function (input) {
    const file = input.files[0];
    if (!file) return;
    const preview = document.getElementById("tf-photo-preview"),
      placeholder = document.getElementById("tf-photo-placeholder"),
      uploadBtn = document.getElementById("tf-photo-upload-btn"),
      status = document.getElementById("tf-photo-upload-status"),
      reader = new FileReader();
    ((reader.onload = (e) => {
      ((preview.src = e.target.result),
        (preview.style.display = "block"),
        (placeholder.style.display = "none"),
        (uploadBtn.style.display = "inline-flex"),
        (status.textContent = "Photo selected — click Upload to save."),
        (status.style.color = "#d97706"));
    }),
      reader.readAsDataURL(file));
  }),
  (window._teacherPhotoURL = ""),
  (window.uploadTeacherPhoto = async function () {
    const file = document.getElementById("tf-photo-file").files[0];
    if (!file) return;
    const btn = document.getElementById("tf-photo-upload-btn"),
      status = document.getElementById("tf-photo-upload-status");
    ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading…'),
      (btn.disabled = !0),
      (status.textContent = ""));
    try {
      const ext = file.name.split(".").pop(),
        fileName = `staff_photos/${Date.now()}.${ext}`,
        fileRef = storageRef(storage, fileName),
        task = uploadBytesResumable(fileRef, file),
        url = await new Promise((resolve, reject) => {
          task.on(
            "state_changed",
            (snap) => {
              status.textContent = `Uploading… ${Math.round((snap.bytesTransferred / snap.totalBytes) * 100)}%`;
            },
            reject,
            async () => resolve(await getDownloadURL(task.snapshot.ref)),
          );
        });
      ((window._teacherPhotoURL = url),
        (status.textContent =
          "✅ Photo uploaded! Click Save Teacher to apply."),
        (status.style.color = "#5a8a5a"),
        (btn.style.display = "none"));
    } catch (e) {
      ((status.textContent = "❌ " + e.message),
        (status.style.color = "#dc2626"));
    } finally {
      ((btn.innerHTML = '<i class="fas fa-upload"></i> Upload'),
        (btn.disabled = !1));
    }
  }),
  (window.editTeacher = function (docId) {
    const doc =
        window._loadedTeacherDocs &&
        window._loadedTeacherDocs.find((d) => d.id === docId),
      t = doc ? doc.data() : {};
    ((document.getElementById("teacher-modal-title").textContent =
      "Edit Teacher"),
      (document.getElementById("tf-doc-id").value = docId));
    const f = {
      teacherId: t.teacherId,
      title: t.title,
      name: t.name,
      dob: t.dob,
      gender: t.gender,
      blood: t.bloodGroup,
      nationality: t.nationality,
      classTeacher: t.classTeacher,
      section: t.section,
      subjects: t.subjects,
      classesTaught: t.classesTaught,
      empType: t.empType,
      joiningDate: t.joiningDate,
      qualification: t.qualification,
      experience: t.experience,
      whatsapp: t.whatsapp,
      altContact: t.altContact,
      email: t.email,
      address: t.address,
      pen: t.penNumber,
      aadhaar: t.aadhaar,
      empId: t.empId,
      status: t.status,
      remarks: t.remarks,
      routineInitials: t.routineInitials || t.initials || "",
      photoURL: t.photoURL || "",
    };
    (Object.entries(f).forEach(([k, v]) => setVal("tf-" + k, v)),
      (window._teacherPhotoURL = t.photoURL || ""));
    const preview = document.getElementById("tf-photo-preview"),
      placeholder = document.getElementById("tf-photo-placeholder"),
      uploadBtn = document.getElementById("tf-photo-upload-btn"),
      status = document.getElementById("tf-photo-upload-status");
    (window._teacherPhotoURL
      ? ((preview.src = window._teacherPhotoURL),
        (preview.style.display = "block"),
        (placeholder.style.display = "none"))
      : ((preview.src = ""),
        (preview.style.display = "none"),
        (placeholder.style.display = "flex")),
      uploadBtn && (uploadBtn.style.display = "none"),
      status && (status.textContent = ""),
      (document.getElementById("teacher-modal-overlay").style.display =
        "block"),
      (document.body.style.overflow = "hidden"));
  }),
  (window.saveTeacher = async function () {
    const btn = document.getElementById("tf-save-btn"),
      teacherId = getVal("tf-teacherId"),
      title = getVal("tf-title"),
      name = getVal("tf-name"),
      subjects = getVal("tf-subjects");
    if (!(teacherId && title && name && subjects))
      return void showToast(
        "⚠️ Teacher ID, title, name and subjects are required.",
      );
    const routineInitials = (getVal("tf-routineInitials") || "")
        .toUpperCase()
        .trim(),
      data = {
        teacherId: teacherId,
        title: title,
        name: name,
        dob: getVal("tf-dob"),
        gender: getVal("tf-gender"),
        bloodGroup: getVal("tf-blood"),
        nationality: getVal("tf-nationality") || "Indian",
        classTeacher: getVal("tf-classTeacher"),
        section: getVal("tf-section"),
        subjects: subjects,
        classesTaught: getVal("tf-classesTaught"),
        empType: getVal("tf-empType") || "Permanent",
        joiningDate: getVal("tf-joiningDate"),
        qualification: getVal("tf-qualification"),
        experience: getVal("tf-experience"),
        whatsapp: getVal("tf-whatsapp"),
        altContact: getVal("tf-altContact"),
        email: getVal("tf-email"),
        address: getVal("tf-address"),
        penNumber: getVal("tf-pen"),
        aadhaar: getVal("tf-aadhaar"),
        empId: getVal("tf-empId"),
        status: getVal("tf-status") || "Active",
        remarks: getVal("tf-remarks"),
        photoURL: window._teacherPhotoURL || "",
        routineInitials: routineInitials,
        initials: routineInitials,
        updatedAt: new Date().toISOString(),
      };
    ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'),
      (btn.disabled = !0));
    try {
      const docId = document.getElementById("tf-doc-id").value;
      (docId
        ? (await setDoc(doc(db, "teachers", docId), data, { merge: !0 }),
          showToast("✅ Teacher updated!"))
        : ((data.createdAt = new Date().toISOString()),
          await addDoc(collection(db, "teachers"), data),
          showToast("✅ Teacher added!")),
        closeTeacherModal(),
        loadTeachers());
    } catch (e) {
      showToast("❌ " + e.message);
    } finally {
      ((btn.innerHTML = '<i class="fas fa-save"></i> Save Teacher'),
        (btn.disabled = !1));
    }
  }),
  (window._pendingDeleteTeacherId = null),
  (window.promptDeleteTeacher = function (docId, name) {
    ((window._pendingDeleteTeacherId = docId),
      (document.getElementById("teacher-delete-msg").textContent =
        `Delete "${name}"? This cannot be undone.`),
      (document.getElementById("teacher-delete-overlay").style.display =
        "flex"));
  }),
  (window.closeTeacherDeleteConfirm = function () {
    ((document.getElementById("teacher-delete-overlay").style.display = "none"),
      (window._pendingDeleteTeacherId = null));
  }),
  (window.confirmDeleteTeacher = async function () {
    const docId = window._pendingDeleteTeacherId;
    if (!docId) return;
    const btn = document.getElementById("confirm-teacher-delete-btn");
    ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'),
      (btn.disabled = !0));
    try {
      (await deleteDoc(doc(db, "teachers", docId)),
        showToast("🗑️ Teacher deleted."),
        closeTeacherDeleteConfirm(),
        loadTeachers());
    } catch (e) {
      showToast("❌ " + e.message);
    } finally {
      ((btn.innerHTML = '<i class="fas fa-trash-alt"></i> Yes, Delete'),
        (btn.disabled = !1));
    }
  }),
  (window.generatePassword = function (seed = "") {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#",
      base = (seed || "")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(-4)
        .toUpperCase();
    let rand = "";
    for (let i = 0; i < 4; i++) rand += chars[Math.floor(56 * Math.random())];
    return base + rand;
  }),
  (window.openTeacherLoginModal = async function (teacherId, name, email) {
    const modal = document.getElementById("teacher-login-modal");
    if (!modal) return;
    ((document.getElementById("tlm-name").textContent = name || teacherId),
      (document.getElementById("tlm-id").textContent = teacherId),
      (document.getElementById("tlm-tid").value = teacherId),
      (document.getElementById("tlm-existing-box").style.display = "none"),
      (document.getElementById("tlm-create-form").style.display = "block"),
      (document.getElementById("tlm-reset-form").style.display = "none"),
      (document.getElementById("tlm-success-box").style.display = "none"),
      (document.getElementById("tlm-actions").style.display = "flex"));
    const av = document.getElementById("tlm-avatar");
    if (av) {
      const p = (name || "T").split(" ");
      av.textContent =
        p.length >= 2
          ? p[0].charAt(0) + p[p.length - 1].charAt(0)
          : p[0].charAt(0).toUpperCase();
    }
    try {
      (
        await getDocs(
          query(collection(db, "users"), where("loginId", "==", teacherId)),
        )
      ).empty
        ? (document.getElementById("tlm-create-btn").innerHTML =
            '<i class="fas fa-user-plus"></i> Create Login Account')
        : ((document.getElementById("tlm-existing-box").style.display =
            "block"),
          (document.getElementById("tlm-existing-email").textContent =
            idToEmailLocal(teacherId)),
          (document.getElementById("tlm-create-btn").innerHTML =
            '<i class="fas fa-key"></i> Reset Password'),
          (document.getElementById("tlm-create-form").style.display = "none"),
          (document.getElementById("tlm-reset-form").style.display = "block"));
    } catch (e) {}
    ((modal.style.display = "flex"), (document.body.style.overflow = "hidden"));
  }),
  (window.closeLoginModal = function () {
    const m = document.getElementById("teacher-login-modal");
    m && ((m.style.display = "none"), (document.body.style.overflow = ""));
  }),
  (window.createTeacherLogin = async function () {
    const tid = document.getElementById("tlm-tid")?.value || "",
      password = (
        document.getElementById("tlm-password")?.value ||
        document.getElementById("tlm-new-password")?.value ||
        ""
      ).trim();
    if (!tid || !password)
      return void showToast("⚠️ Teacher ID and password required.");
    if (password.length < 6)
      return void showToast("⚠️ Password must be at least 6 characters.");
    const btn = document.getElementById("tlm-create-btn");
    ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'),
      (btn.disabled = !0));
    try {
      const loginEmail = idToEmailLocal(tid);
      let uid = "";
      try {
        uid = await createAuthAccountSafe(loginEmail, password);
      } catch (e) {
        if ("auth/email-already-in-use" !== e.code) throw e;
        {
          const snap = await getDocs(
            query(collection(db, "users"), where("loginId", "==", tid)),
          );
          if (snap.empty)
            throw new Error(
              "Account exists but no portal record found. Delete from Firebase Console and retry.",
            );
          uid = snap.docs[0].id;
          try {
            await resetAuthPasswordByUid();
          } catch (re) {
            if ("NEEDS_CONSOLE_RESET" === re.message)
              return (
                (document.getElementById("tlm-done-tid").textContent = tid),
                (document.getElementById("tlm-done-pass").textContent =
                  "(see instructions below)"),
                (document.getElementById("tlm-success-box").style.display =
                  "block"),
                (document.getElementById("tlm-success-box").innerHTML =
                  `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;margin-top:8px;font-size:13px"><b>⚠️ Password Reset Required via Firebase Console</b><br>To reset this teacher's password:<br>1. Go to <a href="https://console.firebase.google.com/project/st-francis-school-a3e7e/authentication/users" target="_blank" style="color:#1a3a6b">Firebase Console → Authentication</a><br>2. Find <b>${loginEmail}</b><br>3. Click ⋮ → <b>Reset password</b> or set new password<br>Then share the new password with the teacher.</div>`),
                void (document.getElementById("tlm-actions").style.display =
                  "none")
              );
            throw re;
          }
        }
      }
      (uid &&
        (await setDoc(
          doc(db, "users", uid),
          {
            role: "teacher",
            teacherId: tid,
            loginId: tid,
            email: loginEmail,
            name: document.getElementById("tlm-name")?.textContent || tid,
            updatedAt: new Date().toISOString(),
          },
          { merge: !0 },
        )),
        (document.getElementById("tlm-done-tid").textContent = tid),
        (document.getElementById("tlm-done-pass").textContent = password),
        (document.getElementById("tlm-success-box").style.display = "block"),
        (document.getElementById("tlm-actions").style.display = "none"),
        showToast("✅ Teacher login ready!"));
    } catch (e) {
      showToast("❌ " + e.message);
    } finally {
      ((btn.innerHTML =
        '<i class="fas fa-user-plus"></i> Create Login Account'),
        (btn.disabled = !1));
    }
  }),
  (window.copyTeacherCredentials = function () {
    const tid = document.getElementById("tlm-done-tid")?.textContent || "",
      pass = document.getElementById("tlm-done-pass")?.textContent || "";
    navigator.clipboard
      ?.writeText(`Teacher Login ID: ${tid}\nPassword: ${pass}`)
      .then(() => showToast("✅ Copied!"))
      .catch(() => showToast("⚠️ Copy manually"));
  }),
  (window.openStudentLoginModal = async function (
    studentId,
    name,
    gender,
    email,
  ) {
    const modal = document.getElementById("student-login-modal");
    if (!modal) return;
    ((document.getElementById("slm-name").textContent = name || studentId),
      (document.getElementById("slm-id").textContent = studentId),
      (document.getElementById("slm-sid").value = studentId),
      (document.getElementById("slm-existing-box").style.display = "none"),
      (document.getElementById("slm-create-form").style.display = "block"),
      (document.getElementById("slm-reset-form").style.display = "none"),
      (document.getElementById("slm-success-box").style.display = "none"),
      (document.getElementById("slm-actions").style.display = "flex"));
    const av = document.getElementById("slm-avatar");
    if (av) {
      const p = (name || "S").split(" ");
      av.textContent =
        p.length >= 2
          ? p[0].charAt(0) + p[p.length - 1].charAt(0)
          : p[0].charAt(0).toUpperCase();
    }
    try {
      (
        await getDocs(
          query(collection(db, "users"), where("loginId", "==", studentId)),
        )
      ).empty
        ? (document.getElementById("slm-create-btn").innerHTML =
            '<i class="fas fa-user-plus"></i> Create Login Account')
        : ((document.getElementById("slm-existing-box").style.display =
            "block"),
          (document.getElementById("slm-existing-email").textContent =
            idToEmailLocal(studentId)),
          (document.getElementById("slm-create-btn").innerHTML =
            '<i class="fas fa-key"></i> Reset Password'),
          (document.getElementById("slm-create-form").style.display = "none"),
          (document.getElementById("slm-reset-form").style.display = "block"));
    } catch (e) {}
    ((modal.style.display = "flex"), (document.body.style.overflow = "hidden"));
  }),
  (window.closeStudentLoginModal = function () {
    const m = document.getElementById("student-login-modal");
    m && ((m.style.display = "none"), (document.body.style.overflow = ""));
  }),
  (window.createStudentLogin = async function () {
    const sid = document.getElementById("slm-sid")?.value || "",
      password = (
        document.getElementById("slm-password")?.value ||
        document.getElementById("slm-new-password")?.value ||
        ""
      ).trim();
    if (!sid || !password)
      return void showToast("⚠️ Student ID and password required.");
    if (password.length < 6)
      return void showToast("⚠️ Password must be at least 6 characters.");
    const btn = document.getElementById("slm-create-btn");
    ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'),
      (btn.disabled = !0));
    try {
      const loginEmail = idToEmailLocal(sid);
      let uid = "";
      try {
        uid = await createAuthAccountSafe(loginEmail, password);
      } catch (e) {
        if ("auth/email-already-in-use" !== e.code) throw e;
        {
          const snap = await getDocs(
            query(collection(db, "users"), where("loginId", "==", sid)),
          );
          if (snap.empty)
            throw new Error(
              "A login account already exists for this student but no portal record was found. Delete the account from Firebase Console and try again.",
            );
          uid = snap.docs[0].id;
          try {
            await resetAuthPasswordByUid();
          } catch (re) {
            if ("NEEDS_CONSOLE_RESET" === re.message)
              return (
                (document.getElementById("slm-success-box").style.display =
                  "block"),
                (document.getElementById("slm-success-box").innerHTML =
                  `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:12px;font-size:13px"><b>⚠️ Password Reset via Firebase Console</b><br>1. Go to <a href="https://console.firebase.google.com/project/st-francis-school-a3e7e/authentication/users" target="_blank" style="color:#1a3a6b">Firebase Console → Authentication</a><br>2. Find <b>${loginEmail}</b> → reset password<br>3. Share the new password with the student.</div>`),
                void (document.getElementById("slm-actions").style.display =
                  "none")
              );
            throw re;
          }
        }
      }
      if (uid) {
        const sSnap = await getDocs(
            query(collection(db, "students"), where("studentId", "==", sid)),
          ),
          sData = sSnap.empty ? {} : sSnap.docs[0].data();
        await setDoc(
          doc(db, "users", uid),
          {
            role: "student",
            studentId: sid,
            loginId: sid,
            email: loginEmail,
            name: document.getElementById("slm-name")?.textContent || sid,
            class: sData.class || "",
            rollNo: sData.rollNo || "",
            updatedAt: new Date().toISOString(),
          },
          { merge: !0 },
        );
      }
      ((document.getElementById("slm-done-sid").textContent = sid),
        (document.getElementById("slm-done-pass").textContent = password),
        (document.getElementById("slm-success-box").style.display = "block"),
        (document.getElementById("slm-actions").style.display = "none"),
        showToast("✅ Student login ready!"));
    } catch (e) {
      showToast("❌ " + e.message);
    } finally {
      ((btn.innerHTML =
        '<i class="fas fa-user-plus"></i> Create Login Account'),
        (btn.disabled = !1));
    }
  }),
  (window.copyStudentCredentials = function () {
    const sid = document.getElementById("slm-done-sid")?.textContent || "",
      pass = document.getElementById("slm-done-pass")?.textContent || "";
    navigator.clipboard
      ?.writeText(`Student ID: ${sid}\nPassword: ${pass}`)
      .then(() => showToast("✅ Copied!"))
      .catch(() => showToast("⚠️ Copy manually"));
  }),
  (async () => {
    let app;
    for (let i = 0; i < 60; i++) {
      if (getApps().length > 0) {
        app = getApp();
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!app) return void console.error("[FeeModule] Firebase app unavailable");
    const db = getFirestore(app),
      CLS = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
      clsLabel = (c) => CLS[c] || (c ? "Class " + c : "—"),
      fmtINR = (n) => "₹" + (parseFloat(n) || 0).toLocaleString("en-IN");
    ((window._officeStaffId = ""),
      (window._officeStaffName = ""),
      (window._feeSelectedStudent = null),
      (window._feeSelectedFeeData = null),
      (window._officePortalLoaded = !1),
      (window.loadOfficePortal = async function (user) {
        if (!window._officePortalLoaded) {
          window._officePortalLoaded = !0;
          try {
            const uSnap = await getDoc(doc(db, "users", user.uid));
            if (!uSnap.exists()) return void (window._officePortalLoaded = !1);
            const u = uSnap.data();
            ((window._officeStaffId = u.staffId || u.loginId || user.uid),
              (window._officeStaffName = u.name || "Office Staff"));
            const nm = document.getElementById("o-header-name");
            nm && (nm.textContent = window._officeStaffName);
            const av = document.getElementById("o-header-avatar");
            if (av) {
              const parts = window._officeStaffName.split(" ");
              av.textContent =
                parts.length >= 2
                  ? parts[0][0] + parts[parts.length - 1][0]
                  : (parts[0][0] || "O").toUpperCase();
            }
            const payDateEl = document.getElementById("pay-date");
            (payDateEl &&
              !payDateEl.value &&
              (payDateEl.value = new Date().toISOString().split("T")[0]),
              loadOfficeDashboardStats());
          } catch (e) {
            console.warn("[OfficePortal]", e.message);
          }
        }
      }),
      (window.loadOfficeProfile = function () {
        const u = auth.currentUser,
          set = (id, v) => {
            const e = document.getElementById(id);
            e && (e.textContent = v || "—");
          };
        (set("op-name", window._officeStaffName || u?.displayName || "—"),
          set("op-staffid", window._officeStaffId || "—"),
          set("op-email", u?.email || "—"),
          set("op-role", "Office Staff"));
      }),
      (window.changeOfficePassword = async function () {
        const current = document.getElementById("op-current-pw")?.value || "",
          newPw = document.getElementById("op-new-pw")?.value || "",
          confirm = document.getElementById("op-confirm-pw")?.value || "";
        if (current && newPw)
          if (newPw.length < 6)
            showToast("⚠️ New password must be at least 6 characters.");
          else if (newPw === confirm)
            try {
              const u = auth.currentUser,
                {
                  EmailAuthProvider: EmailAuthProvider,
                  reauthenticateWithCredential: reauthenticateWithCredential,
                  updatePassword: updatePassword,
                } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"),
                cred = EmailAuthProvider.credential(u.email, current);
              (await reauthenticateWithCredential(u, cred),
                await updatePassword(u, newPw),
                ["op-current-pw", "op-new-pw", "op-confirm-pw"].forEach(
                  (id) => {
                    const e = document.getElementById(id);
                    e && (e.value = "");
                  },
                ),
                showToast("✅ Password updated successfully."));
            } catch (e) {
              const msg =
                "auth/wrong-password" === e.code
                  ? "Current password is incorrect."
                  : e.message;
              showToast("❌ " + msg);
            }
          else showToast("⚠️ Passwords do not match.");
        else showToast("⚠️ Fill in current and new password.");
      }),
      (window.loadOfficeDashboardStats = function () {
        const today = new Date().toISOString().split("T")[0],
          monthPfx = today.slice(0, 7),
          set = (id, v) => {
            const e = document.getElementById(id);
            e && (e.textContent = v);
          };
        (window._officeStatsUnsub &&
          (window._officeStatsUnsub(), (window._officeStatsUnsub = null)),
          (window._officeStatsUnsub = onSnapshot(
            query(
              collection(db, "fee_transactions"),
              where("status", "==", "pending"),
              limit(500),
            ),
            (snap) => {
              set("o-stat-pending", snap.size);
            },
            (e) => console.warn("[OfficeDash:pending]", e.message),
          )),
          Promise.all([
            getDocs(
              query(
                collection(db, "fee_transactions"),
                where("date", "==", today),
                limit(500),
              ),
            ),
            getDocs(
              query(
                collection(db, "fee_transactions"),
                where("status", "==", "approved"),
                where("date", ">=", monthPfx + "-01"),
                where("date", "<=", monthPfx + "-31"),
                limit(500),
              ),
            ),
            getDocs(query(collection(db, "students"), limit(500))),
          ])
            .then(([todaySnap, monthSnap, studentsSnap]) => {
              set("o-stat-today", todaySnap.size);
              let approvedAmt = 0,
                approvedCount = 0;
              (todaySnap.forEach((d) => {
                "approved" === d.data().status &&
                  ((approvedAmt += parseFloat(d.data().amount) || 0),
                  approvedCount++);
              }),
                set("o-stat-total-today", fmtINR(approvedAmt)),
                set("o-stat-approved-today", approvedCount));
              let monthCollected = 0;
              (monthSnap.forEach((d) => {
                monthCollected += parseFloat(d.data().amount) || 0;
              }),
                set("o-stat-month-collected", fmtINR(monthCollected)));
              let totalOutstanding = 0;
              (studentsSnap.forEach((d) => {
                totalOutstanding += parseFloat(d.data().feeBalance) || 0;
              }),
                set("o-stat-total-outstanding", fmtINR(totalOutstanding)),
                loadOfficeRecentTransactions());
            })
            .catch((e) => console.warn("[OfficeDash]", e.message)));
      }),
      (window.loadOfficeRecentTransactions = async function () {
        const tbody = document.getElementById("o-recent-txn-tbody");
        if (tbody)
          try {
            const snap = await getDocs(
              query(
                collection(db, "fee_transactions"),
                orderBy("createdAt", "desc"),
                limit(20),
              ),
            );
            if (snap.empty)
              return void (tbody.innerHTML =
                '<tr><td colspan="6" style="text-align:center;padding:14px;color:var(--text-light)">No transactions yet.</td></tr>');
            const bc = (s) =>
              "approved" === s
                ? "badge-success"
                : "rejected" === s
                  ? "badge-danger"
                  : "badge-warning";
            tbody.innerHTML = snap.docs
              .map((d) => {
                const t = d.data();
                return `<tr>\n          <td style="font-size:12px">${t.date || "—"}</td>\n          <td><strong>${t.studentName || "—"}</strong></td>\n          <td>${clsLabel(t.studentClass)}</td>\n          <td style="font-weight:700">${fmtINR(t.amount)}</td>\n          <td style="font-size:12px">${t.paymentMode || "—"}</td>\n          <td><span class="badge ${bc(t.status)}">${t.status || "pending"}</span></td>\n        </tr>`;
              })
              .join("");
          } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
          }
      }),
      (window.__feeModuleDb = db),
      (window.__feeModuleHelpers = { clsLabel: clsLabel, fmtINR: fmtINR }));
    let _searchTimer = null;
    async function _loadFeeDataForStudent(s) {
      try {
        const [fsSnap, txnSnap] = await Promise.all([
            getDoc(doc(db, "fee_structure", String(s.class))),
            getDocs(
              query(
                collection(db, "fee_transactions"),
                where("studentId", "==", s.studentId || ""),
                limit(100),
              ),
            ),
          ]),
          annualFee =
            (fsSnap.exists() && parseFloat(fsSnap.data().annualFee)) || 0;
        let sDocFeeTotal = 0;
        if (s._docId) {
          const sDocSnap = await getDoc(doc(db, "students", s._docId));
          sDocSnap.exists() &&
            (sDocFeeTotal = parseFloat(sDocSnap.data().feeTotal || 0));
        }
        const _fs = fsSnap.exists() ? fsSnap.data() : {},
          compTotal =
            (parseFloat(_fs.tuition) || 0) +
            (parseFloat(_fs.examFee) || 0) +
            (parseFloat(_fs.sportsFee) || 0) +
            (parseFloat(_fs.annualCharge) || 0),
          feeTotal = compTotal > 0 ? compTotal : annualFee || sDocFeeTotal;
        let feePaid = 0;
        txnSnap.forEach((d) => {
          "approved" === d.data().status &&
            (feePaid += parseFloat(d.data().amount) || 0);
        });
        const feeBalance = Math.max(0, feeTotal - feePaid),
          excess = feeTotal > 0 && feePaid > feeTotal ? feePaid - feeTotal : 0,
          pct =
            feeTotal > 0
              ? Math.min(100, Math.round((feePaid / feeTotal) * 100))
              : 0;
        window._feeSelectedFeeData = {
          feeTotal: feeTotal,
          feePaid: feePaid,
          feeBalance: feeBalance,
          pct: pct,
        };
        const set = (id, v) => {
          const e = document.getElementById(id);
          e && (e.textContent = v);
        };
        (set("fee-total-amt", feeTotal > 0 ? fmtINR(feeTotal) : "₹—"),
          set("fee-paid-amt", fmtINR(feePaid)),
          set("fee-balance-amt", feeTotal > 0 ? fmtINR(feeBalance) : "₹—"));
        const exBox = document.getElementById("fee-excess-msg"),
          exTxt = document.getElementById("fee-excess-text");
        (exBox && (exBox.style.display = excess > 0 ? "block" : "none"),
          exTxt &&
            excess > 0 &&
            (exTxt.textContent = `Student has overpaid by ${fmtINR(excess)}. Excess amount will be refunded to the student.`),
          set("fee-progress-pct", pct + "%"));
        const fs = fsSnap.exists() ? fsSnap.data() : {},
          fmt = (v) => (v ? fmtINR(parseFloat(v)) : "—");
        (set("ldg-tuition", fmt(fs.tuition)),
          set("ldg-exam", fmt(fs.examFee)),
          set("ldg-sports", fmt(fs.sportsFee)),
          set("ldg-annual", fmt(fs.annualCharge)),
          set("ldg-total", feeTotal > 0 ? fmtINR(feeTotal) : "—"),
          set("ldg-paid", fmtINR(feePaid)),
          set("ldg-balance", feeTotal > 0 ? fmtINR(feeBalance) : "—"));
        const bar = document.getElementById("fee-progress-bar");
        bar && (bar.style.width = pct + "%");
        const bb = document.getElementById("fee-balance-block");
        bb && bb.classList.toggle("cleared", 0 === feeBalance && feeTotal > 0);
        const allTxns = [...txnSnap.docs]
            .sort((a, b) =>
              (b.data().createdAt || "").localeCompare(
                a.data().createdAt || "",
              ),
            )
            .slice(0, 10),
          mini = document.getElementById("fee-txn-mini-list");
        if (mini)
          if (allTxns.length) {
            const col = (st) =>
              "approved" === st
                ? "#16a34a"
                : "rejected" === st
                  ? "#dc2626"
                  : "#d97706";
            mini.innerHTML = allTxns
              .map((d) => {
                const t = d.data();
                return `<div class="txn-mini-item" style="flex-wrap:wrap;gap:6px">\n              <div style="flex:1;min-width:120px">\n                <div style="font-weight:700;color:var(--text)">${fmtINR(t.amount)}</div>\n                <div style="font-size:11px;color:var(--text-light)">${t.date || "—"} · ${t.paymentMode || "—"}</div>\n              </div>\n              <span style="color:${col(t.status)};font-weight:700;font-size:10px;white-space:nowrap;text-transform:uppercase;align-self:center">${t.status || "—"}</span>\n              <div style="display:flex;gap:4px;align-self:center">\n                <button onclick="editFeeTransaction('${d.id}')" style="padding:3px 8px;font-size:11px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer" title="Edit"><i class="fas fa-edit"></i></button>\n                <button onclick="deleteFeeTransaction('${d.id}')" style="padding:3px 8px;font-size:11px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer" title="Delete"><i class="fas fa-trash"></i></button>\n              </div>\n            </div>`;
              })
              .join("");
          } else
            mini.innerHTML =
              '<p style="font-size:12px;color:var(--text-light)">No payment history.</p>';
      } catch (e) {
        (console.warn("[FeeData]", e.message),
          showToast("⚠️ Could not load fee data: " + e.message));
      }
    }
    ((window.searchStudentForFee = function (val) {
      (clearTimeout(_searchTimer),
        (_searchTimer = setTimeout(
          () =>
            (async function (raw) {
              const resultsBox = document.getElementById("fee-search-results"),
                listEl = document.getElementById("fee-search-list");
              if (!resultsBox || !listEl) return;
              const classFilter =
                  document.getElementById("fee-class-filter")?.value || "",
                q = (raw || "").trim().toLowerCase();
              if (!q && !classFilter)
                return void (resultsBox.style.display = "none");
              ((listEl.innerHTML =
                '<div style="text-align:center;padding:12px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i></div>'),
                (resultsBox.style.display = "block"));
              try {
                let students = (
                  classFilter
                    ? await getDocs(
                        query(
                          collection(db, "students"),
                          where("class", "==", classFilter),
                          orderBy("rollNo"),
                          limit(40),
                        ),
                      )
                    : await getDocs(
                        query(
                          collection(db, "students"),
                          orderBy("name"),
                          limit(60),
                        ),
                      )
                ).docs.map((d) => ({ _docId: d.id, ...d.data() }));
                if (
                  (q &&
                    (students = students.filter(
                      (s) =>
                        (s.name || "").toLowerCase().includes(q) ||
                        (s.studentId || "").toLowerCase().includes(q) ||
                        String(s.rollNo || "").includes(q),
                    )),
                  !students.length)
                )
                  return void (listEl.innerHTML =
                    '<div style="font-size:13px;color:var(--text-light);padding:10px">No students found.</div>');
                ((window.__feeSearchStudents = students.slice(0, 15)),
                  (listEl.innerHTML = window.__feeSearchStudents
                    .map(
                      (s, i) =>
                        `<div class="fee-search-item" data-idx="${i}" style="cursor:pointer">\n          <div style="display:flex;align-items:center;gap:10px">\n            <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-dark));display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:12px;flex-shrink:0">${(
                          s.name || "S"
                        )
                          .split(" ")
                          .map((w) => w[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}</div>\n            <div>\n              <div style="font-weight:700;font-size:13px;color:var(--text)">${s.name || "—"}</div>\n              <div style="font-size:11px;color:var(--text-light)">${s.studentId || "—"} · ${clsLabel(s.class)} · Roll: ${s.rollNo || "—"}</div>\n            </div>\n          </div>\n          <div style="font-size:12px;color:var(--accent);font-weight:600">${clsLabel(s.class)}</div>\n        </div>`,
                    )
                    .join("")));
              } catch (e) {
                listEl.innerHTML = `<div style="color:var(--danger);font-size:13px;padding:10px">❌ ${e.message}</div>`;
              }
            })(val),
          300,
        )));
    }),
      (window.selectStudentForFee = async function (sStr) {
        let s;
        console.log(
          "Student clicked:",
          sStr ? JSON.parse(sStr)?.name : "unknown",
        );
        try {
          s = JSON.parse(sStr);
        } catch (e) {
          return void console.error("[FeeSelect] parse error", e);
        }
        ((window._feeSelectedStudent = s),
          (document.getElementById("fee-search-results").style.display =
            "none"),
          (document.getElementById("fee-student-panel").style.display =
            "block"),
          (document.getElementById("fee-ledger-container").style.display =
            "none"));
        const initials = (s.name || "S")
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          set = (id, v) => {
            const e = document.getElementById(id);
            e && (e.textContent = v);
          },
          avEl = document.getElementById("fee-avatar");
        (avEl && (avEl.textContent = initials),
          set("fee-sname", s.name || "—"),
          set(
            "fee-sinfo",
            `${s.studentId || "—"} · ${clsLabel(s.class)} · Roll No. ${s.rollNo || "—"}`,
          ),
          await _loadFeeDataForStudent(s),
          (document.getElementById("fee-ledger-container").style.display =
            "block"),
          document
            .getElementById("fee-student-panel")
            ?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }),
      (window.clearFeeStudent = function () {
        ((window._feeSelectedStudent = null),
          (window._feeSelectedFeeData = null),
          (document.getElementById("fee-student-panel").style.display = "none"),
          (document.getElementById("fee-ledger-container").style.display =
            "none"));
        const si = document.getElementById("fee-student-search");
        (si && (si.value = ""),
          (document.getElementById("fee-search-results").style.display =
            "none"));
      }),
      (window._loadFeeDataForStudent = _loadFeeDataForStudent),
      (window.editFeeTransaction = async function (txnId) {
        try {
          const snap = await getDoc(doc(db, "fee_transactions", txnId));
          if (!snap.exists())
            return void showToast("⚠️ Transaction not found.");
          const t = snap.data();
          ((document.getElementById("edit-txn-id").value = txnId),
            (document.getElementById("edit-txn-prev-amount").value =
              t.amount || 0),
            (document.getElementById("edit-txn-status").value =
              t.status || "pending"),
            (document.getElementById("edit-txn-amount").value = t.amount || ""),
            (document.getElementById("edit-txn-mode").value =
              t.paymentMode || "Cash"),
            (document.getElementById("edit-txn-receipt").value =
              t.receiptNo || ""),
            (document.getElementById("edit-txn-date").value = t.date || ""),
            (document.getElementById("edit-txn-notes").value = t.notes || ""));
          const modal = document.getElementById("edit-txn-modal");
          modal && (modal.style.display = "flex");
        } catch (e) {
          showToast("❌ Could not load transaction: " + e.message);
        }
      }),
      (window.saveEditFeeTransaction = async function () {
        const txnId = document.getElementById("edit-txn-id")?.value || "",
          prevAmt = parseFloat(
            document.getElementById("edit-txn-prev-amount")?.value || 0,
          ),
          status = document.getElementById("edit-txn-status")?.value || "",
          newAmt = parseFloat(
            document.getElementById("edit-txn-amount")?.value || 0,
          ),
          mode = document.getElementById("edit-txn-mode")?.value || "",
          receiptNo = (
            document.getElementById("edit-txn-receipt")?.value || ""
          ).trim(),
          date = document.getElementById("edit-txn-date")?.value || "",
          notes = (
            document.getElementById("edit-txn-notes")?.value || ""
          ).trim();
        if (!txnId || !newAmt) return void showToast("⚠️ Amount is required.");
        const btn = document.getElementById("edit-txn-save-btn");
        btn &&
          ((btn.disabled = !0),
          (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'));
        try {
          const txnRef = doc(db, "fee_transactions", txnId),
            txnSnap = await getDoc(txnRef);
          if (!txnSnap.exists())
            return void showToast("❌ Transaction no longer exists.");
          const t = txnSnap.data(),
            amtDiff = newAmt - prevAmt,
            newBalAfter =
              (t.balanceBefore, Math.max(0, (t.balanceAfter || 0) - amtDiff));
          if (
            (await updateDoc(txnRef, {
              amount: newAmt,
              paymentMode: mode,
              receiptNo: receiptNo,
              date: date,
              notes: notes,
              balanceAfter: newBalAfter,
              updatedAt: new Date().toISOString(),
            }),
            "approved" === status && 0 !== amtDiff)
          )
            try {
              const sSnap = await getDocs(
                query(
                  collection(db, "students"),
                  where("studentId", "==", t.studentId || ""),
                  limit(1),
                ),
              );
              if (!sSnap.empty) {
                const sRef = doc(db, "students", sSnap.docs[0].id),
                  sData = sSnap.docs[0].data(),
                  newPaid = Math.max(
                    0,
                    parseFloat(sData.feePaid || 0) + amtDiff,
                  ),
                  newBal = Math.max(
                    0,
                    parseFloat(sData.feeTotal || 0) - newPaid,
                  );
                await updateDoc(sRef, {
                  feePaid: newPaid,
                  feeBalance: newBal,
                  updatedAt: new Date().toISOString(),
                });
              }
            } catch (e) {
              console.warn("[editTxn] student balance update:", e.message);
            }
          ((document.getElementById("edit-txn-modal").style.display = "none"),
            showToast("✅ Payment updated."),
            window._feeSelectedStudent &&
              window._loadFeeDataForStudent &&
              (await window._loadFeeDataForStudent(
                window._feeSelectedStudent,
              )));
        } catch (e) {
          showToast("❌ Update failed: " + e.message);
        } finally {
          btn &&
            ((btn.disabled = !1),
            (btn.innerHTML = '<i class="fas fa-save"></i> Save Changes'));
        }
      }),
      (window.deleteFeeTransaction = async function (txnId) {
        if (confirm("Delete this payment record? This cannot be undone."))
          try {
            const txnSnap = await getDoc(doc(db, "fee_transactions", txnId));
            if (!txnSnap.exists())
              return void showToast("⚠️ Transaction not found.");
            const t = txnSnap.data();
            if ("approved" === t.status)
              try {
                const sSnap = await getDocs(
                  query(
                    collection(db, "students"),
                    where("studentId", "==", t.studentId || ""),
                    limit(1),
                  ),
                );
                if (!sSnap.empty) {
                  const sRef = doc(db, "students", sSnap.docs[0].id),
                    sData = sSnap.docs[0].data(),
                    newPaid = Math.max(
                      0,
                      parseFloat(sData.feePaid || 0) -
                        parseFloat(t.amount || 0),
                    ),
                    newBal = Math.max(
                      0,
                      parseFloat(sData.feeTotal || 0) - newPaid,
                    );
                  await updateDoc(sRef, {
                    feePaid: newPaid,
                    feeBalance: newBal,
                    updatedAt: new Date().toISOString(),
                  });
                }
              } catch (e) {
                console.warn("[deleteTxn] balance reversal:", e.message);
              }
            (await deleteDoc(doc(db, "fee_transactions", txnId)),
              showToast("🗑️ Payment deleted."),
              window._feeSelectedStudent &&
                window._loadFeeDataForStudent &&
                (await window._loadFeeDataForStudent(
                  window._feeSelectedStudent,
                )),
              window.loadAdminFeeTransactions &&
                window.loadAdminFeeTransactions());
          } catch (e) {
            showToast("❌ Delete failed: " + e.message);
          }
      }),
      document.addEventListener("click", function (e) {
        const item = e.target.closest(".fee-search-item[data-idx]");
        if (!item) return;
        const idx = parseInt(item.dataset.idx, 10),
          students = window.__feeSearchStudents || [];
        students[idx] &&
          window.selectStudentForFee(JSON.stringify(students[idx]));
      }));
  })(),
  (async () => {
    const app = await window._sfAppReady,
      db = getFirestore(app),
      CLS = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
      clsLabel = (c) => CLS[c] || (c ? "Class " + c : "—"),
      fmtINR = (n) => "₹" + (parseFloat(n) || 0).toLocaleString("en-IN");
    function _populateReceipt(txn) {
      const set = (id, v) => {
        const e = document.getElementById(id);
        e && (e.textContent = v || "—");
      };
      var d;
      (set(
        "rcp-no",
        txn.receiptNo || (txn.txnId || "").slice(0, 8).toUpperCase(),
      ),
        set(
          "rcp-date",
          (d = txn.date)
            ? new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })
            : "—",
        ),
        set("rcp-student-name", txn.studentName),
        set("rcp-student-id", txn.studentId),
        set("rcp-class", clsLabel(txn.studentClass)),
        set("rcp-roll", txn.studentRollNo || "—"),
        set(
          "rcp-description",
          (txn.notes || "Fee Payment") + " — " + clsLabel(txn.studentClass),
        ),
        set("rcp-amount", fmtINR(txn.amount)),
        set("rcp-total", txn.feeTotal > 0 ? fmtINR(txn.feeTotal) : "₹—"),
        set("rcp-paid-this", fmtINR(txn.amount)),
        set("rcp-balance", fmtINR(txn.balanceAfter)),
        set("rcp-mode", txn.paymentMode),
        set("rcp-notes", txn.notes || "N/A"),
        set("rcp-staff-name", txn.staffName),
        set("rcp-generated-at", new Date().toLocaleString("en-IN")));
      const isOfficial = "provisional" !== txn.receiptType,
        badge = document.getElementById("rcp-type-badge");
      badge &&
        ((badge.textContent = isOfficial
          ? "Official Receipt"
          : "Provisional Receipt"),
        (badge.style.color = isOfficial ? "var(--accent)" : "#d97706"),
        (badge.style.borderColor = isOfficial ? "var(--accent)" : "#d97706"));
      const disc = document.getElementById("rcp-disclaimer");
      disc &&
        (isOfficial
          ? ((disc.style.background = "#d4edda"),
            (disc.style.color = "#155724"),
            (disc.innerHTML =
              '<i class="fas fa-check-circle" style="margin-right:5px"></i>This is an <strong>official receipt</strong> issued by St. Francis De Sales Secondary School.'))
          : ((disc.style.background = "#fff3cd"),
            (disc.style.color = "#856404"),
            (disc.innerHTML =
              '<i class="fas fa-clock" style="margin-right:5px"></i>This is a <strong>provisional receipt</strong> — pending office approval. Official confirmation will be issued upon approval.')));
      const rcpEl = document.getElementById("printable-receipt");
      rcpEl && (rcpEl.style.display = "block");
    }
    ((window.processPayment = async function () {
      if (!window._feeSelectedStudent)
        return void showToast("⚠️ No student selected.");
      const amount = parseFloat(
          document.getElementById("pay-amount")?.value || 0,
        ),
        mode = document.getElementById("pay-mode")?.value || "Cash",
        receiptNo = (
          document.getElementById("pay-receipt-no")?.value || ""
        ).trim(),
        date =
          document.getElementById("pay-date")?.value ||
          new Date().toISOString().split("T")[0],
        notes = (document.getElementById("pay-notes")?.value || "").trim();
      if (!amount || amount <= 0)
        return void showToast("⚠️ Enter a valid payment amount.");
      if (!date) return void showToast("⚠️ Select a payment date.");
      const s = window._feeSelectedStudent,
        fd = window._feeSelectedFeeData || {},
        balBefore = void 0 !== fd.feeBalance ? fd.feeBalance : fd.feeTotal || 0,
        balAfter = Math.max(0, balBefore - amount),
        btn = document.querySelector("#o-fee-collection .btn-primary");
      btn &&
        ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'),
        (btn.disabled = !0));
      try {
        const staffName = window._officeStaffName || "Office Staff",
          now = new Date().toISOString(),
          txnData = {
            studentId: s.studentId || "",
            studentName: s.name || "",
            studentClass: String(s.class || ""),
            studentRollNo: String(s.rollNo || ""),
            amount: amount,
            paymentMode: mode,
            receiptNo: receiptNo || "RCP-" + Date.now(),
            date: date,
            notes: notes,
            staffId: window._officeStaffId || "",
            staffName: staffName,
            balanceBefore: balBefore,
            balanceAfter: balAfter,
            feeTotal: fd.feeTotal || 0,
            status: "approved",
            approvedBy: staffName,
            approvedAt: now,
            source: "office",
            createdAt: now,
          },
          txnRef = await addDoc(collection(db, "fee_transactions"), txnData);
        try {
          const sSnap = await getDocs(
            query(
              collection(db, "students"),
              where("studentId", "==", s.studentId || ""),
              limit(1),
            ),
          );
          if (!sSnap.empty) {
            const sRef = doc(db, "students", sSnap.docs[0].id),
              sData = sSnap.docs[0].data(),
              prevPaid = parseFloat(sData.feePaid || 0),
              total = parseFloat(sData.feeTotal || fd.feeTotal || 0),
              newPaid = prevPaid + amount,
              newBal = Math.max(0, total - newPaid);
            (await updateDoc(sRef, {
              feePaid: newPaid,
              feeBalance: newBal,
              feeTotal: total,
              updatedAt: now,
            }),
              window._feeSelectedFeeData &&
                ((window._feeSelectedFeeData.feePaid = newPaid),
                (window._feeSelectedFeeData.feeBalance = newBal)));
          }
        } catch (updateErr) {
          console.warn(
            "[processPayment] student doc update failed:",
            updateErr.message,
          );
        }
        (window._triggerFeeNotification &&
          window
            ._triggerFeeNotification(
              s.studentId || "",
              amount,
              balAfter,
              txnRef.id,
            )
            .catch(() => {}),
          showToast("✅ Payment recorded and approved. Opening receipt…"),
          _populateReceipt({
            ...txnData,
            txnId: txnRef.id,
            receiptType: "official",
          }),
          ["pay-amount", "pay-receipt-no", "pay-notes"].forEach((id) => {
            const el = document.getElementById(id);
            el && (el.value = "");
          }),
          window._loadFeeDataForStudent &&
            (await window._loadFeeDataForStudent(s)));
      } catch (e) {
        showToast("❌ Could not record payment: " + e.message);
      } finally {
        btn &&
          ((btn.innerHTML = '<i class="fas fa-save"></i> Record Payment'),
          (btn.disabled = !1));
      }
    }),
      (window._populateReceipt = _populateReceipt),
      (window.showStudentReceipt = async function (txnId) {
        const populate = window._populateReceipt || _populateReceipt;
        if (populate)
          try {
            const snap = await getDoc(doc(db, "fee_transactions", txnId));
            if (!snap.exists()) return void showToast("⚠️ Receipt not found.");
            const txnData = snap.data(),
              receiptType =
                "approved" === txnData.status ? "official" : "provisional";
            populate({ ...txnData, txnId: txnId, receiptType: receiptType });
            const rcpEl = document.getElementById("printable-receipt");
            rcpEl &&
              rcpEl.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (e) {
            showToast("⚠️ Could not load receipt: " + e.message);
          }
        else setTimeout(() => window.showStudentReceipt(txnId), 600);
      }),
      (window.loadOfficeReports = async function () {
        const tbody = document.getElementById("o-reports-tbody");
        if (!tbody) return;
        tbody.innerHTML =
          '<tr><td colspan="8" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
        const filter =
          document.getElementById("o-report-filter")?.value || "all";
        try {
          const snap =
            "all" === filter
              ? await getDocs(
                  query(
                    collection(db, "fee_transactions"),
                    orderBy("createdAt", "desc"),
                    limit(60),
                  ),
                )
              : await getDocs(
                  query(
                    collection(db, "fee_transactions"),
                    where("status", "==", filter),
                    orderBy("createdAt", "desc"),
                    limit(60),
                  ),
                );
          if (snap.empty)
            return void (tbody.innerHTML =
              '<tr><td colspan="8" style="text-align:center;padding:14px;color:var(--text-light)">No records found.</td></tr>');
          const bc = (s) =>
            "approved" === s
              ? "badge-success"
              : "rejected" === s
                ? "badge-danger"
                : "badge-warning";
          tbody.innerHTML = snap.docs
            .map((d) => {
              const t = d.data();
              return `<tr>\n          <td style="font-size:12px">${t.date || "—"}</td>\n          <td><strong>${t.studentName || "—"}</strong></td>\n          <td>${clsLabel(t.studentClass)}</td>\n          <td style="font-weight:700">${fmtINR(t.amount)}</td>\n          <td style="font-size:12px">${t.paymentMode || "—"}</td>\n          <td style="font-size:12px;font-family:monospace">${t.receiptNo || "—"}</td>\n          <td style="font-size:12px">${t.staffName || "—"}</td>\n          <td><span class="badge ${bc(t.status)}">${t.status || "pending"}</span></td>\n        </tr>`;
            })
            .join("");
        } catch (e) {
          tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
        }
      }),
      (window.loadClasswiseDueReport = async function () {
        const cls = document.getElementById("o-classwise-filter")?.value || "",
          tbody = document.getElementById("o-classwise-tbody"),
          summary = document.getElementById("o-classwise-summary");
        if (tbody)
          if (cls) {
            ((tbody.innerHTML =
              '<tr><td colspan="6" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>'),
              summary && (summary.innerHTML = ""));
            try {
              const snap = await getDocs(
                query(
                  collection(db, "students"),
                  where("class", "==", cls),
                  limit(200),
                ),
              );
              if (snap.empty)
                return void (tbody.innerHTML =
                  '<tr><td colspan="6" style="text-align:center;padding:16px;color:var(--text-light)">No students found in this class.</td></tr>');
              const students = snap.docs
                .map((d) => d.data())
                .sort(
                  (a, b) =>
                    (parseInt(a.rollNo) || 0) - (parseInt(b.rollNo) || 0),
                );
              let totalBalance = 0,
                cleared = 0;
              ((tbody.innerHTML = students
                .map((s) => {
                  const total = parseFloat(s.feeTotal || 0),
                    paid = parseFloat(s.feePaid || 0),
                    balance = parseFloat(
                      s.feeBalance || Math.max(0, total - paid),
                    );
                  (balance <= 0 && cleared++, (totalBalance += balance));
                  const rowColor =
                      balance <= 0
                        ? "background:#d4edda"
                        : "background:#fff3cd",
                    badge =
                      balance <= 0
                        ? '<span class="badge badge-success">Cleared</span>'
                        : `<span class="badge badge-danger">Due: ${fmtINR(balance)}</span>`;
                  return `<tr style="${rowColor}">\n          <td style="font-size:12px">${s.rollNo || "—"}</td>\n          <td><strong>${s.name || "—"}</strong></td>\n          <td style="font-weight:700">${fmtINR(total)}</td>\n          <td style="color:#28a745;font-weight:700">${fmtINR(paid)}</td>\n          <td style="color:#dc3545;font-weight:700">${fmtINR(balance)}</td>\n          <td>${badge}</td>\n        </tr>`;
                })
                .join("")),
                summary &&
                  (summary.innerHTML = `\n        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px">\n          <span style="background:#d4edda;color:#155724;border:1px solid #c3e6cb;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700"><i class="fas fa-check-circle"></i> ${cleared} Cleared</span>\n          <span style="background:#fff3cd;color:#856404;border:1px solid #ffc107;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700"><i class="fas fa-exclamation-triangle"></i> ${students.length - cleared} With Dues</span>\n          <span style="background:#f8d7da;color:#721c24;border:1px solid #dc3545;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700"><i class="fas fa-rupee-sign"></i> ${fmtINR(totalBalance)} Outstanding</span>\n        </div>`));
            } catch (e) {
              tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
            }
          } else showToast("⚠️ Please select a class.");
      }));
  })(),
  (async () => {
    const app = await window._sfAppReady,
      db = getFirestore(app),
      CLS = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
      clsLabel = (c) => CLS[c] || (c ? "Class " + c : "—"),
      fmtINR = (n) => "₹" + (parseFloat(n) || 0).toLocaleString("en-IN");
    ((window.saveFeeStructure = async function () {
      const cls = document.getElementById("fs-class")?.value || "",
        annualFee = parseFloat(
          document.getElementById("fs-annual-fee")?.value || 0,
        );
      if (!cls || !annualFee)
        return void showToast("⚠️ Class and annual fee are required.");
      const data = {
        class: cls,
        annualFee: annualFee,
        tuition:
          parseFloat(document.getElementById("fs-tuition")?.value || 0) || 0,
        examFee:
          parseFloat(document.getElementById("fs-exam-fee")?.value || 0) || 0,
        sportsFee:
          parseFloat(document.getElementById("fs-sports-fee")?.value || 0) || 0,
        annualCharge:
          parseFloat(document.getElementById("fs-annual-charge")?.value || 0) ||
          0,
        notes: (document.getElementById("fs-notes")?.value || "").trim(),
        updatedAt: new Date().toISOString(),
      };
      try {
        (await setDoc(doc(db, "fee_structure", cls), data, { merge: !0 }),
          showToast("✅ Fee structure saved for " + clsLabel(cls)),
          loadAdminFeeStructure());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    }),
      (window.loadAdminFeeStructure = async function () {
        const el = document.getElementById("admin-fee-structure-list");
        if (el) {
          el.innerHTML =
            '<p style="color:var(--text-light);font-size:13px"><i class="fas fa-spinner fa-spin"></i></p>';
          try {
            const snap = await getDocs(collection(db, "fee_structure"));
            if (snap.empty)
              return void (el.innerHTML =
                '<p style="color:var(--text-light);font-size:13px">No fee structure set yet.</p>');
            const ORDER = [
                "PLG",
                "SKG",
                "LKG",
                "1",
                "2",
                "3",
                "4",
                "5",
                "6",
                "7",
                "8",
                "9",
                "10",
              ],
              sorted = [...snap.docs].sort(
                (a, b) =>
                  ORDER.indexOf(a.data().class) - ORDER.indexOf(b.data().class),
              );
            el.innerHTML =
              '<div class="table-wrap"><table style="width:100%;font-size:13px;border-collapse:collapse">\n        <thead><tr>\n          <th style="text-align:left;padding:8px 4px;border-bottom:1.5px solid var(--bg);color:var(--accent-dark)">Class</th>\n          <th style="text-align:right;padding:8px 4px;border-bottom:1.5px solid var(--bg);color:var(--accent-dark)">Annual Fee</th>\n          <th style="text-align:right;padding:8px 4px;border-bottom:1.5px solid var(--bg)"></th>\n        </tr></thead><tbody>' +
              sorted
                .map((d) => {
                  const f = d.data();
                  return `<tr>\n            <td style="padding:8px 4px;border-bottom:1px solid var(--bg)"><strong>${clsLabel(f.class)}</strong>${f.notes ? `<div style="font-size:11px;color:var(--text-light)">${f.notes}</div>` : ""}</td>\n            <td style="padding:8px 4px;border-bottom:1px solid var(--bg);text-align:right;font-weight:700;color:var(--accent-dark)">${fmtINR(f.annualFee)}</td>\n            <td style="padding:8px 4px;border-bottom:1px solid var(--bg);text-align:right;white-space:nowrap">\n              <button onclick="prefillFeeStructure('${f.class}',${f.annualFee || 0},${f.tuition || 0},${f.examFee || 0},${f.sportsFee || 0},${f.annualCharge || 0})" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px"><i class="fas fa-edit"></i></button>\n              <button onclick="deleteFeeStructure('${f.class}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px;margin-left:8px"><i class="fas fa-trash"></i></button>\n            </td>\n          </tr>`;
                })
                .join("") +
              "</tbody></table></div>";
          } catch (e) {
            el.innerHTML = `<p style="color:var(--danger)">❌ ${e.message}</p>`;
          }
        }
      }),
      (window.prefillFeeStructure = function (
        cls,
        annual,
        tuition,
        exam,
        sports,
        annualCharge,
      ) {
        const set = (id, v) => {
          const e = document.getElementById(id);
          e && (e.value = v);
        };
        (set("fs-class", cls),
          set("fs-annual-fee", annual),
          set("fs-tuition", tuition),
          set("fs-exam-fee", exam),
          set("fs-sports-fee", sports),
          set("fs-annual-charge", annualCharge));
      }),
      (window.deleteFeeStructure = async function (cls) {
        if (confirm("Delete fee structure for " + clsLabel(cls) + "?"))
          try {
            (await deleteDoc(doc(db, "fee_structure", cls)),
              showToast("🗑️ Fee structure deleted."),
              loadAdminFeeStructure());
          } catch (e) {
            showToast("❌ " + e.message);
          }
      }),
      (window.loadAdminFeeTransactions = async function () {
        const tbody = document.getElementById("admin-fee-txn-tbody");
        if (!tbody) return;
        tbody.innerHTML =
          '<tr><td colspan="11" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i></td></tr>';
        const filter =
          (
            document.getElementById("a-txn-filter") ||
            document.getElementById("o-txn-filter")
          )?.value || "pending";
        try {
          const snap =
            "all" === filter
              ? await getDocs(
                  query(collection(db, "fee_transactions"), limit(100)),
                )
              : await getDocs(
                  query(
                    collection(db, "fee_transactions"),
                    where("status", "==", filter),
                    limit(100),
                  ),
                );
          if (snap.empty)
            return void (tbody.innerHTML =
              '<tr><td colspan="11" style="text-align:center;padding:18px;color:var(--text-light)">No records found.</td></tr>');
          const docs = snap.docs.slice().sort((a, b) => {
              const ta = a.data().createdAt?.toMillis
                ? a.data().createdAt.toMillis()
                : new Date(a.data().createdAt || 0).getTime();
              return (
                (b.data().createdAt?.toMillis
                  ? b.data().createdAt.toMillis()
                  : new Date(b.data().createdAt || 0).getTime()) - ta
              );
            }),
            bc = (s) =>
              "approved" === s
                ? "badge-success"
                : "rejected" === s
                  ? "badge-danger"
                  : "badge-warning";
          tbody.innerHTML = docs
            .map((d) => {
              const t = d.data(),
                receiptCell = t.receiptUrl
                  ? `<div style="font-family:monospace;font-size:12px">${t.receiptNo || "—"}</div>\n             <a href="${t.receiptUrl}" target="_blank" rel="noopener"\n                style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:11px;color:var(--primary);text-decoration:none;background:rgba(99,102,241,.08);padding:3px 8px;border-radius:6px;border:1px solid var(--primary)">\n               <i class="fas fa-image"></i> View Receipt\n             </a>`
                  : `<span style="font-family:monospace;font-size:12px">${t.receiptNo || "—"}</span>`,
                sourceTag =
                  "student-portal" === t.source
                    ? '<div style="font-size:10px;color:var(--primary);margin-top:2px"><i class="fas fa-mobile-alt"></i> Online</div>'
                    : "",
                editDelBtns = `<button onclick="editFeeTransaction('${d.id}')" style="padding:3px 8px;font-size:11px;background:var(--primary);color:#fff;border:none;border-radius:6px;cursor:pointer" title="Edit"><i class="fas fa-edit"></i></button>\n               <button onclick="deleteFeeTransaction('${d.id}')" style="padding:3px 8px;font-size:11px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer" title="Delete"><i class="fas fa-trash"></i></button>`,
                acts =
                  "pending" === t.status
                    ? `<div style="display:flex;gap:4px;flex-wrap:wrap">\n               <button class="btn btn-sm btn-success" style="font-size:11px;padding:3px 8px" onclick="approveFeeTransaction('${d.id}')"><i class="fas fa-check"></i> Approve</button>\n               <button class="btn btn-sm btn-danger"  style="font-size:11px;padding:3px 7px" onclick="rejectFeeTransaction('${d.id}')"><i class="fas fa-times"></i></button>\n               ${editDelBtns}\n             </div>`
                    : `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center">\n               <span style="font-size:11px;color:var(--text-light)">${"approved" === t.status ? t.approvedBy || "Staff" : "Rejected"}</span>\n               ${editDelBtns}\n             </div>`;
              return `<tr>\n          <td style="font-size:12px">${t.date || "—"}</td>\n          <td><strong>${t.studentName || "—"}</strong>${sourceTag}</td>\n          <td>${clsLabel(t.studentClass)}</td>\n          <td style="font-weight:700">${fmtINR(t.amount)}</td>\n          <td style="font-size:12px">${t.paymentMode || "—"}</td>\n          <td>${receiptCell}</td>\n          <td style="font-size:12px">${fmtINR(t.balanceBefore)}</td>\n          <td style="font-size:12px;font-weight:700;color:var(--accent-dark)">${fmtINR(t.balanceAfter)}</td>\n          <td style="font-size:12px">${t.staffName || "—"}</td>\n          <td><span class="badge ${bc(t.status)}">${t.status || "pending"}</span></td>\n          <td>${acts}</td>\n        </tr>`;
            })
            .join("");
        } catch (e) {
          tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
        }
      }));
  })(),
  (async () => {
    const app = await window._sfAppReady,
      db = getFirestore(app),
      CLS = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
      clsLabel = (c) => CLS[c] || (c ? "Class " + c : "—"),
      ORDER = [
        "PLG",
        "SKG",
        "LKG",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
      ];
    ((window.officeStaffSaveFeeStructure = async function () {
      const cls = (document.getElementById("ofs-class")?.value || "").trim(),
        annualFee = parseFloat(
          document.getElementById("ofs-annual-fee")?.value || 0,
        );
      if (!cls) return void showToast("⚠️ Please select a class.");
      if (!annualFee) return void showToast("⚠️ Annual fee is required.");
      const data = {
        class: cls,
        annualFee: annualFee,
        tuition:
          parseFloat(document.getElementById("ofs-tuition")?.value || 0) || 0,
        examFee:
          parseFloat(document.getElementById("ofs-exam-fee")?.value || 0) || 0,
        sportsFee:
          parseFloat(document.getElementById("ofs-sports-fee")?.value || 0) ||
          0,
        annualCharge:
          parseFloat(
            document.getElementById("ofs-annual-charge")?.value || 0,
          ) || 0,
        notes: (document.getElementById("ofs-notes")?.value || "").trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: window._officeStaffName || "Office Staff",
      };
      try {
        (await setDoc(doc(db, "fee_structure", cls), data, { merge: !0 }),
          showToast("✅ Fee structure saved for " + clsLabel(cls)),
          [
            "ofs-class",
            "ofs-annual-fee",
            "ofs-tuition",
            "ofs-exam-fee",
            "ofs-sports-fee",
            "ofs-annual-charge",
            "ofs-notes",
          ].forEach((id) => {
            const el = document.getElementById(id);
            el && (el.value = "");
          }),
          officeStaffLoadFeeStructure());
      } catch (e) {
        showToast("❌ " + e.message);
      }
    }),
      (window.officeStaffLoadFeeStructure = async function () {
        const el = document.getElementById("ofs-structure-list");
        if (el) {
          el.innerHTML =
            '<p style="font-size:13px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
          try {
            const snap = await getDocs(collection(db, "fee_structure"));
            if (snap.empty)
              return void (el.innerHTML =
                '<p style="font-size:13px;color:var(--text-light)">No fee structure set yet.</p>');
            const sorted = [...snap.docs].sort(
              (a, b) =>
                ORDER.indexOf(a.data().class) - ORDER.indexOf(b.data().class),
            );
            el.innerHTML =
              '<div class="table-wrap"><table><thead><tr><th>Class</th><th>Annual Fee</th><th>Updated By</th><th></th></tr></thead><tbody>' +
              sorted
                .map((d) => {
                  const f = d.data();
                  return `<tr>\n            <td><strong>${clsLabel(f.class)}</strong>${f.notes ? `<div style="font-size:11px;color:var(--text-light)">${f.notes}</div>` : ""}</td>\n            <td style="font-weight:700;color:var(--accent-dark)">${((n = f.annualFee), "₹" + (parseFloat(n) || 0).toLocaleString("en-IN"))}</td>\n            <td style="font-size:12px;color:var(--text-light)">${f.updatedBy || "—"}</td>\n            <td>\n              <button onclick="officeStaffPrefillFeeForm('${f.class}',${f.annualFee || 0},${f.tuition || 0},${f.examFee || 0},${f.sportsFee || 0},${f.annualCharge || 0})"\n                style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:13px" title="Edit">\n                <i class="fas fa-edit"></i>\n              </button>\n            </td>\n          </tr>`;
                  var n;
                })
                .join("") +
              "</tbody></table></div>";
          } catch (e) {
            el.innerHTML = `<p style="color:var(--danger);font-size:13px">❌ ${e.message}</p>`;
          }
        }
      }),
      (window.officeStaffPrefillFeeForm = function (
        cls,
        annual,
        tuition,
        exam,
        sports,
        annualCharge,
      ) {
        const set = (id, v) => {
          const e = document.getElementById(id);
          e && (e.value = v);
        };
        (set("ofs-class", cls),
          set("ofs-annual-fee", annual),
          set("ofs-tuition", tuition),
          set("ofs-exam-fee", exam),
          set("ofs-sports-fee", sports),
          set("ofs-annual-charge", annualCharge));
      }),
      console.log("[OfficeFeeStructure] ✅ Loaded"));
  })(),
  (async () => {
    const app = await window._sfAppReady,
      db = (getAuth(app), getFirestore(app));
    function _osMsg(type, text) {
      const errEl = document.getElementById("os-create-error"),
        okEl = document.getElementById("os-create-success");
      errEl &&
        okEl &&
        ((errEl.style.display = "none"),
        (okEl.style.display = "none"),
        "error" === type &&
          ((errEl.textContent = text), (errEl.style.display = "block")),
        "ok" === type &&
          ((okEl.textContent = text), (okEl.style.display = "block")));
    }
    ((window.createOfficeStaffAccount = async function () {
      const name = (document.getElementById("os-name")?.value || "").trim(),
        staffId = (document.getElementById("os-staffid")?.value || "")
          .trim()
          .toUpperCase(),
        password = (document.getElementById("os-password")?.value || "").trim();
      if (!name) return void _osMsg("error", "Full name is required.");
      if (!staffId) return void _osMsg("error", "Staff Login ID is required.");
      if (password.length < 6)
        return void _osMsg("error", "Password must be at least 6 characters.");
      const btn = document.getElementById("os-create-btn");
      (btn &&
        ((btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating…'),
        (btn.disabled = !0)),
        _osMsg("", ""));
      try {
        const email =
          staffId
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "_") + "@stfrancis.school";
        let uid = "";
        try {
          uid = await createAuthAccountSafe(email, password);
        } catch (e) {
          if ("auth/email-already-in-use" !== e.code) throw e;
          {
            const snap = await getDocs(
              query(
                collection(db, "users"),
                where("loginId", "==", staffId),
                limit(1),
              ),
            );
            if (snap.empty)
              return void _osMsg(
                "error",
                "Login ID already taken. Choose a different ID.",
              );
            uid = snap.docs[0].id;
          }
        }
        (await setDoc(
          doc(db, "users", uid),
          {
            name: name,
            staffId: staffId,
            loginId: staffId,
            email: email,
            role: "office",
            createdAt: new Date().toISOString(),
          },
          { merge: !0 },
        ),
          _osMsg(
            "ok",
            `✅ Account created! Staff ID: ${staffId} · Password: ${password}`,
          ),
          (document.getElementById("os-name").value = ""),
          (document.getElementById("os-staffid").value = ""),
          (document.getElementById("os-password").value = ""),
          loadOfficeStaffList());
      } catch (e) {
        _osMsg("error", "❌ " + (e.message || "Could not create account."));
      } finally {
        btn &&
          ((btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account'),
          (btn.disabled = !1));
      }
    }),
      (window.loadOfficeStaffList = async function () {
        const el = document.getElementById("os-staff-list");
        if (el) {
          el.innerHTML =
            '<p style="font-size:13px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</p>';
          try {
            const snap = await getDocs(
              query(
                collection(db, "users"),
                where("role", "==", "office"),
                orderBy("createdAt", "desc"),
                limit(50),
              ),
            );
            if (snap.empty)
              return void (el.innerHTML =
                '<p style="font-size:13px;color:var(--text-light)">No office staff accounts yet.</p>');
            el.innerHTML =
              '<div class="table-wrap"><table><thead><tr><th>Name</th><th>Login ID</th><th>Created</th><th></th></tr></thead><tbody>' +
              snap.docs
                .map((d) => {
                  const u = d.data(),
                    date = u.createdAt ? u.createdAt.split("T")[0] : "—";
                  return `<tr>\n            <td><strong>${u.name || "—"}</strong></td>\n            <td style="font-family:monospace;font-size:13px">${u.loginId || u.staffId || "—"}</td>\n            <td style="font-size:12px;color:var(--text-light)">${date}</td>\n            <td><button onclick="deleteOfficeStaff('${d.id}','${u.name || ""}')" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:13px" title="Remove"><i class="fas fa-trash"></i></button></td>\n          </tr>`;
                })
                .join("") +
              "</tbody></table></div>";
          } catch (e) {
            el.innerHTML = `<p style="color:var(--danger);font-size:13px">❌ ${e.message}</p>`;
          }
        }
      }),
      (window.deleteOfficeStaff = async function (uid, name) {
        if (
          confirm(
            `Remove "${name}" from office staff? Their Firebase Auth account will remain but portal access will be revoked.`,
          )
        )
          try {
            (await deleteDoc(doc(db, "users", uid)),
              showToast("🗑️ Staff record removed."),
              loadOfficeStaffList());
          } catch (e) {
            showToast("❌ " + e.message);
          }
      }),
      console.log("[OfficeStaffMgmt] ✅ Loaded"));
  })(),
  (async () => {
    const app = await window._sfAppReady,
      db = getFirestore(app),
      fmtINR = (n) => "₹" + (parseFloat(n) || 0).toLocaleString("en-IN");
    ((window.approveFeeTransaction = async function (txnId) {
      if (
        !confirm(
          "Approve this payment? Student balance will be officially updated.",
        )
      )
        return;
      const clickedBtn = document.activeElement;
      clickedBtn &&
        ((clickedBtn.disabled = !0),
        (clickedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'));
      try {
        const txnRef = doc(db, "fee_transactions", txnId),
          txnSnap = await getDoc(txnRef);
        if (!txnSnap.exists())
          return void showToast("❌ Transaction not found.");
        if ("pending" !== txnSnap.data().status)
          return void showToast("⚠️ Already processed.");
        const txn = txnSnap.data();
        await updateDoc(txnRef, {
          status: "approved",
          approvedBy: "Admin",
          approvedAt: new Date().toISOString(),
        });
        const sSnap = await getDocs(
          query(
            collection(db, "students"),
            where("studentId", "==", txn.studentId),
            limit(1),
          ),
        );
        let newBalance = txn.balanceAfter;
        if (!sSnap.empty) {
          const sRef = doc(db, "students", sSnap.docs[0].id),
            sData = sSnap.docs[0].data(),
            prevPaid = parseFloat(sData.feePaid || 0),
            feeTotal = parseFloat(sData.feeTotal || txn.feeTotal || 0),
            newFeePaid = prevPaid + parseFloat(txn.amount);
          ((newBalance = Math.max(0, feeTotal - newFeePaid)),
            await updateDoc(sRef, {
              feePaid: newFeePaid,
              feeBalance: newBalance,
              feeTotal: feeTotal,
              updatedAt: new Date().toISOString(),
            }));
        }
        (await (async function (
          studentId,
          amountPaid,
          remainingBalance,
          txnId,
        ) {
          try {
            const uSnap = await getDocs(
              query(
                collection(db, "users"),
                where("studentId", "==", studentId),
                limit(1),
              ),
            );
            if (uSnap.empty) return;
            const uid = uSnap.docs[0].id,
              msg = `Thank you, your payment of ${fmtINR(amountPaid)} is completed. This is for your acknowledgement. Remaining Balance: ${fmtINR(remainingBalance)}.`;
            await addDoc(collection(db, "users", uid, "notifications"), {
              message: msg,
              type: "fee_payment",
              icon: "fas fa-check-circle",
              amountPaid: parseFloat(amountPaid),
              remainingBalance: parseFloat(remainingBalance),
              txnId: txnId,
              read: !1,
              createdAt: new Date().toISOString(),
            });
          } catch (e) {
            console.warn("[FeeNotif]", e.message);
          }
        })(txn.studentId, txn.amount, newBalance, txnId),
          showToast("✅ Approved! Balance updated and notification sent."),
          window.loadAdminFeeTransactions && loadAdminFeeTransactions());
      } catch (e) {
        showToast("❌ Approval failed: " + e.message);
      } finally {
        clickedBtn &&
          ((clickedBtn.disabled = !1),
          (clickedBtn.innerHTML = '<i class="fas fa-check"></i> Approve'));
      }
    }),
      (window.rejectFeeTransaction = async function (txnId) {
        if (confirm("Reject this transaction? No balance change will occur."))
          try {
            (await updateDoc(doc(db, "fee_transactions", txnId), {
              status: "rejected",
              rejectedBy: "Admin",
              rejectedAt: new Date().toISOString(),
            }),
              showToast("🗑️ Transaction rejected."),
              window.loadAdminFeeTransactions && loadAdminFeeTransactions());
          } catch (e) {
            showToast("❌ " + e.message);
          }
      }),
      (window.loadStudentFeeNotifications = async function (uid) {
        if (!uid) return [];
        try {
          return (
            await getDocs(
              query(
                collection(db, "users", uid, "notifications"),
                where("type", "==", "fee_payment"),
                orderBy("createdAt", "desc"),
                limit(5),
              ),
            )
          ).docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
          return [];
        }
      }),
      (window.markFeeNotifRead = async function (uid, notifId) {
        try {
          await updateDoc(doc(db, "users", uid, "notifications", notifId), {
            read: !0,
          });
        } catch (e) {}
      }));
    const _origNC = window.loadStudentNotificationCenter;
    ((window.loadStudentNotificationCenter = async function (user) {
      if ((_origNC && (await _origNC(user)), user?.uid))
        try {
          const notifs = await window.loadStudentFeeNotifications(user.uid),
            latest = notifs[0],
            unread = notifs.find((n) => !n.read);
          (unread &&
            window.NotificationCenter &&
            (window.NotificationCenter.render(void 0, [
              {
                message: unread.message,
                isUrgent: !1,
                tag: "Payment Confirmed",
                date: (unread.createdAt || "").split("T")[0],
              },
            ]),
            setTimeout(
              () => window.markFeeNotifRead(user.uid, unread.id),
              3e3,
            )),
            latest?.txnId &&
              setTimeout(() => {
                const feeCard = document.getElementById("nc-fee-card");
                if (feeCard && !feeCard.querySelector(".nc-receipt-btn")) {
                  const btn = document.createElement("button");
                  ((btn.className = "nc-receipt-btn"),
                    (btn.innerHTML =
                      '<i class="fas fa-receipt" style="margin-right:5px"></i>View Latest Receipt'),
                    (btn.style.cssText =
                      "margin-top:10px;width:100%;padding:7px 12px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer"),
                    (btn.onclick = () => {
                      (window.showStudentReceipt &&
                        window.showStudentReceipt(latest.txnId),
                        showDash("s", "s-fees", null));
                    }),
                    feeCard.appendChild(btn));
                }
              }, 800));
        } catch (e) {}
    }),
      console.log(
        "[FeeModule] ✅ Loaded — Office Portal · Fee Structure · Approvals · Notifications",
      ));
  })(),
  (async () => {
    let currentAdmissionId = null,
      currentAdmissionData = null;
    ((window.loadOfficeAdmissions = async function () {
      const tbody = document.getElementById("adm-list-body");
      if (tbody) {
        tbody.innerHTML =
          '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
        try {
          const statusFilter =
            document.getElementById("adm-filter-status")?.value || "pending";
          let q;
          q =
            "all" === statusFilter
              ? query(collection(db, "admissions"))
              : query(
                  collection(db, "admissions"),
                  where("status", "==", statusFilter),
                );
          const snap = await getDocs(q),
            sortedDocs = snap.docs.slice().sort((a, b) => {
              const ta = a.data().submittedAt?.toMillis
                ? a.data().submittedAt.toMillis()
                : 0;
              return (
                (b.data().submittedAt?.toMillis
                  ? b.data().submittedAt.toMillis()
                  : 0) - ta
              );
            });
          if (snap.empty)
            return void (tbody.innerHTML =
              '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-light)">No applications found.</td></tr>');
          ((tbody.innerHTML = ""),
            sortedDocs.forEach((d) => {
              const a = d.data(),
                date = a.submittedAt?.toDate
                  ? a.submittedAt.toDate().toLocaleDateString("en-IN")
                  : "—",
                statusBadge =
                  "forwarded_to_admin" === a.status
                    ? '<span style="background:#d1fae5;color:#065f46;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600">Forwarded</span>'
                    : '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600">Pending</span>',
                tr = document.createElement("tr");
              ((tr.style.cssText =
                "border-bottom:1px solid var(--border);cursor:pointer"),
                (tr.innerHTML = `\n          <td style="padding:10px 12px;font-size:13px;white-space:nowrap">${a.fullName || "—"}</td>\n          <td style="padding:10px 12px;font-size:13px;white-space:nowrap">${a.classApplied || "—"}</td>\n          <td style="padding:10px 12px;font-size:13px;white-space:nowrap">${date}</td>\n          <td style="padding:10px 12px;font-size:13px">${statusBadge}</td>\n          <td style="padding:10px 12px;white-space:nowrap;display:flex;gap:6px">\n            <button onclick="viewAdmission('${d.id}')" style="padding:6px 12px;background:var(--primary);color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer"><i class="fas fa-eye"></i> View</button>\n            <button onclick="printAdmissionById('${d.id}')" style="padding:6px 10px;background:#6b7280;color:#fff;border:none;border-radius:6px;font-size:12px;cursor:pointer" title="Print"><i class="fas fa-print"></i></button>\n          </td>`),
                tbody.appendChild(tr));
            }),
            (window.__admissionsCache = {}),
            sortedDocs.forEach((d) => {
              window.__admissionsCache[d.id] = d.data();
            }));
        } catch (e) {
          tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:32px;color:#ef4444">Error: ${e.message}</td></tr>`;
        }
      }
    }),
      (window.printAdmissionById = async function (id) {
        const cached = (window.__admissionsCache || {})[id];
        if (cached) window._printAdmissionPDF(cached);
        else
          try {
            const snap = await getDoc(doc(db, "admissions", id));
            if (!snap.exists())
              return void showToast("⚠️ Application not found.");
            window._printAdmissionPDF(snap.data());
          } catch (e) {
            showToast("❌ Could not load application: " + e.message);
          }
      }),
      (window.viewAdmission = function (id) {
        const a = (window.__admissionsCache || {})[id];
        if (!a) return void showToast("⚠️ Application data not loaded.");
        ((currentAdmissionId = id), (currentAdmissionData = a));
        const sv = (id, val) => {
          const el = document.getElementById(id);
          el && (el.value = val || "");
        };
        (sv("adm-d-name", a.fullName),
          sv("adm-d-class", a.classApplied),
          sv("adm-d-dob", a.dob),
          sv("adm-d-gender", a.gender),
          sv("adm-d-year", a.year),
          sv("adm-d-prevschool", a.previousSchool),
          sv("adm-d-address", a.address),
          sv("adm-d-medical", a.medical),
          sv("adm-d-parent", a.parentName),
          sv("adm-d-relation", a.relation),
          sv("adm-d-contact", a.contact),
          sv("adm-d-email", a.email));
        const f = a.father || {},
          m = a.mother || {};
        (sv("adm-d-father-name", f.name),
          sv("adm-d-father-occ", f.occupation),
          sv("adm-d-father-tel", f.contact),
          sv("adm-d-mother-name", m.name),
          sv("adm-d-mother-occ", m.occupation),
          sv("adm-d-mother-tel", m.contact),
          (document.getElementById("adm-d-notes").value = ""));
        const docsEl = document.getElementById("adm-d-docs"),
          docs = a.documents || [];
        docs.length
          ? (docsEl.innerHTML = docs
              .map(
                (d) =>
                  `<a href="${d.url}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:var(--glass-bg);border:1px solid var(--border);border-radius:8px;font-size:12px;color:var(--primary);text-decoration:none"><i class="fas fa-file"></i>${d.name}</a>`,
              )
              .join(""))
          : (docsEl.innerHTML =
              '<span style="color:var(--text-light);font-size:13px">No documents attached.</span>');
        const badge = document.getElementById("adm-d-status-badge");
        if (badge) {
          const statusColors = {
              pending: "#d97706,#fef3c7",
              forwarded_to_admin: "#2563eb,#dbeafe",
              Shortlisted: "#7c3aed,#ede9fe",
              Admitted: "#059669,#d1fae5",
              Rejected: "#dc2626,#fee2e2",
            },
            [fg, bg] = (statusColors[a.status] || "#475569,#f1f5f9").split(",");
          ((badge.textContent = a.status || "unknown"),
            (badge.style.cssText += `;display:inline-block;color:${fg};background:${bg};`));
        }
        const isTerminal = ["Admitted", "Rejected"].includes(a.status),
          fwdBtn = document.getElementById("adm-forward-btn");
        fwdBtn &&
          ("forwarded_to_admin" === a.status || isTerminal
            ? ((fwdBtn.disabled = !0),
              (fwdBtn.textContent =
                "forwarded_to_admin" === a.status
                  ? "✓ Already Forwarded"
                  : "— " + a.status),
              (fwdBtn.style.opacity = "0.5"))
            : ((fwdBtn.disabled = !1),
              (fwdBtn.innerHTML =
                '<i class="fas fa-share" style="margin-right:6px"></i>Forward to Admin'),
              (fwdBtn.style.opacity = "1")));
        const saveBtn = document.querySelector(
          '#adm-detail-panel button[onclick="saveAdmissionChanges()"]',
        );
        (saveBtn &&
          ((saveBtn.disabled = isTerminal),
          (saveBtn.style.opacity = isTerminal ? "0.5" : "1")),
          (document.getElementById("adm-detail-panel").style.display = "block"),
          document
            .getElementById("adm-detail-panel")
            .scrollIntoView({ behavior: "smooth", block: "start" }));
      }),
      (window.closeAdmissionDetail = function () {
        ((currentAdmissionId = null),
          (currentAdmissionData = null),
          (document.getElementById("adm-detail-panel").style.display = "none"));
      }),
      (window.saveAdmissionChanges = async function () {
        if (!currentAdmissionId)
          return void showToast("⚠️ No application selected.");
        const gv = (id) =>
            (document.getElementById(id) || {}).value?.trim() || "",
          payload = {
            fullName: gv("adm-d-name"),
            classApplied: gv("adm-d-class"),
            dob: gv("adm-d-dob"),
            gender: gv("adm-d-gender"),
            year: gv("adm-d-year"),
            previousSchool: gv("adm-d-prevschool"),
            address: gv("adm-d-address"),
            medical: gv("adm-d-medical"),
            parentName: gv("adm-d-parent"),
            relation: gv("adm-d-relation"),
            contact: gv("adm-d-contact"),
            email: gv("adm-d-email"),
            father: {
              name: gv("adm-d-father-name"),
              occupation: gv("adm-d-father-occ"),
              contact: gv("adm-d-father-tel"),
            },
            mother: {
              name: gv("adm-d-mother-name"),
              occupation: gv("adm-d-mother-occ"),
              contact: gv("adm-d-mother-tel"),
            },
          };
        try {
          (await updateDoc(doc(db, "admissions", currentAdmissionId), payload),
            (currentAdmissionData = { ...currentAdmissionData, ...payload }),
            window.__admissionsCache &&
              (window.__admissionsCache[currentAdmissionId] =
                currentAdmissionData),
            showToast("✅ Changes saved."));
        } catch (e) {
          showToast("❌ " + e.message);
        }
      }),
      (window._printAdmissionPDF = function (a) {
        if (!a) return void showToast("⚠️ No application data.");
        const frame = document.getElementById("adm-print-frame");
        if (!frame) return void showToast("⚠️ Print frame missing.");
        const esc = (v) =>
            null == v
              ? "—"
              : String(v).replace(
                  /[<>&]/g,
                  (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c],
                ),
          date = a.submittedAt?.toDate
            ? a.submittedAt.toDate().toLocaleDateString("en-IN")
            : a.submittedAt
              ? new Date(a.submittedAt).toLocaleDateString("en-IN")
              : "N/A",
          f = a.father || {},
          m = a.mother || {},
          docs = a.documents || [],
          docsHtml = docs.length
            ? docs
                .map(
                  (d) =>
                    `<li><strong>${esc(d.label || d.name)}</strong> — ${esc(d.name)}</li>`,
                )
                .join("")
            : "<li>No documents attached.</li>",
          name = esc(a.fullName || a.studentName || "—"),
          cls = esc(a.classApplied || a.class || "—");
        ((frame.innerHTML = `\n<h2 style="text-align:center;color:#4f46e5;margin:0 0 4px">St. Francis De Sales Secondary School</h2>\n<h3 style="text-align:center;color:#64748b;margin:0 0 24px;font-weight:500">Admission Application Form</h3>\n\n<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Student Information</h4>\n<table style="width:100%;border-collapse:collapse;margin-top:6px">\n  <tr><td class="pf-label">Full Name</td><td>${name}</td><td class="pf-label">Class Applied</td><td>${cls}</td></tr>\n  <tr><td class="pf-label">Date of Birth</td><td>${esc(a.dob)}</td><td class="pf-label">Gender</td><td>${esc(a.gender)}</td></tr>\n  <tr><td class="pf-label">Academic Year</td><td>${esc(a.year)}</td><td class="pf-label">Previous School</td><td>${esc(a.previousSchool)}</td></tr>\n  <tr><td class="pf-label">Address</td><td colspan="3">${esc(a.address)}</td></tr>\n  <tr><td class="pf-label">Medical / Special Needs</td><td colspan="3">${esc(a.medical) || "—"}</td></tr>\n</table>\n\n<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Primary Contact</h4>\n<table style="width:100%;border-collapse:collapse;margin-top:6px">\n  <tr><td class="pf-label">Name</td><td>${esc(a.parentName)}</td><td class="pf-label">Relation</td><td>${esc(a.relation)}</td></tr>\n  <tr><td class="pf-label">Contact No.</td><td>${esc(a.contact)}</td><td class="pf-label">Email</td><td>${esc(a.email)}</td></tr>\n</table>\n\n<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Father's Details</h4>\n<table style="width:100%;border-collapse:collapse;margin-top:6px">\n  <tr><td class="pf-label">Name</td><td>${esc(f.name)}</td><td class="pf-label">Occupation</td><td>${esc(f.occupation)}</td></tr>\n  <tr><td class="pf-label">Contact No.</td><td colspan="3">${esc(f.contact)}</td></tr>\n</table>\n\n<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Mother's Details</h4>\n<table style="width:100%;border-collapse:collapse;margin-top:6px">\n  <tr><td class="pf-label">Name</td><td>${esc(m.name)}</td><td class="pf-label">Occupation</td><td>${esc(m.occupation)}</td></tr>\n  <tr><td class="pf-label">Contact No.</td><td colspan="3">${esc(m.contact)}</td></tr>\n</table>\n\n<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Submitted Documents</h4>\n<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.7">${docsHtml}</ul>\n\n<h4 style="color:#4f46e5;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:24px 0 8px;border-bottom:2px solid #e2e8f0;padding-bottom:4px">Application Meta</h4>\n<table style="width:100%;border-collapse:collapse;margin-top:6px">\n  <tr><td class="pf-label">Status</td><td>${esc(a.status)}</td><td class="pf-label">Submitted On</td><td>${esc(date)}</td></tr>\n</table>\n\n<div style="margin-top:40px;font-size:11px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:12px">\n  St. Francis De Sales Secondary School · Laitkor, Shillong · Generated ${new Date().toLocaleString("en-IN")}\n</div>`),
          document.body.classList.add("adm-printing"),
          window.print(),
          setTimeout(
            () => document.body.classList.remove("adm-printing"),
            500,
          ));
      }),
      (window.printAdmissionForm = function () {
        currentAdmissionData
          ? window._printAdmissionPDF(currentAdmissionData)
          : showToast("⚠️ No application selected.");
      }),
      (window.forwardAdmissionToAdmin = async function () {
        if (!currentAdmissionId)
          return void showToast("⚠️ No application selected.");
        const btn = document.getElementById("adm-forward-btn");
        btn &&
          ((btn.disabled = !0),
          (btn.innerHTML =
            '<i class="fas fa-spinner fa-spin"></i> Forwarding…'));
        try {
          const notes = document.getElementById("adm-d-notes")?.value || "";
          (await updateDoc(doc(db, "admissions", currentAdmissionId), {
            status: "forwarded_to_admin",
            officeNotes: notes,
            forwardedAt: serverTimestamp(),
          }),
            await addDoc(collection(db, "admin_notifications"), {
              type: "admission_forwarded",
              admissionId: currentAdmissionId,
              studentName: currentAdmissionData?.fullName || "",
              forwardedBy: window._officeStaffName || "Office Staff",
              read: !1,
              createdAt: new Date().toISOString(),
            }),
            showToast("✅ Application forwarded to Admin."),
            window.__admissionsCache?.[currentAdmissionId] &&
              (window.__admissionsCache[currentAdmissionId].status =
                "forwarded_to_admin"),
            btn &&
              ((btn.disabled = !0),
              (btn.innerHTML = "✓ Already Forwarded"),
              (btn.style.opacity = "0.6")),
            await window.loadOfficeAdmissions());
        } catch (e) {
          (showToast("❌ Error: " + e.message),
            btn &&
              ((btn.disabled = !1),
              (btn.innerHTML =
                '<i class="fas fa-share" style="margin-right:6px"></i>Forward to Admin')));
        }
      }),
      console.log(
        "[Admissions] ✅ Loaded — Office Staff admissions review module",
      ));
  })(),
  (async () => {
    ((window.loadBulkFeeClass = async function () {
      const cls = document.getElementById("bulk-class-sel")?.value;
      if (!cls) return void showToast("⚠️ Select a class first.");
      const wrap = document.getElementById("bulk-fee-table-wrap"),
        tbody = document.getElementById("bulk-fee-tbody");
      if (tbody) {
        ((tbody.innerHTML =
          '<tr><td colspan="5" style="text-align:center;padding:14px"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>'),
          wrap && (wrap.style.display = "block"));
        try {
          const students = (
            await getDocs(
              query(
                collection(db, "students"),
                where("class", "==", cls),
                limit(200),
              ),
            )
          ).docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort(
              (a, b) => (parseInt(a.rollNo) || 0) - (parseInt(b.rollNo) || 0),
            );
          if (!students.length)
            return void (tbody.innerHTML =
              '<tr><td colspan="5" style="text-align:center;padding:14px;color:var(--text-light)">No students found for this class.</td></tr>');
          ((tbody.innerHTML = students
            .map((s) => {
              const bal = parseFloat(s.feeBalance ?? s.feeTotal ?? 0);
              return `<tr>\n          <td style="padding:7px 6px"><input type="checkbox" class="bulk-row-chk" data-sid="${s.id}" data-student='${JSON.stringify({ id: s.id, studentId: s.studentId || "", name: s.name || "", class: s.class || "", rollNo: s.rollNo || "", feeBalance: bal, feeTotal: parseFloat(s.feeTotal || 0) })}' onchange="document.getElementById('bulk-selected-count').textContent=document.querySelectorAll('.bulk-row-chk:checked').length+' selected'"></td>\n          <td style="padding:7px 6px">${s.rollNo || "—"}</td>\n          <td style="padding:7px 6px;font-weight:600">${s.name || "—"}</td>\n          <td style="padding:7px 6px;color:${bal > 0 ? "#dc2626" : "#16a34a"}">${((n = bal), "₹" + (parseFloat(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 }))}</td>\n          <td style="padding:7px 6px"><input type="number" class="bulk-amt-input" data-sid="${s.id}" value="${bal > 0 ? bal : ""}" min="0" style="width:100px;padding:4px 8px;border:1.5px solid var(--primary);border-radius:6px;font-family:var(--font-body);font-size:13px"></td>\n        </tr>`;
              var n;
            })
            .join("")),
            (document.getElementById("bulk-selected-count").textContent =
              "0 selected"));
          const selectAll = document.getElementById("bulk-select-all");
          selectAll && (selectAll.checked = !1);
        } catch (e) {
          tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger);padding:12px">${e.message}</td></tr>`;
        }
      }
    }),
      (window.recordBulkFeePayments = async function () {
        const checked = [...document.querySelectorAll(".bulk-row-chk:checked")];
        if (!checked.length)
          return void showToast("⚠️ Select at least one student.");
        const feeType =
            document.getElementById("bulk-fee-type")?.value || "Annual Fee",
          mode = document.getElementById("bulk-mode")?.value || "Cash",
          staffName = window._officeStaffName || "Office Staff";
        let ok = 0,
          fail = 0;
        for (const chk of checked)
          try {
            const s = JSON.parse(chk.dataset.student),
              amt = parseFloat(
                document.querySelector(
                  `.bulk-amt-input[data-sid="${chk.dataset.sid}"]`,
                )?.value || 0,
              );
            if (!amt || amt <= 0) {
              fail++;
              continue;
            }
            const balAfter = Math.max(0, (s.feeBalance || 0) - amt);
            (await addDoc(collection(db, "fee_transactions"), {
              studentId: s.studentId,
              studentName: s.name,
              studentClass: s.class,
              feeType: feeType,
              amount: amt,
              paymentMode: mode,
              receiptNo: "",
              date: new Date().toISOString().slice(0, 10),
              status: "approved",
              staffName: staffName,
              balanceBefore: s.feeBalance || 0,
              balanceAfter: balAfter,
              feeTotal: s.feeTotal || 0,
              source: "bulk-entry",
              createdAt: serverTimestamp(),
            }),
              ok++);
          } catch (e) {
            (fail++, console.warn("Bulk entry error:", e.message));
          }
        (showToast(
          ok
            ? `✅ ${ok} payment(s) recorded${fail ? ", " + fail + " failed" : ""}.`
            : "❌ All entries failed.",
        ),
          ok && window.loadBulkFeeClass());
      }));
  })(),
  (async () => {
    ((window.ledgerSubmitPayment = async function () {
      const s = window._feeSelectedStudent,
        fd = window._feeSelectedFeeData || {};
      if (!s) return void showToast("⚠️ No student selected.");
      const amtRaw = parseFloat(
        document.getElementById("ldg-pay-amount")?.value || 0,
      );
      if (!amtRaw || amtRaw <= 0)
        return void showToast("⚠️ Enter a valid payment amount.");
      if (void 0 !== fd.feeBalance && amtRaw > fd.feeBalance + 0.01)
        return void showToast(
          "⚠️ Amount exceeds remaining balance of ₹" + fd.feeBalance.toFixed(2),
        );
      const txnNo = document.getElementById("ldg-pay-txn")?.value.trim() || "",
        remarks =
          document.getElementById("ldg-pay-remarks")?.value.trim() || "",
        btn = document.getElementById("ldg-submit-btn");
      btn &&
        ((btn.disabled = !0),
        (btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'));
      try {
        const staffEmail = auth.currentUser?.email || "office",
          today = new Date().toISOString().split("T")[0];
        await addDoc(collection(db, "fee_transactions"), {
          studentId: s.studentId || s._docId || "",
          studentName: s.name || "—",
          class: s.class || "—",
          amount: amtRaw,
          txnNo: txnNo,
          remarks: remarks,
          paymentMode: "Cash",
          date: today,
          status: "pending",
          recordedBy: staffEmail,
          createdAt: serverTimestamp(),
        });
        const newPaid = (fd.feePaid || 0) + amtRaw,
          newBalance = Math.max(0, (fd.feeBalance || 0) - amtRaw),
          newPct =
            fd.feeTotal > 0
              ? Math.min(100, Math.round((newPaid / fd.feeTotal) * 100))
              : 0,
          fmtINR = (n) =>
            "₹" +
            Number(n).toLocaleString("en-IN", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            }),
          set = (id, v) => {
            const e = document.getElementById(id);
            e && (e.textContent = v);
          };
        (set("ldg-paid", fmtINR(newPaid)),
          set("ldg-balance", fmtINR(newBalance)),
          set("fee-paid-amt", fmtINR(newPaid)),
          set("fee-balance-amt", fmtINR(newBalance)),
          set("fee-progress-pct", newPct + "%"));
        const bar = document.getElementById("fee-progress-bar");
        bar && (bar.style.width = newPct + "%");
        const bb = document.getElementById("fee-balance-block");
        (bb &&
          bb.classList.toggle("cleared", 0 === newBalance && fd.feeTotal > 0),
          (window._feeSelectedFeeData = {
            ...fd,
            feePaid: newPaid,
            feeBalance: newBalance,
            pct: newPct,
          }));
        const clear = (id) => {
          const e = document.getElementById(id);
          e && (e.value = "");
        };
        (clear("ldg-pay-amount"),
          clear("ldg-pay-txn"),
          clear("ldg-pay-remarks"),
          showToast(
            "✅ Payment of " +
              fmtINR(amtRaw) +
              " recorded — pending Admin approval.",
          ));
      } catch (e) {
        showToast("❌ Error: " + e.message);
      } finally {
        btn &&
          ((btn.disabled = !1),
          (btn.innerHTML =
            '<i class="fas fa-save" style="margin-right:6px"></i>Submit Payment'));
      }
    }),
      console.log("[FeeledgerSubmit] ✅ Loaded"));
  })(),
  (async () => {
    const esc = (v) =>
      null == v
        ? ""
        : String(v).replace(
            /[<>&]/g,
            (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c],
          );
    function animateCountTo(el, target, suffix = "") {
      if (!el) return;
      const n = Number(target) || 0;
      if (n <= 0) return void (el.textContent = String(target));
      el.classList.add("counting");
      const start = performance.now();
      requestAnimationFrame(function tick(now) {
        const t = Math.min(1, (now - start) / 1400),
          eased = 1 - Math.pow(1 - t, 3),
          current = Math.round(0 + (n - 0) * eased);
        ((el.textContent = current + suffix),
          t < 1
            ? requestAnimationFrame(tick)
            : el.classList.remove("counting"));
      });
    }
    function applyStats(stats = []) {
      for (let i = 0; i < 4; i++) {
        const s = stats[i] || {},
          numEl = document.getElementById(`home-stat-${i + 1}`),
          lblEl = document.getElementById(`home-stat-${i + 1}-label`);
        (lblEl && s.label && (lblEl.textContent = s.label),
          numEl &&
            Number.isFinite(Number(s.value)) &&
            Number(s.value) > 0 &&
            ((numEl.dataset.target = String(s.value)),
            (numEl.textContent = "0")));
      }
      const bar = document.getElementById("home-stats-bar");
      if (!bar) return;
      if (!("IntersectionObserver" in window))
        return void bar
          .querySelectorAll(".stat-num[data-target]")
          .forEach((el) => animateCountTo(el, el.dataset.target, "+"));
      new IntersectionObserver(
        (entries, o) => {
          entries.forEach((entry) => {
            entry.isIntersecting &&
              (bar.querySelectorAll(".stat-num[data-target]").forEach((el) => {
                el.dataset.animated ||
                  ((el.dataset.animated = "1"),
                  animateCountTo(el, el.dataset.target, "+"));
              }),
              o.unobserve(entry.target));
          });
        },
        { threshold: 0.3 },
      ).observe(bar);
    }
    async function loadHomepageDynamic() {
      try {
        const snap = await getDoc(doc(db, "public_settings", "homepage")),
          data = snap.exists() ? snap.data() : {};
        (!(function (hero = {}) {
          if (hero.subheadline) {
            const s = document.getElementById("home-hero-sub");
            s && (s.textContent = hero.subheadline);
          }
        })(data.hero || {}),
          (function (ann = {}) {
            const card = document.getElementById("home-featured-announcement");
            if (!card) return;
            const text = (ann.text || "").trim();
            if (!text) return void (card.style.display = "none");
            const tagEl = document.querySelector("#home-ann-tag span"),
              txtEl = document.getElementById("home-ann-text"),
              dateEl = document.getElementById("home-ann-date");
            if (
              (tagEl && (tagEl.textContent = (ann.tag || "NEW").toUpperCase()),
              txtEl && (txtEl.textContent = text),
              dateEl && ann.date)
            )
              try {
                dateEl.textContent = new Date(ann.date).toLocaleDateString(
                  "en-IN",
                  { day: "2-digit", month: "short", year: "numeric" },
                );
              } catch (e) {
                dateEl.textContent = ann.date;
              }
            else dateEl && (dateEl.textContent = "");
            card.style.display = "block";
          })(data.announcement || {}),
          applyStats(Array.isArray(data.stats) ? data.stats : []),
          (function (cards = []) {
            const container = document.getElementById("home-feature-cards"),
              legacy = document.getElementById("why-choose-us-grid");
            container &&
              (Array.isArray(cards) && cards.length
                ? ((container.innerHTML = cards
                    .map(
                      (c) =>
                        `\n      <div class="feature-card">\n        <div class="feature-card-icon"><i class="fas ${esc(c.icon || "fa-star")}"></i></div>\n        <h3 class="feature-card-title">${esc(c.title || "")}</h3>\n        <p class="feature-card-desc">${esc(c.description || "")}</p>\n      </div>\n    `,
                    )
                    .join("")),
                  (container.style.display = "grid"),
                  legacy && (legacy.style.display = "none"))
                : (container.style.display = "none"));
          })(Array.isArray(data.featureCards) ? data.featureCards : []),
          console.log("[HomepageCMS] ✅ Loaded"));
      } catch (e) {
        (console.warn("[HomepageCMS] load failed:", e.message), applyStats([]));
      }
    }
    ("loading" === document.readyState
      ? document.addEventListener("DOMContentLoaded", loadHomepageDynamic)
      : loadHomepageDynamic(),
      (window.refreshHomepageDynamic = loadHomepageDynamic));
  })(),
  (window.loadDuesList = async function () {
    const tbody = document.getElementById("dues-table-body"),
      chipsEl = document.getElementById("dues-summary-chips"),
      countLabel = document.getElementById("dues-count-label");
    if (tbody) {
      ((tbody.innerHTML =
        '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--text-light);"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>'),
        chipsEl && (chipsEl.innerHTML = ""),
        countLabel && (countLabel.textContent = ""));
      try {
        const {
            getFirestore: getFirestore,
            collection: collection,
            getDocs: getDocs,
            query: query,
            where: where,
          } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"),
          db2 = getFirestore(),
          filterClass =
            document.getElementById("dues-filter-class")?.value || "",
          filterType = document.getElementById("dues-filter-type")?.value || "",
          filterStatus =
            document.getElementById("dues-filter-status")?.value || "",
          snap = await getDocs(
            query(
              collection(db2, "fee_transactions"),
              where("status", "==", "pending"),
            ),
          );
        let records = [];
        snap.forEach((doc) => {
          const d = { id: doc.id, ...doc.data() },
            cls = d.studentClass || d.class || "";
          (filterClass && cls !== filterClass) ||
            (filterType && d.feeType !== filterType) ||
            (filterStatus && d.status !== filterStatus) ||
            records.push({ ...d, _cls: cls });
        });
        const uniqueIds = [
            ...new Set(records.map((r) => r.studentId).filter(Boolean)),
          ],
          waMap = {};
        for (let i = 0; i < uniqueIds.length; i += 30) {
          const batch = uniqueIds.slice(i, i + 30);
          (
            await getDocs(
              query(
                collection(db2, "students"),
                where("studentId", "in", batch),
              ),
            )
          ).forEach((d) => {
            const s = d.data();
            s.studentId && (waMap[s.studentId] = s.whatsapp || s.contact || "");
          });
        }
        const totalDue = records.reduce((s, r) => s + (r.amount || 0), 0);
        if (
          (chipsEl &&
            (chipsEl.innerHTML = `\n      <span style="background:#fff3cd;color:#856404;border:1px solid #ffc107;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;">\n        <i class="fas fa-users"></i> ${records.length} Pending Transactions\n      </span>\n      <span style="background:#f8d7da;color:#721c24;border:1px solid #dc3545;padding:5px 14px;border-radius:20px;font-size:12px;font-weight:700;">\n        <i class="fas fa-rupee-sign"></i> ₹${totalDue.toLocaleString("en-IN")} Total Pending\n      </span>`),
          0 === records.length)
        )
          return void (tbody.innerHTML =
            '<tr><td colspan="7" style="text-align:center;padding:32px;color:#28a745;font-weight:600;"><i class="fas fa-check-circle"></i> No pending dues found — all clear!</td></tr>');
        ((tbody.innerHTML = records
          .map((r) => {
            const reminded = r.lastRemindedDate
                ? new Date(r.lastRemindedDate).toLocaleDateString("en-IN")
                : "—",
              waNum = (waMap[r.studentId] || "").replace(/\D/g, ""),
              waMsg = encodeURIComponent(
                `Dear Parent of ${r.studentName || r.studentId},\nThis is a reminder from St. Francis De Sales Sec. School, Laitkor.\nYour fee payment of ₹${(r.amount || 0).toLocaleString("en-IN")} is awaiting approval.\nKindly contact the school office.\nThank you.`,
              ),
              waBtn = waNum
                ? `<a href="https://wa.me/91${waNum}?text=${waMsg}" target="_blank" class="btn btn-success btn-sm" onclick="window.markReminded('${r.id}')"><i class="fab fa-whatsapp"></i> Remind</a>`
                : '<span style="font-size:12px;color:var(--text-light);">No WhatsApp</span>';
            return `<tr>\n        <td><strong>${r.studentName || r.studentId || "—"}</strong><br><span style="font-size:11px;color:var(--text-light);">${r.studentId || ""}</span></td>\n        <td>${r._cls || "—"}</td>\n        <td>${r.feeType || r.notes || "—"}</td>\n        <td style="font-weight:700;color:#dc3545;">₹${(r.amount || 0).toLocaleString("en-IN")}</td>\n        <td><span class="badge badge-warning">Pending</span></td>\n        <td style="font-size:12px;">${reminded}</td>\n        <td>${waBtn}</td>\n      </tr>`;
          })
          .join("")),
          countLabel &&
            (countLabel.textContent = `Showing ${records.length} record(s)`));
      } catch (err) {
        (console.error("Dues load error:", err),
          (tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:28px;color:#dc3545;">Error loading dues: ${err.message}</td></tr>`));
      }
    }
  }),
  (window.markReminded = async function (docId) {
    try {
      const {
        getFirestore: getFirestore,
        doc: doc,
        updateDoc: updateDoc,
      } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
      await updateDoc(doc(getFirestore(), "fee_transactions", docId), {
        lastRemindedDate: new Date().toISOString().split("T")[0],
      });
    } catch (e) {
      console.warn("markReminded:", e.message);
    }
  }),
  (async () => {
    let _srAllRecords = [],
      _srFiltered = [],
      _srPage = 1;
    let _srSortKey = "class",
      _srSortDir = 1;
    const CLASS_ORDER = [
        "PLG",
        "SKG",
        "LKG",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
      ],
      CLASS_LABEL = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" },
      getLabel = (c) => CLASS_LABEL[c] || (c ? "Class " + c : "—");
    function calcAge(dob) {
      if (!dob) return "—";
      const d = new Date(dob);
      if (isNaN(d)) return "—";
      const today = new Date();
      let age = today.getFullYear() - d.getFullYear();
      return (
        today < new Date(today.getFullYear(), d.getMonth(), d.getDate()) &&
          age--,
        age
      );
    }
    function srRender() {
      const total = _srFiltered.length,
        pages = Math.max(1, Math.ceil(total / 25));
      _srPage > pages && (_srPage = pages);
      const start = 25 * (_srPage - 1),
        pageData = _srFiltered.slice(start, start + 25),
        countEl = document.getElementById("sr-count-label");
      countEl &&
        (countEl.textContent = `Showing ${pageData.length} of ${total} student${1 !== total ? "s" : ""}`);
      const tbody = document.getElementById("sr-tbody");
      tbody &&
        (0 === pageData.length
          ? (tbody.innerHTML =
              '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--text-light)"><i class="fas fa-inbox" style="font-size:28px;display:block;margin-bottom:8px"></i>No students found.</td></tr>')
          : (tbody.innerHTML = pageData
              .map(
                (r) =>
                  `\n          <tr>\n            <td><code style="font-size:12px">${r.studentId}</code></td>\n            <td><strong>${r.name}</strong></td>\n            <td>${getLabel(r.class)}</td>\n            <td>${r.section}</td>\n            <td>${r.rollNo}</td>\n            <td><span class="badge ${"M" === r.gender ? "badge-info" : "badge-success"}">${"M" === r.gender ? "Boy" : "F" === r.gender ? "Girl" : "—"}</span></td>\n            <td style="font-size:12px">${r.dob || "—"}</td>\n            <td>${r.age}</td>\n          </tr>`,
              )
              .join("")));
      const cards = document.getElementById("sr-cards");
      cards &&
        (0 === pageData.length
          ? (cards.innerHTML =
              '<div style="text-align:center;padding:32px;color:var(--text-light)">No students found.</div>')
          : (cards.innerHTML = pageData
              .map(
                (r) =>
                  `\n          <div class="sr-student-card">\n            <div class="sr-card-top">\n              <strong>${r.name}</strong>\n              <span class="badge ${"M" === r.gender ? "badge-info" : "badge-success"}">${"M" === r.gender ? "Boy" : "Girl"}</span>\n            </div>\n            <div class="sr-card-row"><label>ID</label><span><code>${r.studentId}</code></span></div>\n            <div class="sr-card-row"><label>Class</label><span>${getLabel(r.class)} — ${r.section}</span></div>\n            <div class="sr-card-row"><label>Roll No</label><span>${r.rollNo}</span></div>\n            <div class="sr-card-row"><label>DOB</label><span>${r.dob || "—"}</span></div>\n            <div class="sr-card-row"><label>Age</label><span>${r.age}</span></div>\n          </div>`,
              )
              .join("")));
      const pg = document.getElementById("sr-pagination");
      if (pg) {
        if (pages <= 1) return void (pg.innerHTML = "");
        let btns = "";
        btns += `<button ${1 === _srPage ? "disabled" : ""} onclick="window._srGoPage(${_srPage - 1})"><i class="fas fa-chevron-left"></i></button>`;
        for (let i = 1; i <= pages; i++)
          1 === i || i === pages || Math.abs(i - _srPage) <= 1
            ? (btns += `<button class="${i === _srPage ? "active" : ""}" onclick="window._srGoPage(${i})">${i}</button>`)
            : 2 === Math.abs(i - _srPage) && (btns += "<span>…</span>");
        ((btns += `<button ${_srPage === pages ? "disabled" : ""} onclick="window._srGoPage(${_srPage + 1})"><i class="fas fa-chevron-right"></i></button>`),
          (pg.innerHTML = btns));
      }
    }
    function srDownload(filename, type, content) {
      const a = document.createElement("a");
      ((a.href = URL.createObjectURL(new Blob([content], { type: type }))),
        (a.download = filename),
        a.click(),
        URL.revokeObjectURL(a.href));
    }
    ((window.loadStudentRecords = async function (showSyncMsg = !1) {
      const db = window._firestoreDb;
      if (!db) return;
      const tbody = document.getElementById("sr-tbody"),
        cards = document.getElementById("sr-cards");
      (tbody &&
        (tbody.innerHTML =
          '<tr><td colspan="8" style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading records…</td></tr>'),
        cards &&
          (cards.innerHTML =
            '<div style="text-align:center;padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading…</div>'));
      const syncBtn = document.getElementById("sr-sync-btn");
      syncBtn &&
        ((syncBtn.disabled = !0),
        (syncBtn.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Syncing…'));
      try {
        const {
            getDocs: getDocs,
            collection: collection,
            orderBy: orderBy,
            query: query,
          } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js"),
          snap = await getDocs(
            query(collection(db, "students"), orderBy("class")),
          );
        _srAllRecords = snap.docs.map((d) => {
          const s = d.data();
          return {
            _docId: d.id,
            studentId: s.studentId || "—",
            name: s.name || s.fullName || "—",
            class: s.class || "?",
            section: s.section || "—",
            rollNo: s.rollNo || "—",
            gender: s.gender || "—",
            dob: s.dob || "",
            age: calcAge(s.dob),
          };
        });
        const classSelect = document.getElementById("sr-filter-class");
        if (classSelect) {
          const presentClasses = [
              ...new Set(_srAllRecords.map((r) => r.class)),
            ],
            sorted = CLASS_ORDER.filter((c) => presentClasses.includes(c));
          classSelect.innerHTML =
            '<option value="">All Classes</option>' +
            sorted
              .map((c) => `<option value="${c}">${getLabel(c)}</option>`)
              .join("");
        }
        const total = _srAllRecords.length,
          boys = _srAllRecords.filter((r) => "M" === r.gender).length,
          girls = _srAllRecords.filter((r) => "F" === r.gender).length,
          clsCount = new Set(_srAllRecords.map((r) => r.class)).size,
          set = (id, val) => {
            const el = document.getElementById(id);
            el && (el.textContent = val);
          };
        (set("sr-total", total),
          set("sr-boys", boys),
          set("sr-girls", girls),
          set("sr-classes", clsCount));
        const now = new Date().toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }),
          syncEl = document.getElementById("sr-last-synced");
        (syncEl && (syncEl.textContent = `Last synced: ${now}`),
          showSyncMsg && window.showToast?.("✅ Student records synced!"),
          (_srPage = 1),
          window.srFilter());
      } catch (err) {
        (console.error("Student Records load error:", err),
          tbody &&
            (tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--danger);padding:24px">❌ Failed to load: ${err.message}</td></tr>`),
          cards &&
            (cards.innerHTML = `<div style="color:var(--danger);text-align:center;padding:24px">❌ ${err.message}</div>`));
      } finally {
        syncBtn &&
          ((syncBtn.disabled = !1),
          (syncBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Sync Now'));
      }
    }),
      (window.srFilter = function () {
        const q = (
            document.getElementById("sr-search")?.value || ""
          ).toLowerCase(),
          cls = document.getElementById("sr-filter-class")?.value || "",
          gender = document.getElementById("sr-filter-gender")?.value || "";
        ((_srFiltered = _srAllRecords.filter((r) => {
          const matchQ =
              !q ||
              r.name.toLowerCase().includes(q) ||
              r.studentId.toLowerCase().includes(q),
            matchC = !cls || r.class === cls,
            matchG = !gender || r.gender === gender;
          return matchQ && matchC && matchG;
        })),
          _srFiltered.sort((a, b) => {
            let av = a[_srSortKey] || "",
              bv = b[_srSortKey] || "";
            return (
              "class" === _srSortKey
                ? ((av = CLASS_ORDER.indexOf(av)),
                  (bv = CLASS_ORDER.indexOf(bv)))
                : "rollNo" === _srSortKey
                  ? ((av = parseInt(av) || 0), (bv = parseInt(bv) || 0))
                  : ((av = av.toString().toLowerCase()),
                    (bv = bv.toString().toLowerCase())),
              av < bv ? -_srSortDir : av > bv ? _srSortDir : 0
            );
          }),
          (_srPage = 1),
          srRender());
      }),
      (window.srSort = function (key) {
        ((_srSortDir = _srSortKey === key ? -_srSortDir : 1),
          (_srSortKey = key),
          window.srFilter());
      }),
      (window._srGoPage = function (p) {
        ((_srPage = p), srRender());
      }),
      (window.srExport = function (format) {
        const data = _srFiltered.length ? _srFiltered : _srAllRecords;
        if (!data.length)
          return void window.showToast?.("⚠️ No data to export.");
        const rows = data.map((r) => ({
          "Student ID": r.studentId,
          "Full Name": r.name,
          Class: getLabel(r.class),
          Section: r.section,
          "Roll No": r.rollNo,
          Gender:
            "M" === r.gender ? "Male" : "F" === r.gender ? "Female" : r.gender,
          DOB: r.dob || "—",
          Age: r.age,
        }));
        if ("csv" === format) {
          const headers = Object.keys(rows[0]);
          srDownload(
            "student-records.csv",
            "text/csv",
            [
              headers.join(","),
              ...rows.map((r) => headers.map((h) => `"${r[h]}"`).join(",")),
            ].join("\n"),
          );
        } else if ("json" === format)
          srDownload(
            "student-records.json",
            "application/json",
            JSON.stringify(data, null, 2),
          );
        else if ("xlsx" === format) {
          if (!window.XLSX)
            return void window.showToast?.("❌ Excel library not loaded.");
          const ws = window.XLSX.utils.json_to_sheet(rows),
            wb = window.XLSX.utils.book_new();
          (window.XLSX.utils.book_append_sheet(wb, ws, "Students"),
            window.XLSX.writeFile(wb, "student-records.xlsx"));
        } else if ("pdf" === format) {
          if (!window.jspdf?.jsPDF)
            return void window.showToast?.("❌ PDF library not loaded.");
          const { jsPDF: jsPDF } = window.jspdf,
            doc = new jsPDF({
              orientation: "landscape",
              unit: "mm",
              format: "a4",
            });
          (doc.setFontSize(14),
            doc.text(
              "St. Francis De Sales Sec. School — Student Records",
              14,
              15,
            ),
            doc.setFontSize(9),
            doc.text(
              `Generated: ${new Date().toLocaleDateString("en-IN")}  |  Total: ${data.length}`,
              14,
              22,
            ),
            doc.autoTable({
              startY: 28,
              head: [Object.keys(rows[0])],
              body: rows.map((r) => Object.values(r)),
              styles: { fontSize: 8 },
              headStyles: { fillColor: [44, 62, 80] },
              alternateRowStyles: { fillColor: [245, 245, 245] },
            }),
            doc.save("student-records.pdf"));
        }
      }));
  })());
const TA_CLASS_MAP = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
  },
  TA_CLASS_NAMES = [
    "I",
    "II",
    "III",
    "IV",
    "V",
    "VI",
    "VII",
    "VIII",
    "IX",
    "X",
  ],
  TA_CLASS_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  TA_SUBJECT_CLASSES = {
    mathematics: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    science: [1, 2, 3, 4, 5, 6, 7, 8],
    english_i: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    english_ii: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    khasi_alt_english: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    hindi: [1, 2, 3, 4, 5, 6],
    spelling: [1, 2, 3, 4, 5],
    computer: [4, 5, 6, 7, 8],
    social_studies: [3, 4, 5],
    geography: [6, 7, 8, 9, 10],
    civics: [6, 7, 8, 9, 10],
    history: [6, 7, 8, 9, 10],
    health_education: [6],
    h_education: [7, 8, 9, 10],
    physics: [9, 10],
    chemistry: [9, 10],
    biology: [9, 10],
    economics: [9, 10],
  };
let _taCurrentUid = null,
  _taCurrentData = null,
  _taAssignments = [];
function renderTAList(teachers) {
  const listEl = document.getElementById("ta-teacher-list");
  teachers.length
    ? (listEl.innerHTML = teachers
        .map((t) => {
          const badge = (function (role) {
              const cls = {
                admin: "admin",
                class_teacher: "class",
                subject_teacher: "subject",
              }[role];
              if (!cls)
                return '<span class="admin-ta-badge admin-ta-badge-none">Unassigned</span>';
              return `<span class="admin-ta-badge admin-ta-badge-${cls}">${{ admin: "Admin", class: "Class Teacher", subject: "Subject Teacher" }[cls]}</span>`;
            })(t.role),
            ctOf = t.classTeacherOf
              ? `Class Teacher of: <strong>${t.classTeacherOf}</strong> &nbsp;·&nbsp; `
              : "",
            subs = (function (assignments) {
              if (!assignments.length) return "";
              const map = {};
              return (
                assignments.forEach((a) => {
                  (map[a.subjectLabel] || (map[a.subjectLabel] = []),
                    map[a.subjectLabel].push(a.class));
                }),
                Object.entries(map)
                  .map(([lbl, cls]) => `${lbl} (${cls.join(", ")})`)
                  .join(" &nbsp;|&nbsp; ")
              );
            })(t.assignments || []),
            ini = t.routineInitials || t.initials || "",
            sid = t.teacherId || t.staffId || "",
            iniChip = ini
              ? `<span style="background:#e0e7ff;color:#1a4a8a;border:1px solid #c7d2fe;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:700;letter-spacing:0.5px;margin-left:6px" title="Routine Initials">${taEsc(ini)}</span>`
              : "",
            sidChip = sid
              ? `<span style="color:var(--text-light);font-size:12px;margin-left:6px">· ${taEsc(sid)}</span>`
              : "",
            ptChip = t.isPartTime
              ? '<span style="background:#fef3c7;color:#92400e;border:1px solid #fde68a;border-radius:10px;padding:1px 8px;font-size:11px;font-weight:600;margin-left:6px">Part-time</span>'
              : "";
          return `<div class="admin-ta-card">\n      <div class="admin-ta-card-info">\n        <div class="admin-ta-card-name">\n          <i class="fas fa-user-circle" style="color:var(--accent);font-size:18px"></i>\n          ${taEsc(t.name || "Unnamed")}${iniChip}${sidChip}${ptChip} ${badge}\n        </div>\n        <div class="admin-ta-card-meta">${ctOf}${taEsc(t.email || "")}</div>\n        ${subs ? `<div class="admin-ta-card-subjects"><i class="fas fa-book" style="margin-right:4px;color:var(--accent)"></i>${subs}</div>` : ""}\n      </div>\n      <div style="display:flex;gap:8px;align-items:center">\n        ${t.role ? "" : `<button onclick="deleteTARecord('${t.uid}','${taEsc(t.name || "Unnamed")}')" style="background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px;font-weight:600"><i class="fas fa-trash"></i></button>`}\n        <button class="admin-ta-assign-btn" onclick="openTAPanel('${t.uid}')">\n          <i class="fas fa-pen"></i> Assign →\n        </button>\n      </div>\n    </div>`;
        })
        .join(""))
    : (listEl.innerHTML =
        '<p style="color:var(--text-light);padding:16px;text-align:center">No teachers found.</p>');
}
((window.loadTeacherAssignList = async function () {
  const listEl = document.getElementById("ta-teacher-list");
  if (listEl) {
    listEl.innerHTML =
      '<p style="text-align:center;color:var(--text-light);padding:24px"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
    try {
      const snap = await getDocs(collection(db, "teachers"));
      ((window._taAllTeachers = []),
        snap.forEach((d) =>
          window._taAllTeachers.push({ uid: d.id, ...d.data() }),
        ),
        renderTAList(window._taAllTeachers));
    } catch (e) {
      listEl.innerHTML = `<p style="color:var(--danger);padding:16px">Error: ${e.message}</p>`;
    }
  }
}),
  (window.deleteTARecord = async function (uid, name) {
    if (
      confirm(
        `Delete "${name}" from the assignments list? This only removes the unassigned duplicate record.`,
      )
    )
      try {
        (await deleteDoc(doc(db, "teachers", uid)),
          showToast(`🗑️ Deleted duplicate record for ${name}`),
          loadTeacherAssignList());
      } catch (e) {
        showToast("❌ " + e.message);
      }
  }));
const SFS_TEACHER_DIRECTORY = [
  {
    initials: "ELN",
    fullName: "Emilia Lyngdoh Nongbri",
    staffId: "SFST001",
    isPartTime: !1,
  },
  {
    initials: "AN",
    fullName: "Asha Mary Nongkhlaw",
    staffId: "SFST002",
    isPartTime: !1,
  },
  {
    initials: "ARLN",
    fullName: "Andrea Rafelline Lyngdoh Nongbri",
    staffId: "SFST003",
    isPartTime: !1,
  },
  {
    initials: "QM",
    fullName: "Queency Mary Mawrie",
    staffId: "SFST004",
    isPartTime: !1,
  },
  {
    initials: "FS",
    fullName: "Felicia Synjri",
    staffId: "SFST005",
    isPartTime: !1,
  },
  {
    initials: "IM",
    fullName: "Idahun Mawrie",
    staffId: "SFST006",
    isPartTime: !1,
  },
  {
    initials: "MP",
    fullName: "Michael Pamthet",
    staffId: "SFST007",
    isPartTime: !1,
  },
  {
    initials: "DP",
    fullName: "Dilang Pohshna",
    staffId: "SFST008",
    isPartTime: !1,
  },
  {
    initials: "PK",
    fullName: "Phisabet Kharumnuid",
    staffId: "SFST009",
    isPartTime: !1,
  },
  {
    initials: "MBK",
    fullName: "Mary Banri Kharsyntiew",
    staffId: "SFST010",
    isPartTime: !1,
  },
  {
    initials: "DS",
    fullName: "Dariker Songthiang",
    staffId: "SFST011",
    isPartTime: !1,
  },
  {
    initials: "DN",
    fullName: "Darisha Nongrum",
    staffId: "SFST012",
    isPartTime: !1,
  },
  {
    initials: "ID",
    fullName: "Ittrila Dkhar",
    staffId: "SFST013",
    isPartTime: !1,
  },
  {
    initials: "YL",
    fullName: "Youlinda Lyngdoh",
    staffId: "SFST014",
    isPartTime: !1,
  },
  {
    initials: "IOH",
    fullName: "Iohhunlang Nongkhlaw",
    staffId: "SFST015",
    isPartTime: !1,
  },
  {
    initials: "DOL",
    fullName: "Dolly Nongsiej",
    staffId: "SFST016",
    isPartTime: !1,
  },
  {
    initials: "MJ",
    fullName: "Merilin Jyndiang",
    staffId: "SFST018",
    isPartTime: !1,
  },
  {
    initials: "NS",
    fullName: "Niwanki Shylla",
    staffId: "SFST019",
    isPartTime: !1,
  },
  {
    initials: "VMK",
    fullName: "Vanessa Mary Kharkongor",
    staffId: "SFST020",
    isPartTime: !1,
  },
  {
    initials: "AKK",
    fullName: "Audilia Kharkongor",
    staffId: "SFST021",
    isPartTime: !1,
  },
  {
    initials: "AM",
    fullName: "Aidahunshisha Mawrie",
    staffId: "SFST022",
    isPartTime: !1,
  },
  {
    initials: "BK",
    fullName: "Babit Kharsahnoh",
    staffId: "SFST025",
    isPartTime: !1,
  },
  { initials: "DM", fullName: "Daprikmen Massar", staffId: "", isPartTime: !0 },
  { initials: "AP", fullName: "Anando Pohtam", staffId: "", isPartTime: !0 },
];
function _normName(s) {
  return (s || "").toString().toLowerCase().replace(/\s+/g, " ").trim();
}
function _syncEsc(s) {
  return (s || "")
    .toString()
    .replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
}
function renderTAAssignTable() {
  const tbody = document.getElementById("ta-assign-tbody");
  _taAssignments.length
    ? (tbody.innerHTML = _taAssignments
        .map(
          (a, i) =>
            `\n    <tr>\n      <td>${taEsc(a.class)}</td>\n      <td>${taEsc(a.subjectLabel)}</td>\n      <td><button onclick="removeTARow(${i})" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:15px" title="Remove">✕</button></td>\n    </tr>`,
        )
        .join(""))
    : (tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:var(--text-light);padding:12px;font-size:13px">No assignments yet.</td></tr>');
}
function taEsc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
((window.planSyncDirectory = async function () {
  const docs = (await getDocs(collection(db, "teachers"))).docs.map((d) => ({
      docId: d.id,
      ...d.data(),
    })),
    plan = { update: [], merge: [], create: [], orphans: [] },
    usedDocIds = new Set();
  for (const dir of SFS_TEACHER_DIRECTORY) {
    const primary = docs.find((d) => d.docId === dir.initials),
      dirNameKey = _normName(dir.fullName),
      dirIni = (dir.initials || "").toUpperCase(),
      secondaries = docs.filter(
        (d) =>
          d.docId !== dir.initials &&
          ((d.name && _normName(d.name) === dirNameKey) ||
            (d.fullName && _normName(d.fullName) === dirNameKey) ||
            (d.displayName && _normName(d.displayName) === dirNameKey) ||
            (dir.staffId &&
              d.teacherId &&
              d.teacherId.toUpperCase() === dir.staffId.toUpperCase()) ||
            (dir.staffId &&
              d.staffId &&
              d.staffId.toUpperCase() === dir.staffId.toUpperCase()) ||
            (dirIni && d.initials && d.initials.toUpperCase() === dirIni) ||
            (dirIni &&
              d.routineInitials &&
              d.routineInitials.toUpperCase() === dirIni)),
      );
    primary && 0 === secondaries.length
      ? (plan.update.push({ dir: dir, primary: primary }),
        usedDocIds.add(primary.docId))
      : primary || secondaries.length > 0
        ? (plan.merge.push({
            dir: dir,
            primary: primary,
            secondaries: secondaries,
          }),
          primary && usedDocIds.add(primary.docId),
          secondaries.forEach((s) => usedDocIds.add(s.docId)))
        : plan.create.push({ dir: dir });
  }
  return ((plan.orphans = docs.filter((d) => !usedDocIds.has(d.docId))), plan);
}),
  (window._syncDirPlan = null),
  (window.openSyncDirectoryPanel = async function () {
    ((document.getElementById("sync-dir-overlay").style.display = "block"),
      (document.body.style.overflow = "hidden"));
    const body = document.getElementById("sync-dir-body"),
      summary = document.getElementById("sync-dir-summary"),
      applyBtn = document.getElementById("sync-dir-apply-btn");
    ((body.innerHTML =
      '<p style="text-align:center;color:var(--text-light);padding:32px"><i class="fas fa-spinner fa-spin"></i> Analyzing teacher records…</p>'),
      (applyBtn.disabled = !0),
      (applyBtn.style.opacity = "0.5"));
    try {
      const plan = await window.planSyncDirectory();
      ((window._syncDirPlan = plan),
        (function (plan) {
          const body = document.getElementById("sync-dir-body"),
            sec = (title, color, items, render) =>
              0 === items.length
                ? ""
                : `\n    <div style="margin-bottom:22px">\n      <h5 style="color:${color};margin:0 0 10px;font-size:14px;text-transform:uppercase;letter-spacing:0.5px;font-weight:700">${title} <span style="background:${color};color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;margin-left:6px">${items.length}</span></h5>\n      <div style="border:1px solid #eee;border-radius:10px;overflow:hidden">${items.map(render).join("")}</div>\n    </div>`,
            rowStyle =
              "padding:10px 14px;border-bottom:1px solid #f3f3f3;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px",
            updateRow = (it) =>
              `<div style="${rowStyle}">\n    <div><strong>${_syncEsc(it.dir.fullName)}</strong> <span style="color:var(--text-light)">· ${it.dir.initials} · ${it.dir.staffId || "<em>no staff ID</em>"}</span></div>\n    <span style="color:#5a8a5a;font-size:12px"><i class="fas fa-edit"></i> enrich</span>\n  </div>`,
            mergeRow = (it) =>
              `<div style="${rowStyle}">\n    <div>\n      <strong>${_syncEsc(it.dir.fullName)}</strong> <span style="color:var(--text-light)">· ${it.dir.initials} · ${it.dir.staffId || "<em>no staff ID</em>"}</span>\n      <div style="font-size:11px;color:var(--text-light);margin-top:2px">Consolidating: ${it.primary ? "initials doc" : ""}${it.primary && it.secondaries.length ? " + " : ""}${it.secondaries.length ? it.secondaries.length + " duplicate doc" + (it.secondaries.length > 1 ? "s" : "") : ""}</div>\n    </div>\n    <span style="color:#b45309;font-size:12px"><i class="fas fa-compress-arrows-alt"></i> merge</span>\n  </div>`,
            createRow = (it) =>
              `<div style="${rowStyle}">\n    <div><strong>${_syncEsc(it.dir.fullName)}</strong> <span style="color:var(--text-light)">· ${it.dir.initials} · ${it.dir.staffId || "<em>no staff ID</em>"}</span></div>\n    <span style="color:#1a6b3c;font-size:12px"><i class="fas fa-plus-circle"></i> create</span>\n  </div>`,
            orphanRow = (d) => {
              const name = d.name || d.fullName || "(no name)",
                hint = d.role
                  ? `<span style="color:#1a4a8a">role: ${_syncEsc(d.role)}</span>`
                  : d.email
                    ? `<span style="color:var(--text-light)">${_syncEsc(d.email)}</span>`
                    : '<span style="color:#dc2626">unnamed stub</span>';
              return `<div style="${rowStyle}">\n      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1">\n        <input type="checkbox" class="sync-orphan-delete" data-doc-id="${_syncEsc(d.docId)}" style="width:16px;height:16px;cursor:pointer">\n        <div>\n          <strong>${_syncEsc(name)}</strong> <span style="color:var(--text-light)">· doc: <code>${_syncEsc(d.docId)}</code></span>\n          <div style="font-size:11px;margin-top:2px">${hint}</div>\n        </div>\n      </label>\n      <span style="color:#dc2626;font-size:12px">tick to delete</span>\n    </div>`;
            };
          let html = "";
          ((html += sec(
            "Will Update (existing record + enrich)",
            "#5a8a5a",
            plan.update,
            updateRow,
          )),
            (html += sec(
              "Will Merge & Deduplicate",
              "#b45309",
              plan.merge,
              mergeRow,
            )),
            (html += sec(
              "Will Create (new record)",
              "#1a6b3c",
              plan.create,
              createRow,
            )),
            (html += sec(
              "Orphans — review before deleting",
              "#dc2626",
              plan.orphans,
              orphanRow,
            )),
            plan.orphans.length > 0 &&
              (html +=
                '<p style="font-size:12px;color:var(--text-light);background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;margin-top:8px"><i class="fas fa-info-circle" style="color:#b45309"></i> Tick only the orphans you want to <strong>delete</strong>. Unticked orphans (e.g., office staff like Ibankyntiew Mawrie) are left untouched.</p>'));
          html ||
            (html =
              '<p style="text-align:center;color:var(--text-light);padding:24px">Nothing to do — directory is fully in sync.</p>');
          body.innerHTML = html;
        })(plan));
      const total = plan.update.length + plan.merge.length + plan.create.length;
      ((summary.innerHTML = `<strong>${total}</strong> directory entries will be processed · <strong>${plan.merge.length}</strong> duplicates will be consolidated · <strong>${plan.orphans.length}</strong> orphans for your review`),
        (applyBtn.disabled = !1),
        (applyBtn.style.opacity = "1"));
    } catch (e) {
      ((body.innerHTML = `<p style="color:var(--danger);padding:24px">❌ ${e.message}</p>`),
        console.error(e));
    }
  }),
  (window.closeSyncDirectoryPanel = function () {
    ((document.getElementById("sync-dir-overlay").style.display = "none"),
      (document.body.style.overflow = ""),
      (window._syncDirPlan = null));
  }),
  (window.applySyncDirectory = async function () {
    const plan = window._syncDirPlan;
    if (!plan) return void showToast("⚠️ No plan loaded. Re-open the preview.");
    const orphanIds = Array.from(
        document.querySelectorAll(".sync-orphan-delete:checked"),
      ).map((el) => el.dataset.docId),
      total = plan.update.length + plan.merge.length + plan.create.length,
      dupesToDelete = plan.merge.reduce(
        (n, it) =>
          n + it.secondaries.filter((s) => s.docId !== it.dir.initials).length,
        0,
      ),
      msg = `This will write ${total} teacher records and delete ${dupesToDelete + orphanIds.length} doc(s) (${dupesToDelete} duplicate(s) + ${orphanIds.length} orphan(s)).\n\nThis cannot be undone. Continue?`;
    if (!confirm(msg)) return;
    const applyBtn = document.getElementById("sync-dir-apply-btn");
    ((applyBtn.disabled = !0),
      (applyBtn.style.opacity = "0.6"),
      (applyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Writing…'));
    const stats = { updated: 0, merged: 0, created: 0, deleted: 0 };
    try {
      const batch = writeBatch(db),
        ts = new Date().toISOString();
      for (const it of plan.update)
        (batch.set(
          doc(db, "teachers", it.dir.initials),
          {
            name: it.dir.fullName,
            fullName: it.dir.fullName,
            initials: it.dir.initials,
            routineInitials: it.dir.initials,
            teacherId: it.dir.staffId || "",
            staffId: it.dir.staffId || "",
            isPartTime: !!it.dir.isPartTime,
            updatedAt: ts,
          },
          { merge: !0 },
        ),
          stats.updated++);
      const ROLE_RANK = { class_teacher: 3, admin: 2, subject_teacher: 1 },
        _rank = (r) => ROLE_RANK[r] || 0,
        classesToUpdate = [];
      for (const it of plan.merge) {
        const merged = {};
        it.primary && Object.assign(merged, it.primary);
        for (const s of it.secondaries) Object.assign(merged, s);
        delete merged.docId;
        let bestRole = it.primary?.role || null,
          bestClassTeacherOf = it.primary?.classTeacherOf || null,
          bestClassTeacher = it.primary?.classTeacher || null;
        const allAssignments = it.primary?.assignments
          ? [...it.primary.assignments]
          : [];
        for (const s of it.secondaries)
          (_rank(s.role) > _rank(bestRole) && (bestRole = s.role),
            s.classTeacherOf &&
              !bestClassTeacherOf &&
              (bestClassTeacherOf = s.classTeacherOf),
            s.classTeacher &&
              !bestClassTeacher &&
              (bestClassTeacher = s.classTeacher),
            Array.isArray(s.assignments) &&
              allAssignments.push(...s.assignments));
        const seenAsg = new Set(),
          dedupedAsg = allAssignments.filter((a) => {
            const k = `${a.class}|${a.subjectKey}`;
            return !seenAsg.has(k) && (seenAsg.add(k), !0);
          });
        ((merged.role = bestRole),
          (merged.classTeacherOf = bestClassTeacherOf),
          (merged.classTeacher = bestClassTeacher),
          (merged.assignments = dedupedAsg),
          (merged.name = it.dir.fullName),
          (merged.fullName = it.dir.fullName),
          (merged.initials = it.dir.initials),
          (merged.routineInitials = it.dir.initials),
          (merged.teacherId = it.dir.staffId || merged.teacherId || ""),
          (merged.staffId = it.dir.staffId || merged.staffId || ""),
          (merged.isPartTime = !!it.dir.isPartTime),
          (merged.updatedAt = ts),
          merged.createdAt || (merged.createdAt = ts),
          batch.set(doc(db, "teachers", it.dir.initials), merged));
        const oldClassRefs = new Set();
        it.primary?.classTeacherOf &&
          oldClassRefs.add(it.primary.classTeacherOf);
        for (const s of it.secondaries)
          s.classTeacherOf && oldClassRefs.add(s.classTeacherOf);
        for (const classKey of oldClassRefs)
          classesToUpdate.push({
            classKey: classKey,
            newId: it.dir.initials,
            name: it.dir.fullName,
          });
        for (const s of it.secondaries)
          s.docId !== it.dir.initials &&
            (batch.delete(doc(db, "teachers", s.docId)), stats.deleted++);
        stats.merged++;
      }
      for (const u of classesToUpdate)
        batch.set(
          doc(db, "classes", u.classKey),
          { classTeacherId: u.newId, classTeacherName: u.name },
          { merge: !0 },
        );
      for (const it of plan.create)
        (batch.set(doc(db, "teachers", it.dir.initials), {
          name: it.dir.fullName,
          fullName: it.dir.fullName,
          initials: it.dir.initials,
          routineInitials: it.dir.initials,
          teacherId: it.dir.staffId || "",
          staffId: it.dir.staffId || "",
          isPartTime: !!it.dir.isPartTime,
          status: "Active",
          createdAt: ts,
          updatedAt: ts,
        }),
          stats.created++);
      for (const oid of orphanIds)
        (batch.delete(doc(db, "teachers", oid)), stats.deleted++);
      (await batch.commit(),
        showToast(
          `✅ Sync complete · ${stats.updated} updated · ${stats.merged} merged · ${stats.created} created · ${stats.deleted} deleted`,
        ),
        closeSyncDirectoryPanel(),
        window.loadTeacherAssignList && loadTeacherAssignList());
    } catch (e) {
      (console.error("[applySyncDirectory] failed:", e),
        showToast("❌ Sync failed: " + e.message),
        (applyBtn.disabled = !1),
        (applyBtn.style.opacity = "1"),
        (applyBtn.innerHTML = '<i class="fas fa-check"></i> Apply Changes'));
    }
  }),
  (window.filterTAList = function () {
    const q = (document.getElementById("ta-search").value || "").toLowerCase();
    renderTAList(
      (window._taAllTeachers || []).filter(
        (t) =>
          (t.name || "").toLowerCase().includes(q) ||
          (t.email || "").toLowerCase().includes(q) ||
          (t.assignments || []).some((a) =>
            (a.subjectLabel || "").toLowerCase().includes(q),
          ),
      ),
    );
  }),
  (window.openLoginCheckPanel = async function () {
    ((document.getElementById("login-check-overlay").style.display = "block"),
      (document.body.style.overflow = "hidden"));
    const body = document.getElementById("login-check-body");
    body.innerHTML =
      '<p style="text-align:center;color:var(--text-light);padding:32px"><i class="fas fa-spinner fa-spin"></i> Tracing login linkages…</p>';
    try {
      !(function ({ report: report, orphans: orphans }) {
        const body = document.getElementById("login-check-body"),
          summary = document.getElementById("login-check-summary"),
          counts = report.reduce(
            (a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a),
            {},
          ),
          ok = counts.OK || 0,
          issues =
            (counts.NO_LOGIN || 0) +
            (counts.WRONG_DOC || 0) +
            (counts.BROKEN || 0) +
            (counts.AMBIGUOUS || 0) +
            (counts.NO_DOC || 0),
          pending = counts.PENDING || 0;
        summary.innerHTML = `<span style="color:#1a6b3c;font-weight:700">✓ ${ok} OK</span> · <span style="color:#dc2626;font-weight:700">${issues} issue${1 === issues ? "" : "s"}</span> · <span style="color:var(--text-light)">${pending} pending</span>${orphans.length ? ` · <span style="color:#b45309;font-weight:700">${orphans.length} orphan login${1 === orphans.length ? "" : "s"}</span>` : ""}`;
        const badge = (status) => {
            const map = {
                OK: {
                  bg: "#dcfce7",
                  fg: "#166534",
                  icon: "fa-check-circle",
                  label: "OK",
                },
                NO_LOGIN: {
                  bg: "#fee2e2",
                  fg: "#991b1b",
                  icon: "fa-user-slash",
                  label: "No Login",
                },
                PENDING: {
                  bg: "#fef3c7",
                  fg: "#92400e",
                  icon: "fa-clock",
                  label: "Pending",
                },
                WRONG_DOC: {
                  bg: "#fee2e2",
                  fg: "#991b1b",
                  icon: "fa-exclamation-triangle",
                  label: "Wrong Doc",
                },
                BROKEN: {
                  bg: "#fee2e2",
                  fg: "#991b1b",
                  icon: "fa-unlink",
                  label: "Broken",
                },
                AMBIGUOUS: {
                  bg: "#fef3c7",
                  fg: "#92400e",
                  icon: "fa-question-circle",
                  label: "Ambiguous",
                },
                NO_DOC: {
                  bg: "#fee2e2",
                  fg: "#991b1b",
                  icon: "fa-times-circle",
                  label: "No Teacher Doc",
                },
              },
              m = map[status] || map.BROKEN;
            return `<span style="background:${m.bg};color:${m.fg};padding:3px 10px;border-radius:10px;font-size:11px;font-weight:700;letter-spacing:0.3px"><i class="fas ${m.icon}" style="margin-right:4px"></i>${m.label}</span>`;
          },
          rows = report
            .map(
              (r) =>
                `<tr>\n    <td style="padding:10px 12px"><strong>${r.dir.fullName}</strong></td>\n    <td style="padding:10px 12px"><span style="background:#e0e7ff;color:#1a4a8a;padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700">${r.dir.initials}</span></td>\n    <td style="padding:10px 12px;color:var(--text-light);font-size:12px">${r.dir.staffId || "—"}</td>\n    <td style="padding:10px 12px">${badge(r.status)}</td>\n    <td style="padding:10px 12px;font-size:12px;color:var(--text-light)">${r.detail}</td>\n  </tr>`,
            )
            .join("");
        let html = `<div class="table-wrap"><table style="width:100%;font-size:13px"><thead><tr style="background:#eff6ff"><th style="padding:10px 12px;text-align:left">Teacher</th><th style="padding:10px 12px;text-align:left">Initials</th><th style="padding:10px 12px;text-align:left">Staff ID</th><th style="padding:10px 12px;text-align:left">Status</th><th style="padding:10px 12px;text-align:left">Detail</th></tr></thead><tbody>${rows}</tbody></table></div>`;
        orphans.length &&
          (html += `<div style="margin-top:24px"><h5 style="color:#b45309;margin:0 0 8px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px">Orphan Login Accounts <span style="background:#b45309;color:#fff;border-radius:10px;padding:2px 8px;font-size:11px;margin-left:6px">${orphans.length}</span></h5>\n      <p style="font-size:12px;color:var(--text-light);margin:0 0 8px">User accounts with role=teacher whose teacherId/loginId doesn't match any directory entry.</p>\n      <div style="border:1px solid #f3d9b1;border-radius:8px;overflow:hidden">${orphans.map((o) => `<div style="padding:8px 14px;border-bottom:1px solid #fbeed5;font-size:12px;display:flex;justify-content:space-between"><span><strong>${(o.name || o.email || o.uid.slice(0, 8)).replace(/</g, "&lt;")}</strong></span><span style="color:var(--text-light)">teacherId: <code>${o.teacherId || o.loginId || "—"}</code></span></div>`).join("")}</div></div>`);
        body.innerHTML = html;
      })(
        await (async function () {
          const [usersSnap, teachersSnap] = await Promise.all([
              getDocs(collection(db, "users")),
              getDocs(collection(db, "teachers")),
            ]),
            users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() })),
            teachers = teachersSnap.docs.map((d) => ({
              docId: d.id,
              ...d.data(),
            })),
            teacherByDocId = new Map(teachers.map((t) => [t.docId, t])),
            teachersByTeacherId = new Map();
          for (const t of teachers)
            t.teacherId &&
              teachersByTeacherId.set(String(t.teacherId).toUpperCase(), t);
          const report = [];
          for (const dir of SFS_TEACHER_DIRECTORY) {
            const teacherDoc = teacherByDocId.get(dir.initials),
              candidates = users.filter((u) => {
                const ut = String(u.teacherId || u.loginId || "").toUpperCase();
                return (
                  !!ut &&
                  ((dir.staffId && ut === dir.staffId.toUpperCase()) ||
                    ut === dir.initials.toUpperCase())
                );
              });
            let status,
              detail,
              fix = "";
            if (teacherDoc)
              if (0 === candidates.length)
                ((status = dir.staffId ? "NO_LOGIN" : "PENDING"),
                  (detail = dir.staffId
                    ? "No Firebase Auth account linked. Teacher cannot log in."
                    : "Pending staff ID — login account expected later."));
              else if (candidates.length > 1)
                ((status = "AMBIGUOUS"),
                  (detail = `${candidates.length} user docs claim this teacher: ${candidates.map((c) => c.uid.slice(0, 8)).join(", ")}`));
              else {
                const u = candidates[0],
                  tid = String(u.teacherId || u.loginId || "").toUpperCase(),
                  directHit = teacherByDocId.get(u.uid),
                  tidHit = teachersByTeacherId.get(tid),
                  resolved = directHit || tidHit;
                resolved && resolved.docId === dir.initials
                  ? ((status = "OK"),
                    (detail = `Logs in as <code>${(u.loginId || u.email || "?").replace(/</g, "&lt;")}</code>`))
                  : resolved
                    ? ((status = "WRONG_DOC"),
                      (detail = `Lookup resolves to <code>${resolved.docId}</code> (expected <code>${dir.initials}</code>).`))
                    : ((status = "BROKEN"),
                      (detail = `users/${u.uid.slice(0, 8)}… has teacherId="${tid}" but no matching teacher doc.`));
              }
            else
              ((status = "NO_DOC"),
                (detail = "Teacher doc not found. Run Sync."),
                (fix = "Sync"));
            report.push({
              dir: dir,
              status: status,
              detail: detail,
              fix: fix,
              teacherDoc: teacherDoc,
              candidates: candidates,
            });
          }
          const claimedDirIds = new Set(
              SFS_TEACHER_DIRECTORY.flatMap((d) =>
                [
                  d.initials.toUpperCase(),
                  (d.staffId || "").toUpperCase(),
                ].filter(Boolean),
              ),
            ),
            orphans = users.filter((u) => {
              const ut = String(u.teacherId || u.loginId || "").toUpperCase();
              if (!ut) return !1;
              if (claimedDirIds.has(ut)) return !1;
              return (u.role || "").toLowerCase().includes("teacher");
            });
          return { report: report, orphans: orphans };
        })(),
      );
    } catch (e) {
      ((body.innerHTML = `<p style="color:var(--danger);padding:24px">❌ ${e.message}</p>`),
        console.error(e));
    }
  }),
  (window.closeLoginCheckPanel = function () {
    ((document.getElementById("login-check-overlay").style.display = "none"),
      (document.body.style.overflow = ""));
  }),
  (window.openTAPanel = async function (uid) {
    const teacher = (window._taAllTeachers || []).find((t) => t.uid === uid);
    if (!teacher) return;
    ((_taCurrentUid = uid),
      (_taCurrentData = teacher),
      (_taAssignments = JSON.parse(JSON.stringify(teacher.assignments || []))),
      (document.getElementById("ta-panel-title").textContent =
        `Assign Roles — ${teacher.name || "Teacher"}`));
    const riEl = document.getElementById("ta-routineInitials"),
      sidEl = document.getElementById("ta-staffId"),
      ptEl = document.getElementById("ta-isPartTime");
    (riEl &&
      (riEl.value = (teacher.routineInitials || teacher.initials || "")
        .toString()
        .toUpperCase()),
      sidEl && (sidEl.value = teacher.teacherId || teacher.staffId || ""),
      ptEl && (ptEl.checked = !!teacher.isPartTime),
      document.querySelectorAll('input[name="ta-role"]').forEach((r) => {
        r.checked = r.value === (teacher.role || "");
      }),
      onTARoleChange(),
      (document.getElementById("ta-ct-class").value =
        teacher.classTeacherOf || ""),
      (document.getElementById("ta-ct-conflict").style.display = "none"),
      (document.getElementById("ta-sub-class").value = ""),
      (document.getElementById("ta-sub-subject").innerHTML =
        '<option value="">— Select Class First —</option>'),
      (document.getElementById("ta-sub-error").style.display = "none"),
      renderTAAssignTable(),
      (document.getElementById("ta-panel-overlay").style.display = "block"),
      document.getElementById("ta-panel").classList.add("open"));
  }),
  (window.closeTAPanel = function () {
    (document.getElementById("ta-panel").classList.remove("open"),
      (document.getElementById("ta-panel-overlay").style.display = "none"),
      (_taCurrentUid = null),
      (_taCurrentData = null),
      (_taAssignments = []));
  }),
  (window.onTARoleChange = function () {
    const role = document.querySelector('input[name="ta-role"]:checked')?.value;
    document.getElementById("ta-section-b").style.display =
      "class_teacher" === role ? "" : "none";
  }),
  (window.onTACTClassChange = async function () {
    const cls = document.getElementById("ta-ct-class").value,
      conflictEl = document.getElementById("ta-ct-conflict");
    if (((conflictEl.style.display = "none"), cls))
      try {
        const snap = await getDoc(doc(db, "classes", `${cls}-A`));
        if (snap.exists()) {
          const d = snap.data();
          d.classTeacherId &&
            d.classTeacherId !== _taCurrentUid &&
            ((conflictEl.textContent = `⚠ ${cls}-A already has a class teacher: ${d.classTeacherName || d.classTeacherId}. Saving will reassign this class.`),
            (conflictEl.style.display = "block"));
        }
      } catch (e) {}
  }),
  (window.onTASubClassChange = function () {
    const cls = document.getElementById("ta-sub-class").value,
      subjSel = document.getElementById("ta-sub-subject");
    if (((subjSel.innerHTML = '<option value="">— Subject —</option>'), !cls))
      return;
    const cfg = window.CONFIG && window.CONFIG[TA_CLASS_MAP[cls]];
    cfg &&
      cfg.subjects
        .filter((s) => !s.isAggregate)
        .forEach((s) => {
          const o = document.createElement("option");
          ((o.value = s.key),
            (o.textContent = s.label),
            subjSel.appendChild(o));
        });
  }),
  (window.addTASubjectRow = function () {
    const cls = document.getElementById("ta-sub-class").value,
      subjSel = document.getElementById("ta-sub-subject"),
      key = subjSel.value,
      label = subjSel.options[subjSel.selectedIndex]?.text || "",
      errEl = document.getElementById("ta-sub-error");
    return (
      (errEl.style.display = "none"),
      cls && key
        ? _taAssignments.some((a) => a.class === cls && a.subjectKey === key)
          ? ((errEl.textContent = "Already added."),
            void (errEl.style.display = "block"))
          : (_taAssignments.push({
              class: cls,
              subjectKey: key,
              subjectLabel: label,
            }),
            void renderTAAssignTable())
        : ((errEl.textContent = "Select a class and subject."),
          void (errEl.style.display = "block"))
    );
  }),
  (window.onTAMultiSubjectChange = function () {
    const key = document.getElementById("ta-multi-subject").value,
      container = document.getElementById("ta-multi-classes");
    if (((container.innerHTML = ""), !key)) return;
    const validNums = TA_SUBJECT_CLASSES[key] || [];
    TA_CLASS_NAMES.forEach((name, i) => {
      if (!validNums.includes(TA_CLASS_NUMS[i])) return;
      const lbl = document.createElement("label");
      ((lbl.style.cssText =
        "display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:#fff"),
        (lbl.innerHTML = `<input type="checkbox" value="${name}"> ${name}`),
        container.appendChild(lbl));
    });
  }),
  (window.addTAMultiRows = function () {
    const key = document.getElementById("ta-multi-subject").value;
    if (!key) return void showToast("Select a subject first.");
    const checked = [
      ...document.querySelectorAll("#ta-multi-classes input:checked"),
    ].map((c) => c.value);
    if (!checked.length) return void showToast("Select at least one class.");
    let added = 0;
    (checked.forEach((cls) => {
      const cfg = window.CONFIG && window.CONFIG[TA_CLASS_MAP[cls]],
        subj = cfg?.subjects.find((s) => s.key === key && !s.isAggregate);
      subj &&
        (_taAssignments.some((a) => a.class === cls && a.subjectKey === key) ||
          (_taAssignments.push({
            class: cls,
            subjectKey: key,
            subjectLabel: subj.label,
          }),
          added++));
    }),
      renderTAAssignTable(),
      showToast(
        added
          ? `✅ Added ${added} assignment${added > 1 ? "s" : ""}.`
          : "All selected were already added.",
      ));
  }),
  (window.removeTARow = function (idx) {
    (_taAssignments.splice(idx, 1), renderTAAssignTable());
  }),
  (window.saveTAAssignments = async function () {
    const role = document.querySelector('input[name="ta-role"]:checked')?.value;
    if (!role) return void showToast("⚠ Please select a role.");
    let classTeacherOf = null;
    if ("class_teacher" === role) {
      const cls = document.getElementById("ta-ct-class").value;
      if (!cls)
        return void showToast("⚠ Select a class for Class Teacher assignment.");
      classTeacherOf = cls;
    }
    const oldCT = _taCurrentData?.classTeacherOf || null,
      batch = writeBatch(db),
      _ctNum =
        (classTeacherOf && TA_ROMAN_TO_NUM[classTeacherOf.split("-")[0]]) ||
        null,
      riVal = (document.getElementById("ta-routineInitials")?.value || "")
        .toUpperCase()
        .trim(),
      sidVal = (document.getElementById("ta-staffId")?.value || "").trim(),
      ptVal = !!document.getElementById("ta-isPartTime")?.checked;
    (batch.set(
      doc(db, "teachers", _taCurrentUid),
      {
        role: role,
        classTeacherOf: classTeacherOf,
        classTeacher: _ctNum,
        assignments: _taAssignments,
        name: _taCurrentData?.name || "",
        email: _taCurrentData?.email || "",
        routineInitials: riVal,
        initials: riVal,
        teacherId: sidVal || _taCurrentData?.teacherId || "",
        staffId: sidVal || _taCurrentData?.staffId || "",
        isPartTime: ptVal,
        updatedAt: serverTimestamp(),
      },
      { merge: !0 },
    ),
      oldCT &&
        oldCT !== classTeacherOf &&
        batch.set(
          doc(db, "classes", oldCT),
          { classTeacherId: null, classTeacherName: null },
          { merge: !0 },
        ),
      classTeacherOf &&
        batch.set(
          doc(db, "classes", classTeacherOf),
          {
            classTeacherId: _taCurrentUid,
            classTeacherName: _taCurrentData?.name || "",
          },
          { merge: !0 },
        ));
    try {
      await batch.commit();
      const tid = _taCurrentData?.teacherId || "";
      if (tid) {
        const portalPayload = {
          tpRole: role,
          tpClassTeacherOf: classTeacherOf || null,
          tpAssignments: _taAssignments,
          tpUpdatedAt: new Date().toISOString(),
        };
        try {
          let uSnap = await getDocs(
            query(collection(db, "users"), where("loginId", "==", tid)),
          );
          if (
            (uSnap.empty &&
              (uSnap = await getDocs(
                query(
                  collection(db, "users"),
                  where("loginId", "==", tid.toUpperCase()),
                ),
              )),
            uSnap.empty &&
              (uSnap = await getDocs(
                query(
                  collection(db, "users"),
                  where("loginId", "==", tid.toLowerCase()),
                ),
              )),
            uSnap.empty &&
              _taCurrentData?.email &&
              (uSnap = await getDocs(
                query(
                  collection(db, "users"),
                  where("email", "==", _taCurrentData.email),
                ),
              )),
            !uSnap.empty)
          ) {
            const authUid = uSnap.docs[0].id;
            await setDoc(doc(db, "users", authUid), portalPayload, {
              merge: !0,
            });
          }
        } catch (e2) {
          console.warn("Portal sync failed:", e2.message);
        }
      }
      (showToast(
        `✅ Assignments saved for ${_taCurrentData?.name || "teacher"}`,
      ),
        closeTAPanel(),
        loadTeacherAssignList());
    } catch (e) {
      showToast(`❌ Save failed: ${e.message}`);
    }
  }),
  (window.openAddTeacherForAssign = function () {
    "function" == typeof openTeacherModal
      ? openTeacherModal()
      : showToast("Use the Teachers tab to add new teachers.");
  }));
let _tpAssignUnsubscribe = null;
function renderCTStatusRow(card, classId, results) {
  const existing = document.getElementById("tp-ct-status-row");
  existing && existing.remove();
  const row = document.createElement("div");
  if (
    ((row.id = "tp-ct-status-row"),
    (row.style.cssText =
      "margin-top:14px;padding-top:12px;border-top:1px dashed var(--border,#e2d8c5);display:flex;gap:18px;flex-wrap:wrap;font-size:13px"),
    null === results)
  )
    row.innerHTML =
      '<span style="color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Checking pending reviews…</span>';
  else if ("error" === results)
    row.innerHTML =
      '<span style="color:var(--text-light)">Could not load pending reviews.</span>';
  else {
    const lastSeenKey = `tp_ct_last_seen_${classId}`;
    let lastSeen = {};
    try {
      lastSeen = JSON.parse(localStorage.getItem(lastSeenKey) || "{}");
    } catch (_) {}
    ["HY", "FT"].forEach((term) => {
      const r = results[term],
        label = "HY" === term ? "Half Yearly" : "Final Term",
        newCount = Math.max(0, r.submitted - (lastSeen[term] || 0)),
        totalStr = r.total > 0 ? r.total : "—",
        valColor = r.submitted > 0 ? "#16a34a" : "var(--text-light)";
      let badge = "";
      (r.locked
        ? (badge =
            ' <span style="background:#e0e0e0;color:#555;padding:2px 8px;border-radius:10px;font-size:10.5px;font-weight:700;letter-spacing:.3px">LOCKED</span>')
        : newCount > 0 &&
          (badge = ` <span class="badge-new" style="margin-left:0">+${newCount} NEW</span>`),
        (row.innerHTML +=
          `<div style="display:flex;align-items:center;gap:6px"><strong style="color:var(--accent-dark)">${label}:</strong><span style="color:${valColor};font-weight:700">${r.submitted}</span><span style="color:var(--text-light)">/${totalStr} submitted</span>` +
          badge +
          "</div>"));
    });
    const reviewBtn = card.querySelector(".tp-review-lock-btn");
    reviewBtn &&
      !reviewBtn._lastSeenWired &&
      ((reviewBtn._lastSeenWired = !0),
      reviewBtn.addEventListener("click", () => {
        try {
          localStorage.setItem(
            lastSeenKey,
            JSON.stringify({
              HY: results.HY.submitted,
              FT: results.FT.submitted,
            }),
          );
        } catch (_) {}
      }));
  }
  card.appendChild(row);
}
function renderTPAssignments(data) {
  const role = data.role || "",
    classTeacherOf = data.classTeacherOf || null,
    assignments = data.assignments || [],
    classCard = document.getElementById("tp-class-card"),
    classLabel = document.getElementById("tp-class-label");
  if (classCard)
    if ("class_teacher" === role && classTeacherOf) {
      ((classCard.style.display = ""),
        classLabel &&
          (classLabel.textContent = `Class ${classTeacherOf.replace(/-A$/, "")}`));
      const reviewBtn = classCard.querySelector(".tp-review-lock-btn");
      (reviewBtn &&
        ((reviewBtn.style.opacity = ""),
        (reviewBtn.style.cursor = ""),
        reviewBtn.removeAttribute("title"),
        (reviewBtn.onclick = () => {
          window.location.href = `../Sfs-report-card/markentry.html?classId=${classTeacherOf}&action=review`;
        })),
        (async function (classId) {
          if (!classId) return;
          const card = document.getElementById("tp-class-card");
          if (card) {
            renderCTStatusRow(card, classId, null);
            try {
              const results = {};
              for (const term of ["HY", "FT"]) {
                const termKey = `${classId}_${term}`,
                  snap = await getDocs(
                    query(
                      collection(db, "marks", termKey, "students"),
                      limit(100),
                    ),
                  ),
                  aggregate = {},
                  academicsKeys = new Set();
                let isLocked = !1;
                (snap.forEach((d) => {
                  const data = d.data();
                  "locked" === data.status && (isLocked = !0);
                  const sub = data.submittedSubjects || {};
                  for (const [k, v] of Object.entries(sub))
                    (!aggregate[k] ||
                      ("submitted" === v?.status &&
                        "submitted" !== aggregate[k]?.status)) &&
                      (aggregate[k] = v);
                  Object.keys(data.academics || {}).forEach((k) =>
                    academicsKeys.add(k),
                  );
                }),
                  Object.keys(aggregate).forEach((k) => academicsKeys.add(k)),
                  (results[term] = {
                    submitted: Object.values(aggregate).filter(
                      (v) => "submitted" === v?.status,
                    ).length,
                    total: academicsKeys.size,
                    locked: isLocked,
                  }));
              }
              renderCTStatusRow(card, classId, results);
            } catch (err) {
              (console.warn("loadCTPendingReviews failed:", err.message),
                renderCTStatusRow(card, classId, "error"));
            }
          }
        })(classTeacherOf));
    } else classCard.style.display = "none";
  const wrap = document.getElementById("tp-subjects-wrap");
  if (!wrap) return;
  if (!assignments.length)
    return void (wrap.innerHTML = `<div class="tp-assign-empty">\n      <i class="fas fa-exclamation-triangle" style="color:#f0c040;margin-right:8px"></i>\n      ${"class_teacher" === role ? "You are assigned as Class Teacher only. Subject marks will be entered by individual subject teachers." : "No subjects have been assigned to you yet. Please contact the Admin."}\n    </div>`);
  wrap.innerHTML = `\n    <div class="table-wrap">\n      <table class="tp-assign-table">\n        <thead>\n          <tr><th>Class</th><th>Subject</th><th>Term</th><th>Action</th></tr>\n        </thead>\n        <tbody>\n          ${assignments
    .map((a) => {
      const classId =
          a.classId || a.class + (a.section ? "-" + a.section : "-A"),
        term = a.term || "HY";
      return `\n            <tr>\n              <td data-label="Class">${taEsc(classId)}</td>\n              <td data-label="Subject">${taEsc(a.subjectLabel)}</td>\n              <td data-label="Term">${"HY" === term ? "Half Yearly" : "Final Term"}</td>\n              <td data-label="Action">\n                <button class="tp-enter-marks-btn"\n                  data-class-id="${taEsc(classId)}"\n                  data-subject-key="${taEsc(a.subjectKey)}"\n                  data-term="${taEsc(term)}"\n                  onclick="tpOpenMarkEntry(this)">\n                  <i class="fas fa-pen"></i> Enter Marks →\n                </button>\n              </td>\n            </tr>`;
    })
    .join("")}\n        </tbody>\n      </table>\n    </div>`;
  const statSub = document.getElementById("t-stat-subjects");
  if (statSub) {
    const unique = [...new Set(assignments.map((a) => a.subjectLabel))];
    statSub.textContent =
      unique.slice(0, 2).join(", ") +
      (unique.length > 2 ? " +" + (unique.length - 2) : "");
  }
}
((window.initTeacherAssignments = function (teacherDocId, teacherData) {
  (renderTPAssignments(teacherData),
    _tpAssignUnsubscribe && _tpAssignUnsubscribe(),
    (_tpAssignUnsubscribe = onSnapshot(
      doc(db, "teachers", teacherDocId),
      (snap) => {
        if (!snap.exists()) return;
        (renderTPAssignments(snap.data()),
          window._tpAssignLoaded &&
            (function (msg) {
              const existing = document.querySelector(".tp-live-toast");
              existing && existing.remove();
              const el = document.createElement("div");
              ((el.className = "tp-live-toast"),
                (el.textContent = msg),
                document.body.appendChild(el),
                setTimeout(() => el.remove(), 4e3));
            })("📋 Your assignments have been updated."),
          (window._tpAssignLoaded = !0));
      },
      (err) => {
        console.warn("TP onSnapshot error:", err.message);
      },
    )));
}),
  (window.tpOpenMarkEntry = function (btn) {
    const classId = btn.dataset.classId,
      subjectKey = btn.dataset.subjectKey,
      term = btn.dataset.term || "HY";
    window.location.href = `/Sfs-report-card/markentry.html?classId=${classId}&subject=${subjectKey}&term=${term}&_t=${Date.now()}`;
  }));
const TA_ROMAN_TO_NUM = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
  },
  _origLoadTeacherPortal = window.loadTeacherPortal;
window.loadTeacherPortal = async function (user) {
  await _origLoadTeacherPortal(user);
  try {
    window._tpAssignLoaded = !1;
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) return;
    const userData = userDoc.data(),
      teacherId = userData.teacherId || userData.loginId || "";
    if (!teacherId) return;
    let newRole = userData.tpRole || null,
      rawCTOf = userData.tpClassTeacherOf || null,
      newAssigns = userData.tpAssignments || [];
    if (!newRole || !newAssigns.length)
      try {
        const mirrorSnap = await getDoc(doc(db, "teachers", user.uid));
        if (mirrorSnap.exists()) {
          const m = mirrorSnap.data();
          (newRole ||
            ((newRole = m.role || null), (rawCTOf = m.classTeacherOf || null)),
            newAssigns.length || (newAssigns = m.assignments || []));
        }
      } catch (ef) {}
    let teacherDocId = user.uid,
      profileData = {};
    try {
      let snap = await getDocs(
        query(collection(db, "teachers"), where("teacherId", "==", teacherId)),
      );
      (snap.empty &&
        (snap = await getDocs(
          query(
            collection(db, "teachers"),
            where("teacherId", "==", teacherId.toUpperCase()),
          ),
        )),
        snap.empty &&
          (snap = await getDocs(
            query(
              collection(db, "teachers"),
              where("teacherId", "==", teacherId.toLowerCase()),
            ),
          )),
        snap.empty ||
          ((teacherDocId = snap.docs[0].id),
          (profileData = snap.docs[0].data()),
          newRole ||
            ((newRole = profileData.role || null),
            (rawCTOf = profileData.classTeacherOf || null)),
          newAssigns.length || (newAssigns = profileData.assignments || [])));
    } catch (eq) {}
    const newCTOf = rawCTOf ? rawCTOf.split("-")[0] : null;
    if (!newRole)
      return void initTeacherAssignments(teacherDocId, {
        ...profileData,
        ...userData,
      });
    const classNum = (newCTOf && TA_ROMAN_TO_NUM[newCTOf]) || null,
      classDisplay = newCTOf ? `Class ${newCTOf}` : "—",
      uniqueSubjects = [...new Set(newAssigns.map((a) => a.subjectLabel))],
      subjectsStr = uniqueSubjects.join(", ") || "—",
      hdrRole = document.querySelector("#page-teacher-dash .dash-role");
    if (hdrRole) {
      const roleLabel =
        "class_teacher" === newRole
          ? "Class Teacher"
          : "admin" === newRole
            ? "Admin"
            : "Subject Teacher";
      hdrRole.textContent = `${"—" !== subjectsStr ? subjectsStr : roleLabel} · ${classDisplay}`;
    }
    const subtitle = document.getElementById("t-dash-subtitle");
    if (subtitle) {
      const roleLabel =
        "class_teacher" === newRole
          ? `Class Teacher – ${classDisplay}`
          : "admin" === newRole
            ? "Admin"
            : `Subject Teacher · ${classDisplay}`;
      subtitle.textContent = roleLabel;
    }
    const tStatClass = document.getElementById("t-stat-class");
    tStatClass && (tStatClass.textContent = classDisplay);
    const tStatSub = document.getElementById("t-stat-subjects");
    if (tStatSub) {
      const preview =
        uniqueSubjects.slice(0, 2).join(", ") +
        (uniqueSubjects.length > 2 ? " +" + (uniqueSubjects.length - 2) : "");
      tStatSub.textContent = preview || "—";
    }
    const tClassHd = document.getElementById("t-class-heading");
    tClassHd && (tClassHd.textContent = classDisplay);
    const tAttHd = document.getElementById("t-att-heading");
    if (
      (tAttHd && (tAttHd.textContent = classDisplay),
      "class_teacher" === newRole && classNum)
    ) {
      window._currentTeacherClass = classNum;
      const sSnap = await getDocs(
          query(
            collection(db, "students"),
            where("class", "==", String(classNum)),
            orderBy("rollNo"),
          ),
        ),
        tStatStu = document.getElementById("t-stat-students");
      (tStatStu && (tStatStu.textContent = sSnap.size),
        (window._teacherStudentDocs = sSnap.docs),
        "function" == typeof window.renderTeacherStudentList &&
          window.renderTeacherStudentList(sSnap.docs),
        "function" == typeof window.initTeacherAttendance &&
          window.initTeacherAttendance(classNum));
    } else if ("subject_teacher" === newRole) {
      window._currentTeacherClass = "";
      const tStatStu = document.getElementById("t-stat-students");
      tStatStu && (tStatStu.textContent = "—");
    }
    const tForPanel = {
      ...profileData,
      role: newRole,
      classTeacherOf: rawCTOf,
      assignments: newAssigns,
    };
    initTeacherAssignments(teacherDocId, tForPanel);
  } catch (e) {
    console.warn("Phase 2 assignments load:", e.message);
  }
};
const _origLogout = window.logout;
window.logout = function () {
  (_tpAssignUnsubscribe &&
    (_tpAssignUnsubscribe(), (_tpAssignUnsubscribe = null)),
    (window._tpAssignLoaded = !1),
    "function" == typeof _origLogout && _origLogout());
};
