// g30 (v71): Arcade, a second look beside Coral Dusk. Chosen in Settings › Appearance, always dark, remembered on this device,
// Coral Dusk stays the default and keeps its own Light and Dark; switching back restores it.
const { start, loadState, URL0 } = require("./lib");

(async () => {
  const T = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" }, context: { viewport: { width: 393, height: 852 } } }), { p, check } = T;
  console.log("g30: Arcade look");
  await T.login("adam@x.com", "#home");
  const attr = n => p.evaluate(n => document.documentElement.getAttribute(n), n);
  const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const reopen = async () => { await p.goto("about:blank"); await p.goto(URL0 + "#home"); await p.waitForTimeout(1300); };

  check(await attr("data-look") === "coral" && await attr("data-theme") === "light", "Coral Dusk light is still the default", [await attr("data-look"), await attr("data-theme")]);
  await T.nav("settings/look");
  const looks = await p.$$eval("#lookSeg button", b => b.map(x => x.textContent.trim()));
  check(JSON.stringify(looks) === '["Coral Dusk","Arcade"]', "Appearance offers Coral Dusk and Arcade", looks);
  check(await p.$eval('#lookSeg [data-look="coral"]', b => b.getAttribute("aria-pressed")) === "true", "Coral Dusk is marked as chosen");
  check(await p.$eval("#modeSeg", e => getComputedStyle(e).display) !== "none", "Light and Dark are offered with Coral Dusk");

  await p.click('#lookSeg [data-look="arcade"]'); await p.waitForTimeout(700);
  check(await attr("data-look") === "arcade" && await attr("data-theme") === "dark" && await bg() === "rgb(20, 18, 22)", "Arcade: always dark, deep plum page", [await attr("data-look"), await bg()]);
  check(await p.evaluate(() => localStorage.getItem("pl-look")) === "arcade", "saved on this device");
  check(await p.$eval("#modeSeg", e => getComputedStyle(e).display) === "none", "Light and Dark are hidden while Arcade is on");
  const f = await p.evaluate(() => ({ h: getComputedStyle(document.querySelector("h1, h2")).fontFamily, body: getComputedStyle(document.body).fontFamily, link: [...document.querySelectorAll('link[rel="stylesheet"]')].map(l => l.href).find(h => /fonts\.googleapis/.test(h)) || "" }));
  check(/^"?Chakra Petch/.test(f.h) && /^"?Nunito/.test(f.body) && /Chakra\+Petch/.test(f.link), "Chakra Petch for headings, Nunito for text", f);
  const sh = await p.evaluate(() => { const c = document.querySelector(".panel"); return { r: getComputedStyle(c).borderRadius, b: getComputedStyle(c).backgroundColor }; });
  check(sh.r === "6px" && sh.b === "rgb(30, 27, 38)", "small square corners, plum cards", sh);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no sideways scrolling in Arcade");
  await T.nav("home"); await p.waitForTimeout(500);
  const ring = await p.evaluate(() => { const r = document.getElementById("catRing"); return [...r.querySelectorAll("path.seg")].slice(0, 1).map(c => getComputedStyle(c).fill); });
  check(ring[0] === "rgb(255, 122, 69)", "the ring keeps the orange for the biggest category", ring);

  await reopen();
  check(await attr("data-look") === "arcade" && await attr("data-theme") === "dark", "Arcade stays after reopening");
  await T.nav("settings/look"); await p.click('#lookSeg [data-look="coral"]'); await p.waitForTimeout(700);
  check(await attr("data-look") === "coral" && await attr("data-theme") === "light" && await bg() !== "rgb(20, 18, 22)", "back to Coral Dusk light, nothing lost");
  check(!(await p.evaluate(() => localStorage.getItem("pl-look"))), "the choice is cleared");
  await p.click('#modeSeg [data-mode="dark"]'); await p.waitForTimeout(600);
  check(await attr("data-look") === "coral" && await attr("data-theme") === "dark" && await bg() === "rgb(18, 18, 20)", "Coral Dusk dark is unchanged (graphite)", await bg());
  check(T.errs.length === 0, "no errors", T.errs.slice(0, 3));
  await T.end();
})();
