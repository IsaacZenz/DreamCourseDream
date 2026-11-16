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

- [ ] **Plan gate:** design sheet for The Warden (phases, attacks, summons, arena), blue star sources, the hub screen and the permanent upgrades. Owner signs it off before any of them is built.
- [ ] Boss template and the first boss, The Warden (FEATURES.md section 5)
- [ ] Blue stars: sources and wallet
- [ ] Hub screen between runs with the levelled list and the starting-ability unlock (FEATURES.md section 10)
- [ ] Death flow: lose run items, keep permanent upgrades and blue stars
- [ ] Save and load with a version number and a safe fallback if the save is unreadable
- [ ] Owner, 2026-11-15: a town is the save point for a run in progress. Leaving the game at a town and coming back carries on from there; death still starts over
- [ ] Region two starts after the boss with a higher budget

**Done when:** the owner can die, buy a permanent upgrade, start again, and see the upgrade applied; and can beat the boss.

## Milestone 8 — Content and balance

- [ ] **Plan gate:** design sheet for every new ability, enemy, trait, status, boss, linked object, biome, gear item and character in this milestone. Owner signs it off before any of them is built. This milestone is large; it may be planned and built in several rounds, each with its own sheet.
- [ ] Remaining abilities from DESIGN.md section 9
- [ ] Enemy tiers 3 and 4, traits, elements, weak spots, squad themes, enemy gear and its drop chance
- [ ] Remaining statuses: Poisoned, Burning, Chilled
- [ ] More enemy types in both families; a second and third boss, one with a gimmick
- [ ] Linked objects (switches, gates, bridges); optional course modifiers
- [ ] Second gear slot unlocks; extra characters
- [ ] Three biomes with their own chunk sets
- [ ] Theme switch after each boss (day, night, jungle, underground, spooky): same objects, different art set through the manifest (owner, 2026-11-14)
- [ ] More gear and shop variety
- [ ] Balance pass using the headless bot across many seeds: completion rate per region, stars earned, health lost
- [ ] Resolve the remaining open questions with the owner

**Done when:** three regions and a final boss are playable and the owner judges the difficulty curve fair.

## Milestone 9 — Skin, sound and sharing

- [ ] Theme, character and title chosen with the owner
- [ ] Final pixel art replaces placeholders through the manifest only
- [ ] Several art variants per theme for each larger advancement (owner, 2026-11-14)
- [ ] Sound effects and music, original or correctly licensed
- [ ] An animation and a sound for most actions (owner, 2026-11-14), including a slot-machine wheel for the Wild pickup
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
- 2026-11-16 — Milestone 7 design sheet written: `docs/plans/milestone-7.md` (The Warden with its slam and summon actions and three phases, the arena, blue star sources and wallet, the hub and permanent upgrade costs, the starting ability unlock, the death flow, region two, the save format with its fallback, and the town save point). Ten questions for the owner, each with a default. **Waiting for the owner's sign-off**; nothing built yet.
- 2026-11-16 — Owner decisions: villains are insects; bosses are generated from three random parts (bug type, colour with its power, base skill), and every boss summons. Recorded in DESIGN.md (section 8, open question 9) and FEATURES.md section 5. The planner's proposal for six bug types, five colours and five skills is in `docs/plans/milestone-7.md` section 2b, **waiting for the owner's review**.
