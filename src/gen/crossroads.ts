/**
 * Builds a crossroads (Milestone 8b design sheet section 3.2): one of three
 * hand-made templates (1, 2 or 3 paths), with props and scenery scattered by
 * the seeded random number generator from the run seed and the node, so the
 * same run always looks the same. Adds a signpost at the start of each path,
 * and the boss gate at the end of the boss's path.
 */
import { PLACE_FILES } from '../content/places/index.ts';
import { parsePlace, type Place, type Point } from '../sim/place.ts';
import { Rng } from '../sim/rng.ts';

/** Which template paths the choices use, left to right (sheet section 3.2). */
export function slotsFor(count: number): number[] {
  return count <= 1 ? [1] : count === 2 ? [0, 2] : [0, 1, 2];
}

export interface CrossroadsSpec {
  /** Run seed plus where in the run this is; the same text gives the same crossroads. */
  readonly seed: string;
  /** How many choices (1 to 3). */
  readonly count: number;
  /** Which choice is the boss, if any. */
  readonly boss: number | null;
  /** Blockers to scatter, with weights (biome look). */
  readonly blockers?: Readonly<Record<string, number>>;
}

export interface Crossroads {
  readonly place: Place;
  /** Each choice's signpost, by choice index. */
  readonly signs: readonly Point[];
}

const SCENERY_WEIGHTS: Readonly<Record<string, number>> = { tuft: 4, flowers: 3, pebbles: 2, mushrooms: 1, leaves: 1, fireflies: 0.5 };
const BLOCKERS: Readonly<Record<string, number>> = { rock: 2, stump: 2, 'dead-tree': 1 };
/** Share of free tiles that get a blocker, and of grass tiles that get scenery. */
const BLOCKER_CHANCE = 0.22;
const SCENERY_CHANCE = 0.3;

interface RawGround {
  tiles: string[];
  start: [number, number];
  exit: [number, number];
  objects: { id: string; at: [number, number] }[];
  scenery: [string, number, number][];
}

function pickWeighted(rng: Rng, weights: Readonly<Record<string, number>>): string {
  const ids = Object.keys(weights);
  return ids[rng.weighted(ids.map((k) => weights[k]!))]!;
}

export function buildCrossroads(spec: CrossroadsSpec): Crossroads {
  const count = Math.max(1, Math.min(3, spec.count));
  const raw = JSON.parse(JSON.stringify(PLACE_FILES[`crossroads-${count}`])) as {
    ground: RawGround;
    props: { id: string; at: [number, number] }[];
    triggers: Record<string, unknown>[];
    slots: { end: Record<string, unknown>; gate: Record<string, unknown>; gateAt: [number, number]; sign: [number, number]; posts?: [number, number][] }[];
  };
  const rng = Rng.fromSeed(`${spec.seed}/crossroads`);
  const used = slotsFor(count);
  const g = raw.ground;
  const cells = g.tiles.map((r) => r.split(' '));
  const surface = (x: number, y: number) => cells[y]?.[x]?.[0];

  // Props and triggers for each choice.
  const keepClear: Point[] = [];
  used.forEach((slot, choice) => {
    const s = raw.slots[slot]!;
    raw.props.push({ id: 'signpost', at: s.sign });
    keepClear.push({ x: s.sign[0], y: s.sign[1] });
    if (choice === spec.boss) {
      raw.props.push({ id: 'boss-gate', at: s.gateAt });
      raw.triggers.push({ ...s.gate, kind: 'gate', slot: choice });
      keepClear.push({ x: s.gateAt[0], y: s.gateAt[1] });
    } else {
      raw.triggers.push({ ...s.end, kind: 'path', slot: choice });
      // Owner, 2026-11-22: a post either side of the path's far end, the way into the next course.
      for (const p of s.posts ?? []) {
        raw.props.push({ id: 'path-post', at: p });
        keepClear.push({ x: p[0], y: p[1] });
      }
    }
  });

  // Scatter: blockers away from paths and props; scenery on grass.
  const nearPath = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (surface(x + dx, y + dy) === 'p') return true;
    return false;
  };
  const nearProp = (x: number, y: number) => keepClear.some((p) => Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) < 1.8);
  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y]!.length; x++) {
      if (surface(x, y) !== 'g') continue;
      const special = (x === g.start[0] && y === g.start[1]) || (x === g.exit[0] && y === g.exit[1]);
      if (!special && !nearPath(x, y) && !nearProp(x, y) && rng.chance(BLOCKER_CHANCE)) {
        g.objects.push({ id: pickWeighted(rng, spec.blockers ?? BLOCKERS), at: [x, y] });
        continue;
      }
      if (rng.chance(SCENERY_CHANCE)) g.scenery.push([pickWeighted(rng, SCENERY_WEIGHTS), x + rng.float(0.2, 0.8), y + rng.float(0.2, 0.8)]);
    }
  }
  const res = parsePlace(raw);
  if (!res.ok) throw new Error(`Crossroads did not build: ${res.errors.join(' ')}`);
  return { place: res.place, signs: used.map((slot) => ({ x: raw.slots[slot]!.sign[0], y: raw.slots[slot]!.sign[1] })) };
}

/** A hand-built place by file id (towns, the cache clearing). */
export function loadPlace(id: string): Place {
  const res = parsePlace(PLACE_FILES[id]);
  if (!res.ok) throw new Error(`Place ${id}: ${res.errors.join(' ')}`);
  return res.place;
}
