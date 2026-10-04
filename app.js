// Pocket Ledger: sign-in, invite check, space set-up and connection to Firebase.
// The money screens live in js/ (js/main.js); this file gets the signed-in
// person and their spaces, then hands over to boot().
import { firebaseConfig } from "./config.js";
import { boot } from "./js/main.js";
import { addPeek } from "./js/util.js";
addPeek(); // show/hide on password and PIN boxes

const SDK = "12.19.0";
const $ = id => document.getElementById(id);
const VIEWS = ["gLoading", "gSignin", "gInvite", "gSetup", "gConfig"];
function showGate(view) {
  $("gate").hidden = false;
  VIEWS.forEach(v => $(v).hidden = v !== view);
}
function gateMsg(id, text) { const el = $(id); el.textContent = text || ""; el.hidden = !text; }
function busy(btn, on, label) { btn.disabled = on; if (label) { if (on) { btn.dataset.l = btn.textContent; btn.textContent = label; } else if (btn.dataset.l) btn.textContent = btn.dataset.l; } }

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

const AUTH_MSG = {
  "auth/invalid-credential": "That email and password don't match. Check them, or create an account if you're new.",
  "auth/wrong-password": "That password isn't right for this email.",
  "auth/user-not-found": "There's no account with that email yet. Use Create account.",
  "auth/email-already-in-use": "There's already an account with that email. Use Sign in instead.",
  "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/missing-password": "Enter your password.",
  "auth/network-request-failed": "You seem to be offline. Connect to the internet to sign in.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes and try again."
};
const authErr = e => AUTH_MSG[e && e.code] || "Something went wrong. Check your connection and try again.";

async function main() {
  if (!firebaseConfig || !firebaseConfig.apiKey) { showGate("gConfig"); return; }
  showGate("gLoading");
  let A, F, initializeApp;
  try {
    const mods = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore.js`)
    ]);
    initializeApp = mods[0].initializeApp; A = mods[1]; F = mods[2];
  } catch {
    $("gLoadingMsg").textContent = "Pocket Ledger needs the internet the very first time it opens. Connect and reopen it.";
    return;
  }
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch { db = F.getFirestore(app); }

  // ---- sign in / create account ----
  const email = () => $("gEmail").value.trim(), pass = () => $("gPass").value;
  $("gSigninForm").addEventListener("submit", async ev => {
    ev.preventDefault(); gateMsg("gErr", ""); gateMsg("gOk", "");
    const b = $("gSigninBtn"); busy(b, true, "Signing in…");
    try { await A.signInWithEmailAndPassword(auth, email(), pass()); }
    catch (e) { gateMsg("gErr", authErr(e)); }
    busy(b, false);
  });
  $("gCreateBtn").addEventListener("click", async () => {
    gateMsg("gErr", ""); gateMsg("gOk", "");
    if (!email()) return gateMsg("gErr", "Enter your email first.");
    const b = $("gCreateBtn"); busy(b, true, "Creating…");
    try { await A.createUserWithEmailAndPassword(auth, email(), pass()); }
    catch (e) { gateMsg("gErr", authErr(e)); }
    busy(b, false);
  });
  $("gForgot").addEventListener("click", async () => {
    gateMsg("gErr", ""); gateMsg("gOk", "");
    if (!email()) return gateMsg("gErr", "Type your email above, then tap Forgot password again.");
    try { await A.sendPasswordResetEmail(auth, email()); gateMsg("gOk", "Check your inbox for a link to set a new password."); }
    catch (e) { gateMsg("gErr", authErr(e)); }
  });

  // ---- spaces: your private space + groups you're in ----
  let joinCode = new URLSearchParams(location.search).get("join") || "";
  if (joinCode) $("gJoinCode").value = joinCode;
  const H = id => F.doc(db, "households", id);
  const U = uid => F.doc(db, "users", uid);
  const getSnap = async ref => { try { return await F.getDoc(ref); } catch { try { return await F.getDocFromCache(ref); } catch { return null; } } };
  const codeFrom = v => { let c = String(v || "").trim(); const m = c.match(/join=([A-Za-z0-9_-]+)/); if (m) c = m[1]; return /^[A-Za-z0-9_-]{3,40}$/.test(c) ? c : ""; };

  async function createPersonal(user, name, extra) {
    const ref = F.doc(F.collection(db, "households"));
    const me = Object.assign({ id: user.uid, name: name || "Me" }, (extra && extra.me) || {});
    await F.setDoc(ref, Object.assign({}, (extra && extra.top) || {}, {
      type: "personal", owner: user.uid, members: [user.uid], created: Date.now(),
      settings: Object.assign({ currency: "MVR", opening: 0 }, (extra && extra.settings) || {}, { people: [me], openingBy: { [user.uid]: +((extra && extra.opening) || 0) } })
    }));
    return ref.id;
  }

  // One-time move from the old shared household to: your private space + a "Household" group.
  async function migrate(user, hid, udata) {
    const hs = await getSnap(H(hid)); if (!hs || !hs.exists()) return null;
    const hh = hs.data();
    const pOf = hh.personOf || {}, mine = pOf[user.uid] || "p1";
    const st = hh.legacy || hh.settings || {}, people = st.people || [];
    const uidOf = pid => Object.keys(pOf).find(u => pOf[u] === pid) || pid;
    const me = people.find(p => p.id === mine) || { name: (user.email || "Me").split("@")[0] };
    const budgets = st.budgets || {};
    const personal = await createPersonal(user, me.name, {
      me: { bank: me.bank || "", acct: me.acct || "", color: me.color || "" },
      opening: ((st.openingBy || {})[mine]) || 0,
      settings: { currency: st.currency || "MVR", budgets: budgets[mine] ? { [user.uid]: budgets[mine] } : {} },
      top: { ai: hh.ai || { server: false }, gemini: hh.gemini || { key: "" } }
    });
    const read = async col => (await F.getDocs(F.collection(H(hid), col))).docs.map(d => Object.assign({ id: d.id }, d.data()));
    const [entries, goals, loans, recurring, settlements] = await Promise.all(["entries", "goals", "loans", "recurring", "settlements"].map(read));
    const isOwnerFirst = (hh.members || [])[0] === user.uid;
    let batch = F.writeBatch(db), n = 0;
    const flush = async () => { if (n) { await batch.commit(); batch = F.writeBatch(db); n = 0; } };
    const op = async fn => { fn(batch); if (++n >= 400) await flush(); };
    const clean = o => { const c = JSON.parse(JSON.stringify(o)); delete c.id; return c; };
    const toPersonal = async (col, x, patch) => {
      await op(b => b.set(F.doc(F.collection(H(personal), col), x.id), clean(Object.assign({}, x, patch, { author: user.uid }))));
      await op(b => b.delete(F.doc(F.collection(H(hid), col), x.id)));
    };
    const stayGroup = async (col, x, patch) => op(b => b.set(F.doc(F.collection(H(hid), col), x.id), clean(Object.assign({}, x, patch, { author: user.uid }))));
    const minePerson = x => (x.person || "p1") === mine;
    const sharedGoals = new Set(goals.filter(g => g.owner === "shared").map(g => g.id));
    for (const e of entries.filter(minePerson)) {
      if ((e.split && e.split.with) || (e.goalId && sharedGoals.has(e.goalId))) await stayGroup("entries", e, e.split ? { person: user.uid, split: Object.assign({}, e.split, { with: uidOf(e.split.with) }) } : { person: user.uid });
      else await toPersonal("entries", e, { person: user.uid });
    }
    for (const l of loans.filter(minePerson)) await toPersonal("loans", l, { person: user.uid });
    for (const r of recurring.filter(minePerson)) await toPersonal("recurring", r, { person: user.uid });
    for (const g of goals) {
      if (g.owner === mine) await toPersonal("goals", g, { owner: user.uid });
      else if (g.owner === "shared" && isOwnerFirst) await stayGroup("goals", g, {});
    }
    if (isOwnerFirst) for (const s of settlements) await stayGroup("settlements", s, { from: uidOf(s.from), to: uidOf(s.to) });
    await flush();
    // turn the old household into a group (first person to update does this)
    if (hh.type !== "group") {
      const names = {}, colors = {};
      people.forEach(p => { const u = uidOf(p.id); if ((hh.members || []).includes(u)) { names[u] = p.name; if (p.color) colors[u] = p.color; } });
      const gb = {}; if (budgets.all) gb.all = budgets.all;
      await F.updateDoc(H(hid), { type: "group", name: "Household", owner: (hh.members || [user.uid])[0], names, colors, legacy: st,
        settings: { currency: st.currency || "MVR", opening: 0, budgets: gb } });
    } else {
      await F.updateDoc(H(hid), { ["names." + user.uid]: me.name });
    }
    await F.setDoc(U(user.uid), { personal, spaces: F.arrayUnion(hid), name: me.name, email: user.email || "" }, { merge: true });
    return personal;
  }

  async function joinGroup(user, code, name) {
    await F.updateDoc(H(code), { members: F.arrayUnion(user.uid), ["names." + user.uid]: name || (user.email || "Member").split("@")[0] });
    await F.setDoc(U(user.uid), { spaces: F.arrayUnion(code) }, { merge: true });
  }

  async function loadSpaces(user, udata) {
    const ps = await getSnap(H(udata.personal));
    const aiOn = d => !!(d && d.ai && d.ai.server);
    const list = [{ id: udata.personal, name: "Me", type: "personal", role: "member", ai: aiOn(ps && ps.exists() && ps.data()) }];
    for (const id of [...new Set(udata.spaces || [])]) {
      const s = await getSnap(H(id));
      if (s && s.exists() && (s.data().members || []).includes(user.uid)) list.push({ id, name: s.data().name || "Group", type: "group", role: "member", owner: s.data().owner, ai: aiOn(s.data()) });
    }
    return list;
  }

  // ---- invite-only: you need an invite code once (people who used the app before are let in) ----
  let inviteFromUrl = new URLSearchParams(location.search).get("invite") || "";
  let fnsP = null;
  const callAccess = async data => {
    if (!fnsP) fnsP = import(`https://www.gstatic.com/firebasejs/${SDK}/firebase-functions.js`).then(m => m.httpsCallable(m.getFunctions(app, "asia-south1"), "access", { timeout: 30000 }));
    return (await (await fnsP)(data || {})).data || {};
  };
  const accKey = uid => "pl-acc-" + uid;
  async function ensureAccess(user, code) {
    const a = await getSnap(F.doc(db, "access", user.uid));
    if (a && a.exists()) { const v = { admin: !!a.data().admin }; try { localStorage.setItem(accKey(user.uid), JSON.stringify(v)); } catch {} return v; }
    try { const c = localStorage.getItem(accKey(user.uid)); if (c && !navigator.onLine) return JSON.parse(c); localStorage.removeItem(accKey(user.uid)); } catch {}
    const r = await callAccess(code ? { code } : {});
    try { localStorage.setItem(accKey(user.uid), JSON.stringify({ admin: !!r.admin })); } catch {}
    return r;
  }
  const accessMsg = e => {
    const m = String((e && e.message) || ""), c = String((e && e.code) || "").replace("functions/", "");
    if (/removed/.test(m)) return "Your access to Pocket Ledger was removed. Ask the person who invited you if this is a mistake.";
    if (c === "permission-denied" || /invite-needed/.test(m)) return "";
    if (c === "not-found") return "That invite code isn't valid. Check it and try again.";
    if (c === "failed-precondition") return m || "That invite can't be used any more. Ask for a new one.";
    return "Couldn't check your invite. Check your connection and try again.";
  };
  let pendingUser = null;
  $("gInviteBtn").addEventListener("click", async () => {
    gateMsg("gInviteErr", "");
    let code = $("gInviteCode").value.trim(); const m = code.match(/invite=([A-Za-z0-9]+)/); if (m) code = m[1];
    if (!/^[A-Za-z0-9]{6,40}$/.test(code)) return gateMsg("gInviteErr", "Paste the invite link or code you were sent.");
    const b = $("gInviteBtn"); busy(b, true, "Checking…");
    try { await ensureAccess(pendingUser, code); busy(b, false); enter(pendingUser, true); }
    catch (e) { busy(b, false); gateMsg("gInviteErr", accessMsg(e) || "That invite code isn't valid."); }
  });
  $("gInviteOut").addEventListener("click", async () => { await A.signOut(auth); location.replace(location.pathname); });

  async function enter(user, accessOk) {
    showGate("gLoading");
    if (!accessOk) {
      try { const acc = await ensureAccess(user, inviteFromUrl); user.plAdmin = !!acc.admin; }
      catch (e) {
        const msg = accessMsg(e);
        // server not reachable / not set up yet: people who already use the app carry on (the database rules still decide)
        if (msg && !inviteFromUrl && !/removed/.test(String(e && e.message))) {
          const us0 = await getSnap(U(user.uid)); const d0 = us0 && us0.exists() ? us0.data() : {};
          if (d0.personal || d0.household) return enter(user, true);
        }
        pendingUser = user; $("gInviteWho").textContent = user.email || "";
        if (inviteFromUrl) $("gInviteCode").value = inviteFromUrl;
        gateMsg("gInviteErr", msg); showGate("gInvite"); return;
      }
      if (inviteFromUrl) { inviteFromUrl = ""; try { history.replaceState(null, "", location.pathname + (joinCode ? "?join=" + joinCode : "")); } catch {} }
    } else { try { user.plAdmin = !!JSON.parse(localStorage.getItem(accKey(user.uid)) || "{}").admin; } catch {} }
    let us = await getSnap(U(user.uid));
    let udata = us && us.exists() ? us.data() : {};
    try {
      if (!udata.personal && udata.household) { await migrate(user, udata.household, udata); us = await getSnap(U(user.uid)); udata = us.data(); }
    } catch (err) { console.error(err); $("gLoadingMsg").textContent = "Couldn't finish updating your data. Check your connection and reopen the app."; return; }
    if (!udata.personal) { $("gWho").textContent = user.email || ""; showGate("gSetup"); if (joinCode) $("gJoinCode").focus(); else $("gMyName").focus(); return; }
    if (joinCode && !(udata.spaces || []).includes(joinCode)) {
      try { await joinGroup(user, joinCode, udata.name); udata.spaces = (udata.spaces || []).concat(joinCode); localStorage.setItem("pl-space-" + user.uid, joinCode); }
      catch (e) { alertJoin(e); }
      history.replaceState(null, "", location.pathname); joinCode = "";
    }
    const spaces = await loadSpaces(user, udata);
    let cur = ""; try { cur = localStorage.getItem("pl-space-" + user.uid) || ""; } catch {}
    const space = spaces.find(s => s.id === cur) || spaces[0];
    start(user, space, spaces, udata);
  }
  function alertJoin(e) {
    const t = e && e.code === "not-found" ? "No group has that code." : e && e.code === "permission-denied" ? "That invite link has expired. Ask for a new one (Settings › Open invitations)." : "Couldn't join that group.";
    try { sessionStorage.setItem("pl-join-msg", t); } catch {}
  }

  $("gContinue").addEventListener("click", async () => {
    gateMsg("gSetupErr", "");
    const user = auth.currentUser; if (!user) return;
    const name = $("gMyName").value.trim();
    if (!name) return gateMsg("gSetupErr", "Enter your name.");
    const code = codeFrom($("gJoinCode").value);
    if ($("gJoinCode").value.trim() && !code) return gateMsg("gSetupErr", "That invite code doesn't look right. Copy the whole link or code.");
    const b = $("gContinue"); busy(b, true, "Setting up…");
    try {
      const personal = await createPersonal(user, name);
      await F.setDoc(U(user.uid), { personal, name, email: user.email || "", spaces: [] }, { merge: true });
      if (code) { try { await joinGroup(user, code, name); localStorage.setItem("pl-space-" + user.uid, code); } catch (e) { alertJoin(e); } }
      if (joinCode) { history.replaceState(null, "", location.pathname); joinCode = ""; }
      enter(user);
    } catch { gateMsg("gSetupErr", "Couldn't set up. Check your connection and try again."); busy(b, false); }
  });
  $("gSignout").addEventListener("click", () => A.signOut(auth));

  // ---- start the money screens ----
  let started = false;
  function start(user, space, spaces, udata) {
    if (started) return; started = true;
    // An older copy of the page (from the browser's cache) doesn't have the new screens: load it fresh once.
    if (!$("app")) {
      try { if (!sessionStorage.getItem("pl-fresh")) { sessionStorage.setItem("pl-fresh", "1"); location.reload(); return; } } catch {}
    }
    try { sessionStorage.removeItem("pl-fresh"); } catch {}
    try {
      bootApp(user, space, spaces, udata);
      $("gate").hidden = true;
    } catch (err) {
      console.error(err); if ($("app")) $("app").hidden = true;
      showGate("gLoading");
      $("gLoadingMsg").innerHTML = "Pocket Ledger couldn't open. Close it completely and open it again.<br><small>" + String((err && err.message) || err).replace(/[<>&]/g, "") + "</small>";
    }
  }
  function bootApp(user, space, spaces, udata) {
    boot({
      F, db, hid: space.id, space, spaces, profile: udata, user, app, sdk: SDK, admin: !!user.plAdmin,
      switchTo: id => { try { localStorage.setItem("pl-space-" + user.uid, id); } catch {} location.reload(); },
      joinGroup: code => joinGroup(user, code, udata.name),
      signOut: async () => { await A.signOut(auth); location.reload(); }
    });
  }

  A.onAuthStateChanged(auth, async user => {
    if (started) { if (!user) location.reload(); return; }
    if (!user) { showGate("gSignin"); return; }
    enter(user);
  });
}

main();
