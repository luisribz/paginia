/* Paginia service worker — offline app shell + cover cache (v1.9.1)
   Shell: network-first for everything same-origin (updates keep arriving the moment
   you're online), falling back to the cached copy when offline. API calls (Open Library,
   Google Books, GitHub) are NOT intercepted — the app handles those failing gracefully.
   Covers: any cross-origin image is cached the first time it loads (cache-first from
   then on — snappier online, visible offline), capped at 800 with oldest-out eviction.
   Mirrors Episotia's sw.js. */
const CACHE = "paginia-shell-v1";
const IMG = "paginia-img-v1";
const IMG_MAX = 800;
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192-v4.png", "./icon-512-v4.png", "./apple-touch-icon-v4.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== IMG).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cacheKey(req){
  const u = new URL(req.url);
  u.search = "";                      // "?v=1.9.0" cache-busting reloads must hit the same entry
  return u.href;
}

self.addEventListener("fetch", e => {
  if(e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  if(url.origin === location.origin){
    // app shell: network-first, cache fallback
    e.respondWith(
      fetch(e.request).then(r => {
        if(r.ok){
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(cacheKey(e.request), copy));
        }
        return r;
      }).catch(() =>
        caches.open(CACHE).then(c => c.match(cacheKey(e.request), { ignoreSearch: true }))
          .then(m => m || (e.request.mode === "navigate" ? caches.match("./index.html") : Promise.reject(new Error("offline"))))
      )
    );
    return;
  }

  if(e.request.destination === "image"){
    // covers: cache-first (full URL as key — "?default=false" matters), evict oldest past the cap
    e.respondWith(
      caches.open(IMG).then(c =>
        c.match(e.request.url).then(m => m || fetch(e.request).then(r => {
          if(r.ok || r.type === "opaque"){       // cross-origin <img> responses are opaque — cache them anyway
            const copy = r.clone();
            c.put(e.request.url, copy)
              .then(() => c.keys())
              .then(ks => { if(ks.length > IMG_MAX) return Promise.all(ks.slice(0, ks.length - IMG_MAX).map(k => c.delete(k))); })
              .catch(() => {});
          }
          return r;
        }))
      )
    );
  }
  // everything else cross-origin (OL/GB/GitHub JSON) passes through untouched
});
