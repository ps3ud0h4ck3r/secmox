// SecMox service worker. Conservative by design: it makes the app installable and
// fast, and keeps a cached shell for offline, but it NEVER caches /api/ (auth'd,
// changing data) so nothing stale or private is served. Bump CACHE to roll it.

const CACHE = 'secmox-v2';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // always network, never cache

  // Page loads: network-first so content is fresh online, cached shell offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return r;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('/app/'))),
    );
    return;
  }

  // Static assets: stale-while-revalidate. Serve the cached copy at once (fast,
  // offline), but refresh it from the network in the background so a deploy is
  // picked up on the next load. Asset URLs are unhashed, so plain cache-first
  // would otherwise serve stale JS/CSS after a deploy.
  if (/\.(css|js|png|svg|ico|woff2?|webmanifest)$/.test(url.pathname)) {
    e.respondWith(
      caches.open(CACHE).then((c) =>
        c.match(req).then((cached) => {
          const network = fetch(req)
            .then((r) => {
              c.put(req, r.clone());
              return r;
            })
            .catch(() => cached);
          return cached || network;
        }),
      ),
    );
  }
});
