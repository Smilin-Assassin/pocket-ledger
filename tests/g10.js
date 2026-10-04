// g10: the bar (4 or 6 tabs, dip and bubble, More), Quick add from the +, Undo on bills and goals, Settings › Appearance.
const { start, loadState } = require("./lib");

(async () => {
  const T = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" } }), { p, check } = T;
  console.log("g10: dock, quick add, undo, appearance");
  const myEntries = async () => { const d = await T.db(), pid = d["users/uid_adamxcom"].personal; return Object.keys(d).filter(k => k.startsWith("households/" + pid + "/entries/")).map(k => d[k]); };
  await T.login("adam@x.com", "#home");
  const tabs = () => p.$$eval("#dock .dk-tab", t => t.map(x => x.dataset.p + (x.classList.contains("on") ? "*" : "")));
  check(JSON.stringify(await tabs()) === JSON.stringify(["home*", "entries", "bills", "more"]), "default dock: Home, Entries | Bills, More", await tabs());
  check(!(await T.visible("#nav")), "old tab bar hidden on phones");
  // tap a tab
  await p.click("#dock [data-p=entries]"); await p.waitForTimeout(600);
  check(/#entries/.test(p.url()) && (await tabs())[1] === "entries*", "tapping Entries goes there", [p.url(), await tabs()]);
  // scrub: hold and slide from Entries to Bills
  const b1 = await p.$eval("#dock [data-p=entries]", e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const b2 = await p.$eval("#dock [data-p=bills]", e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.move(b1[0], b1[1]); await p.mouse.down();
  for (let i = 1; i <= 8; i++) { await p.mouse.move(b1[0] + (b2[0] - b1[0]) * i / 8, b1[1]); await p.waitForTimeout(16); }
  await p.mouse.up(); await p.waitForTimeout(600);
  check(/#bills/.test(p.url()), "sliding across the dock lands on Bills", p.url());
  // the bubble (and the dip under it) settle centred on the tab, showing its icon
  const bub = await p.$eval("#dkBubble", e => { const r = e.getBoundingClientRect(); return r.x + r.width / 2; });
  const tabC = await p.$eval("#dock [data-p=bills]", e => { const r = e.getBoundingClientRect(); return r.x + r.width / 2; });
  check(Math.abs(bub - tabC) < 3, "bubble settled on the tab", [bub, tabC]);
  check(/path\(/.test(await p.$eval("#dkBar", e => e.style.clipPath)) && (await p.$$eval("#dkBubble svg", s => s.length)) === 1, "the bar has its dip and the bubble shows the icon");
  // More lists the other pages
  await p.click("#dock [data-p=more]"); await p.waitForTimeout(500);
  const more = await p.$$eval("#moreList [data-more]", b => b.map(x => x.dataset.more));
  check(JSON.stringify(more) === JSON.stringify(["loans", "goals", "settings", "admin"]), "More holds Loans, Goals, Settings (and Admin for the admin)", more);
  await p.click("#moreList [data-more=goals]"); await p.waitForTimeout(500);
  check(/#goals/.test(p.url()) && (await tabs())[3] === "more*", "a page from More keeps More lit", await tabs());

  // Quick add
  const before = (await myEntries()).length;
  await p.click("#dkPlus"); await p.waitForTimeout(700);
  check(await T.visible("#qaSheet"), "+ opens Quick add");
  check(await p.$eval("#qaSave", b => b.disabled), "save waits for an amount");
  for (const k of ["1", "2", "5", ".", "5"]) await p.click(`#qaPad [data-k="${k}"]`);
  check((await p.textContent("#qaVal")) === "125.5", "pad types the amount", await p.textContent("#qaVal"));
  await p.click("#qaPad [data-k=del]");
  const chip = await p.$eval("#qaChips .qa-chip:nth-child(2)", b => b.dataset.cat);
  await p.click("#qaChips .qa-chip:nth-child(2)");
  await p.click("#qaNoteBtn"); await p.fill("#qaNote", "Quick lunch");
  await p.click("#qaSave"); await p.waitForTimeout(700);
  check(!(await T.visible("#qaSheet")), "sheet closes after adding");
  let es = await myEntries();
  const added = es.find(e => e.note === "Quick lunch");
  check(es.length === before + 1 && added && added.amount === 125 && added.type === "expense" && added.category === chip && added.person === "uid_adamxcom", "entry saved", added);
  check(/Added MVR\s?125\.00/.test(await T.text("#toast")) && await T.visible("#toast .toast-act"), "toast with Undo", await T.text("#toast"));
  await p.click("#toast .toast-act"); await p.waitForTimeout(500);
  check((await myEntries()).length === before, "Undo removes it");
  // keyboard + income + More options carries over to the full form
  await p.click("#dkPlus"); await p.waitForTimeout(600);
  await p.click('#qaType [data-v="income"]');
  await p.keyboard.type("300");
  check((await p.textContent("#qaVal")) === "300" && (await p.textContent("#qaSave")) === "Add income", "typing works; income mode");
  await p.click("#qaMore"); await p.waitForTimeout(800);
  check(/#entries/.test(p.url()) && (await p.inputValue("#fAmount")) === "300" && await p.$eval('#formPanel .seg button[data-t="income"]', b => b.getAttribute("aria-pressed") === "true" || b.classList.contains("on")), "More options opens the full form, filled in", [p.url(), await p.inputValue("#fAmount")]);
  // hold the + for the shortcuts
  const pc = await p.$eval("#dkPlus", e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.move(pc[0], pc[1]); await p.mouse.down(); await p.waitForTimeout(650);
  check(await p.$eval("#dkSat", s => s.classList.contains("open")), "holding the + shows Scan / Type it / Voice");
  const tgt = await p.$eval('#dkSat [data-sat="add"]', e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.move(tgt[0], tgt[1], { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(700);
  check(await T.visible("#qaSheet"), "sliding to Type it opens Quick add");
  await p.keyboard.press("Escape"); await p.waitForTimeout(700);
  check(!(await T.visible("#qaSheet")), "Escape closes it");

  // Undo for bills and goals
  await T.nav("bills"); await p.waitForTimeout(300);
  const n0 = await p.$$eval("[data-rdel]", b => b.length);
  if (n0) {
    await p.click("[data-rdel] >> nth=0"); await p.waitForTimeout(500);
    check((await p.$$eval("[data-rdel]", b => b.length)) === n0 - 1, "reminder deleted at once");
    await p.click("#toast .toast-act"); await p.waitForTimeout(500);
    check((await p.$$eval("[data-rdel]", b => b.length)) === n0, "Undo brings the reminder back");
  } else console.log("  (no reminders in this seed, skipped)");
  await T.nav("goals"); await p.waitForTimeout(300);
  const g0 = await p.$$eval("[data-gdel]", b => b.length);
  if (g0) {
    const gid = await p.$eval("[data-gdel]", b => b.dataset.gdel);
    const linked = (await myEntries()).filter(e => e.goalId === gid).length;
    await p.click("[data-gdel] >> nth=0"); await p.waitForTimeout(500);
    check((await p.$$eval("[data-gdel]", b => b.length)) === g0 - 1, "goal deleted at once");
    await p.click("#toast .toast-act"); await p.waitForTimeout(600);
    check((await p.$$eval("[data-gdel]", b => b.length)) === g0 && (await myEntries()).filter(e => e.goalId === gid).length === linked, "Undo restores the goal and its savings", linked);
  } else console.log("  (no goals in this seed, skipped)");

  // Settings › Appearance
  await T.nav("settings/look"); await p.waitForTimeout(500);
  check(/Hz/.test(await p.textContent("#hzNote")), "refresh rate shown", await p.textContent("#hzNote"));
  await p.click('#motionSeg [data-motion="jelly"]'); await p.waitForTimeout(200);
  check((await p.evaluate(() => JSON.parse(localStorage.getItem("pl-motion")).preset)) === "jelly", "motion preset saved");
  await p.click('#dockSizeSeg [data-tabs="6"]'); await p.waitForTimeout(500);
  check((await tabs()).length === 6 && !(await tabs()).some(t => /more/.test(t)), "6 tabs: every page, no More", await tabs());
  await p.click('#dockSizeSeg [data-tabs="4"]'); await p.waitForTimeout(300);
  // swap Bills for Goals: unticking leaves the dock alone until 3 are picked again
  await p.uncheck('#dockPicks [data-dpick="bills"]'); await p.waitForTimeout(300);
  check((await tabs()).length === 4 && /Pick 1 more/.test(await p.textContent("#dockFit")), "never 3 or 5: waits for a 3rd pick", [await tabs(), await p.textContent("#dockFit")]);
  await p.check('#dockPicks [data-dpick="goals"]'); await p.waitForTimeout(400);
  check(JSON.stringify((await tabs()).map(t => t.replace("*", ""))) === JSON.stringify(["home", "entries", "goals", "more"]), "dock now Home, Entries | Goals, More", await tabs());
  await p.uncheck("#setBuzz");
  check((await p.evaluate(() => JSON.parse(localStorage.getItem("pl-motion")).buzz)) === false, "vibrations can be turned off");
  // narrow phone: 6 isn't offered
  await p.setViewportSize({ width: 340, height: 740 }); await p.waitForTimeout(400);
  await p.click('#dockSizeSeg [data-tabs="4"]').catch(() => {});
  check(await p.$eval('#dockSizeSeg [data-tabs="6"]', b => b.disabled) && (await tabs()).length === 4, "a narrow screen stays at 4 tabs", await tabs());
  // laptop: side menu with the moving highlight, no dock
  await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(500);
  check(await T.visible("#nav") && !(await T.visible("#dock")), "laptop keeps the side menu");
  await p.click('#nav a[data-nav="loans"]'); await p.waitForTimeout(900);
  const nb = await p.$eval(".nav-blob", e => e.getBoundingClientRect().top), na = await p.$eval('#nav a[data-nav="loans"]', e => e.getBoundingClientRect().top);
  check(Math.abs(nb - na) < 3, "side highlight moved to Loans", [nb, na]);
  // highlight lines up with every tab at every text size (Small/Large zoom the page), dock and side menu
  const off = async () => p.evaluate(() => {
    const vis = e => e && e.offsetParent !== null;
    if (vis(document.getElementById("dock"))) { const b = document.getElementById("dkBubble").getBoundingClientRect(), t = document.querySelector("#dock .dk-tab.on").getBoundingClientRect();
      return Math.abs((b.left + b.right) / 2 - (t.left + t.right) / 2); }
    const b = document.querySelector(".nav-blob").getBoundingClientRect(), a = document.querySelector('#nav a[aria-current="page"]').getBoundingClientRect();
    return Math.max(Math.abs(b.top - a.top), Math.abs(b.bottom - a.bottom), Math.abs((b.left + b.right) / 2 - (a.left + a.right) / 2)); });
  const bad = [];
  for (const fs of ["s", "m", "l", "xl"]) {
    await p.evaluate(f => { localStorage.setItem("pl-fs", f === "m" ? "" : f); window.plApplyTheme(); }, fs);
    for (const [w, h, pages] of [[412, 900, ["home", "entries", "bills", "more", "goals"]], [900, 412, ["home", "loans", "settings", "admin"]]]) {
      await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(250);
      for (const pg of pages) { await T.nav(pg); await p.waitForTimeout(1100); const d = await off(); if (d > 2) bad.push(fs + "/" + w + "/" + pg + ": " + d.toFixed(1)); }
    }
  }
  await p.evaluate(() => { localStorage.removeItem("pl-fs"); window.plApplyTheme(); });
  check(!bad.length, "highlight sits on the right tab at every text size, phone and landscape", bad);
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
