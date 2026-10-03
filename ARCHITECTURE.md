# Architecture

Short version: `ARCHITECTURE-ESSENTIALS.md`. What the app is for and the product rules: `PRD.md`. Rules for AI agents: `AGENTS.md`.

## Principles
- **No build step.** Plain ES modules, loaded as they are by GitHub Pages. One job per file.
- **Offline first.** Firestore's persistent cache means writes land instantly and sync later; the service worker serves the shell network-first so updates arrive on the next open.
- **The server is small.** Everything that can run in the browser does. The server only holds what must be secret or trusted: the Gemini key, invite redemption, admin actions, scheduled alerts and push.
- **Security in rules, not in the UI.** `firestore.rules` enforces who can read a space and that only a doc's `author` can change it. The UI hides buttons, the rules make it true.

## Start-up
1. `index.html` applies the saved theme before paint (inline script: `plApplyTheme`; with no saved theme, Apple devices get Glass and everyone else Lagoon; Glass forces light and, off Apple devices, loads Inter), then loads `app.js?v=NN`.
2. `app.js` shows the gate: sign in, invite check (`access` function), one-time migration of the old household, then picks the space (Me, a group, or someone's dashboard you were allowed to view).
3. `js/main.js boot()` registers the pages, starts shell, dock, Quick add, scanning, statements, transfers, chat, lock and the backup reminder, then connects the live data and routes.

## Modules
| File | Responsibility |
|---|---|
| `js/store.js` | `ctx` (Firebase handles, profile, spaces), `state` (entries, goals, loans… for the open space), `ui` (month, view, filters). Live listeners, `rebuild()` (legacy ids, hiding others' private items), all money maths (month totals, savings, goals, loans, bills, who owes whom, budgets, categories) and writes (`db.add/update/saveDoc/removeDoc/restoreDoc/addMany/removeMany/saveSettings/replaceAll`). Deletes keep a copy in `trash` for 30 days. |
| `js/actions.js` | Shared actions used by forms, scanning and chat: loans and repayments, bills (create/pay/skip), settle up, budgets and budget alerts, `addEntries`, `removeWithUndo`. |
| `js/shell.js` | Hash router (`#page/anchor`), page title, month switcher, space chips, "whose money" switch, banners, `onRoute` hooks. |
| `js/pages/*.js` | One page each. `entries` has the form, the list with category picker and total line, CSV export; `home` the dashboard and category bars (tap → entries for that category); `settings` holds every section including Appearance. |
| `js/dock.js` | Phone dock: builds 4 or 6 tabs (+ More), the liquid highlight, scrub, badges, More page; side-menu highlight on wide screens; page slide-in. |
| `js/quick.js` | Quick add sheet that grows out of the +; number pad, most-used categories, date, note; hold the + for Scan / Type it / Voice. |
| `js/glass.js` | Glass theme extras: the touch light under your finger on glass surfaces, and on Chromium (not Safari) real lens edges, an SVG displacement map drawn to each surface's size (`#lensDefs`), redrawn on resize and when the tab bar settles. |
| `js/motion.js` | Spring physics on real time, presets (Calm/Lively/Jelly), CSS `linear()` easing from the spring, vibrations, refresh-rate measurement. Settings in localStorage `pl-motion`. |
| `js/scan.js` | Receipt and screenshot scanning (Gemini prompt + check-before-adding sheet) and bank statement import: BML CSV and MIB CSV parsed exactly, other CSVs and PDFs via Gemini; own-account detection, cross-checked duplicates, categorising, Undo. |
| `js/gemini.js` | Calls the `gemini` function (or a personal key), image compression, PDF inline data. |
| `js/chat.js` | Chat and voice: Gemini plans tool calls (look-ups, reports or changes), changes need a one-tap confirm. `report` draws a pie (shares) or bar (over time) chart plus a table under the reply, with Download CSV; the app computes every number. |
| `js/transfers.js` | Money sent between people: send sheet (contacts, find by email via `people`), first-time card, automatic adding by the receiver's rule, push via `notifyTransfer`. |
| `js/smart.js` | Smart help on Home, computed on the device: regular payments → bill, category above usual, quiet days, optional places (rounded position on entries added today, suggestion when near a place paid at twice). |
| `js/lock.js`, `js/notify.js`, `js/backup.js`, `js/util.js` | App lock (PIN/fingerprint), push setup and notification choices, backup/restore/reminder and import history, small helpers (`toast` with Undo, dates, money, storage). |
| `sw.js` | Cache `pl-vNN`, network-first with `no-cache`, share target (images, PDF, CSV), push display. |
| `functions/index.js`, `alerts.js` | `gemini`, `access`, `admin`, `dailyAlerts` (08:30 Maldives), `notifyTransfer`, `testPush`. |

## Statement import pipeline
`importStatement(file)` → parse (`mibRows` / `bmlRows` / Gemini `aiRows`) → `ownInfo` (your bank names and account last-4s, plus the account in an MIB file name) → per row: same reference twice in the file → skip; own account (account digits or name, initials allowed) → a `move` entry, or joins an earlier move with the same amount within 2 days that hasn't got this side yet (`moveOf`, so a move seen on both statements is stored once); already in the app (`dupOfRow`: same reference; or same type + amount within 2 days, not contradicted by a different reference, one match per entry, best by name then day) → skip; otherwise add → categorise (memory of past categories, then Gemini, then keyword fallback) → `db.addMany` with an `importId` so the whole batch can be undone.

## Navigation, motion and layout

- **Phones (under 900px): a floating dock** (`js/dock.js`). The + sits in the middle; tabs are **always 4 or 6, never 5** (owner's rule, for symmetry). 4 = three chosen pages + More (default Home, Entries | Bills, More); 6 = every page, no More. 6 is only offered when each tab still gets 46px (about 374px wide or more). Rounded corners only (squircle was tried and dropped).
- The dock's highlight is a liquid spring: tap, or hold and slide across to scrub. It stays put while scrolling (the tuck-away was removed at the owner's request). Bills count / Settings dot show on the dock, or on More when that page is hidden there. More (`#more`) lists the pages not in the dock, plus Admin for admins.
- **The +:** tap = Quick add (`js/quick.js`): number pad, Spent/Income, most-used categories first, Today (tap to change the date), optional note, "More options" opens the full Entries form filled in. Adds as you, with Undo. Hold the + = Scan / Type it / Voice.
- **Wide screens (900px+):** side menu, with the same liquid highlight moving vertically. No dock.
- **Deleting** entries, reminders and goals is instant with an **Undo** button in the toast (no "Are you sure?"); Undo also removes the Recently deleted copy, and for goals puts the savings back on the goal. `toast(msg, {action, onAction})` in util.js.
- **Settings › Appearance holds all look-and-feel** (keep it that way): mode, theme, text size, AMOLED, motion preset (Calm / Lively default / Jelly), dock tabs (4/6 + which pages), little vibrations (default on), measured refresh rate. Motion settings are per device in localStorage `pl-motion`.
- **Smoothness rules:** animate transform/opacity only; springs run on real elapsed time in small fixed slices (`Spring.run(dt)`), so 60/90/120/144 Hz all look the same and use every frame; CSS transitions use the same spring as a `linear()` easing (`--spring-ease`, `--grow-dur`); scroll listeners are passive; `prefers-reduced-motion` keeps things short. Vibrations only fire after the user has touched the page. **Text size zooms `body` (Small .92 … XL 1.25):** position things with layout values (`offsetLeft/Top/Width`), never `getBoundingClientRect()` alone, or divide screen distances by `zoom()` from dock.js; g10 checks the highlights at every text size. The refresh rate shown is measured during real animations (phones idle at 60 Hz).
- Header on each page: page title, month switcher (Home, Entries), space chips (Me / groups / dashboards shared with you), and in groups the "You / <partner> / All of <group>" switch.
- The chat button floats on every page (above the dock on phones). Scan opens a sheet from Home, Entries, the + (hold), the share sheet or the icon shortcut.
- Breakpoint 900px: below it the dock and Quick add; above it the side menu.

## Tests
Run from the repo root:
```
python3 -m http.server 8765
cd tests && NODE_PATH=$(npm root -g) node g1.js   # then g2 … g15, in order
```
`tests/` runs Playwright against the real files with Firebase replaced by mocks (`tests/mockfb/`); the Firestore mock checks the security rules so a denied write fails the test. `g1` seeds an old-style household; later tests chain on `pl_state*.json` in the temp folder. g1 migration · g2 sharing, groups, view requests, view-only · g3 joining from a group link · g4 a new person through every page · g5 invites · g6 admin · g7 trash, backup, CSV, chat confirm, shortcuts · g8 BML statement, Undo, bank accounts list · g9 money sent between people · g10 dock, Quick add, Undo, Appearance, every text size · g11 MIB statement, duplicate cross-checks, slip prompt · g12 category drill-down and totals, chat button tucking and never covering content · g13 Glass theme: Apple default, light only, the iOS tab bar and its shrinking (follows the finger, holds still, settles on release), touch light, Android with Inter and lens edges, the glass side menu · g14 own-account moves across two statements, Moved → Save, change all + remembered categories, Find & replace, chat reports (pie, bar, CSV), transfer cards only in Me · g15 password eye, chat layout while thinking, smart help (bill from regular payments, above usual, places), deleting a group. g9 also covers sending by email and automatic adding. All test data is made up.

## Hosting, services and deploying

- **GitHub Pages** serves the static app. The owner pushes with GitHub Desktop from the repo folder on their laptop.
- **Firebase project `pocket-ledger-3a340`** (Blaze / pay-as-you-go, region `asia-south1`): Email+password Auth, Firestore (persistent offline cache), Cloud Functions, FCM push.
- **Gemini** runs through the `gemini` Cloud Function with secret `GEMINI_KEY`. This is a FREE-tier key from an AI Studio project without billing. Never ask for or paste the key in chat; the owner sets it in Cloud Shell with `firebase functions:secrets:set GEMINI_KEY`.
- The Firebase web config in `config.js` (apiKey `AIza…LxyV4`) is public by design; not a secret.
- Deploying server parts is done by the owner in Google Cloud Shell:
  `cd ~/pocket-ledger && git pull && firebase deploy --only functions,firestore:rules`
- If a newly created callable function says "not authenticated", fix with:
  `gcloud run services add-iam-policy-binding <name-lowercase> --region=asia-south1 --member=allUsers --role=roles/run.invoker --project=pocket-ledger-3a340`
- Daily Firestore backups are scheduled (7 days kept; checked 3 Oct 2026). The command, for reference:
  `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=7d --project=pocket-ledger-3a340`

## Data model (Firestore)

- `users/{uid}`: `personal` (id of their private space), `spaces[]` (group ids), `name`, `email`, `tokens[]` (FCM), `notify {bills, budgets, loans, transfers}`, `lastSeen`. Legacy: `household`.
- `households/{id}` = a **space**. `type: "personal" | "group"`, `owner`, `members[]`, `viewers[]` (people allowed to view a personal space), group `name`, `names {uid: name}`, `colors {uid: hex}`, `joinUntil` (ms; invite link open until), `settings {currency, opening, openingBy {uid}, people [...] (personal only), budgets {all|uid: {category: limit}}}`, `ai {server}`, `gemini {key}` (legacy), `alertState`. Legacy fields kept on the converted old household: `personOf {uid: "p1"|"p2"}`, `legacy` (old settings).
  - Subcollections: `entries`, `goals`, `loans`, `recurring`, `settlements`, `trash`; groups also have `transfers`, personal spaces `transfersSeen`. Every doc has `author` (uid of who added it).
  - Entry: `type` (expense|income|save|withdraw|move), `amount`, `date` (YYYY-MM-DD), `category`, `note` (≤160), `person` (uid), `created`, optional `goalId`, `split {with, share}`, `countMonth` (YYYY-MM it counts for), `loanId`/`loanRole`, `recurringId`, `ref` (bank ref), `source`, `importId`/`importLabel` (statement batch). Own-account moves: `type: "move"` (never counted), `moved: true` (kept if the owner turns it into Save), `acctFrom`, `acctTo`, `legs[]` (`"<last4 or bank>:<in|out>"`, one per statement side seen), `refs[]`. Editing an entry keeps all of these.
  - Personal space `settings.catRules {expense|income: {name key: category}}`: categories remembered from "change all" and Find & replace (`ruleFor`/`guessCategory` in `store.js`, used by the form, scans and imports).
  - Personal space `settings.xferRules {senderUid: {cat, name}}` (money from that person is added automatically) and `settings.contacts [{uid, name}]` (people to send to). Entries may carry `place {lat, lng}` (3 decimals, opt-in) and `maybeDup` (id of the entry it looks like; "" once kept).
  - Goal: `name`, `target`, `by` (target month YYYY-MM — note `by` means deadline, NOT creator), `owner` (uid or "shared").
  - Recurring (bills/reminders): `type, amount, category, note, person, day, remindDays, startMonth, skips[], paused`. Paying creates entry id `rec-{rid}-{YYYY-MM}`. Never auto-added.
  - Loans: `direction` (lent|borrowed), `counterparty`, `amount`, `date`, `due`, `inMonth` (count in monthly money; default off), `person`. Repayments are entries with `loanId`.
  - Trash: `{col, docId, data, deletedAt, author}`; kept 30 days.
- `access/{uid}`: invite-only gate, written only by the server. `{ok, email, admin, how: existing|invite|restored, since, invite, invitedBy}`.
- `revoked/{uid}`: people the admin removed (server only).
- `invites/{code}`: `{by, note, group, created, expires, max: 1, used[], usedBy[]}`; created by admins in the app, used up by the `access` function.
- `viewRequests/{id}`: "can I see your dashboard" `{from, fromName, to, toName, status: pending|accepted|declined|revoked, space, group, created, answered}`.
- `aiUsage/{uid}_{day}` `{n, uid, day}` and `config/app {aiLimit}`: server only.

## Server functions (`functions/index.js`, region asia-south1)

- `dailyAlerts` (08:30 Indian/Maldives): bills/budgets/loans alerts via FCM (`alerts.js`).
- `notifyTransfer` (callable): push to the receiver when someone records money sent to them; checks the caller is the sender (and, for old group transfers, that both are in the group). Says "added to your income" when the receiver has an automatic rule for the sender.
- `people` (callable, v36): `lookup {email}` → `{uid, name}` of someone with access (exact email only, nobody can list users); `deleteGroup {gid}` → the group's owner only; removes it from every member's `spaces` and deletes the group with everything under it (`recursiveDelete`).
- `gemini` also takes `search: true` → Google Search grounding (used to look up unknown shops in statements).
- `testPush`, `gemini` (needs `access/{uid}`; daily per-person limit from `config/app.aiLimit` or 300; model chain gemini-3.8-flash → 3.7-flash → 3.5-flash → 3.5-flash-lite), `access` (invite redemption / grandfathering; refuses `revoked`), `admin` (overview, revoke, restore, makeAdmin, removeAdmin, deleteWaiting, setLimit).

## Bank statements (details)

- Entries page › "Import a bank statement (PDF or CSV)", Settings › Backup, or share a PDF/CSV to the app (Android). Only in your own space (Me).
- BML CSV exports are read directly in `scan.js` (`bmlRows`), no Gemini. PDFs and other banks' CSVs go to Gemini (`statementPrompt`, PDF sent as `application/pdf`).
- Every row becomes Spent or Income straight away (no check screen, by the owner's choice). Skipped: rows already in Pocket Ledger (same bank reference, or same type + amount within 2 days, one-to-one) Moves between your own accounts (the name on your bank account, the statement holder's name, or the other side's account ending in one of your last-4 digits) are kept as "Moved" entries that don't count; the owner can turn one into Save.
- Categories: your past choices for that shop first, then one Gemini call for the rest, then simple keyword rules.
- Imported entries carry `source: "statement"`, `importId`, `importLabel` and the bank `ref`; Undo (in the summary or Settings › Backup) deletes that batch for good.
- Settings › Your details has a list of bank accounts (bank, nickname, last 4). Stored as `people[0].accounts`; `acct` is kept as the comma list of last-4s for scanning.
- Tested by `tests/g8.js` with made-up data. Never commit a real statement: the repo is public.

### MIB statements (added Oct 2026, pl-v26)
- MIB's CSV export (columns POSTED DATE, VALUE DATE, TRANSACTION TYPE, REFERENCE, DESCRIPTION, AMOUNT signed, RUNNING BALANCE) is read exactly by `mibRows()` in scan.js, no Gemini. DESCRIPTION is `DD-MM-YYYY HH-MM-SS | other side | remark`; Favara rows put `BANK - NAME, remark` in the 3rd part. The description date is used when within 3 days of posting (otherwise the posting date, e.g. profit runs).
- MIB names the file after the account number (`<17-digit account>-01-01-2026-30-09-2026.csv`), so its last 4 digits count as one of yours for that import.
- Names match with initials both ways (`THMS.A.HASSAN` = `Thomas Ali Hassan`).
- **Duplicates are cross-checked, never decided by amount alone:** same bank reference → same; different references on both → different; otherwise same type + amount + within 2 days, each existing entry matching at most one row, best match by name in the note, then same day. Entries from another statement match only by reference. The same reference twice in one file is skipped once. So repeated payments (two 30s to one person on a day, the same amount monthly) are kept.
- Slip scanning tells Gemini every saved account ending (old field + accounts list) and that amounts, references, dates and phone numbers are never account numbers; account and name are cross-checked and a disagreement becomes a question.
- Test: g11 (made-up MIB file). Never commit a real statement: the repo is public.

## Money sent between people (added Oct 2026, direct since pl-v36)
- v36: transfers live in top-level `transfers/{id}` `{from, fromName, to, toName, amount, date, note, created, author}`; rules: create by the sender (fixed keys, amount > 0, not to yourself), read by sender or receiver, delete by sender, never updated by clients. Recipients: `settings.contacts [{uid, name}]` in your own space, people from past transfers, group members, or `people.lookup` by email.
- Receiving: the app queries `transfers where to == me` (plus old group transfers). Unseen ones from a sender in `settings.xferRules {senderUid: {cat, name}}` are added straight away (entry `xfer-d-{id}`, `source: "transfer"`, `transferFrom`) and marked in `transfersSeen/d_{id}`; others show a card in Me with "add automatically next time" (ticked). Editing a transfer entry keeps the amount read-only.
- Deploy after v36: `firebase deploy --only functions,firestore:rules`, then once: `gcloud run services add-iam-policy-binding people --region=asia-south1 --member=allUsers --role=roles/run.invoker --project=pocket-ledger-3a340`.

- Entries page › "Send money to someone in your group" (`js/transfers.js`). It only records a transfer; it doesn't move money.
- The sender writes `households/{group}/transfers/{id}` `{from, fromName, to, toName, amount, date, note, created, author}`. "On your side": not counted, or an expense in the sender's own space (`xfer-out-{group}-{id}`).
- The receiver's app finds transfers `to == me` in their groups and shows a card on every page: edit note, category (or "don't count it"), date, then Accept (income `xfer-{group}-{id}` in their own space) or Decline. Answers are kept in `transfersSeen/{group}_{id}` in their own space, so cards don't come back. Nothing is added to the group's own entries.
- Everyone in that group can read its transfers (amount and remark).
- Statement imports skip the bank's copy of an accepted transfer (same amount within 2 days).
- The full card (Accept/Decline) shows only in your own space; in a group you get a one-line note with "Open Me". Sending and accepting don't wait on the server (batched writes that sync in the background).
- Push: `notifyTransfer`, per-person setting `notify.transfers` (Settings › Notifications › Money sent to you). Needs `firebase deploy --only functions` plus the one-time `add-iam-policy-binding notifytransfer …` command above (new callable).
