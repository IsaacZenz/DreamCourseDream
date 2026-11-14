/**
 * Hand-built courses. Generated courses (Milestone 5) use the same format but
 * are made at run time, so they are not listed here.
 */
import flatWalls from './flat-walls.json';
import slopesSurfaces from './slopes-surfaces.json';
import courseRules from './course-rules.json';

export interface CourseFile {
  readonly id: string;
  readonly data: unknown;
}

export const TEST_COURSES: readonly CourseFile[] = [
  { id: 'course-rules', data: courseRules },
  { id: 'flat-walls', data: flatWalls },
  { id: 'slopes-surfaces', data: slopesSurfaces },
];
