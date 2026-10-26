# Working on Pocket Ledger (for any AI agent)

Read this file first, then `ARCHITECTURE-ESSENTIALS.md`. `PRD.md` says what the app is for, the product rules, what's next and the release history; `ARCHITECTURE.md` has the detail (modules, data model, server functions, deploy commands, statements, transfers).

## The project in one breath
A household money tracker PWA for a couple in the Maldives (MVR). Plain ES modules, no build step, served by GitHub Pages from this repo's root. Firebase (Auth, Firestore with offline cache, Cloud Functions in `asia-south1`, FCM push). Gemini runs through the `gemini` Cloud Function.

## Rules that are easy to break
- **The repo is public.** Never commit personal details: real names, bank statements, account numbers (even last 4 digits), names from statements, file paths with names, keys or tokens. Tests use made-up data only. Never ask for or paste the Gemini key.
- **Every release:** run `node scripts/bump.js` (bumps `VERSION` in `sw.js` and both `?v=` in `index.html` together). Add new JS files to `SHELL` in `sw.js`; `node scripts/bump.js --check` fails if one is missing. Skipping this gives phones a blank page (old and new files mixed).
- **Run all tests before pushing** (`bash tests/run-all.sh`; see Testing). GitHub runs the same on every push (`.github/workflows/tests.yml`, ✓ or ✗ under Actions). Add a test for anything new.
- **Phone bar: always 4 or 6 tabs, never 5.** Two pill islands with a plain coral disc + in the middle (half the tabs each side). The current tab is a chip that stretches to show its name; on narrow phones or with 6 tabs the name floats above it as a tag (`js/dock.js` `measure()` decides). Hold the + for the Scan / Type it / Voice shortcuts.
- **One look: Coral Dusk** (v50), the app's own branding, on every device (no Apple-only theme). Light (default) or Dark (Graphite with copper, v62), chosen by hand in Settings › Appearance (`pl-mode`); no Automatic, the phone's own setting is ignored. Every older theme choice lands on light. Colours are tokens at the top of `css/app.css` (`:root` light, `:root[data-theme="dark"]`); the shapes live in the CORAL DUSK block (`data-preset="coral"`, always set): white cards with big round corners, plum buttons, a coral + and Add, peach highlights. The top of the Dashboard (v61, `.hero-panel`) is a layer on warm cream, not a card: one paper-cut ring (`#catRing`, rounded pieces sized by share of the month's spending, touch or point at one to lift it) with Left to spend in its middle, one line about the month and Add / Scan. On phones it stays put and the cards slide over it (`pinSync`, `body.pin-home`); it is only pinned when it fits above the dock and no banner shows. Below it the cards (Needs attention, This month, Budgets, Latest entries, Trends) stack as you scroll on phones (`stackSync` in `js/pages/home.js`). The icon is the Budget Ring (`icons/`). The font is Nunito everywhere (v52; `--f-display` and `--f-body`), headings and big numbers at 800.
- **All look-and-feel settings live in Settings › Appearance** (light/dark, text size, motion, dock, vibrations).
- **Text size is a slider that zooms `body`** (`--fs-zoom`, `data-fs="custom"`). It applies on release; during the drag only the sample line changes, because the slider itself is inside the zoomed page.
- **Text size zooms `body`.** Position things with `offsetLeft/Top/Width`, or divide screen distances by `zoom()` from `js/dock.js`. `getBoundingClientRect()` alone drifts at Small/Large text.
- **Motion:** animate `transform`/`opacity` only; springs advance on real elapsed time (`Spring.run(dt)` in `js/motion.js`) so 60/90/120 Hz look the same; respect `prefers-reduced-motion`.
- **Animations (v51, `js/delight.js`)** play only at their own moment, never block a tap (`pointer-events: none`), and each happens once where it says so (opening and rolling number once per app opening, ring once per opening, confetti once per goal). Keep them short; with reduce motion they play down to the end state.
- **Deleting is instant with Undo** (`removeWithUndo`), not "Are you sure?".
- **Only the author edits a doc** (Firestore rules check `author`). Everyone has a private space; groups are shared.
- **Only the same bank reference is skipped as a duplicate.** Look-alikes (same amount, close date) are added and offered as Possible repeats for the person to keep or remove (`importStatement` in `js/scan.js`). Real repeats (two taxi rides of 30 the same day) must stay.
- **Money sent between people never needs a group** (`transfers/{id}`); the amount of a transfer entry can't be edited.
- **Location is opt-in and coarse** (3 decimals, only on things added today, only while the app is open). Smart help is computed on the device.
- **Moves between your own accounts are kept, not dropped:** `type: "move"`, never counted as income or spending, stored once even when both statements show them.
- **Writes never wait on the server** (no "Saving…" spinners): show the change at once and sync in the background (`fire()` in `store.js`).
- **Account digits are last-4 only**, and only ever compared with account numbers, never amounts.
- **Every month starts at zero.** Nothing carries over by itself and there is no bank balance on screen (the Your accounts card was removed in v55; there is no bank connection). Money kept from an earlier month is a **Carryover** entry (`type: "carryover"`, with the spending category it belongs to): it adds to Left to spend and to that category's budget, and is never counted as income or spending. The person decides what to carry over; a month-end screen only suggests.
- Bills/reminders are never auto-added. The Bills page lists a month's recurring expenses with Total / Paid so far / Still to pay (`recurringMonth` in `store.js`): fixed amounts, one-tap Paid logs the usual amount, skipped and paused items are left out. Dashboard says how much is "still to pay" and what is left after it. Loans stay out of "left to spend" unless ticked.
- Maldivian dates are DD/MM/YYYY.
- **Keep the Dashboard to the cream top plus five cards** (Needs attention only when something does). New things go inside one of them, not in a new card. Only the Dashboard pins its top: the other pages are long lists, don't pin them.
- **Home is called Dashboard** on screen (the route and code still say `home`). Extra views open in place as folded cards (`js/fold.js`), not new pages: the dock is 4 or 6 tabs.
- **Dropdowns open the app's own frosted dropdown** (`js/picker.js`, v43), never the phone's built-in list: every `<select>` is wrapped (`.pick-field`) and stays the source of truth (value, `change`, keyboard). Add `data-native` to a select to opt out. In tests, tap the wrapper (`.pick-field:has(#id)`) or use `selectOption`.
- **Security** (`js/lock.js`, v45) is PIN, pattern or password plus optional face/fingerprint, on this device only. A privacy screen, not encryption of the data.
- **Every page title sits in the same place:** the title row is as tall as the month switcher on all pages (`--ph-h`), so don't add per-page header spacing.
- **Erase** goes through `db.removeEntries` (Recently deleted, one Undo) and never touches loan entries.
- **Categories:** pick from the list; a new one is a deliberate "+ New category…" with a hint. Settings › Categories merges strays (entries and remembered shop choices move together, with Undo).
- **Design rules (Impeccable + taste-skill):** labels in sentence case (no small all-caps eyebrows); no boxes inside boxes; status as a small dot or tint, never a thick coloured side stripe; show each number once; use the middle dot (·) at most once per line, commas in sentences; keep text at WCAG AA contrast and phone tap targets at 40-44px.

## How the owner works
- Plain English, short answers, no jargon. He decides product questions; ask when a choice is his.
- The owner pushes with GitHub Desktop from the repo folder on their Windows laptop. Server parts (`functions/`, `firestore.rules`) need the owner to run `firebase deploy` in Google Cloud Shell.
- Show screenshots (phone and laptop) before pushing visible changes.
- Keep the docs current at the end of each piece of work: a line in `PRD.md` › Release history, and `ARCHITECTURE.md` for anything structural.

## Testing
```
bash tests/run-all.sh               # starts a local server if needed; g1, g2, then the rest 3 at a time (~3.5 min)
cd tests && NODE_PATH=$(npm root -g) node g19.js   # any single test also runs on its own
```
Firebase is swapped for the mocks in `tests/mockfb/` (the Firestore mock models the security rules). Each test prints ok/FAIL and exits non-zero on failure. g1/g2 leave starting data in the temp folder; without it, tests use `tests/fixtures/` (made-up data).
