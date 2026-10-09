// Ask about your money (typing or voice). Gemini decides what to look up; the
// numbers come from the app; changes are prepared for one-tap confirmation.
import { $, esc, money, sum, r2, monthKey, monthName, shiftMonth, monthsBetween, todayISO, fmtDate, isoOk, MONTH, lsGet, lsSet, toast, canHover, saveFile } from "./util.js";
import { state, ui, meId, isGroup, people, pname, groupName, effMonth, countsMoney, visibleGoals, goalBalance, goalName, totalSavings, loanOutstanding, openLoans,
  budgetsFor, spentIn, owesPairs, EXP_CATS, INC_CATS, TYPE_LABEL, merchantKey, EAT, mealName } from "./store.js";
import { createLoan, findLoan, recordRepayment, createRecurring, settlePair, setBudget, addEntries } from "./actions.js";
import { geminiText, parseJsonText } from "./gemini.js";
import { showProposals } from "./scan.js";
import { go } from "./shell.js";
import { db } from "./store.js";

const chat = { msgs: [], busy: false, abort: null };
const rec = { on: false, mr: null, chunks: [], stream: null, t0: 0, timer: null };
const speakOn = () => lsGet("pl-speak") !== "0";
const asker = () => meId();

function resolvePerson(p) {
  if (!p) return "all";
  const s = String(p).trim().toLowerCase();
  if (["all", "household", "everyone", "both", "us", "we", "group"].includes(s)) return isGroup() ? "all" : asker();
  if (["me", "i", "asker", "my", "mine"].includes(s)) return asker();
  if (people().some(x => x.id === p)) return p;
  const hit = people().find(x => x.name.trim().toLowerCase() === s) || people().find(x => s.includes(x.name.trim().toLowerCase()));
  return hit ? hit.id : (isGroup() ? "all" : asker());
}
const whoLabel = who => who === "all" ? groupName() : pname(who);

function filterEntries(a) {
  a = a || {};
  const who = resolvePerson(a.person);
  const from = isoOk(a.from) ? a.from : "0000-01-01", to = isoOk(a.to) ? a.to : "9999-12-31";
  const wantsLoans = /loan/i.test(String([].concat(a.category || []).join(" ") + " " + (a.search || "")));
  let es = state.entries.filter(e => (who === "all" || e.person === who) && (e.date || "") >= from && (e.date || "") <= to && (wantsLoans || countsMoney(e)));
  if (a.type && a.type !== "all") es = es.filter(e => e.type === String(a.type));
  else es = es.filter(e => e.type !== "move"); // moves between your own accounts aren't money in or out
  const cats = [].concat(a.category || []).filter(Boolean).map(c => String(c).toLowerCase());
  if (cats.length) es = es.filter(e => { const c = (e.category || "").toLowerCase(); const m = mealName(e.meal).toLowerCase(); return cats.some(x => c === x || c.includes(x) || x.includes(c) && c.length > 3 || (m && (x === m || x === m + "s"))); });
  if (a.search) { const q = String(a.search).toLowerCase(); es = es.filter(e => ((e.note || "") + " " + (e.category || "") + " " + mealName(e.meal) + " " + goalName(e.goalId)).toLowerCase().includes(q)); }
  return { es, who, from: isoOk(a.from) ? a.from : "first entry", to: isoOk(a.to) ? a.to : "latest entry" };
}

// group entries by category, month, shop/person name, person, type or day
const shopName = e => { const k = merchantKey(e.note); return k ? k.replace(/(^|\s)([a-z])/g, (m, a, c) => a + c.toUpperCase()) : (e.category || "Other"); };
function groupEntries(es, by) {
  const g = {};
  es.forEach(e => {
    const k = by === "category" ? (e.category || "Other") : by === "meal" ? (e.category === EAT ? (mealName(e.meal) || "Meal not set") : "Not eating out") : by === "month" ? (e.date || "").slice(0, 7) : by === "person" ? pname(e.person) : by === "type" ? e.type : by === "day" ? e.date : by === "shop" ? shopName(e) : "all";
    (g[k] = g[k] || { key: k, total: 0, count: 0 }); g[k].total += +e.amount; g[k].count++;
  });
  const time = by === "month" || by === "day";
  return Object.values(g).map(x => Object.assign(x, { total: r2(x.total) })).sort((x, y) => time ? x.key.localeCompare(y.key) : y.total - x.total);
}
const GROUP_COL = { category: "Category", meal: "Meal", month: "Month", shop: "Shop or person", person: "Person", type: "Type", day: "Day" };
const keyLabel = (by, k) => by === "month" ? monthName(k, true) : by === "day" ? fmtDate(k) : by === "type" ? (TYPE_LABEL[k] || k) : k;
// a table / chart the chat shows under its reply, with a Download CSV button. The app works out every number.
function makeReport(a) {
  a = Object.assign({}, a || {});
  let by = GROUP_COL[a.groupBy] ? a.groupBy : "none";
  if (by !== "none" && by !== "type" && (!a.type || a.type === "all")) a.type = "expense";
  const { es, who, from, to } = filterEntries(a);
  let chart = ["pie", "bar", "table"].includes(a.chart) ? a.chart : by === "month" || by === "day" ? "bar" : by === "none" ? "table" : "pie";
  if (chart === "pie" && (by === "month" || by === "day")) chart = "bar";
  if (by === "none") chart = "table";
  const title = String(a.title || "").slice(0, 80) || (by === "none" ? "Entries" : (a.type === "income" ? "Income" : "Spending") + " by " + GROUP_COL[by].toLowerCase());
  const sub = (isGroup() ? whoLabel(who) : "Yours") + ", " + (isoOk(a.from) ? fmtDate(a.from) : "from the start") + " to " + (isoOk(a.to) ? fmtDate(a.to) : "now");
  let rep;
  if (by === "none") {
    const rows = es.slice().sort(a.sort === "largest" ? (x, y) => y.amount - x.amount : a.sort === "oldest" ? (x, y) => x.date.localeCompare(y.date) : (x, y) => y.date.localeCompare(x.date)).slice(0, Math.max(1, Math.min(+a.limit || 2000, 2000)));
    rep = { title, sub, chart, by, cols: ["Date", "Type", "Category", "Note", "Amount"], rows: rows.map(e => [e.date, TYPE_LABEL[e.type] || e.type, e.category || "", e.note || "", r2(+e.amount)]), total: r2(sum(rows, e => +e.amount)) };
  } else {
    const gs = groupEntries(es, by), tot = sum(gs, x => x.total);
    rep = { title, sub, chart, by, cols: [GROUP_COL[by], "Amount", "Entries", "Share"], rows: gs.map(x => [keyLabel(by, x.key), x.total, x.count, tot ? Math.round(x.total / tot * 1000) / 10 + "%" : ""]), total: r2(tot) };
  }
  return { rep, forAi: { report: title, period: sub, chart: rep.chart, rows: rep.rows.length, total: rep.total, first_rows: rep.rows.slice(0, 12), shown_to_user: "as a " + (rep.chart === "table" ? "table" : rep.chart + " chart and table") + " with a Download CSV button" } };
}

// ---------- lookups Gemini can ask for (exact numbers come from here) ----------
const TOOLS = {
  totals(a) {
    const { es, who, from, to } = filterEntries(a);
    const res = { person: whoLabel(who), from, to, type: a.type || "all", category: a.category || null, search: a.search || null, total: r2(sum(es, e => +e.amount)), count: es.length };
    const by = a.groupBy;
    if (by && by !== "none") res.groups = groupEntries(es, by).slice(0, 40);
    return res;
  },
  list(a) {
    const { es, who, from, to } = filterEntries(a), lim = Math.max(1, Math.min(+a.limit || 15, 40));
    const sorted = es.slice().sort(a.sort === "largest" ? (x, y) => y.amount - x.amount : a.sort === "oldest" ? (x, y) => x.date.localeCompare(y.date) : (x, y) => y.date.localeCompare(x.date));
    return { person: whoLabel(who), from, to, count: es.length, shown: sorted.slice(0, lim).map(e => ({ date: e.date, type: e.type, amount: +e.amount, category: e.category || "", meal: mealName(e.meal) || undefined, note: e.note || "", person: pname(e.person), goal: goalName(e.goalId) || undefined })) };
  },
  month_summary(a) {
    const k = MONTH.test(String(a.month || "")) ? a.month : monthKey(new Date()), who = resolvePerson(a.person);
    const t = { income: 0, spent: 0, save: 0, withdraw: 0 }, cats = {};
    state.entries.filter(e => effMonth(e) === k && countsMoney(e) && (who === "all" || e.person === who)).forEach(e => {
      const v = +e.amount || 0;
      if (e.type === "income") t.income += v; else if (e.type === "expense") { t.spent += v; cats[e.category || "Other"] = (cats[e.category || "Other"] || 0) + v; } else if (e.type === "save") t.save += v; else if (e.type === "withdraw") t.withdraw += v;
    });
    return { month: k, person: whoLabel(who), income: r2(t.income), spent: r2(t.spent), moved_to_savings: r2(t.save - t.withdraw), left_to_spend: r2(t.income - t.spent - (t.save - t.withdraw)),
      top_spending: Object.entries(cats).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([c, v]) => ({ category: c, total: r2(v) })) };
  },
  goals(a) {
    const who = resolvePerson(a.person), nowK = monthKey(new Date());
    return visibleGoals(who).map(g => {
      const bal = goalBalance(g.id), tgt = +g.target || 0, m = g.by ? monthsBetween(nowK, g.by) : null;
      return { name: g.name, owner: g.owner === "shared" ? "Shared" : pname(g.owner), target: tgt, saved: r2(bal), percent: tgt ? Math.round(bal / tgt * 100) : 0, remaining: r2(Math.max(tgt - bal, 0)),
        target_month: g.by || null, months_left: m, needed_per_month: m && m > 0 && tgt > bal ? r2((tgt - bal) / m) : null,
        contributions: people().map(p => ({ person: p.name, saved: r2(goalBalance(g.id, p.id)) })) };
    });
  },
  savings(a) {
    const who = resolvePerson(a.person), total = totalSavings(null, who), inGoals = sum(visibleGoals(who), g => goalBalance(g.id, who));
    return { person: whoLabel(who), total_savings: r2(total), in_goals: r2(inGoals), not_in_a_goal: r2(total - inGoals) };
  },
  loans(a) {
    const who = resolvePerson(a && a.person);
    return state.loans.filter(l => who === "all" || l.person === who).map(l => ({ with: l.counterparty, direction: l.direction === "lent" ? "lent to them" : "borrowed from them", whose: pname(l.person),
      amount: +l.amount, still_owed: loanOutstanding(l), date: l.date, due: l.due || null, paid_off: loanOutstanding(l) <= 0.004 }));
  },
  budgets(a) {
    const who = resolvePerson(a && a.person), k = MONTH.test(String((a && a.month) || "")) ? a.month : monthKey(new Date()), b = budgetsFor(who);
    return { person: whoLabel(who), month: k, budgets: Object.keys(b).map(c => ({ category: c, limit: +b[c], spent: r2(spentIn(k, who, c)), left: r2(+b[c] - spentIn(k, who, c)) })) };
  },
  owed() { const ps = owesPairs(); return !ps.length ? { status: "nobody owes anything for shared costs" } : { owing: ps.map(p => ({ owes: pname(p.debtor), to: pname(p.creditor), amount: p.amt })) }; },
  repeating(a) { const who = resolvePerson(a && a.person); return state.recurring.filter(r => who === "all" || r.person === who).map(r => ({ what: r.note || r.category, type: r.type, amount: +r.amount, day: r.day, whose: pname(r.person), paused: !!r.paused })); }
};
const TOOL_LABEL = { report: "report", totals: "totals", list: "entries", month_summary: "month summary", goals: "goals", savings: "savings", loans: "loans", budgets: "budgets", owed: "shared costs", repeating: "bills & reminders" };
const ACTIONS = ["propose_entries", "add_loan", "loan_repayment", "create_goal", "set_budget", "add_recurring", "settle_up"];

function chatContext() {
  const cats = [...new Set(EXP_CATS.concat(INC_CATS, state.entries.map(e => e.category).filter(Boolean)))];
  const dates = state.entries.map(e => e.date).filter(Boolean).sort(), loans = openLoans("all");
  return [
    "- Today is " + todayISO() + " (" + new Date().toLocaleDateString("en-GB", { weekday: "long" }) + "). Currency: " + (state.settings.currency || "MVR") + ". \"10k\" means 10,000.",
    "- People: " + people().map(p => p.name).join(", ") + ". The person talking to you is " + pname(asker()) + ". " + (isGroup() ? "This is the shared group \"" + groupName() + "\"." : "This is their own private space.") + " The app screen is showing " + whoLabel(ui.view) + " for " + monthName(ui.month) + ".",
    "- Categories in use: " + cats.join(", ") + ".",
    "- Savings goals: " + (state.goals.length ? state.goals.map(g => g.name + " (" + (g.owner === "shared" ? "shared" : pname(g.owner)) + ")").join(", ") : "none") + ".",
    "- Open loans: " + (loans.length ? loans.map(l => (l.direction === "lent" ? pname(l.person) + " lent " : pname(l.person) + " borrowed from ") + l.counterparty + " (" + loanOutstanding(l) + " still owed)").join("; ") : "none") + ".",
    "- Data: " + state.entries.length + " entries" + (dates.length ? ", from " + dates[0] + " to " + dates[dates.length - 1] : "") + "."
  ].join("\n");
}
const historyText = () => chat.msgs.filter(m => !m.pending).slice(-9, -1).map(m => (m.role === "user" ? "User: " : "Assistant: ") + m.text).join("\n") || "(none)";
function quickFacts() {
  const now = monthKey(new Date()), me = asker();
  const f = { this_month: TOOLS.month_summary({ month: now, person: me }), last_month: TOOLS.month_summary({ month: shiftMonth(now, -1), person: me }) };
  if (isGroup()) f.group_this_month = TOOLS.month_summary({ month: now, person: "all" });
  try { f.savings = TOOLS.savings({ person: me }); } catch {}
  try { f.goals = TOOLS.goals({ person: me }).map(g => ({ name: g.name, saved: g.saved, target: g.target, percent: g.percent })); } catch {}
  try { f.owed = TOOLS.owed(); } catch {}
  try { f.bills = TOOLS.repeating({ person: me }); } catch {}
  return JSON.stringify(f).slice(0, 6000);
}
function planPrompt(q, voice) {
  return [
    "You are the assistant inside Pocket Ledger, a household money tracker. You can look things up and you can prepare changes (the user confirms them with one tap). Decide what to do for the latest message. Reply with JSON only.",
    "", "Context:", chatContext(), "",
    "Quick facts (already worked out, exact): " + quickFacts(), "",
    "Lookups:",
    '- totals {from, to, person, type, category, search, groupBy}: sum and count of matching entries. groupBy: "category", "meal", "month", "shop", "person", "type", "day" or "none". Eating out entries can have a meal (Breakfast, Lunch, Dinner, Snacks); for "how much on lunch/breakfast/snacks" use category "Eating out" with groupBy "meal". "shop" groups by the shop or person named in the note.',
    '- report {title, chart, from, to, person, type, category, search, groupBy, sort, limit}: use whenever the user wants to SEE or DOWNLOAD data: a table, chart, graph, pie, breakdown, list to export, CSV, spreadsheet or Excel file. The app draws it in the chat with a Download CSV button. chart: "pie" for shares of a whole (groupBy category, shop or person), "bar" for change over time (groupBy month or day), "table" for a plain list (groupBy "none" lists every matching entry). title: a short name like "Eating out by month, 2026".',
    '- list {from, to, person, type, category, search, sort, limit}: individual entries. sort: "newest", "oldest" or "largest".',
    '- month_summary {month, person}: income, spending, savings and what is left for one month ("YYYY-MM").',
    "- goals {person}, savings {person}, loans {person}, budgets {month, person}, owed {} (who owes whom for shared costs), repeating {person}.",
    "",
    "Changes (prepared for the user to confirm):",
    "- propose_entries {entries: [{type, amount, date, category, note, person, goal, split}]}: record income, spending, savings or withdrawals. split: true when the user says it was shared with their partner and should be split half each.",
    '- add_loan {direction, counterparty, amount, date, due, note, person}: money lent ("direction": "lent") or borrowed ("borrowed"). counterparty is the other person\'s name.',
    "- loan_repayment {counterparty, amount, date, person}: part or all of an open loan was paid back.",
    "- create_goal {name, target, by, owner}: a savings goal. by is \"YYYY-MM\" or null. owner is a person's name or \"shared\".",
    "- set_budget {category, amount, person}: a monthly spending limit for a category.",
    "- add_recurring {type, amount, category, note, person, day}: a monthly reminder for something due on a day each month (rent, bills, phone, electricity, class fees). It reminds; the user marks it paid.",
    "- settle_up {}: the partners have settled what they owe each other for shared costs.",
    "",
    'Rules: person is "me" for the person talking ("I", "my"), a person\'s name, or "all" for the household ("we", "our"). If unclear for lookups, use "all"; for changes, use "me". type is expense, income, save or withdraw. Dates are YYYY-MM-DD; work out relative dates from today; default to today. Use existing category names when one fits. Understand casual speech, slang and mixed languages. Use at most 4 calls.',
    "If something essential for a change is missing (like the amount, or the name of the person in a loan), don't guess: return no calls and ask one short question in reply. If the user then says they don't want to say, use \"Friend\" as the name.",
    "",
    "Conversation so far:", historyText(), "",
    voice ? "Latest message: the attached voice recording. First write exactly what was said in \"heard\"." : "Latest message: " + q, "",
    'Reply with exactly: {"heard": ' + (voice ? '"what was said"' : "null") + ', "calls": [{"tool": "...", "args": {...}}], "reply": null, "suggestions": []}. When you only prepare changes, put one short friendly line in reply (e.g. "Got it, a 10,000 loan to Ali. Tap Confirm to save it.").',
    "If nothing needs looking up or changing (a greeting, a question about the app, or a clarifying question), return an empty calls list and put your reply in reply, with 0-3 short suggestions the user might tap next (for a clarifying question, likely answers).",
    "FAST PATH: if the Quick facts already answer the question exactly (this or last month's income, spending, top categories, what's left, savings, goals, who owes whom, bills), don't make any calls: answer directly in reply (1-3 sentences, amounts like \"MVR 1,250.00\", **bold** for the key number, say which period) with 2-3 suggestions. Use lookups only when the facts don't cover it (other dates, a specific category or shop, lists of entries)."
  ].join("\n");
}
function answerPrompt(q, results) {
  return [
    "You are the assistant inside Pocket Ledger, a household money tracker. Reply to the latest message using ONLY the results below.",
    "Match the user's tone (casual is fine) but stay clear. Be brief: 1-3 sentences, or a short list with lines starting \"- \". Use amounts like \"MVR 1,250.00\" and say which period and whose money you mean. You may use **bold** for the key number. No headings.",
    "When changes were prepared, say in one line what will be saved and that they just need to tap Confirm. Don't claim anything is saved yet.",
    "When a report was made, it is already shown under your reply as a chart/table with a Download CSV button: give the key takeaway in 1-2 sentences and don't repeat the rows.",
    "If the results don't contain what is needed, say so and suggest a way to ask. Only give money advice if asked; keep it simple and kind.",
    "", "Context:", chatContext(), "",
    "Conversation so far:", historyText(), "",
    "Latest message: " + q, "",
    "Results (JSON):", JSON.stringify(results).slice(0, 60000), "",
    'Reply with JSON only: {"reply": "your answer", "suggestions": ["...", "..."]}. suggestions are 2-3 short follow-ups the user might want next, written as the user would say them (for example "Show those entries", "Compare with last month", "Set an eating out budget of 1,500"). Make them specific to this answer and doable in the app.'
  ].join("\n");
}

// ---------- prepared changes (the confirm card) ----------
const findGoal = n => n ? state.goals.find(g => g.name.toLowerCase() === String(n).toLowerCase()) || state.goals.find(g => g.name.toLowerCase().includes(String(n).toLowerCase())) : null;
const meIfAll = () => asker(); // in your own space and in groups you always add things as yourself
function prepareAction(tool, a) {
  a = a || {};
  const cur = c => money(+c || 0);
  if (tool === "propose_entries") {
    const list = (Array.isArray(a.entries) ? a.entries : []).filter(t => +t.amount > 0).slice(0, 10).map(t => {
      const type = ["expense", "income", "save", "withdraw"].includes(t.type) ? t.type : "expense", person = meIfAll(), goal = findGoal(t.goal);
      const e = { type, amount: r2(t.amount), date: isoOk(t.date) ? t.date : todayISO(), person, category: String(t.category || (type === "income" ? "Salary" : type === "save" || type === "withdraw" ? "Savings" : "Other")), note: String(t.note || "").slice(0, 80), source: "chat" };
      if (goal && (type === "save" || type === "withdraw")) e.goalId = goal.id;
      const other = (people().find(p => p.id !== person) || {}).id;
      if (t.split && type === "expense" && other) e.split = { with: other, share: 0.5 };
      return e;
    });
    if (!list.length) return null;
    return { tool, entries: list, lines: list.map(e => TYPE_LABEL[e.type] + " " + cur(e.amount) + ", " + (e.note || e.category) + ", " + fmtDate(e.date) + ", " + pname(e.person) + (e.split ? ", split with " + pname(e.split.with) : "") + (e.goalId ? ", " + goalName(e.goalId) : "")) };
  }
  if (tool === "add_loan") {
    if (!(+a.amount > 0)) return null;
    const d = { direction: a.direction === "borrowed" ? "borrowed" : "lent", counterparty: String(a.counterparty || "Friend").slice(0, 40), amount: r2(a.amount), date: isoOk(a.date) ? a.date : todayISO(), due: isoOk(a.due) ? a.due : "", note: a.note || "", person: meIfAll() };
    return { tool, data: d, lines: [(d.direction === "lent" ? "Loan to " : "Loan from ") + d.counterparty + ", " + cur(d.amount) + ", " + fmtDate(d.date) + ", " + pname(d.person) + (d.due ? ", due " + fmtDate(d.due) : "")] };
  }
  if (tool === "loan_repayment") {
    const loan = findLoan(a.counterparty, a.person ? resolvePerson(a.person) : "all");
    if (!loan) return { tool, invalid: true, lines: ["No open loan with " + (a.counterparty || "that person") + " found"] };
    const amt = r2(+a.amount > 0 ? Math.min(+a.amount, loanOutstanding(loan)) : loanOutstanding(loan));
    return { tool, loan, amount: amt, date: isoOk(a.date) ? a.date : todayISO(), lines: [(loan.direction === "lent" ? loan.counterparty + " paid back " : "Paid back " + loan.counterparty + " ") + cur(amt) + (amt >= loanOutstanding(loan) - 0.004 ? " (fully paid)" : " (" + cur(loanOutstanding(loan) - amt) + " still owed)")] };
  }
  if (tool === "create_goal") {
    if (!a.name || !(+a.target > 0)) return null;
    const owner = isGroup() ? "shared" : meIfAll(), by = MONTH.test(String(a.by || "")) ? a.by : "";
    return { tool, data: { name: String(a.name).slice(0, 40), target: r2(a.target), by, owner, created: Date.now() }, lines: ["New goal: " + a.name + ", " + cur(a.target) + (by ? " by " + monthName(by, true) : "") + ", " + pname(owner)] };
  }
  if (tool === "set_budget") {
    if (!a.category || !(+a.amount >= 0)) return null;
    const who = a.person ? resolvePerson(a.person) : ui.view;
    return { tool, who, category: String(a.category), amount: r2(a.amount), lines: ["Budget: " + a.category + ", " + cur(a.amount) + " a month, " + whoLabel(who)] };
  }
  if (tool === "add_recurring") {
    if (!(+a.amount > 0)) return null;
    const d = { type: ["expense", "income", "save", "withdraw"].includes(a.type) ? a.type : "expense", amount: r2(a.amount), category: a.category, note: a.note || "", person: meIfAll(), day: parseInt(a.day, 10) || new Date().getDate() };
    return { tool, data: d, lines: ["Every month on day " + d.day + ": " + (d.note || d.category || d.type) + ", " + cur(d.amount) + ", " + pname(d.person) + ", reminder"] };
  }
  if (tool === "settle_up") {
    const p = owesPairs()[0]; if (!p) return { tool, invalid: true, lines: ["Nothing to settle: nobody owes anything for shared costs"] };
    return { tool, pair: p, lines: [pname(p.debtor) + " pays " + pname(p.creditor) + " " + cur(p.amt) + " (settled)"] };
  }
  return null;
}
function runAction(x) {
  if (x.invalid) return;
  if (x.tool === "propose_entries") addEntries(x.entries);
  else if (x.tool === "add_loan") createLoan(x.data);
  else if (x.tool === "loan_repayment") recordRepayment(x.loan, x.amount, x.date);
  else if (x.tool === "create_goal") db.saveGoal(null, x.data);
  else if (x.tool === "set_budget") setBudget(x.who, x.category, x.amount);
  else if (x.tool === "add_recurring") createRecurring(x.data);
  else if (x.tool === "settle_up") settlePair(x.pair);
}

// ---------- reports in the chat (chart + table + CSV) ----------
const SERIES = 8, svgEl = (w, h, body, label) => `<svg class="rep-svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;
function pieSvg(r) {
  // up to 7 slices, the rest folded into "Other"
  let sl = r.rows.map(x => ({ k: String(x[0]), v: +x[1] })).filter(x => x.v > 0);
  if (sl.length > SERIES) { const rest = sl.slice(SERIES - 1); sl = sl.slice(0, SERIES - 1).concat({ k: "All the rest", v: sum(rest, x => x.v), rest: true }); }
  const tot = sum(sl, x => x.v); if (!tot) return "";
  const R = 52, C = 2 * Math.PI * R; let at = 0;
  const arcs = sl.map((x, i) => { const len = x.v / tot * C, gap = sl.length > 1 ? Math.min(2, len / 2) : 0;
    const s = `<circle r="${R}" cx="70" cy="70" fill="none" class="${x.rest ? "rep-rest" : "rep-c" + (i + 1)}" stroke-width="22" stroke-dasharray="${Math.max(len - gap, 0.01)} ${C}" stroke-dashoffset="${-at}" transform="rotate(-90 70 70)"><title>${esc(x.k)}: ${esc(money(x.v))} (${Math.round(x.v / tot * 100)}%)</title></circle>`;
    at += len; return s; }).join("");
  const legend = `<ul class="rep-legend">${sl.map((x, i) => `<li><i class="${x.rest ? "rep-rest" : "rep-c" + (i + 1)}"></i><span>${esc(x.k)}</span><b class="num">${Math.round(x.v / tot * 100)}%</b></li>`).join("")}</ul>`;
  return `<div class="rep-pie">${svgEl(140, 140, arcs + `<text x="70" y="66" class="rep-mid">Total</text><text x="70" y="84" class="rep-mid num">${esc(money(tot, { whole: true }))}</text>`, r.title)}${legend}</div>`;
}
function barSvg(r) {
  const rows = r.rows.slice(-24), vals = rows.map(x => +x[1] || 0), max = Math.max(...vals, 0); if (!max) return "";
  const W = 300, H = 150, base = 124, top = 16, n = rows.length, slot = W / n, bw = Math.max(4, Math.min(28, slot - 4)), hi = vals.indexOf(max);
  const bars = rows.map((x, i) => { const h = Math.max(1, (vals[i] / max) * (base - top)), xx = i * slot + (slot - bw) / 2, y = base - h, rr = Math.min(4, bw / 2, h);
    return `<g><path class="rep-bar" d="M${xx},${base} V${y + rr} Q${xx},${y} ${xx + rr},${y} H${xx + bw - rr} Q${xx + bw},${y} ${xx + bw},${y + rr} V${base} Z"/><rect class="rep-hit" x="${i * slot}" y="${top - 12}" width="${slot}" height="${base - top + 12}"><title>${esc(String(x[0]))}: ${esc(money(vals[i]))}</title></rect>` +
      (n <= 12 || i % Math.ceil(n / 12) === 0 ? `<text class="rep-ax" x="${xx + bw / 2}" y="${base + 16}">${esc(String(x[0]).replace(/ \d{4}$/, "").slice(0, 6))}</text>` : "") +
      (i === hi ? `<text class="rep-val" x="${xx + bw / 2}" y="${y - 5}">${esc(money(vals[i], { whole: true }).replace(/^MVR\s?/, ""))}</text>` : "") + `</g>`; }).join("");
  return svgEl(W, H, `<line class="rep-base" x1="0" x2="${W}" y1="${base}" y2="${base}"/>` + bars, r.title);
}
function reportHtml(r, i, j) {
  const fmt = (v, c) => c === "Amount" ? esc(money(+v)) : c === "Date" ? esc(fmtDate(v)) : esc(String(v));
  const show = r.open ? r.rows : r.rows.slice(0, 8);
  const tbl = r.rows.length ? `<div class="rep-tbl"><table><thead><tr>${r.cols.map(c => `<th${c === "Amount" || c === "Entries" || c === "Share" ? ' class="n"' : ""}>${esc(c)}</th>`).join("")}</tr></thead><tbody>${show.map(row => `<tr>${row.map((v, k) => `<td${r.cols[k] === "Amount" || r.cols[k] === "Entries" || r.cols[k] === "Share" ? ' class="n num"' : ""}>${fmt(v, r.cols[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="hint">Nothing matches.</p>`;
  return `<div class="rep" data-rep="${i}:${j}"><div class="rep-head"><b>${esc(r.title)}</b><small>${esc(r.sub)}, ${r.rows.length} row${r.rows.length === 1 ? "" : "s"}, total ${esc(money(r.total))}</small></div>
    ${r.chart === "pie" ? pieSvg(r) : r.chart === "bar" ? barSvg(r) : ""}${tbl}
    <div class="row-btns">${r.rows.length > 8 ? `<button class="ghost" type="button" data-repmore="${i}:${j}">${r.open ? "Show less" : "Show all " + r.rows.length}</button>` : ""}${r.rows.length ? `<button class="ghost" type="button" data-repcsv="${i}:${j}">Download CSV</button>` : ""}</div></div>`;
}
function reportCsv(r) {
  const cell = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
  const csv = [r.cols].concat(r.rows).map(row => row.map(cell).join(",")).join("\r\n");
  saveFile(("pocket-ledger-" + r.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "").slice(0, 60) + ".csv", "\ufeff" + csv, "Saved");
}

// ---------- the chat panel ----------
function fmtReply(t) {
  return esc(String(t || "").trim()).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .split("\n").map(l => /^\s*[-•]\s+/.test(l) ? '<span class="li">' + l.replace(/^\s*[-•]\s+/, "") + "</span>" : l).join("<br>")
    .replace(/<br>(<span class="li">)/g, "$1").replace(/(<\/span>)<br>/g, "$1");
}
function renderChat() {
  const box = $("chatMsgs");
  if (!chat.msgs.length) {
    const sugg = ["How much did I spend this month?", "I lent Ali 10k today", "Rent is 5,500 on the 1st every month", isGroup() ? "Who owes who?" : "How are my goals doing?"];
    box.innerHTML = `<div class="chat-empty"><p>Ask about your money, or tell me what happened, by typing or with the mic. I'll look up exact numbers, and I'll prepare any changes for you to confirm.</p><div class="chips">${sugg.map(s => `<button type="button" class="chipq">${esc(s)}</button>`).join("")}</div></div>`;
  } else {
    box.innerHTML = chat.msgs.map((m, i) => m.role === "user"
      ? `<div class="msg me">${m.voice ? '<span class="vtag">🎙</span> ' : ""}${esc(m.text)}</div>`
      : `<div class="msg ai${m.error ? " err" : ""}"><div>${m.pending ? '<span class="spin" aria-hidden="true"></span>' + esc(m.pendingText || "Thinking…") : fmtReply(m.text)}</div>` +
        (m.actions && m.actions.length ? `<div class="act-card${m.done ? " done" : ""}">${m.actions.map(x => `<div class="act-line${x.invalid ? " bad" : ""}">${esc(x.lines.join("; "))}</div>`).join("")}` +
          (m.done ? `<small>${m.done === "yes" ? "Saved ✓" : "Not saved"}</small>` : m.actions.some(x => !x.invalid) && !state.readOnly ? `<div class="row-btns"><button class="primary" type="button" data-ok="${i}">Confirm</button>${m.actions.length === 1 && m.actions[0].tool === "propose_entries" ? `<button class="ghost" type="button" data-editact="${i}">Edit first</button>` : ""}<button class="icon-btn" type="button" data-no="${i}">Not now</button></div>` : "") + `</div>` : "") +
        (m.reports && !m.pending ? m.reports.map((r, j) => reportHtml(r, i, j)).join("") : "") +
        (m.note ? `<small>${esc(m.note)}</small>` : "") +
        (i === chat.msgs.length - 1 && !m.pending && !chat.busy && m.sugg && m.sugg.length ? `<div class="chips follow">${m.sugg.filter(x => typeof x === "string" && x.trim()).slice(0, 3).map(x => `<button type="button" class="chipq">${esc(x.trim().slice(0, 80))}</button>`).join("")}</div>` : "") +
        (m.action === "settings" ? `<button type="button" class="ghost" data-act="settings">Open Settings</button>` : "") + `</div>`).join("");
  }
  box.scrollTop = box.scrollHeight;
  // while Gemini works, Stop takes the place of Ask (so the row never gets wider than the screen)
  $("chatSend").disabled = chat.busy || rec.on; $("chatSend").hidden = chat.busy;
  $("chatStop").hidden = !chat.busy;
  $("chatMic").classList.toggle("rec", rec.on);
  $("chatMic").setAttribute("aria-label", rec.on ? "Stop recording" : "Speak");
  $("chatRecBar").hidden = !rec.on;
  $("chatSpeak").setAttribute("aria-pressed", String(speakOn()));
}
export function openChat() { $("chatPanel").hidden = false; document.body.classList.add("chat-open"); renderChat(); setTimeout(() => { if (canHover()) $("chatInput").focus(); }, 50); }
function closeChat() { if (rec.on) stopRec(true); $("chatPanel").hidden = true; document.body.classList.remove("chat-open"); try { speechSynthesis.cancel(); } catch {} }

// ---------- voice: record, then Gemini listens ----------
export async function startRec() {
  if (chat.busy) return;
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast("Voice isn't supported in this browser."); return; }
  try { rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch { toast("Allow microphone access to talk to Pocket Ledger."); return; }
  try { speechSynthesis.cancel(); } catch {}
  rec.chunks = []; rec.mr = new MediaRecorder(rec.stream);
  rec.mr.ondataavailable = e => { if (e.data && e.data.size) rec.chunks.push(e.data); };
  rec.mr.start(); rec.on = true; rec.t0 = Date.now();
  rec.timer = setInterval(() => { const s = Math.floor((Date.now() - rec.t0) / 1000); $("chatRecTime").textContent = "0:" + String(s).padStart(2, "0"); if (s >= 59) stopRec(false); }, 250);
  $("chatRecTime").textContent = "0:00";
  renderChat();
}
function stopRec(cancel) {
  if (!rec.on) return;
  clearInterval(rec.timer); rec.on = false;
  const mr = rec.mr, stream = rec.stream;
  mr.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    renderChat();
    if (cancel || Date.now() - rec.t0 < 600) return;
    try { askChat(await toWav(new Blob(rec.chunks, { type: mr.mimeType || "audio/webm" }))); }
    catch { toast("Couldn't use that recording. Try again."); }
  };
  try { mr.stop(); } catch { stream.getTracks().forEach(t => t.stop()); }
  renderChat();
}
async function toWav(blob) {
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC(); const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); if (ctx.close) ctx.close();
  const rate = 16000, len = Math.max(1, Math.ceil(buf.duration * rate));
  const off = new OfflineAudioContext(1, len, rate); const src = off.createBufferSource(); src.buffer = buf; src.connect(off.destination); src.start();
  const out = (await off.startRendering()).getChannelData(0);
  const ab = new ArrayBuffer(44 + out.length * 2), v = new DataView(ab);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + out.length * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, out.length * 2, true);
  for (let i = 0; i < out.length; i++) { const s = Math.max(-1, Math.min(1, out[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  let bin = ""; const bytes = new Uint8Array(ab); for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function speak(text) {
  if (!speakOn() || !window.speechSynthesis) return;
  try {
    const plain = String(text).replace(/\*\*/g, "").replace(/^\s*[-•]\s+/gm, "").replace(/MVR\s?/g, "rufiyaa ").slice(0, 600);
    const u = new SpeechSynthesisUtterance(plain); u.rate = 1.05; speechSynthesis.cancel(); setTimeout(() => { try { speechSynthesis.speak(u); } catch {} }, 60);
  } catch {}
}

async function askChat(voiceWav) {
  const typed = $("chatInput").value.trim();
  if ((!typed && !voiceWav) || chat.busy) return;
  const voice = !!voiceWav;
  if (!voice) { $("chatInput").value = ""; $("chatInput").style.height = "auto"; }
  const userMsg = { role: "user", text: voice ? "…" : typed, voice }, reply = { role: "model", text: "", pending: true, pendingText: voice ? "Listening…" : "Thinking…" };
  chat.msgs.push(userMsg, reply);
  chat.busy = true; const ctl = new AbortController(); chat.abort = ctl;
  renderChat();
  try {
    const plan = parseJsonText(await geminiText(planPrompt(typed, voice), [], { json: true, signal: ctl.signal, audio: voiceWav }));
    if (voice) { userMsg.text = String((plan && plan.heard) || "(voice message)").slice(0, 400); reply.pendingText = "Thinking…"; renderChat(); }
    const q = userMsg.text, calls = (Array.isArray(plan && plan.calls) ? plan.calls : []).slice(0, 4);
    if (!calls.length) {
      reply.text = (plan && plan.reply) || "Could you say that another way? For example: \"How much did I spend on eating out this month?\"";
      reply.sugg = Array.isArray(plan && plan.suggestions) ? plan.suggestions : [];
    } else {
      const results = [], actions = [], looked = [];
      for (const c of calls) {
        const name = String(c.tool || ""), args = c.args || {};
        if (ACTIONS.includes(name)) {
          const x = prepareAction(name, args);
          if (x) { actions.push(x); results.push({ prepared_change: x.lines.join("; "), can_save: !x.invalid }); }
          else results.push({ change: name, problem: "Missing details (like the amount)" });
          continue;
        }
        if (name === "report") {
          const r = makeReport(args); (reply.reports = reply.reports || []).push(r.rep); results.push({ tool: name, args, result: r.forAi }); looked.push("report"); continue;
        }
        const fn = TOOLS[name];
        results.push({ tool: name, args, result: fn ? fn(args) : "Unknown lookup" });
        if (fn) looked.push(TOOL_LABEL[name] || name);
      }
      if (!looked.length && actions.length) {
        // only changes to confirm: no need to ask Gemini again
        reply.text = (plan && plan.reply) || (actions.some(x => !x.invalid) ? "Here's what I'll save. Check it and tap Confirm." : actions.map(x => x.lines.join("; ")).join("\n"));
        reply.sugg = [];
      } else {
        reply.pendingText = "Looking it up…"; renderChat();
        const raw = await geminiText(answerPrompt(q, results), [], { json: true, signal: ctl.signal, temperature: 0.3 });
        let ans = null; try { ans = parseJsonText(raw); } catch {}
        reply.text = ans && typeof ans.reply === "string" ? ans.reply : raw;
        reply.sugg = ans && Array.isArray(ans.suggestions) ? ans.suggestions : [];
      }
      if (looked.length) reply.note = "Looked up: " + [...new Set(looked)].join(", ");
      if (actions.length) reply.actions = actions;
    }
    if (voice) speak(reply.text);
  } catch (e) {
    if (e && !e.code && e.message) e = { code: "http", message: e.message };
    const code = e && e.code;
    if (voice && userMsg.text === "…") userMsg.text = "(voice message)";
    if (code === "cancelled") reply.text = "Stopped.";
    else {
      reply.error = true;
      reply.text = {
        no_key: "Set up Gemini in Settings first. Using your secure server lets everyone chat and scan.",
        bad_key: "Google didn't accept the Gemini key. Check it in Settings › Gemini.",
        offline: "Chat needs an internet connection.",
        rate_limited: "Gemini's limit was reached for now. Try again in a minute.",
        server_down: "The server had a problem. Try again in a moment."
      }[code] || "Something went wrong. Try again.";
      if (code === "no_key" || code === "bad_key") reply.action = "settings";
      if (e && e.message && code === "http") reply.note = "Details: " + String(e.message).slice(0, 200);
    }
  }
  reply.pending = false; chat.busy = false; chat.abort = null;
  renderChat();
}

export function initChat() {
  $("chatFab").hidden = false;
  $("chatFab").addEventListener("click", openChat);
  // tuck the chat button away while scrolling down; it comes back as soon as you scroll up (or reach the top)
  let lastY = window.scrollY;
  addEventListener("scroll", () => {
    const y = window.scrollY, dy = y - lastY; if (Math.abs(dy) < 6) return; lastY = y;
    $("chatFab").classList.toggle("tucked", dy > 0 && y > 80);
  }, { passive: true });
  window.addEventListener("hashchange", () => { $("chatFab").classList.remove("tucked"); lastY = window.scrollY; });
  $("chatClose").addEventListener("click", closeChat);
  $("chatClear").addEventListener("click", () => { if (chat.abort) chat.abort.abort(); chat.msgs = []; chat.busy = false; renderChat(); });
  $("chatStop").addEventListener("click", () => { if (chat.abort) chat.abort.abort(); });
  $("chatMsgs").addEventListener("click", ev => {
    const c = ev.target.closest(".chipq"); if (c) { $("chatInput").value = c.textContent; askChat(); return; }
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.act === "settings") { closeChat(); go("settings", "ai"); return; }
    const rk = b.dataset.repcsv || b.dataset.repmore;
    if (rk) { const [mi, rj] = rk.split(":").map(Number), r = ((chat.msgs[mi] || {}).reports || [])[rj]; if (!r) return;
      if (b.dataset.repcsv) reportCsv(r); else { r.open = !r.open; const y = $("chatMsgs").scrollTop; renderChat(); $("chatMsgs").scrollTop = y; } return; }
    const m = chat.msgs[+(b.dataset.ok || b.dataset.no || b.dataset.editact)]; if (!m || m.done) return;
    if (b.dataset.ok !== undefined) { m.actions.forEach(runAction); m.done = "yes"; toast("Saved"); renderChat(); }
    else if (b.dataset.no !== undefined) { m.done = "no"; renderChat(); }
    else if (b.dataset.editact !== undefined) { m.done = "no"; closeChat(); showProposals(m.actions[0].entries); }
  });
  $("chatForm").addEventListener("submit", ev => { ev.preventDefault(); askChat(); });
  $("chatInput").addEventListener("keydown", ev => { if (ev.key === "Enter" && !ev.shiftKey && canHover()) { ev.preventDefault(); askChat(); } });
  $("chatInput").addEventListener("input", () => { const t = $("chatInput"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 120) + "px"; });
  $("chatSpeak").addEventListener("click", () => { lsSet("pl-speak", speakOn() ? "0" : ""); if (!speakOn()) try { speechSynthesis.cancel(); } catch {} renderChat(); });
  $("chatMic").addEventListener("click", () => rec.on ? stopRec(false) : startRec());
  $("chatRecCancel").addEventListener("click", () => stopRec(true));
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && !$("chatPanel").hidden) closeChat(); });
}
