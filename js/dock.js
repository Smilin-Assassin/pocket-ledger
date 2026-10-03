// Navigation that feels alive.
// Phones: a floating dock with a liquid highlight (tap, or hold and slide across it), the + in the
// middle, and always 4 or 6 tabs so it stays symmetrical. Pages that don't fit live under More.
// Wide screens: the side menu, with the same liquid highlight moving up and down.
import { $, esc } from "./util.js";
import { ctx, state, ui, openBills } from "./store.js";
import { go, currentPage, onRoute } from "./shell.js";
import { refreshLens } from "./glass.js";
import { M, PAGES, Spring, clock, params, reduced, buzz, ease, applyEase, measureHz } from "./motion.js";

export const NAMES = { home: "Home", entries: "Entries", loans: "Loans", bills: "Bills", goals: "Goals", settings: "Settings", more: "More", admin: "Admin" };
const ABOUT = { home: "This month at a glance", entries: "Everything you've added", loans: "Money lent and borrowed", bills: "Bills and reminders", goals: "Savings goals", settings: "Your details, groups, appearance", admin: "People and spaces" };
const ICON = {
  home: '<path class="fill" fill="currentColor" stroke="none" d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/><path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1z"/>',
  entries: '<rect class="fill" x="3" y="3" width="18" height="18" rx="5" fill="currentColor" fill-opacity=".22" stroke="none"/><path d="M8 7.5h9M8 12h9M8 16.5h9"/><circle cx="5" cy="7.5" r=".6" fill="currentColor"/><circle cx="5" cy="12" r=".6" fill="currentColor"/><circle cx="5" cy="16.5" r=".6" fill="currentColor"/>',
  loans: '<circle class="fill" cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".22" stroke="none"/><path d="M3 12h4l3-3 4 4 3-3h4"/><path d="M7 16.5 10 19l3-2.5M14 7.5 17 5l3 2.5"/>',
  bills: '<rect class="fill" x="4" y="5" width="16" height="16" rx="2" fill="currentColor" fill-opacity=".22" stroke="none"/><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>',
  goals: '<circle class="fill" cx="12" cy="12" r="8.5" fill="currentColor" fill-opacity=".22" stroke="none"/><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  settings: '<circle class="fill" cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".22" stroke="none"/><circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  more: '<rect class="fill" x="3" y="3" width="18" height="18" rx="5" fill="currentColor" fill-opacity=".22" stroke="none"/><circle cx="6.5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="17.5" cy="12" r="1.4" fill="currentColor"/>',
  admin: '<path class="fill" fill="currentColor" fill-opacity=".22" stroke="none" d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/><path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z"/>'
};
export const icon = (p, size) => `<svg width="${size || 22}" height="${size || 22}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[p]}</svg>`;

const phoneMQ = window.matchMedia("(max-width: 899.98px)");
const isPhone = () => phoneMQ.matches;
// Glass (Apple look): labels under every icon, the + sits in its own circle beside the bar
export const isGlass = () => document.documentElement.getAttribute("data-preset") === "glass";
const minTab = () => isGlass() ? 44 : 46, slot = () => isGlass() ? 72 : 62, pad = () => isGlass() ? 32 : 24;
// Settings › Text size zooms the page; screen measurements must be divided by it
export const zoom = () => { const z = parseFloat(getComputedStyle(document.body).zoom); return z > 0 ? z : 1; };
const layoutWidth = () => Math.min(window.innerWidth / zoom(), 560);
// 6 tabs only when each still gets a comfortable thumb-sized target
export function fitsSix() { const w = layoutWidth() - pad() - 12 - slot(); return Math.floor(w / minTab()) >= 6; }
export const dockPages = () => (M.tabs === 6 && fitsSix()) ? PAGES.slice() : M.dock.concat("more");
const tabFor = p => { const l = dockPages(); return l.includes(p) ? p : "more"; };

let dock, blob, tabs = [];

// ---------- building the dock ----------
export function buildDock() {
  dock = $("dock"); if (!dock) return;
  const list = dockPages(), half = list.length / 2, cur = tabFor(currentPage());
  const btn = p => `<button class="dk-tab${cur === p ? " on" : ""}" type="button" data-p="${p}" aria-label="${NAMES[p]}"${cur === p ? ' aria-current="page"' : ""}>${icon(p)}<span class="lbl">${NAMES[p]}</span><i class="badge" data-badge="${p}" hidden></i></button>`;
  dock.innerHTML = `<i class="dk-blob" id="dkBlob"></i><div class="dk-half">${list.slice(0, half).map(btn).join("")}</div><div class="dk-slot" aria-hidden="true"></div><div class="dk-half">${list.slice(half).map(btn).join("")}</div>`;
  dock.dataset.n = list.length;
  blob = $("dkBlob"); tabs = [...dock.querySelectorAll(".dk-tab")];
  const per = (layoutWidth() - pad() - 12 - slot()) / list.length;
  dock.classList.toggle("tight", per < 64 && !isGlass());
  setMin(false);
  renderMore(); dockBadges();
  requestAnimationFrame(() => { aim(); L.snap(); R.snap(); H.snap(); paint(); });
}
export function dockBadges() {
  if (!dock) return;
  renderMore();
  const n = state.ready ? openBills(ui.view).length : 0, red = n && openBills(ui.view).some(b => b.level === "red");
  const setB = (p, on, txt, cls) => { const b = dock.querySelector(`[data-badge="${p}"]`); if (!b) return false; b.hidden = !on; b.textContent = txt || ""; b.className = "badge" + (cls ? " " + cls : ""); return true; };
  const settingsDot = !$("settingsBadge").hidden;
  const billsShown = setB("bills", !!n, String(n), red ? "red" : "");
  const setShown = setB("settings", settingsDot, "", "dot");
  setB("more", (!billsShown && n) || (!setShown && settingsDot), "", "dot");
}

// ---------- More: pages that aren't in your dock ----------
function renderMore() {
  const box = $("moreList"); if (!box) return;
  const inDock = dockPages(), hidden = PAGES.filter(p => !inDock.includes(p)).concat(ctx.admin ? ["admin"] : []);
  box.innerHTML = hidden.map(p => `<button class="more-item" type="button" data-more="${p}"><span class="mi-ic">${icon(p)}</span><span><b>${NAMES[p]}</b><small>${esc(ABOUT[p])}</small></span><svg class="mi-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`).join("")
    || `<p class="hint">Every page is in your dock.</p>`;
}

// ---------- the liquid highlight ----------
const L = new Spring(0), R = new Spring(0), H = new Spring(1);
let scrub = false, keepUntil = 0;
const INSET = 5;
function aim() {
  if (scrub || !dock) return;
  const el = tabs.find(t => t.dataset.p === tabFor(currentPage())); if (!el) return;
  // layout positions (not screen positions): unaffected by text-size zoom or transforms
  L.t = el.offsetLeft + INSET; R.t = el.offsetLeft + el.offsetWidth - INSET;
}
function tune() {
  const { k, zeta, trail } = params();
  const right = (L.t + R.t) / 2 > (L.x + R.x) / 2, lead = right ? R : L, follow = right ? L : R;
  lead.k = k * 1.15; lead.z = zeta; follow.k = k * trail * trail; follow.z = Math.min(1.2, zeta + (1 - trail) * .25);
  H.k = k * 1.4; H.z = zeta * .8;
}
function paint() {
  if (!blob) return;
  const rest = Math.max(10, R.t - L.t), w = Math.max(10, R.x - L.x), st = Math.max(0, w - rest) / rest;
  H.t = 1 - Math.min(.32, st * .5);
  blob.style.width = w.toFixed(2) + "px";
  blob.style.transform = `translate3d(${L.x.toFixed(2)}px,0,0) scaleY(${H.x.toFixed(4)})`;
}
const dockClock = clock((dt, now) => {
  if (!dock || !isPhone()) return false;
  aim(); tune(); L.run(dt); R.run(dt); H.run(dt); paint();
  return !(L.idle() && R.idle() && H.idle() && !scrub && now > keepUntil);
});
function kick() {
  if (reduced()) { aim(); L.snap(); R.snap(); H.t = 1; H.snap(); paint(); setTimeout(() => { aim(); L.snap(); R.snap(); paint(); }, 200); return; }
  dockClock.kick();
}

// ---------- side menu (wide screens): the same liquid, vertical ----------
const T = new Spring(0), B = new Spring(0);
let navBlob = null;
function aimNav() {
  const nav = $("nav"), a = nav && nav.querySelector(`a[data-nav="${currentPage()}"]`);
  if (!a || a.offsetParent === null) return false;
  T.t = a.offsetTop; B.t = a.offsetTop + a.offsetHeight; return true;
}
const navClock = clock(dt => {
  if (isPhone() || !navBlob) return false;
  const has = aimNav(); navBlob.style.opacity = has ? 1 : 0;
  const { k, zeta, trail } = params(), down = (T.t + B.t) / 2 > (T.x + B.x) / 2, lead = down ? B : T, follow = down ? T : B;
  lead.k = k * 1.15; lead.z = zeta; follow.k = k * trail * trail; follow.z = Math.min(1.2, zeta + (1 - trail) * .25);
  T.run(dt); B.run(dt);
  const h = Math.max(8, B.x - T.x), rest = Math.max(8, B.t - T.t), sq = 1 - Math.min(.18, Math.max(0, h - rest) / rest * .3);
  navBlob.style.height = h.toFixed(2) + "px";
  navBlob.style.transform = `translate3d(0,${T.x.toFixed(2)}px,0) scaleX(${sq.toFixed(4)})`;
  return !(T.idle() && B.idle());
});
function kickNav(snap) {
  if (!navBlob) return;
  if (snap || reduced()) { if (aimNav()) { T.snap(); B.snap(); } }
  navClock.kick();
}

// ---------- pages slide in the direction you moved ----------
const rank = p => p === "more" ? 6.5 : p === "admin" ? 7 : PAGES.indexOf(p);
let prevPage = "";
function onPage(id, first) {
  if (first && prevPage && !reduced()) {
    const el = document.querySelector(`.page[data-page="${id}"]`);
    if (el && el.animate) {
      const dir = rank(id) >= rank(prevPage) ? 1 : -1;
      el.animate(isPhone() ? [{ transform: `translate3d(${dir * 42}px,0,0)`, opacity: 0 }, { transform: "none", opacity: 1 }]
        : [{ transform: `translate3d(0,${dir * 14}px,0)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 460, easing: ease() });
    }
  }
  prevPage = id;
  if (dock) {
    const cur = tabFor(id);
    tabs.forEach(t => { const on = t.dataset.p === cur; t.classList.toggle("on", on); if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
    keepUntil = performance.now() + 1100; kick();
  }
  kickNav(!first);
}

// ---------- tap, or hold and slide across to scrub ----------
let press = null;
function wireDock() {
  dock.addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    press = { x: e.clientX, id: e.pointerId, moved: false, over: tabs.findIndex(t => t.dataset.p === tabFor(currentPage())) };
    try { dock.setPointerCapture(e.pointerId); } catch {}
  });
  dock.addEventListener("pointermove", e => {
    if (!press || e.pointerId !== press.id || minned) return;
    if (!press.moved && Math.abs(e.clientX - press.x) < 8) return;
    press.moved = true; scrub = true;
    const d = dock.getBoundingClientRect(), x = (e.clientX - d.left) / zoom(), half = Math.max(22, tabs[0].offsetWidth / 2);
    L.t = x - half; R.t = x + half;
    let over = press.over, best = 1e9;
    tabs.forEach((t, i) => { const dist = Math.abs(t.offsetLeft + t.offsetWidth / 2 - x); if (dist < best) { best = dist; over = i; } });
    if (over !== press.over) { tabs.forEach((t, i) => t.classList.toggle("hover", i === over)); press.over = over; buzz(5); }
    kick();
  }, { passive: true });
  const release = e => {
    if (!press || e.pointerId !== press.id) return;
    const p = press; press = null; scrub = false;
    tabs.forEach(t => t.classList.remove("hover"));
    // tapping the shrunken bar opens it back up, like iOS
    if (minned) { if (e.type !== "pointercancel") { setMin(false); buzz(6); } return; }
    const i = p.moved ? p.over : tabs.findIndex(t => { const r = t.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 12 && e.clientY <= r.bottom + 12; });
    if (e.type !== "pointercancel" && i >= 0) pick(tabs[i].dataset.p);
    kick();
  };
  dock.addEventListener("pointerup", release);
  dock.addEventListener("pointercancel", release);
  // keyboard (Enter / Space on a tab)
  dock.addEventListener("click", e => { if (e.detail === 0) { const t = e.target.closest(".dk-tab"); if (t) pick(t.dataset.p); } });
}
// ---------- Glass: the bar shrinks to the current tab while you scroll down (iOS 26) ----------
// 0 = full bar, 1 = just the current tab. While your finger is moving the page, the bar moves with it
// (one update per screen frame, however many scroll events arrive). Holding still keeps it exactly
// where it is. Only once you let go and the page stops does it glide on a spring, carrying on at the
// speed you were going, to the end you were heading for (or the closer end if you'd stopped).
const TRAVEL = 70;                       // px of scrolling for a full shrink or grow
let minned = false, prog = 0, pend = 0, vel = 0, mode = "", touching = false, lastMove = 0;
const S = new Spring(0);                 // works in 0..100 so the spring's rest threshold is fine-grained
const dockOn = () => isGlass() && isPhone();
function setProg(v) {
  v = Math.max(0, Math.min(1, v));
  const w = $("dockWrap"); if (!w || v === prog) return;
  const was = prog; prog = v; w.style.setProperty("--p", v.toFixed(4));
  const m = v > .5; if (m !== minned) { minned = m; w.classList.toggle("dk-min", m); }
  // the highlight is faded out while the bar is changing; put it back on the tab once fully open
  // (reading the layout only here, not every frame, keeps the motion cheap)
  if (v === 0 && was > 0 && dock && !scrub) { aim(); L.snap(); R.snap(); paint(); }
  if (v === 0 || v === 1) refreshLens("dock");            // Android: redraw the lens for the new size
}
const progClock = clock((dt, now) => {
  if (pend) {                                            // following the finger
    const next = Math.max(0, Math.min(1, prog + pend / TRAVEL)); pend = 0;
    const v = (next - prog) / Math.max(dt, 1 / 240);
    vel = vel * .4 + v * .6; mode = "follow"; lastMove = now; setProg(next);
    return;
  }
  if (mode === "follow") {
    vel *= Math.pow(.02, dt);                            // finger held still: the speed dies away
    if (touching || now - lastMove < 90) return touching ? false : undefined;
    // let go and the page has stopped: glide, starting at the speed it was moving
    const aim1 = prog + vel * .18, t = window.scrollY > 80 && aim1 > .5 ? 1 : 0;
    S.x = prog * 100; S.v = Math.max(-900, Math.min(900, vel * 100)); S.t = t * 100; mode = "glide";
  }
  if (mode === "glide") {
    S.k = 260; S.z = .9; S.run(dt); setProg(S.x / 100);
    if (S.idle()) { S.snap(); setProg(S.t / 100); mode = ""; vel = 0; return false; }
    return;
  }
  return false;
});
function glideTo(t) {
  if (!dockOn()) t = 0;
  pend = 0; S.x = prog * 100; S.v = 0; S.t = t * 100; mode = "glide";
  if (reduced()) { S.snap(); setProg(t); mode = ""; return; }
  progClock.kick();
}
function setMin(on) { glideTo(on ? 1 : 0); }
function onScrollDock(dy, y) {
  if (!dockOn()) { if (prog) glideTo(0); return; }
  if (y <= 8) { if (prog) glideTo(0); return; }        // back at the top: always the full bar
  if (reduced()) { if (Math.abs(dy) > 4) glideTo(dy > 0 && y > 80 ? 1 : 0); return; }
  pend += dy; progClock.kick();
}
addEventListener("touchstart", () => { touching = true; }, { passive: true });
const lift = () => { touching = false; if (mode === "follow") { lastMove = performance.now(); progClock.kick(); } };
addEventListener("touchend", lift, { passive: true });
addEventListener("touchcancel", lift, { passive: true });
function pick(p) {
  buzz(8);
  if (p === tabFor(currentPage()) && (p !== "more" || currentPage() === "more")) { window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" }); return; }
  go(p);
}

export function initDock() {
  applyEase();
  dock = $("dock");
  const nav = $("nav");
  navBlob = document.createElement("i"); navBlob.className = "nav-blob"; navBlob.setAttribute("aria-hidden", "true"); nav.prepend(navBlob);
  buildDock(); wireDock();
  // badges are set elsewhere (requests, bills): mirror them on the dock
  const mo = new MutationObserver(() => dockBadges());
  ["settingsBadge", "billsBadge"].forEach(id => { const el = $(id); if (el) mo.observe(el, { attributes: true, attributeFilter: ["hidden"] }); });
  onRoute(onPage);
  let lastY = window.scrollY;
  addEventListener("scroll", () => { const y = window.scrollY, dy = y - lastY; lastY = y; if (dy) onScrollDock(dy, y); }, { passive: true });
  addEventListener("hashchange", () => { setMin(false); lastY = window.scrollY; });
  document.addEventListener("click", e => { const b = e.target.closest("[data-more]"); if (b) go(b.dataset.more); });
  let rz = 0, wasPhone = isPhone(), lastW = window.innerWidth;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => {
    // the phone's keyboard opening changes only the height: leave the dock alone
    if (window.innerWidth === lastW && isPhone() === wasPhone) return;
    lastW = window.innerWidth; wasPhone = isPhone(); buildDock(); kickNav(true);
  }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { aim(); L.snap(); R.snap(); paint(); kickNav(true); });
  // measure the screen's refresh rate once the app has settled (shown in Settings › Appearance)
  setTimeout(() => { if (document.visibilityState === "visible") measureHz(); }, 1500);
}
export function motionChanged() { applyEase(); buildDock(); keepUntil = performance.now() + 900; kick(); kickNav(); }
