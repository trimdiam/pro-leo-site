(function () {
  const STORAGE_KEY = "sfs-theme";
  const root = document.documentElement;

  function applyTheme(dark) {
    root.setAttribute("data-theme", dark ? "dark" : "light");
    updateThemeButtons(dark);
  }

  function updateThemeButtons(dark) {
    const lightBtn = document.getElementById("theme-btn-light");
    const darkBtn = document.getElementById("theme-btn-dark");
    if (!lightBtn || !darkBtn) return;
    const active = "background:var(--accent);color:#fff;border-radius:8px;";
    const inactive = "background:transparent;color:var(--text-light);";
    lightBtn.style.cssText = lightBtn.style.cssText.replace(/background:[^;]+;color:[^;]+;border-radius:[^;]+;|background:transparent;color:[^;]+;/g, "") + (dark ? inactive : active);
    darkBtn.style.cssText = darkBtn.style.cssText.replace(/background:[^;]+;color:[^;]+;border-radius:[^;]+;|background:transparent;color:[^;]+;/g, "") + (dark ? active : inactive);
  }

  window.setTheme = function (theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme === "dark");
  };

  // Keep for any legacy callers
  window.toggleDarkMode = function () {
    const isDark = root.getAttribute("data-theme") === "dark";
    window.setTheme(isDark ? "light" : "dark");
  };

  window.openSettings = function () {
    const panel = document.getElementById("settings-panel");
    const overlay = document.getElementById("settings-overlay");
    if (!panel || !overlay) return;
    panel.style.display = "flex";
    overlay.style.display = "block";
    requestAnimationFrame(() => { panel.style.transform = "translateX(0)"; });
    updateThemeButtons(root.getAttribute("data-theme") === "dark");
  };

  window.closeSettings = function () {
    const panel = document.getElementById("settings-panel");
    const overlay = document.getElementById("settings-overlay");
    if (!panel || !overlay) return;
    panel.style.transform = "translateX(100%)";
    overlay.style.display = "none";
    setTimeout(() => { panel.style.display = "none"; }, 300);
  };

  // Apply saved preference before first paint
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    applyTheme(saved === "dark");
  } else {
    applyTheme(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }

  // Sync button states after DOM ready
  document.addEventListener("DOMContentLoaded", function () {
    updateThemeButtons(root.getAttribute("data-theme") === "dark");
  });
})();
