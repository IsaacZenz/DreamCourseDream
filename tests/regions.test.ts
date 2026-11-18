/**
 * Milestone 7: regions, and course size, threat and enemy toughness scaled
 * separately (owner, 2026-11-17; docs/plans/milestone-7.md section 7.4).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { REGIONS } from '../src/content/run';
import { generateRunMap } from '../src/gen/runMap';
import { generateAttempt } from '../src/gen/generate';
import { parseCourse } from '../src/sim/course';
import { createPlay } from '../src/sim/play';
import { budgetFor, choices, createRun, enemyModifiersFor, enterNode, finishCourse, genOptionsFor, sizeFor, takeBossReward, upcomingJobs, type RunState } from '../src/sim/run';

function win(run: RunState): void {
  finishCourse(run, { won: true, lostBy: null, health: run.health, wallet: run.wallet, ability: run.ability, gear: run.gear });
}
function beatBoss(run: RunState): void {
  run.countdown = 0;
  run.lastTownVisited = true;
  enterNode(run, 'boss');
  win(run);
}

describe('regions', () => {
  it('region 1 keeps the Milestone 6 budget: 8 + 2 per counted node, cap 30; hard x1.5', () => {
    const run = createRun('R', generateRunMap('R'));
    expect(budgetFor(run, 'course')).toBe(8);
    run.counted = 4;
    expect(budgetFor(run, 'course')).toBe(16);
    expect(budgetFor(run, 'hard')).toBe(24);
    run.counted = 20;
    expect(budgetFor(run, 'course')).toBe(30);
  });

  it('size grows separately: 2 areas, +1 every 2 counted nodes, at most 5; hard courses one more', () => {
    const run = createRun('R', generateRunMap('R'));
    expect(sizeFor(run, 'course').areas).toEqual([2, 2]);
    run.counted = 5;
    expect(sizeFor(run, 'course').areas).toEqual([4, 4]);
    expect(sizeFor(run, 'hard').areas).toEqual([5, 5]);
    run.counted = 30;
    expect(sizeFor(run, 'course').areas).toEqual([5, 5]);
    expect(sizeFor(run, 'course').botShots).toBe(38);
  });

  it('beating the region-one boss: heal to full, pick 1 of 3 gear, then region two on a new map', () => {
    const run = createRun('R2', generateRunMap('R2'));
    run.health = 1;
    const firstMap = run.map;
    beatBoss(run);
    expect(run.status).toBe('reward');
    expect(run.health).toBe(5);
    expect(run.reward).toHaveLength(3);
    const pick = run.reward![1]!.id;
    takeBossReward(run, 1, generateRunMap('R2', 2));
    expect(run.status).toBe('map');
    expect(run.region).toBe(2);
    expect(Object.values(run.gear)).toContain(pick);
    expect(run.map).not.toEqual(firstMap);
    expect(run.countdown).toBe(7);
    expect(run.counted).toBe(0);
    expect(choices(run).length).toBeGreaterThan(0);
  });

  it('region two: bigger start, more threat (18 + 3 per node, cap 36), +1 health on every enemy; its boss wins the run', () => {
    const run = createRun('R3', generateRunMap('R3'));
    beatBoss(run);
    takeBossReward(run, null, generateRunMap('R3', 2));
    expect(budgetFor(run, 'course')).toBe(18);
    run.counted = 2;
    expect(budgetFor(run, 'course')).toBe(24);
    expect(sizeFor(run, 'course').areas).toEqual([4, 4]);
    expect(sizeFor(run, 'course').areaSize).toEqual([9, 15]);
    expect(enemyModifiersFor(run)).toEqual([{ stat: 'health', op: 'add', amount: 1, source: { kind: 'region', id: 'region2' }, duration: { kind: 'forever' } }]);
    beatBoss(run);
    expect(run.status).toBe('won');
    expect(run.banked).toBe(5 + 8);
  });

  it('region toughness reaches every enemy on a course', () => {
    const r = parseCourse({ format: 2, name: 't', legend: { g: 'grass' }, tiles: ['g1 g1 g1', 'g1 g1 g1'], start: [0, 0], exit: [2, 1], quota: 0, objects: [{ id: 'trundler', at: [1, 1], path: [[1, 1]] }] });
    if (!r.ok) throw new Error();
    const run = createRun('R4', generateRunMap('R4'));
    run.region = 2;
    expect(createPlay(r.course, DEFAULT_TUNING, { seed: 's' }).enemies[0]!.health).toBe(2);
    expect(createPlay(r.course, DEFAULT_TUNING, { seed: 's', enemyModifiers: enemyModifiersFor(run) }).enemies[0]!.health).toBe(3);
  });

  it('the generator makes the number of areas it is asked for', () => {
    const size = { areas: [4, 4] as const, areaSize: [9, 15] as const, maxEnemies: 14, botShots: 32 };
    let ok = 0;
    for (let i = 0; i < 6; i++) {
      const a = generateAttempt(`SZ${i}`, 12, 0, size);
      if (a.ok) {
        ok++;
        expect(a.meta.terrain.regions.filter((r) => r.kind === 'area').length).toBe(4);
      }
    }
    expect(ok).toBeGreaterThan(0);
  });

  it('every region names a boss pool with the Warden in it (owner: placeholder until Milestone 8)', () => {
    for (const r of REGIONS) expect(r.bosses).toContain('warden');
  });
});

describe('courses made ahead (owner, 2026-11-18, option B)', () => {
  const same = (run: RunState, job: { id: string; courseSeed: string; budget: number; opts: unknown }) => {
    const cur = enterNode(run, job.id);
    expect(cur.courseSeed).toBe(job.courseSeed);
    expect(cur.budget).toBe(job.budget);
    expect(genOptionsFor(run)).toEqual(job.opts);
  };

  it('from the map: a job is exactly the course entering that node makes', () => {
    const run = createRun('AHEAD', generateRunMap('AHEAD'));
    const jobs = upcomingJobs(run);
    expect(jobs.length).toBe(3);
    same(run, jobs[1]!);
  });

  it('during a course: the jobs are the choices after winning it', () => {
    const run = createRun('AHEAD2', generateRunMap('AHEAD2'));
    enterNode(run, choices(run)[0]!.id);
    const jobs = upcomingJobs(run);
    expect(run.status).toBe('course');
    win(run);
    expect(jobs.map((j) => j.id)).toEqual(choices(run).map((n) => n.id).filter((id) => jobs.some((j) => j.id === id)));
    same(run, jobs[0]!);
  });

  it('region two courses get their own seeds', () => {
    const run = createRun('R5', generateRunMap('R5'));
    const one = upcomingJobs(run)[0]!.courseSeed;
    run.region = 2;
    expect(upcomingJobs(run)[0]!.courseSeed).toBe(`${one}-2`);
  });

  it('owner option A: region two is 3 to 6 areas, threat capped at 36', () => {
    const run = createRun('R6', generateRunMap('R6'));
    run.region = 2;
    expect(sizeFor(run, 'course').areas).toEqual([3, 3]);
    run.counted = 20;
    expect(sizeFor(run, 'course').areas).toEqual([6, 6]);
    expect(budgetFor(run, 'course')).toBe(36);
  });
});
