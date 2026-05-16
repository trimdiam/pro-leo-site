# St. Francis De Sales School — App Progress Summary

## Accomplished

### Push Notifications (FCM)
- Firebase Cloud Messaging integrated into the main app (`app-logic.js`)
- Service worker registered (`firebase-messaging-sw.js`) for background notifications
- FCM token saved to each user's Firestore doc on login
- Three Cloud Functions deployed (`asia-south1`):
  - `notifyAbsentStudents` — fires when attendance doc is created; notifies absent students
  - `notifyAbsentStudentsUpdated` — fires when attendance doc is updated; notifies absent students
  - `notifyNewNotice` — fires when a new notice is posted; notifies all students
  - `notifyStudentMessage` — fires when a message is sent to a student
  - `notifyLeaveDecision` — fires when admin approves/rejects a teacher leave application

### Leave Application Fix
- Fixed day calculation bug: 16 May → 17 May now correctly counts as 1 day (removed erroneous +1)

### Teacher Management
- Class Teacher Of column now reads live from the `classes` collection (dynamic, not stale seed data)

### Fee Records
- Deleted all test/demo fee transaction records from Firestore

### Mark Entry → Report Card Pipeline
- Copied entire `Sfs-report-card` folder into the hosted Firebase app
- Fixed routing: `markentry.html` now opens correctly without being intercepted by the SPA rewrite
- Fixed login bypass: teachers navigating from the portal are auto-authenticated (no re-login)
- Added **← Back to Portal** button in the mark entry header
- Added **View Report Card** button — appears only after a student record is locked
- Built the Firestore → sessionStorage bridge (`openReportCard()` in `markentry.js`):
  - Reads HY and FT marks from Firestore
  - Assembles complete `sfds_studentData` object (subjects, co-scholastic, attendance, rank, remarks)
  - Opens `reportcard.html` directly — no manual form entry needed
- Created `seed-demo.html` for seeding test mark data into Firestore

### Firebase Hosting
- Deployed to `https://st-francis-school-a3e7e.web.app`
- Capacitor APK configured to load from hosted URL (`capacitor.config.json`)
- Correct ignore rules in `firebase.json` (excludes `functions/`, `node_modules/`)

### Holiday Notifications
- Holiday banner added to student and teacher portals
- Upcoming Holidays card added to teacher dashboard
- Holidays injected into student notices feed

### Attendance Fixes
- Fixed student attendance query (was querying non-existent `attendance` collection)
- Added Roman/Arabic/number class variant matching (`_classVariants()`)
- Fixed case-insensitive student ID comparison

### Firestore Rules
- `attendance_daily`: allow read for all authenticated users
- `student_messages`: allow create for all authenticated users
- `isDailyWriteAllowed`: fixed to use `exists()` and `.data.get()` safely

---

## What's Left

### Report Card Pipeline (Top Priority)
- [ ] Test full end-to-end: seed demo → class teacher views → report card renders correctly
- [ ] Verify auto-generated remarks appear on the report card
- [ ] Verify rank, attendance, co-scholastic grades display correctly
- [ ] Test print/PDF export from `reportcard.html`
- [ ] A3 class marksheet (`marksheet.html`) — connect to Firestore data (currently needs sessionStorage `sfds_classList`)

### Admin Report Card Controls
- [ ] Admin panel to view all locked report cards per class
- [ ] Admin sets final promotion decision for failed students (Promoted / Detained / Promoted with Grace)
- [ ] `finalStatus` and `promotedToClass` fields written to Firestore per student
- [ ] `render.js` reads `finalStatus` from Firestore and overrides the RESULT field
- [ ] Fee gate: block report card view if student has outstanding dues
- [ ] Class-wide release button: admin releases report cards for an entire class at once
- [ ] Student portal: show report card link only after admin has released it

### Teacher Management
- [ ] Subjects column still relies on `teachers` doc field — needs manual update via Edit form for teachers with blank subjects

### FCM — Native Android Push
- [ ] Wire FCM into the Capacitor APK (requires `@capacitor-firebase/messaging` plugin + `google-services.json`)
- [ ] Rebuild APK with native FCM support for push notifications in the installed app

### Mark Entry System
- [ ] Verify `seed-demo.html` works end-to-end for Class IX-A / SFS260101
- [ ] Test subject teacher mark entry → submission → class teacher locking flow with real teachers
- [ ] Connect A3 class marksheet to live Firestore data

### General
- [ ] Commit and push all future changes to GitHub after each session
