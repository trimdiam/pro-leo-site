/* page-transitions.js — buttery smooth page navigation */
(function () {
  const DURATION = 280; // ms — fast enough to feel snappy, slow enough to feel smooth
  let _transitioning = false;

  function animatePageOut(el, done) {
    el.style.transition = `opacity ${DURATION}ms ease, transform ${DURATION}ms ease`;
    el.style.opacity = "0";
    el.style.transform = "translateY(12px)";
    setTimeout(() => {
      el.classList.remove("active");
      el.style.transition = "";
      el.style.opacity = "";
      el.style.transform = "";
      done();
    }, DURATION);
  }

  function animatePageIn(el) {
    el.style.opacity = "0";
    el.style.transform = "translateY(16px)";
    el.classList.add("active");
    // force reflow so the browser registers the start state
    void el.offsetHeight;
    el.style.transition = `opacity ${DURATION}ms ease, transform ${DURATION}ms ease`;
    el.style.opacity = "1";
    el.style.transform = "translateY(0)";
    setTimeout(() => {
      el.style.transition = "";
      el.style.opacity = "";
      el.style.transform = "";
      _transitioning = false;
    }, DURATION);
  }

  function patchShowPage() {
    if (typeof window.showPage !== "function") {
      setTimeout(patchShowPage, 50);
      return;
    }

    const _orig = window.showPage;

    window.showPage = function (name) {
      if (_transitioning) return;

      const current = document.querySelector(".page.active");
      const next = document.getElementById("page-" + name);

      // If no current page or same page, just call original
      if (!current || !next || current === next) {
        _orig(name);
        return;
      }

      _transitioning = true;

      animatePageOut(current, () => {
        // Let the original function handle nav visibility, scroll, body classes etc.
        _orig(name);
        // Then animate the new page in (orig already added .active)
        animatePageIn(next);
        window.scrollTo({ top: 0, behavior: "instant" });
      });
    };
  }

  document.addEventListener("DOMContentLoaded", patchShowPage);
})();
