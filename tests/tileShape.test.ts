import { describe, expect, it } from 'vitest';
import { SHAPES, heightAt, shapeOf, triangles, type Corners } from '../src/sim/tileShape';

describe('tile shapes', () => {
  it('has exactly 13 allowed shapes', () => {
    expect(SHAPES).toHaveLength(13);
    expect(new Set(SHAPES).size).toBe(13);
  });

  it('names shapes relative to the lowest corner', () => {
    expect(shapeOf([3, 3, 3, 3])).toBe('0000');
    expect(shapeOf([3, 2, 2, 3])).toBe('1001');
    expect(shapeOf([2, 2, 1, 2])).toBe('1101');
  });

  it('rejects saddles and steps bigger than one', () => {
    expect(shapeOf([1, 0, 1, 0])).toBeNull();
    expect(shapeOf([0, 1, 0, 1])).toBeNull();
    expect(shapeOf([2, 0, 0, 0])).toBeNull();
  });

  it('splits odd-corner tiles along the diagonal that avoids the odd corner', () => {
    // Raised nw corner: split ne–sw, so no triangle uses both nw and se.
    for (const tri of triangles('1000')) expect(tri.includes(0) && tri.includes(2)).toBe(false);
    // Raised ne corner: split nw–se.
    for (const tri of triangles('0100')) expect(tri.includes(1) && tri.includes(3)).toBe(false);
  });
});

describe('heightAt', () => {
  const at = (c: Corners, u: number, v: number) => heightAt(c, shapeOf(c)!, u, v);

  it('returns the corner heights at the corners', () => {
    const c: Corners = [2, 1, 1, 2];
    expect(at(c, 0, 0)).toBeCloseTo(2);
    expect(at(c, 1, 0)).toBeCloseTo(1);
    expect(at(c, 1, 1)).toBeCloseTo(1);
    expect(at(c, 0, 1)).toBeCloseTo(2);
  });

  it('is a straight ramp across a straight slope', () => {
    expect(at([2, 1, 1, 2], 0.5, 0.5)).toBeCloseTo(1.5);
    expect(at([2, 1, 1, 2], 0.25, 0.9)).toBeCloseTo(1.75);
  });

  it('keeps the flat half of a raised-corner tile flat', () => {
    // nw raised: the triangle ne–se–sw is flat at 0.
    expect(at([1, 0, 0, 0], 0.9, 0.9)).toBeCloseTo(0);
    expect(at([1, 0, 0, 0], 0.5, 0.5)).toBeCloseTo(0);
    expect(at([1, 0, 0, 0], 0.1, 0.1)).toBeCloseTo(0.8);
  });
});
