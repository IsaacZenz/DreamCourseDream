# Milestone 8 round 2a design sheet: livelier terrain, two shops and the food bag

**Status: signed off by the owner, 2026-11-21 ("Go"). Built 2026-11-21 (section 10, as built). Waiting for the owner to play it.** Owner changes so far (2026-11-21): eat any number of foods before a course; spike moats can appear in region 2, rarely; region 1 gets a very small number of extra obstacles.

How to review: change any number, name or rule you want. Section 8 lists the open questions. Each one has a default that I will use if you say "defaults are fine". Every number is a starting value. They all live in `src/content/`, so they can be tuned later without touching the physics or the generator.

---

## 0. Where this round fits

Round 2 of Milestone 8 (see `docs/plans/milestone-8.md` section 0) is split in two (owner, 2026-11-21):

| Round | What | Sheet |
|---|---|---|
| **2a (this sheet)** | The detail dial, new terrain (bridges, dead trees, more spikes), two shops, the 3-slot food bag, and foods that last 1 to 3 courses | this file |
| 2b | The other four abilities (Burr, Kite, Gyre, Drift), linked objects (switches and gates that raise bridges), optional course modifiers, three biomes and the theme switch | later |
| 8b | Walkable towns and crossroads (`docs/PLAN.md`, Milestone 8b) | later, after round 2b |

**What you can play at the end of 2a:** in regions two and three, areas have more going on: two or three features per area, bridges across moats, groves of dead trees and spike strips. Region one keeps its size and its one set piece per area, with only a very few extra obstacles. Every town has a food shop and a gear shop. Food goes in a 3-slot bag, and you eat whatever you like from it before a course.

---

## 1. The detail dial (a third dial per region)

**The problem, measured on 2026-11-21:** about 95% of a late region-three course is plain grass. A course gets 0.6 obstacles per 100 tiles, about the same as region one. There are two reasons:

1. An area gets **at most one set piece** (pond, spike pit, sand field or arrow run), whatever its size.
2. Obstacles are paid for from the **leftover** threat budget after enemies. Bigger courses get more enemies, not more terrain.

**The fix:** each region gets a third dial, **detail**, alongside **size** and **threat**. Detail is paid for separately. It depends on how many tiles an area has, not on the threat budget, so adding detail does not quietly make courses harder through the enemy budget. (It does make them a little harder through the terrain itself; that is the point.)

| | Region 1 | Region 2 | Region 3 and endless |
|---|---|---|---|
| Set pieces per area | **1 (unchanged)** | 1 per 70 tiles of area, rounded up, at most 3 | 1 per 55 tiles, rounded up, at most 4 |
| Extra obstacles per 100 tiles (blockers and dead trees only; never crates, so stars and the wallet are unchanged) | **0.5, rocks and stumps only (owner, 2026-11-21: very limited)** | 1.5 | 2.5 |
| Paid from | set pieces: the threat budget, as now; extra obstacles: the detail dial | the detail dial, free of the threat budget | the detail dial |
| New set pieces available | none | moat with bridge, dead tree grove, rough patch | all of region two's, plus spike strip and ice patch |

So a 12 × 12 area (144 tiles) gets 1 set piece in region one, 3 in region two and 3 in region three. A 15 × 15 area (225 tiles) gets 1, 3 and 4.

**Promise for region one:** the same seed makes the same region-one ground, set pieces and enemies before and after this round; the only difference is the few extra rocks and stumps (about 1 to 3 per course). A test checks this.

**Targets** (measured with the same tool as the 2026-11-21 numbers, per 100 tiles):

| | Special ground (not grass) | Obstacles |
|---|---|---|
| Region 1 now | 3.4 | 0.4 |
| **Region 1, target** | **3.4 (unchanged)** | **about 0.9** |
| Region 2 late, now | 5.6 | 0.7 |
| **Region 2 late, target** | **10 to 14** | **about 2** |
| Region 3 late, now | 5.5 | 0.6 |
| **Region 3 late, target** | **14 to 18** | **about 3** |

**Speed check:** more things on a course means more work for the course check. I will run `node tools/region-timing.ts 6 2,3` again. If a late course averages over 10 s, I will bring you options instead of quietly cutting the numbers.

---

## 2. New terrain

Placeholder art for these is made by the existing art script (simple shapes and colours), like everything else at this stage. No hand-made art is needed in this round.

### 2.1 Moat with a bridge (set piece; regions 2 and 3)

A strip of water, sand or spikes 2 to 3 tiles wide runs across the area from side to side. A wooden bridge crosses it. This gives a risky straight line or a safe way round.

| Field | Value |
|---|---|
| Moat width | 2 to 3 tiles, across the whole area, from edge to edge |
| Moat filling | Region 2: water 55%, sand 35%, spikes 10% (owner, 2026-11-21: spikes can show up in region 2, much less often). Region 3: water 40%, spikes 40%, sand 20% |
| Bridge | 2 tiles wide (1 tile wide 30% of the time in region 3), at the moat's height plus 1 step, so it is a small raised walkway |
| Bridge surface | new surface **`bridge`**: rolls like grass (same friction and bounce), plank sprite |
| Rails | guard rails along both sides of the bridge 50% of the time (the existing rail object), otherwise open |
| Placement | never where it would cut the start or exit pad; the course check proves the course can still be beaten |
| Cost | from the detail dial |

How it plays:
- **On the bridge:** a ball rolls across like grass.
- **Off the side over water:** the ball falls in. It sinks if it stops there (1 damage, as now) and can skip if it is fast and low (as now).
- **Off the side over spikes:** spike damage, as now.
- **Off the side over sand:** it lands in sand and slows sharply.
- **Over the moat in the air:** a lofted shot can clear the moat anywhere; the bridge is for rolling shots.
- **Rolling enemies** treat the bridge edge like any other drop: as a wall. So they stay on the bridge or on the bank.

(Round 2b's *linked* bridges, raised and lowered by a switch, build on this.)

### 2.2 Dead tree and dead tree grove (blocker and set piece; regions 2 and 3)

| Field | Value |
|---|---|
| Id | `dead-tree` |
| Shape | round, radius 0.12 (a thin trunk) |
| Height | 2 tiles (a lofted shot must be high to clear it) |
| Bounce | 0.7 |
| Cost | 1 |
| Grove (set piece) | 3 to 5 dead trees scattered over a 4 × 4 patch of rough, at least 1.2 tiles apart, making a slalom |
| Also | one of the blockers used for extra obstacles, in regions 2 and 3 only (weight: rock 2, stump 2, low wall 1, dead tree 3) |

### 2.3 Spike strip (set piece; region 3)

| Field | Value |
|---|---|
| Shape | a line of spikes 1 tile wide and 3 to 5 tiles long, flush with the ground |
| Direction | across the trail 70% of the time (you must hop it or go round), along it 30% |
| Gap | 50% of strips have a 1-tile gap somewhere along them |
| Cost | from the detail dial |

The spike pit also becomes more common in region 3: weight 1 → 3.

### 2.4 Rough patch (region 2 and 3) and ice patch (region 3)

These are cheap variety using surfaces that already exist.

| Set piece | Size | Notes |
|---|---|---|
| Rough patch | 3 × 3 to 5 × 4, rough | slows the ball; no art needed |
| Ice patch | 2 × 2 to 4 × 3, ice | the ball slides; Frost and Chilled already use ice |

### 2.5 Set piece weights by region

| Set piece | Region 1 | Region 2 | Region 3 |
|---|---|---|---|
| Pond with island | 2 | 2 | 1 |
| Spike pit | 1 | 1 | 3 |
| Sand field | 3 | 2 | 1 |
| Booster or conveyor run | 2 | 2 | 2 |
| Moat with bridge | – | 3 | 3 |
| Dead tree grove | – | 2 | 3 |
| Rough patch | – | 2 | 1 |
| Spike strip | – | – | 3 |
| Ice patch | – | – | 2 |

Region 1's column is today's, unchanged. One area never gets the same set piece twice.

### 2.6 Scenery (owner, 2026-11-21: build it now, placeholder art, to test how it spreads over a course)

Small things on the ground that **do not touch the ball**: it rolls straight through them, and enemies ignore them. They are placed by the generator from the course seed, so the same seed always gives the same scenery. They are for looks only: the physics and the course check never see them, so scenery cannot make a course harder or slower to make.

| Prop | Id | Regions | Placeholder look |
|---|---|---|---|
| Grass tuft | `tuft` | 1, 2, 3 | a few green blades |
| Flowers | `flowers` | 1, 2 | small coloured dots |
| Pebbles | `pebbles` | 1, 2, 3 | two or three grey dots |
| Mushrooms | `mushrooms` | 2, 3 | small caps |
| Fallen leaves | `leaves` | 2, 3 | brown flecks |
| Bones | `bones` | 3 | a small white bone |

| | Region 1 | Region 2 | Region 3 and endless |
|---|---|---|---|
| Scenery per 100 tiles | 4 | 6 | 8 |
| Clusters | groups of 1 to 3 | groups of 1 to 4 | groups of 1 to 4 |
| Pick weights | tuft 4, flowers 3, pebbles 2 | tuft 3, flowers 2, pebbles 2, mushrooms 2, leaves 2 | tuft 2, pebbles 2, mushrooms 2, leaves 2, bones 2 |

Where it goes:
- Only on grass, rough and sand. Never on water, spikes, bridges, arrow tiles, springs, warps, bumpers, the start or exit tile, or a tile that holds an object.
- Not on steep slopes (it would look like it is sliding off).
- Clusters sit on neighbouring tiles, so it looks natural rather than evenly sprinkled.
- Drawn under the ball and enemies.

A U-panel switch hides all scenery, so you can compare a course with and without it.

---

## 3. Two shops

Every town has a **food shop** and a **gear shop**. Until 8b, the town screen shows both as buttons (in 8b you walk up to them). Both use the existing shop screen layout.

| | Food shop | Gear shop |
|---|---|---|
| Offers | **4** foods | **3** gear items |
| Reroll ("reshuffle") | yes, for yellow stars: 3, then 6, 12… (as now) | yes, the same |
| Reroll prices | each shop counts its own rerolls | each shop counts its own rerolls |
| Four-Leaf Clover (free first reroll) | works in each shop | works in each shop |
| Shop prices stat | applies | applies |
| What it sells | section 4 | gear, priced as now |

Stat boosts and the Heal and Delay the Boss services are no longer sold separately: they are foods (section 4). The gear shop sells gear only.

The bonus-shop (cache) node keeps working as it does now.

---

## 4. Food

### 4.1 The bag

| Rule | Value |
|---|---|
| Bag slots | 3 |
| Eating | before a course starts (and before a boss fight), **any number of foods from the bag** (owner, 2026-11-21); you may skip |
| During a course | nothing can be eaten |
| Food found on a course (an acorn from a crate) | goes into the bag. If the bag is full, choose: swap with one in the bag, or leave it |
| Buying with a full bag | not allowed ("BAG IS FULL") |
| Death | the bag is lost, like everything else in the run |
| Saving in a town | the bag is kept |
| Burrow | does not store food |

The old single "pocket" acorn goes away. A saved run that has a pocket acorn gets it moved into the bag.

### 4.2 How long food lasts (owner, 2026-11-21)

Each food in a shop or a crate comes with a duration of **1, 2 or 3 courses**. Longer durations are rarer, but not as rare as the gear rarities.

| Duration | Chance | Shown as |
|---|---|---|
| 1 course | 50% (owner, 2026-11-21; was 60%) | one pip |
| 2 courses | 30% | two pips |
| 3 courses | 20% (owner, 2026-11-21; was 10%) | three pips |

- The course you eat it before counts as the first.
- A boss fight counts as a course. A town or a cache does not.
- When it runs out, its effect goes. If max health drops, health is trimmed to the new maximum.
- Foods stack, whether eaten together or on different courses (two Chili Peppers give +20%), each with its own count.
- Apple and Garlic act at once when eaten and have no duration. **Owner, 2026-11-21:** Garlic works exactly as Delay the Boss did (no duration roll, same limits).

### 4.3 The foods

Code names (ids) stay the same, so saved runs still load. The food names below are what you see. Icons are the existing ones, so no new art is needed.

| Food | Id (unchanged) | Effect while it lasts | Icon (existing) |
|---|---|---|---|
| **Apple** | `heal` | Heal 2, at once | heal icon |
| **Garlic** | `raise` | Boss countdown +1, at once. At most once per shop and 3 times per region, as now | countdown icon |
| Mushroom Stew | `tough-shell` | Max health +1 (and heal 1 when eaten) | `upgrade-health` |
| Trail Mix | `deep-breath` | Max shots +1 | `upgrade-shots` |
| Chili Pepper | `strong-swing` | Shot power +10% | `upgrade-power` |
| Carrot | `long-arms` | Star reach +1 | `upgrade-reach` |
| Clover Honey | `lucky-charm` | Drop luck +25% | `upgrade-luck` |
| Lucky Acorn | `lucky-acorn` | +2 slices on success wheels | `acorn-lucky` |
| Golden Acorn | `golden-acorn` | +3 slices | `acorn-golden` |
| Star Acorn | `star-acorn` | +5 slices | `acorn-star` |

All of these go through the modifier system (FEATURES.md section 1), with a new duration kind, "courses", that counts down at the end of each course.

### 4.4 What the food shop stocks

Each of the 4 slots is picked by weight, with no food twice in one stock:

| Food | Weight |
|---|---|
| Each of the 5 stat foods | 3 |
| Apple | 3 (not offered at full health) |
| Garlic | 2 (not offered when no raises are left) |
| An acorn | 3 in total; which acorn is picked by the region's rarity odds, as now |

### 4.5 Prices (cheaper, owner 2026-11-21)

Food is cheaper than the old run-long boosts because it wears off. Longer durations cost more, but a little less per course.

| Food | 1 course | 2 courses | 3 courses | Was (lasted the run) |
|---|---|---|---|---|
| Stat foods, region 1 | **4** | **7** | **9** | 12, +6 each repeat |
| Stat foods, region 2 | 5 | 9 | 11 | 16 |
| Stat foods, region 3 | 6 | 11 | 14 | 20 |
| Endless | +1 per region on the 1-course price; same multipliers | | | |
| Lucky Acorn | 3 | 5 | 7 | 6 |
| Golden Acorn | 5 | 9 | 11 | 12 |
| Star Acorn | 8 | 14 | 18 | 20 |
| Apple | 6, at once | | | 10 |
| Garlic | 6, at once | | | 8 |

- Multipliers: 2 courses × 1.75, 3 courses × 2.25, rounded.
- No price rise for buying the same food again, since food wears off.
- The shop prices stat (gear and upgrades that make shopping cheaper) still applies.
- Round 3's balance pass checks these against how many stars a player earns.

### 4.6 What this changes for balance

Until now, stat boosts lasted the run, so a player grew steadily stronger from shops. From this round on, **gear and permanent upgrades are the lasting way to grow stronger**, and food is a short boost for a hard course or a boss.

The course check's bot is not affected: it plays with the region's par kit, not with food.

---

## 5. What gets built (files)

| Area | Files |
|---|---|
| Detail dial, new set pieces, weights | `src/content/run.ts` (per region), `src/content/landforms.ts`, `src/content/gen.ts`, `src/gen/journey.ts`, `src/gen/generate.ts` |
| Bridge surface | `src/content/surfaces.ts`, placeholder art via `tools/make-placeholder-art.ts`, asset manifest |
| Dead tree | `src/content/objects.ts`, placeholder art |
| Scenery | a new scenery list in `src/content/` (props, regions, weights, density), placed by `src/gen/`, drawn by `src/render/` only; placeholder art |
| Food, bag, durations | `src/content/consumables.ts` (food list, durations, prices), `src/sim/stats.ts` (the "courses" duration), `src/sim/run.ts` (bag, eating, two shops, save migration) |
| Screens | the town screen (two shop buttons), the shop screen (food or gear), a "before the course" panel to eat from the bag, bag shown in the run HUD |

---

## 6. Done when

- Region one: the same seed makes the same ground, set pieces and enemies as before; only the few extra rocks and stumps differ (test).
- Regions two and three: special ground and obstacles per 100 tiles are inside the targets in section 1 (measured with a tool and logged in the progress log).
- Late region-three courses average 10 s or less to make, with no more fallbacks than now.
- Every new set piece appears in a generated course, and every generated course still passes the course check.
- Ball on a bridge, off a bridge into water, spikes and sand; rolling enemy at a bridge edge (tests).
- Food: a 3-slot bag; any number eaten before a course; none during a course; found food goes into the bag; swap or leave when full; durations count down by courses and effects go when they run out; max health trimmed; stacking; Apple and Garlic at once (tests).
- Two shops with 4 and 3 offers and separate rerolls (tests).
- Scenery: the same seed gives the same scenery; the density per region is inside 20% of section 2.6; never on a forbidden tile; a ball rolls through a prop as if it were not there (tests).
- A saved run with an old pocket acorn loads, with the acorn in the bag (test).
- Checked in a browser with screenshots: a region-three course with a bridge, a grove and a spike strip; the town with two shops; the eat panel.

---

## 7. Things for you to playtest after it is built

1. Play a region-two and a region-three course. Do they still feel big and empty? Is anything too crowded?
2. Try rolling across a bridge, then deliberately off the side into water and into spikes.
3. Weave a rolling shot through a dead tree grove.
4. Buy food in a shop, fill the bag and pick up an acorn from a crate. Does the swap-or-leave choice make sense?
5. Eat a 3-course food and check that its effect lasts exactly three courses. Eat two foods at once and check both work.
6. Watch your wallet over a run. Is food cheap enough that you actually buy it?
7. Look at the scenery across a whole course. Is it too sparse, too busy, or too even? Use the U-panel switch to compare with and without it.

---

## 8. Open questions (each has a default)

| # | Question | Default |
|---|---|---|
| Q1 | Duration chances for 1 / 2 / 3 courses? | **Owner: 50% / 30% / 20%** |
| Q2 | Foods stack (the same food twice gives double)? | **Owner: yes for now; to be tested** |
| Q3 | Prices in section 4.5? | **Owner: yes** |
| Q4 | Detail targets: region 2 about 3 times today's obstacles, region 3 about 5 times? | **Owner: yes** |
| Q5 | Rails on bridges half the time, open the other half? | **Owner: yes** |
| Q6 | Spikes as a moat filling: region 2 10% of moats, region 3 40%? | **Owner: yes** |
| Q7 | Food found in a crate also rolls 1 to 3 courses with the same chances? | **Owner: yes** |
| Q8 | Garlic: still at most once per shop and 3 times per region? | **Owner: works exactly as before, no duration roll** |
| Q9 | Scenery that does not block the ball now or in Milestone 9? | **Owner: now, with placeholder art, to test its spread (section 2.6)** |
| Q10 | Region 1's extra obstacles: 0.5 per 100 tiles (about 1 to 3 rocks or stumps per course), no dead trees? | **Owner: yes** |

---

## 9. Sign-off

Owner answered all ten questions, 2026-11-21 (section 8). Section 2.6 (scenery) was added from the answer to Q9. **Signed off by the owner, 2026-11-21 ("Go").**

---

## 10. As built (2026-11-21)

Everything on the sheet is built. Where the build differs from the sheet, it is listed here with the reason.

**Changed while building (numbers, to hit the sheet's own targets):**

| What | Sheet | Built | Why |
|---|---|---|---|
| Region 2 extra obstacles per 100 tiles | 1.5 | **1.0** | The dead tree groves already add 3 to 5 trees each; with 1.5 the total was 3.1 per 100 tiles against the target of about 2 |
| Region 3 extra obstacles per 100 tiles | 2.5 | **1.5** | Same reason: the total was 4.1 against about 3 |
| Region 3 set pieces | 1 per 55 tiles of area | **1 per 45** | With 55, special ground was 11.6 per 100 tiles against the target of 14 to 18 |

**Measured** (6 generated courses each, after 6 counted nodes unless noted; per 100 tiles):

| | Special ground (not grass or rough) | Target | Obstacles | Target | Scenery | Sheet |
|---|---|---|---|---|---|---|
| Region 1, first course | 2.0 | 3.4 before (unchanged ground) | 0.8 | about 0.9 | 4.0 | 4 |
| Region 1, late | 4.1 | unchanged ground | 1.0 | about 0.9 | 4.0 | 4 |
| Region 2, late | 11.7 | 10 to 14 | 2.4 | about 2 | 6.0 | 6 |
| Region 3, late | 14.5 | 14 to 18 | 2.7 | about 3 | 8.0 | 8 |

Region one: a test makes 8 courses with and without the detail dial and checks the ground, set pieces, enemies and quota are identical, and the only extra objects are rocks and stumps.

**Built differently from the sheet's wording (same rule):**

- **Where you eat.** The bag opens with **B** on the map and in town, any time between courses. The map screen is the "before the course" moment, so there is no separate panel. Food found on a course with a full bag opens the bag on the map with the swap-or-leave choice.
- **How durations are kept.** The sheet said a new modifier duration kind, "courses". The run instead keeps a list of foods eaten with the courses left, and each working food adds an ordinary run modifier. The effect is the same; this kept the stat system unchanged.
- **Moats** keep one row of plain ground beyond both sides, so a bridge never leads straight into a pond or pit (found by a test). All moat fillings, sand included, are one step lower than the bridge, as the sheet says; where the ground under a moat was not perfectly smooth, one corner can be level or two steps down.
- **Both shops use the shop building** for now (the gear shop's is tinted blue). Their own looks come in Milestone 9.
- **Garlic's icon** is the boss icon and **Apple's** is the heart, as before (no new art).
- **The cache** is unchanged: gear, a run upgrade (for the rest of the run) or a heal.
- **Saves** are version 3. A run saved in a town before this round loads with its pocket acorn in the bag, the gear shop keeps only its gear, and the food shop is opened again from the seed.

**Testing aids:**

- U panel: **Hide scenery / Show scenery**.
- `?course=generated&region=3` (or 2) makes the generated test course the size, mix and detail of a late course in that region, without playing a run. (The bot there plays without the region's par kit, so it rejects more attempts and takes longer than in a run.)

**Tests:** 28 new in `tests/round2a.test.ts`; four existing tests changed for the new rules (the pocket acorn, an acorn working at once when picked up, a shop upgrade getting dearer, the slopes course gaining a bridge tile).

**Owner change after the build (2026-11-21): food picked up on a course.** The game pauses and asks **E: eat it now** or **S/Enter: stash it** in the bag. Eaten now, it works for the rest of that course (which counts as its first of the 1 to 3 it lasts); Apple heals at once and Garlic raises the countdown when the course ends. With the bag full it is eaten at once ("BAG FULL: ATE IT NOW"). Anything still undecided when a course ends is stashed if it fits. The swap-or-leave choice after the course is gone. Tests: 4 new (eat, stash, bag full, undecided at the end) and 1 changed. Also moved the "ACORN +N SLICES" line on the course screen so it no longer covers the shot type.
