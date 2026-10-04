// Quick add: the + in the dock grows into a sheet with a number pad. Hold the + for Scan / Type it / Voice.
import { $, esc, money, todayISO, dShort, getCurrency, toast } from "./util.js";
import { state, db, meId, catOptions, EAT, MEALS, mealAt, mealFromNote, mealName } from "./store.js";
import { budgetCheck } from "./actions.js";
import { Spring, clock, params, reduced, buzz, ease } from "./motion.js";
import { focusAdd } from "./pages/entries.js";
import { openScanPicker } from "./scan.js";
import { openChat, startRec } from "./chat.js";
import { zoom } from "./dock.js";

let q = { type: "expense", val: "", cat: "", date: "", note: "", meal: "", mealPicked: false };
const P = new Spring(0);
let from = null, isOpen = false;

// categories you use most come first
function chips(type) {
  const me = meId(), count = {};
  state.entries.forEach(e => { if (e.type === type && e.category && (e.person === me || !me)) count[e.category] = (count[e.category] || 0) + 1; });
  const skip = new Set(["Loans given", "Loan repayment", "Loan repaid", "Loan received", "Savings"]);
  return catOptions(type).filter(c => !skip.has(c)).map((c, i) => [c, (count[c] || 0) * 1000 - i]).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 10);
}
const shown = v => { if (!v) return "0"; const [a, b] = v.split("."); return Number(a || 0).toLocaleString("en-US") + (v.includes(".") ? "." + (b || "") : ""); };
function render() {
  $("qaType").dataset.v = q.type;
  $("qaType").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === q.type)));
  $("qaCur").textContent = getCurrency();
  $("qaVal").textContent = shown(q.val);
  const list = chips(q.type); if (!list.includes(q.cat)) q.cat = list[0] || (q.type === "income" ? "Salary" : "Other");
  $("qaChips").innerHTML = list.map(c => `<button type="button" class="qa-chip" data-cat="${esc(c)}" aria-pressed="${c === q.cat}">${esc(c)}</button>`).join("");
  // Eating out: the meal, guessed from the note or the clock (today only); tap to change or clear
  const eat = q.type === "expense" && q.cat === EAT;
  if (eat && !q.mealPicked) q.meal = mealFromNote($("qaNote").value) || ((q.date || todayISO()) === todayISO() ? mealAt(new Date().getHours()) : "");
  $("qaMeals").hidden = !eat;
  $("qaMeals").innerHTML = eat ? MEALS.map(([m, n]) => `<button type="button" class="qa-meal" data-meal="${m}" aria-pressed="${m === q.meal}">${n}</button>`).join("") : "";
  const today = q.date === todayISO();
  $("qaDate").innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/></svg>${today ? "Today" : esc(dShort(q.date))}`;
  $("qaDate").classList.toggle("set", !today);
  $("qaSave").disabled = !(parseFloat(q.val) > 0);
  $("qaSave").textContent = q.type === "expense" ? "Add expense" : "Add income";
}
function reset() {
  q = { type: "expense", val: "", cat: "", date: todayISO(), note: "", meal: "", mealPicked: false };
  $("qaNote").value = ""; $("qaNoteRow").hidden = true; $("qaNoteBtn").hidden = false;
  render();
}

// ---------- the sheet grows out of the + ----------
const fades = () => [...$("qaSheet").querySelectorAll(".qa-f")];
const sheetClock = clock(dt => {
  const { k, zeta } = params(); P.k = k * .75; P.z = Math.min(1, zeta + .08); P.run(dt);
  paint();
  if (P.idle()) { P.snap(); paint(); if (P.t === 0) done(); return false; }
});
function paint() {
  const sh = $("qaSheet"), p = P.x, sr = sh.getBoundingClientRect(), t = Math.max(-.2, p);
  const lerp = (a, b) => a + (b - a) * t;
  if (from) {
    const z = zoom(), top = (from.top - sr.top) / z, left = (from.left - sr.left) / z, right = (sr.right - from.right) / z, bottom = (sr.bottom - from.bottom) / z;
    sh.style.clipPath = p >= .999 ? "none" : `inset(${Math.max(0, lerp(top, 0)).toFixed(1)}px ${Math.max(0, lerp(right, 0)).toFixed(1)}px ${Math.max(0, lerp(bottom, 0)).toFixed(1)}px ${Math.max(0, lerp(left, 0)).toFixed(1)}px round ${lerp(22, parseFloat(getComputedStyle(sh).borderTopLeftRadius) || 28).toFixed(1)}px)`;
  }
  $("qaScrim").style.opacity = Math.max(0, Math.min(1, p)).toFixed(3);
  fades().forEach((el, i) => { const v = p >= .999 && P.idle() ? 1 : Math.max(0, Math.min(1, (p - .3 - i * .04) / .38)); el.style.opacity = v.toFixed(3); el.style.transform = v >= 1 ? "" : `translate3d(0,${((1 - v) * 14).toFixed(1)}px,0)`; });
}
function done() { $("qaWrap").hidden = true; document.body.classList.remove("qa-open"); $("qaSheet").style.clipPath = ""; }
export function openQuick() {
  if (state.readOnly) return toast("You can't add entries here.");
  setSat(false);
  const plus = $("dkPlus");
  reset();
  $("qaWrap").hidden = false; document.body.classList.add("qa-open"); isOpen = true;
  from = plus && plus.offsetParent ? plus.getBoundingClientRect() : null;
  plus && plus.classList.add("open");
  P.t = 1; buzz(10);
  if (reduced() || !from) { P.snap(); paint(); return; }
  paint(); sheetClock.kick();
}
export function closeQuick() {
  if (!isOpen) return; isOpen = false;
  const plus = $("dkPlus"); plus && plus.classList.remove("open");
  from = plus && plus.offsetParent ? plus.getBoundingClientRect() : null;
  P.t = 0;
  if (reduced() || !from) { P.snap(); paint(); done(); return; }
  sheetClock.kick();
}

function press(k) {
  if (k === "del") q.val = q.val.slice(0, -1);
  else if (k === ".") { if (!q.val.includes(".")) q.val = (q.val || "0") + "."; }
  else if (q.val.replace(".", "").length < 9 && !(q.val.includes(".") && q.val.split(".")[1].length >= 2)) q.val = q.val === "0" ? k : q.val + k;
  buzz(4); render();
  const a = $("qaAmt"); if (a.animate && !reduced()) a.animate([{ transform: "scale(1.04)" }, { transform: "none" }], { duration: 300, easing: ease() });
}
function entry() {
  return { type: q.type, amount: Math.round(parseFloat(q.val) * 100) / 100, date: q.date || todayISO(), category: q.cat, note: $("qaNote").value.trim(), person: meId(), created: Date.now(), ...(q.type === "expense" && q.cat === EAT && q.meal ? { meal: q.meal } : {}) };
}
function save() {
  const e = entry(); if (!(e.amount > 0)) return;
  const id = db.add(e); budgetCheck(e);
  closeQuick();
  setTimeout(() => toast((e.type === "income" ? "Income added: " : "Added ") + money(e.amount) + " · " + (e.meal ? mealName(e.meal) : e.category), { action: "Undo", onAction: () => db.removeMany([id]) }), 180);
}

// ---------- hold the + : Scan / Type it / Voice ----------
const SAT_FAN = [[-86, -40], [0, -94], [86, -40]];
// Glass: the + sits at the right edge, so the shortcuts fan up and to the left
const SAT_CORNER = [[-104, -2], [-78, -78], [0, -104]];
let SAT_POS = SAT_FAN;
const satS = [0, 1, 2].map(() => new Spring(0));
let satOpen = false, hold = null;
const satClock = clock(dt => {
  const { k, zeta } = params(), btns = $("dkSat").querySelectorAll("button"); let busy = false;
  satS.forEach((s, i) => { s.k = k * .9; s.z = zeta * .85; s.run(dt); if (!s.idle()) busy = true;
    const [x, y] = SAT_POS[i], p = s.x;
    btns[i].style.transform = `translate3d(${(x * p).toFixed(1)}px,${(y * p).toFixed(1)}px,0) scale(${(.2 + .8 * Math.max(0, p)).toFixed(3)})`;
    btns[i].style.opacity = Math.max(0, Math.min(1, p * 1.6)).toFixed(3); });
  return busy;
});
function setSat(on) {
  if (on === satOpen) return; satOpen = on;
  const sat = $("dkSat"); if (!sat) return;
  if (on) SAT_POS = SAT_CORNER; // the + sits in the corner beside the bar for every theme (v37)
  sat.classList.toggle("open", on); sat.setAttribute("aria-hidden", String(!on));
  document.body.classList.toggle("sat-open", on);
  satS.forEach((s, i) => setTimeout(() => { s.t = on ? 1 : 0; if (reduced()) s.snap(); satClock.kick(); }, on ? i * 45 : (2 - i) * 25));
}
function pickSat(what) {
  setSat(false);
  if (what === "add") openQuick();
  else if (what === "scan") openScanPicker();
  else if (what === "voice") { openChat(); startRec(); }
}

export function initQuick() {
  const plus = $("dkPlus"); if (!plus) return;
  $("qaPad").innerHTML = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"].map(k => `<button type="button" data-k="${k}" aria-label="${k === "del" ? "Delete digit" : k}">${k === "del" ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="m12 9.5 5 5M17 9.5l-5 5"/></svg>' : k}</button>`).join("");
  $("qaPad").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) press(b.dataset.k); });
  $("qaType").addEventListener("click", e => { const b = e.target.closest("button[data-v]"); if (!b || b.dataset.v === q.type) return; q.type = b.dataset.v; q.cat = ""; buzz(6); render(); });
  $("qaChips").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; q.cat = b.dataset.cat; buzz(4); render(); });
  $("qaMeals").addEventListener("click", e => { const b = e.target.closest("[data-meal]"); if (!b) return; q.meal = q.meal === b.dataset.meal ? "" : b.dataset.meal; q.mealPicked = true; buzz(4); render(); });
  $("qaDate").addEventListener("click", () => { const d = $("qaDateIn"); d.value = q.date; d.max = todayISO(); try { d.showPicker(); } catch { d.hidden = false; d.focus(); } });
  $("qaDateIn").addEventListener("change", () => { if ($("qaDateIn").value) { q.date = $("qaDateIn").value; render(); } $("qaDateIn").hidden = true; });
  $("qaNoteBtn").addEventListener("click", () => { $("qaNoteBtn").hidden = true; $("qaNoteRow").hidden = false; $("qaNote").focus(); });
  $("qaSave").addEventListener("click", save);
  $("qaMore").addEventListener("click", () => {
    const e = entry(); closeQuick();
    focusAdd(e.type, "", { amount: e.amount > 0 ? e.amount : "", category: e.category, date: e.date, note: e.note, meal: e.meal });
  });
  $("qaNote").addEventListener("input", () => { if (q.cat === EAT && !q.mealPicked) render(); });
  $("qaScrim").addEventListener("click", closeQuick);
  $("qaX").addEventListener("click", closeQuick);
  document.addEventListener("keydown", e => {
    if (!isOpen) return;
    if (e.key === "Escape") return closeQuick();
    if (e.target.closest && e.target.closest("input")) { if (e.key === "Enter") save(); return; }
    if (/^[0-9.]$/.test(e.key)) { e.preventDefault(); press(e.key); }
    else if (e.key === "Backspace") { e.preventDefault(); press("del"); }
    else if (e.key === "Enter" && !$("qaSave").disabled) { e.preventDefault(); save(); }
  });
  // drag the sheet down to close
  let drag = null;
  const sh = $("qaSheet");
  sh.addEventListener("pointerdown", e => { if (e.target.closest("button, input")) return; drag = { y: e.clientY, id: e.pointerId }; try { sh.setPointerCapture(e.pointerId); } catch {} });
  sh.addEventListener("pointermove", e => { if (drag && e.pointerId === drag.id) sh.style.transform = `translate3d(0,${Math.max(0, e.clientY - drag.y)}px,0)`; }, { passive: true });
  const up = e => { if (!drag || e.pointerId !== drag.id) return; const dy = e.clientY - drag.y; drag = null;
    if (dy > 90) { sh.style.transform = ""; closeQuick(); return; }
    if (sh.animate && dy > 0) sh.animate([{ transform: sh.style.transform || "none" }, { transform: "none" }], { duration: 360, easing: ease() });
    sh.style.transform = ""; };
  sh.addEventListener("pointerup", up); sh.addEventListener("pointercancel", up);

  // the + : tap = Quick add; hold = the three shortcuts (slide onto one and let go, or tap one)
  plus.addEventListener("pointerdown", e => {
    if (e.button > 0) return;
    try { plus.setPointerCapture(e.pointerId); } catch {}
    hold = { id: e.pointerId, long: false, hot: -1, t: setTimeout(() => { if (hold) { hold.long = true; buzz(14); setSat(true); } }, 380) };
    plus.classList.add("down");
  });
  plus.addEventListener("pointermove", e => {
    if (!hold || !hold.long) return;
    let hot = -1;
    $("dkSat").querySelectorAll("button").forEach((b, i) => { const r = b.getBoundingClientRect(); if (e.clientX > r.left - 14 && e.clientX < r.right + 14 && e.clientY > r.top - 14 && e.clientY < r.bottom + 14) hot = i; });
    if (hot !== hold.hot) { $("dkSat").querySelectorAll("button").forEach((b, i) => b.classList.toggle("hot", i === hot)); if (hot >= 0) buzz(5); hold.hot = hot; }
  }, { passive: true });
  const plusUp = e => {
    if (!hold || e.pointerId !== hold.id) return;
    clearTimeout(hold.t); plus.classList.remove("down");
    const h = hold; hold = null;
    if (e.type === "pointercancel") return;
    if (!h.long) { if (isOpen) closeQuick(); else if (satOpen) setSat(false); else openQuick(); return; }
    $("dkSat").querySelectorAll("button").forEach(b => b.classList.remove("hot"));
    if (h.hot >= 0) pickSat($("dkSat").querySelectorAll("button")[h.hot].dataset.sat);
  };
  plus.addEventListener("pointerup", plusUp); plus.addEventListener("pointercancel", plusUp);
  plus.addEventListener("click", e => { if (e.detail === 0) openQuick(); });
  $("dkSat").addEventListener("click", e => { const b = e.target.closest("button[data-sat]"); if (b) pickSat(b.dataset.sat); });
  document.addEventListener("pointerdown", e => { if (satOpen && !e.target.closest("#dkSat") && !e.target.closest("#dkPlus")) setSat(false); }, { passive: true });
}
