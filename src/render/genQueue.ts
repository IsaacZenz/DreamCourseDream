/**
 * Makes run courses ahead of time (owner, 2026-11-18, option B): while the
 * player is on the map, in a town, or playing a course, a background worker
 * makes the courses they can go to next, so the loading screen is mostly
 * skipped. One worker, one course at a time. A course the player is waiting
 * for jumps the queue; a background course in the way is stopped and tried
 * again later.
 *
 * The courses are the same ones the run would make anyway: same seed, budget,
 * size and bot loadout (the key below), so making them early changes nothing.
 */
import { generateCourse, type GenOptions, type GenResult } from '../gen/validate';
import type { CourseJob } from '../sim/run';
import { getTuning } from './shared';

export interface Made {
  readonly result: GenResult;
  readonly ms: number;
}

interface Job {
  readonly key: string;
  readonly seed: string;
  readonly budget: number;
  readonly opts: GenOptions;
}

/** Made courses are kept for this many keys (older ones are dropped). */
const KEEP = 12;

const made = new Map<string, Made>();
const waiting = new Map<string, ((m: Made) => void)[]>();
let queue: Job[] = [];
let busy: { job: Job; worker: Worker | null } | null = null;

/** The same course for the same seed, budget and options. */
export function jobKey(seed: string, budget: number, opts: unknown): string {
  return `${seed}|${budget}|${JSON.stringify(opts)}`;
}

function toJob(j: CourseJob): Job {
  return { key: jobKey(j.courseSeed, j.budget, j.opts), seed: j.courseSeed, budget: j.budget, opts: j.opts };
}

/** A course made already, if there is one. */
export function madeCourse(key: string): Made | null {
  return made.get(key) ?? null;
}

/** The player is waiting for this course: make it first, and call back when it is ready. */
export function want(seed: string, budget: number, opts: GenOptions, done: (m: Made) => void): void {
  const key = jobKey(seed, budget, opts);
  const ready = made.get(key);
  if (ready) {
    done(ready);
    return;
  }
  waiting.set(key, [...(waiting.get(key) ?? []), done]);
  if (busy?.job.key === key) return;
  const job: Job = { key, seed, budget, opts };
  queue = [job, ...queue.filter((j) => j.key !== key)];
  if (busy) {
    // Stop the background course in the way; it goes back in the queue.
    const stopped = busy.job;
    busy.worker?.terminate();
    busy = null;
    queue.splice(1, 0, stopped);
  }
  pump();
}

/** Courses the player may go to next, most likely first. Replaces the background queue. */
export function prefetch(jobs: readonly CourseJob[]): void {
  const keep = queue.filter((j) => waiting.has(j.key));
  const next = jobs.map(toJob).filter((j) => !made.has(j.key) && busy?.job.key !== j.key && !keep.some((k) => k.key === j.key));
  queue = [...keep, ...next];
  pump();
}

function finish(job: Job, m: Made): void {
  made.set(job.key, m);
  while (made.size > KEEP) made.delete(made.keys().next().value!);
  (m.result.fallback ? console.warn : console.info)(`${m.result.summary}, ${Math.round(m.ms)} ms${waiting.has(job.key) ? '' : ' (made ahead)'}`);
  const cbs = waiting.get(job.key) ?? [];
  waiting.delete(job.key);
  for (const cb of cbs) cb(m);
}

function pump(): void {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  try {
    const worker = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
    busy = { job, worker };
    worker.onmessage = (e: MessageEvent<Made>) => {
      worker.terminate();
      if (busy?.worker !== worker) return;
      busy = null;
      finish(job, e.data);
      pump();
    };
    worker.postMessage({ seed: job.seed, budget: job.budget, tuning: getTuning(), opts: job.opts });
  } catch {
    // No workers: make it here, a moment later so the loading screen can show.
    busy = { job, worker: null };
    setTimeout(() => {
      const t0 = performance.now();
      const result = generateCourse(job.seed, job.budget, getTuning(), job.opts);
      busy = null;
      finish(job, { result, ms: performance.now() - t0 });
      pump();
    }, 50);
  }
}
