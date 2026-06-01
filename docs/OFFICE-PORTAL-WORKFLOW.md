# Office Portal — Workflow Documentation

**Project:** St. Francis De Sales Secondary School — Student Management App  
**Portal:** Office Staff  
**Last Updated:** 2026-06-01  

---

## Overview

The Office Portal is the primary fee management and admissions intake interface for school office staff. It connects directly with the Admin Portal — office staff submit data and admins approve, reject, or send back decisions. Office staff receive admin decisions via the Notifications inbox.

---

## Login & Access

1. Staff goes to the school app and selects **Office Staff** role.
2. Enters their **Office Staff Login ID** (assigned by Admin) and password.
3. On successful login, the Office Dashboard loads with live stats.

> Admin must create the office staff user account and assign role `office` or `office_staff` before login is possible.

---

## 1. Dashboard (`o-dashboard`)

**What it shows on load:**

| Stat Card | Source |
|-----------|--------|
| Pending Approvals | `fee_transactions` where `status == pending` and `source == office` |
| Today's Entries | Transactions logged today by this office |
| ₹ Collected Today | Sum of today's `approved` office transactions |
| Approved Today | Count of today's approved entries |
| ₹ Collected This Month | Monthly running total |
| ₹ Total Outstanding | Sum of all pending fee balances |

The bottom of the dashboard shows a **Recent Transactions** table (last 10 office entries).

---

## 2. Fee Collection (`o-fee-collection`)

**Purpose:** Record a student's fee payment against their balance.

### Steps:
1. Search for a student by name, roll number, or student ID.
2. Student card loads showing: name, class, total fee, amount paid, balance due.
3. Fill in the payment form:
   - **Amount** — payment received
   - **Payment Mode** — Cash / Cheque / Online / DD
   - **Receipt No.** — manual receipt number (auto-generated if blank)
   - **Date** — defaults to today
   - **Notes** — optional remarks
4. Click **Save Payment**.

### What happens on save:
- A `fee_transactions` document is created with `source: "office"`, `status: "approved"`.
- Student's `feePaid` and `feeBalance` fields in `students` collection are updated immediately.
- A printable fee receipt PDF can be generated from the transaction.

> Payments recorded here are **auto-approved** by the office — they do not go to admin for approval. Only `adminAddFeeRecord()` entries (admin-side manual entries) go through an approval queue.

---

## 3. Fee Structure (`o-fee-structure`)

**Purpose:** Set or update the annual fee structure for each class.

### Steps:
1. Select the **Class** from the dropdown.
2. Enter the **Academic Year** (e.g. `2025-26`).
3. Fill in fee components:
   - Annual Fee (required)
   - Tuition Fee
   - Exam Fee
   - Sports Fee
   - Annual Charge
   - Notes (optional)
4. Click **Save Fee Structure**.

### Conflict protection:
- If a fee structure already exists for a different academic year for that class, a **confirmation prompt** appears before overwriting.
- Every save stamps `updatedBy` (staff name) and `updatedByRole: "office"`.
- Admin can see in their fee structure list who last edited each class — office entries show a **purple tag**, admin entries show a **blue tag**.

> Both Admin and Office can edit the same `fee_structure/{classId}` document. Last write wins — always confirm the academic year before saving.

---

## 4. Fee Approvals (`o-fee-approvals`)

**Purpose:** View status of fee transactions submitted by this office.

### What it shows:
- Only transactions where `source == "office"` are displayed.
- Filter by: **Pending / All / Approved / Rejected**
- Search by student name or class.

### Row information:
| Column | Description |
|--------|-------------|
| Date | Transaction date |
| Student | Name |
| Class | Student's class |
| Amount | Fee amount |
| Mode | Cash / Cheque / Online / DD |
| Receipt No. | With link to receipt image if uploaded |
| Bal. Before / After | Student balance before and after payment |
| Logged By | Staff name |
| Status | Pending / Approved / Rejected badge |
| Actions | Print receipt (for approved entries) |

> Office staff cannot edit or delete their own transactions from this view — only admin can do that.

---

## 5. Dues & Reminders (`o-dues`)

**Purpose:** View students with outstanding/pending fees and send WhatsApp reminders.

### Filters available:
- **Class** — filter by class
- **Fee Type** — filter by type of fee
- **Status** — Pending + Rejected / Pending Only / Rejected Only
- **Source** — All Sources / Office Only / Admin Only / Student Portal

### Row information:
| Column | Description |
|--------|-------------|
| Student | Name + ID + source tag (purple=Office, blue=Admin, teal=Student Portal) |
| Class | Student class |
| Fee Type | Type of due |
| Due Amount | Outstanding amount |
| Status | Pending badge |
| Reminders | How many times reminded |
| Last Reminded | Date of last reminder |
| Action | WhatsApp Remind button (opens wa.me link) |

### Reminding:
- Click **Remind** on a row — opens WhatsApp with a pre-filled message to the parent.
- Clicking Remind marks the transaction as reminded and increments `remindCount`.
- **Remind All** button sends WhatsApp reminders to all visible students at once.

---

## 6. Admissions (`o-admissions`)

**Purpose:** Review, process, and forward new admission applications to Admin.

### Admission List:
- Shows all admission applications filtered by status (pending / forwarded / all).
- Each row shows: applicant name, class applied, date submitted, admission fee badge, status badge.

### Viewing an Application:
1. Click **View** on any row to open the full admission detail form.
2. The form shows all applicant details: name, DOB, gender, class applied, parent info, contact, address, documents.

### Admission Fee Verification:
- Office can record the **admission fee amount**, **payment mode**, **reference number**, and set `admissionFeeStatus`:
  - `pending_verification` — fee submitted but not checked
  - `verified` — fee confirmed received
  - `failed` — payment bounced or failed

### Forwarding to Admin:
1. After reviewing the application and verifying the fee, click **Forward to Admin**.
2. This sets the admission `status` to `forwarded_to_admin`.
3. An `admin_notifications` document is created — Admin sees the forwarded count badge in their sidebar.
4. The action is written to the shared `audit_log`.

### Receiving Admin's Decision:
- Once Admin approves, rejects, or sends back the application, office staff receives a notification in the **Notifications** inbox.
- Application status in the list updates to: `Admitted`, `Rejected`, or back to `pending` (sent back).

---

## 7. Notifications (`o-notifications`)

**Purpose:** Receive decisions and messages from Admin.

### Notification types:
| Type | Trigger | Colour |
|------|---------|--------|
| `admission_decision` — Approved | Admin approves a forwarded admission | Green |
| `admission_decision` — Rejected | Admin rejects a forwarded admission | Red |
| `admission_sent_back` | Admin sends application back to office with reason | Amber |

### Actions:
- Click the **✓** icon on a notification to mark it as read.
- Click **Mark All Read** to clear all unread notifications.
- The red badge count on the sidebar button shows unread count.

---

## 8. Reports (`o-reports`)

**Purpose:** Generate and download fee collection reports.

### Transaction Report:
- Filter by: **Fee Type**, **Date Range** (From / To), **Class**
- Shows all fee transactions matching the filter.
- Download as **CSV** or **PDF**.

### Class-wise Summary:
- Select a class to see a summary of total fees, collected amount, and outstanding balance for all students in that class.

---

## 9. My Profile (`o-profile`)

**Purpose:** View and update office staff profile.

- View: name, login ID, email, role.
- Change password.

---

## Data Flow Summary

```
Office Staff
    │
    ├── Records Fee Payment ──────────────────────► fee_transactions (source: office, status: approved)
    │                                                students (feePaid + feeBalance updated)
    │
    ├── Sets Fee Structure ───────────────────────► fee_structure/{classId} (updatedByRole: office)
    │                                                audit_log
    │
    ├── Forwards Admission ───────────────────────► admissions (status: forwarded_to_admin)
    │                                                admin_notifications
    │                                                audit_log
    │
    └── Receives Decision ◄──────────────────────── office_notifications (written by Admin)
              │
              ├── Approved ── admissions (status: Admitted)
              ├── Rejected ── admissions (status: Rejected)
              └── Sent Back ─ admissions (status: pending) + sentBackReason
```

---

## Firestore Collections Used

| Collection | Office Can Read | Office Can Write |
|------------|----------------|-----------------|
| `fee_transactions` | ✅ | ✅ |
| `fee_structure` | ✅ | ✅ |
| `students` | ✅ | ✅ |
| `admissions` | ✅ | ✅ (update only) |
| `admin_notifications` | ✅ | ✅ |
| `office_notifications` | ✅ | ✅ |
| `audit_log` | ❌ | ✅ (create only) |
| `fee_queries` | ✅ | ✅ (update only) |

---

## Key Rules & Constraints

- Office staff **cannot delete** fee transactions — only Admin can.
- Office staff **cannot approve/reject** admissions — only forward to Admin.
- Fee payments recorded via **Fee Collection** are auto-approved (no admin queue).
- Fee records added via **Admin's** fee form go through an approval queue visible in Fee Approvals.
- Fee structure edits are **last-write-wins** — coordinate with Admin on academic year.
- All office actions that touch admissions or fee structure are written to the shared `audit_log`.
