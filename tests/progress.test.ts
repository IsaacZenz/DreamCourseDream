/**
 * Milestone 7: blue stars and the deposit, permanent upgrades, starting
 * abilities, and the save (docs/plans/milestone-7.md sections 4 to 6).
 */
import { describe, expect, it } from 'vitest';
import { generateRunMap } from '../src/gen/runMap';
import { buyAbility, buyUpgrade, cannotBuyUpgrade, cycleStartAbility, newProfile, upgradeCost } from '../src/sim/profile';
import { buyPermanentInTown, choices, createRun, drainDeposit, enterNode, finishCourse, leaveShop, runStats, type RunState } from '../src/sim/run';
import { decodeSave, emptySave, encodeSave, restoreRun, snapshotRun } from '../src/save/saveData';

function newRun(seed = 'PROG', levels: Record<string, number> = {}, startAbility: string | null = null): RunState {
  return createRun(seed, generateRunMap(seed), undefined, { levels, startAbility });
}
function win(run: RunState, blueStars = 0): void {
  finishCourse(run, { won: true, lostBy: null, health: run.health, wallet: run.wallet, ability: run.ability, gear: run.gear, blueStars });
}
function lose(run: RunState, blueStars = 0): void {
  finishCourse(run, { won: false, lostBy: 'health', health: 0, wallet: run.wallet, ability: run.ability, gear: run.gear, blueStars });
}
/** Play nodes along the left-most choice until a town is entered. */
function toTown(run: RunState): void {
  for (let i = 0; i < 40; i++) {
    const town = choices(run).find((n) => n.type === 'shop');
    if (town) {
      enterNode(run, town.id);
      return;
    }
    const node = choices(run).find((n) => n.type === 'course') ?? choices(run)[0]!;
    enterNode(run, node.id);
    if (run.status === 'course') win(run);
    else if (run.status === 'cache') {
      run.cache = null;
      run.status = 'map';
    }
  }
  throw new Error('no town found');
}

describe('blue stars: carried, then deposited (owner, 2026-11-17)', () => {
  it('a course gives 1, a hard course 2, plus what was picked up; all carried, not yet in the stash', () => {
    const run = newRun();
    enterNode(run, choices(run)[0]!.id);
    win(run, 1);
    expect(run.blueStars).toBe(2);
    expect(run.banked).toBe(0);
    expect(drainDeposit(run)).toBe(0);
  });

  it('reaching a town deposits everything carried', () => {
    const run = newRun('TOWN4');
    toTown(run);
    expect(run.blueStars).toBe(0);
    expect(run.banked).toBeGreaterThan(0);
    expect(drainDeposit(run)).toBe(run.banked);
    expect(drainDeposit(run)).toBe(0);
  });

  it('dying loses what is carried', () => {
    const run = newRun();
    enterNode(run, choices(run)[0]!.id);
    win(run, 3);
    enterNode(run, choices(run)[0]!.id);
    lose(run, 1);
    expect(run.status).toBe('lost');
    expect(run.banked).toBe(0);
    expect(drainDeposit(run)).toBe(0);
  });

  it('beating the boss deposits its 5 and everything carried, and records the boss', () => {
    const run = newRun();
    run.countdown = 0;
    run.blueStars = 4;
    const boss = choices(run).find((n) => n.id === 'boss')!;
    enterNode(run, boss.id);
    win(run);
    expect(run.banked).toBe(9);
    expect(run.blueStars).toBe(0);
    expect(run.bossesBeaten).toEqual(['stagwarden']);
  });
});

describe('permanent upgrades and abilities', () => {
  it('costs rise per level; the top level cannot be bought; no refunds', () => {
    const p = newProfile();
    p.stash = 100;
    expect(upgradeCost(p, 'vitality')).toBe(5);
    expect(buyUpgrade(p, 'vitality')).toBeNull();
    expect(upgradeCost(p, 'vitality')).toBe(8);
    expect(p.stash).toBe(95);
    for (let i = 0; i < 2; i++) buyUpgrade(p, 'fortune');
    expect(buyUpgrade(p, 'fortune')).toBeNull();
    expect(cannotBuyUpgrade(p, 'fortune')).toBe('TOP LEVEL');
    p.stash = 0;
    expect(cannotBuyUpgrade(p, 'knack')).toBe('NOT ENOUGH BLUE STARS');
  });

  it('levels apply to a new run as modifiers: Vitality, Stamina, Head Start, Haggler, Fortune, Knack', () => {
    const run = newRun('P', { vitality: 1, stamina: 2, 'head-start': 1, haggler: 3, fortune: 1, knack: 2 });
    const s = runStats(run);
    expect(s.get('maxHealth')).toBe(6);
    expect(run.health).toBe(6);
    expect(s.get('maxShots')).toBe(6);
    expect(run.wallet).toBe(10);
    expect(s.get('shopPrices')).toBeCloseTo(0.7);
    expect(s.get('dropLuck')).toBeCloseTo(1.1);
    expect(s.get('rollSlices')).toBe(2);
  });

  it('each ability is bought separately for 8; the toggle steps through none and the ones owned', () => {
    const p = newProfile();
    p.stash = 20;
    expect(buyAbility(p, 'hop')).toBeNull();
    expect(p.startAbility).toBe('hop');
    expect(buyAbility(p, 'hop')).toBe('OWNED');
    expect(buyAbility(p, 'anchor')).toBeNull();
    expect(p.stash).toBe(4);
    expect(buyAbility(p, 'burner')).toBe('NOT ENOUGH BLUE STARS');
    cycleStartAbility(p, 1);
    expect(p.startAbility).toBe(null);
    cycleStartAbility(p, 1);
    expect(p.startAbility).toBe('anchor');
    expect(newRun('A', {}, 'anchor').ability).toBe('anchor');
  });

  it('an upgrade bought in a town works at once (owner, 2026-11-17, question I)', () => {
    const run = newRun('TOWN4');
    toTown(run);
    const p = newProfile();
    p.stash = 10;
    const before = runStats(run).get('maxHealth');
    expect(buyPermanentInTown(run, p, 'vitality')).toBeNull();
    expect(runStats(run).get('maxHealth')).toBe(before + 1);
    expect(p.levels.vitality).toBe(1);
    leaveShop(run);
    expect(buyPermanentInTown(run, p, 'vitality')).toBe('ONLY IN A TOWN');
  });
});

describe('the save', () => {
  it('round-trips the profile, the Burrow and a run in a town', () => {
    const run = newRun('TOWN4');
    toTown(run);
    const p = newProfile();
    p.stash = 7;
    p.levels.vitality = 2;
    p.abilities.push('hop');
    p.startAbility = 'hop';
    const text = encodeSave({ profile: p, burrow: { weapon: 'iron-shell', armour: null, bauble: null }, run: snapshotRun(run) });
    const back = decodeSave(text);
    expect(back.broken).toEqual([]);
    expect(back.data.profile).toEqual(p);
    expect(back.data.burrow.weapon).toBe('iron-shell');
    const again = restoreRun(back.data.run!, generateRunMap(run.seed));
    expect({ ...again, map: null }).toEqual({ ...run, map: null });
    expect(again.shop!.offers).toEqual(run.shop!.offers);
  });

  it('nothing saved: an empty save', () => {
    expect(decodeSave(null)).toEqual({ data: emptySave(), broken: [] });
  });

  it('unreadable text or a newer version never crashes: starts empty and reports it', () => {
    expect(decodeSave('{not json').broken).toEqual(['save']);
    expect(decodeSave(JSON.stringify({ version: 99 })).broken).toEqual(['save']);
    expect(decodeSave('{"version":1,"profile":{"stash":"lots"}}').data.profile).toEqual(newProfile());
  });

  it('each part is checked on its own: a damaged run save keeps the stash', () => {
    const p = newProfile();
    p.stash = 12;
    const text = JSON.stringify({ version: 1, profile: p, burrow: null, run: { seed: 5 } });
    const back = decodeSave(text);
    expect(back.broken).toEqual(['run']);
    expect(back.data.profile.stash).toBe(12);
    expect(back.data.run).toBeNull();
  });

  it('a run not in a town is never read back (closing outside a town loses it)', () => {
    const run = newRun();
    const back = decodeSave(encodeSave({ profile: newProfile(), burrow: { weapon: null, armour: null, bauble: null }, run: snapshotRun(run) }));
    expect(back.data.run).toBeNull();
    expect(back.broken).toEqual(['run']);
  });

  it('unknown upgrades and gear are dropped; levels are kept in range', () => {
    const text = JSON.stringify({ version: 1, profile: { ...newProfile(), levels: { vitality: 99, mystery: 2 } }, burrow: { weapon: 'no-such-thing', armour: null, bauble: null }, run: null });
    const back = decodeSave(text);
    expect(back.data.profile.levels).toEqual({ vitality: 5 });
    expect(back.data.burrow.weapon).toBeNull();
  });
});

describe('save version 2 (Milestone 8: insect names)', () => {
  it('an old save that beat the Warden now says it beat the Stagwarden', async () => {
    const { decodeSave } = await import('../src/save/saveData.ts');
    const { newProfile } = await import('../src/sim/profile.ts');
    const p = { ...newProfile(), bossesBeaten: ['warden'] };
    const loaded = decodeSave(JSON.stringify({ version: 1, profile: p, burrow: null, run: null }));
    expect(loaded.broken).toEqual([]);
    expect(loaded.data.profile.bossesBeaten).toEqual(['stagwarden']);
  });
});
