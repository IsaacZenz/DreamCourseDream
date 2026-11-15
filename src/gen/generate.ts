/**
 * Course generator, part 2 (Milestone 5b design sheet, section 5.7): spend the
 * difficulty budget on enemies (in squads, busier towards the end of the
 * journey), obstacles and hazard pads, put loot in side pockets, set the
 * quota, and write an ordinary course file (format 3). The ground comes from
 * journey.ts. `generateAttempt` makes one try; validate.ts checks and retries.
 */
import { GEN } from '../content/gen.ts';
import { OBJECTS, type EnemyDef } from '../content/objects.ts';
import { DIRECTIONS, SURFACES, type Direction } from '../content/surfaces.ts';
import { heightChar, parseCourse, segmentsTouch, type Course } from '../sim/course.ts';
import { Rng } from '../sim/rng.ts';
import { shapeOf, type Corners } from '../sim/tileShape.ts';
import { buildTerrain, type Point, type Terrain, type TileSpec } from './journey.ts';

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
  readonly terrain: Terrain;
  readonly spend: Spend;
  readonly enemies: number;
  readonly stars: number;
}

export type AttemptResult = { ok: true; raw: Record<string, unknown>; course: Course; meta: GenMeta } | { ok: false; reason: string };

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

function weighted<T>(rng: Rng, items: readonly { item: T; weight: number }[]): T | null {
  const total = items.reduce((n, i) => n + i.weight, 0);
  if (total <= 0) return null;
  let r = rng.float(0, total);
  for (const i of items) if ((r -= i.weight) < 0) return i.item;
  return items[items.length - 1]!.item;
}

/** The stream of random numbers for one attempt. */
export function attemptRng(seed: string, budget: number, attempt: number): Rng {
  return Rng.fromSeed(`gen/${seed}/${budget}/${attempt}`);
}

export function generateAttempt(seed: string, budget: number, attempt: number): AttemptResult {
  const rng = attemptRng(seed, budget, attempt);
  const tr = buildTerrain(rng.fork('terrain'), budget);
  if (!tr.ok) return tr;
  const terrain = tr.terrain;
  const place = rng.fork('place');
  const { width, height, start, exit } = terrain;
  const tiles = terrain.tiles.slice();
  const tileAt = (p: Point) => (p[0] < 0 || p[1] < 0 || p[0] >= width || p[1] >= height ? null : tiles[p[1] * width + p[0]]);
  const regionAt = (p: Point) => terrain.region[p[1] * width + p[0]] ?? -1;
  const used = new Set<string>(terrain.reserved);
  const objects: PlacedObject[] = [];
  const spend: Spend = { terrain: terrain.terrainCost, enemies: 0, obstacles: 0, hazards: 0 };

  // ---- Where things may go (sheet section 5.7) -------------------------------
  const islandKeys = new Set(terrain.islands.map(key));
  // Nothing within two tiles of a passage, so ramps, causeways and gap landings stay clear.
  const nearPassage = (p: Point) =>
    terrain.regions.some((r) => r.kind === 'passage' && p[0] >= r.rect.x - 2 && p[0] < r.rect.x + r.rect.w + 2 && p[1] >= r.rect.y - 2 && p[1] < r.rect.y + r.rect.h + 2);
  const ok = (p: Point) => {
    const t = tileAt(p);
    if (!t || used.has(key(p))) return false;
    if (dist(p, start) <= GEN.startClear || near(p, exit, 1)) return false;
    if (!SURFACES.get(t.surface)?.canHoldBall) return false;
    const sh = shapeOf(t.corners);
    if (!sh || sh.includes('2')) return false;
    const r = terrain.regions[regionAt(p)];
    if (!r || r.kind === 'passage' || nearPassage(p)) return false;
    if (islandKeys.has(key(p))) return true;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!tileAt([p[0] + dx, p[1] + dy])) return false;
    return true;
  };
  const tilesOf = (ri: number): Point[] => {
    const r = terrain.regions[ri]!.rect;
    const out: Point[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (regionAt([x, y]) === ri) out.push([x, y]);
    return out;
  };
  const areaIdx = terrain.regions.map((r, i) => ({ r, i })).filter((a) => a.r.kind === 'area').map((a) => a.i);
  const pocketIdx = terrain.regions.map((r, i) => ({ r, i })).filter((a) => a.r.kind === 'pocket').map((a) => a.i);

  /** Straight runs of 3 to 5 free tiles inside one area, crossing no rail: lanes for Trundlers, sliding blocks and drifting clouds. */
  const lanes = (ri: number): Point[][] => {
    const out: Point[][] = [];
    for (const p of tilesOf(ri)) {
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        const len = place.int(3, 5);
        const run: Point[] = [];
        for (let k = 0; k < len; k++) run.push([p[0] + dx * k, p[1] + dy * k]);
        if (!run.every((q) => ok(q) && regionAt(q) === ri)) continue;
        // No cliff along the lane: neighbouring tiles at most half a tile apart.
        if (run.some((q, j) => j > 0 && Math.abs(Math.min(...tileAt(q)!.corners) - Math.min(...tileAt(run[j - 1]!)!.corners)) > 2)) continue;
        const a = { x: run[0]![0], y: run[0]![1] };
        const b = { x: run[len - 1]![0], y: run[len - 1]![1] };
        const crosses = terrain.rails.some((line) => line.slice(1).some((q, j) => segmentsTouch(a, b, { x: line[j]![0], y: line[j]![1] }, { x: q[0], y: q[1] })));
        if (!crosses) out.push(run);
      }
    }
    return out;
  };

  // ---- Enemies: squads, busier towards the end ------------------------------
  const afterTerrain = budget - spend.terrain;
  let enemyLeft = Math.min(afterTerrain, Math.max(Math.ceil(budget * GEN.enemyShare), Math.ceil(afterTerrain * GEN.enemyOfRest)));
  let enemyCount = 0;
  const enemySafe = (def: EnemyDef, p: Point) => {
    if (!ok(p)) return false;
    const outer = def.stats.outerRadius ?? 0;
    if (def.family === 'sentinel' && outer > 0 && dist(p, start) <= outer + 0.5) return false;
    if (def.behaviour.kind === 'burrow') {
      const t = tileAt(p)!;
      if (!['grass', 'rough'].includes(t.surface) || shapeOf(t.corners) !== '0000') return false;
    }
    return true;
  };
  const placeEnemy = (id: string, p: Point, path?: Point[]) => {
    const def = OBJECTS.get(id) as EnemyDef;
    if (path) {
      objects.push({ id, at: p, path: path.slice(1).length ? [path[path.length - 1]!] : [], phase: place.float(0, 1) });
      for (const q of path) used.add(key(q));
    } else objects.push({ id, at: p, facing: place.pick(DIRECTIONS) });
    used.add(key(p));
    enemyLeft -= def.cost;
    spend.enemies += def.cost;
    enemyCount++;
  };

  // Ability carrier (60%) in the first or second area.
  let carrier: string | null = null;
  if (place.chance(GEN.carrierChance)) {
    const id = place.pick(GEN.carriers);
    const def = OBJECTS.get(id) as EnemyDef;
    const spots = areaIdx.slice(0, 2).flatMap(tilesOf).filter((p) => enemySafe(def, p));
    if (spots.length && def.cost <= enemyLeft) {
      placeEnemy(id, place.pick(spots));
      carrier = id;
    }
  }

  // Share the rest across areas, rising along the trail.
  const weights = areaIdx.map((_, k) => 1 + k * GEN.areaWeightRise);
  const total = weights.reduce((a, b) => a + b, 0);
  let carry = 0;
  // Fill from the end of the journey back, so later (busier) areas get their share before the enemy cap is reached.
  const budgetForAreas = enemyLeft;
  [...areaIdx.entries()].reverse().forEach(([k, ri], n) => {
    let share = Math.round((budgetForAreas * weights[k]!) / total) + carry;
    if (n === areaIdx.length - 1) share = enemyLeft;
    const startLeft = enemyLeft;
    const areaTiles = [...tilesOf(ri), ...terrain.islands.filter((p) => regionAt(p) === ri)];
    for (let guard = 0; guard < 8 && share > 0 && enemyCount < GEN.maxEnemies; guard++) {
      // A squad round an anchor tile.
      const free = areaTiles.filter((p) => ok(p));
      if (!free.length) break;
      const anchor = place.pick(free);
      const size = place.int(GEN.squadMin, GEN.squadMax);
      let added = 0;
      for (let m = 0; m < size && share > 0 && enemyCount < GEN.maxEnemies; m++) {
        const reserve = Math.max(0, GEN.minEnemies - enemyCount - 1);
        const choices: { item: () => void; weight: number }[] = [];
        for (const [id, weight] of Object.entries(GEN.enemyWeights)) {
          const def = OBJECTS.get(id) as EnemyDef | undefined;
          if (!def || def.cost > Math.min(share, enemyLeft - reserve)) continue;
          if (def.behaviour.kind === 'patrol') {
            const ls = lanes(ri).filter((l) => dist(l[0]!, anchor) <= 5);
            if (ls.length) {
              const lane = place.pick(ls);
              choices.push({ weight, item: () => placeEnemy(id, lane[0]!, lane) });
            }
          } else {
            const spots = areaTiles.filter((p) => dist(p, anchor) <= 4 && enemySafe(def, p));
            if (spots.length) {
              const p = place.pick(spots);
              choices.push({ weight, item: () => placeEnemy(id, p) });
            }
          }
        }
        const pick = weighted(place, choices);
        if (!pick) break;
        const before = enemyLeft;
        pick();
        share -= before - enemyLeft;
        added++;
      }
      if (!added) break;
    }
    carry = Math.max(0, share);
    void startLeft;
  });
  if (enemyCount < GEN.minEnemies) return { ok: false, reason: 'too few enemies' };

  // ---- Obstacles and hazard pads -------------------------------------------
  let left = budget - spend.terrain - spend.enemies;
  const costOf = (id: string) => {
    const d = OBJECTS.get(id);
    return d && 'cost' in d ? d.cost : 99;
  };
  const cloud = OBJECTS.get('thunder-cloud');
  const cloudCost = cloud?.kind === 'cloud' ? cloud.cost : 2;
  const driftCost = cloud?.kind === 'cloud' ? cloud.driftCost : 3;
  const allArea = areaIdx.flatMap(tilesOf);
  for (let guard = 0; guard < 40 && left > 0; guard++) {
    const free = allArea.filter((p) => ok(p));
    if (!free.length) break;
    const p = place.pick(free);
    const W = GEN.obstacleWeights;
    const options: { item: () => void; weight: number }[] = [];
    const blocker = place.pick(GEN.blockers);
    if (costOf(blocker) <= left) options.push({ weight: W.blocker!, item: () => { objects.push({ id: blocker, at: p }); spend.obstacles += costOf(blocker); used.add(key(p)); } });
    const crate = place.chance(0.3) ? 'secured-crate' : 'crate';
    if (costOf(crate) <= left) {
      options.push({
        weight: W.crate!,
        item: () => {
          const o: PlacedObject = { id: crate, at: p };
          if (crate === 'crate' && place.chance(GEN.crateHeartChance)) o.drops = ['heart'];
          objects.push(o);
          spend.obstacles += costOf(crate);
          used.add(key(p));
        },
      });
    }
    if (cloudCost <= left) options.push({ weight: W.cloud!, item: () => { objects.push({ id: 'thunder-cloud', at: p }); spend.obstacles += cloudCost; used.add(key(p)); } });
    const ri = regionAt(p);
    const ls = lanes(ri).filter((l) => key(l[0]!) === key(p));
    if (ls.length) {
      const lane = ls[0]!;
      if (driftCost <= left) options.push({ weight: W.cloud!, item: () => { objects.push({ id: 'thunder-cloud', at: p, path: [lane[lane.length - 1]!], phase: place.float(0, 1) }); spend.obstacles += driftCost; for (const q of lane) used.add(key(q)); } });
      if (costOf('sliding-block') <= left) options.push({ weight: W.slider!, item: () => { objects.push({ id: 'sliding-block', at: p, path: [lane[lane.length - 1]!], phase: place.float(0, 1) }); spend.obstacles += costOf('sliding-block'); for (const q of lane) used.add(key(q)); } });
    }
    if (carrier === 'anchorback' && costOf('cracked-tile') <= left) options.push({ weight: W.crack!, item: () => { objects.push({ id: 'cracked-tile', at: p }); spend.obstacles += costOf('cracked-tile'); used.add(key(p)); } });
    // Hazard pads on flat tiles, never next to the start.
    const t = tileAt(p)!;
    if (shapeOf(t.corners) === '0000' && !near(p, start, 1)) {
      const hz = [...SURFACES.values()].filter((s) => s.cost !== undefined && s.cost <= left && s.id !== 'warp');
      if (hz.length) {
        const s = place.pick(hz);
        options.push({
          weight: W.hazard!,
          item: () => {
            const nt: TileSpec = { surface: s.id, corners: t.corners.map((c) => c + (s.raise ?? 0)) as unknown as Corners, ...(s.needsDir && { dir: place.pick(DIRECTIONS) }) };
            tiles[p[1] * width + p[0]] = nt;
            spend.hazards += s.cost!;
            used.add(key(p));
          },
        });
      }
    }
    const pick = weighted(place, options);
    if (!pick) break;
    pick();
    left = budget - spend.terrain - spend.enemies - spend.obstacles - spend.hazards;
  }

  // ---- Loot in side pockets (free), and a free shot orb ---------------------
  for (const pi of pocketIdx) {
    const spots = tilesOf(pi).filter((p) => ok(p) || (!used.has(key(p)) && tileAt(p) && dist(p, start) > GEN.startClear));
    if (!spots.length) continue;
    const p = spots[Math.floor(spots.length / 2)]!;
    const loot = place.pick(['crate', 'secured-crate', 'shot-orb']);
    objects.push({ id: loot, at: p });
    used.add(key(p));
  }
  if (place.chance(GEN.shotOrbChance)) {
    const free = allArea.filter((p) => ok(p));
    if (free.length) {
      const p = place.pick(free);
      objects.push({ id: 'shot-orb', at: p });
      used.add(key(p));
    }
  }

  // ---- Quota: cracked-tile stars are a bonus ---------------------------------
  let stars = 0;
  for (const o of objects) {
    const def = OBJECTS.get(o.id);
    if (def?.kind === 'enemy') stars += def.starValue;
    else if (def?.kind === 'breakable' && def.breakBy === 'hit') stars += (o.drops ?? def.drops).filter((d) => d === 'yellow-star').length;
  }
  if (stars < GEN.minQuota) return { ok: false, reason: 'too few stars' };
  const quota = Math.min(stars, Math.max(GEN.minQuota, Math.round(stars * GEN.quotaShare)));

  const raw = writeCourse(`Generated #${seed} B${budget}`, width, height, tiles, start, exit, quota, objects, terrain.rails);
  const parsed = parseCourse(raw);
  if (!parsed.ok) return { ok: false, reason: `bad course: ${parsed.errors[0]}` };
  return { ok: true, raw, course: parsed.course, meta: { seed, budget, attempt, terrain, spend, enemies: enemyCount, stars } };
}

const LEGEND_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Write tiles, objects and rails as an ordinary course file (format 3). */
export function writeCourse(
  name: string,
  width: number,
  height: number,
  tiles: readonly (TileSpec | null)[],
  start: Point,
  exit: Point,
  quota: number,
  objects: readonly PlacedObject[],
  rails: readonly (readonly Point[])[] = [],
): Record<string, unknown> {
  const legend: Record<string, unknown> = {};
  const keys = new Map<string, string>();
  const letter = (t: TileSpec) => {
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
        row.push(letter(t) + (a === b && b === c && c === d ? heightChar(a) : [a, b, c, d].map(heightChar).join('')));
      }
    }
    rows.push(row.join(' '));
  }
  return {
    format: 3,
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
    ...(rails.length && { rails: rails.map((l) => l.map((p) => [p[0], p[1]])) }),
  };
}
