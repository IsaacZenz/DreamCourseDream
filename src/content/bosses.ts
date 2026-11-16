/**
 * Bug bosses (owner, 2026-11-16; docs/plans/milestone-7.md section 2, signed
 * off the same day). A boss is built from three parts picked at random by the
 * boss generator (src/gen/boss.ts): a bug type, a colour with its power, and a
 * base skill. Every boss also summons helpers.
 *
 * A new bug, colour or skill that reuses an existing behaviour is a new entry
 * here plus a placeholder sprite. A truly new kind of behaviour (an attack
 * shape, a way of moving) needs code once in src/sim/boss.ts.
 *
 * Every number is a starting value.
 */
import type { Element } from './objects.ts';

export type BugId = 'goliath' | 'mantis' | 'grasshopper' | 'butterfly' | 'centipede';
export type ColourId = 'red' | 'blue' | 'yellow' | 'green' | 'rainbow';
export type SkillId = 'slam' | 'pods' | 'charge' | 'gust' | 'web';

export interface BugDef {
  readonly id: BugId;
  readonly name: string;
  /** Sprite id; the colour picks the palette through the manifest (`boss-<bug>` + `-<colour>`). */
  readonly sprite: string;
  /** Icon on the map marker, also tinted by the colour (owner, 2026-11-16: the map shows only the bug and its colour). */
  readonly icon: string;
  /** Built in this milestone; the rest wait for Milestone 8. */
  readonly built: boolean;
  readonly health: number;
  /** Damage of the base skill's hits (the colour attack always does `COLOUR_ATTACK_DAMAGE`). */
  readonly damage: number;
  /** Body radius and height, in tiles. */
  readonly radius: number;
  readonly height: number;
  /** Fraction of speed the ball keeps bouncing off it. */
  readonly bounce: number;
  /** Mantis: turns to face the ball and takes double damage from behind. */
  readonly facesBall: boolean;
  readonly weakBehind: boolean;
  /** Mantis: every n-th boss turn on which it makes a mark, it makes the other attack's mark too (0 = never). */
  readonly doubleMarkEvery: number;
  /** Grasshopper: marks a landing spot every n-th boss turn and leaps there on the next (0 = never). */
  readonly leapEvery: number;
  /** How far from the ball the landing spot may be, and the shockwave on landing (radius measured from the body's edge). */
  readonly leapRange: number;
  readonly leapShock: number;
  readonly leapShockDamage: number;
  /** Most helpers alive at once (summoned or hatched). */
  readonly helperCap: number;
}

export const BUGS: readonly BugDef[] = [
  // Owner, 2026-11-16: 12 health and higher damage.
  { id: 'goliath', name: 'Goliath', sprite: 'boss-goliath', icon: 'icon-boss-goliath', built: true, health: 12, damage: 2, radius: 0.9, height: 1.5, bounce: 0.4, facesBall: false, weakBehind: false, doubleMarkEvery: 0, leapEvery: 0, leapRange: 0, leapShock: 0, leapShockDamage: 0, helperCap: 4 },
  // Owner, 2026-11-16: attacks slightly faster.
  { id: 'mantis', name: 'Mantis', sprite: 'boss-mantis', icon: 'icon-boss-mantis', built: true, health: 10, damage: 1, radius: 0.7, height: 1.6, bounce: 0.6, facesBall: true, weakBehind: true, doubleMarkEvery: 3, leapEvery: 0, leapRange: 0, leapShock: 0, leapShockDamage: 0, helperCap: 4 },
  { id: 'grasshopper', name: 'Grasshopper', sprite: 'boss-grasshopper', icon: 'icon-boss-grasshopper', built: true, health: 11, damage: 1, radius: 0.7, height: 1.2, bounce: 0.6, facesBall: false, weakBehind: false, doubleMarkEvery: 0, leapEvery: 2, leapRange: 3, leapShock: 1, leapShockDamage: 1, helperCap: 4 },
  // Milestone 8: they need rules that do not exist yet (hits only from the air, a body of segments).
  { id: 'butterfly', name: 'Butterfly', sprite: 'boss-butterfly', icon: 'icon-boss-butterfly', built: false, health: 8, damage: 1, radius: 0.7, height: 1, bounce: 0.6, facesBall: false, weakBehind: false, doubleMarkEvery: 0, leapEvery: 0, leapRange: 0, leapShock: 0, leapShockDamage: 0, helperCap: 4 },
  { id: 'centipede', name: 'Centipede', sprite: 'boss-centipede', icon: 'icon-boss-centipede', built: false, health: 12, damage: 1, radius: 0.4, height: 0.6, bounce: 0.6, facesBall: false, weakBehind: false, doubleMarkEvery: 0, leapEvery: 0, leapRange: 0, leapShock: 0, leapShockDamage: 0, helperCap: 4 },
];

/** The simple attack tied to each colour (owner, 2026-11-16). */
export type ColourAttack = 'fireball' | 'frost' | 'bolts' | 'spores';
/** Ground a colour attack leaves for a while. */
export type HazardKind = 'scorch' | 'ice' | 'poison' | 'cloud';

export interface PowerDef {
  readonly element: Element;
  /** Status a hit gives the ball (from the colour attack, the base skill and the helpers). */
  readonly status: string;
  readonly attack: ColourAttack;
  readonly hazard: HazardKind;
}

export interface ColourDef {
  readonly id: ColourId;
  /** Word used in the boss's name. */
  readonly word: string;
  /** Pick odds. */
  readonly weight: number;
  /** The powers it can use: one for a plain colour; all four for rainbow, one picked at random per attack. */
  readonly powers: readonly PowerDef[];
  readonly weakTo: readonly Element[];
  readonly resists: readonly Element[];
  /** Extra blue stars for beating it (rainbow). */
  readonly bonusBlue: number;
}

const FIRE: PowerDef = { element: 'fire', status: 'burning', attack: 'fireball', hazard: 'scorch' };
const ICE: PowerDef = { element: 'ice', status: 'chilled', attack: 'frost', hazard: 'ice' };
const SHOCK: PowerDef = { element: 'shock', status: 'stunned', attack: 'bolts', hazard: 'cloud' };
const POISON: PowerDef = { element: 'poison', status: 'poisoned', attack: 'spores', hazard: 'poison' };

// Owner, 2026-11-16: fire and ice are weak to each other; lightning and poison are weak to each other.
export const COLOURS: readonly ColourDef[] = [
  { id: 'red', word: 'Ember', weight: 22.5, powers: [FIRE], weakTo: ['ice'], resists: ['fire'], bonusBlue: 0 },
  { id: 'blue', word: 'Frost', weight: 22.5, powers: [ICE], weakTo: ['fire'], resists: ['ice'], bonusBlue: 0 },
  { id: 'yellow', word: 'Storm', weight: 22.5, powers: [SHOCK], weakTo: ['poison'], resists: ['shock'], bonusBlue: 0 },
  { id: 'green', word: 'Blight', weight: 22.5, powers: [POISON], weakTo: ['shock'], resists: ['poison'], bonusBlue: 0 },
  { id: 'rainbow', word: 'Prism', weight: 10, powers: [FIRE, ICE, SHOCK, POISON], weakTo: [], resists: [], bonusBlue: 2 },
];

export interface SkillDef {
  readonly id: SkillId;
  readonly name: string;
  /** Title in the boss's name ("the Crusher"). */
  readonly title: string;
  readonly built: boolean;
}

export const SKILLS: readonly SkillDef[] = [
  { id: 'slam', name: 'Slam', title: 'the Crusher', built: true },
  { id: 'pods', name: 'Pod barrage', title: 'the Sower', built: true },
  { id: 'charge', name: 'Charge', title: 'the Rammer', built: true },
  { id: 'gust', name: 'Gust', title: 'the Gale', built: false },
  { id: 'web', name: 'Web snare', title: 'the Weaver', built: false },
];

/** Every attack's numbers (sheet sections 2.3 and 2.4). Distances in tiles, speeds in tiles per second. */
export const BOSS_ATTACKS = {
  /** Colour attacks always do this much. */
  colourDamage: 1,
  slam: { radius: 1.75, radiusPhase3: 2.25, knock: 6, hop: 2 },
  pods: { count: 4, radius: 0.6, scatter: 3, hatchTurns: 1, breakReach: 0.45 },
  charge: { halfWidth: 0.75, knock: 5, hop: 1.5 },
  fireball: { radius: 1 },
  frost: { length: 4, halfAngle: 30 },
  bolts: { extra: 2, scatter: 3 },
  spores: { radius: 3, puddles: 3, puddleRadius: 0.5 },
  /** Ground left by a colour attack lasts this many enemy turns. */
  hazardTurns: 2,
  /** Scorch: damage on touch. */
  scorchDamage: 1,
} as const;

/** Summons (sheet section 2.5). */
export const BOSS_SUMMONS = {
  attackers: ['mossback', 'spitter', 'lunger'],
  carriers: ['anchorback', 'emberback', 'hopback', 'whirlback'],
  /** A pad is free if nothing is this close to its centre. */
  padClear: 0.6,
  /** Owner, 2026-11-16: a defeated helper secures a star and leaves a flag pole only this often; otherwise it just dies. */
  starChance: 0.5,
} as const;

/** Per region (sheet sections 2.9 and 6). Region two's boss is a different bug and stronger. */
export const BOSS_REGIONS = [
  { region: 1, healthScale: 1, helperCapAdd: 0, blueStars: 5 },
  { region: 2, healthScale: 1.5, helperCapAdd: 1, blueStars: 8 },
] as const;

/**
 * Combinations not allowed together (sheet section 2.8). Owner, 2026-11-16:
 * nothing is banned without the owner's say; the bot report lists candidates.
 */
export const BANNED_COMBOS: readonly string[] = [];

/** The id of a combination, for the banned list and the report: "goliath-red-slam". */
export function comboId(bug: BugId, colour: ColourId, skill: SkillId): string {
  return `${bug}-${colour}-${skill}`;
}

/** The arena the boss is fought in (sheet section 3: one for now; more in Milestone 8). */
export const BOSS_ARENAS = ['arena-bug'] as const;
