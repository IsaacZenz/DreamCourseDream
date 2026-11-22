/**
 * Isometric projection and draw list. Pure functions with no Phaser, so the
 * draw order can be unit tested.
 *
 * Screen position of a grid point (gx, gy) at height h (in steps):
 *   screenX = (gx - gy) * 16
 *   screenY = (gx + gy) * 8 - h * 4
 * Tiles are 32x16 diamonds; one height step is 4 pixels (DESIGN.md section 4;
 * halved from 8 by the owner, 2026-11-15).
 *
 * Draw order: tiles are drawn back to front by diagonal (x + y). Within a
 * tile: its vertical faces, then its top, then anything sitting on it. Faces
 * are only drawn on a tile's two front edges (lower-left and lower-right on
 * screen); the back edges can never be seen.
 */
import { tileAt, type Course, type Tile } from '../sim/course.ts';
import { heightAt } from '../sim/tileShape.ts';
import { ARROW_SPRITE, SURFACES } from '../content/surfaces.ts';
import { GROUND_BUMPS } from '../content/scenery.ts';

export const HALF_W = 16;
export const HALF_H = 8;
export const STEP_PX = 4;
/** Faces at the outside of the course, or next to an empty spot, go down to this height. */
export const FLOOR_HEIGHT = -2;

export interface ScreenPoint {
  x: number;
  y: number;
}

export function project(gx: number, gy: number, h: number): ScreenPoint {
  return { x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H - h * STEP_PX };
}

/** One sprite to draw: world position is where the sprite's anchor goes. */
export interface Placement {
  sprite: string;
  frame: string;
  x: number;
  y: number;
  depth: number;
  /** What this is, for tests and debugging. */
  kind: 'face' | 'top' | 'arrow' | 'exit' | 'shadow' | 'ball' | 'overlay';
  tile: { x: number; y: number };
}

/** Depth slots inside one tile. Each diagonal gets DEPTH_PER_DIAGONAL units. */
const LAYER = { face: 0, top: 1, arrow: 2, exit: 3, shadow: 4, ball: 5, overlay: 6 } as const;
export const DEPTH_PER_DIAGONAL = 10;

export function tileDepth(x: number, y: number, layer: keyof typeof LAYER): number {
  return (x + y) * DEPTH_PER_DIAGONAL + LAYER[layer];
}

/**
 * The faces under one front edge of a tile.
 * a, b: the tile's corner heights at the two ends of the edge.
 * na, nb: the neighbour's heights at the same two points (or FLOOR_HEIGHT).
 * Returns the bands to draw: each is the height k of the band's bottom and
 * which frame to use. The neighbour is drawn later and covers anything below
 * its own surface, so bands only need to start from the neighbour's lower end.
 */
export type FaceFrame = 'full' | 'capA' | 'capB' | 'capA2' | 'capB2';

/** A face band from height k up `size` steps (2 only for the cap above a steep edge). */
export interface FaceBand {
  k: number;
  size: number;
  frame: FaceFrame;
}

export function faceBands(a: number, b: number, na: number, nb: number): FaceBand[] {
  if (a <= na && b <= nb) return [];
  const bottom = Math.min(na, nb);
  const top = Math.min(a, b);
  const bands: FaceBand[] = [];
  for (let k = bottom; k < top; k++) bands.push({ k, size: 1, frame: 'full' });
  const d = Math.abs(a - b);
  if (d === 1) bands.push({ k: top, size: 1, frame: a > b ? 'capA' : 'capB' });
  else if (d === 2) bands.push({ k: top, size: 2, frame: a > b ? 'capA2' : 'capB2' });
  return bands;
}

/** A tile away from the bank: all eight neighbours have the same surface. */
function isDeep(course: Course, t: Tile): boolean {
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      if (tileAt(course, t.x + dx, t.y + dy)?.surface !== t.surface) return false;
    }
  }
  return true;
}

function surfaceOf(tile: Tile) {
  const def = SURFACES.get(tile.surface);
  if (!def) throw new Error(`Unknown surface ${tile.surface}`);
  return def;
}

/** Height of the ground at the centre of a tile. */
export function tileCentreHeight(tile: Tile): number {
  return heightAt(tile.corners, tile.shape, 0.5, 0.5);
}

export interface DrawOptions {
  /** Where to draw the ball, in grid coordinates (tile centre is x + 0.5). */
  ball?: { gx: number; gy: number };
  exitOpen?: boolean;
}

export function buildDrawList(course: Course, opts: DrawOptions = {}): Placement[] {
  const out: Placement[] = [];
  for (let y = 0; y < course.height; y++) {
    for (let x = 0; x < course.width; x++) {
      const t = tileAt(course, x, y);
      if (!t) continue;
      const def = surfaceOf(t);
      const [, ne, se, sw] = t.corners;
      const tile = { x, y };

      // Lower-left face: edge sw → se, neighbour below-left is (x, y + 1) whose nw, ne match.
      const left = tileAt(course, x, y + 1);
      for (const band of faceBands(sw, se, left?.corners[0] ?? FLOOR_HEIGHT, left?.corners[1] ?? FLOOR_HEIGHT)) {
        const p = project(x, y + 1, band.k + band.size);
        out.push({ sprite: `${def.faceSprite}-left`, frame: band.frame, ...p, depth: tileDepth(x, y, 'face'), kind: 'face', tile });
      }
      // Lower-right face: edge se → ne, neighbour below-right is (x + 1, y) whose sw, nw match.
      const right = tileAt(course, x + 1, y);
      for (const band of faceBands(se, ne, right?.corners[3] ?? FLOOR_HEIGHT, right?.corners[0] ?? FLOOR_HEIGHT)) {
        const p = project(x + 1, y + 1, band.k + band.size);
        out.push({ sprite: `${def.faceSprite}-right`, frame: band.frame, ...p, depth: tileDepth(x, y, 'face'), kind: 'face', tile });
      }

      const centre = project(x + 0.5, y + 0.5, t.base);
      // Checkerboard (owner, 2026-11-15): every other tile uses the second shade.
      const checker = def.checker && (x + y) % 2 === 1 ? 'b' : '';
      out.push({ sprite: def.tileSprite, frame: t.shape + checker, ...centre, depth: tileDepth(x, y, 'top'), kind: 'top', tile });
      if (t.dir) out.push({ sprite: ARROW_SPRITE, frame: t.dir, ...centre, depth: tileDepth(x, y, 'arrow'), kind: 'arrow', tile });
      // A see-through layer over the ball, so a ball in water shows through it.
      if (def.overlaySprite) {
        const deep = def.deepOverlaySprite && isDeep(course, t) ? def.deepOverlaySprite : def.overlaySprite;
        out.push({ sprite: deep, frame: t.shape, ...centre, depth: tileDepth(x, y, 'overlay'), kind: 'overlay', tile });
      }
      // Shore foam where water meets other ground.
      if (def.shoreSprite) {
        for (const [dir, nx, ny] of [['ne', x, y - 1], ['se', x + 1, y], ['sw', x, y + 1], ['nw', x - 1, y]] as const) {
          const n = tileAt(course, nx, ny);
          if (n && n.surface !== t.surface) out.push({ sprite: def.shoreSprite, frame: dir, ...centre, depth: tileDepth(x, y, 'overlay') + 0.5, kind: 'overlay', tile });
        }
      }
    }
  }

  const exitTile = tileAt(course, course.exit.x, course.exit.y);
  if (exitTile) {
    const p = project(course.exit.x + 0.5, course.exit.y + 0.5, tileCentreHeight(exitTile));
    out.push({ sprite: 'exit', frame: opts.exitOpen ? 'open' : 'closed', ...p, depth: tileDepth(course.exit.x, course.exit.y, 'exit'), kind: 'exit', tile: course.exit });
  }

  if (opts.ball) {
    const tx = Math.floor(opts.ball.gx);
    const ty = Math.floor(opts.ball.gy);
    const t = tileAt(course, tx, ty);
    if (t) {
      const h = heightAt(t.corners, t.shape, opts.ball.gx - tx, opts.ball.gy - ty);
      const p = project(opts.ball.gx, opts.ball.gy, h);
      out.push({ sprite: 'ball-shadow', frame: 'idle', ...p, depth: tileDepth(tx, ty, 'shadow'), kind: 'shadow', tile: { x: tx, y: ty } });
      out.push({ sprite: 'ball', frame: 'idle', ...p, depth: tileDepth(tx, ty, 'ball'), kind: 'ball', tile: { x: tx, y: ty } });
    }
  }
  return out;
}

/** Screen-space bounds of everything in a draw list, for the camera. */
export function courseBounds(course: Course): { left: number; top: number; right: number; bottom: number } {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const t of course.tiles) {
    if (!t) continue;
    for (const [gx, gy, i] of [
      [t.x, t.y, 0],
      [t.x + 1, t.y, 1],
      [t.x + 1, t.y + 1, 2],
      [t.x, t.y + 1, 3],
    ] as const) {
      const hi = project(gx, gy, t.corners[i]);
      const lo = project(gx, gy, FLOOR_HEIGHT);
      left = Math.min(left, hi.x);
      right = Math.max(right, hi.x);
      top = Math.min(top, hi.y);
      bottom = Math.max(bottom, lo.y);
    }
  }
  return { left, top, right, bottom };
}

function pointInPoly(px: number, py: number, pts: readonly ScreenPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!;
    const b = pts[j]!;
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The tile whose top is visible at a screen point (front-most wins), or null. */
export function pickTile(course: Course, sx: number, sy: number): Tile | null {
  for (let d = course.width + course.height - 2; d >= 0; d--) {
    for (let x = Math.min(d, course.width - 1); x >= 0 && d - x < course.height; x--) {
      const t = tileAt(course, x, d - x);
      if (!t) continue;
      const [nw, ne, se, sw] = t.corners;
      const poly = [project(t.x, t.y, nw), project(t.x + 1, t.y, ne), project(t.x + 1, t.y + 1, se), project(t.x, t.y + 1, sw)];
      if (pointInPoly(sx, sy, poly)) return t;
    }
  }
  return null;
}

/**
 * Ground bumps (owner, 2026-11-21): how many pixels to draw a tile's top
 * raised, for looks only. Flat grass, rough and sand tiles only; the same
 * tile always gets the same lift. Never changes where anything is in the game.
 */
export function groundBump(tile: Tile): number {
  if (tile.shape !== '0000' || !GROUND_BUMPS.surfaces.includes(tile.surface)) return 0;
  let h = (tile.x * 374761393 + tile.y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  let r = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  for (let px = 0; px < GROUND_BUMPS.weights.length; px++) {
    r -= GROUND_BUMPS.weights[px]!;
    if (r < 0) return px;
  }
  return 0;
}

/**
 * The draw depth for a raised (ground bump) tile top: just under anything
 * standing on the row behind it, so its lifted back edge never covers the
 * feet of the ball, the armadillo or an enemy there. Only where the tiles
 * behind are no higher (a real ledge must still hide what is behind it).
 */
export function bumpTopDepth(course: Course, tile: Tile): number {
  const behind = [tileAt(course, tile.x - 1, tile.y), tileAt(course, tile.x, tile.y - 1), tileAt(course, tile.x - 1, tile.y - 1)];
  const flat = behind.every((b) => !b || Math.max(...b.corners) <= tile.base);
  return flat ? tileDepth(tile.x, tile.y, 'top') - DEPTH_PER_DIAGONAL + 1.5 : tileDepth(tile.x, tile.y, 'top');
}
