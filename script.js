// ================================================================
//  St. Francis School — script.js  (Enhanced)
//  Features: auth guard, remember-me, enter-key login,
//            mobile UX, loading states, logout
// ================================================================

let currentRole   = 'student';
let isLoggedIn    = false;
let currentUserRole = null;

// ================================================================
//  showPage() — central router with auth guard
// ================================================================
function showPage(name) {
  const dashPages = ['student-dash', 'teacher-dash', 'admin-dash', 'office-dash'];
  if (dashPages.includes(name) && !isLoggedIn) {
    showToast('⚠️ Please login first.');
    name = 'home';
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const nav = document.getElementById('public-nav');
  if (nav) {
    nav.style.display = (dashPages.includes(name) || name === 'login') ? 'none' : 'block';
  }
  const el = document.getElementById('page-' + name);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);

  // Auto-focus login field when login page opens
  if (name === 'login') {
    setTimeout(() => {
      const userInput = document.getElementById('loginUser');
      if (userInput) userInput.focus();
      // Restore remembered login ID
      try {
        const remembered = localStorage.getItem('sf_remembered_id');
        const rememberCheck = document.getElementById('rememberMeCheck');
        if (remembered && userInput) {
          userInput.value = remembered;
          if (rememberCheck) rememberCheck.checked = true;
          // Focus password instead
          const passInput = document.getElementById('loginPass');
          if (passInput) passInput.focus();
        }
      } catch(e) {}
    }, 150);
  }
}

// ================================================================
//  Sub-pages
// ================================================================
function showSubPage(id) {
  document.querySelectorAll('.subpage').forEach(p => {
    p.classList.add('hidden');
    p.classList.remove('active');
  });
  document.querySelectorAll('.sub-nav-btn').forEach(b => {
    b.style.color             = 'var(--text-light)';
    b.style.borderBottomColor = 'transparent';
    b.style.fontWeight        = '600';
  });
  const sp = document.getElementById('subpage-' + id);
  if (sp) {
    sp.classList.remove('hidden');
    sp.classList.add('active');
  }
}

// ================================================================
//  Dashboard section switching
// ================================================================
function showDash(prefix, sectionId, btn) {
  document.querySelectorAll('[id^="' + prefix + '-"]').forEach(el => {
    if (el.classList.contains('dash-section')) el.classList.remove('active');
  });
  const sec = document.getElementById(sectionId);
  if (sec) sec.classList.add('active');
  if (btn) {
    const sidebar = btn.closest('.sidebar-nav');
    if (sidebar) sidebar.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }
  // Update dash title
  const titleEl = document.getElementById(prefix + '-dash-title');
  if (titleEl && btn) titleEl.textContent = btn.textContent.trim();
}

// Student bottom nav helpers
window.syncStudentBottomNav = function(sectionId) {
  document.querySelectorAll('#studentBottomNav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === sectionId);
  });
};
window.navStudentTo = function(sectionId) {
  const sidebarBtn = document.querySelector('#studentSidebar button[onclick*="' + sectionId + '"]');
  showDash('s', sectionId, sidebarBtn);
  window.syncStudentBottomNav(sectionId);
};

function adminInboxGo(sectionId, feeFilter) {
  const btn = document.querySelector('#adminSidebar button[onclick*="' + sectionId + '"]');
  showDash('a', sectionId, btn || null);
  if (feeFilter) {
    setTimeout(() => {
      const f = document.getElementById('a-fee-filter');
      if (f) { f.value = feeFilter; loadAdminFees(); }
    }, 150);
  }
  if (sectionId === 'a-leave') {
    setTimeout(() => loadAdminLeave(), 150);
  }
}

// ================================================================
//  Role tab
// ================================================================
function setRole(role, btn) {
  currentRole = role;
  document.querySelectorAll('.role-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

// ================================================================
//  loginAs() — called after successful Firebase auth
// ================================================================
function loginAs(role) {
  const cleanRole = role.toString().trim().toLowerCase();
  if (!['student', 'teacher', 'admin', 'office'].includes(cleanRole)) return;
  isLoggedIn      = true;
  currentUserRole = cleanRole;
  currentRole     = cleanRole;
  const loginPage = document.getElementById('page-login');
  if (loginPage) loginPage.classList.remove('active');
  if (cleanRole === 'student') {
    showPage('student-dash');
    setTimeout(() => { if (window.navStudentTo) window.navStudentTo('s-dashboard'); }, 50);
  } else if (cleanRole === 'teacher') showPage('teacher-dash');
  else if   (cleanRole === 'admin')   showPage('admin-dash');
  else if   (cleanRole === 'office')  showPage('office-dash');
}

// ================================================================
//  logout()
// ================================================================
function logout() {
  isLoggedIn      = false;
  currentUserRole = null;
  currentRole     = 'student';
  if (window._officeStatsUnsub) { window._officeStatsUnsub(); window._officeStatsUnsub = null; }
  if (window._hwUnsubscribe)    { window._hwUnsubscribe();    window._hwUnsubscribe    = null; }
  if (window._firebaseAuth) {
    import('https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js')
      .then(({ signOut }) => signOut(window._firebaseAuth).catch(console.error));
  }
  showToast('🔓 Logged out successfully.');
  setTimeout(() => showPage('home'), 500);
}

// ================================================================
//  Count-up animation for stat cards
// ================================================================
window.countUp = function(el, finalText, duration) {
  if (!el) return;
  duration = duration || 650;
  const match = String(finalText).match(/[\d,]+/);
  if (!match || finalText === '—') { el.textContent = finalText; return; }
  const raw    = parseFloat(match[0].replace(/,/g, ''));
  const idx    = finalText.indexOf(match[0]);
  const prefix = finalText.slice(0, idx);
  const suffix = finalText.slice(idx + match[0].length);
  let start = null;
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.round(raw * ease).toLocaleString('en-IN') + suffix;
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = finalText;
  }
  requestAnimationFrame(step);
};

// ================================================================
//  Mobile
// ================================================================
function toggleMobileMenu() {
  const m = document.getElementById('mobileMenu');
  if (m) m.classList.toggle('open');
}
function _getSidebarBackdrop() {
  let bd = document.getElementById('sidebar-backdrop');
  if (!bd) {
    bd = document.createElement('div');
    bd.id = 'sidebar-backdrop';
    bd.className = 'sidebar-backdrop';
    bd.addEventListener('click', _closeAllSidebars);
    document.body.appendChild(bd);
  }
  return bd;
}
function _closeAllSidebars() {
  ['studentSidebar','teacherSidebar','adminSidebar','officeSidebar'].forEach(id => {
    const sb = document.getElementById(id);
    if (sb) sb.classList.remove('open');
  });
  const bd = document.getElementById('sidebar-backdrop');
  if (bd) bd.classList.remove('visible');
}
function toggleSidebar(id) {
  const sb = document.getElementById(id);
  if (!sb) return;
  const isOpening = !sb.classList.contains('open');
  sb.classList.toggle('open');
  _getSidebarBackdrop().classList.toggle('visible', isOpening);
}

// ================================================================
//  Toast
// ================================================================
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ================================================================
//  Close sidebar on outside click (backdrop handles tap-outside on mobile)
// ================================================================
document.addEventListener('click', function(e) {
  const bd = document.getElementById('sidebar-backdrop');
  if (bd && bd.contains(e.target)) return; // backdrop click handled separately
  ['studentSidebar', 'teacherSidebar', 'adminSidebar', 'officeSidebar'].forEach(id => {
    const sb = document.getElementById(id);
    if (sb && sb.classList.contains('open')) {
      if (!sb.contains(e.target) && !e.target.classList.contains('sidebar-toggle')) {
        sb.classList.remove('open');
        if (bd) bd.classList.remove('visible');
      }
    }
  });
});

// ================================================================
//  Enter key → login trigger
// ================================================================
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    const loginPage = document.getElementById('page-login');
    if (loginPage && loginPage.classList.contains('active')) {
      const focused = document.activeElement;
      if (focused && (focused.id === 'loginUser' || focused.id === 'loginPass' || focused.id === 'rememberMeCheck')) {
        if (window.doLogin) window.doLogin();
      }
    }
  }
});

// ================================================================
//  Attendance helpers (used by teacher dashboard)
// ================================================================
function changeAttDate(delta) {
  const inp = document.getElementById('t-att-date');
  if (!inp) return;
  const d = new Date(inp.value + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  inp.value = d.toISOString().split('T')[0];
  window._attEditMode = false;
  if (window.loadAttendanceForDate) loadAttendanceForDate();
}

function markAllAttendance(status) {
  document.querySelectorAll('.att-radio[data-status="' + status + '"]').forEach(r => r.click());
}

// Stub functions — real implementations in Firebase module
window.loadAttendanceForDate   = window.loadAttendanceForDate   || function() {};
window.saveAttendance          = window.saveAttendance          || function() {};
window.loadAttendanceHistory   = window.loadAttendanceHistory   || function() {};
window.initTeacherAttendance   = window.initTeacherAttendance   || function() {};
window.loadHolidays            = window.loadHolidays            || function() {};
window.addHoliday              = window.addHoliday              || function() {};
window.seedTeachersIfNeeded    = window.seedTeachersIfNeeded    || async function() {};
window.loadTeachers            = window.loadTeachers            || function() {};
window.loadAdminDashboardStats = window.loadAdminDashboardStats || function() {};
window.loadStudentHomework     = window.loadStudentHomework     || function() {};
window.loadStudentNotices      = window.loadStudentNotices      || function() {};
window.loadStudentFees         = window.loadStudentFees         || function() {};
window.loadTeacherHomework     = window.loadTeacherHomework     || function() {};
window.loadTeacherNotices      = window.loadTeacherNotices      || function() {};
window.loadAdminNotices        = window.loadAdminNotices        || function() {};
window.loadAdminFees           = window.loadAdminFees           || function() {};
window.populateHwClassSelect   = window.populateHwClassSelect   || function() {};
window.loadAdminLeave          = window.loadAdminLeave          || function() {};
window.adminApproveLeave       = window.adminApproveLeave       || function() {};
window.adminRejectLeave        = window.adminRejectLeave        || function() {};
