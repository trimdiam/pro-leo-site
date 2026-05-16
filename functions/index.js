const { setGlobalOptions } = require("firebase-functions");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
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
