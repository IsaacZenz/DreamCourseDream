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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEAR_LIST, type GearDef } from '../src/content/gear.ts';
import { UPGRADE_LIST } from '../src/content/run.ts';
import { DIRECTIONS, SURFACES, type Direction } from '../src/content/surfaces.ts';
import type { Manifest, SpriteEntry } from '../src/render/manifest.ts';
import { SHAPES, triangles, type ShapeId } from '../src/sim/tileShape.ts';
import { FACE_FRAMES, FACE_H, LEFT_SHAPES, RIGHT_SHAPES } from '../src/render/faceShapes.ts';
import { Image, decodePng, encodePng, type RGBA } from './png.ts';

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

/** Animation frame being drawn (water shimmer, Milestone 5b). */
let PHASE = 0;
/** Shimmer: short light dashes that drift sideways from frame to frame. */
const shimmer = (x: number, y: number) => (y % 4 === 0 && (x + Math.floor(y / 4) * 3 + PHASE * 2) % 8 < 3 ? 1 : (y + 2) % 8 === 0 && (x - PHASE * 2 + 40) % 11 < 2 ? 2 : 0);

const LOOKS: Record<string, SurfaceLook> = {
  grass: { base: '#4fa83d', pattern: (x, y) => (hash(x, y) < 0.08 ? 1 : 0) },
  // Checkerboard (owner, 2026-11-15): the second shade for every other grass tile.
  'grass-b': { base: '#5cba4a', pattern: (x, y) => (hash(x, y) < 0.08 ? 1 : 0) },
  rough: { base: '#2f7a35', pattern: (x, y) => (hash(x, y, 1) < 0.22 ? -1 : hash(x, y, 2) < 0.06 ? 1 : 0) },
  sand: { base: '#e3c47a', pattern: (x, y) => (hash(x, y, 3) < 0.12 ? -1 : 0) },
  ice: { base: '#a8dcf0', pattern: (x, y) => ((x + y * 2) % 11 === 0 ? 1 : 0) },
  // Water is two sprites: an opaque bed under the ball and a see-through surface over it.
  water: { base: '#1d4a86', pattern: (x, y) => (hash(x, y, 4) < 0.1 ? -1 : 0) },
  'water-surface': { base: '#3c86e0', alpha: 150, pattern: shimmer },
  // Away from the bank the water is darker (Milestone 5b).
  'water-deep-surface': { base: '#2a62b8', alpha: 175, pattern: shimmer },
  bumper: { base: '#d83c3c', pattern: (x, y) => (Math.floor((x + y * 2) / 4) % 2 === 0 ? 0 : hex2('#f0e8e0')) },
  booster: { base: '#7a7f8c', pattern: (x, y) => ((x + y) % 4 === 0 ? -1 : 0) },
  conveyor: { base: '#5a5560', pattern: (x, y) => ((x - y * 2) % 4 === 0 ? -1 : 0) },
  spring: { base: '#8c8c96' },
  spikes: { base: '#6e6670' },
  warp: { base: '#7a3cc8' },
  // Round 2a: plank bridge. Planks run one way, with dark gaps between them.
  // Milestone 8b: a trodden dirt path with small stones.
  path: { base: '#b08a58', pattern: (x, y) => (hash(x, y, 9) < 0.07 ? -1 : hash(x, y, 10) < 0.04 ? 1 : 0) },
  bridge: { base: '#a87840', pattern: (x, y) => ((x + 2 * y) % 8 === 0 ? -2 : hash(x, y, 7) < 0.1 ? -1 : 0) },
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
  'face-wood': '#6a4420',
};

// ---------------------------------------------------------------------------
// Tiles: one sheet per surface, one 32x24 frame per shape (room for steep shapes).
// In a frame, the diamond at relative height 0 has corners
// nw (16,8), ne (32,16), se (16,24), sw (0,16). Each step up moves a corner 4px up
// (owner, 2026-11-15: the height step was halved from 8 pixels).

/** Pixels per height step (STEP_PX in src/render/iso.ts). */
const S = 4;
const TILE_W = 32;
const TILE_H = 16 + 2 * S;
const TILE_ANCHOR: P = [16, 8 + 2 * S];

// Light comes from the upper left of the screen. Grid x points down-right on
// screen and grid y points down-left, so "upper left" is mostly -x.
const LIGHT = (() => {
  const v = [-0.5, -0.4, 1];
  const len = Math.hypot(...v);
  return v.map((n) => n / len) as [number, number, number];
})();
/** One height step, in tile widths, for lighting only. */
const STEP = 0.25;
const CORNER_GRID: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

function cornerScreen(i: number, rel: number): P {
  const base: P[] = [
    [16, 2 * S],
    [32, 8 + 2 * S],
    [16, 16 + 2 * S],
    [0, 8 + 2 * S],
  ];
  const b = base[i]!;
  return [b[0], b[1] - rel * S];
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
      const [u, v] = frameToUV(x + 0.5, y + 0.5, 2 * S);
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
  const lift = (rel.reduce((a, b) => a + b, 0) / 4) * S;
  for (const [u, v] of [
    [0.25, 0.25],
    [0.75, 0.25],
    [0.25, 0.75],
    [0.75, 0.75],
    [0.5, 0.5],
  ] as const) {
    const cx = Math.round(16 + (u - v) * 16);
    const cy = Math.round(2 * S + (u + v) * 8 - lift);
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
      const [u, v] = frameToUV(x + 0.5, y + 0.5, 2 * S);
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

function drawFace(base: string, poly: readonly P[], shade: number): Image {
  const shades = ramp(base);
  const img = new Image(16, FACE_H);
  for (let y = 0; y < FACE_H; y++) {
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

/**
 * The rolled-up armadillo, 12x12 (owner, 2026-11-26: was 8x8; now about the
 * size of the standing armadillo's shell, closer to the enemies). The shell's
 * bands run across it so it reads as the same character.
 */
function drawBall(color = '#e8e8f0', band = '#8888a8'): Image {
  const img = new Image(12, 12);
  const shades = ramp(color);
  const outline = hex2('#303048');
  const bandC = ramp(band);
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const dx = x + 0.5 - 6;
      const dy = y + 0.5 - 6;
      const r = Math.hypot(dx, dy);
      if (r > 5.8) continue;
      if (r > 4.8) {
        img.set(x, y, outline);
        continue;
      }
      const lit = -dx * 0.45 - dy * 0.6;
      const level = lit > 1.6 ? 4 : lit > -0.6 ? 3 : 2;
      // Two curved bands, like the standing shell's.
      const onBand = Math.abs(dx + dy * 0.35 - 1.8) < 0.6 || Math.abs(dx + dy * 0.35 + 1.6) < 0.6;
      img.set(x, y, onBand ? bandC[Math.min(3, level)]! : shades[level]!);
    }
  }
  return img;
}

function drawShadow(): Image {
  const img = new Image(12, 5);
  const c = c15([10, 10, 30], 110);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 12; x++) {
      if (Math.hypot((x + 0.5 - 6) / 6, (y + 0.5 - 2.5) / 2.5) < 1) img.set(x, y, c);
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
// Course objects (Milestone 3): pickups, blockers, the first enemy.

/** Fill an ellipse with a shaded ramp lit from the upper left, plus an outline. */
function blob(img: Image, cx: number, cy: number, rx: number, ry: number, base: string, outline = '#202030'): void {
  const shades = ramp(base);
  const edge = hex2(outline);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      const r = Math.hypot(dx, dy);
      if (r > 1) continue;
      const rIn = Math.hypot((x + 0.5 - cx) / (rx - 1), (y + 0.5 - cy) / (ry - 1));
      if (rIn > 1) {
        img.set(x, y, edge);
        continue;
      }
      const lit = -dx * 0.6 - dy * 0.8;
      img.set(x, y, shades[lit > 0.55 ? 4 : lit > -0.1 ? 3 : lit > -0.6 ? 2 : 1]!);
    }
  }
}

function drawStar(fillHex: string): Image {
  const img = new Image(11, 11);
  const fill = ramp(fillHex);
  const edge = hex2('#5a3a08');
  // A five-pointed star: inside if the polar radius is under a wavy limit.
  const inside = (x: number, y: number) => {
    const dx = x + 0.5 - 5.5;
    const dy = y + 0.5 - 5.8;
    const a = Math.atan2(dy, dx) + Math.PI / 2;
    const k = Math.abs(((((a * 5) / (2 * Math.PI)) % 1) + 1) % 1 - 0.5) * 2; // 1 at a point, 0 between
    return Math.hypot(dx, dy) < 2.3 + 2.9 * k * k;
  };
  for (let y = 0; y < 11; y++) {
    for (let x = 0; x < 11; x++) {
      if (inside(x, y)) img.set(x, y, fill[x + y < 9 ? 4 : x + y < 13 ? 3 : 2]!);
      else if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) img.set(x, y, edge);
    }
  }
  return img;
}

function drawHeart(): Image {
  const img = new Image(9, 8);
  const rows = ['.oo...oo.', 'o44o.o43o', 'o4433333o', 'o3333332o', '.o33332o.', '..o332o..', '...o2o...', '....o....'];
  const sh = ramp('#e83c50');
  const edge = hex2('#401018');
  rows.forEach((r, y) => [...r].forEach((ch, x) => ch === 'o' ? img.set(x, y, edge) : ch !== '.' && img.set(x, y, sh[Number(ch)]!)));
  return img;
}

/** Round 3: the Grab Bag, a tied sack with a "?" on it (12x12, like a gear icon). */
function drawGrabBag(): Image {
  const img = new Image(12, 12);
  const rows = ['....oooo....', '.....oo.....', '....o44o....', '...o4433o...', '..o443333o..', '.o44333332o.', '.o43333332o.', '.o33333322o.', '.o33333222o.', '..o332222o..', '...oooooo...', '............'];
  const sh = ramp('#c89858');
  const edge = hex2('#402810');
  rows.forEach((r, y) => [...r].forEach((ch, x) => (ch === 'o' ? img.set(x, y, edge) : ch !== '.' && img.set(x, y, sh[Number(ch)]!))));
  const w = hex2('#f8f0c0');
  for (const [x, y] of [[5, 4], [6, 4], [7, 5], [6, 6], [6, 8]] as const) img.set(x, y, w);
  return img;
}

function drawShotOrb(): Image {
  const img = new Image(9, 9);
  blob(img, 4.5, 4.5, 4.5, 4.5, '#40c8e8', '#103048');
  // A small white arrow mark: "one more shot".
  const w = hex2('#f8f8ff');
  for (const [x, y] of [[4, 2], [3, 3], [4, 3], [5, 3], [4, 4], [4, 5]] as const) img.set(x, y, w);
  return img;
}

/** Round 2a: a dead tree: a thin grey trunk, two tiles tall, with bare branches. */
function drawDeadTree(): Image {
  const img = new Image(22, 40);
  const bark = ramp('#7a6a5a');
  const edge = hex2('#2a2018');
  for (let y = 10; y < 39; y++) {
    for (let x = 9; x < 13; x++) img.set(x, y, x === 9 || x === 12 || y === 38 ? edge : bark[x === 10 ? 3 : 2]!);
  }
  const branch = (x0: number, y0: number, dx: number, len: number) => {
    for (let k = 0; k < len; k++) {
      img.set(x0 + dx * k, y0 - k, edge);
      img.set(x0 + dx * k, y0 - k + 1, bark[2]!);
    }
  };
  branch(9, 18, -1, 7);
  branch(12, 14, 1, 7);
  branch(10, 10, -1, 6);
  branch(11, 10, 1, 5);
  branch(5, 13, -1, 3);
  return img;
}

/** Owner, 2026-11-21: fireflies, a small cluster of light pixels that flicker (4 frames). */
function drawFireflies(frame: number): Image {
  const img = new Image(14, 12);
  const spots: P[] = [[2, 3], [6, 1], [10, 4], [4, 8], [9, 9], [12, 7]];
  spots.forEach(([x, y], k) => {
    // Each fly is lit in some frames and dark in others, at its own rhythm.
    const lit = (k * 3 + frame * (k % 2 ? 1 : 3)) % 4 < 2;
    if (!lit) return;
    img.set(x, y, hex2('#f8f8a0'));
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const [r, g, b] = hex2('#c8f040');
      if (x + dx >= 0 && x + dx < 14 && y + dy >= 0 && y + dy < 12) img.set(x + dx, y + dy, [r, g, b, 110]);
    }
  });
  return img;
}

/** Round 2a scenery (sheet section 2.6): small props for looks only. */
function drawScenery(kind: string): Image {
  const img = new Image(12, 8);
  const put = (pts: readonly (readonly [number, number])[], c: string) => {
    for (const [x, y] of pts) img.set(x, y, hex2(c));
  };
  if (kind === 'tuft') {
    put([[3, 7], [3, 6], [3, 5], [5, 7], [5, 6], [5, 5], [5, 4], [7, 7], [7, 6], [8, 5], [4, 6], [6, 5]], '#2f7a35');
    put([[5, 3], [3, 4], [8, 4]], '#7cd060');
  } else if (kind === 'flowers') {
    put([[2, 7], [2, 6], [6, 7], [6, 6], [9, 7], [9, 6]], '#2f7a35');
    put([[2, 5], [9, 5]], '#f8e040');
    put([[6, 5], [5, 5], [7, 5], [6, 4]], '#e85890');
  } else if (kind === 'pebbles') {
    blob(img, 4, 5.5, 2.5, 1.8, '#9a948a', '#3a3630');
    blob(img, 8.5, 6.5, 2, 1.4, '#8c8478', '#3a3630');
  } else if (kind === 'mushrooms') {
    put([[4, 7], [4, 6], [8, 7]], '#e8e0d0');
    blob(img, 4, 4.5, 2.6, 1.7, '#c83828', '#3a1810');
    blob(img, 8, 6, 1.8, 1.2, '#c87838', '#3a1810');
  } else if (kind === 'leaves') {
    put([[2, 6], [3, 6], [3, 7]], '#a85a20');
    put([[6, 5], [7, 5], [7, 6]], '#c88030');
    put([[9, 7], [10, 7]], '#8a4818');
  } else if (kind === 'bones') {
    put([[2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6]], '#f0ece0');
    put([[1, 5], [1, 7], [9, 5], [9, 7]], '#f0ece0');
    put([[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]], '#9a9488');
  }
  return img;
}

function drawRock(): Image {
  const img = new Image(20, 14);
  blob(img, 10, 8, 10, 6.5, '#8c8478');
  // A few cracks.
  const crack = hex2('#4a4238');
  for (const [x, y] of [[7, 6], [8, 7], [13, 9], [14, 8], [11, 5]] as const) img.set(x, y, crack);
  return img;
}

function drawLowWall(): Image {
  // A full-tile block half a step high (4 px): a raised diamond top and two front sides.
  const img = new Image(32, 20);
  const top = ramp('#a8a090');
  const left = ramp('#807868');
  const right = ramp('#605848');
  const brick = hex2('#3a3428');
  const topPoly: P[] = [[16, 0], [32, 8], [16, 16], [0, 8]];
  const leftPoly: P[] = [[0, 8], [16, 16], [16, 20], [0, 12]];
  const rightPoly: P[] = [[16, 16], [32, 8], [32, 12], [16, 20]];
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 32; x++) {
      const px = x + BIAS_X;
      const py = y + BIAS_Y;
      if (insidePoly(px, py, topPoly)) img.set(x, y, (x + 2 * y) % 16 === 0 ? brick : top[!insidePoly(px, py + 1, topPoly) ? 2 : 3]!);
      else if (insidePoly(px, py, leftPoly)) img.set(x, y, x % 8 === 0 ? brick : left[3]!);
      else if (insidePoly(px, py, rightPoly)) img.set(x, y, x % 8 === 4 ? brick : right[3]!);
    }
  }
  return img;
}

function drawMossback(): Image {
  const img = new Image(18, 16);
  // Feet, then the mossy shell, then a little head with eyes.
  const foot = hex2('#5a4020');
  for (const [x, y] of [[3, 13], [4, 13], [13, 13], [14, 13], [3, 14], [14, 14]] as const) img.set(x, y, foot);
  blob(img, 9, 9, 8, 6, '#5c8c30', '#18280c');
  const moss = hex2('#9cc850');
  const dark = hex2('#3a5a1c');
  for (let y = 4; y < 14; y++) for (let x = 2; x < 16; x++) {
    if (hash(x, y, 21) < 0.12 && img.get(x, y)[3] > 0) img.set(x, y, moss);
    else if (hash(x, y, 22) < 0.08 && img.get(x, y)[3] > 0) img.set(x, y, dark);
  }
  // Face at the front (lower left on screen).
  blob(img, 5, 11, 3.5, 3, '#c8a868', '#3a2a10');
  const eye = hex2('#101010');
  img.set(4, 10, eye);
  img.set(6, 10, eye);
  return img;
}

// ---------------------------------------------------------------------------
// Milestone 4: enemies, obstacles, flags, clouds, abilities.

/** Draw a list of row strings: digits are shades of `base`, 'o' the outline, letters from `extra`. */
function rows(img: Image, ox: number, oy: number, lines: readonly string[], base: string, extra: Record<string, string> = {}, outline = '#202030'): void {
  const sh = ramp(base);
  const edge = hex2(outline);
  lines.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (ch === '.') return;
      if (ch === 'o') img.set(ox + x, oy + y, edge);
      else if (extra[ch]) img.set(ox + x, oy + y, hex2(extra[ch]!));
      else img.set(ox + x, oy + y, sh[Number(ch)]!);
    }),
  );
}

function eyes(img: Image, pts: readonly P[], color = '#101010'): void {
  for (const [x, y] of pts) img.set(x, y, hex2(color));
}

/** A shelled sentinel like the Mossback, in another colour, with an icon on its back. */
function drawCarrier(shell: string, mark: (img: Image) => void): Image {
  const img = new Image(18, 16);
  const foot = hex2('#5a4020');
  for (const [x, y] of [[3, 13], [4, 13], [13, 13], [14, 13], [3, 14], [14, 14]] as const) img.set(x, y, foot);
  blob(img, 9, 9, 8, 6, shell, '#18180c');
  blob(img, 5, 11, 3.5, 3, '#c8a868', '#3a2a10');
  eyes(img, [[4, 10], [6, 10]]);
  mark(img);
  return img;
}

function drawTrundler(): Image {
  // A rolling armoured barrel with a face: it trundles along its path.
  const img = new Image(18, 16);
  blob(img, 9, 8.5, 8, 7, '#a05a2c', '#2a1408');
  const band = hex2('#5a3014');
  for (let y = 2; y < 15; y++) for (const x of [6, 12]) if (img.get(x, y)[3] > 0) img.set(x, y, band);
  blob(img, 6, 10, 3, 2.5, '#e8c890', '#3a2010');
  eyes(img, [[5, 9], [7, 9]]);
  img.set(6, 11, hex2('#601010'));
  return img;
}

function drawSpitter(): Image {
  // A squat plant pod with a wide mouth that spits seeds.
  const img = new Image(18, 18);
  const leaf = hex2('#2c7020');
  for (const [x, y] of [[1, 15], [2, 14], [3, 14], [14, 14], [15, 14], [16, 15], [2, 15], [15, 15]] as const) img.set(x, y, leaf);
  blob(img, 9, 10, 7, 7, '#b04080', '#300818');
  blob(img, 7, 9, 3.2, 2.6, '#401020', '#200008');
  for (const [x, y] of [[11, 5], [12, 6], [5, 13], [13, 12]] as const) img.set(x, y, hex2('#f0a0d0'));
  eyes(img, [[10, 6], [12, 8]], '#f8f8f8');
  return img;
}

function drawLunger(): Image {
  // A round, spiky ball-creature that launches itself.
  const img = new Image(18, 16);
  blob(img, 9, 8.5, 7.5, 6.5, '#c83c30', '#300808');
  const spike = hex2('#f0e0c0');
  for (const [x, y] of [[9, 1], [3, 3], [15, 3], [1, 8], [17, 8], [4, 14], [14, 14]] as const) img.set(x, y, spike);
  blob(img, 6, 9, 3, 2.5, '#f8e0b0', '#400808');
  eyes(img, [[5, 8], [7, 8]]);
  for (let x = 4; x <= 8; x++) img.set(x, 11, hex2('#200000'));
  return img;
}

function drawMole(): Image {
  const img = new Image(16, 14);
  blob(img, 8, 8, 7, 5.5, '#6a4a38', '#1a100a');
  blob(img, 4.5, 9, 2.5, 2, '#f0a0a0', '#401818');
  eyes(img, [[6, 6], [9, 6]]);
  for (const [x, y] of [[2, 12], [3, 13], [12, 12], [13, 13]] as const) img.set(x, y, hex2('#e8d0b0'));
  return img;
}

function drawMolehill(): Image {
  const img = new Image(16, 8);
  blob(img, 8, 5.5, 7.5, 3.5, '#7a5230', '#2a1808');
  for (const [x, y] of [[5, 3], [9, 4], [11, 5], [6, 5]] as const) img.set(x, y, hex2('#a07850'));
  return img;
}

function drawSeed(): Image {
  const img = new Image(6, 6);
  blob(img, 3, 3, 2.6, 2.6, '#e0c040', '#402a00');
  return img;
}

function drawTargetRing(): Image {
  // A flat ring on the ground: where the next seed will land (0.75 tiles across).
  const img = new Image(26, 14);
  const c = c15(hex('#f84040'), 220);
  for (let y = 0; y < 14; y++) {
    for (let x = 0; x < 26; x++) {
      const r = Math.hypot((x + 0.5 - 13) / 12, (y + 0.5 - 7) / 6);
      if (r < 1 && r > 0.72) img.set(x, y, c);
      if (r < 0.2) img.set(x, y, c);
    }
  }
  return img;
}

function drawBlockSprite(w: number, topH: number, sideH: number, base: string, pattern?: (x: number, y: number) => boolean): Image {
  // An isometric block w px wide: diamond top topH tall, sides sideH tall.
  const h = topH + sideH;
  const img = new Image(w, h);
  const top = ramp(base);
  const half = w / 2;
  const topPoly: P[] = [[half, 0], [w, topH / 2], [half, topH], [0, topH / 2]];
  const leftPoly: P[] = [[0, topH / 2], [half, topH], [half, h], [0, h - topH / 2]];
  const rightPoly: P[] = [[half, topH], [w, topH / 2], [w, h - topH / 2], [half, h]];
  const edge = hex2('#202028');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + BIAS_X;
      const py = y + BIAS_Y;
      let c: RGBA | null = null;
      if (insidePoly(px, py, topPoly)) c = top[4]!;
      else if (insidePoly(px, py, leftPoly)) c = top[3]!;
      else if (insidePoly(px, py, rightPoly)) c = top[1]!;
      if (!c) continue;
      if (pattern && pattern(x, y)) c = edge;
      img.set(x, y, c);
    }
  }
  return img;
}

function drawSlidingBlock(): Image {
  return drawBlockSprite(28, 14, 8, '#7880a0', (x, y) => (x + y) % 9 === 0 && y > 2);
}

function drawGate(open: boolean): Image {
  // Bars across the tile; open, they sink to a low rail.
  const img = new Image(32, 26);
  const bar = ramp('#c0a040');
  const edge = hex2('#302808');
  const barH = open ? 2 : 14;
  for (let i = 0; i < 5; i++) {
    const bx = 4 + i * 6;
    const by = 6 + i * 3;
    for (let y = by + 12 - barH; y < by + 12; y++) {
      img.set(bx, y, edge);
      img.set(bx + 1, y, bar[4]!);
      img.set(bx + 2, y, bar[2]!);
      img.set(bx + 3, y, edge);
    }
  }
  // Rail along the bottom.
  for (let x = 2; x < 30; x++) img.set(x, Math.round(18 + (x - 2) * 0.5) - (open ? 0 : 0), edge);
  if (!open) for (let x = 2; x < 30; x++) img.set(x, Math.round(5 + (x - 2) * 0.5), bar[3]!);
  // Owner, 2026-11-21: spikes on top of a closed gate (it hurts to touch in the air).
  if (!open) {
    const tip = hex2('#e8e8f0');
    for (let i = 0; i < 5; i++) {
      const bx = 5 + i * 6;
      const by = 6 + i * 3;
      img.set(bx, by - 3, tip);
      img.set(bx, by - 2, tip);
      img.set(bx - 1, by - 1, tip);
      img.set(bx + 1, by - 1, tip);
    }
  }
  return img;
}

function drawCrate(secured: boolean, cracked: boolean): Image {
  const img = drawBlockSprite(26, 13, 9, '#b07838', (x, y) => (x % 7 === 0 && y > 6) || y === 13);
  if (secured) {
    const metal = hex2('#8890a0');
    for (let y = 0; y < img.height; y++) for (const x of [5, 20]) if (img.get(x, y)[3] > 0) img.set(x, y, metal);
    for (let x = 0; x < img.width; x++) {
      const y = Math.round(16 - Math.abs(x - 13) * 0.5);
      if (img.get(x, y)[3] > 0) img.set(x, y, metal);
    }
  }
  if (cracked) {
    const crack = hex2('#1a1008');
    for (const [x, y] of [[9, 8], [10, 9], [10, 10], [11, 11], [12, 12], [16, 10], [17, 11], [17, 12], [18, 13]] as const) img.set(x, y, crack);
  }
  return img;
}

/** Round 2b: a switch plate on the tile, red when off and green when on. */
function drawSwitch(on: boolean): Image {
  const img = new Image(32, 16);
  blob(img, 16, 8, 8, 4, '#8c8c96', '#202028');
  blob(img, 16, 7.5, 5, 2.5, on ? '#40c040' : '#d03030', '#202028');
  return img;
}

/** Round 2b: a linked gate: the gate with a lamp on top (lit when open). */
function drawLinkedGate(open: boolean): Image {
  const img = drawGate(open);
  blob(img, 4, 4, 3, 3, open ? '#60f060' : '#f04040', '#202020');
  return img;
}

/** Round 2b: a drawbridge's planks standing up at the moat edge while it is up. */
function drawDrawbridgeUp(): Image {
  const img = new Image(32, 28);
  const wood = ramp('#a87840');
  const edge = hex2('#3a2410');
  for (let i = 0; i < 4; i++) {
    const x0 = 8 + i * 4;
    const y0 = 4 + i * 2;
    for (let y = y0; y < y0 + 18; y++) {
      img.set(x0, y, edge);
      img.set(x0 + 1, y, wood[3]!);
      img.set(x0 + 2, y, wood[2]!);
      img.set(x0 + 3, y, edge);
    }
  }
  for (let x = 6; x < 26; x++) img.set(x, Math.round(10 + (x - 6) * 0.5), edge);
  return img;
}

function drawCrackedTile(): Image {
  // Cracks drawn on top of the tile it sits on (32x16 diamond).
  const img = new Image(32, 16);
  const crack = hex2('#2a2018');
  const pts: P[] = [[8, 8], [10, 7], [12, 8], [14, 7], [16, 8], [18, 9], [20, 8], [22, 9], [24, 8], [15, 5], [16, 6], [17, 11], [16, 12], [13, 10], [19, 6]];
  for (const [x, y] of pts) img.set(x, y, crack);
  return img;
}

// Water shore and splash (Milestone 5b).

/** A foam line just inside one edge of a flat tile. ne: the nw-ne edge, se: ne-se, sw: se-sw, nw: sw-nw. */
function drawShore(dir: Direction): Image {
  const img = new Image(TILE_W, TILE_H);
  const c = [cornerScreen(0, 0), cornerScreen(1, 0), cornerScreen(2, 0), cornerScreen(3, 0)];
  const [a, b] = ({ ne: [c[0]!, c[1]!], se: [c[1]!, c[2]!], sw: [c[2]!, c[3]!], nw: [c[3]!, c[0]!] } as const)[dir];
  const mid: P = [16, 8 + 2 * S + 8 - 8];
  const foam = hex2('#e8f4ff');
  for (let i = 1; i < 16; i++) {
    const t = i / 16;
    // One pixel in from the edge, towards the middle of the tile.
    const x = a[0] + (b[0] - a[0]) * t + (mid[0] - (a[0] + b[0]) / 2) * 0.12;
    const y = a[1] + (b[1] - a[1]) * t + (mid[1] - (a[1] + b[1]) / 2) * 0.25;
    if (hash(i, dir.length, 7) < 0.8) img.set(Math.round(x), Math.round(y), foam);
  }
  return img;
}

/** A splash ring that grows and fades over four frames, with a few drops. */
function drawSplash(f: number): Image {
  const img = new Image(16, 12);
  const light = hex2('#e8f4ff');
  const mid = hex2('#8cc4f8');
  const rx = 2 + f * 1.8;
  const ry = rx / 2;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    if (f === 3 && i % 2) continue;
    img.set(Math.round(8 + Math.cos(a) * rx), Math.round(9 + Math.sin(a) * ry), f < 2 ? light : mid);
  }
  if (f < 3) {
    for (const [dx, h] of [[-2, 3], [0, 5], [2, 3]] as const) img.set(8 + dx * (1 + f * 0.5), 9 - h + f, light);
  }
  return img;
}

// Guard rail (Milestone 5b): a post at each tile centre and a thin bar drawn in
// short pieces, so the bar follows slopes. Mostly see-through: just lines.
const RAIL_LIGHT = '#e8f0f8';
const RAIL_DARK = '#4a6078';
/** Bar height above the ground, in pixels (0.3 tiles is about 5 px). */
const RAIL_BAR_Y = 4;

function drawRailPost(): Image {
  const img = new Image(3, 8);
  for (let y = 1; y < 8; y++) {
    img.set(0, y, hex2(RAIL_DARK));
    img.set(1, y, hex2(RAIL_LIGHT));
    img.set(2, y, hex2(RAIL_DARK));
  }
  img.set(1, 0, hex2(RAIL_LIGHT));
  return img;
}

/** One piece of bar a quarter of a tile long, along a direction given in screen pixels per quarter tile. */
function drawRailBar(vx: number, vy: number): Image {
  const img = new Image(16, 12);
  const cx = 8;
  const cy = 8 - RAIL_BAR_Y;
  // A little longer than a quarter tile so neighbouring pieces overlap.
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps - 0.5) * 1.3;
    const x = Math.round(cx + vx * t);
    const y = Math.round(cy + vy * t);
    img.set(x, y + 1, hex2(RAIL_DARK));
  }
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps - 0.5) * 1.3;
    img.set(Math.round(cx + vx * t), Math.round(cy + vy * t), hex2(RAIL_LIGHT));
  }
  return img;
}

function drawFlag(raised: boolean): Image {
  // 1.5 tiles tall = 24 px of pole, with a pennant; lowered, it is sunk into its hole.
  const img = new Image(14, 30);
  const pole = hex2('#e8e8e8');
  const poleDark = hex2('#9898a0');
  const cloth = ramp('#e83030');
  const hole = hex2('#101018');
  for (let x = 2; x < 8; x++) img.set(x, 28, hole);
  for (let x = 3; x < 7; x++) img.set(x, 29, hole);
  if (raised) {
    for (let y = 3; y < 28; y++) {
      img.set(4, y, pole);
      img.set(5, y, poleDark);
    }
    for (let y = 3; y < 10; y++) for (let x = 6; x < 6 + Math.round((10 - y) * 1.1) + 1 && x < 14; x++) img.set(x, y, cloth[y < 6 ? 4 : 3]!);
  } else {
    for (let y = 22; y < 28; y++) {
      img.set(4, y, pole);
      img.set(5, y, poleDark);
    }
    for (let y = 22; y < 26; y++) for (let x = 6; x < 10; x++) img.set(x, y, cloth[1]!);
  }
  return img;
}

function drawCloud(flash: boolean): Image {
  const img = new Image(30, 22);
  const base = flash ? '#d8d8f0' : '#707488';
  blob(img, 10, 8, 8, 6, base, '#202030');
  blob(img, 19, 7, 9, 7, base, '#202030');
  blob(img, 15, 11, 10, 5, base, '#202030');
  const bolt = hex2('#f8f040');
  for (const [x, y] of [[14, 15], [13, 16], [14, 17], [15, 17], [14, 18], [13, 19], [13, 20], [18, 16], [17, 17], [18, 18], [17, 19]] as const) img.set(x, y, bolt);
  return img;
}

function drawSpark(): Image {
  const img = new Image(12, 12);
  const c = hex2('#f8f060');
  const w = hex2('#ffffff');
  for (let i = 0; i < 12; i++) {
    img.set(i, 6, c);
    img.set(6, i, c);
    img.set(i, i, c);
    img.set(11 - i, i, c);
  }
  for (const [x, y] of [[5, 5], [6, 5], [5, 6], [6, 6]] as const) img.set(x, y, w);
  return img;
}

function drawStump(): Image {
  // Same size as the old post: thin, 1.5 tiles tall, with rings on top and bark.
  const img = new Image(10, 28);
  const bark = ramp('#7a4a24');
  const edge = hex2('#2a1608');
  for (let y = 3; y < 27; y++) {
    for (let x = 1; x < 9; x++) {
      const e = x === 1 || x === 8 || y === 26;
      img.set(x, y, e ? edge : bark[(x + Math.floor(y / 3)) % 3 === 0 ? 1 : x < 4 ? 4 : 3]!);
    }
  }
  blob(img, 5, 3, 4.5, 2.6, '#d8b070', '#2a1608');
  img.set(5, 3, hex2('#8a6030'));
  img.set(4, 3, hex2('#a87840'));
  img.set(6, 3, hex2('#a87840'));
  return img;
}

function drawIcon(kind: string): Image {
  const img = new Image(10, 10);
  blob(img, 5, 5, 5, 5, { anchor: '#4060a0', burner: '#c04020', hop: '#40a040', tornado: '#7a7ab0', stunned: '#a09030', wild: '#b040c0', frost: '#78b8e8', static: '#d8b020', poisoned: '#70a030', chilled: '#a8d8f8', burr: '#8a6a30', kite: '#e07890', gyre: '#30a0a0', drift: '#a0a0e0' }[kind] ?? '#808080', '#101018');
  const w = hex2('#f8f8f8');
  const marks: Record<string, P[]> = {
    anchor: [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [4, 3], [6, 3], [3, 6], [7, 6], [4, 7], [6, 7]],
    burner: [[5, 2], [4, 3], [6, 4], [4, 5], [5, 5], [6, 5], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [4, 7], [5, 7], [6, 7]],
    hop: [[5, 2], [4, 3], [6, 3], [3, 4], [7, 4], [5, 4], [5, 5], [5, 6], [5, 7]],
    tornado: [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [3, 4], [4, 4], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5], [4, 6], [5, 6], [5, 7]],
    stunned: [[3, 3], [7, 3], [5, 2], [2, 5], [8, 5], [5, 5], [3, 7], [7, 7]],
    wild: [[4, 2], [5, 2], [6, 2], [6, 3], [6, 4], [5, 5], [5, 6], [5, 8]],
    // Milestone 8: a snowflake, a zigzag, a skull-ish drop, an ice crystal.
    frost: [[5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [2, 5], [3, 5], [4, 5], [6, 5], [7, 5], [8, 5], [3, 3], [7, 3], [3, 7], [7, 7]],
    static: [[6, 1], [5, 2], [4, 3], [5, 4], [6, 4], [5, 5], [4, 6], [5, 7], [4, 8]],
    poisoned: [[5, 2], [4, 3], [6, 3], [3, 4], [7, 4], [3, 5], [7, 5], [4, 6], [5, 6], [6, 6], [4, 8], [6, 8]],
    chilled: [[5, 2], [4, 3], [6, 3], [3, 4], [5, 4], [7, 4], [4, 5], [6, 5], [5, 6], [5, 7]],
    // Round 2b: a burr (spiky dot), a kite (diamond), a spiral arrow, a feather-ish float.
    burr: [[5, 2], [5, 8], [2, 5], [8, 5], [3, 3], [7, 3], [3, 7], [7, 7], [4, 4], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5], [4, 6], [5, 6], [6, 6]],
    kite: [[5, 1], [4, 2], [6, 2], [3, 3], [7, 3], [4, 4], [6, 4], [5, 5], [5, 6], [6, 7], [5, 8]],
    gyre: [[3, 3], [4, 2], [5, 2], [6, 2], [7, 3], [7, 4], [7, 5], [6, 6], [5, 6], [4, 5], [5, 4], [2, 3], [3, 4]],
    drift: [[2, 4], [3, 3], [4, 3], [5, 4], [6, 4], [7, 3], [8, 3], [2, 7], [3, 6], [4, 6], [5, 7], [6, 7], [7, 6], [8, 6]],
  };
  for (const [x, y] of marks[kind] ?? []) img.set(x, y, w);
  return img;
}

function drawAlert(): Image {
  const img = new Image(5, 9);
  rows(img, 0, 0, ['.ooo.', 'o44o.', '.o4o.', '.o4o.', '.o4o.', '..o..', '.ooo.', '.o4o.', '.ooo.'], '#f8d030', {}, '#401000');
  return img;
}

function drawTornadoBall(frame: number): Image {
  // The ball as a small whirlwind: a funnel of grey streaks around it.
  const img = new Image(12, 14);
  const streak = ramp('#c0c8e0');
  for (let y = 0; y < 14; y++) {
    const w = 1 + (14 - y) * 0.38;
    for (let k = -1; k <= 1; k += 2) {
      const x = Math.round(6 + k * w * Math.cos((y + frame * 3) * 0.9));
      img.set(x, y, streak[y % 3 === 0 ? 4 : 2]!);
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
  // Milestone 7: percent signs in upgrade and gear descriptions.
  '%': '101001010100101',
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
/** Every sprite's image, kept for the theme sets made at the end (round 2b). */
const images = new Map<string, { img: Image; frameWidth: number; frameHeight: number; frames: string[]; anchor: P }>();

function emit(id: string, img: Image, frameWidth: number, frameHeight: number, frames: string[], anchor: P): void {
  const file = `sprites/${id}.png`;
  mkdirSync(join(OUT, 'sprites'), { recursive: true });
  writeFileSync(join(OUT, file), encodePng(img));
  sprites[id] = { file, frameWidth, frameHeight, frames, anchor };
  images.set(id, { img, frameWidth, frameHeight, frames, anchor });
}

// ---------------------------------------------------------------------------
// Themes (round 2b sheet section 4.2; owner, 2026-11-14 and 2026-11-21): after
// each boss the look changes; only the art changes. Each theme recolours the
// ground (tiles, faces, water, shores), scenery and blockers; enemies, the ball,
// pickups and the HUD stay the same. A themed sprite is "<id>@<theme>"; the
// game picks it when that theme is on and falls back to "<id>".

type Recolour = (r: number, g: number, b: number) => RGB;
const lum = (r: number, g: number, b: number) => 0.3 * r + 0.59 * g + 0.11 * b;
const THEMES: Record<string, { sky: string; recolour: Recolour }> = {
  // Murky greens and browns, darker water.
  bog: { sky: '#2a3a2c', recolour: (r, g, b) => [r * 0.7 + g * 0.15 + 12, g * 0.72 + r * 0.1 + 6, b * 0.5 + 8] },
  // Grey-purple grass, bare brown earth.
  thornwood: { sky: '#3a2c40', recolour: (r, g, b) => { const l = lum(r, g, b); return [l * 0.8 + r * 0.25, l * 0.62 + g * 0.18, l * 0.78 + b * 0.25]; } },
  // Deep blue shading everywhere.
  night: { sky: '#0a0c22', recolour: (r, g, b) => { const l = lum(r, g, b); return [l * 0.3 + r * 0.15, l * 0.38 + g * 0.15, l * 0.55 + b * 0.25 + 28]; } },
  // Brown and grey stone.
  underground: { sky: '#1c1610', recolour: (r, g, b) => { const l = lum(r, g, b); return [l * 0.82 + r * 0.12, l * 0.7 + g * 0.08, l * 0.58 + b * 0.08]; } },
  // Owner, 2026-11-21: Starfall, endless mode's own theme: deep purples and indigo under a starry purple sky.
  starfall: { sky: '#1c0c30', recolour: (r, g, b) => { const l = lum(r, g, b); return [l * 0.55 + r * 0.2 + 18, l * 0.32 + g * 0.12 + 6, l * 0.7 + b * 0.25 + 30]; } },
  // Pale greens and purples, fog grey.
  spooky: { sky: '#2a2a36', recolour: (r, g, b) => { const l = lum(r, g, b); return [l * 0.72 + b * 0.2 + 10, l * 0.88 + 8, l * 0.7 + r * 0.25 + 14]; } },
};

/** Which sprites a theme recolours. */
const themed = (id: string) => /^(tile-|face-|scenery-|wall-)/.test(id) || ['water-shore', 'rock', 'stump', 'dead-tree', 'low-wall', 'drawbridge-up'].includes(id);

function recolourImage(src: Image, f: Recolour): Image {
  const out = new Image(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const [r, g, b, a] = src.get(x, y);
      if (a === 0) continue;
      out.set(x, y, c15(f(r, g, b), a));
    }
  }
  return out;
}

function emitThemes(): Record<string, { sky: string }> {
  for (const [theme, t] of Object.entries(THEMES)) {
    for (const [id, e] of [...images]) {
      if (!themed(id) || id.includes('@')) continue;
      emit(`${id}@${theme}`, recolourImage(e.img, t.recolour), e.frameWidth, e.frameHeight, e.frames, e.anchor);
    }
  }
  return Object.fromEntries([['day', { sky: '#1d2b53' }], ...Object.entries(THEMES).map(([k, t]) => [k, { sky: t.sky }])]);
}

const faceIds = new Set<string>();
/** Overlay frames: "<shape>" then "<shape>~1", "<shape>~2", ... for each animation phase. */
function overlaySheet(look: string, phases: number): { img: Image; frames: string[] } {
  const imgs: Image[] = [];
  const frames: string[] = [];
  for (let p = 0; p < phases; p++) {
    PHASE = p;
    for (const s of SHAPES) {
      imgs.push(drawTile(look, s));
      frames.push(p === 0 ? s : `${s}~${p}`);
    }
  }
  PHASE = 0;
  return { img: sheet(imgs), frames };
}

for (const def of SURFACES.values()) {
  // Checkerboard surfaces get a second frame per shape, "<shape>b".
  const tiles = SHAPES.map((s) => drawTile(def.id, s));
  const names = [...SHAPES];
  if (def.checker) {
    tiles.push(...SHAPES.map((s) => drawTile(`${def.id}-b`, s)));
    names.push(...SHAPES.map((s) => `${s}b`));
  }
  emit(def.tileSprite, sheet(tiles), TILE_W, TILE_H, names, TILE_ANCHOR);
  for (const id of [def.overlaySprite, def.deepOverlaySprite]) {
    if (!id) continue;
    const o = overlaySheet(id.replace(/^tile-/, ''), def.overlayFrames ?? 1);
    emit(id, o.img, TILE_W, TILE_H, o.frames, TILE_ANCHOR);
  }
  if (def.shoreSprite) emit(def.shoreSprite, sheet(DIRECTIONS.map(drawShore)), TILE_W, TILE_H, [...DIRECTIONS], TILE_ANCHOR);
  faceIds.add(def.faceSprite);
}
emit('splash', sheet([0, 1, 2, 3].map(drawSplash)), 16, 12, ['0', '1', '2', '3'], [8, 9]);
for (const id of faceIds) {
  const base = FACE_LOOKS[id];
  if (!base) throw new Error(`No placeholder colour for face "${id}". Add one to FACE_LOOKS.`);
  emit(`${id}-left`, sheet(FACE_FRAMES.map((f) => drawFace(base, LEFT_SHAPES[f], 3))), 16, FACE_H, [...FACE_FRAMES], [0, 0]);
  emit(`${id}-right`, sheet(FACE_FRAMES.map((f) => drawFace(base, RIGHT_SHAPES[f], 1))), 16, FACE_H, [...FACE_FRAMES], [0, 8]);
}
emit('arrow', sheet(DIRECTIONS.map(drawArrow)), 32, 16, [...DIRECTIONS], [16, 8]);
// Owner, 2026-11-26: 12x12, in each character's shell and band colours (as their standing armadillo).
emit('ball', drawBall('#d0d0e0', '#8888a8'), 12, 12, ['idle'], [6, 11]);
emit('ball-thud', drawBall('#8890a0', '#505868'), 12, 12, ['idle'], [6, 11]);
emit('ball-pip', drawBall('#e8c878', '#b08838'), 12, 12, ['idle'], [6, 11]);
emit('ball-shadow', drawShadow(), 12, 5, ['idle'], [6, 2]);
emit('exit', sheet([drawExit(false), drawExit(true)]), 16, 10, ['closed', 'open'], [8, 5]);
emit('star-yellow', drawStar('#f8d030'), 11, 11, ['idle'], [5, 10]);
emit('heart', drawHeart(), 9, 8, ['idle'], [4, 7]);
emit('grab-bag', drawGrabBag(), 12, 12, ['idle'], [6, 11]);
emit('shot-orb', drawShotOrb(), 9, 9, ['idle'], [4, 8]);
emit('rock', drawRock(), 20, 14, ['idle'], [10, 10]);
emit('stump', drawStump(), 10, 28, ['idle'], [5, 25]);
emit('low-wall', drawLowWall(), 32, 20, ['idle'], [16, 12]);
emit('dead-tree', drawDeadTree(), 22, 40, ['idle'], [11, 37]);
emit('switch', sheet([drawSwitch(false), drawSwitch(true)]), 32, 16, ['off', 'on'], [16, 8]);
emit('linked-gate', sheet([drawLinkedGate(true), drawLinkedGate(false)]), 32, 26, ['open', 'closed'], [16, 18]);
emit('drawbridge-up', drawDrawbridgeUp(), 32, 28, ['idle'], [16, 22]);
for (const k of ['tuft', 'flowers', 'pebbles', 'mushrooms', 'leaves', 'bones']) emit(`scenery-${k}`, drawScenery(k), 12, 8, ['idle'], [6, 6]);
emit('scenery-fireflies', sheet([0, 1, 2, 3].map(drawFireflies)), 14, 12, ['0', '1', '2', '3'], [7, 18]);
emit('snoozegrub', drawMossback(), 18, 16, ['idle'], [9, 14]);
// Milestone 4
emit('mudroller', drawTrundler(), 18, 16, ['idle'], [9, 14]);
emit('spittlebug', drawSpitter(), 18, 18, ['idle'], [9, 16]);
emit('pouncehopper', drawLunger(), 18, 16, ['idle'], [9, 14]);
emit('mole-cricket', drawMole(), 16, 14, ['idle'], [8, 12]);
emit('molehill', drawMolehill(), 16, 8, ['idle'], [8, 6]);
const mark = (color: string, pts: P[]) => (img: Image) => pts.forEach(([x, y]) => img.set(x, y, hex2(color)));
emit('leadgrub', drawCarrier('#4870b0', mark('#f8f8f8', [[11, 5], [11, 6], [11, 7], [11, 8], [10, 6], [12, 6], [9, 8], [13, 8]])), 18, 16, ['idle'], [9, 14]);
emit('embergrub', drawCarrier('#c85020', mark('#f8e040', [[11, 4], [10, 5], [12, 6], [10, 7], [11, 7], [12, 7], [11, 8]])), 18, 16, ['idle'], [9, 14]);
emit('hopgrub', drawCarrier('#40a040', mark('#f8f8f8', [[11, 4], [10, 5], [12, 5], [11, 6], [11, 7], [11, 8]])), 18, 16, ['idle'], [9, 14]);
emit('whirlgrub', drawCarrier('#7878b8', mark('#f8f8f8', [[9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [10, 5], [11, 5], [12, 5], [11, 6], [11, 7]])), 18, 16, ['idle'], [9, 14]);
emit('seed', drawSeed(), 6, 6, ['idle'], [3, 5]);
emit('target-ring', drawTargetRing(), 26, 14, ['idle'], [13, 7]);
emit('sliding-block', drawSlidingBlock(), 28, 22, ['idle'], [14, 14]);
emit('gate', sheet([drawGate(true), drawGate(false)]), 32, 26, ['open', 'closed'], [16, 18]);
emit('crate', drawCrate(false, false), 26, 22, ['idle'], [13, 15]);
emit('secured-crate', sheet([drawCrate(true, false), drawCrate(true, true)]), 26, 22, ['whole', 'cracked'], [13, 15]);
emit('cracked-tile', drawCrackedTile(), 32, 16, ['idle'], [16, 8]);
emit('rail-post', drawRailPost(), 3, 8, ['idle'], [1, 7]);
// Bar pieces: along grid x, along grid y, and the two 45-degree directions (x+y and x-y).
emit('rail-bar', sheet([drawRailBar(4, 2), drawRailBar(-4, 2), drawRailBar(0, 4), drawRailBar(8, 0)]), 16, 12, ['x', 'y', 'd1', 'd2'], [8, 8]);
emit('flag-pole', sheet([drawFlag(true), drawFlag(false)]), 14, 30, ['raised', 'lowered'], [5, 28]);
emit('star-marker', drawStar('#f8d030'), 11, 11, ['idle'], [5, 10]);
emit('thunder-cloud', sheet([drawCloud(false), drawCloud(true)]), 30, 22, ['idle', 'flash'], [15, 21]);
emit('zap-spark', drawSpark(), 12, 12, ['idle'], [6, 6]);
emit('wild', drawIcon('wild'), 10, 10, ['idle'], [5, 9]);
for (const k of ['anchor', 'burner', 'hop', 'tornado', 'stunned']) emit(`icon-${k}`, drawIcon(k), 10, 10, ['idle'], [5, 5]);
emit('alert', drawAlert(), 5, 9, ['idle'], [2, 9]);
emit('ball-tornado', sheet([0, 1, 2, 3].map(drawTornadoBall)), 12, 14, ['0', '1', '2', '3'], [6, 13]);

// ---------------------------------------------------------------------------
// Milestone 6: gear, map nodes, run upgrades, the town.

/** Border colour by rarity: grey, green, blue, purple, orange, gold. */
const RARITY_EDGE: Record<string, string> = {
  common: '#7a7a8a', uncommon: '#38a838', rare: '#3870e0', doubleRare: '#9840e0', specialRare: '#e88020', legendary: '#f8d020',
};
const FAMILY_FILL: Record<string, string> = {
  Shell: '#a8a8b8', Coat: '#e05828', Knob: '#a87848', Lining: '#e0d0a0', Guard: '#48a048', Hide: '#8a6040', Magnet: '#d83838', Sight: '#48a8e8', Pebble: '#58c878',
  // Milestone 7 (owner, 2026-11-17): slice perks.
  Grit: '#9a8878', Spinner: '#e8c048',
  // Round 3: the Needle family (poison green).
  Needle: '#78c838',
};
const UNIQUE_FILL: Record<string, string> = {
  'thunder-knuckle': '#f0e040', 'wrecking-shell': '#606878', 'leech-fang': '#c02848', 'sunfire-crown': '#f8a020', 'giants-knuckle': '#b08060', 'echo-shell': '#a080f0',
  'mirror-plate': '#c8e8f8', 'cork-plate': '#c89858', 'moss-plate': '#589838', 'phoenix-plate': '#f86020', 'bastion-plate': '#8890a8', 'storm-cloak': '#5868b8',
  'pocket-pillow': '#e8b8d8', 'golden-tooth': '#f0d048', 'feather-charm': '#f0f0f8', 'crown-of-plenty': '#f8c828', 'pocket-watch': '#d8b060', 'four-leaf-clover': '#38c048',
  'gamblers-vest': '#c03860', 'fortunes-mail': '#58c8a8', 'hot-streak-charm': '#f85818', 'golden-spinner': '#f8e060',
};
/** Shape masks, 12x12: weapon a spiked ball, armour a shield, bauble a gem. */
const GEAR_SHAPES: Record<string, readonly string[]> = {
  weapon: ['.....x......', '....xxx.....', '..x.xxx.x...', '...xxxxx....', '.xxxxxxxxx..', 'xxxxxxxxxxx.', '.xxxxxxxxx..', '...xxxxx....', '..x.xxx.x...', '....xxx.....', '.....x......', '............'],
  armour: ['............', '.xxxxxxxxx..', '.xxxxxxxxx..', '.xxxxxxxxx..', '.xxxxxxxxx..', '.xxxxxxxxx..', '..xxxxxxx...', '..xxxxxxx...', '...xxxxx....', '....xxx.....', '.....x......', '............'],
  bauble: ['............', '...xxxxx....', '..xxxxxxx...', '.xxxxxxxxx..', 'xxxxxxxxxxx.', '.xxxxxxxxx..', '..xxxxxxx...', '...xxxxx....', '....xxx.....', '.....x......', '............', '............'],
};
/** A small white mark per family or unique item, so items in one category are told apart. */
const GEAR_MARKS: Record<string, P[]> = {
  Shell: [[4, 5], [6, 5], [5, 4], [5, 6]], Coat: [[5, 3], [4, 4], [6, 5], [5, 6], [4, 6], [6, 6]], Knob: [[4, 4], [5, 4], [4, 5], [5, 5]],
  Lining: [[3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]], Guard: [[3, 3], [7, 3], [4, 4], [6, 4], [5, 5]], Hide: [[5, 3], [4, 4], [6, 4], [5, 5], [5, 6]],
  Magnet: [[3, 3], [3, 4], [3, 5], [7, 3], [7, 4], [7, 5], [4, 6], [5, 6], [6, 6]], Sight: [[3, 4], [4, 3], [5, 3], [6, 3], [7, 4], [5, 4]], Pebble: [[5, 3], [4, 4], [6, 4], [5, 5]],
  // A little wheel with a spoke (Spinner) and a bar (Grit).
  Spinner: [[4, 3], [5, 3], [6, 3], [3, 4], [7, 4], [3, 5], [5, 5], [7, 5], [4, 6], [5, 6], [6, 6], [5, 4]], Grit: [[3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [5, 5], [5, 6]],
  // A slanted needle.
  Needle: [[7, 3], [6, 4], [5, 5], [4, 6], [3, 7]],
};
function uniqueMark(id: string): P[] {
  // A star-shaped mark, turned a little differently for each item.
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 997;
  const pts: P[] = [[5, 4], [5, 5], [4, 5], [6, 5], [5, 6]];
  const extra: P[] = [[4, 3], [6, 3], [3, 6], [7, 6], [4, 7], [6, 7], [3, 4], [7, 4]];
  pts.push(extra[h % extra.length]!, extra[(h >> 3) % extra.length]!);
  return pts;
}
function drawGear(g: GearDef): Image {
  const img = new Image(12, 12);
  const mask = GEAR_SHAPES[g.category]!;
  const fill = ramp(g.family ? FAMILY_FILL[g.family]! : UNIQUE_FILL[g.id] ?? '#c0c0c0');
  const edge = hex2(RARITY_EDGE[g.rarity]!);
  const at = (x: number, y: number) => mask[y]?.[x] === 'x';
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      if (!at(x, y)) continue;
      const border = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      img.set(x, y, border ? edge : fill[x + y < 8 ? 4 : x + y < 12 ? 3 : 2]!);
    }
  }
  // Higher pairs get a second ring of the rarity colour inside the border.
  const w = hex2('#f8f8f8');
  for (const [x, y] of g.family ? GEAR_MARKS[g.family]! : uniqueMark(g.id)) if (at(x, y)) img.set(x, y, w);
  return img;
}

/** Map node icons, 14x14. */
function drawNode(kind: string): Image {
  const img = new Image(14, 14);
  const base = { course: '#58b858', hard: '#d84838', shop: '#d8a048', cache: '#a878d8', boss: '#702030', done: '#606070' }[kind] ?? '#808080';
  blob(img, 7, 7, 7, 7, base, '#101018');
  const w = hex2('#f8f8f8');
  const marks: Record<string, P[]> = {
    // A flag on a pole.
    course: [[5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10], [6, 3], [7, 3], [8, 4], [6, 4], [7, 4], [6, 5]],
    hard: [[5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8], [5, 9], [5, 10], [6, 3], [7, 3], [8, 4], [6, 4], [7, 4], [6, 5], [9, 8], [9, 9], [9, 11]],
    // A little house.
    shop: [[7, 3], [6, 4], [8, 4], [5, 5], [9, 5], [4, 6], [10, 6], [5, 7], [9, 7], [5, 8], [9, 8], [5, 9], [9, 9], [7, 8], [7, 9], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10]],
    // A chest.
    cache: [[4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [4, 6], [9, 6], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [4, 8], [9, 8], [6, 8], [7, 8], [4, 9], [9, 9], [4, 10], [5, 10], [6, 10], [7, 10], [8, 10], [9, 10]],
    // A face with a crown.
    boss: [[4, 3], [6, 3], [8, 3], [10, 3], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [5, 7], [9, 7], [5, 10], [6, 9], [7, 9], [8, 9], [9, 10]],
    done: [[4, 7], [5, 8], [6, 9], [7, 8], [8, 7], [9, 6], [10, 5]],
  };
  for (const [x, y] of marks[kind] ?? []) img.set(x, y, w);
  return img;
}

function drawUpgrade(kind: string): Image {
  const img = new Image(12, 12);
  const base = { health: '#e83c50', shots: '#40c8e8', power: '#f8a030', reach: '#f8d030', luck: '#40c060' }[kind] ?? '#808080';
  blob(img, 6, 6, 6, 6, base, '#101018');
  const w = hex2('#f8f8f8');
  // An up arrow: "more".
  for (const [x, y] of [[6, 2], [5, 3], [6, 3], [7, 3], [4, 4], [6, 4], [8, 4], [6, 5], [6, 6], [6, 7], [6, 8], [6, 9]] as P[]) img.set(x, y, w);
  return img;
}

function drawShieldIcon(): Image {
  const img = new Image(10, 10);
  rows(img, 0, 0, ['.oooooooo.', '.o444433o.', '.o444333o.', '.o443332o.', '.o433322o.', '..o3322o..', '..o3322o..', '...o22o...', '....oo....', '..........'], '#c8d8f0', {}, '#203048');
  return img;
}

/** The town (owner, 2026-11-15): a shop, the Burrow, and a signpost to carry on. Drawn in the game's pixel style. */
function drawShopBuilding(): Image {
  const img = new Image(56, 52);
  const wall = ramp('#d8c090');
  const roof = ramp('#b04830');
  const wood = ramp('#7a4a28');
  const edge = hex2('#281810');
  // Roof: a triangle.
  for (let y = 0; y < 20; y++) {
    const half = 4 + y * 1.35;
    for (let x = 0; x < 56; x++) {
      const dx = Math.abs(x + 0.5 - 28);
      if (dx > half) continue;
      img.set(x, y, dx > half - 1 || y === 19 ? edge : roof[(x + y) % 5 === 0 ? 2 : x < 28 ? 4 : 3]!);
    }
  }
  // Walls.
  for (let y = 20; y < 50; y++) for (let x = 4; x < 52; x++) img.set(x, y, x === 4 || x === 51 || y === 49 ? edge : wall[x < 28 ? 4 : 3]!);
  // Door and a window with goods.
  for (let y = 32; y < 49; y++) for (let x = 22; x < 34; x++) img.set(x, y, x === 22 || x === 33 || y === 32 ? edge : wood[y % 4 === 0 ? 2 : 3]!);
  img.set(31, 41, hex2('#f8e048'));
  for (let y = 25; y < 33; y++) for (let x = 8; x < 18; x++) img.set(x, y, x === 8 || x === 17 || y === 25 || y === 32 ? edge : hex2('#80c8f0'));
  for (let y = 25; y < 33; y++) for (let x = 38; x < 48; x++) img.set(x, y, x === 38 || x === 47 || y === 25 || y === 32 ? edge : hex2('#80c8f0'));
  // A star on the sign above the door.
  for (const [x, y] of [[28, 22], [27, 23], [28, 23], [29, 23], [26, 24], [27, 24], [28, 24], [29, 24], [30, 24], [27, 25], [29, 25]] as P[]) img.set(x, y, hex2('#f8d030'));
  return img;
}

function drawBurrow(): Image {
  const img = new Image(56, 36);
  // A grassy mound with a round door in it.
  blob(img, 28, 26, 27, 18, '#58a048', '#183010');
  for (let y = 0; y < 36; y++) for (let x = 0; x < 56; x++) if (y >= 33) img.set(x, y, [0, 0, 0, 0]);
  blob(img, 28, 26, 9, 9, '#3a2410', '#140c04');
  for (let y = 19; y < 33; y++) for (let x = 22; x < 35; x++) if (Math.hypot(x + 0.5 - 28, y + 0.5 - 27) < 6.5) img.set(x, y, hex2('#100804'));
  // A little lamp by the door.
  for (const [x, y] of [[40, 18], [40, 19], [41, 18], [41, 19]] as P[]) img.set(x, y, hex2('#f8e048'));
  for (let y = 20; y < 30; y++) img.set(40, y, hex2('#403020'));
  return img;
}

function drawSignpost(): Image {
  const img = new Image(28, 32);
  const wood = ramp('#a06a38');
  const edge = hex2('#281810');
  for (let y = 8; y < 32; y++) for (let x = 12; x < 16; x++) img.set(x, y, x === 12 || x === 15 ? edge : wood[3]!);
  // An arrow-shaped board pointing right.
  for (let y = 2; y < 14; y++) {
    for (let x = 1; x < 27; x++) {
      const tip = x >= 21 ? Math.abs(y + 0.5 - 8) <= 27 - x : true;
      if (!tip || y < 3 || y > 12) continue;
      const border = y === 3 || y === 12 || x === 1 || (x >= 21 && Math.abs(y + 0.5 - 8) > 26 - x);
      img.set(x, y, border ? edge : wood[4]!);
    }
  }
  return img;
}

function drawCursor(): Image {
  const img = new Image(9, 7);
  rows(img, 0, 0, ['ooooooooo', 'o4444444o', '.o44444o.', '..o444o..', '...o4o...', '....o....', '.........'], '#f8f8f8', {}, '#202030');
  return img;
}

for (const g of GEAR_LIST) emit(g.icon, drawGear(g), 12, 12, ['idle'], [6, 11]);
for (const k of ['course', 'hard', 'shop', 'cache', 'boss', 'done']) emit(`node-${k}`, drawNode(k), 14, 14, ['idle'], [7, 7]);
for (const u of UPGRADE_LIST) emit(u.icon, drawUpgrade(u.icon.replace('upgrade-', '')), 12, 12, ['idle'], [6, 6]);
emit('icon-burning', drawIcon('burner'), 10, 10, ['idle'], [5, 5]);
emit('icon-shield', drawShieldIcon(), 10, 10, ['idle'], [5, 5]);
emit('town-shop', drawShopBuilding(), 56, 52, ['idle'], [28, 51]);
emit('town-burrow', drawBurrow(), 56, 36, ['idle'], [28, 33]);
emit('town-sign', drawSignpost(), 28, 32, ['idle'], [14, 31]);
emit('cursor', drawCursor(), 9, 7, ['idle'], [4, 6]);

// ---------------------------------------------------------------------------
// Milestone 7: the Warden, blue stars, acorns, permanent upgrades, the summon puff.

/** The Warden: a big armoured stone shape, about two tiles wide. One frame per phase: it cracks as it loses health. */
function drawWarden(phase: number): Image {
  const img = new Image(44, 44);
  const foot = hex2('#3a3440');
  for (let y = 38; y < 42; y++) for (const x0 of [8, 30]) for (let x = x0; x < x0 + 7; x++) img.set(x, y, foot);
  blob(img, 22, 24, 20, 17, '#7a7484', '#18141c');
  // Plates on its back: fewer each phase (it sheds one at each phase change).
  const plate = ramp('#a89cb8');
  const plates: P[][] = [
    [[10, 12], [11, 12], [12, 12], [13, 12], [10, 13], [11, 13], [12, 13], [13, 13]],
    [[19, 9], [20, 9], [21, 9], [22, 9], [23, 9], [24, 9], [19, 10], [20, 10], [21, 10], [22, 10], [23, 10], [24, 10]],
    [[30, 12], [31, 12], [32, 12], [33, 12], [30, 13], [31, 13], [32, 13], [33, 13]],
  ];
  plates.slice(0, 3 - phase).forEach((pl) => pl.forEach(([x, y]) => img.set(x, y, plate[4]!)));
  // Cracks.
  const crack = hex2('#201820');
  const cracks: P[] = [[16, 18], [17, 19], [17, 20], [18, 21], [27, 16], [26, 17], [26, 18], [25, 19], [24, 20], [12, 26], [13, 27], [13, 28], [31, 25], [30, 26], [31, 27]];
  cracks.slice(0, phase * 7).forEach(([x, y]) => img.set(x, y, crack));
  // Face at the front, with glowing eyes.
  blob(img, 14, 30, 7, 5, '#5a5464', '#18141c');
  const glow = hex2(phase === 2 ? '#f84020' : '#f8c030');
  for (const [x, y] of [[11, 29], [12, 29], [16, 29], [17, 29]] as P[]) img.set(x, y, glow);
  for (let x = 11; x < 18; x++) img.set(x, 32, hex2('#18141c'));
  return img;
}

function drawAcorn(cap: string, nut: string, star: boolean): Image {
  const img = new Image(10, 11);
  blob(img, 5, 6.5, 4, 4, nut, '#3a2008');
  for (let y = 1; y < 5; y++) for (let x = 1; x < 9; x++) if (Math.hypot(x + 0.5 - 5, y + 0.5 - 4.5) < 4) img.set(x, y, hex2(y === 1 || x === 1 || x === 8 ? '#2a1808' : cap));
  img.set(5, 0, hex2('#3a2008'));
  if (star) for (const [x, y] of [[5, 6], [4, 7], [5, 7], [6, 7], [5, 8]] as P[]) img.set(x, y, hex2('#f8f8f8'));
  return img;
}

function drawPerm(base: string, mark: readonly P[]): Image {
  const img = new Image(12, 12);
  blob(img, 6, 6, 6, 6, base, '#101018');
  // A blue star corner: bought with blue stars.
  for (const [x, y] of [[9, 1], [8, 2], [9, 2], [10, 2], [9, 3]] as P[]) img.set(x, y, hex2('#58b8f8'));
  for (const [x, y] of mark) img.set(x, y, hex2('#f8f8f8'));
  return img;
}

function drawPuff(f: number): Image {
  const img = new Image(16, 14);
  const r = 3 + f * 1.5;
  for (const [cx, cy] of [[8, 8], [5, 9], [11, 9], [8, 5]] as P[]) blob(img, cx, cy, r * 0.6, r * 0.55, f < 2 ? '#e8e8f0' : '#a8a8b8', f < 2 ? '#8888a0' : '#787890');
  return img;
}

emit('stagwarden', sheet([0, 1, 2].map(drawWarden)), 44, 44, ['phase1', 'phase2', 'phase3'], [22, 41]);
emit('star-blue', drawStar('#48a8f8'), 11, 11, ['idle'], [5, 10]);
emit('acorn-lucky', drawAcorn('#7a5028', '#c89048', false), 10, 11, ['idle'], [5, 10]);
emit('acorn-golden', drawAcorn('#a07020', '#f8d040', false), 10, 11, ['idle'], [5, 10]);
emit('acorn-star', drawAcorn('#4050a0', '#88b8f8', true), 10, 11, ['idle'], [5, 10]);
emit('puff', sheet([0, 1, 2].map(drawPuff)), 16, 14, ['0', '1', '2'], [8, 12]);
const ARROW: P[] = [[6, 2], [5, 3], [6, 3], [7, 3], [4, 4], [6, 4], [8, 4], [6, 5], [6, 6], [6, 7], [6, 8], [6, 9]];
const PERM_LOOK: Record<string, [string, readonly P[]]> = {
  'perm-vitality': ['#e83c50', ARROW], 'perm-stamina': ['#40c8e8', ARROW], 'perm-head-start': ['#f8d030', ARROW],
  'perm-haggler': ['#d8a048', [[3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6]]], 'perm-fortune': ['#40c060', ARROW],
  'perm-knack': ['#e8c048', [[4, 3], [5, 3], [6, 3], [7, 3], [3, 4], [8, 4], [3, 5], [5, 5], [8, 5], [3, 6], [8, 6], [4, 7], [5, 7], [6, 7], [7, 7], [5, 4], [5, 6]]],
};
for (const [id, [base, mark]] of Object.entries(PERM_LOOK)) emit(id, drawPerm(base, mark), 12, 12, ['idle'], [6, 6]);


// ---------------------------------------------------------------------------
// Milestone 8 round 1 (sheet section 7.0): the insect cast's new bugs, the two
// new bosses, ability, status, trait and rank icons. All placeholders, drawn
// from simple shapes; the Milestone 9 art replaces them file for file.

function legs(img: Image, pts: readonly P[], color = '#201810'): void {
  for (const [x, y] of pts) img.set(x, y, hex2(color));
}

function drawSkitterAnt(): Image {
  // A small, quick worker ant: three round segments and thin legs.
  const img = new Image(16, 12);
  legs(img, [[3, 10], [5, 11], [7, 10], [9, 11], [11, 10], [13, 11], [2, 9], [14, 9]]);
  blob(img, 12, 7, 3.5, 3, '#a03020', '#200808');
  blob(img, 8, 7, 2, 2, '#a03020', '#200808');
  blob(img, 4, 6, 3, 2.8, '#b84030', '#200808');
  eyes(img, [[3, 5], [5, 5]], '#f8f8f8');
  legs(img, [[2, 2], [3, 3], [5, 2], [5, 3]], '#401010');
  return img;
}

function drawBristlecrawler(): Image {
  // A green caterpillar: segments, stinging bristles at its head (the front, on the left), a soft rear.
  const img = new Image(22, 14);
  for (const [cx, r] of [[18, 3.2], [14.5, 3.6], [11, 3.8], [7.5, 4]] as P[]) blob(img, cx, 8, r, r * 0.9, '#58a838', '#183010');
  blob(img, 4, 8, 3.5, 3.4, '#e0b040', '#302008');
  eyes(img, [[3, 7], [5, 7]]);
  const spine = hex2('#f8f0d0');
  for (const [x, y] of [[1, 3], [3, 2], [5, 2], [7, 2], [0, 6], [8, 3], [2, 4], [6, 3]] as P[]) img.set(x, y, spine);
  for (const [x, y] of [[11, 5], [14, 5], [18, 6]] as P[]) img.set(x, y, hex2('#a8e070'));
  return img;
}

function drawGlowmoth(): Image {
  // A floating moth: pale wings, a glowing belly.
  const img = new Image(20, 14);
  blob(img, 5, 6, 5, 4.5, '#e8e0b0', '#403820');
  blob(img, 15, 6, 5, 4.5, '#e8e0b0', '#403820');
  for (const [x, y] of [[4, 5], [16, 5], [5, 7], [15, 7]] as P[]) img.set(x, y, hex2('#a89870'));
  blob(img, 10, 8, 2.5, 4.5, '#f8f070', '#605010');
  eyes(img, [[9, 5], [11, 5]]);
  legs(img, [[8, 1], [9, 2], [12, 1], [11, 2]], '#403820');
  return img;
}

function drawTrapjaw(): Image {
  // A trap-jaw ant: a big head with long mandibles at the front (the left), a narrow back.
  const img = new Image(20, 16);
  legs(img, [[6, 14], [9, 15], [12, 14], [15, 15], [17, 13]]);
  blob(img, 15, 9, 4, 3.6, '#704020', '#200c04');
  blob(img, 8, 9, 5, 4.5, '#905028', '#200c04');
  eyes(img, [[6, 7], [9, 7]], '#f8f8f8');
  const jaw = hex2('#f0d8a0');
  for (const [x, y] of [[3, 8], [2, 8], [1, 7], [0, 6], [3, 11], [2, 11], [1, 12], [0, 13], [1, 6], [1, 13]] as P[]) img.set(x, y, jaw);
  return img;
}

function drawStinkpuff(): Image {
  // A stink bug: a shield-shaped back with a vent on top, a small head.
  const img = new Image(18, 15);
  legs(img, [[3, 13], [6, 14], [11, 14], [14, 13]]);
  rows(img, 2, 2, ['....oooooooo...', '..oo33333333oo.', '.o3344444443333o', 'o334444444433332', 'o333444443333320', '.o33333333333o..', '..oo33333333oo..', '....oo3333oo....', '......oooo......'], '#7a8a38', {}, '#202008');
  blob(img, 4, 9, 2.5, 2.2, '#5a6a28', '#202008');
  eyes(img, [[3, 8], [5, 8]], '#f8f070');
  for (const [x, y] of [[10, 4], [9, 5], [11, 5], [10, 6]] as P[]) img.set(x, y, hex2('#c8e060'));
  return img;
}

function drawGrublet(): Image {
  const img = new Image(10, 8);
  blob(img, 5, 5, 4.5, 3, '#e8d8b0', '#403020');
  for (const x of [3, 5, 7]) img.set(x, 4, hex2('#c0a880'));
  eyes(img, [[2, 4]]);
  return img;
}

/** Gloamhorn: a giant rhinoceros beetle. Closed, its wing cases are shut; open, they lift and show its soft back. */
function drawGloamhorn(phase: number, open: boolean): Image {
  const img = new Image(40, 36);
  legs(img, [[6, 33], [7, 34], [14, 34], [26, 34], [33, 33], [34, 34]]);
  if (open) {
    // The soft back, pale, with the wing cases raised to either side.
    blob(img, 21, 20, 14, 11, '#e8c8a0', '#302010');
    blob(img, 8, 13, 7, 9, '#283048', '#0c0c18');
    blob(img, 34, 13, 6, 9, '#283048', '#0c0c18');
  } else {
    blob(img, 21, 20, 16, 12, '#283048', '#0c0c18');
    for (let y = 9; y < 32; y++) if (img.get(21, y)[3] > 0) img.set(21, y, hex2('#0c0c18'));
    for (const [x, y] of [[14, 13], [15, 12], [26, 12], [27, 13]] as P[]) img.set(x, y, hex2('#6878a8'));
  }
  // Head and horn at the front (lower left).
  blob(img, 8, 26, 6, 5, '#384060', '#0c0c18');
  const horn = hex2('#d8d0c0');
  for (const [x, y] of [[4, 22], [3, 21], [3, 20], [2, 19], [2, 18], [5, 23]] as P[]) img.set(x, y, horn);
  const glow = hex2(phase === 2 ? '#f84020' : '#f8c030');
  img.set(7, 25, glow);
  img.set(10, 25, glow);
  // Scratches as it loses health.
  const cracks: P[] = [[17, 16], [18, 17], [25, 18], [24, 19], [30, 22], [29, 23], [13, 21]];
  cracks.slice(0, phase * 3).forEach(([x, y]) => img.set(x, y, hex2('#90a0c8')));
  return img;
}

/** The Brood Queen: a giant queen ant half sunk in her mound, a pale soft back on top, a crown of feelers that droops as she weakens. */
function drawBroodQueen(phase: number): Image {
  const img = new Image(48, 42);
  blob(img, 24, 32, 23, 9, '#8a6038', '#2a1808');
  blob(img, 26, 22, 15, 11, '#7a3428', '#200808');
  blob(img, 27, 18, 9, 6, '#f0d8c0', '#503020');
  blob(img, 11, 26, 7, 6, '#8a3c2c', '#200808');
  eyes(img, [[8, 24], [12, 24]], phase === 2 ? '#f84020' : '#f8e050');
  const feeler = hex2('#f8d040');
  const droop = phase;
  for (let k = 0; k < 6; k++) {
    img.set(8 - Math.floor(k / 2), 19 - k + Math.floor((droop * k) / 3), feeler);
    img.set(13 + Math.floor(k / 2), 19 - k + Math.floor((droop * k) / 3), feeler);
  }
  for (const [x, y] of [[3, 37], [10, 39], [40, 38], [44, 35], [18, 40]] as P[]) img.set(x, y, hex2('#b08858'));
  return img;
}

/** A small badge over an enemy: its traits and rank (sheet section 7.0a). */
function drawBadge(kind: string): Image {
  const img = new Image(7, 7);
  const colors: Record<string, string> = {
    shielded: '#58a8f8', armoured: '#a0a0b0', swift: '#f8f8f8', explosive: '#f86020', regenerating: '#58d858', splitting: '#e8d8b0',
  };
  blob(img, 3.5, 3.5, 3.5, 3.5, colors[kind] ?? '#808080', '#101018');
  const w = hex2('#101018');
  const marks: Record<string, P[]> = {
    shielded: [[3, 2], [2, 3], [4, 3], [3, 4]],
    armoured: [[2, 2], [3, 2], [4, 2], [2, 3], [4, 3], [3, 4]],
    swift: [[1, 3], [2, 3], [3, 3], [4, 2], [4, 4]],
    explosive: [[3, 1], [3, 2], [2, 3], [4, 3], [3, 5]],
    regenerating: [[3, 2], [2, 3], [3, 3], [4, 3], [3, 4]],
    splitting: [[2, 3], [4, 3]],
  };
  for (const [x, y] of marks[kind] ?? []) img.set(x, y, w);
  return img;
}

function drawRank(elite: boolean): Image {
  // Veteran: a stripe. Elite: a little crown of horns.
  const img = new Image(9, 5);
  const gold = hex2('#f8d040');
  const edge = hex2('#402800');
  if (elite) rows(img, 0, 0, ['o.o.o.o.o', 'o4o4o4o4o', 'o4444444o', 'o4444444o', 'ooooooooo'], '#f8d040', {}, '#402800');
  else {
    for (let x = 0; x < 9; x++) for (let y = 1; y < 4; y++) img.set(x, y, y === 2 ? gold : edge);
  }
  return img;
}

function drawFacingMark(): Image {
  // A small wedge on the ground ahead of a bug with a front that matters.
  const img = new Image(7, 5);
  rows(img, 0, 0, ['...o...', '..o4o..', '.o444o.', 'o44444o', 'ooooooo'], '#f8f8f8', {}, '#303040');
  return img;
}

// Round 4 (owner, 2026-11-23): the centipede, Thousandfoot. Placeholders: a ring of shell domes round the arena,
// pale soft weak spots, spine-pod shooters, scuttling legs, and a big head for phase 3.
function drawCoilSegment(kind: 'armour' | 'weak' | 'shooter' | 'scab'): Image {
  // Owner, 2026-11-24: the body is 3 tiles wide (was 2), so the domes are bigger.
  const img = new Image(56, 42);
  // Owner, 2026-11-24: a scab is a weak spot that was just hit, its shell grown back for a while: crusty brown, no bright rim.
  const base = kind === 'weak' ? '#f0a8b8' : kind === 'scab' ? '#8a5a48' : '#7a2c3c';
  blob(img, 28, 26, 27, 15, base, kind === 'weak' ? '#f8f0a0' : '#200810');
  if (kind === 'scab') {
    for (const [x, y] of [[16, 22], [17, 22], [24, 19], [25, 20], [33, 23], [34, 24], [21, 30], [30, 31], [39, 27], [27, 26]] as P[]) img.set(x, y, hex2('#4a2818'));
  } else if (kind === 'weak') {
    // Soft and bare: a few darker spots, a bright rim so it reads from far away.
    for (const [x, y] of [[18, 23], [28, 20], [38, 24], [23, 30], [34, 31], [29, 27]] as P[]) img.set(x, y, hex2('#c06078'));
  } else {
    // Shell bands across the dome.
    const band = hex2('#401018');
    for (const bx of [16, 28, 40]) for (let y = 12; y < 40; y++) if (img.get(bx, y)[3] > 0 && Math.abs(y - 26) < 13) img.set(bx, y, band);
  }
  if (kind === 'shooter') {
    // A spine pod on top: bone-coloured spines.
    blob(img, 28, 13, 9, 6, '#e8d8a8', '#403018');
    const spine = hex2('#f8f0d0');
    for (const [x, y] of [[23, 4], [23, 5], [23, 6], [28, 1], [28, 2], [28, 3], [28, 4], [33, 4], [33, 5], [33, 6]] as P[]) img.set(x, y, spine);
  }
  return img;
}

function drawCoilLegs(step: number): Image {
  const img = new Image(24, 10);
  const leg = hex2('#5a1c28');
  const tip = hex2('#e8d8a8');
  for (let k = 0; k < 4; k++) {
    const x0 = 3 + k * 6;
    const up = (k + step) % 2 === 0 ? 0 : 2;
    for (let i = 0; i < 6; i++) img.set(x0 + (i > 2 ? 1 : 0), 1 + up + i, leg);
    img.set(x0 + 1, 7 + up > 9 ? 9 : 7 + up, tip);
  }
  return img;
}

function drawCoilHead(phase: number): Image {
  const img = new Image(48, 44);
  blob(img, 24, 28, 22, 15, '#7a2c3c', '#200810');
  // The soft brow: its weak spot (the whole head counts double).
  blob(img, 24, 21, 10, 6, '#f0a8b8', '#f8f0a0');
  eyes(img, [[15, 26], [16, 26], [32, 26], [33, 26]], phase === 2 ? '#f84020' : '#f8e050');
  // Mandibles.
  const jaw = hex2('#e8d8a8');
  for (let k = 0; k < 7; k++) {
    img.set(14 + Math.floor(k / 2), 36 + k - (k > 4 ? (k - 4) * 2 : 0), jaw);
    img.set(33 - Math.floor(k / 2), 36 + k - (k > 4 ? (k - 4) * 2 : 0), jaw);
  }
  // Feelers.
  const feeler = hex2('#c05060');
  for (let k = 0; k < 9; k++) {
    img.set(18 - k, 14 - Math.floor(k / 2) + phase, feeler);
    img.set(29 + k, 14 - Math.floor(k / 2) + phase, feeler);
  }
  return img;
}

function drawQuill(): Image {
  const img = new Image(16, 5);
  rows(img, 0, 0, ['ooooo..........', 'o44444oooo.....', 'o4444444444oooo', 'o44444oooo.....', 'ooooo..........'], '#e8d8a8', {}, '#403018');
  return img;
}

function drawStuckQuill(): Image {
  // Owner, 2026-11-24: a fired spike stuck point-down in the ground.
  const img = new Image(7, 16);
  rows(img, 0, 0, ['...o...', '..o4o..', '..o4o..', '..o4o..', '.o444o.', '.o444o.', '.o444o.', '.o444o.', '.o444o.', '..o4o..', '..o4o..', '..o4o..', '...o...', '..ooo..', '.o222o.', 'ooooooo'], '#e8d8a8', {}, '#403018');
  return img;
}

function drawPlate(): Image {
  const img = new Image(12, 8);
  blob(img, 6, 4, 6, 4, '#7a2c3c', '#200810');
  return img;
}

function drawDangerTile(): Image {
  // A faint red diamond over a tile of the leg ring (where the sweep reaches).
  const img = new Image(32, 16);
  const fill = c15(hex('#f83030'), 100);
  const edge = c15(hex('#ff6050'), 200);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 32; x++) {
      const d = Math.abs(x + 0.5 - 16) / 16 + Math.abs(y + 0.5 - 8) / 8;
      if (d > 1) continue;
      img.set(x, y, d > 0.9 ? edge : fill);
    }
  }
  return img;
}

emit('centipede-segment', sheet((['armour', 'weak', 'shooter', 'scab'] as const).map(drawCoilSegment)), 56, 42, ['armour', 'weak', 'shooter', 'scab'], [28, 34]);
emit('centipede-quill-stuck', drawStuckQuill(), 7, 16, ['idle'], [3, 14]);
emit('centipede-legs', sheet([0, 1].map(drawCoilLegs)), 24, 10, ['a', 'b'], [12, 8]);
emit('centipede-head', sheet([0, 1, 2].map(drawCoilHead)), 48, 44, ['phase1', 'phase2', 'phase3'], [24, 38]);
emit('centipede-quill', drawQuill(), 16, 5, ['idle'], [8, 2]);
emit('centipede-plate', drawPlate(), 12, 8, ['idle'], [6, 4]);
emit('danger-tile', drawDangerTile(), 32, 16, ['idle'], [16, 8]);
emit('skitter-ant', drawSkitterAnt(), 16, 12, ['idle'], [8, 10]);
emit('bristlecrawler', drawBristlecrawler(), 22, 14, ['idle'], [11, 12]);
emit('glowmoth', drawGlowmoth(), 20, 14, ['idle'], [10, 12]);
emit('trapjaw', drawTrapjaw(), 20, 16, ['idle'], [10, 14]);
emit('stinkpuff', drawStinkpuff(), 18, 15, ['idle'], [9, 13]);
emit('grublet', drawGrublet(), 10, 8, ['idle'], [5, 7]);
emit('frostgrub', drawCarrier('#90c8f0', mark('#f8f8f8', [[11, 4], [11, 5], [11, 6], [11, 7], [11, 8], [9, 6], [10, 6], [12, 6], [13, 6], [10, 5], [12, 7]])), 18, 16, ['idle'], [9, 14]);
// Round 2b carriers: the grub with its ability's colour and mark.
emit('burrgrub', drawCarrier('#8a6a30', mark('#f8f8f8', [[11, 4], [11, 8], [9, 6], [13, 6], [10, 5], [11, 5], [12, 5], [10, 6], [11, 6], [12, 6], [10, 7], [11, 7], [12, 7]])), 18, 16, ['idle'], [9, 14]);
emit('glidegrub', drawCarrier('#e07890', mark('#f8f8f8', [[11, 3], [10, 4], [12, 4], [9, 5], [13, 5], [10, 6], [12, 6], [11, 7], [11, 8]])), 18, 16, ['idle'], [9, 14]);
emit('gyregrub', drawCarrier('#30a0a0', mark('#f8f8f8', [[10, 4], [11, 4], [12, 4], [13, 5], [13, 6], [12, 7], [11, 7], [10, 6], [11, 5]])), 18, 16, ['idle'], [9, 14]);
emit('driftgrub', drawCarrier('#a0a0e0', mark('#f8f8f8', [[9, 5], [10, 4], [11, 5], [12, 4], [13, 5], [9, 8], [10, 7], [11, 8], [12, 7], [13, 8]])), 18, 16, ['idle'], [9, 14]);
emit('sparkgrub', drawCarrier('#e8c830', mark('#302000', [[12, 4], [11, 5], [10, 6], [11, 6], [12, 6], [11, 7], [10, 8]])), 18, 16, ['idle'], [9, 14]);
emit(
  'gloamhorn',
  sheet([...[0, 1, 2].map((p) => drawGloamhorn(p, false)), ...[0, 1, 2].map((p) => drawGloamhorn(p, true))]),
  40,
  36,
  ['phase1', 'phase2', 'phase3', 'open1', 'open2', 'open3'],
  [20, 33],
);
emit('brood-queen', sheet([0, 1, 2].map(drawBroodQueen)), 48, 42, ['phase1', 'phase2', 'phase3'], [24, 36]);
for (const k of ['frost', 'static', 'poisoned', 'chilled', 'burr', 'kite', 'gyre', 'drift']) emit(`icon-${k}`, drawIcon(k), 10, 10, ['idle'], [5, 5]);
for (const t of ['shielded', 'armoured', 'swift', 'explosive', 'regenerating', 'splitting']) emit(`trait-${t}`, drawBadge(t), 7, 7, ['idle'], [3, 6]);
emit('rank-veteran', drawRank(false), 9, 5, ['idle'], [4, 4]);
emit('rank-elite', drawRank(true), 9, 5, ['idle'], [4, 4]);
emit('facing-mark', drawFacingMark(), 7, 5, ['idle'], [3, 2]);

// ---------------------------------------------------------------------------
// Milestone 8b (sheet docs/plans/milestone-8b.md): the armadillo, town buildings,
// crossroads props and the flat room pictures. All original placeholders.

/** The walking armadillo, 14x20, facing down-right ("dr") or up-right ("ur"); left is a flipped copy. */
function drawArmadillo(facing: 'dr' | 'ur', step: 0 | 1 | 2, shell = '#d0d0e0', band = '#8888a8'): Image {
  const img = new Image(14, 20);
  const skin = ramp('#e0b898');
  const edge = hex2('#303048');
  const legC = hex2('#a07860');
  // Legs first (behind the shell). Step frames move one leg forward.
  const legs: [number, number][] = [
    [4, step === 1 ? 15 : 16],
    [8, step === 2 ? 15 : 16],
  ];
  for (const [lx, top] of legs) {
    for (let y = top; y < 20; y++) for (let x = lx; x < lx + 2; x++) img.set(x, y, y === 19 ? edge : legC);
  }
  const head = facing === 'dr' ? { x: 10, y: 6 } : { x: 9, y: 4 };
  const drawHead = () => {
    blob(img, head.x, head.y, 3.6, 3.2, '#e0b898', '#303048');
    // Ears.
    for (const [x, y] of facing === 'dr' ? [[8, 2], [8, 3], [10, 2]] : [[7, 1], [7, 2], [9, 1]]) img.set(x!, y!, skin[2]!);
    if (facing === 'dr') {
      // Snout and eye.
      for (const [x, y] of [[12, 7], [13, 7], [13, 8], [12, 8]]) img.set(x!, y!, skin[3]!);
      img.set(13, 7, edge);
      img.set(10, 5, hex2('#101010'));
    }
  };
  if (facing === 'ur') drawHead();
  // The shell: banded, in the ball's pale colours, so the two read as one character.
  blob(img, 6.5, 11.5, 5.6, 5.8, shell, '#303048');
  for (let y = 7; y < 17; y++) {
    if ((y - 7) % 3 !== 2) continue;
    for (let x = 1; x < 13; x++) {
      const [, , , a] = img.get(x, y);
      const inside = Math.hypot((x + 0.5 - 6.5) / 4.6, (y + 0.5 - 11.5) / 4.8) < 1;
      if (a && inside) img.set(x, y, hex2(band));
    }
  }
  if (facing === 'dr') {
    drawHead();
    // A little arm in front.
    img.set(9, 12, skin[2]!);
    img.set(10, 12, skin[2]!);
  }
  return img;
}

function flipX(src: Image): Image {
  const out = new Image(src.width, src.height);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) out.set(src.width - 1 - x, y, src.get(x, y));
  return out;
}

/** Fill every pixel inside a polygon. */
function fillPoly(img: Image, pts: readonly P[], c: RGBA | ((x: number, y: number) => RGBA | null)): void {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (!insidePoly(x + BIAS_X, y + BIAS_Y, pts)) continue;
      const col = typeof c === 'function' ? c(x, y) : c;
      if (col) img.set(x, y, col);
    }
  }
}

/**
 * An isometric house on a 2x2-tile footprint (a 64 px wide diamond, inset a
 * little). Its anchor is the footprint's centre on the ground: [32, H - 17].
 */
function drawHouse(o: { wall: string; roof: string; wallH: number; roofH: number; door: 'left' | 'right'; pattern?: (x: number, y: number) => boolean; sign?: (img: Image, x: number, y: number) => void }): Image {
  const H = 34 + o.wallH + o.roofH + 2;
  const img = new Image(64, H);
  const cy = H - 17;
  const k = 0.92;
  const pt = (x: number, y: number): P => [32 + (x - 32) * k, cy + (y - cy) * k];
  const N = pt(32, cy - 16);
  const E = pt(64, cy);
  const S = pt(32, cy + 16);
  const W = pt(0, cy);
  const up = (p: P, h: number): P => [p[0], p[1] - h];
  const wall = ramp(o.wall);
  const roof = ramp(o.roof);
  const edge = hex2('#281810');
  const pat = (sh: RGBA, dark: RGBA) => (x: number, y: number) => (o.pattern?.(x, y) ? dark : sh);
  fillPoly(img, [W, S, up(S, o.wallH), up(W, o.wallH)], pat(wall[3]!, wall[2]!));
  fillPoly(img, [S, E, up(E, o.wallH), up(S, o.wallH)], pat(wall[2]!, wall[1]!));
  // Corner and base lines.
  for (let y = Math.round(S[1] - o.wallH); y <= Math.round(S[1]); y++) img.set(32, y, edge);
  // Door: a parallelogram on one face, from the ground up 13 px.
  const face = o.door === 'right' ? [S, E] : [W, S];
  const doorT = o.door === 'right' ? [0.32, 0.58] : [0.42, 0.68];
  const at = (t: number): P => [face[0]![0] + (face[1]![0] - face[0]![0]) * t, face[0]![1] + (face[1]![1] - face[0]![1]) * t];
  const d0 = at(doorT[0]!);
  const d1 = at(doorT[1]!);
  fillPoly(img, [d0, d1, up(d1, 13), up(d0, 13)], (_x, y) => (y % 4 === 0 ? hex2('#3a2010') : hex2('#5a3418')));
  const knob = at((doorT[0]! + doorT[1]!) / 2 + 0.06);
  img.set(Math.round(knob[0]), Math.round(knob[1] - 7), hex2('#f8e048'));
  // A window on the other face.
  const wface = o.door === 'right' ? [W, S] : [S, E];
  const wat = (t: number): P => [wface[0]![0] + (wface[1]![0] - wface[0]![0]) * t, wface[0]![1] + (wface[1]![1] - wface[0]![1]) * t];
  const w0 = up(wat(0.35), 7);
  const w1 = up(wat(0.62), 7);
  fillPoly(img, [w0, w1, up(w1, 7), up(w0, 7)], hex2('#f0d878'));
  // Roof: a pyramid with a small overhang.
  const r = 1.12;
  const rp = (p: P): P => [32 + (p[0] - 32) * r, cy - o.wallH + (p[1] - cy) * r];
  const [RN, RE, RS, RW] = [rp(N), rp(E), rp(S), rp(W)];
  const A: P = [32, cy - o.wallH - o.roofH];
  fillPoly(img, [RW, RN, A], roof[4]!);
  fillPoly(img, [RN, RE, A], roof[3]!);
  fillPoly(img, [RW, RS, A], (x, y) => ((x + y) % 5 === 0 ? roof[2]! : roof[3]!));
  fillPoly(img, [RS, RE, A], (x, y) => ((x - y) % 5 === 0 ? roof[0]! : roof[1]!));
  o.sign?.(img, Math.round(S[0]), Math.round(S[1] - o.wallH - 2));
  return img;
}

function drawFoodHut(): Image {
  const img = drawHouse({ wall: '#d8b070', roof: '#4a9a40', wallH: 20, roofH: 16, door: 'right', pattern: (_x, y) => y % 5 === 0 });
  // A crate of produce by the door.
  const cy = img.height - 17;
  for (let y = cy + 2; y < cy + 7; y++) for (let x = 52; x < 60; x++) img.set(x, y, hex2(y === cy + 2 ? '#e04030' : y === cy + 3 ? '#f8a030' : '#8a5a28'));
  return img;
}

function drawGearShop(): Image {
  return drawHouse({
    wall: '#9098a8',
    roof: '#3a4a7a',
    wallH: 22,
    roofH: 14,
    door: 'right',
    pattern: (x, y) => (y % 6 === 0 || (x + Math.floor(y / 6) * 5) % 10 === 0),
    sign: (img, x, y) => {
      // A round sign with a gear-tooth ring above the corner.
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= 4.2) img.set(x + dx, y + dy - 6, d > 3.2 ? hex2('#281810') : d < 1.5 ? hex2('#303040') : hex2('#f0c040'));
      }
    },
  });
}

function drawBurrowMound(): Image {
  const img = new Image(64, 48);
  const cy = 48 - 17;
  blob(img, 32, cy - 6, 31, 21, '#58a048', '#183010');
  // Clip the bottom to the footprint's lower half so it sits on the ground.
  for (let y = 0; y < 48; y++) for (let x = 0; x < 64; x++) if (y > cy + 14 - Math.abs(x - 32) * 0.45) img.set(x, y, [0, 0, 0, 0]);
  // Round door on the lower-left face.
  blob(img, 20, cy + 1, 7, 8, '#4a2c14', '#140c04');
  for (let y = cy - 6; y < cy + 9; y++) for (let x = 14; x < 27; x++) if (Math.hypot((x + 0.5 - 20) / 4.6, (y + 0.5 - cy - 2) / 6) < 1) img.set(x, y, hex2('#100804'));
  // A lamp by the door, and a few flowers.
  for (let y = cy - 12; y < cy + 6; y++) img.set(31, y, hex2('#403020'));
  for (const [x, y] of [[30, cy - 14], [31, cy - 14], [32, cy - 14], [30, cy - 13], [31, cy - 13], [32, cy - 13]]) img.set(x!, y!, hex2('#f8e048'));
  for (const [x, y, c] of [[42, cy - 12, '#f070a0'], [48, cy - 8, '#f8f070'], [38, cy - 20, '#f070a0'], [50, cy - 16, '#a0c8f8']] as const) img.set(x, y, hex2(c));
  return img;
}

function drawLamp(): Image {
  const img = new Image(8, 28);
  const iron = hex2('#303040');
  for (let y = 8; y < 26; y++) {
    img.set(3, y, iron);
    img.set(4, y, hex2('#505068'));
  }
  for (let x = 2; x < 6; x++) img.set(x, 26, iron);
  for (let y = 1; y < 8; y++) for (let x = 1; x < 7; x++) img.set(x, y, x === 1 || x === 6 || y === 1 || y === 7 ? iron : hex2(y < 4 ? '#fff8c0' : '#f8d850'));
  return img;
}

function drawBarrel(): Image {
  const img = new Image(12, 14);
  blob(img, 6, 7, 5.5, 6.6, '#9a6430', '#281408');
  for (const y of [3, 10]) for (let x = 1; x < 11; x++) if (img.get(x, y)[3]) img.set(x, y, hex2('#505060'));
  return img;
}

function drawBossGate(open: boolean): Image {
  // A stone gate on a 2x2 footprint: two pillars, a lintel with an insect mark, iron bars when closed.
  const img = new Image(64, 84);
  const cy = 84 - 17;
  const stone = ramp('#7a7088');
  const edge = hex2('#181420');
  // The base slab.
  fillPoly(img, [[2, cy], [32, cy - 15], [62, cy], [32, cy + 15]], stone[2]!);
  const pillar = (px: number) => {
    for (let y = cy - 56; y < cy + 2; y++) for (let x = px - 5; x < px + 5; x++) img.set(x, y, x === px - 5 || x === px + 4 ? edge : stone[x < px ? 4 : 2]!);
  };
  pillar(10);
  pillar(54);
  // Lintel.
  for (let y = cy - 64; y < cy - 54; y++) for (let x = 3; x < 61; x++) img.set(x, y, y === cy - 64 || y === cy - 55 ? edge : stone[3]!);
  // An insect mark: a beetle shape with red eyes.
  blob(img, 32, cy - 59, 6, 4, '#402838', '#181420');
  img.set(30, cy - 60, hex2('#ff3030'));
  img.set(34, cy - 60, hex2('#ff3030'));
  if (!open) {
    for (let x = 16; x < 50; x += 5) for (let y = cy - 54; y < cy + 1; y++) img.set(x, y, hex2(y % 9 === 0 ? '#8a8a98' : '#4a4a58'));
    for (let x = 15; x < 50; x++) img.set(x, cy - 30, hex2('#4a4a58'));
  } else {
    for (let y = cy - 54; y < cy + 1; y++) for (let x = 15; x < 50; x++) if ((x + y) % 3 === 0) img.set(x, y, hex2('#4a1868'));
  }
  return img;
}

function drawChest(open: boolean): Image {
  const img = new Image(18, 16);
  const box = drawBlockSprite(18, 9, 7, '#a06a30', (x, y) => y === 9 || (x === 9 && y > 9));
  img.blit(box, 0, 0);
  for (let x = 7; x < 11; x++) img.set(x, 11, hex2('#f8d030'));
  if (open) {
    for (let y = 0; y < 5; y++) for (let x = 2; x < 16; x++) img.set(x, y, hex2(y === 0 ? '#5a3418' : '#fff0a0'));
  }
  return img;
}

function drawTeeMat(): Image {
  const img = new Image(26, 14);
  fillPoly(img, [[13, 1], [25, 7], [13, 13], [1, 7]], (x, y) => hex2((x + y) % 4 < 2 ? '#2e7a30' : '#38883a'));
  img.set(13, 6, hex2('#f8f8f8'));
  img.set(13, 7, hex2('#c0c0c8'));
  return img;
}

/** Owner, 2026-11-22: a post either side of a path's far end, with a small lantern, marking the way to the next course. */
function drawPathPost(): Image {
  const img = new Image(10, 34);
  const wood = ramp('#8a5a30');
  const edge = hex2('#281810');
  for (let y = 10; y < 33; y++) for (let x = 3; x < 7; x++) img.set(x, y, x === 3 || x === 6 ? edge : wood[x === 4 ? 4 : 2]!);
  for (let x = 2; x < 8; x++) img.set(x, 33, edge);
  // A cap and a lantern hanging from it.
  for (let x = 1; x < 9; x++) {
    img.set(x, 9, edge);
    img.set(x, 8, wood[3]!);
  }
  for (let y = 1; y < 8; y++) for (let x = 2; x < 8; x++) img.set(x, y, x === 2 || x === 7 || y === 1 || y === 7 ? edge : hex2(y < 4 ? '#fff4b0' : '#f8c840'));
  return img;
}

function drawPracticeFlag(): Image {
  const img = new Image(12, 26);
  for (let y = 2; y < 25; y++) {
    img.set(2, y, hex2('#e8e8e8'));
    img.set(3, y, hex2('#9898a0'));
  }
  for (let y = 2; y < 9; y++) for (let x = 4; x < 4 + Math.round((9 - y) * 1.1) + 1 && x < 12; x++) img.set(x, y, hex2(y < 5 ? '#f8e048' : '#e0c030'));
  return img;
}

/** A flat room picture (sheet section 4), 384 x 216. */
function drawRoom(kind: 'food' | 'gear' | 'burrow'): Image {
  const W = 384;
  const Hh = 216;
  const img = new Image(W, Hh);
  const horizon = 150;
  const rect = (x0: number, y0: number, w: number, h: number, c: string) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) img.set(x, y, hex2(c));
  };
  if (kind === 'burrow') {
    // Earth all round, a rounded room carved out.
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
      const inside = Math.hypot((x - 192) / 200, (y - 160) / 150) < 1;
      img.set(x, y, hex2(inside ? (y > horizon ? ((x >> 3) + (y >> 3)) % 2 ? '#6a4a2a' : '#624426' : hash(x >> 2, y >> 2, 3) < 0.08 ? '#4a3018' : '#5a3a1e') : hash(x >> 2, y >> 2, 4) < 0.1 ? '#2a1a0c' : '#3a2412'));
    }
    // Roots from the ceiling.
    for (const rx of [70, 130, 250, 310]) for (let y = 12; y < 40 + (rx % 30); y++) img.set(rx + Math.round(Math.sin(y / 5) * 2), y, hex2('#2a1a0c'));
    // A bed of leaves (left), a stash chest (right), a shelf of jars (back), a warm lamp.
    for (let y = 150; y < 176; y++) for (let x = 30; x < 120; x++) if (Math.hypot((x - 75) / 45, (y - 163) / 13) < 1) img.set(x, y, hex2(hash(x, y, 5) < 0.5 ? '#c86a28' : '#e0a030'));
    rect(280, 130, 64, 36, '#8a5a28');
    rect(280, 130, 64, 4, '#5a3418');
    rect(308, 142, 8, 8, '#f8d030');
    rect(140, 70, 104, 4, '#5a3418');
    for (let i = 0; i < 6; i++) rect(146 + i * 16, 56, 10, 14, ['#80c8f0', '#f070a0', '#a0e070', '#f8e048', '#c0a0f8', '#f0a060'][i]!);
    rect(186, 20, 12, 10, '#f8e048');
    for (let y = 0; y < 20; y++) img.set(192, y, hex2('#2a1a0c'));
    return img;
  }
  const wallA = kind === 'food' ? '#e0c890' : '#8890a0';
  const wallB = kind === 'food' ? '#d4ba80' : '#7a8292';
  for (let y = 0; y < horizon; y++) for (let x = 0; x < W; x++) {
    const plank = kind === 'food' ? (x % 24 === 0 ? '#b09060' : wallA) : ((y >> 4) + (x >> 5)) % 2 ? wallA : wallB;
    img.set(x, y, hex2(kind === 'gear' && (y % 16 === 0 || (x + ((y >> 4) % 2) * 16) % 32 === 0) ? '#5a6070' : plank));
  }
  for (let y = horizon; y < Hh; y++) for (let x = 0; x < W; x++) img.set(x, y, hex2(((x >> 4) + (y >> 3)) % 2 ? '#7a5030' : '#6a4428'));
  // Shelves on the back wall.
  for (const sy of [40, 72, 104]) {
    rect(30, sy, 324, 4, '#5a3418');
    for (let i = 0; i < 18; i++) {
      const x = 36 + i * 18;
      if (kind === 'food') {
        const c = ['#e04030', '#f8a030', '#60c040', '#f8e048', '#a05030', '#e070c0'][(i + sy) % 6]!;
        for (let y = sy - 9; y < sy; y++) for (let xx = x; xx < x + 10; xx++) if (Math.hypot((xx - x - 5) / 5, (y - sy + 4.5) / 4.5) < 1) img.set(xx, y, hex2(c));
      } else {
        const c = ['#c0c8d8', '#f0c040', '#6898f8', '#b878f8', '#58d058', '#f8a040'][(i + sy) % 6]!;
        rect(x + 1, sy - 10, 8, 10, '#303040');
        rect(x + 2, sy - 9, 6, 8, c);
      }
    }
  }
  // The counter.
  rect(0, 128, W, 22, kind === 'food' ? '#9a6430' : '#5a5a68');
  rect(0, 128, W, 3, kind === 'food' ? '#c08848' : '#8a8a98');
  if (kind === 'gear') {
    // An anvil on the counter.
    rect(300, 112, 30, 8, '#303038');
    rect(308, 120, 14, 8, '#303038');
  } else {
    // A basket of apples on the counter.
    for (let y = 114; y < 128; y++) for (let x = 60; x < 100; x++) if (Math.hypot((x - 80) / 20, (y - 128) / 14) < 1) img.set(x, y, hex2(y < 120 ? '#e04030' : '#a07040'));
  }
  return img;
}

// Round 3 (owner, 2026-11-22): one look per character (placeholder recolours): Rollo pale lavender, Thud slate grey, Pip sandy gold.
for (const [suffix, shell, band] of [['', '#d0d0e0', '#8888a8'], ['-thud', '#8890a0', '#505868'], ['-pip', '#e8c878', '#b08838']] as const) {
  emit(`armadillo${suffix}`, sheet((['dr', 'ur'] as const).flatMap((f) => ([0, 1, 2] as const).map((s) => drawArmadillo(f, s, shell, band)))), 14, 20, ['dr-stand', 'dr-step1', 'dr-step2', 'ur-stand', 'ur-step1', 'ur-step2'], [7, 19]);
  emit(`armadillo${suffix}-left`, sheet((['dr', 'ur'] as const).flatMap((f) => ([0, 1, 2] as const).map((s) => flipX(drawArmadillo(f, s, shell, band))))), 14, 20, ['dl-stand', 'dl-step1', 'dl-step2', 'ul-stand', 'ul-step1', 'ul-step2'], [6, 19]);
}
{
  const food = drawFoodHut();
  emit('place-food-hut', food, 64, food.height, ['idle'], [32, food.height - 17]);
  const gear = drawGearShop();
  emit('place-gear-shop', gear, 64, gear.height, ['idle'], [32, gear.height - 17]);
}
emit('place-burrow', drawBurrowMound(), 64, 48, ['idle'], [32, 31]);
emit('place-signpost', drawSignpost(), 28, 32, ['idle'], [14, 31]);
emit('place-lamp', drawLamp(), 8, 28, ['idle'], [4, 26]);
emit('place-barrel', drawBarrel(), 12, 14, ['idle'], [6, 12]);
emit('place-boss-gate', sheet([drawBossGate(false), drawBossGate(true)]), 64, 84, ['closed', 'open'], [32, 67]);
emit('place-chest', sheet([drawChest(false), drawChest(true)]), 18, 16, ['closed', 'open'], [9, 11]);
emit('place-tee-mat', drawTeeMat(), 26, 14, ['idle'], [13, 7]);
emit('place-practice-flag', drawPracticeFlag(), 12, 26, ['idle'], [2, 24]);
emit('place-path-post', drawPathPost(), 10, 34, ['idle'], [5, 33]);
for (const k of ['food', 'gear', 'burrow'] as const) emit(`room-${k}`, drawRoom(k), 384, 216, ['idle'], [0, 0]);

const font = drawFont();
emit('font', font.img, 4, 6, font.frames, [0, 0]);

// Milestone 8 (sheet section 3): the tint of an enemy with an element, set here so the final art can change it.
const tints = { fire: '#ff9060', ice: '#a0d8ff', shock: '#fff070' };
/**
 * Drawn art (owner, 2026-11-26): finished art in art/drawn/ wins over the
 * generated placeholders, so running this script never overwrites it.
 *
 * - art/drawn/<id>.png replaces the generated sprite <id>. It must be the same
 *   size; the frames and anchor stay as generated.
 * - A sprite the script does not generate needs art/drawn/<id>.json next to
 *   it: { "frameWidth", "frameHeight", "frames": [...], "anchor": [x, y] }.
 * - Themed sprites (tiles, faces, scenery, walls...) get their theme versions
 *   by recolouring the drawn art, like the placeholders. A drawn
 *   art/drawn/<id>@<theme>.png replaces that one theme version instead.
 */
const DRAWN = join(ROOT, 'art', 'drawn');
const drawnFiles = existsSync(DRAWN) ? readdirSync(DRAWN).filter((f) => f.endsWith('.png')).sort() : [];
function applyDrawn(file: string): void {
  const id = file.slice(0, -4);
  const img = decodePng(readFileSync(join(DRAWN, file)), `art/drawn/${file}`);
  const metaFile = join(DRAWN, `${id}.json`);
  const old = images.get(id);
  if (old) {
    if (old.img.width !== img.width || old.img.height !== img.height) {
      throw new Error(`art/drawn/${file} is ${img.width}x${img.height}, but the sprite "${id}" is ${old.img.width}x${old.img.height}. Make it the same size, or change the generator.`);
    }
    emit(id, img, old.frameWidth, old.frameHeight, old.frames, old.anchor);
    return;
  }
  if (id.includes('@')) throw new Error(`art/drawn/${file}: there is no sprite "${id}" to replace.`);
  if (!existsSync(metaFile)) throw new Error(`art/drawn/${file} is a new sprite, so it needs art/drawn/${id}.json with frameWidth, frameHeight, frames and anchor.`);
  const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as { frameWidth: number; frameHeight: number; frames: string[]; anchor: [number, number] };
  const cols = img.width / meta.frameWidth;
  const rows = img.height / meta.frameHeight;
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols * rows < meta.frames.length) {
    throw new Error(`art/drawn/${file} (${img.width}x${img.height}) does not hold ${meta.frames.length} frames of ${meta.frameWidth}x${meta.frameHeight}.`);
  }
  emit(id, img, meta.frameWidth, meta.frameHeight, meta.frames, meta.anchor);
}
for (const f of drawnFiles) if (!f.includes('@')) applyDrawn(f);

const themes = emitThemes();
for (const f of drawnFiles) if (f.includes('@')) applyDrawn(f);
const manifest: Manifest = { version: 1, sprites, tints, themes };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${Object.keys(sprites).length} sprites to assets/sprites and assets/manifest.json (${drawnFiles.length} from art/drawn)`);
