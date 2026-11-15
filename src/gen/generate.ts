/**
 * Course generator, step 2 of 2: spend the difficulty budget on enemies (in
 * squads), obstacles and hazard tiles at the chunks' marked spots, set the
 * quota, and write an ordinary course file (Milestone 5 design sheet,
 * sections 3 and 4). `generateAttempt` makes one try; `generateCourse` in
 * validate.ts checks it and retries.
 */
import { GEN } from '../content/gen.ts';
import { OBJECTS, type EnemyDef } from '../content/objects.ts';
import { DIRECTIONS, SURFACES, type Direction } from '../content/surfaces.ts';
import { parseCourse, type Course } from '../sim/course.ts';
import { Rng } from '../sim/rng.ts';
import type { Corners } from '../sim/tileShape.ts';
import type { ChunkTile, Point, Spot } from './chunks.ts';
import { makeLayout, type Layout } from './layout.ts';

const N = GEN.chunkSize;

/** What the budget was spent on. */
export interface Spend {
  terrain: number;
  enemies: number;
  obstacles: number;
  hazards: number;
}

export interface GenMeta {
  readonly seed: string;
  readonly budget: number;
  readonly attempt: number;
  readonly layout: Layout;
  readonly spend: Spend;
  readonly enemies: number;
  readonly stars: number;
  /** Spots in course coordinates, for the debug overlay. */
  readonly spots: readonly { kind: Spot['kind']; x: number; y: number; used: boolean }[];
}

export type AttemptResult = { ok: true; raw: Record<string, unknown>; course: Course; meta: GenMeta } | { ok: false; reason: string };

interface GlobalSpot extends Spot {
  /** Route order of the chunk it is in (0 = start). */
  readonly order: number;
  /** Index of its chunk in layout.chunks. */
  readonly chunk: number;
  used: boolean;
}

interface PlacedObject {
  id: string;
  at: Point;
  path?: Point[];
  orient?: 'x' | 'y';
  drops?: string[];
  facing?: Direction;
  phase?: number;
}

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const near = (a: Point, b: Point, r: number) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) <= r;
const key = (p: Point) => `${p[0]},${p[1]}`;

/** Tiles a straight lane walks over, from its start to its end. */
function laneTiles(from: Point, path: readonly Point[]): Point[] {
  const out: Point[] = [from];
  let cur = from;
  for (const to of path) {
    const n = Math.max(Math.abs(to[0] - cur[0]), Math.abs(to[1] - cur[1]));
    for (let k = 1; k <= n; k++) out.push([cur[0] + Math.round(((to[0] - cur[0]) * k) / n), cur[1] + Math.round(((to[1] - cur[1]) * k) / n)]);
    cur = to;
  }
  return out;
}

function weighted<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T | null {
  const total = items.reduce((n, i) => n + i.weight, 0);
  if (total <= 0) return null;
  let r = rng.float(0, total);
  for (const i of items) {
    r -= i.weight;
    if (r < 0) return i.item;
  }
  return items[items.length - 1]!.item;
}

/** The stream of random numbers for one attempt. */
export function attemptRng(seed: string, budget: number, attempt: number): Rng {
  return Rng.fromSeed(`gen/${seed}/${budget}/${attempt}`);
}

/** One try at a course. Same seed, budget and attempt number give the same result. */
export function generateAttempt(seed: string, budget: number, attempt: number): AttemptResult {
  const rng = attemptRng(seed, budget, attempt);
  const lr = makeLayout(rng.fork('layout'), budget);
  if (!lr.ok) return lr;
  const layout = lr.layout;
  const place = rng.fork('place');
  const tiles = layout.tiles.slice();
  const tileAt = (p: Point) => (p[0] < 0 || p[1] < 0 || p[0] >= layout.width || p[1] >= layout.height ? null : tiles[p[1] * layout.width + p[0]]);
  const start = layout.start;
  const exit = layout.exit;

  // Spots in course coordinates.
  const spots: GlobalSpot[] = [];
  layout.chunks.forEach((pc, ci) => {
    const ox = pc.sx * N;
    const oy = pc.sy * N;
    const g = (p: Point): Point => [p[0] + ox, p[1] + oy];
    for (const s of pc.chunk.spots) {
      spots.push({
        ...s,
        at: g(s.at),
        ...(s.path && { path: s.path.map(g) }),
        ...(s.tiles && { tiles: s.tiles.map(g) }),
        order: pc.order,
        chunk: ci,
        used: false,
      });
    }
  });

  const used = new Set<string>([key(start), key(exit)]);
  const objects: PlacedObject[] = [];
  const spend: Spend = { terrain: layout.terrainCost, enemies: 0, obstacles: 0, hazards: 0 };

  // Safety rules (sheet section 4.3).
  const safe = (p: Point) => !used.has(key(p)) && dist(p, start) > GEN.startClear && !near(p, exit, 1) && !!tileAt(p);
  const enemySafe = (def: EnemyDef, p: Point) => {
    if (!safe(p)) return false;
    const outer = def.stats.outerRadius ?? 0;
    if (def.family === 'sentinel' && outer > 0 && dist(p, start) <= outer + 0.5) return false;
    if (def.behaviour.kind === 'burrow') {
      const t = tileAt(p);
      if (!t || !['grass', 'rough'].includes(t.surface) || new Set(t.corners).size > 1) return false;
    }
    return true;
  };
  const laneSafe = (s: GlobalSpot) => laneTiles(s.at, s.path ?? []).every((p) => !!tileAt(p) && dist(p, start) > GEN.startClear && !near(p, exit, 1));

  // ---- Enemies -----------------------------------------------------------
  const afterTerrain = budget - spend.terrain;
  let enemyLeft = Math.min(afterTerrain, Math.max(Math.ceil(budget * GEN.enemyShare), Math.ceil(afterTerrain * GEN.enemyOfRest)));
  let enemyCount = 0;
  const placeEnemy = (id: string, s: GlobalSpot) => {
    const def = OBJECTS.get(id) as EnemyDef;
    s.used = true;
    used.add(key(s.at));
    const facing = place.pick(DIRECTIONS);
    if (def.behaviour.kind === 'patrol') objects.push({ id, at: s.at, path: [...(s.path ?? [])], phase: place.float(0, 1) });
    else objects.push({ id, at: s.at, facing });
    enemyLeft -= def.cost;
    spend.enemies += def.cost;
    enemyCount++;
  };

  // Ability carrier (sheet section 4.2): close to the start.
  let carrier: string | null = null;
  if (place.chance(GEN.carrierChance)) {
    const id = place.pick(GEN.carriers);
    const def = OBJECTS.get(id) as EnemyDef;
    const options = spots.filter((s) => s.kind === 'enemy' && !s.used && enemySafe(def, s.at));
    if (options.length && def.cost <= enemyLeft) {
      const first = Math.min(...options.map((s) => s.order));
      const s = place.pick(options.filter((o) => o.order <= first + 1));
      placeEnemy(id, s);
      carrier = id;
    }
  }

  // Squads (sheet section 4.1): groups of 2 to 5 in one chunk and its route neighbours.
  const chunkIds = layout.chunks.map((_, i) => i);
  for (let guard = 0; guard < 30 && enemyLeft > 0 && enemyCount < GEN.maxEnemies; guard++) {
    const anchors = chunkIds.filter((ci) => spots.some((s) => s.chunk === ci && !s.used && (s.kind === 'enemy' || s.kind === 'lane')));
    if (!anchors.length) break;
    const anchor = place.pick(anchors);
    const order = layout.chunks[anchor]!.order;
    const area = (s: GlobalSpot) => s.chunk === anchor || Math.abs(s.order - order) <= 1;
    const size = place.int(GEN.squadMin, GEN.squadMax);
    let added = 0;
    for (let m = 0; m < size && enemyLeft > 0 && enemyCount < GEN.maxEnemies; m++) {
      const choices: { item: { id: string; s: GlobalSpot }; weight: number }[] = [];
      for (const [id, weight] of Object.entries(GEN.enemyWeights)) {
        const def = OBJECTS.get(id) as EnemyDef | undefined;
        // Keep 1 per enemy still needed to reach the minimum (a Mossback costs 1).
        const reserve = Math.max(0, GEN.minEnemies - enemyCount - 1);
        if (!def || def.cost > enemyLeft - reserve) continue;
        const kind = def.behaviour.kind === 'patrol' ? 'lane' : 'enemy';
        const free = spots.filter((s) => s.kind === kind && !s.used && area(s) && (kind === 'lane' ? laneSafe(s) && !used.has(key(s.at)) : enemySafe(def, s.at)));
        // Prefer the anchor chunk itself.
        const own = free.filter((s) => s.chunk === anchor);
        const pool = own.length ? own : free;
        if (pool.length) choices.push({ item: { id, s: place.pick(pool) }, weight });
      }
      const pick = weighted(place, choices);
      if (!pick) break;
      placeEnemy(pick.id, pick.s);
      added++;
    }
    if (added === 0) {
      // Nothing more fits around this chunk; stop if nothing fits anywhere.
      const anyFree = spots.some((s) => s.kind === 'enemy' && !s.used && enemySafe(OBJECTS.get('mossback') as EnemyDef, s.at));
      if (!anyFree) break;
    }
  }
  if (enemyCount < GEN.minEnemies) return { ok: false, reason: 'too few enemies' };

  // ---- Obstacles and hazards (sheet section 4.4) ------------------------
  let left = budget - spend.terrain - spend.enemies;
  const cloudDef = OBJECTS.get('thunder-cloud');
  const cloudCost = cloudDef?.kind === 'cloud' ? cloudDef.cost : 2;
  const driftCost = cloudDef?.kind === 'cloud' ? cloudDef.driftCost : 3;
  const costOf = (id: string) => {
    const d = OBJECTS.get(id);
    return d && 'cost' in d ? d.cost : 99;
  };
  for (let guard = 0; guard < 40 && left > 0; guard++) {
    type Choice = () => void;
    const options: { item: Choice; weight: number }[] = [];
    const W = GEN.obstacleWeights;
    for (const s of spots) {
      if (s.used) continue;
      if (s.kind === 'blocker' && safe(s.at)) {
        if (!s.crate) {
          const id = place.pick(GEN.blockers);
          if (costOf(id) <= left) options.push({ weight: W.blocker!, item: () => {
            objects.push({ id, at: s.at });
            spend.obstacles += costOf(id);
          } });
        }
        const crate = place.chance(0.3) ? 'secured-crate' : 'crate';
        if (costOf(crate) <= left) {
          options.push({
            weight: W.crate! * (s.crate ? 2 : 1),
            item: () => {
              const o: PlacedObject = { id: crate, at: s.at };
              if (crate === 'crate' && place.chance(GEN.crateHeartChance)) o.drops = ['heart'];
              objects.push(o);
              spend.obstacles += costOf(crate);
            },
          });
        }
      } else if (s.kind === 'cloud' && cloudCost <= left && dist(s.at, start) > GEN.startClear && !near(s.at, exit, 1)) {
        options.push({ weight: W.cloud!, item: () => {
            objects.push({ id: 'thunder-cloud', at: s.at });
            spend.obstacles += cloudCost;
          } });
      } else if (s.kind === 'lane' && !used.has(key(s.at)) && laneSafe(s)) {
        if (driftCost <= left) {
          options.push({ weight: W.cloud!, item: () => {
            objects.push({ id: 'thunder-cloud', at: s.at, path: [...(s.path ?? [])], phase: place.float(0, 1) });
            spend.obstacles += driftCost;
          } });
        }
        if (costOf('sliding-block') <= left) {
          options.push({ weight: W.slider!, item: () => {
            objects.push({ id: 'sliding-block', at: s.at, path: [...(s.path ?? [])], phase: place.float(0, 1) });
            spend.obstacles += costOf('sliding-block');
          } });
        }
      } else if (s.kind === 'gate' && safe(s.at) && costOf('gate') <= left) {
        options.push({ weight: W.gate!, item: () => {
            objects.push({ id: 'gate', at: s.at, orient: s.orient ?? 'x', phase: place.float(0, 1) });
            spend.obstacles += costOf('gate');
          } });
      } else if (s.kind === 'crack' && carrier === 'anchorback' && safe(s.at) && costOf('cracked-tile') <= left) {
        options.push({ weight: W.crack!, item: () => {
            objects.push({ id: 'cracked-tile', at: s.at });
            spend.obstacles += costOf('cracked-tile');
          } });
      } else if (s.kind === 'hazard') {
        const ts = s.tiles ?? [s.at];
        if (!ts.every((p) => !used.has(key(p)) && !near(p, start, 1) && !near(p, exit, 1) && tileAt(p))) continue;
        const allowed = (s.allow ?? []).filter((a) => {
          const def = SURFACES.get(a);
          if (!def || def.cost === undefined || def.cost > left) return false;
          return !def.flatOnly || ts.every((p) => new Set(tileAt(p)!.corners).size === 1);
        });
        if (!allowed.length) continue;
        const surface = place.pick(allowed);
        options.push({
          weight: W.hazard!,
          item: () => {
            const def = SURFACES.get(surface)!;
            const dir = def.needsDir ? (s.dir ?? place.pick(DIRECTIONS)) : undefined;
            for (const p of ts) {
              const t = tileAt(p)!;
              // This generator writes format 2 (half-tile steps), so a raise in new steps is halved.
              const corners = t.corners.map((c) => c + Math.ceil((def.raise ?? 0) / 2)) as unknown as Corners;
              const nt: ChunkTile = { surface, corners, ...(dir && { dir }) };
              tiles[p[1] * layout.width + p[0]] = nt;
              used.add(key(p));
            }
            spend.hazards += def.cost!;
          },
        });
      }
    }
    if (!options.length) break;
    // Pick a spot use, then mark its spot taken.
    const idx = options.map((o, i) => ({ item: i, weight: o.weight }));
    const i = weighted(place, idx);
    if (i === null) break;
    const before = objects.length;
    options[i]!.item();
    // Find which spot was just used: the new object's tile, or the hazard tiles.
    const placed = objects.length > before ? objects[objects.length - 1]! : null;
    if (placed) {
      used.add(key(placed.at));
      const s = spots.find((sp) => !sp.used && key(sp.at) === key(placed.at));
      if (s) s.used = true;
    } else {
      const s = spots.find((sp) => !sp.used && sp.kind === 'hazard' && (sp.tiles ?? [sp.at]).every((p) => used.has(key(p))));
      if (s) s.used = true;
    }
    left = budget - spend.terrain - spend.enemies - spend.obstacles - spend.hazards;
  }

  // ---- Free pickups (sheet section 4.5) ---------------------------------
  if (place.chance(GEN.shotOrbChance)) {
    const options = spots.filter((s) => s.kind === 'pickup' && !s.used && safe(s.at));
    if (options.length) {
      const s = place.pick(options);
      s.used = true;
      used.add(key(s.at));
      objects.push({ id: 'shot-orb', at: s.at });
    }
  }

  // ---- Quota (sheet section 4.6): cracked-tile stars are a bonus --------
  let stars = 0;
  for (const o of objects) {
    const def = OBJECTS.get(o.id);
    if (def?.kind === 'enemy') stars += def.starValue;
    else if (def?.kind === 'breakable' && def.breakBy === 'hit') stars += (o.drops ?? def.drops).filter((d) => d === 'yellow-star').length;
  }
  const quota = Math.min(stars, Math.max(GEN.minQuota, Math.round(stars * GEN.quotaShare)));
  if (stars < GEN.minQuota) return { ok: false, reason: 'too few stars' };

  const raw = writeCourse(`Generated #${seed} B${budget}`, layout.width, layout.height, tiles, start, exit, quota, objects);
  const parsed = parseCourse(raw);
  if (!parsed.ok) return { ok: false, reason: `bad course: ${parsed.errors[0]}` };
  return {
    ok: true,
    raw,
    course: parsed.course,
    meta: {
      seed,
      budget,
      attempt,
      layout,
      spend,
      enemies: enemyCount,
      stars,
      spots: spots.map((s) => ({ kind: s.kind, x: s.at[0], y: s.at[1], used: s.used })),
    },
  };
}

const LEGEND_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Write tiles and objects as an ordinary course file (format 2). */
export function writeCourse(
  name: string,
  width: number,
  height: number,
  tiles: readonly (ChunkTile | null)[],
  start: Point,
  exit: Point,
  quota: number,
  objects: readonly PlacedObject[],
): Record<string, unknown> {
  const legend: Record<string, unknown> = {};
  const keys = new Map<string, string>();
  const letter = (t: ChunkTile) => {
    const k = `${t.surface}|${t.dir ?? ''}`;
    let c = keys.get(k);
    if (!c) {
      c = LEGEND_CHARS[keys.size]!;
      keys.set(k, c);
      legend[c] = t.dir ? { surface: t.surface, dir: t.dir } : t.surface;
    }
    return c;
  };
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    const row: string[] = [];
    for (let x = 0; x < width; x++) {
      const t = tiles[y * width + x];
      if (!t) row.push('.');
      else {
        const [a, b, c, d] = t.corners;
        row.push(letter(t) + (a === b && b === c && c === d ? `${a}` : `${a}${b}${c}${d}`));
      }
    }
    rows.push(row.join(' '));
  }
  return {
    format: 2,
    name,
    legend,
    tiles: rows,
    start: [start[0], start[1]],
    exit: [exit[0], exit[1]],
    quota,
    objects: objects.map((o) => ({
      id: o.id,
      at: [o.at[0], o.at[1]],
      ...(o.path && o.path.length && { path: o.path.map((p) => [p[0], p[1]]) }),
      ...(o.facing && { facing: o.facing }),
      ...(o.phase !== undefined && { phase: Math.round(o.phase * 100) / 100 }),
      ...(o.orient && { orient: o.orient }),
      ...(o.drops && { drops: o.drops }),
    })),
  };
}
