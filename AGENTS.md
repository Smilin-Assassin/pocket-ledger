# Working on Pocket Ledger (for any AI agent)

Read this file first, then `ARCHITECTURE-ESSENTIALS.md`. `PRD.md` says what the app is for, the product rules, what's next and the release history; `ARCHITECTURE.md` has the detail (modules, data model, server functions, deploy commands, statements, transfers).

## The project in one breath
A household money tracker PWA for a couple in the Maldives (MVR). Plain ES modules, no build step, served by GitHub Pages from this repo's root. Firebase (Auth, Firestore with offline cache, Cloud Functions in `asia-south1`, FCM push). Gemini runs through the `gemini` Cloud Function.

## Rules that are easy to break
- **The repo is public.** Never commit personal details: real names, bank statements, account numbers (even last 4 digits), names from statements, file paths with names, keys or tokens. Tests use made-up data only. Never ask for or paste the Gemini key.
- **Every release:** bump `VERSION` in `sw.js` (`pl-vNN`) **and** `?v=NN` on `app.js` and `css/app.css` in `index.html`. Add new JS files to `SHELL` in `sw.js`. Skipping this gives phones a blank page (old and new files mixed).
- **Run all tests before pushing** (`tests/g1.js` … in order; see Testing). Add a test for anything new.
- **Dock: always 4 or 6 tabs, never 5.** Rounded, not squircle. The + stays in the middle (except in the Glass theme, which copies iOS 26: the + sits in its own circle to the right of the bar).
- **Glass theme (`data-preset="glass"`)** is Apple's look and light only. Glass goes only on things that float over content; content stays on white cards. Its rules live in one block at the end of `css/app.css`; keep Apple's values there and change other themes elsewhere.
- **All look-and-feel settings live in Settings › Appearance** (theme, text size, motion, dock, vibrations).
- **Text size zooms `body`.** Position things with `offsetLeft/Top/Width`, or divide screen distances by `zoom()` from `js/dock.js`. `getBoundingClientRect()` alone drifts at Small/Large text.
- **Motion:** animate `transform`/`opacity` only; springs advance on real elapsed time (`Spring.run(dt)` in `js/motion.js`) so 60/90/120 Hz look the same; respect `prefers-reduced-motion`.
- **Deleting is instant with Undo** (`removeWithUndo`), not "Are you sure?".
- **Only the author edits a doc** (Firestore rules check `author`). Everyone has a private space; groups are shared.
- **Only the same bank reference is skipped as a duplicate.** Look-alikes (same amount, close date) are added and offered as Possible repeats for the person to keep or remove (`importStatement` in `js/scan.js`). Real repeats (two taxi rides of 30 the same day) must stay.
- **Money sent between people never needs a group** (`transfers/{id}`); the amount of a transfer entry can't be edited.
- **Location is opt-in and coarse** (3 decimals, only on things added today, only while the app is open). Smart help is computed on the device.
- **Moves between your own accounts are kept, not dropped:** `type: "move"`, never counted as income or spending, stored once even when both statements show them.
- **Writes never wait on the server** (no "Saving…" spinners): show the change at once and sync in the background (`fire()` in `store.js`).
- **Account digits are last-4 only**, and only ever compared with account numbers, never amounts.
- Bills/reminders are never auto-added. Loans stay out of "left to spend" unless ticked.
- Maldivian dates are DD/MM/YYYY.
- **Design rules (Impeccable + taste-skill):** labels in sentence case (no small all-caps eyebrows); no boxes inside boxes; status as a small dot or tint, never a thick coloured side stripe; show each number once; use the middle dot (·) at most once per line, commas in sentences; keep text at WCAG AA contrast and phone tap targets at 40-44px.

## How the owner works
- Plain English, short answers, no jargon. He decides product questions; ask when a choice is his.
- The owner pushes with GitHub Desktop from the repo folder on their Windows laptop. Server parts (`functions/`, `firestore.rules`) need the owner to run `firebase deploy` in Google Cloud Shell.
- Show screenshots (phone and laptop) before pushing visible changes.
- Keep the docs current at the end of each piece of work: a line in `PRD.md` › Release history, and `ARCHITECTURE.md` for anything structural.

## Testing
```
python3 -m http.server 8765        # in the repo root
cd tests && NODE_PATH=$(npm root -g) node g1.js   # then g2 … g15, in order
```
Firebase is swapped for the mocks in `tests/mockfb/` (the Firestore mock models the security rules). Each test prints ok/FAIL and exits non-zero on failure.
