# Handoff: organic wall textures (2026-11-26)

This is for the art director (ChatGPT) producing the exposed-earth wall art. The wall system was built on 2026-11-26 at the owner's request.

**Status tags used in this document:**

| Tag | Meaning |
|---|---|
| [BUILT] | It works today |
| [OWNER] | The owner decided it |
| [DEFAULT] | A working choice the owner may change |
| [ASK] | What we need from you |

## 1. What changed

**[BUILT]** Wall geometry and wall texture are now separate:

- **Geometry is unchanged.** A ledge side is still drawn as the same 4-pixel bands, at the same places and depths, with the same masks.
- **Texture is new.** Each band no longer repeats one small sprite. It shows its own slice of a **tall texture strip**, so a rock can run across several bands with no seam.
- **Different walls start the strip at different rows.** So neighbouring walls don't line up.

Each tile edge picks its look **once**, from the course seed, the tile position and the side (left or right). The same course always looks the same: across frames, camera moves and reloads.

Earth walls are painted in **four layers**, in this order:

| # | Layer | Alpha | How often |
|---|---|---|---|
| 1 | Soil | opaque | every earth wall; one of the soil textures |
| 2 | Embedded rocks | see-through | **[OWNER]** plain soil (no rocks) 25%, sparse 40%, moderate 25%, large formations 10% |
| 3 | Details (roots, moss) | see-through | supported, no art yet ([ASK], optional) |
| 4 | Grass overhang | see-through | along the **top edge only**; follows sloped tops; never repeats down the wall |

**Other materials are unchanged.** Sand, ice, metal, wood and bumper walls keep their old repeating faces until they get textures too.

## 2. Texture types and exact sizes

All textures are **PNG, 8-bit RGBA, at native size (1×)**, with nearest-neighbour edges (no anti-aliasing). `<side>` is `left` or `right`; **both sides are needed for every texture**.

| Type | Sprite id | Width | Height | Alpha | Repeats vertically? |
|---|---|---|---|---|---|
| Soil | `wall-earth-soil-<n>-<side>` | **16** | **H**: any height; 48 today; 32 to 128 recommended, a multiple of 4 is tidy | **fully opaque**, every pixel | **yes**: row H−1 must flow into row 0 |
| Rocks | `wall-earth-rocks-<kind>-<n>-<side>`, kind = `sparse`, `moderate` or `large` | **16** | **H** (may differ per texture) | transparent background; rock pixels opaque (partial alpha allowed, sparingly) | **yes**: a rock crossing the bottom continues at the top |
| Details | `wall-earth-<roots\|moss>-<n>-<side>` | **16** | **H** | as rocks | **yes** |
| Overhang | `wall-earth-overhang-<side>` | **16** | **1 to 8** rows (3 today) | transparent background | **no**: it's only drawn at the top |

**Why 16 wide:** one tile edge is exactly 16 screen pixels wide. The neighbouring edge to the left or right uses a different texture and a different row, so:

- Keep columns 0 and 15 calm (plain soil colour, no half-rocks cut by the edge).
- A rock cut at the strip's side will look cut off.

**Why vertical repetition matters:** walls can be taller than the strip (the course rim goes 2 steps below ground; cliffs reach 12+ steps), so the game wraps rows. Make the strip **tile vertically**. Large formations should either fit inside the strip or wrap cleanly.

## 3. The coordinate system (texture space)

**[BUILT]** A wall texture is drawn **the way it looks on screen**, sheared like the face:

- **Left face** (the lower-left side of a tile): its bands slope **down to the right** by 1 pixel every 2 columns. The top edge of a flat-topped wall runs from (0, 0) to (16, 8).
- **Right face** (lower-right side): its bands slope **up to the right** by 1 pixel every 2 columns. The top edge runs from (0, 8) to (16, 0).

So **draw rock strata and long rocks along that slope** to sit naturally in the wall. Round rocks need no special treatment.

`templates/wall-texture-guide-<side>-16x48.png` marks where the 4-row bands start when a strip is used from row 0. Red marks every 3rd band. **The game shifts each wall by its own random row**, so never rely on these lines. Rocks must not snap to them; ignoring the band grid is the whole point.

**How the game reads it:**

```
wall row  r = y + depth            (y: row inside the 16x16 band frame; depth: 4 per height step below the top band)
soil row    = (r + soilShift) mod H_soil
rocks row   = (r + rockShift) mod H_rocks
column      = x                     (0..15)
overhang:   d = r − topRow[x]       painted only when 0 ≤ d < H_overhang; reads overhang (x, d)
```

`soilShift`, `rockShift` and `detailShift` are chosen per edge from the seed, from 0 to 255. `topRow[x]` is the first visible wall row in column x (`templates/edge-top-rows.json`). **The overhang is therefore drawn edge-relative, not sheared:** draw it as if the grass edge were a flat line along its top row, and the game bends it to fit flat, sloped and steep tops.

## 4. Masks and geometry templates (`templates/`)

| File | What it is |
|---|---|
| `band-masks/face-mask-<side>.png` | The 5 band frames side by side (80×16): `full`, `capA`, `capB`, `capA2`, `capB2`. White = the pixels a band may paint. **The game paints only inside these masks** |
| `band-masks/face-mask-<side>-<frame>.png` | Each frame on its own (16×16) |
| `edge-masks/edge-<side>-top-<frame>.png` | A whole wall 6 steps tall in wall-row space (row 0 = the top band's anchor), for each top shape. Each band is a different pastel, so you can see which rows of your strip appear where. `top-full` is a flat-topped wall; `capA`/`capB` are walls under a gentle slope; `capA2`/`capB2` are under a steep slope |
| `edge-top-rows.json` | The first visible row of each column, per side and top shape (used by the overhang) |
| `wall-texture-guide-<side>-16x48.png` | The shear guide (section 3) |

**Band frames:**

| Frame | What it is |
|---|---|
| `full` | one height step (4 px) |
| `capA` | the triangle above the bands when the edge's first corner is one step higher |
| `capB` | the same when the second corner is one step higher |
| `capA2`, `capB2` | the same for a two-step difference |

The edge's first corner is sw for left faces and se for right faces.

**Anchors** ([BUILT], unchanged): a band's anchor is the left end of its top edge:

| Face | Anchor | Where it sits |
|---|---|---|
| left | (0, 0) | the tile's sw corner |
| right | (0, 8) | the tile's se corner |

## 5. The manifest and delivery format

**[BUILT]** Each texture is **one frame named `"0"`**. Its manifest entry looks like this:

```json
"wall-earth-rocks-large-1-left": {
  "file": "sprites/wall-earth-rocks-large-1-left.png",
  "frameWidth": 16,
  "frameHeight": 48,
  "frames": ["0"],
  "anchor": [0, 0]
}
```

The anchor is `[0, 0]` for left and `[0, 8]` for right. It's informational: textures are never drawn directly.

**How to deliver:** for each texture, send `<id>.png` plus `<id>.json`:

```json
{ "frameWidth": 16, "frameHeight": 48, "frames": ["0"], "anchor": [0, 0] }
```

The developer puts them in `art/drawn/` and runs `npm run art`. Files in `art/drawn/` always win over generated placeholders, so they're never overwritten.

**Themes:** the game has 7 looks (day, bog, thornwood, starfall, night, underground, spooky). Theme versions are made automatically by recolouring your day art. To hand-make a theme version, send `<id>@<theme>.png`, for example `wall-earth-soil-1-left@bog.png`.

**Adding variants is data only.** For example, a fourth sparse texture or a roots layer is a new line in `src/content/walls.ts` with its weight. Tell us the ids you deliver.

## 6. Lighting and colour

- **[OWNER]** Don't bake environmental shadows, ambient occlusion, cast shadows or atmospheric light into the textures. Dynamic lighting and shadows will be added by the engine later.
- **[DEFAULT]** Keep B1B's tone difference between the sides: left faces lighter, right faces darker. That describes the material and form, not the environment. If the lighting engine later wants neutral faces, this is the one thing to revisit.
- Use the B1B palette as the reference. The approved B1B grass (`tile-grass`) must not change.
- 15-bit colour is a style goal, but the code doesn't enforce it.

## 7. What's in the game today

[BUILT] **Stand-in textures built from B1B pieces**, so the game has something to show:

- Soil is B1B's flat soil colour with its two accent colours as scattered specks.
- The rocks are B1B's own rock pixels, lifted out of the variants v1 to v6 and placed at varied heights.
- The overhang is a **placeholder** in B1B grass greens.

They're in `current-textures/`. **They're limited by B1B's 4-pixel bands: no rock is taller than 4 pixels, so there are no real "large formations".** That's the main thing new art should fix.

## 8. What we need from you [ASK]

1. **Soil:** 2 textures per side, 16×H, opaque, tiling vertically, quiet edges.
2. **Rocks:**
   - sparse: 3 textures per side
   - moderate: 2 per side
   - large formations: at least 1 per side, and real multi-band rocks (8 to 20 pixels tall) are welcome here
3. **Overhang:** 1 per side, 16 × 2 to 6 rows; grass drips that read with the approved grass.
4. **Optional:** roots and moss detail layers (16×H, transparent), with a suggested share (for example roots 15%).
5. **Self-check:** run `tools/preview_wall.py` on your art before delivery. Running it with `--check` on the current textures prints `matches the game: True`, which proves the preview paints exactly like the game. Look at flat, `capA` and `capA2` tops, with several shifts.

## 9. Diagnostics (`diagnostics/`)

All are real game renders at the native 384×216, with 3× nearest-neighbour copies.

| File | Shows |
|---|---|
| `diag-1-terrace` | Mixed textures on terraces 8 steps tall, a gentle ramp with sloped wall tops, and the sand block (old repeating faces, for comparison) |
| `diag-2-ramp` | A steep ramp (two-step caps) between 12-step cliffs, and pillars 2 to 6 steps tall |
| `diag-3-pillars` | Short pillars of several heights at the front |
| `*-debug` | The same views with each wall tinted by rock kind: white plain, green sparse, yellow moderate, red large |
| `before-after-ramp` | The old repeating faces (left) and the new system (right), same view |
| `generated-meadow`, `town` | A generated course and a town with the new walls |

**To see it in the game:**

| Address | Shows |
|---|---|
| `?course=walls` | the wall test course |
| `?course=walls&walls=debug` | the same, tinted by rock kind |
| `?course=walls&theme=bog` | the same in another theme |

The U panel has switches **Organic walls** (off = the old faces, for comparing) and **Wall overhang**.
