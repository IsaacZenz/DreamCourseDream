import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, STEP_HEIGHT, cloneTuning } from '../src/content/tuning';
import { TEST_COURSES } from '../src/content/courses';
import { parseCourse, type Course } from '../src/sim/course';
import { ballAtTile, groundAt, predictPath, simulateShot, startShot, stepShot, type ShotCommand } from '../src/sim/ball';

function course(tiles: string[], extra: Record<string, unknown> = {}): Course {
  const r = parseCourse({
    format: 1,
    name: 'test',
    legend: { g: 'grass', s: 'sand', i: 'ice', '~': 'water', b: 'bumper' },
    tiles,
    start: [1, 1],
    exit: [2, 1],
    quota: 0,
    ...extra,
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

/** A walled box of flat grass, `n` tiles inside, with walls one step high. */
function box(n: number, inner = 'g0'): Course {
  const wall = Array(n + 2).fill('g1').join(' ');
  const row = ['g1', ...Array(n).fill(inner), 'g1'].join(' ');
  return course([wall, ...Array(n).fill(row), wall]);
}

const T = DEFAULT_TUNING;
const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });

describe('ball physics', () => {
  it('a ball left alone on flat ground comes to rest where it is', () => {
    const c = box(5);
    const from = ballAtTile(c, 3, 3);
    const still = cloneTuning(T);
    still.minPower = 0; // no push at all
    const s = simulateShot(c, still, from, shot({ power: 0 }));
    expect(s.outcome).toBe('rest');
    expect(s.ball.x).toBeCloseTo(3.5, 1);
    expect(s.ball.y).toBeCloseTo(3.5, 1);
  });

  it('a gentle ground shot rolls forward, slows down and rests on flat ground', () => {
    const c = box(8);
    const from = ballAtTile(c, 1, 4);
    const s = simulateShot(c, T, from, shot({ power: 0.3 }));
    expect(s.outcome).toBe('rest');
    expect(s.ball.x).toBeGreaterThan(from.x + 0.5);
    expect(s.ball.y).toBeCloseTo(from.y, 5);
    expect(s.ball.grounded).toBe(true);
  });

  it('a ball placed on a slope rolls down it', () => {
    // Middle row: two tiles sloping down towards +x (corners nw ne se sw), then flat ground.
    const slope = course(['g2 g2 g2 g2 g2 g2 g2', 'g2 g2112 g1001 g0 g0 g0 g2', 'g2 g2 g2 g2 g2 g2 g2']);
    const from = ballAtTile(slope, 1, 1);
    const s = simulateShot(slope, T, from, shot({ power: 0 }));
    expect(s.ball.x).toBeGreaterThan(3); // reached the flat part at the bottom
    expect(s.ball.z).toBeCloseTo(0, 5);
    expect(['rest', 'timeout']).toContain(s.outcome);
  });

  it('bounces off a wall at the mirrored angle', () => {
    const c = box(10, 'i0'); // ice, so friction barely bends the path
    const t = cloneTuning(T);
    t.surfaces.grass!.wallBounce = 1;
    const angle = Math.PI / 6; // 30 degrees from +x
    const s = startShot(t, ballAtTile(c, 4, 4), shot({ angle, power: 0.6 }));
    let hit = -1;
    while (!s.outcome && hit < 0) {
      stepShot(c, t, s);
      if (s.events.some((e) => e.kind === 'wall')) hit = s.step;
    }
    expect(hit).toBeGreaterThan(0);
    // The wall is along x, so vx flips and vy keeps its sign.
    expect(s.ball.vx).toBeLessThan(0);
    expect(s.ball.vy).toBeGreaterThan(0);
    const out = Math.atan2(s.ball.vy, -s.ball.vx);
    expect(out).toBeCloseTo(angle, 1);
  });

  it('the same inputs give the same final position every time', () => {
    const file = TEST_COURSES.find((f) => f.id === 'slopes-surfaces')!;
    const r = parseCourse(file.data);
    if (!r.ok) throw new Error('bad course');
    const cmd = shot({ angle: 1.1, power: 0.9, type: 'lofted', topSpin: 0.5, sideSpin: -0.5 });
    const inputs = Array.from({ length: 400 }, (_, i) => ({ boost: i === 70 }));
    const a = simulateShot(r.course, T, ballAtTile(r.course, 2, 2), cmd, inputs);
    const b = simulateShot(r.course, T, ballAtTile(r.course, 2, 2), cmd, inputs);
    expect(b.ball).toEqual(a.ball);
    expect(b.events).toEqual(a.events);
    expect(b.step).toBe(a.step);
  });

  it('rolling off a ledge makes the ball airborne, then it lands below', () => {
    const c = course(['g2 g2 g2 g2 g2 g2', 'g2 g1 g1 g0 g0 g2', 'g2 g2 g2 g2 g2 g2']);
    const s = simulateShot(c, T, ballAtTile(c, 1, 1), shot({ power: 0.4 }));
    expect(s.events.some((e) => e.kind === 'airborne')).toBe(true);
    expect(s.events.some((e) => e.kind === 'land' || e.kind === 'bounce')).toBe(true);
    expect(s.ball.x).toBeGreaterThan(3);
  });

  it('a ball cannot roll up into a higher ledge; it bounces back', () => {
    const c = course(['g2 g2 g2 g2 g2', 'g2 g0 g0 g1 g2', 'g2 g2 g2 g2 g2']);
    const s = simulateShot(c, T, ballAtTile(c, 1, 1), shot({ power: 0.4 }));
    expect(s.events.some((e) => e.kind === 'wall')).toBe(true);
    expect(s.ball.x).toBeLessThan(3);
  });

  it('a lofted shot flies, bounces and settles', () => {
    const c = box(12);
    const s = simulateShot(c, T, ballAtTile(c, 1, 6), shot({ type: 'lofted', power: 0.6 }));
    const kinds = s.events.map((e) => e.kind);
    expect(kinds[0]).toBe('bounce');
    expect(kinds).toContain('land');
    expect(s.outcome).toBe('rest');
  });

  it('sand stops a lofted shot sooner than grass', () => {
    const grass = simulateShot(box(16), T, ballAtTile(box(16), 1, 8), shot({ type: 'lofted', power: 0.5 }));
    const sandBox = box(16, 's0');
    const sand = simulateShot(sandBox, T, ballAtTile(sandBox, 1, 8), shot({ type: 'lofted', power: 0.5 }));
    expect(sand.ball.x).toBeLessThan(grass.ball.x);
  });

  it('topspin runs further and backspin stops shorter on a lofted shot', () => {
    const c = box(20);
    const go = (topSpin: number) => simulateShot(c, T, ballAtTile(c, 1, 10), shot({ type: 'lofted', power: 0.5, topSpin })).ball.x;
    expect(go(1)).toBeGreaterThan(go(0));
    expect(go(-1)).toBeLessThan(go(0));
  });

  it('side spin curves the ball to the chosen side', () => {
    const c = box(20, 'i0');
    const go = (sideSpin: number) => simulateShot(c, T, ballAtTile(c, 1, 10), shot({ power: 0.3, sideSpin })).ball.y;
    expect(go(1)).toBeGreaterThan(10.6);
    expect(go(-1)).toBeLessThan(10.4);
  });

  it('water ends the shot as sunk', () => {
    const c = course(['g1 g1 g1 g1 g1 g1', 'g1 g0 g0 ~0 ~0 g1', 'g1 g1 g1 g1 g1 g1']);
    const s = simulateShot(c, T, ballAtTile(c, 1, 1), shot({ power: 0.5 }));
    expect(s.outcome).toBe('sunk');
  });

  it('falling off the course ends the shot as out', () => {
    const c = course(['g0 g0 g0 . .', 'g0 g0 g0 . .', 'g0 g0 g0 . .'], { start: [0, 1], exit: [1, 1] });
    const s = simulateShot(c, T, ballAtTile(c, 0, 1), shot({ power: 0.8 }));
    expect(s.outcome).toBe('out');
  });

  it('a bounce boost pressed just before landing makes a higher bounce', () => {
    const c = box(16);
    const cmd = shot({ type: 'lofted', power: 0.5 });
    const plain = simulateShot(c, T, ballAtTile(c, 1, 8), cmd);
    const firstBounce = plain.events.find((e) => e.kind === 'bounce')!.step;
    const pressAt = firstBounce - 5;
    const inputs = Array.from({ length: firstBounce + 1 }, (_, i) => ({ boost: i === pressAt }));
    const boosted = simulateShot(c, T, ballAtTile(c, 1, 8), cmd, inputs);
    const b = boosted.events.find((e) => e.kind === 'bounce')!;
    expect(b.kind === 'bounce' && b.boosted).toBe(true);
    // A bigger bounce means the second landing comes later.
    const second = (s: typeof plain) => s.events.filter((e) => e.kind === 'bounce' || e.kind === 'land')[1]!.step;
    expect(second(boosted)).toBeGreaterThan(second(plain));
  });

  it('a boost pressed too early does nothing', () => {
    const c = box(16);
    const cmd = shot({ type: 'lofted', power: 0.5 });
    const inputs = Array.from({ length: 10 }, (_, i) => ({ boost: i === 2 }));
    const s = simulateShot(c, T, ballAtTile(c, 1, 8), cmd, inputs);
    const b = s.events.find((e) => e.kind === 'bounce')!;
    expect(b.kind === 'bounce' && b.boosted).toBe(false);
  });

  it('the aim guide follows exactly the same path as the real shot', () => {
    const file = TEST_COURSES.find((f) => f.id === 'slopes-surfaces')!;
    const r = parseCourse(file.data);
    if (!r.ok) throw new Error('bad course');
    const from = ballAtTile(r.course, 2, 2);
    const cmd = shot({ angle: 0.7, power: 1, type: 'lofted', sideSpin: 0.5 });
    const guide = predictPath(r.course, T, from, cmd, 100);
    const s = startShot(T, from, cmd);
    for (let i = 1; i < guide.length; i++) {
      stepShot(r.course, T, s);
      expect(s.ball.x).toBe(guide[i]!.x);
      expect(s.ball.y).toBe(guide[i]!.y);
      expect(s.ball.z).toBe(guide[i]!.z);
    }
  });

  it('a perfect release launches faster than the top of the bar by perfectBonus', () => {
    const c = box(5);
    const from = ballAtTile(c, 1, 1);
    const top = startShot(T, from, shot({ power: 1 }));
    const perfect = startShot(T, from, shot({ power: 1, perfect: true }));
    expect(Math.hypot(perfect.ball.vx, perfect.ball.vy)).toBeCloseTo(Math.hypot(top.ball.vx, top.ball.vy) * T.perfectBonus, 9);
    // Owner's numbers: the bar's top is 20% above the first tuning, a perfect shot 35% above it.
    expect(T.groundMaxSpeed).toBeCloseTo(11 * 1.2, 9);
    expect(T.loftMaxSpeed).toBeCloseTo(10 * 1.2, 9);
    expect(T.groundMaxSpeed * T.perfectBonus).toBeCloseTo(11 * 1.35, 9);
    expect(T.loftMaxSpeed * T.perfectBonus).toBeCloseTo(10 * 1.35, 9);
  });

  it('a perfect lofted shot carries further than a full-bar one', () => {
    const c = box(30);
    const go = (perfect: boolean) => simulateShot(c, T, ballAtTile(c, 1, 15), shot({ type: 'lofted', power: 1, perfect })).events.find((e) => e.kind === 'bounce')!.step;
    expect(go(true)).toBeGreaterThan(go(false));
  });

  it('ground heights convert steps to tiles', () => {
    const c = course(['g2 g2 g2', 'g2 g2 g2', 'g2 g2 g2']);
    expect(groundAt(c, 1.5, 1.5)!.h).toBe(2 * STEP_HEIGHT);
    expect(groundAt(c, 5, 5)).toBeNull();
  });
});
