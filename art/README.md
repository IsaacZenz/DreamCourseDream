# Art sources

- `drawn/`: finished art. `npm run art` copies these over the generated placeholders and never overwrites them. Rules are at the bottom of `tools/make-placeholder-art.ts`: same size to replace a sprite, or an `<id>.json` (frameWidth, frameHeight, frames, anchor) for a new one; `<id>@<theme>.png` replaces one theme's automatic recolour.
- `source/b1b/`: the B1B Meadow terrain set as delivered (grass, earth faces, eight face variants, preview). `npm run art:b1b` rebuilds the wall textures in `drawn/` from it.

Organic wall textures: see `docs/handoff-wall-textures.md`.
- `source/b1b-wall-v1/`, `source/b1b-wall-v2/`: the art director's B1B wall deliveries, kept as delivered. V2 is the approved structural baseline (owner, 2026-11-26).
- The wall textures in `drawn/` are currently **V3**, written by `npm run art:b1b-v3` (`tools/walls-b1b-v3.ts`, deterministic; change its seeds or tables to vary it). To go back to V2, copy `source/b1b-wall-v2/wall-earth-*.png` into `drawn/` and run `npm run art`.
