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
};

const defs: readonly CharacterDef[] = [
  { id: 'rollo', name: 'Rollo', sprite: 'ball', stats: BALL_BASE_STATS, startingAbility: null, trait: null, unlockCost: 0 },
];

export const CHARACTERS: ReadonlyMap<string, CharacterDef> = new Map(defs.map((d) => [d.id, d]));
export const DEFAULT_CHARACTER = 'rollo';
