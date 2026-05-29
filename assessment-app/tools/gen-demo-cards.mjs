// ── Demo Report Card Generator ────────────────────────────────────────────────
// Drives the REAL print engine (report-card-print.js) with synthetic-but-realistic
// marks built from the REAL subjects.json + criteria JSON files.
// Outputs one self-contained HTML card per class into ./demo-output/.
//
// Run:  node assessment-app/tools/gen-demo-cards.mjs   (from pro-leo-site/)

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildPrintableHTML } from '../../report-card-print.js';
import { generateTeacherRemark, generateAnnualRemark } from '../services/report-card-remark-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');           // assessment-app/
const SITE      = resolve(ROOT, '..');                // pro-leo-site/
const DATA      = resolve(ROOT, 'data');
const OUT       = resolve(__dirname, 'demo-output');

mkdirSync(OUT, { recursive: true });

// ── Grade scale (mirrors report-card-print.js gradeCode) ───────────────────────
function gradeCode(avg) {
  if (avg == null) return 'Ex';
  if (avg >= 4.5) return 'Adv';
  if (avg >= 3.5) return 'Prof';
  if (avg >= 2.5) return 'Dev';
  if (avg >= 1.5) return 'Beg';
  return 'NY';
}
const GRADE_WORD = { Adv: 'Advanced', Prof: 'Proficient', Dev: 'Developing', Beg: 'Beginning', NY: 'Not Yet', Ex: 'Exempt' };

// ── Load real curriculum ───────────────────────────────────────────────────────
const subjects = JSON.parse(readFileSync(resolve(DATA, 'subjects.json'), 'utf8'));

function loadCriteria(criteriaPath) {
  const raw = readFileSync(resolve(ROOT, criteriaPath), 'utf8').replace(/^﻿/, '');
  const json = JSON.parse(raw);
  return json.criteria || [];
}

function subjectsForClass(className) {
  return subjects.filter(s => s.classes.includes(className));
}

// ── Synthetic score generator ──────────────────────────────────────────────────
// Deterministic wave so each criterion gets a believable, varied score.
// HY2 trends slightly upward from HY1 to make the annual "improving" trend show.
function scoreFor(seed, term) {
  const wave = 3.4 + 1.3 * Math.sin(seed * 1.3) * Math.cos(seed * 0.7);   // ~2.1 .. 4.7
  const bump = term === 'hy2' ? 0.25 : 0;
  return Math.max(0.5, Math.min(5, Math.round((wave + bump) * 10) / 10));
}

function buildSubjectsForTerm(className, term) {
  return subjectsForClass(className).map((subj, si) => {
    const criteriaDefs = loadCriteria(subj.criteria_path);
    const criteria = criteriaDefs.map((c, ci) => {
      const avg = scoreFor(si * 10 + ci + 1, term);
      return {
        criterion_id:   c.criterion_id,
        criterion_name: c.criterion_name,
        category:       c.category || 'General',
        averageScore:   avg,
        grade:          gradeCode(avg),
        label:          GRADE_WORD[gradeCode(avg)],
        sessionCount:   6,
        absentCount:    0
      };
    });
    const subjAvg = Math.round(
      (criteria.reduce((a, c) => a + c.averageScore, 0) / criteria.length) * 100
    ) / 100;
    return {
      subject_id:     subj.subject_id,
      subject_name:   subj.subject_name,
      subjectAverage: subjAvg,
      subjectGrade:   gradeCode(subjAvg),
      criteria
    };
  });
}

function buildCard(className, term, dateFrom, dateTo, firstName) {
  const subs = buildSubjectsForTerm(className, term);
  const overallAvg = Math.round(
    (subs.reduce((a, s) => a + s.subjectAverage, 0) / subs.length) * 100
  ) / 100;
  const sorted = [...subs].sort((a, b) => b.subjectAverage - a.subjectAverage);
  const strongest = sorted[0]?.subject_name;
  const weakest   = sorted[sorted.length - 1]?.subject_name;
  const overallGrade = gradeCode(overallAvg);
  // HY2 trends upward from HY1 (the scoreFor() bump), HY1 reads as stable.
  const trendDirection = term === 'hy2' ? 'improving' : 'stable';

  // Real, performance-rooted remark — same engine the production builder uses.
  const teacherRemark = generateTeacherRemark({
    firstName,
    className,
    overallGrade,
    overallLabel:     GRADE_WORD[overallGrade],
    strongestSubject: strongest,
    weakestSubject:   weakest,
    improvementAreas: [weakest],
    trendDirection,
    attendanceRisk:   false
  });

  return {
    className,
    academicYear: '2025–2026',
    term: term.toUpperCase(),
    dateFrom, dateTo,
    subjects: subs,
    overallAverageScore: overallAvg,
    overallGrade,
    overallLabel: GRADE_WORD[overallGrade],
    strongestSubject: strongest,
    weakestSubject: weakest,
    improvementAreas: [weakest],
    trendDirection,
    teacherRemark,
    attendancePresentDays: term === 'hy1' ? 92 : 88,
    attendanceWorkingDays: term === 'hy1' ? 100 : 95,
    promotedToClass: term === 'hy2' ? nextClass(className) : null
  };
}

function nextClass(c) {
  const map = { 'LKG': 'SKG', 'SKG': 'Class I', 'Class I': 'Class II', 'Class II': 'Class III' };
  return map[c] || null;
}

// ── Demo students per class ─────────────────────────────────────────────────────
const DEMO = [
  { className: 'LKG',      studentName: 'Aiborlang Kharkongor', rollNo: '01', studentId: 'SFS/2025/LKG/01' },
  { className: 'SKG',      studentName: 'Daihunlang Nongrum',   rollNo: '01', studentId: 'SFS/2025/SKG/01' },
  { className: 'Class I',  studentName: 'Banshanlang Lyngdoh',  rollNo: '01', studentId: 'SFS/2025/I/01'   },
  { className: 'Class II', studentName: 'Ibakordor Syiem',      rollNo: '01', studentId: 'SFS/2025/II/01'  }
];

const index = [];
for (const d of DEMO) {
  const firstName = d.studentName.trim().split(/\s+/)[0];
  const hy1 = buildCard(d.className, 'hy1', '2025-04-01', '2025-09-30', firstName);
  const hy2 = buildCard(d.className, 'hy2', '2025-10-01', '2026-03-31', firstName);

  // Real annual remark — assembled from both terms by the same engine.
  hy2.annualRemark = generateAnnualRemark({
    firstName,
    className:         d.className,
    hy1Grade:          hy1.overallGrade,
    hy2Grade:          hy2.overallGrade,
    annualGrade:       gradeCode((hy1.overallAverageScore + hy2.overallAverageScore) / 2),
    strongestSubject:  hy2.strongestSubject,
    mostImprovedArea:  hy2.strongestSubject,
    persistentWeakArea: hy2.weakestSubject,
    promotedToClass:   hy2.promotedToClass
  });

  const html = buildPrintableHTML(hy1, hy2, {
    studentName: d.studentName,
    className:   d.className,
    rollNo:      d.rollNo,
    studentId:   d.studentId
  }, { logoUrl: '' });   // empty logo → "SFDS CREST" placeholder, no network dependency

  const file = `demo_${d.className.replace(/\s+/g, '_')}.html`;
  writeFileSync(resolve(OUT, file), html, 'utf8');
  const nCrit = subjectsForClass(d.className).reduce((a, s) => a + loadCriteria(s.criteria_path).length, 0);
  index.push({ file, ...d, subjects: subjectsForClass(d.className).length, criteria: nCrit });
  console.log(`✓ ${d.className.padEnd(9)} → ${file}  (${index.at(-1).subjects} subjects, ${nCrit} criteria rows)`);
}

console.log(`\nOutput folder: ${OUT}`);
