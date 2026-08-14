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
import { gradeSubject } from '../services/report-card-grade-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');           // assessment-app/
const SITE      = resolve(ROOT, '..');                // pro-leo-site/
const DATA      = resolve(ROOT, 'data');
const OUT       = resolve(__dirname, 'demo-output');

mkdirSync(OUT, { recursive: true });

// Base64-embedded so the demo cards are genuinely standalone files (open
// directly via file://, no dev server, no network) — a bare relative path
// like 'assets/images/logo.webp' only resolves against a real origin, which
// is why this previously shipped with the logo disabled entirely.
function toDataUri(relPath, mime) {
  const buf = readFileSync(resolve(SITE, relPath));
  return `data:${mime};base64,${buf.toString('base64')}`;
}
const logoDataUri = toDataUri('assets/images/logo.webp', 'image/webp');
const sealDataUri = toDataUri('assets/images/schoolsea.jpeg', 'image/jpeg');

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

// ── Load real curriculum + registries ──────────────────────────────────────────
const subjects = JSON.parse(readFileSync(resolve(DATA, 'subjects.json'), 'utf8'));
const classTestConfig = JSON.parse(readFileSync(resolve(DATA, 'class-test-config.json'), 'utf8'));
const coscholasticRegistry = JSON.parse(readFileSync(resolve(DATA, 'coscholastic.json'), 'utf8'));

function loadCriteria(criteriaPath) {
  const raw = readFileSync(resolve(ROOT, criteriaPath), 'utf8').replace(/^﻿/, '');
  const json = JSON.parse(raw);
  return json.criteria || [];
}

function subjectsForClass(className) {
  return subjects.filter(s => s.classes.includes(className));
}

// Mirrors getClassTestSubjectsForClass(): class-test subject ids intersected
// with this class's real academic subject ids, same rule the app enforces.
function classTestSubjectIdsForClass(className) {
  if (!classTestConfig.classes.includes(className)) return [];
  const ids = new Set(subjectsForClass(className).map(s => s.subject_id));
  return Object.keys(classTestConfig.subjects).filter(id => ids.has(id));
}

function coScholasticSubjectsForClass(className) {
  return coscholasticRegistry.subjects.filter(s => (s.classes || []).includes(className));
}

// ── Synthetic score generator ──────────────────────────────────────────────────
// Deterministic wave so each criterion gets a believable, varied score.
// HY2 trends slightly upward from HY1 to make the annual "improving" trend show.
function scoreFor(seed, term) {
  const wave = 3.4 + 1.3 * Math.sin(seed * 1.3) * Math.cos(seed * 0.7);   // ~2.1 .. 4.7
  const bump = term === 'hy2' ? 0.25 : 0;
  return Math.max(0.5, Math.min(5, Math.round((wave + bump) * 10) / 10));
}

const classTestSubjectIds = classTestConfig.subjects; // { ENG1: { max_marks }, ... }

function buildSubjectsForTerm(className, term) {
  const testSubjectIds = classTestSubjectIdsForClass(className);

  return subjectsForClass(className).map((subj, si) => {
    const criteriaDefs = loadCriteria(subj.criteria_path);
    const criteria = criteriaDefs.map((c, ci) => ({
      criterion_id:   c.criterion_id,
      criterion_name: c.criterion_name,
      category:       c.category || 'General',
      averageScore:   scoreFor(si * 10 + ci + 1, term),
      sessionCount:   6,
      absentCount:    0
    }));

    // Half-Yearly class test — only where this class+subject has one
    // configured (mirrors getClassTestForSubject in report-card-builder.js).
    let classTest = null;
    if (testSubjectIds.includes(subj.subject_id)) {
      const maxMarks = classTestSubjectIds[subj.subject_id].max_marks;
      const marksObtained = Math.round((scoreFor(si * 7 + 3, term) / 5) * maxMarks);
      classTest = { marksObtained, maxMarks };
    }

    // Real blend logic (70% assessment / 30% class test where present) —
    // same function report-card-builder.js calls in production.
    const graded = gradeSubject({ subject_id: subj.subject_id, subject_name: subj.subject_name, criteria }, classTest);

    return {
      subject_id:        subj.subject_id,
      subject_name:      subj.subject_name,
      subjectAverage:    graded.subjectAverage,
      subjectGrade:      graded.subjectGrade?.code || 'Ex',
      assessmentAverage: graded.assessmentAverage ?? null,
      classTestScore:    graded.classTestScore ?? null,
      classTestMarks:    classTest ? `${classTest.marksObtained}/${classTest.maxMarks}` : null,
      criteria: graded.criteria.map(c => ({
        criterion_id:   c.criterion_id,
        criterion_name: c.criterion_name,
        category:       c.category,
        averageScore:   c.averageScore,
        grade:          c.grade?.code || 'Ex',
        label:          c.grade?.label || 'Exempt / No Data',
        sessionCount:   c.sessionCount,
        absentCount:    c.absentCount
      }))
    };
  });
}

// Deterministic letter grade for co-scholastic — same wave, mapped onto the
// registry's O/A+/A/B+/B/C scale instead of the 1-5 academic one.
function coScholasticGradeFor(seed, term) {
  const scale = coscholasticRegistry.gradeScale; // ['O','A+','A','B+','B','C'] — index 0 best
  const avg = scoreFor(seed, term); // ~0.5..5
  const idx = Math.min(scale.length - 1, Math.max(0, Math.round((5 - avg) / 5 * (scale.length - 1))));
  return scale[idx];
}

function buildCoScholasticForTerm(className, term) {
  return coScholasticSubjectsForClass(className).map((s, i) => ({
    key:   s.key,
    label: s.label,
    grade: coScholasticGradeFor(i * 5 + 2, term)
  }));
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
    coScholastic: buildCoScholasticForTerm(className, term),
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
  }, { logoUrl: logoDataUri, sealUrl: sealDataUri });

  const file = `demo_${d.className.replace(/\s+/g, '_')}.html`;
  writeFileSync(resolve(OUT, file), html, 'utf8');
  const nCrit = subjectsForClass(d.className).reduce((a, s) => a + loadCriteria(s.criteria_path).length, 0);
  index.push({ file, ...d, subjects: subjectsForClass(d.className).length, criteria: nCrit });
  console.log(`✓ ${d.className.padEnd(9)} → ${file}  (${index.at(-1).subjects} subjects, ${nCrit} criteria rows)`);
}

console.log(`\nOutput folder: ${OUT}`);
