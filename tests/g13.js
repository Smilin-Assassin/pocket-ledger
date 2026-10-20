// g13 (v50): Coral Dusk, the app's one look. Light by default on every device (no Automatic, no Apple-only
// theme), Dark chosen by hand and remembered, older theme choices land on light, the calm white
// Left to spend card, the spending ring on phones, the coral + beside the bar, and the new icon set.
const { start, loadState, URL0 } = require("./lib");
const fs = require("fs"), path = require("path");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";

(async () => {
  // an iPhone whose own setting is dark: the app still starts light (manual only)
  const T = await start({ seed: loadState("2"), users: { "adam@x.com": "secret12" }, context: { userAgent: IPHONE, colorScheme: "dark", viewport: { width: 393, height: 852 } } }), { p, check } = T;
  console.log("g13: Coral Dusk light and dark");
  await T.login("adam@x.com", "#home");
  const attr = n => p.evaluate(n => document.documentElement.getAttribute(n), n);
  const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const reopen = async () => { await p.goto("about:blank"); await p.goto(URL0 + "#home"); await p.waitForTimeout(1300); };

  check(await attr("data-preset") === "coral" && await attr("data-theme") === "light", "iPhone in dark mode still starts on Coral Dusk light", [await attr("data-preset"), await attr("data-theme")]);
  check(await bg() === "rgb(251, 247, 243)", "warm off-white page", await bg());
  check(await p.evaluate(() => document.querySelector('meta[name="theme-color"]').content) === "rgb(251, 247, 243)", "the phone's status bar takes the page colour");

  // older choices (Glass, Palm, Sunset, Automatic, pure black) all land on light Coral Dusk
  await p.evaluate(() => { localStorage.setItem("pl-preset", "glass"); localStorage.setItem("pl-mode", "auto"); localStorage.setItem("pl-amoled", "1"); window.plApplyTheme(); });
  check(await attr("data-preset") === "coral" && await attr("data-theme") === "light" && !(await p.evaluate(() => document.documentElement.hasAttribute("data-amoled"))), "an old Glass / Automatic / pure black choice becomes Coral Dusk light");
  await p.evaluate(() => { localStorage.setItem("pl-preset", "palm"); localStorage.setItem("pl-mode", ""); window.plApplyTheme(); });
  check(await attr("data-preset") === "coral", "an old Palm choice becomes Coral Dusk");

  // the calm card and the coral + (after the opening and the rolling number have finished)
  await p.waitForFunction(() => !document.querySelector(".odo, #splash"), null, { timeout: 5000 });
  const look = await p.evaluate(() => { const cs = s => getComputedStyle(document.querySelector(s));
    return { hero: cs(".summary .hero").backgroundColor + " " + cs(".summary .hero").backgroundImage, big: cs("#leftBig").color, add: cs('.summary .hero [data-go-add]').backgroundColor, plus: cs("#dkPlus").backgroundColor, bubble: cs(".dk-bubble").backgroundColor }; });
  check(look.hero === "rgb(255, 255, 255) none", "Left to spend sits on a calm white card", look.hero);
  check(look.big === "rgb(36, 26, 46)", "the amount is plain ink", look.big);
  check(look.add === "rgb(201, 70, 28)" && look.plus === "rgb(201, 70, 28)", "Add and the + are coral", look);
  check(look.bubble === "rgb(255, 224, 207)", "the tab bubble is peach", look.bubble);
  const geo = await p.evaluate(() => { const d = document.getElementById("dock").getBoundingClientRect(), b = document.getElementById("dkPlus").getBoundingClientRect(); return { dR: d.right, bL: b.left, w: innerWidth, bR: b.right }; });
  check(geo.bL > geo.dR && geo.bR <= geo.w, "the + sits in its own circle beside the bar", geo);
  // the spending ring shows on phones too, in the icon's colours
  const ring = await p.evaluate(() => { const r = document.getElementById("catRing"); return { shown: !!r.querySelector("svg") && getComputedStyle(r).display !== "none", strokes: [...r.querySelectorAll("circle")].slice(1, 3).map(c => getComputedStyle(c).stroke) }; });
  check(ring.shown, "the spending ring shows on the phone Dashboard", ring);
  check(ring.strokes[0] === "rgb(255, 122, 69)", "the biggest category is coral, like the icon", ring.strokes);
  check(await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), "no sideways scrolling");

  // Settings › Appearance: just Light and Dark
  await T.nav("settings/look");
  const opts = await p.$$eval("#modeSeg button", b => b.map(x => x.textContent.trim()));
  check(JSON.stringify(opts) === '["Light","Dark"]', "Appearance offers Light and Dark only", opts);
  check(!(await p.$(".theme-sw")) && !(await p.$("#setAmoled")) && !(await p.$("#glassNote")), "no theme list, no pure black option, no Glass note");
  check(await p.$eval('#modeSeg [data-mode="light"]', b => b.getAttribute("aria-pressed")) === "true", "Light is marked as chosen");
  await p.click('#modeSeg [data-mode="dark"]'); await p.waitForTimeout(800);
  check(await attr("data-theme") === "dark" && await bg() === "rgb(22, 17, 28)" && await p.evaluate(() => localStorage.getItem("pl-mode")) === "dark", "Dark: deep plum page, saved on this device", await bg());
  check(await p.$eval('#modeSeg [data-mode="dark"]', b => b.getAttribute("aria-pressed")) === "true", "Dark is marked as chosen");
  await p.emulateMedia({ colorScheme: "light" }); await p.waitForTimeout(200);
  check(await attr("data-theme") === "dark", "the phone's own setting doesn't change it");
  await reopen();
  check(await attr("data-theme") === "dark", "Dark stays after reopening");
  const dark = await p.evaluate(() => { const cs = s => getComputedStyle(document.querySelector(s)); return { card: cs("#pg-home .panel").backgroundColor, plus: cs("#dkPlus").backgroundColor }; });
  check(dark.card === "rgb(34, 26, 43)" && dark.plus === "rgb(255, 122, 69)", "dark cards in plum, the + in bright coral", dark);
  await T.nav("settings/look"); await p.click('#modeSeg [data-mode="light"]'); await p.waitForTimeout(800);
  check(await attr("data-theme") === "light" && !(await p.evaluate(() => localStorage.getItem("pl-mode"))), "back to Light");

  // the icon set and the manifest
  const root = path.join(__dirname, ".."), man = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  check(man.background_color === "#2B1B3D" && man.theme_color === "#FBF7F3", "manifest: plum splash, warm theme colour", [man.background_color, man.theme_color]);
  const png = f => { const b = fs.readFileSync(path.join(root, "icons", f)); return b.readUInt32BE(16) + "x" + b.readUInt32BE(20); };
  check(png("icon-512.png") === "512x512" && png("icon-192.png") === "192x192" && png("maskable-512.png") === "512x512" && png("apple-touch-icon.png") === "180x180" && png("favicon-32.png") === "32x32", "every icon size is there");
  check(!fs.existsSync(path.join(root, "js", "glass.js")), "the Glass extras are gone");
  await T.end();
})();
