// The frame around every page: navigation (side menu on wide screens, tab bar on
// phones), the page header with the month and space switchers, and the banners.
import { $, esc, monthName, shiftMonth, monthKey } from "./util.js";
import { ctx, state, ui, people, pcolor, isGroup, isViewer, groupName, setView, changed, openBills, meId } from "./store.js";

const pages = {};
let current = "";
const TITLES = { home: "Dashboard", entries: "Entries", loans: "Loans", bills: "Bills & reminders", goals: "Savings goals", settings: "Settings", admin: "Admin", more: "More" };
const routeHooks = [];
export const onRoute = fn => routeHooks.push(fn);
const MONTH_PAGES = new Set(["home", "entries"]);

export function registerPage(id, mod) { pages[id] = mod; }
export const currentPage = () => current;

// ---------- routing: #home, #entries, #settings/groups … ----------
export function go(id, anchor) {
  const h = "#" + id + (anchor ? "/" + anchor : "");
  if (location.hash !== h) location.hash = h; else route();
}
function parse() {
  const [p, a] = (location.hash || "").replace(/^#\/?/, "").split("/");
  let id = pages[p] ? p : "home";
  if (id === "admin" && !ctx.admin) id = "home";
  return { id, anchor: a || "" };
}
export function route() {
  const { id, anchor } = parse(), first = current !== id;
  current = id;
  document.querySelectorAll(".page").forEach(s => { s.hidden = s.dataset.page !== id; });
  document.querySelectorAll("#nav a[data-nav]").forEach(a => a.setAttribute("aria-current", a.dataset.nav === id ? "page" : "false"));
  $("pageTitle").textContent = TITLES[id] || "";
  document.title = (id === "home" ? "" : (TITLES[id] || "") + " · ") + "Pocket Ledger";
  renderHeader();
  const mod = pages[id];
  if (mod) { if (first && mod.enter) mod.enter(anchor); try { mod.render(); } catch (e) { console.error(e); } }
  if (anchor) setTimeout(() => { const el = $("set-" + anchor) || $(anchor); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30);
  else if (first) window.scrollTo(0, 0);
  routeHooks.forEach(fn => { try { fn(id, first); } catch (e) { console.error(e); } });
}
window.addEventListener("hashchange", route);

// ---------- header ----------
function renderHeader() {
  const mn = $("monthNav"), wantMonth = MONTH_PAGES.has(current);
  // every page's title row is as tall as the month switcher, so the title sits in the same place on every page
  if (mn.hidden) { mn.hidden = false; const h = mn.offsetHeight; mn.hidden = !wantMonth; if (h) document.documentElement.style.setProperty("--ph-h", h + "px"); }
  else { mn.hidden = !wantMonth; const h = mn.offsetHeight; if (h) document.documentElement.style.setProperty("--ph-h", h + "px"); }
  $("monthLabel").textContent = monthName(ui.month);
  // spaces: Me / groups / dashboards shared with me
  const list = ctx.spaces || [], bar = $("spaceBar");
  bar.hidden = list.length < 2 || current === "admin";
  bar.innerHTML = list.map(s => `<button type="button" data-space="${esc(s.id)}" aria-pressed="${s.id === (ctx.space && ctx.space.id)}">${esc(s.role === "viewer" ? s.name + " (view only)" : s.name)}</button>`).join("");
  // in a group: whose money you're looking at
  const who = $("who"), ps = people(), showWho = isGroup() && ps.length >= 2 && current !== "settings" && current !== "admin";
  who.hidden = !showWho;
  if (showWho) who.innerHTML = ps.map(x => `<button type="button" data-view="${esc(x.id)}" aria-pressed="${ui.view === x.id}"><i class="pdot" style="background:${pcolor(x.id)}"></i>${esc(x.id === meId() ? "You" : x.name)}</button>`).join("") +
    `<button type="button" class="house" data-view="all" aria-pressed="${ui.view === "all"}">All of ${esc(groupName())}</button>`;
}
export function renderShell() {
  renderHeader();
  $("syncNote").textContent = navigator.onLine ? "Synced" : "Offline, changes will sync";
  const ro = $("readonlyBanner");
  if (isViewer()) { ro.hidden = false; ro.innerHTML = `<span>You're looking at ${esc(ctx.space.name.replace(/'s$/, ""))}'s dashboard. Only they can change it.</span>`; }
  else if (state.readOnly) { ro.hidden = false; ro.innerHTML = `<span>You can't change anything in this space.</span>`; }
  else ro.hidden = true;
  document.body.classList.toggle("readonly", state.readOnly);
  // bills badge
  const n = state.ready ? openBills(ui.view).length : 0, red = n && openBills(ui.view).some(b => b.level === "red");
  const bd = $("billsBadge"); bd.hidden = !n; bd.textContent = n; bd.classList.toggle("red", !!red);
  $("adminNav").hidden = !ctx.admin;
  const p = pages[current]; if (p) { try { p.render(); } catch (e) { console.error(e); } }
}

export function initShell() {
  $("prevM").addEventListener("click", () => { ui.month = shiftMonth(ui.month, -1); ui.confirm = null; changed(); });
  $("nextM").addEventListener("click", () => { ui.month = shiftMonth(ui.month, 1); ui.confirm = null; changed(); });
  $("monthLabel").addEventListener("dblclick", () => { ui.month = monthKey(new Date()); changed(); });
  $("spaceBar").addEventListener("click", ev => {
    const b = ev.target.closest("button[data-space]"); if (!b) return;
    if (ctx.space && b.dataset.space === ctx.space.id) return;
    ctx.switchTo(b.dataset.space);
  });
  $("who").addEventListener("click", ev => { const b = ev.target.closest("button[data-view]"); if (b) { ui.confirm = null; setView(b.dataset.view); } });
  window.addEventListener("online", changed);
  window.addEventListener("offline", changed);
  // install button (Android / desktop Chrome)
  let installEvt = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; $("installBtn").hidden = false; });
  $("installBtn").addEventListener("click", async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch {} installEvt = null; $("installBtn").hidden = true; });
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; });
}
