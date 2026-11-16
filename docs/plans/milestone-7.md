# Milestone 7 design sheet — Boss and permanent progress

**Status: waiting for the owner's sign-off.** Nothing on this sheet is built yet.

How to review: read each section, change any number or rule you want, and answer the numbered questions in [section 9](#9-questions-for-the-owner). Each question has a default, so "use the defaults" is a valid answer. Every number here is a starting value and goes into `src/content/` so it can be tuned later.

Where this sheet uses a default from an open question in DESIGN.md or FEATURES.md, it says so.

---

## 1. What this milestone adds, in one paragraph

The stand-in boss becomes **The Warden**, a big enemy with a health bar and three phases, fought in its own **arena**. Beating it heals you, gives **blue stars** and a choice of gear, and starts **region two**: a new map with a higher budget and a second, tougher Warden at its end. **Blue stars** now have a wallet that is kept forever. Between runs you go to the **hub**, where you spend blue stars on **permanent upgrades** (more health, more shots, starting yellow stars, cheaper shops, better luck) and the **starting ability** unlock. **Everything is saved** in the browser with a version number. A **town is the save point**: leave the game in a town and the run carries on from there next time.

---

## 2. The Warden

### 2.1 Template (FEATURES.md section 5)

| Field | Value |
|---|---|
| id | `warden` |
| name | The Warden (working name) |
| sprite id | `warden` (placeholder: a large dark stone-grey round body with a single slit eye; two frames, idle and slamming) |
| health | **12** |
| size | Round, radius **0.9 tiles** (covers about 2×2 tiles), height **1.5 tiles**, so a lofted ball can only clear it at the top of a high arc |
| phases | 3, below (section 2.3) |
| gimmick | None |
| arena layout set | `arena-warden` (one hand-built arena, section 3; question 5) |
| element | None; not weak to or resistant against anything |
| contact | Touching it does **not** hurt the ball. The ball bounces off it (keeps 60% of its speed), like any enemy that survives a hit |
| moves | Never. It stands in the centre of the arena |
| rewards | Section 2.6 |
| family / tier | Boss / tier 5 |

It takes damage through the same damage steps as every enemy (hit damage after modifiers, then element, position, shield, then health). The same 0.5 s hit cooldown applies. **Each damaging hit gives back 1 shot**, as for every enemy (owner rule, 2026-11-15).

### 2.2 Its two actions

Both are new behaviour code written once; the numbers are data.

**Slam (telegraphed).** On an enemy turn the Warden **marks** a red ring on the ground, centred where the ball is resting. On a **later** enemy turn it **slams**: a shockwave hits everything inside the ring.

| Number | Value |
|---|---|
| Ring radius | 1.75 tiles (phase 1), 2.25 tiles (phase 3) |
| Damage to the ball inside the ring | 1 (the 0.5 s immunity still applies) |
| Knock | The ball is thrown away from the ring's centre at 6 tiles/s with a small hop (2 tiles/s up). If it is exactly on the centre, the direction comes from the seed |
| A ball in the air when it lands | Not hit (it can only happen while a knock is still moving the ball) |
| Summoned enemies in the ring | Not hurt; they are the Warden's friends |
| Raised flag poles in the ring | Knocked down, like an enemy passing over them: their star is lost until you touch the flag again |

The point: the mark gives you one shot to get out of the ring. Standing still in it costs health.

**Summon.** The Warden calls small enemies onto the **summon pads** in the arena (section 3). Each summon picks from a list with the seeded random generator.

| Number | Value |
|---|---|
| Summon list | One "attacker" from Mossback, Spitter, Lunger (equal odds) **plus** one ability carrier from Anchorback, Emberback, Hopback, Whirlback (equal odds) |
| Enemies per summon | 2 (one of each list) in phase 2, 1 (alternating attacker and carrier) in phase 3 |
| Most summoned enemies alive at once | 4. If 4 are alive, the summon is skipped |
| Where they appear | A free summon pad, chosen at random. A pad is not free if the ball, an enemy or a flag pole is within 0.6 tiles of its centre. No free pad: that enemy is skipped |
| What they are | Normal enemies: they act by their own rules, give 1 yellow star each, leave a flag pole, and carriers give their ability (FEATURES.md section 5: "the player's tools keep flowing") |

Patrollers (Trundler) are not summoned: they need a path drawn for them, which the arena does not have.

### 2.3 Phases

Health thresholds are counted on the health bar. A phase starts the moment the Warden's health drops to its threshold, even mid-shot; its new pattern starts from the next enemy turn.

| Phase | Health | Every enemy turn |
|---|---|---|
| 1 — Slow slams | 12 to 9 | Turns alternate: **mark**, then **slam**, then mark, then slam. One slam every two turns. |
| 2 — Summons | 8 to 5 | **No slams.** Summon 2 enemies every second turn. On entering phase 2 it summons at once (on the next enemy turn). An unlanded mark from phase 1 is cleared. |
| 3 — Both, faster | 4 to 1 | **Every turn:** slam the last mark (if any), then mark again. So a slam lands every turn after the first. Bigger ring (2.25 tiles). Also summon 1 enemy every turn. |

At 0 health the Warden is defeated: the slam ring and summons stop, the remaining summoned enemies stay (you may still defeat them for yellow stars), and the **exit opens** where the Warden stood.

### 2.4 Turn order in the boss fight

Same as every course (DESIGN.md section 8): aim, shot, rest check, enemy turn. The Warden acts **first** in the enemy turn, then the summoned enemies. Naps work as everywhere: two per course; running out of shots a third time fails the course, which ends the run (owner, 2026-11-15).

### 2.5 The boss course rules (FEATURES.md section 5)

- **No star quota.** The star meter is replaced by the Warden's health bar at the top of the screen, with two notches at the phase thresholds.
- The exit opens only when the Warden is defeated, on the Warden's centre tile.
- Yellow stars from summoned enemies go to the wallet as usual.
- Ability, gear and run upgrades work as on any course. Shots and naps refill at the start.

### 2.6 Rewards for beating it

| Reward | Value |
|---|---|
| Blue stars | **5** (plus, for an early boss, +1 per countdown step left: DESIGN.md open question 2, default) |
| Health | Full heal (DESIGN.md open question 7, default) |
| Gear | Choose **one of three** gear items, or skip. One per category (a weapon, an armour, a bauble), rarities rolled with the run's "late" column moved up one rarity. The screen shows each next to what you wear. Taking one replaces your item in that category; the old item is lost (it can not be dropped on a reward screen) |
| Yellow stars | 0 (the summons already give some) |

Then the run moves on to region two (section 6).

---

## 3. The arena

**Default (question 5):** one hand-built arena, a course file `src/content/courses/arena-warden.json` in the normal course format. The seed only changes the summons and slam directions, not the ground. More arenas (and generated ones) can be added later as more files in the "arena layout set".

Sketch, about 15 × 15 tiles, seen from above (north at the top):

```
      . . r r r r r r r r r . .
      . r . . . . . . . . . r .
      r . . P . . . . . P . . r       r  guard rail along the edge
      r . . . / / / / / . . . r       /  gentle slope up to the rim
      r . . / . . o . . / . . r       o  rock (cover)
      r . . / . . . . . / . . r       W  The Warden (centre, radius 0.9)
      r . . / o . W . o / . . r       P  summon pad (four)
      r . . / . . . . . / . . r       s  sand patch
      r . . / . . o . . / . . r       S  ball start (south)
      r . . . / / / / / . . . r
      r . . P . s . . s . P . r
      . r . . . . S . . . . r .
      . . r r r r r r r r r . .
```

- The centre is a flat floor around the Warden. A ring of gentle slope (one step) rises to a flat outer rim, so the ball tends to roll back towards the middle.
- **Guard rails** around the whole edge: the arena is hard to fall out of, but not impossible (a lofted shot can clear a rail).
- **Four rocks** around the Warden as cover and bank shots.
- **Four summon pads** on the outer rim, one per corner (a flat marked tile, sprite `summon-pad`; it is ground, not an obstacle).
- **Two sand patches** near the start, so a careless shot dies in the sand.
- The ball starts in the south. No water, no spikes, no clouds in this first arena.

**Checked by a test, not the generator.** The arena is not generated, so the validator does not run on it (CLAUDE.md rule 6 covers generated courses). Instead a test checks the file loads, the Warden and four pads are there, and the start is not inside the first slam ring; and a headless test plays the fight with the bot at base stats on 20 seeds and reports how often it wins (no pass mark: the number is for tuning).

---

## 4. Blue stars

### 4.1 Sources (owner, 2026-11-15: beating a course, beating a boss, an extra-rare chance in crates or under cracked ground)

| Source | Amount | Notes |
|---|---|---|
| Finishing a course | **50% chance of 1** | Rolled from the course seed; shown on the "course complete" screen |
| Finishing a hard course | **2** | Always |
| Beating the Warden | **5** | Section 2.6 |
| Early boss bonus | +1 per countdown step left | DESIGN.md open question 2, default (already counted in Milestone 6) |
| Crate | **2% chance** × drop luck | Drops a blue star pickup |
| Secured crate | **5% chance** × drop luck | |
| Cracked tile (broken by Anchor) | **8% chance** × drop luck | |

A rough count: a run that dies before the boss earns about 1 to 4; a run that beats the first Warden earns about 9 to 12.

### 4.2 The pickup

- New pickup **Blue star** (`blue-star`, sprite `star-blue`). Collected with **star reach**, like a yellow star. It does not count towards the quota.
- It lands a short way from the crate, like the other drops.

### 4.3 The wallet

- One blue star wallet, kept forever (saved, section 7).
- **Blue stars go into the wallet the moment they are earned**, so they are kept on death (FEATURES.md open question F7, default) and saved straight away.
- Blue stars are spent only on the hub (FEATURES.md section 11).
- Shown on the map screen, the town, the run summary and the hub.

---

## 5. The hub and permanent upgrades

### 5.1 The hub screen

A simple screen in the game's placeholder pixel style, shown **between runs** and when the game opens (question 9):

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
| Choice | Any of the four built abilities: Anchor, Burner, Hop, Tornado (question 7). Picked on the hub with Left/Right; it can be changed before every run, for free. "None" is also a choice |
| Rules | It is an ordinary held ability: replaced by the next one you pick up, and lost by falling off the edge |

### 5.4 Death flow (DESIGN.md section 10)

When the run ends (health at 0, or no naps left):

| Lost | Kept |
|---|---|
| Yellow stars, ability, gear worn, run upgrades, map position, the saved run | Blue stars (already in the wallet), permanent upgrades, the starting ability unlock, the Burrow |

Then the **run summary** (as now, plus blue stars earned this run), then the **hub**.

A won run (both Wardens beaten, section 6) goes the same way, with a "Run complete" summary.

---

## 6. Region two

| Rule | Value |
|---|---|
| When | After the Warden's reward screen |
| Map | A new map from the run seed (fork `region2`), same shape and rules as region one |
| Countdown | Back to 7; countdown raises reset (3 more allowed) |
| Budget | **Starts at 18**, +2 per counted node, cap 30 (owner cap, 2026-11-15). Hard courses ×1.5 as before, still capped at 30 |
| Carried over | Everything in the run: health (just fully healed), yellow stars, ability, gear, run upgrades |
| Rarity odds | Region two uses the "late" column from its first node |
| Its boss | **The Warden again, stronger** (question 6): health 18, phase 2 from 12 health and phase 3 from 6, slam damage 1, up to 5 summoned enemies alive. Reward as in section 2.6 but 8 blue stars |
| After it | The run is **complete**: "Run complete" summary, then the hub. Region three, other bosses, new biomes and the theme switch come in Milestone 8 |
| Biome and look | Same as region one for now (new biomes and the day/night theme switch are Milestone 8) |

The second Warden is a second entry in `src/content/bosses.ts` (`warden-2`) using the same behaviour with different numbers, which also proves bosses are data.

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
- **Leaving the town clears the run save** (pressing Continue on the signpost). Default for question 3: if you close the game anywhere other than a town, the run is lost when you come back (the hub says "Your run ended when you left the game away from a town"). Blue stars already earned are kept. This stops "close the page and retry the course".
- **Death or a completed run** clears the run save.
- Starting a new run while a run is saved asks to confirm: "Abandon your saved run?"

---

## 8. Testing aids (U panel, debug only)

- **+10 blue stars.**
- **Reset permanent progress** (wallet, levels, unlocks; asks to confirm; leaves the Burrow alone).
- **Fight the Warden now** (from the map) and the address `?boss=<seed>` to start a run straight at the Warden with base stats. `?boss=<seed>&region=2` for the second Warden.
- **Set the Warden's health** (to jump to a phase).
- **Break the save** (writes nonsense into the save key) to try the fallback.
- The existing aids stay (yellow stars, gear, upgrades, countdown, win this course).

---

## 9. Questions for the owner

| # | Question | Default | Answer |
|---|---|---|---|
| 1 | Blue star amounts (section 4.1): 50% chance of 1 per course, 2 per hard course, 5 per Warden, small chances in crates and cracked tiles. Rare enough? | As in section 4.1 | |
| 2 | Permanent upgrade costs (section 5.2): first levels cost 2, about ten good runs to buy everything. Too slow or too fast? | As in section 5.2 | |
| 3 | Closing the game outside a town: lose the run (blue stars kept), or carry on from the last town you visited? The second is friendlier but lets you close the page to retry a course that went badly | Lose the run | |
| 4 | The Warden: 12 health, phase 2 from 8 health and phase 3 from 4 (section 2.3), slam ring 1.75 tiles, 1 damage. Right size of fight? | As in section 2 | |
| 5 | Arena: one hand-built arena now (section 3), or generate it from the seed? | One hand-built arena; more can be added as files | |
| 6 | Region two's boss: the Warden again with more health and summons (section 6), or stop the run after region one until Milestone 8 adds the second boss? | The Warden again, stronger | |
| 7 | Starting ability: any of the four built abilities, or only abilities you have picked up in an earlier run? | Any of the four | |
| 8 | Should summoned enemies leave flag poles and give yellow stars like normal enemies (more clutter in the arena, but more stars)? | Yes, normal enemies | |
| 9 | Should the game now open on the hub? (Keys 1 to 6 would still go to the test courses; key 7 would open the hub instead of starting a run straight away.) | Yes, open on the hub | |
| 10 | Gear reward after a Warden (section 2.6): choose one of three or skip; the replaced item is lost. Or should the replaced item go to the Burrow if its slot is empty? | Lost | |

---

## 10. Done when (from PLAN.md)

The owner can die, buy a permanent upgrade, start again, and see the upgrade applied; and can beat the boss.

Things to check on purpose while playtesting (after the build):

- Die early on purpose, see the blue stars on the summary, buy Vitality on the hub, start again and see 6 health.
- Buy Head Start and see the wallet start at 10.
- Unlock the starting ability, pick Hop, and start a run holding it.
- In the Warden fight: stay in a marked ring and get slammed; leave the ring and see the slam miss.
- Push the Warden into phase 2 and see the summons appear on the pads; defeat a carrier and get its ability.
- Phase 3: a slam every turn and a bigger ring.
- Beat the Warden: full heal, blue stars, pick a gear item, land on region two's map with a higher budget.
- Stop in a town, close the page, open it again, press Continue run, and find the same shop offers.
- Close the page during a course and see the run ended (blue stars kept).
- Use "Break the save" and check the game recovers with the notice.
- The Burrow item stored in Milestone 6 is still there after the save change.
