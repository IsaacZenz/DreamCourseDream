/**
 * Generate a checked course (Milestone 5 design sheet, section 5.4): try,
 * check the structure, let the bot play it, and throw it away and try again
 * if anything fails. Each attempt has its own random stream made from the
 * seed and the attempt number, so the course you end up with is the same for
 * the same seed and budget. Generation time is measured by the caller (this
 * folder may not read the clock).
 */
import { GEN } from '../content/gen.ts';
import type { Tuning } from '../content/tuning.ts';
import { parseCourse, type Course } from '../sim/course.ts';
import { playBot, type BotResult } from './bot.ts';
import { generateAttempt, type GenMeta } from './generate.ts';
import { journeyRow } from './journey.ts';
import { checkStructure } from './structure.ts';

export interface GenResult {
  readonly seed: string;
  /** The budget asked for. */
  readonly budget: number;
  readonly course: Course;
  readonly raw: Record<string, unknown>;
  /** Null for the fallback course. */
  readonly meta: GenMeta | null;
  /** Attempt number that was accepted (1 = first try), counting the reduced-budget round. */
  readonly attempts: number;
  readonly rejections: Readonly<Record<string, number>>;
  readonly bot: BotResult | null;
  /** True when every attempt failed and the fixed safe course was used. */
  readonly fallback: boolean;
  /** One line for the log. */
  readonly summary: string;
}

export interface GenOptions {
  /** Skip the bot (structure check only). For quick previews and tests. */
  readonly noBot?: boolean;
  /** An extra check (tests): return a reason to reject the attempt, or null to accept it. */
  readonly extraCheck?: (course: Course, attempt: number) => string | null;
}

function describe(rej: Record<string, number>): string {
  const parts = Object.entries(rej).map(([r, n]) => `${r} ×${n}`);
  return parts.length ? ` (rejected: ${parts.join(', ')})` : '';
}

export function generateCourse(seed: string, budget: number, tuning: Tuning, opts: GenOptions = {}): GenResult {
  const rejections: Record<string, number> = {};
  const reject = (r: string) => (rejections[r] = (rejections[r] ?? 0) + 1);
  const rounds = [budget, Math.max(GEN.minBudget, Math.round(budget * GEN.fallbackBudgetShare))];
  let n = 0;
  for (const [round, b] of rounds.entries()) {
    for (let a = 0; a < GEN.attempts; a++) {
      n++;
      const r = generateAttempt(seed, b, round * GEN.attempts + a);
      if (!r.ok) {
        reject(r.reason);
        continue;
      }
      const st = checkStructure(r.course);
      if (!st.ok) {
        reject(st.reason);
        continue;
      }
      const extra = opts.extraCheck?.(r.course, n);
      if (extra) {
        reject(extra);
        continue;
      }
      const bot = opts.noBot ? null : playBot(r.course, tuning, seed, { maxShots: journeyRow(b).botShots });
      if (bot && !bot.passed) {
        reject(bot.reason);
        continue;
      }
      const botText = bot ? `, bot won in ${bot.shots} shots with ${bot.health} health` : '';
      const lower = round > 0 ? ` at reduced budget ${b}` : '';
      return {
        seed,
        budget,
        course: r.course,
        raw: r.raw,
        meta: r.meta,
        attempts: n,
        rejections,
        bot,
        fallback: false,
        summary: `Course #${seed} budget ${budget}: accepted on attempt ${n}${lower}${describe(rejections)}${botText}`,
      };
    }
  }
  const raw = fallbackCourse(seed, budget);
  const parsed = parseCourse(raw);
  if (!parsed.ok) throw new Error(`Fallback course is broken: ${parsed.errors.join('; ')}`);
  return {
    seed,
    budget,
    course: parsed.course,
    raw,
    meta: null,
    attempts: n,
    rejections,
    bot: null,
    fallback: true,
    summary: `WARNING: Course #${seed} budget ${budget}: every attempt failed${describe(rejections)}; using the fallback course`,
  };
}

/** The fixed safe course: a tee, a fairway and a green in a row, three Mossbacks. */
export function fallbackCourse(seed: string, budget: number): Record<string, unknown> {
  const row = (s: string) => s;
  const tiles = [
    row('r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1'),
    row('r1 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 r1'),
    row('r1 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 r1'),
    row('r1 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 g0 r1'),
    row('r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1 r1'),
  ];
  return {
    format: 2,
    name: `Generated #${seed} B${budget} (fallback)`,
    legend: { g: 'grass', r: 'rough' },
    tiles,
    start: [1, 2],
    exit: [13, 2],
    quota: 2,
    objects: [
      { id: 'mossback', at: [5, 2] },
      { id: 'mossback', at: [8, 1] },
      { id: 'mossback', at: [10, 3] },
    ],
  };
}
