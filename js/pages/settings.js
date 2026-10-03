// Settings: your details, this device, groups, privacy, invites, recently deleted, backup, account.
import { $, esc, num, lsGet, lsSet, toast, ago, busy } from "../util.js";
import { ctx, state, ui, db, meId, isGroup, isViewer, isOwner, people, pname, pcolor, hRef, uRef, PCOLORS, changed } from "../store.js";
import * as lock from "../lock.js";
import * as notify from "../notify.js";
import * as gem from "../gemini.js";
import * as backup from "../backup.js";
import { exportCsv } from "./entries.js";
import { M, PAGES, PRESETS, saveMotion, refreshHz, measureHz, reduced } from "../motion.js";
import { NAMES, fitsSix, motionChanged } from "../dock.js";

const last4 = v => String(v || "").split(/[,\s]+/).map(x => x.replace(/\D/g, "").slice(-4)).filter(x => x.length === 4).join(", ");
const inviteUrl = id => location.origin + location.pathname + "?join=" + id;
const appInviteUrl = (code, group) => location.origin + location.pathname + "?invite=" + code + (group ? "&join=" + group : "");
const groupDocs = {};
let pickedColor = null;
const F = () => ctx.F;

// ---------- your details ----------
function myDetails() { return (isGroup() ? state.my : people()[0]) || {}; }
function fillMyDetails() {
  const me = meId(), p = myDetails(), ob = state.settings.openingBy || {};
  $("setName1").value = (isGroup() ? (state.household.names || {})[me] : p.name) || p.name || "";
  $("setOpen1").value = isGroup() ? "" : (ob[me] || "");
  $("setBank1").value = p.bank || "";
  acctRows = (p.accounts && p.accounts.length ? p.accounts : String(p.acct || "").split(/[,\s]+/).filter(d => /^\d{4}$/.test(d)).map(d => ({ bank: "", name: "", last4: d })))
    .map(a => Object.assign({ bank: "", name: "", last4: "" }, a));
  if (!acctRows.length) acctRows = [{ bank: "", name: "", last4: "" }];
  renderAccts();
  $("setCurrency").value = state.settings.currency || "MVR";
  $("setCurrency").disabled = isGroup() && !isOwner();
  $("setCurrencyL").textContent = isGroup() ? "Currency for " + (state.household.name || "this group") : "Currency";
  $("setOpenF").hidden = isGroup(); $("setOpenHint").hidden = isGroup();
  pickedColor = null; renderColors();
}
// your bank accounts: bank, a nickname and the last 4 digits (nothing more is kept)
let acctRows = [];
function renderAccts() {
  $("acctList").innerHTML = acctRows.map((a, i) => `<div class="acct-row" data-ai="${i}">
    <select data-ak="bank" aria-label="Bank">${[["", "Bank"], ["BML", "BML"], ["MIB", "MIB"], ["Other", "Other"]].map(([v, l]) => `<option value="${v}"${a.bank === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    <input data-ak="name" maxlength="30" placeholder="Nickname, e.g. Savings" value="${esc(a.name)}" aria-label="Nickname">
    <input data-ak="last4" maxlength="4" inputmode="numeric" placeholder="Last 4" value="${esc(a.last4)}" aria-label="Last 4 digits" class="num">
    <button class="icon-btn" type="button" data-acctdel="${i}" aria-label="Remove this account">✕</button></div>`).join("");
}
function readAccts() {
  document.querySelectorAll("#acctList .acct-row").forEach(row => {
    const a = acctRows[+row.dataset.ai]; if (!a) return;
    row.querySelectorAll("[data-ak]").forEach(el => { a[el.dataset.ak] = el.value; });
  });
}
function renderColors() {
  const me = meId(), cur = pickedColor || pcolor(me);
  $("pcol1").innerHTML = `<span>Your colour</span>` + PCOLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" aria-label="${c}" aria-pressed="${c === cur}"></button>`).join("");
}
async function saveMyDetails() {
  const me = meId(), name = $("setName1").value.trim() || "Me", o1 = num($("setOpen1").value || "0");
  if (!(o1 >= 0)) return toast("Starting savings can't be negative.");
  const color = pickedColor || pcolor(me);
  readAccts();
  const accounts = acctRows.map(a => ({ bank: a.bank, name: a.name.trim().slice(0, 30), last4: last4(a.last4) })).filter(a => a.last4);
  const mine = { id: me, name, bank: $("setBank1").value.trim(), acct: [...new Set(accounts.map(a => a.last4))].join(", "), accounts, color };
  const cur = $("setCurrency").value, jobs = [], pid = ctx.profile.personal;
  if (pid && (!isGroup() || state.my)) {
    const up = { "settings.people": [mine] };
    if (!isGroup()) { up["settings.openingBy"] = { [me]: o1 }; up["settings.opening"] = o1; up["settings.currency"] = cur; }
    jobs.push(F().updateDoc(hRef(pid), up));
  }
  (ctx.spaces || []).filter(s => s.type === "group" && s.role === "member").forEach(s => {
    jobs.push(F().updateDoc(hRef(s.id), { ["names." + me]: name, ["colors." + me]: color }));
    if (isGroup() && s.id === ctx.hid && isOwner()) jobs.push(F().updateDoc(hRef(s.id), { "settings.currency": cur }));
  });
  jobs.push(F().setDoc(uRef(), { name }, { merge: true }));
  state.my = mine; ctx.profile.name = name;
  const b = $("saveSettings"); busy(b, true, "Saving…");
  try { await Promise.all(jobs); toast("Saved"); } catch { toast("Couldn't save. Check your connection and try again."); }
  busy(b, false);
}

// ---------- appearance (this device) ----------
function syncAppearance() {
  const mode = lsGet("pl-mode") || "auto", preset = document.documentElement.getAttribute("data-preset") || "lagoon", fs = lsGet("pl-fs") || "m";
  const glass = preset === "glass";
  document.querySelectorAll("#modeSeg button").forEach(b => { b.disabled = glass; });
  $("glassNote").hidden = !glass; $("amoledRow").hidden = glass;
  document.querySelectorAll("#set-look [data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === (glass ? "light" : mode))));
  document.querySelectorAll("#set-look .theme-sw").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.preset === preset)));
  document.querySelectorAll("#fsSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.fs === fs)));
  $("setAmoled").checked = lsGet("pl-amoled") === "1";
  // motion, dock and vibrations
  document.querySelectorAll("#motionSeg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.motion === M.preset)));
  $("motionHint").textContent = reduced() ? "Your phone is set to reduce motion, so animations are kept short." : ({ calm: "Smooth and quick, hardly any bounce.", lively: "A little stretch and bounce.", jelly: "Stretchy and wobbly. The fun one." })[M.preset];
  const six = fitsSix(), tabs = six ? M.tabs : 4;
  document.querySelectorAll("#dockSizeSeg button").forEach(b => { b.setAttribute("aria-pressed", String(+b.dataset.tabs === tabs)); b.disabled = b.dataset.tabs === "6" && !six; });
  const picks = $("dockPicks"); picks.hidden = tabs === 6;
  picks.innerHTML = PAGES.map(p => `<label class="dp"><input type="checkbox" data-dpick="${p}" ${dockDraft.includes(p) ? "checked" : ""} ${!dockDraft.includes(p) && dockDraft.length >= 3 ? "disabled" : ""}><span>${NAMES[p]}</span></label>`).join("");
  const side = n => glass ? "" : ", " + n + " on each side of the +";
  $("dockFit").textContent = tabs === 6 ? "All six pages are in your dock" + side("three") + "."
    : dockDraft.length < 3 ? "Pick " + (3 - dockDraft.length) + " more. The 4th tab is More, which holds the rest."
    : "Three pages plus More" + side("two") + "." + (six ? "" : " Your screen is too narrow for 6 tabs, so it stays at 4. The dock only uses 4 or 6 so it stays balanced.");
  const hz = refreshHz(), hzText = n => "Your screen runs at up to " + n + " Hz while things move. Animations follow it automatically.";
  $("hzNote").textContent = hz ? hzText(hz) : "Animations follow your screen's refresh rate automatically (60, 90, 120 Hz or more).";
  if (!hz) measureHz(() => { const n = $("hzNote"); if (n) n.textContent = hzText(refreshHz()); });
  $("setBuzz").checked = !!M.buzz;
}
let dockDraft = M.dock.slice();
function motionSaved() { saveMotion(); motionChanged(); syncAppearance(); }

// ---------- groups ----------
async function renderGroups() {
  const box = $("grpList"), groups = (ctx.spaces || []).filter(s => s.type === "group" && s.role === "member");
  $("grpInfo").textContent = groups.length ? "Everyone in a group sees its entries. Only the person who added something can change it." : "You're not in any groups yet. A group is for shared costs, like a household or a trip.";
  for (const g of groups) {
    if (g.id === ctx.hid) groupDocs[g.id] = state.household;
    else if (!groupDocs[g.id]) { try { const s = await F().getDoc(hRef(g.id)); if (s.exists()) groupDocs[g.id] = s.data(); } catch {} }
  }
  box.innerHTML = groups.map(g => {
    const d = groupDocs[g.id] || {}, own = d.owner === meId(), open = (d.joinUntil || 0) > Date.now();
    const names = (d.members || []).map(u => (d.names || {})[u] || "Member");
    return `<div class="grp" data-g="${esc(g.id)}">
      <div class="grp-top"><b>${esc(d.name || g.name)}</b><small>${esc(names.join(", "))}${own ? " · you made this group" : ""}</small></div>
      ${own ? `<div class="grp-rename"><input data-rename="${esc(g.id)}" maxlength="30" value="${esc(d.name || g.name)}" aria-label="Group name"><button class="ghost" type="button" data-renameok="${esc(g.id)}">Rename</button></div>
      <div class="field"><label for="inv-${esc(g.id)}">Invite link</label><input id="inv-${esc(g.id)}" readonly value="${esc(inviteUrl(g.id))}"></div>
      <p class="hint">${open ? "Invitations are open until " + esc(new Date(d.joinUntil).toLocaleDateString(undefined, { day: "numeric", month: "short" })) + ". People who already use Pocket Ledger can join with the link." + (ctx.admin ? " For someone new, make an invite under Invite people." : " Someone new also needs an invite from the app's admin.") : "Invitations are closed, so the link doesn't let anyone join."}</p>
      <div class="formfoot"><button class="ghost" type="button" data-copy="${esc(g.id)}">Copy link</button>${navigator.share ? `<button class="ghost" type="button" data-share="${esc(g.id)}">Share</button>` : ""}<button class="ghost" type="button" data-inv="${esc(g.id)}" data-open="${open ? 0 : 1}">${open ? "Close invitations" : "Open invitations for 7 days"}</button></div>`
      : `<div class="formfoot"><button class="ghost" type="button" data-leave="${esc(g.id)}">Leave group</button></div>`}
    </div>`;
  }).join("");
}

// ---------- privacy: who can see my own dashboard ----------
async function requestsWhere(field) {
  const q = await F().getDocs(F().query(F().collection(ctx.db, "viewRequests"), F().where(field, "==", meId())));
  return q.docs.map(d => Object.assign({ id: d.id }, d.data()));
}
async function renderPrivacy() {
  const box = $("privList");
  let mineOut = [], toMe = [];
  try { [mineOut, toMe] = await Promise.all([requestsWhere("from"), requestsWhere("to")]); }
  catch { box.innerHTML = `<p class="hint">Connect to the internet to see who can view your dashboard.</p>`; return; }
  const seeing = toMe.filter(r => r.status === "accepted"), others = {};
  (ctx.spaces || []).filter(s => s.type === "group").forEach(s => {
    const d = groupDocs[s.id] || (s.id === ctx.hid ? state.household : null); if (!d) return;
    (d.members || []).forEach(u => { if (u !== meId()) others[u] = { name: (d.names || {})[u] || "Member", group: s.id }; });
  });
  const asked = new Set(mineOut.filter(r => r.status === "pending" || r.status === "accepted").map(r => r.to));
  let html = `<p class="hint">${seeing.length ? "These people can see your own dashboard (view only):" : "Nobody else can see your own entries."}</p>`;
  html += seeing.map(r => `<div class="priv-row"><span>${esc(r.fromName || "Someone")}</span><button class="ghost" type="button" data-revoke="${esc(r.id)}|${esc(r.from)}">Stop sharing</button></div>`).join("");
  const outs = mineOut.filter(r => r.status === "pending" || r.status === "declined");
  if (outs.length) html += `<p class="hint">Your requests:</p>` + outs.map(r => `<div class="priv-row"><span>${esc(r.toName || "Someone")}: ${r.status === "pending" ? "waiting" : "said no"}</span><button class="icon-btn" type="button" data-cancelreq="${esc(r.id)}">${r.status === "pending" ? "Cancel" : "Clear"}</button></div>`).join("");
  const can = Object.keys(others).filter(u => !asked.has(u));
  if (can.length) html += `<p class="hint">Ask to see someone's own dashboard:</p>` + can.map(u => `<div class="priv-row"><span>${esc(others[u].name)}</span><button class="ghost" type="button" data-ask="${esc(u)}|${esc(others[u].group)}" data-askname="${esc(others[u].name)}">Ask to see</button></div>`).join("");
  box.innerHTML = html;
}

// ---------- someone asked to see my dashboard (banner on every page) ----------
let reqQueue = [];
export async function checkRequests() {
  if (!ctx.F || !ctx.profile.personal || isViewer()) return;
  try { const q = await F().getDocs(F().query(F().collection(ctx.db, "viewRequests"), F().where("to", "==", meId()), F().where("status", "==", "pending"))); reqQueue = q.docs.map(d => Object.assign({ id: d.id }, d.data())); }
  catch { reqQueue = []; }
  renderReqBar();
}
function renderReqBar() {
  const bar = $("reqBar"), r = reqQueue[0];
  bar.hidden = !r; $("settingsBadge").hidden = !r;
  if (!r) return;
  bar.innerHTML = `<span><b>${esc(r.fromName || "Someone")}</b> would like to see your own dashboard. They'd only be able to look, not change anything. You can stop it any time in Settings › Privacy.</span><span class="row-btns"><button class="primary" type="button" data-reqok="${esc(r.id)}">Allow</button><button class="ghost" type="button" data-reqno="${esc(r.id)}">Don't allow</button></span>`;
}
async function answerRequest(ev) {
  const b = ev.target.closest("button"); if (!b) return;
  const r = reqQueue.find(x => x.id === (b.dataset.reqok || b.dataset.reqno)); if (!r) return;
  try {
    if (b.dataset.reqok) {
      await F().updateDoc(hRef(ctx.profile.personal), { viewers: F().arrayUnion(r.from) });
      await F().updateDoc(F().doc(ctx.db, "viewRequests", r.id), { status: "accepted", space: ctx.profile.personal, toName: ctx.profile.name || pname(meId()), answered: Date.now() });
      toast((r.fromName || "They") + " can now see your dashboard");
    } else {
      await F().updateDoc(F().doc(ctx.db, "viewRequests", r.id), { status: "declined", answered: Date.now() });
      toast("Request declined");
    }
    reqQueue = reqQueue.filter(x => x.id !== r.id); renderReqBar();
  } catch { toast("That didn't work. Check your connection and try again."); }
}

// ---------- invites (admins only) ----------
function newCode() { const ch = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789", a = new Uint32Array(12); crypto.getRandomValues(a); return [...a].map(n => ch[n % ch.length]).join(""); }
let invites = [];
async function renderInvites() {
  const sec = $("invSec"); sec.hidden = !ctx.admin; $("invIdx").hidden = !ctx.admin;
  if (!ctx.admin) return;
  const own = (ctx.spaces || []).filter(s => s.type === "group" && s.role === "member" && s.owner === meId());
  const gs = $("invGroup"), cur = gs.value;
  gs.innerHTML = `<option value="">Just the app (their own space)</option>` + own.map(g => `<option value="${esc(g.id)}">Also add them to ${esc(g.name)}</option>`).join("");
  if ([...gs.options].some(o => o.value === cur)) gs.value = cur;
  const box = $("invList");
  try {
    const q = await F().getDocs(F().query(F().collection(ctx.db, "invites"), F().where("by", "==", meId())));
    invites = q.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (b.created || 0) - (a.created || 0));
    const gname = id => ((ctx.spaces || []).find(s => s.id === id) || {}).name || "";
    box.innerHTML = !invites.length ? `<p class="hint">No invites yet.</p>` : invites.map(i => {
      const used = (i.used || []).length >= (i.max || 1), expired = (i.expires || 0) < Date.now(), live = !used && !expired;
      const st = used ? "Used" + (i.usedBy && i.usedBy.length ? " by " + i.usedBy.join(", ") : "") : expired ? "Expired" : "Open until " + new Date(i.expires).toLocaleDateString(undefined, { day: "numeric", month: "short" });
      return `<div class="grp"><div class="grp-top"><b>${esc(i.note || "Invite")}</b><small>${esc(st)}${i.group && gname(i.group) ? " · joins " + esc(gname(i.group)) : ""}</small></div>
        ${live ? `<div class="field"><input readonly value="${esc(appInviteUrl(i.id, i.group))}" aria-label="Invite link"></div>` : ""}
        <div class="formfoot">${live ? `<button class="ghost" type="button" data-invcopy="${esc(i.id)}">Copy link</button>${navigator.share ? `<button class="ghost" type="button" data-invshare="${esc(i.id)}">Share</button>` : ""}` : ""}<button class="icon-btn" type="button" data-invdel="${esc(i.id)}">${live ? "Cancel invite" : "Remove"}</button></div></div>`;
    }).join("");
  } catch { box.innerHTML = `<p class="hint">Connect to the internet to see your invites.</p>`; }
}

// ---------- recently deleted ----------
const TRASH_DAYS = 30;
let trash = [];
export function describe(c, x) {
  x = x || {};
  const m = v => { try { return new Intl.NumberFormat(undefined, { style: "currency", currency: state.settings.currency || "MVR", currencyDisplay: "code" }).format(+v || 0); } catch { return String(v); } };
  if (c === "entries") return (x.type === "income" ? "Income" : x.type === "save" ? "Saved" : x.type === "withdraw" ? "Took out" : "Spent") + " " + m(x.amount) + (x.category ? ", " + x.category : "") + (x.note ? ", " + x.note : "") + (x.date ? ", " + x.date : "");
  if (c === "goals") return "Goal: " + (x.name || "untitled");
  if (c === "loans") return "Loan: " + (x.counterparty || "someone") + " · " + m(x.amount);
  if (c === "recurring") return "Reminder: " + (x.note || x.category || "bill") + " · " + m(x.amount);
  if (c === "settlements") return "Settle-up · " + m(x.amount);
  return c;
}
async function renderTrash() {
  const box = $("trashList");
  $("set-trash").hidden = isViewer();
  if (isViewer()) return;
  try {
    const q = await F().getDocs(F().collection(hRef(), "trash"));
    const all = q.docs.map(d => Object.assign({ id: d.id }, d.data())).filter(t => t.author === meId());
    const old = all.filter(t => Date.now() - (t.deletedAt || 0) > TRASH_DAYS * 864e5);
    old.forEach(t => F().deleteDoc(F().doc(F().collection(hRef(), "trash"), t.id)).catch(() => {}));
    trash = all.filter(t => !old.includes(t)).sort((a, b) => b.deletedAt - a.deletedAt);
    box.innerHTML = !trash.length ? `<p class="hint">Nothing deleted in the last ${TRASH_DAYS} days${isGroup() ? " by you in this group" : ""}.</p>`
      : trash.slice(0, 50).map(t => `<div class="priv-row"><span>${esc(describe(t.col, t.data))}<small class="hint"> · deleted ${esc(ago(t.deletedAt))}</small></span><button class="ghost" type="button" data-untrash="${esc(t.id)}">Restore</button></div>`).join("");
  } catch { box.innerHTML = `<p class="hint">Connect to the internet to see deleted items.</p>`; }
}

// ---------- one click handler for the whole page ----------
async function onClick(ev) {
  const b = ev.target.closest("button"); if (!b) return;
  const d = b.dataset;
  if (d.c && b.closest("#pcol1")) { pickedColor = d.c; renderColors(); return; }
  if (b.id === "acctAdd") { readAccts(); acctRows.push({ bank: "", name: "", last4: "" }); renderAccts(); const ins = $("acctList").querySelectorAll("[data-ak=name]"); if (ins.length) ins[ins.length - 1].focus(); return; }
  if (d.acctdel !== undefined) { readAccts(); acctRows.splice(+d.acctdel, 1); if (!acctRows.length) acctRows.push({ bank: "", name: "", last4: "" }); renderAccts(); return; }
  try {
    if (b.id === "saveSettings") return saveMyDetails();
    if (d.mode) { lsSet("pl-mode", d.mode === "auto" ? "" : d.mode); window.plApplyTheme(); syncAppearance(); }
    else if (d.preset) { lsSet("pl-preset", d.preset); window.plApplyTheme(); motionChanged(); syncAppearance(); }
    else if (d.motion) { M.preset = PRESETS[d.motion] ? d.motion : "lively"; motionSaved(); }
    else if (d.tabs) { M.tabs = d.tabs === "6" ? 6 : 4; motionSaved(); }
    else if (d.fs) { lsSet("pl-fs", d.fs === "m" ? "" : d.fs); window.plApplyTheme(); syncAppearance(); changed(); }
    else if (d.renameok) {
      const name = (document.querySelector(`[data-rename="${CSS.escape(d.renameok)}"]`).value || "").trim().slice(0, 30);
      if (!name) return toast("Type a name for the group.");
      await F().updateDoc(hRef(d.renameok), { name }); (groupDocs[d.renameok] || {}).name = name; if (d.renameok === ctx.hid) state.household.name = name;
      const sp = ctx.spaces.find(s => s.id === d.renameok); if (sp) sp.name = name;
      toast("Group renamed"); renderGroups(); changed();
    } else if (d.copy) {
      try { await navigator.clipboard.writeText(inviteUrl(d.copy)); toast("Invite link copied"); } catch { toast("Select and copy the link"); }
    } else if (d.share) {
      navigator.share({ title: "Pocket Ledger", text: "Join my group in Pocket Ledger", url: inviteUrl(d.share) }).catch(() => {});
    } else if (d.inv) {
      const until = d.open === "1" ? Date.now() + 7 * 864e5 : 0;
      await F().updateDoc(hRef(d.inv), { joinUntil: until }); if (groupDocs[d.inv]) groupDocs[d.inv].joinUntil = until; if (d.inv === ctx.hid) state.household.joinUntil = until;
      toast(until ? "Invitations open for 7 days" : "Invitations closed"); renderGroups();
    } else if (d.leave) {
      if (!d.sure) { b.dataset.sure = "1"; b.textContent = "Tap again to leave"; return; }
      await F().updateDoc(hRef(d.leave), { members: F().arrayRemove(meId()) });
      await F().setDoc(uRef(), { spaces: F().arrayRemove(d.leave) }, { merge: true });
      toast("You left the group");
      if (d.leave === ctx.hid) ctx.switchTo(ctx.profile.personal); else { ctx.spaces = ctx.spaces.filter(s => s.id !== d.leave); renderGroups(); changed(); }
    } else if (b.id === "grpCreate") {
      const name = $("grpNewName").value.trim().slice(0, 30);
      if (!name) return toast("Give the group a name first.");
      const me = meId(), ref = F().doc(F().collection(ctx.db, "households"));
      await F().setDoc(ref, { type: "group", name, owner: me, members: [me], names: { [me]: ctx.profile.name || pname(me) || "Me" }, colors: { [me]: pcolor(me) },
        created: Date.now(), joinUntil: Date.now() + 7 * 864e5, ai: { server: gem.serverAI() }, settings: { currency: state.settings.currency || "MVR", opening: 0 } });
      await F().setDoc(uRef(), { spaces: F().arrayUnion(ref.id) }, { merge: true });
      toast("Group created. Send the invite link from Settings › Groups."); ctx.switchTo(ref.id);
    } else if (b.id === "grpJoin") {
      let c = $("grpJoinCode").value.trim(); const m = c.match(/join=([A-Za-z0-9_-]+)/); if (m) c = m[1];
      if (!/^[A-Za-z0-9_-]{3,40}$/.test(c)) return toast("That invite code doesn't look right.");
      await ctx.joinGroup(c); toast("You joined the group"); ctx.switchTo(c);
    } else if (d.ask) {
      const [to, group] = d.ask.split("|");
      await F().setDoc(F().doc(F().collection(ctx.db, "viewRequests")), { from: meId(), fromName: ctx.profile.name || pname(meId()), to, toName: d.askname || "", status: "pending", created: Date.now(), group });
      toast("Asked. They'll see your request next time they open Pocket Ledger."); renderPrivacy();
    } else if (d.cancelreq) {
      await F().deleteDoc(F().doc(ctx.db, "viewRequests", d.cancelreq)); renderPrivacy();
    } else if (d.revoke) {
      const [rid, who] = d.revoke.split("|");
      await F().updateDoc(hRef(ctx.profile.personal), { viewers: F().arrayRemove(who) });
      await F().updateDoc(F().doc(ctx.db, "viewRequests", rid), { status: "revoked", answered: Date.now() });
      toast("They can't see your dashboard any more"); renderPrivacy();
    } else if (b.id === "invMake") {
      const note = $("invNote").value.trim().slice(0, 40), group = $("invGroup").value, code = newCode(), expires = Date.now() + 7 * 864e5;
      b.disabled = true;
      await F().setDoc(F().doc(ctx.db, "invites", code), { by: meId(), note, group: group || null, created: Date.now(), expires, max: 1, used: [] });
      if (group) { const gd = groupDocs[group] || (group === ctx.hid ? state.household : null); if (!gd || (gd.joinUntil || 0) < expires) { await F().updateDoc(hRef(group), { joinUntil: expires }); if (gd) gd.joinUntil = expires; if (group === ctx.hid) state.household.joinUntil = expires; } }
      $("invNote").value = ""; b.disabled = false;
      try { await navigator.clipboard.writeText(appInviteUrl(code, group)); toast("Invite link made and copied. It works once, for 7 days."); } catch { toast("Invite link made. It works once, for 7 days."); }
      renderInvites();
    } else if (d.invcopy || d.invshare) {
      const i = invites.find(x => x.id === (d.invcopy || d.invshare)) || {}, url = appInviteUrl(i.id, i.group);
      if (d.invcopy) { try { await navigator.clipboard.writeText(url); toast("Invite link copied"); } catch { toast("Select and copy the link"); } }
      else navigator.share({ title: "Pocket Ledger", text: "You're invited to Pocket Ledger", url }).catch(() => {});
    } else if (d.invdel) {
      await F().deleteDoc(F().doc(ctx.db, "invites", d.invdel)); renderInvites();
    } else if (d.untrash) {
      const t = trash.find(x => x.id === d.untrash); if (!t) return;
      const bt = F().writeBatch(ctx.db);
      bt.set(F().doc(F().collection(hRef(), t.col), t.docId), Object.assign({}, t.data, { author: meId() }));
      bt.delete(F().doc(F().collection(hRef(), "trash"), t.id));
      b.disabled = true;
      try { await bt.commit(); toast("Restored"); renderTrash(); } catch { b.disabled = false; toast("Couldn't restore that. Check your connection."); }
    }
  } catch (e) {
    b.disabled = false;
    toast(e && e.code === "permission-denied" ? "You can't do that. Only the group's creator (or the app's admin, for invites) can." : e && e.code === "not-found" ? "No group has that code." : "That didn't work. Check your connection and try again.");
  }
}

export const page = {
  init() {
    $("pg-settings").addEventListener("click", onClick);
    $("setAmoled").addEventListener("change", () => { lsSet("pl-amoled", $("setAmoled").checked ? "1" : ""); window.plApplyTheme(); });
    $("setBuzz").addEventListener("change", () => { M.buzz = $("setBuzz").checked; saveMotion(); });
    $("dockPicks").addEventListener("change", e => {
      const i = e.target.closest("input[data-dpick]"); if (!i) return;
      dockDraft = i.checked ? dockDraft.concat(i.dataset.dpick) : dockDraft.filter(p => p !== i.dataset.dpick);
      dockDraft = PAGES.filter(p => dockDraft.includes(p));
      if (dockDraft.length === 3) { M.dock = dockDraft.slice(); motionSaved(); } else syncAppearance();
    });
    $("reqBar").addEventListener("click", answerRequest);
    $("signOutBtn").addEventListener("click", () => ctx.signOut());
    $("exportBtn2").addEventListener("click", exportCsv);
    lock.initSettings(); notify.initSettings(); gem.initSettings(); backup.initSettings();
  },
  enter() {
    fillMyDetails(); syncAppearance();
    lock.renderSettings(); notify.renderSettings(); gem.renderSettings(); backup.renderSettings();
    $("acctInfo").textContent = "Signed in as " + ((ctx.user && ctx.user.email) || "you") + ".";
    $("adminLink").hidden = !ctx.admin; $("adminIdx").hidden = !ctx.admin;
    $("set-you").hidden = isViewer(); $("set-ai").hidden = isViewer();
    renderGroups().then(renderPrivacy); renderInvites(); renderTrash();
  },
  render() {
    // live bits only; the rest refreshes when you open Settings or act on it
    if (document.activeElement && document.activeElement.closest && document.activeElement.closest("#set-you")) return;
    if (!$("setName1").value && state.ready) fillMyDetails();
  }
};
