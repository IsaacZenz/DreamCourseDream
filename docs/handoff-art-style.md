# Handoff: art style, everything mapped out so far (2026-11-26)

This is a self-contained summary for someone (a person or another AI chat) helping with the art of this game. It collects every art decision from the project's docs in one place.

Each item is tagged:

- **Decided:** the owner chose it; don't reopen it.
- **Default:** the current working choice; the owner may change it.
- **Proposed:** written in the Milestone 9 design sheet (`docs/plans/milestone-9.md`), which is **not signed off yet**.

## 1. The game in one line

An original browser game: an isometric mini-golf roguelike with 16-bit SNES-style pixel art. **The player is the ball:** an armadillo who curls up and is launched across procedurally generated courses, fighting insects. It's a dungeon crawl that happens to use golf mechanics. Built in TypeScript with Phaser 4.

## 2. Hard rules (must not be broken)

1. **Original content only.** It borrows genre mechanics from 16-bit isometric golf games, but no existing game's names, characters, sprites, music, sound effects, level layouts or UI art. Don't copy, trace or rip assets. Reference pictures are for feel only.
2. **Third-party assets** only with a licence that allows commercial use, recorded in `assets/LICENSES.md`. That table is empty today: every asset so far is made for the project.
3. **Art is swappable.** Game code refers to sprites only by ID through the asset manifest (`assets/manifest.json`). No file paths or colours for game objects in logic code. Replacing art must never touch the game rules or the course generator.
4. **Themes change art only.** Everything behaves the same in every theme.

## 3. Technical frame

| Thing | Value | Status |
|---|---|---|
| Internal resolution | 384×216, scaled up by whole numbers, no smoothing | Default |
| Tile | 32×16-pixel diamond (isometric, 2:1) | Default |
| Height step | 4 pixels (a quarter of a tile); halved from 8 by the owner so slopes are gentle (about 14°) | Decided |
| Tile shapes | 13: flat, 4 straight slopes, 4 raised corners, 4 lowered corners. A sloped tile is two flat triangles split along the diagonal that avoids the odd corner; art and physics use the same split | Default |
| Vertical faces | Drawn where neighbouring tiles differ in height (left and right faces per material: earth, sand, ice, bumper, metal, wood) | Built |
| Colour | 15-bit colour (5 bits per channel), like the SNES | Default |
| Light direction | from the upper left on every sprite | Proposed |
| Palette per sprite | at most 15 colours plus see-through | Proposed |
| Outlines | dark outline on characters, enemies and pickups; none on ground tiles | Proposed |
| Walking camera | towns and the crossroads drawn zoomed in at 1.25×, as one scaled picture so tiles have no seams | Decided |

### 3.1 How the manifest works

- Each sprite ID maps to a PNG sprite sheet with `frameWidth`, `frameHeight`, named `frames` (in sheet order, left to right) and an `anchor` pixel (the point placed on the object's world position, usually its feet).
- **Themes:** a sprite `"<id>@<theme>"` is that sprite in that theme. If it doesn't exist, the plain `"<id>"` is used. Each theme also has a sky (background) colour.
- **Tints:** element tints used today: fire `#ff9060`, ice `#a0d8ff`, shock `#fff070`.
- Today about 475 sprite IDs exist, all made by a placeholder art script (`npm run art`, `tools/make-placeholder-art.ts`) as simple shaded shapes at the correct sizes. Final art replaces them **file for file at the same size**.

### 3.2 Sizes of today's sprites (frame width × height, pixels)

Final art should keep these sizes so the physics and draw order still line up. If a size has to change, the manifest changes with it.

| Sprite | Size | Frames today |
|---|---|---|
| Ball (Rollo, Thud, Pip) | 8×8 | idle |
| Ground tile | 32×24 | one frame per tile shape, plus a checkerboard "b" set |
| Snoozegrub, Mudroller | 18×16 | idle |
| Skitter Ant | 16×12 | idle |
| Glowmoth | 20×14 | idle |
| Stagwarden (boss 1) | 44×44 | phase1, phase2, phase3 |
| Gloamhorn (boss 2) | 40×36 | phase1 to 3, open1 to 3 (wing cases open) |
| Brood Queen (boss 3) | 48×42 | phase1 to 3 |
| Rock | 20×14 | |
| Dead tree | 22×40 | |
| Flag pole | 14×30 | raised, lowered |
| Thunder cloud | 30×22 | idle, flash |
| Exit | 16×10 | closed, open |
| Star | 11×11 | |
| Heart | 9×8 | |
| Wild pickup | 10×10 | |
| Gear icon | 12×12 | |
| Fireflies | 14×12 | 4 animation frames |
| Town shop / Burrow building | 56×52 / 56×36 | |
| Flat room screens (Burrow, shops) | 384×216 full screen | |

## 4. The hero

**Decided (owner, 2026-11-15):** the hero is an **armadillo** who stands on two legs, curls into a ball when launched, and pops back out when the ball stops.

**Decided (owner, 2026-11-19): the poses.**

| When | Pose |
|---|---|
| Resting, aiming, charging | standing on two legs |
| Launched by your own shot, rolling or flying | curled into a ball |
| Comes to rest after your shot | pops out and stands up |
| Knocked or hurt when it isn't your shot (an enemy, a sliding block, a blast) | **not** curled: a hurt pose, then knocked onto its back like a tortoise, sliding or tumbling with legs in the air |
| Comes to rest after being knocked | lies on its back a moment, then flips over and stands up (about 0.5 s, Default) |

Also needed: walking in 4 screen directions (towns and the crossroads).

**Proposed frame counts:** stand 2 (breathing), curl 3, ball 4 (rotation), pop out 3, hurt 1, on its back 2 (legs wiggling), flip up 4, walk 4 per direction, cheer 2.

**Three playable characters** (working names, all armadillos):

| | Rollo | Thud | Pip |
|---|---|---|---|
| Build | balanced | heavy | light |
| Proposed look | the base design | bulkier, darker shell | smaller, lighter, bigger ears |

**Name caution:** a 2025 game, *Dillo's Dilemma*, has an armadillo named Dillo who rolls into a ball. Our hero must not resemble it, and the game shouldn't use "Dillo" in names.

## 5. The villains: insects

**Decided (owner, 2026-11-18):** every enemy is a bug. A nice fit, since armadillos eat bugs. The names below are working names the owner accepted.

| Name | What it is | Look notes |
|---|---|---|
| Snoozegrub | a fat beetle grub, fast asleep | curled, pale, a sleep bubble; never acts |
| Leadgrub, Embergrub, Hopgrub, Whirlgrub, Frostgrub, Sparkgrub | grubs carrying an ability | grey with iron stripes / glowing orange stripes / green with springy legs / spiral stripes / pale frosted blue / yellow and crackling |
| Grublet | a tiny larva from a splitting bug | a small Snoozegrub |
| Mudroller | dung-beetle-like, pushes a mud ball | the mud ball is what knocks you |
| Spittlebug | squat, lobs spit gobs | the projectile is a spit glob |
| Pouncehopper | grasshopper that hurls itself and tumbles | long back legs; tucks in to roll |
| Mole Cricket | digging cricket under a mound | big digging forelegs; pops out of the mound |
| Skitter Ant | small fast worker ant | thin, quick legs |
| Bristlecrawler | spiny caterpillar | spines at the front (guarded), soft green rear (weak spot) |
| Glowmoth | floating moth, glowing belly | hovers, with a shadow on the ground |
| Trapjaw | trap-jaw ant | huge front jaws (guarded), narrow back (weak) |
| Stinkpuff | stink bug that puffs a cloud | shield-shaped back with a vent |

**Bosses:**

| Boss | Region | Look |
|---|---|---|
| The Stagwarden | 1 | giant stag beetle; huge antlers it slams down; more cracks in its shell each phase |
| Gloamhorn | 2 | giant rhinoceros beetle; wing cases shut, and after a charge they open to show its soft back |
| The Brood Queen | 3, final | giant queen ant, the bugs' leader; huge armoured body half sunk in her mound, soft back on top, a crown of feelers |

**Variant looks (round 1 of Milestone 8):**

- **Elements:** fire is a red-orange shell with glowing spots; ice is a frosted blue shell; shock is yellow with sparking antennae.
- **Traits:** Shielded is a shinier shell plate; Armoured has thicker plates; Swift has thin streaks behind it; Explosive has a swollen glowing belly; Regenerating has a leafy green glow; Splitting has a bulging egg sac.
- **Tiers:** a Veteran has a stripe on its shell; an Elite has a little crown of horns.

**Proposed animation for every bug:** 2-frame idle, 2-frame action, 1 hurt frame, a 3-frame defeat puff. Bosses get idle, attack, hurt and phase-change frames, at 48×48 or larger.

## 6. The world: biomes and themes

**Decided (owner, 2026-11-14):** the look changes after each boss. Only the art changes. Once real art exists, each larger advancement gets **several variants of its theme** (Proposed: 3 variants of each ground tile and common scenery piece, picked from the tile's position).

| Theme | When | Placeholder palette direction | Sky |
|---|---|---|---|
| Day (Meadow) | region 1 | bright greens, as now | `#1d2b53` |
| Bog | region 2 | murky greens and browns, darker water, misty green sky | `#2a3a2c` |
| Thornwood | region 3 | grey-purple grass, bare brown earth, dusk sky | `#3a2c40` |
| Starfall | always first in endless mode | **owner:** deep purple sky | `#1c0c30` |
| Night | endless, random | deep blue shading, starry sky | `#0a0c22` |
| Underground | endless, random | brown and grey stone, dark cave background | `#1c1610` |
| Spooky | endless, random | pale greens and purples, fog-grey sky | `#2a2a36` |

**What a theme changes:** today, tiles, faces, scenery and blockers. Enemies, the ball, pickups and the HUD look the same in every theme.

**Decided ground details:**

- **Checkerboard grass** (owner, 2026-11-15): two-tone, our own colours, so the shape of every slope reads clearly.
- **Ground bumps** (owner, 2026-11-21): for looks only, each flat grass, rough or sand tile is drawn raised by 0, 1 or 2 pixels (45 / 35 / 20 in 100). Slopes are never raised. Things standing on a raised tile are raised with it. The owner chose this over per-tile shading after comparing renders.

**Water** is see-through with a shimmer, a deeper tint for deep water, shore foam and splashes.

**Surfaces with art:** grass, rough, sand, ice, water, bumper, booster, conveyor, spring, spikes, bridge, path, warp.

**Scenery and props:** tufts, flowers, pebbles, mushrooms, leaves, bones, fireflies (animated, floating), rocks, stumps, low walls, dead trees, guard rails (posts and bars), gates (closed ones have spiked tops), switches, drawbridges, crates, cracked tiles, flag poles (a defeated enemy leaves one where it died), thunder clouds.

## 7. Towns, shops and screens

- **Walkable towns and the crossroads (owner, 2026-11-21):** zoomed-in isometric places the armadillo walks around, "an RPG-like place, props everywhere". The owner's reference pictures were for feel only. Built so far: a food hut, the gear shop with its sign, the Burrow, a boss gate, a chest, dirt paths, fences, lamp posts, barrels, signposts, and lantern posts at each crossroads path's end with the destination's map icon floating between them.
- **Flat screens:** the Burrow and the shops open as full-screen **flat 2D illustrations** (384×216, not isometric) with the menus drawn over them.
- **Decided (owner, 2026-11-19): the food shop is a food stand with an animated shopkeeper**, who animates when you buy (Default: also on a reroll or when you can't afford something). The shopkeeper is a friendly animal, not an insect.
- **Owner, 2026-11-21:** the gear shop gets its own look and shopkeeper (Default: a tinker's workshop).
- **Proposed shopkeepers:** a hedgehog cook in an apron (food stand); a raccoon tinker with goggles (workshop).
- **Proposed:** the Burrow (home base) redrawn as a cosy den.

## 8. Animations and effects

**Decided (owner, 2026-11-14): most actions get an animation and a sound:** shots, hits, defeats, flags going up and down, pickups, ability use, damage, enemy actions.

**Decided: the Wild pickup gets a flashy slot-machine wheel.** Proposed: a 3-reel box over the ball spins through ability icons for about 1.2 s, then stops reel by reel.

**Decided (owner, 2026-11-19): boss introductions.** A short cutscene pop-up before each main boss fight shows the boss and its name. In endless mode a shared pop-up shows the picked boss with the region number. About 3 s; any key skips it. Proposed: one full-screen 384×216 picture per boss, sliding in and out.

**Proposed effects:**

- Hit: white flash, a pixel burst, a damage number.
- Defeat: a puff, then the flag pole rises.
- Star collected: it flies to the HUD.
- Damage taken: red flash and a small screen shake.
- Exit opens: a sparkle ring.
- Ability used: its own effect each.
- Crate breaks: splinters.
- Water: bubbles while under it.

## 9. Lighting

**Decided (owner, 2026-11-21):** Milestone 9 adds the following, and a settings menu can turn lighting and shadows off for performance:

- **fireflies:** a small cluster of flickering light pixels (they already exist as scenery)
- **ground-level lights**
- **tall lights:** on poles or hanging in trees
- **dynamic shadows** cast by those lights

**Proposed:**

- Only the dark themes are lit: night, underground, spooky and Starfall.
- Ground lights are glow mushrooms and lanterns; tall lights are lamp posts and lanterns in trees.
- The exit glows softly in dark themes.
- Shadows fall away from the nearest 2 lights.
- It's drawn as one darkness layer with soft light circles cut out of it.

## 10. How the final art gets made (still open)

The Milestone 9 sheet offers four routes. **Not decided yet.**

| Route | Summary |
|---|---|
| A (proposed default) | AI-drawn "art as code": each sprite a grid of palette letters in `tools/art/`, turned into the same PNGs. Themes become palette swaps |
| B | The owner draws it in a pixel editor (Aseprite or LibreSprite) |
| C | Commission a pixel artist (the licence must allow commercial use) |
| D | Licensed CC0 asset packs; poor fit for an isometric, SNES-style armadillo and insects |

**Proposed either way:** a "hand-drawn wins" folder (`assets/sprites/drawn/`). A PNG there with the same ID replaces the generated one, so routes can be mixed sprite by sprite.

## 11. Still undecided

- **The game's name.** The repository name "DreamCourseDream" is a placeholder and must **not** be the public title (too close to an existing game). Candidates so far: Curlback (no clash found in a web search), Shell Out, Bugbane Links, Rolling Thunderdew.
- **The setting.** Proposed: a valley of meadows, bogs and thornwoods taken over by the insect swarm under the Brood Queen; one armadillo rolls out to take it back.
- The art route (section 10), shopkeeper species, number of variants, which themes are lit.

## 12. Where to look in the repository

- `docs/DESIGN.md`: sections 2 (pillars), 4 (view and world), 12 (art and audio), open question 9.
- `docs/FEATURES.md`: sections 3 (hero poses), 5 (bosses and cutscenes), 11 (shops and shopkeepers).
- `docs/plans/milestone-8.md` section 7.0: the insect cast and their looks.
- `docs/plans/milestone-8-round-2b.md` section 4: biomes and themes.
- `docs/plans/milestone-8b.md`: towns and flat screens.
- `docs/plans/milestone-9.md`: the art, sound and lighting proposals (not signed off).
- `assets/manifest.json`, `src/render/manifest.ts`: sprite IDs, sizes, frames, themes.
- `tools/make-placeholder-art.ts`: today's placeholder art and theme palettes.
