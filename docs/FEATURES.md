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
- where it came from (permanent upgrade, run boost, gear, ability, status, trait),
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
- **Owner, 2026-11-14 — moving things and the ball:** free-rolling things (Lunger, Mole, Spitter seed) and the ball deflect off each other. Things on a fixed route (Trundler, sliding block) keep going and knock the ball out of the way, even a resting ball. Details in `docs/plans/milestone-4.md` section 1.2a.

---

## 3. Playable character

**Decided:** one character now. The design must allow more later.

**Template (Default):** id, name, sprite id, starting stat sheet, starting ability (may be none), one passive trait, unlock cost in blue stars.

**Starter set:** one balanced character with the stats in section 1, no starting ability, no trait. Build in Milestone 3. Built as **Rollo** (working name) in `src/content/characters.ts`.

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
| Mole | Sentinel | 2 | Owner, 2026-11-14. Hidden under a molehill. Rolling directly over the hill sets it off: the hill rumbles for a moment (0.5 s), then it shoots up into the air in a random direction and rolls to a stop. It cannot hurt the ball the instant it pops out (0.3 s grace). Hurts the ball only while moving. Stays up for one player turn, then burrows. | 4 |
| Ability carriers | Sentinel | 1 | One Mossback variant per starter ability; grants it on defeat. | 4 |

**Owner, 2026-11-14:** for now every enemy is worth 1 star, whatever its tier (overrides the Stars column of the tier table until the Milestone 8 balance pass).

Tiers 3 and 4, traits, elements, squads and enemy gear are Milestone 8, but the template fields must exist from Milestone 4.

---

## 5. Bosses

**Decided:** a boss is mainly a large health bar with phases. Some bosses, not all, also have a weak-point puzzle.

### Template (Default)

id, name, sprite id, health, phases (each with a health threshold, an attack pattern, and a list of enemies it summons), optional gimmick (a weak spot, a shield that must be broken a certain way, or none), arena layout set, element, rewards.

**Default rules:**

- The boss summons small enemies during the fight. They drop stars and abilities, so the player's tools keep flowing.
- The boss course has no star quota. The exit opens when the boss is defeated.
- Rewards: blue stars, a full heal, and a choice of one from three gear items.

### Starter set

| Working name | Gimmick | Milestone |
|---|---|---|
| The Warden | None. Three phases: slow slams, then summons, then both faster. | 7 |
| Second boss | Shield that only drops after it attacks | 8 |
| Third and final boss | Decide with the owner | 8 |

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

- Three categories: **weapon**, **armour**, **accessory**.
- The ball holds one of each. An upgrade may later allow two of a category.
- Rolling over gear of a category already held drops the current item and equips the new one automatically.
- Gear never needs a button. Weapon effects are automatic and trigger only on contact with an enemy.
- Gear is lost on death.

**Default:**

| Category | When its effect applies |
|---|---|
| Weapon | On contact with an enemy |
| Armour | When the ball takes damage or touches a hazard |
| Accessory | Always on |

- A swapped-out item stays on the ground where it was dropped, so an accidental swap can be undone by rolling back over it. It is lost when the player leaves the course.
- Buying gear in a shop for a filled category shows both items side by side and asks to confirm.
- Rarity: common, rare, epic. Rarity sets price, drop weight and strength.
- Sources: placed on courses, shops, caches, boss rewards, and the small enemy drop chance.

### Template (Default)

id, name, icon id, category, rarity, element (weapons only, or none), modifiers while equipped, triggered effect (if any) and its trigger, price.

### Starter set, Milestone 6

| Working name | Category | Rarity | Effect |
|---|---|---|---|
| Studded Shell | Weapon | Common | +1 hit damage |
| Ember Coat | Weapon | Rare | Hits are fire and set the enemy burning |
| Padded Lining | Armour | Common | The first damage taken each course is ignored |
| Thorn Guard | Armour | Rare | An enemy that damages the ball takes 1 damage |
| Star Magnet | Accessory | Common | +2 star reach |
| Long Sight | Accessory | Common | Guide length ×2 |

---

## 9. Run upgrades (stat boosts)

**Decided:** separate from gear. Plain stat boosts, no slot limit, lost on death.

**Default:** bought in shops or found in caches. Each is one modifier lasting for the run. They stack. The price rises each time the same boost is bought in one run.

**Starter set, Milestone 6:** +1 max health; +1 max shots; +10% shot power; +1 star reach; +25% drop luck.

---

## 10. Permanent upgrades

**Decided:** bought with blue stars. A levelled list plus one-time unlocks.

**Default:** bought on the hub screen between runs.

### Levelled list, Milestone 7

| Upgrade | Levels | Per level |
|---|---|---|
| Vitality | 5 | +1 max health |
| Stamina | 5 | +1 max shots |
| Head Start | 3 | +10 starting yellow stars |
| Haggler | 3 | −10% shop prices |
| Fortune | 3 | +10% drop luck |

Cost rises with each level.

### Unlocks

| Unlock | Milestone |
|---|---|
| Start each run with a chosen ability | 7 |
| Second weapon, armour or accessory slot (one unlock per category) | 8 |
| New gear and abilities added to the pool of things that can appear | 8 |
| New characters | 8 |

---

## 11. Shops

**Decided:** each shop sells a random handful. Stock can be rerolled for yellow stars.

**Default:**

- Five offers: two gear items, two stat boosts, one service.
- Services: heal 2 health, or raise the boss countdown by 1.
- Reroll price starts low and doubles with each reroll in the same shop.
- Prices follow rarity and are multiplied by the shop prices stat.
- The run shop takes yellow stars only. Blue stars are spent only on the hub screen.

Build in Milestone 6.

---

## 12. Status effects

**Decided:** a small set. They apply to the ball and to enemies.

### Template (Default)

id, name, icon id, modifiers while active, effect each turn, duration in turns, whether a second application adds time or is ignored.

### Starter set (Default)

| Status | On an enemy | On the ball | Lasts |
|---|---|---|---|
| Poisoned | −1 hit damage and attack damage | −1 hit damage | 2 turns |
| Burning | 1 damage at the start of each enemy turn | 1 damage at the start of each shot | 2 turns |
| Stunned | Skips its next turn | Loses 1 shot | 1 turn |
| Chilled | Cannot move; the next hit on it does double damage | Rolls as if on ice | 2 turns |

For the ball, one turn is one shot. Build the system and Stunned in Milestone 4; the rest in Milestone 8.

---

## 13. Pickups

**Default.** Things on a course that are collected by touch and are not gear.

| Pickup | Effect | Where it comes from |
|---|---|---|
| Yellow star | +1 to the meter and the wallet | Enemies, crates |
| Blue star | +1 permanent currency | Elites, bosses, hidden spots |
| Heart | +1 health | Crates, rare enemy drop |
| Shot orb | +1 shot, up to the maximum | Crates, placed on courses |
| Wild | A random ability (not the one held), replacing the current one | Small chance from secured crates, 10% times drop luck (owner, 2026-11-14) |

Build in Milestone 3.

---

## 14. Economy and difficulty

**Default.** All values are first guesses, to be corrected in the Milestone 8 balance pass.

- **Quota:** about 60% of the stars available on a course.
- **Prices:** common gear 15, rare 30, epic 60, stat boost 12 rising by 6, heal 10, first reroll 3.
- **Budget:** each course has a difficulty budget that rises with each node and jumps after each boss. Enemies, traits, obstacles and hazards each cost budget.
- **Tier mix by region:** region 1 is mostly tiers 1–2; region 2 adds tier 3; region 3 adds tier 4.
- **Hard courses:** 150% of the normal budget, a guaranteed tier-up squad leader, better rewards.

---

## 15. Regions, course modifiers, unlocks and ending

**Default.**

- **Regions:** three, each with its own biome, enemy pool, hazard mix and boss. The run ends after the third boss. Reaching the end unlocks an endless mode.
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
| F7 | Do blue stars found during a run survive death? | Yes |
| F8 | Third boss and its gimmick | Decide in Milestone 8 |
