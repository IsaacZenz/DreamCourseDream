# Art pipeline: from the owner's drawings to game sprites

**Status: signed off by the owner, 2026-11-23, with one change (Q4: everything is drawn freehand in a sketchbook; Claude renders small items down to pixels). Being built.**

The owner asked (2026-11-23) for a way to design the game's art themselves, by
drawing on paper, photographing the drawing on a phone, and having it turned into
game-ready pixel art that matches one consistent style. This sheet proposes how.

It sits between Milestone 8 (waiting for the owner's playtest) and Milestone 9
(final art, animation, lighting). It is a tool, not content: it adds no enemies,
gear or rules.

---

## 1. What the game needs (summary of the current art list)

`assets/manifest.json` has **235 sprites** (475 counting theme variants). Every one
is a placeholder made by `npm run art` (`tools/make-placeholder-art.ts`).

| Group | Count | Typical size (pixels) | Notes |
|---|---|---|---|
| Tiles and cliff faces | 29 | 32×24 tiles, 16×16 faces | Each tile has 25 to 100 frames (13 slope shapes, checkerboard, water shimmer). **Not drawable by hand frame by frame**; see 4.3. |
| Hero (armadillo, balls) | 11 | 14×20, 8×8 | 3 characters × 2 facings × 6 frames today; Milestone 9 adds curl, hurt, on-its-back and flip poses. |
| Enemies and bosses | about 25 | 16–22 px bugs; bosses 44–48 px | All insects. Bosses also need cutscene art in Milestone 9. |
| Objects, pickups, effects | about 28 | 6–32 px | Stars, hearts, gates, crates, clouds, puffs, flags. |
| Scenery | 11 | 12×8 to 22×40 | Recoloured per theme. |
| Gear | 70 | 12×12 | The biggest group. Small icons. |
| Icons and UI | 44 | 5–14 px, and a 4×6 font | Abilities, statuses, traits, map nodes, upgrades. |
| Places (town, rooms) | 17 | up to 64×84; rooms 384×216 | Rooms are full-screen pictures. |

Milestone 9 will add: more armadillo poses, two shopkeepers (animated), boss
cutscene pictures, title screen, a slot-machine wheel, light sources (lamps,
fireflies, glowing bugs) with dynamic shadows, and several variants per theme.

## 2. The workflow (one item, start to finish)

1. **Pick an item from the Art List** (section 3). Each item has a code such as
   `G14` and a box size.
2. **Look up its size** on the Art List (the contact sheet shows the placeholder
   enlarged, so you know what you are replacing).
3. **Draw it in the sketchbook**, freehand, any size (owner, 2026-11-23). Write the
   code next to the drawing. Optional: write colour
   words on regions ("shell: dark red", "eyes: glow").
4. **Photograph it in the Claude app on the phone** and send it in a Claude Code
   session on this repository, with a message like "G14, keep the handle thin".
5. **Claude turns it into a sprite source file** (section 4): the drawing becomes a
   text grid of palette letters at the item's exact size. The photo is kept.
6. **The Pixel Press tool builds it**: applies the style rules, makes the
   left-facing copy, the character recolours and the theme variants, writes the
   PNG and the manifest entry, and runs the style check.
7. **Claude sends back a preview** on the phone: the sprite at 1×, 4×, and in the
   game (a screenshot on a course or in a town) next to its neighbours.
8. **The owner says yes or asks for changes.** Approved items are marked done on the
   Art List and committed.

### Using it from the phone

- Open the Claude app, go to **Code**, and open (or start) a session on
  `IsaacZenz/DreamCourseDream`. Attach the photo with the attach button and send
  it. Claude can see the picture, write files, build the sprite and send preview
  images back to the chat.
- **Fallback** if attaching a photo is not offered in that screen: upload the
  photo to the repository's `art/inbox/` folder with the GitHub app or website
  (Add file → Upload files), then tell Claude the file name. This also keeps the
  original photo in the project.
- Photo tips: flat page, even light, no shadow of the phone, whole page in frame,
  dark pen (a fine black marker beats pencil).

## 3. The Art List (the "key")

A generated table, `art/ART-LIST.md`, made by a script from the manifest so it can
never drift from the game. One row per sprite: code, sprite ID, group, size,
frames, what it is and where it appears, which themes it has, status
(placeholder / drawn / approved).

**Codes.** The owner proposed spreadsheet cells (A1, A2). Proposed change: keep that
look, a letter for the group and a number, but make each code **permanent**: once
`E7` is the Spittlebug it stays the Spittlebug, even if rows are added or sorted.
Spreadsheet cell names shift when rows move, which would make an old drawing point
at the wrong thing. New items get the next free number.

| Letter | Group |
|---|---|
| T | Tiles and cliff faces |
| H | Hero and balls |
| E | Enemies |
| B | Bosses (sprites and cutscenes) |
| O | Objects, pickups, effects |
| S | Scenery |
| G | Gear |
| I | Icons and UI |
| P | Places (town buildings, props, rooms) |

The same list can be shown as a page on the phone with each placeholder's picture
beside it (an optional extra; see section 8).

## 4. Making the style consistent: the Pixel Press

Consistency comes from rules the tool enforces, not from drawing carefully every
time. The owner designs **shapes and choices**; the tool applies the **style**.

### 4.1 The style guide (`art/STYLE.md`, owner-approved)

| Rule | Proposed default |
|---|---|
| Palette | One master palette of about 48 colours in **ramps** (each ramp is 4–5 shades of one colour, dark to light), using 16-bit console colour depth (5 bits per channel, as the placeholders already do). Every sprite uses only these colours. |
| Colours per sprite | Small sprites (≤ 16 px): at most 3 ramps plus outline. |
| Light | Comes from the top left. Lightest shade on top-left edges, darkest bottom-right. |
| Outline | Dark outline around game objects (one colour per ramp: its darkest shade, not black), so they read against any ground. Tiles have no outline. |
| Pixels | No half-transparent pixels except water and glow; no blurry edges (no anti-aliasing against the background); no stray single pixels. |
| Iso | Ground lines follow the 2:1 isometric angle (2 across, 1 down). Things stand on their anchor point. |
| Glow | Pixels marked "glow" are drawn at full brightness at night and feed the Milestone 9 lighting. |

### 4.2 The sprite source file (one per sprite, `art/src/<code>-<id>.sprite`)

A plain text file the owner can read: a header (code, ID, size, anchor, which
ramps the letters mean) and a grid of letters per frame, plus an optional glow
layer. The placeholder script already draws some sprites this way (`rows()` in
`tools/make-placeholder-art.ts`), so it fits the project. Text means every change
shows in git as a readable difference, and a fix is a small edit.

### 4.3 What the tool does with it (`npm run art:press`)

- Checks the file: right size, only palette letters, anchor inside.
- Shading helpers (optional per sprite): fill a region with a ramp letter and the
  tool shades it by the light rule; auto-outline.
- **Mirroring:** draws the left-facing copies (armadillo-left etc.) automatically.
- **Character recolours:** Thud and Pip are made from Rollo's drawing by swapping
  ramps, so one drawing covers three characters.
- **Themes:** each theme is a **ramp swap table** (grass ramp → bog ramp and so on)
  instead of today's colour maths. One drawing gives all seven themes, and the
  owner can still draw a special version for one theme, which wins.
- **Tiles:** the owner draws a **texture swatch** (a flat tile's top, and a cliff
  face) and the tool wraps it onto all 13 slope shapes, both checkerboard shades and
  the water frames. This is the only way the 25–100 frames per tile are realistic.
- Writes the PNG and the manifest entry with the **same ID, frame size and anchor**
  as the placeholder, so the game needs no code changes (CLAUDE.md rule 5).
- `npm run art` keeps making placeholders, but skips any ID that has an approved
  source, so a placeholder can never overwrite the owner's art.
- **Style check** (also a unit test): every final PNG is checked against the
  palette and the transparency rules, and its size against the manifest.
- **Preview sheet:** the sprite at 1× and 4×, all its theme variants, and beside
  similar sprites, plus an in-game screenshot.

### 4.4 Turning a photo into the grid

Two steps, honest about what each does well:

1. **Draft by the tool.** The photo is cleaned (straightened, paper whitened, lines
   darkened), cropped to the box, and shrunk to the target size. This gives a rough
   silhouette and is good for large pictures (rooms, bosses, cutscenes, buildings).
2. **Claude finishes it by hand** in the text grid: picks the pixels that keep the
   drawing's character (eyes, shape of the shell), applies the style rules, and
   lists any guesses it made for the owner to check.

**Small items (owner, 2026-11-23): freehand in the sketchbook, Claude renders them
down.** Shrinking a drawing to 12×12 by maths turns it to mush: a 12×12 icon has
only 144 pixels, and every one is a decision. So for anything about 24 px or smaller:

1. Claude lists the drawing's **key features** (for example: "curved hook at the
   top, three stripes, a round eye") and which ones must survive at that size.
2. Claude makes **two or three render-downs** that keep different things (one
   faithful to the outline, one that exaggerates the most recognisable feature,
   one simplified for readability), as sprite files.
3. `npm run art:preview` shows them side by side at 1× (true size) and enlarged,
   next to the placeholder. The owner picks one, or mixes ("A's body, B's eyes").
4. If a feature cannot fit, Claude says so and suggests a fix (drop it, make it a
   single pixel, or grow the sprite, Q5).

Larger items use the same steps with one render-down instead of three.

## 5. Contact sheets (replaces printed drawing sheets, owner 2026-11-23)

The owner draws in a sketchbook, so nothing needs printing. Instead `npm run art:list`
also makes one picture per group (`art/list/<letter>.png`): every placeholder
enlarged with its code under it, so on the phone it is easy to see which code is
which and how big it is. For animated items it shows every frame.

## 6. How this fits the coming milestones

- **Milestone 9 "final art through the manifest only":** satisfied, since pressed
  sprites keep IDs, sizes and anchors.
- **"Several art variants per theme":** ramp swap tables, plus hand-drawn overrides.
- **Armadillo poses and shopkeepers:** sprite files have several frames; the sheet
  has frame strips. New poses need new frame names in the manifest; that part of the
  code is Milestone 9 work, not this tool.
- **Lighting and dynamic shadows:** the glow layer marks light pixels; clean
  transparency and anchors give shadows a correct outline.
- **Boss cutscenes, title screen, rooms:** large pictures use the photo-draft path.
- **Sizes may change.** If the owner wants a bigger sprite than the placeholder
  (for example a 24 px boss bug becomes 32 px), the source file says so and the
  manifest follows; Claude checks the game still lines up (anchors, hit sizes are in
  the simulation and do not change with art).
- **Originality (rule 1):** the owner's drawings are original. Claude will not
  copy any existing game's sprites into the grid, and the style guide describes a
  look in our own words, not by naming another game.

## 7. Build order (once signed off)

1. `art/STYLE.md` with the palette, approved by the owner from a printed swatch
   page and a mock-up of three existing placeholders redrawn in it.
2. Art List generator and permanent codes.
3. Sprite source format, Pixel Press, style check, placeholder skip rule.
4. Contact sheets (the owner draws freehand, so no printed sheets).
5. **Pilot:** the owner draws three items (one gear icon, one enemy, one larger
   scenery or place item) and runs the whole loop from the phone. Fix whatever is
   awkward.
6. Theme ramp swaps and tile swatch wrapping.

## 8. Questions for the owner

| # | Question | Default if not answered |
|---|---|---|
| Q1 | Permanent codes (letter + number that never change) instead of spreadsheet cell names? | Yes, permanent codes |
| Q2 | Palette size: about 48 colours, or tighter (32) for a stronger retro look? | About 48 |
| Q3 | Outline colour: darkest shade of each object's own colour, or one dark colour for everything? | ~~Darkest shade of its own colour~~ **Owner, 2026-11-23 (style B2): one dark ink colour for everything** |
| Q4 | Small items drawn on the pixel grid sheet, freehand for large ones? | ~~Yes~~ **Owner: everything freehand in a sketchbook; Claude renders small items down** (section 4.4) |
| Q5 | Keep sprite sizes as they are, or allow some to grow when you draw them? | Allowed, Claude checks the game still fits |
| Q6 | Also make the Art List a phone-friendly page with each placeholder's picture? | Yes, after the pilot |
| Q7 | When to build this: now (before the Milestone 8 playtest is finished) or after? | Now; it touches no game rules |

## Sign-off

- [x] Owner signed off this sheet, 2026-11-23: "everything is good", all defaults (Q1 permanent codes, Q2 about 48 colours, Q3 own darkest shade, Q5 sizes may grow, Q6 phone page after the pilot, Q7 build now), except Q4: everything is drawn freehand in a sketchbook and Claude does the render-down for small items.

## As built (2026-11-23)

- **Art List:** `npm run art:list` writes `art/codes.json` (232 permanent codes: T 29,
  H 8, E 21, B 3, O 28, S 11, G 70, I 45, P 17), `art/ART-LIST.md` and contact sheets
  `art/list/<letter>.png`, plus `art/list/palette.png`. Flipped copies (`-left`) get no
  code of their own; Thud and Pip have their own codes and can be recolours of Rollo.
- **Sprite files:** format at the top of `tools/art/sprite.ts`; finished ones in
  `art/src/`, render-down choices in `art/drafts/`, Claude's style mock-ups in
  `art/mockups/` (E1 Snoozegrub, G13 Pin Needle, S8 Mushrooms; never pressed).
- **Press:** `npm run art:press`; `npm run art` runs it last. Checks the code against the
  Art List, the frame names against the game's, and asks for a new anchor when a
  sprite changes size. A themed press replaces the placeholder's theme recolours.
- **Preview:** `npm run art:preview -- <files or codes>`: true size and 3× on grass and
  dark, enlarged, every copy made automatically, and the sprite in the game now.
- **Style check:** `tests/art.test.ts` checks every approved sprite's colours,
  transparency and size, and that every sprite has a code.
- **Checked in the game:** the mock-up Snoozegrub pressed in showed correctly on the
  test bench with no code change, then was removed (placeholders back, assets unchanged).
- **Learned:** a mostly green enemy blends into the grass. Proposed rule in
  `art/STYLE.md` (contrast with the ground), waiting for the owner.
- **Not built yet:** photo clean-up for large drawings (wait for the pilot to see how
  photos arrive); tile texture swatches (last step); the glow layer is read from sprite
  files but not used until the Milestone 9 lighting.
- **House style chosen (owner, 2026-11-23): B2.** After asking for a more stylised look,
  the owner compared six styles, then a series of steps between two of them, in the
  style lab (`tools/art-style-lab.ts`, `npm run art:styles` and `npm run art:styles -- blend`).
  B2 is round, chunky shapes with a bold ink outline, plus a cool rim light, shine, soft
  grass and dotted shadows. Written into `art/STYLE.md`; sprite files got `outline: ink`;
  the three mock-ups were redrawn in B2. The palette is kept as it is (the B2 samples use it).
- **Hero size chosen (owner, 2026-11-23): Rollo, Thud and Pip are 18×24** (were 14×20), after a size test in the town (`art/drafts/H6-size-test-*.sprite`). Recorded in `art/targets.json`, which the Art List shows in bold and the press enforces. **Owner, 2026-11-23: enemies keep today's size**, so their art stays close to their 0.6-tile physics body.
- **First pilot drawing (owner, 2026-11-23): a test Rollo (H6), not the final design.**
  - **How photos arrive:** a photo attached in the Claude app reaches the session as a
    file, so it can be kept (`art/inbox/H6-test-drawing.jpg`) and read by tools. The
    GitHub upload fallback was not needed.
  - **Automatic step:** a prototype reads the drawing's lines and enclosed shapes (shell
    cap, bands, belly strip, head, tail, feet, the eye dot) and shrinks them to the sprite
    size. It got the layout and silhouette right, but at 18×24 the lines filled whole
    bands and the head lost its ears and snout (`art/drafts/H6-test-a-automatic.sprite`).
  - **Hand finish:** Claude redrew it by hand following the shapes: thick drawn lines
    became ink, thin band lines became soft grey lines, the dot eye became the B2 eye
    (`art/drafts/H6-test-b-hand-finished.sprite`). Two rounds were needed (the first came
    out boxy with a neck-like belly strip). Checked in the town, then removed.
  - **Learned:** the drawing was a little wider than tall (long snout and tail), while
    Rollo's box is taller than wide; the snout and tail were shortened to fill the
    height. Worth keeping in mind when drawing: roughly fit the item's box shape.
  - **Tool decision:** the shape reader is worth turning into a proper tool for large
    items (rooms, buildings, bosses), where it saves the most; for small sprites it is
    only a starting layout.
  - **Owner's edit, 2026-11-23:** the owner picked A (automatic) and asked for the shell 1 pixel thinner and the snout 1 pixel longer with a squared end like B. A's snout already touched the box edge, so the drawing was moved 1 pixel left and the tail tip trimmed 1 pixel to keep the outline inside the 18×24 box (`art/drafts/H6-test-c-from-a.sprite`). Lesson: edits are quick in the text grid, and the box edge needs a free pixel for the outline.
  - **Owner, 2026-11-23:** the edited A "looks good for the test". Pilot item 1 of 3 done (test only; the final Rollo comes later). Next: G13.
- **Pilot item 2: G13 Pin Needle (owner, 2026-11-23) — first owner art in the game.**
  The drawing had five elements (needle eye with hole, teardrop shaft, tip drop, two
  drips, three fumes); 12×12 leaves a 10×10 drawing area, so three render-downs kept
  different things (`art/drafts/G13-a/b/c.sprite`). The owner chose **C, poison-coated**:
  the shaft turns green towards the tip, one drip, a teardrop drop, fumes as two specks.
  Approved as `art/src/G13-gear-pin-needle.sprite`, pressed into the game, checked on the
  test bench. Learned: a lone pixel gets its own ink outline, so tiny details (fumes)
  turn to noise; a rim-light pixel next to a hole reads as a gem; green poison is a little
  muted on grass but the ink outline keeps it readable.
- **E1 redo (owner, 2026-11-23):** the owner redrew the Snoozegrub with **marker colouring to mark the parts** (the marker's colour is irrelevant; recorded in `art/README.md` and `art/STYLE.md`). New design: a plain dome and a front plate whose scalloped edge hangs over the head like a fringe, drips running down over the pale body, a small back plate, `> <` squeezed eyes and a frown, two segment notches. Rendered with a part map (each part shaded by the B2 rules, ink lines only where the drawing has lines): `art/drafts/E1-redo-a.sprite` and `E1-redo-b.sprite` (bolder drips). Learned: lighting every edge between parts makes noise; light the outer top-left edge only, and add a small shadow under overhangs.
  - **Owner, 2026-11-23:** picked redo B and asked to squish the face down so it is less square. The head's top came down one row (the front plate grows to meet it). The face then needed rearranging: the eyes' bottoms and the frown's top shared a row and read as a grid of x's. Two fixes: frown one row lower (`E1-redo-b-squished-1`), or two-row squinting eyes (`E1-redo-b-squished-2`).
