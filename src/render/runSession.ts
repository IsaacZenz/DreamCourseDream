/**
 * The run being played (Milestone 6), shared by the map, town and course
 * scenes. The run's rules are in src/sim/run.ts; this only holds it, and the
 * generated course for the node being played.
 */
import { generateRunMap } from '../gen/runMap';
import type { GenResult } from '../gen/validate';
import type { Course } from '../sim/course';
import { createRun, type RunState } from '../sim/run';
import { loadBurrow, saveBurrow } from '../save/burrowStore';

export interface RunCourse {
  /** Course seed, budget and the bot's loadout: a different key means the course must be made again. */
  readonly key: string;
  readonly raw: Record<string, unknown>;
  readonly course: Course;
  readonly result: GenResult;
  readonly ms: number;
}

export const session: { run: RunState | null; course: RunCourse | null; pending: string | null } = { run: null, course: null, pending: null };

/** A short random seed. The display may use Math.random; the simulation never does. */
export function newRunSeed(): string {
  return Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');
}

export function startRun(seed: string): RunState {
  session.run = createRun(seed, generateRunMap(seed), loadBurrow());
  session.course = null;
  session.pending = null;
  return session.run;
}

/** The run in progress, if any (not won or lost). */
export function activeRun(): RunState | null {
  const r = session.run;
  return r && r.status !== 'won' && r.status !== 'lost' ? r : null;
}

export function storeBurrow(run: RunState): void {
  saveBurrow(run.burrow);
}
