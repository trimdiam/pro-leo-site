// ── Report Card Admin — Global Init Shim ─────────────────────────────────────
// Exposes initReportCardAdmin as a global so inline onclick handlers in
// index.html can call it. Called when admin navigates to the Report Cards tab.

import { initReportCardAdmin } from './report-card-admin.js';

window.loadAdminReportCardsNew = async function () {
  const section = document.getElementById('a-reportcards');
  if (!section) return;

  // Only init once per navigation — re-init on explicit refresh inside the panel
  if (section.dataset.rcAdminInit === 'true') return;
  section.dataset.rcAdminInit = 'true';

  await initReportCardAdmin();
};

// Auto-wire: when the existing sidebar button fires loadAdminReportCards(),
// also trigger our new panel after a tick so the section is visible.
const _originalLoad = window.loadAdminReportCards;
window.loadAdminReportCards = function (...args) {
  if (typeof _originalLoad === 'function') _originalLoad(...args);
  // Reset init flag so panel refreshes on each sidebar click
  const section = document.getElementById('a-reportcards');
  if (section) section.dataset.rcAdminInit = 'false';
  setTimeout(() => window.loadAdminReportCardsNew(), 50);
};
