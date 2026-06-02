# Session Summary — 2026-06-02
## Push notifications: multi-account double-notification fix + styling quick wins

---

## 1. BUG FIXED — multi-account double push notifications

**Symptom:** Logging into Teacher A on a device, logging out, then logging into Teacher B
caused **both** accounts to receive pushes (e.g. a period reminder arrived twice on one phone),
even after logging out of the first account.

**Root cause:** On logout the device's FCM-token delete was *fire-and-forget* and raced
`signOut()`. `firestore.rules` only allows writing `users/{uid}` when `request.auth.uid == uid`,
so when `signOut()` won the race the delete was **denied (permission error, silently swallowed)**
and the token stayed on the old account. After switching accounts the same device token lived on
**both** user docs → every push was delivered twice (the senders had no token-level dedup).

**Fix — commit `ae3cbb6`, DEPLOYED + VERIFIED on the APK:**
- `capacitor-push.js`: `clearFcmTokenForUid()` now **returns its promise**; the `window.logout`
  wrapper **awaits it before sign-out**, with a 2.5 s cap so logout never hangs offline.
  **⚠️ DO NOT revert this to fire-and-forget.**
- `functions/index.js`: added `dedupeByToken(messages, refs)` and applied it before **every**
  `sendEach` (`periodEndReminder`, `triggerPeriodReminder`, `runDailyRoutine`) so a transiently
  shared token can't double-send. (Note: dead-token cleanup does NOT fix a *shared* token — it's
  still valid, just double-owned.)

**Verification:** logged in as Michael on the phone → token `✓ present`; logged out → token
`❌ none`. The present→none flip across a real logout confirms the fix live on the APK.

**Data cleanup (done):** ran an admin-console snippet that finds device tokens shared by 2+
accounts and clears all but the newest holder. Results:
- token `…0wRIltyomWBU` — kept **Anando Pohtam**, cleared **Michael Pamthet**
- token `…9Bfy4FhWtvNY` — kept **(no name — stale signup)**, cleared **ALVINSON MAWRIE**

---

## 2. FEATURE — notification styling "quick wins" (THIS commit — NOT yet deployed)

Both ship via `firebase deploy --only hosting,functions` — **no APK rebuild**.

- **Foreground card** (`capacitor-push.js`, new `showRichPushCard(notification)`): when a push
  arrives while the app is **open**, render a glassmorphic card (school logo `logo.webp`, brand
  accent `#8b6f47`, title + body with line breaks preserved, dark-mode aware, auto-dismiss 6 s,
  **tap-to-deep-link** using the same routing as the OS notification) instead of the old plain
  toast. Falls back to the toast on any error.
- **Background styling** (`functions/index.js`):
  - `color: "#8b6f47"` (brand accent) on **every** push — `sendPush` helper (attendance / notice /
    leave / message) **and** the teacher multicast (period / daily routine).
  - `imageUrl: …/assets/images/hero1.webp` (150 KB) big-picture on period & daily-routine pushes.
    **⚠️ `hero1.jpg` is 2.1 MB — over FCM's ~1 MB cap — so we use the `.webp`. Keep any replacement < ~300 KB.**

---

## Brand / asset facts (for future work)
- Brand accent: **`#8b6f47`** (warm brown, `--accent` in `styles.css`); dark accent `#6b5030`.
- Logo: `assets/images/logo.webp` (11 KB). Hero photos: `hero*.webp` = 150–243 KB (usable),
  `hero*.jpg` = 2–3 MB (too big for FCM).
- Hosting base URL: `https://st-francis-school-a3e7e.web.app`

---

## TO CONTINUE (next steps)
1. **Deploy the styling:** `firebase deploy --only hosting,functions`. (The bug fix is already
   live; the styling in this commit is **not** deployed yet.)
2. **Tier-2 notification polish** (needs native changes → **APK rebuild**):
   - Custom monochrome **status-bar small icon** (currently the default square).
   - **Large-icon avatar** (teacher photo / school crest on the right).
   - **Tappable action buttons** ("View Schedule" / "Dismiss").
   - **Custom notification sound** file.
3. **Replace `hero1.webp`** with a purpose-made ~2:1 notification banner (< ~300 KB) under
   `assets/images/`, then update the two `imageUrl`s in `functions/index.js`.
4. **Web push styling:** the foreground card covers in-app; **background web** notifications are
   styled in the service worker (`firebase-messaging-sw.js` → `showNotification` icon/image/badge/
   actions) — not yet touched.
5. **Optional data hygiene:** delete the stale "(no name)" signup user doc that the cleanup left
   holding a token, plus the known duplicate teacher docs (Michael Pamthet ×2, Queency Mawrie ×2).

---

## Reference
- Memory (`.claude`): push-architecture contract updated with the logout-await rule + `dedupeByToken`.
- Commits: **`ae3cbb6`** (bug fix — deployed/verified) · **this commit** (styling — pending deploy).
- Deploy command for both: `firebase deploy --only hosting,functions`.
