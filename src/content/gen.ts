/**
 * Course generator numbers (Milestone 5 design sheet, docs/plans/milestone-5.md).
 * Every number here is a starting value. Chunk shapes are data files in
 * src/content/chunks/; enemy and object costs are the `cost` fields in
 * objects.ts; hazard costs are the `cost` fields in surfaces.ts.
 */
export const GEN = {
  /** Chunks are this many tiles on a side. */
  chunkSize: 5,
  /** Budget presets (sheet section 3.1). */
  presets: { easy: 8, normal: 12, hard: 20 },
  defaultBudget: 12,
  minBudget: 4,
  maxBudget: 40,
  /** Owner, 2026-11-15: after a win the next generated course's budget rises by a random amount in this range. */
  climbMin: 0,
  climbMax: 4,
  /** Course size from the budget (sheet section 3.2), checked in order: the first with budget below `under` is used. */
  sizes: [
    { under: 10, slots: [3, 3], route: [3, 4], branches: [0, 1] },
    { under: 20, slots: [4, 3], route: [4, 5], branches: [0, 1] },
    { under: Infinity, slots: [4, 4], route: [5, 6], branches: [1, 2] },
  ],
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
  enemyWeights: { mossback: 3, trundler: 2, spitter: 2, lunger: 2, mole: 2 } as Record<string, number>,
  /** Ability carriers (sheet section 4.2). */
  carrierChance: 0.6,
  carriers: ['anchorback', 'emberback', 'hopback', 'whirlback'],
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
    maxShots: 24,
    minHealthLeft: 2,
    targetsPerTurn: 3,
    /** Angle offsets tried either side of a straight aim, in degrees. */
    angleOffsets: [-7, 0, 7],
    /** Distance multipliers for ground shots, and a little extra so the ball rolls through an enemy. */
    groundReach: [1.0, 1.25],
    loftReach: [1.0],
    rollThrough: 1.2,
    /** Trial shots are first run only until the ball stops; this many of the best then play on through the enemy turns. */
    finishBest: 3,
    /** Give up (reject the course) after trying this many shots in one game; keeps hopeless courses from taking seconds. */
    maxSimulated: 1500,
    /** When no clean shot is found: try this many targets, with these wider angles and powers. */
    wideTargets: 5,
    wideOffsets: [-16, -10, 10, 16],
    wideReach: [1.0, 1.6],
    wideLoft: [1.0, 1.3],
    score: { star: 100, win: 1000, health: 60, sunk: 40, distance: 4, lost: 100000 },
  },
} as const;
