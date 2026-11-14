# Project instructions

This repository is an original browser game: an isometric mini-golf roguelike with 16-bit SNES-style pixel art. The player is the ball. Runs are a branching map of procedurally generated courses.

The owner is new to game development and works as a software tester. Explain choices in plain language, and give them concrete things to playtest.

## Read these first, every session

1. `docs/DESIGN.md` — what the game is. Decisions marked **Decided** are settled; do not reopen them.
2. `docs/FEATURES.md` — the content categories: the template for each (enemies, gear, abilities and so on) and the starter set to build.
3. `docs/PLAN.md` — the milestones, in build order, with acceptance criteria and a progress checklist.

## How to work

- Do one milestone per session unless the owner asks for more. Start with the first unchecked milestone in `docs/PLAN.md`.
- Do not start a milestone whose gate (listed in the plan) has not been signed off by the owner.
- When a milestone is done, tick its checklist items in `docs/PLAN.md` and add a dated line to the "Progress log" at the bottom of that file.
- If you hit a question listed under "Open questions" in `docs/DESIGN.md`, use the stated default, say so in your summary, and keep going. Ask the owner only when there is no default and the answer changes what you build.
- When the owner makes a new design decision, record it in `docs/DESIGN.md` or `docs/FEATURES.md` in the same session.
- Build only the starter sets named in `docs/FEATURES.md` for the current milestone. Do not invent extra enemies, gear or abilities ahead of Milestone 8.
- **Plan before building (owner decision).** A milestone that adds content or a larger system starts with its **Plan gate**: write a design sheet in `docs/plans/milestone-N.md` listing every item to be built with its template fields, starting numbers and behaviour in each case, then stop and ask the owner to review it. Build nothing on the sheet until the owner signs it off. Record the sign-off and any changes they make in the sheet and in `docs/FEATURES.md`.

## Rules that must not be broken

1. **Original content only.** The game borrows genre mechanics from 16-bit isometric golf games. It must not use any existing game's names, characters, sprites, music, sound effects, level layouts, or UI art. Every name and asset is original. Do not download or rip assets from existing games. Third-party assets are allowed only with a licence that permits commercial use, recorded in `assets/LICENSES.md`.
2. **The simulation is separate from the display.** Everything under `src/sim/` is plain TypeScript with no imports from the rendering library, the browser DOM, or `src/render/`. It must run in Node.
3. **The simulation is deterministic.** Fixed timestep. All randomness goes through the seeded random number generator in `src/sim/rng.ts`. Never call `Math.random()` or read the clock inside `src/sim/` or `src/gen/`. The same seed and the same inputs must always produce the same result.
4. **Content is data.** Tiles, enemies, abilities, gear, biomes, shop stock, and tuning numbers live in definition files under `src/content/`, not in logic code. Every stat change goes through the modifier system in `docs/FEATURES.md` section 1. Adding a new enemy or tile should not require editing the physics or the generator.
5. **Art is swappable.** Game code refers to sprites by ID through the asset manifest. Never hard-code file paths or colours for game objects in logic code. Placeholder art must be replaceable without touching `src/sim/` or `src/gen/`.
6. **Every generated course is verified beatable** by the validator before the player sees it.

## Verifying your work

- Run the unit tests and the type check before calling anything done.
- For anything visible, start the dev server, drive the game with the pre-installed Playwright, and look at a screenshot yourself. Do not report a visual change as working from tests alone.
- End each session's summary with: what was built, how the owner can run it, and a short list of specific things for them to try and report back on.

## Git

- Work on a branch per milestone named `milestone-N-short-name`, and open a pull request only when the owner asks. Small documentation fixes may go straight to `main`.
- Keep commits small and described in plain language.
