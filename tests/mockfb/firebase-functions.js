export const getFunctions = () => ({});
export const httpsCallable = (f, name) => async data => { window.__calls = (window.__calls || []).concat(name); if (name === "testPush") return { data: { sent: 1 } }; if (name === "notifyTransfer") { window.__notified = (window.__notified || []).concat(data); return { data: { sent: 1 } }; }
  if (name === "people") {
    const e = localStorage.getItem("mock-cur"), uid = "uid_" + e.replace(/\W/g, ""), db = JSON.parse(localStorage.getItem("mock-db") || "{}");
    const save = () => localStorage.setItem("mock-db", JSON.stringify(db)); const fail = (code, m) => { const x = new Error(m); x.code = "functions/" + code; throw x; };
    if (data.action === "lookup") {
      const t = "uid_" + String(data.email || "").trim().toLowerCase().replace(/\W/g, "");
      if (t === uid || !db["access/" + t]) fail("not-found", "Nobody with that email uses Pocket Ledger.");
      return { data: { uid: t, name: (db["users/" + t] || {}).name || data.email.split("@")[0] } };
    }
    if (data.action === "deleteGroup") {
      const g = db["households/" + data.gid]; if (!g) return { data: { ok: true } };
      if (g.type !== "group" || g.owner !== uid) fail("permission-denied", "Only the person who made the group can delete it.");
      (g.members || []).forEach(m => { const u = db["users/" + m]; if (u) u.spaces = (u.spaces || []).filter(x => x !== data.gid); });
      Object.keys(db).filter(k => k === "households/" + data.gid || k.startsWith("households/" + data.gid + "/")).forEach(k => delete db[k]);
      save(); window.__groupDeleted = data.gid; return { data: { ok: true } };
    }
  }
  if (name === "admin") {
    const e = localStorage.getItem("mock-cur"), uid = "uid_" + e.replace(/\W/g, ""), db = JSON.parse(localStorage.getItem("mock-db") || "{}");
    const save = () => localStorage.setItem("mock-db", JSON.stringify(db)); const fail = (code, m) => { const x = new Error(m); x.code = "functions/" + code; throw x; };
    if (!(db["access/" + uid] || {}).admin) fail("permission-denied", "Only the app's admin can do that.");
    const t = data.target; const keys = p => Object.keys(db).filter(k => k.startsWith(p + "/"));
    if (data.action === "overview") {
      const days = []; for (let i = 29; i >= 0; i--) { const k = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10); days.push({ day: k, n: keys("aiUsage").filter(x => db[x].day === k).reduce((a, x) => a + db[x].n, 0) }); }
      const today = days[29].day;
      const people = keys("access").map(k => { const id = k.split("/")[1], a = db[k], u = db["users/" + id] || {}; const us = keys("aiUsage").filter(x => db[x].uid === id); return { uid: id, email: a.email || u.email || "", name: u.name || "", admin: !!a.admin, how: a.how, since: a.since || null, lastSeen: u.lastSeen || null, groups: (u.spaces || []).length, aiToday: us.filter(x => db[x].day === today).reduce((a, x) => a + db[x].n, 0), aiMonth: us.reduce((a, x) => a + db[x].n, 0) }; });
      const have = new Set(keys("access").concat(keys("revoked")).map(k => k.split("/")[1]));
      const waiting = Object.keys(JSON.parse(localStorage.getItem("mock-users") || "{}")).map(em => ({ uid: "uid_" + em.replace(/\W/g, ""), email: em, created: Date.now() - 3600e3 })).filter(w => !have.has(w.uid) && !(db["deleted/" + w.uid]));
      const revoked = keys("revoked").map(k => ({ uid: k.split("/")[1], email: db[k].email || "", name: db[k].name || "", revokedAt: db[k].revokedAt }));
      return { data: { people, waiting, revoked, days, today, limit: (db["config/app"] || {}).aiLimit || 300, openInvites: keys("invites").filter(k => db[k].expires > Date.now() && (db[k].used || []).length < (db[k].max || 1)).length } };
    }
    if (t === uid) fail("failed-precondition", "You can't do that to your own account.");
    if (data.action === "revoke") { db["revoked/" + t] = Object.assign({}, db["access/" + t], { name: (db["users/" + t] || {}).name || "", revokedAt: Date.now() }); delete db["access/" + t]; }
    else if (data.action === "restore") { db["access/" + t] = { ok: true, email: db["revoked/" + t].email, admin: false, how: "restored" }; delete db["revoked/" + t]; }
    else if (data.action === "makeAdmin" || data.action === "removeAdmin") db["access/" + t].admin = data.action === "makeAdmin";
    else if (data.action === "deleteWaiting") db["deleted/" + t] = 1;
    else if (data.action === "setLimit") db["config/app"] = { aiLimit: data.limit };
    save(); return { data: { ok: true } };
  }
  if (name === "access") {
    const e = localStorage.getItem("mock-cur"), uid = "uid_" + e.replace(/\W/g, ""), db = JSON.parse(localStorage.getItem("mock-db") || "{}");
    const save = () => localStorage.setItem("mock-db", JSON.stringify(db)); const fail = (code, m) => { const x = new Error(m); x.code = "functions/" + code; throw x; };
    if (db["access/" + uid]) return { data: { ok: true, admin: !!db["access/" + uid].admin } };
    if (db["revoked/" + uid]) fail("permission-denied", "removed");
    const ud = db["users/" + uid] || {};
    if (ud.personal || ud.household) { const h = ud.household && db["households/" + ud.household]; const admin = !!h && (h.owner ? (h.owner === uid && !!h.legacy) : (h.members || [])[0] === uid); db["access/" + uid] = { ok: true, admin, how: "existing" }; save(); return { data: { ok: true, admin } }; }
    const code = (data && data.code) || ""; if (!code) fail("permission-denied", "invite-needed");
    const i = db["invites/" + code]; if (!i) fail("not-found", "That invite code isn't valid.");
    if (i.expires < Date.now()) fail("failed-precondition", "This invite has expired. Ask for a new one.");
    if ((i.used || []).length >= (i.max || 1)) fail("failed-precondition", "This invite has already been used. Ask for a new one.");
    i.used = (i.used || []).concat(uid); i.usedBy = (i.usedBy || []).concat(e); db["access/" + uid] = { ok: true, admin: false, how: "invite" }; save();
    return { data: { ok: true, admin: false, group: i.group || null } };
  } if (data && data.ping) return { data: { ok: true } };
  if (window.__slowMs) await new Promise(r => setTimeout(r, window.__slowMs));
  const t = data.contents[0].parts[0].text; const plan = t.includes("Decide what to do");
  window.__parts = (window.__parts || []).concat([data.contents[0].parts.map(x => x.inline_data ? x.inline_data.mime_type : "text")]);
  if (window.__mockStatement && t.includes("bank statement (PDF)")) return { data: { text: JSON.stringify(window.__mockStatement) } };
  window.__prompts = (window.__prompts || []).concat(t);
  if (plan && window.__mockPlan) return { data: { text: JSON.stringify(window.__mockPlan) } };
  return { data: { text: plan ? JSON.stringify({ heard: null, calls: [], reply: "Hi from the server", suggestions: ["Show my bills"] }) : "ok" } }; };