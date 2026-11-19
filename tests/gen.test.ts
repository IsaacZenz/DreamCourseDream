/**
 * Course generator tests (Milestone 5 and 5b design sheets, section 7).
 */
import { describe, expect, it } from 'vitest';
import { GEN } from '../src/content/gen';
import { OBJECTS, type EnemyDef } from '../src/content/objects';
import { SURFACES } from '../src/content/surfaces';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { playBot } from '../src/gen/bot';
import { generateAttempt } from '../src/gen/generate';
import { journeyRow } from '../src/gen/journey';
import { checkStructure } from '../src/gen/structure';
import { fallbackCourse, generateCourse } from '../src/gen/validate';
import { parseCourse, railTiles, tileAt, MAX_HEIGHT, type Course } from '../src/sim/course';
import { shapeOf } from '../src/sim/tileShape';
import { clonePlay, createPlay, runShot, takeShot } from '../src/sim/play';

const T = DEFAULT_TUNING;
const BUDGETS = [8, 12, 20, 30];

/** Many quick attempts (no bot), for checking the rules every course must keep. */
const SAMPLE = Array.from({ length: 160 }, (_, i) => generateAttempt(`S${i}`, BUDGETS[i % 4]!, 0));
const GOOD = SAMPLE.filter((r) => r.ok);

function parse(raw: unknown): Course {
  const r = parseCourse(raw);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

describe('journey generator', () => {
  it('same seed and budget give the identical course', () => {
    const a = generateCourse('DET123', 12, T);
    const b = generateCourse('DET123', 12, T);
    expect(JSON.stringify(a.raw)).toBe(JSON.stringify(b.raw));
    expect(a.attempts).toBe(b.attempts);
  });

  it('different seeds give different courses', () => {
    const seen = new Set<string>();
    for (const r of GOOD) seen.add(JSON.stringify(r.raw.tiles));
    expect(seen.size).toBe(GOOD.length);
  });

  it('most attempts make a valid course file', () => {
    expect(GOOD.length).toBeGreaterThanOrEqual(SAMPLE.length * 0.9);
  });

  it('writes format 3, every corner from 0 to the limit, every tile a legal shape', () => {
    for (const r of GOOD) {
      expect(r.raw.format).toBe(3);
      for (const t of r.course.tiles) {
        if (!t) continue;
        expect(shapeOf(t.corners)).not.toBeNull();
        for (const c of t.corners) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(MAX_HEIGHT);
        }
      }
    }
  });

  it('has the number of areas the budget calls for, and grows with the budget', () => {
    const area = (b: number) => GOOD.filter((r) => r.meta.budget === b).map((r) => r.course.width * r.course.height);
    for (const r of GOOD) {
      const row = journeyRow(r.meta.budget);
      const n = r.meta.terrain.regions.filter((g) => g.kind === 'area').length;
      expect(n).toBeGreaterThanOrEqual(row.areas[0]);
      expect(n).toBeLessThanOrEqual(row.areas[1]);
    }
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(area(30))).toBeGreaterThan(avg(area(8)) * 2);
  });

  it('never overspends the budget', () => {
    for (const r of GOOD) {
      const s = r.meta.spend;
      expect(s.terrain + s.enemies + s.obstacles + s.hazards).toBeLessThanOrEqual(r.meta.budget);
      expect(s.terrain).toBeLessThanOrEqual(Math.floor(r.meta.budget * GEN.terrainShare));
    }
  });

  it('puts rails on edges, more at low budgets than high ones', () => {
    const railsPer = (b: number) => {
      const rs = GOOD.filter((r) => r.meta.budget === b);
      return rs.reduce((n, r) => n + railTiles(r.course.rails).size / Math.max(1, r.course.tiles.filter(Boolean).length), 0) / rs.length;
    };
    expect(railsPer(8)).toBeGreaterThan(0);
    expect(railsPer(8)).toBeGreaterThan(railsPer(30));
  });

  it('gets busier along the journey: more enemies in the last area than the first, overall', () => {
    let first = 0;
    let last = 0;
    for (const r of GOOD) {
      const areas = r.meta.terrain.regions.map((g, i) => ({ g, i })).filter((a) => a.g.kind === 'area');
      const inArea = (i: number) => r.course.objects.filter((o) => OBJECTS.get(o.id)?.kind === 'enemy' && r.meta.terrain.region[o.y * r.course.width + o.x] === i).length;
      first += inArea(areas[0]!.i);
      last += inArea(areas[areas.length - 1]!.i);
    }
    expect(last).toBeGreaterThan(first);
  });

  it('keeps the safety rules around the start and the exit, and nothing on a rail', () => {
    for (const r of GOOD) {
      const c = r.course;
      const s = c.start;
      const onRail = railTiles(c.rails);
      expect(onRail.has(`${s.x},${s.y}`)).toBe(false);
      expect(onRail.has(`${c.exit.x},${c.exit.y}`)).toBe(false);
      for (const o of c.objects) {
        for (const p of [{ x: o.x, y: o.y }, ...o.path]) {
          expect(Math.hypot(p.x - s.x, p.y - s.y), `${o.id} near the start`).toBeGreaterThan(GEN.startClear);
          expect(Math.max(Math.abs(p.x - c.exit.x), Math.abs(p.y - c.exit.y)), `${o.id} near the exit`).toBeGreaterThan(1);
        }
        if (OBJECTS.get(o.id)?.kind !== 'cloud') expect(onRail.has(`${o.x},${o.y}`), `${o.id} on a rail`).toBe(false);
        const def = OBJECTS.get(o.id);
        if (def?.kind === 'enemy') {
          const outer = (def as EnemyDef).stats.outerRadius ?? 0;
          if (outer > 0) expect(Math.hypot(o.x - s.x, o.y - s.y)).toBeGreaterThan(outer);
        }
      }
      const st = tileAt(c, s.x, s.y)!;
      expect(shapeOf(st.corners)).toBe('0000');
      expect(SURFACES.get(st.surface)?.canHoldBall).toBe(true);
    }
  });

  it('sets the quota to 60% of the stars on offer, rounded, at least 2', () => {
    for (const r of GOOD) {
      expect(r.course.quota).toBe(Math.min(r.meta.stars, Math.max(GEN.minQuota, Math.round(r.meta.stars * GEN.quotaShare))));
      expect(r.meta.enemies).toBeGreaterThanOrEqual(GEN.minEnemies);
      expect(r.meta.enemies).toBeLessThanOrEqual(GEN.maxEnemies);
    }
  });

  it('passes the structure check almost always, gaps included', () => {
    const passed = GOOD.filter((r) => checkStructure(r.course).ok).length;
    expect(passed).toBeGreaterThanOrEqual(GOOD.length * 0.95);
  });
});

describe('structure validator', () => {
  const course = (rows: string[], objects: unknown[] = [], quota = 0) =>
    parse({ format: 2, name: 'S', legend: { g: 'grass' }, tiles: rows, start: [0, 0], exit: [4, 0], quota, objects });

  it('accepts an open course', () => {
    expect(checkStructure(course(['g0 g0 g0 g0 g0', 'g0 g0 g0 g0 g0']))).toEqual({ ok: true });
  });

  it('two steps up is a wall; one step up or any drop is fine', () => {
    expect(checkStructure(course(['g0 g0 g2 g2 g2', 'g0 g0 g2 g2 g2']))).toEqual({ ok: false, reason: 'exit unreachable' });
    expect(checkStructure(course(['g0 g0 g1 g1 g1', 'g0 g0 g1 g1 g1']))).toEqual({ ok: true });
    expect(checkStructure(course(['g3 g3 g0 g0 g0', 'g3 g3 g0 g0 g0']))).toEqual({ ok: true });
  });

  it('a gap of up to 3 empty tiles can be jumped to the same height or lower, not up', () => {
    const gap = (far: string) => {
      const row = `g4 g4 . . ${far} ${far} ${far}`;
      return parse({ format: 3, name: 'G', legend: { g: 'grass' }, tiles: [row, row], start: [0, 0], exit: [6, 0], quota: 0 });
    };
    expect(checkStructure(gap('g4'))).toEqual({ ok: true });
    expect(checkStructure(gap('g8'))).toEqual({ ok: false, reason: 'exit unreachable' });
  });

  it('rejects a sealed exit and too few reachable stars', () => {
    const sealed = parse({ format: 2, name: 'S', legend: { g: 'grass' }, tiles: ['g0 g0 g3 g0 g0', 'g0 g0 g3 g0 g0'], start: [0, 0], exit: [4, 0], quota: 0 });
    expect(checkStructure(sealed)).toEqual({ ok: false, reason: 'exit unreachable' });
    const stars = parse({
      format: 2,
      name: 'S',
      legend: { g: 'grass' },
      tiles: ['g0 g0 g0 g0 g0 . . . . . g0', 'g0 g0 g0 g0 g0 . . . . . g0'],
      start: [0, 0],
      exit: [4, 0],
      quota: 1,
      objects: [{ id: 'snoozegrub', at: [10, 1] }],
    });
    expect(checkStructure(stars)).toEqual({ ok: false, reason: 'too few reachable stars' });
  });
});

describe('bot', () => {
  it('wins the fallback course', () => {
    const r = playBot(parse(fallbackCourse('BOT', 8)), T, 'BOT');
    expect(r.passed).toBe(true);
    expect(r.moves.length).toBe(r.shots);
  });

  it('fails a course it cannot finish', () => {
    // The only enemy is out of reach on an island, so the quota can never be met.
    const c = parse({
      format: 2,
      name: 'Impossible',
      legend: { g: 'grass' },
      tiles: ['g0 g0 g0 g0 g0 . . . . . g0'],
      start: [0, 0],
      exit: [4, 0],
      quota: 1,
      objects: [{ id: 'snoozegrub', at: [10, 0] }],
    });
    const r = playBot(c, T, 'BOT');
    expect(r.passed).toBe(false);
  });

  it("trial shots on a copy do not change the real game, and match it exactly", () => {
    const c = parse(fallbackCourse('CLONE', 8));
    const play = createPlay(c, T, { seed: 'CLONE' });
    const before = JSON.stringify({ b: play.ball, h: play.health, m: play.meter, e: play.enemies.map((e) => [e.x, e.y, e.defeated]), clock: play.clock });
    const copy = clonePlay(play);
    const cmd = { angle: 0, power: 0.7, type: 'ground' as const, topSpin: 0, sideSpin: 0 };
    takeShot(copy, cmd);
    runShot(copy);
    expect(JSON.stringify({ b: play.ball, h: play.health, m: play.meter, e: play.enemies.map((e) => [e.x, e.y, e.defeated]), clock: play.clock })).toBe(before);
    takeShot(play, cmd);
    runShot(play);
    expect(play.ball).toEqual(copy.ball);
    expect(play.meter).toBe(copy.meter);
    expect(play.clock).toBe(copy.clock);
  });

  it('replaying its moves at the same clock steps gives the same win', () => {
    const g = generateCourse('REPLAY', 12, T);
    expect(g.bot?.passed).toBe(true);
    const play = createPlay(g.course, T, { seed: 'REPLAY' });
    for (const m of g.bot!.moves) {
      expect(play.clock).toBe(m.clock);
      takeShot(play, m.cmd);
      runShot(play);
    }
    expect(play.status).toBe('won');
  });
});

describe('reject and retry', () => {
  it('logs each rejection and tries a different course', () => {
    const shapes: string[] = [];
    const r = generateCourse('RETRY', 12, T, {
      noBot: true,
      extraCheck: (course, attempt) => {
        shapes.push(JSON.stringify(course.tiles.map((t) => t?.surface)));
        return attempt < 3 ? 'test says no' : null;
      },
    });
    expect(r.attempts).toBe(3);
    expect(r.rejections).toEqual({ 'test says no': 2 });
    expect(r.summary).toContain('test says no ×2');
    expect(new Set(shapes).size).toBeGreaterThan(1);
  });

  it('falls back to the safe course when every attempt fails, and the fallback always passes', () => {
    const r = generateCourse('NOPE', 12, T, { noBot: true, extraCheck: () => 'never' });
    expect(r.fallback).toBe(true);
    expect(r.attempts).toBe(GEN.attempts * 2);
    expect(r.summary).toMatch(/^WARNING/);
    expect(checkStructure(r.course)).toEqual({ ok: true });
    expect(playBot(r.course, T, 'NOPE').passed).toBe(true);
  });
});
