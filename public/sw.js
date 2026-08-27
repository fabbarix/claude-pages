/* Offline support for a site whose whole premise is "no signal needed", and
   the fetch handler Chrome looks for when deciding a site is installable.

   Bump CACHE when the caching rules below change; entries from older versions
   are dropped on activate. */
const CACHE = "scorecard-v1";
const SHELL = "/index.html";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* Navigations go to the network first so a new deploy is picked up on the
     next launch; the cached shell is only used when the network fails. */
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(SHELL, fresh.clone());
        return fresh;
      } catch (_) {
        const cached = await caches.match(SHELL);
        return cached || Response.error();
      }
    })());
    return;
  }

  /* Build output under /assets/ carries a content hash in its filename, so a
     cache hit can never be a stale version of the file. */
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const fresh = await fetch(req);
      if (fresh.ok) (await caches.open(CACHE)).put(req, fresh.clone());
      return fresh;
    })());
    return;
  }

  /* Icons, manifest and the like keep stable names, so prefer the network and
     fall back to the cache offline rather than pinning an old copy. */
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok) (await caches.open(CACHE)).put(req, fresh.clone());
      return fresh;
    } catch (_) {
      const cached = await caches.match(req);
      if (cached) return cached;
      throw new Error("offline and not cached: " + url.pathname);
    }
  })());
});
