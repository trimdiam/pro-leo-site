import {
  getFirestore,
  collection,
  query,
  where,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

(async () => {
  const app = await window._sfAppReady;
  const db = getFirestore(app);

  const fmtINR = (n) => "₹" + (parseFloat(n) || 0).toLocaleString("en-IN");
  const CLS = { PLG: "Play Group", SKG: "SKG", LKG: "LKG" };
  const clsLabel = (c) => CLS[c] || (c ? "Class " + c : "—");
  const bc = (s) =>
    s === "approved" ? "badge-success" : s === "rejected" ? "badge-danger" : "badge-warning";

  window.loadOfficeFeeTransactions = async function () {
    const tbody = document.getElementById("o-fee-txn-tbody");
    if (!tbody) return;
    tbody.innerHTML =
      '<tr><td colspan="11" style="text-align:center;padding:18px"><i class="fas fa-spinner fa-spin"></i></td></tr>';

    const filter = document.getElementById("o-txn-filter")?.value || "pending";

    try {
      let q;
      if (filter === "all") {
        q = query(
          collection(db, "fee_transactions"),
          where("source", "==", "office"),
          limit(100)
        );
      } else {
        q = query(
          collection(db, "fee_transactions"),
          where("source", "==", "office"),
          where("status", "==", filter),
          limit(100)
        );
      }

      const snap = await getDocs(q);

      if (snap.empty) {
        window._officeFeeApprovalDocs = [];
        tbody.innerHTML =
          '<tr><td colspan="11" style="text-align:center;padding:18px;color:var(--text-light)">No records found.</td></tr>';
        return;
      }

      window._officeFeeApprovalDocs = snap.docs.slice().sort((a, b) => {
        const ta = a.data().createdAt?.toMillis
          ? a.data().createdAt.toMillis()
          : new Date(a.data().createdAt || 0).getTime();
        const tb = b.data().createdAt?.toMillis
          ? b.data().createdAt.toMillis()
          : new Date(b.data().createdAt || 0).getTime();
        return tb - ta;
      });

      tbody.innerHTML = window._officeFeeApprovalDocs
        .map((d) => {
          const t = d.data();
          const receiptCell = t.receiptUrl
            ? `<div style="font-family:monospace;font-size:12px">${t.receiptNo || "—"}</div>
               <a href="${t.receiptUrl}" target="_blank" rel="noopener"
                  style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;font-size:11px;color:var(--primary);text-decoration:none;background:rgba(99,102,241,.08);padding:3px 8px;border-radius:6px;border:1px solid var(--primary)">
                 <i class="fas fa-image"></i> View Receipt
               </a>`
            : `<span style="font-family:monospace;font-size:12px">${t.receiptNo || "—"}</span>`;

          const statusInfo =
            t.status === "approved"
              ? `<span class="badge badge-success">Approved</span>
                 <div style="font-size:11px;color:var(--text-light);margin-top:3px">by ${t.approvedBy || "Admin"}</div>`
              : t.status === "rejected"
              ? `<span class="badge badge-danger">Rejected</span>`
              : `<span class="badge badge-warning">Pending</span>`;

          const printBtn =
            t.status === "approved"
              ? `<button onclick="printFeeReceipt('${d.id}')" style="padding:3px 8px;font-size:11px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer" title="Print Receipt"><i class="fas fa-receipt"></i> Receipt</button>`
              : "";

          return `<tr>
            <td style="font-size:12px">${t.date || "—"}</td>
            <td><strong>${t.studentName || "—"}</strong></td>
            <td>${clsLabel(t.studentClass)}</td>
            <td style="font-weight:700">${fmtINR(t.amount)}</td>
            <td style="font-size:12px">${t.paymentMode || "—"}</td>
            <td>${receiptCell}</td>
            <td style="font-size:12px">${fmtINR(t.balanceBefore)}</td>
            <td style="font-size:12px;font-weight:700;color:var(--accent-dark)">${fmtINR(t.balanceAfter)}</td>
            <td style="font-size:12px">${t.staffName || "—"}</td>
            <td>${statusInfo}</td>
            <td>${printBtn}</td>
          </tr>`;
        })
        .join("");
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--danger)">❌ ${e.message}</td></tr>`;
    }
  };

  window.filterOfficeFeeApprovals = function () {
    const q = (document.getElementById("o-txn-search")?.value || "")
      .toLowerCase()
      .trim();
    document.querySelectorAll("#o-fee-txn-tbody tr").forEach((tr) => {
      tr.style.display =
        !q || tr.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  };
})();
