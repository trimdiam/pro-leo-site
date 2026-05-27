# Assessment App — Feature Summary
*Last updated: 2026-05-27*

---

## Overview
The assessment app (`assessment-app/`) is a separate mini-app used by teachers to enter marks and by admins to analyse results. It lives at `/assessment-app/index.html` and is accessible from both the teacher and admin sidebars in the main portal.

---

## Role Responsibilities

| Role | Job |
|------|-----|
| **Teacher** | Enter marks per student per criterion — assessment entry only |
| **Admin** | Monitor analytics, review sessions, manage report cards |
| **Student** | View their own personal progress in the student portal |

---

## Subjects & Classes

### LKG & SKG — 4 subjects (flat criteria, no categories)
| Subject | ID | Criteria |
|---------|-----|---------|
| Literacy | LIT | 19 criteria |
| Numeracy | NUM | 20 criteria |
| Rhymes & Stories | RHST | 21 criteria |
| Arts/Colouring | ART | 14 criteria |

### Class I & Class II — 5 subjects (criteria grouped into categories)
| Subject | ID | Categories |
|---------|-----|-----------|
| English I | ENG1 | Work Habits · Writing Skills · Reading Skills · Speaking Skills |
| English II | ENG2 | Work Habits · Writing Skills · Reading Skills · Speaking Skills |
| Mathematics | MATH | Work Habits · Writing Skills · Solving Skills |
| Science | SCI | Work Habits · Writing Skills · Reading Skills · Social & Emotional / Subject Learning |
| Khasi | KHA | Work Habits · Writing Skills · Reading Skills · Speaking Skills |
| Hindi *(Class II only)* | HIN | Work Habits · Writing Skills · Reading Skills · Speaking Skills |

> All criteria use a **0–5 mark scale**.

---

## Data Flow

```
Teacher enters marks (assessment-app)
        ↓
Saved to localStorage (assessment_sessions)
        ↓
Synced to Firestore (assessment_sessions collection)
        ↓
Aggregated into monthly_analytics + student_profiles
        ↓
Admin analytics dashboard reads from localStorage/Firestore
Student portal reads from Firestore assessment_sessions
```

---

## Admin Analytics Dashboard

Located at: **Analytics tab → Subject tab** in the admin dashboard.

### 6 Tabs
| Tab | What it shows |
|-----|--------------|
| Overview | School health score, class averages, completion rate, top concerns |
| Trends | Class average line chart over months |
| Student | Individual student monthly performance + subject breakdown |
| Class | Full student roster ranked, subject trend lines |
| Subject | Per-subject averages + **drill-down on click** |
| Completion | Draft/submitted/reviewed/locked counts, teacher & subject completion % |

### Subject Drill-Down (click any subject row)
Expands inline below the subject showing:
- 💪 Strongest / ⚠️ Weakest category callouts
- 📉 Decline alerts (category dropped 10%+ month-over-month)
- 📈 Improvement alerts
- 🔴 Skill gap warnings (>50% of students weak in a category)
- 🎯 Quick win tip (category closest to next performance band)
- **Category progress bars** — click any bar → individual criteria expand
- **Heat grid** — students × categories, colour-coded red→green
- **Student rankings** — all students ranked with mini category pills

### Performance Bands
| Band | Range | Colour |
|------|-------|--------|
| Strong | 80–100% | Green |
| Good | 60–79% | Teal |
| Average | 40–59% | Amber |
| Weak | 20–39% | Red |
| Critical | 0–19% | Dark red |

---

## Student Portal — My Progress Tab

Located at: **📊 My Progress** in the student sidebar.

Reads directly from Firestore `assessment_sessions` — full criteria-level detail per student.

### What students see
- Subjects sorted **weakest first** (needs most attention at top)
- Tap any subject → expands showing:
  - 💪 Strongest / ⚠️ Needs Practice category callouts
  - 📉/📈 Personal decline & improvement alerts since last month
  - Category progress bars with band labels
  - **▸ See individual criteria** toggle → every criterion scored
  - 🎯 Focus tip — single weakest criterion by name
  - Months of data tracked

### Class name mapping
`app-logic.js` stores class as raw value (`"1"`, `"2"`, `"LKG"`, `"SKG"`).
`student-progress-init.js` maps these to full names (`"Class I"`, `"Class II"`, etc.) before passing to the engine.

---

## Demo Data

Accessible from: **Admin Dashboard → 🧪 Demo Data tab** (when logged in as admin).
Also available on the login page before logging in.

| Demo | What it loads |
|------|--------------|
| General Demo | 3 months Maths data, Class I & II |
| Weekly Maths Demo | 4-week Maths sessions, Class I — locked/overdue/draft states |
| **Class I Drill Demo** | April & May 2026, all 5 subjects, 59 real students — designed to exercise the drill-down panel |

### Class I Drill Demo patterns (built-in)
| Category | Pattern |
|----------|---------|
| Work Habits | Consistently strong (~83%) |
| Writing Skills | Average (~62%) |
| Reading Skills | Skill gap — majority below 60% |
| Speaking Skills | **Declining** April→May (triggers alert) |
| Solving Skills (Math) | **Rising** April→May (triggers improvement alert) |

---

## Key Source Files

| File | Purpose |
|------|---------|
| `assessment-app/data/subjects.json` | Subject registry — IDs, names, class mappings, criteria paths |
| `assessment-app/data/criteria/*.json` | Criteria definitions per subject |
| `assessment-app/services/criteria-loader.js` | Loads & validates criteria JSON |
| `assessment-app/services/subject-loader.js` | Loads & filters subjects by class |
| `assessment-app/services/session-storage.js` | localStorage read/write for sessions |
| `assessment-app/services/firestore-service.js` | Firestore sync (collection: `assessment_sessions`) |
| `assessment-app/services/analytics-engine.js` | Class/student/subject analytics computations |
| `assessment-app/services/subject-drill-down-engine.js` | Per-subject category/criteria drill-down analytics |
| `assessment-app/services/demo-data-generator.js` | All demo data generators |
| `assessment-app/components/analytics-dashboard.js` | Admin analytics UI — all 6 tabs |
| `assessment-app/components/subject-drill-down-panel.js` | Subject drill-down UI panel |
| `assessment-app/main.js` | App entry point — routing, admin tabs, demo tab |
| `student-progress-engine.js` | Student personal analytics (reads Firestore) |
| `student-progress-view.js` | Student progress UI in portal |
| `student-progress-init.js` | Global shim for student portal button |
