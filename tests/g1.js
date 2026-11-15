// g1: an old shared household (p1/p2 people) moves to: Adam's own space + a "Household" group.
const { start, thisMonth } = require("./lib");
const H = "households/HH1";
const seed = thisMonth({
  [H]: { members: ["uid_adamxcom", "uid_linaxcom"], personOf: { uid_adamxcom: "p1", uid_linaxcom: "p2" }, joinUntil: 0, ai: { server: true }, gemini: { key: "" },
    settings: { currency: "MVR", opening: 1000, openingBy: { p1: 1000, p2: 500 }, people: [{ id: "p1", name: "Adam", acct: "4821", bank: "ADAM NAZIM", color: "#1f8a7a" }, { id: "p2", name: "Lina", acct: "1111", color: "#c0587e" }], budgets: { p1: { Food: 2000 }, all: { Bills: 3000 } } } },
  [H + "/entries/e1"]: { type: "income", amount: 20000, date: "2026-10-01", category: "Salary", person: "p1", created: 1 },
  [H + "/entries/e2"]: { type: "expense", amount: 300, date: "2026-10-01", category: "Food", note: "Adam lunch", person: "p1", created: 2 },
  [H + "/entries/e3"]: { type: "expense", amount: 1000, date: "2026-10-01", category: "Groceries", note: "Shared groceries", person: "p1", split: { with: "p2", share: 0.5 }, created: 3 },
  [H + "/entries/e4"]: { type: "expense", amount: 450, date: "2026-10-01", category: "Shopping", note: "Lina dress", person: "p2", created: 4 },
  [H + "/entries/e5"]: { type: "save", amount: 700, date: "2026-10-01", category: "Savings", goalId: "gS", person: "p2", created: 5 },
  [H + "/entries/e6"]: { type: "income", amount: 15000, date: "2026-10-01", category: "Salary", person: "p2", created: 6 },
  [H + "/goals/gP"]: { name: "New phone", target: 20000, owner: "p1", created: 1 },
  [H + "/goals/gS"]: { name: "Bali trip", target: 30000, owner: "shared", created: 2 },
  [H + "/loans/l1"]: { direction: "lent", counterparty: "Ali", amount: 10000, date: "2026-09-20", person: "p1", created: 1 },
  [H + "/recurring/r1"]: { type: "expense", amount: 800, category: "Bills", note: "Lina phone", person: "p2", day: 15, remindDays: 3, startMonth: "2026-10" },
  [H + "/settlements/s1"]: { from: "p2", to: "p1", amount: 100, date: "2026-09-30", created: 1 },
  "users/uid_adamxcom": { household: "HH1", email: "adam@x.com" },
  "users/uid_linaxcom": { household: "HH1", email: "lina@x.com" }
});
const users = { "adam@x.com": "secret12", "lina@x.com": "secret12", "ali@x.com": "secret12" };

(async () => {
  const T = await start({ seed, users }), { p, check } = T;
  console.log("g1: migration of the old household");
  await T.login("adam@x.com", "#entries");
  const bar = await T.bar();
  check(bar.join("|") === "*Me|Household", "space bar shows Me and Household", bar);
  check(await p.isHidden("#who"), "no person switch in your own space");
  let rows = await T.rows();
  check(rows.length === 2 && rows.some(r => /Adam lunch/.test(r)) && rows.some(r => /Salary/.test(r)), "Me has Adam's own income and lunch", rows);
  check(rows.every(r => /Edit\/Delete/.test(r)), "own entries can be edited", rows);
  let d = await T.db();
  const u = d["users/uid_adamxcom"];
  check(!!u.personal && u.spaces.includes("HH1"), "user doc points to personal space and the group", u);
  check(d[H].type === "group" && d[H].name === "Household" && d[H].owner === "uid_adamxcom", "old household became a group owned by Adam", { type: d[H].type, owner: d[H].owner });
  check(!d[H + "/entries/e1"] && !!d[H + "/entries/e3"], "private entries moved out, split entry stayed");
  await T.nav("home");
  check((await p.textContent("#heroLabel")) === "Left to spend this month", "hero says 'Left to spend' (your)", await p.textContent("#heroLabel"));
  check(/owed to you/i.test(await T.text("#tiles")), "loan tile shows money owed to you", await T.text("#tiles"));
  await T.nav("loans");
  check(/Lent to Ali/.test(await T.text("#loanList")), "loan moved to Me", await T.text("#loanList"));
  await T.nav("goals");
  check(/New phone/.test(await T.text("#goals")) && !/Bali/.test(await T.text("#goals")), "personal goal in Me, shared goal not");
  // the group
  await T.nav("home"); await T.space(2);
  check(!(await p.isHidden("#who")), "group shows the person switch");
  check(/All of Household/.test(await T.text("#who")), "switch has 'All of Household'", await T.text("#who"));
  check(/Lina owes you MVR\s?400\.00/.test(await T.text("#owesBar")), "Lina owes Adam 400 for shared costs", await T.text("#owesBar"));
  await T.nav("entries");
  rows = await T.rows();
  check(rows.length === 2 && rows.some(r => /Shared groceries/.test(r)) && !rows.some(r => /dress/.test(r)), "group shows split cost and shared-goal saving only (Lina's private hidden)", rows);
  check(rows.some(r => /Saved for Bali trip.*\[\]$/.test(r)), "Lina's saving can't be edited by Adam", rows);
  await T.nav("goals");
  check(/Bali trip/.test(await T.text("#goals")), "shared goal in the group");
  await T.saveState("");
  await T.end();
})();
