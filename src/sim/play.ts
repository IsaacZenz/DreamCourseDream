/**
 * Course rules (Milestones 3 and 4). Plain TypeScript, deterministic: the same
 * course, seed and inputs (at the same world-clock steps) always give the same
 * result.
 *
 * This owns everything about playing one course that is not ball physics:
 * the ball's stat sheet and its shots and health pools; enemies, obstacles,
 * pickups and flags; the star meter and the exit; abilities and statuses; and
 * the turn order.
 *
 * World clock (Milestone 4 design sheet, section 1.1): `tick` advances the
 * whole course by one fixed step of 1/120 s. The display calls it all the time,
 * also while the player aims, so patrollers, moving obstacles and drifting
 * clouds keep moving. Every moving thing's position comes from the clock and the
 * seed alone, so replaying the same shots at the same steps gives the same game.
 *
 * Turn order (DESIGN.md section 8): aim, shot (until the ball and anything it
 * set rolling have stopped), rest check, enemy turn (activated sentinels act one
 * after another); when the shots run out, a recover turn ("nap": enemies act
 * once more) refills them. Owner, 2026-11-15: two naps per course; running out
 * a third time fails the course. Each damaging hit on an enemy gives a shot back.
 *
 * The display reads this state and drains `log` for messages and effects.
 */
import { ABILITIES, ABILITY_IDS, type AbilityDef } from '../content/abilities.ts';
import { CHARACTERS, DEFAULT_CHARACTER, type CharacterDef } from '../content/characters.ts';
import {
  OBJECTS,
  type BlockerDef,
  type BreakableDef,
  type CloudDef,
  type EnemyDef,
  type FlagDef,
  type MoverDef,
  type ObjectShape,
  type PickupDef,
  RAIL,
} from '../content/objects.ts';
import { RULES } from '../content/rules.ts';
import { STATUSES } from '../content/statuses.ts';
import { DIRECTION_VECTORS, SURFACES, type Direction } from '../content/surfaces.ts';
import { STEPS_PER_SECOND, surfacePhysics, type Tuning } from '../content/tuning.ts';
import {
  DT,
  ballAtTile,
  endHover,
  endShot,
  groundAt,
  nearestOnShape,
  predictPath,
  setHeading,
  startBody,
  startShot,
  stepShot,
  type BallState,
  type ContactResult,
  type GuidePoint,
  type Obstacle,
  type ShotCommand,
  type ShotState,
  type ShotWorld,
} from './ball.ts';
import { railTileList, railTiles, tileAt, type Course, type CourseObject, type GridPoint } from './course.ts';
import { computeHit, isBehind } from './damage.ts';
import { Rng, type Seed } from './rng.ts';
import { StatSheet } from './stats.ts';

const steps = (seconds: number) => Math.round(seconds * STEPS_PER_SECOND);

// ---------------------------------------------------------------------------
// State

export interface StatusState {
  readonly id: string;
  turnsLeft: number;
}

/** A route walked there and back (patrollers, sliding blocks, drifting clouds). */
export interface PathRun {
  /** Points in grid coordinates (tile centres). */
  readonly pts: readonly { x: number; y: number }[];
  readonly total: number;
}

export interface EnemyState {
  readonly uid: string;
  readonly def: EnemyDef;
  readonly place: CourseObject;
  x: number;
  y: number;
  z: number;
  /** Unit vector of the way it faces, on the grid. */
  fx: number;
  fy: number;
  readonly stats: StatSheet;
  health: number;
  defeated: boolean;
  /** Acts on enemy turns from now on. */
  activated: boolean;
  statuses: StatusState[];
  /** World clock step of the last hit that counted, for the hit cooldown. */
  lastHitClock: number;
  /** Ball motion in which its shield was used. */
  shieldMotion: number;
  /** Shot in which its pass-by trigger fired (once per shot). */
  passByShot: number;
  insideInner: boolean;
  /** Rolling (Lunger, Mole): its own physics while it moves. */
  body: ShotState | null;
  bodySpiked: boolean;
  bodyZapped: string[];
  /** Patroller route and how far along it (there and back) it has gone. */
  path: PathRun | null;
  pathDist: number;
  vx: number;
  vy: number;
  /** Spitter: where its next seed will land. */
  lobTarget: { x: number; y: number } | null;
  /** Mole: underground under its hill. */
  burrowed: boolean;
  /** Mole: clock step at which it pops out (it was set off and is rumbling), or null. */
  popAt: number | null;
  /** Clock step it last launched, for the Mole's grace time. */
  launchedAt: number;
  surfacedShot: number;
  /** The tile it was last on, so a flag is lowered only when it enters that tile. */
  tileKey: string;
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

export interface MoverState {
  readonly uid: string;
  readonly def: MoverDef;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  readonly shape: ObjectShape;
  readonly path: PathRun | null;
  pathDist: number;
  /** Gates: open now, and seconds into the current open-then-closed cycle. */
  open: boolean;
  timer: number;
}

export interface BreakableState {
  readonly uid: string;
  readonly def: BreakableDef;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly tx: number;
  readonly ty: number;
  health: number;
  broken: boolean;
  readonly drops: readonly string[];
  lastHitClock: number;
}

export interface CloudState {
  readonly uid: string;
  readonly def: CloudDef;
  x: number;
  y: number;
  readonly path: PathRun | null;
  pathDist: number;
}

export interface FlagState {
  readonly uid: string;
  readonly def: FlagDef;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly tx: number;
  readonly ty: number;
  /** Up with its star showing. Lowered by an enemy passing over (owner, 2026-11-14). */
  raised: boolean;
  /** The ball bounces off it only once it has moved clear of it. */
  solid: boolean;
}

export interface SeedState {
  readonly uid: string;
  readonly spitter: string;
  readonly shot: ShotState;
}

export interface TornadoState {
  stepsLeft: number;
  heading: number;
  readonly speed: number;
  wanderIn: number;
}

/** Things that happened, for the display to show. */
export type PlayEvent =
  | { kind: 'star'; x: number; y: number }
  | { kind: 'heart' }
  | { kind: 'shotOrb' }
  | { kind: 'hit'; enemy: string; damage: number; blocked: boolean }
  | { kind: 'defeat'; enemy: string; stars: number }
  | { kind: 'damage'; amount: number; cause: 'spikes' | 'sunk' | 'out' | 'enemy' | 'seed' | 'zap' }
  | { kind: 'exitOpen' }
  | { kind: 'recover' }
  | { kind: 'enemyTurn' }
  | { kind: 'returned'; cause: 'sunk' | 'out' }
  | { kind: 'won' }
  | { kind: 'lost' }
  | { kind: 'trigger'; enemy: string; trigger: 'hit' | 'rest' | 'passBy' }
  | { kind: 'activated'; enemy: string }
  | { kind: 'lobMark'; enemy: string; x: number; y: number }
  | { kind: 'lob'; enemy: string }
  | { kind: 'launch'; enemy: string }
  | { kind: 'surface'; enemy: string }
  | { kind: 'burrow'; enemy: string }
  | { kind: 'rumble'; enemy: string }
  | { kind: 'stunned'; target: string }
  | { kind: 'skip'; enemy: string }
  | { kind: 'flagDown'; flag: string }
  | { kind: 'flagUp'; flag: string }
  | { kind: 'abilityGained'; ability: string; wild: boolean }
  | { kind: 'abilityUsed'; ability: string }
  | { kind: 'crateHit'; uid: string }
  | { kind: 'break'; uid: string; wild: boolean }
  | { kind: 'zap'; target: string }
  | { kind: 'knocked' }
  /** The ball came to rest in water and stays there (owner, 2026-11-15). */
  | { kind: 'underwater' }
  /** A damaging hit on an enemy: one shot back (owner, 2026-11-15). */
  | { kind: 'bonusShot' }
  /** Fell off the edge: the held ability is lost (owner, 2026-11-15). */
  | { kind: 'abilityLost'; ability: string };

export type PlayStatus = 'playing' | 'won' | 'lost';

/** aim: waiting for a shot. shot: the player's shot is under way. enemy: enemy turns are running. */
export type Phase = 'aim' | 'shot' | 'enemy';

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
  /** Once open, the exit stays open (owner, 2026-11-14). */
  exitOpen: boolean;
  /** Where the ball is when it is still. While it moves, see `shot.ball`. */
  ball: BallState;
  /** Where the ball last came to rest on ground that can hold it. */
  restSpot: BallState;
  readonly enemies: EnemyState[];
  readonly pickups: PickupState[];
  readonly blockers: BlockerState[];
  readonly movers: MoverState[];
  readonly breakables: BreakableState[];
  readonly clouds: CloudState[];
  readonly flags: FlagState[];
  seeds: SeedState[];
  status: PlayStatus;
  /** Why the course was lost: health ran out, or shots ran out with no naps left (owner, 2026-11-15). */
  lostBy: 'health' | 'shots' | null;
  /** Naps (recover turns) taken on this course (owner, 2026-11-15: two allowed). */
  napsUsed: number;
  phase: Phase;
  /** The ball's motion: the player's shot, or a knock while it was resting. */
  shot: ShotState | null;
  /** Counts every ball motion (shots and knocks), for once-per-shot rules. */
  motion: number;
  /** The ball is moving because something hit it, not because the player shot it. */
  knocked: boolean;
  /** Shots taken on this course. */
  shotNumber: number;
  /** World clock, in steps of 1/120 s. */
  clock: number;
  /** Owner, 2026-11-14: no damage to the ball until this clock step. */
  immuneUntil: number;
  /** The ability held (one slot), and whether it was used this shot. */
  ability: string | null;
  abilityUsed: boolean;
  tornado: TornadoState | null;
  ballStatuses: StatusState[];
  /** Clouds that already zapped the ball in this motion. */
  zapped: string[];
  /** Ball and rolling things touching right now, so each meeting counts once. */
  touching: string[];
  /** Enemy turns still to run, the one running, its actions left, and the wait before the next action. */
  turnQueue: ('normal' | 'recover')[];
  turn: 'normal' | 'recover' | null;
  turnActions: string[];
  actionWait: number;
  world: ShotWorld;
  /** Guard rail pieces, tile centre to tile centre (Milestone 5b). */
  readonly railPieces: readonly RailPiece[];
  readonly rng: Rng;
  log: PlayEvent[];
}

export interface PlayOptions {
  readonly seed: Seed;
  readonly character?: string;
}

/** What the player does during one step. */
export interface TickInput {
  /** Bounce boost key pressed this step. */
  readonly boost?: boolean;
  /** Ability key pressed this step. */
  readonly ability?: boolean;
  /** Tornado steering: -1 left, 1 right, 0 none. */
  readonly steer?: number;
}

// ---------------------------------------------------------------------------
// Paths

function makePath(points: readonly GridPoint[]): PathRun | null {
  if (points.length < 2) return null;
  const pts = points.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }));
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
  return total > 0 ? { pts, total } : null;
}

/** Where a there-and-back walk is after `dist`, and which way it is heading. */
export function pathAt(run: PathRun, dist: number): { x: number; y: number; dx: number; dy: number } {
  const cycle = run.total * 2;
  let d = ((dist % cycle) + cycle) % cycle;
  const back = d > run.total;
  if (back) d = cycle - d;
  for (let i = 1; i < run.pts.length; i++) {
    const a = run.pts[i - 1]!;
    const b = run.pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= len || i === run.pts.length - 1) {
      const t = len > 0 ? Math.min(1, d / len) : 0;
      const dx = ((b.x - a.x) / (len || 1)) * (back ? -1 : 1);
      const dy = ((b.y - a.y) / (len || 1)) * (back ? -1 : 1);
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, dx, dy };
    }
    d -= len;
  }
  const last = run.pts[run.pts.length - 1]!;
  return { x: last.x, y: last.y, dx: 0, dy: 0 };
}

// ---------------------------------------------------------------------------
// Setting up

/** One piece of guard rail, from one tile centre to the next along the rail. */
export interface RailPiece {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
  /** Ground height at its lower end, and the rise to its higher end, in tiles. */
  readonly base: number;
  readonly rise: number;
}

function railPiecesOf(course: Course): RailPiece[] {
  const out: RailPiece[] = [];
  course.rails.forEach((line, i) => {
    const tiles = railTileList(line);
    for (let k = 1; k < tiles.length; k++) {
      const a = tiles[k - 1]!;
      const b = tiles[k]!;
      const ha = heightAt(course, a.x + 0.5, a.y + 0.5);
      const hb = heightAt(course, b.x + 0.5, b.y + 0.5);
      out.push({ id: `rail:${i}:${k}`, x: a.x + 0.5, y: a.y + 0.5, dx: b.x - a.x, dy: b.y - a.y, base: Math.min(ha, hb), rise: Math.abs(ha - hb) });
    }
  });
  return out;
}

/** Tiles with a guard rail through them, cached per course. */
const railTileCache = new WeakMap<Course, Set<string>>();
export function railTileSet(course: Course): Set<string> {
  let s = railTileCache.get(course);
  if (!s) railTileCache.set(course, (s = railTiles(course.rails)));
  return s;
}

function heightAt(course: Course, x: number, y: number): number {
  return groundAt(course, x, y)?.h ?? 0;
}

const tileKeyOf = (x: number, y: number) => `${Math.floor(x)},${Math.floor(y)}`;

function facingVec(d: Direction): [number, number] {
  const [x, y] = DIRECTION_VECTORS[d];
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

export function createPlay(course: Course, tuning: Tuning, opts: PlayOptions): PlayState {
  const character = CHARACTERS.get(opts.character ?? DEFAULT_CHARACTER);
  if (!character) throw new Error(`Unknown character "${opts.character}".`);
  const stats = new StatSheet(character.stats);
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
    ball: ballAtTile(course, course.start.x, course.start.y),
    restSpot: ballAtTile(course, course.start.x, course.start.y),
    enemies: [],
    pickups: [],
    blockers: [],
    movers: [],
    breakables: [],
    clouds: [],
    flags: [],
    seeds: [],
    status: 'playing',
    lostBy: null,
    napsUsed: 0,
    phase: 'aim',
    shot: null,
    motion: 0,
    knocked: false,
    shotNumber: 0,
    clock: 0,
    immuneUntil: 0,
    ability: character.startingAbility,
    abilityUsed: false,
    tornado: null,
    ballStatuses: [],
    zapped: [],
    touching: [],
    turnQueue: [],
    turn: null,
    turnActions: [],
    actionWait: 0,
    world: { obstacles: [] },
    railPieces: railPiecesOf(course),
    rng: Rng.fromSeed(opts.seed).fork(`course:${course.name}`),
    log: [],
  };

  course.objects.forEach((o, i) => {
    const def = OBJECTS.get(o.id);
    const cx = o.x + 0.5;
    const cy = o.y + 0.5;
    const z = heightAt(course, cx, cy);
    const uid = `${o.id}#${i}`;
    if (!def) return;
    if (def.kind === 'enemy') {
      const es = new StatSheet(def.stats);
      const [fx, fy] = facingVec(o.facing);
      const path = def.behaviour.kind === 'patrol' ? makePath(o.path) : null;
      const e: EnemyState = {
        uid,
        def,
        place: o,
        x: cx,
        y: cy,
        z,
        fx,
        fy,
        stats: es,
        health: es.get('health'),
        defeated: false,
        activated: false,
        statuses: [],
        lastHitClock: -Infinity,
        shieldMotion: -1,
        passByShot: -1,
        insideInner: false,
        body: null,
        bodySpiked: false,
        bodyZapped: [],
        path,
        pathDist: path ? o.phase * path.total * 2 : 0,
        vx: 0,
        vy: 0,
        lobTarget: null,
        burrowed: def.behaviour.kind === 'burrow',
        popAt: null,
        launchedAt: -Infinity,
        surfacedShot: 0,
        tileKey: tileKeyOf(cx, cy),
      };
      if (path) placeOnPath(play, e);
      play.enemies.push(e);
    } else if (def.kind === 'pickup') play.pickups.push({ uid, def, x: cx, y: cy, z, taken: false });
    else if (def.kind === 'blocker') play.blockers.push({ uid, def, x: cx, y: cy, z });
    else if (def.kind === 'mover') {
      const shape: ObjectShape = def.shape.kind === 'box' && o.orient === 'y' ? { kind: 'box', hx: def.shape.hy, hy: def.shape.hx } : def.shape;
      const path = def.motion.kind === 'path' ? makePath(o.path) : null;
      const m: MoverState = { uid, def, x: cx, y: cy, z, vx: 0, vy: 0, shape, path, pathDist: path ? o.phase * path.total * 2 : 0, open: false, timer: 0 };
      if (def.motion.kind === 'gate') {
        const cycle = def.motion.open + def.motion.closed;
        m.timer = o.phase * cycle;
        m.open = m.timer < def.motion.open;
      }
      if (path) {
        const p = pathAt(path, m.pathDist);
        m.x = p.x;
        m.y = p.y;
        m.z = heightAt(course, p.x, p.y);
      }
      play.movers.push(m);
    } else if (def.kind === 'breakable') {
      play.breakables.push({ uid, def, x: cx, y: cy, z, tx: o.x, ty: o.y, health: def.health, broken: false, drops: o.drops ?? def.drops, lastHitClock: -Infinity });
    } else if (def.kind === 'cloud') {
      const path = makePath(o.path);
      const c: CloudState = { uid, def, x: cx, y: cy, path, pathDist: path ? o.phase * path.total * 2 : 0 };
      if (path) {
        const p = pathAt(path, c.pathDist);
        c.x = p.x;
        c.y = p.y;
      }
      play.clouds.push(c);
    }
  });
  play.world.obstacles = obstaclesOf(play);
  play.world.contact = (o, s) => onBallContact(play, o, s);
  return play;
}

function placeOnPath(play: PlayState, e: EnemyState): void {
  if (!e.path) return;
  const p = pathAt(e.path, e.pathDist);
  e.x = p.x;
  e.y = p.y;
  e.z = heightAt(play.course, p.x, p.y);
  if (p.dx || p.dy) {
    e.fx = p.dx;
    e.fy = p.dy;
  }
}

// ---------------------------------------------------------------------------
// Looking things up

const FLAG_DEF = OBJECTS.get('flag-pole') as FlagDef;

function enemyByUid(play: PlayState, uid: string): EnemyState | undefined {
  return play.enemies.find((e) => e.uid === uid);
}

/** Where the ball is now, moving or not. */
export function ballNow(play: PlayState): BallState {
  return play.shot?.ball ?? play.ball;
}

function hasStatus(list: readonly StatusState[], id: string): boolean {
  return list.some((s) => s.id === id);
}

/** An enemy standing still on the course (not rolling, not underground, not defeated). */
function standing(e: EnemyState): boolean {
  return !e.defeated && !e.body && !e.burrowed;
}

/**
 * Obstacles that never move or change: blockers and guard rails. Built once
 * per course (and again only if the rail tuning numbers change), because the
 * obstacle list is rebuilt every step.
 */
const staticCache = new WeakMap<Course, { bounce: number; boost: number; list: Obstacle[] }>();
function staticObstacles(play: PlayState): Obstacle[] {
  const c = staticCache.get(play.course);
  if (c && c.bounce === play.tuning.railBounce && c.boost === play.tuning.railBoost) return c.list;
  const list: Obstacle[] = [];
  for (const b of play.blockers) list.push({ id: b.uid, x: b.x, y: b.y, base: b.z, height: b.def.height, shape: b.def.shape, bounce: b.def.bounce });
  for (const p of play.railPieces) {
    list.push({
      id: p.id,
      x: p.x,
      y: p.y,
      base: p.base,
      height: RAIL.height + p.rise,
      shape: { kind: 'seg', ax: 0, ay: 0, bx: p.dx, by: p.dy, r: RAIL.halfThickness },
      bounce: play.tuning.railBounce,
      boost: play.tuning.railBoost,
    });
  }
  staticCache.set(play.course, { bounce: play.tuning.railBounce, boost: play.tuning.railBoost, list });
  return list;
}

/** Everything solid on the course right now. */
function obstaclesOf(play: PlayState): Obstacle[] {
  const out: Obstacle[] = staticObstacles(play).slice();
  for (const m of play.movers) {
    if (m.def.motion.kind === 'gate' && m.open) continue;
    out.push({ id: m.uid, x: m.x, y: m.y, base: m.z, height: m.def.height, shape: m.shape, bounce: m.def.bounce, vx: m.vx, vy: m.vy, knock: m.def.knock });
  }
  for (const b of play.breakables) {
    if (!b.broken && b.def.shape) out.push({ id: b.uid, x: b.x, y: b.y, base: b.z, height: b.def.height, shape: b.def.shape, bounce: b.def.bounce });
  }
  for (const e of play.enemies) {
    if (!standing(e)) continue;
    const knock = e.def.behaviour.kind === 'patrol' ? e.def.behaviour.knock : 0;
    out.push({ id: e.uid, x: e.x, y: e.y, base: e.z, height: e.def.height, shape: e.def.shape, bounce: e.def.bounce, vx: e.vx, vy: e.vy, knock });
  }
  for (const f of play.flags) {
    if (f.raised && f.solid) out.push({ id: f.uid, x: f.x, y: f.y, base: f.z, height: f.def.height, shape: f.def.shape, bounce: f.def.bounce });
  }
  return out;
}

/** Obstacles for a rolling enemy or a seed: everything but itself and flag poles; moving things knock it. */
function bodyWorld(play: PlayState, self: string): ShotWorld {
  const obstacles = play.world.obstacles.filter((o) => o.id !== self && !o.id.startsWith('flag:'));
  return { obstacles, contact: (o) => ((o.knock ?? 0) > 0 ? 'knock' : 'bounce') };
}

// ---------------------------------------------------------------------------
// Shots

/** The ball is still and nothing it set off is still rolling. */
function settled(play: PlayState): boolean {
  return !play.shot && play.seeds.length === 0 && play.enemies.every((e) => !e.body && e.popAt === null);
}

export function canShoot(play: PlayState): boolean {
  return play.status === 'playing' && play.phase === 'aim' && settled(play) && play.shots > 0;
}

/** Shot power and bounce boost from the stat sheet. */
function scales(play: PlayState) {
  return { power: play.stats.get('shotPower') * (inWater(play) ? play.tuning.waterShotPower : 1), boost: play.stats.get('bounceBoost') };
}

/** The resting ball is in water: its next shot is weaker (owner, 2026-11-15). */
export function inWater(play: PlayState): boolean {
  const g = groundAt(play.course, play.ball.x, play.ball.y);
  return !!g && !!SURFACES.get(g.tile.surface)?.sinks;
}

function newMotion(play: PlayState, s: ShotState): void {
  play.shot = s;
  play.motion++;
  play.zapped = [];
}

export function takeShot(play: PlayState, cmd: ShotCommand): ShotState {
  if (!canShoot(play)) throw new Error('Cannot take a shot now.');
  play.shots--;
  play.shotNumber++;
  play.abilityUsed = false;
  play.phase = 'shot';
  newMotion(play, startShot(play.tuning, play.ball, cmd, scales(play)));
  play.knocked = false;
  return play.shot!;
}

/** A resting ball starts moving because something hit it (not a shot; costs nothing). */
function ensureBallMoving(play: PlayState): ShotState {
  if (play.shot) return play.shot;
  newMotion(play, startBody(play.tuning, play.ball, { vx: 0, vy: 0, vz: 0 }));
  play.knocked = true;
  play.log.push({ kind: 'knocked' });
  return play.shot!;
}

/**
 * Advance the whole course by one step (1/120 s). Call it all the time: while
 * the player aims, during shots and during enemy turns.
 */
export function tick(play: PlayState, input: TickInput = {}): void {
  if (play.status !== 'playing') return;
  play.clock++;
  moveThings(play);
  popMoles(play);
  play.world.obstacles = obstaclesOf(play);
  knockRestingBall(play);
  if (play.shot) stepBall(play, input);
  if (play.status !== 'playing') return;
  stepBodies(play);
  meetBodies(play);
  zapClouds(play);
  passByTriggers(play);
  updateFlags(play);
  collectPickups(play);
  if (play.shot?.outcome) finishBallMotion(play);
  if (play.status !== 'playing') return;
  advance(play);
}

/** The old name: advance one step. */
export const stepPlay = tick;

/** Run until the current shot, everything it set off and the enemy turns after it are over. */
export function runShot(play: PlayState, inputs: readonly TickInput[] = []): void {
  let guard = 0;
  while (play.status === 'playing' && !(play.phase === 'aim' && settled(play)) && guard++ < 200_000) {
    tick(play, play.shot && play.phase === 'shot' ? (inputs[play.shot.step] ?? {}) : {});
  }
}

/**
 * An independent copy of the whole course state, so a shot can be tried
 * without changing the real game (the course generator's bot, Milestone 5).
 * Definitions, the course and the tuning are shared; everything that changes
 * during play is copied.
 */
export function clonePlay(play: PlayState): PlayState {
  const shared = new Set<unknown>([play.course, play.tuning, play.character, ...play.course.objects, ...OBJECTS.values(), ...ABILITIES.values(), ...STATUSES.values()]);
  const memo = new Map<unknown, unknown>();
  const copy = (v: unknown): unknown => {
    if (typeof v !== 'object' || v === null || shared.has(v)) return v;
    const seen = memo.get(v);
    if (seen !== undefined) return seen;
    if (v instanceof Rng) return Rng.fromState(v.getState());
    if (v instanceof StatSheet) return v.clone();
    if (Array.isArray(v)) {
      const out: unknown[] = [];
      memo.set(v, out);
      for (const x of v) out.push(copy(x));
      return out;
    }
    const out: Record<string, unknown> = {};
    memo.set(v, out);
    for (const [k, x] of Object.entries(v)) out[k] = typeof x === 'function' ? x : copy(x);
    return out;
  };
  const out = copy(play) as PlayState;
  out.world.contact = (o, s) => onBallContact(out, o, s);
  return out;
}

/** Let the world run for a number of steps (tests and tools). */
export function wait(play: PlayState, n: number): void {
  for (let i = 0; i < n && play.status === 'playing'; i++) tick(play);
}

// ---------------------------------------------------------------------------
// Moving things: patrollers, sliding blocks, gates, drifting clouds

function moveThings(play: PlayState): void {
  for (const e of play.enemies) {
    if (e.defeated || !e.path || e.def.behaviour.kind !== 'patrol') continue;
    const px = e.x;
    const py = e.y;
    if (!hasStatus(e.statuses, 'stunned')) e.pathDist += e.def.behaviour.speed * DT;
    placeOnPath(play, e);
    e.vx = (e.x - px) / DT;
    e.vy = (e.y - py) / DT;
  }
  for (const m of play.movers) {
    if (m.def.motion.kind === 'path' && m.path) {
      const px = m.x;
      const py = m.y;
      m.pathDist += m.def.motion.speed * DT;
      const p = pathAt(m.path, m.pathDist);
      m.x = p.x;
      m.y = p.y;
      m.z = heightAt(play.course, p.x, p.y);
      m.vx = (m.x - px) / DT;
      m.vy = (m.y - py) / DT;
    } else if (m.def.motion.kind === 'gate') {
      const { open, closed } = m.def.motion;
      m.timer += DT;
      if (m.open && m.timer >= open) {
        // A gate never closes on the ball (or a rolling thing): it waits until the tile is clear.
        if (somethingIn(play, m)) m.timer = open;
        else m.open = false;
      } else if (!m.open && m.timer >= open + closed) {
        m.open = true;
        m.timer -= open + closed;
      }
    }
  }
  for (const c of play.clouds) {
    if (!c.path) continue;
    c.pathDist += c.def.driftSpeed * DT;
    const p = pathAt(c.path, c.pathDist);
    c.x = p.x;
    c.y = p.y;
  }
}

function overlaps(shape: ObjectShape, ox: number, oy: number, x: number, y: number, r: number): boolean {
  const n = nearestOnShape(shape, ox, oy, x, y);
  return Math.hypot(x - n.cx, y - n.cy) < r + n.thick;
}

function somethingIn(play: PlayState, m: MoverState): boolean {
  const b = ballNow(play);
  if (overlaps(m.shape, m.x, m.y, b.x, b.y, play.tuning.ballRadius + 0.02)) return true;
  for (const e of play.enemies) if (e.body && overlaps(m.shape, m.x, m.y, e.x, e.y, e.body.radius + 0.02)) return true;
  return false;
}

/** A patroller or sliding block running into the resting ball sets it moving; the physics then knocks it. */
function knockRestingBall(play: PlayState): void {
  if (play.shot) return;
  const b = play.ball;
  const r = play.tuning.ballRadius;
  for (const o of play.world.obstacles) {
    if (!(o.knock && (o.vx || o.vy))) continue;
    if (b.z >= o.base + o.height || b.z + 2 * r <= o.base) continue;
    if (overlaps(o.shape, o.x, o.y, b.x, b.y, r)) {
      ensureBallMoving(play);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// The ball

function stepBall(play: PlayState, input: TickInput): void {
  const s = play.shot!;
  if (input.ability) useAbility(play);
  const tor = play.tornado;
  if (tor && s.hover) {
    const fx = ABILITIES.get('tornado')!.effect;
    if (fx.kind === 'tornado') {
      if (--tor.wanderIn <= 0) {
        tor.wanderIn = steps(fx.wanderEvery);
        tor.heading += (play.rng.float(-fx.wanderMax, fx.wanderMax) * Math.PI) / 180;
      }
      tor.heading += ((input.steer ?? 0) * fx.steerRate * Math.PI * DT) / 180;
    }
    setHeading(s, tor.heading, tor.speed);
  }
  const before = s.events.length;
  stepShot(play.course, play.tuning, s, input.boost ? { boost: true } : {}, play.world);
  for (const e of s.events.slice(before)) {
    if (e.kind === 'hazard') damageBall(play, RULES.spikeDamage, 'spikes');
    else if (e.kind === 'anchorStop') anchorEffects(play, e.x, e.y);
  }
  if (play.status !== 'playing') return;
  if (tor && s.hover) {
    if (Math.hypot(s.ball.vx, s.ball.vy) > 1e-6) tor.heading = Math.atan2(s.ball.vy, s.ball.vx);
    if (--tor.stepsLeft <= 0) {
      const fx = ABILITIES.get('tornado')!.effect;
      endHover(play.course, s, fx.kind === 'tornado' ? fx.endKeep : 0.5);
      play.tornado = null;
    }
  }
  checkExit(play, s);
}

/** The ball's motion ended: rest, sink, fall out, or drop into the exit. */
function finishBallMotion(play: PlayState): void {
  const s = play.shot!;
  const outcome = s.outcome;
  play.shot = null;
  play.tornado = null;
  if (outcome === 'exit') {
    play.ball = { ...s.ball, vx: 0, vy: 0, vz: 0, grounded: true };
    play.status = 'won';
    play.stats.endScope('course');
    play.log.push({ kind: 'won' });
    return;
  }
  if (outcome === 'out') {
    // DESIGN.md section 6: costs 1 health and returns the ball to its last resting spot.
    damageBall(play, RULES.sinkDamage, outcome);
    // Owner, 2026-11-15: falling off the edge also loses the ability you hold.
    if (play.ability) {
      play.log.push({ kind: 'abilityLost', ability: play.ability });
      play.ability = null;
    }
    play.ball = { ...play.restSpot };
    play.log.push({ kind: 'returned', cause: outcome });
  } else if (outcome === 'sunk') {
    // Owner, 2026-11-15: a ball that stops in water stays there, under the water, and takes 1 damage.
    const b = s.ball;
    const g = groundAt(play.course, b.x, b.y);
    play.ball = { x: b.x, y: b.y, z: g?.h ?? b.z, vx: 0, vy: 0, vz: 0, grounded: true };
    damageBall(play, RULES.sinkDamage, 'sunk');
    play.log.push({ kind: 'underwater' });
  } else {
    const b = s.ball;
    const g = groundAt(play.course, b.x, b.y);
    play.ball = { x: b.x, y: b.y, z: g?.h ?? b.z, vx: 0, vy: 0, vz: 0, grounded: true };
    if (g && SURFACES.get(g.tile.surface)?.canHoldBall) play.restSpot = { ...play.ball };
  }
}

/** An open exit catches a ball rolling slowly over the hole. */
function checkExit(play: PlayState, s: ShotState): void {
  if (!play.exitOpen || s.outcome || s.hover) return;
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

/** Shots back for a damaging hit, never above the shot allowance. */
function gainShots(play: PlayState, n: number): void {
  const before = play.shots;
  play.shots = Math.min(play.stats.get('maxShots'), play.shots + n);
  if (play.shots > before) play.log.push({ kind: 'bonusShot' });
}

/** The ball takes damage. Owner, 2026-11-14: then it is immune for half a second. */
function damageBall(play: PlayState, amount: number, cause: Extract<PlayEvent, { kind: 'damage' }>['cause']): void {
  if (amount <= 0 || play.status !== 'playing' || play.clock < play.immuneUntil) return;
  play.immuneUntil = play.clock + steps(RULES.damageImmunity);
  play.health = Math.max(0, play.health - amount);
  play.log.push({ kind: 'damage', amount, cause });
  if (play.health <= 0) {
    play.status = 'lost';
    play.lostBy = 'health';
    play.shot = null;
    play.log.push({ kind: 'lost' });
  }
}

/** The ball is in its half second of immunity. */
export function isImmune(play: PlayState): boolean {
  return play.clock < play.immuneUntil;
}

// ---------------------------------------------------------------------------
// Contact: the ball touching things

function onBallContact(play: PlayState, o: Obstacle, s: ShotState): ContactResult {
  const burning = s.burnSteps > 0;
  if (o.id.startsWith('flag:')) {
    if (burning) return 'passFree';
    return Math.hypot(s.ball.vx, s.ball.vy) >= play.tuning.poleThroughSpeed ? 'passPole' : 'bounce';
  }
  const e = enemyByUid(play, o.id);
  if (e) return hitEnemy(play, e, s);
  const b = play.breakables.find((x) => x.uid === o.id);
  if (b) return hitBreakable(play, b, s);
  return (o.knock ?? 0) > 0 ? 'knock' : 'bounce';
}

/** The hit's own damage and element: the Tornado deals its own number; Burner hits are fire. */
function hitStats(play: PlayState, s: ShotState): { base: number; element: AbilityDef['element'] } {
  if (s.hover) {
    const fx = ABILITIES.get('tornado')!.effect;
    return { base: fx.kind === 'tornado' ? fx.damage : 1, element: null };
  }
  const burning = s.burnSteps > 0;
  return { base: play.stats.get('hitDamage'), element: burning ? (ABILITIES.get('burner')?.element ?? null) : null };
}

/** The ball hits an enemy (FEATURES.md section 2). Returns what the ball does next. */
function hitEnemy(play: PlayState, e: EnemyState, s: ShotState): ContactResult {
  if (e.defeated) return 'pass';
  // Owner, 2026-11-14: the ball only damages an enemy during the player's own action (a shot).
  // A ball that was knocked while standing still does no damage and sets off no hit trigger.
  const counted = !play.knocked && play.clock - e.lastHitClock >= steps(RULES.hitCooldown);
  if (counted) {
    e.lastHitClock = play.clock;
    const { base, element } = hitStats(play, s);
    const res = computeHit(
      {
        base,
        element,
        fromAbove: !s.ball.grounded,
        fromBehind: isBehind(s.ball.x, s.ball.y, e.x, e.y, e.fx, e.fy),
      },
      { weakTo: e.def.weakTo, resists: e.def.resists, weakSpots: e.def.weakSpots, guardedSides: e.def.guardedSides, shieldUp: e.def.shield && e.shieldMotion !== play.motion },
    );
    if (res.shieldUsed) e.shieldMotion = play.motion;
    e.health = Math.max(0, e.health - res.damage);
    play.log.push({ kind: 'hit', enemy: e.uid, damage: res.damage, blocked: res.blocked });
    // Owner, 2026-11-15: every hit that does damage gives a shot back, up to the shot allowance.
    if (res.damage > 0) gainShots(play, RULES.shotsPerHit);
    if (e.health <= 0) defeat(play, e);
    else respond(play, e, 'hit');
  }
  if (e.defeated) {
    const burn = ABILITIES.get('burner')!.effect;
    const passTier = burn.kind === 'burn' ? burn.passTier : 1;
    return s.burnSteps > 0 && e.def.tier <= passTier ? 'passFree' : 'pass';
  }
  if (e.def.contact === 'survives') {
    damageBall(play, e.stats.get('attackDamage'), 'enemy');
    return e.def.behaviour.kind === 'patrol' ? 'knock' : 'bounce';
  }
  return 'bounce';
}

function hitBreakable(play: PlayState, b: BreakableState, s: ShotState): ContactResult {
  if (b.broken) return 'pass';
  if (b.def.breakBy !== 'hit') return 'bounce';
  if (play.clock - b.lastHitClock >= steps(RULES.hitCooldown)) {
    b.lastHitClock = play.clock;
    const { base, element } = hitStats(play, s);
    const res = computeHit({ base, element, fromAbove: false, fromBehind: false }, { weakTo: [], resists: [], weakSpots: [], guardedSides: [], shieldUp: false });
    b.health = Math.max(0, b.health - res.damage);
    if (b.health <= 0) breakIt(play, b);
    else play.log.push({ kind: 'crateHit', uid: b.uid });
  }
  return b.broken ? 'pass' : 'bounce';
}

function breakIt(play: PlayState, b: BreakableState): void {
  b.broken = true;
  for (const id of b.drops) dropPickup(play, id, b.x, b.y, `${b.uid}:${id}`);
  const wild = b.def.wildChance > 0 && play.rng.chance(b.def.wildChance * play.stats.get('dropLuck'));
  if (wild) dropPickup(play, 'wild', b.x, b.y, `${b.uid}:wild`);
  play.log.push({ kind: 'break', uid: b.uid, wild });
  play.world.obstacles = obstaclesOf(play);
}

/** Dropped pickups land a little way off, on ground that can hold the ball. */
function dropPickup(play: PlayState, id: string, fromX: number, fromY: number, key: string): void {
  const def = OBJECTS.get(id);
  if (def?.kind !== 'pickup') return;
  let x = fromX;
  let y = fromY;
  for (let tries = 0; tries < 12; tries++) {
    const a = play.rng.float(0, Math.PI * 2);
    const d = play.rng.float(RULES.starDropMin, RULES.starDropMax);
    const cx = fromX + Math.cos(a) * d;
    const cy = fromY + Math.sin(a) * d;
    const t = tileAt(play.course, Math.floor(cx), Math.floor(cy));
    if (t && SURFACES.get(t.surface)?.canHoldBall) {
      x = cx;
      y = cy;
      break;
    }
  }
  const n = play.pickups.filter((p) => p.uid.startsWith(`drop:${key}`)).length;
  play.pickups.push({ uid: `drop:${key}:${n}`, def, x, y, z: heightAt(play.course, x, y), taken: false });
}

/**
 * An enemy is defeated (owner, 2026-11-14): its star counts at once, a flag
 * pole goes up where it stood with the star shown above it, and an ability
 * carrier gives its ability.
 */
function defeat(play: PlayState, e: EnemyState): void {
  e.defeated = true;
  e.body = null;
  e.activated = false;
  e.lobTarget = null;
  play.log.push({ kind: 'defeat', enemy: e.uid, stars: e.def.starValue });
  addStars(play, e.def.starValue, e.x, e.y);
  play.flags.push({
    uid: `flag:${e.uid}`,
    def: FLAG_DEF,
    x: e.x,
    y: e.y,
    z: heightAt(play.course, e.x, e.y),
    tx: Math.floor(e.x),
    ty: Math.floor(e.y),
    raised: true,
    solid: false,
  });
  if (e.def.grantsAbility) giveAbility(play, e.def.grantsAbility, false);
  play.world.obstacles = obstaclesOf(play);
}

function addStars(play: PlayState, n: number, x: number, y: number): void {
  for (let i = 0; i < n; i++) {
    play.wallet++;
    play.meter++;
    play.log.push({ kind: 'star', x, y });
  }
  if (!play.exitOpen && play.meter >= play.quota) {
    play.exitOpen = true;
    play.log.push({ kind: 'exitOpen' });
  }
}

/** An enemy (spikes) or a rolling ball takes damage outside a normal hit. */
function hurtEnemy(play: PlayState, e: EnemyState, amount: number): void {
  if (e.defeated || amount <= 0) return;
  e.health = Math.max(0, e.health - amount);
  play.log.push({ kind: 'hit', enemy: e.uid, damage: amount, blocked: false });
  if (e.health <= 0) defeat(play, e);
}

// ---------------------------------------------------------------------------
// Triggers and enemy actions (DESIGN.md section 8)

function respond(play: PlayState, e: EnemyState, trigger: 'hit' | 'rest' | 'passBy'): void {
  const r = e.def.triggers[trigger];
  if (r === 'none' || e.defeated) return;
  play.log.push({ kind: 'trigger', enemy: e.uid, trigger });
  const acts = e.def.behaviour.kind === 'lob' || e.def.behaviour.kind === 'launch';
  if (r === 'immediate') act(play, e, true);
  if ((r === 'activated' || r === 'immediate') && acts && !e.activated) {
    e.activated = true;
    play.log.push({ kind: 'activated', enemy: e.uid });
  }
}

/** One action. `now` means an immediate response mid-shot rather than an enemy turn. */
function act(play: PlayState, e: EnemyState, now: boolean): void {
  const bh = e.def.behaviour;
  if (bh.kind === 'lob') {
    if (e.lobTarget) fireSeed(play, e, e.lobTarget);
    const b = ballNow(play);
    if (Math.hypot(b.x - e.x, b.y - e.y) <= bh.range) {
      e.lobTarget = { x: b.x, y: b.y };
      play.log.push({ kind: 'lobMark', enemy: e.uid, x: b.x, y: b.y });
    } else e.lobTarget = null;
  } else if (bh.kind === 'launch') {
    const b = ballNow(play);
    const dx = b.x - e.x;
    const dy = b.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) return;
    const speed = Math.min(bh.maxSpeed, rollSpeedFor(play.tuning, d));
    e.fx = dx / d;
    e.fy = dy / d;
    launchEnemy(play, e, (dx / d) * speed, (dy / d) * speed);
    play.log.push({ kind: 'launch', enemy: e.uid });
  } else if (bh.kind === 'burrow') {
    // Owner, 2026-11-14: it waits a moment (the hill rumbles), then shoots up out of the ground.
    if (!e.burrowed || e.popAt !== null) return;
    e.popAt = play.clock + steps(bh.delay);
    play.log.push({ kind: 'rumble', enemy: e.uid });
  }
  void now;
}

/** Moles whose wait is over shoot out of the ground: up in the air and off in a random direction. */
function popMoles(play: PlayState): void {
  for (const e of play.enemies) {
    const bh = e.def.behaviour;
    if (bh.kind !== 'burrow' || e.popAt === null || play.clock < e.popAt || e.defeated) continue;
    e.popAt = null;
    const a = play.rng.float(0, Math.PI * 2);
    e.burrowed = false;
    e.surfacedShot = play.shotNumber;
    e.tileKey = '';
    launchEnemy(play, e, Math.cos(a) * bh.launchSpeed, Math.sin(a) * bh.launchSpeed, bh.launchUp);
    play.log.push({ kind: 'surface', enemy: e.uid });
  }
}

function enemyRadius(e: EnemyState): number {
  const sh = e.def.shape;
  return sh.kind === 'round' ? sh.r : sh.kind === 'box' ? Math.max(sh.hx, sh.hy) : sh.r;
}

function launchEnemy(play: PlayState, e: EnemyState, vx: number, vy: number, vz = 0): void {
  const from: BallState = { x: e.x, y: e.y, z: e.z, vx: 0, vy: 0, vz: 0, grounded: true };
  e.body = startBody(play.tuning, from, { vx, vy, vz }, { radius: enemyRadius(e), edgeWalls: true, waterWalls: true });
  e.launchedAt = play.clock;
  e.bodySpiked = false;
  e.bodyZapped = [];
  play.world.obstacles = obstaclesOf(play);
}

/**
 * The launch speed that rolls a ball `d` tiles on flat grass, worked out with
 * the same friction and drag as the physics.
 */
export function rollSpeedFor(t: Tuning, d: number): number {
  const fr = surfacePhysics(t, 'grass').friction * t.gravity;
  const dist = (v0: number) => {
    let v = v0;
    let x = 0;
    for (let i = 0; i < 4000 && v > 0; i++) {
      v *= 1 - t.drag * DT;
      v -= fr * DT;
      if (v > 0) x += v * DT;
    }
    return x;
  };
  let lo = 0;
  let hi = 40;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (dist(mid) < d) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** A lofted launch speed whose first landing is `d` tiles away on flat ground, from `h` tiles up. */
export function lobSpeedFor(t: Tuning, d: number, angleDeg: number, h: number): number {
  const a = (angleDeg * Math.PI) / 180;
  const range = (v0: number) => {
    let vx = v0 * Math.cos(a);
    let vz = v0 * Math.sin(a);
    let x = 0;
    let z = h;
    for (let i = 0; i < 4000; i++) {
      vz -= t.gravity * DT;
      const k = Math.max(0, 1 - t.drag * DT);
      vx *= k;
      vz *= k;
      x += vx * DT;
      z += vz * DT;
      if (z <= 0) return x;
    }
    return x;
  };
  let lo = 0;
  let hi = 40;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (range(mid) < d) lo = mid;
    else hi = mid;
  }
  return hi;
}

function fireSeed(play: PlayState, e: EnemyState, target: { x: number; y: number }): void {
  const bh = e.def.behaviour;
  if (bh.kind !== 'lob') return;
  const dx = target.x - e.x;
  const dy = target.y - e.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-6 ? dx / d : e.fx;
  const uy = d > 1e-6 ? dy / d : e.fy;
  const startZ = e.z + RULES.seedLaunchHeight;
  const targetZ = heightAt(play.course, target.x, target.y);
  const v = lobSpeedFor(play.tuning, d, bh.loftAngle, Math.max(0, startZ - targetZ));
  const a = (bh.loftAngle * Math.PI) / 180;
  const from: BallState = { x: e.x, y: e.y, z: startZ, vx: 0, vy: 0, vz: 0, grounded: false };
  const shot = startBody(play.tuning, from, { vx: ux * v * Math.cos(a), vy: uy * v * Math.cos(a), vz: v * Math.sin(a) }, { radius: bh.seedRadius });
  const n = play.seeds.length + play.clock;
  play.seeds.push({ uid: `seed:${e.uid}:${n}`, spitter: e.uid, shot });
  e.fx = ux;
  e.fy = uy;
  play.log.push({ kind: 'lob', enemy: e.uid });
}

/** Lungers, Moles and seeds roll with their own physics. */
function stepBodies(play: PlayState): void {
  const maxSteps = steps(RULES.bodyMaxTime);
  for (const e of play.enemies) {
    const body = e.body;
    if (!body) continue;
    const before = body.events.length;
    stepShot(play.course, play.tuning, body, {}, bodyWorld(play, e.uid));
    for (const ev of body.events.slice(before)) {
      if (ev.kind === 'hazard' && !e.bodySpiked) {
        e.bodySpiked = true;
        hurtEnemy(play, e, RULES.enemySpikeDamage);
      }
    }
    if (e.defeated) continue;
    e.x = body.ball.x;
    e.y = body.ball.y;
    e.z = body.ball.z;
    if (body.outcome || body.step >= maxSteps) {
      e.body = null;
      e.z = heightAt(play.course, e.x, e.y);
      if (body.outcome === 'out' || body.outcome === 'sunk') {
        // Should not happen with walls at drops and water, but never leave an enemy off the course.
        const g = groundAt(play.course, e.x, e.y);
        if (!g) defeat(play, e);
      }
    }
  }
  play.seeds = play.seeds.filter((sd) => {
    const s = sd.shot;
    stepShot(play.course, play.tuning, s, {}, bodyWorld(play, sd.spitter));
    return !s.outcome && s.step < maxSteps;
  });
}

/**
 * The ball and rolling things (Lunger, Mole, seed) bounce off each other
 * (owner, 2026-11-14). A resting ball is set moving. A moving Lunger or Mole,
 * or any moving seed, hurts the ball; a ball that was moving also hits a Lunger.
 */
function meetBodies(play: PlayState): void {
  const things: { id: string; s: ShotState; enemy?: EnemyState; seed?: SeedState }[] = [];
  for (const e of play.enemies) {
    if (!e.body) continue;
    // A Mole that has only just popped out cannot touch the ball yet (owner, 2026-11-14: no instant hit).
    const bh = e.def.behaviour;
    if (bh.kind === 'burrow' && play.clock - e.launchedAt < steps(bh.grace)) continue;
    things.push({ id: e.uid, s: e.body, enemy: e });
  }
  for (const sd of play.seeds) things.push({ id: sd.uid, s: sd.shot, seed: sd });
  const rb = play.tuning.ballRadius;
  const still: string[] = [];
  for (const t of things) {
    const ball = ballNow(play);
    const o = t.s.ball;
    const rr = t.s.radius;
    const dx = ball.x - o.x;
    const dy = ball.y - o.y;
    const d = Math.hypot(dx, dy);
    const zOverlap = ball.z < o.z + 2 * rr && o.z < ball.z + 2 * rb;
    if (d >= rb + rr || !zOverlap) continue;
    still.push(t.id);
    // Only the player's own shot hits back: a ball that was knocked does not.
    const ballWasMoving = !!play.shot && !play.knocked && Math.hypot(play.shot.ball.vx, play.shot.ball.vy) > play.tuning.restSpeed;
    const s = ensureBallMoving(play);
    const b = s.ball;
    const nx = d > 1e-6 ? dx / d : 1;
    const ny = d > 1e-6 ? dy / d : 0;
    // Push apart, half each.
    const push = (rb + rr - d) / 2 + 1e-4;
    b.x += nx * push;
    b.y += ny * push;
    o.x -= nx * push;
    o.y -= ny * push;
    const vrel = (b.vx - o.vx) * nx + (b.vy - o.vy) * ny;
    if (vrel < 0) {
      const j = (-(1 + RULES.bodyRestitution) * vrel) / 2;
      b.vx += j * nx;
      b.vy += j * ny;
      o.vx -= j * nx;
      o.vy -= j * ny;
      if (b.grounded && Math.hypot(b.vx, b.vy) > 0) s.restSteps = 0;
    }
    if (play.touching.includes(t.id)) continue;
    // First touch of this meeting.
    if (t.seed) {
      const sp = enemyByUid(play, t.seed.spitter);
      damageBall(play, sp ? sp.stats.get('attackDamage') : 1, 'seed');
    } else if (t.enemy) {
      const e = t.enemy;
      const bh = e.def.behaviour;
      if (e.def.contact === 'moving') damageBall(play, e.stats.get('attackDamage'), 'enemy');
      if ((bh.kind === 'launch' || bh.kind === 'burrow') && bh.hitWhileMoving && ballWasMoving) hitEnemy(play, e, s);
    }
    if (play.status !== 'playing') return;
  }
  play.touching = still;
}

/** Thunder clouds zap the ball (and rolling enemies) under them (owner, 2026-11-14). */
function zapClouds(play: PlayState): void {
  for (const c of play.clouds) {
    const under = (b: BallState) => {
      if (Math.abs(b.x - c.x) >= c.def.half || Math.abs(b.y - c.y) >= c.def.half) return false;
      const g = groundAt(play.course, b.x, b.y);
      return !!g && b.z < g.h + c.def.zapHeight;
    };
    const throwIt = (s: ShotState) => {
      const a = play.rng.float(0, Math.PI * 2);
      s.ball.vx = Math.cos(a) * c.def.throwSpeed;
      s.ball.vy = Math.sin(a) * c.def.throwSpeed;
      s.ball.vz = c.def.throwHop;
      s.ball.grounded = false;
      s.ball.z += 0.001;
      s.restSteps = 0;
    };
    if (!play.zapped.includes(c.uid) && under(ballNow(play))) {
      const s = ensureBallMoving(play);
      play.zapped.push(c.uid);
      if (s.hover) {
        endHover(play.course, s, 1);
        play.tornado = null;
      }
      play.log.push({ kind: 'zap', target: 'ball' });
      damageBall(play, c.def.damage, 'zap');
      if (play.status !== 'playing') return;
      throwIt(s);
    }
    for (const e of play.enemies) {
      if (!e.body || e.bodyZapped.includes(c.uid) || !under(e.body.ball)) continue;
      e.bodyZapped.push(c.uid);
      play.log.push({ kind: 'zap', target: e.uid });
      throwIt(e.body);
    }
  }
}

/** Pass-by: the ball goes through a sentinel's inner radius (once per shot). */
function passByTriggers(play: PlayState): void {
  if (!play.shot) return;
  const b = play.shot.ball;
  const g = groundAt(play.course, b.x, b.y);
  const onGround = !!g && b.z <= g.h + 0.05;
  for (const e of play.enemies) {
    if (e.defeated || e.body || e.def.triggers.passBy === 'none') continue;
    if (e.def.behaviour.kind === 'burrow' && !e.burrowed) continue;
    const r = e.stats.get('innerRadius');
    if (r <= 0) continue;
    const inside = Math.hypot(b.x - e.x, b.y - e.y) < r && (!e.def.passByGroundOnly || onGround);
    if (inside && !e.insideInner && (e.passByShot !== play.shotNumber || e.def.behaviour.kind === 'burrow')) {
      e.passByShot = play.shotNumber;
      respond(play, e, 'passBy');
    }
    e.insideInner = inside;
  }
}

/** Rest: the ball stops inside a sentinel's outer radius. */
function restTriggers(play: PlayState): void {
  const b = play.ball;
  for (const e of play.enemies) {
    if (!standing(e) || e.def.triggers.rest === 'none') continue;
    const r = e.stats.get('outerRadius');
    if (r > 0 && Math.hypot(b.x - e.x, b.y - e.y) < r) respond(play, e, 'rest');
  }
}

// ---------------------------------------------------------------------------
// Flags (owner, 2026-11-14)

function updateFlags(play: PlayState): void {
  let changed = false;
  // An enemy entering a raised flag's tile lowers it: the star is lost again.
  for (const e of play.enemies) {
    if (e.defeated || e.burrowed) continue;
    const key = tileKeyOf(e.x, e.y);
    if (key === e.tileKey) continue;
    e.tileKey = key;
    for (const f of play.flags) {
      if (!f.raised || `${f.tx},${f.ty}` !== key) continue;
      f.raised = false;
      f.solid = false;
      play.meter = Math.max(0, play.meter - 1);
      play.wallet = Math.max(0, play.wallet - 1);
      play.log.push({ kind: 'flagDown', flag: f.uid });
      changed = true;
    }
  }
  // The ball touching a lowered flag raises it: the star comes back.
  const b = ballNow(play);
  const g = groundAt(play.course, b.x, b.y);
  const onGround = !!g && b.z <= g.h + 0.05;
  const r = play.tuning.ballRadius;
  for (const f of play.flags) {
    if (!f.raised && onGround && Math.hypot(b.x - f.x, b.y - f.y) <= RULES.flagTouchReach) {
      f.raised = true;
      f.solid = false;
      play.log.push({ kind: 'flagUp', flag: f.uid });
      addStars(play, 1, f.x, f.y);
      changed = true;
    }
    // A raised pole turns solid once the ball is clear of it, so it never traps the ball.
    const poleR = f.def.shape.kind === 'round' ? f.def.shape.r : 0;
    // Clear means past it: far enough away and not heading back towards it.
    const away = (b.x - f.x) * b.vx + (b.y - f.y) * b.vy >= 0 || !play.shot;
    if (f.raised && !f.solid && away && Math.hypot(b.x - f.x, b.y - f.y) > poleR + r + RULES.poleClearance) {
      f.solid = true;
      changed = true;
    }
  }
  if (changed) play.world.obstacles = obstaclesOf(play);
}

// ---------------------------------------------------------------------------
// Pickups

function collectPickups(play: PlayState): void {
  const b = ballNow(play);
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
    } else if (p.def.effect === 'wild') {
      // Owner, 2026-11-14: a random ability, never the one already held.
      const options = ABILITY_IDS.filter((id) => id !== play.ability);
      giveAbility(play, play.rng.pick(options), true);
    } else {
      addStars(play, 1, p.x, p.y);
    }
    p.taken = true;
  }
}

// ---------------------------------------------------------------------------
// Abilities

function giveAbility(play: PlayState, id: string, wild: boolean): void {
  if (!ABILITIES.has(id)) return;
  play.ability = id;
  play.log.push({ kind: 'abilityGained', ability: id, wild });
}

/** Can the held ability be used right now? Once per shot, while the ball moves. */
export function canUseAbility(play: PlayState): boolean {
  return !!play.ability && !play.abilityUsed && !!play.shot && !play.shot.outcome && play.status === 'playing';
}

export function useAbility(play: PlayState): boolean {
  if (!canUseAbility(play)) return false;
  const def = ABILITIES.get(play.ability!)!;
  const s = play.shot!;
  const b = s.ball;
  play.abilityUsed = true;
  play.log.push({ kind: 'abilityUsed', ability: def.id });
  const fx = def.effect;
  if (fx.kind === 'anchor') {
    if (s.hover) {
      endHover(play.course, s, 0);
      play.tornado = null;
    }
    b.vx = 0;
    b.vy = 0;
    if (!b.grounded) b.vz = -fx.dropSpeed;
    s.anchor = true;
  } else if (fx.kind === 'burn') {
    s.burnSteps = steps(fx.time);
    s.burnMin = fx.minSpeed;
  } else if (fx.kind === 'hop') {
    if (s.hover) {
      endHover(play.course, s, 1);
      play.tornado = null;
    }
    b.vz = Math.max(b.vz, fx.upSpeed);
    b.grounded = false;
    b.z += 0.001;
    s.restSteps = 0;
  } else if (fx.kind === 'tornado') {
    const sp = Math.hypot(b.vx, b.vy);
    const heading = sp > 1e-6 ? Math.atan2(b.vy, b.vx) : Math.atan2(s.dirY, s.dirX);
    s.hover = { floor: b.z };
    play.tornado = { stepsLeft: steps(fx.time), heading, speed: fx.speed, wanderIn: steps(fx.wanderEvery) };
  }
  return true;
}

/** Anchor stop: break a cracked tile under the ball; stun enemies nearby (ground pound). */
function anchorEffects(play: PlayState, x: number, y: number): void {
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  for (const b of play.breakables) {
    if (!b.broken && b.def.breakBy === 'anchor' && b.tx === tx && b.ty === ty) breakIt(play, b);
  }
  const fx = ABILITIES.get('anchor')!.effect;
  const radius = fx.kind === 'anchor' ? fx.stunRadius : 1;
  for (const e of play.enemies) {
    if (e.defeated || e.burrowed) continue;
    if (Math.hypot(e.x - x, e.y - y) <= radius) applyEnemyStatus(play, e, 'stunned');
  }
}

// ---------------------------------------------------------------------------
// Statuses (FEATURES.md section 12)

export function applyEnemyStatus(play: PlayState, e: EnemyState, id: string): void {
  const def = STATUSES.get(id);
  if (!def) return;
  const have = e.statuses.find((s) => s.id === id);
  if (have) {
    if (def.reapply === 'add') have.turnsLeft += def.turns;
    else if (def.reapply === 'reset') have.turnsLeft = def.turns;
    return;
  }
  e.statuses.push({ id, turnsLeft: def.turns });
  for (const m of def.modifiers) e.stats.add({ ...m, source: { kind: 'status', id }, duration: { kind: 'turns', turns: def.turns } });
  play.log.push({ kind: 'stunned', target: e.uid });
}

export function applyBallStatus(play: PlayState, id: string): void {
  const def = STATUSES.get(id);
  if (!def) return;
  const have = play.ballStatuses.find((s) => s.id === id);
  if (have) {
    if (def.reapply === 'add') have.turnsLeft += def.turns;
    else if (def.reapply === 'reset') have.turnsLeft = def.turns;
    return;
  }
  play.ballStatuses.push({ id, turnsLeft: def.turns });
  for (const m of def.modifiers) play.stats.add({ ...m, source: { kind: 'status', id }, duration: { kind: 'turns', turns: def.turns } });
  if (def.ballLosesShots > 0) play.shots = Math.max(0, play.shots - def.ballLosesShots);
  play.log.push({ kind: 'stunned', target: 'ball' });
}

function tickStatuses(list: StatusState[]): StatusState[] {
  for (const s of list) s.turnsLeft--;
  return list.filter((s) => s.turnsLeft > 0);
}

// ---------------------------------------------------------------------------
// After a shot: rest check, enemy turns, recover

function advance(play: PlayState): void {
  if (play.phase === 'shot' && settled(play)) {
    afterShot(play);
    return;
  }
  if (play.phase === 'enemy') runEnemyTurns(play);
}

function afterShot(play: PlayState): void {
  restTriggers(play);
  play.ballStatuses = tickStatuses(play.ballStatuses);
  play.stats.tickTurn();
  play.turnQueue = ['normal'];
  if (play.shots <= 0) {
    if (play.napsUsed < RULES.naps) play.turnQueue.push('recover');
    else {
      // Owner, 2026-11-15: out of shots with no naps left: the course is failed.
      play.status = 'lost';
      play.lostBy = 'shots';
      play.log.push({ kind: 'lost' });
      return;
    }
  }
  play.turn = null;
  play.phase = 'enemy';
}

function runEnemyTurns(play: PlayState): void {
  if (!settled(play)) return;
  if (play.actionWait > 0) {
    play.actionWait--;
    return;
  }
  if (play.turn === null) {
    const next = play.turnQueue.shift();
    if (!next) {
      play.phase = 'aim';
      return;
    }
    startTurn(play, next);
    return;
  }
  const uid = play.turnActions.shift();
  if (uid === undefined) {
    endTurn(play);
    return;
  }
  const e = enemyByUid(play, uid);
  if (!e || e.defeated || !e.activated) return;
  if (hasStatus(e.statuses, 'stunned')) {
    play.log.push({ kind: 'skip', enemy: e.uid });
    return;
  }
  act(play, e, false);
  play.actionWait = steps(RULES.enemyActionTime);
}

function startTurn(play: PlayState, kind: 'normal' | 'recover'): void {
  play.turn = kind;
  play.log.push({ kind: 'enemyTurn' });
  if (kind === 'normal') burrowMoles(play);
  play.turnActions = play.enemies.filter((e) => !e.defeated && e.activated && !e.burrowed).map((e) => e.uid);
}

function endTurn(play: PlayState): void {
  for (const e of play.enemies) {
    e.statuses = tickStatuses(e.statuses);
    e.stats.tickTurn();
  }
  if (play.turn === 'recover') {
    // DESIGN.md section 6, open question 3: recovering refills all the shots.
    play.shots = play.stats.get('maxShots');
    play.napsUsed++;
    play.log.push({ kind: 'recover' });
  }
  play.turn = null;
}

/** The nearest tile centre with no rail that can hold the ball, searched in growing rings. */
function moveOffRail(play: PlayState, e: EnemyState): void {
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  const rails = railTileSet(play.course);
  for (let ring = 1; ring < 8; ring++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let y = ty - ring; y <= ty + ring; y++) {
      for (let x = tx - ring; x <= tx + ring; x++) {
        if (Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== ring) continue;
        const t = tileAt(play.course, x, y);
        if (!t || rails.has(`${x},${y}`) || !SURFACES.get(t.surface)?.canHoldBall) continue;
        const d = Math.hypot(x + 0.5 - e.x, y + 0.5 - e.y);
        if (!best || d < best.d) best = { x, y, d };
      }
    }
    if (best) {
      e.x = best.x + 0.5;
      e.y = best.y + 0.5;
      e.z = heightAt(play.course, e.x, e.y);
      return;
    }
  }
}

/**
 * A surfaced Mole stays up for the player's next shot, then burrows where it
 * stopped, leaving a new hill there (owner, 2026-11-14). Stunned, it stays up a turn longer.
 */
function burrowMoles(play: PlayState): void {
  for (const e of play.enemies) {
    const bh = e.def.behaviour;
    if (bh.kind !== 'burrow' || e.defeated || e.burrowed || e.body) continue;
    if (hasStatus(e.statuses, 'stunned')) continue;
    if (play.shotNumber - e.surfacedShot < bh.upShots) continue;
    // Owner, 2026-11-15: a Mole never burrows under a guard rail. It moves to the nearest tile without one.
    if (railTileSet(play.course).has(tileKeyOf(e.x, e.y))) moveOffRail(play, e);
    e.burrowed = true;
    e.insideInner = false;
    e.tileKey = tileKeyOf(e.x, e.y);
    play.log.push({ kind: 'burrow', enemy: e.uid });
  }
  play.world.obstacles = obstaclesOf(play);
}

// ---------------------------------------------------------------------------
// The aim guide

export interface Preview {
  readonly points: GuidePoint[];
  /** The guide stopped at a thunder cloud. */
  readonly cloud: boolean;
}

/**
 * The aim guide for the current state: same physics, the obstacles that stand
 * still, no side effects. Moving things are left out (the guide cannot know
 * where they will be). It stops at a stationary thunder cloud, because the
 * direction after a zap is meant to be a surprise.
 */
export function previewShot(play: PlayState, cmd: ShotCommand): Preview {
  const hit = play.stats.get('hitDamage');
  const world: ShotWorld = {
    obstacles: play.world.obstacles.filter((o) => !o.vx && !o.vy && !o.knock),
    contact: (o, s) => {
      if (o.id.startsWith('flag:')) return Math.hypot(s.ball.vx, s.ball.vy) >= play.tuning.poleThroughSpeed ? 'passPole' : 'bounce';
      const e = enemyByUid(play, o.id);
      if (e) return e.health <= hit ? 'pass' : 'bounce';
      const b = play.breakables.find((x) => x.uid === o.id);
      if (b) return b.health <= hit ? 'pass' : 'bounce';
      return 'bounce';
    },
  };
  const pts = predictPath(play.course, play.tuning, play.ball, cmd, play.stats.get('guideLength'), world, scales(play));
  const still = play.clouds.filter((c) => !c.path);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    for (const c of still) {
      if (Math.abs(p.x - c.x) >= c.def.half || Math.abs(p.y - c.y) >= c.def.half) continue;
      const g = groundAt(play.course, p.x, p.y);
      if (g && p.z < g.h + c.def.zapHeight) return { points: pts.slice(0, i + 1), cloud: true };
    }
  }
  return { points: pts, cloud: false };
}

/** Take the display's messages. */
export function drainLog(play: PlayState): PlayEvent[] {
  const out = play.log;
  play.log = [];
  return out;
}

/** For tests and the display: a hit-damage number as the rules would deal it to an enemy now. */
export function hitDamage(play: PlayState, enemy: EnemyState): number {
  void enemy;
  return play.stats.get('hitDamage');
}
