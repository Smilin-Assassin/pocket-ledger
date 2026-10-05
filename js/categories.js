// Settings › Categories (v42): every category you've used, how often, and a way to fold
// look-alikes and one-offs into the right one. Your own categories each get their own bar,
// budget and Compare row, so a few strays make every chart noisy.
import { $, esc, money, sum, toast } from "./util.js";
import { state, db, canEdit, EXP_CATS, INC_CATS, LOAN_OUT, LOAN_IN, LOAN_BACK_IN, LOAN_BACK_OUT, catRules } from "./store.js";

let type = "expense";
const LOANS = [LOAN_OUT, LOAN_IN, LOAN_BACK_IN, LOAN_BACK_OUT];
const base = t => (t === "income" ? INC_CATS : EXP_CATS);
const used = t => {
  const by = {};
  state.entries.filter(e => e.type === t && !e.loanId).forEach(e => { const c = e.category || "Other"; (by[c] = by[c] || []).push(e); });
  return by;
};

export function renderCategories() {
  const box = $("catTidy"); if (!box) return;
  document.querySelectorAll("#catTidySeg [data-ct]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ct === type)));
  const by = used(type), defaults = base(type).filter(c => !LOANS.includes(c));
  const names = [...new Set(defaults.concat(Object.keys(by)))].filter(c => !LOANS.includes(c));
  const own = names.filter(c => !defaults.includes(c)).sort((a, b) => (by[b] || []).length - (by[a] || []).length);
  const rows = defaults.filter(c => by[c]).concat(own);
  if (!rows.length) { box.innerHTML = `<p class="hint">Nothing ${type === "income" ? "earned" : "spent"} yet.</p>`; return; }
  box.innerHTML = rows.map(c => {
    const es = by[c] || [], mine = !defaults.includes(c);
    const into = names.filter(x => x !== c);
    return `<div class="ct-row${mine ? " own" : ""}"><span class="ct-name"><b>${esc(c)}</b><small>${es.length} entr${es.length === 1 ? "y" : "ies"}, ${esc(money(sum(es, e => +e.amount), { whole: true }))}${mine ? ", your own" : ""}</small></span>` +
      (mine ? `<span class="ct-merge"><select data-ct-into="${esc(c)}" aria-label="Merge ${esc(c)} into"><option value="">Merge into…</option>${into.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select><button class="ghost" type="button" data-ct-go="${esc(c)}">Merge</button></span>` : "") + `</div>`;
  }).join("") + (own.length ? "" : `<p class="hint">No categories of your own. Everything uses the standard list.</p>`);
}

function merge(from, to) {
  const ids = (used(type)[from] || []).filter(canEdit).map(e => e.id);
  if (!ids.length || !to || to === from) return;
  db.patchMany(ids, { category: to });
  // remembered shop → category choices follow the merge
  const r = catRules()[type] || {}, keys = Object.keys(r).filter(k => r[k] === from);
  keys.forEach(k => db.saveCatRule(type, k, to));
  const later = () => setTimeout(renderCategories, 250); later();
  toast(`${ids.length} moved from ${from} to ${to}`, { action: "Undo", onAction: () => { db.patchMany(ids, { category: from }); keys.forEach(k => db.saveCatRule(type, k, from)); later(); } });
}

export function initCategories() {
  const sec = $("set-cats"); if (!sec) return;
  sec.addEventListener("click", ev => {
    const s = ev.target.closest("[data-ct]"); if (s) { type = s.dataset.ct; renderCategories(); return; }
    const b = ev.target.closest("[data-ct-go]"); if (!b) return;
    const from = b.dataset.ctGo, sel = [...sec.querySelectorAll("select[data-ct-into]")].find(x => x.dataset.ctInto === from);
    if (!sel || !sel.value) { toast("Pick where " + from + " should go"); if (sel) sel.focus(); return; }
    merge(from, sel.value);
  });
}
