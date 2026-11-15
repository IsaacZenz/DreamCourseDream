# Milestone 6 design sheet — The run

**Status: waiting for the owner's sign-off.** Nothing on this sheet is built yet.

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
| Rows of normal nodes | 8 (enough for a countdown of 5 plus up to 3 raises, section 2.4) |
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
- Drops by 1 each time you finish a node that is not the boss: courses, shops and caches all count.
- The boss sits just above the row the countdown points to. On the map it is drawn there, with "Boss in N".
- **When the countdown reaches 0, the next step is the boss**, whatever row you are on. All links from your node lead to it.

### 2.4 Early boss and raising the countdown

- From the countdown's 3rd step onward (countdown 3, 2 or 1 when you choose), each row has a **50% chance** that one of its nodes is a **Boss (early)** node.
- Fighting the boss early earns **+1 blue star per countdown step left** (DESIGN.md open question 2, default). Blue stars have no wallet until Milestone 7, so in this milestone they are **counted and shown on the run summary only**.
- A shop service can **raise the countdown by 1, once per shop** (FEATURES.md open question F6, default). At most **3 raises per region**, which is why the map has 8 rows.

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
| Course in row r | 8 + 2 × (r − 1): row 1 = 8, row 3 = 12, row 5 = 16, row 8 = 22 |
| Hard course | 150% of that, rounded down: row 3 = 18, row 5 = 24 |
| Boss stand-in | A hard course at the budget of the row the boss sits in |
| Any run course | **Capped at 24** for now (question 3) |

The Milestone 5 rule "after a win the next budget rises by a random 0 to 4" stays for the free-play generated course (key 6). The run uses this table instead.

### 4.2 Hard course extras

FEATURES.md section 14 also asks for a guaranteed tier-up squad leader on hard courses. Tiers 3 and 4 are Milestone 8, so for now a hard course is **only the bigger budget plus its rewards**.

### 4.3 The bot plays with your upgrades

Owner, 2026-11-15: when the run exists, the generator's bot should play with the upgrades the player has at that point. So:

- The bot uses your **stats, gear and ability at the moment you enter the node**, but **full health** (otherwise a course entered on 1 health would almost never pass and generation would stall).
- This means the same node can give a different course if you arrive with different upgrades. Same seed plus same choices still gives the same run.

---

## 5. Gear

### 5.1 Rules (FEATURES.md section 8; decided parts unchanged)

- Three categories: weapon, armour, accessory. One of each.
- **On a course:** gear lies on a tile like a pickup. Rolling over it equips it. If you already hold one of that category, yours drops on that tile and the new one is equipped. Rolling back over the dropped one swaps again. You cannot pick up an item for 0.5 s after dropping it, so a ball that stops on the tile does not swap back and forth.
- **In a shop or cache:** if the category is already filled, both items are shown side by side and you confirm. The old item is **lost** (there is no ground to drop it on).
- Gear is lost on death. Gear cannot be sold (DESIGN.md open question 6).
- Rarity sets price and how often it shows up: **common weight 3, rare weight 1** (epic exists in the template; there are no epic starter items).

### 5.2 The six starter items

Each item is a data entry: id, name, icon id, category, rarity, element, modifiers while equipped, triggered effect and its trigger, price.

| Item | Category | Rarity | Price | Modifiers while equipped | Triggered effect |
|---|---|---|---|---|---|
| Studded Shell | Weapon | Common | 15 | hit damage +1 | none |
| Ember Coat | Weapon | Rare | 30 | none | Element **fire**. On a hit that does damage: the enemy gets **Burning** (question 1) |
| Padded Lining | Armour | Common | 15 | none | The **first damage** the ball would take on each course is ignored, from any source (enemies, spikes, water, falling). A small shield icon shows while it is ready |
| Thorn Guard | Armour | Rare | 30 | none | When an enemy damages the ball (its contact or its attack, including a Spitter's seed), that enemy takes 1 damage. Hazards and falling do not trigger it |
| Star Magnet | Accessory | Common | 15 | star reach +2 | none |
| Long Sight | Accessory | Common | 15 | guide length ×2 | none |

Element step: the damage calculation already has the element step. No starter enemy is weak or resistant to fire yet, so for now fire matters only through Burning.

### 5.3 Where gear comes from in this milestone

| Source | Rule |
|---|---|
| Hard course | Always 1 gear item, placed near the end of the trail, off the direct line where the generator can find room |
| Normal course | 20% chance of 1 gear item, placed the same way |
| Shop | 2 of the 5 offers (section 7) |
| Cache | 1 of the 3 choices (section 8) |
| Enemy drop | Not yet (Milestone 8, FEATURES.md open question F3) |

Gear on a course costs **no budget**. The game never offers an item you already hold.

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
| Gear | 2 | Two different items you do not hold, by rarity weight |
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

1. One random gear item you do not hold (by rarity weight).
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
- Running out of naps on a course: **costs 2 health and you leave the course** (it still counts as finished, with no reward). If that takes your health to 0, the run ends. (question 2)

### 9.3 How you get into a run

- A new key **7** starts a run (keys 1–6 stay as they are; R is already restart). The address `?run=<seed>` starts a run on a chosen seed.

### 9.4 Testing aids (debug only, in the U panel, like the tuning panel)

- +20 yellow stars.
- Give any gear item; give any upgrade.
- Set the boss countdown.
- Win the current course at once.

---

## 10. Questions for the owner

| # | Question | Default |
|---|---|---|
| 1 | Ember Coat needs **Burning**, which is planned for Milestone 8. Build it now? | Yes, **on enemies only**: 1 damage at the start of each enemy turn, for 2 turns; a second application resets the time. Burning on the ball stays in Milestone 8 |
| 2 | What happens when you run out of naps on a run course? (Today it fails the course; in a run that would end the run, which may be harsh.) | Lose 2 health and leave the course with no reward. If health hits 0, the run ends |
| 3 | Generation at budget 25+ is slow (6–20 s) and fails the bot often. Cap run courses at 24 until upgrades make bigger ones beatable? | Yes, cap at 24. Raise it after playtesting |
| 4 | Income: a course gives about 4–8 stars plus the +2 finish reward, so by the boss you have about 25–40 stars: roughly one gear item and one upgrade. Is that the right feel, or should shopping be easier? | Keep the FEATURES.md prices and tune after you play |
| 5 | Does the boss countdown also drop when you visit a shop or cache, or only after courses? | All nodes count (as DESIGN.md says) |
| 6 | Should the run be saved so a page refresh does not lose it? | No, save comes in Milestone 7 with the rest of the save system |
| 7 | Does health heal at all between courses (for example +1 after each course)? | No. Healing only from shops, caches, hearts and beating the boss (DESIGN.md open question 7) |

---

## 11. Done when (from PLAN.md)

The owner can play a full run from the first node to the stand-in boss, with shop visits and path choices.

Things to check on purpose while playtesting:

- Pick a path through a shop and one that avoids it; confirm a course-only stretch appears on some seeds.
- Raise the countdown in a shop and see the boss marker move up a row.
- Take an early boss and see the blue stars counted on the summary.
- Swap gear on a course, then roll back over the dropped item.
- Buy the same upgrade twice and see the price rise by 6.
- Get hit with Padded Lining and Thorn Guard equipped.
- Play the same seed twice with the same choices and get the same courses.
