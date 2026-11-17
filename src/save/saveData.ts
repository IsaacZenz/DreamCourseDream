/**
 * The save (Milestone 7 sheet section 6, owner 2026-11-17): one save with a
 * version number, in three parts that are checked on their own, so a damaged
 * run save never wipes the blue star stash.
 *
 * - profile: blue star stash, permanent upgrades, abilities, records.
 * - burrow: the stored gear (one per category).
 * - run: a run in progress, kept only while the player is in a town.
 *
 * Plain TypeScript (no browser): `store.ts` puts the text in local storage.
 */
import { GEAR, GEAR_CATEGORIES, NO_GEAR, type GearSlots } from '../content/gear.ts';
import { PERMANENT_UPGRADES, STARTING_ABILITIES } from '../content/progress.ts';
import { newProfile, type Profile } from '../sim/profile.ts';
import type { RunMap, RunState } from '../sim/run.ts';

export const SAVE_VERSION = 1;

/** A run without its map (the map is made again from the seed). */
export type RunSnapshot = Omit<RunState, 'map'>;

export interface SaveData {
  readonly profile: Profile;
  readonly burrow: GearSlots;
  readonly run: RunSnapshot | null;
}

export interface Loaded {
  readonly data: SaveData;
  /** Parts that could not be read and were started empty: shown to the player, and the raw text kept as a backup. */
  readonly broken: readonly ('save' | 'profile' | 'burrow' | 'run')[];
}

export function emptySave(): SaveData {
  return { profile: newProfile(), burrow: NO_GEAR, run: null };
}

export function encodeSave(d: SaveData): string {
  return JSON.stringify({ version: SAVE_VERSION, profile: d.profile, burrow: d.burrow, run: d.run });
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';

/**
 * Upgrades an older save to the current version, one step at a time. Each
 * entry turns version n into n + 1. Empty until the save format first changes.
 */
const MIGRATIONS: readonly ((old: Obj) => Obj)[] = [];

/** Read a save. Never throws: anything unreadable is started empty and listed in `broken`. */
export function decodeSave(raw: string | null): Loaded {
  if (raw === null || raw === '') return { data: emptySave(), broken: [] };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { data: emptySave(), broken: ['save'] };
  }
  if (!isObj(obj) || !isNum(obj.version) || obj.version < 1 || obj.version > SAVE_VERSION) return { data: emptySave(), broken: ['save'] };
  let o: Obj = obj;
  for (let v = o.version as number; v < SAVE_VERSION; v++) o = MIGRATIONS[v - 1]!(o);
  const broken: ('profile' | 'burrow' | 'run')[] = [];
  const profile = readProfile(o.profile);
  if (!profile) broken.push('profile');
  const burrow = readBurrow(o.burrow);
  if (!burrow) broken.push('burrow');
  let run: RunSnapshot | null = null;
  if (o.run !== null && o.run !== undefined) {
    run = readRun(o.run);
    if (!run) broken.push('run');
  }
  return { data: { profile: profile ?? newProfile(), burrow: burrow ?? NO_GEAR, run }, broken };
}

function readProfile(v: unknown): Profile | null {
  if (!isObj(v) || !isNum(v.stash) || v.stash < 0 || !isObj(v.levels) || !Array.isArray(v.abilities) || !isStrOrNull(v.startAbility)) return null;
  if (!Array.isArray(v.bossesBeaten) || !isStrOrNull(v.lastArena ?? null) || !isObj(v.totals)) return null;
  const p = newProfile();
  p.stash = Math.floor(v.stash);
  for (const [id, n] of Object.entries(v.levels)) {
    const u = PERMANENT_UPGRADES.get(id);
    // Unknown upgrades are dropped; levels are kept inside the upgrade's range.
    if (u && isNum(n)) p.levels[id] = Math.max(0, Math.min(u.costs.length, Math.floor(n)));
  }
  for (const a of v.abilities) if (typeof a === 'string' && STARTING_ABILITIES.includes(a) && !p.abilities.includes(a)) p.abilities.push(a);
  p.startAbility = v.startAbility && p.abilities.includes(v.startAbility) ? v.startAbility : null;
  if (typeof v.character === 'string') p.character = v.character;
  for (const b of v.bossesBeaten) if (typeof b === 'string') p.bossesBeaten.push(b);
  p.lastArena = (v.lastArena as string | null | undefined) ?? null;
  const t = v.totals;
  if (isNum(t.runs)) p.totals.runs = t.runs;
  if (isNum(t.bossWins)) p.totals.bossWins = t.bossWins;
  if (isNum(t.bestRegion)) p.totals.bestRegion = t.bestRegion;
  return p;
}

function gearOrNull(id: unknown, c: string): string | null | undefined {
  if (id === null || id === undefined) return null;
  return typeof id === 'string' && GEAR.get(id)?.category === c ? id : undefined;
}

function readBurrow(v: unknown): GearSlots | null {
  if (v === undefined || v === null) return NO_GEAR;
  if (!isObj(v)) return null;
  const out: Record<string, string | null> = {};
  for (const c of GEAR_CATEGORIES) {
    // An item that no longer exists is dropped rather than failing the whole Burrow.
    out[c] = gearOrNull(v[c], c) ?? null;
  }
  return out as GearSlots;
}

/** The run must be in a town (the only place it is saved) and every field must have the right shape. */
function readRun(v: unknown): RunSnapshot | null {
  if (!isObj(v) || typeof v.seed !== 'string' || v.status !== 'shop' || !isObj(v.shop) || !isObj(v.current)) return null;
  for (const k of ['countdown', 'raises', 'counted', 'health', 'wallet', 'blueStars', 'banked', 'toStash', 'region']) if (!isNum(v[k])) return null;
  for (const k of ['path', 'bossesBeaten']) if (!Array.isArray(v[k])) return null;
  for (const k of ['upgrades', 'bought', 'totals', 'permanent', 'gear', 'burrow']) if (!isObj(v[k])) return null;
  if (!isStrOrNull(v.at) || !isStrOrNull(v.ability) || !isStrOrNull(v.pocket ?? null)) return null;
  for (const c of GEAR_CATEGORIES) if (gearOrNull((v.gear as Obj)[c], c) === undefined) return null;
  const shop = v.shop;
  if (!Array.isArray(shop.offers) || !isNum(shop.rerolls) || !isNum(shop.freeRerolls) || typeof shop.raised !== 'boolean') return null;
  return v as unknown as RunSnapshot;
}

/** A run as saved: everything but the map. */
export function snapshotRun(run: RunState): RunSnapshot {
  const { map: _map, ...rest } = run;
  void _map;
  return JSON.parse(JSON.stringify(rest)) as RunSnapshot;
}

/** Put a saved run back together with its map (made again from the seed). */
export function restoreRun(snap: RunSnapshot, map: RunMap): RunState {
  return { ...(JSON.parse(JSON.stringify(snap)) as RunSnapshot), map } as RunState;
}
