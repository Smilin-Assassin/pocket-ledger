const load = () => JSON.parse(localStorage.getItem("mock-db") || "{}");
const save = d => localStorage.setItem("mock-db", JSON.stringify(d));
let listeners = [];
const notify = () => setTimeout(() => listeners.forEach(l => l()), 5);
const err = c => { const e = new Error(c); e.code = c; return e; };
const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);

// ---- a small model of firestore.rules so tests catch writes the real server would refuse ----
const RULES = true;
const me = () => { const e = localStorage.getItem("mock-cur"); return e ? "uid_" + e.replace(/\W/g, "") : null; };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const changed = (a, b) => { a = a || {}; b = b || {}; return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !eq(a[k], b[k])); };
const only = (keys, allowed) => keys.every(k => allowed.includes(k));
const setEq = (a, b) => eq([...new Set(a)].sort(), [...new Set(b)].sort());
function canRead(hid) { const h = load()["households/" + hid]; if (!h) return true; if (!hasAccess()) return false; const u = me(); return (h.members || []).includes(u) || (h.viewers || []).includes(u); }
const hasAccess = () => !!load()["access/" + me()];
const isAdmin = () => !!(load()["access/" + me()] || {}).admin;
function allowed(path, before, after) {
  const u = me(); if (!u) return false;
  const seg = path.split("/");
  if (seg[0] === "users") return seg[1] === u && hasAccess();
  if (seg[0] === "access") return false;
  if (seg[0] === "invites") { if (!before) return isAdmin() && after.by === u && !(after.used || []).length && after.max <= 20; if (!after) return isAdmin(); return false; }
  if (!hasAccess()) return false;
  if (seg[0] === "viewRequests") {
    if (!before) return after.from === u && after.status === "pending" && only(Object.keys(after), ["from", "fromName", "to", "toName", "status", "created", "group"]);
    if (!after) return before.from === u || before.to === u;
    return before.to === u && only(changed(before, after), ["status", "space", "toName", "answered"]);
  }
  if (seg[0] === "households" && seg.length === 2) {
    if (!before) return eq(after.members, [u]) && (after.owner === undefined || after.owner === u) && !(after.viewers || []).length;
    if (!after) return false;
    const mem = (before.members || []).includes(u), ch = changed(before, after);
    const myKeyOnly = f => only(changed(before[f], after[f]), [u]);
    if (mem && (before.owner === undefined || before.owner === u)) return true;
    if (mem && only(ch, ["names", "colors"]) && myKeyOnly("names") && myKeyOnly("colors")) return true;
    if (mem && only(ch, ["members"]) && setEq(after.members, before.members.filter(x => x !== u))) return true;
    if ((before.type || "group") === "group" && (before.joinUntil || 0) > Date.now() && only(ch, ["members", "names", "personOf"]) && setEq(after.members, [...before.members, u]) && myKeyOnly("names") && myKeyOnly("personOf") && before.members.length < 20) return true;
    return false;
  }
  if (seg[0] === "households" && seg.length === 4) {
    const h = load()["households/" + seg[1]]; if (!h || !(h.members || []).includes(u)) return false;
    if (!before) return after.author === u;
    if (!after) return (before.author || u) === u;
    return (before.author || u) === u && after.author === u;
  }
  return false;
}
const deny = (path, why) => { console.warn("RULES DENIED " + why + " " + path); window.__denied = (window.__denied || []).concat(why + " " + path); throw err("permission-denied"); };
export const initializeFirestore = () => ({ db: true });
export const getFirestore = () => ({ db: true });
export const persistentLocalCache = () => ({}); export const persistentMultipleTabManager = () => ({});
export function doc(base, ...segs) {
  let path;
  if (base.db) path = segs.join("/");
  else if (base.type === "col") path = base.path + "/" + (segs.length ? segs.join("/") : rid());
  else path = base.path + "/" + segs.join("/");
  return { type: "doc", path, id: path.split("/").pop() };
}
export function collection(base, ...segs) { const path = base.db ? segs.join("/") : base.path + "/" + segs.join("/"); return { type: "col", path }; }
const snapDoc = (path, d) => ({ id: path.split("/").pop(), exists: () => d !== undefined, data: () => d === undefined ? undefined : JSON.parse(JSON.stringify(d)) });
export async function getDoc(ref) { const seg = ref.path.split("/"); if (seg[0] === "households" && !canRead(seg[1])) deny(ref.path, "read"); if (seg[0] === "users" && seg[1] !== me()) deny(ref.path, "read"); if (seg[0] === "access" && seg[1] !== me() && !isAdmin()) deny(ref.path, "read"); if (seg[0] === "invites" && !isAdmin()) deny(ref.path, "read"); return snapDoc(ref.path, load()[ref.path]); }
export const getDocFromCache = getDoc;
const applyOps = (o, data) => { for (const [k, v] of Object.entries(data)) { if (v && v.__union) o[k] = Array.from(new Set([...(o[k] || []), ...v.__union])); else if (v && v.__remove) o[k] = (o[k] || []).filter(x => !v.__remove.includes(x)); else if (v && typeof v === "object" && !Array.isArray(v) && o[k] && typeof o[k] === "object") { applyOps(o[k], v); } else o[k] = JSON.parse(JSON.stringify(v)); } };
export async function setDoc(ref, data, opts) { const d = load(); const before = d[ref.path] ? JSON.parse(JSON.stringify(d[ref.path])) : undefined; if (opts && opts.merge) { d[ref.path] = d[ref.path] || {}; applyOps(d[ref.path], data); } else d[ref.path] = JSON.parse(JSON.stringify(data)); if (RULES && !allowed(ref.path, before, d[ref.path])) deny(ref.path, "write"); save(d); notify(); }
export function arrayRemove(...v) { return { __remove: v }; }
export async function deleteDoc(ref) { const d = load(); if (RULES && d[ref.path] && !allowed(ref.path, d[ref.path], undefined)) deny(ref.path, "delete"); delete d[ref.path]; save(d); notify(); }
export function arrayUnion(...v) { return { __union: v }; }
export async function updateDoc(ref, data) {
  const d = load(); if (!d[ref.path]) throw err("not-found");
  const before = JSON.parse(JSON.stringify(d[ref.path])); const o = d[ref.path];
  for (const [k, v] of Object.entries(data)) {
    const parts = k.split("."); let t = o; for (const p of parts.slice(0, -1)) { t[p] = t[p] || {}; t = t[p]; }
    const last = parts[parts.length - 1];
    if (v && v.__union) { t[last] = Array.from(new Set([...(t[last] || []), ...v.__union])); } else if (v && v.__remove) { t[last] = (t[last] || []).filter(x => !v.__remove.includes(x)); } else t[last] = JSON.parse(JSON.stringify(v));
  }
  if (RULES && !allowed(ref.path, before, o)) deny(ref.path, "update");
  save(d); notify();
}
export function writeBatch() { const ops = []; return { set: (r, v) => ops.push(() => setDoc(r, v)), delete: r => ops.push(() => deleteDoc(r)), update: (r, v) => ops.push(() => updateDoc(r, v)), commit: async () => { for (const f of ops) await f(); } }; }
export function onSnapshot(ref, next) {
  const fire = () => {
    const d = load();
    const seg = ref.path.split("/"); if (seg[0] === "households" && !canRead(seg[1])) { if (arguments[2]) arguments[2](err("permission-denied")); return; }
    if (ref.type === "doc") next(snapDoc(ref.path, d[ref.path]));
    else { const pre = ref.path + "/"; const docs = Object.keys(d).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes("/")).sort().map(k => snapDoc(k, d[k])); next({ docs, size: docs.length, empty: !docs.length }); }
  };
  listeners.push(fire); setTimeout(fire, 10); return () => { listeners = listeners.filter(l => l !== fire); };
}

// ---- queries ----
export function where(f, op, v) { return { f, op, v }; }
export function query(col, ...w) { return { type: "query", path: col.path, where: w }; }
export async function getDocs(q) {
  const d = load(); const pre = q.path + "/";
  let keys = Object.keys(d).filter(k => k.startsWith(pre) && !k.slice(pre.length).includes("/")).sort();
  const w = q.where || [];
  if (RULES) {
    if (q.path === "viewRequests") { if (!w.some(c => (c.f === "from" || c.f === "to") && c.v === me())) throw err("permission-denied"); }
    else if (q.path === "invites") { if (!isAdmin()) throw err("permission-denied"); }
    else if (q.path.startsWith("households/")) { if (!canRead(q.path.split("/")[1])) throw err("permission-denied"); }
  }
  keys = keys.filter(k => w.every(c => d[k][c.f] === c.v));
  const docs = keys.map(k => snapDoc(k, d[k]));
  return { docs, size: docs.length, empty: !docs.length };
}
