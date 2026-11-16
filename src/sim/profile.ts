/**
 * What is kept between runs (Milestone 7 design sheet, sections 4.3, 5 and 7b,
 * signed off by the owner 2026-11-16): the blue star stash, permanent upgrade
 * levels, the starting ability unlock and choice, and the Burrow with its hold.
 *
 * Plain data and rules. The display saves it in the browser (src/save/).
 */
import { ABILITIES } from '../content/abilities.ts';
import { GEAR, GEAR_CATEGORIES, NO_GEAR, type GearCategory } from '../content/gear.ts';
import { PERMANENT_LIST, PERMANENTS, UNLOCKS, type UnlockId } from '../content/permanent.ts';
import type { Modifier } from './stats.ts';

/** The Burrow: one stored gear item per category. Kept between runs (it survives death). */
export type Burrow = { -readonly [C in GearCategory]: string | null };

/** One line on the hub about the run before. */
export interface LastRun {
  readonly result: 'won' | 'died' | 'shots' | 'left';
  readonly region: number;
  readonly row: number;
  readonly blueStashed: number;
  readonly blueLost: number;
}

export interface Profile {
  /** Blue stars stashed in the Burrow: safe forever, spent on the hub. */
  stash: number;
  /** Levels bought, by permanent upgrade id. */
  readonly levels: Record<string, number>;
  readonly unlocks: Record<UnlockId, boolean>;
  /** The ability chosen to start runs with (needs the unlock), or null. */
  startingAbility: string | null;
  readonly burrow: Burrow;
  /**
   * Owner, 2026-11-16: items sent to a full Burrow slot wait here. The next
   * Burrow visit makes the player choose what to wear, house and sell. Safe
   * from death until then.
   */
  hold: string[];
  lastRun: LastRun | null;
}

export function newProfile(): Profile {
  return { stash: 0, levels: {}, unlocks: { startingAbility: false }, startingAbility: null, burrow: { ...NO_GEAR }, hold: [], lastRun: null };
}

/** The level of a permanent upgrade (0 to its number of levels). */
export function levelOf(p: Profile, id: string): number {
  return p.levels[id] ?? 0;
}

/** The next level's cost, or null at the top level. */
export function nextCost(p: Profile, id: string): number | null {
  const def = PERMANENTS.get(id);
  if (!def) return null;
  return def.costs[levelOf(p, id)] ?? null;
}

/** Buy the next level. Returns null, or why it could not be bought. Owner default: no refunds. */
export function buyLevel(p: Profile, id: string): string | null {
  const cost = nextCost(p, id);
  if (!PERMANENTS.has(id)) return 'UNKNOWN UPGRADE';
  if (cost === null) return 'TOP LEVEL';
  if (cost > p.stash) return 'NOT ENOUGH BLUE STARS';
  p.stash -= cost;
  p.levels[id] = levelOf(p, id) + 1;
  return null;
}

export function buyUnlock(p: Profile, id: UnlockId): string | null {
  if (p.unlocks[id]) return 'ALREADY UNLOCKED';
  const cost = UNLOCKS[id].cost;
  if (cost > p.stash) return 'NOT ENOUGH BLUE STARS';
  p.stash -= cost;
  p.unlocks[id] = true;
  return null;
}

/** Choose the starting ability (any built ability, or none; owner, 2026-11-16). */
export function chooseStartingAbility(p: Profile, id: string | null): boolean {
  if (!p.unlocks.startingAbility) return false;
  if (id !== null && !ABILITIES.has(id)) return false;
  p.startingAbility = id;
  return true;
}

/** The ability a new run starts with. */
export function startingAbilityOf(p: Profile): string | null {
  return p.unlocks.startingAbility ? p.startingAbility : null;
}

/** Every bought level as a modifier (source "permanent", lasting forever). */
export function permanentModifiers(p: Profile): Modifier[] {
  const out: Modifier[] = [];
  for (const def of PERMANENT_LIST) {
    for (let i = 0; i < levelOf(p, def.id); i++) out.push({ stat: def.stat, op: def.op, amount: def.amount, source: { kind: 'permanent', id: def.id }, duration: { kind: 'forever' } });
  }
  return out;
}

/** Owner, 2026-11-16: an item sells for 25% of its price, rounded down (the rarity price, before any discount). */
export const SELL_SHARE = 0.25;
export function sellValue(id: string): number {
  const g = GEAR.get(id);
  return g ? Math.floor(g.price * SELL_SHARE) : 0;
}

/**
 * Read a saved profile, checking every field. Anything unknown is dropped,
 * levels above the top are lowered to the top. Never throws.
 */
export function cleanProfile(raw: unknown): Profile {
  const p = newProfile();
  if (!raw || typeof raw !== 'object') return p;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);
  p.stash = num(r.stash);
  const lv = r.levels && typeof r.levels === 'object' ? (r.levels as Record<string, unknown>) : {};
  for (const def of PERMANENT_LIST) {
    const n = Math.min(def.costs.length, num(lv[def.id]));
    if (n > 0) p.levels[def.id] = n;
  }
  const un = r.unlocks && typeof r.unlocks === 'object' ? (r.unlocks as Record<string, unknown>) : {};
  for (const id of Object.keys(UNLOCKS) as UnlockId[]) p.unlocks[id] = un[id] === true;
  p.startingAbility = typeof r.startingAbility === 'string' && ABILITIES.has(r.startingAbility) ? r.startingAbility : null;
  const bw = r.burrow && typeof r.burrow === 'object' ? (r.burrow as Record<string, unknown>) : {};
  for (const c of GEAR_CATEGORIES) {
    const id = bw[c];
    p.burrow[c] = typeof id === 'string' && GEAR.get(id)?.category === c ? id : null;
  }
  p.hold = Array.isArray(r.hold) ? r.hold.filter((id): id is string => typeof id === 'string' && GEAR.has(id)) : [];
  const lr = r.lastRun as Record<string, unknown> | null | undefined;
  if (lr && typeof lr === 'object' && ['won', 'died', 'shots', 'left'].includes(lr.result as string)) {
    p.lastRun = { result: lr.result as LastRun['result'], region: num(lr.region), row: num(lr.row), blueStashed: num(lr.blueStashed), blueLost: num(lr.blueLost) };
  }
  return p;
}
