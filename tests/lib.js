// Shared test helpers: a headless browser with the Firebase SDK swapped for the
// mocks in ./mockfb (which also model firestore.rules), plus small checks.
// Run a local server in the repo root first:  python3 -m http.server 8765
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), os = require("os");

const URL0 = process.env.PL_URL || "http://localhost:8765/";
const STATE = n => path.join(os.tmpdir(), "pl_state" + (n || "") + ".json");
let fails = 0;
function check(ok, msg, extra) {
  console.log((ok ? "  ok   " : "  FAIL ") + msg + (extra !== undefined && !ok ? "  →  " + JSON.stringify(extra) : ""));
  if (!ok) fails++;
}

async function start(opts) {
  opts = opts || {};
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 412, height: 900 }, acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] }, opts.context || {}));
  await ctx.route("https://www.gstatic.com/firebasejs/**", r => r.fulfill({ status: 200, contentType: "application/javascript", body: fs.readFileSync(path.join(__dirname, "mockfb", r.request().url().split("/").pop())) }));
  await ctx.route("https://fonts.googleapis.com/**", r => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const p = await ctx.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message));
  p.on("console", m => { if ((m.type() === "error" || m.type() === "warning") && !/Failed to load resource.*404/.test(m.text())) errs.push("console: " + m.text()); });
  await p.goto(URL0); await p.waitForTimeout(200);
  if (opts.seed) await p.evaluate(([s, users]) => { localStorage.clear(); localStorage.setItem("mock-db", JSON.stringify(s)); localStorage.setItem("mock-users", JSON.stringify(users)); }, [opts.seed, opts.users || {}]);
  const T = {
    p, ctx, browser, errs, check,
    db: () => p.evaluate(() => JSON.parse(localStorage.getItem("mock-db"))),
    async login(email, hash) { await p.evaluate(e => { localStorage.setItem("mock-cur", e); window.__denied = []; }, email); await p.goto("about:blank"); await p.goto(URL0 + (hash || "")); await p.waitForTimeout(1300); },
    async logout() { await p.evaluate(() => localStorage.removeItem("mock-cur")); },
    async nav(page) { await p.evaluate(pg => { location.hash = pg; }, page); await p.waitForTimeout(500); },
    async space(i) { await p.click("#spaceBar button:nth-child(" + i + ")"); await p.waitForTimeout(1300); },
    gate: () => p.evaluate(() => ["gLoading", "gSignin", "gInvite", "gSetup"].filter(v => !document.getElementById(v).hidden).join(",") + (document.getElementById("gate").hidden ? " (gate closed)" : "")),
    bar: () => p.$$eval("#spaceBar button", bs => bs.map(b => (b.getAttribute("aria-pressed") === "true" ? "*" : "") + b.textContent)),
    rows: sel => p.$$eval((sel || "#ledger") + " li.tx", ls => ls.map(li => li.querySelector(".what").innerText.replace(/\n/g, " ~ ") + " [" + [...li.querySelectorAll("button")].map(x => x.textContent).join("/") + "]")),
    text: async sel => (await p.innerText(sel)).replace(/\n+/g, " / "),
    visible: sel => p.isVisible(sel),
    denied: () => p.evaluate(() => window.__denied || []),
    async addEntry(type, amount, catIndex) {
      await p.click('#formPanel .seg button[data-t="' + type + '"]'); await p.fill("#fAmount", String(amount));
      if (catIndex !== undefined) await p.selectOption("#fCatSel", { index: catIndex });
      await p.click("#submitBtn"); await p.waitForTimeout(350);
    },
    saveState: async n => fs.writeFileSync(STATE(n), JSON.stringify(await T.db())),
    async end() {
      const denied = await p.evaluate(() => window.__denied || []).catch(() => []);
      check(!errs.length, "no page errors", errs);
      await browser.close();
      console.log(fails ? "\n" + fails + " check(s) FAILED" : "\nall checks passed");
      process.exitCode = fails ? 1 : 0;
      return denied;
    }
  };
  return T;
}
// the state an earlier test left (g1 → "", g2 → "2"); when it isn't there (a test run on its own, or in
// parallel), a saved copy in fixtures/ is used, with group invite windows moved into the future
const loadState = n => {
  if (fs.existsSync(STATE(n))) return JSON.parse(fs.readFileSync(STATE(n)));
  const st = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "state" + (n || "") + ".json")));
  Object.values(st).forEach(d => { if (d && typeof d === "object" && d.joinUntil) d.joinUntil = Date.now() + 7 * 864e5; });
  return st;
};
module.exports = { start, check, loadState, URL0 };
