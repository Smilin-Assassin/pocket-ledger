// Loans: money you lent or borrowed, paid back in instalments. Kept out of
// "left to spend" unless you tick a loan to count it.
import { $, esc, money, num, sum, r2, todayISO, fmtDate, toast } from "../util.js";
import { state, ui, db, isAll, pname, pcolor, canEdit, loansFor, loanOutstanding, meId } from "../store.js";
import { createLoan, recordRepayment, removeLoanWithUndo, removeWithUndo } from "../actions.js";

ui.repayFor = null;

function card(l) {
  const out = loanOutstanding(l), paid = r2(+l.amount - out), pct = +l.amount ? Math.min(100, Math.round(paid / +l.amount * 100)) : 0;
  const late = out > 0.004 && l.due && l.due < todayISO(), lent = l.direction === "lent", mine = canEdit(l);
  const hist = state.entries.filter(e => e.loanId === l.id && e.loanRole === "repay").sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return `<div class="loan${late ? " late" : ""}${out <= 0.004 ? " paid" : ""}">
    <div class="loan-top"><b>${lent ? "Lent to " : "Borrowed from "}${esc(l.counterparty)}</b><span class="num">${out <= 0.004 ? "Paid off ✓" : esc(money(out)) + " left"}</span></div>
    <div class="meter loan-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="Paid back"><div style="width:${pct}%"></div></div>
    <div class="loan-meta">${isAll() ? `<i class="pdot" style="background:${pcolor(l.person)}"></i>${esc(pname(l.person))} · ` : ""}${esc(money(paid, { whole: true }))} of ${esc(money(+l.amount, { whole: true }))} paid back (${pct}%) · since ${esc(fmtDate(l.date))}${l.due ? ` · ${late ? "was due" : "due"} ${esc(fmtDate(l.due))}` : ""}</div>
    ${hist.length ? `<details class="loan-hist"><summary>${hist.length} repayment${hist.length === 1 ? "" : "s"}</summary><ul>${hist.map(h => `<li><span>${esc(fmtDate(h.date))}</span><b class="num">${esc(money(+h.amount))}</b>${mine && canEdit(h) ? `<button class="icon-btn danger" type="button" data-rpdel="${h.id}" aria-label="Delete this repayment">Delete</button>` : ""}</li>`).join("")}</ul></details>` : ""}
    ${out > 0.004 && mine ? (ui.repayFor === l.id
      ? `<div class="loan-pay"><input id="repayAmt" type="number" inputmode="decimal" min="0" step="0.01" value="${out}" aria-label="Amount paid back"><input id="repayDate" type="date" value="${todayISO()}" aria-label="Date"><button class="primary" type="button" data-repay-ok="${l.id}">Save</button><button class="icon-btn" type="button" data-repay-x="1">Cancel</button></div>`
      : `<div class="goal-acts"><button class="ghost" type="button" data-repay="${l.id}">${lent ? "They paid some back" : "I paid some back"}</button><button class="icon-btn" type="button" data-inmonth="${l.id}" title="Whether this loan counts in left to spend">${l.inMonth ? "Counted in monthly money" : "Kept separate"}</button><button class="icon-btn danger" type="button" data-ldel="${l.id}" aria-label="Delete this loan">Delete</button></div>`)
      : mine ? `<div class="goal-acts"><button class="icon-btn danger" type="button" data-ldel="${l.id}" aria-label="Delete this loan">Delete</button></div>` : ""}
  </div>`;
}

export const page = {
  init() {
    $("lnDate").value = todayISO();
    $("lnDir").addEventListener("change", () => { $("lnNameL").textContent = $("lnDir").value === "borrowed" ? "Who did you borrow from?" : "Who did you lend to?"; });
    $("pg-loans").addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      const d = b.dataset, l = state.loans.find(x => x.id === (d.repay || d.repayOk || d.inmonth));
      if (d.ldel) { ui.repayFor = null; removeLoanWithUndo(d.ldel); return; }
      if (d.rpdel) { removeWithUndo("entries", d.rpdel, "Repayment deleted"); return; }
      if (d.repay) { ui.repayFor = d.repay; page.render(); setTimeout(() => $("repayAmt") && $("repayAmt").focus(), 30); }
      else if (d.repayX) { ui.repayFor = null; page.render(); }
      else if (d.repayOk && l) {
        const amt = num($("repayAmt").value), date = $("repayDate").value || todayISO(), left = loanOutstanding(l);
        if (recordRepayment(l, amt, date)) { ui.repayFor = null; toast(left - amt <= 0.004 ? "Loan fully paid back" : "Repayment saved"); }
        else toast("Enter an amount up to what's still owed.");
      } else if (d.inmonth && l) {
        db.saveDoc("loans", l.id, Object.assign({}, l, { inMonth: !l.inMonth }));
        toast(l.inMonth ? "Loan kept separate from monthly money" : "Loan now counts in monthly money");
      }
    });
    $("saveLoan").addEventListener("click", () => {
      const amount = num($("lnAmt").value), cp = $("lnName").value.trim();
      const err = m => { $("loanErr").textContent = m; $("loanErr").hidden = !m; };
      if (!(amount > 0)) return err("Enter the amount.");
      if (!cp) return err("Who is it with?");
      err("");
      createLoan({ direction: $("lnDir").value, counterparty: cp, amount, date: $("lnDate").value || todayISO(), due: $("lnDue").value, person: meId(), inMonth: $("lnInMonth").checked });
      $("lnInMonth").checked = false; ["lnAmt", "lnName", "lnDue"].forEach(id => { $(id).value = ""; });
      toast("Loan saved");
    });
  },
  render() {
    const keep = $("repayAmt") ? [$("repayAmt").value, $("repayDate").value] : null;
    const mine = loansFor(ui.view);
    const open = mine.filter(l => loanOutstanding(l) > 0.004).sort((x, y) => (x.due || "9999").localeCompare(y.due || "9999"));
    const done = mine.filter(l => loanOutstanding(l) <= 0.004);
    const owedToMe = sum(open.filter(l => l.direction === "lent"), loanOutstanding), iOwe = sum(open.filter(l => l.direction === "borrowed"), loanOutstanding);
    $("loanSum").innerHTML = `<div class="stat-card"><span class="label">Owed to ${isAll() ? "the group" : "you"}</span><b class="num">${esc(money(owedToMe))}</b><small>${open.filter(l => l.direction === "lent").length} open</small></div>
      <div class="stat-card"><span class="label">${isAll() ? "Owed by the group" : "You owe"}</span><b class="num">${esc(money(iOwe))}</b><small>${open.filter(l => l.direction === "borrowed").length} open</small></div>`;
    $("loanList").innerHTML = open.length ? open.map(card).join("") : `<div class="empty"><span>No open loans.</span><span class="hint">Loans are kept separate from "left to spend" unless you choose otherwise.</span></div>`;
    $("loanClosed").innerHTML = done.length ? `<details class="loan-done"><summary>${done.length} paid-off loan${done.length === 1 ? "" : "s"}</summary><div class="loans">${done.map(card).join("")}</div></details>` : "";
    $("loanForm").hidden = state.readOnly;
    if (keep && $("repayAmt")) { $("repayAmt").value = keep[0]; $("repayDate").value = keep[1]; }
  }
};
