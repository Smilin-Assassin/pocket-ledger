# Claude: Pocket Ledger

@AGENTS.md

## Claude-specific
- Start every session with `AGENTS.md` (above), then `PRD.md` › Next and Release history for what's live and what's next.
- Design and copy skills: see `SKILLS.md` for which skill to use when. Design skills give direction; the code stays vanilla JS + CSS (no React, Tailwind or build step).
- In Cowork (cloud session linked to the owner's laptop): edit in the cloud workspace, run the tests there, write the changed files into the repo folder on the laptop, then commit and push through GitHub Desktop. Check sizes on the laptop after writing (writes have gone stale before), and click History → Changes in GitHub Desktop if it shows no changes.
- After pushing, confirm the live `sw.js` shows the new `pl-vNN` at https://smilin-assassin.github.io/pocket-ledger/sw.js.

## UI/UX skills

Taste, a11y, bans, voice, and icon library for this project live in `.ux-profile.md`.
Run `setup-ui-ux-skills` again only to change those defaults.
Before UI or microcopy work, read `.ux-profile.md`, then the matching domain skill (page-patterns, viewports, forms, surfaces, loaders, empty-states, copy, motion).
Before creating a new page, read `page-patterns` and name the pattern. Do not write page markup until the pattern is named.
Layouts must pass `viewports` at 375px and 1280px.
Before finishing UI, run `ux-audit`.
