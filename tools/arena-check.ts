/**
 * Plays every boss arena with the headless bot and a fresh ball, on 20 seeds
 * each, and prints the win rate (Milestone 7 sheet section 3: each arena must
 * be won at least half the time). Run: npm run arenas
 */
import { readFileSync, readdirSync } from 'node:fs';
import { DEFAULT_TUNING } from '../src/content/tuning.ts';
import { playBot } from '../src/gen/bot.ts';
import { parseCourse } from '../src/sim/course.ts';

const dir = new URL('../src/content/arenas/', import.meta.url);
const seeds = Number(process.argv[2] ?? 20);
let allOk = true;
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const parsed = parseCourse(JSON.parse(readFileSync(new URL(file, dir), 'utf8')));
  if (!parsed.ok) {
    console.log(`${file}: INVALID\n  ${parsed.errors.join('\n  ')}`);
    allOk = false;
    continue;
  }
  let wins = 0;
  let shots = 0;
  const t0 = performance.now();
  for (let i = 0; i < seeds; i++) {
    const r = playBot(parsed.course, DEFAULT_TUNING, `${file}-${i}`, { maxShots: 80, bossHealth: 12 });
    if (r.won) {
      wins++;
      shots += r.shots;
    }
  }
  const ok = wins * 2 >= seeds;
  allOk &&= ok;
  console.log(`${file.padEnd(20)} won ${wins}/${seeds}${wins ? `, ${Math.round(shots / wins)} shots on average` : ''}, ${Math.round((performance.now() - t0) / 1000)} s ${ok ? '' : ' <- below half'}`);
}
process.exit(allOk ? 0 : 1);
