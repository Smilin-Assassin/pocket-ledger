// g8: importing a bank statement (BML CSV layout, made-up data): adds everything as Spent/Income,
// skips what's already there and moves between your own accounts, and Undo removes the batch.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const seed = {
  ["access/" + U]: { ok: true, admin: false, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom", bank: "THOMAS ALI HASSAN", acct: "4821", accounts: [{ bank: "BML", name: "Main", last4: "4821" }] }] } },
  [H + "/entries/m1"]: { type: "expense", amount: 66, date: "2026-09-02", category: "Food & groceries", note: "Stop 2 Shop", person: U, author: U, created: 1 },
  [H + "/entries/m2"]: { type: "income", amount: 1000, date: "2026-09-03", category: "Side income", note: "From Ali", person: U, author: U, created: 2, ref: "BLAZ111111111111" },
  [H + "/entries/m3"]: { type: "expense", amount: 50, date: "2026-09-05", category: "Eating out", note: "Food Tales", person: U, author: U, created: 3 }
};
const q = v => '"' + v + '"', ref = v => '"=""' + v + '"""';
const row = (post, type, r1, ft, info, name, place, debit, credit, bal) => [q(post), q(post), q(type), ref(r1), ref(ft), q(info), ref(name), q(place), q(debit), q(credit), q(bal)].join(",");
const csv = [
  row("2026/09/02", "Purchase", "RB0000000000AAA1", "FT1\\B26", "01-09-2026 111111", "STOP 2 SHOP", "HITHADHOO MV MV 260901", "66", "", "934"),
  row("2026/09/03", "Transfer Credit", "BLAZ111111111111", "FT2\\B26", "03-09-2026 10-00-00", "ALI HUSSAIN", "Internet Banking", "", "1000", "1934"),
  row("2026/09/03", "Transfer Debit", "BLAZ222222222222", "FT3\\B26", "03-09-2026 11-00-00", "THOMAS ALI HASSAN", "Internet Banking", "500", "", "1434"),
  ['"2026/09/04"', '"2026/09/04"', '"Favara Credit"', ref("MADVIPS2026090400000000abc"), ref("FT4\\MV1"), q("MIB - Thms. Ali H"), ref("90200000000004821"), q("04-09-2026 12-00-00"), q(""), q("2000"), q("3434")].join(","),
  row("2026/09/06", "Purchase", "RB0000000000AAA2", "FT5\\B26", "05-09-2026 222222", "FOOD TALES", "HITHADHOO MV MV 260905", "65", "", "3369"),
  row("2026/09/08", "Purchase", "RB0000000000AAA3", "FT6\\B26", "07-09-2026 333333", "NETFLIX.COM", "SINGAPORE SG SG 260907", "305.16", "", "3063.84"),
  row("2026/09/09", "Transfer Credit", "BLAZ333333333333", "FT7\\B26", "09-09-2026 20-00-00", "HASSAN NASEEM", "Internet Banking", "", "1,400", "4463.84"),
  row("2026/09/10", "Transfer Debit", "BLAZ444444444444", "FT8\\B26", "10-09-2026 08-00-00", "AHMED SHAHIR", "Internet Banking", "120", "", "4343.84")
].join("\n") + "\n";

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g8: bank statement import");
  await T.login("tom@x.com", "#entries");
  check(await T.visible("[data-statement]"), "import link on the Entries page");
  await p.setInputFiles("#stmtFile", { name: "20260901-20260930.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForTimeout(1800);
  check((await p.textContent("#scanTitle")) === "Statement imported", "imported", await p.textContent("#scanTitle"));
  const sum = await T.text("#scanList");
  check(/Skipped 2 already in Pocket Ledger\. 2 moved between your own accounts, kept as Moved/.test(sum), "skips duplicates (ref, date+amount); own-account moves (name, digits) kept as Moved", sum);
  check(/490\.16/.test(sum) && /1,400\.00/.test(sum), "totals: spent 490.16, income 1,400", sum);
  const d = await T.db(), all = Object.keys(d).filter(k => k.startsWith(H + "/entries/") && d[k].importId).map(k => d[k]), added = all.filter(e => e.type !== "move"), moves = all.filter(e => e.type === "move");
  check(added.length === 4 && moves.length === 2, "4 entries added, plus 2 moves", [added.length, moves.length]);
  check(moves.every(m => m.moved && m.category === "Moved" && m.legs.length === 1 && /→/.test(m.note)), "moves: not counted, one side known, note shows the way", moves);
  const cat = n => (added.find(e => e.note === n) || {}).category;
  check(cat("Netflix.com") === "Entertainment" && cat("Transfer to Ahmed Shahir") === "Other" && cat("From Hassan Naseem") === "Side income", "categories and notes", added.map(e => e.note + ":" + e.category));
  check(added.every(e => e.type === "expense" || e.type === "income") && added.every(e => e.author === U && e.source === "statement"), "only Spent / Income, marked as statement");
  check((added.find(e => /Netflix/.test(e.note)) || {}).date === "2026-09-07", "uses the transaction date, not the posting date");
  // importing the same file again adds nothing
  await p.click('#scanList [data-imp="close"], #scanList [data-imp="see"]');
  await p.setInputFiles("#stmtFile", { name: "again.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForTimeout(1800);
  check((await p.textContent("#scanTitle")) === "Nothing new to add", "re-importing the same statement adds nothing", await p.textContent("#scanTitle"));
  await p.click('#scanList [data-imp="close"]');
  // Settings lists the import and can undo it
  await T.nav("settings/data"); await p.waitForTimeout(400);
  check(/BML statement · Sep 2026.*6 entries/.test(await T.text("#importList")), "import listed in Settings", await T.text("#importList"));
  await p.click("#importList button[data-undoimp]"); await p.click("#importList button[data-undoimp]"); await p.waitForTimeout(900);
  const d2 = await T.db();
  check(!Object.keys(d2).some(k => k.startsWith(H + "/entries/") && d2[k].importId) && !!d2[H + "/entries/m1"], "Undo removed exactly the imported entries");
  // accounts editor
  await T.nav("settings/you"); await p.waitForTimeout(300);
  check((await p.$$eval("#acctList .acct-row", r => r.length)) === 1 && (await p.inputValue("#acctList [data-ak=last4]")) === "4821", "accounts list shows the saved account");
  await p.click("#acctAdd"); await p.selectOption("#acctList .acct-row:nth-child(2) select", "MIB");
  await p.fill("#acctList .acct-row:nth-child(2) [data-ak=name]", "Savings"); await p.fill("#acctList .acct-row:nth-child(2) [data-ak=last4]", "7302");
  await p.click("#saveSettings"); await p.waitForTimeout(500);
  const me = (await T.db())[H].settings.people[0];
  check(me.acct === "4821, 7302" && me.accounts.length === 2 && me.accounts[1].bank === "MIB" && me.accounts[1].name === "Savings", "accounts saved (last 4 only)", me);
  // PDF: read by Gemini (the test server answers with fixed rows)
  await p.evaluate(() => { window.__parts = []; window.__mockStatement = { bank: "BML", holder: "THOMAS ALI HASSAN", account_last4: "4821", rows: [
    ["2026-10-01", "out", 99.5, "STOP 2 SHOP", "RB9", "purchase", ""], ["2026-10-02", "out", 300, "THOMAS ALI HASSAN", "BLAZ9", "transfer", ""], ["2026-10-03", "in", 250, "ZARA ADAM", "BLAZ8", "transfer", ""]] }; });
  await T.nav("entries");
  await p.setInputFiles("#stmtFile", { name: "statement.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await p.waitForTimeout(1800);
  check((await p.evaluate(() => window.__parts[0])).includes("application/pdf"), "the PDF itself is sent to Gemini", await p.evaluate(() => window.__parts));
  check(/^(?!.*Skipped).*1 moved between your own accounts/.test(await T.text("#scanList")) && /Oct 2026/.test(await p.textContent("#scanStatus")), "PDF rows imported, own transfer skipped", await T.text("#scanList"));
  await p.click('#scanList [data-imp="see"]'); await p.waitForTimeout(400);
  check((await T.rows()).some(r => /Stop 2 Shop/.test(r)) && (await p.textContent("#monthLabel")) === "October 2026", "See entries opens the statement's month", await p.textContent("#monthLabel"));
  // in a group, statements are refused
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
