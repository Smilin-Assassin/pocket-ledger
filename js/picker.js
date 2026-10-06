// Pocket Ledger's own dropdown (v43). Every <select> in the app opens this instead of the phone's built-in
// list (which the app can't style: it came up dark and boxy on Android). It's a traditional dropdown: a
// frosted-glass list that grows out of the field, right under it (or above it when there's no room below),
// in the theme's colours, with a tick on the current choice. The <select> stays the source of truth: it
// still holds the value, fires "change", and works from the keyboard. Only taps and clicks come here.
import { $, esc } from "./util.js";
import { reduced, ease, buzz } from "./motion.js";
import { zoom } from "./dock.js";

let current = null, field = null;       // the <select> being picked, and its wrapper
const dur = () => { const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--grow-dur")); return Math.min((v > 0 ? v : .45), .5) * 1000; };
const TICK = '<svg class="pick-tick" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function place() {
  const pop = $("pickPop"), z = zoom(), r = field.getBoundingClientRect(), vw = innerWidth, gap = 6, margin = 10;
  // on phones the list stops above the tab bar instead of sliding under it
  const dk = document.querySelector(".dk-wrap"), dkTop = dk && getComputedStyle(dk).display !== "none" ? dk.getBoundingClientRect().top + 14 : innerHeight;
  const vh = Math.min(innerHeight, dkTop);
  const w = Math.min(Math.max(r.width, 220), vw - margin * 2);
  let left = Math.min(Math.max(r.left, margin), vw - margin - w);
  const below = vh - r.bottom - gap - margin, above = r.top - gap - margin;
  const up = below < 240 && above > below;                       // flip above the field when it's near the bottom
  const maxH = Math.max(160, Math.min(up ? above : below, vh * .6));
  // the popup lives inside the zoomed <body> (Text size), so screen pixels are divided by the zoom
  Object.assign(pop.style, { left: left / z + "px", width: w / z + "px", maxHeight: maxH / z + "px",
    top: up ? "auto" : (r.bottom + gap) / z + "px", bottom: up ? (innerHeight - r.top + gap) / z + "px" : "auto" });
  pop.classList.toggle("up", up);
  return up;
}

function open(sel, wrap) {
  if (sel.disabled) return;
  if (current) close();
  current = sel; field = wrap;
  const opts = [...sel.options].filter(o => !o.disabled && !o.hidden);
  // a "Choose…" placeholder isn't a real choice ("All categories" is, so it stays)
  const shown = opts.filter((o, i) => !(i === 0 && o.value === "" && /^choose/i.test(o.textContent.trim())));
  const list = $("pickList");
  list.setAttribute("aria-label", sel.getAttribute("aria-label") || ((sel.id && document.querySelector(`label[for="${sel.id}"]`)) || {}).textContent || "Choose");
  list.innerHTML = shown.map(o => {
    const t = o.textContent.trim(), sub = /^ /.test(o.textContent);                 // indented sub-choices (meals under Eating out)
    const isNew = o.value === "__other" || /^\+ /.test(t), on = o.value === sel.value;
    return `${isNew ? '<div class="pick-sep" aria-hidden="true"></div>' : ""}<button type="button" role="option" class="pick-opt${sub ? " sub" : ""}${isNew ? " new" : ""}" data-v="${esc(o.value)}" aria-selected="${on}"><span>${esc(t)}</span>${on ? TICK : ""}</button>`;
  }).join("");
  $("pickWrap").hidden = false; wrap.classList.add("open");
  const up = place(), pop = $("pickPop");
  const on = list.querySelector('[aria-selected="true"]'); if (on) list.scrollTop = Math.max(0, on.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2);
  if (!reduced() && pop.animate) {
    const d = dur(), e = ease();
    pop.style.transformOrigin = up ? "50% 100%" : "50% 0";
    pop.animate([{ transform: `translateY(${up ? 8 : -8}px) scale(.94, .7)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: d, easing: e });
    [...list.querySelectorAll(".pick-opt")].slice(0, 14).forEach((b, i) => b.animate([{ transform: `translateY(${up ? 6 : -6}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: d * .7, delay: 30 + i * 16, easing: e, fill: "backwards" }));
  }
  buzz(5);
}

function close(pickedValue) {
  const sel = current, wrap = field; current = null; field = null;
  const pop = $("pickPop"), done = () => { $("pickWrap").hidden = true; };
  if (wrap) wrap.classList.remove("open");
  if (!reduced() && pop.animate && !$("pickWrap").hidden) {
    const up = pop.classList.contains("up");
    const a = pop.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${up ? 6 : -6}px) scale(.97)`, opacity: 0 }], { duration: 140, easing: "ease-in", fill: "forwards" });
    a.onfinish = () => { a.cancel(); if (!current) done(); };
  } else done();
  if (sel && pickedValue !== undefined && sel.value !== pickedValue) {
    sel.value = pickedValue;
    sel.dispatchEvent(new Event("input", { bubbles: true }));
    sel.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

// each select sits in a wrapper that takes the tap; the select itself ignores pointer events
function wrapSelect(sel) {
  if (sel.dataset.native !== undefined || sel.multiple || (sel.parentElement && sel.parentElement.classList.contains("pick-field"))) return;
  const w = document.createElement("span");
  w.className = "pick-field";
  sel.parentNode.insertBefore(w, sel); w.appendChild(sel);
}

export function initPicker() {
  document.body.insertAdjacentHTML("beforeend", `<div class="pick-wrap" id="pickWrap" hidden><div class="pick-catch" id="pickCatch"></div>
    <div class="pick-pop" id="pickPop"><div class="pick-list" id="pickList" role="listbox"></div></div></div>`);
  document.querySelectorAll("select").forEach(wrapSelect);
  new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType !== 1) return; if (n.tagName === "SELECT") wrapSelect(n); else n.querySelectorAll && n.querySelectorAll("select").forEach(wrapSelect); })))
    .observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", ev => {
    const f = ev.target.closest(".pick-field"); if (!f) return;
    const sel = f.querySelector("select"); if (!sel) return;
    ev.preventDefault();
    if (current === sel) close(); else open(sel, f);
  });
  $("pickList").addEventListener("click", ev => { const b = ev.target.closest(".pick-opt"); if (b) { buzz(4); close(b.dataset.v); } });
  // a tap anywhere else closes it (and doesn't also press whatever was underneath)
  $("pickCatch").addEventListener("pointerdown", ev => { ev.preventDefault(); close(); });
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && current) { ev.stopPropagation(); close(); } }, true);
  // when the page scrolls it stays attached to the field (and closes once the field leaves the screen)
  addEventListener("scroll", ev => {
    if (!current || (ev.target && ev.target.closest && ev.target.closest("#pickPop"))) return;
    const r = field.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) close(); else place();
  }, { capture: true, passive: true });
  addEventListener("resize", () => { if (current) close(); });
  addEventListener("hashchange", () => { if (current) close(); });
}
