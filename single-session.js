// single-session.js
// TWO jobs:
//  (1) Device tracking — records every (user, device) in device_registry
//      (firstSeen / lastLogin / lastSeen / platform / label) for ALL roles,
//      so the admin can see who uses the app, from which device, and when.
//  (2) Single active session — non-admins get one active login (newest device
//      wins): a device claims sessions/{uid} and watches it; if another device
//      claims the account, this (older) device force-logs-out. Admins are exempt
//      from (2) but still tracked by (1).
// New file — does not edit app-logic.js.

(function () {
  var AUTH_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
  var FS_URL   = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
  var SID_KEY  = 'sfs_sessionId';
  var DEV_KEY  = 'sfs_deviceId';
  var HEARTBEAT_MS = 5 * 60 * 1000;

  var unsub = null;
  var loggingOut = false;
  var claiming = {};
  var heartbeat = null;
  var _fs = null, _db = null;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function deviceId() {
    var d = localStorage.getItem(DEV_KEY);
    if (!d) { d = uuid(); localStorage.setItem(DEV_KEY, d); }
    return d;
  }
  function platform() {
    try { if (window.Capacitor) return (window.Capacitor.getPlatform && window.Capacitor.getPlatform()) || 'app'; } catch (e) {}
    return 'web';
  }
  function deviceLabel() {
    var model = localStorage.getItem('sfs_deviceModel');
    if (model) return (platform() + ' · ' + model).slice(0, 120);
    var ua = navigator.userAgent || '';
    var m = ua.match(/\(([^)]+)\)/);
    return (platform() + ' · ' + (m ? m[1] : ua)).slice(0, 120);
  }
  function regId(uid) { return uid + '_' + deviceId(); }

  function detach() { if (unsub) { try { unsub(); } catch (e) {} unsub = null; } }
  function stopHeartbeat() { if (heartbeat) { clearInterval(heartbeat); heartbeat = null; } }

  // ── Device tracking ───────────────────────────────────────────────────────
  async function upsertRegistry(uid, role, name, bumpLogin) {
    try {
      var ref = _fs.doc(_db, 'device_registry', regId(uid));
      var snap = await _fs.getDoc(ref);
      var data = {
        uid: uid, name: name || '', role: role || '',
        deviceId: deviceId(), deviceLabel: deviceLabel(), platform: platform(),
        lastSeenAt: _fs.serverTimestamp(),
      };
      if (!snap.exists()) data.firstSeenAt = _fs.serverTimestamp();
      if (bumpLogin) data.lastLoginAt = _fs.serverTimestamp();
      await _fs.setDoc(ref, data, { merge: true });
    } catch (e) { console.warn('[tracking] registry write failed:', e && e.message); }
  }

  function startHeartbeat(uid, role, name) {
    stopHeartbeat();
    heartbeat = setInterval(function () {
      if (document.visibilityState === 'visible') upsertRegistry(uid, role, name, false);
    }, HEARTBEAT_MS);
  }

  // ── Single-session enforcement ─────────────────────────────────────────────
  async function forceLogout(msg) {
    if (loggingOut) return;
    loggingOut = true;
    detach(); stopHeartbeat();
    localStorage.removeItem(SID_KEY);
    try { window.showToast && window.showToast(msg); } catch (e) {}
    setTimeout(function () {
      try { if (typeof window.logout === 'function') window.logout(); } catch (e) {}
      loggingOut = false;
    }, 1200);
  }

  async function claim(uid) {
    var sid = uuid();
    localStorage.setItem(SID_KEY, sid);
    await _fs.setDoc(_fs.doc(_db, 'sessions', uid), {
      sessionId: sid, deviceId: deviceId(), deviceLabel: deviceLabel(),
      platform: platform(), loginAt: _fs.serverTimestamp(),
    });
    return sid;
  }

  function subscribe(uid) {
    detach();
    unsub = _fs.onSnapshot(_fs.doc(_db, 'sessions', uid), function (snap) {
      if (!snap.exists()) return;
      var r = snap.data() || {};
      var localSid = localStorage.getItem(SID_KEY);
      if (r.sessionId && localSid && r.sessionId !== localSid) {
        forceLogout('🔒 Signed out — your account was used on another device.');
      }
    }, function () {});
  }

  async function onSignedIn(uid) {
    if (claiming[uid]) return;
    claiming[uid] = true;
    try {
      var roleSnap = await _fs.getDoc(_fs.doc(_db, 'users', uid));
      var role = roleSnap.exists() ? (roleSnap.data().role || '') : '';
      var name = roleSnap.exists() ? (roleSnap.data().name || roleSnap.data().displayName || '') : '';
      var localSid = localStorage.getItem(SID_KEY);
      var freshLogin = !localSid;

      // Admins: tracked, but exempt from single-session enforcement.
      if (role === 'admin' || role === 'super_admin') {
        if (freshLogin) localStorage.setItem(SID_KEY, uuid()); // marker so reloads aren't counted as logins
        detach();
        await upsertRegistry(uid, role, name, freshLogin);
        startHeartbeat(uid, role, name);
        return;
      }

      // Non-admins: enforce one active session.
      var sessSnap = await _fs.getDoc(_fs.doc(_db, 'sessions', uid));
      var remote = sessSnap.exists() ? (sessSnap.data() || {}) : null;
      var didClaim = false;
      if (!remote || !remote.sessionId) { await claim(uid); didClaim = true; }
      else if (remote.sessionId === localSid) { /* own it */ }
      else if (localSid) { return void forceLogout('🔒 Signed out — your account was used on another device.'); }
      else { await claim(uid); didClaim = true; }
      subscribe(uid);

      await upsertRegistry(uid, role, name, freshLogin || didClaim);
      startHeartbeat(uid, role, name);
    } catch (e) {
      console.warn('[single-session] failed:', e && e.message);
    } finally {
      claiming[uid] = false;
    }
  }

  // Normal logout clears our local session id so the next login mints fresh.
  var _origLogout = window.logout;
  window.logout = function () {
    if (!loggingOut) localStorage.removeItem(SID_KEY);
    detach(); stopHeartbeat();
    if (typeof _origLogout === 'function') return _origLogout.apply(this, arguments);
  };

  // Inside the APK, prefer the native (stable) device identifier so a storage
  // clear doesn't look like a brand-new device. Resolves once and caches into
  // the SAME localStorage keys the sync helpers read, BEFORE auth runs. No-ops
  // on web / older APKs without the Device plugin.
  function resolveNativeDeviceId() {
    return new Promise(function (resolve) {
      try {
        var C = window.Capacitor, P = C && C.Plugins, Dev = P && P.Device;
        if (!Dev || !Dev.getId) return resolve();
        var jobs = [];
        jobs.push(Dev.getId().then(function (r) {
          var id = r && (r.identifier || r.uuid);
          if (id) localStorage.setItem(DEV_KEY, 'nat-' + id);
        }).catch(function () {}));
        if (Dev.getInfo) jobs.push(Dev.getInfo().then(function (i) {
          var label = [i && i.manufacturer, i && i.model].filter(Boolean).join(' ');
          if (label) localStorage.setItem('sfs_deviceModel', label);
        }).catch(function () {}));
        Promise.all(jobs).then(function () { resolve(); });
      } catch (e) { resolve(); }
    });
  }

  function start() {
    resolveNativeDeviceId().then(function () {
      Promise.all([import(AUTH_URL), import(FS_URL)]).then(function (mods) {
        var a = mods[0]; _fs = mods[1];
        var auth = window._firebaseAuth || a.getAuth(window._firebaseApp);
        _db = _fs.getFirestore(window._firebaseApp);
        a.onAuthStateChanged(auth, function (user) {
          if (!user) { detach(); stopHeartbeat(); return; }
          onSignedIn(user.uid);
        });
      }).catch(function (e) { console.warn('[single-session] init failed:', e && e.message); });
    });
  }

  var tries = 0;
  var iv = setInterval(function () {
    if (window._firebaseApp) { clearInterval(iv); start(); }
    else if (++tries > 80) clearInterval(iv);
  }, 150);
})();
