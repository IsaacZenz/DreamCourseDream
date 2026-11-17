/**
 * The player's permanent progress (Milestone 7 sheet sections 4 and 5, owner
 * 2026-11-17): the blue star stash, permanent upgrade levels, starting
 * abilities owned and the one chosen, and records for later unlocks. Kept
 * between runs, in the Burrow. Plain TypeScript; the display saves it.
 */
import { ABILITY_PRICE, PERMANENT_UPGRADE_LIST, PERMANENT_UPGRADES, STARTING_ABILITIES } from '../content/progress.ts';
import { DEFAULT_CHARACTER } from '../content/characters.ts';
import type { Modifier } from './stats.ts';

export interface Profile {
  /** Blue stars deposited (the stash). */
  stash: number;
  /** Level of each permanent upgrade bought. */
  readonly levels: Record<string, number>;
  /** Starting abilities owned. */
  readonly abilities: string[];
  /** The one a run starts with, or null. */
  startAbility: string | null;
  /** Always Rollo for now; Milestone 8 adds characters. */
  character: string;
  /** Boss ids beaten at least once (FEATURES.md section 15: first-time unlocks). */
  readonly bossesBeaten: string[];
  /** The arena of the last boss fight, so the next one differs (owner, 2026-11-17). */
  lastArena: string | null;
  readonly totals: { runs: number; bossWins: number; bestRegion: number };
}

export function newProfile(): Profile {
  return { stash: 0, levels: {}, abilities: [], startAbility: null, character: DEFAULT_CHARACTER, bossesBeaten: [], lastArena: null, totals: { runs: 0, bossWins: 0, bestRegion: 1 } };
}

/** Levels as permanent modifiers (FEATURES.md section 1). */
export function permanentModifiers(levels: Readonly<Record<string, number>>): Modifier[] {
  const out: Modifier[] = [];
  for (const u of PERMANENT_UPGRADE_LIST) {
    for (let i = 0; i < Math.min(levels[u.id] ?? 0, u.costs.length); i++) out.push({ stat: u.stat, op: u.op, amount: u.amount, source: { kind: 'permanent', id: u.id }, duration: { kind: 'forever' } });
  }
  return out;
}

/** The next level's cost, or null at the top level. */
export function upgradeCost(p: Profile, id: string): number | null {
  const u = PERMANENT_UPGRADES.get(id);
  if (!u) return null;
  return u.costs[p.levels[id] ?? 0] ?? null;
}

/** Why the next level cannot be bought, or null. */
export function cannotBuyUpgrade(p: Profile, id: string): string | null {
  const cost = upgradeCost(p, id);
  if (cost === null) return 'TOP LEVEL';
  if (cost > p.stash) return 'NOT ENOUGH BLUE STARS';
  return null;
}

/** Buy the next level. Returns null, or why not. No refunds (owner, 2026-11-17). */
export function buyUpgrade(p: Profile, id: string): string | null {
  const why = cannotBuyUpgrade(p, id);
  if (why) return why;
  p.stash -= upgradeCost(p, id)!;
  p.levels[id] = (p.levels[id] ?? 0) + 1;
  return null;
}

export function cannotBuyAbility(p: Profile, id: string): string | null {
  if (!STARTING_ABILITIES.includes(id)) return 'NOT FOR SALE';
  if (p.abilities.includes(id)) return 'OWNED';
  if (ABILITY_PRICE > p.stash) return 'NOT ENOUGH BLUE STARS';
  return null;
}

/** Buy a starting ability. The first one bought becomes the chosen one. */
export function buyAbility(p: Profile, id: string): string | null {
  const why = cannotBuyAbility(p, id);
  if (why) return why;
  p.stash -= ABILITY_PRICE;
  p.abilities.push(id);
  if (!p.startAbility) p.startAbility = id;
  return null;
}

/** Step the starting-ability toggle through none and the owned abilities. */
export function cycleStartAbility(p: Profile, dir: 1 | -1): void {
  const options: (string | null)[] = [null, ...STARTING_ABILITIES.filter((a) => p.abilities.includes(a))];
  const i = options.indexOf(p.startAbility);
  p.startAbility = options[(i + dir + options.length) % options.length] ?? null;
}
