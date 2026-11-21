/**
 * Walkable places (Milestone 8b design sheet, docs/plans/milestone-8b.md;
 * owner, 2026-11-21): the town, the crossroads and the cache clearing, walked
 * with the armadillo between courses.
 *
 * A place file (src/content/places/*.json) is a course-format "ground" (heights,
 * tiles, rails used as fences, blocker objects such as rocks and stumps, and
 * scenery) plus place-only "props" (buildings, lamps, signposts) and
 * "triggers" (doors and path ends). See src/sim/place.ts for the format.
 *
 * Adding a new prop is an entry here plus a placeholder sprite; no logic changes.
 */
import type { ObjectShape } from './objects.ts';

/** Walking numbers (sheet section 1.3). */
export const WALK = {
  /** Tiles per second, measured along the ground. */
  speed: 3,
  /** Shift runs at this many times the walking speed. */
  runFactor: 1.6,
  /** The armadillo's feet: a circle this many tiles across from its centre. */
  radius: 0.15,
  /** The biggest step up or down it walks, in height steps (a quarter tile each). */
  maxStep: 1,
  /** Walking frames: one step every this many seconds. */
  stepSeconds: 0.16,
  /**
   * How close the camera is (sheet section 1.5): 2 is every art pixel drawn 2 by 2.
   * Owner, 2026-11-21: "a hair too zoomed in", so 1.5. A whole number keeps every pixel the same size.
   */
  cameraZoom: 1.5,
} as const;

/** Ground the armadillo walks on. Water, spikes and pads block it. */
export const WALKABLE_SURFACES: ReadonlySet<string> = new Set(['grass', 'rough', 'sand', 'ice', 'bridge', 'path']);

/** A place-only thing: a building, a lamp, a signpost. */
export interface PropDef {
  readonly id: string;
  readonly name: string;
  /** Manifest sprite id. Its anchor is the centre of the footprint, on the ground. */
  readonly sprite: string;
  /** What the armadillo bumps into, centred on the prop's spot, in tiles. null: walk through it. */
  readonly footprint: ObjectShape | null;
  /** Recoloured with the place's theme (round 2b themes). */
  readonly themed?: boolean;
}

export const PROP_LIST: readonly PropDef[] = [
  { id: 'food-hut', name: 'Food shop', sprite: 'place-food-hut', footprint: { kind: 'box', hx: 0.95, hy: 0.95 } },
  { id: 'gear-shop', name: 'Gear shop', sprite: 'place-gear-shop', footprint: { kind: 'box', hx: 0.95, hy: 0.95 } },
  { id: 'burrow', name: 'Your Burrow', sprite: 'place-burrow', footprint: { kind: 'box', hx: 0.95, hy: 0.95 } },
  { id: 'signpost', name: 'Signpost', sprite: 'place-signpost', footprint: { kind: 'round', r: 0.12 } },
  { id: 'lamp', name: 'Lamp post', sprite: 'place-lamp', footprint: { kind: 'round', r: 0.1 } },
  { id: 'barrel', name: 'Barrel', sprite: 'place-barrel', footprint: { kind: 'round', r: 0.22 } },
  { id: 'boss-gate', name: 'Boss gate', sprite: 'place-boss-gate', footprint: { kind: 'box', hx: 1, hy: 1 } },
  { id: 'chest', name: 'Chest', sprite: 'place-chest', footprint: { kind: 'box', hx: 0.3, hy: 0.3 } },
  { id: 'practice-flag', name: 'Practice flag', sprite: 'place-practice-flag', footprint: { kind: 'round', r: 0.06 } },
  { id: 'tee-mat', name: 'Tee mat', sprite: 'place-tee-mat', footprint: null },
];

export const PROPS: ReadonlyMap<string, PropDef> = new Map(PROP_LIST.map((p) => [p.id, p]));

/**
 * What stepping onto a trigger does (sheet section 1.4).
 * - food, gear, burrow: open that place's flat screen.
 * - exit: leave the town (asks first).
 * - tee: start the practice course.
 * - chest: open the cache's pick.
 * - path: go to the node on that path (crossroads; `slot` says which path).
 * - gate: the boss gate (crossroads; replaces a path end when the boss is on that path).
 * - back: back to the crossroads (the cache clearing, after the pick).
 */
export const TRIGGER_KINDS = ['food', 'gear', 'burrow', 'exit', 'tee', 'chest', 'path', 'gate', 'back'] as const;
export type TriggerKind = (typeof TRIGGER_KINDS)[number];

export const PLACE_KINDS = ['town', 'crossroads', 'cache'] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** The practice green's course (sheet section 2.3). */
export const PRACTICE_COURSE = 'practice-green';
