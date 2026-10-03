// Entries page: the add/edit form and every entry, searchable across months.
import { $, esc, money, num, sum, todayISO, monthKey, monthName, shiftMonth, toast, saveFile, fillSelect, canHover } from "../util.js";
import { state, ui, db, meId, isAll, isGroup, people, pname, pcolor, canEdit, addedBy, otherOf, inMonth, countsMoney,
  visibleGoals, goalBalance, goalName, totalSavings, catOptions, guessCategory, changed } from "../store.js";
import { createRecurring, budgetCheck, removeWithUndo } from "../actions.js";
import { go } from "../shell.js";

Object.assign(ui, { type: "expense", editId: null, filter: "all", search: "", cat: "", confirm: null, openRow: null, catOther: false, goalSel: "" });

// ---------- one entry row (also used on Home) ----------
const META = { expense: ["var(--c-spent)", "out", "−"], income: ["var(--c-left)", "in", "+"], save: ["var(--c-saved)", "sv", "→ "], withdraw: ["var(--c-saved)", "in", "← "] };
export function rowHtml(e, opts) {
  opts = opts || {};
  const meta = META[e.type] || ["var(--ink-3)", "out", ""];
  let title = e.category || "";
  if (e.type === "save") title = "Saved" + (goalName(e.goalId) ? " for " + goalName(e.goalId) : "");
  if (e.type === "withdraw") title = "Took out of savings" + (goalName(e.goalId) ? " (" + goalName(e.goalId) + ")" : "");
  const tags = (e.split ? '<span class="owner-tag">Split</span>' : "") + (e.recurringId ? '<span class="owner-tag">Bill</span>' : "") +
    (e.countMonth && e.countMonth !== (e.date || "").slice(0, 7) ? '<span class="owner-tag">For ' + esc(monthName(e.countMonth, true)) + "</span>" : "") +
    (e.loanId && !countsMoney(e) ? '<span class="owner-tag">Loan · separate</span>' : "");
  const by = isGroup() && !isAll() ? addedBy(e) : "";
  const sub = [isAll() ? pname(e.person) : "", e.note || (e.type === "expense" ? "Spent" : e.type === "income" ? "Income" : "")].filter(Boolean).join(", ");
  const editable = !opts.noActions && canEdit(e);
  const acts = !editable ? "" : `<button type="button" class="icon-btn" data-edit="${e.id}" aria-label="Edit entry">Edit</button><button type="button" class="icon-btn danger" data-del="${e.id}" aria-label="Delete entry">Delete</button>`;
  return `<li class="tx${ui.openRow === e.id ? " open" : ""}" data-id="${e.id}"><span class="dot" style="background:${meta[0]}"></span>
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
  return state.entries.filter(e => (isAll() || e.person === ui.view) &&
    ((e.note || "") + " " + (e.category || "") + " " + String(e.amount) + " " + (e.ref || "") + " " + goalName(e.goalId)).toLowerCase().includes(q));
}
function renderLedger() {
  const list = $("ledger");
  if (!state.ready) { list.innerHTML = `<li class="empty">Loading your entries…</li>`; return; }
  let es = ui.search ? searchEntries() : inMonth(ui.month);
  if (ui.filter === "expense") es = es.filter(e => e.type === "expense");
  if (ui.filter === "income") es = es.filter(e => e.type === "income");
  if (ui.filter === "savings") es = es.filter(e => e.type === "save" || e.type === "withdraw");
  // category picker: the categories in what's shown (before picking one)
  const sel = $("catFilter"), cats = [...new Set(es.map(e => e.category || "Other"))].sort();
  if (ui.cat && !cats.includes(ui.cat)) cats.unshift(ui.cat);
  sel.innerHTML = `<option value="">All categories</option>` + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  sel.value = ui.cat;
  if (ui.cat) es = es.filter(e => (e.category || "Other") === ui.cat);
  es.sort(byNewest);
  // the total of whatever is chosen
  const out = sum(es.filter(e => e.type === "expense"), e => +e.amount), inc = sum(es.filter(e => e.type === "income"), e => +e.amount);
  const sv = sum(es.filter(e => e.type === "save"), e => +e.amount) - sum(es.filter(e => e.type === "withdraw"), e => +e.amount);
  const what = [ui.cat, ui.filter === "expense" ? "Spent" : ui.filter === "income" ? "Income" : ui.filter === "savings" ? "Savings" : "", ui.search ? "\u201c" + ui.search + "\u201d" : ""].filter(Boolean).join(" · ") || "Everything";
  $("ledgerTotal").innerHTML = es.length ? `<span><b>${esc(what)}</b> ${ui.search ? "in all months" : "in " + esc(monthName(ui.month))}, ${es.length} entr${es.length === 1 ? "y" : "ies"}</span><span class="lt-sums">${out ? `<b class="num neg">${esc(money(out))}</b> spent` : ""}${out && (inc || sv) ? " · " : ""}${inc ? `<b class="num pos">${esc(money(inc))}</b> in` : ""}${inc && sv ? " · " : ""}${sv ? `<b class="num">${esc(money(sv))}</b> saved` : ""}</span>${ui.cat ? `<button type="button" class="linkish" data-cat-clear="1">Show all categories</button>` : ""}` : "";
  $("ledgerTotal").hidden = !es.length;
  if (!es.length) {
    if (ui.search || ui.cat) { list.innerHTML = `<li class="empty"><span>Nothing matches${ui.cat ? " in " + esc(ui.cat) : ""}${ui.search ? ' "' + esc(ui.search) + '"' : ""}${ui.search ? "" : " in " + esc(monthName(ui.month))}.</span></li>`; return; }
    list.innerHTML = `<li class="empty"><span>${ui.filter === "all" ? "Nothing logged " + (isAll() || ui.view === meId() ? "" : "for " + esc(pname(ui.view)) + " ") + "in " + esc(monthName(ui.month)) + " yet." : "No entries of this kind this month."}</span>${state.readOnly ? "" : `<span class="hint">Use the form to add your income first, then each thing you spend.</span>`}</li>`;
    return;
  }
  let html = "", lastDay = "";
  es.forEach(e => {
    if (e.date !== lastDay) {
      lastDay = e.date;
      html += `<li class="day">${esc(new Date(e.date + "T00:00:00").toLocaleDateString(undefined, ui.search ? { day: "numeric", month: "short", year: "numeric" } : { weekday: "short", day: "numeric", month: "short" }))}</li>`;
    }
    html += rowHtml(e);
  });
  list.innerHTML = html;
}

// ---------- the form ----------
const entryWho = () => meId();
const defaultDate = () => ui.month === monthKey(new Date()) ? todayISO() : ui.month + "-01";
function syncCatSel() {
  const sel = $("fCatSel"), inp = $("fCat"), v = inp.value.trim(), opts = catOptions(ui.type);
  sel.innerHTML = `<option value="">Choose a category</option>` + opts.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("") + `<option value="__other">Other (type your own)…</option>`;
  if (v && opts.includes(v)) { sel.value = v; inp.hidden = true; }
  else if (v || ui.catOther) { sel.value = "__other"; inp.hidden = false; }
  else { sel.value = ""; inp.hidden = true; }
}
function renderForm() {
  const t = ui.type, goalMode = t === "save" || t === "withdraw";
  document.querySelectorAll("#formPanel .seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
  $("catField").hidden = goalMode; $("goalField").hidden = !goalMode;
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
  const verb = { expense: "expense", income: "income", save: "savings", withdraw: "withdrawal" }[t];
  $("submitBtn").textContent = (ui.editId ? "Update " : "Add ") + verb;
  $("formTitle").textContent = ui.editId ? "Edit entry" : "Add an entry";
  $("cancelEdit").hidden = !ui.editId;
  $("typeHint").textContent = {
    expense: "Money you spent. It comes out of what's left this month.",
    income: "Money coming in. If you're paid before the month ends, choose which month it's for.",
    save: "Money you move into savings. It leaves this month's spending money and adds to your savings or a goal.",
    withdraw: "Money taken out of your savings. It's deducted from your savings (and the goal, if you pick one) and added to this month's money. Put it back later with Save."
  }[t];
  syncCatSel();
  document.querySelectorAll("#formPanel button, #formPanel input, #formPanel select").forEach(el => { el.disabled = state.readOnly; });
  $("formPanel").hidden = state.readOnly;
}
export function setType(t) { ui.type = t; ui.goalSel = ""; renderForm(); }
function resetForm() {
  ui.editId = null; ui.catOther = false; ui.goalSel = "";
  $("fAmount").value = ""; $("fCat").value = ""; $("fNote").value = ""; $("fPurpose").value = ""; $("fFor").value = "this";
  $("fCat").dataset.auto = ""; $("catHint").hidden = true;
  $("fDate").value = defaultDate(); $("formErr").hidden = true; $("fSplit").checked = false; $("fRepeat").checked = false;
  renderForm();
}
export function startEdit(id) {
  const e = state.entries.find(x => x.id === id); if (!e || !canEdit(e)) return;
  if (location.hash.replace("#", "").split("/")[0] !== "entries") go("entries");
  ui.editId = e.id; ui.type = e.type; ui.catOther = false; ui.goalSel = e.goalId || "";
  $("fAmount").value = e.amount; $("fDate").value = e.date; $("fNote").value = e.note || "";
  $("fCat").value = e.type === "save" || e.type === "withdraw" ? "" : (e.category || "");
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
    if (pre.category) { $("fCat").value = pre.category; syncCatSel(); }
  }
  setTimeout(() => { $("formPanel").scrollIntoView({ behavior: "smooth", block: "start" }); $("fAmount").focus({ preventScroll: true }); }, 120);
}

async function submit(ev) {
  ev.preventDefault();
  if (state.readOnly) return;
  const amount = num($("fAmount").value), date = $("fDate").value;
  const err = m => { $("formErr").textContent = m; $("formErr").hidden = false; };
  if (!(amount > 0)) return err("Enter an amount greater than zero.");
  if (!date) return err("Pick a date.");
  const t = ui.type, goalMode = t === "save" || t === "withdraw";
  const e = { type: t, amount, date, note: $("fNote").value.trim(), created: Date.now(), person: entryWho() };
  if (t === "expense" && $("fSplit").checked && !$("splitRow").hidden) e.split = { with: otherOf(e.person), share: 0.5 };
  if (t === "income" && $("fFor").value === "next") e.countMonth = shiftMonth(date.slice(0, 7), 1);
  if (goalMode) {
    const g = $("fGoal").value;
    e.goalId = g === "__other" ? "" : (g || ""); e.category = "Savings";
    if (t === "save" && g === "__other") { const pur = $("fPurpose").value.trim(); if (pur) e.note = "Saving for " + pur + (e.note ? " · " + e.note : ""); }
  } else e.category = $("fCat").value.trim() || (t === "income" ? "Salary" : "Other");
  if (t === "withdraw") {
    const avail = e.goalId ? goalBalance(e.goalId) : totalSavings(null, e.person);
    const before = ui.editId ? (state.entries.find(x => x.id === ui.editId) || {}) : {};
    const back = before.type === "withdraw" && before.goalId === e.goalId && (e.goalId || before.person === e.person) ? +before.amount : 0;
    if (amount > avail + back + 0.004) return err("That's more than you have saved there (" + money(avail + back) + ").");
  }
  $("formErr").hidden = true;
  const wasEdit = ui.editId;
  if (wasEdit) {
    const old = state.entries.find(x => x.id === wasEdit);
    if (old) { if (old.created) e.created = old.created; ["ref", "loanId", "loanRole", "recurringId", "source", "author"].forEach(k => { if (old[k] !== undefined && e[k] === undefined) e[k] = old[k]; }); }
    db.update(wasEdit, e); toast("Entry updated");
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

function exportCsv() {
  const rows = [["Date", "Person", "Type", "Category", "Goal", "Note", "Amount", "Currency"]].concat(
    state.entries.slice().sort((a, b) => (a.date || "").localeCompare(b.date || "")).map(e => [e.date, pname(e.person), e.type, e.category || "", goalName(e.goalId), e.note || "", e.amount, state.settings.currency || "MVR"]));
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
      inp.dataset.auto = ""; $("catHint").hidden = true;
    });
    $("fCat").addEventListener("input", () => { $("fCat").dataset.auto = ""; $("catHint").hidden = true; });
    $("fNote").addEventListener("input", () => {
      if (ui.type === "save" || ui.type === "withdraw") return;
      const c = guessCategory($("fNote").value, ui.type), cat = $("fCat");
      if (c && (!cat.value || cat.dataset.auto === "1")) { cat.value = c; cat.dataset.auto = "1"; $("catHint").textContent = "Category from your past entries"; $("catHint").hidden = false; syncCatSel(); }
      else if (!c && cat.dataset.auto === "1") { cat.value = ""; cat.dataset.auto = ""; $("catHint").hidden = true; syncCatSel(); }
    });
    $("fGoal").addEventListener("change", () => { ui.goalSel = $("fGoal").value; $("purposeRow").hidden = $("fGoal").value !== "__other"; if ($("fGoal").value === "__other") $("fPurpose").focus(); });
    document.querySelectorAll("#ledgerPanel .chip").forEach(c => c.addEventListener("click", () => {
      ui.filter = c.dataset.f;
      document.querySelectorAll("#ledgerPanel .chip").forEach(x => x.setAttribute("aria-pressed", String(x === c)));
      renderLedger();
    }));
    let st = null;
    $("catFilter").addEventListener("change", () => { ui.cat = $("catFilter").value; renderLedger(); });
    $("ledgerTotal").addEventListener("click", ev => { if (ev.target.closest("[data-cat-clear]")) { ui.cat = ""; renderLedger(); } });
    $("searchQ").addEventListener("input", () => { clearTimeout(st); st = setTimeout(() => { ui.search = $("searchQ").value.trim(); renderLedger(); }, 200); });
    wireRows($("ledger"), renderLedger);
    $("exportBtn").addEventListener("click", exportCsv);
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
export function showCategory(c) {
  ui.cat = c; ui.filter = "expense"; ui.search = "";
  const q = $("searchQ"); if (q) q.value = "";
  document.querySelectorAll(".filters [data-f]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.f === "expense")));
  go("entries");
  setTimeout(() => { renderLedger(); const el = $("ledgerTotal"); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); }, 80);
}
