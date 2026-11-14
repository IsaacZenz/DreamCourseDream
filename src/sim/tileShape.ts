/**
 * Tile geometry. A tile is a square on the course grid with a height at each
 * of its four corners (DESIGN.md section 4). Corners are listed clockwise
 * starting from the top of the diamond as it appears on screen:
 *
 *            nw
 *          /    \
 *        sw      ne        grid x grows towards the bottom-right (ne → se),
 *          \    /          grid y grows towards the bottom-left (nw → sw).
 *            se
 *
 * One height step is one whole number. Within a tile the corners may differ by
 * at most one step, and opposite corners may not both be raised (a "saddle"),
 * which leaves exactly 13 shapes: flat, 4 straight slopes, 4 single raised
 * corners and 4 single lowered corners. The renderer, the placeholder art
 * script and (from Milestone 2) the physics all use these same shapes.
 */

export type Corners = readonly [nw: number, ne: number, se: number, sw: number];

/** Corner heights relative to the lowest corner, written as four digits, e.g. "1100". */
export type ShapeId = string;

export const SHAPES: readonly ShapeId[] = [
  '0000',
  // straight slopes, named by which on-screen edge of the diamond is high
  '1100', // upper-right edge high (nw + ne)
  '0110', // lower-right edge high (ne + se)
  '0011', // lower-left edge high (se + sw)
  '1001', // upper-left edge high (sw + nw)
  // one corner raised
  '1000',
  '0100',
  '0010',
  '0001',
  // one corner lowered
  '0111',
  '1011',
  '1101',
  '1110',
];

const SHAPE_SET = new Set(SHAPES);

export function minCorner(c: Corners): number {
  return Math.min(c[0], c[1], c[2], c[3]);
}

/** The shape of a tile, or null if the corners do not form an allowed shape. */
export function shapeOf(c: Corners): ShapeId | null {
  const base = minCorner(c);
  const id = c.map((h) => h - base).join('');
  return SHAPE_SET.has(id) ? id : null;
}

/**
 * How a tile's top surface is split into two flat triangles. Shapes with one
 * odd corner (raised or lowered) are split along the diagonal that does not
 * touch the odd corner, so one triangle is flat and the other slopes. Flat
 * tiles and straight slopes are planar, so either split gives the same surface;
 * we use the same nw–se rule for them.
 *
 * Returns corner indices (0 = nw, 1 = ne, 2 = se, 3 = sw).
 */
export function triangles(shape: ShapeId): readonly [readonly [number, number, number], readonly [number, number, number]] {
  const r = [...shape].map(Number);
  const sum = r.reduce((a, b) => a + b, 0);
  const oddCorner = sum === 1 ? r.indexOf(1) : sum === 3 ? r.indexOf(0) : -1;
  if (oddCorner === 0 || oddCorner === 2) {
    // Odd corner is nw or se: split along ne–sw.
    return [
      [0, 1, 3],
      [1, 2, 3],
    ];
  }
  // Odd corner is ne or sw, or the tile is planar: split along nw–se.
  return [
    [0, 1, 2],
    [0, 2, 3],
  ];
}

/** Corner positions inside a tile, as (u, v): u runs nw → ne, v runs nw → sw. */
const CORNER_UV: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];

/** The flat plane of one triangle: height = h0 + dhdu * u + dhdv * v. */
export interface Plane {
  readonly h0: number;
  readonly dhdu: number;
  readonly dhdv: number;
}

function planeOf(c: Corners, tri: readonly [number, number, number]): Plane {
  // Every triangle has a right angle at one corner, so the plane can be read off directly.
  const pts = tri.map((i) => ({ uv: CORNER_UV[i]!, h: c[i]! }));
  // Find the right-angle corner: the one sharing u with one point and v with the other.
  for (const p of pts) {
    const others = pts.filter((q) => q !== p);
    const du = others.find((q) => q.uv[1] === p.uv[1]);
    const dv = others.find((q) => q.uv[0] === p.uv[0]);
    if (du && dv) {
      const dhdu = (du.h - p.h) / (du.uv[0] - p.uv[0]);
      const dhdv = (dv.h - p.h) / (dv.uv[1] - p.uv[1]);
      return { h0: p.h - dhdu * p.uv[0] - dhdv * p.uv[1], dhdu, dhdv };
    }
  }
  throw new Error('triangle has no right angle');
}

/**
 * The plane of the ground at a point inside a tile, using the same two
 * triangles the art is drawn with. u and v run from 0 to 1 across the tile
 * (u along grid x, v along grid y); points outside are clamped into the tile.
 * Heights and slopes are in steps (per tile).
 */
export function planeAt(c: Corners, shape: ShapeId, u: number, v: number): Plane {
  u = Math.min(1, Math.max(0, u));
  v = Math.min(1, Math.max(0, v));
  const [a, b] = triangles(shape);
  // The split diagonal is either nw–se (u = v) or ne–sw (u + v = 1).
  const splitNwSe = a.includes(0) && a.includes(2);
  const inFirst = splitNwSe ? u >= v : u + v <= 1;
  return planeOf(c, inFirst ? a : b);
}

/** Ground height at a point inside a tile, in steps. See planeAt. */
export function heightAt(c: Corners, shape: ShapeId, u: number, v: number): number {
  const p = planeAt(c, shape, u, v);
  u = Math.min(1, Math.max(0, u));
  v = Math.min(1, Math.max(0, v));
  return p.h0 + p.dhdu * u + p.dhdv * v;
}
