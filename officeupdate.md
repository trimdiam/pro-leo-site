# Office Portal + Performance Update Log
**Date:** 2026-06-01

---

## PART 1 — OFFICE PORTAL IMPROVEMENTS

---

## 1. Upcoming Holidays — Calendar Card Sync
**Commit:** `f8df6cf`

The Upcoming Holidays card on the teacher dashboard previously read from individually declared holiday documents. It now reads from the same `holidays/school_calendar` document that powers the Calendar Card — so both stay in sync automatically.

---

## 2. Reports — Date Range Filter + CSV Export
**Commit:** `9aa63ef`

- Added **From / To date pickers** to the Reports section — filter transactions by any date range alongside the existing status filter
- Added **Export CSV** button — downloads all currently visible report rows as `fee-report-{date}.csv`
- Query limit raised from 60 to 200 to support larger exports

---

## 3. Monthly Collection PDF
**Commit:** `14d7c67`

A **PDF button** on the Reports tab generates a printable A4 monthly collection report using jsPDF. Includes:
- School name + address header
- Period label and generated timestamp
- Summary bar — total transactions, approved count, total ₹ collected
- Full table with Date, Student, Class, Amount, Mode, Receipt No., Staff, Status
- Colour-coded rows — Approved / Pending / Rejected
- Footer with total approved amount and all-transactions total
- Page numbers on every page

**How to use:** Set From/To date → Refresh → click PDF.

---

## 4. Admission Fee Payment
**Commit:** `cc92a7f`

- Public admission form now includes a required **Admission Fee Payment** section — amount, payment mode (Cash/UPI/Cheque/NEFT), and transaction reference number
- Payment data saved to the admissions document: `admissionFee`, `admissionFeeMode`, `admissionFeeRef`, `admissionFeeStatus`
- Office admissions list shows a **Fee Payment badge** per row — ⏳ Pending / ✅ Verified / ❌ Failed
- Detail panel allows office staff to update payment status and save

---

## 5. Fee Approvals — Live Search
**Commit:** `8b60265`

Added a **search box** to the Fee Approvals section. Type any student name or class to instantly filter rows — no extra Firestore queries, just real-time DOM filtering.

---

## 6. Printable Fee Receipt PDF
**Commit:** `0b52117`

After approving a payment, a green **🧾 Receipt** button appears on the row. Clicking it downloads an A5 PDF receipt containing:
- School name + address header
- Receipt No. and date
- Student name, class, student ID
- Fee type, payment mode, amount paid
- Balance before and balance after
- Approved by, status (green highlighted)
- Parent signature and Authorised Signatory lines
- "Computer-generated receipt" footer

Receipt button appears in both the **Fee Approvals** table and the **Recent Transactions** dashboard widget.

---

## 7. WhatsApp Dues Reminder — Improvements
**Commit:** `81256bf`

- **Fixed message** — now clearly states fee type and outstanding amount instead of the incorrect "awaiting approval" wording
- **Reminder count** — a `2×`, `3×` badge tracks how many times each student has been reminded
- **Remind All button** — opens WhatsApp for all students with numbers in the current filtered list (600ms stagger to avoid popup blocking), marks all as reminded automatically
- **No-number fallback** — students without a WhatsApp number now show a **Copy No.** button instead of a dead label
- `markReminded` now increments `remindCount` via Firestore `increment()`

---

## 8. Fee Structure — Academic Year Lock + Bulk Fee Confirmation
**Commit:** `30fc886`

### Fee Structure Year Lock
- Added a required **Academic Year** field (e.g. `2025-26`) to the fee structure form
- Saving over a different year's structure shows a warning: *"Overwrite AY 2024-25 with AY 2025-26?"*
- AY badge displayed on every row in the structure list
- Edit button now prefills the year field and scrolls the form into view

### Bulk Fee Confirmation Screen
Before recording bulk payments, staff now see a confirmation summary:
- Number of students selected
- Fee type and payment mode
- Total amount
- List of student names and individual amounts (up to 10, then "…and N more")
- Explicit confirmation required before any records are written

---

## PART 2 — PERFORMANCE IMPROVEMENTS

---

## 9. Service Worker — Faster Cache Fallback
**Commit:** `afad882`

Reduced HTML fetch timeout in the Service Worker from **3000ms → 1200ms**. On slow networks the browser now falls back to the cached page 1.8 seconds faster instead of waiting the full 3 seconds.

JS/CSS/images were already stale-while-revalidate (serve from cache instantly, update in background) — unchanged.

---

## 10. Lazy-Load jsPDF On Demand
**Commit:** `f6a5765`

Removed jsPDF (~500KB library) from the portal startup bundle. It now loads **only when a PDF button is actually clicked** for the first time.

- Students never download it (they never print PDFs)
- Teachers only download it if they print attendance
- Office staff download it on first PDF click only
- Subsequent clicks use the already-cached version

All 4 PDF functions updated to `await window._ensureJsPDF()` before proceeding.

---

## 11. Debounce Heavy Search Filters
**Commit:** `46806ab`

Added 200ms internal debounce to `srFilter` (Student Records search) and `filterTAList` (Teacher Assignment search) — both re-render entire DOM lists from scratch on every keystroke. Now they wait until typing stops before re-rendering.

All other search filters (show/hide DOM rows only) were already fast enough — left unchanged.

---

## 12. Bug Fix — srExport Async
**Commit:** `9433088`

`srExport` was not marked `async` but contained `await window._ensureJsPDF()` — caused a `SyntaxError: Unexpected reserved word` that crashed `app-logic.js` and broke login. Fixed by adding `async` to the function declaration.

---

## 13. CLS Fix — Image Dimensions + Font Display
**Commit:** `6db0810`

Fixed Cumulative Layout Shift (CLS) from **0.613 → 0**:

- Added `width="36" height="36"` to nav logo — browser reserves space before image loads, no layout jump
- Added `width="96" height="96"` to login page logo — same reason
- Added `fetchpriority="high"` to nav logo — browser fetches it first (LCP candidate)
- Changed Google Fonts `display=swap` → `display=optional` — eliminates font-swap layout shift on slow mobile entirely. Repeat visitors (most users) still get custom fonts from cache.

---

## Final Performance Scores

| Tool | Metric | Score |
|---|---|---|
| GTmetrix | Grade | **B** |
| GTmetrix | Performance | **75%** |
| GTmetrix | Structure | **95%** |
| GTmetrix | LCP | **1.0s** ✅ |
| GTmetrix | CLS | **0** ✅ |
| GTmetrix | TBT | **50ms** ✅ |
| PageSpeed | Score (mobile) | **58** |
| PageSpeed | CLS | **0** ✅ |
| WebPageTest | FCP | **1.032s** ✅ |
| WebPageTest | LCP | **1.032s** ✅ |

**At 8–15 Mbps (school network):** First load ~0.3–0.6s, repeat visits near-instant via SW cache.

---

## Deployment
All commits pushed to GitHub (`main` branch) and deployed to Firebase Hosting.
**Live URL:** https://st-francis-school-a3e7e.web.app
