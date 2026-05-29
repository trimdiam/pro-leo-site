# Year-End Rollover — 27-28 Academics

Tool for safely advancing the school from one academic session to the next
(e.g. **2026-27 → 2027-28**) at the end of an academic year.

- **UI:** [`year-end-rollover.html`](../year-end-rollover.html) — admin login + 5-step panel + live log
- **Engine:** [`year-end-rollover.js`](../year-end-rollover.js) — all read/archive/promote/clear/session logic

Built as a standalone feature (not added to `app-logic.js`).

---

## Why this exists

Firestore data is **not partitioned by session**. Collections like
`marks/{class}_{term}/students`, `attendance_monthly`, and `report_cards` are
keyed by **class**, not year. So if a new year's marks are entered without
archiving first, **last year's data is silently overwritten**. There is no
recycle bin in Firestore.

This tool makes the year-end reset safe: a full backup **and** an in-app archive
are created and verified *before* anything is deleted.

---

## The 5 steps (each unlocks only after the previous verifies)

| # | Step | What it does |
|---|------|--------------|
| 0 | **Dry-Run Preview** | Counts everything each step would touch. Writes nothing. |
| 1 | **Backup** | Manual `gcloud firestore export`; admin ticks a confirmation box. |
| 2 | **Archive** | Copies academic collections → `archive_<year>_*`, then re-counts to verify. |
| 3 | **Promote** | Advances each student's class; detained stay; Class 10 → `alumni`; stamps `academicYear`. |
| 4 | **Clear** | Re-verifies the archive, then deletes live academic data + resets `admin_notifications`. Type-to-confirm `DELETE`. |
| 5 | **New session** | Creates the active `academicSessions` doc for the new year; deactivates the old one. |

### Safety chain

```
Backup confirmed → Archive copied → Archive verified → Promotion verified
→ Archive RE-verified at delete time → type DELETE → deleted → Clear verified
→ New session verified
```

No academic data can be deleted unless a provably-matching archive copy exists at
the moment of deletion. All steps are idempotent (safe to re-run).

---

## Data model reference

### Class-value scheme (`students.class`, written by the `#sf-class` dropdown)

- **Pre-primary:** `PLG` (Play Group), `LKG`, `SKG`
- **Class I–X:** Arabic `"1"` … `"10"`
- **Not** "Nursery", **not** roman numerals (roman `I`–`X` appears only in
  report-card display and teacher-assignment UI).
- **Progression:** `PLG → LKG → SKG → 1 → … → 10 → alumni`

### Collections handled

**Archived then cleared** (`archive_<year>_*`):
`marks/*` (flattened to `archive_<year>_marks`, ids like `III_HY__<sid>`),
`report_cards`, `attendance_daily`, `attendance_monthly`, `assessment_sessions`,
`monthly_analytics`, `weak_students`, `student_profiles`, `homework`,
`leave_applications`.

**Reset only** (transient, not archived): `admin_notifications`.

**Never touched:** `teachers`, `subjects`, `classes`, `settings`,
`fee_structure`, `fee_transactions`, `fees`, `users`, and content collections.

**Created:** `alumni` (graduated Class 10 students, with `graduatedFrom` /
`graduatedClass`), and the new `academicSessions` doc.

Each archived doc carries an `_archive` field (`sourceCollection`, `sourcePath`,
`sourceId`, timestamp) for unambiguous restore/audit.

---

## Operational notes

- **Roll numbers are NOT auto-reassigned.** After promotion a class mixes
  promoted-in and detained pupils, so renumbering is a manual office decision.
- **Run the Preview first** every time. Confirm `unknown = 0` (any unknowns are
  usually mislabeled admission conversions — fix those records before promoting).
- The tool is behind Firebase admin auth against live Firestore; it cannot be
  exercised by a local preview server. The Preview step is zero-risk to run.

---

## Where old data lives afterward

- **In-app, browsable:** `archive_<year>_*` collections.
- **Disaster recovery:** the Cloud Storage export from Step 1.
- **Graduates:** the `alumni` collection.
