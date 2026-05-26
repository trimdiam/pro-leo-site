const { setGlobalOptions } = require("firebase-functions");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
setGlobalOptions({ maxInstances: 10, region: "asia-south1" });

const db  = getFirestore();
const fcm = getMessaging();

// ── Helper: send FCM to a single FCM token ─────────────────────────────────
async function sendPush(token, title, body, data = {}) {
  if (!token) { console.warn("sendPush: no token, skipping"); return; }
  try {
    const result = await fcm.send({ token, notification: { title, body }, data, android: { priority: "high" } });
    console.log("FCM send success:", result);
  } catch (e) {
    console.error("FCM send failed:", e.code, e.message);
  }
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
  };
}

// Keep old name as alias so student_messages trigger still works
async function getStudentToken(studentId) {
  const info = await getStudentInfo(studentId);
  return info ? info.token : null;
}

// ── Helper: rich attendance push ──────────────────────────────────────────
async function sendAttendancePush(token, firstName, status, fmt, cls, date, isReminder) {
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
  });
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
    await sendAttendancePush(info.token, info.name, status, fmt, cls, date, isReminder);
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

    // Only notify students who are NEW to absent/late (not previously there)
    const newAbsent = (after.absent || []).filter(s => !(before.absent || []).includes(s));
    const newLate   = (after.late   || []).filter(s => !(before.late   || []).includes(s));

    const docId = event.params.docId;
    const date  = after.date || (docId || "").split("_")[1] || "";
    const cls   = after.class || "";
    const fmt   = date
      ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })
      : date;

    await Promise.all([
      ...newAbsent.map(async (sid) => {
        const info = await getStudentInfo(sid);
        if (info && info.token) await sendAttendancePush(info.token, info.name, "absent", fmt, cls, date, false);
      }),
      ...newLate.map(async (sid) => {
        const info = await getStudentInfo(sid);
        if (info && info.token) await sendAttendancePush(info.token, info.name, "late", fmt, cls, date, false);
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
      await sendPush(token, `📢 ${title}`, body, { type: "notice", noticeId: event.params.noticeId });
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

    const from = after.from || "";
    const to   = after.to   || "";
    const name = after.teacherName || "Teacher";
    const icon = status === "Approved" ? "✅" : "❌";
    const title = `${icon} Leave ${status}`;
    const body  = status === "Approved"
      ? `Your leave from ${from} to ${to} has been approved.`
      : `Your leave from ${from} to ${to} has been rejected. Please contact the admin.`;

    await sendPush(token, title, body, { type: "leave", status, leaveId: event.params.leaveId });
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

    const token = await getStudentToken(studentId);
    await sendPush(
      token,
      `✉️ ${subject}`,
      preview || "You have a new message from the administration.",
      { type: "message", msgId: event.params.msgId }
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
  if (Object.keys(teacherMap).length === 0) return [];

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
          notification: { channelId: "period_reminders", sound: "default" }
        },
        data: {
          type:       "period_reminder",
          nextPeriod: String(nextPeriod),
          subject:    info.subject,
          className:  info.className,
        },
      });
    });
  }

  return messages;
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
    const messages   = await resolveTeacherMessages(teacherMap, endedPeriod, nextPeriod, nextStartTime);

    if (messages.length === 0) {
      console.log(`Period ${endedPeriod} ended — no FCM tokens resolved`);
      return;
    }

    const result = await fcm.sendEach(messages);
    console.log(`Period ${endedPeriod} ended → Period ${nextPeriod} starting ${nextStartTime || "soon"} — sent ${result.successCount}/${messages.length}`);
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

    const messages = await resolveTeacherMessages(teacherMap, endedPeriod, nextPeriod, nextStartTime);
    if (messages.length === 0)
      throw new HttpsError("not-found", "No FCM tokens resolved — check teachers/users teacherId linking");

    const result = await fcm.sendEach(messages);
    return { sent: result.successCount, failed: result.failureCount, total: messages.length };
  }
);
