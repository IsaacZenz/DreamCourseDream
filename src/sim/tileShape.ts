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

/**
 * Ground height at a point inside a tile, using the same two triangles the art
 * is drawn with. u and v run from 0 to 1 across the tile (u along grid x, v
 * along grid y).
 */
export function heightAt(c: Corners, shape: ShapeId, u: number, v: number): number {
  for (const tri of triangles(shape)) {
    const [a, b, d] = tri.map((i) => CORNER_UV[i]!) as [readonly [number, number], readonly [number, number], readonly [number, number]];
    const det = (b[1] - d[1]) * (a[0] - d[0]) + (d[0] - b[0]) * (a[1] - d[1]);
    const wa = ((b[1] - d[1]) * (u - d[0]) + (d[0] - b[0]) * (v - d[1])) / det;
    const wb = ((d[1] - a[1]) * (u - d[0]) + (a[0] - d[0]) * (v - d[1])) / det;
    const wd = 1 - wa - wb;
    const eps = 1e-9;
    if (wa >= -eps && wb >= -eps && wd >= -eps) {
      return wa * c[tri[0]]! + wb * c[tri[1]]! + wd * c[tri[2]]!;
    }
  }
  // Outside the tile: clamp into it.
  return heightAt(c, shape, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, v)));
}
