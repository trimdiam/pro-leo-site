# ⏳ REMINDER — Staff Attendance: APK geolocation work (pending)

**Status:** Web (browser) works now. **APK does NOT capture GPS yet.**
**Created:** 2026-06-02 · **Do this when:** user is home and ready to rebuild the APK.

---

## Why this file exists
The teacher geo check-in/out engine (`staff-attendance.js` + `recordStaffAttendance`
Cloud Function) is deployed and works in a **browser** (HTTPS → `navigator.geolocation`
prompts fine). But inside the **Capacitor Android APK**, the WebView blocks
`navigator.geolocation`, so the "Check In" button can't get a location until the
app is rebuilt with the native Geolocation plugin.

`staff-attendance.js` **already prefers** `window.Capacitor.Plugins.Geolocation`
when present, so NO JS change is needed — only the native build below.

## The one-time native steps (then rebuild APK)
In the Capacitor project (the Android wrapper, not this web repo):

1. Install the plugin:
   ```
   npm install @capacitor/geolocation
   npx cap sync
   ```
2. Add to `android/app/src/main/AndroidManifest.xml` (inside `<manifest>`):
   ```xml
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
   ```
3. Rebuild + reinstall the APK on a test phone.

## How to verify after the rebuild
- Log in as a **teacher** on the APK → teacher dashboard → "My Attendance" card.
- Tap **Check In** → Android should prompt for location → card flips to
  "Checked in at HH:MM" with on-time/late + off-site chips.
- Confirm in Firestore: `staff_attendance/{uid}_{YYYY-MM-DD}` has a `morningIn`
  block with `lat`/`lng`/`withinGeofence`.
- Tap **Check Out** later → `eveningOut` + `workedMinutes` written.

## Quick test in a browser RIGHT NOW (no APK needed)
- Open the hosting URL, log in as a teacher, allow location → same flow.
- School geofence: lat `25.53898298536331`, lng `91.8936348432684`, radius **100m**.
  (Off-site is recorded + flagged, never blocked.)

## Project context
- Plan tracked in memory: `project_staff_attendance.md`.
- ALL 6 steps done + deployed (web): 1 rules+config, 2 Cloud Function,
  3 teacher UI, 4 missed-checkout reminder, 5 admin board+analytics,
  6 monthly PDF (per-teacher + whole-staff roster).
- The ONLY remaining work is the APK native-geolocation rebuild above.
- Admin view: Admin portal → sidebar → "Staff Attendance".
