/**
 * seed-update.js — SFS Student Data Import
 * Reads both Excel files, matches by name, updates Firestore.
 * Run: node seed-update.js
 * Requires: serviceAccountKey.json in the same folder
 */

const admin = require('firebase-admin');
const XLSX  = require('xlsx');
const fs    = require('fs');
const path  = require('path');

// ── FIREBASE INIT ─────────────────────────────────────────────────────────────
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(keyPath)) {
  console.error('\n❌  serviceAccountKey.json not found!');
  console.error('   1. Go to: https://console.firebase.google.com/project/st-francis-school-a3e7e/settings/serviceaccounts/adminsdk');
  console.error('   2. Click "Generate new private key"');
  console.error('   3. Save the file as serviceAccountKey.json in: ' + __dirname);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(keyPath)) });
const db = admin.firestore();

// ── FILE PATHS ────────────────────────────────────────────────────────────────
const ID_FILE      = 'C:/Users/user/Downloads/student-records.xlsx';
const DETAILS_FILE = 'C:/Users/user/Downloads/SFS DETAILS 2026-27.xlsx';

// ── HELPERS ───────────────────────────────────────────────────────────────────
function norm(s) {
  return String(s || '').toUpperCase().trim().replace(/\s+/g, ' ');
}

function clean(v) {
  const s = String(v || '').trim();
  if (!s || s === '—' || s === '-' || s.toLowerCase() === 'na'
      || s.toLowerCase() === 'a/f' || s === 'N/A') return '';
  return s;
}

function excelDateToISO(v) {
  const s = String(v || '').trim();
  if (!s || s === '—') return '';
  const n = parseFloat(s);
  if (!isNaN(n) && n > 1000) {
    const d = new Date(Math.round((n - 25569) * 86400 * 1000));
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  // text formats: DD.MM.YYYY or DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // try JS parse (e.g. "14-Mar-2010")
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  return '';
}

function detectCols(row) {
  const map = {};
  row.forEach((cell, i) => {
    const h = String(cell || '').toLowerCase().trim().replace(/\s+/g, ' ');
    if (/name of|^name$/.test(h))         map.name    = i;
    if (/pen/.test(h))                     map.pen     = i;
    if (/house/.test(h))                   map.house   = i;
    if (/gender/.test(h))                  map.gender  = i;
    if (/birth|d\.o\.b|^dob$/.test(h))    map.dob     = i;
    if (/b\.g|b-g|blood/.test(h))          map.blood   = i;
    if (/mother/.test(h))                  map.mother  = i;
    if (/father/.test(h))                  map.father  = i;
    if (/address/.test(h))                 map.address = i;
    if (/^alt/.test(h))                    map.alt     = i;
    if (/^contact/.test(h))                map.contact = i;
    if (/adhaar|aadhaar|aadhar/.test(h))   map.aadhaar = i;
  });
  return map;
}

// ── PARSE student-records.xlsx ────────────────────────────────────────────────
function parseIdFile() {
  const wb   = XLSX.readFile(ID_FILE);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const out  = {};
  for (let i = 1; i < rows.length; i++) {
    const r    = rows[i];
    const id   = clean(r[0]);
    const name = clean(r[1]);
    if (!name) continue;
    out[norm(name)] = {
      studentId: id,
      name,
      class:   clean(r[2]),
      section: clean(r[3]),
      rollNo:  clean(r[4]),
      gender:  clean(r[5]) === 'Male' ? 'M' : clean(r[5]) === 'Female' ? 'F' : clean(r[5]),
      dob:     excelDateToISO(clean(r[6]))
    };
  }
  return out;
}

// ── PARSE SFS DETAILS 2026-27.xlsx ───────────────────────────────────────────
function parseDetailsFile() {
  const wb  = XLSX.readFile(DETAILS_FILE);
  const out = {};
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
    if (rows.length < 2) continue;
    const cols = detectCols(rows[0]);
    for (let i = 1; i < rows.length; i++) {
      const r    = rows[i];
      const ni   = cols.name !== undefined ? cols.name : 1;
      const name = clean(r[ni]);
      if (!name) continue;
      out[norm(name)] = {
        house:      clean(cols.house   !== undefined ? r[cols.house]   : ''),
        pen:        clean(cols.pen     !== undefined ? r[cols.pen]     : ''),
        dob:        excelDateToISO(clean(cols.dob !== undefined ? r[cols.dob] : '')),
        bloodGroup: clean(cols.blood   !== undefined ? r[cols.blood]   : ''),
        motherName: clean(cols.mother  !== undefined ? r[cols.mother]  : ''),
        fatherName: clean(cols.father  !== undefined ? r[cols.father]  : ''),
        address:    clean(cols.address !== undefined ? r[cols.address] : ''),
        contact:    clean(cols.contact !== undefined ? r[cols.contact] : ''),
        altContact: clean(cols.alt     !== undefined ? r[cols.alt]     : ''),
        aadhaar:    clean(cols.aadhaar !== undefined ? r[cols.aadhaar] : '')
      };
    }
  }
  return out;
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🔷  SFS Student Data Import\n' + '─'.repeat(50));

  console.log('📂  Reading student-records.xlsx…');
  const idRecs  = parseIdFile();
  console.log(`    → ${Object.keys(idRecs).length} students found`);

  console.log('📂  Reading SFS DETAILS 2026-27.xlsx…');
  const detRecs = parseDetailsFile();
  console.log(`    → ${Object.keys(detRecs).length} detail records found`);

  console.log('☁️   Fetching all Firestore students…');
  const snap = await db.collection('students').get();
  const fsMap = {};
  snap.forEach(d => { fsMap[d.id] = d.data(); });
  console.log(`    → ${snap.size} existing records in Firestore`);

  console.log('\n🔄  Processing updates…\n');

  let updated = 0, skipped = 0, errors = 0, noMatch = 0, notInFS = 0;
  const noMatchNames = [], notInFSNames = [];

  for (const [key, idRec] of Object.entries(idRecs)) {
    if (!idRec.studentId) { noMatch++; noMatchNames.push(idRec.name); continue; }

    const det    = detRecs[key] || null;
    const fsData = fsMap[idRec.studentId] || null;

    if (!fsData) { notInFS++; notInFSNames.push(`${idRec.studentId} — ${idRec.name}`); }

    const existing = fsData || {};
    const upd = {};

    function maybe(field, val) {
      if (val && !existing[field]) upd[field] = val;
    }

    // From ID file
    maybe('name',    idRec.name);
    maybe('class',   idRec.class);
    maybe('section', idRec.section);
    maybe('rollNo',  idRec.rollNo ? Number(idRec.rollNo) : null);
    maybe('gender',  idRec.gender);
    maybe('dob',     idRec.dob);

    // From details file
    if (det) {
      maybe('dob',        det.dob);
      maybe('bloodGroup', det.bloodGroup);
      maybe('house',      det.house);
      maybe('pen',        det.pen);
      maybe('motherName', det.motherName);
      maybe('fatherName', det.fatherName);
      maybe('address',    det.address);
      maybe('contact',    det.contact);
      maybe('altContact', det.altContact);
      maybe('aadhaar',    det.aadhaar);
    }

    // Remove null/undefined values
    Object.keys(upd).forEach(k => { if (!upd[k]) delete upd[k]; });

    if (!Object.keys(upd).length) {
      skipped++;
      continue;
    }

    try {
      await db.collection('students').doc(idRec.studentId).set(upd, { merge: true });
      console.log(`  ✅ ${idRec.studentId.padEnd(12)} ${idRec.name.padEnd(40)} [${Object.keys(upd).join(', ')}]`);
      updated++;
    } catch (e) {
      console.error(`  ❌ ${idRec.studentId} — ${idRec.name}: ${e.message}`);
      errors++;
    }
  }

  // Also flag detail records not in ID file
  for (const [key, det] of Object.entries(detRecs)) {
    if (!idRecs[key]) {
      noMatch++;
      noMatchNames.push(Object.values(det)[0] || key);
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log('✅  Updated:       ' + updated);
  console.log('⏭️   Skipped:       ' + skipped + ' (already complete)');
  console.log('➕  Not in FS:     ' + notInFS + ' (new students)');
  console.log('⚠️   No name match: ' + noMatch);
  console.log('❌  Errors:        ' + errors);

  if (notInFSNames.length) {
    console.log('\n📋  Students not yet in Firestore (may need manual add):');
    notInFSNames.forEach(n => console.log('     ' + n));
  }

  console.log('\n✔️   Done!\n');
  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
