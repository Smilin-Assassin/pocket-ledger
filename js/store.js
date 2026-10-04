// The data layer: the space you're looking at (your own "Me" space, a group, or
// someone's dashboard you were allowed to see), live from Firestore, plus the
// numbers worked out from it. Every screen reads from here.
import { toast, setCurrency, monthKey, shiftMonth, todayISO, sum, r2, dateIn, daysBetween, lsGet, lsSet } from "./util.js";

export const EXP_CATS = ["Food & groceries", "Eating out", "Rent & bills", "Transport", "Phone & internet", "Shopping", "Health", "Education", "Family & gifts", "Entertainment", "Loans given", "Loan repayment", "Other"];
export const INC_CATS = ["Salary", "Side income", "Overtime", "Gift", "Loan repaid", "Loan received", "Other"];
export const LOAN_OUT = "Loans given", LOAN_IN = "Loan received", LOAN_BACK_IN = "Loan repaid", LOAN_BACK_OUT = "Loan repayment";
export const PCOLORS = ["#2F6FD6", "#9B4F96", "#0E8A7D", "#C9821B", "#4C9A2A", "#D0526E"];
export const TYPE_LABEL = { expense: "Spent", income: "Income", save: "Save", withdraw: "Withdraw" };
// Eating out is one category with a meal inside it (v40): Breakfast, Lunch, Dinner, Snacks. Stored as entry.meal.
export const EAT = "Eating out";
export const MEALS = [["breakfast", "Breakfast"], ["lunch", "Lunch"], ["dinner", "Dinner"], ["snacks", "Snacks"]];
export const mealName = m => (MEALS.find(x => x[0] === m) || [])[1] || "";
// by the clock: before 11 breakfast, before 3 lunch, before 6 snacks (tea time), then dinner
export const mealAt = h => h < 4 ? "snacks" : h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 18 ? "snacks" : "dinner";
// by the words in a note (also short eats and packets you eat on the go, like gulha or bajiya)
const MEAL_WORDS = [[/breakfast|mas ?huni|roshi/i, "breakfast"], [/\blunch/i, "lunch"], [/dinner|supper/i, "dinner"],
  [/snack|gulha|bajiya|hedhikaa|short ?eats?|samosa|kavaabu|keemia|boakiba|chips|crisps|biscuit|cake|donut|ice ?cream|hi ?tea|tea ?time/i, "snacks"]];
export const mealFromNote = note => ((MEAL_WORDS.find(([re]) => re.test(String(note || ""))) || [])[1]) || "";
// snack words make a note Eating out even if a shop is usually groceries
export const isSnackNote = note => MEAL_WORDS[3][0].test(String(note || ""));
const COLS = ["entries", "goals", "loans", "recurring", "settlements"];

// ctx: what app.js hands over after sign-in (Firebase, the user, their spaces)
export const ctx = { F: null, db: null, user: null, hid: "", space: null, spaces: [], profile: {}, admin: false, sdk: "", app: null };
export const state = { entries: [], goals: [], loans: [], recurring: [], settlements: [], settings: { currency: "MVR", opening: 0, people: [] }, household: null, ready: false, readOnly: false, my: null };
export const ui = { month: monthKey(new Date()), view: "all" };
const raw = { entries: [], goals: [], loans: [], recurring: [], settlements: [] };

// ---------- change notifications (batched to one render per frame) ----------
const subs = new Set();
let queued = false;
export function onChange(fn) { subs.add(fn); return () => subs.delete(fn); }
export function changed() {
  if (queued) return; queued = true;
  const run = () => { queued = false; subs.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); };
  if (typeof requestAnimationFrame === "function" && !document.hidden) requestAnimationFrame(run); else setTimeout(run, 0);
}

// ---------- who's who ----------
export const meId = () => (ctx.user && ctx.user.uid) || "";
export const isGroup = () => !!(state.household && state.household.type === "group");
export const isViewer = () => !!(ctx.space && ctx.space.role === "viewer");
export const isOwner = () => !!(state.household && state.household.owner === meId());
export const groupName = () => isGroup() ? (state.household.name || "Group") : "Household";
export const people = () => state.settings.people || [];
export const pname = id => id === "shared" ? "Shared" : ((people().find(x => x.id === id) || {}).name || "Someone");
export const pcolor = id => (people().find(p => p.id === id) || {}).color || PCOLORS[Math.max(0, people().findIndex(p => p.id === id)) % PCOLORS.length];
export const isMine = id => !!id && id === meId();
export const isAll = () => ui.view === "all";
// "your" on your own dashboard; the person's name when it's someone else's
export const poss = id => { const n = pname(id); return isMine(id) || /^me$/i.test(n) ? "your" : n + "'s"; };
export const whoLabel = who => who === "all" ? groupName() : isMine(who) ? "You" : pname(who);
export const otherOf = id => (people().find(p => p.id !== id) || {}).id || "";

// Can I change this entry / goal / loan / bill? Only the person who added it.
export function canEdit(x) {
  if (state.readOnly || !x) return false;
  const me = meId();
  if (x.author) return x.author === me;
  if (!isGroup()) return true;
  if (x.owner === "shared") return state.household.owner === me;
  return !!(x.person || x.owner) && (x.person || x.owner) === me;
}
export function addedBy(x) { const a = x && (x.author || x.person); return a && a !== meId() && isGroup() ? pname(a) : ""; }

// ---------- shaping what came from the database ----------
// Old shared households used "p1"/"p2" for people; map them to accounts.
function legacyIds(arr) {
  const pOf = state.household && state.household.personOf;
  if (!pOf) return arr;
  const inv = {}; Object.keys(pOf).forEach(u => { inv[pOf[u]] = u; });
  const m = v => (v === "p1" || v === "p2") && inv[v] ? inv[v] : v;
  return arr.map(x0 => {
    const x = Object.assign({}, x0);
    if (x.person) x.person = m(x.person);
    if (x.owner) x.owner = m(x.owner);
    if (x.split && x.split.with) x.split = Object.assign({}, x.split, { with: m(x.split.with) });
    if (x.from) x.from = m(x.from);
    if (x.to) x.to = m(x.to);
    return x;
  });
}
function rebuild() {
  const hh = state.household || {}, st = state.settings, me = meId();
  if (isGroup()) {
    const nm = hh.names || {}, cl = hh.colors || {};
    st.people = (hh.members || []).map(u => Object.assign({ id: u, name: nm[u] || "Member" }, cl[u] ? { color: cl[u] } : {},
      u === me && state.my ? { bank: state.my.bank || "", acct: state.my.acct || "" } : {}));
    if (!st.people.length) st.people = [{ id: me, name: "Me" }];
  } else if (!Array.isArray(st.people) || !st.people.length) st.people = [{ id: hh.owner || me, name: "Me" }];
  if (!st.openingBy) st.openingBy = {};
  const solo = isGroup() ? "" : st.people[0].id;
  COLS.forEach(c => { state[c] = legacyIds(raw[c]); });
  state.entries.forEach(e => { if (!e.person) e.person = e.author || solo || hh.owner;
    if (e.type === "expense" && /^(breakfast|lunch|dinner|snacks?)$/i.test(e.category || "")) { e.meal = e.meal || e.category.toLowerCase().replace(/^snack$/, "snacks"); e.category = EAT; }
    if (e.meal && e.category !== EAT) delete e.meal; });
  state.goals.forEach(g => { if (!g.owner) g.owner = solo || g.author || "shared"; });
  // Until someone opens the new version, their old private entries still sit in the
  // shared group. Only split costs, shared-goal savings and group things belong there.
  if (isGroup()) {
    const shared = new Set(state.goals.filter(g => g.owner === "shared").map(g => g.id));
    const mineOrGroup = x => !!x.author || (x.person || x.owner) === me;
    state.entries = state.entries.filter(e => mineOrGroup(e) || (e.split && e.split.with) || (e.goalId && shared.has(e.goalId)));
    state.goals = state.goals.filter(g => g.owner === "shared" || mineOrGroup(g));
    state.loans = state.loans.filter(mineOrGroup);
    state.recurring = state.recurring.filter(mineOrGroup);
  }
  if (!state.household) return;
  if (!isGroup()) ui.view = st.people[0].id;
  else if (ui.view !== "all" && !st.people.some(p => p.id === ui.view)) ui.view = "all";
}
export function setView(v) { ui.view = v; try { localStorage.setItem("pl-view-" + ctx.hid, v); } catch {} changed(); }

// ---------- connect ----------
const got = { entries: false, goals: false, h: false };
export function connect(fb) {
  Object.assign(ctx, fb);
  if (ctx.space && ctx.space.role === "viewer") state.readOnly = true;
  ui.view = ctx.space && ctx.space.type === "group" ? (lsGet("pl-view-" + ctx.hid) || "all") : meId();
  const { F, db } = ctx, hh = F.doc(db, "households", ctx.hid);
  const snapErr = e => { if (e && e.code === "permission-denied") { state.readOnly = true; changed(); toast("You don't have access to this space."); } };
  const settle = k => { if (k in got) got[k] = true; if (got.entries && got.goals && got.h) state.ready = true; rebuild(); changed(); };
  COLS.forEach(c => F.onSnapshot(F.collection(hh, c), s => { raw[c] = s.docs.map(d => Object.assign({ id: d.id }, d.data())); settle(c); }, snapErr));
  F.onSnapshot(hh, s => {
    if (s.exists()) {
      state.household = s.data();
      state.settings = Object.assign({ currency: "MVR", opening: 0 }, JSON.parse(JSON.stringify(state.household.settings || {})));
      setCurrency(state.settings.currency);
    }
    settle("h");
  }, snapErr);
  // my own name / bank details live in my private space
  const pid = ctx.profile && ctx.profile.personal;
  if (pid && pid !== ctx.hid) {
    F.getDoc(F.doc(db, "households", pid)).then(s => { if (s.exists()) { const st0 = s.data().settings || {}; state.my = (st0.people || [])[0] || null; state.myRules = st0.catRules || {}; state.mySet = st0; rebuild(); changed(); } }).catch(() => {});
  }
}
export const rawDoc = (c, id) => { const x = (raw[c] || []).find(o => o.id === id); return x ? JSON.parse(JSON.stringify(x)) : null; };
export const hRef = id => ctx.F.doc(ctx.db, "households", id || ctx.hid);
export const uRef = () => ctx.F.doc(ctx.db, "users", meId());

// ---------- writing ----------
// Writes show up straight away and sync in the background (also offline),
// so we don't wait for the server; failures are reported when they happen.
const cleanS = o => { const c = JSON.parse(JSON.stringify(o)); delete c.id; return c; };
const clean = o => { const c = cleanS(o); c.author = c.author || meId(); return c; };
function fire(p) {
  p.catch(e => toast(e && e.code === "permission-denied" ? "Only the person who added that can change it." : "A change couldn't be saved. Check your connection."));
  return Promise.resolve();
}
const col = c => ctx.F.collection(hRef(), c);
// small extension points other modules fill in (smart.js adds a rough place to things you add today)
export const hooks = { place: null };
export const validId = id => /^[A-Za-z0-9_-]{1,100}$/.test(String(id || ""));
export const db = {
  add(e) { if (hooks.place) { try { hooks.place(e); } catch {} } const ref = ctx.F.doc(col("entries")); fire(ctx.F.setDoc(ref, clean(e))); return ref.id; },
  addWithId(id, e) { return fire(ctx.F.setDoc(ctx.F.doc(col("entries"), id), clean(e))); },
  update(id, e) { return fire(ctx.F.setDoc(ctx.F.doc(col("entries"), id), clean(e))); },
  remove(id) { return db.removeDoc("entries", id); },
  saveDoc(c, id, data) { const ref = id ? ctx.F.doc(col(c), id) : ctx.F.doc(col(c)); fire(ctx.F.setDoc(ref, clean(data))); return ref.id; },
  // deleting keeps a copy in "trash" for 30 days (Settings › Recently deleted)
  removeDoc(c, id) {
    const x = (raw[c] || []).find(o => o.id === id);
    const b = ctx.F.writeBatch(ctx.db);
    if (x) b.set(ctx.F.doc(col("trash"), c + "__" + id), { col: c, docId: id, data: cleanS(x), deletedAt: Date.now(), author: meId() });
    b.delete(ctx.F.doc(col(c), id));
    return fire(b.commit());
  },
  // many entries at once (statement imports): batched, returns the new ids straight away.
  // Like every other write, they show at once and sync in the background (no waiting on the server).
  addMany(list) {
    const F = ctx.F, ids = [];
    for (let i = 0; i < list.length; i += 400) {
      const b = F.writeBatch(ctx.db);
      list.slice(i, i + 400).forEach(e => { const ref = F.doc(col("entries")); ids.push(ref.id); b.set(ref, clean(e)); });
      fire(b.commit());
    }
    return Promise.resolve(ids);
  },
  // undoing an import: removed for good (not kept in Recently deleted)
  removeMany(ids) {
    const F = ctx.F;
    for (let i = 0; i < ids.length; i += 400) {
      const b = F.writeBatch(ctx.db);
      ids.slice(i, i + 400).forEach(id => b.delete(F.doc(col("entries"), id)));
      fire(b.commit());
    }
    return Promise.resolve();
  },
  // change a few fields on many entries at once (Find & replace, "change all")
  patchMany(ids, patch) {
    const F = ctx.F;
    for (let i = 0; i < ids.length; i += 400) {
      const b = F.writeBatch(ctx.db);
      ids.slice(i, i + 400).forEach(id => b.update(F.doc(col("entries"), id), patch));
      fire(b.commit());
    }
  },
  // remember a category for a shop or person (kept in your own space, used by imports, scans and the form)
  saveCatRule(type, key, category) {
    if (!key || !category || !ctx.profile || !ctx.profile.personal) return;
    const rules = JSON.parse(JSON.stringify(catRules()));
    (rules[type] = rules[type] || {})[key] = category;
    if (!isGroup()) state.settings.catRules = rules; else state.myRules = rules;
    return fire(ctx.F.updateDoc(hRef(ctx.profile.personal), { "settings.catRules": rules }));
  },
  // put back something just deleted (the Undo button) and drop its Recently deleted copy
  restoreDoc(c, id, data) {
    const b = ctx.F.writeBatch(ctx.db);
    b.set(ctx.F.doc(col(c), id), clean(Object.assign({}, data, { author: data.author || meId() })));
    b.delete(ctx.F.doc(col("trash"), c + "__" + id));
    return fire(b.commit());
  },
  saveGoal(id, g) { return db.saveDoc("goals", id, g); },
  saveSettings(partial) {
    const c = cleanS(Object.assign({}, state.settings, partial));
    if (isGroup()) delete c.people;
    return fire(ctx.F.updateDoc(hRef(), { settings: c }));
  },
  updateSpace(patch) { return ctx.F.updateDoc(hRef(), patch); },
  // restore a backup file into your own space (Me); groups aren't touched
  async replaceAll(d) {
    if (isGroup()) { toast("Restore a backup from your own space (Me), not from a group."); throw { code: "group" }; }
    const F = ctx.F, me = meId();
    const toMe = v => (!v || v === "p1" || v === "p2") ? me : v;
    const incoming = {
      entries: (d.entries || []).map(e => Object.assign({}, e, { person: toMe(e.person), author: me })),
      goals: (d.goals || []).map(g => Object.assign({}, g, { owner: g.owner === "shared" ? "shared" : toMe(g.owner), author: me }))
    };
    ["recurring", "loans", "settlements"].forEach(c => { incoming[c] = (Array.isArray(d[c]) ? d[c] : []).map(x => Object.assign({}, x, x.person ? { person: toMe(x.person) } : {}, { author: me })); });
    const ops = [];
    COLS.forEach(c => {
      const keep = new Set(incoming[c].filter(x => validId(x.id)).map(x => x.id));
      raw[c].forEach(x => { if (!keep.has(x.id)) ops.push(b => b.delete(F.doc(col(c), x.id))); });
      incoming[c].forEach(x => ops.push(b => b.set(validId(x.id) ? F.doc(col(c), x.id) : F.doc(col(c)), clean(x))));
    });
    for (let i = 0; i < ops.length; i += 400) { const b = F.writeBatch(ctx.db); ops.slice(i, i + 400).forEach(f => f(b)); await b.commit(); }
    const st = Object.assign({ currency: "MVR", opening: 0 }, d.settings || {});
    st.people = [Object.assign({}, people()[0] || {}, { id: me })];
    st.openingBy = { [me]: +((d.settings && d.settings.openingBy && (d.settings.openingBy[me] ?? d.settings.openingBy.p1)) || st.opening || 0) };
    await F.updateDoc(hRef(), { settings: cleanS(st) });
  }
};

// ======================================================================
// Numbers
// ======================================================================
export const effMonth = e => e.countMonth || (e.date || "").slice(0, 7);
// loans are kept out of monthly money unless the loan is ticked "count it"
export function countsMoney(e) {
  if (!e.loanId) return true;
  const l = state.loans.find(x => x.id === e.loanId);
  return !!(l && l.inMonth);
}
const whoOk = (who, person) => who === "all" || person === who;
export const viewEntries = (who = ui.view) => who === "all" ? state.entries : state.entries.filter(e => e.person === who);
export const inMonth = (k, who = ui.view) => viewEntries(who).filter(e => effMonth(e) === k);
export function monthTotals(k, who = ui.view) {
  const t = { income: 0, spent: 0, save: 0, withdraw: 0 };
  inMonth(k, who).filter(countsMoney).forEach(e => { const a = +e.amount || 0; if (e.type === "income") t.income += a; else if (e.type === "expense") t.spent += a; else if (e.type === "save") t.save += a; else if (e.type === "withdraw") t.withdraw += a; });
  t.netSaved = t.save - t.withdraw;
  t.left = t.income - t.spent - t.netSaved;
  return t;
}
export const flow = e => e.type === "save" ? +e.amount : e.type === "withdraw" ? -e.amount : 0;
export function totalSavings(uptoMonth, who = ui.view) {
  let es = viewEntries(who);
  if (uptoMonth) es = es.filter(e => (e.date || "").slice(0, 7) <= uptoMonth);
  const ob = state.settings.openingBy || {};
  const opening = who === "all" ? sum(Object.values(ob), v => +v || 0) : (+ob[who] || 0);
  return opening + sum(es, flow);
}
export const visibleGoals = (who = ui.view) => who === "all" ? state.goals : state.goals.filter(g => g.owner === who || g.owner === "shared");
export const goalBalance = (id, who) => sum(state.entries.filter(e => e.goalId === id && (!who || who === "all" || e.person === who)), flow);
export const goalName = id => (state.goals.find(g => g.id === id) || {}).name || "";

// loans
export function loanOutstanding(l) {
  const paid = sum(state.entries.filter(e => e.loanId === l.id && e.loanRole === "repay"), e => +e.amount);
  return r2((+l.amount || 0) - paid);
}
export const loansFor = (who = ui.view) => state.loans.filter(l => !who || whoOk(who, l.person));
export const openLoans = (who = ui.view) => loansFor(who).filter(l => loanOutstanding(l) > 0.004);

// bills & reminders (never added automatically)
export const remindDays = r => Math.max(1, Math.min(31, +r.remindDays || 7));
export const recEntryId = (r, k) => "rec-" + r.id + "-" + k;
let idSet = null, idSrc = null;
const entryIds = () => { if (idSrc !== state.entries) { idSrc = state.entries; idSet = new Set(state.entries.map(e => e.id)); } return idSet; };
export const billDone = (r, k) => (r.skips || []).includes(k) || entryIds().has(recEntryId(r, k));
export function billStatus(r, k) {
  const due = dateIn(k, r.day), left = daysBetween(todayISO(), due), win = remindDays(r);
  const level = left < 0 || left <= 1 ? "red" : left <= Math.ceil(win / 2) ? "amber" : "green";
  return { k, due, left, level, show: left <= win };
}
export function openBills(who = ui.view) {
  const now = monthKey(new Date()), out = [];
  state.recurring.filter(r => !r.paused && (!who || whoOk(who, r.person))).forEach(r => {
    let k = r.startMonth || now; if (k > now) k = now;
    for (let i = 0; i < 13 && k <= now; i++, k = shiftMonth(k, 1)) {
      if (k < (r.startMonth || now) || billDone(r, k)) continue;
      const st = billStatus(r, k);
      if (st.show) out.push(Object.assign({ r }, st));
    }
    // next month's bill if its reminder window already started (e.g. due on the 2nd)
    const nk = shiftMonth(now, 1), st = billStatus(r, nk);
    if (st.show && !billDone(r, nk)) out.push(Object.assign({ r }, st));
  });
  return out.sort((a, b) => a.left - b.left);
}
export const dueText = b => b.left < 0 ? "overdue by " + (-b.left) + " day" + (b.left === -1 ? "" : "s") : b.left === 0 ? "due today" : b.left === 1 ? "due tomorrow" : "due in " + b.left + " days";

// shared costs: who owes whom
export function owesPairs() {
  const net = {};
  const add = (debtor, creditor, amt) => { if (!debtor || !creditor || debtor === creditor) return; const k = [debtor, creditor].sort().join("|"); net[k] = (net[k] || 0) + (debtor < creditor ? amt : -amt); };
  state.entries.forEach(e => { if (e.type === "expense" && e.split && e.split.with && e.split.with !== e.person) add(e.split.with, e.person, r2((+e.amount || 0) * (+e.split.share || 0.5))); });
  state.settlements.forEach(s => add(s.to, s.from, +s.amount || 0));
  return Object.keys(net).map(k => { const [a, b] = k.split("|"), v = r2(net[k]); return v > 0 ? { debtor: a, creditor: b, amt: v } : { debtor: b, creditor: a, amt: -v }; })
    .filter(p => p.amt >= 0.01 && (p.debtor === meId() || p.creditor === meId() || isAll()));
}

// budgets
export const budgetsFor = (who = ui.view) => ((state.settings.budgets || {})[who]) || {};
export const spentIn = (k, who, cat) => sum(state.entries.filter(e => e.type === "expense" && effMonth(e) === k && countsMoney(e) && whoOk(who, e.person) && (!cat || (e.category || "Other") === cat)), e => +e.amount);

// categories: the defaults plus any you've used
export function catOptions(type) {
  const base = type === "income" ? INC_CATS : EXP_CATS;
  return [...new Set(base.concat(state.entries.filter(e => e.type === type && e.category).map(e => e.category)))];
}
// category memory: a rule you set (Find & replace, or changing one entry), else what you used last time for this shop / person
export const merchantKey = note => String(note || "").toLowerCase().split(/\s[–—-]\s|,|\(|:/)[0].replace(/^(transfer to|from|paid back|loan to|loan from)\s+/, "").replace(/[^a-z0-9 .&']/g, " ").replace(/\s+/g, " ").trim();
// your own space's settings, also while a group is open
export const mySettings = () => (isGroup() ? state.mySet : state.settings) || {};
export const catRules = () => (isGroup() ? state.myRules : state.settings.catRules) || {};
export function ruleFor(note, type) {
  const k = merchantKey(note), r = catRules()[type] || {}; if (k.length < 2) return "";
  if (r[k]) return r[k];
  const hit = Object.keys(r).filter(x => x.length >= 3 && (k.startsWith(x + " ") || x.startsWith(k + " "))).sort((a, b) => b.length - a.length)[0];
  return hit ? r[hit] : "";
}
export function guessCategory(note, type) {
  const k = merchantKey(note); if (k.length < 2) return "";
  const rule = ruleFor(note, type); if (rule) return rule;
  if (type === "expense" && isSnackNote(note)) return EAT;
  const pool = state.entries.filter(e => e.type === type && e.category && e.category !== "Other" && !e.loanId).sort((a, b) => (b.created || 0) - (a.created || 0));
  const hit = pool.find(e => merchantKey(e.note) === k) || (k.length >= 3 ? pool.find(e => merchantKey(e.note).startsWith(k)) : null);
  return hit ? hit.category : "";
}

export function lastSeenMark() {
  if (!ctx.F || isViewer()) return;
  if (Date.now() - (+lsGet("pl-seen") || 0) < 3 * 3600e3) return;
  ctx.F.setDoc(uRef(), { lastSeen: Date.now() }, { merge: true }).then(() => lsSet("pl-seen", String(Date.now()))).catch(() => {});
}
