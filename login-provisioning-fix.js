// login-provisioning-fix.js
// ROOT-CAUSE FIX for duplicate user docs. Overrides the admin's
// createTeacherLogin / createStudentLogin so they call the idempotent
// `provisionLogin` Cloud Function (Admin SDK) instead of the old client REST
// account-creation that orphaned docs on every delete-recreate cycle.
// New file (does not edit app-logic.js). Re-applies on load so it always wins
// over the original definitions regardless of script order.

(function () {
  var FNS_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js';

  function toast(m) { if (window.showToast) window.showToast(m); }
  function txt(id) { var e = document.getElementById(id); return e ? (e.value != null && e.value !== '' ? e.value : (e.textContent || '')) : ''; }

  async function provision(payload) {
    var m = await import(FNS_URL);
    var fns = m.getFunctions(window._firebaseApp, 'asia-south1');
    var res = await m.httpsCallable(fns, 'provisionLogin')(payload);
    return res.data || {};
  }

  function cleanedNote(res) {
    var n = res && res.removedOrphans;
    return n ? ' (cleaned ' + n + ' old record' + (n > 1 ? 's' : '') + ')' : '';
  }

  function newTeacherLogin() {
    return async function () {
      var tid = (txt('tlm-tid') || '').trim();
      var password = ((document.getElementById('tlm-password') || {}).value ||
        (document.getElementById('tlm-new-password') || {}).value || '').trim();
      if (!tid || !password) return void toast('⚠️ Teacher ID and password required.');
      if (password.length < 6) return void toast('⚠️ Password must be at least 6 characters.');
      var btn = document.getElementById('tlm-create-btn');
      if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; btn.disabled = true; }
      try {
        var res = await provision({ loginId: tid, password: password, role: 'teacher',
          name: (document.getElementById('tlm-name') || {}).textContent || tid });
        if (document.getElementById('tlm-done-tid'))  document.getElementById('tlm-done-tid').textContent = tid;
        if (document.getElementById('tlm-done-pass')) document.getElementById('tlm-done-pass').textContent = password;
        if (document.getElementById('tlm-success-box')) document.getElementById('tlm-success-box').style.display = 'block';
        if (document.getElementById('tlm-actions'))     document.getElementById('tlm-actions').style.display = 'none';
        toast('✅ Teacher login ready!' + cleanedNote(res));
      } catch (e) { toast('❌ ' + (e.message || 'Failed')); }
      finally { if (btn) { btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Login Account'; btn.disabled = false; } }
    };
  }

  function newStudentLogin() {
    return async function () {
      var sid = ((document.getElementById('slm-sid') || {}).value || '').trim();
      var password = ((document.getElementById('slm-password') || {}).value ||
        (document.getElementById('slm-new-password') || {}).value || '').trim();
      if (!sid || !password) return void toast('⚠️ Student ID and password required.');
      if (password.length < 6) return void toast('⚠️ Password must be at least 6 characters.');
      var btn = document.getElementById('slm-create-btn');
      if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...'; btn.disabled = true; }
      try {
        var res = await provision({ loginId: sid, password: password, role: 'student',
          name: (document.getElementById('slm-name') || {}).textContent || sid });
        if (document.getElementById('slm-done-sid'))  document.getElementById('slm-done-sid').textContent = sid;
        if (document.getElementById('slm-done-pass')) document.getElementById('slm-done-pass').textContent = password;
        if (document.getElementById('slm-success-box')) document.getElementById('slm-success-box').style.display = 'block';
        if (document.getElementById('slm-actions'))     document.getElementById('slm-actions').style.display = 'none';
        toast('✅ Student login ready!' + cleanedNote(res));
      } catch (e) { toast('❌ ' + (e.message || 'Failed')); }
      finally { if (btn) { btn.innerHTML = '<i class="fas fa-user-plus"></i> Create Login Account'; btn.disabled = false; } }
    };
  }

  function apply() {
    window.createTeacherLogin = newTeacherLogin();
    window.createStudentLogin = newStudentLogin();
  }

  apply();                                   // immediate
  window.addEventListener('load', apply);    // re-apply so we win over app-logic.js (module)
})();
