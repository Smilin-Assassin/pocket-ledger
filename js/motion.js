// Motion: springs that run on real time (not frames), so they look the same on 60, 90, 120 or 144 Hz
// screens and use every frame the screen can show. Settings live on this device (Settings › Appearance).
import { lsJson, lsSet } from "./util.js";

export const PRESETS = { calm: { stretch: 25, bounce: 15, speed: 45 }, lively: { stretch: 60, bounce: 45, speed: 60 }, jelly: { stretch: 90, bounce: 75, speed: 50 } };
export const PAGES = ["home", "entries", "loans", "bills", "goals", "settings"];
const DEF = { preset: "lively", tabs: 4, dock: ["home", "entries", "bills"], buzz: true };

export const M = Object.assign({}, DEF, lsJson("pl-motion", {}));
if (!PRESETS[M.preset]) M.preset = "lively";
if (M.tabs !== 6) M.tabs = 4;
M.dock = PAGES.filter(p => (M.dock || []).includes(p)).slice(0, 3);
if (M.dock.length !== 3) M.dock = DEF.dock.slice();
export function saveMotion() { lsSet("pl-motion", JSON.stringify({ preset: M.preset, tabs: M.tabs, dock: M.dock, buzz: M.buzz })); }

const mq = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : null;
export const reduced = () => !!(mq && mq.matches);

// k: stiffness, zeta: damping (1 = no overshoot, lower = bouncier); mass 1
export function params() {
  // Arcade (v75) is always crisp: fast, fully damped (no overshoot), no stretch, whatever Calm / Lively / Jelly says
  if (document.documentElement.getAttribute("data-look") === "arcade") return { k: 1100, zeta: 1.15, trail: 1, stretch: 0 };
  const S = PRESETS[M.preset];
  return { k: 260 + S.speed * 9, zeta: 1.05 - S.bounce * 0.0065, trail: 1 - S.stretch * 0.0078, stretch: S.stretch / 100 };
}
export class Spring {
  constructor(x) { this.x = x; this.v = 0; this.t = x; this.k = 500; this.z = .7; }
  step(dt) { const c = 2 * this.z * Math.sqrt(this.k), a = -this.k * (this.x - this.t) - c * this.v; this.v += a * dt; this.x += this.v * dt; }
  // advance by real elapsed time in small fixed slices: identical motion at any refresh rate
  run(dt) { let left = Math.min(dt, .05); while (left > 1e-6) { const h = Math.min(left, 1 / 480); this.step(h); left -= h; } }
  idle() { return Math.abs(this.x - this.t) < .05 && Math.abs(this.v) < .05; }
  snap() { this.x = this.t; this.v = 0; }
}
// a frame clock: gives each callback the real seconds since its last frame
export function clock(fn) {
  let raf = 0, last = 0;
  const tick = now => { const dt = last ? (now - last) / 1000 : 1 / 120; if (last) sample(now - last); last = now; if (fn(dt, now) === false) { raf = 0; last = 0; return; } raf = requestAnimationFrame(tick); };
  return { kick() { if (!raf) raf = requestAnimationFrame(tick); }, get running() { return !!raf; } };
}

// the same spring as a CSS easing curve, so CSS transitions match the JS motion
function springEase() {
  const { k, zeta } = params(), s = new Spring(0); s.t = 1; s.k = k; s.z = zeta;
  const pts = [], dt = 1 / 120; let t = 0;
  while (t < 2.5) { pts.push(s.x); s.run(dt); t += dt; if (t > .25 && s.idle()) break; }
  pts.push(1);
  const step = Math.max(1, Math.floor(pts.length / 60)), out = [];
  for (let i = 0; i < pts.length; i += step) out.push(+pts[i].toFixed(4));
  if (out[out.length - 1] !== 1) out.push(1);
  return { ease: "linear(" + out.join(", ") + ")", dur: (pts.length / 120).toFixed(2) + "s" };
}
let easeNow = "cubic-bezier(.34,1.56,.64,1)";
export const ease = () => easeNow;
export function applyEase() {
  const root = document.documentElement.style;
  if (reduced()) { easeNow = "ease"; root.setProperty("--spring-ease", "ease"); root.setProperty("--grow-dur", ".15s"); return; }
  if (window.CSS && CSS.supports && CSS.supports("transition-timing-function", "linear(0, 1)")) { const e = springEase(); easeNow = e.ease; root.setProperty("--spring-ease", e.ease); root.setProperty("--grow-dur", e.dur); }
  else { root.setProperty("--spring-ease", easeNow); root.setProperty("--grow-dur", ".5s"); }
}

// little vibrations (Android); off in Settings › Appearance
export function buzz(ms) { if (M.buzz && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(ms); } catch {} } }

// how fast this screen refreshes, measured (browsers don't say): median time between frames
// phones drop to 60 Hz while nothing moves, so the frames of real animations count most
let hz = 0; const live = [];
const snapHz = raw => [30, 60, 75, 90, 100, 120, 144, 165, 240].reduce((b, x) => Math.abs(x - raw) < Math.abs(b - raw) ? x : b, 60);
function sample(ms) { if (ms > 2 && ms < 40) { live.push(ms); if (live.length > 90) live.shift(); } }
export const refreshHz = () => {
  if (live.length >= 20) { const d = live.slice().sort((a, b) => a - b), m = snapHz(1000 / d[Math.floor(d.length * .3)]); if (m > hz) hz = m; }
  return hz;
};
export function measureHz(done) {
  const d = []; let last = 0, n = 0;
  const f = now => { if (last) d.push(now - last); last = now; if (++n < 50) requestAnimationFrame(f); else {
    d.sort((a, b) => a - b); const med = d[Math.floor(d.length / 2)] || 16.7, raw = 1000 / med;
    hz = Math.max(hz, snapHz(raw));
    if (done) done(hz);
  } };
  requestAnimationFrame(f);
}
if (mq && mq.addEventListener) mq.addEventListener("change", applyEase);
