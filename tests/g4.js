// g4: a brand-new person (invite link): every page — entries, loans, bills, goals, budgets, settings, a new group.
const { start, URL0 } = require("./lib");

(async () => {
  const T = await start({ seed: { "invites/TESTCODE1": { by: "x", expires: Date.now() + 1e8, max: 1, used: [] } }, users: {} }), { p, check } = T;
  console.log("g4: new person, all pages");
  await p.goto(URL0 + "?invite=TESTCODE1"); await p.waitForTimeout(500);
  await p.fill("#gEmail", "new@y.com"); await p.fill("#gPass", "secret12"); await p.click("#gCreateBtn"); await p.waitForTimeout(800);
  check((await T.gate()) === "gSetup", "invite accepted, set-up shown", await T.gate());
  await p.fill("#gMyName", "Adam"); await p.click("#gContinue"); await p.waitForTimeout(1600);
  check(await p.isHidden("#spaceBar") && await p.isHidden("#who"), "only one space: no space bar, no person switch");
  check(await T.visible("#dock [data-p=entries]") && !(await T.visible("#adminNav")) && (await p.$$eval("#dock .dk-tab", t => t.length)) === 4, "dock shown with 4 tabs, no admin", await p.$$eval("#dock .dk-tab", t => t.map(x => x.dataset.p)));

  // entries
  await T.nav("entries");
  await T.addEntry("income", 6000);
  await T.addEntry("expense", 120, 1);
  check(await p.isHidden("#splitRow"), "no 'split' option in your own space");
  let rows = await T.rows();
  check(rows.length === 2, "two entries", rows);
  // edit the expense
  await p.click('#ledger button[data-edit] >> nth=0'); await p.waitForTimeout(200);
  check((await p.textContent("#formTitle")) === "Edit entry", "edit mode", await p.textContent("#formTitle"));
  await p.fill("#fAmount", "150"); await p.click("#submitBtn"); await p.waitForTimeout(300);
  rows = await T.rows();
  check(rows.some(r => /Food & groceries/.test(r)), "category from the dropdown kept", rows);
  check(/150\.00/.test(await T.text("#ledger")), "amount updated", await T.text("#ledger"));
  // search
  await p.fill("#searchQ", "food"); await p.waitForTimeout(400);
  check(/1 entry/i.test(await T.text("#ledgerTotal")) && (await T.rows()).length === 1, "search finds it, with its total", await T.text("#ledgerTotal"));
  await p.fill("#searchQ", ""); await p.waitForTimeout(400);

  // home
  await T.nav("home");
  check((await p.textContent("#heroLabel")) === "Left to spend this month", "hero label");
  check(/MVR\s?5,850\.00/.test(await p.textContent("#leftBig")), "left to spend = 6000 - 150", await p.textContent("#leftBig"));
  check((await T.rows("#recentList")).length === 2, "latest entries on Home");
  // budgets
  await p.click("#budgetBtn"); await p.fill("#budgetList input[data-cat='Food & groceries']", "180"); await p.click("#budSave"); await p.waitForTimeout(400);
  check(/Food & groceries.*150 of MVR\s?180/.test(await T.text("#budgetList")), "budget shows spent of limit", await T.text("#budgetList"));
  check(/1 close/.test(await T.text("#tiles")), "budget tile warns at 80%", await T.text("#tiles"));

  // loans
  await T.nav("loans");
  await p.fill("#lnAmt", "1000"); await p.fill("#lnName", "Ali"); await p.click("#saveLoan"); await p.waitForTimeout(400);
  check(/Lent to Ali.*1,000\.00 left/.test(await T.text("#loanList")), "loan saved", await T.text("#loanList"));
  await p.click("#loanList button[data-repay]"); await p.fill("#repayAmt", "400"); await p.click("#loanList button[data-repay-ok]"); await p.waitForTimeout(400);
  check(/600\.00 left/.test(await T.text("#loanList")) && /1 repayment/.test(await T.text("#loanList")), "part repayment", await T.text("#loanList"));
  check(/Owed to you.*600\.00/i.test(await T.text("#loanSum")), "loan summary", await T.text("#loanSum"));
  await T.nav("home");
  check(/MVR\s?5,850\.00/.test(await p.textContent("#leftBig")), "loan kept out of left to spend", await p.textContent("#leftBig"));

  // bills
  await T.nav("bills");
  const day = new Date().getDate();
  await p.fill("#brName", "Electricity"); await p.fill("#brAmt", "300"); await p.fill("#brDay", String(day)); await p.click("#saveBill"); await p.waitForTimeout(400);
  check(/Electricity/.test(await T.text("#recList")), "bill saved", await T.text("#recList"));
  check(/due today/.test(await T.text("#billsDue")), "due today shows", await T.text("#billsDue"));
  check(await T.visible("#dock [data-badge=bills]") && (await p.textContent("#dock [data-badge=bills]")) === "1", "bills tab on the dock has a badge");
  await p.click("#recList [data-rdel]"); await p.waitForTimeout(500);
  check(!/Electricity/.test(await T.text("#recList")), "reminder deleted at once", await T.text("#recList"));
  await p.click("#toast .toast-act"); await p.waitForTimeout(600);
  check(/Electricity/.test(await T.text("#recList")), "Undo brings the reminder back", await T.text("#recList"));
  await p.click("#billsDue button[data-bill]"); await p.click("#billsDue button[data-billok]"); await p.waitForTimeout(400);
  check(await p.isHidden("#billsDue"), "paid bill leaves the due list");
  check(/done for/.test(await T.text("#recList")), "bill marked done for this month", await T.text("#recList"));
  await T.nav("entries");
  check((await T.rows()).some(r => /Electricity/.test(r) && /Bill/i.test(r)), "paying added an entry tagged Bill", await T.rows());

  // goals
  await T.nav("goals");
  await p.fill("#gName", "New phone"); await p.fill("#gTarget", "5000"); await p.click("#saveGoal"); await p.waitForTimeout(400);
  check(/New phone/.test(await T.text("#goals")), "goal created", await T.text("#goals"));
  await p.click("#goals button[data-gadd]"); await p.waitForTimeout(500);
  check((await p.evaluate(() => location.hash)) === "#entries" && (await p.inputValue("#fGoal")) !== "", "Add money opens the form with the goal picked", await p.inputValue("#fGoal"));
  await p.fill("#fAmount", "500"); await p.click("#submitBtn"); await p.waitForTimeout(400);
  await T.nav("goals");
  check(/10%/.test(await T.text("#goals")), "goal at 10%", await T.text("#goals"));

  // settings
  await T.nav("settings"); await p.waitForTimeout(400);
  await p.fill("#setName1", "Adam A"); await p.fill("#acctList [data-ak=last4]", "4821"); await p.fill("#setOpen1", "2500"); await p.click("#saveSettings"); await p.waitForTimeout(500);
  let d = await T.db();
  const u = d["users/uid_newycom"], st = d["households/" + u.personal].settings;
  check(st.people[0].name === "Adam A" && st.people[0].acct === "4821" && st.openingBy.uid_newycom === 2500, "details saved (last 4 digits only)", st);
  check(/secure server/.test(await p.textContent("#srvState")) && /this device|Blocked/.test(await p.textContent("#ntState")), "Gemini and notification sections", [await p.textContent("#srvState"), await p.textContent("#ntState")]);
  await p.click("#set-look [data-mode=dark]"); await p.waitForTimeout(100);
  check((await p.evaluate(() => document.documentElement.dataset.theme)) === "dark", "dark mode applies");
  // new group
  await p.evaluate(() => document.getElementById("grpNewBox").open = true);
  await p.fill("#grpNewName", "Bali trip"); await p.click("#grpCreate"); await p.waitForTimeout(1800);
  check((await T.bar()).join("|") === "Me|*Bali trip", "new group opened", await T.bar());
  check(/Bali trip · left to spend/.test(await p.textContent("#heroLabel")) || /left to spend/i.test(await p.textContent("#heroLabel")), "hero in group", await p.textContent("#heroLabel"));
  await T.nav("entries");
  await T.addEntry("expense", 900, 2);
  check((await T.rows()).length === 1, "group expense added", await T.rows());
  await T.nav("settings"); await p.waitForTimeout(700);
  check(/Bali trip.*you made this group.*open until/i.test(await T.text("#grpList")), "group listed with invitations open", await T.text("#grpList"));
  // wide screen: side menu
  await p.setViewportSize({ width: 1280, height: 900 }); await T.nav("home"); await p.waitForTimeout(300);
  const nav = await p.evaluate(() => { const r = document.getElementById("nav").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
  check(nav.w === 232 && nav.h === 900, "side menu on wide screens", nav);
  await p.screenshot({ path: require("os").tmpdir() + "/pl_wide.png" });
  await p.setViewportSize({ width: 412, height: 900 }); await p.waitForTimeout(200);
  const nav2 = await p.evaluate(() => { const r = document.getElementById("dock").getBoundingClientRect(); return { top: Math.round(r.top), w: Math.round(r.width), bottom: Math.round(r.bottom) }; });
  check(nav2.w === 316 && nav2.top > 800 && nav2.bottom <= 890, "floating bar at the bottom on phones, with the + beside it", nav2);
  await p.screenshot({ path: require("os").tmpdir() + "/pl_phone.png" });
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
