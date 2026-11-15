# Milestone 6 design sheet — The run

**Status: signed off by the owner, 2026-11-15**, with changes to questions 2, 3 and 5 (see [section 10](#10-questions-for-the-owner)). Sections 2.1, 2.3, 2.4, 4.1 and 9.2 already show the changes. **Built 2026-11-15**, with the town and the Burrow added by the owner during the build (section 10b); differences in section 12.

How to review: read each section, change any number or rule you want, and answer the numbered questions in [section 10](#10-questions-for-the-owner). Each question has a default, so "use the defaults" is a valid answer. Every number here is a starting value and goes into `src/content/` so it can be tuned later.

Where this sheet uses a default from an open question in DESIGN.md or FEATURES.md, it says so.

---

## 1. What a run is, in one paragraph

You start a run with a **run seed**. The game makes a **branching map** from it. You stand below the first row and pick one of the nodes you can reach: a **Course**, a **Hard course**, a **Shop**, a **Cache**, or (later in the map) an **early Boss**. Finishing a node moves you up one row and lowers the **boss countdown** by 1. At zero the boss is forced. Between nodes you keep your **health, yellow stars, ability, gear and run upgrades**; your **shots and naps refill** at the start of every course. Each course is generated with a **difficulty budget** that rises row by row. Losing all your health ends the run. Beating the boss ends the run with a win in this milestone (the boss is a stand-in hard course until Milestone 7 builds The Warden; region two also comes in Milestone 7).

Same run seed plus the same choices gives the same run, every time (CLAUDE.md rule 3).

---

## 2. The map

### 2.1 Shape

| Rule | Starting value |
|---|---|
| Rows of normal nodes | 16 (shops do not lower the countdown, so a path with shops needs more rows: a countdown of 5 plus up to 3 raises, with a shop between each) |
| Nodes per row | 2 to 4 |
| Lanes (columns) | 4; a node sits in one lane |
| Links | Each node links to 1 or 2 nodes in the next row, in its own lane or a neighbouring lane. Lines never cross. Every node can be reached from row 1 |
| Row 1 | Always 3 nodes, all Course |

You can only move up, one row at a time, along a link.

### 2.2 Node types and how often they appear

| Node | Chance (rows 2 and up) | What happens |
|---|---|---|
| Course | 55% | A generated course at the row's budget (section 4). Reward on finishing: +2 yellow stars |
| Hard course | 15% | A generated course at 150% of the row's budget. Reward on finishing: +6 yellow stars, and a gear item is always placed on the course (section 5.3) |
| Shop | 15% | Section 7 |
| Cache | 15% | Section 8 |
| Boss (early) | see 2.4 | The boss, fought early |

Rules on top of the chances (DESIGN.md section 10, decided: shops not guaranteed, course-only stretches possible):

- **No shop in row 1 or row 2.**
- **At most one shop per row**, and a shop never links straight to another shop.
- **Course-only stretch:** each row from 3 up has a 20% chance to be "course only" (only Course and Hard course nodes). Two such rows may come in a row.
- **Hard courses** do not appear before row 3.

### 2.3 The boss countdown

- Starts at **5** (DESIGN.md open question 1, default: 5, same for every region).
- Drops by 1 each time you finish a **course, hard course or cache**. **Shops do not count** (owner, 2026-11-15).
- The boss sits just above the row the countdown points to. On the map it is drawn there, with "Boss in N".
- **When the countdown reaches 0, the next step is the boss**, whatever row you are on. All links from your node lead to it.

### 2.4 Early boss and raising the countdown

- From the countdown's 3rd step onward (countdown 3, 2 or 1 when you choose), each row has a **50% chance** that one of its nodes is a **Boss (early)** node.
- Fighting the boss early earns **+1 blue star per countdown step left** (DESIGN.md open question 2, default). Blue stars have no wallet until Milestone 7, so in this milestone they are **counted and shown on the run summary only**.
- A shop service can **raise the countdown by 1, once per shop** (FEATURES.md open question F6, default). At most **3 raises per region**.

### 2.5 Determinism

All map and node randomness comes from the run seed through forks of the seeded generator: `map`, `node:<row>:<lane>`, `shop:<row>:<lane>`, `cache:<row>:<lane>`. A course's seed is the run seed plus its node, so the same node gives the same course whichever path led to it (except for section 4.3).

---

## 3. What carries between nodes

| Thing | Between nodes | Notes |
|---|---|---|
| Health | Kept | Healed only by shops, caches, hearts and beating the boss (DESIGN.md open question 7) |
| Shots | Refilled to max at each course start | |
| Naps | Back to 2 at each course start | |
| Yellow stars (wallet) | Kept | Run starts with 0 (Head Start comes in Milestone 7) |
| Ability | Kept | Still lost by falling off the edge |
| Gear | Kept | Section 5 |
| Run upgrades | Kept | Section 6 |
| Statuses | Cleared | |
| Swapped-out gear on the ground | Lost when you leave the course | FEATURES.md open question F2, default |

**On death:** the run ends. You see the run summary (rows reached, courses finished, stars earned, gear held, early-boss blue stars counted), then choose **New run** (new seed) or **Same seed again** (for testing and reproducing).

**Refreshing the page loses the run.** Saving is Milestone 7.

---

## 4. Difficulty along the run

### 4.1 Budget per row

| Node | Budget |
|---|---|
| Course after n counted nodes (courses, hard courses and caches finished; shops do not count) | 8 + 2 × n: first course = 8, after 2 = 12, after 4 = 16, after 7 = 22 |
| Hard course | 150% of that, rounded down: after 2 = 18, after 4 = 24 |
| Boss stand-in | A hard course at the budget it would have as the next node |
| Any run course | **Capped at 30** for now (owner, question 3). Large courses can take 10–20 s to make; the loading animation covers it |

The Milestone 5 rule "after a win the next budget rises by a random 0 to 4" stays for the free-play generated course (key 6). The run uses this table instead.

### 4.2 Hard course extras

FEATURES.md section 14 also asks for a guaranteed tier-up squad leader on hard courses. Tiers 3 and 4 are Milestone 8, so for now a hard course is **only the bigger budget plus its rewards**.

### 4.3 The bot plays with your upgrades

Owner, 2026-11-15: when the run exists, the generator's bot should play with the upgrades the player has at that point. So:

- The bot uses your **stats, gear and ability at the moment you enter the node**, but **full health** (otherwise a course entered on 1 health would almost never pass and generation would stall).
- This means the same node can give a different course if you arrive with different upgrades. Same seed plus same choices still gives the same run.

---

## 5. Gear

**Owner, 2026-11-15:** a large gear list instead of the six starter items. **Six rarities in three pairs**: (common, uncommon), (rare, double rare), (special rare, legendary). **Three items per rarity in each category**: 3 × 6 × 3 = **54 items**, all built in this milestone. The first four rarities are built as **families** (one base effect, stronger versions with new names); special rare and legendary items each have **their own effect**. The third category is renamed from accessory to **Bauble**. The shop, caches and course drops all pick from the full list, and better rarities become likelier as the run goes on.

### 5.1 Rules (FEATURES.md section 8; decided parts unchanged)

- Three categories: **weapon**, **armour**, **bauble**. One of each.
- **On a course:** gear lies on a tile like a pickup. Rolling over it equips it. If you already hold one of that category, yours drops on that tile and the new one is equipped. Rolling back over the dropped one swaps again. You cannot pick up an item for 0.5 s after dropping it, so a ball that stops on the tile does not swap back and forth.
- **In a shop or cache:** if the category is already filled, both items are shown side by side and you confirm. The old item is **lost** (there is no ground to drop it on).
- Gear is lost on death. Gear cannot be sold (DESIGN.md open question 6).
- Each item is a data entry: id, name, icon id, category, rarity, element, modifiers while equipped, triggered effect and its trigger, price.

### 5.2 Rarity: price and how often it shows up

Picking an item: first roll the rarity from the table for where you are, then pick one item of that rarity and the needed category at random (never one you hold).

| Rarity | Pair | Price | Region 1, counted nodes 0–3 | Region 1, counted nodes 4+ | Region 2 | Region 3 |
|---|---|---|---|---|---|---|
| Common | 1 | 10 | 70% | 45% | 15% | 5% |
| Uncommon | 1 | 15 | 25% | 40% | 35% | 15% |
| Rare | 2 | 25 | 5% | 13% | 30% | 25% |
| Double rare | 2 | 35 | – | 2% | 15% | 30% |
| Special rare | 3 | 50 | – | – | 5% | 18% |
| Legendary | 3 | 70 | – | – | – | 7% |

- Regions 2 and 3 arrive in Milestones 7 and 8; their columns are written now so the table is ready.
- A **hard course** and a **boss** roll on the next column to the right (better odds).
- **Drop luck** shifts odds up: each +25% drop luck moves 5 points from the lowest rarity on offer to the next one up.
- In this milestone the top pair can only be seen through the test panel ("give gear", section 9.4).

### 5.3 Weapons (on contact with an enemy)

**Families (common to double rare).**

| Family | Common | Uncommon | Rare | Double rare |
|---|---|---|---|---|
| **Shell** (more damage) | Studded Shell: hit damage +1 | Spiked Shell: hit damage +1, shot power +5% | Iron Shell: hit damage +2 | Steel Shell: hit damage +2, shot power +10% |
| **Coat** (fire) | Ember Coat: hits are fire; burn 1 turn | Cinder Coat: burn 2 turns | Blaze Coat: burn 2 turns, hit damage +1 | Inferno Coat: burn 3 turns, hit damage +1 |
| **Knob** (stun) | Bonk Knob: 20% chance a hit stuns | Thump Knob: 35% | Clang Knob: 50% | Gong Knob: 50%, and stunned enemies take +1 damage |

**Special rare.**

| Item | Effect |
|---|---|
| Thunder Knuckle | Hits are shock. Each damaging hit also zaps the nearest other enemy within 3 tiles for 1 damage |
| Wrecking Shell | Hit damage +2. Defeating an enemy does not slow the ball; it rolls on through |
| Leech Fang | The first damaging hit each shot heals 1 health |

**Legendary.**

| Item | Effect |
|---|---|
| Sunfire Crown | Hits are fire, burn 3 turns. A burning enemy that is defeated bursts and deals 1 damage to enemies within 1.5 tiles |
| Giant's Knuckle | Hit damage +3. Hits knock the enemy 2 tiles away from the ball |
| Echo Shell | The first hit each shot counts twice: double damage and 2 shots back |

### 5.4 Armour (when the ball takes damage or touches a hazard)

**Families (common to double rare).**

| Family | Common | Uncommon | Rare | Double rare |
|---|---|---|---|---|
| **Lining** (ignore damage) | Padded Lining: the first damage each course is ignored | Quilted Lining: first damage ignored, max health +1 | Double Lining: first 2 damages ignored | Plated Lining: first 2 ignored, max health +1 |
| **Guard** (hit back) | Thorn Guard: an enemy that damages the ball takes 1 damage | Bramble Guard: 1 damage and the enemy is stunned | Briar Guard: 2 damage | Thicket Guard: 2 damage and stunned |
| **Hide** (more health) | Thick Hide: max health +1 | Tough Hide: max health +2 | Stone Hide: max health +3 | Granite Hide: max health +3, heal 1 after each course |

"Ignored" covers every source: enemies, spikes, water, falling. A small shield icon shows how many are left this course. Guard items trigger only on enemy damage (contact or attack, including a Spitter's seed), not hazards.

**Special rare.**

| Item | Effect |
|---|---|
| Mirror Plate | An enemy's thrown attack (a Spitter's seed) that hits the ball bounces back and hits the thrower for the same damage. The ball still takes it |
| Cork Plate | Stopping in water and falling off the edge cost no health (falling still loses the ability) |
| Moss Plate | Heal 1 at the start of each course |

**Legendary.**

| Item | Effect |
|---|---|
| Phoenix Plate | Once: when health would drop to 0, you stay at 3 health instead. The plate then crumbles (it is lost) |
| Bastion Plate | Max health +3, and the first 2 damages each course are ignored |
| Storm Cloak | Thunder clouds and spikes cannot hurt the ball; max health +1 |

### 5.5 Baubles (always on)

**Families (common to double rare).**

| Family | Common | Uncommon | Rare | Double rare |
|---|---|---|---|---|
| **Magnet** (star reach) | Star Magnet: star reach +1 | Star Lodestone: +2 | Star Anchor: +3 | Star Heart: +3, drop luck +10% |
| **Sight** (aim guide) | Long Sight: guide length ×1.5 | Far Sight: ×2 | Eagle Sight: ×2.5 | Hawk Sight: ×3 |
| **Pebble** (luck and prices) | Lucky Pebble: drop luck +25% | Lucky Stone: drop luck +50% | Lucky Gem: drop luck +50%, shop prices −10% | Lucky Jewel: drop luck +75%, shop prices −15% |

**Special rare.**

| Item | Effect |
|---|---|
| Pocket Pillow | One extra nap each course (3 instead of 2) |
| Golden Tooth | +1 yellow star (wallet only, not the meter) for every enemy defeated |
| Feather Charm | Bounce boost +100% |

**Legendary.**

| Item | Effect |
|---|---|
| Crown of Plenty | Every yellow star picked up counts twice in the wallet (the meter counts it once) |
| Pocket Watch | Max shots +2 and one extra nap each course |
| Four-Leaf Clover | Drop luck ×2, shop prices −25%, and the first reroll in each shop is free |

### 5.6 New pieces this list needs

- **Burning on enemies** (question 1): fire weapons need it now, not in Milestone 8.
- **Shock element**: already listed as a default element (FEATURES.md open question F5); no enemy is weak or resistant yet.
- **Naps become a stat** (`naps`, base 2) so Pocket Pillow and Pocket Watch change it through the modifier system.
- **Ignore-damage counter** per course (Lining family, Bastion Plate).
- Item names are working names; rename any of them.

### 5.7 Where gear comes from in this milestone

| Source | Rule |
|---|---|
| Hard course | Always 1 gear item, placed near the end of the trail, off the direct line where the generator can find room |
| Normal course | 20% chance of 1 gear item, placed the same way |
| Shop | 2 of the 5 offers (section 7) |
| Cache | 1 of the 3 choices (section 8) |
| Enemy drop | Not yet (Milestone 8, FEATURES.md open question F3) |

Gear on a course costs **no budget**. Category is random (equal chance), then rarity by section 5.2.

---

## 6. Run upgrades

Plain stat boosts, one modifier each, lasting the run, stacking with no limit (FEATURES.md section 9).

| Upgrade | Modifier | Price (1st, 2nd, 3rd… in one run) | Notes |
|---|---|---|---|
| Tough Shell | max health +1 | 12, 18, 24… | Also heals 1 |
| Deep Breath | max shots +1 | 12, 18, 24… | |
| Strong Swing | shot power +0.1 (added to the base 100%) | 12, 18, 24… | Added, not multiplied, so three of them give 130%, not 133% |
| Long Arms | star reach +1 | 12, 18, 24… | |
| Lucky Charm | drop luck +0.25 | 12, 18, 24… | |

Names are working names. The price rises by 6 each time **that same** upgrade is bought in the run (FEATURES.md section 14). Caches give an upgrade free and do not raise its price.

---

## 7. The shop

### 7.1 Stock

| Slot | Count | Rule |
|---|---|---|
| Gear | 2 | Two different items you do not hold, rarity by section 5.2 |
| Run upgrade | 2 | Two different upgrades |
| Service | 1 | Heal 2 (price 10) or raise the boss countdown by 1 (price 8), 50/50. If no raises are left in this region, always Heal 2 |

### 7.2 Buying and rerolling

- Prices are rounded after the **shop prices** stat (FEATURES.md section 11). Nothing changes that stat yet; Haggler comes in Milestone 7.
- A bought slot shows "sold".
- **Reroll:** first one costs 3, then 6, 12… within that shop. It replaces every **unsold** slot.
- Heal cannot go above max health; it is greyed out at full health.
- The shop counts as a finished node when you leave it, bought or not.

### 7.3 Screen and keys

Five cards in a row with name, icon, price and a one-line effect. Left/right to choose, Enter to buy, R to reroll, Esc to leave (asks "Leave the shop?"). The wallet and current gear are shown at the top. Keyboard only (owner rule, 2026-11-14); the mouse also works.

---

## 8. The cache

A free pick of **one** from three:

1. One random gear item you do not hold (rarity by section 5.2).
2. One random run upgrade (free, does not raise its shop price).
3. Heal 2.

Same keys as the shop. Taking one finishes the node. Leaving without taking anything also finishes it.

---

## 9. Screens and testing aids

### 9.1 Map screen

- The map scrolls upward: row 1 at the bottom. Nodes are placeholder icons (one sprite id per node type, through the manifest), linked by lines.
- Where you are, the nodes you can reach (highlighted) and the boss marker with "Boss in N".
- Left/right to pick among reachable nodes, Enter to go. A small panel shows the node type and, for courses, the budget.
- Always on screen: health, wallet, gear icons, upgrades bought (as small icons with counts), run seed.

### 9.2 During a course

- The HUD adds the three gear slots (empty or the item's icon) and the Padded Lining shield when ready.
- Finishing a course goes to a short "course complete" screen with the reward, then back to the map.
- Losing all health goes to the run summary.
- Running out of shots a third time (no naps left) **fails the course, and that ends the run** (owner, 2026-11-15, question 2). It goes to the run summary.

### 9.3 How you get into a run

- A new key **7** starts a run (keys 1–6 stay as they are; R is already restart). The address `?run=<seed>` starts a run on a chosen seed.

### 9.4 Testing aids (debug only, in the U panel, like the tuning panel)

- +20 yellow stars.
- Give any gear item; give any upgrade.
- Set the boss countdown.
- Win the current course at once.

---

## 10. Questions for the owner

| # | Question | Default | Answer |
|---|---|---|---|
| 1 | The fire weapons (Coat family, Sunfire Crown) need **Burning**, which is planned for Milestone 8. Build it now? | Yes, **on enemies only**: 1 damage at the start of each enemy turn, for 2 turns; a second application resets the time. Burning on the ball stays in Milestone 8 | **Owner: yes.** Burning on enemies only, as in the default. |
| 2 | What happens when you run out of naps on a run course? (Today it fails the course; in a run that would end the run, which may be harsh.) | Lose 2 health and leave the course with no reward. If health hits 0, the run ends | **Owner: keep the loss.** Running out of naps fails the course and ends the run. |
| 3 | Generation at budget 25+ is slow (6–20 s) and fails the bot often. Cap run courses at 24 until upgrades make bigger ones beatable? | Yes, cap at 24. Raise it after playtesting | **Owner: cap at 30** for now. |
| 4 | Income: a course gives about 4–8 stars plus the +2 finish reward, so by the boss you have about 25–40 stars: roughly two or three common/uncommon gear items, or one item and one upgrade. Is that the right feel, or should shopping be easier? | Keep these prices and tune after you play | **Owner: default.** |
| 5 | Does the boss countdown also drop when you visit a shop or cache, or only after courses? | All nodes count (as DESIGN.md says) | **Owner: shops do not count.** Courses, hard courses and caches do. |
| 6 | Should the run be saved so a page refresh does not lose it? | No, save comes in Milestone 7 with the rest of the save system | **Owner: not yet; address later.** |
| 7 | Does health heal at all between courses (for example +1 after each course)? | No. Healing only from shops, caches, hearts and beating the boss (DESIGN.md open question 7) | **Owner: default.** |

---

## 10b. Owner addition during the build: the town and the Burrow (2026-11-15)

- **A shop node is a little town.** It has the **shop** and the player's **Burrow** (home base). Walk between them; enter and leave each as often as you like; a **Continue** signpost carries on with the journey. Drawn in the game's pixel style (owner).
- **The Burrow stores one gear item per category.** Stored gear is **safe from death**: it stays in the Burrow and is there at the start of every later run. In a town you can store the item you wear, take a stored item out and wear it, or swap the two.
- **Saving the Burrow:** its contents are saved in the browser now, so they also survive closing the page (owner chose this).
- **Planned for Milestone 7:** the town is also the **save point** for a run in progress: leave the game at a town and carry on later. Death still starts the run over.

Defaults chosen while building (owner may change): storing and taking out are free; the Burrow is only reachable in a town (there are none in rows 1 and 2, so gear from a previous run is first reachable at the first town); taking off an item that raised max health lowers max health and any health above the new maximum is lost.

---

## 12. As built (2026-11-15)

Differences from the sheet above, and choices the sheet left open:

- **Early boss:** an early-boss node is shown and played as a normal course until the countdown is 3 or less; then it is the boss.
- **Boss marker:** a red dashed line across the map just above the row the countdown points to, with the boss icon and "BOSS IN N" at its end. Towns do not lower the countdown, so a path through towns climbs past the line before the boss comes.
- **Hard course extras:** only the bigger budget, the reward and the gear item. The tier-up squad leader waits for tiers 3 and 4 (Milestone 8).
- **Gear on a course** is placed after the course passes its checks (it costs no budget, so the bot does not see it).
- **The bot** plays with the player's stats, gear and ability, at full health (section 4.3). A different loadout makes a different course for the same node.
- **Guard family and Mirror Plate** hurt the enemy back even when a Lining ignores the damage.
- **Giant's Knuckle** throws sentinels; patrollers keep to their path and just take the damage.
- **Burning** applied again keeps whichever time is longer.
- **Rerolls** keep sold slots and replace the rest. If no gear is left to offer, a gear slot offers Patch Up instead.
- **No restarts in a run:** R does nothing on a run course. Keys 1 to 6 still go to the test courses; key 7 goes back to the run.
- **Testing aids** in the U panel (map, town and course): +20 yellow stars, give any gear item, give any upgrade, set the countdown, win this course.
- **Course seed:** `<run seed>-<node>` (for example `TOWN4-R3L1`); the boss is `<run seed>-BOSS<row>`.
- Rarity colours on borders and text: common grey, uncommon green, rare blue, double rare purple, special rare orange, legendary gold.

---

## 11. Done when (from PLAN.md)

The owner can play a full run from the first node to the stand-in boss, with shop visits and path choices.

Things to check on purpose while playtesting:

- Pick a path through a town and one that avoids it; confirm a course-only stretch appears on some seeds.
- In a town: visit the shop and the Burrow several times, store an item, die on purpose, start a new run, and find the item waiting in the Burrow at the first town.
- Raise the countdown in a shop and see the boss marker move up a row.
- Take an early boss and see the blue stars counted on the summary.
- Swap gear on a course, then roll back over the dropped item.
- Buy the same upgrade twice and see the price rise by 6.
- Get hit with Padded Lining and Thorn Guard equipped.
- Use the test panel to try a few special rare and legendary items (Echo Shell, Phoenix Plate, Pocket Watch).
- Over several shops, check that commons dominate early and uncommons grow later in the map.
- Play the same seed twice with the same choices and get the same courses.
