# Art folder

The owner designs the game's art; this folder turns drawings into game sprites.
Design: `docs/plans/art-pipeline.md`. Rules: `STYLE.md`.

## The loop (from the phone)

1. Find the item's **code** in `ART-LIST.md` (or on a contact sheet in `list/`).
2. Draw it in the sketchbook and write the code next to it.
   - **Marker colouring (owner, 2026-11-23):** colour in areas with a marker to show
     which parts belong together (the shell, a drip, a plate). The marker's colour does
     not matter: it shows the design, not the final colour. Say in words if you want a
     particular colour.
3. In the Claude app, open **Code**, start a session on this repository, attach the
   photo, and say the code plus anything to keep in mind ("E3, the mouth is the
   important part").
   - If there is no attach button: upload the photo to `art/inbox/` with the GitHub
     app (Add file → Upload files) and tell Claude its name.
4. Claude renders it down. For small sprites you get two or three versions, A, B and C,
   side by side, to pick from or mix.
5. Claude sends a preview, then an in-game screenshot. Say yes or what to change.
6. On yes, the sprite file moves to `src/` with `status: approved` and goes into the game.

## What is in here

| Path | What |
|---|---|
| `ART-LIST.md` | Every sprite with its permanent code, size, frames and status. Made by `npm run art:list`. |
| `codes.json` | The permanent codes. Never renumber or reuse one. |
| `list/<letter>.png` | Contact sheets: every current sprite enlarged with its code. `list/palette.png` shows the palette and every theme. |
| `palette.json`, `themes.json` | The colours (STYLE.md). |
| `src/` | One sprite file per finished sprite (`<code>-<id>.sprite`). Approved ones go into the game. |
| `drafts/` | Render-down versions waiting for the owner to choose (`<code>-a.sprite`, `<code>-b.sprite`). |
| `mockups/` | Claude's style examples. Not the owner's designs; never pressed into the game. |
| `inbox/` | Photos uploaded through GitHub. |
| `previews/` | Preview pictures (not saved in git). |

## Commands

```bash
npm run art:list
```
Gives new sprites codes and remakes the Art List, the contact sheets and the palette picture.

```bash
npm run art:preview -- E3
```
Preview one sprite file, or several side by side: `npm run art:preview -- art/drafts/E3-a.sprite art/drafts/E3-b.sprite`.

```bash
npm run art:press
```
Put approved sprite files into the game. (`npm run art` does it too, after making the placeholders, so placeholders never overwrite approved art.)

## Sprite files

Plain text, one grid of letters per frame. The full format is at the top of
`tools/art/sprite.ts`. Example (12×12 gear icon):

```
code: G13
id: gear-pin-needle
status: draft
size: 12x12
outline: ink
key 2 grey 2
key 3 grey 3
key 4 grey 4
key r red 3
frame: idle
............
.........44.
...
```
