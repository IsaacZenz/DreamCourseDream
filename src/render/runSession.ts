/**
 * The run being played, and the player's saved progress (Milestones 6 and 7),
 * shared by the Burrow, map, town and course scenes. The rules are in
 * src/sim/run.ts and src/sim/profile.ts; this holds them and saves them.
 *
 * Owner, 2026-11-17: the run is saved only while the player is in a town.
 * Leaving the town removes the run save, so closing the game anywhere else
 * loses the run and its carried blue stars.
 */
import { generateRunMap } from '../gen/runMap';
import { ARENAS } from '../content/arenas';
import { BOSSES, BOSS_IDS } from '../content/bosses';
import { REGIONS } from '../content/run';
import type { GenResult } from '../gen/validate';
import type { Course } from '../sim/course';
import type { GearSlots } from '../content/gear';
import type { Profile } from '../sim/profile';
import { createRun, drainDeposit, enterNode, startRegion, type RunState } from '../sim/run';
import { restoreRun, snapshotRun, type RunSnapshot } from '../save/saveData';
import { loadSave, writeSave } from '../save/store';

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
  burrow: GearSlots;
  /** A run saved at a town, waiting to be continued. */
  saved: RunSnapshot | null;
  /** Parts of the save that could not be read this time (shown once in the Burrow). */
  broken: readonly string[];
  /** Milestone 8b: the boss's introduction card was shown at the boss gate, so the fight does not show it again. */
  skipBossIntro: boolean;
} = { run: null, course: null, pending: null, profile: loaded.data.profile, burrow: loaded.data.burrow, saved: loaded.data.run, broken: loaded.broken, skipBossIntro: false };

/** A short random seed. The display may use Math.random; the simulation never does. */
export function newRunSeed(): string {
  return Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');
}

export function startRun(seed: string): RunState {
  const p = session.profile;
  session.run = createRun(seed, generateRunMap(seed), session.burrow, { levels: p.levels, startAbility: p.startAbility, lastArena: p.lastArena });
  session.course = null;
  session.pending = null;
  session.saved = null;
  bossesRecorded = 0;
  winRecorded = false;
  p.totals.runs++;
  persist();
  return session.run;
}

/** Carry on with the run saved at a town. */
export function continueRun(): RunState | null {
  const snap = session.saved;
  if (!snap) return null;
  session.run = restoreRun(snap, generateRunMap(snap.seed, snap.region));
  bossesRecorded = session.run.bossesBeaten.length;
  winRecorded = session.run.beatFinal;
  session.course = null;
  session.pending = null;
  return session.run;
}

/** The run in progress, if any (not won or lost). */
export function activeRun(): RunState | null {
  const r = session.run;
  return r && r.status !== 'won' && r.status !== 'lost' ? r : null;
}

/**
 * Bring the profile up to date with the run (deposited blue stars, bosses
 * beaten, the Burrow) and write the save. The run itself is saved only while
 * it stands in a town; anywhere else the run save is removed.
 */
/** Bosses of the current run already added to the profile's total. */
let bossesRecorded = 0;
/** The current run's win is already in the profile. */
let winRecorded = false;

export function persist(): void {
  const p = session.profile;
  const run = session.run;
  if (run) {
    p.stash += drainDeposit(run);
    for (const b of run.bossesBeaten) if (!p.bossesBeaten.includes(b)) p.bossesBeaten.push(b);
    p.totals.bestRegion = Math.max(p.totals.bestRegion, run.region);
    p.lastArena = run.lastArena;
    p.totals.bossWins += run.bossesBeaten.length - bossesRecorded;
    bossesRecorded = run.bossesBeaten.length;
    // Milestone 8: a run won by beating the final boss, counted once.
    if (run.beatFinal && !winRecorded) {
      p.totals.wins++;
      winRecorded = true;
    }
    session.burrow = { ...run.burrow };
    session.saved = run.status === 'shop' ? snapshotRun(run) : null;
  }
  writeSave({ profile: p, burrow: session.burrow, run: session.saved });
}

// ---------------------------------------------------------------------------
// Testing aids (the U panel, Milestone 7 sheet section 8.2)

/** Clear upgrades, abilities and records; the stash and the stored gear stay. */
export function resetProgress(): void {
  const p = session.profile;
  for (const k of Object.keys(p.levels)) delete p.levels[k];
  p.abilities.length = 0;
  p.startAbility = null;
  persist();
}

/** Every boss in each of its arenas, for the testing panel: id "boss@arena". */
export const BOSS_FIGHTS: readonly { id: string; label: string }[] = BOSS_IDS.flatMap((b) =>
  (BOSSES.get(b)?.arenas ?? []).map((a) => ({ id: `${b}@${a}`, label: `${BOSSES.get(b)!.name}: ${ARENAS.get(a)?.name ?? a}` })),
);

/**
 * A new run (or this one) that goes straight into a boss fight, in this arena.
 * `fight` is "boss@arena" (or just an arena, for the region's own boss). The
 * run moves to the region whose pool holds the boss, so its health is right.
 */
export function debugBossFight(fight: string, run: RunState = startRun(newRunSeed())): void {
  const [bossOrArena, maybeArena] = fight.split('@');
  const boss = maybeArena ? bossOrArena! : null;
  const arena = maybeArena ?? bossOrArena!;
  if (boss) {
    const region = REGIONS.findIndex((r) => r.bosses.includes(boss)) + 1;
    if (region > 0 && region !== run.region) startRegion(run, region, generateRunMap(run.seed, region));
  }
  run.countdown = 0;
  run.lastTownVisited = true;
  run.status = 'map';
  run.current = null;
  const cur = enterNode(run, 'boss');
  run.current = { ...cur, arena, boss: boss ?? cur.boss };
  run.lastArena = arena;
}

/** A new run that starts in region two (or another region: Milestone 8 adds three and four, the first endless region). */
export function debugRegionTwo(region = 2): RunState {
  const run = startRun(newRunSeed());
  startRegion(run, region, generateRunMap(run.seed, region));
  return run;
}

/** Kept for the town scene: the Burrow changed. */
export function storeBurrow(): void {
  persist();
}
