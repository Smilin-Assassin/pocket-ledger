// Entries page: the add/edit form and every entry, searchable across months.
import { $, esc, money, num, sum, todayISO, monthKey, monthName, shiftMonth, toast, saveFile, fillSelect, canHover } from "../util.js";
import { state, ui, db, meId, isAll, isGroup, people, pname, pcolor, canEdit, addedBy, otherOf, inMonth, countsMoney,
  visibleGoals, goalBalance, goalName, totalSavings, catOptions, guessCategory, changed, merchantKey, effMonth, EAT, MEALS, mealName, mealAt, mealFromNote } from "../store.js";
import { createRecurring, budgetCheck, removeWithUndo } from "../actions.js";
import { go } from "../shell.js";

Object.assign(ui, { type: "expense", editId: null, filter: "all", search: "", cat: "", meal: "", searchAll: false, fMeal: "", mealPicked: false, confirm: null, openRow: null, catOther: false, goalSel: "" });

// ---------- one entry row (also used on Home) ----------
const META = { expense: ["var(--c-spent)", "out", "−"], income: ["var(--c-left)", "in", "+"], save: ["var(--c-saved)", "sv", "→ "], withdraw: ["var(--c-saved)", "in", "← "], move: ["var(--ink-3)", "mv", ""] };
export function rowHtml(e, opts) {
  opts = opts || {};
  const meta = META[e.type] || ["var(--ink-3)", "out", ""];
  let title = e.category || "";
  if (e.type === "save") title = "Saved" + (goalName(e.goalId) ? " for " + goalName(e.goalId) : "");
  if (e.type === "withdraw") title = "Took out of savings" + (goalName(e.goalId) ? " (" + goalName(e.goalId) + ")" : "");
  if (e.type === "move") title = "Moved between your accounts";
  const tags = (e.split ? '<span class="owner-tag">Split</span>' : "") + (e.recurringId ? '<span class="owner-tag">Bill</span>' : "") +
    (e.countMonth && e.countMonth !== (e.date || "").slice(0, 7) ? '<span class="owner-tag">For ' + esc(monthName(e.countMonth, true)) + "</span>" : "") +
    (e.loanId && !countsMoney(e) ? '<span class="owner-tag">Loan · separate</span>' : "") +
    (e.maybeDup ? '<span class="owner-tag warn-tag">Possible repeat</span>' : "");
  const by = isGroup() && !isAll() ? addedBy(e) : "";
  const sub = [isAll() ? pname(e.person) : "", e.category === EAT ? mealName(e.meal) : "", e.note || (e.type === "expense" ? "Spent" : e.type === "income" ? "Income" : "")].filter(Boolean).join(", ");
  const editable = !opts.noActions && canEdit(e);
  const acts = !editable ? "" : (e.maybeDup ? `<button type="button" class="icon-btn" data-keepdup="${e.id}" aria-label="Keep it, it's a real separate payment">Keep</button>` : "") + `<button type="button" class="icon-btn" data-edit="${e.id}" aria-label="Edit entry">Edit</button><button type="button" class="icon-btn danger" data-del="${e.id}" aria-label="Delete entry">Delete</button>`;
  return `<li class="tx${ui.openRow === e.id ? " open" : ""}" data-id="${e.id}"><span class="dot" style="background:${meta[0]}" data-i="${esc((title || "?").trim().charAt(0).toUpperCase())}"></span>
    <div class="what"><b>${esc(title || "Untitled")}${tags}</b><small>${isAll() ? `<i class="pdot" style="background:${pcolor(e.person)}"></i>` : ""}${esc(sub)}${by ? ` <span class="by-tag">added by ${esc(by)}</span>` : ""}${opts.showDate ? " · " + esc(new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })) : ""}</small></div>
    <span class="amt num ${meta[1]}">${meta[2]}${esc(money(+e.amount))}</span><span class="acts">${acts}</span></li>`;
}
const byNewest = (a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || 0) - (a.created || 0);

// row taps, swipes, edit and delete (works for any list of rows)
export function wireRows(list, rerender) {
  list.addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) {
      const li = ev.target.closest("li.tx"); if (!li || canHover()) return;
      ui.openRow = ui.openRow === li.dataset.id ? null : li.dataset.id; ui.confirm = null; rerender(); return;
    }
    if (b.dataset.del) { ui.openRow = null; removeWithUndo("entries", b.dataset.del, "Entry deleted"); }
    else if (b.dataset.edit) startEdit(b.dataset.edit);
    else if (b.dataset.keepdup) { db.patchMany([b.dataset.keepdup], { maybeDup: "" }); toast("Kept as a separate payment"); }
  });
  let sw = null;
  list.addEventListener("touchstart", ev => { const li = ev.target.closest("li.tx"); if (li) sw = { id: li.dataset.id, x: ev.touches[0].clientX, y: ev.touches[0].clientY, li }; }, { passive: true });
  list.addEventListener("touchmove", ev => {
    if (!sw) return; const dx = ev.touches[0].clientX - sw.x, dy = ev.touches[0].clientY - sw.y;
    if (Math.abs(dy) > 30) { sw.li.style.transform = ""; sw = null; return; }
    if (dx < 0 && Math.abs(dx) > Math.abs(dy)) sw.li.style.transform = "translateX(" + Math.max(dx, -60) + "px)";
  }, { passive: true });
  list.addEventListener("touchend", ev => {
    if (!sw) return; const dx = (ev.changedTouches[0] || {}).clientX - sw.x; sw.li.style.transform = "";
    if (dx < -45) { ui.openRow = sw.id; ui.confirm = null; rerender(); }
    else if (dx > 45 && ui.openRow === sw.id) { ui.openRow = null; rerender(); }
    sw = null;
  });
}

// ---------- the list ----------
function searchEntries() {
  const q = ui.search.toLowerCase();
  // the month shown at the top, unless "Search all months" was tapped
  return (ui.searchAll ? state.entries : inMonth(ui.month, "all")).filter(e => (isAll() || e.person === ui.view) &&
    ((e.note || "") + " " + (e.category || "") + " " + mealName(e.meal) + " " + String(e.amount) + " " + (e.ref || "") + " " + goalName(e.goalId)).toLowerCase().includes(q));
}
// things worth tidying up: possible repeats, and spending or income still under "Other" (last 3 months)
export function needsLook(who, k) {
  const from = shiftMonth(monthKey(new Date()), -2);
  const other = e => (e.type === "expense" || e.type === "income") && (e.category || "Other") === "Other" && !e.loanId;
  return state.entries.filter(e => (who === "all" || e.person === who) && canEdit(e) && (k
    ? effMonth(e) === k && (e.maybeDup || other(e))                                   // one month: everything in it
    : e.maybeDup || (other(e) && (e.date || "").slice(0, 7) >= from)));              // all months: repeats, plus Other in the last 3 months
}
function renderLedger() {
  const list = $("ledger");
  if (!state.ready) { list.innerHTML = `<li class="empty">Loading your entries…</li>`; return; }
  let es = ui.filter === "review" ? needsLook(isAll() ? "all" : ui.view, ui.searchAll ? "" : ui.month) : ui.search ? searchEntries() : inMonth(ui.month);
  if (ui.filter === "expense") es = es.filter(e => e.type === "expense");
  if (ui.filter === "income") es = es.filter(e => e.type === "income");
  if (ui.filter === "savings") es = es.filter(e => e.type === "save" || e.type === "withdraw");
  if (ui.filter === "moved") es = es.filter(e => e.type === "move" || e.moved);
  // category picker: the categories in what's shown (before picking one)
  const sel = $("catFilter"), cats = [...new Set(es.map(e => e.category || "Other"))].sort();
  if (ui.cat && !cats.includes(ui.cat)) cats.unshift(ui.cat);
  const eats = es.filter(e => e.category === EAT), meals = MEALS.filter(([m]) => eats.some(e => e.meal === m) || ui.meal === m);
  const mealOpts = meals.length ? meals.map(([m, n]) => `<option value="${EAT}|${m}">\u2003${esc(n)}</option>`).join("") + (eats.some(e => !e.meal) || ui.meal === "none" ? `<option value="${EAT}|none">\u2003Meal not set</option>` : "") : "";
  sel.innerHTML = `<option value="">All categories</option>` + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>` + (c === EAT ? mealOpts : "")).join("");
  sel.value = ui.cat + (ui.cat === EAT && ui.meal ? "|" + ui.meal : "");
  if (ui.cat) es = es.filter(e => (e.category || "Other") === ui.cat);
  // Eating out: a row of meals with their totals; tap one to see just those
  const mb = $("mealBar"), eatAll = ui.cat === EAT ? es : [];
  if (eatAll.length && eatAll.some(e => e.meal)) {
    const tot = f => money(sum(eatAll.filter(f), e => +e.amount), { whole: true });
    const opts = [["", "All", () => true]].concat(MEALS.filter(([m]) => eatAll.some(e => e.meal === m)).map(([m, n]) => [m, n, e => e.meal === m]))
      .concat(eatAll.some(e => !e.meal) ? [["none", "Not set", e => !e.meal]] : []);
    mb.innerHTML = opts.map(([m, n, f]) => `<button type="button" data-meal-f="${m}" aria-pressed="${(ui.meal || "") === m}">${esc(n)}${m ? `<b class="num">${esc(tot(f))}</b>` : ""}</button>`).join("");
    mb.hidden = false;
  } else { mb.hidden = true; mb.innerHTML = ""; }
  if (ui.cat === EAT && ui.meal) es = es.filter(e => ui.meal === "none" ? !e.meal : e.meal === ui.meal);
  es.sort(byNewest);
  // the total of whatever is chosen
  const out = sum(es.filter(e => e.type === "expense"), e => +e.amount), inc = sum(es.filter(e => e.type === "income"), e => +e.amount);
  const sv = sum(es.filter(e => e.type === "save"), e => +e.amount) - sum(es.filter(e => e.type === "withdraw"), e => +e.amount);
  const what = [ui.cat && ui.cat === EAT && ui.meal ? EAT + ", " + (ui.meal === "none" ? "meal not set" : mealName(ui.meal)) : ui.cat, ui.filter === "expense" ? "Spent" : ui.filter === "income" ? "Income" : ui.filter === "savings" ? "Savings" : ui.filter === "moved" ? "Moved" : ui.filter === "review" ? "Needs a look" : "", ui.search ? "\u201c" + ui.search + "\u201d" : ""].filter(Boolean).join(" · ") || "Everything";
  const allM = (ui.search || ui.filter === "review") && ui.searchAll;
  const scope = ui.search || ui.filter === "review" ? `<button type="button" class="linkish" data-search-all="${ui.searchAll ? "" : "1"}">${ui.searchAll ? "Just " + esc(monthName(ui.month)) : ui.filter === "review" ? "All months" : "Search all months"}</button>` : "";
  $("ledgerTotal").innerHTML = es.length ? `<span><b>${esc(what)}</b> ${allM ? "in all months" : "in " + esc(monthName(ui.month))}, ${es.length} entr${es.length === 1 ? "y" : "ies"}</span><span class="lt-sums">${out ? `<b class="num neg">${esc(money(out))}</b> spent` : ""}${out && (inc || sv) ? " · " : ""}${inc ? `<b class="num pos">${esc(money(inc))}</b> in` : ""}${inc && sv ? " · " : ""}${sv ? `<b class="num">${esc(money(sv))}</b> saved` : ""}</span>${ui.cat ? `<button type="button" class="linkish" data-cat-clear="1">Show all categories</button>` : ""}${scope}` : "";
  $("ledgerTotal").hidden = !es.length;
  if (!es.length) {
    if (ui.search || ui.cat) { list.innerHTML = `<li class="empty"><span>Nothing matches${ui.cat ? " in " + esc(ui.cat) : ""}${ui.search ? ' "' + esc(ui.search) + '"' : ""}${ui.search && ui.searchAll ? " in any month" : " in " + esc(monthName(ui.month))}.</span>${ui.search && !ui.searchAll ? `<button type="button" class="linkish" data-search-all="1">Search all months</button>` : ""}</li>`; return; }
    list.innerHTML = `<li class="empty"><span>${ui.filter === "review" ? (ui.searchAll ? "Nothing needs a look. Possible repeats and entries still under Other show up here." : "Nothing in " + esc(monthName(ui.month)) + " needs a look.") + (ui.searchAll ? "" : `</span><button type="button" class="linkish" data-search-all="1">Check all months</button><span>`) : ui.filter === "moved" ? "No moves between your own accounts this month. They're added when you import a bank statement." : ui.filter === "all" ? "Nothing logged " + (isAll() || ui.view === meId() ? "" : "for " + esc(pname(ui.view)) + " ") + "in " + esc(monthName(ui.month)) + " yet." : "No entries of this kind this month."}</span>${state.readOnly ? "" : `<span class="hint">Use the form to add your income first, then each thing you spend.</span>`}</li>`;
    return;
  }
  // long lists (a broad search across all months) draw the newest few hundred first
  const key = [ui.filter, ui.search, ui.searchAll, ui.cat, ui.meal, ui.month, ui.view].join("|");
  if (ui.capKey !== key) { ui.capKey = key; ui.cap = LIST_CAP; }
  const more = es.length - ui.cap; if (more > 0) es = es.slice(0, ui.cap);
  let html = "", lastDay = "";
  es.forEach(e => {
    if (e.date !== lastDay) {
      lastDay = e.date;
      html += `<li class="day">${esc(new Date(e.date + "T00:00:00").toLocaleDateString(undefined, ui.search && ui.searchAll ? { day: "numeric", month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" }))}</li>`;
    }
    html += rowHtml(e);
  });
  if (more > 0) html += `<li class="empty more-row"><button class="ghost" type="button" data-showmore="1">Show ${Math.min(more, LIST_CAP)} more</button><span class="hint">${more} not shown yet</span></li>`;
  list.innerHTML = html;
}

// ---------- the form ----------
export const MAX_AMOUNT = 10000000;
const LIST_CAP = 300;
// dates from 2000 up to a year ahead (bills and tickets can be booked ahead); anything else is almost surely a typo
export const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "") && d >= "2000-01-01" && d <= isoPlusDays(366);
const isoPlusDays = n => { const x = new Date(Date.now() + n * 864e5); return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); };
// something you added in the last 10 minutes with the same amount, type and date (and the same note, if both have one)
export function likelyRepeat(e) {
  const now = Date.now(), n = (e.note || "").trim().toLowerCase();
  return state.entries.find(x => x.type === e.type && Math.abs(+x.amount - +e.amount) < 0.005 && x.date === e.date && x.person === e.person &&
    now - (x.created || 0) < 10 * 60e3 && (!n || !x.note || x.note.trim().toLowerCase() === n)) || null;
}
const agoMin = t => { const m = Math.round((Date.now() - (t || 0)) / 60e3); return m < 1 ? "just now" : m === 1 ? "a minute ago" : m + " minutes ago"; };
const entryWho = () => meId();
const defaultDate = () => ui.month === monthKey(new Date()) ? todayISO() : ui.month + "-01";
// Eating out: which meal. A guess from the note or the clock is pre-picked for new entries; tap again to clear.
function syncMeal() {
  const on = ui.type === "expense" && $("fCat").value.trim() === EAT;
  $("mealRow").hidden = !on;
  if (on && !ui.mealPicked && !ui.editId) {
    const d = $("fDate").value, h = new Date().getHours();
    ui.fMeal = mealFromNote($("fNote").value) || (d === todayISO() ? mealAt(h) : "");
  }
  document.querySelectorAll("#mealSeg [data-meal]").forEach(b => b.setAttribute("aria-pressed", String(on && b.dataset.meal === ui.fMeal)));
}
function syncCatSel() {
  const sel = $("fCatSel"), inp = $("fCat"), v = inp.value.trim(), opts = catOptions(ui.type);
  sel.innerHTML = `<option value="">Choose a category</option>` + opts.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("") + `<option value="__other">+ New category…</option>`;
  if (v && opts.includes(v)) { sel.value = v; inp.hidden = true; }
  else if (v || ui.catOther) { sel.value = "__other"; inp.hidden = false; }
  else { sel.value = ""; inp.hidden = true; }
}
function renderForm() {
  const t = ui.type, goalMode = t === "save" || t === "withdraw", isMove = t === "move";
  const editing = ui.editId ? state.entries.find(x => x.id === ui.editId) : null, wasMove = !!(editing && editing.moved);
  document.querySelectorAll("#formPanel .seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
  $("catField").hidden = goalMode || isMove; $("goalField").hidden = !goalMode;
  $("moveRow").hidden = !(isMove || (wasMove && t === "save"));
  if (!$("moveRow").hidden) {
    const way = editing && editing.acctFrom ? " (" + editing.acctFrom + " → " + editing.acctTo + ")" : "";
    $("moveText").textContent = isMove ? "Moved between your own accounts" + way + ". It isn't counted as income or spending." : "This came from a move between your own accounts" + way + ". It now counts as savings.";
    $("moveToggle").textContent = isMove ? "Count it as savings instead" : "Make it a plain move again";
  }
  const src = editing && editing.importId ? "From your " + (editing.importLabel || "bank statement") + ". Undoing that import (Settings › Backup) removes it." : editing && editing.source === "transfer" ? "Money sent between people in Pocket Ledger. You can change the note, category and date; the amount stays what was sent." : "";
  $("srcHint").textContent = src; $("srcHint").hidden = !src;
  const gsel = $("fGoal");
  fillSelect(gsel, [["", t === "withdraw" ? "General savings" : "General savings (no goal)"]].concat(visibleGoals(entryWho()).map(g => [g.id, g.name])).concat(t === "save" ? [["__other", "Other"]] : []), ui.goalSel || gsel.value);
  $("purposeRow").hidden = !(t === "save" && gsel.value === "__other");
  $("goalLabel").textContent = t === "withdraw" ? "Take it from" : "Put it into";
  $("noteLabel").innerHTML = (t === "withdraw" ? "Reason" : "Note") + ' <span class="muted">(optional)</span>';
  $("fNote").placeholder = t === "withdraw" ? "e.g. Car repair, will put back" : t === "income" ? "e.g. October salary" : "e.g. Groceries at Agora";
  $("forRow").hidden = t !== "income";
  if (t === "income") {
    const k = ($("fDate").value || todayISO()).slice(0, 7);
    $("fFor").options[0].textContent = "This month (" + monthName(k, true) + ")";
    $("fFor").options[1].textContent = "Next month (" + monthName(shiftMonth(k, 1), true) + ")";
  }
  const other = otherOf(entryWho());
  $("splitRow").hidden = t !== "expense" || people().length < 2 || !other;
  $("splitLabel").textContent = "Split half with " + pname(other);
  $("repeatRow").hidden = !!ui.editId;
  const verb = { expense: "expense", income: "income", save: "savings", withdraw: "withdrawal", move: "move" }[t];
  $("submitBtn").textContent = (ui.editId ? "Update " : "Add ") + verb;
  $("formTitle").textContent = ui.editId ? "Edit entry" : "Add an entry";
  $("cancelEdit").hidden = !ui.editId;
  $("typeHint").textContent = {
    expense: "Money you spent. It comes out of what's left this month.",
    income: "Money coming in. If you're paid before the month ends, choose which month it's for.",
    save: "Money you move into savings. It leaves this month's spending money and adds to your savings or a goal.",
    withdraw: "Money taken out of your savings. It's deducted from your savings (and the goal, if you pick one) and added to this month's money. Put it back later with Save.",
    move: "Pick Spent, Income or Save above if this wasn't just a move between your own accounts."
  }[t];
  syncCatSel(); syncMeal();
  document.querySelectorAll("#formPanel button, #formPanel input, #formPanel select").forEach(el => { el.disabled = state.readOnly; });
  $("formPanel").hidden = state.readOnly;
}
export function setType(t) { ui.type = t; ui.goalSel = ""; renderForm(); }
function resetForm() {
  ui.editId = null; ui.catOther = false; ui.goalSel = ""; ui.fMeal = ""; ui.mealPicked = false;
  $("fAmount").readOnly = false;
  $("fAmount").value = ""; $("fCat").value = ""; $("fNote").value = ""; $("fPurpose").value = ""; $("fFor").value = "this";
  $("fCat").dataset.auto = ""; $("catHint").hidden = true;
  $("fDate").value = defaultDate(); $("formErr").hidden = true; $("fSplit").checked = false; $("fRepeat").checked = false;
  renderForm();
}
export function startEdit(id) {
  const e = state.entries.find(x => x.id === id); if (!e || !canEdit(e)) return;
  if (location.hash.replace("#", "").split("/")[0] !== "entries") go("entries");
  ui.editId = e.id; ui.type = e.type; ui.catOther = false; ui.goalSel = e.goalId || ""; ui.fMeal = e.meal || ""; ui.mealPicked = true;
  $("fAmount").value = e.amount; $("fDate").value = e.date; $("fNote").value = e.note || "";
  $("fAmount").readOnly = e.source === "transfer"; // money sent between people: the amount is what was sent
  $("fCat").value = e.type === "save" || e.type === "withdraw" || e.type === "move" ? "" : (e.category || "");
  $("fFor").value = e.countMonth && e.countMonth !== (e.date || "").slice(0, 7) ? "next" : "this";
  $("fSplit").checked = !!e.split; $("fRepeat").checked = false;
  renderForm();
  setTimeout(() => { $("formPanel").scrollIntoView({ behavior: "smooth", block: "start" }); $("fAmount").focus({ preventScroll: true }); }, 60);
}
export function focusAdd(type, goalId, pre) {
  go("entries");
  if (ui.editId) resetForm();
  if (type) setType(type);
  if (goalId) { ui.goalSel = goalId; renderForm(); }
  if (pre) {
    if (pre.amount) $("fAmount").value = pre.amount;
    if (pre.date) $("fDate").value = pre.date;
    if (pre.note) $("fNote").value = pre.note;
    if (pre.meal) { ui.fMeal = pre.meal; ui.mealPicked = true; }
    if (pre.category) { $("fCat").value = pre.category; syncCatSel(); syncMeal(); }
  }
  setTimeout(() => { $("formPanel").scrollIntoView({ behavior: "smooth", block: "start" }); $("fAmount").focus({ preventScroll: true }); }, 120);
}

async function submit(ev) {
  ev.preventDefault();
  if (state.readOnly) return;
  const amount = num($("fAmount").value), date = $("fDate").value;
  const err = m => { $("formErr").textContent = m; $("formErr").hidden = false; };
  if (!(amount > 0)) return err("Enter an amount greater than zero.");
  if (amount > MAX_AMOUNT) return err("That's over " + money(MAX_AMOUNT, { whole: true }) + ". Check the amount.");
  if (!date) return err("Pick a date.");
  if (!dateOk(date)) return err("Check the date: " + new Date(date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) + " looks like a typo.");
  const t = ui.type, goalMode = t === "save" || t === "withdraw";
  const e = { type: t, amount, date, note: $("fNote").value.trim(), created: Date.now(), person: entryWho() };
  if (t === "expense" && $("fSplit").checked && !$("splitRow").hidden) e.split = { with: otherOf(e.person), share: 0.5 };
  if (t === "income" && $("fFor").value === "next") e.countMonth = shiftMonth(date.slice(0, 7), 1);
  if (t === "move") e.category = "Moved";
  else if (goalMode) {
    const g = $("fGoal").value;
    e.goalId = g === "__other" ? "" : (g || ""); e.category = "Savings";
    if (t === "save" && g === "__other") { const pur = $("fPurpose").value.trim(); if (pur) e.note = "Saving for " + pur + (e.note ? " · " + e.note : ""); }
  } else {
    const typed = $("fCat").value.trim(), same = catOptions(t).find(c => c.toLowerCase() === typed.toLowerCase());
    e.category = same || typed || (t === "income" ? "Salary" : "Other");
  }
  if (t === "expense" && e.category === EAT && ui.fMeal) e.meal = ui.fMeal;
  if (t === "withdraw") {
    const avail = e.goalId ? goalBalance(e.goalId) : totalSavings(null, e.person);
    const before = ui.editId ? (state.entries.find(x => x.id === ui.editId) || {}) : {};
    const back = before.type === "withdraw" && before.goalId === e.goalId && (e.goalId || before.person === e.person) ? +before.amount : 0;
    if (amount > avail + back + 0.004) return err("That's more than you have saved there (" + money(avail + back) + ").");
  }
  // the same thing typed twice by mistake: ask once, a second tap adds it anyway (real repeats are fine)
  if (!ui.editId) {
    const twin = likelyRepeat(e);
    const sig = [e.type, e.amount, e.date, (e.note || "").toLowerCase(), e.category || ""].join("|");
    if (twin && ui.repeatOk !== sig) { ui.repeatOk = sig; return err("You added " + money(twin.amount) + (twin.note ? " (" + twin.note + ")" : "") + " " + agoMin(twin.created) + ". Tap " + $("submitBtn").textContent + " again to add another one."); }
    ui.repeatOk = "";
  }
  $("formErr").hidden = true;
  const wasEdit = ui.editId;
  if (wasEdit) {
    const old = state.entries.find(x => x.id === wasEdit);
    // keep where it came from (statement import, transfer, own-account move) so Undo import and matching still find it
    if (old) { if (old.created) e.created = old.created; ["ref", "refs", "loanId", "loanRole", "recurringId", "source", "author", "importId", "importLabel", "moved", "acctFrom", "acctTo", "legs", "transferId", "transferGroup", "transferFrom", "transferTo", "sample", "maybeDup"].forEach(k => { if (old[k] !== undefined && e[k] === undefined) e[k] = old[k]; }); }
    db.update(wasEdit, e);
    const n = old ? offerChangeAll(old, e) : 0;
    if (!n) toast("Entry updated");
  } else {
    db.add(e); toast("Added");
    if ($("fRepeat").checked) {
      createRecurring({ type: e.type, amount: e.amount, category: e.category, note: e.note || e.category, person: e.person, day: +date.slice(8, 10), startMonth: shiftMonth(date.slice(0, 7), 1), goalId: e.goalId, split: e.split });
      toast("Added. You'll be reminded on day " + (+date.slice(8, 10)) + " each month.");
    }
  }
  budgetCheck(e);
  resetForm(); $("fDate").value = date; renderForm();
  if (date.slice(0, 7) !== ui.month) { ui.month = date.slice(0, 7); changed(); }
  if (canHover()) $("fAmount").focus();
}

// ---------- one category change, everywhere ----------
// Changing an entry's category remembers it for that shop/person, and offers to change the others too.
const sameName = (e, k, type) => e.type === type && canEdit(e) && merchantKey(e.note) === k;
function offerChangeAll(old, e) {
  if ((e.type !== "expense" && e.type !== "income") || old.type !== e.type || !e.category || old.category === e.category) return 0;
  const k = merchantKey(e.note); if (k.length < 2) return 0;
  db.saveCatRule(e.type, k, e.category);
  const others = state.entries.filter(x => x.id !== old.id && sameName(x, k, e.type) && x.category !== e.category);
  if (!others.length) return 0;
  const name = (e.note || "").split(/:|,/)[0].replace(/^(Transfer to|From)\s+/i, "").trim() || k;
  toast("Also change " + others.length + " other " + name + " entr" + (others.length === 1 ? "y" : "ies") + " to " + e.category + "?", { action: "Change all", ms: 8000,
    onAction: () => { db.patchMany(others.map(x => x.id), { category: e.category }); toast(others.length + " more changed to " + e.category); } });
  return others.length;
}

// Find & replace: search all months, change the category of every match at once
function frMatches() {
  const q = $("frQ").value.trim().toLowerCase(), type = $("frType").value, from = $("frFrom").value;
  if (q.length < 2) return [];
  return state.entries.filter(e => e.type === type && canEdit(e) && (e.note || "").toLowerCase().includes(q) && (!from || (e.category || "Other") === from));
}
function frRender(keepFrom) {
  const type = $("frType").value, q = $("frQ").value.trim().toLowerCase();
  const pool = q.length >= 2 ? state.entries.filter(e => e.type === type && canEdit(e) && (e.note || "").toLowerCase().includes(q)) : [];
  const cats = [...new Set(pool.map(e => e.category || "Other"))].sort();
  fillSelect($("frFrom"), [["", "Any category"]].concat(cats.map(c => [c, c])), keepFrom);
  fillSelect($("frCat"), catOptions(type).map(c => [c, c]), $("frCat").value || "");
  const m = frMatches(), to = $("frCat").value, change = m.filter(e => (e.category || "Other") !== to);
  const box = $("frFound");
  if (q.length < 2) box.innerHTML = `<span class="hint">Type at least 2 letters.</span>`;
  else if (!m.length) box.innerHTML = `<span class="hint">Nothing matches "${esc($("frQ").value.trim())}".</span>`;
  else box.innerHTML = `<span><b>${m.length} found</b>, ${change.length} to change</span><ul>${m.slice().sort(byNewest).slice(0, 6).map(e => `<li><span>${esc(new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }))} · ${esc(e.note || "")}</span><span class="muted">${esc(e.category || "Other")}</span></li>`).join("")}</ul>${m.length > 6 ? `<small class="hint">and ${m.length - 6} more</small>` : ""}`;
  $("frGo").disabled = !change.length;
  $("frGo").textContent = change.length ? "Change " + change.length + " to " + to : "Change all";
}
export function openFindReplace(q) {
  if (state.readOnly) return toast("You can't change entries here.");
  $("frQ").value = q || ""; $("frType").value = "expense"; $("frCat").value = "";
  frRender(""); $("frWrap").hidden = false; document.body.classList.add("sheet-open");
  setTimeout(() => $("frQ").focus(), 60);
}
function closeFindReplace() { $("frWrap").hidden = true; document.body.classList.remove("sheet-open"); }
function frGo() {
  const to = $("frCat").value, type = $("frType").value, q = $("frQ").value.trim();
  const change = frMatches().filter(e => (e.category || "Other") !== to);
  if (!change.length || !to) return;
  db.patchMany(change.map(e => e.id), { category: to });
  if ($("frRemember").checked) {
    // remember the name as it's written in the notes (e.g. "veyla" for "Veyla Pvt Ltd")
    const keys = new Set(change.map(e => merchantKey(e.note)).filter(k => k.length >= 2));
    const ql = q.toLowerCase().replace(/\s+/g, " ");
    if ([...keys].some(k => k.startsWith(ql))) db.saveCatRule(type, ql, to); else keys.forEach(k => db.saveCatRule(type, k, to));
  }
  toast(change.length + " entr" + (change.length === 1 ? "y" : "ies") + " changed to " + to);
  closeFindReplace();
}

function exportCsv() {
  const rows = [["Date", "Person", "Type", "Category", "Meal", "Goal", "Note", "Amount", "Currency"]].concat(
    state.entries.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(e => [e.date, pname(e.person), e.type, e.category || "", mealName(e.meal), goalName(e.goalId), e.note || "", e.amount, state.settings.currency || "MVR"]));
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : v).join(",")).join("\r\n");
  saveFile("pocket-ledger-" + todayISO() + ".csv", "﻿" + csv, "Exported");
}
export { exportCsv };

export const page = {
  init() {
    $("fDate").value = defaultDate();
    $("entryForm").addEventListener("submit", submit);
    document.querySelectorAll("#formPanel .seg button").forEach(b => b.addEventListener("click", () => setType(b.dataset.t)));
    $("cancelEdit").addEventListener("click", resetForm);
    $("fDate").addEventListener("change", renderForm);
    $("fCatSel").addEventListener("change", () => {
      const sel = $("fCatSel"), inp = $("fCat");
      if (sel.value === "__other") { ui.catOther = true; inp.value = ""; inp.hidden = false; inp.focus(); }
      else { ui.catOther = false; inp.value = sel.value; inp.hidden = true; }
      inp.dataset.auto = ""; $("catHint").hidden = true; syncMeal();
    });
    $("mealSeg").addEventListener("click", ev => { const b = ev.target.closest("[data-meal]"); if (!b) return;
      ui.fMeal = ui.fMeal === b.dataset.meal ? "" : b.dataset.meal; ui.mealPicked = true; syncMeal(); });
    $("fCat").addEventListener("input", () => {
      const v = $("fCat").value.trim(), opts = catOptions(ui.type), low = v.toLowerCase();
      const same = opts.find(c => c.toLowerCase() === low), near = !same && low.length >= 3 && opts.find(c => c.toLowerCase().includes(low) || low.includes(c.toLowerCase()));
      $("fCat").dataset.auto = "";
      $("catHint").textContent = !v ? "" : same ? "You already have " + same + ", it'll go there." : near ? "Did you mean " + near + "? A new one gets its own bar and budget." : "New category: it gets its own bar and budget.";
      $("catHint").hidden = !v; syncMeal();
    });
    $("fNote").addEventListener("input", () => {
      if (ui.type === "save" || ui.type === "withdraw") return;
      const c = guessCategory($("fNote").value, ui.type), cat = $("fCat");
      if (c && (!cat.value || cat.dataset.auto === "1")) { cat.value = c; cat.dataset.auto = "1"; $("catHint").textContent = "Category from your past entries"; $("catHint").hidden = false; syncCatSel(); }
      else if (!c && cat.dataset.auto === "1") { cat.value = ""; cat.dataset.auto = ""; $("catHint").hidden = true; syncCatSel(); }
      syncMeal();
    });
    $("fGoal").addEventListener("change", () => { ui.goalSel = $("fGoal").value; $("purposeRow").hidden = $("fGoal").value !== "__other"; if ($("fGoal").value === "__other") $("fPurpose").focus(); });
    document.querySelectorAll("#ledgerPanel .chip").forEach(c => c.addEventListener("click", () => {
      ui.filter = c.dataset.f; ui.cat = ""; ui.meal = ""; if (!ui.search) ui.searchAll = false;
      document.querySelectorAll("#ledgerPanel .chip").forEach(x => x.setAttribute("aria-pressed", String(x === c)));
      renderLedger();
    }));
    let st = null;
    $("catFilter").addEventListener("change", () => { const [c, m] = $("catFilter").value.split("|"); ui.cat = c; ui.meal = m || ""; renderLedger(); });
    $("ledgerTotal").addEventListener("click", ev => { if (ev.target.closest("[data-cat-clear]")) { ui.cat = ""; ui.meal = ""; renderLedger(); } });
    $("ledger").addEventListener("click", ev => { if (ev.target.closest("[data-showmore]")) { ui.cap += LIST_CAP; renderLedger(); } });
    $("mealBar").addEventListener("click", ev => { const b = ev.target.closest("[data-meal-f]"); if (b) { ui.meal = b.dataset.mealF; renderLedger(); } });
    $("ledgerPanel").addEventListener("click", ev => { const b = ev.target.closest("[data-search-all]"); if (b) { ui.searchAll = !!b.dataset.searchAll; renderLedger(); } });
    $("searchQ").addEventListener("input", () => { clearTimeout(st); st = setTimeout(() => { ui.search = $("searchQ").value.trim(); if (!ui.search) ui.searchAll = false; renderLedger(); }, 200); });
    wireRows($("ledger"), renderLedger);
    $("exportBtn").addEventListener("click", exportCsv);
    $("frBtn").addEventListener("click", () => openFindReplace(ui.search));
    $("frClose").addEventListener("click", closeFindReplace);
    $("frWrap").addEventListener("click", ev => { if (ev.target === $("frWrap")) closeFindReplace(); });
    let ft = null;
    $("frQ").addEventListener("input", () => { clearTimeout(ft); ft = setTimeout(() => frRender(""), 150); });
    $("frType").addEventListener("change", () => { $("frCat").value = ""; frRender(""); });
    $("frFrom").addEventListener("change", () => frRender($("frFrom").value));
    $("frCat").addEventListener("change", () => frRender($("frFrom").value));
    $("frGo").addEventListener("click", frGo);
    $("moveToggle").addEventListener("click", () => { setType(ui.type === "move" ? "save" : "move"); });
    $("clearSamples").addEventListener("click", () => {
      state.entries.filter(e => e.sample).forEach(e => db.remove(e.id));
      state.goals.filter(g => g.sample).forEach(g => db.removeDoc("goals", g.id));
      toast("Examples cleared");
    });
  },
  enter() { if (!ui.editId) $("fDate").value = defaultDate(); },
  render() {
    $("sampleBanner").hidden = state.readOnly || !(state.entries.some(e => e.sample) || state.goals.some(g => g.sample));
    if (!ui.editId && document.activeElement !== $("fDate") && $("fDate").value.slice(0, 7) !== ui.month && !$("fAmount").value) $("fDate").value = defaultDate();
    renderLedger(); renderForm();
  }
};
export { byNewest };

// tapping a category (Home › Where the money went): every entry in it this month, with the total
export function showCategory(c, meal) {
  ui.cat = c; ui.meal = c === EAT ? (meal || "") : ""; ui.filter = "expense"; ui.search = ""; ui.searchAll = false;
  const q = $("searchQ"); if (q) q.value = "";
  document.querySelectorAll(".filters [data-f]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === "expense")));
  go("entries");
  setTimeout(() => { renderLedger(); const el = $("ledgerTotal"); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 80);
}

// Home › For you › Tidy up: the Needs a look list
export function showReview() {
  ui.filter = "review"; ui.cat = ""; ui.meal = ""; ui.search = ""; ui.searchAll = false; // the month shown on Home
  const q = $("searchQ"); if (q) q.value = "";
  document.querySelectorAll(".filters [data-f]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === "review")));
  go("entries");
  setTimeout(() => { renderLedger(); const el = $("ledgerPanel"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
}
