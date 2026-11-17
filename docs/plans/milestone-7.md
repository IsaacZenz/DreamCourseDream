# Milestone 7 design sheet — Boss and permanent progress

**Status: waiting for the owner's sign-off.** Nothing on this sheet is built yet.

How to review: read each section, change any number or rule you want, and answer the numbered questions in [section 10](#10-questions-for-the-owner). Each question has a default, so "use the defaults" is a valid answer. Every number here is a starting value and goes into `src/content/` so it can be tuned later.

Where this sheet uses a default from an open question in DESIGN.md or FEATURES.md, it says so.

---

## 1. What this milestone adds, in one paragraph

The stand-in boss is replaced by **The Warden**, a real boss with a big health bar and three phases, fought in its own **arena**. **Blue stars** get a wallet that lasts between runs: you earn them from courses, the boss and rare finds, and you keep them when you die. Between runs there is a **hub screen** (the Den) where you spend blue stars on **permanent upgrades** that apply to every later run, and unlock a **starting ability**. The game is **saved**: the Den, your blue stars and the Burrow always, and a run in progress whenever you are in a town. Beating The Warden heals you, gives you a gear pick, and starts **region two**: a new map with a harder budget and better gear odds, ending in a stronger Warden.

---

## 2. The Warden (FEATURES.md section 5)

### 2.1 Template

| Field | Value |
|---|---|
| id | `warden` |
| name | The Warden (working name) |
| sprite id | `warden` (placeholder: a big armoured stone shape, about two tiles wide; one frame per phase so you can see it crack) |
| health | **12** in region 1, **18** in region 2 |
| element | none; not weak or resistant to anything |
| gimmick | none (FEATURES.md: the first boss has no gimmick) |
| size | round, radius 0.9 tiles, height 1.6 tiles (too tall to loft over with a normal shot) |
| movement | none; stands in the middle of its arena |
| contact | touching it never hurts the ball; the ball bounces off it (bounce 0.6) |
| arena layout set | `warden-arenas` (section 3) |
| rewards | section 2.5 |

### 2.2 Phases

The phase is set by how much health is left. Thresholds are fractions of full health, so they work for both regions.

| Phase | Health left | What it does on each enemy turn |
|---|---|---|
| 1 — Slow slams | above 2/3 (12 to 9) | **Slam** (2.3). No summons |
| 2 — Summons | 2/3 to 1/3 (8 to 5) | No slams. **Summons** one minion (2.4) if fewer than 3 of its minions are alive |
| 3 — Both, faster | below 1/3 (4 to 1) | **Bigger slam** (radius 2.25 instead of 1.5), and a summon every enemy turn while fewer than 2 minions are alive |

It acts on **every** enemy turn, including the extra turn during a nap. It is active from the start of the fight; it does not wait for a trigger.

**Changing phase:** when a hit takes the Warden into the next phase, it **sheds a plate**: a heart and a shot orb drop near it (the usual drop ring, 1.1 to 1.9 tiles away), any slam mark on the ground is cleared, and the sprite changes. This is a small reward for pushing it over and gives you a beat to reposition.

### 2.3 The slam

Works like the Spitter: a warning first, the attack a turn later, so you always get one shot to get out of the way.

- **Mark:** on its enemy turn, the Warden marks a circle on the ground around where the ball is resting (radius 1.5 tiles; 2.25 in phase 3). The circle is drawn as a red ring.
- **Land:** on its next enemy turn, the slam lands on the marked circle first, then it marks a new one.
- A ball **on the ground** inside the circle when it lands takes **1 damage** and is knocked out of the circle (6 tiles per second away from the centre, with a small hop). The 0.5 s damage immunity applies as usual.
- A slam does not hurt minions and does not touch flag poles, stars or pickups.
- The aim guide does not show the ring; the ring is drawn on the ground, so you can aim out of it.

### 2.4 Summons

- A summoned minion appears at one of the arena's **spawn spots** (section 3), chosen at random from the run seed, never one that has the ball or another thing on it within 1 tile.
- It appears with a short puff and cannot act on the turn it appears.
- Pool (chance per summon):

| Minion | Phase 2 | Phase 3 | Why |
|---|---|---|---|
| Mossback | 40% | – | An easy hit: a shot back |
| An ability carrier (Anchorback, Emberback, Hopback, Whirlback, equal chance) | 40% | 50% | FEATURES.md section 5: summons keep your tools flowing |
| Spitter | 20% | 25% | Pressure |
| Lunger | – | 25% | Pressure |

- Minions are normal enemies: a hit gives a shot back, a defeat gives 1 yellow star (into the wallet, since the arena has no quota) and a carrier gives its ability.
- **Minions leave no flag pole** (question 7): they vanish in a puff, so the arena does not fill up with poles over a long fight.
- When the Warden is defeated, all its minions vanish too.

### 2.5 Statuses, gear and the Warden

- **Burning** works on it (1 damage at the start of each enemy turn).
- **Stunned:** bosses **cannot be stunned** (question 8). Without this, a Clang Knob (50% stun) would stop most of the fight.
- **Giant's Knuckle** does not push it (it never moves), but the extra damage counts.
- **Echo Shell, Thunder Knuckle, Wrecking Shell, the Guard family** and the rest work as on any enemy.

### 2.6 Winning and losing in the arena

- **No star quota.** The exit is shown closed from the start and **opens when the Warden is defeated** (FEATURES.md section 5).
- You still have to roll into the exit to finish.
- Shots, naps and health work as on any course. Running out of naps or health in the arena ends the run.

### 2.7 Rewards for beating the Warden

| Reward | Region 1 | Region 2 |
|---|---|---|
| Blue stars | 5 | 8 |
| Early boss bonus (DESIGN.md open question 2, default) | +1 per countdown step left | same |
| Heal | to full (DESIGN.md open question 7) | same |
| Gear | a pick of 1 from 3 items, on the "better" rarity column (like a hard course) | same |
| Yellow stars | none beyond what the minions gave | same |

Then region two starts (section 7). Beating the region-two Warden ends the run with a win in this milestone; region three and the final boss are Milestone 8.

---

## 3. The arena

Default (question 6): **a small set of hand-built arena layouts**, stored as course files under `src/content/arenas/`, not generated. A boss fight is about the boss, and a hand-built layout guarantees room to dodge. The run seed picks one.

| Arena | Shape (each about 13 × 13 tiles) |
|---|---|
| The Ring | A flat round floor with a rail around the edge; four low walls to hide behind |
| The Bowl | The floor slopes gently down towards the Warden in the middle, so slow balls roll back in towards it |
| The Steps | Three wide terraces climbing to the Warden's platform; the exit is behind it at the top |

Each arena file has the usual tiles, start, exit and rails, plus two new fields:

- `"boss": { "id": "warden", "at": [x, y] }` — where the boss stands.
- `"spawns": [[x, y], ...]` — 6 to 8 spawn spots for summons, spread round the arena.

The start is in front of the Warden, the exit behind it. The course file check (`parseCourse`) learns the two new fields and checks that the boss, the start, the exit and every spawn spot are on ground that can hold the ball and can be reached.

**Beatable check (CLAUDE.md rule 6):** the arenas are hand-built, so the check runs in the tests, not at load time: the headless bot plays every arena with a fresh ball (5 health, 4 shots, no gear) on 20 seeds each and must win at least half of them. If an arena fails, it is changed before it ships.

---

## 4. Blue stars

### 4.1 Sources (owner, 2026-11-15: beating a course, beating a boss, an extra-rare chance in crates or under cracked ground)

| Source | Amount or chance (question 1) |
|---|---|
| Finishing a course | 1 |
| Finishing a hard course | 2 |
| Beating the Warden | 5 (region 1), 8 (region 2) |
| Fighting the Warden early | +1 per countdown step left (already counted in Milestone 6) |
| Breaking a crate | 2% chance of a blue star, times drop luck |
| Breaking a secured crate | 5% chance, times drop luck |
| Breaking a cracked tile (Anchor) | 5% chance, times drop luck |

- A blue star from a crate or cracked tile is a **pickup** lying on the ground, like a yellow star (new object `blue-star`, new placeholder sprite). It uses star reach.
- Course and boss blue stars are given on the "course complete" screen.
- A run of region one that reaches the boss earns roughly 6–8 blue stars on the way plus 5 for the boss. A run that dies halfway earns about 3.

### 4.2 The wallet

- One blue star wallet, kept between runs and saved (section 6).
- **Blue stars are kept the moment you get them.** Death does not take them (FEATURES.md open question F7, default yes), even a blue star picked up on the course you die on.
- Shown on the HUD during a run (earned this run), on the map, the run summary and the Den.
- Blue stars are only spent in the Den (FEATURES.md section 11).

---

## 5. The Den (hub screen) and permanent upgrades

### 5.1 The Den

The hub screen between runs (working name: **the Den**, the armadillo's home; rename it if you like). Drawn in the same placeholder pixel style as the town.

- **The game now opens on the Den** (question 9). Keys 1 to 6 still open the test courses; key 7 now goes to the Den.
- On screen: your blue stars, the five levelled upgrades, the starting-ability unlock, and a few totals (runs played, bosses beaten, best region reached).
- **Start a new run** (a new seed), or **Continue run** if a run is saved at a town (section 6.2).
- `?run=<seed>` in the address still starts a run on that seed at once, for testing.
- Keyboard: up/down to choose, Enter to buy or start, left/right to choose the starting ability. The mouse also works.

### 5.2 Levelled upgrades (FEATURES.md section 10)

Each is a **modifier** (FEATURES.md section 1) with source "permanent" and duration "forever", applied to the ball at the start of every run. Costs rise with each level (question 2).

| Upgrade | Levels | Per level | Cost of levels 1, 2, 3, 4, 5 | Total |
|---|---|---|---|---|
| Vitality | 5 | max health +1 | 5, 8, 12, 16, 20 | 61 |
| Stamina | 5 | max shots +1 | 5, 8, 12, 16, 20 | 61 |
| Head Start | 3 | +10 starting yellow stars | 3, 6, 10 | 19 |
| Haggler | 3 | shop prices −10% (added, so three give 70%, not 73%) | 4, 8, 12 | 24 |
| Fortune | 3 | drop luck +10% | 3, 6, 10 | 19 |

- **Head Start needs a new stat**, `startingStars` (base 0), so it goes through the modifier system like everything else (CLAUDE.md rule 4). The run starts with that many yellow stars in the wallet.
- Upgrades cannot be sold back (question 10). A "reset the Den" button exists only in the testing panel.

### 5.3 Unlock: start each run with a chosen ability

- **Cost: 10 blue stars, bought once** (question 11).
- After that, the Den shows a choice of **none, Anchor, Burner, Hop or Tornado** (the four built abilities). The run starts with the one you picked. It works like any held ability: falling off the edge loses it, a carrier replaces it.
- Abilities added in Milestone 8 join the choice when they exist.

---

## 6. Saving

### 6.1 One save, with a version number

Everything is kept in the browser in **one save** under one key, with a version number:

| Part | What it holds | Saved when |
|---|---|---|
| Profile | blue stars, upgrade levels, unlocks, chosen starting ability, totals | every time it changes |
| Burrow | the three stored gear items (moved here from its own save; the old one is read once and moved over) | every time it changes |
| Run in progress | the whole run state, only while you are in a town (6.2) | entering a town and after each thing you do in it |

**Safe fallback:** if the save cannot be read (damaged, from a newer version, or storage blocked), the game does not crash. It keeps a copy of the unreadable text under a backup key, starts with an empty profile, and shows a short message in the Den: "Your save could not be read. A copy has been kept." Each part is checked on its own, so a damaged run save does not wipe your blue stars. A save from an **older** version is upgraded step by step.

### 6.2 The town is the save point (owner, 2026-11-15)

- **Entering a town saves the run**, and so does every purchase, reroll and Burrow swap there. Closing the page in a town and coming back later puts you in that same town, with the same shop stock and everything you had.
- The map is not stored; it is made again from the run seed (same seed, same map).
- **Leaving the town deletes the run save** (question 3, default). So closing the game anywhere else (on the map, during a course) **loses the run**, like dying: blue stars you earned are kept, everything else is gone. This stops the trick of closing the page to dodge a bad course. The Den warns you once: "Your run is saved only in towns."
- **Death** deletes the run save and goes to the run summary, then the Den.

---

## 7. Death, winning and region two

### 7.1 Death

1. The course ends (health or naps ran out).
2. **Run summary**, as now, plus: blue stars earned this run, and the blue star total.
3. **Lost:** yellow stars, ability, gear (except the Burrow), run upgrades, map position, the run save.
4. **Kept:** blue stars, permanent upgrades, unlocks, the Burrow.
5. Enter goes to the **Den**.

### 7.2 Beating the region-one Warden

1. Course complete screen: "THE WARDEN IS BEATEN", the blue stars, the full heal.
2. **Pick 1 of 3 gear items** (same screen and keys as the cache).
3. **Region two** starts on a new map.

### 7.3 Region two

| Rule | Value |
|---|---|
| Map | A new map from the run seed (fork `map:2`), same shape and node odds as region one |
| Countdown | Back to 7. Raises bought are back to 0 (at most 3 per region) |
| Budget | 18 + 2 per counted node in the region, hard courses ×1.5, **capped at 30** (question 4) |
| Gear odds | the "Region 2" rarity column (already written in Milestone 6) |
| Carries over | health (full after the heal), yellow stars, ability, gear, run upgrades |
| Biome and theme | the same as region one for now; new biomes and the theme switch after each boss are Milestone 8 |
| Enemy mix | the same enemies as region one; tier 3 enemies join in region two in Milestone 8 (FEATURES.md section 14) |
| Boss | The Warden again, with 18 health and the region-two rewards (question 5) |
| After the region-two Warden | the run ends with a win: run summary, then the Den |

The map, the HUD and the town show "REGION 2".

---

## 8. Screens and testing aids

### 8.1 New and changed screens

- **The Den** (section 5).
- **Arena HUD:** the Warden's health bar across the top with its name and phase marks at 2/3 and 1/3; the slam ring on the ground; no star meter.
- **Boss reward screen:** gear pick of 1 from 3.
- **Map:** the boss marker says "THE WARDEN"; the node panel shows its health and rewards; "REGION 2" when there.
- **Run summary:** blue stars this run and in total; "Enter: to the Den".

### 8.2 Testing aids (U panel, debug only)

- +10 blue stars.
- Reset the Den (profile and upgrades; the Burrow stays).
- Go straight to the Warden (any region).
- Set the Warden's health (to jump to a phase).
- Start region two now.
- Show the save as text, and damage it on purpose (to test the fallback).

---

## 9. What this needs in the code (for reference)

- **A boss behaviour** in the enemy template (new code once, then data): phases with health thresholds, slam, summon pool, spawn spots, "cannot be stunned", "minions leave no flag".
- **Enemies that appear mid-course** (summons): the list of enemies on a course can grow during play; every random choice comes from the course's seeded generator.
- **Course format 4:** optional `boss` and `spawns` fields; quota 0 with the exit tied to the boss.
- **The profile and save** in `src/save/`, with the part that checks and upgrades the save written as plain TypeScript so it can be tested in Node.
- **Permanent modifiers** passed into `createRun` alongside the Burrow, and a `startingStars` stat.
- **Regions** in `src/sim/run.ts`: region number, a new map per region, the budget start per region.
- New placeholder sprites: the Warden (three phases), the slam ring, the blue star, the puff, the Den.

---

## 10. Questions for the owner

| # | Question | Default | Answer |
|---|---|---|---|
| 1 | Blue star amounts: course 1, hard course 2, Warden 5 (region 1) and 8 (region 2); crates 2%, secured crates and cracked tiles 5%, times drop luck. Right amounts? | As listed | |
| 2 | Permanent upgrade prices (section 5.2: Vitality and Stamina 5, 8, 12, 16, 20; Head Start and Fortune 3, 6, 10; Haggler 4, 8, 12). A good region-one run earns about 11–13 blue stars, a run that dies early about 3. Right pace? | As listed; tune after playing | |
| 3 | If you close the game anywhere other than a town (on the map or during a course), what happens? | **The run is lost** (blue stars kept). The other choice: you go back to the last town you visited with what you had there, which is kinder but lets you retry a course by closing the page | |
| 4 | Region two's budget starts at 18 and climbs past 30 quickly, but you capped run courses at 30 because big courses are slow to make. Keep the cap at 30 in region two? | Yes, keep 30 for now. Region two is then harder through the Warden, gear odds and a bigger start, not bigger courses | |
| 5 | The second boss is Milestone 8. What ends region two in this milestone? | The Warden again, with 18 health and bigger rewards. Beating it wins the run | |
| 6 | Arenas: a few hand-built layouts (picked by seed), or generated like courses? | Three hand-built arenas (section 3) | |
| 7 | Should summoned minions leave flag poles like other enemies? | No, they vanish in a puff, so the arena stays clear | |
| 8 | Can the Warden be stunned? | No, bosses cannot be stunned. Burning works | |
| 9 | What should the game open on? | The Den. The test courses stay on keys 1–6 | |
| 10 | Can permanent upgrades be refunded? | No. Only the testing panel can reset the Den | |
| 11 | Starting ability: one unlock that lets you pick any ability each run, or buy each ability separately? | One unlock, 10 blue stars, then choose any of the four each run | |
| 12 | Names: "The Warden" and "the Den" are working names. Keep them? | Keep them for now | |

---

## 10b. Fit with the later milestones (checked 2026-11-17)

The remaining milestones (PLAN.md 8 and 9) and the reference files were checked against this sheet. Nothing in them conflicts with it. These points make sure Milestone 7 is built so the later work slots in without a rewrite:

| Later work | What Milestone 7 does now to leave room for it |
|---|---|
| Second and third bosses, one with a gimmick (M8; FEATURES.md section 5: the second boss's shield drops only after it attacks) | The boss is a data entry: phases, actions per phase, summon pools, arena set and rewards. The Warden is the first entry. A gimmick field exists (empty for the Warden) |
| More Den unlocks: second gear slot per category, new gear and abilities in the pool, new characters (M8; FEATURES.md sections 3 and 10) | Den upgrades and unlocks are a data list in `src/content/`, so M8 adds entries. The profile already stores a chosen character id (always Rollo for now) |
| Unlocks from beating a boss for the first time (FEATURES.md section 15) | The profile records which bosses have been beaten and the best region reached |
| Three regions, a final boss, then endless mode (DESIGN.md open question 8) | Regions are numbered; budget start, rarity column and boss are looked up per region in data. Region three is added as data in M8 |
| Theme switch after each boss (M8) | The region number is part of the run state the display reads, so a theme can be chosen from it later |
| Tier 3 and 4 enemies, and the elite blue star chance (M8) | Blue star sources are a data list; another source is one more entry |
| Balance pass with the bot, completion rate per region (M8) | The bot can already play an arena (section 3's test), so the batch tool can include boss fights |
| Title screen, settings, tutorial (M9) | The title screen will go in front of the Den; nothing in the Den depends on being the first screen |

One older default is replaced by this sheet: DESIGN.md section 10 gives a hard course "a blue star chance". Section 4.1 makes it a sure 2 blue stars instead. If you sign this off, DESIGN.md will be updated to match.

---

## 11. Done when (from PLAN.md)

The owner can die, buy a permanent upgrade, start again, and see the upgrade applied; and can beat the boss.

Things to check on purpose while playtesting (once built):

- Die on purpose early; see the blue stars kept on the summary and in the Den.
- Buy Vitality level 1; start a run and see 6 health.
- Buy the starting-ability unlock, pick Hop, and see it held at the first course.
- Get to a town, close the browser tab, open the game again, choose Continue run, and find yourself in that town with the same shop.
- Close the tab during a course instead; open the game and see that the run is gone but the blue stars are not.
- Damage the save from the testing panel and reload: the game should start, say the save could not be read, and keep the backup.
- Fight the Warden: see each phase change (plate drop, sprite change), dodge a slam by shooting out of the ring, take one on purpose, and check the summons.
- Beat the Warden; pick a gear item; see "REGION 2", a new map, and bigger budgets.
