import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  updateDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

(async () => {
  const app = await window._sfAppReady;
  const db = getFirestore(app);

  window.loadOfficeNotifications = async function () {
    const list = document.getElementById("o-notif-list");
    const badge = document.getElementById("o-notif-badge");
    if (!list) return;

    list.innerHTML = '<div style="text-align:center;padding:32px;color:var(--text-light)"><i class="fas fa-spinner fa-spin"></i> Loading…</div>';

    try {
      const snap = await getDocs(
        query(
          collection(db, "office_notifications"),
          where("read", "==", false),
          limit(50)
        )
      );

      // update badge count
      if (badge) badge.textContent = snap.size || "";

      if (snap.empty) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-light)"><i class="fas fa-check-circle" style="font-size:2rem;margin-bottom:12px;display:block;color:#86efac"></i>No new notifications.</div>';
        return;
      }

      const docs = snap.docs.slice().sort((a, b) =>
        (b.data().createdAt || "").localeCompare(a.data().createdAt || "")
      );

      list.innerHTML = docs.map(d => {
        const n = d.data();
        const icon = n.decision === "approved"
          ? '<i class="fas fa-check-circle" style="color:#059669;font-size:1.2rem"></i>'
          : n.decision === "rejected"
          ? '<i class="fas fa-times-circle" style="color:#dc2626;font-size:1.2rem"></i>'
          : n.decision === "sent_back"
          ? '<i class="fas fa-undo" style="color:#d97706;font-size:1.2rem"></i>'
          : '<i class="fas fa-bell" style="color:var(--primary);font-size:1.2rem"></i>';

        const bg = n.decision === "approved"
          ? "#f0fdf4;border-color:#86efac"
          : n.decision === "rejected"
          ? "#fef2f2;border-color:#fca5a5"
          : n.decision === "sent_back"
          ? "#fffbeb;border-color:#fcd34d"
          : "#eff6ff;border-color:#bfdbfe";

        const date = n.createdAt
          ? new Date(n.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
          : "—";

        return `<div style="background:${bg};border:1.5px solid;border-radius:10px;padding:14px 16px;margin-bottom:12px;display:flex;gap:12px;align-items:flex-start">
          <div style="flex-shrink:0;margin-top:2px">${icon}</div>
          <div style="flex:1">
            <div style="font-weight:600;font-size:13px;color:var(--text-dark);margin-bottom:4px">${n.message || "Notification"}</div>
            <div style="font-size:11px;color:var(--text-light)">${date}</div>
          </div>
          <button onclick="markOfficeNotifRead('${d.id}')" style="flex-shrink:0;background:none;border:none;color:var(--text-light);cursor:pointer;font-size:12px;padding:4px 6px;border-radius:6px" title="Mark as read"><i class="fas fa-check"></i></button>
        </div>`;
      }).join("");

    } catch (e) {
      list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--danger)">❌ ${e.message}</div>`;
    }
  };

  window.markOfficeNotifRead = async function (docId) {
    try {
      await updateDoc(doc(db, "office_notifications", docId), { read: true });
      loadOfficeNotifications();
    } catch (e) {
      showToast("❌ " + e.message);
    }
  };

  window.markAllOfficeNotifsRead = async function () {
    try {
      const snap = await getDocs(
        query(collection(db, "office_notifications"), where("read", "==", false), limit(50))
      );
      await Promise.all(snap.docs.map(d => updateDoc(doc(db, "office_notifications", d.id), { read: true })));
      loadOfficeNotifications();
      showToast("✅ All notifications marked as read.");
    } catch (e) {
      showToast("❌ " + e.message);
    }
  };

  console.log("[OfficeNotifications] ✅ Loaded");
})();
