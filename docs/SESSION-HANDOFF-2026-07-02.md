# Session Handoff — 2026-07-02

Read this first when resuming work on `pro-leo-site`. Everything below is **deployed and live** at https://st-francis-school-a3e7e.web.app unless marked otherwise — there's no "ask before deploying" backlog right now. What's NOT done is real-device confirmation (see bottom).

## Deployed today

1. **Marksheet TE-column fix (classes 3–8).** The consolidated class Marksheet (`Sfs-report-card/marksheet.js`) was only showing `IA | UT | Total` — the Term Exam mark (60/100) was saved correctly and shown correctly on the individual report card, but silently dropped from this one view. Fixed `buildHeader`/`buildRows`/`buildAverageRow` for the `standard` scheme (classes 3–8) only; classes 9–10 (`senior` scheme) deliberately untouched, confirmed intentional.

2. **Offline persistence for mark-entry**, built prior session, deployed today. `Sfs-report-card/firebase-init.js` — `enablePersistence({synchronizeTabs:true})`, sticky offline banner, staleness warning for split-subjects while offline.

3. **"Clear outdated" devices feature**, admin → Active Sessions → Devices & Logins (`single-session-admin.js`). Button with a **1 / 7 / 30-day dropdown** that deletes stale `device_registry` docs (non-online, older than threshold), confirms with exact count first.

4. **Cold-start-offline hardening** for mark-entry (`Sfs-report-card/markentry.html`):
   - Self-hosted the 3 Firebase compat SDK files into `vendor/firebase/` instead of loading from gstatic CDN — cross-origin CDN files aren't reliably cached by the service worker and can be evicted, breaking a true cold offline start.
   - Added `navigator.serviceWorker.register('/sw.js')` directly to markentry.html — previously it only worked because teachers reached it by clicking through from index.html (which registers the SW); a direct bookmark/deep link skipped registration entirely.

5. **Service worker HTML-fallback bug fix (`sw.js`).** Real bug the user found: clicking into mark entry and selecting a subject loaded the **homepage** instead of the mark grid, only on the first (slow/cold) load. Root cause: the offline/slow-network fallback matched pages by exact URL *including* the query string; mark entry uses a unique `?classId=…&subject=…` per selection, so the match missed and fell through to `/index.html`. Fixed with `cache.match(request, {ignoreSearch:true})`, and the `/index.html` fallback is now only used for an actual root navigation.

6. **Teacher-profile localStorage fallback (`markentry.js`).** Real bug found via the user's own proper offline test (Firefox DevTools → Network → Offline): "Error: Failed to get document because the client is offline" on the Teacher Dashboard. The teacher-lookup chain (`loadTeacherAndRoute`) does up to 5 sequential Firestore calls; whichever one resolved the account online wasn't reliably in mark-entry's own Firestore offline cache (likely because mark-entry's compat SDK and the main portal's modular SDK are separate Firebase client instances with separately-partitioned IndexedDB caches). Fixed by adding a `localStorage` cache-aside layer (`TEACHER_CACHE_KEY = 'sfs_me_teacher_' + uid`) — saves the resolved profile on every successful online resolution, falls back to it on any lookup failure. If truly nothing cached, shows an actionable message instead of the raw SDK error.

7. **`sf_session_role` fix (`markentry.js`).** The main portal (`app-logic.js`) only waits for Firebase Auth to restore (vs. giving up instantly and showing login) if a `sf_session_role` localStorage flag is set — previously only set by the main portal's own login form, never by mark-entry's independent login. Mark-entry now sets it too, on both fresh login and restored session.

8. **"Back to Portal" offline guard (`markentry.js`/`markentry.html`) — the important one.** Even with #7, real testing showed "Back to Portal" still bounced to the login screen while offline, because the button does a **full page reload** of index.html, which re-runs the ENTIRE main-portal bootstrap (Auth restore, then a large number of `app-logic.js`'s own dashboard-loading Firestore calls — 12,000+ lines, none audited for offline safety the way mark-entry has been). Rather than try to make that whole unaudited path offline-safe, `meBackToPortal()` now checks `navigator.onLine` first: **offline → refuses to navigate at all**, shows a clear message that entries are already saved and to keep working in mark entry; online → unchanged. This is the fix that actually keeps a teacher from getting stranded.

## Data changes made directly against live Firestore (not code deploys)
- **Assessment-app clean slate**: wiped `assessment_sessions` (16 docs), `student_profiles` (59 docs) — all confirmed demo/test data. Repo demo files/scripts left untouched (user's choice).
- **51-unassigned-subjects launch blocker**: user confirmed resolved (handled outside this session, not independently re-verified).

## Still open / not done
1. **Real-device confirmation is the big one.** Everything above was verified via code inspection + live browser simulation (Firefox DevTools offline mode, scripted Cache API / localStorage checks through Claude Preview MCP) — never on the actual Android APK, since I have no access to the native Capacitor project (it's not in this workspace) and no real teacher credentials. Best guess (not confirmed): the APK likely loads the site remotely rather than bundling it locally, since today's fixes went live via `firebase deploy` alone with no APK rebuild step — if true, everything above applies identically inside the app. Worth a real phone test: log in once online, airplane mode, force-close/reopen, confirm dashboard loads and "Back to Portal" behaves.
2. **SFSTEMPT01 (Anando Pohtam) teacher profile** — root cause diagnosed last session (missing `teachers` collection doc), user said they'd complete it themselves via Admin → Manage Teachers. Never confirmed back whether it worked.
3. **Two class teachers with contradictory class fields** — SFST002 (`classTeacher:"6"` vs `classTeacherOf:"X-A"`) and SFST005 (`classTeacher:"SKG"` vs `classTeacherOf:"VIII"`). Not touched.
4. **Optional polish, not done**: the "Back to Portal" button doesn't visually indicate it's disabled while offline — a teacher only finds out on click via the alert. Offered to the user, not requested yet.

## Known deferred items carried over (deliberate decisions, not bugs — don't "fix" without asking)
1. **CT co-scholastic override not locked down** — a class teacher can still edit/override a co-scholastic grade a subject teacher already entered.
2. **Split-subject submit-completeness is fuzzy** — CT dashboard's "X of Y submitted" counts a shared subject (Khasi/Alt-Eng, Val-Edu/Catechism) as done once EITHER teacher submits, not both.

## Reusable infrastructure (unchanged, still true)
- **Firestore emulator**: `firebase.json` has an `emulators` block. Start via PowerShell (not Git Bash) — Java PATH issue:
  ```
  $env:JAVA_HOME='F:\APK\jdk'; $env:Path="F:\APK\jdk\bin;$env:Path"; firebase emulators:start --only firestore --project st-francis-school-a3e7e
  ```
- **Browser-based verification**: `.claude/launch.json` (workspace root, `F:\11 HOUR\.claude\launch.json`) has `site-root` → `node pro-leo-site/assessment-app/tools/root-server.mjs` on port 4601, for the Claude Preview MCP tools. Used heavily today to verify SW/cache/localStorage behavior before every deploy.
- **Admin service-account access** (`serviceAccountKey.json` + `firebase-admin` in `pro-leo-site`) — used for direct Firestore read/delete scripts. Write throwaway inspection scripts into `scripts/`, run, then delete them — don't leave one-off scripts lying around.
- **A real limitation found today**: the Claude Preview MCP ties browser-tab lifecycle to the dev-server process — once the server is unreachable (however it dies, even killed externally by PID bypassing the tool's own stop function), `preview_eval` refuses to relay any further command to that tab. So a genuine "server down, page still loads from cache" test cannot be automated through this tool; it needs a human doing it manually (real airplane mode, or DevTools → Network → Offline).

## Next steps when resuming
1. Do the real phone test (see "Still open" #1) — this is the one thing that turns "code-complete" into "actually proven."
2. Check whether SFSTEMPT01's profile loads now.
3. Reconcile SFST002 / SFST005's class-teacher field mismatch when convenient.
4. Consider the two deferred items if either becomes a launch blocker.
