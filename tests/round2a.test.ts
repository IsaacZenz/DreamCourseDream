/**
 * Milestone 8 round 2a (sheet docs/plans/milestone-8-round-2a.md, signed off
 * by the owner 2026-11-21): the detail dial, bridges, dead trees, new set
 * pieces, scenery, two shops and the food bag.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { OBJECTS } from '../src/content/objects';
import { SCENERY_SURFACES } from '../src/content/scenery';
import { FOOD } from '../src/content/consumables';
import { DETAIL, RUN } from '../src/content/run';
import { parseCourse, type Course } from '../src/sim/course';
import { createPlay, decideFood, drainLog, runShot, settleFood, takeShot, type PlayEvent } from '../src/sim/play';
import { startBody, stepShot } from '../src/sim/ball';
import { Rng } from '../src/sim/rng';
import { shapeOf } from '../src/sim/tileShape';
import { buildTerrain } from '../src/gen/journey';
import { generateAttempt } from '../src/gen/generate';
import { generateRunMap } from '../src/gen/runMap';
import {
  budgetFor,
  buy,
  cannotEat,
  choices,
  createRun,
  eat,
  enterNode,
  finishCourse,
  leaveCache,
  leaveShop,
  loadoutOf,
  mixFor,
  openFoodShop,
  regionDefFor,
  reroll,
  runStats,
  sizeFor,
  typeOf,
  type RunState,
} from '../src/sim/run';
import { decodeSave, encodeSave, emptySave } from '../src/save/saveData';
import { botShotsFor } from '../src/content/run';
import type { JourneySize } from '../src/content/gen';

const T = DEFAULT_TUNING;

/** A late course's size in region n (after 6 counted nodes), with its detail dial. */
function lateSize(n: number): JourneySize {
  const r = regionDefFor(n);
  const areas = Math.min(r.areas.max, r.areas.start + Math.floor(6 / r.areas.every));
  return { areas: [areas, areas], areaSize: r.areaSize, maxEnemies: r.maxEnemies, botShots: botShotsFor(areas), mix: mixFor(n), detail: r.detail };
}

// ---------------------------------------------------------------------------
// The detail dial and new terrain

describe('the detail dial (sheet section 1)', () => {
  it('region one keeps its ground, set pieces and enemies; it only gains a few rocks and stumps', () => {
    for (let i = 0; i < 8; i++) {
      const run = createRun(`R${i}`, generateRunMap(`R${i}`));
      run.counted = i % 7;
      const size = sizeFor(run, 'course');
      const { detail: _detail, ...plain } = size;
      void _detail;
      const a = generateAttempt(`S${i}`, budgetFor(run, 'course'), 0, size);
      const b = generateAttempt(`S${i}`, budgetFor(run, 'course'), 0, plain);
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) continue;
      const ra = a.raw as { tiles: unknown; objects: { id: string }[]; quota: number };
      const rb = b.raw as { tiles: unknown; objects: { id: string }[]; quota: number };
      expect(ra.tiles).toEqual(rb.tiles);
      expect(ra.quota).toBe(rb.quota);
      expect(ra.objects.slice(0, rb.objects.length)).toEqual(rb.objects);
      const extra = ra.objects.slice(rb.objects.length);
      for (const o of extra) expect(['rock', 'stump']).toContain(o.id);
      expect(extra.length).toBeLessThanOrEqual(4);
    }
  });

  it('every new set piece turns up in regions two and three', () => {
    const seen = new Set<string>();
    for (const region of [2, 3]) {
      for (let i = 0; i < 30; i++) {
        const r = buildTerrain(Rng.fromSeed(`set${region}-${i}`), 24, lateSize(region));
        if (r.ok) for (const p of r.terrain.setPieces) seen.add(p);
      }
    }
    for (const id of ['moat', 'grove', 'spike-strip', 'rough', 'ice']) expect(seen).toContain(id);
  });

  it('regions two and three have more set pieces per area than region one', () => {
    const perArea = (region: number) => {
      let pieces = 0;
      let areas = 0;
      for (let i = 0; i < 20; i++) {
        const size = region === 1 ? { ...lateSize(1) } : lateSize(region);
        const r = buildTerrain(Rng.fromSeed(`pa${region}-${i}`), 20, size);
        if (!r.ok) continue;
        pieces += r.terrain.setPieces.length;
        areas += r.terrain.regions.filter((g) => g.kind === 'area').length;
      }
      return pieces / areas;
    };
    const one = perArea(1);
    expect(perArea(2)).toBeGreaterThan(one * 1.8);
    expect(perArea(3)).toBeGreaterThan(one * 1.8);
  });

  it('moats: along every edge it shares with its bridge, the moat sits lower', () => {
    // Corners are listed nw (0,0), ne (1,0), se (1,1), sw (0,1). For a neighbour at (dx, dy): the bridge's corners on
    // the shared edge, and the neighbour's corners at the same two points.
    const EDGE: Record<string, [number[], number[]]> = { '1,0': [[1, 2], [0, 3]], '-1,0': [[0, 3], [1, 2]], '0,1': [[3, 2], [0, 1]], '0,-1': [[0, 1], [3, 2]] };
    let edges = 0;
    for (let i = 0; i < 40 && edges < 20; i++) {
      const r = buildTerrain(Rng.fromSeed(`moat-${i}`), 24, lateSize(3));
      if (!r.ok || !r.terrain.setPieces.includes('moat')) continue;
      const { tiles, width } = r.terrain;
      tiles.forEach((t, k) => {
        if (t?.surface !== 'bridge') return;
        const x = k % width;
        const y = Math.floor(k / width);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const n = tiles[(y + dy) * width + x + dx];
          if (!n || !['water', 'sand', 'spikes'].includes(n.surface)) continue;
          const [mine, theirs] = EDGE[`${dx},${dy}`]!;
          // Lowered one step. The ground was not always perfectly smooth before, so compare the edge as a whole.
          const sum = (c: readonly number[], idx: number[]) => c[idx[0]!]! + c[idx[1]!]!;
          expect(sum(n.corners, theirs)).toBeLessThan(sum(t.corners, mine));
          edges++;
        }
      });
    }
    expect(edges).toBeGreaterThan(0);
  });

  it('the dead tree is a thin, tall blocker', () => {
    const d = OBJECTS.get('dead-tree');
    expect(d?.kind).toBe('blocker');
    if (d?.kind === 'blocker') {
      expect(d.height).toBe(2);
      expect(d.shape).toEqual({ kind: 'round', r: 0.12 });
    }
  });
});

// ---------------------------------------------------------------------------
// Bridges in play

/**
 * Flat grass at height 4 (format 3), with a moat at x = 5..6 one step lower,
 * filled with `fill`, and a 1-wide bridge across it at y = 3.
 */
function moatCourse(fill: string): Course {
  const legend = { g: 'grass', w: 'water', x: 'spikes', s: 'sand', k: 'bridge' };
  const c = fill === 'water' ? 'w' : fill === 'spikes' ? 'x' : 's';
  const rows: string[] = [];
  for (let y = 0; y < 7; y++) {
    const row: string[] = [];
    for (let x = 0; x < 14; x++) row.push(x === 5 || x === 6 ? (y === 3 ? 'k4' : `${c}3`) : 'g4');
    rows.push(row.join(' '));
  }
  const r = parseCourse({ format: 3, name: 'moat', legend, tiles: rows, start: [1, 3], exit: [12, 6], quota: 0 });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

const ground = (power: number) => ({ angle: 0, power, type: 'ground' as const, topSpin: 0, sideSpin: 0 });

describe('bridges (sheet section 2.1)', () => {
  it('a ball rolls across the bridge like grass', () => {
    const p = createPlay(moatCourse('water'), T, { seed: 'b1' });
    takeShot(p, ground(0.6));
    runShot(p);
    expect(p.ball.x).toBeGreaterThan(7);
    expect(drainLog(p).some((e) => e.kind === 'damage')).toBe(false);
  });

  it('off the side into water: the ball sinks', () => {
    const p = createPlay(moatCourse('water'), T, { seed: 'b2' });
    p.ball = { ...p.ball, y: 1.5 };
    takeShot(p, ground(0.45));
    runShot(p);
    const log = drainLog(p);
    expect(log.some((e: PlayEvent) => e.kind === 'damage' && e.cause === 'sunk')).toBe(true);
  });

  it('off the side into spikes: spike damage', () => {
    const p = createPlay(moatCourse('spikes'), T, { seed: 'b3' });
    p.ball = { ...p.ball, y: 1.5 };
    takeShot(p, ground(0.45));
    runShot(p);
    expect(drainLog(p).some((e) => e.kind === 'damage' && e.cause === 'spikes')).toBe(true);
  });

  it('off the side into a sand moat: the ball stops in the sand', () => {
    const p = createPlay(moatCourse('sand'), T, { seed: 'b4' });
    p.ball = { ...p.ball, y: 1.5 };
    takeShot(p, ground(0.45));
    runShot(p);
    expect(p.ball.x).toBeGreaterThan(5);
    expect(p.ball.x).toBeLessThan(7);
  });

  it('a rolling enemy on the bridge treats its edge as a wall', () => {
    const course = moatCourse('water');
    const s = startBody(T, { x: 5.5, y: 3.5, z: 1, vx: 0, vy: 0, vz: 0, grounded: true }, { vx: 0, vy: 4, vz: 0 }, { radius: 0.3, edgeWalls: true, waterWalls: true });
    for (let i = 0; i < 240 && !s.outcome; i++) {
      stepShot(course, T, s);
      expect(s.ball.y).toBeGreaterThan(3);
      expect(s.ball.y).toBeLessThan(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Scenery

describe('scenery (sheet section 2.6)', () => {
  const courses = [1, 2, 3].flatMap((region) =>
    [0, 1, 2].map((i) => {
      const r = generateAttempt(`SC${region}-${i}`, 16, 0, lateSize(region));
      if (!r.ok) throw new Error(r.reason);
      return { region, course: r.course, raw: r.raw };
    }),
  );

  it('the same seed gives the same scenery', () => {
    const a = generateAttempt('SC2-0', 16, 0, lateSize(2));
    expect(a.ok && a.raw).toEqual(courses.find((c) => c.region === 2)!.raw);
  });

  it('never on a forbidden tile: only grass, rough or sand, not steep, not the start, exit or an object', () => {
    for (const { course } of courses) {
      const objectTiles = new Set(course.objects.map((o) => `${o.x},${o.y}`));
      for (const s of course.scenery) {
        const tx = Math.floor(s.x);
        const ty = Math.floor(s.y);
        const t = course.tiles[ty * course.width + tx]!;
        expect(SCENERY_SURFACES.has(t.surface)).toBe(true);
        expect(shapeOf(t.corners)?.includes('2')).toBe(false);
        expect(objectTiles.has(`${tx},${ty}`)).toBe(false);
        expect(tx === course.start.x && ty === course.start.y).toBe(false);
        expect(tx === course.exit.x && ty === course.exit.y).toBe(false);
      }
    }
  });

  it('the amount per region is within 20% of the sheet', () => {
    for (const region of [1, 2, 3]) {
      const mine = courses.filter((c) => c.region === region);
      const tiles = mine.reduce((n, c) => n + c.course.tiles.filter((t) => t).length, 0);
      const props = mine.reduce((n, c) => n + c.course.scenery.length, 0);
      const want = DETAIL[region - 1]!.scenery.per100;
      expect(Math.abs((props / tiles) * 100 - want)).toBeLessThanOrEqual(want * 0.2);
    }
  });

  it('a ball rolls through scenery as if it were not there', () => {
    const { raw } = courses.find((c) => c.region === 3)!;
    const withProps = parseCourse(raw);
    const without = parseCourse({ ...raw, scenery: undefined });
    if (!withProps.ok || !without.ok) throw new Error('bad course');
    expect(withProps.course.scenery.length).toBeGreaterThan(0);
    const finalBall = (c: Course) => {
      const p = createPlay(c, T, { seed: 'same' });
      takeShot(p, { angle: 0.4, power: 0.6, type: 'ground', topSpin: 0, sideSpin: 0 });
      runShot(p);
      return p.ball;
    };
    expect(finalBall(withProps.course)).toEqual(finalBall(without.course));
  });
});

// ---------------------------------------------------------------------------
// Two shops and the food bag

function townRun(seed = 'FOOD'): RunState {
  const run = createRun(seed, generateRunMap(seed));
  run.status = 'shop';
  run.current = { id: 'lasttown', row: 1, type: 'shop', early: false, budget: 0, courseSeed: '', gear: null, boss: null, arena: null };
  run.shop = { node: 'lasttown', offers: [], rerolls: 0, freeRerolls: 0, raised: false };
  run.wallet = 200;
  return run;
}

/** Leave the town, play the next course and win it, with `found` food picked up. */
function playOne(run: RunState, foods: { id: string; eaten: boolean }[] = []): void {
  if (run.status === 'shop') leaveShop(run);
  // Walk on through towns and caches until a course comes up.
  for (;;) {
    const course = choices(run).find((n) => ['course', 'hard'].includes(typeOf(run, n)));
    if (course) {
      enterNode(run, course.id);
      break;
    }
    enterNode(run, choices(run).find((n) => n.id !== 'boss')!.id);
    if (run.status === 'shop') leaveShop(run);
    else if (run.status === 'cache') leaveCache(run);
  }
  finishCourse(run, { won: true, lostBy: null, health: run.health, wallet: run.wallet, ability: run.ability, gear: run.gear, foods });
}

describe('two shops (sheet section 3)', () => {
  it('arriving in a town opens a food shop with 4 foods and a gear shop with 3 gear items', () => {
    const run = createRun('TOWN', generateRunMap('TOWN'));
    run.health = 1;
    // With the countdown at 0 the map offers the last town before the boss: go in.
    run.countdown = 0;
    enterNode(run, choices(run).find((n) => typeOf(run, n) === 'shop')!.id);
    expect(run.status).toBe('shop');
    expect(run.foodShop!.offers).toHaveLength(FOOD.foodOffers);
    expect(run.foodShop!.offers.every((o) => o.kind === 'food')).toBe(true);
    expect(run.shop!.offers).toHaveLength(FOOD.gearOffers);
    expect(run.shop!.offers.every((o) => o.kind === 'gear')).toBe(true);
  });

  it('each shop rerolls on its own, at its own price', () => {
    const run = townRun();
    openFoodShop(run);
    expect(reroll(run, 'food')).toBeNull();
    expect(reroll(run, 'food')).toBeNull();
    expect(run.foodShop!.rerolls).toBe(2);
    expect(run.shop!.rerolls).toBe(0);
    expect(run.wallet).toBe(200 - 3 - 6);
  });

  it('food lasts 1, 2 or 3 courses, about 50%, 30% and 20% of the time; Apple and Garlic work at once', () => {
    const counts = [0, 0, 0];
    for (let i = 0; i < 300; i++) {
      const run = townRun(`D${i}`);
      run.health = 1;
      openFoodShop(run);
      for (const o of run.foodShop!.offers) {
        if (o.id === 'heal' || o.id === 'raise') expect(o.courses).toBe(0);
        else counts[o.courses! - 1]!++;
      }
    }
    const total = counts.reduce((a, b) => a + b, 0);
    expect(counts[0]! / total).toBeCloseTo(0.5, 1);
    expect(counts[1]! / total).toBeCloseTo(0.3, 1);
    expect(counts[2]! / total).toBeCloseTo(0.2, 1);
  });

  it('prices (sheet section 4.5): stat foods 4, 7, 9 in region one; acorns 3, 5, 8; Apple and Garlic 6', async () => {
    const { priceOf } = await import('../src/sim/run');
    const run = townRun();
    const f = (id: string, courses: number) => priceOf(run, { kind: 'food', id, sold: false, courses });
    expect([f('strong-swing', 1), f('strong-swing', 2), f('strong-swing', 3)]).toEqual([4, 7, 9]);
    expect([f('lucky-acorn', 1), f('golden-acorn', 1), f('star-acorn', 1)]).toEqual([3, 5, 8]);
    expect([f('heal', 0), f('raise', 0)]).toEqual([6, 6]);
    run.region = 3;
    expect([f('strong-swing', 1), f('strong-swing', 2), f('strong-swing', 3)]).toEqual([6, 11, 14]);
  });
});

describe('the food bag (sheet section 4)', () => {
  const food = (id: string, courses = 1) => ({ kind: 'food' as const, id, sold: false, courses });

  it('holds 3; a fourth cannot be bought', () => {
    const run = townRun();
    run.foodShop = { node: 'lasttown', offers: [food('strong-swing'), food('long-arms'), food('lucky-charm'), food('deep-breath')], rerolls: 0, freeRerolls: 0, raised: false };
    for (let i = 0; i < 3; i++) expect(buy(run, i, 'food')).toBeNull();
    expect(buy(run, 3, 'food')).toBe('BAG IS FULL');
  });

  it('any number can be eaten before a course; none during one', () => {
    const run = townRun();
    run.bag = [{ id: 'strong-swing', courses: 1 }, { id: 'long-arms', courses: 1 }, { id: 'deep-breath', courses: 1 }];
    expect(eat(run, 0)).toBeNull();
    expect(eat(run, 0)).toBeNull();
    expect(run.fed).toHaveLength(2);
    playOne(run);
    run.status = 'course';
    expect(cannotEat(run, 0)).toBe('NOT DURING A COURSE');
  });

  it('a 3-course food works for exactly three courses', () => {
    const run = townRun();
    run.bag = [{ id: 'strong-swing', courses: 3 }];
    const base = runStats(run).get('shotPower');
    eat(run, 0);
    for (let k = 0; k < 3; k++) {
      expect(runStats(run).get('shotPower')).toBeCloseTo(base + 0.1);
      playOne(run);
    }
    expect(runStats(run).get('shotPower')).toBeCloseTo(base);
    expect(run.fed).toEqual([]);
  });

  it('foods stack: two Chili Peppers give +20%', () => {
    const run = townRun();
    run.bag = [{ id: 'strong-swing', courses: 1 }, { id: 'strong-swing', courses: 2 }];
    const base = runStats(run).get('shotPower');
    eat(run, 0);
    eat(run, 0);
    expect(runStats(run).get('shotPower')).toBeCloseTo(base + 0.2);
    playOne(run);
    expect(runStats(run).get('shotPower')).toBeCloseTo(base + 0.1);
  });

  it('Mushroom Stew heals 1 when eaten; when it wears off, health is trimmed to the new maximum', () => {
    const run = townRun();
    const max = runStats(run).get('maxHealth');
    run.bag = [{ id: 'tough-shell', courses: 1 }];
    eat(run, 0);
    expect(runStats(run).get('maxHealth')).toBe(max + 1);
    expect(run.health).toBe(max + 1);
    playOne(run);
    expect(runStats(run).get('maxHealth')).toBe(max);
    expect(run.health).toBe(max);
  });

  it('Apple heals 2 at once (not at full health); Garlic raises the countdown at once, at most 3 times a region', () => {
    const run = townRun();
    run.bag = [{ id: 'heal', courses: 0 }];
    expect(cannotEat(run, 0)).toBe('HEALTH IS FULL');
    run.health = 1;
    expect(eat(run, 0)).toBeNull();
    expect(run.health).toBe(3);
    const before = run.countdown;
    run.bag = [{ id: 'raise', courses: 0 }];
    expect(eat(run, 0)).toBeNull();
    expect(run.countdown).toBe(before + 1);
    run.raises = RUN.maxRaises;
    run.bag = [{ id: 'raise', courses: 0 }];
    expect(cannotEat(run, 0)).toBe('NO RAISES LEFT');
  });

  it('Garlic can be bought once per shop, as Delay the Boss could', () => {
    const run = townRun();
    run.foodShop = { node: 'lasttown', offers: [food('raise', 0), food('raise', 0)], rerolls: 0, freeRerolls: 0, raised: false };
    expect(buy(run, 0, 'food')).toBeNull();
    expect(buy(run, 1, 'food')).toBe('NO RAISES LEFT');
  });

  it('acorns eaten go into the next courses as extra wheel slices', () => {
    const run = townRun();
    run.bag = [{ id: 'golden-acorn', courses: 2 }];
    eat(run, 0);
    expect(loadoutOf(run).acorns).toEqual(['golden-acorn']);
  });

  it('food eaten on a course keeps working afterwards for the rest it lasts; stashed food goes into the bag', () => {
    const run = townRun();
    playOne(run, [{ id: 'golden-acorn', eaten: false }]);
    expect(run.bag).toHaveLength(1);
    expect(run.bag[0]!.id).toBe('golden-acorn');
    expect([1, 2, 3]).toContain(run.bag[0]!.courses);
    // Eaten: this course was its first; a 2- or 3-course acorn is still working (1 or 2 courses left).
    for (let i = 0; i < 12; i++) {
      const r = townRun(`EAT${i}`);
      playOne(r, [{ id: 'star-acorn', eaten: true }]);
      expect(r.bag).toEqual([]);
      const left = r.fed.find((f) => f.id === 'star-acorn')?.left ?? 0;
      expect([0, 1, 2]).toContain(left);
    }
  });

});

describe('food picked up on a course (owner, 2026-11-21)', () => {
  const acornField = () => {
    const rows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x === 0 || y === 0 || x === 11 || y === 4 ? 'g8' : 'g4')).join(' '));
    const r = parseCourse({ format: 3, name: 'acorn', legend: { g: 'grass' }, tiles: rows, start: [1, 2], exit: [10, 3], quota: 0, objects: [{ id: 'star-acorn', at: [4, 2] }] });
    if (!r.ok) throw new Error(r.errors.join('\n'));
    return r.course;
  };
  const roll = (bagRoom: number) => {
    const p = createPlay(acornField(), T, { seed: 'f', loadout: { bagRoom } });
    takeShot(p, ground(0.4));
    runShot(p);
    return p;
  };

  it('asks: eat it now or stash it. Eaten, it works at once', () => {
    const p = roll(2);
    expect(p.foodPending).toEqual(['star-acorn']);
    decideFood(p, true);
    expect(p.acornSlices).toBe(5);
    expect(p.foods).toEqual([{ id: 'star-acorn', eaten: true }]);
  });

  it('stashed, it goes in the bag after the course and does nothing now', () => {
    const p = roll(2);
    decideFood(p, false);
    expect(p.acornSlices).toBe(0);
    expect(p.bagRoom).toBe(1);
    expect(p.foods).toEqual([{ id: 'star-acorn', eaten: false }]);
    expect(drainLog(p)).toContainEqual({ kind: 'foodStashed', item: 'star-acorn' });
  });

  it('with the bag full, it is eaten at once without asking', () => {
    const p = roll(0);
    expect(p.foodPending).toEqual([]);
    expect(p.acornSlices).toBe(5);
    expect(drainLog(p)).toContainEqual({ kind: 'foodEaten', item: 'star-acorn', auto: true });
  });

  it('still undecided when the course ends: stashed if it fits', () => {
    const p = roll(1);
    settleFood(p);
    expect(p.foods).toEqual([{ id: 'star-acorn', eaten: false }]);
  });
});

describe('saves from before round 2a', () => {
  it('a run saved with a pocket acorn loads with the acorn in the bag', () => {
    const run = townRun('OLD');
    const snap = JSON.parse(JSON.stringify({ ...run, map: undefined })) as Record<string, unknown>;
    delete snap.bag;
    delete snap.fed;
    delete snap.found;
    delete snap.foodShop;
    delete snap.map;
    snap.pocket = 'golden-acorn';
    snap.shop = { node: 'lasttown', offers: [{ kind: 'gear', id: 'iron-shell', sold: false }, { kind: 'upgrade', id: 'deep-breath', sold: false }], rerolls: 0, freeRerolls: 0, raised: false };
    const text = JSON.stringify({ version: 2, profile: emptySave().profile, burrow: emptySave().burrow, run: snap });
    const back = decodeSave(text);
    expect(back.broken).toEqual([]);
    const r = back.data.run!;
    expect(r.bag).toEqual([{ id: 'golden-acorn', courses: 1 }]);
    expect(r.shop!.offers.map((o) => o.kind)).toEqual(['gear']);
    // Saves again in the new format.
    expect(decodeSave(encodeSave(back.data)).broken).toEqual([]);
  });
});
