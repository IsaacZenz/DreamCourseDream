/**
 * Milestone 7: blue stars, permanent upgrades, the Burrow's hold and selling,
 * the boss's prize, region two, and the save file (design sheet
 * docs/plans/milestone-7.md sections 4 to 7).
 */
import { describe, expect, it } from 'vitest';
import { GEAR } from '../src/content/gear';
import { generateRunMap } from '../src/gen/runMap';
import { pickBoss } from '../src/gen/boss';
import { buyLevel, buyUnlock, chooseStartingAbility, cleanProfile, newProfile, nextCost, sellValue, type Profile } from '../src/sim/profile';
import {
  DEFAULT_BOSS,
  budgetFor,
  chooseReward,
  createRun,
  enterNode,
  finishCourse,
  holdCategories,
  restoreRun,
  runStats,
  saveRun,
  sellHoused,
  setGear,
  settleCategory,
  sortCandidates,
  startRegion,
  visitBurrow,
  type RunState,
} from '../src/sim/run';
import { emptySave, parseSave, serializeSave } from '../src/save/saveData';

function newRun(profile: Profile = newProfile(), seed = 'PROG'): RunState {
  return createRun(seed, generateRunMap(seed), profile, pickBoss(seed, 1));
}

function finish(run: RunState, won = true, blueStars = 0): void {
  finishCourse(run, { won, lostBy: won ? null : 'health', health: won ? run.health : 0, wallet: run.wallet, ability: run.ability, gear: run.gear, blueStars });
}

/** Pretend the run is in a town. */
function inTown(run: RunState): void {
  run.status = 'shop';
  run.current = { id: 'r3l0', row: 3, type: 'shop', early: false, budget: 0, courseSeed: '', gear: null, boss: null };
  run.shop = { node: 'r3l0', offers: [], rerolls: 0, freeRerolls: 0, raised: false };
}

describe('permanent upgrades (sheet section 5)', () => {
  it('costs rise per level; buying needs stashed blue stars; the top level stops', () => {
    const p = newProfile();
    expect(buyLevel(p, 'vitality')).toBe('NOT ENOUGH BLUE STARS');
    p.stash = 100;
    const paid = [];
    for (let i = 0; i < 5; i++) {
      paid.push(nextCost(p, 'vitality'));
      expect(buyLevel(p, 'vitality')).toBeNull();
    }
    expect(paid).toEqual([2, 4, 6, 9, 12]);
    expect(buyLevel(p, 'vitality')).toBe('TOP LEVEL');
    expect(p.stash).toBe(100 - 33);
  });

  it('apply to the next run: health, shots, Head Start yellow stars, shop prices, luck', () => {
    const p = newProfile();
    p.stash = 100;
    buyLevel(p, 'vitality');
    buyLevel(p, 'stamina');
    buyLevel(p, 'head-start');
    buyLevel(p, 'haggler');
    buyLevel(p, 'fortune');
    const run = newRun(p);
    const s = runStats(run);
    expect(s.get('maxHealth')).toBe(6);
    expect(run.health).toBe(6);
    expect(s.get('maxShots')).toBe(5);
    expect(run.wallet).toBe(10);
    expect(s.get('shopPrices')).toBeCloseTo(0.9);
    expect(s.get('dropLuck')).toBeCloseTo(1.1);
  });

  it('the starting ability: unlock once for 8, then any built ability (owner)', () => {
    const p = newProfile();
    p.stash = 8;
    expect(chooseStartingAbility(p, 'hop')).toBe(false);
    expect(buyUnlock(p, 'startingAbility')).toBeNull();
    expect(p.stash).toBe(0);
    expect(chooseStartingAbility(p, 'tornado')).toBe(true);
    expect(newRun(p).ability).toBe('tornado');
  });

  it('a saved profile is checked: unknown things dropped, levels above the top lowered', () => {
    const p = cleanProfile({ stash: 5.7, levels: { vitality: 99, nonsense: 3 }, unlocks: { startingAbility: true }, startingAbility: 'nope', burrow: { weapon: 'tough-hide', armour: 'tough-hide' }, hold: ['tough-hide', 'zzz'] });
    expect(p.stash).toBe(5);
    expect(p.levels).toEqual({ vitality: 5 });
    expect(p.startingAbility).toBeNull();
    expect(p.burrow).toEqual({ weapon: null, armour: 'tough-hide', bauble: null });
    expect(p.hold).toEqual(['tough-hide']);
  });
});

describe('blue stars (sheet section 4; owner 2026-11-16: carried until stashed)', () => {
  it('courses give a 50% chance of 1, hard courses 2; they are carried, not stashed', () => {
    let got = 0;
    for (let i = 0; i < 40; i++) {
      const run = newRun(newProfile(), `B${i}`);
      enterNode(run, run.map.rows[0]![0]!.id);
      finish(run);
      got += run.blueStars;
      expect(run.profile.stash).toBe(0);
    }
    expect(got).toBeGreaterThan(8);
    expect(got).toBeLessThan(32);
  });

  it('visiting the Burrow stashes them; dying loses the ones still carried', () => {
    const run = newRun();
    run.blueStars = 3;
    inTown(run);
    expect(visitBurrow(run)).toBe(3);
    expect(run.profile.stash).toBe(3);
    run.status = 'map';
    run.blueStars = 2;
    enterNode(run, run.map.rows[run.at ? 1 : 0]![0]!.id);
    finish(run, false);
    expect(run.status).toBe('lost');
    expect(run.profile.stash).toBe(3);
    expect(run.totals.blueLost).toBe(2);
    expect(run.profile.lastRun?.result).toBe('died');
  });

  it('beating a boss gives its blue stars, stashes everything carried, heals fully, and offers a prize', () => {
    const run = newRun();
    run.blueStars = 2;
    run.health = 1;
    run.status = 'course';
    run.current = { id: 'boss', row: 9, type: 'boss', early: false, budget: 0, courseSeed: 'X', gear: null, boss: { ...DEFAULT_BOSS, colour: 'rainbow' } };
    finish(run);
    expect(run.profile.stash).toBe(2 + 5 + 2);
    expect(run.blueStars).toBe(0);
    expect(run.health).toBe(runStats(run).get('maxHealth'));
    expect(run.status).toBe('reward');
    expect(run.reward!.offers.map((id) => GEAR.get(id)!.category)).toEqual(['weapon', 'armour', 'bauble']);
  });
});

describe('the prize, the hold and selling (owner, 2026-11-16)', () => {
  function rewardRun(): RunState {
    const run = newRun();
    run.status = 'reward';
    run.reward = { offers: ['studded-shell', 'tough-hide', 'star-magnet'] };
    return run;
  }

  it('the item a prize replaces goes to the Burrow, or the hold when that slot is full', () => {
    const a = rewardRun();
    setGear(a, 'thick-hide');
    chooseReward(a, 1);
    expect(a.gear.armour).toBe('tough-hide');
    expect(a.burrow.armour).toBe('thick-hide');
    expect(a.status).toBe('region');

    const b = rewardRun();
    setGear(b, 'thick-hide');
    b.burrow.armour = 'padded-lining';
    chooseReward(b, 1);
    expect(b.burrow.armour).toBe('padded-lining');
    expect(b.profile.hold).toEqual(['thick-hide']);
    expect(holdCategories(b)).toEqual(['armour']);
  });

  it('sorting the hold: keep one to wear and one to house, the rest sold for 25% rounded down', () => {
    const run = newRun();
    setGear(run, 'tough-hide');
    run.burrow.armour = 'thick-hide';
    run.profile.hold = ['padded-lining'];
    inTown(run);
    const list = sortCandidates(run, 'armour');
    expect(list).toEqual(['tough-hide', 'thick-hide', 'padded-lining']);
    const before = run.wallet;
    expect(settleCategory(run, 'armour', 2, 0)).toBe(sellValue('thick-hide'));
    expect(run.gear.armour).toBe('padded-lining');
    expect(run.burrow.armour).toBe('tough-hide');
    expect(run.profile.hold).toEqual([]);
    expect(run.wallet).toBe(before + sellValue('thick-hide'));
    expect(settleCategory(run, 'armour', 0, 0)).toBe('ONE ITEM CANNOT BE IN TWO PLACES');
  });

  it('sells the housed item for 25% of its price, rounded down, only in a town', () => {
    const run = newRun();
    run.burrow.weapon = 'studded-shell';
    expect(sellHoused(run, 'weapon')).toBe(0);
    inTown(run);
    const price = GEAR.get('studded-shell')!.price;
    expect(sellHoused(run, 'weapon')).toBe(Math.floor(price * 0.25));
    expect(run.burrow.weapon).toBeNull();
  });
});

describe('region two (sheet section 6)', () => {
  it('starts at budget 18 with a fresh countdown, a new map and a different bug', () => {
    const run = newRun();
    run.status = 'region';
    run.counted = 6;
    const boss2 = pickBoss(run.seed, 2, run.met);
    startRegion(run, generateRunMap(`${run.seed}-R2`), boss2);
    expect(run.region).toBe(2);
    expect(run.countdown).toBe(7);
    expect(budgetFor(run, 'course')).toBe(18);
    expect(run.boss.bug).not.toBe(run.met[0]);
    const cur = enterNode(run, run.map.rows[0]![0]!.id);
    expect(cur.courseSeed).toContain('-R2-');
  });

  it('after the region-two boss the run is complete, with every blue star stashed', () => {
    const run = newRun();
    run.region = 2;
    run.status = 'reward';
    run.reward = { offers: [] };
    run.blueStars = 4;
    chooseReward(run, null);
    expect(run.status).toBe('won');
    expect(run.profile.stash).toBe(4);
    expect(run.profile.lastRun?.result).toBe('won');
  });
});

describe('the save (sheet section 7)', () => {
  it('a run saved in a town comes back exactly, shop included', () => {
    const run = newRun();
    inTown(run);
    run.wallet = 33;
    run.shop!.offers = [{ kind: 'heal', id: 'heal', sold: true }];
    const text = serializeSave({ profile: run.profile, run: saveRun(run), runActive: true });
    const parsed = parseSave(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = restoreRun(parsed.data.run, generateRunMap(run.seed), parsed.data.profile)!;
    expect(back).toBeTruthy();
    expect(back.wallet).toBe(33);
    expect(back.shop!.offers[0]!.sold).toBe(true);
    expect(back.status).toBe('shop');
  });

  it('only a run in a town can be restored', () => {
    const run = newRun();
    expect(restoreRun(saveRun(run), run.map, newProfile())).toBeNull();
  });

  it('unreadable saves are reported, not thrown; the Milestone 6 Burrow moves in', () => {
    expect(parseSave('{ not json').ok).toBe(false);
    expect(parseSave(JSON.stringify({ version: 99, profile: {} })).ok).toBe(false);
    const moved = parseSave(null, JSON.stringify({ version: 1, slots: { weapon: 'studded-shell', armour: null, bauble: 'nope' } }));
    expect(moved.ok && moved.migratedBurrow).toBe(true);
    if (moved.ok) expect(moved.data.profile.burrow).toEqual({ weapon: 'studded-shell', armour: null, bauble: null });
    expect(parseSave(serializeSave(emptySave())).ok).toBe(true);
  });
});
