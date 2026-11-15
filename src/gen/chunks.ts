/**
 * Chunks: the small hand-made pieces the course generator joins together
 * (Milestone 5 design sheet, section 2). A chunk file is written in the same
 * tile text as a course file, plus which sides are open, a role, a terrain
 * cost and marked spots. Here they are read, checked, and turned or flipped.
 *
 * Sides are named like directions on the grid: "ne" is the y = 0 row, "se" the
 * x = N-1 column, "sw" the y = N-1 row and "nw" the x = 0 column.
 */
import { GEN } from '../content/gen.ts';
import { DIRECTIONS, SURFACES, type Direction } from '../content/surfaces.ts';
import { shapeOf, type Corners } from '../sim/tileShape.ts';

export type Point = readonly [number, number];
export type ChunkRole = 'start' | 'exit' | 'path' | 'branch';
export type SpotKind = 'enemy' | 'lane' | 'blocker' | 'cloud' | 'gate' | 'hazard' | 'pickup' | 'crack';

export interface ChunkTile {
  readonly surface: string;
  readonly corners: Corners;
  readonly dir?: Direction;
}

export interface Spot {
  readonly kind: SpotKind;
  /** The spot's tile (for a hazard, its first tile). */
  readonly at: Point;
  /** Lane: the far end(s) of the walk. */
  readonly path?: readonly Point[];
  /** Hazard: every tile in the group. */
  readonly tiles?: readonly Point[];
  /** Hazard: surfaces it may become. */
  readonly allow?: readonly string[];
  /** Hazard: a fixed direction for arrow tiles (otherwise random). */
  readonly dir?: Direction;
  /** Blocker: crates only. */
  readonly crate?: boolean;
  /** Gate: which way the bars run. */
  readonly orient?: 'x' | 'y';
}

export interface ChunkDef {
  readonly id: string;
  readonly name: string;
  readonly role: ChunkRole;
  readonly cost: number;
  readonly minBudget: number;
  /** A ledge: may only be crossed from its higher open side to its lower one. */
  readonly oneWay: boolean;
  readonly open: readonly Direction[];
  /** tiles[y][x]; null is out of bounds. */
  readonly tiles: readonly (readonly (ChunkTile | null)[])[];
  readonly start?: Point;
  readonly exit?: Point;
  readonly spots: readonly Spot[];
}

/** A chunk turned (0 to 3 quarter turns clockwise on the grid) and maybe flipped. */
export interface OrientedChunk extends ChunkDef {
  readonly rot: number;
  readonly mirror: boolean;
  /** Height of each open side's middle tiles. */
  readonly sideHeight: Readonly<Partial<Record<Direction, number>>>;
}

const N = GEN.chunkSize;
const TOKEN = /^(.)(\d|\d{4})$/u;
const SPOT_KINDS: readonly SpotKind[] = ['enemy', 'lane', 'blocker', 'cloud', 'gate', 'hazard', 'pickup', 'crack'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function point(v: unknown): Point | null {
  return Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0 && n < N) ? [v[0] as number, v[1] as number] : null;
}

/** The three middle tiles of a side. */
export function sideTiles(side: Direction): Point[] {
  const out: Point[] = [];
  for (let i = 1; i < N - 1; i++) {
    if (side === 'ne') out.push([i, 0]);
    else if (side === 'sw') out.push([i, N - 1]);
    else if (side === 'nw') out.push([0, i]);
    else out.push([N - 1, i]);
  }
  return out;
}

/** Every tile along a side, corners included. */
export function sideRow(side: Direction): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < N; i++) {
    if (side === 'ne') out.push([i, 0]);
    else if (side === 'sw') out.push([i, N - 1]);
    else if (side === 'nw') out.push([0, i]);
    else out.push([N - 1, i]);
  }
  return out;
}

export function opposite(side: Direction): Direction {
  return ({ ne: 'sw', sw: 'ne', se: 'nw', nw: 'se' } as const)[side];
}

/** Read and check one chunk file. */
export function parseChunk(raw: unknown): { ok: true; chunk: ChunkDef } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['A chunk must be a JSON object.'] };
  const id = typeof raw.id === 'string' ? raw.id : '?';
  const err = (m: string) => errors.push(`chunk "${id}": ${m}`);
  if (typeof raw.name !== 'string') err('"name" must be a string.');
  const role = raw.role as ChunkRole;
  if (!['start', 'exit', 'path', 'branch'].includes(role)) err('"role" must be start, exit, path or branch.');
  if (!Number.isInteger(raw.cost) || (raw.cost as number) < 0) err('"cost" must be a whole number, 0 or more.');
  const legend = isRecord(raw.legend) ? raw.legend : {};
  const rows = Array.isArray(raw.tiles) ? raw.tiles : [];
  if (rows.length !== N) err(`"tiles" must have ${N} rows.`);
  const tiles: (ChunkTile | null)[][] = [];
  rows.forEach((row: unknown, y) => {
    const toks = typeof row === 'string' ? row.trim().split(/\s+/u) : [];
    if (toks.length !== N) err(`tiles row ${y} must have ${N} tiles.`);
    const out: (ChunkTile | null)[] = [];
    for (let x = 0; x < N; x++) {
      const t = toks[x] ?? '.';
      if (t === '.') {
        out.push(null);
        continue;
      }
      const m = TOKEN.exec(t);
      const surface = m ? legend[m[1]!] : undefined;
      if (!m || typeof surface !== 'string' || !SURFACES.has(surface)) {
        err(`tile (${x}, ${y}) "${t}" is not a legend letter and 1 or 4 digits.`);
        out.push(null);
        continue;
      }
      const h = [...m[2]!].map(Number);
      const corners: Corners = h.length === 1 ? [h[0]!, h[0]!, h[0]!, h[0]!] : [h[0]!, h[1]!, h[2]!, h[3]!];
      if (!shapeOf(corners)) err(`tile (${x}, ${y}) "${t}" is not an allowed shape.`);
      out.push({ surface, corners });
    }
    tiles.push(out);
  });
  const open = Array.isArray(raw.open) ? (raw.open as Direction[]) : [];
  if (open.length === 0 || !open.every((s) => DIRECTIONS.includes(s))) err('"open" must list one or more sides (ne, se, sw, nw).');
  const spots: Spot[] = [];
  for (const [i, s] of (Array.isArray(raw.spots) ? raw.spots : []).entries()) {
    if (!isRecord(s) || !SPOT_KINDS.includes(s.kind as SpotKind)) {
      err(`spots[${i}] has an unknown kind.`);
      continue;
    }
    const kind = s.kind as SpotKind;
    const tl = kind === 'hazard' && Array.isArray(s.tiles) ? s.tiles.map(point) : null;
    const at = tl ? tl[0] : point(s.at);
    if (!at || (tl && tl.some((p) => !p))) {
      err(`spots[${i}] is not on the chunk.`);
      continue;
    }
    const spot: Spot = {
      kind,
      at,
      ...(Array.isArray(s.path) && { path: s.path.map(point).filter((p): p is Point => !!p) }),
      ...(tl && { tiles: tl as Point[] }),
      ...(Array.isArray(s.allow) && { allow: s.allow as string[] }),
      ...(typeof s.dir === 'string' && { dir: s.dir as Direction }),
      ...(s.crate === true && { crate: true }),
      ...((s.orient === 'x' || s.orient === 'y') && { orient: s.orient }),
    };
    if (kind === 'lane' && (!spot.path || spot.path.length === 0)) err(`spots[${i}]: a lane needs a "path".`);
    if (kind === 'hazard' && (!spot.allow || spot.allow.some((a) => SURFACES.get(a)?.cost === undefined))) err(`spots[${i}]: "allow" must list hazard surfaces that have a cost.`);
    spots.push(spot);
  }
  const start = raw.start === undefined ? undefined : point(raw.start);
  const exit = raw.exit === undefined ? undefined : point(raw.exit);
  if (role === 'start' && !start) err('a start chunk needs "start".');
  if (role === 'exit' && !exit) err('an exit chunk needs "exit".');
  if (errors.length) return { ok: false, errors };
  const chunk: ChunkDef = {
    id,
    name: raw.name as string,
    role,
    cost: raw.cost as number,
    minBudget: Number.isInteger(raw.minBudget) ? (raw.minBudget as number) : 0,
    oneWay: raw.oneWay === true,
    open,
    tiles,
    ...(start && { start }),
    ...(exit && { exit }),
    spots,
  };
  const sideErr = checkSides(chunk);
  if (sideErr.length) return { ok: false, errors: sideErr.map((m) => `chunk "${id}": ${m}`) };
  return { ok: true, chunk };
}

/** Each open side's middle tiles must be flat, level with each other and able to hold the ball. */
export function checkSides(c: ChunkDef): string[] {
  const out: string[] = [];
  for (const side of c.open) {
    const hs = new Set<number>();
    for (const [x, y] of sideTiles(side)) {
      const t = c.tiles[y]?.[x];
      if (!t || shapeOf(t.corners) !== '0000' || !SURFACES.get(t.surface)?.canHoldBall) out.push(`open side ${side}: tile (${x}, ${y}) must be flat ground that can hold the ball.`);
      else hs.add(t.corners[0]);
    }
    if (hs.size > 1) out.push(`open side ${side}: its middle tiles must all be the same height.`);
  }
  return out;
}

function sideHeights(c: ChunkDef): Partial<Record<Direction, number>> {
  const out: Partial<Record<Direction, number>> = {};
  for (const side of c.open) {
    const [x, y] = sideTiles(side)[1]!;
    out[side] = c.tiles[y]![x]!.corners[0];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Turning and flipping

const ROT_DIR: Record<Direction, Direction> = { ne: 'se', se: 'sw', sw: 'nw', nw: 'ne' };
const MIRROR_DIR: Record<Direction, Direction> = { ne: 'ne', sw: 'sw', se: 'nw', nw: 'se' };

function turnDir(d: Direction, rot: number, mirror: boolean): Direction {
  let out = mirror ? MIRROR_DIR[d] : d;
  for (let i = 0; i < rot; i++) out = ROT_DIR[out];
  return out;
}

function turnPoint([x, y]: Point, rot: number, mirror: boolean): Point {
  let px = mirror ? N - 1 - x : x;
  let py = y;
  for (let i = 0; i < rot; i++) [px, py] = [N - 1 - py, px];
  return [px, py];
}

function turnCorners(c: Corners, rot: number, mirror: boolean): Corners {
  let out: Corners = mirror ? [c[1], c[0], c[3], c[2]] : c;
  for (let i = 0; i < rot; i++) out = [out[3], out[0], out[1], out[2]];
  return out;
}

/** The chunk turned `rot` quarter turns clockwise (on the grid), flipped first if `mirror`. */
export function orient(c: ChunkDef, rot: number, mirror: boolean): OrientedChunk {
  const tiles: (ChunkTile | null)[][] = Array.from({ length: N }, () => Array<ChunkTile | null>(N).fill(null));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = c.tiles[y]?.[x];
      if (!t) continue;
      const [nx, ny] = turnPoint([x, y], rot, mirror);
      tiles[ny]![nx] = { surface: t.surface, corners: turnCorners(t.corners, rot, mirror), ...(t.dir && { dir: turnDir(t.dir, rot, mirror) }) };
    }
  }
  const tp = (p: Point) => turnPoint(p, rot, mirror);
  const spots = c.spots.map(
    (s): Spot => ({
      ...s,
      at: tp(s.at),
      ...(s.path && { path: s.path.map(tp) }),
      ...(s.tiles && { tiles: s.tiles.map(tp) }),
      ...(s.dir && { dir: turnDir(s.dir, rot, mirror) }),
      ...(s.orient && { orient: rot % 2 === 1 ? (s.orient === 'x' ? 'y' : 'x') : s.orient }),
    }),
  );
  const out: ChunkDef = {
    ...c,
    tiles,
    open: c.open.map((d) => turnDir(d, rot, mirror)),
    spots,
    ...(c.start && { start: tp(c.start) }),
    ...(c.exit && { exit: tp(c.exit) }),
  };
  return { ...out, rot, mirror, sideHeight: sideHeights(out) };
}

/** All eight turned and flipped versions (some may look the same). */
export function orientations(c: ChunkDef): OrientedChunk[] {
  const out: OrientedChunk[] = [];
  for (const mirror of [false, true]) for (let rot = 0; rot < 4; rot++) out.push(orient(c, rot, mirror));
  return out;
}

/** Parse a list of chunk files; throws with every problem if any is bad. */
export function loadChunks(files: readonly unknown[]): ChunkDef[] {
  const out: ChunkDef[] = [];
  const errors: string[] = [];
  for (const f of files) {
    const r = parseChunk(f);
    if (r.ok) out.push(r.chunk);
    else errors.push(...r.errors);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return out;
}
