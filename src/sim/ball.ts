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
 * - Obstacles (blockers, enemies, moving things) are passed in as a `ShotWorld`.
 *   The ball bounces off them, is knocked away by a moving one, or, when the
 *   rules say so, carries on through.
 * - The same code moves other rolling things (Milestone 4): a ball knocked while
 *   resting, a Lunger or Mole launching itself, a Spitter's seed. Those use
 *   `startBody`. Rolling enemies treat drops and water as walls.
 * - Ability modes (Milestone 4), switched on by the course rules: Anchor (drop
 *   and stop dead), Burner (minimum speed), Tornado (hover: no falling, no
 *   surfaces; the rules steer it).
 */
import type { ObjectShape } from '../content/objects.ts';
import { DIRECTION_VECTORS, SURFACES } from '../content/surfaces.ts';
import type { Rng } from './rng.ts';
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
  | { kind: 'anchorStop'; step: number; x: number; y: number }
  | { kind: 'railBoost'; step: number }
  /** The ball landed in water or skipped off it (for a splash on screen). */
  | { kind: 'splash'; step: number; x: number; y: number; skip: boolean; boosted: boolean }
  | { kind: 'exit'; step: number };

export type ShotOutcome = 'rest' | 'sunk' | 'out' | 'timeout' | 'exit';

interface GridTile {
  readonly x: number;
  readonly y: number;
}

/**
 * What happens when the ball touches an obstacle.
 * - bounce: bounces off.
 * - knock: bounces off and is pushed away at the obstacle's speed plus its `knock` (a moving thing ran into it).
 * - pass: carries on through, keeping `defeatSpeedKeep` of its speed (a defeated enemy, a broken crate).
 * - passFree: carries on through at full speed (Burner).
 * - passPole: pushes past a flag pole, keeping `polePassKeep` of its speed.
 */
export type ContactResult = 'bounce' | 'knock' | 'pass' | 'passFree' | 'passPole';

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
  /** Its own speed, for moving obstacles. */
  readonly vx?: number;
  readonly vy?: number;
  /** Extra push-away speed when the result is 'knock'. */
  readonly knock?: number;
  /** Guard rails: the bounce when the boost key was pressed just before the hit. */
  readonly boost?: number;
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
  /** Milestone 8: frozen water tiles (see ShotState.frozen). */
  readonly frozen?: Readonly<Record<string, number>> | null;
  /** Milestone 8: a Chilled ball rolls as if on ice. */
  readonly iceRoll?: boolean;
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
  /** Trapped rest (2026-11-18): where the ball has stayed close to on the ground, and for how many steps. */
  trapX: number;
  trapY: number;
  trapSteps: number;
  /** Steps left in which a landing gets boosted. 0 when no boost is armed. */
  boostArmed: number;
  /** One boost press per flight. Cleared on each landing. */
  boostSpent: boolean;
  /** Rolling: steps left in which hitting a guard rail gets the rail boost. */
  railArmed: number;
  /** Set once the shot is over. */
  outcome: ShotOutcome | null;
  events: ShotEvent[];
  readonly boostScale: number;
  /** After a warp: the tile the ball arrived on. It must leave before warps work again. */
  warpLock: string | null;
  /** The last hazard tile the ball touched, so each touch is reported once. */
  hazardTouch: string | null;
  /** Radius of what is moving (the ball, a rolling enemy, a seed), in tiles. */
  readonly radius: number;
  /** Obstacles being passed through right now, so a pass is counted once. */
  passing: string[];
  /** Rolling enemies: a drop to lower ground or off the course works as a wall. */
  edgeWalls: boolean;
  /** Rolling enemies: the edge of water works as a wall. */
  waterWalls: boolean;
  /** Anchor: on the next landing (or now, if on the ground) stop dead. */
  anchor: boolean;
  /** Set for one step when an Anchor stop happens. */
  anchorStopped: boolean;
  /** Burner: steps left, and the sideways speed kept up while they last. */
  burnSteps: number;
  burnMin: number;
  /** Tornado: the ball hovers at no lower than `floor` and ignores surfaces; the rules set its speed. */
  hover: { floor: number } | null;
  /**
   * Milestone 8: water tiles frozen by the Frost ability ("x,y" -> turns left),
   * shared with the course rules. Frozen water is ice for everything here.
   */
  frozen: Readonly<Record<string, number>> | null;
  /** Milestone 8: the ball is Chilled and rolls as if on ice (grass, rough and sand use ice's friction). */
  iceRoll: boolean;
}

/** Surfaces a Chilled ball slides on as if they were ice (Milestone 8 sheet section 2). */
const ICE_ROLL_SURFACES: ReadonlySet<string> = new Set(['grass', 'rough', 'sand']);

/** The surface of a tile as this motion meets it: frozen water is ice (Milestone 8). */
export function surfaceOf(s: Pick<ShotState, 'frozen'>, tile: Tile): string {
  if (s.frozen && (s.frozen[`${tile.x},${tile.y}`] ?? 0) > 0) return 'ice';
  return tile.surface;
}

/** Physics of a tile as this motion meets it: frozen water, and a Chilled ball's ice roll. */
function physOf(tuning: Tuning, s: ShotState, tile: Tile) {
  const surface = surfaceOf(s, tile);
  const phys = surfacePhysics(tuning, surface);
  if (s.iceRoll && ICE_ROLL_SURFACES.has(surface)) return { ...phys, friction: surfacePhysics(tuning, 'ice').friction };
  return phys;
}

const sinksAt = (s: ShotState, tile: Tile) => !!SURFACES.get(surfaceOf(s, tile))?.sinks;

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
    trapX: ball.x,
    trapY: ball.y,
    trapSteps: 0,
    boostArmed: 0,
    boostSpent: false,
    railArmed: 0,
    outcome: null,
    events: [],
    boostScale: scales.boost ?? 1,
    warpLock: null,
    hazardTouch: null,
    radius: tuning.ballRadius,
    passing: [],
    edgeWalls: false,
    waterWalls: false,
    anchor: false,
    anchorStopped: false,
    burnSteps: 0,
    burnMin: 0,
    hover: null,
    frozen: scales.frozen ?? null,
    iceRoll: scales.iceRoll ?? false,
  };
}

export interface BodyOptions {
  readonly radius?: number;
  readonly edgeWalls?: boolean;
  readonly waterWalls?: boolean;
}

/**
 * Start something moving with a given velocity: a resting ball that was
 * knocked, a rolling enemy, a seed. No spin, no shot command.
 */
export function startBody(tuning: Tuning, from: BallState, v: { vx: number; vy: number; vz: number }, opts: BodyOptions = {}): ShotState {
  const angle = Math.atan2(v.vy, v.vx);
  const airborne = v.vz > 0 || !from.grounded;
  const s = startShot(tuning, from, { angle, power: 0, type: airborne ? 'lofted' : 'ground', topSpin: 0, sideSpin: 0 });
  s.ball.vx = v.vx;
  s.ball.vy = v.vy;
  s.ball.vz = v.vz;
  s.ball.grounded = !airborne;
  if (airborne) s.ball.z += 0.001;
  s.hasLanded = true;
  return { ...s, radius: opts.radius ?? tuning.ballRadius, edgeWalls: !!opts.edgeWalls, waterWalls: !!opts.waterWalls };
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
  if (s.railArmed > 0) s.railArmed--;
  // On the ground the boost key arms the rail boost instead (owner, 2026-11-15). One press per window.
  if (input.boost && b.grounded && s.railArmed === 0) s.railArmed = Math.max(1, Math.round(tuning.boostWindow * STEPS_PER_SECOND));
  if (input.boost && !b.grounded && !s.boostSpent) {
    s.boostSpent = true;
    s.boostArmed = Math.max(1, Math.round(tuning.boostWindow * STEPS_PER_SECOND));
  }

  if (s.hover) {
    stepHover(course, tuning, s, world, zBefore);
    return;
  }

  // Anchor used while on the ground: stop dead now.
  if (s.anchor && b.grounded) {
    const g0 = groundAt(course, b.x, b.y);
    if (g0) anchorStop(s, g0);
  }

  // Side curve: turn the horizontal velocity a little, fading over time. Not during a Burner burst.
  if (s.cmd.sideSpin !== 0 && s.burnSteps <= 0) {
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
      const phys = physOf(tuning, s, g.tile);
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

  // Burner: keep the sideways speed up while the burst lasts.
  if (s.burnSteps > 0) {
    s.burnSteps--;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp < s.burnMin) {
      const dx = sp > 1e-6 ? b.vx / sp : s.dirX;
      const dy = sp > 1e-6 ? b.vy / sp : s.dirY;
      b.vx = dx * s.burnMin;
      b.vy = dy * s.burnMin;
    }
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

  // An Anchor stop ends the motion at once, unless a pad (booster, conveyor, spring) acts on it.
  if (s.anchorStopped) {
    s.anchorStopped = false;
    const effect = now ? SURFACES.get(surfaceOf(s, now.tile))?.effect : undefined;
    const pad = effect === 'push' || effect === 'carry' || effect === 'launch';
    if (!pad && now) {
      finish(s, sinksAt(s, now.tile) ? 'sunk' : 'rest');
      return;
    }
  }

  // Rest: slow, on the ground, and the slope cannot overcome friction.
  if (b.grounded && now) {
    const phys = physOf(tuning, s, now.tile);
    const slope = Math.hypot(now.sx, now.sy);
    const holds = slope <= phys.friction;
    if (Math.hypot(b.vx, b.vy) < tuning.restSpeed && holds) s.restSteps++;
    else s.restSteps = 0;
    // Trapped (found 2026-11-18): at the bottom of a small pit or a narrow valley the slope is too
    // steep to "hold", but the ball only rocks back and forth on one spot. Staying within a tiny
    // circle for long enough also counts as resting, so a shot never hangs until the time limit.
    if (Math.hypot(b.x - s.trapX, b.y - s.trapY) <= tuning.trapRadius) s.trapSteps++;
    else {
      s.trapX = b.x;
      s.trapY = b.y;
      s.trapSteps = 0;
    }
    const trapped = s.trapSteps >= Math.max(1, Math.round(tuning.trapTime * STEPS_PER_SECOND));
    if (trapped || s.restSteps >= Math.max(1, Math.round(tuning.restTime * STEPS_PER_SECOND))) {
      b.vx = 0;
      b.vy = 0;
      finish(s, sinksAt(s, now.tile) ? 'sunk' : 'rest');
      return;
    }
  } else s.trapSteps = 0;

  if (s.step >= tuning.maxShotTime * STEPS_PER_SECOND) {
    finish(s, now && b.grounded && sinksAt(s, now.tile) ? 'sunk' : 'timeout');
  }
}

/** Anchor: stop dead on the ground. */
function anchorStop(s: ShotState, g: Ground): void {
  const b = s.ball;
  b.vx = 0;
  b.vy = 0;
  b.vz = 0;
  b.z = g.h;
  b.grounded = true;
  s.anchor = false;
  s.anchorStopped = true;
  s.events.push({ kind: 'anchorStop', step: s.step, x: b.x, y: b.y });
}

/**
 * Tornado: the rules set the sideways speed each step. The ball never goes
 * lower than the height it had (it can go out over a drop), follows the ground
 * up, still bounces off walls and obstacles, and ignores surfaces and hazards.
 */
function stepHover(course: Course, tuning: Tuning, s: ShotState, world: ShotWorld | undefined, zBefore: number): void {
  const b = s.ball;
  const hover = s.hover!;
  b.vz = 0;
  moveAxis(course, tuning, s, 'x', b.vx * DT);
  moveAxis(course, tuning, s, 'y', b.vy * DT);
  if (world) collideObstacles(tuning, s, world, zBefore);
  const g = groundAt(course, b.x, b.y);
  b.z = Math.max(g?.h ?? -Infinity, hover.floor);
  hover.floor = b.z;
  b.grounded = !!g && b.z <= g.h + 1e-3;
  if (s.step >= tuning.maxShotTime * STEPS_PER_SECOND) finish(s, 'timeout');
}

/**
 * End a Tornado: normal physics again, keeping `keep` of the speed. Over a
 * drop, the ball falls from where it is.
 */
export function endHover(course: Course, s: ShotState, keep: number): void {
  const b = s.ball;
  s.hover = null;
  b.vx *= keep;
  b.vy *= keep;
  b.vz = 0;
  const g = groundAt(course, b.x, b.y);
  b.grounded = !!g && b.z <= g.h + 0.01;
  if (b.grounded && g) b.z = g.h;
}

/** Turn the sideways velocity to a heading, keeping or setting its speed (used by the Tornado). */
export function setHeading(s: ShotState, angle: number, speed: number): void {
  s.ball.vx = Math.cos(angle) * speed;
  s.ball.vy = Math.sin(angle) * speed;
}

/** A random direction from the seeded generator, in radians. */
export function randomAngle(rng: Rng): number {
  return rng.float(0, Math.PI * 2);
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
 * The point of a shape's core nearest to (px, py), seen from above, and how
 * far the core's own thickness reaches beyond that point.
 */
export function nearestOnShape(shape: ObjectShape, ox: number, oy: number, px: number, py: number): { cx: number; cy: number; thick: number } {
  if (shape.kind === 'round') return { cx: ox, cy: oy, thick: shape.r };
  if (shape.kind === 'box') {
    return { cx: Math.min(ox + shape.hx, Math.max(ox - shape.hx, px)), cy: Math.min(oy + shape.hy, Math.max(oy - shape.hy, py)), thick: 0 };
  }
  const ax = ox + shape.ax;
  const ay = oy + shape.ay;
  const dx = shape.bx - shape.ax;
  const dy = shape.by - shape.ay;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
  return { cx: ax + dx * t, cy: ay + dy * t, thick: shape.r };
}

/**
 * Bounce off, or pass through, obstacles. Seen from above, the ball is a
 * circle; obstacles are circles or boxes. A ball coming down onto an
 * obstacle's top is thrown back up and off its side: nothing rests on top.
 */
function collideObstacles(tuning: Tuning, s: ShotState, world: ShotWorld, zBefore: number): void {
  const b = s.ball;
  const r = s.radius;
  for (const o of world.obstacles) {
    // Quick skip for anything far away (no obstacle reaches 2.5 tiles from its centre point).
    if ((b.x - o.x > 2.5 || o.x - b.x > 2.5 || b.y - o.y > 2.5 || o.y - b.y > 2.5) && !s.passing.length) continue;
    const top = o.base + o.height;
    const leave = () => {
      const k = s.passing.indexOf(o.id);
      if (k >= 0) s.passing.splice(k, 1);
    };
    if (b.z >= top || b.z + 2 * r <= o.base) {
      leave();
      continue;
    }
    // Closest point of the obstacle's core to the ball, seen from above.
    const near = nearestOnShape(o.shape, o.x, o.y, b.x, b.y);
    const cx = near.cx;
    const cy = near.cy;
    const reach = r + near.thick;
    let nx = b.x - cx;
    let ny = b.y - cy;
    const d = Math.hypot(nx, ny);
    if (d >= reach) {
      leave();
      continue;
    }
    if (s.passing.includes(o.id)) continue;
    if (d < 1e-6) {
      // Centre inside a box: push out from the obstacle's centre, or back the way it came.
      nx = b.x - o.x;
      ny = b.y - o.y;
      if (Math.hypot(nx, ny) < 1e-6) {
        nx = -b.vx;
        ny = -b.vy;
      }
      if (Math.hypot(nx, ny) < 1e-6) nx = 1;
    }
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl;
    ny /= nl;

    const result = world.contact ? world.contact(o, s) : 'bounce';
    s.events.push({ kind: 'contact', step: s.step, obstacle: o.id, result });
    if (result === 'pass' || result === 'passFree' || result === 'passPole') {
      const keep = result === 'pass' ? tuning.defeatSpeedKeep : result === 'passPole' ? tuning.polePassKeep : 1;
      b.vx *= keep;
      b.vy *= keep;
      s.passing.push(o.id);
      continue;
    }
    if (zBefore >= top - 0.01 && !b.grounded && result === 'bounce') {
      // Came down on top: thrown back up and off the side.
      b.z = top;
      b.vz = Math.max(Math.abs(b.vz) * o.bounce, 2.5);
      b.vx += nx * 1.5;
      b.vy += ny * 1.5;
      continue;
    }
    // Side hit: step back out and mirror the speed into the obstacle (seen from the obstacle, if it moves).
    b.x = cx + nx * (reach + 1e-4);
    b.y = cy + ny * (reach + 1e-4);
    const ovx = o.vx ?? 0;
    const ovy = o.vy ?? 0;
    const vn = (b.vx - ovx) * nx + (b.vy - ovy) * ny;
    if (vn < 0) {
      // Guard rail boost (owner, 2026-11-15): the key pressed just before the hit gives a stronger bounce.
      let bounce = o.bounce;
      if (o.boost !== undefined && (s.railArmed > 0 || s.boostArmed > 0)) {
        bounce = o.boost;
        s.railArmed = 0;
        s.boostArmed = 0;
        s.events.push({ kind: 'railBoost', step: s.step });
      }
      const sp0 = Math.hypot(b.vx, b.vy);
      b.vx -= (1 + bounce) * vn * nx;
      b.vy -= (1 + bounce) * vn * ny;
      if (o.boost !== undefined) {
        // A rail turns the ball: the part of its speed along the rail is kept, the part into it bounces back.
        // Keep the overall speed at bounce times what it was, and never above a full ground shot.
        const want = Math.min(sp0 * bounce, Math.max(sp0, tuning.groundMaxSpeed));
        const sp1 = Math.hypot(b.vx, b.vy);
        if (sp1 > 1e-6) {
          b.vx *= want / sp1;
          b.vy *= want / sp1;
        }
      }
    }
    if (result === 'knock') {
      // Pushed out of the way at the obstacle's speed plus the knock.
      const want = ovx * nx + ovy * ny + (o.knock ?? 0);
      const now = b.vx * nx + b.vy * ny;
      if (now < want) {
        b.vx += (want - now) * nx;
        b.vy += (want - now) * ny;
      }
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
  const r = s.radius;
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
    // Rolling enemies (owner, 2026-11-14): a drop or the edge of the course, and the edge of water, work as walls.
    if (near && (s.edgeWalls || s.waterWalls)) {
      const drop = s.edgeWalls && (!far || far.h < near.h - WALL_TOLERANCE);
      const water = s.waterWalls && !!far && sinksAt(s, far.tile) && !sinksAt(s, near.tile);
      if (drop || water) {
        const stopAt = line - sign * (r + 1e-6);
        const kb = 0.6;
        if (axis === 'x') {
          b.x = stopAt;
          b.vx = -b.vx * kb;
        } else {
          b.y = stopAt;
          b.vy = -b.vy * kb;
        }
        s.events.push({ kind: 'wall', step: s.step, surface: far?.tile.surface ?? 'edge' });
        return;
      }
    }
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
  if (s.anchor) {
    anchorStop(s, g);
    s.hasLanded = true;
    return;
  }
  const phys = physOf(tuning, s, g.tile);
  b.z = g.h;
  // Skipping across water (owner, 2026-11-15): fast and low, the ball bounces off the surface.
  if (sinksAt(s, g.tile)) {
    const flat = Math.hypot(b.vx, b.vy);
    const boosted = s.boostArmed > 0;
    if (flat > tuning.waterSkipSpeed && Math.abs(b.vz) < flat * tuning.waterSkipAngle) {
      const keep = boosted ? tuning.waterSkipBoostKeep : tuning.waterSkipKeep;
      b.vx *= keep;
      b.vy *= keep;
      b.vz = Math.max(Math.abs(b.vz) * tuning.waterSkipLift, tuning.waterSkipMinHop);
      b.grounded = false;
      s.hasLanded = true;
      s.boostArmed = 0;
      s.boostSpent = false;
      s.events.push({ kind: 'splash', step: s.step, x: b.x, y: b.y, skip: true, boosted });
      return;
    }
    s.events.push({ kind: 'splash', step: s.step, x: b.x, y: b.y, skip: false, boosted: false });
  }
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
