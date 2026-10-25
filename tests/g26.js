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
    return { circles: document.querySelectorAll("#split svg circle").length, inside: b.left >= r.left + 20 && b.right <= r.right - 20, text: document.getElementById("leftBig").textContent, ids: ["legend", "leftSub", "copyIncome", "tileBtn", "dueBar", "owesBar", "smartBar"].every(i => document.getElementById(i)) }; });
  check(ring.circles === 3 && /MVR\s?8,255/.test(ring.text), "ring: track plus spent and left (saved is 0) and Left to spend in the middle", ring);
  check(ring.inside, "the amount sits inside the ring", ring);
  check(await p.isVisible("#split svg") && await p.isVisible("#legend"), "the ring and its percentages always show (the old hide-split setting is ignored)");
  const pos = () => p.evaluate(() => ["summary", "tiles", "cats-panel", "buds-panel", "recent-panel"].map(c => { const el = document.querySelector("#pg-home ." + c); return [c, getComputedStyle(el).position, el.classList.contains("stuck")]; }));
  const st = await pos();
  check(st.filter(x => x[1] === "sticky").length >= 2 && st.some(x => x[0] === "cats-panel" && x[1] === "sticky"), "phone: the section cards are sticky so they stack", st);
  await p.evaluate(() => scrollTo(0, 1100)); await p.waitForTimeout(400);
  const tops = await p.evaluate(() => [".summary", ".cats-panel", ".buds-panel"].map(s => Math.round(document.querySelector("#pg-home " + s).getBoundingClientRect().top)));
  check(tops[0] >= 8 && tops[0] <= 60 && tops[1] > tops[0], "scrolled: the first card stays pinned at the top while the next one rises over it", tops);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no sideways scrolling on a phone");
  await p.evaluate(() => scrollTo(0, 0));
  await p.click("#budgetBtn"); await p.waitForTimeout(500);
  check(await p.evaluate(() => !document.querySelector("#pg-home .stuck")), "editing budgets turns stacking off so the form can't be covered");
  await T.end();
  T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 1280, height: 900 } } });
  await T.login("tom@x.com", "#home"); await T.p.waitForTimeout(1200);
  const lap = await T.p.evaluate(() => [...document.querySelectorAll("#pg-home .panel, #pg-home .summary")].map(e => getComputedStyle(e).position));
  T.check(lap.every(x => x !== "sticky"), "laptop: nothing is sticky", lap);
  await T.end();
})();
