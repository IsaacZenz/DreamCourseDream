/**
 * Milestone 8 round 1: statuses and elements (design sheet
 * docs/plans/milestone-8.md sections 2 and 3, signed off 2026-11-19).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { ELEMENT_RULES, OBJECTS, registerObjects, type EnemyDef } from '../src/content/objects';
import { parseCourse, type Course } from '../src/sim/course';
import type { ShotCommand } from '../src/sim/ball';
import { computeHit, wedgeOf } from '../src/sim/damage';
import { applyBallStatus, applyEnemyStatus, canShoot, createPlay, drainLog, runShot, takeShot, tick, type PlayEvent, type PlayState } from '../src/sim/play';

const T = DEFAULT_TUNING;
const LEGEND = { g: 'grass', '~': 'water', i: 'ice' };

function field(w: number, h: number, objects: unknown[] = [], set: Record<string, string> = {}): Course {
  const rows: string[] = [];
  for (let y = 0; y < h + 2; y++) {
    const row: string[] = [];
    for (let x = 0; x < w + 2; x++) {
      const edge = x === 0 || y === 0 || x === w + 1 || y === h + 1;
      row.push(set[`${x},${y}`] ?? (edge ? 'g5' : 'g1'));
    }
    rows.push(row.join(' '));
  }
  const r = parseCourse({ format: 3, name: 'm8 field', legend: LEGEND, tiles: rows, start: [1, 1], exit: [w, h], quota: 0, objects });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.3, type: 'ground', topSpin: 0, sideSpin: 0, ...over });

function fire(p: PlayState, cmd: ShotCommand): PlayEvent[] {
  takeShot(p, cmd);
  runShot(p);
  return drainLog(p);
}

const base = OBJECTS.get('snoozegrub') as EnemyDef;
if (!OBJECTS.has('t8-fire-roller')) {
  const roller = OBJECTS.get('mudroller') as EnemyDef;
  registerObjects([
    { ...roller, id: 't8-fire-roller', name: 'Test fire roller', element: 'fire' },
    { ...base, id: 't8-ice-grub', name: 'Test ice grub', element: 'ice', stats: { ...base.stats, health: 4 } },
    { ...base, id: 't8-tough', name: 'Test tough grub', stats: { ...base.stats, health: 6 } },
  ]);
}

describe('elements form a circle (owner, 2026-11-19)', () => {
  it('fire is weak to ice, ice to shock, shock to fire; each resists its own', () => {
    expect(ELEMENT_RULES.fire).toMatchObject({ weakTo: 'ice', resists: 'fire' });
    expect(ELEMENT_RULES.ice).toMatchObject({ weakTo: 'shock', resists: 'ice' });
    expect(ELEMENT_RULES.shock).toMatchObject({ weakTo: 'fire', resists: 'shock' });
  });
  it('an enemy with an element takes its weakness and resistance', () => {
    const p = createPlay(field(6, 4, [{ id: 't8-ice-grub', at: [4, 2] }]), T, { seed: 'e' });
    const e = p.enemies[0]!;
    expect(e.element).toBe('ice');
    expect(e.weakTo).toContain('shock');
    expect(e.resists).toContain('ice');
  });
});

describe('front, back and side (sheet section 4.2)', () => {
  it('the front and back are 90-degree wedges; the rest is the side', () => {
    expect(wedgeOf(2, 0, 0, 0, 1, 0)).toBe('front');
    expect(wedgeOf(-2, 0, 0, 0, 1, 0)).toBe('behind');
    expect(wedgeOf(0, 2, 0, 0, 1, 0)).toBe('side');
  });
  it('a side hit is neither guarded front nor weak back; a hit from above gets past a guarded front', () => {
    const t = { weakTo: [], resists: [], weakSpots: ['behind'], guardedSides: ['front'], shieldUp: false } as const;
    expect(computeHit({ base: 1, element: null, fromAbove: false, fromBehind: false, fromFront: false }, t)).toEqual({ damage: 1, blocked: false, shieldUsed: false });
    expect(computeHit({ base: 1, element: null, fromAbove: false, fromBehind: false, fromFront: true }, t).blocked).toBe(true);
    expect(computeHit({ base: 1, element: null, fromAbove: true, fromBehind: false, fromFront: true }, t).blocked).toBe(false);
    expect(computeHit({ base: 1, element: null, fromAbove: false, fromBehind: true }, t).damage).toBe(2);
  });
});

describe('Burning on the ball', () => {
  it('hurts 1 as each of the next 2 shots is taken, then ends', () => {
    const p = createPlay(field(8, 4), T, { seed: 'b' });
    applyBallStatus(p, 'burning');
    const h0 = p.health;
    fire(p, shot());
    expect(p.health).toBe(h0 - 1);
    fire(p, shot({ angle: Math.PI / 2 }));
    expect(p.health).toBe(h0 - 2);
    fire(p, shot({ angle: Math.PI }));
    expect(p.health).toBe(h0 - 2);
    expect(p.ballStatuses).toEqual([]);
  });
  it('water puts it out (owner, 2026-11-18)', () => {
    const set: Record<string, string> = {};
    for (let x = 3; x <= 4; x++) for (let y = 1; y <= 4; y++) set[`${x},${y}`] = '~1';
    const p = createPlay(field(8, 4, [], set), T, { seed: 'w' });
    applyBallStatus(p, 'burning');
    const log = fire(p, shot({ power: 0.8 }));
    expect(log.some((e) => e.kind === 'statusEnd' && e.target === 'ball' && e.status === 'burning')).toBe(true);
    expect(p.ballStatuses.some((s) => s.id === 'burning')).toBe(false);
  });
  it('a fire enemy that hurts the ball sets it burning', () => {
    const p = createPlay(field(8, 4, [{ id: 't8-fire-roller', at: [4, 1], path: [[1, 1]] }]), T, { seed: 'f' });
    for (let i = 0; i < 2000 && p.health === p.stats.get('maxHealth'); i++) tick(p);
    expect(p.health).toBeLessThan(p.stats.get('maxHealth'));
    expect(p.ballStatuses.map((s) => s.id)).toContain('burning');
  });
});

describe('Poisoned', () => {
  it('on the ball: hit damage -1, down to 0 (open question F1 default)', () => {
    const p = createPlay(field(6, 4), T, { seed: 'p' });
    applyBallStatus(p, 'poisoned');
    expect(p.stats.get('hitDamage')).toBe(0);
    fire(p, shot());
    fire(p, shot({ angle: Math.PI }));
    expect(p.stats.get('hitDamage')).toBe(1);
  });
  it('on an enemy: attack damage -1', () => {
    const p = createPlay(field(6, 4, [{ id: 'mudroller', at: [4, 2], path: [[4, 3]] }]), T, { seed: 'p2' });
    const e = p.enemies[0]!;
    applyEnemyStatus(p, e, 'poisoned');
    expect(e.stats.get('attackDamage')).toBe(0);
  });
});

describe('Chilled', () => {
  it('a chilled patroller stops; the next damaging hit does double and ends the chill', () => {
    const p = createPlay(field(8, 4, [{ id: 't8-tough', at: [3, 1] }]), T, { seed: 'c' });
    const e = p.enemies[0]!;
    applyEnemyStatus(p, e, 'chilled');
    fire(p, shot({ power: 0.6 }));
    expect(e.health).toBe(4);
    expect(e.statuses.some((s) => s.id === 'chilled')).toBe(false);
  });
  it('a chilled Mudroller stands still', () => {
    const p = createPlay(field(8, 4, [{ id: 'mudroller', at: [3, 3], path: [[7, 3]] }]), T, { seed: 'c2' });
    const e = p.enemies[0]!;
    applyEnemyStatus(p, e, 'chilled');
    const x = e.x;
    for (let i = 0; i < 120; i++) tick(p);
    expect(e.x).toBe(x);
  });
  it('a chilled ball rolls further on grass, as if on ice', () => {
    const far = (chill: boolean) => {
      const p = createPlay(field(30, 3), T, { seed: 'c3' });
      if (chill) applyBallStatus(p, 'chilled');
      fire(p, shot({ power: 0.3 }));
      return p.ball.x;
    };
    expect(far(true)).toBeGreaterThan(far(false) + 1);
  });
  it('fire and ice cancel: burning a chilled enemy removes both (owner, 2026-11-18)', () => {
    const p = createPlay(field(6, 4, [{ id: 't8-tough', at: [4, 2] }]), T, { seed: 'fc' });
    const e = p.enemies[0]!;
    applyEnemyStatus(p, e, 'chilled');
    applyEnemyStatus(p, e, 'burning');
    expect(e.statuses).toEqual([]);
    applyBallStatus(p, 'burning');
    applyBallStatus(p, 'chilled');
    expect(p.ballStatuses).toEqual([]);
  });
});

describe('Burner burns (owner, 2026-11-18, question 9)', () => {
  it('an enemy the Burner hits and does not defeat burns for 1 turn, with no roll', () => {
    const p = createPlay(field(10, 3, [{ id: 't8-tough', at: [5, 1] }]), T, { seed: 'bb', loadout: { ability: 'burner' } });
    const e = p.enemies[0]!;
    takeShot(p, shot({ power: 0.4 }));
    for (let i = 0; i < 4000 && p.phase === 'shot'; i++) tick(p, i === 3 ? { ability: true } : {});
    for (let i = 0; i < 4000 && !canShoot(p); i++) tick(p);
    const log = drainLog(p);
    expect(log.some((x) => x.kind === 'status' && x.target === e.uid && x.status === 'burning')).toBe(true);
    expect(log.some((x) => x.kind === 'roll')).toBe(false);
  });
});
