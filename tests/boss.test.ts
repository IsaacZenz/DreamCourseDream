/**
 * Milestone 7: The Warden and its five arenas (docs/plans/milestone-7.md
 * sections 2 and 3).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { BOSSES } from '../src/content/bosses';
import { ARENA_LIST, ARENAS } from '../src/content/arenas';
import { OBJECTS } from '../src/content/objects';
import { parseCourse, type Course } from '../src/sim/course';
import { applyEnemyStatus, createPlay, drainLog, isBoss, runShot, takeShot, wheelFor, type PlayEvent, type PlayState } from '../src/sim/play';
import { playBot } from '../src/gen/bot';
import { generateRunMap } from '../src/gen/runMap';
import { choices, createRun, enterNode, pickArena } from '../src/sim/run';

const T = DEFAULT_TUNING;
const arena = (id: string): Course => {
  const r = parseCourse(ARENAS.get(id)!.data);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
};
/** A tiny shot: the ball barely moves, so it stays where a slam was marked. */
const nudge = (p: PlayState): PlayEvent[] => {
  takeShot(p, { angle: Math.PI / 2, power: 0.05, type: 'ground', topSpin: 0, sideSpin: 0 });
  runShot(p);
  return drainLog(p);
};
const warden = (p: PlayState) => p.enemies.find((e) => e.def.id === 'warden')!;

describe('The Warden', () => {
  it('is a tier-5 boss with three phases at 2/3 and 1/3, and uses the boss wheel', () => {
    const def = BOSSES.get('warden')!;
    expect(def.phases.map((p) => p.above)).toEqual([2 / 3, 1 / 3, 0]);
    expect(def.phases.map((p) => p.slamRadius)).toEqual([1.5, null, 2.25]);
    expect(def.phases.map((p) => p.maxMinions)).toEqual([0, 3, 2]);
    const p = createPlay(arena('ice-rink'), T, { seed: 'w' });
    expect(isBoss(warden(p))).toBe(true);
    expect(wheelFor(p, warden(p)).size).toBe(20);
    expect(OBJECTS.get('warden')?.kind === 'enemy' && OBJECTS.get('warden')!.kind).toBe('enemy');
  });

  it('health is set per region, and the region toughness on health does not add to it', () => {
    const mods = [{ stat: 'health' as const, op: 'add' as const, amount: 1, source: { kind: 'region' as const, id: 'r2' }, duration: { kind: 'forever' as const } }];
    expect(warden(createPlay(arena('ice-rink'), T, { seed: 'h' })).health).toBe(12);
    expect(warden(createPlay(arena('ice-rink'), T, { seed: 'h', bossHealth: 18, enemyModifiers: mods })).health).toBe(18);
  });

  it('the exit is closed from the start and opens when the Warden is defeated', () => {
    const p = createPlay(arena('ice-rink'), T, { seed: 'x' });
    expect(p.exitOpen).toBe(false);
    warden(p).health = 1;
    p.ball = { ...p.ball, x: 6.5, y: 9.5 };
    takeShot(p, { angle: -Math.PI / 2, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0 });
    runShot(p);
    expect(warden(p).defeated).toBe(true);
    expect(p.exitOpen).toBe(true);
    // No flag pole for a boss.
    expect(p.flags).toHaveLength(0);
  });

  it('takes one hit per shot, however the ball rattles against it', () => {
    const p = createPlay(arena('sinkhole-bowl'), T, { seed: 'r' });
    takeShot(p, { angle: -Math.PI / 2, power: 0.6, type: 'ground', topSpin: 0, sideSpin: 0 });
    runShot(p);
    const hits = drainLog(p).filter((e) => e.kind === 'hit' && e.enemy === warden(p).uid && e.damage > 0);
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  it('phase 1 slams: a ring marked round the resting ball lands on the next enemy turn', () => {
    const p = createPlay(arena('ice-rink'), T, { seed: 's' });
    const first = nudge(p);
    const mark = first.find((e) => e.kind === 'slamMark');
    expect(mark).toMatchObject({ kind: 'slamMark', r: 1.5 });
    const health = p.health;
    const second = nudge(p);
    expect(second.find((e) => e.kind === 'slam')).toMatchObject({ kind: 'slam', hit: true });
    expect(second).toContainEqual({ kind: 'damage', amount: 1, cause: 'slam' });
    expect(p.health).toBe(health - 1);
    expect(second.some((e) => e.kind === 'knocked')).toBe(true);
  });

  it('a slam misses a ball that moved out of the ring', () => {
    const p = createPlay(arena('ice-rink'), T, { seed: 'm' });
    nudge(p);
    p.ball = { ...p.ball, x: 1.5, y: 1.5 };
    const log = nudge(p);
    expect(log.find((e) => e.kind === 'slam')).toMatchObject({ hit: false });
  });

  it('crossing into a new phase sheds a plate (heart and shot orb) and clears the ring; phase 2 summons', () => {
    const p = createPlay(arena('ice-rink'), T, { seed: 'p' });
    nudge(p);
    const w = warden(p);
    expect(w.slamMark).not.toBeNull();
    w.health = 9;
    p.ball = { ...p.ball, x: 6.5, y: 8.4 };
    takeShot(p, { angle: -Math.PI / 2, power: 0.3, type: 'ground', topSpin: 0, sideSpin: 0 });
    runShot(p);
    const log = drainLog(p);
    expect(log).toContainEqual({ kind: 'phase', enemy: w.uid, phase: 1 });
    expect(p.pickups.filter((x) => x.uid.includes(':shed1:')).map((x) => x.def.id).sort()).toEqual(['heart', 'shot-orb']);
    expect(log.some((e) => e.kind === 'slamMark')).toBe(false);
    expect(log.filter((e) => e.kind === 'summon')).toHaveLength(1);
  });

  it('summons appear only on spawn spots, at most 3 alive in phase 2, and leave no flag pole', () => {
    const c = arena('ice-rink');
    const p = createPlay(c, T, { seed: 'sum' });
    warden(p).health = 8;
    warden(p).phase = 1;
    for (let i = 0; i < 6; i++) nudge(p);
    const minions = p.enemies.filter((e) => e.minion);
    expect(minions.length).toBe(3);
    for (const m of minions) expect(c.spawns.some((s) => s.x + 0.5 === m.x && s.y + 0.5 === m.y)).toBe(true);
  });

  it('a stunned Warden skips its action', () => {
    const p = createPlay(arena('ice-rink'), T, { seed: 'st' });
    applyEnemyStatus(p, warden(p), 'stunned');
    const log = nudge(p);
    expect(log).toContainEqual({ kind: 'skip', enemy: warden(p).uid });
    expect(log.some((e) => e.kind === 'slamMark')).toBe(false);
  });

  it('when the Warden falls its minions vanish', () => {
    const p = createPlay(arena('ice-rink'), T, { seed: 'v' });
    warden(p).health = 8;
    warden(p).phase = 1;
    nudge(p);
    expect(p.enemies.some((e) => e.minion && !e.defeated)).toBe(true);
    warden(p).health = 1;
    p.ball = { ...p.ball, x: 6.5, y: 9.5 };
    takeShot(p, { angle: -Math.PI / 2, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0 });
    runShot(p);
    expect(drainLog(p).some((e) => e.kind === 'vanish')).toBe(true);
    expect(p.enemies.some((e) => e.minion && !e.defeated)).toBe(false);
  });
});

describe('the arenas (owner, 2026-11-17: five, each with a gimmick)', () => {
  it('five arenas, all valid course files, the Warden in the middle and 6 to 8 spawn spots', () => {
    expect(ARENA_LIST.map((a) => a.id)).toEqual(BOSSES.get('warden')!.arenas);
    for (const a of ARENA_LIST) {
      const c = arena(a.id);
      expect(c.objects.find((o) => o.id === 'warden')).toMatchObject({ x: 6, y: 6 });
      expect(c.spawns.length).toBeGreaterThanOrEqual(6);
      expect(c.spawns.length).toBeLessThanOrEqual(8);
      expect(c.quota).toBe(0);
    }
  });

  it('never the same arena twice in a row', () => {
    const seen = new Set<string>();
    let last: string | null = null;
    for (let i = 0; i < 40; i++) {
      const run = createRun(`AR${i}`, generateRunMap(`AR${i}`), undefined, { lastArena: last });
      const a = pickArena(run);
      expect(a).not.toBe(last);
      seen.add(a);
      last = a;
    }
    expect(seen.size).toBe(5);
  });

  it('a boss node carries its boss and arena', () => {
    const run = createRun('BN', generateRunMap('BN'));
    run.countdown = 0;
    run.lastTownVisited = true;
    expect(choices(run).map((n) => n.id)).toEqual(['boss']);
    const cur = enterNode(run, 'boss');
    expect(cur.boss).toBe('warden');
    expect(ARENAS.has(cur.arena!)).toBe(true);
    expect(run.lastArena).toBe(cur.arena);
  });

  // CLAUDE.md rule 6: hand-built arenas are checked here, with a fresh ball. A short check keeps the
  // test run quick; `npm run arenas` plays 20 seeds per arena and reports the win rate.
  for (const a of ARENA_LIST) {
    it(`the bot beats ${a.name} with a fresh ball`, () => {
      const c = arena(a.id);
      const seeds = [`${a.id}-0`, `${a.id}-1`, `${a.id}-2`];
      expect(seeds.some((s) => playBot(c, T, s, { maxShots: 80, bossHealth: 12 }).won)).toBe(true);
    }, 300_000);
  }
});
