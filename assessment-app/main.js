// ── Always-needed imports ─────────────────────────────────────────────────
import { createSessionSetup } from './components/session-setup.js';
import { createAssessmentCard, updateTotal } from './components/assessment-card.js';
import { createSessionToolbar } from './components/session-toolbar.js';
import { createStickySaveToolbar } from './components/sticky-save-toolbar.js';
import { createSessionList } from './components/session-list.js';
import { createSessionReview } from './components/session-review.js';
import { createLoginForm } from './components/login-form.js';
import { createStudentProfile } from './components/student-profile.js';
import { createQuickEntryGrid } from './components/quick-entry-grid.js';
import { createClassTestEntry } from './components/class-test-entry.js';
import { showDefaultScorePicker } from './components/default-score-picker.js';
import { loadCriteriaForSubject } from './services/criteria-loader.js';
import { getSubjectsForClass, loadSubjects } from './services/subject-loader.js';
import { loadStudentsForClass } from './services/student-loader.js';
import { createSession, validateMark } from './services/assessment-engine.js';
import { initializeMarksWithDefault } from './services/fast-entry-engine.js';
import { calculateSessionProgress } from './services/totals-engine.js';
import { saveSession, saveSessionAndConfirm, getSession, getAllSessions, syncSessionsFromFirestore, deleteSessionAsAdmin } from './services/session-storage.js';
import { fetchSessions } from './services/firestore-service.js';
import { updateSessionStatus, loadFullSessionData, SESSION_STATUS } from './services/session-review-engine.js';
import { aggregateByMonth, extractYearMonth, clearAggregationCache } from './services/aggregation-engine.js';
import { getCurrentUser, isTeacher, isAdmin, isLoggedIn, resolveAuthSession } from './services/auth-service.js';
import { loadClassTestConfig, getClassTestSubjectsForClass } from './services/class-test-loader.js';
import { saveClassTest, getClassTest, syncClassTestsFromFirestore } from './services/class-test-storage.js';

// ── Heavy admin-only components — lazy loaded on first admin view ─────────
let _adminLazy = null;
async function getAdminComponents() {
  if (_adminLazy) return _adminLazy;
  const [ms, ts, wsl, ad, rcu, demo] = await Promise.all([
    import('./components/monthly-summary.js'),
    import('./components/term-summary.js'),
    import('./components/weak-student-list.js'),
    import('./components/analytics-dashboard.js'),
    import('./components/report-card-generator-ui.js'),
    import('./services/demo-data-generator.js'),
  ]);
  _adminLazy = {
    createMonthlySummary:       ms.createMonthlySummary,
    createTermSummary:          ts.createTermSummary,
    createWeakStudentList:      wsl.createWeakStudentList,
    createAnalyticsDashboard:   ad.createAnalyticsDashboard,
    createReportCardGeneratorUI: rcu.createReportCardGeneratorUI,
    generateDemoData:           demo.generateDemoData,
    clearDemoData:              demo.clearDemoData,
    generateWeeklyMathDemo:     demo.generateWeeklyMathDemo,
    generateClass1DrillDemo:    demo.generateClass1DrillDemo,
    clearClass1DrillDemo:       demo.clearClass1DrillDemo,
  };
  return _adminLazy;
}

const classes = ['LKG', 'SKG', 'Class I', 'Class II', 'Class 9'];

// auth-service.js prepends the teacher's title (e.g. "Miss") to their login
// name, but session.teacher_name is stored without it -- strip it before
// comparing so a teacher's own submissions always match their own login.
function stripTitle(name) {
  return String(name || '').replace(/^(mr|mrs|miss|ms|sir|madam)\.?\s+/i, '').trim();
}

const state = {
  allSubjects: [],
  subjects: [],
  selectedClass: '',
  selectedSubject: null,
  criteria: [],
  students: [],

  teacherName: '',
  date: getToday(),
  // Bi-weekly cadence: 2 assessments/month, not weekly. periodMonth+periodNumber
  // drive the picker; weekStart/weekEnd/dueDate stay the actual stored range so
  // session-storage/aggregation/report-card date logic is untouched.
  periodMonth: getCurrentPeriodMonth(),
  periodNumber: getCurrentPeriodNumber(),
  weekStart: getPeriodRange(getCurrentPeriodMonth(), getCurrentPeriodNumber()).start,
  weekEnd: getPeriodRange(getCurrentPeriodMonth(), getCurrentPeriodNumber()).end,
  dueDate: getPeriodRange(getCurrentPeriodMonth(), getCurrentPeriodNumber()).end,

  mode: 'setup',
  adminView: 'sessions',
  session: null,
  marks: {},

  lastSaved: null,
  errorMessage: '',
  infoMessage: '',
  isLoadingCriteria: false,

  adminFilters: {},
  reviewSessionId: null,
  summaryYearMonth: extractYearMonth(getToday()),
  summaryClass: '',
  termSummaryTerm: 'HY1',
  termSummaryClass: '',
  weakYearMonth: extractYearMonth(getToday()),
  weakClass: '',

  analyticsView: 'overview',
  analyticsClass: '',
  analyticsStudent: '',
  analyticsMonth: extractYearMonth(getToday()),

  useDefaultScore: false,
  quickEntryMode: false,
  viewingStudentProfile: null,

  expandedCards: {},
  showRemainingOnly: false,
  saveStatus: 'idle',
  lastSessionSync: null,
  syncingSessions: false,
  mySubmissions: null,       // null = not loaded yet; [] = loaded, empty
  mySubmissionsLoading: false,
  mySubmissionsError: '',

  // Class test (Half-Yearly, 30% of blended score) — Class I/II only
  classTestConfig: null,
  testClass: '',
  testSubject: null,
  testTerm: 'HY1',
  testStudents: [],
  testMarks: {},
  testSaveStatus: 'idle',
  testLastSaved: null
};

const setupRoot = document.querySelector('#session-setup-root');
const assessmentRoot = document.querySelector('#assessment-root');
let autosaveTimer = null;

// Read ?student= URL param for deep-link from pro-leo-site
const _deepLinkStudentId = new URLSearchParams(window.location.search).get('student') || '';

// Sessions were previously only synced from Firestore 3 times in the app's
// lifetime (page load, login, demo-gen), so review screens reading the local
// cache could sit stale indefinitely while a tab stayed open. Re-sync whenever
// the teacher actually looks at a review-type screen, and on tab focus —
// throttled so switching tabs rapidly doesn't spam Firestore.
const SYNC_MIN_INTERVAL_MS = 20000;
async function syncSessionsAndRerender({ force = false } = {}) {
  if (!isLoggedIn()) return;
  if (state.syncingSessions) return;
  if (!force && state.lastSessionSync && (Date.now() - state.lastSessionSync) < SYNC_MIN_INTERVAL_MS) return;

  state.syncingSessions = true;
  render();
  try {
    await syncSessionsFromFirestore();
  } finally {
    state.syncingSessions = false;
    state.lastSessionSync = Date.now();
    render();
  }
}

window.addEventListener('focus', () => { syncSessionsAndRerender(); });

async function init() {
  // Run subjects load and auth resolution in parallel — saves one full round-trip
  const [subjectsResult] = await Promise.allSettled([
    loadSubjects(),
    resolveAuthSession()
  ]);

  if (subjectsResult.status === 'fulfilled') {
    state.allSubjects = subjectsResult.value;
  } else {
    state.errorMessage = 'Failed to load subjects';
  }

  const currentUser = getCurrentUser();
  if (currentUser?.name) state.teacherName = currentUser.name;

  if (isLoggedIn()) {
    // Render immediately from local cache — don't block on Firestore sync
    applyDeepLink();
    render();
    // Sync in background; re-render silently when done
    syncSessionsAndRerender({ force: true });
    syncClassTestsFromFirestore().finally(() => render());
  } else {
    import('./services/firebase-config.js').then(({ auth }) => {
      if (auth.currentUser) {
        assessmentRoot.replaceChildren();
        const msg = document.createElement('div');
        msg.className = 'panel';
        msg.style.textAlign = 'center';
        msg.innerHTML = `<h2 style="margin-bottom:8px">Access Denied</h2>
          <p>This module is for teachers and administrators only.</p>
          <a href="../index.html" style="color:var(--accent);font-weight:700">← Return to Portal</a>`;
        assessmentRoot.append(msg);
      } else {
        render();
      }
    }).catch(() => render());
  }
}

function applyDeepLink() {
  if (!_deepLinkStudentId || !isAdmin()) return;
  // Resolve class from sessions so the profile engine has the right scope
  const sessions = getAllSessions();
  const match = sessions.find(s =>
    s.marks && Object.keys(s.marks).includes(_deepLinkStudentId)
  );
  state.mode = 'admin';
  state.adminView = 'analytics';
  state.analyticsClass = match?.session?.class || '';
  state.viewingStudentProfile = _deepLinkStudentId;
}

function render() {
  if (!isLoggedIn()) {
    renderLogin();
    return;
  }

  // Force correct landing mode based on role
  if (state.mode === 'setup' && isAdmin() && !isTeacher()) {
    state.mode = 'admin';
  }
  if (state.mode === 'admin' && !isAdmin()) {
    state.mode = 'setup';
  }

  renderNav();

  if (state.mode === 'setup') {
    renderSetup();
    assessmentRoot.replaceChildren();
  } else if (state.mode === 'assessment') {
    setupRoot.replaceChildren();
    renderAssessment();
  } else if (state.mode === 'admin') {
    setupRoot.replaceChildren();
    renderAdmin();
  } else if (state.mode === 'classtest') {
    setupRoot.replaceChildren();
    renderClassTest();
  } else if (state.mode === 'mysubmissions') {
    setupRoot.replaceChildren();
    renderMySubmissions();
  }
}

function renderLogin() {
  setupRoot.replaceChildren();
  assessmentRoot.replaceChildren();
  assessmentRoot.append(createLoginForm({
    onLogin: (user) => {
      if (user?.name) state.teacherName = user.name;
      applyDeepLink();
      render();
      syncSessionsAndRerender({ force: true });
    },
    onLogout: () => render(),
    onGenerateDemo: async () => { const a = await getAdminComponents(); a.generateDemoData(); },
    onClearDemo:    async () => { const a = await getAdminComponents(); a.clearDemoData(); },
    onGenerateWeeklyMathDemo: async () => {
      const a = await getAdminComponents();
      const n = await a.generateWeeklyMathDemo();
      alert(`Weekly Maths demo loaded: ${n} sessions for Class I. Profiles updated.`);
      syncSessionsAndRerender({ force: true });
    },
    onGenerateClass1DrillDemo: async () => {
      const a = await getAdminComponents();
      const n = await a.generateClass1DrillDemo();
      alert(`Class I drill demo loaded: ${n} sessions (April & May, all 5 subjects). Go to Analytics → Subject tab → select Class I.`);
      render();
    },
    onClearClass1DrillDemo: async () => {
      const a = await getAdminComponents();
      a.clearClass1DrillDemo();
      alert('Class I drill demo data cleared.');
      render();
    }
  }));
}

function renderNav() {
  let nav = document.querySelector('.app-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'app-nav';
    document.querySelector('.app-shell').insertBefore(nav, document.querySelector('.app-header').nextSibling);
  }

  nav.replaceChildren();

  const user = getCurrentUser();

  // Teachers see only assessment entry; admins see only the admin dashboard
  if (isTeacher()) {
    const setupBtn = document.createElement('button');
    setupBtn.type = 'button';
    setupBtn.className = `nav-btn ${state.mode === 'setup' || state.mode === 'assessment' ? 'active' : ''}`;
    setupBtn.textContent = 'New Assessment';
    setupBtn.addEventListener('click', () => switchMode('setup'));
    nav.append(setupBtn);

    const testBtn = document.createElement('button');
    testBtn.type = 'button';
    testBtn.className = `nav-btn ${state.mode === 'classtest' ? 'active' : ''}`;
    testBtn.textContent = 'Class Test';
    testBtn.addEventListener('click', () => switchMode('classtest'));
    nav.append(testBtn);

    const mySubBtn = document.createElement('button');
    mySubBtn.type = 'button';
    mySubBtn.className = `nav-btn ${state.mode === 'mysubmissions' ? 'active' : ''}`;
    mySubBtn.textContent = 'My Submissions';
    mySubBtn.addEventListener('click', () => switchMode('mysubmissions'));
    nav.append(mySubBtn);
  }

  if (isAdmin()) {
    const adminBtn = document.createElement('button');
    adminBtn.type = 'button';
    adminBtn.className = `nav-btn ${state.mode === 'admin' ? 'active' : ''}`;
    adminBtn.textContent = 'Admin Dashboard';
    adminBtn.addEventListener('click', () => switchMode('admin'));
    nav.append(adminBtn);
  }

  if (user) {
    // Role chip
    const roleChip = document.createElement('span');
    roleChip.style.cssText = 'font-size:11px;padding:3px 10px;border-radius:20px;background:var(--accent-bg,#f3ece3);color:var(--accent,#8B6F47);font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-left:auto';
    roleChip.textContent = isAdmin() ? 'Admin' : (user.role || 'Teacher').replace(/_/g, ' ');
    nav.append(roleChip);

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'nav-btn btn-secondary';
    logoutBtn.textContent = 'Logout';
    logoutBtn.addEventListener('click', () => {
      clearAutosave();
      state.mode = 'setup';
      state.session = null;
      state.marks = {};
      renderLogin();
    });
    nav.append(logoutBtn);
  }
}

function switchMode(mode) {
  if (state.mode === 'assessment' && state.session) {
    const unsaved = hasUnsavedChanges();
    if (unsaved) {
      const ok = confirm('You have unsaved changes. Save before leaving?');
      if (ok) handleSave();
    }
    clearAutosave();
    state.session = null;
    state.marks = {};
  }

  if (state.mode === 'classtest' && state.testSaveStatus === 'unsaved') {
    const ok = confirm('You have unsaved class test marks. Save before leaving?');
    if (ok) handleTestSave();
  }

  state.mode = mode;
  state.viewingStudentProfile = null;
  state.errorMessage = '';
  state.infoMessage = '';
  render();
}

function renderSetup() {
  if (!isTeacher()) {
    // Admins land on admin dashboard, not setup
    if (isAdmin()) { state.mode = 'admin'; render(); return; }
    assessmentRoot.replaceChildren(createStatus('Access denied: teacher role required.'));
    return;
  }

  setupRoot.replaceChildren(createSessionSetup({
    classes,
    subjects: state.subjects,
    selectedClass: state.selectedClass,
    selectedSubjectId: state.selectedSubject?.subject_id || '',
    teacherName: state.teacherName,
    periodMonth: state.periodMonth,
    periodNumber: state.periodNumber,
    weekStart: state.weekStart,
    weekEnd: state.weekEnd,
    dueDate: state.dueDate,
    savedSessions: getAllSessions().filter(s => stripTitle(s.session.teacher_name) === stripTitle(state.teacherName)),
    onClassChange: handleClassChange,
    onSubjectChange: handleSubjectChange,
    onTeacherNameChange: handleTeacherNameChange,
    onPeriodMonthChange: handlePeriodMonthChange,
    onPeriodNumberChange: handlePeriodNumberChange,
    onStartSession: handleStartSession,
    onResumeSession: handleResumeSession
  }));

  const optionsPanel = document.createElement('div');
  optionsPanel.className = 'panel options-panel';

  const quickLabel = document.createElement('label');
  quickLabel.className = 'field';
  quickLabel.innerHTML = `<input type="checkbox" ${state.quickEntryMode ? 'checked' : ''}> Quick entry mode`;
  quickLabel.querySelector('input').addEventListener('change', e => {
    state.quickEntryMode = e.target.checked;
    render();
  });

  optionsPanel.append(quickLabel);
  setupRoot.append(optionsPanel);

  if (state.errorMessage) {
    const err = document.createElement('p');
    err.className = 'error-state';
    err.textContent = state.errorMessage;
    setupRoot.append(err);
  }

  if (state.infoMessage) {
    const info = document.createElement('p');
    info.className = 'info-state';
    info.textContent = state.infoMessage;
    setupRoot.append(info);
  }
}

function renderAssessment() {
  if (!state.session || !state.students.length || !state.criteria.length) {
    assessmentRoot.replaceChildren(createStatus('Session data is incomplete.'));
    return;
  }

  if (state.session.status === 'locked') {
    assessmentRoot.replaceChildren(createStatus('This assessment session has been locked by admin.'));
    return;
  }

  assessmentRoot.replaceChildren();

  // Session toolbar (top, sticky)
  const toolbar = createSessionToolbar({
    session: state.session,
    marks: state.marks,
    students: state.students,
    criteria: state.criteria,
    onSave: handleSave,
    onClose: handleCloseSession,
    lastSaved: state.lastSaved
  });
  assessmentRoot.append(toolbar);

  // Filter bar
  const filterBar = document.createElement('div');
  filterBar.className = 'assessment-filter-bar';

  const remainingToggle = document.createElement('button');
  remainingToggle.type = 'button';
  remainingToggle.className = `btn btn-sm ${state.showRemainingOnly ? 'btn-primary' : 'btn-secondary'}`;
  remainingToggle.textContent = state.showRemainingOnly ? 'Show All' : 'Show Remaining Only';
  remainingToggle.addEventListener('click', () => {
    state.showRemainingOnly = !state.showRemainingOnly;
    render();
  });

  const expandAllBtn = document.createElement('button');
  expandAllBtn.type = 'button';
  expandAllBtn.className = 'btn btn-sm btn-secondary';
  expandAllBtn.textContent = 'Expand All';
  expandAllBtn.addEventListener('click', () => {
    state.students.forEach(s => { state.expandedCards[s.student_id] = true; });
    render();
  });

  const collapseAllBtn = document.createElement('button');
  collapseAllBtn.type = 'button';
  collapseAllBtn.className = 'btn btn-sm btn-secondary';
  collapseAllBtn.textContent = 'Collapse All';
  collapseAllBtn.addEventListener('click', () => {
    state.students.forEach(s => { state.expandedCards[s.student_id] = false; });
    render();
  });

  filterBar.append(remainingToggle, expandAllBtn, collapseAllBtn);
  assessmentRoot.append(filterBar);

  if (state.quickEntryMode) {
    assessmentRoot.append(createQuickEntryGrid({
      students: state.students,
      criteria: state.criteria,
      marks: state.marks,
      onMarkChange: handleMarkChange
    }));
  } else {
    const cardsContainer = document.createElement('div');
    cardsContainer.className = 'assessment-cards';

    let displayStudents = state.students;
    if (state.showRemainingOnly) {
      displayStudents = state.students.filter(student => {
        const sm = state.marks[student.student_id] || {};
        const allDone = state.criteria.every(c => {
          const entry = sm[c.criterion_id];
          return entry !== null && entry !== undefined;
        });
        return !allDone;
      });
    }

    displayStudents.forEach(student => {
      const expanded = state.expandedCards[student.student_id] !== false;
      const card = createAssessmentCard({
        student,
        criteria: state.criteria,
        marks: state.marks[student.student_id] || {},
        onMarkChange: handleMarkChange,
        onToggleExpand: handleToggleExpand,
        onApplyDefault: handleApplyDefaultToAll,
        expanded,
        onAbsentToggle: handleAbsentToggle
      });
      cardsContainer.append(card);
    });

    assessmentRoot.append(cardsContainer);
  }

  // Sticky bottom save toolbar
  const progress = calculateSessionProgress(state.marks, state.students, state.criteria);
  const stickyToolbar = createStickySaveToolbar({
    onSave: handleSave,
    onSubmit: handleSubmitSession,
    onClose: handleCloseSession,
    saveStatus: state.saveStatus,
    lastSaved: state.lastSaved,
    progress
  });
  assessmentRoot.append(stickyToolbar);
}

// ── My Submissions ──────────────────────────────────────────────────────────
// A subject/class teacher's own durable record of everything they've
// submitted, independent of the one-time submit alert. Queries Firestore
// directly (not the local session cache) so it can't lie about a save that
// never reached the server, and stays accurate even from a different device.
async function renderMySubmissions() {
  if (!isTeacher()) {
    assessmentRoot.replaceChildren(createStatus('Access denied: teacher role required.'));
    return;
  }

  assessmentRoot.replaceChildren();

  const panel = document.createElement('section');
  panel.className = 'panel';

  const headingRow = document.createElement('div');
  headingRow.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';
  const heading = document.createElement('h2');
  heading.className = 'section-heading';
  heading.style.margin = '0';
  heading.textContent = 'My Submissions';
  headingRow.append(heading);

  const refreshBtn = document.createElement('button');
  refreshBtn.type = 'button';
  refreshBtn.className = 'btn btn-sm btn-secondary';
  refreshBtn.textContent = state.mySubmissionsLoading ? 'Loading…' : 'Refresh';
  refreshBtn.disabled = state.mySubmissionsLoading;
  refreshBtn.addEventListener('click', () => loadMySubmissions());
  headingRow.append(refreshBtn);
  panel.append(headingRow);

  const note = document.createElement('p');
  note.className = 'empty-state';
  note.style.cssText = 'font-size:0.82rem;margin:6px 0 14px';
  note.textContent = 'This list is read live from the server — if a submission shows up here, it is confirmed saved, not just saved on this device.';
  panel.append(note);

  assessmentRoot.append(panel);

  if (state.mySubmissions === null && !state.mySubmissionsLoading) {
    loadMySubmissions();
    return;
  }

  if (state.mySubmissionsLoading) {
    panel.append(createStatus('Loading your submissions from the server…'));
    return;
  }

  if (state.mySubmissionsError) {
    const err = document.createElement('p');
    err.className = 'error-state';
    err.textContent = state.mySubmissionsError;
    panel.append(err);
    return;
  }

  const mine = state.mySubmissions || [];
  if (mine.length === 0) {
    panel.append(createStatus("No submissions found for your name yet. If you've submitted something and don't see it here, it did not reach the server — please submit again."));
    return;
  }

  const list = document.createElement('div');
  list.className = 'session-list';
  mine
    .slice()
    .sort((a, b) => new Date(b.session.updated_at || 0) - new Date(a.session.updated_at || 0))
    .forEach(entry => list.append(createMySubmissionRow(entry)));
  panel.append(list);
}

async function loadMySubmissions() {
  state.mySubmissionsLoading = true;
  state.mySubmissionsError = '';
  render();
  try {
    const all = await fetchSessions();
    state.mySubmissions = all.filter(s => stripTitle(s.session.teacher_name) === stripTitle(state.teacherName));
  } catch (err) {
    state.mySubmissionsError = `Could not load submissions: ${err.message}. Check your connection and try Refresh.`;
  } finally {
    state.mySubmissionsLoading = false;
    render();
  }
}

function createMySubmissionRow(entry) {
  const sess = entry.session;
  const row = document.createElement('div');
  row.className = 'session-row';

  const info = document.createElement('div');
  info.className = 'session-row-info';
  const title = document.createElement('div');
  title.className = 'session-row-title';
  title.textContent = `${sess.subject_name || sess.subject_id} — ${sess.class}`;
  const meta = document.createElement('div');
  meta.className = 'session-row-meta';
  const period = sess.weekStart ? `Week of ${sess.weekStart}` : (sess.date || '');
  const updated = sess.updated_at ? new Date(sess.updated_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  meta.textContent = `${period}${updated ? ' • last saved ' + updated : ''}`;
  info.append(title, meta);

  const badgesDiv = document.createElement('div');
  badgesDiv.className = 'session-badges';
  const badge = document.createElement('span');
  badge.className = `status-badge status-${sess.status}`;
  badge.textContent = capitalize(sess.status || 'draft');
  badgesDiv.append(badge);

  row.append(info, badgesDiv);
  return row;
}

function capitalize(str) {
  return String(str || '').charAt(0).toUpperCase() + String(str || '').slice(1);
}

function renderClassTest() {
  if (!isTeacher()) {
    assessmentRoot.replaceChildren(createStatus('Access denied: teacher role required.'));
    return;
  }

  assessmentRoot.replaceChildren();

  if (!state.classTestConfig) {
    assessmentRoot.append(createStatus('Loading class test configuration…'));
    loadClassTestConfig()
      .then(cfg => { state.classTestConfig = cfg; render(); })
      .catch(() => { state.errorMessage = 'Failed to load class test configuration'; render(); });
    return;
  }

  const subjectsForClass = state.testClass
    ? getClassTestSubjectsForClass(state.classTestConfig, state.allSubjects, state.testClass)
    : [];

  assessmentRoot.append(createClassTestEntry({
    classes: state.classTestConfig.classes,
    subjects: subjectsForClass,
    selectedClass: state.testClass,
    selectedSubjectId: state.testSubject?.subject_id || '',
    selectedTerm: state.testTerm,
    teacherName: state.teacherName,
    students: state.testStudents,
    marks: state.testMarks,
    maxMarks: state.testSubject?.max_marks || 30,
    saveStatus: state.testSaveStatus,
    lastSaved: state.testLastSaved,
    onClassChange: handleTestClassChange,
    onSubjectChange: handleTestSubjectChange,
    onTermChange: handleTestTermChange,
    onTeacherNameChange: handleTeacherNameChange,
    onMarkChange: handleTestMarkChange,
    onSave: handleTestSave
  }));

  if (state.errorMessage) {
    const err = document.createElement('p');
    err.className = 'error-state';
    err.textContent = state.errorMessage;
    assessmentRoot.append(err);
  }
}

function renderAdmin() {
  if (!isAdmin()) {
    assessmentRoot.replaceChildren(createStatus('Access denied: admin role required.'));
    return;
  }

  assessmentRoot.replaceChildren();

  if (state.viewingStudentProfile) {
    assessmentRoot.append(createStudentProfile({
      studentId: state.viewingStudentProfile,
      className: state.analyticsClass,
      onBack: () => {
        state.viewingStudentProfile = null;
        render();
      }
    }));
    return;
  }

  assessmentRoot.replaceChildren();

  const tabs = document.createElement('div');
  tabs.className = 'admin-tabs';

  const tabDefs = [
    { key: 'sessions', label: 'Sessions' },
    { key: 'summary', label: 'Monthly Summary' },
    { key: 'termsummary', label: 'Term Summary' },
    { key: 'weak', label: 'Weak Students' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'reportcards', label: 'Report Cards' },
    { key: 'demo', label: '🧪 Demo Data' }
  ];

  tabDefs.forEach(t => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `admin-tab ${state.adminView === t.key ? 'active' : ''}`;
    btn.textContent = t.label;
    btn.addEventListener('click', () => {
      state.adminView = t.key;
      state.viewingStudentProfile = null;
      render();
      if (t.key === 'sessions') syncSessionsAndRerender();
    });
    tabs.append(btn);
  });

  assessmentRoot.append(tabs);

  if (state.adminView === 'sessions') {
    if (state.reviewSessionId) {
      renderAdminReview();
    } else {
      renderAdminSessions();
    }
  } else if (state.adminView === 'summary') {
    renderAdminSummary();
  } else if (state.adminView === 'termsummary') {
    renderAdminTermSummary();
  } else if (state.adminView === 'weak') {
    renderAdminWeak();
  } else if (state.adminView === 'analytics') {
    renderAdminAnalytics();
  } else if (state.adminView === 'reportcards') {
    renderAdminReportCards();
  } else if (state.adminView === 'demo') {
    renderAdminDemo();
  }
}

function renderAdminDemo() {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.style.cssText = 'display:grid;gap:16px;max-width:540px';

  function demoSection(title, desc, btnLabel, onLoad, clearLabel, onClear) {
    const box = document.createElement('div');
    box.style.cssText = 'border:1px solid var(--line);border-radius:10px;padding:14px;display:grid;gap:8px';

    const h = document.createElement('h4');
    h.style.cssText = 'margin:0;font-size:0.95rem';
    h.textContent = title;

    const p = document.createElement('p');
    p.style.cssText = 'margin:0;font-size:0.83rem;color:#666';
    p.textContent = desc;

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn btn-primary btn-sm';
    loadBtn.textContent = btnLabel;
    loadBtn.addEventListener('click', async () => {
      loadBtn.disabled = true; loadBtn.textContent = 'Loading…';
      try { await onLoad(); } finally { loadBtn.disabled = false; loadBtn.textContent = btnLabel; }
    });
    btnRow.append(loadBtn);

    if (clearLabel && onClear) {
      const clrBtn = document.createElement('button');
      clrBtn.type = 'button';
      clrBtn.className = 'btn btn-secondary btn-sm';
      clrBtn.textContent = clearLabel;
      clrBtn.addEventListener('click', async () => {
        clrBtn.disabled = true;
        try { await onClear(); } finally { clrBtn.disabled = false; }
      });
      btnRow.append(clrBtn);
    }

    box.append(h, p, btnRow);
    return box;
  }

  panel.append(demoSection(
    '📊 General Demo',
    '3 months of Maths data for Class I & II. Good for overview, trends and completion tabs.',
    'Load General Demo',
    async () => { const a = await getAdminComponents(); a.generateDemoData(); render(); },
    'Clear',
    async () => { const a = await getAdminComponents(); a.clearDemoData(); render(); }
  ));

  panel.append(demoSection(
    '📅 Weekly Maths Demo',
    '4-week Maths sessions for Class I — locked, overdue and in-progress states with rising trend.',
    'Load Weekly Maths Demo',
    async () => {
      const a = await getAdminComponents();
      const n = await a.generateWeeklyMathDemo();
      alert(`Weekly Maths demo loaded: ${n} sessions.`);
      render();
    },
    null, null
  ));

  panel.append(demoSection(
    '🔬 Class I Subject Drill Demo',
    'April & May 2026, all 5 subjects (English I & II, Maths, Science, Khasi), 59 real students. Shows category breakdowns, decline alerts, skill gaps and heat maps in the Analytics → Subject tab.',
    'Load Class I Drill Demo',
    async () => {
      const a = await getAdminComponents();
      const n = await a.generateClass1DrillDemo();
      alert(`Loaded ${n} sessions. Go to Analytics → Subject tab → select Class I.`);
      render();
    },
    'Clear Drill Demo',
    async () => { const a = await getAdminComponents(); a.clearClass1DrillDemo(); render(); }
  ));

  assessmentRoot.append(panel);
}

async function renderAdminReportCards() {
  const a = await getAdminComponents();
  assessmentRoot.append(a.createReportCardGeneratorUI({
    classes,
    currentUser: getCurrentUser()
  }));
}

async function renderAdminAnalytics() {
  const a = await getAdminComponents();
  assessmentRoot.append(a.createAnalyticsDashboard({
    classes,
    view: state.analyticsView,
    selectedClass: state.analyticsClass,
    selectedStudent: state.analyticsStudent,
    selectedMonth: state.analyticsMonth,
    onViewChange: view => {
      state.analyticsView = view;
      render();
    },
    onClassChange: className => {
      state.analyticsClass = className;
      render();
    },
    onStudentChange: studentId => {
      state.viewingStudentProfile = studentId;
      render();
    },
    onMonthChange: month => {
      state.analyticsMonth = month;
      render();
    },
    onViewWeakStudents: () => {
      state.adminView = 'weak';
      state.weakClass = state.analyticsClass;
      state.weakYearMonth = state.analyticsMonth;
      render();
    },
    onViewSummary: () => {
      state.adminView = 'summary';
      state.summaryClass = state.analyticsClass;
      state.summaryYearMonth = state.analyticsMonth;
      render();
    },
    onViewSessions: () => {
      state.adminView = 'sessions';
      render();
    },
    onViewStudentProfile: studentId => {
      state.viewingStudentProfile = studentId;
      state.analyticsClass = state.analyticsClass;
      render();
    }
  }));
}

function renderAdminSessions() {
  assessmentRoot.append(createSessionList({
    classes,
    subjects: state.allSubjects,
    filters: state.adminFilters,
    lastSynced: state.lastSessionSync,
    syncing: state.syncingSessions,
    canDelete: isAdmin(),
    onRefresh: () => syncSessionsAndRerender({ force: true }),
    onFilterChange: filters => {
      state.adminFilters = filters;
      render();
    },
    onViewSession: sessionId => {
      state.reviewSessionId = sessionId;
      render();
    },
    onStatusChange: async (sessionId, newStatus) => {
      const result = updateSessionStatus(sessionId, newStatus);
      if (result.ok) {
        clearAggregationCache();
        render();
      } else {
        alert(result.error);
      }
    },
    onDeleteSession: async (sessionId, sess) => {
      if (!isAdmin()) return; // defense-in-depth; firestore.rules is the real gate
      const label = `${sess.subject_name || sess.subject_id} — ${sess.class} (${sess.weekStart || sess.date || 'undated'}, by ${sess.teacher_name || 'unknown'})`;
      const ok = confirm(`Permanently delete this assessment?\n\n${label}\n\nThis cannot be undone.`);
      if (!ok) return;
      try {
        await deleteSessionAsAdmin(sessionId);
        clearAggregationCache();
        render();
      } catch (err) {
        alert(`Could not delete: ${err.message}`);
      }
    }
  }));
}

async function renderAdminReview() {
  const data = await loadFullSessionData(state.reviewSessionId);
  if (!data) {
    state.reviewSessionId = null;
    state.errorMessage = 'Session not found.';
    render();
    return;
  }

  assessmentRoot.append(createSessionReview({
    sessionData: data,
    onBack: () => {
      state.reviewSessionId = null;
      render();
    },
    onLock: () => {
      const result = updateSessionStatus(data.session.session_id, SESSION_STATUS.LOCKED);
      if (result.ok) {
        clearAggregationCache();
        data.session.status = SESSION_STATUS.LOCKED;
        render();
      } else {
        alert(result.error);
      }
    },
    onReopen: () => {
      const result = updateSessionStatus(data.session.session_id, SESSION_STATUS.DRAFT);
      if (result.ok) {
        clearAggregationCache();
        data.session.status = SESSION_STATUS.DRAFT;
        render();
      } else {
        alert(result.error);
      }
    }
  }));
}

async function renderAdminSummary() {
  const a = await getAdminComponents();
  try {
    assessmentRoot.append(a.createMonthlySummary({
      classes,
      yearMonth: state.summaryYearMonth,
      className: state.summaryClass,
      onBack: () => {
        state.adminView = 'sessions';
        render();
      },
      onViewStudentProfile: studentId => {
        state.viewingStudentProfile = studentId;
        state.analyticsClass = state.summaryClass;
        render();
      },
      onViewWeakStudents: () => {
        state.adminView = 'weak';
        state.weakClass = state.summaryClass;
        state.weakYearMonth = state.summaryYearMonth;
        render();
      },
      onViewAnalytics: () => {
        state.adminView = 'analytics';
        state.analyticsClass = state.summaryClass;
        state.analyticsMonth = state.summaryYearMonth;
        render();
      },
      onClassChange: className => {
        state.summaryClass = className;
        render();
      },
      onYearMonthChange: ym => {
        state.summaryYearMonth = ym;
        render();
      }
    }));
  } catch (error) {
    console.error(error);
    assessmentRoot.append(createStatus('Failed to generate summary.'));
  }
}

async function renderAdminTermSummary() {
  const a = await getAdminComponents();
  try {
    assessmentRoot.append(a.createTermSummary({
      classes,
      term: state.termSummaryTerm,
      className: state.termSummaryClass,
      onBack: () => {
        state.adminView = 'sessions';
        render();
      },
      onClassChange: className => {
        state.termSummaryClass = className;
        render();
      },
      onTermChange: term => {
        state.termSummaryTerm = term;
        render();
      },
      onViewStudentProfile: studentId => {
        state.viewingStudentProfile = studentId;
        state.analyticsClass = state.termSummaryClass;
        render();
      }
    }));
  } catch (error) {
    console.error(error);
    assessmentRoot.append(createStatus('Failed to generate term summary.'));
  }
}

async function renderAdminWeak() {
  const a = await getAdminComponents();
  assessmentRoot.append(a.createWeakStudentList({
    classes,
    yearMonth: state.weakYearMonth,
    selectedClass: state.weakClass,
    onClassChange: className => {
      state.weakClass = className;
      render();
    },
    onYearMonthChange: ym => {
      state.weakYearMonth = ym;
      render();
    },
    onViewProfile: studentId => {
      state.viewingStudentProfile = studentId;
      state.analyticsClass = state.weakClass;
      render();
    }
  }));
}

async function handleClassChange(className) {
  state.selectedClass = className;
  state.selectedSubject = null;
  state.criteria = [];
  state.errorMessage = '';
  state.infoMessage = '';
  state.subjects = getSubjectsForClass(state.allSubjects, className);
  state.students = className ? await loadStudentsForClass(className).catch(() => []) : [];
  render();
}

async function handleSubjectChange(subject) {
  state.selectedSubject = subject;
  state.criteria = [];
  state.errorMessage = '';
  state.infoMessage = '';

  if (!subject) {
    render();
    return;
  }

  state.isLoadingCriteria = true;
  render();

  try {
    state.criteria = await loadCriteriaForSubject(subject, state.selectedClass);
  } catch (error) {
    state.errorMessage = error.userMessage || 'Criteria not available';
    console.error(error);
  } finally {
    state.isLoadingCriteria = false;
    render();
  }
}

function handleTeacherNameChange(name) {
  state.teacherName = name;
  state.errorMessage = '';
}

async function handleTestClassChange(className) {
  state.testClass = className;
  state.testSubject = null;
  state.errorMessage = '';
  state.testStudents = className ? await loadStudentsForClass(className).catch(() => []) : [];
  state.testMarks = {};
  state.testLastSaved = null;
  render();
}

function handleTestSubjectChange(subject) {
  state.testSubject = subject;
  loadExistingTestMarks();
  render();
}

function handleTestTermChange(term) {
  state.testTerm = term;
  loadExistingTestMarks();
  render();
}

function loadExistingTestMarks() {
  state.testMarks = {};
  state.testLastSaved = null;
  state.testSaveStatus = 'idle';
  if (!state.testClass || !state.testSubject || !state.testTerm) return;
  const existing = getClassTest(state.testTerm, state.testClass, state.testSubject.subject_id);
  if (existing) {
    state.testMarks = { ...existing.marks };
    state.testLastSaved = existing.saved_at ? new Date(existing.saved_at) : null;
  }
}

function handleTestMarkChange(studentId, mark) {
  state.testMarks[studentId] = mark;
  state.testSaveStatus = 'unsaved';
  render();
}

function handleTestSave() {
  if (!state.testClass || !state.testSubject || !state.testTerm) return;

  try {
    saveClassTest({
      class: state.testClass,
      subject_id: state.testSubject.subject_id,
      subject_name: state.testSubject.subject_name,
      term: state.testTerm,
      max_marks: state.testSubject.max_marks,
      teacher_name: state.teacherName
    }, state.testMarks);
    state.testLastSaved = new Date();
    state.testSaveStatus = 'idle';
  } catch (error) {
    state.errorMessage = error.message || 'Class test save failed.';
  }
  render();
}

function handleDateChange(date) {
  state.date = date;
  state.errorMessage = '';
}

function handlePeriodMonthChange(value) {
  state.periodMonth = value;
  applyPeriodRange();
}

function handlePeriodNumberChange(value) {
  state.periodNumber = Number(value);
  applyPeriodRange();
}

function applyPeriodRange() {
  const range = getPeriodRange(state.periodMonth, state.periodNumber);
  state.weekStart = range.start;
  state.weekEnd = range.end;
  state.dueDate = range.end;
  state.date = range.start;
  state.errorMessage = '';
  render();
}

function handleStartSession(force = false) {
  state.errorMessage = '';
  state.infoMessage = '';

  const result = createSession({
    teacher_name: state.teacherName,
    class: state.selectedClass,
    subject: state.selectedSubject,
    date: state.weekStart,
    weekStart: state.weekStart,
    weekEnd: state.weekEnd,
    dueDate: state.dueDate,
    force
  });

  if (!result.ok) {
    if (result.duplicate && !force) {
      const confirmed = confirm(
        `A draft week already exists for ${state.teacherName}, ${state.selectedClass}, ${state.selectedSubject.subject_name}, Week: ${state.weekStart} to ${state.weekEnd}.\n\nOverwrite and continue?`
      );
      if (confirmed) {
        handleStartSession(true);
      }
      return;
    }
    state.errorMessage = result.errors.join('. ');
    render();
    return;
  }

  if (!state.students.length) {
    state.errorMessage = 'No students found for this class.';
    render();
    return;
  }

  if (!state.criteria.length) {
    state.errorMessage = 'No criteria loaded for this subject.';
    render();
    return;
  }

  state.session = result.session;

  // Show default score picker modal before opening the assessment
  showDefaultScorePicker({
    subjectName:  state.selectedSubject.subject_name,
    className:    state.selectedClass,
    studentCount: state.students.length,
    onConfirm: (defaultScore) => {
      if (defaultScore !== null) {
        // Pre-fill all marks with chosen score
        state.marks = {};
        state.students.forEach(student => {
          state.marks[student.student_id] = {};
          state.criteria.forEach(criterion => {
            state.marks[student.student_id][criterion.criterion_id] = defaultScore;
          });
        });
      } else {
        // Start blank
        state.marks = {};
        state.students.forEach(student => {
          state.marks[student.student_id] = {};
          state.criteria.forEach(criterion => {
            state.marks[student.student_id][criterion.criterion_id] = null;
          });
        });
      }
      state.mode = 'assessment';
      state.lastSaved = null;
      scheduleAutosave();
      render();
    },
    onCancel: () => {
      // Teacher dismissed — stay on setup screen
      state.session = null;
      render();
    }
  });
  // render() is called inside onConfirm/onCancel
}

async function handleResumeSession(sessionId) {
  state.errorMessage = '';
  state.infoMessage = '';

  const stored = getSession(sessionId);
  if (!stored) {
    state.errorMessage = 'Session not found.';
    render();
    return;
  }

  const sess = stored.session;
  state.teacherName = sess.teacher_name;
  state.selectedClass = sess.class;
  state.date = sess.date;
  state.weekStart = sess.weekStart || sess.date;
  state.weekEnd = sess.weekEnd || sess.date;
  state.dueDate = sess.dueDate || sess.date;
  state.subjects = getSubjectsForClass(state.allSubjects, sess.class);
  state.selectedSubject = state.subjects.find(s => s.subject_id === sess.subject_id) || null;

  if (!state.selectedSubject) {
    state.errorMessage = 'Subject for this session is no longer available.';
    render();
    return;
  }

  state.students = await loadStudentsForClass(sess.class).catch(() => []);

  try {
    state.criteria = await loadCriteriaForSubject(state.selectedSubject, sess.class);
  } catch (error) {
    state.errorMessage = error.userMessage || 'Failed to load criteria';
    render();
    return;
  }

  state.session = sess;
  state.marks = mergeMarks(stored.marks, state.students, state.criteria);
  state.mode = 'assessment';
  state.lastSaved = stored.saved_at ? new Date(stored.saved_at) : null;

  scheduleAutosave();
  render();
}

function handleMarkChange(studentId, criterionId, mark) {
  if (!validateMark(mark)) return;

  if (!state.marks[studentId]) {
    state.marks[studentId] = {};
  }
  state.marks[studentId][criterionId] = mark;

  if (!state.quickEntryMode) {
    const card = document.querySelector(`.assessment-card[data-student-id="${studentId}"]`);
    if (card) {
      updateTotal(card, state.marks[studentId], state.criteria);
    }
  }

  state.saveStatus = 'unsaved';
  scheduleAutosave();
}

function handleToggleExpand(studentId) {
  state.expandedCards[studentId] = !state.expandedCards[studentId];
  render();
}

function handleApplyDefaultToAll(criterionId, defaultScore) {
  state.students.forEach(student => {
    const studentId = student.student_id;
    if (!state.marks[studentId]) state.marks[studentId] = {};
    const entry = state.marks[studentId][criterionId];
    if (entry === null || entry === undefined) {
      state.marks[studentId][criterionId] = defaultScore;
    }
  });
  state.saveStatus = 'unsaved';
  scheduleAutosave();
  render();
}

function handleAbsentToggle(studentId, criterionId, isAbsent) {
  if (!state.marks[studentId]) {
    state.marks[studentId] = {};
  }
  if (isAbsent) {
    state.marks[studentId][criterionId] = { attendance: 'absent' };
  } else {
    state.marks[studentId][criterionId] = null;
  }

  if (!state.quickEntryMode) {
    const card = document.querySelector(`.assessment-card[data-student-id="${studentId}"]`);
    if (card) {
      updateTotal(card, state.marks[studentId], state.criteria);
    }
  }

  state.saveStatus = 'unsaved';
  scheduleAutosave();
}

async function handleSubmitSession() {
  if (!state.session) return;
  const progress = calculateSessionProgress(state.marks, state.students, state.criteria);
  if (progress.overallPercentage < 100) {
    const ok = confirm(`Only ${progress.overallPercentage}% complete. Submit anyway?`);
    if (!ok) return;
  }

  const submitBtn = document.querySelector('.sticky-save-toolbar [data-action="submit"]');
  const toolbarButtons = document.querySelectorAll('.sticky-save-toolbar button');
  toolbarButtons.forEach(b => b.disabled = true);
  if (submitBtn) submitBtn.textContent = 'Submitting…';

  state.session.status = 'submitted';
  // Awaited — the teacher must see the REAL outcome, not an optimistic alert.
  // A failed write here previously looked identical to a successful one.
  const result = await saveSessionAndConfirm(state.session, state.marks);

  if (!result.ok) {
    state.session.status = 'draft'; // don't leave it stuck "submitted" locally when the server never saw it
    toolbarButtons.forEach(b => b.disabled = false);
    if (submitBtn) submitBtn.textContent = 'Submit';
    alert(`Could not submit: ${result.error}\n\nYour marks are saved on this device — try Submit again once you're back online. Nothing was lost.`);
    return;
  }

  state.lastSaved = new Date();
  alert('Session submitted successfully — confirmed saved to the server.');
  state.mode = 'setup';
  state.session = null;
  state.marks = {};
  render();
}

function handleSave() {
  if (!state.session) return;

  try {
    saveSession(state.session, state.marks);
    state.lastSaved = new Date();
    const note = document.querySelector('.saved-note');
    if (note) {
      note.textContent = `Last saved: ${formatTime(state.lastSaved)}`;
    }
  } catch (error) {
    state.errorMessage = error.message || 'Save failed.';
    render();
  }
}

function handleCloseSession() {
  if (state.session) {
    const unsaved = hasUnsavedChanges();
    if (unsaved) {
      const ok = confirm('You have unsaved changes. Save before closing?');
      if (ok) handleSave();
    }
  }

  clearAutosave();
  state.mode = 'setup';
  state.session = null;
  state.marks = {};
  state.lastSaved = null;
  state.errorMessage = '';
  state.infoMessage = '';
  render();
}

function scheduleAutosave() {
  clearAutosave();
  autosaveTimer = setTimeout(() => {
    if (state.mode === 'assessment' && state.session) {
      try {
        saveSession(state.session, state.marks);
        state.lastSaved = new Date();
        const note = document.querySelector('.saved-note');
        if (note) {
          note.textContent = `Last saved: ${formatTime(state.lastSaved)}`;
        }
      } catch (error) {
        console.error('Autosave failed', error);
      }
    }
  }, 30000);
}

function clearAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

function hasUnsavedChanges() {
  if (!state.session) return false;
  const stored = getSession(state.session.session_id);
  if (!stored) return true;
  return JSON.stringify(stored.marks) !== JSON.stringify(state.marks);
}

function mergeMarks(savedMarks, students, criteria) {
  const merged = {};
  students.forEach(student => {
    merged[student.student_id] = {};
    criteria.forEach(criterion => {
      const saved = savedMarks?.[student.student_id]?.[criterion.criterion_id];
      merged[student.student_id][criterion.criterion_id] = saved !== undefined ? saved : null;
    });
  });
  return merged;
}

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Bi-weekly cadence: 2 assessments/month instead of weekly.
// Period 1 = 1st-15th, Period 2 = 16th-end of month.
function getCurrentPeriodMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getCurrentPeriodNumber() {
  return new Date().getDate() <= 15 ? 1 : 2;
}

function getPeriodRange(periodMonth, periodNumber) {
  const [year, month] = periodMonth.split('-').map(Number);
  const pad = n => String(n).padStart(2, '0');
  const start = periodNumber === 1 ? 1 : 16;
  const end = periodNumber === 1 ? 15 : new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad(month)}-${pad(start)}`,
    end: `${year}-${pad(month)}-${pad(end)}`
  };
}

function formatTime(dateObj) {
  const d = new Date(dateObj);
  const hours = d.getHours().toString().padStart(2, '0');
  const minutes = d.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function createStatus(text) {
  const p = document.createElement('p');
  p.className = 'empty-state';
  p.textContent = text;
  return p;
}

init();
