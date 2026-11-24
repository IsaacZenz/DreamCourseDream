# Milestone 8 round 4 design sheet: a fourth region and a new final boss, the centipede

**Status: signed off by the owner 2026-11-23, all defaults**, with two additions: **Thousandfoot** is the stand-in name for now, and **the centipede's map is always the same** (the Coil Pit; no other arena). The owner will **test the fight by hand** instead of the bot (the bot cannot lead a moving target yet). Built the same day; as-built notes in section 10.

## 0. Where this fits

The owner asked for this on 2026-11-23, before Milestone 9 starts:

- **Decided (owner, 2026-11-23):** the run is **four regions, then endless** (was three, then endless).
- **Decided (owner, 2026-11-23):** region 4 uses the **Starfall** theme (the deep purple sky that until now opened endless mode).
- **Decided (owner, 2026-11-23):** region 4's boss is a **new final boss, a giant centipede**, with the mechanics in sections 2 to 6. The owner's own design is marked **(owner)**; numbers and details I filled in are marked **Default** and can be changed.

This is round 4 of Milestone 8, because it changes what "the end of a run" means and Milestone 8's done-when ("the regions and a final boss are playable and the owner judges the curve fair"). The done-when becomes: **four regions and the centipede are playable, and the owner judges the curve fair.**

**Build order:** (1) region 4 and endless moving to region 5 (small, mostly numbers); (2) the arena and the moving body with weak spots (the core: you can hit it and win); (3) the shooting spikes; (4) the leg sweep; (5) summons and "the centipede hurts its own minions"; (6) the head in phase 3; (7) teach the course-check bot to fight it, then the arena check and a balance run.

---

## 1. Region 4, and endless starting at region 5

| What | Before | After (Default unless marked) |
|---|---|---|
| Regions before endless | 3 | **4 (owner)** |
| Region 4 theme | Starfall (as the first endless region) | **Starfall (owner)**. Endless regions (5 and on) each pick a random theme, repeats allowed, as already decided |
| Region 4 biome | Meadow (endless took the three in turn) | Meadow, unchanged |
| Region 4 numbers (threat, enemies, toughness, par kit, rarity) | Region 3 plus one endless step | **The same numbers.** Region 4 keeps exactly what "endless region 4" had: threat start 38, cap 72, at most 20 enemies, +2 health and +1 attack on enemies, the best rarity column, the region 3 par kit plus +1 max shots, +1 max health, +10% shot power |
| Course size in region 4 | Region 3's size (the cap) | Unchanged: region 3's size |
| Region 4 boss pool | All bosses (endless) | **The centipede only** |
| Beating the region 3 boss (the Brood Queen) | Wins the run; "Run complete" screen | An ordinary boss win: 12 blue stars, full heal, gear pick, on to region 4 |
| Beating the region 4 boss (the centipede) | — | **Wins the run**: 14 blue stars, full heal, gear pick, the "Run complete" screen, then Keep going (endless) or Back to the Burrow, as now |
| Endless regions | Region 4 and on | **Region 5 and on.** Each adds one step to region 4's numbers, so region 5 and later have exactly the numbers they had before. Only the label changes |
| Endless boss pool | Stagwarden, Gloamhorn, Brood Queen | **Also the centipede** (always in its own arena). Never the same boss twice in a row, as now |
| Wins already in a save | Counted when the Brood Queen was beaten | Kept as wins (they were wins under the old rules). No save version change needed |

**Why keep region 4's numbers the same as the old "endless region 4":** they are already tested by the balance tool, and it means regions 5 and on do not change at all. The only new difficulty is the boss.

**Story (Default):** the Brood Queen keeps her title "Mother of the swarm", and the centipede is the thing she serves, deep under the ground. A small note: a centipede is not strictly an insect (DESIGN question 9 says "the villains are insects"), but it is a "bug" in everyday speech, so I treat it as fitting the theme. Say if you see it differently.

---

## 2. The centipede: template (FEATURES.md section 5)

| Field | Value |
|---|---|
| id | `centipede` (code id; the shown name is your pick, below) |
| name | **Needs your pick** (question 1). My suggestions: **Thousandfoot** (recommended: short, says what it is, original), *Grindcoil*, *The Undercoil* |
| title (introduction card) | "The ring with no end" (Default) |
| sprite ids | `centipede-segment-armoured`, `centipede-segment-weak`, `centipede-segment-shooter`, `centipede-legs`, `centipede-head`, `centipede-plate` (a falling shell plate). Placeholders first; real art in Milestone 9 |
| health | **32** in region 4 (Default; the Brood Queen has 26 in region 3, and would have had 33 in region 4). Endless regions add a quarter of 32 per region after 4 (40 in region 5, 48 in region 6) |
| element | none |
| gimmick | **Moving weak spots (owner).** Only hits on unarmoured segments (and on the head in phase 3) do damage |
| hits per shot | 1, like every boss |
| arena | **The Coil Pit** (new, section 3); the centipede uses only this arena and no other boss uses it |
| rewards | 14 blue stars, full heal, a gear pick of 1 from 3, and the run is won |
| summoned minions leave a flag pole | No, as for every boss |

### 2.1 Phases

The usual three phases: a phase holds while health is above 2/3, then 1/3, then the last. **(owner)** for the attacks, **Default** for the counts and speeds.

| Phase | Health | Weak spots | Shooting spikes | Body speed | Summons | Head |
|---|---|---|---|---|---|---|
| 1 | above 2/3 (above 21) | **3 (owner)** | **2 (owner)** | 1.0 tiles a second | none | no |
| 2 | 2/3 to 1/3 (21 to 11) | **6** (3 more plates fall off) | **3 (owner)** | 1.25 | **yes (owner)**: one on each sweep turn while fewer than 2 are alive | no |
| 3 | below 1/3 (11 and less) | **10** (4 more fall off) | **4 (owner)** | 1.5 | one on each sweep turn while fewer than 3 are alive | **yes (owner)**, section 6 |

**Phase change (Default):** the body shudders, shell plates fall off the segments that become weak spots (they drop into the leg ring and fade; for looks only), and it sheds a heart and a shot orb inside the arena, like the other bosses. **The body also reverses direction** at each phase change, so you cannot settle into one rhythm. (This one is my addition; say if you would rather it always runs one way.)

**Summon pools (Default, existing bugs only):**

- Phase 2: Skitter Ant 40%, Bristlecrawler 30%, a grub 30%.
- Phase 3: Trapjaw 30%, Stinkpuff 30%, Pouncehopper 20%, a grub 20%.
- They appear at the arena's spawn spots in the middle, never in the leg ring.

---

## 3. The arena: the Coil Pit (new)

**(owner):** the arena stays the size it is now (the arenas are 15 by 15 tiles). The body is 2 tiles wide and hangs over the edge of the map; the legs take up 1 tile inside the map.

```
   body (2 tiles, outside the map, drawn over the void)
  ┌───────────────────────────────┐
  │ L L L L L L L L L L L L L L L │  ← leg ring: the outer 1 tile of the map
  │ L . . . . . . . . . . . . . L │
  │ L . . . . . . . . . . . . . L │
  │ L . . .   inner 13 × 13   . L │
  │ L . . .   flat grass      . L │
  │ L . . . . . . . . . . . . . L │
  │ L L L L L L L L L L L L L L L │
  └───────────────────────────────┘
```

**Default:**

- **Square, 15 by 15**, flat grass everywhere (the leg ring is grass too, so it plays the same; it is only drawn differently). No water, no slopes, no obstacles: the moving wall is the whole puzzle, and spikes fly over everything anyway, so cover would not help. Say if you want something in the middle (for example bumpers to bank shots off).
- **The body is the arena's wall.** The ball cannot fall off the edge: it hits the body's inner side.
- **The leg ring is always drawn with a faint red tint**, so you know at a glance where the sweep (section 5) reaches.
- **The legs do not block the ball.** They are drawn moving, but the ball rolls through the leg ring freely and only the body stops it. (Better than legs that the ball bumps into: 30 sets of moving legs would make bounces near the wall feel random.)
- **Ball start:** the middle of the south side of the inner area, 2 tiles in from the leg ring. **Exit:** the centre, opening when the centipede is beaten.
- **Spawn spots:** eight, on a ring 3 tiles from the centre.

**Drawing it in isometric (Default):** the body on the two far sides (the top of the screen) is drawn behind the map, which is fine. The body on the **two near sides** (bottom of the screen) is drawn in front of the map and could hide the ball. So the near sides turn **see-through (an outline)** whenever the ball, an enemy or a marked attack is behind them. This is worth looking at closely when you playtest.

---

## 4. The moving body and its weak spots (owner)

- **The body is one closed ring of segments that wraps the whole arena** and goes round all four corners. It never stops: it moves while you aim, during your shot, and during enemy turns, like a patroller. You see only the body and the legs (no head until phase 3).
- **Default numbers:** each segment is **2 tiles long** measured along the map edge, so the 60-tile edge holds **30 segments**. At 1 tile a second, a full lap takes 60 seconds; with 3 weak spots spread evenly, a weak spot passes any point about every 20 seconds.
- **Armoured segments:** a hit bounces off like a wall (bounce 0.7) with a "clank" and a spark. No damage.
- **Weak segments** (pale, soft, no shell): a hit does the ball's normal hit damage, and the ball bounces off more softly (bounce 0.4).
- **Where the weak spots are (Default):** spread evenly round the ring (phase 1 every 10th segment, phase 2 every 5th, phase 3 every 3rd), starting from a random segment picked with the fight's seed. Evenly spread means one is always coming round towards you.
- **The skill:** aim where the weak spot *will be* when the ball gets there, not where it is now. You can also wait while aiming for a weak spot to come close.

---

## 5. Attacks

The centipede works in a **two-turn rhythm (owner)**: a **fire turn**, then an **off turn**, then a fire turn, and so on. The HUD shows which one is next ("Next: SPIKES" or "Next: SWEEP"), so you can plan where to stop (Default; my addition, because the sweep otherwise comes with no warning you can act on).

### 5.1 Shooting spikes (owner)

- **Some segments are shooters** (Default: a segment with a spine pod on top, never a weak spot; 2 in phase 1, 3 in phase 2, 4 in phase 3, spread evenly).
- **On an off turn, each shooter marks a path** across the map, starting where that shooter is at that moment. The marking is drawn as a line on the ground, like the warning circles the other bosses use.
- **On the next turn (the fire turn), a spike flies along each marked path** from one side of the arena to the other.
- **The paths are fixed on the ground once marked.** The body keeps moving, so by the fire turn the shooter has moved on; the spike bursts out of whichever part of the body is at the start of the line. (Default. This keeps the warning honest: what you saw marked is exactly where the spike goes.)
- **Where the paths point (Default):** the first spike's path goes **through the spot where the ball is resting**; the others go towards random spots in the middle 9 by 9 tiles. So one spike is always aimed at you, and you dodge it by moving with your next shot.
- **Damage (Default):** a spike does **1 damage** to the ball if the ball is within 0.45 tiles of the line, and knocks it a little along the spike's direction. Each spike that crosses the ball counts, so two crossing paths on your spot is 2 damage.
- **Spikes go through everything** (they do not stop at the first thing they hit), including minions (section 5.3).

### 5.2 The leg sweep (owner)

- **On an off turn, if the ball is resting in the leg ring** (the outer 1 tile, next to the body), razors stick out of the legs all the way round and sweep the whole ring.
- **Reach (Default): the full 1 tile of the leg ring.** You suggested half a block or a full block; a full block matches the tinted ring exactly, so there is one simple rule to read: "inside the red ring on a sweep turn = hit".
- **Damage (Default):** 1 damage to the ball, and the ball is pushed **1.5 tiles inward**, out of the ring, so it does not stay there.
- The sweep **hits every minion in the leg ring too** (section 5.3).
- If the ball is not in the ring, there is no sweep that turn.
- Resting in the ring on a **fire turn** is safe from the sweep (but not from spikes).

### 5.3 The centipede hurts its own minions (owner)

Unlike every other boss: **spikes, the sweep and the head burst all hit the spawned minions**.

- **Default: any of these attacks defeats a minion outright**, whatever its health. (Region 4 gives enemies +2 health, so a damage number would leave some alive; "outright" is what makes it feel destructive.)
- **Default: a minion killed this way drops its stars and abilities as normal**, so the destruction helps you if you are near.
- Minions never hurt the centipede.

---

## 6. Phase 3: the head (owner)

Until phase 3 you see only the body. In phase 3 the head bursts out of the ground.

**The head cycle repeats every 4 enemy turns (Default):**

| Enemy turn | Kind | What happens |
|---|---|---|
| 1 | off turn | **Marks a large circle** centred on the ball's resting spot (radius **2.5 tiles**, drawn like the other bosses' warning circles). Also the usual off-turn things: marks the spike paths, sweeps if the ball is in the leg ring, summons |
| 2 | fire turn | The spikes fire. **The head bursts out of the ground in the circle:** **1 damage** to the ball if it is in the circle, and the ball is thrown out of it (speed 7, hop 2, as the slam knock). **Every minion in the circle is defeated** |
| your shot | | **The head stays up for this one shot and can be hit** |
| 3 | off turn | The head **shoots 1 spike in a random direction, with no warning (owner)**, then sinks back down. Plus the usual off-turn things |
| 4 | fire turn | The spikes fire. No head |

- **The head (Default):** round, 2.5 tiles across (wider than the 2-tile body), 1.5 tiles tall. While it is up it is a solid thing on the map: the ball bounces off it.
- **Its weak spot (Default): the whole head is the weak spot, and a hit on it does double damage.** You suggested "maybe it has a weak spot you can hit". A small spot on a target that is only up for one shot would be very hard to hit with a ball, so I made the whole head the target and made it worth more instead. A hit on the head is still the one hit allowed per shot.
- **The circle is kept inside the inner 13 by 13**, so the head never comes up in the leg ring.
- **The head's unwarned spike** does 1 damage and defeats minions, like the other spikes. Its direction is a seeded random pick, so it can hit the ball; it is one spike, so the worst case is 1 damage.

**A full phase 3 enemy turn can be busy:** 4 spikes, a sweep, the head, and up to 3 minions. That is on purpose ("super destructive"), but it is the part most likely to feel unfair or unreadable, so it is the first thing to judge in a playtest.

---

## 7. The course check and balance

- **Arena check:** like every arena, `npm run arenas` must show the bot winning at least half of 20 seeds with the region 4 par kit.
- **The bot needs a new skill:** today it aims at things that stand still. For the centipede it must lead a moving target (work out where a weak spot will be when the ball arrives) and choose when to shoot. This is the biggest engineering risk on the sheet. If the bot cannot reach half the seeds, I will report the numbers and offer options (for example a slower body or more weak spots) rather than quietly change your design.
- **Balance:** `npm run balance` gets a region 4 row; the report goes to you before any number changes.
- **Rules kept:** everything here is in the simulation (no clock, no `Math.random()`; the body's position comes from the fight's own step count, and every random pick uses the seeded generator), the numbers live in `src/content/bosses.ts` and the arena file, and the art is referred to by sprite id only.

---

## 8. Questions for the owner

| # | Question | Default if you do not answer |
|---|---|---|
| 1 | The centipede's name | **Thousandfoot** |
| 2 | Body reverses direction at each phase change? | Yes |
| 3 | Leg sweep reach: full tile (matches the red ring) or half a tile? | Full tile |
| 4 | Head: whole head counts double, or a small weak spot only? | Whole head, double damage |
| 5 | Minions killed by the centipede drop their loot? | Yes |
| 6 | Anything in the middle of the arena (bumpers, rocks)? | Nothing: flat grass |
| 7 | Health 32 in region 4, 14 blue stars | As written |

Everything else on the sheet uses the defaults written above unless you change it.

---

## 9. What you will be able to test when it is built

1. Beat the Brood Queen in region 3 and check it no longer says "Run complete", and region 4 opens with the purple Starfall sky.
2. In the Coil Pit, try to hit a weak spot as it moves. Does leading the target feel fair? Is 1 tile a second too fast or too slow?
3. Watch the spike paths get marked, then dodge them. Does the marked line match where the spike really goes?
4. Stop in the red leg ring on a sweep turn and on a spike turn, and check the sweep only happens on the sweep turn.
5. In phase 2, line a minion up with a spike path and watch it die.
6. In phase 3, check the head comes up where the circle was marked, and that hitting it does double damage.
7. Look for the ball ever being hidden behind the near side of the body.

---

## 10. As built (2026-11-23)

Everything in sections 1 to 6 is built with the default numbers. Where the build differs from the sheet, or the sheet did not say:

- **Hand-tested, not bot-tested (owner, 2026-11-23).** `npm run arenas` skips Thousandfoot and says so (`handChecked` in `src/content/bosses.ts`); `npm run arenas -- 20 centipede` still runs the bot if wanted. On 2 seeds it lost both, as expected. `npm run balance` has no region 4 row yet.
- **Two spikes at once cost 1 health, not 2.** The existing rule (owner, 2026-11-14) gives the ball half a second of immunity after any damage, and every spike in a volley lands at the same moment. Section 5.1 said each spike counts; with the immunity rule only the first does. The same applies to spikes and the head burst on the same turn. Say if you want the volley to hit harder.
- **Storm Cloak does not stop the centipede's spikes.** It protects from ground spikes; the centipede's spikes are their own kind of damage ("SPIKED").
- **The body stays as the wall after Thousandfoot is beaten** (greyed out, legs still), so the ball cannot roll off the edge on the way to the exit.
- **The testing panel's "Boss to phase 2 / 3" buttons now run the real phase change** for every boss, so the plates fall off and the heart and shot orb drop, as in a real fight. Jumping straight to phase 3 gives the 10 weak spots at once.
- **Messages:** "CLANK! ARMOUR. HIT THE PALE SEGMENTS" on an armour hit; "HIT! -N" on a weak spot or the head; "SPIKES NEXT TURN" the first two times spikes are marked; the leg ring flashes on a sweep. The boss bar has a second line, "NEXT: SPIKES" or "NEXT: SWEEP", below the line where messages appear.
- **Placeholder art** (`npm run art`): shell domes (dark red armour, pale pink weak spots with a yellow rim, a bone-coloured spine pod on shooters), scuttling legs in the leg ring, a red diamond on each leg-ring tile, the head, a flying spike and falling plates. Sprite ids: `centipede-segment`, `centipede-legs`, `centipede-head`, `centipede-quill`, `centipede-plate`, `danger-tile`.
- **Drawing:** each segment is two domes. They are drawn 0.8 tiles out from the edge rather than the body's true middle (1 tile), so the domes meet the map edge with no gap; the physics wall is exactly at the edge.

## 11. Changes after the owner's first playtest (2026-11-24)

The owner played it on the test page and found it **too easy**. Owner decisions:

- **Corner spikes:** a symmetrical L of spike tiles in each corner of the Coil Pit (20 tiles), set one tile in from the edge, so the outer ring (the leg ring) is still a clear path all the way round.
- **The body is 3 tiles wide** (was 2). It still hangs over the edge; the map stays 15 by 15 and the wall is still exactly at the edge. Bigger placeholder domes.
- **Bug fixed: the red spike lines and the head's circle did not show** on any course after the first one in a session. The scene is reused for every course, and the drawing for marks was kept from the destroyed old course. This also hid the Brood Queen's soldier rings, Stinkpuff rings and the Warden's slam ring after the first course. Found by entering the fight twice in a row; my earlier check only ever entered once.
