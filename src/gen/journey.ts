/**
 * The journey generator's ground (Milestone 5b design sheet, section 5): one
 * solid landmass the hero crosses, area by area, from the start to the exit.
 *
 * 1. Areas are laid out as a trail. Each area is a rectangle of ground with a
 *    landform (a tilted field, hills, a basin, terraces...). Between two areas
 *    is a passage: a ramp, a drop, a causeway, a gap or a step up.
 * 2. Each area's ground is a smooth surface of corner heights, "settled" so
 *    every tile is a legal shape (corners only ever lowered, never raised).
 * 3. Set pieces (ponds, spike pits, sand, arrow runs) are stamped in.
 * 4. Edges facing nothing get a rail, a low rim, or are left bare.
 *
 * Deterministic: everything random comes from the Rng passed in.
 */
import { GEN } from '../content/gen.ts';
import { LANDFORMS, PASSAGES, SET_PIECES, type LandformDef, type PassageDef } from '../content/landforms.ts';
import { DIRECTION_VECTORS, DIRECTIONS, SURFACES, type Direction } from '../content/surfaces.ts';
import { MAX_HEIGHT } from '../sim/course.ts';
import type { Rng } from '../sim/rng.ts';
import { shapeOf, type Corners } from '../sim/tileShape.ts';

export type Point = readonly [number, number];

export interface TileSpec {
  surface: string;
  corners: Corners;
  dir?: Direction;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One piece of the board: an area, a passage or a side pocket. */
export interface Region {
  readonly kind: 'area' | 'passage' | 'pocket';
  rect: Rect;
  /** Area: landform id. Passage: passage id. Pocket: "pocket". */
  readonly name: string;
  /** Position along the trail (0 = the first area); passages and pockets take their area's number. */
  readonly order: number;
  readonly steep: boolean;
}

export interface Terrain {
  readonly width: number;
  readonly height: number;
  readonly tiles: (TileSpec | null)[];
  /** Region index of every tile (-1 off the board). */
  readonly region: Int16Array;
  readonly regions: readonly Region[];
  readonly start: Point;
  readonly exit: Point;
  readonly rails: Point[][];
  /** Tiles where nothing may be placed: start, exit, set pieces, rails, passages, rims. */
  readonly reserved: Set<string>;
  /** Island centres of ponds and spike pits: good enemy spots. */
  readonly islands: Point[];
  /** Points along the trail, start to exit, for the bot. */
  readonly waypoints: Point[];
  readonly terrainCost: number;
  readonly bareCost: number;
  readonly setPieces: string[];
}

export type TerrainResult = { ok: true; terrain: Terrain } | { ok: false; reason: string };

const key = (x: number, y: number) => `${x},${y}`;
const LEFT: Record<Direction, Direction> = { ne: 'nw', nw: 'sw', sw: 'se', se: 'ne' };
const RIGHT: Record<Direction, Direction> = { ne: 'se', se: 'sw', sw: 'nw', nw: 'ne' };

function weighted<T extends { weight: number }>(rng: Rng, items: readonly T[]): T | null {
  const total = items.reduce((n, i) => n + i.weight, 0);
  if (total <= 0) return null;
  let r = rng.float(0, total);
  for (const i of items) if ((r -= i.weight) < 0) return i;
  return items[items.length - 1] ?? null;
}

export function journeyRow(budget: number) {
  return GEN.journey.find((r) => budget < r.under) ?? GEN.journey[GEN.journey.length - 1]!;
}

/**
 * How big a journey is, apart from how much is in it (owner, 2026-11-17: size
 * and difficulty scale separately; Milestone 7 sheet section 7.4). The run
 * sets this per region; without it, it follows the budget as in Milestone 5b.
 */
export type { JourneySize } from '../content/gen.ts';

import type { JourneySize } from '../content/gen.ts';

export function sizeForBudget(budget: number): JourneySize {
  const row = journeyRow(budget);
  return { areas: row.areas, areaSize: GEN.areaSize, maxEnemies: GEN.maxEnemies, botShots: row.botShots };
}

// ---------------------------------------------------------------------------
// Corner-height grids

/** Corner heights over a w x h tile rectangle: (w + 1) x (h + 1) values. */
class Grid {
  readonly v: number[];
  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number, fn: (x: number, y: number) => number) {
    this.w = w;
    this.h = h;
    this.v = [];
    for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) this.v.push(Math.round(fn(i, j)));
  }
  at(i: number, j: number): number {
    return this.v[j * (this.w + 1) + i]!;
  }
  set(i: number, j: number, h: number): void {
    this.v[j * (this.w + 1) + i] = h;
  }
  /**
   * Make every tile a legal gentle shape, only ever lowering corners:
   * neighbouring corners (also diagonally) differ by at most one step, and
   * no tile is a saddle (opposite corners raised).
   */
  settle(): void {
    for (let guard = 0; guard < 200; guard++) {
      let changed = false;
      for (let j = 0; j <= this.h; j++) {
        for (let i = 0; i <= this.w; i++) {
          let m = Infinity;
          for (let dj = -1; dj <= 1; dj++) {
            for (let di = -1; di <= 1; di++) {
              const a = i + di;
              const b = j + dj;
              if ((di || dj) && a >= 0 && b >= 0 && a <= this.w && b <= this.h) m = Math.min(m, this.at(a, b));
            }
          }
          if (this.at(i, j) > m + 1) {
            this.set(i, j, m + 1);
            changed = true;
          }
        }
      }
      for (let j = 0; j < this.h; j++) {
        for (let i = 0; i < this.w; i++) {
          const nw = this.at(i, j);
          const ne = this.at(i + 1, j);
          const se = this.at(i + 1, j + 1);
          const sw = this.at(i, j + 1);
          if (nw === se && ne === sw && nw !== ne) {
            const low = Math.min(nw, ne);
            this.set(i, j, low);
            this.set(i + 1, j, low);
            this.set(i + 1, j + 1, low);
            this.set(i, j + 1, low);
            changed = true;
          }
        }
      }
      if (!changed) return;
    }
  }
  corners(i: number, j: number): [number, number, number, number] {
    return [this.at(i, j), this.at(i + 1, j), this.at(i + 1, j + 1), this.at(i, j + 1)];
  }
}

/** A part of an area with its own ground: where it meets another zone at a different height there is a cliff. */
interface Zone {
  rect: Rect;
  grid: Grid;
}

// ---------------------------------------------------------------------------
// Landforms

interface Pad {
  x: number;
  y: number;
}

/**
 * The ground of one area, in local tile coordinates (0..w, 0..h), relative
 * heights in gentle steps. Pads (entry and exit points) are kept flat.
 */
function buildArea(rng: Rng, lf: LandformDef, w: number, h: number, entry: Pad, exit: Pad): { zones: Zone[]; pond: Rect | null } {
  const R = GEN.padRadius;
  const ax = exit.x - entry.x;
  const ay = exit.y - entry.y;
  const alen = Math.hypot(ax, ay) || 1;
  const progress = (x: number, y: number) => Math.min(1, Math.max(0, ((x - entry.x) * ax + (y - entry.y) * ay) / (alen * alen)));
  const range = (r: readonly [number, number] | undefined, d: [number, number]) => (r ? rng.int(r[0], r[1]) : rng.int(d[0], d[1]));
  // Keep pads flat: blend towards the pad's own height near each pad.
  const padded = (f: (x: number, y: number) => number) => {
    const pads = [entry, exit].map((p) => ({ ...p, h: f(p.x, p.y) }));
    return (x: number, y: number) => {
      let out = f(x, y);
      for (const p of pads) {
        const d = Math.hypot(x - p.x, y - p.y);
        const m = Math.min(1, Math.max(0, (d - R + 1) / (R + 1)));
        out = p.h + (out - p.h) * m;
      }
      return out;
    };
  };
  const whole: Rect = { x: 0, y: 0, w, h };
  const make = (f: (x: number, y: number) => number): Zone[] => {
    const g = new Grid(w, h, padded(f));
    g.settle();
    return [{ rect: whole, grid: g }];
  };
  const cx = w / 2;
  const cy = h / 2;
  switch (lf.kind) {
    case 'field': {
      const k = range(lf.tiltTilesPerStep, [2, 4]);
      const sign = rng.chance(0.5) ? 1 : -1;
      return { zones: make((x, y) => (sign * progress(x, y) * alen) / k), pond: null };
    }
    case 'rolling': {
      const n = range(lf.bumps, [2, 4]);
      const bumps = Array.from({ length: n }, () => {
        const H = range(lf.bumpHeight, [2, 4]);
        return { x: rng.float(1, w - 1), y: rng.float(1, h - 1), r: rng.float(Math.max(3, H), Math.max(4, H + 2)), h: H * (rng.chance(0.3) ? -1 : 1) };
      });
      return {
        zones: make((x, y) => bumps.reduce((s, b) => s + b.h * Math.max(0, 1 - Math.hypot(x - b.x, y - b.y) / b.r), 0)),
        pond: null,
      };
    }
    case 'basin': {
      const D = range(lf.depth, [3, 6]);
      const r = Math.min(w, h) / 2;
      return { zones: make((x, y) => -D * Math.min(1, Math.max(0, (r - Math.hypot(x - cx, y - cy)) / Math.max(D, r - 1.5)))), pond: null };
    }
    case 'ridge':
    case 'gully': {
      const H = range(lf.kind === 'ridge' ? lf.height : lf.depth, [3, 6]) * (lf.kind === 'gully' ? -1 : 1);
      // Ridge across the way through; gully along it.
      const alongX = Math.abs(ax) >= Math.abs(ay);
      const acrossTrail = lf.kind === 'ridge' ? alongX : !alongX;
      const half = Math.max(Math.abs(H), (acrossTrail ? w : h) / 2 - 1);
      return {
        zones: make((x, y) => {
          const d = acrossTrail ? Math.abs(x - cx) : Math.abs(y - cy);
          const t = Math.max(0, 1 - d / half);
          return lf.kind === 'gully' ? H * (1 - (1 - t) * (1 - t)) : H * t;
        }),
        pond: null,
      };
    }
    case 'terraces': {
      const n = range(lf.steps, [3, 5]);
      const rise = range(lf.rise, [2, 2]) * (rng.chance(0.5) ? 1 : -1);
      const alongX = Math.abs(ax) >= Math.abs(ay);
      const len = alongX ? w : h;
      const zones: Zone[] = [];
      for (let k = 0; k < n; k++) {
        const a = Math.floor((k * len) / n);
        const b = Math.floor(((k + 1) * len) / n);
        if (b <= a) continue;
        // Count the step from the entry side.
        const fromEntry = (alongX ? entry.x <= w / 2 : entry.y <= h / 2) ? k : n - 1 - k;
        const rect: Rect = alongX ? { x: a, y: 0, w: b - a, h } : { x: 0, y: a, w, h: b - a };
        const g = new Grid(rect.w, rect.h, () => fromEntry * rise);
        zones.push({ rect, grid: g });
      }
      return { zones, pond: null };
    }
    case 'plateau': {
      const base = make(() => 0);
      // A raised block in the middle, away from the pads, with a ramp up on the side facing the entry.
      const mw = Math.max(3, Math.floor(w * rng.float(0.35, 0.5)));
      const mh = Math.max(3, Math.floor(h * rng.float(0.35, 0.5)));
      const mx = Math.floor((w - mw) / 2);
      const my = Math.floor((h - mh) / 2);
      const rect: Rect = { x: mx, y: my, w: mw, h: mh };
      const tooClose = [entry, exit].some((p) => p.x > mx - R && p.x < mx + mw + R && p.y > my - R && p.y < my + mh + R);
      if (tooClose) return { zones: base, pond: null };
      const alongX = Math.abs(ax) >= Math.abs(ay);
      const H = Math.min(range(lf.height, [4, 8]), (alongX ? mw : mh) - 1);
      const fromLow = alongX ? (entry.x < cx ? 'x0' : 'x1') : entry.y < cy ? 'y0' : 'y1';
      const g = new Grid(mw, mh, (i, j) => {
        const d = fromLow === 'x0' ? i : fromLow === 'x1' ? mw - i : fromLow === 'y0' ? j : mh - j;
        return Math.min(H, d);
      });
      g.settle();
      return { zones: [...base, { rect, grid: g }], pond: null };
    }
    case 'pond': {
      const zones = make(() => 0);
      const pw = Math.min(w - 4, rng.int(4, 8));
      const ph = Math.min(h - 4, rng.int(4, 8));
      return { zones, pond: { x: Math.floor((w - pw) / 2), y: Math.floor((h - ph) / 2), w: pw, h: ph } };
    }
  }
}

// ---------------------------------------------------------------------------
// The board

interface Board {
  tiles: Map<string, TileSpec>;
  region: Map<string, number>;
  regions: Region[];
}

function overlaps(a: Rect, b: Rect, margin: number): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

function sideRange(r: Rect, side: Direction): { fixed: number; from: number; to: number; axis: 'x' | 'y' } {
  // Tiles along a side: "fixed" is the row or column; from..to the other coordinate.
  if (side === 'ne') return { fixed: r.y, from: r.x, to: r.x + r.w - 1, axis: 'x' };
  if (side === 'sw') return { fixed: r.y + r.h - 1, from: r.x, to: r.x + r.w - 1, axis: 'x' };
  if (side === 'nw') return { fixed: r.x, from: r.y, to: r.y + r.h - 1, axis: 'y' };
  return { fixed: r.x + r.w - 1, from: r.y, to: r.y + r.h - 1, axis: 'y' };
}

/** The tile on `side` of rect r at cross position c. */
function sideTile(r: Rect, side: Direction, c: number): Point {
  const s = sideRange(r, side);
  return s.axis === 'x' ? [c, s.fixed] : [s.fixed, c];
}

export function buildTerrain(rng: Rng, budget: number, size: JourneySize = sizeForBudget(budget)): TerrainResult {
  const nAreas = rng.int(size.areas[0], size.areas[1]);
  let terrainLeft = Math.floor(budget * GEN.terrainShare);
  const board: Board = { tiles: new Map(), region: new Map(), regions: [] };
  const rects: Rect[] = [];
  const ascend = rng.chance(0.5);
  const waypoints: Point[] = [];
  const reserved = new Set<string>();
  const setPieces: string[] = [];
  const islands: Point[] = [];

  let dir: Direction = rng.pick(DIRECTIONS);
  let rect: Rect = { x: 0, y: 0, w: rng.int(size.areaSize[0], size.areaSize[1]), h: rng.int(size.areaSize[0], size.areaSize[1]) };
  // Where this area is entered: a tile on its side, and the height there.
  let entryTile: Point = sideTile(rect, opposite(dir), Math.floor(sideRange(rect, opposite(dir)).from + (sideRange(rect, opposite(dir)).to - sideRange(rect, opposite(dir)).from) / 2));
  let entryHeight = 0;
  const start: Point = inward(entryTile, dir, 2);
  let exitTileFinal: Point = start;
  waypoints.push(start);

  const put = (x: number, y: number, t: TileSpec, regionIndex: number) => {
    board.tiles.set(key(x, y), t);
    board.region.set(key(x, y), regionIndex);
  };

  for (let i = 0; i < nAreas; i++) {
    const last = i === nAreas - 1;
    // Plan the way out first (direction, exit point, passage, next area), retrying if it does not fit.
    let plan: Plan | null = null;
    for (let tries = 0; tries < 8 && !plan; tries++) {
      plan = planNext(rng, budget, rect, dir, last, rects, ascend, terrainLeft, tries, size.areaSize);
    }
    if (!plan) return { ok: false, reason: 'no room for the trail' };
    const { nextDir, exitTile } = plan;
    const er = sideRange(rect, nextDir);

    const lf = weighted(rng, LANDFORMS.filter((l) => l.minBudget <= budget)) ?? LANDFORMS[0]!;
    const steep = rng.chance(lf.steepChance);
    const scale = steep ? 2 : 1;
    const local = (p: Point): Pad => ({ x: p[0] - rect.x + 0.5, y: p[1] - rect.y + 0.5 });
    const built = buildArea(rng.fork(`area${i}`), lf, rect.w, rect.h, local(entryTile), local(exitTile));
    const zoneAt = (lx: number, ly: number) => [...built.zones].reverse().find((zz) => lx >= zz.rect.x && lx < zz.rect.x + zz.rect.w && ly >= zz.rect.y && ly < zz.rect.y + zz.rect.h)!;
    const relAt = (p: Point) => {
      const lx = p[0] - rect.x;
      const ly = p[1] - rect.y;
      const z = zoneAt(lx, ly);
      return Math.min(...z.grid.corners(lx - z.rect.x, ly - z.rect.y)) * scale;
    };
    const base = entryHeight - relAt(entryTile);
    const regionIndex = board.regions.length;
    board.regions.push({ kind: 'area', rect: { ...rect }, name: lf.id, order: i, steep });
    rects.push(rect);
    for (let ly = 0; ly < rect.h; ly++) {
      for (let lx = 0; lx < rect.w; lx++) {
        const z = zoneAt(lx, ly);
        const c = z.grid.corners(lx - z.rect.x, ly - z.rect.y).map((h) => h * scale + base) as unknown as Corners;
        put(rect.x + lx, rect.y + ly, { surface: 'grass', corners: c }, regionIndex);
      }
    }
    if (built.pond) stampPond(board, rng, { x: rect.x + built.pond.x, y: rect.y + built.pond.y, w: built.pond.w, h: built.pond.h }, reserved, islands, rng.chance(0.6));
    waypoints.push([rect.x + Math.floor(rect.w / 2), rect.y + Math.floor(rect.h / 2)]);

    if (last || !plan.pass || !plan.prect || !plan.next) {
      exitTileFinal = inward(exitTile, opposite(nextDir), 2);
      break;
    }

    // The passage to the next area.
    const { pass, rise, steepRamp, prect, next, c0, width } = plan;
    const len = er.axis === 'x' ? prect.h : prect.w;
    terrainLeft -= pass.cost;
    const exitHeight = Math.min(...board.tiles.get(key(exitTile[0], exitTile[1]))!.corners);
    const [vx, vy] = DIRECTION_VECTORS[nextDir];
    if (len > 0) {
      const pIndex = board.regions.length;
      board.regions.push({ kind: 'passage', rect: { ...prect }, name: pass.id, order: i, steep: steepRamp });
      rects.push(prect);
      if (pass.id !== 'gap') {
        for (let a = 0; a < len; a++) {
          for (let b = 0; b < width; b++) {
            // a counts steps away from this area.
            const x = er.axis === 'x' ? c0 + b : nextDir === 'se' ? prect.x + a : prect.x + len - 1 - a;
            const y = er.axis === 'x' ? (nextDir === 'sw' ? prect.y + a : prect.y + len - 1 - a) : c0 + b;
            const h0 = pass.id === 'ramp' ? exitHeight + (rise * a) / len : exitHeight;
            const h1 = pass.id === 'ramp' ? exitHeight + (rise * (a + 1)) / len : exitHeight;
            // Corners: the side nearer this area is h0, the far side h1.
            const nearSide = (cx: number, cy: number) => (vx > 0 ? cx === 0 : vx < 0 ? cx === 1 : vy > 0 ? cy === 0 : cy === 1);
            const corner = (cx: number, cy: number) => Math.round(nearSide(cx, cy) ? h0 : h1);
            put(x, y, { surface: 'grass', corners: [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)] }, pIndex);
            reserved.add(key(x, y));
          }
        }
      } else if (rng.chance(GEN.gapSpringChance)) {
        // A spring at the near edge helps the ball over.
        const sp = sideTile(rect, nextDir, c0 + Math.floor(width / 2));
        const spIn = inward(sp, opposite(nextDir), 1);
        const t = board.tiles.get(key(spIn[0], spIn[1]));
        if (t && shapeOf(t.corners) === '0000') {
          t.surface = 'spring';
          reserved.add(key(spIn[0], spIn[1]));
        }
      }
      waypoints.push([prect.x + Math.floor(prect.w / 2), prect.y + Math.floor(prect.h / 2)]);
    }
    entryTile = sideTile(next, opposite(nextDir), c0 + Math.floor(width / 2));
    entryHeight = exitHeight + rise;
    dir = nextDir;
    rect = next;
  }

  // Side pockets with loot.
  if (budget >= GEN.pocketMinBudget) {
    for (const [ri, r] of [...board.regions.entries()]) {
      if (r.kind !== 'area' || !rng.chance(GEN.pocketChance)) continue;
      const side = rng.pick(DIRECTIONS);
      const s = sideRange(r.rect, side);
      const mid = Math.floor((s.from + s.to) / 2);
      const n = GEN.pocketSize;
      const [vx, vy] = DIRECTION_VECTORS[side];
      const edge = sideTile(r.rect, side, mid);
      const prect: Rect = s.axis === 'x' ? { x: mid - 1, y: vy > 0 ? edge[1] + 1 : edge[1] - n, w: n, h: n } : { x: vx > 0 ? edge[0] + 1 : edge[0] - n, y: mid - 1, w: n, h: n };
      if ([...board.tiles.keys()].some((k) => {
        const [x, y] = k.split(',').map(Number) as [number, number];
        return x >= prect.x - 1 && x < prect.x + n + 1 && y >= prect.y - 1 && y < prect.y + n + 1 && board.region.get(k) !== ri;
      })) continue;
      // Level with the area tile it opens from; it must not be next to the area's other tiles' cliffs.
      const t = board.tiles.get(key(edge[0], edge[1]));
      if (!t) continue;
      const h = Math.min(...t.corners);
      const pi = board.regions.length;
      board.regions.push({ kind: 'pocket', rect: prect, name: 'pocket', order: r.order, steep: false });
      for (let y = prect.y; y < prect.y + n; y++) for (let x = prect.x; x < prect.x + n; x++) put(x, y, { surface: 'grass', corners: [h, h, h, h] }, pi);
      // Flatten the opening so the pocket can be reached.
      for (let k = -1; k <= 1; k++) {
        const e = s.axis === 'x' ? key(mid + k, edge[1]) : key(edge[0], mid + k);
        const et = board.tiles.get(e);
        if (et) et.corners = [h, h, h, h];
      }
    }
  }

  // Set pieces inside areas.
  for (const r of board.regions) {
    if (r.kind !== 'area' || r.name === 'pond' || terrainLeft <= 0) continue;
    for (let n = 0; n < GEN.setPiecesPerArea; n++) {
      const sp = weighted(rng, SET_PIECES.filter((p) => p.minBudget <= budget && p.cost <= terrainLeft));
      if (!sp) break;
      if (stampSetPiece(board, rng, r, sp.id, reserved, islands, [start, exitTileFinal], dir)) {
        terrainLeft -= sp.cost;
        setPieces.push(sp.id);
      }
    }
  }

  // Edges facing nothing: rails, rims or bare drops. Interior rail shapes.
  const rails: Point[][] = [];
  const shares = GEN.edges.find((e) => budget < e.under) ?? GEN.edges[GEN.edges.length - 1]!;
  let bareCost = 0;
  for (const r of board.regions) {
    for (const side of DIRECTIONS) {
      const s = sideRange(r.rect, side);
      const [vx, vy] = DIRECTION_VECTORS[side];
      let run: Point[] = [];
      const flush = () => {
        if (run.length >= 2) {
          let kind: 'rail' | 'rim' | 'bare' = r.kind === 'pocket' ? 'rail' : (weighted(rng, [
            { k: 'rail' as const, weight: shares.rail },
            { k: 'rim' as const, weight: r.kind === 'passage' ? 0 : shares.rim },
            { k: 'bare' as const, weight: shares.bare },
          ])?.k ?? 'rail');
          const cost = Math.ceil(run.length / GEN.bareTilesPerCost);
          if (kind === 'bare' && cost > terrainLeft) kind = 'rail';
          if (kind === 'bare') {
            terrainLeft -= cost;
            bareCost += cost;
          } else if (kind === 'rail') {
            rails.push([run[0]!, run[run.length - 1]!]);
            for (const p of run) reserved.add(key(p[0], p[1]));
          } else {
            for (const p of run) {
              const t = board.tiles.get(key(p[0], p[1]))!;
              t.corners = t.corners.map((h) => h + GEN.rimSteps) as unknown as Corners;
              t.surface = 'rough';
              reserved.add(key(p[0], p[1]));
            }
          }
        }
        run = [];
      };
      for (let c = s.from; c <= s.to; c++) {
        const p = sideTile(r.rect, side, c);
        const k = key(p[0], p[1]);
        const outside = !board.tiles.has(key(p[0] + vx, p[1] + vy));
        const mine = board.region.get(k) === board.regions.indexOf(r) && board.tiles.has(k);
        const special = (p[0] === start[0] && p[1] === start[1]) || (p[0] === exitTileFinal[0] && p[1] === exitTileFinal[1]);
        // Edges facing a gap stay bare: jumping across is the point.
        const ox = p[0] + vx;
        const oy = p[1] + vy;
        const facesGap = board.regions.some((g) => g.kind === 'passage' && g.name === 'gap' && ox >= g.rect.x && ox < g.rect.x + g.rect.w && oy >= g.rect.y && oy < g.rect.y + g.rect.h);
        if (facesGap) {
          flush();
          continue;
        }
        if (outside && mine && !special && board.tiles.get(k)!.surface !== 'water') run.push(p);
        else flush();
      }
      flush();
    }
  }
  for (const r of board.regions) {
    if (r.kind !== 'area') continue;
    const lf = LANDFORMS.find((l) => l.id === r.name);
    if (!lf || !rng.chance(lf.railShapeChance)) continue;
    const shape = interiorRail(board, rng, r, reserved, [start, exitTileFinal]);
    if (shape) rails.push(shape);
  }

  // Normalise: the board starts at (0, 0) and the lowest corner is 0.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let lowH = Infinity;
  let highH = -Infinity;
  for (const [k, t] of board.tiles) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    for (const c of t.corners) {
      lowH = Math.min(lowH, c);
      highH = Math.max(highH, c);
    }
  }
  if (highH - lowH + 2 > MAX_HEIGHT) return { ok: false, reason: 'too tall' };
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const tiles: (TileSpec | null)[] = Array<TileSpec | null>(width * height).fill(null);
  const region = new Int16Array(width * height).fill(-1);
  for (const [k, t] of board.tiles) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const corners = t.corners.map((c) => c - lowH) as unknown as Corners;
    if (!shapeOf(corners)) return { ok: false, reason: 'illegal tile shape' };
    tiles[(y - minY) * width + (x - minX)] = { ...t, corners };
    region[(y - minY) * width + (x - minX)] = board.region.get(k) ?? -1;
  }
  const shift = (p: Point): Point => [p[0] - minX, p[1] - minY];
  for (const r of board.regions) r.rect = { ...r.rect, x: r.rect.x - minX, y: r.rect.y - minY };
  const shiftedReserved = new Set<string>();
  for (const k of reserved) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    shiftedReserved.add(key(x - minX, y - minY));
  }
  const s = shift(start);
  const e = shift(exitTileFinal);
  for (const p of [s, e]) {
    const t = tiles[p[1] * width + p[0]];
    if (!t) return { ok: false, reason: 'start or exit off the board' };
    // Make the start and the exit flat ground that can hold the ball: lower the tile to its lowest corner.
    if (!SURFACES.get(t.surface)?.canHoldBall) t.surface = 'grass';
    const low = Math.min(...t.corners);
    t.corners = [low, low, low, low];
    delete t.dir;
    shiftedReserved.add(key(p[0], p[1]));
  }
  waypoints.push(exitTileFinal);
  return {
    ok: true,
    terrain: {
      width,
      height,
      tiles,
      region,
      regions: board.regions,
      start: s,
      exit: e,
      rails: rails.map((line) => line.map(shift)),
      reserved: shiftedReserved,
      islands: islands.map(shift),
      waypoints: waypoints.map(shift),
      terrainCost: Math.floor(budget * GEN.terrainShare) - terrainLeft,
      bareCost,
      setPieces,
    },
  };
}

interface Plan {
  nextDir: Direction;
  exitTile: Point;
  pass: PassageDef | null;
  rise: number;
  steepRamp: boolean;
  prect: Rect | null;
  next: Rect | null;
  c0: number;
  width: number;
}

/** Choose how the trail leaves an area and where the next area goes. Null if it does not fit. */
function planNext(rng: Rng, budget: number, rect: Rect, dir: Direction, last: boolean, rects: readonly Rect[], ascend: boolean, terrainLeft: number, tries: number, areaSize: readonly [number, number]): Plan | null {
  let nextDir: Direction = dir;
  if (!last && (tries > 0 || rng.chance(GEN.turnChance))) nextDir = tries === 0 ? (rng.chance(0.5) ? LEFT[dir] : RIGHT[dir]) : rng.pick([dir, LEFT[dir], RIGHT[dir]]);
  const er = sideRange(rect, nextDir);
  const exitC = rng.int(er.from + 2, Math.max(er.from + 2, er.to - 2));
  const exitTile = sideTile(rect, nextDir, exitC);
  if (last) return { nextDir, exitTile, pass: null, rise: 0, steepRamp: false, prect: null, next: null, c0: 0, width: 0 };
  const options = PASSAGES.filter((p) => p.minBudget <= budget && p.cost <= terrainLeft).map((p) => ({
    ...p,
    weight: p.weight * (p.id === 'step-up' && !ascend ? 0 : 1) * (p.id === 'drop' && ascend ? 0.3 : 1),
  }));
  const pass = weighted(rng, options) ?? PASSAGES[0]!;
  let rise = rng.int(pass.rise[0], pass.rise[1]);
  if (pass.id === 'ramp' && !ascend) rise = -rise;
  const steepRamp = pass.id === 'ramp' && rng.chance(0.4);
  if (steepRamp && rise % 2 !== 0) rise += rise > 0 ? 1 : -1;
  const len = pass.id === 'ramp' ? Math.abs(rise) / (steepRamp ? 2 : 1) : rng.int(pass.length[0], pass.length[1]);
  const width = Math.max(2, Math.min(rng.int(pass.width[0], pass.width[1]), er.to - er.from - 1));
  const c0 = Math.max(er.from + 1, Math.min(er.to - width, exitC - Math.floor(width / 2)));
  const outX = nextDir === 'se' ? rect.x + rect.w : nextDir === 'nw' ? rect.x - len : 0;
  const outY = nextDir === 'sw' ? rect.y + rect.h : nextDir === 'ne' ? rect.y - len : 0;
  const prect: Rect = er.axis === 'x' ? { x: c0, y: outY, w: width, h: len } : { x: outX, y: c0, w: len, h: width };
  if (len > 0 && rects.some((r) => r !== rect && overlaps(r, prect, 1))) return null;
  const nw = rng.int(areaSize[0], areaSize[1]);
  const nh = rng.int(areaSize[0], areaSize[1]);
  const across = er.axis === 'x' ? nw : nh;
  const lo = c0 + width - across + 1;
  const hi = c0 - 1;
  const off = rng.int(Math.min(lo, hi), Math.max(lo, hi));
  const farX = nextDir === 'se' ? rect.x + rect.w + len : nextDir === 'nw' ? rect.x - len - nw : off;
  const farY = nextDir === 'sw' ? rect.y + rect.h + len : nextDir === 'ne' ? rect.y - len - nh : off;
  const next: Rect = er.axis === 'x' ? { x: off, y: farY, w: nw, h: nh } : { x: farX, y: off, w: nw, h: nh };
  if (rects.some((r) => r !== rect && overlaps(r, next, 1)) || (len > 0 && overlaps(prect, next, -1) && false)) return null;
  return { nextDir, exitTile, pass, rise, steepRamp, prect, next, c0, width };
}

function opposite(d: Direction): Direction {
  return LEFT[LEFT[d]];
}

/** n tiles from p, moving in direction d. */
function inward(p: Point, d: Direction, n: number): Point {
  const [vx, vy] = DIRECTION_VECTORS[d];
  return [p[0] + vx * n, p[1] + vy * n];
}

// ---------------------------------------------------------------------------
// Set pieces

/** Lower a rectangle one step and fill it with water; maybe keep an island in the middle. */
function stampPond(board: Board, rng: Rng, r: Rect, reserved: Set<string>, islands: Point[], island: boolean): void {
  const ix = r.x + Math.floor(r.w / 2);
  const iy = r.y + Math.floor(r.h / 2);
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const t = board.tiles.get(key(x, y));
      if (!t) continue;
      if (island && r.w >= 3 && r.h >= 3 && x === ix && y === iy) continue;
      t.surface = 'water';
      t.corners = t.corners.map((h) => h - 1) as unknown as Corners;
      reserved.add(key(x, y));
    }
  }
  if (island && r.w >= 3 && r.h >= 3) islands.push([ix, iy]);
  void rng;
}

/** Find a spot w x h inside an area, away from its border and the given points, with gentle ground. */
function findSpot(board: Board, rng: Rng, area: Region, w: number, h: number, reserved: Set<string>, avoid: Point[], flat = false): Rect | null {
  const r = area.rect;
  for (let tries = 0; tries < 20; tries++) {
    const x = rng.int(r.x + 1, Math.max(r.x + 1, r.x + r.w - w - 1));
    const y = rng.int(r.y + 1, Math.max(r.y + 1, r.y + r.h - h - 1));
    let ok = true;
    for (let yy = y - 1; yy <= y + h && ok; yy++) {
      for (let xx = x - 1; xx <= x + w && ok; xx++) {
        const t = board.tiles.get(key(xx, yy));
        if (!t || reserved.has(key(xx, yy))) ok = false;
        else if (yy >= y && yy < y + h && xx >= x && xx < x + w) {
          const sh = shapeOf(t.corners);
          if (!sh || (flat ? sh !== '0000' : sh.includes('2')) || t.surface !== 'grass') ok = false;
        }
        if (avoid.some((p) => Math.abs(p[0] - xx) <= GEN.padRadius && Math.abs(p[1] - yy) <= GEN.padRadius)) ok = false;
      }
    }
    if (ok) return { x, y, w, h };
  }
  return null;
}

function stampSetPiece(board: Board, rng: Rng, area: Region, id: string, reserved: Set<string>, islands: Point[], avoid: Point[], dir: Direction): boolean {
  if (id === 'pond') {
    const spot = findSpot(board, rng, area, rng.int(3, 5), rng.int(3, 5), reserved, avoid);
    if (!spot) return false;
    stampPond(board, rng, spot, reserved, islands, rng.chance(0.6));
    return true;
  }
  if (id === 'spike-pit') {
    const spot = findSpot(board, rng, area, 3, 3, reserved, avoid, true);
    if (!spot) return false;
    for (let y = spot.y; y < spot.y + 3; y++) {
      for (let x = spot.x; x < spot.x + 3; x++) {
        if (x === spot.x + 1 && y === spot.y + 1) continue;
        const t = board.tiles.get(key(x, y))!;
        t.surface = 'spikes';
        t.corners = t.corners.map((h) => h - 2) as unknown as Corners;
        reserved.add(key(x, y));
      }
    }
    islands.push([spot.x + 1, spot.y + 1]);
    return true;
  }
  if (id === 'sand') {
    const spot = findSpot(board, rng, area, rng.int(2, 4), rng.int(2, 4), reserved, avoid);
    if (!spot) return false;
    for (let y = spot.y; y < spot.y + spot.h; y++) for (let x = spot.x; x < spot.x + spot.w; x++) board.tiles.get(key(x, y))!.surface = 'sand';
    return true;
  }
  // A run of 2 to 4 arrow tiles in a line along the trail.
  const n = rng.int(2, 4);
  const along = DIRECTION_VECTORS[dir][0] !== 0;
  const spot = findSpot(board, rng, area, along ? n : 1, along ? 1 : n, reserved, avoid, true);
  if (!spot) return false;
  const surface = rng.chance(0.5) ? 'booster' : 'conveyor';
  const d = rng.chance(0.7) ? dir : rng.pick(DIRECTIONS);
  for (let y = spot.y; y < spot.y + spot.h; y++) {
    for (let x = spot.x; x < spot.x + spot.w; x++) {
      const t = board.tiles.get(key(x, y))!;
      t.surface = surface;
      t.dir = d;
      reserved.add(key(x, y));
    }
  }
  return true;
}

/** A rail shape inside an area: a U round a spot (open towards the start side) or a short 45-degree wall. */
function interiorRail(board: Board, rng: Rng, area: Region, reserved: Set<string>, avoid: Point[]): Point[] | null {
  const spot = findSpot(board, rng, area, 3, 3, reserved, avoid);
  if (!spot) return null;
  const { x, y } = spot;
  let line: Point[];
  if (rng.chance(0.5)) {
    const open = rng.pick(DIRECTIONS);
    const ring: Record<Direction, Point[]> = {
      ne: [[x, y], [x, y + 2], [x + 2, y + 2], [x + 2, y]],
      sw: [[x, y + 2], [x, y], [x + 2, y], [x + 2, y + 2]],
      nw: [[x, y], [x + 2, y], [x + 2, y + 2], [x, y + 2]],
      se: [[x + 2, y], [x, y], [x, y + 2], [x + 2, y + 2]],
    };
    line = ring[open];
  } else {
    line = rng.chance(0.5) ? [[x, y], [x + 2, y + 2]] : [[x + 2, y], [x, y + 2]];
  }
  for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) reserved.add(key(xx, yy));
  return line;
}
