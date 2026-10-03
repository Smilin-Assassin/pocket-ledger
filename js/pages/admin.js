// Admin dashboard (admins only): who uses the app, Gemini use, remove or restore
// someone's access. It never shows anyone's money.
import { $, esc, toast, ago, dShort } from "../util.js";
import { meId } from "../store.js";
import { callFn, serverMissing } from "../notify.js";

const adm = { data: null, ask: null, busy: false };

function chart(days) {
  const W = 340, H = 140, pad = { l: 24, r: 4, t: 8, b: 20 }, n = days.length;
  const max = Math.max(5, ...days.map(d => d.n)), step = Math.pow(10, Math.floor(Math.log10(max))), top = Math.ceil(max / step) * step;
  const bw = (W - pad.l - pad.r) / n, ih = H - pad.t - pad.b, y = v => pad.t + ih - v / top * ih;
  let g = "";
  [0, top / 2, top].forEach(v => { g += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="ad-grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" class="ad-ax">${Math.round(v)}</text>`; });
  days.forEach((d, i) => {
    const x = pad.l + i * bw, h = Math.max(d.n ? 2 : 0, d.n / top * ih), w = Math.max(2, bw - 2), rr = Math.min(4, h), rx = Math.min(4, w / 2);
    if (h) g += `<path class="ad-bar" d="M${x + 1},${pad.t + ih} v${-(h - rr)} q0,${-rr} ${rx},${-rr} h${w - 2 * rx} q${rx},0 ${rx},${rr} v${h - rr} z"/>`;
    g += `<rect class="ad-hit" x="${x}" y="${pad.t}" width="${bw}" height="${ih + pad.b}" data-i="${i}"><title>${esc(dShort(d.day))}: ${d.n} Gemini call${d.n === 1 ? "" : "s"}</title></rect>`;
    if (i === 0 || i === n - 1 || i === Math.floor(n / 2)) g += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}" class="ad-ax">${esc(dShort(d.day))}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="ad-chart" role="img" aria-label="Gemini calls per day for the last 30 days">${g}</svg>`;
}

function render() {
  const box = $("adminBody"), D = adm.data;
  if (!D) { box.innerHTML = `<p class="hint">${adm.busy ? "Loading…" : "Couldn't load the dashboard. Check your connection and tap Refresh."}</p>`; return; }
  const total30 = D.days.reduce((a, d) => a + d.n, 0), todayN = (D.days[D.days.length - 1] || {}).n || 0;
  const active7 = D.people.filter(p => p.lastSeen && Date.now() - p.lastSeen < 7 * 864e5).length, me = meId();
  const tile = (label, value, sub) => `<div class="ad-tile"><span>${esc(label)}</span><b class="num">${esc(String(value))}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</div>`;
  let h = `<div class="ad-tiles">${tile("People with access", D.people.length, active7 + " used it this week")}${tile("Gemini today", todayN, "limit " + D.limit + " each")}${tile("Gemini, 30 days", total30, "")}${tile("Open invites", D.openInvites, "")}</div>`;
  h += `<div class="grid2"><div class="panel"><div class="ad-head"><b>Gemini calls per day</b><small id="adTip">Last 30 days. Tap a bar for the day.</small></div>${chart(D.days)}</div>`;
  h += `<div class="panel"><b>Daily Gemini limit per person</b><div class="grp-rename"><input id="adLimit" type="number" inputmode="numeric" min="10" max="2000" value="${D.limit}" aria-label="Daily limit per person"><button class="ghost" type="button" data-adlimit="1">Save</button></div><small class="hint">Each scan or chat message counts as one or two calls.</small><a class="ghost" href="#settings/invites">Make an invite link</a></div></div>`;
  const sorted = D.people.slice().sort((a, b) => (b.uid === me) - (a.uid === me) || (b.lastSeen || 0) - (a.lastSeen || 0));
  h += `<section class="panel"><h2>People</h2><div class="grp-list">` + sorted.map(p => {
    const asking = adm.ask && adm.ask.uid === p.uid, who = p.name || p.email || "Unnamed";
    return `<div class="grp"><div class="grp-top"><b>${esc(who)}${p.uid === me ? ' <span class="ad-badge">You</span>' : ""}${p.admin ? ' <span class="ad-badge">Admin</span>' : ""}</b>
      <small>${esc([p.name && p.email ? p.email : "", p.how === "invite" ? "joined with an invite" : p.how === "existing" ? "here before invite-only" : p.how === "restored" ? "access restored" : "", p.since ? "since " + new Date(p.since).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · "))}</small>
      <small>${p.uid === me ? "Active now" : "Last active " + esc(ago(p.lastSeen || p.lastSignIn))}, in ${p.groups} group${p.groups === 1 ? "" : "s"}, Gemini today ${p.aiToday}, 30 days ${p.aiMonth}</small></div>
      ${p.uid === me ? "" : asking
        ? `<div class="formfoot"><span class="hint">${adm.ask.what === "revoke" ? "Remove " + esc(who) + "'s access? They'll be signed out and can't open Pocket Ledger. Their data is kept, so you can restore them." : "Make " + esc(who) + " an admin? They'll see this dashboard and can make invites."}</span><button class="primary" type="button" data-adgo="${esc(p.uid)}">${adm.ask.what === "revoke" ? "Remove access" : "Make admin"}</button><button class="ghost" type="button" data-adno="1">Cancel</button></div>`
        : `<div class="formfoot">${p.admin ? `<button class="ghost" type="button" data-adact="removeAdmin" data-u="${esc(p.uid)}">Remove admin</button>` : `<button class="ghost" type="button" data-adask="makeAdmin" data-u="${esc(p.uid)}">Make admin</button>`}<button class="icon-btn danger" type="button" data-adask="revoke" data-u="${esc(p.uid)}">Remove access</button></div>`}
    </div>`;
  }).join("") + `</div></section>`;
  if (D.revoked.length) h += `<section class="panel"><h2>Removed</h2>` + D.revoked.map(r => `<div class="priv-row"><span>${esc(r.name || r.email || "Someone")}<small class="hint"> · removed ${esc(ago(r.revokedAt))}</small></span><button class="ghost" type="button" data-adact="restore" data-u="${esc(r.uid)}">Restore</button></div>`).join("") + `</section>`;
  h += `<section class="panel"><h2>Signed up without an invite</h2>` + (D.waiting.length ? `<p class="hint">These accounts exist but can't see or save anything. Make them an invite if you know them, or delete the account.</p>` + D.waiting.map(w => {
    const asking = adm.ask && adm.ask.uid === w.uid;
    return `<div class="priv-row"><span>${esc(w.email || "No email")}<small class="hint"> · signed up ${esc(ago(w.created))}</small></span>${asking ? `<span class="row-btns"><button class="icon-btn danger" type="button" data-adgo="${esc(w.uid)}">Delete account</button><button class="icon-btn" type="button" data-adno="1">Keep</button></span>` : `<button class="icon-btn" type="button" data-adask="deleteWaiting" data-u="${esc(w.uid)}">Delete</button>`}</div>`;
  }).join("") : `<p class="hint">Nobody.</p>`) + `</section>`;
  box.innerHTML = h;
}
async function load() {
  adm.busy = true; render();
  try { adm.data = await callFn("admin", { action: "overview" }); }
  catch (e) { adm.data = null; toast(/permission/.test(String(e && e.code)) ? "Only the app's admin can open this." : serverMissing(e) ? "The admin server isn't set up yet. Run the deploy step first." : "Couldn't load the dashboard."); }
  adm.busy = false; render();
}
async function act(action, target, extra) {
  try { await callFn("admin", Object.assign({ action, target }, extra || {})); adm.ask = null; await load(); return true; }
  catch (e) { toast((e && e.message) || "That didn't work. Try again."); return false; }
}

export const page = {
  init() {
    $("adminRefresh").addEventListener("click", load);
    $("adminBody").addEventListener("click", async ev => {
      const bar = ev.target.closest(".ad-hit");
      if (bar && adm.data) { const d = adm.data.days[+bar.dataset.i]; $("adTip").textContent = dShort(d.day) + ": " + d.n + " Gemini call" + (d.n === 1 ? "" : "s"); document.querySelectorAll(".ad-hit.on").forEach(x => x.classList.remove("on")); bar.classList.add("on"); return; }
      const b = ev.target.closest("button"); if (!b) return;
      const d = b.dataset;
      if (d.adask) { adm.ask = { uid: d.u, what: d.adask }; render(); }
      else if (d.adno) { adm.ask = null; render(); }
      else if (d.adgo && adm.ask) { b.disabled = true; const what = adm.ask.what; if (await act(what, d.adgo)) toast(what === "revoke" ? "Access removed" : what === "deleteWaiting" ? "Account deleted" : "Done"); }
      else if (d.adact) { b.disabled = true; if (await act(d.adact, d.u)) toast(d.adact === "restore" ? "Access restored" : "Done"); }
      else if (d.adlimit) { const n = Math.round(+$("adLimit").value); if (!(n >= 10 && n <= 2000)) return toast("Pick a limit between 10 and 2000."); if (await act("setLimit", null, { limit: n })) toast("Daily limit saved"); }
    });
  },
  enter() { load(); },
  render() {}
};
