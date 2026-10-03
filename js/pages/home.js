// Home: the dashboard for the month you're looking at.
import { $, esc, money, num, sum, monthKey, monthName, shiftMonth, lsGet, lsSet, lsJson, toast } from "../util.js";
import { state, ui, db, isAll, isGroup, isOwner, isMine, pname, pcolor, poss, groupName, meId, monthTotals, totalSavings, inMonth, effMonth, countsMoney,
  visibleGoals, goalBalance, openBills, dueText, openLoans, loanOutstanding, owesPairs, budgetsFor, spentIn, EXP_CATS, LOAN_OUT, LOAN_BACK_OUT, changed, canEdit } from "../store.js";
import { settlePair } from "../actions.js";
import { rowHtml, wireRows, byNewest } from "./entries.js";
import { renderDue, wireDue } from "./bills.js";

Object.assign(ui, { tileCfg: false, editBudgets: false, settling: null, trendSel: null });
const TILES = [["income", "Income"], ["spent", "Spent"], ["saved", "Saved this month"], ["total", "Total savings"], ["split", "Income split bar"], ["bills", "Bills due"], ["budgets", "Budget alerts"], ["loans", "Loans"], ["goals", "Goals"]];
const hiddenTiles = () => lsJson("pl-tiles", []);
const whoName = () => isAll() ? groupName() : isMine(ui.view) ? "You" : pname(ui.view);

function delta(a, b) {
  if (!b) return " ";
  const d = a - b; if (Math.abs(d) < 0.005) return "same as last month";
  return (d > 0 ? "+" : "−") + money(Math.abs(d), { whole: true }) + " vs last month";
}

function renderHero() {
  const t = monthTotals(ui.month), prev = monthTotals(shiftMonth(ui.month, -1)), hasIncome = t.income > 0;
  $("heroLabel").textContent = isAll() ? "Left to spend this month: " + groupName() : isMine(ui.view) ? "Left to spend this month" : "Left to spend this month: " + pname(ui.view);
  const big = $("leftBig"); big.textContent = money(t.left); big.classList.toggle("neg", t.left < 0);
  let sub;
  if (!hasIncome && t.spent === 0 && t.netSaved === 0) sub = "Add " + (isAll() ? "income" : poss(ui.view) + " income") + " for " + monthName(ui.month, true) + " to see what's left.";
  else if (!hasIncome) sub = "No income logged for this month yet.";
  else if (t.left < 0) sub = (isMine(ui.view) ? "You've" : whoName() + " has") + " gone " + money(-t.left) + " over this month's income.";
  else {
    if (ui.month === monthKey(new Date())) {
      const d = new Date(), daysLeft = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
      sub = "About " + money(t.left / daysLeft, { whole: true }) + " a day for the " + daysLeft + " day" + (daysLeft === 1 ? "" : "s") + " left.";
    } else sub = "What was left at the end of " + monthName(ui.month) + ".";
  }
  $("leftSub").textContent = sub;
  $("copyIncome").hidden = state.readOnly || hasIncome || !inMonth(shiftMonth(ui.month, -1)).some(e => e.type === "income" && canEdit(e));
  document.querySelectorAll("#pg-home .hero-acts [data-go-add], #pg-home .hero-acts [data-scan]").forEach(b => { b.hidden = state.readOnly; });

  const base = Math.max(t.income, t.spent + Math.max(t.netSaved, 0)) || 0;
  const parts = [{ k: "Spent", v: t.spent, c: "var(--c-spent)" }, { k: "Saved", v: Math.max(t.netSaved, 0), c: "var(--c-saved)" }, { k: "Left", v: Math.max(t.left, 0), c: "var(--c-left)" }];
  $("split").innerHTML = base ? parts.filter(p => p.v > 0).map(p => `<div title="${p.k}: ${esc(money(p.v))}" style="width:${p.v / base * 100}%;background:${p.c}"></div>`).join("") : "";
  $("legend").innerHTML = parts.map(p => `<span><i style="background:${p.c}"></i>${p.k}${t.income ? ` <b class="num">${Math.round(p.v / t.income * 100)}%</b>` : ""}</span>`).join("");
  $("sIncome").textContent = money(t.income); $("sIncomeH").textContent = delta(t.income, prev.income);
  $("sSpent").textContent = money(t.spent); $("sSpentH").textContent = delta(t.spent, prev.spent);
  $("sSaved").textContent = money(t.netSaved);
  $("sSavedH").textContent = t.withdraw ? money(t.withdraw) + " withdrawn" : "\u00a0";
  const isPast = ui.month < monthKey(new Date());
  $("sTotal").textContent = money(totalSavings(isPast ? ui.month : null));
  $("sTotalH").textContent = isPast ? "at end of " + monthName(ui.month, true) : (isAll() ? "everyone, all goals" : "across all goals");
}

function renderTiles() {
  const hide = new Set(hiddenTiles()), who = ui.view, tiles = [];
  document.querySelectorAll("#pg-home [data-tile]").forEach(el => { el.hidden = hide.has(el.dataset.tile); });
  if (!hide.has("bills")) {
    const bills = openBills(who), red = bills.filter(b => b.level === "red").length;
    tiles.push(`<a href="#bills" class="tile ${red ? "t-red" : bills.length ? "t-amber" : "t-ok"}"><div class="label">Bills due</div><div class="v">${bills.length ? bills.length + " due" : "All clear"}</div><div class="h">${bills.length ? esc((bills[0].r.note || bills[0].r.category) + " " + dueText(bills[0])) : "Nothing due soon"}</div></a>`);
  }
  if (!hide.has("budgets")) {
    const b = budgetsFor(who), over = [], near = [];
    Object.keys(b).forEach(c => { const lim = +b[c]; if (!(lim > 0)) return; const sp = spentIn(ui.month, who, c); if (sp >= lim) over.push(c + " +" + money(sp - lim, { whole: true })); else if (sp >= lim * 0.8) near.push(c); });
    const n = Object.keys(b).filter(c => +b[c] > 0).length;
    tiles.push(`<a href="#home" data-jump="budgetList" class="tile ${over.length ? "t-red" : near.length ? "t-amber" : "t-ok"}"><div class="label">Budgets</div><div class="v">${!n ? "None set" : over.length ? over.length + " over" : near.length ? near.length + " close" : "On track"}</div><div class="h">${esc(over.length ? over.join(", ") : near.length ? near.join(", ") + " at 80%+" : n ? "All under limit" : "Set them under Budgets below")}</div></a>`);
  }
  if (!hide.has("loans")) {
    const ls = openLoans(who), owedToMe = sum(ls.filter(l => l.direction === "lent"), loanOutstanding), iOwe = sum(ls.filter(l => l.direction === "borrowed"), loanOutstanding);
    tiles.push(`<a href="#loans" class="tile"><div class="label">Loans</div><div class="v num">${ls.length ? esc(money(iOwe, { whole: true })) : "None"}</div><div class="h">${ls.length ? "owed by " + (isAll() ? "the group" : "you") + ", " + esc(money(owedToMe, { whole: true })) + " owed to " + (isAll() ? "the group" : "you") : "No open loans"}</div></a>`);
  }
  if (!hide.has("goals")) {
    const gs = visibleGoals(who).filter(g => +g.target > 0);
    const g = gs.map(g => ({ g, p: Math.min(100, Math.round(goalBalance(g.id) / +g.target * 100)) })).sort((a, b) => b.p - a.p)[0];
    tiles.push(`<a href="#goals" class="tile"><div class="label">Goals</div><div class="v">${g ? g.p + "%" : "None"}</div><div class="h">${g ? esc(g.g.name) + (gs.length > 1 ? " and " + (gs.length - 1) + " more" : "") : "Create one on the Goals page"}</div></a>`);
  }
  $("tiles").innerHTML = tiles.join(""); $("tiles").hidden = !tiles.length;
  $("tileCfg").innerHTML = ui.tileCfg ? `<p class="hint">Choose what shows here on this device:</p><div class="tile-opts">${TILES.map(([k, l]) => `<label class="check"><input type="checkbox" data-tk="${k}" ${hide.has(k) ? "" : "checked"}><span>${l}</span></label>`).join("")}</div>` : "";
  $("tileCfg").hidden = !ui.tileCfg;
  $("tileBtn").textContent = ui.tileCfg ? "Done" : "Customize";
}

function renderOwes() {
  const pairs = owesPairs(), box = $("owesBar");
  if (!pairs.length) { box.hidden = true; return; }
  box.hidden = false;
  const nm = id => id === meId() ? "You" : pname(id);
  box.innerHTML = pairs.map((p, i) => ui.settling === i
    ? `<div class="owe-row"><span>Mark <b>${esc(money(p.amt))}</b> as paid by ${esc(pname(p.debtor))} to ${esc(pname(p.creditor))}?</span><span class="row-btns"><button class="primary" type="button" data-settle-ok="${i}">Yes, settled</button><button class="icon-btn" type="button" data-settle-no="1">Cancel</button></span></div>`
    : `<div class="owe-row"><span><i class="pdot" style="background:${pcolor(p.debtor)}"></i><b>${esc(nm(p.debtor))}</b> ${p.debtor === meId() ? "owe" : "owes"} <b>${esc(p.creditor === meId() ? "you" : pname(p.creditor))}</b> <b class="num">${esc(money(p.amt))}</b> for shared costs</span>${state.readOnly ? "" : `<button class="ghost" type="button" data-settle="${i}">Settle up</button>`}</div>`).join("");
}

function renderCats() {
  const es = inMonth(ui.month).filter(e => e.type === "expense" && countsMoney(e)), total = sum(es, e => +e.amount), by = {};
  es.forEach(e => { const c = e.category || "Other"; by[c] = (by[c] || 0) + +e.amount; });
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
  $("catNote").textContent = total ? money(total) + " total" : "";
  if (!rows.length) { $("cats").innerHTML = `<div class="empty small">Spending by category will show here.</div>`; return; }
  const max = rows[0][1];
  $("cats").innerHTML = rows.map(([c, v]) => `<button type="button" class="cat" data-cat-go="${esc(c)}" title="See every ${esc(c)} entry: ${esc(money(v))} (${Math.round(v / total * 100)}%)"><span class="n">${esc(c)}</span><div class="track"><div class="fill" style="width:${Math.max(v / max * 100, 1.5)}%"></div></div><span class="v num">${esc(money(v, { whole: true }))}<small>${Math.round(v / total * 100)}%</small></span></button>`).join("");
}

function renderBudgets() {
  const b = budgetsFor(ui.view), cats = Object.keys(b).filter(c => +b[c] > 0), box = $("budgetList");
  const canSet = !state.readOnly && (!isGroup() || isOwner());
  if (ui.editBudgets && canSet && box.querySelector("input[data-cat]")) return;
  if (ui.editBudgets && canSet) {
    const all = [...new Set(EXP_CATS.filter(c => c !== LOAN_OUT).concat(state.entries.filter(e => e.type === "expense").map(e => e.category).filter(c => c && c !== LOAN_OUT && c !== LOAN_BACK_OUT)))];
    box.innerHTML = `<p class="hint">Monthly limits for ${esc(isAll() ? "the whole of " + groupName() : isMine(ui.view) ? "you" : pname(ui.view))}. Leave empty for no limit.</p>` +
      all.map((c, i) => `<div class="bud-edit"><label for="bud${i}">${esc(c)}</label><input id="bud${i}" data-cat="${esc(c)}" type="number" inputmode="decimal" min="0" step="1" value="${b[c] || ""}" placeholder="No limit"></div>`).join("") +
      `<div class="formfoot"><button class="primary" type="button" id="budSave">Save budgets</button><button class="icon-btn" type="button" id="budCancel">Cancel</button></div>`;
    $("budgetBtn").hidden = true; return;
  }
  $("budgetBtn").hidden = !canSet;
  $("budgetBtn").textContent = cats.length ? "Edit budgets" : "Set budgets";
  box.innerHTML = cats.length ? cats.map(c => {
    const lim = +b[c], sp = spentIn(ui.month, ui.view, c), pct = Math.round(sp / lim * 100), cls = pct >= 100 ? "over" : pct >= 80 ? "near" : "";
    return `<div class="bud ${cls}"><div class="bud-top"><span>${esc(c)}</span><span class="num">${esc(money(sp, { whole: true }))} of ${esc(money(lim, { whole: true }))}</span></div><div class="meter"><div style="width:${Math.min(100, pct)}%"></div></div><small>${pct >= 100 ? "Over by " + esc(money(sp - lim, { whole: true })) : esc(money(lim - sp, { whole: true })) + " left, " + pct + "% used"}</small></div>`;
  }).join("") : `<p class="hint">No budgets yet. Set a monthly limit for any category and you'll get a heads-up at 80%.</p>`;
}

function renderRecent() {
  const es = inMonth(ui.month).slice().sort(byNewest).slice(0, 5);
  $("recentList").innerHTML = !state.ready ? `<li class="empty">Loading…</li>` : es.length ? es.map(e => rowHtml(e, { showDate: true })).join("") : `<li class="empty"><span>Nothing logged in ${esc(monthName(ui.month))} yet.</span></li>`;
}

// ---------- 12-month trend ----------
function renderTrend() {
  const who = ui.view, months = [];
  for (let i = 11; i >= 0; i--) months.push(shiftMonth(ui.month, -i));
  const data = months.map(k => {
    const es = state.entries.filter(e => effMonth(e) === k && countsMoney(e) && (who === "all" || e.person === who));
    return { k, inc: sum(es.filter(e => e.type === "income"), e => +e.amount), out: sum(es.filter(e => e.type === "expense"), e => +e.amount) };
  });
  const max = Math.max(1, ...data.map(d => Math.max(d.inc, d.out)));
  const step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
  const W = Math.max(300, Math.round($("trendChart").clientWidth || 640)), H = 200, L = 40, B = 24, T = 10, cw = (W - L - 6) / 12, bw = Math.max(3, Math.min(14, cw * 0.32));
  const y = v => T + (H - T - B) * (1 - v / top);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Income and spending for the last 12 months">`;
  [0, 0.5, 1].forEach(f => { const v = top * f, yy = y(v); svg += `<line x1="${L}" x2="${W - 4}" y1="${yy}" y2="${yy}" class="grid"/><text x="${L - 6}" y="${yy + 4}" text-anchor="end" class="ax">${v >= 1000 ? Math.round(v / 1000) + "k" : Math.round(v)}</text>`; });
  data.forEach((d, i) => {
    const cx = L + cw * i + cw / 2, cur = d.k === ui.month;
    const bar = (v, x, cls, lab) => v > 0 ? `<path class="${cls}" d="M${x},${y(0)} V${y(v) + 3} q0,-3 3,-3 h${bw - 6} q3,0 3,3 V${y(0)} Z"><title>${monthName(d.k, true)} ${lab}: ${money(v, { whole: true })}</title></path>` : "";
    svg += `<g class="mon${cur ? " cur" : ""}${ui.trendSel === d.k ? " sel" : ""}" data-k="${d.k}"><rect x="${cx - cw / 2}" y="${T}" width="${cw}" height="${H - T}" class="hit"/>` + bar(d.inc, cx - bw - 1, "inc", "income") + bar(d.out, cx + 1, "out", "spent") +
      `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="ax${cur ? " curt" : ""}">${new Date(d.k + "-01T00:00:00").toLocaleDateString(undefined, { month: "short" }).slice(0, cw < 30 ? 1 : 3)}</text></g>`;
  });
  $("trendChart").innerHTML = svg + "</svg>";
  const tot = data.reduce((a, d) => ({ inc: a.inc + d.inc, out: a.out + d.out }), { inc: 0, out: 0 });
  $("trendNote").textContent = whoName() + ", last 12 months: in " + money(tot.inc, { whole: true }) + ", out " + money(tot.out, { whole: true });
  const k = ui.trendSel, det = $("trendDetail");
  if (!k) { det.hidden = true; return; }
  const es = state.entries.filter(e => effMonth(e) === k && countsMoney(e) && (who === "all" || e.person === who));
  const inc = sum(es.filter(e => e.type === "income"), e => +e.amount), out = sum(es.filter(e => e.type === "expense"), e => +e.amount);
  const sav = sum(es, e => e.type === "save" ? +e.amount : e.type === "withdraw" ? -e.amount : 0);
  const cats = {}; es.filter(e => e.type === "expense").forEach(e => { cats[e.category || "Other"] = (cats[e.category || "Other"] || 0) + +e.amount; });
  const topc = Object.entries(cats).sort((a, b) => b[1] - a[1])[0], rate = inc > 0 ? Math.round((inc - out) / inc * 100) : null;
  det.hidden = false;
  det.innerHTML = `<div class="td-head"><b>${esc(monthName(k))}</b>${k !== ui.month ? `<button class="ghost" type="button" data-trendgo="${k}">Open this month</button>` : `<span class="muted">Showing now</span>`}</div>
    <div class="td-grid num"><span>In <b>${esc(money(inc, { whole: true }))}</b></span><span>Out <b>${esc(money(out, { whole: true }))}</b></span><span>Saved <b>${esc(money(sav, { whole: true }))}</b></span><span>Kept <b>${rate === null ? "–" : rate + "%"}</b></span></div>
    ${topc ? `<small>Biggest spend: ${esc(topc[0])}, ${esc(money(topc[1], { whole: true }))}</small>` : `<small>No spending recorded.</small>`}`;
}

export const page = {
  init() {
    wireDue($("dueBar"), () => page.render());
    wireRows($("recentList"), renderRecent);
    $("tileBtn").addEventListener("click", () => { ui.tileCfg = !ui.tileCfg; renderTiles(); });
    $("tileCfg").addEventListener("change", ev => {
      const c = ev.target.closest("input[data-tk]"); if (!c) return;
      const h = new Set(hiddenTiles()); c.checked ? h.delete(c.dataset.tk) : h.add(c.dataset.tk);
      lsSet("pl-tiles", JSON.stringify([...h])); renderTiles();
    });
    $("tiles").addEventListener("click", ev => { const a = ev.target.closest("[data-jump]"); if (a) { ev.preventDefault(); $(a.dataset.jump).scrollIntoView({ behavior: "smooth", block: "center" }); } });
    $("owesBar").addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.settle != null) { ui.settling = +b.dataset.settle; renderOwes(); }
      else if (b.dataset.settleNo) { ui.settling = null; renderOwes(); }
      else if (b.dataset.settleOk != null) { const p = owesPairs()[+b.dataset.settleOk]; if (p) settlePair(p); ui.settling = null; toast("Settled up"); }
    });
    $("budgetBtn").addEventListener("click", () => { ui.editBudgets = true; renderBudgets(); });
    $("budgetList").addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      if (b.id === "budCancel") { ui.editBudgets = false; renderBudgets(); }
      else if (b.id === "budSave") {
        const nb = {}; $("budgetList").querySelectorAll("input[data-cat]").forEach(i => { const v = num(i.value); if (v > 0) nb[i.dataset.cat] = v; });
        const all = Object.assign({}, state.settings.budgets || {}); all[ui.view] = nb;
        db.saveSettings({ budgets: all }); ui.editBudgets = false; toast("Budgets saved"); renderBudgets();
      }
    });
    $("copyIncome").addEventListener("click", () => {
      const src = inMonth(shiftMonth(ui.month, -1)).filter(e => e.type === "income" && canEdit(e));
      const [y, m] = ui.month.split("-").map(Number), last = new Date(y, m, 0).getDate();
      src.forEach((e, i) => db.add({ type: "income", amount: +e.amount, category: e.category, note: e.note || "", date: ui.month + "-" + String(Math.min(+e.date.slice(8), last)).padStart(2, "0"), created: Date.now() + i, person: e.person }));
      toast("Copied " + src.length + " income entr" + (src.length === 1 ? "y" : "ies"));
    });
    $("trendChart").addEventListener("click", ev => { const g = ev.target.closest("g.mon"); if (!g) return; ui.trendSel = g.dataset.k; renderTrend(); });
    $("trendDetail").addEventListener("click", ev => { const b = ev.target.closest("[data-trendgo]"); if (b) { ui.month = b.dataset.trendgo; ui.trendSel = null; changed(); } });
    let rt = null; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!$("pg-home").hidden) renderTrend(); }, 200); });
  },
  render() {
    renderDue($("dueBar"), 4);
    renderOwes(); renderHero(); renderTiles(); renderCats(); renderBudgets(); renderRecent(); renderTrend();
  }
};
