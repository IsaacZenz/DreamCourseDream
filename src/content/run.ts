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
    /** Owner, 2026-11-15: shops do not lower the countdown, so the map has room for a shop between each counted node (countdown 7 plus 3 raises). */
    rows: 20,
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
  /** Boss countdown. Owner, 2026-11-15: 7 (was the default 5, DESIGN.md open question 1). */
  countdown: 7,
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

/**
 * Regions (Milestone 7 sheet section 7.4, owner 2026-11-17): course size,
 * threat and enemy toughness scale separately in every region. Each climbs
 * with the counted nodes finished in the region and jumps at the next one.
 * Region 3 is written now for Milestone 8; in Milestone 7 the run ends after
 * the boss of region `lastRegion`.
 */
export interface RegionDef {
  /** Areas per journey: `start`, +1 every `every` counted nodes, at most `max`. Hard courses and the boss get +1. */
  readonly areas: { readonly start: number; readonly every: number; readonly max: number };
  /** Area side in tiles, at random in this range. */
  readonly areaSize: readonly [number, number];
  /** Threat budget (enemies, obstacles, hazards): start + perNode per counted node, hard courses x RUN.budget.hardScale, capped. */
  readonly threat: { readonly start: number; readonly perNode: number; readonly cap: number };
  readonly maxEnemies: number;
  /** Added to every enemy in the region (source "region"). Bosses take `bossHealth` instead of the health part. */
  readonly toughness: readonly { readonly stat: StatId; readonly amount: number }[];
  /**
   * The boss randomizer's pool (owner, 2026-11-17). Owner, 2026-11-19 (round 1
   * question 6, option B): one boss per region for now: the Stagwarden,
   * Gloamhorn, the Brood Queen. Endless regions use every boss. Boss health is
   * per boss (bosses.ts).
   */
  readonly bosses: readonly string[];
  /** Which column of the gear rarity odds (gear.ts RARITY_ODDS) the region uses; region 1 also has a late column (RUN.lateAfter). */
  readonly oddsColumn: number;
  /**
   * Owner, 2026-11-18: the "par" kit the course check's bot plays with in this
   * region (stat additions), instead of the player's own gear and upgrades. A
   * player behind par finds courses harder; upgrades are how they catch up.
   */
  readonly par: readonly { readonly stat: StatId; readonly amount: number }[];
}

export const REGIONS: readonly RegionDef[] = [
  { areas: { start: 2, every: 2, max: 5 }, areaSize: [8, 14], threat: { start: 8, perNode: 2, cap: 30 }, maxEnemies: 10, toughness: [], bosses: ['stagwarden'], oddsColumn: 0, par: [] },
  // Owner, 2026-11-18 (option A): 3 to 6 areas and threat capped at 36 (was 4 to 7 and 45), so courses can be made in time.
  { areas: { start: 3, every: 2, max: 6 }, areaSize: [9, 15], threat: { start: 18, perNode: 3, cap: 36 }, maxEnemies: 14, toughness: [{ stat: 'health', amount: 1 }], bosses: ['gloamhorn'], oddsColumn: 2,
    par: [
      { stat: 'maxShots', amount: 1 },
      { stat: 'hitDamage', amount: 1 },
      { stat: 'shotPower', amount: 0.1 },
    ],
  },
  {
    areas: { start: 5, every: 2, max: 8 },
    areaSize: [10, 16],
    threat: { start: 28, perNode: 3, cap: 60 },
    maxEnemies: 18,
    toughness: [
      { stat: 'health', amount: 1 },
      { stat: 'attackDamage', amount: 1 },
    ],
    bosses: ['brood-queen'],
    oddsColumn: 3,
    par: [
      { stat: 'maxShots', amount: 2 },
      { stat: 'hitDamage', amount: 1 },
      { stat: 'shotPower', amount: 0.2 },
      { stat: 'maxHealth', amount: 2 },
    ],
  },
];

/**
 * Beating this region's boss (the final boss) wins the run (Milestone 8).
 * Owner, 2026-11-18: the run may then carry on into endless mode.
 */
export const LAST_REGION = 3;

/**
 * Endless mode (owner, 2026-11-18; sheet section 10a): each region after the
 * third takes region three's numbers plus one step per region. Course size
 * stays at region three's (owner: course size caps at region 3; everything
 * else keeps growing).
 */
export const ENDLESS = {
  threatStart: 10,
  threatCap: 12,
  maxEnemies: 2,
  /** Toughness: +1 health one region, +1 attack damage the next, in turn (health first). */
  par: [
    { stat: 'maxShots', amount: 1 },
    { stat: 'maxHealth', amount: 1 },
    { stat: 'shotPower', amount: 0.1 },
  ],
  bossBlueStars: 2,
} as const;

/** The bot's shot limit for a journey of n areas (the Milestone 5b table: 2 areas 20, 3 areas 26, ... ). */
export const botShotsFor = (areas: number): number => 8 + 6 * areas;

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

/**
 * The price of the first one, and how much it rises each time the same upgrade
 * is bought in a run. Owner, 2026-11-19: a little dearer in each region:
 * `perRegion` more for each region after the first (12, 16, 20, then on in endless).
 */
export const UPGRADE_PRICE = { base: 12, step: 6, perRegion: 4 } as const;

export const UPGRADE_LIST: readonly UpgradeDef[] = [
  { id: 'tough-shell', name: 'Tough Shell', icon: 'upgrade-health', stat: 'maxHealth', op: 'add', amount: 1, heal: 1, desc: 'Max health +1 and heal 1' },
  { id: 'deep-breath', name: 'Deep Breath', icon: 'upgrade-shots', stat: 'maxShots', op: 'add', amount: 1, heal: 0, desc: 'Max shots +1' },
  // Added to the base 100%, so three give 130% (sheet section 6).
  { id: 'strong-swing', name: 'Strong Swing', icon: 'upgrade-power', stat: 'shotPower', op: 'add', amount: 0.1, heal: 0, desc: 'Shot power +10%' },
  { id: 'long-arms', name: 'Long Arms', icon: 'upgrade-reach', stat: 'starReach', op: 'add', amount: 1, heal: 0, desc: 'Star reach +1' },
  { id: 'lucky-charm', name: 'Lucky Charm', icon: 'upgrade-luck', stat: 'dropLuck', op: 'add', amount: 0.25, heal: 0, desc: 'Drop luck +25%' },
];

export const UPGRADES: ReadonlyMap<string, UpgradeDef> = new Map(UPGRADE_LIST.map((u) => [u.id, u]));
