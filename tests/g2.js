// g2: Lina's migration, group entries, "ask to see" a dashboard, renaming the group, view-only.
const { start, loadState } = require("./lib");
const H = "households/HH1";
const users = { "adam@x.com": "secret12", "lina@x.com": "secret12", "ali@x.com": "secret12" };

(async () => {
  const T = await start({ seed: loadState(""), users }), { p, check } = T;
  console.log("g2: second person, sharing and view-only");
  await T.login("lina@x.com", "#entries");
  let rows = await T.rows();
  check(rows.some(r => /dress/.test(r)) && rows.some(r => /Salary/.test(r)) && rows.length === 2, "Lina's Me has her dress and salary (save to shared goal stays in group)", rows);
  let d = await T.db();
  check(Object.keys(d).filter(k => k.startsWith(H + "/entries/")).sort().join(" ") === H + "/entries/e3 " + H + "/entries/e5", "group keeps only shared things", Object.keys(d).filter(k => k.startsWith(H + "/entries/")));
  await T.space(2);
  rows = await T.rows();
  check(rows.length === 2, "group shows split cost + Bali saving", rows);
  check(rows.some(r => /Shared groceries \[\]/.test(r)) && rows.some(r => /Bali trip.*Edit\/Delete/.test(r)), "Lina can change only what she added", rows);
  await T.addEntry("expense", 250, 1);
  rows = await T.rows();
  check(rows.length === 3, "Lina added a group expense", rows);
  check((await T.denied()).length === 0, "no rule denials so far", await T.denied());
  // settings as Lina
  await T.nav("settings"); await p.waitForTimeout(600);
  const groups = await T.text("#grpList");
  check(/Household/.test(groups) && /Leave group/.test(groups) && !/Rename/.test(groups), "Lina sees the group, can leave, can't rename", groups);
  check((await p.inputValue("#setName1")) === "Lina" && (await p.inputValue("#acctList [data-ak=last4]")) === "1111", "Lina's own name and account digits", [await p.inputValue("#setName1"), await p.inputValue("#acctList [data-ak=last4]")]);
  check(!(await T.visible("#invSec")), "Lina (not admin) doesn't see invites");
  check(/Ask to see/.test(await T.text("#privList")), "Lina can ask to see Adam's dashboard", await T.text("#privList"));
  await p.click("#privList button[data-ask]"); await p.waitForTimeout(500);
  check(/waiting/.test(await T.text("#privList")), "request shows as waiting", await T.text("#privList"));
  // Adam sees and allows the request
  await T.login("adam@x.com");
  check(/Lina.*would like to see/.test(await T.text("#reqBar")), "Adam sees the request banner", await T.text("#reqBar"));
  check(!(await p.$eval("#settingsBadge", b => b.hidden)) && await T.visible("#dock [data-badge=more]"), "settings (under More on the dock) shows a dot for the request");
  await p.click("#reqBar button[data-reqok]"); await p.waitForTimeout(500);
  d = await T.db(); const fp = d["users/uid_adamxcom"].personal;
  check((d["households/" + fp].viewers || []).includes("uid_linaxcom"), "Lina is now a viewer of Adam's space");
  check(!(await T.visible("#reqBar")), "banner gone after answering");
  // Adam renames the group and opens invitations
  await T.space(2); await T.nav("settings"); await p.waitForTimeout(600);
  await p.fill("#grpList input[data-rename]", "Home"); await p.click("#grpList button[data-renameok]"); await p.waitForTimeout(500);
  await p.click("#grpList button[data-inv]"); await p.waitForTimeout(400);
  const fg = await T.text("#grpList");
  check(/Home/.test(fg) && /open until/.test(fg), "group renamed and invitations open", fg);
  await T.nav("home");
  check((await T.bar()).join("|") === "Me|*Home", "space bar shows the new name", await T.bar());
  // Lina views Adam's dashboard
  await T.login("lina@x.com");
  const bar = await T.bar();
  check(bar.some(b => /Adam's \(view only\)/.test(b)), "Lina has Adam's dashboard (view only)", bar);
  await p.click("#spaceBar button:nth-child(" + (bar.findIndex(t => /view only/.test(t)) + 1) + ")"); await p.waitForTimeout(1500);
  check(/Adam's dashboard/.test(await T.text("#readonlyBanner")), "read-only banner", await T.text("#readonlyBanner"));
  check(/Left to spend this month: Adam/.test(await p.textContent("#heroLabel")), "hero uses Adam's name", await p.textContent("#heroLabel"));
  await T.nav("entries");
  rows = await T.rows();
  check(rows.length === 2 && rows.every(r => /\[\]$/.test(r)), "Adam's entries, no edit buttons", rows);
  check(!(await T.visible("#formPanel")), "no add form when view-only");
  await T.saveState("2");
  await T.end();
})();
