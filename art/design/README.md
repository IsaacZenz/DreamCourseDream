# Character designs at large size

Owner, 2026-11-24: design characters big first, ignoring the game's size limits, refine
them, then scale them down. Files here are design sheets, never pressed into the game.

| File | What |
|---|---|
| `H6-rollo-design-v1.sprite` | Rollo at 5x (90x120): A's body with the Upright head, as it stood |
| `H6-rollo-design-v2.sprite` | Rollo at 5x: shell wrapping the body with bands, pale belly, head shield, sturdier legs |
| `src/` | The scripts that draw them (parts in 18x24 design units, rendered at any scale): `python3 src/rollo2.py out.sprite 5` from this folder's `src/` |

Preview: `npm run art:preview -- art/design/<file>`.
