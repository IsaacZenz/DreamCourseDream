/**
 * Dressing placed enemies (Milestone 8 round 1 design sheet,
 * docs/plans/milestone-8.md sections 4.1, 5.2 and 5.3): squad themes, squad
 * leaders, ranks (Veteran, Elite), traits, elements, weak spots and carried
 * gear. All rolls come from the generator's seeded stream.
 */
import { RANKS, SPOT_IDS, TRAITS, TRAIT_RULES, rankDef, type EnemyMix, type SpotId, type TraitId } from '../content/enemyMods.ts';
import { GEAR_LIST, RARITIES, RARITY_ODDS } from '../content/gear.ts';
import { ELEMENT_IDS, type Element, type EnemyDef } from '../content/objects.ts';
import type { Rng } from '../sim/rng.ts';

export interface Dress {
  rank: number;
  traits: TraitId[];
  element: Element | null;
  spot: SpotId | null;
  gear: string | null;
}

export type SquadTheme = { kind: 'none' } | { kind: 'element'; element: Element } | { kind: 'trait'; trait: TraitId };

/** A squad's theme (sheet section 5.2). */
export function rollTheme(rng: Rng, mix: EnemyMix): SquadTheme {
  const t = mix.themes;
  const r = rng.float(0, t.none + t.element + t.trait);
  if (r < t.none) return { kind: 'none' };
  if (r < t.none + t.element) return { kind: 'element', element: rng.pick(ELEMENT_IDS) };
  return { kind: 'trait', trait: rng.pick([...TRAITS.keys()]) };
}

/** The rank a squad member is born with (before the leader's step up). */
export function rollRank(rng: Rng, mix: EnemyMix): number {
  const r = rng.float(0, 1);
  return r < mix.elite ? 2 : r < mix.elite + mix.veteran ? 1 : 0;
}

/** The generator cost of a dressed enemy: its own cost times its rank's scale, plus its traits. */
export function dressCost(def: EnemyDef, d: Dress): number {
  const scale = rankDef(d.rank)?.costScale ?? 1;
  return Math.ceil(def.cost * scale) + d.traits.reduce((n, t) => n + (TRAITS.get(t)?.cost ?? 0), 0);
}

/**
 * Roll one enemy's dress. `explosiveNear` says whether another Explosive enemy
 * is too close (sheet section 5.1a: never within 3 tiles of each other).
 */
export function rollDress(rng: Rng, def: EnemyDef, rank: number, theme: SquadTheme, mix: EnemyMix, oddsColumn: number, explosiveNear: boolean): Dress {
  const d: Dress = { rank, traits: [], element: null, spot: null, gear: null };
  const allowed = (t: TraitId) => def.allowedTraits.includes(t) && !(t === 'explosive' && explosiveNear);
  // The squad's theme, taken with 70% chance.
  if (theme.kind !== 'none' && rng.chance(mix.themeShare)) {
    if (theme.kind === 'element') d.element = theme.element;
    else if (allowed(theme.trait)) d.traits.push(theme.trait);
  }
  const rd = rankDef(rank);
  if (!rd) return d;
  const want = rd.traits + (rng.chance(rd.extraTraitChance) ? 1 : 0);
  const pool = [...TRAITS.keys()].filter((t) => allowed(t) && !d.traits.includes(t));
  while (d.traits.length < want && pool.length) d.traits.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  if (!d.element && rng.chance(rd.elementChance)) d.element = rng.pick(ELEMENT_IDS);
  // A weak spot or guarded side, unless the bug already has its own.
  if (!def.weakSpots.length && !def.guardedSides.length && rng.chance(rd.spotChance)) d.spot = rng.pick(SPOT_IDS);
  if (def.allowedGear.length && rng.chance(rd.gearChance)) d.gear = rollGear(rng, def.allowedGear, oddsColumn);
  return d;
}

/** A gear item of one of these categories, by the region's rarity odds. */
function rollGear(rng: Rng, categories: readonly string[], oddsColumn: number): string | null {
  const weights = RARITY_ODDS[Math.min(RARITY_ODDS.length - 1, Math.max(0, oddsColumn))]!.weights;
  const items = GEAR_LIST.filter((g) => categories.includes(g.category));
  const w = items.map((g) => weights[RARITIES.indexOf(g.rarity)] ?? 0);
  if (!items.length || w.every((x) => x <= 0)) return null;
  return items[rng.weighted(w)]!.id;
}

/** Make a dress cheaper until it fits: drop gear, then traits, then a rank. Returns null if even the plain enemy does not fit. */
export function fitDress(def: EnemyDef, d: Dress, budget: number): Dress | null {
  const out: Dress = { ...d, traits: [...d.traits] };
  while (dressCost(def, out) > budget) {
    if (out.traits.length) out.traits.pop();
    else if (out.rank > 0) out.rank--;
    else return def.cost <= budget ? out : null;
  }
  return out;
}

export const MAX_RANK = Math.max(...RANKS.map((r) => r.rank));
void TRAIT_RULES;
