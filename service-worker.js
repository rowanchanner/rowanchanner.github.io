// CHANGE THIS NUMBER WHEN YOU UPDATE YOUR SITE
const CACHE_NAME = "sharky-cache-v3";

/* Only core shell files — do NOT cache pages aggressively */
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/movie.html",
  "/tv.html",
  "/style.css",
  "/script.js",
  "/sharky-192.png",
  "/sharky-512.png",
  "/manifest.json",
  "/favicon.png"
];

/* INSTALL — cache basic files */
self.addEventListener("install", event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
});

/* ACTIVATE — delete old caches automatically */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* FETCH — network first (ALWAYS gets latest site) */
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Update cache in background
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

/* Allow page to force activate new SW */
self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
