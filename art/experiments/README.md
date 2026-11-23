# Experiments

Changes tried in the real game and then undone, kept as patches so they can be
built properly later. Apply one with `git apply art/experiments/<name>.patch`, then run
the art script with the variable named in the patch (for example
`GRASS_CALM=1 npm run art`). Never commit an applied experiment as is.

| Patch | What | Status |
|---|---|---|
| `calm-grass.patch` | Calm grass D (owner, 2026-11-23): today's two checker greens, 11 tile designs (plain, tufts, soft dark and light patches, flowers) picked per tile by position, and 4 gentle meadow levels from a smooth noise; no dithering. Art script under `GRASS_CALM` (add `GRASS_LINES=4` or `8` for shadow lines: short darker strokes, owner 2026-11-23), tile choice in `src/render/iso.ts`. Code changes only; regenerate the art after applying. | Shown to the owner in the game; waiting for a decision |
