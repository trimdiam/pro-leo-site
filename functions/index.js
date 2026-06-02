const { setGlobalOptions } = require("firebase-functions");
const { onDocumentCreated, onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");

initializeApp();
setGlobalOptions({ maxInstances: 10, region: "asia-south1" });

const db  = getFirestore();
const fcm = getMessaging();

// ── Helper: is an FCM error a permanent "this token is dead" signal? ─────────
// These mean the token will NEVER work again (app uninstalled, token rotated).
// Transient errors (unavailable, internal, quota) are NOT included — we keep
// those tokens and let the next push retry.
function isDeadToken(code) {
  return code === "messaging/registration-token-not-registered" ||
         code === "messaging/invalid-registration-token" ||
         code === "messaging/invalid-argument";
}

// Remove a dead token from its users doc so the next app open re-registers a
// fresh one. Best-effort — never throws.
async function removeDeadToken(userRef) {
  if (!userRef) return;
  try {
    await userRef.update({ fcmToken: FieldValue.delete(), fcmTokenRemovedAt: new Date().toISOString() });
    console.log("Removed dead FCM token for", userRef.path);
  } catch (_) { /* ignore */ }
}

// ── Helper: send FCM to a single FCM token ─────────────────────────────────
// Pass userRef so a permanently-dead token can be cleaned up automatically.
async function sendPush(token, title, body, data = {}, userRef = null) {
  if (!token) { console.warn("sendPush: no token, skipping"); return; }
  try {
    const result = await fcm.send({ token, notification: { title, body }, data, android: { priority: "high", notification: { color: "#8b6f47" } } });
    console.log("FCM send success:", result);
  } catch (e) {
    console.error("FCM send failed:", e.code, e.message);
    if (isDeadToken(e.code)) await removeDeadToken(userRef);
  }
}

// Clean up dead tokens after a multicast sendEach. `refs[i]` is the users doc
// ref for `messages[i]`; on a permanent failure its token is removed.
async function cleanupAfterMulticast(result, refs) {
  if (!result || !result.responses) return;
  await Promise.all(result.responses.map(async (resp, i) => {
    if (!resp.success && resp.error && isDeadToken(resp.error.code)) {
      await removeDeadToken(refs[i]);
    }
  }));
}

// Collapse duplicate FCM tokens so one physical device never receives the same
// multicast twice. A device's token can sit on more than one users doc (e.g. an
// account switch that left a stale token behind). Keeps the FIRST occurrence of
// each token and its matching ref, so the parallel refs[] array stays aligned
// for cleanupAfterMulticast(). Drops empty/falsy tokens too.
function dedupeByToken(messages, refs) {
  const seen = new Set();
  const outMessages = [], outRefs = [];
  for (let i = 0; i < messages.length; i++) {
    const tok = messages[i] && messages[i].token;
    if (!tok || seen.has(tok)) continue;
    seen.add(tok);
    outMessages.push(messages[i]);
    outRefs.push(refs ? refs[i] : null);
  }
  return { messages: outMessages, refs: outRefs };
}

// ── Helper: get FCM token + name for a student by studentId ───────────────
async function getStudentInfo(studentId) {
  if (!studentId) return null;
  const snap = await db.collection("users")
    .where("studentId", "==", studentId)
    .limit(1)
    .get();
  if (snap.empty) { console.warn("getStudentInfo: no user for", studentId); return null; }
  const d = snap.docs[0].data();
  return {
    token: d.fcmToken || null,
    name:  (d.name || d.displayName || "").split(" ")[0] || "Student",
    ref:   snap.docs[0].ref,
  };
}

// ── Helper: rich attendance push ──────────────────────────────────────────
async function sendAttendancePush(token, firstName, status, fmt, cls, date, isReminder, userRef = null) {
  if (!token) return;
  const isAbsent = status === "absent";
  const emoji    = isAbsent ? "🔴" : "🟡";
  const label    = isAbsent ? "Absent" : "Late";
  const reminder = isReminder ? " (Reminder)" : "";
  const title    = `${emoji} Attendance Alert${reminder}`;
  const body     = isAbsent
    ? `Hi ${firstName}, you were marked Absent on ${fmt} (Class ${cls}). Contact the school if this is incorrect.`
    : `Hi ${firstName}, you arrived Late on ${fmt} (Class ${cls}). Please ensure punctuality.`;

  await sendPush(token, title, body, {
    type:    "attendance",
    status,
    date,
    class:   String(cls),
    screen:  "attendance",          // deep-link target
    click_action: "FLUTTER_NOTIFICATION_CLICK",
  }, userRef);
}

// ── Helper: notify absent OR late students ────────────────────────────────
async function notifyAttendance(data, docId, status, isReminder = false) {
  const students = data[status] || [];   // "absent" or "late" array
  const date     = data.date || (docId || "").split("_")[1] || "";
  const cls      = data.class || "";
  const fmt      = date
    ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
    : date;

  await Promise.all(students.map(async (sid) => {
    const info = await getStudentInfo(sid);
    if (!info || !info.token) return;
    await sendAttendancePush(info.token, info.name, status, fmt, cls, date, isReminder, info.ref);
  }));
}

// ── TRIGGER 1a: Attendance created → notify absent + late ─────────────────
exports.notifyAbsentStudents = onDocumentCreated(
  "attendance_daily/{docId}",
  async (event) => {
    const data = event.data.data();
    await notifyAttendance(data, event.params.docId, "absent");
    await notifyAttendance(data, event.params.docId, "late");
  }
);

// ── TRIGGER 1b: Attendance updated → notify newly absent/late students ────
exports.notifyAbsentStudentsUpdated = onDocumentUpdated(
  "attendance_daily/{docId}",
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only notify students who are NEW to absent/late (not previously there).
    // Set-based diff: O(n) and dedupes, so a student listed twice can't get two pushes.
    const beforeAbsent = new Set(before.absent || []);
    const beforeLate   = new Set(before.late   || []);
    const newAbsent = [...new Set(after.absent || [])].filter(s => !beforeAbsent.has(s));
    const newLate   = [...new Set(after.late   || [])].filter(s => !beforeLate.has(s));

    const docId = event.params.docId;
    const date  = after.date || (docId || "").split("_")[1] || "";
    const cls   = after.class || "";
    const fmt   = date
      ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
      : date;

    await Promise.all([
      ...newAbsent.map(async (sid) => {
        const info = await getStudentInfo(sid);
        if (info && info.token) await sendAttendancePush(info.token, info.name, "absent", fmt, cls, date, false, info.ref);
      }),
      ...newLate.map(async (sid) => {
        const info = await getStudentInfo(sid);
        if (info && info.token) await sendAttendancePush(info.token, info.name, "late", fmt, cls, date, false, info.ref);
      }),
    ]);
  }
);

// ── SCHEDULED: Absent reminder — fires at 10:30 AM IST ───────────────────
// Sends a second reminder push to all students absent TODAY.
exports.absentReminder = onSchedule(
  { schedule: "30 5 * * 1-6", timeZone: "Asia/Kolkata", region: "asia-south1" },
  // 10:30 IST = 05:00 UTC; Mon–Sat (days 1–6)
  async () => {
    const nowIST  = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const dateStr = nowIST.toISOString().split("T")[0]; // "YYYY-MM-DD"

    // Find all attendance docs for today
    const snap = await db.collection("attendance_daily")
      .where("date", "==", dateStr)
      .get();
    if (snap.empty) { console.log("absentReminder: no docs for", dateStr); return; }

    for (const doc of snap.docs) {
      await notifyAttendance(doc.data(), doc.id, "absent", true);
    }
    console.log("absentReminder: reminder sent for", dateStr);
  }
);

// ── TRIGGER 2: Notice posted → notify all students ────────────────────────
exports.notifyNewNotice = onDocumentCreated(
  "notices/{noticeId}",
  async (event) => {
    const notice   = event.data.data();
    const title    = notice.title || "New Notice";
    const body     = notice.body  || notice.message || "A new notice has been posted. Open the app to read it.";
    const audience = (notice.audience || "all").toLowerCase();

    // Only notify students-targeted or all notices
    if (!["all", "students", "both"].includes(audience)) return;

    // Get all student FCM tokens
    const usersSnap = await db.collection("users")
      .where("role", "==", "student")
      .get();

    await Promise.all(usersSnap.docs.map(async (doc) => {
      const token = doc.data().fcmToken;
      await sendPush(token, `📢 ${title}`, body, { type: "notice", noticeId: event.params.noticeId }, doc.ref);
    }));
  }
);

// ── TRIGGER 4: Leave application approved/rejected → notify teacher ───────
exports.notifyLeaveDecision = onDocumentUpdated(
  "leave_applications/{leaveId}",
  async (event) => {
    const before = event.data.before.data();
    const after  = event.data.after.data();

    // Only fire when status changes to Approved or Rejected
    if (before.status === after.status) return;
    const status = after.status;
    if (!["Approved", "Rejected"].includes(status)) return;

    const uid = after.uid;
    if (!uid) return;

    // Get FCM token from the teacher's users doc (keyed by Firebase Auth UID)
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) { console.warn("notifyLeaveDecision: no user doc for", uid); return; }
    const token = userDoc.data().fcmToken;
    const userRef = userDoc.ref;

    const from = after.from || "";
    const to   = after.to   || "";
    const name = after.teacherName || "Teacher";
    const icon = status === "Approved" ? "✅" : "❌";
    const title = `${icon} Leave ${status}`;
    const body  = status === "Approved"
      ? `Your leave from ${from} to ${to} has been approved.`
      : `Your leave from ${from} to ${to} has been rejected. Please contact the admin.`;

    await sendPush(token, title, body, { type: "leave", status, leaveId: event.params.leaveId }, userRef);
  }
);

// ── TRIGGER 3: Student message sent → notify the student ─────────────────
exports.notifyStudentMessage = onDocumentCreated(
  "student_messages/{msgId}",
  async (event) => {
    const msg       = event.data.data();
    const studentId = msg.studentId || msg.to || "";
    const subject   = msg.subject   || "New Message";
    const preview   = (msg.message  || "").substring(0, 80);

    const info = await getStudentInfo(studentId);
    await sendPush(
      info ? info.token : null,
      `✉️ ${subject}`,
      preview || "You have a new message from the administration.",
      { type: "message", msgId: event.params.msgId },
      info ? info.ref : null
    );
  }
);

// ── Helper: build initials→{subject,className} map from one period's slots ──
function buildTeacherSlotMap(slotsSnap, subjects) {
  // teacherMap[INITIALS] = { subject, className }
  // One teacher can only be in one slot per period, so last write wins (fine).
  const teacherMap = {};

  slotsSnap.docs.forEach(doc => {
    const s = doc.data();

    if (s.slotType === "value-cate-split") {
      // Two separate teachers share the period across all involved classes
      const classes = (s.involvedClasses || []).join(" & ");
      if (s.valueTeacher) {
        teacherMap[s.valueTeacher.toUpperCase()] = {
          subject: "Value Education", className: classes
        };
      }
      if (s.cateTeacher) {
        teacherMap[s.cateTeacher.toUpperCase()] = {
          subject: "Catechism", className: classes
        };
      }
    } else {
      // Normal slot — single teacher
      const ini = (s.teacherInitials || "").toUpperCase().trim();
      if (!ini) return;

      // subjectCode can be a string or an array
      let subjectName;
      if (Array.isArray(s.subjectCode)) {
        subjectName = s.subjectCode.map(c => subjects[c] || c).join(" / ");
      } else if (s.subjectCode) {
        subjectName = subjects[s.subjectCode] || s.subjectCode;
      } else {
        subjectName = "Class";
      }

      teacherMap[ini] = { subject: subjectName, className: s.className || "" };
    }
  });

  return teacherMap;
}

// ── Helper: resolve initials → fcmToken + name via teachers → users chain ───
// teachers collection: doc fields include initials/routineInitials + teacherId
// users collection:    doc fields include teacherId + fcmToken + name
async function resolveTeacherMessages(teacherMap, endedPeriod, nextPeriod, nextStartTime) {
  if (Object.keys(teacherMap).length === 0) return { messages: [], refs: [] };

  // Step 1: load ALL teacher docs
  // Build two maps:
  //   initialsToTeacherId : "SR"      → "SFST016"
  //   initialsToName      : "SR"      → "Sister Rita"   (first name used in push)
  const teachersSnap = await db.collection("teachers").get();
  const initialsToTeacherId = {};
  const initialsToName      = {};

  teachersSnap.docs.forEach(doc => {
    const t   = doc.data();
    const ini = (t.initials || t.routineInitials || "").toUpperCase().trim();
    const tid = (t.teacherId || t.loginId || doc.id || "").trim();
    const fullName = (t.name || t.fullName || "").trim();
    if (ini && tid) {
      initialsToTeacherId[ini] = tid;
      // Store first name for the personal notification body
      initialsToName[ini] = fullName.split(" ")[0] || fullName || "Teacher";
    }
  });

  // Step 2: collect only the teacherIds that appear in this period's slots
  const teacherIds = [];
  for (const ini of Object.keys(teacherMap)) {
    const tid = initialsToTeacherId[ini];
    if (tid) teacherIds.push(tid);
  }
  if (teacherIds.length === 0) {
    console.warn("periodReminder: no teacherIds resolved. Initials in slot:", Object.keys(teacherMap));
    console.warn("periodReminder: initials in teachers collection:", Object.keys(initialsToTeacherId));
    return [];
  }

  // Step 3: look up FCM tokens from users collection (chunk ≤30)
  const messages = [];
  const refs = [];   // refs[i] is the users doc for messages[i] — for dead-token cleanup
  for (let i = 0; i < teacherIds.length; i += 30) {
    const chunk = teacherIds.slice(i, i + 30);
    const usersSnap = await db.collection("users")
      .where("teacherId", "in", chunk)
      .get();

    usersSnap.docs.forEach(uDoc => {
      const u = uDoc.data();
      if (!u.fcmToken) return;

      const tid = (u.teacherId || "").trim();

      // Reverse-look up: which initials → this teacherId
      const ini = Object.keys(initialsToTeacherId)
        .find(k => initialsToTeacherId[k] === tid);
      const info = ini ? teacherMap[ini] : null;
      if (!info) return; // teacher not in this period's slots — skip

      // Name from teachers collection (accurate) with users.name as fallback
      const firstName  = initialsToName[ini]
        || (u.name || "").split(" ")[0]
        || "Teacher";
      const classLabel = info.className ? `Class ${info.className}` : "";
      const timeLabel  = nextStartTime  ? ` · Starts ${nextStartTime}` : "";

      messages.push({
        token: u.fcmToken,
        notification: {
          title: `⏰ Period ${endedPeriod} over`,
          body:  `${firstName}, next: ${info.subject}${classLabel ? " — " + classLabel : ""}${timeLabel}`,
        },
        android: {
          priority: "high",
          notification: {
            channelId: "period_reminders",
            sound: "default",
            color: "#8b6f47",
          }
        },
        data: {
          type:       "period_reminder",
          nextPeriod: String(nextPeriod),
          subject:    info.subject,
          className:  info.className,
        },
      });
      refs.push(uDoc.ref);
    });
  }

  return { messages, refs };
}

// ── SCHEDULED: Period-end reminder — runs every minute (IST) ─────────────
exports.periodEndReminder = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Asia/Kolkata", region: "asia-south1" },
  async () => {
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();

    // 1. Load period timings
    const timingsSnap = await db.collection("settings").doc("periodTimings").get();
    if (!timingsSnap.exists) return;
    const timings = timingsSnap.data();

    // 2. Find which period just ended at this exact minute
    let endedPeriod = null;
    for (let p = 1; p <= 6; p++) {
      const t = timings[`period${p}`];
      if (!t || !t.end) continue;
      const [eh, em] = t.end.split(":").map(Number);
      if (currentMinutes === eh * 60 + em) { endedPeriod = p; break; }
    }
    if (endedPeriod === null) return;

    const nextPeriod = endedPeriod + 1;
    if (nextPeriod > 6) return; // school day over

    // Next period start time for the notification body
    const nextT = timings[`period${nextPeriod}`];
    const nextStartTime = nextT && nextT.start ? nextT.start : null;

    // 3. Current school day
    const daySnap = await db.collection("settings").doc("schoolDay").get();
    if (!daySnap.exists) return;
    const currentDay = daySnap.data().currentDay;

    // 4. Slots for next period
    const slotsSnap = await db
      .collection("routine").doc(String(currentDay))
      .collection("periods").doc(String(nextPeriod))
      .collection("slots").get();
    if (slotsSnap.empty) return;

    // 5. Subjects map
    const subjectsSnap = await db.collection("subjects").get();
    const subjects = {};
    subjectsSnap.docs.forEach(d => {
      const sd = d.data();
      subjects[sd.code || d.id] = sd.name || sd.code || d.id;
    });

    // 6. Build slot map and resolve to FCM messages
    const teacherMap = buildTeacherSlotMap(slotsSnap, subjects);
    const { messages, refs } = await resolveTeacherMessages(teacherMap, endedPeriod, nextPeriod, nextStartTime);

    if (messages.length === 0) {
      console.log(`Period ${endedPeriod} ended — no FCM tokens resolved`);
      return;
    }

    const { messages: _msgs, refs: _refs } = dedupeByToken(messages, refs);
    const result = await fcm.sendEach(_msgs);
    await cleanupAfterMulticast(result, _refs);
    console.log(`Period ${endedPeriod} ended → Period ${nextPeriod} starting ${nextStartTime || "soon"} — sent ${result.successCount}/${_msgs.length}`);
  }
);

// ── CALLABLE: Manual period-end reminder trigger (admin/test) ────────────
exports.triggerPeriodReminder = onCall(
  { region: "asia-south1" },
  async (request) => {
    const endedPeriod = Number(request.data.period);
    if (!endedPeriod || endedPeriod < 1 || endedPeriod > 6)
      throw new HttpsError("invalid-argument", "period must be 1–6");

    const nextPeriod = endedPeriod + 1;
    if (nextPeriod > 6)
      throw new HttpsError("invalid-argument", "No next period after period 6");

    // Settings
    const [daySnap, timingsSnap] = await Promise.all([
      db.collection("settings").doc("schoolDay").get(),
      db.collection("settings").doc("periodTimings").get(),
    ]);
    if (!daySnap.exists)    throw new HttpsError("not-found", "schoolDay not set");
    if (!timingsSnap.exists) throw new HttpsError("not-found", "periodTimings not set");

    const currentDay    = daySnap.data().currentDay;
    const timings       = timingsSnap.data();
    const nextT         = timings[`period${nextPeriod}`];
    const nextStartTime = nextT && nextT.start ? nextT.start : null;

    // Slots
    const slotsSnap = await db
      .collection("routine").doc(String(currentDay))
      .collection("periods").doc(String(nextPeriod))
      .collection("slots").get();
    if (slotsSnap.empty)
      throw new HttpsError("not-found", `No slots for Day ${currentDay} Period ${nextPeriod}`);

    // Subjects
    const subjectsSnap = await db.collection("subjects").get();
    const subjects = {};
    subjectsSnap.docs.forEach(d => {
      const sd = d.data();
      subjects[sd.code || d.id] = sd.name || sd.code || d.id;
    });

    // Build + resolve using shared helpers
    const teacherMap = buildTeacherSlotMap(slotsSnap, subjects);
    if (Object.keys(teacherMap).length === 0)
      throw new HttpsError("not-found", "No teachers found in those slots");

    const { messages, refs } = await resolveTeacherMessages(teacherMap, endedPeriod, nextPeriod, nextStartTime);
    if (messages.length === 0)
      throw new HttpsError("not-found", "No FCM tokens resolved — check teachers/users teacherId linking");

    const { messages: _msgs, refs: _refs } = dedupeByToken(messages, refs);
    const result = await fcm.sendEach(_msgs);
    await cleanupAfterMulticast(result, _refs);
    return { sent: result.successCount, failed: result.failureCount, total: _msgs.length };
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// DAILY ROUTINE REMINDER — full-day timetable push to every teacher at 07:30
// and 08:00 IST on working days (skipping holidays). Reads the Day Cycle from
// settings/schoolDay.currentDay (never writes it). See docs/DAILY-ROUTINE-NOTIFICATIONS.md
// ═══════════════════════════════════════════════════════════════════════════

// Extract the teacher assignment(s) from one routine slot.
// Returns [{ initials, subject, className }] — two entries for a value/cate split.
function extractSlotAssignments(s, subjects) {
  const out = [];
  if (s.slotType === "value-cate-split") {
    const classes = (s.involvedClasses || []).join(" & ");
    if (s.valueTeacher) out.push({ initials: String(s.valueTeacher).toUpperCase().trim(), subject: "Value Education", className: classes });
    if (s.cateTeacher)  out.push({ initials: String(s.cateTeacher).toUpperCase().trim(),  subject: "Catechism",       className: classes });
    return out;
  }
  const ini = (s.teacherInitials || "").toUpperCase().trim();
  if (!ini) return out;
  let subjectName;
  if (Array.isArray(s.subjectCode))  subjectName = s.subjectCode.map(c => subjects[c] || c).join(" / ");
  else if (s.subjectCode)            subjectName = subjects[s.subjectCode] || s.subjectCode;
  else                               subjectName = "Class";
  out.push({ initials: ini, subject: subjectName, className: s.className || "" });
  return out;
}

// Highest configured period number (period1..periodN); defaults to 8.
function maxPeriodFromTimings(timings) {
  let max = 0;
  for (let p = 1; p <= 12; p++) if (timings[`period${p}`]) max = p;
  return max || 8;
}

// Build INITIALS → [{ period, subject, className, start, end }] for a whole day.
async function buildDayTeacherSchedule(db, day, subjects, timings) {
  const schedule = {};
  const maxP = maxPeriodFromTimings(timings);
  for (let p = 1; p <= maxP; p++) {
    let slotsSnap;
    try {
      slotsSnap = await db.collection("routine").doc(String(day))
        .collection("periods").doc(String(p)).collection("slots").get();
    } catch (e) { continue; }
    if (slotsSnap.empty) continue;
    const t = timings[`period${p}`] || {};
    slotsSnap.docs.forEach(doc => {
      extractSlotAssignments(doc.data(), subjects).forEach(a => {
        if (!a.initials) return;
        (schedule[a.initials] || (schedule[a.initials] = [])).push({
          period: p, subject: a.subject, className: a.className, start: t.start || "", end: t.end || "",
        });
      });
    });
  }
  return schedule;
}

// Resolve a list of teacher INITIALS → { teacherId, firstName, token, ref }.
// Chains teachers (initials→teacherId+name) → users (teacherId→fcmToken).
async function resolveTeachers(db, initialsList) {
  const teachersSnap = await db.collection("teachers").get();
  const iniToTid = {}, iniToName = {};
  teachersSnap.docs.forEach(doc => {
    const t   = doc.data();
    const ini = (t.initials || t.routineInitials || "").toUpperCase().trim();
    const tid = (t.teacherId || t.loginId || doc.id || "").trim();
    const nm  = (t.name || t.fullName || "").trim();
    if (ini && tid) { iniToTid[ini] = tid; iniToName[ini] = nm.split(" ")[0] || nm || "Teacher"; }
  });

  const wanted = [];
  for (const ini of initialsList) { const tid = iniToTid[ini]; if (tid) wanted.push({ ini, tid }); }

  const tidToUser = {};
  const tids = [...new Set(wanted.map(w => w.tid))];
  for (let i = 0; i < tids.length; i += 30) {
    const chunk = tids.slice(i, i + 30);
    const us = await db.collection("users").where("teacherId", "in", chunk).get();
    us.forEach(u => {
      const d = u.data();
      const tid = (d.teacherId || "").trim();
      if (tid) tidToUser[tid] = { token: d.fcmToken || null, ref: u.ref, name: (d.name || "").split(" ")[0] };
    });
  }

  const out = {};
  for (const { ini, tid } of wanted) {
    const u = tidToUser[tid];
    out[ini] = {
      teacherId: tid,
      firstName: iniToName[ini] || (u && u.name) || "Teacher",
      token: u ? u.token : null,
      ref:   u ? u.ref   : null,
    };
  }
  return out;
}

// Shared sender. slot is "07:30" | "08:00" | "test". opts.force bypasses the
// enabled/working-day/holiday gates (used by the admin test button).
async function runDailyRoutine(slot, opts = {}) {
  const force  = !!opts.force;
  const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const dateStr = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, "0")}-${String(istNow.getDate()).padStart(2, "0")}`;

  const log = {
    type: "daily_routine", slot, date: dateStr, day: null,
    sent: 0, failed: 0, totalTeachers: 0, skipped: false, skipReason: null,
    forced: force, at: new Date().toISOString(),
  };
  const writeLog = async () => { try { await db.collection("notification_logs").add(log); } catch (_) {} };

  // ── Gates ──
  const cfgSnap = await db.collection("settings").doc("routineNotify").get();
  const cfg = cfgSnap.exists ? cfgSnap.data() : {};
  if (!force && cfg.enabled === false) { log.skipped = true; log.skipReason = "disabled";        await writeLog(); return log; }
  const workingDays = Array.isArray(cfg.workingDays) ? cfg.workingDays : [1, 2, 3, 4, 5];
  if (!force && !workingDays.includes(istNow.getDay())) { log.skipped = true; log.skipReason = "not_working_day"; await writeLog(); return log; }

  const holSnap  = await db.collection("holidays").doc("closures").get();
  const holDates = holSnap.exists && Array.isArray(holSnap.data().dates) ? holSnap.data().dates : [];
  if (!force && holDates.includes(dateStr)) { log.skipped = true; log.skipReason = "holiday"; await writeLog(); return log; }

  // ── Day cycle (read-only) ──
  const daySnap = await db.collection("settings").doc("schoolDay").get();
  if (!daySnap.exists) { log.skipped = true; log.skipReason = "no_day_set"; await writeLog(); return log; }
  const day = Number(daySnap.data().currentDay) || 1;
  log.day = day;

  // ── Timetable + subjects ──
  const [timingsSnap, subjectsSnap] = await Promise.all([
    db.collection("settings").doc("periodTimings").get(),
    db.collection("subjects").get(),
  ]);
  const timings = timingsSnap.exists ? timingsSnap.data() : {};
  const subjects = {};
  subjectsSnap.docs.forEach(d => { const sd = d.data(); subjects[sd.code || d.id] = sd.name || sd.code || d.id; });

  const schedule = await buildDayTeacherSchedule(db, day, subjects, timings);
  const initialsList = Object.keys(schedule);
  if (initialsList.length === 0) { log.skipped = true; log.skipReason = "no_routine"; await writeLog(); return log; }
  log.totalTeachers = initialsList.length;

  // ── Resolve tokens + build per-teacher full-day messages ──
  const resolved = await resolveTeachers(db, initialsList);
  const messages = [], refs = [];
  for (const ini of initialsList) {
    const info = resolved[ini];
    if (!info || !info.token) continue;
    const periods = schedule[ini].sort((a, b) => a.period - b.period);
    const lines = periods.map(p =>
      `P${p.period}${p.start && p.end ? ` ${p.start}–${p.end}` : ""} · ${p.subject}${p.className ? ` · Class ${p.className}` : ""}`);
    const body = `Today is Day ${day}. Good morning, ${info.firstName}.\n${lines.join("\n")}`;
    messages.push({
      token: info.token,
      notification: { title: "Today's Teaching Routine", body },
      android: { priority: "high", notification: { channelId: "period_reminders", sound: "default", color: "#8b6f47" } },
      data: { type: "daily_routine", screen: "daily_routine", day: String(day), click_action: "FLUTTER_NOTIFICATION_CLICK" },
    });
    refs.push(info.ref);
  }

  if (messages.length === 0) { log.skipped = true; log.skipReason = "no_tokens"; await writeLog(); return log; }

  const { messages: _msgs, refs: _refs } = dedupeByToken(messages, refs);
  const result = await fcm.sendEach(_msgs);
  await cleanupAfterMulticast(result, _refs);
  log.sent = result.successCount;
  log.failed = result.failureCount;
  await writeLog();
  console.log(`[dailyRoutine ${slot}] Day ${day}: sent ${result.successCount}/${_msgs.length} (teachers with routine: ${initialsList.length})`);
  return log;
}

// ── SCHEDULED: 07:30 IST daily ────────────────────────────────────────────
exports.dailyRoutineMorning1 = onSchedule(
  { schedule: "30 7 * * *", timeZone: "Asia/Kolkata", region: "asia-south1" },
  async () => { await runDailyRoutine("07:30"); }
);

// ── SCHEDULED: 08:00 IST daily ────────────────────────────────────────────
exports.dailyRoutineMorning2 = onSchedule(
  { schedule: "0 8 * * *", timeZone: "Asia/Kolkata", region: "asia-south1" },
  async () => { await runDailyRoutine("08:00"); }
);

// ── CALLABLE: admin "Send test now" — forces a send ignoring the gates ────
exports.triggerDailyRoutine = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const u = await db.collection("users").doc(request.auth.uid).get();
    if (!u.exists || u.data().role !== "admin")
      throw new HttpsError("permission-denied", "Admin only.");
    const force = !(request.data && request.data.respectGates);
    return await runDailyRoutine("test", { force });
  }
);

// ── CALLABLE: Admin sets a temp password for a user ───────────────────────
exports.setTempPassword = onCall(
  { region: "asia-south1" },
  async (request) => {
    // Must be signed in as admin
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists || !["admin", "super_admin"].includes(callerDoc.data().role))
      throw new HttpsError("permission-denied", "Admin only.");

    const { uid, tempPassword } = request.data;
    if (!uid || !tempPassword) throw new HttpsError("invalid-argument", "uid and tempPassword required.");
    if (tempPassword.length < 6) throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");

    // Set the password via Admin SDK
    await getAuth().updateUser(uid, { password: tempPassword });

    // Flag the user doc so portal can prompt them to change it on next login
    await db.collection("users").doc(uid).set({ mustChangePassword: true }, { merge: true });

    // Log to audit
    await db.collection("audit_log").add({
      action: "Password Reset",
      detail: `UID: ${uid} — temp password set by admin`,
      performedBy: callerDoc.data().name || request.auth.token.email || "Admin",
      uid: request.auth.uid,
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// STAFF (TEACHER) DAILY ATTENDANCE — geo-tagged check-in / check-out
// ════════════════════════════════════════════════════════════════════════════
// The ONLY writer of staff_attendance docs. Server-authoritative: the time is
// stamped here, never trusted from the device clock. The geofence is recorded
// and flagged (never hard-blocks) so GPS drift can't lock a teacher out.

const STAFF_ATT_DEFAULTS = {
  schoolLat: 25.53898298536331,
  schoolLng: 91.8936348432684,
  radiusMeters: 100,
  morningExpected: "08:00",
  minDeparture: "14:30",
  graceMinutes: 10,
};

// Great-circle distance in metres between two lat/lng points.
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000; // earth radius, metres
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// Server "now" expressed in the school's timezone (IST). Returns the date key
// (YYYY-MM-DD) and minutes-since-midnight + "HH:MM" — used for the doc id and
// for late/early comparisons regardless of where the function executes.
function istNow() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(now).reduce((o, p) => (o[p.type] = p.value, o), {});
  const hh = parts.hour === "24" ? "00" : parts.hour; // guard midnight rollover
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${hh}:${parts.minute}`,
    minutes: parseInt(hh, 10) * 60 + parseInt(parts.minute, 10),
    iso: now.toISOString(),
    ms: now.getTime(),
  };
}

// "HH:MM" → minutes since midnight.
function hhmmToMinutes(s) {
  const [h, m] = String(s).split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
}

exports.recordStaffAttendance = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");

    const uid = request.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) throw new HttpsError("permission-denied", "User not found.");
    const user = userDoc.data();
    const teacherRoles = ["teacher", "class_teacher", "subject_teacher", "admin", "super_admin"];
    if (!teacherRoles.includes(user.role))
      throw new HttpsError("permission-denied", "Staff attendance is for teachers only.");

    const { phase, lat, lng, accuracy } = request.data || {};
    if (phase !== "in" && phase !== "out")
      throw new HttpsError("invalid-argument", "phase must be 'in' or 'out'.");
    if (typeof lat !== "number" || typeof lng !== "number" ||
        Number.isNaN(lat) || Number.isNaN(lng))
      throw new HttpsError("invalid-argument", "Valid lat/lng required. Enable location.");

    // Config (with code fallbacks so a missing doc never breaks check-in).
    const cfgSnap = await db.collection("settings").doc("staff_attendance_config").get();
    const cfg = Object.assign({}, STAFF_ATT_DEFAULTS, cfgSnap.exists ? cfgSnap.data() : {});

    const t = istNow();
    const distanceMeters = haversineMeters(lat, lng, cfg.schoolLat, cfg.schoolLng);
    const withinGeofence = distanceMeters <= cfg.radiusMeters;

    const docId = `${uid}_${t.dateKey}`;
    const ref = db.collection("staff_attendance").doc(docId);
    const existing = (await ref.get()).data() || {};

    const stamp = {
      at: t.iso,
      atMs: t.ms,
      localTime: t.localTime,
      lat, lng,
      accuracy: typeof accuracy === "number" ? Math.round(accuracy) : null,
      distanceMeters,
      withinGeofence,
    };

    if (phase === "in") {
      if (existing.morningIn)
        throw new HttpsError("failed-precondition", "Already checked in today.");

      const lateBy = Math.max(0, t.minutes - (hhmmToMinutes(cfg.morningExpected) + (cfg.graceMinutes || 0)));
      stamp.lateBy = lateBy;

      await ref.set({
        uid,
        teacherName: user.name || user.displayName || "",
        teacherClass: user.class || null,
        dateKey: t.dateKey,
        morningIn: stamp,
        status: lateBy > 0 ? "late" : "present",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return { success: true, phase, localTime: t.localTime, withinGeofence, distanceMeters, lateBy };
    }

    // phase === "out"
    if (!existing.morningIn)
      throw new HttpsError("failed-precondition", "No check-in found for today.");
    if (existing.eveningOut)
      throw new HttpsError("failed-precondition", "Already checked out today.");

    const earlyBy = Math.max(0, hhmmToMinutes(cfg.minDeparture) - t.minutes);
    const workedMinutes = Math.max(0, Math.round((t.ms - existing.morningIn.atMs) / 60000));
    stamp.earlyBy = earlyBy;

    await ref.set({
      eveningOut: stamp,
      workedMinutes,
      earlyDeparture: earlyBy > 0,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { success: true, phase, localTime: t.localTime, withinGeofence, distanceMeters, earlyBy, workedMinutes };
  }
);

// ── Missed-checkout reminder ────────────────────────────────────────────────
// Finds teachers who checked IN today but never checked OUT, and pushes a
// gentle reminder. Holidays/Sundays need no special gate: on those days nobody
// checks in, so the query returns nothing. Idempotent via `reminderSent`.
async function runStaffCheckoutReminder() {
  const istNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const dateStr = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, "0")}-${String(istNow.getDate()).padStart(2, "0")}`;

  const log = {
    type: "staff_checkout_reminder", date: dateStr,
    sent: 0, failed: 0, candidates: 0, at: new Date().toISOString(),
  };
  const writeLog = async () => { try { await db.collection("notification_logs").add(log); } catch (_) {} };

  const snap = await db.collection("staff_attendance").where("dateKey", "==", dateStr).get();
  const messages = [], refs = [], docRefs = [];

  for (const docSnap of snap.docs) {
    const d = docSnap.data();
    if (!d.morningIn || d.eveningOut || d.reminderSent) continue;  // only checked-in-not-out, once
    const uDoc = await db.collection("users").doc(d.uid).get();
    const token = uDoc.exists ? uDoc.data().fcmToken : null;
    if (!token) continue;
    const first = ((uDoc.data().name || uDoc.data().displayName || d.teacherName || "").split(" ")[0]) || "there";
    messages.push({
      token,
      notification: {
        title: "⏰ Don't forget to check out",
        body: `Hi ${first}, you haven't checked out today. Tap to record your departure before you leave.`,
      },
      android: { priority: "high", notification: { channelId: "period_reminders", sound: "default", color: "#8b6f47" } },
      data: { type: "staff_checkout_reminder", screen: "staff_attendance", click_action: "FLUTTER_NOTIFICATION_CLICK" },
    });
    refs.push(uDoc.ref);
    docRefs.push(docSnap.ref);
  }

  log.candidates = messages.length;
  if (messages.length === 0) { await writeLog(); return log; }

  const { messages: _m, refs: _r } = dedupeByToken(messages, refs);
  const result = await fcm.sendEach(_m);
  await cleanupAfterMulticast(result, _r);

  // Mark so a second run the same day won't nag again.
  await Promise.all(docRefs.map(r =>
    r.set({ reminderSent: true, reminderSentAt: new Date().toISOString() }, { merge: true }).catch(() => {})));

  log.sent = result.successCount;
  log.failed = result.failureCount;
  await writeLog();
  console.log(`[staffCheckoutReminder] ${dateStr}: sent ${result.successCount}/${_m.length}`);
  return log;
}

// SCHEDULED: 17:30 IST, Mon–Sat. (To change the time, edit this cron + redeploy;
// settings.staff_attendance_config.checkoutReminderTime is informational.)
exports.staffCheckoutReminder = onSchedule(
  { schedule: "30 17 * * 1-6", timeZone: "Asia/Kolkata", region: "asia-south1" },
  async () => { await runStaffCheckoutReminder(); }
);

// CALLABLE: admin-only manual trigger, for testing without waiting for 17:30.
exports.triggerStaffCheckoutReminder = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const c = await db.collection("users").doc(request.auth.uid).get();
    if (!c.exists || !["admin", "super_admin"].includes(c.data().role))
      throw new HttpsError("permission-denied", "Admin only.");
    return await runStaffCheckoutReminder();
  }
);

// ── Admin: clear all staff_attendance records for ONE day ───────────────────
// Server-side delete so the "client never writes attendance" rule stays intact
// (firestore.rules blocks client writes/deletes on staff_attendance). Admin-only.
// Deletes every staff_attendance doc whose dateKey == the given YYYY-MM-DD.
exports.clearStaffAttendanceDay = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const c = await db.collection("users").doc(request.auth.uid).get();
    if (!c.exists || !["admin", "super_admin"].includes(c.data().role))
      throw new HttpsError("permission-denied", "Admin only.");

    const dateKey = String((request.data && request.data.dateKey) || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey))
      throw new HttpsError("invalid-argument", "dateKey must be in YYYY-MM-DD format.");

    const snap = await db.collection("staff_attendance")
      .where("dateKey", "==", dateKey).get();
    if (snap.empty) return { deleted: 0, dateKey };

    let deleted = 0;
    const docs = snap.docs;
    for (let i = 0; i < docs.length; i += 450) {
      const batch = db.batch();
      docs.slice(i, i + 450).forEach((d) => { batch.delete(d.ref); deleted++; });
      await batch.commit();
    }

    // Audit trail (admin-readable notification_logs, same as other admin actions).
    try {
      await db.collection("notification_logs").add({
        type: "staff_attendance_cleared",
        dateKey,
        deleted,
        by: c.data().name || request.auth.token.email || "Admin",
        uid: request.auth.uid,
        at: new Date().toISOString(),
      });
    } catch (_) {}

    return { deleted, dateKey };
  }
);

// ════════════════════════════════════════════════════════════════════════════
// PROVISION LOGIN — idempotent, self-healing teacher/student account creation
// ════════════════════════════════════════════════════════════════════════════
// ROOT-CAUSE FIX for duplicate user docs. Old flow created auth accounts via the
// client REST API (can't look up by email) and keyed users docs by the volatile
// auth uid, so any delete-recreate cycle orphaned the old doc. This function uses
// the Admin SDK to converge to EXACTLY ONE auth user + ONE users doc per loginId:
//   1. find-or-create the auth user by email (stable uid),
//   2. delete every users doc with this loginId whose id !== that uid (orphans),
//   3. write the single canonical doc + (re)set the password.
// Run it any number of times — the result is always clean.

// Mirrors the client's idToEmailLocal() so emails match existing accounts.
function idToEmail(id) {
  return String(id).trim().toLowerCase().replace(/[^a-z0-9]/g, "_") + "@stfrancis.school";
}

exports.provisionLogin = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const caller = await db.collection("users").doc(request.auth.uid).get();
    if (!caller.exists || !["admin", "super_admin"].includes(caller.data().role))
      throw new HttpsError("permission-denied", "Admin only.");

    const { loginId, password, role, name } = request.data || {};
    if (!loginId || !password || !role)
      throw new HttpsError("invalid-argument", "loginId, password and role are required.");
    if (String(password).length < 6)
      throw new HttpsError("invalid-argument", "Password must be at least 6 characters.");
    if (!["teacher", "student"].includes(role))
      throw new HttpsError("invalid-argument", "role must be 'teacher' or 'student'.");

    const email = idToEmail(loginId);

    // 1) Find-or-create the auth user (one stable uid per email).
    let userRec;
    try {
      userRec = await getAuth().getUserByEmail(email);
    } catch (e) {
      if (e.code === "auth/user-not-found") userRec = await getAuth().createUser({ email, password });
      else throw new HttpsError("internal", "Auth lookup failed: " + e.message);
    }
    const uid = userRec.uid;
    await getAuth().updateUser(uid, { password });   // (re)set the password

    // 2) Reconcile: remove any users doc for this loginId that isn't the canonical uid.
    const dupSnap = await db.collection("users").where("loginId", "==", loginId).get();
    let removedOrphans = 0;
    for (const d of dupSnap.docs) {
      if (d.id !== uid) { await d.ref.delete(); removedOrphans++; }
    }

    // 3) Write the single canonical doc.
    const docData = { role, loginId, email, name: name || loginId, updatedAt: new Date().toISOString() };
    if (role === "teacher") docData.teacherId = loginId;
    if (role === "student") {
      docData.studentId = loginId;
      const sSnap = await db.collection("students").where("studentId", "==", loginId).limit(1).get();
      if (!sSnap.empty) { const s = sSnap.docs[0].data(); docData.class = s.class || ""; docData.rollNo = s.rollNo || ""; }
    }
    await db.collection("users").doc(uid).set(docData, { merge: true });

    console.log(`[provisionLogin] ${role} ${loginId} -> uid ${uid}, removed ${removedOrphans} orphan(s)`);
    return { uid, email, removedOrphans };
  }
);

// CALLABLE: admin force-logout of a user's active session.
// Overwrites sessions/{uid}.sessionId so the target device's onSnapshot listener
// detects a mismatch and logs out immediately; also revokes refresh tokens so any
// missed/offline device is invalidated on its next token refresh.
exports.adminForceLogout = onCall(
  { region: "asia-south1" },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const caller = await db.collection("users").doc(request.auth.uid).get();
    if (!caller.exists || !["admin", "super_admin"].includes(caller.data().role))
      throw new HttpsError("permission-denied", "Admin only.");

    const { uid } = request.data || {};
    if (!uid) throw new HttpsError("invalid-argument", "uid required.");

    await db.collection("sessions").doc(uid).set({
      sessionId: "revoked_" + Date.now(),
      revokedBy: caller.data().name || request.auth.token.email || "Admin",
      revokedAt: new Date().toISOString(),
    }, { merge: true });

    try { await getAuth().revokeRefreshTokens(uid); } catch (e) { console.warn("revoke skipped:", e.message); }
    return { success: true };
  }
);

// ── Server-side device tracking ─────────────────────────────────────────────
// Mirrors every sessions/{uid} write into device_registry, so a device is
// tracked even if its app is running an OLD cached build (the old client still
// writes sessions on login). Admin SDK bypasses rules.
exports.mirrorSessionToRegistry = onDocumentWritten("sessions/{uid}", async (event) => {
  const after = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!after || !after.deviceId) return;                                   // deleted / no device info
  if (String(after.sessionId || "").indexOf("revoked_") === 0) return;     // admin force-logout, not a real login

  const uid = event.params.uid;
  const uDoc = await db.collection("users").doc(uid).get();
  const u = uDoc.exists ? uDoc.data() : {};

  const ref = db.collection("device_registry").doc(uid + "_" + after.deviceId);
  const existed = (await ref.get()).exists;
  const stamp = after.loginAt || FieldValue.serverTimestamp();

  const data = {
    uid,
    name: u.name || u.displayName || "",
    role: u.role || "",
    deviceId: after.deviceId,
    deviceLabel: after.deviceLabel || "",
    platform: after.platform || "",
    lastLoginAt: stamp,
    lastSeenAt: stamp,
  };
  if (!existed) data.firstSeenAt = stamp;
  await ref.set(data, { merge: true });
  console.log(`[mirrorSession] tracked ${u.name || uid} (${after.platform})`);
});
