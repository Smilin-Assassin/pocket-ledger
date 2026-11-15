// Pure logic for daily alerts (no Firebase imports, so it can be tested on its own).
"use strict";

const pad = n => String(n).padStart(2, "0");
const monthKey = d => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1);
const shiftMonth = (k, n) => { const [y, m] = k.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return monthKey(d); };
const daysIn = k => { const [y, m] = k.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const dateIn = (k, day) => k + "-" + pad(Math.min(Math.max(1, +day || 1), daysIn(k)));
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
const money = (n, cur) => (cur || "MVR") + " " + Math.round(+n || 0).toLocaleString("en-US");
const effMonth = e => e.countMonth || String(e.date || "").slice(0, 7);

// "today" in the Maldives (UTC+5) as YYYY-MM-DD
function localToday(now, offsetHours) {
  const d = new Date(now.getTime() + (offsetHours || 5) * 3600e3);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
}

function countsMoney(e, loans) {
  if (!e.loanId) return true;
  const l = loans.find(x => x.id === e.loanId);
  return !!(l && l.inMonth);
}
function loanOutstanding(l, entries) {
  const paid = entries.filter(e => e.loanId === l.id && e.loanRole === "repay").reduce((s, e) => s + (+e.amount || 0), 0);
  return (+l.amount || 0) - paid;
}

/**
 * Work out which alerts are due for one household.
 * hh: { settings, personOf, members, alertState }
 * data: { entries, recurring, loans }
 * Returns { alerts: [{key, level, kind, person|null, title, body}], state }
 */
function computeAlerts(hh, data, today) {
  const cur = (hh.settings && hh.settings.currency) || "MVR";
  const people = (hh.settings && hh.settings.people) || [{ id: "p1", name: "Me" }, { id: "p2", name: "Partner" }];
  const names = hh.names || {};
  const pname = id => names[id] || (people.find(p => p.id === id) || {}).name || "Someone";
  const prev = hh.alertState || {};
  const state = {};
  const alerts = [];
  const now = today.slice(0, 7);
  const entries = data.entries || [], recurring = data.recurring || [], loans = data.loans || [];
  const rank = { green: 0, amber: 1, red: 2, near: 1, over: 2 };
  const push = (key, level, kind, person, title, body) => {
    state[key] = level;
    if ((rank[prev[key]] ?? -1) < rank[level]) alerts.push({ key, level, kind, person, title, body });
  };

  // Bills & reminders: alert when one turns amber, and again when it turns red.
  recurring.filter(r => !r.paused).forEach(r => {
    const win = Math.max(1, Math.min(31, +r.remindDays || 7));
    const months = [];
    // the last 13 months up to this one (a bill that began longer ago still gets this month checked)
    const first = shiftMonth(now, -12);
    let k = r.startMonth && r.startMonth < now ? (r.startMonth > first ? r.startMonth : first) : now;
    for (let i = 0; i < 13 && k <= now; i++, k = shiftMonth(k, 1)) months.push(k);
    months.push(shiftMonth(now, 1));
    months.forEach(k => {
      if (r.startMonth && k < r.startMonth) return;
      if ((r.skips || []).includes(k)) return;
      if (entries.some(e => e.id === "rec-" + r.id + "-" + k)) return;
      const due = dateIn(k, r.day), left = daysBetween(today, due);
      if (left > win) return;
      const level = left <= 1 ? "red" : left <= Math.ceil(win / 2) ? "amber" : "green";
      if (level === "green") { state["bill:" + r.id + ":" + k] = "green"; return; }
      const name = r.note || r.category || "A bill";
      const when = left < 0 ? "is overdue by " + (-left) + " day" + (left === -1 ? "" : "s") : left === 0 ? "is due today" : left === 1 ? "is due tomorrow" : "is due in " + left + " days";
      push("bill:" + r.id + ":" + k, level, "bills", r.person || null, level === "red" ? "Bill due: " + name : "Coming up: " + name, name + " (" + money(r.amount, cur) + ") " + when + ".");
    });
  });

  // Budgets: alert at 80% and when over, once per month per category.
  const budgets = (hh.settings && hh.settings.budgets) || {};
  Object.keys(budgets).forEach(who => {
    const b = budgets[who] || {};
    Object.keys(b).forEach(cat => {
      const base = +b[cat]; if (!(base > 0)) return;
      // money carried over into this category this month adds to its budget, as it does in the app
      const lim = base + entries.filter(e => e.type === "carryover" && effMonth(e) === now && (who === "all" || e.person === who) && (e.category || "Other") === cat)
        .reduce((s, e) => s + (+e.amount || 0), 0);
      const spent = entries.filter(e => e.type === "expense" && effMonth(e) === now && countsMoney(e, loans) && (who === "all" || e.person === who) && (e.category || "Other") === cat)
        .reduce((s, e) => s + (+e.amount || 0), 0);
      const level = spent >= lim ? "over" : spent >= lim * 0.8 ? "near" : null;
      if (!level) return;
      const label = who === "all" ? "Household" : pname(who);
      push("bud:" + who + ":" + cat + ":" + now, level, "budgets", who === "all" ? null : who,
        level === "over" ? "Over budget: " + cat : "Budget nearly used: " + cat,
        label + " has spent " + money(spent, cur) + " of " + money(lim, cur) + " on " + cat + " this month" + (level === "over" ? "." : " (" + Math.round(spent / lim * 100) + "%)."));
    });
  });

  // Loans with a due date: alert 3 days before and when overdue.
  loans.forEach(l => {
    if (!l.due) return;
    const out = loanOutstanding(l, entries); if (out <= 0.004) return;
    const left = daysBetween(today, l.due);
    if (left > 3) return;
    const level = left < 0 ? "red" : "amber";
    const what = l.direction === "lent" ? l.counterparty + " owes you " + money(out, cur) : "You owe " + l.counterparty + " " + money(out, cur);
    push("loan:" + l.id, level, "loans", l.person || null, left < 0 ? "Loan overdue" : "Loan due soon", what + (left < 0 ? ", due " + l.due + "." : left === 0 ? ", due today." : ", due in " + left + " day" + (left === 1 ? "" : "s") + "."));
  });

  // keep state small: only keys still relevant this run, plus this month's budget keys
  return { alerts, state };
}

// Who should get an alert: the person it belongs to (if any), otherwise every member.
function recipientsFor(alert, hh) {
  const personOf = hh.personOf || {};
  const members = hh.members || [];
  if (!alert.person) return members.slice();
  if (members.includes(alert.person)) return [alert.person];
  const uids = members.filter(u => personOf[u] === alert.person);
  return uids.length ? uids : members.slice();
}

module.exports = { computeAlerts, recipientsFor, localToday, shiftMonth, effMonth };
