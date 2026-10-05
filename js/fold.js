// Folded cards on the Dashboard (v42): Last 12 months and Compare show a one-line summary and open in place.
// Opening: the card's body is revealed top-down while its parts rise in one after another, the chart's bars
// grow from the baseline, and the cards below glide down instead of jumping (transform/opacity and clip only).
import { lsGet, lsSet } from "./util.js";
import { reduced, ease } from "./motion.js";

const KEY = "pl-fold";
const openSet = () => { try { return new Set(JSON.parse(lsGet(KEY) || "[]")); } catch { return new Set(); } };
const save = s => lsSet(KEY, JSON.stringify([...s]));
const dur = () => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--grow-dur")); return (v > 0 ? v : .5) * 1000; };
export const isOpen = name => openSet().has(name);

function after(card) { const out = []; let n = card.nextElementSibling; while (n) { if (!n.hidden) out.push(n); n = n.nextElementSibling; } return out; }

function set(card, open, animate) {
  const head = card.querySelector(".fold-head"), body = card.querySelector(".fold-body");
  if (head.getAttribute("aria-expanded") === String(open) && !animate) return;
  const below = after(card), tops = below.map(el => el.offsetTop);
  head.setAttribute("aria-expanded", String(open)); card.classList.toggle("open", open); body.hidden = !open;
  const s = openSet(); open ? s.add(card.dataset.fold) : s.delete(card.dataset.fold); save(s);
  if (open) card.dispatchEvent(new CustomEvent("fold-open", { bubbles: true }));
  if (!animate || reduced() || !body.animate) return;
  const d = dur(), e = ease();
  // the cards below: from where they were to where they are now
  below.forEach((el, i) => { const dy = tops[i] - el.offsetTop; if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: d, easing: e }); });
  card.querySelector(".fold-chev").animate([{ transform: `rotate(${open ? 0 : 180}deg)` }, { transform: `rotate(${open ? 180 : 0}deg)` }], { duration: d, easing: e });
  if (!open) return;
  body.animate([{ clipPath: "inset(0 0 100% 0)", opacity: .2 }, { clipPath: "inset(0 0 0 0)", opacity: 1 }], { duration: d * .9, easing: "cubic-bezier(.2,.8,.2,1)" });
  [...body.children].forEach((el, i) => el.animate([{ transform: "translateY(14px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: d, delay: 60 + i * 55, easing: e, fill: "backwards" }));
  body.querySelectorAll(".trend .inc, .trend .out").forEach((bar, i) => bar.animate([{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: d, delay: 120 + i * 18, easing: e, fill: "backwards" }));
  body.querySelectorAll(".cmp-tbl tbody tr").forEach((tr, i) => tr.animate([{ transform: "translateX(-10px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: d * .8, delay: 120 + i * 40, easing: e, fill: "backwards" }));
}

export function initFolds() {
  const s = openSet();
  document.querySelectorAll(".fold").forEach(card => {
    set(card, s.has(card.dataset.fold), false);
    card.querySelector(".fold-head").addEventListener("click", () => set(card, !card.classList.contains("open"), true));
  });
}
