/**
 * Bosses (FEATURES.md section 5; Milestone 7 design sheet,
 * docs/plans/milestone-7.md section 2; Milestone 8 round 1 sheet,
 * docs/plans/milestone-8.md sections 8 to 10, signed off 2026-11-19).
 *
 * A boss is an enemy (tier 5, in objects.ts) whose behaviour names one of
 * these entries. A new boss that reuses slams, charges, globs, rings and
 * summons is a data entry here plus an enemy entry and a placeholder sprite.
 * Every number is a starting value.
 */

/** Milestone 8 (Gloamhorn): charges at the ball. `alternate`: wind up one turn, charge the next. `every`: wind up and charge in the same turn. */
export type ChargeMode = 'alternate' | 'every';

/** One phase: it holds while health is above `above` × full health (the last phase has 0). */
export interface BossPhase {
  readonly above: number;
  /** Slam radius in tiles this phase, or null for no slams (the Stagwarden). */
  readonly slamRadius: number | null;
  /** Summon one minion each enemy turn while fewer than this many of its minions are alive (0: no summons). */
  readonly maxMinions: number;
  /** Who it summons, with pick weights. */
  readonly pool: readonly { readonly id: string; readonly weight: number }[];
  /** Milestone 8 (Gloamhorn): how it charges this phase. Summons only on wind-up turns when it alternates. */
  readonly charge?: ChargeMode;
  /** Milestone 8 (the Brood Queen): lobs this many acid globs, at the ball's spot and `spread` tiles to either side, marked a turn ahead. */
  readonly globs?: { readonly count: number; readonly spread: number };
  /** Milestone 8 (the Brood Queen): a soldier ring round the ball, landing next turn: damage and a status to a ball on the ground in it. */
  readonly ring?: { readonly radius: number; readonly damage: number; readonly status: string };
  /** With both globs and a ring: one or the other, in turn. */
  readonly alternate?: boolean;
}

/**
 * A boss's gimmick (FEATURES.md section 5).
 * - shell (Gloamhorn): every hit is blocked while the shell is closed; it opens after a charge, for the player's next shot.
 * - crown (the Brood Queen): only hits from above count; a ball hitting her side is bitten.
 */
export type BossGimmick = null | { readonly kind: 'shell'; readonly closedBounce: number; readonly openHits: number } | { readonly kind: 'crown'; readonly biteDamage: number };

export interface BossDef {
  readonly id: string;
  readonly name: string;
  /** A one-line title for the boss's introduction card (owner, 2026-11-19). */
  readonly title: string;
  readonly gimmick: BossGimmick;
  /** The arena layout set: one is picked at random, never the one used in the last boss fight (owner, 2026-11-17). */
  readonly arenas: readonly string[];
  /** Health in regions 1, 2 and 3. Endless regions add `ENDLESS_BOSS_GROWTH` of the region 3 health per region. */
  readonly health: readonly [number, number, number];
  readonly phases: readonly BossPhase[];
  /** A slam marks a ring round the resting ball; it lands on the next enemy turn. */
  readonly slam: { readonly damage: number; readonly knockSpeed: number; readonly knockHop: number };
  /** Milestone 8: the charge (Gloamhorn). */
  readonly charge?: { readonly speed: number; readonly damage: number; readonly knockSpeed: number; readonly knockHop: number; readonly windupSeconds: number };
  /** Milestone 8: acid globs (the Brood Queen), lobbed like a Spittlebug's spit. */
  readonly glob?: { readonly loftAngle: number; readonly radius: number };
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

/** Endless mode (sheet section 10a): each region after the third adds this share of the boss's region 3 health (the Stagwarden: +6). */
export const ENDLESS_BOSS_GROWTH = 0.25;

const GRUBS = ['leadgrub', 'embergrub', 'hopgrub', 'whirlgrub'];
const ALL_GRUBS = [...GRUBS, 'frostgrub', 'sparkgrub'];
const each = (ids: readonly string[], weight: number) => ids.map((id) => ({ id, weight }));

const NO_SLAM = { damage: 1, knockSpeed: 6, knockHop: 2 } as const;

const defs: readonly BossDef[] = [
  {
    id: 'stagwarden',
    name: 'The Stagwarden',
    title: 'Guard of the first wood',
    gimmick: null,
    arenas: ['bumper-ring', 'sinkhole-bowl', 'ice-rink', 'the-moat', 'storm-steps'],
    health: [12, 18, 24],
    phases: [
      // Phase 1: slow slams.
      { above: 2 / 3, slamRadius: 1.5, maxMinions: 0, pool: [] },
      // Phase 2: summons. Snoozegrub 40%, a grub 40% (10% each), Spittlebug 20%.
      { above: 1 / 3, slamRadius: null, maxMinions: 3, pool: [{ id: 'snoozegrub', weight: 40 }, ...each(GRUBS, 10), { id: 'spittlebug', weight: 20 }] },
      // Phase 3: both, faster. A grub 50%, Spittlebug 25%, Pouncehopper 25%.
      { above: 0, slamRadius: 2.25, maxMinions: 2, pool: [...each(GRUBS, 12.5), { id: 'spittlebug', weight: 25 }, { id: 'pouncehopper', weight: 25 }] },
    ],
    slam: { damage: 1, knockSpeed: 6, knockHop: 2 },
    shed: ['heart', 'shot-orb'],
    minionsLeaveFlag: false,
    spawnClear: 1,
    hitsPerShot: 1,
  },
  {
    // Milestone 8 sheet section 8: a giant rhinoceros beetle. Its wing cases open only after it charges.
    id: 'gloamhorn',
    name: 'Gloamhorn',
    title: 'The charging shell',
    gimmick: { kind: 'shell', closedBounce: 0.8, openHits: 2 },
    // The open arenas; the Moat and the Sinkhole Bowl do not suit a charging boss.
    arenas: ['bumper-ring', 'ice-rink', 'storm-steps'],
    health: [8, 12, 16],
    phases: [
      // 1 Rumble: wind up one turn, charge the next.
      { above: 2 / 3, slamRadius: null, maxMinions: 0, pool: [], charge: 'alternate' },
      // 2 Brood: the same, and a summon on wind-up turns. Skitter Ant 40%, a grub 40%, Bristlecrawler 20%.
      { above: 1 / 3, slamRadius: null, maxMinions: 2, pool: [{ id: 'skitter-ant', weight: 40 }, ...each(GRUBS, 10), { id: 'bristlecrawler', weight: 20 }], charge: 'alternate' },
      // 3 Frenzy: wind up and charge in the same turn, every turn. No summons.
      { above: 0, slamRadius: null, maxMinions: 0, pool: [], charge: 'every' },
    ],
    slam: NO_SLAM,
    charge: { speed: 9, damage: 1, knockSpeed: 7, knockHop: 1.5, windupSeconds: 1 },
    shed: ['heart', 'shot-orb'],
    minionsLeaveFlag: false,
    spawnClear: 1,
    hitsPerShot: 1,
  },
  {
    // Milestone 8 sheet section 9 (owner, 2026-11-19: option A): the leader of the bugs. Only her back can be hurt, from above.
    id: 'brood-queen',
    name: 'The Brood Queen',
    title: 'Mother of the swarm',
    gimmick: { kind: 'crown', biteDamage: 1 },
    arenas: ['queens-mound'],
    health: [12, 16, 20],
    phases: [
      // 1 Acid rain: three globs, marked a turn ahead.
      { above: 2 / 3, slamRadius: null, maxMinions: 0, pool: [], globs: { count: 3, spread: 1.5 } },
      // 2 Soldier ring: 1 damage and Poisoned; and a summon. Stinkpuff 50%, a grub 50%.
      { above: 1 / 3, slamRadius: null, maxMinions: 2, pool: [{ id: 'stinkpuff', weight: 50 }, ...each(ALL_GRUBS, 50 / ALL_GRUBS.length)], ring: { radius: 1.75, damage: 1, status: 'poisoned' } },
      // 3 The swarm: globs and the ring in turn, and summons. Stinkpuff 30%, Bristlecrawler 30%, Trapjaw 20%, a grub 20%.
      {
        above: 0,
        slamRadius: null,
        maxMinions: 3,
        pool: [{ id: 'stinkpuff', weight: 30 }, { id: 'bristlecrawler', weight: 30 }, { id: 'trapjaw', weight: 20 }, ...each(ALL_GRUBS, 20 / ALL_GRUBS.length)],
        globs: { count: 3, spread: 1.5 },
        ring: { radius: 1.75, damage: 1, status: 'poisoned' },
        alternate: true,
      },
    ],
    slam: NO_SLAM,
    glob: { loftAngle: 55, radius: 0.15 },
    shed: ['heart', 'shot-orb'],
    minionsLeaveFlag: false,
    spawnClear: 1,
    hitsPerShot: 1,
  },
];

export const BOSSES: ReadonlyMap<string, BossDef> = new Map(defs.map((d) => [d.id, d]));
export const BOSS_IDS: readonly string[] = defs.map((d) => d.id);

/** A boss's health in a region; endless regions keep growing (sheet section 10a). */
export function bossHealthIn(def: BossDef, region: number): number {
  if (region <= 3) return def.health[Math.max(1, region) - 1]!;
  return Math.round(def.health[2] * (1 + ENDLESS_BOSS_GROWTH * (region - 3)));
}
