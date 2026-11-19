/**
 * Milestone 6: the run map, the run rules, the shop, the cache, the Burrow,
 * and gear on a course (docs/plans/milestone-6.md).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { GEAR, GEAR_LIST, RARITIES, RARITY_INFO } from '../src/content/gear';
import { RUN, UPGRADE_PRICE } from '../src/content/run';
import { parseCourse, type Course } from '../src/sim/course';
import { createPlay, debugWin, drainLog, runShot, shieldsLeft, takeShot, tick, type PlayEvent, type PlayState } from '../src/sim/play';
import type { ShotCommand } from '../src/sim/ball';
import { generateRunMap } from '../src/gen/runMap';
import { placeGear } from '../src/gen/placeGear';
import {
  LAST_TOWN,
  addUpgrade,
  budgetFor,
  burrowSwap,
  buy,
  choices,
  createRun,
  enterNode,
  finishCourse,
  leaveCache,
  leaveShop,
  loadoutOf,
  nodeById,
  priceOf,
  rarityWeights,
  rerollPrice,
  reroll,
  rollGear,
  runStats,
  setGear,
  takeFromCache,
  typeOf,
  type MapNode,
  type RunState,
} from '../src/sim/run';
import { Rng } from '../src/sim/rng';

const T = DEFAULT_TUNING;
const SEEDS = Array.from({ length: 60 }, (_, i) => `MAP${i}`);

function field(w: number, h: number, extra: Record<string, unknown> = {}): Course {
  const rows: string[] = [];
  for (let y = 0; y < h + 2; y++) {
    const row: string[] = [];
    for (let x = 0; x < w + 2; x++) row.push(x === 0 || y === 0 || x === w + 1 || y === h + 1 ? 'g2' : 'g1');
    rows.push(row.join(' '));
  }
  const r = parseCourse({ format: 2, name: 'run test', legend: { g: 'grass', '~': 'water' }, tiles: rows, start: [1, 1], exit: [w, h], quota: 0, ...extra });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });
function fire(p: PlayState, cmd: ShotCommand): PlayEvent[] {
  takeShot(p, cmd);
  runShot(p);
  return drainLog(p);
}

/** A run whose next choice is a node of this type, if the map has one in row 1 (courses only there) or later. */
function newRun(seed = 'RUN1'): RunState {
  return createRun(seed, generateRunMap(seed));
}

/** Win the current course with nothing changed. */
function winCourse(run: RunState): void {
  finishCourse(run, { won: true, lostBy: null, health: run.health, wallet: run.wallet, ability: run.ability, gear: run.gear });
}

/** Finish whatever node is open. */
function finishNode(run: RunState): void {
  if (run.status === 'course') winCourse(run);
  else if (run.status === 'shop') leaveShop(run);
  else if (run.status === 'cache') leaveCache(run);
}

describe('run map', () => {
  it('row 1 has three courses; rows have 2 to 4 nodes', () => {
    for (const seed of SEEDS) {
      const m = generateRunMap(seed);
      expect(m.rows.length).toBe(RUN.map.rows);
      expect(m.rows[0]!.length).toBe(3);
      expect(m.rows[0]!.every((n) => n.type === 'course')).toBe(true);
      for (const row of m.rows) {
        expect(row.length).toBeGreaterThanOrEqual(2);
        expect(row.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it('links go to the own or a neighbouring lane, never cross, and reach every node', () => {
    for (const seed of SEEDS) {
      const m = generateRunMap(seed);
      for (let r = 0; r < m.rows.length - 1; r++) {
        const row = m.rows[r]!;
        const pairs: [number, number][] = [];
        for (const n of row) {
          expect(n.links.length).toBeGreaterThanOrEqual(1);
          expect(n.links.length).toBeLessThanOrEqual(2);
          for (const id of n.links) {
            const t = nodeById(m, id)!;
            expect(t.row).toBe(n.row + 1);
            expect(Math.abs(t.lane - n.lane)).toBeLessThanOrEqual(1);
            pairs.push([n.lane, t.lane]);
          }
        }
        for (const [a, b] of pairs) for (const [c, d] of pairs) if (a < c) expect(b).toBeLessThanOrEqual(d);
        const linked = new Set(row.flatMap((n) => n.links));
        for (const n of m.rows[r + 1]!) expect(linked.has(n.id)).toBe(true);
      }
    }
  });

  it('follows the shop and hard-course rules', () => {
    let shops = 0;
    let hards = 0;
    for (const seed of SEEDS) {
      const m = generateRunMap(seed);
      for (const row of m.rows) {
        const rowShops = row.filter((n) => n.type === 'shop');
        expect(rowShops.length).toBeLessThanOrEqual(1);
        for (const n of row) {
          if (n.type === 'shop') {
            shops++;
            expect(n.row).toBeGreaterThanOrEqual(RUN.map.firstShopRow);
            for (const id of n.links) expect(nodeById(m, id)!.type).not.toBe('shop');
          }
          if (n.type === 'hard') {
            hards++;
            expect(n.row).toBeGreaterThanOrEqual(RUN.map.firstHardRow);
          }
          if (n.type === 'boss') expect(n.row).toBeGreaterThanOrEqual(RUN.map.earlyBossFromRow);
        }
      }
    }
    expect(shops).toBeGreaterThan(20);
    expect(hards).toBeGreaterThan(20);
  });

  it('is the same for the same seed and different for another', () => {
    expect(generateRunMap('ABC')).toEqual(generateRunMap('ABC'));
    expect(generateRunMap('ABC')).not.toEqual(generateRunMap('ABD'));
  });
});

describe('run rules', () => {
  it('starts below row 1 with full health, no stars, countdown 7 (owner)', () => {
    const run = newRun();
    expect(run.health).toBe(5);
    expect(run.wallet).toBe(0);
    expect(run.countdown).toBe(7);
    expect(choices(run).map((n) => n.row)).toEqual([1, 1, 1]);
  });

  it('budget: 8 + 2 per counted node, hard ×1.5, capped at 30', () => {
    const run = newRun();
    expect(budgetFor(run, 'course')).toBe(8);
    expect(budgetFor(run, 'hard')).toBe(12);
    run.counted = 4;
    expect(budgetFor(run, 'course')).toBe(16);
    expect(budgetFor(run, 'hard')).toBe(24);
    run.counted = 10;
    expect(budgetFor(run, 'course')).toBe(28);
    expect(budgetFor(run, 'hard')).toBe(30);
  });

  it('a course lowers the countdown and pays its reward; a shop does not lower it (owner)', () => {
    const run = newRun();
    enterNode(run, choices(run)[0]!.id);
    run.wallet = 0;
    finishCourse(run, { won: true, lostBy: null, health: 4, wallet: 5, ability: null, gear: run.gear });
    expect(run.countdown).toBe(6);
    expect(run.counted).toBe(1);
    expect(run.wallet).toBe(5 + RUN.reward.course);
    expect(run.health).toBe(4);
    // Fake a shop as the next choice.
    const node: MapNode = { id: 'r2l0', row: 2, lane: 0, type: 'shop', links: [] };
    (run.map.rows[1] as MapNode[]).splice(0, run.map.rows[1]!.length, node);
    (nodeById(run.map, run.at!)!.links as string[]).splice(0, 9, 'r2l0');
    enterNode(run, 'r2l0');
    expect(run.status).toBe('shop');
    leaveShop(run);
    expect(run.countdown).toBe(6);
    expect(run.counted).toBe(1);
  });

  it('at countdown zero the boss is forced, with an optional last town first (owner); beating it leads to region two', () => {
    const run = newRun();
    for (let i = 0; i < 40 && run.countdown > 0; i++) {
      const next = choices(run).find((n) => n.type !== 'boss' && n.type !== 'shop') ?? choices(run)[0]!;
      enterNode(run, next.id);
      if (run.status === 'course' && run.current!.type === 'boss') break;
      finishNode(run);
    }
    if (run.status === 'map') {
      expect(choices(run).map((n) => n.id)).toEqual([LAST_TOWN, 'boss']);
      const at = run.at;
      enterNode(run, LAST_TOWN);
      expect(run.status).toBe('shop');
      leaveShop(run);
      expect(run.at).toBe(at);
      expect(choices(run).map((n) => n.id)).toEqual(['boss']);
      enterNode(run, 'boss');
    }
    expect(run.current!.type).toBe('boss');
    winCourse(run);
    // Milestone 7: the region-one boss gives a gear pick, then region two starts.
    expect(run.status).toBe('reward');
  });

  it('no last town is offered straight after leaving a town', () => {
    const run = newRun();
    const town: MapNode = { id: 'r3l0', row: 3, lane: 0, type: 'shop', links: [] };
    (run.map.rows[2] as MapNode[]).splice(0, 1, town);
    run.at = 'r3l0';
    run.countdown = 0;
    expect(choices(run).map((n) => n.id)).toEqual(['boss']);
  });

  it('a raise bought in the last town gives another chance at a town after the next course', () => {
    const run = newRun();
    run.countdown = 0;
    enterNode(run, LAST_TOWN);
    run.wallet = 50;
    run.shop!.offers[4] = { kind: 'raise', id: 'raise', sold: false };
    expect(buy(run, 4)).toBeNull();
    leaveShop(run);
    expect(run.countdown).toBe(1);
    enterNode(run, choices(run).find((n) => n.type === 'course')!.id);
    winCourse(run);
    expect(choices(run).map((n) => n.id)).toEqual([LAST_TOWN, 'boss']);
  });

  it('an early-boss node is a course until the countdown is 3 or less, and counts blue stars', () => {
    const run = newRun();
    const node: MapNode = { id: 'r9l1', row: 9, lane: 1, type: 'boss', links: [] };
    run.countdown = 5;
    expect(typeOf(run, node)).toBe('course');
    run.countdown = 3;
    expect(typeOf(run, node)).toBe('boss');
    run.status = 'course';
    run.current = { id: 'r9l1', row: 9, type: 'boss', early: true, budget: 20, courseSeed: 'X', gear: null, acorn: null, boss: null, arena: null };
    winCourse(run);
    // Owner, 2026-11-17: the boss's 5, plus 1 per countdown step left, deposited at once.
    expect(run.blueStars).toBe(0);
    expect(run.banked).toBe(8);
  });

  it('losing a course ends the run (owner: also when out of naps)', () => {
    const run = newRun();
    enterNode(run, choices(run)[0]!.id);
    finishCourse(run, { won: false, lostBy: 'shots', health: 3, wallet: 2, ability: null, gear: run.gear });
    expect(run.status).toBe('lost');
    expect(run.endedBy).toBe('shots');
  });

  it('is the same run for the same seed and the same choices', () => {
    const play = (seed: string) => {
      const run = newRun(seed);
      const seen: string[] = [];
      for (let i = 0; i < 8 && run.status === 'map'; i++) {
        const c = enterNode(run, choices(run)[choices(run).length - 1]!.id);
        seen.push(`${c.id}:${c.type}:${c.budget}:${c.courseSeed}:${c.gear}`);
        if (run.shop) seen.push(run.shop.offers.map((o) => o.id).join(','));
        finishNode(run);
      }
      return seen;
    };
    expect(play('SAME')).toEqual(play('SAME'));
  });
});

describe('gear rarity', () => {
  it('has 66 items: 3 weapons and (owner, 2026-11-17) 4 armour and 4 baubles per rarity, with the owner prices', () => {
    expect(GEAR_LIST.length).toBe(66);
    for (const r of RARITIES) expect(GEAR_LIST.filter((g) => g.category === 'weapon' && g.rarity === r).length).toBe(3);
    for (const c of ['armour', 'bauble']) for (const r of RARITIES) expect(GEAR_LIST.filter((g) => g.category === c && g.rarity === r).length).toBe(4);
    // Owner, 2026-11-19 (Milestone 8): dearer high-rarity gear.
    expect(RARITIES.map((r) => RARITY_INFO[r].price)).toEqual([10, 15, 30, 45, 70, 100]);
    expect(new Set(GEAR_LIST.map((g) => g.id)).size).toBe(66);
  });

  it('drop luck moves 5 points up per +25%', () => {
    expect(rarityWeights(0, 1)).toEqual([70, 25, 5, 0, 0, 0]);
    expect(rarityWeights(0, 1.5)).toEqual([60, 35, 5, 0, 0, 0]);
  });

  it('early in region 1 shows mostly commons and never a special rare', () => {
    const run = newRun();
    const rng = Rng.fromSeed('odds');
    const n: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const id = rollGear(run, rng)!;
      const r = GEAR.get(id)!.rarity;
      n[r] = (n[r] ?? 0) + 1;
    }
    expect(n.common! / 2000).toBeGreaterThan(0.6);
    expect(n.uncommon ?? 0).toBeGreaterThan(n.rare ?? 0);
    expect(n.specialRare ?? 0).toBe(0);
    run.counted = 5;
    const late: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const r = GEAR.get(rollGear(run, rng)!)!.rarity;
      late[r] = (late[r] ?? 0) + 1;
    }
    expect(late.common!).toBeLessThan(n.common!);
  });

  it('never offers an item the player holds', () => {
    const run = newRun();
    setGear(run, 'studded-shell');
    const rng = Rng.fromSeed('held');
    for (let i = 0; i < 500; i++) expect(rollGear(run, rng, { category: 'weapon' })).not.toBe('studded-shell');
  });
});

describe('shop and cache', () => {
  function shopRun(): RunState {
    const run = newRun('SHOP');
    run.status = 'shop';
    run.current = { id: 'r3l0', row: 3, type: 'shop', early: false, budget: 0, courseSeed: '', gear: null, acorn: null, boss: null, arena: null };
    run.shop = { node: 'r3l0', offers: [], rerolls: 0, freeRerolls: 0, raised: false };
    run.shop.offers = [
      { kind: 'gear', id: 'studded-shell', sold: false },
      { kind: 'gear', id: 'iron-shell', sold: false },
      { kind: 'upgrade', id: 'deep-breath', sold: false },
      { kind: 'upgrade', id: 'tough-shell', sold: false },
      { kind: 'raise', id: 'raise', sold: false },
    ];
    return run;
  }

  it('buying takes stars; an upgrade gets 6 dearer each time in a run', () => {
    const run = shopRun();
    run.wallet = 100;
    const up = run.shop!.offers[2]!;
    expect(priceOf(run, up)).toBe(UPGRADE_PRICE.base);
    expect(buy(run, 2)).toBeNull();
    expect(run.wallet).toBe(100 - 12);
    expect(runStats(run).get('maxShots')).toBe(5);
    expect(priceOf(run, { kind: 'upgrade', id: 'deep-breath', sold: false })).toBe(18);
    expect(buy(run, 2)).toBe('SOLD');
  });

  it('cannot buy without enough stars', () => {
    const run = shopRun();
    run.wallet = 5;
    expect(buy(run, 0)).toBe('NOT ENOUGH STARS');
  });

  it('gear replaces the held item of its category; the old one is lost', () => {
    const run = shopRun();
    run.wallet = 100;
    setGear(run, 'bonk-knob');
    buy(run, 0);
    expect(run.gear.weapon).toBe('studded-shell');
    expect(runStats(run).get('hitDamage')).toBe(2);
  });

  it('raises the countdown once per shop', () => {
    const run = shopRun();
    run.wallet = 100;
    expect(buy(run, 4)).toBeNull();
    expect(run.countdown).toBe(RUN.countdown + 1);
    expect(run.raises).toBe(1);
  });

  it('reroll costs 3, then 6, and keeps sold slots', () => {
    const run = shopRun();
    run.wallet = 100;
    buy(run, 0);
    expect(rerollPrice(run)).toBe(3);
    expect(reroll(run)).toBeNull();
    expect(run.wallet).toBe(100 - 10 - 3);
    expect(rerollPrice(run)).toBe(6);
    expect(run.shop!.offers[0]).toEqual({ kind: 'gear', id: 'studded-shell', sold: true });
  });

  it('Four-Leaf Clover makes the first reroll free and lowers prices 25%', () => {
    const run = shopRun();
    setGear(run, 'four-leaf-clover');
    expect(rerollPrice(run)).toBe(0);
    expect(priceOf(run, { kind: 'gear', id: 'iron-shell', sold: false })).toBe(23);
  });

  it('cache: take one for free, which finishes the node and counts', () => {
    const run = newRun();
    run.status = 'cache';
    run.current = { id: 'r2l1', row: 2, type: 'cache', early: false, budget: 0, courseSeed: '', gear: null, acorn: null, boss: null, arena: null };
    run.cache = { node: 'r2l1', offers: [{ kind: 'upgrade', id: 'long-arms', sold: false }] };
    expect(takeFromCache(run, 0)).toBeNull();
    expect(run.wallet).toBe(0);
    expect(run.upgrades['long-arms']).toBe(1);
    expect(run.bought['long-arms']).toBeUndefined();
    expect(run.countdown).toBe(RUN.countdown - 1);
    expect(run.status).toBe('map');
  });

  it('Tough Shell heals 1 as well as raising max health', () => {
    const run = newRun();
    run.health = 3;
    addUpgrade(run, 'tough-shell');
    expect(run.health).toBe(4);
    expect(runStats(run).get('maxHealth')).toBe(6);
  });
});

describe('the Burrow (owner, 2026-11-15)', () => {
  it('stores, takes out and swaps one item per category, only in a town', () => {
    const run = createRun('B', generateRunMap('B'), { weapon: null, armour: 'thick-hide', bauble: null });
    setGear(run, 'studded-shell');
    expect(burrowSwap(run, 'weapon')).toBe(false);
    run.status = 'shop';
    expect(burrowSwap(run, 'weapon')).toBe(true);
    expect(run.gear.weapon).toBeNull();
    expect(run.burrow.weapon).toBe('studded-shell');
    expect(burrowSwap(run, 'armour')).toBe(true);
    expect(run.gear.armour).toBe('thick-hide');
    expect(run.burrow.armour).toBeNull();
    expect(burrowSwap(run, 'bauble')).toBe(false);
  });

  it('ignores saved ids that are not gear of that slot', () => {
    const run = createRun('B', generateRunMap('B'), { weapon: 'thick-hide', armour: 'no-such-thing', bauble: 'star-magnet' });
    expect(run.burrow).toEqual({ weapon: null, armour: null, bauble: 'star-magnet' });
  });
});

describe('gear on a course', () => {
  it('the loadout carries health, stars, ability, gear and upgrades into the course', () => {
    const run = newRun();
    run.health = 3;
    run.wallet = 7;
    run.ability = 'hop';
    setGear(run, 'iron-shell');
    addUpgrade(run, 'deep-breath');
    const p = createPlay(field(8, 3), T, { seed: 'x', loadout: loadoutOf(run) });
    expect(p.health).toBe(3);
    expect(p.wallet).toBe(7);
    expect(p.ability).toBe('hop');
    expect(p.stats.get('hitDamage')).toBe(3);
    expect(p.stats.get('maxShots')).toBe(5);
    expect(p.shots).toBe(5);
  });

  it('rolling over gear equips it and drops the old item, which can be picked up again', () => {
    const c = field(10, 3, { objects: [{ id: 'iron-shell', at: [4, 2] }] });
    const p = createPlay(c, T, { seed: 'g', loadout: { gear: { weapon: 'studded-shell', armour: null, bauble: null } } });
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.5 }));
    expect(log).toContainEqual({ kind: 'gearEquipped', item: 'iron-shell', dropped: 'studded-shell' });
    expect(p.gear.weapon).toBe('iron-shell');
    expect(p.stats.get('hitDamage')).toBe(3);
    const dropped = p.gearItems.find((g) => g.item === 'studded-shell')!;
    expect(dropped.taken).toBe(false);
    expect(dropped.x).toBe(4.5);
  });

  it('a dropped item is locked for half a second', () => {
    const c = field(6, 3, { objects: [{ id: 'iron-shell', at: [2, 2] }] });
    const p = createPlay(c, T, { seed: 'g', loadout: { gear: { weapon: 'studded-shell', armour: null, bauble: null } } });
    p.ball = { ...p.ball, x: 2.5, y: 2.5 };
    tick(p);
    expect(p.gear.weapon).toBe('iron-shell');
    for (let i = 0; i < 20; i++) tick(p);
    expect(p.gear.weapon).toBe('iron-shell');
    for (let i = 0; i < 60; i++) tick(p);
    expect(p.gear.weapon).toBe('studded-shell');
  });

  it('Padded Lining ignores the first damage each course', () => {
    const c = field(10, 3, { objects: [{ id: 'mudroller', at: [6, 2], path: [[6, 2]] }] });
    const p = createPlay(c, T, { seed: 'l', loadout: { gear: { weapon: null, armour: 'padded-lining', bauble: null } } });
    expect(shieldsLeft(p)).toBe(1);
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.6 }));
    expect(log).toContainEqual({ kind: 'shielded', item: 'padded-lining' });
    expect(p.health).toBe(5);
    expect(shieldsLeft(p)).toBe(0);
  });

  it('Thorn Guard hurts back an enemy that hurts the ball', () => {
    const c = field(10, 3, { objects: [{ id: 'mudroller', at: [6, 2], path: [[6, 2]] }] });
    const p = createPlay(c, T, { seed: 't', loadout: { gear: { weapon: null, armour: 'thorn-guard', bauble: null } } });
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.6 }));
    // The shot's hit took 1, the thorns 1 more: the Trundler (2 health) is beaten.
    expect(log.some((e) => e.kind === 'thorns')).toBe(true);
    expect(p.enemies[0]!.defeated).toBe(true);
  });

  it('Ember Coat sets the enemy burning; Burning does 1 damage at the start of the enemy turn', () => {
    const c = field(10, 3, { objects: [{ id: 'mudroller', at: [6, 2], path: [[6, 2]] }] });
    // A full wheel (owner, 2026-11-17: success rolls) so the burn always takes.
    const full = [{ stat: 'rollSlices' as const, op: 'add' as const, amount: 10, source: { kind: 'run' as const, id: 'test' }, duration: { kind: 'run' as const } }];
    const p = createPlay(c, T, { seed: 'e', loadout: { gear: { weapon: 'ember-coat', armour: null, bauble: null }, modifiers: full } });
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.6 }));
    expect(log).toContainEqual({ kind: 'status', target: 'mudroller#0', status: 'burning' });
    expect(log).toContainEqual({ kind: 'statusDamage', enemy: 'mudroller#0', status: 'burning', damage: 1 });
    expect(p.enemies[0]!.defeated).toBe(true);
  });

  it('Phoenix Plate saves the ball once and crumbles', () => {
    const c = field(10, 3, { objects: [{ id: 'mudroller', at: [6, 2], path: [[6, 2]] }] });
    const p = createPlay(c, T, { seed: 'p', loadout: { health: 1, gear: { weapon: null, armour: 'phoenix-plate', bauble: null } } });
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.6 }));
    expect(log).toContainEqual({ kind: 'phoenix', item: 'phoenix-plate', health: 3 });
    expect(p.status).toBe('playing');
    expect(p.health).toBe(3);
    expect(p.gear.armour).toBeNull();
  });

  it('Pocket Pillow gives a third nap', () => {
    const p = createPlay(field(8, 3), T, { seed: 'n', loadout: { gear: { weapon: null, armour: null, bauble: 'pocket-pillow' } } });
    expect(p.stats.get('naps')).toBe(3);
  });

  it('Moss Plate heals 1 at the start of a course', () => {
    const p = createPlay(field(8, 3), T, { seed: 'm', loadout: { health: 2, gear: { weapon: null, armour: 'moss-plate', bauble: null } } });
    expect(p.health).toBe(3);
  });

  it('the testing aid wins the course', () => {
    const p = createPlay(field(8, 3), T, { seed: 'w' });
    debugWin(p);
    expect(p.status).toBe('won');
  });

  it('placeGear puts the item on reachable ground near the exit, the same way each time', () => {
    const raw = { format: 2, name: 'g', legend: { g: 'grass' }, tiles: Array.from({ length: 5 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x === 0 || y === 0 || x === 11 || y === 4 ? 'g2' : 'g1')).join(' ')), start: [1, 2], exit: [10, 2], quota: 0 };
    const c = parseCourse(raw);
    if (!c.ok) throw new Error('bad');
    const a = placeGear(raw, c.course, 'star-magnet', 'S');
    const b = placeGear(raw, c.course, 'star-magnet', 'S');
    expect(a.raw).toEqual(b.raw);
    const g = a.course.objects.find((o) => o.id === 'star-magnet')!;
    expect(g.x).toBeGreaterThanOrEqual(6);
  });
});
