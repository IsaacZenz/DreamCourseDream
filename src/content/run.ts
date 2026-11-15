/**
 * The run (Milestone 6 design sheet, docs/plans/milestone-6.md, signed off by
 * the owner 2026-11-15): the map, the boss countdown, the difficulty budget
 * along the run, rewards, run upgrades, the shop and the cache.
 *
 * Every number here is a starting value.
 */
import type { StatId } from './stats.ts';

export const NODE_TYPES = ['course', 'hard', 'shop', 'cache', 'boss'] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const RUN = {
  map: {
    /** Owner, 2026-11-15: shops do not lower the countdown, so the map has room for a shop between each counted node. */
    rows: 16,
    lanes: 4,
    nodesPerRow: [2, 4] as const,
    firstRowNodes: 3,
    /** A node links to 1 or 2 nodes in the next row; this is the chance of 2. */
    twoLinkChance: 0.45,
    /** Node odds from row 2 up (sheet section 2.2). */
    odds: { course: 0.55, hard: 0.15, shop: 0.15, cache: 0.15 },
    /** No shop before this row (1-based). */
    firstShopRow: 3,
    /** No hard course before this row. */
    firstHardRow: 3,
    /** From this row each row may be course only. */
    courseOnlyFromRow: 3,
    courseOnlyChance: 0.2,
    /** From this row each row may hold one early boss node. */
    earlyBossFromRow: 3,
    earlyBossChance: 0.5,
  },
  /** Boss countdown (DESIGN.md open question 1, default 5). */
  countdown: 5,
  /** An early boss node is offered only when the countdown is at or below this. */
  earlyBossAt: 3,
  /** Shop service: raise the countdown by 1, once per shop, at most this many times per region (FEATURES.md F6). */
  maxRaises: 3,
  /** Blue stars counted for fighting the boss early, per countdown step left (DESIGN.md open question 2). */
  earlyBossBluePerStep: 1,
  budget: {
    /** Budget of the first course; it rises by `perNode` for each counted node (course, hard course, cache). */
    start: 8,
    perNode: 2,
    hardScale: 1.5,
    /** Owner, 2026-11-15: run courses capped at 30 for now. */
    cap: 30,
  },
  /** Yellow stars for finishing a node. */
  reward: { course: 2, hard: 6, boss: 0 },
  /** Gear on a course: chance on a normal course; hard courses always have one. */
  courseGearChance: 0.2,
  /** Rarity odds: region 1 switches from the early to the late column after this many counted nodes. */
  lateAfter: 4,
  shop: {
    gearOffers: 2,
    upgradeOffers: 2,
    rerollStart: 3,
    heal: { amount: 2, price: 10 },
    raise: { price: 8 },
  },
  cache: { heal: 2 },
} as const;

/** Run upgrades (FEATURES.md section 9): one modifier each, lasting the run, stacking. */
export interface UpgradeDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly stat: StatId;
  readonly op: 'add' | 'mul';
  readonly amount: number;
  /** Health healed when bought (Tough Shell). */
  readonly heal: number;
  readonly desc: string;
}

/** The price of the first one, and how much it rises each time the same upgrade is bought in a run. */
export const UPGRADE_PRICE = { base: 12, step: 6 } as const;

export const UPGRADE_LIST: readonly UpgradeDef[] = [
  { id: 'tough-shell', name: 'Tough Shell', icon: 'upgrade-health', stat: 'maxHealth', op: 'add', amount: 1, heal: 1, desc: 'Max health +1 and heal 1' },
  { id: 'deep-breath', name: 'Deep Breath', icon: 'upgrade-shots', stat: 'maxShots', op: 'add', amount: 1, heal: 0, desc: 'Max shots +1' },
  // Added to the base 100%, so three give 130% (sheet section 6).
  { id: 'strong-swing', name: 'Strong Swing', icon: 'upgrade-power', stat: 'shotPower', op: 'add', amount: 0.1, heal: 0, desc: 'Shot power +10%' },
  { id: 'long-arms', name: 'Long Arms', icon: 'upgrade-reach', stat: 'starReach', op: 'add', amount: 1, heal: 0, desc: 'Star reach +1' },
  { id: 'lucky-charm', name: 'Lucky Charm', icon: 'upgrade-luck', stat: 'dropLuck', op: 'add', amount: 0.25, heal: 0, desc: 'Drop luck +25%' },
];

export const UPGRADES: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADE_LIST.map((u) => [u.id, u]));
