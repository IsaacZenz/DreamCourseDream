/**
 * The save file's format (Milestone 7 design sheet section 7, signed off by the
 * owner 2026-11-16). Pure functions: no browser storage here, so they can be
 * tested in Node. src/save/save.ts reads and writes the browser's storage.
 *
 *   { version: 1, profile: {...}, run: null | {...}, runActive: boolean }
 *
 * - profile: what is kept between runs (src/sim/profile.ts).
 * - run: the run in progress, saved when the player enters a town (the town is
 *   the save point). Cleared when the player leaves the town.
 * - runActive: a run is under way. If the game is opened again with a run
 *   active but none saved, the game was left away from a town and the run is
 *   lost (owner, 2026-11-16).
 *
 * Anything unreadable never crashes the game: the caller keeps a copy of the
 * text and starts fresh, with a notice on the start menu.
 */
import { NO_GEAR, GEAR_CATEGORIES } from '../content/gear.ts';
import { cleanProfile, newProfile, type Profile } from '../sim/profile.ts';

export const SAVE_VERSION = 1;

export interface SaveData {
  readonly profile: Profile;
  /** The run saved at a town, still to be checked by restoreRun. */
  readonly run: unknown;
  readonly runActive: boolean;
}

export type ParsedSave = { ok: true; data: SaveData; migratedBurrow: boolean } | { ok: false; reason: string };

/** A fresh save. */
export function emptySave(): SaveData {
  return { profile: newProfile(), run: null, runActive: false };
}

/**
 * Read the save text. `oldBurrow` is the Milestone 6 Burrow key's text, read
 * once: its items move into the new save when there is no new save yet.
 */
export function parseSave(text: string | null, oldBurrow: string | null = null): ParsedSave {
  if (text === null) {
    const data = emptySave();
    const moved = readOldBurrow(oldBurrow);
    if (moved) for (const c of GEAR_CATEGORIES) data.profile.burrow[c] = moved[c];
    // cleanProfile checks the moved ids.
    return { ok: true, data: { ...data, profile: cleanProfile(data.profile) }, migratedBurrow: !!moved };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not readable' };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not a save' };
  const r = raw as Record<string, unknown>;
  // Later versions add an upgrade step here for each older version, in turn.
  if (r.version !== SAVE_VERSION) return { ok: false, reason: `unknown version ${String(r.version)}` };
  if (!r.profile || typeof r.profile !== 'object') return { ok: false, reason: 'no profile' };
  return { ok: true, data: { profile: cleanProfile(r.profile), run: r.run ?? null, runActive: r.runActive === true }, migratedBurrow: false };
}

function readOldBurrow(text: string | null): Record<(typeof GEAR_CATEGORIES)[number], string | null> | null {
  if (!text) return null;
  try {
    const saved = JSON.parse(text) as { version?: number; slots?: Record<string, unknown> };
    if (saved.version !== 1 || !saved.slots) return null;
    const out = { ...NO_GEAR } as Record<(typeof GEAR_CATEGORIES)[number], string | null>;
    for (const c of GEAR_CATEGORIES) out[c] = typeof saved.slots[c] === 'string' ? (saved.slots[c] as string) : null;
    return out;
  } catch {
    return null;
  }
}

export function serializeSave(data: SaveData): string {
  return JSON.stringify({ version: SAVE_VERSION, profile: data.profile, run: data.run, runActive: data.runActive });
}
