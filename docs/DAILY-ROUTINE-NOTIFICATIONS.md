# Teacher Daily Routine Push Notifications

Sends every teacher a push on each school morning (**07:30** and **08:00 IST**)
containing their **complete timetable for today's Day Cycle**. Tapping it opens
the app on the teacher's *My Schedule* page (`t-schedule`).

Built on the existing routine + FCM infrastructure — it does **not** introduce a
second source of truth for the day cycle or for device tokens.

---

## Design decisions (confirmed)

| Decision | Choice |
|---|---|
| **Day Cycle source** | Read `settings/schoolDay.currentDay`. The job **never** advances it — the routine-app admin "day pills" remain the only writer. |
| **Working days** | Admin-configurable, default **Mon–Fri**. |
| **Holiday source** | A new **machine-readable** ISO-date list (`holidays/closures`). The existing human calendar (`holidays/school_calendar`) is display-only and not parsed. |

---

## Firestore schema

### 1. `settings/routineNotify` — feature config
Reuses the existing `settings/{docId}` rule (public read, admin write).
```jsonc
{
  "enabled": true,               // master on/off switch
  "workingDays": [1, 2, 3, 4, 5],// JS getDay(): 0=Sun … 6=Sat. Mon–Fri.
  "times": ["07:30", "08:00"],   // display only; real schedule is in the cron
  "updatedAt": "2026-05-31T…",
  "updatedBy": "<admin uid/name>"
}
```
> **Working-day encoding:** numbers are JavaScript `Date.getDay()` values in IST
> (0=Sunday). Mon–Fri = `[1,2,3,4,5]`. Add `6` for Saturday.

### 2. `holidays/closures` — machine-readable holiday dates
Reuses the existing `holidays/{docId}` rule (public read, admin write).
```jsonc
{
  "dates": ["2026-06-05", "2026-08-15", "2026-10-02"], // ISO YYYY-MM-DD, IST
  "updatedAt": "2026-05-31T…",
  "updatedBy": "<admin uid/name>"
}
```
If today's IST date is in `dates`, **no** reminders are sent.

### 3. `notification_logs/{autoId}` — audit trail (NEW collection)
Written only by Cloud Functions (Admin SDK). Admin-read, no client write.
```jsonc
{
  "type": "daily_routine",
  "slot": "07:30",               // "07:30" | "08:00" | "test"
  "date": "2026-05-31",          // IST date the run fired
  "day": 3,                      // day cycle that was sent
  "sent": 12,
  "failed": 1,
  "totalTeachers": 13,
  "skipped": false,
  "skipReason": null,            // disabled | not_working_day | holiday | no_day_set | no_routine | no_tokens
  "at": "2026-05-31T02:00:11Z"
}
```

### Existing collections consumed (unchanged)
- `settings/schoolDay` → `{ currentDay }` — today's Day Cycle (1–7).
- `routine/{day}/periods/{p}/slots/*` → `{ teacherInitials, subjectCode, className, slotType, … }`.
- `settings/periodTimings` → `{ period1:{start,end}, … }` — time slots.
- `subjects/*` → `{ code, name }`.
- `teachers/*` → `{ initials | routineInitials, teacherId | loginId, name }`.
- `users/*` → `{ teacherId, fcmToken, name }` — device token + identity.

---

## Runtime logic (implemented in Step 2)

```
07:30 / 08:00 IST  (cron, timeZone Asia/Kolkata)
  └─ load settings/routineNotify
       ├─ enabled == false?           → log skip(disabled), stop
       ├─ today getDay() ∉ workingDays → log skip(not_working_day), stop
       └─ today ∈ holidays/closures    → log skip(holiday), stop
  └─ read settings/schoolDay.currentDay  (no write)
       └─ missing?                      → log skip(no_day_set), stop
  └─ for each period p of currentDay: read slots, map teacherInitials → {period, subject, class, time}
  └─ accumulate per-teacher full-day list
  └─ resolve teacher initials → teacherId (teachers) → fcmToken (users)
  └─ build one FCM message per teacher (full-day body, data.screen="daily_routine")
  └─ fcm.sendEach(messages)
  └─ cleanupAfterMulticast()  — remove dead tokens (reused helper)
  └─ write notification_logs entry
```

**Notification shape**
- **Title:** `Today's Teaching Routine`
- **Body:** `Today is Day 3. Good morning, <FirstName>.` + each period line
  `P1 08:00–08:40 · Mathematics · Class VII`.
- **data:** `{ type:"daily_routine", screen:"daily_routine", day:"3" }`

---

## Deep-link (Step 3)
- **APK** (`capacitor-push.js`): `screen === "daily_routine"` → `navTeacherTo('t-schedule')`.
- **Web** (`firebase-messaging-sw.js`): `notificationclick` → focus/open app, route to `t-schedule`.

## Admin UI (Step 4)
Admin portal section: enable toggle · working-day checkboxes · holiday date
add/remove · **Send test now** (calls the `triggerDailyRoutine` callable).

## Device tokens
No new registration path. Teachers already get a token saved to `users.fcmToken`
via web auto-register (`app-logic.js`) or the APK (`capacitor-push.js`). A teacher
with no token is simply skipped (and logged). They enable once via the existing
**Enable Notifications** button in their profile.

---

## Testing (filled in at Step 5)
- Manual `triggerDailyRoutine` callable from the admin "Send test now" button.
- Holiday / working-day / disabled gates verified via `notification_logs`.
