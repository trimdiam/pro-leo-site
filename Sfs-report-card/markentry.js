/**
 * markentry.js — SFS Connect Mark Entry System — Phase 1 & 2
 * Subject Teacher: Login → Dashboard → Class Grid
 * Class Teacher:   Login → CT Dashboard → Student List → Student Form
 */

'use strict';

// ─── ROMAN NUMERAL ↔ INTEGER ──────────────────────────────────────────────────
const ROMAN_TO_INT = { I:1,II:2,III:3,IV:4,V:5,VI:6,VII:7,VIII:8,IX:9,X:10 };
const INT_TO_ROMAN = { 1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII',9:'IX',10:'X' };

function classNumFromId(classId) {
  // "IX" → 9, "IX-A" → 9, "3" → 3, "III" → 3
  const raw = String(classId).split('-')[0].trim().toUpperCase();
  return ROMAN_TO_INT[raw] || parseInt(raw) || null;
}

// Convert any class identifier to a plain Roman-numeral string — NO section suffix.
// Source of truth is teacher.classTeacher (admin form, Arabic numerals 1-10).
// "1" → "I",  "9" → "IX",  "III" → "III",  "IX-A" → "IX"
function toRomanClassId(raw) {
  if (!raw) return null;
  const base = String(raw).split('-')[0].trim().toUpperCase();
  const num  = parseInt(base);
  if (!isNaN(num) && INT_TO_ROMAN[num]) return INT_TO_ROMAN[num];
  // Already Roman or unknown — return as-is (strip section if present)
  return base;
}

// ─── STATE ────────────────────────────────────────────────────────────────────
const ME = {
  user:         null,
  teacher:      null,      // full teacher document data
  isClassTeacher: false,
  ctClassId:    null,      // e.g. "III" (Roman, no section)
  ctClassNum:   null,      // e.g. 3
  activeClass:  null,      // subject teacher grid context
  activeStudent: null,     // { studentId, studentData, hyData, ftData }
  saveTimer:    null,
  pendingSaves: new Map()
};

// ─── GRADES ───────────────────────────────────────────────────────────────────
const GRADES = ['O','A+','A','B+','B','C'];

function computeGrade(total, max = 100) {
  const pct = (total / max) * 100;
  if (pct >= 90) return 'O';
  if (pct >= 80) return 'A+';
  if (pct >= 70) return 'A';
  if (pct >= 60) return 'B+';
  if (pct >= 50) return 'B';
  if (pct >= 40) return 'C';
  if (pct >= 33) return 'D';
  return 'F';
}

// ─── AGGREGATE / PASS-FLOOR HELPERS (2026-07) ──────────────────────────────────
// Aggregate subjects (Science P+C+B, S.Science, English I+II) have no Firestore
// entry of their own — they're derived from their leaf components. Every class
// (3-10) declares aggregateMethod:'average' in config.js for these, so the
// average — not a raw sum — is what's compared against the class's passmark
// (40 for Classes 3-8, 30 for Classes 9-10). This applies uniformly; it is not
// senior-scheme-specific (only the IA/Theory component floor below is).
function computeAggregateSubject(academics, subj) {
  const comps = subj.components || [];
  let totalSum = 0, iaSum = 0, examSum = 0, count = 0;
  comps.forEach(k => {
    const a = academics?.[k];
    if (!a) return;
    totalSum += a.total ?? 0;
    iaSum    += a.IA ?? a.singleMark ?? 0;
    examSum  += a.TE ?? 0;
    count++;
  });
  if (subj.aggregateMethod === 'average') {
    return count > 0
      ? { ia: Math.round(iaSum / count), exam: Math.round(examSum / count), total: Math.round(totalSum / count) }
      : { ia: 0, exam: 0, total: 0 };
  }
  return { ia: iaSum, exam: examSum, total: totalSum };
}

// Senior-scheme (Class 9/10) component pass floors, proportional to the
// configured passmark: IA floor = 20 * passmark/100, Exam floor = 80 *
// passmark/100 (passmark 30 -> IA 6, Exam 24). A subject fails if its total
// clears the passmark but IA or Exam individually don't (2026-07 rule).
function getComponentFloors(cfg) {
  const passmark = cfg.passmark || 40;
  return {
    iaFloor:   Math.round(20 * passmark / 100),
    examFloor: Math.round(80 * passmark / 100)
  };
}

function subjectFailsFloor(ia, exam, cfg, subj) {
  if (cfg.markScheme !== 'senior' || subj.singleTotal) return false;
  const { iaFloor, examFloor } = getComponentFloors(cfg);
  return ia < iaFloor || exam < examFloor;
}

// ─── DOM HELPERS ──────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

function showScreen(id) {
  document.querySelectorAll('.me-screen').forEach(s => s.classList.remove('active'));
  $(id).classList.add('active');
}

function showSaveIndicator(text = 'Saving…') {
  const ind = $('saveIndicator');
  ind.textContent = text;
  ind.classList.add('visible');
}
function hideSaveIndicator(text = '') {
  const ind = $('saveIndicator');
  if (text) { ind.textContent = text; setTimeout(() => ind.classList.remove('visible'), 1800); }
  else ind.classList.remove('visible');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── OFFLINE BANNER ─────────────────────────────────────────────────────────
// Paired with the enablePersistence() call in firebase-init.js — that makes
// writes survive being offline; this makes the offline state VISIBLE so a
// teacher isn't left guessing whether "Saving…" actually went through.
function updateOfflineBanner() {
  const banner = $('meOfflineBanner');
  if (banner) banner.style.display = navigator.onLine ? 'none' : 'block';

  // If the mark-entry grid is open on a shared-entry subject, keep its
  // stale-lock warning in sync with live connectivity changes too (not just
  // the state at the moment the grid was opened).
  const warnEl = $('gridSharedOfflineWarning');
  if (warnEl && ME.activeClass) {
    const isSharedSubj = findSubjectConfig(ME.activeClass.classNum, ME.activeClass.subjectKey)?.sharedEntry === true;
    warnEl.style.display = (isSharedSubj && !navigator.onLine) ? 'block' : 'none';
  }
}
window.addEventListener('online',  updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);
document.addEventListener('DOMContentLoaded', updateOfflineBanner);
updateOfflineBanner();

// ─── BACK TO PORTAL (offline-safe) ──────────────────────────────────────────
// "Back to Portal" is a FULL page reload of index.html — it re-runs the whole
// main-portal bootstrap (Auth restore, then a large number of its own
// dashboard-loading Firestore calls in app-logic.js) that hasn't been audited
// for offline safety the way mark entry has. Rather than risk stranding a
// teacher on a broken/blank portal page mid-entry, refuse to leave at all
// while offline — mark entry itself is the safe, hardened place to stay.
// Their entries are already safely queued locally regardless (enablePersistence).
function meBackToPortal() {
  if (!navigator.onLine) {
    alert('You\'re offline right now, so "Back to Portal" is disabled to avoid interrupting your work — the portal needs a connection to load. Your entries are already saved on this device and will sync automatically once you\'re back online. You can keep entering marks here in the meantime.');
    return;
  }
  history.length > 1 ? history.back() : (window.location.href = '/');
}

function subjectToKey(subjectLabel, classNum) {
  const cfg = CONFIG[parseInt(classNum)];
  if (!cfg) return '';
  const found = cfg.subjects.find(s => s.label === subjectLabel);
  return found ? found.key : '';
}

// Co-scholastic activities are now assignable to subject teachers. They live in
// cfg.coScholastic (not cfg.subjects), so any lookup by key must check both.
function findSubjectConfig(classNum, key) {
  const cfg = CONFIG[parseInt(classNum)];
  if (!cfg) return null;
  return (cfg.subjects || []).find(s => s.key === key)
      || (cfg.coScholastic || []).find(s => s.key === key)
      || null;
}

// True when a subject is entered as a GRADE (O–C dropdown), not numeric marks.
function isGradeSubject(classNum, key) {
  const s = findSubjectConfig(classNum, key);
  return !!(s && s.entryType === 'grade');
}

// Co-scholastic grades are stored in coScholastic[key].{T1|T2}; T1=HY, T2=FT —
// the exact shape the class-teacher form and report card already read.
function termToCoScholasticSlot(term) {
  return term === 'HY' ? 'T1' : 'T2';
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
// Auth state — show loading until Firebase resolves the session from storage.
// This prevents a false login screen flash when navigating from the main portal.
let _authResolved = false;
auth.onAuthStateChanged(async user => {
  _authResolved = true;
  if (user) {
    // The main portal (app-logic.js) decides whether to WAIT for Firebase
    // Auth to restore or give up immediately based on this flag — it's
    // normally only set by the portal's own login form (script.js loginAs()).
    // Mark entry has its own separate login screen, so without this, a
    // teacher who reaches mark entry directly (bookmark/deep link, not via
    // clicking through the portal) gets bounced to the portal's login page
    // on "Back to Portal" even though their Firebase session is still valid.
    try { localStorage.setItem('sf_session_role', 'teacher'); } catch (_) {}
    ME.user = user;
    await loadTeacherAndRoute(user.uid);
  } else {
    ME.user = null;
    ME.teacher = null;
    showScreen('screenLogin');
  }
});
// Safety fallback: if auth hasn't resolved in 4s, show login
setTimeout(() => { if (!_authResolved) showScreen('screenLogin'); }, 4000);

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function idToEmail(id) {
  return id.trim().toLowerCase().replace(/[^a-z0-9]/g, '_') + '@stfrancis.school';
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = idToEmail($('loginEmail').value);
  const password = $('loginPassword').value;
  const errEl    = $('loginError');
  errEl.textContent = '';
  $('btnLogin').disabled = true;
  $('btnLogin').textContent = 'Signing in…';

  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    errEl.textContent = friendlyAuthError(err.code);
    $('btnLogin').disabled = false;
    $('btnLogin').textContent = 'Sign In as Teacher';
  }
});

function friendlyAuthError(code) {
  const map = {
    'auth/invalid-email':          'Invalid Teacher ID.',
    'auth/user-not-found':         'No account found for this ID.',
    'auth/wrong-password':         'Incorrect password.',
    'auth/too-many-requests':      'Too many attempts. Try again later.',
    'auth/network-request-failed': 'Network error. Check your connection.'
  };
  return map[code] || 'Sign-in failed. Please try again.';
}

$('btnLogout').addEventListener('click', () => auth.signOut());

// ─── LOAD TEACHER & ROUTE ─────────────────────────────────────────────────────
async function loadTeacherAndRoute(uid) {
  try {
    let teacherData = null;
    const TEACHER_CACHE_KEY = 'sfs_me_teacher_' + uid;

    try {
      // Try master-prompt structure: /teachers/{uid}
      const directSnap = await db.collection('teachers').doc(uid).get();
      if (directSnap.exists) {
        teacherData = directSnap.data();
      } else {
        // Fall back to existing site structure: /users/{uid} → /teachers?teacherId=...
        const userSnap = await db.collection('users').doc(uid).get();
        if (userSnap.exists) {
          const userData = userSnap.data();
          const tid = userData.teacherId || userData.loginId || '';
          if (tid) {
            // Try exact match on teacherId field
            let tSnap = await db.collection('teachers')
              .where('teacherId', '==', tid).limit(1).get();
            // Try case-insensitive variant (uppercase)
            if (tSnap.empty) {
              tSnap = await db.collection('teachers')
                .where('teacherId', '==', tid.toUpperCase()).limit(1).get();
            }
            // Try loginId field mirror (set by createTeacherLogin)
            if (tSnap.empty) {
              tSnap = await db.collection('teachers')
                .where('loginId', '==', tid).limit(1).get();
            }
            if (!tSnap.empty) teacherData = tSnap.docs[0].data();
          }
        }
      }
      // Remember the last successfully-resolved profile in localStorage —
      // simple, synchronous, on-device, and NOT split across Firestore SDK
      // instances the way its own IndexedDB persistence cache can be (the
      // main portal and mark-entry use separate Firebase app instances).
      if (teacherData) {
        try { localStorage.setItem(TEACHER_CACHE_KEY, JSON.stringify(teacherData)); } catch (_) {}
      }
    } catch (lookupErr) {
      // Live lookup failed (typically: genuinely offline and Firestore's own
      // cache has nothing for this exact query chain). Fall back to the
      // profile saved on the last successful ONLINE login for this teacher.
      let cached = null;
      try { cached = JSON.parse(localStorage.getItem(TEACHER_CACHE_KEY) || 'null'); } catch (_) {}
      if (cached) {
        teacherData = cached;
      } else {
        throw lookupErr; // nothing to fall back to — let the outer catch handle it
      }
    }

    if (!teacherData) {
      showScreen('screenDashboard');
      $('dashboardBody').innerHTML = '<tr><td colspan="5" class="me-empty">Teacher record not found. Contact admin.</td></tr>';
      return;
    }

    ME.teacher = { uid, ...teacherData };
    $('headerTeacherName').textContent = ME.teacher.name || '';
    $('btnLogout').style.display = '';
    $('btnBackPortal').style.display = '';

    // Detect class teacher role
    ME.isClassTeacher = (ME.teacher.role === 'class_teacher') ||
                        !!ME.teacher.classTeacherOf ||
                        !!ME.teacher.classTeacher;

    // Source of truth: teacher.classTeacher (set by admin form, Arabic 1-10).
    // classTeacherOf is legacy — fall back to it only if classTeacher is absent.
    // No sections — classId is plain Roman numeral: "I", "IX", not "I-A".
    if (ME.isClassTeacher) {
      const raw = ME.teacher.classTeacher || ME.teacher.classTeacherOf || '';
      ME.ctClassId  = toRomanClassId(raw);
      ME.ctClassNum = ME.ctClassId ? classNumFromId(ME.ctClassId) : null;
    }

    // ─── PHASE 3: URL param deep-linking ───────────────────────────────────
    const params      = new URLSearchParams(window.location.search);
    const urlClassId  = params.get('classId');
    const urlSubject  = params.get('subject');
    const urlTerm     = params.get('term') || 'HY';
    const urlAction   = params.get('action');
    const urlAdminRC  = params.get('adminRC'); // "IX/SFS260101"

    if (urlAdminRC) {
      // Admin viewing a student's report card directly — read from sessionStorage
      const payload = JSON.parse(sessionStorage.getItem('sfds_adminRC') || 'null');
      if (payload) { await openReportCardFromAdmin(payload); return; }
    }

    if (urlClassId && urlSubject) {
      // Deep-link: go directly to mark entry grid
      const normClassId = toRomanClassId(urlClassId);
      const classNumInt = classNumFromId(normClassId);
      const subjectCfg  = CONFIG[classNumInt]?.subjects.find(s => s.key === urlSubject);
      const subjectLbl  = subjectCfg?.label || urlSubject;
      await openGrid(normClassId, classNumInt, null, subjectLbl, urlSubject, urlTerm);
      return;
    }

    if (urlClassId && urlAction === 'review' && ME.isClassTeacher) {
      // Deep-link: go directly to class teacher student list
      // Normalize to plain Roman (strip any "-A" section suffix) so the marks
      // path matches what subject teachers wrote to (e.g. "X-A" → "X").
      ME.ctClassId  = toRomanClassId(urlClassId);
      ME.ctClassNum = classNumFromId(urlClassId);
      await openStudentList(urlTerm);
      return;
    }
    // ────────────────────────────────────────────────────────────────────────

    if (ME.isClassTeacher) {
      await renderCTDashboard();
      showScreen('screenCTDashboard');
    } else {
      $('teacherName').textContent = ME.teacher.name || 'Teacher';
      await renderSubjectDashboard();
      showScreen('screenDashboard');
    }
  } catch (err) {
    console.error(err);
    showScreen('screenDashboard');
    const offline = !navigator.onLine || /offline|unavailable/i.test(err.message || '');
    const msg = offline
      ? 'Your profile hasn’t synced to this device yet. Please connect to the internet once, reopen Mark Entry, and it will then work offline.'
      : `Error: ${err.message}`;
    $('dashboardBody').innerHTML = `<tr><td colspan="5" class="me-empty">${msg}</td></tr>`;
  }
}

// ════════════════════════════════════════════════════════════════════════════════
// SUBJECT TEACHER — DASHBOARD & GRID (Phase 1)
// ════════════════════════════════════════════════════════════════════════════════

async function renderSubjectDashboard() {
  const assignments = ME.teacher.assignments || [];
  if (!assignments.length) {
    $('dashboardBody').innerHTML = '<tr><td colspan="5" class="me-empty">No subject assignments found. Contact admin.</td></tr>';
    return;
  }

  // Phase 3 format has classId directly; legacy format uses asgn.class + asgn.section
  const isNewFormat = assignments[0].classId !== undefined;

  if (isNewFormat) {
    await renderSubjectDashboardNew(assignments);
  } else {
    await renderSubjectDashboardLegacy(assignments);
  }
}

// Phase 3 format: { subjectKey, subjectLabel, classId, classNum, section, term }
async function renderSubjectDashboardNew(assignments) {
  // Fetch statuses per termKey
  const statusMap = {};
  const termSets = new Set(assignments.map(a => `${a.classId}_${a.term}`));
  for (const termKey of termSets) {
    try {
      const snap = await db.collection('marks').doc(termKey).collection('students').limit(200).get();
      snap.forEach(doc => {
        const data = doc.data();
        const submitted = data.submittedSubjects || {};
        assignments.filter(a => `${a.classId}_${a.term}` === termKey).forEach(a => {
          const mapKey = `${termKey}__${a.subjectKey}`;
          if (data.status === 'locked')
            statusMap[mapKey] = 'locked';
          else if (submitted[a.subjectKey]?.status === 'submitted')
            statusMap[mapKey] = statusMap[mapKey] === 'locked' ? 'locked' : 'submitted';
          else if (data.status === 'draft')
            statusMap[mapKey] = statusMap[mapKey] || 'draft';
        });
      });
    } catch (_) {}
  }

  const tbody = $('dashboardBody');
  tbody.innerHTML = '';

  // Update header for new layout (Class | Subject | Term | Status | Action)
  const thead = tbody.closest('table').querySelector('thead tr');
  if (thead) thead.innerHTML = '<th>Class</th><th>Subject</th><th>Term</th><th>Status</th><th>Action</th>';

  for (const asgn of assignments) {
    const { subjectKey, subjectLabel, classId, classNum, section, term } = asgn;
    const classNumParsed = classNum || parseInt(classId.split('-')[0]);
    const sec = section || classId.split('-')[1] || 'A';
    const mapKey = `${classId}_${term}__${subjectKey}`;
    const status = statusMap[mapKey] || 'not-started';

    const tr = el('tr');
    tr.innerHTML = `
      <td>${classId}</td>
      <td>${escHtml(subjectLabel)}</td>
      <td>${term === 'HY' ? 'Half Yearly' : 'Final Term'}</td>
      <td>${statusBadge(status)}</td>
      <td>${status !== 'locked'
        ? `<button class="btn btn-sm btn-secondary me-enter-btn"
             data-classid="${classId}" data-classnum="${classNumParsed}"
             data-section="${sec}" data-subject="${escHtml(subjectLabel)}"
             data-subjectkey="${subjectKey}" data-term="${term}">
             Enter Marks &rarr;
           </button>`
        : '<span style="color:var(--me-muted);font-size:0.82rem;">&#128274; Locked</span>'
      }</td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.me-enter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openGrid(btn.dataset.classid, btn.dataset.classnum, btn.dataset.section,
               btn.dataset.subject, btn.dataset.subjectkey, btn.dataset.term);
    });
  });
}

// Legacy format: { class, section, subject } — also handles mixed (subjectLabel/subjectKey present)
async function renderSubjectDashboardLegacy(assignments) {
  const rows = [];
  for (const asgn of assignments) {
    const classId    = asgn.classId || `${asgn.class}-${asgn.section}`;
    const subjectRef = asgn.subjectKey || asgn.subject || asgn.subjectLabel || '';
    for (const term of ['HY', 'FT']) rows.push({ ...asgn, classId, term, _subjectRef: subjectRef });
  }

  const statusMap = await fetchAssignmentStatuses(rows);
  const tbody = $('dashboardBody');
  tbody.innerHTML = '';

  const seen = new Set();
  for (const asgn of assignments) {
    const classId      = asgn.classId || `${asgn.class}-${asgn.section}`;
    const classNum     = asgn.classNum || asgn.class;
    const section      = asgn.section || classId.split('-')[1] || 'A';
    const subjectName  = asgn.subject || asgn.subjectLabel || '—';
    const subjectKey   = asgn.subjectKey || subjectToKey(subjectName, classNum);

    const key = `${classId}__${subjectKey || subjectName}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const hyStatus = statusMap[`${classId}_HY__${subjectKey || subjectName}`] || 'not-started';
    const ftStatus = statusMap[`${classId}_FT__${subjectKey || subjectName}`] || 'not-started';

    const tr = el('tr');
    tr.innerHTML = `
      <td>${classNum}</td>
      <td>${section}</td>
      <td>${escHtml(subjectName)}</td>
      <td>${statusBadge(hyStatus)} ${actionBtn(classId, classNum, section, subjectName, subjectKey, 'HY', hyStatus)}</td>
      <td>${statusBadge(ftStatus)} ${actionBtn(classId, classNum, section, subjectName, subjectKey, 'FT', ftStatus)}</td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.me-enter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openGrid(btn.dataset.classid, btn.dataset.classnum, btn.dataset.section,
               btn.dataset.subject, btn.dataset.subjectkey, btn.dataset.term);
    });
  });
}

async function fetchAssignmentStatuses(rows) {
  const statusMap = {};
  const termSets = new Set(rows.map(r => `${r.classId}_${r.term}`));

  for (const termKey of termSets) {
    try {
      const snap = await db.collection('marks').doc(termKey).collection('students').limit(200).get();
      snap.forEach(doc => {
        const data = doc.data();
        const submitted = data.submittedSubjects || {};
        rows.filter(r => `${r.classId}_${r.term}` === termKey).forEach(r => {
          const subRef = r._subjectRef || r.subjectKey || r.subject || '';
          const mapKey = `${termKey}__${subRef}`;
          if (data.status === 'locked')
            statusMap[mapKey] = 'locked';
          else if (submitted[subRef]?.status === 'submitted')
            statusMap[mapKey] = statusMap[mapKey] === 'locked' ? 'locked' : 'submitted';
          else if (data.status === 'draft')
            statusMap[mapKey] = statusMap[mapKey] || 'draft';
        });
      });
    } catch (_) { /* collection may not exist yet */ }
  }
  return statusMap;
}

function statusBadge(status) {
  const map = {
    'not-started': ['status-not-started', '&#9711; Not Started'],
    'draft':       ['status-draft',       '&#9998; Draft'],
    'submitted':   ['status-submitted',   '&#10003; Submitted'],
    'locked':      ['status-locked',      '&#128274; Locked']
  };
  const [cls, label] = map[status] || map['not-started'];
  return `<span class="status-badge ${cls}">${label}</span>`;
}

function actionBtn(classId, classNum, section, subject, subjectKey, term, status) {
  if (status === 'locked') return '';
  const key   = subjectKey || subjectToKey(subject, classNum);
  const label = term === 'HY' ? 'HY Marks' : 'FT Marks';
  return `<button class="btn btn-sm btn-secondary me-enter-btn"
    data-classid="${classId}" data-classnum="${classNum}" data-section="${section}"
    data-subject="${escHtml(subject)}" data-subjectkey="${key}" data-term="${term}">
    ${label}
  </button>`;
}

// ─── GRID ─────────────────────────────────────────────────────────────────────
async function openGrid(classId, classNum, section, subjectLabel, subjectKey, term) {
  // Resolve classNum as integer (handles Roman numerals like "IX" → 9)
  const classNumInt = classNumFromId(classId) || parseInt(classNum) || classNum;
  // Normalize to plain Roman ("V-A"/"V-undefined" → "V") so the marks doc id
  // matches exactly what the class teacher and report card read. Without this,
  // TA-panel assignments (which carry no section) would write to "V-undefined_HY"
  // and silently never reflect.
  const romanClassId = toRomanClassId(classId) || classId;
  const entryType = isGradeSubject(classNumInt, subjectKey) ? 'grade' : 'marks';
  ME.activeClass = { classId: romanClassId, classNum: classNumInt, section, subjectLabel, subjectKey, term, entryType };

  showScreen('screenGrid');
  $('gridTitle').textContent = `Class ${romanClassId} — ${subjectLabel} — ${term === 'HY' ? 'Half Yearly' : 'Final Term'}`;
  $('gridSubtitle').textContent = 'Academic Year 2026–2027';
  $('gridTableWrap').innerHTML = '<div class="me-loading"><div class="me-spinner"></div><br>Loading students…</div>';

  // Split-subject lock relies on each device's last-synced view of who entered
  // what. Offline, that view can be stale, so flag it explicitly here rather
  // than let the lock silently mislead either teacher. ME.activeClass is set
  // above, so updateOfflineBanner() can resolve the shared-entry check itself.
  updateOfflineBanner();

  try {
    // Students are stored with separate 'class' and 'section' fields, not a combined classId
    const classStr = String(classNumInt || classNumFromId(classId));

    const studSnap = await db.collection('students')
      .where('class', '==', classStr)
      .get();

    if (studSnap.empty) {
      $('gridTableWrap').innerHTML = `<div class="me-empty">No students found for Class ${classId}.</div>`;
      return;
    }

    // Sort by rollNo client-side (avoids composite index requirement)
    const students = studSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.rollNo || 0) - (b.rollNo || 0));
    const termKey  = `${romanClassId}_${term}`;
    const existing = {};

    try {
      const markSnaps = await Promise.all(
        students.map(s => db.collection('marks').doc(termKey).collection('students').doc(s.id).get())
      );
      markSnaps.forEach((snap, i) => { if (snap.exists) existing[students[i].id] = snap.data(); });
    } catch (_) {}

    renderGrid(students, existing);
  } catch (err) {
    console.error(err);
    $('gridTableWrap').innerHTML = `<div class="me-empty">Error: ${err.message}</div>`;
  }
}

function renderGrid(students, existing) {
  const { classNum, subjectKey, term } = ME.activeClass;
  const cfg      = CONFIG[classNum];
  const subj     = findSubjectConfig(classNum, subjectKey);
  const isGrade  = ME.activeClass.entryType === 'grade';
  const isSingle = subj?.singleTotal === true;
  const isSenior = cfg?.markScheme === 'senior';
  const slot     = termToCoScholasticSlot(term);
  const wrap     = $('gridTableWrap');
  wrap.innerHTML  = '';

  // Build column headers based on mark scheme
  let colHeaders;
  if (isGrade) {
    colHeaders = '<th>Grade</th>';
  } else if (isSingle) {
    colHeaders = '<th>Marks /100</th>';
  } else if (isSenior) {
    colHeaders = '<th>IA /20</th><th>TE /80</th>';
  } else {
    colHeaders = '<th>IA /10</th><th>UT /30</th><th>TE /60</th>';
  }

  const table = el('table', 'me-grid-table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>#</th><th>Student Name</th>
        ${colHeaders}
        <th>${isGrade ? 'Selected' : 'Total'}</th>
      </tr>
    </thead>
    <tbody id="gridTbody"></tbody>
  `;
  wrap.appendChild(table);

  const tbody    = table.querySelector('#gridTbody');
  const allInputs = [];

  const isShared = subj?.sharedEntry === true;
  const myUid    = ME.user?.uid;

  students.forEach((student, idx) => {
    const existData = existing[student.id]?.academics?.[subjectKey] || {};
    const isLocked  = existing[student.id]?.status === 'locked';

    // ── Per-cell lock for split (shared-entry) subjects ──────────────────────
    // If this student's mark was entered by the OTHER assigned teacher, it is
    // read-only to me (I can still edit my own, and empty cells stay open). This
    // is what keeps Khasi vs Alt-English (and Val-Edu vs Catechism) from
    // clobbering each other when both teachers see the full class list.
    const enteredBy = isGrade
      ? existing[student.id]?.coScholastic?.[subjectKey]?.enteredBy
      : existData.enteredBy;
    const lockedByOther = isShared && !!enteredBy && enteredBy !== myUid;
    const cellLocked = isLocked || lockedByOther;
    const dis        = cellLocked ? 'disabled' : '';
    const lockTitle  = lockedByOther ? ' title="🔒 Entered by the other assigned teacher"' : '';

    const tr = el('tr');
    tr.dataset.studentId = student.id;
    if (lockedByOther) tr.classList.add('me-locked-other');

    if (isGrade) {
      // Co-scholastic grade: O–C dropdown, read from coScholastic[key].{T1|T2}
      const g = existing[student.id]?.coScholastic?.[subjectKey]?.[slot] ?? '';
      const opts = GRADES.map(gr => `<option value="${gr}" ${gr === g ? 'selected' : ''}>${gr}</option>`).join('');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escHtml(student.name)}</td>
        <td><select class="me-mark-input grade" data-field="grade" ${dis}${lockTitle}>
          <option value="">—</option>${opts}
        </select></td>
        <td class="me-total-cell ${g ? 'pass' : 'empty'}" data-total>${g || '—'}${lockedByOther ? ' 🔒' : ''}</td>
      `;
    } else if (isSingle) {
      const val = existData.singleMark ?? '';
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escHtml(student.name)}</td>
        <td><input type="number" class="me-mark-input single" data-field="singleMark" data-max="100" value="${val}" min="0" max="100" ${dis}${lockTitle}></td>
        <td class="me-total-cell empty" data-total>—</td>
      `;
    } else if (isSenior) {
      const ia = existData.IA ?? '', te = existData.TE ?? '';
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escHtml(student.name)}</td>
        <td><input type="number" class="me-mark-input" data-field="IA" data-max="20"  value="${ia}" min="0" max="20"  ${dis}${lockTitle}></td>
        <td><input type="number" class="me-mark-input" data-field="TE" data-max="80"  value="${te}" min="0" max="80"  ${dis}${lockTitle}></td>
        <td class="me-total-cell empty" data-total>—</td>
      `;
    } else {
      const ia = existData.IA ?? '', ut = existData.UT ?? '', te = existData.TE ?? '';
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${escHtml(student.name)}</td>
        <td><input type="number" class="me-mark-input" data-field="IA" data-max="10"  value="${ia}" min="0" max="10"  ${dis}${lockTitle}></td>
        <td><input type="number" class="me-mark-input" data-field="UT" data-max="30"  value="${ut}" min="0" max="30"  ${dis}${lockTitle}></td>
        <td><input type="number" class="me-mark-input" data-field="TE" data-max="60"  value="${te}" min="0" max="60"  ${dis}${lockTitle}></td>
        <td class="me-total-cell empty" data-total>—</td>
      `;
    }

    tbody.appendChild(tr);
    const inputs = tr.querySelectorAll('.me-mark-input');
    inputs.forEach(inp => allInputs.push(inp));

    if (isGrade) {
      const sel = tr.querySelector('[data-field="grade"]');
      if (sel && !cellLocked) {
        sel.addEventListener('change', () => {
          const cell = tr.querySelector('[data-total]');
          cell.textContent = sel.value || '—';
          cell.className   = `me-total-cell ${sel.value ? 'pass' : 'empty'}`;
          scheduleSave(student.id, tr, false);
        });
      }
    } else {
      updateRowTotal(tr, isSingle);
      if (!cellLocked) {
        inputs.forEach(inp => {
          inp.addEventListener('input',  () => { validateInput(inp); updateRowTotal(tr, isSingle); });
          inp.addEventListener('blur',   () => { validateInput(inp); updateRowTotal(tr, isSingle); scheduleSave(student.id, tr, isSingle); });
        });
      }
    }
  });

  allInputs.forEach((inp, i) => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const next = allInputs[i + 1]; if (next) next.focus(); }
    });
  });
}

function validateInput(inp) {
  const max = parseInt(inp.dataset.max);
  const val = parseFloat(inp.value);
  if (inp.value !== '' && (isNaN(val) || val < 0 || val > max)) {
    inp.classList.add('error');
    inp.title = `Maximum allowed: ${max}`;
    return false;
  }
  inp.classList.remove('error');
  inp.title = '';
  return true;
}

function updateRowTotal(tr, isSingle) {
  const totalCell = tr.querySelector('[data-total]');
  const classNum  = ME.activeClass?.classNum;
  const cfg = CONFIG[classNum];
  const passmark = cfg?.passmark ?? 40;
  let total = null, ia = null, te = null;

  if (isSingle) {
    const inp = tr.querySelector('[data-field="singleMark"]');
    if (inp.value !== '') total = parseFloat(inp.value) || 0;
  } else {
    const iaInp = tr.querySelector('[data-field="IA"]');
    const ut = tr.querySelector('[data-field="UT"]');
    const teInp = tr.querySelector('[data-field="TE"]');
    const fields = [iaInp, teInp];
    if (ut) fields.splice(1, 0, ut);
    if (fields.some(f => f && f.value !== '')) {
      total = fields.reduce((sum, f) => sum + (f ? (parseFloat(f.value) || 0) : 0), 0);
      ia = parseFloat(iaInp?.value) || 0;
      te = parseFloat(teInp?.value) || 0;
    }
  }

  if (total === null) {
    totalCell.textContent = '—';
    totalCell.className = 'me-total-cell empty';
  } else {
    // Component-floor check only applies to a subject that counts toward the
    // grand total directly (not an aggregate component like Physics, whose
    // own floor doesn't matter — only the Science average's does).
    const subj = cfg && findSubjectConfig(classNum, ME.activeClass?.subjectKey);
    const floorFail = subj && subj.countInTotal && !isSingle &&
      subjectFailsFloor(ia, te, cfg, subj);
    totalCell.textContent = total;
    totalCell.className = `me-total-cell ${(total >= passmark && !floorFail) ? 'pass' : 'fail'}`;
  }
}

function scheduleSave(studentId, tr, isSingle) {
  const data = collectRowData(tr, isSingle);
  if (data === SKIP_ROW) return;   // split subject: blank or other-teacher's cell
  ME.pendingSaves.set(studentId, data);
  clearTimeout(ME.saveTimer);
  ME.saveTimer = setTimeout(() => flushSaves(), 800);
}

// Sentinel: a row that must NOT be persisted. Used for split (sharedEntry)
// subjects to skip BLANK rows (writing nulls would clobber the other teacher)
// and cells locked to the other teacher. Callers must check for it.
const SKIP_ROW = '__SKIP_ROW__';

function collectRowData(tr, isSingle) {
  const { subjectKey, classNum, entryType } = ME.activeClass;
  const subj     = findSubjectConfig(classNum, subjectKey);
  const isShared = subj?.sharedEntry === true;
  const cfg      = CONFIG[classNum];
  const isSenior = cfg?.markScheme === 'senior';

  // Split subject: never persist a cell owned (entered) by the other teacher.
  if (isShared && tr.classList.contains('me-locked-other')) return SKIP_ROW;

  if (entryType === 'grade') {
    // Co-scholastic: just the selected grade string ('' = cleared). flushSaves
    // routes this to coScholastic[key].{T1|T2}, NOT academics.
    const sel   = tr.querySelector('[data-field="grade"]');
    const grade = sel ? sel.value : '';
    if (isShared && grade === '') return SKIP_ROW;          // don't write blanks
    return isShared ? { grade, enteredBy: ME.user.uid } : { grade };
  }

  const academic = {};
  if (isSingle) {
    const val = parseFloat(tr.querySelector('[data-field="singleMark"]').value);
    academic[subjectKey] = { singleMark: isNaN(val) ? null : val, total: isNaN(val) ? null : val };
  } else if (isSenior) {
    const ia = parseFloat(tr.querySelector('[data-field="IA"]').value);
    const te = parseFloat(tr.querySelector('[data-field="TE"]').value);
    const total = (!isNaN(ia)||!isNaN(te)) ? (isNaN(ia)?0:ia)+(isNaN(te)?0:te) : null;
    academic[subjectKey] = { IA: isNaN(ia)?null:ia, TE: isNaN(te)?null:te, total };
  } else {
    const ia = parseFloat(tr.querySelector('[data-field="IA"]').value);
    const ut = parseFloat(tr.querySelector('[data-field="UT"]').value);
    const te = parseFloat(tr.querySelector('[data-field="TE"]').value);
    const total = (!isNaN(ia)||!isNaN(ut)||!isNaN(te))
      ? (isNaN(ia)?0:ia)+(isNaN(ut)?0:ut)+(isNaN(te)?0:te) : null;
    academic[subjectKey] = { IA: isNaN(ia)?null:ia, UT: isNaN(ut)?null:ut, TE: isNaN(te)?null:te, total };
  }
  if (isShared) {
    const leaf = academic[subjectKey];
    if (leaf.total === null || leaf.total === undefined) return SKIP_ROW;  // blank → skip
    leaf.enteredBy = ME.user.uid;                          // stamp ownership
  }
  return academic;
}

async function flushSaves() {
  if (!ME.pendingSaves.size || !ME.activeClass) return;
  const { classId, term, subjectKey, entryType } = ME.activeClass;
  const termKey = `${classId}_${term}`;
  const slot    = termToCoScholasticSlot(term);
  const batch   = db.batch();
  showSaveIndicator('Saving…');

  for (const [studentId, payload] of ME.pendingSaves) {
    if (entryType === 'grade') {
      // Co-scholastic grade → coScholastic[key].{T1|T2}. Write to BOTH term docs
      // so readers (report card uses hyData.coScholastic first, falls back to
      // ftData) always find it — mirroring the class-teacher dual-write.
      const leaf = { [slot]: payload.grade || '' };
      if (payload.enteredBy) leaf.enteredBy = payload.enteredBy;  // split-subject ownership
      const coWrite = {
        coScholastic:  { [subjectKey]: leaf },
        lastUpdatedBy: ME.user.uid,
        lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      for (const t of ['HY', 'FT']) {
        const ref = db.collection('marks').doc(`${classId}_${t}`).collection('students').doc(studentId);
        batch.set(ref, coWrite, { merge: true });
      }
      continue;
    }
    const ref = db.collection('marks').doc(termKey).collection('students').doc(studentId);
    // Pass the nested object — set({merge:true}) recursively merges nested maps,
    // so academics.{otherSubject} is preserved. Dot-notation keys ("academics.x")
    // would NOT work here: set() treats them as literal top-level field names
    // with a dot in them; only update() interprets dots as field paths.
    batch.set(ref, {
      academics:     payload,
      status:        'draft',
      lastUpdatedBy: ME.user.uid,
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  ME.pendingSaves.clear();

  try {
    await batch.commit();
    hideSaveIndicator('Saved ✓');
  } catch (err) {
    console.error('Save failed:', err);
    hideSaveIndicator('Save failed ✗');
    alert('Save failed: ' + (err.message || err.code || 'unknown error') +
          '\n\nMost likely cause: Firestore security rules for /marks are not deployed.' +
          '\nRun:  firebase deploy --only firestore:rules');
  }
}

$('btnSaveDraft').addEventListener('click', async () => {
  collectAllRowsAndSchedule();
  await flushSaves();
});

function collectAllRowsAndSchedule() {
  const { subjectKey, classNum } = ME.activeClass;
  const subj     = findSubjectConfig(classNum, subjectKey);
  const isSingle = subj?.singleTotal === true;
  document.querySelectorAll('#gridTbody tr').forEach(tr => {
    const sid = tr.dataset.studentId;
    if (!sid) return;
    const data = collectRowData(tr, isSingle);
    if (data === SKIP_ROW) return;   // split subject: skip blank / other-teacher rows
    ME.pendingSaves.set(sid, data);
  });
}

$('btnSubmit').addEventListener('click', () => {
  const { subjectKey, classNum, entryType } = ME.activeClass;
  const subj     = findSubjectConfig(classNum, subjectKey);
  const isGrade  = entryType === 'grade';
  const isShared = subj?.sharedEntry === true;
  const isSingle = subj?.singleTotal === true;
  const isSenior = CONFIG[classNum]?.markScheme === 'senior';
  let hasEmpty    = false;
  let hasOverLimit = false;

  document.querySelectorAll('#gridTbody tr').forEach(tr => {
    // Split subjects: a teacher only fills their own students, so blanks and the
    // other teacher's locked cells are EXPECTED — don't treat them as missing.
    if (isShared && tr.classList.contains('me-locked-other')) return;
    // Grade subjects have a single 'grade' field with no numeric maximum.
    const fields = isGrade ? ['grade']
      : (isSingle ? ['singleMark'] : (isSenior ? ['IA','TE'] : ['IA','UT','TE']));
    fields.forEach(f => {
      const inp = tr.querySelector(`[data-field="${f}"]`);
      if (!inp) return;
      if (inp.value === '') { if (!isShared) hasEmpty = true; return; }
      if (isGrade) return; // no min/max validation for grades
      const max = parseInt(inp.dataset.max);
      const val = parseFloat(inp.value);
      if (isNaN(val) || val < 0 || val > max) {
        hasOverLimit = true;
        inp.classList.add('error');
        inp.title = `Maximum allowed: ${max}`;
      }
    });
  });

  let msg = '';
  let canSubmit = true;

  if (hasOverLimit) {
    const scheme = isSingle ? 'Max /100'
      : isSenior ? 'IA max: 20, TE max: 80'
      : 'IA max: 10, UT max: 30, TE max: 60';
    msg = `Some marks exceed the allowed maximum (${scheme}). The highlighted cells must be corrected before submitting. You can still save a draft.`;
    canSubmit = false;
  } else if (hasEmpty) {
    msg = 'Some students have missing marks. Please fill all entries before submitting.';
    canSubmit = false;
  } else {
    msg = 'This will notify the class teacher that marks are ready for review. You will not be able to edit marks once submitted.';
  }

  $('submitModalMsg').textContent = msg;
  $('btnConfirmSubmit').style.display = canSubmit ? '' : 'none';
  $('submitModal').classList.remove('hidden');
});

$('btnCancelSubmit').addEventListener('click', () => $('submitModal').classList.add('hidden'));

$('btnConfirmSubmit').addEventListener('click', async () => {
  $('submitModal').classList.add('hidden');
  $('btnSubmit').disabled = true;
  showSaveIndicator('Submitting…');
  collectAllRowsAndSchedule();

  const { classId, term, subjectLabel, subjectKey, entryType, classNum } = ME.activeClass;
  const termKey   = `${classId}_${term}`;
  const submitKey = subjectKey || subjectLabel;
  const slot      = termToCoScholasticSlot(term);
  const isGrade   = entryType === 'grade';
  const isShared  = findSubjectConfig(classNum, subjectKey)?.sharedEntry === true;
  const batch     = db.batch();
  const stamp     = firebase.firestore.FieldValue.serverTimestamp();

  // Single atomic batch: marks/grades + submission flag together.
  // Either everything succeeds, or nothing changes — no half-submitted state.
  // Use nested-map syntax (NOT dot-notation keys) because set({merge:true})
  // performs deep merge on nested maps and treats dotted keys as literal names.
  document.querySelectorAll('#gridTbody tr').forEach(tr => {
    const sid = tr.dataset.studentId;
    if (!sid) return;
    const collected = ME.pendingSaves.get(sid);

    // Split subjects: only touch the students I actually entered. Skipping the
    // rest leaves the other teacher's marks (and the blank, not-mine rows)
    // completely untouched — no null clobber, no false "submitted" flag.
    if (isShared && !collected) return;

    if (isGrade) {
      // Grade subject: write coScholastic[key].{slot} to BOTH term docs, plus the
      // submission flag (keyed by subjectKey, same as scholastic subjects so the
      // subject-teacher dashboard shows "Submitted").
      const grade = collected ? collected.grade || '' : '';
      const leaf  = { [slot]: grade };
      if (collected?.enteredBy) leaf.enteredBy = collected.enteredBy;
      for (const t of ['HY', 'FT']) {
        const ref = db.collection('marks').doc(`${classId}_${t}`).collection('students').doc(sid);
        batch.set(ref, {
          coScholastic:      { [subjectKey]: leaf },
          lastUpdatedBy:     ME.user.uid,
          lastUpdatedAt:     stamp,
          submittedSubjects: { [submitKey]: { by: ME.user.uid, at: stamp, status: 'submitted' } }
        }, { merge: true });
      }
      return;
    }

    const ref = db.collection('marks').doc(termKey).collection('students').doc(sid);
    const payload = {
      status:             'draft',
      lastUpdatedBy:      ME.user.uid,
      lastUpdatedAt:      stamp,
      submittedSubjects:  { [submitKey]: { by: ME.user.uid, at: stamp, status: 'submitted' } }
    };
    if (collected) payload.academics = collected;

    batch.set(ref, payload, { merge: true });
  });
  ME.pendingSaves.clear();

  try {
    await batch.commit();
    hideSaveIndicator('Submitted ✓');
    document.querySelectorAll('.me-mark-input').forEach(inp => inp.disabled = true);
    $('btnSubmit').textContent = '✓ Submitted';
  } catch (err) {
    console.error(err);
    hideSaveIndicator('Submit failed ✗');
    $('btnSubmit').disabled = false;
    alert('Submit failed: ' + (err.message || err.code || 'unknown error'));
  }
});

$('btnBackToDashboard').addEventListener('click', async () => {
  clearTimeout(ME.saveTimer);
  if (ME.pendingSaves.size) await flushSaves();
  ME.activeClass = null;
  await renderSubjectDashboard();
  showScreen('screenDashboard');
});

// ════════════════════════════════════════════════════════════════════════════════
// CLASS TEACHER — PHASE 2
// ════════════════════════════════════════════════════════════════════════════════

// ─── CT DASHBOARD ─────────────────────────────────────────────────────────────
async function renderCTDashboard() {
  const classId  = ME.ctClassId;
  const classNum = ME.ctClassNum;
  const cfg      = CONFIG[classNum];

  $('ctDashTitle').textContent   = `Class Teacher Dashboard — Class ${classId}`;
  $('ctDashTeacher').textContent = ME.teacher.name || '';

  if (!cfg || !classId) {
    $('ctHyStatusBody').innerHTML = '<tr><td colspan="3" class="me-empty">Class config not found.</td></tr>';
    return;
  }

  // Subjects that count (non-aggregate or leaf entries teachers enter)
  const enterableSubjects = cfg.subjects.filter(s => !s.isAggregate);

  for (const term of ['HY', 'FT']) {
    const termKey  = `${classId}_${term}`;
    const tbody    = $(term === 'HY' ? 'ctHyStatusBody' : 'ctFtStatusBody');
    const progEl   = $(term === 'HY' ? 'ctHyProgress'  : 'ctFtProgress');
    const lockBtn  = $(term === 'HY' ? 'ctBtnReviewHY' : 'ctBtnReviewFT');
    tbody.innerHTML = '<tr><td colspan="3" class="me-loading"><div class="me-spinner"></div></td></tr>';

    try {
      // Scan a wide sample (not just 1 doc) and AGGREGATE submission state across
      // students — otherwise a single student missing marks would mis-report a
      // subject as "not submitted" for the whole class.
      const snap = await db.collection('marks').doc(termKey).collection('students').limit(100).get();
      const submitted = {};
      let isLocked = false;
      snap.forEach(doc => {
        const d = doc.data();
        if (d.status === 'locked') isLocked = true;
        const sub = d.submittedSubjects || {};
        for (const [k, v] of Object.entries(sub)) {
          // Keep the "best" record: prefer submitted > anything-else
          if (!submitted[k] || (v?.status === 'submitted' && submitted[k]?.status !== 'submitted')) {
            submitted[k] = v;
          }
        }
      });
      const sampleData = { submittedSubjects: submitted, status: isLocked ? 'locked' : (snap.empty ? '' : 'draft') };

      let submittedCount = 0;
      tbody.innerHTML = '';

      enterableSubjects.forEach(subj => {
        const sub = submitted[subj.key] || submitted[subj.label] || {};
        let status = 'not-started';
        if (isLocked) status = 'locked';
        else if (sub.status === 'submitted') { status = 'submitted'; submittedCount++; }
        else if (sampleData.status === 'draft') status = 'draft';

        const tr = el('tr');
        tr.innerHTML = `
          <td>${escHtml(subj.label)}</td>
          <td style="font-size:0.8rem;color:var(--me-muted)">${sub.by ? '(submitted)' : '—'}</td>
          <td>${statusBadge(status)}</td>
        `;
        tbody.appendChild(tr);
      });

      const total = enterableSubjects.length;
      progEl.textContent = isLocked
        ? `All records locked`
        : `${submittedCount} of ${total} subjects submitted`;

      lockBtn.disabled = !isLocked && submittedCount < total;
      lockBtn.dataset.term = term;

      // Show marksheet button only when FT is locked
      if (term === 'FT' && isLocked) {
        const msBtn = $('ctBtnMarksheet');
        if (msBtn) msBtn.style.display = '';
      }
    } catch (_) {
      tbody.innerHTML = '<tr><td colspan="3" class="me-empty">No data yet.</td></tr>';
      if (progEl) progEl.textContent = '0 of ' + enterableSubjects.length + ' subjects submitted';
      if (lockBtn) lockBtn.disabled = true;
    }
  }
}

$('ctBtnReviewHY').addEventListener('click', () => openStudentList('HY'));
$('ctBtnReviewFT').addEventListener('click', () => openStudentList('FT'));
$('ctBtnLogout').addEventListener('click', () => auth.signOut());
$('ctBtnRefresh').addEventListener('click', async () => { await renderCTDashboard(); });

// ─── STUDENT LIST ─────────────────────────────────────────────────────────────
async function openStudentList(term) {
  const classId  = ME.ctClassId;
  const classNum = ME.ctClassNum;
  ME.activeClass = { classId, classNum, term };

  showScreen('screenStudentList');
  $('slTitle').textContent    = `Class ${classId} — ${term === 'HY' ? 'Half Yearly' : 'Final Term'} — Student Records`;
  $('slSubtitle').textContent = 'Academic Year 2026–2027';
  $('slTableBody').innerHTML  = '<tr><td colspan="8" class="me-loading"><div class="me-spinner"></div><br>Loading…</td></tr>';

  try {
    const ctClassStr = String(classNumFromId(classId));
    const studSnap = await db.collection('students')
      .where('class', '==', ctClassStr)
      .get();

    const students = studSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.rollNo || 0) - (b.rollNo || 0));

    // Fetch BOTH terms for all students in parallel
    const [hySnaps, ftSnaps] = await Promise.all([
      Promise.all(students.map(s => db.collection('marks').doc(`${classId}_HY`).collection('students').doc(s.id).get())),
      Promise.all(students.map(s => db.collection('marks').doc(`${classId}_FT`).collection('students').doc(s.id).get()))
    ]);
    const existingHY = {}, existingFT = {};
    hySnaps.forEach((snap, i) => { if (snap.exists) existingHY[students[i].id] = snap.data(); });
    ftSnaps.forEach((snap, i) => { if (snap.exists) existingFT[students[i].id] = snap.data(); });

    // Compute grand totals for every student
    const cfg = CONFIG[classNum];
    const maxMarks = cfg?.grandTotalMax || 0;

    const hyEntries = students.map(s => ({ id: s.id, total: calcStudentTotal(existingHY[s.id], classNum) }));
    const ftEntries = students.map(s => ({ id: s.id, total: calcStudentTotal(existingFT[s.id], classNum) }));

    const hyRanks = computeRanks(hyEntries);
    const ftRanks = computeRanks(ftEntries);

    // Auto-save computed ranks to Firestore
    await autoSaveRanks(students, existingHY, existingFT, hyRanks, ftRanks, classId);

    renderStudentList(students, existingHY, existingFT, hyRanks, ftRanks, maxMarks, term, classNum);
  } catch (err) {
    $('slTableBody').innerHTML = `<tr><td colspan="8" class="me-empty">Error: ${err.message}</td></tr>`;
  }
}

function calcStudentTotal(markData, classNum) {
  const cfg = CONFIG[classNum];
  if (!cfg || !markData?.academics) return null;
  const acad = markData.academics;
  let total = 0;
  cfg.subjects.filter(s => s.countInTotal).forEach(subj => {
    if (subj.isAggregate) {
      total += computeAggregateSubject(acad, subj, cfg).total;
    } else {
      total += (acad[subj.key]?.total ?? 0);
    }
  });
  return total;
}

// Returns true only if every countInTotal (non-aggregate leaf) subject has a total entered
function isStudentTotalComplete(markData, classNum) {
  const cfg = CONFIG[classNum];
  if (!cfg || !markData?.academics) return false;
  const acad = markData.academics;
  const leafSubjects = cfg.subjects.filter(s => s.countInTotal && !s.isAggregate);
  return leafSubjects.every(subj => acad[subj.key]?.total != null);
}

// Compute ranks for all students given a list of { id, total } entries.
// Students with null/incomplete totals are unranked.
function computeRanks(entries) {
  const ranked = entries.filter(e => e.total !== null && e.total !== undefined);
  ranked.sort((a, b) => b.total - a.total);
  const rankMap = {};
  ranked.forEach((e, i) => { rankMap[e.id] = i + 1; });
  return rankMap;
}

async function autoSaveRanks(students, existingHY, existingFT, hyRanks, ftRanks, classId) {
  const totalStudents = students.length;
  try {
    const batch = db.batch();
    students.forEach(s => {
      const hyRank = hyRanks[s.id] || null;
      const ftRank = ftRanks[s.id] || null;
      const rankPayload = { hyRank, ftRank, totalStudents, autoComputed: true };
      for (const t of ['HY', 'FT']) {
        const ref = db.collection('marks').doc(`${classId}_${t}`)
                      .collection('students').doc(s.id);
        batch.set(ref, { rank: rankPayload, lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    });
    await batch.commit();
  } catch (err) {
    console.warn('autoSaveRanks failed:', err);
  }
}

function renderStudentList(students, existingHY, existingFT, hyRanks, ftRanks, maxMarks, term, classNum) {
  // Stash for the bulk Class Attendance grid (reuses this already-loaded data).
  ME.ctData = { students, existingHY, existingFT };
  const tbody = $('slTableBody');
  tbody.innerHTML = '';

  const cfg      = CONFIG[classNum];
  const subjects = cfg ? cfg.subjects.filter(s => !s.isAggregate && s.countInTotal) : [];
  const passmark = cfg?.passmark ?? 33;
  const fmt      = v => (Math.round(v * 10) / 10).toFixed(1);

  // ── Build header ──────────────────────────────────────────────────────────
  const table = tbody.closest('table');
  if (table) table.style.minWidth = `${400 + subjects.length * 110}px`;
  const thead = table?.querySelector('thead');
  if (thead) {
    // Two-row header: top row has subject group labels, bottom has HY/FT under each
    const subjCols = subjects.map(s =>
      `<th colspan="2" style="text-align:center;border-left:1px solid rgba(255,255,255,0.15);padding:6px 4px;font-size:11px">${s.label}</th>`
    ).join('');
    const subjSubCols = subjects.map(() =>
      `<th style="text-align:center;font-size:10px;opacity:0.75;padding:3px 4px">HY</th><th style="text-align:center;font-size:10px;opacity:0.75;padding:3px 4px">FT</th>`
    ).join('');
    thead.innerHTML = `
      <tr>
        <th rowspan="2" style="min-width:32px">#</th>
        <th rowspan="2" style="min-width:160px;text-align:left">Student Name</th>
        ${subjCols}
        <th colspan="2" style="text-align:center;border-left:1px solid rgba(255,255,255,0.15)">Total</th>
        <th rowspan="2" style="text-align:center">Rank</th>
        <th rowspan="2" style="text-align:center">Status</th>
        <th rowspan="2" style="text-align:center">Action</th>
      </tr>
      <tr>
        ${subjSubCols}
        <th style="text-align:center;font-size:10px;opacity:0.75;padding:3px 4px">HY</th>
        <th style="text-align:center;font-size:10px;opacity:0.75;padding:3px 4px">FT</th>
      </tr>`;
  }

  // ── Build rows ────────────────────────────────────────────────────────────
  students.forEach((student, idx) => {
    const hyData   = existingHY[student.id] || {};
    const ftData   = existingFT[student.id] || {};
    const termData = term === 'HY' ? hyData : ftData;
    const isLocked = termData.status === 'locked';

    const hyTotal    = calcStudentTotal(hyData, classNum);
    const ftTotal    = calcStudentTotal(ftData, classNum);
    const rankDisplay = term === 'HY' ? (hyRanks[student.id] || '—') : (ftRanks[student.id] || '—');

    const subjCells = subjects.map(subj => {
      const hyEntry = hyData.academics?.[subj.key];
      const ftEntry = ftData.academics?.[subj.key];
      const hyMark = hyEntry?.total ?? null;
      const ftMark = ftEntry?.total ?? null;
      const hyFail = hyMark !== null && (hyMark < passmark ||
        subjectFailsFloor(hyEntry?.IA ?? hyEntry?.singleMark ?? 0, hyEntry?.TE ?? 0, cfg, subj));
      const ftFail = ftMark !== null && (ftMark < passmark ||
        subjectFailsFloor(ftEntry?.IA ?? ftEntry?.singleMark ?? 0, ftEntry?.TE ?? 0, cfg, subj));
      const hyColor = hyMark === null ? 'color:#aaa' : (hyFail ? 'color:#dc2626;font-weight:700' : 'color:#15803d;font-weight:600');
      const ftColor = ftMark === null ? 'color:#aaa' : (ftFail ? 'color:#dc2626;font-weight:700' : 'color:#15803d;font-weight:600');
      return `<td style="text-align:center;font-size:12px;${hyColor}">${hyMark !== null ? hyMark : '—'}</td>
              <td style="text-align:center;font-size:12px;${ftColor}">${ftMark !== null ? ftMark : '—'}</td>`;
    }).join('');

    const tr = el('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td style="font-weight:500;white-space:nowrap">${escHtml(student.name)}</td>
      ${subjCells}
      <td style="text-align:center;font-weight:700;font-size:13px">${hyTotal !== null ? hyTotal : '—'}</td>
      <td style="text-align:center;font-weight:700;font-size:13px;color:var(--me-primary)">${ftTotal !== null ? ftTotal : '—'}</td>
      <td style="text-align:center;font-weight:700">${rankDisplay}</td>
      <td style="text-align:center">${isLocked
        ? '<span class="status-badge status-locked">&#128274; Locked</span>'
        : '<span class="status-badge status-draft">&#128275; Open</span>'}</td>
      <td style="text-align:center">
        <button class="btn btn-sm btn-primary ct-fill-btn" data-sid="${student.id}">
          ${isLocked ? '&#128274; View' : '&#9998; Fill &amp; Lock'}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const allStudents = students;
  tbody.querySelectorAll('.ct-fill-btn').forEach(btn => {
    btn.addEventListener('click', () => openStudentForm(btn.dataset.sid, allStudents, term === 'HY' ? existingHY : existingFT));
  });

  // Lock All button
  const existing = term === 'HY' ? existingHY : existingFT;
  const allLocked = students.every(s => existing[s.id]?.status === 'locked');
  $('btnLockAll').disabled = allLocked;
  $('btnLockAll').innerHTML = allLocked ? '&#128274; All Locked' : '&#128274; Lock All';

  // View Class Marksheet button
  const msBtn = $('btnViewMarksheet');
  if (msBtn) msBtn.onclick = () => viewCTMarksheet(students, existingHY, existingFT, classNum, term);

  // Student picker — populate dropdown
  const picker = $('slStudentPicker');
  if (picker) {
    picker.innerHTML = '<option value="">— Student Report Card —</option>';
    students.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `${s.rollNo || '?'} — ${s.name}`;
      picker.appendChild(opt);
    });
  }

  // Open individual report card from picker
  const rcBtn = $('btnOpenStudentRC');
  if (rcBtn) {
    rcBtn.onclick = () => {
      const sid = picker?.value;
      if (!sid) { alert('Please select a student first.'); return; }
      const student = students.find(s => s.id === sid);
      if (!student) return;
      openReportCardFromList(sid, student, existingHY[sid] || {}, existingFT[sid] || {}, ME.ctClassId, classNum);
    };
  }

  // Push to Admin button — show only when all records are locked
  const pushBtn = $('btnPushAdmin');
  if (pushBtn) {
    const allLocked = students.every(s => {
      const d = term === 'HY' ? existingHY[s.id] : existingFT[s.id];
      return d?.status === 'locked';
    });
    pushBtn.style.display = allLocked ? '' : 'none';
    pushBtn.onclick = () => {
      $('pushAdminMsg').textContent =
        `Push Class ${ME.ctClassId} (${term === 'HY' ? 'Half Yearly' : 'Final Term'}) to admin? All ${students.length} student records are locked and ready for review.`;
      $('pushAdminModal').classList.remove('hidden');
      // store context for confirm handler
      $('pushAdminModal').dataset.term    = term;
      $('pushAdminModal').dataset.count   = students.length;
    };
  }
}

function viewCTMarksheet(students, existingHY, existingFT, classNum, term) {
  const cfg = CONFIG[classNum];
  if (!cfg) { alert('Class config not found.'); return; }

  const passmark = cfg.passmark || 33;
  const maxMarks = cfg.grandTotalMax || 0;
  const classList = [];

  students.forEach(student => {
    const hyData  = existingHY[student.id] || {};
    const ftData  = existingFT[student.id] || {};
    const hyAcad  = hyData.academics || {};
    const ftAcad  = ftData.academics || {};

    const hySubjects = {}, ftSubjects = {}, consolSubjects = {};
    let hyGrand = 0, ftGrand = 0;
    let result = 'PASS';

    for (const subj of cfg.subjects) {
      let hyTotal = 0, ftTotal = 0;

      if (subj.isAggregate) {
        // Aggregate subjects have no own Firestore entry — compute from
        // components. Senior scheme (9/10) averages, matching calcStudentTotal;
        // standard scheme (6-8) keeps its original sum (see computeAggregateSubject).
        const hyAgg = computeAggregateSubject(hyAcad, subj, cfg);
        const ftAgg = computeAggregateSubject(ftAcad, subj, cfg);
        hyTotal = hyAgg.total;
        ftTotal = ftAgg.total;
        hySubjects[subj.key] = { ia: hyAgg.ia, exam: hyAgg.exam, total: hyTotal };
        ftSubjects[subj.key] = { ia: ftAgg.ia, exam: ftAgg.exam, total: ftTotal };
        if (subj.countInTotal) {
          hyGrand += hyTotal;
          ftGrand += ftTotal;
          if (hyTotal < passmark || ftTotal < passmark ||
              subjectFailsFloor(hyAgg.ia, hyAgg.exam, cfg, subj) ||
              subjectFailsFloor(ftAgg.ia, ftAgg.exam, cfg, subj)) {
            result = 'FAIL';
          }
        }
      } else {
        const hyA = hyAcad[subj.key] || {};
        const ftA = ftAcad[subj.key] || {};
        hyTotal = hyA.total ?? 0;
        ftTotal = ftA.total ?? 0;

        // Convert UPPERCASE Firestore fields → lowercase for marksheet.js
        const hyEntry = { exam: hyA.TE ?? 0, total: hyTotal };
        if (hyA.IA !== undefined)              hyEntry.ia = hyA.IA;
        else if (hyA.singleMark !== undefined) hyEntry.ia = hyA.singleMark;
        if (hyA.UT !== undefined)              hyEntry.ut = hyA.UT;

        const ftEntry = { exam: ftA.TE ?? 0, total: ftTotal };
        if (ftA.IA !== undefined)              ftEntry.ia = ftA.IA;
        else if (ftA.singleMark !== undefined) ftEntry.ia = ftA.singleMark;
        if (ftA.UT !== undefined)              ftEntry.ut = ftA.UT;

        hySubjects[subj.key] = hyEntry;
        ftSubjects[subj.key] = ftEntry;

        if (subj.countInTotal) {
          hyGrand += hyTotal;
          ftGrand += ftTotal;
          if (hyTotal < passmark || ftTotal < passmark ||
              subjectFailsFloor(hyEntry.ia ?? 0, hyEntry.exam ?? 0, cfg, subj) ||
              subjectFailsFloor(ftEntry.ia ?? 0, ftEntry.exam ?? 0, cfg, subj)) {
            result = 'FAIL';
          }
        }
      }

      consolSubjects[subj.key] = { term1: hyTotal, term2: ftTotal, total: hyTotal + ftTotal };
    }

    const adminDecision = ftData.adminDecision || '';
    if (adminDecision === 'Promoted')                result = 'PROMOTED';
    else if (adminDecision === 'Detained')            result = 'DETAINED';
    else if (adminDecision === 'Promoted with Grace') result = 'PROMOTED WITH GRACE';

    const hyPct      = maxMarks > 0 ? (hyGrand / maxMarks) * 100 : 0;
    const ftPct      = maxMarks > 0 ? (ftGrand / maxMarks) * 100 : 0;
    const overallPct = (maxMarks * 2) > 0 ? ((hyGrand + ftGrand) / (maxMarks * 2)) * 100 : 0;
    const rank       = ftData.rank || hyData.rank || {};

    // Supplementary report-card data
    const hyAtt = hyData.attendance || {};
    const ftAtt = ftData.attendance || {};

    classList.push({
      class:      classNum,
      schoolName: 'St. Francis De Sales Secondary School',
      session:    '2026–2027',
      student:    { name: student.name, rollNo: student.rollNo || 0, admissionNo: student.admissionNo || '', house: student.house || '' },
      attendance: {
        hy: { present: hyAtt.hyPresent ?? hyAtt.present ?? 0, total: hyAtt.hyTotal ?? hyAtt.total ?? 0 },
        ft: { present: ftAtt.ftPresent ?? ftAtt.present ?? 0, total: ftAtt.ftTotal ?? ftAtt.total ?? 0 }
      },
      coScholastic: hyData.coScholastic || ftData.coScholastic || {},
      remarks: {
        halfYearly: hyData.remarks?.halfYearly || '',
        finalTerm:  ftData.remarks?.finalTerm   || ''
      },
      coScholasticConfig: cfg.coScholastic || [],
      halfYearly: {
        subjects: hySubjects, grandTotal: hyGrand,
        percentage: parseFloat((Math.round(hyPct * 10) / 10).toFixed(1)),
        grade: _gradeFromPct(hyPct), rank: rank.hyRank || 0, totalStudents: rank.totalStudents || 0
      },
      finalTerm: {
        subjects: ftSubjects, grandTotal: ftGrand,
        percentage: parseFloat((Math.round(ftPct * 10) / 10).toFixed(1)),
        grade: _gradeFromPct(ftPct), rank: rank.ftRank || 0, totalStudents: rank.totalStudents || 0
      },
      consolidated: {
        subjects: consolSubjects, grandTotal: hyGrand + ftGrand,
        percentage: parseFloat((Math.round(overallPct * 10) / 10).toFixed(1)),
        grade: _gradeFromPct(overallPct), result
      }
    });
  });

  classList.sort((a, b) => (a.student.rollNo || 999) - (b.student.rollNo || 999));
  sessionStorage.setItem('sfds_classList', JSON.stringify(classList));
  sessionStorage.setItem('sfds_marksheetTerm', term === 'HY' ? 'halfYearly' : 'finalTerm');
  window.open('marksheet.html', '_blank');
}

$('btnBackToCTDash').addEventListener('click', async () => {
  ME.activeClass = null;
  await renderCTDashboard();
  showScreen('screenCTDashboard');
});

$('btnLockAll').addEventListener('click', () => {
  $('lockModalMsg').textContent = `Lock ALL student records for Class ${ME.ctClassId}? Subject teachers will no longer be able to edit marks. This cannot be undone.`;
  $('lockModal').dataset.mode = 'all';
  $('lockModal').classList.remove('hidden');
});

// ─── STUDENT FORM ─────────────────────────────────────────────────────────────
async function openStudentForm(studentId, students, existing) {
  const student  = students.find(s => s.id === studentId);
  const classId  = ME.ctClassId;
  const classNum = ME.ctClassNum;
  const term     = ME.activeClass.term;
  const termKey  = `${classId}_${term}`;

  ME.activeStudent = { studentId, student, classId, classNum, term };

  showScreen('screenStudentForm');
  $('sfStudentName').textContent = student.name || '—';
  $('sfClass').textContent       = `Class ${classId}`;
  $('sfTerm').textContent        = term === 'HY' ? 'Half Yearly' : 'Final Term';
  $('sfRollNo').textContent      = student.rollNo || '—';

  // Fetch both terms
  let hyData = {}, ftData = {};
  try {
    const [hySnap, ftSnap] = await Promise.all([
      db.collection('marks').doc(`${classId}_HY`).collection('students').doc(studentId).get(),
      db.collection('marks').doc(`${classId}_FT`).collection('students').doc(studentId).get()
    ]);
    if (hySnap.exists) hyData = hySnap.data();
    if (ftSnap.exists) ftData = ftSnap.data();
  } catch (_) {}

  ME.activeStudent.hyData = hyData;
  ME.activeStudent.ftData = ftData;

  const isLocked = (term === 'HY' ? hyData : ftData).status === 'locked';

  renderAcademicSummary(hyData, ftData, classNum);
  renderCoScholastic(hyData, ftData, classNum, isLocked);
  renderAttendance(hyData, ftData, isLocked);
  renderRemarks(hyData, ftData, isLocked);
  renderRank(hyData, ftData, isLocked);
  renderResult(hyData, ftData, classNum);

  $('btnLockRecord').style.display     = isLocked ? 'none' : '';
  $('sfLockStatus').style.display      = isLocked ? '' : 'none';
  $('btnSaveCT').disabled              = isLocked;
  $('btnViewReportCard').style.display = isLocked ? '' : 'none';
}

function getSubjectTotal(academics, key, subj) {
  const a = academics?.[key];
  if (!a) return null;
  return a.total ?? null;
}

function renderAcademicSummary(hyData, ftData, classNum) {
  const cfg  = CONFIG[classNum];
  const wrap = $('sfAcademicTable');
  if (!cfg) { wrap.innerHTML = '<p class="me-empty">Config not found.</p>'; return; }

  const subjects = cfg.subjects.filter(s => s.countInTotal);
  const passmark = cfg.passmark ?? 40;
  let hyGrand = 0, ftGrand = 0;

  const rows = subjects.map(subj => {
    const hyAcad = hyData.academics || {};
    const ftAcad = ftData.academics || {};

    let hyTotal = null, ftTotal = null, hyIa = null, hyTe = null, ftIa = null, ftTe = null;

    if (subj.isAggregate) {
      const hasAllHy = subj.components.every(k => hyAcad[k]?.total != null);
      const hasAllFt = subj.components.every(k => ftAcad[k]?.total != null);
      if (hasAllHy) { const r = computeAggregateSubject(hyAcad, subj, cfg); hyTotal = r.total; hyIa = r.ia; hyTe = r.exam; }
      if (hasAllFt) { const r = computeAggregateSubject(ftAcad, subj, cfg); ftTotal = r.total; ftIa = r.ia; ftTe = r.exam; }
    } else {
      const hyEntry = hyAcad[subj.key], ftEntry = ftAcad[subj.key];
      hyTotal = hyEntry?.total ?? null;
      ftTotal = ftEntry?.total ?? null;
      hyIa = hyEntry?.IA ?? hyEntry?.singleMark ?? 0; hyTe = hyEntry?.TE ?? 0;
      ftIa = ftEntry?.IA ?? ftEntry?.singleMark ?? 0; ftTe = ftEntry?.TE ?? 0;
    }

    const consol = (hyTotal != null && ftTotal != null) ? hyTotal + ftTotal : null;
    if (hyTotal != null) hyGrand += hyTotal;
    if (ftTotal != null) ftGrand += ftTotal;

    const hyGrade = hyTotal != null ? computeGrade(hyTotal) : '—';
    const ftGrade = ftTotal != null ? computeGrade(ftTotal) : '—';
    const hyFail  = hyTotal != null && (hyTotal < passmark || subjectFailsFloor(hyIa, hyTe, cfg, subj));
    const ftFail  = ftTotal != null && (ftTotal < passmark || subjectFailsFloor(ftIa, ftTe, cfg, subj));

    return `<tr>
      <td>${escHtml(subj.label)}</td>
      <td class="${hyFail ? 'ct-fail-cell' : ''}">${hyTotal ?? '—'}</td>
      <td class="${ftFail ? 'ct-fail-cell' : ''}">${ftTotal ?? '—'}</td>
      <td>${consol ?? '—'}</td>
      <td><span class="grade-pill">${hyGrade}</span></td>
      <td><span class="grade-pill">${ftGrade}</span></td>
    </tr>`;
  }).join('');

  const grandTotalMax = cfg.grandTotalMax || 0;
  const fmtPct = v => grandTotalMax > 0 ? (Math.round((v / grandTotalMax) * 1000) / 10).toFixed(1) + '%' : '—';
  const hyGrade  = computeGrade(hyGrand, grandTotalMax);
  const ftGrade  = computeGrade(ftGrand, grandTotalMax);

  wrap.innerHTML = `
    <table class="me-table ct-academic-table">
      <thead><tr>
        <th>Subject</th><th>HY Total</th><th>FT Total</th>
        <th>Consol /200</th><th>HY Grade</th><th>FT Grade</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="ct-grand-row">
          <td>Grand Total</td>
          <td>${hyGrand}</td><td>${ftGrand}</td>
          <td>${hyGrand + ftGrand}</td><td>—</td><td>—</td>
        </tr>
        <tr class="ct-grand-row" style="background:rgba(var(--me-primary-rgb,61,79,42),0.08)">
          <td>Percentage</td>
          <td style="font-weight:700;color:var(--me-primary)">${fmtPct(hyGrand)}</td>
          <td style="font-weight:700;color:var(--me-primary)">${fmtPct(ftGrand)}</td>
          <td style="font-weight:700;color:var(--me-primary)">${grandTotalMax > 0 ? (Math.round(((hyGrand + ftGrand) / (grandTotalMax * 2)) * 1000) / 10).toFixed(1) + '%' : '—'}</td>
          <td><span class="grade-pill">${hyGrade}</span></td>
          <td><span class="grade-pill">${ftGrade}</span></td>
        </tr>
      </tfoot>
    </table>
  `;
}

function renderCoScholastic(hyData, ftData, classNum, isLocked) {
  const cfg  = CONFIG[classNum];
  const wrap = $('sfCoScholastic');
  if (!cfg) { wrap.innerHTML = ''; return; }

  const coSch = hyData.coScholastic || ftData.coScholastic || {};
  const dis   = isLocked ? 'disabled' : '';

  wrap.innerHTML = cfg.coScholastic.map(act => {
    const t1 = coSch[act.key]?.T1 || '';
    const t2 = coSch[act.key]?.T2 || '';
    const opts = g => GRADES.map(gr => `<option value="${gr}" ${gr===g?'selected':''}>${gr}</option>`).join('');
    return `
      <div class="ct-cosch-item">
        <span class="ct-cosch-label">${escHtml(act.label)}</span>
        <select class="ct-cosch-select" data-key="${act.key}" data-term="T1" ${dis}>
          <option value="">T1</option>${opts(t1)}
        </select>
        <select class="ct-cosch-select" data-key="${act.key}" data-term="T2" ${dis}>
          <option value="">T2</option>${opts(t2)}
        </select>
      </div>`;
  }).join('');
}

function renderAttendance(hyData, ftData, isLocked) {
  const ha  = hyData.attendance || {};
  const fa  = ftData.attendance || {};
  // Attendance is SAVED as hyPresent/hyTotal/ftPresent/ftTotal (see saveCTData and
  // the bulk attendance grid). Read those keys first; fall back to the old
  // present/total names so any legacy data still loads. (Previously this read
  // only present/total, so saved attendance reappeared blank on reopen.)
  $('sfHyPresent').value = ha.hyPresent ?? ha.present ?? '';
  $('sfHyTotal').value   = ha.hyTotal   ?? ha.total   ?? '';
  $('sfFtPresent').value = fa.ftPresent ?? fa.present ?? '';
  $('sfFtTotal').value   = fa.ftTotal   ?? fa.total   ?? '';
  [$('sfHyPresent'),$('sfHyTotal'),$('sfFtPresent'),$('sfFtTotal')].forEach(inp => inp.disabled = isLocked);
}

// ════════════════════════════════════════════════════════════════════════════
// CLASS ATTENDANCE — bulk entry (class teacher)
// One Working Days value for the whole class + Days Present per student. Writes
// the SAME attendance fields the report card reads (hyPresent/hyTotal for HY,
// ftPresent/ftTotal for FT) to BOTH term docs, mirroring saveCTData.
// ════════════════════════════════════════════════════════════════════════════
function attTermKeys() {
  const t = ME.activeClass?.term === 'FT' ? 'ft' : 'hy';
  return { presentKey: t + 'Present', totalKey: t + 'Total' };
}

function openClassAttendance() {
  const data = ME.ctData;
  if (!data || !data.students?.length) { alert('Open the class student list first.'); return; }
  const term = ME.activeClass?.term === 'FT' ? 'FT' : 'HY';
  $('attTitle').textContent    = `Class ${ME.ctClassId || ME.activeClass?.classId || ''} — ${term === 'FT' ? 'Final Term' : 'Half Yearly'} Attendance`;
  $('attSubtitle').textContent = 'Enter days present for each student. Working Days applies to the whole class.';
  renderAttendanceGrid();
  showScreen('screenAttendance');
}

function renderAttendanceGrid() {
  const { students, existingHY, existingFT } = ME.ctData;
  const term     = ME.activeClass?.term === 'FT' ? 'FT' : 'HY';
  const existing = term === 'FT' ? existingFT : existingHY;
  const { presentKey, totalKey } = attTermKeys();

  // Seed the class Working Days box from any student's saved total.
  let workingDays = '';
  for (const s of students) {
    const wd = existing[s.id]?.attendance?.[totalKey];
    if (wd != null && wd !== 0) { workingDays = wd; break; }
  }
  $('attWorkingDays').value = workingDays;

  const tbody = $('attTableBody');
  tbody.innerHTML = '';
  students.forEach((s, idx) => {
    const att     = existing[s.id]?.attendance || {};
    const present = att[presentKey] ?? '';
    const locked  = existing[s.id]?.status === 'locked';
    const tr = el('tr');
    tr.dataset.studentId = s.id;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escHtml(s.name)}</td>
      <td><input type="number" class="me-mark-input att-present" data-field="present" min="0" value="${present}" ${locked ? 'disabled' : ''}></td>
      <td class="att-wd" style="text-align:center">—</td>
      <td class="att-pct" style="text-align:center">—</td>
    `;
    tbody.appendChild(tr);
    const inp = tr.querySelector('.att-present');
    if (!locked) inp.addEventListener('input', () => updateAttRow(tr));
  });
  applyWorkingDaysToRows();
}

function applyWorkingDaysToRows() {
  const wd = parseInt($('attWorkingDays').value);
  document.querySelectorAll('#attTableBody tr').forEach(tr => {
    const cell = tr.querySelector('.att-wd');
    if (cell) cell.textContent = isNaN(wd) ? '—' : wd;
    updateAttRow(tr);
  });
}

function updateAttRow(tr) {
  const wd = parseInt($('attWorkingDays').value);
  const p  = parseInt(tr.querySelector('.att-present')?.value);
  const cell = tr.querySelector('.att-pct');
  if (!cell) return;
  if (isNaN(wd) || wd <= 0 || isNaN(p)) { cell.textContent = '—'; cell.style.color = ''; return; }
  const pct = Math.round((p / wd) * 1000) / 10;
  cell.textContent = pct + '%';
  cell.style.color = pct < 75 ? '#e07a7a' : '#7dd080';
}

async function saveClassAttendance() {
  const data = ME.ctData;
  if (!data?.students?.length || !ME.activeClass) return;
  const { classId } = ME.activeClass;
  const { presentKey, totalKey } = attTermKeys();
  const wd = parseInt($('attWorkingDays').value);
  if (isNaN(wd) || wd <= 0) { alert('Enter the total Working Days for the class first.'); return; }

  showSaveIndicator('Saving attendance…');
  const batch = db.batch();
  const stamp = firebase.firestore.FieldValue.serverTimestamp();
  let count = 0;
  document.querySelectorAll('#attTableBody tr').forEach(tr => {
    const sid = tr.dataset.studentId;
    if (!sid) return;
    const inp = tr.querySelector('.att-present');
    if (!inp || inp.disabled || inp.value === '') return;   // skip locked / blank
    const present = parseInt(inp.value) || 0;
    const attLeaf = { [presentKey]: present, [totalKey]: wd };
    const attWrite = { attendance: attLeaf, lastUpdatedBy: ME.user.uid, lastUpdatedAt: stamp };
    for (const t of ['HY', 'FT']) {
      batch.set(db.collection('marks').doc(`${classId}_${t}`).collection('students').doc(sid),
                attWrite, { merge: true });
    }
    // Keep local cache in sync so reopening shows the saved values immediately.
    for (const ex of [ME.ctData.existingHY, ME.ctData.existingFT]) {
      ex[sid] = ex[sid] || {};
      ex[sid].attendance = Object.assign({}, ex[sid].attendance, attLeaf);
    }
    count++;
  });

  if (!count) { hideSaveIndicator(''); alert('Nothing to save — enter at least one student\'s days present.'); return; }

  try {
    await batch.commit();
    hideSaveIndicator(`Attendance saved ✓ (${count})`);
  } catch (err) {
    console.error('Attendance save failed:', err);
    hideSaveIndicator('Save failed ✗');
    alert('Attendance save failed: ' + (err.message || err.code || 'unknown error'));
  }
}

$('btnClassAttendance')?.addEventListener('click', openClassAttendance);
$('btnBackFromAtt')?.addEventListener('click', () => showScreen('screenStudentList'));
$('btnSaveAttendance')?.addEventListener('click', saveClassAttendance);
$('attWorkingDays')?.addEventListener('input', applyWorkingDaysToRows);

function renderRemarks(hyData, ftData, isLocked) {
  const r   = hyData.remarks || ftData.remarks || {};
  const dis = isLocked;
  $('sfHyRemark').value        = r.halfYearly  || '';
  $('sfFtRemark').value        = r.finalTerm   || '';
  $('sfPrincipalRemark').value = r.principal   || '';
  [$('sfHyRemark'),$('sfFtRemark'),$('sfPrincipalRemark')].forEach(ta => ta.disabled = dis);
}

function renderRank(hyData, ftData, isLocked) {
  const rank = hyData.rank || ftData.rank || {};
  $('sfHyRank').value        = rank.hyRank        ?? '';
  $('sfFtRank').value        = rank.ftRank        ?? '';
  $('sfTotalStudents').value = rank.totalStudents ?? '';

  // If auto-computed, mark fields as read-only (still allow CT override by unlocking)
  const autoComputed = !!rank.autoComputed;
  [$('sfHyRank'), $('sfFtRank'), $('sfTotalStudents')].forEach(inp => {
    inp.disabled   = isLocked || autoComputed;
    inp.title      = autoComputed ? 'Auto-calculated from all students\' marks. Open student list to recalculate.' : '';
    inp.style.background = autoComputed ? 'rgba(0,128,0,0.07)' : '';
  });

  // Show/hide auto badge
  let badge = $('sfRankAutoBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'sfRankAutoBadge';
    badge.style.cssText = 'font-size:0.72rem;color:#3a7a3a;margin-top:4px;font-style:italic;';
    const rankSection = $('sfHyRank')?.closest('.ct-section-block') || $('sfHyRank')?.parentElement;
    if (rankSection) rankSection.appendChild(badge);
  }
  badge.textContent = autoComputed ? '✓ Ranks auto-calculated from class marks' : '';
}

function renderResult(hyData, ftData, classNum) {
  const cfg = CONFIG[classNum];
  if (!cfg) return;
  const passmark  = cfg.passmark ?? 40;
  const countSubj = cfg.subjects.filter(s => s.countInTotal);

  let hyFail = false, ftFail = false;
  countSubj.forEach(subj => {
    let ht, ft, hyIa, hyTe, ftIa, ftTe;
    if (subj.isAggregate) {
      const hasAllHy = subj.components.every(k => hyData.academics?.[k]?.total != null);
      const hasAllFt = subj.components.every(k => ftData.academics?.[k]?.total != null);
      if (hasAllHy) { const r = computeAggregateSubject(hyData.academics, subj, cfg); ht = r.total; hyIa = r.ia; hyTe = r.exam; }
      if (hasAllFt) { const r = computeAggregateSubject(ftData.academics, subj, cfg); ft = r.total; ftIa = r.ia; ftTe = r.exam; }
    } else {
      const hyA = hyData.academics?.[subj.key], ftA = ftData.academics?.[subj.key];
      ht = hyA?.total; ft = ftA?.total;
      hyIa = hyA?.IA ?? hyA?.singleMark ?? 0; hyTe = hyA?.TE ?? 0;
      ftIa = ftA?.IA ?? ftA?.singleMark ?? 0; ftTe = ftA?.TE ?? 0;
    }
    if (ht != null && (ht < passmark || subjectFailsFloor(hyIa, hyTe, cfg, subj))) hyFail = true;
    if (ft != null && (ft < passmark || subjectFailsFloor(ftIa, ftTe, cfg, subj))) ftFail = true;
  });

  let result = 'PASS', cls = 'ct-result-pass';
  if (hyFail && ftFail)       { result = 'FAIL';        cls = 'ct-result-fail'; }
  else if (hyFail || ftFail)  { result = 'COMPARTMENT'; cls = 'ct-result-comp'; }

  $('sfResultBadge').textContent = result;
  $('sfResultBadge').className   = `ct-result-badge ${cls}`;
}

// ─── CT SAVE & LOCK ───────────────────────────────────────────────────────────
$('btnSaveCT').addEventListener('click', async () => {
  await saveCTData();
  hideSaveIndicator('Saved ✓');
});

async function saveCTData() {
  const { studentId, classId, term, hyData, ftData } = ME.activeStudent;
  showSaveIndicator('Saving…');

  const coScholastic = {};
  document.querySelectorAll('.ct-cosch-select').forEach(sel => {
    const key  = sel.dataset.key;
    const term = sel.dataset.term;
    if (!coScholastic[key]) coScholastic[key] = {};
    coScholastic[key][term] = sel.value;
  });

  const attendance = {
    hyPresent: parseInt($('sfHyPresent').value) || 0,
    hyTotal:   parseInt($('sfHyTotal').value)   || 0,
    ftPresent: parseInt($('sfFtPresent').value)  || 0,
    ftTotal:   parseInt($('sfFtTotal').value)    || 0
  };

  const remarks = {
    halfYearly: $('sfHyRemark').value.trim(),
    finalTerm:  $('sfFtRemark').value.trim(),
    principal:  $('sfPrincipalRemark').value.trim()
  };

  const rank = {
    hyRank:        parseInt($('sfHyRank').value)        || null,
    ftRank:        parseInt($('sfFtRank').value)        || null,
    totalStudents: parseInt($('sfTotalStudents').value) || null
  };

  // Write same data to both HY and FT docs so it's always accessible
  const batch = db.batch();
  for (const t of ['HY','FT']) {
    const ref = db.collection('marks').doc(`${classId}_${t}`)
                  .collection('students').doc(studentId);
    batch.set(ref, {
      coScholastic, attendance, remarks, rank,
      lastUpdatedBy: ME.user.uid,
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
}

$('btnLockRecord').addEventListener('click', () => {
  $('lockModalMsg').textContent = 'Lock this student\'s record? Subject teachers will no longer be able to edit marks. This cannot be undone.';
  $('lockModal').dataset.mode   = 'single';
  $('lockModal').classList.remove('hidden');
});

$('btnCancelLock').addEventListener('click', () => $('lockModal').classList.add('hidden'));

$('btnConfirmLock').addEventListener('click', async () => {
  $('lockModal').classList.add('hidden');
  const mode = $('lockModal').dataset.mode;

  if (mode === 'single') {
    await saveCTData();
    await lockSingleRecord(ME.activeStudent.studentId);
    $('btnLockRecord').style.display = 'none';
    $('sfLockStatus').style.display  = '';
    $('btnSaveCT').disabled           = true;
    hideSaveIndicator('Locked ✓');
  } else {
    await lockAllRecords();
  }
});

async function lockSingleRecord(studentId) {
  const { classId } = ME.activeStudent;
  showSaveIndicator('Locking…');
  const batch = db.batch();
  for (const t of ['HY','FT']) {
    const ref = db.collection('marks').doc(`${classId}_${t}`)
                  .collection('students').doc(studentId);
    batch.set(ref, {
      status:        'locked',
      lastUpdatedBy: ME.user.uid,
      lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
}

async function lockAllRecords() {
  const classId = ME.ctClassId;
  showSaveIndicator('Locking all…');
  try {
    for (const t of ['HY','FT']) {
      const termKey = `${classId}_${t}`;
      const snap    = await db.collection('marks').doc(termKey).collection('students').get();
      const batch   = db.batch();
      snap.forEach(doc => {
        batch.update(doc.ref, {
          status:        'locked',
          lastUpdatedBy: ME.user.uid,
          lastUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
      await batch.commit();
    }
    hideSaveIndicator('All locked ✓');
    await openStudentList(ME.activeClass.term);
  } catch (err) {
    console.error(err);
    hideSaveIndicator('Lock failed ✗');
  }
}

$('btnBackToStudentList').addEventListener('click', async () => {
  ME.activeStudent = null;
  await openStudentList(ME.activeClass.term);
});

// ─── VIEW REPORT CARD BRIDGE ──────────────────────────────────────────────────
// Reads Firestore marks for the active student, assembles sfds_studentData,
// saves to sessionStorage, then opens reportcard.html in the same window.
$('btnViewReportCard').addEventListener('click', async () => {
  const btn = $('btnViewReportCard');
  btn.disabled = true;
  btn.textContent = 'Loading…';
  try {
    await openReportCard();
  } catch(e) {
    alert('Could not load report card: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '&#128203; View Report Card';
  }
});

async function openReportCard() {
  const { studentId, studentData, classId, hyData, ftData } = ME.activeStudent;
  const classNum = classNumFromId(classId);
  const cfg = CONFIG[classNum];
  if (!cfg) throw new Error('No config found for class ' + classNum);

  // ── 1. Build subjects maps ───────────────────────────────────────────────
  const hySubjects = {}, ftSubjects = {}, consolSubjects = {};
  let hyGrand = 0, ftGrand = 0;
  const passmark = cfg.passmark || 40;
  let result = 'PASS';

  for (const subj of cfg.subjects) {
    let hyTotal, ftTotal, hyIa, hyTe, ftIa, ftTe;

    if (subj.isAggregate) {
      const hyAgg = computeAggregateSubject(hyData?.academics, subj, cfg);
      const ftAgg = computeAggregateSubject(ftData?.academics, subj, cfg);
      hyTotal = hyAgg.total; hyIa = hyAgg.ia; hyTe = hyAgg.exam;
      ftTotal = ftAgg.total; ftIa = ftAgg.ia; ftTe = ftAgg.exam;
      hySubjects[subj.key] = { ia: hyIa, ut: 0, exam: hyTe, total: hyTotal };
      ftSubjects[subj.key] = { ia: ftIa, ut: 0, exam: ftTe, total: ftTotal };
    } else {
      const hyA = hyData?.academics?.[subj.key] || {};
      const ftA = ftData?.academics?.[subj.key] || {};
      hyTotal = hyA.total ?? 0; hyIa = hyA.IA ?? hyA.singleMark ?? 0; hyTe = hyA.TE ?? 0;
      ftTotal = ftA.total ?? 0; ftIa = ftA.IA ?? ftA.singleMark ?? 0; ftTe = ftA.TE ?? 0;
      hySubjects[subj.key] = { ia: hyIa, ut: hyA.UT ?? 0, exam: hyTe, total: hyTotal };
      ftSubjects[subj.key] = { ia: ftIa, ut: ftA.UT ?? 0, exam: ftTe, total: ftTotal };
    }
    consolSubjects[subj.key] = { term1: hyTotal, term2: ftTotal, total: hyTotal + ftTotal };

    if (subj.countInTotal) {
      hyGrand += hyTotal;
      ftGrand += ftTotal;
      if (hyTotal < passmark || ftTotal < passmark ||
          subjectFailsFloor(hyIa, hyTe, cfg, subj) ||
          subjectFailsFloor(ftIa, ftTe, cfg, subj)) {
        result = 'FAIL';
      }
    }
  }

  // Override result with admin decision if set
  const adminDecision = ftData?.adminDecision || '';
  if (adminDecision === 'Promoted')             result = 'PROMOTED';
  else if (adminDecision === 'Detained')         result = 'DETAINED';
  else if (adminDecision === 'Promoted with Grace') result = 'PROMOTED WITH GRACE';

  const maxMarks  = cfg.grandTotalMax || 0;
  const hyPct     = maxMarks > 0 ? (hyGrand / maxMarks) * 100 : 0;
  const ftPct     = maxMarks > 0 ? (ftGrand / maxMarks) * 100 : 0;
  const overallPct= (maxMarks * 2) > 0 ? ((hyGrand + ftGrand) / (maxMarks * 2)) * 100 : 0;

  function gradeFromPct(p) {
    if (p >= 90) return 'O'; if (p >= 80) return 'A+'; if (p >= 70) return 'A';
    if (p >= 60) return 'B+'; if (p >= 50) return 'B'; if (p >= 40) return 'C';
    if (p >= 33) return 'D'; return 'F';
  }
  function fmtPct(p) { return parseFloat((Math.round(p * 10) / 10).toFixed(1)); }

  // ── 2. Co-scholastic ─────────────────────────────────────────────────────
  const coScholastic = {};
  const csSrc = hyData?.coScholastic || ftData?.coScholastic || {};
  for (const item of (cfg.coScholastic || [])) {
    const cs = csSrc[item.key] || {};
    coScholastic[item.key] = { halfYearly: cs.T1 || '', finalTerm: cs.T2 || '' };
  }

  // ── 3. Attendance & rank & remarks ───────────────────────────────────────
  const att   = hyData?.attendance || ftData?.attendance || {};
  const rank  = hyData?.rank       || ftData?.rank       || {};
  const rem   = hyData?.remarks    || ftData?.remarks    || {};
  const sd    = studentData || {};

  // ── 4. Assemble sfds_studentData ─────────────────────────────────────────
  const data = {
    schoolName:   cfg.schoolName || 'St. Francis De Sales School',
    session:      '2026-2027',
    class:        String(classNum),
    section:      (classId.split('-')[1] || '').trim(),
    classTeacher: ME.teacher?.name || '',
    student: {
      name:        sd.name         || sd.studentName || studentId,
      rollNo:      sd.rollNo       || sd.roll        || 0,
      admissionNo: sd.admissionNo  || sd.admNo       || '',
      dob:         sd.dob          || '',
      house:       sd.house        || ''
    },
    halfYearly: {
      subjects:      hySubjects,
      grandTotal:    hyGrand,
      percentage:    fmtPct(hyPct),
      grade:         gradeFromPct(hyPct),
      rank:          rank.hyRank       || 0,
      totalStudents: rank.totalStudents || 0,
      attendance: {
        present: att.hyPresent || 0,
        total:   att.hyTotal   || 0
      }
    },
    finalTerm: {
      subjects:      ftSubjects,
      grandTotal:    ftGrand,
      percentage:    fmtPct(ftPct),
      grade:         gradeFromPct(ftPct),
      rank:          rank.ftRank        || 0,
      totalStudents: rank.totalStudents  || 0,
      attendance: {
        present: att.ftPresent || 0,
        total:   att.ftTotal   || 0
      }
    },
    consolidated: {
      subjects:   consolSubjects,
      grandTotal: hyGrand + ftGrand,
      percentage: fmtPct(overallPct),
      grade:      gradeFromPct(overallPct),
      result:     result
    },
    coScholastic: coScholastic,
    remarks: {
      halfYearly: rem.halfYearly || '',
      finalTerm:  rem.finalTerm  || '',
      principal:  rem.principal  || ''
    }
  };

  sessionStorage.setItem('sfds_studentData', JSON.stringify(data));
  window.location.href = 'reportcard.html';
}

// ─── REPORT CARD FROM STUDENT LIST (no Firestore refetch) ────────────────────
function openReportCardFromList(studentId, studentData, hyData, ftData, classId, classNum) {
  const cfg = CONFIG[classNum];
  if (!cfg) { alert('Class config not found.'); return; }

  const passmark = cfg.passmark || 40;
  const maxMarks = cfg.grandTotalMax || 0;
  const hySubjects = {}, ftSubjects = {}, consolSubjects = {};
  let hyGrand = 0, ftGrand = 0, result = 'PASS';

  for (const subj of cfg.subjects) {
    const hyA = hyData.academics?.[subj.key] || {};
    const ftA = ftData.academics?.[subj.key] || {};
    const hyTotal = hyA.total ?? 0;
    const ftTotal = ftA.total ?? 0;

    if (subj.isAggregate) {
      const hyAgg = computeAggregateSubject(hyData.academics, subj, cfg);
      const ftAgg = computeAggregateSubject(ftData.academics, subj, cfg);
      hySubjects[subj.key] = { ia: hyAgg.ia, ut: 0, exam: hyAgg.exam, total: hyAgg.total };
      ftSubjects[subj.key] = { ia: ftAgg.ia, ut: 0, exam: ftAgg.exam, total: ftAgg.total };
      consolSubjects[subj.key] = { term1: hyAgg.total, term2: ftAgg.total, total: hyAgg.total + ftAgg.total };
      if (subj.countInTotal) {
        hyGrand += hyAgg.total; ftGrand += ftAgg.total;
        if (hyAgg.total < passmark || ftAgg.total < passmark ||
            subjectFailsFloor(hyAgg.ia, hyAgg.exam, cfg, subj) ||
            subjectFailsFloor(ftAgg.ia, ftAgg.exam, cfg, subj)) {
          result = 'FAIL';
        }
      }
    } else {
      hySubjects[subj.key] = { ia: hyA.IA ?? 0, ut: hyA.UT ?? 0, exam: hyA.TE ?? hyA.singleMark ?? 0, total: hyTotal };
      ftSubjects[subj.key] = { ia: ftA.IA ?? 0, ut: ftA.UT ?? 0, exam: ftA.TE ?? ftA.singleMark ?? 0, total: ftTotal };
      consolSubjects[subj.key] = { term1: hyTotal, term2: ftTotal, total: hyTotal + ftTotal };
      if (subj.countInTotal) {
        hyGrand += hyTotal; ftGrand += ftTotal;
        if (hyTotal < passmark || ftTotal < passmark ||
            subjectFailsFloor(hyA.IA ?? hyA.singleMark ?? 0, hyA.TE ?? 0, cfg, subj) ||
            subjectFailsFloor(ftA.IA ?? ftA.singleMark ?? 0, ftA.TE ?? 0, cfg, subj)) {
          result = 'FAIL';
        }
      }
    }
  }

  const adminDecision = ftData.adminDecision || '';
  if (adminDecision === 'Promoted')             result = 'PROMOTED';
  else if (adminDecision === 'Detained')         result = 'DETAINED';
  else if (adminDecision === 'Promoted with Grace') result = 'PROMOTED WITH GRACE';

  const hyPct = maxMarks > 0 ? (hyGrand / maxMarks) * 100 : 0;
  const ftPct = maxMarks > 0 ? (ftGrand / maxMarks) * 100 : 0;
  const overallPct = (maxMarks * 2) > 0 ? ((hyGrand + ftGrand) / (maxMarks * 2)) * 100 : 0;
  function gfp(p) {
    if (p >= 90) return 'O'; if (p >= 80) return 'A+'; if (p >= 70) return 'A';
    if (p >= 60) return 'B+'; if (p >= 50) return 'B'; if (p >= 40) return 'C';
    if (p >= 33) return 'D'; return 'F';
  }
  function fmtp(p) { return parseFloat((Math.round(p * 10) / 10).toFixed(1)); }

  const coScholastic = {};
  const csSrc = hyData.coScholastic || ftData.coScholastic || {};
  for (const item of (cfg.coScholastic || [])) {
    const cs = csSrc[item.key] || {};
    coScholastic[item.key] = { halfYearly: cs.T1 || '', finalTerm: cs.T2 || '' };
  }

  const att  = hyData.attendance || ftData.attendance || {};
  const rank = hyData.rank || ftData.rank || {};
  const rem  = hyData.remarks || ftData.remarks || {};
  const sd   = studentData || {};

  const data = {
    schoolName:   cfg.schoolName || 'St. Francis De Sales School',
    session:      '2026-2027',
    class:        String(classNum),
    section:      (classId.split('-')[1] || '').trim(),
    classTeacher: ME.teacher?.name || '',
    student: {
      name:        sd.name         || sd.studentName || studentId,
      rollNo:      sd.rollNo       || sd.roll        || 0,
      admissionNo: sd.admissionNo  || sd.admNo       || '',
      dob:         sd.dob          || '',
      house:       sd.house        || ''
    },
    halfYearly:  { subjects: hySubjects, grandTotal: hyGrand, percentage: fmtp(hyPct), grade: gfp(hyPct), rank: rank.hyRank || 0, totalStudents: rank.totalStudents || 0, attendance: { present: att.hyPresent || 0, total: att.hyTotal || 0 } },
    finalTerm:   { subjects: ftSubjects, grandTotal: ftGrand, percentage: fmtp(ftPct), grade: gfp(ftPct), rank: rank.ftRank || 0, totalStudents: rank.totalStudents || 0, attendance: { present: att.ftPresent || 0, total: att.ftTotal || 0 } },
    consolidated:{ subjects: consolSubjects, grandTotal: hyGrand + ftGrand, percentage: fmtp(overallPct), grade: gfp(overallPct), result },
    coScholastic,
    remarks: { halfYearly: rem.halfYearly || '', finalTerm: rem.finalTerm || '', principal: rem.principal || '' }
  };

  sessionStorage.setItem('sfds_studentData', JSON.stringify(data));
  window.open('reportcard.html', '_blank');
}

// ─── PUSH TO ADMIN MODAL HANDLERS ────────────────────────────────────────────
$('btnCancelPush').addEventListener('click', () => $('pushAdminModal').classList.add('hidden'));

$('btnConfirmPush').addEventListener('click', async () => {
  const modal = $('pushAdminModal');
  const btn   = $('btnConfirmPush');
  btn.disabled = true;
  btn.textContent = 'Pushing…';
  try {
    const term  = modal.dataset.term;
    const count = parseInt(modal.dataset.count) || 0;
    await db.collection('classSubmissions').doc(`${ME.ctClassId}_${term}`).set({
      classId:       ME.ctClassId,
      term:          term,
      submittedBy:   ME.teacher?.name || ME.user?.email || 'Unknown',
      submittedAt:   firebase.firestore.FieldValue.serverTimestamp(),
      studentCount:  count,
      status:        'submitted'
    });
    modal.classList.add('hidden');
    alert(`Class ${ME.ctClassId} (${term === 'HY' ? 'Half Yearly' : 'Final Term'}) successfully pushed to admin.`);
  } catch (e) {
    alert('Push failed: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '&#10003; Confirm &amp; Push';
  }
});

// ─── GENERATE CLASS MARKSHEET ─────────────────────────────────────────────────
async function generateClassMarksheet() {
  const classId  = ME.ctClassId;
  const classNum = ME.ctClassNum;
  const cfg      = CONFIG[classNum];
  if (!cfg || !classId) { alert('Class config not found.'); return; }

  const btn = $('ctBtnMarksheet');
  btn.disabled = true;
  btn.textContent = 'Loading…';

  try {
    const [hySnap, ftSnap] = await Promise.all([
      db.collection('marks').doc(`${classId}_HY`).collection('students').get(),
      db.collection('marks').doc(`${classId}_FT`).collection('students').get()
    ]);

    const hyMap = {};
    hySnap.forEach(d => { hyMap[d.id] = d.data(); });

    const classList = [];
    const passmark  = cfg.passmark || 40;

    ftSnap.forEach(doc => {
      const ftData = doc.data();
      const hyData = hyMap[doc.id] || {};
      if (ftData.status !== 'locked') return; // only include locked students

      const hySubjects = {}, ftSubjects = {}, consolSubjects = {};
      let hyGrand = 0, ftGrand = 0;
      let result = 'PASS';

      for (const subj of cfg.subjects) {
        let hyTotal, ftTotal, hyIa, hyTe, ftIa, ftTe;

        if (subj.isAggregate) {
          const hyAgg = computeAggregateSubject(hyData?.academics, subj, cfg);
          const ftAgg = computeAggregateSubject(ftData?.academics, subj, cfg);
          hyTotal = hyAgg.total; hyIa = hyAgg.ia; hyTe = hyAgg.exam;
          ftTotal = ftAgg.total; ftIa = ftAgg.ia; ftTe = ftAgg.exam;
          hySubjects[subj.key] = { ia: hyIa, ut: 0, exam: hyTe, total: hyTotal };
          ftSubjects[subj.key] = { ia: ftIa, ut: 0, exam: ftTe, total: ftTotal };
        } else {
          const hyA = hyData?.academics?.[subj.key] || {};
          const ftA = ftData?.academics?.[subj.key] || {};
          hyTotal = hyA.total ?? 0; hyIa = hyA.IA ?? hyA.singleMark ?? 0; hyTe = hyA.TE ?? 0;
          ftTotal = ftA.total ?? 0; ftIa = ftA.IA ?? ftA.singleMark ?? 0; ftTe = ftA.TE ?? 0;
          hySubjects[subj.key] = { ia: hyIa, ut: hyA.UT ?? 0, exam: hyTe, total: hyTotal };
          ftSubjects[subj.key] = { ia: ftIa, ut: ftA.UT ?? 0, exam: ftTe, total: ftTotal };
        }
        consolSubjects[subj.key] = { term1: hyTotal, term2: ftTotal, total: hyTotal + ftTotal };

        if (subj.countInTotal) {
          hyGrand += hyTotal;
          ftGrand += ftTotal;
          if (hyTotal < passmark || ftTotal < passmark ||
              subjectFailsFloor(hyIa, hyTe, cfg, subj) ||
              subjectFailsFloor(ftIa, ftTe, cfg, subj)) {
            result = 'FAIL';
          }
        }
      }

      const adminDecision = ftData?.adminDecision || '';
      if (adminDecision === 'Promoted')              result = 'PROMOTED';
      else if (adminDecision === 'Detained')          result = 'DETAINED';
      else if (adminDecision === 'Promoted with Grace') result = 'PROMOTED WITH GRACE';

      const maxMarks  = cfg.grandTotalMax || 0;
      const hyPct     = maxMarks > 0 ? (hyGrand / maxMarks) * 100 : 0;
      const ftPct     = maxMarks > 0 ? (ftGrand / maxMarks) * 100 : 0;
      const overallPct= (maxMarks * 2) > 0 ? ((hyGrand + ftGrand) / (maxMarks * 2)) * 100 : 0;

      const rank = ftData.rank || {};

      classList.push({
        class:      classNum,
        schoolName: 'St. Francis De Sales Secondary School',
        session:    '2026–2027',
        student:    { name: ftData.studentName || doc.id, rollNo: ftData.rollNo || 0 },
        halfYearly: {
          subjects:      hySubjects,
          grandTotal:    hyGrand,
          percentage:    parseFloat((Math.round(hyPct * 10) / 10).toFixed(1)),
          grade:         _gradeFromPct(hyPct),
          rank:          rank.hyRank || 0,
          totalStudents: rank.totalStudents || 0,
          attendance:    { present: hyData?.attendance?.hyPresent || 0, total: hyData?.attendance?.hyTotal || 0 }
        },
        finalTerm: {
          subjects:      ftSubjects,
          grandTotal:    ftGrand,
          percentage:    parseFloat((Math.round(ftPct * 10) / 10).toFixed(1)),
          grade:         _gradeFromPct(ftPct),
          rank:          rank.ftRank || 0,
          totalStudents: rank.totalStudents || 0,
          attendance:    { present: ftData?.attendance?.ftPresent || 0, total: ftData?.attendance?.ftTotal || 0 }
        },
        consolidated: {
          subjects:   consolSubjects,
          grandTotal: hyGrand + ftGrand,
          percentage: parseFloat((Math.round(overallPct * 10) / 10).toFixed(1)),
          grade:      _gradeFromPct(overallPct),
          result
        }
      });
    });

    if (!classList.length) {
      alert('No locked student records found. Lock the records first.');
      return;
    }

    // Sort by roll number
    classList.sort((a, b) => (a.student.rollNo || 999) - (b.student.rollNo || 999));

    sessionStorage.setItem('sfds_classList', JSON.stringify(classList));
    window.open('marksheet.html', '_blank');
  } catch(e) {
    alert('Error generating marksheet: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '&#128203; Generate A3 Class Marksheet';
  }
}

function _gradeFromPct(p) {
  if (p >= 90) return 'O'; if (p >= 80) return 'A+'; if (p >= 70) return 'A';
  if (p >= 60) return 'B+'; if (p >= 50) return 'B'; if (p >= 40) return 'C';
  if (p >= 33) return 'D'; return 'F';
}

// ─── ADMIN: VIEW REPORT CARD (from admin panel sessionStorage payload) ────────
async function openReportCardFromAdmin(payload) {
  const { hyData, ftData, classId } = payload;
  const classNum = classNumFromId(classId);
  const cfg      = CONFIG[classNum];
  if (!cfg) { alert('Config not found for class ' + classId); return; }

  // Reuse same assembly logic as openReportCard()
  ME.activeStudent = {
    studentId:   ftData.studentId   || '',
    studentData: { name: ftData.studentName, rollNo: ftData.rollNo },
    classId,
    hyData,
    ftData
  };
  await openReportCard();
}
