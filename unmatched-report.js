const XLSX = require('xlsx');
const fs   = require('fs');

const ID_FILE      = 'C:/Users/user/Downloads/student-records.xlsx';
const DETAILS_FILE = 'C:/Users/user/Downloads/SFS DETAILS 2026-27.xlsx';

function norm(s) { return String(s||'').toUpperCase().trim().replace(/\s+/g,' '); }
function clean(v) {
  const s = String(v||'').trim();
  if (!s||s==='—'||s==='-'||s.toLowerCase()==='na'||s.toLowerCase()==='a/f') return '';
  return s;
}
function detectCols(row) {
  const map = {};
  row.forEach((cell,i) => {
    const h = String(cell||'').toLowerCase().trim().replace(/\s+/g,' ');
    if (/name of|^name$/.test(h))       map.name = i;
    if (/house/.test(h))                 map.house = i;
  });
  return map;
}

// Parse ID file
const wbId   = XLSX.readFile(ID_FILE);
const idRows = XLSX.utils.sheet_to_json(wbId.Sheets[wbId.SheetNames[0]], { header:1, defval:'' });
const idRecs = {};
for (let i = 1; i < idRows.length; i++) {
  const r = idRows[i];
  const name = clean(r[1]); if (!name) continue;
  idRecs[norm(name)] = { studentId: clean(r[0]), name, class: clean(r[2]), rollNo: clean(r[4]) };
}

// Parse details file
const wbDet   = XLSX.readFile(DETAILS_FILE);
const detRecs = {};
for (const sheet of wbDet.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wbDet.Sheets[sheet], { header:1, defval:'' });
  if (rows.length < 2) continue;
  const cols = detectCols(rows[0]);
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const ni = cols.name !== undefined ? cols.name : 1;
    const name = clean(r[ni]); if (!name) continue;
    detRecs[norm(name)] = { name, sheet };
  }
}

// Find unmatched
const inIdNotDet = []; // has Student ID, no details match
const inDetNotId = []; // has details, no Student ID match

for (const [key, rec] of Object.entries(idRecs)) {
  if (!detRecs[key]) inIdNotDet.push(rec);
}
for (const [key, rec] of Object.entries(detRecs)) {
  if (!idRecs[key]) inDetNotId.push(rec);
}

// Build report
let lines = [];
lines.push('SFS STUDENT DATA IMPORT — UNMATCHED NAMES REPORT');
lines.push('Generated: ' + new Date().toLocaleString('en-IN'));
lines.push('='.repeat(70));
lines.push('');
lines.push(`TOTAL UNMATCHED: ${inIdNotDet.length + inDetNotId.length}`);
lines.push('');
lines.push('-'.repeat(70));
lines.push('GROUP A — In student-records.xlsx but NO MATCH in SFS DETAILS file');
lines.push('(These students have a Student ID but their name spelling differs)');
lines.push('-'.repeat(70));
lines.push('');
lines.push('STUDENT ID    CLASS         ROLL   NAME');
lines.push('-'.repeat(70));
inIdNotDet
  .sort((a,b) => (a.class||'').localeCompare(b.class||''))
  .forEach(r => {
    lines.push(
      (r.studentId||'—').padEnd(14) +
      (r.class||'—').padEnd(14) +
      (r.rollNo||'—').padEnd(7) +
      r.name
    );
  });

lines.push('');
lines.push('-'.repeat(70));
lines.push('GROUP B — In SFS DETAILS file but NO MATCH in student-records.xlsx');
lines.push('(These names exist in details but no matching Student ID found)');
lines.push('-'.repeat(70));
lines.push('');
lines.push('SHEET         NAME');
lines.push('-'.repeat(70));
inDetNotId
  .sort((a,b) => (a.sheet||'').localeCompare(b.sheet||''))
  .forEach(r => {
    lines.push((r.sheet||'—').padEnd(14) + r.name);
  });

lines.push('');
lines.push('='.repeat(70));
lines.push('TIP: Compare GROUP A and GROUP B side by side.');
lines.push('They are likely the same students with slightly different spellings.');
lines.push('');

const outPath = 'C:/Users/user/Downloads/unmatched-students.txt';
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log('\n✅  Report written to: ' + outPath);
console.log(`    Group A (has ID, no details): ${inIdNotDet.length}`);
console.log(`    Group B (has details, no ID): ${inDetNotId.length}\n`);
