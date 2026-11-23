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
| 5 | A single-player dungeon crawler, not a versus game. **Owner, 2026-11-15:** each course is a journey the hero takes, a character on a mission travelling through a landscape. It should feel like a dungeon crawl, not a golf hole; the mechanics just happen to be golf-like. | Decided |
| 6 | Function first. Placeholder art until the game plays well; the final look is applied later as a skin. | Decided |

**Decided (owner, 2026-11-14): keep it easy to fine-tune and to extend.** As the game grows, small number changes (speeds, delays, damage, radii) must stay a one-line data edit, and new enemies, obstacles and abilities must be addable as data entries plus a placeholder sprite, with no rewrites. In practice: every number lives in `src/content/` (physics feel in `tuning.ts`, also live in the U panel); enemies, obstacles and pickups in `objects.ts`; abilities in `abilities.ts`; statuses in `statuses.ts`. A new thing that reuses an existing behaviour needs no logic changes (tested by a test-only enemy in `tests/enemies.test.ts`); a truly new kind of behaviour needs code once. The test bench (course 5) tries any of them alone.

## 3. Platform and technology

| Item | Choice | Status |
|---|---|---|
| Where it runs | Desktop web browser, from a link | Decided |
| Controls | Mouse and keyboard. **Every mechanic must be playable from the keyboard alone; the mouse is optional** (owner, 2026-11-14). Keyboard layout in `docs/plans/milestone-4.md` section 4b | Decided |
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
- **Default:** internal resolution 384×216, scaled up by whole numbers with no smoothing. Tiles are 32×16 pixel diamonds; one height step is 8 pixels. **Decided (owner, 2026-11-15): the height step is halved** (4 pixels, a quarter of a tile), so a slope tile is about 14° instead of 27° and long gentle hills are possible. Being built in Milestone 5b (`docs/plans/milestone-5b.md`).
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
| Water | See-through; slows the ball a lot. The ball can roll or bounce out. Only if it **stops** in water does it sink: lose health, return to last resting spot. Water tiles may be sloped. |
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
- **Decided (owner, 2026-11-15):** spin and curve go back to none at the start of each turn (the shot type, ground or lofted, stays as chosen).
- **Mid-shot:** one key triggers the current ability. One key gives a bounce boost if pressed at the moment of landing.

### Physics model (Default)

- The ball is a point with a radius, a 3D position and a 3D velocity. Ground height under the ball comes from the tile's corner heights.
- Fixed timestep of 1/120 second. Rendering interpolates between steps.
- On the ground: gravity along the slope, friction from the surface, curve from side spin.
- In the air: gravity only. On landing: bounce scaled by the surface, with spin applied.
- The ball is "at rest" when its speed stays under a threshold on a tile it will not roll off.
- Every tuning number (gravity, friction per surface, bounce, power range, spin strength) lives in one tuning file so it can be changed without touching logic.

### As built in Milestone 2 (signed off by the owner, 2026-11-14)

The final tuning values are the defaults in `src/content/tuning.ts` as merged with Milestone 2. The owner's decisions are marked below.

- Physics units are tiles. One height step is half a tile high (`STEP_HEIGHT` in `src/content/tuning.ts`), matching the art's 8-pixel step on a 32×16 tile. A one-step slope across one tile is therefore about 27 degrees.
- Walls are always along grid lines, so a wall hit mirrors the ball's x or y speed, scaled by the wall surface's `wallBounce`. A wall is any step up at a tile edge that the ball is too low to clear.
- Topspin and backspin: on a lofted shot they add or remove speed on the first landing; on a ground shot they push forward or back for a short time after the shot. Side curve turns the ball's path and fades over time. Each has five levels (−2 to +2).
- Bounce boost: press Space while the ball is in the air. It counts only if the ball lands within a short window after the press (0.15 s to start); one press per flight, so mashing does not work.
- The aim guide runs the real simulation. It previews the planned shot from the pull, and keeps showing that plan while the meter charges. It stops after 4 tiles of travel (the "Guide length" stat will scale this from Milestone 3).
- **Trapped rest (2026-11-18, fixing a freeze the owner found):** a ball on the ground that stays within 0.05 tiles of one spot for 0.5 s also counts as resting (`trapRadius`, `trapTime`, in the U panel). Before this, a ball at the bottom of a small pit, where four slopes meet, rocked there until the 30-second shot limit, and did the same on every later shot from that spot.
- The last resting spot is only updated when the ball rests on a surface that can hold it (not water, boosters and other pads).
- ~~Until Milestone 3, hazard surfaces behave like grass.~~ Hazard tiles work from Milestone 3; see section 7, "As built in Milestone 3".
- **Decided (owner, 2026-11-14):** the arrow tiles (booster, and conveyor) must push **hard**. A ball rolling over a booster should clearly speed up in the arrow's direction, enough to change where the shot ends, not a gentle nudge. Built in Milestone 3, with the push strength as a tuning number so the owner can set it with the panel.
- ~~Decided (owner, 2026-11-14): the real game uses the sweeping power meter only.~~ Replaced by the two-phase shot below.
- **Decided (owner, 2026-11-14): the two-phase shot.** (1) **Plan:** pull back like a slingshot to set the direction and a planned power; the aim guide previews that path. The planned power is a preview only. (2) **Charge:** hold to charge the meter, which goes up, down, up, down (`meterCycles` 2). Release to shoot; the meter alone sets the real power, and the perfect shot still comes from the top of the meter. The meter shows the planned power as a white mark. If the player has not released when the second down sweep reaches the bottom, the ball launches on its own at 10% power (`autoLaunchPower` 0.1; was 5%, raised in owner tuning round 4). Right-click or Esc drops the plan. Default (not chosen by the owner, easy to change): the charge is press-and-hold, release to shoot. Quick shot (P key, the pull fires straight away) stays as a testing aid only.
- **Decided (owner, 2026-11-14):** shot speed across the whole bar is 20% above the first tuning (ground top 13.2, lofted top 12 tiles per second). A **perfect shot**, released in the top 2% of the bar (`perfectWindow` 0.02, owner round 2), launches 35% faster than the first tuning's top, which is 12.5% above the new top (`perfectBonus` 1.125). The meter shows the perfect zone at its top and the game says "PERFECT!".
- **Decided (owner, 2026-11-14, tuning round 2):** meter sweep takes 1.5 s (`meterPeriod`); bumpers keep all their falling speed on a bounce (`surfaces.bumper.bounce` 1).
- **Decided (owner, 2026-11-14, tuning round 3):** the ball is 10% bouncier on every surface (gravity unchanged): grass 0.495, rough 0.33, sand 0.055, ice 0.55. Bumper bounce stays at 1, because above 1 the ball would gain height on every bounce.
- **Decided (owner, 2026-11-15): water, replacing the 2026-11-14 rule below.** A ball that comes to rest in water is **not** sent back. It stays where it stopped, under the water, and takes 1 damage. **Skipping:** a fast, low ball can skip off the surface, and the bounce-boost key helps. Details and numbers in `docs/plans/milestone-5b.md`.
- ~~**Decided (owner, 2026-11-14): water.**~~ Replaced on 2026-11-15 (above). The ball only resets if it comes to rest (or the shot times out) in water. Passing through, it is slowed hard (`surfaces.water`: friction 0.4, drag 2.5 per second, bounce 0.2, landing grip 0.5; Default values, tune with the panel). With enough speed or bounce it can escape: rolling across, up a slope in the water, or bouncing off it. Water is drawn see-through, with the ball visible inside it. Water tiles may now be sloped (it was flat-only).

## 6. Shots and health

**Decided:** these are two separate pools, and both can be upgraded.

- **Shots:** each shot costs one. At zero you must spend a turn recovering. Enemies get an extra turn while you recover, then your shots refill.
- ~~**Decided (owner, 2026-11-15):** defeating an enemy gives back 1 shot.~~ Replaced the same day by:
- **Decided (owner, 2026-11-15):** every hit that does damage to an enemy gives back 1 shot (one per enemy hit, also when several are hit in one shot). Shots never go above the shot allowance (the max shots stat).
- **Decided (owner, 2026-11-15): two naps per course.** The recover turn is called a nap. Running out of shots the first and second time gives a nap (enemies act once more, shots refill). Running out a third time fails the course. Numbers in `src/content/rules.ts` (`naps`, `shotsPerHit`).
- **Decided (owner, 2026-11-15): upgrades keep up with difficulty.** Big, high-budget courses can need more shots than a fresh character has. That is intended for now: as the hero progresses through a run they get upgrades (more shots, more damage and so on; Milestones 6 and 7) that let them keep up with the scaling. Until then, high-budget generated courses are hard to generate and slow (see PLAN.md progress log).
- **Health:** lost to enemy attacks and hazards. At zero the run ends.

**Decided (owner, 2026-11-15):** falling off the edge also loses the ability you hold. Nothing else is lost (stars, gear, shots and naps stay).

**Default:** recovering (a nap) refills shots to full. Falling in water or out of bounds costs 1 health and returns the ball to its last resting spot.

## 7. Course objective

**Decided:**

- Each course has a star quota shown as a meter that fills.
- Defeating enemies gives yellow stars.
- A course contains more enemies than the quota needs. Extra enemies are extra risk for extra stars.
- When the meter is full, the exit opens. The player leaves by getting the ball into it.

**Default:** the exit's position is visible from the start, shown closed.

### As built in Milestone 3 (Default unless marked; waiting for the owner to play)

- **Exit:** an open exit catches the ball when it rolls within 0.4 tiles of the hole's centre at under 7 tiles per second (`exitRadius`, `exitMaxSpeed`). Faster, it rolls over the hole, like a golf ball lipping out. A closed exit is just ground.
- **Hazard tiles** act on a ball touching the ground on them, not one flying over:
  - Booster: the ball is brought up to at least 9 tiles per second along the arrow at once, then pushed harder still (`boosterMinSpeed` 9, `boosterAccel` 45). This follows the owner's "push hard" decision; tune with the panel.
  - Conveyor: pulls the ball's speed along the arrow towards 4 tiles per second (`conveyorSpeed`, `conveyorGrip`). It also slows a ball rolling against it.
  - Spring: throws the ball up at 9 tiles per second (`springLaunch`), keeping its sideways speed.
  - Spikes: 1 damage (`src/content/rules.ts`).
  - Warp: the ball comes out of the paired warp at the same spot in the tile, with the same speed. It must leave that tile before a warp can fire again.
- ~~**Damage once per shot** (FEATURES.md section 2) also covers sinking: if spikes already hurt the ball this shot, stopping in water does not cost a second health.~~ Replaced from Milestone 4 (owner, 2026-11-14) by 0.5 s immunity after any damage; see FEATURES.md section 2.
- **Blockers** (rock, post, low wall) stand on their tile. The ball bounces off their sides. A ball that comes down on top is thrown back up and off the side: nothing can rest on a blocker. A lofted shot that is higher than the blocker passes over it (the low wall is a quarter of a tile high).
- ~~**Stars from enemies** land a short way off (1.1 to 1.9 tiles, at a random angle from the seed) on ground that can hold the ball, so the player sometimes has to go and fetch them. With the starting star reach of 1 tile, a ball rolling through often picks them up anyway.~~ Replaced from Milestone 4 (owner, 2026-11-14): an enemy's star counts the moment it is defeated and is shown above its flag pole; see FEATURES.md section 6.
- **Hearts and shot orbs** are left on the ground when health or shots are already full, so they are not wasted.
- **Restart (R)** replays the same course with the same seed. A new seed is picked when the page loads, or set it with `?seed=` in the address.

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
- **Gear:** passive items in three categories: weapon, armour, bauble. The ball holds one of each. Rolling over gear of a held category swaps it automatically. Gear never needs a button; weapon effects trigger only on contact with an enemy.
- **Run upgrades:** plain stackable stat boosts, separate from gear, with no slot limit.
- **Decided (owner, 2026-11-17): success rolls.** A weapon's special effect only works if a spinning wheel lands on a filled slice: 10 slices, more filled on better weapons, one more per level of the permanent upgrade Knack, extra for one course from an acorn consumable. Against a boss the wheel has 20 slices. See FEATURES.md section 8.

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
| Tornado | The ball becomes a fast, weaving whirlwind for a moment; cannot fall while active; 1 damage to enemies it spirals into (owner, 2026-11-14) |

Milestone 4 builds four of these: Anchor, Burner, Hop and Tornado (owner added Tornado, 2026-11-14). The rest come in Milestone 8.

Gear examples are in `docs/FEATURES.md` section 8.

## 10. The run

**Decided:**

- **Owner, 2026-11-19: in the finished game the map shows only the next choice.** The player sees the path already taken and the 1 to 3 nodes they can go to next, nothing further ahead. The boss countdown is still shown. For testing, the whole map stays visible: a testing switch in the U panel, on in test builds. Built in Milestone 8 round 3.

- **Owner, 2026-11-21: walkable towns and crossroads (direction decided; details to plan).** Between courses, the player walks the armadillo around a small isometric area, zoomed in much closer than a course, with the keyboard (W A S D or the arrow keys). Two places work like this: the **town** (walk up to the shop and the Burrow) and the **crossroads** where the next course is chosen (each of the 1 to 3 next nodes is a path or doorway you walk into). Entering the Burrow or the shop shows a flat 2D illustrated screen, not isometric. The courses themselves stay pure golf. These areas use the game's own 16-bit pixel style; the owner's reference pictures (2026-11-21) were for the feel only (close camera, props everywhere, an RPG-like place), not to copy. **Signed off (owner, 2026-11-21), all defaults:** design sheet `docs/plans/milestone-8b.md`. Up on the keyboard is up on the screen; 3 tiles a second, Shift runs; ~~walking into a door opens it~~ (owner, 2026-11-22: everything in a walkable place is used with Enter while standing at it: shop and Burrow doors, the practice tee, the town exit, the cache chest, the crossroads path ends and the boss gate); camera zoom 2 (owner, 2026-11-21 and 22: 1.5, then 1.25); three town layouts (one per biome) with a food hut, the gear shop, the Burrow and a practice green (nothing counts there); the crossroads replaces the map screen in the run (signposts show what each path leads to; the map stays as a testing view on M); a boss gate plays the introduction card and asks before the fight; the cache is a clearing with a chest; the Burrow and shops are flat room pictures with today's menus; no shopkeepers yet; keyboard only for now.
- **Decided (owner, 2026-11-21): ground bumps.** For looks only, each flat grass, rough or sand tile is drawn raised by 0, 1 or 2 pixels (45 / 35 / 20 in 100), picked from its spot, on courses and in walkable places. Slopes are never raised, so they still read as smooth. Whatever stands on a raised tile (ball, armadillo, enemies, props) is drawn raised with it. The physics, the bot and the course check never see it. Numbers in `GROUND_BUMPS` (`src/content/scenery.ts`); a U-panel switch turns it off. The owner chose this over per-tile shading after comparing renders.

- The run is a branching map of nodes. The player picks a path.
- Node types are randomised. A shop is not guaranteed between courses. Sometimes the only choice is another course.
- **Decided (owner, 2026-11-15):** the countdown starts at **7**, and the player always gets at least one optional town right before the forced boss (a "last town"), on top of any towns on the way. An early boss may still be offered.
- **Boss countdown:** a counter (for example "5 until boss") drops by one each time the player completes a node without fighting the boss. **Owner, 2026-11-15: shops do not count**; courses, hard courses and caches do. The player may fight the boss early when a boss node is offered. At zero the boss is forced.
- **Yellow stars** are common. They fill the exit meter and are also spent in shops on upgrades that last for the current run.
- **Blue stars** are rare. They are spent on permanent upgrades.
- On death the run restarts. Permanent upgrades are kept. Everything else is lost: yellow stars, ability, gear, run upgrades, map position. **Owner, 2026-11-15:** gear stored in the Burrow is kept.
- **Decided (owner, 2026-11-15): towns and the Burrow.** A shop node is a little town with the shop and the player's Burrow (home base, one stored gear item per category, safe from death). See FEATURES.md section 11. **Planned for Milestone 7:** a town is the save point for a run in progress, so the player can stop at a town and carry on another day.

**Default:**

- Node types: Course, Hard course (tougher, better reward; owner, 2026-11-17: 2 blue stars), Shop, Cache (free gear or healing), Boss.
- Beating a boss gives blue stars, heals the player, and starts the next region with a harder generator budget and a new biome.
- Fighting the boss early gives a bonus that scales with the countdown remaining.
- ~~Blue stars come from bosses, hard courses, and rare hidden spots on normal courses.~~
- **Decided (owner, 2026-11-15): blue star sources:** beating a course, beating a boss, and an extra-rare chance inside crates or under cracked ground. **Owner, 2026-11-17:** course 1, hard course 2, boss 5 (region 1) and 8 (region 2), crates 2%, secured crates and cracked tiles 5% (times drop luck). Details in `docs/plans/milestone-7.md` section 4.
- **Decided (owner, 2026-11-17): closing the game outside a town loses the run and everything collected in it, carried blue stars included.** Closing in a town keeps the run.
- **Decided (owner, 2026-11-17): difficulty scales in two separate ways in every region:** courses get bigger (more and larger areas), and opponents get harder (more threat budget, and tougher enemies through region modifiers). The cap of 30 is lifted for later regions. Numbers in `docs/plans/milestone-7.md` section 7.4. **Owner, 2026-11-18:** the bot that checks a course (also when courses are made in the background) always plays at full health, whatever the player's health is now; this is intentional. **Owner, 2026-11-18, relaxed check (a roguelike: failing is expected):** the bot plays with the region's "par" kit, not the player's gear and upgrades; it only has to finish with 1 health (was 2); and it gets 1.5 times the shot limit. The check proves a course can be beaten, not that it is comfortable for the player as they are. Region two's threat is capped at 36 (**owner, 2026-11-21:** region two is 3 to 5 areas and region three 4 to 6, both growing by one area every 3 nodes instead of 2, with slightly smaller areas; region one is unchanged; numbers in FEATURES.md), and the next courses are made in the background while the player is on the map, in a town or playing a course.
- **Decided (owner, 2026-11-17): each region's boss comes from a boss randomizer** (a seeded pick from that region's boss pool). Until Milestone 8 adds bosses, every pool holds only The Warden.
- ~~Blue stars earned during a run are kept even if the run ends in death.~~ **Decided (owner, 2026-11-17): the blue star deposit.** Blue stars found on a run are carried, and go into the player's stash only when deposited, automatically, on reaching a town or beating a boss. Carried blue stars are lost on death or when the game is closed outside a town.
- **Decided (owner, 2026-11-17): one home, the Burrow.** The hub screen between runs and the Burrow in towns are the same place: stored gear, the blue star stash, permanent upgrades and starting abilities. Permanent upgrades are bought there, between runs or (owner, 2026-11-17) in a town's Burrow mid-run, where they work at once: maximum health, maximum shots, gear slots, starting yellow stars, shop discount, a starting ability.

## 11. Procedural generation

**Decided:** courses and the run map are generated from rules.

**Default approach:**

- **Course format first.** A course is a data file (grid, tiles, objects, quota, exit). The hand-built test courses and the generator's output use the same format. The game never knows which one it is loading.
- **Decided (owner, 2026-11-15): a course is a journey.** The generator builds one solid landmass the hero travels across, area by area, towards the exit, with much more slope and open ground and much larger maps at higher budgets. Rails line some edges; many edges are bare drops. Plan in `docs/plans/milestone-5b.md`. The chunk approach below was built in Milestone 5 and is being replaced.
- ~~**Built from chunks.**~~ (Milestone 5; being replaced.) The generator joins small hand-designed pieces (a ramp, a bowl, a bridge, a pit with an island) on a grid, then adjusts heights and surfaces. Pure noise terrain makes poor golf holes; chunks keep every piece playable while the combinations stay varied.
- **Difficulty budget.** Each course gets a budget from its position in the run. Enemies and hazards each have a cost. The generator spends the budget.
- **Biomes.** A biome is a data entry: tile skin, which surfaces and enemies may appear, and the chunk set.
- **Seeded.** A run has one seed. Every course and the map come from it. The same seed gives the same run. Show the seed on screen so a bug or a great course can be reproduced.
- **Validated.** Every course is checked before use:
  1. Structure: the start, the exit, and enough enemies to meet the quota are all reachable.
  2. Play: a bot plays the course in the simulation without display and must meet the quota and reach the exit within a shot limit. Courses that fail are thrown away and regenerated.

The bot does not need to be clever. It tries many shots in the simulation and keeps the best one each turn.

## 12. Art and audio

- **Decided:** placeholder art first; the real look comes later.
- **Decided (owner, 2026-11-15):** grass uses a two-tone checkerboard (our own colours), so the shape of every slope is easy to read.
- **Default:** placeholder tiles and sprites are generated by a script as simple shaded shapes at the correct sizes, so the final art can replace them file for file.
- **Default:** an asset manifest maps each sprite ID to a file, frame size and anchor point. Game code only uses IDs.
- **Default:** sound is added in Milestone 9. Until then the game is silent apart from simple generated blips.
- **Decided (owner, 2026-11-14): visual themes change with progress.** After each boss is beaten, the look of the courses changes to a new theme, for example day, night, jungle, underground, spooky. Obstacles, enemies and surfaces behave exactly the same in every theme; only the art changes. Once the real texture pack exists, each larger advancement gets several variants of its theme. Built as alternative sprite sets in the asset manifest (a theme picks which set an id resolves to), so no game logic changes per theme. **Built in Milestone 8 round 2b (owner, 2026-11-21):** day (region 1), bog (2), thornwood (3), then night, underground and spooky in endless mode, then again from bog. Placeholder themes recolour the ground, scenery and blockers; enemies, the ball and the HUD look the same. **Owner, 2026-11-21 (after round 2b):** endless mode always starts with its own dedicated theme; after that each endless region picks a theme at random (repeats are fine). Also planned for Milestone 9: lighting (fireflies, ground lights, tall lights on poles or in trees), dynamic shadows from those lights, and a settings menu to turn them off for performance.
- **Decided (owner, 2026-11-23): the owner designs the art.** The owner draws every item freehand in a sketchbook and sends a photo from the Claude app on the phone, with the item's permanent code from `art/ART-LIST.md`. Claude renders the drawing down to pixels (for small items, two or three versions to pick from), and the Pixel Press tool applies one style: a fixed palette of 10 colour ramps, light from the top left, no blurry edges, and theme versions by swapping colour ramps. **Owner, 2026-11-23: the house style is "B2"**, picked from the style lab: round, chunky, cute shapes, 3 bright shades, a dark ink outline with ink lines where parts overlap, big eyes with a shine, blush, plus a little extra light (a cool blue rim light, shine spots, soft grass, dotted shadows). Details in `art/STYLE.md`. **Owner, 2026-11-23:** Rollo (and Thud and Pip) grow from 14×20 to 18×24 pixels, for the face's sake; everything else keeps today's size (`art/targets.json`). Display only: the ball's physics size does not change. Sprites may grow beyond the placeholder size. Full sheet: `docs/plans/art-pipeline.md`; style rules: `art/STYLE.md`.
- **Decided (owner, 2026-11-14):** most actions should have an animation and a sound effect: shots, hits, defeats, flags going up and down, pickups, ability use, damage, enemy actions. Planned for Milestone 9; until then placeholders. The Wild pickup gets a flashy slot-machine wheel. Keep this in mind when building: every action the simulation reports goes out as an event the display can animate and play a sound for.

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
| 1 | Boss countdown length, and whether it varies by region | **Answered (owner, 2026-11-15): 7**, same for every region, stored as a tuning number. The boss may still be offered earlier. Before the forced boss there is always an optional last town |
| 2 | Reward for fighting the boss early | **Answered (owner, 2026-11-22): default kept.** +1 blue star per countdown step remaining |
| 3 | Does recovering refill all shots or only some? | **Answered (owner, 2026-11-22): default kept.** All |
| 4 | ~~Power input: sweeping meter, or drag distance?~~ | Answered 2026-11-14: sweeping meter (see section 5) |
| 5 | How many uses does an ability have? | **Answered (owner, 2026-11-22): default kept.** Unlimited uses, one per shot, until replaced |
| 6 | Can gear be sold? | **Answered (owner, 2026-11-22): default kept.** No. Swapping is covered in FEATURES.md section 8 |
| 7 | Is there healing outside shops and caches? (Owner, 2026-11-15: default kept) | **Answered (owner, 2026-11-22): default kept.** Bosses heal fully; nothing else |
| 8 | Does the run have an end, or go until death? | **Answered (owner, 2026-11-18):** three regions and a final boss, then the run carries on into **endless mode**: each new region scales the same way (size, threat, toughness), and each region's boss comes from the boss randomizer. Course size caps at region 3's size; everything else keeps growing. Details in `docs/plans/milestone-8.md` section 10a |
| 9 | Theme, setting, main character and the game's name | **Partly answered (owner, 2026-11-15), planning only:** the hero is an **armadillo** who stands on two legs, rolls up into a ball when launched, and pops back out when the ball stops. ~~Villains share one theme, not yet chosen: either reptiles and amphibians with an alligator as the main villain, or insects.~~ **Owner, 2026-11-18: the villains are insects.** Every enemy is a bug (names in `docs/plans/milestone-8.md` section 7.0); the leader is the final boss, still being chosen. Name and setting still undecided; all needed before Milestone 9 |
| 10 | Do patrollers hurt, or only block and deflect? | **Answered (owner, 2026-11-22): default kept.** Per type; the first patroller built deals 1 damage and knocks the ball back |
