// ── Sidebar Swipe Gestures ────────────────────────────────────────────────────
// Real-time drag: sidebar follows the finger, snaps open/closed on release.
//
//   Swipe RIGHT from left edge (EDGE_ZONE px) → drag to open, snap on release
//   Swipe LEFT  while open                    → drag to close, snap on release
//   Tap backdrop                              → close (handled by script.js)
//
// touchmove is non-passive so we can prevent page scroll during a confirmed
// horizontal drag. touchstart/touchend remain passive.

(function () {
  const SIDEBAR_WIDTH   = 240;   // must match CSS .sidebar { width: 240px }
  const EDGE_ZONE       = 50;    // px from left edge that begins an open gesture
  const SNAP_RATIO      = 0.35;  // drag past 35% of sidebar width → snap open/close
  const VELOCITY_THRESH = 0.35;  // px/ms — fast flick always snaps regardless of distance

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
  let dragging  = false;  // true once confirmed horizontal
  let intent    = null;   // 'open' | 'close'
  let activeSb  = null;   // the sidebar being dragged

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

  // Disable CSS transition so sidebar tracks finger exactly
  function disableTransition(sb) { sb.style.transition = 'none'; }

  // Re-enable CSS transition for snap animation
  function enableTransition(sb)  { sb.style.transform = ''; sb.style.transition = ''; }

  // Move sidebar and backdrop in sync with finger
  function trackFinger(sb, dx) {
    const isOpen  = sb.classList.contains('open');
    const base    = isOpen ? 0 : -SIDEBAR_WIDTH;
    const raw     = base + dx;
    const clamped = Math.min(0, Math.max(-SIDEBAR_WIDTH, raw));
    sb.style.transform = `translateX(${clamped}px)`;

    // Backdrop opacity tracks progress (0 = hidden, 1 = fully visible)
    const progress = (clamped + SIDEBAR_WIDTH) / SIDEBAR_WIDTH;
    const bd = getBackdrop();
    if (bd) {
      if (progress > 0) {
        bd.style.display  = 'block';
        bd.style.opacity  = progress * 0.85;
        bd.style.animation = 'none';
        bd.classList.add('visible');
      } else {
        bd.style.opacity = '0';
      }
    }
  }

  function snapOpen(sb) {
    enableTransition(sb);
    sb.classList.add('open');
    const bd = getBackdrop();
    if (bd) {
      bd.style.opacity  = '';
      bd.style.animation = '';
      bd.classList.add('visible');
    }
  }

  function snapClose(sb) {
    enableTransition(sb);
    sb.classList.remove('open');
    const bd = getBackdrop();
    if (bd) {
      bd.style.opacity = '';
      bd.classList.remove('visible');
      setTimeout(() => { if (bd) bd.style.animation = ''; }, 300);
    }
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
      // Wait for enough movement to determine direction
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      // Vertical scroll — abandon
      if (Math.abs(dy) > Math.abs(dx)) { reset(); return; }
      // Wrong horizontal direction — abandon
      if (intent === 'open'  && dx <= 0) { reset(); return; }
      if (intent === 'close' && dx >= 0) { reset(); return; }
      dragging = true;
      disableTransition(activeSb);
    }

    // Confirmed horizontal drag — prevent page scroll
    e.preventDefault();
    trackFinger(activeSb, dx);
  }, { passive: false });

  document.addEventListener('touchend', function (e) {
    if (!activeSb) { reset(); return; }

    if (!dragging) {
      // Finger lifted without a confirmed drag — clean up any partial state
      reset();
      return;
    }

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
    if (activeSb) {
      // Restore to whichever state it was in before the drag
      intent === 'open' ? snapClose(activeSb) : snapOpen(activeSb);
    }
    reset();
  }, { passive: true });

})();
