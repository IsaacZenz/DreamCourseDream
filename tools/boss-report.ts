/**
 * The boss combination report (Milestone 7 design sheet, section 2.8; owner
 * 2026-11-16: every combination is tested by the bot, and the ones it cannot
 * beat are listed for the owner to review before any is banned).
 *
 *   npm run boss:report              every built combination, 10 seeds, three loadouts
 *   npm run boss:report -- 4         4 seeds each (quicker)
 *
 * Three loadouts: base stats; a typical region-one loadout (two run upgrades
 * and a common weapon); and the region-two version of the boss with that
 * loadout. Runs in four processes. Writes docs/reports/boss-combinations.md.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CHARACTERS, DEFAULT_CHARACTER } from '../src/content/characters.ts';
import { comboId } from '../src/content/bosses.ts';
import { DEFAULT_TUNING } from '../src/content/tuning.ts';
import { UPGRADES } from '../src/content/run.ts';
import { allBuiltCombos, arenaFor } from '../src/gen/boss.ts';
import { playBot } from '../src/gen/bot.ts';
import type { Loadout } from '../src/sim/play.ts';
import type { Modifier } from '../src/sim/stats.ts';

const SEEDS = Number(process.argv[2] ?? 10);
const PART = process.argv[3]; // "k/n" when run as a worker process
const OUT_DIR = new URL('./out/', import.meta.url);
/** Below this win rate a combination is listed for the owner. */
const REVIEW_BELOW = 0.2;
/** A boss fight may take this many shots before the bot gives up. */
const MAX_SHOTS = 60;

const up = (id: string): Modifier => {
  const u = UPGRADES.get(id)!;
  return { stat: u.stat, op: u.op, amount: u.amount, source: { kind: 'run', id }, duration: { kind: 'run' } };
};
const REGION_ONE: Loadout = { gear: { weapon: 'studded-shell', armour: null, bauble: null }, modifiers: [up('deep-breath'), up('tough-shell')] };
const SETUPS = [
  { id: 'base', name: 'Base stats', region: 1, loadout: undefined as Loadout | undefined },
  { id: 'r1', name: 'Region-one loadout', region: 1, loadout: REGION_ONE },
  { id: 'r2', name: 'Region-two boss', region: 2, loadout: REGION_ONE },
] as const;

interface Cell {
  combo: string;
  setup: string;
  wins: number;
  fights: number;
  healthLost: number;
  shots: number;
}

function runPart(k: number, n: number): Cell[] {
  const arena = arenaFor('REPORT', 1);
  const cells: Cell[] = [];
  const combos = allBuiltCombos(1);
  const maxHealth = (lo?: Loadout) => (CHARACTERS.get(DEFAULT_CHARACTER)!.stats.maxHealth ?? 5) + (lo?.modifiers?.filter((m) => m.stat === 'maxHealth').reduce((a, m) => a + m.amount, 0) ?? 0);
  combos.forEach((c, i) => {
    if (i % n !== k) return;
    for (const s of SETUPS) {
      const cell: Cell = { combo: comboId(c.bug, c.colour, c.skill), setup: s.id, wins: 0, fights: 0, healthLost: 0, shots: 0 };
      for (let seed = 0; seed < SEEDS; seed++) {
        const r = playBot(arena, DEFAULT_TUNING, `R${seed}`, { boss: { ...c, region: s.region }, maxShots: MAX_SHOTS, ...(s.loadout && { loadout: s.loadout }) });
        cell.fights++;
        if (r.won) cell.wins++;
        cell.healthLost += Math.max(0, maxHealth(s.loadout) - r.health);
        cell.shots += r.shots;
      }
      cells.push(cell);
    }
  });
  return cells;
}

if (PART) {
  const [k, n] = PART.split('/').map(Number) as [number, number];
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(new URL(`boss-part-${k}.json`, OUT_DIR), JSON.stringify(runPart(k, n)));
} else {
  const N = 4;
  const t0 = performance.now();
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: N }, (_, k) => new Promise<void>((res, rej) => {
      const p = spawn(process.execPath, [self, String(SEEDS), `${k}/${N}`], { stdio: 'inherit' });
      p.on('exit', (code) => (code === 0 ? res() : rej(new Error(`part ${k} failed`))));
    })),
  );
  const cells: Cell[] = [];
  for (let k = 0; k < N; k++) cells.push(...(JSON.parse(readFileSync(new URL(`boss-part-${k}.json`, OUT_DIR), 'utf8')) as Cell[]));
  const combos = allBuiltCombos(1).map((c) => comboId(c.bug, c.colour, c.skill));
  const get = (combo: string, setup: string) => cells.find((c) => c.combo === combo && c.setup === setup)!;
  const pct = (c: Cell) => `${Math.round((100 * c.wins) / c.fights)}%`;
  const lines: string[] = [];
  lines.push('# Boss combination report', '');
  lines.push(`Made by \`npm run boss:report\` (tools/boss-report.ts) on ${new Date().toISOString().slice(0, 10)}. ${SEEDS} seeds per combination and setup; the bot may take up to ${MAX_SHOTS} shots.`, '');
  lines.push('The bot is a floor, not a clever player: it never uses abilities, the bounce boost or perfect shots, and it does not dodge marks on purpose. A low win rate means "worth a look", not "unbeatable".', '');
  lines.push('Setups: **base** = a fresh character; **r1** = a typical region-one loadout (Studded Shell, Deep Breath, Tough Shell); **r2** = the region-two version of the boss (1.5 times the health, one more helper) with that loadout.', '');
  const review = combos.filter((c) => SETUPS.some((s) => { const x = get(c, s.id); return x.wins / x.fights < REVIEW_BELOW; }));
  lines.push(`## For the owner to review (${review.length})`, '');
  lines.push(`Combinations the bot beat less than ${REVIEW_BELOW * 100}% of the time in at least one setup. Owner, 2026-11-16: nothing is banned without your say. For each one: tune it, ban it, or keep it.`, '');
  if (!review.length) lines.push('None.', '');
  else {
    lines.push('| Combination | Base | r1 | r2 | Your decision |', '|---|---|---|---|---|');
    for (const c of review) lines.push(`| ${c} | ${pct(get(c, 'base'))} | ${pct(get(c, 'r1'))} | ${pct(get(c, 'r2'))} | |`);
    lines.push('');
  }
  lines.push('## Every combination', '');
  lines.push('Win rate, then average health lost and average shots per fight.', '');
  lines.push('| Combination | Base | r1 | r2 |', '|---|---|---|---|');
  const fmt = (c: Cell) => `${pct(c)} (−${(c.healthLost / c.fights).toFixed(1)} hp, ${(c.shots / c.fights).toFixed(0)} shots)`;
  for (const c of combos) lines.push(`| ${c} | ${fmt(get(c, 'base'))} | ${fmt(get(c, 'r1'))} | ${fmt(get(c, 'r2'))} |`);
  lines.push('');
  const total = (setup: string) => { const xs = cells.filter((c) => c.setup === setup); return `${Math.round((100 * xs.reduce((a, c) => a + c.wins, 0)) / xs.reduce((a, c) => a + c.fights, 0))}%`; };
  lines.push(`Overall win rate: base ${total('base')}, r1 ${total('r1')}, r2 ${total('r2')}. Took ${Math.round((performance.now() - t0) / 1000)} s.`, '');
  mkdirSync(new URL('../docs/reports/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../docs/reports/boss-combinations.md', import.meta.url), lines.join('\n'));
  console.log(`Wrote docs/reports/boss-combinations.md. ${review.length} combinations to review.`);
}
