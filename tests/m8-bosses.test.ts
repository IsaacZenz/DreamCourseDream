/**
 * Milestone 8 round 1: Gloamhorn, the Brood Queen, region three, the end of a
 * run and endless mode, and the new shop prices (design sheet
 * docs/plans/milestone-8.md sections 8 to 10d).
 */
import { describe, expect, it } from 'vitest';
import { ARENAS, arenaData } from '../src/content/arenas';
import { BOSSES, bossHealthIn } from '../src/content/bosses';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { generateRunMap } from '../src/gen/runMap';
import { parseCourse } from '../src/sim/course';
import { canShoot, createPlay, drainLog, runShot, takeShot, tick, type PlayEvent, type PlayState } from '../src/sim/play';
import { bossBlueStars, bossHealthFor, bossOf, createRun, enterNode, finishCourse, isEndless, keepGoing, priceOf, regionDefFor, startRegion, takeBossReward, type RunState } from '../src/sim/run';
import type { ShotCommand } from '../src/sim/ball';

const T = DEFAULT_TUNING;
const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });

/** A flat walled field with one boss in the middle. */
function bossField(boss: string, w = 12, h = 7): PlayState {
  const rows: string[] = [];
  for (let y = 0; y < h + 2; y++) {
    const row: string[] = [];
    for (let x = 0; x < w + 2; x++) row.push(x === 0 || y === 0 || x === w + 1 || y === h + 1 ? 'g5' : 'g1');
    rows.push(row.join(' '));
  }
  const cx = Math.floor((w + 2) / 2);
  const cy = Math.floor((h + 2) / 2);
  const r = parseCourse({ format: 3, name: 'boss field', legend: { g: 'grass' }, tiles: rows, start: [2, cy], exit: [w, 1], quota: 0, objects: [{ id: boss, at: [cx, cy] }] });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return createPlay(r.course, T, { seed: `bf-${boss}`, bossHealth: 10 });
}

function fire(p: PlayState, cmd: ShotCommand): PlayEvent[] {
  takeShot(p, cmd);
  runShot(p);
  return drainLog(p);
}

describe('Gloamhorn (sheet section 8)', () => {
  it('its closed shell blocks every hit', () => {
    const p = bossField('gloamhorn');
    const log = fire(p, shot({ power: 0.6 }));
    expect(log.some((e) => e.kind === 'hit' && e.blocked)).toBe(true);
    expect(p.enemies[0]!.health).toBe(10);
  });
  it('winds up one turn and charges the next; then its shell is open for the next shot', () => {
    const p = bossField('gloamhorn');
    const all: PlayEvent[] = [];
    all.push(...fire(p, shot({ power: 0.05, angle: Math.PI })));
    expect(all.some((e) => e.kind === 'windup')).toBe(true);
    all.push(...fire(p, shot({ power: 0.05, angle: Math.PI / 2 })));
    expect(all.some((e) => e.kind === 'charge')).toBe(true);
    expect(all.some((e) => e.kind === 'shellOpen')).toBe(true);
    const g = p.enemies[0]!;
    expect(g.shellOpenShot).toBe(p.shotNumber + 1);
  });
  it('its charge hurts a ball on the ground in its way', () => {
    const p = bossField('gloamhorn');
    const h = p.health;
    let log: PlayEvent[] = [];
    for (let i = 0; i < 4 && p.status === 'playing'; i++) log = log.concat(fire(p, shot({ power: 0.02 })));
    expect(log.some((e) => e.kind === 'damage' && e.cause === 'charge')).toBe(true);
    expect(p.health).toBeLessThan(h);
  });
});

describe('the Brood Queen (sheet section 9, owner 2026-11-19)', () => {
  it('a ball rolling into her side is bitten and does no damage', () => {
    const p = bossField('brood-queen');
    const h = p.health;
    const log = fire(p, shot({ power: 0.6 }));
    expect(log.some((e) => e.kind === 'damage' && e.cause === 'bite')).toBe(true);
    expect(p.health).toBe(h - 1);
    expect(p.enemies[0]!.health).toBe(10);
  });
  it('a ball coming down on her from above hurts her', () => {
    const p = bossField('brood-queen');
    // Lob onto her back: try a few lofted powers until one lands a hit.
    let hit = false;
    for (const power of [0.45, 0.5, 0.55, 0.6, 0.4, 0.65, 0.35]) {
      const q = bossField('brood-queen');
      const log = fire(q, shot({ type: 'lofted', power }));
      if (log.some((e) => e.kind === 'hit' && e.damage > 0)) {
        hit = true;
        break;
      }
    }
    expect(hit).toBe(true);
    void p;
  });
  it('lobs three acid globs, marked a turn ahead, in her first phase', () => {
    const p = bossField('brood-queen');
    const log = fire(p, shot({ power: 0.05, angle: Math.PI }));
    expect(log.filter((e) => e.kind === 'lobMark').length).toBe(3);
  });
  it("the Queen's Mound has springs and her in the middle", () => {
    const r = parseCourse(arenaData('queens-mound', 'brood-queen'));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.course.tiles.filter((t) => t?.surface === 'spring').length).toBe(4);
      expect(r.course.objects.some((o) => o.id === 'brood-queen')).toBe(true);
    }
  });
});

describe('arenas take any boss', () => {
  it('every boss can stand in each of its arenas', () => {
    for (const [id, def] of BOSSES) {
      for (const a of def.arenas) {
        expect(ARENAS.has(a)).toBe(true);
        const r = parseCourse(arenaData(a, id));
        expect(r.ok && r.course.objects.some((o) => o.id === id)).toBe(true);
      }
    }
  });
});

/** Win the boss of the run's current region. */
function beatBoss(run: RunState): void {
  run.countdown = 0;
  run.lastTownVisited = true;
  run.status = 'map';
  enterNode(run, 'boss');
  finishCourse(run, { won: true, lostBy: null, health: run.health, wallet: run.wallet, ability: null, gear: run.gear });
}

describe('four regions, then endless mode (owner, 2026-11-18; round 4, 2026-11-23)', () => {
  it('the Stagwarden, Gloamhorn, the Brood Queen, then the centipede; beating the centipede wins the run', () => {
    const run = createRun('E', generateRunMap('E'));
    expect(bossOf(run)).toBe('stagwarden');
    beatBoss(run);
    takeBossReward(run, null, generateRunMap('E', 2));
    expect(bossOf(run)).toBe('gloamhorn');
    expect(bossHealthFor(run)).toBe(11);
    beatBoss(run);
    takeBossReward(run, null, generateRunMap('E', 3));
    expect(bossOf(run)).toBe('brood-queen');
    expect(bossHealthFor(run)).toBe(26);
    beatBoss(run);
    // Round 4: the Brood Queen is no longer the end.
    expect(run.status).toBe('reward');
    expect(run.beatFinal).toBe(false);
    takeBossReward(run, null, generateRunMap('E', 4));
    expect(run.region).toBe(4);
    expect(isEndless(run)).toBe(false);
    expect(bossOf(run)).toBe('centipede');
    expect(bossHealthFor(run)).toBe(32);
    beatBoss(run);
    expect(run.status).toBe('won');
    expect(run.beatFinal).toBe(true);
    expect(run.bossesBeaten).toEqual(['stagwarden', 'gloamhorn', 'brood-queen', 'centipede']);
  });
  it('Keep going: the boss reward, then region five, with a boss that is not the one just beaten', () => {
    const run = createRun('E2', generateRunMap('E2'));
    startRegion(run, 4, generateRunMap('E2', 4));
    beatBoss(run);
    expect(keepGoing(run)).toBe(true);
    expect(run.status).toBe('reward');
    takeBossReward(run, 0, generateRunMap('E2', 5));
    expect(run.region).toBe(5);
    expect(isEndless(run)).toBe(true);
    expect(bossOf(run)).not.toBe('centipede');
  });
  it('regions 4 and on grow every dial except course size; the numbers are what they were before round 4', () => {
    const r3 = regionDefFor(3);
    const r4 = regionDefFor(4);
    const r6 = regionDefFor(6);
    expect(r4.threat).toEqual({ start: 38, perNode: 3, cap: 72 });
    expect(r6.threat).toEqual({ start: 58, perNode: 3, cap: 96 });
    expect(r4.maxEnemies).toBe(20);
    expect(r4.areas).toEqual(r3.areas);
    expect(r6.areaSize).toEqual(r3.areaSize);
    expect(r4.toughness).toEqual([{ stat: 'health', amount: 2 }, { stat: 'attackDamage', amount: 1 }]);
    expect(r6.toughness).toEqual([{ stat: 'health', amount: 3 }, { stat: 'attackDamage', amount: 2 }]);
    expect(bossHealthIn(BOSSES.get('stagwarden')!, 4)).toBe(30);
    expect(bossHealthIn(BOSSES.get('stagwarden')!, 6)).toBe(42);
    expect(bossHealthIn(BOSSES.get('centipede')!, 4)).toBe(32);
    expect(bossHealthIn(BOSSES.get('centipede')!, 5)).toBe(40);
    expect(bossHealthIn(BOSSES.get('centipede')!, 6)).toBe(48);
    expect(bossBlueStars(4)).toBe(14);
    expect(bossBlueStars(6)).toBe(18);
    expect(r4.bosses).toEqual(['centipede']);
    expect(regionDefFor(5).bosses).toEqual(expect.arrayContaining(['stagwarden', 'gloamhorn', 'brood-queen', 'centipede']));
  });
});

describe('shop prices (owner, 2026-11-19)', () => {
  it('stat boosts start at 12, 16 and 20 in regions 1 to 3, and 24 in region four', () => {
    const run = createRun('P', generateRunMap('P'));
    const up = { kind: 'upgrade' as const, id: 'deep-breath', sold: false };
    const at = (region: number) => {
      run.region = region;
      return priceOf(run, up);
    };
    expect([at(1), at(2), at(3), at(4)]).toEqual([12, 16, 20, 24]);
  });
});

void canShoot;
void tick;

describe('a safety limit on speed (found while building Milestone 8)', () => {
  it('nothing moves faster than tuning.maxSpeed, so a body wedged between bumpers cannot speed up forever', async () => {
    const { startBody, stepShot } = await import('../src/sim/ball');
    const r = parseCourse({ format: 3, name: 'cap', legend: { g: 'grass' }, tiles: ['g1 g1 g1', 'g1 g1 g1', 'g1 g1 g1'], start: [0, 0], exit: [2, 2], quota: 0 });
    if (!r.ok) throw new Error();
    const s = startBody(T, { x: 1.5, y: 1.5, z: 0.25, vx: 0, vy: 0, vz: 0, grounded: true }, { vx: 500, vy: 0, vz: 0 });
    stepShot(r.course, T, s);
    expect(Math.hypot(s.ball.vx, s.ball.vy, s.ball.vz)).toBeLessThanOrEqual(T.maxSpeed + 1e-9);
  });
});

describe('region three course check (owner, 2026-11-19: options A and C)', () => {
  it('region three has 4 to 6 areas (owner, 2026-11-21), and a hard course never goes past the maximum', async () => {
    const { sizeFor } = await import('../src/sim/run');
    const run = createRun('A', generateRunMap('A'));
    run.region = 3;
    expect(sizeFor(run, 'course').areas).toEqual([4, 4]);
    run.counted = 3;
    expect(sizeFor(run, 'course').areas).toEqual([5, 5]);
    run.counted = 8;
    expect(sizeFor(run, 'course').areas).toEqual([6, 6]);
    expect(sizeFor(run, 'hard').areas).toEqual([6, 6]);
    expect(sizeFor(run, 'course').areaSize).toEqual([9, 15]);
  });
  it("the bot plays region three with the best gear and the extra shot and health boosts", async () => {
    const { botLoadoutOf } = await import('../src/sim/run');
    const { GEAR } = await import('../src/content/gear');
    const run = createRun('C', generateRunMap('C'));
    run.region = 3;
    const lo = botLoadoutOf(run);
    expect(lo.gear).toEqual({ weapon: 'giants-knuckle', armour: 'bastion-plate', bauble: 'pocket-watch' });
    for (const id of Object.values(lo.gear!)) expect(GEAR.has(id!)).toBe(true);
    const add = (stat: string) => lo.modifiers!.filter((m) => m.stat === stat).reduce((n, m) => n + m.amount, 0);
    expect(add('maxShots')).toBe(3);
    expect(add('maxHealth')).toBe(3);
    run.region = 4;
    expect(botLoadoutOf(run).gear).toEqual(lo.gear);
  });
  it('after the first course, the bot also has Vitality and Stamina at their top level (owner, 2026-11-23)', async () => {
    const { botLoadoutOf } = await import('../src/sim/run');
    const run = createRun('C', generateRunMap('C'));
    const add = (lo: ReturnType<typeof botLoadoutOf>, stat: string) => lo.modifiers!.filter((m) => m.stat === stat).reduce((n, m) => n + m.amount, 0);
    // The run's first course: region one's par only (nothing).
    expect(add(botLoadoutOf(run), 'maxHealth')).toBe(0);
    expect(add(botLoadoutOf(run), 'maxShots')).toBe(0);
    run.totals.courses = 1;
    const lo = botLoadoutOf(run);
    expect(add(lo, 'maxHealth')).toBe(5);
    expect(add(lo, 'maxShots')).toBe(5);
    // On top of the region's par: region three adds +3 health and +3 shots of its own.
    run.region = 3;
    expect(add(botLoadoutOf(run), 'maxHealth')).toBe(8);
    expect(add(botLoadoutOf(run), 'maxShots')).toBe(8);
    expect(add(botLoadoutOf(run), 'hitDamage')).toBe(1);
    // The bot starts at full health with the boost.
    run.region = 1;
    const r = parseCourse(arenaData('queens-mound', 'brood-queen'));
    if (!r.ok) throw new Error(r.errors.join('; '));
    const play = createPlay(r.course, DEFAULT_TUNING, { seed: 'x', loadout: lo });
    expect(play.health).toBe(play.stats.get('maxHealth'));
  });
});
