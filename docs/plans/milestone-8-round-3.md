# Milestone 8 round 3 design sheet: second gear slots, characters, more gear and shop variety, the map, and the balance pass

**Status: waiting for the owner's sign-off.** Nothing on this sheet is built yet.

## 0. Where this fits

Round 3 is the last round of Milestone 8. The open items left in `docs/PLAN.md` under Milestone 8 are:

1. Second gear slot unlocks, and extra characters.
2. More gear and shop variety.
3. The map shows only the path taken and the next 1 to 3 choices, with a testing switch to show the whole map (owner, 2026-11-19).
4. A balance pass using the headless bot across many seeds.
5. Resolve the remaining open questions with the owner.

**Build order:** the map (smallest), then the new gear and shop variety, then the characters, then the second slots (the biggest change), and **the balance pass last**, because every item above changes the difficulty.

**Milestone 8 is done when** three regions and a final boss are playable and the owner judges the difficulty curve fair. Most of that exists already; the balance pass (section 5) is what makes the curve fair.

---

## 1. Second gear slots (FEATURES.md sections 8 and 10)

**Decided already:** "The ball holds one of each [category]. An upgrade may later allow two of a category." The unlock list in FEATURES.md section 10 has "Second weapon, armour or bauble slot (one unlock per category)", in Milestone 8.

### 1.1 The three unlocks

These are permanent, bought with blue stars in the Burrow between runs, or in a town's Burrow during a run (where they work at once), like the other permanent upgrades.

| Unlock | Cost (blue stars) | What it does |
|---|---|---|
| Second Weapon Pocket | 15 | Hold two weapons |
| Second Armour Pocket | 15 | Hold two pieces of armour |
| Second Bauble Pocket | 15 | Hold two baubles |

For scale, a region gives about 12 to 15 blue stars: 1 per course, 2 per hard course and 5 to 12 for the boss. One pocket is about one region's earnings.

### 1.2 How two of a kind works

- **Both items work.** Their stat changes add up, and both items' effects apply.
- **Weapons:** each weapon rolls its own success wheel on a hit. Two weapons with effects can both trigger on one hit, each spinning its own wheel.
- **The same item twice** is allowed, and the two stack as two separate items.
- **Picking gear up on a course** (rolling over it):
  - If the category has an empty pocket, the item goes there.
  - If both pockets are full, it replaces the **lower-rarity** of the two. If they are the same rarity, it replaces the one you have held longest.
  - Either way the replaced item stays on the ground, so you can roll back over it (as now).
- **Buying in a shop** with both pockets full asks which one to replace. It shows all three items, and Left/Right then Enter choose.
- **The Burrow** still stores one item per category. Storing or taking out picks from a list when you hold two.
- **The HUD** shows the second pocket as a fourth, fifth or sixth box next to the first three, only once unlocked.
- **The bot** that checks courses keeps using the region's par kit with one pocket per category. Unlocked pockets make the game easier for you, never harder.

---

## 2. New characters (FEATURES.md section 3)

**Decided already:** one character now, and the design must allow more. FEATURES.md gives later examples: "a heavy ball (more damage, less bounce, shorter shots); a light ball (more bounce, an extra shot, less health)." The unlock list has "New characters", in Milestone 8.

### 2.1 The two new characters

The names are working names, and the art is a recoloured placeholder. Each is a different armadillo, with its own colour on the ball and in walking places.

| Field | **Rollo** (now) | **Thud** (heavy) | **Pip** (light) |
|---|---|---|---|
| Unlock cost (blue stars) | free | 20 | 20 |
| Max health | 5 | 6 | 4 |
| Max shots | 4 | 4 | 5 |
| Hit damage | 1 | 2 | 1 |
| Shot power | 100% | 90% | 105% |
| Bounce boost | 100% | 80% | 120% |
| Starting ability | none | none | none |
| Passive trait | none | **Steady:** knock-backs push it half as far | **Nimble:** star reach +0.5 tile |
| Colours (placeholder) | pale lavender shell | slate grey shell, darker bands | sandy gold shell |

- **Choosing a character:** the Burrow gets a character row. You buy a character once, then pick which one to start each run with, like the starting ability.
- **The two traits** are new rules:
  - **Steady** halves the knock-back distance from slams, charges, blasts and Mudroller hits.
  - **Nimble** is a plain +0.5 star-reach modifier.
  - Both live in the character's data. Steady is one number used where knock-backs are worked out.
- **The course check** is unchanged. The bot still plays with the region's par kit, not the character.

---

## 3. More gear and shop variety

### 3.1 New weapons: the Needle family (poison)

Round 1 noted that "round 3 adds poison gear". The Poisoned status already exists: a poisoned enemy deals 1 less damage, for 2 turns, and the turns reset if it is poisoned again. A new effect, `poison`, puts it on the enemy that is hit, after a successful roll, exactly as Burn does now.

This also gives weapons 4 items per rarity from common to double rare, matching armour and baubles.

| Name | Rarity | Effect | Description on the card |
|---|---|---|---|
| Pin Needle | common | Poison 1 turn (on a roll) | Poison 1 turn (on a roll) |
| Thistle Needle | uncommon | Poison 2 turns (on a roll) | Poison 2 turns (on a roll) |
| Venom Needle | rare | Poison 2 turns (on a roll), hit damage +1 | Poison 2 turns (roll), hit damage +1 |
| Hex Needle | double rare | Poison 3 turns (on a roll), hit damage +1 | Poison 3 turns (roll), hit damage +1 |

- **Prices and slices** follow the rarity, as for all gear (10, 15, 30 and 45 stars; 2, 3, 4 and 5 slices).
- **Element:** none.
- **Icons:** new placeholder icons in a green "needle" style, with the usual rarity border colours.
- **Bosses:** a boss can be poisoned too (it deals 1 less damage), using the boss wheel as usual.

### 3.2 Shop variety

| Change | Where | What happens |
|---|---|---|
| **Sale** | Gear shop | One of the 3 offers is **30% off**, marked "SALE" on its card. A reroll may move the sale to another offer |
| **Grab Bag** | Gear shop, a 4th card | **25 stars** for a random gear item. Its rarity is rolled **one column better** than the shop's own odds (like a hard course). You see the item only after buying it. Once per shop visit |
| **Chef's Special** | Food shop | One of the 4 offers always lasts **3 courses** (the longest), at its normal price, marked "SPECIAL" |

- **Grab Bag and full pockets:** if what you get is for a category you have full, the usual "replace?" prompt shows. Saying no leaves the item in the shop for you to buy back at its normal price.
- **Seeded:** all three use the run's seeded random numbers, so a run's shops are the same every time.

---

## 4. The map shows only your next choices (owner, 2026-11-19)

Since Milestone 8b the map is no longer how you choose courses; the crossroads is. The map is now the view you get with M at a crossroads, and the old "use the map screen" testing switch.

- **By default** the map shows only:
  - the path already taken;
  - the 1 to 3 nodes you can go to next;
  - the boss marker and countdown.
- **Nodes further ahead** are not drawn. A faint "?" shows where the map continues.
- **A U-panel switch, "Show the whole map"**, draws everything as it is now. It is **off** by default, so you see the finished-game behaviour; turn it on when testing.

---

## 5. The balance pass

### 5.1 What gets measured

A new tool, `npm run balance`, makes and plays many courses with the course-check bot for each region and each point in the region (after 0, 3 and 6 courses, plus hard courses and boss arenas). For every course it records:

- whether the bot won;
- shots used;
- health lost;
- yellow stars earned: the meter, plus the finish reward;
- blue stars earned.

It also adds up a typical region's economy: stars earned up to each town, compared with shop prices.

**Default size:** 30 seeds per point, so about 600 courses per region. It runs in the background and writes `docs/plans/balance-report.md`.

### 5.2 Targets: a fair curve (proposed; the owner can change any of them)

| Measure | Region 1 | Region 2 | Region 3 |
|---|---|---|---|
| Bot wins a course (par kit, full health) | 95% or more | 90% or more | 85% or more |
| Health lost per course, on average | 0.5 to 1 | 1 to 1.5 | 1.5 to 2.5 |
| Shots per course, on average | well under the limit | under the limit | close to the limit on late and hard courses |
| Stars on reaching a town | enough for 2 common or uncommon items | about 1 rare item | about 1 double rare item |
| Boss fight: bot wins | 90% or more | 85% or more | 80% or more |

### 5.3 What happens with the results

1. I write the report, with tables per region, and a short list of proposed number changes. These could be threat budget, enemy toughness, prices, star rewards or boss health. Every change is a number in `src/content/`.
2. **You review the report and approve or change the proposals.** Nothing changes until you sign them off.
3. I make the approved changes, run the tool again and show the before and after.
4. Then you play a run and judge whether the curve feels fair. That is the milestone's "done when".

---

## 6. Remaining open questions (to resolve with the owner)

Each of these has run on its default so far. Confirm each, or change it.

| # | Question | Default in use now |
|---|---|---|
| D2 | Reward for fighting the boss early | +1 blue star per countdown step left |
| D3 | Does recovering refill all shots or only some? | All |
| D5 | How many uses does an ability have? | Unlimited, one per shot, until replaced |
| D6 | Can gear be sold? | No |
| D7 | Healing outside shops and caches? | Bosses heal fully; nothing else (also Apple, gear) |
| D10 | Do patrollers hurt, or only block? | Per type; the first patroller deals 1 damage and knocks the ball back |
| F1 | Poison makes the ball deal 0 at base damage: right, or never below 1? | Can reach 0; poison lasts 2 turns |
| F2 | Does swapped-out gear stay on the ground? | Yes, until you leave the course |
| F3 | Enemy gear drop chance | 10% |
| F4 | Squad theme share chance | 70% |
| F6 | Can the boss countdown be bought back up? | Yes, +1 once per shop (Garlic) |

Question 9 (the game's name, setting and final boss) belongs to Milestone 9 and stays open.

---

## 7. What gets built (files)

| Part | Files |
|---|---|
| Map | `src/render/MapScene.ts` (draw only the known part), the U-panel switch |
| Needle family | `src/content/gear.ts` (4 entries, the `poison` effect), `src/sim/play.ts` (apply Poisoned on a successful roll), placeholder icons |
| Shop variety | `src/sim/run.ts` (sale, Grab Bag, Chef's Special), `src/content/run.ts` (the numbers), `src/render/TownScene.ts` (cards) |
| Characters | `src/content/characters.ts` (Thud and Pip, traits), `src/sim/profile.ts` (owned and chosen character), the Burrow row, recoloured sprites, save version 4 |
| Second slots | `src/content/progress.ts` (three unlocks), run and loadout gear as up to two per category (`src/sim/run.ts`, `src/sim/play.ts`), pickups, shop and Burrow choices, HUD boxes, save version 4 with old saves read as before |
| Balance | `tools/balance.ts`, `npm run balance`, `docs/plans/balance-report.md` |
| Tests | Two-pocket rules (pickup replaces the lower rarity, both items' stats add up), characters' stats and traits, poison on a roll, the sale price, Grab Bag rarity, Chef's Special duration, the map shows only known nodes, old saves load |

## 8. Done when

1. Each new item works as listed and has tests.
2. Old saves (version 3) load, with their gear in the first pocket.
3. The balance report is written, you approve the changes, and they are made and measured again.
4. You play a run and judge the difficulty curve fair.
5. `npm run check` passes, and the new screens have been checked in a browser.

## 9. Things for you to playtest after it is built

1. Unlock a second weapon pocket and carry two weapons. Do both effects feel worthwhile?
2. Play a run as Thud and as Pip. Does each feel different, and is either clearly better?
3. Try the Needle weapons against a hard-hitting enemy. Does the poison help?
4. Buy a Grab Bag. Is 25 stars a fair price for the surprise?
5. Press M at a crossroads. Is seeing only the next choices better than the whole map?

## 10. Questions for you (each has a default)

| # | Question | Default |
|---|---|---|
| 1 | Cost of each second pocket | 15 blue stars each |
| 2 | With both pockets full, what does a course pickup replace? | The lower rarity (ties: the one held longest) |
| 3 | Character costs and stats (section 2.1) | As in the table; 20 blue stars each |
| 4 | Character names | Thud and Pip (working names) |
| 5 | The Needle family (section 3.1) | As in the table |
| 6 | Shop variety: Sale 30%, Grab Bag 25 stars, Chef's Special | All three, as in section 3.2 |
| 7 | "Show the whole map" switch default | Off (see only the next choices) |
| 8 | Balance targets (section 5.2) | As in the table |
| 9 | Open questions in section 6 | Keep every default |
| 10 | Build order | Map, gear and shops, characters, second slots, then balance |

## 11. Sign-off

- [ ] Owner sign-off, with any changes, recorded here and in FEATURES.md and DESIGN.md.
