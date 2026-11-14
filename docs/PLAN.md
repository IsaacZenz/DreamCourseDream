# Build plan

Milestones are in build order. Each one ends with something the owner can open in a browser and play. Do them in order. A milestone marked **Gate** needs the owner's sign-off before the next one starts.

Why this order: the shot has to feel good on one hand-built course before anything is generated. Generation multiplies whatever is already there, good or bad.

## Target folder layout

```
src/
  sim/        game rules and physics. No browser, no Phaser. Runs in Node.
  gen/        course and run-map generators, validator bot. Depends on sim only.
  content/    definitions and tuning numbers: tiles, enemies, abilities, gear, biomes, chunks.
  render/     Phaser scenes that draw the sim state. Reads sim, never changes it.
  ui/         HUD, menus, shop, map screen.
  input/      turns mouse and keyboard into shot commands.
  save/       local storage, versioned.
assets/       sprites, manifest, LICENSES.md
tools/        placeholder art script, seed viewer, headless playtest runner
tests/
docs/
```

---

## Milestone 0 — Project setup

- [x] Vite + TypeScript project, strict mode
- [x] Phaser installed at its latest stable version, pinned exactly
- [x] Vitest and one passing test; type check and lint scripts
- [x] A lint rule or test that fails if anything in `src/sim/` or `src/gen/` imports from Phaser, `src/render/`, `src/ui/`, or uses `Math.random`
- [x] Seeded random number generator in `src/sim/rng.ts` with tests
- [x] GitHub Actions: run tests on every push; deploy `main` to GitHub Pages
- [x] `README.md` with how to run locally and the link to the live game

**Done when:** the live link shows a blank game canvas at 384×216 scaled up with sharp pixels, and CI is green.

## Milestone 1 — Course format and isometric display

- [x] Course data format (see DESIGN.md section 4 and 11) with a schema check that rejects bad files
- [x] Tile and surface definitions in `src/content/`
- [x] Placeholder art script that outputs tiles (flat, four slopes, corner slopes, faces) and a ball
- [x] Asset manifest; all sprites looked up by ID
- [x] Isometric renderer: correct draw order with height, vertical faces, camera pan
- [x] Two hand-written test courses: one flat with walls, one with slopes, ledges and each surface type
- [x] Debug overlay toggle: grid coordinates, tile heights, surface names

**Done when:** both test courses display correctly from data files, and a screenshot of each has been checked for draw-order mistakes.

## Milestone 2 — The shot **(Gate)**

- [x] Ball physics as in DESIGN.md section 5: rolling, slopes, friction per surface, walls, airborne flight, bouncing, rest detection
- [x] Water and out-of-bounds return the ball to its last resting spot
- [x] Aim direction, ground and lofted shots, power meter, topspin, backspin, side curve
- [x] Aim guide line computed by running the real simulation ahead, so it always matches
- [x] Bounce boost on landing
- [x] All tuning numbers in one file, plus an on-screen tuning panel (debug only) to change them live
- [x] Unit tests: ball rests on flat ground, rolls down a slope, bounces off a wall at the mirrored angle, same inputs give the same final position every time
- [x] Alternative power input (drag distance) behind a toggle so the owner can compare

**Done when:** the owner has played both test courses and says the shot feels good. Expect several rounds of tuning. Record the chosen tuning values and the power-input choice in DESIGN.md.

## Milestone 3 — Course rules

- [ ] Stat sheet and modifier system (FEATURES.md section 1), with tests
- [ ] Playable character as a data entry (FEATURES.md section 3)
- [ ] Shots pool and health pool, with the recover turn at zero shots
- [ ] Pickups: yellow star, heart, shot orb (FEATURES.md section 13)
- [ ] Static blockers (FEATURES.md section 6)
- [ ] Simple stationary enemy that is defeated when hit and drops yellow stars
- [ ] Star quota meter; exit opens when full; entering the exit completes the course
- [ ] Hazards from the surface table: spikes, bumper, booster, conveyor, spring, warp pair
- [ ] HUD: shots, health, star meter, yellow star total, seed
- [ ] Course complete and run over screens; restart

**Done when:** a test course can be won and lost, and the owner has done both.

## Milestone 4 — Enemies and abilities

- [ ] Turn order from DESIGN.md section 8
- [ ] Damage calculation in the order given in FEATURES.md section 2, including element, position and shield steps even though the starter enemies do not use them yet
- [ ] Full enemy template from FEATURES.md section 4 (tier, traits, element, gear fields present, mostly unused)
- [ ] Status effect system and the Stunned status
- [ ] Moving obstacles and destructibles (FEATURES.md section 6)
- [ ] Patroller family: path following in real time, contact effect. Build one type.
- [ ] Sentinel family: outer and inner radius, three triggers, immediate or activated response per trigger. Build two types: one ranged, one that chases.
- [ ] Radii visible in the debug overlay; a subtle in-game cue when the ball is about to pass through one
- [ ] Ability slot, pickup from ability-carrying enemies, activation key
- [ ] Three abilities: Anchor, Burner, Hop
- [ ] Enemy and ability definitions fully in `src/content/`; adding a fourth enemy must need no logic changes
- [ ] Tests for each trigger and each response mode

**Done when:** a hand-built course with all three enemy types and all three abilities plays correctly, and the owner has tried each trigger on purpose.

## Milestone 5 — Course generator **(Gate)**

- [ ] Chunk format and a first set of at least twelve chunks
- [ ] Generator: seed and difficulty budget in, course data out
- [ ] Enemy placement in squads that spends the budget (FEATURES.md section 4). Squad themes can be switched on in Milestone 8.
- [ ] Obstacle and hazard placement that spends the budget
- [ ] Structure validator
- [ ] Bot validator that plays the course in the simulation with no display
- [ ] Reject-and-retry loop with a cap, and a logged count of rejections
- [ ] Seed viewer tool: type a seed and budget, see the course, see whether it passed
- [ ] Batch test: generate 500 courses, report pass rate, average generation time, and a contact sheet of screenshots

**Done when:** at least 95% of generated courses pass on the first try, generation takes under one second each, and the owner has played ten generated courses and judged them worth playing.

## Milestone 6 — The run

- [ ] Branching map generator with node types: Course, Hard course, Shop, Cache, Boss
- [ ] Map rules: shops not guaranteed, forced course-only stretches possible, every path reaches a boss
- [ ] Boss countdown, early boss choice, forced boss at zero (boss is a stand-in hard course until Milestone 7)
- [ ] Map screen
- [ ] Gear: three categories, one of each, automatic swap on pickup, dropped item stays on the ground (FEATURES.md section 8)
- [ ] The six starter gear items and five starter run upgrades
- [ ] Shop: five random offers, reroll, services (FEATURES.md section 11)
- [ ] Difficulty budget rises along the run
- [ ] One seed drives the whole run

**Done when:** the owner can play a full run from the first node to the stand-in boss, with shop visits and path choices.

## Milestone 7 — Boss and permanent progress

- [ ] Boss template and the first boss, The Warden (FEATURES.md section 5)
- [ ] Blue stars: sources and wallet
- [ ] Hub screen between runs with the levelled list and the starting-ability unlock (FEATURES.md section 10)
- [ ] Death flow: lose run items, keep permanent upgrades and blue stars
- [ ] Save and load with a version number and a safe fallback if the save is unreadable
- [ ] Region two starts after the boss with a higher budget

**Done when:** the owner can die, buy a permanent upgrade, start again, and see the upgrade applied; and can beat the boss.

## Milestone 8 — Content and balance

- [ ] Remaining abilities from DESIGN.md section 9
- [ ] Enemy tiers 3 and 4, traits, elements, weak spots, squad themes, enemy gear and its drop chance
- [ ] Remaining statuses: Poisoned, Burning, Chilled
- [ ] More enemy types in both families; a second and third boss, one with a gimmick
- [ ] Linked objects (switches, gates, bridges); optional course modifiers
- [ ] Second gear slot unlocks; extra characters
- [ ] Three biomes with their own chunk sets
- [ ] More gear and shop variety
- [ ] Balance pass using the headless bot across many seeds: completion rate per region, stars earned, health lost
- [ ] Resolve the remaining open questions with the owner

**Done when:** three regions and a final boss are playable and the owner judges the difficulty curve fair.

## Milestone 9 — Skin, sound and sharing

- [ ] Theme, character and title chosen with the owner
- [ ] Final pixel art replaces placeholders through the manifest only
- [ ] Sound effects and music, original or correctly licensed
- [ ] Title screen, settings, a short tutorial course, controls help
- [ ] Playtest with a few friends; fix what confuses them

**Done when:** someone who has never seen the game can open the link and play a run without help.

## Later, not planned in detail

Controller support; desktop packaging; open-world mode; endless mode; daily seed.

---

## Progress log

- 2026-11-14 — Design and plan written. No code yet.
- 2026-11-14 — Features file added; plan checklists updated to reference it.
- 2026-11-14 — Milestone 0 built on branch `milestone-0-project-setup`: Vite 8 + TypeScript (strict), Phaser 4.2.1 pinned, Vitest, ESLint purity rules for `src/sim/` and `src/gen/` (with tests proving they fire), seeded RNG (SFC32) in `src/sim/rng.ts`, CI and Pages deploy workflows, README. TypeScript is pinned to 6.0.3, not 7.x, because the lint tooling (typescript-eslint) does not support 7 yet. Live link and green CI not yet confirmed: needs the branch merged to `main` and Pages source set to GitHub Actions.
- 2026-11-14 — Milestone 0 done: merged to `main`, CI green, owner confirmed the live link shows the blank canvas.
- 2026-11-14 — Milestone 1 built on branch `milestone-1-course-display`: course file format with a schema check (`src/sim/course.ts`), tile geometry limited to 13 shapes (`src/sim/tileShape.ts`), surface definitions (`src/content/surfaces.ts`), placeholder art script (`npm run art`) writing 26 sprites and `assets/manifest.json`, isometric renderer with faces and back-to-front draw order (`src/render/iso.ts`), camera pan, debug overlay (G key) with hover info, and two test courses. Both courses screenshotted and checked for draw-order mistakes. Waiting for the owner to look at both courses.
- 2026-11-14 — Milestone 1 done: merged to `main` (pull request 2), CI and deploy green, owner checked both courses on the live link and said they look good.
- 2026-11-14 — Milestone 2 built on branch `milestone-2-the-shot`: ball physics in `src/sim/ball.ts` (fixed 1/120 s step; rolling, slopes, per-surface friction, walls that mirror the ball's speed, flight, bouncing, rest detection, water and out of bounds), ground and lofted shots with power meter, topspin/backspin and side curve, aim guide drawn from the real simulation, bounce boost (Space), every tuning number in `src/content/tuning.ts` with a live tuning panel (U key) that remembers changes in the browser, and drag-power mode behind the P key. 21 new tests. Both courses played in a browser and screenshots checked. **Gate:** waiting for the owner to play both courses, say whether the shot feels good, and pick meter or drag power. Chosen tuning values then go into DESIGN.md.
