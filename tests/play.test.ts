import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, cloneTuning } from '../src/content/tuning';
import { GENERATED_ID, TEST_COURSES } from '../src/content/courses';
import { parseCourse, type Course } from '../src/sim/course';
import { simulateShot, ballAtTile, type ShotCommand } from '../src/sim/ball';
import { canShoot, createPlay, drainLog, runShot, takeShot, type PlayState } from '../src/sim/play';

const T = DEFAULT_TUNING;
const LEGEND = {
  g: 'grass',
  '~': 'water',
  x: 'spikes',
  '^': 'spring',
  '>': { surface: 'booster', dir: 'se' },
  c: { surface: 'conveyor', dir: 'se' },
  w: { surface: 'warp', link: 'a' },
};

function course(tiles: string[], extra: Record<string, unknown> = {}): Course {
  const r = parseCourse({ format: 1, name: 'test', legend: LEGEND, tiles, start: [1, 1], exit: [8, 1], quota: 0, ...extra });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

/** One long corridor along +x: walls at height 1, a floor of `floor` tiles. */
function corridor(floor: string[], extra: Record<string, unknown> = {}): Course {
  const n = floor.length + 2;
  const wall = Array(n).fill('g1').join(' ');
  return course([wall, ['g1', ...floor, 'g1'].join(' '), wall], extra);
}

const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });

function play(c: Course, seed = 'test'): PlayState {
  return createPlay(c, T, { seed });
}

function fire(p: PlayState, cmd: ShotCommand) {
  takeShot(p, cmd);
  runShot(p);
  return drainLog(p);
}

describe('course rules: shots and health', () => {
  it('starts with the character stats: 5 health, 4 shots', () => {
    const p = play(corridor(Array(10).fill('g0')));
    expect(p.health).toBe(5);
    expect(p.shots).toBe(4);
    expect(p.character.id).toBe('rollo');
  });

  it('each shot costs one; at zero a recover turn refills them all', () => {
    const p = play(corridor(Array(20).fill('g0'), { exit: [20, 1] }));
    for (let i = 0; i < 3; i++) fire(p, shot({ power: 0.1 }));
    expect(p.shots).toBe(1);
    const log = fire(p, shot({ power: 0.1 }));
    expect(log.map((e) => e.kind)).toEqual(['enemyTurn', 'enemyTurn', 'recover']);
    expect(p.shots).toBe(4);
  });

  it('stopping in water costs 1 health and returns the ball to its last resting spot', () => {
    const p = play(corridor(['g0', '~0', '~0', '~0', '~0', '~0', '~0', 'g0']));
    const start = { ...p.ball };
    const log = fire(p, shot({ power: 0.25 }));
    expect(log.some((e) => e.kind === 'damage' && e.cause === 'sunk')).toBe(true);
    expect(p.health).toBe(4);
    expect(p.ball.x).toBeCloseTo(start.x, 5);
  });

  it('losing all health ends the run', () => {
    const p = play(corridor(['g0', '~0', '~0', '~0', '~0', '~0', '~0', 'g0']));
    for (let i = 0; i < 5; i++) fire(p, shot({ power: 0.25 }));
    expect(p.health).toBe(0);
    expect(p.status).toBe('lost');
    expect(canShoot(p)).toBe(false);
  });
});

describe('course rules: hazards', () => {
  it('spikes deal 1 damage, once per shot', () => {
    const p = play(corridor(['g0', 'x0', 'x0', 'x0', 'g0', 'g0', 'g0', 'g0']));
    const log = fire(p, shot({ power: 0.5 }));
    expect(log.filter((e) => e.kind === 'damage')).toHaveLength(1);
    expect(p.health).toBe(4);
  });

  it('a booster pushes hard: the shot goes much further than on grass', () => {
    const floor = Array(30).fill('g0');
    const plain = corridor(floor, { exit: [30, 1] });
    const boosted = corridor(['g0', '>0', ...floor.slice(2)], { exit: [30, 1] });
    const a = simulateShot(plain, T, ballAtTile(plain, 1, 1), shot({ power: 0.2 }));
    const b = simulateShot(boosted, T, ballAtTile(boosted, 1, 1), shot({ power: 0.2 }));
    expect(b.ball.x - 1.5).toBeGreaterThan((a.ball.x - 1.5) * 3);
  });

  it('a booster pointing the other way turns the ball around', () => {
    const c = course(['g1 g1 g1 g1 g1 g1 g1 g1 g1 g1', 'g1 g0 g0 g0 b0 g0 g0 g0 g0 g1', 'g1 g1 g1 g1 g1 g1 g1 g1 g1 g1'], {
      legend: { ...LEGEND, b: { surface: 'booster', dir: 'nw' } },
    });
    const s = simulateShot(c, T, ballAtTile(c, 2, 1), shot({ power: 0.3 }));
    expect(s.events.some((e) => e.kind === 'wall')).toBe(true); // thrown back into the far wall
    expect(s.ball.x).toBeLessThan(4);
  });

  it('a conveyor carries a slow ball along its arrow', () => {
    const c = corridor(['g0', 'c0', 'c0', 'c0', 'c0', 'g0', 'g0', 'g0', 'g0', 'g0']);
    const s = simulateShot(c, T, ballAtTile(c, 1, 1), shot({ power: 0.15 }));
    expect(s.ball.x).toBeGreaterThan(6);
  });

  it('a spring launches the ball into the air', () => {
    const c = corridor(['g0', '^0', 'g0', 'g0', 'g0', 'g0', 'g0', 'g0']);
    const s = simulateShot(c, T, ballAtTile(c, 1, 1), shot({ power: 0.3 }));
    const spring = s.events.findIndex((e) => e.kind === 'spring');
    expect(spring).toBeGreaterThanOrEqual(0);
    expect(s.events.slice(spring).some((e) => e.kind === 'land' || e.kind === 'bounce')).toBe(true);
  });

  it('a warp moves the ball to its pair and it keeps going', () => {
    const c = course(
      [
        'g1 g1 g1 g1 g1 g1 g1 g1 g1 g1',
        'g1 g0 g0 w0 g1 g1 g1 g1 g1 g1',
        'g1 g1 g1 g1 g1 g1 g1 g1 g1 g1',
        'g1 g0 w0 g0 g0 g0 g0 g0 g0 g1',
        'g1 g1 g1 g1 g1 g1 g1 g1 g1 g1',
      ],
      { exit: [8, 3] },
    );
    const s = simulateShot(c, T, ballAtTile(c, 1, 1), shot({ power: 0.4 }));
    expect(s.events.some((e) => e.kind === 'warp')).toBe(true);
    expect(Math.floor(s.ball.y)).toBe(3);
    expect(s.ball.x).toBeGreaterThan(3);
  });
});

describe('course rules: blockers, enemies, stars and the exit', () => {
  it('a rock blocks the ball: it bounces back', () => {
    const c = corridor(Array(10).fill('g0'), { objects: [{ id: 'rock', at: [5, 1] }], exit: [10, 1] });
    const p = play(c);
    fire(p, shot({ power: 0.6 }));
    expect(p.ball.x).toBeLessThan(5.5);
  });

  it('a lofted shot flies over a low wall', () => {
    const c = corridor(Array(14).fill('g0'), { objects: [{ id: 'low-wall', at: [3, 1] }], exit: [14, 1] });
    const p = play(c);
    fire(p, shot({ power: 0.8, type: 'lofted' }));
    expect(p.ball.x).toBeGreaterThan(4);
  });

  it('hitting a Mossback defeats it; its star counts at once; a flag goes up; the ball carries on', () => {
    const c = corridor(Array(14).fill('g0'), { objects: [{ id: 'mossback', at: [4, 1] }], exit: [14, 1], quota: 1 });
    const p = play(c);
    const log = fire(p, shot({ power: 0.6 }));
    expect(log.some((e) => e.kind === 'defeat')).toBe(true);
    expect(p.enemies[0]!.defeated).toBe(true);
    expect(p.ball.x).toBeGreaterThan(5);
    // Owner, 2026-11-14: no dropped star to fetch; the star is secured and shown above the flag.
    expect(p.pickups).toHaveLength(0);
    expect(p.meter).toBe(1);
    expect(p.wallet).toBe(1);
    expect(p.exitOpen).toBe(true);
    expect(p.flags).toHaveLength(1);
    expect(p.flags[0]!.raised).toBe(true);
  });

  it('collecting stars fills the meter and opens the exit at the quota', () => {
    const c = corridor(Array(10).fill('g0'), {
      objects: [
        { id: 'yellow-star', at: [3, 1] },
        { id: 'yellow-star', at: [5, 1] },
      ],
      quota: 2,
      exit: [10, 1],
    });
    const p = play(c);
    expect(p.exitOpen).toBe(false);
    const log = fire(p, shot({ power: 0.45 }));
    expect(p.meter).toBe(2);
    expect(p.wallet).toBe(2);
    expect(p.exitOpen).toBe(true);
    expect(log.some((e) => e.kind === 'exitOpen')).toBe(true);
  });

  it('a closed exit lets the ball roll over it; an open one catches it and the course is won', () => {
    const tiles = Array(12).fill('g0');
    const closed = play(corridor(tiles, { exit: [4, 1], objects: [{ id: 'yellow-star', at: [10, 1] }], quota: 1 }));
    fire(closed, shot({ power: 0.45 }));
    expect(closed.status).toBe('playing');
    expect(closed.ball.x).toBeGreaterThan(5);

    const open = play(corridor(tiles, { exit: [4, 1] }));
    fire(open, shot({ power: 0.36 }));
    expect(open.status).toBe('won');
    expect(open.ball.x).toBe(4.5);
  });

  it('a ball going too fast rolls over the open exit', () => {
    const p = play(corridor(Array(12).fill('g0'), { exit: [3, 1] }));
    fire(p, shot({ power: 1 }));
    expect(p.status).toBe('playing');
  });

  it('a heart heals one, but is left on the ground at full health', () => {
    const c = corridor(['g0', 'x0', 'g0', 'g0', 'g0', 'g0', 'g0', 'g0'], { objects: [{ id: 'heart', at: [5, 1] }] });
    const full = play(c);
    full.health = 5;
    takeShot(full, shot({ power: 0.5 }));
    runShot(full);
    // Spikes took one, then the heart gave it back.
    expect(full.health).toBe(5);
    expect(full.pickups[0]!.taken).toBe(true);

    const untouched = play(corridor(Array(8).fill('g0'), { objects: [{ id: 'heart', at: [3, 1] }] }));
    fire(untouched, shot({ power: 0.4 }));
    expect(untouched.pickups[0]!.taken).toBe(false);
  });

  it('a shot orb gives back a shot, up to the maximum', () => {
    const p = play(corridor(Array(8).fill('g0'), { objects: [{ id: 'shot-orb', at: [3, 1] }] }));
    fire(p, shot({ power: 0.4 }));
    expect(p.shots).toBe(4);
    expect(p.pickups[0]!.taken).toBe(true);
  });

  it('the shot power stat scales how far the ball goes', () => {
    const c = corridor(Array(30).fill('g0'), { exit: [30, 1] });
    const a = play(c);
    fire(a, shot({ power: 0.4 }));
    const b = play(c);
    b.stats.add({ stat: 'shotPower', op: 'mul', amount: 1.5, source: { kind: 'run', id: 'test' }, duration: { kind: 'run' } });
    fire(b, shot({ power: 0.4 }));
    expect(b.ball.x).toBeGreaterThan(a.ball.x + 1);
  });

  it('the same seed and shots give exactly the same result, star drops included', () => {
    const c = corridor(Array(14).fill('g0'), { objects: [{ id: 'mossback', at: [4, 1] }], exit: [14, 1], quota: 1 });
    const run = (seed: string) => {
      const p = play(c, seed);
      fire(p, shot({ power: 0.6, sideSpin: 0.5 }));
      return { ball: p.ball, drops: p.pickups.map((x) => [x.x, x.y]) };
    };
    expect(run('abc')).toEqual(run('abc'));
  });
});

describe('the test courses', () => {
  it('every hand-built course parses', () => {
    for (const f of TEST_COURSES.filter((c) => c.id !== GENERATED_ID)) {
      const r = parseCourse(f.data);
      expect(r.ok, `${f.id}: ${r.ok ? '' : r.errors.join('; ')}`).toBe(true);
    }
  });

  it('the course rules course has enemies, pickups, blockers and a quota it can meet', () => {
    const f = TEST_COURSES.find((c) => c.id === 'course-rules')!;
    const r = parseCourse(f.data);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const ids = new Set(r.course.objects.map((o) => o.id));
    for (const id of ['mossback', 'yellow-star', 'heart', 'shot-orb', 'rock', 'stump', 'low-wall']) expect(ids).toContain(id);
    expect(r.course.quota).toBeGreaterThan(0);
  });

  it('rejects unknown objects, two objects on a tile, and a quota the course cannot meet', () => {
    const base = { format: 1, name: 't', legend: { g: 'grass' }, tiles: ['g0 g0 g0 g0'], start: [0, 0], exit: [3, 0] };
    const bad = (extra: Record<string, unknown>) => {
      const r = parseCourse({ ...base, quota: 0, ...extra });
      return r.ok ? [] : r.errors;
    };
    expect(bad({ objects: [{ id: 'dragon', at: [1, 0] }] }).join()).toMatch(/unknown object/);
    expect(bad({ objects: [{ id: 'rock', at: [1, 0] }, { id: 'stump', at: [1, 0] }] }).join()).toMatch(/already has an object/);
    // Owner, 2026-11-14: the post is now the tree stump.
    expect(bad({ objects: [{ id: 'post', at: [1, 0] }] }).join()).toMatch(/"post" was renamed; use "stump"/);
    expect(bad({ objects: [{ id: 'rock', at: [0, 0] }] }).join()).toMatch(/start tile/);
    expect(bad({ quota: 2, objects: [{ id: 'mossback', at: [1, 0] }] }).join()).toMatch(/only offers 1/);
  });
});

describe('tuning', () => {
  it('a stronger booster pushes further', () => {
    const c = corridor(['g0', '>0', ...Array(28).fill('g0')], { exit: [30, 1] });
    const weak = cloneTuning(T);
    weak.boosterAccel = 0;
    weak.boosterMinSpeed = 0;
    const a = simulateShot(c, weak, ballAtTile(c, 1, 1), shot({ power: 0.2 }));
    const b = simulateShot(c, T, ballAtTile(c, 1, 1), shot({ power: 0.2 }));
    expect(b.ball.x).toBeGreaterThan(a.ball.x + 3);
  });
});
