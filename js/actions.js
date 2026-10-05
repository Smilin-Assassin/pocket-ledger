// Things you can do to your money, shared by the forms, scanning and the chat.
import { db, state, ui, meId, pname, rawDoc, groupName, loanOutstanding, openLoans, budgetsFor, spentIn, owesPairs, LOAN_OUT, LOAN_IN, LOAN_BACK_IN, LOAN_BACK_OUT, recEntryId } from "./store.js";
import { r2, todayISO, isoOk, monthKey, money, toast } from "./util.js";

// the person new things belong to: always you, except when adding "for" someone isn't possible anyway
export const asker = () => meId() || ui.view;

export function createLoan(a) {
  const person = a.person || asker();
  const direction = a.direction === "borrowed" ? "borrowed" : "lent";
  const amount = r2(a.amount), date = isoOk(a.date) ? a.date : todayISO();
  const counterparty = String(a.counterparty || "Friend").trim().slice(0, 40) || "Friend";
  const loan = { person, direction, counterparty, amount, date, due: isoOk(a.due) ? a.due : "", note: String(a.note || "").slice(0, 80), inMonth: !!a.inMonth, created: Date.now() };
  const id = db.saveDoc("loans", null, loan);
  db.add({ type: direction === "lent" ? "expense" : "income", amount, date, person, category: direction === "lent" ? LOAN_OUT : LOAN_IN,
    note: (direction === "lent" ? "Loan to " : "Loan from ") + counterparty, created: Date.now(), loanId: id, loanRole: "start" });
  return id;
}
export function findLoan(counterparty, person, direction) {
  const q = String(counterparty || "").trim().toLowerCase();
  let ls = openLoans(person && person !== "all" ? person : "all");
  if (direction) ls = ls.filter(l => l.direction === direction);
  if (q) ls = ls.filter(l => l.counterparty.toLowerCase().includes(q) || q.includes(l.counterparty.toLowerCase()));
  return ls.sort((x, y) => (y.date || "").localeCompare(x.date || ""))[0] || null;
}
export function recordRepayment(loan, amount, date) {
  amount = r2(Math.min(+amount || 0, loanOutstanding(loan)));
  if (!(amount > 0)) return false;
  db.add({ type: loan.direction === "lent" ? "income" : "expense", amount, date: isoOk(date) ? date : todayISO(), person: loan.person,
    category: loan.direction === "lent" ? LOAN_BACK_IN : LOAN_BACK_OUT, note: loan.direction === "lent" ? loan.counterparty + " paid back" : "Paid back " + loan.counterparty,
    created: Date.now(), loanId: loan.id, loanRole: "repay" });
  return true;
}

// bills & reminders: they remind you; nothing is added until you mark one paid
export function createRecurring(a) {
  const type = ["expense", "income", "save", "withdraw"].includes(a.type) ? a.type : "expense";
  const r = { type, amount: r2(a.amount), category: a.category || (type === "income" ? "Salary" : "Other"),
    note: String(a.note || "").slice(0, 80), person: a.person || asker(), day: Math.min(31, Math.max(1, parseInt(a.day, 10) || new Date().getDate())),
    remindDays: Math.max(1, Math.min(31, parseInt(a.remindDays, 10) || 7)), auto: false, startMonth: a.startMonth || monthKey(new Date()), created: Date.now() };
  if (a.goalId) r.goalId = a.goalId;
  if (a.split) r.split = a.split;
  return db.saveDoc("recurring", null, r);
}
export function payBill(r, k, amount) {
  const e = { type: r.type, amount: r2(amount > 0 ? amount : r.amount), date: todayISO(), person: r.person, category: r.category || "Other", note: r.note || "", created: Date.now(), recurringId: r.id };
  if (k !== todayISO().slice(0, 7)) e.countMonth = k;
  if (r.goalId) e.goalId = r.goalId;
  if (r.split) e.split = r.split;
  db.addWithId(recEntryId(r, k), e);
  budgetCheck(e);
}
export function skipBill(r, k) {
  db.saveDoc("recurring", r.id, Object.assign({}, r, { skips: [...new Set((r.skips || []).concat(k))].slice(-24) }));
}

export function settlePair(p) { db.saveDoc("settlements", null, { from: p.debtor, to: p.creditor, amount: p.amt, date: todayISO(), created: Date.now() }); }
export const firstOwed = () => owesPairs()[0] || null;

export function setBudget(who, category, amount) {
  const all = Object.assign({}, state.settings.budgets || {});
  const b = Object.assign({}, all[who] || {});
  if (amount > 0) b[category] = amount; else delete b[category];
  all[who] = b;
  db.saveSettings({ budgets: all });
}

// a friendly heads-up when an expense takes a budget to 80% or over
export function budgetCheck(e) {
  if (e.type !== "expense") return;
  const k = (e.date || "").slice(0, 7), cat = e.category || "Other";
  [e.person, "all"].forEach(who => {
    const lim = +budgetsFor(who)[cat]; if (!(lim > 0)) return;
    const sp = spentIn(k, who, cat) + (state.entries.some(x => x.created === e.created) ? 0 : +e.amount);
    const before = sp - (+e.amount);
    const label = who === "all" ? groupName() : pname(who);
    if (sp >= lim && before < lim) setTimeout(() => toast(label + " is now over the " + cat + " budget (" + money(lim, { whole: true }) + ")"), 900);
    else if (sp >= lim * 0.8 && before < lim * 0.8) setTimeout(() => toast(label + " has used " + Math.round(sp / lim * 100) + "% of the " + cat + " budget"), 900);
  });
}

export function addEntries(list, extra) {
  list.forEach((e, i) => { const x = Object.assign({ created: Date.now() + i }, e, extra || {}); db.add(x); budgetCheck(x); });
}

// a loan and everything recorded against it (the start entry and repayments) go together; Undo brings all back
export function removeLoanWithUndo(id) {
  const loan = rawDoc("loans", id); if (!loan) return;
  const ents = state.entries.filter(e => e.loanId === id).map(e => [e.id, rawDoc("entries", e.id)]).filter(x => x[1]);
  ents.forEach(([eid]) => db.removeDoc("entries", eid));
  db.removeDoc("loans", id);
  toast("Loan deleted", { action: "Undo", onAction: () => { db.restoreDoc("loans", id, loan); ents.forEach(([eid, d]) => db.restoreDoc("entries", eid, d)); } });
}
// delete straight away, with an Undo button instead of "Are you sure?"
export function removeWithUndo(col, id, label, after) {
  const copy = rawDoc(col, id); if (!copy) return;
  db.removeDoc(col, id);
  toast(label || "Deleted", { action: "Undo", onAction: () => { db.restoreDoc(col, id, copy); if (after) after(); } });
}
