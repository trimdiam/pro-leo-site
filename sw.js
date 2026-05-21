const CACHE = 'sfs-v19';
const SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/theme-modular.css',
  '/notification-center.css',
  '/script.js',
  '/auth-core.js',
  '/shared.js',
  '/config.js',
  '/sibling-system.js',
  '/notification-center.js',
  '/assets/images/logo.webp',
  '/back-button.js'
];

// Install — pre-cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// Activate — delete old caches, take control immediately
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => {
      self.clients.claim();
      // Tell all open tabs that a new version is active
      self.clients.matchAll({ type: 'window' }).then(clients =>
        clients.forEach(c => c.postMessage({ type: 'SW_UPDATED', version: CACHE }))
      );
    })
  );
});

// Fetch strategy
self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Never intercept: Firebase API calls, Firestore, Auth, Storage
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebasestorage.googleapis.com') ||
    url.hostname.includes('fcm.googleapis.com')
  ) {
    return; // let browser handle natively
  }

  // HTML pages — network first, fall back to cache
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Everything else — cache first, update in background
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(request).then(cached => {
        const network = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => {});
        return cached || network;
      })
    )
  );
});
