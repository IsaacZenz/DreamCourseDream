/**
 * The stat sheet (FEATURES.md section 1). Each stat has limits and a rounding
 * rule. The ball and every enemy use this one list; not every stat applies to
 * every creature.
 *
 * Nothing changes a stat directly: everything goes through a modifier
 * (src/sim/stats.ts).
 */

export const STAT_IDS = [
  // The ball
  'maxHealth',
  'maxShots',
  'hitDamage',
  'shotPower',
  'guideLength',
  'bounceBoost',
  'starReach',
  'dropLuck',
  'shopPrices',
  'gearCapacity',
  /** Owner, 2026-11-15: naps (recover turns) per course. A stat from Milestone 6 so gear can change it. */
  'naps',
  /** Owner, 2026-11-17: extra filled slices on every success wheel (Knack, Spinner family). */
  'rollSlices',
  /** Owner, 2026-11-17: extra filled slices on the boss wheel only (Grit family). */
  'bossSlices',
  /** Owner, 2026-11-17: yellow stars in the wallet at the start of a run (Head Start). */
  'startingStars',
  // Enemies
  'health',
  'moveRange',
  'attackDamage',
  'attackRange',
  'outerRadius',
  'innerRadius',
] as const;
export type StatId = (typeof STAT_IDS)[number];

export interface StatDef {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  /** Whole numbers (health, shots, damage) or fractions (multipliers, distances). */
  readonly whole: boolean;
}

export const STAT_DEFS: Readonly<Record<StatId, StatDef>> = {
  maxHealth: { name: 'Max health', min: 1, max: 99, whole: true },
  maxShots: { name: 'Max shots', min: 1, max: 99, whole: true },
  // FEATURES.md open question F1 (default): damage may drop to 0, never below.
  hitDamage: { name: 'Hit damage', min: 0, max: 99, whole: true },
  shotPower: { name: 'Shot power', min: 0.1, max: 5, whole: false },
  guideLength: { name: 'Guide length', min: 0, max: 10, whole: false },
  bounceBoost: { name: 'Bounce boost', min: 0, max: 5, whole: false },
  starReach: { name: 'Star reach', min: 0, max: 10, whole: false },
  dropLuck: { name: 'Drop luck', min: 0, max: 10, whole: false },
  shopPrices: { name: 'Shop prices', min: 0.1, max: 10, whole: false },
  gearCapacity: { name: 'Gear capacity', min: 1, max: 3, whole: true },
  naps: { name: 'Naps', min: 0, max: 9, whole: true },
  rollSlices: { name: 'Wheel slices', min: 0, max: 20, whole: true },
  bossSlices: { name: 'Boss wheel slices', min: 0, max: 20, whole: true },
  startingStars: { name: 'Starting stars', min: 0, max: 999, whole: true },
  health: { name: 'Health', min: 1, max: 999, whole: true },
  moveRange: { name: 'Move range', min: 0, max: 20, whole: false },
  attackDamage: { name: 'Attack damage', min: 0, max: 99, whole: true },
  attackRange: { name: 'Attack range', min: 0, max: 20, whole: false },
  outerRadius: { name: 'Outer radius', min: 0, max: 20, whole: false },
  innerRadius: { name: 'Inner radius', min: 0, max: 20, whole: false },
};

export type BaseStats = Partial<Record<StatId, number>>;
