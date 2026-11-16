/**
 * Milestone 7: bug bosses (design sheet docs/plans/milestone-7.md section 2),
 * the statuses on the ball, and the damage floor.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING } from '../src/content/tuning';
import { BUGS, COLOURS, SKILLS } from '../src/content/bosses';
import { allBuiltCombos, arenaFor, pickBoss } from '../src/gen/boss';
import { ballAtTile } from '../src/sim/ball';
import { bossName, phaseOf, type BossSpec } from '../src/sim/boss';
import { computeHit } from '../src/sim/damage';
import { applyBallStatus, createPlay, drainLog, runShot, takeShot, wait, type PlayEvent, type PlayState } from '../src/sim/play';

const T = DEFAULT_TUNING;
const arena = arenaFor('TEST', 1);
const spec = (over: Partial<BossSpec> = {}): BossSpec => ({ bug: 'goliath', colour: 'red', skill: 'slam', region: 1, ...over });
const fight = (s: BossSpec, seed = 'B1') => createPlay(arena, T, { seed, boss: s });
const bossOf = (p: PlayState) => p.enemies.find((e) => e.uid === p.boss!.uid)!;

/** A tiny shot, so the ball barely moves and an enemy turn runs. Shots are topped up so no nap interferes. */
function pass(p: PlayState, keepHealth = true): PlayEvent[] {
  p.shots = 9;
  if (keepHealth) p.health = 99;
  takeShot(p, { angle: 0, power: 0, type: 'ground', topSpin: 0, sideSpin: 0 });
  runShot(p);
  return drainLog(p);
}

/** Put the resting ball on a tile. */
function moveBall(p: PlayState, x: number, y: number): void {
  p.ball = ballAtTile(p.course, x, y);
}

describe('boss parts and picking (sheet sections 2.1 to 2.6)', () => {
  it('has five bugs (owner: no bumblebee), five colours and five skills; three bugs and three skills are built', () => {
    expect(BUGS.map((b) => b.id)).toEqual(['goliath', 'mantis', 'grasshopper', 'butterfly', 'centipede']);
    expect(COLOURS.map((c) => c.id)).toEqual(['red', 'blue', 'yellow', 'green', 'rainbow']);
    expect(SKILLS).toHaveLength(5);
    expect(allBuiltCombos(1)).toHaveLength(45);
  });

  it('owner: fire and ice are weak to each other, lightning and poison weak to each other', () => {
    const c = Object.fromEntries(COLOURS.map((x) => [x.id, x]));
    expect(c.red!.weakTo).toEqual(['ice']);
    expect(c.blue!.weakTo).toEqual(['fire']);
    expect(c.yellow!.weakTo).toEqual(['poison']);
    expect(c.green!.weakTo).toEqual(['shock']);
    expect(c.rainbow!.weakTo).toEqual([]);
  });

  it('names a boss from its parts', () => {
    expect(bossName(spec({ bug: 'mantis', colour: 'yellow', skill: 'pods' }))).toBe('Storm Mantis the Sower');
  });

  it('picks the same boss for the same seed, only built parts, and never a bug already met', () => {
    expect(pickBoss('ABC', 1)).toEqual(pickBoss('ABC', 1));
    for (let i = 0; i < 40; i++) {
      const first = pickBoss(`S${i}`, 1);
      const second = pickBoss(`S${i}`, 2, [first.bug]);
      expect(BUGS.find((b) => b.id === first.bug)!.built).toBe(true);
      expect(['slam', 'pods', 'charge']).toContain(first.skill);
      expect(second.bug).not.toBe(first.bug);
    }
  });

  it('phases at two thirds and one third of health, rounded down (Goliath 12: from 8 and from 4)', () => {
    expect([12, 9, 8, 5, 4, 1].map((h) => phaseOf(h, 12))).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe('the boss fight', () => {
  it('stands on the exit, which stays closed until it is defeated; region two has 1.5 times the health', () => {
    const p = fight(spec());
    const b = bossOf(p);
    expect(Math.floor(b.x)).toBe(p.course.exit.x);
    expect(p.exitOpen).toBe(false);
    expect(b.health).toBe(12);
    expect(bossOf(fight(spec({ region: 2 }))).health).toBe(18);
  });

  it('a slam is marked around the ball one turn and lands on the next: staying costs health, leaving is safe', () => {
    const p = fight(spec());
    const ev = pass(p);
    expect(ev.some((e) => e.kind === 'bossMark' && e.attack === 'slam')).toBe(true);
    expect(p.boss!.marks).toHaveLength(1);
    const ev2 = pass(p); // the slam lands on the ball, which did not move
    expect(ev2.filter((e) => e.kind === 'damage' && e.cause === 'boss').map((e) => (e.kind === 'damage' ? e.amount : 0))).toEqual([2]); // Goliath: 2 damage (owner)

    const q = fight(spec());
    pass(q);
    moveBall(q, 2, 12); // far from the ring
    expect(pass(q).some((e) => e.kind === 'damage')).toBe(false);
  });

  it('a slam hit gives the colour status (red: Burning, which hurts at the start of the next shots)', () => {
    const p = fight(spec());
    pass(p);
    pass(p);
    expect(p.ballStatuses.map((s) => s.id)).toContain('burning');
  });

  it('the colour attack leaves its ground: a fireball leaves scorch', () => {
    const p = fight(spec());
    pass(p); // turn 0: slam marked
    moveBall(p, 2, 12);
    pass(p); // turn 1: slam lands (missed); no new mark (phase 1 marks every second turn)
    pass(p); // turn 2: fireball marked
    expect(p.boss!.marks.map((m) => m.attack)).toContain('fireball');
    moveBall(p, 12, 2);
    pass(p); // turn 3: it lands
    expect(p.boss!.hazards.some((h) => h.kind === 'scorch')).toBe(true);
  });

  it('phase 2 summons helpers on the pads, never more than the cap', () => {
    const p = fight(spec({ skill: 'charge' }));
    bossOf(p).health = 8;
    // The first phase-2 turn summons two, each on a pad, in the boss's colour.
    expect(pass(p).filter((e) => e.kind === 'bossSummon')).toHaveLength(2);
    const first = p.enemies.filter((e) => e.summoned);
    for (const h of first) expect(p.pads.some((pd) => Math.hypot(pd.x - h.x, pd.y - h.y) < 0.01)).toBe(true);
    expect(first.every((h) => h.statusOnHit === 'burning' && h.def.element === 'fire')).toBe(true);
    for (let i = 0; i < 8; i++) {
      pass(p);
      expect(p.enemies.filter((e) => e.summoned && !e.defeated).length).toBeLessThanOrEqual(4);
    }
  });

  it('owner: a defeated helper secures a star only about half the time', () => {
    let stars = 0;
    let none = 0;
    for (let i = 0; i < 30; i++) {
      const p = fight(spec({ skill: 'charge' }), `H${i}`);
      bossOf(p).health = 8;
      pass(p);
      const h = p.enemies.find((e) => e.summoned && !e.defeated);
      if (!h) continue;
      const meter = p.wallet;
      h.health = 1;
      // Hit it with a shot aimed straight at it.
      p.shots = 9;
      p.ball = { ...p.ball, x: h.x - 1.2, y: h.y };
      takeShot(p, { angle: 0, power: 0.4, type: 'ground', topSpin: 0, sideSpin: 0 });
      runShot(p);
      if (!h.defeated) continue;
      if (p.wallet > meter) stars++;
      else none++;
    }
    expect(stars).toBeGreaterThan(2);
    expect(none).toBeGreaterThan(2);
  });

  it('pods hatch into a helper unless the ball rolls over them', () => {
    const p = fight(spec({ skill: 'pods' }));
    pass(p); // pods marked
    moveBall(p, 2, 12);
    pass(p); // pods land on empty ground
    expect(p.boss!.pods.length).toBeGreaterThan(0);
    const ev = pass(p);
    expect(ev.some((e) => e.kind === 'podHatch')).toBe(true);
  });

  it('the mantis makes two marks every third turn; the grasshopper leaps to its marked spot', () => {
    const m = fight(spec({ bug: 'mantis' }));
    pass(m); // turn 0: one mark
    moveBall(m, 2, 12);
    pass(m); // turn 1
    moveBall(m, 12, 2);
    pass(m); // turn 2: a mark, and the third turn: a second
    expect(m.boss!.marks.length).toBe(2);

    const g = fight(spec({ bug: 'grasshopper' }));
    pass(g);
    const leap = g.boss!.marks.find((x) => x.attack === 'leap');
    expect(leap).toBeTruthy();
    moveBall(g, 2, 12);
    pass(g);
    const at = leap!.shape.kind === 'circles' ? leap!.shape.pts[0]! : { x: 0, y: 0 };
    expect(Math.hypot(bossOf(g).x - at.x, bossOf(g).y - at.y)).toBeLessThan(0.01);
  });

  it('defeating the boss opens the exit and stops its marks', () => {
    const p = fight(spec());
    pass(p);
    const b = bossOf(p);
    b.health = 1;
    p.shots = 9;
    p.ball = ballAtTile(p.course, 7, 10);
    takeShot(p, { angle: -Math.PI / 2, power: 0.6, type: 'ground', topSpin: 0, sideSpin: 0 });
    runShot(p);
    expect(b.defeated).toBe(true);
    expect(p.exitOpen).toBe(true);
    expect(p.boss!.marks).toHaveLength(0);
  });

  it('is the same fight for the same seed and shots', () => {
    const a = fight(spec({ colour: 'rainbow', skill: 'pods' }), 'SAME');
    const b = fight(spec({ colour: 'rainbow', skill: 'pods' }), 'SAME');
    for (let i = 0; i < 4; i++) {
      pass(a);
      pass(b);
    }
    expect(JSON.stringify(a.boss)).toBe(JSON.stringify(b.boss));
    expect(a.health).toBe(b.health);
  });
});

describe('harder boss fights (owner, 2026-11-16)', () => {
  it('hitting the boss gives no shot back', () => {
    const p = fight(spec());
    p.shots = 3;
    p.ball = ballAtTile(p.course, 7, 10);
    takeShot(p, { angle: -Math.PI / 2, power: 0.6, type: 'ground', topSpin: 0, sideSpin: 0 });
    runShot(p);
    expect(bossOf(p).health).toBeLessThan(12);
    expect(p.shots).toBe(2);
  });

  it('the rage timer: after 15 boss turns it marks every turn, with bigger marks', () => {
    const p = fight(spec());
    p.boss!.turn = 15;
    const ev = pass(p);
    expect(ev.some((e) => e.kind === 'bossRage')).toBe(true);
    expect(p.boss!.enraged).toBe(true);
    const mark = p.boss!.marks[0]!;
    expect(mark.shape.kind === 'circles' && mark.shape.r).toBeCloseTo(1.75 * 1.3);
    // It marks again on the very next turn (phase 1 would wait a turn).
    moveBall(p, 2, 12);
    expect(pass(p).some((e) => e.kind === 'bossMark')).toBe(true);
  });
});

describe('statuses on the ball and the damage floor (owner, 2026-11-16)', () => {
  it('Burning hurts at the start of each of the next two shots', () => {
    // On the arena with no boss, so nothing else puts Burning on again.
    const p = createPlay(arena, T, { seed: 'NB' });
    applyBallStatus(p, 'burning');
    // Aiming takes time: wait a second before each shot, past the 0.5 s immunity after damage.
    const aimThenPass = () => {
      wait(p, 120);
      return pass(p);
    };
    const burns = [aimThenPass(), aimThenPass(), aimThenPass()].flat().filter((e) => e.kind === 'damage' && e.cause === 'burn');
    expect(burns).toHaveLength(2);
  });

  it('Poisoned cuts shot power by 20% but hit damage stays at least 1; Chilled makes the ground icy', () => {
    const p = fight(spec());
    applyBallStatus(p, 'poisoned');
    expect(p.stats.get('shotPower')).toBeCloseTo(0.8);
    expect(p.stats.get('hitDamage')).toBe(1);
    applyBallStatus(p, 'chilled');
    p.shots = 9;
    takeShot(p, { angle: 0, power: 0.3, type: 'ground', topSpin: 0, sideSpin: 0 });
    expect(p.shot!.iceAll).toBe(true);
  });

  it('a hit always does at least 1, unless a gimmick blocks it', () => {
    const plain = { weakTo: [], resists: ['fire' as const], weakSpots: [], guardedSides: [], shieldUp: false };
    expect(computeHit({ base: 1, element: 'fire', fromAbove: false, fromBehind: false }, plain).damage).toBe(1);
    expect(computeHit({ base: 1, element: null, fromAbove: false, fromBehind: false }, { ...plain, shieldUp: true }).damage).toBe(0);
  });
});
