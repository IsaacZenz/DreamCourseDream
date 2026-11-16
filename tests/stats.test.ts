import { describe, expect, it } from 'vitest';
import { BALL_BASE_STATS } from '../src/content/characters';
import { StatSheet, type Modifier } from '../src/sim/stats';

const mod = (over: Partial<Modifier>): Modifier => ({
  stat: 'maxHealth',
  op: 'add',
  amount: 1,
  source: { kind: 'run', id: 'test' },
  duration: { kind: 'run' },
  ...over,
});

describe('stat sheet and modifiers', () => {
  it('starts at the base values from FEATURES.md section 1', () => {
    const s = new StatSheet(BALL_BASE_STATS);
    expect(s.get('maxHealth')).toBe(5);
    expect(s.get('maxShots')).toBe(4);
    expect(s.get('hitDamage')).toBe(1);
    expect(s.get('shotPower')).toBe(1);
    expect(s.get('starReach')).toBe(1);
  });

  it('final value = (base + adds) x multipliers', () => {
    const s = new StatSheet({ shotPower: 1 });
    s.add(mod({ stat: 'shotPower', op: 'add', amount: 0.5 }));
    s.add(mod({ stat: 'shotPower', op: 'mul', amount: 2 }));
    s.add(mod({ stat: 'shotPower', op: 'mul', amount: 1.1 }));
    expect(s.get('shotPower')).toBeCloseTo((1 + 0.5) * 2 * 1.1, 10);
  });

  it('rounds whole-number stats and keeps every stat within its limits', () => {
    const s = new StatSheet({ maxHealth: 5, hitDamage: 1 });
    s.add(mod({ stat: 'maxHealth', op: 'mul', amount: 1.3 })); // 6.5 -> 7
    expect(s.get('maxHealth')).toBe(7);
    s.add(mod({ stat: 'hitDamage', op: 'add', amount: -5 }));
    expect(s.get('hitDamage')).toBe(1); // owner, 2026-11-16 (F1): never below 1
    s.add(mod({ stat: 'maxHealth', op: 'add', amount: -100 }));
    expect(s.get('maxHealth')).toBe(1);
  });

  it('removing a source removes all its modifiers, and only those', () => {
    const s = new StatSheet(BALL_BASE_STATS);
    const gear = { kind: 'gear', id: 'studded-shell' } as const;
    s.add(mod({ stat: 'hitDamage', amount: 1, source: gear, duration: { kind: 'equipped' } }));
    s.add(mod({ stat: 'starReach', amount: 2, source: gear, duration: { kind: 'equipped' } }));
    s.add(mod({ stat: 'hitDamage', amount: 1, source: { kind: 'run', id: 'boost' } }));
    expect(s.get('hitDamage')).toBe(3);
    expect(s.removeSource(gear)).toBe(2);
    expect(s.get('hitDamage')).toBe(2);
    expect(s.get('starReach')).toBe(1);
  });

  it('turn-limited modifiers count down and expire', () => {
    const s = new StatSheet(BALL_BASE_STATS);
    s.add(mod({ stat: 'starReach', amount: -0.5, source: { kind: 'status', id: 'poisoned' }, duration: { kind: 'turns', turns: 2 } }));
    expect(s.get('starReach')).toBe(0.5);
    s.tickTurn();
    expect(s.get('starReach')).toBe(0.5);
    s.tickTurn();
    expect(s.get('starReach')).toBe(1);
  });

  it('course modifiers end with the course; run modifiers end with the run; permanent ones stay', () => {
    const s = new StatSheet(BALL_BASE_STATS);
    s.add(mod({ amount: 1, duration: { kind: 'course' } }));
    s.add(mod({ amount: 1, duration: { kind: 'run' } }));
    s.add(mod({ amount: 1, source: { kind: 'permanent', id: 'vitality' }, duration: { kind: 'forever' } }));
    expect(s.get('maxHealth')).toBe(8);
    s.endScope('course');
    expect(s.get('maxHealth')).toBe(7);
    s.endScope('run');
    expect(s.get('maxHealth')).toBe(6);
  });
});
