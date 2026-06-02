// single-session-admin.js
// Admin "Devices & Logins" tracker: every (user, device) from device_registry —
// who uses the app, which device, first seen, last active, online status — plus
// a Force-logout button (non-admins) via the adminForceLogout Cloud Function.
// New file — does not edit app-logic.js.

(function () {
  var FS_URL  = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';
  var FNS_URL = 'https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js';
  var ONLINE_MS = 6 * 60 * 1000;

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function toDate(v) { try { return v && v.toDate ? v.toDate() : (v ? new Date(v) : null); } catch (e) { return null; } }
  function fmtWhen(v) {
    var d = toDate(v); if (!d || isNaN(d)) return '—';
    return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function ago(v) {
    var d = toDate(v); if (!d || isNaN(d)) return '—';
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  }
  function isOnline(v) { var d = toDate(v); return d && (Date.now() - d.getTime() < ONLINE_MS); }

  async function load() {
    var body = el('ss-admin-body');
    if (body) body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>';
    try {
      var m = await import(FS_URL);
      var db = m.getFirestore(window._firebaseApp);
      var regSnap = await m.getDocs(m.collection(db, 'device_registry'));
      var usersSnap = await m.getDocs(m.collection(db, 'users'));
      var users = {};
      usersSnap.forEach(function (d) { var u = d.data(); users[d.id] = { name: u.name || u.displayName || '(unnamed)', loginId: u.loginId || u.teacherId || u.studentId || '—' }; });

      var rows = [];
      regSnap.forEach(function (d) {
        var r = d.data() || {};
        var u = users[r.uid] || {};
        rows.push({
          uid: r.uid, name: r.name || u.name || '(unknown)', loginId: u.loginId || '—',
          role: r.role || '—', device: r.deviceLabel || r.platform || '—',
          first: r.firstSeenAt, lastSeen: r.lastSeenAt, online: isOnline(r.lastSeenAt),
        });
      });
      // Online first, then most-recently-seen.
      rows.sort(function (a, b) {
        if (a.online !== b.online) return a.online ? -1 : 1;
        var ta = toDate(a.lastSeen) || 0, tb = toDate(b.lastSeen) || 0;
        return (tb ? tb.getTime() : 0) - (ta ? ta.getTime() : 0);
      });

      var onlineCount = rows.filter(function (r) { return r.online; }).length;
      var html = rows.map(function (r) {
        var status = r.online
          ? '<span style="color:#1e8449;font-weight:600">● Online</span>'
          : '<span style="color:var(--text-light)">last seen ' + esc(ago(r.lastSeen)) + '</span>';
        var action = (r.role === 'admin' || r.role === 'super_admin')
          ? '<span style="color:var(--text-light);font-size:11px">—</span>'
          : '<button class="btn btn-sm btn-outline" style="font-size:11px;padding:4px 10px;color:var(--danger);border-color:var(--danger)" onclick="ssForceLogout(\'' + r.uid + '\',\'' + esc(r.name).replace(/'/g, '') + '\')"><i class="fas fa-right-from-bracket"></i> Force logout</button>';
        return '<tr>' +
          '<td>' + esc(r.name) + ' <span style="color:var(--text-light);font-size:11px">(' + esc(r.loginId) + ')</span></td>' +
          '<td>' + esc(r.role) + '</td>' +
          '<td style="font-size:12px;max-width:230px;white-space:normal">' + esc(r.device) + '</td>' +
          '<td style="font-size:12px">' + fmtWhen(r.first) + '</td>' +
          '<td style="font-size:12px">' + fmtWhen(r.lastSeen) + '</td>' +
          '<td style="font-size:12px">' + status + '</td>' +
          '<td>' + action + '</td>' +
        '</tr>';
      }).join('');

      if (body) body.innerHTML = html || '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--text-light)">No devices recorded yet.</td></tr>';
      var cnt = el('ss-admin-count');
      if (cnt) cnt.textContent = rows.length + ' device' + (rows.length === 1 ? '' : 's') + ' · ' + onlineCount + ' online now';
    } catch (e) {
      if (body) body.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--danger)">✗ ' + esc(e.message) + '</td></tr>';
    }
  }

  window.ssForceLogout = async function (uid, name) {
    if (!window.confirm('Force logout ' + name + '? Their device will be signed out within a couple of seconds.')) return;
    try {
      var m = await import(FNS_URL);
      var fns = m.getFunctions(window._firebaseApp, 'asia-south1');
      await m.httpsCallable(fns, 'adminForceLogout')({ uid: uid });
      window.showToast && window.showToast('✅ ' + name + ' has been logged out.');
      load();
    } catch (e) {
      window.showToast && window.showToast('⚠️ ' + (e.message || 'Failed'));
    }
  };

  window.loadActiveSessions = function () {
    var root = el('ss-admin-root');
    if (!root) return;
    if (!root.dataset.built) {
      root.dataset.built = '1';
      root.innerHTML =
        '<div class="card" style="padding:24px">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">' +
            '<div><h4 style="color:var(--accent-dark);margin:0"><i class="fas fa-mobile-screen-button" style="margin-right:8px;color:var(--accent)"></i>Devices &amp; Logins</h4>' +
            '<p style="font-size:13px;color:var(--text-light);margin:4px 0 0">Who uses the app, from which device. <span id="ss-admin-count"></span></p></div>' +
            '<button class="btn btn-sm btn-outline" onclick="loadActiveSessions()"><i class="fas fa-sync-alt"></i> Refresh</button>' +
          '</div>' +
          '<div class="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Device</th><th>First seen</th><th>Last active</th><th>Status</th><th>Action</th></tr></thead>' +
            '<tbody id="ss-admin-body"></tbody></table></div>' +
        '</div>';
    }
    load();
  };
})();
