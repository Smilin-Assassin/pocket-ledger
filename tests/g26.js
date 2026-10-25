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
  console.log("g26: Plum night Dashboard (v58): plum panel with the income ring, cards that stack on phones");
  let T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 390, height: 844 } } }), { p, check } = T;
  await p.evaluate(() => localStorage.setItem("pl-tiles", JSON.stringify(["split"]))); // an old setting that used to hide the split bar
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(1500);
  const ring = await p.evaluate(() => { const b = document.getElementById("leftBig").getBoundingClientRect(), r = document.querySelector(".hero-ring").getBoundingClientRect();
    return { arcs: document.querySelectorAll("#catRing circle.seg").length, inside: b.left >= r.left + 20 && b.right <= r.right - 20, text: document.getElementById("leftBig").textContent, ids: ["leftSub", "copyIncome", "tileBtn", "dueBar", "owesBar", "smartBar", "tiles", "cats", "sIncome", "sTotal"].every(i => document.getElementById(i)) }; });
  check(ring.arcs === 6 && /MVR\s?8,255/.test(ring.text) && ring.ids, "ring: every category is a part of the donut, Left to spend in the middle, all the ids are still there", ring);
  const mid = await p.evaluate(() => { const a = document.querySelector(".hero-panel").getBoundingClientRect(), b = document.querySelector(".hero-ring").getBoundingClientRect(), c = document.getElementById("leftSub").getBoundingClientRect(), d = document.querySelector(".hero-acts").getBoundingClientRect(); const m = r => Math.round((r.left + r.right) / 2 - (a.left + a.right) / 2); return [m(b), m(c), m(d)]; });
  check(mid.every(x => Math.abs(x) <= 2), "the ring, the line under it and the buttons are centred in the plum panel", mid);
  check(ring.inside, "the amount sits inside the ring", ring);
  check(await p.isVisible("#catRing svg"), "the ring always shows (the old hide-split setting is ignored)");
  const pos = () => p.evaluate(() => ["attn", "buds-panel", "recent-panel"].map(c => { const el = document.querySelector("#pg-home ." + c); return [c, getComputedStyle(el).position, el.classList.contains("stuck")]; }));
  const st = await pos();
  check(st.some(x => x[0] === "buds-panel" && x[1] === "sticky") && st.some(x => x[0] === "recent-panel" && x[1] === "sticky"), "phone: the section cards are sticky so they stack", st);
  await p.evaluate(() => scrollTo(0, 1100)); await p.waitForTimeout(400);
  const tops = await p.evaluate(() => [".attn", ".buds-panel", ".recent-panel"].map(s => Math.round(document.querySelector("#pg-home " + s).getBoundingClientRect().top)));
  check(tops[0] >= 8 && tops[0] <= 60 && tops[1] >= tops[0] && tops[2] > tops[1], "scrolled: the first card stays pinned at the top while the next ones rise over it", tops);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no sideways scrolling on a phone");
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
  // pointing at the ring: the part under the pointer swells and the middle shows it
  const rc = await p.evaluate(() => { const r = document.getElementById("catRing").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width / 2]; });
  const ang = 8 * Math.PI / 180; await p.mouse.move(rc[0] + Math.sin(ang) * rc[2] * .94, rc[1] - Math.cos(ang) * rc[2] * .94); await p.waitForTimeout(300);
  const pk = await p.evaluate(() => ({ on: document.querySelector(".hero-ring").classList.contains("picking"), name: document.getElementById("pickName").textContent, amt: document.getElementById("pickAmt").textContent, w: document.querySelector(".pickarc").getAttribute("stroke-width"), op: document.querySelector(".pickarc").getAttribute("opacity") }));
  check(pk.on && /Food/.test(pk.name) && /400/.test(pk.amt) && pk.op === "1" && +pk.w > 14, "pointing at the biggest part shows Food & groceries MVR 400 and swells it", pk);
  await p.mouse.move(5, 5); await p.waitForTimeout(200);
  check(await p.evaluate(() => !document.querySelector(".hero-ring").classList.contains("picking")), "moving away puts Left to spend back");
  // the smallest part can still be picked: sweep the whole ring and count the different parts reached
  const seen = new Set(); for (let d = 0; d < 360; d += 2) { const an = d * Math.PI / 180; await p.mouse.move(rc[0] + Math.sin(an) * rc[2] * .94, rc[1] - Math.cos(an) * rc[2] * .94); const n = await p.evaluate(() => document.querySelector(".hero-ring").classList.contains("picking") ? document.getElementById("pickName").textContent : ""); if (n) seen.add(n); }
  check(seen.size === 6, "sweeping around the ring reaches all six categories, even the smallest", [...seen]);
  await p.mouse.move(5, 5);
  // the two Trends views are tabs in one card
  await p.click("#trendPanel .fold-head"); await p.waitForTimeout(500);
  check(await p.isVisible("#trendChart svg") && await p.isHidden("#cmpView"), "Trends opens on the 12 months");
  await p.click('#trendTabs [data-tab="cmp"]'); await p.waitForTimeout(300);
  check(await p.isVisible("#cmpBox") && await p.isHidden("#trendView"), "the Compare tab shows Compare");
  await p.click("#trendPanel .fold-head"); await p.waitForTimeout(500);
  await p.click("#budgetBtn"); await p.waitForTimeout(500);
  check(await p.evaluate(() => !document.querySelector("#pg-home .stuck")), "editing budgets turns stacking off so the form can't be covered");
  await p.setViewportSize({ width: 340, height: 700 }); await p.evaluate(() => { document.body.style.setProperty("--fs-zoom", "1.25"); document.body.dataset.fs = "custom"; }); await p.waitForTimeout(400);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1 && document.getElementById("leftBig").getBoundingClientRect().right <= document.querySelector(".hero-ring").getBoundingClientRect().right), "narrow phone with large text: nothing sideways, the amount stays in the ring");
  await T.end();
  T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 1280, height: 900 } } });
  await T.login("tom@x.com", "#home"); await T.p.waitForTimeout(1200);
  const lap = await T.p.evaluate(() => [...document.querySelectorAll("#pg-home .panel, #pg-home .attn")].map(e => getComputedStyle(e).position));
  T.check(lap.every(x => x !== "sticky"), "laptop: nothing is sticky", lap);
  await T.end();
})();
