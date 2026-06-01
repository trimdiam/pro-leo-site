import {
  getFirestore,
  doc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

(async () => {
  const app = await window._sfAppReady;
  const db = getFirestore(app);

  // Admin approves a forwarded admission — writes back to admissions doc + notifies office
  window.adminApproveAdmission = async function (docId, studentName) {
    if (!confirm(`Approve admission for ${studentName} and notify office?`)) return;
    try {
      await updateDoc(doc(db, "admissions", docId), {
        status: "Admitted",
        adminDecision: "approved",
        adminDecidedAt: serverTimestamp(),
        adminDecidedBy: "Admin",
        updatedAt: new Date().toISOString(),
      });
      await addDoc(collection(db, "office_notifications"), {
        type: "admission_decision",
        admissionId: docId,
        studentName: studentName,
        decision: "approved",
        message: `Admission for ${studentName} has been APPROVED by Admin.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      showToast("✅ Admission approved. Office has been notified.");
      window.loadOfficeAdmissions && loadOfficeAdmissions();
    } catch (e) {
      showToast("❌ " + e.message);
    }
  };

  // Admin rejects a forwarded admission — writes back + notifies office
  window.adminRejectAdmission = async function (docId, studentName) {
    if (!confirm(`Reject admission for ${studentName} and notify office?`)) return;
    try {
      await updateDoc(doc(db, "admissions", docId), {
        status: "Rejected",
        adminDecision: "rejected",
        adminDecidedAt: serverTimestamp(),
        adminDecidedBy: "Admin",
        updatedAt: new Date().toISOString(),
      });
      await addDoc(collection(db, "office_notifications"), {
        type: "admission_decision",
        admissionId: docId,
        studentName: studentName,
        decision: "rejected",
        message: `Admission for ${studentName} has been REJECTED by Admin.`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      showToast("🗑️ Admission rejected. Office has been notified.");
      window.loadOfficeAdmissions && loadOfficeAdmissions();
    } catch (e) {
      showToast("❌ " + e.message);
    }
  };

  // Admin sends an application back to office for revision
  window.adminSendBackToOffice = async function (docId, studentName) {
    const reason = prompt(`Reason for sending back "${studentName}" to office (optional):`);
    if (reason === null) return; // cancelled
    try {
      await updateDoc(doc(db, "admissions", docId), {
        status: "pending",
        adminDecision: "sent_back",
        sentBackReason: reason || "",
        sentBackAt: serverTimestamp(),
        sentBackBy: "Admin",
        updatedAt: new Date().toISOString(),
      });
      await addDoc(collection(db, "office_notifications"), {
        type: "admission_sent_back",
        admissionId: docId,
        studentName: studentName,
        decision: "sent_back",
        message: `Admission for ${studentName} was sent back by Admin.${reason ? " Reason: " + reason : ""}`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      showToast("↩️ Application sent back to office.");
      window.loadOfficeAdmissions && loadOfficeAdmissions();
    } catch (e) {
      showToast("❌ " + e.message);
    }
  };

  console.log("[AdminAdmissions] ✅ Approve/Reject/SendBack loaded");
})();
