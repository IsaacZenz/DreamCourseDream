# Features

This file defines each content category: the **template** (the fields every entry has) and a **starter set** to build first. `docs/DESIGN.md` says how the game works; this file says what goes in it.

Status labels are the same as in DESIGN.md: **Decided** (owner chose it), **Default** (planner's choice, owner may change), or listed under [Open questions](#open-questions).

**How much to build:** only the starter sets, in the milestone named for each. The large rosters are Milestone 8, after the game has been played. All names here are original working names and may change.

**Every number in this file is a starting value.** Store each one in `src/content/` as a tuning number.

---

## 1. Stats and modifiers

This is the base for everything else. Build it in Milestone 3.

### The stat sheet (Default)

The ball and every enemy have a stat sheet. Not every stat applies to every creature.

| Stat | Ball starts at | Meaning |
|---|---|---|
| Max health | 5 | |
| Max shots | 4 | Shots before a recover turn is needed |
| Hit damage | 1 | Damage dealt on contact |
| Shot power | 100% | Top speed of a full-power shot |
| Guide length | 100% | How far the aim guide predicts |
| Bounce boost | 100% | Strength of the timed bounce on landing |
| Star reach | 1 tile | Distance at which stars are collected |
| Drop luck | 100% | Multiplier on drop chances |
| Shop prices | 100% | Multiplier on yellow star prices |
| Gear capacity | 1 per category | See section 8 |

Enemies also use: move range, attack damage, attack range, outer radius, inner radius.

### Modifiers (Default)

Nothing changes a stat directly. Everything applies a **modifier**:

- which stat,
- add or multiply,
- the amount,
- where it came from (permanent upgrade, run boost, gear, ability, status, trait, region),
- how long it lasts (forever, this run, this course, N turns, while equipped).

Final value = (base + all adds) × all multipliers, then rounded and limited to that stat's minimum and maximum.

One system serves permanent upgrades, run boosts, gear, abilities, statuses and enemy traits. Removing a source removes its modifiers. Do not write separate stat-changing code for each category.

---

## 2. Damage

**Decided:**

- A hit is an attack. The ball touching an enemy deals the ball's hit damage, which is 1 by default.
- Gear and the current ability can raise it. Negative effects, such as being poisoned, can lower it.
- Some enemies have a special rule that stops a hit from counting, such as a raised shield.
- Elements exist. Enemies can be weak to or resistant against an element.
- Some enemies have positional weak spots.

**Default:**

- Damage is in whole numbers.
- **Elements:** fire, ice, shock. A hit has an element if the ball's current ability or weapon gives it one. Weak: damage ×2. Resistant: damage halved, rounded down.
- **Positions:** "from above" means the ball was airborne just before contact. "From behind" uses the direction the enemy is facing. A weak spot doubles damage; a guarded side blocks the hit.
- **Order of calculation:** hit damage after modifiers → element → position → shield or block → subtract from enemy health.
- **Contact:** if the enemy survives, the ball bounces off it. If the enemy is defeated, the ball carries on with a small loss of speed. The same enemy cannot be hit again within half a second.
- **Damage to the ball:** enemy attacks and hazards remove health. ~~After taking damage the ball cannot be damaged again for the rest of that shot.~~ **Owner, 2026-11-14:** after taking any damage the ball is immune for 0.5 seconds, then can be hurt again. A ball knocked around can take several hits.
- **Owner, 2026-11-14 — only your own action deals damage:** the ball damages an enemy only while it is moving from the player's shot (including abilities used during it). A ball that was standing still and got run into or knocked (by a Trundler, a sliding block, a Lunger, a cloud) does no damage to any enemy it touches and sets off no hit trigger; the enemy's contact effect still applies to the ball. Crates are not enemies, so a knocked ball can still break them.
- **Owner, 2026-11-14 — moving things and the ball:** free-rolling things (Lunger, Mole, Spitter seed) and the ball deflect off each other. Things on a fixed route (Trundler, sliding block) keep going and knock the ball out of the way, even a resting ball. Details in `docs/plans/milestone-4.md` section 1.2a.

---

## 3. Playable character

**Decided:** one character now. The design must allow more later.

**Template (Default):** id, name, sprite id, starting stat sheet, starting ability (may be none), one passive trait, unlock cost in blue stars.

**Starter set:** one balanced character with the stats in section 1, no starting ability, no trait. Build in Milestone 3. Built as **Rollo** (working name) in `src/content/characters.ts`.

**Owner idea, 2026-11-15 (planning only, for the Milestone 9 skin):** the hero is an armadillo. It stands on two legs, curls into a ball when launched, and pops back out of ball form when it stops. A ball-to-standing animation on every launch and stop, through the asset manifest like all art. ~~Villains share a theme, still to choose: reptiles and amphibians led by an alligator, or insects.~~ (Owner, 2026-11-18: insects.) Nothing changes in the rules or the simulation.

**Decided (owner, 2026-11-19): the armadillo's poses.**

| When | Pose |
|---|---|
| Resting, aiming, charging | Standing on two legs |
| Launched by your own shot, rolling or flying | Curled into a ball |
| Comes to rest after your shot | Pops out and stands up |
| **Knocked or hurt when it is not your shot** (a Mudroller, a sliding block, a blast, a slam, a charge) | **Not** curled: a hurt pose, then **knocked onto its back like a tortoise**, sliding or tumbling with legs in the air |
| Comes to rest after being knocked | Lies on its back a moment, then flips over and stands up |

**Default:** the poses are display only and do not change any rule; the flip back up takes about 0.5 s and does not delay your turn. The simulation already tells a knocked ball from a ball moving under your own shot (`knocked` in `src/sim/play.ts`, used by the "only your own action deals damage" rule), so no simulation change is needed. Art and animation in Milestone 9; round 1 of Milestone 8 checks every knock-back sets that flag (slams, charges, blasts, soldier rings).

**Later examples, Milestone 8:** a heavy ball (more damage, less bounce, shorter shots); a light ball (more bounce, an extra shot, less health).

---

## 4. Enemies

Families, triggers and turn order are in DESIGN.md section 8.

### Template (Default)

id, name, sprite id, family (patroller or sentinel), tier, health, star value, element (or none), weak and resistant elements, weak spots and guarded sides, outer radius, inner radius, response per trigger (immediate or activated), behaviour (movement and attack pattern), contact effect, ability granted on defeat (or none), allowed traits, allowed gear, squad themes it can belong to, difficulty cost.

### Tiers

**Decided:** enemies are ranked in tiers. Higher tiers carry more features.

**Default:**

| Tier | Name | Health | Traits | Element | Weak spot or guarded side | May carry gear | Stars |
|---|---|---|---|---|---|---|---|
| 1 | Minor | 1 | 0 | Rarely | No | No | 1 |
| 2 | Standard | 1–2 | 0–1 | Sometimes | No | No | 2 |
| 3 | Veteran | 2–3 | 1–2 | Usually | Sometimes | Sometimes | 3–4 |
| 4 | Elite | 3–5 | 2–3 | Yes | Usually | Usually | 6+, blue star chance |
| 5 | Boss | See section 5 | | | | | |

Early courses use mostly tiers 1 and 2. Later regions shift the mix upward (section 14).

### Traits

**Decided:** enemies can spawn with trait tags that are not tied to gear.

**Default starter traits:** each is a set of modifiers or one small rule, each raises the enemy's difficulty cost and star value.

| Trait | Effect |
|---|---|
| Shielded | Blocks the first hit of each shot |
| Armoured | +1 health |
| Swift | Moves twice per enemy turn, or patrols faster |
| Explosive | Explodes when defeated, damaging everything nearby, enemies included |
| Regenerating | Recovers 1 health each enemy turn |
| Splitting | Becomes two tier 1 enemies when defeated |

### Squads

**Decided:** enemies are generated in like-minded groups. If one member of a group has a trait or element, the others are more likely to share it.

**Default:**

- The generator places enemies in squads of two to five, not one at a time.
- Each squad rolls a theme: an element, a trait, or none.
- Each member has a 70% chance to take the squad's theme, if its definition allows it.
- A squad may include one member a tier higher than the rest as its leader.

### Enemy gear

**Decided:** enemies can have gear equipped. It does not drop by default; at most there is a small chance.

**Default:** equipped gear changes the enemy's stats and is visible on its sprite. Drop chance is 10%, multiplied by the ball's drop luck. A dropped item lands where the enemy stood.

### Starter set

| Working name | Family | Tier | Behaviour | Milestone |
|---|---|---|---|---|
| Mossback | Sentinel | 1 | Never acts. A plain target. | 3 |
| Trundler | Patroller | 2 | Rolls along its path. Contact: 1 damage and knock-back. Keeps to its path when it runs into the ball, even a resting one (owner, 2026-11-14). | 4 |
| Spitter | Sentinel | 2 | When activated, marks the ball's spot each turn and lobs a seed at it the next turn. The seed has ball physics and keeps bouncing along its line after landing (owner, 2026-11-14). | 4 |
| Lunger | Sentinel | 2 | Rest trigger activates it; pass-by trigger makes it launch at once. Each enemy turn it launches itself at the ball and rolls like the golf ball (owner, 2026-11-14): terrain affects it, it bounces back from edges and water, spikes hurt it, it hurts the ball only while moving. | 4 |
| Mole | Sentinel | 2 | Owner, 2026-11-14. Hidden under a molehill. Rolling directly over the hill sets it off: the hill rumbles for a moment (0.3 s), then it shoots up into the air, fast, in a random direction and rolls to a stop. The wait means rolling over it never guarantees a hit; for 0.15 s after popping out it cannot touch the ball. Hurts the ball only while moving. Stays up for one player turn, then burrows. | 4 |
| Ability carriers | Sentinel | 1 | One Mossback variant per starter ability; grants it on defeat. | 4 |

**Owner, 2026-11-14:** for now every enemy is worth 1 star, whatever its tier (overrides the Stars column of the tier table until the Milestone 8 balance pass).

**Owner, 2026-11-18 (Milestone 8 round 1):**

- **Veterans (tier 3) and Elites (tier 4) are worth 2 stars**; other enemies stay at 1. Collecting the quota must not become easier than it is now (proposed quota rule in `docs/plans/milestone-8.md` section 4.0, waiting for confirmation).
- **Every enemy is an insect.** Existing enemies are renamed (Mossback → Snoozegrub, Trundler → Mudroller, Spitter → Spittlebug, Lunger → Pouncehopper, Mole → Mole Cricket, the carriers → grubs, the Warden → the Stagwarden); names under review in the sheet, section 7.0.
- Explosive must not clear the board by accident. **Owner, 2026-11-19:** a blast hurts the ball and nearby enemies but never defeats an enemy (it stops at 1 health), so blasts cannot chain (sheet section 5.1a).
- **Owner, 2026-11-19: the elements form a circle.** Fire is weak to ice, ice is weak to shock, shock is weak to fire; each resists its own element.
- **Built 2026-11-19 (Milestone 8 round 1):** everything above, plus Frost and Static, Gloamhorn, the Brood Queen, region three and endless mode. Differences from the sheet are in `docs/plans/milestone-8.md` section 15 (for example: ball statuses count down as each shot is taken, and Burning hurts then).
- **Owner, 2026-11-19: prices rise with the extra stars.** Gear by rarity 10, 15, 30, 45, 70, 100 (was 10, 15, 25, 35, 50, 70); stat boosts start at 12 in region 1, 16 in region 2, 20 in region 3, +4 per endless region (sheet section 10b).

Tiers 3 and 4, traits, elements, squads and enemy gear are Milestone 8, but the template fields must exist from Milestone 4.

---

## 5. Bosses

**Decided:** a boss is mainly a large health bar with phases. Some bosses, not all, also have a weak-point puzzle.

### Template (Default)

id, name, sprite id, health, phases (each with a health threshold, an attack pattern, and a list of enemies it summons), optional gimmick (a weak spot, a shield that must be broken a certain way, or none), arena layout set, element, rewards.

**Decided (owner, 2026-11-19): boss introductions.** Each of the three main bosses (the Stagwarden, Gloamhorn, the Brood Queen) gets a short **cutscene pop-up** before its fight, showing the boss and its name. In endless mode a shared cutscene pop-up shows the boss that was picked, with the region number. **Default:** it plays before every boss fight, lasts about 3 seconds, and any key skips it. Round 1 of Milestone 8 builds it as a placeholder card (name, sprite, region); the real art and animation come in Milestone 9.

**Default rules:**

- The boss summons small enemies during the fight. They drop stars and abilities, so the player's tools keep flowing.
- The boss course has no star quota. The exit opens when the boss is defeated.
- Rewards: blue stars, a full heal, and a choice of one from three gear items.

### Starter set

| Working name | Gimmick | Milestone |
|---|---|---|
| The Warden | None. Three phases: slow slams, then summons, then both faster. Placeholder boss for every region until Milestone 8 (owner, 2026-11-17). | 7 |
| Second boss | Shield that only drops after it attacks: **Gloamhorn**, a rhinoceros beetle whose wing cases open after it charges | 8 |
| Third and final boss | **Owner, 2026-11-19: the Brood Queen**, a giant queen ant and the bugs' leader; only hits from above (on her back) count, her sides bite | 8 |

**Decided (owner, 2026-11-17):**

- **Boss randomizer:** each region's boss is a seeded pick from that region's boss pool. New bosses are added to the pools as data. **Owner, 2026-11-19:** for now each pool holds one boss: region 1 the Stagwarden, region 2 Gloamhorn, region 3 the Brood Queen.
- **Arenas:** five hand-picked arenas, each with its own gimmick or theme (Milestone 7: Bumper Ring, Sinkhole Bowl, Ice Rink, The Moat, Storm Steps). The same arena is never used twice in a row, also across runs.
- **Boss wheel:** success rolls (section 8) against a boss use a 20-slice wheel instead of 10, with the same number of slices filled, so bosses are always harder to affect.
- Summoned minions leave no flag pole (default kept).
- **As built (2026-11-18), owner may change:** a boss takes one hit per shot (`hitsPerShot`), so the ball cannot rattle a dozen hits into it in one shot.

---

## 6. Obstacles

Surface types are in DESIGN.md section 4. This section covers objects.

### Template (Default)

id, name, sprite id, size in tiles, whether it blocks the ball, contact effect, movement (none, path, or timed cycle), whether it can be destroyed and by what, what it drops, what it is linked to, difficulty cost.

### Kinds and starter set (Default)

| Kind | Starter examples | Milestone |
|---|---|---|
| Static blockers | Rock, tree stump (was the post; renamed by the owner 2026-11-14, built in Milestone 4), low wall | 3 |
| Moving obstacles (not enemies; cannot be defeated) | Sliding block on a path, gate that opens and closes on a timer | 4 |
| Destructibles | Crate that drops a pickup; secured crate that takes 2 hits (owner, 2026-11-14); cracked tile that breaks under the Anchor ability | 4 |
| Guard rails (owner, 2026-11-15) | A thin, low, mostly see-through rail through the middle of a tile (straight, corner and 45° pieces) | 5b |
| Linked objects | Switch that lowers a gate or raises a bridge | 8 |

Moving obstacles run in real time like patrollers, including while the player aims.

### Flag pole left by a defeated enemy

**Decided (owner, 2026-11-14):**

- When an enemy is defeated, a golf flag pole goes up where it died. ~~The enemy still drops its yellow stars as before.~~ Replaced below.
- **Owner, 2026-11-14:** a star hovers above the flag pole, showing the star secured by defeating that enemy. The star counts towards the meter and the wallet the moment the enemy dies; there is no dropped star to fetch.
- **Owner, 2026-11-14:** if any enemy passes over a raised flag, the flag slides down into its hole and its star disappears: that star is taken off the meter and the wallet. The ball running into the lowered flag raises it again and gives the star back. Once the exit has opened it stays open even if stars are lost, but a lost star is not carried out of the course to be spent. Details in `docs/plans/milestone-4.md` section 3.3.
- The pole is an obstacle. A ball hitting it below a speed threshold bounces off.
- A ball at or above the threshold pushes past the pole and loses most of its speed doing it.

**Default (owner may change):**

- The pole stays for the rest of the course and is still standing after a ball pushes past it.
- The speed threshold and the speed kept after pushing past are tuning numbers, so they can be set with the tuning panel. Starting values: push past at 8 tiles per second or more, keep 25% of the speed.
- A lofted ball flying higher than the pole passes over it.
- The pole is a thin round obstacle about as tall as the tree stump, with its own placeholder sprite.
- It replaces the current rule where the ball carries on through a defeated enemy with a small loss of speed. Contact with the enemy itself is unchanged: the hit that defeats it still counts, and the pole goes up once the ball has moved clear, so it never traps the ball.

Build in Milestone 4, alongside the other contact rules and obstacles.

### Guard rail

**Decided (owner, 2026-11-15):**

- A thin, low rail, mostly see-through, that runs through the middle of a tile. It lines course edges (not always: stacked blocks are no longer the only border) and can form shapes in the middle of the course.
- The ball bounces off it; a ball in the air above it hops over.
- Moving enemies bounce off it too.
- A Mole can never burrow underneath it.
- Pieces run along the grid and at 45°.
- Pressing the bounce-boost key at the moment the ball hits a rail gives a stronger bounce.

Numbers and the remaining details are in `docs/plans/milestone-5b.md`.

### Thunder cloud

**Decided (owner, 2026-11-14):**

- A thunder cloud floats above the course.
- A ball that rolls under it is electrocuted: it takes damage and is thrown in a random direction.
- A ball that hops over it is not damaged or affected.
- It cannot be beaten. It is an obstacle, not an enemy: no health, no stars, no flag pole.
- A cloud can be stationary or drift. Each placement on a course chooses which.

**Default (owner may change):**

- It floats over one tile and covers that tile. A ball is "over" it only when the bottom of the ball is higher than the top of the cloud. Anything lower, rolling or bouncing, counts as under and is zapped.
- The zap deals 1 damage, unless the ball is still immune from a hit in the last 0.5 s (owner, 2026-11-14).
- The ball is thrown along the ground in a random direction at a set speed, with a small hop (tuning numbers; starting at 6 tiles per second). The direction comes from the seeded random number generator, so the same seed and the same shots give the same zap.
- Each cloud zaps at most once per shot, so the ball cannot be caught in a loop under it.
- The aim guide stops at the cloud and marks it, because the direction after a zap is meant to be a surprise.
- A drifting cloud follows a path set in the course file, back and forth, in real time like a patroller (it keeps moving while the player aims). Its speed is a tuning number, starting at 1 tile per second. The course generator (Milestone 5) decides which clouds drift.
- Ways over it: a lofted shot, a spring, a bounce boost, and later the Hop ability.
- **Owner, 2026-11-14:** the cloud also zaps rolling enemies (Lunger, Mole): it throws them in a random direction and does **not** damage them.

Build in Milestone 4.

---

## 7. Abilities (powerups)

**Decided:** one slot. Taken from ability-carrying enemies. Replaced when a new one is picked up. Used with a key during a shot.

### Template (Default)

id, name, icon id, what activates it, effect, duration, element (or none), modifiers applied while active, uses per shot.

The archetype list is in DESIGN.md section 9. Elements: Burner is fire, Frost is ice, Static is shock. The rest have none.

**Owner, 2026-11-14:** abilities normally come **only** from defeating their carrier enemy. The one exception is the Wild pickup (section 13), a small chance from secured crates. The Tornado can be nudged left and right.

**Starter set, Milestone 4:** Anchor, Burner, Hop, and Tornado (added by the owner, 2026-11-14).

**Owner, 2026-11-14:** Hop lifts the ball 1.1 tiles. **Tornado:** the ball becomes a small whirlwind for a brief time: fast and chaotic, hard to control. While it is active the ball cannot fall off an edge but can go out over one; if it runs out over a drop, the ball falls. Spiralling into an enemy deals 1 damage. Numbers in `docs/plans/milestone-4.md` section 4.

---

## 8. Gear

**Decided:**

- Three categories: **weapon**, **armour**, **bauble** (renamed from accessory by the owner, 2026-11-15).
- The ball holds one of each. An upgrade may later allow two of a category.
- Rolling over gear of a category already held drops the current item and equips the new one automatically.
- Gear never needs a button. Weapon effects are automatic and trigger only on contact with an enemy.
- Gear is lost on death, except gear stored in the Burrow (owner, 2026-11-15; section 11).

**Default:**

| Category | When its effect applies |
|---|---|
| Weapon | On contact with an enemy |
| Armour | When the ball takes damage or touches a hazard |
| Bauble | Always on |

- A swapped-out item stays on the ground where it was dropped, so an accidental swap can be undone by rolling back over it. It is lost when the player leaves the course.
- Buying gear in a shop for a filled category shows both items side by side and asks to confirm.
- Rarity (owner, 2026-11-15): common, uncommon, rare, double rare, special rare, legendary, thought of in three pairs. Rarity sets price, how often it appears at each point in the run, and strength.
- Sources: placed on courses, shops, caches, boss rewards, and the small enemy drop chance.

### Success rolls (owner, 2026-11-17)

A weapon's special effect (burn, stun, chain zap, heal, knock away, echo) only works if its **success roll** succeeds, shown by a spinning wheel of **10 slices**. Better weapons have more slices filled (by rarity: 2, 3, 4, 5, 6, 7). The permanent upgrade **Knack** fills one more slice per level, and the consumable **acorns** fill extra slices for one course. Against a boss the wheel has **20 slices**. Plain stat changes and elements always apply. Replaces the Milestone 6 fixed chances. Details in `docs/plans/milestone-7.md` section 4b. **Owner, 2026-11-17:** twelve new armour and bauble items with slice perks (the Grit and Spinner families, Gambler's Vest, Fortune's Mail, Hot Streak Charm, Golden Spinner; sheet section 4b.6), so armour and baubles have four items per rarity.

### Template (Default)

id, name, icon id, category, rarity, element (weapons only, or none), modifiers while equipped, triggered effect (if any) and its trigger, slices filled on the success wheel (weapons; owner, 2026-11-17), price.

### Gear list, Milestone 6 (owner, 2026-11-15)

Replaces the six-item starter set. **Six rarities in three pairs**: (common, uncommon), (rare, double rare), (special rare, legendary). **Three items per rarity per category**, 54 in total, all built in Milestone 6. Common to double rare are families (one effect, stronger versions); special rare and legendary each have their own effect. The third category is called **Bauble** (was accessory). Shops, caches and course drops pick from the full list; better rarities get likelier as the run goes on. The full list, prices and rarity odds are in `docs/plans/milestone-6.md` section 5.

---

## 9. Run upgrades (stat boosts)

**Decided:** separate from gear. Plain stat boosts, no slot limit, lost on death.

**Default:** bought in shops or found in caches. Each is one modifier lasting for the run. They stack. The price rises each time the same boost is bought in one run.

**Starter set, Milestone 6:** +1 max health; +1 max shots; +10% shot power; +1 star reach; +25% drop luck.

---

## 10. Permanent upgrades

**Decided:** bought with blue stars. A levelled list plus one-time unlocks.

**Decided (owner, 2026-11-17):** bought in the Burrow (the home and hub screen), between runs or in a town mid-run, where they work at once. Each starting ability is bought separately, 8 blue stars each.

### Levelled list, Milestone 7

| Upgrade | Levels | Per level |
|---|---|---|
| Vitality | 5 | +1 max health |
| Stamina | 5 | +1 max shots |
| Head Start | 3 | +10 starting yellow stars |
| Haggler | 3 | −10% shop prices |
| Fortune | 3 | +10% drop luck |
| Knack (owner, 2026-11-17) | 5 | +1 filled slice on every success wheel |

Cost rises with each level. **Owner, 2026-11-17:** Vitality and Stamina 5, 8, 12, 16, 20; Head Start and Fortune 3, 6, 10; Haggler 4, 8, 12. **No refunds.**

### Unlocks

| Unlock | Milestone |
|---|---|
| Start each run with a chosen ability. **Owner, 2026-11-17:** each ability is bought separately; with more than one owned, the player chooses which to start with (a toggle) | 7 |
| Second weapon, armour or bauble slot (one unlock per category) | 8 |
| New gear and abilities added to the pool of things that can appear | 8 |
| New characters | 8 |

---

## 11. Shops

**Decided (owner, 2026-11-15): a shop node is a little town** with the shop and the player's **Burrow** (home base), entered and left as often as wanted, and a Continue signpost to carry on. Drawn in the game's pixel style.

**Decided (owner, 2026-11-17): the Burrow is also the hub screen between runs** (one home: stored gear, blue star stash, permanent upgrades, starting abilities). Walking into a town deposits carried blue stars into the stash.

**Decided (owner, 2026-11-15): the Burrow** stores one gear item per category. Stored gear is safe from death and waits there for later runs. In a town the player can store the item worn, take a stored one out, or swap them. The Burrow is saved in the browser (Milestone 6). In Milestone 7 the town also becomes the save point for a run in progress (leave at a town, carry on later; death still starts over).

**Decided:** each shop sells a random handful. Stock can be rerolled for yellow stars.

**Default:**

- Five offers: two gear items, two stat boosts, one service.
- Services: heal 2 health, or raise the boss countdown by 1. **Owner, 2026-11-17:** the service slot may also offer an acorn (a consumable, section 13).
- Reroll price starts low and doubles with each reroll in the same shop.
- Prices follow rarity and are multiplied by the shop prices stat.
- The run shop takes yellow stars only. Blue stars are spent only on the hub screen.

Build in Milestone 6.

**Decided (owner, 2026-11-19), for the Milestone 9 skin:** the shop is a **food stand** with a **shopkeeper**, who animates when you buy something (and, Default, when you reroll or cannot afford something). Display only; the shop's rules do not change. The shopkeeper's species is chosen with the theme in Milestone 9 (Default: a friendly animal, not an insect, since the insects are the villains).

---

## 12. Status effects

**Decided:** a small set. They apply to the ball and to enemies.

### Template (Default)

id, name, icon id, modifiers while active, effect each turn, duration in turns, whether a second application adds time or is ignored.

### Starter set (Default)

Owner, 2026-11-15: Burning on enemies is built in Milestone 6 (the fire gear needs it); Burning on the ball stays in Milestone 8.

| Status | On an enemy | On the ball | Lasts |
|---|---|---|---|
| Poisoned | −1 hit damage and attack damage | −1 hit damage | 2 turns |
| Burning | 1 damage at the start of each enemy turn | 1 damage at the start of each shot | 2 turns |
| Stunned | Skips its next turn | Loses 1 shot | 1 turn |
| Chilled | Cannot move; the next hit on it does double damage | Rolls as if on ice | 2 turns |

**Owner, 2026-11-18:** fire and ice cancel each other (Burning on a chilled thing removes both, and the other way round), and water puts out a burning ball. The Burner ability burns what it hits for 1 turn, with no success roll. Water frozen by the Frost ability stays ice for 2 turns; freezing it again resets the 2 turns.

For the ball, one turn is one shot. Build the system and Stunned in Milestone 4; the rest in Milestone 8.

---

## 13. Pickups

**Default.** Things on a course that are collected by touch and are not gear.

| Pickup | Effect | Where it comes from |
|---|---|---|
| Yellow star | +1 to the meter and the wallet | Enemies, crates |
| Blue star | +1 permanent currency | Owner, 2026-11-15: beating a course, beating a boss, and an extra-rare chance in crates or under cracked ground. Owner, 2026-11-17: course 1, hard course 2, boss 5 (region 1) or 8 (region 2); crates 2%, secured crates and cracked tiles 5%, times drop luck |
| Heart | +1 health | Crates, rare enemy drop |
| Shot orb | +1 shot, up to the maximum | Crates, placed on courses |
| Wild | A random ability (not the one held), replacing the current one | Small chance from secured crates, 10% times drop luck (owner, 2026-11-14) |
| Acorn (consumable; owner, 2026-11-17) | Extra filled slices on success wheels for one course: Lucky +2, Golden +3, Star +5 | Crates and secured crates (rarer acorns rarer), and shops |

Build in Milestone 3.

---

## 14. Economy and difficulty

**Default.** All values are first guesses, to be corrected in the Milestone 8 balance pass.

- **Quota:** about 60% of the stars available on a course.
- **Run budget (owner, 2026-11-15):** 8 + 2 per course, hard course or cache finished (shops do not count), hard courses ×1.5, capped at 30 for now. Running out of naps on a run course ends the run.
- **Prices:** gear by rarity 10, 15, 25, 35, 50, 70 (owner, 2026-11-15; see `docs/plans/milestone-6.md` section 5.2), stat boost 12 rising by 6, heal 10, first reroll 3.
- **Budget:** each course has a difficulty budget that rises with each node and jumps after each boss. Enemies, traits, obstacles and hazards each cost budget.
- **Owner, 2026-11-17: size and toughness scale separately in every region** (DESIGN.md section 10). Course size (areas per journey, area size), threat budget and enemy toughness (region modifiers) are three dials set per region; see `docs/plans/milestone-7.md` section 7.4.
- **Owner, 2026-11-19 (Milestone 8 round 1):** region three has 4 to 7 areas; a hard course never has more areas than its region's maximum; from region three on the course check's bot also wears Giant's Knuckle, Bastion Plate and Pocket Watch, and has max shots +1 and max health +1 more (sheet section 15a).
- **Owner, 2026-11-21: regions two and three step up from region one more gently** (region one unchanged: 2 to 5 areas, +1 every 2 nodes, areas 8 to 14 tiles). Region two: 3 to 5 areas, +1 every 3 nodes, areas 8 to 15 tiles. Region three (and endless): 4 to 6 areas, +1 every 3 nodes, areas 9 to 15 tiles. Hard courses still get one area more, never past the maximum.
- **Owner, 2026-11-18: the course check is relaxed.** The bot plays with a par kit per region (region 1 a fresh ball; region 2 max shots +1, hit damage +1, shot power +10%; region 3 also max shots +2 in all, shot power +20%, max health +2), needs 1 health left, and has 1.5 times the shot limit.
- **Tier mix by region:** region 1 is mostly tiers 1–2; region 2 adds tier 3; region 3 adds tier 4.
- **Owner, 2026-11-15 (Milestone 5 testing, before the run exists):** after winning a generated course, the next one's budget rises by a random 0 to 4 (seeded), capped at 40. The Milestone 5 generator rules are in `docs/plans/milestone-5.md`.
- **Hard courses:** 150% of the normal budget, a guaranteed tier-up squad leader, better rewards.

---

## 15. Regions, course modifiers, unlocks and ending

**Default.**

- **Regions:** three, each with its own biome, enemy pool, hazard mix and boss. ~~The run ends after the third boss. Reaching the end unlocks an endless mode.~~ **Decided (owner, 2026-11-18): after the third boss the run goes on into endless mode.** Each new region scales the same way as the first three (size, threat and toughness as separate dials) and its boss is a seeded pick from the boss randomizer (all bosses, never the same as the last region). **Owner, 2026-11-18: course size caps at region 3's size; threat, toughness, boss health and everything else keep growing each region.** Built in Milestone 8 round 1; numbers in `docs/plans/milestone-8.md` section 10a.
- **Course modifiers** (Milestone 8, optional): a course may roll one rule change, such as wind, low gravity, or darkness that shortens the guide. Each is a set of modifiers and has a budget cost.
- **Unlocks:** new content enters the pool through blue star unlocks (section 10) and by beating each boss for the first time.

---

## Open questions

Opus: use the default and say that you did.

| # | Question | Default until answered |
|---|---|---|
| F1 | Poison at base damage makes the ball deal 0. Is that right, or should damage never go below 1? | Minimum 0. Poison lasts only 2 turns. |
| F2 | Does swapped-out gear stay on the ground? | Yes, until the player leaves the course |
| F3 | Enemy gear drop chance | 10% |
| F4 | Squad theme share chance | 70% |
| F5 | Which elements exist | Fire, ice, shock |
| F6 | Can the boss countdown be bought back up in a shop? | Yes, +1, once per shop |
| F7 | Do blue stars found during a run survive death? | **Answered (owner, 2026-11-17): no.** They are carried until deposited, automatically, at a town or on beating a boss; carried blue stars are lost on death or on closing the game outside a town |
| F8 | Third boss and its gimmick | **Answered (owner, 2026-11-19):** the Brood Queen, hurt only from above |
