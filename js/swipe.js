// Swipe left or right on a page to move to the next or previous tab of the dock (phones only, v45).
// Tapping the dock does the same. Swipes that belong to something else are left alone: rows (Edit/Delete),
// charts and lists that scroll sideways, sheets, the lock, inputs and the screen edges (the phone's back gesture).
import { currentPage, go } from "./shell.js";
import { dockPages, isPhone } from "./dock.js";

const EDGE = 28, MIN_DX = 70, MAX_MS = 700;
const OFF = "input, textarea, select, [contenteditable], li.tx, .pick-wrap, .qa-wrap, .lock, .gate, .chat, .scan-wrap, .dk-wrap, .fold-body svg, .trend, .cmp";

function scrollsSideways(el) {
  for (; el && el !== document.body; el = el.parentElement) {
    const o = getComputedStyle(el).overflowX;
    if ((o === "auto" || o === "scroll") && el.scrollWidth > el.clientWidth + 2) return true;
  }
  return false;
}
export function initSwipe() {
  let s = null;
  document.addEventListener("touchstart", ev => {
    s = null;
    if (!isPhone() || ev.touches.length !== 1) return;
    const t = ev.touches[0], tg = ev.target;
    if (t.clientX < EDGE || t.clientX > innerWidth - EDGE) return;
    if (document.body.classList.contains("qa-open") || document.body.classList.contains("chat-open")) return;
    if (!(tg instanceof Element) || tg.closest(OFF) || scrollsSideways(tg)) return;
    s = { x: t.clientX, y: t.clientY, t: Date.now(), dir: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", ev => {
    if (!s) return;
    const t = ev.touches[0], dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (!s.dir && (Math.abs(dx) > 14 || Math.abs(dy) > 14)) s.dir = Math.abs(dx) > Math.abs(dy) * 1.7 ? 1 : -1;   // sideways on purpose, or it's a scroll
    if (s.dir === -1) s = null;
  }, { passive: true });
  document.addEventListener("touchend", ev => {
    const a = s; s = null; if (!a || a.dir !== 1) return;
    const t = ev.changedTouches[0], dx = t.clientX - a.x, dy = t.clientY - a.y;
    if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 1.7 || Date.now() - a.t > MAX_MS) return;
    const list = dockPages(), cur = currentPage(), i = list.includes(cur) ? list.indexOf(cur) : list.indexOf("more");
    const next = list[i + (dx < 0 ? 1 : -1)];
    if (next) go(next);
  }, { passive: true });
}
