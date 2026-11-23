# The converter: from a photo of a drawing to a first-draft sprite

**Status: signed off by the owner 2026-11-23 (all defaults); built the same day. See "As built" at the end.**

Part of Milestone 8c (art pipeline). The owner asked (2026-11-23) to build "the final
pixel art converter tool". Everything after the converter already exists: sprite files,
the press, previews, the style check and the Art List (`docs/plans/art-pipeline.md`).
During the test drawings, the photo-to-pixels step was done with throwaway scripts
outside the project. This sheet makes it a proper, repeatable tool.

## 1. What it does

```bash
npm run art:convert -- art/inbox/E1-drawing.jpg E1
```

1. **Reads the photo:** evens out the paper and light, finds the dark linework, and
   ignores the written code and anything far from the drawing.
2. **Finds the parts:** every area enclosed by lines is a part. **Marker-coloured areas
   are marked as coloured parts** (the marker colour itself is ignored; owner,
   2026-11-23). Small dark dots and short strokes inside a part (eyes, mouths) are kept
   as marks.
3. **Fits it to the box:** scales the drawing into the sprite's size from the Art List
   (or its chosen size in `art/targets.json`), keeping one free pixel round the edge for
   the outline. If the drawing's shape does not match the box (like the wide test Rollo),
   it says so and makes one version that keeps the proportions and one that fills the box.
4. **Builds a part map:** one letter per pixel saying which part it belongs to, the step
   that worked best in the pilot (Snoozegrub redo).
5. **Shades it in the house style (B2):** three shades per part, lit on the outer
   top-left edge, darker on the outer bottom-right, a small shadow under overhangs, ink
   lines only where the drawing has lines between parts, `outline: ink`, rim light and
   shine kept to a pixel or two.
6. **Writes draft sprite files** in `art/drafts/` (`<code>-a.sprite`, `-b`...) and the
   side-by-side preview, ready for Claude's hand finish and the owner's pick.

It also writes the **part map** next to each draft (`<code>-a.parts.txt`), so a hand fix
can move a part's edge and re-shade, instead of repainting pixels.

## 2. What it does not do

- **It does not replace the hand finish.** For small sprites (about 24 px or smaller)
  the converter gives the layout; Claude still places the face, trims details and makes
  the two or three choices, as in the pilot. For large items (buildings, rooms, bosses,
  cutscenes) the draft should be much closer to final.
- **It does not pick colours.** Each part gets a colour from a short list in the command
  or a default (pale body, a shell colour), because the marker colour is only a cue. The
  owner says colours in words.
- **No animation frames yet.** One drawing makes one frame. Several frames (walk cycles,
  poses) come in Milestone 9, from several drawings.

## 3. How it is built

- TypeScript in `tools/art/convert/` with a command `tools/art-convert.ts`, like the other
  art tools. Unit-tested with small synthetic drawings (a square with a line through it,
  a coloured area, a dot) so it does not need photos to test.
- Reading JPEG photos (phone photos are JPEG) needs a small decoder. **Default:** add the
  `jpeg-js` package (pure JavaScript, BSD-3-Clause licence, development only, never shipped in
  the game). PNG photos are already readable.
- Settings (how dark a line must be, how big a dot is, the rim and shine limits) in one
  file, `art/convert.json`, so they can be tuned without code changes.
- Tested on the three pilot photos already in `art/inbox/`: the converter's drafts are
  compared with the approved sprites, and the differences written up.

## 4. Questions for the owner

| # | Question | Default if not answered |
|---|---|---|
| C1 | Is a first draft plus Claude's hand finish the right goal, rather than a fully automatic converter? (Fully automatic small sprites lost too much in the pilot.) | Yes, draft plus hand finish |
| C2 | Add the `jpeg-js` package to read phone photos? | Yes |
| C3 | Colours: say them in words per drawing, with defaults when not said? | Yes |
| C4 | Build order: the converter now, or the remaining ground surfaces (rough, sand and the others) first? | Converter first |

## 5. Done when

The owner sends a photo of a new drawing from the phone, and the converter's draft needs
only a small hand finish to match the drawing in B2. Checked on one new small sprite and
one larger item (for example the gear shop or a boss).

## Sign-off

- [x] Owner signed off this sheet, 2026-11-23: "signed off, build the converter" (all defaults: C1 draft plus hand finish, C2 jpeg-js, C3 colours in words, C4 converter first).

## As built (2026-11-23)

- `npm run art:convert -- <photo> <code>`, code in `tools/art/convert.ts` and
  `tools/art-convert.ts`, settings in `art/convert.json`, tests in
  `tests/art-convert.test.ts` (made-up drawings, no photos needed).
- `jpeg-js` 0.4.4 added as a development package. Its licence is **BSD-3-Clause**, not
  MIT as this sheet first said; it also allows commercial use, and it is never shipped
  in the game.
- Extras added while testing on the pilot photos:
  - **Ink and marker told apart by darkness:** ink is darker than 42% of the paper,
    marker between that and 75%. At first the marker was read as thick lines.
  - **The paper level is measured from bright pixels only,** so big marker areas do
    not drag it down.
  - **Gaps in the outline are closed** before deciding what is inside, so a hand-drawn
    gap does not make a part vanish.
  - **Marker is decided over a small neighbourhood,** because marker strokes are streaky.
  - **Ink is drawn exactly where interior lines are** (the "ink only where you drew a
    line" rule). A line falling between two pixels goes to the pixel with more of it.
  - **The written code is left out,** including a thin letter beside other letters (the
    "1" in "G13"). A short curly stroke can look like a letter: bring it back with `--keep`.
  - **`--paint x,y=ramp`** colours the part at a spot of the photo, for drawings without
    marker or with several colours.
  - Each run also writes `art/drafts/<code>-convert-reading.png`, showing what was read
    (parts, marker, ink, marks, open strokes), and a part map beside each draft.
- **Results on the pilot photos:**
  - **E1 Snoozegrub (marker):** the stretched draft is close to the approved sprite,
    straight from the photo.
  - **G13 Pin Needle (12×12, no marker):** a starting layout; the drop and drips need
    the hand finish.
  - **H6 test Rollo (no marker, thin bands):** the silhouette and shell come through;
    the head needs a real hand finish.
  - **Lesson:** marker colouring makes the converter far more accurate; small icons stay
    mostly hand work.
- **Still to do for "done when":** one new drawing from the owner taken through the
  converter.

