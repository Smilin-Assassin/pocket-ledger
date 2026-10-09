// g22 (v46): the chat button and chat header use the Gemini star image. Made-up data.
const { start } = require("./lib");
const U = "uid_tomxcom", H = "households/P1";
const seed = {
  ["access/" + U]: { ok: true, how: "invite" },
  ["users/" + U]: { personal: "P1", spaces: [], name: "Tom", email: "tom@x.com" },
  [H]: { type: "personal", owner: U, members: [U], ai: { server: true }, settings: { currency: "MVR", opening: 0, openingBy: {}, people: [{ id: U, name: "Tom" }] } }
};
(async () => {
  const T = await start({ seed, users: { "tom@x.com": "secret12" } }), { p, check } = T;
  console.log("g22: Gemini star on the chat button");
  await T.login("tom@x.com", "#home"); await p.waitForTimeout(800);
  const ok = await p.$eval("#chatFab img.gem", i => i.complete && i.naturalWidth > 0);
  check(ok, "chat button shows the star image");
  const sz = await p.$eval("#chatFab", b => { const r = b.getBoundingClientRect(); return [r.width, r.height]; });
  check(sz[0] >= 44 && sz[1] >= 44, "button stays a good tap size", sz);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + "-fab.png" });
  await p.click("#chatFab"); await p.waitForTimeout(500);
  check(await p.$eval(".chat-head h2 img.gem", i => i.complete && i.naturalWidth > 0), "chat header shows the star too");
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT + "-chat.png" });
  check((await T.denied()).length === 0, "no rule denials", await T.denied());
  await T.end();
})();
