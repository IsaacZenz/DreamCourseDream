# Style guide

The rules that make every sprite look like part of one game. The owner designs the
shapes and choices; these rules, and the Pixel Press that checks them, keep the look
consistent. Signed off with the art pipeline (owner, 2026-11-23); the palette itself
is waiting for the owner's look at `art/list/palette.png`.

## Palette

- **Ten ramps of five shades** (`art/palette.json`): red, orange, gold, green, blue,
  purple, pink, brown, tan, grey. 50 colours in all ("about 48", Q2).
- A **ramp** is one colour from dark (shade 0) to light (shade 4). Shadows lean cool
  (towards blue or purple) and highlights lean warm (towards yellow). This is called
  *hue shifting*; it is why pixel art looks rich instead of muddy grey.
- Colours are rounded to 16-bit console depth (5 bits per channel).
- Sprites use **only** these colours. The style check fails anything else.

## Light and shading

- Light comes from the **top left**. Shade 4 on top-left edges, shade 3 for the
  main colour, shade 2 on the lower-right side, shade 1 underneath.
- Keep shading in big, simple areas. Avoid "pillow shading" (dark all round the edge,
  light in the middle): it makes things look flat.

## Outlines

- Game objects (hero, enemies, pickups, props, scenery) have an outline in the
  **darkest shade of their own colour** (Q3). `outline: auto` in a sprite file adds it.
- Tiles and cliff faces have no outline: they join up into ground.

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

## Isometric shapes

- Ground lines run at the **2:1 angle**: 2 pixels across for 1 pixel down.
- Tiles are 32×16 diamonds; one height step is 4 pixels.
- Every sprite has an **anchor**: the pixel that stands on the ground. Shadows and
  draw order use it.

## Sizes

- Sizes are in `art/ART-LIST.md`. Drawings can be any size in the sketchbook; Claude
  renders them down. A sprite may grow if it needs to (Q5); the press then asks for a
  new anchor, and Claude checks the game still lines up.

## Glow

- Pixels marked `glow` in the key are light sources (glowmoth, lamps, fireflies). They
  stay bright at night and will feed the Milestone 9 lighting.

## Themes and characters

- A theme swaps each ramp for its theme version (`art/themes.json`), so one drawing
  makes every theme. The owner can draw a special version for one theme; it wins.
- Character recolours (Thud, Pip) swap ramps too (`variant:` in the sprite file).

## Originality

- Everything is the owner's own design. No copying or tracing of another game's
  sprites, and no describing our look as "like game X" when rendering a drawing.
