// g11: importing an MIB (Maldives Islamic Bank) CSV export, made-up data. Read exactly, no Gemini.
// Checks own-account moves (full name and initials, other MIB account, Favara to/from own BML),
// repeated payments kept, duplicates cross-checked (reference, amount, date, name) and re-import.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const seed = {
  ["access/" + U]: { ok: true, admin: false, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom", bank: "THMS.A.HASSAN", accounts: [{ bank: "BML", name: "", last4: "4821" }, { bank: "MIB", name: "Savings", last4: "7302" }] }] } },
  // logged by hand: the pharmacy (same amount, a day earlier, same name) → already there
  [H + "/entries/m1"]: { type: "expense", amount: 59, date: "2026-08-09", category: "Health", note: "Heart Land pharmacy", person: U, author: U, created: 1 },
  // the same amount as one of the 30s, but it came from another statement with its own reference → not the same
  [H + "/entries/m2"]: { type: "expense", amount: 30, date: "2026-09-12", category: "Other", note: "Transfer to Zaid", person: U, author: U, created: 2, ref: "BLAZ999999999999", source: "statement" }
};
const q = v => '"' + v + '"';
const L = (d, type, ref, desc, amt, bal) => [q(d + " 00:00:00"), q(d + " 00:00:00"), q(type), ref, q(desc), amt, bal].join(",");
const csv = ['"POSTED DATE","VALUE DATE","TRANSACTION TYPE",REFERENCE,DESCRIPTION,AMOUNT,"RUNNING BALANCE"',
  L("2026-08-01", "**B/F Balance", "", "", "200", "200"),
  L("2026-08-02", "Internet banking transfer", "2-100001", "02-08-2026 10-00-00 | Thomas Ali Hassan | Monthly - Aug", "4000", "4200"),          // own (full name vs initials)
  L("2026-08-02", "Favara Transfer Web", "1-200001", "02-08-2026 11-00-00 | MADVIPS20260802110000 aaaa | BML - THMS.A.HASSAN, -", "-3000", "1200"), // own BML
  L("2026-08-03", "Favara Credit", "1-200002", "03-08-2026 09-00-00 | MALBIPS20260803090000 BBBB | BML - THOMAS ALI HASSAN, Deposit ref.1@IPS", "1050", "2250"), // own
  L("2026-08-03", "Favara Credit", "1-200003", "03-08-2026 09-01-00 | MALBIPS20260803090100 CCCC | BML - THOMAS ALI HASSAN, Deposit ref.2@IPS", "1050", "3300"), // own, repeated
  L("2026-08-04", "Internet banking transfer", "2-100002", "04-08-2026 12-00-00 | Laila Hassan | Lunch money", "-1200", "2100"),
  L("2026-08-05", "Favara Transfer Web", "1-200004", "05-08-2026 13-00-00 | MADVIPS20260805130000 dddd | BML - LAILA.HASSAN, -", "-500", "1600"),
  L("2026-08-06", "POS Payment", "1-300001", "06-08-2026 18-00-00 |         -330531@RTL | VISA", "-45", "1555"),
  L("2026-08-07", "ATM Card Annual Fee", "2-400001", "07-08-2026 04-30-49", "-100", "1455"),
  L("2026-08-10", "Internet banking transfer", "2-100003", "10-08-2026 08-16-31 | HEART LAND PHARMACY | -", "-59", "1396"),          // already there (m1)
  L("2026-08-10", "FaisaPay", "1-500001", "10-08-2026 09-34-07 | State Electric Company Limited  |  Ref. 1010781@5", "-299.47", "1096.53"),
  L("2026-06-30", "Profit Distribution90200000000007302", "2-380", "05-07-2026 04-07-19", "3.88", "1100.41"),
  L("2026-09-12", "Internet banking transfer", "2-100004", "12-09-2026 16-34-26 | Zaid Moosa", "-30", "1070.41"),     // two identical 30s, same day: both new
  L("2026-09-12", "Internet banking transfer", "2-100005", "12-09-2026 17-09-33 | Zaid Moosa", "-30", "1040.41"),
  L("2026-09-12", "Internet banking transfer", "2-100005", "12-09-2026 17-09-33 | Zaid Moosa", "-30", "1040.41")      // the same line twice in the file
].join("\n") + "\n";

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g11: MIB statement import");
  await T.login("tom@x.com", "#entries");
  await p.setInputFiles("#stmtFile", { name: "90200000000007302-01-08-2026-30-09-2026.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForTimeout(2000);
  check((await p.textContent("#scanTitle")) === "Statement imported", "imported", await p.textContent("#scanTitle"));
  const sum = await T.text("#scanList");
  check(/Skipped 2 already in Pocket Ledger\. 4 moved between your own accounts/.test(sum), "2 duplicates (pharmacy, same line twice), 4 own moves", sum);
  const d = await T.db(), all = Object.keys(d).filter(k => k.startsWith(H + "/entries/") && d[k].importId).map(k => d[k]).sort((a, b) => a.date.localeCompare(b.date) || a.created - b.created);
  const added = all.filter(e => e.type !== "move"), moves = all.filter(e => e.type === "move");
  check(moves.length === 4 && moves.filter(m => m.amount === 1050).length === 2, "4 moves kept, the two 1050s both (different references)", moves.map(m => m.note + " " + m.amount));
  check(moves.some(m => m.note === "Savings (MIB) → BML" && m.amount === 3000), "a Favara to your own BML reads Savings (MIB) → BML", moves.map(m => m.note));
  check(added.length === 8, "8 entries added", added.map(e => e.note));
  const by = n => added.find(e => e.note === n) || {};
  check(by("Transfer to Laila Hassan: Lunch money").amount === 1200 && by("Transfer to Laila.hassan").amount === 500, "transfers to someone else are spending, with the remark", added.map(e => e.note));
  check(by("Card Payment").amount === 45 && by("ATM Card Annual Fee").amount === 100 && by("State Electric Company Limited").category === "Rent & bills", "card payment, fee and bill payment", added.map(e => e.note + ":" + e.category));
  check(by("MIB Profit").type === "income" && by("MIB Profit").date === "2026-06-30", "profit is income on its posting date", by("MIB Profit"));
  check(added.filter(e => e.note === "Transfer to Zaid Moosa" && e.amount === 30).length === 2, "two identical 30s on one day are both kept (a different-reference entry doesn't swallow one)");
  check(by("Transfer to Laila Hassan: Lunch money").date === "2026-08-04" && by("Transfer to Laila Hassan: Lunch money").ref === "2-100002", "date from the description, bank reference kept");
  check(/MIB statement/.test(added[0].importLabel || ""), "labelled as an MIB statement", added[0].importLabel);
  // importing the same file again adds nothing
  await p.click('#scanList [data-imp="see"]');
  await p.setInputFiles("#stmtFile", { name: "90200000000007302-again.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForTimeout(1800);
  check((await p.textContent("#scanTitle")) === "Nothing new to add", "re-importing adds nothing", await p.textContent("#scanTitle"));
  // scanning a slip: Gemini is told every saved account ending, and that amounts are never account numbers
  await p.click('#scanList [data-imp="close"]').catch(() => {});
  await p.evaluate(() => { window.__prompts = []; });
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: 300, height: 300 } });
  await p.setInputFiles("#scanFile", { name: "slip.png", mimeType: "image/png", buffer: png }); await p.waitForTimeout(1200);
  const pr = (await p.evaluate(() => window.__prompts || [])).find(t => /photo or screenshot/.test(t)) || "";
  check(/Tom: 4821, 7302/.test(pr) && /NEVER account numbers/.test(pr) && /opposite directions/.test(pr), "slip prompt: all account endings, amounts never count, account and name cross-checked", pr.slice(pr.indexOf("end in"), pr.indexOf("end in") + 120));
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
