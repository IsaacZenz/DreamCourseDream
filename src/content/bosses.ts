/**
 * Bosses (FEATURES.md section 5; Milestone 7 design sheet,
 * docs/plans/milestone-7.md section 2, signed off by the owner 2026-11-17).
 *
 * A boss is an enemy (tier 5, in objects.ts) whose behaviour names one of
 * these entries. A new boss that reuses slams and summons is a data entry here
 * plus an enemy entry and a placeholder sprite. Every number is a starting
 * value.
 */

/** One phase: it holds while health is above `above` × full health (the last phase has 0). */
export interface BossPhase {
  readonly above: number;
  /** Slam radius in tiles this phase, or null for no slams. */
  readonly slamRadius: number | null;
  /** Summon one minion each enemy turn while fewer than this many of its minions are alive (0: no summons). */
  readonly maxMinions: number;
  /** Who it summons, with pick weights. */
  readonly pool: readonly { readonly id: string; readonly weight: number }[];
}

export interface BossDef {
  readonly id: string;
  readonly name: string;
  /** None for the Warden; Milestone 8 bosses may have one (a shield that drops only after it attacks...). */
  readonly gimmick: string | null;
  /** The arena layout set: one is picked at random, never the one used in the last boss fight (owner, 2026-11-17). */
  readonly arenas: readonly string[];
  readonly phases: readonly BossPhase[];
  /** A slam marks a ring round the resting ball; it lands on the next enemy turn. */
  readonly slam: { readonly damage: number; readonly knockSpeed: number; readonly knockHop: number };
  /** Dropped near it when it enters a new phase ("sheds a plate"). */
  readonly shed: readonly string[];
  /** Owner, 2026-11-17 (question 7, default): summoned minions leave no flag pole. */
  readonly minionsLeaveFlag: boolean;
  /** A summon never appears within this many tiles of the ball or another thing. */
  readonly spawnClear: number;
  /**
   * Hits that count per shot. Built 2026-11-17 (not on the sheet): without a
   * limit the ball rattles against a big boss on a slope or island and lands
   * a dozen hits in one shot.
   */
  readonly hitsPerShot: number;
}

const CARRIERS = ['leadgrub', 'embergrub', 'hopgrub', 'whirlgrub'];
const each = (ids: readonly string[], weight: number) => ids.map((id) => ({ id, weight }));

const defs: readonly BossDef[] = [
  {
    id: 'stagwarden',
    name: 'The Stagwarden',
    gimmick: null,
    arenas: ['bumper-ring', 'sinkhole-bowl', 'ice-rink', 'the-moat', 'storm-steps'],
    phases: [
      // Phase 1: slow slams.
      { above: 2 / 3, slamRadius: 1.5, maxMinions: 0, pool: [] },
      // Phase 2: summons. Mossback 40%, a carrier 40% (10% each), Spitter 20%.
      { above: 1 / 3, slamRadius: null, maxMinions: 3, pool: [{ id: 'snoozegrub', weight: 40 }, ...each(CARRIERS, 10), { id: 'spittlebug', weight: 20 }] },
      // Phase 3: both, faster. A carrier 50%, Spitter 25%, Lunger 25%.
      { above: 0, slamRadius: 2.25, maxMinions: 2, pool: [...each(CARRIERS, 12.5), { id: 'spittlebug', weight: 25 }, { id: 'pouncehopper', weight: 25 }] },
    ],
    slam: { damage: 1, knockSpeed: 6, knockHop: 2 },
    shed: ['heart', 'shot-orb'],
    minionsLeaveFlag: false,
    spawnClear: 1,
    hitsPerShot: 1,
  },
];

export const BOSSES: ReadonlyMap<string, BossDef> = new Map(defs.map((d) => [d.id, d]));
