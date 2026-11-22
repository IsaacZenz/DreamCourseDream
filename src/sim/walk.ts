/**
 * Walking the armadillo around a place (Milestone 8b design sheet section 1).
 * Plain logic with no drawing, so it runs in Node and has tests.
 *
 * - Up on the keyboard is up on the screen: the screen direction is turned
 *   into a direction on the ground, and the armadillo moves at a steady speed
 *   along the ground (WALK.speed tiles a second; Shift runs).
 * - Movement is free, not locked to tiles. It stops at the edge of the place,
 *   at ground it cannot walk on (water, spikes), at steps taller than
 *   WALK.maxStep, at fences (rails), blockers and props. It moves one axis at
 *   a time, so it slides along a wall instead of sticking to it.
 * - Triggers fire once on stepping onto them: to use one again, step off first.
 */
import { OBJECTS, RAIL, type ObjectShape } from '../content/objects.ts';
import { PROPS, WALK, WALKABLE_SURFACES } from '../content/places.ts';
import { tileAt } from './course.ts';
import { inTrigger, type Place, type Trigger } from './place.ts';
import { heightAt } from './tileShape.ts';

/** Which way the armadillo faces on screen. */
export type Facing = 'ul' | 'ur' | 'dl' | 'dr';

export interface Walker {
  x: number;
  y: number;
  facing: Facing;
  moving: boolean;
  /** Seconds spent walking, for the step frames. */
  walkTime: number;
  /** Triggers the armadillo is standing in now (by index into `activeTriggers`). */
  inside: Set<Trigger>;
}

/** Keys held, as a screen direction: sx -1 left, +1 right; sy -1 up, +1 down. */
export interface WalkInput {
  readonly sx: number;
  readonly sy: number;
  readonly run: boolean;
}

/** One solid thing in the way, in grid coordinates. */
interface Solid {
  readonly x: number;
  readonly y: number;
  readonly shape: ObjectShape;
}

/** Everything solid in a place, worked out once per place. */
const solidsCache = new WeakMap<Place, Solid[]>();

export function solidsOf(place: Place): Solid[] {
  let out = solidsCache.get(place);
  if (out) return out;
  out = [];
  for (const o of place.ground.objects) {
    const def = OBJECTS.get(o.id);
    const shape = def && 'shape' in def ? def.shape : null;
    if (shape) out.push({ x: o.x + 0.5, y: o.y + 0.5, shape });
  }
  for (const rail of place.ground.rails) {
    for (let i = 1; i < rail.length; i++) {
      const a = rail[i - 1]!;
      const b = rail[i]!;
      out.push({ x: a.x + 0.5, y: a.y + 0.5, shape: { kind: 'seg', ax: 0, ay: 0, bx: b.x - a.x, by: b.y - a.y, r: RAIL.halfThickness + 0.04 } });
    }
  }
  for (const p of place.props) {
    const shape = PROPS.get(p.id)?.footprint;
    if (shape) out.push({ x: p.x, y: p.y, shape });
  }
  solidsCache.set(place, out);
  return out;
}

/** Height of the ground at a point, in height steps, or null off the ground or on ground that cannot be walked. */
export function walkHeight(place: Place, x: number, y: number): number | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const t = tileAt(place.ground, tx, ty);
  if (!t || !WALKABLE_SURFACES.has(t.surface)) return null;
  return heightAt(t.corners, t.shape, x - tx, y - ty);
}

function hits(s: Solid, x: number, y: number, r: number): boolean {
  const dx = x - s.x;
  const dy = y - s.y;
  const sh = s.shape;
  if (sh.kind === 'round') return Math.hypot(dx, dy) < r + sh.r;
  if (sh.kind === 'box') {
    const cx = Math.max(-sh.hx, Math.min(sh.hx, dx));
    const cy = Math.max(-sh.hy, Math.min(sh.hy, dy));
    return Math.hypot(dx - cx, dy - cy) < r;
  }
  const vx = sh.bx - sh.ax;
  const vy = sh.by - sh.ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 ? Math.max(0, Math.min(1, ((dx - sh.ax) * vx + (dy - sh.ay) * vy) / len2)) : 0;
  return Math.hypot(dx - (sh.ax + t * vx), dy - (sh.ay + t * vy)) < r + sh.r;
}

/** Can the armadillo stand at (x, y), coming from ground height `from`? */
export function canStand(place: Place, x: number, y: number, from: number | null = null): boolean {
  const r = WALK.radius;
  const here = walkHeight(place, x, y);
  if (here === null) return false;
  const ref = from ?? here;
  for (const [px, py] of [
    [x, y],
    [x - r, y],
    [x + r, y],
    [x, y - r],
    [x, y + r],
  ] as const) {
    const h = walkHeight(place, px, py);
    if (h === null || Math.abs(h - ref) > WALK.maxStep + 1e-6) return false;
  }
  return !solidsOf(place).some((s) => hits(s, x, y, r));
}

export function createWalker(x: number, y: number, facing: Facing = 'ul', triggers: readonly Trigger[] = []): Walker {
  return { x, y, facing, moving: false, walkTime: 0, inside: new Set(triggers.filter((t) => inTrigger(t, x, y))) };
}

/** Turn a screen direction into a unit direction on the ground (grid x, grid y). */
export function groundDirection(sx: number, sy: number): { gx: number; gy: number } | null {
  // Screen right is grid (+1, -1); screen down is grid (+1, +1).
  const gx = sx + sy;
  const gy = sy - sx;
  const len = Math.hypot(gx, gy);
  return len ? { gx: gx / len, gy: gy / len } : null;
}

/**
 * Move the armadillo for `dt` seconds with the keys held, against the place's
 * ground and solids. Returns the triggers stepped onto during this step, in
 * the order given (each at most once).
 */
export function stepWalker(place: Place, w: Walker, input: WalkInput, dt: number, triggers: readonly Trigger[]): Trigger[] {
  const dir = groundDirection(Math.sign(input.sx), Math.sign(input.sy));
  w.moving = !!dir;
  if (dir) {
    w.walkTime += dt;
    // Facing follows the screen direction; a purely sideways or vertical key keeps the other half.
    const vertical = input.sy < 0 ? 'u' : input.sy > 0 ? 'd' : w.facing[0]!;
    const horizontal = input.sx < 0 ? 'l' : input.sx > 0 ? 'r' : w.facing[1]!;
    w.facing = `${vertical}${horizontal}` as Facing;
    const dist = WALK.speed * (input.run ? WALK.runFactor : 1) * dt;
    const from = walkHeight(place, w.x, w.y);
    // One axis at a time, so it slides along walls. Small sub-steps keep it from skipping past a thin fence.
    const parts = Math.max(1, Math.ceil(dist / 0.05));
    for (let i = 0; i < parts; i++) {
      const nx = w.x + (dir.gx * dist) / parts;
      if (canStand(place, nx, w.y, walkHeight(place, w.x, w.y) ?? from)) w.x = nx;
      const ny = w.y + (dir.gy * dist) / parts;
      if (canStand(place, w.x, ny, walkHeight(place, w.x, w.y) ?? from)) w.y = ny;
    }
  } else w.walkTime = 0;
  const entered: Trigger[] = [];
  const now = new Set(triggers.filter((t) => inTrigger(t, w.x, w.y)));
  for (const t of triggers) if (now.has(t) && !w.inside.has(t)) entered.push(t);
  w.inside = now;
  return entered;
}

/** Put the armadillo somewhere new (after a flat screen closes), facing a way, without firing what it stands in. */
export function placeWalker(w: Walker, x: number, y: number, facing: Facing, triggers: readonly Trigger[]): void {
  w.x = x;
  w.y = y;
  w.facing = facing;
  w.moving = false;
  w.walkTime = 0;
  w.inside = new Set(triggers.filter((t) => inTrigger(t, x, y)));
}

/** Which walking frame to show: "stand", "step1" or "step2". */
export function walkFrame(w: Walker): 'stand' | 'step1' | 'step2' {
  if (!w.moving) return 'stand';
  return Math.floor(w.walkTime / WALK.stepSeconds) % 2 === 0 ? 'step1' : 'step2';
}
