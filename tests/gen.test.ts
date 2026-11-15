/**
 * Course generator tests (Milestone 5 design sheet, section 7).
 */
import { describe, expect, it } from 'vitest';
import { CHUNK_FILES } from '../src/content/chunks/index';
import { GEN } from '../src/content/gen';
import { OBJECTS, type EnemyDef } from '../src/content/objects';
import { DIRECTION_VECTORS, DIRECTIONS, SURFACES, type Direction } from '../src/content/surfaces';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { checkSides, loadChunks, orient, orientations, parseChunk, opposite } from '../src/gen/chunks';
import { playBot } from '../src/gen/bot';
import { generateAttempt } from '../src/gen/generate';
import { CHUNKS } from '../src/gen/layout';
import { checkStructure } from '../src/gen/structure';
import { fallbackCourse, generateCourse } from '../src/gen/validate';
import { parseCourse, tileAt, MAX_HEIGHT, type Course } from '../src/sim/course';
import { clonePlay, createPlay, runShot, takeShot } from '../src/sim/play';

const T = DEFAULT_TUNING;
const BUDGETS = [8, 12, 20, 40];

/** Many quick attempts (no bot), for checking the rules every course must keep. */
const SAMPLE = Array.from({ length: 200 }, (_, i) => generateAttempt(`S${i}`, BUDGETS[i % 4]!, 0)).filter((r) => r.ok);

function parse(raw: unknown): Course {
  const r = parseCourse(raw);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

describe('chunks', () => {
  it('every chunk file parses', () => {
    expect(() => loadChunks(CHUNK_FILES)).not.toThrow();
    expect(CHUNKS.length).toBeGreaterThanOrEqual(12);
  });

  it('every turned and flipped version keeps its open sides flat, level and matching', () => {
    for (const c of CHUNKS) {
      for (const o of orientations(c)) {
        expect(checkSides(o), `${c.id} r${o.rot} m${o.mirror}`).toEqual([]);
        expect(o.open.length).toBe(c.open.length);
      }
    }
  });

  it('four quarter turns give the chunk back', () => {
    for (const c of CHUNKS) {
      const once = orient(c, 1, false);
      const back = orient(orient(orient(once, 1, false), 1, false), 1, false);
      expect(back.tiles).toEqual(c.tiles);
      expect(orient(orient(c, 0, true), 0, true).tiles).toEqual(c.tiles);
    }
  });

  it('every spot is on a tile that can take it', () => {
    for (const c of CHUNKS) {
      for (const s of c.spots) {
        for (const [x, y] of s.tiles ?? [s.at]) {
          const t = c.tiles[y]?.[x];
          expect(t, `${c.id} ${s.kind} at ${x},${y}`).toBeTruthy();
          if (s.kind !== 'hazard' && s.kind !== 'cloud' && s.kind !== 'lane') expect(SURFACES.get(t!.surface)?.canHoldBall, `${c.id} ${s.kind}`).toBe(true);
        }
      }
    }
  });

  it('rejects a chunk whose open side is not flat', () => {
    // The ramp's ne side has a slope in the middle, so it cannot be an open side.
    const bad = { ...(CHUNK_FILES.find((f) => (f as { id: string }).id === 'ramp') as Record<string, unknown>), open: ['ne'] };
    const r = parseChunk(bad);
    expect(r.ok).toBe(false);
  });
});

describe('generator', () => {
  it('same seed and budget give the identical course', () => {
    const a = generateCourse('DET123', 12, T);
    const b = generateCourse('DET123', 12, T);
    expect(JSON.stringify(a.raw)).toBe(JSON.stringify(b.raw));
    expect(a.attempts).toBe(b.attempts);
  });

  it('different seeds give different courses', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const r = generateAttempt(`D${i}`, 12, 0);
      if (r.ok) seen.add(JSON.stringify({ t: r.raw.tiles, o: r.raw.objects }));
    }
    expect(seen.size).toBeGreaterThanOrEqual(95);
  });

  it('nearly every attempt makes a valid course file', () => {
    expect(SAMPLE.length).toBeGreaterThanOrEqual(190);
  });

  it('heights stay from 0 to the limit, and every ledge on the route faces downhill', () => {
    for (const r of SAMPLE) {
      if (!r.ok) continue;
      for (const t of r.course.tiles) if (t) for (const c of t.corners) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(MAX_HEIGHT);
        }
      const chunks = r.meta.layout.chunks;
      for (const pc of chunks) {
        if (!pc.chunk.oneWay) continue;
        const prev = chunks.find((o) => o.order === pc.order - 1 && o.chunk.role !== 'branch');
        const next = chunks.find((o) => o.order === pc.order + 1 && o.chunk.role !== 'branch');
        const side = (o: typeof pc): Direction => DIRECTIONS.find((d) => DIRECTION_VECTORS[d][0] === o.sx - pc.sx && DIRECTION_VECTORS[d][1] === o.sy - pc.sy)!;
        expect(pc.chunk.sideHeight[side(prev!)]!).toBeGreaterThan(pc.chunk.sideHeight[side(next!)]!);
      }
    }
  });

  it('joined sides meet at the same height', () => {
    for (const r of SAMPLE) {
      if (!r.ok) continue;
      const chunks = r.meta.layout.chunks;
      for (const pc of chunks) {
        for (const side of pc.joined) {
          const nb = chunks.find((o) => o.sx === pc.sx + DIRECTION_VECTORS[side][0] && o.sy === pc.sy + DIRECTION_VECTORS[side][1])!;
          expect(pc.offset + pc.chunk.sideHeight[side]!).toBe(nb.offset + nb.chunk.sideHeight[opposite(side)]!);
        }
      }
    }
  });

  it('never overspends the budget, and spends at least half on enemies on average', () => {
    let enemies = 0;
    let total = 0;
    for (const r of SAMPLE) {
      if (!r.ok) continue;
      const s = r.meta.spend;
      expect(s.terrain + s.enemies + s.obstacles + s.hazards).toBeLessThanOrEqual(r.meta.budget);
      expect(s.terrain).toBeLessThanOrEqual(Math.floor(r.meta.budget * GEN.terrainShare));
      enemies += s.enemies;
      total += r.meta.budget;
    }
    expect(enemies / total).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps the safety rules around the start and the exit', () => {
    for (const r of SAMPLE) {
      if (!r.ok) continue;
      const c = r.course;
      const s = c.start;
      for (const o of c.objects) {
        for (const p of [{ x: o.x, y: o.y }, ...o.path]) {
          expect(Math.hypot(p.x - s.x, p.y - s.y), `${o.id} near the start`).toBeGreaterThan(GEN.startClear);
          expect(Math.max(Math.abs(p.x - c.exit.x), Math.abs(p.y - c.exit.y)), `${o.id} near the exit`).toBeGreaterThan(1);
        }
        const def = OBJECTS.get(o.id);
        if (def?.kind === 'enemy') {
          const outer = (def as EnemyDef).stats.outerRadius ?? 0;
          if (outer > 0) expect(Math.hypot(o.x - s.x, o.y - s.y)).toBeGreaterThan(outer);
        }
      }
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = tileAt(c, s.x + dx, s.y + dy);
          if (t) expect(SURFACES.get(t.surface)?.cost, `hazard next to the start`).toBeUndefined();
        }
      }
    }
  });

  it('sets the quota to 60% of the stars on offer, rounded, at least 2', () => {
    for (const r of SAMPLE) {
      if (!r.ok) continue;
      expect(r.course.quota).toBe(Math.min(r.meta.stars, Math.max(GEN.minQuota, Math.round(r.meta.stars * GEN.quotaShare))));
      expect(r.meta.enemies).toBeGreaterThanOrEqual(GEN.minEnemies);
      expect(r.meta.enemies).toBeLessThanOrEqual(GEN.maxEnemies);
    }
  });

  it('cracked tiles only appear with an Anchorback on the course', () => {
    for (const r of SAMPLE) {
      if (!r.ok) continue;
      const ids = r.course.objects.map((o) => o.id);
      if (ids.includes('cracked-tile')) expect(ids).toContain('anchorback');
    }
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

  it('rejects a sealed exit and too few reachable stars', () => {
    const sealed = parse({ format: 2, name: 'S', legend: { g: 'grass' }, tiles: ['g0 g0 g3 g0 g0', 'g0 g0 g3 g0 g0'], start: [0, 0], exit: [4, 0], quota: 0 });
    expect(checkStructure(sealed)).toEqual({ ok: false, reason: 'exit unreachable' });
    const stars = parse({
      format: 2,
      name: 'S',
      legend: { g: 'grass' },
      tiles: ['g0 g0 g0 g0 g0 . g0', 'g0 g0 g0 g0 g0 . g0'],
      start: [0, 0],
      exit: [4, 0],
      quota: 1,
      objects: [{ id: 'mossback', at: [6, 1] }],
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
      objects: [{ id: 'mossback', at: [10, 0] }],
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
