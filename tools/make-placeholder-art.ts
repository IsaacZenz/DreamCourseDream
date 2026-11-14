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

function drawShotOrb(): Image {
  const img = new Image(9, 9);
  blob(img, 4.5, 4.5, 4.5, 4.5, '#40c8e8', '#103048');
  // A small white arrow mark: "one more shot".
  const w = hex2('#f8f8ff');
  for (const [x, y] of [[4, 2], [3, 3], [4, 3], [5, 3], [4, 4], [4, 5]] as const) img.set(x, y, w);
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

function drawCrackedTile(): Image {
  // Cracks drawn on top of the tile it sits on (32x16 diamond).
  const img = new Image(32, 16);
  const crack = hex2('#2a2018');
  const pts: P[] = [[8, 8], [10, 7], [12, 8], [14, 7], [16, 8], [18, 9], [20, 8], [22, 9], [24, 8], [15, 5], [16, 6], [17, 11], [16, 12], [13, 10], [19, 6]];
  for (const [x, y] of pts) img.set(x, y, crack);
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
  blob(img, 5, 5, 5, 5, { anchor: '#4060a0', burner: '#c04020', hop: '#40a040', tornado: '#7a7ab0', stunned: '#a09030', wild: '#b040c0' }[kind] ?? '#808080', '#101018');
  const w = hex2('#f8f8f8');
  const marks: Record<string, P[]> = {
    anchor: [[5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [4, 3], [6, 3], [3, 6], [7, 6], [4, 7], [6, 7]],
    burner: [[5, 2], [4, 3], [6, 4], [4, 5], [5, 5], [6, 5], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [4, 7], [5, 7], [6, 7]],
    hop: [[5, 2], [4, 3], [6, 3], [3, 4], [7, 4], [5, 4], [5, 5], [5, 6], [5, 7]],
    tornado: [[2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [3, 4], [4, 4], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5], [4, 6], [5, 6], [5, 7]],
    stunned: [[3, 3], [7, 3], [5, 2], [2, 5], [8, 5], [5, 5], [3, 7], [7, 7]],
    wild: [[4, 2], [5, 2], [6, 2], [6, 3], [6, 4], [5, 5], [5, 6], [5, 8]],
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
emit('star-yellow', drawStar('#f8d030'), 11, 11, ['idle'], [5, 10]);
emit('heart', drawHeart(), 9, 8, ['idle'], [4, 7]);
emit('shot-orb', drawShotOrb(), 9, 9, ['idle'], [4, 8]);
emit('rock', drawRock(), 20, 14, ['idle'], [10, 10]);
emit('stump', drawStump(), 10, 28, ['idle'], [5, 25]);
emit('low-wall', drawLowWall(), 32, 20, ['idle'], [16, 12]);
emit('mossback', drawMossback(), 18, 16, ['idle'], [9, 14]);
// Milestone 4
emit('trundler', drawTrundler(), 18, 16, ['idle'], [9, 14]);
emit('spitter', drawSpitter(), 18, 18, ['idle'], [9, 16]);
emit('lunger', drawLunger(), 18, 16, ['idle'], [9, 14]);
emit('mole', drawMole(), 16, 14, ['idle'], [8, 12]);
emit('molehill', drawMolehill(), 16, 8, ['idle'], [8, 6]);
const mark = (color: string, pts: P[]) => (img: Image) => pts.forEach(([x, y]) => img.set(x, y, hex2(color)));
emit('anchorback', drawCarrier('#4870b0', mark('#f8f8f8', [[11, 5], [11, 6], [11, 7], [11, 8], [10, 6], [12, 6], [9, 8], [13, 8]])), 18, 16, ['idle'], [9, 14]);
emit('emberback', drawCarrier('#c85020', mark('#f8e040', [[11, 4], [10, 5], [12, 6], [10, 7], [11, 7], [12, 7], [11, 8]])), 18, 16, ['idle'], [9, 14]);
emit('hopback', drawCarrier('#40a040', mark('#f8f8f8', [[11, 4], [10, 5], [12, 5], [11, 6], [11, 7], [11, 8]])), 18, 16, ['idle'], [9, 14]);
emit('whirlback', drawCarrier('#7878b8', mark('#f8f8f8', [[9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [10, 5], [11, 5], [12, 5], [11, 6], [11, 7]])), 18, 16, ['idle'], [9, 14]);
emit('seed', drawSeed(), 6, 6, ['idle'], [3, 5]);
emit('target-ring', drawTargetRing(), 26, 14, ['idle'], [13, 7]);
emit('sliding-block', drawSlidingBlock(), 28, 22, ['idle'], [14, 14]);
emit('gate', sheet([drawGate(true), drawGate(false)]), 32, 26, ['open', 'closed'], [16, 18]);
emit('crate', drawCrate(false, false), 26, 22, ['idle'], [13, 15]);
emit('secured-crate', sheet([drawCrate(true, false), drawCrate(true, true)]), 26, 22, ['whole', 'cracked'], [13, 15]);
emit('cracked-tile', drawCrackedTile(), 32, 16, ['idle'], [16, 8]);
emit('flag-pole', sheet([drawFlag(true), drawFlag(false)]), 14, 30, ['raised', 'lowered'], [5, 28]);
emit('star-marker', drawStar('#f8d030'), 11, 11, ['idle'], [5, 10]);
emit('thunder-cloud', sheet([drawCloud(false), drawCloud(true)]), 30, 22, ['idle', 'flash'], [15, 21]);
emit('zap-spark', drawSpark(), 12, 12, ['idle'], [6, 6]);
emit('wild', drawIcon('wild'), 10, 10, ['idle'], [5, 9]);
for (const k of ['anchor', 'burner', 'hop', 'tornado', 'stunned']) emit(`icon-${k}`, drawIcon(k), 10, 10, ['idle'], [5, 5]);
emit('alert', drawAlert(), 5, 9, ['idle'], [2, 9]);
emit('ball-tornado', sheet([0, 1, 2, 3].map(drawTornadoBall)), 12, 14, ['0', '1', '2', '3'], [6, 13]);
const font = drawFont();
emit('font', font.img, 4, 6, font.frames, [0, 0]);

const manifest: Manifest = { version: 1, sprites };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${Object.keys(sprites).length} sprites to assets/sprites and assets/manifest.json`);
