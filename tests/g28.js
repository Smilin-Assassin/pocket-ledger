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
  console.log("g28 (v65): the dock: two islands, the + disc in the middle, the tab you're on stretches (or gets a tag)");
  const shape = () => p.evaluate(() => { const d = document.getElementById("dock"), i = [...d.querySelectorAll(".dk-isl")], b = document.getElementById("dkPlus").getBoundingClientRect(), on = d.querySelector(".dk-tab.on"), lb = on && on.querySelector(".lbl").getBoundingClientRect(), t = on && on.getBoundingClientRect(), isl = on && on.closest(".dk-isl").getBoundingClientRect();
    return { mode: d.dataset.mode, per: i.map(x => x.children.length), mid: Math.abs((b.left + b.right) / 2 - innerWidth / 2), lblInside: !!on && lb.width > 20 && lb.left >= isl.left - 1 && lb.right <= isl.right + 1, tab: t && Math.round(t.width) }; });
  let T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 390, height: 844 } } }), { p, check } = T;
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(1500);
  let s = await shape();
  check(s.mode === "stretch" && s.per.join() === "2,2" && s.mid < 2 && s.lblInside && s.tab > 80, "390px phone: 2 + 2 tabs, the + disc dead centre, Dashboard stretches to show its name", s);
  await p.click("#dock [data-p=entries]"); await p.waitForTimeout(700); s = await shape();
  check(s.lblInside && /entries/.test(p.url()), "tapping Entries stretches Entries", s);
  const fill = await p.evaluate(() => getComputedStyle(document.querySelector("#dkPlus .p1")).fill + "|" + document.querySelectorAll("#dkPlus circle").length + "|" + document.querySelectorAll("#dkPlus rect").length);
  check(fill === "rgb(255, 122, 69)|1|0", "the + is a plain coral disc", fill);
  await T.end();
  T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 360, height: 800 } } }); p = T.p;
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(1500); s = await shape();
  const tag = await p.evaluate(() => { const l = document.querySelector("#dock .dk-tab.on .lbl"), r = l.getBoundingClientRect(), cs = getComputedStyle(l); return { pos: cs.position, vis: cs.opacity, left: Math.round(r.left), above: r.bottom <= document.querySelector("#dock .dk-isl").getBoundingClientRect().top + 2 }; });
  T.check(s.mode === "tag" && s.tab === 38 && tag.pos === "absolute" && tag.vis === "1" && tag.left >= 0 && tag.above, "360px phone: the tab stays small and its name floats above as a tag", [s, tag]);
  await T.end();
  T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 390, height: 844 } } }); p = T.p;
  await p.addInitScript(() => { try { localStorage.setItem("pl-motion", JSON.stringify({ preset: "lively", tabs: 6, dock: ["home", "entries", "bills"], buzz: true })); } catch {} });
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(1500); s = await shape();
  T.check(s.per.join() === "3,3" && s.mid < 2 && s.mode === "tag", "six tabs: 3 on each side of the +, names as tags", s);
  await T.end();
})();
