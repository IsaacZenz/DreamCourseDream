/**
 * Milestone 7: success rolls (owner, 2026-11-17; docs/plans/milestone-7.md
 * section 4b), the twelve slice-perk gear items and acorns.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { GEAR, GEAR_LIST, SLICES_BY_RARITY } from '../src/content/gear';
import { OBJECTS, type EnemyDef } from '../src/content/objects';
import { parseCourse, type Course } from '../src/sim/course';
import { createPlay, runShot, takeShot, wheelFor, drainLog, type Loadout, type PlayEvent, type PlayState } from '../src/sim/play';
import type { Modifier } from '../src/sim/stats';

const T = DEFAULT_TUNING;

function field(extra: Record<string, unknown> = {}): Course {
  const rows: string[] = [];
  for (let y = 0; y < 5; y++) {
    const row: string[] = [];
    for (let x = 0; x < 12; x++) row.push(x === 0 || y === 0 || x === 11 || y === 4 ? 'g2' : 'g1');
    rows.push(row.join(' '));
  }
  const r = parseCourse({ format: 2, name: 'roll test', legend: { g: 'grass' }, tiles: rows, start: [1, 2], exit: [10, 3], quota: 0, ...extra });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

const slices = (n: number, stat: 'rollSlices' | 'bossSlices' = 'rollSlices'): Modifier => ({ stat, op: 'add', amount: n, source: { kind: 'run', id: 'test' }, duration: { kind: 'run' } });
const weapon = (id: string | null, armour: string | null = null, bauble: string | null = null) => ({ weapon: id, armour, bauble });

/** A Trundler standing still in front of the ball, hit once with a ground shot. */
function hitOnce(seed: string, lo: Loadout): { play: PlayState; log: PlayEvent[] } {
  const c = field({ objects: [{ id: 'trundler', at: [6, 2], path: [[6, 2]] }] });
  const play = createPlay(c, T, { seed, loadout: lo });
  play.ball = { ...play.ball, x: 1.5, y: 2.5 };
  takeShot(play, { angle: 0, power: 0.6, type: 'ground', topSpin: 0, sideSpin: 0 });
  runShot(play);
  return { play, log: drainLog(play) };
}
const rolls = (log: PlayEvent[]) => log.filter((e): e is Extract<PlayEvent, { kind: 'roll' }> => e.kind === 'roll');

/** Pretend the first enemy is a boss (tier 5), to see the boss wheel. */
function asBoss(play: PlayState) {
  const e = play.enemies[0]!;
  return { ...e, def: { ...(e.def as EnemyDef), tier: 5 } };
}

describe('the success wheel', () => {
  it('weapons fill slices by rarity: 2, 3, 4, 5, 6, 7; armour and baubles fill none themselves', () => {
    expect(Object.values(SLICES_BY_RARITY)).toEqual([2, 3, 4, 5, 6, 7]);
    for (const g of GEAR_LIST) expect(g.slices).toBe(g.category === 'weapon' ? SLICES_BY_RARITY[g.rarity] : 0);
    expect(['bonk-knob', 'thump-knob', 'clang-knob', 'gong-knob'].map((id) => GEAR.get(id)!.slices)).toEqual([2, 3, 4, 5]);
  });

  it('a 10-slice wheel, and a 20-slice boss wheel with the same slices filled', () => {
    const { play } = hitOnce('w', { gear: weapon('bonk-knob') });
    expect(wheelFor(play, play.enemies[0]!)).toEqual({ filled: 2, size: 10 });
    expect(wheelFor(play, asBoss(play))).toEqual({ filled: 2, size: 20 });
  });

  it('Knack and Spinners add to every wheel; Grit adds to the boss wheel only; Golden Spinner shrinks the boss wheel', () => {
    let p = createPlay(field({ objects: [{ id: 'mossback', at: [6, 2] }] }), T, { seed: 'k', loadout: { gear: weapon('bonk-knob', 'grit-pads', 'brass-spinner'), modifiers: [slices(2)] } });
    expect(wheelFor(p, p.enemies[0]!)).toEqual({ filled: 5, size: 10 });
    expect(wheelFor(p, asBoss(p))).toEqual({ filled: 7, size: 20 });
    p = createPlay(field({ objects: [{ id: 'mossback', at: [6, 2] }] }), T, { seed: 'k', loadout: { gear: weapon('echo-shell', null, 'golden-spinner') } });
    expect(wheelFor(p, asBoss(p))).toEqual({ filled: 8, size: 15 });
  });

  it("never more slices filled than the wheel has; a full wheel always works", () => {
    const { play, log } = hitOnce('full', { gear: weapon('bonk-knob'), modifiers: [slices(30)] });
    expect(wheelFor(play, play.enemies[0]!)).toEqual({ filled: 10, size: 10 });
    expect(rolls(log)[0]).toMatchObject({ effect: 'stun', filled: 10, size: 10, success: true });
  });

  it('plain stat changes need no roll: a Shell weapon spins no wheel', () => {
    expect(rolls(hitOnce('s', { gear: weapon('studded-shell') }).log)).toHaveLength(0);
  });

  it('a common stun works about 2 times in 10', () => {
    let stuns = 0;
    const N = 300;
    for (let i = 0; i < N; i++) {
      const r = rolls(hitOnce(`rate${i}`, { gear: weapon('bonk-knob') }).log);
      expect(r).toHaveLength(1);
      if (r[0]!.success) stuns++;
    }
    expect(stuns / N).toBeGreaterThan(0.13);
    expect(stuns / N).toBeLessThan(0.27);
  });

  it('the same seed gives the same rolls', () => {
    const a = rolls(hitOnce('same', { gear: weapon('thump-knob') }).log);
    const b = rolls(hitOnce('same', { gear: weapon('thump-knob') }).log);
    expect(a).toEqual(b);
  });

  it("Fortune's Mail spins the first failed roll of a course again, once", () => {
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      const r = rolls(hitOnce(`fm${i}`, { gear: weapon('bonk-knob', 'fortunes-mail') }).log);
      if (!r[0]!.success) {
        expect(r).toHaveLength(2);
        expect(r[1]!.respun).toBe(true);
        seen = true;
      }
    }
    expect(seen).toBe(true);
  });

  it('Hot Streak Charm: a won roll fills one more slice for the rest of that shot', () => {
    for (let i = 0; i < 60; i++) {
      const { play, log } = hitOnce(`hs${i}`, { gear: weapon('bonk-knob', null, 'hot-streak-charm') });
      if (rolls(log)[0]!.success) {
        expect(wheelFor(play, play.enemies[0]!).filled).toBe(3);
        return;
      }
    }
    throw new Error('no success in 60 tries');
  });
});

describe('acorns', () => {
  it('a pocket acorn is used as the course starts', () => {
    const p = createPlay(field({ objects: [{ id: 'mossback', at: [6, 2] }] }), T, { seed: 'a', loadout: { gear: weapon('bonk-knob'), acorn: 'golden-acorn' } });
    expect(drainLog(p)).toContainEqual({ kind: 'acorn', item: 'golden-acorn', slices: 3 });
    expect(wheelFor(p, p.enemies[0]!).filled).toBe(5);
  });

  it('an acorn on the ground works at once for the rest of the course', () => {
    const p = createPlay(field({ objects: [{ id: 'mossback', at: [8, 2] }, { id: 'star-acorn', at: [4, 2] }] }), T, { seed: 'b', loadout: { gear: weapon('bonk-knob') } });
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    takeShot(p, { angle: 0, power: 0.4, type: 'ground', topSpin: 0, sideSpin: 0 });
    runShot(p);
    expect(drainLog(p)).toContainEqual({ kind: 'acorn', item: 'star-acorn', slices: 5 });
    expect(p.acornSlices).toBe(5);
  });

  it('crates can drop blue stars and acorns (owner, 2026-11-17)', () => {
    const crate = OBJECTS.get('crate')!;
    const secured = OBJECTS.get('secured-crate')!;
    const cracked = OBJECTS.get('cracked-tile')!;
    expect(crate.kind === 'breakable' && [crate.blueStarChance, crate.acornChance]).toEqual([0.02, 0.04]);
    expect(secured.kind === 'breakable' && [secured.blueStarChance, secured.acornChance]).toEqual([0.05, 0.1]);
    expect(cracked.kind === 'breakable' && cracked.blueStarChance).toBe(0.05);
  });

  it('a blue star picked up is carried on the course', () => {
    const p = createPlay(field({ objects: [{ id: 'blue-star', at: [4, 2] }] }), T, { seed: 'c' });
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    takeShot(p, { angle: 0, power: 0.4, type: 'ground', topSpin: 0, sideSpin: 0 });
    runShot(p);
    expect(p.blueStars).toBe(1);
    expect(p.meter).toBe(0);
  });
});

describe('acorns in the run', () => {
  it('a shop acorn goes in the pocket, is taken into the next course, and the pocket empties', async () => {
    const { createRun, buy, cannotBuy, leaveShop, choices, enterNode, loadoutOf } = await import('../src/sim/run');
    const { generateRunMap } = await import('../src/gen/runMap');
    const run = createRun('ACORN', generateRunMap('ACORN'));
    run.status = 'shop';
    run.current = { id: 'lasttown', row: 1, type: 'shop', early: false, budget: 0, courseSeed: '', gear: null, acorn: null };
    run.shop = { node: 'lasttown', offers: [{ kind: 'acorn', id: 'lucky-acorn', sold: false }, { kind: 'acorn', id: 'golden-acorn', sold: false }], rerolls: 0, freeRerolls: 0, raised: false };
    run.wallet = 30;
    expect(buy(run, 0)).toBeNull();
    expect(run.wallet).toBe(24);
    expect(run.pocket).toBe('lucky-acorn');
    expect(cannotBuy(run, run.shop.offers[1]!)).toBe('POCKET IS FULL');
    leaveShop(run);
    enterNode(run, choices(run)[0]!.id);
    expect(loadoutOf(run).acorn).toBe('lucky-acorn');
    expect(run.pocket).toBeNull();
  });
});
