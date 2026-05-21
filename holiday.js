// holiday.js — School Calendar & Holiday Card Module
// Loads data from Firestore (holidays/school_calendar), falls back to
// embedded default data.  Renders month cards, supports filter + search.

import { initializeApp, getApps, getApp }
  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import { getFirestore, doc, getDoc }
  from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

// ── Firebase config (shared project) ──────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBXq3fe0uY8UB7-uLGzGIIvZOQf8YjNqaM",
  authDomain:        "st-francis-school-a3e7e.firebaseapp.com",
  projectId:         "st-francis-school-a3e7e",
  storageBucket:     "st-francis-school-a3e7e.firebasestorage.app",
  messagingSenderId: "180123372524",
  appId:             "1:180123372524:web:caed0f2a44d35f19d90ec9"
};

const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
const db  = getFirestore(app);

// ── Month order ────────────────────────────────────────────────────────────
const MONTH_ORDER = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];

// ── Fallback / default calendar data ──────────────────────────────────────
const DEFAULT_DATA = {
  "January": [
    { "date": "5",     "event": "School Re-opens" },
    { "date": "5-16",  "event": "Pre-Boards Preparation" },
    { "date": "26",    "event": "Republic Day", "type": "holiday" }
  ],
  "February": [
    { "date": "5",     "event": "Teacher's Orientation" },
    { "date": "12",    "event": "School Re-opens (V-X)" },
    {                  "event": "ID distribution and Class Photographs" },
    {                  "event": "Selection of Student Council Members" },
    { "date": "13",    "event": "Holiday for V-X", "type": "holiday" },
    {                  "event": "School re-opens & Photography for CI-IV" },
    { "date": "19",    "event": "Investiture Ceremony" },
    { "date": "20",    "event": "School Opening Mass & Farewell for CI.X" }
  ],
  "March": [
    { "date": "4",     "event": "Holi Holiday",           "type": "holiday" },
    { "date": "18-19", "event": "Annual Sports Meet 2026" },
    { "date": "21",    "event": "Id-Ul-Fitr",             "type": "holiday" }
  ],
  "April": [
    { "date": "2",  "event": "Holy Thursday", "type": "holiday" },
    { "date": "3",  "event": "Good Friday",   "type": "holiday" }
  ],
  "May": [
    { "date": "14-15", "event": "Literary Days" },
    { "date": "27",    "event": "Id-Uz-Zuha",  "type": "holiday" }
  ],
  "June": [
    { "date": "5",  "event": "World Environment Day" },
    { "date": "18", "event": "Half-Yearly Exam Begins" }
  ],
  "July": [
    { "date": "1-10", "event": "Summer Vacation",                "type": "holiday" },
    { "date": "9",    "event": "Behdeinkhlam" },
    { "date": "13",   "event": "School Re-opens" },
    { "date": "16",   "event": "Result of Half-Yearly" },
    { "date": "17",   "event": "Death Anniversary of U Tirot Sing" }
  ],
  "August": [
    { "date": "15", "event": "Independence Day", "type": "holiday" }
  ],
  "September": [
    { "date": "4", "event": "Janmashtami",            "type": "holiday" },
    { "date": "5", "event": "Teacher's Day Celebration" }
  ],
  "October": [
    { "date": "1",  "event": "Children Adoration Day" },
    { "date": "2",  "event": "Gandhi Jayanti",  "type": "holiday" },
    { "date": "19", "event": "Dussehra",        "type": "holiday" },
    { "date": "20", "event": "Maha Dashami",    "type": "holiday" },
    {               "event": "Puja Holidays",   "type": "holiday" }
  ],
  "November": [
    { "date": "2",     "event": "All Souls Day",                    "type": "holiday" },
    { "date": "12",    "event": "Pre-Children's Day Celebration" },
    { "date": "13",    "event": "Wangala",                         "type": "holiday" },
    { "date": "16-28", "event": "Final Exams" },
    { "date": "23",    "event": "Seng Kut Snem",                   "type": "holiday" }
  ],
  "December": [
    { "date": "12", "event": "Death Anniversary of Pa Togan N. Sangma", "type": "holiday" },
    { "date": "18", "event": "Death Anniversary of U Soso Tham",        "type": "holiday" }
  ]
};

// ── State ──────────────────────────────────────────────────────────────────
let calendarData   = {};
let activeFilter   = 'all';    // 'all' | 'holiday'
let searchQuery    = '';

// ── DOM refs ──────────────────────────────────────────────────────────────
const grid         = document.getElementById('cal-grid');
const statusEl     = document.getElementById('cal-status');
const searchInput  = document.getElementById('cal-search');

// ── Utilities ─────────────────────────────────────────────────────────────
function showStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.className   = 'cal-status visible' + (isError ? ' error' : '');
}

function hideStatus() {
  statusEl.className = 'cal-status';
}

// ── Render ────────────────────────────────────────────────────────────────
function renderGrid() {
  grid.innerHTML = '';

  MONTH_ORDER.forEach(month => {
    const events = calendarData[month];
    if (!events || !Array.isArray(events)) return;

    // Apply filter
    let filtered = events.filter(ev => {
      if (activeFilter === 'holiday' && ev.type !== 'holiday') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inName = ev.event?.toLowerCase().includes(q);
        const inDate = ev.date?.toLowerCase().includes(q);
        if (!inName && !inDate) return false;
      }
      return true;
    });

    // Skip month card entirely if no events match current filter/search
    if (filtered.length === 0) return;

    const card = document.createElement('div');
    card.className = 'month-card';

    // Header
    const header = document.createElement('div');
    header.className = 'month-card-header';
    header.innerHTML =
      `<span>${month}</span>` +
      `<span class="month-count">${filtered.length}</span>`;
    card.appendChild(header);

    // Body
    const body = document.createElement('div');
    body.className = 'month-card-body';

    filtered.forEach(ev => {
      const isHoliday = ev.type === 'holiday';
      const row = document.createElement('div');
      row.className = 'event-row' + (isHoliday ? ' is-holiday' : '');

      const icon = document.createElement('span');
      icon.className = 'event-icon';
      icon.textContent = isHoliday ? '🎉' : '📅';

      const bodyDiv = document.createElement('div');
      bodyDiv.className = 'event-body';

      if (ev.date) {
        const dateEl = document.createElement('div');
        dateEl.className = 'event-date';
        dateEl.textContent = ev.date;
        bodyDiv.appendChild(dateEl);
      }

      const nameEl = document.createElement('div');
      nameEl.className = 'event-name';
      nameEl.textContent = ev.event;
      bodyDiv.appendChild(nameEl);

      row.appendChild(icon);
      row.appendChild(bodyDiv);
      body.appendChild(row);
    });

    card.appendChild(body);
    grid.appendChild(card);
  });

  // No results message
  if (grid.children.length === 0) {
    const msg = document.createElement('p');
    msg.style.cssText = 'grid-column:1/-1;text-align:center;padding:40px;color:#7a6652;font-size:14px';
    msg.textContent = searchQuery
      ? `No events found for "${searchQuery}".`
      : 'No holidays found.';
    grid.appendChild(msg);
  }
}

// ── Filter toggle (called from HTML) ──────────────────────────────────────
window.setFilter = function (filter) {
  activeFilter = filter;
  document.getElementById('btn-all').classList.toggle('active',     filter === 'all');
  document.getElementById('btn-holiday').classList.toggle('active', filter === 'holiday');
  renderGrid();
};

// ── Search ────────────────────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  searchQuery = searchInput.value.trim();
  renderGrid();
});

// ── Load data from Firestore ───────────────────────────────────────────────
async function loadCalendar() {
  showStatus('Loading calendar…');
  try {
    const snap = await getDoc(doc(db, 'holidays', 'school_calendar'));
    if (snap.exists()) {
      calendarData = snap.data();
      hideStatus();
    } else {
      // Document not yet created — use default data and note it
      calendarData = DEFAULT_DATA;
      showStatus('Showing default calendar. Admin can update via Firestore.');
    }
  } catch (err) {
    console.warn('[holiday] Firestore load failed, using default data:', err.message);
    calendarData = DEFAULT_DATA;
    showStatus('Could not reach server — showing offline calendar.', false);
    setTimeout(hideStatus, 4000);
  }
  renderGrid();
}

// ── Init ──────────────────────────────────────────────────────────────────
loadCalendar();
