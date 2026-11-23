/**
 * Grass lab (art pipeline, owner request 2026-11-23): ways to give the grass
 * variety in the house style B2, drawn as a patch of course at game size, with a
 * lit slope, a shaded slope and real sprites on it. Nothing here goes into the game.
 *
 * Ideas shown:
 * - Tile variants: several grass designs (plain, blades, a soft dark patch, a light
 *   patch, tiny flowers) picked per tile by a repeatable hash of its position, with
 *   weights, so no pattern repeats. They share one base colour at the edges, so
 *   neighbouring tiles join without seams.
 * - Meadow patches: a smooth noise across the whole course, much bigger than a tile,
 *   that darkens or lightens areas and biases which variants appear there.
 * - The checkerboard (owner, 2026-11-15) kept, as a subtle second shade.
 *
 * Run with: npm run art:grass   (writes art/previews/grass-lab.png)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest } from '../src/render/manifest.ts';
import { blitScaled, drawText, fillRect, loadFont } from './art/draw.ts';
import { loadArt } from './art/press.ts';
import { Image, decodePng, encodePng, type RGBA } from './png.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const art = loadArt(ROOT);
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/manifest.json'), 'utf8')) as Manifest;
const font = loadFont(ROOT, manifest);
const G = (s: number): RGBA => art.ramps.green![Math.max(0, Math.min(4, s))]!;

function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Smooth value noise, 0..1, with features about `size` pixels across. */
function noise(x: number, y: number, size: number, salt: number): number {
  const fx = x / size;
  const fy = y / size;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const sx = fx - x0;
  const sy = fy - y0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(x0, y0, salt);
  const b = hash(x0 + 1, y0, salt);
  const c = hash(x0, y0 + 1, salt);
  const d = hash(x0 + 1, y0 + 1, salt);
  return a + (b - a) * s(sx) + (c - a) * s(sy) + (a - b - c + d) * s(sx) * s(sy);
}

type Variant = 'plain' | 'blades' | 'dark' | 'light' | 'flowers';

interface Option {
  readonly name: string;
  readonly note: string;
  readonly checker: 'none' | 'subtle' | 'today';
  readonly variants: ReadonlyArray<readonly [Variant, number]>;
  readonly meadow: boolean;
}

const OPTIONS: Option[] = [
  { name: 'A TODAY', note: 'PLACEHOLDER: TWO-TONE CHECKER, SPECKLE', checker: 'today', variants: [['plain', 1]], meadow: false },
  { name: 'B ONE DESIGN', note: 'B2 GRASS, THE SAME TILE EVERYWHERE', checker: 'subtle', variants: [['blades', 1]], meadow: false },
  { name: 'C FIVE DESIGNS MIXED', note: 'PLAIN 45 BLADES 25 DARK 12 LIGHT 12 FLOWERS 6', checker: 'subtle', variants: [['plain', 45], ['blades', 25], ['dark', 12], ['light', 12], ['flowers', 6]], meadow: false },
  { name: 'D MIXED + MEADOW PATCHES', note: 'C, PLUS BIG SOFT AREAS ACROSS MANY TILES', checker: 'subtle', variants: [['plain', 45], ['blades', 25], ['dark', 12], ['light', 12], ['flowers', 6]], meadow: true },
];

const TW = 32;
const TH = 16;
const N = 12;
const SW = 384;
const SH = 216;
const OX = SW / 2 - TW / 2;
const OY = 12;

/** Which tiles are a lit slope (+1) or a shaded slope (-1), to check readability. */
function slope(tx: number, ty: number): number {
  if (tx >= 7 && tx <= 9 && ty >= 1 && ty <= 4) return 1;
  if (tx >= 1 && tx <= 4 && ty >= 7 && ty <= 9) return -1;
  return 0;
}

function pickVariant(opt: Option, tx: number, ty: number, wx: number, wy: number): Variant {
  let weights = opt.variants.map(([v, w]) => [v, w] as [Variant, number]);
  if (opt.meadow) {
    // In darker meadow areas blades and dark patches are commoner; in light areas, flowers and light patches.
    const n = noise(wx, wy, 90, 7);
    weights = weights.map(([v, w]) => [v, w * (n < 0.4 ? ({ blades: 1.8, dark: 2, light: 0.4, flowers: 0.5, plain: 1 } as const)[v] : n > 0.65 ? ({ blades: 0.7, dark: 0.3, light: 2, flowers: 2.5, plain: 1 } as const)[v] : 1)]);
  }
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = hash(tx, ty, 11) * total;
  for (const [v, w] of weights) {
    r -= w;
    if (r < 0) return v;
  }
  return 'plain';
}

/** The shade (0..4 of the green ramp, or another colour) of one grass pixel. */
function grassPixel(opt: Option, v: Variant, tx: number, ty: number, lx: number, ly: number, wx: number, wy: number): RGBA {
  const odd = (tx + ty) % 2 === 1;
  if (opt.checker === 'today') {
    const base = odd ? 3 : 2;
    return G(hash(wx, wy, 3) < 0.08 ? base + 1 : base);
  }
  let s = 3;
  // Subtle checker: every other tile has a light dither, so slopes still read as tiles.
  if (opt.checker === 'subtle' && odd && (wx + wy) % 2 === 0 && wy % 2 === 0) s = 4;
  if (opt.meadow) {
    const n = noise(wx, wy, 90, 7);
    // Solid in the middle of a patch, dithered only at its edge.
    if (n < 0.26 || (n < 0.33 && (wx + wy) % 2 === 0)) s = 2;
    // Light areas stay a gentle sprinkle (a quarter of the pixels), never a solid light patch.
    else if (n > 0.7 && (wx + wy) % 2 === 0 && wy % 2 === 0) s = 4;
  }
  const seed = (k: number) => hash(tx, ty, k);
  if (v === 'plain' && hash(wx, wy, 5) < 0.012) s = 4;
  if (v === 'blades') {
    for (let k = 0; k < 3; k++) {
      const bx = 6 + Math.floor(seed(20 + k) * 20);
      const by = 4 + Math.floor(seed(30 + k) * 8);
      if (lx === bx && ly === by) s = 4;
      if (lx === bx && ly === by + 1) s = 2;
      if (lx === bx + 2 && ly === by + 1) s = 4;
      if (lx === bx + 2 && ly === by + 2) s = 2;
    }
  }
  if (v === 'dark' || v === 'light') {
    const cx = 10 + seed(40) * 12;
    const cy = 6 + seed(41) * 4;
    const d = ((lx - cx) / 8) ** 2 + ((ly - cy) / 3.5) ** 2;
    if (d < 1 && (wx + wy) % 2 === 0) s = v === 'dark' ? 2 : 4;
  }
  if (v === 'flowers') {
    for (let k = 0; k < 2; k++) {
      const fx = 7 + Math.floor(seed(50 + k) * 18);
      const fy = 4 + Math.floor(seed(60 + k) * 8);
      if (lx === fx && ly === fy) return k ? art.ramps.pink![4]! : art.ramps.gold![4]!;
      if (lx === fx && ly === fy + 1) s = 2;
    }
  }
  return G(s);
}

function shift(c: RGBA, by: number): RGBA {
  if (by === 0) return c;
  const ramp = art.ramps.green!;
  const i = ramp.findIndex((r) => r[0] === c[0] && r[1] === c[1] && r[2] === c[2]);
  return i < 0 ? c : ramp[Math.max(0, Math.min(4, i + by))]!;
}

function sprite(id: string): { img: Image; w: number; h: number; anchor: readonly [number, number] } {
  const e = manifest.sprites[id]!;
  const sheet = decodePng(readFileSync(join(ROOT, 'assets', e.file)));
  const img = new Image(e.frameWidth, e.frameHeight);
  for (let y = 0; y < e.frameHeight; y++) for (let x = 0; x < e.frameWidth; x++) img.set(x, y, sheet.get(x, y));
  return { img, w: e.frameWidth, h: e.frameHeight, anchor: e.anchor };
}
const things: Array<[string, number, number]> = [['ball', 5, 4], ['snoozegrub', 8, 6], ['gear-pin-needle', 3, 3], ['rock', 9, 9], ['snoozegrub', 2, 8], ['ball', 8, 2]];

function panel(opt: Option): Image {
  const img = new Image(SW, SH);
  fillRect(img, 0, 0, SW, SH, [29, 43, 83, 255]);
  for (let ty = 0; ty < N; ty++)
    for (let tx = 0; tx < N; tx++) {
      const sx = OX + (tx - ty) * (TW / 2);
      const sy = OY + (tx + ty) * (TH / 2);
      const v = pickVariant(opt, tx, ty, sx + 16, sy + 8);
      for (let ly = 0; ly < TH; ly++)
        for (let lx = 0; lx < TW; lx++) {
          if (Math.abs(lx + 0.5 - TW / 2) / (TW / 2) + Math.abs(ly + 0.5 - TH / 2) / (TH / 2) > 1) continue;
          const wx = sx + lx;
          const wy = sy + ly;
          img.set(wx, wy, shift(grassPixel(opt, v, tx, ty, lx, ly, wx, wy), slope(tx, ty)));
        }
    }
  // Things on the grass, back to front, with a dotted shadow (STYLE.md).
  for (const [id, tx, ty] of [...things].sort((a, b) => a[1] + a[2] - (b[1] + b[2]))) {
    const s = sprite(id);
    const cx = OX + (tx - ty) * (TW / 2) + TW / 2;
    const cy = OY + (tx + ty) * (TH / 2) + TH / 2;
    for (let y = -2; y <= 2; y++)
      for (let x = -6; x <= 6; x++) if ((x / 6) ** 2 + (y / 2.2) ** 2 <= 1 && (x + y) % 2 === 0) img.set(cx + x, cy + y, art.ramps.green![1]!);
    img.blit(s.img, cx - s.anchor[0], cy - s.anchor[1]);
  }
  return img;
}

const ZOOM = 2;
const pad = 14;
const labelH = 40;
const out = new Image(2 * (SW * ZOOM + pad) + pad, 2 * (SH * ZOOM + labelH + pad) + pad);
fillRect(out, 0, 0, out.width, out.height, [32, 32, 44, 255]);
OPTIONS.forEach((opt, i) => {
  const x = pad + (i % 2) * (SW * ZOOM + pad);
  const y = pad + Math.floor(i / 2) * (SH * ZOOM + labelH + pad);
  drawText(out, font, x, y, opt.name, 3, [240, 232, 200, 255]);
  drawText(out, font, x, y + 22, opt.note, 2, [150, 146, 170, 255]);
  blitScaled(out, panel(opt), x, y + labelH, ZOOM);
});
mkdirSync(join(ROOT, 'art/previews'), { recursive: true });
writeFileSync(join(ROOT, 'art/previews/grass-lab.png'), encodePng(out));
console.log('Wrote art/previews/grass-lab.png');
