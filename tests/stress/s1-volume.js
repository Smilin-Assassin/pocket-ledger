// s1: lots of data. Seeds N made-up entries (default 10000 over 3 years) plus many goals,
// loans and bills, then times start-up, every page, search, month switching, filters,
// and checks layout at many screen sizes. CPU time is split into app code vs the test mock.
const { start } = require("../lib");
const N = +process.env.N || 10000;
const U = "uid_tomxcom", H = "households/P1";
const CATS = ["Food & groceries", "Eating out", "Rent & bills", "Transport", "Phone & internet", "Shopping", "Health", "Other"];
const now = new Date(), iso = d => d.toISOString().slice(0, 10);
const seed = {
  ["access/" + U]: { ok: true, how: "invite", admin: true },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 500, openingBy: { [U]: 500 }, people: [{ id: U, name: "Tom", bank: "THOMAS ALI HASSAN", accounts: [{ bank: "BML", name: "Main", last4: "4821" }] }] } }
};
let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
for (let g = 0; g < 25; g++) seed[H + "/goals/g" + g] = { name: "Goal " + g, target: 1000 + g * 100, by: "2027-12", owner: U, author: U };
for (let l = 0; l < 40; l++) seed[H + "/loans/l" + l] = { direction: l % 2 ? "lent" : "borrowed", counterparty: "Friend " + l, amount: 100 + l * 10, date: "2026-0" + (1 + l % 9) + "-10", due: "2026-12-01", inMonth: l % 3 === 0, person: U, author: U };
for (let b = 0; b < 40; b++) seed[H + "/recurring/r" + b] = { type: "expense", amount: 50 + b, category: "Rent & bills", note: "Bill " + b, person: U, author: U, day: 1 + (b % 28), remindDays: 7, startMonth: "2025-01", skips: [] };
for (let i = 0; i < N; i++) {
  const d = new Date(now.getTime() - Math.floor(rnd() * 3 * 365) * 864e5), t = rnd();
  const type = t < 0.8 ? "expense" : t < 0.9 ? "income" : t < 0.96 ? "save" : "withdraw";
  const e = { type, amount: Math.round(rnd() * 50000) / 100, date: iso(d), category: type === "income" ? "Salary" : CATS[Math.floor(rnd() * CATS.length)], note: "Shop " + Math.floor(rnd() * 400), person: U, author: U, created: i };
  if (type === "save" || type === "withdraw") e.goalId = "g" + Math.floor(rnd() * 25);
  if (i % 50 === 0) e.loanId = "l" + (i % 40), e.loanRole = "repay";
  if (i % 97 === 0) e.maybeDup = "x";
  seed[H + "/entries/e" + i] = e;
}

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log(`s1: ${N} entries, 25 goals, 40 loans, 40 bills  (seed ${(JSON.stringify(seed).length / 1e6).toFixed(1)} MB)`);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await p.addInitScript(() => { window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ type: "longtask", buffered: true }); } catch {} });
  const prof = async (label, fn) => {
    await cdp.send("Profiler.start"); const t0 = Date.now(); await fn(); const wall = Date.now() - t0;
    const { profile } = await cdp.send("Profiler.stop");
    const dt = {}; profile.samples.forEach((s, i) => { dt[s] = (dt[s] || 0) + (profile.timeDeltas[i] || 0); });
    const by = { app: 0, mock: 0, other: 0 }, fns = {};
    profile.nodes.forEach(n => { const t = (dt[n.id] || 0) / 1000; const u = n.callFrame.url || ""; const k = /mockfb|gstatic/.test(u) ? "mock" : /localhost:8765/.test(u) ? "app" : "other"; by[k] += t;
      if (k === "app" && t) { const f = u.split("/").pop() + ":" + (n.callFrame.functionName || "(anon)") + ":" + n.callFrame.lineNumber; fns[f] = (fns[f] || 0) + t; } });
    const top = Object.entries(fns).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([f, t]) => f + " " + t.toFixed(0) + "ms").join(", ");
    console.log(`  · ${label}: wall ${wall}ms | app JS ${by.app.toFixed(0)}ms, mock ${by.mock.toFixed(0)}ms, browser ${by.other.toFixed(0)}ms${top ? "\n      top app: " + top : ""}`);
    return { wall, app: by.app };
  };
  const settle = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const results = {};

  results.boot = await prof("start-up to Home", async () => { await T.login("tom@x.com", "#home"); await p.waitForFunction(() => /\d/.test((document.getElementById("sSaved") || {}).textContent || ""), null, { timeout: 30000 }); await settle(); });
  check(results.boot.app < 1500, "start-up app JS under 1.5 s with " + N + " entries", results.boot.app);

  for (const pg of ["entries", "bills", "goals", "loans", "settings", "home"]) {
    results[pg] = await prof("open " + pg, async () => { await p.evaluate(x => { location.hash = x; }, pg); await settle(); await p.waitForTimeout(50); });
    check(results[pg].app < 400, `opening ${pg} under 400 ms of app JS`, results[pg].app);
  }

  await T.nav("entries");
  const monthRows = (await p.$$("#ledger li.tx")).length;
  results.search = await prof('search "shop" (matches nearly everything)', async () => { await p.fill("#searchQ", "shop"); await p.waitForTimeout(260); await settle(); });
  const searchRows = (await p.$$("#ledger li.tx")).length, domNodes = await p.evaluate(() => document.getElementsByTagName("*").length);
  console.log(`      month list ${monthRows} rows; search list ${searchRows} rows; DOM nodes ${domNodes}`);
  check(results.search.app < 800, "search across all months under 800 ms", results.search.app);
  check(domNodes < 30000, "search keeps the page under 30k DOM nodes", domNodes);
  // typing one letter at a time
  results.typing = await prof("typing a search letter by letter", async () => { await p.fill("#searchQ", ""); await p.type("#searchQ", "shop 12", { delay: 60 }); await p.waitForTimeout(260); await settle(); });
  const scrollT = await p.evaluate(async () => { const t0 = performance.now(); let f = 0; const el = document.scrollingElement; for (let i = 0; i < 60; i++) { el.scrollTop += 300; await new Promise(r => requestAnimationFrame(r)); f++; } return (performance.now() - t0) / f; });
  console.log(`      scrolling the long list: ${scrollT.toFixed(1)} ms per frame`);
  check(scrollT < 34, "scrolling a long list stays above 30 fps", scrollT);
  await p.fill("#searchQ", ""); await p.waitForTimeout(300);

  results.months = await prof("flip back 36 months quickly", async () => { for (let i = 0; i < 36; i++) await p.click("#prevM"); await settle(); });
  check(results.months.app < 3000, "36 month flips under 3 s of app JS", results.months.app);
  results.monthsH = await prof("flip forward 36 months on Home", async () => { await T.nav("home"); for (let i = 0; i < 36; i++) await p.click("#nextM"); await settle(); });

  // layout at many sizes and text sizes: nothing wider than the screen
  const sizes = [[320, 568], [360, 740], [412, 915], [768, 1024], [915, 412], [1024, 768], [1440, 900]];
  const over = [];
  for (const [w, h] of sizes) {
    await p.setViewportSize({ width: w, height: h });
    for (const pg of ["home", "entries", "bills", "goals", "loans", "settings"]) {
      await p.evaluate(x => { location.hash = x; }, pg); await p.waitForTimeout(250);
      const o = await p.evaluate(() => { const W = document.documentElement.clientWidth, bad = [];
        if (document.documentElement.scrollWidth > W + 1) bad.push("page scrolls sideways " + document.documentElement.scrollWidth);
        return bad; });
      if (o.length) over.push(w + "x" + h + " " + pg + ": " + o.join("; "));
    }
  }
  check(!over.length, "no sideways scrolling on any page at 7 screen sizes", over);
  // extra large text on the smallest phone
  await p.setViewportSize({ width: 320, height: 568 });
  await T.nav("settings/look"); await p.click('#fsSeg [data-fs="xl"]'); await p.waitForTimeout(300);
  const overXL = [];
  for (const pg of ["home", "entries", "bills", "goals", "loans", "settings"]) {
    await p.evaluate(x => { location.hash = x; }, pg); await p.waitForTimeout(300);
    const o = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 1) overXL.push(pg + " +" + o + "px");
  }
  check(!overXL.length, "Extra large text on a 320px phone: no sideways scrolling", overXL);
  await T.nav("settings/look"); await p.click('#fsSeg [data-fs="m"]');

  const lt = await p.evaluate(() => window.__lt || []);
  console.log(`      long tasks (>50ms) during the run: ${lt.length}, longest ${Math.max(0, ...lt).toFixed(0)}ms`);
  const heap = await p.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1);
  console.log(`      JS heap: ${heap} MB`);
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
