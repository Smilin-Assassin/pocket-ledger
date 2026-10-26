// Home: the dashboard for the month you're looking at.
import { renderSmart } from "../smart.js";
import { $, esc, money, num, sum, monthKey, monthName, shiftMonth, lsGet, lsSet, lsJson, toast } from "../util.js";
import { state, ui, db, isAll, isGroup, isOwner, isMine, pname, pcolor, poss, groupName, meId, monthTotals, totalSavings, inMonth, effMonth, countsMoney,
  visibleGoals, goalBalance, openBills, recurringMonth, dueText, openLoans, loanOutstanding, owesPairs, budgetsFor, spentIn, carriedIn, EXP_CATS, LOAN_OUT, LOAN_BACK_OUT, changed, canEdit } from "../store.js";
import { settlePair } from "../actions.js";
import { rowHtml, wireRows, byNewest } from "./entries.js";
import { renderDue, wireDue } from "./bills.js";
import { initFolds } from "../fold.js";
import { zoom } from "../dock.js";
import { ringShouldWait, watchRing, rollNumber, rollPending } from "../delight.js";

Object.assign(ui, { tileCfg: false, editBudgets: false, settling: null, trendSel: null });
const TILES = [["income", "Income"], ["spent", "Spent"], ["saved", "Saved this month"], ["total", "Total savings"], ["bills", "Bills due"], ["budgets", "Budget alerts"], ["loans", "Loans"], ["goals", "Goals"]];
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
  big.style.setProperty("--len", Math.max(10, big.textContent.length)); // longer amounts get a smaller size so they stay inside the ring
  // C: the first time the Dashboard shows real numbers after opening the app, the amount rolls up
  if (rollPending() && state.ready && (t.income || t.spent || t.carry) && document.getElementById("pg-home").offsetParent) rollNumber(big);
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
  if (t.carry > 0) sub += " Includes " + money(t.carry, { whole: true }) + " carried over.";
  // what the month's recurring expenses (rent, phone...) still have to take: the number to plan with
  const rb = recurringMonth(ui.month, ui.view);
  if (rb.toPay > 0 && ui.month >= monthKey(new Date()) && t.income + t.carry > 0) sub += " " + money(rb.toPay, { whole: true }) + " of bills still to pay, " + money(t.left - rb.toPay, { whole: true }) + " after them.";
  $("leftSub").textContent = sub;
  $("copyIncome").hidden = state.readOnly || hasIncome || !inMonth(shiftMonth(ui.month, -1)).some(e => e.type === "income" && canEdit(e));
  document.querySelectorAll("#pg-home .hero-acts [data-go-add], #pg-home .hero-acts [data-scan]").forEach(b => { b.hidden = state.readOnly; });

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
    Object.keys(b).forEach(c => { if (!(+b[c] > 0)) return; const lim = +b[c] + carriedIn(ui.month, who, c), sp = spentIn(ui.month, who, c); if (sp >= lim) over.push(c + " +" + money(sp - lim, { whole: true })); else if (sp >= lim * 0.8) near.push(c); });
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

// ---------- the ring: where this month's money went (v61: paper cut) ----------
// Every category is a rounded piece of paper sized by its share of what was spent (never thinner than a fingertip can hit). Touch (drag) or point
// at the ring and the piece under the finger lifts off the page and the middle shows it.
const R0 = 76, R1 = 116, RMIN = 0.22, TAU = 2 * Math.PI;
let ringArcs = [], ringSel = null;
const arcColor = i => i < 4 ? `var(--hero-c${i + 1})` : i % 2 ? "var(--hero-c5)" : "var(--hero-c6)";
const polar = (r, a) => [(132 + r * Math.sin(a)).toFixed(2), (132 - r * Math.cos(a)).toFixed(2)];
// A piece is the part of the ring between two radial lines, pulled in from each line by half the gap so every gap is the same width (not wider at the
// outside), then drawn with a stroke of the same colour so its corners are round. R0/R1 are the middle of that stroke; GAPP = the visible gap (3) + the stroke (8).
const GAPP = 11;
function sectorPath(a0, a1) {
  const d = GAPP / 2, off = r => Math.asin(Math.min(1, d / r));
  let i0 = a0 + off(R0), i1 = a1 - off(R0), u0 = a0 + off(R1), u1 = a1 - off(R1);
  if (i1 <= i0) i0 = i1 = (a0 + a1) / 2; if (u1 <= u0) u0 = u1 = (a0 + a1) / 2; // a piece squeezed thinner than the gap stays a thin line, never turns inside out
  const p = polar(R1, u0), q = polar(R1, u1), w = polar(R0, i1), z = polar(R0, i0);
  return `M${p}A${R1} ${R1} 0 ${u1 - u0 > Math.PI ? 1 : 0} 1 ${q}L${w}A${R0} ${R0} 0 ${i1 - i0 > Math.PI ? 1 : 0} 0 ${z}Z`;
}

function pickCat(i) {
  const a = ringArcs[i], box = $("catRing"), svg = box.querySelector("svg"), hr = box.closest(".hero-ring");
  ringSel = a ? a.c : null;
  hr.classList.toggle("picking", !!a);
  if (!svg) return;
  svg.classList.toggle("dim", !!a);
  svg.querySelectorAll(".seg").forEach(g => g.classList.toggle("sel", !!a && +g.dataset.i === i));
  if (!a) return;
  $("pickName").textContent = a.c;
  const amt = $("pickAmt"); amt.textContent = money(a.v, { whole: true }); amt.style.setProperty("--len", Math.max(8, amt.textContent.length));
  $("pickPct").textContent = a.pct + "% of what you spent";
  $("pickGo").dataset.i = String(i);
}
const openCat = i => { const b = $("cats").querySelector(`[data-ring="${i}"]`); if (b) b.click(); };

function renderCats() {
  const es = inMonth(ui.month).filter(e => e.type === "expense" && countsMoney(e)), total = sum(es, e => +e.amount), by = {};
  es.forEach(e => { const c = e.category || "Other"; by[c] = (by[c] || 0) + +e.amount; });
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]);
    $("catNote").textContent = rows.length ? " (" + rows.length + ")" : "";
  $("catMore").hidden = !rows.length; $("ringHint").hidden = !rows.length;
  if (!rows.length) { $("cats").hidden = true; $("catMore").setAttribute("aria-expanded", "false"); }
  // sizes: each category's true share of the spending, but never thinner than a fingertip can hit
  let shares = [];
  if (total) {
    const raw = rows.map(r => r[1] / total * TAU), small = raw.filter(x => x < RMIN).length;
    const bigSum = raw.reduce((s, x) => x >= RMIN ? s + x : s, 0), room = TAU - small * RMIN, k = bigSum > 0 && room > 0 ? room / bigSum : 1;
    shares = raw.map(x => x < RMIN ? RMIN : x * k);
    const all = shares.reduce((s, x) => s + x, 0); if (all > TAU) shares = shares.map(x => x * TAU / all);
  }
  let a0 = 0; ringArcs = rows.map(([c, v], i) => { const a = { c, v, i, a0, a1: a0 + (shares[i] || 0), pct: Math.round(v / total * 100), col: arcColor(i) }; a0 = a.a1; return a; });
  const wait = ringShouldWait() && state.ready && rows.length;
  const mid = a => (a.a0 + a.a1) / 2;
  const lab = a => { if ((a.a1 - a.a0) / TAU < 0.07) return ""; const [x, y] = polar((R0 + R1) / 2, mid(a)); return `<text class="pct" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central">${a.pct}%</text>`; };
  $("catRing").innerHTML = `<svg viewBox="0 0 264 264"${wait ? ' class="wait"' : ""} aria-hidden="false"><defs><filter id="ringSh" filterUnits="userSpaceOnUse" x="-20" y="-20" width="304" height="304"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#2B1B3D" flood-opacity=".28"/></filter><filter id="ringLift" filterUnits="userSpaceOnUse" x="-20" y="-20" width="304" height="304"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#2B1B3D" flood-opacity=".42"/></filter></defs>` +
    ringArcs.map(a => `<path class="seg" data-i="${a.i}" style="--i:${a.i};--tx:${(Math.sin(mid(a)) * 7).toFixed(1)}px;--ty:${(-Math.cos(mid(a)) * 7).toFixed(1)}px" tabindex="0" role="button" aria-label="${esc(a.c)}, ${esc(money(a.v, { whole: true }))}, ${a.pct}% of what you spent. Opens its entries." d="${sectorPath(a.a0, a.a1)}" fill="${a.col}" stroke="${a.col}" stroke-width="8" stroke-linejoin="round"/>`).join("") +
    ringArcs.map(lab).join("") + `</svg>`;
  if (wait) watchRing($("catRing"));
  const keep = ringArcs.findIndex(a => a.c === ringSel); if (keep >= 0) pickCat(keep); else { ringSel = null; $("catRing").closest(".hero-ring").classList.remove("picking"); }
  if (!rows.length) { $("cats").innerHTML = ""; return; }
  const max = rows[0][1];
  $("cats").innerHTML = rows.map(([c, v], i) => `<button type="button" class="cat c${i < 4 ? i + 1 : i % 2 ? 5 : 6}" data-cat-go="${esc(c)}" data-ring="${i}" title="See every ${esc(c)} entry: ${esc(money(v))} (${Math.round(v / total * 100)}%)"><span class="n">${esc(c)}</span><div class="track"><div class="fill" style="width:${Math.max(v / max * 100, 1.5)}%"></div></div><span class="v num">${esc(money(v, { whole: true }))}<small>${Math.round(v / total * 100)}%</small></span></button>`).join("");
}

function wireRing() {
  const box = $("catRing"); let down = false;
  const at = ev => {
    const r = box.getBoundingClientRect(), dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2), d = Math.hypot(dx, dy) / (r.width / 2) * 132;
    if (d < R0 - 14 || d > R1 + 24) return -1;
    const ang = (Math.atan2(dx, -dy) + TAU) % TAU, a = ringArcs.find(x => ang >= x.a0 && ang < x.a1);
    return a ? a.i : -1;
  };
  box.addEventListener("pointerdown", ev => { if (ev.pointerType === "mouse") return; down = true; try { box.setPointerCapture(ev.pointerId); } catch {} pickCat(at(ev)); });
  box.addEventListener("pointermove", ev => { if (ev.pointerType === "mouse" || down) pickCat(at(ev)); });
  const up = () => { down = false; };
  box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  box.addEventListener("pointerleave", ev => { if (ev.pointerType === "mouse") pickCat(-1); });
  box.addEventListener("click", ev => { if (ev.pointerType !== "mouse") return; const i = at(ev); if (i >= 0) openCat(i); });
  box.addEventListener("focusin", ev => { const c = ev.target.closest(".seg"); if (c) pickCat(+c.dataset.i); });
  box.addEventListener("focusout", ev => { if (!box.contains(ev.relatedTarget)) pickCat(-1); });
  box.addEventListener("keydown", ev => { const c = ev.target.closest(".seg"); if (c && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); openCat(+c.dataset.i); } });
  $("pickGo").addEventListener("click", () => openCat(+$("pickGo").dataset.i));
  document.addEventListener("pointerdown", ev => { if (ringSel && !ev.target.closest(".hero-ring")) pickCat(-1); });
  $("catMore").addEventListener("click", () => { const open = $("cats").hidden; $("cats").hidden = !open; $("catMore").setAttribute("aria-expanded", String(open)); $("catMore").firstChild.textContent = open ? "Hide the list" : "See every category"; stackSync(); });
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
    $("budgetBtn").hidden = true; stackSync(); return;
  }
  $("budgetBtn").hidden = !canSet;
  $("budgetBtn").textContent = cats.length ? "Edit budgets" : "Set budgets";
  // a category with money carried into it shows too, even without a budget of its own
  const shown = [...new Set(cats.concat(inMonth(ui.month, ui.view).filter(e => e.type === "carryover").map(e => e.category || "Other")))];
  box.innerHTML = shown.length ? shown.map(c => {
    const co = carriedIn(ui.month, ui.view, c), lim = (+b[c] || 0) + co, sp = spentIn(ui.month, ui.view, c), pct = Math.round(sp / lim * 100), cls = pct >= 100 ? "over" : pct >= 80 ? "near" : "";
    return `<div class="bud ${cls}"><div class="bud-top"><span>${esc(c)}</span><span class="num">${esc(money(sp, { whole: true }))} of ${esc(money(lim, { whole: true }))}</span></div><div class="meter"><div style="width:${Math.min(100, pct)}%"></div></div><small>${pct >= 100 ? "Over by " + esc(money(sp - lim, { whole: true })) : esc(money(lim - sp, { whole: true })) + " left, " + pct + "% used"}${co ? ", includes " + esc(money(co, { whole: true })) + " carried over" : ""}</small></div>`;
  }).join("") : `<p class="hint">No budgets yet. Set a monthly limit for any category and you'll get a heads-up at 80%.</p>`;
  stackSync();
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
  $("trendSum").textContent = tot.inc || tot.out ? "In " + money(tot.inc, { whole: true }) + ", out " + money(tot.out, { whole: true }) : "Nothing logged yet";
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

// ---------- compare: the last 3 months side by side, or this year so far against last year ----------
function renderCompare() {
  const box = $("cmpBox"); if (!box) return;
  const who = ui.view, mode = ui.cmp || "3m", mine = e => countsMoney(e) && (who === "all" || e.person === who);
  // the folded card's one line: this month's spending against last month's
  { const pk = shiftMonth(ui.month, -1), mn = k => new Date(k + "-01T00:00:00").toLocaleDateString(undefined, { month: "short" }), sp = k => sum(state.entries.filter(e => mine(e) && e.type === "expense" && effMonth(e) === k), e => +e.amount), a = sp(ui.month), b = sp(pk);
    $("cmpSum").textContent = !a && !b ? "Nothing to compare yet" : !b ? "Spent " + money(a, { whole: true }) + " in " + mn(ui.month) :
      "Spent " + money(a, { whole: true }) + " in " + mn(ui.month) + ", " + (Math.abs(a - b) < b * .05 ? "about the same as " : Math.round(Math.abs(a / b - 1) * 100) + "% " + (a > b ? "more" : "less") + " than ") + mn(pk); }
  document.querySelectorAll("#cmpSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.cmp === mode)));
  const f0 = v => money(v, { whole: true });
  if (mode === "3m") {
    const ks = [shiftMonth(ui.month, -2), shiftMonth(ui.month, -1), ui.month], by = {}, inc = [0, 0, 0], out = [0, 0, 0];
    state.entries.filter(mine).forEach(e => { const i = ks.indexOf(effMonth(e)); if (i < 0) return;
      if (e.type === "income") inc[i] += +e.amount;
      if (e.type === "expense") { out[i] += +e.amount; const c = e.category || "Other"; (by[c] = by[c] || [0, 0, 0])[i] += +e.amount; } });
    const cats = Object.keys(by).sort((a, b) => sum(by[b], x => x) - sum(by[a], x => x)).slice(0, 8);
    const chg = (a, b) => !a ? "" : (b > a * 1.05 ? `<i class="up">▲ ${Math.round((b / a - 1) * 100)}%</i>` : b < a * .95 ? `<i class="down">▼ ${Math.round((1 - b / a) * 100)}%</i>` : "");
    const row = (name, v, cls) => `<tr class="${cls || ""}"><th scope="row">${esc(name)}</th>${v.map((x, i) => `<td class="num">${x ? esc(f0(x)) : "–"}${i === 2 ? chg(v[1], v[2]) : ""}</td>`).join("")}</tr>`;
    box.innerHTML = !inc.some(Boolean) && !out.some(Boolean) ? `<p class="hint">Nothing logged in these three months yet.</p>` :
      `<div class="cmp-tbl"><table><thead><tr><th></th>${ks.map(k => `<th class="num">${esc(monthName(k, true))}</th>`).join("")}</tr></thead><tbody>
      ${row("Income", inc, "cmp-in")}${row("Spent", out, "cmp-out")}${cats.map(c => row(c, by[c])).join("")}</tbody></table></div><p class="hint">The arrow compares ${esc(monthName(ui.month, true))} with ${esc(monthName(ks[1], true))}.</p>`;
    return;
  }
  const y = ui.month.slice(0, 4), m = ui.month.slice(5), py = String(+y - 1);
  const inYear = (e, yy) => { const k = effMonth(e); return k.slice(0, 4) === yy && k.slice(5) <= m; };
  const tot = yy => { const es = state.entries.filter(e => mine(e) && inYear(e, yy)), cats = {};
    es.filter(e => e.type === "expense").forEach(e => { cats[e.category || "Other"] = (cats[e.category || "Other"] || 0) + +e.amount; });
    return { inc: sum(es.filter(e => e.type === "income"), e => +e.amount), out: sum(es.filter(e => e.type === "expense"), e => +e.amount), sav: sum(es, e => e.type === "save" ? +e.amount : e.type === "withdraw" ? -e.amount : 0), cats }; };
  const a = tot(y), b = tot(py), upto = new Date(ui.month + "-01T00:00:00").toLocaleDateString(undefined, { month: "short" });
  const pct = (n, o) => !o ? "" : n > o * 1.05 ? `<i class="up">▲ ${Math.round((n / o - 1) * 100)}%</i>` : n < o * .95 ? `<i class="down">▼ ${Math.round((1 - n / o) * 100)}%</i>` : `<i>about the same</i>`;
  const cats = Object.keys(a.cats).sort((p, q) => a.cats[q] - a.cats[p]).slice(0, 6);
  const row = (name, n, o) => `<tr><th scope="row">${esc(name)}</th><td class="num">${n ? esc(f0(n)) : "–"}</td><td class="num">${o ? esc(f0(o)) : "–"}</td><td>${pct(n, o)}</td></tr>`;
  box.innerHTML = !a.inc && !a.out ? `<p class="hint">Nothing logged in ${y} yet.</p>` :
    `<div class="cmp-tbl"><table><thead><tr><th></th><th class="num">${y}</th><th class="num">${py}</th><th></th></tr></thead><tbody>
    ${row("Income", a.inc, b.inc)}${row("Spent", a.out, b.out)}${row("Saved", a.sav, b.sav)}${cats.map(c => row(c, a.cats[c], b.cats[c] || 0)).join("")}</tbody></table></div>
    <p class="hint">January to ${esc(upto)} each year${b.inc || b.out ? "" : ". Nothing logged last year yet, so there's nothing to compare against"}.</p>`;
}


// ---------- on phones the cards below the top layer stack as you scroll (CSS sticky) ----------
// A card taller than the screen can't stay stuck (its bottom would be out of reach), so it simply scrolls.
// Each stuck card is at least as tall as the one before it (less a sliver), so it fully covers it.
const STACK = ["#attn", "#monthPanel", ".buds-panel", ".recent-panel", "#trendPanel"];
let stackRaf = 0;
function stackSync() {
  cancelAnimationFrame(stackRaf);
  stackRaf = requestAnimationFrame(() => {
    const home = $("pg-home"), phone = window.matchMedia("(max-width: 899.98px)").matches;
    const cards = STACK.map(s => home.querySelector(s)).filter(Boolean);
    cards.forEach(el => { el.style.minHeight = ""; el.style.top = ""; el.style.zIndex = ""; });
    if (home.hidden || !phone || ui.editBudgets) { cards.forEach(el => el.classList.remove("stuck")); return; }
    const room = innerHeight / zoom() - 118;
    let prev = 0, i = 0;
    cards.forEach(el => {
      if (!el.offsetHeight) { el.classList.remove("stuck"); return; }
      const top = 10 + 14 * i++, ok = el.offsetHeight <= room - top;
      el.classList.toggle("stuck", ok);
      if (ok) { el.style.top = `calc(${top}px + env(safe-area-inset-top, 0px))`; el.style.zIndex = i; }
      if (ok && prev > el.offsetHeight) el.style.minHeight = Math.max(0, prev - 14) + "px";
      prev = ok ? el.offsetHeight : 0;
    });
  });
}

// ---------- v61: on phones the top of the Dashboard (title, month switcher, ring) never scrolls: the cards slide up over it ----------
// body.pin-home turns on the CSS (css/app.css). It is only turned on when the whole top fits above the dock; on a small screen or at a big text size
// the Dashboard just scrolls as a normal page, because a pinned top taller than the screen would hide its own lower half.
// While the cards cover it, the top eases back a little (--p, 0 to 1): scale and fade only.
let pinRaf = 0;
function pinSync() {
  cancelAnimationFrame(pinRaf);
  pinRaf = requestAnimationFrame(() => {
    const home = $("pg-home"), body = document.body, hd = document.querySelector(".pagehead"), hero = home.querySelector(".hero-panel");
    const phone = window.matchMedia("(max-width: 899.98px)").matches;
    let on = phone && !home.hidden && !!hd && !!hero && !document.querySelector(".main > .banner:not([hidden]), .main > .xfer-bar:not([hidden])"); // a banner above the page (backup reminder...) turns pinning off until it is gone
    if (on) { const head = hd.offsetHeight + 16; home.style.setProperty("--pin-top", head + "px"); on = head + hero.offsetHeight + 14 <= innerHeight / zoom() - 118 - 14 - 90; }
    body.classList.toggle("pin-home", on);
    if (!on) { home.style.removeProperty("--pin-top"); home.style.removeProperty("--p"); return; }
    pinFade();
  });
}
function pinFade() {
  const home = $("pg-home"), hero = home.querySelector(".hero-panel");
  if (!document.body.classList.contains("pin-home") || !hero) return;
  home.style.setProperty("--p", Math.min(1, Math.max(0, scrollY / Math.max(1, hero.offsetHeight))).toFixed(3));
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
    $("cmpSeg").addEventListener("click", ev => { const b = ev.target.closest("[data-cmp]"); if (b) { ui.cmp = b.dataset.cmp; renderCompare(); } });
    $("trendChart").addEventListener("click", ev => { const g = ev.target.closest("g.mon"); if (!g) return; ui.trendSel = g.dataset.k; renderTrend(); });
    $("trendDetail").addEventListener("click", ev => { const b = ev.target.closest("[data-trendgo]"); if (b) { ui.month = b.dataset.trendgo; ui.trendSel = null; changed(); } });
    wireRing();
    const attn = () => { $("attn").hidden = !["dueBar", "owesBar", "smartBar"].some(i => !$(i).hidden); stackSync(); };
    const mo = new MutationObserver(attn); ["dueBar", "owesBar", "smartBar"].forEach(i => mo.observe($(i), { attributes: true, attributeFilter: ["hidden"], childList: true }));
    const tabs = () => { const t = ui.trendTab || "trend"; document.querySelectorAll("#trendTabs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === t))); $("trendView").hidden = t !== "trend"; $("cmpView").hidden = t !== "cmp"; if (t === "trend") renderTrend(); else renderCompare(); stackSync(); };
    $("trendTabs").addEventListener("click", ev => { const b = ev.target.closest("[data-tab]"); if (b) { ui.trendTab = b.dataset.tab; tabs(); } });
    initFolds();
    $("pg-home").addEventListener("fold-open", tabs);
    let rt = null; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (!$("pg-home").hidden) renderTrend(); }, 200); stackSync(); pinSync(); });
    window.addEventListener("scroll", pinFade, { passive: true });
    const pinMo = new MutationObserver(pinSync); pinMo.observe($("pg-home"), { attributes: true, attributeFilter: ["hidden"] });
    ["readonlyBanner", "xferBar", "backupNag"].forEach(id => { const b = $(id); if (b) pinMo.observe(b, { attributes: true, attributeFilter: ["hidden"] }); });
    if (window.ResizeObserver) new ResizeObserver(pinSync).observe(document.querySelector(".hero-panel"));
    if (window.ResizeObserver) { const ro = new ResizeObserver(stackSync); STACK.forEach(sel => { const el = $("pg-home").querySelector(sel); if (el) ro.observe(el); }); }
  },
  render() {
    renderDue($("dueBar"), 4);
    renderOwes(); renderSmart(); renderHero(); renderTiles(); renderCats(); renderBudgets(); renderRecent(); renderTrend(); renderCompare();
    stackSync(); pinSync();
  }
};
