// g29 (v70): the safety fixes. Daily alerts (paid bills, old loan repayments, carryover in budgets), money-sent text limits,
// CSV files that can't run formulas, backups checked before restoring (with a copy saved first), a Gemini key never kept in a group.
// Made-up data.
const { start } = require("./lib");
const { computeAlerts, shiftMonth } = require("../functions/alerts");
const fs = require("fs"), os = require("os"), path = require("path");
const U = "uid_tomxcom", V = "uid_sarxcom", H = "households/P1", G = "households/G1";
const now = new Date(), pad = n => String(n).padStart(2, "0"), K = now.getFullYear() + "-" + pad(now.getMonth() + 1), today = K + "-" + pad(now.getDate());
const seed = {
  ["access/" + U]: { ok: true, how: "invite" }, ["access/" + V]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: ["G1"], name: "Tom", email: "tom@x.com" },
  ["users/" + V]: { personal: "P2", spaces: [], name: "Sara", email: "sara@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: false }, gemini: { key: "" }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }], contacts: [{ uid: V, name: "Sara" }] } },
  "households/P2": { type: "personal", owner: V, members: [V], settings: { currency: "MVR", opening: 0, people: [{ id: V, name: "Sara" }] } },
  [G]: { type: "group", name: "Trip", owner: U, members: [U], names: { [U]: "Tom" }, ai: { server: false }, gemini: { key: "old-shared-key-123" }, settings: { currency: "MVR", opening: 0 } },
  [H + "/entries/e1"]: { type: "expense", amount: 120, date: K + "-01", category: "Other", note: '=HYPERLINK("http://x.test","tap")', person: U, author: U, created: 1 },
  [H + "/entries/e2"]: { type: "expense", amount: 80, date: K + "-01", category: "Transport", note: "-cash taxi", person: U, author: U, created: 2 }
};

(async () => {
  console.log("g29: safety fixes");
  const { check } = require("./lib");

  // ---- 1. daily alerts (the server's own logic, with the entries the morning check now loads) ----
  const hh = { members: ["u"], settings: { people: [{ id: "u", name: "Me" }], budgets: { u: { Transport: 800 } } }, alertState: {} };
  const months = n => shiftMonth(K, -n);
  const paid = [4, 3, 2, 1, 0].map(n => ({ id: "rec-r1-" + months(n), type: "expense", amount: 5500, date: months(n) + "-01", person: "u", category: "Rent & bills" }));
  const all = paid.concat([
    { id: "p1", type: "income", amount: 1500, date: months(5) + "-10", person: "u", loanId: "L1", loanRole: "repay" },
    { id: "c1", type: "carryover", amount: 400, date: K + "-01", person: "u", category: "Transport" },
    { id: "t1", type: "expense", amount: 900, date: K + "-01", person: "u", category: "Transport" }]);
  const recurring = [{ id: "r1", type: "expense", amount: 5500, day: 1, note: "Rent", person: "u", startMonth: months(4) }];
  const loans = [{ id: "L1", direction: "lent", counterparty: "Ali", amount: 2000, date: months(6) + "-01", due: today, person: "u" }];
  // what dailyAlerts loads: a year of entries plus every loan repayment
  const since = months(12) + "-01", loaded = all.filter(e => e.date >= since || e.loanRole === "repay");
  let a = computeAlerts(hh, { entries: loaded, recurring, loans }, today).alerts;
  check(!a.some(x => x.kind === "bills"), "bills paid months ago don't come back as overdue", a.map(x => x.title + " " + x.body));
  check(a.some(x => x.kind === "loans" && /MVR 500\b/.test(x.body)) && !a.some(x => /2,000/.test(x.body)), "a loan reminder counts repayments made long ago", a.filter(x => x.kind === "loans").map(x => x.body));
  check(!a.some(x => /Over budget/.test(x.title)), "money carried over adds to the budget (900 of 800 + 400 is not over)", a.map(x => x.title));
  a = computeAlerts(hh, { entries: loaded.filter(e => e.id !== "c1"), recurring, loans }, today).alerts;
  check(a.some(x => /Over budget: Transport/.test(x.title)), "without the carryover it is over budget");
  // a bill that began two years ago still has this month checked
  const oldBill = [{ id: "r9", type: "expense", amount: 300, day: now.getDate(), note: "Gym", person: "u", startMonth: months(24) }];
  const donePast = Array.from({ length: 13 }, (_, i) => ({ id: "rec-r9-" + months(i + 1), type: "expense", amount: 300, date: months(i + 1) + "-01", person: "u" }));
  a = computeAlerts({ members: ["u"], settings: {}, alertState: {} }, { entries: donePast, recurring: oldBill, loans: [] }, today).alerts;
  check(a.length === 1 && /Gym/.test(a[0].body) && /due today/.test(a[0].body), "a bill older than 13 months is still reminded this month", a.map(x => x.body));

  // ---- 2. in the app ----
  const T = await start({ seed, users: { "tom@x.com": "secret12", "sara@x.com": "secret12" } }), { p } = T;
  await T.login("tom@x.com", "#entries"); await p.waitForTimeout(900);

  // money sent: short text only, and a sensible amount (the rules refuse the rest)
  const send = extra => p.evaluate(async ([to, extra]) => {
    const { F, db, user } = window.PL.ctx;
    const d = Object.assign({ from: user.uid, fromName: "Tom", to, toName: "Sara", amount: 50, date: "2026-01-01", note: "lunch", created: Date.now(), author: user.uid }, extra);
    try { await F.setDoc(F.doc(F.collection(db, "transfers")), d); return "saved"; } catch (e) { return e.code || "error"; }
  }, [V, extra]);
  check(await send({}) === "saved", "an ordinary transfer is saved");
  check(await send({ note: "x".repeat(161) }) === "permission-denied", "a note longer than 160 characters is refused");
  check(await send({ fromName: "Your bank ".repeat(6) }) === "permission-denied", "a sender name longer than 40 characters is refused");
  check(await send({ amount: 5e9 }) === "permission-denied", "an absurd amount is refused");
  await p.evaluate(() => { window.__denied = []; });
  for (let i = T.errs.length - 1; i >= 0; i--) if (/RULES DENIED write transfers\//.test(T.errs[i])) T.errs.splice(i, 1); // the three refusals above were the point

  // CSV export: text that looks like a formula is saved as plain text; real amounts stay numbers
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#exportBtn")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  check(csv.includes(`"'=HYPERLINK(""http://x.test"",""tap"")"`) && csv.includes(",'-cash taxi,") && /,120,MVR/.test(csv), "exported notes can't run as formulas, amounts are untouched", csv.split("\r\n").slice(1, 3));

  // restoring: a damaged file is refused before anything changes
  const tmp = f => path.join(os.tmpdir(), f);
  const good = { app: "pocket-ledger", version: 2, entries: [{ id: "b1", type: "income", amount: 9000, date: K + "-02", category: "Salary", note: "From the backup" }], goals: [], settings: { currency: "MVR" } };
  fs.writeFileSync(tmp("pl-bad.json"), JSON.stringify(Object.assign({}, good, { entries: good.entries.concat({ id: "b2", type: "expense", amount: "lots", date: "soon" }) })));
  fs.writeFileSync(tmp("pl-good.json"), JSON.stringify(good));
  await T.nav("settings/backup"); await p.waitForTimeout(300);
  await p.setInputFiles("#restoreFile", tmp("pl-bad.json")); await p.waitForTimeout(400);
  check(await p.isHidden("#restoreBanner") && /entry 2 is damaged/.test(await p.textContent("#toast")), "a backup with a damaged entry is refused, saying which one", await p.textContent("#toast"));
  await p.setInputFiles("#restoreFile", tmp("pl-good.json")); await p.waitForTimeout(400);
  check(await p.isVisible("#restoreBanner") && /copy of what you have now/.test(await p.textContent("#restoreMsg")), "a good backup asks first and says a copy is kept");
  const [before] = await Promise.all([p.waitForEvent("download"), p.click("#restoreYes")]);
  const kept = JSON.parse(fs.readFileSync(await before.path(), "utf8"));
  check(/before-restore/.test(before.suggestedFilename()) && kept.entries.length === 2, "what was there is saved to the device before restoring", before.suggestedFilename());
  await p.waitForTimeout(900);
  const d1 = await T.db(), ents = Object.keys(d1).filter(k => k.startsWith(H + "/entries/"));
  check(ents.length === 1 && d1[H + "/entries/b1"] && d1[H + "/entries/b1"].amount === 9000, "the restore replaced the entries with the backup's", ents);

  // a Gemini key left in a group by an older version moves to its creator's device and out of the shared data
  await T.space(2); await p.waitForTimeout(900);
  const d2 = await T.db();
  check(d2[G].gemini.key === "" && await p.evaluate(() => localStorage.getItem("pl-gemini-key")) === "old-shared-key-123", "an old key stored in a group is moved to this device and removed from the group", d2[G].gemini);
  await T.nav("settings/ai"); await p.waitForTimeout(300);
  await p.fill("#setHKey", "new-device-key-456"); await p.click("#saveAi"); await p.waitForTimeout(400);
  const d3 = await T.db();
  check(d3[G].gemini.key === "" && await p.evaluate(() => localStorage.getItem("pl-gemini-key")) === "new-device-key-456", "a key typed while in a group stays on this device", d3[G].gemini);
  check(/this device only/.test(await p.textContent("#hkeyHint")), "the screen says so", await p.textContent("#hkeyHint"));
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
