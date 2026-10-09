// g21 (v45): dropdown with the keyboard open, swipe between tabs, same title spot on every page, Erase entries,
// text size slider, Security (PIN, pattern, password), loan cards, Quick Add category guess. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const now = new Date(), pad = n => String(n).padStart(2, "0"), K = now.getFullYear() + "-" + pad(now.getMonth() + 1);
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }] } },
  [H + "/loans/L1"]: { direction: "borrowed", counterparty: "Sara", amount: 2000, date: K + "-02", due: "", person: U, author: U, inMonth: false },
  [H + "/loans/L2"]: { direction: "lent", counterparty: "Ali", amount: 300, date: K + "-03", due: "", person: U, author: U, inMonth: false },
  [H + "/entries/ls"]: { type: "income", amount: 2000, date: K + "-02", category: "Loan received", note: "Loan from Sara", person: U, author: U, created: 1, loanId: "L1", loanRole: "start" }
};
let n = 0; const E = (day, amount, category, note) => { seed[H + "/entries/e" + (++n)] = { type: "expense", amount, date: K + "-" + pad(day), category, note, person: U, author: U, created: Date.now() - 864e5 - n * 1000 }; };
E(2, 120, "Food & groceries", "Agora"); E(3, 80, "Food & groceries", "Agora"); E(4, 60, "Transport", "Taxi"); E(5, 40, "Transport", "Taxi"); E(6, 25, "Shopping", "Pens");

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" }, context: { viewport: { width: 412, height: 900 }, hasTouch: true } }), { p, check } = T;
  console.log("g21: keyboard dropdown, swipe, titles, erase, slider, security, loans, quick guess");
  await T.login("tom@x.com", "#entries"); await p.waitForTimeout(900);
  const tap = sel => p.click(`.pick-field:has(${sel})`);
  const entries = async () => Object.keys(await T.db()).filter(k => k.startsWith(H + "/entries/")).length;

  // 1. dropdown with the keyboard open: a height-only resize keeps it open and lined up
  await p.focus("#fAmount"); await p.waitForTimeout(100);
  await tap("#fCatSel"); await p.waitForTimeout(500);
  check(await p.isVisible("#pickPop"), "tapping the dropdown with a field focused opens it");
  await p.setViewportSize({ width: 412, height: 640 }); await p.waitForTimeout(700);
  const gap = await p.evaluate(() => { const f = document.getElementById("fCatSel").parentElement.getBoundingClientRect(), pp = document.getElementById("pickPop").getBoundingClientRect(); return { open: !document.getElementById("pickWrap").hidden, d: Math.round(Math.min(Math.abs(pp.top - f.bottom), Math.abs(f.top - pp.bottom))) }; });
  check(gap.open && gap.d <= 12, "the keyboard coming or going (height change) doesn't close it, and it stays attached", gap);
  await p.setViewportSize({ width: 360, height: 640 }); await p.waitForTimeout(500);
  check(!(await p.isVisible("#pickPop")), "turning the phone (width change) closes it");
  await p.setViewportSize({ width: 412, height: 900 }); await p.waitForTimeout(300);

  // 2. titles sit in the same place on every page
  const tops = {};
  for (const pg of ["home", "entries", "loans", "bills", "goals", "settings"]) { await T.nav(pg); await p.waitForTimeout(250); tops[pg] = await p.evaluate(() => { const r = document.getElementById("pageTitle").getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left)]; }); }
  const t0 = tops.home; check(Object.values(tops).every(t => Math.abs(t[0] - t0[0]) <= 1 && Math.abs(t[1] - t0[1]) <= 1), "the page title is in the same place on every page (phone)", tops);
  await p.setViewportSize({ width: 1280, height: 800 }); await p.waitForTimeout(300);
  const tl = {};
  for (const pg of ["home", "entries", "loans", "bills", "goals", "settings"]) { await T.nav(pg); await p.waitForTimeout(250); tl[pg] = await p.evaluate(() => { const r = document.getElementById("pageTitle").getBoundingClientRect(); return [Math.round(r.top), Math.round(r.left)]; }); }
  check(Object.values(tl).every(t => Math.abs(t[0] - tl.home[0]) <= 1 && Math.abs(t[1] - tl.home[1]) <= 1), "and on a laptop", tl);
  await p.setViewportSize({ width: 412, height: 900 }); await p.waitForTimeout(300);

  // 3. swipe between tabs (touch)
  const cdp = await p.context().newCDPSession(p);
  const swipe = async (x1, y1, x2, y2) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x1, y: y1 }] });
    for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x1 + (x2 - x1) * i / 6, y: y1 + (y2 - y1) * i / 6 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await p.waitForTimeout(500);
  };
  const hash = () => p.evaluate(() => location.hash);
  await T.nav("home"); await p.waitForTimeout(300);
  await swipe(300, 500, 120, 505);
  check((await hash()) === "#entries", "swiping left on Dashboard goes to the next tab (Entries)", await hash());
  await swipe(120, 500, 320, 500);
  check((await hash()) === "#home", "swiping right goes back", await hash());
  await swipe(300, 400, 280, 700);
  check((await hash()) === "#home", "a mostly vertical drag (scrolling) does nothing", await hash());
  await swipe(8, 500, 200, 500);
  check((await hash()) === "#home", "a swipe that starts at the screen edge is left to the phone's back gesture", await hash());
  await T.nav("entries"); await p.waitForTimeout(500);
  const row = await p.evaluate(() => { const li = document.querySelector("#ledger li.tx"); if (!li) return null; li.scrollIntoView({ block: "center" }); const r = li.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; });
  await p.waitForTimeout(300);
  if (row) { await swipe(row[0] + 60, row[1], row[0] - 100, row[1]); check(!!row && (await hash()) === "#entries", "swiping on an entry row (Edit/Delete) doesn't change page", await hash()); }
  const list = await p.evaluate(() => [...document.querySelectorAll("#dock .dk-tab")].map(t => t.dataset.p));
  await T.nav(list[list.length - 1]); await swipe(300, 500, 100, 500);
  check((await hash()) === "#" + list[list.length - 1], "on the last tab, swiping further does nothing", await hash());

  // 4. Quick add: category follows the note, from past entries, until you pick one
  await T.nav("home"); await p.click("#dkPlus"); await p.waitForTimeout(900);
  await p.click("#qaNoteBtn"); await p.fill("#qaNote", "Agora"); await p.waitForTimeout(200);
  check((await p.getAttribute('#qaChips [data-cat="Food & groceries"]', "aria-pressed")) === "true" && await p.isVisible("#qaHint"), "typing Agora in Quick add picks Food & groceries and says so", await p.textContent("#qaChips"));
  await p.click('#qaChips [data-cat="Shopping"]'); await p.fill("#qaNote", "Agora x"); await p.waitForTimeout(150);
  check((await p.getAttribute('#qaChips [data-cat="Shopping"]', "aria-pressed")) === "true" && !(await p.isVisible("#qaHint")), "once you pick a category yourself it stops guessing");
  await p.keyboard.press("Escape"); await p.click("#qaClose").catch(() => {}); await p.waitForTimeout(500);

  // 5. loans: bordered, spaced cards with a direction dot
  await T.nav("loans"); await p.waitForTimeout(400);
  const ln = await p.evaluate(() => { const c = [...document.querySelectorAll("#loanList .loan")]; const a = c[0].getBoundingClientRect(), b = c[1].getBoundingClientRect(); return { n: c.length, bw: parseFloat(getComputedStyle(c[0]).borderTopWidth), gap: Math.round(b.top - a.bottom), dots: document.querySelectorAll("#loanList .ldot").length }; });
  check(ln.n === 2 && ln.bw >= 1.5 && ln.gap >= 12 && ln.dots === 2, "each loan has a clear border, room around it and a direction dot", ln);

  // 6. text size slider: smooth, live preview, applies on release
  await T.nav("settings/look"); await p.waitForTimeout(500);
  check(!(await p.$("#fsSeg")) && await p.isVisible("#fsRange"), "Text size is a slider now");
  const before = await p.evaluate(() => getComputedStyle(document.body).zoom);
  await p.evaluate(() => { const r = document.getElementById("fsRange"); r.value = 112; r.dispatchEvent(new Event("input", { bubbles: true })); });
  const mid = await p.evaluate(() => ({ z: getComputedStyle(document.body).zoom, prev: document.getElementById("fsPrev").style.fontSize, val: document.getElementById("fsVal").textContent }));
  check(mid.z === before && /rem/.test(mid.prev) && mid.val === "112%", "dragging only grows the sample line (the page waits for release)", mid);
  await p.evaluate(() => document.getElementById("fsRange").dispatchEvent(new Event("change", { bubbles: true }))); await p.waitForTimeout(300);
  const after = await p.evaluate(() => ({ z: parseFloat(getComputedStyle(document.body).zoom), fs: document.documentElement.getAttribute("data-fs"), ls: localStorage.getItem("pl-fs") }));
  check(Math.abs(after.z - 1.12) < .01 && after.fs === "custom" && after.ls === "1.12", "letting go applies exactly 112% (not one of four steps)", after);
  await p.click("#fsReset"); await p.waitForTimeout(300);
  check(Math.abs(parseFloat(await p.evaluate(() => getComputedStyle(document.body).zoom)) - 1) < .01 && await p.isHidden("#fsReset"), "Reset goes back to Normal");
  check(!/on each side/.test(await p.textContent("#dockFit")) && /\+ sits in its own circle/.test(await p.textContent("#dockFit")), "the dock note describes the + as its own circle", await p.textContent("#dockFit"));

  // 7. erase entries
  await T.nav("settings/erase"); await p.waitForTimeout(500);
  const opts = await p.$$eval("#erCat option", o => o.map(x => x.textContent));
  check(opts.includes("Transport (2)") && opts.includes("Food & groceries (2)") && !opts.some(x => /Loan/.test(x)), "Erase lists categories with counts and leaves loans out", opts);
  check(/loan entry stays/.test(await p.textContent("#erState")), "and says the loan entry stays", await p.textContent("#erState"));
  await p.selectOption("#erCat", "Transport"); await p.click("#erCatBtn"); await p.waitForTimeout(200);
  check(await p.isDisabled("#erGo"), "Erase waits for you to type ERASE");
  await p.fill("#erWord", "erase"); check(!(await p.isDisabled("#erGo")), "typing erase (any case) unlocks it");
  const before2 = await entries();
  await p.click("#erGo"); await p.waitForTimeout(600);
  const dbA = await T.db();
  check(await entries() === before2 - 2 && !Object.values(dbA).some(d => d && d.category === "Transport" && d.date), "erasing Transport removes its 2 entries");
  check(Object.keys(dbA).filter(k => k.includes("/trash/entries__")).length >= 2, "they're in Recently deleted");
  await p.click("#toast .toast-act"); await p.waitForTimeout(600);
  check(await entries() === before2 && !Object.keys(await T.db()).some(k => k.includes("/trash/entries__")), "Undo brings them all back");
  await p.click("#erAllBtn"); await p.fill("#erWord", "ERASE"); await p.click("#erGo"); await p.waitForTimeout(600);
  const dbB = await T.db(), left = Object.keys(dbB).filter(k => k.startsWith(H + "/entries/"));
  check(left.length === 1 && left[0].endsWith("/ls"), "Erase everything leaves only the loan entry", left);
  await p.click("#toast .toast-act"); await p.waitForTimeout(600);
  check(await entries() === before2, "and Undo restores everything");

  // 8. security: PIN, password, pattern
  await T.nav("settings/lock"); await p.waitForTimeout(400);
  check(/Security/.test(await p.textContent("#set-lock h2")) && /Off/.test(await p.textContent("#lockState")), "Settings has Security, off to start");
  const bio = await p.isVisible("#lockBioRow"); check(!bio, "face or fingerprint is hidden until the lock is on", bio);
  await p.click("#lockOn"); await p.waitForTimeout(150);
  check((await p.$$eval("#lockMethod button", b => b.map(x => x.textContent))).join() === "PIN,Pattern,Password", "you can choose PIN, Pattern or Password");
  await p.fill("#lockPin1", "2468"); await p.fill("#lockPin2", "2468"); await p.click("#lockSave"); await p.waitForTimeout(400);
  const cfg1 = await p.evaluate(() => JSON.parse(localStorage.getItem("pl-lock")));
  check(cfg1.method === "pin" && cfg1.slow === true && !/2468/.test(JSON.stringify(cfg1)), "a PIN is saved as a salted slow hash, never as text", Object.keys(cfg1));
  await p.goto("about:blank"); await p.goto("http://localhost:8765/#settings"); await p.waitForTimeout(1500);
  check(await p.isVisible("#lock") && await p.isVisible("#lockPad") && await p.isHidden("#lockPwWrap"), "reopening shows the lock with the keypad");
  for (const k of "9999") await p.click(`#lockPad [data-k="${k}"]`); await p.waitForTimeout(300);
  check(await p.isVisible("#lock"), "a wrong PIN stays locked");
  for (const k of "2468") await p.click(`#lockPad [data-k="${k}"]`); await p.waitForTimeout(500);
  check(await p.isHidden("#lock"), "the right PIN opens it");
  // a pattern
  await T.nav("settings/lock"); await p.click("#lockChange"); await p.click('#lockMethod [data-m="pattern"]'); await p.waitForTimeout(200);
  const dot = async (sel, i) => p.evaluate(([s, i]) => { const r = document.querySelectorAll(s + " .pat-dot")[i].getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, [sel, i]);
  const draw = async (sel, idx) => { const pts = []; for (const i of idx) pts.push(await dot(sel, i)); await p.mouse.move(...pts[0]); await p.mouse.down(); for (const q of pts.slice(1)) await p.mouse.move(q[0], q[1], { steps: 4 }); await p.mouse.up(); await p.waitForTimeout(600); };
  await draw("#lsPatPad", [0, 1]); check(/at least 4/.test(await p.textContent("#lsPatHint")), "a 2-dot pattern is refused", await p.textContent("#lsPatHint"));
  await draw("#lsPatPad", [0, 1, 2, 5]); check(/once more/.test(await p.textContent("#lsPatHint")), "a good pattern asks you to draw it again");
  await draw("#lsPatPad", [0, 1, 2, 4]); check(/didn't match/.test(await p.textContent("#lsPatHint")), "a different second drawing is refused");
  await draw("#lsPatPad", [0, 1, 2, 5]); await draw("#lsPatPad", [0, 1, 2, 5]); await p.waitForTimeout(300);
  check((await p.evaluate(() => JSON.parse(localStorage.getItem("pl-lock")).method)) === "pattern", "drawing it twice saves the pattern");
  await p.goto("about:blank"); await p.goto("http://localhost:8765/#settings"); await p.waitForTimeout(1500);
  check(await p.isVisible("#lockPatPad") && await p.isHidden("#lockPad"), "reopening shows the pattern pad");
  await draw("#lockPatPad", [8, 7, 6, 3]); check(await p.isVisible("#lock"), "a wrong pattern stays locked");
  await draw("#lockPatPad", [0, 1, 2, 5]); check(await p.isHidden("#lock"), "the right pattern opens it");
  // a password
  await T.nav("settings/lock"); await p.click("#lockChange"); await p.click('#lockMethod [data-m="password"]');
  await p.fill("#lockPw1", "abc"); await p.fill("#lockPw2", "abc"); await p.click("#lockSave"); await p.waitForTimeout(200);
  check((await p.evaluate(() => JSON.parse(localStorage.getItem("pl-lock")).method)) === "pattern", "a 3-letter password is refused");
  await p.fill("#lockPw1", "tiger-lily"); await p.fill("#lockPw2", "tiger-lily"); await p.click("#lockSave"); await p.waitForTimeout(500);
  await p.goto("about:blank"); await p.goto("http://localhost:8765/#settings"); await p.waitForTimeout(1500);
  check(await p.isVisible("#lockPw") && await p.isHidden("#lockPad"), "reopening shows the password box");
  await p.fill("#lockPw", "wrong-one"); await p.click("#lockPwGo"); await p.waitForTimeout(500);
  check(await p.isVisible("#lock") && /password isn't right/.test(await p.textContent("#lockErr")), "a wrong password says so");
  await p.fill("#lockPw", "tiger-lily"); await p.keyboard.press("Enter"); await p.waitForTimeout(500);
  check(await p.isHidden("#lock"), "the right password (Enter) opens it");
  await T.nav("settings/lock"); await p.click("#lockOff"); await p.waitForTimeout(200);
  check(!(await p.evaluate(() => localStorage.getItem("pl-lock"))), "Turn off removes the lock");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
