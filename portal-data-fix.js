// portal-data-fix.js
// Probes Firestore until reads succeed, then calls loadTeacherPortal.
// No timing guesses — proves the auth/token is working before proceeding.

(function () {
  var _fired = false;
  var MAX_PROBE = 10;
  var DELAY_MS  = [400, 800, 1200, 1800, 2500, 3500, 4500, 5500, 6500, 7500];

  function log(msg) { console.log('[portal-fix]', msg); }

  function isLoading() {
    var el = document.getElementById('t-dash-schedule');
    return !el || el.innerHTML.indexOf('Loading') !== -1 || el.innerHTML.indexOf('fa-spin') !== -1;
  }

  async function probe(user, fs, db) {
    try {
      var snap = await fs.getDoc(fs.doc(db, 'users', user.uid));
      return { ok: true, snap: snap };
    } catch (e) {
      return { ok: false, error: e };
    }
  }

  async function loadPortal(auth) {
    if (_fired) return;
    var user = auth.currentUser;
    if (!user) return;

    var db = window.db || window._firestoreDb;
    if (!db) return;

    var fs = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');

    var snap = null;
    for (var i = 0; i < MAX_PROBE; i++) {
      try { await user.getIdToken(true); } catch (_) {}
      var r = await probe(user, fs, db);
      if (r.ok) { snap = r.snap; log('ready after ' + (i + 1) + ' probe(s)'); break; }
      await new Promise(function (res) { setTimeout(res, DELAY_MS[i] || 8000); });
    }
    if (!snap || !snap.exists()) { log('no user doc / Firestore unreachable'); return; }

    var role = (snap.data().role || '').toLowerCase();
    if (role !== 'teacher' && role !== 'class_teacher' && role !== 'subject_teacher') return;
    if (!isLoading()) return;

    _fired = true;
    log('calling loadTeacherPortal for role=' + role);
    if (typeof window.loadTeacherPortal === 'function') {
      try { await window.loadTeacherPortal(user); } catch (e) { log('load failed: ' + e.message); }
    }
  }

  function attach(auth) {
    if (auth._pfixApplied) return;
    auth._pfixApplied = true;
    import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js').then(function (m) {
      m.onAuthStateChanged(auth, function (user) { if (user) loadPortal(auth); });
    });
  }

  var retries = 0;
  var poll = setInterval(function () {
    if (window._firebaseAuth) { clearInterval(poll); attach(window._firebaseAuth); }
    if (++retries > 200) clearInterval(poll);
  }, 100);
})();
