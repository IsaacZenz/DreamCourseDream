# Game design

Status of every item is one of: **Decided** (owner has chosen; do not reopen), **Default** (planner's choice; owner may change it), or listed under [Open questions](#open-questions).

Working title: none yet. The repository name is a placeholder and must not be used as the game's public title, because it is too close to an existing game's name.

## 1. The game in one paragraph

You are a ball. Each course is a small isometric landscape of slopes, ledges, hazards and enemies. You aim, set power and spin, and launch yourself. Hitting enemies defeats them and drops stars. Collect enough stars and the exit opens; roll into it to leave. Between courses you move along a branching map, sometimes finding a shop, and a boss is always getting closer. When you die the run ends, and only your permanent upgrades survive.

## 2. Pillars

| # | Pillar | Status |
|---|---|---|
| 1 | 16-bit SNES-style isometric pixel art. Low internal resolution, limited palette, crisp pixels. | Decided |
| 2 | Everything is built from an asset pack: courses are assembled from tiles and objects, never drawn as one-off pictures. | Decided |
| 3 | Courses and the run map are procedurally generated from rules. | Decided |
| 4 | Golf-style shot mechanics, enemy-granted abilities, obstacles and enemies, in the spirit of 16-bit isometric golf games. All names, characters and art are original. | Decided |
| 5 | A single-player dungeon crawler, not a versus game. | Decided |
| 6 | Function first. Placeholder art until the game plays well; the final look is applied later as a skin. | Decided |

## 3. Platform and technology

| Item | Choice | Status |
|---|---|---|
| Where it runs | Desktop web browser, from a link | Decided |
| Controls | Mouse and keyboard | Decided |
| Language and build | TypeScript, Vite | Default |
| Rendering, input, audio | Phaser (latest stable release, exact version pinned in `package.json`). Used only in `src/render/` and `src/ui/`. | Default |
| Physics | Custom, written for this game in `src/sim/`. Do not use a general physics library; the ball-on-heightfield model below is simpler and deterministic. | Default |
| Tests | Vitest for the simulation and generator; Playwright for screenshots and smoke tests | Default |
| Hosting | GitHub Pages, deployed automatically from `main` | Default |
| Saves | Browser local storage, with a version number in the save data | Default |

**Not locked in.** The simulation, generator and content definitions do not depend on the browser or on Phaser. That keeps three later paths open without committing to any now:

- Wrap the web game as a desktop app (Tauri or Electron) for a store release. No rewrite.
- Add controller or touch input. Input is translated into the same shot commands.
- Move to an engine such as Godot. That would be a rewrite of the code, but the design, content data, tuning values and art would carry over.

## 4. View and world model

- **Decided:** isometric view with real height. Slopes, ledges, and a ball that can leave the ground, fly and bounce.
- **Default:** internal resolution 384×216, scaled up by whole numbers with no smoothing. Tiles are 32×16 pixel diamonds; one height step is 8 pixels.
- **Default:** a course is a grid of tiles. Each tile stores:
  - four corner heights in whole steps (this one rule gives flat tiles, straight slopes and corner slopes),
  - a surface type (see below),
  - an optional object (enemy, hazard, pickup, exit).
- **Default:** within one tile, corners differ by at most one step and opposite corners cannot both be raised. That leaves 13 tile shapes: flat, 4 straight slopes, 4 raised corners, 4 lowered corners. Steeper ground is built from several tiles or a ledge. Non-flat tiles are split into two flat triangles along the diagonal that avoids the odd corner; the art and the physics use the same split.
- **Default:** course files are JSON with one text row per grid row (format described at the top of `src/sim/course.ts`). Empty spots (`.`) are out of bounds.
- Where two neighbouring tile edges differ in height, there is a vertical face. A ball rolling into a higher face bounces off it; a ball rolling off a lower edge becomes airborne.
- The camera follows the ball. The player can pan to look around while aiming.

### Surfaces (starting set; data-driven so more can be added)

| Surface | Effect |
|---|---|
| Grass | Normal roll |
| Rough | High friction |
| Sand | Very high friction, kills bounce |
| Ice | Very low friction |
| Water | Ball sinks: lose health, return to last resting spot |
| Void / out of bounds | Same as water |
| Bumper | Wall that bounces the ball back with extra speed |
| Booster | Pushes the ball in a fixed direction |
| Conveyor | Carries a resting or rolling ball |
| Spring | Launches the ball upward |
| Spikes | Damage on contact |
| Warp pair | Enter one, leave from the other |

## 5. The shot

**Decided:** the shot mechanics follow the genre: direction, power, ground or lofted shot, and spin.

**Default** details, to be tuned in Milestone 2:

- **Aim:** move the mouse around the ball to set direction. A guide line shows the first stretch of the predicted path. Gear can lengthen the guide.
- **Shot type:** toggle between a ground shot (rolls) and a lofted shot (flies, then bounces).
- **Power:** hold the mouse button to charge a meter that sweeps up and down; release to shoot.
- **Spin:** topspin or backspin changes what happens on landing (run forward, stop short, or pull back). Side curve bends the path left or right.
- **Mid-shot:** one key triggers the current ability. One key gives a bounce boost if pressed at the moment of landing.

### Physics model (Default)

- The ball is a point with a radius, a 3D position and a 3D velocity. Ground height under the ball comes from the tile's corner heights.
- Fixed timestep of 1/120 second. Rendering interpolates between steps.
- On the ground: gravity along the slope, friction from the surface, curve from side spin.
- In the air: gravity only. On landing: bounce scaled by the surface, with spin applied.
- The ball is "at rest" when its speed stays under a threshold on a tile it will not roll off.
- Every tuning number (gravity, friction per surface, bounce, power range, spin strength) lives in one tuning file so it can be changed without touching logic.

### As built in Milestone 2 (Default, pending the owner's tuning)

- Physics units are tiles. One height step is half a tile high (`STEP_HEIGHT` in `src/content/tuning.ts`), matching the art's 8-pixel step on a 32×16 tile. A one-step slope across one tile is therefore about 27 degrees.
- Walls are always along grid lines, so a wall hit mirrors the ball's x or y speed, scaled by the wall surface's `wallBounce`. A wall is any step up at a tile edge that the ball is too low to clear.
- Topspin and backspin: on a lofted shot they add or remove speed on the first landing; on a ground shot they push forward or back for a short time after the shot. Side curve turns the ball's path and fades over time. Each has five levels (−2 to +2).
- Bounce boost: press Space while the ball is in the air. It counts only if the ball lands within a short window after the press (0.15 s to start); one press per flight, so mashing does not work.
- The aim guide runs the real simulation. It previews the planned shot from the pull, and keeps showing that plan while the meter charges. It stops after 4 tiles of travel (the "Guide length" stat will scale this from Milestone 3).
- The last resting spot is only updated when the ball rests on a surface that can hold it (not water, boosters and other pads).
- Until Milestone 3, hazard surfaces (booster, conveyor, spring, spikes, warp) behave like grass. Bumpers already bounce the ball back faster, because that is just their wall-bounce number.
- ~~Decided (owner, 2026-11-14): the real game uses the sweeping power meter only.~~ Replaced by the two-phase shot below.
- **Decided (owner, 2026-11-14): the two-phase shot.** (1) **Plan:** pull back like a slingshot to set the direction and a planned power; the aim guide previews that path. The planned power is a preview only. (2) **Charge:** hold to charge the meter, which goes up, down, up, down (`meterCycles` 2). Release to shoot; the meter alone sets the real power, and the perfect shot still comes from the top of the meter. The meter shows the planned power as a white mark. If the player has not released when the second down sweep reaches the bottom, the ball launches on its own at 5% power (`autoLaunchPower` 0.05). Right-click or Esc drops the plan. Default (not chosen by the owner, easy to change): the charge is press-and-hold, release to shoot. Quick shot (P key, the pull fires straight away) stays as a testing aid only.
- **Decided (owner, 2026-11-14):** shot speed across the whole bar is 20% above the first tuning (ground top 13.2, lofted top 12 tiles per second). A **perfect shot**, released in the top 2% of the bar (`perfectWindow` 0.02, owner round 2), launches 35% faster than the first tuning's top, which is 12.5% above the new top (`perfectBonus` 1.125). The meter shows the perfect zone at its top and the game says "PERFECT!".
- **Decided (owner, 2026-11-14, tuning round 2):** meter sweep takes 1.5 s (`meterPeriod`); bumpers keep all their falling speed on a bounce (`surfaces.bumper.bounce` 1).
- **Decided (owner, 2026-11-14, tuning round 3):** the ball is 10% bouncier on every surface (gravity unchanged): grass 0.495, rough 0.33, sand 0.055, ice 0.55. Bumper bounce stays at 1, because above 1 the ball would gain height on every bounce.

## 6. Shots and health

**Decided:** these are two separate pools, and both can be upgraded.

- **Shots:** each shot costs one. At zero you must spend a turn recovering. Enemies get an extra turn while you recover, then your shots refill.
- **Health:** lost to enemy attacks and hazards. At zero the run ends.

**Default:** recovering refills shots to full. Falling in water or out of bounds costs 1 health and returns the ball to its last resting spot.

## 7. Course objective

**Decided:**

- Each course has a star quota shown as a meter that fills.
- Defeating enemies gives yellow stars.
- A course contains more enemies than the quota needs. Extra enemies are extra risk for extra stars.
- When the meter is full, the exit opens. The player leaves by getting the ball into it.

**Default:** the exit's position is visible from the start, shown closed.

## 8. Enemies

**Decided:** two families.

### Patrollers

- Move back and forth along a fixed path at all times, including while the player is aiming.
- They are the moving-obstacle part of mini-golf: timing matters.
- Touching one has an effect defined per type (for example damage, a knock-back, or a shock that ends the shot).

### Sentinels

- Stand still and do nothing until triggered. Then they act on enemy turns.
- **Decided:** three triggers.
  1. **Hit:** the ball strikes it.
  2. **Rest:** the ball comes to rest inside its outer radius.
  3. **Pass-by:** the ball rolls or flies through its inner radius, which is smaller than the outer one.
- **Decided:** each sentinel type declares, per trigger, whether it **reacts immediately** (acts the moment it is triggered, even mid-shot) or is only **activated** (starts acting from the next enemy turn).

Each enemy type is a definition file entry: family, health, star value, radii, trigger responses, attack pattern, ability it grants (if any), and its difficulty cost for the generator.

### Turn order (Default)

1. **Aim.** Patrollers keep moving. Sentinels wait.
2. **Shot.** The simulation runs until the ball rests. Hit and pass-by triggers fire as they happen.
3. **Rest check.** Rest triggers fire.
4. **Enemy turn.** Every activated sentinel takes one action.
5. If the player has no shots, they recover and step 4 runs again. Otherwise back to step 1.

### Bosses

**Decided:** bosses exist and are fought on the run map (see section 10).

**Decided:** a boss is mainly a large health bar with phases whose attack pattern changes as it loses health. Some bosses, not all, add a weak-point puzzle. See `docs/FEATURES.md` section 5.

## 9. Abilities and gear

**Decided:** one ability slot plus gear slots.

- **Abilities:** defeating an ability-carrying enemy gives you its ability, replacing the one you hold. It is triggered with a key during a shot.
- **Gear:** passive items in three categories: weapon, armour, accessory. The ball holds one of each. Rolling over gear of a held category swaps it automatically. Gear never needs a button; weapon effects trigger only on contact with an enemy.
- **Run upgrades:** plain stackable stat boosts, separate from gear, with no slot limit.

Full detail for gear, run upgrades, damage, enemy tiers, statuses, shops and permanent upgrades is in `docs/FEATURES.md`.

**Default:** an ability lasts until replaced or until its uses run out.

### Starting ability archetypes (Default; all names are original working names)

| Working name | What it does |
|---|---|
| Anchor | Drops straight down and stops dead; breaks cracked tiles |
| Burner | Burst of speed in a straight line; passes through weak enemies |
| Burr | Sticks to whatever it touches, including slopes |
| Kite | Slows the fall for a long glide |
| Hop | An extra jump in mid-shot |
| Frost | Freezes water under the ball so it can cross |
| Static | Damaging field around the ball for a short time |
| Gyre | The ball can be steered left and right for a few seconds |
| Drift | Brief free flight in any direction |

Milestone 4 builds three of these. The rest come in Milestone 8.

Gear examples are in `docs/FEATURES.md` section 8.

## 10. The run

**Decided:**

- The run is a branching map of nodes. The player picks a path.
- Node types are randomised. A shop is not guaranteed between courses. Sometimes the only choice is another course.
- **Boss countdown:** a counter (for example "5 until boss") drops by one each time the player completes a node without fighting the boss. The player may fight the boss early when a boss node is offered. At zero the boss is forced.
- **Yellow stars** are common. They fill the exit meter and are also spent in shops on upgrades that last for the current run.
- **Blue stars** are rare. They are spent on permanent upgrades.
- On death the run restarts. Permanent upgrades are kept. Everything else is lost: yellow stars, ability, gear, run upgrades, map position.

**Default:**

- Node types: Course, Hard course (tougher, better reward, a blue star chance), Shop, Cache (free gear or healing), Boss.
- Beating a boss gives blue stars, heals the player, and starts the next region with a harder generator budget and a new biome.
- Fighting the boss early gives a bonus that scales with the countdown remaining.
- Blue stars come from bosses, hard courses, and rare hidden spots on normal courses.
- Blue stars earned during a run are kept even if the run ends in death.
- Permanent upgrades are bought on a hub screen between runs: maximum health, maximum shots, gear slots, starting yellow stars, shop discount, a starting ability.

## 11. Procedural generation

**Decided:** courses and the run map are generated from rules.

**Default approach:**

- **Course format first.** A course is a data file (grid, tiles, objects, quota, exit). The hand-built test courses and the generator's output use the same format. The game never knows which one it is loading.
- **Built from chunks.** The generator joins small hand-designed pieces (a ramp, a bowl, a bridge, a pit with an island) on a grid, then adjusts heights and surfaces. Pure noise terrain makes poor golf holes; chunks keep every piece playable while the combinations stay varied.
- **Difficulty budget.** Each course gets a budget from its position in the run. Enemies and hazards each have a cost. The generator spends the budget.
- **Biomes.** A biome is a data entry: tile skin, which surfaces and enemies may appear, and the chunk set.
- **Seeded.** A run has one seed. Every course and the map come from it. The same seed gives the same run. Show the seed on screen so a bug or a great course can be reproduced.
- **Validated.** Every course is checked before use:
  1. Structure: the start, the exit, and enough enemies to meet the quota are all reachable.
  2. Play: a bot plays the course in the simulation without display and must meet the quota and reach the exit within a shot limit. Courses that fail are thrown away and regenerated.

The bot does not need to be clever. It tries many shots in the simulation and keeps the best one each turn.

## 12. Art and audio

- **Decided:** placeholder art first; the real look comes later.
- **Default:** placeholder tiles and sprites are generated by a script as simple shaded shapes at the correct sizes, so the final art can replace them file for file.
- **Default:** an asset manifest maps each sprite ID to a file, frame size and anchor point. Game code only uses IDs.
- **Default:** sound is added in Milestone 9. Until then the game is silent apart from simple generated blips.

## 13. Out of scope for now

Listed so nobody builds them early. Each has a path open (section 3).

- Seamless open world
- Multiplayer of any kind
- Controller and touch controls
- Store release, accounts, online leaderboards
- A level editor with its own interface (the course data format is editable by hand)

## Open questions

Opus: use the default and say that you did. The owner can change any of these at any time.

| # | Question | Default until answered |
|---|---|---|
| 1 | Boss countdown length, and whether it varies by region | 5, same for every region, stored as a tuning number |
| 2 | Reward for fighting the boss early | +1 blue star per countdown step remaining |
| 3 | Does recovering refill all shots or only some? | All |
| 4 | ~~Power input: sweeping meter, or drag distance?~~ | Answered 2026-11-14: sweeping meter (see section 5) |
| 5 | How many uses does an ability have? | Unlimited uses, one per shot, until replaced |
| 6 | Can gear be sold? | No. Swapping is covered in FEATURES.md section 8 |
| 7 | Is there healing outside shops and caches? | Bosses heal fully; nothing else |
| 8 | Does the run have an end, or go until death? | Three regions and a final boss, then an endless mode unlocks |
| 9 | Theme, setting, main character and the game's name | Undecided; needed before Milestone 9 |
| 10 | Do patrollers hurt, or only block and deflect? | Per type; the first patroller built deals 1 damage and knocks the ball back |
