# St. Francis De Sales School — App Progress Summary

## Session 1 (Previous)

### Push Notifications (FCM)
- Firebase Cloud Messaging integrated into the main app (`app-logic.js`)
- Service worker registered (`firebase-messaging-sw.js`) for background notifications
- FCM token saved to each user's Firestore doc on login
- Five Cloud Functions deployed (`asia-south1`):
  - `notifyAbsentStudents` — fires when attendance doc is created
  - `notifyAbsentStudentsUpdated` — fires when attendance doc is updated
  - `notifyNewNotice` — fires when a new notice is posted
  - `notifyStudentMessage` — fires when a message is sent to a student
  - `notifyLeaveDecision` — fires when admin approves/rejects a teacher leave

### Leave Application Fix
- Fixed day calculation bug (removed erroneous +1)

### Teacher Management
- Class Teacher Of column reads live from `classes` collection (dynamic)

### Fee Records
- Deleted all test/demo fee transaction records from Firestore

### Mark Entry → Report Card Pipeline
- Copied entire `Sfs-report-card` folder into the hosted Firebase app
- Fixed routing, login bypass, added Back to Portal button
- Added View Report Card button (appears only after record is locked)
- Built Firestore → sessionStorage bridge (`openReportCard()`)
- Created `seed-demo.html` for seeding test mark data

---

## Session 2 (Today — 17 May 2026)

### Report Card Pipeline — Tasks 3, 4, 5 Completed

#### Task 3 — Admin Report Card Control Panel
- New **Report Cards** section in Admin sidebar
- Class selector dropdown (populated from `classes` collection, deduplicated, no section suffix)
- Table shows all locked students: HY total, FT total, auto Pass/Fail
- Admin decision dropdown for failed students: **Promoted with Grace** / **Detained**
- Per-student **Release** button and class-wide **Release All** button
- **View** button opens full report card from admin panel
- `adminDecision` field overrides auto PASS/FAIL result in `render.js`

#### Task 4 — Student Report Card Release
- Student dashboard silently checks `releasedToStudent` + `feeBalance <= 0`
- Blue "Your Report Card is Ready!" banner appears only when both conditions met
- `studentViewReportCard()` reads Firestore → opens `reportcard.html`
- Firestore rules updated: students can only read their own marks doc after release

#### Task 5 — A3 Class Marksheet from Live Firestore
- **Generate A3 Class Marksheet** button appears in CT Dashboard when FT is locked
- Fetches all locked students' HY + FT marks in one batch read
- Assembles `sfds_classList` array, saves to sessionStorage, opens `marksheet.html`
- Sorted by roll number; admin decision respected in result field

### Admin Dashboard Improvements
- **Boys / Girls** stat cards added to admin home dashboard
- **Class-wise Enrollment** table now reads class teacher from `classes` collection
  (`classTeacherName` field set by Teacher Assignments panel only)

### Admin Inbox Improvements
- All inbox items now clickable and navigate to their respective sections
- **Contact messages** panel: delete button added per message (with confirmation)
- Fee approvals → Fees section; Contact messages → Contacts section

### Holiday Banner Fix
- Banner moved from full-width (behind sidebar) to dynamically injected after `dash-header`
- Applies to both teacher and student portals
- No longer overlaps the sidebar on any screen size

### Today's Schedule UI Upgrade (All Portals)
- Dashboard mini-widget AND full My Routine / My Schedule pages upgraded
- Each period rendered as a **soft rounded card** with hover lift + shadow
- Subject emojis: 📘 English, 📗 Hindi, 📐 Maths, 🔬 Science, 💻 Computer, ☕ Free, etc.
- **Time** bold, **Subject** medium weight, **Class/Teacher** muted gray
- Free periods styled italic + muted
- Active period: green tint + **NOW** pill badge
- Day label as pill badge on dashboard widget
- Period number pill (P1–P6) on full schedule pages
- **Full →** button slides right on hover
- Mobile responsive

---

## What's Left

### Mark Entry Pipeline
- [ ] End-to-end test with real teacher accounts (seed → CT views → report card renders)
- [ ] Verify auto-generated remarks, rank, co-scholastic display correctly on report card
- [ ] Test print/PDF from `reportcard.html`

### Admin Report Card Controls
- [ ] Test promotion decision → verify result shows correctly in report card
- [ ] Test student release → verify banner appears in student portal

### Teacher Management
- [ ] Update subjects for teachers showing `—` (edit via admin portal)

### FCM — Native Android Push
- [ ] Wire FCM into Capacitor APK (`@capacitor-firebase/messaging` + `google-services.json`)
- [ ] Rebuild APK with native FCM support

### Office Portal
- [ ] Connect Firebase to office staff computer login
- [ ] Full audit of office portal sections for bugs and missing features
- [ ] Review fee management, student records access, admission forwarding

### General
- [ ] Delete `seed-demo.html` after pipeline testing confirmed working
- [ ] Run full regression: admin, teacher, office staff, student — all sections
- [ ] Commit and push after each session
