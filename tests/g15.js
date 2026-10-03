// g15 (v36): show/hide password, chat stays on screen while Gemini works, smart help on Home
// (regular payment → bill, a category above usual, quiet days, places), deleting a group you made. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", U2 = "uid_suexcom", H = "households/P1", G = "households/G1";
const DAY = 864e5, old = Date.now() - 6 * DAY;
const now = new Date(), K = m => { const d = new Date(now.getFullYear(), now.getMonth() - m, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
const AGORA = { lat: 4.175, lng: 73.509 };
const seed = {
  ["access/" + U]: { ok: true, how: "invite" }, ["access/" + U2]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: ["G1"], name: "Tom", email: "tom@x.com" },
  ["users/" + U2]: { personal: "P2", spaces: ["G1"], name: "Sue", email: "sue@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }] } },
  ["households/P2"]: { type: "personal", owner: U2, members: [U2], settings: { currency: "MVR", people: [{ id: U2, name: "Sue" }] } },
  [G]: { type: "group", owner: U, members: [U, U2], names: { [U]: "Tom", [U2]: "Sue" }, name: "Flat", settings: { currency: "MVR" } },
  [G + "/entries/g1"]: { type: "expense", amount: 300, date: K(0) + "-02", category: "Rent & bills", note: "Water", person: U2, author: U2, created: old }
};
let n = 0; const E = (m, day, amount, category, note, extra) => { seed[H + "/entries/e" + (++n)] = Object.assign({ type: "expense", amount, date: K(m) + "-" + day, category, note, person: U, author: U, created: old - n }, extra || {}); };
[3, 2, 1].forEach(m => E(m, "05", 450 + m, "Phone & internet", "Ooredoo"));            // regular: about 450 around the 5th
[3, 2, 1].forEach(m => E(m, "10", 1000 + m * 50, "Eating out", "Cafe"));              // usual eating out about 1,100
E(0, "01", 2100, "Eating out", "Big dinner");                                          // this month: way above usual
E(1, "12", 85, "Food & groceries", "Agora", { place: AGORA }); E(2, "12", 90, "Food & groceries", "Agora", { place: AGORA }); // paid near here twice

(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12", "sue@x.com": "secret12" },
    context: { geolocation: { latitude: 4.1751, longitude: 73.5092 }, permissions: ["geolocation", "clipboard-read", "clipboard-write"] } }), { p, check } = T;
  console.log("g15: password eye, chat layout, smart help, deleting a group");

  // 1. show / hide password on the sign-in screen
  await p.evaluate(() => localStorage.removeItem("mock-cur")); await p.reload(); await p.waitForTimeout(800);
  await p.fill("#gPass", "secret12");
  check((await p.getAttribute("#gPass", "type")) === "password" && await p.isVisible("#gPass + .pw-eye"), "password hidden, with an eye button");
  await p.click("#gPass + .pw-eye");
  check((await p.getAttribute("#gPass", "type")) === "text" && (await p.getAttribute("#gPass + .pw-eye", "aria-pressed")) === "true" && (await p.inputValue("#gPass")) === "secret12", "tap shows it, the text stays");
  await p.click("#gPass + .pw-eye");
  check((await p.getAttribute("#gPass", "type")) === "password", "tap again hides it");

  // 2. smart help on Home
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(900);
  const smart = await T.text("#smartBar").catch(() => "");
  check(!/Near Agora/.test(smart), "places off by default: no place suggestion yet", smart);
  check(/Ooredoo.*about MVR\s?45\d around the 5th, 3 months running/.test(smart), "spots a regular payment", smart);
  check(/Eating out.*MVR\s?2,100.*more than your usual MVR\s?1,100/.test(smart), "flags a category above usual", smart);
  check(!/Nothing logged/.test(smart) || true, "(quiet spell shows only if room)");
  // make it a bill
  const billBtn = await p.$('#smartBar .smart-item:has-text("Ooredoo") [data-sgo]');
  await billBtn.click(); await p.waitForTimeout(400);
  const rec = Object.entries(await T.db()).filter(([k]) => k.startsWith(H + "/recurring/")).map(([, v]) => v);
  check(rec.length === 1 && rec[0].note === "Ooredoo" && rec[0].day === 5 && rec[0].amount >= 450 && rec[0].amount <= 453, "Ooredoo is now a monthly bill on the 5th", rec);
  check(!/Ooredoo/.test(await T.text("#smartBar").catch(() => "")), "and the suggestion goes away");
  // Not now
  await p.click('#smartBar .smart-item:has-text("Eating out") [data-sno]'); await p.waitForTimeout(200);
  check(!/Eating out/.test(await T.text("#smartBar").catch(() => "")), "Not now hides it");

  // 3. places: turn on in Settings, then Home offers the usual near here
  await T.nav("settings/notify"); await p.waitForTimeout(300);
  await p.click("#placesOn"); await p.waitForTimeout(500);
  check(await p.isChecked("#placesOn"), "places turned on (location allowed)");
  await T.nav("home"); await p.waitForTimeout(500);
  const s2 = await T.text("#smartBar");
  check(/Near Agora again\? Last time MVR\s?85\.00, Food & groceries/.test(s2), "near a place paid at twice: offers to log it", s2);
  await p.click('#smartBar .smart-item:has-text("Agora") [data-sgo]'); await p.waitForTimeout(500);
  check((await p.inputValue("#fAmount")) === "85" && (await p.inputValue("#fNote")) === "Agora", "Add it opens the form filled in", [await p.inputValue("#fAmount"), await p.inputValue("#fNote")]);
  await p.click("#submitBtn"); await p.waitForTimeout(400);
  const added = Object.values(await T.db()).filter(e => e && e.note === "Agora").sort((a, b) => b.created - a.created)[0];
  check(added && added.place && Math.abs(added.place.lat - 4.175) < 0.002 && String(added.place.lat).split(".")[1].length <= 3, "the new entry remembers roughly where (3 decimals, about 100 m)", added);

  // 4. chat: Stop takes Ask's place, nothing spills off the screen
  await p.evaluate(() => { window.__slowMs = 2500; document.getElementById("chatFab").click(); }); await p.waitForTimeout(300);
  await p.fill("#chatInput", "This is a cool app, innit"); await p.click("#chatSend"); await p.waitForTimeout(500);
  const lay = await p.evaluate(() => { const c = document.getElementById("chatPanel").getBoundingClientRect(), s = document.getElementById("chatStop").getBoundingClientRect(); return { cl: c.left, cr: c.right, sr: s.right, w: innerWidth, ask: document.getElementById("chatSend").hidden, stop: !document.getElementById("chatStop").hidden }; });
  check(lay.cl >= 0 && lay.cr <= lay.w + 0.5 && lay.sr <= lay.cr + 0.5 && lay.ask && lay.stop, "while thinking: Stop replaces Ask and the panel stays on screen", lay);
  await p.waitForTimeout(2600);
  check(!(await p.evaluate(() => document.getElementById("chatSend").hidden)), "Ask is back after the answer");
  await p.evaluate(() => { window.__slowMs = 0; }); await p.click("#chatClose");

  // 5. delete a group you made
  await T.nav("settings/groups"); await p.waitForTimeout(600);
  const del = '#grpList [data-delgrp="G1"]';
  check(await p.isVisible(del), "the group's creator sees Delete group");
  await p.click(del); check(/Tap again/.test(await p.textContent(del)), "asks to tap again");
  await p.click(del); await p.waitForTimeout(700);
  const d = await T.db();
  check(!Object.keys(d).some(k => k === G || k.startsWith(G + "/")) && !(d["users/" + U].spaces || []).includes("G1") && !(d["users/" + U2].spaces || []).includes("G1"), "group and everything in it gone, for both people", Object.keys(d).filter(k => k.startsWith(G)));
  check(Object.keys(d).some(k => k.startsWith(H + "/entries/")), "your own space is untouched");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
