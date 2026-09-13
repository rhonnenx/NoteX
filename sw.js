/* NoteX service worker — offline shell cache.
   Bump CACHE when shipping a new version; the activate step drops older ones. */
const CACHE = 'notex-v3';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Individually, so one 404 can't abort the whole install.
    await Promise.all(CORE.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app document: network first, so a redeploy is picked up while online,
  // falling back to the cached copy when offline.
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch {
        // Hosts disagree on the document's URL: a dev proxy might rewrite to
        // an extensionless path, GitHub Pages serves index.html at the
        // directory root, etc. Try the plausible shapes so offline works
        // regardless of where this ends up deployed.
        const c = await caches.open(CACHE);
        for (const cand of [req, './index.html', './', './notex.html', './notex']) {
          const hit = await c.match(cand, { ignoreSearch: true });
          if (hit) return hit;
        }
        return new Response('Offline and no cached copy available.',
          { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Icons, manifest and web fonts: cache first, fetch and store on miss.
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      const cacheable = res.ok
        && (url.origin === location.origin || FONT_HOSTS.includes(url.hostname));
      if (cacheable) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
