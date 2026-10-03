// g14 (v35): moves between your own accounts are kept (once, across two statements) and can be counted as savings;
// one category change applies everywhere (change all + remembered); Find & replace; chat reports (chart, table, CSV);
// money sent to you shows as a full card only in your own space. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", U2 = "uid_suexcom", H = "households/P1", G = "households/G1";
const seed = {
  ["access/" + U]: { ok: true, admin: false, how: "invite" }, ["access/" + U2]: { ok: true, admin: false, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: ["G1"], name: "Tom", email: "tom@x.com" },
  ["users/" + U2]: { personal: "P2", spaces: ["G1"], name: "Sue", email: "sue@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom", bank: "THMS.A.HASSAN", accounts: [{ bank: "BML", name: "", last4: "4821" }, { bank: "MIB", name: "Savings", last4: "7302" }] }] } },
  ["households/P2"]: { type: "personal", owner: U2, members: [U2], settings: { currency: "MVR", people: [{ id: U2, name: "Sue" }] } },
  [G]: { type: "group", owner: U2, members: [U2, U], names: { [U]: "Tom", [U2]: "Sue" }, name: "Home", settings: { currency: "MVR" } },
  [G + "/transfers/t1"]: { from: U2, fromName: "Sue", to: U, toName: "Tom", amount: 500, date: "2026-08-05", note: "Fees", created: 5, author: U2 },
  // a shop the bank names oddly, earlier sorted wrongly as Eating out
  [H + "/entries/v0"]: { type: "expense", amount: 80, date: "2026-07-20", category: "Eating out", note: "Coral Home Pvt Ltd", person: U, author: U, created: 1 },
  [H + "/entries/s1"]: { type: "expense", amount: 40, date: "2026-08-01", category: "Other", note: "Stop 2 Shop", person: U, author: U, created: 2 },
  [H + "/entries/s2"]: { type: "expense", amount: 55, date: "2026-07-03", category: "Other", note: "Stop 2 Shop Hithadhoo", person: U, author: U, created: 3 }
};
const q = v => '"' + v + '"', ref = v => '"=""' + v + '"""';
const L = (d, type, r, desc, amt, bal) => [q(d + " 00:00:00"), q(d + " 00:00:00"), q(type), r, q(desc), amt, bal].join(",");
const mib = ['"POSTED DATE","VALUE DATE","TRANSACTION TYPE",REFERENCE,DESCRIPTION,AMOUNT,"RUNNING BALANCE"',
  L("2026-08-02", "Favara Transfer Web", "1-900001", "02-08-2026 11-00-00 | MADVIPS20260802110000 aaaa | BML - THOMAS ALI HASSAN, -", "-3000", "1000"), // own: MIB → BML
  L("2026-08-04", "POS Payment", "1-900002", "04-08-2026 18-00-00 | CORAL HOME PVT LTD@RTL | VISA", "-250", "750"),
  L("2026-08-06", "POS Payment", "1-900003", "06-08-2026 18-00-00 | CORAL HOME PVT LTD@RTL | VISA", "-120", "630")
].join("\n") + "\n";
const row = (post, type, r1, ft, info, name, place, debit, credit, bal) => [q(post), q(post), q(type), ref(r1), ref(ft), q(info), ref(name), q(place), q(debit), q(credit), q(bal)].join(",");
const bml = [
  // the same 3000 arriving in BML a day later, named the long way on this side
  row("2026/08/03", "Transfer Credit", "BLAZ900000000001", "FT1\\B26", "03-08-2026 10-00-00", "THOMAS ALI HASSAN", "Internet Banking", "", "3000", "3000"),
  row("2026/08/07", "Purchase", "RB00000000000X01", "FT2\\B26", "07-08-2026 111111", "STOP 2 SHOP HITHADHOO", "HITHADHOO MV MV 260807", "70", "", "2930")
].join("\n") + "\n";

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12", "sue@x.com": "secret12" } }), { p, check } = T;
  console.log("g14: moves, change all, find & replace, chat reports, transfers in Me");
  const mine = async () => { const d = await T.db(); return Object.keys(d).filter(k => k.startsWith(H + "/entries/")).map(k => Object.assign({ id: k.split("/").pop() }, d[k])); };
  await T.login("tom@x.com", "#entries");
  // money sent to you: a full card in your own space
  check(await p.isVisible(".xfer-card [data-xok]"), "in Me, the transfer card can be accepted");

  // 1. MIB statement: the move to BML is kept as Moved, not counted
  await p.setInputFiles("#stmtFile", { name: "90200000000007302-08-2026.csv", mimeType: "text/csv", buffer: Buffer.from(mib) });
  await p.waitForTimeout(2000);
  check(/1 moved between your own accounts/.test(await T.text("#scanList")), "MIB: one move kept", await T.text("#scanList"));
  let mv = (await mine()).filter(e => e.type === "move");
  check(mv.length === 1 && mv[0].note === "Savings (MIB) → BML" && mv[0].legs.length === 1, "move saved as Savings (MIB) → BML", mv);
  check((await mine()).filter(e => /Coral Home/.test(e.note) && e.importId).every(e => e.category === "Eating out"), "Coral Home guessed wrongly from the old entry (the problem we fix next)");
  await p.click('#scanList [data-imp="see"]'); await p.waitForTimeout(500);
  check(!/3,000/.test(await T.text("#ledgerTotal")), "the move isn't counted as spent", await T.text("#ledgerTotal"));
  check((await T.rows()).some(r => /Moved between your accounts/.test(r)), "shown as Moved between your accounts in the list");

  // 2. BML statement: the other side of the same move joins it instead of adding a second one
  await p.setInputFiles("#stmtFile", { name: "bml-aug.csv", mimeType: "text/csv", buffer: Buffer.from(bml) });
  await p.waitForTimeout(2000);
  check(/1 matched to the other statement/.test(await T.text("#scanList")), "BML: matched to the MIB side", await T.text("#scanList"));
  mv = (await mine()).filter(e => e.moved);
  check(mv.length === 1 && mv[0].legs.length === 2 && mv[0].refs.length === 2, "still one move, both sides known", mv);
  await p.click('#scanList [data-imp="see"]'); await p.waitForTimeout(300);
  await p.setInputFiles("#stmtFile", { name: "bml-aug-again.csv", mimeType: "text/csv", buffer: Buffer.from(bml) });
  await p.waitForTimeout(1800);
  check((await p.textContent("#scanTitle")) === "Nothing new to add", "re-importing BML adds nothing (the move's second reference is known)", await T.text("#scanList"));
  await p.click('#scanList [data-imp="close"]');

  // 3. the move can be counted as savings, and keeps where it came from
  await p.evaluate(id => document.querySelector('[data-edit="' + id + '"]').click(), mv[0].id); await p.waitForTimeout(300);
  check(await p.isVisible("#moveRow") && /Savings \(MIB\) → BML/.test(await p.textContent("#moveText")) && /MIB statement/.test(await p.textContent("#srcHint")), "editing a move explains it and where it came from", await p.textContent("#moveText"));
  await p.click("#moveToggle"); await p.click("#submitBtn"); await p.waitForTimeout(400);
  let m = (await mine()).find(e => e.id === mv[0].id);
  check(m.type === "save" && m.moved && m.importId && m.legs.length === 2, "now Save, still marked as a move from the import", m);

  // 4. change one Coral Home entry: remembered, and the others change too with one tap
  const vey = (await mine()).filter(e => /Coral Home/i.test(e.note));
  const one = vey.find(e => e.importId);
  await p.evaluate(id => document.querySelector('[data-edit="' + id + '"]').click(), one.id); await p.waitForTimeout(300);
  await p.selectOption("#fCatSel", "Shopping"); await p.click("#submitBtn"); await p.waitForTimeout(300);
  check(/Also change 2 other Coral Home Pvt Ltd entries to Shopping/i.test(await p.textContent("#toast")), "offers to change the other two", await p.textContent("#toast"));
  await p.click("#toast .toast-act"); await p.waitForTimeout(400);
  const after = (await mine()).filter(e => /Coral Home/i.test(e.note));
  check(after.length === 3 && after.every(e => e.category === "Shopping"), "all Coral Home entries are Shopping", after.map(e => e.category));
  check(after.find(e => e.id === one.id).importId === one.importId, "an edited entry keeps its import (so Undo still finds it)");
  check(((await T.db())[H].settings.catRules || {}).expense["coral home pvt ltd"] === "Shopping", "remembered for next time", (await T.db())[H].settings.catRules);

  // 5. Find & replace
  await p.click("#frBtn"); await p.waitForTimeout(200);
  await p.fill("#frQ", "stop 2"); await p.waitForTimeout(300);
  check(/3 found/.test(await T.text("#frFound")), "finds the three Stop 2 Shop entries in all months", await T.text("#frFound"));
  await p.selectOption("#frCat", "Food & groceries"); await p.waitForTimeout(100);
  check(/Change 2 to Food & groceries/.test(await p.textContent("#frGo")), "button counts only the ones that change (the imported one is already right)", await p.textContent("#frGo"));
  await p.click("#frGo"); await p.waitForTimeout(400);
  check((await mine()).filter(e => /Stop 2/i.test(e.note)).every(e => e.category === "Food & groceries") && !(await T.visible("#frWrap")), "all changed, sheet closed");
  check((await T.db())[H].settings.catRules.expense["stop 2"] === "Food & groceries", "rule saved for what you typed", (await T.db())[H].settings.catRules);
  // a fresh entry for that shop picks the rule
  await p.click('#formPanel .seg button[data-t="expense"]'); await p.fill("#fNote", "Stop 2 Shop Feydhoo"); await p.waitForTimeout(150);
  check((await p.inputValue("#fCat")) === "Food & groceries", "new entries for the shop get the remembered category", await p.inputValue("#fCat"));
  await p.fill("#fNote", "");

  // 6. chat reports: chart, table and CSV, numbers from the app
  await p.evaluate(() => { window.__mockPlan = { heard: null, calls: [{ tool: "report", args: { title: "Spending by category", groupBy: "category", chart: "pie", from: "2026-07-01", to: "2026-08-31" } }], reply: null, suggestions: [] }; });
  await p.click("#chatFab"); await p.fill("#chatInput", "pie chart of my spending by category"); await p.click("#chatSend"); await p.waitForTimeout(1200);
  check(await p.isVisible(".rep .rep-pie svg"), "a pie chart in the reply");
  const tbl = await p.$$eval(".rep tbody tr", r => r.map(x => x.innerText.replace(/\s+/g, " ")));
  check(tbl.length >= 2 && tbl.some(r => /Shopping/.test(r) && /450/.test(r)) && !tbl.some(r => /Moved|3,000/.test(r)), "table: Shopping 450 (80+250+120), moves left out", tbl);
  const [dl] = await Promise.all([p.waitForEvent("download"), p.click(".rep [data-repcsv]")]);
  const csv = fs.readFileSync(await dl.path(), "utf8");
  check(/^﻿?Category,Amount,Entries,Share/.test(csv) && /Shopping,450,3/.test(csv), "Download CSV has the rows", csv.slice(0, 200));
  await p.evaluate(() => { window.__mockPlan = { heard: null, calls: [{ tool: "report", args: { groupBy: "month", chart: "pie", type: "expense" } }], reply: null, suggestions: [] }; });
  await p.fill("#chatInput", "spending per month"); await p.click("#chatSend"); await p.waitForTimeout(1200);
  check((await p.$$(".rep")).length === 2 && await p.isVisible(".rep:last-of-type .rep-bar"), "over time is drawn as bars, even if a pie was asked for");
  await p.click("#chatClose");

  // 7. undoing the MIB import removes its move too (even after it was counted as savings)
  await T.nav("settings/data"); await p.waitForTimeout(400);
  await p.click("#importList .priv-row:last-child button[data-undoimp]"); await p.click("#importList .priv-row:last-child button[data-undoimp]"); await p.waitForTimeout(800);
  check(!(await mine()).some(e => e.moved) && !(await mine()).some(e => /Coral Home/.test(e.note) && e.importId), "MIB import undone: its move and entries gone", (await mine()).map(e => e.note));

  // 8. in the shared group, money sent to you isn't accepted there: it points to your own space
  await p.evaluate(() => localStorage.setItem("pl-space-uid_tomxcom", "G1")); await T.login("tom@x.com", "#home"); await p.waitForTimeout(600);
  check(await p.isVisible(".xfer-mini [data-xme]") && !(await p.$(".xfer-card [data-xok]")) && /Sue sent you MVR\s?500\.00/.test(await T.text("#xferBar")), "group shows a short note with Open Me, no Accept", await T.text("#xferBar"));
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
const fs = require("fs");
