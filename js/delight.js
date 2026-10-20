// Little moments of delight (v51), in Coral Dusk. Each plays only at its own moment, never blocks a tap,
// and moves with transform / opacity only. With "reduce motion" on (phone setting), each becomes a short fade.
//   A  the logo opening (index.html #splash, once per app opening; this file just says when it's gone)
//   B  the spending ring draws itself the first time it comes into view; tapping a category lifts its part out
//   C  "Left to spend" rolls up like an odometer, once per app opening
//   D  a coin drops into a little ring by the + after you add spending
//   E  sunset / sunrise when you switch Dark / Light
//   G  confetti when a savings goal is reached (once per goal, on this device)
//   H  a coral beam sweeps the receipt or statement while it's being read
import { reduced } from "./motion.js";
import { lsJson, lsSet } from "./util.js";

const d = document, de = d.documentElement;
const RING = ["#FF7A45", "#FF4D8D", "#FFC145", "#9C8BC4"];
const el = (tag, cls, html) => { const x = d.createElement(tag); if (cls) x.className = cls; if (html) x.innerHTML = html; return x; };

// ---------- A: when the opening logo is gone ----------
const splashEnd = () => window.plSplashUntil || 0;
export function afterSplash(fn) { const wait = splashEnd() - performance.now(); if (wait > 0) setTimeout(fn, wait); else fn(); }

// ---------- B: the spending ring ----------
let ringDone = false, ringIO = null;
// home.js asks before drawing the ring: true = start it empty and draw it when it's seen
export const ringShouldWait = () => !ringDone && !reduced() && "IntersectionObserver" in window;
export function watchRing(box) {
  const svg = box && box.querySelector("svg.wait"); if (!svg) return;
  if (ringIO) ringIO.disconnect();
  ringIO = new IntersectionObserver(ents => {
    if (!ents.some(e => e.isIntersecting)) return;
    ringIO.disconnect(); ringIO = null;
    afterSplash(() => { if (ringDone) return; ringDone = true; svg.classList.remove("wait"); svg.classList.add("draw"); });
  }, { threshold: .45 });
  ringIO.observe(box);
}
// tapping a category on the Dashboard: its part of the ring lifts out, the rest dim, then Entries opens
export function liftRing(i, then) {
  const svg = d.querySelector("#catRing svg"), seg = svg && svg.querySelector(`.seg[data-i="${i}"]`);
  const shown = svg && svg.getBoundingClientRect().bottom > 0 && svg.getBoundingClientRect().top < innerHeight;
  if (!seg || !shown || reduced()) return then();
  svg.classList.add("lifting"); seg.classList.add("lift");
  setTimeout(then, 260);
}

// ---------- C: the rolling number ----------
let rolled = false;
export const rollPending = () => !rolled;
export function rollNumber(big) {
  if (rolled || !big || !big.offsetParent) return;
  rolled = true;
  if (reduced()) return;
  const text = big.textContent, host = big.parentElement;
  big.classList.add("odo-hide");                      // hidden from the start, so it doesn't flash before rolling
  const show = () => big.classList.remove("odo-hide");
  setTimeout(show, splashEnd() - performance.now() + 2500); // never stays hidden, whatever happens
  afterSplash(() => {
    if (big.textContent !== text || !big.offsetParent) return show();   // changed meanwhile: just show it
    host.classList.add("odo-host");                   // positions the overlay over the amount
    const cs = getComputedStyle(big), lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.15;
    const o = el("div", "odo"); o.setAttribute("aria-hidden", "true");
    // copy the font piece by piece: the "font" shorthand comes back empty when digits are tabular, which made the
    // rolling copy fall back to the small body font (v52 fix)
    Object.assign(o.style, { left: big.offsetLeft + "px", top: big.offsetTop + "px", height: big.offsetHeight + "px", letterSpacing: cs.letterSpacing, color: cs.color });
    ["fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariationSettings", "fontFeatureSettings", "fontOpticalSizing"].forEach(k => { if (cs[k]) o.style[k] = cs[k]; });
    o.style.setProperty("--lh", lh + "px");
    let n = 0;
    for (const ch of text) {
      if (/\d/.test(ch)) {
        const col = el("span", "odo-col", Array.from({ length: 10 + +ch + 1 }, (_, k) => `<span>${k % 10}</span>`).join(""));
        col.style.setProperty("--to", -(10 + +ch) * lh + "px"); col.style.animationDelay = (n++ * 45) + "ms";
        const w = el("span", "odo-win"); w.appendChild(col); o.appendChild(w);
      } else o.appendChild(el("span", "odo-ch", ch === " " ? "&nbsp;" : ch.replace(/[<>&]/g, "")));
    }
    host.appendChild(o);
    setTimeout(() => { o.remove(); show(); }, 1150 + n * 45);
  });
}

// ---------- D: a coin drops into the ring ----------
const miniRing = (r, w) => { const C = 2 * Math.PI * r, f = [.35, .24, .175, .235]; let a = 0;
  return f.map((x, i) => { const s = `<circle cx="28" cy="28" r="${r}" fill="none" stroke="${RING[i]}" stroke-width="${w}" stroke-dasharray="${(x * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-a * C).toFixed(2)}" transform="rotate(-90 28 28)"/>`; a += x; return s; }).join(""); };
export function coinDrop() {
  const box = el("div", "coin-pop" + (reduced() ? " still" : ""), `<svg class="coin-ring" viewBox="0 0 56 56" width="56" height="56" aria-hidden="true">${miniRing(19, 9)}</svg><span class="coin" aria-hidden="true"></span>`);
  d.body.appendChild(box);
  setTimeout(() => box.remove(), reduced() ? 900 : 1500);
}

// ---------- E: sunset / sunrise ----------
export function sunSwitch(toDark, apply) {
  if (reduced() || !!(de.getAttribute("data-theme") === "dark") === toDark) return apply();
  const sky = el("div", "sky " + (toDark ? "to-dark" : "to-light"), `<div class="sky-sun"></div><div class="sky-sea"></div>` + Array.from({ length: 7 }, (_, i) => `<i class="sky-star" style="left:${8 + i * 13}%;top:${10 + (i * 37) % 38}%;animation-delay:${(i % 3) * 80}ms"></i>`).join(""));
  sky.setAttribute("aria-hidden", "true");
  d.body.appendChild(sky);
  setTimeout(apply, 520);                               // the page changes while the sky covers it
  setTimeout(() => sky.remove(), 1250);
}

// ---------- G: goal confetti ----------
const DONE = "pl-goals-done";
let seeded = false;
// called after every data change with [{id, name, reached}]; celebrates a goal the first time it's reached
export function checkGoals(goals, toast) {
  const done = new Set(lsJson(DONE, []));
  const fresh = goals.filter(g => g.reached && !done.has(g.id));
  if (!seeded) { seeded = true; if (fresh.length) { fresh.forEach(g => done.add(g.id)); lsSet(DONE, JSON.stringify([...done])); } return; } // already reached before today: no party
  if (!fresh.length) return;
  fresh.forEach(g => done.add(g.id)); lsSet(DONE, JSON.stringify([...done]));
  confetti();
  toast("Goal reached: " + fresh.map(g => g.name).join(", ") + ". Well done!");
}
export function confetti() {
  if (reduced()) return;
  const box = el("div", "confetti"); box.setAttribute("aria-hidden", "true");
  const cols = RING.concat(["#FFFFFF", "#FFD166"]);
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, r = 120 + Math.random() * 220, b = el("i");
    b.style.cssText = `background:${cols[i % cols.length]};--x:${(Math.cos(a) * r).toFixed(0)}px;--y:${(Math.sin(a) * r * .8 - 90).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;animation-delay:${(Math.random() * 90).toFixed(0)}ms;${i % 3 ? "" : "width:7px;height:7px;border-radius:50%;"}`;
    box.appendChild(b);
  }
  d.body.appendChild(box);
  setTimeout(() => box.remove(), 2300);
}

// ---------- H: the scan beam ----------
// what scan.js shows while it reads: the picture itself (or a sketch of a statement) with the beam over it
export function scanViz(src) {
  return `<div class="scanviz${reduced() ? " still" : ""}" aria-hidden="true"><div class="scanviz-doc">` +
    (src ? `<img src="${src}" alt="">` : `<i style="width:58%;margin:0 auto"></i><i style="width:36%;margin:0 auto 8px"></i><i></i><i style="width:84%"></i><i style="width:92%"></i><i style="width:70%"></i><i style="width:88%"></i><i style="width:46%;margin-left:auto;margin-top:8px"></i>`) +
    `<div class="scanviz-tint"></div><div class="scanviz-beam"></div></div></div>`;
}
