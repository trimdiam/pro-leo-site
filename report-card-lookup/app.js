import { buildPrintableHTML } from './report-card-print.js';

const FB_VERSION = '10.13.0';
const FB_BASE    = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

const firebaseConfig = {
  apiKey:            "AIzaSyBXq3fe0uY8UB7-uLGzGIIvZOQf8YjNqaM",
  authDomain:        "st-francis-school-a3e7e.firebaseapp.com",
  projectId:         "st-francis-school-a3e7e",
  storageBucket:     "st-francis-school-a3e7e.firebasestorage.app",
  messagingSenderId: "180123372524",
  appId:             "1:180123372524:web:caed0f2a44d35f19d90ec9",
  measurementId:     "G-TD628HY5XY"
};

const form = document.getElementById('lookupForm');
const msgEl = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');
const resultFrame = document.getElementById('resultFrame');

function showMsg(text, type) {
  msgEl.textContent = text;
  msgEl.className = type;
}

function clearMsg() {
  msgEl.textContent = '';
  msgEl.className = '';
}

// Disable the button immediately (synchronously, before any await) so a
// click that lands before Firebase finishes loading can't fall through to
// a native, unhandled form submit (which just reloads the page blank —
// the inputs have no `name` attributes, so nothing would even be sent).
submitBtn.disabled = true;
submitBtn.textContent = 'Loading…';
form.addEventListener('submit', (e) => e.preventDefault());

let lookupReportCard = null;

(async () => {
  const { initializeApp } = await import(`${FB_BASE}/firebase-app.js`);
  const { getFunctions, httpsCallable, connectFunctionsEmulator } = await import(`${FB_BASE}/firebase-functions.js`);

  const app = initializeApp(firebaseConfig);
  const functions = getFunctions(app, 'asia-south1');
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }
  lookupReportCard = httpsCallable(functions, 'lookupReportCard');

  submitBtn.disabled = false;
  submitBtn.textContent = 'View Report Card';
})().catch((err) => {
  showMsg('Could not load the lookup form. Please refresh the page.', 'error');
  console.error('Firebase init failed:', err);
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!lookupReportCard) return; // not ready yet; button is disabled anyway
  clearMsg();

  const classRaw = document.getElementById('classSel').value;
  const rollNo   = document.getElementById('rollInput').value;
  const dob      = document.getElementById('dobInput').value;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Looking up…';

  try {
    const res = await lookupReportCard({ class: classRaw, rollNo: parseInt(rollNo, 10), dob });
    const data = res.data;

    // Render in THIS tab rather than a new one — popups are unreliable on
    // mobile browsers (the exact audience for this feature) even from a
    // direct click, so avoid depending on window.open() entirely.
    if (data.system === 'marks') {
      sessionStorage.setItem('sfds_adminRC', JSON.stringify({
        hyData:  data.hyData,
        ftData:  data.ftData,
        classId: data.classId
      }));
      window.location.href = '../Sfs-report-card/reportcard.html';
    } else if (data.system === 'report_cards') {
      const card = data.reportCard;
      const hy1Card = card.term === 'HY1' ? card : undefined;
      const hy2Card = card.term === 'HY2' ? card : undefined;
      const html = buildPrintableHTML(hy1Card, hy2Card, {
        studentName: card.studentName,
        className:   card.className,
        rollNo:      card.rollNo,
        studentId:   card.studentId,
        section:     card.section
      });
      // Render into an iframe rather than document.write()-ing over the
      // current page: document.write() mid-script-execution is unreliable
      // (the running script's own context can get torn down along with the
      // rest of the document), and this also keeps the form visible so a
      // parent can look up a second child without reloading.
      resultFrame.srcdoc = html;
      resultFrame.style.display = 'block';
      resultFrame.scrollIntoView({ behavior: 'smooth' });
    } else {
      showMsg('Unexpected response from server. Please contact the school office.', 'error');
    }
  } catch (err) {
    showMsg(err.message || 'Something went wrong. Please try again.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'View Report Card';
  }
});
