// Scan a receipt, bill or bank screenshot: Gemini reads it, you check, then add.
import { $, esc, money, num, r2, sum, todayISO, toast, ISO, fmtDate, monthName, daysBetween } from "./util.js";
import { state, ui, meId, isGroup, people, pname, visibleGoals, catOptions, guessCategory, EXP_CATS, INC_CATS, TYPE_LABEL, changed, db, EAT, mealAt, mealFromNote } from "./store.js";
import { budgetCheck } from "./actions.js";
import { aiReady, geminiJson, geminiText, parseJsonText } from "./gemini.js";
import { go } from "./shell.js";

let scanAbort = null, items = [];
const TYPES = Object.entries(TYPE_LABEL);
const open = () => { $("scanWrap").hidden = false; document.body.classList.add("sheet-open"); };
export function closeScan() { if (scanAbort) scanAbort.abort(); scanAbort = null; items = []; $("scanWrap").hidden = true; document.body.classList.remove("sheet-open"); }
const status = (html, busy) => { $("scanStatus").innerHTML = (busy ? '<span class="spin" aria-hidden="true"></span>' : "") + html; };

export function openScanPicker() {
  if (state.readOnly) return toast("You can't add entries here.");
  if (!aiReady()) { go("settings", "ai"); toast("Set up Gemini first (Settings › Gemini)."); return; }
  $("scanFile").click();
}

// every account ending a person has saved: the old single field plus the accounts list (yours from your private space)
function acctDigits(p) {
  const src = p.id === meId() && state.my ? Object.assign({}, p, state.my) : p, d = new Set();
  String(src.acct || "").split(/[,\s]+/).forEach(x => { if (/^\d{4}$/.test(x)) d.add(x); });
  (src.accounts || []).forEach(a => { if (/^\d{4}$/.test(a.last4 || "")) d.add(a.last4); });
  return [...d];
}
function scanPrompt(n) {
  const st = state.settings, cur = st.currency || "MVR", ps = people(), me = pname(meId());
  const goals = visibleGoals(meId()).map(g => g.name);
  return [
    "You are reading " + (n === 1 ? "a photo or screenshot" : n + " photos or screenshots") + " for a personal money tracker. Find each money transaction shown and reply with JSON only.",
    "",
    "Context:",
    "- Today is " + todayISO() + ". The tracker's currency is " + cur + ".",
    "- People in the tracker: " + ps.map(p => p.name).join(", ") + ". The person adding this is " + me + ".",
    "- Names on their bank accounts: " + ps.map(p => p.name + ": " + ((p.bank || "").trim() || "not set")).join("; ") + ".",
    "- Their bank account numbers end in (last 4 digits of an account number only): " + ps.map(p => p.name + ": " + (acctDigits(p).join(", ") || "not set")).join("; ") + ".",
    "- Expense categories: " + EXP_CATS.join(", ") + ".",
    "- Income categories: " + INC_CATS.join(", ") + ".",
    "- Savings goals: " + (goals.length ? goals.join(", ") : "none") + ".",
    "",
    "What to record:",
    "- A shop receipt, bill or TAX INVOICE (a printed slip, often photographed in someone's hand, maybe creased or at an angle): it is ONE expense, never income, never a transfer. The amount is the final total actually paid: use \"Grand Total\", \"Total\", \"Net Total\" or \"Amount Due\" (after discounts, including GST/TGST and service charge). Ignore Sub Total, GST lines, Tendered/Cash/Paid, Change/Balance and item rates. Small rounding differences between Sub Total + GST and Grand Total are normal: trust the Grand Total and don't ask about it. Do not list line items separately. Note: the shop name (from the top of the slip), then EVERY item on the slip in short plain words (1-3 words each, add x2 for quantities above 1), like \"Hardware Shop: bolster case x2, bucket, cutting board, hanger, bolster\". Count the item lines and check none is missed. Only if the note would go over 150 characters, list the biggest items and end with \"+ N more\". Pick the category from what was bought: groceries or food items -> Food & groceries; restaurant, cafe, takeaway, or ready-to-eat snacks and short eats (gulha, bajiya, samosa, chips, a drink to have now) -> Eating out, and then also set meal; household items, clothes, electronics, hardware -> Shopping; pharmacy -> Health; fuel or fares -> Transport.",
    "- On a shop receipt, a \"Remittance instruction\", beneficiary name, BML/MIB account numbers, TIN, cashier, bill number, phone or Viber numbers are just the shop's details. They do NOT make it a bank transfer and are not the amount. \"Cust. Name: Cash Sales\" just means a walk-in customer.",
    "- A bank app screen, transfer confirmation or SMS alert: each money-out is an expense, each money-in is income (salary, transfers received). A transfer clearly into the user's own savings account is type \"save\".",
    "- Bank transfer receipts (for example Bank of Maldives or MIB, showing From, To, Reference, Transaction date and Amount): From is the sender and To is the recipient. Decide the direction by cross-checking two things, the account number and the name. (1) Account: only a printed ACCOUNT NUMBER counts (a long digit string, usually 13 to 17 digits, shown under From/To, Account, Beneficiary or Debit/Credit account). Compare its LAST 4 digits with the people's digits. Amounts (like 1,000.00 or 1000), references, dates, times, phone numbers and card numbers are NEVER account numbers, even when they contain the same 4 digits. If the To account ends in a person's digits, it points to money IN for that person; if the From account does, it points to money OUT. (2) Name: match the From and To names loosely against the people's names and bank names (initials, abbreviations like AMTH or MOHD, and dots are fine). The account number wins over the name, because senders often save people under nicknames like \"Teacher\" or \"Boss\". If the account and the name point in opposite directions, or only part of an account number is visible, or nothing matches, set type to null and ask whether the money went out or came in, naming the two sides. In the note, name the OTHER party: \"From MOHD.NASEEM\" for money in, \"Transfer to Ali\" for money out. For money in, ignore the nickname the sender used for the recipient. For money out, pick the category from the recipient when it is clear (a shop is Shopping), otherwise Other. For money in, use the income categories (Side income if unsure).",
    "- Maldivian receipts, invoices and bank screens write dates as DD/MM/YYYY (day first). 03/10/2026 is 3 October 2026, never March. Use the bill or paid date, not a printed time.",
    "- A list of several transactions (for example a statement): one entry for each.",
    "- Ignore balances and account or card numbers, and never copy account or card numbers into the note. Do copy the transaction reference (like BLAZ847926686391) into ref, if one is shown.",
    "- person is the name of the person from the list above whose money this is, or null if you can't tell.",
    "",
    "Rules:",
    "- Do not guess. If the amount, the date, or whether money came in or went out is unclear, set that field to null and ask a question about it. But a shop receipt with a readable total is clear: answer with confidence high or medium and no questions.",
    "- date is the transaction date as YYYY-MM-DD. If the year is missing, use the most recent such date not after today. If no date is shown, set null and ask, offering \"Today\" with value \"" + todayISO() + "\".",
    "- If the amount is in a different currency from " + cur + ", put the original amount in amount, set currency to that code, and ask how much to record in " + cur + ".",
    "- category must be one of the categories above when one fits, otherwise \"Other\".",
    "- meal: only for Eating out. breakfast, lunch, dinner or snacks (short eats, tea-time, drinks, packets eaten on the go). Use the words on the slip, else the printed time (before 11:00 breakfast, before 15:00 lunch, before 18:00 snacks, later dinner). null if it isn't Eating out or you can't tell.",
    "- Ask at most 2 short, plain questions per transaction, only when something is really unclear. Give 2-4 answer options when you can. Each option is {\"label\": what the button says, \"value\": the value to put in the field}. For type, values are expense, income, save or withdraw. For amount, values are plain numbers. For date, values are YYYY-MM-DD.",
    "- confidence is high when everything is clearly readable, medium if you inferred something, low if the image is hard to read.",
    "",
    "Reply with exactly this JSON shape:",
    '{"summary": "one short sentence on what you found", "transactions": [{"type": "expense" | "income" | "save" | "withdraw" | null, "amount": number | null, "currency": "MVR", "date": "YYYY-MM-DD" | null, "category": "...", "meal": "breakfast" | "lunch" | "dinner" | "snacks" | null, "note": "...", "person": "name" | null, "ref": "..." | null, "confidence": "high" | "medium" | "low", "questions": [{"field": "amount" | "date" | "type" | "category" | "note", "question": "...", "options": [{"label": "...", "value": "..."}]}]}]}',
    "If there are no transactions in the image, return an empty transactions list and say why in summary."
  ].join("\n");
}

export async function startScan(files) {
  if (scanAbort) scanAbort.abort();
  const ctl = new AbortController(); scanAbort = ctl; items = [];
  open(); $("scanTitle").textContent = "Reading your image…";
  $("scanList").innerHTML = ""; $("scanFoot").hidden = true; $("scanErr").hidden = true;
  status("Looking for amounts, dates and shop names. This takes a few seconds.", true);
  try {
    const res = await geminiJson(scanPrompt(files.length), files, ctl.signal);
    if (scanAbort !== ctl) return;
    scanAbort = null;
    const cur0 = state.settings.currency || "MVR";
    items = (Array.isArray(res && res.transactions) ? res.transactions : []).map(t => {
      const type = TYPES.some(x => x[0] === t.type) ? t.type : null;
      const amount = typeof t.amount === "number" && isFinite(t.amount) && t.amount > 0 ? Math.round(t.amount * 100) / 100 : null;
      const qs = (Array.isArray(t.questions) ? t.questions : []).slice(0, 3).map(q => ({
        field: String(q.field || ""), question: String(q.question || ""), picked: null,
        options: (Array.isArray(q.options) ? q.options : []).slice(0, 4).map(o => ({ label: String(o.label ?? o.value ?? ""), value: String(o.value ?? o.label ?? "") }))
      })).filter(q => q.question);
      return { include: true, type: type || "expense", typeKnown: !!type, amount, date: typeof t.date === "string" && ISO.test(t.date) ? t.date : null,
        currency: String(t.currency || cur0).toUpperCase().slice(0, 3), category: String(t.category || "") || (type === "income" ? "Salary" : "Other"), meal: ["breakfast", "lunch", "dinner", "snacks"].includes(t.meal) ? t.meal : "",
        note: String(t.note || "").slice(0, 160), goalId: "", ref: typeof t.ref === "string" ? t.ref.trim().slice(0, 40) : "", confidence: String(t.confidence || ""), questions: qs, src: "scan" };
    });
    items.forEach(it => { if (it.ref && state.entries.some(e => e.ref === it.ref)) it.include = false; });
    $("scanTitle").textContent = items.length ? "Check what I found" : "Nothing to add";
    status(esc((res && res.summary) || (items.length ? "" : "I couldn't find a transaction in that image. Try a clearer photo, or add it by hand.")), false);
    render();
  } catch (e) {
    if (scanAbort !== ctl) return;
    scanAbort = null;
    if (e && !e.code && e.message) e = { code: "http", message: e.message };
    const code = e && e.code;
    if (code === "cancelled") { closeScan(); return; }
    $("scanTitle").textContent = "Couldn't read that";
    const msg = {
      no_key: "Set up Gemini in Settings to use scanning.",
      bad_key: "Google didn't accept the Gemini key. Check it in Settings › Gemini.",
      offline: "Scanning needs an internet connection. You can add the entry by hand and it will sync later.",
      rate_limited: "Gemini's limit was reached for now. Wait a minute and try again, or add it by hand.",
      image_rejected: "That image couldn't be opened. Try a JPG or PNG photo or screenshot.",
      refused: "I couldn't read that image. Try a different photo, or add the entry by hand."
    }[code] || "Scanning didn't work this time. Try again, or add the entry by hand.";
    status(esc(msg) + (e && e.message ? '<br><small class="muted">Details for troubleshooting: ' + esc(String(e.message).slice(0, 240)) + "</small>" : ""), false);
    $("scanFoot").hidden = false; $("scanAdd").hidden = true;
  }
}

// entries prepared in the chat, opened here to check and change before adding
export function showProposals(list) {
  items = list.map(e => ({ include: true, type: e.type, typeKnown: true, amount: e.amount, date: e.date, currency: state.settings.currency || "MVR", currencyOk: true,
    category: e.category, note: e.note, goalId: e.goalId || "", split: e.split, ref: "", confidence: "high", questions: [], src: "chat" }));
  if (!items.length) return false;
  open(); $("scanTitle").textContent = "Check before adding";
  status("From your chat. Change anything that's not right, then add.", false);
  $("scanErr").hidden = true; render();
  return true;
}

function dupOf(it) {
  if (it.ref) { const same = state.entries.find(e => e.ref && e.ref === it.ref); if (same) return same; }
  if (!it.amount || !it.date) return null;
  // same day, amount and type, and not contradicted by a different bank reference
  return state.entries.find(e => e.date === it.date && Math.abs(+e.amount - it.amount) < 0.005 && e.type === it.type && e.person === meId() && !(e.ref && it.ref && e.ref !== it.ref)) || null;
}
function needs(it) {
  const miss = [];
  if (!(it.amount > 0)) miss.push("amount");
  if (!it.date || !ISO.test(it.date)) miss.push("date");
  if (it.currency && it.currency !== (state.settings.currency || "MVR") && !it.currencyOk) miss.push("amount");
  return miss;
}
function render() {
  const cur = state.settings.currency || "MVR";
  // category memory: if Gemini said "Other" but you've used something for this shop before
  items.forEach(it => { if ((!it.category || it.category === "Other") && it.note && !it.catOther) { const c = guessCategory(it.note, it.type); if (c) it.category = c; } });
  $("scanList").innerHTML = items.map((it, i) => {
    const miss = needs(it), goalMode = it.type === "save" || it.type === "withdraw", foreign = it.currency && it.currency !== cur && !it.currencyOk, dup = dupOf(it);
    const qs = it.questions.map((q, qi) => `<div class="q${q.picked !== null ? " done" : ""}"><span>${esc(q.question)}</span>${q.options.length ? `<div class="opts">${q.options.map((o, oi) => `<button type="button" data-i="${i}" data-q="${qi}" data-o="${oi}" aria-pressed="${q.picked === oi}">${esc(o.label)}</button>`).join("")}</div>` : ""}</div>`).join("");
    const opts = [...new Set(catOptions(it.type).concat(it.category && !it.catOther ? [it.category] : []))];
    return `<div class="scard${it.include ? "" : " off"}">
      <div class="scard-top"><label><input type="checkbox" data-i="${i}" data-k="include" ${it.include ? "checked" : ""}> Add this</label>${it.confidence === "low" || miss.length || it.questions.some(q => q.picked === null) ? '<span class="flag">Check this</span>' : ""}</div>
      ${qs}
      ${foreign ? `<div class="q"><span>The image shows ${esc(it.currency)} ${esc(String(it.amount ?? ""))}. Enter the amount in ${esc(cur)} below, then confirm.</span><div class="opts"><button type="button" data-i="${i}" data-k="currencyOk">Amount is in ${esc(cur)}</button></div></div>` : ""}
      <div class="row2">
        <div class="field${it.typeKnown ? "" : " need"}"><label for="st${i}">Type</label><select id="st${i}" data-i="${i}" data-k="type">${TYPES.map(([v, l]) => `<option value="${v}"${v === it.type ? " selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="field${miss.includes("amount") ? " need" : ""}"><label for="sa${i}">Amount (${esc(cur)})</label><input id="sa${i}" class="num" type="number" inputmode="decimal" min="0" step="0.01" data-i="${i}" data-k="amount" value="${it.amount ?? ""}"></div>
        <div class="field${miss.includes("date") ? " need" : ""}"><label for="sd${i}">Date</label><input id="sd${i}" type="date" data-i="${i}" data-k="date" value="${it.date || ""}"></div>
        ${goalMode
          ? `<div class="field"><label for="sg${i}">Goal</label><select id="sg${i}" data-i="${i}" data-k="goalId"><option value="">General savings</option>${visibleGoals(meId()).map(g => `<option value="${g.id}"${g.id === it.goalId ? " selected" : ""}>${esc(g.name)}</option>`).join("")}</select></div>`
          : `<div class="field"><label for="sc${i}">Category</label><select id="sc${i}" data-i="${i}" data-k="catsel">${opts.map(c => `<option value="${esc(c)}"${!it.catOther && c === it.category ? " selected" : ""}>${esc(c)}</option>`).join("")}<option value="__other"${it.catOther ? " selected" : ""}>Other (type your own)…</option></select>${it.catOther ? `<input id="sco${i}" data-i="${i}" data-k="category" value="${esc(it.category)}" placeholder="Type a category" aria-label="Your own category" class="mt6">` : ""}</div>`}
      </div>
      <div class="field"><label for="sn${i}">Note</label><input id="sn${i}" maxlength="160" data-i="${i}" data-k="note" value="${esc(it.note)}"></div>
      ${dup ? (it.ref && dup.ref === it.ref ? `<div class="dup">This transfer (${esc(it.ref)}) is already in Pocket Ledger, so it's unticked.</div>` : `<div class="dup">You already have ${esc(money(+dup.amount))} on this date${dup.note ? " (" + esc(dup.note) + ")" : ""}. Untick this if it's the same one.</div>`) : ""}
    </div>`;
  }).join("");
  const n = items.filter(x => x.include).length;
  $("scanFoot").hidden = false; $("scanAdd").hidden = !items.length;
  $("scanAdd").textContent = n === 1 ? "Add 1 entry" : "Add " + n + " entries";
  $("scanAdd").disabled = !n;
}
function applyAnswer(it, field, value) {
  if (field === "amount") { const v = num(value); if (v > 0) { it.amount = v; it.currencyOk = true; } }
  else if (field === "date") { if (ISO.test(value)) it.date = value; }
  else if (field === "type") { if (TYPES.some(t => t[0] === value)) { it.type = value; it.typeKnown = true; } }
  else if (field === "category") it.category = value;
  else if (field === "note") it.note = value.slice(0, 160);
}

export function initScan() {
  $("scanFile").addEventListener("change", ev => {
    const files = Array.from(ev.target.files || []); ev.target.value = "";
    handleFiles(files);
  });
  document.addEventListener("click", ev => { if (ev.target.closest("[data-scan]")) openScanPicker(); });
  $("scanMore").addEventListener("click", openScanPicker);
  $("scanClose").addEventListener("click", closeScan);
  $("scanWrap").addEventListener("click", ev => { if (ev.target === $("scanWrap")) closeScan(); });
  $("scanList").addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    const it = items[+b.dataset.i]; if (!it) return;
    if (b.dataset.k === "currencyOk") { it.currencyOk = true; render(); return; }
    const q = it.questions[+b.dataset.q]; if (!q) return;
    q.picked = +b.dataset.o; applyAnswer(it, q.field, q.options[q.picked].value);
    render();
  });
  $("scanList").addEventListener("input", ev => {
    const el = ev.target, it = items[+el.dataset.i], k = el.dataset.k; if (!it || !k) return;
    if (k === "amount") { it.amount = num(el.value) > 0 ? num(el.value) : null; it.currencyOk = true; }
    else if (k === "include") it.include = el.checked;
    else if (k === "catsel") { if (el.value === "__other") { it.catOther = true; it.category = ""; render(); const o = $("sco" + el.dataset.i); if (o) o.focus(); } else { it.catOther = false; it.category = el.value; } return; }
    else it[k] = el.value;
    if (k === "type") it.typeKnown = true;
    if (k === "include" || k === "type") render();
  });
  $("scanList").addEventListener("change", ev => { const k = ev.target.dataset.k; if (k === "amount" || k === "date") render(); });
  $("scanAdd").addEventListener("click", () => {
    const chosen = items.filter(x => x.include), bad = chosen.filter(x => needs(x).length);
    if (bad.length) { $("scanErr").textContent = "Fill in the highlighted amount or date on " + (bad.length === 1 ? "1 entry" : bad.length + " entries") + " first."; $("scanErr").hidden = false; render(); return; }
    $("scanErr").hidden = true;
    chosen.forEach((it, i) => {
      const e = { type: it.type, amount: it.amount, date: it.date, note: (it.note || "").trim(), created: Date.now() + i, person: meId(), source: it.src || "scan" };
      if (it.ref) e.ref = it.ref;
      if (it.type === "save" || it.type === "withdraw") { e.goalId = it.goalId || ""; e.category = "Savings"; }
      else e.category = (it.category || "").trim() || (it.type === "income" ? "Salary" : "Other");
      if (it.type === "expense" && e.category === EAT) { const m = it.meal || mealFromNote(e.note); if (m) e.meal = m; }
      if (it.split && it.type === "expense") e.split = it.split;
      db.add(e); budgetCheck(e);
    });
    toast(chosen.length === 1 ? "Added 1 entry" : "Added " + chosen.length + " entries");
    const m = chosen[0].date.slice(0, 7);
    closeScan();
    if (m !== ui.month) { ui.month = m; changed(); }
  });
}

// ======================================================================
// Bank statements (PDF or CSV). Every transaction is added straight away
// as Spent or Income. Rows already in Pocket Ledger and moves between
// your own accounts are skipped. One tap undoes the whole import.
// ======================================================================
export const isStatementFile = f => /pdf|csv|comma-separated/i.test(f.type || "") || /\.(pdf|csv)$/i.test(f.name || "");
export function handleFiles(files) {
  files = Array.from(files || []);
  const st = files.find(isStatementFile);
  if (st) return importStatement(st);
  if (files.length > 4) toast("Reading the first 4 images");
  if (files.length) startScan(files.slice(0, 4));
}
function statementBlocked() {
  if (state.readOnly) return "You can't add entries here.";
  if (isGroup()) return "Statements go into your own space. Switch to Me first, then import.";
  return "";
}
export function openStatementPicker() {
  const why = statementBlocked(); if (why) return toast(why);
  $("stmtFile").click();
}

// ---------- reading the file ----------
function csvRows(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); if (row.some(v => v.trim())) rows.push(row); row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); if (row.some(v => v.trim())) rows.push(row); }
  return rows.map(r => r.map(v => v.trim().replace(/^="(.*)"$/, "$1").trim()));
}
// "DD-MM-YYYY HH-MM-SS" (or with colons): the hour, else null (6-digit card codes are not times)
const hourOf = v => { const m = String(v || "").match(/^\d{2}-\d{2}-\d{4}\s+(\d{2})[-:]\d{2}[-:]\d{2}/); return m && +m[1] < 24 ? +m[1] : null; };
const dmy = v => { const m = String(v || "").match(/^(\d{2})-(\d{2})-(\d{4})/); return m ? m[3] + "-" + m[2] + "-" + m[1] : ""; };
const money2 = v => num(String(v || "").replace(/,/g, ""));
// Bank of Maldives CSV export: read exactly, no Gemini needed
function bmlRows(rows) {
  const out = [];
  for (const r of rows) {
    if (r.length < 11 || !/^\d{4}\/\d{2}\/\d{2}$/.test(r[0])) continue;
    const debit = money2(r[8]), credit = money2(r[9]);
    if (!(debit > 0) && !(credit > 0)) continue;
    const favara = /favara|ips/i.test(r[2]);
    out.push({ date: dmy(r[5]) || dmy(r[7]) || r[0].replace(/\//g, "-"), dir: debit > 0 ? "out" : "in", amount: debit > 0 ? debit : credit,
      name: favara ? r[5] : r[6], ref: r[3], kind: /purchase|pos/i.test(r[2]) ? "purchase" : /transfer|favara|ips/i.test(r[2]) ? "transfer" : "other",
      label: r[2], hour: hourOf(r[5]), acct: (r.join(" ").match(/\b\d{8,}\b/g) || []).join(" "), bal: r[10] !== undefined && r[10] !== "" ? money2(r[10]) : null });
  }
  return out;
}
// Maldives Islamic Bank (MIB) CSV export: POSTED DATE, VALUE DATE, TRANSACTION TYPE, REFERENCE, DESCRIPTION, AMOUNT (signed), RUNNING BALANCE
// DESCRIPTION is "DD-MM-YYYY HH-MM-SS | other side | remark"; for Favara the other side is "BANK - NAME, remark" in the 3rd part.
export function isMibCsv(rows) { const h = (rows[0] || []).map(x => x.toUpperCase()); return h.includes("POSTED DATE") && h.includes("RUNNING BALANCE") && h.includes("AMOUNT"); }
export function mibRows(rows) {
  const h = rows[0].map(x => x.toUpperCase()), at = n => h.indexOf(n), out = [];
  const iP = at("POSTED DATE"), iT = at("TRANSACTION TYPE"), iR = at("REFERENCE"), iD = at("DESCRIPTION"), iA = at("AMOUNT"), iB = at("RUNNING BALANCE");
  for (const r of rows.slice(1)) {
    const type = String(r[iT] || "").trim(), amt = money2(r[iA]), posted = String(r[iP] || "").slice(0, 10);
    if (!(Math.abs(amt) > 0) || !ISO.test(posted) || /b\/f balance|c\/f balance|opening|closing/i.test(type)) continue;
    const parts = String(r[iD] || "").split("|").map(x => x.trim());
    // the time stamp in the description is when it happened; keep it unless it's far from the posting (bank batch jobs)
    let date = posted; const dd = dmy(parts[0]);
    if (dd && Math.abs(daysBetween(posted, dd)) <= 3) date = dd;
    let name = "", kind = "other", ref = String(r[iR] || "").trim(), bank = "";
    if (/favara|ips/i.test(type)) {
      kind = "transfer";
      const m = (parts[2] || "").match(/^([A-Z]{2,5})\s*-\s*([^,]+)/i);
      if (m) { bank = m[1].toUpperCase(); name = m[2].trim(); }
      if (/^MA[DL][A-Z]*IPS\w+/i.test(parts[1] || "")) ref = ref || parts[1].split(/\s+/)[0];
    } else if (/transfer/i.test(type)) { kind = "transfer"; name = parts[1] || ""; }
    else if (/pos|purchase|card payment|ecom/i.test(type)) { kind = "purchase"; name = (parts[1] || "").replace(/^[-\s]+/, "").replace(/@\w+$/, "").trim(); if (!/[a-z]{3}/i.test(name)) name = "Card payment"; }
    else if (/fee|charge|commission/i.test(type)) { kind = "fee"; name = type; }
    else if (/profit/i.test(type)) { name = "MIB profit"; }
    else { name = (parts[1] && /[a-z]{3}/i.test(parts[1]) ? parts[1] : type).replace(/\s+/g, " "); kind = /pay/i.test(type) ? "bill" : "other"; }
    const remark = kind === "transfer" && !/favara|ips/i.test(type) ? (parts[2] || "") : "";
    out.push({ date, dir: amt < 0 ? "out" : "in", amount: Math.abs(amt), name: name.replace(/\s+/g, " ").trim(), ref, kind, label: type.replace(/\d{6,}/g, "").trim(),
      remark: remark && remark !== "-" ? remark : "", otherBank: bank, hour: hourOf(parts[0]), acct: (String(r[iD] || "").match(/\b\d{10,}\b/g) || []).join(" "), bal: iB >= 0 && r[iB] !== "" ? money2(r[iB]) : null, posted });
  }
  return out;
}
function statementPrompt(kind) {
  return [
    "You are reading a bank statement (" + kind + ") from the Maldives for a personal money tracker. List EVERY transaction. Reply with JSON only.",
    "",
    "Reply with exactly: {\"bank\": \"BML\" | \"MIB\" | \"other bank name\", \"holder\": \"account holder name or null\", \"account_last4\": \"last 4 digits of this statement's account or null\", \"closing_balance\": number or null, \"closing_date\": \"YYYY-MM-DD or null\", \"rows\": [[date, direction, amount, other_party, reference, kind, other_account]]}",
    "- closing_balance: the account balance at the end of the statement (closing / C/F balance, or the last running balance), as a number. closing_date: the date of that balance.",
    "- date: the transaction date as YYYY-MM-DD. If the details contain a date written DD-MM-YYYY (day first), use that; otherwise the posting date. 03-09-2026 is 3 September 2026.",
    "- direction: \"out\" for a debit (money leaving the account), \"in\" for a credit.",
    "- amount: positive number, no commas.",
    "- other_party: the shop or person on the other side, as written (for card purchases the merchant name; for transfers the person or company; for Favara/IPS the name shown).",
    "- reference: the transaction reference like BLAZ123..., RB24..., or the MADVIPS/MALBIPS code, or \"\".",
    "- kind: \"purchase\" (card), \"transfer\", \"fee\" (bank charges) or \"other\".",
    "- other_account: the other side's ACCOUNT NUMBER (a long digit string, usually 13 to 17 digits) if one is printed, else \"\". Never put an amount, reference, date, time, phone or card number here.",
    "Skip only opening/closing balance lines (B/F, C/F), page headers and totals. Keep the statement's order. Don't invent or merge rows: two transactions with the same amount on the same day are two rows; list both.",
    "Before replying, check yourself: the number of rows equals the number of transactions in the statement, and the money in minus money out matches the change in balance when balances are shown."
  ].join("\n");
}
async function aiRows(file) {
  if (!aiReady()) throw { code: "no_key" };
  if (/pdf/i.test(file.type || "") || /\.pdf$/i.test(file.name || "")) {
    const res = await geminiJson(statementPrompt("PDF"), [file]);
    return { rows: normAi(res.rows), bank: res.bank, holder: res.holder, last4: res.account_last4, closing: typeof res.closing_balance === "number" ? res.closing_balance : null, closingDate: ISO.test(String(res.closing_date || "")) ? res.closing_date : null };
  }
  // another bank's CSV: send the text in pieces
  const lines = (await file.text()).split(/\r?\n/).filter(l => l.trim());
  const head = lines.slice(0, 3).join("\n"), out = { rows: [] };
  for (let i = 0; i < lines.length; i += 120) {
    const part = i ? head + "\n" + lines.slice(i, i + 120).join("\n") : lines.slice(0, 120).join("\n");
    const res = await geminiJson(statementPrompt("CSV text below" + (i ? ", continued: the first lines repeat the header, don't list those twice" : "")) + "\n\n" + part, []);
    out.rows = out.rows.concat(normAi(res.rows)); out.bank = out.bank || res.bank; out.holder = out.holder || res.holder; out.last4 = out.last4 || res.account_last4;
  }
  return out;
}
const normAi = rows => (Array.isArray(rows) ? rows : []).map(r => Array.isArray(r) ? { date: String(r[0] || ""), dir: r[1] === "in" ? "in" : "out", amount: money2(r[2]), name: String(r[3] || ""), ref: String(r[4] || ""), kind: String(r[5] || "other"), acct: String(r[6] || "") } : null)
  .filter(r => r && ISO.test(r.date) && r.amount > 0);

// ---------- deciding what to add ----------
const toks = s => String(s || "").toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter(Boolean);
const skel = t => t.replace(/[AEIOU]/g, "");
const tokMatch = (t, u) => t === u || (u.length === 1 && t[0] === u) || (t.length === 1 && u[0] === t) || (t.length >= 3 && u.length >= 3 && (t.startsWith(u) || u.startsWith(t))) || (t.length >= 4 && u.length >= 3 && skel(t).length >= 2 && skel(t) === skel(u));
export function nameMatches(own, other) {
  const a = toks(own), b = toks(other);
  return a.length >= 2 && a.every(t => b.some(u => tokMatch(t, u)));
}
function ownInfo(extra) {
  const me = myDetails(), names = [], last4 = new Set();
  String(me.bank || "").split(",").map(x => x.trim()).filter(Boolean).forEach(n => names.push(n));
  if (toks(me.name).length >= 2) names.push(me.name);
  if (extra && extra.holder) names.push(extra.holder);
  String(me.acct || "").split(/[,\s]+/).forEach(d => { if (/^\d{4}$/.test(d)) last4.add(d); });
  (me.accounts || []).forEach(a => { if (/^\d{4}$/.test(a.last4 || "")) last4.add(a.last4); });
  if (extra && /^\d{4}$/.test(String(extra.last4 || ""))) last4.add(String(extra.last4));
  return { names, last4, accounts: me.accounts || [] };
}
function myDetails() { return state.my || people().find(p => p.id === meId()) || {}; }
const titleCase = s => String(s || "").toLowerCase().replace(/(^|[\s\-\/&(])([a-z])/g, (m, a, c) => a + c.toUpperCase()).replace(/\b(Pvt|Ltd|Llc|Mv|Mib|Bml|Atm|Ips)\b/g, w => w.toUpperCase()).trim();
const FALLBACK = [[/stop 2 shop|mart|super ?market|grocer|fish|fruit/i, "Food & groceries"], [/food|cafe|café|bistro|restaurant|bakery|pizza|burger|kitchen|hotaa|hotel|tea ?shop|canteen/i, "Eating out"],
  [/mwsc|stelco|fenaka|water|electric|council/i, "Rent & bills"], [/ooredoo|dhiraagu|internet|fahipay/i, "Phone & internet"], [/pharmacy|chemist|hospital|clinic|medical/i, "Health"],
  [/netflix|spotify|google|microsoft|apple|steam|playstation|clash/i, "Entertainment"], [/fuel|petrol|taxi|ferry|transport/i, "Transport"]];
async function categorize(rows) {
  const want = {};
  rows.forEach(r => {
    const type = r.dir === "out" ? "expense" : "income";
    r.category = guessCategory(r.note, type);
    if (!r.category) (want[type] = want[type] || new Set()).add(r.name);
  });
  let ai = {};
  if (aiReady() && (want.expense || want.income)) {
    try {
      ai = await geminiJson([
        "These names come from a Maldivian bank statement. Pick the best category for each, for a personal money tracker. Reply with JSON only: {\"expense\": {\"NAME\": \"Category\"}, \"income\": {\"NAME\": \"Category\"}}.",
        "Expense categories: " + EXP_CATS.filter(c => !/loan/i.test(c)).join(", ") + ".",
        "Income categories: " + INC_CATS.filter(c => !/loan/i.test(c)).join(", ") + ".",
        "Shops and companies: by what they sell (supermarkets and grocery shops -> Food & groceries; cafes and restaurants -> Eating out; utilities, water, electricity, council fees -> Rent & bills; phone, internet, top-ups, bill-payment apps -> Phone & internet; streaming, games, apps, software subscriptions -> Entertainment).",
        "Money sent to a private person -> Other. Money received from a private person -> Side income. Use exactly the category names above.",
        "Money out to: " + JSON.stringify([...(want.expense || [])]),
        "Money in from: " + JSON.stringify([...(want.income || [])])
      ].join("\n"), []);
    } catch (e) { ai = {}; }
  }
  // shops Gemini didn't know: let it look them up online (what kind of place is it?)
  const unknown = [...new Set(rows.filter(r => !r.category && r.dir === "out" && r.kind === "purchase" && !EXP_CATS.includes(((ai && ai.expense) || {})[r.name]) ).map(r => r.name))].slice(0, 15);
  if (aiReady() && unknown.length) {
    try {
      const found = parseJsonText(await geminiText([
        "Look up these shop or company names from a bank statement in the Maldives (search the web if you're not sure what they sell), and pick the best category for each.",
        "Categories: " + EXP_CATS.filter(c => !/loan/i.test(c)).join(", ") + ". Use exactly these names; use Other only if you really can't tell.",
        "Reply with JSON only, no other text: {\"NAME\": \"Category\"}.",
        "Names: " + JSON.stringify(unknown)
      ].join("\n"), [], { search: true, temperature: 0.1 }));
      if (found && typeof found === "object") { ai.expense = Object.assign({}, ai.expense || {}); unknown.forEach(n => { if (EXP_CATS.includes(found[n])) ai.expense[n] = found[n]; }); }
    } catch (e) {}
  }
  rows.forEach(r => {
    if (r.category) return;
    const type = r.dir === "out" ? "expense" : "income", pick = ((ai && ai[type]) || {})[r.name];
    const ok = (type === "expense" ? EXP_CATS : INC_CATS).includes(pick);
    r.category = ok ? pick : type === "income" ? "Side income" : ((FALLBACK.find(([re]) => re.test(r.name)) || [])[1] || "Other");
  });
}

let lastImport = null;
async function importStatement(file) {
  const why = statementBlocked(); if (why) return toast(why);
  if (scanAbort) scanAbort.abort();
  items = []; open();
  $("scanTitle").textContent = "Reading your statement…";
  $("scanList").innerHTML = ""; $("scanFoot").hidden = true; $("scanErr").hidden = true;
  status("Going through every transaction. A long statement takes up to a minute.", true);
  try {
    if (!navigator.onLine) throw { code: "offline" };
    let rows = [], extra = {};
    if (!/pdf/i.test(file.type || "") && !/\.pdf$/i.test(file.name || "")) {
      const grid = csvRows(await file.text());
      if (isMibCsv(grid)) { rows = mibRows(grid); extra.bank = "MIB"; }
      else { rows = bmlRows(grid); if (rows.length) extra.bank = "BML"; }
    }
    // MIB names the file after the account number: that account is yours
    const fileAcct = String(file.name || "").match(/^(\d{10,})/);
    if (fileAcct) extra.last4 = fileAcct[1].slice(-4);
    if (!rows.length) { const r = await aiRows(file); rows = r.rows; extra = Object.assign(r, extra.last4 && !r.last4 ? { last4: extra.last4 } : {}); }
    if (!rows.length) throw { code: "empty" };
    const own = ownInfo(extra);
    if (!own.names.length && !own.last4.size && !importAnyway) return askForDetails(file);
    const ownAcct = r => (String(r.acct || "").split(/\s+/).find(d => d.length >= 8 && own.last4.has(d.slice(-4))) || "").slice(-4);
    const isOwn = r => !!ownAcct(r) || own.names.some(n => nameMatches(n, r.name));
    const used = new Set(), seenRefs = new Set(), mine = state.entries.filter(e => e.person === meId() || !e.person);
    // "Already in Pocket Ledger" is decided by cross-checking several things, so genuinely repeated
    // payments (the same 645 every month, two 30s to the same person on one day) are never skipped:
    //  1. the bank reference is the same → the same transaction
    //  2. a different bank reference on both → a different transaction, whatever the amount
    //  3. otherwise: same type AND same amount AND within 2 days, and each existing entry can only match one row;
    //     the best match is the one whose note names the same person/shop, then the same day, then the closest day.
    //     Entries that came from another statement only match by reference (their references are exact).
    const words = s => new Set(toks(s).filter(w => w.length >= 3 && !/^(FROM|TRANSFER|PAID|BACK|LOAN|THE|AND)$/.test(w)));
    const dupOfRow = r => {
      const type = r.dir === "out" ? "expense" : "income";
      if (r.ref) { const e = mine.find(x => (x.ref && x.ref === r.ref) || (x.refs || []).includes(r.ref)); if (e) return { e, sure: true }; }
      const rw = words(r.name);
      const cands = mine.filter(x => !used.has(x.id) && x.type === type && Math.abs(+x.amount - r.amount) < 0.005 && x.date && Math.abs(daysBetween(x.date, r.date)) <= 2
        && !(x.ref && r.ref && x.ref !== r.ref) && !(x.source === "statement" && x.ref));
      if (!cands.length) return null;
      const score = x => { const xw = words(x.note); let n = 0; rw.forEach(w => { if ([...xw].some(v => tokMatch(w, v))) n++; }); return n * 10 + (x.date === r.date ? 3 : 0) - Math.abs(daysBetween(x.date, r.date)); };
      const e = cands.sort((a, b) => score(b) - score(a))[0];
      used.add(e.id);
      return { e, sure: false };
    };
    // Moves between your own accounts are kept as "Moved" entries that don't count as income or spending.
    // The same move shows on both statements (out of one account, into the other), so it's stored once:
    // a row joins an earlier move with the same amount within 2 days that hasn't got this side yet.
    const acctName = d4 => { const a = own.accounts.find(x => x.last4 === d4); return a ? (a.name || a.bank || "") + (a.name && a.bank ? " (" + a.bank + ")" : "") || d4 : ""; };
    const here = acctName(extra.last4) || extra.bank || "This account";
    const legOf = r => (extra.last4 || extra.bank || "acct") + ":" + r.dir;
    const moveOf = r => {
      if (r.ref) { const e = mine.find(x => (x.ref && x.ref === r.ref) || (x.refs || []).includes(r.ref)); if (e) return { dup: e }; }
      const leg = legOf(r), side = leg.split(":")[0];
      const e = mine.find(x => x.moved && !used.has(x.id) && Math.abs(+x.amount - r.amount) < 0.005 && x.date && Math.abs(daysBetween(x.date, r.date)) <= 2
        && !(x.legs || []).includes(leg) && (x.legs || []).every(l => l.split(":")[0] !== side && l.split(":")[1] !== r.dir));
      if (e) { used.add(e.id); return { join: e, leg }; }
      return { leg };
    };
    const otherSide = r => acctName(ownAcct(r)) || r.otherBank || "Other account";
    const res = { add: [], dup: [], own: [], joined: [], maybe: [] };
    rows.forEach(r => {
      if (r.ref && seenRefs.has(r.ref)) return res.dup.push(r); // the same line twice in one file
      if (r.ref) seenRefs.add(r.ref);
      if (isOwn(r)) {
        const m = moveOf(r);
        if (m.dup) return res.dup.push(r);
        r.leg = m.leg; r.from = r.dir === "out" ? here : otherSide(r); r.to = r.dir === "out" ? otherSide(r) : here;
        if (m.join) { r.join = m.join; return res.joined.push(r); }
        return res.own.push(r);
      }
      // only the same bank reference is certainly the same transaction; anything that just looks alike
      // (same amount, close date) is added and listed as a possible repeat for you to keep or remove
      const d = dupOfRow(r);
      if (d && d.sure) return res.dup.push(r);
      if (d) { r.maybeDup = d.e; res.maybe.push(r); }
      const nm = titleCase(r.name) || titleCase(r.label) || "Bank";
      r.note = ((r.kind === "purchase" || r.kind === "bill" || r.kind === "fee" || r.name === "MIB profit") ? nm : r.dir === "out" ? "Transfer to " + nm : "From " + nm) + (r.remark ? ": " + r.remark : "");
      r.note = r.note.slice(0, 160);
      res.add.push(r);
    });
    status("Sorting " + res.add.length + " transactions into categories…", true);
    await categorize(res.add);
    const months = [...new Set(rows.map(r => r.date.slice(0, 7)))].sort();
    const importId = "imp" + Date.now().toString(36);
    const cnt = {}; rows.forEach(r => { const k = r.date.slice(0, 7); cnt[k] = (cnt[k] || 0) + 1; });
    const main = months.filter(k => cnt[k] >= Math.max(3, rows.length * 0.15));
    const label = (extra.bank || "Bank") + " statement · " + (main.length ? main : months).map(k => monthName(k, true)).join(", ");
    const mealOf = r => r.dir === "out" && r.category === EAT ? (mealFromNote(r.note) || (r.hour != null ? mealAt(r.hour) : "")) : "";
    const entries = res.add.map((r, i) => Object.assign({ type: r.dir === "out" ? "expense" : "income", amount: r2(r.amount), date: r.date, category: r.category, note: r.note,
      person: meId(), created: Date.now() + i, source: "statement", importId, importLabel: label }, r.ref ? { ref: r.ref.slice(0, 40) } : {}, r.maybeDup ? { maybeDup: r.maybeDup.id } : {}, mealOf(r) ? { meal: mealOf(r) } : {}));
    const moves = res.own.map((r, i) => Object.assign({ type: "move", moved: true, amount: r2(r.amount), date: r.date, category: "Moved", note: (r.from + " → " + r.to).slice(0, 160),
      acctFrom: r.from, acctTo: r.to, legs: [r.leg], person: meId(), created: Date.now() + entries.length + i, source: "statement", importId, importLabel: label }, r.ref ? { ref: r.ref.slice(0, 40), refs: [r.ref.slice(0, 40)] } : { refs: [] }));
    // the other side of a move already saved from another statement: fill in this side, don't add it again
    res.joined.forEach(r => {
      const e = r.join, known = x => x && !/^(Other account|This account)$/.test(x);
      const upd = Object.assign({}, e, { legs: (e.legs || []).concat(r.leg), refs: (e.refs || (e.ref ? [e.ref] : [])).concat(r.ref ? [r.ref.slice(0, 40)] : []).slice(0, 6),
        acctFrom: known(e.acctFrom) ? e.acctFrom : r.from, acctTo: known(e.acctTo) ? e.acctTo : r.to });
      if (e.type === "move") upd.note = (upd.acctFrom + " → " + upd.acctTo).slice(0, 160);
      db.update(e.id, upd);
    });
    const all = entries.concat(moves);
    status("Adding " + all.length + " entries…", true);
    const ids = all.length ? await db.addMany(all) : [];
    res.add.forEach((r, i) => { r.id = ids[i]; });
    lastImport = { ids, importId, label, months, res };
    saveBalance(rows, extra, here);
    renderImport();
  } catch (e) {
    importAnyway = false;
    if (e && !e.code && e.message) e = { code: "http", message: e.message };
    const code = e && e.code;
    $("scanTitle").textContent = "Couldn't import that";
    const msg = {
      no_key: "Reading this statement needs Gemini. Set it up in Settings › Gemini, or use your bank's CSV export.",
      offline: "Importing a statement needs an internet connection.",
      empty: "I couldn't find any transactions in that file. Check it's a statement from your bank's app or website.",
      too_big: "That file is too big. Download a shorter period (one month) and try again.",
      rate_limited: "Gemini's limit was reached for now. Try again in a minute, or use the CSV export."
    }[code] || "Importing didn't work this time. Try again.";
    status(esc(msg) + (e && e.message && code === "http" ? '<br><small class="muted">Details: ' + esc(String(e.message).slice(0, 200)) + "</small>" : ""), false);
    $("scanFoot").hidden = false; $("scanAdd").hidden = true;
  }
}
// the account's latest balance, shown on Home under Your accounts (kept in your own space)
function saveBalance(rows, extra, name) {
  let bal = null, asOf = null;
  if (typeof extra.closing === "number") { bal = extra.closing; asOf = extra.closingDate || rows.map(r => r.date).sort().pop(); }
  else {
    const withBal = rows.filter(r => typeof r.bal === "number" && !isNaN(r.bal)); if (!withBal.length) return;
    // statements list oldest-first or newest-first: the end the latest date is on holds the closing balance
    const first = withBal[0], last = withBal[withBal.length - 1], d = r => r.posted || r.date;
    const end = d(first) > d(last) ? first : last; bal = end.bal; asOf = withBal.map(r => r.date).sort().pop();
  }
  if (typeof bal !== "number" || isNaN(bal)) return;
  const key = String(extra.last4 || extra.bank || "account").replace(/[^A-Za-z0-9]/g, "") || "account";
  const cur = (state.settings.balances || {})[key];
  if (cur && cur.asOf && asOf && cur.asOf > asOf) return;           // an older statement doesn't replace a newer balance
  db.saveSettings({ balances: Object.assign({}, state.settings.balances || {}, { [key]: { name: name === "This account" ? (extra.bank || "Account") : name, bank: extra.bank || "", bal: r2(bal), asOf } }) });
}
let importAnyway = false, pendingFile = null;
function askForDetails(file) {
  pendingFile = file;
  $("scanTitle").textContent = "One thing first";
  status("To skip moves between your own accounts, I need the name on your bank account or your account numbers (last 4 digits). Add them in Settings › Your details, then import again.", false);
  $("scanList").innerHTML = `<div class="row-btns"><button class="primary" type="button" data-imp="details">Open Settings</button><button class="ghost" type="button" data-imp="anyway">Import anyway</button></div>`;
}
function renderImport() {
  const L = lastImport, r = L.res, sumOf = (a, d) => r2(sum(a.filter(x => x.dir === d), x => x.amount));
  const outN = r.add.filter(x => x.dir === "out").length, inN = r.add.length - outN;
  $("scanTitle").textContent = r.add.length || r.own.length ? "Statement imported" : "Nothing new to add";
  status(esc(L.label), false);
  const list = (a, title) => a.length ? `<details class="box imp-list"><summary>${esc(title)}</summary><ul>${a.map(x => `<li><span>${esc(fmtDate(x.date))} · ${esc(titleCase(x.name) || x.label || "")}</span><b class="num">${x.dir === "out" ? "−" : "+"}${esc(money(x.amount))}</b></li>`).join("")}</ul></details>` : "";
  const byCat = {}; r.add.filter(x => x.dir === "out").forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });
  $("scanList").innerHTML = `<div class="imp">
    <div class="imp-stats"><div><span class="label">Spent</span><b class="num">${esc(money(sumOf(r.add, "out")))}</b><small>${outN} entr${outN === 1 ? "y" : "ies"} added</small></div>
      <div><span class="label">Income</span><b class="num">${esc(money(sumOf(r.add, "in")))}</b><small>${inN} entr${inN === 1 ? "y" : "ies"} added</small></div></div>
    ${Object.keys(byCat).length ? `<p class="hint">${Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c, v]) => esc(c) + " " + esc(money(v, { whole: true }))).join(", ")}</p>` : ""}
    <p class="hint">${[r.dup.length ? "Skipped " + r.dup.length + " already in Pocket Ledger (same bank reference)." : "", r.own.length + r.joined.length ? (r.own.length + r.joined.length) + " moved between your own accounts, kept as Moved (not counted)" + (r.joined.length ? ", " + r.joined.length + " matched to the other statement" : "") + "." : ""].filter(Boolean).join(" ") || "Nothing skipped."}</p>
    ${r.maybe.length ? `<div class="box imp-maybe"><b>Possible repeats (${r.maybe.length})</b><p class="hint">These look like something already in Pocket Ledger (same amount, a day or two apart). They're added; remove any that really are the same.</p><ul>${r.maybe.map(x => `<li data-mid="${esc(x.id || "")}"><span>${esc(fmtDate(x.date))} · ${esc(titleCase(x.name) || x.label || "")} <b class="num">${esc(money(x.amount))}</b><small class="hint">like “${esc(x.maybeDup.note || x.maybeDup.category || "")}”, ${esc(fmtDate(x.maybeDup.date))}</small></span><span class="row-btns"><button class="ghost" type="button" data-imp="keep" data-id="${esc(x.id || "")}">Keep</button><button class="ghost danger" type="button" data-imp="drop" data-id="${esc(x.id || "")}">Remove</button></span></li>`).join("")}</ul></div>` : ""}
    ${list(r.add, "Added (" + r.add.length + ")")}${list(r.dup, "Already in Pocket Ledger (" + r.dup.length + ")")}${list(r.own.concat(r.joined), "Moved between your accounts (" + (r.own.length + r.joined.length) + ")")}
    <div class="row-btns">${L.ids.length ? `<button class="primary" type="button" data-imp="see">See entries</button><button class="ghost" type="button" data-imp="undo">Undo this import</button>` : `<button class="primary" type="button" data-imp="close">Close</button>`}</div>
  </div>`;
  $("scanFoot").hidden = true;
}
export async function undoImport(importId, ids) {
  ids = ids && ids.length ? ids : state.entries.filter(e => e.importId === importId).map(e => e.id);
  try { await db.removeMany(ids); toast("Import undone: " + ids.length + " entries removed"); return true; }
  catch { toast("Couldn't undo. Check your connection and try again."); return false; }
}
async function onImportClick(b) {
  const what = b.dataset.imp;
  if (what === "see") { const k = lastImport.months[lastImport.months.length - 1]; closeScan(); ui.month = k; go("entries"); changed(); }
  else if (what === "close") closeScan();
  else if (what === "keep" || what === "drop") {
    const id = b.dataset.id, li = b.closest("li");
    if (what === "keep") db.patchMany([id], { maybeDup: "" });
    else {
      // it was the same payment: the one already there learns this bank reference, so importing again skips it
      const e = state.entries.find(x => x.id === id), t = e && state.entries.find(x => x.id === e.maybeDup);
      if (e && t && e.ref && !(t.refs || []).includes(e.ref)) db.patchMany([t.id], { refs: (t.refs || []).concat(e.ref).slice(-10) });
      db.removeMany([id]);
    }
    if (li) { li.querySelector(".row-btns").innerHTML = `<small class="hint">${what === "keep" ? "Kept" : "Removed"}</small>`; }
  }
  else if (what === "undo") {
    if (!b.dataset.sure) { b.dataset.sure = "1"; b.textContent = "Tap again to remove " + lastImport.ids.length + " entries"; return; }
    b.disabled = true;
    if (await undoImport(lastImport.importId, lastImport.ids)) closeScan(); else b.disabled = false;
  } else if (what === "details") { closeScan(); go("settings", "you"); }
  else if (what === "anyway") { importAnyway = true; const f = pendingFile; pendingFile = null; await importStatement(f); importAnyway = false; }
}
export function initStatements() {
  $("stmtFile").addEventListener("change", ev => { const f = (ev.target.files || [])[0]; ev.target.value = ""; if (f) importStatement(f); });
  document.addEventListener("click", ev => { if (ev.target.closest("[data-statement]")) openStatementPicker(); });
  $("scanList").addEventListener("click", ev => { const b = ev.target.closest("button[data-imp]"); if (b) { ev.stopPropagation(); onImportClick(b); } }, true);
}
