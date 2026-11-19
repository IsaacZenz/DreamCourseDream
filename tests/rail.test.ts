/**
 * Guard rails (Milestone 5b design sheet, section 2).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { parseCourse, type Course } from '../src/sim/course';
import { createPlay, runShot, takeShot, tick, type PlayState } from '../src/sim/play';
import type { ShotCommand } from '../src/sim/ball';

const T = DEFAULT_TUNING;
const N = 13;

function course(rails: number[][][], objects: unknown[] = []): Course {
  const tiles = Array.from({ length: N }, () => Array.from({ length: N }, () => 'g4').join(' '));
  const r = parseCourse({ format: 3, name: 'Rails', legend: { g: 'grass' }, tiles, start: [2, 6], exit: [12, 12], quota: 0, objects, rails });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

const ground = (power: number, angle = 0): ShotCommand => ({ angle, power, type: 'ground', topSpin: 0, sideSpin: 0 });

/** Run a shot step by step; return the ball's speed just before and just after it first touches a rail. */
function railHit(play: PlayState, cmd: ShotCommand, boostAt: number | null = null): { before: number; after: number; vx: number; vy: number } | null {
  const s = takeShot(play, cmd);
  let before = 0;
  for (let i = 0; i < 2000 && play.shot; i++) {
    const v = Math.hypot(s.ball.vx, s.ball.vy);
    const n = s.events.length;
    tick(play, boostAt !== null && i === boostAt ? { boost: true } : {});
    const hit = s.events.slice(n).find((e) => e.kind === 'contact' && e.obstacle.startsWith('rail:'));
    if (hit) return { before: v, after: Math.hypot(s.ball.vx, s.ball.vy), vx: s.ball.vx, vy: s.ball.vy };
    before = v;
  }
  void before;
  return null;
}

describe('guard rail', () => {
  it('a rolling ball bounces straight back off a rail across its path, keeping about 80% of its speed', () => {
    const play = createPlay(course([[[6, 2], [6, 10]]]), T, { seed: 'R' });
    const h = railHit(play, ground(0.6));
    expect(h).not.toBeNull();
    expect(h!.vx).toBeLessThan(0);
    expect(h!.after / h!.before).toBeCloseTo(T.railBounce, 1);
    runShot(play);
    expect(play.ball.x).toBeLessThan(6.5);
  });

  it('a 45-degree rail turns the ball sideways', () => {
    const play = createPlay(course([[[5, 3], [9, 7]]]), T, { seed: 'R' });
    const h = railHit(play, ground(0.6));
    expect(h).not.toBeNull();
    // Rolling along +x into a rail running down-right: it is sent along +y or back, never on through.
    expect(Math.abs(h!.vy)).toBeGreaterThan(Math.abs(h!.vx) * 0.5);
  });

  it('a lofted ball flies over it', () => {
    const play = createPlay(course([[[6, 2], [6, 10]]]), T, { seed: 'R' });
    takeShot(play, { angle: 0, power: 1, type: 'lofted', topSpin: 0, sideSpin: 0 });
    runShot(play);
    expect(play.ball.x).toBeGreaterThan(6.5);
  });

  it('the boost key pressed just before the hit gives a stronger bounce (owner, 2026-11-15)', () => {
    const plain = railHit(createPlay(course([[[6, 2], [6, 10]]]), T, { seed: 'R' }), ground(0.6))!;
    // Find the step of the hit, then press the key a few steps earlier.
    const probe = createPlay(course([[[6, 2], [6, 10]]]), T, { seed: 'R' });
    const s = takeShot(probe, ground(0.6));
    let hitStep = 0;
    for (let i = 0; i < 2000 && probe.shot; i++) {
      const n = s.events.length;
      tick(probe);
      if (s.events.slice(n).some((e) => e.kind === 'contact')) {
        hitStep = i;
        break;
      }
    }
    const boosted = railHit(createPlay(course([[[6, 2], [6, 10]]]), T, { seed: 'R' }), ground(0.6), hitStep - 5)!;
    expect(boosted.after / boosted.before).toBeCloseTo(T.railBoost, 1);
    expect(boosted.after).toBeGreaterThan(plain.after);
  });

  it('a Mole that stops on a rail tile burrows on a tile without one', () => {
    const play = createPlay(course([[[6, 2], [6, 10]]], [{ id: 'mole-cricket', at: [4, 6] }]), T, { seed: 'R' });
    const mole = play.enemies[0]!;
    // Pretend it rolled to a stop on the rail and its time up is over.
    mole.burrowed = false;
    mole.x = 6.5;
    mole.y = 6.5;
    mole.surfacedShot = -10;
    takeShot(play, ground(0.05, Math.PI));
    runShot(play);
    expect(Math.floor(mole.x)).not.toBe(6);
  });
});

describe('guard rails in course files', () => {
  const base = (extra: Record<string, unknown>) => ({
    format: 3,
    name: 'R',
    legend: { g: 'grass' },
    tiles: Array.from({ length: 6 }, () => 'g0 g0 g0 g0 g0 g0'),
    start: [0, 0],
    exit: [5, 5],
    quota: 0,
    ...extra,
  });
  const errors = (raw: unknown) => {
    const r = parseCourse(raw);
    return r.ok ? [] : r.errors;
  };

  it('accepts straight and 45-degree legs and rejects other angles', () => {
    expect(errors(base({ rails: [[[1, 1], [4, 1], [4, 4], [2, 2]]] }))).toEqual([]);
    expect(errors(base({ rails: [[[1, 1], [3, 2]]] })).join(' ')).toMatch(/45 degrees/);
  });

  it('rejects a rail over an empty spot', () => {
    const raw = base({ tiles: ['g0 g0 . g0 g0 g0', ...Array.from({ length: 5 }, () => 'g0 g0 g0 g0 g0 g0')], rails: [[[0, 0], [4, 0]]] });
    expect(errors(raw).join(' ')).toMatch(/not on a tile/);
  });

  it('rejects a Trundler path that crosses a rail, and a Mole starting on one', () => {
    expect(errors(base({ rails: [[[3, 0], [3, 5]]], objects: [{ id: 'mudroller', at: [1, 2], path: [[5, 2]] }] })).join(' ')).toMatch(/crosses a guard rail/);
    expect(errors(base({ rails: [[[3, 0], [3, 5]]], objects: [{ id: 'mole-cricket', at: [3, 2] }] })).join(' ')).toMatch(/may not start on a tile with a guard rail/);
    expect(errors(base({ rails: [[[3, 0], [3, 5]]], objects: [{ id: 'mudroller', at: [0, 2], path: [[2, 2]] }] }))).toEqual([]);
  });
});
