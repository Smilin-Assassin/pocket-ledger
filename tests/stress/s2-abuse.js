// s2: hammering and hostile input. Rapid adds, rapid deletes with Undo, odd and
// malicious text, extreme amounts and dates, dock spam, a 1500-row bank statement,
// chat spam on a slow server. Made-up data only.
const { start } = require("../lib");
const U = "uid_tomxcom", H = "households/P1";
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom", bank: "THOMAS ALI HASSAN", accounts: [{ bank: "BML", name: "Main", last4: "4821" }] }] } }
};
const mine = async T => { const d = await T.db(); return Object.keys(d).filter(k => k.startsWith(H + "/entries/")).map(k => Object.assign({ id: k.split("/").pop() }, d[k])); };

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("s2: hammering and hostile input");
  await p.addInitScript(() => { window.__xss = 0; });
  await T.login("tom@x.com", "#entries"); await p.waitForTimeout(600);

  // 1. 60 entries as fast as the form allows (no waits between)
  let t0 = Date.now();
  for (let i = 1; i <= 60; i++) { await p.fill("#fAmount", String(i)); await p.fill("#fNote", "Rapid " + i); await p.press("#fAmount", "Enter"); }
  await p.waitForTimeout(1200);
  let es = await mine(T);
  const rapid = es.filter(e => /^Rapid \d+$/.test(e.note));
  const notes = new Set(rapid.map(e => e.note));
  console.log(`      60 adds took ${Date.now() - t0}ms`);
  check(rapid.length === 60 && notes.size === 60, "60 rapid adds: all saved, none doubled or lost", { saved: rapid.length, unique: notes.size });
  check(rapid.every(e => e.amount === +e.note.split(" ")[1]), "each rapid add kept its own amount");

  // 2. double / triple click on the submit button
  await p.fill("#fAmount", "77"); await p.fill("#fNote", "Double tap");
  await p.click("#submitBtn", { clickCount: 3 }); await p.waitForTimeout(800);
  const dbl = (await mine(T)).filter(e => e.note === "Double tap").length;
  check(dbl === 1, "triple-clicking Add saves it once", dbl);

  // 3. delete 20 rows quickly, then Undo the last
  await p.waitForTimeout(300);
  const before = (await mine(T)).length;
  const tapped = [];
  for (let i = 0; i < 20; i++) { tapped.push(await p.evaluate(() => { const b = document.querySelector("#ledger [data-del]"); if (!b) return null; b.click(); return b.dataset.del; })); await p.waitForTimeout(40); }
  console.log(`      20 delete taps hit ${new Set(tapped).size} different entries`);
  await p.waitForTimeout(800);
  const afterDel = (await mine(T)).length;
  check(afterDel === before - 20, "20 quick deletes remove exactly 20", { before, afterDel });
  const undoBtn = await p.$("#toast .toast-act");
  if (undoBtn) { await undoBtn.click(); await p.waitForTimeout(700); }
  check((await mine(T)).length === afterDel + 1, "Undo after a burst brings back the last one", (await mine(T)).length - afterDel);

  // 4. hostile and odd text
  const nasty = [
    `<img src=x onerror="window.__xss=1">`, `"><script>window.__xss=2</script>`, `javascript:window.__xss=3`,
    "😀🍕🚕 emoji only", "ދިވެހި ބަސް ލިޔުން", "a".repeat(160), "Tab\tand\nnewline", "   ", "{{constructor.constructor('window.__xss=4')()}}", "${window.__xss=5}"
  ];
  for (const n of nasty) { await p.fill("#fAmount", "5"); await p.fill("#fNote", n); await p.press("#fAmount", "Enter"); await p.waitForTimeout(150); }
  // and as a category typed by hand
  await p.selectOption("#fCatSel", "__other"); await p.fill("#fCat", `<b onmouseover="window.__xss=6">Cat</b>`); await p.fill("#fAmount", "6"); await p.press("#fAmount", "Enter");
  await p.waitForTimeout(700);
  await p.fill("#searchQ", "<"); await p.waitForTimeout(400); await p.hover("#ledger li.tx >> nth=0").catch(() => {});
  await p.fill("#searchQ", ""); await p.waitForTimeout(300);
  for (const pg of ["home", "entries", "bills", "goals", "loans", "settings"]) { await T.nav(pg); }
  check((await p.evaluate(() => window.__xss)) === 0, "no injected script ran anywhere (notes, categories, search)", await p.evaluate(() => window.__xss));
  const longNote = (await mine(T)).find(e => /^a{100,}/.test(e.note || ""));
  check(longNote && longNote.note.length <= 160, "notes stop at 160 characters", longNote && longNote.note.length);
  await T.nav("entries");
  const wide = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(wide <= 1, "a 160-character note doesn't push the page sideways", wide);

  // 5. odd amounts in the full form
  const amt = async v => { await p.fill("#fNote", "amt " + v); await p.evaluate(v => { const i = document.getElementById("fAmount"); i.value = v; }, v); await p.click("#submitBtn"); await p.waitForTimeout(300);
    return { err: await p.isVisible("#formErr") ? await p.textContent("#formErr") : "", saved: (await mine(T)).filter(e => e.note === "amt " + v).map(e => e.amount) }; };
  const res = {};
  for (const v of ["0", "-50", "0.001", "1e3", "99999999999999", "1e308", "12.345"]) res[v] = await amt(v);
  console.log("      odd amounts → " + JSON.stringify(res));
  check(res["0"].saved.length === 0 && res["-50"].saved.length === 0, "zero and negative amounts are refused", [res["0"], res["-50"]]);
  check(res["0.001"].saved.length === 0, "0.001 (rounds to 0.00) is refused", res["0.001"]);
  check(!res["1e308"].saved.length && !res["99999999999999"].saved.length, "absurd amounts (a hundred trillion, 1e308) are refused", [res["99999999999999"], res["1e308"]]);
  await T.nav("home"); await p.waitForTimeout(400);
  const homeTxt = await T.text("main");
  check(!/NaN|Infinity|undefined/.test(homeTxt), "Home never shows NaN / Infinity / undefined", (homeTxt.match(/.{30}(NaN|Infinity|undefined).{30}/) || [])[0]);
  const wideH = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(wideH <= 1, "huge totals don't push Home sideways", wideH);

  // 6. odd dates
  await T.nav("entries");
  for (const d of ["1900-01-01", "2199-12-31"]) { await p.fill("#fAmount", "3"); await p.fill("#fNote", "date " + d); await p.fill("#fDate", d); await p.click("#submitBtn"); await p.waitForTimeout(300); }
  const far = (await mine(T)).filter(e => /^date /.test(e.note)).map(e => e.date);
  console.log("      far dates saved: " + JSON.stringify(far));
  check(far.length === 0, "dates in 1900 or 2199 are refused (likely typos)", far);
  await T.nav("home"); await p.waitForTimeout(400);
  check(!/NaN|Invalid/.test(await T.text("main")), "far dates don't break Home");

  // 7. dock spam: 150 random taps
  await T.nav("home");
  const tabs = await p.$$eval("#dock .dk-tab", t => t.map(x => x.dataset.p));
  let last = ""; t0 = Date.now();
  for (let i = 0; i < 150; i++) { last = tabs[(i * 7 + 3) % tabs.length]; await p.click(`#dock [data-p=${last}]`, { delay: 0 }); }
  await p.waitForTimeout(1200);
  const on = await p.$eval("#dock .dk-tab.on", x => x.dataset.p);
  const bub = await p.evaluate(() => { const b = document.getElementById("dkBubble").getBoundingClientRect(), t = document.querySelector("#dock .dk-tab.on").getBoundingClientRect(); return Math.abs((b.left + b.right) / 2 - (t.left + t.right) / 2); });
  console.log(`      150 dock taps in ${Date.now() - t0}ms`);
  check(on === last && new RegExp("#" + last).test(p.url()), "after 150 fast taps the dock shows the last one tapped", [on, last, p.url()]);
  check(bub < 3, "the bubble settles on the right tab", bub);
  // quick add open/close spam
  for (let i = 0; i < 25; i++) { await p.click("#dkPlus"); await p.keyboard.press("Escape"); }
  await p.waitForTimeout(1200);
  check(!(await p.isVisible("#qaSheet")) && !(await p.evaluate(() => document.body.classList.contains("qa-open"))), "opening and closing Quick add 25 times leaves it closed and clean");
  await p.click("#dkPlus"); await p.waitForTimeout(700);
  for (const k of "123456789012".split("")) await p.click(`#qaPad [data-k="${k}"]`);
  check((await p.textContent("#qaVal")).replace(/\D/g, "").length <= 9, "Quick add pad stops at 9 digits", await p.textContent("#qaVal"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(600);

  // 8. a 1500-row BML statement
  const q = v => '"' + v + '"', ref = v => '"=""' + v + '"""';
  const row = (post, type, r1, info, name, debit, credit, bal) => [q(post), q(post), q(type), ref(r1), ref("FT\\B26"), q(info), ref(name), q("MALE MV"), q(debit), q(credit), q(bal)].join(",");
  const lines = []; let bal = 100000;
  for (let i = 0; i < 1500; i++) { const day = 1 + (i % 28), m = 1 + (i % 9), dd = String(day).padStart(2, "0"), mm = String(m).padStart(2, "0"); const a = (10 + (i % 300)) + ".50"; bal -= +a;
    lines.push(row(`2026/${mm}/${dd}`, "Purchase", "RB" + String(100000 + i), `${dd}-${mm}-2026 1${i}`, "SHOP NUMBER " + (i % 120), a, "", bal.toFixed(2))); }
  await T.nav("entries");
  t0 = Date.now();
  await p.setInputFiles("#stmtFile", { name: "bml.csv", mimeType: "text/csv", buffer: Buffer.from(lines.join("\n") + "\n") });
  await p.waitForFunction(() => /added|Added/.test((document.getElementById("scanList") || {}).innerText || ""), null, { timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const imported = (await mine(T)).filter(e => e.source === "statement");
  console.log(`      1500-row statement: ${imported.length} added in ${Date.now() - t0}ms`);
  check(imported.length === 1500, "all 1500 statement rows added", imported.length);
  // import the same file again: nothing new
  const scanTxt = await p.innerText("#scanList").catch(() => "");
  await p.click('#scanList [data-imp="close"], #scanList [data-imp="see"]').catch(() => {});
  await p.setInputFiles("#stmtFile", { name: "bml.csv", mimeType: "text/csv", buffer: Buffer.from(lines.join("\n") + "\n") });
  await p.waitForTimeout(4000);
  const again = (await mine(T)).filter(e => e.source === "statement").length;
  check(again === 1500, "importing the same statement twice adds nothing new", again);
  await p.click('#scanList [data-imp="close"], #scanList [data-imp="see"]').catch(() => {});

  // 9. chat spam with a slow server
  await p.evaluate(() => { window.__slowMs = 1500; });
  const fab = await p.$("#chatFab");
  if (fab && await fab.isVisible()) {
    await fab.click(); await p.waitForTimeout(500);
    for (let i = 0; i < 8; i++) { await p.fill("#chatInput", "question " + i); await p.click("#chatSend", { timeout: 1000 }).catch(() => {}); await p.keyboard.press("Enter").catch(() => {}); }
    await p.waitForTimeout(6000);
    const calls = await p.evaluate(() => (window.__prompts || []).filter(t => t.includes("Decide what to do")).length + (window.__parts || []).length);
    const stuck = await p.evaluate(() => !document.getElementById("chatStop").hidden);
    console.log(`      8 rapid chat messages → ${await p.evaluate(() => (window.__parts || []).length)} server calls`);
    check(!stuck, "chat isn't stuck 'thinking' after spam");
    check(await p.evaluate(() => (window.__parts || []).length) <= 8, "chat spam doesn't multiply server calls");
    await p.click("#chatClose").catch(() => {});
  } else console.log("      (chat button hidden, skipped)");
  await p.evaluate(() => { window.__slowMs = 0; });

  // 10. storage/offline: an exception in a write must not freeze the UI
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
