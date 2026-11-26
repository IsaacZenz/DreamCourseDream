/**
 * Organic wall textures (owner, 2026-11-26). Plain TypeScript with no Phaser,
 * so it runs in Node and has tests. The scene code (wallAtlas.ts) feeds it
 * pixels and turns its output into Phaser frames.
 *
 * The geometry does not change. A face is still drawn as the same bands, at
 * the same places and depths, with the same masks (faceShapes.ts). Only what
 * is painted inside each band changes: instead of one small sprite repeated
 * for every band, each band shows its own slice of a tall texture, so a rock
 * can run across several bands with no seam.
 *
 * Texture space. A wall texture is a 16-pixel-wide strip, as tall as the
 * artist likes, drawn the way it looks on screen (sheared like the face) and
 * repeating top to bottom. Its row 0 lines up with the face frame's row 0
 * when the band is the top band of its edge; a band d steps further down
 * reads the rows 4·d further down. Each edge also starts the texture at its
 * own row (a "shift" picked from the seed), so neighbouring walls do not line
 * up. Rows wrap round, so the texture must join top to bottom.
 *
 * Layers, painted in this order inside the band's mask:
 *   1. soil      (opaque)        always
 *   2. rocks     (see-through)   one of several, or none ("plain soil")
 *   3. details   (see-through)   roots, moss... or none
 *   4. overhang  (see-through)   grass hanging over the top edge, top rows only
 *
 * The overhang is drawn relative to the edge's top line instead: its row 0 is
 * the first wall pixel under the grass in every column, so it follows slopes
 * and never repeats down the wall.
 */
import type { WallStyle } from '../content/walls.ts';
import { FACE_H, FACE_W, faceMask, maskTopRows, type FaceFrameName, type FaceSide } from './faceShapes.ts';

/** RGBA pixels, row by row (the same layout as ImageData). */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array | Uint8ClampedArray;
}

/** What one edge shows: picked once per edge from the seed. */
export interface WallLook {
  readonly soil: string;
  readonly rocks: string | null;
  readonly detail: string | null;
  readonly overhang: string | null;
  /** Where each layer's texture starts, in rows (taken modulo the texture's height). */
  readonly soilShift: number;
  readonly rockShift: number;
  readonly detailShift: number;
}

/** One band of one edge (from the draw list). */
export interface WallBand {
  readonly side: FaceSide;
  readonly frame: FaceFrameName;
  /** Rows between this band's anchor and the edge's top anchor: 4 per height step. */
  readonly depth: number;
  /** The frame of the edge's top band (a cap on a sloping edge, else "full"). */
  readonly topFrame: FaceFrameName;
}

// ---------------------------------------------------------------------------
// Picking a look

/** A stable number for a seed text (FNV-1a). */
export function seedNumber(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A number in [0, 1) from the seed, the edge's tile, its side and a salt. Same inputs, same number. */
export function edgeRandom(seed: number, x: number, y: number, side: FaceSide, salt: number): number {
  let h = (seed ^ Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7919, 668265263) ^ Math.imul(side === 'left' ? 1 : 2, 2246822519) ^ Math.imul(salt + 1, 3266489917)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Pick from a weighted list with r in [0, 1). */
export function pickWeighted<T extends { readonly weight: number }>(list: readonly T[], r: number): T {
  const total = list.reduce((a, v) => a + v.weight, 0);
  let left = r * total;
  for (const v of list) {
    left -= v.weight;
    if (left < 0) return v;
  }
  return list[list.length - 1]!;
}

/** The look of one edge. Depends only on the seed, the edge's tile and its side. */
export function pickWallLook(style: WallStyle, seed: number, x: number, y: number, side: FaceSide): WallLook {
  const r = (salt: number) => edgeRandom(seed, x, y, side, salt);
  const soil = pickWeighted(style.soil, r(1)).sprite;
  if (!soil) throw new Error('Every wall soil entry needs a sprite.');
  return {
    soil,
    rocks: style.rocks.length ? pickWeighted(style.rocks, r(2)).sprite : null,
    detail: style.details.length ? pickWeighted(style.details, r(3)).sprite : null,
    overhang: style.overhang,
    soilShift: Math.floor(r(4) * 256),
    rockShift: Math.floor(r(5) * 256),
    detailShift: Math.floor(r(6) * 256),
  };
}

// ---------------------------------------------------------------------------
// Painting a band

/** The textures for one look, already resolved for the side and theme. */
export interface WallLayers {
  readonly soil: Pixels;
  readonly rocks: Pixels | null;
  readonly detail: Pixels | null;
  readonly overhang: Pixels | null;
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Paint `src` pixel (sx, sy) over out[i] (straight alpha, "over"). */
function over(out: Uint8ClampedArray, i: number, src: Pixels, sx: number, sy: number): void {
  const j = (sy * src.width + sx) * 4;
  const a = src.data[j + 3]! / 255;
  if (a <= 0) return;
  if (a >= 1 || out[i + 3] === 0) {
    out[i] = src.data[j]!;
    out[i + 1] = src.data[j + 1]!;
    out[i + 2] = src.data[j + 2]!;
    out[i + 3] = Math.max(out[i + 3]!, src.data[j + 3]!);
    return;
  }
  for (let c = 0; c < 3; c++) out[i + c] = Math.round(src.data[j + c]! * a + out[i + c]! * (1 - a));
}

const edgeTops = new Map<string, Int16Array>();

/**
 * The first wall row in each column of an edge, in edge rows (0 = the top
 * band's anchor row). Where a sloping cap is empty in a column, the wall there
 * starts at the band under it: a full band 4 rows down (8 under a steep cap).
 */
export function edgeTopRows(side: FaceSide, topFrame: FaceFrameName): Int16Array {
  const key = `${side}:${topFrame}`;
  let out = edgeTops.get(key);
  if (!out) {
    const cap = maskTopRows(side, topFrame);
    const below = maskTopRows(side, 'full');
    const under = topFrame === 'full' ? 4 : topFrame.endsWith('2') ? 8 : 4;
    out = new Int16Array(FACE_W);
    for (let x = 0; x < FACE_W; x++) out[x] = Math.min(cap[x]!, below[x]! + under);
    edgeTops.set(key, out);
  }
  return out;
}

/** Last row (exclusive) that the overhang can reach, in edge rows, for an edge with this top frame. */
export function overhangReach(side: FaceSide, topFrame: FaceFrameName, overhangHeight: number): number {
  const top = edgeTopRows(side, topFrame);
  let max = 0;
  for (const v of top) if (v < FACE_H) max = Math.max(max, v);
  return max + overhangHeight;
}

/**
 * The 16x16 RGBA picture for one band. Only pixels inside the band's mask are
 * painted, so the band fits its neighbours exactly as the old sprites did.
 */
export function composeBand(band: WallBand, look: WallLook, layers: WallLayers): Uint8ClampedArray {
  const out = new Uint8ClampedArray(FACE_W * FACE_H * 4);
  const mask = faceMask(band.side, band.frame);
  const top = layers.overhang ? edgeTopRows(band.side, band.topFrame) : null;
  for (let y = 0; y < FACE_H; y++) {
    const row = y + band.depth;
    for (let x = 0; x < FACE_W; x++) {
      if (!mask[y * FACE_W + x]) continue;
      const i = (y * FACE_W + x) * 4;
      const s = layers.soil;
      over(out, i, s, x % s.width, mod(row + look.soilShift, s.height));
      if (layers.rocks) over(out, i, layers.rocks, x % layers.rocks.width, mod(row + look.rockShift, layers.rocks.height));
      if (layers.detail) over(out, i, layers.detail, x % layers.detail.width, mod(row + look.detailShift, layers.detail.height));
      if (layers.overhang && top) {
        const d = row - top[x]!;
        if (d >= 0 && d < layers.overhang.height) over(out, i, layers.overhang, x % layers.overhang.width, d);
      }
    }
  }
  return out;
}

/**
 * A name for what composeBand would paint, so identical bands share one
 * frame. Two bands with the same key are pixel-for-pixel the same.
 */
export function bandKey(band: WallBand, look: WallLook, heights: { soil: number; rocks: number; detail: number; overhang: number }): string {
  const parts = [band.side, band.frame, `${look.soil}:${mod(band.depth + look.soilShift, heights.soil)}`];
  parts.push(look.rocks ? `${look.rocks}:${mod(band.depth + look.rockShift, heights.rocks)}` : '-');
  parts.push(look.detail ? `${look.detail}:${mod(band.depth + look.detailShift, heights.detail)}` : '-');
  const reach = look.overhang && heights.overhang > 0 ? overhangReach(band.side, band.topFrame, heights.overhang) : 0;
  parts.push(look.overhang && band.depth < reach ? `${look.overhang}:${band.topFrame}:${band.depth}` : '-');
  return parts.join('|');
}
