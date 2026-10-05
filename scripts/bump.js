#!/usr/bin/env node
// One step for the release version (forgetting any of it gives phones a blank page):
//   node scripts/bump.js          → next number (pl-v41 → pl-v42) in sw.js and both ?v= in index.html
//   node scripts/bump.js --check  → only check that they agree and every JS file is in the offline list
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), read = f => fs.readFileSync(path.join(root, f), "utf8"), write = (f, s) => fs.writeFileSync(path.join(root, f), s);
let sw = read("sw.js"), html = read("index.html");
const cur = +(sw.match(/const VERSION = "pl-v(\d+)"/) || [])[1];
const vs = [...html.matchAll(/(?:app\.js|css\/app\.css)\?v=(\d+)/g)].map(m => +m[1]);
const problems = [];
if (!cur) problems.push("sw.js has no VERSION");
if (vs.length !== 2 || vs.some(v => v !== cur)) problems.push(`index.html ?v= (${vs.join(", ")}) doesn't match sw.js (${cur})`);
const js = ["js", "js/pages"].flatMap(d => fs.readdirSync(path.join(root, d)).filter(f => f.endsWith(".js")).map(f => "./" + d + "/" + f));
const missing = js.filter(f => !sw.includes('"' + f + '"'));
if (missing.length) problems.push("not in SHELL (sw.js), so missing offline: " + missing.join(", "));
if (process.argv.includes("--check")) {
  if (problems.length) { console.error("✗ " + problems.join("\n✗ ")); process.exit(1); }
  console.log("✓ version pl-v" + cur + " everywhere, all " + js.length + " JS files cached"); process.exit(0);
}
if (missing.length) { console.error("✗ " + problems.filter(p => p.startsWith("not in SHELL")).join("")); process.exit(1); }
const next = cur + 1;
sw = sw.replace(/const VERSION = "pl-v\d+"/, `const VERSION = "pl-v${next}"`);
html = html.replace(/(app\.js|css\/app\.css)\?v=\d+/g, `$1?v=${next}`);
write("sw.js", sw); write("index.html", html);
console.log("pl-v" + cur + " → pl-v" + next + " (sw.js, index.html)");
