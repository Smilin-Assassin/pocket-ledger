// Money sent between people in Pocket Ledger. The sender records it in a group
// they share (the "mailbox"); the receiver gets a card to check and accept it,
// which adds the income to their own private space. Nothing shows in the group's
// own entries or totals.
import { $, esc, money, num, r2, todayISO, fmtDate, toast, busy, fillSelect } from "./util.js";
import { ctx, state, meId, isViewer, hRef, EXP_CATS, INC_CATS, pname } from "./store.js";
import { callFn } from "./notify.js";

const F = () => ctx.F;
const myGroups = () => (ctx.spaces || []).filter(s => s.type === "group" && s.role === "member");
const myName = () => (ctx.profile && ctx.profile.name) || (state.my && state.my.name) || pname(meId()) || "Someone";
const personalEntries = () => F().collection(hRef(ctx.profile.personal), "entries");
const seenRef = key => F().doc(F().collection(hRef(ctx.profile.personal), "transfersSeen"), key);

// ---------- receiving ----------
let pending = [];
export async function checkTransfers() {
  if (!ctx.F || isViewer() || !ctx.profile.personal) return;
  const me = meId(), incoming = [];
  for (const g of myGroups()) {
    try {
      const q = await F().getDocs(F().query(F().collection(hRef(g.id), "transfers"), F().where("to", "==", me)));
      q.docs.forEach(d => incoming.push(Object.assign({ id: d.id, gid: g.id, gname: g.name }, d.data())));
    } catch {}
  }
  if (!incoming.length) { pending = []; return render(); }
  let seen;
  try { const q = await F().getDocs(F().collection(hRef(ctx.profile.personal), "transfersSeen")); seen = new Set(q.docs.map(d => d.id)); }
  catch { return; }
  const next = incoming.filter(t => !seen.has(t.gid + "_" + t.id)).sort((a, b) => (a.created || 0) - (b.created || 0));
  const same = next.length === pending.length && next.every((t, i) => t.id === pending[i].id);
  pending = next;
  if (!same) render();
}
function render() {
  const bar = $("xferBar");
  bar.hidden = !pending.length;
  bar.innerHTML = pending.map((t, i) => `<div class="xfer-card" data-x="${i}">
    <div class="xfer-top"><b>${esc(t.fromName || "Someone")} sent you <span class="num">${esc(money(+t.amount))}</span></b><small>${esc(fmtDate(t.date))}${t.note ? " · “" + esc(t.note) + "”" : ""}</small></div>
    <div class="row2">
      <div class="field"><label for="xn${i}">Note</label><input id="xn${i}" data-xk="note" maxlength="160" value="${esc(t.note || "")}" placeholder="What it was for"></div>
      <div class="field"><label for="xc${i}">Counts as</label><select id="xc${i}" data-xk="cat">${INC_CATS.filter(c => !/loan/i.test(c)).map(c => `<option value="${esc(c)}"${c === "Side income" ? " selected" : ""}>Income · ${esc(c)}</option>`).join("")}<option value="__none">Don't count it (just passing through)</option></select></div>
      <div class="field"><label for="xd${i}">Date</label><input id="xd${i}" data-xk="date" type="date" value="${esc(t.date || todayISO())}"></div>
    </div>
    <div class="row-btns"><button class="primary" type="button" data-xok="${i}">Accept</button><button class="ghost" type="button" data-xno="${i}">Decline</button></div>
  </div>`).join("");
}
async function answer(i, accept, btn) {
  const t = pending[i]; if (!t) return;
  const card = btn.closest(".xfer-card"), val = k => card.querySelector(`[data-xk="${k}"]`).value;
  const key = t.gid + "_" + t.id, cat = val("cat"), note = val("note").trim(), date = val("date") || t.date;
  busy(btn, true);
  try {
    if (accept && cat !== "__none") {
      await F().setDoc(F().doc(personalEntries(), "xfer-" + t.gid + "-" + t.id), { type: "income", amount: r2(t.amount), date, category: cat,
        note: ("From " + (t.fromName || "someone") + (note ? ": " + note : "")).slice(0, 160), person: meId(), author: meId(), created: Date.now(),
        source: "transfer", transferId: t.id, transferGroup: t.gid });
    }
    await F().setDoc(seenRef(key), { status: accept ? (cat === "__none" ? "kept-out" : "accepted") : "declined", at: Date.now(), author: meId() });
    pending.splice(i, 1); render();
    toast(!accept ? "Declined" : cat === "__none" ? "Noted. It isn't counted as income." : "Added to your income");
  } catch { busy(btn, false); toast("That didn't work. Check your connection and try again."); }
}

// ---------- sending ----------
let people = []; // [{gid, gname, uid, name}]
async function loadPeople() {
  const out = [], seen = new Set();
  for (const g of myGroups()) {
    let d = g.id === ctx.hid ? state.household : null;
    if (!d) { try { const s = await F().getDoc(hRef(g.id)); d = s.exists() ? s.data() : null; } catch {} }
    if (!d) continue;
    (d.members || []).forEach(u => { if (u !== meId() && !seen.has(u)) { seen.add(u); out.push({ gid: g.id, gname: d.name || g.name, uid: u, name: (d.names || {})[u] || "Member" }); } });
  }
  return out;
}
export async function openSend() {
  if (state.readOnly) return toast("You can't send from here.");
  people = await loadPeople();
  if (!people.length) return toast("Sending works with people in your groups. Start or join a group first (Settings › Groups).");
  fillSelect($("xsTo"), people.map((p, i) => [String(i), p.name + (people.filter(x => x.name === p.name).length > 1 ? " (" + p.gname + ")" : "")]), "0");
  fillSelect($("xsSide"), [["", "Choose…"], ["__none", "Not my spending (just passing it on)"]].concat(EXP_CATS.filter(c => !/loan/i.test(c)).map(c => ["exp:" + c, "My spending: " + c])), "");
  $("xsAmt").value = ""; $("xsNote").value = ""; $("xsDate").value = todayISO(); $("xsErr").hidden = true;
  $("xferSendWrap").hidden = false; document.body.classList.add("sheet-open");
  setTimeout(() => $("xsAmt").focus(), 60);
}
function closeSend() { $("xferSendWrap").hidden = true; document.body.classList.remove("sheet-open"); }
async function send() {
  const p = people[+$("xsTo").value], amount = num($("xsAmt").value), side = $("xsSide").value, note = $("xsNote").value.trim(), date = $("xsDate").value || todayISO();
  const err = m => { $("xsErr").textContent = m; $("xsErr").hidden = false; };
  if (!p) return err("Pick who you're sending to.");
  if (!(amount > 0)) return err("Enter the amount.");
  if (!side) return err("Choose how it counts on your side.");
  const b = $("xsSend"); busy(b, true, "Sending…");
  try {
    const ref = F().doc(F().collection(hRef(p.gid), "transfers"));
    await F().setDoc(ref, { from: meId(), fromName: myName(), to: p.uid, toName: p.name, amount: r2(amount), date, note: note.slice(0, 160), created: Date.now(), author: meId() });
    if (side.startsWith("exp:")) {
      await F().setDoc(F().doc(personalEntries(), "xfer-out-" + p.gid + "-" + ref.id), { type: "expense", amount: r2(amount), date, category: side.slice(4),
        note: ("To " + p.name + (note ? ": " + note : "")).slice(0, 160), person: meId(), author: meId(), created: Date.now(), source: "transfer", transferId: ref.id, transferGroup: p.gid });
    }
    callFn("notifyTransfer", { gid: p.gid, tid: ref.id }).catch(() => {});
    busy(b, false); closeSend();
    toast("Sent. " + p.name + " gets a card to accept it.");
  } catch { busy(b, false); err("Couldn't send. Check your connection and try again."); }
}

export function initTransfers() {
  $("xferBar").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.xok !== undefined) answer(+b.dataset.xok, true, b);
    else if (b.dataset.xno !== undefined) answer(+b.dataset.xno, false, b);
  });
  document.addEventListener("click", ev => { if (ev.target.closest("[data-xfer]")) openSend(); });
  $("xsSend").addEventListener("click", send);
  $("xsClose").addEventListener("click", closeSend);
  $("xferSendWrap").addEventListener("click", ev => { if (ev.target === $("xferSendWrap")) closeSend(); });
  // look again when you come back to the app
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkTransfers(); });
}
