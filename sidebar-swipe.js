// ── Sidebar Swipe Gestures ────────────────────────────────────────────────────
// Real-time drag: sidebar follows the finger, snaps open/closed on release.
//
//   Swipe RIGHT from left edge (EDGE_ZONE px) → drag to open, snap on release
//   Swipe LEFT  while open                    → drag to close, snap on release
//   Tap backdrop                              → close (handled by script.js)

(function () {
  const SIDEBAR_WIDTH   = 240;   // must match CSS .sidebar { width: 240px }
  const EDGE_ZONE       = 50;    // px from left edge that begins an open gesture
  const SNAP_RATIO      = 0.35;  // drag past 35% of sidebar width → snap
  const VELOCITY_THRESH = 0.35;  // px/ms — fast flick always snaps

  const SIDEBAR_IDS = ['studentSidebar', 'teacherSidebar', 'adminSidebar', 'officeSidebar'];
  const PAGE_MAP    = {
    'page-student-dash': 'studentSidebar',
    'page-teacher-dash': 'teacherSidebar',
    'page-admin-dash':   'adminSidebar',
    'page-office-dash':  'officeSidebar',
  };

  let startX    = 0;
  let startY    = 0;
  let startTime = 0;
  let dragging  = false;
  let intent    = null;   // 'open' | 'close'
  let activeSb  = null;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getOpenSidebar() {
    return SIDEBAR_IDS
      .map(id => document.getElementById(id))
      .find(sb => sb && sb.classList.contains('open')) || null;
  }

  function getSidebarForActivePage() {
    for (const [pageId, sbId] of Object.entries(PAGE_MAP)) {
      const p = document.getElementById(pageId);
      if (p && p.classList.contains('active')) return document.getElementById(sbId);
    }
    return null;
  }

  function getBackdrop() {
    return document.getElementById('sidebar-backdrop');
  }

  // Clear ALL inline backdrop styles so the CSS class system takes over cleanly.
  // Critical: backdrop-filter:blur stays active even at opacity:0 unless
  // display:none is restored, making the portal look hazy.
  function resetBackdrop() {
    const bd = getBackdrop();
    if (!bd) return;
    bd.style.cssText = ''; // wipe every inline style set during drag
  }

  function disableTransition(sb) { sb.style.transition = 'none'; }
  function enableTransition(sb)  { sb.style.transform = ''; sb.style.transition = ''; }

  // Move sidebar and fade backdrop in sync with finger
  function trackFinger(sb, dx) {
    const isOpen  = sb.classList.contains('open');
    const base    = isOpen ? 0 : -SIDEBAR_WIDTH;
    const clamped = Math.min(0, Math.max(-SIDEBAR_WIDTH, base + dx));
    sb.style.transform = `translateX(${clamped}px)`;

    const progress = (clamped + SIDEBAR_WIDTH) / SIDEBAR_WIDTH; // 0→1
    const bd = getBackdrop();
    if (bd) {
      if (progress > 0.01) {
        // Only show backdrop when meaningfully dragged open
        bd.style.display   = 'block';
        bd.style.opacity   = String(progress * 0.85);
        bd.style.animation = 'none';
        bd.style.backdropFilter       = `blur(${progress}px)`;
        bd.style.webkitBackdropFilter = `blur(${progress}px)`;
      } else {
        // Fully closed position — hide immediately so blur doesn't linger
        bd.style.display = 'none';
      }
    }
  }

  function snapOpen(sb) {
    enableTransition(sb);
    sb.classList.add('open');
    resetBackdrop();
    const bd = getBackdrop();
    if (bd) bd.classList.add('visible');
  }

  function snapClose(sb) {
    enableTransition(sb);
    sb.classList.remove('open');
    // Remove visible class FIRST, then wipe inline styles so CSS display:none
    // takes effect immediately — prevents the blur from lingering one more frame.
    const bd = getBackdrop();
    if (bd) bd.classList.remove('visible');
    resetBackdrop();
  }

  function reset() {
    dragging = false;
    intent   = null;
    activeSb = null;
  }

  // ── Touch handlers ───────────────────────────────────────────────────────────

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { reset(); return; }
    startX    = e.touches[0].clientX;
    startY    = e.touches[0].clientY;
    startTime = Date.now();
    dragging  = false;
    intent    = null;
    activeSb  = null;

    const openSb = getOpenSidebar();
    if (openSb) {
      activeSb = openSb;
      intent   = 'close';
    } else if (startX <= EDGE_ZONE) {
      activeSb = getSidebarForActivePage();
      intent   = 'open';
    }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!activeSb) return;

    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!dragging) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      if (Math.abs(dy) > Math.abs(dx))  { reset(); return; } // vertical scroll
      if (intent === 'open'  && dx <= 0) { reset(); return; }
      if (intent === 'close' && dx >= 0) { reset(); return; }
      dragging = true;
      disableTransition(activeSb);
    }

    e.preventDefault(); // lock out page scroll during horizontal drag
    trackFinger(activeSb, dx);
  }, { passive: false });

  document.addEventListener('touchend', function (e) {
    if (!activeSb || !dragging) { reset(); return; }

    const dx       = e.changedTouches[0].clientX - startX;
    const elapsed  = Math.max(1, Date.now() - startTime);
    const velocity = Math.abs(dx) / elapsed;
    const sb       = activeSb;
    const dir      = intent;
    reset();

    const fastFlick = velocity > VELOCITY_THRESH;

    if (dir === 'open') {
      (dx > SIDEBAR_WIDTH * SNAP_RATIO || fastFlick) ? snapOpen(sb) : snapClose(sb);
    } else {
      (-dx > SIDEBAR_WIDTH * SNAP_RATIO || fastFlick) ? snapClose(sb) : snapOpen(sb);
    }
  }, { passive: true });

  document.addEventListener('touchcancel', function () {
    if (activeSb && dragging) {
      // Restore whichever state it was in before the drag started
      intent === 'open' ? snapClose(activeSb) : snapOpen(activeSb);
    }
    reset();
  }, { passive: true });

})();
