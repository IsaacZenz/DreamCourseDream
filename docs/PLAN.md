# Build plan

Milestones are in build order. Each one ends with something the owner can open in a browser and play. Do them in order. A milestone marked **Gate** needs the owner's sign-off before the next one starts.

**Plan before building (owner, 2026-11-14).** Every milestone that adds content or a larger system (characters, enemies, obstacles, abilities, gear, bosses, upgrades, shops, chunks) starts with a **design sheet** in `docs/plans/milestone-N.md`: a list of every item to be built, each with its template fields from FEATURES.md filled in, the numbers it starts with, and how it behaves in each case. The owner reviews it, changes what they want, and signs it off. Nothing on the sheet is built before that sign-off. This is the first checklist item of those milestones, marked **Plan gate**.

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

- [x] **Gate signed off by the owner (2026-11-14).** Final values are the defaults in `src/content/tuning.ts`; power input is the two-phase shot (DESIGN.md section 5).

## Milestone 3 — Course rules

- [x] Stat sheet and modifier system (FEATURES.md section 1), with tests
- [x] Playable character as a data entry (FEATURES.md section 3)
- [x] Shots pool and health pool, with the recover turn at zero shots
- [x] Pickups: yellow star, heart, shot orb (FEATURES.md section 13)
- [x] Static blockers (FEATURES.md section 6)
- [x] Simple stationary enemy that is defeated when hit and drops yellow stars
- [x] Star quota meter; exit opens when full; entering the exit completes the course
- [x] Hazards from the surface table: spikes, bumper, booster, conveyor, spring, warp pair
- [x] HUD: shots, health, star meter, yellow star total, seed
- [x] Course complete and run over screens; restart

**Done when:** a test course can be won and lost, and the owner has done both.

## Milestone 4 — Enemies and abilities

- [x] **Plan gate:** design sheet for the enemies (Trundler, Spitter, Lunger, ability carriers), the three abilities, the Stunned status, the moving obstacles and destructibles, the flag pole and the thunder cloud. Owner signs it off before any of them is built.
- [x] Turn order from DESIGN.md section 8
- [x] Damage calculation in the order given in FEATURES.md section 2, including element, position and shield steps even though the starter enemies do not use them yet
- [x] Full enemy template from FEATURES.md section 4 (tier, traits, element, gear fields present, mostly unused)
- [x] Status effect system and the Stunned status
- [x] Moving obstacles and destructibles (FEATURES.md section 6)
- [x] Flag pole left by a defeated enemy: bounce off when slow, push past and lose most speed when fast (FEATURES.md section 6, owner decision 2026-11-14)
- [x] Thunder cloud obstacle, stationary or drifting, cannot be beaten: rolling under it zaps the ball (damage, thrown in a random direction); hopping over is safe (FEATURES.md section 6, owner decision 2026-11-14)
- [x] Patroller family: path following in real time, contact effect. Build one type.
- [x] Sentinel family: outer and inner radius, three triggers, immediate or activated response per trigger. Build two types: one ranged, one that chases.
- [x] Radii visible in the debug overlay; a subtle in-game cue when the ball is about to pass through one
- [x] Ability slot, pickup from ability-carrying enemies, activation key
- [x] Four abilities: Anchor, Burner, Hop, Tornado (Tornado added by the owner, 2026-11-14)
- [x] Keyboard-only controls for every mechanic; mouse optional (owner, 2026-11-14)
- [x] Enemy and ability definitions fully in `src/content/`; adding a fourth enemy must need no logic changes
- [x] Tests for each trigger and each response mode

**Done when:** a hand-built course with all three enemy types and all three abilities plays correctly, and the owner has tried each trigger on purpose.

## Milestone 5 — Course generator **(Gate)**

- [x] **Plan gate:** design sheet for the first chunk set, the difficulty budget costs, and how enemies, obstacles and hazards are placed. Owner signs it off before the generator is built.
- [x] Chunk format and a first set of at least twelve chunks
- [x] Generator: seed and difficulty budget in, course data out
- [x] Enemy placement in squads that spends the budget (FEATURES.md section 4). Squad themes can be switched on in Milestone 8.
- [x] Obstacle and hazard placement that spends the budget
- [x] Structure validator
- [x] Bot validator that plays the course in the simulation with no display
- [x] Reject-and-retry loop with a cap, and a logged count of rejections
- [x] Seed viewer tool: type a seed and budget, see the course, see whether it passed
- [x] Batch test: generate 500 courses, report pass rate, average generation time, and a contact sheet of screenshots

**Done when:** at least 95% of generated courses pass on the first try, generation takes under one second each, and the owner has played ten generated courses and judged them worth playing.

### Milestone 5b — Rework: journeys, rails, gentle slopes, water (owner, 2026-11-15)

After playing the first generator, the owner asked for larger, more open, much more sloped courses that feel like a journey, a guard rail, and new water rules. The Milestone 5 gate moves to the end of this rework.

- [x] **Plan gate:** design sheet `docs/plans/milestone-5b.md`. Owner signs it off before anything on it is built.
- [x] Height step halved; course format 3 (base-36 heights); old files load with doubled heights; art regenerated
- [x] Guard rail: course format, physics for the ball and rolling enemies, rail boost, path and Mole rules, sprite
- [x] Water: no reset, 1 damage for stopping in it, weaker shots from inside, skipping; lowered water, shimmer, shore, splash
- [x] Checkerboard grass
- [x] Journey generator: areas, landforms, passages, set pieces, edges, placement rising along the trail, scaling to large maps
- [x] Structure check and bot updated (climbing rule, gaps, shot limits)
- [x] Overview key, areas debug view, loading screen with an animation while a course is made
- [x] Batch test of 500 across budgets 8, 12, 20 and 30

**Done when:** the Milestone 5 targets hold (95% pass on the first try; time per the sheet), and the owner has played ten generated courses and judged them worth playing.

## Milestone 6 — The run

- [x] **Plan gate:** design sheet for the map node types and rules, the starter gear, the run upgrades, the shop and its prices. Owner signs it off before any of them is built.
- [x] Branching map generator with node types: Course, Hard course, Shop, Cache, Boss
- [x] Map rules: shops not guaranteed, forced course-only stretches possible, every path reaches a boss
- [x] Boss countdown, early boss choice, forced boss at zero (boss is a stand-in hard course until Milestone 7)
- [x] Map screen
- [x] Gear: three categories (weapon, armour, bauble), one of each, automatic swap on pickup, dropped item stays on the ground (FEATURES.md section 8)
- [x] The 54 gear items (owner, 2026-11-15: six rarities, three per rarity per category) and five starter run upgrades
- [x] Shop: five random offers, reroll, services (FEATURES.md section 11)
- [x] Difficulty budget rises along the run
- [x] Towns and the Burrow (owner, 2026-11-15): a shop node is a town with the shop and the Burrow; the Burrow stores one gear item per category, safe from death, saved in the browser
- [x] One seed drives the whole run

**Done when:** the owner can play a full run from the first node to the stand-in boss, with shop visits and path choices.

## Milestone 7 — Boss and permanent progress

- [x] **Plan gate:** design sheet for The Warden (phases, attacks, summons, arena), blue star sources, the hub screen and the permanent upgrades. Owner signs it off before any of them is built.
- [x] Boss template and the first boss, The Warden (FEATURES.md section 5)
- [x] Blue stars: sources and wallet
- [x] Hub screen between runs with the levelled list and the starting-ability unlock (FEATURES.md section 10)
- [x] Death flow: lose run items, keep permanent upgrades and blue stars
- [x] Save and load with a version number and a safe fallback if the save is unreadable
- [x] Owner, 2026-11-15: a town is the save point for a run in progress. Leaving the game at a town and coming back carries on from there; death still starts over
- [x] Region two starts after the boss with a higher budget
- [x] Owner, 2026-11-17: success rolls (wheel), Knack, acorns, twelve slice-perk gear items; blue star deposit; one home (the Burrow); five themed arenas; size and toughness scaled separately per region

**Done when:** the owner can die, buy a permanent upgrade, start again, and see the upgrade applied; and can beat the boss.

## Milestone 8 — Content and balance

- [ ] **Plan gate:** design sheet for every new ability, enemy, trait, status, boss, linked object, biome, gear item and character in this milestone. (Round 1 sheet `docs/plans/milestone-8.md` signed off 2026-11-19. Owner, 2026-11-21: round 2 split into 2a (terrain, shops, food; sheet `docs/plans/milestone-8-round-2a.md`, signed off 2026-11-21) and 2b (abilities, linked objects, course modifiers, biomes and themes; sheet `docs/plans/milestone-8-round-2b.md`, signed off 2026-11-21); round 3 sheet `docs/plans/milestone-8-round-3.md` signed off 2026-11-22 with pockets at 17 and characters at 21 blue stars.) Owner signs it off before any of them is built. This milestone is large; it may be planned and built in several rounds, each with its own sheet.
- [x] Owner, 2026-11-21 (round 2a): a food shop and a gear shop in each town; a 3-slot bag for consumables, any number eaten before a course, none during; food lasts 1 to 3 courses (FEATURES.md section 11); the food shop sells the acorns and the existing boosts and services renamed as food (Apple heals 2, Garlic delays the boss; table in FEATURES.md section 11); the gear shop sells gear only
- [x] Owner, 2026-11-21 (round 2a): a detail dial per region (terrain features and scenery per 100 tiles, region one unchanged); bridges over water, sand or spikes; dead trees; more spikes in region three
- [x] Owner, 2026-11-21 (after round 2b; small changes, "round 2c"): the exit of a boss arena sits under the boss's starting spot; a wind vane on the HUD (and a strength gauge if wind strength varies); spiked tops on gates (closed gate: landing on or clipping its top hurts; open gate: no damage); a few more low-risk obstacles in region 1; endless mode starts with its own theme, then a random theme each region (repeats allowed). **Owner answers, 2026-11-21:** wind strength varies (light 1.0, medium 1.5, strong 2.2; cost 1, 2, 3) with a vane and a 1-3 bar gauge; spiked tops on both kinds of gate; region 1 gets about 4-8 extra rocks, stumps and low walls; endless mode's own theme is a new **Starfall** theme (deep purple sky); fireflies added now as scenery
- [x] Remaining abilities from DESIGN.md section 9 (round 1 built Frost and Static; round 2b built Burr, Kite, Gyre and Drift)
- [x] Enemy tiers 3 and 4, traits, elements, weak spots, squad themes, enemy gear and its drop chance (round 1)
- [x] Remaining statuses: Poisoned, Burning, Chilled (round 1)
- [x] More enemy types in both families; a second and third boss, one with a gimmick (round 1: five new bugs, Gloamhorn, the Brood Queen)
- [x] Linked objects (switches, gates, bridges); optional course modifiers (round 2b)
- [x] Second gear slot unlocks; extra characters (round 3: three second pockets at 17 blue stars; Thud and Pip at 21)
- [x] Three biomes (round 2b: Meadow, Bog, Thornwood; landform preferences and detail weights, as the generator no longer uses chunks)
- [x] Theme switch after each boss (day, night, jungle, underground, spooky): same objects, different art set through the manifest (owner, 2026-11-14; round 2b: day, bog, thornwood, night, underground, spooky)
- [x] More gear and shop variety (round 3: the Needle poison family; Sale, Grab Bag, Chef's Special)
- [x] Balance pass using the headless bot across many seeds: completion rate per region, stars earned, health lost (round 3: `npm run balance`, report `docs/plans/balance-report.md`; owner approved P1 to P5, 2026-11-23)
- [x] Resolve the remaining open questions with the owner (2026-11-22: every remaining default kept)
- [x] Owner, 2026-11-19: boss introduction cutscene pop-ups (placeholder cards built in round 1; art in Milestone 9)
- [x] Owner, 2026-11-19: the map shows only the path taken and the next 1 to 3 choices, with a testing switch to show the whole map (round 3)
- [x] Owner, 2026-11-18: endless mode after the third region: each new region scales the same way, bosses from the boss randomizer (round 1)

**Done when:** three regions and a final boss are playable and the owner judges the difficulty curve fair.

## Milestone 8b — Walkable towns and crossroads (owner, 2026-11-21)

- [x] **Plan gate:** design sheet `docs/plans/milestone-8b.md` (controls, camera zoom, layouts, what you can walk into, the flat Burrow and shop screens, how the crossroads replaces the map screen). Owner signs it off before building.
- [x] Walk the armadillo around a zoomed-in isometric town and crossroads with W A S D or the arrow keys
- [x] The crossroads shows the next 1 to 3 courses as paths to walk into (replaces picking on the map screen; the whole map stays as a testing view)
- [x] The Burrow, the food shop and the gear shop open as flat 2D illustrated screens
- [x] Owner, 2026-11-21: first version also has the boss gate (walk up to it; the introduction card plays) and a practice green in town. Later: the walkable hub between runs, a rare hidden path, townsfolk with tips
- [x] Order (owner, 2026-11-21): after Milestone 8 round 2, so the towns can use round 2's props and scenery

**Done when:** the owner can play a run moving between courses only by walking.

## Milestone 8c — Art pipeline (owner, 2026-11-23)

The owner draws the art; a tool turns photos of the drawings into sprites in one consistent style, usable from the phone. Tool only: no rules or content change.

- [x] **Plan gate:** design sheet `docs/plans/art-pipeline.md` (Art List with permanent codes, style guide and palette, sprite source format, Pixel Press tool, drawing sheets, phone workflow, pilot). Owner signs it off before building. (Signed off 2026-11-23, all defaults except Q4: everything drawn freehand in a sketchbook, Claude renders small items down.)
- [ ] Style guide and palette approved by the owner (written: `art/STYLE.md`, `art/palette.json`, swatch `art/list/palette.png`; waiting for the owner's look, and the ground-contrast rule)
- [x] Art List generated from the manifest, with permanent codes (`npm run art:list`: 232 codes in `art/codes.json`, `art/ART-LIST.md`)
- [x] Pixel Press: sprite sources to PNG and manifest, mirroring, character and theme recolours, style check, placeholders never overwrite approved art (`npm run art:press`, `npm run art:preview`, `tests/art.test.ts`)
- [x] Contact sheets of every placeholder with its code (replaces printed drawing sheets: the owner draws freehand in a sketchbook) (`art/list/<letter>.png`)
- [ ] Pilot: three owner drawings taken through the whole loop from the phone (also settles how photos arrive, and whether a photo clean-up tool is worth building)
- [ ] Tile swatches wrapped onto every slope shape

**Done when:** the owner can send a photo of a drawing from the phone and see it in the game, in style, the same day.

## Milestone 9 — Skin, sound and sharing

- [ ] Theme, character and title chosen with the owner
- [ ] Final pixel art replaces placeholders through the manifest only
- [ ] Several art variants per theme for each larger advancement (owner, 2026-11-14)
- [ ] Sound effects and music, original or correctly licensed
- [ ] An animation and a sound for most actions (owner, 2026-11-14), including a slot-machine wheel for the Wild pickup
- [ ] Owner, 2026-11-19: the armadillo's poses: stands when resting, curls into a ball for your shot, stands up on rest; when knocked outside your shot, a hurt pose and knocked onto its back like a tortoise, then flips up (FEATURES.md section 3)
- [ ] Owner, 2026-11-19: the shop as a food stand with an animated shopkeeper (FEATURES.md section 11)
- [ ] Owner, 2026-11-19: boss cutscene art for the three main bosses and the endless boss pop-up (FEATURES.md section 5)
- [ ] Title screen, settings, a short tutorial course, controls help
- [ ] Owner, 2026-11-21: lighting: fireflies (a small cluster of flickering light pixels), ground-level lights and tall lights (on poles or in trees), and dynamic shadows cast by them; a settings menu that can turn lighting and shadows off for performance
- [ ] Playtest with a few friends; fix what confuses them

**Done when:** someone who has never seen the game can open the link and play a run without help.

## Later, not planned in detail

Controller support; desktop packaging; open-world mode; daily seed. (Endless mode moved into Milestone 8 by the owner, 2026-11-18.)

---

## Progress log

- 2026-11-14 — Design and plan written. No code yet.
- 2026-11-14 — Features file added; plan checklists updated to reference it.
- 2026-11-14 — Milestone 0 built on branch `milestone-0-project-setup`: Vite 8 + TypeScript (strict), Phaser 4.2.1 pinned, Vitest, ESLint purity rules for `src/sim/` and `src/gen/` (with tests proving they fire), seeded RNG (SFC32) in `src/sim/rng.ts`, CI and Pages deploy workflows, README. TypeScript is pinned to 6.0.3, not 7.x, because the lint tooling (typescript-eslint) does not support 7 yet. Live link and green CI not yet confirmed: needs the branch merged to `main` and Pages source set to GitHub Actions.
- 2026-11-14 — Milestone 0 done: merged to `main`, CI green, owner confirmed the live link shows the blank canvas.
- 2026-11-14 — Milestone 1 built on branch `milestone-1-course-display`: course file format with a schema check (`src/sim/course.ts`), tile geometry limited to 13 shapes (`src/sim/tileShape.ts`), surface definitions (`src/content/surfaces.ts`), placeholder art script (`npm run art`) writing 26 sprites and `assets/manifest.json`, isometric renderer with faces and back-to-front draw order (`src/render/iso.ts`), camera pan, debug overlay (G key) with hover info, and two test courses. Both courses screenshotted and checked for draw-order mistakes. Waiting for the owner to look at both courses.
- 2026-11-14 — Milestone 1 done: merged to `main` (pull request 2), CI and deploy green, owner checked both courses on the live link and said they look good.
- 2026-11-14 — Milestone 2 built on branch `milestone-2-the-shot`: ball physics in `src/sim/ball.ts` (fixed 1/120 s step; rolling, slopes, per-surface friction, walls that mirror the ball's speed, flight, bouncing, rest detection, water and out of bounds), ground and lofted shots with power meter, topspin/backspin and side curve, aim guide drawn from the real simulation, bounce boost (Space), every tuning number in `src/content/tuning.ts` with a live tuning panel (U key) that remembers changes in the browser, and drag-power mode behind the P key. 21 new tests. Both courses played in a browser and screenshots checked. **Gate:** waiting for the owner to play both courses, say whether the shot feels good, and pick meter or drag power. Chosen tuning values then go into DESIGN.md.
- 2026-11-14 — Owner tuning round 1: shot speed across the whole bar raised 20%; new perfect shot (release in the top 3% of the meter) launches 35% faster than the old top. Owner chose the meter for the real game; drag mode stays as a testing aid with the same rules. Recorded in DESIGN.md section 5.
- 2026-11-14 — Owner tuning round 2 (values from the tuning panel): perfect window narrowed to the top 2%, meter sweep sped up to 1.5 s, bumper bounce raised to 1. Recorded in DESIGN.md section 5.
- 2026-11-14 — Owner tuning round 3: bounce raised 10% on every surface except bumper (kept at 1 so bounces cannot grow forever). Gravity unchanged.
- 2026-11-14 — Two-phase shot (owner design): pull back to plan direction and a preview path, then hold to charge a meter that goes up, down, up, down; release to shoot, or the ball launches on its own at 5% when the meter runs out. Drag-to-fire kept as a testing-only "quick shot" (P). Recorded in DESIGN.md section 5.
- 2026-11-14 — Owner tuning round 4: automatic launch when the meter runs out raised from 5% to 10% power.
- 2026-11-14 — Water reworked (owner design): see-through, slows the ball hard, and only resets the ball if it stops in it; the ball can roll or bounce out. Water may be sloped. New water bed and see-through surface placeholder sprites. 4 new tests.
- 2026-11-14 — Milestone 2 done: owner played both courses through four tuning rounds, the two-phase shot and the water rework, and signed off the gate. Merged to `main` (pull request 3).
- 2026-11-14 — Milestone 3 built on branch `milestone-3-course-rules`: stat sheet and modifier system (`src/sim/stats.ts`, stat limits in `src/content/stats.ts`); the playable character Rollo as data (`src/content/characters.ts`); shots and health pools with a recover turn; pickups, static blockers (rock, post, low wall) and the Mossback enemy as content entries (`src/content/objects.ts`) placed through a new optional `objects` list in course files; hazard tiles in the ball physics (booster, conveyor, spring, spikes, warp; bumper already worked); star quota meter, opening exit and course completion; course rules in `src/sim/play.ts`; HUD with health, shots, star meter, stars held and seed; course complete and run over screens with restart. New test course "course rules" (key 1). 33 new tests (140 in total). In a browser: won the test course in 3 shots and lost it by sinking 5 times; screenshots checked. Defaults chosen are listed in DESIGN.md section 7, "As built in Milestone 3". **Waiting for the owner** to win and lose the test course.
- 2026-11-14 — Owner decision: a defeated enemy leaves a golf flag pole where it died. Slow balls bounce off it; fast balls push past and lose most of their speed. Recorded in FEATURES.md section 6 and added to Milestone 4.
- 2026-11-14 — Owner decision: a thunder cloud obstacle. Rolling under it zaps the ball (damage, thrown in a random direction); hopping over it is safe. Recorded in FEATURES.md section 6 and added to Milestone 4.
- 2026-11-14 — Owner decision: the thunder cloud cannot be beaten (an obstacle, not an enemy), and a cloud can be stationary or drift.
- 2026-11-14 — Milestone 3 done: owner won and lost the test course (on the artifact test build) and signed it off.
- 2026-11-14 — Owner decision: plan before building. Content milestones (4 to 8) now start with a design sheet the owner signs off; see the note at the top of this file.
- 2026-11-14 — Milestone 4 design sheet written on branch `milestone-4-enemies-abilities`: `docs/plans/milestone-4.md`. Seven questions for the owner, each with a default. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-14 — Milestone 4 design sheet signed off by the owner (`docs/plans/milestone-4.md`). Owner additions during review: Mole enemy, Tornado ability and Whirlback, secured crate and Wild pickup, tree stump replacing the post, lowered flags, 0.5 s damage immunity, knock-backs, keyboard-only controls; themes per boss recorded for later.
- 2026-11-14 — Milestone 4 built on branch `milestone-4-enemies-abilities`. World clock: `tick` in `src/sim/play.ts` runs the whole course in fixed 1/120 s steps, also while aiming. Turn order with enemy turns run as timed actions; damage steps in `src/sim/damage.ts`; full enemy template; status system with Stunned (`src/content/statuses.ts`); abilities Anchor, Burner, Hop, Tornado (`src/content/abilities.ts`); enemies Trundler, Spitter, Lunger, Mole and four carriers; sliding block, gate, crate, secured crate with Wild, cracked tile, tree stump, flag poles with secured stars that enemies can knock down, thunder clouds; 0.5 s damage immunity; knock-backs; course format 2 (`path`, `facing`, `phase`, `orient`, `drops`). Ball physics extended for rolling enemies, seeds and ability modes. Keyboard-only controls; camera pan moved to IJKL. New placeholder sprites. Test course 4 "Enemies and abilities". 63 new tests (203 in total). Played with the keyboard in a browser and screenshots checked. Test build published as a private artifact (opens on course 4; the address may also pick a course with `#<course id>`). One number differs from the sheet: Hop launches at 7 tiles/s (not 6.7) so it really reaches 1.1 tiles with air drag. **Waiting for the owner** to play the test course and try each trigger on purpose.
- 2026-11-14 — Owner feedback on the first test build: the Mole hurt the ball the moment it was rolled over. Now the hill rumbles for 0.5 s, then the Mole shoots up into the air (7 up, 4 sideways), and it cannot touch the ball for its first 0.3 s. Recorded in FEATURES.md and the design sheet. Owner request: a test bench (course 5, key 5): a blank course with one thing at the centre, chosen in the U panel along with a starting ability, so each enemy, obstacle and ability can be tried alone (`src/content/courses/testBench.ts`). 6 new tests (209 in total).
- 2026-11-14 — Owner decision: the ball damages enemies only during the player's own shot. A Trundler running into a standing ball hurts the ball but takes no damage; a knocked ball does no damage to anything it rolls into. 1 new test (210 in total).
- 2026-11-14 — Owner tuning: the Mole jumps faster (10 up, 6 sideways) after a shorter rumble (0.3 s); grace 0.15 s, so rolling over it still does not guarantee a hit.
- 2026-11-14 — Milestone 4 done: owner played the test build and the test bench, tuned the Mole, and approved. Owner decision recorded in DESIGN.md: keep fine-tuning and adding content easy. Merged to `main`.
- 2026-11-15 — Milestone 5 design sheet written on branch `milestone-5-course-generator`: `docs/plans/milestone-5.md` (14 chunks, budget presets and costs, squad placement, structure and bot validators, seed viewer). Eight questions for the owner, each with a default. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-15 — Milestone 5 design sheet signed off by the owner: defaults for all questions except 7 (after a win, the next generated course's budget rises by a random 0 to 4). Recorded in the sheet and FEATURES.md section 14.
- 2026-11-15 — Milestone 5 built on branch `milestone-5-course-generator`: 14 chunks (`src/content/chunks/`), generator numbers in `src/content/gen.ts`, hazard costs in `surfaces.ts`; `src/gen/` has chunk reading and turning, layout (route, branches, heights, rims), budget spending with squads, the structure check, the bot and the retry loop; `clonePlay` in `src/sim/play.ts`. In the game: key 6 (or `?course=generated&seed=&budget=`), [ and ] for the budget, V seed viewer, B to watch the bot, a "chunks" debug view, and Enter after a win raises the budget by a random 0 to 4 (owner). Tools: `npm run gen`, `npm run gen:batch`. 23 new tests (233 in total). Batch of 500 (budgets 8, 12, 20): **95.0% pass on the first try, 100% overall, average 367 ms, median 156 ms; 91.8% under one second** (budget 20 averages 810 ms, slowest 4.9 s). Differences from the sheet are listed in its "As built" section. **Gate:** waiting for the owner to play ten generated courses and judge them worth playing.
- 2026-11-15 — Milestone 5 test build published as a private artifact. It opens on a generated course; `#<course id>` in the address picks another course.
- 2026-11-15 — Owner playtest of the generator: courses too small and flat. Owner decisions recorded in DESIGN.md and FEATURES.md: courses as journeys, guard rail, height step halved, new water rules (no reset, 1 damage, skipping), rail boost, 45° rails, checkerboard grass, much larger maps. Milestone 5b design sheet written: `docs/plans/milestone-5b.md`. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-15 — Milestone 5b design sheet signed off: shots from water at half power, damage every time a shot ends under water, generation up to 5 seconds on large courses with a loading animation, defaults for the rest.
- 2026-11-15 — Milestone 5b built on branch `milestone-5-course-generator`: height step halved (format 3, base-36 heights; tiles rise one step gentle or two steep; old files load with doubled heights); guard rails (course format, physics for the ball and rolling enemies, rail boost, path and Mole rules, test bench option); water (no reset, 1 damage for stopping in it, half-power shots from inside, skipping; shimmer, deeper tint, shore foam, splashes); checkerboard grass; the journey generator (areas with eight landforms, five passage kinds, set pieces, rails, rims and bare edges, side pockets, enemies busier towards the end) replacing the chunk system; a route-finding bot; generation in a worker behind a loading screen; overview (O); areas debug view. 244 tests. Batch of 500 (budgets 8, 12, 20, 30): **100% pass overall; first try 68% (budget 8: 93%, 12: 84%, 20: 58%, 30: 39%); average 2.5 s (budget 8: 0.4 s, 12: 0.8 s, 20: 2.6 s, 30: 6.1 s)**. Budgets 8 and 12 meet their time target; budget 30 is over the 5-second limit, and the 95% first-try target is not met above budget 12 (most rejections are the bot getting stuck on big courses). The bot's give-up rule was then loosened from 6 to 10 stalled shots (a 30-course check at budget 20: first try 70% to 77%). Differences from the sheet are in its "As built" section. **Gate:** waiting for the owner to play ten generated courses and judge them worth playing.
- 2026-11-15 — Milestone 5b test build published to the same private artifact link. It opens on a generated course.
- 2026-11-15 — Owner decisions, built the same day: spin and curve go back to none at the start of each turn (and each course); defeating an enemy gives back 1 shot, 1 per enemy when several fall to one shot, never above the shot allowance. Recorded in DESIGN.md sections 5 and 6. 2 new tests (246 in total).
- 2026-11-15 — Owner decisions, built the same day: each damaging hit on an enemy gives back 1 shot (replacing "each defeat"); two naps (recover turns) per course, and running out of shots a third time fails the course. The shots panel shows the naps left. Effect on generation (32-course check): budgets 8 and 12 unchanged, budget 20 first try 3/8, budget 30 first try 1/8 and about 21 s on average, because big journeys now run out of shots. Waiting for the owner to choose how to balance big courses.
- 2026-11-15 — Owner: leave big courses as they are for now and test the feel; the hero's upgrades during a run (Milestones 6 and 7) are meant to keep up with the scaling difficulty. Recorded in DESIGN.md section 6. When the run exists, the generator's bot should play with the upgrades the player would have at that point.
- 2026-11-15 — Owner decision, built the same day: falling off the edge loses the held ability (water does not). 2 new tests (250 in total). Owner planning notes for Milestone 9 recorded in DESIGN.md open question 9 and FEATURES.md section 3: the hero is a two-legged armadillo that curls into a ball when launched and pops out when it stops; villain theme to choose between reptiles and amphibians (alligator boss) or insects.
- 2026-11-15 — Milestones 5 and 5b done: the owner approved the generated courses and asked for the merge. Known limits carried forward: first-try pass rate and generation time miss their targets above budget 12, by owner choice for now (run upgrades in Milestones 6 and 7 are meant to keep up with harder courses). Merged to `main`.
- 2026-11-15 — Milestone 6 design sheet written on branch `milestone-6-the-run`: `docs/plans/milestone-6.md` (map shape and node odds, boss countdown and early boss, budget per row, the six gear items, five run upgrades, shop and cache). Seven questions for the owner, each with a default. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-15 — Owner decision: 54 gear items instead of six. Six rarities in three pairs (common/uncommon, rare/double rare, special rare/legendary), three items per rarity per category, families for the first four rarities and unique effects for the top two, rarity odds rising through the run, accessory renamed Bauble. All 54 in Milestone 6. Sheet section 5 rewritten; FEATURES.md section 8 updated.
- 2026-11-15 — Milestone 6 design sheet signed off by the owner. Changes from the defaults: running out of naps still fails the course, which ends the run; run courses capped at budget 30; shops do not lower the boss countdown (so the map has 16 rows and the budget follows counted nodes, not rows). Blue star sources recorded for Milestone 7: beating a course, beating a boss, an extra-rare chance in crates or under cracked ground.
- 2026-11-15 — Owner decision during the build: a shop node is a little town with the shop and the player's Burrow (home base). The Burrow stores one gear item per category, safe from death, saved in the browser now; the town becomes the save point for a run in Milestone 7. Recorded in DESIGN.md section 10, FEATURES.md sections 8 and 11, and the sheet (section 10b).
- 2026-11-15 — Milestone 6 built on branch `milestone-6-the-run`. Simulation: the run rules in `src/sim/run.ts` (countdown, budget per counted node, rewards, shop, cache, Burrow, rarity odds and drop luck), the map generator in `src/gen/runMap.ts`, gear on courses in `src/gen/placeGear.ts`; 54 gear items in `src/content/gear.ts`, run numbers and the five upgrades in `src/content/run.ts`; gear effects, Burning on enemies and the naps stat in `src/sim/play.ts`; the bot plays with the player's loadout. Display: map screen (`MapScene`), town with shop, Burrow and cache (`TownScene`), run mode on courses with gear slots on the HUD and gear lying on the ground, run summary, testing aids in the U panel; placeholder art for the gear (border colour shows rarity), map nodes, upgrades and the town. Key 7 or `?run=<seed>` starts a run. 36 new tests (286 in total). Played in a browser: map, courses, town, shop (buy, reroll, replace prompt), Burrow (store, take out, saved), cache, run summary; screenshots checked. Differences from the sheet in its section 12. **Waiting for the owner** to play a full run from the first node to the stand-in boss.
- 2026-11-15 — Owner changes after the first Milestone 6 build: boss countdown 7 (was 5), map 20 rows; an optional last town is always offered before the forced boss (unless the player has just left a town). The early boss stays. 2 new tests (288 in total). Recorded in DESIGN.md section 10 and open question 1, and the sheet section 2.3.
- 2026-11-15 — Milestone 6 done: the owner played the run build, asked for the countdown of 7 and the last town, and approved. Merged to `main`. Known limits carried forward: the boss is a stand-in hard course, blue stars are counted but not spent, and saving a run at a town come in Milestone 7.
- 2026-11-17 — Milestone 7 design sheet written: `docs/plans/milestone-7.md` (The Warden with three phases, slams and summons; three hand-built arenas; blue star sources and wallet; the Den hub screen with five levelled upgrades and the starting-ability unlock; one versioned save with a safe fallback; the town as the run's save point; death flow; region two). Twelve questions for the owner, each with a default. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-17 — Owner answered the Milestone 7 sheet's twelve questions. Settled: blue star amounts and upgrade prices as listed; closing the game outside a town loses the run and its blue stars (a boss's rewards are kept at once); the Warden is the placeholder boss for every region, picked by a boss randomizer; five themed arenas, never the same one twice in a row; stuns on a boss are 20% with a stun wheel; each starting ability bought separately with a toggle; no refunds; course size and enemy toughness scale separately in every region, with the cap of 30 lifted. Sheet rewritten (sections 2.5, 2.8, 3, 4.2, 5.3, 7.4) with four follow-up questions (section 10c); decisions recorded in DESIGN.md and FEATURES.md. **Waiting for the owner** to confirm the new parts.
- 2026-11-17 — Owner decision: **success rolls.** Every weapon special effect rolls on a 10-slice wheel (more slices filled on better weapons); a 20-slice boss wheel; a new permanent upgrade, Knack, fills one slice per level; a new consumable, the acorn, fills extra slices for one course (crates and shops). Added to the Milestone 7 sheet (section 4b) with four more follow-up questions (E to H); recorded in DESIGN.md section 9 and FEATURES.md sections 5, 8, 10, 11 and 13.
- 2026-11-17 — Owner answered follow-ups B to H: blue stars are carried and only kept once deposited, automatically, at a town or on beating a boss (lost on death); abilities 8 blue stars each; the Den and the Burrow merge into one home, the Burrow; armour does not roll; an acorn lasts one course; slices 2 to 7 by rarity; Knack stays permanent only, and gear gets slice perks for variety (twelve new armour and bauble items, sheet section 4b.6). Two last questions (I, J) on the sheet. **Waiting for the owner's sign-off.**
- 2026-11-17 — Milestone 7 design sheet **signed off by the owner** (`docs/plans/milestone-7.md`). Last answers: permanent upgrades and abilities can also be bought in a town's Burrow mid-run (prices may rise in balancing); the twelve new gear items are added (66 in all).
- 2026-11-18 — Milestone 7 built on branch `claude/gifted-feynman-yczrqc` (the session's required branch). Simulation: success rolls with a 10-slice wheel and a 20-slice boss wheel (`wheelFor` in `src/sim/play.ts`), twelve slice-perk gear items (66 in all), acorns (`src/content/consumables.ts`); blue stars carried and deposited at towns and on beating a boss; permanent upgrades and starting abilities (`src/content/progress.ts`, `src/sim/profile.ts`), also bought in a town; one versioned save in three parts with a safe fallback (`src/save/saveData.ts`, `src/save/store.ts`), the run saved only in towns; regions with size, threat and toughness set separately (`REGIONS` in `src/content/run.ts`), boss pools and a new map per region; the boss template (`src/content/bosses.ts`) and The Warden (phases, slams, summons, plate shed, one hit per shot); five arenas (`src/content/arenas/`), never the same twice in a row. Display: the Burrow as the opening hub screen, success wheels, the boss bar and slam ring, carried blue stars and acorns on the HUD, the boss reward pick, region labels, testing aids. New placeholder sprites. `npm run arenas` checks every arena with the bot (all at least 12/20). 53 new tests (341 in total). Played in a browser: Burrow (buy, toggle), run start with the upgrade applied, all five arenas, a boss hit with the boss wheel, the slam ring, the win screen, reward pick, region two, a town's Burrow upgrades, continuing a saved run after a reload, and a damaged save; screenshots checked. Differences from the sheet in its section 12, including one rule added during the build (a boss takes one hit per shot). **Known problem:** region two's later courses take 40-60 s to make and sometimes fall back to a simple course; options for the owner in the session summary. **Waiting for the owner** to play it.
- 2026-11-18 — Owner chose options A and B for slow region-two courses. (A) Region two: 3 to 6 areas (was 4 to 7), threat capped at 36 (was 45). (B) Courses are made in the background (`src/render/genQueue.ts`): on the map (the selected node first), in a town, and while a course is played (the choices after winning it); the course picked jumps the queue. Checked in a browser: the three first-row courses were ready before the player chose, and the course opened with no loading screen. New region-two timings (fresh ball, 6 seeds each): first course 3.1 s average (was 3.5), hard 5.6 s (was 7.0), after 3 nodes 6.5 s (was 10.2), hard after 3 nodes 36 s (was 42), after 6 nodes 52 s (was 43), hard after 6 nodes 41 s (was 58); fallbacks 1 in 36 (was 6 in 36). Late region-two courses still take most of a minute to make, but they are now made while the previous course is played. 4 new tests (345 in total).
- 2026-11-18 — Owner found the game sometimes freezing with the ball sitting still. Cause: a ball at the bottom of a small pit (four slopes meeting at one low corner) rocked there forever; the slope was too steep to count as "held", so the shot only ended at the 30-second limit, and the next shot from there hung again. Fix: a ball on the ground that stays within 0.05 tiles of one spot for 0.5 s also rests (`trapRadius`, `trapTime` in tuning.ts and the U panel). Also, a defeated enemy can no longer hold up an enemy turn. Random-shot scan: before, 4 of 447 shots hit the time limit; after, 0 of 1,582 on 140 generated courses. Owner confirmed the background bot always plays at full health (it already did; now tested). 2 new tests (347 in total).
- 2026-11-18 — Owner: relax the course check (a roguelike: failing is expected). The bot now plays with a par kit per region instead of the player's gear and upgrades (region 1 a fresh ball; region 2 max shots +1, hit damage +1, shot power +10%), needs 1 health left (was 2), and has 1.5 times the shot limit. Generation is much faster. Region 2 averages (6 seeds each): first course 1.0 s (was 3.1), after 3 nodes 1.1 s (was 6.5), hard after 3 nodes 2.5 s (was 36), after 6 nodes 6.7 s (was 52), hard after 6 nodes 12.7 s (was 41); slowest 23.6 s; no fallbacks in 72 courses across both regions. Region 1 late courses 2.1 s (was 3.2). Courses made ahead are no longer thrown away when the player buys gear. 1 new test (348 in total).
- 2026-11-18 — Milestone 7 done: the owner played the test build (private artifact) and approved it ("everything passes"). Changes made during review: region two smaller and courses made in the background; trapped-ball fix; relaxed course check with a par kit per region. Known limits carried forward: the Warden is the placeholder boss for every region; region three, more bosses, biomes and the theme switch come in Milestone 8.
- 2026-11-18 — Milestone 8 round 1 design sheet written: `docs/plans/milestone-8.md` (enemies, elements and bosses: statuses, ranks Veteran and Elite, six traits, squad themes, enemy gear, five new enemies, Frost and Static, the bosses Gloamshell and Mother Bramble, region three). The sheet proposes splitting Milestone 8 into three rounds. Ten questions for the owner, each with a default. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-18 — Owner decision: after the three regions the run carries on into endless mode, scaling the same way each region, bosses from the boss randomizer. Recorded in DESIGN.md (open question 8), FEATURES.md section 15 and the round 1 sheet (section 10a, three new questions).
- 2026-11-18 — Owner agreed the endless mode plan (round 1 sheet questions 11 to 13): course size caps at region 3's size, everything else keeps growing each region. Questions 1 to 10 of the round 1 sheet still open.
- 2026-11-18 — Owner answers on the round 1 sheet: Milestone 8 in three rounds; Veterans and Elites worth 2 stars, with the quota no easier than now (new quota rule proposed, section 4.0); frozen water lasts 2 turns, re-freezing resets it; fire and ice cancel, water puts out burning; Burner burns for 1 turn; **every enemy is an insect** (villain theme chosen; new bug names proposed, section 7.0). Follow-ups written for shock's weakness (section 3), Explosive (section 5.1a), the final boss (section 7.0b) and boss order (section 7.0c). Not signed off yet.
- 2026-11-19 — Owner answered the round 1 follow-ups: elements form a circle (fire weak to ice, ice to shock, shock to fire); Explosive option A (a blast never defeats an enemy); final boss the Brood Queen; boss order fixed for now (Stagwarden, Gloamhorn, Brood Queen); melting rules agreed; insect names kept for now. Owner asked for prices to rise with the extra stars: new gear prices by rarity and stat boosts dearer each region (sheet section 10b). All questions answered; **waiting for the owner's final sign-off** of the sheet.
- 2026-11-19 — Owner decisions: the armadillo's poses (curled only for your own shot; knocked onto its back like a tortoise when hit outside it, then flips up), the shop as a food stand with an animated shopkeeper, boss introduction cutscene pop-ups for the three main bosses and the endless boss, and the finished game's map showing only the next 1 to 3 choices (whole map kept for testing). Recorded in DESIGN.md section 10, FEATURES.md sections 3, 5 and 11; placed in Milestone 8 round 1 (boss cards), round 3 (map) and Milestone 9 (art and animation).
- 2026-11-19 — Round 1 design sheet signed off by the owner. Building round 1.
- 2026-11-19 — Milestone 8 round 1 built (sheet `docs/plans/milestone-8.md`, as built in section 15): every enemy renamed as an insect (save version 2); Poisoned, Chilled and Burning on the ball, fire and ice cancel, water puts out a burn; the element circle; ranks (Veteran, Elite, worth 2 stars), six traits (Explosive never defeats an enemy), weak spots and guarded sides, carried gear; squad themes and leaders by region; a quota that never gets easier; five new bugs and Frostgrub and Sparkgrub; Frost and Static; Gloamhorn, the Brood Queen and the Queen's Mound; region three, the run-complete screen and endless mode; dearer high-rarity gear and stat boosts by region; boss introduction cards; placeholder art for all of it; test bench and panel aids. A safety limit on speed (found by the arena check). 60 new tests (408 in total). Arena check: every boss wins at least half its fights (table in the sheet). Test build published as a private artifact.
- 2026-11-19 — Course making times with round 1 (6 seeds each; `node tools/region-timing.ts`): region 1 first course 0.2 s, after 6 nodes 1.8 s, hard 5.5 s; region 2 after 6 nodes 4.7 s, hard 16.5 s (1 of 6 fell back); region 3 first course 4.3 s, after 3 nodes 6.7 s, hard 10.4 s, **after 6 nodes 30.9 s (2 of 6 fell back), hard after 6 nodes 39.6 s (6 of 6 fell back)**; region 4 first course 7.5 s, after 3 nodes 19.8 s, **hard after 3 nodes 37.0 s (4 of 6 fell back)**. Late region three and endless courses are too big for the course check: **waiting for the owner to choose** (options in the session summary). Numbers unchanged until then.
- 2026-11-19 — Bug: a patroller whose path ends next to a wall pushed the resting ball through the wall and off the course, on every pass (1 health each time). Cause: when a moving obstacle pushed the ball out of itself, the ball was placed directly, without the wall check, so it could end up a hair past the wall line; the next step's wall check only looks ahead, so it missed the wall and the ball rolled up over it. Fix (`collideObstacles` in `ball.ts`): the push-out now moves the ball through the same wall check as any other move, so a ball pinned against a wall stays there until the patroller turns back. New test `tests/wall-pin.test.ts` (Mudroller and Skitter Ant, 2000 steps, no falls). 2 new tests (412 in total).
- 2026-11-21 — Owner: region one's size is right; regions two and three grew too large. Region two is now 3 to 5 areas, +1 every 3 nodes, areas 8 to 15 tiles (was 3 to 6, every 2, 9 to 15). Region three and endless: 4 to 6 areas, +1 every 3 nodes, areas 9 to 15 (was 4 to 7, every 2, 10 to 16). Biggest course about 1,125 tiles in region two and 1,350 in region three (region one 980; region three was about 1,790). Course making times (`node tools/region-timing.ts 6 2,3`): region 2 first 1.1 s, after 3 nodes 1.8 s, hard 9.4 s, after 6 nodes 6.9 s, hard 6.2 s; region 3 first 1.5 s, after 3 nodes 2.2 s, hard 4.3 s, after 6 nodes 4.5 s, hard 5.6 s (was 30.9 s and 39.6 s). No fallbacks in 60 courses. Tests updated, no new tests (412 in total).
- 2026-11-21 — Round 2a sheet signed off by the owner (answers to all ten questions in section 8; scenery added). Building round 2a.
- 2026-11-21 — Milestone 8 round 2a built (sheet `docs/plans/milestone-8-round-2a.md`, as built in section 10): the detail dial (more set pieces per area in regions two and three, a few extra obstacles, scenery; region one keeps its ground, set pieces and enemies, with 1 to 3 extra rocks or stumps); moats with plank bridges (water, sand or spikes; rails half the time), dead trees and dead tree groves, spike strips, rough and ice patches; six placeholder scenery props, a U-panel switch to hide them, and `?course=generated&region=N`; a food shop (4) and a gear shop (3) in each town with their own rerolls; a 3-slot food bag, eaten between courses (B on the map or in town), any number at a time, none during a course; stat foods and acorns last 1, 2 or 3 courses (50/30/20), Apple and Garlic work at once; food found on a course goes into the bag (swap or leave when full); save version 3. Tuned while building: region 3 set pieces 1 per 45 tiles (sheet 55), extra obstacles 1.0 and 1.5 in regions 2 and 3 (sheet 1.5 and 2.5). Per 100 tiles, late courses: region 2 special ground 11.7, obstacles 2.4, scenery 6.0; region 3 14.5, 2.7, 8.0 (all inside the sheet's targets). Course making (`node tools/region-timing.ts 6 1,2`, alone on the machine): region 1 first 0.3 s, after 6 nodes 1.6 s, hard 8.7 s (was 5.5 s); region 2 first 1.8 s, after 3 nodes 3.1 s, hard 14.5 s (was 9.4 s), after 6 nodes 7.6 s, hard 6.7 s; region 3 first 1.7 s, after 6 nodes 4.2 s, hard 5.4 s (was 30 to 40 s before the size change). No fallbacks in 90 courses. **Region 2 hard courses now average over 10 s: options for the owner in the session summary.** 28 new tests, 4 changed (440 in total). Checked in a browser: a region 3 course with a spike moat, bridge, groves, spike strips, ice and scenery; the town with four places; both shops; the bag on the map and in town.
- 2026-11-21 — Owner, after round 2a: food picked up on a course now asks at once "eat it now or stash it?" (eaten now, it works for the rest of that course); with the bag full it is eaten at once. Replaces swap-or-leave after the course. Checked in a browser on the test bench (the card, then eating a Star Acorn). 444 tests.
- 2026-11-21 — Round 2a merged to main (owner approved). Round 2b design sheet written: Burr, Kite, Gyre, Drift and their grubs; switches with linked gates and drawbridges; wind, low gravity and darkness; Meadow, Bog and Thornwood biomes; six themes. Waiting for the owner's review.
- 2026-11-21 — Round 2b sheet signed off by the owner (all defaults). Building in four parts: abilities, switches, course modifiers, biomes and themes.
- 2026-11-21 — Milestone 8 round 2b built (sheet `docs/plans/milestone-8-round-2b.md`, as built in section 10), in four parts, each checked in a browser: (1) Burr, Kite, Gyre and Drift and their four grubs; (2) switches, linked gates and drawbridges (regions 2 and 3; the bot goes for switches); (3) course modifiers: wind, low gravity (in the air), darkness, at 20% / 30% of courses in regions 2 / 3, never in region 1 or boss fights, each costing part of the threat budget; (4) biomes Meadow, Bog and Thornwood and six themes (day, bog, thornwood, night, underground, spooky) as recoloured sprite sets with their own sky. Region 1 courses unchanged (test). Course making (`node tools/region-timing.ts 6 1,2,3`): region 1 first 0.3 s, after 6 nodes 2.7 s, hard 8.4 s; region 2 first 0.9 s, after 3 nodes 3.9 s, hard 6.8 s (was 14.5 s), after 6 nodes 6.9 s, hard 10.6 s; region 3 first 1.5 s, after 6 nodes 3.6 s, hard 5.1 s. No fallbacks in 90 courses; every average is under the sheet's 15 s. 33 new tests, 3 changed (472 in total). Testing aids: `?ability=`, `?mod=`, `?theme=`, a U-panel theme picker.
- 2026-11-21 — Round 2b test build published to the same private link as round 1 ("DreamCourseDream M8 Build").
- 2026-11-21 — Owner request: the bot can play the real game while you watch. Y on any course (or "Bot plays" in the U panel) hands every shot to the course check's bot until Y again; it stays on from course to course, stashes food it finds, and stops with a message if it finds no shot. The bot's choice for one turn is now its own piece (`botBrain` in `src/gen/bot.ts`); the course check gives exactly the same results as before (checked on 6 courses across regions 1 to 3). Test build updated.
- 2026-11-21 — Owner feedback after round 2b recorded: boss exit under the boss's start; wind vane (and strength gauge if strength varies); spiked gate tops; more low-risk obstacles in region 1; endless theme order (dedicated first, then random), planned as small "round 2c" changes. Lighting, dynamic shadows and a settings toggle planned for Milestone 9.
- 2026-11-21 — Round 2c answers from the owner (Starfall for endless; everything else default). Building round 2c.
- 2026-11-21 — Round 2c built: a boss arena's exit is now under the boss's starting spot (all six arenas); wind comes in three strengths (light, medium, strong; threat cost 1, 2, 3) shown by a vane and a 1-3 bar gauge under the HUD label; closed gates of both kinds have spiked tops (1 damage when the ball touches one in the air; open gates and rolling never hurt); region 1 courses get about 4-8 extra rocks, stumps and low walls; endless mode (region 4) starts with the new Starfall theme (deep purple sky), then a seeded random theme per region; fireflies (animated scenery) in regions 1-3. Testing aid `?strength=1|2|3`. 476 tests pass. Test build updated.
- 2026-11-21 — Rounds 2b and 2c merged to `main` (owner approved). Milestone 8b design sheet written: `docs/plans/milestone-8b.md` (walking and controls, zoom 2 camera, three town layouts, crossroads with signposts replacing the map screen, boss gate, cache clearing, practice green, flat Burrow and shop screens). Ten open questions, each with a default. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-21 — Milestone 8b sheet **signed off by the owner** with every default. Building.
- 2026-11-21 — Milestone 8b built (sheet `docs/plans/milestone-8b.md`, as built in section 11), in three parts: (1) walking (`src/sim/walk.ts`: up is up the screen, 3 tiles a second, Shift 1.6 times, slides along walls, 1-step rises only, triggers fire once per step onto them) and place files (`src/sim/place.ts`; three towns, three crossroads templates, the cache clearing, the practice green course), with the crossroads scattered from the run seed (`src/gen/crossroads.ts`); (2) placeholder art (armadillo, food hut, gear shop, Burrow mound, boss gate, chest, lamp, barrel, tee mat, flag, dirt path tile, three room pictures); (3) `PlaceScene`: the crossroads replaces the map screen in the run (signpost cards show what each path leads to; walking off a path end goes there), towns (doors open the shops and the Burrow as room pictures; practice green; exit asks first), the cache clearing (chest), and the boss gate (introduction card, then "fight now?"; the fight does not show the card again). The map screen stays as a testing view (M, or "Use the map screen" in the U panel). Testing aids: `?place=town`, `?place=cache`, `?place=boss`, each with `&region=N`. 16 new tests, 1 changed (492 in total); every door, path end and gate is checked to be reachable on foot (3 towns, 60 crossroads). Played in a browser: start from the Burrow, crossroads and signposts, a course and back, all three towns in their themes and Starfall, each door, the practice green, the exit, the cache, the boss gate and fight.
- 2026-11-21 — Milestone 8b test build published to the same private link ("DreamCourseDream M8 Build"). **Waiting for the owner** to play a run by walking.
- 2026-11-21 — Owner request: ground bumps (flat grass, rough and sand tiles drawn 0 to 2 pixels raised, looks only; slopes untouched; things standing on them raised too; U-panel switch). Compared in renders first (raised, shaded, both; then raised on uneven ground, every tile against flat tiles only); the owner chose raised, flat tiles only. 2 new tests. Test build updated.
- 2026-11-21 — Owner after playing 8b: walking camera zoom 1.5 (was 2), drawn as one scaled picture so tiles have no seams; crossroads signposts show the destination's map icon. Test build updated.
- 2026-11-22 — Owner: walking camera zoom 1.25; the cache chest opens with Enter; lantern posts either side of each path's far end at the crossroads. Test build updated.
- 2026-11-22 — Owner: crossroads signposts removed; each destination's map icon floats past its path's end between the posts, and nearing the entrance pops up its card. Test build updated.
- 2026-11-22 — Owner: crossroads path ends and the boss gate are taken with Enter (standing at them shows the card and "ENTER: GO THIS WAY"). Test build updated.
- 2026-11-22 — Owner: every door, the tee, the exit, the chest, path ends and the boss gate are used with Enter (nothing by walking in). Test build updated.
- 2026-11-22 — Owner: town signposts stay for now; **Milestone 8b approved and merged to `main`.**
- 2026-11-22 — Milestone 8 round 3 design sheet written: `docs/plans/milestone-8-round-3.md` (second gear pockets, two new characters, the Needle poison family and shop variety, the map showing only the next choices, the balance pass, the remaining open questions). Ten questions for the owner, each with a default. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-22 — Owner signed off the round 3 sheet: second pockets 17 blue stars each, Thud and Pip 21 each, everything else the defaults (Needle family, Sale, Grab Bag, Chef's Special, map shows only the next choices, balance targets, build order). Every remaining open question (DESIGN 2, 3, 5, 6, 7, 10; FEATURES F1 to F4, F6) keeps its default. Recorded in the sheet, FEATURES.md and DESIGN.md.
- 2026-11-22 — Milestone 8 round 3 built: the map shows only the next choices (U-panel "Show the whole map"); the Needle poison family; Sale, Grab Bag and Chef's Special; Thud and Pip (21 blue stars; Steady is a new knockBack stat at 0.65); three second gear pockets (17 blue stars; save version 4); `npm run balance` and `docs/plans/balance-report.md` (540 courses and boss fights). 520 tests pass. **Waiting for the owner:** balance proposals P1 to P5, then the owner's playtest to judge the curve fair (the milestone's done-when).
- 2026-11-23 — Owner approved balance proposals P1 to P5: boss health Stagwarden 11 (region 1), Gloamhorn 11 (region 2), Brood Queen 26 (region 3); the first-try win target dropped; course damage unchanged until the owner's playtest. Round 3 merged. Milestone 8 is done when the owner judges the curve fair after a playtest.
- 2026-11-23 — Owner asked for an art pipeline (draw on paper, photo from the phone, game-ready pixel art in one style). Draft sheet `docs/plans/art-pipeline.md` written and added as Milestone 8c; waiting for the owner's review.
- 2026-11-23 — Owner signed off the art pipeline sheet (all defaults; Q4 changed: everything drawn freehand in a sketchbook, Claude renders small items down). Built: the Art List with 232 permanent codes and contact sheets (`npm run art:list`), the sprite file format, the Pixel Press (`npm run art:press`, also run last by `npm run art`), previews and side-by-side render-down comparisons (`npm run art:preview`), the style check, `art/STYLE.md`, the palette (10 ramps) and theme ramps. Checked in the game with a mock-up Snoozegrub pressed in and then removed. 538 tests pass. **Waiting for the owner:** the palette, the ground-contrast rule, then the pilot.
- 2026-11-23 — Owner wants a more stylised look and asked for style samples. Built a style lab (`npm run art:styles`): five items (Rollo, the grub, a star, an acorn, a rock) in six styles, as close-ups and as little scenes. Style settings are named dials (shades, outline kind, rim light, shine, dithering, eye style, blush, ground texture, shadow, size). **Waiting for the owner** to pick a direction before the palette and STYLE.md are settled.
- 2026-11-23 — Owner likes B's shapes with C's light, leaning more towards B. Style lab set `npm run art:styles -- blend`: steps B, B1 (rim light), B2 (soft grass and shadow), B3 (a 4th darker shade), B4 (softer outline), and E. **Waiting for the owner** to pick a step.
