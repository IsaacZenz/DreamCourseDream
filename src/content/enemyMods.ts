/**
 * What can make one placed enemy different from its entry (Milestone 8 round 1
 * design sheet, docs/plans/milestone-8.md sections 4 and 5, signed off by the
 * owner 2026-11-19): ranks (Veteran, Elite), traits, an element, a weak spot or
 * guarded side, and a gear item it carries.
 *
 * A course file writes these on the enemy's entry ("rank", "traits",
 * "element", "spot", "gear"); the generator rolls them (src/gen/). Every
 * number here is a starting value.
 */
import type { GearCategory } from './gear.ts';
import type { Element, Side } from './objects.ts';

export interface RankDef {
  /** 1 = Veteran (tier 3 from a tier 2 enemy), 2 = Elite (tier 4). */
  readonly rank: number;
  readonly name: string;
  readonly extraHealth: number;
  /** Owner, 2026-11-18: Veterans and Elites are worth 2 stars (traits add none). */
  readonly stars: number;
  /** Traits: this many, and with `extraTraitChance` one more. */
  readonly traits: number;
  readonly extraTraitChance: number;
  readonly elementChance: number;
  readonly spotChance: number;
  readonly gearChance: number;
  /** Elite: a blue star chance on defeat, times drop luck. */
  readonly blueStarChance: number;
  /** Generator cost: the enemy's cost times this, plus its traits. */
  readonly costScale: number;
}

export const RANKS: readonly RankDef[] = [
  { rank: 1, name: 'Veteran', extraHealth: 1, stars: 2, traits: 1, extraTraitChance: 0.3, elementChance: 0.7, spotChance: 0.3, gearChance: 0.25, blueStarChance: 0, costScale: 1.5 },
  { rank: 2, name: 'Elite', extraHealth: 2, stars: 2, traits: 2, extraTraitChance: 0.3, elementChance: 1, spotChance: 0.7, gearChance: 0.6, blueStarChance: 0.1, costScale: 2 },
];

export const rankDef = (rank: number): RankDef | undefined => RANKS.find((r) => r.rank === rank);

/** The six traits (FEATURES.md section 4; sheet section 5.1). Their rules live in src/sim/play.ts. */
export const TRAIT_IDS = ['shielded', 'armoured', 'swift', 'explosive', 'regenerating', 'splitting'] as const;
export type TraitId = (typeof TRAIT_IDS)[number];

export interface TraitDef {
  readonly id: TraitId;
  readonly name: string;
  readonly icon: string;
  /** Extra generator cost. */
  readonly cost: number;
}

export const TRAITS: ReadonlyMap<TraitId, TraitDef> = new Map(
  (
    [
      { id: 'shielded', name: 'Shielded', icon: 'trait-shielded', cost: 2 },
      { id: 'armoured', name: 'Armoured', icon: 'trait-armoured', cost: 1 },
      { id: 'swift', name: 'Swift', icon: 'trait-swift', cost: 2 },
      { id: 'explosive', name: 'Explosive', icon: 'trait-explosive', cost: 1 },
      { id: 'regenerating', name: 'Regenerating', icon: 'trait-regenerating', cost: 2 },
      { id: 'splitting', name: 'Splitting', icon: 'trait-splitting', cost: 2 },
    ] as const
  ).map((t) => [t.id, t]),
);

/** Trait numbers (sheet sections 5.1 and 5.1a). */
export const TRAIT_RULES = {
  armouredHealth: 1,
  /** Swift: patrollers move this much faster; launchers act this many times per enemy turn; diggers pop out after this long. */
  swiftSpeed: 1.6,
  swiftActions: 2,
  swiftPopDelay: 0.15,
  /** Explosive (owner, 2026-11-19, option A): a blast never defeats an enemy; it stops at 1 health. */
  blast: { fuse: 0.6, radius: 1.5, damage: 1, knockSpeed: 6, knockHop: 2 },
  /** Two Explosive enemies are never placed closer than this, in tiles (the generator). */
  explosiveSpacing: 3,
  regenerate: 1,
  /** Splitting: two of these pop out this far to either side. */
  splitInto: 'grublet',
  splitCount: 2,
  splitOffset: 0.6,
} as const;

/** Weak spots and guarded sides a promoted enemy can roll (sheet section 4.2). */
export type SpotId = 'softTop' | 'weakBack' | 'guardedFront';
export const SPOTS: Readonly<Record<SpotId, { readonly name: string; readonly weak: Side | null; readonly guarded: Side | null }>> = {
  softTop: { name: 'Soft top', weak: 'above', guarded: null },
  weakBack: { name: 'Weak back', weak: 'behind', guarded: null },
  guardedFront: { name: 'Guarded front', weak: null, guarded: 'front' },
};
export const SPOT_IDS = Object.keys(SPOTS) as SpotId[];

/** Enemy gear (FEATURES.md section 4, sheet section 5.3): a fixed bonus by category, not the item's own effect. */
export const ENEMY_GEAR = {
  bonus: { weapon: { attackDamage: 1, health: 0, stars: 0 }, armour: { attackDamage: 0, health: 1, stars: 0 }, bauble: { attackDamage: 0, health: 0, stars: 1 } } as Readonly<
    Record<GearCategory, { readonly attackDamage: number; readonly health: number; readonly stars: number }>
  >,
  /** Open question F3 (default): 10%, times the ball's drop luck. */
  dropChance: 0.1,
} as const;

/** One placed enemy's extras, as written in a course file. */
export interface EnemyExtras {
  readonly rank: number;
  readonly traits: readonly TraitId[];
  readonly element: Element | null;
  readonly spot: SpotId | null;
  readonly gear: string | null;
}

export const NO_EXTRAS: EnemyExtras = { rank: 0, traits: [], element: null, spot: null, gear: null };

/**
 * How a region's generator dresses its enemies (sheet sections 4.1 and 5.2).
 * Each placed squad member is a Veteran with chance `veteran`, an Elite with
 * chance `elite`; each squad has a leader one rank up with chance `leader`;
 * each squad rolls a theme (none, an element, a trait), which each member
 * takes with chance `themeShare` (open question F4 default: 70%).
 */
export interface EnemyMix {
  readonly veteran: number;
  readonly elite: number;
  readonly leader: number;
  readonly themes: { readonly none: number; readonly element: number; readonly trait: number };
  readonly themeShare: number;
  /** Hard courses: 'all' gives every squad a leader one rank up; 'one' gives the course a single Veteran leader (region 1). */
  readonly hardLeaders: 'all' | 'one';
  /** The highest rank in the region: a leader never goes above it (region 2 has no Elites). */
  readonly maxRank: number;
}

export const REGION_MIXES: readonly EnemyMix[] = [
  { veteran: 0, elite: 0, leader: 0, themes: { none: 0.8, element: 0.2, trait: 0 }, themeShare: 0.7, hardLeaders: 'one', maxRank: 1 },
  { veteran: 0.15, elite: 0, leader: 0.5, themes: { none: 0.4, element: 0.3, trait: 0.3 }, themeShare: 0.7, hardLeaders: 'all', maxRank: 1 },
  { veteran: 0.25, elite: 0.08, leader: 1, themes: { none: 0.2, element: 0.4, trait: 0.4 }, themeShare: 0.7, hardLeaders: 'all', maxRank: 2 },
];

/** Endless mode (owner, 2026-11-18; sheet section 10a): each region after the third adds this much, up to the cap. */
export const ENDLESS_MIX_STEP = { veteran: 0.03, elite: 0.04, cap: 0.4 } as const;
