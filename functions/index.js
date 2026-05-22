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

// ── Helper: get FCM token for a student by studentId ──────────────────────
async function getStudentToken(studentId) {
  if (!studentId) { console.warn("getStudentToken: no studentId"); return null; }
  console.log("getStudentToken: looking up", studentId);
  const snap = await db.collection("users")
    .where("studentId", "==", studentId)
    .limit(1)
    .get();
  if (snap.empty) { console.warn("getStudentToken: no user found for", studentId); return null; }
  const token = snap.docs[0].data().fcmToken || null;
  console.log("getStudentToken: token found?", !!token);
  return token;
}

// ── Helper: send attendance push to newly-absent students ─────────────────
async function notifyAbsent(data, docId) {
  const absent = data.absent || [];
  const date   = data.date   || (docId || "").split("_")[1] || "";
  const cls    = data.class  || "";
  const fmt    = date ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" }) : date;

  await Promise.all(absent.map(async (sid) => {
    const token = await getStudentToken(sid);
    await sendPush(
      token,
      "Attendance Alert",
      `You were marked Absent on ${fmt} (Class ${cls}). Please inform the school if this is incorrect.`,
      { type: "attendance", date, class: String(cls) }
    );
  }));
}

// ── TRIGGER 1a: Attendance created ───────────────────────────────────────
exports.notifyAbsentStudents = onDocumentCreated(
  "attendance_daily/{docId}",
  async (event) => notifyAbsent(event.data.data(), event.params.docId)
);

// ── TRIGGER 1b: Attendance updated → notify all absent students ───────────
exports.notifyAbsentStudentsUpdated = onDocumentUpdated(
  "attendance_daily/{docId}",
  async (event) => {
    const after = event.data.after.data();
    console.log("notifyAbsentStudentsUpdated fired, absent:", after.absent);
    await notifyAbsent(after, event.params.docId);
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

// ── SCHEDULED: Period-end reminder for teachers ───────────────────────────
// Runs every minute (IST). When a period ends, each teacher assigned to the
// NEXT period receives a push: "Period X ended — Class Y: Subject next".
exports.periodEndReminder = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Asia/Kolkata", region: "asia-south1" },
  async () => {
    // Current time in IST
    const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const currentMinutes = nowIST.getHours() * 60 + nowIST.getMinutes();

    // Fetch period timings
    const timingsSnap = await db.collection("settings").doc("periodTimings").get();
    if (!timingsSnap.exists) return;
    const timings = timingsSnap.data();

    // Find which period just ended at this exact minute
    let endedPeriod = null;
    for (let p = 1; p <= 6; p++) {
      const t = timings[`period${p}`];
      if (!t || !t.end) continue;
      const [eh, em] = t.end.split(":").map(Number);
      if (currentMinutes === eh * 60 + em) { endedPeriod = p; break; }
    }
    if (endedPeriod === null) return;

    const nextPeriod = endedPeriod + 1;
    if (nextPeriod > 6) return; // Last period — no next class

    // Get current school day
    const daySnap = await db.collection("settings").doc("schoolDay").get();
    if (!daySnap.exists) return;
    const currentDay = daySnap.data().currentDay;

    // Get slots for next period
    const slotsSnap = await db
      .collection("routine").doc(String(currentDay))
      .collection("periods").doc(String(nextPeriod))
      .collection("slots").get();
    if (slotsSnap.empty) return;

    // Get subjects map
    const subjectsSnap = await db.collection("subjects").get();
    const subjects = {};
    subjectsSnap.docs.forEach(d => { subjects[d.data().code] = d.data().name; });

    // Map teacher initials → { subject, className }
    const teacherMap = {};
    slotsSnap.docs.forEach(doc => {
      const s = doc.data();
      if (s.type === "value-cate-split") {
        const classes = (s.involvedClasses || []).join(" & ");
        if (s.valueTeacher) teacherMap[s.valueTeacher] = { subject: "Value Education", className: classes };
        if (s.cateTeacher)  teacherMap[s.cateTeacher]  = { subject: "Catechism",        className: classes };
      } else {
        const subjectName = Array.isArray(s.subjectCodes)
          ? s.subjectCodes.map(c => subjects[c] || `Subj ${c}`).join(" / ")
          : (subjects[s.subjectCode] || "Class");
        if (s.teacherInitials) teacherMap[s.teacherInitials] = { subject: subjectName, className: s.className || "" };
      }
    });

    const initials = Object.keys(teacherMap);
    if (initials.length === 0) return;

    // Resolve initials → staffId via teachers collection (batch by 30 for Firestore in-query limit)
    const staffIdToInitials = {};
    const staffIds = [];
    const teacherDocs = await Promise.all(initials.map(i => db.collection("teachers").doc(i).get()));
    teacherDocs.forEach(snap => {
      if (!snap.exists) return;
      const { initials: ini, staffId } = snap.data();
      if (staffId) { staffIdToInitials[staffId] = ini; staffIds.push(staffId); }
    });
    if (staffIds.length === 0) return;

    // Find users with matching staffId (chunk into 30s for in-query limit)
    const messages = [];
    const chunks = [];
    for (let i = 0; i < staffIds.length; i += 30) chunks.push(staffIds.slice(i, i + 30));

    await Promise.all(chunks.map(async chunk => {
      const usersSnap = await db.collection("users").where("staffId", "in", chunk).get();
      usersSnap.docs.forEach(uDoc => {
        const { fcmToken, staffId } = uDoc.data();
        if (!fcmToken || !staffId) return;
        const ini  = staffIdToInitials[staffId];
        const info = ini ? teacherMap[ini] : null;
        if (!info) return;
        messages.push({
          token: fcmToken,
          notification: {
            title: `⏰ Period ${endedPeriod} ended`,
            body: `Next: ${info.subject} — Class ${info.className}`,
          },
          android: { priority: "high", notification: { channelId: "period_reminders", sound: "default" } },
          data: { type: "period_reminder", nextPeriod: String(nextPeriod), className: info.className },
        });
      });
    }));

    if (messages.length === 0) return;
    const result = await fcm.sendEach(messages);
    console.log(`Period ${endedPeriod} ended — sent ${result.successCount} reminders, ${result.failureCount} failed`);
  }
);

// ── CALLABLE: Manual period-end reminder trigger (admin only) ─────────────
exports.triggerPeriodReminder = onCall(
  { region: "asia-south1" },
  async (request) => {
    const endedPeriod = Number(request.data.period);
    if (!endedPeriod || endedPeriod < 1 || endedPeriod > 6) {
      throw new HttpsError("invalid-argument", "period must be 1–6");
    }
    const nextPeriod = endedPeriod + 1;
    if (nextPeriod > 6) throw new HttpsError("invalid-argument", "No next period after period 6");

    const daySnap = await db.collection("settings").doc("schoolDay").get();
    if (!daySnap.exists) throw new HttpsError("not-found", "schoolDay not set");
    const currentDay = daySnap.data().currentDay;

    const slotsSnap = await db
      .collection("routine").doc(String(currentDay))
      .collection("periods").doc(String(nextPeriod))
      .collection("slots").get();
    if (slotsSnap.empty) throw new HttpsError("not-found", `No slots for Day ${currentDay} Period ${nextPeriod}`);

    const subjectsSnap = await db.collection("subjects").get();
    const subjects = {};
    subjectsSnap.docs.forEach(d => { subjects[d.data().code] = d.data().name; });

    const teacherMap = {};
    slotsSnap.docs.forEach(doc => {
      const s = doc.data();
      if (s.type === "value-cate-split") {
        const classes = (s.involvedClasses || []).join(" & ");
        if (s.valueTeacher) teacherMap[s.valueTeacher] = { subject: "Value Education", className: classes };
        if (s.cateTeacher)  teacherMap[s.cateTeacher]  = { subject: "Catechism",        className: classes };
      } else {
        const subjectName = Array.isArray(s.subjectCodes)
          ? s.subjectCodes.map(c => subjects[c] || `Subj ${c}`).join(" / ")
          : (subjects[s.subjectCode] || "Class");
        if (s.teacherInitials) teacherMap[s.teacherInitials] = { subject: subjectName, className: s.className || "" };
      }
    });

    const initials = Object.keys(teacherMap);
    if (initials.length === 0) throw new HttpsError("not-found", "No teachers found for that period");

    const staffIdToInitials = {};
    const staffIds = [];
    const teacherDocs = await Promise.all(initials.map(i => db.collection("teachers").doc(i).get()));
    teacherDocs.forEach(snap => {
      if (!snap.exists) return;
      const { initials: ini, staffId } = snap.data();
      if (staffId) { staffIdToInitials[staffId] = ini; staffIds.push(staffId); }
    });
    if (staffIds.length === 0) throw new HttpsError("not-found", "No staffIds resolved");

    const messages = [];
    const chunks = [];
    for (let i = 0; i < staffIds.length; i += 30) chunks.push(staffIds.slice(i, i + 30));
    await Promise.all(chunks.map(async chunk => {
      const usersSnap = await db.collection("users").where("staffId", "in", chunk).get();
      usersSnap.docs.forEach(uDoc => {
        const { fcmToken, staffId } = uDoc.data();
        if (!fcmToken || !staffId) return;
        const ini  = staffIdToInitials[staffId];
        const info = ini ? teacherMap[ini] : null;
        if (!info) return;
        messages.push({
          token: fcmToken,
          notification: {
            title: `⏰ Period ${endedPeriod} ended`,
            body: `Next: ${info.subject} — Class ${info.className}`,
          },
          android: { priority: "high", notification: { channelId: "period_reminders", sound: "default" } },
          data: { type: "period_reminder", nextPeriod: String(nextPeriod), className: info.className },
        });
      });
    }));

    if (messages.length === 0) throw new HttpsError("not-found", "No FCM tokens found for teachers");
    const result = await fcm.sendEach(messages);
    return { sent: result.successCount, failed: result.failureCount, total: messages.length };
  }
);
