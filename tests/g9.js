// g9: sending money between people in a shared group: the receiver checks and accepts it into their own income.
const { start, loadState } = require("./lib");

(async () => {
  const T = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12", "lina@x.com": "secret12" } }), { p, check } = T;
  console.log("g9: transfers between people");
  const personal = async who => (await T.db())["users/uid_" + who + "xcom"].personal;
  const entriesOf = async who => { const d = await T.db(), pid = await personal(who); return Object.keys(d).filter(k => k.startsWith("households/" + pid + "/entries/")).map(k => Object.assign({ id: k.split("/").pop() }, d[k])); };
  // Lina passes on fees to Adam (not her spending)
  await T.login("lina@x.com", "#entries");
  check(await T.visible("[data-xfer]"), "Send money link on the Entries page");
  await p.click("[data-xfer]"); await p.waitForTimeout(500);
  const to = await p.$$eval("#xsTo option", o => o.map(x => x.textContent));
  check(to.length === 2 && /Adam/.test(to[0]) && /by email/.test(to[1]), "Lina can send to Adam, or find someone by email", to);
  await p.selectOption("#xsTo", "__find"); await p.fill("#xsEmail", "nobody@x.com"); await p.click("#xsFind"); await p.waitForTimeout(300);
  check(/Nobody with that email/.test(await p.textContent("#xsErr")), "an unknown email is refused", await p.textContent("#xsErr"));
  await p.fill("#xsEmail", "adam@x.com"); await p.click("#xsFind"); await p.waitForTimeout(400);
  check((await p.inputValue("#xsTo")) === "uid_adamxcom" && (await p.$eval("#xsFindRow", e => e.hidden)), "found by email and picked", await p.inputValue("#xsTo"));
  await p.fill("#xsAmt", "2500"); await p.fill("#xsNote", "Fees from Aisha's mum"); await p.click("#xsSend"); await p.waitForTimeout(300);
  check(/Choose how it counts/.test(await p.textContent("#xsErr")), "asks how it counts on her side");
  await p.selectOption("#xsSide", "__none"); await p.click("#xsSend"); await p.waitForTimeout(700);
  check(!(await T.visible("#xferSendWrap")), "sheet closes after sending");
  check((await p.evaluate(() => (window.__notified || []).length)) === 1 && !(await p.evaluate(() => window.__notified[0].gid)), "notification requested (direct, no group)");
  check(Object.keys(await T.db()).some(k => /^transfers\/[^/]+$/.test(k)), "saved as a direct transfer, not in a group");
  const sulBefore = (await entriesOf("lina")).length;
  // a second one that is her spending
  await p.click("[data-xfer]"); await p.waitForTimeout(400);
  await p.fill("#xsAmt", "300"); await p.fill("#xsNote", "Lunch"); await p.selectOption("#xsSide", "exp:Eating out"); await p.click("#xsSend"); await p.waitForTimeout(700);
  const sulE = await entriesOf("lina");
  check(sulE.length === sulBefore + 1 && sulE.some(e => e.type === "expense" && e.category === "Eating out" && /To Adam: Lunch/.test(e.note)), "her spending recorded on her side", sulE.map(e => e.note));
  // Adam gets two cards
  await T.login("adam@x.com", "#home"); await p.waitForTimeout(500);
  check(await T.visible("#xferBar"), "Adam sees money sent to him");
  check((await p.$$eval(".xfer-card", c => c.length)) === 2 && /Lina sent you MVR\s?2,500\.00/.test(await T.text("#xferBar")), "two cards, first from Lina for 2,500", await T.text("#xferBar"));
  await p.fill(".xfer-card[data-x='0'] [data-xk=note]", "Fees: Aisha, October"); await p.click(".xfer-card[data-x='0'] [data-xok]"); await p.waitForTimeout(600);
  let fe = await entriesOf("adam");
  const inc = fe.find(e => e.source === "transfer");
  check(inc && inc.type === "income" && inc.amount === 2500 && inc.category === "Side income" && inc.note === "From Lina: Fees: Aisha, October", "accepted into his own income with his edited note", inc);
  check((await p.$$eval(".xfer-card", c => c.length)) === 1, "one card left");
  await p.click(".xfer-card [data-xno]"); await p.waitForTimeout(500);
  check(!(await T.visible("#xferBar")), "declined: no cards left");
  fe = await entriesOf("adam");
  check(fe.filter(e => e.source === "transfer").length === 1, "declining adds nothing");
  // nothing shows in the group's entries, and cards don't come back
  const d = await T.db();
  check(!Object.keys(d).some(k => k.startsWith("households/HH1/entries/") && d[k].source === "transfer"), "nothing added to the group's entries");
  await T.login("adam@x.com"); await p.waitForTimeout(500);
  check(!(await T.visible("#xferBar")), "answered transfers don't come back");
  // Adam chose "automatically next time": the next one from Lina is added for him, no card
  check(((await T.db())["households/" + await personal("adam")].settings.xferRules || {}).uid_linaxcom.cat === "Side income", "Adam's choice is remembered");
  await T.login("lina@x.com", "#entries");
  await p.click("[data-xfer]"); await p.waitForTimeout(400);
  await p.fill("#xsAmt", "700"); await p.fill("#xsNote", "Book money"); await p.selectOption("#xsSide", "__none"); await p.click("#xsSend"); await p.waitForTimeout(600);
  await T.login("adam@x.com", "#entries"); await p.waitForTimeout(800);
  const auto = (await entriesOf("adam")).find(e => e.amount === 700 && e.source === "transfer");
  check(auto && auto.category === "Side income" && auto.note === "From Lina: Book money" && !(await p.$(".xfer-card [data-xok]")), "added automatically, no card", auto);
  check(/Added to your income/.test(await p.textContent("#toast")), "and he's told", await p.textContent("#toast"));
  await p.evaluate(id => document.querySelector('[data-edit="' + id + '"]').click(), auto.id); await p.waitForTimeout(300);
  check(await p.$eval("#fAmount", e => e.readOnly) && /amount stays what was sent/.test(await p.textContent("#srcHint")), "he can edit it, but not the amount");
  await p.selectOption("#fCatSel", "Gift"); await p.click("#submitBtn"); await p.waitForTimeout(300);
  const ed = (await entriesOf("adam")).find(e => e.id === auto.id);
  check(ed.category === "Gift" && ed.amount === 700 && ed.source === "transfer", "category changed, amount and source kept", ed);
  // notification setting
  await T.nav("settings/notify"); await p.waitForTimeout(400);
  await p.click("#ntXfer"); await p.waitForTimeout(400);
  check((await T.db())["users/uid_adamxcom"].notify.transfers === false, "can turn off money notifications");
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
