// ── Report Card Generator UI ──────────────────────────────────────────────────
// Admin panel component for triggering report card generation.
// Supports generating for an entire class or a single student.

import { buildAndSaveReportCard } from '../services/report-card-builder.js';
import { loadStudentsForClass } from '../services/student-loader.js';
import { getCurrentAcademicYear, getTermDateRange } from '../services/report-card-grade-engine.js';
import { syncSessionsFromFirestore } from '../services/session-storage.js';
import { syncClassTestsFromFirestore } from '../services/class-test-storage.js';
import { syncCoScholasticFromFirestore } from '../services/coscholastic-service.js';

// Everything a report card is built from is read out of a local cache, so a
// stale or empty cache produces a card that is quietly wrong rather than one
// that fails. Co-scholastic was missing from this list entirely: its only other
// sync sits on the teacher's Co-Scholastic screen, which an admin can never
// open (the nav button is behind isTeacher()), so an admin generating cards had
// an empty co-scholastic cache and buildCoScholasticSection returned '' — the
// strip vanished from the card with no error.
//
// Failures used to be swallowed with console.warn and generation carried on.
// That reintroduced exactly the silent omission the sync exists to prevent, so
// a failure now aborts the run and says which source could not be reached.
async function syncBeforeGenerate() {
  const sources = [
    ['assessment sessions', syncSessionsFromFirestore],
    ['class tests',         syncClassTestsFromFirestore],
    ['co-scholastic grades', syncCoScholasticFromFirestore]
  ];
  const failed = [];
  await Promise.all(sources.map(async ([label, sync]) => {
    try {
      // strict — all three swallow errors by default and return the local
      // cache, so without this the abort below could never fire.
      await sync({ strict: true });
    } catch (err) {
      failed.push(`${label} (${err.message || 'unknown error'})`);
    }
  }));
  return failed;
}

function syncFailureMessage(failed) {
  return `❌ Could not sync ${failed.join('; ')}. Report cards are built from the ` +
    `local cache, so generating now could silently leave data off the card. ` +
    `Check the connection and try again.`;
}

const CLASSES = ['LKG', 'SKG', 'Class I', 'Class II'];
const TERM_KEYS = ['HY1', 'HY2'];

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Builds the dropdown label from the live term date range instead of a fixed
// string, so it can't drift out of sync when getTermDateRange() gets a
// one-off yearly exception (as it did for 2026-27's Mar–Jun/Jul–Nov terms).
function termOptionLabel(termKey) {
  const { dateFrom, dateTo, termLabel } = getTermDateRange(termKey);
  const fromMonth = MONTH_ABBR[Number(dateFrom.slice(5, 7)) - 1];
  const toMonth   = MONTH_ABBR[Number(dateTo.slice(5, 7)) - 1];
  return `${termLabel} (${fromMonth} – ${toMonth})`;
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function select(className, options, value) {
  const s = document.createElement('select');
  s.className = className;
  options.forEach(({ val, label }) => {
    const o = document.createElement('option');
    o.value = val;
    o.textContent = label;
    if (val === value) o.selected = true;
    s.append(o);
  });
  return s;
}

// ── Result row ────────────────────────────────────────────────────────────────

function appendResultRow(container, displayName, status, error, onRetry, subjectsPendingReview) {
  // Remove existing row for same student if regenerating
  const existing = container.querySelector(`[data-student-name="${CSS.escape(displayName)}"]`);
  if (existing) existing.remove();

  const row = el('div', 'rc-result-row');
  row.dataset.studentName = displayName;

  const nameSpan  = el('span', 'rc-result-name', displayName);
  const statusSpan = el('span', `rc-result-status ${status === 'ok' ? 'rc-ok' : status === 'skip' ? 'rc-skip' : 'rc-error'}`);

  if (status === 'ok')   statusSpan.textContent = '✅ Generated';
  if (status === 'skip') statusSpan.textContent = '⚠ No sessions found';
  if (status === 'error') statusSpan.textContent = `❌ ${error || 'Error'}`;

  row.append(nameSpan, statusSpan);

  // Data-completeness warning: marks exist for these subjects but their
  // sessions aren't reviewed/locked yet, so they were excluded (shown as
  // Exempt/No Data on the card) rather than actually scored. Without this,
  // that distinction is invisible to whoever is about to release the card.
  if (status === 'ok' && subjectsPendingReview && subjectsPendingReview.length > 0) {
    const warnSpan = el('span', 'rc-result-warning',
      `⚠ Unreviewed sessions excluded: ${subjectsPendingReview.join(', ')}`);
    row.append(warnSpan);
  }

  if (status === 'error' && onRetry) {
    const retryBtn = el('button', 'rc-retry-btn', 'Retry');
    retryBtn.type = 'button';
    retryBtn.addEventListener('click', async () => {
      retryBtn.disabled = true;
      statusSpan.textContent = '⏳ Retrying…';
      statusSpan.className = 'rc-result-status';
      const r = await onRetry();
      if (r.ok) {
        statusSpan.textContent = '✅ Generated';
        statusSpan.className = 'rc-result-status rc-ok';
        retryBtn.remove();
      } else {
        statusSpan.textContent = `❌ ${r.error || 'Error'}`;
        statusSpan.className = 'rc-result-status rc-error';
        retryBtn.disabled = false;
      }
    });
    row.append(retryBtn);
  }

  container.prepend(row); // latest results appear at the top
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Creates the Report Card generator UI panel for the admin section.
 * @param {object} opts
 * @param {string[]} [opts.classes]
 * @param {object}   [opts.currentUser]
 * @returns {HTMLElement}
 */
export function createReportCardGeneratorUI({ classes = CLASSES, currentUser = {} } = {}) {
  const section = el('section', 'panel rc-generator-panel');

  section.append(el('h2', 'panel-title', 'Report Card Generator'));
  section.append(el('p', 'panel-desc', 'Generate half-yearly report cards as drafts. Release them from the pro-leo-site admin panel when ready.'));

  // ── Controls ──────────────────────────────────────────────────────────────

  const controls = el('div', 'rc-controls');

  // Class selector
  const classLabel = el('label', 'rc-label', 'Class');
  const classSelect = select('rc-select', [
    { val: '', label: '— Select class —' },
    ...classes.map(c => ({ val: c, label: c }))
  ], '');
  classLabel.append(classSelect);
  controls.append(classLabel);

  // Term selector
  const termLabel = el('label', 'rc-label', 'Term');
  const termSelect = select('rc-select', [
    { val: '', label: '— Select term —' },
    ...TERM_KEYS.map(key => ({ val: key, label: termOptionLabel(key) }))
  ], '');
  termLabel.append(termSelect);
  controls.append(termLabel);

  // Academic year (auto)
  const yearLabel = el('label', 'rc-label', 'Academic Year');
  yearLabel.append(el('div', 'rc-year-display', getCurrentAcademicYear()));
  controls.append(yearLabel);

  // Date range (auto-filled on term change)
  const rangeLabel = el('label', 'rc-label', 'Date Range');
  const rangeDisplay = el('div', 'rc-range-display', '—');
  rangeLabel.append(rangeDisplay);
  controls.append(rangeLabel);

  section.append(controls);

  termSelect.addEventListener('change', () => {
    const t = termSelect.value;
    rangeDisplay.textContent = t ? (() => { const r = getTermDateRange(t); return `${r.dateFrom} → ${r.dateTo}`; })() : '—';
    studentSelect.value = '';
  });

  // ── Student selector (single-student mode) ────────────────────────────────

  const studentRow = el('div', 'rc-student-row');

  const studentLabel = el('label', 'rc-label', 'Generate for single student');
  const studentSelect = document.createElement('select');
  studentSelect.className = 'rc-select';
  studentSelect.style.minWidth = '240px';
  studentSelect.innerHTML = '<option value="">— Select class first —</option>';
  studentLabel.append(studentSelect);
  studentRow.append(studentLabel);

  const singleBtn = el('button', 'rc-generate-btn rc-single-btn', '▶ Generate for This Student');
  singleBtn.type = 'button';
  singleBtn.disabled = true;
  studentRow.append(singleBtn);

  section.append(studentRow);

  // Attendance — typed in directly, same procedure as Sfs-report-card's
  // Class III-X mark-entry form (hyPresent/hyTotalDays): no automated
  // attendance_daily/attendance_monthly pull for this class of card either.
  // Single-student only — there's no reasonable one-click way to enter 50+
  // students' individual attendance for the bulk "Generate for Entire Class"
  // path, same as Class III-X has no bulk mode at all (one form per student).
  const attRow = el('div', 'rc-student-row');

  const presentLabel = el('label', 'rc-label', 'Present Days (optional)');
  const presentInput = document.createElement('input');
  presentInput.type = 'number';
  presentInput.min = '0';
  presentInput.className = 'rc-select rc-narrow-input';
  presentInput.placeholder = 'e.g. 92';
  presentLabel.append(presentInput);
  attRow.append(presentLabel);

  const workingLabel = el('label', 'rc-label', 'Total Working Days (optional)');
  const workingInput = document.createElement('input');
  workingInput.type = 'number';
  workingInput.min = '0';
  workingInput.className = 'rc-select rc-narrow-input';
  workingInput.placeholder = 'e.g. 100';
  workingLabel.append(workingInput);
  attRow.append(workingLabel);

  section.append(attRow);

  // Load students into dropdown when class changes
  let _students = [];

  classSelect.addEventListener('change', async () => {
    const cls = classSelect.value;
    studentSelect.innerHTML = '<option value="">— Loading… —</option>';
    studentSelect.disabled = true;
    singleBtn.disabled = true;

    if (!cls) {
      studentSelect.innerHTML = '<option value="">— Select class first —</option>';
      return;
    }

    try {
      _students = await loadStudentsForClass(cls);
      studentSelect.innerHTML = '<option value="">— Select a student —</option>';
      _students.forEach(s => {
        const o = document.createElement('option');
        o.value = s.student_id;
        o.textContent = `${s.roll_no ? s.roll_no + '. ' : ''}${s.full_name}`;
        studentSelect.append(o);
      });
      studentSelect.disabled = false;
    } catch (err) {
      studentSelect.innerHTML = `<option value="">Error loading students</option>`;
      console.error(err);
    }
  });

  studentSelect.addEventListener('change', () => {
    singleBtn.disabled = !studentSelect.value || !termSelect.value;
  });
  termSelect.addEventListener('change', () => {
    singleBtn.disabled = !studentSelect.value || !termSelect.value;
  });

  // ── Divider ───────────────────────────────────────────────────────────────

  const divider = el('div', 'rc-divider');
  divider.innerHTML = '<span>or</span>';
  section.append(divider);

  // ── Generate entire class button ──────────────────────────────────────────

  const classBtn = el('button', 'rc-generate-btn', '▶▶ Generate for Entire Class');
  classBtn.type = 'button';
  section.append(classBtn);

  // ── Progress + results ────────────────────────────────────────────────────

  const progressArea = el('div', 'rc-progress-area');
  progressArea.style.display = 'none';
  section.append(progressArea);

  const resultsList = el('div', 'rc-results-list');
  section.append(resultsList);

  // ── Shared generate helper ────────────────────────────────────────────────

  function getParams() {
    const selectedClass = classSelect.value;
    const selectedTerm  = termSelect.value;
    if (!selectedClass) { alert('Please select a class.'); return null; }
    if (!selectedTerm)  { alert('Please select a term.'); return null; }
    const { dateFrom, dateTo } = getTermDateRange(selectedTerm);
    return {
      className:    selectedClass,
      term:         selectedTerm,
      academicYear: getCurrentAcademicYear(),
      dateFrom,
      dateTo,
      generatedBy:  currentUser?.displayName || currentUser?.email || 'Admin'
    };
  }

  function readAttendanceInputs() {
    const present = presentInput.value.trim();
    const working = workingInput.value.trim();
    return {
      attendancePresentDays: present === '' ? null : parseInt(present, 10),
      attendanceWorkingDays: working === '' ? null : parseInt(working, 10)
    };
  }

  async function runForStudent(student, params, attendance = {}) {
    return buildAndSaveReportCard({ studentId: student.student_id, ...params, ...attendance });
  }

  // ── Single student handler ────────────────────────────────────────────────

  singleBtn.addEventListener('click', async () => {
    const params = getParams();
    if (!params) return;

    const studentId = studentSelect.value;
    const student   = _students.find(s => s.student_id === studentId);
    if (!student) { alert('Please select a student.'); return; }

    singleBtn.disabled = true;
    singleBtn.textContent = '⏳ Generating…';
    progressArea.style.display = 'block';
    progressArea.textContent = 'Syncing latest submissions from the server…';

    const syncFailed = await syncBeforeGenerate();
    if (syncFailed.length) {
      progressArea.textContent = syncFailureMessage(syncFailed);
      singleBtn.disabled = false;
      singleBtn.textContent = '▶ Generate for This Student';
      return;
    }

    progressArea.textContent = `Generating report card for ${student.full_name}…`;

    const attendance = readAttendanceInputs();
    const result = await runForStudent(student, params, attendance);

    const displayName = student.full_name || studentId;
    const status = result.ok ? 'ok' : result.skipped ? 'skip' : 'error';
    appendResultRow(resultsList, displayName, status, result.error,
      status === 'error' ? () => runForStudent(student, params, attendance) : null,
      result.subjectsPendingReview
    );

    progressArea.textContent = result.ok
      ? `✅ Done — report card for ${displayName} saved as draft.`
      : result.skipped
        ? `⚠ ${result.error || `No finalized sessions found for ${displayName} in the selected period.`}`
        : `❌ Failed for ${displayName}: ${result.error}`;

    singleBtn.disabled = false;
    singleBtn.textContent = '▶ Generate for This Student';
  });

  // ── Entire class handler ──────────────────────────────────────────────────

  classBtn.addEventListener('click', async () => {
    const params = getParams();
    if (!params) return;

    classBtn.disabled = true;
    classBtn.textContent = 'Loading students…';
    progressArea.style.display = 'block';
    progressArea.textContent = 'Syncing latest submissions from the server…';
    resultsList.replaceChildren();

    const syncFailed = await syncBeforeGenerate();
    if (syncFailed.length) {
      progressArea.textContent = syncFailureMessage(syncFailed);
      classBtn.disabled = false;
      classBtn.textContent = '▶▶ Generate for Entire Class';
      return;
    }

    let students = _students;
    if (!students.length) {
      try { students = await loadStudentsForClass(params.className); } catch (err) {
        progressArea.textContent = `Failed to load students: ${err.message}`;
        classBtn.disabled = false;
        classBtn.textContent = '▶▶ Generate for Entire Class';
        return;
      }
    }

    if (!students.length) {
      progressArea.textContent = 'No students found for this class.';
      classBtn.disabled = false;
      classBtn.textContent = '▶▶ Generate for Entire Class';
      return;
    }

    const total = students.length;
    let done = 0;
    let withPendingReview = 0;

    for (const student of students) {
      const displayName = student.full_name || student.student_id;
      progressArea.textContent = `Generating ${done + 1} of ${total} — ${displayName}…`;

      const result = await runForStudent(student, params);
      done++;
      if (result.ok && result.subjectsPendingReview?.length) withPendingReview++;

      const status = result.ok ? 'ok' : result.skipped ? 'skip' : 'error';
      appendResultRow(resultsList, displayName, status, result.error,
        status === 'error' ? () => runForStudent(student, params) : null,
        result.subjectsPendingReview
      );
    }

    progressArea.textContent = withPendingReview > 0
      ? `Done — ${done} of ${total} processed. Cards are saved as drafts. ⚠ ${withPendingReview} student(s) have unreviewed sessions excluded — check the warnings below before releasing.`
      : `Done — ${done} of ${total} processed. Cards are saved as drafts.`;
    classBtn.disabled = false;
    classBtn.textContent = '▶▶ Generate for Entire Class';
  });

  return section;
}
