/**
 * Course generator, step 1 of 2: lay chunks on a grid of slots along a route
 * from a start chunk to an exit chunk, add side branches, work out heights,
 * and put a low rim on every side that faces nothing (Milestone 5 design
 * sheet, sections 2.2 and 3.2). Deterministic: everything random comes from
 * the Rng passed in.
 */
import { CHUNK_FILES } from '../content/chunks/index.ts';
import { GEN } from '../content/gen.ts';
import { DIRECTION_VECTORS, DIRECTIONS, type Direction } from '../content/surfaces.ts';
import type { Rng } from '../sim/rng.ts';
import type { Corners } from '../sim/tileShape.ts';
import { loadChunks, opposite, orientations, sideRow, type ChunkDef, type ChunkTile, type OrientedChunk } from './chunks.ts';

export const CHUNKS: readonly ChunkDef[] = loadChunks(CHUNK_FILES);
const ORIENTED: ReadonlyMap<string, OrientedChunk[]> = new Map(CHUNKS.map((c) => [c.id, orientations(c)]));

const N = GEN.chunkSize;

export interface PlacedChunk {
  readonly chunk: OrientedChunk;
  /** Slot on the chunk grid. */
  readonly sx: number;
  readonly sy: number;
  /** Position along the route (0 = start); branches take their parent's index. */
  readonly order: number;
  /** Height added to every corner of this chunk. */
  offset: number;
  /** Sides joined to another chunk. */
  readonly joined: Direction[];
}

export interface Layout {
  readonly slotsW: number;
  readonly slotsH: number;
  readonly width: number;
  readonly height: number;
  readonly chunks: PlacedChunk[];
  /** Row-major tiles of the whole course; null is out of bounds. */
  readonly tiles: (ChunkTile | null)[];
  readonly start: readonly [number, number];
  readonly exit: readonly [number, number];
  readonly terrainCost: number;
}

export type LayoutResult = { ok: true; layout: Layout } | { ok: false; reason: string };

export function sizeFor(budget: number) {
  return GEN.sizes.find((s) => budget < s.under) ?? GEN.sizes[GEN.sizes.length - 1]!;
}

/** A random self-avoiding walk of `len` slots. */
function randomRoute(rng: Rng, w: number, h: number, len: number): { x: number; y: number }[] | null {
  for (let tries = 0; tries < 60; tries++) {
    const route = [{ x: rng.int(0, w - 1), y: rng.int(0, h - 1) }];
    const used = new Set([`${route[0]!.x},${route[0]!.y}`]);
    while (route.length < len) {
      const cur = route[route.length - 1]!;
      const next = rng
        .shuffle(DIRECTIONS)
        .map((d) => ({ x: cur.x + DIRECTION_VECTORS[d][0], y: cur.y + DIRECTION_VECTORS[d][1] }))
        .find((p) => p.x >= 0 && p.y >= 0 && p.x < w && p.y < h && !used.has(`${p.x},${p.y}`));
      if (!next) break;
      route.push(next);
      used.add(`${next.x},${next.y}`);
    }
    if (route.length === len) return route;
  }
  return null;
}

function sideBetween(a: { x: number; y: number }, b: { x: number; y: number }): Direction {
  const d = DIRECTIONS.find((k) => DIRECTION_VECTORS[k][0] === b.x - a.x && DIRECTION_VECTORS[k][1] === b.y - a.y);
  if (!d) throw new Error('Slots are not neighbours.');
  return d;
}

/** Chunk versions that fit: the right role, these sides open, ledges facing downhill from `into` to `out`. */
function fits(role: ChunkDef['role'], need: Direction[], budget: number, costLeft: number, into?: Direction, out?: Direction): Map<string, OrientedChunk[]> {
  const res = new Map<string, OrientedChunk[]>();
  for (const c of CHUNKS) {
    if (c.role !== role || c.minBudget > budget || c.cost > costLeft) continue;
    const ok = ORIENTED.get(c.id)!.filter((o) => {
      if (!need.every((s) => o.open.includes(s))) return false;
      if (role === 'start' || role === 'exit' || role === 'branch') return o.open.length === need.length;
      if (o.oneWay && into && out) return (o.sideHeight[into] ?? 0) > (o.sideHeight[out] ?? 0);
      return true;
    });
    if (ok.length) res.set(c.id, ok);
  }
  return res;
}

function pickChunk(rng: Rng, options: Map<string, OrientedChunk[]>): OrientedChunk | null {
  if (options.size === 0) return null;
  const ids = [...options.keys()];
  return rng.pick(options.get(rng.pick(ids))!);
}

export function makeLayout(rng: Rng, budget: number): LayoutResult {
  const size = sizeFor(budget);
  const [w, h] = size.slots;
  const len = rng.int(size.route[0], size.route[1]);
  const route = randomRoute(rng, w, h, len);
  if (!route) return { ok: false, reason: 'no route' };

  let terrainLeft = Math.floor(budget * GEN.terrainShare);
  const placed: PlacedChunk[] = [];
  for (let i = 0; i < route.length; i++) {
    const into = i > 0 ? sideBetween(route[i]!, route[i - 1]!) : undefined;
    const out = i < route.length - 1 ? sideBetween(route[i]!, route[i + 1]!) : undefined;
    const role = i === 0 ? 'start' : i === route.length - 1 ? 'exit' : 'path';
    const need = [into, out].filter((d): d is Direction => !!d);
    const chunk = pickChunk(rng, fits(role, need, budget, terrainLeft, into, out));
    if (!chunk) return { ok: false, reason: `no chunk fits (${role})` };
    terrainLeft -= chunk.cost;
    placed.push({ chunk, sx: route[i]!.x, sy: route[i]!.y, order: i, offset: 0, joined: need });
  }

  // Heights along the route: each chunk is raised or lowered so joined sides meet.
  for (let i = 1; i < placed.length; i++) {
    const prev = placed[i - 1]!;
    const cur = placed[i]!;
    const side = sideBetween(route[i - 1]!, route[i]!);
    cur.offset = prev.offset + prev.chunk.sideHeight[side]! - cur.chunk.sideHeight[opposite(side)]!;
  }

  // Side branches off path chunks, through an open side the route does not use.
  const occupied = new Set(placed.map((p) => `${p.sx},${p.sy}`));
  const branches = rng.int(size.branches[0], size.branches[1]);
  for (let b = 0; b < branches; b++) {
    const options: { parent: PlacedChunk; side: Direction }[] = [];
    for (const p of placed) {
      if (p.chunk.role !== 'path') continue;
      for (const side of p.chunk.open) {
        if (p.joined.includes(side)) continue;
        const nx = p.sx + DIRECTION_VECTORS[side][0];
        const ny = p.sy + DIRECTION_VECTORS[side][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || occupied.has(`${nx},${ny}`)) continue;
        options.push({ parent: p, side });
      }
    }
    if (!options.length) break;
    const { parent, side } = rng.pick(options);
    const nook = pickChunk(rng, fits('branch', [opposite(side)], budget, Infinity));
    if (!nook) break;
    const nx = parent.sx + DIRECTION_VECTORS[side][0];
    const ny = parent.sy + DIRECTION_VECTORS[side][1];
    parent.joined.push(side);
    occupied.add(`${nx},${ny}`);
    placed.push({
      chunk: nook,
      sx: nx,
      sy: ny,
      order: parent.order,
      offset: parent.offset + parent.chunk.sideHeight[side]! - nook.sideHeight[opposite(side)]!,
      joined: [opposite(side)],
    });
  }

  // Lay the tiles.
  const width = w * N;
  const height = h * N;
  const tiles: (ChunkTile | null)[] = Array<ChunkTile | null>(width * height).fill(null);
  const raised = new Set<number>();
  for (const p of placed) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const t = p.chunk.tiles[y]![x];
        if (!t) continue;
        const corners = t.corners.map((c) => c + p.offset) as unknown as Corners;
        tiles[(p.sy * N + y) * width + p.sx * N + x] = { ...t, corners };
      }
    }
  }
  // A low rim (one step up, rough) on every side that faces nothing, so the ball is not thrown off by accident.
  for (const p of placed) {
    for (const side of DIRECTIONS) {
      const nx = p.sx + DIRECTION_VECTORS[side][0];
      const ny = p.sy + DIRECTION_VECTORS[side][1];
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && occupied.has(`${nx},${ny}`)) continue;
      for (const [x, y] of sideRow(side)) {
        const i = (p.sy * N + y) * width + p.sx * N + x;
        const t = tiles[i];
        if (!t || raised.has(i)) continue;
        raised.add(i);
        tiles[i] = { surface: 'rough', corners: t.corners.map((c) => c + 1) as unknown as Corners };
      }
    }
  }

  // Lowest corner becomes 0; nothing may go above the height limit.
  let lo = Infinity;
  let hi = -Infinity;
  for (const t of tiles) if (t) for (const c of t.corners) [lo, hi] = [Math.min(lo, c), Math.max(hi, c)];
  // This layout writes format 2 (digits 0-9, doubled when read): room for a bumper on top.
  if (hi - lo > 8) return { ok: false, reason: 'too tall' };
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    if (t && lo !== 0) tiles[i] = { ...t, corners: t.corners.map((c) => c - lo) as unknown as Corners };
  }
  for (const p of placed) p.offset -= lo;

  const sp = placed[0]!;
  const ep = placed[route.length - 1]!;
  return {
    ok: true,
    layout: {
      slotsW: w,
      slotsH: h,
      width,
      height,
      chunks: placed,
      tiles,
      start: [sp.sx * N + sp.chunk.start![0], sp.sy * N + sp.chunk.start![1]],
      exit: [ep.sx * N + ep.chunk.exit![0], ep.sy * N + ep.chunk.exit![1]],
      terrainCost: placed.reduce((n, p) => n + p.chunk.cost, 0),
    },
  };
}
