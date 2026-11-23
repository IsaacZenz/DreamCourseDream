/**
 * Style lab (art pipeline, owner request 2026-11-23): renders the same few items
 * in several styles, so the owner can choose the style settings for STYLE.md.
 *
 * Each item is described once as simple 3D-ish shapes (domes, tubes, facets). A
 * style is a set of settings: how many shades, outline kind, rim light, shine,
 * dithering, eye style, blush, ground texture. Nothing here goes into the game.
 *
 * Run with: npm run art:styles             (the first six styles, A to F)
 *           npm run art:styles -- blend    (owner, 2026-11-23: B shapes with a little of C's light)
 * Writes art/previews/style-lab-<set>-items.png and -scenes.png.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest } from '../src/render/manifest.ts';
import { blitScaled, drawText, fillRect, loadFont } from './art/draw.ts';
import { loadArt } from './art/press.ts';
import { Image, encodePng, type RGBA } from './png.ts';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const art = loadArt(ROOT);
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/manifest.json'), 'utf8')) as Manifest;
const font = loadFont(ROOT, manifest);
const col = (ramp: string, shade: number): RGBA => art.ramps[ramp]![shade]!;

// ---------------------------------------------------------------------------
// Styles

export interface Style {
  readonly name: string;
  readonly note: string;
  /** Ramp shades used, dark to light. */
  readonly levels: readonly number[];
  /** Above 1 darkens the shadows (more drama). */
  readonly contrast: number;
  readonly outline: 'none' | 'own' | 'selective' | 'ink';
  /** Dark lines where one part overlaps another (head over body). */
  readonly innerLines: boolean;
  /** A cool light along the right-hand edges. */
  readonly rim: { readonly ramp: string; readonly shade: number } | null;
  /** A near-white shine on glossy parts. */
  readonly shine: boolean;
  /** Checker-mix pixels where two shades meet. */
  readonly dither: boolean;
  readonly eyes: 'dot' | 'big';
  readonly blush: boolean;
  readonly grass: 'checker' | 'flat' | 'soft' | 'textured';
  readonly shadow: 'none' | 'solid' | 'dither';
  /** Sprite size compared with today's placeholders. */
  readonly scale: number;
}

const FIRST: Style[] = [
  { name: 'A NOW', note: 'TODAY: 4 SHADES, OWN OUTLINE', levels: [1, 2, 3, 4], contrast: 1, outline: 'own', innerLines: false, rim: null, shine: false, dither: false, eyes: 'dot', blush: false, grass: 'checker', shadow: 'none', scale: 1 },
  { name: 'B SOFT', note: 'ROUND, 3 BRIGHT SHADES, BIG EYES', levels: [2, 3, 4], contrast: 0.8, outline: 'ink', innerLines: true, rim: null, shine: true, dither: false, eyes: 'big', blush: true, grass: 'flat', shadow: 'solid', scale: 1 },
  { name: 'C GLOW', note: '5 SHADES, SOFT OUTLINE, COOL RIM', levels: [0, 1, 2, 3, 4], contrast: 1, outline: 'selective', innerLines: false, rim: { ramp: 'blue', shade: 4 }, shine: true, dither: false, eyes: 'dot', blush: false, grass: 'textured', shadow: 'dither', scale: 1 },
  { name: 'D PAINT', note: 'NO OUTLINE, DITHER, DEEP SHADOW', levels: [0, 1, 2, 3, 4], contrast: 1.5, outline: 'none', innerLines: false, rim: { ramp: 'gold', shade: 4 }, shine: false, dither: true, eyes: 'dot', blush: false, grass: 'textured', shadow: 'dither', scale: 1 },
  { name: 'E MIX', note: 'B SHAPES + C LIGHT', levels: [1, 2, 3, 4], contrast: 1.1, outline: 'selective', innerLines: true, rim: { ramp: 'blue', shade: 4 }, shine: true, dither: false, eyes: 'big', blush: true, grass: 'textured', shadow: 'dither', scale: 1 },
  { name: 'F MIX BIG', note: 'E AT 1.5X SIZE', levels: [0, 1, 2, 3, 4], contrast: 1.1, outline: 'selective', innerLines: true, rim: { ramp: 'blue', shade: 4 }, shine: true, dither: true, eyes: 'big', blush: true, grass: 'textured', shadow: 'dither', scale: 1.5 },
];

// Owner, 2026-11-23: "B shapes with C light, a little more like B and less like C".
// Steps from pure B towards E, adding one piece of C's lighting at a time.
const B = FIRST[1]!;
const BLEND: Style[] = [
  { ...B, name: 'B', note: 'SOFT, AS BEFORE' },
  { ...B, name: 'B1', note: 'B + COOL RIM LIGHT', rim: { ramp: 'blue', shade: 4 } },
  { ...B, name: 'B2', note: 'B1 + SOFT GRASS, SOFT SHADOW', rim: { ramp: 'blue', shade: 4 }, grass: 'soft', shadow: 'dither' },
  { ...B, name: 'B3', note: 'B2 + A 4TH, DARKER SHADE', levels: [1, 2, 3, 4], contrast: 0.9, rim: { ramp: 'blue', shade: 4 }, grass: 'soft', shadow: 'dither' },
  { ...B, name: 'B4', note: 'B3 + SOFTER OUTLINE ON THE LIT SIDE', levels: [1, 2, 3, 4], contrast: 0.9, outline: 'selective', rim: { ramp: 'blue', shade: 4 }, grass: 'soft', shadow: 'dither' },
  { ...FIRST[4]!, name: 'E', note: 'MIX FROM LAST TIME, FOR COMPARISON' },
];
const SETS: Record<string, Style[]> = { first: FIRST, blend: BLEND };
const SET = process.argv[2] ?? 'first';
const STYLES = SETS[SET] ?? FIRST;

// ---------------------------------------------------------------------------
// Shapes, in placeholder-sized pixel units

type V3 = readonly [number, number, number];
interface PartBase {
  readonly ramp: string;
  /** Fixed shade: not lit (eyes, blush). */
  readonly flat?: number;
  readonly bias?: number;
  readonly line?: boolean;
  readonly gloss?: boolean;
  readonly pattern?: 'bands' | 'cross';
}
type Part =
  | (PartBase & { readonly kind: 'dome'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number })
  | (PartBase & { readonly kind: 'tube'; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly r: number })
  | (PartBase & { readonly kind: 'facet'; readonly pts: ReadonlyArray<readonly [number, number]>; readonly n?: V3 });

interface Item {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  /** Shadow on the ground: centre x, y and half-width. */
  readonly ground: readonly [number, number, number];
  readonly parts: (st: Style) => Part[];
}

const dome = (cx: number, cy: number, rx: number, ry: number, ramp: string, o: Partial<PartBase> = {}): Part => ({ kind: 'dome', cx, cy, rx, ry, ramp, ...o });
const tube = (x0: number, y0: number, x1: number, y1: number, r: number, ramp: string, o: Partial<PartBase> = {}): Part => ({ kind: 'tube', x0, y0, x1, y1, r, ramp, ...o });
const facet = (pts: Array<[number, number]>, ramp: string, n?: V3, o: Partial<PartBase> = {}): Part => (n ? { kind: 'facet', pts, ramp, n, ...o } : { kind: 'facet', pts, ramp, ...o });

/** An open eye: a dot, or a tall oval with a shine. */
function eye(st: Style, x: number, y: number): Part[] {
  if (st.eyes === 'dot') return [dome(x, y, 0.75, 0.9, 'grey', { flat: 0 })];
  return [dome(x, y, 0.95, 1.45, 'grey', { flat: 0 }), dome(x - 0.25, y - 0.55, 0.45, 0.45, 'grey', { flat: 4 })];
}

const ITEMS: Item[] = [
  {
    name: 'ROLLO',
    w: 16,
    h: 20,
    ground: [8, 19, 5.5],
    parts: (st) => [
      tube(4, 15, 1.6, 17.6, 1.1, 'grey'),
      tube(6, 15, 6, 18.6, 1.3, 'tan'),
      dome(8, 12, 5.2, 5.6, 'grey', { pattern: 'bands', gloss: true }),
      dome(10.3, 13, 2.6, 3.8, 'tan', { line: true }),
      tube(10, 15.5, 10.4, 18.6, 1.3, 'tan', { line: true }),
      tube(12, 11.5, 13.6, 13.2, 0.9, 'tan', { line: true }),
      dome(10.8, 6.8, 3.6, 3.1, 'tan', { line: true, gloss: true }),
      dome(9.8, 4.6, 2.6, 1.6, 'grey', { line: true }),
      dome(8.7, 3.4, 1.0, 1.7, 'tan', { line: true }),
      dome(14.2, 8, 1.6, 1.2, 'pink', { line: true }),
      ...eye(st, 12, 6.6),
      ...(st.blush ? [dome(12.4, 8.6, 0.9, 0.5, 'pink', { flat: 3 })] : []),
    ],
  },
  {
    name: 'GRUB',
    w: 18,
    h: 16,
    ground: [9, 14.5, 7.5],
    parts: (st) => [
      ...[5, 9, 13, 16].map((x) => tube(x, 13, x, 14.4, 0.6, 'brown')),
      dome(14.8, 10.6, 2.4, 2.7, 'green', { line: true }),
      dome(12, 9.3, 3.4, 4.2, 'green', { line: true, gloss: true }),
      dome(8.5, 9.2, 3.7, 4.6, 'green', { line: true, gloss: true }),
      dome(4.8, 10.6, 3.4, 3.3, 'green', { line: true, gloss: true }),
      tube(3.1, 10.3, 4.9, 10.6, st.eyes === 'big' ? 0.55 : 0.45, 'grey', { flat: 0 }),
      ...(st.blush ? [dome(5, 12.1, 1.0, 0.55, 'pink', { flat: 3 })] : []),
    ],
  },
  {
    name: 'STAR',
    w: 13,
    h: 13,
    ground: [6.5, 12.6, 3.5],
    parts: () => {
      const pts: Array<[number, number]> = [];
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const r = k % 2 ? 2.7 : 6.1;
        pts.push([6.5 + Math.cos(a) * r, 6.6 + Math.sin(a) * r]);
      }
      return [facet(pts, 'gold', undefined, { gloss: true })];
    },
  },
  {
    name: 'ACORN',
    w: 12,
    h: 13,
    ground: [6, 12.6, 3.5],
    parts: () => [dome(6, 8.3, 4.2, 4.3, 'orange', { gloss: true }), dome(6, 4.6, 5.2, 2.9, 'brown', { pattern: 'cross', line: true }), tube(6.3, 2, 7.6, 0.6, 0.6, 'brown', { line: true })],
  },
  {
    name: 'ROCK',
    w: 20,
    h: 14,
    ground: [10, 12.8, 9],
    parts: () => [
      facet([[1, 11], [3, 5], [8, 2], [9, 8], [6, 13]], 'grey', [-0.75, -0.2, 0.62]),
      facet([[8, 2], [14, 1.6], [19, 7], [16, 9], [9, 8]], 'grey', [0.1, -0.85, 0.5]),
      facet([[9, 8], [16, 9], [19, 7], [18.6, 11], [14, 13.4], [6, 13]], 'grey', [0.55, 0.45, 0.7]),
      dome(10.5, 3.6, 3.6, 1.6, 'green', { pattern: 'cross' }),
    ],
  },
];

// ---------------------------------------------------------------------------
// Renderer

const L: V3 = (() => {
  const v = [-0.55, -0.7, 0.75];
  const m = Math.hypot(...v);
  return [v[0]! / m, v[1]! / m, v[2]! / m];
})();

function hash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function inPoly(x: number, y: number, pts: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function hit(p: Part, x: number, y: number): V3 | null {
  if (p.kind === 'dome') {
    const dx = (x - p.cx) / p.rx;
    const dy = (y - p.cy) / p.ry;
    const d = dx * dx + dy * dy;
    return d <= 1 ? [dx, dy, Math.sqrt(1 - d)] : null;
  }
  if (p.kind === 'tube') {
    const vx = p.x1 - p.x0;
    const vy = p.y1 - p.y0;
    const t = Math.max(0, Math.min(1, ((x - p.x0) * vx + (y - p.y0) * vy) / (vx * vx + vy * vy || 1)));
    const dx = (x - (p.x0 + vx * t)) / p.r;
    const dy = (y - (p.y0 + vy * t)) / p.r;
    const d = dx * dx + dy * dy;
    return d <= 1 ? [dx, dy, Math.sqrt(1 - d)] : null;
  }
  if (!inPoly(x, y, p.pts)) return null;
  if (p.n) return p.n;
  // No fixed normal: a raised point in the middle (a bevelled star).
  const cx = p.pts.reduce((s, q) => s + q[0], 0) / p.pts.length;
  const cy = p.pts.reduce((s, q) => s + q[1], 0) / p.pts.length;
  const ax = x - cx;
  const ay = y - cy;
  const ang = Math.atan2(ay, ax);
  const sector = Math.round(ang / (Math.PI / 5)) * (Math.PI / 5);
  return [Math.cos(sector) * 0.6, Math.sin(sector) * 0.6, 0.8];
}

interface Px {
  part: number;
  n: V3;
  i: number;
}

/** Render one item in one style, with a margin for the outline. */
function render(item: Item, st: Style): Image {
  const s = st.scale;
  const W = Math.round(item.w * s) + 2;
  const H = Math.round(item.h * s) + 2;
  const parts = item.parts(st);
  const grid: Array<Px | null> = new Array(W * H).fill(null);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const bx = (x - 1 + 0.5) / s;
      const by = (y - 1 + 0.5) / s;
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k]!;
        const n = hit(p, bx, by);
        if (!n) continue;
        let i = Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
        i = Math.pow(i, st.contrast) + (p.bias ?? 0);
        if (p.pattern === 'bands' && Math.floor(bx * 0.9 + by * 0.25) % 3 === 0) i -= 0.3;
        if (p.pattern === 'cross' && (Math.floor(bx + by) % 3 === 0 || Math.floor(bx - by + 40) % 3 === 0)) i -= 0.25;
        grid[y * W + x] = { part: k, n, i };
        break;
      }
    }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? null : grid[y * W + x]!);
  const img = new Image(W, H);
  const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const px = at(x, y);
      if (px) {
        const p = parts[px.part]!;
        if (p.flat !== undefined) {
          img.set(x, y, col(p.ramp, p.flat));
          continue;
        }
        const lv = st.levels;
        let f = Math.max(0, Math.min(0.999, px.i)) * lv.length;
        if (st.dither && p.kind !== 'facet') {
          const frac = f - Math.floor(f);
          if (frac < 0.22 && Math.floor(f) > 0 && (x + y) % 2 === 0) f -= 1;
        }
        let shade = lv[Math.floor(f)]!;
        let c = col(p.ramp, shade);
        const edge = N4.some(([dx, dy]) => !at(x + dx, y + dy));
        if (st.rim && edge && px.n[0] > 0.6 && px.n[1] < 0.3 && p.kind !== 'tube' && p.ramp !== 'pink') c = col(st.rim.ramp, st.rim.shade);
        if (st.shine && p.gloss && px.i > 0.97) c = col('grey', 4);
        if (st.innerLines && p.line) {
          const behind = N4.some(([dx, dy]) => {
            const q = at(x + dx, y + dy);
            return q !== null && q.part < px.part && parts[q.part]!.flat === undefined;
          });
          if (behind) {
            shade = st.outline === 'ink' ? 0 : Math.max(0, lv[0]! - 0);
            c = col(st.outline === 'ink' ? 'grey' : p.ramp, st.outline === 'ink' ? 1 : shade);
          }
        }
        img.set(x, y, c);
      } else if (st.outline !== 'none') {
        const ns = N4.map(([dx, dy]) => at(x + dx, y + dy)).filter((q): q is Px => q !== null);
        if (!ns.length) continue;
        const q = ns.reduce((a, b) => (b.part > a.part ? b : a));
        const p = parts[q.part]!;
        if (st.outline === 'ink') img.set(x, y, col('grey', 0));
        else if (st.outline === 'own') img.set(x, y, col(p.ramp, 0));
        else img.set(x, y, col(p.ramp, q.i > 0.55 ? 2 : q.i > 0.3 ? 1 : 0));
      }
    }
  return img;
}

/** A patch of ground in the style's grass look, with the item's shadow. */
function ground(w: number, h: number, st: Style, ox = 0, oy = 0): Image {
  const img = new Image(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const gx = x + ox;
      const gy = y + oy;
      let c = col('green', 3);
      if (st.grass === 'checker') c = (Math.floor((gx + gy * 2) / 16) + Math.floor((gx - gy * 2 + 400) / 16)) % 2 ? col('green', 3) : col('green', 2);
      else if (st.grass === 'textured') {
        // Soft patches of darker grass and a few blades: texture without noise.
        const n = hash(Math.floor((gx + gy * 2) / 10), Math.floor((gx - gy * 2 + 400) / 10), 3);
        c = n < 0.3 && (gx + gy) % 2 === 0 ? col('green', 2) : col('green', 3);
        if (hash(gx, gy, 5) < 0.018) c = col('green', 4);
        else if (hash(gx, gy - 1, 5) < 0.018) c = col('green', 2);
      } else if (st.grass === 'soft') {
        // Plain grass with a few large, gentle patches and rare blades.
        const n = hash(Math.floor((gx + gy * 2) / 14), Math.floor((gx - gy * 2 + 400) / 14), 3);
        if (n < 0.22 && (gx + gy) % 2 === 0) c = col('green', 2);
        if (hash(gx, gy, 5) < 0.01) c = col('green', 4);
      } else if (hash(gx, gy, 9) < 0.02) c = col('green', 4);
      img.set(x, y, c);
    }
  return img;
}

function shadowOn(img: Image, item: Item, st: Style, x0: number, y0: number): void {
  if (st.shadow === 'none') return;
  const s = st.scale;
  const [gx, gy, gr] = item.ground;
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const dx = (x - x0 - 1 - gx * s) / (gr * s);
      const dy = (y - y0 - 1 - gy * s) / (gr * s * 0.38);
      if (dx * dx + dy * dy > 1) continue;
      if (st.shadow === 'dither' && dx * dx + dy * dy > 0.5 && (x + y) % 2) continue;
      img.set(x, y, col('green', 1));
    }
}

// ---------------------------------------------------------------------------
// Sheet 1: every item in every style, enlarged

const BG: RGBA = [32, 32, 44, 255];
const TEXT: RGBA = [240, 232, 200, 255];
const DIM: RGBA = [150, 146, 170, 255];
const ZOOM = 4;
const CELL = 34;
const left = 70;
const top = 44;
const cellPx = CELL * ZOOM;
const sheet = new Image(left + STYLES.length * (cellPx + 8) + 4, top + ITEMS.length * (cellPx + 8) + 4);
fillRect(sheet, 0, 0, sheet.width, sheet.height, BG);
STYLES.forEach((st, c) => {
  drawText(sheet, font, left + c * (cellPx + 8), 6, st.name, 2, TEXT);
  const words = st.note.split(' ');
  let line = '';
  let ly = 24;
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 22) {
      drawText(sheet, font, left + c * (cellPx + 8), ly, line.trim(), 1, DIM);
      line = '';
      ly += 8;
    }
    line += ' ' + w;
  }
  drawText(sheet, font, left + c * (cellPx + 8), ly, line.trim(), 1, DIM);
});
ITEMS.forEach((item, r) => {
  drawText(sheet, font, 6, top + r * (cellPx + 8) + cellPx / 2 - 6, item.name, 2, TEXT);
  STYLES.forEach((st, c) => {
    const pic = render(item, st);
    const g = ground(CELL, CELL, st);
    const ox = Math.floor((CELL - pic.width) / 2);
    const oy = Math.floor((CELL - pic.height) / 2) + 2;
    shadowOn(g, item, st, ox, oy);
    g.blit(pic, ox, oy);
    blitScaled(sheet, g, left + c * (cellPx + 8), top + r * (cellPx + 8), ZOOM);
  });
});

// Sheet 2: each style as a little scene at about game size (3x)

const SW = 150;
const SH = 80;
const SZ = 3;
const scenes = new Image(2 * (SW * SZ + 12) + 12, 3 * (SH * SZ + 30) + 12);
fillRect(scenes, 0, 0, scenes.width, scenes.height, BG);
const spots: Array<[number, number]> = [[32, 12], [70, 42], [118, 10], [122, 46], [4, 50]];
const order = [3, 0, 2, 1, 4]; // acorn, rollo, star, grub, rock: back to front by y
STYLES.forEach((st, k) => {
  const x0 = 12 + (k % 2) * (SW * SZ + 12);
  const y0 = 12 + Math.floor(k / 2) * (SH * SZ + 30);
  drawText(scenes, font, x0, y0, `${st.name}: ${st.note}`, 2, TEXT);
  const g = ground(SW, SH, st);
  const placed = order.map((i) => ({ item: ITEMS[i]!, pos: spots[i]! })).sort((a, b) => a.pos[1] + a.item.h - (b.pos[1] + b.item.h));
  for (const { item, pos } of placed) shadowOn(g, item, st, pos[0], pos[1]);
  for (const { item, pos } of placed) g.blit(render(item, st), pos[0], pos[1]);
  blitScaled(scenes, g, x0, y0 + 18, SZ);
});

mkdirSync(join(ROOT, 'art/previews'), { recursive: true });
writeFileSync(join(ROOT, `art/previews/style-lab-${SET}-items.png`), encodePng(sheet));
writeFileSync(join(ROOT, `art/previews/style-lab-${SET}-scenes.png`), encodePng(scenes));
console.log(`Wrote art/previews/style-lab-${SET}-items.png and -scenes.png`);
