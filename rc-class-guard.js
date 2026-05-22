// rc-class-guard.js
// 1. Flags misrouted student records in the Class III-X control panel.
// 2. Provides a "Clean Misrouted Records" button to delete them from Firestore.

(function () {

  var INT_TO_ROMAN = { 1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII',9:'IX',10:'X' };

  function toRoman(val) {
    var n = parseInt(val);
    return (!isNaN(n) && INT_TO_ROMAN[n]) ? INT_TO_ROMAN[n] : String(val).split('-')[0].trim().toUpperCase();
  }

  async function getDb() {
    var { getFirestore } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    return getFirestore(window._firebaseApp);
  }

  // ── Add "Clean Misrouted Records" button once the panel is visible ──────────
  function injectCleanButton() {
    var panel = document.getElementById('a-reportcards');
    if (!panel || panel.querySelector('#arc-clean-btn')) return;

    var statusMsg = panel.querySelector('#arc-status-msg');
    if (!statusMsg) return;

    var btn = document.createElement('button');
    btn.id = 'arc-clean-btn';
    btn.className = 'btn btn-sm';
    btn.style.cssText = 'background:#ef4444;color:#fff;border:none;margin-left:10px;font-size:12px;padding:5px 12px;border-radius:7px;cursor:pointer';
    btn.innerHTML = '<i class="fas fa-trash-alt"></i> Clean Misrouted Records';
    btn.title = 'Scan ALL class marks and delete any student records filed under the wrong class.';
    btn.onclick = runCleanup;

    statusMsg.parentNode.insertBefore(btn, statusMsg.nextSibling);
  }

  // ── Scan every marks/{class}_{term} path and delete misrouted docs ──────────
  async function runCleanup() {
    var btn = document.getElementById('arc-clean-btn');
    if (!btn) return;
    if (!confirm('This will scan all class marks collections and permanently delete any student records filed under the wrong class. Continue?')) return;

    btn.disabled = true;
    btn.textContent = 'Scanning…';

    var deleted = 0, errors = 0;

    try {
      var { collection, getDocs, doc, getDoc, deleteDoc } =
        await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
      var db = await getDb();

      var ROMAN_CLASSES = ['I','II','III','IV','V','VI','VII','VIII','IX','X'];
      var TERMS = ['HY','FT'];

      for (var ci = 0; ci < ROMAN_CLASSES.length; ci++) {
        var cls = ROMAN_CLASSES[ci];
        var expectedArabic = String(ci + 1); // "I"→"1", "IX"→"9"

        for (var ti = 0; ti < TERMS.length; ti++) {
          var term = TERMS[ti];
          var path = 'marks/' + cls + '_' + term + '/students';

          try {
            var snap = await getDocs(collection(db, path));
            for (var di = 0; di < snap.docs.length; di++) {
              var d = snap.docs[di];
              var studentId = d.id;

              // Look up actual student class
              try {
                var sSnap = await getDoc(doc(db, 'students', studentId));
                if (!sSnap.exists()) continue;
                var actualArabic = String(sSnap.data().class || '').trim();
                if (!actualArabic) continue;

                if (actualArabic !== expectedArabic) {
                  // Wrong class — delete this marks doc
                  await deleteDoc(doc(db, path, studentId));
                  console.log('[rc-clean] Deleted misrouted record:', path + '/' + studentId,
                    '(actual class: ' + actualArabic + ', was in: ' + cls + ')');
                  deleted++;
                }
              } catch (e) {
                errors++;
              }
            }
          } catch (e) {
            // Collection may not exist — skip
          }
        }
      }

      var msg = 'Done. Deleted ' + deleted + ' misrouted record(s).';
      if (errors) msg += ' (' + errors + ' lookup errors — check console.)';
      alert(msg);
      window.showToast && window.showToast(msg);

      // Refresh the panel
      window.loadAdminReportCards && window.loadAdminReportCards();

    } catch (e) {
      alert('Cleanup failed: ' + e.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-trash-alt"></i> Clean Misrouted Records';
      }
    }
  }

  // ── Post-load mismatch highlighting ────────────────────────────────────────
  function patchLoadAdminReportCards() {
    var orig = window.loadAdminReportCards;
    if (typeof orig !== 'function') { setTimeout(patchLoadAdminReportCards, 100); return; }

    window.loadAdminReportCards = async function () {
      await orig.apply(this, arguments);
      injectCleanButton();
      await checkClassMismatches();
    };
  }

  async function checkClassMismatches() {
    var tbody = document.getElementById('arc-tbody');
    var rawId = document.getElementById('arc-class-select')?.value;
    if (!tbody || !rawId) return;

    var selectedClass = rawId.split('-')[0].trim().toUpperCase();
    if (!selectedClass) return;

    var studentIds = [];
    tbody.querySelectorAll('button[onclick*="arcViewReportCard"]').forEach(function (btn) {
      var m = btn.getAttribute('onclick').match(/arcViewReportCard\('([^']+)'/);
      if (m) studentIds.push(m[1]);
    });
    if (!studentIds.length) return;

    try {
      var { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
      var db = await getDb();

      for (var i = 0; i < studentIds.length; i++) {
        var sid = studentIds[i];
        try {
          var snap = await getDoc(doc(db, 'students', sid));
          if (!snap.exists()) continue;
          var actualRoman = toRoman(snap.data().class || '');
          if (!actualRoman || actualRoman === selectedClass) continue;

          tbody.querySelectorAll('button[onclick*="arcViewReportCard"]').forEach(function (btn) {
            var m = btn.getAttribute('onclick').match(/arcViewReportCard\('([^']+)'/);
            if (!m || m[1] !== sid) return;
            var tr = btn.closest('tr');
            if (!tr || tr.querySelector('.arc-class-mismatch')) return;

            var warn = document.createElement('span');
            warn.className = 'arc-class-mismatch';
            warn.style.cssText = 'display:inline-block;margin-left:6px;padding:2px 7px;background:#fef3c7;color:#b45309;border-radius:6px;font-size:11px;font-weight:600;border:1px solid #fbbf24';
            warn.textContent = '⚠ Wrong class (actually Class ' + actualRoman + ')';
            var nameTd = tr.querySelectorAll('td')[1];
            if (nameTd) nameTd.appendChild(warn);

            var relBtn = tr.querySelector('button[onclick*="arcReleaseOne"]');
            if (relBtn) { relBtn.disabled = true; relBtn.style.opacity = '0.4'; relBtn.title = 'Cannot release — wrong class'; }
          });
        } catch (e) { /* skip */ }
      }
    } catch (e) {
      console.warn('[rc-class-guard]', e.message);
    }
  }

  patchLoadAdminReportCards();

})();
