Self-hosted copies of the Firebase v9 compat SDK, downloaded from
`https://www.gstatic.com/firebasejs/9.23.0/`, matching the version markentry.html
was already loading from the CDN.

Why: same-origin files get cached by `sw.js`'s fetch handler like any other
static asset (cache-first). A cross-origin CDN script only lives in the
browser's own HTTP cache, which can be evicted under storage pressure —
if that happens, an offline cold start on markentry.html fails before the
app even loads. Vendoring removes that dependency.

To update the SDK version: replace these 3 files with a matching version
downloaded from the same gstatic path, and update the version number in this
note. Do not touch other Firebase-loading pages (main app uses the modular
v9+ SDK via ES module imports from gstatic, not this compat bundle).
