/**
 * Things placed on a course tile: pickups (FEATURES.md section 13), static
 * blockers (section 6) and enemies (section 4). A course file lists them under
 * "objects" by id; see src/sim/course.ts.
 *
 * Adding a new blocker, pickup or simple enemy is a new entry here plus a
 * placeholder sprite in tools/make-placeholder-art.ts. No logic changes.
 */
import type { BaseStats } from './stats.ts';

/**
 * The footprint the ball collides with, centred on the tile, in tiles.
 * round: a circle (rocks, posts, enemies). box: a square or rectangle.
 */
export type ObjectShape = { readonly kind: 'round'; readonly r: number } | { readonly kind: 'box'; readonly hx: number; readonly hy: number };

export interface PickupDef {
  readonly kind: 'pickup';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** What touching it gives. */
  readonly effect: 'yellowStar' | 'heart' | 'shotOrb';
  /** Stars are gathered from further away (the "star reach" stat); others need a touch. */
  readonly usesStarReach: boolean;
}

export interface BlockerDef {
  readonly kind: 'blocker';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  readonly shape: ObjectShape;
  /** Height in tiles. A ball flying higher than this passes over. */
  readonly height: number;
  /** Fraction of speed kept when the ball bounces off it. */
  readonly bounce: number;
  /** Generator cost (Milestone 5). */
  readonly cost: number;
}

/** What an enemy does for each sentinel trigger (DESIGN.md section 8). */
export type TriggerResponse = 'none' | 'immediate' | 'activated';

export interface EnemyDef {
  readonly kind: 'enemy';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  readonly family: 'sentinel' | 'patroller';
  readonly tier: number;
  readonly stats: BaseStats;
  /** Yellow stars dropped when defeated. */
  readonly starValue: number;
  readonly shape: ObjectShape;
  readonly height: number;
  /** Fraction of speed kept when the ball bounces off it (it survived the hit). */
  readonly bounce: number;
  readonly triggers: { readonly hit: TriggerResponse; readonly rest: TriggerResponse; readonly passBy: TriggerResponse };
  /** Generator cost (Milestone 5). */
  readonly cost: number;
}

export type ObjectDef = PickupDef | BlockerDef | EnemyDef;

const defs: readonly ObjectDef[] = [
  // Pickups (section 13). Blue stars come with permanent progress in Milestone 7.
  { kind: 'pickup', id: 'yellow-star', name: 'Yellow star', sprite: 'star-yellow', effect: 'yellowStar', usesStarReach: true },
  { kind: 'pickup', id: 'heart', name: 'Heart', sprite: 'heart', effect: 'heart', usesStarReach: false },
  { kind: 'pickup', id: 'shot-orb', name: 'Shot orb', sprite: 'shot-orb', effect: 'shotOrb', usesStarReach: false },

  // Static blockers (section 6).
  { kind: 'blocker', id: 'rock', name: 'Rock', sprite: 'rock', shape: { kind: 'round', r: 0.38 }, height: 0.5, bounce: 0.6, cost: 1 },
  { kind: 'blocker', id: 'post', name: 'Post', sprite: 'post', shape: { kind: 'round', r: 0.14 }, height: 1.5, bounce: 0.75, cost: 1 },
  { kind: 'blocker', id: 'low-wall', name: 'Low wall', sprite: 'low-wall', shape: { kind: 'box', hx: 0.5, hy: 0.5 }, height: 0.25, bounce: 0.6, cost: 1 },

  // Enemies (section 4). Mossback: a sentinel that never acts. A plain target.
  {
    kind: 'enemy',
    id: 'mossback',
    name: 'Mossback',
    sprite: 'mossback',
    family: 'sentinel',
    tier: 1,
    stats: { health: 1, attackDamage: 0, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    shape: { kind: 'round', r: 0.3 },
    height: 0.6,
    bounce: 0.6,
    triggers: { hit: 'none', rest: 'none', passBy: 'none' },
    cost: 1,
  },
];

export const OBJECTS: ReadonlyMap<string, ObjectDef> = new Map(defs.map((d) => [d.id, d]));
