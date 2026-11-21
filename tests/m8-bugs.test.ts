/**
 * Milestone 8 round 1: the five new bugs and the abilities Frost and Static
 * (design sheet docs/plans/milestone-8.md sections 6 and 7).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { ABILITY_IDS } from '../src/content/abilities';
import { STARTING_ABILITIES } from '../src/content/progress';
import { parseCourse, type Course } from '../src/sim/course';
import type { ShotCommand } from '../src/sim/ball';
import { canShoot, createPlay, drainLog, runShot, takeShot, tick, type PlayEvent, type PlayState, type TickInput } from '../src/sim/play';

const T = DEFAULT_TUNING;

function field(w: number, h: number, objects: unknown[] = [], set: Record<string, string> = {}, start: [number, number] = [1, 2]): Course {
  const rows: string[] = [];
  for (let y = 0; y < h + 2; y++) {
    const row: string[] = [];
    for (let x = 0; x < w + 2; x++) row.push(set[`${x},${y}`] ?? (x === 0 || y === 0 || x === w + 1 || y === h + 1 ? 'g5' : 'g1'));
    rows.push(row.join(' '));
  }
  const r = parseCourse({ format: 3, name: 'm8 bugs', legend: { g: 'grass', '~': 'water' }, tiles: rows, start, exit: [w, h], quota: 0, objects });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });
function fire(p: PlayState, cmd: ShotCommand, inputs: TickInput[] = []): PlayEvent[] {
  takeShot(p, cmd);
  runShot(p, inputs);
  return drainLog(p);
}
const abilityAt = (n: number): TickInput[] => {
  const a: TickInput[] = [];
  a[n] = { ability: true };
  return a;
};

describe('Skitter Ant', () => {
  it('runs a fast path and knocks the ball about without hurting it', () => {
    // Its path crosses the ball's spot in the open, away from walls.
    const p = createPlay(field(9, 9, [{ id: 'skitter-ant', at: [5, 2], path: [[5, 7]] }], {}, [5, 4]), T, { seed: 'sa' });
    const h = p.health;
    let knocked = false;
    for (let i = 0; i < 1200; i++) {
      tick(p);
      if (drainLog(p).some((e) => e.kind === 'knocked')) knocked = true;
    }
    expect(knocked).toBe(true);
    expect(p.health).toBe(h);
  });
});

describe('Bristlecrawler', () => {
  it('its bristles poison the ball when it hurts it; its front is guarded', () => {
    const p = createPlay(field(9, 9, [{ id: 'bristlecrawler', at: [5, 2], path: [[5, 7]] }], {}, [5, 4]), T, { seed: 'bc' });
    for (let i = 0; i < 2000 && p.health === p.stats.get('maxHealth'); i++) tick(p);
    expect(p.ballStatuses.map((s) => s.id)).toContain('poisoned');
    expect(p.enemies[0]!.guardedSides).toContain('front');
  });
});

describe('Glowmoth', () => {
  it('a rolling ball passes under it; it floats 0.9 tiles up', () => {
    const p = createPlay(field(10, 3, [{ id: 'glowmoth', at: [4, 2], path: [[4, 3]] }]), T, { seed: 'gm' });
    const m = p.enemies[0]!;
    expect(m.z).toBeCloseTo(0.25 + 0.9, 5);
    const log = fire(p, shot({ power: 0.7 }));
    expect(log.some((e) => e.kind === 'hit')).toBe(false);
    expect(m.defeated).toBe(false);
  });
});

describe('Trapjaw', () => {
  it('bites a ball that hits its front; from behind it takes double', () => {
    const front = createPlay(field(8, 3, [{ id: 'trapjaw', at: [4, 2], facing: 'nw' }]), T, { seed: 'tj' });
    const h = front.health;
    const log = fire(front, shot({ power: 0.5 }));
    expect(log.some((e) => e.kind === 'damage' && e.cause === 'bite')).toBe(true);
    expect(front.health).toBe(h - 1);
    expect(front.enemies[0]!.health).toBe(2);
    const back = createPlay(field(8, 3, [{ id: 'trapjaw', at: [4, 2], facing: 'se' }]), T, { seed: 'tj2' });
    fire(back, shot({ power: 0.5 }));
    expect(back.enemies[0]!.defeated).toBe(true);
  });
  it('once woken it turns to face the ball each enemy turn', () => {
    const p = createPlay(field(8, 5, [{ id: 'trapjaw', at: [5, 3], facing: 'se' }]), T, { seed: 'tj3' });
    const e = p.enemies[0]!;
    // Rest inside its outer radius, beside it.
    fire(p, shot({ angle: Math.atan2(1, 2.2), power: 0.35 }));
    expect(e.activated).toBe(true);
    const b = p.ball;
    const d = Math.hypot(b.x - e.x, b.y - e.y);
    expect(e.fx).toBeCloseTo((b.x - e.x) / d, 3);
  });
});

describe('Stinkpuff', () => {
  it('hit from the side, it puffs at once and poisons the ball', () => {
    const p = createPlay(field(8, 3, [{ id: 'stinkpuff', at: [4, 2], rank: 1 }]), T, { seed: 'sp' });
    const log = fire(p, shot({ power: 0.5 }));
    expect(log.some((e) => e.kind === 'puff' && e.hit)).toBe(true);
    expect(p.ballStatuses.map((s) => s.id)).toContain('poisoned');
  });
  it('a ball resting in its ring when it puffs on an enemy turn is poisoned', () => {
    const p = createPlay(field(8, 3, [{ id: 'stinkpuff', at: [5, 2] }], {}, [4, 2]), T, { seed: 'sp2' });
    // Stop inside the outer radius: it wakes, marks its ring this turn and puffs the next.
    fire(p, shot({ power: 0.01, angle: Math.PI }));
    expect(p.enemies[0]!.activated).toBe(true);
    fire(p, shot({ power: 0.01, angle: Math.PI }));
    expect(p.ballStatuses.map((s) => s.id)).toContain('poisoned');
  });
});

describe('Frost', () => {
  it('turns water the ball crosses to ice for 2 turns, and the ball can rest on it', () => {
    const set: Record<string, string> = {};
    for (let x = 3; x <= 9; x++) for (let y = 1; y <= 3; y++) set[`${x},${y}`] = '~1';
    const p = createPlay(field(10, 3, [], set), T, { seed: 'fr', loadout: { ability: 'frost' } });
    const log = fire(p, shot({ power: 0.3 }), abilityAt(2));
    expect(log.some((e) => e.kind === 'freeze')).toBe(true);
    expect(log.some((e) => e.kind === 'underwater')).toBe(false);
    const key = `${Math.floor(p.ball.x)},${Math.floor(p.ball.y)}`;
    expect(p.frozen[key]).toBe(2);
    // Two more turns later it melts under the resting ball: that counts as stopping in water.
    const h = p.health;
    fire(p, shot({ power: 0.01 }));
    expect(p.frozen[key]).toBe(1);
    const melt = fire(p, shot({ power: 0.01 }));
    expect(melt.some((e) => e.kind === 'melt')).toBe(true);
    expect(p.health).toBe(h - 1);
  });
  it('chills an enemy it hits', () => {
    const p = createPlay(field(8, 3, [{ id: 'snoozegrub', at: [4, 2], rank: 2 }]), T, { seed: 'fr2', loadout: { ability: 'frost' } });
    fire(p, shot({ power: 0.5 }), abilityAt(2));
    expect(p.enemies[0]!.statuses.map((s) => s.id)).toContain('chilled');
  });
});

describe('Static', () => {
  it('zaps each enemy in the field once; it counts as your hit', () => {
    const p = createPlay(field(8, 5, [{ id: 'snoozegrub', at: [3, 1] }, { id: 'snoozegrub', at: [3, 3] }]), T, { seed: 'st', loadout: { ability: 'static' } });
    const log = fire(p, shot({ power: 0.4 }), abilityAt(2));
    expect(log.filter((e) => e.kind === 'staticZap').length).toBe(2);
    expect(p.enemies.every((e) => e.defeated)).toBe(true);
  });
  it('lets the ball pass under a thunder cloud', () => {
    const p = createPlay(field(10, 3, [{ id: 'thunder-cloud', at: [4, 2] }]), T, { seed: 'st2', loadout: { ability: 'static' } });
    const log = fire(p, shot({ power: 0.5 }), abilityAt(2));
    expect(log.some((e) => e.kind === 'zap')).toBe(false);
  });
});

describe('the new abilities are in the pools', () => {
  it('Wild can give them and the Burrow sells them', () => {
    expect(ABILITY_IDS).toEqual(expect.arrayContaining(['frost', 'static']));
    expect(STARTING_ABILITIES).toEqual(expect.arrayContaining(['frost', 'static']));
  });
});

void canShoot;
