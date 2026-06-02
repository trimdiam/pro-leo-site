// teacher-export.js
// Admin tool: download a CSV of every teacher's Name + Login ID, plus a default
// password column the admin types at download time.
// IMPORTANT: passwords are NOT read from Firebase (they are stored hashed and
// cannot be retrieved). The Password column is simply the value YOU type in the
// prompt — it is only accurate if that is the password actually set on the
// accounts. Leaving the prompt blank exports Name + Login ID only.
// New feature => new file (does not edit app-logic.js).

(function () {
  var FS_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

  function csvEscape(v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  // Save the CSV: native share sheet in the APK, anchor download on the web.
  function saveCsv(filename, csv) {
    var withBom = '﻿' + csv; // BOM so Excel reads UTF-8 correctly
    var C = window.Capacitor, P = C && C.Plugins;
    var isNative = !!(C && (typeof C.isNativePlatform === 'function' ? C.isNativePlatform() : C.isNative));
    var Fs = P && P.Filesystem, Sh = P && P.Share;
    if (isNative && Fs && Fs.writeFile && Sh && Sh.share) {
      Fs.writeFile({ path: filename, data: withBom, encoding: 'utf8', directory: 'CACHE' })
        .then(function (w) { return Sh.share({ title: filename, url: w.uri, files: [w.uri], dialogTitle: 'Teacher logins' }); })
        .catch(function () {});
      return;
    }
    var blob = new Blob([withBom], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  window.downloadTeacherLogins = async function () {
    var pwd = window.prompt(
      'Default password to list for every teacher?\n\n' +
      'Leave blank to export Name + Login ID only.\n' +
      'NOTE: this does NOT change any password — it only fills the Password ' +
      'column with what you type here.', '');
    if (pwd === null) return; // cancelled

    var btn = document.getElementById('dl-teacher-logins'), orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Building…'; }
    try {
      var fs = await import(FS_URL);
      var db = fs.getFirestore(window._firebaseApp);
      var snap = await fs.getDocs(fs.collection(db, 'teachers'));
      var rows = [];
      snap.forEach(function (d) {
        var t = d.data() || {};
        var name = t.name || t.fullName || '';
        var loginId = t.teacherId || t.loginId || d.id;
        if (!name && !loginId) return;
        rows.push({ name: name, loginId: loginId });
      });
      rows.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      if (!rows.length) { window.showToast && window.showToast('⚠️ No teachers found.'); return; }

      var header = pwd ? 'Name,Login ID,Password' : 'Name,Login ID';
      var lines = rows.map(function (r) {
        return pwd
          ? csvEscape(r.name) + ',' + csvEscape(r.loginId) + ',' + csvEscape(pwd)
          : csvEscape(r.name) + ',' + csvEscape(r.loginId);
      });
      var csv = header + '\n' + lines.join('\n') + '\n';
      var today = new Intl.DateTimeFormat('en-CA').format(new Date());
      saveCsv('Teacher_Logins_' + today + '.csv', csv);
      window.showToast && window.showToast('✅ Exported ' + rows.length + ' teacher logins.');
    } catch (e) {
      window.showToast && window.showToast('⚠️ ' + (e.message || 'Export failed'));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = orig || '<i class="fas fa-download"></i> Download Logins'; }
    }
  };
})();
