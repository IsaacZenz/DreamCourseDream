/**
 * Milestone 8 round 3 (sheet docs/plans/milestone-8-round-3.md, signed off by
 * the owner 2026-11-22: pockets 17 and characters 21 blue stars, rest defaults).
 */
import { describe, expect, it } from 'vitest';
import { generateRunMap } from '../src/gen/runMap';
import { buy, choices, createRun, debugAddStars, debugVisit, enterNode, leaveShop, leaveCache, mapVisible, priceOf, reroll, setGear, settleGrab, waitingGrab, type RunState } from '../src/sim/run';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { GEAR, GEAR_LIST, RARITIES } from '../src/content/gear';
import { RUN } from '../src/content/run';
import { parseCourse, type Course } from '../src/sim/course';
import { createPlay, drainLog, runShot, takeShot, type Loadout, type PlayEvent } from '../src/sim/play';
import type { Modifier } from '../src/sim/stats';

/** Step past whatever the node is, without playing it (enough for map tests). */
function skip(run: RunState): void {
  if (run.status === 'shop') leaveShop(run);
  else if (run.status === 'cache') leaveCache(run);
  else run.status = 'map';
}

describe('Round 3: the map shows only your next choices', () => {
  it('at the start: only the first row', () => {
    const run = createRun('MAPVIS', generateRunMap('MAPVIS'));
    const seen = mapVisible(run);
    expect([...seen].sort()).toEqual(run.map.rows[0]!.map((n) => n.id).sort());
  });

  it('after some steps: the path taken and the next choices, nothing else', () => {
    const run = createRun('MAPVIS2', generateRunMap('MAPVIS2'));
    for (let i = 0; i < 3; i++) {
      enterNode(run, choices(run)[0]!.id);
      skip(run);
    }
    const seen = mapVisible(run);
    const expected = new Set([...run.path, ...choices(run).map((n) => n.id)]);
    expect(seen).toEqual(expected);
    const all = run.map.rows.flat().length;
    expect(seen.size).toBeLessThan(all);
  });
});

// ---------------------------------------------------------------------------

function field(): Course {
  const rows: string[] = [];
  for (let y = 0; y < 5; y++) {
    const row: string[] = [];
    for (let x = 0; x < 12; x++) row.push(x === 0 || y === 0 || x === 11 || y === 4 ? 'g2' : 'g1');
    rows.push(row.join(' '));
  }
  const r = parseCourse({ format: 2, name: 'r3', legend: { g: 'grass' }, tiles: rows, start: [1, 2], exit: [10, 3], quota: 0, objects: [{ id: 'mudroller', at: [6, 2], path: [[6, 2]] }] });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}
const slices = (n: number): Modifier => ({ stat: 'rollSlices', op: 'add', amount: n, source: { kind: 'run', id: 'test' }, duration: { kind: 'run' } });
function hitOnce(seed: string, lo: Loadout) {
  const play = createPlay(field(), DEFAULT_TUNING, { seed, loadout: lo });
  play.ball = { ...play.ball, x: 1.5, y: 2.5 };
  takeShot(play, { angle: 0, power: 0.6, type: 'ground', topSpin: 0, sideSpin: 0 });
  runShot(play);
  return { play, log: drainLog(play) };
}

describe('Round 3: the Needle family', () => {
  it('four weapons, common to double rare, poison 1, 2, 2 and 3 turns; the two higher ones add +1 hit damage', () => {
    const ids = ['pin-needle', 'thistle-needle', 'venom-needle', 'hex-needle'];
    const g = ids.map((id) => GEAR.get(id)!);
    expect(g.map((x) => x.rarity)).toEqual(['common', 'uncommon', 'rare', 'doubleRare']);
    expect(g.map((x) => x.effects.find((e) => e.kind === 'poison'))).toEqual([1, 2, 2, 3].map((turns) => ({ kind: 'poison', turns })));
    expect(g.map((x) => x.modifiers.reduce((n, m) => n + (m.stat === 'hitDamage' ? m.amount : 0), 0))).toEqual([0, 0, 1, 1]);
    expect(g.map((x) => x.price)).toEqual([10, 15, 30, 45]);
    // Weapons now have 4 items per rarity from common to double rare, like armour and baubles.
    for (const r of RARITIES.slice(0, 4)) expect(GEAR_LIST.filter((x) => x.category === 'weapon' && x.rarity === r).length).toBe(4);
  });

  it("a successful roll poisons the enemy for the weapon's turns", () => {
    const { play, log } = hitOnce('needle', { gear: { weapon: 'thistle-needle', armour: null, bauble: null }, modifiers: [slices(30)] });
    expect(log.some((e: PlayEvent) => e.kind === 'roll' && e.effect === 'poison' && e.success)).toBe(true);
    // One enemy turn has passed since the hit, so Thistle's 2 turns show as 1 left and Pin's 1 has run out.
    const left = (p: typeof play) => p.enemies[0]!.statuses.find((x) => x.id === 'poisoned')?.turnsLeft ?? 0;
    const pin = hitOnce('needle', { gear: { weapon: 'pin-needle', armour: null, bauble: null }, modifiers: [slices(30)] }).play;
    expect(left(play)).toBeGreaterThanOrEqual(1);
    expect(left(pin)).toBe(left(play) - 1);
  });

  it('a failed roll does not poison', () => {
    const { play } = hitOnce('needle2', { gear: { weapon: 'pin-needle', armour: null, bauble: null }, modifiers: [slices(-30)] });
    expect(play.enemies[0]!.statuses.some((x) => x.id === 'poisoned')).toBe(false);
  });
});

describe('Round 3: shop variety', () => {
  const town = (seed: string) => {
    const run = createRun(seed, generateRunMap(seed));
    debugVisit(run, 'shop');
    debugAddStars(run, 500);
    return run;
  };

  it('the gear shop: 3 gear offers, exactly one on sale at 30% off, and a Grab Bag card at 25 stars', () => {
    for (let i = 0; i < 10; i++) {
      const run = town(`SALE${i}`);
      const offers = run.shop!.offers;
      expect(offers.map((o) => o.kind)).toEqual(['gear', 'gear', 'gear', 'grab']);
      const sale = offers.filter((o) => o.sale);
      expect(sale.length).toBe(1);
      expect(priceOf(run, sale[0]!)).toBe(Math.round(GEAR.get(sale[0]!.id)!.price * (1 - RUN.shop.sale.off)));
      expect(priceOf(run, offers[3]!)).toBe(RUN.shop.grabBag.price);
    }
  });

  it('a reroll keeps one sale among the new offers and keeps the Grab Bag', () => {
    const run = town('SALER');
    expect(reroll(run)).toBeNull();
    expect(run.shop!.offers.filter((o) => o.sale).length).toBe(1);
    expect(run.shop!.offers[3]!.kind).toBe('grab');
  });

  it('the Grab Bag: once per visit, rarity one column better, goes straight on into an empty pocket', () => {
    const run = town('GRAB');
    const before = run.wallet;
    expect(buy(run, 3)).toBeNull();
    expect(run.wallet).toBe(before - RUN.shop.grabBag.price);
    const got = run.shop!.offers[3]!.got!;
    expect(GEAR.get(got)).toBeDefined();
    expect(run.gear[GEAR.get(got)!.category]).toBe(got);
    expect(buy(run, 3)).toBe('SOLD');
  });

  it('the Grab Bag rolls better rarities than the shelf, over many towns', () => {
    const score = (ids: string[]) => ids.reduce((n, id) => n + RARITIES.indexOf(GEAR.get(id)!.rarity), 0) / ids.length;
    const shelf: string[] = [];
    const grab: string[] = [];
    for (let i = 0; i < 80; i++) {
      const run = town(`GB${i}`);
      shelf.push(...run.shop!.offers.filter((o) => o.kind === 'gear').map((o) => o.id));
      buy(run, 3);
      grab.push(run.shop!.offers[3]!.got!);
    }
    expect(score(grab)).toBeGreaterThan(score(shelf));
  });

  it('a Grab Bag for a full category asks; no leaves it in the shop at its normal price', () => {
    for (let i = 0; i < 20; i++) {
      const run = town(`GBF${i}`);
      // Fill every category so whatever comes out needs the question.
      for (const c of ['weapon', 'armour', 'bauble'] as const) setGear(run, GEAR_LIST.find((g) => g.category === c && g.rarity === 'legendary')!.id);
      const held = { ...run.gear };
      buy(run, 3);
      const w = waitingGrab(run);
      expect(w).not.toBeNull();
      expect(run.gear).toEqual(held);
      settleGrab(run, false);
      const o = run.shop!.offers[3]!;
      expect(o.kind).toBe('gear');
      expect(o.sold).toBe(false);
      expect(priceOf(run, o)).toBe(GEAR.get(o.id)!.price);
      return;
    }
  });

  it("the food shop: one Chef's Special, lasting 3 courses", () => {
    for (let i = 0; i < 10; i++) {
      const run = town(`CHEF${i}`);
      const sp = run.foodShop!.offers.filter((o) => o.special);
      expect(sp.length).toBe(1);
      expect(sp[0]!.courses).toBe(RUN.shop.chefSpecial.courses);
    }
  });
});
