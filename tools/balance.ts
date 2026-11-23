/**
 * The balance pass (Milestone 8 round 3 sheet section 5; owner sign-off
 * 2026-11-22). Makes and plays many courses per region with the course
 * check's bot and writes docs/plans/balance-report.md.
 *
 * For each region and point in it (first course; after 3 and after 6 counted
 * nodes; normal and hard courses) it makes `seeds` courses with the real
 * generator, as a run would, and records:
 *
 * - how often the bot (the region's par kit, full health) beats a freshly made
 *   course on the first try: the generator throws away courses the bot loses,
 *   so the share it keeps is the honest win rate;
 * - shots, health lost and yellow stars on the courses kept;
 * - the same course played by a "starter" bot: Rollo with no par kit, no gear
 *   and full health, to show how much upgrades matter;
 * - boss fights: each region's boss in its arenas, at the region's boss health.
 *
 *   npm run balance [seeds] [workers]
 *
 * Everything is seeded: the same command gives the same report.
 */
import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { DEFAULT_TUNING } from '../src/content/tuning.ts';
import { BOSSES, BOSS_IDS, bossHealthIn } from '../src/content/bosses.ts';
import { REGIONS, RUN } from '../src/content/run.ts';
import { RARITY_INFO } from '../src/content/gear.ts';
import { BLUE_STARS } from '../src/content/progress.ts';
import { FOOD } from '../src/content/consumables.ts';
import { generateRunMap } from '../src/gen/runMap.ts';
import { generateCourse } from '../src/gen/validate.ts';
import { playBot } from '../src/gen/bot.ts';
import { parseCourse } from '../src/sim/course.ts';
import { budgetFor, createRun, enemyModifiersFor, genOptionsFor, rewardFor, botLoadoutOf, type RunState } from '../src/sim/run.ts';

type CourseType = 'course' | 'hard';

interface Job {
  readonly kind: 'course' | 'boss';
  readonly region: number;
  readonly counted: number;
  readonly type: CourseType | 'boss';
  readonly seed: string;
  readonly boss?: string;
  readonly arena?: string;
}

interface Row {
  readonly job: Job;
  /** Bot plays on freshly made courses (accepted one included) and how many it lost. */
  readonly botPlays: number;
  readonly botLosses: number;
  readonly fallback: boolean;
  readonly shots: number;
  readonly shotLimit: number;
  readonly healthLost: number;
  readonly stars: number;
  readonly starterWon: boolean;
  readonly starterHealthLost: number;
  readonly seconds: number;
}

const REGION_IDS = [1, 2, 3];
const POINTS: readonly { counted: number; type: CourseType }[] = [
  { counted: 0, type: 'course' },
  { counted: 3, type: 'course' },
  { counted: 3, type: 'hard' },
  { counted: 6, type: 'course' },
  { counted: 6, type: 'hard' },
];

function runAt(seed: string, region: number, counted: number): RunState {
  const run = createRun(seed, generateRunMap(seed));
  run.region = region;
  run.counted = counted;
  return run;
}

// Node cannot import the arena list (it imports JSON), so the files are read here, with the boss put in as arenaData() does.
function arenaCourse(arena: string, boss: string) {
  const data = JSON.parse(readFileSync(new URL(`../src/content/arenas/${arena}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
  const parsed = parseCourse({ ...data, objects: (data.objects as { id: string }[]).map((o) => (BOSS_IDS.includes(o.id) ? { ...o, id: boss } : o)) });
  if (!parsed.ok) throw new Error(`arena ${arena}: ${parsed.errors.join('; ')}`);
  return parsed.course;
}

function doJob(job: Job): Row {
  const t0 = performance.now();
  const T = DEFAULT_TUNING;
  if (job.kind === 'boss') {
    const run = runAt(job.seed, job.region, 7);
    const def = BOSSES.get(job.boss!)!;
    const course = arenaCourse(job.arena!, job.boss!);
    const hints = { maxShots: 80, bossHealth: bossHealthIn(def, job.region), enemyModifiers: enemyModifiersFor(run) };
    const par = playBot(course, T, job.seed, { ...hints, loadout: botLoadoutOf(run, null) });
    const starter = playBot(course, T, job.seed, hints);
    return {
      job,
      botPlays: 1,
      botLosses: par.won ? 0 : 1,
      fallback: false,
      shots: par.shots,
      shotLimit: 80,
      healthLost: par.maxHealth - par.health,
      stars: par.stars,
      starterWon: starter.won,
      starterHealthLost: starter.maxHealth - starter.health,
      seconds: (performance.now() - t0) / 1000,
    };
  }
  const run = runAt(job.seed, job.region, job.counted);
  const type = job.type as CourseType;
  const opts = genOptionsFor(run, type, null);
  const g = generateCourse(job.seed, budgetFor(run, type), T, opts);
  const botLosses = Object.entries(g.rejections)
    .filter(([why]) => why.startsWith('bot'))
    .reduce((n, [, k]) => n + k, 0);
  const shotLimit = Math.round(opts.size.botShots * 1.5);
  const starter = g.bot ? playBot(g.course, T, job.seed, { maxShots: shotLimit, enemyModifiers: opts.enemyModifiers }) : null;
  return {
    job,
    botPlays: botLosses + (g.bot ? 1 : 0),
    botLosses,
    fallback: g.fallback,
    shots: g.bot?.shots ?? 0,
    shotLimit,
    healthLost: g.bot ? g.bot.maxHealth - g.bot.health : 0,
    stars: g.bot?.stars ?? 0,
    starterWon: starter?.won ?? false,
    starterHealthLost: starter ? starter.maxHealth - starter.health : 0,
    seconds: (performance.now() - t0) / 1000,
  };
}

async function main(): Promise<void> {
  const seeds = Number(process.argv[2] ?? 30);
  const workers = Math.max(1, Number(process.argv[3] ?? Math.min(4, cpus().length)));
  const jobs: Job[] = [];
  for (const region of REGION_IDS) {
    for (const p of POINTS) for (let i = 0; i < seeds; i++) jobs.push({ kind: 'course', region, counted: p.counted, type: p.type, seed: `BAL${region}${p.type[0]}${p.counted}-${i}` });
    // Boss fights: the region's bosses, spread over their arenas.
    for (const boss of REGIONS[region - 1]!.bosses) {
      const arenas = BOSSES.get(boss)!.arenas;
      for (let i = 0; i < seeds; i++) jobs.push({ kind: 'boss', region, counted: 7, type: 'boss', seed: `BALB${region}-${i}`, boss, arena: arenas[i % arenas.length]! });
    }
  }
  // Deal the jobs out round-robin so each worker gets a mix of quick and slow ones.
  const parts: Job[][] = Array.from({ length: workers }, () => []);
  jobs.forEach((j, i) => parts[i % workers]!.push(j));
  const rows: Row[] = [];
  const t0 = performance.now();
  let done = 0;
  await Promise.all(
    parts.map(
      (part) =>
        new Promise<void>((resolve, reject) => {
          const w = new Worker(new URL(import.meta.url), { workerData: part });
          w.on('message', (r: Row) => {
            rows.push(r);
            done++;
            if (done % 25 === 0) console.log(`${done}/${jobs.length} done, ${Math.round((performance.now() - t0) / 1000)} s`);
          });
          w.on('error', reject);
          w.on('exit', () => resolve());
        }),
    ),
  );
  const report = writeReport(rows, seeds, (performance.now() - t0) / 1000);
  writeFileSync(new URL('../docs/plans/balance-report.md', import.meta.url), report);
  console.log(report);
}

// ---------------------------------------------------------------------------
// The report

const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : '-');
const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const f1 = (x: number) => x.toFixed(1);

function writeReport(rows: readonly Row[], seeds: number, seconds: number): string {
  const out: string[] = [];
  const line = (s = '') => out.push(s);
  line('# Balance report (Milestone 8 round 3)');
  line();
  line(`Made by \`npm run balance ${seeds}\`: ${rows.length} courses and boss fights, ${Math.round(seconds / 60)} minutes. Everything is seeded, so running it again gives the same numbers.`);
  line();
  line('**How to read it.** "Par bot" is the course check\'s bot with the region\'s par kit (the upgrades and gear a player is expected to have by then), at full health. "First-try win" is how often it beats a freshly made course: the generator throws away courses it loses, so this is its honest win rate. "Starter bot" plays the kept courses as Rollo with nothing: no par kit, no gear. Health lost and shots are on the courses kept.');
  line();
  line('## Courses');
  line();
  line('| Region | Point | Par bot first-try win | Shots (limit) | Health lost | Stars on course | + finish reward | Starter bot wins | Starter health lost | Fallback courses | Seconds each |');
  line('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const region of REGION_IDS) {
    for (const p of POINTS) {
      const rs = rows.filter((r) => r.job.kind === 'course' && r.job.region === region && r.job.counted === p.counted && r.job.type === p.type);
      const kept = rs.filter((r) => !r.fallback);
      const plays = rs.reduce((n, r) => n + r.botPlays, 0);
      const losses = rs.reduce((n, r) => n + r.botLosses, 0);
      line(
        `| ${region} | ${p.type === 'hard' ? 'hard' : 'course'}, after ${p.counted} | ${pct(plays - losses, plays)} | ${f1(avg(kept.map((r) => r.shots)))} (${kept[0]?.shotLimit ?? '-'}) | ${f1(avg(kept.map((r) => r.healthLost)))} | ${f1(avg(kept.map((r) => r.stars)))} | +${rewardFor(p.type)} | ${pct(kept.filter((r) => r.starterWon).length, kept.length)} | ${f1(avg(kept.filter((r) => r.starterWon).map((r) => r.starterHealthLost)))} | ${rs.filter((r) => r.fallback).length} | ${f1(avg(rs.map((r) => r.seconds)))} |`,
      );
    }
  }
  line();
  line('## Boss fights');
  line();
  line('| Region | Boss | Par bot wins | Shots | Health lost | Starter bot wins |');
  line('|---|---|---|---|---|---|');
  for (const region of REGION_IDS) {
    for (const boss of REGIONS[region - 1]!.bosses) {
      const rs = rows.filter((r) => r.job.kind === 'boss' && r.job.region === region && r.job.boss === boss);
      const won = rs.filter((r) => r.botLosses === 0);
      line(`| ${region} | ${BOSSES.get(boss)!.name} | ${pct(won.length, rs.length)} | ${f1(avg(won.map((r) => r.shots)))} | ${f1(avg(won.map((r) => r.healthLost)))} | ${pct(rs.filter((r) => r.starterWon).length, rs.length)} |`);
    }
  }
  line();
  line('## The economy');
  line();
  line('Yellow stars from a course are the stars the bot collected plus the finish reward. A town usually comes after about 3 counted nodes. Prices are before Haggler and Lucky gear.');
  line();
  line('| Region | Stars per normal course | Stars per hard course | About 3 courses (2 normal, 1 hard) | Blue stars per region (6 courses, 1 hard, the boss) |');
  line('|---|---|---|---|---|');
  for (const region of REGION_IDS) {
    const per = (type: CourseType) => avg(rows.filter((r) => r.job.kind === 'course' && r.job.region === region && r.job.type === type && !r.fallback).map((r) => r.stars)) + rewardFor(type);
    const three = 2 * per('course') + per('hard');
    const blue = 6 * BLUE_STARS.course + BLUE_STARS.hard + (BLUE_STARS.boss[region - 1] ?? BLUE_STARS.boss[BLUE_STARS.boss.length - 1]!);
    line(`| ${region} | ${f1(per('course'))} | ${f1(per('hard'))} | ${Math.round(three)} | about ${blue} |`);
  }
  line();
  line(`Gear prices: common ${RARITY_INFO.common.price}, uncommon ${RARITY_INFO.uncommon.price}, rare ${RARITY_INFO.rare.price}, double rare ${RARITY_INFO.doubleRare.price}, special rare ${RARITY_INFO.specialRare.price}, legendary ${RARITY_INFO.legendary.price}. Grab Bag ${RUN.shop.grabBag.price}. Food: ${FOOD.statPrice} for one course of a stat food (+${FOOD.statPricePerRegion} per region). Blue-star prices: second pockets 17 each, characters 21 each, Vitality and Stamina 5 to 20 a level.`);
  line();
  line('## Targets (owner-approved, round 3 sheet section 5.2)');
  line();
  line('| Measure | Region 1 | Region 2 | Region 3 |');
  line('|---|---|---|---|');
  line('| ~~Bot wins a course on the first try~~ (dropped by the owner, 2026-11-23: it measures the bot, not the player) | - | - | - |');
  line('| Health lost per course, on average | 0.5 to 1 | 1 to 1.5 | 1.5 to 2.5 |');
  line('| Shots per course, on average | well under the limit | under the limit | close to the limit on late and hard courses |');
  line('| Stars on reaching a town | enough for 2 common or uncommon items | about 1 rare item | about 1 double rare item |');
  line('| Boss fight: bot wins | 90% or more | 85% or more | 80% or more |');
  line();
  line('## Proposed changes');
  line();
  line('_Written by hand after reading the tables above. Nothing here changes until the owner approves it._');
  line();
  return out.join('\n');
}

if (!isMainThread) {
  for (const j of workerData as Job[]) parentPort!.postMessage(doJob(j));
} else {
  await main();
}
