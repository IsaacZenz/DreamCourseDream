# Milestone 8 design sheet — Content and balance

**Status: round 1 written 2026-11-18; endless mode added at the owner's request the same day (section 10a) and agreed by the owner. Owner answered questions 1, 7, 8, 9 and 11 to 13 on 2026-11-18; questions 2 to 6 and 10 have follow-ups waiting (section 12).** Nothing on this sheet is built yet.

How to review: read each section and change any number, name or rule you want. Section 12 lists the questions I need answered; each has a default I will use if you say "defaults are fine". Every number is a starting value and goes into `src/content/` so it can be tuned later.

---

## 0. Splitting the milestone into three rounds

Milestone 8 is the biggest milestone in the plan: eleven checklist items, each one about the size of a small milestone. The plan allows it to be planned and built in rounds, each with its own sheet and sign-off. I suggest three:

| Round | Theme | PLAN.md items | What you can play at the end |
|---|---|---|---|
| **1 (this sheet)** | **Enemies, elements and bosses** | Enemy tiers 3 and 4, traits, elements, weak spots, squad themes, enemy gear; Poisoned, Burning, Chilled; more enemy types in both families; second and third boss; two of the remaining abilities (Frost and Static, because the elements need an ice and a shock source) | **Three regions and a final boss**, which is the milestone's "done when", then **endless mode** (owner, 2026-11-18; section 10a) |
| 2 | Abilities and the world | The other four abilities (Burr, Kite, Gyre, Drift); linked objects (switches, gates, bridges); optional course modifiers; three biomes; the theme switch after each boss | Each region looks and plays differently |
| 3 | Characters, gear and balance | Second gear slot unlocks; extra characters; more gear and shop variety; the balance pass with the bot; the remaining open questions | A fair difficulty curve, judged by you |

Why this order: round 1 is what makes a full three-region run exist at all. Round 3's balance pass has to come last, because every new enemy, ability and item changes the difficulty.

**Owner, 2026-11-18: yes, three rounds.**

---

## 1. What round 1 adds, in one paragraph

Enemies get **ranks**: an ordinary enemy can turn up as a **Veteran** (tier 3) or an **Elite** (tier 4), tougher, carrying **traits** (Shielded, Armoured, Swift, Explosive, Regenerating, Splitting), an **element** (fire, ice, shock), a **weak spot** or a **guarded side**, and sometimes a piece of **gear** it can drop. Enemies come in **squads with a theme**, so a whole group may be fiery or shielded. Elemental enemies pass on the matching **status**: fire **burns** the ball, ice **chills** it, shock **stuns** it, and a new enemy **poisons** it. There are **five new enemies** (three patrollers, two sentinels) and **two new abilities**, **Frost** and **Static**. **Region three** opens, with a **second boss**, **Gloamhorn**, a rhinoceros beetle whose wing cases only open after it charges, and a **final boss** (still being discussed, section 7.0b). Beating the final boss wins the run, and endless mode follows. **Owner, 2026-11-18: every enemy is an insect** (section 7.0).

---

## 2. Statuses (FEATURES.md section 12)

Stunned and Burning on enemies already exist. Round 1 adds the rest. For the ball, one turn is one shot; for an enemy, one turn is one enemy turn.

| Status | On an enemy | On the ball | Lasts | Second application |
|---|---|---|---|---|
| **Poisoned** (new) | Attack damage −1 (never below 0) | Hit damage −1. Open question F1 default: **can go to 0**, so a poisoned ball with no gear deals no damage for 2 shots | 2 turns | Resets the time |
| **Burning** on the ball (new) | (already built) | **1 damage at the start of each shot**, the moment the turn begins, before you aim | 2 turns | Resets the time |
| **Chilled** (new) | **Cannot move** (a patroller stops, a Pouncehopper cannot launch, a Mole Cricket cannot pop out; a Spittlebug can still lob). **The next hit on it does double damage**, then the chill ends | **Rolls as if on ice:** grass, rough and sand use ice's friction (bounce unchanged). Hazard pads and water work as normal | 2 turns | Resets the time |

**Rules between statuses (Default):**

- **Fire and ice cancel.** Burning put on a chilled thing removes both, and the other way round.
- **Water puts out a burning ball.** Rolling through, or stopping in, water ends Burning on the ball.
- **Regenerating stops while burning** (section 4).
- Burn damage at the start of a shot respects the 0.5 s damage immunity like any other damage. It can end the run.
- The HUD shows each status on the ball as an icon with the turns left. Enemies show a small icon above them, as Stunned does now.

**Where statuses come from:**

| Status | On the ball, from | On an enemy, from |
|---|---|---|
| Poisoned | A Bristlecrawler's spines; a Stinkpuff's spores; the final boss's poison attack (if option A) | Nothing yet in round 1 (round 3 adds poison gear) |
| Burning | Any **fire** enemy that hurts the ball | Fire gear (built); the Burner ability now burns what it hits for 1 turn (new, no roll needed) |
| Chilled | Any **ice** enemy that hurts the ball | The **Frost** ability (section 6) |
| Stunned | Any **shock** enemy that hurts the ball (lose 1 shot) | Knob gear and Anchor (built) |

---

## 3. Elements on enemies (FEATURES.md section 2)

The damage steps already handle weak (×2) and resistant (halved, rounded down). What is new is enemies that **have** an element.

| Enemy element | Looks | Weak to | Resists | When it hurts the ball |
|---|---|---|---|---|
| Fire | Red-orange tint, small flame | Ice | Fire | Also **Burning** 2 turns |
| Ice | Pale blue tint, frost crystals | Fire | Ice | Also **Chilled** 2 turns |
| Shock | Yellow tint, sparks | (nothing) | Shock | Also **Stunned** (lose 1 shot) |

- An enemy that never hurts the ball (a Snoozegrub, a grub) still gets the weakness and resistance from its element, so a fire Snoozegrub takes double from Frost.
- **Your own hits get an element** from your weapon (built) or your current ability while it is active (Burner fire, Frost ice, Static shock). If both give one, the **ability wins** for that hit (Default).
- The tint is a colour **set in the asset manifest per element**, not in game code, so the final art can replace it.

**Owner, 2026-11-18 (question 3): shock enemies are weak to "the remaining element not tied to a weakness".** Read literally that is shock itself (fire and ice are already each other's weakness), which clashes with "an enemy resists its own element". Two ways to do what I think you mean; **waiting for your pick** (section 12, question 3):

- **A. A circle (my recommendation).** Each element is exactly one weakness: **fire is weak to ice, ice is weak to shock, shock is weak to fire.** Every element is equally useful and none is the "safe" one. Changes one row above: ice enemies become weak to shock, not fire. Flavour: ice puts out fire, a jolt shatters ice, fire burns out a spark.
- **B. Shock is weak to plain hits.** The leftover "attribute" is having no element at all. A shock enemy takes double from a hit with no element, which is most hits early in a run. Shock enemies become the easiest to beat by just hitting them, and the hardest to beat with gear.

---

## 4. Ranks: Veteran and Elite (tiers 3 and 4)

**How it works.** Rather than writing a separate "Veteran Mudroller" entry for every enemy, the generator can **promote** any placed enemy one or two ranks. A rank is a data entry: extra health, how many traits, the chance of an element, a weak spot or guarded side, gear, and extra stars. A tier 1 or 2 enemy promoted once is tier 3; promoted twice, tier 4. This is how the tier table in FEATURES.md section 4 gets built without doubling the enemy list. Bosses and summoned minions are never promoted.

| Rank | Tier | Health | Traits | Element | Weak spot or guarded side | Gear | Stars | Cost |
|---|---|---|---|---|---|---|---|---|
| Standard | 1–2 (as now) | as now | 0 | squad theme only | no | no | 1 (owner's "1 per enemy") | as now |
| **Veteran** | 3 | +1 | 1 (30%: 2) | 70% | 30% | 25% | **2** (owner, 2026-11-18) | ×1.5 + traits |
| **Elite** | 4 | +2 | 2 (30%: 3) | always | 70% | 60% | **2**, and a **10% blue star** chance (× drop luck) | ×2 + traits |

Region toughness (built in Milestone 7) still adds on top: region two +1 health, region three +1 health and +1 attack damage.

**Examples:** a region-two Veteran Mudroller with Swift has 2 + 1 + 1 = **4 health**, is worth 2 stars. A region-three Elite Pouncehopper with Explosive and Armoured has 2 + 2 + 1 (Armoured) + 1 (region) = **6 health**, worth 2 stars, hits for 2.

**Stars (owner, 2026-11-18): Veterans and Elites are worth 2 stars; every other enemy stays at 1.** Traits add no stars.

### 4.0 Keeping the quota as hard as it is now (owner, 2026-11-18)

**Owner: collecting the quota must not become easier than it is now.** It is not accounted for yet. Today the quota is 60% of all stars on the course, and every enemy is worth 1, so you must beat 60% of the star sources. With 2-star enemies that rule would let you beat fewer things: 10 enemies with 3 Veterans give 13 stars and a quota of 8, reachable with **5** defeats (3 Veterans + 2), where today it takes **6**.

**New quota rule:** count the star sources (each enemy, each star in a crate), take 60% of that count as **N**, and set the quota to **the stars you would get from the N richest sources**. In the example: N = 6, the six richest are 3 Veterans and 3 others, so the quota is 2 + 2 + 2 + 1 + 1 + 1 = **9**.

What this means:

- The **fewest defeats** you can win with is the same as today (6 of 10), and those must include the tough ones.
- Skipping the Veterans costs **more** defeats than today (9 ordinary enemies would be needed, and there are only 7, so you must take at least one Veteran).
- A course with no Veterans or Elites gets exactly today's quota.
- Extra stars that come from inside an enemy (a Splitting enemy's two Grublets, a bauble's +1 star) count in the "richest" sum too, so they can only raise the quota, never lower it.
- The course check's bot must still meet the quota, so every course stays beatable.

**One side effect:** more stars also means more yellow stars in your wallet to spend in shops, in regions two and three. Round 3's balance pass looks at shop prices with that in mind. If you would rather the extra star fill the meter but not the wallet, say so.

### 4.1 How often ranks appear

| Region | Each enemy is a Veteran | Each enemy is an Elite | Squad leader (section 5) |
|---|---|---|---|
| 1 | 0% | 0% | Hard courses only: one Veteran leader per course |
| 2 | 15% | 0% | 50% chance per squad: one Veteran leader |
| 3 | 25% | 8% | Every squad: a leader one rank up (Veteran, or Elite if it already was one) |

Hard courses: every squad gets a leader one rank up, in every region (FEATURES.md section 14: "a guaranteed tier-up squad leader").

### 4.2 Weak spots and guarded sides

A promoted enemy that rolls one gets one of these (equal chance, only those its entry allows):

| Kind | Rule | Shown as |
|---|---|---|
| **Soft top** | Hit **from above** (the ball was in the air just before contact): double damage | A bright patch on top |
| **Weak back** | Hit **from behind**: double damage | A bright patch on the back |
| **Guarded front** | Hit **from the front**: blocked, no damage, ball bounces off | A plate on the front |

"Front" and "behind" use the direction the enemy faces: a sentinel's `facing` in the course file, a patroller's direction of travel. Side hits count as neither. A hit from above on a guarded-front enemy counts (above beats guarded).

---

## 5. Traits and squad themes (FEATURES.md section 4)

### 5.1 The six traits

Each is a set of modifiers or one small rule. Each raises cost and star value.

| Trait | Rule | Extra cost | Allowed on |
|---|---|---|---|
| **Shielded** | Blocks the first hit of each shot (built in the damage steps; a ring shows while it is up). A blocked hit gives no shot back | +2 | every enemy |
| **Armoured** | +1 health (modifier, source "trait") | +1 | every enemy |
| **Swift** | Patrollers move 1.6× faster. Pouncehoppers launch twice per enemy turn. Mole Crickets pop out after 0.15 s instead of 0.3 s | +2 | Mudroller, Skitter Ant, Bristlecrawler, Glowmoth, Pouncehopper, Mole Cricket |
| **Explosive** | When defeated it goes off after a short fuse. Full rules in section 5.1a | +1 | every enemy except Mole Cricket |
| **Regenerating** | Recovers 1 health at the start of each enemy turn, up to its maximum. Not while burning | +2 | every enemy with 2+ health |
| **Splitting** | When defeated, two **Grublets** (new tier 1 sentinel, 1 health, never acts, 1 star each) pop out 0.6 tiles to either side. They do not split again. The original leaves its flag pole as usual; Grublets leave flags too | +2 | every enemy except Mole Cricket and Skitter Ant |

### 5.1a Explosive in detail (owner, 2026-11-18: "I don't want it to clear the board by accident")

**What you see:** the defeated bug swells and flashes red, and a red ring is drawn on the ground showing the blast's reach (1.5 tiles). After **0.6 s** it pops.

**What the blast does (my proposal):**

| Thing inside the ring | What happens | Why |
|---|---|---|
| **The ball** | 1 damage and pushed away (6 tiles per second, a small hop). The 0.5 s damage immunity applies | The risk of the trait. A ball still moving at speed is usually out of the ring before it pops; a ball that stopped next to it gets caught |
| **Other enemies** | 1 damage, but **a blast never defeats an enemy**: it stops at 1 health and gets a scorched mark | **This is what stops board clears.** Nothing dies to a blast, so a blast can never set off another one, and no chain reaction is possible. It still helps: one hit then finishes anything scorched |
| **Sentinels it touches** | Woken (activated), as if hit | The cost of using it: a blast next to a sleeping Spittlebug wakes it up |
| **Enemies' positions** | **Not pushed** | A pushed enemy sliding over a raised flag would knock its star off and cost you stars |
| **Shots back** | None for blast damage | Otherwise one blast through a group would refill all your shots |
| **Crates** | 1 damage (a crate breaks, a secured crate cracks) | A small bonus; crates are not enemies |
| **Flag poles, stars, pickups, gear** | Untouched | |
| **Bosses** | Bosses and summoned minions are never Explosive, and a blast does not hurt a boss | |

**Placement rule:** two Explosive enemies are never placed within 3 tiles of each other, so one fight never has two fuses going at once.

**Other ways to do it, if you prefer** (section 12, question 4):

- **B. Blast hurts only the ball.** Simplest and safest, but the trait is then only a danger, never a tool.
- **C. A blast can defeat enemies, but a bug defeated by a blast never explodes itself.** No chains, but a blast in a crowd of 1-health bugs can still take out three or four at once.

Snoozegrubs and the grubs may take Shielded, Armoured, Explosive and Splitting only. A grub that splits gives its ability on the first defeat.

### 5.2 Squad themes

The generator already places enemies in squads of 2 to 5. Each squad now rolls a theme.

| Region | No theme | Element theme | Trait theme |
|---|---|---|---|
| 1 | 80% | 20% | 0% |
| 2 | 40% | 30% | 30% |
| 3 | 20% | 40% | 40% |

- An element theme picks fire, ice or shock (equal chance). A trait theme picks one of the six (equal chance).
- **Each member takes the theme with 70% chance** (open question F4 default), if its entry allows it.
- The theme's extra cost is paid from the budget like everything else; if a member cannot afford it, it skips it.
- Elements in region 1 come only from squad themes, so region 1 has occasional fire or ice groups but no traits, ranks or gear.

### 5.3 Enemy gear (FEATURES.md section 4)

- A Veteran (25%) or Elite (60%) may **carry a real gear item**, picked from the region's rarity odds, from the categories its entry allows.
- While it carries it, the enemy gets a **fixed bonus by category** (not the item's own effect): **weapon +1 attack damage**, **armour +1 health**, **bauble +1 star**. An enemy that never attacks only gets armour or a bauble.
- The item's icon floats above the enemy, so you can see what it might drop.
- **Drop chance 10%** (open question F3 default), times your drop luck. A dropped item lands where the enemy stood, like gear on a course.

---

## 6. Two new abilities: Frost and Static (DESIGN.md section 9)

Both use the ability key during a shot, once per shot, like the others. Each has a grub (a Snoozegrub variant that grants it on defeat): **Frostgrub** and **Sparkgrub**. Both join the Burrow's starting-ability shop at 8 blue stars each, and the Wild pickup.

### 6.1 Frost (ice)

| Field | Value |
|---|---|
| id | `frost` |
| element | ice |
| duration | 2.5 s |
| effect | While active: any **water** tile the ball touches (rolling or landing) **turns to ice** for **2 turns** (owner, 2026-11-18; 6.1a). Enemies the ball hits are **Chilled** (2 turns) and the hit is ice (double against fire enemies). The ball leaves a trail of frost |
| does not | Freeze the ball itself; change the ball's own friction (it rolls normally on grass; on new ice it slides like on any ice) |

Frozen water shows the ice sprite with a faint water colour under it. A frozen tile can hold the ball, so you can rest on it.

### 6.1a Melting (owner, 2026-11-18)

- **Owner:** frozen water stays frozen for **2 turns**. Freezing an already-frozen tile again **resets it to 2 turns**.
- **Default (owner may change):** a turn is one of your shots. A tile frozen during a shot stays ice through your next 2 shots and melts when the second one ends (after the ball has come to rest, before the enemy turn). The shot that froze it does not count.
- On its last turn the ice shows **cracks**, so you know it will melt.
- **A ball resting on ice when it melts** is now in water and counts as stopping in water: 1 damage, and the next shot is the weaker shot from inside water. Using Frost again on that shot re-freezes the tile around it and resets its timer.
- A nap counts as a turn (the enemies act, so the ice ages).

### 6.2 Static (shock)

| Field | Value |
|---|---|
| id | `static` |
| element | shock |
| duration | 1.5 s |
| effect | A crackling field of **radius 1 tile** round the ball. Each enemy inside the field takes **1 shock damage, once** per use (a hit from your own action: shots back, triggers, stars). Hits the ball makes while it is active are shock |
| bonus | While the field is up, the ball **passes under thunder clouds without being zapped** (it is already charged) |
| does not | Hurt crates, or stun |

---

## 7.0 The insect cast (owner, 2026-11-18)

**Decided (owner): every enemy is an insect.** This answers half of DESIGN.md open question 9: the villains are insects, not reptiles and amphibians. A nice fit: the hero is an armadillo, and armadillos eat bugs.

Every enemy, old and new, gets a bug identity and a bug name. **Rules and numbers do not change**, only names, looks and the placeholder sprites. Ids in the code are renamed too, and the old ids are kept in the "renamed" list so an old course file gives a clear message and old saves are upgraded.

| Old name | New name | What bug it is | Look (placeholder, then Milestone 9 art) |
|---|---|---|---|
| Mossback | **Snoozegrub** | A fat beetle grub, fast asleep | Curled pale grub with a sleep bubble. Never acts |
| Anchorback | **Leadgrub** | A grub carrying the Anchor power | Grey, heavy, iron-coloured stripes |
| Emberback | **Embergrub** | ... Burner | Glowing orange stripes |
| Hopback | **Hopgrub** | ... Hop | Green, with springy little legs |
| Whirlback | **Whirlgrub** | ... Tornado | Spiral stripes |
| (new) Frostback | **Frostgrub** | ... Frost | Pale blue, frosted |
| (new) Sparkback | **Sparkgrub** | ... Static | Yellow, crackling |
| Trundler | **Mudroller** | A dung-beetle-like beetle pushing a mud ball along its path | The mud ball is what knocks you |
| Spitter | **Spittlebug** | A squat bug that lobs gobs of spit | The seed becomes a spit glob |
| Lunger | **Pouncehopper** | A grasshopper that hurls itself at you and tumbles | Long back legs, tucks in to roll |
| Mole | **Mole Cricket** | A digging cricket under a mound | Big digging forelegs, pops out of the mound |
| (new) Skitterling | **Skitter Ant** | A small, fast worker ant | Thin, quick legs |
| (new) Bramblehog | **Bristlecrawler** | A spiny caterpillar with stinging bristles at its head | Spines at the front (guarded, poison), soft green rear (weak) |
| (new) Glowmoth | **Glowmoth** (kept: already a moth) | A floating moth with a glowing belly | Hovers, with a shadow on the ground |
| (new) Snapjaw | **Trapjaw** | A trap-jaw ant with huge mandibles | Jaws at the front (guarded, bites), narrow back (weak) |
| (new) Puffcap | **Stinkpuff** | A stink bug that puffs a cloud | Shield-shaped back with a vent; land on its back to pin it (no puff) |
| (new) Sproutling | **Grublet** | A tiny larva from a Splitting bug | A small Snoozegrub |
| The Warden | **The Stagwarden** | A giant stag beetle, the guard of region one | Huge antlers it slams down; cracks in its shell per phase |
| (new) Gloamshell | **Gloamhorn** | A giant rhinoceros beetle | Its wing cases (the hard shell) are shut; after a charge they **open**, showing its soft back. This is the "shield that drops after it attacks", made into a bug |
| Final boss | **Open** (section 7.0b) | The leader of the bugs | |

**Question 10:** these names? Change any you like.

### 7.0a The element and trait looks, as bugs

- Fire bugs: red-orange shell with glowing spots. Ice bugs: frosted blue shell. Shock bugs: yellow with sparking antennae.
- Shielded: a tougher, shinier shell plate. Armoured: thicker plates. Swift: thin streaks behind it. Explosive: a swollen, glowing belly (like a bombardier beetle). Regenerating: a leafy green glow. Splitting: a bulging egg sac.
- Veteran: a stripe on its shell. Elite: a little crown of horns.

### 7.0b The final boss: options to discuss (question 5)

The final boss is the bugs' leader, the villain of the game. Three ideas, each with a different skill to master:

| | **A. The Brood Queen** (my recommendation) | **B. The Mantis Regent** | **C. The Hive Matron** |
|---|---|---|---|
| Bug | A giant queen ant, sitting in her mound | A huge praying mantis | A queen wasp inside a wax hive |
| Gimmick | **Only her back can be hurt, from above.** Her armoured sides bite (1 damage and blocked). Land on her with a lofted shot, a spring or Hop (the first draft's Mother Bramble rules, as a bug) | **Her scythes guard her front, and she turns to face you every turn.** Only hits from behind or the side count. She sweeps a cone in front of her | **A ring of wax cells surrounds her.** Break cells to open a gap, then hit her through it. The cells regrow when she changes phase; in phase 3 she flies out and stings |
| Phases | Acid glob barrage (three at once) → soldier ant rings (poison) → both, plus summons | Scythe sweep → leaping strike across the arena → both, faster | Summons from the cells → cells regrow faster → flying sting dives |
| Skill it tests | **Lofting and aim**: the skill no other boss asks for | **Positioning**, but Trapjaw and Gloamhorn already test "get behind it" | **Breaking things**, closest to a puzzle; uses crates' rules |
| Arena | A clearing with four springs round her mound | Open and flat, with rails | A wax floor with cells; no water |

Why A: the Stagwarden tests dodging, Gloamhorn tests timing and getting behind it, so the Brood Queen testing lofting gives each boss its own skill.

### 7.0c Boss order: options to discuss (question 6)

There are two bosses for regions one and two (the Stagwarden and Gloamhorn), and your boss randomizer picks each region's boss from its pool.

| | **A. Once each, random order** | **B. Fixed order (my recommendation for now)** | **C. Fully random** |
|---|---|---|---|
| Rule | Both pools hold both bosses; a run never repeats one | Region 1's pool: the Stagwarden. Region 2's: Gloamhorn. Each pool grows as bosses are added later, and the randomizer picks from it | Both pools hold both; repeats allowed |
| Good | Variety from run to run | **A learning curve**: the boss with no gimmick first, the one with a gimmick second. Gloamhorn in region 1 would be a hard first boss for a new player | Simplest |
| Bad | A new player may meet Gloamhorn first | Every run starts the same until more bosses exist | A run can meet the same boss twice |

Endless mode is the same in all three: all bosses, never the same as the last region.

## 7. Five new enemies, and the Grublet

All original working names. All use the full enemy template; everything not listed is the plain default (no element, no weak spots, no shield).

### 7.1 Patrollers

| Field | **Skitter Ant** | **Bristlecrawler** | **Glowmoth** |
|---|---|---|---|
| Tier | 1 | 2 | 2 |
| Health | 1 | 2 | 1 |
| Idea | A small, fast bug that runs a short path. A timing target | A spiny hog that patrols. Its face is armoured; its back is soft | A moth that floats above its path. Ground shots pass under it |
| Path speed | 2.8 tiles/s (Mudroller is 1.5) | 1.2 tiles/s | 1.0 tiles/s |
| Contact | Knocks the ball (knock 3), **no damage** | 1 damage, knock 5, and **Poisoned** 2 turns | Never hurts |
| Weak spots / guarded | none | **Guarded front**, **weak back** (always, not rolled) | none |
| Special | | | Floats **0.9 tiles** up (new field `float` on the patrol behaviour). A rolling ball goes under it; only a ball in the air at its height hits it: a lofted shot, a bounce, a spring or Hop. It ignores rails and water, and the aim guide shows its height |
| Cost | 2 | 4 | 3 |
| Generator weight | 2 | 2 | 1 (and only in areas with open ground) |

### 7.2 Sentinels

| Field | **Trapjaw** | **Stinkpuff** |
|---|---|---|
| Tier | 2 | 2 |
| Health | 2 | 1 |
| Idea | A big-mouthed ambusher that turns to face you | A mushroom that puffs poison spores |
| Triggers | Hit: activated. Rest (outer radius 3): activated. Pass-by: none | Hit: **immediate**. Rest (outer radius 2.5): activated. Pass-by (inner radius 1.2): activated |
| Each enemy turn, once active | **Turns to face the ball** (new behaviour `face`). It never moves from its tile | **Marks a ring** of radius 1.5 round itself; on its next enemy turn the ring **puffs**. A ball resting inside is **Poisoned** (2 turns, no damage) |
| On being hit | | Puffs at once: the ball is Poisoned if it is within 1.2 tiles, **unless the hit came from above** (land on its cap) |
| Contact | **Its front bites**: a ball hitting its front takes 1 damage and is blocked. From the side or behind it is a normal hit | Never hurts |
| Weak spots / guarded | **Guarded front** (and it bites), **weak back** | **Soft top** |
| Cost | 3 | 3 |
| Generator weight | 2 | 2 |

Stinkpuff's ring reuses the boss slam code (mark, then land on the next enemy turn), with a status instead of damage and knock-back.

### 7.3 Grublet (from Splitting)

Tier 1 sentinel, health 1, never acts, never hurts, 1 star, cost 0 (paid by the Splitting trait). Not placed by the generator.

### 7.4 Carriers

| Carrier | Grants |
|---|---|
| Frostgrub | Frost |
| Sparkgrub | Static |

Same as the four existing grubs: a Snoozegrub variant, tier 1, health 1, cost 2.

---

## 8. Second boss: Gloamhorn (FEATURES.md section 5: "shield that only drops after it attacks")

### 8.1 Template

| Field | Value |
|---|---|
| id | `gloamshell` |
| name | Gloamhorn (working name) |
| sprite id | `gloamshell` (placeholder: a big dark domed shell, about two tiles wide; a closed and an open frame) |
| health | **8** in region 1, **12** in region 2 (fewer than the Stagwarden, because you can only hit it some of the time) |
| element | none |
| size | round, radius 0.8 tiles, height 1.3 |
| gimmick | **The shell.** Closed, every hit is blocked and the ball bounces off (bounce 0.8). It **opens only after it charges** (8.3), for your next shot. While open, it takes **up to 2 hits** in that shot (`hitsPerShot` 2 while open) and hits from **behind do double** (weak back) |
| contact | Hurts only while charging (8.3) |
| arenas | Bumper Ring, Ice Rink, Storm Steps (the open ones; the Moat and Sinkhole Bowl do not suit a charging boss). Never the last arena used |
| rewards | as the Stagwarden: blue stars (region 1: 5, region 2: 8), a full heal, a gear pick of 1 from 3 |

### 8.2 Phases

| Phase | Health left | Each enemy turn |
|---|---|---|
| 1 — Rumble | above 2/3 | **Charges every other turn**: one turn it winds up (a red arrow shows where it will go), the next it charges |
| 2 — Brood | 2/3 to 1/3 | Charges every other turn, and on the turns between it **summons** one minion while fewer than 2 are alive (Skitter Ant 40%, a grub 40%, Bristlecrawler 20%) |
| 3 — Frenzy | below 1/3 | **Winds up and charges in the same turn** (the arrow shows for 1 s first), every turn. No summons |

Phase change: it sheds a heart and a shot orb, like the Stagwarden.

### 8.3 The charge

- **Wind-up:** it turns towards the ball and shows a red arrow along the line it will take.
- **Charge:** it rolls along that line at **9 tiles per second**, like a big Pouncehopper: it bounces off walls and rails, it does not fall off edges (it stops at the edge), water slows it.
- A ball in its way **on the ground** takes **1 damage** and is knocked aside (7 tiles per second, small hop). A ball in the air passes over it.
- When it stops, the **shell opens** until the end of your next shot. Then it closes again.
- Minions in the way are knocked aside but not hurt.

So the rhythm is: dodge the charge, then punish the open shell from behind.

---

## 9. Final boss (open question F8): first draft, on hold until question 5 is answered

This is the first draft (a plant called Mother Bramble). If you choose option A, the Brood Queen, these rules carry over with bug names: seeds become acid globs, the thorn ring becomes a ring of soldier ants, "crown" becomes "back", and The Thicket becomes her mound clearing.

### 9.1 Template

| Field | Value |
|---|---|
| id | `mother-bramble` |
| name | Mother Bramble (working name) |
| sprite id | `mother-bramble` (placeholder: a big thorny mound with a flower crown; three frames, the crown wilting as she weakens) |
| health | **20** (region 3 only) |
| element | none; **resists fire** (she is green and wet). Ice is normal |
| size | round, radius 1.1 tiles, height **1.1** (low enough to land on top with a lofted shot, a spring or Hop) |
| gimmick | **Only her crown can be hurt.** Every side is guarded by thorns: a ball hitting her side takes **1 damage** and is blocked. A hit **from above** (the ball was in the air just before contact) counts, and does normal damage. One hit per shot |
| arena | **The Thicket** (new, section 9.3) |
| rewards | **12 blue stars**, and **the run is won** (section 10) |

### 9.2 Phases

| Phase | Health left | Each enemy turn |
|---|---|---|
| 1 — Seedfall | above 2/3 | **Lobs three globs**, like a Spittlebug, at the ball's spot and 1.5 tiles either side of it (marked one turn ahead) |
| 2 — Thornring | 2/3 to 1/3 | **Thorn ring**: marks a ring round the ball (radius 1.75); next turn it lands: 1 damage and **Poisoned** 2 turns to a ball on the ground in it. Also summons one minion while fewer than 2 are alive (Stinkpuff 50%, a grub 50%) |
| 3 — Overgrowth | below 1/3 | Seedfall and thorn ring on alternate turns, and summons while fewer than 3 are alive (Stinkpuff 30%, Bristlecrawler 30%, Trapjaw 20%, a grub 20%) |

### 9.3 The Thicket (new arena)

A round clearing about 15 tiles across, Mother Bramble in the middle on flat ground. **Four springs** at the corners of a square 3 tiles from her, so a ball rolled onto a spring can fly onto her crown. Two low ledges (1 step up) give lofted shots something to drop from. Rough ground round the edge; no water. Spawn spots: eight, on the outer ring. The arena check (`npm run arenas`) must show the bot winning at least half of 20 seeds, as for the others.

**Owner, 2026-11-18: question 5 is open for discussion** (section 7.0b). Everything in this section is **on hold**: the name, the look and maybe the gimmick change once you choose. The placeholder name below is from the first draft.

---

## 10. Region three and the end of a run

- **Region three opens** with the numbers you signed off in Milestone 7 (sheet section 7.4): 5 to 8 areas, area side 10 to 16, threat 28 + 3 per node capped at 60, at most 18 enemies, every enemy +1 health and +1 attack damage, rarity column 4, par kit max shots +2, hit damage +1, shot power +20%, max health +2.
- **Boss pools:** region 1 and region 2: **The Stagwarden and Gloamhorn**, as decided in question 6 (section 7.0c). Region 3: **the final boss** only.
- **Beating the final boss wins the run:** a "Run complete" screen with the run's totals (courses, enemies, stars, blue stars). The profile records the win (`totals.wins`) and the first win. **Owner, 2026-11-18: the run then carries on into endless mode** (section 10a).

### 10a. Endless mode (owner, 2026-11-18)

**Decided (owner):** after the three regions the run goes on into endless mode. Each new region scales the same way the first three do (size, threat and toughness as separate dials), and each region's boss comes from the boss randomizer already planned.

**Agreed by the owner, 2026-11-18** (questions 11 to 13); the numbers are starting values:

- **After the final boss:** the "Run complete" screen records the win, then offers **Keep going** (region 4 starts at once, with the usual boss reward: full heal and a gear pick) or **Back to the Burrow** (the run ends as a win). Default: Keep going is selected.
- **Endless regions are worked out by a rule, not written one by one.** Region 4 and later take region 3's numbers and add one step per region:

  | Dial | Step per endless region | Region 4 | Region 6 |
  |---|---|---|---|
  | Threat start | +10 | 38 | 58 |
  | Threat per node | same (+3) | 3 | 3 |
  | Threat cap | +12 | 72 | 96 |
  | Most enemies | +2 | 20 | 24 |
  | Enemy toughness | +1 health one region, +1 attack damage the next, in turn | +2 health, +1 attack | +3 health, +2 attack |
  | Boss health | +6 | Stagwarden 30 | Stagwarden 42 |
  | Veteran / Elite share | +3% / +4% (Veteran at most 40%, Elite at most 40%) | 28% / 12% | 34% / 20% |
  | Squad themes | region 3's odds | | |
  | Gear rarity odds | the best column (region 3's) | | |
  | Par kit (the course check's bot) | +1 max shots, +1 max health, +10% shot power | | |
  | Blue stars for the boss | +2 (region 3 gives 12) | 14 | 18 |

- **Decided (owner, 2026-11-18): course size stops growing at region 3's size; everything else keeps growing.** Course size stops growing at region 3's size (5 to 8 areas, side 10 to 16). This is the one place I suggest *not* scaling the same way, and here is why: size is what makes courses slow to make (region two needed fixing in Milestone 7, and region three is untested). If size kept growing, by region 5 or 6 the game would wait minutes for each course or fall back to the simple stand-in course. Threat and toughness keep growing with no speed cost worth worrying about, so endless still gets harder every region. If you want size to grow too, I would measure it and bring you numbers first.
- **Bosses in endless:** every region's pool is **all bosses** (the Stagwarden, Gloamhorn, the final boss, and any added later). The randomizer never picks the **same boss as the last region**, and never the same arena twice in a row (as now). Boss health follows the table above; Gloamhorn and the final boss scale by the same share as the Stagwarden.
- **The display** shows "REGION 4", "REGION 5" and so on. Until round 2 adds the theme switch, endless regions reuse the five looks in turn (round 2 will say which).
- **Records:** the profile keeps the **deepest region reached** (`totals.bestRegion`, already saved) and shows it in the Burrow. Dying in endless is still death: carried items are lost, deposited blue stars stay.
- **The bot's shot limit** and every other rule stay as for region 3.

**The speed risk again.** Region three's courses are the biggest yet. Region two needed options A and B in Milestone 7 to make courses in time. While building I will measure region three with `npm run gen:batch` (6 seeds at 0, 3 and 6 nodes, normal and hard) and report the times. If they are too slow, I will bring you options with numbers (for example 4 to 7 areas, or a threat cap of 48) rather than quietly change the table.

**Owner, 2026-11-18: question 6 is open for discussion** (section 7.0c).

---

## 11. Generator and bot changes

- The squad placer rolls the squad theme, the leader and each member's rank, traits, element, weak spot and gear, all from the seeded random number generator, and pays for them from the threat budget.
- New enemies join the pick weights (section 7). Region 1 gets them too (they are tier 1 and 2).
- Glowmoths are only placed where their whole path is over open ground (no stacked blocks in the way).
- **The bot** already plays the real simulation, so traits, elements and statuses all apply to it. Two small changes: it prefers hitting Trapjaws and Bristlecrawlers from the side or back, and Stinkpuffs and the final boss from above (a lofted shot that lands on them), and it does not use the new abilities (it does not use any ability today).
- The **test bench** (course 5, U panel) gets every new enemy and both new abilities, plus a "rank" choice (Standard, Veteran, Elite), a "trait" choice and an "element" choice for the enemy at the centre, so each can be tried alone.
- **U panel, map:** go to region three; fight a chosen boss in a chosen arena (already exists, gains the two new bosses).

---

## 12. Questions for the owner

| # | Question | Answer |
|---|---|---|
| 1 | Split Milestone 8 into three rounds? | **Owner, 2026-11-18: yes** |
| 2 | Star values | **Owner: Veterans and Elites 2 stars.** Quota must not get easier: the new quota rule (section 4.0). **Please confirm the rule**, and whether the extra star should also go to the wallet (default: yes) |
| 3 | Shock enemies' weakness | **Owner: the leftover element.** **Please pick** A, a circle (fire weak to ice, ice weak to shock, shock weak to fire; recommended) or B, weak to plain hits (section 3) |
| 4 | Explosive | **Owner: may hurt other enemies, but must not clear the board by accident.** **Please pick**: A, a blast never defeats an enemy (recommended), B, ball only, or C, defeats but never chains (section 5.1a) |
| 5 | Final boss | **Open for discussion.** A, the Brood Queen (recommended), B, the Mantis Regent, or C, the Hive Matron (section 7.0b) |
| 6 | Boss order in regions 1 and 2 | **Open for discussion.** A, once each, random; B, fixed order (recommended for now); or C, fully random (section 7.0c) |
| 7 | Frozen water | **Owner: frozen for 2 turns; re-freezing resets to 2.** Melting details in section 6.1a (default: a ball on melting ice counts as stopping in water) |
| 8 | Fire and ice cancel; water puts out a burning ball | **Owner: yes** |
| 9 | Burner burns what it hits for 1 turn, no roll | **Owner: yes** |
| 10 | Names | **Owner: every enemy is an insect.** New names in section 7.0. **Please review** |
| 11 | Endless: Keep going or Back to the Burrow | **Owner: agreed** |
| 12 | Endless: course size caps at region 3, everything else keeps growing | **Owner: yes** |
| 13 | Endless boss pool: all bosses, never the same as the last region | **Owner: agreed** |

## 13. What this needs in the code (for reference)

- **Statuses:** Poisoned and Chilled entries in `src/content/statuses.ts`; Burning on the ball; new status fields (attack damage modifier, "cannot move", "next hit double", "ball rolls as on ice"); the fire–ice cancel and the water rule.
- **Ranks, traits and themes** as data in `src/content/` (a new `enemyMods.ts`), applied through the modifier system with sources "rank", "trait" and "gear".
- **Enemy template:** `contactStatus`, element contact statuses, the `float` field on patrols, two new behaviours (`face`, `pulse`), the Explosive fuse and Splitting spawn as trait rules.
- **Abilities:** `frost` and `static` effect kinds; frozen water as a course-level tile change.
- **Bosses:** a `charge` attack and an "open shell" gimmick, multi-seed lobs and a status ring, in `src/content/bosses.ts` plus the code once; The Thicket arena file; boss pools per region and the no-repeat rule.
- **Run:** `LAST_REGION` becomes 3; a run-complete screen; profile `totals.wins`.
- **Display:** element tints from the manifest; trait, rank and gear icons over enemies; status icons on the HUD; the charge arrow, the puff ring, the thorn ring, the frost trail and the static field.
- **Placeholder sprites:** five enemies, the Grublet, two carriers, two bosses (with frames), two ability icons, three status icons, the frozen water tile, the explosion, and the new arena's look.
- **Tests:** each status, trait, rank and element rule on its own in Node; each new enemy and ability on the test bench; both bosses' gimmicks; the no-repeat boss pick; the seeded squad roll giving the same course for the same seed.

---

## 14. Done when (round 1)

You can play a run through all three regions and beat the final boss, meeting the Stagwarden and Gloamhorn on the way, with Veterans, Elites, traits and elemental squads in regions two and three.

Things to check on purpose once it is built (test bench and real runs):

- Get burned by a fire enemy: lose 1 health at the start of your next two shots. Then roll through water and see the burn go out.
- Get chilled by an ice enemy and feel the ball slide on grass for two shots.
- Get poisoned by a Bristlecrawler and see that a hit then does no damage without a weapon.
- Hit a Trapjaw from the front (it bites), then from behind (double damage).
- Land on a Stinkpuff's cap from above: no spores. Hit it from the side: poisoned.
- Loft into a Glowmoth; roll under one.
- Kill an Explosive enemy and outrun the blast; then kill one slowly and get caught.
- Watch a Regenerating enemy heal, then burn it and see it stop.
- Split a Splitting enemy and collect both Grublets.
- Freeze a river with Frost and rest on it; Static a group of three enemies; roll under a cloud with Static up.
- Fight Gloamhorn: dodge a charge, then hit its open back. Try to hit it while closed.
- Fight the final boss: hit her side (it hurts you), then land on her crown from a spring.
- Win a full run and see the "Run complete" screen.
- Choose Keep going: region 4 starts, enemies are tougher, the boss is a random pick that is not the final boss twice in a row.
- Choose Back to the Burrow instead: the run ends as a win.
