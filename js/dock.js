// Navigation that feels alive.
// Phones (v64): two pill islands with the plain coral disc + between them. The tab you're on stretches to show
// its name (or, with 6 tabs or on a narrow screen, gets a name tag above it). Tap a tab, or hold and slide across
// the dock and let go. Always 4 or 6 tabs (half on each side of the +); pages that don't fit live under More.
// Wide screens: the side menu, with a liquid highlight moving up and down.
import { $, esc } from "./util.js";
import { ctx, state, ui, openBills } from "./store.js";
import { go, currentPage, onRoute } from "./shell.js";
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
export const isPhone = () => phoneMQ.matches;
// Settings › Text size zooms the page; screen measurements must be divided by it
export const zoom = () => { const z = parseFloat(getComputedStyle(document.body).zoom); return z > 0 ? z : 1; };
const layoutWidth = () => Math.min(window.innerWidth / zoom(), 560);
// the dock: two islands either side of the + (PLUS_GAP between them), tabs TAB wide with TGAP between them
const TAB = 38, TGAP = 4, ISL_PAD = 2, PLUS_GAP = 80;
// 6 tabs only when 3 of them still fit comfortably in each island
export function fitsSix() { return (layoutWidth() - 24 - PLUS_GAP) / 2 >= 3 * TAB + 2 * TGAP + ISL_PAD * 2 + 6; }
export const dockPages = () => (M.tabs === 6 && fitsSix()) ? PAGES.slice() : M.dock.concat("more");
const tabFor = p => { const l = dockPages(); return l.includes(p) ? p : "more"; };

let dock, tabs = [];

// ---------- building the dock ----------
// Two pill islands with the + disc between them (v64). With room, the tab you're on stretches to show its name
// (data-mode="stretch"); with less room, or with 6 tabs, it shows a name tag above it (data-mode="tag").
export function buildDock() {
  dock = $("dock"); if (!dock) return;
  const list = dockPages(), cur = tabFor(currentPage()), half = list.length / 2;
  const btn = p => `<button class="dk-tab${cur === p ? " on" : ""}" type="button" data-p="${p}" aria-label="${NAMES[p]}"${cur === p ? ' aria-current="page"' : ""}>${icon(p, 20)}<span class="lbl">${NAMES[p]}</span><i class="badge" data-badge="${p}" hidden></i></button>`;
  dock.innerHTML = `<div class="dk-isl">${list.slice(0, half).map(btn).join("")}</div><div class="dk-isl">${list.slice(half).map(btn).join("")}</div>`;
  dock.dataset.n = list.length;
  tabs = [...dock.querySelectorAll(".dk-tab")];
  renderMore(); dockBadges(); measure(); requestAnimationFrame(measure);
}
// how wide each name is, and whether the stretched tab fits inside its island
function measure() {
  if (!dock) return;
  const isl = dock.querySelector(".dk-isl"); if (!isl || !isl.clientWidth) return;
  let widest = 0;
  tabs.forEach(t => {
    const l = t.querySelector(".lbl"), keep = l.style.cssText;
    l.style.cssText = "position:static;flex:none;width:auto;max-width:none;opacity:0;margin:0;padding:0;transition:none";
    const w = Math.ceil(l.getBoundingClientRect().width / zoom()); l.style.cssText = keep;
    t.style.setProperty("--lw", w + "px"); widest = Math.max(widest, w);
  });
  const n = isl.children.length, inner = isl.clientWidth - ISL_PAD * 2;
  dock.dataset.mode = inner >= (n - 1) * (TAB + TGAP) + widest + 34 ? "stretch" : "tag";
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


// ---------- the current tab ----------
function paintTabs() {
  const cur = tabFor(currentPage());
  tabs.forEach(t => { const on = t.dataset.p === cur; t.classList.toggle("on", on); if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current"); });
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
    paintTabs();
  }
  kickNav(!first);
}

// ---------- tap, or hold and slide across the bar ----------
let press = null;
function wireDock() {
  dock.addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    press = { x: e.clientX, id: e.pointerId, moved: false, over: -1 };
    try { dock.setPointerCapture(e.pointerId); } catch {}
  });
  dock.addEventListener("pointermove", e => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.moved && Math.abs(e.clientX - press.x) < 8) return;
    press.moved = true;
    let over = -1, best = 1e9;
    tabs.forEach((t, i) => { const r = t.getBoundingClientRect(), dist = Math.abs(r.left + r.width / 2 - e.clientX); if (dist < best) { best = dist; over = i; } });
    if (over !== press.over) { tabs.forEach((t, i) => t.classList.toggle("hover", i === over)); press.over = over; buzz(5); }
  }, { passive: true });
  const release = e => {
    if (!press || e.pointerId !== press.id) return;
    const p = press; press = null;
    tabs.forEach(t => t.classList.remove("hover"));
    const i = p.moved ? p.over : tabs.findIndex(t => { const r = t.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top - 30 && e.clientY <= r.bottom + 12; });
    if (e.type !== "pointercancel" && i >= 0) pick(tabs[i].dataset.p);
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
  // the menu can shift after the highlight was placed ("Synced" appearing under the name, fonts loading):
  // move the highlight with it, or it sits off-centre until the next page change
  const reNav = () => kickNav(true);
  if (window.ResizeObserver) { const ro = new ResizeObserver(reNav); ro.observe(nav); nav.querySelectorAll(".nav-brand, a").forEach(el => ro.observe(el)); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(reNav);
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
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); kickNav(true); });
  // measure the screen's refresh rate once the app has settled (shown in Settings › Appearance)
  setTimeout(() => { if (document.visibilityState === "visible") measureHz(); }, 1500);
}
export function motionChanged() { applyEase(); buildDock(); kickNav(); }
