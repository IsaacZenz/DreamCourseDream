# Art pipeline: from the owner's drawings to game sprites

**Status: draft, waiting for the owner's review (plan gate). Nothing on this sheet is built yet.**

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
2. **Print or copy its drawing sheet** (section 5): a page with the code, the
   name, a short description, and a box at the right shape. Small items get a grid
   where one square is one pixel.
3. **Draw it.** Write the code in the corner of the page. Optional: write colour
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

For tiny sprites (gear, icons, 12×12 and smaller) shrinking a freehand drawing does
not work: a 12×12 icon has only 144 pixels, and every one is a decision. So small
items are drawn **on the pixel grid sheet**, one square per pixel, and the
translation is then almost exact. Freehand linework is best for anything about
32 px or larger.

## 5. Drawing sheets

`npm run art:sheets` makes printable pages (PDF and PNG, so they also open on the
phone): per item, the code in big letters, the name, its description, the box at
the right proportions with the ground line and anchor marked, and for small items
a pixel grid. Several small items share a page. For animated items the sheet has a
strip of frame boxes (for example, the armadillo's curl: stand, crouch, half-curl,
ball).

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
4. Drawing sheet generator.
5. **Pilot:** the owner draws three items (one gear icon, one enemy, one larger
   scenery or place item) and runs the whole loop from the phone. Fix whatever is
   awkward.
6. Theme ramp swaps and tile swatch wrapping.

## 8. Questions for the owner

| # | Question | Default if not answered |
|---|---|---|
| Q1 | Permanent codes (letter + number that never change) instead of spreadsheet cell names? | Yes, permanent codes |
| Q2 | Palette size: about 48 colours, or tighter (32) for a stronger retro look? | About 48 |
| Q3 | Outline colour: darkest shade of each object's own colour, or one dark colour for everything? | Darkest shade of its own colour |
| Q4 | Small items drawn on the pixel grid sheet, freehand for large ones? | Yes |
| Q5 | Keep sprite sizes as they are, or allow some to grow when you draw them? | Allowed, Claude checks the game still fits |
| Q6 | Also make the Art List a phone-friendly page with each placeholder's picture? | Yes, after the pilot |
| Q7 | When to build this: now (before the Milestone 8 playtest is finished) or after? | Now; it touches no game rules |

## Sign-off

- [ ] Owner signed off this sheet (date, changes):
