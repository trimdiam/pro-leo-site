# ✅ DONE — Staff Attendance + APK v2.1 (shipped 2026-06-02)

Both native jobs and all enhancements below are **built, signed (v2.1), and deployed**.
Roll out the v2.1 APK to teachers; the matching web code is already live on hosting.

## Job 1 — Staff Attendance GPS ✅
- `@capacitor/geolocation` installed in the SFS-Care wrapper + `ACCESS_FINE/COARSE_LOCATION`
  in AndroidManifest. `staff-attendance.js` already prefers the native Geolocation plugin.
- Verified working (teacher Check In/Out → on-time/late + on-site/off-site chips).
- School geofence (Firestore `settings/staff_attendance_config`): lat `25.53898298536331`,
  lng `91.8936348432684`, radius **100m** (off-site is flagged, never blocked). Editable
  in Firebase Console or via `scripts/seed-staff-attendance-config.js`.

## Job 2 — In-app Google Sign-In ✅
- `@capacitor-firebase/authentication` installed, `rgcfaIncludeGoogle = true` in
  variables.gradle, `FirebaseAuthentication` provider config in capacitor.config.json.
- Debug + **release** SHA-1/SHA-256 registered in Firebase; `google-services.json` has both
  Android OAuth clients. Release cert SHA-1 `72:44:19:...` (keystore `SFS-Care/keystore/sfscare`, alias `sfs-care`).
- `app-logic.js doGoogleLogin()` branches: native → Capacitor plugin → `signInWithCredential`;
  browser keeps `signInWithPopup`. The Option-A hide-script was removed from index.html.

## Enhancement plugins (all wired in capacitor-native.js, native-guarded) ✅
StatusBar, SplashScreen, Keyboard, Crashlytics (error hooks + uid), Network (offline banner),
Device (native deviceId → single-session.js), Share (attendance PDFs → native share sheet).

## Other shipped 2026-06-02 ✅
- Teacher "My Attendance" card redesigned (gradient header, status orb, stat tiles).
- Admin "Delete day" button (Staff Attendance → Today) → `clearStaffAttendanceDay` Cloud Function (admin-only, audited).
- Admin "Download Logins" button (Teacher Management) → `teacher-export.js` CSV of Name + Login ID + admin-typed default password.

## Version
`SFS-Care/android/app/build.gradle`: versionCode **3** / versionName **"2.1"**.
