// g25 (v56): Monthly recurring expenses on the Bills page. Each one listed with its category and due day, one-tap Paid
// (fixed amounts, logs the usual amount, with Undo), Total / Paid so far / Still to pay, category subtotals, skipped,
// paused and money-in left out, month by month, and "left after bills" on the Dashboard. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const now = new Date(), pad = n => String(n).padStart(2, "0"), K = now.getFullYear() + "-" + pad(now.getMonth() + 1);
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }] } },
  [H + "/entries/e1"]: { type: "income", amount: 10000, date: K + "-01", category: "Salary", note: "Salary", person: U, author: U, created: 1 }
};
const R = (id, note, amount, day, category, extra) => { seed[H + "/recurring/" + id] = Object.assign({ type: "expense", amount, category, note, person: U, author: U, day, remindDays: 7, auto: false, startMonth: K, created: 10 }, extra || {}); };
R("rRent", "Rent", 8000, 1, "Rent & bills"); R("rPhone", "Phone", 250, 5, "Phone & internet"); R("rNet", "Internet", 600, 15, "Phone & internet"); R("rPower", "Electricity", 450, 20, "Rent & bills");
R("rWater", "Water", 100, 25, "Rent & bills", { skips: [K] });       // skipped this month: left out of the totals
R("rGym", "Gym", 300, 3, "Health", { paused: true });               // paused: not listed
R("rAllow", "Allowance in", 500, 2, "Salary", { type: "income" });  // money in: not an expense

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g25: monthly recurring expenses");
  await T.login("tom@x.com"); await p.waitForTimeout(600);
  const panel = () => T.text("#recMonth"), sums = () => p.$$eval("#recMonth .rm-sum > div", ds => ds.map(d => d.innerText.replace(/\n/g, " ")));
  await T.nav("bills"); await p.waitForTimeout(300);

  check(await T.visible("#monthNav"), "the Bills page has the month switcher now");
  check(/Monthly recurring expenses/.test(await panel()), "the section is called Monthly recurring expenses", await panel());
  const names = await p.$$eval("#recMonth .rm-row .rec-main b", bs => bs.map(b => b.textContent));
  check(JSON.stringify(names) === JSON.stringify(["Rent", "Phone", "Internet", "Electricity", "Water"]), "each is its own line, in due-day order; paused and money-in are left out", names);
  const s0 = await sums();
  check(/Total.*9,300\.00/.test(s0[0]) && /Paid so far.*0\.00/.test(s0[1]) && /Still to pay.*9,300\.00/.test(s0[2]), "Total 9,300, nothing paid yet, 9,300 to pay (skipped Water not counted)", s0);
  const cats = await T.text("#recMonth .rm-cats");
  check(/Rent & bills.*8,450\.00/.test(cats) && /Phone & internet.*850\.00/.test(cats), "a subtotal per category", cats);
  check(/skipped/.test(await T.text('#recMonth .rm-row:has-text("Water")')), "the skipped one says skipped");
  check(/Phone & internet, day 5/.test(await T.text('#recMonth .rm-row:has-text("Phone")')), "a line shows its category and due day");

  // one tap: Paid logs the usual amount, no typing
  await p.click('#recMonth [data-rmpay="rRent"]'); await p.waitForTimeout(500);
  const db = await T.db(), e = db[H + "/entries/rec-rRent-" + K];
  check(e && e.type === "expense" && e.amount === 8000 && e.category === "Rent & bills" && e.note === "Rent" && e.recurringId === "rRent", "Paid logs the 8,000 as spending in its category", e);
  const s1 = await sums();
  check(/9,300\.00/.test(s1[0]) && /Paid so far.*8,000\.00/.test(s1[1]) && /Still to pay.*1,300\.00/.test(s1[2]), "Paid so far 8,000, still to pay 1,300", s1);
  check(/Rent paid/.test(await p.textContent("#toast")) && await T.visible("#toast .toast-act"), "a toast says Rent paid, with Undo", await p.textContent("#toast"));
  await p.click("#toast .toast-act"); await p.waitForTimeout(500);
  check(!(await T.db())[H + "/entries/rec-rRent-" + K] && /Still to pay.*9,300\.00/.test((await sums())[2]), "Undo in the toast puts it back to still to pay", await sums());
  await p.click('#recMonth [data-rmpay="rRent"]'); await p.waitForTimeout(400);
  await p.click('#recMonth [data-rmundo="rRent"]'); await p.waitForTimeout(400);
  check(!(await T.db())[H + "/entries/rec-rRent-" + K], "Undo on the line unmarks it too");
  await p.click('#recMonth [data-rmpay="rRent"]'); await p.waitForTimeout(400);
  await p.click('#recMonth [data-rmunskip="rWater"]'); await p.waitForTimeout(400);
  const s2 = await sums();
  check(/Total.*9,400\.00/.test(s2[0]) && /Still to pay.*1,400\.00/.test(s2[2]), "Undo skip brings Water back into the totals", s2);
  await p.click('#recMonth [data-rmpay="rWater"]'); await p.waitForTimeout(300);

  // the Dashboard: left after bills
  await T.nav("home"); await p.waitForTimeout(500);
  const sub = await p.textContent("#leftSub");
  check(/MVR\s1,300 of bills still to pay, MVR\s600 after them\./.test(sub), "Dashboard: 1,300 of bills still to pay, 600 after them (10,000 - 8,000 - 100 = 1,900 left)", sub);

  // other months: next month starts with everything still to pay, last month had none
  await T.nav("bills"); await p.click("#nextM"); await p.waitForTimeout(400);
  const sn = await sums();
  check(/Total.*9,400\.00/.test(sn[0]) && /Still to pay.*9,400\.00/.test(sn[2]) && await T.visible('#recMonth [data-rmpay="rRent"]') && !(await T.visible('#recMonth [data-rmundo="rRent"]')), "next month: the same list (Water was only skipped this month), all still to pay", sn);
  await p.click("#prevM"); await p.click("#prevM"); await p.waitForTimeout(400);
  check(/Nothing recurring in/.test(await panel()), "a month before they started has nothing in it", await panel());
  await p.click("#nextM"); await p.waitForTimeout(300);

  // layout: no sideways scroll on a phone at any text size
  for (const z of [0.85, 1, 1.3]) {
    await p.evaluate(z => { document.documentElement.dataset.fs = "custom"; document.documentElement.style.setProperty("--fs-zoom", z); }, z); await p.waitForTimeout(250);
    const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, panel: document.getElementById("recMonth").scrollWidth - document.getElementById("recMonth").clientWidth }));
    check(w.sw <= w.cw + 1 && w.panel <= 1, "no sideways scroll at text size " + z, w);
  }
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
