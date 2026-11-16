// Arcade look (v71): the Dashboard's top becomes a game-style HUD: Income / Spent / Saved / Left strip, a map of the month's days
// (today marked, dashed line = what you can spend a day), the amount left after bills, and the top categories as segmented bars.
// Only drawn while Settings › Appearance › Look is Arcade; under Coral Dusk it stays empty and hidden.
import { $, esc, money, monthKey, monthName } from "./util.js";
import { state, ui, monthTotals, inMonth, countsMoney, recurringMonth, budgetsFor, carriedIn, spentIn } from "./store.js";

const plain = s => s.replace(/^MVR\s*/, ""); // the strip shows numbers only, like the mock-up
const isArcade = () => document.documentElement.getAttribute("data-look") === "arcade";
const MAPW = 342, MAPH = 76;

function cells(filled, n = 10) { return Array.from({ length: n }, (_, i) => `<i class="${i < filled ? "on" : ""}"></i>`).join(""); }

// large text or a narrow screen: the four numbers wrap into two rows instead of being cut off
function fit() {
  const box = $("arcadeHud"), strip = box && box.querySelector(".ar-strip"); if (!strip || box.hidden) return;
  box.classList.remove("tight"); if (strip.scrollWidth > strip.clientWidth + 1) box.classList.add("tight");
}
window.addEventListener("resize", fit);

export function renderArcade() {
  const box = $("arcadeHud"); if (!box) return;
  const on = isArcade(); box.hidden = !on; if (!on) { box.innerHTML = ""; $("leftSub").hidden = false; return; }
  const t = monthTotals(ui.month), rb = recurringMonth(ui.month, ui.view), now = new Date(), cur = ui.month === monthKey(now);
  const [y, m] = ui.month.split("-").map(Number), days = new Date(y, m, 0).getDate(), today = cur ? now.getDate() : (ui.month < monthKey(now) ? days : 0);
  const daysLeft = cur ? days - now.getDate() + 1 : 0;
  const afterBills = cur && rb.toPay > 0 ? t.left - rb.toPay : t.left, allowance = cur && daysLeft > 0 && afterBills > 0 ? afterBills / daysLeft : 0;
  const es = inMonth(ui.month).filter(e => e.type === "expense" && countsMoney(e)), perDay = Array(days + 1).fill(0), by = {};
  es.forEach(e => { const d = +String(e.date).slice(8, 10) || 1; perDay[Math.min(d, days)] += +e.amount; const c = e.category || "Other"; by[c] = (by[c] || 0) + +e.amount; });
  const biggest = Math.max(1, ...perDay), peak = allowance ? Math.min(biggest, Math.max(allowance * 4, 1)) : biggest, step = MAPW / days, bw = Math.max(3, step * .62);
  let svg = `<svg viewBox="0 0 ${MAPW} ${MAPH + 28}" role="img" aria-label="${esc("Spending for each day of " + monthName(ui.month) + (allowance ? ", with a daily allowance of " + money(allowance, { whole: true }) : "") + (cur ? ". Today is day " + now.getDate() + "." : "."))}"><line x1="0" x2="${MAPW}" y1="${MAPH}" y2="${MAPH}" class="ax"/>`;
  for (let d = 1; d <= days; d++) {
    const x = (d - 1) * step + (step - bw) / 2, v = perDay[d];
    if (v > 0) { const h = Math.max(2, Math.min(1, v / peak) * (MAPH - 8)); svg += `<rect x="${x.toFixed(1)}" y="${(MAPH - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" class="b${v > peak ? " cut" : ""}"/>`; }
    else svg += `<rect x="${x.toFixed(1)}" y="${MAPH - (d <= today ? 1.5 : 2)}" width="${bw.toFixed(1)}" height="${d <= today ? 1.5 : 2}" class="${d <= today ? "z" : "f"}"/>`;
  }
  if (allowance) { const ly = MAPH - allowance / peak * (MAPH - 8); svg += `<line x1="0" x2="${MAPW}" y1="${ly.toFixed(1)}" y2="${ly.toFixed(1)}" class="al"/>`; }
  if (cur) { const tx = (now.getDate() - 1) * step + step / 2; svg += `<line x1="${tx.toFixed(1)}" x2="${tx.toFixed(1)}" y1="6" y2="${MAPH}" class="td"/><polygon points="${(tx - 5).toFixed(1)},2 ${(tx + 5).toFixed(1)},2 ${tx.toFixed(1)},9" class="tdm"/>`; }
  [1, Math.round(days / 4) + 1, Math.round(days / 2), Math.round(days * .75), days].forEach((d, i, a) => { if (a.indexOf(d) !== i) return; const cx = (d - 1) * step + step / 2, an = d === 1 ? "start" : d === days ? "end" : "middle"; svg += `<text x="${(d === 1 ? 0 : d === days ? MAPW : cx).toFixed(1)}" y="${MAPH + 22}" text-anchor="${an}">${d}</text>`; });
  svg += `</svg>`;
  const budgets = budgetsFor(ui.view), total = Object.values(by).reduce((s, v) => s + v, 0);
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, v]) => {
    const lim = (+budgets[c] || 0) + carriedIn(ui.month, ui.view, c), sp = lim ? spentIn(ui.month, ui.view, c) : v, share = lim ? Math.min(1, sp / lim) : v / total;
    const sub = lim ? "of " + money(lim, { whole: true }) : Math.round(v / total * 100) + "% of spending";
    return `<button type="button" class="ar-cat" data-cat-go="${esc(c)}" title="See every ${esc(c)} entry"><span class="ar-n">${esc(c)}<span class="ar-cells${lim && sp >= lim ? " over" : ""}" aria-hidden="true">${cells(Math.round(share * 10))}</span></span><span class="ar-v"><b class="num">${esc(money(v, { whole: true }))}</b><small>${esc(sub)}</small></span></button>`;
  }).join("");
  $("leftSub").hidden = t.income > 0 && t.left >= 0; // the HUD already says it
  const label = cur && rb.toPay > 0 ? "Left to spend after bills" : "Left to spend";
  box.innerHTML = `<div class="ar-a"><div class="ar-strip" role="group" aria-label="This month in numbers">
<div><small>Income</small><b class="num">${esc(plain(money(t.income, { whole: true })))}</b></div><div class="sp"><small>Spent</small><b class="num">${esc(plain(money(t.spent, { whole: true })))}</b></div>
<div class="sv"><small>Saved</small><b class="num">${esc(plain(money(t.netSaved, { whole: true })))}</b></div><div class="lf${t.left < 0 ? " neg" : ""}"><small>Left</small><b class="num">${esc(plain(money(t.left, { whole: true })))}</b></div></div>
<div class="ar-title"><h2>${esc(monthName(ui.month))}</h2><span>${cur ? "Day " + now.getDate() + " of " + days : "Whole month"}</span></div>
<div class="ar-map">${svg}</div>${allowance ? `<p class="ar-key">Dashed line: what you can spend a day, ${esc(money(allowance, { whole: true }))}${biggest > peak ? ". Taller days are cut off at the top." : ""}</p>` : ""}
</div><div class="ar-b"><div class="ar-left"><div><small>${label}</small><b class="num${afterBills < 0 ? " neg" : ""}">${esc(money(afterBills))}</b></div>${allowance ? `<span><b>${esc(money(allowance, { whole: true }))} a day</b><small>for ${daysLeft} day${daysLeft === 1 ? "" : "s"}</small></span>` : ""}</div>
${rows ? `<div class="ar-cats">${rows}</div>` : ""}</div>`;
  fit();
}
