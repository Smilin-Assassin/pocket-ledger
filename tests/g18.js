// g18 (v41): the Palm theme (colours, laptop card grid, spending ring) and Needs a look by month. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const now = new Date(), pad = n => String(n).padStart(2, "0"), K = now.getFullYear() + "-" + pad(now.getMonth() + 1);
const prev = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); })();
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }], budgets: { [U]: { Transport: 500 } } } }
};
let n = 0; const E = (k, d, amount, category, note, extra) => { seed[H + "/entries/e" + (++n)] = Object.assign({ type: "expense", amount, date: k + "-" + pad(d), category, note, person: U, author: U, created: Date.now() - n * 1000 }, extra || {}); };
E(K, 1, 9000, "Salary", "Pay", { type: "income" });
E(K, 2, 400, "Food & groceries", "Groceries"); E(K, 2, 150, "Eating out", "Lunch", { meal: "lunch" }); E(K, 3, 90, "Transport", "Taxi"); E(K, 3, 30, "Shopping", "Pens"); E(K, 3, 20, "Health", "Plasters");
E(K, 3, 55, "Other", "Mystery shop this month");                       // needs a look this month
E(prev, 10, 66, "Other", "Mystery shop last month");                   // needs a look last month
E(prev, 12, 40, "Transport", "Taxi", { maybeDup: "e4" });              // possible repeat last month

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 1280, height: 900 } } }), { p, check } = T;
  console.log("g18: Palm theme, Needs a look by month");
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(800);

  // Needs a look follows the month shown
  check(/1 thing in \w+ \d{4} could use a look/.test(await T.text("#smartBar")), "Home counts only this month's (1)", await T.text("#smartBar"));
  await p.click("#prevM"); await p.waitForTimeout(500);
  check(/2 things in \w+ \d{4} could use a look/.test(await T.text("#smartBar")), "last month on Home: 2", await T.text("#smartBar"));
  await p.click('#smartBar .smart-item:has-text("could use a look") [data-sgo]'); await p.waitForTimeout(600);
  let rows = await T.rows();
  check(/#entries/.test(p.url()) && rows.length === 2 && rows.some(r => /last month/.test(r)) && rows.some(r => /Possible repeat/.test(r)) && !rows.some(r => /this month/.test(r)), "Tidy up lists that month's two", rows);
  await p.click("#nextM"); await p.waitForTimeout(400);
  rows = await T.rows();
  check(rows.length === 1 && /this month/.test(rows[0]), "changing month changes the list", rows);
  await p.click('#ledgerTotal [data-search-all="1"]'); await p.waitForTimeout(300);
  check((await T.rows()).length === 3 && /in all months/.test(await T.text("#ledgerTotal")), "All months shows all three", await T.rows());
  await p.click('#ledgerTotal [data-search-all=""]'); await p.waitForTimeout(300);
  check((await T.rows()).length === 1, "Just this month again");

  // Palm theme
  await T.nav("settings/look"); await p.click('.theme-sw[data-preset="palm"]'); await p.waitForTimeout(400);
  check(await p.evaluate(() => document.documentElement.getAttribute("data-preset")) === "palm" && await p.evaluate(() => localStorage.getItem("pl-preset")) === "palm", "Palm can be picked and is saved");
  await p.goto("about:blank"); await p.goto(require("./lib").URL0 + "#home"); await p.waitForTimeout(1300);
  check(await p.evaluate(() => document.documentElement.getAttribute("data-preset")) === "palm", "and stays after reopening");
  const lay = await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(), bg = s => getComputedStyle(document.querySelector(s)).backgroundImage + getComputedStyle(document.querySelector(s)).backgroundColor;
    return { hero: r(".summary .hero"), stats: r(".summary .stats"), cats: r(".cats-panel"), buds: r(".buds-panel"), recent: r(".recent-panel"), heroBg: bg(".summary .hero"), ring: !!document.querySelector("#catRing svg") && getComputedStyle(document.getElementById("catRing")).display !== "none" }; });
  check(lay.hero.left > lay.stats.right - 1 && Math.abs(lay.hero.top - lay.stats.top) < 2, "laptop: this month's numbers beside the lime Left to spend card", lay);
  check(/gradient/.test(lay.heroBg), "the Left to spend card is the lime gradient", lay.heroBg);
  check(Math.abs(lay.cats.top - lay.buds.top) < 2 && Math.abs(lay.buds.top - lay.recent.top) < 2 && lay.cats.right < lay.buds.left && lay.buds.right < lay.recent.left, "spending, budgets and latest entries in three columns", [lay.cats, lay.buds, lay.recent]);
  check(lay.ring && /MVR\s?745/.test(await T.text("#catRing")), "the spending ring shows with the month's total", await T.text("#catRing"));
  check((await p.$$("#catRing circle")).length === 6, "ring: the four biggest plus everything else (5 parts) on its track");
  const clr = await p.$$eval("#cats .cat .fill", f => f.slice(0, 2).map(x => getComputedStyle(x).backgroundColor));
  check(clr[0] !== clr[1], "bars take the ring's colours", clr);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no sideways scrolling on a laptop");
  // phone: one column, nothing sideways, at every text size
  await p.setViewportSize({ width: 360, height: 780 }); await p.waitForTimeout(400);
  for (const fs of ["s", "m", "l", "xl"]) {
    await p.evaluate(f => { localStorage.setItem("pl-fs", f); window.plApplyTheme(); }, fs); await p.waitForTimeout(250);
    for (const pg of ["home", "entries", "bills", "settings"]) { await T.nav(pg);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(over <= 1, `phone ${fs} ${pg}: no sideways scrolling`, over); }
  }
  await p.evaluate(() => { localStorage.setItem("pl-fs", "m"); window.plApplyTheme(); });
  await T.nav("home");
  const one = await p.evaluate(() => { const a = document.querySelector(".cats-panel").getBoundingClientRect(), b = document.querySelector(".recent-panel").getBoundingClientRect(); return b.top >= a.bottom - 1; });
  check(one, "phone: cards stack in one column");
  // dark Palm
  await p.evaluate(() => { localStorage.setItem("pl-mode", "dark"); window.plApplyTheme(); }); await p.waitForTimeout(200);
  check(await p.evaluate(() => document.documentElement.getAttribute("data-theme")) === "dark" && await p.evaluate(() => getComputedStyle(document.body).backgroundColor) === "rgb(13, 17, 14)", "Palm has a dark look");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
