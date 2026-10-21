// g23 (v51): the little animations (js/delight.js). A logo opening once per app opening, B the ring draws when
// seen and a tapped category lifts out, C the rolling number, D a coin after adding spending (E sunset removed in v53),
// G confetti when a goal is reached (once), H the scan beam. Reduce motion: no sweeping or rolling. Made-up data.
const { start, URL0 } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const now = new Date(), pad = n => String(n).padStart(2, "0"), K = now.getFullYear() + "-" + pad(now.getMonth() + 1);
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }] } },
  [H + "/goals/gA"]: { name: "Old goal", target: 100, owner: U, author: U, created: 1 },     // reached before: no party
  [H + "/goals/gB"]: { name: "New phone", target: 1000, owner: U, author: U, created: 2 }
};
let n = 0; const E = (d, amount, category, extra) => { seed[H + "/entries/e" + (++n)] = Object.assign({ type: "expense", amount, date: K + "-" + pad(d), category, note: category, person: U, author: U, created: Date.now() - n * 1000 }, extra || {}); };
E(1, 12000, "Salary", { type: "income" }); E(1, 2400, "Food & groceries"); E(2, 1650, "Eating out"); E(2, 1200, "Bills"); E(3, 600, "Shopping"); E(3, 420, "Transport");
E(1, 150, "Savings", { type: "save", goalId: "gA" }); E(1, 900, "Savings", { type: "save", goalId: "gB" });

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g23: animations");
  const has = s => p.evaluate(s => !!document.querySelector(s), s);

  // A: the logo opening, then gone; not again on a reload in the same session
  await p.evaluate(() => { localStorage.setItem("mock-cur", "tom@x.com"); sessionStorage.clear(); });
  await p.goto("about:blank"); await p.goto(URL0 + "#home"); await p.waitForTimeout(150);
  check(await has("#splash") && await p.$eval("#splash", s => getComputedStyle(s).pointerEvents) === "none", "A: the logo opening shows and never takes taps");
  check((await p.$$eval("#splash .sp-seg", s => s.length)) === 4 && await p.$eval("#splash .sp-seg", s => getComputedStyle(s).animationName) === "spDraw", "A: four ring parts sweep in");
  // C: the amount rolls up after the opening (the real number stays in place for screen readers)
  await p.waitForSelector(".odo", { timeout: 4000 }).catch(() => {});
  check(await has(".odo .odo-col") && await p.$eval("#leftBig", b => b.classList.contains("odo-hide")), "C: Left to spend rolls up like an odometer");
  const same = await p.evaluate(() => { const a = getComputedStyle(document.getElementById("leftBig")), b = getComputedStyle(document.querySelector(".odo")); return { size: [a.fontSize, b.fontSize], fam: [a.fontFamily, b.fontFamily], weight: [a.fontWeight, b.fontWeight], color: [a.color, b.color, getComputedStyle(document.querySelector(".odo-col span")).color] }; });
  check(same.color[0] === same.color[1] && same.color[2] === same.color[0] && !/rgba\(0, 0, 0, 0\)/.test(same.color[1]), "C: the rolling digits are visible, in the amount's own colour (v53 fix)", same.color);
  check(same.size[0] === same.size[1] && same.fam[0] === same.fam[1] && same.weight[0] === same.weight[1], "C: rolling in the same font, size and weight as the amount (v52 fix)", same);
  check(/^MVR\s?4,680\.00$/.test(await p.textContent("#leftBig")) && await p.$eval(".odo", o => o.getAttribute("aria-hidden")) === "true", "C: the real amount is there all along", await p.textContent("#leftBig"));
  check(!(await has("#splash")), "A: the opening has gone by then");
  await p.waitForTimeout(1700);
  check(!(await has(".odo")) && !(await p.$eval("#leftBig", b => b.classList.contains("odo-hide"))), "C: rolls once, then plain text");
  await p.click("#nextM"); await p.waitForTimeout(300); await p.click("#prevM"); await p.waitForTimeout(400);
  check(!(await has(".odo")), "C: not again when changing months");
  // C (v54): a roll that starts long after the opening logo has gone (slow data, or a reload in the same session)
  // must keep the plain amount hidden the whole time the rolling copy is up
  const late = await p.evaluate(async () => {
    const m = await import("./js/delight.js?late=" + Date.now()), big = document.getElementById("leftBig");
    window.plSplashUntil = 0; m.rollNumber(big);
    let both = 0, rolled = 0;
    for (let t = 0; t < 1700; t += 50) { await new Promise(r => setTimeout(r, 50)); if (document.querySelector(".odo")) { rolled++; if (!big.classList.contains("odo-hide")) both++; } }
    return { both, rolled, hiddenAfter: big.classList.contains("odo-hide"), odoAfter: !!document.querySelector(".odo") };
  });
  check(late.rolled > 0 && late.both === 0 && !late.hiddenAfter && !late.odoAfter, "C: a late roll never shows the plain amount and the rolling one together (v54 fix)", late);
  // B: the ring waits off-screen, draws when scrolled to, and only once
  check(await has("#catRing svg.wait") && !(await has("#catRing svg.draw")), "B: the ring waits until it's seen");
  await p.evaluate(() => document.getElementById("catRing").scrollIntoView({ block: "center" })); await p.waitForTimeout(400);
  check(await has("#catRing svg.draw") && await p.$eval("#catRing .seg", s => getComputedStyle(s).animationName) === "ringDraw", "B: scrolled into view, it draws itself");
  await p.click("#nextM"); await p.waitForTimeout(300); await p.click("#prevM"); await p.waitForTimeout(400);
  check(!(await has("#catRing svg.wait")) && !(await has("#catRing svg.draw")), "B: drawn once per opening");
  // B: tapping a category lifts its part out, then Entries opens on it
  await p.click('#cats .cat[data-ring="1"]'); await p.waitForTimeout(80);
  check(await has("#catRing svg.lifting .seg.lift[data-i='1']"), "B: the tapped category's part lifts out");
  await p.waitForTimeout(600);
  check(/#entries/.test(p.url()) && /Eating out/.test(await T.text("#ledgerTotal")), "B: then its entries open", await T.text("#ledgerTotal"));

  // D: a coin after adding spending (Quick add), none for income
  await T.nav("home");
  await p.click("#dkPlus"); await p.waitForTimeout(600);
  for (const k of ["4", "5"]) await p.click(`#qaPad [data-k="${k}"]`);
  await p.click("#qaSave"); await p.waitForTimeout(250);
  check(await has(".coin-pop .coin") && await p.$eval(".coin-pop", c => getComputedStyle(c).pointerEvents) === "none", "D: a coin drops into the ring after adding spending");
  await p.waitForTimeout(1600);
  check(!(await has(".coin-pop")), "D: and it goes away on its own");

  // G: reaching a goal: confetti once, with a toast; the goal already reached before gets none
  check(!(await has(".confetti")), "G: no confetti for a goal reached before");
  await T.nav("entries");
  await p.evaluate(async () => { const s = await import("./js/store.js"); s.db.add({ type: "save", amount: 150, date: new Date().toISOString().slice(0, 10), category: "Savings", goalId: "gB", note: "Phone fund", person: s.meId(), created: Date.now() }); });
  await p.waitForTimeout(300);
  check(await has(".confetti i") && /Goal reached: New phone/.test(await T.text("#toast")), "G: confetti and a toast when New phone is reached", await T.text("#toast"));
  await p.waitForTimeout(2400);
  check(!(await has(".confetti")), "G: the confetti clears away");
  await p.evaluate(async () => { const s = await import("./js/store.js"); s.db.add({ type: "save", amount: 50, date: new Date().toISOString().slice(0, 10), category: "Savings", goalId: "gB", note: "More", person: s.meId(), created: Date.now() }); });
  await p.waitForTimeout(300);
  check(!(await has(".confetti")), "G: only the first time");

  // H: the scan beam over the picture while it's read
  await p.evaluate(() => { window.__slowMs = 1500; });
  const png = await p.screenshot({ clip: { x: 0, y: 0, width: 200, height: 260 } });
  await p.setInputFiles("#scanFile", { name: "receipt.png", mimeType: "image/png", buffer: png }); await p.waitForTimeout(400);
  check(await has("#scanStatus .scanviz .scanviz-beam") && /^blob:/.test(await p.$eval("#scanStatus .scanviz img", i => i.src)), "H: the receipt shows with a coral beam sweeping it");
  await p.waitForTimeout(2000);
  check(!(await has("#scanStatus .scanviz")), "H: gone when reading is done");
  await p.evaluate(() => { window.__slowMs = 0; }); await p.click("#scanClose").catch(() => {});

  // E was removed in v53: Dark and Light switch straight away, no sky over the page
  await T.nav("settings/look");
  await p.click('#modeSeg [data-mode="dark"]'); await p.waitForTimeout(80);
  check(await p.evaluate(() => document.documentElement.dataset.theme) === "dark" && !(await has(".sky")), "Dark switches straight away, no sunset");
  await p.click('#modeSeg [data-mode="light"]'); await p.waitForTimeout(80);
  check(await p.evaluate(() => document.documentElement.dataset.theme) === "light" && !(await has(".sky")), "Light switches straight away, no sunrise");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();

  // reduce motion: everything plays down to its end state
  const R = await start({ seed, users: { "tom@x.com": "secret12" }, context: { reducedMotion: "reduce" } });
  await R.p.evaluate(() => { localStorage.setItem("mock-cur", "tom@x.com"); sessionStorage.clear(); });
  await R.p.goto("about:blank"); await R.p.goto(URL0 + "#home"); await R.p.waitForTimeout(1300);
  const rh = s => R.p.evaluate(s => !!document.querySelector(s), s);
  R.check(!(await rh("#splash")) && !(await rh(".odo")) && !(await rh("#catRing svg.wait")), "reduce motion: a short opening, no rolling, the ring just shows");
  await R.nav("settings/look"); await R.p.click('#modeSeg [data-mode="dark"]'); await R.p.waitForTimeout(100);
  R.check(!(await rh(".sky")) && await R.p.evaluate(() => document.documentElement.dataset.theme) === "dark", "reduce motion: Dark switches straight away");
  await R.end();
})();
