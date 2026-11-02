// Service worker: gjør at appen åpner raskt og virker uten nett.
// Øk versjonsnummeret når du vil tvinge alle til å hente nye filer.
const VERSION = "fk-v2";
const SHELL = [
  "./", "index.html", "styles.css", "app.js", "config.js", "manifest.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png",
];
const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Egne filer: prøv nettet først (så endringer i GitHub slår inn), ellers cache
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html"))),
    );
    return;
  }

  // Supabase-biblioteket: cache, slik at appen starter også uten nett
  if (req.url === LIB) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req).then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; });
        return hit || net;
      }),
    );
  }
  // Alt annet (selve kalenderdataene) går rett til Supabase og caches ikke her.
});
