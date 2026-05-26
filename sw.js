const CACHE = 'sfs-1779822646104';

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
  '/auth-core.js',
  '/shared.js',
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
    await Promise.all(SHELL.map(url =>
      fetch(url, { cache: 'reload' })
        .then(r => r.ok && cache.put(url, r))
        .catch(() => {})
    ));
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
        const res = await fetchWithTimeout(request, 3000);
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      } catch (_) {
        const cached = await cache.match(request) || await cache.match('/index.html');
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
