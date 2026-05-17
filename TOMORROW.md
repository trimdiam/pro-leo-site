# Tomorrow's Work Plan — St. Francis School App
**Date:** 2026-05-18
**Priority Order:** Office Computer Firebase Setup → Office Portal Audit → Mark Entry Pipeline Test

---

## TASK 1 — Connect Firebase to Office Computer

**Goal:** The office staff account should be able to log into the app on the office desktop computer and access the Office Portal fully.

### Steps:
1. Open `https://st-francis-school-a3e7e.web.app` on the office computer browser
2. Log in with the office staff credentials (check Firestore → `users` collection for a doc with `role: "office"` or `role: "office_staff"`)
3. If no office account exists yet:
   - Go to Admin → Office Staff section
   - Create a new office staff account with email + password
   - Ensure `role` field is set to `"office"` or `"office_staff"` in the `users` doc
4. Verify the office portal loads correctly — should show the Office Staff dashboard
5. Check that Firestore rules allow office staff to read/write required collections:
   - `fee_transactions` — must be readable and writable
   - `students` — must be readable
   - `admissions` — must be readable and updatable
   - `leave_applications` — readable
6. If login works but portal shows errors, open browser DevTools (F12) → Console → copy red errors

### Key Files:
- `firestore.rules` — `isOffice()` helper covers `office` and `office_staff` roles
- `app-logic.js` — office portal logic starts around the `page-office-dash` section

---

## TASK 2 — Audit the Office Portal (Bug Check + Improvements)

**Goal:** Walk through every section of the office portal and note what works, what's broken, and what's missing.

### Sections to check:

#### 2a. Dashboard
- [ ] Stat cards load correctly (Today's entries, ₹ collected, approved today)
- [ ] No spinner stuck loading

#### 2b. Fee Management
- [ ] Can search for a student by name or ID
- [ ] Fee payment entry form works (amount, date, method)
- [ ] After submitting, record appears in `fee_transactions` Firestore collection
- [ ] Student's `feeBalance` field updates correctly after payment
- [ ] Receipt or confirmation shown after payment

#### 2c. Student Records (Read Access)
- [ ] Office staff can view student list
- [ ] Can filter by class
- [ ] Can view individual student details (name, class, roll, contact)
- [ ] Cannot edit student records (write should be blocked for non-admin)

#### 2d. Admissions (Forwarding)
- [ ] Office staff can see new admission enquiries
- [ ] Can forward to admin (sets status to "Forwarded")
- [ ] Admin inbox shows the forwarded count

#### 2e. Fee Due Report
- [ ] Class-wise due report loads correctly
- [ ] Shows outstanding balances per student

### For each broken section — note:
- What the section is supposed to do
- What error appears (DevTools Console message)
- Screenshot if possible

---

## TASK 3 — Office Portal Improvements (After Audit)

Based on findings from Task 2, implement fixes. Common issues to expect:

1. **Fee balance not updating** — check if `students/{studentId}.feeBalance` is being updated after `fee_transactions` write
2. **Student search not working** — may need index in Firestore for name/class queries
3. **Missing confirmation UI** — add toast/success message after fee entry
4. **Admission forwarding not reflected in admin inbox** — check `admin_notifications` write logic

---

## TASK 4 — Mark Entry Pipeline End-to-End Test

**Goal:** Confirm the full report card pipeline works before anything is built on top of it.

### Steps:
1. Log in as **Queency Mary Mawrie** (Class IX teacher) at `markentry.html`
2. In the same browser, open `seed-demo.html`
   - Class ID: `IX`, Student ID: `SFS260101`, Name: `Alvinson Mawrie`, Roll: `1`
   - Click **Seed Demo Marks** → wait for ✅ success
3. Go to CT Dashboard → verify all 12 subjects show **Locked**
4. Click on Alvinson Mawrie → click **View Report Card**
5. Verify report card shows:
   - Correct HY and FT marks per subject
   - Attendance (HY: 82/95, FT: 88/100)
   - Rank (HY: 3, FT: 2 of 28)
   - Co-scholastic grades
   - Auto-generated remarks
   - PASS result in Final Summary
6. Test **Print** from the report card page
7. Go to Admin → Report Cards → select Class IX → verify Alvinson appears
8. Click **View** from admin panel → report card should open
9. Log in as a student with fee balance = 0 → check if report card banner appears after admin releases

### If report card is blank or missing subjects:
- Open browser DevTools → Console → look for errors about `CONFIG[9]`
- Open `Sfs-report-card/config.js` and verify Class 9 subject keys match seed data keys

---

## Quick Reference

| URL | Purpose |
|-----|---------|
| `https://st-francis-school-a3e7e.web.app` | Main app |
| `https://st-francis-school-a3e7e.web.app/Sfs-report-card/markentry.html` | Mark entry |
| `https://st-francis-school-a3e7e.web.app/Sfs-report-card/seed-demo.html` | Demo seeder |
| `https://st-francis-school-a3e7e.web.app/Sfs-report-card/reportcard.html` | Report card viewer |
| Firebase Console | `https://console.firebase.google.com/project/st-francis-school-a3e7e` |
| GitHub Repo | `https://github.com/trimdiam/pro-leo-site` |

## Key Files
| File | Purpose |
|------|---------|
| `app-logic.js` | All portal logic |
| `firestore.rules` | Security rules |
| `Sfs-report-card/markentry.js` | Mark entry + report card bridge |
| `Sfs-report-card/render.js` | Report card renderer |
| `Sfs-report-card/config.js` | Class configs (subjects, mark schemes) |

---

**Start with Task 1 (office computer login). If it works cleanly, move to Task 2 audit. Task 4 can run in parallel on a separate browser.**
