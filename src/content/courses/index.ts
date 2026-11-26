/**
 * Hand-built courses, plus one slot for a generated course (Milestone 5). A
 * generated course uses the same format but is made at run time from a seed and
 * a budget, so its slot has no data here.
 */
import flatWalls from './flat-walls.json';
import slopesSurfaces from './slopes-surfaces.json';
import courseRules from './course-rules.json';
import enemiesAbilities from './enemies-abilities.json';
import walls from './walls.json';
import { BENCH_ID, benchCourse } from './testBench.ts';

export const GENERATED_ID = 'generated';

export interface CourseFile {
  readonly id: string;
  readonly data: unknown;
}

export const TEST_COURSES: readonly CourseFile[] = [
  { id: 'course-rules', data: courseRules },
  { id: 'flat-walls', data: flatWalls },
  { id: 'slopes-surfaces', data: slopesSurfaces },
  { id: 'enemies-abilities', data: enemiesAbilities },
  // The test bench: rebuilt by the game with the thing chosen in the tuning panel.
  { id: BENCH_ID, data: benchCourse('snoozegrub') },
  // A generated course (key 6): made by src/gen/ from the seed and budget.
  { id: GENERATED_ID, data: null },
  // Owner, 2026-11-26: organic wall textures, on walls of every height and on sloped tops (?course=walls).
  { id: 'walls', data: walls },
];
