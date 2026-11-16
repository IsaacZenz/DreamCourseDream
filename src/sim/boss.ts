/**
 * Bug bosses in the simulation (Milestone 7 design sheet,
 * docs/plans/milestone-7.md section 2, signed off by the owner 2026-11-16).
 *
 * A boss is an enemy on the course (so hits, the damage steps, statuses and
 * the health bar work as for any enemy) with the behaviour "boss". On each
 * enemy turn it acts first: it lands the marks it made on an earlier turn,
 * hatches pods, then makes new marks and summons by the pattern of its phase.
 * Every attack is marked on the ground one enemy turn before it lands, so the
 * player always has one shot to get clear.
 *
 * This file holds the boss's own state and decisions. It changes the rest of
 * the course only through `BossHost`, which play.ts provides, so the course
 * rules stay in one place.
 *
 * Plain TypeScript, deterministic: all randomness comes from the course's
 * seeded generator.
 */
import {
  BOSS_ATTACKS,
  BOSS_REGIONS,
  BOSS_SUMMONS,
  BUGS,
  COLOURS,
  SKILLS,
  type BugDef,
  type BugId,
  type ColourAttack,
  type ColourDef,
  type ColourId,
  type HazardKind,
  type PowerDef,
  type SkillId,
} from '../content/bosses.ts';
import type { EnemyDef } from '../content/objects.ts';
import type { BallState } from './ball.ts';
import type { Rng } from './rng.ts';

// ---------------------------------------------------------------------------
// What a boss is

/** The three parts, and the region it is fought in (region two is stronger). */
export interface BossSpec {
  readonly bug: BugId;
  readonly colour: ColourId;
  readonly skill: SkillId;
  readonly region: number;
}

export function bugOf(spec: BossSpec): BugDef {
  return BUGS.find((b) => b.id === spec.bug)!;
}
export function colourOf(spec: BossSpec): ColourDef {
  return COLOURS.find((c) => c.id === spec.colour)!;
}
function regionOf(spec: BossSpec) {
  return BOSS_REGIONS.find((r) => r.region === spec.region) ?? BOSS_REGIONS[BOSS_REGIONS.length - 1]!;
}

/** Owner, 2026-11-16: the name is made from the parts, for example "Storm Mantis the Sower". */
export function bossName(spec: BossSpec): string {
  const skill = SKILLS.find((s) => s.id === spec.skill)!;
  return `${colourOf(spec).word} ${bugOf(spec).name} ${skill.title}`;
}

export function bossMaxHealth(spec: BossSpec): number {
  return Math.floor(bugOf(spec).health * regionOf(spec).healthScale);
}

export function helperCap(spec: BossSpec): number {
  return bugOf(spec).helperCap + regionOf(spec).helperCapAdd;
}

/** Blue stars for beating it (sheet section 2.9): 5 in region one, 8 in region two, +2 for rainbow. */
export function bossBlueStars(spec: BossSpec): number {
  return regionOf(spec).blueStars + colourOf(spec).bonusBlue;
}

/** The boss as an enemy definition, built from its parts. */
export function bossEnemyDef(spec: BossSpec): EnemyDef {
  const bug = bugOf(spec);
  const colour = colourOf(spec);
  return {
    kind: 'enemy',
    id: `boss-${spec.bug}-${spec.colour}-${spec.skill}`,
    name: bossName(spec),
    sprite: `${bug.sprite}-${spec.colour}`,
    family: 'sentinel',
    tier: 5,
    stats: { health: bossMaxHealth(spec), attackDamage: bug.damage, moveRange: 0, attackRange: 0, outerRadius: 0, innerRadius: 0 },
    starValue: 0,
    element: colour.powers.length === 1 ? colour.powers[0]!.element : null,
    weakTo: colour.weakTo,
    resists: colour.resists,
    weakSpots: bug.weakBehind ? ['behind'] : [],
    guardedSides: [],
    shield: false,
    shape: { kind: 'round', r: bug.radius },
    height: bug.height,
    bounce: bug.bounce,
    triggers: { hit: 'none', rest: 'none', passBy: 'none' },
    passByGroundOnly: false,
    behaviour: { kind: 'boss' },
    contact: 'never',
    grantsAbility: null,
    allowedTraits: [],
    allowedGear: [],
    squadThemes: [],
    cost: 0,
  };
}

/** Sheet section 2.7: above ⅔ of its health phase 1, down to ⅓ phase 2, below that phase 3 (thresholds rounded down). */
export function phaseOf(health: number, max: number): 1 | 2 | 3 {
  if (health > Math.floor((max * 2) / 3)) return 1;
  if (health > Math.floor(max / 3)) return 2;
  return 3;
}

// ---------------------------------------------------------------------------
// Marks and ground

export type MarkShape =
  | { readonly kind: 'circles'; readonly pts: readonly { x: number; y: number }[]; readonly r: number }
  | { readonly kind: 'lane'; readonly ax: number; readonly ay: number; readonly bx: number; readonly by: number; readonly half: number }
  | { readonly kind: 'cone'; readonly x: number; readonly y: number; readonly dx: number; readonly dy: number; readonly length: number; readonly halfAngle: number }
  | { readonly kind: 'tiles'; readonly tiles: readonly { x: number; y: number }[] };

export type MarkAttack = SkillId | ColourAttack | 'leap';

export interface BossMark {
  readonly id: string;
  readonly source: 'skill' | 'colour' | 'leap';
  readonly attack: MarkAttack;
  /** The power it carries (its status, element and, for colour attacks, the ground it leaves). */
  readonly power: PowerDef;
  readonly shape: MarkShape;
  /** The boss turn it was made on; it lands on a later one. */
  readonly made: number;
}

export interface Hazard {
  readonly id: string;
  readonly kind: HazardKind;
  readonly shape: MarkShape;
  /** Enemy turns left. */
  turnsLeft: number;
}

/** A pod that landed on empty ground: it hatches into a helper unless the ball rolls over it first. */
export interface Pod {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly hatchTurn: number;
  readonly power: PowerDef;
  done: boolean;
}

export interface BossState {
  readonly spec: BossSpec;
  /** The boss's enemy uid. */
  readonly uid: string;
  readonly maxHealth: number;
  /** Boss turns taken so far. */
  turn: number;
  phase: 1 | 2 | 3;
  /** Turns taken in the current phase. */
  phaseTurn: number;
  /** The phase last reported to the display. */
  shownPhase: 1 | 2 | 3;
  marks: BossMark[];
  hazards: Hazard[];
  pods: Pod[];
  /** Which attack the next alternating mark is. */
  next: 'skill' | 'colour';
  /** Which list the next single summon comes from (phase 3). */
  nextHelper: 'attacker' | 'carrier';
  /** Counts marks, hazards and pods for unique ids. */
  made: number;
  /** Hazards that already acted on the ball in this motion (id). */
  touched: string[];
  touchedMotion: number;
  defeated: boolean;
}

export function newBossState(spec: BossSpec, uid: string): BossState {
  return {
    spec,
    uid,
    maxHealth: bossMaxHealth(spec),
    turn: 0,
    phase: 1,
    phaseTurn: 0,
    shownPhase: 1,
    marks: [],
    hazards: [],
    pods: [],
    next: 'skill',
    nextHelper: 'attacker',
    made: 0,
    touched: [],
    touchedMotion: -1,
    defeated: false,
  };
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; side: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return { d: Math.hypot(px - cx, py - cy), side: Math.sign(dx * (py - ay) - dy * (px - ax)) };
}

/** Is a point inside a mark or a patch of ground? */
export function inShape(shape: MarkShape, x: number, y: number): boolean {
  if (shape.kind === 'circles') return shape.pts.some((p) => Math.hypot(x - p.x, y - p.y) <= shape.r);
  if (shape.kind === 'lane') return segDist(x, y, shape.ax, shape.ay, shape.bx, shape.by).d <= shape.half;
  if (shape.kind === 'cone') {
    const rx = x - shape.x;
    const ry = y - shape.y;
    const d = Math.hypot(rx, ry);
    if (d > shape.length) return false;
    if (d < 1e-6) return true;
    const cos = (rx * shape.dx + ry * shape.dy) / d;
    return cos >= Math.cos((shape.halfAngle * Math.PI) / 180);
  }
  return shape.tiles.some((t) => Math.floor(x) === t.x && Math.floor(y) === t.y);
}

/** Tiles whose centre is inside a shape (frost turns them to ice). */
function tilesIn(shape: MarkShape, host: BossHost): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < host.height; y++) for (let x = 0; x < host.width; x++) if (host.isFloor(x + 0.5, y + 0.5) && inShape(shape, x + 0.5, y + 0.5)) out.push({ x, y });
  return out;
}

// ---------------------------------------------------------------------------
// What the boss needs from the course rules (provided by play.ts)

export interface BossHost {
  readonly rng: Rng;
  readonly width: number;
  readonly height: number;
  /** Boss position and facing (changed in place for leaps and charges). */
  readonly body: { x: number; y: number; z: number; fx: number; fy: number; health: number };
  /** The ball at rest. */
  ball(): BallState;
  /** Ground that can hold the ball, with no guard rail, at this point. */
  isFloor(x: number, y: number): boolean;
  /** Room for a body of radius r here: floor all round, no blockers, no other enemy. */
  canStand(x: number, y: number, r: number): boolean;
  groundZ(x: number, y: number): number;
  /** Hurt the ball: damage (immunity and armour apply), a status, and an optional knock. */
  hitBall(damage: number, status: string, knock: { vx: number; vy: number; vz: number } | null): void;
  /** Move the resting ball out of the boss's body after a leap. */
  placeBall(x: number, y: number): void;
  /** Summon pads, and whether each is free. */
  pads(): readonly { x: number; y: number; free: boolean }[];
  helpersAlive(): number;
  /** Put a helper enemy here with the boss's power. Returns its uid. */
  spawnHelper(id: string, x: number, y: number, power: PowerDef): string | null;
  addCloud(id: string, x: number, y: number): void;
  removeCloud(id: string): void;
  log(ev: BossEvent): void;
}

export type BossEvent =
  | { kind: 'bossMark'; mark: string; attack: MarkAttack }
  | { kind: 'bossLand'; mark: string; attack: MarkAttack; hit: boolean }
  | { kind: 'bossPhase'; phase: 1 | 2 | 3 }
  | { kind: 'bossSummon'; enemy: string }
  | { kind: 'bossLeap' }
  | { kind: 'podHatch'; pod: string; enemy: string | null }
  | { kind: 'podBroken'; pod: string };

// ---------------------------------------------------------------------------
// The boss's turn

function pickPower(boss: BossState, rng: Rng): PowerDef {
  const powers = colourOf(boss.spec).powers;
  return powers.length === 1 ? powers[0]! : rng.pick(powers);
}

/** A random floor point within `range` of (x, y), or null. */
function randomFloorNear(host: BossHost, x: number, y: number, range: number, ok: (px: number, py: number) => boolean = () => true): { x: number; y: number } | null {
  for (let i = 0; i < 30; i++) {
    const a = host.rng.float(0, Math.PI * 2);
    const d = host.rng.float(0.5, range);
    const px = x + Math.cos(a) * d;
    const py = y + Math.sin(a) * d;
    if (host.isFloor(px, py) && ok(px, py)) return { x: px, y: py };
  }
  return null;
}

/** From (ax, ay) along a direction to the last floor point before the arena's edge or a rail. */
function laneEnd(host: BossHost, ax: number, ay: number, dx: number, dy: number): { x: number; y: number } {
  let ex = ax;
  let ey = ay;
  for (let t = 0.25; t < 60; t += 0.25) {
    const px = ax + dx * t;
    const py = ay + dy * t;
    if (!host.isFloor(px, py)) break;
    ex = px;
    ey = py;
  }
  return { x: ex, y: ey };
}

function makeMark(boss: BossState, host: BossHost, source: 'skill' | 'colour'): BossMark | null {
  const b = host.ball();
  const me = host.body;
  const bug = bugOf(boss.spec);
  const power = pickPower(boss, host.rng);
  const id = `mark:${boss.made++}`;
  const toBall = Math.hypot(b.x - me.x, b.y - me.y);
  const ux = toBall > 1e-6 ? (b.x - me.x) / toBall : me.fx;
  const uy = toBall > 1e-6 ? (b.y - me.y) / toBall : me.fy;
  const A = BOSS_ATTACKS;
  let attack: MarkAttack;
  let shape: MarkShape;
  if (source === 'skill') {
    attack = boss.spec.skill;
    if (attack === 'slam') shape = { kind: 'circles', pts: [{ x: b.x, y: b.y }], r: boss.phase === 3 ? A.slam.radiusPhase3 : A.slam.radius };
    else if (attack === 'pods') {
      const pts = [{ x: b.x, y: b.y }];
      for (let i = 1; i < A.pods.count; i++) {
        const p = randomFloorNear(host, b.x, b.y, A.pods.scatter);
        if (p) pts.push(p);
      }
      shape = { kind: 'circles', pts, r: A.pods.radius };
    } else if (attack === 'charge') {
      const end = laneEnd(host, me.x, me.y, ux, uy);
      shape = { kind: 'lane', ax: me.x, ay: me.y, bx: end.x, by: end.y, half: A.charge.halfWidth };
    } else return null; // Gust and Web snare: Milestone 8.
  } else {
    attack = power.attack;
    if (attack === 'fireball') shape = { kind: 'circles', pts: [{ x: b.x, y: b.y }], r: A.fireball.radius };
    else if (attack === 'frost') shape = { kind: 'cone', x: me.x, y: me.y, dx: ux, dy: uy, length: bug.radius + A.frost.length, halfAngle: A.frost.halfAngle };
    else if (attack === 'bolts') {
      const tiles = [{ x: Math.floor(b.x), y: Math.floor(b.y) }];
      for (let i = 0; i < A.bolts.extra; i++) {
        const p = randomFloorNear(host, b.x, b.y, A.bolts.scatter, (px, py) => !tiles.some((t) => t.x === Math.floor(px) && t.y === Math.floor(py)));
        if (p) tiles.push({ x: Math.floor(p.x), y: Math.floor(p.y) });
      }
      shape = { kind: 'tiles', tiles };
    } else shape = { kind: 'circles', pts: [{ x: me.x, y: me.y }], r: A.spores.radius };
  }
  const mark: BossMark = { id, source, attack, power, shape, made: boss.turn };
  boss.marks.push(mark);
  host.log({ kind: 'bossMark', mark: id, attack });
  return mark;
}

function makeLeapMark(boss: BossState, host: BossHost): void {
  const bug = bugOf(boss.spec);
  const b = host.ball();
  const clear = bug.radius + 0.6;
  const target = randomFloorNear(host, b.x, b.y, bug.leapRange, (x, y) => Math.hypot(x - b.x, y - b.y) >= clear && host.canStand(x, y, bug.radius));
  if (!target) return;
  const id = `mark:${boss.made++}`;
  boss.marks.push({ id, source: 'leap', attack: 'leap', power: pickPower(boss, host.rng), shape: { kind: 'circles', pts: [target], r: bug.radius + bug.leapShock }, made: boss.turn });
  host.log({ kind: 'bossMark', mark: id, attack: 'leap' });
}

function knockAway(fromX: number, fromY: number, b: BallState, speed: number, hop: number, rng: Rng) {
  let dx = b.x - fromX;
  let dy = b.y - fromY;
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) {
    const a = rng.float(0, Math.PI * 2);
    dx = Math.cos(a);
    dy = Math.sin(a);
    d = 1;
  }
  return { vx: (dx / d) * speed, vy: (dy / d) * speed, vz: hop };
}

function addHazard(boss: BossState, host: BossHost, kind: HazardKind, shape: MarkShape): void {
  const id = `hazard:${boss.made++}`;
  boss.hazards.push({ id, kind, shape, turnsLeft: BOSS_ATTACKS.hazardTurns });
  if (kind === 'cloud' && shape.kind === 'tiles') {
    const t = shape.tiles[0]!;
    host.addCloud(id, t.x + 0.5, t.y + 0.5);
  }
}

function landMark(boss: BossState, host: BossHost, m: BossMark): void {
  const b = host.ball();
  const me = host.body;
  const bug = bugOf(boss.spec);
  const A = BOSS_ATTACKS;
  let hit = false;
  if (m.attack === 'leap') {
    const s = m.shape as Extract<MarkShape, { kind: 'circles' }>;
    const t = s.pts[0]!;
    me.x = t.x;
    me.y = t.y;
    me.z = host.groundZ(t.x, t.y);
    host.log({ kind: 'bossLeap' });
    const d = Math.hypot(b.x - t.x, b.y - t.y);
    if (d <= s.r) {
      hit = true;
      // Never leave the ball inside the body.
      const minD = bug.radius + 0.2;
      if (d < minD) {
        const k = knockAway(t.x, t.y, b, 1, 0, host.rng);
        host.placeBall(t.x + (k.vx || 1) * minD, t.y + k.vy * minD);
      }
      host.hitBall(bug.leapShockDamage, m.power.status, knockAway(t.x, t.y, host.ball(), A.slam.knock, A.slam.hop, host.rng));
    }
  } else if (m.attack === 'pods') {
    const s = m.shape as Extract<MarkShape, { kind: 'circles' }>;
    for (const p of s.pts) {
      if (Math.hypot(b.x - p.x, b.y - p.y) <= s.r) hit = true;
      else if (host.isFloor(p.x, p.y)) boss.pods.push({ id: `pod:${boss.made++}`, x: p.x, y: p.y, z: host.groundZ(p.x, p.y), hatchTurn: boss.turn + A.pods.hatchTurns, power: m.power, done: false });
    }
    if (hit) host.hitBall(bug.damage, m.power.status, null);
  } else {
    hit = inShape(m.shape, b.x, b.y);
    if (m.attack === 'charge') {
      const s = m.shape as Extract<MarkShape, { kind: 'lane' }>;
      if (bug.leapEvery > 0) {
        // A boss that moves rushes down the lane and stops at its end (a body's width short of it).
        const len = Math.hypot(s.bx - s.ax, s.by - s.ay);
        const back = Math.min(len, bug.radius + 0.1);
        const ex = s.bx - ((s.bx - s.ax) / (len || 1)) * back;
        const ey = s.by - ((s.by - s.ay) / (len || 1)) * back;
        if (host.canStand(ex, ey, bug.radius)) {
          me.x = ex;
          me.y = ey;
          me.z = host.groundZ(ex, ey);
        }
      }
      if (hit) {
        const { side } = segDist(b.x, b.y, s.ax, s.ay, s.bx, s.by);
        const len = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
        const nx = -(s.by - s.ay) / len;
        const ny = (s.bx - s.ax) / len;
        const sign = side !== 0 ? side : host.rng.chance(0.5) ? 1 : -1;
        host.hitBall(bug.damage, m.power.status, { vx: nx * sign * A.charge.knock, vy: ny * sign * A.charge.knock, vz: A.charge.hop });
      }
    } else if (m.attack === 'slam') {
      const s = m.shape as Extract<MarkShape, { kind: 'circles' }>;
      if (hit) host.hitBall(bug.damage, m.power.status, knockAway(s.pts[0]!.x, s.pts[0]!.y, b, A.slam.knock, A.slam.hop, host.rng));
    } else {
      // Colour attacks: 1 damage and the status, then the ground they leave.
      if (hit) host.hitBall(A.colourDamage, m.power.status, null);
      if (m.attack === 'fireball') addHazard(boss, host, 'scorch', m.shape);
      else if (m.attack === 'frost') addHazard(boss, host, 'ice', { kind: 'tiles', tiles: tilesIn(m.shape, host) });
      else if (m.attack === 'bolts' && m.shape.kind === 'tiles') addHazard(boss, host, 'cloud', { kind: 'tiles', tiles: [m.shape.tiles[0]!] });
      else if (m.attack === 'spores') {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i < A.spores.puddles; i++) {
          const p = randomFloorNear(host, me.x, me.y, A.spores.radius, (x, y) => Math.hypot(x - me.x, y - me.y) > bug.radius + A.spores.puddleRadius);
          if (p) pts.push(p);
        }
        if (pts.length) addHazard(boss, host, 'poison', { kind: 'circles', pts, r: A.spores.puddleRadius });
      }
    }
  }
  host.log({ kind: 'bossLand', mark: m.id, attack: m.attack, hit });
}

function summon(boss: BossState, host: BossHost, list: 'attacker' | 'carrier'): void {
  if (host.helpersAlive() >= helperCap(boss.spec)) return;
  const free = host.pads().filter((p) => p.free);
  if (!free.length) return;
  const pad = host.rng.pick(free);
  const ids = list === 'attacker' ? BOSS_SUMMONS.attackers : BOSS_SUMMONS.carriers;
  const uid = host.spawnHelper(host.rng.pick(ids), pad.x, pad.y, pickPower(boss, host.rng));
  if (uid) host.log({ kind: 'bossSummon', enemy: uid });
}

/** Check the phase (after a hit, and at the start of each boss turn). */
export function updatePhase(boss: BossState, host: BossHost): void {
  const p = phaseOf(host.body.health, boss.maxHealth);
  if (p !== boss.shownPhase) {
    boss.shownPhase = p;
    host.log({ kind: 'bossPhase', phase: p });
  }
}

/** One boss turn (sheet section 2.7). */
export function bossTurn(boss: BossState, host: BossHost): void {
  if (boss.defeated) return;
  const bug = bugOf(boss.spec);
  const b = host.ball();
  if (bug.facesBall) {
    const d = Math.hypot(b.x - host.body.x, b.y - host.body.y);
    if (d > 1e-6) {
      host.body.fx = (b.x - host.body.x) / d;
      host.body.fy = (b.y - host.body.y) / d;
    }
  }
  // 1. Land everything marked on an earlier turn.
  const due = boss.marks.filter((m) => m.made < boss.turn);
  boss.marks = boss.marks.filter((m) => m.made >= boss.turn);
  for (const m of due) landMark(boss, host, m);
  // 2. Pods that were not broken hatch.
  for (const p of boss.pods) {
    if (p.done || p.hatchTurn > boss.turn) continue;
    p.done = true;
    const uid = host.helpersAlive() < helperCap(boss.spec) ? host.spawnHelper(host.rng.pick(BOSS_SUMMONS.attackers), p.x, p.y, p.power) : null;
    host.log({ kind: 'podHatch', pod: p.id, enemy: uid });
  }
  boss.pods = boss.pods.filter((p) => !p.done);
  // 3. The phase pattern.
  const phase = phaseOf(host.body.health, boss.maxHealth);
  if (phase !== boss.phase) {
    boss.phase = phase;
    boss.phaseTurn = 0;
  }
  updatePhase(boss, host);
  let marked: 'skill' | 'colour' | null = null;
  const alternate = () => {
    const kind = boss.next;
    boss.next = kind === 'skill' ? 'colour' : 'skill';
    if (makeMark(boss, host, kind)) marked = kind;
  };
  if (phase === 1) {
    if (boss.phaseTurn % 2 === 0) alternate();
  } else if (phase === 2) {
    if (boss.phaseTurn % 2 === 0) {
      summon(boss, host, 'attacker');
      summon(boss, host, 'carrier');
    } else if (makeMark(boss, host, 'colour')) marked = 'colour';
  } else {
    alternate();
    const list = boss.nextHelper;
    boss.nextHelper = list === 'attacker' ? 'carrier' : 'attacker';
    summon(boss, host, list);
  }
  // Mantis: on every third boss turn a mark is made, it makes the other one too (phase 2: another colour mark).
  if (marked && bug.doubleMarkEvery > 0 && (boss.turn + 1) % bug.doubleMarkEvery === 0) {
    if (phase === 2) makeMark(boss, host, 'colour');
    else alternate();
  }
  // Grasshopper: every second boss turn, mark where it will land next turn.
  if (bug.leapEvery > 0 && boss.turn % bug.leapEvery === 0 && !boss.marks.some((m) => m.attack === 'leap')) makeLeapMark(boss, host);
  boss.turn++;
  boss.phaseTurn++;
}

/** At the end of each enemy turn: ground hazards wear off. */
export function wearHazards(boss: BossState, host: BossHost): void {
  for (const h of boss.hazards) h.turnsLeft--;
  for (const h of boss.hazards) if (h.turnsLeft <= 0 && h.kind === 'cloud') host.removeCloud(h.id);
  boss.hazards = boss.hazards.filter((h) => h.turnsLeft > 0);
}

/** The boss is defeated: its marks, pods and ground stop. Helpers left alive stay. */
export function bossDefeated(boss: BossState, host: BossHost): void {
  boss.defeated = true;
  boss.marks = [];
  boss.pods = [];
  for (const h of boss.hazards) if (h.kind === 'cloud') host.removeCloud(h.id);
  boss.hazards = [];
}

/** Ice tiles left by frost, for the ball physics. */
export function iceTiles(boss: BossState | null): string[] {
  if (!boss) return [];
  const out: string[] = [];
  for (const h of boss.hazards) if (h.kind === 'ice' && h.shape.kind === 'tiles') for (const t of h.shape.tiles) out.push(`${t.x},${t.y}`);
  return out;
}
