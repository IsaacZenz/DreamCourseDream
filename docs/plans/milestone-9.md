# Milestone 9 design sheet: skin, sound and sharing

**Status: waiting for the owner's review. Nothing on this sheet is built yet.**

## 0. Where this fits

Milestone 9 turns the working game into something a stranger can pick up. The plan's checklist (PLAN.md):

- theme, character and title chosen with the owner
- final pixel art through the manifest only, with several variants per theme
- sound effects and music, original or correctly licensed
- an animation and a sound for most actions, including a slot-machine wheel for the Wild pickup
- the armadillo's poses (FEATURES.md section 3)
- the food stand with an animated shopkeeper, and the gear shop's own look (FEATURES.md section 11)
- boss cutscene art (FEATURES.md section 5)
- title screen, settings, a short tutorial course, controls help
- lighting: fireflies, ground lights, tall lights, dynamic shadows, and a settings switch to turn them off
- a playtest with a few friends

**Done when:** someone who has never seen the game can open the link and play a run without help.

**What does not change:** the rules, the physics, the generator, the bot, the content numbers and the save format. Everything here is display, sound and menus. Lighting adds scenery entries only (section 7.1); they have no collision, so course making and the course check are untouched. Rules 2, 3 and 5 in CLAUDE.md keep holding: `src/sim/` and `src/gen/` get no art, sound or clock code.

**A note on Milestone 8.** Its last condition is "the owner judges the difficulty curve fair" after a playtest. That isn't recorded in PLAN.md yet. Milestone 9 has no gate on it, so this sheet goes ahead, but please say whether you've judged the curve fair, or whether you'd rather do that playtest once the game has sound and art.

## 1. Who and where: the identity questions

Right now the game has no name (DESIGN.md open question 9), and Rollo, Thud and Pip are working names. Every question below needs your answer, because the title screen, the logo and the art all depend on it.

### 1.1 The game's name

I looked up a few ideas with a web search on 2026-11-25. **Something worth knowing:** there's a 2025 game called *Dillo's Dilemma*, where an armadillo named Dillo rolls into a ball to get around (a 3D physics collectathon, not golf). So our hero is not a unique idea. That's fine (genres share ideas), but the name should stay well clear of "Dillo". A browser game called *Burrow Balls* (marble physics) also exists, so "Burrowball" is out.

| Candidate | Search result | Note |
|---|---|---|
| **Curlback** | no game found | Short; it says what the hero does (curls up, comes back) |
| Shell Out | not checked | A pun on the shell and paying in shops |
| Bugbane Links | not checked | Says "golf" and "insects" |
| Rolling Thunderdew | not checked | A playful, storybook feel |
| Your own idea | | I'll run a search on it |

**Default: none.** This one is yours to pick. Before the game goes public, also search the name yourself on Steam, itch.io and the app stores. A web search is only a first check, not a trademark search.

### 1.2 The setting (one paragraph for the title screen and the tutorial)

Suggestion (Default): *A quiet valley of meadows, bogs and thornwoods, once kept trim by the animals who live there. The insect swarm, led by the Brood Queen, has dug in across the land. One armadillo curls up and rolls out to take it back, one course at a time.* The three regions keep their biome names (Meadow, Bog, Thornwood). The endless mode's Starfall becomes "past the edge of the valley".

### 1.3 Names

| Working name | What it is | Default |
|---|---|---|
| Rollo | the balanced armadillo | keep |
| Thud | the heavy armadillo | keep |
| Pip | the light armadillo | keep |
| the Burrow | home | keep |
| the Stagwarden, Gloamhorn, the Brood Queen | the bosses | keep |
| bug names (Mudroller, Snoozegrub and others) | enemies | keep |

### 1.4 Shopkeepers (FEATURES.md section 11)

| Shop | Look | Shopkeeper (Default) |
|---|---|---|
| Food shop | a wooden food stand with an awning | a **hedgehog cook** in an apron |
| Gear shop | a tinker's workshop | a **raccoon tinker** with goggles |

They're friendly animals, not insects, because the insects are the villains.

## 2. How the art gets made: a choice for you

The plan says "final pixel art". Somebody has to draw it. These are the realistic routes:

| Route | What it means | Good | Bad |
|---|---|---|---|
| **A. I draw it, as code** (recommended to start) | Every sprite is written as a small grid of palette letters in a sprite source file (`tools/art/*.ts`). The art script turns them into the same PNG files and manifest as today. | Original by construction, free, consistent, and quick to change ("make Thud rounder"). Every theme and variant is a palette swap or a small edit. | It looks like competent hand-made pixel art, not a professional artist's. Best on small sprites (ball, bugs, props, tiles); weakest on big pictures (boss cutscenes, shop rooms). |
| B. You draw it | Use a pixel editor such as Aseprite (about $20) or the free LibreSprite. Export PNGs over the placeholder files. | Your own look. A good skill to learn. | A lot of drawing: about 500 sprite IDs today. |
| C. Hire an artist | Commission a pixel artist for some or all of the art. | Best quality. | Money, and someone to manage. Their licence must allow commercial use (record it in `assets/LICENSES.md`). |
| D. Licensed packs | Use free CC0 packs (for example Kenney's). | Free and quick. | There's almost nothing isometric, SNES-style, with an armadillo and insects. Mixed packs look mixed. |

**Default: route A for everything now, built so routes B or C can replace any file later.** This already works today: the manifest maps every sprite ID to a file, so a replacement PNG of the same size drops straight in. I'd also add a **"hand-drawn wins" rule:** a file in `assets/sprites/drawn/` with the same ID is used instead of the generated one. Then redrawing one sprite never gets overwritten by `npm run art`.

**Style rules (Default), from DESIGN.md pillar 1:**

- 15-bit colour, as now. Each sprite uses at most 15 colours plus see-through, like a SNES sprite palette.
- A dark outline on characters, enemies and pickups. No outline on ground tiles.
- Light comes from the upper left on every sprite.
- Sizes stay as they are today, so the physics and draw order look the same.

## 3. How the sound gets made

Same idea as the art: everything original, made by a tool, replaceable file for file.

- **Sound effects:** each one is a short recipe in `src/content/sounds.ts` (wave shape, pitch slide, length, noise, echo), in the style of the classic "sfxr" sound makers. A tool, `npm run sounds`, turns every recipe into a small `.wav` file in `assets/audio/` and writes an audio manifest. The game plays sounds by ID, never by file name. A real sound file with the same ID can replace any of them.
- **Music:** each tune is written as note data (melody, bass, drums and a chord part) in `src/content/music/*.ts`. A small sequencer plays it with SNES-like instruments built in code (a soft square lead, a plucked bass, a noise drum kit, a little echo). The SNES itself played short recorded samples, so this is "in the spirit of", not an exact copy of its sound chip.
- I compose the tunes myself. They'll be simple, catchy loops of 30 to 60 seconds, not a professional score. Any tune can later be replaced with a licensed or commissioned track by dropping an `.ogg` file in under the same ID.
- **Browsers block sound until the player presses a key or clicks.** The title screen's first key press starts the audio. That's why there's a title screen before anything plays.

**Default: all of the above.** The other route: CC0 music and sounds from places like OpenGameArt or Kenney, each listed in `assets/LICENSES.md`. That's fine, but generated sounds match each other better and need no licence bookkeeping.

## 4. Rounds

This milestone is too big for one go, so like Milestone 8 it's built in rounds. Each round ends with a test build for you.

| Round | Builds | Why this order |
|---|---|---|
| **9a: menus and sound** | Title screen, settings, controls help, the sound system, every sound effect, the music system and the tunes | Small, and it makes the game feel finished quickly. The title screen also has to come first so audio can start (section 3). |
| **9b: the art** | The art-as-code tool, the armadillo's poses, enemies, bosses, tiles and props for every theme with variants, the shops and shopkeepers, the boss cutscenes, the Wild wheel, the action animations | The biggest round. It may split into 9b-1 (characters and enemies) and 9b-2 (the world) if it gets long. |
| **9c: light and first steps** | Lighting and shadows, the tutorial course, the friend playtest and its fixes | Lighting needs the final art to judge. The tutorial and the playtest come last because they test everything else. |

**Default: this order.** You can swap 9a and 9b if you'd rather see the art first.

## 5. Round 9a: menus and sound

### 5.1 Title screen

- The game's name as a pixel-art logo, over a slowly scrolling course in the day theme, with the armadillo rolling across now and then.
- Menu (arrow keys or W/S, then Enter):
  - **Continue** (only when there's a saved run)
  - **New run**
  - **Tutorial**
  - **Burrow** (the between-runs home, as today)
  - **Settings**
  - **Controls**
- "PRESS ANY KEY" first; that press also starts the audio.
- The test keys (U panel, course number keys) keep working in the test build. On the public build the test courses come off the number keys and stay reachable through the address bar (`?course=`).

### 5.2 Settings

Opened from the title screen and from a new pause menu (Esc during a course, when no other window is open).

| Setting | Choices | Default |
|---|---|---|
| Music volume | 0 to 10 | 7 |
| Sound volume | 0 to 10 | 8 |
| Lighting | on / off | on |
| Shadows | on / off | on |
| Ground bumps | on / off | on (moves here from the U panel; the U switch stays too) |
| Screen shake | on / off | on |
| Aim guide length | as now / short | as now |

Settings are saved in the browser under their own key, so the run save format (version 4) doesn't change.

### 5.3 Controls help

A one-page card listing every key, grouped as Aiming, Shot, In the air, Walking and Menus. Opened from the title screen and the pause menu, and with **H** anywhere. The first time a new player reaches the tee of their first course, a strip at the bottom shows the three most important keys for 10 seconds.

### 5.4 Sound effects (one per action, from the simulation's events)

Every event the simulation reports (`PlayEvent` in `src/sim/play.ts`) gets a sound. Several events share one where that makes sense.

| Sound ID | Plays on | Feel |
|---|---|---|
| `aim-tick` | turning the aim, a step at a time | soft click |
| `charge` | the power meter running (rises and falls with it) | rising hum |
| `perfect` | release in the perfect window | bright chime |
| `launch` | your shot leaves | whoosh plus a curl-up "thup" |
| `bounce` | the ball lands from the air (louder for faster landings) | thud |
| `wall` | hitting a wall, rail or blocker | knock |
| `bumper` | bumper tile | springy boing |
| `boost-press` / `boost-good` | Space pressed in the air / the bounce boost counted | click / sparkle |
| `rest-stand` | the ball stops and the armadillo stands up | little pop |
| `hit` | damaging an enemy | crunchy hit |
| `hit-blocked` | a hit that does nothing (shielded) | dull tink |
| `defeat` | an enemy defeated | squish plus a rising tone |
| `star` | a star collected | coin-like ding |
| `flag-up` / `flag-down` | flag poles | flutter up / down |
| `heart` / `shot-orb` | pickups | warm chime / airy chime |
| `hurt` | the player takes damage | ouch blip plus thump |
| `knocked` | knocked when it isn't your shot | tumble |
| `splash` / `underwater` | water | splash / bubbles |
| `fall` | off the edge | falling whistle |
| `zap` | thunder cloud | crackle |
| `exit-open` | quota met | short fanfare |
| `won` / `lost` | course won / run over | jingle (music, section 5.5) |
| `ability-get` | gaining an ability | power-up arpeggio |
| `ability-use` | one per ability: Anchor, Burner, Hop, Tornado, Frost, Static, Burr, Kite, Gyre, Drift | each its own short sound |
| `wild-spin` / `wild-stop` | the Wild wheel (art in 9b) | ticking reel / ding |
| `crate` / `break` | crate hit / broken | wood knock / crash |
| `enemy-turn` | the enemies' turn starts | low drum hit |
| `enemy-act` | lob, launch, surface, burrow, rumble, charge, slam | one each, shared where similar |
| `status` | stunned, poisoned, burning, chilled | one each |
| `gear` | gear equipped, shielded, resisted, thorns, phoenix | one each |
| `ui-move` / `ui-ok` / `ui-back` / `ui-no` | menus, shops (and "cannot afford") | blips |
| `buy` | buying in a shop | cash-register ding |
| `eat` | eating food | munch |
| `step` | walking in towns (quiet, every other step) | soft patter |
| `door` | going into a shop or the Burrow | creak |
| `boss-intro` | the boss card appears | sting |

About 60 sounds in all. **Default:** at most 3 copies of the same sound play at once, so a pile of hits doesn't get deafening.

### 5.5 Music

| Tune | Where | Default length |
|---|---|---|
| Title | title screen | 45 s loop |
| Town | towns, the crossroads, the Burrow | 60 s loop |
| Meadow | region 1 courses | 60 s loop |
| Bog | region 2 courses | 60 s loop |
| Thornwood | region 3 courses | 60 s loop |
| Starfall | endless mode | 60 s loop |
| Boss | every boss fight | 45 s loop, faster |
| Course won | jingle | 3 s |
| Run over | jingle | 4 s |
| Boss beaten | jingle | 5 s |

The night, underground and spooky themes reuse their region's tune with a darker instrument set (Default). Music fades over 1 s when the screen changes.

## 6. Round 9b: the art

### 6.1 The art tool

- Sprite sources in `tools/art/`, one file per group (hero, bugs, bosses, tiles, props, pickups, icons, places, cutscenes). Each sprite is a grid of letters plus a palette, and can have several frames.
- **Themes are palettes.** A theme swaps colours (and, where needed, a few whole sprites, such as dead trees in spooky), through the theme sets the manifest already has.
- **Variants (owner, 2026-11-14): Default 3 variants** of each ground tile and each common scenery piece per theme, picked from the tile's spot like the ground bumps. Display only.
- The "hand-drawn wins" folder from section 2. **Built early (owner, 2026-11-26) as `art/drawn/`, together with organic wall textures; see DESIGN.md section 12.**

### 6.2 The armadillo (FEATURES.md section 3; poses decided by the owner, 2026-11-19)

| Pose | Frames | When |
|---|---|---|
| Stand (idle) | 2, breathing, 0.6 s each | resting, aiming, charging (it leans into the charge) |
| Curl up | 3, 0.05 s each | your shot launches |
| Ball | 4 rotation frames, speed follows the ball's speed | rolling or flying under your shot |
| Pop out | 3, 0.06 s each | stops after your shot |
| Hurt | 1, 0.2 s | hit or knocked when it isn't your shot |
| On its back | 2, legs wiggling | sliding or tumbling after a knock |
| Flip up | 4, about 0.5 s in all | comes to rest after a knock; doesn't delay your turn |
| Walk | 4 frames in each of 4 screen directions | towns and the crossroads |
| Cheer | 2 | course won |

Thud and Pip use the same frames, redrawn: Thud bulkier with a darker shell, Pip smaller and lighter, with bigger ears. All of this is display only; the poses come from what the simulation already reports (moving or not, `knocked`).

### 6.3 Everything else

| Group | Default |
|---|---|
| Bugs (all enemies) | 2-frame idle, 2-frame act (for the move they make), 1 hurt frame, a 3-frame defeat puff. Tier and element shown with a palette tint, as now |
| Bosses | Each gets a 48×48-pixel or larger sprite with idle, attack, hurt and phase-change frames. Gloamhorn's open wing cases and the Brood Queen's back as frames |
| Boss cutscenes | One full-screen 384×216 picture per main boss (the boss looming over its arena with its name in big letters), and a shared endless card (a silhouette with the region number). It slides in, holds, slides out: about 3 s, any key skips (as decided) |
| Tiles | Every surface and face, redrawn with texture (grass blades, sand grain, ice glints), in 3 variants, for all 7 themes |
| Props and scenery | Redrawn, with theme swaps |
| Pickups and icons | Redrawn, with a 2 to 4 frame shine |
| Gear icons | Redrawn per family: one shape per family and a rarity border colour (keeps 70 items manageable) |
| Food stand | The food shop room: the stand, crates of food, the hedgehog cook (idle 2 frames; happy hop when you buy; head shake when you can't afford it or rerolling; Default) |
| Workshop | The gear shop room: a bench, tools, gear on hooks, the raccoon tinker (idle, hammering when you buy, shrug when you can't afford it) |
| Burrow | The Burrow room redrawn as a cosy den |
| Towns | Buildings and props redrawn for the three town layouts |

### 6.4 Action animations (owner, 2026-11-14: "most actions")

| Action | Animation |
|---|---|
| Hit an enemy | a white flash on the enemy, a small burst of pixels, a damage number |
| Defeat | a puff, then the flag pole rises from the ground |
| Star collected | the star flies up to the HUD's star meter |
| Damage taken | the armadillo flashes red, and a small screen shake (setting) |
| Exit opens | a sparkle ring at the exit |
| Ability gained | the icon pops above the ball, then flies to the HUD |
| Ability used | one effect each (flames for Burner, a dust ring for Hop, and so on) |
| **Wild pickup** | **A slot-machine wheel:** a 3-reel box over the ball spins through ability icons for about 1.2 s, then lands reel by reel on the rolled ability. The roll is the one the simulation already made; the wheel only shows it |
| Crate break | wood splinters |
| Water | splash rings (existing), plus bubbles while under water |
| Enemy turn | a short "BUGS' TURN" banner, Default |

## 7. Round 9c: light and first steps

### 7.1 Lighting and shadows (owner, 2026-11-21)

- **Dark themes:** night, underground, spooky and Starfall (Default) are drawn darker, with light around light sources. The day, bog and thornwood themes stay bright and keep the simple shadow under each thing.
- **Light sources**, all scenery entries in `src/content/scenery.ts`:
  - **fireflies** (exist already): a small cluster of flickering light pixels
  - **ground lights:** glow mushrooms, a lantern on the ground
  - **tall lights:** a lamp post, or a lantern hanging from a tree
  - the **exit** glows softly in every dark theme, so you can find it
- **Where they go:** the generator's detail dial already places scenery. Light props join that list for the dark themes only. They have no collision, so courses, the bot and the course check don't change (and course making isn't slowed).
- **Shadows:** in a dark theme, the ball, enemies and tall props cast a shadow away from the nearest light within reach (at most the 2 nearest lights, Default), stretched by distance. In the light themes the shadow stays straight down.
- **How it's drawn:** a darkness layer over the course with soft light circles cut out of it. The cost is one extra layer, not one per object.
- **Settings:** Lighting off draws dark themes at normal brightness with no light circles. Shadows off falls back to today's simple shadow.

### 7.2 The tutorial course

A hand-built course, **First Roll**, in the day theme. It has six short stops, each with a sign you read with Enter and a small task:

1. **Aim and shoot:** pull back, hold to charge, release. Roll to the flag.
2. **Perfect shot:** release at the top of the meter. Clear a gap.
3. **Lofted shot and the bounce boost:** hop a low wall; press Space just before landing.
4. **Spin and curve:** curve round a rock.
5. **Bugs and stars:** hit a sleeping Snoozegrub. Its flag rises and the star counts. The exit opens.
6. **Abilities:** break a crate, use the ability with F, roll into the exit.

**Default:** nothing counts (no damage, no run). It's offered once when a new player picks New run ("Play the tutorial first? Enter: yes, Esc: skip") and is always on the title menu. The course is a hand-made JSON file in `src/content/courses/`, like the practice green.

### 7.3 The friend playtest

- I write `docs/playtest.md`: how to send the link, what to tell testers (nothing, ideally), and a short form: where did you get stuck, what didn't you understand, what was fun, what was annoying, how far did you get.
- You run it with 2 to 4 friends who've never seen the game. Ideally watch them without helping and note where they hesitate. That's the "done when" test.
- I fix what confuses them, as small follow-up changes.

## 8. Questions for the owner

| # | Question | Default |
|---|---|---|
| Q1 | The game's name (section 1.1) | **none, yours to pick** |
| Q2 | The setting paragraph (section 1.2) | the valley taken back from the swarm |
| Q3 | Keep Rollo, Thud, Pip and the other working names? (section 1.3) | keep all |
| Q4 | Shopkeepers (section 1.4) | hedgehog cook, raccoon tinker |
| Q5 | How the art is made (section 2) | route A (I draw it as code), with hand-drawn replacements possible later |
| Q6 | How the sound and music are made (section 3) | generated and composed in code, replaceable by files |
| Q7 | Round order (section 4) | 9a menus and sound, 9b art, 9c lighting, tutorial and playtest |
| Q8 | Variants per theme (section 6.1) | 3 of each ground tile and common scenery piece |
| Q9 | Which themes are dark and lit (section 7.1) | night, underground, spooky, Starfall |
| Q10 | Tutorial offered on the first New run (section 7.2) | yes, skippable |
| Q11 | Milestone 8's done-when: is the difficulty curve fair, or test it after 9a? (section 0) | test it after 9a, with sound in |
