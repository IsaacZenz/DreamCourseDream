/**
 * Playable characters (FEATURES.md section 3). One for now; the template allows
 * more later (Milestone 8). Names are working names.
 */
import { RULES } from './rules.ts';
import type { BaseStats } from './stats.ts';

export interface CharacterDef {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** Round 3: the walking armadillo in towns and crossroads (the "-left" sheet is the mirrored one). */
  readonly walkSprite: string;
  readonly stats: BaseStats;
  /** Ability id, or null. Abilities arrive in Milestone 4. */
  readonly startingAbility: string | null;
  /** Passive trait id, or null. */
  readonly trait: string | null;
  /** Blue stars to unlock. 0 means available from the start. */
  readonly unlockCost: number;
}

/** The ball's starting stat sheet (FEATURES.md section 1). */
export const BALL_BASE_STATS: BaseStats = {
  maxHealth: 5,
  maxShots: 4,
  hitDamage: 1,
  shotPower: 1,
  guideLength: 1,
  bounceBoost: 1,
  starReach: 1,
  dropLuck: 1,
  shopPrices: 1,
  gearCapacity: 1,
  naps: RULES.naps,
  rollSlices: 0,
  bossSlices: 0,
  startingStars: 0,
  gravity: 1,
  windX: 0,
  windY: 0,
  knockBack: 1,
};

/** Round 3 (owner, 2026-11-22): what each trait shows on the character card. Their numbers are in the character's stats. */
export const CHARACTER_TRAITS: Readonly<Record<string, { readonly name: string; readonly desc: string }>> = {
  steady: { name: 'Steady', desc: 'Knock-backs push it about half as far' },
  nimble: { name: 'Nimble', desc: 'Star reach +0.5' },
};

const defs: readonly CharacterDef[] = [
  { id: 'rollo', name: 'Rollo', sprite: 'ball', walkSprite: 'armadillo', stats: BALL_BASE_STATS, startingAbility: null, trait: null, unlockCost: 0 },
  // Round 3 (owner, 2026-11-22; sheet section 2): working names, 21 blue stars each.
  // Thud, heavy: more health and damage, shorter shots, less bounce; Steady: knock-back speed x0.65, which pushes it about half as far on grass.
  { id: 'thud', name: 'Thud', sprite: 'ball-thud', walkSprite: 'armadillo-thud', stats: { ...BALL_BASE_STATS, maxHealth: 6, hitDamage: 2, shotPower: 0.9, bounceBoost: 0.8, knockBack: 0.65 }, startingAbility: null, trait: 'steady', unlockCost: 21 },
  // Pip, light: less health, an extra shot, longer shots, more bounce; Nimble reaches stars from further away.
  { id: 'pip', name: 'Pip', sprite: 'ball-pip', walkSprite: 'armadillo-pip', stats: { ...BALL_BASE_STATS, maxHealth: 4, maxShots: 5, shotPower: 1.05, bounceBoost: 1.2, starReach: 1.5 }, startingAbility: null, trait: 'nimble', unlockCost: 21 },
];

export const CHARACTER_LIST = defs;

export const CHARACTERS: ReadonlyMap<string, CharacterDef> = new Map(defs.map((d) => [d.id, d]));
export const DEFAULT_CHARACTER = 'rollo';
