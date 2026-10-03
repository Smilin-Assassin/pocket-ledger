// Money sent between people in Pocket Ledger. The sender records it in transfers/{id}
// (addressed straight to the other person, no shared group needed). The receiver's app adds it
// to their own private space: the first time from someone they pick how it counts, after that
// it's added automatically (they can still change the note and category, never the amount).
// Older transfers recorded in a group's "transfers" are still picked up.
import { $, esc, money, num, r2, todayISO, fmtDate, toast, fillSelect } from "./util.js";
import { ctx, state, meId, isViewer, isGroup, hRef, uRef, EXP_CATS, INC_CATS, pname, mySettings, changed } from "./store.js";
import { callFn } from "./notify.js";

const F = () => ctx.F;
const myGroups = () => (ctx.spaces || []).filter(s => s.type === "group" && s.role === "member");
const myName = () => (ctx.profile && ctx.profile.name) || (state.my && state.my.name) || pname(meId()) || "Someone";
const personalEntries = () => F().collection(hRef(ctx.profile.personal), "entries");
const seenRef = key => F().doc(F().collection(hRef(ctx.profile.personal), "transfersSeen"), key);
const keyOf = t => t.gid ? t.gid + "_" + t.id : "d_" + t.id;
const entryIdOf = t => t.gid ? "xfer-" + t.gid + "-" + t.id : "xfer-d-" + t.id;
const rules = () => mySettings().xferRules || {};
const INC = () => INC_CATS.filter(c => !/loan/i.test(c));
// keep your own space's settings in step while a group is open (in Me the live listener does it)
function setMine(path, value) {
  const up = {}; up["settings." + path] = value;
  if (isGroup()) { const parts = path.split("."); let o = state.mySet = state.mySet || {}; parts.slice(0, -1).forEach(k => { o = o[k] = o[k] || {}; }); o[parts[parts.length - 1]] = value; }
  F().updateDoc(hRef(ctx.profile.personal), up).catch(() => {});
}

// ---------- receiving ----------
let pending = [];
export async function checkTransfers() {
  if (!ctx.F || isViewer() || !ctx.profile.personal) return;
  const me = meId(), incoming = [];
  try {
    const q = await F().getDocs(F().query(F().collection(ctx.db, "transfers"), F().where("to", "==", me)));
    q.docs.forEach(d => incoming.push(Object.assign({ id: d.id }, d.data())));
  } catch {}
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
  const fresh = incoming.filter(t => !seen.has(keyOf(t))).sort((a, b) => (a.created || 0) - (b.created || 0));
  // people you've already chosen a category for: added straight away
  const auto = fresh.filter(t => rules()[t.from]), ask = fresh.filter(t => !rules()[t.from]);
  auto.forEach(t => accept(t, { cat: rules()[t.from].cat, note: t.note || "", date: t.date || todayISO() }, true));
  if (auto.length) {
    const tot = auto.reduce((a, t) => a + (+t.amount || 0), 0), who = [...new Set(auto.map(t => t.fromName || "Someone"))].join(" and ");
    toast(who + " sent you " + money(tot) + ". Added to your income.", isGroup() ? { action: "Open Me", onAction: () => ctx.switchTo(ctx.profile.personal), ms: 7000 }
      : { action: "Edit", onAction: () => import("./pages/entries.js").then(m => m.startEdit(entryIdOf(auto[auto.length - 1]))), ms: 7000 });
  }
  const same = ask.length === pending.length && ask.every((t, i) => t.id === pending[i].id);
  pending = ask;
  if (!same) render();
}
function render() {
  const bar = $("xferBar");
  bar.hidden = !pending.length;
  // money sent to you is yours: you choose how it counts in your own space (Me), never in a shared group
  if (isGroup()) {
    const tot = pending.reduce((a, t) => a + (+t.amount || 0), 0), who = [...new Set(pending.map(t => t.fromName || "Someone"))].join(" and ");
    bar.innerHTML = pending.length ? `<div class="xfer-card xfer-mini"><span>${esc(who)} sent you <b class="num">${esc(money(tot))}</b>. It goes to your own space.</span><button class="primary" type="button" data-xme="1">Open Me</button></div>` : "";
    return;
  }
  bar.innerHTML = pending.map((t, i) => `<div class="xfer-card" data-x="${i}">
    <div class="xfer-top"><b>${esc(t.fromName || "Someone")} sent you <span class="num">${esc(money(+t.amount))}</span></b><small>${esc(fmtDate(t.date))}${t.note ? ", “" + esc(t.note) + "”" : ""}</small></div>
    <div class="row2">
      <div class="field"><label for="xn${i}">Note</label><input id="xn${i}" data-xk="note" maxlength="160" value="${esc(t.note || "")}" placeholder="What it was for"></div>
      <div class="field"><label for="xc${i}">Counts as</label><select id="xc${i}" data-xk="cat">${INC().map(c => `<option value="${esc(c)}"${c === "Side income" ? " selected" : ""}>Income: ${esc(c)}</option>`).join("")}<option value="__none">Don't count it (just passing through)</option></select></div>
      <div class="field"><label for="xd${i}">Date</label><input id="xd${i}" data-xk="date" type="date" value="${esc(t.date || todayISO())}"></div>
    </div>
    <label class="check"><input type="checkbox" data-xk="auto" checked><span>Add money from ${esc(t.fromName || "them")} like this automatically next time<small>You can still change the note and category afterwards. Change this in Settings › Notifications.</small></span></label>
    <div class="row-btns"><button class="primary" type="button" data-xok="${i}">Add to my income</button><button class="ghost" type="button" data-xno="${i}">Decline</button></div>
  </div>`).join("");
}
// add it to your own space (both writes together; they show at once and sync in the background)
function accept(t, o, quiet) {
  const b = F().writeBatch(ctx.db);
  if (o.cat !== "__none") {
    b.set(F().doc(personalEntries(), entryIdOf(t)), Object.assign({ type: "income", amount: r2(t.amount), date: o.date, category: o.cat,
      note: ("From " + (t.fromName || "someone") + (o.note ? ": " + o.note : "")).slice(0, 160), person: meId(), author: meId(), created: Date.now(),
      source: "transfer", transferId: t.id, transferFrom: t.from || "" }, t.gid ? { transferGroup: t.gid } : {}));
  }
  b.set(seenRef(keyOf(t)), { status: o.cat === "__none" ? "kept-out" : quiet ? "auto" : "accepted", at: Date.now(), author: meId() });
  b.commit().catch(() => { if (!quiet) toast("That didn't sync. Check your connection; it will try again."); });
}
function answer(i, yes, btn) {
  const t = pending[i]; if (!t) return;
  const card = btn.closest(".xfer-card"), el = k => card.querySelector(`[data-xk="${k}"]`);
  const o = { cat: el("cat").value, note: el("note").value.trim(), date: el("date").value || t.date || todayISO() };
  if (yes) {
    accept(t, o, false);
    if (el("auto").checked && o.cat !== "__none" && t.from) setMine("xferRules." + t.from, { cat: o.cat, name: (t.fromName || "").slice(0, 40) });
    rememberContact(t.from, t.fromName);
  } else {
    F().setDoc(seenRef(keyOf(t)), { status: "declined", at: Date.now(), author: meId() }).catch(() => {});
  }
  pending.splice(i, 1); render();
  toast(!yes ? "Declined" : o.cat === "__none" ? "Noted. It isn't counted as income." : "Added to your income");
}

// ---------- Settings › Notifications: people whose money is added automatically ----------
export function renderXferRules() {
  const box = $("xferRules"); if (!box) return;
  const r = rules(), ids = Object.keys(r);
  box.innerHTML = ids.length ? ids.map(u => `<div class="priv-row"><span>${esc(r[u].name || "Someone")}<small class="hint">: added as </small></span><span class="row-btns"><select data-xrcat="${esc(u)}" aria-label="Category for money from ${esc(r[u].name || "them")}">${INC().map(c => `<option${c === r[u].cat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select><button class="icon-btn" type="button" data-xroff="${esc(u)}">Ask each time</button></span></div>`).join("")
    : `<p class="hint">Nobody yet. When someone sends you money, you can choose to have it added automatically after the first time.</p>`;
}
function onRulesClick(ev) {
  const b = ev.target.closest("[data-xroff]"); if (!b) return;
  const r = Object.assign({}, rules()); delete r[b.dataset.xroff];
  setMine("xferRules", r); toast("You'll be asked next time"); setTimeout(renderXferRules, 50);
}
function onRulesChange(ev) {
  const s = ev.target.closest("[data-xrcat]"); if (!s) return;
  const u = s.dataset.xrcat, cur = rules()[u] || {};
  setMine("xferRules." + u, Object.assign({}, cur, { cat: s.value })); toast("Money from " + (cur.name || "them") + " will be added as " + s.value);
}

// ---------- sending ----------
let people = []; // [{uid, name}]
function rememberContact(uid, name) {
  if (!uid || uid === meId()) return;
  const list = (mySettings().contacts || []).filter(c => c.uid !== uid).concat({ uid, name: String(name || "Someone").slice(0, 40) }).slice(-30);
  setMine("contacts", list);
}
async function loadPeople() {
  const out = [], seen = new Set([meId()]), add = (uid, name) => { if (uid && !seen.has(uid)) { seen.add(uid); out.push({ uid, name: name || "Someone" }); } };
  (mySettings().contacts || []).forEach(c => add(c.uid, c.name));
  try {
    const [a, b] = await Promise.all(["from", "to"].map(f => F().getDocs(F().query(F().collection(ctx.db, "transfers"), F().where(f, "==", meId())))));
    a.docs.forEach(d => add(d.data().to, d.data().toName)); b.docs.forEach(d => add(d.data().from, d.data().fromName));
  } catch {}
  for (const g of myGroups()) {
    let d = g.id === ctx.hid ? state.household : null;
    if (!d) { try { const s = await F().getDoc(hRef(g.id)); d = s.exists() ? s.data() : null; } catch {} }
    if (d) (d.members || []).forEach(u => add(u, (d.names || {})[u] || "Member"));
  }
  return out;
}
function fillTo(pick) {
  fillSelect($("xsTo"), people.map(p => [p.uid, p.name]).concat([["__find", "Someone else (by email)…"]]), pick || (people[0] ? people[0].uid : "__find"));
  $("xsFindRow").hidden = $("xsTo").value !== "__find";
}
export async function openSend() {
  if (state.readOnly) return toast("You can't send from here.");
  people = await loadPeople();
  fillTo();
  fillSelect($("xsSide"), [["", "Choose…"], ["__none", "Not my spending (just passing it on)"]].concat(EXP_CATS.filter(c => !/loan/i.test(c)).map(c => ["exp:" + c, "My spending: " + c])), "");
  $("xsAmt").value = ""; $("xsNote").value = ""; $("xsDate").value = todayISO(); $("xsErr").hidden = true; $("xsEmail").value = "";
  $("xferSendWrap").hidden = false; document.body.classList.add("sheet-open");
  setTimeout(() => ($("xsTo").value === "__find" ? $("xsEmail") : $("xsAmt")).focus(), 60);
}
function closeSend() { $("xferSendWrap").hidden = true; document.body.classList.remove("sheet-open"); }
async function findByEmail() {
  const email = $("xsEmail").value.trim(), err = m => { $("xsErr").textContent = m; $("xsErr").hidden = !m; };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err("Type their email, the one they sign in to Pocket Ledger with.");
  $("xsFind").disabled = true; err("");
  try {
    const r = await callFn("people", { action: "lookup", email });
    const p = r && r.data ? r.data : r;
    if (!people.some(x => x.uid === p.uid)) people.push({ uid: p.uid, name: p.name });
    rememberContact(p.uid, p.name); fillTo(p.uid); $("xsAmt").focus();
  } catch (e) { err((e && e.message && !/internal/i.test(e.message)) ? e.message.replace(/^.*?: /, "") : "Couldn't look that up. Check your connection and try again."); }
  $("xsFind").disabled = false;
}
function send() {
  const to = $("xsTo").value, p = people.find(x => x.uid === to), amount = num($("xsAmt").value), side = $("xsSide").value, note = $("xsNote").value.trim(), date = $("xsDate").value || todayISO();
  const err = m => { $("xsErr").textContent = m; $("xsErr").hidden = false; };
  if (!p) return err(to === "__find" ? "Find the person by their email first." : "Pick who you're sending to.");
  if (!(amount > 0)) return err("Enter the amount.");
  if (!side) return err("Choose how it counts on your side.");
  // the transfer (addressed to them) and your side (in your own space) are saved together, at once
  const ref = F().doc(F().collection(ctx.db, "transfers")), wb = F().writeBatch(ctx.db);
  wb.set(ref, { from: meId(), fromName: myName(), to: p.uid, toName: p.name, amount: r2(amount), date, note: note.slice(0, 160), created: Date.now(), author: meId() });
  if (side.startsWith("exp:")) {
    wb.set(F().doc(personalEntries(), "xfer-out-d-" + ref.id), { type: "expense", amount: r2(amount), date, category: side.slice(4),
      note: ("To " + p.name + (note ? ": " + note : "")).slice(0, 160), person: meId(), author: meId(), created: Date.now(), source: "transfer", transferId: ref.id, transferTo: p.uid });
  }
  wb.commit().then(() => callFn("notifyTransfer", { tid: ref.id }).catch(() => {}))
    .catch(() => toast("Sending didn't sync. Check your connection and try again."));
  rememberContact(p.uid, p.name);
  closeSend();
  toast("Sent. " + p.name + " gets it in their own income.");
}

export function initTransfers() {
  $("xferBar").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.xme) { ctx.switchTo(ctx.profile.personal); return; }
    if (b.dataset.xok !== undefined) answer(+b.dataset.xok, true, b);
    else if (b.dataset.xno !== undefined) answer(+b.dataset.xno, false, b);
  });
  document.addEventListener("click", ev => { if (ev.target.closest("[data-xfer]")) openSend(); });
  $("xsSend").addEventListener("click", send);
  $("xsFind").addEventListener("click", findByEmail);
  $("xsEmail").addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); findByEmail(); } });
  $("xsTo").addEventListener("change", () => { $("xsFindRow").hidden = $("xsTo").value !== "__find"; if ($("xsTo").value === "__find") $("xsEmail").focus(); });
  $("xsClose").addEventListener("click", closeSend);
  $("xferSendWrap").addEventListener("click", ev => { if (ev.target === $("xferSendWrap")) closeSend(); });
  const rb = $("xferRules"); if (rb) { rb.addEventListener("click", onRulesClick); rb.addEventListener("change", onRulesChange); }
  // look again when you come back to the app
  document.addEventListener("visibilitychange", () => { if (!document.hidden) checkTransfers(); });
}
