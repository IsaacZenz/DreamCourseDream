# Milestone 5 design sheet — Course generator

**Status: signed off by the owner, 2026-11-15.** Built on branch `milestone-5-course-generator`.

How to review: read each section, change any number or rule you want, and answer the numbered questions in [section 9](#9-questions-for-the-owner). Each question has a default, so "use the defaults" is a valid answer. Every number here is a starting value and goes into `src/content/` so it can be tuned later (DESIGN.md section 2, "keep it easy to fine-tune").

Sizes are in tiles. A chunk is 5×5 tiles. For scale: the hand-built "Enemies and abilities" course is 20×16 tiles with 19 objects and a quota of 7.

---

## 1. What the generator does, in one paragraph

You give it a **seed** and a **difficulty budget** (a number, for example 12). It lays a route of hand-made 5×5 **chunks** from a start chunk to an exit chunk, sometimes with a side branch. It spends part of the budget on the terrain, then places enemies in **squads**, then obstacles and hazard tiles, until the budget is used up. It sets the quota from the stars on offer. Then it **checks the course twice**: a quick structure check (can the start reach the exit and enough stars?), then a **bot** that plays the course in the simulation with no display. If either check fails, it throws the course away and tries again. The output is an ordinary course file, the same format as the hand-built courses (DESIGN.md section 11), so the game cannot tell them apart.

Same seed plus same budget gives the same course, every time (CLAUDE.md rule 3).

---

## 2. Chunks

### 2.1 Chunk format

A chunk is a small JSON file in `src/content/chunks/`, written in the same tile text as a course file, plus:

| Field | Meaning | Example |
|---|---|---|
| `id`, `name` | | `"ramp"`, `"Ramp"` |
| `tiles` | 5 rows of 5 tiles, heights relative to the chunk (lowest is 0) | `"g0 g0 g0 g0 g0"` |
| `edges` | For each side (n, e, s, w): `open` (the middle 3 tiles of that side are flat, walkable ground at a stated height) or `closed` (a rim, rough or out of bounds) | `{ "w": { "open": 0 }, "e": { "open": 1 }, "n": "closed", "s": "closed" }` |
| `role` | `start`, `exit`, `path` (passes through), `branch` (a dead end off the route) | `"path"` |
| `cost` | Terrain cost against the budget (section 3) | `1` |
| `spots` | Marked places where the generator may put things (section 2.3) | see below |
| `rotate`, `mirror` | Whether it may be turned in 90° steps or flipped. Default both yes | `true` |
| `minBudget` | Not used below this budget, so tricky ground stays out of the easiest courses | `0` |

Turning and flipping means 14 hand-made chunks give up to 112 different pieces. Arrow tiles (booster, conveyor) turn with the chunk.

### 2.2 How chunks join

- Two chunks join where an **open** side meets an **open** side. The generator raises or lowers the whole next chunk so the two edges meet at the same height. That way slopes and ledges inside chunks carry the height along the route.
- **Ledges only go down the route.** A ledge chunk can be rolled off but not climbed, so it may only face "downhill" from start to exit. Side branches join level, so you can always come back out of one.
- Where an open side meets nothing (a closed side or the edge of the course), the generator closes it with a low rim (one step up) so the ball is not thrown out of bounds by accident.
- Every corner height stays within 0 to 9 (`MAX_HEIGHT` in `src/sim/course.ts`). A layout that would go over is retried.
- Grid slots with no chunk are **out of bounds** (`.`), so courses have shapes, not rectangles (question 1).

### 2.3 Spots inside a chunk

| Spot kind | What can go there |
|---|---|
| `enemy` | Any sentinel (Mossback, carriers, Spitter, Lunger, Mole). Mole only if the tile is flat grass or rough |
| `lane` | A path (2 to 5 tiles) for a Trundler, a sliding block or a drifting cloud |
| `blocker` | Rock, tree stump, low wall, crate, secured crate |
| `cloud` | A stationary thunder cloud |
| `gate` | A gate across a 1-tile gap |
| `hazard` | A group of 1 to 3 tiles that can become one hazard: listed per spot, for example `["spikes", "conveyor"]` or `["booster", "spring", "bumper"]` |
| `pickup` | A free shot orb or heart (section 4.5) |
| `crack` | A cracked tile with stars underneath (only useful if an Anchor is on offer, see section 4.4) |
| `start`, `exit` | Only in the start and exit chunks |

An unused spot stays plain ground. A spot is never used twice.

### 2.4 The first chunk set (14 chunks)

| # | id | Role | Open sides | Terrain | Cost | Spots |
|---|---|---|---|---|---|---|
| 1 | `tee` | start | 1 (turns to fit) | Flat grass pad, start in the middle | 0 | 1 pickup |
| 2 | `green` | exit | 1 | Flat grass, exit in the middle, gentle slope down to the hole from the open side | 0 | 2 enemy, 1 blocker |
| 3 | `fairway` | path | 2, opposite | Flat grass, rough corners | 0 | 2 enemy, 1 lane, 2 blocker, 1 hazard (strip), 1 cloud |
| 4 | `bend` | path | 2, at a corner | Flat L-shaped grass, rough on the inside corner | 0 | 2 enemy, 1 blocker, 1 hazard (pad), 1 cloud |
| 5 | `plaza` | path | 3 or 4 | Open flat square | 0 | 3 enemy, 1 lane (a loop), 2 blocker, 1 cloud |
| 6 | `fork` | path | 3 (T shape) | Flat, one arm narrows to a 1-tile gap | 0 | 2 enemy, 1 gate, 1 blocker |
| 7 | `nook` | branch | 1 | Small dead end with a rim | 0 | 1 enemy, 2 blocker (crates preferred), 1 pickup, 1 crack |
| 8 | `ramp` | path | 2, opposite | Slope up one step across the middle | 1 | 1 enemy (on top), 1 blocker, 1 hazard (booster pad pointing uphill) |
| 9 | `ledge` | path | 2, opposite | One-step drop across the middle (downhill only) | 1 | 1 enemy (below), 1 hazard (spring pad below), 1 cloud |
| 10 | `bowl` | path | 2 to 4 | Centre lowered one step, corner slopes round it | 1 | 2 enemy (in the bowl), 1 hazard (spikes or sand at the bottom) |
| 11 | `ridge` | path | 2, opposite | A hump across the path: up one step, down one step | 1 | 1 enemy (on the crest), 2 blocker |
| 12 | `bunker` | path | 2 | Flat, a 2×3 sand trap beside the line | 1 | 2 enemy, 1 blocker |
| 13 | `pond` | path | 2 | A 3×2 pool with a one-tile island; grass path round one side | 2 | 1 enemy (on the island), 1 blocker |
| 14 | `rink` | path | 2 | A 3×3 ice sheet, rough border | 2 | 2 enemy, 1 lane, 1 hazard (bumper pad at the far side) |

`minBudget`: `pond`, `rink` 8; everything else 0.

Not in the first set (question 6): bridges over a drop, warps, conveyors as whole chunks. They are easy to add later as data files.

---

## 3. The difficulty budget

### 3.1 How big

Until the run exists (Milestone 6), you pick the budget. Default presets, used by the seed viewer and the "generated course" test slot:

| Preset | Budget |
|---|---|
| Easy | 8 |
| Normal | 12 (default) |
| Hard | 20 |
| Maximum for testing | 40 |

Milestone 6 decides how the budget rises along the run.

### 3.2 Course size from the budget

| Budget | Grid of chunk slots | Route length (chunks, start to exit) | Side branches |
|---|---|---|---|
| under 10 | 3×3 (up to 15×15 tiles) | 3–4 | 0–1 |
| 10 to 19 | 4×3 (up to 20×15) | 4–5 | 0–1 |
| 20 and up | 4×4 (up to 20×20) | 5–6 | 1–2 |

### 3.3 How the budget is split

Spent in this order. Each share is a tuning number.

1. **Terrain:** up to 25% of the budget on chunk costs (section 2.4). Cheap chunks fill the rest.
2. **Enemies:** at least 50%. Spent in squads (section 4).
3. **Obstacles and hazards:** whatever is left. Leftover smaller than the cheapest item is dropped.

### 3.4 Costs

Enemies and objects already have a `cost` in `src/content/objects.ts`; these are the same numbers. Hazard tiles get a new `cost` field in `src/content/surfaces.ts`.

| Thing | Cost |
|---|---|
| Mossback | 1 |
| Ability carrier (any) | 1 |
| Trundler, Spitter, Lunger, Mole | 3 |
| Rock, tree stump, low wall | 1 |
| Crate | 1 |
| Secured crate | 2 |
| Cracked tile | 1 |
| Sliding block, gate | 2 |
| Thunder cloud: stationary / drifting | 2 / 3 |
| Hazard spot as spikes | 2 |
| Hazard spot as booster, spring, conveyor or bumper | 1 |
| Chunk terrain | 0 to 2 (section 2.4) |

Worked example, budget 12: terrain 3 (a `ramp` and a `pond`); enemies 7 (a squad of Trundler + Mossback + Mossback, a squad of Mossback + Hopback); obstacles and hazards 2 (a crate and a booster). That is 5 enemies and 1 crate star = 6 stars, quota 4.

---

## 4. Placement

### 4.1 Enemies in squads (FEATURES.md section 4)

- Enemies are placed in **squads of 2 to 5**, inside one chunk or two chunks next to each other on the route.
- Each member is picked at random (from the seed) from the enemies the remaining budget can afford, weighted: Mossback 3, Trundler 2, Spitter 2, Lunger 2, Mole 2. A Trundler needs a free `lane` spot; if there is none it is not picked.
- **Not yet (Milestone 8):** squad themes (element or trait), the 70% share chance, and the tier-up squad leader. The code keeps a place for them, switched off.
- Region 1 tier mix only: tiers 1 and 2 (FEATURES.md section 14).
- At least 3 enemies on every course; at most 10.

### 4.2 Ability carriers

- 60% of courses get **one** carrier, as a member of a squad. Which ability is random among the four (question 3).
- A carrier is never more than one squad away from the start, so you have a chance to use the ability on the course where you got it.

### 4.3 Safety rules for placing anything

- Nothing within 2 tiles of the start, and no Spitter or Lunger whose outer radius covers the start tile.
- Nothing on the exit tile or the 8 tiles around it, except the `green` chunk's own enemy spots, which are at least 2 tiles from the hole.
- No hazard next to the start tile.
- A drifting cloud never drifts over the start or the exit.
- After obstacles are placed, the structure check (section 5.1) runs again so a blocker can never seal the route.

### 4.4 Obstacles and hazards

Spent from the leftover budget, picked at random from what is affordable and has a free spot, weighted: blockers 3, crates 2, hazard spots 3, clouds 2, sliding block 1, gate 1, cracked tile 1.

- A cloud on a `lane` spot drifts (cost 3); on a `cloud` spot it stays put (cost 2). This is how the generator "decides which clouds drift" (FEATURES.md section 6).
- A cracked tile is only placed if an Anchorback is on the course, so its stars are not hidden for nothing. Its stars do **not** count towards the quota (question 4).
- A secured crate keeps its 10% Wild chance.

### 4.5 Free pickups (no budget)

- One shot orb on 50% of courses, on a `pickup` spot off the main line.
- No free hearts. Hearts come only from crates (crates drop a heart instead of a star 20% of the time).

### 4.6 Quota

- Stars on offer = enemies (1 star each, owner rule) + stars in crates (cracked tiles excluded, section 4.4).
- **Quota = 60% of the stars on offer, rounded to the nearest whole number, at least 2** (FEATURES.md section 14).

---

## 5. Checking the course

### 5.1 Structure validator (fast, no simulation)

All must be true, or the course is thrown away:

1. The course passes the normal course schema check (`parseCourse`).
2. The exit can be reached from the start. "Reachable" walks tile to tile: moving down any height is fine; moving up is fine across a slope or a step of at most one (a lofted shot clears it); two steps up or more is a wall. Water tiles can be crossed but not stopped on. Tiles with blockers, crates, gates or sliding blocks still count as crossable here (the ball can go round, break, loft over or wait for them); the bot in 5.2 is what proves they can really be passed.
3. Enough stars to meet the quota sit on reachable tiles.
4. There are at least 4 tiles of ground that can hold the ball within 3 tiles of the exit (so there is somewhere to stop near it).

### 5.2 Bot validator (plays the course in the simulation)

The bot does not need to be clever (DESIGN.md section 11). It is a **floor**: if a plain bot can win, a person can.

- Plays as Rollo, from a fresh `PlayState`, using the real `takeShot` and `tick` code, no display.
- **Never** uses abilities, the bounce boost or perfect shots. That leaves a margin for the player.
- Each turn it picks up to **3 targets**: the nearest enemies still standing, any crate or star it needs, and the exit once open.
- For each target it tries **16 candidate shots**: aimed straight at the target and a little either side, ground and lofted, with power from the existing `rollSpeedFor` and `lobSpeedFor` helpers plus a little more and less. Every candidate runs on a copy of the course, so nothing leaks into the real game.
- It scores each candidate: +100 per star gained, +1000 for entering the open exit, −60 per health lost, −40 for sinking or going out of bounds, minus the distance to the next target. It plays the best one for real, the enemy turn runs, and it repeats.
- **Pass:** quota met and ball in the exit within **24 shots** (recover turns do not count as shots), with **at least 2 health** left (question 5).

### 5.3 Speed

Measured today on this cloud machine: one simulated shot on the 20×16 test course takes about 2.3 ms. A typical bot game is 8 to 12 turns of about 48 candidates, so roughly 0.5 s for a course that passes first time. The target is **under 1 second per course on average**. If the build is slower, the first knobs to turn are the candidate count and target count (tuning numbers in `src/content/gen.ts`), then cutting candidate shots short once they are clearly bad.

### 5.4 Reject and retry

- Each attempt uses a fresh random stream made from the seed and the attempt number, so the course you end up with is still the same for the same seed and budget.
- Up to **20 attempts**. Every rejection is logged with its reason: `Course #ABC123 budget 12: accepted on attempt 3 (rejected: exit unreachable ×1, bot ran out of shots ×1), 640 ms`.
- If all 20 fail, it tries 20 more at 75% of the budget, then falls back to a fixed safe course (`tee`, `fairway`, `green`, three Mossbacks) and logs a warning. In the batch test (section 7) a fallback counts as a failure.

---

## 6. Where you see it

### 6.1 In the game

- **Key 6, or `?course=generated`:** a generated course. Add `&seed=ABC123&budget=12` to pick one. The HUD seed reads `#ABC123 · B12`.
- **On the course complete screen, Enter** loads a **new** generated course with a new seed, so you can play ten in a row (the "Done when" for this milestone). **Owner, 2026-11-15:** the next course's budget goes up by a random 0 to 4 (from the seeded random numbers, so the same seed and the same wins give the same climb), capped at the testing maximum of 40.
- **R** restarts the same generated course.
- **[ and ]** lower or raise the budget by 2 and generate a new course (section 3.1 presets are just starting points).
- **G** gets a fourth debug mode, **chunks**: chunk outlines and ids, spot markers, and the budget spend (terrain / enemies / obstacles / hazards).

### 6.2 Seed viewer (V key, debug)

A panel like the U tuning panel:

- Type a seed and a budget, press Enter.
- Shows the course, **PASS** or **FAIL**, which attempt was accepted, the rejection reasons, generation time, the bot's shot count and health left.
- **B: watch the bot play** the course at 2× speed, with its chosen shot drawn before each one. Useful when a course passes but feels wrong, or to see why it failed.
- **Copy course JSON** to the clipboard, so a bad course can be pasted into a bug report or saved as a test course.

### 6.3 Command-line tools

- `npm run gen -- ABC123 12`: prints the course as text, pass or fail, and the log.
- `npm run gen:batch`: generates **500 courses** (seeds from a fixed list, budgets spread over 8, 12 and 20), then reports pass-on-first-try rate, overall pass rate, average and slowest generation time, and rejection reasons. It also writes a **contact sheet**: a PNG grid of 48 of the courses (drawn with the real renderer through Playwright), each labelled with seed, budget and PASS/FAIL. The output goes to `tools/out/`, which is not committed.

---

## 7. Tests (Vitest, simulation only)

- Same seed and budget give the identical course file, twice in a row and in a fresh process.
- Different seeds give different courses (100 seeds, no two identical).
- Every chunk file parses, every turned and flipped version keeps its open sides matching its `edges` declaration, and every spot is on a tile that can take it.
- The joined course never goes below 0 or above 9 height, and every ledge on the route faces downhill.
- Budget is never overspent; at least 50% goes to enemies when that is affordable.
- Safety rules (section 4.3) hold on 200 generated courses.
- Quota is 60% of the stars on offer, rounded, at least 2.
- The structure validator rejects: a sealed exit, a two-step wall across the route, too few reachable stars.
- The bot wins a known easy hand-built course and fails a known impossible one (exit behind a wall).
- The bot's trial shots do not change the real game state.
- Retry: a forced failure produces a logged rejection and a different attempt; the fallback course always passes.
- Purity: `src/gen/` has no Phaser, DOM, clock or `Math.random` (already enforced by the lint rule).

---

## 8. Not in this milestone

Squad themes, traits, elements and tier-up leaders (Milestone 8); biomes and per-biome chunk sets (Milestone 8); the run map and the budget curve along it (Milestone 6); bridges, warps and linked objects in generated courses; blue-star hidden spots; any new enemy, obstacle or ability.

---

## 9. Questions for the owner

Answered by the owner, 2026-11-15: defaults for questions 1–6 and 8; question 7 changed as marked.

1. **Course shape.** Empty grid slots become out of bounds, so courses are odd shapes with drops off the side. Or fill them with plain rough so every course is a full rectangle? *Default: out of bounds.*
2. **Terrain costs budget.** Should tricky ground (ramps, ponds, ice) spend budget, so easy courses are also flatter? *Default: yes, up to 25%.*
3. **Ability carrier on 60% of courses.** More often, less often, or always? *Default: 60%, one carrier at most.*
4. **Cracked-tile stars as a bonus.** Stars under a cracked tile do not count towards the quota, so you never need the Anchor to finish. *Default: yes, bonus only.*
5. **Bot pass standard.** Win within 24 shots with at least 2 of 5 health left, without using abilities or bounce boost. Stricter (easier courses) or looser (harder courses)? *Default: as written.*
6. **Hazards the generator may use.** Spikes, booster, spring, conveyor, bumper. Leave warps out until there is a chunk designed around them? *Default: leave warps out.*
7. **Playing ten in a row.** ~~Enter after a win gives a new generated course at the same budget.~~ **Answered by the owner, 2026-11-15:** after a win, the next course's budget rises by a random 0 to 4 (section 6.1).
8. **Chunk size.** 5×5 tiles per chunk. Smaller chunks (4×4) give more joins and more variety but less room inside each piece. *Default: 5×5.*

---

## Sign-off

- [x] Owner sign-off, 2026-11-15. The one change (question 7, budget rises by a random 0 to 4 after a win) is marked "owner, 2026-11-15" in this sheet and recorded in FEATURES.md section 14.
