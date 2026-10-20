# Skills & Plugins — Pocket Ledger

Skills loaded for this project session.

## 🔌 Plugins (5)

| Plugin | Version | Source | Use for |
|---|---|---|---|
| `impeccable` | 4.4.0 | pbakaus/impeccable | Frontend design fluency — `/impeccable` commands for craft, audit, polish, animate, typeset, layout |
| `taste-skill` | 1.0.0 | Leonxlnx/taste-skill | Anti-slop frontend design rules — typography, color, layout discipline, motion, pre-flight checks |
| `static-analysis` | 1.5.0 | trailofbits/skills | Semgrep + CodeQL security scanning |
| `humanizer` | 6.1.0 | chi-feng/humanizer | Remove AI-writing patterns from copy and docs |

## 🧠 Available Commands

### Design (`impeccable`)
`craft` · `shape` · `init` · `document` · `extract` · `critique` · `audit` · `polish` · `bolder` · `quieter` · `distill` · `harden` · `onboard` · `animate` · `colorize` · `typeset` · `layout` · `delight` · `overdrive` · `clarify` · `adapt` · `optimize` · `live` · `generate`

### Security (`static-analysis`)
- `/static-analysis:semgrep-scan` — Run Semgrep end-to-end
- `/static-analysis:codeql-build` — Build CodeQL database

### Copy (`humanizer`)
- `/humanizer` — Rewrite text to remove AI tells
- `/humanizer --audit` — Show diff of what changed

## Which skill for which job

| Job | Use | Notes for this repo |
|---|---|---|
| New screen or a visual change | `impeccable` (`shape`, then `craft`) with `taste-skill` rules | Keep the Coral Dusk tokens at the top of `css/app.css` (light and dark). Settings belong in Settings › Appearance. |
| Before pushing a visible change | `impeccable audit` / `critique`, then `polish` | Check phone portrait and landscape, laptop, every text size (Small zooms the page), light and dark. |
| Animation work | `impeccable animate` | Transform/opacity only; springs from `js/motion.js` (time-based, 60–120 Hz); respect reduced motion. Dock stays 4 or 6 tabs. |
| Words on screen and docs | `humanizer` | Plain English, short, no jargon. The owner reads on a phone. |
| Security review | `static-analysis` (Semgrep) | Focus: `firestore.rules`, `functions/index.js` (callable checks), anything that builds HTML (`esc()` every value), and that no real data is committed. |
| Releasing | the `pocket-ledger-release` steps below | |

## Project Context

Pocket Ledger is a vanilla-JS PWA (no React, no build step). Skills that assume a React/Tailwind/Next.js stack (e.g. taste-skill's default block library) are used for design direction and review only — implementation stays native JS + CSS.

## Releasing (pocket-ledger-release)
1. Bump `VERSION` in `sw.js` (`pl-vNN`) and `?v=NN` on `app.js` and `css/app.css` in `index.html`; add new JS files to `SHELL`.
2. Run every test in `tests/` in order (`g1` … `g12`); add one for the new feature.
3. Add a line to `PRD.md` › Release history; update `ARCHITECTURE.md` if modules, data or tests changed.
4. Commit and push (GitHub Desktop). Server changes also need `firebase deploy` in Cloud Shell, done by the owner.
5. Check https://smilin-assassin.github.io/pocket-ledger/sw.js shows the new `pl-vNN`.
