/**
 * Consumables (owner, 2026-11-17; Milestone 7 sheet section 4b.5). The acorn
 * fills extra slices on every success wheel for one course. Found in crates
 * (works at once, for the rest of that course) or bought in a shop (waits in
 * the pocket and is used when the next course starts). Names are working
 * names; every number is a starting value.
 */
import type { Rarity } from './gear.ts';

export interface AcornDef {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** Which pair of rarity odds picks it: common (common + uncommon), rare (rare + double rare), special rare (the top pair). */
  readonly rarity: Extract<Rarity, 'common' | 'rare' | 'specialRare'>;
  /** Extra filled slices for one course. */
  readonly slices: number;
  /** Shop price in yellow stars. */
  readonly price: number;
}

export const ACORN_LIST: readonly AcornDef[] = [
  { id: 'lucky-acorn', name: 'Lucky Acorn', sprite: 'acorn-lucky', rarity: 'common', slices: 2, price: 6 },
  { id: 'golden-acorn', name: 'Golden Acorn', sprite: 'acorn-golden', rarity: 'rare', slices: 3, price: 12 },
  { id: 'star-acorn', name: 'Star Acorn', sprite: 'acorn-star', rarity: 'specialRare', slices: 5, price: 20 },
];

export const ACORNS: ReadonlyMap<string, AcornDef> = new Map(ACORN_LIST.map((a) => [a.id, a]));

/**
 * Pick an acorn from rarity weights in the order of RARITIES (gear.ts): the
 * common acorn takes the first pair's weight, the golden the second pair's,
 * the star the third pair's.
 */
export function acornWeights(rarityWeights: readonly number[]): number[] {
  const w = (i: number) => (rarityWeights[i] ?? 0) + (rarityWeights[i + 1] ?? 0);
  return [w(0), w(2), w(4)];
}

// ---------------------------------------------------------------------------
// Food (round 2a sheet section 4; owner, 2026-11-21)

/**
 * Everything the food shop sells. Code names stay the same as before, so saved
 * runs still load: the stat foods are the old run upgrades (run.ts
 * UPGRADE_LIST), Apple was the Heal service ("heal"), Garlic was Delay the
 * Boss ("raise"), and the acorns are the acorns. Names are what the player sees.
 * - stat: the upgrade's modifier while it lasts (and its heal when eaten).
 * - acorn: extra success-wheel slices while it lasts.
 * - heal / raise: at once when eaten, no duration.
 */
export interface FoodDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly kind: 'stat' | 'acorn' | 'heal' | 'raise';
  /** Pick weight in the food shop (sheet section 4.4). Acorns share ACORN_SHOP_WEIGHT. */
  readonly weight: number;
}

export const FOOD_LIST: readonly FoodDef[] = [
  { id: 'heal', name: 'Apple', icon: 'heart', kind: 'heal', weight: 3 },
  { id: 'raise', name: 'Garlic', icon: 'node-boss', kind: 'raise', weight: 2 },
  { id: 'tough-shell', name: 'Mushroom Stew', icon: 'upgrade-health', kind: 'stat', weight: 3 },
  { id: 'deep-breath', name: 'Trail Mix', icon: 'upgrade-shots', kind: 'stat', weight: 3 },
  { id: 'strong-swing', name: 'Chili Pepper', icon: 'upgrade-power', kind: 'stat', weight: 3 },
  { id: 'long-arms', name: 'Carrot', icon: 'upgrade-reach', kind: 'stat', weight: 3 },
  { id: 'lucky-charm', name: 'Clover Honey', icon: 'upgrade-luck', kind: 'stat', weight: 3 },
  ...ACORN_LIST.map((a): FoodDef => ({ id: a.id, name: a.name, icon: a.sprite, kind: 'acorn', weight: 0 })),
];

export const FOODS: ReadonlyMap<string, FoodDef> = new Map(FOOD_LIST.map((f) => [f.id, f]));

/** The food shop's weight for "an acorn" (which acorn: the region's rarity odds, as before). */
export const ACORN_SHOP_WEIGHT = 3;

export const FOOD = {
  /** The bag holds this many foods. */
  bagSlots: 3,
  /** Food shop offers, gear shop offers. */
  foodOffers: 4,
  gearOffers: 3,
  /** Owner, 2026-11-21 (sheet Q1): chances of lasting 1, 2 or 3 courses. */
  durationWeights: [50, 30, 20] as readonly number[],
  /** Price for 1, 2 or 3 courses: the 1-course price times this, rounded. */
  durationPrice: [1, 1.75, 2.25] as readonly number[],
  /** Stat foods: the 1-course price in region 1, and how much more per region after it. */
  statPrice: 4,
  statPricePerRegion: 1,
  /** Acorns, 1-course price (they keep their region-free prices). */
  acornPrice: { 'lucky-acorn': 3, 'golden-acorn': 5, 'star-acorn': 8 } as Readonly<Record<string, number>>,
  /** Apple and Garlic: one price, no duration. */
  applePrice: 6,
  garlicPrice: 6,
  /** Apple heals this much. */
  appleHeal: 2,
} as const;

/** True for foods that work at once and have no duration (Apple, Garlic). */
export const isInstantFood = (id: string): boolean => {
  const k = FOODS.get(id)?.kind;
  return k === 'heal' || k === 'raise';
};
