// sw.js - C:\MarvelApps\photohub\www\sw.js
// Photo Hub WEB VERSION (11/22): lets the site open offline and be added to the home screen like the Hubs. Network first (a new copy
// always wins when online), the saved copy only when offline. Only the app's own files are kept - never a photo (picked photos never
// leave the page). Registered by index.html only on the website, never inside the Android app.
// 11/22 cloud backup talks to another address (the backup service), which this file never touches - only same-site files are kept.
const CACHE = 'photohub-web-v14';   // v14 11/25: 0.7.8 Pets (phone app); v13 11/25: 0.7.7 swipe between photos; v12 11/25: 0.7.6 Notifications, Clean Up, Duplicates, Events; v11 11/24: 0.7.5 Share; v10 Trips;   // v10 11/24: 0.7.4 Trips; v9 Tags;   // v9 11/24: 0.7.3 Tags;   // v8 11/24: 0.7.2 - unbuilt tiles hidden, old wording fixed; v7: voicefill.js
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(fetch(req).then((r) => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {}); }
    return r;
  }).catch(() => caches.match(req).then((m) => m || caches.match('./index.html'))));
});
