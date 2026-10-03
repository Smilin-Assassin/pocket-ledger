# Architecture essentials (one page)

```
Phone / laptop browser (installable PWA)
  index.html ── app.js (sign-in gate, invite check, spaces) ── js/main.js boot()
                  │
                  ├─ js/store.js     live Firestore data for the open space + all money maths + writes
                  ├─ js/shell.js     hash router (#home, #entries, #settings/look …), header, banners
                  ├─ js/pages/*.js   one file per page: home, entries, loans, bills, goals, settings, admin
                  ├─ js/dock.js      phone dock (4 or 6 tabs), side-menu highlight, More page
                  ├─ js/quick.js     Quick add sheet from the +
                  ├─ js/motion.js    springs, presets, vibrations, refresh-rate measure
                  ├─ js/scan.js      receipt/slip scanning (Gemini) + bank statement import (BML/MIB CSV exact, PDF via Gemini)
                  ├─ js/chat.js      Gemini chat, voice, one-tap confirm
                  └─ sw.js           offline cache (network-first), share target, push
        │
        ▼
Firebase project pocket-ledger-3a340 (asia-south1)
  Auth (email + password, invite-only) · Firestore (offline cache) · FCM push
  Cloud Functions: gemini · access · admin · dailyAlerts · notifyTransfer · testPush
```

**Data:** `households/{id}` is a *space* (a private "Me" space or a shared group) with subcollections `entries`, `goals`, `loans`, `recurring`, `settlements`, `trash` (+ `transfers` in groups). Every doc has `author`; only the author can change it. `users/{uid}` holds the person's spaces and push tokens. Full model in `ARCHITECTURE.md`.

**Flow of a change:** UI → `db.*` in `store.js` writes to Firestore straight away (works offline) → the live listener updates `state` → `changed()` re-renders on the next frame.

**Gemini:** always through the `gemini` Cloud Function (key is a server secret, daily per-person limit). Bank CSVs from BML and MIB are parsed exactly in the browser without Gemini.

**Release:** bump `pl-vNN` in `sw.js` and `?v=NN` in `index.html`; run `tests/g1…g13`; push; check the live `sw.js`.
