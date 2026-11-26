/**
 * Builds the first organic wall textures (owner, 2026-11-26) from the B1B
 * Meadow terrain set in art/source/b1b/, and copies the B1B grass and earth
 * faces in as drawn art. Writes to art/drawn/. Run with: npm run art:b1b
 * (then npm run art to put everything into the game).
 *
 * Nothing here is redrawn. B1B's plain soil is one flat colour; its rocks are
 * the pixels where a rocky variant differs from the plain one. These rocks are
 * lifted out as stamps and placed at different heights in tall textures, so
 * they no longer line up every 4 pixels. Real tall textures from the art
 * director replace these files one for one.
 *
 * The overhang strip is a placeholder in B1B grass colours, until real art arrives.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FACE_W, faceMask, type FaceFrameName, type FaceSide } from '../src/render/faceShapes.ts';
import { Image, decodePng, encodePng, type RGBA } from './png.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'art', 'source', 'b1b');
const OUT = join(ROOT, 'art', 'drawn');

/** Texture height: 12 height steps. The pattern repeats after this many rows. */
const H = 48;
const SIDES: readonly FaceSide[] = ['left', 'right'];
const FRAME_INDEX: Record<FaceFrameName, number> = { full: 0, capA: 1, capB: 2, capA2: 3, capB2: 4 };

function load(file: string): Image {
  return decodePng(readFileSync(join(SRC, file)), file);
}

function frame(img: Image, f: FaceFrameName): Image {
  const out = new Image(16, 16);
  const ox = FRAME_INDEX[f] * 16;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) out.set(x, y, img.get(ox + x, y));
  return out;
}

const same = (a: RGBA, b: RGBA) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];

/** A stamp: the pixels of a variant's frame that differ from the plain frame (corner column left out). */
type Stamp = { x: number; y: number; c: RGBA }[];

function stamp(side: FaceSide, variant: number, f: FaceFrameName): Stamp {
  const plain = frame(load(`face-earth-${side}-v0.png`), f);
  const rocky = frame(load(`face-earth-${side}-v${variant}.png`), f);
  const out: Stamp = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < FACE_W - 1; x++) {
      const c = rocky.get(x, y);
      if (c[3] > 0 && !same(c, plain.get(x, y))) out.push({ x, y, c });
    }
  }
  return out;
}

/** Paint stamps into a texture at row offsets, wrapping top to bottom. */
function paint(img: Image, s: Stamp, row: number): void {
  for (const p of s) img.set(p.x, (((p.y + row) % H) + H) % H, p.c);
}

/** Small repeatable hash for placing specks. */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Plain soil: B1B's flat soil colour, with its two edge colours as scattered specks instead of a 4-pixel repeat. */
function soil(side: FaceSide, variant: 1 | 2): Image {
  const plain = frame(load(`face-earth-${side}-v0.png`), 'full');
  const mask = faceMask(side, 'full');
  // The flat colour is the commonest pixel in the plain band; the edge column holds the two accent colours.
  const counts = new Map<string, { c: RGBA; n: number }>();
  for (let i = 0; i < 256; i++) {
    if (!mask[i]) continue;
    const c = plain.get(i % 16, Math.floor(i / 16));
    const k = c.join();
    counts.set(k, { c, n: (counts.get(k)?.n ?? 0) + 1 });
  }
  const sorted = [...counts.values()].sort((a, b) => b.n - a.n).map((v) => v.c);
  const [base, ...accents] = sorted as [RGBA, ...RGBA[]];
  const img = new Image(16, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < 16; x++) img.set(x, y, base);
  // Accent specks: sparse, never on a 4-row beat.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < 16; x++) {
      const r = hash(x, y, variant * 7 + (side === 'left' ? 0 : 3));
      const edge = x === 15 || x === 0;
      if (accents.length && r < (edge ? 0.22 : 0.012)) img.set(x, y, accents[Math.floor(hash(x, y, 99) * accents.length)]!);
    }
  }
  // The second soil also carries B1B's faint grain streaks (variant 7), at a few heights.
  if (variant === 2) for (const row of [3, 19, 34]) paint(img, stamp(side, 7, 'full'), row);
  return img;
}

/** Rock layouts: [B1B variant, frame, row offset]. Rows are spread so no two textures line up. */
const ROCKS: Record<string, readonly (readonly [number, FaceFrameName, number])[]> = {
  'sparse-1': [
    [1, 'full', 6],
    [5, 'full', 31],
  ],
  'sparse-2': [
    [2, 'full', 14],
    [1, 'capA2', 38],
  ],
  'sparse-3': [
    [5, 'full', 2],
    [2, 'capB2', 25],
  ],
  'moderate-1': [
    [3, 'full', 4],
    [6, 'full', 20],
    [3, 'capA2', 35],
  ],
  'moderate-2': [
    [6, 'full', 10],
    [3, 'full', 27],
    [6, 'capB2', 40],
  ],
  'large-1': [
    [4, 'full', 7],
    [4, 'capA2', 22],
    [4, 'capB2', 37],
  ],
};

function rocks(side: FaceSide, layout: readonly (readonly [number, FaceFrameName, number])[]): Image {
  const img = new Image(16, H);
  for (const [v, f, row] of layout) paint(img, stamp(side, v, f), row);
  return img;
}

/** Placeholder overhang: B1B grass greens hanging 1 to 3 pixels over the top edge. */
function overhang(side: FaceSide): Image {
  const grass = decodePng(readFileSync(join(SRC, 'tile-grass.png')));
  // The darkest greens of the grass rim, darkest last.
  const greens = new Map<string, RGBA>();
  for (let y = 0; y < grass.height; y++) for (let x = 0; x < 32; x++) {
    const c = grass.get(x, y);
    if (c[3] > 0) greens.set(c.join(), c);
  }
  const lum = (c: RGBA) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  const sorted = [...greens.values()].sort((a, b) => lum(b) - lum(a));
  const pick = (f: number) => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))]!;
  const img = new Image(16, 3);
  const salt = side === 'left' ? 11 : 23;
  for (let x = 0; x < 16; x++) {
    img.set(x, 0, pick(0.7));
    if (hash(x, 1, salt) < 0.55) img.set(x, 1, pick(0.82));
    if (hash(x, 1, salt) < 0.55 && hash(x, 2, salt) < 0.35) img.set(x, 2, pick(0.92));
  }
  return img;
}

function write(id: string, img: Image, meta: object | null): void {
  writeFileSync(join(OUT, `${id}.png`), encodePng(img));
  if (meta) writeFileSync(join(OUT, `${id}.json`), JSON.stringify(meta, null, 2) + '\n');
}

mkdirSync(OUT, { recursive: true });
const anchor = (side: FaceSide) => (side === 'left' ? [0, 0] : [0, 8]);
for (const side of SIDES) {
  const meta = (h: number) => ({ frameWidth: 16, frameHeight: h, frames: ['0'], anchor: anchor(side) });
  write(`wall-earth-soil-1-${side}`, soil(side, 1), meta(H));
  write(`wall-earth-soil-2-${side}`, soil(side, 2), meta(H));
  for (const [name, layout] of Object.entries(ROCKS)) write(`wall-earth-rocks-${name}-${side}`, rocks(side, layout), meta(H));
  write(`wall-earth-overhang-${side}`, overhang(side), meta(3));
}
// The approved B1B grass and the B1B default (v1) earth faces, as drawn art.
copyFileSync(join(SRC, 'tile-grass.png'), join(OUT, 'tile-grass.png'));
copyFileSync(join(SRC, 'face-earth-left.png'), join(OUT, 'face-earth-left.png'));
copyFileSync(join(SRC, 'face-earth-right.png'), join(OUT, 'face-earth-right.png'));
console.log('Wrote wall textures, grass and earth faces to art/drawn/');
