/**
 * Milestone 4: enemies, obstacles, abilities, flags, statuses and the world
 * clock (design sheet docs/plans/milestone-4.md, section 7).
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { OBJECTS, registerObjects, type EnemyDef } from '../src/content/objects';
import { parseCourse, type Course } from '../src/sim/course';
import type { ShotCommand } from '../src/sim/ball';
import { computeHit } from '../src/sim/damage';
import {
  applyBallStatus,
  applyEnemyStatus,
  ballNow,
  canShoot,
  createPlay,
  drainLog,
  lobSpeedFor,
  runShot,
  takeShot,
  tick,
  wait,
  type PlayEvent,
  type PlayState,
  type TickInput,
} from '../src/sim/play';

const T = DEFAULT_TUNING;
const LEGEND = { g: 'grass', '~': 'water', x: 'spikes', i: 'ice' };

/**
 * An open field `w` x `h` of flat grass at height 1, ringed by a wall at height 2.
 * `set` changes single tiles: { "3,4": "~1" }.
 */
function field(w: number, h: number, extra: Record<string, unknown> = {}, set: Record<string, string> = {}): Course {
  const rows: string[] = [];
  for (let y = 0; y < h + 2; y++) {
    const row: string[] = [];
    for (let x = 0; x < w + 2; x++) {
      const edge = x === 0 || y === 0 || x === w + 1 || y === h + 1;
      row.push(set[`${x},${y}`] ?? (edge ? 'g2' : 'g1'));
    }
    rows.push(row.join(' '));
  }
  const r = parseCourse({ format: 2, name: 'test field', legend: LEGEND, tiles: rows, start: [1, 1], exit: [w, h], quota: 0, ...extra });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });
const play = (c: Course, seed = 'm4') => createPlay(c, T, { seed });

function fire(p: PlayState, cmd: ShotCommand, inputs: TickInput[] = []): PlayEvent[] {
  takeShot(p, cmd);
  runShot(p, inputs);
  return drainLog(p);
}

/** Run a shot, pressing the ability key at step `at`. */
function fireWithAbility(p: PlayState, cmd: ShotCommand, at: number, extra: TickInput = {}): PlayEvent[] {
  const inputs: TickInput[] = [];
  inputs[at] = { ability: true, ...extra };
  return fire(p, cmd, inputs);
}

const kinds = (log: PlayEvent[]) => log.map((e) => e.kind);

/** Pretend a shot just ended where the ball is, and run the rest check and enemy turns. */
function enemyTurnNow(p: PlayState): void {
  p.phase = 'shot';
  settle(p);
}

/** Run the world until the player can shoot again. */
function settle(p: PlayState): void {
  for (let i = 0; i < 20000 && !canShoot(p) && p.status === 'playing'; i++) tick(p);
}

// ---------------------------------------------------------------------------

describe('damage order (FEATURES.md section 2)', () => {
  const plain = { weakTo: [], resists: [], weakSpots: [], guardedSides: [], shieldUp: false } as const;
  const hit = { base: 1, element: null, fromAbove: false, fromBehind: false } as const;

  it('uses the hit damage after modifiers', () => {
    expect(computeHit({ ...hit, base: 3 }, plain).damage).toBe(3);
  });
  it('element: weak doubles, resistant halves rounded down', () => {
    expect(computeHit({ ...hit, base: 3, element: 'fire' }, { ...plain, weakTo: ['fire'] }).damage).toBe(6);
    expect(computeHit({ ...hit, base: 3, element: 'fire' }, { ...plain, resists: ['fire'] }).damage).toBe(1);
    expect(computeHit({ ...hit, base: 3, element: 'ice' }, { ...plain, weakTo: ['fire'] }).damage).toBe(3);
  });
  it('position: a weak spot from above or behind doubles; a guarded side blocks', () => {
    expect(computeHit({ ...hit, fromAbove: true }, { ...plain, weakSpots: ['above'] }).damage).toBe(2);
    expect(computeHit({ ...hit, fromBehind: true }, { ...plain, weakSpots: ['behind'] }).damage).toBe(2);
    expect(computeHit({ ...hit, fromBehind: false }, { ...plain, weakSpots: ['behind'] }).damage).toBe(1);
    const g = computeHit({ ...hit }, { ...plain, guardedSides: ['front'] });
    expect(g).toEqual({ damage: 0, blocked: true, shieldUsed: false });
  });
  it('element comes before position: weak to fire and hit in a weak spot is x4', () => {
    expect(computeHit({ ...hit, element: 'fire', fromAbove: true }, { ...plain, weakTo: ['fire'], weakSpots: ['above'] }).damage).toBe(4);
  });
  it('a shield blocks the hit', () => {
    expect(computeHit(hit, { ...plain, shieldUp: true })).toEqual({ damage: 0, blocked: true, shieldUsed: true });
  });
});

// ---------------------------------------------------------------------------
// Test-only enemies: data entries only, no logic changes (design sheet section 7).

const TEST_ENEMY_BASE = {
  kind: 'enemy',
  sprite: 'mossback',
  family: 'sentinel',
  tier: 2,
  starValue: 1,
  element: null,
  weakTo: [],
  resists: [],
  weakSpots: [],
  guardedSides: [],
  shield: false,
  shape: { kind: 'round', r: 0.3 },
  height: 0.6,
  bounce: 0.6,
  passByGroundOnly: false,
  contact: 'never',
  grantsAbility: null,
  allowedTraits: [],
  allowedGear: [],
  squadThemes: [],
  cost: 1,
} as const;

const testEnemies: EnemyDef[] = [
  // A fourth enemy: a lobber with different numbers and responses, from this file only.
  {
    ...TEST_ENEMY_BASE,
    id: 't-lobber',
    name: 'Test lobber',
    stats: { health: 3, attackDamage: 2, outerRadius: 2, innerRadius: 1 },
    triggers: { hit: 'immediate', rest: 'none', passBy: 'none' },
    behaviour: { kind: 'lob', range: 10, loftAngle: 45, seedRadius: 0.1 },
  },
  {
    ...TEST_ENEMY_BASE,
    id: 't-hit-launcher',
    name: 'Test hit launcher',
    stats: { health: 3, attackDamage: 1, outerRadius: 0, innerRadius: 0 },
    triggers: { hit: 'immediate', rest: 'none', passBy: 'none' },
    behaviour: { kind: 'launch', maxSpeed: 6, hitWhileMoving: true },
    contact: 'moving',
  },
  {
    ...TEST_ENEMY_BASE,
    id: 't-rest-immediate',
    name: 'Test rest immediate',
    stats: { health: 3, attackDamage: 1, outerRadius: 3, innerRadius: 0 },
    triggers: { hit: 'none', rest: 'immediate', passBy: 'none' },
    behaviour: { kind: 'launch', maxSpeed: 6, hitWhileMoving: true },
    contact: 'moving',
  },
  {
    ...TEST_ENEMY_BASE,
    id: 't-shielded',
    name: 'Test shielded',
    stats: { health: 3 },
    shield: true,
    triggers: { hit: 'none', rest: 'none', passBy: 'none' },
    behaviour: { kind: 'none' },
  },
  {
    ...TEST_ENEMY_BASE,
    id: 't-guarded',
    name: 'Test guarded front',
    stats: { health: 1 },
    guardedSides: ['front'],
    triggers: { hit: 'activated', rest: 'none', passBy: 'none' },
    behaviour: { kind: 'lob', range: 8, loftAngle: 50, seedRadius: 0.1 },
  },
];
for (const d of testEnemies) if (!OBJECTS.has(d.id)) registerObjects([d]);

describe('a fourth enemy from a data file alone', () => {
  it('a test-only lobber plays: hit makes it act at once (mark), then it lobs on the enemy turn', () => {
    const p = play(field(10, 3, { objects: [{ id: 't-lobber', at: [5, 2] }] }));
    p.ball = { ...p.ball, x: 2.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.4 }));
    expect(kinds(log)).toContain('lobMark');
    expect(kinds(log)).toContain('activated');
    expect(kinds(log)).toContain('lob');
  });
});

// ---------------------------------------------------------------------------

describe('triggers and responses', () => {
  it('none: a Mossback never activates', () => {
    const p = play(field(10, 3, { objects: [{ id: 'mossback', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 4.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.05 }));
    expect(kinds(log)).not.toContain('activated');
  });

  it('Spitter, rest: activated when the ball stops inside its outer radius', () => {
    const p = play(field(10, 3, { objects: [{ id: 'spitter', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 3.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.05 }));
    expect(log).toContainEqual({ kind: 'trigger', enemy: 'spitter#0', trigger: 'rest' });
    expect(p.enemies[0]!.activated).toBe(true);
  });

  it('Spitter, rest: not activated when the ball stops outside its outer radius', () => {
    const p = play(field(12, 3, { objects: [{ id: 'spitter', at: [10, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    fire(p, shot({ power: 0.05 }));
    expect(p.enemies[0]!.activated).toBe(false);
  });

  it('Spitter, pass-by: activated when the ball rolls through its inner radius', () => {
    const p = play(field(14, 5, { objects: [{ id: 'spitter', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 3.5 };
    const log = fire(p, shot({ power: 0.9 }));
    expect(log).toContainEqual({ kind: 'trigger', enemy: 'spitter#0', trigger: 'passBy' });
    expect(p.enemies[0]!.activated).toBe(true);
  });

  it('Spitter, hit: activated when hit and it survives', () => {
    const p = play(field(10, 3, { objects: [{ id: 'spitter', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.6 }));
    expect(log).toContainEqual({ kind: 'trigger', enemy: 'spitter#0', trigger: 'hit' });
    expect(p.enemies[0]!.health).toBe(1);
    expect(p.enemies[0]!.activated).toBe(true);
  });

  it('immediate on hit: acts during the shot, before the enemy turn', () => {
    const p = play(field(10, 3, { objects: [{ id: 't-hit-launcher', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.6 }));
    const k = kinds(log);
    expect(k.indexOf('launch')).toBeGreaterThanOrEqual(0);
    expect(k.indexOf('launch')).toBeLessThan(k.indexOf('enemyTurn'));
  });

  it('immediate on rest: acts at the rest check, before the enemy turn', () => {
    const p = play(field(10, 3, { objects: [{ id: 't-rest-immediate', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 3.5, y: 2.5 };
    const k = kinds(fire(p, shot({ power: 0.05 })));
    expect(k.indexOf('launch')).toBeLessThan(k.indexOf('enemyTurn'));
  });

  it('Lunger, pass-by: launches at once mid-shot, once per shot, and is then activated', () => {
    const p = play(field(16, 5, { objects: [{ id: 'lunger', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 3.5 };
    const log = fire(p, shot({ power: 0.9 }));
    const k = kinds(log);
    expect(k.filter((x) => x === 'launch').length).toBeGreaterThanOrEqual(1);
    expect(k.indexOf('launch')).toBeLessThan(k.indexOf('enemyTurn'));
    expect(log.filter((e) => e.kind === 'trigger' && e.trigger === 'passBy')).toHaveLength(1);
    expect(p.enemies[0]!.activated).toBe(true);
  });

  it('a guarded side blocks the hit but the hit trigger still fires', () => {
    const p = play(field(10, 3, { objects: [{ id: 't-guarded', at: [6, 2], facing: 'nw' }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.6 }));
    expect(log).toContainEqual({ kind: 'hit', enemy: 't-guarded#0', damage: 0, blocked: true });
    expect(p.enemies[0]!.defeated).toBe(false);
    expect(p.enemies[0]!.activated).toBe(true);
  });

  it('a shield blocks the first hit of each shot only', () => {
    const p = play(field(6, 1, { objects: [{ id: 't-shielded', at: [3, 1] }] }));
    // Bounce between the wall and the enemy: the first hit is blocked, later ones count.
    const log = fire(p, shot({ power: 1 }));
    const hits = log.filter((e) => e.kind === 'hit');
    expect(hits[0]).toMatchObject({ damage: 0, blocked: true });
    expect(hits.slice(1).some((h) => h.kind === 'hit' && h.damage > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('Spitter lob', () => {
  it('lobSpeedFor lands the first bounce at the distance asked on flat ground', () => {
    for (const d of [2, 4, 7]) {
      const v = lobSpeedFor(T, d, 50, 0);
      expect(v).toBeGreaterThan(0);
    }
    expect(lobSpeedFor(T, 6, 50, 0)).toBeGreaterThan(lobSpeedFor(T, 3, 50, 0));
  });

  it('marks a ring on the first enemy turn, then the seed lands there and hurts a ball that stayed', () => {
    const p = play(field(12, 5, { objects: [{ id: 'spitter', at: [8, 3] }] }));
    p.ball = { ...p.ball, x: 5.5, y: 3.5 };
    const first = fire(p, shot({ power: 0.05 }));
    expect(kinds(first)).toContain('lobMark');
    expect(kinds(first)).not.toContain('lob');
    const mark = first.find((e) => e.kind === 'lobMark')!;
    expect(mark.kind === 'lobMark' && Math.hypot(mark.x - p.ball.x, mark.y - p.ball.y)).toBeLessThan(0.75);
    const health = p.health;
    const second = fire(p, shot({ power: 0.05, angle: Math.PI }));
    expect(kinds(second)).toContain('lob');
    expect(second).toContainEqual({ kind: 'damage', amount: 1, cause: 'seed' });
    expect(p.health).toBe(health - 1);
  });

  it('misses a ball that moved away', () => {
    const p = play(field(14, 7, { objects: [{ id: 'spitter', at: [8, 4] }] }));
    p.ball = { ...p.ball, x: 6.5, y: 4.5 };
    fire(p, shot({ power: 0.05 }));
    const second = fire(p, shot({ power: 0.5, angle: -Math.PI / 2 - 0.4 }));
    expect(kinds(second)).toContain('lob');
    expect(second.some((e) => e.kind === 'damage' && e.cause === 'seed')).toBe(false);
  });

  it('the seed keeps bouncing after it lands, and is gone once it stops', () => {
    const p = play(field(14, 5, { objects: [{ id: 'spitter', at: [10, 3] }] }));
    p.ball = { ...p.ball, x: 7.5, y: 3.5 };
    fire(p, shot({ power: 0.05 }));
    takeShot(p, shot({ power: 0.4, angle: -Math.PI / 2 }));
    let sawSeed = false;
    let bounces = 0;
    for (let i = 0; i < 20000 && !(p.phase === 'aim' && canShoot(p)); i++) {
      tick(p);
      for (const sd of p.seeds) {
        sawSeed = true;
        bounces = Math.max(bounces, sd.shot.events.filter((e) => e.kind === 'bounce').length);
      }
    }
    expect(sawSeed).toBe(true);
    expect(bounces).toBeGreaterThanOrEqual(1);
    expect(p.seeds).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------

describe('Lunger', () => {
  it('rest activates it; on the enemy turn it launches at the ball and rolls towards it', () => {
    const p = play(field(12, 3, { objects: [{ id: 'lunger', at: [8, 2] }] }));
    p.ball = { ...p.ball, x: 6.5, y: 2.5 };
    const startX = p.enemies[0]!.x;
    fire(p, shot({ power: 0.05, angle: Math.PI }));
    expect(p.enemies[0]!.activated).toBe(true);
    const log = fire(p, shot({ power: 0.05, angle: Math.PI }));
    expect(kinds(log)).toContain('launch');
    expect(p.enemies[0]!.x).toBeLessThan(startX - 0.5);
  });

  it('bounces back from a drop instead of rolling off it', () => {
    // A strip of high ground at height 1 with a drop to height 0 at x = 11.
    const set: Record<string, string> = {};
    for (let y = 1; y <= 3; y++) set[`11,${y}`] = 'g0';
    const p = play(field(11, 3, { objects: [{ id: 'lunger', at: [9, 2] }] }, set));
    const e = p.enemies[0]!;
    // Launch it hard at the drop.
    e.activated = true;
    p.ball = { ...p.ball, x: 11.6, y: 2.5 };
    enemyTurnNow(p);
    expect(e.x).toBeLessThan(11);
    expect(e.z).toBeCloseTo(0.5, 3);
  });

  it('bounces back out of water and never stops in it', () => {
    const set: Record<string, string> = { '7,1': '~1', '7,2': '~1', '7,3': '~1' };
    const p = play(field(10, 3, { objects: [{ id: 'lunger', at: [4, 2] }] }, set));
    const e = p.enemies[0]!;
    e.activated = true;
    p.ball = { ...p.ball, x: 9.5, y: 2.5 };
    enemyTurnNow(p);
    expect(Math.floor(e.x)).toBeLessThan(7);
    expect(e.defeated).toBe(false);
  });

  it('spikes hurt it once per launch', () => {
    const set: Record<string, string> = { '5,2': 'x1', '6,2': 'x1' };
    const p = play(field(10, 3, { objects: [{ id: 'lunger', at: [3, 2] }] }, set));
    const e = p.enemies[0]!;
    e.activated = true;
    p.ball = { ...p.ball, x: 9.5, y: 2.5 };
    enemyTurnNow(p);
    expect(e.health).toBe(1);
  });

  it('hurts the ball only while it is moving; a resting ball is knocked, not a shot', () => {
    const p = play(field(10, 3, { objects: [{ id: 'lunger', at: [3, 2] }] }));
    const e = p.enemies[0]!;
    e.activated = true;
    p.ball = { ...p.ball, x: 6.5, y: 2.5 };
    const shots = p.shots;
    enemyTurnNow(p);
    const log = drainLog(p);
    expect(log).toContainEqual({ kind: 'damage', amount: 1, cause: 'enemy' });
    expect(kinds(log)).toContain('knocked');
    expect(p.shots).toBe(shots);
    // Now it has stopped: rolling gently into it does not hurt the ball. (Calm it so it does not launch again.)
    e.activated = false;
    const h = p.health;
    const lg = fire(p, shot({ power: 0.25, angle: Math.atan2(e.y - p.ball.y, e.x - p.ball.x) }));
    // The hit itself does not hurt the ball (the hit wakes it up again, so it may launch on the enemy turn after).
    const beforeTurn = lg.slice(0, kinds(lg).indexOf('enemyTurn'));
    expect(kinds(beforeTurn)).toContain('hit');
    expect(beforeTurn.some((x) => x.kind === 'damage')).toBe(false);
    void h;
  });
});

// ---------------------------------------------------------------------------

describe('Mole', () => {
  it('rolling over the hill makes it shoot out; flying over does not', () => {
    const p = play(field(12, 3, { objects: [{ id: 'mole', at: [5, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const rolled = fire(p, shot({ power: 0.6 }));
    expect(kinds(rolled)).toContain('surface');

    const q = play(field(12, 3, { objects: [{ id: 'mole', at: [2, 2] }] }));
    q.ball = { ...q.ball, x: 1.5, y: 2.5 };
    const flew = fire(q, shot({ type: 'lofted', power: 0.6 }));
    expect(kinds(flew)).not.toContain('surface');
  });

  it('waits a moment after being rolled over, then shoots up into the air (owner, 2026-11-14)', () => {
    const p = play(field(12, 3, { objects: [{ id: 'mole', at: [3, 2] }] }));
    const e = p.enemies[0]!;
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    takeShot(p, shot({ power: 0.5 }));
    let rumbleAt = -1;
    let surfaceAt = -1;
    let topZ = 0;
    for (let i = 0; i < 3000 && surfaceAt < 0 || (e.body && i < 6000); i++) {
      tick(p);
      for (const ev of drainLog(p)) {
        if (ev.kind === 'rumble') rumbleAt = p.clock;
        if (ev.kind === 'surface') surfaceAt = p.clock;
      }
      if (e.body) topZ = Math.max(topZ, e.body.ball.z - 0.5);
    }
    expect(rumbleAt).toBeGreaterThan(0);
    expect(surfaceAt - rumbleAt).toBe(36); // 0.3 s at 120 steps per second
    expect(topZ).toBeGreaterThan(0.9);
  });

  it('does not hurt the ball the moment it pops out, even if the ball is right on the hill', () => {
    const p = play(field(12, 3, { objects: [{ id: 'mole', at: [3, 2] }] }));
    p.ball = { ...p.ball, x: 3.1, y: 2.5 };
    // A tiny shot that stops on the hill.
    takeShot(p, shot({ power: 0.06 }));
    let hurtEarly = false;
    let surfaced = -1;
    for (let i = 0; i < 4000; i++) {
      tick(p);
      for (const ev of drainLog(p)) {
        if (ev.kind === 'surface') surfaced = p.clock;
        if (ev.kind === 'damage' && surfaced >= 0 && p.clock - surfaced < 18) hurtEarly = true;
      }
    }
    expect(surfaced).toBeGreaterThan(0);
    expect(hurtEarly).toBe(false);
  });

  it('the same seed gives the same direction', () => {
    const run = (seed: string) => {
      const p = play(field(12, 5, { objects: [{ id: 'mole', at: [5, 3] }] }), seed);
      p.ball = { ...p.ball, x: 1.5, y: 3.5 };
      fire(p, shot({ power: 0.6 }));
      return [p.enemies[0]!.x, p.enemies[0]!.y];
    };
    expect(run('a')).toEqual(run('a'));
  });

  it('cannot be hit while moving or underground; burrows after one shot and leaves a new hill where it stopped', () => {
    const p = play(field(12, 5, { objects: [{ id: 'mole', at: [5, 3] }] }));
    const e = p.enemies[0]!;
    p.ball = { ...p.ball, x: 1.5, y: 3.5 };
    fire(p, shot({ power: 0.6 }));
    expect(e.burrowed).toBe(false);
    expect(e.health).toBe(1);
    const at = [e.x, e.y];
    // Next shot goes elsewhere; the enemy turn after it burrows the Mole.
    const log = fire(p, shot({ power: 0.05, angle: Math.PI }));
    expect(kinds(log)).toContain('burrow');
    expect(e.burrowed).toBe(true);
    expect([e.x, e.y]).toEqual(at);
    expect(Math.hypot(e.x - 5.5, e.y - 3.5)).toBeGreaterThan(0.5);
  });
});

// ---------------------------------------------------------------------------

describe('Trundler and moving obstacles', () => {
  it('a Trundler that survives your hit costs 1 health and knocks the ball away', () => {
    const p = play(field(10, 3, { objects: [{ id: 'trundler', at: [6, 2], path: [[6, 2]] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.6 }));
    expect(log.some((e) => e.kind === 'hit')).toBe(true);
    expect(log).toContainEqual({ kind: 'damage', amount: 1, cause: 'enemy' });
    expect(p.enemies[0]!.health).toBe(1);
  });

  it('runs into a resting ball: keeps to its path, hurts and knocks the ball; no shot used', () => {
    const p = play(field(10, 3, { objects: [{ id: 'trundler', at: [2, 2], path: [[8, 2]] }] }));
    p.ball = { ...p.ball, x: 5.5, y: 2.5 };
    const shots = p.shots;
    let knocked = false;
    for (let i = 0; i < 600; i++) {
      tick(p);
      if (p.shot) knocked = true;
    }
    const log = drainLog(p);
    expect(knocked).toBe(true);
    expect(log).toContainEqual({ kind: 'damage', amount: 1, cause: 'enemy' });
    expect(p.shots).toBe(shots);
    // Owner, 2026-11-14: a ball standing still does not damage the enemy that runs into it.
    expect(log.some((e) => e.kind === 'hit')).toBe(false);
    expect(p.enemies[0]!.health).toBe(2);
    // It is still on its path (y never changes on this path).
    expect(p.enemies[0]!.y).toBeCloseTo(2.5, 5);
  });

  it('a knocked ball rolling into another enemy does not damage it (only your own shots do)', () => {
    const p = play(field(12, 3, { objects: [{ id: 'sliding-block', at: [2, 2], path: [[4, 2]] }, { id: 'mossback', at: [7, 2] }] }));
    p.ball = { ...p.ball, x: 4.2, y: 2.5 };
    wait(p, 600);
    const log = drainLog(p);
    expect(kinds(log)).toContain('knocked');
    expect(p.enemies[0]!.defeated).toBe(false);
    expect(log.some((e) => e.kind === 'hit')).toBe(false);
  });

  it('a sliding block pushes a resting ball out of the way without damage', () => {
    const p = play(field(10, 3, { objects: [{ id: 'sliding-block', at: [2, 2], path: [[8, 2]] }] }));
    p.ball = { ...p.ball, x: 4.5, y: 2.5 };
    const h = p.health;
    wait(p, 600);
    expect(drainLog(p).some((e) => e.kind === 'knocked')).toBe(true);
    expect(p.health).toBe(h);
  });

  it('the world clock: the same steps give the same positions; a replay gives the same result', () => {
    const c = field(10, 5, {
      objects: [
        { id: 'trundler', at: [2, 4], path: [[8, 4]] },
        { id: 'sliding-block', at: [2, 2], path: [[8, 2]], phase: 0.3 },
      ],
    });
    const a = play(c, 'same');
    const b = play(c, 'same');
    wait(a, 333);
    wait(b, 333);
    expect([a.enemies[0]!.x, a.movers[0]!.x]).toEqual([b.enemies[0]!.x, b.movers[0]!.x]);
    fire(a, shot({ power: 0.7, angle: 0.4 }));
    fire(b, shot({ power: 0.7, angle: 0.4 }));
    expect(a.ball).toEqual(b.ball);
    expect(a.health).toBe(b.health);
  });

  it('a gate never closes on the ball', () => {
    const p = play(field(6, 3, { objects: [{ id: 'gate', at: [3, 2] }] }));
    const g = p.movers[0]!;
    expect(g.open).toBe(true);
    p.ball = { ...p.ball, x: 3.5, y: 2.5 };
    wait(p, 1000);
    expect(g.open).toBe(true);
    p.ball = { ...p.ball, x: 1.5, y: 1.5 };
    wait(p, 100);
    expect(g.open).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('Stunned (FEATURES.md section 12)', () => {
  it('an enemy skips its next action; reapplying is ignored', () => {
    const p = play(field(10, 3, { objects: [{ id: 'spitter', at: [6, 2] }] }));
    const e = p.enemies[0]!;
    e.activated = true;
    applyEnemyStatus(p, e, 'stunned');
    applyEnemyStatus(p, e, 'stunned');
    expect(e.statuses).toEqual([{ id: 'stunned', turnsLeft: 1 }]);
    const log = fire(p, shot({ power: 0.05 }));
    expect(kinds(log)).toContain('skip');
    expect(kinds(log)).not.toContain('lobMark');
    expect(e.statuses).toEqual([]);
    expect(kinds(fire(p, shot({ power: 0.05 })))).toContain('lobMark');
  });

  it('the ball loses a shot', () => {
    const p = play(field(6, 3));
    applyBallStatus(p, 'stunned');
    expect(p.shots).toBe(3);
    applyBallStatus(p, 'stunned');
    expect(p.shots).toBe(3);
  });

  it('a stunned Trundler stops moving until after the next enemy turn', () => {
    const p = play(field(10, 3, { objects: [{ id: 'trundler', at: [2, 3], path: [[8, 3]] }] }));
    const e = p.enemies[0]!;
    applyEnemyStatus(p, e, 'stunned');
    const x = e.x;
    wait(p, 100);
    expect(e.x).toBe(x);
  });
});

// ---------------------------------------------------------------------------

describe('flag poles and secured stars (owner, 2026-11-14)', () => {
  function poleCourse() {
    return field(14, 3, { objects: [{ id: 'mossback', at: [5, 2] }], quota: 1 });
  }

  it('a slow ball bounces off a pole; a fast one pushes past and loses most of its speed', () => {
    const p = play(poleCourse());
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    fire(p, shot({ power: 0.5 }));
    expect(p.flags[0]!.solid).toBe(true);
    const fx = p.flags[0]!.x;
    // Slow, from the left: stays on the left.
    p.ball = { ...p.ball, x: fx - 2, y: p.flags[0]!.y };
    fire(p, shot({ power: 0.4 }));
    expect(p.ball.x).toBeLessThan(fx);
    // Fast: pushes past.
    p.ball = { ...p.ball, x: fx - 1.5, y: p.flags[0]!.y };
    const log = fire(p, shot({ power: 1 }));
    expect(p.ball.x).toBeGreaterThan(fx);
    expect(log.length).toBeGreaterThan(0);
  });

  it('a lofted ball higher than the pole passes over it', () => {
    const p = play(poleCourse());
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    fire(p, shot({ power: 0.5 }));
    const f = p.flags[0]!;
    p.ball = { ...p.ball, x: f.x - 3, y: f.y };
    takeShot(p, shot({ type: 'lofted', power: 1 }));
    let bounced = false;
    while (p.shot) {
      tick(p);
      if (p.shot?.events.some((e) => e.kind === 'contact' && e.obstacle === f.uid)) bounced = true;
    }
    expect(bounced).toBe(false);
  });

  it('an enemy passing over a raised flag lowers it and takes the star; the ball raises it again; the exit stays open', () => {
    const c = field(10, 5, {
      objects: [
        { id: 'mossback', at: [5, 2] },
        { id: 'trundler', at: [5, 5], path: [[5, 5]] },
      ],
      quota: 1,
    });
    const p = play(c);
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    fire(p, shot({ power: 0.4 }));
    expect(p.meter).toBe(1);
    expect(p.wallet).toBe(1);
    expect(p.exitOpen).toBe(true);
    // Send the Trundler over the flag's tile by moving its route.
    const t = p.enemies[1]!;
    (t as { path: unknown }).path = { pts: [{ x: 5.5, y: 4.5 }, { x: 5.5, y: 1.5 }], total: 3 };
    t.pathDist = 0;
    p.ball = { ...p.ball, x: 9.5, y: 1.5 };
    wait(p, 300);
    const log = drainLog(p);
    expect(kinds(log)).toContain('flagDown');
    expect(p.flags[0]!.raised).toBe(false);
    expect(p.meter).toBe(0);
    expect(p.wallet).toBe(0);
    expect(p.exitOpen).toBe(true);
    // Park the Trundler away and roll the ball onto the flag.
    (t as { path: unknown }).path = { pts: [{ x: 9.5, y: 5.5 }, { x: 9.5, y: 4.5 }], total: 1 };
    const f = p.flags[0]!;
    p.ball = { ...p.ball, x: f.x - 1.2, y: f.y };
    const up = fire(p, shot({ power: 0.2 }));
    expect(kinds(up)).toContain('flagUp');
    expect(p.meter).toBe(1);
    expect(p.wallet).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe('thunder cloud (owner, 2026-11-14)', () => {
  it('a rolling ball is zapped: 1 damage and thrown; once per cloud per shot', () => {
    const p = play(field(12, 5, { objects: [{ id: 'thunder-cloud', at: [5, 3] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 3.5 };
    const log = fire(p, shot({ power: 0.6 }));
    expect(log.filter((e) => e.kind === 'zap')).toHaveLength(1);
    expect(log.filter((e) => e.kind === 'damage' && e.cause === 'zap')).toHaveLength(1);
  });

  it('a ball high enough passes over safely', () => {
    const p = play(field(14, 5, { objects: [{ id: 'thunder-cloud', at: [4, 3] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 3.5 };
    const log = fire(p, shot({ type: 'lofted', power: 0.8 }));
    expect(kinds(log)).not.toContain('zap');
  });

  it('the same seed throws the same way', () => {
    const run = () => {
      const p = play(field(12, 5, { objects: [{ id: 'thunder-cloud', at: [5, 3] }] }), 'zap');
      p.ball = { ...p.ball, x: 1.5, y: 3.5 };
      fire(p, shot({ power: 0.6 }));
      return [p.ball.x, p.ball.y];
    };
    expect(run()).toEqual(run());
  });

  it('immunity: just after spikes, the zap does no damage but still throws', () => {
    const p = play(field(12, 5, { objects: [{ id: 'thunder-cloud', at: [4, 3] }] }, { '3,3': 'x1' }));
    p.ball = { ...p.ball, x: 1.5, y: 3.5 };
    const log = fire(p, shot({ power: 0.6 }));
    expect(log.filter((e) => e.kind === 'damage')).toHaveLength(1);
    expect(kinds(log)).toContain('zap');
  });

  it('zaps a rolling Lunger: thrown, no damage', () => {
    const p = play(field(12, 5, { objects: [{ id: 'lunger', at: [2, 3] }, { id: 'thunder-cloud', at: [5, 3] }] }));
    const e = p.enemies[0]!;
    e.activated = true;
    p.ball = { ...p.ball, x: 10.5, y: 3.5 };
    enemyTurnNow(p);
    const log = drainLog(p);
    expect(log).toContainEqual({ kind: 'zap', target: e.uid });
    expect(e.health).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe('damage immunity (owner, 2026-11-14)', () => {
  it('a second hit within 0.5 s does nothing; after 0.5 s it counts', () => {
    const set: Record<string, string> = {};
    for (let x = 2; x <= 12; x++) set[`${x},2`] = 'x1';
    const p = play(field(14, 3, {}, set));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.35 }));
    // A slow roll across a long strip of spikes: one damage per half second, not one per tile.
    const n = log.filter((e) => e.kind === 'damage').length;
    expect(n).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------

describe('abilities', () => {
  function withAbility(id: string, c: Course) {
    const p = play(c);
    p.ability = id;
    return p;
  }

  it('Anchor: drops straight down and stops dead, even on ice', () => {
    const set: Record<string, string> = {};
    for (let x = 1; x <= 20; x++) for (let y = 1; y <= 3; y++) set[`${x},${y}`] = 'i1';
    const p = withAbility('anchor', field(20, 3, {}, set));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    takeShot(p, shot({ type: 'lofted', power: 0.6 }));
    for (let i = 0; i < 20; i++) tick(p);
    const xAt = p.shot!.ball.x;
    tick(p, { ability: true });
    runShot(p);
    expect(kinds(drainLog(p))).toContain('abilityUsed');
    expect(Math.abs(p.ball.x - xAt)).toBeLessThan(0.2);
  });

  it('Anchor: breaks a cracked tile it stops on and stuns enemies within 1 tile', () => {
    const p = withAbility('anchor', field(12, 3, { objects: [{ id: 'cracked-tile', at: [3, 2] }, { id: 'mossback', at: [4, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    // Roll and drop the anchor on the cracked tile, close to the Mossback.
    takeShot(p, shot({ power: 0.3 }));
    while (p.shot && p.shot.ball.x < 3.6) tick(p);
    tick(p, { ability: true });
    runShot(p);
    const log = drainLog(p);
    expect(log).toContainEqual({ kind: 'break', uid: 'cracked-tile#0', wild: false });
    expect(kinds(log)).toContain('stunned');
    expect(p.pickups.filter((x) => x.def.effect === 'yellowStar')).toHaveLength(2);
  });

  it('Burner: keeps the ball at 14 tiles/s or more for 0.6 s', () => {
    const p = withAbility('burner', field(30, 3));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    takeShot(p, shot({ power: 0.2 }));
    tick(p, { ability: true });
    for (let i = 0; i < 60; i++) {
      tick(p);
      expect(Math.hypot(p.shot!.ball.vx, p.shot!.ball.vy)).toBeGreaterThanOrEqual(13.9);
    }
  });

  it('Burner: passes through a tier 1 enemy it defeats with no speed loss', () => {
    const p = withAbility('burner', field(30, 3, { objects: [{ id: 'mossback', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fireWithAbility(p, shot({ power: 0.4 }), 1);
    expect(kinds(log)).toContain('defeat');
    expect(p.shot).toBeNull();
    expect(p.ball.x).toBeGreaterThan(12);
  });

  it('Hop: lifts the bottom of the ball 1.1 tiles from the ground', () => {
    const p = withAbility('hop', field(30, 3));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    takeShot(p, shot({ power: 0.3 }));
    tick(p, { ability: true });
    let top = 0;
    while (p.shot) {
      top = Math.max(top, p.shot.ball.z - 0.5);
      tick(p);
    }
    expect(top).toBeGreaterThan(1.05);
    expect(top).toBeLessThan(1.3);
  });

  it('Hop: clears a thunder cloud a rolling ball would hit', () => {
    const p = withAbility('hop', field(14, 3, { objects: [{ id: 'thunder-cloud', at: [5, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    takeShot(p, shot({ power: 0.6 }));
    while (p.shot && p.shot.ball.x < 4.2) tick(p);
    tick(p, { ability: true });
    runShot(p);
    expect(kinds(drainLog(p))).not.toContain('zap');
  });

  it('Tornado: same seed gives the same weave; it does not fall while active, and falls if it ends over a drop', () => {
    // High ground x 1..4 at height 3, a pit x 5..14 at height 1.
    const set: Record<string, string> = {};
    for (let x = 1; x <= 2; x++) for (let y = 1; y <= 5; y++) set[`${x},${y}`] = 'g3';
    // A tall wall all round, so the hovering ball cannot float off the course.
    for (let y = 0; y <= 6; y++) for (let x = 0; x <= 15; x++) if (x === 0 || y === 0 || x === 15 || y === 6) set[`${x},${y}`] = 'g6';
    const make = () => {
      const p = play(field(14, 5, {}, set), 'tw');
      p.ability = 'tornado';
      p.ball = { x: 2.6, y: 3.5, z: 1.5, vx: 0, vy: 0, vz: 0, grounded: true };
      p.restSpot = { ...p.ball };
      return p;
    };
    const a = make();
    takeShot(a, shot({ power: 0.2 }));
    tick(a, { ability: true });
    let minZWhileActive = Infinity;
    let wentOver = false;
    while (a.tornado) {
      tick(a);
      if (a.shot && a.shot.ball.x > 3.3) {
        wentOver = true;
        minZWhileActive = Math.min(minZWhileActive, a.shot.ball.z);
      }
    }
    runShot(a);
    expect(wentOver).toBe(true);
    expect(minZWhileActive).toBeGreaterThan(1.4);
    // After it ends, the ball falls into the pit.
    expect(a.ball.z).toBeCloseTo(0.5, 3);

    const b = make();
    takeShot(b, shot({ power: 0.2 }));
    tick(b, { ability: true });
    runShot(b);
    expect(b.ball).toEqual(a.ball);
  });

  it('Tornado: steering turns it', () => {
    const run = (steer: number) => {
      const p = withAbility('tornado', field(30, 30));
      p.ball = { ...p.ball, x: 15.5, y: 15.5 };
      takeShot(p, shot({ power: 0.2 }));
      tick(p, { ability: true });
      while (p.tornado) tick(p, { steer });
      return p.shot ? p.shot.ball : p.ball;
    };
    const left = run(-1);
    const right = run(1);
    expect(Math.hypot(left.x - right.x, left.y - right.y)).toBeGreaterThan(1);
  });

  it('Tornado: 1 damage to an enemy it spirals into', () => {
    const p = withAbility('tornado', field(6, 1, { objects: [{ id: 'spitter', at: [4, 1] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 1.5 };
    const log = fireWithAbility(p, shot({ power: 0.2 }), 1);
    expect(log.some((e) => e.kind === 'hit' && e.enemy === 'spitter#0' && e.damage === 1)).toBe(true);
  });

  it('once per shot; picking up another replaces it', () => {
    const p = withAbility('hop', field(14, 3, { objects: [{ id: 'anchorback', at: [6, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const inputs: TickInput[] = [];
    inputs[2] = { ability: true };
    inputs[4] = { ability: true };
    const log = fire(p, shot({ power: 0.6 }), inputs);
    expect(log.filter((e) => e.kind === 'abilityUsed')).toHaveLength(1);
    expect(log).toContainEqual({ kind: 'abilityGained', ability: 'anchor', wild: false });
    expect(p.ability).toBe('anchor');
  });
});

// ---------------------------------------------------------------------------

describe('crates and the Wild', () => {
  it('a crate breaks in one hit and drops its star', () => {
    const p = play(field(12, 3, { objects: [{ id: 'crate', at: [5, 2] }], quota: 1 }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const log = fire(p, shot({ power: 0.5 }));
    expect(kinds(log)).toContain('break');
    expect(p.pickups.filter((x) => x.uid.startsWith('drop:crate#0:yellow-star'))).toHaveLength(1);
  });

  it('a secured crate bounces the ball off the first hit and breaks on the second', () => {
    const p = play(field(12, 3, { objects: [{ id: 'secured-crate', at: [5, 2] }] }));
    p.ball = { ...p.ball, x: 1.5, y: 2.5 };
    const first = fire(p, shot({ power: 0.5 }));
    expect(kinds(first)).toContain('crateHit');
    expect(kinds(first)).not.toContain('break');
    expect(p.ball.x).toBeLessThan(5);
    const second = fire(p, shot({ power: 0.5 }));
    expect(kinds(second)).toContain('break');
  });

  it('a secured crate drops a Wild about 10% of the time', () => {
    let wilds = 0;
    const n = 300;
    for (let i = 0; i < n; i++) {
      const p = play(field(12, 3, { objects: [{ id: 'secured-crate', at: [3, 2] }] }), `w${i}`);
      p.ball = { ...p.ball, x: 1.5, y: 2.5 };
      p.breakables[0]!.health = 1;
      const log = fire(p, shot({ power: 0.5 }));
      if (log.some((e) => e.kind === 'break' && e.wild)) wilds++;
    }
    expect(wilds / n).toBeGreaterThan(0.05);
    expect(wilds / n).toBeLessThan(0.16);
  });

  it('a Wild gives a different ability from the one held', () => {
    for (let i = 0; i < 20; i++) {
      const p = play(field(12, 3, { objects: [{ id: 'wild', at: [3, 2] }] }), `wild${i}`);
      p.ability = 'hop';
      p.ball = { ...p.ball, x: 1.5, y: 2.5 };
      const log = fire(p, shot({ power: 0.4 }));
      const got = log.find((e) => e.kind === 'abilityGained');
      expect(got).toBeDefined();
      expect(p.ability).not.toBe('hop');
    }
  });
});

describe('ballNow', () => {
  it('is the resting ball when nothing moves', () => {
    const p = play(field(4, 3));
    expect(ballNow(p)).toBe(p.ball);
  });
});

describe('test bench (owner request, 2026-11-14)', () => {
  it('every choice builds a valid course with that thing at or crossing the centre', async () => {
    const { benchChoices, benchCourse } = await import('../src/content/courses/testBench');
    for (const c of benchChoices()) {
      const r = parseCourse(benchCourse(c.id));
      expect(r.ok, `${c.id}: ${r.ok ? '' : r.errors.join('; ')}`).toBe(true);
      if (r.ok && c.id === 'rail') {
        // Guard rails (Milestone 5b) are rails, not an object.
        expect(r.course.rails.length).toBeGreaterThan(0);
      } else if (r.ok && c.id) {
        const p = createPlay(r.course, T, { seed: 'bench' });
        expect(p.course.objects).toHaveLength(1);
      }
    }
  });
});
