/**
 * Permanent upgrades (FEATURES.md section 10; Milestone 7 design sheet section
 * 5, signed off by the owner 2026-11-16). Bought with stashed blue stars on the
 * hub. Each level is one modifier from the source "permanent", lasting
 * forever, through the modifier system.
 *
 * Every number is a starting value.
 */
import type { StatId } from './stats.ts';

export interface PermanentDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly stat: StatId;
  readonly op: 'add' | 'mul';
  /** Per level. */
  readonly amount: number;
  /** Cost of each level in blue stars; the number of entries is the number of levels. */
  readonly costs: readonly number[];
  /** What one level gives, for the hub. */
  readonly desc: string;
}

export const PERMANENT_LIST: readonly PermanentDef[] = [
  { id: 'vitality', name: 'Vitality', icon: 'perm-vitality', stat: 'maxHealth', op: 'add', amount: 1, costs: [2, 4, 6, 9, 12], desc: 'Max health +1' },
  { id: 'stamina', name: 'Stamina', icon: 'perm-stamina', stat: 'maxShots', op: 'add', amount: 1, costs: [2, 4, 6, 9, 12], desc: 'Max shots +1' },
  { id: 'head-start', name: 'Head Start', icon: 'perm-head-start', stat: 'startingStars', op: 'add', amount: 10, costs: [2, 4, 6], desc: '+10 starting yellow stars' },
  { id: 'haggler', name: 'Haggler', icon: 'perm-haggler', stat: 'shopPrices', op: 'add', amount: -0.1, costs: [3, 6, 9], desc: 'Shop prices -10%' },
  { id: 'fortune', name: 'Fortune', icon: 'perm-fortune', stat: 'dropLuck', op: 'add', amount: 0.1, costs: [2, 4, 6], desc: 'Drop luck +10%' },
];

export const PERMANENTS: ReadonlyMap<string, PermanentDef> = new Map(PERMANENT_LIST.map((p) => [p.id, p]));

/** One-time unlocks (FEATURES.md section 10). Owner, 2026-11-16: the starting ability may be any built ability. */
export const UNLOCKS = {
  startingAbility: { name: 'Starting ability', icon: 'perm-ability', cost: 8, desc: 'Start each run holding a chosen ability' },
} as const;
export type UnlockId = keyof typeof UNLOCKS;
