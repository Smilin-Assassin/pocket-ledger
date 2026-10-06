// g20 (v43): the app's own frosted dropdown replaces the phone's built-in list everywhere. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }] } },
  [H + "/entries/e1"]: { type: "expense", amount: 60, date: "2026-09-03", category: "Groceries run", note: "Corner shop", person: U, author: U, created: 1 }
};

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g20: picker sheet for every dropdown");
  await T.login("tom@x.com", "#entries"); await p.waitForTimeout(800);
  const open = () => p.isVisible("#pickPop");
  const gapTo = sel => p.evaluate(s => { const f = document.querySelector(s).parentElement.getBoundingClientRect(), pp = document.getElementById("pickPop").getBoundingClientRect();
    return { below: Math.round(pp.top - f.bottom), above: Math.round(f.top - pp.bottom), left: Math.round(pp.left - f.left), up: document.getElementById("pickPop").classList.contains("up") }; }, sel);
  const tap = sel => p.click(`.pick-field:has(${sel})`);   // what a finger hits: the field around the dropdown

  // the category field opens the sheet, not the phone's list
  check(await p.evaluate(() => document.getElementById("fCatSel").parentElement.classList.contains("pick-field") && getComputedStyle(document.getElementById("fCatSel")).pointerEvents === "none"), "the category dropdown is wrapped and doesn't open the phone's list");
  await tap("#fCatSel"); await p.waitForTimeout(500);
  const opts = await p.$$eval("#pickList .pick-opt", b => b.map(x => x.textContent));
  check(await open() && opts.includes("Transport") && opts.includes("Groceries run") && opts[opts.length - 1] === "+ New category…" && !opts.includes("Choose a category"), "tapping Category opens the dropdown with every category and + New category… last", opts);
  const g = await gapTo("#fCatSel");
  check(g.below >= 0 && g.below <= 10 && Math.abs(g.left) <= 1 && !g.up, "it drops down right under the field, lined up with it", g);
  check(/blur/.test(await p.$eval("#pickPop", e => getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter)), "frosted glass behind it");
  await p.click('#pickList [data-v="Transport"]'); await p.waitForTimeout(500);
  check(!(await open()) && (await p.inputValue("#fCatSel")) === "Transport" && (await p.inputValue("#fCat")) === "Transport", "picking Transport sets it (and the form hears the change)", [await p.inputValue("#fCatSel"), await p.inputValue("#fCat")]);
  await tap("#fCatSel"); await p.waitForTimeout(400);
  check((await p.getAttribute('#pickList [data-v="Transport"]', "aria-selected")) === "true" && !!(await p.$('#pickList [data-v="Transport"] .pick-tick')), "the current choice is highlighted with a tick");
  await p.click('#pickList [data-v="__other"]'); await p.waitForTimeout(400);
  check(await T.visible("#fCat"), "+ New category… shows the box to type one");
  // closing without choosing changes nothing
  await tap("#fCatSel"); await p.waitForTimeout(400); await p.keyboard.press("Escape"); await p.waitForTimeout(500);
  check(!(await open()) && (await p.inputValue("#fCatSel")) === "__other", "Escape closes it without changing anything");
  await tap("#fCatSel"); await p.waitForTimeout(400); await p.mouse.click(200, 60); await p.waitForTimeout(500);
  check(!(await open()), "tapping outside closes it");

  // short lists show as rows; the entries filter and other pages use it too
  await p.click('#formPanel .seg button[data-t="income"]'); await p.waitForTimeout(200);
  await tap("#fFor"); await p.waitForTimeout(400);
  check((await p.$$("#pickList .pick-opt")).length === 2, "Counts for: two choices");
  await p.click('#pickList [data-v="next"]'); await p.waitForTimeout(400);
  check((await p.inputValue("#fFor")) === "next", "and it sets it");
  await tap("#catFilter"); await p.waitForTimeout(400);
  check(await open() && (await p.$$eval("#pickList .pick-opt", b => b.map(x => x.textContent)))[0] === "All categories", "the category filter uses it, starting with All categories");
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  await T.nav("loans"); await tap("#lnDir"); await p.waitForTimeout(400);
  await p.click('#pickList [data-v="borrowed"]'); await p.waitForTimeout(400);
  check((await p.inputValue("#lnDir")) === "borrowed" && /borrow from/.test(await p.textContent("#lnNameL")), "Loans › Type works through it too");
  // dropdowns made later (Settings › Categories merge) are wrapped as they appear
  await T.nav("settings/cats"); await p.waitForTimeout(600);
  check(await p.$eval('#catTidy select[data-ct-into]', s => s.parentElement.classList.contains("pick-field")), "dropdowns added later get the picker too");
  // near the bottom of the screen it opens upwards; at Extra large text it still lines up with the field
  await p.keyboard.press("Escape").catch(() => {});
  await T.nav("entries"); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
  const fb = await p.evaluate(() => document.getElementById("fCatSel").parentElement.getBoundingClientRect().bottom);
  await p.setViewportSize({ width: 412, height: Math.round(fb + 90) }); await p.waitForTimeout(400);
  await tap("#fCatSel"); await p.waitForTimeout(500);
  const gu = await gapTo("#fCatSel");
  check(gu.up && gu.above >= 0 && gu.above <= 10, "near the bottom it opens upwards, right above the field", gu);
  await p.keyboard.press("Escape"); await p.waitForTimeout(300); await p.setViewportSize({ width: 412, height: 900 }); await p.waitForTimeout(300);
  await p.evaluate(() => { localStorage.setItem("pl-fs", "xl"); window.plApplyTheme(); }); await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.evaluate(() => document.getElementById("fCatSel").scrollIntoView({ block: "center" })); await p.waitForTimeout(300);
  await tap("#fCatSel"); await p.waitForTimeout(500);
  const gx = await gapTo("#fCatSel");
  check(Math.abs(gx.left) <= 2 && (gx.up ? gx.above : gx.below) >= 0 && (gx.up ? gx.above : gx.below) <= 12, "at Extra large text it still lines up with the field", gx);
  await p.keyboard.press("Escape"); await p.evaluate(() => { localStorage.setItem("pl-fs", "m"); window.plApplyTheme(); });
  // scrolling the page: it stays attached to the field, and closes once the field scrolls off screen
  await p.evaluate(() => document.getElementById("fCatSel").scrollIntoView({ block: "center" })); await p.waitForTimeout(200);
  await tap("#fCatSel"); await p.waitForTimeout(400); await p.mouse.move(380, 60); await p.mouse.wheel(0, 120); await p.waitForTimeout(400);
  const gs = await gapTo("#fCatSel");
  check(await open() && Math.abs(gs.left) <= 2 && (gs.up ? gs.above : gs.below) <= 12, "a small scroll keeps it attached to the field", gs);
  await p.evaluate(() => window.scrollBy(0, 2000)); await p.waitForTimeout(400);
  check(!(await open()), "scrolling the field off screen closes it");
  await p.setViewportSize({ width: 1280, height: 800 }); await T.nav("entries"); await tap("#fCatSel"); await p.waitForTimeout(500);
  const gl = await gapTo("#fCatSel");
  check(Math.abs(gl.left) <= 1 && (gl.up ? gl.above : gl.below) <= 10, "on a laptop it drops from the field too", gl);
  await p.keyboard.press("Escape");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
