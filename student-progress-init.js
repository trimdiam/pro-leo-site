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
