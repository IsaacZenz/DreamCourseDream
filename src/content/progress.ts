/**
 * Permanent progress (Milestone 7 design sheet, docs/plans/milestone-7.md,
 * signed off by the owner 2026-11-17): blue star sources, the levelled
 * upgrades bought in the Burrow, and the starting abilities.
 *
 * Every number here is a starting value.
 */
import type { StatId } from './stats.ts';

/** Blue stars (sheet section 4.1, owner 2026-11-17). Carried on a run until deposited at a town or on beating a boss. */
export const BLUE_STARS = {
  course: 1,
  hard: 2,
  /** Beating the boss, per region (region 1 first). Later regions use the last number. */
  boss: [5, 8, 12],
  /** Fighting the boss early: per countdown step left (DESIGN.md open question 2). */
  earlyPerStep: 1,
} as const;

/** A levelled permanent upgrade: one modifier per level, source "permanent", lasting forever. */
export interface PermanentUpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly stat: StatId;
  readonly op: 'add' | 'mul';
  /** Per level. */
  readonly amount: number;
  /** Blue stars for level 1, 2, 3... The list length is the number of levels. */
  readonly costs: readonly number[];
  /** Health healed when a level is bought mid-run (Vitality, like Tough Shell). */
  readonly heal: number;
  readonly desc: string;
}

/** The levelled list (FEATURES.md section 10; owner prices 2026-11-17). Knack: owner, 2026-11-17. */
export const PERMANENT_UPGRADE_LIST: readonly PermanentUpgradeDef[] = [
  { id: 'vitality', name: 'Vitality', icon: 'perm-vitality', stat: 'maxHealth', op: 'add', amount: 1, costs: [5, 8, 12, 16, 20], heal: 1, desc: 'Max health +1' },
  { id: 'stamina', name: 'Stamina', icon: 'perm-stamina', stat: 'maxShots', op: 'add', amount: 1, costs: [5, 8, 12, 16, 20], heal: 0, desc: 'Max shots +1' },
  { id: 'head-start', name: 'Head Start', icon: 'perm-head-start', stat: 'startingStars', op: 'add', amount: 10, costs: [3, 6, 10], heal: 0, desc: '+10 starting yellow stars' },
  // Added, not multiplied: three levels give 70% prices.
  { id: 'haggler', name: 'Haggler', icon: 'perm-haggler', stat: 'shopPrices', op: 'add', amount: -0.1, costs: [4, 8, 12], heal: 0, desc: 'Shop prices -10%' },
  { id: 'fortune', name: 'Fortune', icon: 'perm-fortune', stat: 'dropLuck', op: 'add', amount: 0.1, costs: [3, 6, 10], heal: 0, desc: 'Drop luck +10%' },
  { id: 'knack', name: 'Knack', icon: 'perm-knack', stat: 'rollSlices', op: 'add', amount: 1, costs: [6, 10, 14, 18, 24], heal: 0, desc: 'Every success wheel +1 slice' },
];

export const PERMANENT_UPGRADES: ReadonlyMap<string, PermanentUpgradeDef> = new Map(PERMANENT_UPGRADE_LIST.map((u) => [u.id, u]));

/** Round 3 (owner, 2026-11-22): a second pocket per gear category, bought once. */
export interface PocketUnlockDef {
  readonly category: 'weapon' | 'armour' | 'bauble';
  readonly name: string;
  readonly cost: number;
  readonly desc: string;
}
export const POCKET_UNLOCKS: readonly PocketUnlockDef[] = [
  { category: 'weapon', name: 'Second Weapon Pocket', cost: 17, desc: 'Hold two weapons' },
  { category: 'armour', name: 'Second Armour Pocket', cost: 17, desc: 'Hold two pieces of armour' },
  { category: 'bauble', name: 'Second Bauble Pocket', cost: 17, desc: 'Hold two baubles' },
];

/** Owner, 2026-11-17: each starting ability is bought separately, once. */
export const ABILITY_PRICE = 8;
/** Abilities that can be bought as a starting ability (the built ones; Milestone 8 adds more as data). */
export const STARTING_ABILITIES: readonly string[] = ['anchor', 'burner', 'hop', 'tornado', 'frost', 'static'];
