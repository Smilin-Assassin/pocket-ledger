// Pocket Ledger service worker: makes the app open offline and installable.
const VERSION = "pl-v29";
const SHELL = ["./", "./index.html", "./app.js", "./config.js", "./manifest.webmanifest", "./css/app.css",
  "./js/main.js", "./js/util.js", "./js/store.js", "./js/actions.js", "./js/shell.js", "./js/gemini.js", "./js/scan.js", "./js/chat.js",
  "./js/lock.js", "./js/notify.js", "./js/backup.js", "./js/transfers.js", "./js/motion.js", "./js/dock.js", "./js/quick.js",
  "./js/pages/home.js", "./js/pages/entries.js", "./js/pages/loans.js", "./js/pages/bills.js", "./js/pages/goals.js", "./js/pages/settings.js", "./js/pages/admin.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/favicon-32.png", "./icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  // Screenshots shared to Pocket Ledger from other apps (Android share sheet).
  if (req.method === "POST" && new URL(req.url).pathname.endsWith("/share-target")) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const files = form.getAll("images").filter(f => f && f.size);
        const c = await caches.open("pl-share");
        for (const k of await c.keys()) await c.delete(k);
        let i = 0;
        for (const f of files.slice(0, 4)) await c.put(new Request("./shared/" + (i++) + "-" + encodeURIComponent(f.name || "image.jpg")), new Response(f, { headers: { "Content-Type": f.type || "image/jpeg" } }));
      } catch (err) {}
      return Response.redirect("./?shared=1", 303);
    })());
    return;
  }
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Live services (sign-in, database sync, scanning) always go to the network.
  if (/googleapis\.com$|firebaseio\.com$|firebaseapp\.com$/.test(url.hostname) && url.hostname !== "fonts.googleapis.com") return;
  if (url.origin === location.origin) {
    // App files: try the network first so updates arrive, fall back to the saved copy offline.
    // "no-cache" makes the browser check with GitHub every time, so a new release never mixes with old files.
    e.respondWith(fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }
  if (url.hostname === "www.gstatic.com" || url.hostname === "fonts.gstatic.com" || url.hostname === "fonts.googleapis.com") {
    // Versioned libraries and fonts: use the saved copy, fetch once if missing.
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});

// Notifications sent by the Pocket Ledger server (Firebase Cloud Messaging).
self.addEventListener("push", e => {
  let j = {};
  try { j = e.data ? e.data.json() : {}; } catch (err) { j = { notification: { title: "Pocket Ledger", body: e.data ? e.data.text() : "" } }; }
  const n = j.notification || {}, d = j.data || {};
  const title = n.title || d.title || "Pocket Ledger";
  e.waitUntil(self.registration.showNotification(title, {
    body: n.body || d.body || "", icon: "./icons/icon-192.png", badge: "./icons/icon-192.png",
    tag: d.kind || n.tag || "pocket-ledger", data: { url: d.url || (j.fcmOptions && j.fcmOptions.link) || "./" }
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) { if ("focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
