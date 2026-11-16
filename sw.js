// Pocket Ledger service worker: makes the app open offline and installable.
const VERSION = "pl-v75";
const SHELL = ["./", "./index.html", "./app.js", "./config.js", "./manifest.webmanifest", "./css/app.css",
  "./js/main.js", "./js/util.js", "./js/store.js", "./js/actions.js", "./js/shell.js", "./js/gemini.js", "./js/scan.js", "./js/chat.js",
  "./js/lock.js", "./js/notify.js", "./js/backup.js", "./js/transfers.js", "./js/motion.js", "./js/dock.js", "./js/quick.js", "./js/smart.js", "./js/categories.js", "./js/fold.js", "./js/picker.js", "./js/swipe.js", "./js/erase.js", "./js/delight.js", "./js/theme.js", "./js/arcade.js", "./js/splash.js",
  "./js/pages/home.js", "./js/pages/entries.js", "./js/pages/loans.js", "./js/pages/bills.js", "./js/pages/goals.js", "./js/pages/settings.js", "./js/pages/admin.js",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/favicon-32.png", "./icons/apple-touch-icon.png", "./icons/chat-bot.png"];

self.addEventListener("install", e => {
  // fetched fresh from GitHub (never the browser's own short-lived copy), so a release is saved whole: all new files or none
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  // the Firebase library and fonts saved by the last release are carried over (they are versioned by their own address),
  // so the app still opens offline straight after an update; then the old release's files are removed
  e.waitUntil((async () => {
    const now = await caches.open(VERSION);
    for (const k of (await caches.keys()).filter(k => k !== VERSION && k !== "pl-share")) {
      try {
        const old = await caches.open(k);
        for (const r of await old.keys()) {
          if (!/(^|\.)gstatic\.com$|^fonts\.googleapis\.com$/.test(new URL(r.url).hostname) || await now.match(r)) continue;
          const res = await old.match(r); if (res) await now.put(r, res);
        }
      } catch (err) {}
      await caches.delete(k);
    }
    await self.clients.claim();
  })());
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
    // App files open from the copy saved with this release (v70), so the app starts at once, also on a weak signal.
    // An update is a new sw.js: it saves the whole new release, takes over, and the open page refreshes itself (app.js).
    // Anything not saved yet comes from the network and is kept; offline, a page that isn't saved falls back to the app itself.
    e.respondWith(caches.open(VERSION).then(c => c.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req, { cache: "no-cache" }).then(res => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }).catch(() => req.mode === "navigate" ? c.match("./index.html") : Response.error()))));
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
  const d = e.notification.data || {}, url = d.url || (d.FCM_MSG && d.FCM_MSG.data && d.FCM_MSG.data.url) || "./";
  const hash = (url.split("#")[1] || "");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    // the app is already open: bring it forward and go to the page the notification is about
    for (const c of list) { if ("focus" in c) { if (hash) c.postMessage({ go: hash }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
