/* ============================================================
   MyBudget Service Worker
   HOW TO PUSH UPDATES:
   Bump CACHE_NAME (e.g. mybudget-v1 → mybudget-v2)
   That's it — old cache is wiped, fresh files load.
   ============================================================ */

const CACHE_NAME = 'mybudget-v3';

const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

/* ── INSTALL: cache assets, activate immediately ── */
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(ASSETS).catch(err => console.warn('[SW] Pre-cache error:', err))
    )
  );
});

/* ── ACTIVATE: wipe all old caches ── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* ── FETCH ────────────────────────────────────────────────────────
   index.html  → Network-first (always gets the latest version)
                 Falls back to cache only when offline.
   Google Fonts → Cache-first with network fallback (caches both
                  the CSS and the actual .woff2 font files)
   Everything else (JS, icons) → Cache-first (fast loads)
   ---------------------------------------------------------------- */
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;

  const isHTML =
    event.request.destination === 'document' ||
    (event.request.headers.get('accept') || '').includes('text/html');

  /* Network-first for HTML — always gets latest index.html when online */
  if (isHTML) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() =>
          caches.match(event.request).then(cached => cached || caches.match('/index.html'))
        )
    );
    return;
  }

  /* Cache-first for Google Fonts (CSS + woff2 files) */
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(res => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        }).catch(() => cached); // silent fail if font unavailable offline
      })
    );
    return;
  }

  /* Cache-first for JS, CSS, icons, and everything else */
  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request).then(res => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      });
      return cached || networkFetch;
    })
  );
});

/* ── MESSAGE: allow page to trigger skipWaiting ── */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
