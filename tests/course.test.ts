import { describe, expect, it } from 'vitest';
import { TEST_COURSES } from '../src/content/courses';
import { SURFACES } from '../src/content/surfaces';
import { SHAPES } from '../src/sim/tileShape';
import { parseCourse, tileAt } from '../src/sim/course';

function base(overrides: Record<string, unknown> = {}) {
  return {
    format: 1,
    name: 'Mini',
    legend: { g: 'grass', '~': 'water', '>': { surface: 'booster', dir: 'se' }, w: { surface: 'warp', link: 'a' } },
    tiles: ['g0 g0 g1', 'g0 g0 g0'],
    start: [0, 0],
    exit: [1, 1],
    quota: 0,
    ...overrides,
  };
}

function errorsFor(raw: unknown): string[] {
  const r = parseCourse(raw);
  return r.ok ? [] : r.errors;
}

describe('test courses', () => {
  for (const file of TEST_COURSES) {
    it(`${file.id} passes the schema check`, () => {
      const r = parseCourse(file.data);
      expect(r.ok ? [] : r.errors).toEqual([]);
    });
  }

  it('the slopes course uses every surface and every tile shape', () => {
    const r = parseCourse(TEST_COURSES.find((c) => c.id === 'slopes-surfaces')!.data);
    if (!r.ok) throw new Error(r.errors.join('\n'));
    const tiles = r.course.tiles.filter((t) => t !== null);
    expect(new Set(tiles.map((t) => t.surface))).toEqual(new Set(SURFACES.keys()));
    expect(new Set(tiles.map((t) => t.shape))).toEqual(new Set(SHAPES));
    expect(r.course.tiles.some((t) => t === null)).toBe(true); // has an out-of-bounds hole
  });
});

describe('parseCourse', () => {
  it('reads a small course', () => {
    const r = parseCourse(base());
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.course.width).toBe(3);
    expect(r.course.height).toBe(2);
    expect(tileAt(r.course, 2, 0)?.corners).toEqual([1, 1, 1, 1]);
    expect(tileAt(r.course, 3, 0)).toBeNull();
  });

  it('reads corner heights, directions and links', () => {
    const r = parseCourse(base({ tiles: ['g0 g1001 >0', 'w0 g0 w0'] }));
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(tileAt(r.course, 1, 0)).toMatchObject({ corners: [1, 0, 0, 1], shape: '1001', base: 0 });
    expect(tileAt(r.course, 2, 0)?.dir).toBe('se');
    expect(tileAt(r.course, 0, 1)?.link).toBe('a');
  });

  const bad: Array<[string, unknown, RegExp]> = [
    ['not an object', 'hello', /JSON object/],
    ['wrong format version', base({ format: 3 }), /"format" must be one of 1, 2/],
    ['an unknown field (typo)', base({ qouta: 1 }), /Unknown field.*qouta/],
    ['rows of different lengths', base({ tiles: ['g0 g0 g0', 'g0 g0'] }), /row 1: has 2 tiles/],
    ['a letter missing from the legend', base({ tiles: ['g0 g0 q0', 'g0 g0 g0'] }), /"q" is not in the legend/],
    ['a malformed tile', base({ tiles: ['g0 g00 g0', 'g0 g0 g0'] }), /expected a legend letter/],
    ['a saddle tile', base({ tiles: ['g0 g1010 g0', 'g0 g0 g0'] }), /opposite corners/],
    ['a step of two inside a tile', base({ tiles: ['g0 g2000 g0', 'g0 g0 g0'] }), /differ by at most 1/],
    ['a sloped booster', base({ tiles: ['g0 >1100 g0', 'g0 g0 g0'] }), /booster tiles must be flat/],
    ['a booster with no direction', base({ legend: { g: 'grass', '>': 'booster' } }), /needs "dir"/],
    ['an unknown surface', base({ legend: { g: 'gras' } }), /unknown surface "gras"/],
    ['a warp with no partner', base({ tiles: ['g0 g0 w0', 'g0 g0 g0'] }), /used by 1 tile/],
    ['start off the grid', base({ start: [9, 9] }), /"start" \(9, 9\) is not on a tile/],
    ['start in a hole', base({ tiles: ['. g0 g0', 'g0 g0 g0'] }), /"start" \(0, 0\) is not on a tile/],
    ['exit on water', base({ tiles: ['g0 g0 g0', 'g0 ~0 g0'] }), /"exit" .* water/],
    ['start and exit on the same tile', base({ exit: [0, 0] }), /must be different/],
    ['a negative quota', base({ quota: -1 }), /"quota"/],
  ];

  for (const [what, raw, pattern] of bad) {
    it(`rejects ${what}`, () => {
      const errors = errorsFor(raw);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join('\n')).toMatch(pattern);
    });
  }

  it('reports every problem at once, not just the first', () => {
    expect(errorsFor(base({ format: 3, quota: -1, start: [9, 9] })).length).toBeGreaterThanOrEqual(3);
  });
});
