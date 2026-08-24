'use strict';

const CACHE_NAME = 'it-stock-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/app.js',
  '/js/firebase.js',
  '/js/store.js',
  '/js/ui.js',
  '/js/views.js',
  '/js/conflict.js',
  '/js/export.js',
  '/js/telegram.js',
  '/js/missions.js',
  '/js/receivers.js',
  '/manifest.json',
  '/assets/icon.png',
  '/assets/icon-192.svg',
  '/assets/icon-512.svg',
];

const CDN_ASSETS = [
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-database-compat.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
  'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js',
  'https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap',
];

/* ============================================================
   Install — cache static assets
   ============================================================ */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        // Cache static assets (skip errors)
        return Promise.allSettled([
          cache.addAll(STATIC_ASSETS),
          ...CDN_ASSETS.map(url =>
            fetch(url)
              .then(response => {
                if (response.ok) {
                  return cache.put(url, response);
                }
              })
              .catch(() => console.log('[SW] Failed to cache:', url))
          )
        ]);
      })
      .then(() => {
        console.log('[SW] Install complete');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Install failed:', err);
      })
  );
});

/* ============================================================
   Activate — clean old caches
   ============================================================ */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activate complete');
        return self.clients.claim();
      })
  );
});

/* ============================================================
   Fetch — network first, fallback to cache
   ============================================================ */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip Firebase realtime database requests (always go to network)
  if (url.hostname.includes('firebaseio.com')) return;

  // Skip Firebase SDK requests (allow stale cache for these)
  if (url.hostname.includes('gstatic.com') && url.pathname.includes('firebase')) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          const fetchPromise = fetch(request)
            .then(response => {
              if (response.ok) {
                const cloned = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
              }
              return response;
            })
            .catch(() => cached);

          return cached || fetchPromise;
        })
    );
    return;
  }

  // Network first, fallback to cache for everything else
  event.respondWith(
    fetch(request)
      .then(response => {
        // Cache successful responses
        if (response.ok && url.origin === self.location.origin) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, cloned));
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache
        return caches.match(request)
          .then(cached => {
            if (cached) return cached;

            // For navigation requests, return cached index.html
            if (request.mode === 'navigate') {
              return caches.match('/index.html');
            }

            return new Response('Offline', { status: 503, statusText: 'Offline' });
          });
      })
  );
});

/* ============================================================
   Background Sync (for future use)
   ============================================================ */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync triggered');
    // Future: sync pending data to Firebase
  }
});

/* ============================================================
   Push Notifications (for future use)
   ============================================================ */
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || 'IT Stock', {
        body: data.body || 'มีข้อมูลใหม่',
        icon: '/assets/icon.png',
        badge: '/assets/icon.png',
        tag: 'it-stock-notification',
      })
    );
  }
});