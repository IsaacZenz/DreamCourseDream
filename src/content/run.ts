/**
 * The run (Milestone 6 design sheet, docs/plans/milestone-6.md, signed off by
 * the owner 2026-11-15): the map, the boss countdown, the difficulty budget
 * along the run, rewards, run upgrades, the shop and the cache.
 *
 * Every number here is a starting value.
 */
import type { StatId } from './stats.ts';
import type { DetailDef } from './gen.ts';

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
  /** Round 2a (owner, 2026-11-21): the detail dial: set pieces, extra obstacles and scenery for the course's size. */
  readonly detail: DetailDef;
  /**
   * Owner, 2026-11-19 (round 1, option C): gear the course check's bot wears in
   * this region, one item per category (gear ids), or none.
   */
  readonly parGear?: { readonly weapon: string | null; readonly armour: string | null; readonly bauble: string | null };
}

/**
 * The detail dial per region (round 2a sheet sections 1, 2.5 and 2.6; owner,
 * 2026-11-21). Region one keeps its set pieces exactly as before and gets only
 * a few extra rocks and stumps. Endless regions keep region three's.
 */
export const DETAIL: readonly DetailDef[] = [
  {
    setPieces: null,
    extraObstacles: { per100: 0.5, weights: { rock: 1, stump: 1 } },
    scenery: { per100: 4, cluster: [1, 3], weights: { tuft: 4, flowers: 3, pebbles: 2 } },
  },
  {
    setPieces: {
      tilesPer: 70,
      max: 3,
      weights: { pond: 2, 'spike-pit': 1, sand: 2, arrows: 2, moat: 3, grove: 2, rough: 2 },
      // Owner, 2026-11-21: spike moats can show up in region two, much less often.
      moatFill: { water: 55, sand: 35, spikes: 10 },
      railChance: 0.5,
      oneWideChance: 0,
    },
    // Built 2026-11-21: 1.0, not the sheet's 1.5, because the groves' trees already add obstacles (target about 2 per 100 tiles).
    extraObstacles: { per100: 1.0, weights: { rock: 2, stump: 2, 'low-wall': 1, 'dead-tree': 3 } },
    scenery: { per100: 6, cluster: [1, 4], weights: { tuft: 3, flowers: 2, pebbles: 2, mushrooms: 2, leaves: 2 } },
  },
  {
    setPieces: {
      // Built 2026-11-21: 45, not the sheet's 55, to reach the sheet's target of 14 to 18 special tiles per 100.
      tilesPer: 45,
      max: 4,
      weights: { pond: 1, 'spike-pit': 3, sand: 1, arrows: 2, moat: 3, grove: 3, rough: 1, 'spike-strip': 3, ice: 2 },
      moatFill: { water: 40, sand: 20, spikes: 40 },
      railChance: 0.5,
      oneWideChance: 0.3,
    },
    // Built 2026-11-21: 1.5, not the sheet's 2.5, because the groves' trees already add obstacles (target about 3 per 100 tiles).
    extraObstacles: { per100: 1.5, weights: { rock: 2, stump: 2, 'low-wall': 1, 'dead-tree': 3 } },
    scenery: { per100: 8, cluster: [1, 4], weights: { tuft: 2, pebbles: 2, mushrooms: 2, leaves: 2, bones: 2 } },
  },
];

export const REGIONS: readonly RegionDef[] = [
  { areas: { start: 2, every: 2, max: 5 }, areaSize: [8, 14], threat: { start: 8, perNode: 2, cap: 30 }, maxEnemies: 10, toughness: [], bosses: ['stagwarden'], oddsColumn: 0, par: [], detail: DETAIL[0]! },
  // Owner, 2026-11-18 (option A): threat capped at 36 (was 45), so courses can be made in time.
  // Owner, 2026-11-21: smaller steps up from region one: 3 to 5 areas, +1 every 3 nodes, areas 8 to 15 tiles (was 3 to 6, every 2, 9 to 15).
  { areas: { start: 3, every: 3, max: 5 }, areaSize: [8, 15], threat: { start: 18, perNode: 3, cap: 36 }, maxEnemies: 14, toughness: [{ stat: 'health', amount: 1 }], bosses: ['gloamhorn'], oddsColumn: 2, detail: DETAIL[1]!,
    par: [
      { stat: 'maxShots', amount: 1 },
      { stat: 'hitDamage', amount: 1 },
      { stat: 'shotPower', amount: 0.1 },
    ],
  },
  {
    // Owner, 2026-11-21: smaller steps up from region one: 4 to 6 areas, +1 every 3 nodes, areas 9 to 15 tiles
    // (was 4 to 7, every 2, 10 to 16; before 2026-11-19, 5 to 8). Endless regions keep this size.
    areas: { start: 4, every: 3, max: 6 },
    areaSize: [9, 15],
    threat: { start: 28, perNode: 3, cap: 60 },
    maxEnemies: 18,
    toughness: [
      { stat: 'health', amount: 1 },
      { stat: 'attackDamage', amount: 1 },
    ],
    bosses: ['brood-queen'],
    detail: DETAIL[2]!,
    oddsColumn: 3,
    // Owner, 2026-11-19 (round 1, option C): the bot also gets the Deep Breath and Tough Shell boosts on top
    // (max shots +1, max health +1; was +2 and +2) and the best gear for clearing a course.
    par: [
      { stat: 'maxShots', amount: 3 },
      { stat: 'hitDamage', amount: 1 },
      { stat: 'shotPower', amount: 0.2 },
      { stat: 'maxHealth', amount: 3 },
    ],
    // Giant's Knuckle (hit damage +3), Bastion Plate (max health +3, first 2 damages ignored), Pocket Watch (max shots +2, an extra nap).
    parGear: { weapon: 'giants-knuckle', armour: 'bastion-plate', bauble: 'pocket-watch' },
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
