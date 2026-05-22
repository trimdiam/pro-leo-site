// routine-push-test.js
// Admin-only: manually trigger period-end push notifications for a given period.

(function () {
  window.initRoutinePushTest = function () {
    var container = document.getElementById('routine-push-test-ui');
    if (!container) return;

    container.innerHTML = [
      '<div style="background:var(--glass-bg);border:1.5px solid var(--border);border-radius:14px;padding:20px 20px 16px">',
        '<h5 style="margin:0 0 4px;color:var(--accent-dark);font-size:14px"><i class="fas fa-bell" style="margin-right:8px;color:var(--accent)"></i>Manual Period Reminder</h5>',
        '<p style="font-size:12px;color:var(--text-light);margin:0 0 14px">Send push notifications to teachers whose next period is about to start.</p>',
        '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">',
          '<select id="rpt-period-select" style="padding:8px 12px;border:1.5px solid var(--primary);border-radius:8px;font-family:var(--font-body);font-size:13px;background:var(--surface);color:var(--text);cursor:pointer">',
            '<option value="">— Period that just ended —</option>',
            '<option value="1">Period 1 ended → notify for Period 2</option>',
            '<option value="2">Period 2 ended → notify for Period 3</option>',
            '<option value="3">Period 3 ended → notify for Period 4</option>',
            '<option value="4">Period 4 ended → notify for Period 5</option>',
            '<option value="5">Period 5 ended → notify for Period 6</option>',
          '</select>',
          '<button id="rpt-send-btn" onclick="sendRoutinePush()" style="padding:8px 18px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap">',
            '<i class="fas fa-paper-plane" style="margin-right:6px"></i>Send Now',
          '</button>',
        '</div>',
        '<p id="rpt-status" style="margin:10px 0 0;font-size:12px;min-height:18px"></p>',
      '</div>',
    ].join('');
  };

  window.sendRoutinePush = function () {
    var period = Number(document.getElementById('rpt-period-select').value);
    var status = document.getElementById('rpt-status');
    var btn    = document.getElementById('rpt-send-btn');
    if (!period) { status.style.color = 'var(--danger)'; status.textContent = 'Please select a period first.'; return; }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right:6px"></i>Sending…';
    status.style.color = 'var(--text-light)';
    status.textContent = 'Calling cloud function…';

    Promise.all([
      import('https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js'),
    ]).then(function (mods) {
      var getFunctions = mods[0].getFunctions;
      var httpsCallable = mods[0].httpsCallable;
      var app = window._firebaseApp;
      if (!app) throw new Error('Firebase app not ready');
      var functions = getFunctions(app, 'asia-south1');
      var fn = httpsCallable(functions, 'triggerPeriodReminder');
      return fn({ period: period });
    }).then(function (res) {
      status.style.color = 'var(--success)';
      status.textContent = '✓ Sent ' + res.data.sent + ' notification(s). ' + (res.data.failed ? res.data.failed + ' failed.' : '');
    }).catch(function (e) {
      status.style.color = 'var(--danger)';
      status.textContent = '✗ ' + (e.message || 'Unknown error');
    }).finally(function () {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane" style="margin-right:6px"></i>Send Now';
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { window.initRoutinePushTest && window.initRoutinePushTest(); });
  } else {
    window.initRoutinePushTest && window.initRoutinePushTest();
  }
})();
