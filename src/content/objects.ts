/**
 * Things placed on a course tile (FEATURES.md sections 4, 6 and 13): pickups,
 * static blockers, moving obstacles, breakables, thunder clouds and enemies.
 * A course file lists them under "objects" by id; see src/sim/course.ts.
 *
 * Adding a new blocker, pickup, obstacle or enemy that reuses an existing
 * behaviour is a new entry here plus a placeholder sprite in
 * tools/make-placeholder-art.ts. No logic changes.
 *
 * Every number is a starting value (Milestone 4 design sheet,
 * docs/plans/milestone-4.md, signed off by the owner 2026-11-14).
 */
import type { BaseStats } from './stats.ts';

/**
 * The footprint the ball collides with, centred on the tile, in tiles.
 * round: a circle (rocks, posts, enemies). box: a square or rectangle.
 */
export type ObjectShape = { readonly kind: 'round'; readonly r: number } | { readonly kind: 'box'; readonly hx: number; readonly hy: number };

/** Elements (FEATURES.md section 2, open question F5 default). */
export type Element = 'fire' | 'ice' | 'shock';

/** Where a hit lands, for weak spots and guarded sides (FEATURES.md section 2). */
export type Side = 'above' | 'behind' | 'front';

export interface PickupDef {
  readonly kind: 'pickup';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** What touching it gives. A wild gives a random ability (owner, 2026-11-14). */
  readonly effect: 'yellowStar' | 'heart' | 'shotOrb' | 'wild';
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

/** Moving obstacles (FEATURES.md section 6): cannot be defeated, move in real time. */
export type MoverMotion =
  /** Follows the placement's `path` there and back. */
  | { readonly kind: 'path'; readonly speed: number }
  /** A gate: open for `open` seconds, closed for `closed` seconds, repeating. */
  | { readonly kind: 'gate'; readonly open: number; readonly closed: number };

export interface MoverDef {
  readonly kind: 'mover';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  readonly motion: MoverMotion;
  /** For a gate, the shape with orient "x"; orient "y" swaps hx and hy. */
  readonly shape: ObjectShape;
  readonly height: number;
  readonly bounce: number;
  /** Extra speed a ball is pushed away with when this runs into it (owner, 2026-11-14: fixed-route things knock the ball). 0 for a plain bounce. */
  readonly knock: number;
  readonly cost: number;
}

/** Destructibles (FEATURES.md section 6). */
export interface BreakableDef {
  readonly kind: 'breakable';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** Hits to break it (through the damage steps). */
  readonly health: number;
  /** "hit": any hit from the ball. "anchor": only the ball stopping on it after using Anchor. */
  readonly breakBy: 'hit' | 'anchor';
  /** Pickup ids dropped when it breaks, unless the placement lists its own `drops`. */
  readonly drops: readonly string[];
  /** Chance of also dropping a Wild, times the ball's drop luck (owner, 2026-11-14: secured crates). */
  readonly wildChance: number;
  /** Null: flat on the floor, nothing to bump (cracked tile). */
  readonly shape: ObjectShape | null;
  readonly height: number;
  readonly bounce: number;
  readonly cost: number;
}

/** The thunder cloud (FEATURES.md section 6, owner decisions 2026-11-14). */
export interface CloudDef {
  readonly kind: 'cloud';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** Half the size of the square it covers, in tiles. */
  readonly half: number;
  /** The danger zone reaches this high above the ground, in tiles. */
  readonly zapHeight: number;
  readonly damage: number;
  /** A zapped ball (or rolling enemy) is thrown this fast in a random direction, with this upward speed. */
  readonly throwSpeed: number;
  readonly throwHop: number;
  /** Speed along its path when it drifts. */
  readonly driftSpeed: number;
  readonly cost: number;
  readonly driftCost: number;
}

/** The flag pole a defeated enemy leaves (FEATURES.md section 6). Not placed in course files. */
export interface FlagDef {
  readonly kind: 'flag';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  readonly shape: ObjectShape;
  readonly height: number;
  readonly bounce: number;
}

/** What an enemy does for each sentinel trigger (DESIGN.md section 8). */
export type TriggerResponse = 'none' | 'immediate' | 'activated';

/**
 * Enemy behaviours. A new enemy that mixes these with new numbers is a data
 * entry only; a truly new kind of behaviour needs code once.
 */
export type Behaviour =
  | { readonly kind: 'none' }
  /**
   * Patroller: follows its `path` there and back at `speed`, all the time. It keeps
   * to its path when it meets the ball and knocks the ball away with `knock` extra
   * speed (owner, 2026-11-14).
   */
  | { readonly kind: 'patrol'; readonly speed: number; readonly knock: number }
  /**
   * Marks the ball's spot with a ring; next enemy turn lobs a seed at it. The seed
   * has ball physics (owner, 2026-11-14). `range`: it waits if the ball is further.
   */
  | { readonly kind: 'lob'; readonly range: number; readonly loftAngle: number; readonly seedRadius: number }
  /**
   * Launches itself and rolls like the ball (owner, 2026-11-14). Aimed at the ball,
   * with the speed that would carry it there on flat grass, capped at `maxSpeed`.
   */
  | { readonly kind: 'launch'; readonly maxSpeed: number; readonly hitWhileMoving: boolean }
  /**
   * The Mole (owner, 2026-11-14): hidden under a hill, shoots out in a random
   * direction at `launchSpeed` when rolled over, stays up for `upShots` shots.
   */
  | {
      readonly kind: 'burrow';
      /** Sideways speed it shoots out with, tiles per second. */
      readonly launchSpeed: number;
      /** Upward speed it shoots out with (owner, 2026-11-14: more up into the air). */
      readonly launchUp: number;
      /** Seconds between the ball rolling over the hill and the Mole popping out (owner, 2026-11-14). */
      readonly delay: number;
      /** Seconds after popping out in which it cannot hurt the ball. */
      readonly grace: number;
      readonly upShots: number;
      readonly hitWhileMoving: boolean;
    };

/**
 * When touching the ball hurts it (the enemy's attack damage).
 * - survives: the ball hit it and it survived, or it ran into the ball (Trundler).
 * - moving: only while it is rolling (Lunger, Mole).
 */
export type ContactWhen = 'never' | 'survives' | 'moving';

export interface EnemyDef {
  readonly kind: 'enemy';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  readonly family: 'sentinel' | 'patroller';
  readonly tier: number;
  /** health, attackDamage, moveRange, attackRange, outerRadius, innerRadius. */
  readonly stats: BaseStats;
  /** Yellow stars secured when defeated. Owner, 2026-11-14: 1 for every enemy for now. */
  readonly starValue: number;
  readonly element: Element | null;
  readonly weakTo: readonly Element[];
  readonly resists: readonly Element[];
  readonly weakSpots: readonly Side[];
  readonly guardedSides: readonly Side[];
  /** Blocks the first hit of each shot (the Shielded trait, Milestone 8; test entries use it now). */
  readonly shield: boolean;
  readonly shape: ObjectShape;
  readonly height: number;
  /** Fraction of speed kept when the ball bounces off it (it survived the hit). */
  readonly bounce: number;
  readonly triggers: { readonly hit: TriggerResponse; readonly rest: TriggerResponse; readonly passBy: TriggerResponse };
  /** Pass-by only counts for a ball touching the ground (the Mole's hill). */
  readonly passByGroundOnly: boolean;
  readonly behaviour: Behaviour;
  readonly contact: ContactWhen;
  /** Ability id given on defeat, or null. */
  readonly grantsAbility: string | null;
  readonly allowedTraits: readonly string[];
  readonly allowedGear: readonly string[];
  readonly squadThemes: readonly string[];
  /** Generator cost (Milestone 5). */
  readonly cost: number;
}

export type ObjectDef = PickupDef | BlockerDef | MoverDef | BreakableDef | CloudDef | FlagDef | EnemyDef;

/** Template fields that are mostly unused until Milestone 8. */
const PLAIN = {
  element: null,
  weakTo: [],
  resists: [],
  weakSpots: [],
  guardedSides: [],
  shield: false,
  passByGroundOnly: false,
  allowedTraits: [],
  allowedGear: [],
  squadThemes: [],
} as const;

const ROUND_ENEMY = { shape: { kind: 'round', r: 0.3 }, height: 0.6, bounce: 0.6 } as const;
const NO_TRIGGERS = { hit: 'none', rest: 'none', passBy: 'none' } as const;

/** One Mossback copy per starter ability; grants it on defeat (FEATURES.md section 4). */
function carrier(id: string, name: string, ability: string): EnemyDef {
  return {
    kind: 'enemy',
    id,
    name,
    sprite: id,
    family: 'sentinel',
    tier: 1,
    stats: { health: 1, attackDamage: 0, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'none' },
    contact: 'never',
    grantsAbility: ability,
    cost: 2,
  };
}

const defs: readonly ObjectDef[] = [
  // Pickups (section 13). Blue stars come with permanent progress in Milestone 7.
  { kind: 'pickup', id: 'yellow-star', name: 'Yellow star', sprite: 'star-yellow', effect: 'yellowStar', usesStarReach: true },
  { kind: 'pickup', id: 'heart', name: 'Heart', sprite: 'heart', effect: 'heart', usesStarReach: false },
  { kind: 'pickup', id: 'shot-orb', name: 'Shot orb', sprite: 'shot-orb', effect: 'shotOrb', usesStarReach: false },
  { kind: 'pickup', id: 'wild', name: 'Wild', sprite: 'wild', effect: 'wild', usesStarReach: false },

  // Static blockers (section 6). The post was renamed the tree stump (owner, 2026-11-14); same size.
  { kind: 'blocker', id: 'rock', name: 'Rock', sprite: 'rock', shape: { kind: 'round', r: 0.38 }, height: 0.5, bounce: 0.6, cost: 1 },
  { kind: 'blocker', id: 'stump', name: 'Tree stump', sprite: 'stump', shape: { kind: 'round', r: 0.14 }, height: 1.5, bounce: 0.75, cost: 1 },
  { kind: 'blocker', id: 'low-wall', name: 'Low wall', sprite: 'low-wall', shape: { kind: 'box', hx: 0.5, hy: 0.5 }, height: 0.25, bounce: 0.6, cost: 1 },

  // Moving obstacles (section 6).
  {
    kind: 'mover',
    id: 'sliding-block',
    name: 'Sliding block',
    sprite: 'sliding-block',
    motion: { kind: 'path', speed: 1 },
    shape: { kind: 'box', hx: 0.45, hy: 0.45 },
    height: 0.5,
    bounce: 0.6,
    knock: 5,
    cost: 2,
  },
  {
    kind: 'mover',
    id: 'gate',
    name: 'Gate',
    sprite: 'gate',
    motion: { kind: 'gate', open: 2, closed: 2 },
    shape: { kind: 'box', hx: 0.5, hy: 0.1 },
    height: 1.0,
    bounce: 0.6,
    knock: 0,
    cost: 2,
  },

  // Destructibles (section 6). Secured crate: owner, 2026-11-14.
  { kind: 'breakable', id: 'crate', name: 'Crate', sprite: 'crate', health: 1, breakBy: 'hit', drops: ['yellow-star'], wildChance: 0, shape: { kind: 'box', hx: 0.4, hy: 0.4 }, height: 0.5, bounce: 0.6, cost: 1 },
  {
    kind: 'breakable',
    id: 'secured-crate',
    name: 'Secured crate',
    sprite: 'secured-crate',
    health: 2,
    breakBy: 'hit',
    drops: ['yellow-star', 'yellow-star'],
    wildChance: 0.1,
    shape: { kind: 'box', hx: 0.4, hy: 0.4 },
    height: 0.5,
    bounce: 0.6,
    cost: 2,
  },
  { kind: 'breakable', id: 'cracked-tile', name: 'Cracked tile', sprite: 'cracked-tile', health: 1, breakBy: 'anchor', drops: ['yellow-star', 'yellow-star'], wildChance: 0, shape: null, height: 0, bounce: 0, cost: 1 },

  // Thunder cloud (section 6, owner decisions 2026-11-14).
  { kind: 'cloud', id: 'thunder-cloud', name: 'Thunder cloud', sprite: 'thunder-cloud', half: 0.5, zapHeight: 0.5, damage: 1, throwSpeed: 6, throwHop: 2, driftSpeed: 1, cost: 2, driftCost: 3 },

  // The flag pole a defeated enemy leaves (owner, 2026-11-14). As tall as the tree stump.
  { kind: 'flag', id: 'flag-pole', name: 'Flag pole', sprite: 'flag-pole', shape: { kind: 'round', r: 0.08 }, height: 1.5, bounce: 0.75 },

  // Enemies (section 4). Owner, 2026-11-14: every enemy is worth 1 star for now.
  {
    kind: 'enemy',
    id: 'mossback',
    name: 'Mossback',
    sprite: 'mossback',
    family: 'sentinel',
    tier: 1,
    stats: { health: 1, attackDamage: 0, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'none' },
    contact: 'never',
    grantsAbility: null,
    cost: 1,
  },
  {
    kind: 'enemy',
    id: 'trundler',
    name: 'Trundler',
    sprite: 'trundler',
    family: 'patroller',
    tier: 2,
    stats: { health: 2, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'patrol', speed: 1.5, knock: 5 },
    contact: 'survives',
    grantsAbility: null,
    cost: 3,
  },
  {
    kind: 'enemy',
    id: 'spitter',
    name: 'Spitter',
    sprite: 'spitter',
    family: 'sentinel',
    tier: 2,
    stats: { health: 2, attackDamage: 1, moveRange: 0, attackRange: 8, outerRadius: 3.5, innerRadius: 1.5 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: { hit: 'activated', rest: 'activated', passBy: 'activated' },
    behaviour: { kind: 'lob', range: 8, loftAngle: 50, seedRadius: 0.12 },
    contact: 'never',
    grantsAbility: null,
    cost: 3,
  },
  {
    kind: 'enemy',
    id: 'lunger',
    name: 'Lunger',
    sprite: 'lunger',
    family: 'sentinel',
    tier: 2,
    stats: { health: 2, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 3, innerRadius: 1.25 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: { hit: 'activated', rest: 'activated', passBy: 'immediate' },
    behaviour: { kind: 'launch', maxSpeed: 10, hitWhileMoving: true },
    contact: 'moving',
    grantsAbility: null,
    cost: 3,
  },
  {
    kind: 'enemy',
    id: 'mole',
    name: 'Mole',
    sprite: 'mole',
    family: 'sentinel',
    tier: 2,
    stats: { health: 1, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0.35 },
    starValue: 1,
    ...PLAIN,
    passByGroundOnly: true,
    ...ROUND_ENEMY,
    triggers: { hit: 'none', rest: 'none', passBy: 'immediate' },
    behaviour: { kind: 'burrow', launchSpeed: 6, launchUp: 10, delay: 0.3, grace: 0.15, upShots: 1, hitWhileMoving: false },
    contact: 'moving',
    grantsAbility: null,
    cost: 3,
  },
  carrier('anchorback', 'Anchorback', 'anchor'),
  carrier('emberback', 'Emberback', 'burner'),
  carrier('hopback', 'Hopback', 'hop'),
  carrier('whirlback', 'Whirlback', 'tornado'),
];

const registry = new Map<string, ObjectDef>(defs.map((d) => [d.id, d]));
export const OBJECTS: ReadonlyMap<string, ObjectDef> = registry;

/**
 * Add definitions from another data file (tests, and later mods or generated
 * content). Proves a new enemy needs no logic changes. Ids must be new.
 */
export function registerObjects(more: readonly ObjectDef[]): void {
  for (const d of more) {
    if (registry.has(d.id)) throw new Error(`Object id "${d.id}" is already defined.`);
    registry.set(d.id, d);
  }
}

/** Ids that course files may no longer use, with the reason. */
export const RENAMED_OBJECTS: ReadonlyMap<string, string> = new Map([['post', 'stump']]);
