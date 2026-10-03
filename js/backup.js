// Backups: one JSON file with your own space and your groups, shared to Drive /
// Files (or downloaded), a reminder every 14 days, and restoring your own space.
import { $, esc, money, lsGet, lsSet, toast, saveFile, todayISO, ago } from "./util.js";
import { ctx, state, db, isViewer, isGroup, hRef } from "./store.js";
import { undoImport } from "./scan.js";

const COLS = ["entries", "goals", "loans", "recurring", "settlements"];
async function buildBackup() {
  const F = ctx.F, out = { app: "pocket-ledger", version: 2, made: new Date().toISOString(), by: (ctx.user && ctx.user.email) || "", groups: [] };
  for (const sp of (ctx.spaces || []).filter(s => s.role === "member")) {
    const part = { id: sp.id, name: sp.name, type: sp.type };
    const hs = await F.getDoc(hRef(sp.id)), hd = hs.exists() ? hs.data() : {};
    part.settings = Object.assign({}, hd.settings || {}); if (sp.type === "group") part.members = hd.names || {};
    for (const c of COLS) { const q = await F.getDocs(F.collection(hRef(sp.id), c)); part[c] = q.docs.map(d => Object.assign({ id: d.id }, d.data())); }
    if (sp.type === "personal") { COLS.forEach(c => { out[c] = part[c]; }); out.settings = part.settings; }
    else out.groups.push(part);
  }
  if (!out.entries) { out.entries = []; out.goals = []; out.settings = {}; }
  return out;
}
export async function doBackup() {
  toast("Making your backup…");
  let d; try { d = await buildBackup(); } catch { return toast("Couldn't make the backup. Check your connection."); }
  const name = "pocket-ledger-backup-" + todayISO() + ".json", json = JSON.stringify(d, null, 1);
  const done = () => { lsSet("pl-lastbackup", String(Date.now())); renderNag(); renderSettings(); };
  try {
    const file = new File([json], name, { type: "application/json" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Pocket Ledger backup" }); done(); toast("Backup ready. Pick Drive (or Files) to keep it safe."); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
  } catch {}
  saveFile(name, json, "Backed up"); done();
}

// ---------- reminder ----------
export function renderNag() {
  const bar = $("backupNag"), last = +lsGet("pl-lastbackup") || 0, snooze = +lsGet("pl-backup-snooze") || 0;
  const due = !isViewer() && Date.now() - last > 14 * 864e5 && Date.now() > snooze && state.entries.length >= 5;
  bar.hidden = !due; if (!due) return;
  bar.innerHTML = `<span>${last ? "It's been " + Math.floor((Date.now() - last) / 864e5) + " days since your last backup." : "You haven't made a backup on this device yet."} Save one to Google Drive in two taps.</span><span class="row-btns"><button class="primary" type="button" data-bk="now">Back up now</button><button class="ghost" type="button" data-bk="later">Later</button></span>`;
}
export function initNag() {
  $("backupNag").addEventListener("click", ev => {
    const b = ev.target.closest("button[data-bk]"); if (!b) return;
    if (b.dataset.bk === "now") doBackup(); else { lsSet("pl-backup-snooze", String(Date.now() + 3 * 864e5)); renderNag(); }
  });
}

// ---------- Settings › Backup ----------
let pending = null;
// statement imports in this space, newest first, each with Undo
function renderImports() {
  const box = $("importList"), groups = {};
  state.entries.filter(e => e.importId).forEach(e => { (groups[e.importId] = groups[e.importId] || { id: e.importId, label: e.importLabel || "Statement", n: 0, out: 0, at: e.created || 0 }); const g = groups[e.importId]; g.n++; if (e.type === "expense") g.out += +e.amount || 0; g.at = Math.min(g.at || Infinity, e.created || Infinity); });
  const list = Object.values(groups).sort((a, b) => b.at - a.at);
  box.innerHTML = isViewer() || isGroup() ? "" : list.map(g => `<div class="priv-row"><span>${esc(g.label)}<small class="hint">: ${g.n} entries, ${esc(money(g.out, { whole: true }))} spent, imported ${esc(ago(g.at))}</small></span><button class="icon-btn" type="button" data-undoimp="${esc(g.id)}">Undo</button></div>`).join("");
}
export function renderSettings() {
  renderImports();
  const last = +lsGet("pl-lastbackup") || 0;
  $("backupLast").textContent = last ? "Last backup from this device: " + ago(last) + "." : "No backup made on this device yet.";
  $("restoreBtn").hidden = isViewer();
}
export function initSettings() {
  $("importList").addEventListener("click", async ev => {
    const b = ev.target.closest("button[data-undoimp]"); if (!b) return;
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Tap again to remove"; return; }
    b.disabled = true;
    if (await undoImport(b.dataset.undoimp)) setTimeout(renderImports, 600); else b.disabled = false;
  });
  $("backupBtn").addEventListener("click", doBackup);
  $("restoreBtn").addEventListener("click", () => $("restoreFile").click());
  $("restoreFile").addEventListener("change", async ev => {
    const f = ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (!d || !Array.isArray(d.entries) || !Array.isArray(d.goals)) throw new Error();
      pending = d;
      $("restoreMsg").textContent = "Restore " + f.name + "? It has " + d.entries.length + " entries and " + d.goals.length + " goals, and will replace everything in your own space (Me). Groups aren't changed.";
      $("restoreBanner").hidden = false;
    } catch { toast("That file isn't a Pocket Ledger backup."); }
  });
  $("restoreNo").addEventListener("click", () => { pending = null; $("restoreBanner").hidden = true; });
  $("restoreYes").addEventListener("click", async () => {
    if (!pending) return;
    const d = pending; pending = null; $("restoreBanner").hidden = true;
    if (!navigator.onLine) return toast("Restoring needs an internet connection.");
    if (ctx.space && ctx.space.type !== "personal") return toast("Switch to your own space (Me) first, then restore.");
    toast("Restoring…");
    try { await db.replaceAll(d); toast("Backup restored"); } catch (e) { if (!e || e.code !== "group") toast("Couldn't restore. Check your connection and try again."); }
  });
}
