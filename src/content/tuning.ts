/**
 * Every tuning number for the shot and the ball physics, in one place
 * (DESIGN.md section 5). Change values here, or live in the game with the
 * tuning panel (press ` in the game). The panel's "Copy" button gives you JSON
 * you can paste back into this file.
 *
 * Units: distances in tiles (one tile = one grid square), time in seconds,
 * speeds in tiles per second. Heights in the course files are in steps;
 * STEP_HEIGHT below converts them.
 */

/** Per-surface physics. Surfaces not listed use `default`. */
export interface SurfacePhysics {
  /** Rolling friction, as a fraction of gravity. Higher stops the ball sooner. */
  friction: number;
  /** Fraction of the falling speed kept when the ball bounces on this surface. */
  bounce: number;
  /** Fraction of the forward speed lost on each landing. */
  landingGrip: number;
  /** Fraction of speed kept when the ball hits a wall made of this surface. Above 1 adds speed. */
  wallBounce: number;
  /** Extra slowing while rolling through this surface, per second, in proportion to speed (water). */
  drag: number;
}

export interface Tuning {
  // World
  gravity: number;
  /** Ball radius, used for walls. */
  ballRadius: number;
  /** Speed lost per second in proportion to speed (air and ground). */
  drag: number;

  // Shot
  groundMaxSpeed: number;
  loftMaxSpeed: number;
  /** Launch angle of a lofted shot, in degrees above the ground. */
  loftAngle: number;
  /** Releasing the meter this close to the top (0 to 1) is a perfect shot. */
  perfectWindow: number;
  /** Speed of a perfect shot, as a multiple of the top of the bar. */
  perfectBonus: number;
  /** Lowest power the meter can give, 0 to 1. */
  minPower: number;
  /** Seconds for the meter to sweep from empty to full and back. */
  meterPeriod: number;
  /** Up-and-down sweeps the meter makes before the shot launches on its own. */
  meterCycles: number;
  /** Power of the automatic launch when the meter runs out, 0 to 1. */
  autoLaunchPower: number;
  /** Planning pull: screen pixels of pull for a full-power preview. */
  dragFullPx: number;

  // Spin
  /** Lofted shots: speed added (topspin) or removed (backspin) on the first landing, at full spin. */
  spinLandingSpeed: number;
  /** Ground shots: push along the shot direction at full spin, while the spin lasts. */
  spinRollAccel: number;
  /** Ground shots: how long the spin push lasts. */
  spinRollTime: number;
  /** Side curve: turn rate in degrees per second at full side spin. */
  curveRate: number;
  /** How fast side curve fades, per second. */
  curveFade: number;

  // Bounce and rest
  /** Below this falling speed the ball stops bouncing and rolls. */
  minBounceSpeed: number;
  /** Below this speed the ball can come to rest. */
  restSpeed: number;
  /** Seconds the ball must stay slow before it counts as resting. */
  restTime: number;

  // Bounce boost
  /** How long before landing a boost press still counts, in seconds. */
  boostWindow: number;
  /** Multiplier on the bounce when boosted. */
  boostMultiplier: number;
  /** A boosted bounce leaves the ground at least this fast. */
  boostMinSpeed: number;

  // Aim guide
  /** How far along the path the guide is drawn, in tiles. */
  guideLength: number;

  // Hazards and course objects (Milestone 3)
  /** Booster: push along its arrow while the ball is on it, in tiles per second per second. */
  boosterAccel: number;
  /** Booster: a ball leaving it is going at least this fast along the arrow. */
  boosterMinSpeed: number;
  /** Conveyor: the speed it carries the ball at, along its arrow. */
  conveyorSpeed: number;
  /** Conveyor: how quickly it brings the ball to its speed, per second. */
  conveyorGrip: number;
  /** Spring: upward speed it launches the ball with. */
  springLaunch: number;
  /** Exit: the ball drops in when it rolls within this distance of the hole's centre, in tiles... */
  exitRadius: number;
  /** ...and is moving slower than this. Faster, it rolls over the hole. */
  exitMaxSpeed: number;
  /** Fraction of speed the ball keeps when it defeats an enemy and carries on. */
  defeatSpeedKeep: number;

  // Flag poles (owner, 2026-11-14)
  /** A ball hitting a flag pole at this speed or more pushes past it... */
  poleThroughSpeed: number;
  /** ...keeping this fraction of its speed. Slower, it bounces off. */
  polePassKeep: number;
  /** Guard rail (Milestone 5b): fraction of speed kept bouncing off a rail. */
  railBounce: number;
  /** Guard rail: speed kept when the bounce-boost key was pressed just before the hit (owner, 2026-11-15: a stronger bounce). */
  railBoost: number;

  // Safety
  /** Falling this far below height 0 counts as out of bounds, in tiles. */
  outOfBoundsDepth: number;
  /** A shot is stopped after this many seconds, whatever happens. */
  maxShotTime: number;

  surfaces: Record<string, SurfacePhysics>;
}

/** Height of one course step in tiles. Fixed by the art (8 px step, 32x16 tile), not a tuning number. */
export const STEP_HEIGHT = 0.25;

/** Simulation steps per second. Fixed timestep (DESIGN.md section 5). */
export const STEPS_PER_SECOND = 120;

export const DEFAULT_TUNING: Tuning = {
  gravity: 20,
  ballRadius: 0.15,
  drag: 0.25,

  // Owner, 2026-11-14: whole bar 20% faster than first tuning (11 and 10), and a
  // perfect top-of-bar release 35% above the old top (1.35 / 1.2 = 1.125 x the new top).
  groundMaxSpeed: 13.2,
  loftMaxSpeed: 12,
  perfectWindow: 0.02,
  perfectBonus: 1.125,
  // Owner tuning round 2 (2026-11-14): perfectWindow 0.02, meterPeriod 1.5, bumper bounce 1.
  loftAngle: 50,
  minPower: 0.05,
  meterPeriod: 1.5,
  // Owner, 2026-11-14: up, down, up, down, then an automatic launch (5% at first, 10% from tuning round 4).
  meterCycles: 2,
  autoLaunchPower: 0.1,
  dragFullPx: 80,

  spinLandingSpeed: 4,
  spinRollAccel: 3,
  spinRollTime: 0.8,
  curveRate: 70,
  curveFade: 0.6,

  minBounceSpeed: 1.2,
  restSpeed: 0.2,
  restTime: 0.15,

  boostWindow: 0.15,
  boostMultiplier: 1.6,
  boostMinSpeed: 5,

  guideLength: 4,

  // Owner, 2026-11-14: arrow tiles must push hard. Default values, tune with the panel.
  boosterAccel: 45,
  boosterMinSpeed: 9,
  conveyorSpeed: 4,
  conveyorGrip: 6,
  springLaunch: 9,
  exitRadius: 0.4,
  exitMaxSpeed: 7,
  defeatSpeedKeep: 0.85,
  poleThroughSpeed: 8,
  polePassKeep: 0.25,
  railBounce: 0.8,
  railBoost: 1.1,

  outOfBoundsDepth: 2,
  maxShotTime: 30,

  // Owner tuning round 3 (2026-11-14): every surface bounce +10%, except bumper,
  // which stays at 1 (above 1 a ball would bounce higher every time and never settle).
  surfaces: {
    default: { friction: 0.15, bounce: 0.495, landingGrip: 0.15, wallBounce: 0.7, drag: 0 },
    grass: { friction: 0.15, bounce: 0.495, landingGrip: 0.15, wallBounce: 0.7, drag: 0 },
    rough: { friction: 0.45, bounce: 0.33, landingGrip: 0.35, wallBounce: 0.6, drag: 0 },
    sand: { friction: 1.0, bounce: 0.055, landingGrip: 0.7, wallBounce: 0.4, drag: 0 },
    ice: { friction: 0.03, bounce: 0.55, landingGrip: 0.03, wallBounce: 0.8, drag: 0 },
    bumper: { friction: 0.15, bounce: 1, landingGrip: 0.1, wallBounce: 1.25, drag: 0 },
    // Owner, 2026-11-14: water slows the ball but only resets it if it stops there.
    water: { friction: 0.4, bounce: 0.2, landingGrip: 0.5, wallBounce: 0.3, drag: 2.5 },
  },
};

export function surfacePhysics(t: Tuning, surface: string): SurfacePhysics {
  return t.surfaces[surface] ?? t.surfaces.default!;
}

export function cloneTuning(t: Tuning): Tuning {
  return JSON.parse(JSON.stringify(t)) as Tuning;
}

/** Slider ranges for the tuning panel. Keys are paths into Tuning, e.g. "surfaces.grass.friction". */
export interface TuningControl {
  key: string;
  min: number;
  max: number;
  step: number;
  group: string;
}

const top = (group: string, key: keyof Tuning, min: number, max: number, step: number): TuningControl => ({ key, min, max, step, group });

export const TUNING_CONTROLS: readonly TuningControl[] = [
  top('World', 'gravity', 5, 60, 0.5),
  top('World', 'ballRadius', 0.05, 0.4, 0.01),
  top('World', 'drag', 0, 2, 0.01),
  top('Shot', 'groundMaxSpeed', 2, 30, 0.5),
  top('Shot', 'loftMaxSpeed', 2, 30, 0.5),
  top('Shot', 'loftAngle', 10, 80, 1),
  top('Shot', 'perfectWindow', 0, 0.2, 0.005),
  top('Shot', 'perfectBonus', 1, 2, 0.005),
  top('Shot', 'minPower', 0, 0.5, 0.01),
  top('Shot', 'meterPeriod', 0.4, 4, 0.05),
  top('Shot', 'meterCycles', 1, 5, 1),
  top('Shot', 'autoLaunchPower', 0, 0.5, 0.01),
  top('Shot', 'dragFullPx', 20, 200, 1),
  top('Spin', 'spinLandingSpeed', 0, 12, 0.1),
  top('Spin', 'spinRollAccel', 0, 12, 0.1),
  top('Spin', 'spinRollTime', 0, 3, 0.05),
  top('Spin', 'curveRate', 0, 200, 1),
  top('Spin', 'curveFade', 0, 3, 0.05),
  top('Bounce', 'minBounceSpeed', 0, 5, 0.05),
  top('Bounce', 'restSpeed', 0.01, 1, 0.01),
  top('Bounce', 'restTime', 0, 1, 0.01),
  top('Boost', 'boostWindow', 0.02, 0.5, 0.01),
  top('Boost', 'boostMultiplier', 1, 3, 0.05),
  top('Boost', 'boostMinSpeed', 0, 15, 0.25),
  top('Guide', 'guideLength', 0.5, 20, 0.5),
  top('Hazards', 'boosterAccel', 0, 150, 1),
  top('Hazards', 'boosterMinSpeed', 0, 25, 0.5),
  top('Hazards', 'conveyorSpeed', 0, 15, 0.25),
  top('Hazards', 'conveyorGrip', 0, 30, 0.5),
  top('Hazards', 'springLaunch', 0, 25, 0.5),
  top('Hazards', 'exitRadius', 0.1, 0.5, 0.01),
  top('Hazards', 'exitMaxSpeed', 0, 20, 0.25),
  top('Hazards', 'defeatSpeedKeep', 0, 1, 0.01),
  top('Flag pole', 'poleThroughSpeed', 0, 20, 0.25),
  top('Flag pole', 'polePassKeep', 0, 1, 0.01),
  top('Guard rail', 'railBounce', 0, 1.5, 0.01),
  top('Guard rail', 'railBoost', 0, 2, 0.01),
  ...['grass', 'rough', 'sand', 'ice', 'bumper', 'water'].flatMap((s) => [
    { key: `surfaces.${s}.friction`, min: 0, max: 2, step: 0.01, group: `Surface: ${s}` },
    { key: `surfaces.${s}.bounce`, min: 0, max: 1, step: 0.01, group: `Surface: ${s}` },
    { key: `surfaces.${s}.landingGrip`, min: 0, max: 1, step: 0.01, group: `Surface: ${s}` },
    { key: `surfaces.${s}.wallBounce`, min: 0, max: 2, step: 0.01, group: `Surface: ${s}` },
    { key: `surfaces.${s}.drag`, min: 0, max: 10, step: 0.1, group: `Surface: ${s}` },
  ]),
];

export function getTuningValue(t: Tuning, key: string): number {
  let o: unknown = t;
  for (const part of key.split('.')) o = (o as Record<string, unknown>)[part];
  return o as number;
}

export function setTuningValue(t: Tuning, key: string, value: number): void {
  const parts = key.split('.');
  let o = t as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) o = o[part] as Record<string, unknown>;
  o[parts[parts.length - 1]!] = value;
}
