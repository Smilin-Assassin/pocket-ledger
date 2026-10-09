// Starts the money screens once app.js has signed you in and picked a space.
import { $, toast } from "./util.js";
import { ctx, state, connect, onChange, lastSeenMark } from "./store.js";
import { registerPage, initShell, renderShell, route, go } from "./shell.js";
import { page as home } from "./pages/home.js";
import { page as entries, focusAdd, showCategory, showReview, needsLook } from "./pages/entries.js";
import { page as loans } from "./pages/loans.js";
import { page as bills } from "./pages/bills.js";
import { page as goals } from "./pages/goals.js";
import { page as settings, checkRequests } from "./pages/settings.js";
import { page as admin } from "./pages/admin.js";
import { initScan, openScanPicker, handleFiles, initStatements } from "./scan.js";
import { initCategories } from "./categories.js";
import { initPicker } from "./picker.js";
import { initSwipe } from "./swipe.js";
import { initChat, openChat, startRec } from "./chat.js";
import { initLock } from "./lock.js";
import { refreshPush } from "./notify.js";
import { initNag, renderNag } from "./backup.js";
import { aiReady } from "./gemini.js";
import { initTransfers, checkTransfers } from "./transfers.js";
import { initDock, dockBadges, buildDock } from "./dock.js";
import { initQuick, openQuick } from "./quick.js";
import { initGlass } from "./glass.js";
import { initSmart, setAddFn, setLookFn, setNeedsLook } from "./smart.js";

// a screenshot shared into the app from another app (Android share sheet)
async function takeSharedFiles() {
  if (!/[?&]shared=1/.test(location.search)) { try { if (window.caches) caches.delete("pl-share"); } catch {} return; }
  history.replaceState(null, "", location.pathname + location.hash);
  try {
    const c = await caches.open("pl-share"), files = [];
    for (const k of await c.keys()) { const r = await c.match(k), b = await r.blob(); files.push(new File([b], decodeURIComponent(k.url.split("/").pop()) || "shared.jpg", { type: b.type || "image/jpeg" })); await c.delete(k); }
    if (!files.length) return;
    if (!aiReady() && !files.some(f => /csv/i.test(f.type || "") || /\.csv$/i.test(f.name || ""))) { toast("Set up Gemini in Settings to read shared files."); return; }
    handleFiles(files);
  } catch { toast("Couldn't open the shared image."); }
}
// long-press shortcuts on the app icon
function handleShortcut() {
  const act = new URLSearchParams(location.search).get("action");
  if (!act) return;
  history.replaceState(null, "", location.pathname + location.hash);
  const show = (title, sub, btn, fn) => {
    $("quickTitle").textContent = title; $("quickSub").textContent = sub; $("quickGo").textContent = btn; $("quick").hidden = false;
    $("quickGo").onclick = () => { $("quick").hidden = true; fn(); };
  };
  if (act === "scan") show("Scan file(s)", "Receipts, screenshots or a bank statement.", "Pick files or take a photo", openScanPicker);
  else if (act === "voice") show("Talk to Pocket Ledger", "Say what happened, like \"Spent 85 on coffee\".", "Start talking", () => { openChat(); startRec(); });
  else if (act === "chat") openChat();
  else if (act === "add") { if (matchMedia("(max-width: 899.98px)").matches) openQuick(); else focusAdd("expense"); }
}

export function boot(fb) {
  [["home", home], ["entries", entries], ["loans", loans], ["bills", bills], ["goals", goals], ["settings", settings], ["admin", admin], ["more", { init() {}, render() { dockBadges(); } }]].forEach(([id, p]) => { registerPage(id, p); p.init(); });
  initShell(); initDock(); initGlass(); initQuick(); initScan(); initStatements(); initCategories(); initPicker(); initSwipe(); initTransfers(); initChat(); initLock(); initNag();
  setAddFn(pre => focusAdd("expense", null, pre)); setLookFn(showReview); setNeedsLook(needsLook); initSmart(showCategory);
  $("quickX").addEventListener("click", () => { $("quick").hidden = true; });
  document.addEventListener("click", ev => { const b = ev.target.closest("[data-go-add]"); if (b) focusAdd("expense"); const c = ev.target.closest("[data-cat-go]"); if (c) showCategory(c.dataset.catGo, c.dataset.meal); });
  // a notification was tapped while the app was open: go to its page
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener("message", ev => { const h = ev.data && ev.data.go; if (h && /^[a-z/]+$/.test(h)) location.hash = h; });
  connect(fb);
  $("app").hidden = false;
  let wasAdmin = null;
  onChange(() => { renderShell(); renderNag(); if (wasAdmin !== !!ctx.admin) { wasAdmin = !!ctx.admin; buildDock(); } dockBadges(); });
  route();
  try { const m = sessionStorage.getItem("pl-join-msg"); if (m) { sessionStorage.removeItem("pl-join-msg"); setTimeout(() => toast(m), 800); } } catch {}
  (function waitReady() {
    if (state.ready) { takeSharedFiles(); handleShortcut(); refreshPush(); checkRequests(); checkTransfers(); lastSeenMark(); }
    else setTimeout(waitReady, 300);
  })();
  window.PL = { go, ctx, state };
}
