# Milestone 8b design sheet: walkable towns and crossroads

**Status: waiting for the owner's sign-off.** Nothing on this sheet is built yet.

## 0. Where this fits

The owner decided this on 2026-11-21 (DESIGN.md, "walkable towns and crossroads"; PLAN.md, Milestone 8b):

- Between courses, you walk the armadillo around a small isometric place. The camera is much closer than on a course. You move with W A S D or the arrow keys.
- Two kinds of place work like this:
  - the **town**, where you walk up to the shops and the Burrow;
  - the **crossroads**, where each of the next 1 to 3 courses is a path you walk into.
- Going into the Burrow or a shop opens a **flat 2D illustrated screen**.
- The first version also has the **boss gate** and a **practice green** in town.
- Later, not on this sheet: the walkable hub between runs, a rare hidden path, and townsfolk with tips.

The courses themselves do not change. Neither do the run rules (countdown, budget, rewards, food, saving), the shops' stock and prices, the Burrow, or course making. This milestone only changes **how you move between courses**: walking replaces picking on the map screen.

**Done when:** the owner can play a run moving between courses only by walking.

## 1. Walking

### 1.1 Controls

| Key | What it does |
|---|---|
| W A S D or the arrow keys | Walk. Two keys together walk diagonally |
| Shift (held) | Run, at 1.6× walking speed |
| Enter or E | Use what is in front of you: read a signpost, talk to a door. Walking into a door also works (section 1.4) |
| B | The food bag, as now |
| M | Look at the whole run map (view only) |
| Esc | Close a flat screen or the map |
| U | The test panel, as now |

### 1.2 Which way is "up"

**Up on the keyboard is up on the screen**, not along the tile grid. W walks straight up the screen; W with D walks up and to the right, which follows one direction of the diamond grid exactly.

On an isometric screen, up and down cover half the ground per step that left and right do, because the ground is squashed. The walk accounts for this so that every direction feels like the same speed.

### 1.3 Speed and feel

- Walking speed: **3 tiles a second**. Running: 4.8.
- Movement is free, not locked to tiles: the armadillo can stand anywhere, like in a 16-bit action RPG.
- There is no speed-up or slow-down, so you stop the moment you let go. This makes it easy to line up with a door.
- The armadillo stops at walls, buildings, fences, water and steep steps.
  - It walks up and down a step of 1 height level (a gentle slope or a kerb). Anything taller blocks it.
  - It slides along a wall instead of sticking to it. This is the same "move one axis at a time" idea the ball uses (`moveAxis`).
- Its feet, not its whole picture, are what bump into things: a small circle, 0.3 tiles across. That lets it squeeze past a lamp post the way you'd expect.

### 1.4 Doors and other things you can walk into

Each **trigger** is a marked patch of ground. Stepping onto it does its job once; to use it again, step off and back on.

| Trigger | What happens |
|---|---|
| Shop or Burrow doorway | Opens that place's flat screen (section 4). When you close it, you are standing just outside the door, facing away from it |
| End of a path at the crossroads | Goes to that course (section 3) |
| Town exit | Back to the crossroads for the next choice |
| Boss gate | Plays the boss's introduction card, then a "Fight now? Enter: yes, Esc: not yet" prompt (section 3.4) |
| Practice green's tee | Starts a practice course (section 2.3) |
| Cache chest | Opens the cache's pick-one-of-three (section 3.5) |
| Signpost (Enter, or stand next to it) | Shows what the path leads to, without going there |

### 1.5 Camera

- **Zoom 2**: every art pixel covers 2×2 screen pixels. You see about 12 tiles across, against about 24 on a course at its usual zoom. Places are small enough that this shows most of a town at once.
- The camera follows the armadillo with a small dead zone, so it doesn't jiggle on small steps. It stops at the edges of the place, so you never see past the edge.
- O shows the whole place (overview), as on a course.

### 1.6 The armadillo

This is the first time the hero appears on screen standing up. DESIGN.md says the hero is an armadillo who stands on two legs, rolls into a ball when launched, and pops back out when the ball stops.

- **Placeholder art:** a small standing armadillo, about 14 by 20 pixels, drawn by the placeholder tool. Its colours match the ball, so the two read as the same character.
  - 4 facings: up-left, up-right, down-left and down-right. The diagonals match the grid, and the left-facing frames are flipped copies of the right-facing ones.
  - 3 frames per facing: standing, step 1, step 2. That is 6 drawn frames in all.
  - A small shadow under it, like the ball's.
- On courses it is still the ball. Showing the armadillo popping out on a course is not part of this milestone (open question 7).

## 2. The town

### 2.1 Layout

Each town is **hand-built data**, like the boss arenas: one file under `src/content/places/`. It uses the course format's ground (heights and tiles) plus objects and scenery, so the theme recolours from round 2b work on it as they are.

There are **three town layouts, one per biome** (Meadow, Bog, Thornwood). A town uses its region's biome and theme. Endless mode uses one of the three at random, picked from the run's seed, in that region's theme (Starfall first).

Each town is about **16 by 14 tiles** and holds:

| Place | What it looks like (placeholder) |
|---|---|
| Food shop | A small hut with an awning and a crate of produce out front. New sprite |
| Gear shop | The existing `town-shop` building with a sign added. New sprite drawn from it |
| The Burrow | The existing `town-burrow` mound with a round door |
| Practice green | A flat 5×5 patch of grass with a flag, inside a low fence |
| Signpost | The existing `town-sign` where you arrive |
| Town exit | A dirt path leading off the edge of the place |
| Props | Fences, lamp posts, barrels, crates, rocks, stumps, dead trees, the round 2a scenery and the fireflies |

**Paths:** a new **dirt path** ground tile, used only in places, joins the doors. It walks like plain ground. Adding a tile is a data entry, as the rules require.

### 2.2 Arriving and leaving

- You arrive at the signpost.
- Arriving still does what it does now, at once: it deposits your blue stars and saves the run.
- The town is still the save point. If you close the game in a town and come back, you are standing at the signpost.
- Leaving through the town exit asks "Leave town? Enter: yes, Esc: stay." It is the same as "continue" today, so it needs a yes.

### 2.3 Practice green

- Stepping onto its tee loads a **small fixed practice course**. It is a hand-built 8×8 course with a slope, a bumper and a sand patch, and the theme comes from the town.
- **Nothing counts:**
  - shots are unlimited and you take no damage;
  - you earn no stars, find no gear, and food you've eaten does not tick down;
  - your gear and abilities do work, so you can try out a new purchase.
- Sinking the ball, or pressing Esc, brings you back to the town, standing next to the green.

## 3. The crossroads

### 3.1 When you see it

The crossroads replaces the map screen in the run:

- at the start of a run;
- after every course;
- after leaving a town or a cache;
- after a boss's reward pick (the new region's first crossroads).

The map screen stays as a **testing view**. M shows it read-only, and the U panel has a "use the map screen" switch that brings back the old way of picking.

### 3.2 Layout

The crossroads is a small clearing, about **12 by 10 tiles**. You stand at the bottom, and 1 to 3 paths lead off the top: up-left, straight up and up-right.

- **Built from templates:** three ground layouts, for 1, 2 and 3 paths, are hand-made data files.
- **Varied by the seed:** the props and scenery are scattered by the seeded random number generator, using the run seed and the node. The same run always looks the same, and two crossroads in one run look different.
- **Themed** by the region, like courses and towns.

### 3.3 Signposts: knowing what you're walking into

Each path starts with a **signpost**. The node's icon floats above it, using the existing map icons for course, hard course, town, cache and boss. Stand next to a signpost, or press Enter there, and a card shows **the same lines the map's side panel shows now**:

- the budget and number of areas;
- the stars you'd earn;
- "always has a gear item" on a hard course;
- the course modifier and its wind strength;
- "last town" before the boss.

A small strip at the top of the screen shows the boss countdown, as the map does now. Walking to the far end of a path takes you to that node.

### 3.4 The boss gate

When the boss is one of the choices, that path ends in a **big gate** instead of a plain path end. This includes the early boss and the forced one.

- Walking up to the gate plays the boss's **introduction card**, the same card a boss fight opens with now.
- Then a prompt asks: "Fight now? Enter: yes, Esc: not yet."
  - **Yes:** the fight starts, and the card does not play a second time.
  - **Not yet:** you step back from the gate and can pick another path, if there is one.
- The gate is drawn closed until you agree. New sprite, about 3 tiles wide.

### 3.5 The cache

A cache node is now a small place of its own: a clearing with a **chest** in the middle.

- Walking into the chest opens the existing "take one of three" pick as a flat screen.
- After you pick, or skip, an exit path leads back to the crossroads.

## 4. The flat 2D screens

The Burrow, the food shop and the gear shop each open as a **full-screen flat illustration**, 384 by 216 pixels, with the **menus they have now** drawn over it. Buying, rerolling, the Burrow store, permanent upgrades and the replace prompt all keep their current rules and keys.

- **Placeholder art:** three flat room pictures drawn by the placeholder tool, in the game's palette.
  - Food shop: a counter with shelves of produce.
  - Gear shop: a counter with racks and a workbench.
  - The Burrow: an earthy room with a stash chest, a bed of leaves and a shelf.
- **No shopkeeper is drawn yet.** The insects are the villains, so who runs the shops is a story choice for the owner (open question 2).
- **Layout:** the menu cards sit in the lower two thirds of the screen, and the picture shows above and behind them.
- **Leaving:** Esc closes the screen, and you are back outside the door.

## 5. Rules kept

- **Separation:** walking is plain logic with no drawing, in a new `src/sim/walk.ts`. It uses a fixed timestep, runs in Node and has tests. A place is plain data. Drawing stays in `src/render/`.
- **Determinism:** crossroads props use the seeded random number generator, never `Math.random`.
- **Original content only:** places, buildings and rooms are the game's own placeholders. The owner's reference pictures were for feel only.
- **Art through the manifest:** all new art is reached by manifest id.
- **Background course making carries on:**
  - at a crossroads, all the choices are made in the background, the one nearest the armadillo first;
  - in a town, the courses after it are made in the background, as now.
- **Saving:** a town is still the only save point. Closing at a crossroads loses the run, as closing on the map screen does now.

## 6. What gets built (files)

| Part | Files |
|---|---|
| Walking | `src/sim/walk.ts`, new: movement, collision and triggers |
| Place data | `src/content/places.ts`, the place template; `src/content/places/*.json`, three towns, three crossroads templates, the cache clearing and the practice course |
| Crossroads props | `src/gen/crossroads.ts`: scatters props and scenery, seeded |
| Places on screen | `src/render/PlaceScene.ts`, new: draws a town, crossroads or cache, the armadillo, the camera and the signpost cards. Replaces `MapScene` and `TownScene` in the run flow |
| Flat screens | The shop and Burrow menus moved out of `TownScene` into their own pieces, drawn over a room picture |
| Art | Placeholder tool: the armadillo, the food hut, the gear shop with its sign, the boss gate, the chest, the dirt path tile, fences, lamp posts, barrels and three room pictures |
| Testing aids | `?place=town`, `?place=crossroads&paths=3`, `?place=cache`; a U-panel switch for the old map screen |
| Tests | Walking (walls, steps, sliding, triggers), place files are valid, the crossroads is the same for the same seed, the run flow by walking (start, course, town, cache, boss) |

## 7. Done when

1. A whole run can be played moving between courses only by walking: start, courses, a town, a cache, the boss and the next region.
2. The armadillo walks in all 8 directions, stops at walls and buildings and slides along them, and goes up and down 1-level steps only.
3. Every doorway, path end, gate, chest and tee does its job exactly once per step onto it.
4. The signpost cards show the same information as the map's side panel.
5. The practice green changes nothing in the run.
6. The map screen is still there as a testing view.
7. `npm run check` passes, and screenshots of a town, a crossroads with 3 paths, the boss gate and each flat screen have been checked.

## 8. Things for you to playtest after it is built

1. Walk around a town. Does the walking speed feel right? Is Shift-running needed?
2. Is it obvious which way to walk to reach each door? Do the doors open when you expect them to?
3. At a crossroads, can you tell which path is which before you read a signpost?
4. Is the closer camera too close or too far?
5. Does the practice green feel useful after buying gear?
6. Does walking between courses make a run feel longer in a bad way? If so, open question 5 has a shortcut.

## 9. Open questions (each has a default)

| # | Question | Default |
|---|---|---|
| 1 | Should walking into a door open it, or must you also press Enter? | Walking in opens it. Signposts show their card when you stand next to them |
| 2 | Who runs the shops? | No shopkeeper for now, just the room. Decide the characters later (before Milestone 9 art) |
| 3 | How many town layouts? | 3, one per biome. Endless mode reuses them in the region's theme |
| 4 | Walking speed, and is there a run button? | 3 tiles a second; Shift runs at 1.6× |
| 5 | A shortcut for impatient players? | None now. Places are small (a town is crossed in about 5 seconds). Revisit after playtesting |
| 6 | Practice green: a fixed course, or a new small one each visit? | One fixed 8×8 course |
| 7 | Show the armadillo popping out of the ball at the end of a course? | Not in this milestone. It is an art and animation job for Milestone 9 |
| 8 | Does the cache get its own place, or open straight from the crossroads? | Its own small clearing with a chest (section 3.5) |
| 9 | Can you walk back into a town after leaving it? | No. Leaving asks you to confirm, and then you are on your way, as now |
| 10 | Mouse support: click to walk? | Keyboard only for now; mouse later |

## 10. Sign-off

- [ ] Owner sign-off, with any changes, recorded here and in FEATURES.md and DESIGN.md.
