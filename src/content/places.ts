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
   * Owner, 2026-11-21: "a hair too zoomed in", so 1.5; owner, 2026-11-22: 1.25. A whole number keeps every pixel the same size.
   */
  cameraZoom: 1.25,
} as const;

/**
 * Owner, 2026-11-23: a course opens close in on the ball, at the walking
 * camera's zoom, then zooms out to the normal view; the round begins when
 * the zoom ends (no shots, no enemy movement until then).
 */
export const COURSE_INTRO = {
  /** Starting zoom: the same as walking, so the change from a place to a course feels continuous. */
  zoom: WALK.cameraZoom,
  /**
   * Owner, 2026-11-26: the hero drops in from the sky as a ball (replaces the
   * plain 400 ms hold). It falls from above the top of the screen onto the
   * start, makes one small bounce, stands up, and then the zoom out starts.
   */
  /** The fall from out of sight onto the start (ms). */
  fallMs: 520,
  /** The small bounce after landing: time in the air (ms) and height (screen pixels). */
  bounceMs: 200,
  bouncePx: 4,
  /** Standing on its feet before the zoom out starts (ms). */
  standMs: 300,
  /** Time the zoom out takes (ms). Owner, 2026-11-26: 1200 (was 800, felt too fast). */
  zoomMs: 1200,
} as const;

/**
 * Owner, 2026-11-26: the blast-door hatch. Finishing a course, the hero jumps
 * straight up off the hatch, pops into a ball as the doors open, drops
 * through and the doors shut. Arriving at the crossroads, a hatch there opens,
 * the ball pops up out of it, the doors shut under it and the hero lands on
 * them, standing. Display only: the course is already won when this plays.
 * Times in ms, heights in screen pixels (before the camera zoom).
 */
export const HATCH = {
  /** Course: the jump straight up, standing. */
  jumpMs: 280,
  jumpPx: 26,
  /** Course: at the top, the hero curls into a ball while the doors slide open. */
  hangMs: 220,
  /** Course: the fall through the open hatch, out of sight. */
  dropMs: 320,
  /** Course: the doors close again; then the course-complete card shows. */
  closeMs: 260,
  /** Crossroads: the doors open before the ball pops out. */
  openMs: 260,
  /** Crossroads: the ball shoots up out of the shaft. */
  popMs: 320,
  popPx: 30,
  /** Crossroads: at the top the hero uncurls while the doors close. */
  turnMs: 200,
  /** Crossroads: the fall onto the closed hatch, landing on its feet. */
  landMs: 260,
  /** How fast the green lights chase round the rim. */
  lightMs: 260,
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
  // Owner, 2026-11-22: a post on each side of a path's far end, marking the way into the next course.
  { id: 'path-post', name: 'Path post', sprite: 'place-path-post', footprint: { kind: 'round', r: 0.1 } },
  { id: 'tee-mat', name: 'Tee mat', sprite: 'place-tee-mat', footprint: null },
  // Owner, 2026-11-26: the hatch the hero pops out of at the crossroads (flat, walked over).
  { id: 'arrival-hatch', name: 'Arrival hatch', sprite: 'exit', footprint: null },
];

export const PROPS: ReadonlyMap<string, PropDef> = new Map(PROP_LIST.map((p) => [p.id, p]));

/**
 * What stepping onto a trigger does (sheet section 1.4).
 * - food, gear, burrow: open that place's flat screen.
 * - exit: leave the town (asks first).
 * - tee: start the practice course.
 * - chest: open the cache's pick (owner, 2026-11-22: by pressing Enter while next to the chest, not by walking into it).
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
