// Pocket Ledger server functions (Firebase, pay-as-you-go plan).
//  - dailyAlerts: every morning, sends bill / budget / loan notifications.
//  - gemini:      runs Gemini for signed-in household members, so the key never reaches phones.
//  - testPush:    sends a test notification to the caller's devices.
//  - notifyTransfer: tells someone that money was sent to them in the app.
//  - people:      find someone by email to send money to; delete a group you made (with everything in it).
"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");
const { getAuth } = require("firebase-admin/auth");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const { computeAlerts, recipientsFor, localToday, shiftMonth } = require("./alerts");

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 5 });
const db = getFirestore();
const GEMINI_KEY = defineSecret("GEMINI_KEY");

const APP_URL = "https://smilin-assassin.github.io/pocket-ledger/";
const ICON = APP_URL + "icons/icon-192.png";
const MODEL_CHAIN = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
const DAILY_AI_LIMIT = 300; // Gemini calls per person per day

// ---------- notifications ----------
// tapping a notification opens the page it's about
const PAGE_FOR = { bills: "#bills", budgets: "#home", loans: "#loans", transfers: "#home" };
async function sendTo(uids, title, body, kind) {
  let sent = 0;
  const url = APP_URL + (PAGE_FOR[kind] || "");
  for (const uid of [...new Set(uids)]) {
    const ref = db.doc("users/" + uid);
    const snap = await ref.get();
    if (!snap.exists) continue;
    const u = snap.data();
    const prefs = Object.assign({ bills: true, budgets: true, loans: true, transfers: true }, u.notify || {});
    if (kind && prefs[kind] === false) continue;
    const tokens = (u.tokens || []).filter(Boolean);
    if (!tokens.length) continue;
    const res = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: { notification: { icon: ICON, badge: ICON, tag: kind || "pocket-ledger" }, fcmOptions: { link: url } },
      data: { kind: kind || "", url }
    });
    const dead = [];
    res.responses.forEach((r, i) => {
      if (r.success) sent++;
      else if (r.error && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(r.error.code || "")) dead.push(tokens[i]);
    });
    if (dead.length) await ref.update({ tokens: FieldValue.arrayRemove(...dead) });
  }
  return sent;
}

exports.dailyAlerts = onSchedule({ schedule: "every day 08:30", timeZone: "Indian/Maldives" }, async () => {
  const today = localToday(new Date(), 5);
  const since = shiftMonth(today.slice(0, 7), -2) + "-01";
  const hhs = await db.collection("households").get();
  for (const doc of hhs.docs) {
    try {
      const hh = doc.data();
      const [entries, recurring, loans] = await Promise.all([
        doc.ref.collection("entries").where("date", ">=", since).get(),
        doc.ref.collection("recurring").get(),
        doc.ref.collection("loans").get()
      ]);
      const toArr = q => q.docs.map(d => Object.assign({ id: d.id }, d.data()));
      const { alerts, state } = computeAlerts(hh, { entries: toArr(entries), recurring: toArr(recurring), loans: toArr(loans) }, today);
      for (const a of alerts) await sendTo(recipientsFor(a, hh), a.title, a.body, a.kind);
      await doc.ref.update({ alertState: state });
      if (alerts.length) logger.info("household " + doc.id + ": " + alerts.length + " alert(s)");
    } catch (err) {
      logger.error("alerts failed for " + doc.id, err);
    }
  }
});

exports.testPush = onCall(async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const n = await sendTo([req.auth.uid], "Pocket Ledger", "Notifications are working on this device.", null);
  if (!n) throw new HttpsError("failed-precondition", "No device is registered for notifications yet.");
  return { sent: n };
});

// ---------- invite-only access ----------
// Lets someone into Pocket Ledger: people who used it before invite-only are let in
// automatically; everyone else needs an invite code made by an admin.
exports.access = onCall(async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid, email = String(req.auth.token.email || "").toLowerCase();
  const aRef = db.doc("access/" + uid);
  const a = await aRef.get();
  if (a.exists) return { ok: true, admin: !!a.data().admin };
  if ((await db.doc("revoked/" + uid).get()).exists) throw new HttpsError("permission-denied", "removed");
  const u = await db.doc("users/" + uid).get();
  const ud = u.exists ? u.data() : {};
  if (ud.personal || ud.household) {
    // already using the app before invite-only: let them in; whoever started the original household is the admin
    let admin = false;
    if (ud.household) {
      const h = await db.doc("households/" + ud.household).get();
      const hd = h.exists ? h.data() : {};
      admin = hd.owner ? (hd.owner === uid && !!hd.legacy) : (hd.members || [])[0] === uid;
    }
    await aRef.set({ ok: true, email, admin, since: Date.now(), how: "existing" });
    return { ok: true, admin };
  }
  const code = String((req.data && req.data.code) || "").trim();
  if (!code) throw new HttpsError("permission-denied", "invite-needed");
  if (!/^[A-Za-z0-9]{6,40}$/.test(code)) throw new HttpsError("not-found", "That invite code isn't valid.");
  const iRef = db.doc("invites/" + code);
  const group = await db.runTransaction(async t => {
    const s = await t.get(iRef);
    if (!s.exists) throw new HttpsError("not-found", "That invite code isn't valid.");
    const i = s.data();
    if ((i.expires || 0) < Date.now()) throw new HttpsError("failed-precondition", "This invite has expired. Ask for a new one.");
    if ((i.used || []).length >= (i.max || 1)) throw new HttpsError("failed-precondition", "This invite has already been used. Ask for a new one.");
    t.update(iRef, { used: FieldValue.arrayUnion(uid), usedBy: FieldValue.arrayUnion(email || uid) });
    t.set(aRef, { ok: true, email, admin: false, since: Date.now(), how: "invite", invite: code, invitedBy: i.by || null });
    return i.group || null;
  });
  logger.info("invite used", { code, uid });
  return { ok: true, admin: false, group };
});

// ---------- admin dashboard ----------
// Only people the admin flag is set for. Shows who uses the app and how much
// Gemini they use. Never returns anyone's money data.
let cfgCache = null, cfgAt = 0;
async function appConfig() {
  if (cfgCache && Date.now() - cfgAt < 5 * 60e3) return cfgCache;
  const s = await db.doc("config/app").get();
  cfgCache = s.exists ? s.data() : {}; cfgAt = Date.now(); return cfgCache;
}
exports.admin = onCall(async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid;
  const mine = await db.doc("access/" + uid).get();
  if (!mine.exists || !mine.data().admin) throw new HttpsError("permission-denied", "Only the app's admin can do that.");
  const { action, target } = req.data || {};
  const auth = getAuth();
  const needTarget = () => { if (!target || typeof target !== "string") throw new HttpsError("invalid-argument", "Pick someone first."); if (target === uid) throw new HttpsError("failed-precondition", "You can't do that to your own account."); };

  if (action === "overview") {
    const today = localToday(new Date(), 5);
    const since = new Date(Date.now() - 29 * 864e5 + 5 * 3600e3).toISOString().slice(0, 10);
    const [acc, usage, invites, cfg, rev] = await Promise.all([
      db.collection("access").get(),
      db.collection("aiUsage").where("day", ">=", since).get(),
      db.collection("invites").get(),
      appConfig(),
      db.collection("revoked").get()
    ]);
    const ids = acc.docs.map(d => d.id);
    const users = ids.length ? await db.getAll(...ids.map(id => db.doc("users/" + id))) : [];
    const udata = {}; users.forEach(u => { udata[u.id] = u.exists ? u.data() : {}; });
    const authInfo = {};
    for (let i = 0; i < ids.length; i += 100) {
      const r = await auth.getUsers(ids.slice(i, i + 100).map(id => ({ uid: id })));
      r.users.forEach(u => { authInfo[u.uid] = { disabled: u.disabled, lastSignIn: u.metadata.lastSignInTime || null, created: u.metadata.creationTime || null }; });
    }
    const perDay = {}, perUser = {};
    usage.docs.forEach(d => { const x = d.data(); perDay[x.day] = (perDay[x.day] || 0) + (x.n || 0); const p = perUser[x.uid] || (perUser[x.uid] = { today: 0, month: 0 }); p.month += x.n || 0; if (x.day === today) p.today += x.n || 0; });
    const days = []; for (let i = 29; i >= 0; i--) { const k = new Date(Date.now() - i * 864e5 + 5 * 3600e3).toISOString().slice(0, 10); days.push({ day: k, n: perDay[k] || 0 }); }
    const people = acc.docs.map(d => { const a = d.data(), u = udata[d.id] || {}, au = authInfo[d.id] || {}; return {
      uid: d.id, email: a.email || u.email || "", name: u.name || "", admin: !!a.admin, how: a.how || "", since: a.since || null, revoked: !!a.revoked,
      lastSeen: u.lastSeen || null, lastSignIn: au.lastSignIn || null, disabled: !!au.disabled, groups: (u.spaces || []).length,
      aiToday: (perUser[d.id] || {}).today || 0, aiMonth: (perUser[d.id] || {}).month || 0 }; });
    // accounts that signed up but never got in (no invite)
    const waiting = []; const have = new Set(ids);
    const list = await auth.listUsers(1000);
    list.users.forEach(u => { if (!have.has(u.uid)) waiting.push({ uid: u.uid, email: u.email || "", created: u.metadata.creationTime || null }); });
    const openInvites = invites.docs.filter(d => { const i = d.data(); return (i.expires || 0) > Date.now() && (i.used || []).length < (i.max || 1); }).length;
    const revoked = rev.docs.map(d => ({ uid: d.id, email: d.data().email || "", name: d.data().name || "", revokedAt: d.data().revokedAt || null }));
    revoked.forEach(r => have.add(r.uid));
    const waiting2 = waiting.filter(w => !have.has(w.uid));
    return { people, waiting: waiting2, revoked, days, today, limit: cfg.aiLimit || DAILY_AI_LIMIT, openInvites };
  }
  if (action === "revoke") {
    needTarget();
    const ref = db.doc("access/" + target), a = await ref.get();
    if (!a.exists) throw new HttpsError("not-found", "That person doesn't have access.");
    const tu = await db.doc("users/" + target).get();
    await db.doc("revoked/" + target).set(Object.assign({}, a.data(), { name: (tu.exists && tu.data().name) || "", revokedAt: Date.now(), revokedBy: uid }));
    await ref.delete();
    try { await auth.updateUser(target, { disabled: true }); await auth.revokeRefreshTokens(target); } catch (e) { logger.warn("disable failed", e); }
    return { ok: true };
  }
  if (action === "restore") {
    needTarget();
    const old = await db.doc("revoked/" + target).get();
    const base = old.exists ? old.data() : {};
    await db.doc("access/" + target).set({ ok: true, email: base.email || "", admin: false, since: base.since || Date.now(), how: base.how || "restored", restoredAt: Date.now() });
    await db.doc("revoked/" + target).delete();
    try { await auth.updateUser(target, { disabled: false }); } catch (e) { logger.warn("enable failed", e); }
    return { ok: true };
  }
  if (action === "makeAdmin" || action === "removeAdmin") {
    needTarget();
    const ref = db.doc("access/" + target);
    if (!(await ref.get()).exists) throw new HttpsError("not-found", "That person doesn't have access.");
    await ref.update({ admin: action === "makeAdmin" });
    return { ok: true };
  }
  if (action === "deleteWaiting") {
    needTarget();
    if ((await db.doc("access/" + target).get()).exists) throw new HttpsError("failed-precondition", "That person has access. Remove their access instead.");
    await auth.deleteUser(target);
    return { ok: true };
  }
  if (action === "setLimit") {
    const n = Math.round(+((req.data || {}).limit));
    if (!(n >= 10 && n <= 2000)) throw new HttpsError("invalid-argument", "Pick a limit between 10 and 2000.");
    await db.doc("config/app").set({ aiLimit: n }, { merge: true }); cfgCache = null;
    return { ok: true, limit: n };
  }
  throw new HttpsError("invalid-argument", "Unknown action.");
});

// ---------- Gemini, with the key kept on the server ----------
exports.gemini = onCall({ secrets: [GEMINI_KEY], timeoutSeconds: 120, memory: "512MiB" }, async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid;
  const acc = await db.doc("access/" + uid).get();
  if (!acc.exists) throw new HttpsError("permission-denied", "Pocket Ledger is invite-only.");
  if (req.data && req.data.ping) return { ok: true };

  // simple daily limit per person
  const day = localToday(new Date(), 5);
  const usage = db.doc("aiUsage/" + uid + "_" + day);
  const used = await db.runTransaction(async t => {
    const s = await t.get(usage); const n = (s.exists ? s.data().n : 0) + 1;
    t.set(usage, { n, uid, day }, { merge: true }); return n;
  });
  const limit = (await appConfig()).aiLimit || DAILY_AI_LIMIT;
  if (used > limit) throw new HttpsError("resource-exhausted", "Daily Gemini limit reached. It resets tomorrow.");

  const { contents, generationConfig, model, search } = req.data || {};
  if (!Array.isArray(contents) || !contents.length) throw new HttpsError("invalid-argument", "Nothing to send.");
  // search: let Gemini look things up with Google Search (used to tell what kind of place an unknown shop is)
  const body = JSON.stringify(Object.assign({ contents, generationConfig: generationConfig || {} }, search ? { tools: [{ google_search: {} }] } : {}));
  const chain = model ? [String(model)] : MODEL_CHAIN;
  let status = 0, msg = "";
  for (const m of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(m) + ":generateContent", {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_KEY.value() }, body });
      if (r.ok) {
        const j = await r.json(); const cand = (j.candidates || [])[0];
        const text = cand && cand.content ? (cand.content.parts || []).filter(p => !p.thought).map(p => p.text || "").join("") : "";
        if (!text) throw new HttpsError("internal", j.promptFeedback && j.promptFeedback.blockReason ? "refused" : "Empty answer");
        return { text, model: m };
      }
      status = r.status; msg = ""; try { msg = ((await r.json()).error || {}).message || ""; } catch (e) {}
      if ((status === 503 || status === 500) && attempt === 0) { await new Promise(res => setTimeout(res, 1500)); continue; }
      break;
    }
    const noQuota = status === 429 && /limit:\s*0\b|free_tier/i.test(msg);
    if (!(status === 404 || status >= 500 || noQuota || (status === 400 && /not found|not supported|unsupported|model/i.test(msg) && !/api.?key/i.test(msg)))) break;
  }
  logger.warn("gemini failed", { status, msg });
  if (status === 429) throw new HttpsError("resource-exhausted", msg || "Gemini is busy. Try again in a minute.");
  if (status === 400 && /api.?key/i.test(msg)) throw new HttpsError("failed-precondition", "The server's Gemini key isn't valid.");
  throw new HttpsError("unavailable", "HTTP " + status + ": " + msg);
});

// Someone recorded money sent to another person in a group they share: let the receiver know.
exports.notifyTransfer = onCall(async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid, { gid, tid } = req.data || {};
  const okId = v => typeof v === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(v);
  if (!okId(tid) || (gid !== undefined && gid !== null && !okId(gid))) throw new HttpsError("invalid-argument", "Bad transfer.");
  // direct transfers (v36) live in transfers/{tid}; older ones in a group's transfers
  const ref = gid ? db.doc("households/" + gid + "/transfers/" + tid) : db.doc("transfers/" + tid), snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "No such transfer.");
  const t = snap.data();
  if (t.from !== uid || t.author !== uid) throw new HttpsError("permission-denied", "Not your transfer.");
  if (t.notified) return { sent: 0 };
  if (gid) {
    const g = (await db.doc("households/" + gid).get()).data() || {};
    if (!(g.members || []).includes(uid) || !(g.members || []).includes(t.to)) throw new HttpsError("permission-denied", "Not in this group.");
  } else if (!(await db.doc("access/" + t.to).get()).exists) throw new HttpsError("not-found", "They don't use Pocket Ledger.");
  // if they've already chosen how money from this person counts, the app adds it for them
  let auto = false;
  try {
    const u = (await db.doc("users/" + t.to).get()).data() || {};
    const p = u.personal ? (await db.doc("households/" + u.personal).get()).data() || {} : {};
    auto = !!(((p.settings || {}).xferRules || {})[uid]);
  } catch (e) { auto = false; }
  const amt = "MVR " + Number(t.amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sent = await sendTo([t.to], (t.fromName || "Someone") + " sent you " + amt, (t.note ? t.note + ". " : "") + (auto ? "It's added to your income when you open Pocket Ledger." : "Open Pocket Ledger to choose how it counts."), "transfers");
  await ref.update({ notified: Date.now() });
  return { sent };
});

// ---------- people: find someone to send money to, delete a group you made ----------
exports.people = onCall(async req => {
  if (!req.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const uid = req.auth.uid, data = req.data || {};
  if (!(await db.doc("access/" + uid).get()).exists) throw new HttpsError("permission-denied", "No access.");
  if (data.action === "lookup") {
    // by exact email only: you have to know who you're looking for (nobody can list the app's users)
    const email = String(data.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpsError("invalid-argument", "That email doesn't look right.");
    let user = null; try { user = await getAuth().getUserByEmail(email); } catch (e) { user = null; }
    if (!user || user.uid === uid || !(await db.doc("access/" + user.uid).get()).exists) throw new HttpsError("not-found", "Nobody with that email uses Pocket Ledger.");
    const u = (await db.doc("users/" + user.uid).get()).data() || {};
    return { uid: user.uid, name: u.name || email.split("@")[0] };
  }
  if (data.action === "deleteGroup") {
    const gid = String(data.gid || "");
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(gid)) throw new HttpsError("invalid-argument", "Bad group.");
    const ref = db.doc("households/" + gid), snap = await ref.get();
    if (!snap.exists) return { ok: true };
    const g = snap.data();
    if (g.type !== "group" || g.owner !== uid) throw new HttpsError("permission-denied", "Only the person who made the group can delete it.");
    for (const m of g.members || []) await db.doc("users/" + m).set({ spaces: FieldValue.arrayRemove(gid) }, { merge: true });
    await db.recursiveDelete(ref);
    logger.info("group deleted", { gid, by: uid });
    return { ok: true };
  }
  throw new HttpsError("invalid-argument", "Unknown action.");
});
