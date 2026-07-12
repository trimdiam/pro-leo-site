const CACHE = 'sfs-1783835473614';

// App shell — pre-cached on install for fast cold-start.
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/theme-modular.css',
  '/notification-center.css',
  '/report-card-styles.css',
  '/portal-mobile-fix.css',
  '/session-coordinator.js',
  '/view-refresh.js',
  '/config.js',
  '/script.js',
  '/capacitor-push.js',
  '/capacitor-back.js',
  '/teacher-attendance-guard.js',
  '/rc-class-guard.js',
  '/homepage-content-fix.js',
  '/back-button.js',
  '/sibling-system.js',
  '/notification-center.js',
  '/app-logic.js',
  '/assets/images/logo.webp'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // A network FAILURE (fetch throws — e.g. a timeout on a slow cold start)
    // aborts the whole install so we never activate with a half-cached shell;
    // the previously-installed SW keeps serving. A 404 (file genuinely absent
    // from the deploy) is logged and skipped rather than bricking the SW.
    await Promise.all(SHELL.map(async url => {
      let r;
      try {
        r = await fetch(url, { cache: 'reload' });
      } catch (err) {
        throw new Error(`SW install aborted: network failure fetching ${url} — ${err.message}`);
      }
      if (!r.ok) { console.warn(`SW install: ${url} returned ${r.status}, skipping`); return; }
      await cache.put(url, r);
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => {
      self.clients.claim();
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE }))
      );
    })
  );
});

// Helper: race a network request against a timeout.
function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request).then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  const { request } = e;
  let url;
  try { url = new URL(request.url); } catch (_) { return; }

  // Never intercept Firebase backend APIs — they need direct browser handling.
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('fcm.googleapis.com')
  ) {
    return;
  }

  // Never intercept sub-apps — they use ES modules with dynamic imports that
  // a 503 fallback response will silently break. Let the browser handle them.
  if (url.pathname.startsWith('/routine-app/') || url.pathname.startsWith('/assessment-app/')) {
    return;
  }

  // Cross-origin (Firebase SDK CDN, fonts, FontAwesome): pass through to
  // browser. Intercepting these is fragile — opaque responses can break
  // module loading and we have no way to recover from a failed cross-origin
  // cache.put. Let the browser's native HTTP cache handle them.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Same-origin HTML: network-first with 3s timeout, fall back to cache.
  // Network-first means deploys are visible immediately; the cache fallback
  // protects against slow/no network on cold APK start.
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetchWithTimeout(request, 1200);
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      } catch (_) {
        // Offline / slow-network fallback. Match the SAME page ignoring the
        // query string: mark entry loads markentry.html?classId=…&subject=…
        // with a UNIQUE query per selection, so an exact (query-sensitive)
        // match almost always misses. Without ignoreSearch it fell through to
        // /index.html and rendered the homepage instead of the requested page.
        // Only fall back to /index.html for an actual root/home navigation.
        const cached =
          (await cache.match(request)) ||
          (await cache.match(request, { ignoreSearch: true })) ||
          ((url.pathname === '/' || url.pathname === '/index.html')
            ? await cache.match('/index.html')
            : null);
        if (cached) return cached;
        // Absolute last resort — return a minimal valid response so
        // respondWith doesn't error out.
        return new Response('<!doctype html><title>Offline</title>', {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    })());
    return;
  }

  // Same-origin static (JS/CSS/images): cache-first, update in background.
  // ALWAYS returns a valid Response so respondWith never breaks.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) {
      // Refresh in background
      fetch(request).then(res => { if (res && res.ok) cache.put(request, res.clone()); }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(request);
      if (res && res.ok) cache.put(request, res.clone());
      return res;
    } catch (_) {
      // Network failed AND no cache — return an error response rather than
      // undefined (which would cause respondWith to fail).
      return new Response('', { status: 503, statusText: 'Offline' });
    }
  })());
});
