// Dagdeep service worker: network first (always fresh after a deploy), cache as an offline fallback.
const CACHE = "dagdeep-v1";
const CORE = ["./", "index.html", "quest.css", "quest-engine.js", "flows.js", "game-kit.js", "course-spark-games.js", "firebase-config.js", "auth.js", "manifest.webmanifest", "img/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;   // Firebase, fonts etc. go straight to the network
  e.respondWith(fetch(req).then(res => {
    if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, {ignoreSearch:true}).then(r => r || (req.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
