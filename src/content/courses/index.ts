/**
 * Hand-built courses. Generated courses (Milestone 5) use the same format but
 * are made at run time, so they are not listed here.
 */
import flatWalls from './flat-walls.json';
import slopesSurfaces from './slopes-surfaces.json';
import courseRules from './course-rules.json';
import enemiesAbilities from './enemies-abilities.json';
import { BENCH_ID, benchCourse } from './testBench.ts';

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
  { id: BENCH_ID, data: benchCourse('mossback') },
];
