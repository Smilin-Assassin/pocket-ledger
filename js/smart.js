// Smart help on Home, worked out on the phone from your own entries (no AI, nothing sent anywhere):
//  - regular payments: the same shop or person about the same amount around the same day, 3+ months → "make it a bill?"
//  - a quiet spell: nothing logged for a few days → scan or import
//  - a category running well above your usual month
//  - places (optional, off by default): entries remember roughly where you were, and when you're
//    back near a place you've paid at before, Home offers to log it again. Only while the app is open.
import { $, esc, money, r2, todayISO, monthKey, shiftMonth, monthName, daysBetween, lsGet, lsSet, toast } from "./util.js";
import { state, ui, meId, isGroup, isViewer, merchantKey, effMonth, countsMoney, hooks, changed } from "./store.js";
import { createRecurring } from "./actions.js";

export const smartOn = () => lsGet("pl-smart") !== "0";
export const placesOn = () => lsGet("pl-places") === "1";
const dismissed = () => { try { return JSON.parse(lsGet("pl-smart-no") || "{}"); } catch { return {}; } };
function dismiss(key) { const d = dismissed(); d[key] = Date.now(); lsSet("pl-smart-no", JSON.stringify(d)); }
const median = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const nice = k => k.replace(/(^|\s)([a-z])/g, (m, a, c) => a + c.toUpperCase());
const mine = () => state.entries.filter(e => e.person === meId() && countsMoney(e) && e.type !== "move");

// ---------- regular payments ----------
export function regulars(now) {
  now = now || todayISO();
  const nowK = now.slice(0, 7), from = shiftMonth(nowK, -6), groups = {};
  // everyday spending (cafes, groceries, shops, taxis) repeats without being a bill, so it's left out
  const daily = /^(eating out|food & groceries|shopping|transport)$/i;
  mine().filter(e => e.type === "expense" && !e.recurringId && !e.loanId && !daily.test(e.category || "") && effMonth(e) >= from && effMonth(e) <= nowK).forEach(e => {
    const k = merchantKey(e.note); if (k.length < 3) return;
    (groups[k] = groups[k] || []).push(e);
  });
  const billKeys = new Set(state.recurring.map(r => merchantKey(r.note || r.category)));
  const out = [];
  Object.keys(groups).forEach(k => {
    if (billKeys.has(k)) return;
    const es = groups[k], byMonth = {};
    es.forEach(e => { const m = effMonth(e); (byMonth[m] = byMonth[m] || []).push(e); });
    const months = Object.keys(byMonth).filter(m => m < nowK).sort();
    if (months.length < 3) return;
    // one payment a month (the biggest), similar amounts and days
    const pick = months.map(m => byMonth[m].slice().sort((a, b) => b.amount - a.amount)[0]);
    const amts = pick.map(e => +e.amount), days = pick.map(e => +e.date.slice(8, 10));
    const am = median(amts), dm = median(days);
    if (!(am > 0) || amts.some(a => Math.abs(a - am) > am * 0.2) || days.some(d => Math.abs(d - dm) > 6)) return;
    const paidNow = !!byMonth[nowK];
    out.push({ key: k, name: nice(k), amount: r2(am), day: Math.round(dm), months: months.length, category: pick[pick.length - 1].category || "Other", paidNow,
      late: !paidNow && +now.slice(8, 10) > Math.round(dm) + 3 });
  });
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount);
}

// ---------- a category well above your usual ----------
export function unusual(now) {
  now = now || todayISO();
  const k = now.slice(0, 7), prev = [1, 2, 3].map(i => shiftMonth(k, -i)), by = {};
  mine().filter(e => e.type === "expense").forEach(e => {
    const m = effMonth(e), c = e.category || "Other"; if (m !== k && !prev.includes(m)) return;
    (by[c] = by[c] || {})[m] = (by[c][m] || 0) + (+e.amount || 0);
  });
  const out = [];
  Object.keys(by).forEach(c => {
    const past = prev.map(m => by[c][m] || 0).filter(v => v > 0);
    if (past.length < 2) return;
    const usual = past.reduce((a, v) => a + v, 0) / past.length, cur = by[c][k] || 0;
    if (cur > usual * 1.3 && cur - usual >= Math.max(100, usual * 0.2)) out.push({ cat: c, cur: r2(cur), usual: r2(usual), pct: Math.round((cur / usual - 1) * 100) });
  });
  return out.sort((a, b) => b.pct - a.pct);
}

// ---------- quiet spell ----------
export function quietDays(now) {
  const es = mine(); if (es.length < 5) return 0;
  const last = Math.max(...es.map(e => e.created || 0)); if (!last) return 0;
  return Math.floor(((now ? Date.parse(now + "T12:00:00") : Date.now()) - last) / 864e5);
}

// ---------- places (opt-in) ----------
let pos = null; // { lat, lng, at }
export function refreshPlace() {
  if (!placesOn() || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(p => { pos = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }; changed(); }, () => {}, { maximumAge: 5 * 60e3, timeout: 15000, enableHighAccuracy: false });
}
const freshPos = () => pos && Date.now() - pos.at < 10 * 60e3 ? pos : null;
const metres = (a, b) => { const R = 6371e3, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lng - a.lng) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
// roughly where (about 100 m), only on things you add yourself today
hooks.place = e => {
  const p = freshPos();
  if (p && placesOn() && e.date === todayISO() && !e.source && (e.type === "expense" || e.type === "income")) e.place = { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
};
export function nearby(at) {
  const p = at || freshPos(); if (!p) return null;
  const since = shiftMonth(todayISO().slice(0, 7), -4) + "-01", groups = {};
  mine().filter(e => e.place && e.type === "expense" && e.date >= since && metres(p, e.place) <= 200).forEach(e => {
    const k = merchantKey(e.note) || (e.category || "").toLowerCase(); (groups[k] = groups[k] || []).push(e);
  });
  const best = Object.values(groups).filter(es => es.length >= 2 && !es.some(e => e.date === todayISO())).sort((a, b) => b.length - a.length)[0];
  if (!best) return null;
  const last = best.slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""))[0];
  return { key: "place:" + merchantKey(last.note), name: (last.note || last.category).split(/:|,/)[0], amount: +last.amount, category: last.category, note: last.note || "", visits: best.length };
}

// ---------- the Home card ----------
let addFn = null; // set by main.js (opens the add form prefilled)
export function setAddFn(f) { addFn = f; }
export function renderSmart() {
  const box = $("smartBar"); if (!box) return;
  if (!smartOn() || isViewer() || isGroup() || !state.ready || ui.month !== monthKey(new Date())) { box.hidden = true; box.innerHTML = ""; return; }
  const no = dismissed(), k = monthKey(new Date()), items = [];
  const near = nearby(); if (near && !no[near.key + ":" + todayISO()]) items.push({ id: near.key + ":" + todayISO(), text: `Near <b>${esc(near.name)}</b> again? Last time ${esc(money(near.amount))}, ${esc(near.category)}.`, act: "place", label: "Add it", data: near });
  regulars().filter(r => !no["reg:" + r.key]).slice(0, 2).forEach(r => items.push({ id: "reg:" + r.key,
    text: `<b>${esc(r.name)}</b>: about ${esc(money(r.amount, { whole: true }))} around the ${ordinal(r.day)}, ${r.months} months running.${r.late ? " Not logged this month yet." : ""} Make it a monthly bill so you're reminded?`, act: "bill", label: "Make it a bill", data: r }));
  const u = unusual()[0]; if (u && !no["hi:" + u.cat + ":" + k]) items.push({ id: "hi:" + u.cat + ":" + k, text: `<b>${esc(u.cat)}</b> is at ${esc(money(u.cur, { whole: true }))} this month, about ${u.pct}% more than your usual ${esc(money(u.usual, { whole: true }))}.`, act: "cat", label: "See them", data: u });
  const q = quietDays(); if (q >= 3 && !no["quiet:" + todayISO()]) items.push({ id: "quiet:" + todayISO(), text: `Nothing logged for ${q} days. Scan a slip or import a statement to catch up.`, act: "scan", label: "Scan" });
  const show = items.slice(0, 3);
  box.hidden = !show.length;
  box.innerHTML = show.length ? `<div class="smart-head"><b>For you</b><small>From your own entries</small></div>` + show.map((x, i) => `<div class="smart-item" data-si="${i}"><span class="smart-dot" aria-hidden="true"></span><p>${x.text}</p><span class="row-btns"><button class="ghost" type="button" data-sgo="${i}">${esc(x.label)}</button><button class="icon-btn" type="button" data-sno="${i}" aria-label="Not now">Not now</button></span></div>`).join("") : "";
  box._items = show;
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th");
export function initSmart(goCategory) {
  const box = $("smartBar"); if (!box) return;
  box.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    const x = (box._items || [])[+(b.dataset.sgo ?? b.dataset.sno)]; if (!x) return;
    if (b.dataset.sno !== undefined) { dismiss(x.id); renderSmart(); return; }
    if (x.act === "bill") {
      const r = x.data, k = monthKey(new Date());
      createRecurring({ type: "expense", amount: r.amount, category: r.category, note: r.name, person: meId(), day: r.day, startMonth: r.paidNow ? shiftMonth(k, 1) : k });
      dismiss(x.id); toast(r.name + " is now a monthly bill on the " + ordinal(r.day));
    } else if (x.act === "place") { dismiss(x.id); if (addFn) addFn({ amount: x.data.amount, note: x.data.note, category: x.data.category }); }
    else if (x.act === "cat") { if (goCategory) goCategory(x.data.cat); }
    else if (x.act === "scan") { dismiss(x.id); const s = document.querySelector("[data-scan]"); if (s) s.click(); }
    renderSmart();
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshPlace(); });
  refreshPlace();
}
// Settings: turning places on asks for location once
export function setPlaces(on) {
  if (!on) { lsSet("pl-places", ""); pos = null; return Promise.resolve(false); }
  if (!navigator.geolocation) { toast("This browser can't share your location."); return Promise.resolve(false); }
  return new Promise(res => navigator.geolocation.getCurrentPosition(p => { lsSet("pl-places", "1"); pos = { lat: p.coords.latitude, lng: p.coords.longitude, at: Date.now() }; res(true); },
    () => { toast("Location wasn't allowed, so places stay off."); res(false); }, { timeout: 15000, maximumAge: 60e3 }));
}
