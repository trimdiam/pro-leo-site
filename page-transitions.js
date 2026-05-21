/* page-transitions.js — CSS-class-driven transitions (no stuck inline styles on mobile) */
(function () {

  // Inject the animation CSS once
  const style = document.createElement("style");
  style.textContent = `
    @keyframes _sfPageIn {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .sf-page-entering {
      animation: _sfPageIn 240ms ease forwards;
    }
  `;
  document.head.appendChild(style);

  function patchShowPage() {
    if (typeof window.showPage !== "function") {
      setTimeout(patchShowPage, 50);
      return;
    }

    const _orig = window.showPage;

    window.showPage = function (name) {
      // Always call the original — it handles nav, scroll, auth guards, body classes
      _orig(name);

      // After orig sets up the new page, apply the enter animation
      const next = document.getElementById("page-" + name);
      if (!next) return;

      // Remove any leftover animation class, then re-add to retrigger
      next.classList.remove("sf-page-entering");
      void next.offsetHeight; // force reflow
      next.classList.add("sf-page-entering");

      // Clean up class after animation so it doesn't interfere later
      setTimeout(() => next.classList.remove("sf-page-entering"), 260);
    };
  }

  document.addEventListener("DOMContentLoaded", patchShowPage);
})();
