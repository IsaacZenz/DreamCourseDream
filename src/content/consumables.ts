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
