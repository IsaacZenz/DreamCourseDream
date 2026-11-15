# Milestone 5b design sheet — Journeys, rails, gentle slopes and water

**Status: built and approved by the owner, 2026-11-15.** Merged to `main` with Milestone 5.

This reworks the Milestone 5 course generator before its gate. Your playtest verdict was that courses are too small, too flat and not interesting enough, so the Milestone 5 gate ("ten generated courses worth playing") moves to the end of this sheet.

How to review: read each section, change any number or rule you want, and answer the questions in [section 9](#9-questions-for-the-owner). Each question has a default. Items marked **Decided** come from you already and are only restated. Every number is a starting value and goes into `src/content/`.

Sizes and heights are in tiles. After this milestone **one height step is a quarter of a tile** (section 1). For scale: gravity is 20, a full ground shot is 13.2 tiles per second, and a spring throws the ball about 2 tiles high.

**On originality (CLAUDE.md rule 1).** We studied 32 hole maps from a 16-bit isometric golf game for principles only: one solid landmass per hole, long smooth slopes, thin rails used sparingly, see-through water in dips, few objects on a big field. Nothing here copies a hole, a name, an art style or a colour from it. The shapes below are generic landforms (basin, terrace, ridge, gully), and the generator combines them at random.

---

## 1. Gentler slopes: halve the height step (Decided, owner 2026-11-15)

| | Now | After |
|---|---|---|
| One height step | 0.5 tiles (8 pixels) | **0.25 tiles (4 pixels)** |
| One slope tile | about 27° | **about 14°** |
| Highest corner | 9 steps (4.5 tiles) | **35 steps (8.75 tiles)** |

- **Course file format 3.** Corner heights become one character each, from `0`–`9` then `a`–`z` (10 to 35), so `g0a0b` is a tile with corners 0, 10, 0, 11. Format 1 and 2 files still load: their heights are doubled on loading, so they look and play exactly as before. The hand-built test courses are converted to format 3 once, by a script.
- **Physics:** the step height is already one number (`STEP_HEIGHT` in `src/content/tuning.ts`), so nothing else changes. A ledge is now any rise the ball cannot clear, as before.
- **Art:** the placeholder art script draws faces 4 pixels per step, and `npm run art` regenerates every sprite.
- **Structure check:** "up one step is fine" becomes "up to **two** steps (half a tile) is fine", so what the ball can climb stays the same.
- **Please re-check how slopes feel.** Steep ground is now two slope tiles in a row instead of one.

---

## 2. Guard rail (Decided, owner 2026-11-15; details Default)

Template (FEATURES.md section 6):

| Field | Value |
|---|---|
| id / name / sprite | `rail` / Guard rail / `rail` (posts and one bar, mostly see-through) |
| Where | Along the **middle line of tiles**, as lines through tile centres. Pieces along the grid, and at **45°** (corner to corner through the centre) |
| Size | Height **0.3 tiles**, bar thickness 0.08 tiles |
| Blocks the ball | Yes, while the ball is lower than the top of the rail |
| Movement / destroyed by / drops / linked | None / nothing / nothing / nothing |
| Cost | **0** against the budget (it makes a course safer, not harder). Open drops are what cost: section 5.5 |

**Course file:** a new optional list, separate from objects, so a rail can share a tile with an enemy or a pickup:

```json
"rails": [ [[2, 3], [10, 3], [13, 6]], [[5, 8], [5, 12]] ]
```

Each line runs through tile centres. Each leg must be along the grid or exactly 45°. The schema check rejects legs that leave the course or cross an empty spot.

**What it does, case by case:**

| Case | What happens |
|---|---|
| Rolling ball hits it | Bounces off by its direction and the rail's angle (mirror bounce), keeping **80%** of the speed (`railBounce` 0.8, in the tuning panel) |
| **Rail boost (Decided)** | Press Space within **0.15 s** before the hit: the bounce keeps **110%** instead (`railBoost` 1.1, capped at the full-shot top speed). One boost per hit, the same timing as the landing boost |
| Ball in the air, bottom above the rail top | Passes over |
| Ball in the air, lower | Bounces off the side like a rolling ball |
| Lofted shot or spring | Clears it easily (lofted shots peak well above 0.3) |
| Lunger, Mole and Spitter seed rolling | **Bounce off (Decided)**, with the same physics as the ball |
| Trundler, sliding block, drifting cloud | Their paths may **not** cross a rail. The schema check rejects such a course |
| **Mole (Decided)** | Can never burrow on a tile with a rail. If it stops on one, it burrows on the nearest tile without a rail that can hold it |
| Thunder cloud throws the ball | The thrown ball bounces off rails as normal |
| Tornado | Bounces off, like a rising face |
| Burner | Bounces off. It is a wall, not an enemy |
| Aim guide | Shows rail bounces, because it runs the real simulation |
| Flag poles, crates, enemies | Never placed on the rail line itself, but may share its tile |

---

## 3. Water (Decided, owner 2026-11-15; details Default)

### 3.1 New rules

| Case | What happens |
|---|---|
| Ball **comes to rest** in water | **Not sent back (Decided).** It stays where it stopped, on the bottom, and takes **1 damage (Decided)**. The 0.5 s damage immunity applies as usual |
| Next shot from inside water | Launches at **50% of its power** (`waterShotPower` 0.5), so a lofted shot is the way out. Question 1 |
| Ball rests in water again after the next shot | Another 1 damage. Each shot that ends under water costs 1. Question 2 |
| Passing through water | Unchanged: slowed hard, can roll or bounce out |
| **Skipping (Decided)** | A ball touching the water surface while moving faster than **6 tiles per second**, at a shallow angle (vertical speed less than half its horizontal speed), bounces off the surface instead of entering. It keeps 70% of its speed and loses a little height each skip. **Bounce-boost key:** pressing it just before touching the surface counts as a boost and keeps 90% (same timing window as landing). All tuning numbers |
| Rolling enemies | Unchanged: the Lunger bounces back from water edges; a Mole or seed that stops in water vanishes as before |
| "Last resting spot" | Still only updated on ground that can hold the ball. It no longer matters for water, only for falling off the course |
| Falling off the course | Unchanged: 1 damage and back to the last resting spot |

### 3.2 New look

| Feature | How |
|---|---|
| Lowered water | The generator puts water **one step below** the surrounding ground, so a bank edge shows. Water tiles keep their own corner heights, as now |
| See-through tint | As now: the bed is drawn under a tinted surface. Deeper water (further from the bank) gets a darker tint, in 2 levels |
| Animated surface | The surface sprite gets **4 frames** of shimmer, cycling every 0.25 s. Display only; the simulation does not change |
| Shore | A light foam line drawn along every edge where water meets land |
| Splash | A short splash and ripple effect when the ball, a rolling enemy or a seed enters or skips. The simulation sends a `splash` event; the display draws it |

---

## 4. Checkerboard grass (Decided, owner 2026-11-15)

- Grass tiles alternate between two shades of our green in a checker pattern by grid position (x + y even or odd). The display picks one of two frames; the simulation never sees it.
- Rough, sand and ice keep their single look for now, so grass stands out as the main playing surface.

---

## 5. The generator: courses as journeys (Decided direction, owner 2026-11-15)

**The idea:** each course is a trip the hero makes across **one solid landmass**, through a series of **areas**, from the start to the exit. Each area has its own shape (a basin, terraces, a ridge), and the way from one area to the next is a passage (a ramp, a drop, a causeway, a jump). It should feel like travelling through a dungeon level on open ground, not like playing a golf hole.

### 5.1 Steps

1. **Size and number of areas** from the budget (5.2).
2. **Board footprint:** areas laid out as a trail. Each area is a rectangle of ground. They connect end to end, turning left or right at random, so the board becomes a strip, an L, a U, a zig-zag or a winding path. Sometimes a passage is a **gap** (5.4), which splits the board into separate platforms.
3. **Overall rise or fall:** the trail slopes gently up or down from start to exit (random), so the journey climbs a mountain or descends into a valley. Each area sits at its own base height along that slope.
4. **Area landforms** (5.3): each area shapes its own ground as a smooth surface of corner heights, then the surface is made legal for our 13 tile shapes. Where areas meet at different heights, a cliff, ramp or drop joins them.
5. **Passages** (5.4) between areas.
6. **Set pieces:** ponds, spike pits, sand fields, and conveyor or booster runs on slopes, placed where the landform has room (5.6).
7. **Edges:** rails, low rims or bare drops (5.5).
8. **Content:** enemies, obstacles and pickups placed by rules (5.7), spread through the areas so the journey gets busier towards the end.
9. **Checks:** the structure check and the bot (5.8). On failure, throw it away and retry, as in Milestone 5.

### 5.2 Size scales with the budget (owner: "16×20 is fine, but much larger maps too")

| Budget | Areas | Typical board | Bot shot limit |
|---|---|---|---|
| under 10 | 2 | about 16 × 20 tiles | 20 |
| 10–14 | 3 | about 18 × 28 | 26 |
| 15–19 | 4 | about 22 × 36 | 32 |
| 20–29 | 5 | about 26 × 46 | 38 |
| 30 and up | 6–7 | about 30 × 60 | 46 |

An area is 8 to 14 tiles on a side. The maximum budget for testing stays 40.

### 5.3 Area landforms (data entries in `src/content/landforms.ts`)

Each is a list of numbers the generator draws from, so new ones are data entries.

| id | Shape | Main numbers (Default) |
|---|---|---|
| `field` | A broad tilted plane, gentle in one direction | tilt 1 step per 2–4 tiles |
| `rolling` | Low rounded hills and dips | 2–4 bumps, each 2–4 steps high, 3–6 tiles wide |
| `basin` | A wide bowl sinking towards the middle | depth 3–6 steps, flat floor 2–5 tiles across |
| `terraces` | Flat steps going up or down, each joined by a short slope or a ledge | 3–6 steps of 2–3 tiles; rise 2–4 steps each |
| `ridge` | A long raised spine with slopes falling to each side | height 3–6 steps, spine 1–2 tiles wide |
| `gully` | A long trench, like a half-pipe | depth 3–5 steps, curved sides |
| `plateau` | A raised flat top with cliffs on some sides and a ramp up | height 4–8 steps |
| `pond` | A lowered pool area with an island or a shore path | pool 4–8 tiles across, one step below its bank |

**Making it legal:** after an area builds its surface, a "settle" pass lowers any corner that would break our tile rules (corners at most one step apart within a tile, no saddles). Where an area deliberately wants a cliff (terrace ledges, plateau sides), it marks those edges, and those tiles get their own corners instead of sharing them, leaving a vertical face. Settling only ever lowers, so a shape never grows a wall the bot cannot see.

### 5.4 Passages between areas

| id | What it is | Cost |
|---|---|---|
| `ramp` | A wide slope joining two heights | 0 |
| `drop` | A cliff edge you roll off, going down the trail only (one way) | 0 |
| `causeway` | A narrow strip, 3 tiles wide, often with rails on both sides | 1 (without rails 2) |
| `gap` | Two platforms with a gap of 2–3 tiles of nothing; crossed with a lofted shot or a spring placed at the edge | 3 |
| `step-up` | A ledge 2 steps high (half a tile) that a lofted shot clears | 1 |

### 5.5 Edges

| Budget | Rails | Low rim (one step up, rough) | Bare drop |
|---|---|---|---|
| under 10 | 70% | 20% | 10% |
| 10–19 | 50% | 20% | 30% |
| 20 and up | 30% | 20% | 50% |

Shares are of the board's outline length, by straight runs. Bare drops along the main trail cost 1 per 6 tiles of edge, so harder courses are more exposed. **Interior rails:** some areas get a rail shape in the middle (a loop round an enemy, a short angled wall to bank shots off), weighted by landform: `field` and `plateau` most often.

### 5.6 Set pieces

Reusing the Milestone 5 chunk ideas as stamps placed inside areas, not as rooms:

| id | Where it fits | Cost |
|---|---|---|
| Pond with island | `pond`, `basin` floor | 2 |
| Spike pit | A lowered square with spikes, sometimes a raised middle with an enemy on it | 3 |
| Sand field | Any flat-ish ground, 2×3 to 4×5 | 1 |
| Booster or conveyor run | Along a slope, 2–4 tiles | 1 |
| Spring at a gap edge | Placed by the `gap` passage | 0 (part of the gap) |

### 5.7 Placing content: the journey gets busier

- The enemy budget is split across areas **rising along the trail** (default weights 1, 1.3, 1.6, …), so early areas are calm and the last ones are busy.
- Squads (2–5) stay within one area. Rules from Milestone 5 still apply: nothing within 2 tiles of the start, nothing around the exit, Spitter and Lunger radii clear of the start, Moles only on flat grass or rough.
- **Placement by rules, not hand-marked spots:** a tile can take an enemy if it is ground that can hold the ball, has at most a gentle slope, has no rail line through it, and has 1 tile of clear space around it. Trundler lanes are straight runs of 3–5 such tiles with no rail crossing.
- **Ability carrier:** 60% of courses, in the first or second area, as now.
- **Side pockets:** at budget 12 and up, one area in two may get a small dead-end pocket off the trail holding a crate, a secured crate or a shot orb. The journey's optional loot.
- **Exit** at the far end of the last area. **Start** at the near end of the first.
- Quota, costs and the safety rules are otherwise unchanged from Milestone 5.

### 5.8 Checks and speed

- Structure check as in Milestone 5, with the new climbing rule (section 1) and gaps (crossable only if the gap has a spring or is at most 3 tiles and lower on the far side).
- The bot as in Milestone 5, with the shot limit from 5.2, and it knows to use springs and lofted shots at gaps.
- **Speed:** bigger courses take the bot longer. Targets: **95% pass on the first try; average under 1 second up to budget 14, and up to 5 seconds above that (owner, 2026-11-15: "anything up to 5 seconds is acceptable for now as long as it is worth it").** While a course is being made, a **loading screen with an animation** shows (owner, 2026-11-15).

### 5.9 What happens to the Milestone 5 chunks

The 14 chunk files and the route layout are retired once the new generator passes its batch test. The ideas that work as stamps (pond with island, bunker) carry over as set pieces (5.6). Question 4.

---

## 6. Display

- **Overview key (O):** zooms the camera out to fit the whole course, and O again zooms back to the ball. Needed for large maps.
- The **chunks** debug view becomes **areas**: area outlines with their landform names, passage names, and the budget spend.
- **Loading screen (owner, 2026-11-15):** while a course is made, a full-screen loading card with a small animation (a ball rolling and bouncing across a strip of checkered ground) and the seed and budget. Generation runs in a background worker so the animation keeps moving.

---

## 7. Tests

- Format 3 reads base-36 heights; format 1 and 2 files load with doubled heights and play exactly as before (a recorded shot on each test course ends in the same spot before and after the conversion).
- Rail: mirror bounce at 0° and 45°; 80% speed kept; boost within the window gives 110%, outside it 80%; a ball above the rail passes; a Lunger and a seed bounce; the schema check rejects a Trundler path crossing a rail; a Mole stopping on a rail tile burrows on a neighbour.
- Water: resting in water does not move the ball and costs 1; the next shot is half power; a fast shallow ball skips, and a slow or steep one does not; boost while skipping keeps 90%.
- Generator: same seed and budget give the same course; sizes and area counts follow the table; every corner is from 0 to 35 and every tile shape is legal; edge shares are within 10% of the table; the enemy budget rises along the trail; safety rules hold on 200 courses; gaps always have a way across.
- Batch of 500 across budgets 8, 12, 20 and 30: pass rate and time per budget.

---

## 8. Not in this milestone

Story beats or a narrative for the journey (Milestone 9, with the theme and character); keys, switches and locked gates (linked objects, Milestone 8); flowing water; freezing water (the Frost ability, Milestone 8); biomes and themes (Milestone 8); the run map (Milestone 6).

---

## 9. Questions for the owner

Answered by the owner, 2026-11-15: 1 yes, 2 yes, 3 yes with up to 5 seconds and a loading animation; defaults for 4–8.

1. **Shots from water:** the next shot from inside water launches at half power, so you usually need a lofted shot to get out. Keep it, change the amount, or make shots from water normal? *Default: half power.*
2. **Repeated water damage:** each shot that ends under water costs 1 health, so getting stuck can be costly. Or should only the first stop in a given pond cost health? *Default: every time.*
3. **Generation time for large maps:** is up to about 3 seconds acceptable for budget 15 and up, with a "GENERATING…" message? *Default: yes.*
4. **Retire the Milestone 5 chunks** once the new generator works, keeping only the pond and bunker ideas as set pieces? *Default: yes.*
5. **Journey direction:** the trail climbs or descends at random. Prefer always climbing (an ascent to the exit)? *Default: random.*
6. **Rail height** 0.3 tiles: low enough that a bounced ball sometimes hops over it. Taller (never hopped except by lofted shots) or lower? *Default: 0.3.*
7. **Skipping speed:** 6 tiles per second and a shallow angle. A full ground shot is 13.2, so a firm ground shot across a pond will usually skip. *Default: as written.*
8. **Landform list:** anything you want added or removed (for example a spiral, a volcano cone, a canyon)? *Default: the eight above.*

---

## As built (2026-11-15)

Built on branch `milestone-5-course-generator`. Where the build differs from or adds to the sheet:

- **Gentle and steep tiles.** Doubling old heights turned every old slope into a two-step rise, which the 13 tile shapes did not allow. So a tile may now rise **one step (gentle, about 14°) or two (steep, about 27°, the old slope)**, in the same 12 patterns: 25 shapes in all (`src/sim/tileShape.ts`). Old courses look and play as before, and the generator can make both gentle and steep ground. Faces got a two-step cap sprite for steep edges.
- **Paths of moving things** may not cross a rise of more than half a tile (two new steps), the same limit as before in the old units.
- **Guard rail** as on the sheet. The rail boost uses the same 0.15 s window as the landing boost; on the ground, Space arms it. Rails are drawn as a post at every tile centre and the bar in quarter-tile pieces, so they follow slopes. The test bench has a "Guard rail" choice, and `?course=test-bench&bench=rail` opens it directly.
- **Water** as on the sheet: skip at more than 6 tiles per second with vertical speed under half the ground speed. Splashes show where the ball lands in or skips off water. "UNDER WATER: NEXT SHOT IS WEAKER" shows when it stops in water. Shimmer, deep water and the shore foam are display only.
- **Checkerboard** on grass only, as on the sheet.
- **Generator** (`src/gen/journey.ts` for the ground, `src/gen/generate.ts` for placing things):
  - Each area's way out (direction, passage, next area) is planned before its ground is built, with up to 8 tries if it does not fit.
  - Landforms cost nothing; passages, set pieces and bare edges spend the terrain budget.
  - Edges facing a gap are always left bare, since jumping is the point.
  - Nothing is placed within two tiles of a passage, so ramps, causeways and landings stay clear.
  - Loot in side pockets is free (outside the budget).
  - Enemies are placed from the end of the journey back, so the last areas get their share before the 10-enemy cap.
  - The start and exit tiles are flattened if they land on a slope.
- **Bot:** it finds its way by walking distance over the real ground (`distancesTo` in `src/gen/structure.ts`, using the same climbing and gap-jumping rules as the structure check), aiming a few tiles along the route when its target is far. It adds speed for uphill shots, tries lofted shots with backspin when looking harder, tries a ring of safe shots in all directions when every aimed shot hurts, and gives up after 6 shots in a row with no progress ("bot got stuck"). Its shot cap is 30 trial shots per allowed shot, at least 1,200.
- **Speed:** the unchanging obstacles (rocks, rails) are now built once per course instead of every step, and collisions skip anything far from the ball. That halved the time per simulated shot on big courses.
- **Loading screen:** generation runs in a background worker (`src/render/genWorker.ts`) while a ball bounces along a strip of checkered tiles.
- **Overview (O)** and the **areas** debug view (G) as on the sheet.
- **Batch of 500** (budgets 8, 12, 20, 30): every course passed in the end (no fallbacks). First try: 93% at budget 8, 84% at 12, 58% at 20, 39% at 30 (68% overall). Average time: 0.4 s, 0.8 s, 2.6 s and 6.1 s. **Not met:** 95% first try above budget 12, and the 5-second limit at budget 30. Most rejections are "bot got stuck" on big courses: either the course needs shots the bot cannot find, or the bot gives up too soon. The give-up rule was loosened from 6 to 10 stalled shots afterwards. Next steps, if the owner wants them: a stronger bot (more shot choices near hard spots), or tamer big courses (fewer gaps and steep ramps at high budgets), and smaller maximum sizes if 30+ stays slow.
- The Milestone 5 chunk files and route layout are removed. Pond-with-island survives as a set piece; the bunker became the sand field.

## Sign-off

- [x] Owner sign-off, 2026-11-15. Changes: generation may take up to 5 seconds above budget 14, with a loading screen animation.
