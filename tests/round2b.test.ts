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
import { generateAttempt } from '../src/gen/generate';
import { generateCourse } from '../src/gen/validate';
import { botShotsFor } from '../src/content/run';
import { budgetFor, choices, courseJobFor, courseModFor, createRun, mixFor, regionDefFor, typeOf } from '../src/sim/run';
import { generateRunMap } from '../src/gen/runMap';
import { COURSE_MODS, type CourseMod } from '../src/content/modifiers';
import type { JourneySize } from '../src/content/gen';

/** A late course's size in region n (after 6 counted nodes), with its detail dial. */
function lateSize(n: number): JourneySize {
  const r = regionDefFor(n);
  const areas = Math.min(r.areas.max, r.areas.start + Math.floor(6 / r.areas.every));
  return { areas: [areas, areas], areaSize: r.areaSize, maxEnemies: r.maxEnemies, botShots: botShotsFor(areas), mix: mixFor(n), detail: r.detail };
}

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

// ---------------------------------------------------------------------------
// Switches, linked gates, drawbridges (sheet section 2)

describe('switches and linked gates (sheet sections 2.1 and 2.2)', () => {
  /** A flat field with a switch, and a linked gate across the whole width at x = 7. */
  function gated(switchAt: [number, number]): Course {
    const rows: string[] = [];
    for (let y = 0; y < 5; y++) rows.push(Array.from({ length: 14 }, (_, x) => (x === 0 || y === 0 || x === 13 || y === 4 ? 'gg' : 'g8')).join(' '));
    const objects = [{ id: 'switch', at: switchAt, link: 'a' }, ...[1, 2, 3].map((y) => ({ id: 'linked-gate', at: [7, y], link: 'a', orient: 'y' }))];
    const r = parseCourse({ format: 3, name: 'gate', legend: { g: 'grass' }, tiles: rows, start: [1, 2], exit: [12, 1], quota: 0, objects });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.course;
  }
  const roll = (c: Course, cmd = shot({ power: 0.7 })) => {
    const p = createPlay(c, T, { seed: 's' });
    takeShot(p, cmd);
    const log: PlayEvent[] = [];
    for (let i = 0; i < 6000 && p.shot; i++) {
      tick(p);
      log.push(...drainLog(p));
    }
    return { p, log };
  };

  it('rolling over the switch opens its gate for good', () => {
    const { p, log } = roll(gated([3, 2]));
    expect(log).toContainEqual({ kind: 'switchOn', link: 'a', x: 3.5, y: 2.5 });
    expect(p.movers.every((m) => m.open)).toBe(true);
    expect(p.ball.x).toBeGreaterThan(7);
  });

  it('a closed gate stops the ball', () => {
    const { p } = roll(gated([3, 1]));
    expect(p.switches[0]!.on).toBe(false);
    expect(p.ball.x).toBeLessThan(7);
  });

  it('a ball flying over the switch does not press it', () => {
    const { p } = roll(gated([2, 2]), shot({ type: 'lofted', power: 0.7 }));
    expect(p.switches[0]!.on).toBe(false);
  });

  it('a switch, linked gate or drawbridge must have a link letter', () => {
    const r = parseCourse({ format: 3, name: 'x', legend: { g: 'grass' }, tiles: ['g0 g0 g0', 'g0 g0 g0'], start: [0, 0], exit: [2, 1], quota: 0, objects: [{ id: 'switch', at: [1, 0] }] });
    expect(r.ok).toBe(false);
  });
});

describe('drawbridges (sheet section 2.3)', () => {
  /** A moat at x = 5..6, one step lower; the tiles at y = 2 are a drawbridge. */
  function moat(switchAt: [number, number]): Course {
    const rows: string[] = [];
    for (let y = 0; y < 5; y++) rows.push(Array.from({ length: 14 }, (_, x) => (x === 0 || y === 0 || x === 13 || y === 4 ? 'gg' : x === 5 || x === 6 ? 'w7' : 'g8')).join(' '));
    const objects = [{ id: 'switch', at: switchAt, link: 'b' }, { id: 'drawbridge', at: [5, 2], link: 'b' }, { id: 'drawbridge', at: [6, 2], link: 'b' }];
    const r = parseCourse({ format: 3, name: 'draw', legend: { g: 'grass', w: 'water' }, tiles: rows, start: [1, 2], exit: [12, 1], quota: 0, objects });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.course;
  }
  const roll = (c: Course) => {
    const p = createPlay(c, T, { seed: 'd' });
    takeShot(p, shot({ power: 0.7 }));
    const log: PlayEvent[] = [];
    for (let i = 0; i < 6000 && p.shot; i++) {
      tick(p);
      log.push(...drainLog(p));
    }
    return { p, log };
  };

  it('up, its tiles are the moat: the ball goes in the water', () => {
    const { log } = roll(moat([3, 1]));
    expect(log.some((e) => e.kind === 'damage' && e.cause === 'sunk')).toBe(true);
  });

  it('its switch brings it down: plank bridge one step higher, and the ball rolls across', () => {
    const { p, log } = roll(moat([3, 2]));
    expect(log).toContainEqual({ kind: 'bridgeDown', link: 'b' });
    const t = p.course.tiles[2 * p.course.width + 5]!;
    expect(t.surface).toBe('bridge');
    expect(t.corners).toEqual([8, 8, 8, 8]);
    expect(log.some((e) => e.kind === 'damage')).toBe(false);
    expect(p.ball.x).toBeGreaterThan(7);
  });
});

describe('generated switches (sheet sections 2.2 to 2.4)', () => {
  it('region 3 courses get drawbridges and linked gates, each with a switch of the same link', () => {
    let draw = 0;
    let gates = 0;
    for (let i = 0; i < 30; i++) {
      const r = generateAttempt(`LINK${i}`, 24, 0, lateSize(3));
      if (!r.ok) continue;
      const objs = r.course.objects;
      for (const o of objs.filter((x) => x.id === 'drawbridge' || x.id === 'linked-gate')) {
        expect(objs.some((s) => s.id === 'switch' && s.link === o.link)).toBe(true);
        if (o.id === 'drawbridge') draw++;
        else gates++;
      }
    }
    expect(draw).toBeGreaterThan(0);
    expect(gates).toBeGreaterThan(0);
  });

  it('region 1 never has them', () => {
    for (let i = 0; i < 10; i++) {
      const r = generateAttempt(`R1LINK${i}`, 16, 0, lateSize(1));
      if (r.ok) expect(r.course.objects.some((o) => ['switch', 'linked-gate', 'drawbridge'].includes(o.id))).toBe(false);
    }
  });

  it('a generated course with a switch passes the course check (the bot presses it)', () => {
    const res = generateCourse('CHK1', 20, T, { size: lateSize(2), extraCheck: (c) => (c.objects.some((o) => o.id === 'switch') ? null : 'no switch') });
    expect(res.fallback).toBe(false);
    expect(res.course.objects.some((o) => o.id === 'switch')).toBe(true);
  }, 120_000);
});

// ---------------------------------------------------------------------------
// Course modifiers (sheet section 3)

describe('course modifiers (sheet section 3)', () => {
  const flight = (mod: CourseMod | null, cmd: ShotCommand) => {
    const c = field(40, 40);
    const p = createPlay(c, T, { seed: 'm', loadout: { courseMod: mod } });
    p.ball = { ...p.ball, x: 20.5, y: 5.5 };
    takeShot(p, cmd);
    const trace: { x: number; y: number; z: number; grounded: boolean }[] = [];
    for (let i = 0; i < 4000 && p.shot; i++) {
      tick(p);
      if (p.shot) trace.push({ ...p.shot.ball });
    }
    return { p, trace };
  };
  const along = shot({ type: 'lofted', power: 0.6, angle: Math.PI / 2 });

  it('wind pushes the ball sideways in the air', () => {
    const calm = flight(null, along).trace;
    const windy = flight({ id: 'wind', dir: 'se' }, along).trace;
    const land = (t: typeof calm) => t[t.findIndex((b, i) => i > 5 && b.grounded)]!;
    expect(land(windy).x - land(calm).x).toBeGreaterThan(0.2);
  });

  it('wind does not push a rolling ball', () => {
    const roll = shot({ power: 0.6, angle: Math.PI / 2 });
    expect(flight({ id: 'wind', dir: 'se' }, roll).p.ball.x).toBeCloseTo(flight(null, roll).p.ball.x, 6);
  });

  it('low gravity: higher and longer shots', () => {
    // Height above the field's ground (it stands 2 tiles up).
    const peak = (t: { z: number }[]) => Math.max(...t.map((b) => b.z)) - 2;
    expect(peak(flight({ id: 'lowGravity' }, along).trace)).toBeGreaterThan(peak(flight(null, along).trace) * 1.4);
  });

  it('darkness halves the aim guide', () => {
    const p = createPlay(field(14, 5), T, { seed: 'd', loadout: { courseMod: { id: 'darkness' } } });
    expect(p.stats.get('guideLength')).toBeCloseTo(0.5);
  });

  it('none in region 1 or on boss fights; about 20% of courses in region 2 and 30% in region 3; the cost comes off the budget', () => {
    const rate = (region: number) => {
      let n = 0;
      let with_ = 0;
      for (let i = 0; i < 300; i++) {
        const run = createRun(`MOD${i}`, generateRunMap(`MOD${i}`));
        run.region = region;
        for (const node of choices(run)) {
          if (typeOf(run, node) === 'boss') expect(courseModFor(run, node)).toBeNull();
          if (typeOf(run, node) !== 'course') continue;
          n++;
          const mod = courseModFor(run, node);
          if (mod) {
            with_++;
            const job = courseJobFor(run, node)!;
            expect(job.budget).toBe(Math.max(GEN.minBudget, budgetFor(run, 'course') - COURSE_MODS.get(mod.id)!.cost));
            expect(job.opts.loadout.courseMod).toEqual(mod);
          }
        }
      }
      return with_ / n;
    };
    expect(rate(1)).toBe(0);
    expect(rate(2)).toBeCloseTo(0.2, 1);
    expect(rate(3)).toBeCloseTo(0.3, 1);
  });
});
