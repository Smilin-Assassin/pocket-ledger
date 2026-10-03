// g13: the Glass theme (Apple's Liquid Glass look): default on Apple devices, light only,
// the iOS 26 tab bar with the + beside it, shrinking while you scroll down, the switch to other themes.
const { start, loadState } = require("./lib");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const SHOTS = process.env.SHOTS;

(async () => {
  const T = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" }, context: { userAgent: IPHONE, colorScheme: "dark", viewport: { width: 393, height: 852 } } }), { p, check } = T;
  console.log("g13: Glass theme");
  await T.login("adam@x.com", "#home");
  const attr = n => p.evaluate(n => document.documentElement.getAttribute(n), n);
  check(await attr("data-preset") === "glass", "iPhone gets Glass by default", await attr("data-preset"));
  check(await attr("data-theme") === "light", "Glass stays light even when the phone is in dark mode", await attr("data-theme"));
  const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(bg === "rgb(242, 242, 247)", "Apple's grouped grey background", bg);
  const font = await p.evaluate(() => getComputedStyle(document.body).fontFamily);
  check(/-apple-system/.test(font) && !(await p.$("#plInter")), "Apple's system font, no web font on Apple devices", font);
  if (SHOTS) await p.screenshot({ path: SHOTS + "/glass-home.png" });

  // the tab bar: labels under every icon, the + is its own circle to the right of the bar
  const geo = await p.evaluate(() => { const d = document.getElementById("dock").getBoundingClientRect(), b = document.getElementById("dkPlus").getBoundingClientRect(); return { dR: d.right, bL: b.left, bR: b.right, dH: d.height, w: innerWidth, bW: b.width }; });
  check(geo.bL > geo.dR && geo.w - geo.bR >= 15 && geo.w - geo.bR <= 17, "the + sits beside the bar on the right", geo);
  check(Math.round(geo.dH) === 62 && Math.round(geo.bW) === 62, "bar and + are 62px tall", geo);
  const lbls = await p.$$eval("#dock .dk-tab .lbl", l => l.map(x => getComputedStyle(x).opacity));
  check(lbls.every(o => o === "1"), "every tab shows its label", lbls);
  const blob = await p.evaluate(() => { const b = document.getElementById("dkBlob"), t = document.querySelector("#dock .dk-tab.on"); return [parseFloat(b.style.width), t.offsetWidth]; });
  check(Math.abs(blob[0] - (blob[1] - 10)) < 3, "the highlight sits on the current tab", blob);

  // scrolling down shrinks the bar to the current tab; scrolling up brings it back
  await T.nav("entries"); await p.waitForTimeout(300);
  for (let i = 0; i < 25; i++) await T.addEntry("expense", 10 + i, 1);
  await p.evaluate(() => window.scrollTo(0, 200)); await p.waitForTimeout(700);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(700);
  // it follows the finger: a short scroll moves it part of the way, then it glides back to the closer end
  await p.evaluate(() => window.scrollTo(0, 400)); await p.waitForTimeout(700);
  await p.evaluate(() => window.scrollTo(0, 250)); await p.waitForTimeout(700);
  const part = await p.evaluate(() => new Promise(r => { requestAnimationFrame(() => { window.scrollBy(0, 24); requestAnimationFrame(() => requestAnimationFrame(() => r(parseFloat(document.getElementById("dockWrap").style.getPropertyValue("--p"))))); }); }));
  check(part > .2 && part < .8, "a short scroll shrinks the bar part of the way", part);
  await p.waitForTimeout(800);
  const back = await p.evaluate(() => parseFloat(document.getElementById("dockWrap").style.getPropertyValue("--p")));
  check(back === 0 || back === 1, "then it glides to fully open or fully shrunk", back);
  await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(700);
  await p.mouse.move(200, 300); await p.mouse.wheel(0, 700); await p.waitForTimeout(700);
  const minned = await p.evaluate(() => ({ min: document.getElementById("dockWrap").classList.contains("dk-min"), w: document.getElementById("dock").getBoundingClientRect().width }));
  check(minned.min && minned.w < 60, "scrolling down shrinks the bar", minned);
  if (SHOTS) await p.screenshot({ path: SHOTS + "/glass-min.png" });
  await p.mouse.wheel(0, -200); await p.waitForTimeout(700);
  check(!(await p.evaluate(() => document.getElementById("dockWrap").classList.contains("dk-min"))), "scrolling up brings it back");
  await p.mouse.wheel(0, 700); await p.waitForTimeout(700);
  const on = await p.$eval("#dock .dk-tab.on", t => { const r = t.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await p.mouse.click(on[0], on[1]); await p.waitForTimeout(700);
  check(!(await p.evaluate(() => document.getElementById("dockWrap").classList.contains("dk-min"))) && /#entries/.test(p.url()), "tapping the small bar opens it again", p.url());
  const blob2 = await p.evaluate(() => { const b = document.getElementById("dkBlob"), t = document.querySelector("#dock .dk-tab.on"); return [parseFloat(b.style.width), t.offsetWidth, getComputedStyle(b).opacity]; });
  check(Math.abs(blob2[0] - (blob2[1] - 10)) < 3 && blob2[2] === "1", "and the highlight is back on the tab", blob2);

  // the + still opens Quick add, and the hold shortcuts stay on screen
  await p.click("#dkPlus"); await p.waitForTimeout(800);
  check(await T.visible("#qaSheet"), "the + opens Quick add");
  if (SHOTS) await p.screenshot({ path: SHOTS + "/glass-quick.png" });
  await p.click("#qaX"); await p.waitForTimeout(800);

  // Settings: Glass is light only; picking another theme sticks
  await T.nav("settings/look"); await p.waitForTimeout(500);
  check(await p.$eval("#modeSeg button", b => b.disabled) && await T.visible("#glassNote"), "light/dark is off under Glass, with a note");
  if (SHOTS) { await p.evaluate(() => document.getElementById("set-look").scrollIntoView()); await p.waitForTimeout(300); await p.screenshot({ path: SHOTS + "/glass-settings.png" }); }
  await p.click('.theme-sw[data-preset="lagoon"]'); await p.waitForTimeout(500);
  check(await attr("data-preset") === null && await attr("data-theme") === "dark", "picking Lagoon on an iPhone works, and dark mode comes back", [await attr("data-preset"), await attr("data-theme")]);
  await p.reload(); await p.waitForTimeout(1300);
  check(await attr("data-preset") === null, "and it sticks after reopening");
  const geo2 = await p.evaluate(() => { const b = document.getElementById("dkPlus").getBoundingClientRect(); return Math.round(b.left + b.width / 2 - innerWidth / 2); });
  check(Math.abs(geo2) < 2, "other themes keep the + in the middle", geo2);
  await T.end();

  // Android: Glass is there to pick, with Inter instead of Apple's font
  const A = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" }, context: { userAgent: ANDROID } });
  await A.login("adam@x.com", "#home");
  check(await A.p.evaluate(() => document.documentElement.getAttribute("data-preset")) === null, "Android starts on Lagoon");
  await A.nav("settings/look"); await A.p.waitForTimeout(400);
  await A.p.click('.theme-sw[data-preset="glass"]'); await A.p.waitForTimeout(500);
  check(await A.p.evaluate(() => document.documentElement.getAttribute("data-preset")) === "glass" && !!(await A.p.$("#plInter")), "Android can pick Glass, which loads Inter");
  await A.end();
  // wide screens: the floating glass sidebar
  const W = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" }, context: { userAgent: IPHONE.replace("iPhone; CPU iPhone OS 26_0 like", "Macintosh; Intel Mac OS X 10_15_7) (KHTML"), viewport: { width: 1280, height: 820 } } });
  await W.login("adam@x.com", "#home");
  const nav = await W.p.evaluate(() => { const r = document.getElementById("nav").getBoundingClientRect(), s = getComputedStyle(document.getElementById("nav")); return [r.left, r.top, s.borderTopLeftRadius]; });
  check(nav[0] === 10 && nav[1] === 10 && nav[2] === "26px", "Mac: the side menu floats as a glass panel", nav);
  if (SHOTS) await W.p.screenshot({ path: SHOTS + "/glass-wide.png" });
  await W.end();
})();
