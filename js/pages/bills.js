// Bills & reminders: monthly things that remind you (green → amber → red) and are
// only added when you tap Paid.
import { $, esc, money, num, monthKey, monthName, dateIn, toast, saveFile, fillSelect } from "../util.js";
import { state, ui, db, isAll, pname, canEdit, openBills, billStatus, billDone, remindDays, dueText, EXP_CATS, INC_CATS, meId } from "../store.js";
import { payBill, skipBill, createRecurring, removeWithUndo } from "../actions.js";

ui.payFor = null;

// ---------- the "due" cards (Home shows the first few) ----------
export function renderDue(el, limit) {
  const bills = state.ready ? openBills(ui.view) : [];
  if (!bills.length) { el.hidden = true; el.innerHTML = ""; return 0; }
  el.hidden = false;
  const prev = el.querySelector("[data-billamt]"), keep = prev ? prev.value : null;
  const shown = limit ? bills.slice(0, limit) : bills;
  el.innerHTML = shown.map(b => {
    const key = b.r.id + "|" + b.k, paying = ui.payFor === key, mine = canEdit(b.r);
    return `<div class="bill ${b.level}"><div class="bill-main"><b>${esc(b.r.note || b.r.category)}</b><span>${esc(money(+b.r.amount, { whole: true }))}, ${dueText(b)}${isAll() ? ", " + esc(pname(b.r.person)) : ""}</span></div>
      ${!mine ? "" : paying ? `<span class="row-btns"><input class="bill-amt" data-billamt="1" type="number" inputmode="decimal" value="${+b.r.amount}" aria-label="Amount paid"><button class="primary" type="button" data-billok="${esc(key)}">Save</button><button class="icon-btn" type="button" data-billx="1">Cancel</button></span>`
        : `<span class="row-btns"><button class="ghost" type="button" data-bill="${esc(key)}">${b.r.type === "income" ? "Received" : "Paid"}</button><button class="icon-btn" type="button" data-billskip="${esc(key)}">Skip</button></span>`}</div>`;
  }).join("") + (limit && bills.length > limit ? `<a class="bill-more" href="#bills">+${bills.length - limit} more in Bills &amp; reminders</a>` : "");
  const now = el.querySelector("[data-billamt]"); if (now && keep !== null) now.value = keep;
  return bills.length;
}
export function wireDue(el, rerender) {
  el.addEventListener("click", ev => {
    const b = ev.target.closest("button"); if (!b) return;
    const parse = v => { const [id, k] = v.split("|"); return { r: state.recurring.find(x => x.id === id), k }; };
    if (b.dataset.bill) { ui.payFor = b.dataset.bill; rerender(); setTimeout(() => { const i = el.querySelector("[data-billamt]"); if (i) i.focus(); }, 30); }
    else if (b.dataset.billx) { ui.payFor = null; rerender(); }
    else if (b.dataset.billok) { const { r, k } = parse(b.dataset.billok); const i = el.querySelector("[data-billamt]"); if (r) { payBill(r, k, num(i && i.value)); ui.payFor = null; toast("Saved"); } }
    else if (b.dataset.billskip) { const { r, k } = parse(b.dataset.billskip); if (r) { skipBill(r, k); toast("Skipped for " + monthName(k, true)); } }
  });
}

// a calendar file so your phone reminds you even when the app is closed
function icsFor(r) {
  const now = new Date(), first = dateIn(monthKey(now), r.day).replace(/-/g, "");
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const title = ((r.note || r.category || "Bill") + " (" + money(+r.amount, { whole: true }) + ")").replace(/[,;]/g, " ");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pocket Ledger//EN", "BEGIN:VEVENT", "UID:pl-" + r.id + "@pocket-ledger", "DTSTAMP:" + stamp,
    "DTSTART;VALUE=DATE:" + first, "RRULE:FREQ=MONTHLY;BYMONTHDAY=" + Math.min(28, +r.day || 1), "SUMMARY:" + title,
    "DESCRIPTION:Mark it paid in Pocket Ledger", "BEGIN:VALARM", "TRIGGER:-P" + remindDays(r) + "D", "ACTION:DISPLAY", "DESCRIPTION:" + title + " is due soon", "END:VALARM",
    "BEGIN:VALARM", "TRIGGER:PT9H", "ACTION:DISPLAY", "DESCRIPTION:" + title + " is due today", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}

function renderList() {
  const list = state.recurring.filter(r => isAll() || r.person === ui.view).sort((a, b) => (+a.day || 0) - (+b.day || 0));
  const now = monthKey(new Date());
  $("recList").innerHTML = list.length ? list.map(r => {
    const kk = r.startMonth && r.startMonth > now ? r.startMonth : now;
    const done = billDone(r, kk), st = billStatus(r, kk), mine = canEdit(r);
    const dot = r.paused ? "off" : done ? "done" : st.left < 0 ? "red" : st.show ? st.level : "green";
    return `<div class="rec"><span class="rec-dot ${dot}" title="${done ? "Done this month" : dueText(st)}"></span><div class="rec-main"><b>${esc(r.note || r.category)}</b><small>${esc(money(+r.amount))}, day ${r.day}, reminds ${remindDays(r)} day${remindDays(r) === 1 ? "" : "s"} before${isAll() ? ", " + esc(pname(r.person)) : ""}. ${r.paused ? "paused" : done ? "done for " + monthName(kk, true) : dueText(st)}</small></div>
      <span class="row-btns"><button class="icon-btn" type="button" data-ics="${r.id}" title="Add to your phone's calendar">Calendar</button>${mine ? `<button class="icon-btn" type="button" data-rpause="${r.id}">${r.paused ? "Resume" : "Pause"}</button><button class="icon-btn danger" type="button" data-rdel="${r.id}">Delete</button>` : ""}</span></div>`;
  }).join("") : `<div class="empty"><span>No bills or reminders yet.</span><span class="hint">Add rent, phone, electricity or water. You can also tell the chat "rent is 5,500 on the 1st every month".</span></div>`;
}

export const page = {
  init() {
    wireDue($("billsDue"), () => page.render());
    fillSelect($("brCat"), [...new Set(EXP_CATS.concat(INC_CATS))].map(c => [c, c]), "Rent & bills");
    $("recList").addEventListener("click", ev => {
      const b = ev.target.closest("button"); if (!b) return;
      const r = state.recurring.find(x => x.id === (b.dataset.rpause || b.dataset.ics || b.dataset.rdel));
      if (b.dataset.rdel) removeWithUndo("recurring", b.dataset.rdel, "Reminder deleted");
      else if (b.dataset.rpause && r) db.saveDoc("recurring", r.id, Object.assign({}, r, { paused: !r.paused }));
      else if (b.dataset.ics && r) { saveFile((r.note || r.category || "bill").replace(/[^\w -]/g, "") + ".ics", icsFor(r)); toast("Open the file to add it to your calendar"); }
    });
    $("saveBill").addEventListener("click", () => {
      const name = $("brName").value.trim(), amount = num($("brAmt").value), day = parseInt($("brDay").value, 10);
      const err = m => { $("brErr").textContent = m; $("brErr").hidden = false; };
      if (!name) return err("Give it a name, like Electricity.");
      if (!(amount > 0)) return err("Enter the usual amount.");
      if (!(day >= 1 && day <= 31)) return err("Enter the day of the month it's due (1-31).");
      $("brErr").hidden = true;
      createRecurring({ type: $("brType").value, amount, category: $("brCat").value, note: name, person: meId(), day, remindDays: $("brRemind").value, startMonth: monthKey(new Date()) });
      ["brName", "brAmt", "brDay"].forEach(id => { $(id).value = ""; }); toast("Reminder saved");
    });
  },
  render() {
    renderDue($("billsDue"));
    renderList();
    $("billForm").hidden = state.readOnly;
  }
};
