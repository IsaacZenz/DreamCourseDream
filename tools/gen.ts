/**
 * Print one generated course (Milestone 5 design sheet, section 6.3).
 *
 *   npm run gen -- ABC123 12
 *
 * Shows the course as text, whether it passed, and the generator's log line.
 */
import { DEFAULT_TUNING } from '../src/content/tuning.ts';
import { GEN } from '../src/content/gen.ts';
import { generateCourse } from '../src/gen/validate.ts';

const seed = (process.argv[2] ?? 'ABC123').toUpperCase();
const budget = Number(process.argv[3] ?? GEN.defaultBudget);
const t0 = performance.now();
const r = generateCourse(seed, budget, DEFAULT_TUNING);
const ms = performance.now() - t0;

const legend = r.raw.legend as Record<string, string | { surface: string; dir: string }>;
const objects = r.raw.objects as { id: string; at: [number, number] }[];
const at = new Map(objects.map((o) => [`${o.at[0]},${o.at[1]}`, o.id]));
const [sx, sy] = r.raw.start as [number, number];
const [ex, ey] = r.raw.exit as [number, number];
const MARK: Record<string, string> = { grass: ' ', rough: ':', sand: 's', ice: 'i', water: '~' };
const rows = (r.raw.tiles as string[]).map((row, y) =>
  row
    .split(' ')
    .map((tok, x) => {
      if (x === sx && y === sy) return ' @';
      if (x === ex && y === ey) return ' #';
      const o = at.get(`${x},${y}`);
      if (o) return ' ' + o[0]!.toUpperCase();
      if (tok === '.') return '  ';
      const l = legend[tok[0]!];
      const surface = typeof l === 'string' ? l : (l?.surface ?? '?');
      return (MARK[surface] ?? '!') + (tok.length === 2 ? tok[1] : '/');
    })
    .join(''),
);
console.log(rows.join('\n'));
console.log('\n@ start, # exit, letters are objects (first letter of the id), ":" rough, "s" sand, "i" ice, "~" water, "!" hazard, digits height, "/" slope.');
console.log(`Objects: ${objects.map((o) => o.id).join(', ')}`);
console.log(`Quota ${r.course.quota}. ${r.fallback ? 'FAIL (fallback course)' : 'PASS'}`);
console.log(`${r.summary}, ${Math.round(ms)} ms`);
