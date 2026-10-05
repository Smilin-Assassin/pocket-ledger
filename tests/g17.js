// g17 (v40): meals inside Eating out (Breakfast, Lunch, Dinner, Snacks): the form, Quick add, editing old
// entries, old typed "Breakfast" categories, snack words, Home's breakdown, the list filter, statements, chat. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const now = new Date(), pad = n => String(n).padStart(2, "0");
const K = now.getFullYear() + "-" + pad(now.getMonth() + 1), today = K + "-" + pad(now.getDate()), d1 = K + "-01";
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom", bank: "THOMAS ALI HASSAN" }] } },
  [H + "/entries/old1"]: { type: "expense", amount: 40, date: d1, category: "Breakfast", note: "Hi Tea", person: U, author: U, created: 1 },          // typed as its own category before v40
  [H + "/entries/old2"]: { type: "expense", amount: 120, date: d1, category: "Eating out", note: "Seagull", person: U, author: U, created: 2 },     // no meal yet
  [H + "/entries/old3"]: { type: "expense", amount: 30, date: "2026-01-05", category: "Food & groceries", note: "Gulha pkt", person: U, author: U, created: 3 },
  [H + "/entries/old4"]: { type: "expense", amount: 88, date: "2026-01-06", category: "Eating out", note: "January cafe", person: U, author: U, created: 5 },
  ...Object.fromEntries([1, 2, 3, 4, 5].map(i => [H + "/trash/entries__t" + i, { col: "entries", docId: "t" + i, data: { type: "expense", amount: 10 * i, date: d1, category: "Other", note: "Gone " + i, person: U, author: U }, deletedAt: Date.now() - i * 3600e3, author: U }])),
  [H + "/entries/inc"]: { type: "income", amount: 9000, date: d1, category: "Salary", note: "Pay", person: U, author: U, created: 4 }
};
const mine = async T => { const d = await T.db(); return Object.keys(d).filter(k => k.startsWith(H + "/entries/")).map(k => Object.assign({ id: k.split("/").pop() }, d[k])); };
const pressed = (p, sel) => p.$$eval(sel + " [aria-pressed=true]", b => b.map(x => x.dataset.meal));

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g17: meals inside Eating out");
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(800);

  // 1. old "Breakfast" category folds into Eating out, with the meal; Home shows the breakdown
  const cats = await T.text("#cats");
  check(/Eating out/.test(cats) && !/^Breakfast/m.test(await p.$$eval("#cats .cat .n", n => n.map(x => x.textContent).join("\n"))), "old Breakfast entries count under Eating out on Home", cats);
  check(!(await p.$("#cats .cat-meals")) && !/Breakfast/.test(cats), "Home keeps one plain bar for Eating out (no meal chips)", cats);
  await p.click('#cats [data-cat-go="Eating out"]'); await p.waitForTimeout(700);
  const meals = await p.$$eval("#mealBar button", b => b.map(x => x.innerText.replace(/\s+/g, " ")));
  check(/#entries/.test(p.url()) && meals[0] === "All" && meals.some(m => /Breakfast MVR\s?40/.test(m)) && meals.some(m => /Not set MVR\s?120/.test(m)), "tapping Eating out opens it with meals and their totals", meals);
  check((await T.rows()).length === 2, "All shows both Eating out entries");
  await p.click('#mealBar [data-meal-f="breakfast"]'); await p.waitForTimeout(400);
  let rows = await T.rows();
  check(/#entries/.test(p.url()) && rows.length === 1 && /Eating out ~ Breakfast, Hi Tea/.test(rows[0]) && /Hi Tea/.test(rows[0]), "tapping Breakfast lists just that", rows);
  check(/Eating out, Breakfast/.test(await T.text("#ledgerTotal")), "the total line names the meal", await T.text("#ledgerTotal"));
  const opts = await p.$$eval("#catFilter option", o => o.map(x => x.value));
  check(opts.includes("Eating out|breakfast") && opts.includes("Eating out|none") && !opts.includes("Breakfast"), "the category filter has meals under Eating out", opts);
  await p.selectOption("#catFilter", "Eating out|none"); await p.waitForTimeout(300);
  rows = await T.rows();
  check(rows.length === 1 && /Seagull/.test(rows[0]), "Meal not set shows the one without a meal", rows);
  await p.selectOption("#catFilter", ""); await p.waitForTimeout(200);

  // 2. editing an old entry: pick the meal
  await p.click('#ledger [data-edit="old2"]'); await p.waitForTimeout(500);
  check(await T.visible("#mealRow") && (await pressed(p, "#mealSeg")).length === 0, "editing an Eating out entry shows the meal picker, nothing picked yet");
  await p.click('#mealSeg [data-meal="dinner"]'); await p.click("#submitBtn"); await p.waitForTimeout(600);
  let es = await mine(T);
  check(es.find(e => e.id === "old2").meal === "dinner" && es.find(e => e.id === "old2").category === "Eating out", "saved as Eating out, Dinner", es.find(e => e.id === "old2"));
  // the old typed category is stored properly once edited
  await p.click('#ledger [data-edit="old1"]'); await p.waitForTimeout(500);
  check(JSON.stringify(await pressed(p, "#mealSeg")) === '["breakfast"]', "old Breakfast entry opens with Breakfast picked");
  await p.click("#submitBtn"); await p.waitForTimeout(600);
  es = await mine(T); const o1 = es.find(e => e.id === "old1");
  check(o1.category === "Eating out" && o1.meal === "breakfast", "and is saved as Eating out, Breakfast", o1);

  // 3. new entry with the full form: a guess is pre-picked for today, tap to change, tap again to clear
  await p.fill("#fAmount", "65"); await p.selectOption("#fCatSel", "Eating out"); await p.fill("#fDate", today); await p.dispatchEvent("#fDate", "change"); await p.waitForTimeout(200);
  check(await T.visible("#mealRow") && (await pressed(p, "#mealSeg")).length === 1, "Eating out pre-picks a meal by the clock", await pressed(p, "#mealSeg"));
  await p.click('#mealSeg [data-meal="lunch"]'); await p.fill("#fNote", "Office lunch"); await p.click("#submitBtn"); await p.waitForTimeout(600);
  es = await mine(T);
  check((es.find(e => e.note === "Office lunch") || {}).meal === "lunch", "saved with Lunch", es.find(e => e.note === "Office lunch"));
  await p.fill("#fAmount", "15"); await p.selectOption("#fCatSel", "Eating out"); await p.waitForTimeout(100);
  const pre = (await pressed(p, "#mealSeg"))[0]; if (pre) await p.click(`#mealSeg [data-meal="${pre}"]`);
  await p.fill("#fNote", "Water"); await p.click("#submitBtn"); await p.waitForTimeout(600);
  es = await mine(T);
  check(es.find(e => e.note === "Water") && !es.find(e => e.note === "Water").meal, "tapping the picked meal clears it (meal is optional)", es.find(e => e.note === "Water"));
  await p.selectOption("#fCatSel", "Shopping"); await p.waitForTimeout(100);
  check(!(await T.visible("#mealRow")), "no meal picker for other categories");

  // 4. snack words: Eating out › Snacks, even if the shop was groceries before
  await p.fill("#fAmount", "25"); await p.selectOption("#fCatSel", ""); await p.fill("#fNote", "Gulha pkt");
  await p.waitForTimeout(200);
  check((await p.inputValue("#fCat")) === "Eating out" && JSON.stringify(await pressed(p, "#mealSeg")) === '["snacks"]', "'Gulha pkt' guesses Eating out, Snacks", [await p.inputValue("#fCat"), await pressed(p, "#mealSeg")]);
  await p.click("#submitBtn"); await p.waitForTimeout(600);

  // 5. Quick add
  await p.click("#dkPlus"); await p.waitForTimeout(700);
  for (const k of ["3", "5"]) await p.click(`#qaPad [data-k="${k}"]`);
  await p.click('#qaChips [data-cat="Eating out"]'); await p.waitForTimeout(150);
  check(await T.visible("#qaMeals") && (await pressed(p, "#qaMeals")).length === 1, "Quick add shows meals for Eating out, one pre-picked");
  if ((await pressed(p, "#qaMeals"))[0] !== "snacks") await p.click('#qaMeals [data-meal="snacks"]');
  check(JSON.stringify(await pressed(p, "#qaMeals")) === '["snacks"]', "tapping a meal picks it");
  await p.click("#qaSave"); await p.waitForTimeout(700);
  es = await mine(T); const qa = es.filter(e => e.amount === 35)[0] || {};
  check(qa.category === "Eating out" && qa.meal === "snacks", "Quick add saves the meal", qa);
  check(/Snacks/.test(await T.text("#toast")), "toast names the meal", await T.text("#toast"));
  await p.click("#dkPlus"); await p.waitForTimeout(600);
  await p.click('#qaChips .qa-chip:not([data-cat="Eating out"])'); await p.waitForTimeout(100);
  check(!(await T.visible("#qaMeals")), "no meals for other categories in Quick add");
  await p.keyboard.press("Escape"); await p.waitForTimeout(600);

  // 6. search finds meals by name
  await T.nav("entries"); await p.fill("#searchQ", "dinner"); await p.waitForTimeout(400);
  rows = await T.rows();
  check(rows.length === 1 && /Seagull/.test(rows[0]), "searching 'dinner' finds the dinner", rows);
  // search stays in the month shown at the top; "Search all months" widens it
  await p.fill("#searchQ", "eating out"); await p.waitForTimeout(400);
  rows = await T.rows();
  check(rows.length >= 3 && !rows.some(r => /January cafe/.test(r)) && /in (\w+ \d{4})/.test(await T.text("#ledgerTotal")) && !/all months,/.test(await T.text("#ledgerTotal")), "search 'eating out' shows only the month at the top", [rows.length, await T.text("#ledgerTotal")]);
  await p.click('#ledgerTotal [data-search-all="1"]'); await p.waitForTimeout(300);
  rows = await T.rows();
  check(rows.some(r => /January cafe/.test(r)) && /in all months/.test(await T.text("#ledgerTotal")), "Search all months finds older ones too", rows.length);
  await p.click('#ledgerTotal [data-search-all=""]'); await p.waitForTimeout(300);
  check(!(await T.rows()).some(r => /January cafe/.test(r)), "and back to just this month");
  for (let i = 0; i < 20 && !/January/.test(await p.textContent("#monthLabel")); i++) { await p.click("#prevM"); await p.waitForTimeout(80); }
  await p.waitForTimeout(300); rows = await T.rows();
  check(rows.length === 1 && /January cafe/.test(rows[0]), "changing the month at the top changes what the search shows", rows);
  await p.fill("#searchQ", ""); await p.waitForTimeout(300);
  for (let i = 0; i < 20 && (await p.textContent("#monthLabel")) !== (await p.evaluate(() => new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" }))); i++) { await p.click("#nextM"); await p.waitForTimeout(80); }
  await p.waitForTimeout(300);

  // 7. statement: a cafe at 8 in the morning is breakfast; a cafe without a time has no meal
  const q = v => '"' + v + '"';
  const L = (d, type, ref, desc, amt, bal) => [q(d + " 00:00:00"), q(d + " 00:00:00"), q(type), ref, q(desc), amt, bal].join(",");
  const dm = d1.split("-").reverse().join("-");
  const csv = ['"POSTED DATE","VALUE DATE","TRANSACTION TYPE",REFERENCE,DESCRIPTION,AMOUNT,"RUNNING BALANCE"',
    L(d1, "POS Purchase", "3-900001", dm + " 08-15-00 | SEA BREEZE CAFE | -", "-55", "945"),
    L(d1, "POS Purchase", "3-900002", dm + " 20-40-00 | OCEAN BISTRO | -", "-210", "735")].join("\n") + "\n";
  await p.setInputFiles("#stmtFile", { name: "90200000000001234-mib.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForTimeout(2500);
  es = await mine(T);
  const sb = es.find(e => e.ref === "3-900001") || {}, ob = es.find(e => e.ref === "3-900002") || {};
  check(sb.category === "Eating out" && sb.meal === "breakfast" && ob.meal === "dinner", "statement times give the meal (8:15 breakfast, 20:40 dinner)", [sb, ob]);
  await p.click('#scanList [data-imp="close"], #scanList [data-imp="see"]').catch(() => {});

  // 8. chat: spending by meal
  await p.evaluate(() => { window.__mockPlan = { heard: null, calls: [{ tool: "report", args: { title: "Eating out by meal", category: "Eating out", groupBy: "meal", chart: "pie" } }], reply: null, suggestions: [] }; });
  await p.click("#chatFab"); await p.fill("#chatInput", "eating out by meal"); await p.click("#chatSend"); await p.waitForTimeout(1200);
  const tbl = await p.$$eval(".rep tbody tr", r => r.map(x => x.innerText.replace(/\s+/g, " ")));
  check(tbl.some(r => /^Breakfast .*95/.test(r)) && tbl.some(r => /^Dinner .*330/.test(r)) && tbl.some(r => /^Snacks .*60/.test(r)), "chat report groups Eating out by meal (Breakfast 95, Dinner 330, Snacks 60)", tbl);
  await p.click("#chatClose").catch(() => {});

  // 9. CSV export has a Meal column
  await T.nav("entries");
  const fs = require("fs");
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click("#exportBtn")]);
  const out = fs.readFileSync(await dl.path(), "utf8");
  check(/Category,Meal,Goal/.test(out) && /Eating out,Lunch,/.test(out), "CSV export has a Meal column", out.slice(0, 160));

  // 10. phone: the meal picker fits, at Extra large text too
  await T.nav("settings/look"); await p.click('#fsSeg [data-fs="xl"]'); await p.setViewportSize({ width: 340, height: 740 });
  await T.nav("entries"); await p.selectOption("#fCatSel", "Eating out"); await p.waitForTimeout(200);
  const fit = await p.evaluate(() => { const s = document.getElementById("mealSeg"), r = s.getBoundingClientRect(); return { over: document.documentElement.scrollWidth - document.documentElement.clientWidth, h: Math.min(...[...s.querySelectorAll("button")].map(b => b.getBoundingClientRect().height)) }; });
  check(fit.over <= 1 && fit.h >= 38, "meal buttons fit a 340px phone at Extra large text, tall enough to tap", fit);
  await T.nav("settings/look"); await p.click('#fsSeg [data-fs="m"]');
  // Recently deleted: the 3 newest, then Show all
  await p.setViewportSize({ width: 412, height: 900 });
  await T.nav("settings/trash"); await p.waitForTimeout(700);
  let tr = await T.text("#trashList");
  check((await p.$$("#trashList [data-untrash]")).length === 3 && /Gone 1/.test(tr) && /Gone 3/.test(tr) && !/Gone 4/.test(tr) && /Show all 5/.test(tr), "Recently deleted shows the 3 newest and Show all 5", tr);
  await p.click('#trashList [data-trashall="1"]'); await p.waitForTimeout(500);
  check((await p.$$("#trashList [data-untrash]")).length === 5 && /Show fewer/.test(await T.text("#trashList")), "Show all lists every one");
  await p.click('#trashList [data-trashall=""]'); await p.waitForTimeout(500);
  check((await p.$$("#trashList [data-untrash]")).length === 3, "Show fewer goes back to 3");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
