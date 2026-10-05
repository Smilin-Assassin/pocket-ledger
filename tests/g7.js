// g7: delete + Recently deleted, backup file and reminder, chat (prepared change, Edit first, quick facts), shortcuts.
const { start, loadState, URL0 } = require("./lib");
const fs = require("fs");

(async () => {
  const T = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" } }), { p, check } = T;
  console.log("g7: deleting, backups, chat");
  await T.login("adam@x.com", "#entries");
  let rows = await T.rows();
  check(rows.length === 2, "two entries in Me", rows);
  // delete (tap a row on touch, or use the buttons)
  // deleting is instant, with Undo in the toast
  await p.click('#ledger li.tx:has-text("Adam lunch") button[data-del]'); await p.waitForTimeout(500);
  rows = await T.rows();
  check(rows.length === 1 && !rows.some(r => /lunch/.test(r)), "lunch deleted at once", rows);
  check(await T.visible("#toast .toast-act"), "toast has Undo");
  await p.click("#toast .toast-act"); await p.waitForTimeout(500);
  rows = await T.rows();
  check(rows.length === 2 && rows.some(r => /lunch/.test(r)), "Undo brings it back", rows);
  await T.nav("settings/trash"); await p.waitForTimeout(600);
  check(/Nothing deleted/.test(await T.text("#trashList")), "Undo also clears it from Recently deleted", await T.text("#trashList"));
  await T.nav("entries");
  await p.click('#ledger li.tx:has-text("Adam lunch") button[data-del]'); await p.waitForTimeout(500);
  rows = await T.rows();
  check(rows.length === 1, "deleted again", rows);
  await T.nav("settings/trash"); await p.waitForTimeout(700);
  check(/Adam lunch/.test(await T.text("#trashList")), "it's in Recently deleted", await T.text("#trashList"));
  await p.click("#trashList button[data-untrash]"); await p.waitForTimeout(700);
  check(/Nothing deleted/.test(await T.text("#trashList")), "restored, trash empty", await T.text("#trashList"));
  await T.nav("entries");
  check((await T.rows()).length === 2, "lunch is back");
  // backup file (downloads in a desktop browser)
  await T.nav("settings/data"); await p.waitForTimeout(300);
  const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }), p.click("#backupBtn")]);
  const d = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  check(/^pocket-ledger-backup-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()) && d.entries.length === 2 && d.loans.length === 1 && d.groups.length === 1 && d.groups[0].name === "Home", "backup has my space and the group",
    { entries: d.entries.length, loans: d.loans.length, groups: d.groups.map(g => g.name + ":" + g.entries.length) });
  check(/just now/.test(await p.textContent("#backupLast")), "last backup time shown", await p.textContent("#backupLast"));
  // CSV export
  const [csv] = await Promise.all([p.waitForEvent("download", { timeout: 8000 }), p.click("#exportBtn2")]);
  check(/^﻿?Date,Person,Type/.test(fs.readFileSync(await csv.path(), "utf8")), "CSV export");
  // more entries, then the reminder
  await T.nav("entries");
  for (const a of [11, 12, 13]) await T.addEntry("expense", a, 1);
  await p.evaluate(() => localStorage.setItem("pl-lastbackup", String(Date.now() - 20 * 864e5)));
  await T.login("adam@x.com");
  check(await T.visible("#backupNag") && /20 days/.test(await p.textContent("#backupNag")), "backup reminder after 14 days", await p.textContent("#backupNag"));
  await p.click("#backupNag [data-bk=later]");
  check(!(await T.visible("#backupNag")), "Later hides it");
  // chat: a prepared change, no second Gemini call
  await p.evaluate(() => { window.__mockPlan = { heard: null, calls: [{ tool: "add_loan", args: { direction: "lent", counterparty: "Zara", amount: 10000, person: "me" } }], reply: "Got it, a 10,000 loan to Zara. Tap Confirm to save it.", suggestions: [] }; window.__calls = []; window.__prompts = []; });
  await p.click("#chatFab"); await p.waitForTimeout(300);
  await p.fill("#chatInput", "lent zara 10k"); await p.keyboard.press("Enter"); await p.waitForTimeout(1200);
  check((await p.evaluate(() => window.__calls.filter(c => c === "gemini").length)) === 1, "one Gemini call for a change");
  const last = (await p.$$eval("#chatMsgs .msg", m => m.map(x => x.innerText.replace(/\n+/g, " / ")))).slice(-1)[0];
  check(/Loan to Zara/.test(last) && /Confirm/.test(last), "confirm card", last);
  const pr = await p.evaluate(() => window.__prompts[0]);
  check(/Quick facts \(already worked out, exact\): \{"this_month"/.test(pr), "quick facts in the prompt");
  await p.click("#chatMsgs button[data-ok]"); await p.waitForTimeout(500);
  await p.click("#chatClose");
  await T.nav("loans");
  check(/Lent to Zara/.test(await T.text("#loanList")), "loan saved from chat", await T.text("#loanList"));
  // chat: entries → Edit first opens the check sheet
  await p.evaluate(() => { window.__mockPlan = { heard: null, calls: [{ tool: "propose_entries", args: { entries: [{ type: "expense", amount: 85, category: "Eating out", note: "Coffee" }] } }], reply: "Here it is.", suggestions: [] }; });
  await p.click("#chatFab"); await p.fill("#chatInput", "coffee 85"); await p.keyboard.press("Enter"); await p.waitForTimeout(1000);
  await p.click("#chatMsgs button[data-editact]"); await p.waitForTimeout(300);
  check(await T.visible("#scanPanel") && (await p.textContent("#scanTitle")) === "Check before adding", "Edit first opens the check sheet");
  await p.fill("#sa0", "90"); await p.click("#scanAdd"); await p.waitForTimeout(500);
  await T.nav("entries");
  check((await T.rows()).some(r => /Eating out ~ Coffee/.test(r)) && /90\.00/.test(await T.text("#ledger")), "edited entry added", await T.rows());
  // shortcut from the home screen icon
  await p.goto("about:blank"); await p.goto(URL0 + "?action=scan"); await p.waitForTimeout(1500);
  check(await T.visible("#quick") && /Scan file/.test(await p.textContent("#quickTitle")), "scan shortcut asks first");
  await p.click("#quickX");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
