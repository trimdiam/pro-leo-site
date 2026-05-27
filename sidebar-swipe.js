// ── Sidebar Swipe Gestures ────────────────────────────────────────────────────
// Adds mobile swipe-to-open / swipe-to-close for all portal sidebars.
//
//   Swipe RIGHT (starting within EDGE_ZONE px of left edge) → open sidebar
//   Swipe LEFT  (anywhere, while sidebar is open)            → close sidebar
//   Tap backdrop                                             → close (handled by script.js)
//
// Uses passive touch listeners — no scroll jank.

(function () {
  const SWIPE_THRESHOLD = 50;  // min horizontal px to register as a swipe
  const EDGE_ZONE       = 50;  // px from left edge that starts an open gesture
  const SIDEBARS = [
    'studentSidebar',
    'teacherSidebar',
    'adminSidebar',
    'officeSidebar',
  ];

  let startX   = 0;
  let startY   = 0;
  let tracking = false;

  function getOpenSidebar() {
    return SIDEBARS
      .map(id => document.getElementById(id))
      .find(sb => sb && sb.classList.contains('open')) || null;
  }

  function openSidebarForActivePage() {
    const map = {
      'page-student-dash': 'studentSidebar',
      'page-teacher-dash': 'teacherSidebar',
      'page-admin-dash':   'adminSidebar',
      'page-office-dash':  'officeSidebar',
    };
    for (const [pageId, sidebarId] of Object.entries(map)) {
      const page = document.getElementById(pageId);
      if (page && page.classList.contains('active')) {
        if (typeof toggleSidebar === 'function') toggleSidebar(sidebarId);
        return;
      }
    }
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { tracking = false; return; }
    startX   = e.touches[0].clientX;
    startY   = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!tracking) return;
    tracking = false;
    if (e.changedTouches.length !== 1) return;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx   = endX - startX;
    const dy   = endY - startY;

    // Ignore mostly-vertical swipes (scrolling)
    if (Math.abs(dy) > Math.abs(dx)) return;
    // Ignore tiny movements
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    const openSb = getOpenSidebar();

    if (dx > 0 && !openSb && startX <= EDGE_ZONE) {
      // Right swipe from left edge — open
      openSidebarForActivePage();
    } else if (dx < 0 && openSb) {
      // Left swipe while sidebar open — close
      if (typeof _closeAllSidebars === 'function') _closeAllSidebars();
    }
  }, { passive: true });
})();
