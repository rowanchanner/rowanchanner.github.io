const CACHE_NAME = 'sharky-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/movie.html',
  '/tv.html',
  '/style.css',
  '/script.js',
  '/sharky-192.png',
  '/sharky-512.png'
];

// Install service worker and cache assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Activate service worker
self.addEventListener('activate', e => {
  e.waitUntil(self.clients.claim());
});

// Serve cached content when offline
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(response => response || fetch(e.request))
  );
});