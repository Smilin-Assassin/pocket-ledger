// g18 (v41, Coral Dusk since v50): the Dashboard card grid on laptops, the spending ring, and Needs a look by month. Made-up data.
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
  console.log("g27 (v64): on a touch phone, tap a ring piece then tap See entries: the entries open for every piece");
  const T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } }), { p, check } = T;
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(3500); // past the opening animation
  if (await p.evaluate(() => !document.getElementById("backupNag").hidden)) { await p.click("#backupNag button >> text=Later"); await p.waitForTimeout(500); }
  const n = await p.evaluate(() => document.querySelectorAll("#catRing .seg").length), fails = [];
  for (let i = 0; i < n; i++) {
    const pt = await p.evaluate(i => { const s = document.querySelectorAll("#catRing .seg")[i], L = s.getTotalLength(), q = s.getPointAtLength(L * 0.04), c = s.getScreenCTM(); return [q.x * c.a + c.e, q.y * c.d + c.f]; }, i); // a point on the piece's outer edge
    await p.touchscreen.tap(pt[0], pt[1]); await p.waitForTimeout(250);
    const g = await p.evaluate(() => { const r = document.getElementById("pickGo").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.touchscreen.tap(g[0], g[1]); await p.waitForTimeout(900);
    if (await p.evaluate(() => !!document.getElementById("pg-home").offsetParent)) fails.push(i);
    await p.evaluate(() => { location.hash = "#home"; }); await p.waitForTimeout(600);
  }
  check(n >= 5 && !fails.length, "See entries opens the entries after picking each of the " + n + " pieces by touch", fails);
  await T.end();
})();
