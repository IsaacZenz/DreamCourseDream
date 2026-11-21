/**
 * Course modifiers (round 2b sheet section 3; owner, 2026-11-21: defaults).
 * Some courses roll one rule change. Each is a set of stat modifiers on the
 * ball (FEATURES.md section 1), so gear could one day resist one, and costs
 * part of the threat budget. The run rolls them (sim/run.ts); the course
 * rules apply them (sim/play.ts).
 */
import type { Direction } from './surfaces.ts';
import type { StatId } from './stats.ts';

export type CourseModId = 'wind' | 'lowGravity' | 'darkness';

/** A course's modifier: which one, and for wind, the direction it blows. */
export interface CourseMod {
  readonly id: CourseModId;
  readonly dir?: Direction;
  /** Wind only (owner, 2026-11-21): 1 light, 2 medium, 3 strong. Left out: medium. */
  readonly strength?: 1 | 2 | 3;
}

/** Wind strengths (owner, 2026-11-21): the push in the air (tiles/s²) and the cost against the threat budget. */
export const WIND_STRENGTHS: Readonly<Record<1 | 2 | 3, { readonly name: string; readonly accel: number; readonly cost: number }>> = {
  1: { name: 'Light', accel: 1.0, cost: 1 },
  2: { name: 'Medium', accel: 1.5, cost: 2 },
  3: { name: 'Strong', accel: 2.2, cost: 3 },
};

/** What a course modifier costs against the threat budget (wind: by its strength). */
export function courseModCost(mod: CourseMod): number {
  if (mod.id === 'wind') return WIND_STRENGTHS[mod.strength ?? 2].cost;
  return COURSE_MODS.get(mod.id)?.cost ?? 0;
}

/** Wind's push in the air for this modifier (0 for the others). */
export function windAccel(mod: CourseMod): number {
  return mod.id === 'wind' ? WIND_STRENGTHS[mod.strength ?? 2].accel : 0;
}

export interface CourseModDef {
  readonly id: CourseModId;
  readonly name: string;
  /** Shown on the map and on the course's banner. */
  readonly desc: string;
  /** Taken off the threat budget. */
  readonly cost: number;
  /** Stat changes on the ball. Wind's are along its direction (`windAccel` x the direction). */
  readonly stats: readonly { readonly stat: StatId; readonly op: 'add' | 'mul'; readonly amount: number }[];
  /** Wind only: the push in the air, in tiles per second squared. */
  readonly windAccel?: number;
}

export const COURSE_MOD_LIST: readonly CourseModDef[] = [
  { id: 'wind', name: 'Wind', desc: 'A steady wind pushes the ball while it is in the air', cost: 2, stats: [], windAccel: 1.5 },
  { id: 'lowGravity', name: 'Low gravity', desc: 'Gravity is 60% of normal: higher, longer shots', cost: 1, stats: [{ stat: 'gravity', op: 'mul', amount: 0.6 }] },
  { id: 'darkness', name: 'Darkness', desc: 'It is dark: the aim guide is half as long', cost: 2, stats: [{ stat: 'guideLength', op: 'mul', amount: 0.5 }] },
];

export const COURSE_MODS: ReadonlyMap<string, CourseModDef> = new Map(COURSE_MOD_LIST.map((m) => [m.id, m]));
