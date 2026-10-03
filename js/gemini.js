// Talking to Gemini: through your secure server (the "gemini" Cloud Function),
// or straight to Google with a key if a space still uses one.
import { $, lsGet, lsSet, toast } from "./util.js";
import { ctx, state, hRef } from "./store.js";
import { callFn, serverMissing } from "./notify.js";

const KEY_LS = "pl-gemini-key", MODEL_LS = "pl-gemini-model";
const MODEL_CHAIN = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
const spaceKey = () => String((state.household && state.household.gemini && state.household.gemini.key) || "").trim();
const geminiKey = () => lsGet(KEY_LS).trim() || spaceKey();
export const serverAI = () => !!(state.household && state.household.ai && state.household.ai.server) || (ctx.spaces || []).some(s => s.ai);
export const aiReady = () => !!(geminiKey() || serverAI());

let callableP = null;
async function serverGemini(payload, signal) {
  if (!callableP) callableP = import("https://www.gstatic.com/firebasejs/" + ctx.sdk + "/firebase-functions.js")
    .then(m => m.httpsCallable(m.getFunctions(ctx.app, "asia-south1"), "gemini", { timeout: 120000 }));
  let fn; try { fn = await callableP; } catch { callableP = null; throw { code: "offline" }; }
  const aborted = new Promise((_, rej) => { if (signal) signal.addEventListener("abort", () => rej({ code: "cancelled" }), { once: true }); });
  try {
    const r = await Promise.race([fn(payload), aborted]);
    return (r && r.data && r.data.text) || "";
  } catch (e) {
    if (e && e.code === "cancelled") throw e;
    const c = String((e && e.code) || "").replace("functions/", "");
    throw { code: c === "resource-exhausted" ? "rate_limited" : c === "failed-precondition" ? "bad_key" : "http", message: (e && e.message) || c };
  }
}
async function shrinkImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file); } catch { throw { code: "image_rejected", message: (file.type || "unknown type") + ", " + Math.round((file.size || 0) / 1024) + " KB" }; }
  const max = 1600, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * sc)); c.height = Math.max(1, Math.round(bmp.height * sc));
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c.toDataURL("image/jpeg", 0.8).split(",")[1];
}
async function fileB64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export async function geminiText(prompt, files, opts) {
  opts = opts || {};
  const signal = opts.signal, key = geminiKey(), server = serverAI();
  if (!key && !server) throw { code: "no_key" };
  if (!navigator.onLine) throw { code: "offline" };
  const parts = [{ text: prompt }];
  for (const f of files || []) {
    if (/pdf/i.test(f.type || "") || /\.pdf$/i.test(f.name || "")) {
      if ((f.size || 0) > 8e6) throw { code: "too_big", message: Math.round(f.size / 1e6) + " MB" };
      parts.push({ inline_data: { mime_type: "application/pdf", data: await fileB64(f) } });
    } else parts.push({ inline_data: { mime_type: "image/jpeg", data: await shrinkImage(f) } });
  }
  if (opts.audio) parts.push({ inline_data: { mime_type: "audio/wav", data: opts.audio } });
  if (signal && signal.aborted) throw { code: "cancelled" };
  const gen = { temperature: opts.temperature ?? 0.1 };
  if (opts.json) gen.response_mime_type = "application/json";
  if (server) return serverGemini(Object.assign({ contents: [{ role: "user", parts }], generationConfig: gen, model: lsGet(MODEL_LS).trim() || null }, opts.search ? { search: true } : {}), signal);
  const body = JSON.stringify(Object.assign({ contents: [{ role: "user", parts }], generationConfig: gen }, opts.search ? { tools: [{ google_search: {} }] } : {}));
  const call = async model => {
    try { return await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent", { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body, signal }); }
    catch (e) { throw { code: e && e.name === "AbortError" ? "cancelled" : "offline" }; }
  };
  const wait = ms => new Promise(res => setTimeout(res, ms));
  // try the chosen model, then other current Flash models if one isn't available, is busy, or has no free quota
  const own = lsGet(MODEL_LS).trim(), chain = own ? [own] : MODEL_CHAIN;
  let r = null, msg = "", status = 0;
  for (const model of chain) {
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await call(model);
      if (r.ok) break;
      status = r.status; msg = "";
      try { msg = ((await r.clone().json()).error || {}).message || ""; } catch {}
      if ((status === 503 || status === 500) && attempt === 0) { await wait(1500); continue; }
      break;
    }
    if (r.ok) break;
    const noQuota = status === 429 && /limit:\s*0\b|free_tier/i.test(msg);
    if (!(status === 404 || status >= 500 || noQuota || (status === 400 && /not found|not supported|unsupported|model/i.test(msg) && !/api.?key/i.test(msg)))) break;
  }
  if (!r.ok) throw { code: status === 429 ? "rate_limited" : (status === 401 || status === 403 || /api.?key/i.test(msg)) ? "bad_key" : "http", message: (status ? "HTTP " + status + ": " : "") + msg };
  const j = await r.json(), cand = (j.candidates || [])[0];
  const text = cand && cand.content ? (cand.content.parts || []).filter(p => !p.thought).map(p => p.text || "").join("") : "";
  if (!text) throw { code: j.promptFeedback && j.promptFeedback.blockReason ? "refused" : "http", message: "Empty answer" + (cand && cand.finishReason ? " (" + cand.finishReason + ")" : "") };
  return text;
}
export function parseJsonText(text) {
  const t = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(t); } catch {}
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  throw { code: "http", message: "Couldn't understand the answer: " + t.slice(0, 120) };
}
export const geminiJson = async (prompt, files, signal) => parseJsonText(await geminiText(prompt, files, { json: true, signal }));

// ---------- Settings › Gemini ----------
export function renderSettings() {
  const on = serverAI(), dk = lsGet(KEY_LS).trim(), hk = spaceKey();
  $("srvState").textContent = on ? "Gemini runs on your secure server for everyone. No key is stored in the app." : "Optional: run Gemini on your secure server, so no key is stored in the app or on phones.";
  $("srvOn").hidden = on; $("srvOff").hidden = !on;
  $("hkeyField").hidden = on; $("hkeyHint").hidden = on;
  $("setHKey").value = hk || dk; $("setKey").value = dk && dk !== (hk || dk) ? dk : ""; $("setModel").value = lsGet(MODEL_LS);
}
export function initSettings() {
  $("srvOn").addEventListener("click", async () => {
    $("srvOn").disabled = true;
    try {
      await callFn("gemini", { ping: true });
      await ctx.F.updateDoc(hRef(), { ai: { server: true }, gemini: { key: "" } });
      state.household.ai = { server: true }; state.household.gemini = { key: "" }; lsSet(KEY_LS, "");
      toast("Gemini now runs on your server"); renderSettings();
    } catch (e) { toast(serverMissing(e) ? "The Gemini server isn't set up yet. Run the setup steps first." : e && e.code === "permission-denied" ? "Only the group's creator can change this." : (e && e.message) || "Couldn't reach the server."); }
    $("srvOn").disabled = false;
  });
  $("srvOff").addEventListener("click", async () => {
    try { await ctx.F.updateDoc(hRef(), { ai: { server: false } }); state.household.ai = { server: false }; renderSettings(); toast("Stopped using the server. Add a key below to keep using Gemini."); }
    catch { toast("Couldn't change that. Check your connection."); }
  });
  $("saveAi").addEventListener("click", async () => {
    const hk = $("setHKey").value.trim(), dk = $("setKey").value.trim();
    lsSet(KEY_LS, dk && dk !== hk ? dk : ""); lsSet(MODEL_LS, $("setModel").value.trim());
    if (!serverAI() && hk !== spaceKey() && (state.household.type !== "group" || state.household.owner === ctx.user.uid)) {
      try { await ctx.F.updateDoc(hRef(), { gemini: { key: hk } }); } catch { return toast("Couldn't save the key. Check your connection."); }
    }
    toast("Gemini settings saved");
  });
}
