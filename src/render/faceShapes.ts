/**
 * The shapes of the vertical faces (ledge sides), shared by the placeholder
 * art tool and the wall texture system (owner, 2026-11-26). Plain TypeScript
 * with no Phaser, so it runs in Node and has tests.
 *
 * A face is drawn under one front edge of a tile as a stack of bands (see
 * `faceBands` in iso.ts). Each band is a 16x16 frame:
 *
 *   full   a parallelogram one height step (4 px) tall
 *   capA   the triangle above the full bands when the edge's first corner is one step higher
 *   capB   the same when the second corner is one step higher
 *   capA2  / capB2: the same for a two-step (steep) difference
 *
 * Left faces run sw → se (anchor (0, 0) is the sw corner at the band's top);
 * right faces run se → ne (anchor (0, 8) is the se corner at the band's top).
 */

export type FaceSide = 'left' | 'right';
export type FaceFrameName = 'full' | 'capA' | 'capB' | 'capA2' | 'capB2';

type P = readonly [number, number];

/** Pixels per height step (STEP_PX in iso.ts). */
const S = 4;
export const FACE_W = 16;
/** Face frames are tall enough for the two-step cap. */
export const FACE_H = 8 + 2 * S;
export const FACE_FRAMES: readonly FaceFrameName[] = ['full', 'capA', 'capB', 'capA2', 'capB2'];
export const FACE_ANCHOR: Readonly<Record<FaceSide, P>> = { left: [0, 0], right: [0, 8] };

export const LEFT_SHAPES: Readonly<Record<FaceFrameName, readonly P[]>> = {
  full: [
    [0, 0],
    [16, 8],
    [16, 8 + S],
    [0, S],
  ],
  capA: [
    [0, 0],
    [16, 8 + S],
    [0, S],
  ],
  capB: [
    [0, S],
    [16, 8],
    [16, 8 + S],
  ],
  // Above a steep edge (the two corners two steps apart).
  capA2: [
    [0, 0],
    [16, 8 + 2 * S],
    [0, 2 * S],
  ],
  capB2: [
    [0, 2 * S],
    [16, 8],
    [16, 8 + 2 * S],
  ],
};

export const RIGHT_SHAPES: Readonly<Record<FaceFrameName, readonly P[]>> = {
  full: [
    [0, 8],
    [16, 0],
    [16, S],
    [0, 8 + S],
  ],
  capA: [
    [0, 8],
    [16, S],
    [0, 8 + S],
  ],
  capB: [
    [0, 8 + S],
    [16, 0],
    [16, S],
  ],
  capA2: [
    [0, 8],
    [16, 2 * S],
    [0, 8 + 2 * S],
  ],
  capB2: [
    [0, 8 + 2 * S],
    [16, 0],
    [16, 2 * S],
  ],
};

export function faceShape(side: FaceSide, frame: FaceFrameName): readonly P[] {
  return (side === 'left' ? LEFT_SHAPES : RIGHT_SHAPES)[frame];
}

// Sample a little off the pixel centre so that pixels exactly on a shared edge
// always belong to exactly one of the two shapes (the same rule as the tiles).
export const BIAS_X = 0.5013;
export const BIAS_Y = 0.5071;

function insideTri(px: number, py: number, a: P, b: P, c: P): boolean {
  const s = (p: P, q: P) => (q[0] - p[0]) * (py - p[1]) - (q[1] - p[1]) * (px - p[0]);
  const d1 = s(a, b);
  const d2 = s(b, c);
  const d3 = s(c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

export function insidePoly(px: number, py: number, pts: readonly P[]): boolean {
  for (let i = 1; i + 1 < pts.length; i++) if (insideTri(px, py, pts[0]!, pts[i]!, pts[i + 1]!)) return true;
  return false;
}

const masks = new Map<string, Uint8Array>();

/**
 * Which pixels of a 16x16 face frame belong to the band: 1 inside, 0 outside.
 * Exactly the pixels the placeholder face sprites fill.
 */
export function faceMask(side: FaceSide, frame: FaceFrameName): Uint8Array {
  const key = `${side}:${frame}`;
  let m = masks.get(key);
  if (!m) {
    m = new Uint8Array(FACE_W * FACE_H);
    const poly = faceShape(side, frame);
    for (let y = 0; y < FACE_H; y++) for (let x = 0; x < FACE_W; x++) if (insidePoly(x + BIAS_X, y + BIAS_Y, poly)) m[y * FACE_W + x] = 1;
    masks.set(key, m);
  }
  return m;
}

/** The first filled row of a face frame in each column (or FACE_H if the column is empty). */
export function maskTopRows(side: FaceSide, frame: FaceFrameName): Int16Array {
  const m = faceMask(side, frame);
  const out = new Int16Array(FACE_W).fill(FACE_H);
  for (let x = 0; x < FACE_W; x++) {
    for (let y = 0; y < FACE_H; y++) {
      if (m[y * FACE_W + x]) {
        out[x] = y;
        break;
      }
    }
  }
  return out;
}
