# Milestone 7 design sheet — Boss and permanent progress

**Status: signed off by the owner, 2026-11-17**, after three rounds of answers (sections 10, 10c and 10d). **Built 2026-11-18**; differences from the sheet are in [section 12](#12-as-built-2026-11-18). Waiting for the owner to play it.

How to review: read each section, change any number or rule you want. Every number here is a starting value and goes into `src/content/` so it can be tuned later.

---

## 1. What this milestone adds, in one paragraph

The stand-in boss is replaced by **The Warden**, a real boss with a big health bar and three phases, fought in one of **five themed arenas**. **Blue stars** get a wallet that lasts between runs. Between runs you are in your home, **the Burrow**, where you spend blue stars on **permanent upgrades** and buy **starting abilities**. The game is **saved**: the Burrow (stash, upgrades, stored gear) always, and a run in progress whenever you are in a town. Beating The Warden heals you, gives you a gear pick, and starts **region two**, where courses are **bigger** and enemies are **tougher**, each scaled separately.

---

## 2. The Warden (FEATURES.md section 5)

### 2.1 Template

| Field | Value |
|---|---|
| id | `warden` |
| name | The Warden (working name; owner kept it) |
| sprite id | `warden` (placeholder: a big armoured stone shape, about two tiles wide; one frame per phase so you can see it crack) |
| health | **12** in region 1, **18** in region 2 (section 7.4) |
| element | none; not weak or resistant to anything |
| gimmick | none (FEATURES.md: the first boss has no gimmick; the arenas carry the variety, section 3) |
| size | round, radius 0.9 tiles, height 1.6 tiles (too tall to loft over with a normal shot) |
| movement | none; stands in the middle of its arena |
| contact | touching it never hurts the ball; the ball bounces off it (bounce 0.6) |
| arena layout set | `warden-arenas` (section 3) |
| rewards | section 2.7 |

### 2.2 Phases

The phase is set by how much health is left. Thresholds are fractions of full health, so they work in every region.

| Phase | Health left | What it does on each enemy turn |
|---|---|---|
| 1 — Slow slams | above 2/3 (12 to 9) | **Slam** (2.3). No summons |
| 2 — Summons | 2/3 to 1/3 (8 to 5) | No slams. **Summons** one minion (2.4) if fewer than 3 of its minions are alive |
| 3 — Both, faster | below 1/3 (4 to 1) | **Bigger slam** (radius 2.25 instead of 1.5), and a summon every enemy turn while fewer than 2 minions are alive |

It acts on **every** enemy turn, including the extra turn during a nap. It is active from the start of the fight; it does not wait for a trigger.

**Changing phase:** when a hit takes the Warden into the next phase, it **sheds a plate**: a heart and a shot orb drop near it, any slam mark on the ground is cleared, and the sprite changes.

### 2.3 The slam

Works like the Spitter: a warning first, the attack a turn later, so you always get one shot to get out of the way.

- **Mark:** on its enemy turn, the Warden marks a circle on the ground around where the ball is resting (radius 1.5 tiles; 2.25 in phase 3), drawn as a red ring.
- **Land:** on its next enemy turn, the slam lands on the marked circle first, then it marks a new one.
- A ball **on the ground** inside the circle when it lands takes **1 damage** and is knocked out of the circle (6 tiles per second away from the centre, with a small hop). The 0.5 s damage immunity applies as usual.
- A slam does not hurt minions and does not touch flag poles, stars or pickups.

### 2.4 Summons

- A summoned minion appears at one of the arena's **spawn spots** (section 3), chosen at random from the run seed, never one with the ball or another thing within 1 tile.
- It appears with a short puff and cannot act on the turn it appears.

| Minion | Phase 2 | Phase 3 |
|---|---|---|
| Mossback | 40% | – |
| An ability carrier (Anchorback, Emberback, Hopback, Whirlback, equal chance) | 40% | 50% |
| Spitter | 20% | 25% |
| Lunger | – | 25% |

- Minions are normal enemies: a hit gives a shot back, a defeat gives 1 yellow star (into the wallet; the arena has no quota) and a carrier gives its ability.
- **Owner, 2026-11-17 (question 7, default): minions leave no flag pole**; they vanish in a puff.
- When the Warden is defeated, all its minions vanish too.

### 2.5 Gear against the Warden

- **Success rolls on a boss use the boss wheel** (section 4b): 20 slices instead of 10, so every weapon effect is half as likely to work on a boss.
- A stunned Warden **skips its next action** (one slam or one summon), then carries on.
- **Burning** works on it (1 damage at the start of each enemy turn), once the burn roll succeeds.
- **Giant's Knuckle** does not push it (it never moves), but the extra damage always counts.

### 2.6 Winning and losing in the arena

- **No star quota.** The exit is shown closed from the start and **opens when the Warden is defeated**. You still roll into it to finish.
- Shots, naps and health work as on any course. Running out of naps or health in the arena ends the run.

### 2.7 Rewards for beating the Warden

| Reward | Region 1 | Region 2 |
|---|---|---|
| Blue stars | 5 | 8 |
| Early boss bonus (DESIGN.md open question 2) | +1 per countdown step left | same |
| Heal | to full | same |
| Gear | a pick of 1 from 3 items, on the "better" rarity column | same |

Boss blue stars are **banked at once** (section 4.2). Then region two starts (section 7). Beating the region-two Warden ends the run with a win in this milestone.

### 2.8 Which boss a region gets (owner, 2026-11-17, question 5)

Each region's boss is picked by a **boss randomizer**: a random pick from that region's boss pool, from the run seed. In this milestone every pool holds only the Warden, as a placeholder. When Milestone 8 adds bosses, they join the pools as data, with no code change.

---

## 3. The arenas (owner, 2026-11-17, question 6)

**Five hand-built arenas, each with its own gimmick.** Stored as course files under `src/content/arenas/`, built only from tiles and objects that already exist. About 13 × 13 tiles each, start in front of the Warden, exit behind it.

| Arena | Gimmick | How it plays |
|---|---|---|
| **Bumper Ring** | Pinball | A round floor ringed by bumper walls instead of rails, and four bumper posts. Every edge throws the ball back hard, so shots ricochet. Easy to stay on, hard to stop where you want |
| **Sinkhole Bowl** | Gravity | The floor slopes gently down towards the Warden on all sides. A slow ball rolls back in, often into the slam ring. Flat ledges round the rim are the safe spots |
| **Ice Rink** | Slippery | An ice floor with a few sand patches. The ball slides a long way; the sand patches are the only places it stops quickly, and the Warden's slams aim where you stop |
| **The Moat** | Water | The Warden stands on a raised island in a ring of water. Two springs and a booster lane get you across; skipping over the water works too. Stopping in the water costs health as usual |
| **Storm Steps** | Thunder | Three wide terraces climbing to the Warden's platform, with two thunder clouds drifting along them. Lofted shots and hops get over the clouds |

Each arena file adds two fields:

- `"boss": { "id": "warden", "at": [x, y] }` — where the boss stands.
- `"spawns": [[x, y], ...]` — 6 to 8 spawn spots for summons.

**Never the same arena twice in a row.** The arena is picked at random from the run seed, leaving out the one used in the last boss fight. That one is remembered in the save, so it also holds from one run to the next. (So the same seed can give a different arena if your last fight was different; like the bot playing with your gear in Milestone 6.)

**Beatable check (CLAUDE.md rule 6):** the arenas are hand-built, so the check runs in the tests: the headless bot plays every arena with a fresh ball on 20 seeds each and must win at least half. An arena that fails is changed before it ships. The course file check also confirms the boss, start, exit and every spawn spot stand on ground that holds the ball and can be reached.

---

## 4. Blue stars

### 4.1 Sources (owner, 2026-11-17, question 1: as listed)

| Source | Amount or chance |
|---|---|
| Finishing a course | 1 |
| Finishing a hard course | 2 (replaces DESIGN.md's "a blue star chance") |
| Beating the Warden | 5 (region 1), 8 (region 2) |
| Fighting the Warden early | +1 per countdown step left |
| Breaking a crate | 2% chance, times drop luck |
| Breaking a secured crate | 5% chance, times drop luck |
| Breaking a cracked tile (Anchor) | 5% chance, times drop luck |

A blue star from a crate or cracked tile is a **pickup** on the ground (new object `blue-star`, new placeholder sprite). It uses star reach.

### 4.2 When blue stars are yours: the deposit (owner, 2026-11-17, questions 3 and B)

Blue stars you find on a run are **carried**, not yet yours. They only go into your **blue star stash** (the wallet that lasts between runs) when they are **deposited**, which happens automatically in two places:

1. **Reaching a town.** Walking into any town (including the last town before the boss) deposits everything you carry.
2. **Beating a boss.** The boss's blue stars, the early bonus and everything you carry are deposited at once, and the "boss beaten" record (for later unlocks) is saved.

Anything still carried when the run ends any other way is **lost**:

| What happens | Carried blue stars |
|---|---|
| You reach a town | Deposited |
| You beat a boss | Deposited, with the boss's reward |
| You die (health or naps run out) | **Lost** |
| You close the game outside a town | **Lost**, with the run |
| You close the game in a town | Nothing lost (they were deposited when you arrived); you carry on from that town |

So a town is now worth reaching for two reasons: it saves the run and it banks your blue stars. The HUD and map show **carried** blue stars separately from the **stash**, with a note: "Deposited at the next town or boss."

This replaces FEATURES.md open question F7's default ("blue stars found during a run survive death").

---|---|
| Death (health or naps run out) | **Kept**: added to your wallet (FEATURES.md open question F7, default; see follow-up question B) |
| Winning the run | Kept |
| **Closing the game outside a town** | **Lost**, with everything else in the run |
| Closing the game in a town | Nothing lost; you carry on from that town |

**The exception: beating a boss.** The blue stars for beating the Warden (and the early bonus) are **banked into your wallet at once**, and the "boss beaten" record (used for later unlocks) is saved at once. These survive even if you then close the game outside a town.

The HUD and map show "blue stars this run" separately from your wallet, so it is clear which are safe.

---

## 4b. Success rolls and the wheel (owner, 2026-11-17)

**Owner, 2026-11-17:** a weapon's special effect does not always happen. Every time it would, there is a **success roll**, shown by a spinning wheel. This replaces the fixed chances of Milestone 6 (the Knob family's 20%, 35%, 50%) and the sure effects (every burn, zap, heal, knock and echo).

### 4b.1 The wheel

- A wheel of **10 slices**. Some slices are **filled** and show the effect's word (STUN, BURN, ZAP, HEAL, KNOCK, ECHO). A hand spins and stops on one slice: filled means it works.
- Chance of success = filled slices ÷ 10. With all 10 filled it always works.
- **Boss wheel:** against a boss the wheel has **20 slices**, with the same number filled. So bosses are always harder to affect.
- Which slices are filled is placed at random on the wheel each time; it is only for the look.
- The result is decided by the simulation's seeded random number generator at the moment of the hit. The wheel only shows it (CLAUDE.md rule 3: same seed and inputs, same result). It pops up small, beside the enemy, and spins for about 0.6 s while play carries on, so a shot through several enemies shows several wheels. Placeholder art now; polished with the Milestone 9 animations.

### 4b.2 How many slices are filled

Filled slices = the weapon's slices + Knack upgrade levels (4b.3) + any acorn this course (4b.4), at most the wheel's size.

| Weapon rarity | Slices filled | Chance on a 10 wheel | On the boss wheel |
|---|---|---|---|
| Common | 2 | 20% | 10% |
| Uncommon | 3 | 30% | 15% |
| Rare | 4 | 40% | 20% |
| Double rare | 5 | 50% | 25% |
| Special rare | 6 | 60% | 30% |
| Legendary | 7 | 70% | 35% |

The slices are a number on each item, defaulting to its rarity's number above, so any one item can be tuned on its own. The Knob family is now told apart by its slices (Bonk 2, Thump 3, Clang 4, Gong 5) instead of percentages.

### 4b.3 What rolls and what does not

| Rolls (one wheel per hit) | Always happens, no roll |
|---|---|
| Burn (Coat family, Sunfire Crown) | Plain stat changes: extra hit damage, shot power (Shell family, Blaze and Inferno Coat's +1 damage and so on) |
| Stun (Knob family) | Elements: a fire weapon's hits are always fire, Thunder Knuckle's always shock |
| Chain zap (Thunder Knuckle) | Gong Knob's +1 damage to a stunned enemy (it depends on the stun, which already rolled) |
| Heal (Leech Fang: one roll on the first damaging hit each shot; a miss means no heal that shot) | Sunfire Crown's burst (it depends on the burn, which already rolled) |
| Knock away (Giant's Knuckle) | Wrecking Shell rolling on through a defeat (it is how the ball moves, not something done to the enemy) |
| Echo (Echo Shell: one roll on the first hit each shot) | |

Armour (the Guard family's hit-back and stun) does not roll for now; see follow-up question E.

### 4b.4 Knack: a permanent upgrade for success rolls

**Owner, 2026-11-17:** a new upgrade path. Each level fills one more slice on every wheel. It goes on the Burrow's levelled list (section 5.2) as a sixth upgrade, a new stat `rollSlices` (base 0) through the modifier system.

| Upgrade | Levels | Per level | Cost of levels 1 to 5 | Total |
|---|---|---|---|---|
| Knack | 5 | +1 filled slice on every wheel | 6, 10, 14, 18, 24 | 72 |

With all five levels, a common weapon has 7 of 10 slices, and a legendary one fills the wheel (a sure thing on ordinary enemies, 12 of 20 on a boss).

### 4b.5a Not in shops yet (owner, question G)

Knack stays a permanent upgrade only for now. Instead, slice perks come from new gear (4b.6).

### 4b.5 The acorn: a consumable for better odds

**Owner, 2026-11-17:** a consumable that fills extra slices for one course. It is a new kind of thing (the first consumable you carry); working names:

| Item | Rarity | Extra slices this course | Shop price (yellow stars) |
|---|---|---|---|
| Lucky Acorn | Common | +2 | 6 |
| Golden Acorn | Rare | +3 | 12 |
| Star Acorn | Special rare | +5 | 20 |

- **Found in a crate:** crates have a 4% chance and secured crates 10%, times drop luck, of dropping an acorn. Which acorn is rolled on the region's rarity odds (the same table as gear), so the better ones are rare early in the run. Picked up on a course, it works **at once, for the rest of that course**.
- **Bought in a shop:** the shop's service slot now offers Heal, Delay the Boss, or an acorn (a third each; an acorn's rarity by the same odds). A bought acorn goes in your **pocket** and is used automatically when the next course starts, including the boss arena. The pocket holds one; while it is full, the shop does not offer acorns.
- Two acorns on one course add together.
- The HUD shows an acorn icon with "+N" while one is working.

### 4b.6 New gear: slice perks on armour and baubles (owner, 2026-11-17, question G)

**Owner, 2026-11-17:** use success rolls to add variety to the gear list, as perks on armour or baubles. Twelve new items, so armour and baubles each get a fourth item at every rarity (66 items in all; weapons stay at 18, since their rarity already sets their slices). The new items join the shop, cache, course and boss-reward pools automatically.

Two new stats, both through the modifier system: `rollSlices` (extra filled slices on every wheel; Knack uses it too) and `bossSlices` (extra filled slices on the boss wheel only).

**Armour, new family: Grit** (steady against big foes; boss wheel only)

| Rarity | Item | Effect |
|---|---|---|
| Common | Grit Pads | +2 slices on the boss wheel |
| Uncommon | Grit Vest | +3 slices on the boss wheel |
| Rare | Grit Mail | +4 slices on the boss wheel, max health +1 |
| Double rare | Grit Plate | +5 slices on the boss wheel, max health +1 |

**Armour, new special rare and legendary**

| Rarity | Item | Effect |
|---|---|---|
| Special rare | Gambler's Vest | +3 slices on every wheel, but max health −1 (a risky trade) |
| Legendary | Fortune's Mail | Max health +2. The first failed roll each course spins again |

**Baubles, new family: Spinner** (better odds everywhere)

| Rarity | Item | Effect |
|---|---|---|
| Common | Brass Spinner | +1 slice on every wheel |
| Uncommon | Silver Spinner | +1 slice, drop luck +10% |
| Rare | Gold Spinner | +2 slices |
| Double rare | Jewel Spinner | +2 slices, drop luck +20% |

**Baubles, new special rare and legendary**

| Rarity | Item | Effect |
|---|---|---|
| Special rare | Hot Streak Charm | Each successful roll fills one more slice for the rest of that shot (a chain of hits gets better and better) |
| Legendary | Golden Spinner | The boss wheel has 15 slices instead of 20, and +1 slice on every wheel |

Names are working names. Prices follow rarity as for all gear (10, 15, 25, 35, 50, 70).

## 5. The Burrow: home, hub screen and permanent upgrades

### 5.1 One home (owner, 2026-11-17, question D)

The hub screen between runs and the Burrow in towns are **one place: the Burrow**, the armadillo's home. (The working name "the Den" from earlier drafts is dropped.) It holds:

- your **stored gear** (one per category, as built in Milestone 6),
- your **blue star stash**,
- the **permanent upgrades** and **starting abilities**.

**Between runs** you are in the Burrow, and can do everything: store or take gear, buy upgrades and abilities, pick the starting ability, start or continue a run.

**In a town** the Burrow door opens the same home. You can swap gear as before and see your stash grow from the deposit. **Owner, 2026-11-17 (question I): you can also buy upgrades and abilities in a town**, with the stars just deposited. A permanent upgrade bought mid-run works at once for the rest of that run (for example Vitality raises max health and heals 1, like Tough Shell). An ability bought mid-run is yours for later runs; the starting-ability toggle is greyed out in towns, since the run has started. Prices may be raised in balancing if this makes runs too easy.

Same placeholder pixel style as the town.

- **The game opens on the Burrow** (owner, question 9). Keys 1 to 6 still open the test courses; key 7 goes to the Burrow. `?run=<seed>` still starts a run at once, for testing.
- On screen: your blue stars, the six levelled upgrades, the starting abilities, and totals (runs played, bosses beaten, best region reached).
- **Start a new run**, or **Continue run** if a run is saved at a town.
- Keyboard: up/down to choose, Enter to buy or start, left/right to pick the starting ability. The mouse also works.

### 5.2 Levelled upgrades (owner, 2026-11-17, question 2: as listed)

Each is a **modifier** with source "permanent" and duration "forever", applied at the start of every run.

| Upgrade | Levels | Per level | Cost of levels 1, 2, 3, 4, 5 | Total |
|---|---|---|---|---|
| Vitality | 5 | max health +1 | 5, 8, 12, 16, 20 | 61 |
| Stamina | 5 | max shots +1 | 5, 8, 12, 16, 20 | 61 |
| Head Start | 3 | +10 starting yellow stars | 3, 6, 10 | 19 |
| Haggler | 3 | shop prices −10% (added: three give 70%) | 4, 8, 12 | 24 |
| Fortune | 3 | drop luck +10% | 3, 6, 10 | 19 |
| Knack (owner, 2026-11-17) | 5 | +1 filled slice on every success wheel (section 4b.4) | 6, 10, 14, 18, 24 | 72 |

- Head Start needs a new stat, `startingStars` (base 0), so it goes through the modifier system.
- **No refunds** (owner, question 10). A "reset the Burrow" button exists only in the testing panel.

### 5.3 Starting abilities (owner, 2026-11-17, question 11)

- **Each ability is bought separately**, once, for **8 blue stars** each (owner, question C): Anchor, Burner, Hop, Tornado.
- **If you own more than one, you choose which to start the run with**, or none. The choice is a toggle on the starting-ability row: left/right steps through the ones you own.
- The chosen ability works like any held ability: falling off the edge loses it, a carrier replaces it.
- **The toggle lives in the Burrow** (owner, question D), usable between runs.
- Abilities added in Milestone 8 join the list as data.

---

## 6. Saving

### 6.1 One save, with a version number

| Part | What it holds | Saved when |
|---|---|---|
| Profile | blue stars, upgrade levels, abilities owned and the one chosen, bosses beaten, the last arena used, totals | every time it changes |
| Burrow | the three stored gear items (moved here from its own save; the old one is read once and moved over) | every time it changes |
| Run in progress | the whole run state, only while you are in a town (carried blue stars are already deposited by then) | entering a town and after each thing you do there |

**Safe fallback:** if the save cannot be read (damaged, from a newer version, or storage blocked), the game does not crash. It keeps a copy of the unreadable text under a backup key, starts that part empty, and shows a message in the Burrow: "Your save could not be read. A copy has been kept." Each part is checked on its own, so a damaged run save does not wipe your blue stars. A save from an older version is upgraded step by step.

### 6.2 The town is the save point (owner, 2026-11-15; closing rule owner, 2026-11-17)

- **Entering a town saves the run**, and so does every purchase, reroll and Burrow swap there. Closing the page in a town and coming back puts you in that same town, with the same shop stock.
- The map is not stored; it is made again from the run seed.
- **Leaving the town deletes the run save.** Closing the game anywhere else **loses the run and everything collected in it, carried blue stars included** (section 4.2). The Burrow warns you once: "Your run is saved only in towns."
- **Death** deletes the run save, loses the carried blue stars, and goes to the run summary, then the Burrow.

---

## 7. Death, winning and the regions

### 7.1 Death

1. The course ends (health or naps ran out).
2. **Run summary**, as now, plus blue stars deposited this run, blue stars lost, and your stash.
3. **Lost:** carried blue stars, yellow stars, ability, gear (except the Burrow), run upgrades, map position, the run save.
4. **Kept:** the blue star stash, permanent upgrades, abilities owned, the Burrow.
5. Enter goes to the **Burrow**.

### 7.2 Beating the region-one Warden

1. "THE WARDEN IS BEATEN": blue stars banked, full heal.
2. **Pick 1 of 3 gear items** (same screen and keys as the cache).
3. **Region two** starts on a new map.

### 7.3 Region two: the map

| Rule | Value |
|---|---|
| Map | A new map from the run seed (fork `map:2`), same shape and node odds |
| Countdown | Back to 7; raises back to 0 (at most 3 per region) |
| Gear odds | the "Region 2" rarity column |
| Carries over | health (full after the heal), yellow stars, ability, gear, run upgrades |
| Biome and theme | the same for now; new biomes and the theme switch after each boss are Milestone 8 |
| Boss | from the region-two boss pool: the Warden, 18 health (section 2.8) |
| After the region-two Warden | the run ends with a win |

### 7.4 How difficulty scales: size and toughness, separately (owner, 2026-11-17, question 4)

The owner asked for courses to grow **higher** than the cap of 30, with **course size** and **enemy difficulty** scaled **separately**, in every region. Today one number (the budget) sets both. This sheet splits it into **three dials**, each set per region in data:

1. **Size:** how many areas a journey has and how big each area is. Bigger means a longer trip.
2. **Threat:** the budget spent on enemies, obstacles and hazards. More means more of them.
3. **Toughness:** every enemy in the region gets stronger through modifiers (source "region"; FEATURES.md section 1). Same number of enemies, harder to beat.

Each one climbs as you finish counted nodes in a region, and jumps at the start of the next region.

| Dial | Region 1 | Region 2 | Region 3 (Milestone 8, written now) |
|---|---|---|---|
| Areas per journey | 2, +1 every 2 counted nodes, at most 5 | 3, +1 every 2, at most 6 (owner, 2026-11-18; was 4 to 7) | 5, +1 every 2, at most 8 |
| Area side, tiles | 8–14 | 9–15 | 10–16 |
| Threat budget | 8 + 2 per counted node, cap 30 | 18 + 3 per counted node, cap 36 (owner, 2026-11-18; was 45) | 28 + 3 per counted node, cap 60 |
| Most enemies on one course | 10 | 14 | 18 |
| Enemy toughness | as built | +1 health on every enemy | +1 health and +1 attack damage |
| Warden health | 12 | 18 | 24 |
| Par kit: what the course check's bot plays with (owner, 2026-11-18) | a fresh ball | max shots +1, hit damage +1, shot power +10% | max shots +2, hit damage +1, shot power +20%, max health +2 |
| Hard course | threat ×1.5 and +1 area | same | same |
| Bot shot limit | from the number of areas | same | same |

Region one plays about as it does now. In region two, courses are both longer and busier, and each enemy takes one more hit.

**The real risk is speed.** At budget 25–30, courses already take 10–20 seconds to make, because the bot has to beat each one. Region two's courses are bigger again. While building, I will:

- start making the next course in the background while you are on the map or in a town, so the wait is mostly hidden;
- measure region-two generation with the batch tool (`npm run gen:batch`) and report the times to you;
- if they are too slow, bring you numbers to choose from (for example a lower region-two cap) rather than quietly changing the table.

---

## 8. Screens and testing aids

### 8.1 New and changed screens

- **The Burrow** as the hub screen (section 5).
- **Arena HUD:** the Warden's health bar across the top with phase marks at 2/3 and 1/3; the slam ring on the ground; no star meter.
- **Success wheels** on every course (section 4b), and the acorn icon on the HUD.
- **Boss reward screen:** gear pick of 1 from 3.
- **Map:** the boss marker shows the boss's name; "REGION 2" when there; blue stars this run.
- **Run summary:** blue stars this run and in total; "Enter: to the Burrow".

### 8.2 Testing aids (U panel, debug only)

- +10 blue stars; reset the Burrow's upgrades and abilities (stored gear stays).
- Go straight to the boss (any region), and choose the arena.
- Set the Warden's health (to jump to a phase).
- Start region two now.
- Show the save as text, and damage it on purpose (to test the fallback).

---

## 9. What this needs in the code (for reference)

- **A boss template** (new code once, then data): phases with health thresholds, slam, summon pool, spawn spots, the boss stun rule, "minions leave no flag".
- **Enemies that appear mid-course** (summons), all chosen through the seeded generator.
- **Course format 4:** optional `boss` and `spawns` fields; quota 0 with the exit tied to the boss.
- **The profile and save** in `src/save/`, with the checking and upgrading part written as plain TypeScript tested in Node.
- **Permanent modifiers** and owned abilities passed into `createRun` with the Burrow; a `startingStars` stat.
- **Regions** in `src/sim/run.ts`; the generator takes size and threat as separate inputs; region toughness as modifiers on enemies.
- **Boss pools** per region, and the arena pick that skips the last arena.
- New placeholder sprites: the Warden (three phases), slam ring, blue star, puff, the success wheel (10 and 20 slices), three acorns, the Burrow as a hub, five arena looks.

---

## 10. Questions for the owner

| # | Question | Default | Answer (owner, 2026-11-17) |
|---|---|---|---|
| 1 | Blue star amounts | As listed | **Yes**, as listed |
| 2 | Permanent upgrade prices | As listed | **Yes**, as listed |
| 3 | Closing the game outside a town | Run lost, blue stars kept | **Run lost, and everything collected in it, blue stars included.** Only the rewards for beating a boss are kept |
| 4 | Region two budget cap | Keep 30 | **Build it higher.** Make courses bigger and, separately, make opponents harder; every region scales this way. Design in section 7.4 |
| 5 | What ends region two | The Warden again | **The Warden as a placeholder.** Region bosses come from the boss randomizer once more bosses exist (section 2.8) |
| 6 | Arenas | Three hand-built | **Five hand-picked arenas, each with a gimmick or theme. Never the same arena twice in a row** (section 3) |
| 7 | Minions leave flag poles? | No | **Default** (no) |
| 8 | Can the Warden be stunned? | No | **Stun weapons have a 20% chance**, shown by a little wheel with "STUN" where the hand spins. **Replaced the same day** by success rolls for every weapon effect, a 20-slice boss wheel, the Knack upgrade and acorns (section 4b) |
| 9 | What the game opens on | The Den (now the Burrow, question D) | **Default** |
| 10 | Refunds of permanent upgrades | No | **No refunds** |
| 11 | Starting ability | One unlock for all | **Buy each ability separately.** If you own more than one, choose which to start with; maybe a toggle in the Burrow (section 5.3) |
| 12 | Names | Keep | **Default** (keep) |

## 10b. Fit with the later milestones (checked 2026-11-17)

The remaining milestones (PLAN.md 8 and 9) and the reference files were checked against this sheet; nothing conflicts. Milestone 7 is built to leave room for:

| Later work | What Milestone 7 does now |
|---|---|
| Second and third bosses, one with a gimmick (M8) | Bosses are data entries; a gimmick field exists. They join the region boss pools (section 2.8) |
| More unlocks in the Burrow: second gear slots, new gear and abilities in the pool, new characters (M8) | The Burrow's upgrades and unlocks are a data list; the profile stores a chosen character id (Rollo for now) |
| Unlocks from beating a boss the first time (FEATURES.md section 15) | The profile records bosses beaten, banked at once (section 4.2) |
| Three regions, a final boss, endless mode | Regions are numbered; size, threat, toughness, rarity column and boss pool are looked up per region; region three's numbers are already in section 7.4 |
| Theme switch after each boss (M8) | The display can read the region number |
| Tier 3 and 4 enemies, elite blue star chance (M8) | Toughness and blue star sources are data lists |
| Balance pass with the bot, per region (M8) | The bot can play arenas and the batch tool takes size and threat |
| Title screen, settings, tutorial (M9) | The title screen goes in front of the Burrow |

## 10c. Follow-up questions (2026-11-17)

| # | Question | Default |
|---|---|---|
| A | ~~Stuns: flat 20% for bosses only, or everywhere?~~ | **Answered by the owner** with success rolls (section 4b) |
| B | When you die, are the run's blue stars kept? | **Owner: no.** Blue stars are only kept once deposited, automatically, on reaching a town or beating a boss (section 4.2) |
| C | Ability prices | **Owner: 8 each** |
| D | Merge the Den and the Burrow? | **Owner: yes**, one home called the Burrow (section 5.1) |

---

### New follow-up questions from success rolls (2026-11-17)

| # | Question | Default |
|---|---|---|
| E | Armour effects roll too? | **Owner: no**, weapons only |
| F | Acorn lasts one course or one shot? | **Owner: one course** |
| G | Knack in shops too? | **Owner: permanent only for now**, and add slice perks to armour and baubles for variety (section 4b.6) |
| H | Slices 2 to 7 by rarity? | **Owner: yes** |

---

## 10d. Last questions (2026-11-17)

| # | Question | Default |
|---|---|---|
| I | Buy permanent upgrades and abilities in a town, mid-run? | **Owner: yes.** Raise prices in balancing if needed (section 5.1) |
| J | Four armour and bauble items per rarity (66 items)? | **Owner: yes**, add them and keep every old item |

---

## 12. As built (2026-11-18)

Differences from the sheet, and choices it left open (each is a Default the owner may change):

- **A boss takes one hit per shot** (`hitsPerShot` in `src/content/bosses.ts`). Not on the sheet. Without it the ball rattles against the Warden on a slope or the Moat's island and lands a dozen hits in one shot, so the fight could end in one or two shots. With it, the bot needs 18 to 33 shots to win.
- **Stars do not open a boss arena's exit.** Only the boss's defeat does; a minion's star goes to the wallet only. (Found while building: with a quota of 0, the first star opened the exit.)
- **The Moat's island is 5 × 5**, with a one-tile ring of water, not 3 × 3 in a two-tile ring: the narrower version was too hard to land on.
- **Arena check, `npm run arenas`** (the bot, a fresh ball, 20 seeds each, 80-shot limit): Bumper Ring 17/20, Ice Rink 20/20, Sinkhole Bowl 20/20, Storm Steps 16/20, The Moat 12/20. All at least half, as the sheet asks. The unit tests play three seeds per arena to keep the test run quick.
- **Arenas are course files** (format 3 with an optional `spawns` list), not a new format 4; the boss is an object like any enemy. A course with a boss on it keeps its exit closed until the boss falls.
- **Boss testing aid "Win this course"** finishes the fight without defeating the boss, so the boss bar still shows health on the win screen.
- **Region generation speed** (section 7.4, measured with the region numbers as signed off, a fresh ball, 6 seeds each):

  | Course | Average | Slowest | Fell back to the simple course |
  |---|---|---|---|
  | Region 1, first course | 0.2 s | 0.8 s | 0 of 6 |
  | Region 1, after 6 nodes | 3.2 s | 10.7 s | 0 of 6 |
  | Region 1, hard, after 6 nodes | 4.6 s | 8.7 s | 0 of 6 |
  | Region 2, first course | 3.5 s | 5.5 s | 0 of 6 |
  | Region 2, after 3 nodes | 10.2 s | 31.1 s | 0 of 6 |
  | Region 2, hard, after 3 nodes | 42.3 s | 77.7 s | 0 of 6 |
  | Region 2, after 6 nodes | 42.9 s | 64.9 s | 2 of 6 |
  | Region 2, hard, after 6 nodes | 58.3 s | 83.1 s | 4 of 6 |

  Region two's later courses were too slow and sometimes failed all their checks (the game then uses a simple stand-in course). **Owner, 2026-11-18: options A and B.** (A) Region two is now 3 to 6 areas with threat capped at 36. (B) A background worker (`src/render/genQueue.ts`) makes the courses the player can go to next while they are on the map (the selected node first), in a town (the choices after leaving it), or playing a course (the choices after winning it with the gear held now); the course the player picks jumps the queue. A course made ahead is exactly the one the run would make on arrival. New timings in the progress log. Region three's numbers are unchanged until Milestone 8. The bot here played with no upgrades; a real player arriving in region two has gear and upgrades, which helps the bot, but not enough to fix this. **The numbers are as signed off; the owner chooses what to change** (see the session summary for the options). The next course is still made while the loading screen shows; making it in the background while the player is on the map was not built yet.
- **Testing aids** (U panel): in the Burrow, +10 blue stars, reset upgrades and abilities, start region two, show the save, damage the save, and fight the boss in a chosen arena; on the map, go to region two and fight the boss in a chosen arena; in a boss fight, jump the boss to phase 2, phase 3 or 1 health.
- **The pixel font gained a % sign** (it showed as "?" before, also in Milestone 6 gear descriptions).
- **In a town's Burrow**, press P to spend blue stars (the sheet left the key open).

---

## 11. Done when (from PLAN.md)

The owner can die, buy a permanent upgrade, start again, and see the upgrade applied; and can beat the boss.

Things to check on purpose while playtesting (once built):

- Collect blue stars, then die before a town: they are lost. Collect some, reach a town, and see them deposited into the stash.
- Buy Vitality level 1; start a run and see 6 health.
- Buy Hop and Anchor in the Burrow; toggle between them; start a run and see the chosen one held.
- Get to a town, close the tab, open the game, choose Continue run: you are in that town with the same shop.
- Close the tab during a course instead: the run and its carried blue stars are gone; the stash keeps what was deposited.
- Beat the Warden, then close the tab on the next map: the boss's blue stars and everything carried are in the stash.
- Equip Grit Pads and see the boss wheel get 2 more filled slices; try the Hot Streak Charm through a line of enemies.
- Damage the save from the testing panel and reload: the game starts, says the save could not be read, keeps the backup.
- Fight the Warden in each arena (testing panel) and check each gimmick; see each phase change; dodge a slam; take one on purpose; watch the stun wheel with a Knob equipped.
- Equip a Knob and watch the wheel: see roughly 2 in 10 stuns; then buy Knack and see one more slice filled. Do the same on the Warden and see the 20-slice boss wheel.
- Buy an acorn in a shop and see it used at the next course; break crates until one drops an acorn.
- Fight two bosses in a row (region one, then region two): the arenas differ.
- In region two, see longer courses with more enemies, each with one more health.
