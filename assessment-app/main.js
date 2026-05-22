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
import { loadCriteriaForSubject } from './services/criteria-loader.js';
import { getSubjectsForClass, loadSubjects } from './services/subject-loader.js';
import { loadStudentsForClass } from './services/student-loader.js';
import { createSession, validateMark } from './services/assessment-engine.js';
import { initializeMarksWithDefault } from './services/fast-entry-engine.js';
import { calculateSessionProgress } from './services/totals-engine.js';
import { saveSession, getSession, getAllSessions, syncSessionsFromFirestore } from './services/session-storage.js';
import { updateSessionStatus, loadFullSessionData, SESSION_STATUS } from './services/session-review-engine.js';
import { aggregateByMonth, extractYearMonth, clearAggregationCache } from './services/aggregation-engine.js';
import { getCurrentUser, isTeacher, isAdmin, isLoggedIn, resolveAuthSession } from './services/auth-service.js';

// ── Heavy admin-only components — lazy loaded on first admin view ─────────
let _adminLazy = null;
async function getAdminComponents() {
  if (_adminLazy) return _adminLazy;
  const [ms, wsl, ad, rcu, demo] = await Promise.all([
    import('./components/monthly-summary.js'),
    import('./components/weak-student-list.js'),
    import('./components/analytics-dashboard.js'),
    import('./components/report-card-generator-ui.js'),
    import('./services/demo-data-generator.js'),
  ]);
  _adminLazy = {
    createMonthlySummary:       ms.createMonthlySummary,
    createWeakStudentList:      wsl.createWeakStudentList,
    createAnalyticsDashboard:   ad.createAnalyticsDashboard,
    createReportCardGeneratorUI: rcu.createReportCardGeneratorUI,
    generateDemoData:           demo.generateDemoData,
    clearDemoData:              demo.clearDemoData,
    generateWeeklyMathDemo:     demo.generateWeeklyMathDemo,
  };
  return _adminLazy;
}

const classes = ['LKG', 'SKG', 'Class I', 'Class II'];

const state = {
  allSubjects: [],
  subjects: [],
  selectedClass: '',
  selectedSubject: null,
  criteria: [],
  students: [],

  teacherName: '',
  date: getToday(),
  weekStart: getWeekStart(),
  weekEnd: getWeekEnd(),
  dueDate: getWeekEnd(),

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
  saveStatus: 'idle'
};

const setupRoot = document.querySelector('#session-setup-root');
const assessmentRoot = document.querySelector('#assessment-root');
let autosaveTimer = null;

// Read ?student= URL param for deep-link from pro-leo-site
const _deepLinkStudentId = new URLSearchParams(window.location.search).get('student') || '';

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
    syncSessionsFromFirestore().finally(() => render());
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
      syncSessionsFromFirestore().finally(() => render());
    },
    onLogout: () => render(),
    onGenerateDemo: async () => { const a = await getAdminComponents(); a.generateDemoData(); },
    onClearDemo:    async () => { const a = await getAdminComponents(); a.clearDemoData(); },
    onGenerateWeeklyMathDemo: async () => {
      const a = await getAdminComponents();
      const n = await a.generateWeeklyMathDemo();
      alert(`Weekly Maths demo loaded: ${n} sessions for Class I. Profiles updated.`);
      syncSessionsFromFirestore().finally(() => render());
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
    weekStart: state.weekStart,
    weekEnd: state.weekEnd,
    dueDate: state.dueDate,
    savedSessions: getAllSessions().filter(s => s.session.teacher_name === state.teacherName),
    onClassChange: handleClassChange,
    onSubjectChange: handleSubjectChange,
    onTeacherNameChange: handleTeacherNameChange,
    onWeekStartChange: handleWeekStartChange,
    onWeekEndChange: handleWeekEndChange,
    onDueDateChange: handleDueDateChange,
    onStartSession: handleStartSession,
    onResumeSession: handleResumeSession
  }));

  const optionsPanel = document.createElement('div');
  optionsPanel.className = 'panel options-panel';

  const defaultLabel = document.createElement('label');
  defaultLabel.className = 'field';
  defaultLabel.innerHTML = `<input type="checkbox" ${state.useDefaultScore ? 'checked' : ''}> Use default score (4)`;
  defaultLabel.querySelector('input').addEventListener('change', e => {
    state.useDefaultScore = e.target.checked;
    render();
  });

  const quickLabel = document.createElement('label');
  quickLabel.className = 'field';
  quickLabel.innerHTML = `<input type="checkbox" ${state.quickEntryMode ? 'checked' : ''}> Quick entry mode`;
  quickLabel.querySelector('input').addEventListener('change', e => {
    state.quickEntryMode = e.target.checked;
    render();
  });

  optionsPanel.append(defaultLabel, quickLabel);
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
    { key: 'weak', label: 'Weak Students' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'reportcards', label: 'Report Cards' }
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
  } else if (state.adminView === 'weak') {
    renderAdminWeak();
  } else if (state.adminView === 'analytics') {
    renderAdminAnalytics();
  } else if (state.adminView === 'reportcards') {
    renderAdminReportCards();
  }
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

function handleDateChange(date) {
  state.date = date;
  state.errorMessage = '';
}

function handleWeekStartChange(value) {
  state.weekStart = value;
  state.date = value;
  state.errorMessage = '';
}

function handleWeekEndChange(value) {
  state.weekEnd = value;
  state.errorMessage = '';
}

function handleDueDateChange(value) {
  state.dueDate = value;
  state.errorMessage = '';
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

  if (state.useDefaultScore) {
    state.marks = initializeMarksWithDefault(state.students, state.criteria);
  } else {
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

function handleSubmitSession() {
  if (!state.session) return;
  const progress = calculateSessionProgress(state.marks, state.students, state.criteria);
  if (progress.overallPercentage < 100) {
    const ok = confirm(`Only ${progress.overallPercentage}% complete. Submit anyway?`);
    if (!ok) return;
  }
  state.session.status = 'submitted';
  handleSave();
  alert('Session submitted successfully.');
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

function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getWeekEnd() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
