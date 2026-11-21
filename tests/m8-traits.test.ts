/**
 * Milestone 8 round 1: ranks, traits, weak spots and carried gear on placed
 * enemies (design sheet docs/plans/milestone-8.md sections 4 and 5).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { parseCourse, starsOnOffer, type Course } from '../src/sim/course';
import type { ShotCommand } from '../src/sim/ball';
import { canShoot, createPlay, drainLog, runShot, takeShot, tick, type PlayEvent, type PlayState } from '../src/sim/play';

const T = DEFAULT_TUNING;

function field(w: number, h: number, objects: unknown[] = []): Course {
  const rows: string[] = [];
  for (let y = 0; y < h + 2; y++) {
    const row: string[] = [];
    for (let x = 0; x < w + 2; x++) row.push(x === 0 || y === 0 || x === w + 1 || y === h + 1 ? 'g5' : 'g1');
    rows.push(row.join(' '));
  }
  const r = parseCourse({ format: 3, name: 'm8 traits', legend: { g: 'grass' }, tiles: rows, start: [1, 2], exit: [w, h], quota: 0, objects });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });
function fire(p: PlayState, cmd: ShotCommand): PlayEvent[] {
  takeShot(p, cmd);
  runShot(p);
  return drainLog(p);
}
const settle = (p: PlayState) => {
  for (let i = 0; i < 20000 && !canShoot(p) && p.status === 'playing'; i++) tick(p);
};

describe('course files: enemy extras', () => {
  it('reads rank, traits, element, spot and gear', () => {
    const c = field(6, 3, [{ id: 'mudroller', at: [4, 2], path: [[4, 3]], rank: 2, traits: ['swift', 'armoured'], element: 'shock', spot: 'weakBack', gear: 'studded-shell' }]);
    expect(c.objects[0]!.extras).toEqual({ rank: 2, traits: ['swift', 'armoured'], element: 'shock', spot: 'weakBack', gear: 'studded-shell' });
    const e = createPlay(c, T, { seed: 'e' }).enemies[0]!;
    // 2 + 2 (Elite) + 1 (Armoured)
    expect(e.health).toBe(5);
    expect(e.element).toBe('shock');
    expect(e.weakSpots).toContain('behind');
    expect(e.weakTo).toContain('fire');
  });
  it('rejects a trait the enemy cannot have, and extras on things that are not enemies', () => {
    const rows = ['g1 g1 g1 g1', 'g1 g1 g1 g1'];
    const bad = parseCourse({ format: 3, name: 'x', legend: { g: 'grass' }, tiles: rows, start: [0, 0], exit: [3, 1], quota: 0, objects: [{ id: 'mole-cricket', at: [2, 0], traits: ['explosive'] }, { id: 'rock', at: [1, 1], rank: 1 }] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.join('\n')).toContain('cannot be explosive');
      expect(bad.errors.join('\n')).toContain('only enemies take');
    }
  });
});

describe('ranks', () => {
  it('a Veteran has +1 health and an Elite +2; both are worth 2 stars (owner, 2026-11-18)', () => {
    const c = field(8, 3, [
      { id: 'snoozegrub', at: [3, 1] },
      { id: 'snoozegrub', at: [5, 1], rank: 1 },
      { id: 'snoozegrub', at: [7, 1], rank: 2 },
    ]);
    const p = createPlay(c, T, { seed: 'r' });
    expect(p.enemies.map((e) => e.health)).toEqual([1, 2, 3]);
    expect(p.enemies.map((e) => e.stars)).toEqual([1, 2, 2]);
    expect(starsOnOffer(c.objects)).toBe(5);
  });
});

describe('traits', () => {
  it('Shielded blocks the first hit of each shot', () => {
    const p = createPlay(field(8, 3, [{ id: 'snoozegrub', at: [4, 2], traits: ['shielded'], rank: 1 }]), T, { seed: 's' });
    const log = fire(p, shot({ power: 0.4 }));
    expect(log.some((e) => e.kind === 'hit' && e.blocked)).toBe(true);
  });
  it('Armoured gives +1 health', () => {
    const p = createPlay(field(6, 3, [{ id: 'snoozegrub', at: [4, 2], traits: ['armoured'] }]), T, { seed: 'a' });
    expect(p.enemies[0]!.health).toBe(2);
  });
  it('Swift patrollers move 1.6 times as fast', () => {
    const p = createPlay(field(10, 3, [{ id: 'mudroller', at: [3, 3], path: [[9, 3]] }, { id: 'mudroller', at: [3, 1], path: [[9, 1]], traits: ['swift'] }]), T, { seed: 'sw' });
    for (let i = 0; i < 120; i++) tick(p);
    const [a, b] = p.enemies;
    expect((b!.x - 3.5) / (a!.x - 3.5)).toBeCloseTo(1.6, 1);
  });
  it('Regenerating heals 1 each enemy turn', () => {
    const p = createPlay(field(8, 3, [{ id: 'mudroller', at: [6, 3], path: [[7, 3]], traits: ['regenerating'], rank: 2 }]), T, { seed: 'g' });
    const e = p.enemies[0]!;
    e.health = 1;
    fire(p, shot({ power: 0.2, angle: Math.PI / 2 }));
    expect(e.health).toBe(2);
  });
  it('Splitting lets out two Grublets worth 1 star each', () => {
    const p = createPlay(field(8, 3, [{ id: 'snoozegrub', at: [4, 2], traits: ['splitting'] }]), T, { seed: 'sp' });
    const log = fire(p, shot({ power: 0.5 }));
    expect(log.filter((e) => e.kind === 'split').length).toBe(2);
    expect(p.enemies.filter((e) => e.def.id === 'grublet' && !e.defeated).length).toBeGreaterThan(0);
  });
});

describe('Explosive (owner, 2026-11-19, option A)', () => {
  it('a blast never defeats an enemy: a 3-health neighbour drops to 2, a 1-health one is untouched', () => {
    const c = field(10, 5, [
      { id: 'snoozegrub', at: [5, 2], traits: ['explosive'] },
      { id: 'snoozegrub', at: [6, 3], rank: 2 },
      { id: 'snoozegrub', at: [5, 3] },
    ]);
    const p = createPlay(c, T, { seed: 'x' });
    fire(p, shot({ power: 0.45 }));
    settle(p);
    const [boom, big, small] = p.enemies;
    expect(boom!.defeated).toBe(true);
    expect(big!.health).toBe(2);
    expect(big!.scorched).toBe(true);
    expect(small!.defeated).toBe(false);
    expect(small!.health).toBe(1);
  });
  it('a ball that stops next to it is hurt; the blast waits for its fuse', () => {
    const p = createPlay(field(10, 3, [{ id: 'snoozegrub', at: [2, 2], traits: ['explosive'] }]), T, { seed: 'x2' });
    const h = p.health;
    // A soft shot: the ball stops close by.
    takeShot(p, shot({ power: 0.15 }));
    let fuse = -1;
    let blast = -1;
    for (let i = 0; i < 5000 && !canShoot(p); i++) {
      tick(p);
      for (const e of drainLog(p)) {
        if (e.kind === 'fuse') fuse = p.clock;
        if (e.kind === 'blast') blast = p.clock;
      }
    }
    expect(fuse).toBeGreaterThan(0);
    expect(blast - fuse).toBe(72);
    expect(p.health).toBe(h - 1);
  });
});

describe('carried gear', () => {
  it('a weapon gives +1 attack, armour +1 health, a bauble +1 star', () => {
    const p = createPlay(
      field(8, 3, [
        { id: 'mudroller', at: [3, 1], path: [[3, 2]], rank: 1, gear: 'studded-shell' },
        { id: 'snoozegrub', at: [5, 1], rank: 1, gear: 'thick-hide' },
        { id: 'snoozegrub', at: [7, 1], rank: 1, gear: 'star-magnet' },
      ]),
      T,
      { seed: 'gear' },
    );
    const [w, a, b] = p.enemies;
    expect(w!.stats.get('attackDamage')).toBe(2);
    expect(a!.health).toBe(3);
    expect(b!.stars).toBe(3);
  });
});
