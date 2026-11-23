# Style guide

The rules that make every sprite look like part of one game. The owner designs the
shapes and choices; these rules, and the Pixel Press that checks them, keep the look
consistent. Signed off with the art pipeline (owner, 2026-11-23).

**The house style is "B2" (owner, 2026-11-23):** round, chunky, cute shapes with a bold
dark outline, plus a little extra light (a cool rim light, shine spots, soft ground). The
owner chose it from the style lab (`npm run art:styles -- blend`) over softer-outlined,
more painterly options. In short: *soft shapes, bold ink, a touch of light.*

| Setting | B2 |
|---|---|
| Shades per colour | 3: shades 2, 3, 4 of a ramp (bright) |
| Outline | Dark ink, grey 0, all the way round (`outline: ink`) |
| Inner lines | Ink lines (grey 1) where one part overlaps another: head over body, segment over segment |
| Rim light | Cool, blue 4, along the right-hand edges of round shapes |
| Shine | Near-white spots (grey 4) on glossy round things |
| Eyes | Big, tall ovals with a shine pixel |
| Blush | A pink cheek (pink 3) on creatures |
| Ground | Soft grass: plain, with a few big gentle patches and rare blades |
| Shadow under things | Dotted (dithered) soft shadow |
| Size | Today's sprite sizes, except the hero: **Rollo, Thud and Pip are 18×24** (owner, 2026-11-23). Chosen sizes are in `art/targets.json` |

## Palette

- **Ten ramps of five shades** (`art/palette.json`): red, orange, gold, green, blue,
  purple, pink, brown, tan, grey. 50 colours in all ("about 48", Q2).
- A **ramp** is one colour from dark (shade 0) to light (shade 4). Shadows lean cool
  (towards blue or purple) and highlights lean warm (towards yellow). This is called
  *hue shifting*; it is why pixel art looks rich instead of muddy grey.
- Colours are rounded to 16-bit console depth (5 bits per channel).
- Sprites use **only** these colours. The style check fails anything else.

## Light and shading

- Light comes from the **top left**. Objects use **three shades**: shade 4 on the
  top-left, shade 3 for the main colour, shade 2 on the lower-right and underneath.
  Shades 0 and 1 are kept for ink lines, tiles, shadows and themes.
- Keep shading in big, simple areas. Avoid "pillow shading" (dark all round the edge,
  light in the middle): it makes things look flat.
- **Rim light:** a few blue 4 pixels on the right-hand edge of round shapes, as if a
  cool light were behind them. Small sprites get one or two pixels at most (a big rim
  on a 12-pixel item looks like a blue shard).
- **Shine:** one or two grey 4 pixels on the top-left of glossy round things (shells,
  acorns, stars). Not on fur, cloth, wood or rock.

## Outlines

- Game objects (hero, enemies, pickups, props, scenery) have a **dark ink outline**
  (grey 0) all the way round: `outline: ink` in a sprite file adds it. (Owner,
  2026-11-23, style B2. This replaces the first default, each colour's own darkest
  shade, Q3.)
- **Inner lines** in grey 1 where one part overlaps another (head over body, one
  body segment over the next), drawn on the front part's edge.
- Tiles and cliff faces have no outline: they join up into ground.

## Faces

- Creatures have **big eyes**: a tall oval of grey 0 with one grey 4 shine pixel at its
  top-left. Sleeping or squinting eyes are a short curved line.
- A **pink blush** (pink 3) under the eye on friendly or cute creatures. The owner
  decides per creature whether villains get it.

## Contrast with the ground

- Things you hit, collect or avoid must stand out from the ground they sit on. Most
  courses are green grass, so an enemy that is mostly **green** blends in (seen in the
  first mock-up, 2026-11-23). Proposed rule: enemies and pickups use green only as a
  second colour, or have a strong light/dark difference from the grass.
  **Waiting for the owner's decision.**

## Pixels

- No half-see-through pixels, except water, glow and effects that the sprite file
  marks with `alpha`.
- No blurry edges (anti-aliasing against the background): the sprite has to look
  right on every ground and theme.
- No lonely single pixels that do not mean anything ("noise").

## Ground and shadows (for the display and the tiles, not sprite files)

- **Grass is "calm D" (owner, 2026-11-23), built:** today's two checker greens (the
  checkerboard stays, so slopes read), and on top of that, per tile, one of 11 designs
  (plain, tufts, a soft darker or lighter patch, tiny flowers) at one of four gentle
  meadow levels that drift across the course, plus 8 short shadow lines per tile.
  Everything is a small step of lightness: **no dithering** on the ground (it looked
  busy at game size). These are ground-only greens beyond the 5-shade palette
  (`art/ground.json`); themes recolour them like any ground. Which design goes where:
  `GRASS_VARIETY` in `src/content/scenery.ts`.
- Rough, sand and the other surfaces are still placeholders; they should follow the same
  rules (calm, small steps, no dithering) when they are done.
- Things standing on the ground get a soft dotted shadow under them, drawn by the game,
  not inside the sprite (so it follows slopes). Milestone 9.

## Isometric shapes

- Ground lines run at the **2:1 angle**: 2 pixels across for 1 pixel down.
- Tiles are 32×16 diamonds; one height step is 4 pixels.
- Every sprite has an **anchor**: the pixel that stands on the ground. Shadows and
  draw order use it.

## Sizes

- **Rollo, Thud and Pip are 18×24** (owner, 2026-11-23; the placeholders are 14×20), so
  the hero's face has room for the B2 eye shine, snout and blush.
- **Enemies keep today's sizes** (owner, 2026-11-23), so their art stays close to their
  physics body. An enemy grows only if a drawing has a detail that cannot fit, and then
  its body grows too and it is playtested. Everything else keeps today's size unless the
  owner chooses otherwise.
- **Keep art close to the physics size.** An enemy's body in the physics is a circle 0.6
  tiles across, about 14 pixels wide on screen; today's 16–22 pixel enemy sprites are a
  little bigger than that, which is fine. Much bigger art would look hit when the ball
  passes by without touching. Growing an enemy's art a lot means growing its body too
  (a game change, not just art).
- Sizes are in `art/ART-LIST.md`. Drawings can be any size in the sketchbook; Claude
  renders them down. A sprite may grow if it needs to (Q5); the press then asks for a
  new anchor, and Claude checks the game still lines up.

## Glow

- **Owner, 2026-11-23: the stars glow** (yellow, blue and the star marker).

- Pixels marked `glow` in the key are light sources (glowmoth, lamps, fireflies). They
  stay bright at night and will feed the Milestone 9 lighting.

## Themes and characters

- A theme swaps each ramp for its theme version (`art/themes.json`), so one drawing
  makes every theme. The owner can draw a special version for one theme; it wins.
- Character recolours (Thud, Pip) swap ramps too (`variant:` in the sprite file).

## Reading the owner's drawings

- Linework gives the shapes; **marker colouring marks the parts, not the colour**
  (owner, 2026-11-23). Uncoloured areas are a different part (often the pale body).
- Thick drawn lines become ink; thin lines become soft lines in the part's own colour.
- A line is drawn in ink only where the drawing has one: where colour simply ends (drips,
  a scalloped edge) there is no ink line.
- Leave one free pixel round the edge of the box for the outline.

## Originality

- Everything is the owner's own design. No copying or tracing of another game's
  sprites, and no describing our look as "like game X" when rendering a drawing.
