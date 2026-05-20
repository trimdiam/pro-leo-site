// ── Report Card Student — Global Init Shim ───────────────────────────────────
// Exposes loadStudentReportCards as a global so the student sidebar button
// onclick in index.html can call it.

import { initReportCardStudentView } from './report-card-student-view.js';

window.loadStudentReportCards = async function () {
  const section = document.getElementById('s-reportcards');
  if (!section) return;

  // Resolve the logged-in student's ID from the global set by app-logic.js
  const studentId = window._studentId || null;

  // Reset on each nav so fresh data is fetched
  section.dataset.rcStudentInit = 'false';
  await initReportCardStudentView(studentId);
};
