// Security on this device (v45): a PIN, a pattern or a password when the app opens and after a minute away,
// plus optional face or fingerprint (the phone decides which). It's a privacy screen on this device only.
import { $, toast } from "./util.js";

const LOCK_LS = "pl-lock";
const cfg = () => { try { return JSON.parse(localStorage.getItem(LOCK_LS) || "null"); } catch { return null; } };
const save = c => { try { localStorage.setItem(LOCK_LS, JSON.stringify(c)); } catch {} };
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
// PBKDF2 so a short PIN isn't a quick guess if someone copies the stored value (old PIN locks use plain SHA-256 and keep working)
async function hashSecret(secret, salt, slow) {
  const enc = new TextEncoder();
  if (!slow) return b64(await crypto.subtle.digest("SHA-256", enc.encode(salt + ":" + secret)));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(salt), iterations: 120000, hash: "SHA-256" }, key, 256));
}
const method = c => (c && c.method) || "pin";
const check = async (secret, c) => (await hashSecret(secret, c.salt, !!c.slow)) === c.hash;
let lockedAt = 0, pinBuf = "";

// ---------- the 3x3 pattern pad (drawn with a finger or mouse) ----------
function patternPad(host, onDone) {
  host.innerHTML = '<svg class="pat-line" aria-hidden="true"><polyline points=""/></svg>' + Array.from({ length: 9 }, (_, i) => `<button type="button" class="pat-dot" data-i="${i}" aria-label="Dot ${i + 1}"><i></i></button>`).join("");
  host.classList.add("pat");
  const dots = [...host.querySelectorAll(".pat-dot")], line = host.querySelector("polyline"), svg = host.querySelector("svg");
  let seq = [], drawing = false, cursor = null;
  const centre = d => { const r = d.getBoundingClientRect(), h = host.getBoundingClientRect(); return [r.left + r.width / 2 - h.left, r.top + r.height / 2 - h.top]; };
  const paint = () => {
    const pts = seq.map(i => centre(dots[i])); if (drawing && cursor && seq.length) pts.push(cursor);
    line.setAttribute("points", pts.map(p => p.join(",")).join(" "));
    dots.forEach((d, i) => d.classList.toggle("on", seq.includes(i)));
  };
  const hit = (x, y) => dots.findIndex(d => { const r = d.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; return Math.hypot(x - cx, y - cy) < r.width * .62; });
  const add = (x, y) => { const i = hit(x, y); if (i >= 0 && !seq.includes(i)) { seq.push(i); if (navigator.vibrate) try { navigator.vibrate(6); } catch {} } };
  host.addEventListener("pointerdown", ev => { ev.preventDefault(); drawing = true; seq = []; try { host.setPointerCapture(ev.pointerId); } catch {} add(ev.clientX, ev.clientY); const h = host.getBoundingClientRect(); cursor = [ev.clientX - h.left, ev.clientY - h.top]; paint(); });
  host.addEventListener("pointermove", ev => { if (!drawing) return; add(ev.clientX, ev.clientY); const h = host.getBoundingClientRect(); cursor = [ev.clientX - h.left, ev.clientY - h.top]; paint(); });
  const end = () => { if (!drawing) return; drawing = false; cursor = null; paint(); const s = seq.join("-"), n = seq.length; setTimeout(() => { seq = []; paint(); }, 450); onDone(s, n); };
  host.addEventListener("pointerup", end); host.addEventListener("pointercancel", end);
  return { reset() { seq = []; drawing = false; paint(); } };
}

// ---------- the lock screen ----------
const wrong = () => { const e = $("lockErr"); e.textContent = ({ pin: "That PIN isn't right.", pattern: "That pattern isn't right.", password: "That password isn't right." })[method(cfg())]; e.hidden = false; };
let lockPat = null;
function showLock() {
  const c = cfg(); if (!c) return; const m = method(c);
  pinBuf = ""; $("lockDots").textContent = ""; $("lockErr").hidden = true;
  $("lockPad").hidden = m !== "pin"; $("lockDots").hidden = m !== "pin";
  $("lockPatWrap").hidden = m !== "pattern"; $("lockPwWrap").hidden = m !== "password";
  $("lockBioBtn").hidden = !c.cred;
  $("lockPw").value = ""; $("lock").hidden = false;
  if (m === "pattern" && !lockPat) lockPat = patternPad($("lockPatPad"), async s => { const k = cfg(); if (!k) return; if (await check(s, k)) unlock(); else wrong(); });
  if (c.cred) setTimeout(tryBio, 250);
  else if (m === "password") setTimeout(() => $("lockPw").focus(), 100);
}
function unlock() { $("lock").hidden = true; pinBuf = ""; $("lockErr").hidden = true; }
async function tryBio() {
  const c = cfg(); if (!c || !c.cred) return;
  try {
    await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: unb64(c.cred) }], userVerification: "required", timeout: 60000 } });
    unlock();
  } catch { $("lockErr").textContent = "That didn't work. Use your " + ({ pin: "PIN", pattern: "pattern", password: "password" })[method(c)] + " instead."; $("lockErr").hidden = false; }
}

export function initLock() {
  $("lockPad").addEventListener("click", async ev => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.k === "del") pinBuf = pinBuf.slice(0, -1);
    else if (pinBuf.length < 8) pinBuf += b.dataset.k;
    $("lockDots").textContent = "•".repeat(pinBuf.length);
    const c = cfg();
    // a PIN made in v45 or later knows its length, so a wrong one is called out (and cleared) as soon as it's all typed
    const L = (c && c.len) || 0, full = L ? pinBuf.length >= L : pinBuf.length >= 8;
    if (c && method(c) === "pin" && (L ? pinBuf.length === L : pinBuf.length >= 4) && await check(pinBuf, c)) unlock();
    else if (c && full) { wrong(); pinBuf = ""; $("lockDots").textContent = ""; }
  });
  const tryPw = async () => { const c = cfg(); if (!c) return; if (await check($("lockPw").value, c)) unlock(); else { wrong(); $("lockPw").select(); } };
  $("lockPwGo").addEventListener("click", tryPw);
  $("lockPw").addEventListener("keydown", ev => { if (ev.key === "Enter") tryPw(); });
  $("lockBioBtn").addEventListener("click", tryBio);
  document.addEventListener("visibilitychange", () => {
    if (!cfg()) return;
    if (document.hidden) lockedAt = Date.now();
    else if (lockedAt && Date.now() - lockedAt > 60000) showLock();
  });
  if (cfg()) showLock();
}

// ---------- Settings › Security ----------
const NAME = { pin: "PIN", pattern: "pattern", password: "password" };
let pick = "pin", firstPat = "", setPat = null;
function bioSupported() { return !!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable); }
export function renderSettings() {
  const c = cfg(), on = !!c;
  $("lockState").textContent = on ? "On: Pocket Ledger asks for your " + NAME[method(c)] + (c.cred ? ", or your face or fingerprint," : "") + " when opened, and after a minute away." : "Off. Anyone who picks up your phone can open the app.";
  $("lockOn").hidden = on; $("lockChange").hidden = !on; $("lockOff").hidden = !on;
  $("lockSetup").hidden = true;
  const row = $("lockBioRow"); row.hidden = true;
  if (on && bioSupported()) PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(ok => {
    if (!ok) return; row.hidden = false; const k = cfg();
    $("lockBioState").textContent = k && k.cred ? "On. Your phone decides whether that's Face ID or a fingerprint." : "Off.";
    $("lockBioAdd").hidden = !!(k && k.cred); $("lockBioOff").hidden = !(k && k.cred);
  }).catch(() => {});
}
function showMethod() {
  document.querySelectorAll("#lockMethod button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.m === pick)));
  $("lsPin").hidden = pick !== "pin"; $("lsPattern").hidden = pick !== "pattern"; $("lsPw").hidden = pick !== "password";
  $("lockSave").hidden = pick === "pattern";
  firstPat = ""; $("lsPatHint").textContent = "Draw a pattern that joins at least 4 dots.";
  if (pick === "pattern") { if (!setPat) setPat = patternPad($("lsPatPad"), onSetPattern); else setPat.reset(); }
}
function onSetPattern(s, n) {
  if (n < 4) { $("lsPatHint").textContent = "Join at least 4 dots. Try again."; firstPat = ""; return; }
  if (!firstPat) { firstPat = s; $("lsPatHint").textContent = "Draw it once more to confirm."; return; }
  if (firstPat !== s) { firstPat = ""; $("lsPatHint").textContent = "Those didn't match. Draw your pattern again."; return; }
  store("pattern", s);
}
async function store(m, secret) {
  const old = cfg(), salt = b64(crypto.getRandomValues(new Uint8Array(12)));
  save({ method: m, salt, slow: true, hash: await hashSecret(secret, salt, true), cred: old && old.cred, ...(m === "pin" ? { len: secret.length } : {}) });
  renderSettings(); toast("Security is on");
}
export function initSettings() {
  const open = () => { pick = method(cfg()); $("lockSetup").hidden = false; ["lockPin1", "lockPin2", "lockPw1", "lockPw2"].forEach(id => $(id).value = ""); showMethod(); };
  $("lockOn").addEventListener("click", open); $("lockChange").addEventListener("click", open);
  $("lockCancel").addEventListener("click", () => { $("lockSetup").hidden = true; });
  $("lockMethod").addEventListener("click", ev => { const b = ev.target.closest("button[data-m]"); if (b) { pick = b.dataset.m; showMethod(); } });
  $("lockSave").addEventListener("click", async () => {
    if (pick === "pin") {
      const a = $("lockPin1").value.trim(), b = $("lockPin2").value.trim();
      if (!/^\d{4,8}$/.test(a)) return toast("Use 4 to 8 digits.");
      if (a !== b) return toast("The two PINs don't match.");
      await store("pin", a);
    } else if (pick === "password") {
      const a = $("lockPw1").value, b = $("lockPw2").value;
      if (a.length < 6) return toast("Use at least 6 characters.");
      if (a !== b) return toast("The two passwords don't match.");
      await store("password", a);
    }
  });
  $("lockOff").addEventListener("click", () => { try { localStorage.removeItem(LOCK_LS); } catch {} renderSettings(); toast("Security is off"); });
  $("lockBioOff").addEventListener("click", () => { const c = cfg(); if (c) { delete c.cred; save(c); } renderSettings(); toast("Face or fingerprint is off"); });
  $("lockBioAdd").addEventListener("click", async () => {
    try {
      const cred = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: "Pocket Ledger" },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: "pocket-ledger", displayName: "Pocket Ledger" },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" }, timeout: 60000 } });
      const c = cfg(); c.cred = b64(cred.rawId); save(c);
      renderSettings(); toast("Face or fingerprint is on");
    } catch { toast("That wasn't set up. You can still use your " + NAME[method(cfg())] + "."); }
  });
}
