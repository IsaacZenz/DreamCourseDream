/**
 * Course generator numbers (Milestone 5 and 5b design sheets,
 * docs/plans/milestone-5.md and milestone-5b.md). Every number here is a
 * starting value. Landforms, passages and set pieces are in landforms.ts;
 * enemy and object costs are the `cost` fields in objects.ts; hazard costs are
 * the `cost` fields in surfaces.ts.
 */
import type { EnemyMix } from './enemyMods.ts';
/**
 * How big a journey is, apart from how much is in it (owner, 2026-11-17: size
 * and difficulty scale separately; Milestone 7 sheet section 7.4). The run
 * sets this per region; without it, it follows the budget as in Milestone 5b.
 */
export interface JourneySize {
  /** Number of areas, at random in this range. */
  readonly areas: readonly [number, number];
  /** An area is this many tiles on a side, at random in this range. */
  readonly areaSize: readonly [number, number];
  /** Most enemies on one course. */
  readonly maxEnemies: number;
  /** The bot's shot limit. */
  readonly botShots: number;
  /**
   * Milestone 8: how enemies are dressed (ranks, themes, leaders) in this
   * region, whether this is a hard course, and the gear rarity column for
   * carried gear. Left out: plain enemies, as before.
   */
  readonly mix?: EnemyMix;
  readonly hard?: boolean;
  readonly oddsColumn?: number;
  /** Round 2a: the region's detail dial. Left out: no extra set pieces, obstacles or scenery, as before. */
  readonly detail?: DetailDef;
}

/**
 * The detail dial (round 2a sheet section 1; owner, 2026-11-21): how much
 * terrain, how many extra obstacles and how much scenery a course gets for its
 * size. Paid for separately from the threat budget.
 */
export interface DetailDef {
  /**
   * Set pieces per area: one per `tilesPer` tiles of area, rounded up, at most
   * `max`, picked by `weights` (no kind twice in one area). Null: one per area
   * from the threat budget, exactly as before (region one).
   */
  readonly setPieces: {
    readonly tilesPer: number;
    readonly max: number;
    readonly weights: Readonly<Record<string, number>>;
    /** Moat filling by weight, the chance of rails on the bridge, and the chance of a 1-wide bridge (no rails). */
    readonly moatFill: Readonly<Record<'water' | 'sand' | 'spikes', number>>;
    readonly railChance: number;
    readonly oneWideChance: number;
  } | null;
  /** Extra blockers per 100 tiles of course, picked by weight. Never crates, so stars are unchanged. */
  readonly extraObstacles: { readonly per100: number; readonly weights: Readonly<Record<string, number>> };
  /** Scenery (sheet section 2.6): props per 100 tiles, in clusters, picked by weight. */
  readonly scenery: { readonly per100: number; readonly cluster: readonly [number, number]; readonly weights: Readonly<Record<string, number>> };
}

export const GEN = {
  /** Structure check: the ball can climb a rise of up to this many height steps (half a tile; a lofted shot clears it). */
  climbSteps: 2,
  /** Budget presets (sheet section 3.1). */
  presets: { easy: 8, normal: 12, hard: 20 },
  defaultBudget: 12,
  minBudget: 4,
  maxBudget: 40,
  /** Owner, 2026-11-15: after a win the next generated course's budget rises by a random amount in this range. */
  climbMin: 0,
  climbMax: 4,
  /**
   * Journeys (5b sheet, section 5.2): number of areas and the bot's shot limit
   * from the budget, checked in order: the first row with budget below `under`.
   */
  journey: [
    { under: 10, areas: [2, 2], botShots: 20 },
    { under: 15, areas: [3, 3], botShots: 26 },
    { under: 20, areas: [4, 4], botShots: 32 },
    { under: 30, areas: [5, 5], botShots: 38 },
    { under: Infinity, areas: [6, 7], botShots: 46 },
  ],
  /** An area is this many tiles on a side, at random in the range. */
  areaSize: [8, 14],
  /** Chance the trail turns left or right at each area. */
  turnChance: 0.4,
  /** Pads at the start, the exit and where passages meet an area are kept flat over this many tiles. */
  padRadius: 3,
  /** Edges (5b sheet, section 5.5): shares of the outline by budget. */
  edges: [
    { under: 10, rail: 0.7, rim: 0.2, bare: 0.1 },
    { under: 20, rail: 0.5, rim: 0.2, bare: 0.3 },
    { under: Infinity, rail: 0.3, rim: 0.2, bare: 0.5 },
  ],
  /** Bare edge along the trail costs 1 per this many tiles. */
  bareTilesPerCost: 6,
  /** A rim is this many steps up. */
  rimSteps: 2,
  /** The enemy budget rises along the trail: area k gets weight 1 + k * this. */
  areaWeightRise: 0.3,
  /** Side pockets with loot (5b sheet, section 5.7). */
  pocketMinBudget: 12,
  pocketChance: 0.5,
  pocketSize: 3,
  /** Set pieces per area, at most. */
  setPiecesPerArea: 1,
  /** A gap passage gets a spring at its near edge this often. */
  gapSpringChance: 0.5,
  /** Budget split (sheet section 3.3). */
  terrainShare: 0.25,
  enemyShare: 0.5,
  /** Of what is left after terrain, this share goes to enemies (if more than enemyShare of the whole); the rest to obstacles and hazards. */
  enemyOfRest: 0.75,
  /** Squads (sheet section 4.1). */
  squadMin: 2,
  squadMax: 5,
  minEnemies: 3,
  maxEnemies: 10,
  /** Pick weights for squad members. Enemies not listed are never picked by the generator. */
  enemyWeights: { snoozegrub: 3, mudroller: 2, spittlebug: 2, pouncehopper: 2, 'mole-cricket': 2, 'skitter-ant': 2, bristlecrawler: 2, glowmoth: 1, trapjaw: 2, stinkpuff: 2 } as Record<string, number>,
  /** Ability carriers (sheet section 4.2). */
  carrierChance: 0.6,
  carriers: ['leadgrub', 'embergrub', 'hopgrub', 'whirlgrub', 'frostgrub', 'sparkgrub'],
  /** Obstacles and hazards (sheet section 4.4): pick weights per spot use. */
  obstacleWeights: { blocker: 3, crate: 2, hazard: 3, cloud: 2, slider: 1, gate: 1, crack: 1 } as Record<string, number>,
  blockers: ['rock', 'stump', 'low-wall'],
  /** Free pickups (sheet section 4.5). */
  shotOrbChance: 0.5,
  /** A crate drops a heart instead of its star this often. */
  crateHeartChance: 0.2,
  /** Quota (sheet section 4.6). */
  quotaShare: 0.6,
  minQuota: 2,
  /** Safety rules (sheet section 4.3), in tiles. */
  startClear: 2,
  /** Structure check: ground that can hold the ball near the exit. */
  exitRestTiles: 4,
  exitRestRange: 3,
  /** Reject and retry (sheet section 5.4). */
  attempts: 20,
  fallbackBudgetShare: 0.75,
  /** The bot (sheet section 5.2). */
  bot: {
    /** Default; the journey table above sets it per budget. */
    maxShots: 24,
    /**
     * Owner, 2026-11-18 (relaxed check): the bot only has to survive (1 health
     * left, was 2) and gets 1.5 times the shot limit. The check proves a course
     * can be beaten, not that it is comfortable: failing is part of a roguelike.
     */
    minHealthLeft: 1,
    shotScale: 1.5,
    targetsPerTurn: 3,
    /** Angle offsets tried either side of a straight aim, in degrees. */
    angleOffsets: [-7, 0, 7],
    /** Distance multipliers for ground shots, and a little extra so the ball rolls through an enemy. */
    groundReach: [1.0, 1.25],
    loftReach: [1.0],
    rollThrough: 1.2,
    /** Uphill shots get the speed for climbing the height difference times this. */
    climbMargin: 1.4,
    /** Give up (reject the course) after this many shots in a row with no new star and no step closer. */
    stallShots: 10,
    /** Trial shots are first run only until the ball stops; this many of the best then play on through the enemy turns. */
    finishBest: 3,
    /** Give up (reject the course) after trying this many shots in one game; keeps hopeless courses from taking seconds. */
    maxSimulated: 1200,
    /** ...or this many per allowed shot, whichever is more (long journeys). */
    simulatedPerShot: 30,
    /** When every aimed shot hurts or falls off: a ring of safe shots in this many directions, at these powers. */
    ringDirections: 8,
    ringGround: [0.35, 0.6],
    ringLoft: [0.6, 1],
    /** When no clean shot is found: try this many targets, with these wider angles and powers. */
    wideTargets: 5,
    wideOffsets: [-16, -10, 10, 16],
    wideReach: [1.0, 1.6],
    wideLoft: [1.0, 1.3],
    score: { star: 100, win: 1000, health: 60, sunk: 40, distance: 4, lost: 100000 },
  },
} as const;
