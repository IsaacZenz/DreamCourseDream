/**
 * Placeholder art generator (DESIGN.md section 12).
 *
 * Draws every sprite the game needs as simple shaded shapes at the correct
 * sizes, writes them to assets/sprites/, and writes assets/manifest.json.
 * Final art can later replace these files one for one.
 *
 * Run with: npm run art
 *
 * Colours live here, in the art tool, not in game code. They are rounded to
 * 15-bit colour (5 bits per channel), like the 16-bit consoles used.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIRECTIONS, SURFACES, type Direction } from '../src/content/surfaces.ts';
import type { Manifest, SpriteEntry } from '../src/render/manifest.ts';
import { SHAPES, triangles, type ShapeId } from '../src/sim/tileShape.ts';
import { Image, encodePng, type RGBA } from './png.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets');

// ---------------------------------------------------------------------------
// Colour helpers

type RGB = readonly [number, number, number];

function hex(h: string): RGB {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Round to 15-bit colour and add full alpha. */
function c15(rgb: RGB, alpha = 255): RGBA {
  const q = (v: number) => {
    const five = Math.max(0, Math.min(31, Math.round(v / 8.226)));
    return (five << 3) | (five >> 2);
  };
  return [q(rgb[0]), q(rgb[1]), q(rgb[2]), alpha];
}

/** Five shades from darkest (0) to lightest (4) around a base colour (index 3). */
function ramp(base: string): RGBA[] {
  const b = hex(base);
  return [0.5, 0.68, 0.84, 1, 1.14].map((f) =>
    c15(f <= 1 ? [b[0] * f, b[1] * f, b[2] * f] : [b[0] + (255 - b[0]) * (f - 1) * 1.6, b[1] + (255 - b[1]) * (f - 1) * 1.6, b[2] + (255 - b[2]) * (f - 1) * 1.6]),
  );
}

/** Small repeatable hash for speckle patterns. */
function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Geometry helpers

type P = readonly [number, number];

// Sample a little off the pixel centre so that pixels exactly on a shared edge
// always belong to exactly one of the two shapes. Neighbouring tiles then fit
// together with no gaps and no overlaps.
const BIAS_X = 0.5013;
const BIAS_Y = 0.5071;

function insideTri(px: number, py: number, a: P, b: P, c: P): boolean {
  const s = (p: P, q: P) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function insidePoly(px: number, py: number, pts: readonly P[]): boolean {
  for (let i = 1; i + 1 < pts.length; i++) if (insideTri(px, py, pts[0]!, pts[i]!, pts[i + 1]!)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Palette (placeholder look only)

interface SurfaceLook {
  base: string;
  /** Optional per-pixel tweak: returns a shade offset or a colour. */
  pattern?: (x: number, y: number, shade: number) => number | RGBA;
  /** 0 to 255; below 255 the tile is see-through. */
  alpha?: number;
}

const LOOKS: Record<string, SurfaceLook> = {
  grass: { base: '#4fa83d', pattern: (x, y) => (hash(x, y) < 0.08 ? 1 : 0) },
  rough: { base: '#2f7a35', pattern: (x, y) => (hash(x, y, 1) < 0.22 ? -1 : hash(x, y, 2) < 0.06 ? 1 : 0) },
  sand: { base: '#e3c47a', pattern: (x, y) => (hash(x, y, 3) < 0.12 ? -1 : 0) },
  ice: { base: '#a8dcf0', pattern: (x, y) => ((x + y * 2) % 11 === 0 ? 1 : 0) },
  // Water is two sprites: an opaque bed under the ball and a see-through surface over it.
  water: { base: '#1d4a86', pattern: (x, y) => (hash(x, y, 4) < 0.1 ? -1 : 0) },
  'water-surface': { base: '#3c86e0', alpha: 150, pattern: (x, y) => ((y % 4 === 0 && (x + Math.floor(y / 4) * 3) % 8 < 3) ? 1 : 0) },
  bumper: { base: '#d83c3c', pattern: (x, y) => (Math.floor((x + y * 2) / 4) % 2 === 0 ? 0 : hex2('#f0e8e0')) },
  booster: { base: '#7a7f8c', pattern: (x, y) => ((x + y) % 4 === 0 ? -1 : 0) },
  conveyor: { base: '#5a5560', pattern: (x, y) => ((x - y * 2) % 4 === 0 ? -1 : 0) },
  spring: { base: '#8c8c96' },
  spikes: { base: '#6e6670' },
  warp: { base: '#7a3cc8' },
};

function hex2(h: string): RGBA {
  return c15(hex(h));
}

const FACE_LOOKS: Record<string, string> = {
  'face-earth': '#8a5a34',
  'face-sand': '#b08848',
  'face-ice': '#6aa8c8',
  'face-bumper': '#b02c2c',
  'face-metal': '#5c5f6a',
};

// ---------------------------------------------------------------------------
// Tiles: one sheet per surface, one 32x24 frame per shape.
// In a frame, the diamond at relative height 0 has corners
// nw (16,8), ne (32,16), se (16,24), sw (0,16). Each step up moves a corner 8px up.

const TILE_W = 32;
const TILE_H = 24;
const TILE_ANCHOR: P = [16, 16];

// Light comes from the upper left of the screen. Grid x points down-right on
// screen and grid y points down-left, so "upper left" is mostly -x.
const LIGHT = (() => {
  const v = [-0.5, -0.4, 1];
  const len = Math.hypot(...v);
  return v.map((n) => n / len) as [number, number, number];
})();
/** One height step, in tile widths, for lighting only. */
const STEP = 0.5;
const CORNER_GRID: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

function cornerScreen(i: number, rel: number): P {
  const base: P[] = [
    [16, 8],
    [32, 16],
    [16, 24],
    [0, 16],
  ];
  const b = base[i]!;
  return [b[0], b[1] - rel * 8];
}

function triShade(rel: number[], tri: readonly number[]): number {
  const p = tri.map((i) => [CORNER_GRID[i]![0], CORNER_GRID[i]![1], rel[i]! * STEP]);
  const [a, b, c] = p as [number[], number[], number[]];
  const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
  const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
  let n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
  if (n[2]! < 0) n = n.map((k) => -k);
  const len = Math.hypot(...n);
  const d = (n[0]! * LIGHT[0] + n[1]! * LIGHT[1] + n[2]! * LIGHT[2]) / len;
  if (d > 0.87) return 4;
  if (d > 0.75) return 3;
  if (d > 0.5) return 2;
  return 1;
}

function drawTile(surface: string, shape: ShapeId): Image {
  const look = LOOKS[surface];
  if (!look) throw new Error(`No placeholder look for surface "${surface}". Add one to LOOKS.`);
  const shades = ramp(look.base);
  const rel = [...shape].map(Number);
  const tris = triangles(shape).map((tri) => ({ pts: tri.map((i) => cornerScreen(i, rel[i]!)) as P[], shade: triShade(rel, tri) }));
  const outline = [0, 1, 2, 3].map((i) => cornerScreen(i, rel[i]!));
  const img = new Image(TILE_W, TILE_H);
  for (let y = 0; y < TILE_H; y++) {
    for (let x = 0; x < TILE_W; x++) {
      const t = tris.find((tr) => insideTri(x + BIAS_X, y + BIAS_Y, tr.pts[0]!, tr.pts[1]!, tr.pts[2]!));
      if (!t) continue;
      let shade = t.shade;
      // Darken the lower rim so the grid reads at a glance.
      if (!insidePoly(x + BIAS_X, y + 1 + BIAS_Y, outline)) shade -= 1;
      const p = look.pattern?.(x, y, shade) ?? 0;
      const px = typeof p === 'number' ? shades[Math.max(0, Math.min(4, shade + p))]! : p;
      img.set(x, y, look.alpha === undefined ? px : [px[0], px[1], px[2], look.alpha]);
    }
  }
  if (surface === 'spring' && shape === '0000') drawSpringPad(img);
  if (surface === 'spikes') drawSpikes(img, rel);
  if (surface === 'warp') drawWarpRing(img);
  return img;
}

/** Inverse of the flat diamond projection: frame pixel → (u, v) inside the tile. */
function frameToUV(x: number, y: number, originY: number): [number, number] {
  const a = (x - 16) / 16;
  const b = (y - originY) / 8;
  return [(a + b) / 2, (b - a) / 2];
}

function drawSpringPad(img: Image): void {
  const ring = hex2('#e8d040');
  const dark = hex2('#5a4a10');
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [u, v] = frameToUV(x + 0.5, y + 0.5, 8);
      const r = Math.hypot(u - 0.5, v - 0.5);
      if (r < 0.32 && r > 0.22) img.set(x, y, ring);
      else if (r <= 0.12) img.set(x, y, ring);
      else if (r <= 0.22 && r > 0.18) img.set(x, y, dark);
    }
  }
}

function drawSpikes(img: Image, rel: number[]): void {
  const light = hex2('#e0e0e8');
  const dark = hex2('#2a2830');
  const lift = (rel.reduce((a, b) => a + b, 0) / 4) * 8;
  for (const [u, v] of [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
    [0.5, 0.5],
  ] as const) {
    const cx = Math.round(16 + (u - v) * 16);
    const cy = Math.round(8 + (u + v) * 8 - lift);
    // A little 3-pixel-wide cone pointing up.
    img.set(cx, cy - 3, light);
    img.set(cx, cy - 2, light);
    img.set(cx - 1, cy - 1, light);
    img.set(cx, cy - 1, light);
    img.set(cx + 1, cy - 1, dark);
    img.set(cx - 1, cy, dark);
    img.set(cx, cy, dark);
    img.set(cx + 1, cy, dark);
  }
}

function drawWarpRing(img: Image): void {
  const glow = hex2('#e8b8ff');
  const mid = hex2('#b070f0');
  const core = hex2('#200838');
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [u, v] = frameToUV(x + 0.5, y + 0.5, 8);
      const r = Math.hypot(u - 0.5, v - 0.5);
      if (r < 0.14) img.set(x, y, core);
      else if (r < 0.22) img.set(x, y, mid);
      else if (r < 0.3) img.set(x, y, glow);
    }
  }
}

// ---------------------------------------------------------------------------
// Faces. Each face sprite has frames "full" (a one-step band), "capA" and
// "capB" (the triangle above the bands when the edge's two corners differ:
// capA when the first corner is higher, capB when the second is).
// Left faces run sw → se; right faces run se → ne.

const FACE_FRAMES = ['full', 'capA', 'capB'];
const LEFT_SHAPES: Record<string, P[]> = {
  full: [
    [0, 0],
    [16, 8],
    [16, 16],
    [0, 8],
  ],
  capA: [
    [0, 0],
    [16, 16],
    [0, 8],
  ],
  capB: [
    [0, 8],
    [16, 8],
    [16, 16],
  ],
};
const RIGHT_SHAPES: Record<string, P[]> = {
  full: [
    [0, 8],
    [16, 0],
    [16, 8],
    [0, 16],
  ],
  capA: [
    [0, 8],
    [16, 8],
    [0, 16],
  ],
  capB: [
    [0, 16],
    [16, 0],
    [16, 8],
  ],
};

function drawFace(base: string, poly: P[], shade: number): Image {
  const shades = ramp(base);
  const img = new Image(16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!insidePoly(x + BIAS_X, y + BIAS_Y, poly)) continue;
      let s = shade;
      // A light lip along the top of each band shows the height steps.
      if (!insidePoly(x + BIAS_X, y - 1 + BIAS_Y, poly)) s += 1;
      else if (hash(x, y, 9) < 0.1) s -= 1;
      img.set(x, y, shades[Math.max(0, Math.min(4, s))]!);
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// Arrows for directional tiles. 32x16 frame, anchor at the tile centre.

/** Screen direction of each grid direction (grid x is down-right, grid y is down-left). */
const DIR_SCREEN: Record<Direction, [number, number]> = { ne: [2, -1], se: [2, 1], sw: [-2, 1], nw: [-2, -1] };

function drawArrow(dir: Direction): Image {
  const img = new Image(32, 16);
  const fill = hex2('#f8e048');
  const edge = hex2('#3a2a08');
  const [sx, sy] = DIR_SCREEN[dir];
  const len = Math.hypot(sx, sy);
  const ax = sx / len;
  const ay = sy / len;
  const inArrow = (x: number, y: number) => {
    const px = x + 0.5 - 16;
    const py = y + 0.5 - 8;
    const along = px * ax + py * ay;
    const across = Math.abs(-px * ay + py * ax);
    if (along >= 0 && along < 6) return across < (6 - along) * 0.85; // head
    return along > -6 && along < 0 && across < 1.6; // shaft
  };
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) {
      if (inArrow(x, y)) img.set(x, y, fill);
      else if (inArrow(x + 1, y) || inArrow(x - 1, y) || inArrow(x, y + 1) || inArrow(x, y - 1)) img.set(x, y, edge);
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// Ball, shadow and exit.

function drawBall(): Image {
  const img = new Image(8, 8);
  const shades = ramp('#e8e8f0');
  const outline = hex2('#303048');
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const dx = x + 0.5 - 4;
      const dy = y + 0.5 - 4;
      const r = Math.hypot(dx, dy);
      if (r > 3.7) continue;
      if (r > 2.9) {
        img.set(x, y, outline);
        continue;
      }
      const lit = -dx * 0.5 - dy * 0.7;
      img.set(x, y, shades[lit > 1.2 ? 4 : lit > -0.4 ? 3 : 2]!);
    }
  }
  return img;
}

function drawShadow(): Image {
  const img = new Image(8, 4);
  const c = c15([10, 10, 30], 110);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 8; x++) {
      if (Math.hypot((x + 0.5 - 4) / 4, (y + 0.5 - 2) / 2) < 1) img.set(x, y, c);
    }
  }
  return img;
}

function drawExit(open: boolean): Image {
  const img = new Image(16, 10);
  const rim = hex2('#d8d0b8');
  const hole = hex2('#101018');
  const lid = ramp('#8a8fa0');
  const glow = hex2('#f8f080');
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 16; x++) {
      const r = Math.hypot((x + 0.5 - 8) / 7, (y + 0.5 - 5) / 3.5);
      if (r >= 1) continue;
      if (r > 0.78) img.set(x, y, rim);
      else if (open) img.set(x, y, r < 0.35 ? glow : hole);
      else img.set(x, y, Math.abs(x + 0.5 - 8) < 1 || Math.abs(y + 0.5 - 5) < 1 ? lid[1]! : lid[3]!);
    }
  }
  return img;
}

// ---------------------------------------------------------------------------
// Tiny pixel font: 3x5 glyphs in 4x6 cells, white, tinted by the game.

const GLYPHS: Record<string, string> = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  ' ': '000000000000000', '.': '000000000000010', ',': '000000000010100', ':': '000010000010000',
  '-': '000000111000000', '+': '000010111010000', '/': '001001010100100', '(': '010100100100010',
  ')': '010001001001010', '#': '101111101111101', '=': '000111000111000', '?': '111001010000010',
  '!': '010010010000010', "'": '010010000000000', '>': '100010001010100', '<': '001010100010001',
};

function drawFont(): { img: Image; frames: string[] } {
  const chars = Object.keys(GLYPHS);
  const img = new Image(chars.length * 4, 6);
  const white = c15([255, 255, 255]);
  chars.forEach((ch, i) => {
    const bits = GLYPHS[ch]!;
    for (let k = 0; k < 15; k++) if (bits[k] === '1') img.set(i * 4 + (k % 3), Math.floor(k / 3), white);
  });
  return { img, frames: chars };
}

// ---------------------------------------------------------------------------
// Output

function sheet(frames: Image[]): Image {
  const w = frames[0]!.width;
  const out = new Image(w * frames.length, frames[0]!.height);
  frames.forEach((f, i) => out.blit(f, i * w, 0));
  return out;
}

const sprites: Record<string, SpriteEntry> = {};

function emit(id: string, img: Image, frameWidth: number, frameHeight: number, frames: string[], anchor: P): void {
  const file = `sprites/${id}.png`;
  mkdirSync(join(OUT, 'sprites'), { recursive: true });
  writeFileSync(join(OUT, file), encodePng(img));
  sprites[id] = { file, frameWidth, frameHeight, frames, anchor };
}

const faceIds = new Set<string>();
for (const def of SURFACES.values()) {
  emit(def.tileSprite, sheet(SHAPES.map((s) => drawTile(def.id, s))), TILE_W, TILE_H, [...SHAPES], TILE_ANCHOR);
  if (def.overlaySprite) {
    const look = def.overlaySprite.replace(/^tile-/, '');
    emit(def.overlaySprite, sheet(SHAPES.map((s) => drawTile(look, s))), TILE_W, TILE_H, [...SHAPES], TILE_ANCHOR);
  }
  faceIds.add(def.faceSprite);
}
for (const id of faceIds) {
  const base = FACE_LOOKS[id];
  if (!base) throw new Error(`No placeholder colour for face "${id}". Add one to FACE_LOOKS.`);
  emit(`${id}-left`, sheet(FACE_FRAMES.map((f) => drawFace(base, LEFT_SHAPES[f]!, 3))), 16, 16, FACE_FRAMES, [0, 0]);
  emit(`${id}-right`, sheet(FACE_FRAMES.map((f) => drawFace(base, RIGHT_SHAPES[f]!, 1))), 16, 16, FACE_FRAMES, [0, 8]);
}
emit('arrow', sheet(DIRECTIONS.map(drawArrow)), 32, 16, [...DIRECTIONS], [16, 8]);
emit('ball', drawBall(), 8, 8, ['idle'], [4, 7]);
emit('ball-shadow', drawShadow(), 8, 4, ['idle'], [4, 2]);
emit('exit', sheet([drawExit(false), drawExit(true)]), 16, 10, ['closed', 'open'], [8, 5]);
const font = drawFont();
emit('font', font.img, 4, 6, font.frames, [0, 0]);

const manifest: Manifest = { version: 1, sprites };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${Object.keys(sprites).length} sprites to assets/sprites and assets/manifest.json`);
