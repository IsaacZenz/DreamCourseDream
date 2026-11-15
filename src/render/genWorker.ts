/**
 * Makes a generated course in a background thread (Milestone 5b), so the
 * loading screen keeps animating while the generator and its bot work.
 * The generator itself is plain simulation code in src/gen/.
 */
import type { Tuning } from '../content/tuning';
import { generateCourse } from '../gen/validate';

self.onmessage = (e: MessageEvent<{ seed: string; budget: number; tuning: Tuning }>) => {
  const { seed, budget, tuning } = e.data;
  const t0 = performance.now();
  const result = generateCourse(seed, budget, tuning);
  self.postMessage({ result, ms: performance.now() - t0 });
};
