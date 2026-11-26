# Art sources

- `drawn/`: finished art. `npm run art` copies these over the generated placeholders and never overwrites them. Rules are at the bottom of `tools/make-placeholder-art.ts`: same size to replace a sprite, or an `<id>.json` (frameWidth, frameHeight, frames, anchor) for a new one; `<id>@<theme>.png` replaces one theme's automatic recolour.
- `source/b1b/`: the B1B Meadow terrain set as delivered (grass, earth faces, eight face variants, preview). `npm run art:b1b` rebuilds the wall textures in `drawn/` from it.

Organic wall textures: see `docs/handoff-wall-textures.md`.
