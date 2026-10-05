// g19 (v42): Dashboard name and folded cards, one Scan file(s) box, Categories tidy-up, repeat check,
// amount and date limits, Show more, deleting loans and repayments. Made-up data.
const { start, URL0 } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const now = new Date(), pad = n => String(n).padStart(2, "0"), K = now.getFullYear() + "-" + pad(now.getMonth() + 1), today = K + "-" + pad(now.getDate());
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom", bank: "THOMAS ALI HASSAN" }],
    catRules: { expense: { "corner shop": "Groceries run" } } } },
  [H + "/loans/L1"]: { direction: "borrowed", counterparty: "Sara", amount: 2000, date: K + "-02", due: "", person: U, author: U, inMonth: false },
  [H + "/entries/ls"]: { type: "income", amount: 2000, date: K + "-02", category: "Loan received", note: "Loan from Sara", person: U, author: U, created: 1, loanId: "L1", loanRole: "start" },
  [H + "/entries/lr"]: { type: "expense", amount: 500, date: K + "-03", category: "Loan repayment", note: "Paid back Sara", person: U, author: U, created: 2, loanId: "L1", loanRole: "repay" }
};
let n = 0; const E = (date, amount, category, note) => { seed[H + "/entries/e" + (++n)] = { type: "expense", amount, date, category, note, person: U, author: U, created: Date.now() - 864e5 - n }; };
E(K + "-01", 9000, "Salary", "Pay"); seed[H + "/entries/e1"].type = "income";
E(K + "-02", 120, "Groceries run", "Corner shop"); E(K + "-03", 80, "Groceries run", "Corner shop"); E(K + "-04", 300, "Food & groceries", "Supermarket");
for (let i = 0; i < 340; i++) E("2025-" + pad(1 + (i % 12)) + "-" + pad(1 + (i % 27)), 10 + i, "Transport", "Taxi ride " + i);

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  const mine = async () => { const d = await T.db(); return Object.keys(d).filter(k => k.startsWith(H + "/entries/")).map(k => Object.assign({ id: k.split("/").pop() }, d[k])); };
  console.log("g19: dashboard, scan file(s), categories, repeats, limits, show more, loans");
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(800);

  // Dashboard + folded cards
  check((await p.textContent("#pageTitle")) === "Dashboard" && /Dashboard/.test(await p.textContent('#dock [data-p="home"]')), "Home is called Dashboard (title and tab)", [await p.textContent("#pageTitle")]);
  check(await p.isHidden("#trendBody") && await p.isHidden("#cmpBody") && /In MVR/.test(await T.text("#trendSum")) && /Spent MVR/.test(await T.text("#cmpSum")), "12 months and Compare start folded, with a one-line summary", [await T.text("#trendSum"), await T.text("#cmpSum")]);
  await p.click("#trendPanel .fold-head"); await p.waitForTimeout(150);
  const anim = await p.evaluate(() => document.getAnimations().length);
  await p.waitForTimeout(900);
  check(await p.isVisible("#trendChart svg") && (await p.getAttribute("#trendPanel .fold-head", "aria-expanded")) === "true" && anim > 3, "tapping opens 12 months, animated", anim);
  await p.goto("about:blank"); await p.goto(URL0 + "#home"); await p.waitForTimeout(1300);
  check(await p.isVisible("#trendChart svg") && await p.isHidden("#cmpBody"), "an opened card stays open next time");
  await p.click("#trendPanel .fold-head"); await p.waitForTimeout(600);
  check(await p.isHidden("#trendBody"), "and folds again");

  // one Scan file(s) box: a CSV goes to the statement import
  await T.nav("entries");
  check(/Scan file\(s\)/.test(await p.textContent("#pg-entries .scanbig")) && !(await p.$("#pg-entries .side-links [data-statement]")), "Entries has one Scan file(s) box and no separate import line");
  const q = v => '"' + v + '"', ref = v => '"=""' + v + '"""';
  const csv = [[q("2025/12/02"), q("2025/12/02"), q("Purchase"), ref("RB0000000099"), ref("FT1\\B26"), q("01-12-2025 111111"), ref("SEA BREEZE CAFE"), q("MALE MV"), q("45"), q(""), q("955.00")].join(",")].join("\n") + "\n";
  await p.setInputFiles("#scanFile", { name: "bml.csv", mimeType: "text/csv", buffer: Buffer.from(csv) }); await p.waitForTimeout(2000);
  check((await mine()).some(e => e.ref === "RB0000000099" && e.source === "statement"), "a CSV picked in Scan file(s) is imported as a statement");
  await p.click('#scanList [data-imp="close"], #scanList [data-imp="see"]').catch(() => {}); await p.waitForTimeout(300);
  await T.nav("entries");

  // limits and the repeat check in the form
  const err = async () => (await p.isVisible("#formErr")) ? await p.textContent("#formErr") : "";
  await p.fill("#fAmount", "25000000"); await p.click("#submitBtn"); await p.waitForTimeout(200);
  check(/over MVR\s?10,000,000/.test(await err()), "amounts over 10 million are refused", await err());
  await p.fill("#fAmount", "50"); await p.fill("#fDate", "1990-05-01"); await p.click("#submitBtn"); await p.waitForTimeout(200);
  check(/looks like a typo/.test(await err()), "a date in 1990 is refused", await err());
  await p.fill("#fDate", today); await p.fill("#fNote", "Bread"); await p.click("#submitBtn"); await p.waitForTimeout(500);
  await p.fill("#fAmount", "50"); await p.fill("#fNote", "Bread"); await p.click("#submitBtn"); await p.waitForTimeout(300);
  check(/You added MVR\s?50\.00 \(Bread\) just now/.test(await err()) && (await mine()).filter(e => e.note === "Bread").length === 1, "the same thing again within minutes asks first", await err());
  await p.click("#submitBtn"); await p.waitForTimeout(500);
  check((await mine()).filter(e => e.note === "Bread").length === 2, "tapping again adds the real repeat");
  await p.fill("#fAmount", "50"); await p.fill("#fNote", "Milk"); await p.click("#submitBtn"); await p.waitForTimeout(400);
  check((await mine()).some(e => e.note === "Milk") && !(await err()), "a different note isn't treated as a repeat");
  // Quick add: still adds, but says so
  await p.click("#dkPlus"); await p.waitForTimeout(600); for (const k of ["5", "0"]) await p.click(`#qaPad [data-k="${k}"]`);
  await p.click("#qaNoteBtn"); await p.fill("#qaNote", "Bread"); await p.click('#qaChips .qa-chip >> nth=0').catch(() => {});
  await p.click("#qaSave"); await p.waitForTimeout(700);
  check(/Added again/.test(await T.text("#toast")), "Quick add says when it looks like a repeat", await T.text("#toast"));

  // Show more on a long all-months search
  await T.nav("entries"); await p.fill("#searchQ", "taxi"); await p.waitForTimeout(400);
  check(/Nothing matches "taxi" in/.test(await T.text("#ledger")), "search looks in this month first (the taxis are last year)");
  await p.click('#ledger [data-search-all="1"]'); await p.waitForTimeout(400);
  check((await T.rows()).length === 300 && /40 not shown yet/.test(await T.text("#ledger")), "a long list shows 300 first", (await T.rows()).length);
  await p.click("#ledger [data-showmore]"); await p.waitForTimeout(400);
  check((await T.rows()).length === 340 && !(await p.$("#ledger [data-showmore]")), "Show more brings the rest");
  await p.fill("#searchQ", ""); await p.waitForTimeout(300);

  // the custom category option is a deliberate choice, with a hint
  await p.selectOption("#fCatSel", "__other"); await p.fill("#fCat", "food & GROCERIES"); await p.waitForTimeout(100);
  check(/You already have Food & groceries/.test(await p.textContent("#catHint")), "typing an existing category (any case) says it'll go there", await p.textContent("#catHint"));
  await p.fill("#fCat", "Pet food"); await p.waitForTimeout(100);
  check(/New category/.test(await p.textContent("#catHint")) && (await p.$$eval("#fCatSel option", o => o.map(x => x.textContent))).includes("+ New category…"), "a new one is labelled as new", await p.textContent("#catHint"));
  await p.selectOption("#fCatSel", ""); await p.fill("#fAmount", "");

  // Settings › Categories: merge a stray into a standard one, with Undo; remembered shop choices follow
  await T.nav("settings/cats"); await p.waitForTimeout(500);
  const ct = await T.text("#catTidy");
  check(/Groceries run.*2 entries.*your own/.test(ct) && /Food & groceries/.test(ct), "Categories lists yours with counts", ct);
  await p.selectOption('#catTidy select[data-ct-into="Groceries run"]', "Food & groceries"); await p.click('#catTidy [data-ct-go="Groceries run"]'); await p.waitForTimeout(600);
  let es = await mine();
  check(!es.some(e => e.category === "Groceries run") && es.filter(e => e.note === "Corner shop").every(e => e.category === "Food & groceries"), "merge moves the entries");
  check(((await T.db())[H].settings.catRules.expense || {})["corner shop"] === "Food & groceries", "and the remembered shop choice follows");
  check(!/Groceries run/.test(await T.text("#catTidy")), "the stray is gone from the list");
  await p.click("#toast .toast-act"); await p.waitForTimeout(600);
  check((await mine()).filter(e => e.note === "Corner shop").every(e => e.category === "Groceries run"), "Undo puts them back");

  // Loans: delete a repayment, delete a loan (and its entries) with Undo
  await T.nav("loans"); await p.waitForTimeout(400);
  await p.click(".loan-hist summary"); await p.click('[data-rpdel="lr"]'); await p.waitForTimeout(500);
  check(!(await mine()).some(e => e.id === "lr") && /2,000\.00 left/.test(await T.text("#loanList")), "deleting a repayment puts the amount back on the loan", await T.text("#loanList"));
  await p.click("#toast .toast-act"); await p.waitForTimeout(500);
  check((await mine()).some(e => e.id === "lr"), "Undo brings the repayment back");
  await p.click('[data-ldel="L1"]'); await p.waitForTimeout(500);
  let db = await T.db();
  check(!db[H + "/loans/L1"] && !Object.keys(db).some(k => /entries\/(ls|lr)$/.test(k)) && /No open loans/.test(await T.text("#loanList")), "deleting a loan removes it with its entries");
  await p.click("#toast .toast-act"); await p.waitForTimeout(600);
  db = await T.db();
  check(db[H + "/loans/L1"] && db[H + "/entries/ls"] && db[H + "/entries/lr"], "Undo brings the loan and its entries back");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
