// g16 (v37): compare the last 3 months and this year, Needs a look, account balances from statements. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const now = new Date(), K = m => { const d = new Date(now.getFullYear(), now.getMonth() - m, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom", bank: "THOMAS ALI HASSAN", accounts: [{ bank: "BML", name: "Main", last4: "4821" }] }] } }
};
let n = 0; const E = (m, type, amount, category, note, extra) => { seed[H + "/entries/e" + (++n)] = Object.assign({ type, amount, date: K(m) + "-0" + (1 + (n % 8)), category, note, person: U, author: U, created: n }, extra || {}); };
E(2, "income", 9000, "Salary", "Pay"); E(1, "income", 9000, "Salary", "Pay"); E(0, "income", 9500, "Salary", "Pay");
E(2, "expense", 1000, "Eating out", "Cafe"); E(1, "expense", 1000, "Eating out", "Cafe"); E(0, "expense", 1500, "Eating out", "Cafe");
E(0, "expense", 70, "Other", "Mystery shop");                                // needs a look: still under Other
E(0, "expense", 40, "Transport", "Taxi", { maybeDup: "e1" });               // needs a look: possible repeat
E(12, "expense", 800, "Eating out", "Cafe last year", { date: (now.getFullYear() - 1) + "-01-05" });
const q = v => '"' + v + '"', ref = v => '"=""' + v + '"""';
const row = (post, type, r1, ft, info, name, place, debit, credit, bal) => [q(post), q(post), q(type), ref(r1), ref(ft), q(info), ref(name), q(place), q(debit), q(credit), q(bal)].join(",");
const csv = [
  row("2026/09/02", "Purchase", "RB00000000000Q01", "FT1\\B26", "01-09-2026 111111", "SEA BREEZE CAFE", "MALE MV MV 260901", "120", "", "4880.00"),
  row("2026/09/20", "Transfer Credit", "BLAZ900000000099", "FT2\\B26", "20-09-2026 10-00-00", "ZARA ADAM", "Internet Banking", "", "500", "5380.00"),
  row("2026/09/28", "Purchase", "RB00000000000Q02", "FT3\\B26", "27-09-2026 222222", "SEA BREEZE CAFE", "MALE MV MV 260927", "80.50", "", "5299.50")
].join("\n") + "\n";

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g16: compare, needs a look, account balances");
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(900);

  // compare: last 3 months
  const tbl = await p.$$eval("#cmpBox tbody tr", r => r.map(x => x.innerText.replace(/\s+/g, " ").trim()));
  check(tbl.some(r => /^Income .*9,000.*9,000.*9,500/.test(r)) && tbl.some(r => /^Eating out .*1,000.*1,000.*1,500 ?▲ 50%/.test(r)), "last 3 months side by side, with the change", tbl);
  // this year so far against last year
  await p.click('#cmpSeg [data-cmp="yr"]'); await p.waitForTimeout(200);
  const yr = await p.$$eval("#cmpBox tbody tr", r => r.map(x => x.innerText.replace(/\s+/g, " ").trim()));
  check(yr.some(r => /^Eating out .*800/.test(r)) && /January to/.test(await T.text("#cmpBox")), "this year against the same months last year", yr);

  // needs a look: on Home, then the Entries list
  check(/2 things could use a look/.test(await T.text("#smartBar")), "Home says 2 things could use a look", await T.text("#smartBar"));
  await p.click('#smartBar .smart-item:has-text("could use a look") [data-sgo]'); await p.waitForTimeout(600);
  const rows = await T.rows();
  check(/#entries/.test(p.url()) && rows.length === 2 && rows.some(r => /Mystery shop/.test(r)) && rows.some(r => /Possible repeat/.test(r)), "Tidy up opens Needs a look with both", rows);
  await p.click('#ledger [data-keepdup]'); await p.waitForTimeout(400);
  check((await T.rows()).length === 1, "Keep takes the repeat off the list");

  // account balance from a statement
  await p.setInputFiles("#stmtFile", { name: "bml.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForTimeout(1800);
  const bal = ((await T.db())[H].settings.balances || {});
  const b = Object.values(bal)[0] || {};
  check(b.bal === 5299.5 && b.asOf === "2026-09-27" && b.bank === "BML", "the closing balance is kept, from the latest row", bal);
  await p.click('#scanList [data-imp="close"], #scanList [data-imp="see"]'); await T.nav("home"); await p.waitForTimeout(500);
  check(/Your accounts.*BML.*5,299\.50/.test(await T.text("#acctBar")), "Home shows Your accounts", await T.text("#acctBar"));
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
