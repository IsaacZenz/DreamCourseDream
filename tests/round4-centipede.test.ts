/**
 * Milestone 8 round 4: the centipede (Thousandfoot) in the Coil Pit
 * (sheet docs/plans/milestone-8-round-4.md, owner 2026-11-23).
 */
import { describe, expect, it } from 'vitest';
import { arenaData } from '../src/content/arenas';
import { BOSSES } from '../src/content/bosses';
import { DEFAULT_TUNING } from '../src/content/tuning';
import type { ShotCommand } from '../src/sim/ball';
import { parseCourse } from '../src/sim/course';
import { coilEdgeCoord, coilNextTurn, coilSegmentAt, createPlay, drainLog, runShot, takeShot, wait, type EnemyState, type PlayEvent, type PlayState } from '../src/sim/play';

const T = DEFAULT_TUNING;
const shot = (over: Partial<ShotCommand> = {}): ShotCommand => ({ angle: 0, power: 0.5, type: 'ground', topSpin: 0, sideSpin: 0, ...over });

function pit(seed = 'cp', health = 32): PlayState {
  const r = parseCourse(arenaData('coil-pit', 'centipede'));
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return createPlay(r.course, T, { seed, bossHealth: health });
}

const boss = (p: PlayState): EnemyState => p.enemies.find((e) => e.coil)!;

/** Put the resting ball somewhere, then take a tiny shot so an enemy turn runs. */
function turnAt(p: PlayState, x: number, y: number): PlayEvent[] {
  p.ball = { ...p.ball, x, y };
  p.restSpot = { ...p.ball };
  takeShot(p, shot({ power: 0.001 }));
  runShot(p);
  return drainLog(p);
}

describe('the Coil Pit', () => {
  it('is 15 by 15 and always the same arena for the centipede (owner)', () => {
    expect(BOSSES.get('centipede')!.arenas).toEqual(['coil-pit']);
    const p = pit();
    expect([p.course.width, p.course.height]).toEqual([15, 15]);
    expect(boss(p).coil!.segments).toBe(30);
  });
  it('has spikes in the corners (owner, 2026-11-24), symmetrical, one tile in, so the outer ring is a clear path all the way round', () => {
    const c = pit().course;
    const spiky = (x: number, y: number) => c.tiles[y * c.width + x]?.surface === 'spikes';
    let n = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (!spiky(x, y)) continue;
        n++;
        expect(spiky(c.width - 1 - x, y) && spiky(x, c.height - 1 - y)).toBe(true);
        expect(x > 0 && y > 0 && x < c.width - 1 && y < c.height - 1).toBe(true);
      }
    }
    expect(n).toBe(20);
  });
  it('the body is the wall: a hard shot at the edge bounces back instead of falling off', () => {
    const p = pit();
    takeShot(p, shot({ angle: Math.PI / 2, power: 1 }));
    runShot(p);
    const log = drainLog(p);
    expect(log.some((e) => e.kind === 'returned')).toBe(false);
    expect(log.some((e) => e.kind === 'hit' && e.enemy === boss(p).uid)).toBe(true);
  });
});

describe('the moving body and its weak spots (owner)', () => {
  it('never stops: it moves while the player aims', () => {
    const p = pit();
    const before = boss(p).coil!.offset;
    wait(p, 120);
    expect(boss(p).coil!.offset).toBeCloseTo(before + 1, 5);
  });
  it('starts with 3 weak spots and 2 shooters, never on the same segment', () => {
    const c = boss(pit()).coil!;
    expect(c.weak.length).toBe(3);
    expect(c.shooters.length).toBe(2);
    expect(c.shooters.some((k) => c.weak.includes(k))).toBe(false);
  });
  it('an armoured segment blocks the hit; a weak one takes it', () => {
    const p = pit();
    const b = boss(p);
    b.coil!.weak = [];
    takeShot(p, shot({ angle: Math.PI / 2, power: 1 }));
    runShot(p);
    let log = drainLog(p);
    expect(log.some((e) => e.kind === 'hit' && e.enemy === b.uid && e.blocked)).toBe(true);
    expect(b.health).toBe(32);
    const q = pit();
    const qb = boss(q);
    qb.coil!.weak = Array.from({ length: 30 }, (_, k) => k);
    takeShot(q, shot({ angle: Math.PI / 2, power: 1 }));
    runShot(q);
    log = drainLog(q);
    expect(log.some((e) => e.kind === 'hit' && e.enemy === qb.uid && e.damage > 0)).toBe(true);
    expect(qb.health).toBeLessThan(32);
  });
  it('which segment is at a spot changes as the body moves', () => {
    const p = pit();
    const c = boss(p).coil!;
    const u = coilEdgeCoord(p.course, 7.5, 15);
    const a = coilSegmentAt(p.course, c, u);
    wait(p, 120 * 3);
    expect(coilSegmentAt(p.course, c, u)).not.toBe(a);
  });
});

describe('spikes and the leg sweep (owner: a two-turn rhythm)', () => {
  it('the first turn marks 2 spike paths, the first through the ball; the next turn fires them', () => {
    const p = pit();
    expect(coilNextTurn(boss(p))).toBe('sweep');
    const log = turnAt(p, 7.5, 9.5);
    const mark = log.find((e) => e.kind === 'spikeMark');
    expect(mark && mark.kind === 'spikeMark' && mark.lines.length).toBe(2);
    expect(coilNextTurn(boss(p))).toBe('spikes');
    const lines = boss(p).coil!.spikeMarks;
    const l = lines[0]!;
    // The ball's spot (where it rested for the enemy turn) lies on the first line.
    const bx = p.ball.x;
    const by = p.ball.y;
    const t = ((bx - l.x0) * (l.x1 - l.x0) + (by - l.y0) * (l.y1 - l.y0)) / ((l.x1 - l.x0) ** 2 + (l.y1 - l.y0) ** 2);
    expect(Math.hypot(l.x0 + (l.x1 - l.x0) * t - bx, l.y0 + (l.y1 - l.y0) * t - by)).toBeLessThan(0.01);
    // Staying on the spot: the spike aimed at it hits.
    const h = p.health;
    const log2 = turnAt(p, bx, by);
    expect(log2.filter((e) => e.kind === 'spike').length).toBe(2);
    expect(log2.some((e) => e.kind === 'damage' && e.cause === 'quill')).toBe(true);
    expect(p.health).toBe(h - 1);
  });
  it('the sweep only hits a ball resting in the leg ring, and only on the off turn', () => {
    const p = pit();
    const h = p.health;
    let log = turnAt(p, 0.5, 7.5);
    expect(log.some((e) => e.kind === 'sweep')).toBe(true);
    expect(log.some((e) => e.kind === 'damage' && e.cause === 'sweep')).toBe(true);
    expect(p.health).toBeLessThan(h);
    // Pushed in, out of the ring.
    expect(p.ball.x).toBeGreaterThan(1);
    // Next turn is a fire turn: no sweep, even in the ring.
    log = turnAt(p, 0.5, 3.5);
    expect(log.some((e) => e.kind === 'sweep')).toBe(false);
  });
  it('the spikes and the sweep kill minions (owner: unlike every other boss)', () => {
    const p = pit();
    turnAt(p, 7.5, 9.5);
    const b = boss(p);
    // A minion standing on the second marked path, and one in the leg ring.
    b.health = 20; // phase 2
    const l = b.coil!.spikeMarks[1]!;
    const onLine = { x: (l.x0 + l.x1) / 2, y: (l.y0 + l.y1) / 2 };
    const proto = p.enemies.length;
    // Summon by hand: copy the boss's summon path through a real enemy turn would be random, so place them directly.
    const field = createPlay(parseOk({ format: 3, name: 'm', legend: { g: 'grass' }, tiles: ['g2 g2', 'g2 g2'], start: [0, 0], exit: [1, 1], quota: 0, objects: [{ id: 'leadgrub', at: [1, 0] }] }), T, { seed: 'm' });
    const ant = { ...field.enemies[0]!, uid: 'test-ant', x: onLine.x, y: onLine.y, minion: true };
    p.enemies.push(ant);
    expect(p.enemies.length).toBe(proto + 1);
    const log = turnAt(p, 3.5, 3.5);
    expect(log.some((e) => e.kind === 'crushed' && e.enemy === 'test-ant')).toBe(true);
    expect(ant.defeated).toBe(true);
  });
});

function parseOk(raw: unknown) {
  const r = parseCourse(raw);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

describe('phases', () => {
  it('weak spots grow as a superset with the right counts, shooters avoid them, and the direction flips', () => {
    const p = pit('ph');
    const b = boss(p);
    const w1 = [...b.coil!.weak];
    const dir = b.coil!.dir;
    // Force phase 2 by damage on a weak spot.
    b.health = 22;
    for (let i = 0; i < 20 && b.phase === 0 && p.status === 'playing'; i++) {
      takeShot(p, shot({ angle: (i * Math.PI) / 5, power: 1 }));
      runShot(p);
    }
    if (b.phase >= 1) {
      expect(b.coil!.weak.length).toBe(6);
      expect(w1.every((k) => b.coil!.weak.includes(k))).toBe(true);
      expect(b.coil!.shooters.length).toBe(3);
      expect(b.coil!.shooters.some((k) => b.coil!.weak.includes(k))).toBe(false);
      expect(b.coil!.dir).toBe(-dir);
    }
    expect(b.phase).toBeGreaterThanOrEqual(1);
  });
});

describe('phase 3: the head (owner)', () => {
  it('marks a circle, bursts up there (hurting the ball and minions in it), can be hit for double, fires one unwarned spike and sinks', () => {
    const p = pit('hd');
    const b = boss(p);
    b.health = 10;
    b.phase = 2;
    b.coil!.weak = [];
    // Off turn: the circle is marked round the ball.
    let log = turnAt(p, 7.5, 7.5);
    const mark = log.find((e) => e.kind === 'headMark');
    expect(mark).toBeTruthy();
    expect(b.coil!.head).toBe('marked');
    // Fire turn: the head bursts up; the ball in the circle is hurt and thrown out.
    const h = p.health;
    log = turnAt(p, 7.5, 7.5);
    expect(log.some((e) => e.kind === 'headUp' && e.hit)).toBe(true);
    expect(p.health).toBe(h - 1);
    expect(b.coil!.head).toBe('up');
    // A shot into the head: double damage.
    const before = b.health;
    const dx = b.x - p.ball.x;
    const dy = b.y - p.ball.y;
    takeShot(p, shot({ angle: Math.atan2(dy, dx), power: 0.6 }));
    runShot(p);
    log = drainLog(p);
    const hit = log.find((e) => e.kind === 'hit' && e.enemy === b.uid && e.damage > 0);
    expect(hit && hit.kind === 'hit' && hit.damage).toBe(2 * p.stats.get('hitDamage'));
    expect(b.health).toBe(before - 2 * p.stats.get('hitDamage'));
    // That shot's enemy turn was the off turn: one unwarned spike, then the head sinks.
    expect(log.some((e) => e.kind === 'spike' && !e.marked)).toBe(true);
    expect(log.some((e) => e.kind === 'headDown')).toBe(true);
    expect(b.coil!.head).toBe('sunk');
  });
  it('the head is not on the course while it is down', () => {
    const p = pit();
    expect(p.world.obstacles.some((o) => o.id === boss(p).uid)).toBe(false);
  });
});

describe('determinism', () => {
  it('the same seed and shots give the same fight', () => {
    const run = (): string => {
      const p = pit('det');
      for (let i = 0; i < 6 && p.status === 'playing'; i++) {
        wait(p, 37 * i);
        takeShot(p, shot({ angle: i * 1.1, power: 0.7 }));
        runShot(p);
      }
      const b = boss(p);
      return JSON.stringify([b.health, b.coil, p.health, p.ball.x.toFixed(6), p.ball.y.toFixed(6)]);
    };
    expect(run()).toBe(run());
  });
});
