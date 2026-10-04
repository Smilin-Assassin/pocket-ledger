// g2: Lina's migration, group entries, renaming the group; dashboard viewing is gone (v37) and old viewers lose access.
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
  check(!(await p.$("#privList")) && !(await p.$("#reqBar")), "no Privacy section or view requests any more (v37)");
  // someone Adam once let look in loses access when he next opens the app
  d = await T.db(); const fp = d["users/uid_adamxcom"].personal;
  await p.evaluate(([k]) => { const db = JSON.parse(localStorage.getItem("mock-db")); db[k].viewers = ["uid_linaxcom"]; localStorage.setItem("mock-db", JSON.stringify(db)); }, ["households/" + fp]);
  await T.login("adam@x.com"); await p.waitForTimeout(400);
  d = await T.db();
  check(!(d["households/" + fp].viewers || []).length, "old viewers removed from Adam's space");
  // Adam renames the group and opens invitations
  await T.space(2); await T.nav("settings"); await p.waitForTimeout(600);
  await p.fill("#grpList input[data-rename]", "Home"); await p.click("#grpList button[data-renameok]"); await p.waitForTimeout(500);
  await p.click("#grpList button[data-inv]"); await p.waitForTimeout(400);
  const fg = await T.text("#grpList");
  check(/Home/.test(fg) && /open until/.test(fg), "group renamed and invitations open", fg);
  await T.nav("home");
  check((await T.bar()).join("|") === "Me|*Home", "space bar shows the new name", await T.bar());
  await T.login("lina@x.com");
  check(!(await T.bar()).some(b => /view only/.test(b)), "no view-only spaces", await T.bar());
  await T.saveState("2");
  await T.end();
})();
