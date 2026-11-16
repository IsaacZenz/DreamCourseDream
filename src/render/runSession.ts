/**
 * The run being played and the player's profile, shared by the menu, hub, map,
 * town and course scenes. The rules are in src/sim/run.ts and
 * src/sim/profile.ts; this holds them, makes maps and bosses (src/gen/), and
 * saves (src/save/).
 *
 * Saving (Milestone 7, owner 2026-11-15 and 2026-11-16): the profile is saved
 * whenever it changes. The run itself is saved only while the player is in a
 * town, the save point. Leaving the game anywhere else loses the run.
 */
import { pickBoss } from '../gen/boss';
import { generateRunMap } from '../gen/runMap';
import type { GenResult } from '../gen/validate';
import type { Course } from '../sim/course';
import type { Profile } from '../sim/profile';
import { createRun, endRun, restoreRun, saveRun, startRegion, type RunMap, type RunState } from '../sim/run';
import { loadSave, writeSave } from '../save/save';

export interface RunCourse {
  /** Course seed, budget and the bot's loadout: a different key means the course must be made again. */
  readonly key: string;
  readonly raw: Record<string, unknown>;
  readonly course: Course;
  readonly result: GenResult;
  readonly ms: number;
}

const loaded = loadSave();

export const session: {
  run: RunState | null;
  course: RunCourse | null;
  pending: string | null;
  profile: Profile;
  /** A run saved at a town, waiting for "Continue run". */
  saved: unknown;
  /** The save could not be read (shown on the start menu once). */
  notice: string | null;
} = { run: null, course: null, pending: null, profile: loaded.data.profile, saved: loaded.data.run, notice: loaded.notice };

// Owner, 2026-11-16: a run that was under way but not saved at a town ended when the game was left.
if (loaded.data.runActive && !loaded.data.run) {
  session.profile.lastRun = { result: 'left', region: 0, row: 0, blueStashed: 0, blueLost: 0 };
  writeSave({ profile: session.profile, run: null, runActive: false });
}

/** A short random seed. The display may use Math.random; the simulation never does. */
export function newRunSeed(): string {
  return Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');
}

/** The map of a region: region one from the seed itself, later regions from a fork of it. */
function regionMap(seed: string, region: number): RunMap {
  return generateRunMap(region === 1 ? seed : `${seed}-R${region}`);
}

/** Save the profile, and the run if it is in a town. */
export function persist(): void {
  const run = activeRun();
  const inTown = !!run && run.status === 'shop';
  if (inTown) session.saved = saveRun(run!);
  else session.saved = null;
  writeSave({ profile: session.profile, run: inTown ? session.saved : null, runActive: !!run });
}

export function startRun(seed: string): RunState {
  session.run = createRun(seed, regionMap(seed, 1), session.profile, pickBoss(seed, 1));
  session.course = null;
  session.pending = null;
  persist();
  return session.run;
}

/** Carry on with the run saved at a town. Returns null (and forgets it) if it cannot be read. */
export function continueRun(): RunState | null {
  const raw = session.saved as { seed?: unknown; region?: unknown } | null;
  if (!raw || typeof raw.seed !== 'string' || typeof raw.region !== 'number') return null;
  let run: RunState | null;
  try {
    run = restoreRun(raw, regionMap(raw.seed, raw.region), session.profile);
  } catch {
    run = null;
  }
  if (!run) {
    session.saved = null;
    writeSave({ profile: session.profile, run: null, runActive: false });
    return null;
  }
  session.run = run;
  session.course = null;
  session.pending = null;
  return run;
}

/** After the boss's prize: start the next region (new map, a different bug). */
export function nextRegion(run: RunState): void {
  startRegion(run, regionMap(run.seed, run.region + 1), pickBoss(run.seed, run.region + 1, run.met));
  persist();
}

/** Throw away the run in progress (a new run was started over it). */
export function abandonRun(): void {
  const run = activeRun();
  if (run) endRun(run, 'left');
  session.run = null;
  session.saved = null;
  persist();
}

/** The run in progress, if any (not won or lost). */
export function activeRun(): RunState | null {
  const r = session.run;
  return r && r.status !== 'won' && r.status !== 'lost' ? r : null;
}
