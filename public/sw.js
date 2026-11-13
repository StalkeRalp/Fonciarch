/* global self, caches */
const CACHE = "fonciarch-pwa-ed4bbb393a81dc01";
const STATIC = ["/modeles/titres-vierge.xlsx", "/modeles/titres-exemple.xlsx", "/", "/application", "/offline.html", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/icon-32.png", "/icons/maskable-512.png", "/manifest.webmanifest", "/favicon.ico"];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const manifest = await fetch("/pwa-assets.json", { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("Liste des ressources PWA indisponible."); return r.json(); });
    const cache = await caches.open(CACHE);
    await cache.addAll([...STATIC, ...manifest.assets]);
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("fonciarch-pwa-") && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener("message", event => {
  if (event.data?.type === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("fetch", event => {
  const { request } = event;
  const url = new URL(request.url);
  // API, écritures et données métier : toujours le réseau, jamais le cache.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" && !url.pathname.startsWith("/modeles/")) {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(async cache => await cache.match(url.pathname.startsWith("/application") ? "/application" : "/") || await cache.match("/offline.html") || new Response("Hors connexion. Reconnectez-vous au serveur FONCIARCH.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }))));
    return;
  }
  if (STATIC.includes(url.pathname) || url.pathname.startsWith("/_next/static/")) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") { try { await cache.put(request, response.clone()); } catch { /* Un cache plein ne doit pas bloquer les ressources en ligne. */ } }
      return response;
    }));
  }
});
