# Milestone 8 round 2b design sheet: four abilities, switches, course modifiers, biomes and themes

**Status: signed off by the owner, 2026-11-21 ("Defaults all good"). Built 2026-11-21 (section 10, as built). Waiting for the owner to play it.**

How to review: change any number, name or rule you want. Section 8 lists the open questions, each with a default. Saying "defaults are fine" signs those off. Every number is a starting value, kept in `src/content/` so it can be tuned later.

---

## 0. Where this round fits

| Round | What | State |
|---|---|---|
| 1 | Enemies, elements, bosses, region three, endless | Built and merged |
| 2a | Detail dial, bridges, dead trees, scenery, two shops, food bag | Built and merged; waiting for your play-through |
| **2b (this sheet)** | **The last four abilities, switches with linked gates and bridges, optional course modifiers, three biomes, the theme switch after each boss** | This sheet |
| 3 | Second gear slot, extra characters, more gear, the balance pass, the map showing only the next choices | Later |
| 8b | Walkable towns and crossroads | After round 2b |

This round is big, so it is built in four parts, in this order, each checked in a browser before the next starts:

1. The four abilities and their carrier grubs (section 1)
2. Switches, linked gates and linked bridges (section 2)
3. Course modifiers (section 3)
4. Biomes and themes (section 4)

**Region one keeps its feel** (owner, 2026-11-21): no course modifiers there, no linked objects there, and its look stays as it is now. The new abilities can turn up there (question Q1).

**What you can play at the end:** each region looks different (meadow, bog, thornwood) and the look changes after every boss. You can find and use all ten abilities. In regions two and three some bridges are up until you hit a switch, some passages are shut by a gate until you hit its switch, and some courses come with wind, low gravity or darkness.

---

## 1. The last four abilities (DESIGN.md section 9)

Like every ability: one slot, taken from its carrier grub (or a Wild), used with the ability key (F) during a shot, once per shot. None has an element.

### 1.1 Burr: sticks to whatever it touches

| Field | Value |
|---|---|
| Id | `burr` |
| Use | Press during a shot. The ball becomes sticky for up to **3 seconds** |
| Effect | The **first thing it touches**, it sticks to and stops dead: |
| | – **Ground, any slope:** it stops where it lands and stays, even on a slope too steep to rest on normally. The next shot goes from there |
| | – **A wall or a rail:** it stops against it and drops to the ground at its foot |
| | – **An enemy:** the hit counts as normal (damage, the success wheel), then the ball stops beside the enemy |
| | – **A blocker** (rock, stump, dead tree): stops beside it |
| Not sticky to | Water (it sinks as normal), spikes (it takes spike damage as normal and stops there), arrow pads and springs (they act as normal) |
| If it touches nothing in 3 s | It wears off; the shot carries on |
| Why use it | Hold a spot on a slope, stop on a small island, stop before a drop |

### 1.2 Kite: slows the fall for a long glide

| Field | Value |
|---|---|
| Id | `kite` |
| Use | Press while the ball is **in the air** (does nothing on the ground) |
| Effect | Until it lands, or for **3 seconds**: falling speed is capped at **1.5 tiles a second** and gravity is a quarter. Sideways speed is kept (air drag as normal) |
| Ends | On landing, or after 3 s (it then falls normally) |
| Why use it | Cross gaps and moats, float over enemies, land softly on a far ledge |

### 1.3 Gyre: steer left and right

| Field | Value |
|---|---|
| Id | `gyre` |
| Use | Press during a shot, rolling or in the air |
| Effect | For **3 seconds**, Left and Right (A and D) turn the ball's heading by up to **150 degrees a second**. Its speed is unchanged |
| Why use it | Curve round a blocker, steer back onto a bridge, follow a winding path |
| Unlike the Tornado | No wandering, no speed change, no damage, and it can fall off edges as normal |

### 1.4 Drift: brief free flight

| Field | Value |
|---|---|
| Id | `drift` |
| Use | Press during a shot, rolling or in the air |
| Effect | The ball **stops and floats** where it is (lifted 0.5 tiles if it was on the ground) for **1.5 seconds**. The arrow keys or W A S D move it **in screen directions** (up is up the screen) at **4 tiles a second**. No gravity while it floats; walls and obstacles still stop it |
| Ends | After 1.5 s it drops straight down from where it is, with no speed |
| Why use it | Fix a shot that is going wrong, nudge onto a ledge, line up over a target |

### 1.5 Their carriers (Milestone 8 sheet section 7.4)

Same as the other grubs: a Snoozegrub variant, tier 1, health 1, cost 2. Placeholder art: the grub with the ability's mark.

| Carrier | Grants |
|---|---|
| Burrgrub | Burr |
| Glidegrub | Kite |
| Gyregrub | Gyre |
| Driftgrub | Drift |

The generator's carrier list becomes all ten grubs. Which ones region one can have is question Q1.

---

## 2. Switches, linked gates and linked bridges (FEATURES.md section 6)

### 2.1 Switch

| Field | Value |
|---|---|
| Id | `switch` |
| Look | A flat floor plate, like the cracked tile (placeholder: a round plate, red when off, green when on) |
| Blocks the ball | No: it lies flat on the ground |
| Pressed by | The ball **rolling over it or landing on it** (within 0.4 tiles of its centre, touching the ground). A ball flying over it does not press it |
| Pressed by enemies | No |
| Stays | **On for the rest of the course** once pressed (question Q4) |
| Linked to | Every gate and bridge with the same link letter on the course |
| Cost | Comes with its gate or bridge (below) |

### 2.2 Linked gate

| Field | Value |
|---|---|
| Id | `linked-gate` |
| Look | The existing gate (placeholder art), with a small coloured lamp matching its switch |
| Before its switch | **Closed**: a wall across a passage |
| After its switch | **Open for good** (it never closes on the ball) |
| Blocks rolling enemies | Yes, while closed |
| Where the generator puts it | Across a passage (a causeway or a ramp between two areas), with its switch in the area **before** the passage, at least 4 tiles from the gate and not behind it |
| Regions | 2 and 3 |
| How often | Region 2: 25% of courses get one; region 3: 40% |
| Cost | From the detail dial (it does not take from the threat budget) |

A lofted shot can still clear a closed gate if it is high enough (the gate is 1 tile tall), so the switch is the safe way, not the only way.

### 2.3 Linked bridge (a drawbridge)

| Field | Value |
|---|---|
| What | A round 2a moat bridge that starts **up** |
| Before its switch | The bridge tiles act as the moat around them: one step lower and filled with the same water, sand or spikes. A placeholder raised-plank sprite stands at the bridge's ends so you can see where it will be |
| After its switch | The bridge comes down: those tiles become plank bridge, as in round 2a |
| Where | Its switch is on the near side of the moat (the side the trail comes from), at least 3 tiles from the moat |
| Regions | 2 and 3 |
| How often | 30% of moats in region 2, 50% in region 3 |
| Cost | From the detail dial |

### 2.4 The course check

The checking bot treats an unpressed switch as a target (like a star or an enemy), so it learns to press switches before going on. Every generated course is still proven beatable before you see it.

---

## 3. Course modifiers (FEATURES.md section 15)

Some courses roll **one rule change**, shown before the course starts (a line on the map's node info and a banner when the course opens) and as an icon on the course.

| Modifier | Effect | Cost against the threat budget |
|---|---|---|
| **Wind** | A steady push on the ball while it is in the air: 1.5 tiles per second squared, in one of the four grid directions, fixed for the course. A wind arrow shows the direction. Rolling is not affected | 2 |
| **Low gravity** | The ball's gravity is 60% of normal: higher, longer, slower shots | 1 |
| **Darkness** | The aim guide is half as long, and the screen is darker away from the ball (looks only) | 2 |

| | Region 1 | Region 2 | Region 3 and endless |
|---|---|---|---|
| Chance a course has a modifier | 0% | 20% | 30% |
| Hard courses | Same chance | | |
| Boss fights | Never | | |

Each is a set of modifiers through the stat system (FEATURES.md section 1), so a future gear item could, for example, resist wind. The cost means a course with a modifier has a little less to spend on enemies. The bot plays the course with the modifier on.

---

## 4. Biomes and themes (DESIGN.md sections 11 and 12)

### 4.1 Biomes: how a region plays

A biome is a data entry: which landforms it prefers, its set piece weights (round 2a), its scenery (round 2a) and its look. The round 2a detail dial already differs per region; this round names each one a biome and adds landform preferences.

| | Meadow (region 1) | Bog (region 2) | Thornwood (region 3) |
|---|---|---|---|
| Landforms | As now (unchanged) | More ponds and basins (weight ×2), fewer plateaus (×0.5) | More ridges and gullies (×2), fewer ponds (×0.5) |
| Set pieces | As now | Round 2a region 2 weights, with ponds 3 and rough patches 3 | Round 2a region 3 weights |
| Scenery | As now | Round 2a region 2 list, more mushrooms (weight 4) | Round 2a region 3 list, more bones (weight 3) |
| Look | Day (as now) | Bog theme | Thornwood theme |

Endless regions use the three biomes in turn after region three: meadow, bog, thornwood, meadow… with region three's sizes and detail amounts (as now).

### 4.2 Themes: how a region looks (owner, 2026-11-14)

After each boss the look changes. Only the art changes; everything behaves the same. Built as alternative sprite sets in the asset manifest: a theme picks which set each sprite id resolves to, so no game logic changes per theme.

| Theme | When | Placeholder look (made by the art script from the existing sprites) |
|---|---|---|
| Day | Region 1 | As now |
| Bog | Region 2 | Murky greens and browns, darker water, a misty green sky |
| Thornwood | Region 3 | Grey-purple grass, bare brown earth, a dusk sky |
| Night | Endless region 4 | Deep blue shading on everything, a starry sky |
| Underground | Endless region 5 | Brown and grey stone tones, a dark cave background |
| Spooky | Endless region 6 | Pale greens and purples, a fog-grey sky |

After region 6 the themes repeat from Bog. The town and map screens keep their current look for now; 8b and Milestone 9 change those.

**Placeholder art:** the art script makes each theme's set by recolouring the existing tile, face, scenery and blocker sprites with that theme's palette. Enemies, the ball, pickups and the HUD stay the same in every theme. No hand-drawn art.

A U-panel switch picks a theme on the current course, for comparing them.

---

## 5. What gets built (files)

| Part | Files |
|---|---|
| Abilities | `src/content/abilities.ts`, `src/sim/play.ts` (ability effects), `src/sim/ball.ts` (sticky contact, glide, steering, float), `src/content/objects.ts` (four carriers), `src/content/gen.ts` (carrier list), placeholder art |
| Linked objects | `src/content/objects.ts` (switch, linked gate), `src/sim/course.ts` (a `link` field on objects; a linked bridge in the course file), `src/sim/play.ts` (switch state; the bridge tiles' surface and height before and after), `src/gen/journey.ts` and `src/gen/generate.ts` (placing them), `src/gen/bot.ts` (switches as targets), placeholder art |
| Course modifiers | `src/content/modifiers.ts` (new: the three modifiers), `src/sim/run.ts` (rolling one per course), `src/sim/play.ts` and `src/sim/ball.ts` (wind, gravity), the course and map screens (banner, icon, darkness) |
| Biomes and themes | `src/content/biomes.ts` (new), `src/content/run.ts` (region → biome), `src/gen/journey.ts` (landform weights), `tools/make-placeholder-art.ts` (theme sets), `src/render/manifest.ts` and the course scene (resolving a sprite id through the theme) |

---

## 6. Done when

- **Burr:** sticks on a steep slope and stays there for the next shot; stops at a wall's foot; a stuck enemy hit counts; water and spikes act as normal; it wears off after 3 s (tests).
- **Kite:** falls no faster than 1.5 tiles a second while gliding; does nothing on the ground; ends on landing (tests).
- **Gyre:** turns at up to 150 degrees a second with the keys; keeps its speed (tests).
- **Drift:** floats 1.5 s and moves in screen directions; walls stop it; then drops straight down (tests).
- **The four carriers** appear in generated courses and give their abilities.
- **Switches:** pressed by rolling or landing, not by flying over; a linked gate opens and stays open; a linked bridge comes down and its tiles roll like a bridge; before that they act as the moat (tests).
- **Generated linked courses** pass the course check, with switches before their gates and bridges.
- **Course modifiers:** wind pushes only in the air; low gravity lowers gravity; darkness halves the guide; none in region 1 or boss fights; the rates per region are near the table (tests).
- **Biomes:** region 1 courses are exactly as before (the round 2a test); bog and thornwood change landform weights as in the table (measured).
- **Themes:** every sprite a course uses exists in every theme's set; the right theme shows in each region (test and screenshots).
- **Course making times:** re-measured and logged; if any late course averages over 15 s, I bring you options.
- **Checked in a browser with screenshots:** each ability in use, a switch opening a gate and lowering a bridge, each modifier, and one course in each of the six themes.

---

## 7. Things for you to playtest after it is built

1. Use each new ability on a course. Does each feel different from the others, and from the Tornado and the Anchor?
2. Burr: stick to a steep slope, then shoot from there.
3. Kite: glide across a moat. Is the glide too floaty or not floaty enough?
4. Drift: is 1.5 seconds enough to fix a bad shot?
5. Find a closed gate, hit its switch, and go through. Then try a drawbridge.
6. Play a windy course, a low-gravity course and a dark course. Are any of them no fun?
7. Beat a boss and see the look change. Do the bog and thornwood looks read well?

---

## 8. Open questions (each has a default)

| # | Question | Default |
|---|---|---|
| Q1 | Can the four new carrier grubs appear in region 1? (It adds ability variety but does not change region 1's size, terrain or difficulty.) | **Yes**: all ten grubs everywhere |
| Q2 | The numbers: Burr 3 s; Kite 3 s and 1.5 tiles/s fall; Gyre 3 s at 150°/s; Drift 1.5 s at 4 tiles/s | As listed |
| Q3 | Burr sticks to enemies (the hit counts, then the ball stops beside it)? | Yes |
| Q4 | A switch stays on for the rest of the course (rather than switching back after a few seconds)? | Stays on |
| Q5 | Linked gates and drawbridges only in regions 2 and 3, at the rates in sections 2.2 and 2.3? | Yes |
| Q6 | Course modifiers: wind, low gravity and darkness, at 0%, 20% and 30% by region, never on boss fights? | Yes |
| Q7 | Region names and biomes: Meadow, Bog, Thornwood? | Yes (working names) |
| Q8 | Theme order: day, bog, thornwood, then night, underground, spooky in endless, then repeat from bog? | Yes |
| Q9 | Themes recolour tiles, faces, scenery and blockers only; enemies, ball, pickups and the HUD look the same everywhere? | Yes |
| Q10 | Build in the four parts of section 0, each checked in a browser before the next? | Yes |

---

## 9. Sign-off

**Signed off by the owner, 2026-11-21: "Defaults all good"** (every question in section 8 takes its default).

---

## 10. As built (2026-11-21)

Everything on the sheet is built, in the four parts of section 0, each checked in a browser. Where the build differs from the sheet's wording, it is listed here.

**Abilities**

- **Burr pressed while rolling** sticks at once: the ground is what it is touching. In the air it holds for 3 s and sticks to the first thing it touches.
- **Kite** is not used up if pressed on the ground (the key does nothing there), so it can still be used once the ball is in the air.
- **Gyre** and **Tornado** share the Left/Right keys; **Drift** uses the arrows or W A S D in screen directions. Aiming keys are free during a shot, so nothing clashes.

**Switches**

- A **drawbridge** is never railed (its rails would sit a step below the planks while it is up).
- A **linked gate** is a row of gate pieces across the middle of a passage (as wide as the passage), with its switch in the area before it, at least 4 tiles from every piece.
- When a drawbridge comes down, the game swaps in a copy of the course with those tiles changed and the ground is drawn again (the course file always shows the course as it starts).
- On the **test bench**, a linked gate or drawbridge comes with its switch two tiles before it.

**Course modifiers**

- **Low gravity** acts in the air only: rolling down a slope and coming to rest are as normal. (The sheet said "the ball's gravity"; applying it on slopes too would change where balls can rest.)
- A course modifier travels with the course's starting kit, so the background course-maker and the bot use exactly the same modifier as the player.
- The banner when a course opens stays up for 4 seconds (other messages: 1.4).

**Biomes and themes**

- The Bog's and Thornwood's set piece and scenery changes (section 4.1) are made in the region detail table (`src/content/run.ts`); the landform preferences are in `src/content/biomes.ts`.
- The drawbridge's raised planks are recoloured with the themes too.
- Every theme's sprites are loaded when the game starts: 396 sprites, 1.7 MB in all. If loading gets slow, themes can be loaded when they are first needed.

**Testing aids:** `?ability=<id>` (test bench), `?mod=wind|lowGravity|darkness` (and `&dir=ne|se|sw|nw`), `?theme=<theme>`, and a theme picker in the U panel.

**Tests:** 33 new in `tests/round2b.test.ts`; three existing tests changed (the test bench now adds a switch to gates and drawbridges; the bot's kit now carries the course modifier).
