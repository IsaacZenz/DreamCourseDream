# Milestone 9, round 9L: light and atmosphere — design sheet

**Status: signed off by the owner, 2026-11-26.** Option A (section 1), with option B kept in reserve: if A doesn't feel right once it's on screen, we pivot to B. The other questions in section 7 take their Defaults. Building starts with step L1.

**Owner request, 2026-11-26:** start Milestone 9 with the dynamic lighting and shadows, and widen it into an "atmosphere engine" with the feel of *Sea of Stars* and *Octopath Traveler*. This sheet replaces section 7.1 of `docs/plans/milestone-9.md` and moves it from round 9c to the first round. The rest of that sheet (name, art, sound, tutorial) is unchanged and still waiting for your review.

## 0. What makes those two games look the way they do

There's no single "atmosphere engine" in either game. The look comes from **several thin layers stacked on top of the art**. Each one is simple. Together they make the scene feel like it has air and weather and a time of day.

| Layer | What you notice | In *Octopath* | In *Sea of Stars* |
|---|---|---|---|
| Colour grade | the whole screen has a mood: warm afternoon, cold night | strong | strong, changes with time of day |
| Ambient light + light sources | dark scenes with warm pools of light round lamps and fires | yes | yes, the main feature |
| Shadows from the terrain | cliffs and walls throw shadows onto the ground below them | real 3D shadows | painted height data, shadows move with the sun |
| Bloom / glow | bright things bleed a soft halo | strong | light |
| Particles | dust in sunbeams, fireflies, leaves, embers | yes | yes |
| Fog and mist | low mist in hollows, haze in the distance | yes | yes |
| Light shafts | angled beams through trees | yes | yes |
| Depth of field (tilt-shift) | top and bottom of the screen blurred, like a miniature | **the signature look** | no |
| Vignette | corners slightly darker | yes | light |

**Where our game is lucky:** every course already knows the height of every tile. That's the same information *Sea of Stars* painted by hand to get its terrain shadows, so we can work out real cliff shadows from the course itself, for free, on every generated course.

## 1. One honest catch: the low resolution (please read)

DESIGN.md pillar 1 is **Decided**: the game draws at 384 × 216 pixels and scales up, with crisp pixels. *Octopath*'s smooth blur and soft glow come from drawing the effects at full screen resolution on top of the pixel art. At 384 × 216, a blur or glow is made of big chunky pixels. That can look very good and very "SNES" if it's done on purpose (soft edges become a few stepped bands, sometimes dithered), but it won't look like *Octopath*'s smooth glow.

| Option | Looks like | Cost |
|---|---|---|
| **A (Default): keep 384 × 216 for everything** | chunky, stepped light bands, closer to a late-SNES game with modern lighting. Fits pillar 1. | no change to how the game is drawn |
| B: effects at full screen size over pixel art | smooth glows and blur, closer to *Octopath*'s "HD-2D". Bends pillar 1. | a bigger change: the game would draw twice (art small, effects large); every screen and the text need checking. Roughly an extra round. |

I recommend **A**. It keeps a decision you've already made, and the layers below work the same way in either option, so we can still try B later if A doesn't feel like enough. Only you can reopen pillar 1, so I won't change it unless you say so.

**Decided (owner, 2026-11-26): A, with B in reserve.** To keep the pivot cheap, the atmosphere layers draw into their own pictures whose size is one setting (`resolution` in `src/content/atmosphere.ts`). Under A it's 1 (384 × 216). Moving to B means raising that number and drawing those pictures at full screen size; the presets, lights and shadows don't change.

## 2. The layers, in drawing order

Everything here is **display only**. It lives in `src/render/atmosphere/` and never touches the rules, the physics, the generator or the bot (CLAUDE.md rules 2 and 3). The look of each theme is **data** in a new file, `src/content/atmosphere.ts` (rule 4), and light sources are scenery entries in `src/content/scenery.ts`. Every layer can be switched off on its own from the U panel, so you can see what each one adds.

### 2.1 Theme look (the "preset")

Each theme gets one preset: the numbers below. Starting values (all tunable live in the U panel, section 4):

| Theme | Ambient (brightness, tint) | Sun | Grade | Particles | Fog | Shafts | Dark? |
|---|---|---|---|---|---|---|---|
| day | 100%, warm white | high, from upper left | slightly warm, +10% saturation | dust motes, pollen | none | yes, few | no |
| bog | 85%, green-grey | low, hazy | desaturated −20%, green shadows | spores, midges | thick, low-lying | no | no |
| thornwood | 75%, gold-green | low, through canopy | warm highlights, teal shadows | falling leaves | light | yes, many (canopy) | no |
| starfall | 45%, violet | none (night) | purple-blue | falling star sparkles | light haze | no | yes |
| night | 35%, deep blue | moon, from upper right | blue shadows, warm lights | fireflies | thin | moonbeams, few | yes |
| underground | 25%, cold grey | none | low saturation, warm lights | dripping dust | thin | no | yes |
| spooky | 30%, green-violet | none | green shadows, −30% saturation | embers, wisps | thick, drifting | no | yes |

"Dark?" matches the existing Default (milestone-9.md Q9): night, underground, spooky and Starfall get placed light sources. The bright themes get sun, grade, particles and fog but no lamps.

### 2.2 Light (the "light map")

- **How it works:** a hidden picture the size of the screen is filled with the ambient colour, then each light is painted onto it as a soft round glow. That picture is then **multiplied** over the course: where it's white, the art shows normally; where it's dark blue, the art goes dark blue. The cost is one extra layer, however many lights there are.
- **Why not Phaser's built-in lights?** Those need a "normal map" (a second picture telling which way each pixel faces) for every sprite. That doubles the art work, and placeholder art doesn't have them. The light map works with any art, including whatever gets drawn in round 9b. Normal maps can be added later for a few showpiece sprites if you want.
- **Light sources** (scenery entries, no collision, so the course check is unaffected):

| Light | Radius (tiles) | Colour | Flicker | Height | Placed |
|---|---|---|---|---|---|
| fireflies (exists) | 1.5 | yellow-green | strong, random | floats | dark themes, by the detail dial |
| glow mushroom | 1.5 | cyan or violet | slow pulse | ground | underground, spooky, bog |
| ground lantern | 2.5 | warm orange | gentle | ground | night, starfall |
| lamp post | 4 | warm yellow | none | tall (2 tiles) | night, spooky |
| tree lantern | 3 | warm orange | gentle sway | tall (3 tiles) | night, spooky |
| the exit | 3 | the flag colour | slow pulse | ground | every dark theme, always |
| the hero | 1.5 | soft white | none | follows the ball | every dark theme (so you can always see yourself) |
| glowing enemies (e.g. the Glowmoth) | 2 | from its manifest tint | its own | follows it | every theme |

- **Stepped bands (Default):** the soft edge of each light is cut into 4 brightness steps with a small dither between them, so it reads as pixel art, not a smooth airbrush.
- **The existing "Darkness" course mod** (dark away from the ball) is rebuilt on this layer: ambient goes very dark and the hero's light shrinks. Same rule, nicer look.

### 2.3 Shadows

Three kinds, from biggest effect to smallest:

1. **Cliff shadows from the sun (bright themes).** From the course heights and the sun's direction, each tile works out whether a higher tile between it and the sun blocks it. Shadowed ground is darkened by 35% and tinted with the theme's shadow colour. Worked out **once when the course loads**, so it costs nothing while playing. This is the single biggest "*Sea of Stars*" improvement.
2. **Contact shadows (all themes).** The ground at the foot of a wall, and in the corner of a step, is darkened a little (about 15%). This makes the terrain look solid. Also worked out once per course.
3. **Moving shadows from objects.** The ball, enemies and tall props cast a shadow:
   - bright themes: a short shadow pointing away from the sun
   - dark themes: away from the nearest light in reach (at most the 2 nearest, as the main sheet said), longer the further the light is, fading out at the edge of its reach
   - the ball's shadow stays directly under it as well, because that's how you judge its height in the air (that rule matters for play, so it's never removed)
4. **Later, if you want it:** walls blocking lamp light (light that doesn't pass through a cliff). It's possible because lamps don't move, so it could be worked out once per course too, but it's the most work, so it's last.

The shadow calculations are plain functions (course in, shadow grid out), so they get **unit tests** like the rest of the game.

### 2.4 Air: fog, mist, cloud shadows and light shafts

- **Cloud shadows (day, thornwood):** a huge soft blotchy pattern drifts slowly over the ground, darkening it by about 15%. One moving layer. Cheap and very effective.
- **Ground fog (bog, spooky):** mist that collects in **low** tiles, because we know the heights. Two layers of drifting noise at different speeds, clearest on high ground and thickest in hollows.
- **Distance haze:** tiles further up the screen get a small push towards the theme's sky colour.
- **Light shafts (day, thornwood, night):** a few angled, see-through bright strips that sway and fade in and out slowly. Additive, so they brighten what's under them.

### 2.5 Particles

Small moving pixels, each theme from its preset: dust motes (drift, catch the light inside light shafts), pollen, falling leaves (tumble), spores, midges, embers (rise), star sparkles (fall and twinkle), dripping dust. **Starting numbers:** at most 40 on screen per type, 1 to 2 pixels each, spawned around the camera only. The hero's rolling also kicks up a few particles by surface (grass bits, sand puffs), which joins the "animation for most actions" list.

Particles may use ordinary randomness, because they're display only and never feed back into the game. Nothing in `src/sim/` or `src/gen/` changes.

### 2.6 Finishing touches (camera)

- **Bloom:** bright pixels (lights, the exit, sparkles) get a small halo. At our resolution that's a 1 to 2 pixel glow; it's subtle.
- **Colour grade:** the preset's tint and saturation over the whole picture, plus a gradient map for shadows and highlights (e.g. night: blue shadows, warm highlights).
- **Vignette:** corners darkened about 15%.
- **Tilt-shift (the *Octopath* look):** the top 20% and bottom 10% of the screen slightly blurred. **Default: off**, available in the U panel to try. At 384 × 216 the blur is chunky and can make the edges of the course hard to read, and you need to see the edges to aim. If you like it, we turn it on for some themes.
- **Water shimmer:** water tiles get a slow wobble and a few sparkles where light falls on them.

## 3. Settings and speed

| Setting | Choices | Default |
|---|---|---|
| Lighting | on / off | on |
| Shadows | on / off | on |
| Atmosphere (fog, particles, shafts, bloom) | full / light / off | full |

"Light" keeps the colour grade and lights but halves particles and drops bloom and fog layers.

**Speed target:** at least 60 frames per second on an ordinary laptop with everything on. I'll measure the frame time with the automatic browser in the busiest theme, and report the number for each layer. If a layer is too slow, it's cut down before you see it.

## 4. The "light lab" (a tuning tool for you)

Like the U panel for physics, a **light lab** section in the U panel:

- switch each layer on and off
- sliders for the current theme's preset: ambient brightness and tint, sun angle, shadow darkness, fog amount, particle amount, bloom, vignette, tilt-shift
- a theme picker, to see any course in any theme
- a **"copy numbers"** button that gives you the preset as text, which you paste to me (or straight into `src/content/atmosphere.ts`) to keep it

That way you can tune the look by eye, as a tester would, instead of describing it to me in words.

## 5. Build order: four small steps, each with a test build

| Step | Builds | What you'll be able to judge |
|---|---|---|
| **L1: light** | atmosphere presets, the light map, the light sources table, the exit and hero lights, the new Darkness, the settings switches, the light lab | does night *feel* like night; are lamps placed well |
| **L2: shadows** | cliff shadows from the sun, contact shadows, moving object shadows | does the terrain look solid; can you still read slopes and heights |
| **L3: air** | colour grade, cloud shadows, ground fog, haze, light shafts, particles, water shimmer | does each theme have its own mood |
| **L4: camera** | bloom, vignette, tilt-shift trial, a speed pass, final numbers per theme | the overall feel, and whether it runs smoothly |

**About placeholder art.** The main sheet put lighting last because it's easier to judge on final art. Building it first is fine: the layers work with any art, and the presets are numbers you can retune once the art arrives. Expect one short tuning pass after round 9b.

## 5a. Built: step L1 (2026-11-26)

What was built, and where it differs from the plan above:

- **Theme looks, the light map and the light sources** as in sections 2.1 and 2.2: `src/content/atmosphere.ts` (numbers), the manifest (colours), `src/render/atmosphere/` (drawing). The lamp post reuses the town's lamp sprite; the glow mushroom, the ground lantern and the tree lantern are new placeholder props.
- **Changed: where lights are placed.** Section 2.2 said the generator's detail dial would place them. They're placed by the course screen instead, from the course, the theme and the course's seed, with their own random stream. Why: the generator doesn't know the theme, and adding to its random draws would change every generated course. A bonus: the U panel's theme list now shows lamps straight away, on every course, including hand-built ones. The tests check lights never stand on the start, the exit, a rail, an object or a slope, and keep 3.5 tiles apart.
- **Added: a faint glow on top.** Multiplying can only darken, and the dark themes are drawn dark already, so a lamp couldn't warm the ground round it. Each light is also added on top, faintly (`glow`, 0.35; the hero's 0.3 of that, so the Darkness modifier doesn't wash the hero out). Tunable in the light lab.
- **Ambient colours raised** for the dark themes (night `#5c6aa0`, starfall `#7c68a8`, underground `#56565e`, spooky `#5e5878`): their art is already recoloured dark, so the light map darkens it less than the section 2.1 percentages.
- **Settings:** the Lighting switch is in the U panel for now (and `?lighting=0` in the address); the settings screen comes in round 9a.
- **Not yet:** the light map is on courses only, not the town or the map screen. Light spills down cliff faces below a lamp; shadows (step L2) will deal with the terrain.
- **Speed:** in the headless test browser (software drawing, no graphics card) a frame took about 21 ms with lighting off and 22 to 26 ms with it on. On a real graphics card the two extra layers should cost far less; please report any slowdown.

## 6. What stays the same

- The rules, physics, generator, bot and course check. Light props have no collision.
- The save format. Settings are saved under their own browser key.
- The ball's straight-down shadow (it shows height, which matters for play).
- Readability comes first: if a layer ever hides the aim guide, the hole, an enemy or a slope, it's toned down. Fog never covers the ball, enemies or the exit.

## 7. Questions for you

**Owner, 2026-11-26:** answered L-Q1; L-Q2 to L-Q6 take their Defaults.

| # | Question | Default |
|---|---|---|
| L-Q1 | Option A (keep 384 × 216, chunky stepped light) or B (smooth effects at full size, closer to *Octopath*, bends pillar 1)? (section 1) | **Answered (owner, 2026-11-26): A, with B in reserve** |
| L-Q2 | Do the presets in section 2.1 sound right for each theme's mood? | as listed |
| L-Q3 | Tilt-shift: off and available to try, or on from the start? (section 2.6) | off, try it in the light lab |
| L-Q4 | A day-to-dusk change during a run (each course a little later in the day), or keep one fixed look per theme? | one fixed look per theme (themes already change after each boss) |
| L-Q5 | Walls blocking lamp light (section 2.3, item 4): build it in L2, or leave it for later? | later |
| L-Q6 | Build order L1 to L4 (section 5)? | yes |

## 8. Things you'll be asked to playtest (once built)

- Play one course in each theme with everything on, then with each layer off in turn (light lab). Which layer adds the most? Does any of them make the game harder to read?
- In a dark theme, can you always find the exit and see the ball?
- In a bright theme, do the cliff shadows make heights and slopes **easier** or **harder** to judge before a shot?
- Turn Atmosphere to "off": does the game still look and play right?
- Watch for slowdown in the bog and spooky themes (the most fog and particles).
