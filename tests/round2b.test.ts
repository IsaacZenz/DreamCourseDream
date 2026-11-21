/**
 * Milestone 8 round 2b (sheet docs/plans/milestone-8-round-2b.md, signed off by
 * the owner 2026-11-21 with all defaults).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { OBJECTS, type EnemyDef } from '../src/content/objects';
import { GEN } from '../src/content/gen';
import { parseCourse, type Course } from '../src/sim/course';
import { canUseAbility, createPlay, drainLog, takeShot, tick, type PlayEvent, type PlayState, type TickInput } from '../src/sim/play';
import { groundAt, startBody, stepShot, type ShotCommand } from '../src/sim/ball';

const T = DEFAULT_TUNING;

/** Rows of format-3 tile tokens into a course; the ball starts at `start`. */
function course(rows: string[], start: [number, number], legend: Record<string, string> = { g: 'grass', w: 'water' }): Course {
  const r = parseCourse({ format: 3, name: 't', legend, tiles: rows, start, exit: [rows[0]!.split(' ').length - 2, 1], quota: 0 });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

/** A flat field w x h at height 8, ringed by a wall at height 16 ("g" in base 36; two tiles high). */
function field(w: number, h: number, set: Record<string, string> = {}): Course {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    const row: string[] = [];
    for (let x = 0; x < w; x++) row.push(set[`${x},${y}`] ?? (x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 'gg' : 'g8'));
    rows.push(row.join(' '));
  }
  return course(rows, [1, Math.floor(h / 2)]);
}

const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });

/** Take a shot with this ability, pressing it on step `at`, with `input(step)` held. Runs until the ball stops. */
function play(c: Course, ability: string, cmd: ShotCommand, at: number, input: (step: number) => TickInput = () => ({})): { p: PlayState; log: PlayEvent[]; trace: { x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean }[] } {
  const p = createPlay(c, T, { seed: 'ab', loadout: { ability } });
  takeShot(p, cmd);
  const log: PlayEvent[] = [];
  const trace: { x: number; y: number; z: number; vx: number; vy: number; vz: number; grounded: boolean }[] = [];
  for (let i = 0; i < 6000 && p.shot; i++) {
    tick(p, { ...input(i), ...(i === at && { ability: true }) });
    log.push(...drainLog(p));
    if (p.shot) trace.push({ ...p.shot.ball });
  }
  return { p, log, trace };
}

// ---------------------------------------------------------------------------
// Burr

describe('Burr (sheet section 1.1)', () => {
  /** A long steep slope down along x (two steps per tile), far too steep to rest on, with flat ground at its foot. */
  function slope(): Course {
    const rows: string[] = [];
    for (let y = 0; y < 5; y++) {
      const row: string[] = [];
      for (let x = 0; x < 16; x++) {
        if (x === 0 || y === 0 || y === 4) row.push('gz');
        else if (x >= 3 && x <= 12) {
          const hi = 30 - 2 * (x - 3);
          const c = (n: number) => n.toString(36);
          row.push(`g${c(hi)}${c(hi - 2)}${c(hi - 2)}${c(hi)}`);
        } else row.push(x < 3 ? 'gu' : 'gc');
      }
      rows.push(row.join(' '));
    }
    return course(rows, [1, 2]);
  }

  it('sticks on a slope too steep to rest on, and stays for the next shot', () => {
    const c = slope();
    const lofted = shot({ type: 'lofted', power: 0.6 });
    const without = play(c, 'burr', lofted, -1).p.ball;
    const { p, trace } = play(c, 'burr', lofted, 10);
    expect(trace.length).toBeGreaterThan(10);
    // Stuck partway down the slope, not rolled to the foot like the shot without it.
    expect(p.ball.x).toBeGreaterThan(3);
    expect(p.ball.x).toBeLessThan(13);
    // Without Burr the same shot does not stay on the slope (it rolls to the foot or off the end).
    expect(without.x > 3 && without.x < 13).toBe(false);
    // The next shot starts from there: the ball is resting on the slope's ground.
    expect(p.ball.z).toBeCloseTo(groundAt(c, p.ball.x, p.ball.y)!.h, 5);
  });

  it('pressed while rolling, it sticks at once', () => {
    const c = field(14, 5);
    const { p } = play(c, 'burr', shot({ power: 0.6 }), 5);
    expect(p.ball.x).toBeLessThan(2.5);
  });

  it('into a wall in the air, it stops and drops to the foot of the wall', () => {
    const c = field(8, 5);
    const { p } = play(c, 'burr', shot({ type: 'lofted', power: 0.9 }), 5);
    expect(p.ball.x).toBeGreaterThan(6);
    expect(p.ball.x).toBeLessThan(7);
  });

  it('water still swallows it', () => {
    const set: Record<string, string> = {};
    for (let x = 5; x < 9; x++) for (let y = 1; y < 4; y++) set[`${x},${y}`] = 'w7';
    const c = field(14, 5, set);
    const { log } = play(c, 'burr', shot({ type: 'lofted', power: 0.85 }), 5);
    expect(log.some((e) => e.kind === 'damage' && e.cause === 'sunk')).toBe(true);
  });

  it('wears off after 3 seconds if it touches nothing', () => {
    // Dropped from very high, the ball falls for about 3.2 s: Burr runs out first, so it lands and bounces as normal.
    const c = field(14, 5);
    const s = startBody(T, { x: 6.5, y: 2.5, z: 100, vx: 0, vy: 0, vz: 0, grounded: false }, { vx: 0, vy: 0, vz: 0 });
    s.sticky = 360;
    for (let i = 0; i < 360; i++) stepShot(c, T, s);
    expect(s.sticky).toBe(0);
    expect(s.ball.grounded).toBe(false);
    for (let i = 0; i < 200 && !s.events.some((e) => e.kind === 'bounce' || e.kind === 'land'); i++) stepShot(c, T, s);
    expect(s.events.some((e) => e.kind === 'stick')).toBe(false);
    expect(s.events.some((e) => e.kind === 'bounce')).toBe(true);
  });

});

// ---------------------------------------------------------------------------
// Kite, Gyre, Drift

describe('Kite (sheet section 1.2)', () => {
  it('falls no faster than 1.5 tiles a second while gliding, and ends on landing', () => {
    const c = field(30, 5);
    const lofted = shot({ type: 'lofted', power: 0.6 });
    const glide = play(c, 'kite', lofted, 20);
    const plain = play(c, 'kite', lofted, -1);
    const after = glide.trace.slice(21);
    const firstLanding = after.findIndex((b) => b.grounded);
    for (const b of after.slice(0, firstLanding)) expect(b.vz).toBeGreaterThanOrEqual(-1.5 - 1e-9);
    // A longer flight than without it.
    expect(firstLanding + 21).toBeGreaterThan(plain.trace.findIndex((b, i) => i > 20 && b.grounded));
  });

  it('does nothing on the ground, and is not used up there', () => {
    const p = createPlay(field(14, 5), T, { seed: 'k', loadout: { ability: 'kite' } });
    takeShot(p, shot());
    tick(p);
    expect(canUseAbility(p)).toBe(false);
    tick(p, { ability: true });
    expect(p.abilityUsed).toBe(false);
  });
});

describe('Gyre (sheet section 1.3)', () => {
  it('turns the heading with the keys at up to 150 degrees a second, keeping the speed', () => {
    const c = field(30, 30);
    const p = createPlay(c, T, { seed: 'g', loadout: { ability: 'gyre' } });
    p.ball = { ...p.ball, x: 3.5, y: 15.5 };
    takeShot(p, shot({ power: 0.8 }));
    tick(p, { ability: true });
    const before = p.shot!.ball;
    const h0 = Math.atan2(before.vy, before.vx);
    const s0 = Math.hypot(before.vx, before.vy);
    for (let i = 0; i < 60; i++) tick(p, { steer: 1 });
    const b = p.shot!.ball;
    const turned = ((Math.atan2(b.vy, b.vx) - h0) * 180) / Math.PI;
    expect(turned).toBeGreaterThan(65);
    expect(turned).toBeLessThanOrEqual(75.5);
    // Speed only changes by the usual friction, as without steering.
    const q = createPlay(c, T, { seed: 'g', loadout: { ability: 'gyre' } });
    q.ball = { ...q.ball, x: 3.5, y: 15.5 };
    takeShot(q, shot({ power: 0.8 }));
    tick(q, { ability: true });
    for (let i = 0; i < 60; i++) tick(q);
    expect(Math.hypot(b.vx, b.vy) / s0).toBeCloseTo(Math.hypot(q.shot!.ball.vx, q.shot!.ball.vy) / s0, 1);
  });
});

describe('Drift (sheet section 1.4)', () => {
  it('floats for 1.5 seconds, moves in screen directions at 4 tiles a second, then drops straight down', () => {
    const c = field(30, 30);
    const { trace } = play(c, 'drift', shot({ power: 0.3 }), 2, (i) => (i > 2 && i < 2 + 180 ? { move: { x: 1, y: 0 } } : {}));
    const during = trace.slice(4, 150);
    // Screen right is grid (+1, -1): x grows and y shrinks at the same rate, 4 tiles a second in all.
    const a = during[0]!;
    const z = during[during.length - 1]!;
    const secs = (during.length - 1) / 120;
    expect((z.x - a.x) / secs).toBeCloseTo(4 / Math.SQRT2, 1);
    expect((z.y - a.y) / secs).toBeCloseTo(-4 / Math.SQRT2, 1);
    for (const b of during) expect(b.z).toBeGreaterThan(groundAt(c, b.x, b.y)!.h + 0.4);
    // After 1.5 s: no sideways speed, falling.
    const after = trace[2 + 181]!;
    expect(Math.hypot(after.vx, after.vy)).toBeLessThan(1e-6);
    expect(after.vz).toBeLessThan(0);
  });
});

describe('the four carriers (sheet section 1.5)', () => {
  it('each grub gives its ability, and the generator can place all ten', () => {
    for (const [grub, ability] of [['burrgrub', 'burr'], ['glidegrub', 'kite'], ['gyregrub', 'gyre'], ['driftgrub', 'drift']] as const) {
      const d = OBJECTS.get(grub) as EnemyDef;
      expect(d.grantsAbility).toBe(ability);
      expect(GEN.carriers).toContain(grub);
    }
    expect(GEN.carriers).toHaveLength(10);
  });
});
