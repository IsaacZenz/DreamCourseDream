/**
 * Hand-built courses, plus one slot for a generated course (Milestone 5). A
 * generated course uses the same format but is made at run time from a seed and
 * a budget, so its slot has no data here.
 */
import flatWalls from './flat-walls.json';
import slopesSurfaces from './slopes-surfaces.json';
import courseRules from './course-rules.json';
import enemiesAbilities from './enemies-abilities.json';
import { BENCH_ID, benchCourse } from './testBench.ts';
import arenaBug from './arena-bug.json';

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
  { id: BENCH_ID, data: benchCourse('mossback') },
  // A generated course (key 6): made by src/gen/ from the seed and budget.
  { id: GENERATED_ID, data: null },
];

/** Boss arenas (Milestone 7, sheet section 3): one for now; more to cycle through come in Milestone 8 (owner, 2026-11-16). */
export const ARENA_FILES: ReadonlyMap<string, unknown> = new Map([['arena-bug', arenaBug]]);
