# Character designs at large size

Owner, 2026-11-24: design characters big first, ignoring the game's size limits, refine
them, then scale them down. Files here are design sheets, never pressed into the game.

| File | What |
|---|---|
| `H6-rollo-design-v1.sprite` | Rollo at 5x (90x120): A's body with the Upright head, as it stood |
| `H6-rollo-design-v2.sprite` | Rollo at 5x: shell wrapping the body with bands, pale belly, head shield, sturdier legs |
| `H6-rollo-design-v3.sprite` | Owner: the parts looked disjointed. Rebuilt as one blended body (smooth union of shapes), the shell laid over it, the arm in front |
| `H6-rollo-design-v4.sprite` | v3 with the legs separated, smoother shading and speckles cleaned up |
| `src/` | The scripts that draw them (parts in 18x24 design units, rendered at any scale): run from `src/`, e.g. `python3 rollo4.py out.sprite 5` (v3 and v4 use `sdf.py`) |

Preview: `npm run art:preview -- art/design/<file>`.

## Royal Rollo (owner, 2026-11-25)

- **Reference:** `art/inbox/H6-rollo-sheet.png`, a character sheet (idle, walk, roll) of the
  owner's own design, rendered for the owner with an image tool. The owner confirmed it is
  their own design (2026-11-25). It is a design reference only: no pixels from it go into
  the game; the game sprites are redrawn in B2.
- `royal/colour-schemes.png`: the sheet recoloured in five palette schemes; the owner
  chose **Royal** (gold hood; purple trousers, sleeve, bands and ear insides; tan skin).
- `royal/redraw-v1*.png`: a clean redraw from smooth shapes in Royal and B2 (`src/royal.py`);
  the owner asked to simplify the detail and keep the shapes.
