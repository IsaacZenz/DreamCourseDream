/**
 * Ball physics (DESIGN.md section 5). Plain TypeScript: no Phaser, no browser,
 * no clock, no randomness. The same course, tuning, shot and inputs always give
 * the same result, step for step.
 *
 * Coordinates: x and y are grid positions in tiles (tile (2, 3) covers
 * x 2..3, y 3..4). z is the height of the bottom of the ball, in tiles
 * (course heights are in steps; STEP_HEIGHT converts). Velocities are in tiles
 * per second. One call to `stepShot` advances 1/120 of a second.
 *
 * Model:
 * - In the air: gravity and a little drag.
 * - On landing: the speed into the ground is bounced back, scaled by the
 *   surface; if too little is left, the ball settles and rolls.
 * - On the ground: gravity pulls it down the slope, the surface's friction
 *   slows it, side spin curves it.
 * - Walls: every wall in this game runs along a grid line, so hitting one just
 *   mirrors the x or y speed.
 * - Rolling off a lower edge makes the ball airborne.
 * - Water and falling off the course end the shot ("sunk" or "out"); the game
 *   puts the ball back where the shot started.
 * - Hazard tiles (Milestone 3) act on a ball touching them: boosters push,
 *   conveyors carry, springs launch, warps move it to their pair. Spikes only
 *   report a "hazard" event; the course rules (play.ts) decide the damage.
 * - Obstacles (blockers and enemies) are passed in as a `ShotWorld`. The ball
 *   bounces off them, or, when the rules say the hit defeated an enemy, carries
 *   on through with a little less speed.
 */
import type { ObjectShape } from '../content/objects.ts';
import { DIRECTION_VECTORS, SURFACES } from '../content/surfaces.ts';
import { STEP_HEIGHT, STEPS_PER_SECOND, surfacePhysics, type Tuning } from '../content/tuning.ts';
import { tileAt, type Course, type Tile } from './course.ts';
import { planeAt } from './tileShape.ts';

export const DT = 1 / STEPS_PER_SECOND;

/** A small allowance so rounding never turns a smooth join into a wall. In tiles. */
const WALL_TOLERANCE = 0.02;

export type ShotType = 'ground' | 'lofted';

export interface ShotCommand {
  /** Direction on the grid, in radians. 0 points along +x (towards the lower right on screen). */
  readonly angle: number;
  /** 0 to 1. */
  readonly power: number;
  readonly type: ShotType;
  /** -1 (full backspin) to 1 (full topspin). */
  readonly topSpin: number;
  /** -1 (curve left) to 1 (curve right), as seen travelling along the shot. */
  readonly sideSpin: number;
  /** Released at the very top of the meter: the shot gets the perfect bonus. */
  readonly perfect?: boolean;
}

/** What the player does during one step of a shot. */
export interface StepInput {
  /** The bounce boost key was pressed this step. */
  readonly boost?: boolean;
}

export type ShotEvent =
  | { kind: 'bounce'; step: number; surface: string; boosted: boolean }
  | { kind: 'land'; step: number; surface: string }
  | { kind: 'wall'; step: number; surface: string }
  | { kind: 'airborne'; step: number }
  | { kind: 'sunk'; step: number }
  | { kind: 'out'; step: number }
  | { kind: 'rest'; step: number }
  | { kind: 'hazard'; step: number; surface: string; x: number; y: number }
  | { kind: 'spring'; step: number }
  | { kind: 'warp'; step: number; from: GridTile; to: GridTile }
  | { kind: 'contact'; step: number; obstacle: string; result: ContactResult }
  | { kind: 'exit'; step: number };

export type ShotOutcome = 'rest' | 'sunk' | 'out' | 'timeout' | 'exit';

interface GridTile {
  readonly x: number;
  readonly y: number;
}

/** What happens when the ball touches an obstacle: it bounces off, or carries on through (a defeated enemy). */
export type ContactResult = 'bounce' | 'pass';

/** Something solid standing on the course: a blocker or an enemy. */
export interface Obstacle {
  readonly id: string;
  /** Centre, in grid coordinates. */
  readonly x: number;
  readonly y: number;
  /** Height of its bottom and its height, in tiles. */
  readonly base: number;
  readonly height: number;
  readonly shape: ObjectShape;
  /** Fraction of speed kept when the ball bounces off it. */
  readonly bounce: number;
}

/**
 * The things on the course the shot can run into. The course rules own it and
 * may change `obstacles` between steps (a defeated enemy is removed).
 * `contact` is asked each time the ball touches one; it decides bounce or pass.
 * Without it every contact is a bounce.
 */
export interface ShotWorld {
  obstacles: readonly Obstacle[];
  contact?: (o: Obstacle, s: ShotState) => ContactResult;
}

/** Stat-driven changes to a shot (FEATURES.md section 1): shot power and bounce boost. */
export interface ShotScales {
  /** Multiplies the launch speed. 1 is normal. */
  readonly power?: number;
  /** Multiplies the bounce boost's strength. 1 is normal. */
  readonly boost?: number;
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  /** Vertical speed. Only used in the air; on the ground the slope decides it. */
  vz: number;
  grounded: boolean;
}

export interface ShotState {
  readonly cmd: ShotCommand;
  ball: BallState;
  step: number;
  /** Unit direction of the shot on the grid. */
  readonly dirX: number;
  readonly dirY: number;
  hasLanded: boolean;
  restSteps: number;
  /** Steps left in which a landing gets boosted. 0 when no boost is armed. */
  boostArmed: number;
  /** One boost press per flight. Cleared on each landing. */
  boostSpent: boolean;
  /** Set once the shot is over. */
  outcome: ShotOutcome | null;
  events: ShotEvent[];
  readonly boostScale: number;
  /** After a warp: the tile the ball arrived on. It must leave before warps work again. */
  warpLock: string | null;
  /** The last hazard tile the ball touched, so each touch is reported once. */
  hazardTouch: string | null;
}

/** Where the ground is under a point, or null if the point is off the course. */
export interface Ground {
  readonly tile: Tile;
  /** Height in tiles. */
  readonly h: number;
  /** Slope: change in height (tiles) per tile moved along x and along y. */
  readonly sx: number;
  readonly sy: number;
}

export function groundAt(course: Course, x: number, y: number): Ground | null {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tile = tileAt(course, tx, ty);
  if (!tile) return null;
  const u = x - tx;
  const v = y - ty;
  const p = planeAt(tile.corners, tile.shape, u, v);
  return { tile, h: (p.h0 + p.dhdu * u + p.dhdv * v) * STEP_HEIGHT, sx: p.dhdu * STEP_HEIGHT, sy: p.dhdv * STEP_HEIGHT };
}

/** Ground height (tiles) of a tile at a point, clamped into that tile. Null if there is no tile. */
function edgeHeight(course: Course, tx: number, ty: number, x: number, y: number): { h: number; tile: Tile } | null {
  const tile = tileAt(course, tx, ty);
  if (!tile) return null;
  const u = x - tx;
  const v = y - ty;
  const p = planeAt(tile.corners, tile.shape, u, v);
  const cu = Math.min(1, Math.max(0, u));
  const cv = Math.min(1, Math.max(0, v));
  return { h: (p.h0 + p.dhdu * cu + p.dhdv * cv) * STEP_HEIGHT, tile };
}

/** A ball sitting still at the centre of a tile. */
export function ballAtTile(course: Course, tx: number, ty: number): BallState {
  const x = tx + 0.5;
  const y = ty + 0.5;
  const g = groundAt(course, x, y);
  return { x, y, z: g?.h ?? 0, vx: 0, vy: 0, vz: 0, grounded: true };
}

export function startShot(tuning: Tuning, from: BallState, cmd: ShotCommand, scales: ShotScales = {}): ShotState {
  const power = Math.min(1, Math.max(tuning.minPower, cmd.power));
  const bonus = (cmd.perfect ? tuning.perfectBonus : 1) * (scales.power ?? 1);
  const dirX = Math.cos(cmd.angle);
  const dirY = Math.sin(cmd.angle);
  const ball: BallState = { ...from, vx: 0, vy: 0, vz: 0 };
  if (cmd.type === 'ground') {
    const speed = power * bonus * tuning.groundMaxSpeed;
    ball.vx = dirX * speed;
    ball.vy = dirY * speed;
    ball.grounded = true;
  } else {
    const speed = power * bonus * tuning.loftMaxSpeed;
    const a = (tuning.loftAngle * Math.PI) / 180;
    ball.vx = dirX * speed * Math.cos(a);
    ball.vy = dirY * speed * Math.cos(a);
    ball.vz = speed * Math.sin(a);
    ball.grounded = false;
  }
  return {
    cmd: { ...cmd, power },
    ball,
    step: 0,
    dirX,
    dirY,
    hasLanded: cmd.type === 'ground',
    restSteps: 0,
    boostArmed: 0,
    boostSpent: false,
    outcome: null,
    events: [],
    boostScale: scales.boost ?? 1,
    warpLock: null,
    hazardTouch: null,
  };
}

/** Advance the shot by one step (1/120 s). Does nothing once the shot is over. */
export function stepShot(course: Course, tuning: Tuning, s: ShotState, input: StepInput = {}, world?: ShotWorld): void {
  if (s.outcome) return;
  const b = s.ball;
  const zBefore = b.z;
  const eventsBefore = s.events.length;
  const t = s.step * DT;
  s.step++;

  // Bounce boost: one press per flight, counts for a short window.
  if (s.boostArmed > 0) s.boostArmed--;
  if (input.boost && !b.grounded && !s.boostSpent) {
    s.boostSpent = true;
    s.boostArmed = Math.max(1, Math.round(tuning.boostWindow * STEPS_PER_SECOND));
  }

  // Side curve: turn the horizontal velocity a little, fading over time.
  if (s.cmd.sideSpin !== 0) {
    const turn = ((s.cmd.sideSpin * tuning.curveRate * Math.PI) / 180) * Math.exp(-tuning.curveFade * t) * DT;
    const c = Math.cos(turn);
    const sn = Math.sin(turn);
    const vx = b.vx * c - b.vy * sn;
    b.vy = b.vx * sn + b.vy * c;
    b.vx = vx;
  }

  const drag = Math.max(0, 1 - tuning.drag * DT);

  if (b.grounded) {
    const g = groundAt(course, b.x, b.y);
    if (!g) {
      b.grounded = false;
    } else {
      const phys = surfacePhysics(tuning, g.tile.surface);
      // Gravity along the slope.
      const k = 1 + g.sx * g.sx + g.sy * g.sy;
      b.vx += (-tuning.gravity * g.sx * DT) / k;
      b.vy += (-tuning.gravity * g.sy * DT) / k;
      // Ground-shot spin: a push forward (topspin) or back (backspin) while it lasts.
      if (s.cmd.type === 'ground' && t < tuning.spinRollTime && s.cmd.topSpin !== 0) {
        b.vx += s.dirX * s.cmd.topSpin * tuning.spinRollAccel * DT;
        b.vy += s.dirY * s.cmd.topSpin * tuning.spinRollAccel * DT;
      }
      // Arrow tiles: boosters push hard, conveyors carry.
      tileForce(tuning, g.tile, b);
      // Friction and drag, plus the surface's own drag (water).
      const surfaceDrag = Math.max(0, 1 - phys.drag * DT);
      b.vx *= drag * surfaceDrag;
      b.vy *= drag * surfaceDrag;
      const speed = Math.hypot(b.vx, b.vy);
      const loss = (phys.friction * tuning.gravity * DT) / Math.sqrt(k);
      if (speed <= loss) {
        b.vx = 0;
        b.vy = 0;
      } else {
        b.vx *= (speed - loss) / speed;
        b.vy *= (speed - loss) / speed;
      }
    }
  }
  if (!b.grounded) {
    b.vz -= tuning.gravity * DT;
    b.vx *= drag;
    b.vy *= drag;
    b.vz *= drag;
  }

  // Slope under the ball before moving, to know how a grounded ball should rise or fall.
  const before = groundAt(course, b.x, b.y);
  const slopeVz = b.grounded && before ? before.sx * b.vx + before.sy * b.vy : 0;

  moveAxis(course, tuning, s, 'x', b.vx * DT);
  moveAxis(course, tuning, s, 'y', b.vy * DT);
  if (world) collideObstacles(tuning, s, world, zBefore);

  const g = groundAt(course, b.x, b.y);
  if (b.grounded) {
    const expected = b.z + slopeVz * DT;
    if (!g || g.h < expected - 0.01) {
      // Rolled off an edge: carry on through the air.
      b.grounded = false;
      b.vz = slopeVz;
      b.z = expected;
      s.events.push({ kind: 'airborne', step: s.step });
    } else {
      b.z = g.h;
    }
  } else {
    b.z += b.vz * DT;
    if (g && b.z <= g.h) land(tuning, s, g);
  }

  // Hazard tiles the ball is touching: on the ground, or landed this step.
  const landedNow = s.events.slice(eventsBefore).some((e) => e.kind === 'land' || e.kind === 'bounce');
  touchTile(course, tuning, s, landedNow);

  // Out of bounds. (Water only counts if the ball stops in it; see below.)
  const now = groundAt(course, b.x, b.y);
  if (b.z < -tuning.outOfBoundsDepth) {
    finish(s, 'out');
    return;
  }

  // Rest: slow, on the ground, and the slope cannot overcome friction.
  if (b.grounded && now) {
    const phys = surfacePhysics(tuning, now.tile.surface);
    const slope = Math.hypot(now.sx, now.sy);
    const holds = slope <= phys.friction;
    if (Math.hypot(b.vx, b.vy) < tuning.restSpeed && holds) s.restSteps++;
    else s.restSteps = 0;
    if (s.restSteps >= Math.max(1, Math.round(tuning.restTime * STEPS_PER_SECOND))) {
      b.vx = 0;
      b.vy = 0;
      finish(s, SURFACES.get(now.tile.surface)?.sinks ? 'sunk' : 'rest');
      return;
    }
  }

  if (s.step >= tuning.maxShotTime * STEPS_PER_SECOND) {
    finish(s, now && b.grounded && SURFACES.get(now.tile.surface)?.sinks ? 'sunk' : 'timeout');
  }
}

function finish(s: ShotState, outcome: ShotOutcome): void {
  s.outcome = outcome;
  if (outcome !== 'timeout') s.events.push({ kind: outcome, step: s.step } as ShotEvent);
}

/** End a shot from outside the physics (the course rules: the ball dropped into the exit). */
export function endShot(s: ShotState, outcome: ShotOutcome): void {
  if (!s.outcome) finish(s, outcome);
}

/** Boosters and conveyors act on a ball rolling over them. */
function tileForce(tuning: Tuning, tile: Tile, b: BallState): void {
  const effect = SURFACES.get(tile.surface)?.effect;
  if (!tile.dir || (effect !== 'push' && effect !== 'carry')) return;
  const [dx, dy] = DIRECTION_VECTORS[tile.dir];
  const along = b.vx * dx + b.vy * dy;
  let target: number;
  if (effect === 'push') {
    // Owner, 2026-11-14: push hard. Never slower than the minimum along the arrow, and speeding up.
    target = Math.max(along, tuning.boosterMinSpeed) + tuning.boosterAccel * DT;
  } else {
    target = along + (tuning.conveyorSpeed - along) * Math.min(1, tuning.conveyorGrip * DT);
  }
  b.vx += (target - along) * dx;
  b.vy += (target - along) * dy;
}

/** Springs, warps and spikes act on a ball touching the tile. */
function touchTile(course: Course, tuning: Tuning, s: ShotState, landedNow: boolean): void {
  const b = s.ball;
  const g = groundAt(course, b.x, b.y);
  const key = g ? `${g.tile.x},${g.tile.y}` : null;
  if (s.warpLock && s.warpLock !== key) s.warpLock = null;
  const touching = !!g && (b.grounded || landedNow) && b.z <= g.h + 0.02;
  if (!g || !touching) {
    if (s.hazardTouch !== key) s.hazardTouch = null;
    return;
  }
  const effect = SURFACES.get(g.tile.surface)?.effect;
  if (effect === 'launch') {
    b.vz = Math.max(b.vz, tuning.springLaunch);
    b.grounded = false;
    b.z = g.h + 0.001;
    s.events.push({ kind: 'spring', step: s.step });
  } else if (effect === 'damage') {
    if (s.hazardTouch !== key) s.events.push({ kind: 'hazard', step: s.step, surface: g.tile.surface, x: b.x, y: b.y });
    s.hazardTouch = key;
  } else if (effect === 'warp' && g.tile.link && s.warpLock !== key) {
    const other = course.tiles.find((t) => t && t.link === g.tile.link && (t.x !== g.tile.x || t.y !== g.tile.y));
    if (!other) return;
    // Keep the spot inside the tile and the speed; the ball leaves the other warp the same way it entered.
    b.x = other.x + (b.x - g.tile.x);
    b.y = other.y + (b.y - g.tile.y);
    const to = groundAt(course, b.x, b.y);
    b.z = to?.h ?? b.z;
    s.warpLock = `${other.x},${other.y}`;
    s.events.push({ kind: 'warp', step: s.step, from: { x: g.tile.x, y: g.tile.y }, to: { x: other.x, y: other.y } });
  }
}

/**
 * Bounce off, or pass through, obstacles. Seen from above, the ball is a
 * circle; obstacles are circles or boxes. A ball coming down onto an
 * obstacle's top is thrown back up and off its side: nothing rests on top.
 */
function collideObstacles(tuning: Tuning, s: ShotState, world: ShotWorld, zBefore: number): void {
  const b = s.ball;
  const r = tuning.ballRadius;
  for (const o of world.obstacles) {
    const top = o.base + o.height;
    if (b.z >= top || b.z + 2 * r <= o.base) continue;
    // Closest point of the obstacle's core to the ball, seen from above.
    let cx = o.x;
    let cy = o.y;
    let reach = r;
    if (o.shape.kind === 'round') reach += o.shape.r;
    else {
      cx = Math.min(o.x + o.shape.hx, Math.max(o.x - o.shape.hx, b.x));
      cy = Math.min(o.y + o.shape.hy, Math.max(o.y - o.shape.hy, b.y));
    }
    let nx = b.x - cx;
    let ny = b.y - cy;
    const d = Math.hypot(nx, ny);
    if (d >= reach) continue;
    if (d < 1e-6) {
      // Centre inside a box: push out from the obstacle's centre, or back the way it came.
      nx = b.x - o.x;
      ny = b.y - o.y;
      if (Math.hypot(nx, ny) < 1e-6) {
        nx = -b.vx;
        ny = -b.vy;
      }
    }
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;

    const result = world.contact ? world.contact(o, s) : 'bounce';
    s.events.push({ kind: 'contact', step: s.step, obstacle: o.id, result });
    if (result === 'pass') {
      b.vx *= tuning.defeatSpeedKeep;
      b.vy *= tuning.defeatSpeedKeep;
      continue;
    }
    if (zBefore >= top - 0.01 && !b.grounded) {
      // Came down on top: thrown back up and off the side.
      b.z = top;
      b.vz = Math.max(Math.abs(b.vz) * o.bounce, 2.5);
      b.vx += nx * 1.5;
      b.vy += ny * 1.5;
      continue;
    }
    // Side hit: step back out and mirror the speed into the obstacle.
    if (o.shape.kind === 'round') {
      b.x = o.x + nx * (reach + 1e-4);
      b.y = o.y + ny * (reach + 1e-4);
    } else {
      b.x = cx + nx * (r + 1e-4);
      b.y = cy + ny * (r + 1e-4);
    }
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) {
      b.vx -= (1 + o.bounce) * vn * nx;
      b.vy -= (1 + o.bounce) * vn * ny;
    }
  }
}

/**
 * Move along one grid axis, stopping at walls. A wall is a grid line where the
 * tile on the far side is higher than the bottom of the ball. The ball's
 * leading edge (centre plus radius) is what touches the wall.
 */
function moveAxis(course: Course, tuning: Tuning, s: ShotState, axis: 'x' | 'y', d: number): void {
  if (d === 0) return;
  const b = s.ball;
  const r = tuning.ballRadius;
  const sign = Math.sign(d);
  const pos = axis === 'x' ? b.x : b.y;
  const lead = pos + sign * r;
  const next = lead + d;
  // Grid lines crossed by the leading edge this step (at most one at normal speeds, but be safe).
  const firstLine = sign > 0 ? Math.floor(lead) + 1 : Math.ceil(lead) - 1;
  for (let line = firstLine; sign > 0 ? line <= next : line >= next; line += sign) {
    const tx = axis === 'x' ? (sign > 0 ? line : line - 1) : Math.floor(b.x);
    const ty = axis === 'y' ? (sign > 0 ? line : line - 1) : Math.floor(b.y);
    const ex = axis === 'x' ? line : b.x;
    const ey = axis === 'y' ? line : b.y;
    const far = edgeHeight(course, tx, ty, ex, ey);
    // The tile the leading edge is leaving, at the same point on the line.
    const nx = axis === 'x' ? (sign > 0 ? line - 1 : line) : tx;
    const ny = axis === 'y' ? (sign > 0 ? line - 1 : line) : ty;
    const near = edgeHeight(course, nx, ny, ex, ey);
    // A wall is a step up at the grid line that the ball is too low to clear.
    const stepUp = far !== null && far.h > (near?.h ?? -Infinity) + WALL_TOLERANCE;
    if (far && stepUp && far.h > b.z + WALL_TOLERANCE) {
      // Wall: stop at it and mirror the speed along this axis.
      const phys = surfacePhysics(tuning, far.tile.surface);
      const stopAt = line - sign * (r + 1e-6);
      if (axis === 'x') {
        b.x = stopAt;
        b.vx = -b.vx * phys.wallBounce;
        b.vy *= Math.min(1, phys.wallBounce + 0.2);
      } else {
        b.y = stopAt;
        b.vy = -b.vy * phys.wallBounce;
        b.vx *= Math.min(1, phys.wallBounce + 0.2);
      }
      s.events.push({ kind: 'wall', step: s.step, surface: far.tile.surface });
      return;
    }
  }
  if (axis === 'x') b.x += d;
  else b.y += d;
}

function land(tuning: Tuning, s: ShotState, g: Ground): void {
  const b = s.ball;
  const phys = surfacePhysics(tuning, g.tile.surface);
  b.z = g.h;
  // Ground normal for the plane z = h + sx * x + sy * y.
  const nl = Math.hypot(g.sx, g.sy, 1);
  const nx = -g.sx / nl;
  const ny = -g.sy / nl;
  const nz = 1 / nl;
  const vn = b.vx * nx + b.vy * ny + b.vz * nz; // negative: moving into the ground
  // Speed along the ground, less the landing grip.
  let tx = (b.vx - vn * nx) * (1 - phys.landingGrip);
  let ty = (b.vy - vn * ny) * (1 - phys.landingGrip);

  // Topspin and backspin act on the first landing of a lofted shot.
  if (!s.hasLanded && s.cmd.type === 'lofted' && s.cmd.topSpin !== 0) {
    tx += s.dirX * s.cmd.topSpin * tuning.spinLandingSpeed;
    ty += s.dirY * s.cmd.topSpin * tuning.spinLandingSpeed;
  }
  s.hasLanded = true;

  const boosted = s.boostArmed > 0;
  let out = -vn * phys.bounce;
  if (boosted) out = Math.max(out * tuning.boostMultiplier * s.boostScale, tuning.boostMinSpeed * s.boostScale);
  s.boostArmed = 0;
  s.boostSpent = false;

  if (out > tuning.minBounceSpeed) {
    b.vx = tx + out * nx;
    b.vy = ty + out * ny;
    b.vz = out * nz;
    b.grounded = false;
    s.events.push({ kind: 'bounce', step: s.step, surface: g.tile.surface, boosted });
  } else {
    b.vx = tx;
    b.vy = ty;
    b.vz = 0;
    b.grounded = true;
    s.events.push({ kind: 'land', step: s.step, surface: g.tile.surface });
  }
}

/** Run a whole shot. `inputs[i]` is what the player does on step i (missing means nothing). */
export function simulateShot(
  course: Course,
  tuning: Tuning,
  from: BallState,
  cmd: ShotCommand,
  inputs: readonly StepInput[] = [],
  world?: ShotWorld,
  scales?: ShotScales,
): ShotState {
  const s = startShot(tuning, from, cmd, scales);
  while (!s.outcome) stepShot(course, tuning, s, inputs[s.step] ?? {}, world);
  return s;
}

export interface GuidePoint {
  x: number;
  y: number;
  z: number;
}

/**
 * The aim guide: runs the real simulation ahead and returns the path for the
 * first `tuning.guideLength` tiles travelled (or until the shot ends). Because
 * it is the same simulation, the guide always matches what the shot will do,
 * as long as the player presses nothing during the shot.
 */
export function predictPath(
  course: Course,
  tuning: Tuning,
  from: BallState,
  cmd: ShotCommand,
  lengthScale = 1,
  world?: ShotWorld,
  scales?: ShotScales,
): GuidePoint[] {
  const s = startShot(tuning, from, cmd, scales);
  const pts: GuidePoint[] = [{ x: s.ball.x, y: s.ball.y, z: s.ball.z }];
  const max = tuning.guideLength * lengthScale;
  let travelled = 0;
  while (!s.outcome && travelled < max) {
    const px = s.ball.x;
    const py = s.ball.y;
    stepShot(course, tuning, s, {}, world);
    travelled += Math.hypot(s.ball.x - px, s.ball.y - py);
    pts.push({ x: s.ball.x, y: s.ball.y, z: s.ball.z });
  }
  return pts;
}
