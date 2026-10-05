// Navigation that feels alive.
// Phones (v37): a floating bar with a curved dip; the current tab's icon rides in a round bubble that
// sits in the dip, its name in bold underneath. Tap a tab (or hold and slide across the bar) and the
// dip flows along the bar while the bubble springs over. The + sits in its own circle beside the bar.
// Always 4 or 6 tabs; pages that don't fit live under More.
// Wide screens: the side menu, with a liquid highlight moving up and down.
import { $, esc } from "./util.js";
import { ctx, state, ui, openBills } from "./store.js";
import { go, currentPage, onRoute } from "./shell.js";
import { refreshLens } from "./glass.js";
import { M, PAGES, Spring, clock, params, reduced, buzz, ease, applyEase, measureHz } from "./motion.js";

export const NAMES = { home: "Dashboard", entries: "Entries", loans: "Loans", bills: "Bills", goals: "Goals", settings: "Settings", more: "More", admin: "Admin" };
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
export const isGlass = () => document.documentElement.getAttribute("data-preset") === "glass";
// Settings › Text size zooms the page; screen measurements must be divided by it
export const zoom = () => { const z = parseFloat(getComputedStyle(document.body).zoom); return z > 0 ? z : 1; };
const layoutWidth = () => Math.min(window.innerWidth / zoom(), 560);
// 6 tabs only when each still gets a comfortable thumb-sized target (the + takes 62px plus a 10px gap)
export function fitsSix() { const w = layoutWidth() - 24 - 72 - 12; return Math.floor(w / 48) >= 6; }
export const dockPages = () => (M.tabs === 6 && fitsSix()) ? PAGES.slice() : M.dock.concat("more");
const tabFor = p => { const l = dockPages(); return l.includes(p) ? p : "more"; };

let dock, bar, line, bubble, bubIc, tabs = [], shown = "";

// ---------- building the bar ----------
export function buildDock() {
  dock = $("dock"); if (!dock) return;
  const list = dockPages(), cur = tabFor(currentPage());
  const btn = p => `<button class="dk-tab${cur === p ? " on" : ""}" type="button" data-p="${p}" aria-label="${NAMES[p]}"${cur === p ? ' aria-current="page"' : ""}>${icon(p)}<span class="lbl">${NAMES[p]}</span><i class="badge" data-badge="${p}" hidden></i></button>`;
  dock.innerHTML = `<div class="dk-bar" id="dkBar"></div><svg class="dk-line" aria-hidden="true"><path/></svg><span class="dk-bubble" id="dkBubble" aria-hidden="true"><span class="dk-bub-ic"></span></span><div class="dk-tabs">${list.map(btn).join("")}</div>`;
  dock.dataset.n = list.length;
  bar = $("dkBar"); line = dock.querySelector(".dk-line path"); bubble = $("dkBubble"); bubIc = bubble.firstChild; tabs = [...dock.querySelectorAll(".dk-tab")]; shown = "";
  renderMore(); dockBadges();
  requestAnimationFrame(() => { aim(); X.snap(); V.snap(); swapIcon(true); paint(); refreshLens("dock"); });
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

// ---------- More: pages that aren't in your bar ----------
function renderMore() {
  const box = $("moreList"); if (!box) return;
  const inDock = dockPages(), hidden = PAGES.filter(p => !inDock.includes(p)).concat(ctx.admin ? ["admin"] : []);
  box.innerHTML = hidden.map(p => `<button class="more-item" type="button" data-more="${p}"><span class="mi-ic">${icon(p)}</span><span><b>${NAMES[p]}</b><small>${esc(ABOUT[p])}</small></span><svg class="mi-go" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>`).join("")
    || `<p class="hint">Every page is in your bar.</p>`;
}

// ---------- the dip and the bubble ----------
// X: where the dip and bubble are (layout px across the bar, so text-size zoom doesn't matter).
// V: a lagging copy of X; the gap between them stretches the bubble sideways and lowers it a touch.
const X = new Spring(0), V = new Spring(0);
let scrub = false, keepUntil = 0;
const BUB = 50, GAP = 6, DIP_W = BUB / 2 + GAP, DIP_D = BUB / 2 + GAP, RR = 24;   // bubble size, gap around it, dip (a half circle), bar corner radius
function aim() {
  if (scrub || !dock) return;
  const el = tabs.find(t => t.dataset.p === tabFor(currentPage())); if (!el) return;
  X.t = el.offsetLeft + el.offsetWidth / 2;
}
function tune() { const { k, zeta, trail } = params(); X.k = k; X.z = zeta; V.k = k * trail * trail * .8; V.z = Math.min(1.1, zeta + .15); V.t = X.x; }
// the bar's outline: a rounded bar whose top edge dips smoothly around x = cx
// the dip is a half circle centred on the bar's top edge, a little wider than the bubble
const dipAt = (x, cx) => { const dx = Math.abs(x - cx); return dx >= DIP_W ? 0 : Math.sqrt(DIP_W * DIP_W - dx * dx); };
function outline(w, h, cx) {
  const top = x => {
    let y = dipAt(x, cx);
    if (x < RR) y = Math.max(y, RR - Math.sqrt(Math.max(0, RR * RR - (RR - x) * (RR - x))));
    if (x > w - RR) y = Math.max(y, RR - Math.sqrt(Math.max(0, RR * RR - (x - (w - RR)) * (x - (w - RR)))));
    return y;
  };
  const pts = [], add = x => pts.push(x.toFixed(1) + "," + top(x).toFixed(1));
  // fine steps in the corners and the dip, nothing in between (straight)
  for (let x = 0; x <= RR; x += 2) add(x);
  const a = Math.max(RR, cx - DIP_W), b = Math.min(w - RR, cx + DIP_W);
  // always end exactly on the dip's edges: stopping a step short left the rest of the bar slanting up to the corner
  if (a < b) { for (let x = a; x < b; x += 2) add(x); add(b); }
  for (let x = w - RR; x <= w; x += 2) add(x);
  add(w);
  return `M${pts.join(" L")} L${w},${h - RR} A${RR},${RR} 0 0 1 ${w - RR},${h} L${RR},${h} A${RR},${RR} 0 0 1 0,${h - RR} Z`;
}
let lastW = 0;
function paint() {
  if (!bar || !dock) return;
  const w = dock.offsetWidth, h = dock.offsetHeight; if (!w) return;
  lastW = w;
  const cx = Math.max(BUB / 2 + 2, Math.min(w - BUB / 2 - 2, X.x));
  // the bar is cut to this shape; the same shape is drawn as a thin rim so the dip shows on pale glass too
  const d = outline(w, h, cx); bar.style.clipPath = `path('${d}')`; if (line) line.setAttribute("d", d);
  const lag = X.x - V.x, st = Math.min(.22, Math.abs(lag) / 260);
  bubble.style.transform = `translate3d(${(cx - BUB / 2).toFixed(2)}px,${(st * 18).toFixed(2)}px,0) scale(${(1 + st).toFixed(4)},${(1 - st * .7).toFixed(4)})`;
}
// the bubble shows the current tab's icon; when it changes it pops in
function swapIcon(now) {
  const p = tabFor(currentPage()); if (!bubIc || p === shown) return;
  shown = p; bubIc.innerHTML = icon(p, 24);
  if (!now && !reduced() && bubIc.animate) bubIc.animate([{ transform: "scale(.4) rotate(-20deg)", opacity: 0 }, { transform: "scale(1.12)", opacity: 1, offset: .6 }, { transform: "none", opacity: 1 }], { duration: 380, easing: "cubic-bezier(.3,1.4,.5,1)" });
}
const dockClock = clock((dt, now) => {
  if (!dock || !isPhone()) return false;
  aim(); tune(); X.run(dt); V.run(dt); paint();
  return !(X.idle() && V.idle() && !scrub && now > keepUntil);
});
function kick() {
  if (reduced()) { aim(); X.snap(); V.snap(); paint(); return; }
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
    swapIcon(false); keepUntil = performance.now() + 1100; kick();
  }
  kickNav(!first);
}

// ---------- tap, or hold and slide across the bar ----------
let press = null;
function wireDock() {
  dock.addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    press = { x: e.clientX, id: e.pointerId, moved: false, over: tabs.findIndex(t => t.dataset.p === tabFor(currentPage())) };
    try { dock.setPointerCapture(e.pointerId); } catch {}
  });
  dock.addEventListener("pointermove", e => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.moved && Math.abs(e.clientX - press.x) < 8) return;
    press.moved = true; scrub = true;
    const d = dock.getBoundingClientRect(), x = (e.clientX - d.left) / zoom();
    X.t = Math.max(0, Math.min(dock.offsetWidth, x));
    let over = press.over, best = 1e9;
    tabs.forEach((t, i) => { const dist = Math.abs(t.offsetLeft + t.offsetWidth / 2 - x); if (dist < best) { best = dist; over = i; } });
    if (over !== press.over) { tabs.forEach((t, i) => t.classList.toggle("hover", i === over)); press.over = over; buzz(5); }
    kick();
  }, { passive: true });
  const release = e => {
    if (!press || e.pointerId !== press.id) return;
    const p = press; press = null; scrub = false;
    tabs.forEach(t => t.classList.remove("hover"));
    const i = p.moved ? p.over : tabs.findIndex(t => { const r = t.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 30 && e.clientY <= r.bottom + 12; });
    if (e.type !== "pointercancel" && i >= 0) pick(tabs[i].dataset.p);
    kick();
  };
  dock.addEventListener("pointerup", release);
  dock.addEventListener("pointercancel", release);
  // keyboard (Enter / Space on a tab)
  dock.addEventListener("click", e => { if (e.detail === 0) { const t = e.target.closest(".dk-tab"); if (t) pick(t.dataset.p); } });
}
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
  addEventListener("hashchange", () => { lastY = window.scrollY; });
  document.addEventListener("click", e => { const b = e.target.closest("[data-more]"); if (b) go(b.dataset.more); });
  let rz = 0, wasPhone = isPhone(), lastW = window.innerWidth;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => {
    // the phone's keyboard opening changes only the height: leave the dock alone
    if (window.innerWidth === lastW && isPhone() === wasPhone) return;
    lastW = window.innerWidth; wasPhone = isPhone(); buildDock(); kickNav(true);
  }, 120); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { aim(); X.snap(); V.snap(); paint(); kickNav(true); });
  // measure the screen's refresh rate once the app has settled (shown in Settings › Appearance)
  setTimeout(() => { if (document.visibilityState === "visible") measureHz(); }, 1500);
}
export function motionChanged() { applyEase(); buildDock(); keepUntil = performance.now() + 900; kick(); kickNav(); }
