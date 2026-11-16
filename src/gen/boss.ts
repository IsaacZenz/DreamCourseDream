/**
 * The boss generator (Milestone 7 design sheet, section 2.6; owner
 * 2026-11-16): a boss level picks a bug type, a colour with its power, and a
 * base skill at random from the run seed.
 *
 * - Only parts built so far can be picked (the rest wait for Milestone 8).
 * - Owner, 2026-11-16: never a bug already met in this run.
 * - Combinations on the banned list are re-rolled (the list starts empty; the
 *   owner decides what goes on it from the bot report).
 */
import { BANNED_COMBOS, BOSS_ARENAS, BUGS, COLOURS, SKILLS, comboId, type BugId } from '../content/bosses.ts';
import { ARENA_FILES } from '../content/courses/index.ts';
import type { BossSpec } from '../sim/boss.ts';
import { parseCourse, type Course } from '../sim/course.ts';
import { Rng } from '../sim/rng.ts';

/** Pick a boss for a region. `met` lists the bugs already fought (or picked) in this run. */
export function pickBoss(seed: string, region: number, met: readonly BugId[] = []): BossSpec {
  const rng = Rng.fromSeed(seed).fork(`boss:${region}`);
  const builtBugs = BUGS.filter((b) => b.built);
  let bugs = builtBugs.filter((b) => !met.includes(b.id));
  // Every built bug met already (more regions than bugs): allow repeats rather than fail.
  if (!bugs.length) bugs = builtBugs;
  const skills = SKILLS.filter((s) => s.built);
  for (let tries = 0; tries < 200; tries++) {
    const bug = rng.pick(bugs).id;
    const total = COLOURS.reduce((n, c) => n + c.weight, 0);
    let roll = rng.float(0, total);
    let colour = COLOURS[0]!.id;
    for (const c of COLOURS) {
      colour = c.id;
      if (roll < c.weight) break;
      roll -= c.weight;
    }
    const skill = rng.pick(skills).id;
    if (!BANNED_COMBOS.includes(comboId(bug, colour, skill))) return { bug, colour, skill, region };
  }
  throw new Error('Every boss combination is banned.');
}

/** The arena's course file. One for now (sheet section 3); later picked from the set (owner, 2026-11-16). */
export function arenaData(seed: string, region: number): { id: string; data: unknown } {
  const rng = Rng.fromSeed(seed).fork(`arena:${region}`);
  const id = rng.pick(BOSS_ARENAS);
  return { id, data: ARENA_FILES.get(id) };
}

/** The arena a boss is fought in, ready to play. */
export function arenaFor(seed: string, region: number): Course {
  const { id, data } = arenaData(seed, region);
  const r = parseCourse(data);
  if (!r.ok) throw new Error(`Arena "${id}" is broken: ${r.errors.join('; ')}`);
  return r.course;
}

/** Every built combination, for the bot report (sheet section 2.8). */
export function allBuiltCombos(region: number): BossSpec[] {
  const out: BossSpec[] = [];
  for (const b of BUGS.filter((x) => x.built)) for (const c of COLOURS) for (const s of SKILLS.filter((x) => x.built)) out.push({ bug: b.id, colour: c.id, skill: s.id, region });
  return out;
}
