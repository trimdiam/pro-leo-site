/* smooth-ux.js — tap ripple effect + haptic feedback */
(function () {
  function spawnRipple(el, e) {
    const rect = el.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const x = (touch.clientX - rect.left);
    const y = (touch.clientY - rect.top);

    const wave = document.createElement("span");
    wave.className = "ripple-wave";
    wave.style.left = x + "px";
    wave.style.top = y + "px";
    el.appendChild(wave);
    setTimeout(() => wave.remove(), 520);
  }

  function haptic() {
    try {
      if (navigator.vibrate) navigator.vibrate(8); // 8ms — subtle, not annoying
    } catch (e) {}
  }

  const RIPPLE_SELECTORS = [
    "button",
    ".btn",
    ".card[onclick]",
    ".sidebar-nav button",
    "#studentBottomNav button",
    "#teacherBottomNav button",
    ".mobile-menu button",
    ".nav-links li button",
  ].join(", ");

  function attachRipple(el) {
    if (el.dataset.rippleAttached) return;
    el.dataset.rippleAttached = "1";
    el.classList.add("ripple-host");

    el.addEventListener("pointerdown", function (e) {
      spawnRipple(this, e);
      haptic();
    }, { passive: true });
  }

  function initRipples() {
    document.querySelectorAll(RIPPLE_SELECTORS).forEach(attachRipple);
  }

  // Attach to existing elements on load
  document.addEventListener("DOMContentLoaded", initRipples);

  // Attach to dynamically added elements (dashboards load content after login)
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches(RIPPLE_SELECTORS)) attachRipple(node);
        node.querySelectorAll && node.querySelectorAll(RIPPLE_SELECTORS).forEach(attachRipple);
      });
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Lazy image fade-in
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
      if (img.complete) {
        img.classList.add("loaded");
      } else {
        img.addEventListener("load", function () {
          img.classList.add("loaded");
        });
      }
    });
  });
})();
