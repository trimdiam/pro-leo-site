// scripts/seed-staff-attendance-config.js
// One-time seed of the staff-attendance config doc.
// Run: node scripts/seed-staff-attendance-config.js
// Safe to re-run — uses { merge: true } so it won't clobber later admin edits
// to fields you didn't change here.

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

const CONFIG = {
  // School location (St. Francis De Sales) — used for the geofence check.
  schoolLat: 25.53898298536331,
  schoolLng: 91.8936348432684,
  radiusMeters: 100,            // record + flag beyond this; never hard-blocks

  // Punctuality thresholds (local time, 24h "HH:MM").
  morningExpected: '08:00',     // checked in after this (+ grace) => late
  minDeparture:    '14:30',     // checked out before this => early departure
  graceMinutes:    10,          // slack before "late" is flagged

  // Evening reminder for teachers who checked in but never checked out.
  checkoutReminderTime: '17:30',

  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

db.collection('settings').doc('staff_attendance_config')
  .set(CONFIG, { merge: true })
  .then(() => { console.log('✓ Seeded settings/staff_attendance_config'); process.exit(0); })
  .catch((e) => { console.error('✗ Seed failed:', e); process.exit(1); });
