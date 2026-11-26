/**
 * B1B wall art V3 (owner, 2026-11-26): an artistic refinement of the approved
 * V2 textures. Same files, same sizes (16x128), same palettes, same engine.
 * Writes the 8 soil and 12 rock textures to art/drawn/; the overhangs stay V2's.
 * Run with: npm run art:b1b-v3, then npm run art.
 *
 * Deterministic: every random choice comes from a seeded generator, so the
 * same script always writes the same pixels. Change a seed or a number below
 * to make a different texture.
 *
 * What V3 changes, from the owner's brief:
 * - Rocks are irregular angular polygons (4 to 7 corners), split into a lit
 *   and a shaded facet, instead of rounded ovals.
 * - Some rocks are partly buried: their lower part (or one side) is cut off
 *   by the dirt with no outline there, and a few dirt crumbs sit on the edge.
 * - A mix of bare soil, small stones and occasional large fragments; rocks
 *   are spaced so they do not stack into vertical clusters.
 * - Soil gets large, low-contrast colour patches: areas of denser speckle in
 *   the B1B soil tones (value noise), with no solid shapes, so a patch cut
 *   off at the strip's side never draws a line where two walls meet.
 * - No lighting is baked in beyond the rocks' own form (lit upper left, as
 *   B1B); no cast shadows, no ambient occlusion, no atmosphere.
 * - Every texture repeats top to bottom (row 127 continues into row 0), and
 *   no rock touches columns 0 or 15.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Image, encodePng, type RGBA } from './png.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'art', 'drawn');
const W = 16;
const H = 128;

type Side = 'left' | 'right';

const hex = (h: string): RGBA => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];

/** The V2 palettes (B1B), per side. Nothing new is invented. */
const PAL = {
  left: {
    soil: hex('#9e5739'),
    soilDark: hex('#99563e'),
    soilLight: hex('#ad6240'),
    grain: hex('#884a39'),
    outline: hex('#69483e'),
    shade: hex('#9a6d51'),
    mid: hex('#b78960'),
    light: hex('#d0a578'),
  },
  right: {
    soil: hex('#79443b'),
    soilDark: hex('#703d37'),
    soilLight: hex('#8c4c3d'),
    grain: hex('#703d37'),
    outline: hex('#593c3b'),
    shade: hex('#805c4b'),
    mid: hex('#967051'),
    light: hex('#b28b66'),
  },
} as const;

/** A small seeded generator (mulberry32) from a text seed. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrapY = (y: number) => ((y % H) + H) % H;

// ---------------------------------------------------------------------------
// Soil

/** Smooth value noise that repeats every H rows. `cell` is the lattice size in pixels. */
function noise(r: () => number, cellX: number, cellY: number): (x: number, y: number) => number {
  const nx = Math.ceil(W / cellX) + 1;
  const ny = H / cellY;
  const lattice = Array.from({ length: nx * ny }, () => r());
  const at = (i: number, j: number) => lattice[(((j % ny) + ny) % ny) * nx + Math.min(i, nx - 1)]!;
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / cellX;
    const fy = y / cellY;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = s(fx - i);
    const v = s(fy - j);
    const a = at(i, j) * (1 - u) + at(i + 1, j) * u;
    const b = at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u;
    return a * (1 - v) + b * v;
  };
}

function soil(side: Side, seed: string): Image {
  const p = PAL[side];
  const r = rng(`soil:${side}:${seed}`);
  const big = noise(r, 6, 10);
  const small = noise(r, 3, 5);
  const img = new Image(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // Patches are areas of denser speckle, not solid shapes, so their edges dissolve and a
      // patch cut off at the strip's side never shows a straight line against the next wall.
      const v = big(x, y) * 0.7 + small(x, y) * 0.3;
      const speck = r();
      let c = p.soil;
      if (v > 0.6 && speck < Math.min(0.45, (v - 0.6) * 3)) c = p.soilDark;
      else if (v < 0.34 && speck < Math.min(0.22, (0.34 - v) * 2)) c = p.soilLight;
      img.set(x, y, c);
    }
  }
  // Grain: single specks and short horizontal dashes, never on a beat, away from the edge columns.
  const specks = 5 + Math.floor(r() * 4);
  for (let k = 0; k < specks; k++) {
    const x = 2 + Math.floor(r() * (W - 4));
    const y = Math.floor(r() * H);
    const c = r() < 0.4 ? p.grain : p.soilLight;
    img.set(x, y, c);
    if (r() < 0.35 && x + 1 <= W - 3) img.set(x + 1, y, c);
  }
  return img;
}

// ---------------------------------------------------------------------------
// Rocks

interface RockSpec {
  /** Bounding box size in pixels. */
  readonly w: number;
  readonly h: number;
  /** Which part sinks into the dirt, if any, and how much of the rock is hidden (0..0.5). */
  readonly buried: 'none' | 'bottom' | 'left' | 'right';
  readonly hidden: number;
}

/**
 * An irregular, angular polygon in a w x h box: 5 to 7 corners for small and
 * medium rocks; big fragments get 4 to 6 corners with very uneven radii, so
 * they read as broken slabs rather than ovals.
 */
function polygon(r: () => number, w: number, h: number): [number, number][] {
  const big = w >= 8;
  const n = big ? 4 + Math.floor(r() * 3) : 5 + Math.floor(r() * 3);
  const start = r() * Math.PI * 2;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2 + (r() - 0.5) * (Math.PI / n) * (big ? 1.4 : 1);
    const k = big ? 0.62 + r() * 0.38 : 0.8 + r() * 0.2;
    pts.push([w / 2 + Math.cos(a) * (w / 2) * k, h / 2 + Math.sin(a) * (h / 2) * k]);
  }
  return pts;
}

function inside(px: number, py: number, pts: readonly [number, number][]): boolean {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Paint one rock with its top-left corner at (ox, oy); rows wrap. */
function paintRock(img: Image, side: Side, r: () => number, spec: RockSpec, ox: number, oy: number): void {
  const p = PAL[side];
  const { w, h } = spec;
  const pts = polygon(r, w, h);
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && inside(x + 0.5, y + 0.5, pts);
  // Burial: pixels past the cut stay dirt; the cut itself gets no outline.
  const cut = (x: number, y: number) =>
    spec.buried === 'bottom' ? y >= Math.round(h * (1 - spec.hidden)) : spec.buried === 'left' ? x < Math.round(w * spec.hidden) : spec.buried === 'right' ? x >= Math.round(w * (1 - spec.hidden)) : false;
  const solid = (x: number, y: number) => filled(x, y) && !cut(x, y);
  // A facet line through the rock: the upper-left part catches the light.
  const ang = -Math.PI / 4 + (r() - 0.5) * 1.2;
  const fx = Math.cos(ang);
  const fy = Math.sin(ang);
  const small = w <= 3 && h <= 3;
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y)) continue;
      cells.push({ x, y });
      // An edge pixel is outlined unless the neighbour beyond it is buried (rock continues under the dirt).
      const exposedEdge = [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ].some(([dx, dy]) => !filled(x + dx!, y + dy!));
      const buriedEdge = [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ].some(([dx, dy]) => filled(x + dx!, y + dy!) && cut(x + dx!, y + dy!));
      const lit = (x + 0.5 - w / 2) * fy - (y + 0.5 - h / 2) * fx < 0;
      const topLeft = !filled(x, y - 1) || !filled(x - 1, y);
      const bottomRight = !filled(x, y + 1) || !filled(x + 1, y);
      let c: RGBA;
      if (small) c = bottomRight ? p.outline : topLeft ? p.light : p.mid;
      // The shadow side (lower right) is outlined; the lit side mostly gets a highlight, sometimes an outline, so rocks are not fully ringed.
      else if (exposedEdge && bottomRight) c = p.outline;
      else if (exposedEdge && topLeft) c = r() < 0.4 ? p.outline : lit ? p.light : p.shade;
      else if (buriedEdge) c = p.shade;
      else if (lit) c = topLeft || (!filled(x, y - 2) && r() < 0.5) ? p.light : p.mid;
      else c = p.shade;
      img.set(ox + x, wrapY(oy + y), c);
    }
  }
  // A crack across bigger rocks: a short stepped line, horizontal or vertical runs only.
  if (w >= 7 && h >= 7 && r() < 0.6 && cells.length) {
    let { x, y } = cells[Math.floor(cells.length / 2)]!;
    const steps = 2 + Math.floor(r() * 3);
    for (let s = 0; s < steps && solid(x, y); s++) {
      img.set(ox + x, wrapY(oy + y), p.outline);
      if (r() < 0.5) x += r() < 0.5 ? 1 : -1;
      else y += 1;
    }
  }
  // Dirt crumbs on the buried edge, so the rock sinks into the soil.
  if (spec.buried !== 'none') {
    for (const { x, y } of cells) {
      const nearCut = [
        [0, 1],
        [1, 0],
        [-1, 0],
      ].some(([dx, dy]) => filled(x + dx!, y + dy!) && cut(x + dx!, y + dy!));
      if (nearCut && r() < 0.3) img.set(ox + x, wrapY(oy + y), p.grain);
    }
  }
}

/** One rock texture: rocks placed with spacing, no vertical stacking, clear of columns 0 and 15. */
function rocks(side: Side, seed: string, plan: readonly { readonly size: [number, number, number, number]; readonly count: number; readonly bury: number }[]): Image {
  const r = rng(`rocks:${side}:${seed}`);
  const img = new Image(W, H);
  const placed: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const clash = (a: { x0: number; x1: number; y0: number; y1: number }, b: typeof a, gap: number) => {
    if (a.x1 + gap < b.x0 || b.x1 + gap < a.x0) return false;
    for (const off of [-H, 0, H]) if (!(a.y1 + gap < b.y0 + off || b.y1 + off + gap < a.y0)) return true;
    return false;
  };
  for (const group of plan) {
    for (let k = 0; k < group.count; k++) {
      const [wMin, wMax, hMin, hMax] = group.size;
      for (let tries = 0; tries < 400; tries++) {
        const w = wMin + Math.floor(r() * (wMax - wMin + 1));
        const h = hMin + Math.floor(r() * (hMax - hMin + 1));
        const x0 = 2 + Math.floor(r() * (W - 4 - w + 1));
        const y0 = Math.floor(r() * H);
        const box = { x0, x1: x0 + w - 1, y0, y1: y0 + h - 1 };
        if (placed.some((b) => clash(box, b, 3))) continue;
        // No vertical stacks: another rock in the same columns must be well above or below.
        if (placed.some((b) => !(box.x1 < b.x0 - 1 || b.x1 < box.x0 - 1) && clash({ ...box, x0: 0, x1: W }, { ...b, x0: 0, x1: W }, 14)) && r() < 0.85) continue;
        placed.push(box);
        const roll = r();
        const buried = roll < group.bury ? (r() < 0.6 ? 'bottom' : r() < 0.5 ? 'left' : 'right') : 'none';
        paintRock(img, side, r, { w, h, buried, hidden: 0.2 + r() * 0.2 }, x0, y0);
        break;
      }
    }
  }
  return img;
}

// Small stones, medium rocks and large fragments: [min w, max w, min h, max h].
const SMALL: [number, number, number, number] = [2, 3, 2, 3];
const PEBBLE: [number, number, number, number] = [4, 5, 3, 5];
const MEDIUM: [number, number, number, number] = [7, 10, 6, 9];
const LARGE: [number, number, number, number] = [11, 13, 15, 22];

const TEXTURES: Record<string, readonly { size: [number, number, number, number]; count: number; bury: number }[]> = {
  'sparse-1': [
    { size: MEDIUM, count: 1, bury: 0.5 },
    { size: PEBBLE, count: 2, bury: 0.4 },
    { size: SMALL, count: 1, bury: 0 },
  ],
  'sparse-2': [
    { size: [8, 11, 7, 10], count: 1, bury: 0.7 },
    { size: PEBBLE, count: 1, bury: 0.3 },
    { size: SMALL, count: 1, bury: 0 },
  ],
  'sparse-3': [
    { size: MEDIUM, count: 1, bury: 0.4 },
    { size: PEBBLE, count: 2, bury: 0.4 },
    { size: SMALL, count: 1, bury: 0 },
  ],
  'moderate-1': [
    { size: MEDIUM, count: 4, bury: 0.5 },
    { size: PEBBLE, count: 2, bury: 0.3 },
    { size: SMALL, count: 1, bury: 0 },
  ],
  'moderate-2': [
    { size: [9, 12, 9, 13], count: 1, bury: 0.6 },
    { size: MEDIUM, count: 3, bury: 0.4 },
    { size: PEBBLE, count: 1, bury: 0.3 },
    { size: SMALL, count: 1, bury: 0 },
  ],
  'large-1': [
    { size: LARGE, count: 2, bury: 0.5 },
    { size: MEDIUM, count: 1, bury: 0.5 },
    { size: SMALL, count: 1, bury: 0 },
  ],
};

mkdirSync(OUT, { recursive: true });
for (const side of ['left', 'right'] as const) {
  for (const n of [1, 2]) writeFileSync(join(OUT, `wall-earth-soil-${n}-${side}.png`), encodePng(soil(side, `v3-${n}`)));
  for (const [name, plan] of Object.entries(TEXTURES)) writeFileSync(join(OUT, `wall-earth-rocks-${name}-${side}.png`), encodePng(rocks(side, `v3-${name}`, plan)));
}
console.log('Wrote the B1B V3 soil and rock textures to art/drawn/ (overhangs unchanged).');
