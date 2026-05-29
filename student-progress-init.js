// ── Student Progress — Global Init Shim ──────────────────────────────────────
// Exposes loadStudentProgress as a global so the student sidebar button
// onclick in index.html can call it.

import { initStudentProgressView } from './student-progress-view.js';

window.loadStudentProgress = async function () {
  const section = document.getElementById('s-myprogress');
  if (!section) return;

  // Resolve the logged-in student's ID and class from globals set by app-logic.js.
  // app-logic.js stores class as raw Firestore value e.g. "1", "2", "LKG", "SKG"
  // The progress engine expects the full label e.g. "Class I", "Class II".
  const studentId  = window._studentId || null;
  const rawClass   = window._studentClass || '';
  const CLASS_MAP  = { '1': 'Class I', '2': 'Class II', 'LKG': 'LKG', 'SKG': 'SKG' };
  const studentClass = CLASS_MAP[rawClass] || rawClass || null;

  // Reset on each nav so fresh data is always fetched
  section.dataset.spInit = 'false';
  await initStudentProgressView(studentId, studentClass);
};

// ── My Progress nav visibility ───────────────────────────────────────────────
// The assessment system only covers LKG, SKG, Class I and Class II. Hide the
// "My Progress" sidebar tab for every other class (III–X) so those students
// don't see an empty section. app-logic.js stores the raw class on
// window._studentClass ("1","2","LKG","SKG", "3"…"10").
const ASSESSMENT_CLASSES = new Set(['LKG', 'SKG', '1', '2']);

function applyMyProgressVisibility() {
  const btn = document.getElementById('s-nav-myprogress');
  if (!btn) return;
  const cls = window._studentClass;
  if (cls == null || cls === '') return; // class not resolved yet — leave as-is
  btn.style.display = ASSESSMENT_CLASSES.has(String(cls)) ? '' : 'none';
}
window.applyMyProgressVisibility = applyMyProgressVisibility;

// Re-evaluate periodically so it applies after login and after switching
// accounts (both set window._studentClass asynchronously). Cheap + idempotent.
setInterval(applyMyProgressVisibility, 1000);
document.addEventListener('DOMContentLoaded', applyMyProgressVisibility);
