# Tomorrow's Work Plan — St. Francis School App
**Date:** 2026-05-18  
**Priority Order:** Report Card Pipeline → Admin Controls → Marksheet → FCM APK

---

## TASK 1 — Test the Mark Entry → Report Card Pipeline (End-to-End)
**Goal:** Confirm the full flow works before building anything else on top of it.

### Steps:
1. Open `https://st-francis-school-a3e7e.web.app/Sfs-report-card/markentry.html`
2. Log in as a teacher (any teacher account)
3. In the **same browser tab**, open `https://st-francis-school-a3e7e.web.app/Sfs-report-card/seed-demo.html`
4. Enter:
   - Class ID: `IX-A`
   - Student ID: `SFS260101`
   - Student Name: `Alvinson Mawrie`
   - Roll No: `1`
5. Click **Seed Demo Marks** — wait for success message
6. Go back to `markentry.html`
7. Log in as the **class teacher of IX-A** (check which teacher has `classTeacherOf: "IX-A"` in Firestore)
8. Navigate to **CT Dashboard → Student List → Alvinson Mawrie**
9. Confirm the record shows as **Locked**
10. Click **View Report Card** button
11. Verify the report card renders with:
    - Correct marks per subject (HY and FT)
    - Attendance (HY: 82/95, FT: 88/100)
    - Rank (HY: 3, FT: 2 of 28)
    - Co-scholastic grades
    - Auto-generated remarks (should appear since remarks are pre-seeded)
    - PASS/FAIL result in Final Result Summary
12. Test **Print** from the report card page

### If anything breaks:
- Open browser DevTools (F12) → Console tab → copy any red errors and report them
- Check Firestore → `marks/IX-A_HY/students/SFS260101` exists and has data

---

## TASK 2 — Fix CONFIG Mismatch (If Task 1 Fails)
**Goal:** The `config.js` in `Sfs-report-card` defines subjects per class number. If Class IX uses subjects not in config, the report card will show blank rows.

### Steps:
1. Open `Sfs-report-card/config.js`
2. Find the `9:` block (Class IX configuration)
3. Verify these subject keys exist: `mathematics`, `science`, `social_studies`, `hindi`, `english_i`, `english_ii`, `khasi_alt_english`, `history`, `civics`
4. If any are missing, add them following the same pattern as existing entries
5. Redeploy: `firebase deploy --only hosting`

---

## TASK 3 — Admin Report Card Control Panel
**Goal:** Admin can see all locked report cards, set promotion decisions, and release them to students.

### Step 3a — Add Firestore fields for promotion & release
In `app-logic.js`, when admin sets promotion decision, write to:
```
marks/{classId}_FT/students/{studentId}
  adminDecision: "Promoted" | "Detained" | "Promoted with Grace"
  releasedToStudent: true | false
  releasedAt: timestamp
  releasedBy: uid
```

### Step 3b — Add Admin Report Card panel in `index.html`
Add a new section `a-reportcards` in the Admin sidebar with:
- Class selector dropdown
- Table: Student Name | Roll No | Result (auto) | Admin Decision | Fee Status | Released | Actions
- For each student with FAIL result: dropdown to set `adminDecision`
- **Release Class** button: sets `releasedToStudent: true` for all fee-cleared students
- **Release Individual** button per student

### Step 3c — Update `render.js` to read admin decision from Firestore
Currently `render.js` reads only from `sessionStorage`. Modify `openReportCard()` in `markentry.js` to:
1. After reading HY/FT marks, also read `adminDecision` from the FT doc
2. Set `data.finalStatus` if `adminDecision` is present
3. Set `data.promotedToClass` = next class number if Promoted

### Step 3d — Update `render.js` RESULT display
In `render.js` around line 241–268, the `finalStatus` field already controls the display:
- `PROMOTED` → shows "PROMOTED TO CLASS X"
- `DETAINED` → shows "DETAINED"
- Fallback → auto PASS/FAIL
This should work once `openReportCard()` populates it correctly.

---

## TASK 4 — Student Portal: Show Report Card Link
**Goal:** Students see their report card only after admin releases it AND fees are cleared.

### Steps:
1. In `app-logic.js`, find `loadStudentDashboard` or the student notification center
2. Add a check:
   ```js
   const ftDoc = await getDoc(doc(db, 'marks', `${classId}_FT`, 'students', studentId));
   const released = ftDoc.data()?.releasedToStudent === true;
   const feesCleared = /* check fee_transactions for outstanding balance */;
   ```
3. If both are true, show a **View My Report Card** button in the student portal
4. Button click: read marks from Firestore → assemble `sfds_studentData` → open `reportcard.html`
   - Same `openReportCard()` logic used in `markentry.js` but callable from student portal

### Firestore Rule to add:
```
match /marks/{termDoc}/students/{studentId} {
  allow read: if isAnyStaff() ||
    (request.auth != null &&
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.studentId == studentId &&
     resource.data.releasedToStudent == true);
}
```

---

## TASK 5 — A3 Class Marksheet (Connected to Firestore)
**Goal:** Class teacher or admin can generate a full class marksheet from live Firestore data.

### Steps:
1. In `markentry.js`, in the CT Dashboard, add a **Generate Class Marksheet** button
2. On click, fetch all students' FT marks from `marks/{classId}_FT/students`
3. For each student, build the same data structure as `sfds_studentData`
4. Build array and save to `sessionStorage` as `sfds_classList`
5. Open `marksheet.html` in a new tab — it reads `sfds_classList` and renders the A3 table
6. Redeploy hosting

---

## TASK 6 — FCM Native Android Push (APK)
**Goal:** The installed APK receives push notifications natively (not just browser).

### Steps:
1. In Android Studio, open the Capacitor project
2. Add the FCM plugin:
   ```
   npm install @capacitor-firebase/messaging
   npx cap sync android
   ```
3. Download `google-services.json` from Firebase Console → Project Settings → Android app
4. Place `google-services.json` in `android/app/`
5. In `android/app/build.gradle`, confirm `apply plugin: 'com.google.gms.google-services'`
6. In `app-logic.js`, detect if running in Capacitor:
   ```js
   if (window.Capacitor?.isNativePlatform()) {
     // use @capacitor-firebase/messaging instead of web FCM
   }
   ```
7. Build and install APK: test push notification end-to-end

---

## TASK 7 — General Cleanup & Testing
- [ ] Update subjects for teachers that show `—` in Teacher Management (edit each teacher via admin portal)
- [ ] Delete `seed-demo.html` from the hosted app after pipeline testing is confirmed working
- [ ] Test leave application notification on mobile browser
- [ ] Verify holiday banner shows correctly on both teacher and student portals
- [ ] Run a full regression: login as admin, teacher, office staff, student — check all sections load without errors

---

## Quick Reference

| URL | Purpose |
|-----|---------|
| `https://st-francis-school-a3e7e.web.app` | Main app |
| `https://st-francis-school-a3e7e.web.app/Sfs-report-card/markentry.html` | Mark entry system |
| `https://st-francis-school-a3e7e.web.app/Sfs-report-card/seed-demo.html` | Demo data seeder |
| `https://st-francis-school-a3e7e.web.app/Sfs-report-card/reportcard.html` | Report card viewer |
| Firebase Console | `https://console.firebase.google.com/project/st-francis-school-a3e7e` |
| GitHub Repo | `https://github.com/trimdiam/pro-leo-site` |

## Key Files
| File | Purpose |
|------|---------|
| `app-logic.js` | Main app logic (all portals) |
| `firestore.rules` | Firestore security rules |
| `functions/index.js` | Cloud Functions (FCM triggers) |
| `Sfs-report-card/markentry.js` | Mark entry + View Report Card bridge |
| `Sfs-report-card/render.js` | Report card renderer (reads sessionStorage) |
| `Sfs-report-card/config.js` | Class configs (subjects, mark schemes, passmarks) |

---

**Start with Task 1. If it passes cleanly, move to Task 3. Tasks 5, 6, 7 can be done in any order after 3 is complete.**
