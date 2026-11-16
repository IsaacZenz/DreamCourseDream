# Milestone 7 design sheet — Boss and permanent progress

**Status: signed off by the owner, 2026-11-16**, with the answers recorded in section 9 and the changes in sections 2, 4.3, 5.0, 7.2 and 7b. **Built 2026-11-16**; differences in [section 11](#11-as-built-2026-11-16). Waiting for the owner to play it.

**Owner, 2026-11-16:** the single Warden is replaced by **bug bosses generated from parts** (bug type × colour and power × base skill). Section 2 is rewritten with the owner's answers; items marked **(proposal)** there still need review.

How to review: read each section, change any number or rule you want, and answer the numbered questions in [section 9](#9-questions-for-the-owner). Each question has a default, so "use the defaults" is a valid answer. Every number here is a starting value and goes into `src/content/` so it can be tuned later.

Where this sheet uses a default from an open question in DESIGN.md or FEATURES.md, it says so.

---

## 1. What this milestone adds, in one paragraph

The stand-in boss becomes a **generated bug boss**: a random bug type, colour (with its power) and base skill, with a health bar and three phases, fought in its own **arena**. Beating it heals you, gives **blue stars** and a choice of gear, and starts **region two**: a new map with a higher budget and a different, tougher bug boss at its end. **Blue stars** now have a wallet that is kept forever. Between runs you go to the **hub**, where you spend blue stars on **permanent upgrades** (more health, more shots, starting yellow stars, cheaper shops, better luck) and the **starting ability** unlock. **Everything is saved** in the browser with a version number. A **town is the save point**: leave the game in a town and the run carries on from there next time.

---

## 2. Generated bug bosses

Replaces the single Warden (first draft of this sheet). **Owner decisions, 2026-11-16:**

- Villains are **insects**. A boss is built from three random parts: a **bug type**, a **colour with its power**, and a **base skill**. Every boss summons.
- **Five bug types:** Goliath beetle, Praying mantis, Butterfly, Centipede, Grasshopper. The Bumblebee is dropped.
- **Each colour has its own simple attack**, and the colour **also flavours the base skill** with its effect.
- Fire and ice are weak to each other; **lightning and poison are weak to each other**.
- A hit's damage never drops below 1, **unless a gimmick specifically blocks it** (a shield, a guarded side).
- Each power gets its own icon and particle shape as well as its colour (for colour-blind players).
- **No repeat bug in one run.**
- **Every combination is tested by the bot. Combinations it cannot beat are listed for the owner to review before any is banned.**
- **Split:** Milestone 7 builds the boss generator, all five colours, three skills and three bugs; the rest in Milestone 8.
- **Names come from the parts.**

Items marked **(proposal)** below are the planner's and still need the owner's review.

### 2.1 What every boss has (FEATURES.md section 5 template)

| Field | Value |
|---|---|
| id, name | Made from the parts, for example `boss-goliath-red-slam`, "Ember Goliath the Crusher" (section 2.6) |
| sprite id | `boss-<bug>`, tinted by colour through the manifest (`boss-goliath` + palette `red`). Rainbow cycles its tint |
| health, damage, size, movement | From the bug type (section 2.2) |
| element | From the colour (section 2.3) |
| attacks | The colour attack (section 2.3) and the base skill (section 2.4) |
| summons | Section 2.5 |
| phases | Three (section 2.7) |
| arena layout set | `arena-bug` (section 3) |
| contact | Touching the body does not hurt (except the centipede's head). The ball bounces off, keeping 60% of its speed (Goliath 40%) |
| damage taken | Through the normal damage steps. 0.5 s hit cooldown. Each damaging hit gives back 1 shot, as for every enemy |
| rewards | Section 2.9 |
| family / tier | Boss / tier 5 |

All of it is data in `src/content/bosses.ts`: five bug entries, five colour entries, five skill entries. The boss generator in `src/gen/` picks one of each with the run seed. A new bug, colour or skill is a new entry, plus behaviour code once if it does something new.

### 2.2 Bug types

| Bug | Milestone | Role | Health | Damage | Size (radius, height) | Movement | Its own rule |
|---|---|---|---|---|---|---|---|
| **Goliath beetle** | 7 | Tank | 12 | **2** (owner) | 0.9, 1.5 | None | Heavy shell: the ball keeps only 40% of its speed bouncing off |
| **Praying mantis** | 7 | Quick | 10 | 1 | 0.7, 1.6 | Turns to face the ball | **Every third enemy turn it makes two marks** instead of one (both land the next turn, so you still get a shot to react). A hit from behind does double damage |
| **Grasshopper** | 7 | Jumper | 11 | 1 | 0.7, 1.2 | Every second enemy turn it marks a landing spot within 3 tiles of the ball; next turn it leaps there | Lands with a shockwave: 1 damage within 1 tile. Stands still between leaps |
| **Butterfly** | 8 | Floater (owner: floats above the map so it can move) | 8 | 1 | 0.7, hovers 1 tile up | Drifts up to 3 tiles each enemy turn, over the arena floor only | Ground shots pass under it: **only a ball in the air can hit it** |
| **Centipede** | 8 | Crawler | 12, shared by all segments | 1 | 6 segments of 0.4 | Crawls a loop around the arena all the time, like a Trundler | Body knocks the ball away but does not hurt; the head hurts. Hitting the head does double damage |

**(proposal)** for every number and rule in this table except the Goliath's 12 health and higher damage.

### 2.3 Colours, powers and the colour attack

**(proposal)** for the colour attacks and their numbers. Every attack is marked one enemy turn ahead and lands on the next.

| Colour | Power (element) | Colour attack: the mark | Colour attack: when it lands | Ground left for 2 turns | Weak to (×2) | Resists (½) | Odds |
|---|---|---|---|---|---|---|---|
| Red | Fire | **Fireball:** a ring 1 tile across on the ball | 1 damage + **Burning** | Scorch on the ring: 1 damage on touch | Ice | Fire | 22.5% |
| Blue | Ice | **Frost breath:** a cone from the boss towards the ball, 4 tiles long | 1 damage + **Chilled** | The cone's tiles turn to ice | Fire | Ice | 22.5% |
| Yellow | Lightning (shock) | **Bolts:** the ball's tile plus 2 random tiles within 3 | 1 damage + **Stunned** | A small thunder cloud over the ball's tile | Poison (owner) | Shock | 22.5% |
| Green | Poison | **Spore burst:** a ring 3 tiles across **around the boss itself** | 1 damage + **Poisoned** to a ball inside | 3 poison puddles in the ring: Poisoned on touch | Shock (owner) | Poison | 22.5% |
| Rainbow | All four | One of the four, picked at random each time; the wind-up glows that colour | As the one picked | As the one picked | None | None | 10% |

Each colour attack is different in shape on purpose: fire chases you, ice is a cone in front of the boss, lightning scatters, poison punishes staying close to the boss.

**The colour flavours the base skill:** any hit from the base skill also puts that colour's status on the ball. Ground hazards come only from the colour attack, so the arena does not fill up too fast. A rainbow boss's skill picks a status at random each time, shown by the glow.

**Statuses on the ball** (one turn = one shot; FEATURES.md section 12). Burning on the ball, Chilled and Poisoned were planned for Milestone 8 and come forward to Milestone 7:

| Status | On the ball | Lasts |
|---|---|---|
| Burning | 1 damage at the start of each shot | 2 shots |
| Chilled | Rolls as if on ice | 2 shots |
| Stunned | Lose 1 shot (already built) | 1 shot |
| Poisoned | −1 hit damage **and (proposal) −20% shot power**. See the note below | 2 shots |

**Note on poison and the damage floor.** With the owner's floor of 1, a ball with the starting 1 hit damage loses nothing to poison's −1. So poison would do nothing to a fresh character. The planner proposes poison also cuts shot power by 20% for its 2 shots, so it always matters (question 11).

**Elements the player has today:** fire (the Burner ability, the Coat weapons, Sunfire Crown) and shock (Thunder Knuckle). Ice and poison tools come in Milestone 8 (Frost and others). So in Milestone 7 a blue boss can be hit for double damage with fire, and a green boss with Thunder Knuckle. Red and yellow bosses have no weakness the player can use yet.

**Element on boss hits:** weak ×2, resistant halved and rounded down, but never below 1 (owner: only a gimmick that blocks the hit can take it to 0). Shields and guarded sides still block to 0.

### 2.4 Base skills

**(proposal)** for the numbers. Every skill is marked one enemy turn ahead. A hit also gives the colour's status (section 2.3).

| Skill | Milestone | Shape | The mark | When it lands | Title in the name |
|---|---|---|---|---|---|
| **Slam** | 7 | One big circle | A ring 1.75 tiles across, centred on the ball | Shockwave: the bug's damage, knock 6 tiles/s away from the centre with a small hop | the Crusher |
| **Pod barrage** (owner) | 7 | Many small circles | 4 small rings (0.6 tiles): one on the ball, three at random within 3 tiles | Each pod: the bug's damage inside its ring. A pod that lands on empty ground lies there and **hatches into a helper** on the next enemy turn, unless the ball rolls over it first (breaks it). Helpers still obey the cap (section 2.5) | the Sower |
| **Charge** | 7 | A straight lane | A lane 1.5 tiles wide from the boss, through the ball, to the arena edge | A moving boss (grasshopper, and later butterfly) rushes down the lane and stops at its end; one that cannot move sends a shockwave down it. The bug's damage and a sideways knock of 5 tiles/s | the Rammer |
| **Gust** | 8 | The whole arena, one way | An arrow showing the wind's direction | The wind pushes a resting ball 4 tiles that way. No damage, but it gives the colour's status. A rock between the ball and the wind blocks it | the Gale |
| **Web snare** | 8 | Ground that piles up | 3 tiles near the ball | A ball on a web takes 1 damage and is stuck: next shot at half power. Webs stay 3 turns and act like sand | the Weaver |

Bosses that move (grasshopper, butterfly, centipede) mark from where they stand when the mark is made.

### 2.5 Summons (every boss)

| Number | Value |
|---|---|
| Summon list | One "attacker" from Mossback, Spitter, Lunger (equal odds) **plus** one ability carrier from Anchorback, Emberback, Hopback, Whirlback (equal odds) |
| Enemies per summon | 2 (one of each list) in phase 2; 1 (alternating attacker and carrier) in phase 3 |
| Most helpers alive at once | 4, counting hatched pods. At 4, a summon or a hatch is skipped |
| Where they appear | A free summon pad, chosen at random. A pad is free if no ball, enemy or flag pole is within 0.6 tiles of its centre. No free pad: that helper is skipped |
| Colour | Helpers take the boss's colour: their element is the boss's (shown by tint). Their contact and attacks give that colour's status |
| When one is defeated (owner, 2026-11-16) | **50% chance** it secures 1 yellow star and leaves a flag pole, as a normal enemy does. Otherwise it just dies: no star, no pole. A carrier gives its ability either way **(proposal)**, so the player's tools keep flowing |

Patrollers (Trundler) are not summoned: they need a path drawn for them.

### 2.6 Picking a boss and naming it

- With the boss seed (`<run seed>-BOSS<region>`): a bug at equal odds among the Milestone 7 bugs, **never one already met in this run**; a colour by the odds in section 2.3; a skill at equal odds. Combinations on the banned list (section 2.8, empty to start) are re-rolled.
- **Name** = colour word + bug + skill title. Colour words: Ember (red), Frost (blue), Storm (yellow), Blight (green), Prism (rainbow). Example: "Storm Mantis the Sower". **(proposal)** for the words.
- **Owner, 2026-11-16:** the map shows **an icon of the boss's bug, in the boss's colour**, on the boss marker. No name and no skill, so the player knows the bug and its power (for example, buy a fire weapon for a blue boss) but not the whole boss.
- **The name is shown when the boss battle starts**: a short title card ("Storm Mantis the Sower"), then on the health bar.

### 2.7 Phases and the turn pattern

Every enemy turn the boss first **lands** any marks it made last turn, then may make **new** marks, then its helpers act. A phase starts the moment its health threshold is reached (even mid-shot); its pattern starts from the next enemy turn. Marks already made still land.

| Phase | Health | Pattern |
|---|---|---|
| 1 | Above ⅔ | **Slow:** a new mark every second turn, alternating the base skill and the colour attack |
| 2 | ⅔ down to ⅓ | **Summons:** summon every second turn; a colour attack mark on the other turns. No base skill |
| 3 | Below ⅓ | **Both, faster:** a new mark every turn, alternating base skill and colour attack, and summon 1 every turn. Slam ring 2.25 tiles |

Thresholds round down to whole health (Goliath 12: phase 2 from 8, phase 3 from 4). The mantis's double mark and the grasshopper's leap come on top of this pattern.

### 2.8 Testing every combination (owner, 2026-11-16)

- A headless test fights **every combination** built in Milestone 7 (3 bugs × 5 colours × 3 skills = 45) with the bot, on 10 seeds each, three times: with base stats, with a typical region-one loadout (two run upgrades and a common weapon), and as the region-two version (section 6).
- It writes a report, `docs/reports/boss-combinations.md`: win rate, average health lost and shots used for each combination.
- **Combinations the bot never beats, or beats under 20% of the time, are listed for the owner to review.** Nothing is banned without the owner's say. The owner chooses: tune it, ban it, or keep it.
- Banned combinations, if any, go in a list in `src/content/bosses.ts`.

### 2.9 The boss course and rewards

- **No star quota.** The star meter is replaced by the boss's health bar and name, with notches at the phase thresholds.
- The exit opens on the boss's centre tile when it is defeated. Its marks and summons stop; helpers left alive stay (you may still beat them for yellow stars).
- Naps as everywhere: two; running out of shots a third time fails the course and ends the run.
- **Rewards:** **5** blue stars (**+2** for a rainbow boss; +1 per countdown step left for an early boss), a **full heal**, and a **choice of one of three gear items** or skip (one weapon, one armour, one bauble, rarities from the run's late column moved up one rarity). **Owner, 2026-11-16: the item it replaces goes to the Burrow**, or to the Burrow's **hold** if that Burrow slot is full (section 7b), so the reward can always be taken. 0 yellow stars (helpers already give some).

### 2.10 What waits for Milestone 8

Butterfly, Centipede, Gust, Web snare. They need new rules: hits that only count from the air, a body made of segments, wind on a resting ball, and ground that changes and stays.

---

## 3. The arena

**Default (question 5):** one hand-built arena for every bug, a course file `src/content/courses/arena-bug.json` in the normal course format. The seed only changes the boss and its attacks, not the ground. More arenas (and generated ones) can be added later as more files in the "arena layout set".

Sketch, about 15 × 15 tiles, seen from above (north at the top):

```
      . . r r r r r r r r r . .
      . r . . . . . . . . . r .
      r . . P . . . . . P . . r       r  guard rail along the edge
      r . . . / / / / / . . . r       /  gentle slope up to the rim
      r . . / . . o . . / . . r       o  rock (cover)
      r . . / . . . . . / . . r       B  the boss (centre)
      r . . / o . B . o / . . r       P  summon pad (four)
      r . . / . . . . . / . . r       s  sand patch
      r . . / . . o . . / . . r       S  ball start (south)
      r . . . / / / / / . . . r
      r . . P . s . . s . P . r
      . r . . . . S . . . . r .
      . . r r r r r r r r r . .
```

- The centre is a flat floor around the boss (the grasshopper leaps anywhere on the floor and rim). A ring of gentle slope (one step) rises to a flat outer rim, so the ball tends to roll back towards the middle.
- **Guard rails** around the whole edge: the arena is hard to fall out of, but not impossible (a lofted shot can clear a rail).
- **Four rocks** around the boss as cover and bank shots.
- **Four summon pads** on the outer rim, one per corner (a flat marked tile, sprite `summon-pad`; it is ground, not an obstacle).
- **Two sand patches** near the start, so a careless shot dies in the sand.
- The ball starts in the south. No water, no spikes, no clouds in this first arena.

**Checked by a test, not the generator.** The arena is not generated, so the validator does not run on it (CLAUDE.md rule 6 covers generated courses). Instead a test checks the file loads, the boss spot and four pads are there, and the start is outside every first-turn mark; and the combination test (section 2.8) plays every boss in it.

---

## 4. Blue stars

### 4.1 Sources (owner, 2026-11-15: beating a course, beating a boss, an extra-rare chance in crates or under cracked ground)

| Source | Amount | Notes |
|---|---|---|
| Finishing a course | **50% chance of 1** | Rolled from the course seed; shown on the "course complete" screen |
| Finishing a hard course | **2** | Always |
| Beating a boss | **5** (+2 for rainbow) | Section 2.9 |
| Early boss bonus | +1 per countdown step left | DESIGN.md open question 2, default (already counted in Milestone 6) |
| Crate | **2% chance** × drop luck | Drops a blue star pickup |
| Secured crate | **5% chance** × drop luck | |
| Cracked tile (broken by Anchor) | **8% chance** × drop luck | |

A rough count: a run that dies before the boss earns about 1 to 4; a run that beats the first boss earns about 9 to 12.

### 4.2 The pickup

- New pickup **Blue star** (`blue-star`, sprite `star-blue`). Collected with **star reach**, like a yellow star. It does not count towards the quota.
- It lands a short way from the crate, like the other drops.

### 4.3 The wallet

**Owner, 2026-11-16: blue stars are stashed in the Burrow.** This replaces "kept the moment they are earned" (FEATURES.md F7).

- Blue stars earned during a run are **carried**. Carried blue stars are at risk: they are lost if the run ends by death or by leaving the game away from a town.
- **Visiting the Burrow stashes every carried blue star** in the **stash**, automatically. The stash is safe forever (saved, section 7).
- The hub spends from the stash. Blue stars are spent only on the hub (FEATURES.md section 11).
- **Owner, 2026-11-16: defeating a boss stashes every carried blue star automatically**, including the boss's own reward. This happens after each boss, in every region.
- Yellow stars are never stashed: they are only carried, and are lost for good when the run ends.
- The HUD, map and town show both: "Blue: 3 carried, 21 stashed".
- Worth knowing: there are no towns in rows 1 and 2, so a run that dies before its first town keeps no blue stars (owner confirmed, question 16).

---

## 5. The hub and permanent upgrades

### 5.0 The start menu (owner, 2026-11-16, question 9)

The real game opens on **a proper start menu**, not a test course. In this milestone it is a plain placeholder version; the finished title screen, settings, tutorial and controls help come in Milestone 9.

- The game's name (none chosen yet, DESIGN.md open question 9, so a placeholder "Untitled golf roguelike" in plain text, never the repository name).
- **Continue run** (only when a run is saved at a town), **New run** (asks to confirm if a saved run would be abandoned), **Upgrades** (the hub), and the save notice if the save had to be reset.
- Up/Down and Enter, or the mouse.
- Testing: keys 1 to 6 still jump to the test courses from the start menu and the course screen; `?course=`, `?run=` and `?boss=` addresses still skip the menu.

### 5.1 The hub screen

A simple screen in the game's placeholder pixel style, shown **between runs** and reached from the start menu (section 5.0):

- The blue star wallet.
- The **levelled list** (section 5.2): each upgrade with its name, a row of pips for its levels, what the next level gives, and its cost. Greyed out when you cannot afford it or it is at the top level.
- The **starting ability** unlock (section 5.3).
- A **Start run** button, and **Continue run** when a run is saved at a town (section 7.2).
- The last run's result in one line (for example "Reached region 1, row 9. Earned 3 blue stars").

Keys: Up/Down to move, Enter to buy or press, Left/Right to pick the starting ability, Esc back to the hub list. Mouse clicks also work.

Buying is final in this milestone: no refunds. (A "reset permanent progress" button is a testing aid only, section 8.)

### 5.2 The levelled list (FEATURES.md section 10)

Every level is one modifier from the source "permanent", lasting forever, through the modifier system (CLAUDE.md rule 4).

| Upgrade | Levels | Per level | Stat | Cost of each level (blue stars) | Total |
|---|---|---|---|---|---|
| Vitality | 5 | +1 max health | `maxHealth` add 1 | 2, 4, 6, 9, 12 | 33 |
| Stamina | 5 | +1 max shots | `maxShots` add 1 | 2, 4, 6, 9, 12 | 33 |
| Head Start | 3 | +10 starting yellow stars | `startingStars` add 10 (a new stat, base 0) | 2, 4, 6 | 12 |
| Haggler | 3 | −10% shop prices | `shopPrices` add −0.1 | 3, 6, 9 | 18 |
| Fortune | 3 | +10% drop luck | `dropLuck` add 0.1 | 2, 4, 6 | 12 |

Fully levelled: 108 blue stars, plus 8 for the ability unlock. About ten good runs.

**New stat:** `startingStars` (Starting yellow stars, base 0, whole number, 0 to 99). The run starts with this many yellow stars in the wallet.

Permanent upgrades are applied when a run starts (and to the bot, which already plays with the player's stats).

### 5.3 Starting ability unlock

| Field | Value |
|---|---|
| Cost | **8 blue stars**, once |
| Effect | Each run starts holding a chosen ability. |
| Choice | **Owner, 2026-11-16: any of the built abilities**, all available as soon as it is unlocked: Anchor, Burner, Hop, Tornado (question 7), and new ones as they are added. Picked on the hub with Left/Right; it can be changed before every run, for free. "None" is also a choice |
| Rules | It is an ordinary held ability: replaced by the next one you pick up, and lost by falling off the edge |

### 5.4 Death flow (DESIGN.md section 10)

When the run ends (health at 0, no naps left, or the game was left away from a town; owner, 2026-11-16):

| Lost | Kept |
|---|---|
| Yellow stars, ability, gear worn, run upgrades, map position, the saved run, **carried blue stars** | **Stashed blue stars**, permanent upgrades, the starting ability unlock, the Burrow and its hold |

Then the **run summary** (as now, plus blue stars stashed and lost this run), then the **hub**.

A won run (both bosses beaten, section 6) goes the same way, with a "Run complete" summary.

---

## 6. Region two

| Rule | Value |
|---|---|
| When | After the boss's reward screen |
| Map | A new map from the run seed (fork `region2`), same shape and rules as region one |
| Countdown | Back to 7; countdown raises reset (3 more allowed) |
| Budget | **Starts at 18**, +2 per counted node, cap 30 (owner cap, 2026-11-15). Hard courses ×1.5 as before, still capped at 30 |
| Carried over | Everything in the run: health (just fully healed), yellow stars, ability, gear, run upgrades |
| Rarity odds | Region two uses the "late" column from its first node |
| Its boss | **A new generated boss with a different bug** (owner: no repeat bug in a run), **stronger:** health ×1.5 (rounded down), up to 5 helpers alive. Reward as in section 2.9 but 8 blue stars (+2 rainbow) |
| After it | The run is **complete**: "Run complete" summary, then the hub. Region three, other bosses, new biomes and the theme switch come in Milestone 8 |
| Biome and look | Same as region one for now (new biomes and the day/night theme switch are Milestone 8) |

The region-two numbers (health ×1.5, helper cap 5, blue stars 8) are one "region" entry in `src/content/bosses.ts`, so region three later is data too.

---

## 7. Saving

### 7.1 One save, with a version

Everything lives under one browser storage key, `dreamcoursedream.save`:

```
{
  version: 1,
  blueStars,                 // the wallet
  permanent: { vitality: 2, stamina: 1, ... },   // levels bought
  unlocks: { startingAbility: true },
  startingAbility: "hop" | null,
  burrow: { weapon, armour, bauble },
  lastRun: { result, region, row, blueEarned },  // the one line on the hub
  run: null | { ...saved run, see 7.2 }
}
```

- The tuning panel's numbers keep their own separate key, as now.
- **Moving the old Burrow:** the Milestone 6 Burrow key is read once, copied into the new save, and removed. Nothing stored there is lost.
- **Safe fallback:** if the save cannot be read (bad text, unknown version, wrong shapes), the game does **not** crash. It copies the unreadable text to `dreamcoursedream.save.broken` (so it can be looked at or rescued), starts a fresh save, and shows a short notice on the hub: "Your save could not be read and was reset. A copy was kept." Each field is checked on load; an unknown upgrade id or gear id is dropped, a level above the maximum is lowered to the maximum.
- **Later versions:** a newer game reading an older save runs an upgrade step for each version in turn. A save from a newer game than the one running is treated as unreadable (fallback above); the `.broken` copy keeps it safe.
- Saved whenever something kept changes: blue stars earned, an upgrade bought, the Burrow changed, entering a town, a run ending.

### 7.2 The town is the save point (owner, 2026-11-15)

- **Entering a town saves the run**: the run seed, the region, the path taken, countdown and raises, health, wallet, ability, gear, run upgrades (and their price counts), totals, and the town's shop as it stands (offers, what is sold, reroll price), so coming back does not give a free reroll. The map is rebuilt from the seed.
- **Coming back:** the hub shows **Continue run**; it puts you back in that town, exactly as saved.
- **Leaving the town clears the run save** (pressing Continue on the signpost). **Owner, 2026-11-16 (question 3):** if you close the game anywhere other than a town, the run and everything in it is lost: yellow stars, gear worn, ability, run upgrades and carried blue stars. Only saving and leaving from a town keeps them. Permanent upgrades, the stash and the Burrow are never affected. The hub says "Your run ended when you left the game away from a town". This stops "close the page and retry the course".
- **Death or a completed run** clears the run save.
- Starting a new run while a run is saved asks to confirm: "Abandon your saved run?"

---

## 7b. The Burrow: selling, the hold and the blue star stash (owner, 2026-11-16)

- **At most one worn and one housed item per category**, as before.
- **Selling:** in the Burrow you can sell the housed item for **25% of its price, rounded down**, in yellow stars. **(proposal)** The price used is the rarity price before discounts (Haggler does not lower it):

  | Rarity | Common | Uncommon | Rare | Double rare | Special rare | Legendary |
  |---|---|---|---|---|---|---|
  | Price | 10 | 15 | 25 | 35 | 50 | 70 |
  | Sells for | 2 | 3 | 6 | 8 | 12 | 17 |

- **The hold:** an item sent to the Burrow while its slot there is already full waits in the **hold** (today only a boss reward does this). The **next time you enter the Burrow**, a sorting screen opens first: for each category with an item in the hold, you choose which item to wear, which to house, and sell the rest. You cannot leave the screen until every category is down to one worn and one housed.
- **Owner, 2026-11-16:** items in the hold are safe from death and wait until the next Burrow visit, even in a later run.
- **Blue stars:** entering the Burrow stashes all carried blue stars (section 4.3).
- Burrow keys as in Milestone 6, plus **X** to sell the housed item (asks to confirm, showing the yellow stars it gives). As built: X, not S, because S already moves down the list.

---

## 8. Testing aids (U panel, debug only)

- **+10 blue stars.**
- **Reset permanent progress** (wallet, levels, unlocks; asks to confirm; leaves the Burrow alone).
- **Fight the boss now** (from the map), and the address `?boss=<seed>` to start straight at a boss with base stats. `&bug=mantis&colour=green&skill=pods` picks the parts, `&region=2` the stronger version.
- **Set the boss's health** (to jump to a phase).
- **Break the save** (writes nonsense into the save key) to try the fallback.
- The existing aids stay (yellow stars, gear, upgrades, countdown, win this course).

---

## 9. Questions for the owner

| # | Question | Default | Answer |
|---|---|---|---|
| 1 | Blue star amounts (section 4.1): 50% chance of 1 per course, 2 per hard course, 5 per boss, small chances in crates and cracked tiles. Rare enough? | As in section 4.1 | **Owner, 2026-11-16: keep.** |
| 2 | Permanent upgrade costs (section 5.2): first levels cost 2, about ten good runs to buy everything. Too slow or too fast? | As in section 5.2 | **Owner, 2026-11-16: keep.** |
| 3 | Closing the game outside a town: lose the run (blue stars kept), or carry on from the last town you visited? The second is friendlier but lets you close the page to retry a course that went badly | Lose the run | **Owner, 2026-11-16: lose the run and everything in it.** Only saving and leaving from a town keeps yellow stars and gear worn. Permanent upgrades unaffected. Blue stars are stashed in the Burrow (section 4.3) |
| 4 | ~~The Warden's numbers~~ | | **Owner, 2026-11-16: replaced by generated bug bosses (section 2).** |
| 5 | Arena: one hand-built arena now (section 3), or generate it from the seed? | One hand-built arena; more can be added as files | **Owner, 2026-11-16: one for now.** More arenas to cycle through before the game is complete (PLAN.md Milestone 8) |
| 6 | ~~Region two's boss~~ | | **Owner, 2026-11-16: a generated boss with a different bug** (section 6). |
| 7 | Starting ability: any of the four built abilities, or only abilities you have picked up in an earlier run? | Any of the four | **Owner, 2026-11-16: all of them.** |
| 8 | Should summoned enemies leave flag poles and give yellow stars like normal enemies (more clutter in the arena, but more stars)? | Yes, normal enemies | **Owner, 2026-11-16: 50% chance** of a star and a flag pole when one dies; otherwise it just dies |
| 9 | Should the game now open on the hub? (Keys 1 to 6 would still go to the test courses; key 7 would open the hub instead of starting a run straight away.) | Yes, open on the hub | **Owner, 2026-11-16: the real game opens on a proper start menu** (section 5.0) |
| 10 | Gear reward after a boss (section 2.9): choose one of three or skip; the replaced item is lost. Or should the replaced item go to the Burrow if its slot is empty? | Lost | **Owner, 2026-11-16: it goes to the Burrow**, or the hold if full. Burrow items can be sold for 25% (section 7b) |
| 11 | Poison and the damage floor (section 2.3): with a floor of 1, poison's −1 hit damage does nothing to a fresh character. Add −20% shot power to Poisoned so it always matters? | Yes, add −20% shot power | **Owner, 2026-11-16: yes.** |
| 12 | The colour attacks (section 2.3): Fireball, Frost breath, Bolts, Spore burst. Keep, change or replace? | As in section 2.3 | **Owner, 2026-11-16: yes.** |
| 13 | Bug numbers and rules marked (proposal) in section 2.2 (mantis 10 health, grasshopper 11, and so on). | As in section 2.2 | **Owner, 2026-11-16: yes.** |
| 14 | Skill numbers and the pod-hatching idea (section 2.4). | As in section 2.4 | **Owner, 2026-11-16: yes.** |
| 15 | Should the map show the boss's name and part icons ahead of time, so you can prepare (section 2.6)? | Yes | **Owner, 2026-11-16: no name.** An icon of the boss's bug in its colour; the name shows when the battle starts |
| 16 | Blue stars (section 4.3): carried blue stars are lost on death or leaving away from a town, and only become safe when you visit a Burrow. Is that the meaning? | Yes, as written in section 4.3 | **Owner, 2026-11-16: correct**, for blue stars only; yellow stars are only ever carried. Defeating a boss also stashes them |
| 17 | Items in the hold: safe from death and kept for the next run, or lost on death? | Safe, kept | **Owner, 2026-11-16: safe until the next Burrow visit.** |

---

## 10. Done when (from PLAN.md)

The owner can die, buy a permanent upgrade, start again, and see the upgrade applied; and can beat the boss.

Things to check on purpose while playtesting (after the build):

- Die early on purpose, see the blue stars on the summary, buy Vitality on the hub, start again and see 6 health.
- Buy Head Start and see the wallet start at 10.
- Unlock the starting ability, pick Hop, and start a run holding it.
- Start several bosses with `?boss=` and the part picks: check each bug, colour attack and skill does what section 2 says.
- Stay inside a mark and get hit (and get the colour's status); leave it and see the attack miss.
- Push a boss into phase 2 and see the summons appear on the pads; defeat a carrier and get its ability.
- Hit a blue boss with Burner and see double damage; hit a red boss with Burner and see at least 1 damage.
- Read `docs/reports/boss-combinations.md` and decide on any combinations listed for review.
- Phase 3: a slam every turn and a bigger ring.
- Beat a boss: full heal, blue stars, pick a gear item, land on region two's map with a higher budget.
- Stop in a town, close the page, open it again, press Continue run, and find the same shop offers.
- Close the page during a course and see the run ended (blue stars kept).
- Use "Break the save" and check the game recovers with the notice.
- The Burrow item stored in Milestone 6 is still there after the save change.

---

## 11. As built (2026-11-16)

Where things live: boss parts and numbers in `src/content/bosses.ts`; the boss's turn in `src/sim/boss.ts` (it acts on the course only through a small "host" that `src/sim/play.ts` provides); the boss picker and arena loader in `src/gen/boss.ts`; the arena in `src/content/courses/arena-bug.json`; permanent upgrades in `src/content/permanent.ts`; the profile (stash, levels, Burrow, hold) in `src/sim/profile.ts`; the save format in `src/save/saveData.ts` and browser storage in `src/save/save.ts`; new screens `MenuScene`, `HubScene`, `RewardScene`.

Differences from the sheet, and choices it left open:

- **Sizes "across" are radii.** The slam ring is 1.75 tiles from its centre (2.25 in phase 3), the fireball 1, pods 0.6, the spore ring 3 tiles from the boss. A ring 1.75 tiles across would be too small to matter.
- **Colour attacks always do 1 damage; skills do the bug's damage** (Goliath 2). Every hit also gives the colour's status. Only the colour attack leaves ground.
- **The grasshopper's leap** comes on top of the phase pattern: it marks a landing spot every second boss turn and leaps there on the next. Landing near the ball does 1 damage within 1 tile of its body and knocks the ball away. In a Charge, a boss that can move (the grasshopper) rushes down the lane; the others send a shockwave.
- **The mantis** turns to face the ball each boss turn (so "behind" moves) and, on every third boss turn on which it marks, makes the other attack's mark too (in phase 2, a second colour mark).
- **Helpers** take the boss's colour (their element and the status their hits give). A carrier always gives its ability, even when it gives no star (the sheet's proposal). Helpers that attack (Spitter, Lunger) start awake.
- **Burning on the ball** hurts at the start of the shot; like any damage, it does nothing during the 0.5 s immunity after other damage.
- **Rarity in region two** uses the Milestone 6 "Region 2" column from its first node (there already was one), not region one's late column. The boss prize uses the column above the region's (region one: Region 2's odds).
- **The exit on a boss course** is the arena's centre tile, where the boss stands at the start (the grasshopper may be elsewhere when it falls).
- **Saving:** `runActive` in the save marks a run under way. If the game opens with a run active and none saved at a town, the run is treated as ended by leaving (the start menu says so). Starting a new run over a saved one asks first and counts the saved one as left.
- **Map icons** are 16-pixel versions of the boss sprites, tinted by the display; a rainbow boss flickers through the four colours.
- **Status icons** on the ball are drawn above the ball, not in the HUD.
- **Testing aids:** on the map, "+10 blue stars (carried)", "Fight the boss now", "Break the save"; on a boss course, "Boss health" (to jump to a phase); on the start menu and hub, "+10 blue stars (stashed)" and (hub) "Reset permanent progress". Address `?boss=<seed>&bug=&colour=&skill=&region=` fights a boss with base stats.
- **The start menu** shows a plain stand-in title, "Untitled golf roguelike", until a name is chosen.
- **The bot** counts damage to a boss as progress, like stars (so it can be used on boss fights).

### Owner change after the first build (2026-11-16): harder boss fights

The first bot report showed the fights were easy (a fresh character won 89%). The owner chose two of the planner's suggestions:

- **No shot back for hitting a boss** (helpers still give one). An exception to the shot-back rule; recorded in DESIGN.md section 6.
- **Rage timer:** after 15 boss turns the boss enrages: from then on it marks every turn (alternating skill and colour attack) and summons one helper every turn, as in phase 3, and every mark is 1.3 times bigger (Bolts strike one more tile). The HUD counts down "RAGE IN n" and then shows "RAGE!".

### Bot report

See `docs/reports/boss-combinations.md` (made by `npm run boss:report`). 45 combinations, 10 seeds each, three setups (897 s): overall win rate **base 89%, region-one loadout 100%, region-two boss 97%**. **No combination fell below 20%, so nothing is listed for the owner to review.** Hardest for a fresh character: red bosses (Burning stacks with the hits), Goliath red slam 50%, then Goliath red charge, Grasshopper red slam and Grasshopper green pods at 60%. Fights take 9 to 16 shots: every hit on the boss gives a shot back, so most fights end before phase 3 lasts long. The bosses may be on the easy side; tune after playing.

**After the owner's two changes (no shot back for boss hits, rage timer):** base **56%**, region-one loadout **95%**, region-two boss **91%** (963 s). Five combinations now fall below 20% with a fresh character and are listed for the owner: Goliath with slam in red, yellow, green and rainbow (0–10%), and Goliath red pods (10%). The Goliath's 2-damage slam is the main cause. With the region-one loadout most fights are won, because Studded Shell's +1 hit damage halves the hits needed.

