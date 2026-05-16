/* ============================================================
   NOTIFICATION CENTER — notification-center.js
   Self-contained module for the Student Dashboard.

   USAGE (with mock data — works immediately):
     NotificationCenter.render();

   USAGE (with real Firestore data):
     onSnapshot(noticesQuery, (snap) => {
       const notices = snap.docs.map(d => ({ id: d.id, ...d.data() }));
       NotificationCenter.render(realStudentData, notices);
     });

   The studentData shape:
   {
     attendance: { todayStatus, percentage, present, absent, total },
     fees:       { isPaid, amount, term, dueDate, paidAmount, upiId },
     exams:      [{ subject, type, date }]   // date as 'YYYY-MM-DD'
   }

   The notices shape:
   [{ message, isUrgent, tag, date }]   // date as 'YYYY-MM-DD'
============================================================ */

window.NotificationCenter = (() => {

  // Tracks whether render() has fired with real (auth-bound) data
  // so the DOMContentLoaded mock fallback doesn't overwrite it.
  let _hasRendered = false;


  /* ----------------------------------------------------------
     MOCK DATA
     Mirrors real Firestore document shapes — swap for live
     onSnapshot() listeners whenever you are ready.
  ---------------------------------------------------------- */
  // Empty defaults — shown only as a fallback when real auth-bound data
  // is unavailable. No hardcoded numbers; everything reads "—" / 0.
  const _mock = {
    studentData: {
      attendance: { todayStatus: 'present', percentage: 0, present: 0, absent: 0, total: 0 },
      fees:       { isPaid: true, amount: 0, term: 'Current Term', dueDate: '', paidAmount: 0, upiId: 'stfrancisschool@upi' },
      exams:      []
    },
    notices: []
  };

  /* ----------------------------------------------------------
     HELPERS
  ---------------------------------------------------------- */
  function _daysUntil(dateStr) {
    const today  = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr + 'T00:00:00');
    return Math.ceil((target - today) / 86400000);
  }

  function _fmt(dateStr) {
    return new Date(dateStr + 'T00:00:00')
      .toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function _todayLong() {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  function _todayMedium() {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
  }

  /* ----------------------------------------------------------
     RENDER: NOTICE BANNER
  ---------------------------------------------------------- */
  function _renderNoticeBanner(notices) {
    const card = document.getElementById('nc-notice-banner');
    if (!card) return;

    if (!notices || !notices.length) {
      card.style.display = 'none';
      return;
    }

    card.style.display = '';
    const n = notices[0];
    card.classList.toggle('nc-urgent', !!n.isUrgent);

    const tagClass = n.isUrgent ? 'nc-tag-urgent' : '';
    const tagIcon  = n.isUrgent
      ? '<i class="fas fa-circle" style="font-size:7px"></i> Urgent'
      : '<i class="fas fa-info-circle" style="font-size:10px"></i> ' + (n.tag || 'Notice');
    const bellIcon = n.isUrgent ? 'exclamation-triangle' : 'bullhorn';

    card.innerHTML =
      '<div class="nc-notice-icon"><i class="fas fa-' + bellIcon + '"></i></div>' +
      '<div class="nc-notice-content">' +
        '<div class="nc-notice-tag ' + tagClass + '">' + tagIcon + '</div>' +
        '<div class="nc-notice-message" title="' + _esc(n.message) + '">' + _esc(n.message) + '</div>' +
        '<div class="nc-notice-date"><i class="fas fa-clock" style="margin-right:4px;opacity:.55"></i>Posted ' + _fmt(n.date) + '</div>' +
      '</div>' +
      (notices.length > 1
        ? '<div class="nc-notice-more">+' + (notices.length - 1) + ' more</div>'
        : '');
  }

  /* ----------------------------------------------------------
     RENDER: ATTENDANCE CARD
  ---------------------------------------------------------- */
  function _renderAttendanceCard(att) {
    const card = document.getElementById('nc-attendance-card');
    if (!card) return;

    const s     = att.todayStatus || 'present';
    const icons = { present: 'check-circle', absent: 'times-circle', late: 'clock' };
    const icon  = icons[s] || 'question-circle';
    const label = s.charAt(0).toUpperCase() + s.slice(1);
    const pct   = att.percentage || 0;

    card.classList.remove('nc-status-present', 'nc-status-absent', 'nc-status-late');
    card.classList.add('nc-status-' + s);

    const barClass = pct >= 85 ? 'nc-att-bar-fill'
                   : pct >= 75 ? 'nc-att-bar-fill warning'
                   : 'nc-att-bar-fill danger';

    card.innerHTML =
      '<div class="nc-card-label"><i class="fas fa-calendar-check"></i> Attendance</div>' +
      '<div class="nc-att-body">' +
        '<div class="nc-att-status-badge ' + s + '">' +
          '<i class="fas fa-' + icon + '"></i>' +
          '<span>' + label + '</span>' +
        '</div>' +
        '<div class="nc-att-info">' +
          '<div class="nc-att-title">Today\'s Status</div>' +
          '<div class="nc-att-subtitle">' + _todayMedium() + '</div>' +
          '<div class="nc-att-stats">' +
            '<div class="nc-att-stat"><div class="nc-att-stat-val green">' + att.present + '</div><div class="nc-att-stat-lbl">Present</div></div>' +
            '<div class="nc-att-stat"><div class="nc-att-stat-val red">'   + att.absent  + '</div><div class="nc-att-stat-lbl">Absent</div></div>'  +
            '<div class="nc-att-stat"><div class="nc-att-stat-val brown">' + pct + '%</div><div class="nc-att-stat-lbl">Overall</div></div>' +
          '</div>' +
          '<div class="nc-att-bar-label">' +
            '<span>Attendance Progress</span>' +
            '<span>' + pct + '% of ' + att.total + ' days</span>' +
          '</div>' +
          '<div class="nc-att-bar-track">' +
            '<div class="' + barClass + '" style="width:' + pct + '%"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  /* ----------------------------------------------------------
     RENDER: EXAM / UNIT TEST CARD
  ---------------------------------------------------------- */
  function _renderExamCard(exams) {
    const card = document.getElementById('nc-exam-card');
    if (!card) return;

    card.innerHTML = '<div class="nc-card-label"><i class="fas fa-file-alt"></i> Upcoming Tests</div>';

    const upcoming = (exams || [])
      .map(e => Object.assign({}, e, { daysUntil: _daysUntil(e.date) }))
      .filter(e => e.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 3);

    if (!upcoming.length) {
      card.innerHTML += '<div class="nc-exam-empty"><i class="fas fa-check-circle" style="color:var(--success);margin-right:6px"></i>No upcoming tests.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'nc-exam-list';

    upcoming.forEach(exam => {
      const d     = new Date(exam.date + 'T00:00:00');
      const day   = d.getDate();
      const month = d.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
      const urgent  = exam.daysUntil <= 3;
      const warning = exam.daysUntil <= 7 && !urgent;

      const cdClass = urgent ? 'urgent' : warning ? 'warning' : 'normal';
      const cdText  = exam.daysUntil === 0 ? 'TODAY'
                    : exam.daysUntil === 1 ? 'Tomorrow'
                    : exam.daysUntil + 'd left';

      const item = document.createElement('div');
      item.className = 'nc-exam-item' + (urgent ? ' nc-exam-urgent' : '');
      item.innerHTML =
        '<div class="nc-exam-date-box' + (urgent ? ' urgent' : '') + '">' +
          '<div class="nc-exam-day">'   + day   + '</div>' +
          '<div class="nc-exam-month">' + month + '</div>' +
        '</div>' +
        '<div class="nc-exam-info">' +
          '<div class="nc-exam-subject">' + _esc(exam.subject) + '</div>' +
          '<div class="nc-exam-type">'    + _esc(exam.type)    + '</div>' +
        '</div>' +
        '<div class="nc-exam-countdown ' + cdClass + '">' + cdText + '</div>';
      list.appendChild(item);
    });

    card.appendChild(list);
  }

  /* ----------------------------------------------------------
     RENDER: FEE STATUS CARD
  ---------------------------------------------------------- */
  function _renderFeeCard(fee) {
    const card = document.getElementById('nc-fee-card');
    if (!card) return;

    card.classList.remove('nc-fee-paid', 'nc-fee-unpaid');
    card.classList.add(fee.isPaid ? 'nc-fee-paid' : 'nc-fee-unpaid');

    const pillClass   = fee.isPaid ? 'paid'  : 'unpaid';
    const pillIcon    = fee.isPaid ? 'check-circle' : 'exclamation-circle';
    const pillLabel   = fee.isPaid ? 'Paid'  : 'Payment Pending';
    const paidAmt     = (fee.paidAmount || 0).toLocaleString('en-IN');
    const totalAmt    = (fee.amount     || 0).toLocaleString('en-IN');

    const upiBlock = fee.isPaid ? '' :
      '<button class="nc-upi-btn" onclick="NotificationCenter.handleUPI(\'' +
        _esc(fee.upiId) + '\',' + fee.amount + ')">' +
        '<i class="fas fa-mobile-alt"></i> Pay via UPI' +
      '</button>';

    card.innerHTML =
      '<div class="nc-card-label"><i class="fas fa-money-bill-wave"></i> Fee Status</div>' +
      '<div class="nc-fee-status-pill ' + pillClass + '">' +
        '<i class="fas fa-' + pillIcon + '"></i> ' + pillLabel +
      '</div>' +
      '<div class="nc-fee-amount">&#x20B9;' + totalAmt + '</div>' +
      '<div class="nc-fee-amount-label">' + _esc(fee.term) + '</div>' +
      '<div class="nc-fee-detail"><span>Due Date</span><span class="nc-fee-val">' + _fmt(fee.dueDate) + '</span></div>' +
      '<div class="nc-fee-detail"><span>Paid</span><span class="nc-fee-val">&#x20B9;' + paidAmt + '</span></div>' +
      upiBlock;
  }

  /* ----------------------------------------------------------
     XSS GUARD — escape before injecting into innerHTML
  ---------------------------------------------------------- */
  function _esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ----------------------------------------------------------
     PUBLIC API
  ---------------------------------------------------------- */

  /**
   * render(studentData?, notices?)
   * Call with no arguments to use built-in mock data.
   * Call with real Firestore data to display live information.
   */
  function render(studentData, notices) {
    _hasRendered = true;
    const sd = studentData || _mock.studentData;
    const n  = notices     || _mock.notices;

    const dateEl = document.getElementById('nc-today-date');
    if (dateEl) dateEl.textContent = _todayLong();

    _renderNoticeBanner(n);
    _renderAttendanceCard(sd.attendance);
    _renderExamCard(sd.exams);
    _renderFeeCard(sd.fees);
  }

  /**
   * handleUPI(upiId, amount)
   * Wire this up to your real payment gateway.
   * Currently shows a toast and logs to console.
   */
  function handleUPI(upiId, amount) {
    const displayAmt = Number(amount).toLocaleString('en-IN');
    if (typeof showToast === 'function') {
      showToast('<i class="fas fa-mobile-alt"></i> Opening UPI for &#x20B9;' + displayAmt + '…');
    }
    // Uncomment to open a UPI deep-link on mobile:
    // window.location.href = 'upi://pay?pa=' + upiId + '&am=' + amount + '&cu=INR';
    console.log('[NotificationCenter] UPI initiated:', { upiId, amount });
  }

  return {
    render,
    handleUPI,
    get hasRendered() { return _hasRendered; }
  };

})();

/* Mock data is rendered ONLY as a fallback after a brief delay.
   If the host app calls NotificationCenter.render(realData, realNotices)
   first — typically from inside an onAuthStateChanged() callback —
   the mock fallback is skipped, so personalized auth-bound data is
   never overwritten by mock data. */
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    if (!window.NotificationCenter.hasRendered) {
      window.NotificationCenter.render();
    }
  }, 1500);
});
