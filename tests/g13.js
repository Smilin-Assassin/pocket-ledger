// g13: the Glass theme (Apple's Liquid Glass look): default on Apple devices, light and dark (v37),
// the bar with the dip and bubble and the + beside it, the three themes and moving off old ones.
const { start, loadState } = require("./lib");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const SHOTS = process.env.SHOTS;

(async () => {
  const T = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" }, context: { userAgent: IPHONE, colorScheme: "dark", viewport: { width: 393, height: 852 } } }), { p, check } = T;
  console.log("g13: Glass theme");
  await T.login("adam@x.com", "#home");
  const attr = n => p.evaluate(n => document.documentElement.getAttribute(n), n);
  const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(await attr("data-preset") === "glass", "iPhone gets Glass by default", await attr("data-preset"));
  // v37: Glass follows the phone's light / dark setting
  check(await attr("data-theme") === "dark" && (await bg()) === "rgb(0, 0, 0)", "phone in dark mode: Glass goes dark, Apple's true black", [await attr("data-theme"), await bg()]);
  const card = await p.evaluate(() => getComputedStyle(document.querySelector("#pg-home .panel")).backgroundColor);
  check(card === "rgb(28, 28, 30)", "cards in Apple's dark grey", card);
  const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  check(/-apple-system/.test(font) && !(await p.$("#plInter")), "Apple's system font, no web font on Apple devices", font);
  if (SHOTS) await p.screenshot({ path: SHOTS + "/glass-dark.png" });
  await p.emulateMedia({ colorScheme: "light" }); await p.waitForTimeout(300);
  check(await attr("data-theme") === "light" && (await bg()) === "rgb(242, 242, 247)", "phone switches to light: Glass follows, Apple's grouped grey", [await attr("data-theme"), await bg()]);

  // the bar: a dip with the current tab's bubble; the + is its own circle to the right
  const geo = await p.evaluate(() => { const d = document.getElementById("dock").getBoundingClientRect(), b = document.getElementById("dkPlus").getBoundingClientRect(); return { dR: d.right, bL: b.left, bR: b.right, dH: d.height, w: innerWidth, bW: b.width }; });
  check(geo.bL > geo.dR && geo.w - geo.bR >= 11 && geo.w - geo.bR <= 17, "the + sits beside the bar on the right", geo);
  check(Math.round(geo.dH) === 64 && Math.round(geo.bW) === 62, "bar 64px, + 62px", geo);
  const lbls = await p.$$eval("#dock .dk-tab .lbl", l => l.map(x => getComputedStyle(x).opacity));
  check(lbls.every(o => o === "1"), "every tab shows its label", lbls);
  const bub = await p.evaluate(() => { const b = document.getElementById("dkBubble").getBoundingClientRect(), t = document.querySelector("#dock .dk-tab.on").getBoundingClientRect(), d = document.getElementById("dock").getBoundingClientRect(); return [Math.abs((b.left + b.right) / 2 - (t.left + t.right) / 2), b.top < d.top]; });
  check(bub[0] < 3 && bub[1], "the bubble sits over the current tab, rising out of the bar", bub);
  check(/blur/.test(await p.$eval("#dkBar", e => getComputedStyle(e).backdropFilter)), "the bar is glass");
  check(!(await p.evaluate(() => document.documentElement.hasAttribute("data-lens"))), "Safari keeps the plain glass (no lens filter)");
  // touching the + lights it up under the finger; letting go fades it
  const pb = await p.$eval("#dkPlus", e => { const r = e.getBoundingClientRect(); return [r.x + 20, r.y + 20]; });
  await p.mouse.move(pb[0], pb[1]); await p.mouse.down(); await p.waitForTimeout(150);
  const lit = await p.$eval("#dkPlus", e => e.classList.contains("lit"));
  await p.mouse.move(pb[0] + 200, pb[1] - 400); await p.mouse.up(); await p.waitForTimeout(600);
  check(lit && !(await p.$eval("#dkPlus", e => e.classList.contains("lit"))), "touch light on the + fades on release");
  await p.keyboard.press("Escape"); await T.nav("home"); await p.waitForTimeout(500);
  // tapping a tab moves the dip and bubble there
  await p.click("#dock [data-p=bills]"); await p.waitForTimeout(900);
  const moved = await p.evaluate(() => { const b = document.getElementById("dkBubble").getBoundingClientRect(), t = document.querySelector('#dock .dk-tab[data-p="bills"]').getBoundingClientRect(); return Math.abs((b.left + b.right) / 2 - (t.left + t.right) / 2); });
  check(/#bills/.test(p.url()) && moved < 3, "tapping Bills moves the bubble to it", moved);

  // the + still opens Quick add
  await p.click("#dkPlus"); await p.waitForTimeout(800);
  check(await T.visible("#qaSheet"), "the + opens Quick add");
  if (SHOTS) await p.screenshot({ path: SHOTS + "/glass-quick.png" });
  await p.click("#qaX"); await p.waitForTimeout(800);

  // Settings: three themes; Glass has Automatic / Light / Dark like the others
  await T.nav("settings/look"); await p.waitForTimeout(500);
  const themes = await p.$$eval(".theme-sw", b => b.map(x => x.dataset.preset));
  check(JSON.stringify(themes) === JSON.stringify(["glass", "sunset", "monsoon"]), "themes: Glass, Sunset, Monsoon", themes);
  check(!(await p.$eval("#modeSeg button", b => b.disabled)), "light/dark can be chosen under Glass");
  await p.click('#modeSeg [data-mode="dark"]'); await p.waitForTimeout(300);
  check(await attr("data-theme") === "dark", "choosing Dark makes Glass dark");
  await p.click('.theme-sw[data-preset="sunset"]'); await p.waitForTimeout(500);
  check(await attr("data-preset") === "sunset" && await attr("data-theme") === "dark", "picking Sunset on an iPhone works", [await attr("data-preset"), await attr("data-theme")]);
  await p.reload(); await p.waitForTimeout(1300);
  check(await attr("data-preset") === "sunset", "and it sticks after reopening");
  const geo2 = await p.evaluate(() => { const d = document.getElementById("dock").getBoundingClientRect(), b = document.getElementById("dkPlus").getBoundingClientRect(); return b.left > d.right; });
  check(geo2, "every theme has the + beside the bar");
  // an old theme choice (Lagoon) moves to Sunset
  await p.evaluate(() => { localStorage.setItem("pl-preset", "lagoon"); window.plApplyTheme(); });
  check(await attr("data-preset") === "sunset", "an old theme choice becomes Sunset", await attr("data-preset"));
  await T.end();

  // Android: Glass is there to pick, with Inter instead of Apple's font
  const A = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" }, context: { userAgent: ANDROID } });
  await A.login("adam@x.com", "#home");
  check(await A.p.evaluate(() => document.documentElement.getAttribute("data-preset")) === "sunset", "Android starts on Sunset");
  await A.nav("settings/look"); await A.p.waitForTimeout(400);
  await A.p.click('.theme-sw[data-preset="glass"]'); await A.p.waitForTimeout(500);
  check(await A.p.evaluate(() => document.documentElement.getAttribute("data-preset")) === "glass" && !!(await A.p.$("#plInter")), "Android can pick Glass, which loads Inter");
  await A.nav("home"); await A.p.waitForTimeout(800);
  const lens = await A.p.evaluate(() => ({ on: document.documentElement.hasAttribute("data-lens"), maps: [...document.querySelectorAll("#lensDefs filter")].map(f => f.id), bf: getComputedStyle(document.getElementById("dkBar")).backdropFilter }));
  check(lens.on && lens.maps.includes("lens-dock") && lens.maps.includes("lens-plus") && /url\("?#lens-dock/.test(lens.bf), "Android Chrome gets real lens edges on the glass", lens);
  await A.end();
  // wide screens: the floating glass sidebar
  const W = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" }, context: { userAgent: IPHONE.replace("iPhone; CPU iPhone OS 26_0 like", "Macintosh; Intel Mac OS X 10_15_7) (KHTML"), viewport: { width: 1280, height: 820 } } });
  await W.login("adam@x.com", "#home");
  const nav = await W.p.evaluate(() => { const r = document.getElementById("nav").getBoundingClientRect(), s = getComputedStyle(document.getElementById("nav")); return [r.left, r.top, s.borderTopLeftRadius]; });
  check(nav[0] === 10 && nav[1] === 10 && nav[2] === "26px", "Mac: the side menu floats as a glass panel", nav);
  if (SHOTS) await W.p.screenshot({ path: SHOTS + "/glass-wide.png" });
  await W.end();
})();
