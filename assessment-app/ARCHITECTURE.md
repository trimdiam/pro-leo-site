# SFDS Ecosystem — Architecture Documentation

## System Overview

Two independent frontends connected through a shared Firebase backend.

```
┌─────────────────────┐         ┌─────────────────────┐
│   pro-leo-site      │         │   assessment-app    │
│   (Main Portal)     │         │   (Academic Module) │
│                     │         │                     │
│  - Homepage         │         │  - Assessment Entry │
│  - Student Portal   │         │  - Analytics        │
│  - Teacher Portal   │         │  - Weak Students    │
│  - Admin Dashboard  │         │  - Monthly Summary  │
│  - Office Portal    │         │  - Student Profiles │
│                     │         │                     │
│  Firebase SDK 10.13 │         │  Firebase SDK 10.13 │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           └───────────────┬───────────────┘
                           │
              ┌────────────┴────────────┐
              │  Firebase Project:       │
              │  st-francis-school-a3e7e │
              │                          │
              │  - Firestore Database    │
              │  - Firebase Auth         │
              │  - Analytics             │
              └──────────────────────────┘
```

---

## Repository Rules

1. **Separate repositories** — no monorepo
2. **Separate frontends** — independent HTML/CSS/JS
3. **Separate deployments** — can deploy independently
4. **One shared Firebase project** — both connect to `st-francis-school-a3e7e`
5. **One shared Firestore database**
6. **One shared authentication ecosystem**

---

## Shared Collections

### Core Identity
| Collection | Purpose | Primary Key |
|------------|---------|-------------|
| `students` | Student records | `studentId` (pro-leo-site) / `student_id` (assessment-app) |
| `teachers` | Staff directory | `teacherId` |
| `users` | Auth-user role mapping | `uid` (Firebase Auth) |

### Assessment Intelligence (assessment-app writes, pro-leo-site reads)
| Collection | Purpose |
|------------|---------|
| `assessment_sessions` | Session data + marks |
| `monthly_analytics` | Aggregated class/subject/student stats |
| `weak_students` | Flagged students with concerns |
| `student_profiles` | Centralized academic intelligence |
| `attendance` | Attendance intelligence |
| `school_health` | Overall school academic health |

### School Operations (pro-leo-site manages)
| Collection | Purpose |
|------------|---------|
| `attendance_daily` | Daily attendance records |
| `attendance_monthly` | Monthly attendance snapshots |
| `fee_transactions` | Fee payments |
| `homework` | Homework assignments |
| `notices` | School notices |
| `events` | School events |
| `gallery` | Photo gallery |
| `announcements` | Homepage announcements |
| `admissions` | Admission applications |
| `contacts` | Contact form submissions |
| `leave_applications` | Leave requests |

---

## Firebase Configuration

### Shared Config (both apps)
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBXq3fe0uY8UB7-uLGzGIIvZOQf8YjNqaM",
  authDomain: "st-francis-school-a3e7e.firebaseapp.com",
  projectId: "st-francis-school-a3e7e",
  storageBucket: "st-francis-school-a3e7e.firebasestorage.app",
  messagingSenderId: "180123372524",
  appId: "1:180123372524:web:caed0f2a44d35f19d90ec9"
};
```

### SDK Version
- **Both apps use Firebase JS SDK 10.13.0**
- CDN imports only (no npm bundling)

---

## Authentication Architecture

### Login Flow
```
User enters Login ID + Password
        │
        ▼
  idToEmail() → normalizes to @stfrancis.school email
        │
        ▼
  signInWithEmailAndPassword() → Firebase Auth
        │
        ▼
  Lookup users/{uid} → get role
        │
        ▼
  If teacher → lookup teachers/{teacherId} → get name
        │
        ▼
  Persist {uid, email, name, role, teacherId} to localStorage
        │
        ▼
  Route to appropriate dashboard
```

### Role System
| Role | Collections Access |
|------|-------------------|
| `student` | Self profile, fees, homework, notices |
| `teacher` | Students (read), assessment_sessions (write), homework (write), attendance (write) |
| `office` | Students (read/write), fees (write), admissions |
| `admin` | All collections |
| `super_admin` | All collections + unlock locked months |

### Google Sign-In (pro-leo-site only)
- First-time Google users must self-link via Student ID
- Creates `users/{uid}` document with role = `student`
- Audit trail written to `newAccountLinks`

---

## Assessment App Data Flow

```
Teacher selects Class + Subject + Date
        │
        ▼
  loadStudentsForClass(className)
        ├── Firestore: query(students, where('class', '==', class))
        └── Fallback: local JSON files
        │
        ▼
  loadCriteriaForSubject(subject, class)
        ├── Fetch /data/criteria/{subject_id}.json
        └── Return criteria list
        │
        ▼
  createSession() → generate session_id
        │
        ▼
  Teacher marks students (tap-to-fill 0-5)
        │
        ▼
  saveSession() → localStorage (immediate) + Firestore (background)
        │
        ▼
  Admin reviews → update status (draft → submitted → reviewed → locked)
        │
        ▼
  Aggregation engine → monthly_analytics (computed, not stored yet)
        │
        ▼
  Weak student engine → flags students below thresholds
```

---

## Student Identity Normalization

### pro-leo-site stores:
```javascript
{
  studentId: "SFS/2025/001",  // Primary key
  name: "John Doe",
  class: "1",  // or "LKG", "SKG"
  section: "A",
  rollNo: "01",
  gender: "M",
  dob: "2015-03-15"
}
```

### assessment-app normalizes to:
```javascript
{
  student_id: "SFS/2025/001",  // Same value, different field name
  full_name: "John Doe",
  class: "1",
  section: "A",
  roll_no: "01",
  gender: "M",
  dob: "2015-03-15"
}
```

**Integration Note:** Phase 2 will align field names. For now, the `normalizeStudent()` function bridges the gap.

---

## LocalStorage Strategy (assessment-app)

| Key | Purpose |
|-----|---------|
| `sfds_assessment_sessions` | All session data (local cache) |
| `sfds_auth_user` | Current user {uid, email, name, role, teacherId} |
| `sf_remembered_id` | Remembered login ID (shared with pro-leo-site) |

### Sync Strategy
1. App init → `syncSessionsFromFirestore()` → merge remote into local
2. Teacher saves → write to localStorage immediately, Firestore in background
3. Demo sessions preserved (prefix: `demo_`)

---

## Security Rules Strategy

### Philosophy
- Students and teachers can read what they need
- Only admin/office can write to student records
- Assessment data: teachers write, all staff read
- Never hard-delete: use status transitions

### Key Rules
```
students/{docId}      → read: isAnyStaff(), write: isAdmin() || isOffice()
assessment_sessions   → read: isAnyStaff(), write: isTeacher() || isAdmin()
users/{uid}           → read/write: owner, read: admin
attendance_daily      → write: teacher/admin + month unlocked
```

---

## Mobile-First Design

- **Target:** Low-end Android devices
- **Input:** Large tap targets, minimal typing
- **Layout:** Single-column card-based UI
- **Performance:** LocalStorage cache for instant load, Firestore sync in background
- **Offline:** JSON fallbacks for all Firestore reads

---

## Future Expansion Architecture

### Prepared for:
| Feature | Architectural Readiness |
|---------|------------------------|
| Parent Portal | `users` collection supports `role: 'parent'`, student linking via `studentId` |
| PDF Report Cards | `student_profiles` will contain all needed data |
| Realtime Alerts | Firestore `onSnapshot` listeners ready |
| Push Notifications | Firebase Cloud Messaging config ready |
| Mobile App | Same Firebase backend, separate frontend possible |
| Realtime Analytics | `monthly_analytics` collection supports live aggregation |

---

## File Structure

```
assessment-app/
├── index.html
├── main.js                    # App state, routing, render
├── styles.css
├── PROJECT_STATUS.md          # Integration progress
├── ARCHITECTURE.md            # This file
├── ROADMAP.md                 # Future phases
├── data/
│   ├── criteria/              # JSON criteria per subject
│   ├── students/              # Local JSON fallbacks
│   └── subjects.json          # Subject registry
├── services/
│   ├── aggregation-engine.js
│   ├── analytics-engine.js
│   ├── assessment-engine.js
│   ├── attendance-engine.js
│   ├── auth-service.js        # Firebase Auth
│   ├── comparison-engine.js
│   ├── concern-engine.js
│   ├── criteria-loader.js
│   ├── demo-data-generator.js
│   ├── fast-entry-engine.js
│   ├── firebase-config.js     # Shared Firebase init
│   ├── firestore-service.js   # Firestore CRUD
│   ├── graph-data-engine.js
│   ├── monthly-insight-engine.js
│   ├── narrative-summary-engine.js
│   ├── school-health-engine.js
│   ├── session-review-engine.js
│   ├── session-storage.js     # LocalStorage + Firestore sync
│   ├── severity-engine.js
│   ├── student-loader.js      # Firestore students query
│   ├── student-profile-engine.js
│   ├── subject-loader.js
│   ├── totals-engine.js
│   ├── trend-engine.js
│   ├── weak-student-engine.js
│   └── weak-student-summary-engine.js
└── components/
    ├── analytics-dashboard.js
    ├── assessment-card.js
    ├── criteria-list.js
    ├── login-form.js
    ├── monthly-summary.js
    ├── quick-entry-grid.js
    ├── session-list.js
    ├── session-review.js
    ├── session-setup.js
    ├── session-toolbar.js
    ├── sticky-save-toolbar.js
    ├── student-profile.js
    ├── subject-selector.js
    └── weak-student-list.js
```
