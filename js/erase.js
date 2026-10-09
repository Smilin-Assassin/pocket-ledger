// Settings › Erase entries (v45): erase one category, or everything, after typing ERASE. Everything goes to
// Recently deleted, and Undo brings it all back at once. Loan entries stay, so loans keep adding up.
import { $, esc, toast } from "./util.js";
import { state, db, canEdit, rawDoc, isGroup } from "./store.js";

const mine = () => state.entries.filter(e => canEdit(e) && !e.loanId);
const kept = () => state.entries.filter(e => canEdit(e) && e.loanId).length;
let mode = null;   // { all: true } or { cat: "Transport" }
const pick = () => mode && mode.cat ? mine().filter(e => (e.category || "Other") === mode.cat) : mine();

export function renderErase() {
  const list = mine(), counts = {};
  list.forEach(e => { const c = e.category || "Other"; counts[c] = (counts[c] || 0) + 1; });
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b)), cur = $("erCat").value;
  $("erCat").innerHTML = cats.length ? cats.map(c => `<option value="${esc(c)}">${esc(c)} (${counts[c]})</option>`).join("") : '<option value="">Nothing to erase</option>';
  if (cats.includes(cur)) $("erCat").value = cur;
  const k = kept();
  $("erState").textContent = list.length
    ? list.length + " entr" + (list.length === 1 ? "y" : "ies") + (isGroup() ? " of yours in this group" : "") + " can be erased." + (k ? " The " + k + " loan entr" + (k === 1 ? "y stays" : "ies stay") + ", so your loans still add up. Delete a loan from the Loans page." : "")
    : "Nothing to erase here.";
  $("erCatBtn").disabled = !cats.length; $("erAllBtn").disabled = !list.length;
  if (!$("erConfirm").hidden && !pick().length) $("erConfirm").hidden = true;
}
function ask(m) {
  mode = m; const n = pick().length; if (!n) return;
  $("erMsg").textContent = m.cat ? "This erases " + n + " entr" + (n === 1 ? "y" : "ies") + " in " + m.cat + ". They go to Recently deleted for 30 days, and you can Undo straight after." : "This erases all " + n + " entries. They go to Recently deleted for 30 days, and you can Undo straight after.";
  $("erWord").value = ""; $("erGo").disabled = true; $("erConfirm").hidden = false; $("erWord").focus();
}
export function initErase() {
  $("erCatBtn").addEventListener("click", () => { if ($("erCat").value) ask({ cat: $("erCat").value }); });
  $("erAllBtn").addEventListener("click", () => ask({ all: true }));
  $("erWord").addEventListener("input", () => { $("erGo").disabled = $("erWord").value.trim().toUpperCase() !== "ERASE"; });
  $("erX").addEventListener("click", () => { $("erConfirm").hidden = true; mode = null; });
  $("erGo").addEventListener("click", () => {
    if ($("erWord").value.trim().toUpperCase() !== "ERASE") return;
    const list = pick(), items = list.map(e => [e.id, rawDoc("entries", e.id)]).filter(x => x[1]);
    $("erConfirm").hidden = true; mode = null; if (!items.length) return;
    db.removeEntries(items.map(x => x[0]));
    toast("Erased " + items.length + " entr" + (items.length === 1 ? "y" : "ies"), { action: "Undo", onAction: () => { db.restoreEntries(items); } });
    setTimeout(renderErase, 200);
  });
}
