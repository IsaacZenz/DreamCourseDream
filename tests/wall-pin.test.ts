/**
 * Bug found 2026-11-19: a patroller whose path ends next to a wall pushed the
 * resting ball through the wall and off the course, again on every pass.
 *
 * The obstacle push-out placed the ball just past the wall line, so the wall
 * check on the next step never saw the wall, and the ball rolled up over it.
 * The push-out now goes through the same wall check as any other move.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { parseCourse, type Course } from '../src/sim/course';
import { ballNow, createPlay, drainLog, tick, type PlayEvent } from '../src/sim/play';

const W = 10;
const H = 5;

/** Flat grass (height 1) ringed by edge tiles at height 5: the wall is one tile high. */
function fieldWith(enemy: string): Course {
  const rows: string[] = [];
  for (let y = 0; y < H + 2; y++) {
    const row: string[] = [];
    for (let x = 0; x < W + 2; x++) row.push(x === 0 || y === 0 || x === W + 1 || y === H + 1 ? 'g5' : 'g1');
    rows.push(row.join(' '));
  }
  const r = parseCourse({
    format: 3,
    name: 'wall pin',
    legend: { g: 'grass' },
    tiles: rows,
    start: [1, 2],
    exit: [W, H],
    quota: 0,
    objects: [{ id: enemy, at: [4, 2], path: [[1, 2]] }],
  });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

describe('a patroller pinning the ball against a wall', () => {
  for (const enemy of ['mudroller', 'skitter-ant']) {
    it(`${enemy}: the ball is knocked but never pushed through the wall`, () => {
      const p = createPlay(fieldWith(enemy), DEFAULT_TUNING, { seed: 'wall-pin' });
      const log: PlayEvent[] = [];
      for (let i = 0; i < 2000; i++) {
        // The Mudroller hurts on contact (it survives a bump), which is not what this test is about:
        // keep the health topped up so that damage cannot end the course before 2000 steps.
        p.health = 5;
        tick(p);
        log.push(...drainLog(p));
        const b = ballNow(p);
        // Inside the wall ring, and never up on top of the wall (grass is at 0.25 tiles, the wall top at 1.25).
        expect(b.x).toBeGreaterThan(1);
        expect(b.x).toBeLessThan(W + 1);
        expect(b.y).toBeGreaterThan(1);
        expect(b.y).toBeLessThan(H + 1);
        expect(b.z).toBeLessThan(1);
      }
      expect(p.status).toBe('playing');
      expect(log.filter((e) => e.kind === 'knocked').length).toBeGreaterThan(1);
      expect(log.filter((e) => e.kind === 'damage' && e.cause === 'out')).toEqual([]);
      expect(log.filter((e) => e.kind === 'returned')).toEqual([]);
    });
  }
});
