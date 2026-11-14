/**
 * Course rules (Milestone 3). Plain TypeScript, deterministic: the same course,
 * seed and shots always give the same result.
 *
 * This owns everything about playing one course that is not ball physics:
 * - the ball's stat sheet (from the character) and its shots and health pools,
 * - enemies, pickups and blockers on the course,
 * - the star quota meter, the exit opening, and winning or losing.
 *
 * Turn order (DESIGN.md section 8): aim, shot, rest check, enemy turn; when the
 * shots run out, a recover turn (enemies act once more) refills them.
 *
 * The display reads this state and drains `log` for messages and effects.
 */
import { CHARACTERS, DEFAULT_CHARACTER, type CharacterDef } from '../content/characters.ts';
import { OBJECTS, type BlockerDef, type EnemyDef, type PickupDef } from '../content/objects.ts';
import { RULES } from '../content/rules.ts';
import { SURFACES } from '../content/surfaces.ts';
import { STEPS_PER_SECOND, type Tuning } from '../content/tuning.ts';
import {
  ballAtTile,
  endShot,
  groundAt,
  predictPath,
  startShot,
  stepShot,
  type BallState,
  type ContactResult,
  type GuidePoint,
  type Obstacle,
  type ShotCommand,
  type ShotState,
  type ShotWorld,
  type StepInput,
} from './ball.ts';
import { tileAt, type Course } from './course.ts';
import { Rng, type Seed } from './rng.ts';
import { StatSheet } from './stats.ts';

export interface EnemyState {
  readonly uid: string;
  readonly def: EnemyDef;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly stats: StatSheet;
  health: number;
  defeated: boolean;
  /** Shot step of the last hit that counted, for the hit cooldown. */
  lastHitStep: number | null;
  lastHitShot: number;
}

export interface PickupState {
  readonly uid: string;
  readonly def: PickupDef;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  taken: boolean;
}

export interface BlockerState {
  readonly uid: string;
  readonly def: BlockerDef;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Things that happened, for the display to show. */
export type PlayEvent =
  | { kind: 'star'; x: number; y: number }
  | { kind: 'heart' }
  | { kind: 'shotOrb' }
  | { kind: 'hit'; enemy: string; damage: number }
  | { kind: 'defeat'; enemy: string; stars: number }
  | { kind: 'damage'; amount: number; cause: 'spikes' | 'sunk' | 'out' }
  | { kind: 'exitOpen' }
  | { kind: 'recover' }
  | { kind: 'enemyTurn' }
  | { kind: 'returned'; cause: 'sunk' | 'out' }
  | { kind: 'won' }
  | { kind: 'lost' };

export type PlayStatus = 'playing' | 'won' | 'lost';

export interface PlayState {
  readonly course: Course;
  readonly tuning: Tuning;
  readonly seed: string;
  readonly character: CharacterDef;
  readonly stats: StatSheet;
  health: number;
  shots: number;
  /** Yellow stars held (the wallet; spent in shops from Milestone 6). */
  wallet: number;
  /** Stars towards this course's quota. */
  meter: number;
  readonly quota: number;
  exitOpen: boolean;
  ball: BallState;
  /** Where the ball last came to rest on ground that can hold it. */
  restSpot: BallState;
  readonly enemies: EnemyState[];
  readonly pickups: PickupState[];
  readonly blockers: BlockerState[];
  status: PlayStatus;
  shot: ShotState | null;
  /** Shots taken on this course. */
  shotNumber: number;
  /** After taking damage, the ball cannot be damaged again for the rest of that shot. */
  damagedThisShot: boolean;
  readonly world: ShotWorld;
  readonly rng: Rng;
  log: PlayEvent[];
}

export interface PlayOptions {
  readonly seed: Seed;
  readonly character?: string;
}

function heightAtCentre(course: Course, x: number, y: number): number {
  return groundAt(course, x + 0.5, y + 0.5)?.h ?? 0;
}

export function createPlay(course: Course, tuning: Tuning, opts: PlayOptions): PlayState {
  const character = CHARACTERS.get(opts.character ?? DEFAULT_CHARACTER);
  if (!character) throw new Error(`Unknown character "${opts.character}".`);
  const stats = new StatSheet(character.stats);
  const enemies: EnemyState[] = [];
  const pickups: PickupState[] = [];
  const blockers: BlockerState[] = [];
  course.objects.forEach((o, i) => {
    const def = OBJECTS.get(o.id);
    const at = { x: o.x + 0.5, y: o.y + 0.5, z: heightAtCentre(course, o.x, o.y) };
    const uid = `${o.id}#${i}`;
    if (def?.kind === 'enemy') {
      const es = new StatSheet(def.stats);
      enemies.push({ uid, def, ...at, stats: es, health: es.get('health'), defeated: false, lastHitStep: null, lastHitShot: -1 });
    } else if (def?.kind === 'pickup') pickups.push({ uid, def, ...at, taken: false });
    else if (def?.kind === 'blocker') blockers.push({ uid, def, ...at });
  });
  const ball = ballAtTile(course, course.start.x, course.start.y);
  const play: PlayState = {
    course,
    tuning,
    seed: String(opts.seed),
    character,
    stats,
    health: stats.get('maxHealth'),
    shots: stats.get('maxShots'),
    wallet: 0,
    meter: 0,
    quota: course.quota,
    exitOpen: course.quota <= 0,
    ball,
    restSpot: { ...ball },
    enemies,
    pickups,
    blockers,
    status: 'playing',
    shot: null,
    shotNumber: 0,
    damagedThisShot: false,
    world: { obstacles: [] },
    rng: Rng.fromSeed(opts.seed).fork(`course:${course.name}`),
    log: [],
  };
  play.world.obstacles = obstaclesOf(play);
  play.world.contact = (o, s) => onContact(play, o, s);
  return play;
}

/** Everything solid on the course right now: blockers and enemies still standing. */
function obstaclesOf(play: PlayState): Obstacle[] {
  const out: Obstacle[] = [];
  for (const b of play.blockers) out.push({ id: b.uid, x: b.x, y: b.y, base: b.z, height: b.def.height, shape: b.def.shape, bounce: b.def.bounce });
  for (const e of play.enemies) {
    if (!e.defeated) out.push({ id: e.uid, x: e.x, y: e.y, base: e.z, height: e.def.height, shape: e.def.shape, bounce: e.def.bounce });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shots

export function canShoot(play: PlayState): boolean {
  return play.status === 'playing' && !play.shot && play.shots > 0;
}

/** Shot power and bounce boost from the stat sheet. */
function scales(play: PlayState) {
  return { power: play.stats.get('shotPower'), boost: play.stats.get('bounceBoost') };
}

export function takeShot(play: PlayState, cmd: ShotCommand): ShotState {
  if (!canShoot(play)) throw new Error('Cannot take a shot now.');
  play.shots--;
  play.shotNumber++;
  play.damagedThisShot = false;
  play.shot = startShot(play.tuning, play.ball, cmd, scales(play));
  return play.shot;
}

/** Advance the current shot one step (1/120 s) and apply the course rules. */
export function stepPlay(play: PlayState, input: StepInput = {}): void {
  const s = play.shot;
  if (!s || s.outcome) return;
  const before = s.events.length;
  stepShot(play.course, play.tuning, s, input, play.world);
  for (const e of s.events.slice(before)) {
    if (e.kind === 'hazard') damage(play, RULES.spikeDamage, 'spikes');
  }
  if (play.status !== 'playing') {
    play.shot = null;
    return;
  }
  collectPickups(play);
  checkExit(play, s);
  if (s.outcome) finishShot(play, s);
}

/** Run the current shot to its end. */
export function runShot(play: PlayState, inputs: readonly StepInput[] = []): void {
  while (play.shot && !play.shot.outcome) stepPlay(play, inputs[play.shot.step] ?? {});
}

/** The aim guide for the current state: same physics, same obstacles, no side effects. */
export function previewShot(play: PlayState, cmd: ShotCommand): GuidePoint[] {
  const hit = play.stats.get('hitDamage');
  const world: ShotWorld = {
    obstacles: play.world.obstacles,
    contact: (o) => {
      const e = play.enemies.find((en) => en.uid === o.id);
      return e && e.health <= hit ? 'pass' : 'bounce';
    },
  };
  return predictPath(play.course, play.tuning, play.ball, cmd, play.stats.get('guideLength'), world, scales(play));
}

// ---------------------------------------------------------------------------
// Contact, damage and pickups

function onContact(play: PlayState, o: Obstacle, s: ShotState): ContactResult {
  const e = play.enemies.find((en) => en.uid === o.id);
  if (!e || e.defeated) return e ? 'pass' : 'bounce';
  // The same enemy cannot be hit again within the cooldown (FEATURES.md section 2).
  const cooldown = Math.round(RULES.hitCooldown * STEPS_PER_SECOND);
  if (e.lastHitShot === play.shotNumber && e.lastHitStep !== null && s.step - e.lastHitStep < cooldown) return 'bounce';
  e.lastHitStep = s.step;
  e.lastHitShot = play.shotNumber;
  const dmg = hitDamage(play, e);
  e.health = Math.max(0, e.health - dmg);
  play.log.push({ kind: 'hit', enemy: e.uid, damage: dmg });
  if (e.health > 0) return 'bounce';
  e.defeated = true;
  play.world.obstacles = obstaclesOf(play);
  dropStars(play, e);
  play.log.push({ kind: 'defeat', enemy: e.uid, stars: e.def.starValue });
  return 'pass';
}

/**
 * Damage the ball deals to an enemy. FEATURES.md section 2 gives the full order
 * (hit damage after modifiers, then element, position, shield). Elements,
 * positions and shields arrive in Milestone 4; for now it is the hit damage stat.
 */
export function hitDamage(play: PlayState, enemy: EnemyState): number {
  void enemy; // used once elements, weak spots and shields exist
  return play.stats.get('hitDamage');
}

/** The ball takes damage, at most once per shot. */
function damage(play: PlayState, amount: number, cause: 'spikes' | 'sunk' | 'out'): void {
  if (play.damagedThisShot || amount <= 0 || play.status !== 'playing') return;
  play.damagedThisShot = true;
  play.health = Math.max(0, play.health - amount);
  play.log.push({ kind: 'damage', amount, cause });
  if (play.health <= 0) {
    play.status = 'lost';
    play.log.push({ kind: 'lost' });
  }
}

/** Defeated enemies scatter their stars a little way off, on ground that can hold the ball. */
function dropStars(play: PlayState, e: EnemyState): void {
  const star = OBJECTS.get('yellow-star') as PickupDef;
  for (let i = 0; i < e.def.starValue; i++) {
    let x = e.x;
    let y = e.y;
    for (let tries = 0; tries < 12; tries++) {
      const a = play.rng.float(0, Math.PI * 2);
      const d = play.rng.float(RULES.starDropMin, RULES.starDropMax);
      const cx = e.x + Math.cos(a) * d;
      const cy = e.y + Math.sin(a) * d;
      const t = tileAt(play.course, Math.floor(cx), Math.floor(cy));
      if (t && SURFACES.get(t.surface)?.canHoldBall) {
        x = cx;
        y = cy;
        break;
      }
    }
    const z = groundAt(play.course, x, y)?.h ?? e.z;
    play.pickups.push({ uid: `drop:${e.uid}:${i}`, def: star, x, y, z, taken: false });
  }
}

function collectPickups(play: PlayState): void {
  const b = play.shot?.ball ?? play.ball;
  const r = play.tuning.ballRadius;
  for (const p of play.pickups) {
    if (p.taken) continue;
    const reach = p.def.usesStarReach ? play.stats.get('starReach') : RULES.touchReach;
    if (Math.hypot(b.x - p.x, b.y - p.y, b.z + r - (p.z + r)) > reach) continue;
    if (p.def.effect === 'heart') {
      // Left on the ground when health is full, so it is not wasted.
      if (play.health >= play.stats.get('maxHealth')) continue;
      play.health++;
      play.log.push({ kind: 'heart' });
    } else if (p.def.effect === 'shotOrb') {
      if (play.shots >= play.stats.get('maxShots')) continue;
      play.shots++;
      play.log.push({ kind: 'shotOrb' });
    } else {
      play.wallet++;
      play.meter++;
      play.log.push({ kind: 'star', x: p.x, y: p.y });
      if (!play.exitOpen && play.meter >= play.quota) {
        play.exitOpen = true;
        play.log.push({ kind: 'exitOpen' });
      }
    }
    p.taken = true;
  }
}

/** An open exit catches a ball rolling slowly over the hole. */
function checkExit(play: PlayState, s: ShotState): void {
  if (!play.exitOpen || s.outcome) return;
  const b = s.ball;
  const ex = play.course.exit.x + 0.5;
  const ey = play.course.exit.y + 0.5;
  const g = groundAt(play.course, b.x, b.y);
  if (!g || b.z > g.h + 0.05) return;
  if (Math.hypot(b.x - ex, b.y - ey) > play.tuning.exitRadius) return;
  if (Math.hypot(b.vx, b.vy) > play.tuning.exitMaxSpeed) return;
  b.x = ex;
  b.y = ey;
  b.vx = 0;
  b.vy = 0;
  endShot(s, 'exit');
}

// ---------------------------------------------------------------------------
// End of a shot and the turns after it

function finishShot(play: PlayState, s: ShotState): void {
  const outcome = s.outcome;
  play.shot = null;
  if (outcome === 'exit') {
    play.ball = { ...s.ball, vx: 0, vy: 0, vz: 0, grounded: true };
    play.status = 'won';
    play.stats.endScope('course');
    play.log.push({ kind: 'won' });
    return;
  }
  if (outcome === 'sunk' || outcome === 'out') {
    // DESIGN.md section 6: costs 1 health and returns the ball to its last resting spot.
    damage(play, RULES.sinkDamage, outcome);
    play.ball = { ...play.restSpot };
    play.log.push({ kind: 'returned', cause: outcome });
  } else {
    const b = s.ball;
    const g = groundAt(play.course, b.x, b.y);
    play.ball = { x: b.x, y: b.y, z: g?.h ?? b.z, vx: 0, vy: 0, vz: 0, grounded: true };
    if (g && SURFACES.get(g.tile.surface)?.canHoldBall) play.restSpot = { ...play.ball };
  }
  if (play.status !== 'playing') return;

  // Rest check: sentinel rest triggers fire here (Milestone 4; the Mossback never acts).
  enemyTurn(play);
  play.stats.tickTurn();
  if (play.shots <= 0) {
    // Recover turn: enemies act once more, then the shots refill (DESIGN.md section 6, open question 3: all of them).
    enemyTurn(play);
    play.shots = play.stats.get('maxShots');
    play.log.push({ kind: 'recover' });
  }
}

/** Every activated sentinel takes one action. None can act yet (Milestone 4). */
function enemyTurn(play: PlayState): void {
  play.log.push({ kind: 'enemyTurn' });
}

/** Take the display's messages. */
export function drainLog(play: PlayState): PlayEvent[] {
  const out = play.log;
  play.log = [];
  return out;
}
