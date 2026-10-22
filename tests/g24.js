// g24 (v55): Carryover. Money kept from an earlier month is its own entry type: it adds to Left to spend and to the
// budget of its category, and it is never counted as income or spending. Every month still starts at zero. Made-up data.
const { start, URL0 } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const now = new Date(), pad = n => String(n).padStart(2, "0"), K = now.getFullYear() + "-" + pad(now.getMonth() + 1);
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }],
    budgets: { [U]: { "Food & groceries": 1000, "Transport": 800 } } } }
};
let n = 0; const E = (d, amount, category, extra) => { seed[H + "/entries/e" + (++n)] = Object.assign({ type: "expense", amount, date: K + "-" + pad(d), category, note: category, person: U, author: U, created: Date.now() - n * 1000 }, extra || {}); };
E(1, 10000, "Salary", { type: "income" }); E(2, 700, "Food & groceries"); E(3, 500, "Transport");

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g24: carryover");
  await T.login("tom@x.com"); await p.waitForTimeout(600);

  // before: a month starts from nothing but its own entries, and there is no account balance card
  check(/8,800\.00/.test(await p.textContent("#leftBig")), "Left to spend starts from this month's own entries only", await p.textContent("#leftBig"));
  check(!(await p.$("#acctBar")), "no Your accounts card");

  // the Carryover type in the Entries form: it needs a category (that's where the budget is)
  await T.nav("entries");
  await p.click('#formPanel .seg button[data-t="carryover"]'); await p.waitForTimeout(150);
  check(await T.visible("#catField") && !(await T.visible("#goalField")), "Carryover asks for a category, not a savings goal");
  check(/isn't income or spending/.test(await p.textContent("#typeHint")) && /Add carryover/.test(await p.textContent("#submitBtn")), "the hint says it isn't income or spending", await p.textContent("#typeHint"));
  check(!(await T.visible("#repeatRow")), "no 'remind me every month' option on a carryover");
  const tooNarrow = await p.$$eval("#formPanel .seg button", bs => bs.filter(b => b.scrollWidth > b.clientWidth + 1).map(b => b.textContent));
  check(tooNarrow.length === 0, "all five type buttons fit on a phone", tooNarrow);
  const opts = await p.$$eval("#fCatSel option", o => o.map(x => x.value));
  check(opts.includes("Food & groceries") && !opts.includes("Salary") && !opts.includes("Loans given"), "only spending categories are offered", opts);
  await p.fill("#fAmount", "300"); await p.fill("#fNote", "Left from last month");
  await p.click("#submitBtn"); await p.waitForTimeout(250);
  check(/Pick the category/.test(await p.textContent("#formErr")) && !(await T.db())[H + "/entries/e4"], "no category: it asks for one and adds nothing", await p.textContent("#formErr"));
  await p.selectOption("#fCatSel", "Food & groceries"); await p.click("#submitBtn"); await p.waitForTimeout(500);
  const db = await T.db(), co = Object.entries(db).filter(([k, v]) => k.startsWith(H + "/entries/") && v.type === "carryover");
  check(co.length === 1 && co[0][1].amount === 300 && co[0][1].category === "Food & groceries" && co[0][1].person === U && co[0][1].date.startsWith(K), "the carryover is saved with its category and the month", co);
  check((await T.rows()).some(r => /Carried over to Food & groceries/.test(r) && /Left from last month/.test(r)), "it shows in the list as Carried over to the category, with its note", await T.rows());
  check(/\+\s?MVR\s?300\.00/.test(await p.$eval('#ledger li.tx:has-text("Carried over") .amt', a => a.textContent)) && await p.$eval('#ledger li.tx:has-text("Carried over") .amt', a => a.classList.contains("in")), "its amount shows as +300, in the money-in colour");

  // the numbers: left grows by 300, but income and spending are untouched
  await T.nav("home"); await p.waitForTimeout(500);
  check(/9,100\.00/.test(await p.textContent("#leftBig")), "Left to spend = carried over + income - spending (9,100)", await p.textContent("#leftBig"));
  check(/Includes MVR\s300 carried over/.test(await p.textContent("#leftSub")), "the summary says how much was carried over", await p.textContent("#leftSub"));
  check(/10,000\.00/.test(await p.textContent("#sIncome")) && /1,200\.00/.test(await p.textContent("#sSpent")), "income and spending don't include it", [await p.textContent("#sIncome"), await p.textContent("#sSpent")]);
  check(/1,200/.test(await p.textContent("#catNote")), "the spending by category total doesn't include it", await p.textContent("#catNote"));
  // the budget of that category grows by the carryover
  const bud = await T.text("#budgetList");
  check(/Food & groceries.*700.*of.*1,300/.test(bud) && /600.*left, 54% used, includes MVR\s300 carried over/.test(bud), "Food & groceries: 700 of 1,300 (1,000 budget + 300 carried over)", bud);
  check(/Transport.*500.*of.*800/.test(bud) && !/Transport.*includes/.test(bud), "other categories are unchanged", bud);

  // the budget alert uses the bigger limit: 1,100 is 85% of 1,300, not "over the 1,000 budget"
  await T.nav("entries");
  await p.click('#formPanel .seg button[data-t="expense"]'); await p.waitForTimeout(150);
  check(await T.visible("#repeatRow"), "the 'remind me every month' option is there again for spending");
  await p.fill("#fAmount", "400"); await p.selectOption("#fCatSel", "Food & groceries");
  await p.click("#submitBtn"); await p.waitForTimeout(1500);
  const toast = await p.textContent("#toast");
  check(/used 85% of the Food & groceries budget/.test(toast) && !/over the Food & groceries/.test(toast), "the alert counts the carried-over money in the budget", toast);

  await T.nav("home"); await p.waitForTimeout(500);
  const tile = await T.text('a.tile:has-text("Budgets")');
  check(/1 close/.test(tile) && !/over/.test(tile), "the Budgets tile counts the carried-over money too (1,100 of 1,300 is close, not over)", tile);
  await T.nav("entries"); await p.waitForTimeout(300);

  // the filter shows only carryovers, with their total
  await p.click('.filters [data-f="carryover"]'); await p.waitForTimeout(300);
  const rows = await T.rows();
  check(rows.length === 1 && /Carried over to Food & groceries/.test(rows[0]) && /carried over/.test(await T.text("#ledgerTotal")) && /Carried over/.test(await T.text("#ledgerTotal")), "the Carried over filter lists just that entry and its total", [rows, await T.text("#ledgerTotal")]);

  // a carryover belongs to its own month: the month before and after start from zero
  await T.nav("home"); await p.click("#nextM"); await p.waitForTimeout(400);
  check(/0\.00/.test(await p.textContent("#leftBig")) && !/carried over/.test(await p.textContent("#leftSub")), "next month starts at zero until a carryover is added", await p.textContent("#leftBig"));

  // editing keeps it a carryover; changing it changes what's left
  await p.click("#prevM"); await p.waitForTimeout(400); await T.nav("entries"); await p.waitForTimeout(300);
  await p.click('.filters [data-f="carryover"]'); await p.waitForTimeout(200);
  await p.click('#ledger li.tx [data-edit]', { force: true }); await p.waitForTimeout(300);
  check(await p.$eval('#formPanel .seg [data-t="carryover"]', b => b.getAttribute("aria-pressed")) === "true" && await p.inputValue("#fAmount") === "300", "editing opens it as a carryover with its amount");
  await p.fill("#fAmount", "250"); await p.click("#submitBtn"); await p.waitForTimeout(500);
  await T.nav("home"); await p.waitForTimeout(400);
  check(/8,650\.00/.test(await p.textContent("#leftBig")), "changing the amount changes Left to spend (10,000 + 250 - 1,600 spent)", await p.textContent("#leftBig"));

  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
