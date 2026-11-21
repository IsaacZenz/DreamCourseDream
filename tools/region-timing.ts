/**
 * How long a region's courses take to make, with the course check's bot
 * (Milestone 7 sheet section 7.4; Milestone 8 sheet section 10: measure region
 * three and report). For each region, a first course, after 3 and after 6
 * counted nodes, normal and hard, over a few seeds.
 *
 *   node tools/region-timing.ts [seeds] [regions, e.g. 3 or 2,3,4]
 */
import { DEFAULT_TUNING } from '../src/content/tuning.ts';
import { generateRunMap } from '../src/gen/runMap.ts';
import { generateCourse } from '../src/gen/validate.ts';
import { budgetFor, createRun, genOptionsFor } from '../src/sim/run.ts';

const seeds = Number(process.argv[2] ?? 6);
const regions = (process.argv[3] ?? '1,2,3').split(',').map(Number);
for (const region of regions) {
  for (const counted of [0, 3, 6]) {
    for (const type of ['course', 'hard'] as const) {
      if (counted === 0 && type === 'hard') continue;
      const times: number[] = [];
      let fallbacks = 0;
      let ranks = 0;
      let enemies = 0;
      for (let i = 0; i < seeds; i++) {
        const run = createRun(`T${i}`, generateRunMap(`T${i}`));
        run.region = region;
        run.counted = counted;
        const t0 = performance.now();
        const r = generateCourse(`T${i}-${region}-${counted}-${type}`, budgetFor(run, type), DEFAULT_TUNING, genOptionsFor(run, type));
        times.push(performance.now() - t0);
        if (r.fallback) fallbacks++;
        for (const o of r.course.objects) if (o.extras.rank) ranks++;
        enemies += r.course.objects.filter((o) => o.extras && (o.extras.rank || o.extras.traits.length || o.extras.element)).length;
      }
      const avg = times.reduce((a, b) => a + b, 0) / times.length / 1000;
      const max = Math.max(...times) / 1000;
      console.log(
        `region ${region}, after ${counted} nodes, ${type.padEnd(6)} average ${avg.toFixed(1)} s, slowest ${max.toFixed(1)} s, fell back ${fallbacks} of ${seeds}; dressed enemies ${enemies}, ranked ${ranks}`,
      );
    }
  }
}
