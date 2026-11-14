import { describe, expect, it } from 'vitest';
import { Rng } from '../src/sim/rng';

function draw(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => rng.nextUint32());
}

describe('Rng', () => {
  it('gives the same numbers for the same seed', () => {
    expect(draw(Rng.fromSeed('BIRDIE-42'), 100)).toEqual(draw(Rng.fromSeed('BIRDIE-42'), 100));
  });

  it('gives different numbers for different seeds', () => {
    expect(draw(Rng.fromSeed('a'), 10)).not.toEqual(draw(Rng.fromSeed('b'), 10));
  });

  it('treats a number seed and its string form the same', () => {
    expect(draw(Rng.fromSeed(1234), 10)).toEqual(draw(Rng.fromSeed('1234'), 10));
  });

  it('matches known values, so a code change cannot silently change every seed', () => {
    // If this fails, every saved seed and bug report now produces a different run.
    // Only update these numbers on purpose.
    expect(draw(Rng.fromSeed('dream'), 5)).toMatchInlineSnapshot(`
      [
        176805334,
        2879717593,
        4123908193,
        1807211740,
        3399439793,
      ]
    `);
  });

  it('resumes exactly from a saved state', () => {
    const rng = Rng.fromSeed('save-me');
    draw(rng, 37);
    const restored = Rng.fromState(rng.getState());
    expect(draw(restored, 50)).toEqual(draw(rng, 50));
  });

  it('rejects a broken saved state', () => {
    expect(() => Rng.fromState([1, 2, 3] as unknown as [number, number, number, number])).toThrow();
    expect(() => Rng.fromState([1, 2, 3, -1])).toThrow();
    expect(() => Rng.fromState([1, 2, 3, 2 ** 32])).toThrow();
  });

  it('clone() continues identically without affecting the original', () => {
    const rng = Rng.fromSeed('clone');
    const copy = rng.clone();
    expect(draw(copy, 20)).toEqual(draw(rng, 20));
  });

  it('fork() is repeatable, label-specific, and does not advance the parent', () => {
    const rng = Rng.fromSeed('fork');
    const before = rng.getState();
    const mapA = draw(rng.fork('map'), 10);
    const mapB = draw(rng.fork('map'), 10);
    const course = draw(rng.fork('course-1'), 10);
    expect(rng.getState()).toEqual(before);
    expect(mapA).toEqual(mapB);
    expect(mapA).not.toEqual(course);
  });

  it('next() stays in [0, 1)', () => {
    const rng = Rng.fromSeed('unit');
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int() stays in range, includes both ends, and is roughly even', () => {
    const rng = Rng.fromSeed('dice');
    const counts = new Map<number, number>();
    const rolls = 60_000;
    for (let i = 0; i < rolls; i++) {
      const x = rng.int(1, 6);
      expect(Number.isInteger(x)).toBe(true);
      counts.set(x, (counts.get(x) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan((rolls / 6) * 0.95);
      expect(c).toBeLessThan((rolls / 6) * 1.05);
    }
  });

  it('int() handles a single value and negative ranges', () => {
    const rng = Rng.fromSeed('edge');
    expect(rng.int(5, 5)).toBe(5);
    for (let i = 0; i < 1000; i++) {
      const x = rng.int(-3, -1);
      expect(x).toBeGreaterThanOrEqual(-3);
      expect(x).toBeLessThanOrEqual(-1);
    }
  });

  it('int() rejects bad arguments', () => {
    const rng = Rng.fromSeed('bad');
    expect(() => rng.int(6, 1)).toThrow();
    expect(() => rng.int(0, 1.5)).toThrow();
  });

  it('float() stays in [min, max)', () => {
    const rng = Rng.fromSeed('float');
    for (let i = 0; i < 1000; i++) {
      const x = rng.float(-2, 3);
      expect(x).toBeGreaterThanOrEqual(-2);
      expect(x).toBeLessThan(3);
    }
  });

  it('chance() respects 0 and 1 and is roughly right in between', () => {
    const rng = Rng.fromSeed('chance');
    let hits = 0;
    for (let i = 0; i < 10_000; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
      if (rng.chance(0.25)) hits++;
    }
    expect(hits).toBeGreaterThan(2300);
    expect(hits).toBeLessThan(2700);
  });

  it('pick() returns an item from the list and rejects an empty list', () => {
    const rng = Rng.fromSeed('pick');
    const items = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });

  it('shuffle() keeps the same items and leaves the original alone', () => {
    const rng = Rng.fromSeed('shuffle');
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toEqual(items);
  });
});
