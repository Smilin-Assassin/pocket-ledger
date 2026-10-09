// Glass theme extras.
// 1. Touch light: pressing a glass surface (+, chat button, month switcher, side menu)
//    lights it up under your finger, and the light follows as you slide. transform/opacity only.
// 2. Lens edges (Chrome, Edge and Android only): the glass really bends what's behind it at its
//    rim, like Apple's. Each surface gets an SVG displacement map drawn to its exact size.
//    Safari can't use SVG filters on the backdrop, so iPhone, iPad and Mac keep the plain glass.
import { zoom } from "./dock.js";

const d = document.documentElement;
const isGlass = () => d.getAttribute("data-preset") === "glass";
const UA = navigator.userAgent || "";
export const lensOK = !/iPhone|iPad|iPod|Macintosh|Mac OS X|Firefox|FxiOS/.test(UA) && /Chrome\/|Chromium\//.test(UA);

// ---------- 1. touch light ----------
const GLOW = ".dk-plus, .fab, .monthnav, .nav";
let lit = null, litId = -1, raf = 0, lx = 0, ly = 0;
function place(el, e) {
  const r = el.getBoundingClientRect(), z = zoom();
  lx = (e.clientX - r.left) / z; ly = (e.clientY - r.top) / z;
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (lit) { lit.style.setProperty("--lx", lx.toFixed(1) + "px"); lit.style.setProperty("--ly", ly.toFixed(1) + "px"); } });
}
function off() { if (lit) lit.classList.remove("lit"); lit = null; litId = -1; }
function initLight() {
  document.addEventListener("pointerdown", e => {
    if (!isGlass()) return;
    const el = e.target.closest(GLOW); if (!el) return;
    off(); lit = el; litId = e.pointerId;
    const r = el.getBoundingClientRect(), z = zoom();
    el.style.setProperty("--lx", ((e.clientX - r.left) / z).toFixed(1) + "px");
    el.style.setProperty("--ly", ((e.clientY - r.top) / z).toFixed(1) + "px");
    el.classList.add("lit");
  }, { capture: true, passive: true });
  document.addEventListener("pointermove", e => { if (lit && e.pointerId === litId) place(lit, e); }, { capture: true, passive: true });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(t => document.addEventListener(t, e => { if (e.pointerId === litId) off(); }, { capture: true, passive: true }));
  addEventListener("blur", off);
}

// ---------- 2. lens edges ----------
const LENS = { dock: "dkBar", plus: "dkPlus", fab: "chatFab", month: "monthNav", nav: "nav" };
const BEZEL = { dock: 16, plus: 14, fab: 12, month: 12, nav: 18 }, SCALE = { dock: 34, plus: 26, fab: 24, month: 22, nav: 30 };
const made = {};
// a map the size of the surface: red = sideways shift, green = up/down shift, 128 = none.
// Near the rim, each point looks a little further in, so the edge squeezes and magnifies like a lens.
function makeMap(w, h, r, bezel) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"), img = g.createImageData(w, h), px = img.data;
  const hx = w / 2, hy = h / 2, R = Math.min(r, hx, hy);
  const sd = (x, y) => { const qx = Math.abs(x - hx) - (hx - R), qy = Math.abs(y - hy) - (hy - R);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, cx = x + .5, cy = y + .5, s = sd(cx, cy), depth = -s;
    let dx = 0, dy = 0;
    if (depth > 0 && depth < bezel) {
      const nx = sd(cx + 1, cy) - sd(cx - 1, cy), ny = sd(cx, cy + 1) - sd(cx, cy - 1), n = Math.hypot(nx, ny) || 1;
      const t = 1 - depth / bezel, a = t * t;          // strongest right at the rim, fading inward
      dx = -nx / n * a; dy = -ny / n * a;              // look inward
    }
    px[i] = 128 + Math.round(dx * 127); px[i + 1] = 128 + Math.round(dy * 127); px[i + 2] = 128; px[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}
function defs() {
  let s = document.getElementById("lensDefs");
  if (!s) { s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.id = "lensDefs"; s.setAttribute("width", "0"); s.setAttribute("height", "0"); s.setAttribute("aria-hidden", "true"); s.style.position = "absolute"; s.innerHTML = "<defs></defs>"; document.body.appendChild(s); }
  return s.firstChild;
}
export function refreshLens(which) {
  if (!lensOK || !isGlass()) return;
  (which ? [which] : Object.keys(LENS)).forEach(k => {
    const el = document.getElementById(LENS[k]); if (!el || !el.offsetWidth) return;
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight), r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    const key = w + "x" + h + "r" + Math.round(r); if (made[k] === key) return; made[k] = key;
    let f = document.getElementById("lens-" + k);
    if (!f) { f = document.createElementNS("http://www.w3.org/2000/svg", "filter"); f.id = "lens-" + k; defs().appendChild(f); }
    ["x", "y"].forEach(a => f.setAttribute(a, "0"));
    f.setAttribute("width", w); f.setAttribute("height", h);
    f.setAttribute("filterUnits", "userSpaceOnUse"); f.setAttribute("primitiveUnits", "userSpaceOnUse"); f.setAttribute("color-interpolation-filters", "sRGB");
    f.innerHTML = `<feImage href="${makeMap(w, h, r, BEZEL[k])}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>`
      + `<feDisplacementMap in="SourceGraphic" in2="m" scale="${SCALE[k]}" xChannelSelector="R" yChannelSelector="G"/>`;
  });
}

export function initGlass() {
  initLight();
  d.toggleAttribute("data-lens", lensOK);
  if (!lensOK) return;
  const all = () => requestAnimationFrame(() => refreshLens());
  all(); setTimeout(all, 1200);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(all);
  let t = 0; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(all, 200); });
  new MutationObserver(all).observe(d, { attributes: true, attributeFilter: ["data-preset", "data-fs", "data-fs-z"] });
  addEventListener("hashchange", () => setTimeout(all, 50));
}
