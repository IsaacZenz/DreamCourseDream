/**
 * Plays every boss in each of its arenas with the headless bot, on 20 seeds
 * each, and prints the win rate (Milestone 7 sheet section 3: each arena must
 * be won at least half the time). Milestone 8: each boss is played at its own
 * region's health with that region's par kit (the course check's loadout).
 * Run: npm run arenas [seeds] [boss]
 */
import { readFileSync } from 'node:fs';
import { BOSSES, BOSS_IDS, bossHealthIn } from '../src/content/bosses.ts';
import { LAST_REGION } from '../src/content/run.ts';
import { regionDefFor } from '../src/sim/run.ts';
import { DEFAULT_TUNING } from '../src/content/tuning.ts';
import { playBot } from '../src/gen/bot.ts';
import { parseCourse } from '../src/sim/course.ts';
import type { Modifier } from '../src/sim/stats.ts';

// Node cannot import the arena list (it imports JSON), so the files are read here, with the boss put in as arenaData() does.
const arenaData = (arena: string, boss: string): Record<string, unknown> => {
  const data = JSON.parse(readFileSync(new URL(`../src/content/arenas/${arena}.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
  return { ...data, objects: (data.objects as { id: string }[]).map((o) => (BOSS_IDS.includes(o.id) ? { ...o, id: boss } : o)) };
};

const seeds = Number(process.argv[2] ?? 20);
const only = process.argv[3];
let allOk = true;
for (const boss of BOSS_IDS.filter((b) => !only || b === only)) {
  const def = BOSSES.get(boss)!;
  // Round 4 (owner, 2026-11-23): the centipede is checked by hand; the bot cannot lead a moving target yet.
  if (def.handChecked && only !== boss) {
    console.log(`${def.name.padEnd(46)} checked by hand (owner, 2026-11-23); name it to run the bot anyway`);
    continue;
  }
  const region = Math.max(1, Array.from({ length: LAST_REGION }, (_, i) => i + 1).find((r) => regionDefFor(r).bosses.includes(boss)) ?? 1);
  const rd = regionDefFor(region);
  const par: Modifier[] = rd.par.map((p) => ({ stat: p.stat, op: 'add', amount: p.amount, source: { kind: 'region', id: 'par' }, duration: { kind: 'run' } }));
  const toughness: Modifier[] = rd.toughness.map((t) => ({ stat: t.stat, op: 'add', amount: t.amount, source: { kind: 'region', id: 'tough' }, duration: { kind: 'forever' } }));
  for (const arena of def.arenas) {
    const parsed = parseCourse(arenaData(arena, boss));
    if (!parsed.ok) {
      console.log(`${def.name} in ${arena}: INVALID\n  ${parsed.errors.join('\n  ')}`);
      allOk = false;
      continue;
    }
    let wins = 0;
    let shots = 0;
    const t0 = performance.now();
    for (let i = 0; i < seeds; i++) {
      const r = playBot(parsed.course, DEFAULT_TUNING, `${arena}-${boss}-${i}`, { maxShots: 80, bossHealth: bossHealthIn(def, region), loadout: { modifiers: par, ...(rd.parGear && { gear: rd.parGear }) }, enemyModifiers: toughness });
      if (r.won) {
        wins++;
        shots += r.shots;
      }
    }
    const ok = wins * 2 >= seeds;
    allOk &&= ok;
    const name = `${def.name} (region ${region}) in ${arena}`;
    console.log(`${name.padEnd(46)} won ${wins}/${seeds}${wins ? `, ${Math.round(shots / wins)} shots on average` : ''}, ${Math.round((performance.now() - t0) / 1000)} s ${ok ? '' : ' <- below half'}`);
  }
}
process.exit(allOk ? 0 : 1);
