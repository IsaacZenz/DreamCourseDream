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
import { ACORN_LIST } from './consumables.ts';
import { GEAR_LIST } from './gear.ts';
import type { BaseStats } from './stats.ts';

/**
 * The footprint the ball collides with, centred on the tile, in tiles.
 * round: a circle (rocks, posts, enemies). box: a square or rectangle.
 */
export type ObjectShape =
  | { readonly kind: 'round'; readonly r: number }
  | { readonly kind: 'box'; readonly hx: number; readonly hy: number }
  /** A thin line from (x + ax, y + ay) to (x + bx, y + by), r thick on each side (guard rails). */
  | { readonly kind: 'seg'; readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number; readonly r: number };

/**
 * Guard rail (Milestone 5b, owner 2026-11-15; FEATURES.md section 6). Not an
 * object on a tile: course files list rails as lines through tile centres
 * ("rails"). Bounce numbers are in tuning.ts (railBounce, railBoost).
 */
export const RAIL = {
  id: 'rail',
  name: 'Guard rail',
  /** A post at every tile centre and a bar drawn in short pieces between them. */
  postSprite: 'rail-post',
  barSprite: 'rail-bar',
  /** Height of the rail, in tiles. A ball whose bottom is higher passes over. */
  height: 0.3,
  /** Half the thickness of the bar, in tiles. */
  halfThickness: 0.04,
  cost: 0,
} as const;

/** Elements (FEATURES.md section 2, open question F5 default). */
export type Element = 'fire' | 'ice' | 'shock';
export const ELEMENT_IDS: readonly Element[] = ['fire', 'ice', 'shock'];

/**
 * What having an element means for an enemy (Milestone 8 sheet section 3).
 * Owner, 2026-11-19: the elements form a circle: fire is weak to ice, ice is
 * weak to shock, shock is weak to fire; each resists its own. When an enemy
 * with an element hurts the ball, the ball also gets that element's status.
 */
export const ELEMENT_RULES: Readonly<Record<Element, { readonly weakTo: Element; readonly resists: Element; readonly contactStatus: string }>> = {
  fire: { weakTo: 'ice', resists: 'fire', contactStatus: 'burning' },
  ice: { weakTo: 'shock', resists: 'ice', contactStatus: 'chilled' },
  shock: { weakTo: 'fire', resists: 'shock', contactStatus: 'stunned' },
};

/** Where a hit lands, for weak spots and guarded sides (FEATURES.md section 2). */
export type Side = 'above' | 'behind' | 'front' | 'side';

export interface PickupDef {
  readonly kind: 'pickup';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** What touching it gives. A wild gives a random ability (owner, 2026-11-14). */
  readonly effect: 'yellowStar' | 'heart' | 'shotOrb' | 'wild' | 'blueStar' | 'acorn';
  /** Acorns (owner, 2026-11-17): extra filled slices on success wheels for the rest of the course. */
  readonly slices?: number;
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
  | { readonly kind: 'gate'; readonly open: number; readonly closed: number }
  /** Round 2b: a linked gate: closed until a switch with its link is pressed, then open for good. */
  | { readonly kind: 'linked' };

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
  /** Owner, 2026-11-17: chance of also dropping a blue star, times drop luck. */
  readonly blueStarChance: number;
  /** Owner, 2026-11-17: chance of also dropping an acorn, times drop luck (which acorn by the rarity odds). */
  readonly acornChance: number;
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
   * speed (owner, 2026-11-14). Milestone 8: `float` tiles above the ground (the
   * Glowmoth): a rolling ball goes under it, and it lowers no flags.
   */
  | { readonly kind: 'patrol'; readonly speed: number; readonly knock: number; readonly float?: number }
  /** Milestone 8 (Trapjaw): once active, turns to face the ball on each enemy turn. Never leaves its tile. */
  | { readonly kind: 'face' }
  /**
   * Milestone 8 (Stinkpuff): once active, marks a ring of `radius` round itself
   * each enemy turn and puffs it on the next; a ball resting on the ground in it
   * gets `status`. Hit by the ball, it puffs at once within `hitRadius`, unless
   * the hit came from above.
   */
  | { readonly kind: 'pulse'; readonly radius: number; readonly hitRadius: number; readonly status: string }
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
    }
  /** A boss (Milestone 7): its phases, slams and summons are in bosses.ts under this id. Active from the start. */
  | { readonly kind: 'boss'; readonly boss: string };

/**
 * When touching the ball hurts it (the enemy's attack damage).
 * - survives: the ball hit it and it survived, or it ran into the ball (Trundler).
 * - moving: only while it is rolling (Lunger, Mole).
 */
export type ContactWhen = 'never' | 'survives' | 'moving' | 'front';

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
  /** Milestone 8: a status the ball also gets when this enemy hurts it (Bristlecrawler: poisoned), or null. */
  readonly contactStatus: string | null;
  /** Ability id given on defeat, or null. */
  readonly grantsAbility: string | null;
  readonly allowedTraits: readonly string[];
  readonly allowedGear: readonly string[];
  readonly squadThemes: readonly string[];
  /** Generator cost (Milestone 5). */
  readonly cost: number;
}

/**
 * A gear item lying on a course (Milestone 6). Rolling over it equips it; the
 * item it replaces drops on the same tile. One entry per item in gear.ts.
 */
export interface GearObjectDef {
  readonly kind: 'gear';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** The gear id in src/content/gear.ts. */
  readonly item: string;
}

/**
 * Round 2b (sheet section 2): a switch, a flat plate pressed by the ball
 * rolling or landing on it, that stays on for the course and works every
 * linked gate and drawbridge with the same `link`.
 */
export interface SwitchDef {
  readonly kind: 'switch';
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** How close (tiles) the ball's centre must come, on the ground, to press it. */
  readonly reach: number;
}

/**
 * Round 2b (sheet section 2.3): one tile of a drawbridge. The course stores
 * the tile as it starts (the moat, up); when its switch is pressed the tile
 * becomes plank bridge one step higher.
 */
export interface DrawbridgeDef {
  readonly kind: 'drawbridge';
  readonly id: string;
  readonly name: string;
  /** Shown standing at the tile while the bridge is up. */
  readonly sprite: string;
  /** Steps the tile rises when the bridge comes down, and its surface then. */
  readonly rise: number;
  readonly surface: string;
}

export type ObjectDef = PickupDef | BlockerDef | MoverDef | BreakableDef | CloudDef | FlagDef | EnemyDef | GearObjectDef | SwitchDef | DrawbridgeDef;

/** Template fields that are mostly unused until Milestone 8. */
const PLAIN = {
  element: null,
  weakTo: [],
  resists: [],
  weakSpots: [],
  guardedSides: [],
  shield: false,
  passByGroundOnly: false,
  contactStatus: null,
  allowedTraits: [],
  allowedGear: [],
  squadThemes: [],
} as const;

/**
 * Traits and gear each enemy may roll (Milestone 8 sheet section 5.1). Grubs
 * (Snoozegrub and the ability grubs) take only the four simple traits; a bug
 * that never attacks carries only armour or a bauble.
 */
const GRUB_TRAITS = ['shielded', 'armoured', 'explosive', 'splitting'] as const;
const ALL_TRAITS = ['shielded', 'armoured', 'swift', 'explosive', 'regenerating', 'splitting'] as const;
const traitsWithout = (...no: string[]) => ALL_TRAITS.filter((t) => !no.includes(t));
const PASSIVE_GEAR = ['armour', 'bauble'] as const;
const ALL_GEAR = ['weapon', 'armour', 'bauble'] as const;

const ROUND_ENEMY = { shape: { kind: 'round', r: 0.3 }, height: 0.6, bounce: 0.6 } as const;
const NO_TRIGGERS = { hit: 'none', rest: 'none', passBy: 'none' } as const;

/** One grub (a Snoozegrub copy) per starter ability; grants it on defeat (FEATURES.md section 4). */
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
    allowedTraits: GRUB_TRAITS,
    allowedGear: PASSIVE_GEAR,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'none' },
    contact: 'never',
    grantsAbility: ability,
    cost: 2,
  };
}

const defs: readonly ObjectDef[] = [
  // Pickups (section 13).
  { kind: 'pickup', id: 'yellow-star', name: 'Yellow star', sprite: 'star-yellow', effect: 'yellowStar', usesStarReach: true },
  { kind: 'pickup', id: 'heart', name: 'Heart', sprite: 'heart', effect: 'heart', usesStarReach: false },
  { kind: 'pickup', id: 'shot-orb', name: 'Shot orb', sprite: 'shot-orb', effect: 'shotOrb', usesStarReach: false },
  { kind: 'pickup', id: 'wild', name: 'Wild', sprite: 'wild', effect: 'wild', usesStarReach: false },
  // Owner, 2026-11-17: blue stars are carried until deposited at a town or on beating a boss.
  { kind: 'pickup', id: 'blue-star', name: 'Blue star', sprite: 'star-blue', effect: 'blueStar', usesStarReach: true },
  ...ACORN_LIST.map((a): PickupDef => ({ kind: 'pickup', id: a.id, name: a.name, sprite: a.sprite, effect: 'acorn', usesStarReach: false, slices: a.slices })),

  // Static blockers (section 6). The post was renamed the tree stump (owner, 2026-11-14); same size.
  { kind: 'blocker', id: 'rock', name: 'Rock', sprite: 'rock', shape: { kind: 'round', r: 0.38 }, height: 0.5, bounce: 0.6, cost: 1 },
  { kind: 'blocker', id: 'stump', name: 'Tree stump', sprite: 'stump', shape: { kind: 'round', r: 0.14 }, height: 1.5, bounce: 0.75, cost: 1 },
  // Round 2a (owner, 2026-11-21): a thin, tall dead tree; regions two and three.
  { kind: 'blocker', id: 'dead-tree', name: 'Dead tree', sprite: 'dead-tree', shape: { kind: 'round', r: 0.12 }, height: 2, bounce: 0.7, cost: 1 },
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
  // Round 2b (sheet section 2).
  {
    kind: 'mover',
    id: 'linked-gate',
    name: 'Linked gate',
    sprite: 'linked-gate',
    motion: { kind: 'linked' },
    shape: { kind: 'box', hx: 0.5, hy: 0.1 },
    height: 1.0,
    bounce: 0.6,
    knock: 0,
    cost: 0,
  },
  { kind: 'switch', id: 'switch', name: 'Switch', sprite: 'switch', reach: 0.4 },
  { kind: 'drawbridge', id: 'drawbridge', name: 'Drawbridge', sprite: 'drawbridge-up', rise: 1, surface: 'bridge' },
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
  { kind: 'breakable', id: 'crate', name: 'Crate', sprite: 'crate', health: 1, breakBy: 'hit', drops: ['yellow-star'], wildChance: 0, blueStarChance: 0.02, acornChance: 0.04, shape: { kind: 'box', hx: 0.4, hy: 0.4 }, height: 0.5, bounce: 0.6, cost: 1 },
  {
    kind: 'breakable',
    id: 'secured-crate',
    name: 'Secured crate',
    sprite: 'secured-crate',
    health: 2,
    breakBy: 'hit',
    drops: ['yellow-star', 'yellow-star'],
    wildChance: 0.1,
    blueStarChance: 0.05,
    acornChance: 0.1,
    shape: { kind: 'box', hx: 0.4, hy: 0.4 },
    height: 0.5,
    bounce: 0.6,
    cost: 2,
  },
  { kind: 'breakable', id: 'cracked-tile', name: 'Cracked tile', sprite: 'cracked-tile', health: 1, breakBy: 'anchor', drops: ['yellow-star', 'yellow-star'], wildChance: 0, blueStarChance: 0.05, acornChance: 0, shape: null, height: 0, bounce: 0, cost: 1 },

  // Thunder cloud (section 6, owner decisions 2026-11-14).
  { kind: 'cloud', id: 'thunder-cloud', name: 'Thunder cloud', sprite: 'thunder-cloud', half: 0.5, zapHeight: 0.5, damage: 1, throwSpeed: 6, throwHop: 2, driftSpeed: 1, cost: 2, driftCost: 3 },

  // The flag pole a defeated enemy leaves (owner, 2026-11-14). As tall as the tree stump.
  { kind: 'flag', id: 'flag-pole', name: 'Flag pole', sprite: 'flag-pole', shape: { kind: 'round', r: 0.08 }, height: 1.5, bounce: 0.75 },

  // Enemies (section 4). Owner, 2026-11-14: every enemy is worth 1 star for now.
  {
    kind: 'enemy',
    id: 'snoozegrub',
    name: 'Snoozegrub',
    sprite: 'snoozegrub',
    family: 'sentinel',
    tier: 1,
    stats: { health: 1, attackDamage: 0, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: NO_TRIGGERS,
    allowedTraits: GRUB_TRAITS,
    allowedGear: PASSIVE_GEAR,
    behaviour: { kind: 'none' },
    contact: 'never',
    grantsAbility: null,
    cost: 1,
  },
  // Milestone 8: the Grublet, a tiny larva let out by a Splitting bug (sheet section 7.3). Not placed by the generator.
  {
    kind: 'enemy',
    id: 'grublet',
    name: 'Grublet',
    sprite: 'grublet',
    family: 'sentinel',
    tier: 1,
    stats: { health: 1, attackDamage: 0, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    shape: { kind: 'round', r: 0.2 },
    height: 0.4,
    bounce: 0.6,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'none' },
    contact: 'never',
    grantsAbility: null,
    cost: 0,
  },
  {
    kind: 'enemy',
    id: 'mudroller',
    name: 'Mudroller',
    sprite: 'mudroller',
    family: 'patroller',
    tier: 2,
    stats: { health: 2, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: NO_TRIGGERS,
    allowedTraits: ALL_TRAITS,
    allowedGear: ALL_GEAR,
    behaviour: { kind: 'patrol', speed: 1.5, knock: 5 },
    contact: 'survives',
    grantsAbility: null,
    cost: 3,
  },
  {
    kind: 'enemy',
    id: 'spittlebug',
    name: 'Spittlebug',
    sprite: 'spittlebug',
    family: 'sentinel',
    tier: 2,
    stats: { health: 2, attackDamage: 1, moveRange: 0, attackRange: 8, outerRadius: 3.5, innerRadius: 1.5 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: { hit: 'activated', rest: 'activated', passBy: 'activated' },
    allowedTraits: traitsWithout('swift'),
    allowedGear: ALL_GEAR,
    behaviour: { kind: 'lob', range: 8, loftAngle: 50, seedRadius: 0.12 },
    contact: 'never',
    grantsAbility: null,
    cost: 3,
  },
  {
    kind: 'enemy',
    id: 'pouncehopper',
    name: 'Pouncehopper',
    sprite: 'pouncehopper',
    family: 'sentinel',
    tier: 2,
    stats: { health: 2, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 3, innerRadius: 1.25 },
    starValue: 1,
    ...PLAIN,
    ...ROUND_ENEMY,
    triggers: { hit: 'activated', rest: 'activated', passBy: 'immediate' },
    allowedTraits: ALL_TRAITS,
    allowedGear: ALL_GEAR,
    behaviour: { kind: 'launch', maxSpeed: 10, hitWhileMoving: true },
    contact: 'moving',
    grantsAbility: null,
    cost: 3,
  },
  {
    kind: 'enemy',
    id: 'mole-cricket',
    name: 'Mole Cricket',
    sprite: 'mole-cricket',
    family: 'sentinel',
    tier: 2,
    stats: { health: 1, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0.35 },
    starValue: 1,
    ...PLAIN,
    passByGroundOnly: true,
    // 1 health, so no Regenerating; it pops out of the ground, so no Explosive or Splitting.
    allowedTraits: ['shielded', 'armoured', 'swift'],
    allowedGear: ALL_GEAR,
    ...ROUND_ENEMY,
    triggers: { hit: 'none', rest: 'none', passBy: 'immediate' },
    behaviour: { kind: 'burrow', launchSpeed: 6, launchUp: 10, delay: 0.3, grace: 0.15, upShots: 1, hitWhileMoving: false },
    contact: 'moving',
    grantsAbility: null,
    cost: 3,
  },
  // The Warden (Milestone 7 sheet section 2). Health is set per region (run.ts REGIONS bossHealth).
  {
    kind: 'enemy',
    id: 'stagwarden',
    name: 'The Stagwarden',
    sprite: 'stagwarden',
    family: 'sentinel',
    tier: 5,
    stats: { health: 12, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 0,
    ...PLAIN,
    shape: { kind: 'round', r: 0.9 },
    height: 1.6,
    bounce: 0.6,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'boss', boss: 'stagwarden' },
    contact: 'never',
    grantsAbility: null,
    cost: 0,
  },
  // Gloamhorn (Milestone 8 sheet section 8). Health is set per region (bosses.ts). It hurts only while charging.
  {
    kind: 'enemy',
    id: 'gloamhorn',
    name: 'Gloamhorn',
    sprite: 'gloamhorn',
    family: 'sentinel',
    tier: 5,
    stats: { health: 8, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 0,
    ...PLAIN,
    // Open, its soft back takes double.
    weakSpots: ['behind'],
    shape: { kind: 'round', r: 0.8 },
    height: 1.3,
    bounce: 0.6,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'boss', boss: 'gloamhorn' },
    contact: 'moving',
    grantsAbility: null,
    cost: 0,
  },
  // The Brood Queen (sheet section 9). Guarded all round; a hit from above gets past (damage.ts), so only her back can be hurt.
  {
    kind: 'enemy',
    id: 'brood-queen',
    name: 'The Brood Queen',
    sprite: 'brood-queen',
    family: 'sentinel',
    tier: 5,
    stats: { health: 20, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 0,
    ...PLAIN,
    guardedSides: ['front', 'behind', 'side'],
    shape: { kind: 'round', r: 1.1 },
    height: 1.1,
    bounce: 0.6,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'boss', boss: 'brood-queen' },
    contact: 'never',
    grantsAbility: null,
    cost: 0,
  },
  carrier('leadgrub', 'Leadgrub', 'anchor'),
  carrier('embergrub', 'Embergrub', 'burner'),
  carrier('hopgrub', 'Hopgrub', 'hop'),
  carrier('whirlgrub', 'Whirlgrub', 'tornado'),
  carrier('frostgrub', 'Frostgrub', 'frost'),
  carrier('sparkgrub', 'Sparkgrub', 'static'),
  // Round 2b (sheet section 1.5).
  carrier('burrgrub', 'Burrgrub', 'burr'),
  carrier('glidegrub', 'Glidegrub', 'kite'),
  carrier('gyregrub', 'Gyregrub', 'gyre'),
  carrier('driftgrub', 'Driftgrub', 'drift'),

  // Milestone 8 round 1 (sheet section 7): five new bugs.
  {
    kind: 'enemy',
    id: 'skitter-ant',
    name: 'Skitter Ant',
    sprite: 'skitter-ant',
    family: 'patroller',
    tier: 1,
    stats: { health: 1, attackDamage: 0, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    shape: { kind: 'round', r: 0.22 },
    height: 0.4,
    bounce: 0.6,
    allowedTraits: traitsWithout('splitting', 'regenerating'),
    allowedGear: PASSIVE_GEAR,
    triggers: NO_TRIGGERS,
    // A timing target: fast, knocks the ball about, never hurts it.
    behaviour: { kind: 'patrol', speed: 2.8, knock: 3 },
    contact: 'survives',
    grantsAbility: null,
    cost: 2,
  },
  {
    kind: 'enemy',
    id: 'bristlecrawler',
    name: 'Bristlecrawler',
    sprite: 'bristlecrawler',
    family: 'patroller',
    tier: 2,
    stats: { health: 2, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    // Stinging bristles at its head; a soft rear.
    guardedSides: ['front'],
    weakSpots: ['behind'],
    contactStatus: 'poisoned',
    ...ROUND_ENEMY,
    allowedTraits: ALL_TRAITS,
    allowedGear: ALL_GEAR,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'patrol', speed: 1.2, knock: 5 },
    contact: 'survives',
    grantsAbility: null,
    cost: 4,
  },
  {
    kind: 'enemy',
    id: 'glowmoth',
    name: 'Glowmoth',
    sprite: 'glowmoth',
    family: 'patroller',
    tier: 2,
    stats: { health: 1, attackDamage: 0, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    shape: { kind: 'round', r: 0.3 },
    height: 0.4,
    bounce: 0.5,
    // 1 health: no Regenerating. It floats: no Splitting (the Grublets would hang in the air).
    allowedTraits: ['shielded', 'armoured', 'swift', 'explosive'],
    allowedGear: PASSIVE_GEAR,
    triggers: NO_TRIGGERS,
    behaviour: { kind: 'patrol', speed: 1, knock: 0, float: 0.9 },
    contact: 'never',
    grantsAbility: null,
    cost: 3,
  },
  {
    kind: 'enemy',
    id: 'trapjaw',
    name: 'Trapjaw',
    sprite: 'trapjaw',
    family: 'sentinel',
    tier: 2,
    stats: { health: 2, attackDamage: 1, moveRange: 0, attackRange: 0, outerRadius: 3, innerRadius: 0 },
    starValue: 1,
    ...PLAIN,
    guardedSides: ['front'],
    weakSpots: ['behind'],
    ...ROUND_ENEMY,
    allowedTraits: traitsWithout('swift'),
    allowedGear: ALL_GEAR,
    triggers: { hit: 'activated', rest: 'activated', passBy: 'none' },
    behaviour: { kind: 'face' },
    contact: 'front',
    grantsAbility: null,
    cost: 3,
  },
  {
    kind: 'enemy',
    id: 'stinkpuff',
    name: 'Stinkpuff',
    sprite: 'stinkpuff',
    family: 'sentinel',
    tier: 2,
    stats: { health: 1, attackDamage: 0, moveRange: 0, attackRange: 0, outerRadius: 2.5, innerRadius: 1.2 },
    starValue: 1,
    ...PLAIN,
    weakSpots: ['above'],
    ...ROUND_ENEMY,
    allowedTraits: ['shielded', 'armoured', 'explosive', 'splitting'],
    allowedGear: PASSIVE_GEAR,
    triggers: { hit: 'activated', rest: 'activated', passBy: 'activated' },
    behaviour: { kind: 'pulse', radius: 1.5, hitRadius: 1.2, status: 'poisoned' },
    contact: 'never',
    grantsAbility: null,
    cost: 3,
  },
];

// Gear lying on a course (Milestone 6): one object per gear item, by the same id.
const gearObjects: readonly GearObjectDef[] = GEAR_LIST.map((g) => ({ kind: 'gear', id: g.id, name: g.name, sprite: g.icon, item: g.id }));

const registry = new Map<string, ObjectDef>([...defs, ...gearObjects].map((d) => [d.id, d]));
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
export const RENAMED_OBJECTS: ReadonlyMap<string, string> = new Map([
  ['post', 'stump'],
  // Owner, 2026-11-18: every enemy is an insect (Milestone 8 sheet section 7.0).
  ['mossback', 'snoozegrub'],
  ['anchorback', 'leadgrub'],
  ['emberback', 'embergrub'],
  ['hopback', 'hopgrub'],
  ['whirlback', 'whirlgrub'],
  ['trundler', 'mudroller'],
  ['spitter', 'spittlebug'],
  ['lunger', 'pouncehopper'],
  ['mole', 'mole-cricket'],
  ['warden', 'stagwarden'],
]);
