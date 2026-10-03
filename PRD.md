# Pocket Ledger: product requirements

## Why it exists
A household in the Maldives wants to know, at any moment, **how much is left to spend this month**, where the money went, and what's coming up, without the chore of typing everything in. Bank apps show transactions, not budgets; spreadsheets are too slow on a phone.

## Who it's for
- Live at https://smilin-assassin.github.io/pocket-ledger/ (installable PWA). Currency MVR; Maldivian dates are DD/MM/YYYY.
- A couple: the owner (admin; Android phone and a Windows laptop) and their partner (iPhone, installed from Safari). They share some costs, keep some money private, and pass money between each other often.
- A few invited friends or family later. Invite-only.

## What good looks like
- Logging a payment takes **under 5 seconds** (Quick add from the +), or none (scan a slip, import a statement).
- Home answers "how much is left this month?" at a glance.
- Nothing is counted twice and nothing real is dropped: own-account moves are skipped, genuine repeats are kept.
- Feels alive and smooth on a 120 Hz phone; works offline; never loses data (Undo, Recently deleted, daily server backups, file backups).
- Private by default: your space is yours; groups share only what's put in them; only the person who added something can change it.

## Features (live)
- **Money:** income, spending, savings and withdrawals, savings goals, loans (lent/borrowed, repayments), bills and reminders (never auto-added), budgets with alerts, a dashboard with "left to spend", category breakdown (tap a category to see its entries and total).
- **Getting data in:** Quick add (number pad, most-used categories); scanning receipts, bank slips and screenshots with Gemini (check before adding); BML and MIB CSV statements read exactly; PDF statements via Gemini; Gemini chat by text or voice with one-tap confirm; share-to-app on Android.
- **Together:** private space plus groups; ask to view someone's dashboard; money sent between people with an approval card and a push notification; who-owes-whom and settle up.
- **Safety:** invite-only accounts, admin page (never shows money), app lock, Undo on deletes, Recently deleted (30 days), backups and restore.
- **Look and feel:** themes, light/dark/AMOLED, text size, motion presets, a floating dock with 4 or 6 tabs, vibrations; all in Settings › Appearance.
- **Alerts:** bills, budgets, loans, money sent to you (FCM push, per-person choices).

## Rules decided with the owner (keep these)

- **Privacy:** everyone has a private space ("Me"). Groups (renameable, one person can be in several) hold shared things. Group entries are visible to all members but **only the person who added something can edit/delete it** (enforced by rules via `author`). Only the group owner renames it or opens invitations.
- Someone can **ask to see** another member's own dashboard; the owner allows/declines; viewers are read-only; it can be revoked in Settings › Privacy.
- **Invite-only:** new accounts need an invite link (`?invite=CODE`, optional `&join=GROUP`), one use, 7 days, made by an admin in Settings. Existing users from before were let in automatically. The owner is admin. Admin page (side menu on wide screens, Settings › Account on phones) shows people, last active, Gemini use per day/person, daily AI limit, remove/restore access, delete accounts that signed up without an invite. It never shows money.
- Use "your" on the user's own dashboard; use the person's name only when viewing someone else's.
- Save type has an "Other" option with a box below for the purpose. Income has "Counts for: this month / next month" (default this month).
- Repeating items are reminders only (green → amber → red bar as the due day nears), never auto-added.
- Loans are separate from "left to spend" unless ticked; repayments in increments with a progress bar.
- Category is a dropdown (not a typed field) to avoid the keyboard autocorrect bar.
- BML transfer scanning: account last-4 digits decide direction (people often save the receiver under a nickname, so the account number beats the name). Receipts/tax invoices are one expense for the Grand Total; shop bank details on a receipt are not a transfer; notes list every item.
- Notifications (FCM) for bills, budgets, loans; chosen per person in Settings.
- Backups: Recently deleted (30 days); Back up button shares one JSON file (pick Drive on Android, Files on iPhone); reminder after 14 days. Restore replaces only the personal space.
- On iPhone: no share-target, no icon shortcuts, push only when installed to home screen (iOS 16.4+).
- The dock is always 4 or 6 tabs, never 5; rounded, not squircle; icons are outlines (the pill marks the page). All look-and-feel settings live in Settings › Appearance.
- Deleting is instant with Undo, not "Are you sure?".
- Never store more than the last 4 digits of an account; those digits only ever match account numbers, never amounts.
- Statement imports never skip a payment just because the amount repeats (two taxi rides of 30 on one day are two entries).

## Not doing (for now)
- Connecting directly to bank accounts (no open-banking APIs in the Maldives).
- Multiple currencies per space beyond asking how much to record.
- Investment tracking or financial advice.

## Next
1. Notifications open the right page (the server sends `APP_URL`; the app already supports `#bills`, `#loans`, … so the functions just need to add them).
2. Month and year comparisons (last 3 months, the year so far).
3. Offline check on real phones.
4. Android app: a thin installable wrapper first; reading bank SMS only if it's worth Google's review.

## Release history (newest first)

- October 2026 (pl-v34): Glass gets two Apple touches. Pressing any glass surface (tab bar, +, chat button, month switcher, side menu) lights it up under your finger, the light follows as you slide, and the bar swells slightly while held. On Chrome, Edge and Android the glass also really bends what is behind it at its rim (an SVG lens map drawn per surface); Safari can't do this, so Apple devices keep the plain glass.
- October 2026 (pl-v33): Glass tab bar feels closer to native: one update per screen frame, holding a finger still part-way keeps it there (it used to drift to an end on iPad), and on letting go it glides on at the speed you were scrolling toward the end you were heading for. The highlight stays hidden while the bar changes size, so nothing measures the layout every frame.
- October 2026 (pl-v32): Glass tab bar shrinks and grows along with your scrolling instead of jumping: each bit of scroll moves it part of the way, and when you stop it glides on a spring to fully open or fully shrunk.
- October 2026 (pl-v31): Glass theme, Apple's Liquid Glass look, light only. On by default on iPhone, iPad and Mac (anyone can switch in Settings › Appearance; Android gets it with Inter instead of Apple's font). Apple's system colours, grey background with white cards, capsule buttons, iOS segmented controls and switches. Glass only on what floats: the iOS 26 tab bar (labels under every icon, + in its own circle on the right, shrinks to the current tab while scrolling down), the chat button, month switcher, sheets, toasts, and a floating glass side menu on wide screens. Text stays at AA: where Apple's own greys and blue are too faint for text, the nearest passing Apple value is used.
- October 2026 (pl-v30): calmer Home (Impeccable + taste-skill): labels in sentence case instead of small all-caps; no boxes inside the dashboard box, status shown by a small dot instead of thick coloured stripes (Home tiles, bill banner); each Home number shown once (bar legend shows shares, the big number's line shows the daily amount); fewer middle dots; the chat button tucks away while scrolling down and page bottoms leave room so it never covers anything.
- October 2026 (pl-v29): polish pass (Impeccable): faint grey text and placeholders pass WCAG AA in every theme; phone tap targets 40-44px; themed selection, caret, checkboxes and scrollbars; labelled invite link; dock icons are plain outlines.
- October 2026 (pl-v28): personal details removed from the repo (docs, test data, example wording); test data is all made up.
- October 2026: docs reorganised; HANDOFF.md retired (its content is now in ARCHITECTURE.md, PRD.md and AGENTS.md).
- October 2026 (pl-v27): tap a category on Home (Where the money went) to see its entries; Entries has a category picker and a total line for whatever is shown (`ui.cat`, `#ledgerTotal`, test g12).
- October 2026 (pl-v26): MIB CSV statements, cross-checked duplicates, tighter account-number rules for Gemini.
- October 2026 (pl-v25): highlights lined up at every text size (Small was off), dock no longer tucks away, refresh rate measured while moving.
- October 2026 (pl-v24): the dock, Quick add, Undo instead of confirmations, motion settings in Appearance.
- October 2026: front-end overhaul. Same Firestore data, rules and functions; the single generated page became separate modules and pages with a side menu / tab bar. Behaviour changes worth knowing: in your own space and in groups you always add things as yourself (as before), the Gemini key/model now has its own Save button, and the old "top buttons show icons/words" setting went away with the top toolbar.
