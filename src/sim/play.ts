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
import { ACORN_LIST, ACORNS, FOOD, FOODS, acornWeights } from '../content/consumables.ts';
import { UPGRADES } from '../content/run.ts';
import { COURSE_MODS, windAccel, type CourseMod } from '../content/modifiers.ts';
import { GEAR, GEAR_CATEGORIES, NO_GEAR, RARITY_ODDS, type GearCategory, type GearEffect, type GearSlots } from '../content/gear.ts';
import {
  ELEMENT_RULES,
  OBJECTS,
  type BlockerDef,
  type Element,
  type Side,
  type BreakableDef,
  type CloudDef,
  type EnemyDef,
  type FlagDef,
  type MoverDef,
  type ObjectShape,
  type PickupDef,
  type SwitchDef,
  type DrawbridgeDef,
  RAIL,
} from '../content/objects.ts';
import { BOSS_TIER, RULES } from '../content/rules.ts';
import { BOSSES, type BossDef, type BossPhase } from '../content/bosses.ts';
import { STATUSES } from '../content/statuses.ts';
import { DIRECTION_VECTORS, SURFACES, type Direction } from '../content/surfaces.ts';
import { STEPS_PER_SECOND, surfacePhysics, type Tuning } from '../content/tuning.ts';
import {
  DT,
  ballAtTile,
  endHover,
  stick,
  endShot,
  groundAt,
  nearestOnShape,
  predictPath,
  setHeading,
  surfaceOf,
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
import { enemyStarValue, railTileList, railTiles, tileAt, type Course, type CourseObject, type GridPoint } from './course.ts';
import { ENEMY_GEAR, NO_EXTRAS, SPOTS, TRAIT_RULES, rankDef, type TraitId } from '../content/enemyMods.ts';
import { computeHit, wedgeOf } from './damage.ts';
import { Rng, type Seed } from './rng.ts';
import { StatSheet, type Modifier } from './stats.ts';

const steps = (seconds: number) => Math.round(seconds * STEPS_PER_SECOND);

/** Owner, 2026-11-18: Burner burns what it hits for this many turns. */
const BURNER_BURN_TURNS = 1;

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
  /** Milestone 7: summoned by a boss (leaves no flag pole; vanishes when the boss is defeated). */
  minion: boolean;
  /** Boss: the ring its next slam lands on, or null. */
  slamMark: { x: number; y: number; r: number } | null;
  /** Boss: its phase (0 = the first), from its health. */
  phase: number;
  /** Boss: hits counted in shot number `hitShot` (bosses take a limited number per shot). */
  hitShot: number;
  hitsInShot: number;
  /** Milestone 8: this enemy's element and what it is weak to and resists (its entry, plus its element's rules). */
  element: Element | null;
  weakTo: Element[];
  resists: Element[];
  weakSpots: Side[];
  guardedSides: Side[];
  shield: boolean;
  /** Milestone 8: rank (0 standard, 1 Veteran, 2 Elite), traits and carried gear, from its course entry. */
  readonly rank: number;
  readonly traits: readonly TraitId[];
  gear: string | null;
  /** Yellow stars it is worth when defeated. */
  readonly stars: number;
  /** Swift: patrol speed multiplier. */
  readonly speedMul: number;
  /** Hurt by a blast (shown with a scorch mark). */
  scorched: boolean;
  /** Milestone 8 bosses: actions taken (for turn-about attacks). */
  bossTurns: number;
  /** Gloamhorn: the way it will charge (shown as an arrow), and when (a clock step) for a same-turn charge. */
  windup: { dx: number; dy: number } | null;
  chargeAt: number | null;
  /** Gloamhorn: its shell is open during the player's shot with this number (or earlier). */
  shellOpenShot: number;
  /** The Brood Queen: where her next acid globs land, and her next soldier ring. */
  globMarks: { x: number; y: number }[];
  ringMark: { x: number; y: number; r: number } | null;
}

/** An Explosive enemy's blast waiting for its fuse (Milestone 8 sheet section 5.1a). */
export interface BlastState {
  readonly uid: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Clock step it goes off. */
  readonly at: number;
}

export interface PickupState {
  readonly uid: string;
  readonly def: PickupDef;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  taken: boolean;
}

/** A gear item lying on the course (Milestone 6). */
export interface GearItemState {
  readonly uid: string;
  /** Gear id in src/content/gear.ts. */
  readonly item: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  taken: boolean;
  /** A dropped item cannot be picked up again before this clock step. */
  lockUntil: number;
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
  /** Round 2b: a linked gate's switch letter. */
  readonly link: string | null;
}

/** Round 2b: a switch plate. */
export interface SwitchState {
  readonly uid: string;
  readonly def: SwitchDef;
  readonly x: number;
  readonly y: number;
  readonly link: string;
  on: boolean;
}

/** Round 2b: one tile of a drawbridge, up until its switch is pressed. */
export interface DrawbridgeState {
  readonly uid: string;
  readonly def: DrawbridgeDef;
  readonly tx: number;
  readonly ty: number;
  readonly link: string;
  down: boolean;
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

/** Round 2b: Gyre (steering) and Drift (floating) while they last, in steps. */
export interface SteerState {
  readonly kind: 'gyre' | 'drift';
  stepsLeft: number;
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
  | { kind: 'damage'; amount: number; cause: 'spikes' | 'sunk' | 'out' | 'enemy' | 'seed' | 'zap' | 'slam' | 'burn' | 'blast' | 'charge' | 'bite' | 'ring' }
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
  | { kind: 'abilityLost'; ability: string }
  // Milestone 6: gear.
  /** Rolled over a gear item: it is equipped, and the one it replaced (if any) is left on the ground. */
  | { kind: 'gearEquipped'; item: string; dropped: string | null }
  /** Armour ignored a damage (Lining family, Bastion Plate). */
  | { kind: 'shielded'; item: string }
  /** Armour stopped a kind of damage outright (Cork Plate, Storm Cloak). */
  | { kind: 'resisted'; item: string; cause: string }
  /** Armour hurt back an enemy that hurt the ball (Guard family, Mirror Plate). */
  | { kind: 'thorns'; enemy: string; damage: number }
  /** Phoenix Plate saved the ball and crumbled. */
  | { kind: 'phoenix'; item: string; health: number }
  /** A status other than Stunned took hold on an enemy or (target "ball") on the ball. */
  | { kind: 'status'; target: string; status: string }
  /** A status ended early (fire and ice cancelled, water put out a burn, a chilled enemy was hit). */
  | { kind: 'statusEnd'; target: string; status: string }
  /** Damage from a status at the start of an enemy turn. */
  | { kind: 'statusDamage'; enemy: string; status: string; damage: number }
  /** Thunder Knuckle zapped a second enemy; Sunfire Crown's burst. */
  | { kind: 'chainZap'; enemy: string }
  | { kind: 'burst'; enemy: string }
  /** Health healed by gear during a course (Leech Fang). */
  | { kind: 'healed'; amount: number; item: string }
  /** Echo Shell: this hit counted twice. */
  | { kind: 'echo' }
  // Milestone 7.
  /**
   * A success roll (owner, 2026-11-17): the wheel for one weapon effect. The
   * result is decided here; the display only shows the wheel spinning to it.
   * `respun`: Fortune's Mail spun a failed roll again (this is the second spin).
   */
  | { kind: 'roll'; enemy: string; effect: RollEffect; filled: number; size: number; success: boolean; respun: boolean }
  /** A blue star picked up: carried until deposited at a town or on beating a boss. */
  | { kind: 'blueStar'; x: number; y: number }
  /** An acorn eaten before the course is working: extra slices for this course. */
  | { kind: 'acorn'; item: string; slices: number }
  /** Round 2a (owner, 2026-11-21): food picked up on a course; the player chooses to eat it now or stash it (decideFood). */
  | { kind: 'foodFound'; item: string }
  /** Food eaten on the course: chosen, or at once because the bag was full (`auto`). */
  | { kind: 'foodEaten'; item: string; auto: boolean }
  /** Food put in the bag for later. */
  | { kind: 'foodStashed'; item: string }
  /** Round 2b: a switch was pressed; a drawbridge came down. */
  | { kind: 'switchOn'; link: string; x: number; y: number }
  | { kind: 'bridgeDown'; link: string }
  /** Owner, 2026-11-21: the ball touched a closed gate's spiked top in the air. */
  | { kind: 'gateSpikes' }
  /** A boss marked a ring where its next slam lands (Milestone 7). */
  | { kind: 'slamMark'; enemy: string; x: number; y: number; r: number }
  /** A boss's slam landed; `hit` if the ball was inside the ring on the ground. */
  | { kind: 'slam'; enemy: string; x: number; y: number; r: number; hit: boolean }
  /** A boss summoned a minion. */
  | { kind: 'summon'; boss: string; enemy: string; x: number; y: number }
  /** A boss entered a new phase and shed a plate. */
  | { kind: 'phase'; enemy: string; phase: number }
  /** A minion vanished in a puff (its boss was defeated). */
  | { kind: 'vanish'; enemy: string }
  // Milestone 8.
  /** An Explosive enemy was defeated: its fuse is lit; the blast will reach `r`. */
  | { kind: 'fuse'; enemy: string; x: number; y: number; r: number }
  | { kind: 'blast'; uid: string; x: number; y: number; r: number }
  /** A Splitting enemy let out a small one. */
  | { kind: 'split'; enemy: string; into: string }
  /** A Regenerating enemy healed 1. */
  | { kind: 'regen'; enemy: string }
  /** An enemy dropped the gear it carried. */
  | { kind: 'gearDrop'; enemy: string; item: string }
  /** A Trapjaw turned to face the ball. */
  | { kind: 'turn'; enemy: string }
  /** A Stinkpuff marked the ring it will puff next turn, and puffed (`hit`: the ball was in it). */
  | { kind: 'puffMark'; enemy: string; x: number; y: number; r: number }
  | { kind: 'puff'; enemy: string; x: number; y: number; r: number; hit: boolean }
  /** Frost froze a water tile; frozen water melted (the ball's turns ran out). */
  | { kind: 'freeze'; x: number; y: number }
  | { kind: 'melt'; x: number; y: number }
  /** Static: the field zapped an enemy. */
  | { kind: 'staticZap'; enemy: string }
  /** Gloamhorn: wound up (the arrow), charged, and its shell opened. */
  | { kind: 'windup'; enemy: string; dx: number; dy: number }
  | { kind: 'charge'; enemy: string }
  | { kind: 'shellOpen'; enemy: string }
  /** The Brood Queen: a soldier ring marked round the ball, and landing. */
  | { kind: 'ringMark'; enemy: string; x: number; y: number; r: number }
  | { kind: 'ring'; enemy: string; x: number; y: number; r: number; hit: boolean };

/** What a success roll is for: the word shown on the wheel's filled slices. */
export type RollEffect = 'burn' | 'poison' | 'stun' | 'zap' | 'heal' | 'knock' | 'echo';

export type PlayStatus = 'playing' | 'won' | 'lost';

/** aim: waiting for a shot. shot: the player's shot is under way. enemy: enemy turns are running. */
export type Phase = 'aim' | 'shot' | 'enemy';

export interface PlayState {
  /** The course as it is now. Round 2b: a drawbridge coming down swaps in a copy with those tiles changed. */
  course: Course;
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
  /** Milestone 7: a boss course. The exit opens only when the boss is defeated, never from stars. */
  readonly bossExit: boolean;
  /** Where the ball is when it is still. While it moves, see `shot.ball`. */
  ball: BallState;
  /** Where the ball last came to rest on ground that can hold it. */
  restSpot: BallState;
  readonly enemies: EnemyState[];
  readonly pickups: PickupState[];
  readonly blockers: BlockerState[];
  readonly movers: MoverState[];
  /** Round 2b: switches, and the drawbridge tiles waiting for theirs (sheet section 2). */
  readonly switches: SwitchState[];
  readonly drawbridges: DrawbridgeState[];
  /** Links whose switch has been pressed this course ("a" -> true). */
  readonly linksOn: Record<string, boolean>;
  readonly breakables: BreakableState[];
  readonly clouds: CloudState[];
  readonly flags: FlagState[];
  seeds: SeedState[];
  /** Milestone 8: Explosive blasts waiting for their fuse. */
  blasts: BlastState[];
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
  /** Round 2b: Gyre or Drift while it lasts this shot. */
  steering: SteerState | null;
  /** Milestone 8: Frost or Static while it lasts this shot (steps left; Static: enemies it already zapped). */
  aura: { kind: 'frost' | 'static'; stepsLeft: number; zapped: string[] } | null;
  /** The ball's turn (shot number) each frozen tile was last frozen in: that turn does not count towards melting. */
  frozenAt: Record<string, number>;
  ballStatuses: StatusState[];
  /** Milestone 8: water tiles frozen by Frost, "x,y" -> the ball's turns left (owner, 2026-11-18: 2 turns). */
  frozen: Record<string, number>;
  /** Gear held, one per category (Milestone 6). */
  gear: { -readonly [C in GearCategory]: string | null };
  /** Gear lying on the course. */
  readonly gearItems: GearItemState[];
  /** Damages ignored by armour on this course (Lining family, Bastion Plate). */
  shieldsUsed: number;
  /** Shot number of the last Echo Shell hit and the last Leech Fang heal (once per shot each). */
  echoShot: number;
  leechShot: number;
  /** Owner, 2026-11-17: extra filled slices on success wheels from acorns this course. */
  acornSlices: number;
  /**
   * Round 2a (owner, 2026-11-21): food picked up on this course. `pending`
   * waits for the player's choice (eat now or stash); `foods` is what was
   * decided, for the run afterwards. `bagRoom` is how many more fit in the bag.
   */
  foodPending: string[];
  foods: { id: string; eaten: boolean }[];
  bagRoom: number;
  /** Round 2b: this course's modifier, for the display. */
  readonly courseMod: CourseMod | null;
  /** Fortune's Mail: failed rolls spun again this course. */
  respinsUsed: number;
  /** Hot Streak Charm: successful rolls in shot number `streakShot`. */
  streakShot: number;
  streak: number;
  /** Blue stars picked up on this course (carried; the run deposits them later). */
  blueStars: number;
  readonly rarityWeights: readonly number[];
  /** Milestone 7: region toughness, for enemies summoned during the course too. */
  readonly enemyModifiers: readonly Modifier[];
  /** Minions summoned so far (for their ids). */
  summoned: number;
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
  /** What the ball brings from the run (Milestone 6). Leave out for a fresh ball. */
  readonly loadout?: Loadout;
  /** Milestone 7 (owner, 2026-11-17): region toughness, a modifier list added to every enemy's stat sheet. */
  readonly enemyModifiers?: readonly Modifier[];
  /** Milestone 7: the boss's health in this region (bosses do not take the region's health toughness). */
  readonly bossHealth?: number;
}

/** The ball's state carried into a course from the run. */
export interface Loadout {
  /** Health at the start, before any heal at the start of the course. Full if left out. */
  readonly health?: number;
  readonly ability?: string | null;
  readonly gear?: GearSlots;
  readonly wallet?: number;
  /** Run upgrades: modifiers that last the run. */
  readonly modifiers?: readonly Modifier[];
  /** Round 2a: acorns eaten and still working (ids; the same one twice counts twice). */
  readonly acorns?: readonly string[];
  /** Round 2a: free slots in the food bag. Left out: a full bag's worth. */
  readonly bagRoom?: number;
  /** Round 2b: this course's modifier (wind, low gravity, darkness), or none. The bot plays with it too. */
  readonly courseMod?: CourseMod | null;
  /** Rarity weights (in the order of RARITIES) for things dropped on this course, such as acorns. Region 1's early odds if left out. */
  readonly rarityWeights?: readonly number[];
}

/** What the player does during one step. */
export interface TickInput {
  /** Bounce boost key pressed this step. */
  readonly boost?: boolean;
  /** Ability key pressed this step. */
  readonly ability?: boolean;
  /** Tornado and Gyre steering: -1 left, 1 right, 0 none. */
  readonly steer?: number;
  /** Drift: the direction pressed, in screen terms (x right, y down), each -1, 0 or 1. */
  readonly move?: { readonly x: number; readonly y: number };
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
  const lo = opts.loadout ?? {};
  for (const m of lo.modifiers ?? []) stats.add(m);
  for (const m of courseModModifiers(lo.courseMod ?? null)) stats.add(m);
  const startGear = lo.gear ?? NO_GEAR;
  for (const c of GEAR_CATEGORIES) {
    const g = startGear[c] ? GEAR.get(startGear[c]!) : undefined;
    for (const m of g?.modifiers ?? []) stats.add({ ...m, source: { kind: 'gear', id: g!.id }, duration: { kind: 'equipped' } });
  }
  const play: PlayState = {
    course,
    tuning,
    seed: String(opts.seed),
    character,
    stats,
    health: Math.min(stats.get('maxHealth'), lo.health ?? stats.get('maxHealth')),
    shots: stats.get('maxShots'),
    wallet: lo.wallet ?? 0,
    meter: 0,
    quota: course.quota,
    exitOpen: course.quota <= 0 && !hasBoss(course),
    bossExit: hasBoss(course),
    ball: ballAtTile(course, course.start.x, course.start.y),
    restSpot: ballAtTile(course, course.start.x, course.start.y),
    enemies: [],
    pickups: [],
    blockers: [],
    movers: [],
    switches: [],
    drawbridges: [],
    linksOn: {},
    breakables: [],
    clouds: [],
    flags: [],
    seeds: [],
    blasts: [],
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
    ability: lo.ability !== undefined ? lo.ability : character.startingAbility,
    abilityUsed: false,
    tornado: null,
    steering: null,
    aura: null,
    frozenAt: {},
    ballStatuses: [],
    frozen: {},
    gear: { weapon: startGear.weapon, armour: startGear.armour, bauble: startGear.bauble },
    gearItems: [],
    shieldsUsed: 0,
    echoShot: -1,
    leechShot: -1,
    acornSlices: 0,
    foodPending: [],
    foods: [],
    bagRoom: lo.bagRoom ?? FOOD.bagSlots,
    courseMod: lo.courseMod ?? null,
    respinsUsed: 0,
    streakShot: -1,
    streak: 0,
    blueStars: 0,
    rarityWeights: lo.rarityWeights ?? RARITY_ODDS[0]!.weights,
    enemyModifiers: opts.enemyModifiers ?? [],
    summoned: 0,
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
    if (def.kind === 'enemy') play.enemies.push(newEnemy(play, opts, def, o, uid, cx, cy, z));
    else if (def.kind === 'pickup') play.pickups.push({ uid, def, x: cx, y: cy, z, taken: false });
    else if (def.kind === 'switch') play.switches.push({ uid, def, x: cx, y: cy, link: o.link ?? 'a', on: false });
    else if (def.kind === 'drawbridge') play.drawbridges.push({ uid, def, tx: o.x, ty: o.y, link: o.link ?? 'a', down: false });
    else if (def.kind === 'blocker') play.blockers.push({ uid, def, x: cx, y: cy, z });
    else if (def.kind === 'mover') {
      const shape: ObjectShape = def.shape.kind === 'box' && o.orient === 'y' ? { kind: 'box', hx: def.shape.hy, hy: def.shape.hx } : def.shape;
      const path = def.motion.kind === 'path' ? makePath(o.path) : null;
      const m: MoverState = { uid, def, x: cx, y: cy, z, vx: 0, vy: 0, shape, path, pathDist: path ? o.phase * path.total * 2 : 0, open: false, timer: 0, link: o.link };
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
    } else if (def.kind === 'gear') {
      play.gearItems.push({ uid, item: def.item, x: cx, y: cy, z, taken: false, lockUntil: 0 });
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
  // Moss Plate: heal at the start of each course.
  for (const fx of gearFx(play, 'healAtStart')) play.health = Math.min(play.stats.get('maxHealth'), play.health + fx.amount);
  // Round 2a: acorns eaten from the bag work on every course they last.
  for (const id of lo.acorns ?? []) {
    const a = ACORNS.get(id);
    if (!a) continue;
    play.acornSlices += a.slices;
    play.log.push({ kind: 'acorn', item: a.id, slices: a.slices });
  }
  return play;
}

// ---------------------------------------------------------------------------
// Gear (Milestone 6)

/** The effects of a kind from the gear the ball holds. */
/** A course with a boss on it (Milestone 7): the exit opens when the boss is defeated. */
export function hasBoss(course: Course): boolean {
  return course.objects.some((o) => {
    const d = OBJECTS.get(o.id);
    return d?.kind === 'enemy' && d.behaviour.kind === 'boss';
  });
}

/**
 * An enemy as placed on the course or summoned by a boss. Region toughness is
 * added to its stats; a boss takes the region's boss health instead of the
 * toughness on health.
 */
function newEnemy(play: PlayState, opts: PlayOptions, def: EnemyDef, o: CourseObject, uid: string, cx: number, cy: number, z: number, minion = false): EnemyState {
  const boss = def.behaviour.kind === 'boss';
  const es = new StatSheet(def.stats);
  for (const m of opts.enemyModifiers ?? []) if (!(boss && m.stat === 'health')) es.add(m);
  // Milestone 8: rank, traits and carried gear, as modifiers (FEATURES.md section 1).
  const x = o.extras;
  const rank = rankDef(x.rank);
  const forever = { kind: 'forever' } as const;
  if (rank) es.add({ stat: 'health', op: 'add', amount: rank.extraHealth, source: { kind: 'rank', id: rank.name }, duration: forever });
  if (x.traits.includes('armoured')) es.add({ stat: 'health', op: 'add', amount: TRAIT_RULES.armouredHealth, source: { kind: 'trait', id: 'armoured' }, duration: forever });
  const carried = x.gear ? GEAR.get(x.gear) : undefined;
  if (carried) {
    const bonus = ENEMY_GEAR.bonus[carried.category];
    for (const stat of ['attackDamage', 'health'] as const) if (bonus[stat]) es.add({ stat, op: 'add', amount: bonus[stat], source: { kind: 'gear', id: carried.id }, duration: forever });
  }
  if (boss && opts.bossHealth !== undefined) es.add({ stat: 'health', op: 'add', amount: opts.bossHealth - es.get('health'), source: { kind: 'region', id: 'boss' }, duration: { kind: 'forever' } });
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
    // A boss acts from the start of the fight (Milestone 7 sheet section 2.2).
    activated: boss,
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
    minion,
    slamMark: null,
    phase: 0,
    hitShot: -1,
    hitsInShot: 0,
    element: null,
    weakTo: [...def.weakTo],
    resists: [...def.resists],
    weakSpots: [...def.weakSpots],
    guardedSides: [...def.guardedSides],
    shield: def.shield || x.traits.includes('shielded'),
    rank: x.rank,
    traits: x.traits,
    gear: x.gear,
    stars: def.kind === 'enemy' && (x.rank || x.gear) ? enemyStarValue(o) : def.starValue,
    speedMul: x.traits.includes('swift') ? TRAIT_RULES.swiftSpeed : 1,
    scorched: false,
    bossTurns: 0,
    windup: null,
    chargeAt: null,
    shellOpenShot: -1,
    globMarks: [],
    ringMark: null,
  };
  setElement(e, x.element ?? def.element);
  if (x.spot) {
    const sp = SPOTS[x.spot];
    if (sp.weak && !e.weakSpots.includes(sp.weak)) e.weakSpots.push(sp.weak);
    if (sp.guarded && !e.guardedSides.includes(sp.guarded)) e.guardedSides.push(sp.guarded);
  }
  if (path) placeOnPath(play, e);
  return e;
}

/** Give an enemy an element (its entry's, or a squad theme's): its weakness and resistance come with it (owner, 2026-11-19: a circle). */
function setElement(e: EnemyState, el: Element | null): void {
  e.element = el;
  if (!el) return;
  const r = ELEMENT_RULES[el];
  if (!e.weakTo.includes(r.weakTo)) e.weakTo.push(r.weakTo);
  if (!e.resists.includes(r.resists)) e.resists.push(r.resists);
}

export function gearFx<K extends GearEffect['kind']>(play: PlayState, kind: K): Extract<GearEffect, { kind: K }>[] {
  const out: Extract<GearEffect, { kind: K }>[] = [];
  for (const c of GEAR_CATEGORIES) {
    const id = play.gear[c];
    if (!id) continue;
    for (const fx of GEAR.get(id)?.effects ?? []) if (fx.kind === kind) out.push(fx as Extract<GearEffect, { kind: K }>);
  }
  return out;
}

/** The item held that has an effect of this kind (for messages). */
function gearWith(play: PlayState, kind: GearEffect['kind']): string {
  for (const c of GEAR_CATEGORIES) {
    const id = play.gear[c];
    if (id && GEAR.get(id)?.effects.some((fx) => fx.kind === kind)) return id;
  }
  return '';
}

/** Take an item off: its modifiers go with it. Health and shots stay inside the new limits. */
function unequip(play: PlayState, c: GearCategory): void {
  const id = play.gear[c];
  if (!id) return;
  play.stats.removeSource({ kind: 'gear', id });
  play.gear[c] = null;
  play.health = Math.min(play.health, play.stats.get('maxHealth'));
  play.shots = Math.min(play.shots, play.stats.get('maxShots'));
}

/** Put an item on (replacing the one in its category). Returns the id it replaced, or null. */
export function equipGear(play: PlayState, id: string): string | null {
  const g = GEAR.get(id);
  if (!g) return null;
  const old = play.gear[g.category];
  unequip(play, g.category);
  play.gear[g.category] = id;
  for (const m of g.modifiers) play.stats.add({ ...m, source: { kind: 'gear', id }, duration: { kind: 'equipped' } });
  return old;
}

/** How many damages the held armour still ignores on this course. */
export function shieldsLeft(play: PlayState): number {
  return Math.max(0, gearFx(play, 'ignoreDamage').reduce((n, fx) => n + fx.count, 0) - play.shieldsUsed);
}

/** Rolling over a gear item swaps it in; the old item drops on the same spot, briefly locked (sheet section 5.1). */
function collectGear(play: PlayState): void {
  const b = ballNow(play);
  const r = play.tuning.ballRadius;
  for (const it of play.gearItems) {
    if (it.taken || play.clock < it.lockUntil) continue;
    if (Math.hypot(b.x - it.x, b.y - it.y, b.z + r - (it.z + r)) > RULES.touchReach) continue;
    it.taken = true;
    const dropped = equipGear(play, it.item);
    if (dropped) {
      const n = play.gearItems.length;
      play.gearItems.push({ uid: `gear-drop:${n}`, item: dropped, x: it.x, y: it.y, z: it.z, taken: false, lockUntil: play.clock + steps(RULES.gearRelock) });
    }
    play.log.push({ kind: 'gearEquipped', item: it.item, dropped });
    return;
  }
}

/** Testing aid (the U panel): finish the course at once, as if the ball had dropped into the exit. */
export function debugWin(play: PlayState): void {
  if (play.status !== 'playing') return;
  play.shot = null;
  play.status = 'won';
  play.stats.endScope('course');
  play.log.push({ kind: 'won' });
}

/** How high a patroller floats (the Glowmoth, Milestone 8). */
export function floatOf(e: EnemyState): number {
  return e.def.behaviour.kind === 'patrol' ? (e.def.behaviour.float ?? 0) : 0;
}

function placeOnPath(play: PlayState, e: EnemyState): void {
  if (!e.path) return;
  const p = pathAt(e.path, e.pathDist);
  e.x = p.x;
  e.y = p.y;
  e.z = heightAt(play.course, p.x, p.y) + floatOf(e);
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
    if ((m.def.motion.kind === 'gate' || m.def.motion.kind === 'linked') && m.open) continue;
    out.push({ id: m.uid, x: m.x, y: m.y, base: m.z, height: m.def.height, shape: m.shape, bounce: m.def.bounce, vx: m.vx, vy: m.vy, knock: m.def.knock });
  }
  for (const b of play.breakables) {
    if (!b.broken && b.def.shape) out.push({ id: b.uid, x: b.x, y: b.y, base: b.z, height: b.def.height, shape: b.def.shape, bounce: b.def.bounce });
  }
  for (const e of play.enemies) {
    if (!standing(e)) continue;
    const knock = e.def.behaviour.kind === 'patrol' ? e.def.behaviour.knock : 0;
    const gim = e.def.behaviour.kind === 'boss' ? BOSSES.get(e.def.behaviour.boss)?.gimmick : null;
    const bounce = gim?.kind === 'shell' && !shellIsOpen(play, e) ? gim.closedBounce : e.def.bounce;
    out.push({ id: e.uid, x: e.x, y: e.y, base: e.z, height: e.def.height, shape: e.def.shape, bounce, vx: e.vx, vy: e.vy, knock });
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
  // A defeated enemy never holds up a turn (a Mole defeated while rumbling would otherwise wait forever).
  return !play.shot && play.seeds.length === 0 && play.blasts.length === 0 && play.enemies.every((e) => e.defeated || (!e.body && e.popAt === null && e.chargeAt === null));
}

export function canShoot(play: PlayState): boolean {
  return play.status === 'playing' && play.phase === 'aim' && settled(play) && play.shots > 0;
}

/** Shot power and bounce boost from the stat sheet. */
function scales(play: PlayState) {
  return {
    power: play.stats.get('shotPower') * (inWater(play) ? play.tuning.waterShotPower : 1),
    boost: play.stats.get('bounceBoost'),
    frozen: play.frozen,
    iceRoll: ballIceRoll(play),
    gravity: play.stats.get('gravity'),
    windX: play.stats.get('windX'),
    windY: play.stats.get('windY'),
  };
}

/** A course modifier as stat modifiers on the ball (round 2b sheet section 3). Wind blows along its direction. */
export function courseModModifiers(mod: CourseMod | null): Modifier[] {
  const def = mod ? COURSE_MODS.get(mod.id) : undefined;
  if (!def) return [];
  const source = { kind: 'course' as const, id: def.id };
  const out: Modifier[] = def.stats.map((m) => ({ ...m, source, duration: { kind: 'course' } }));
  const accel = windAccel(mod!);
  if (accel && mod!.dir) {
    const [dx, dy] = DIRECTION_VECTORS[mod!.dir];
    if (dx) out.push({ stat: 'windX', op: 'add', amount: dx * accel, source, duration: { kind: 'course' } });
    if (dy) out.push({ stat: 'windY', op: 'add', amount: dy * accel, source, duration: { kind: 'course' } });
  }
  return out;
}

/** The resting ball is in water: its next shot is weaker (owner, 2026-11-15). */
export function inWater(play: PlayState): boolean {
  const g = groundAt(play.course, play.ball.x, play.ball.y);
  return !!g && !!SURFACES.get(surfaceOf({ frozen: play.frozen }, g.tile))?.sinks;
}

function newMotion(play: PlayState, s: ShotState): void {
  s.frozen = play.frozen;
  s.iceRoll = ballIceRoll(play);
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
  const s = play.shot!;
  ballTurnTaken(play);
  return s;
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
  stepBlasts(play);
  if (play.status !== 'playing') return;
  stepCharges(play);
  play.world.obstacles = obstaclesOf(play);
  knockRestingBall(play);
  if (play.shot) stepBall(play, input);
  if (play.status !== 'playing') return;
  pressSwitches(play);
  stepBodies(play);
  meetBodies(play);
  zapClouds(play);
  passByTriggers(play);
  updateFlags(play);
  collectPickups(play);
  collectGear(play);
  waterPutsOut(play);
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
    if (!hasStatus(e.statuses, 'stunned') && !cannotMove(e)) e.pathDist += e.def.behaviour.speed * e.speedMul * DT;
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
    } else if (m.def.motion.kind === 'linked') {
      // Round 2b: closed until its switch is pressed, then open for good.
      m.open = !!(m.link && play.linksOn[m.link]);
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
  steerBall(play, s, input);
  const before = s.events.length;
  stepShot(play.course, play.tuning, s, input.boost ? { boost: true } : {}, play.world);
  for (const e of s.events.slice(before)) {
    if (e.kind === 'hazard') damageBall(play, RULES.spikeDamage, 'spikes');
    else if (e.kind === 'anchorStop') anchorEffects(play, e.x, e.y);
  }
  if (play.status !== 'playing') return;
  stepAura(play, s);
  if (play.status !== 'playing') return;
  if (tor && s.hover) {
    if (Math.hypot(s.ball.vx, s.ball.vy) > 1e-6) tor.heading = Math.atan2(s.ball.vy, s.ball.vx);
    if (--tor.stepsLeft <= 0) {
      const fx = ABILITIES.get('tornado')!.effect;
      endHover(play.course, s, fx.kind === 'tornado' ? fx.endKeep : 0.5);
      play.tornado = null;
    }
  }
  endSteering(play, s);
  checkExit(play, s);
}

/**
 * Gyre turns the ball's heading with Left/Right; Drift moves the floating ball
 * in screen directions (round 2b sheet sections 1.3 and 1.4).
 */
function steerBall(play: PlayState, s: ShotState, input: TickInput): void {
  const st = play.steering;
  if (!st) return;
  const b = s.ball;
  const fx = ABILITIES.get(st.kind)!.effect;
  if (fx.kind === 'gyre') {
    const turn = ((input.steer ?? 0) * fx.turnRate * Math.PI * DT) / 180;
    if (turn) {
      const c = Math.cos(turn);
      const sn = Math.sin(turn);
      const vx = b.vx * c - b.vy * sn;
      b.vy = b.vx * sn + b.vy * c;
      b.vx = vx;
    }
  } else if (fx.kind === 'drift' && s.hover) {
    // Screen right is grid (+1, -1); screen down is grid (+1, +1) (iso.ts).
    const mx = input.move?.x ?? 0;
    const my = input.move?.y ?? 0;
    let gx = mx + my;
    let gy = -mx + my;
    const len = Math.hypot(gx, gy);
    if (len > 0) {
      gx /= len;
      gy /= len;
    }
    b.vx = gx * fx.speed;
    b.vy = gy * fx.speed;
  }
}

/**
 * Round 2b (sheet section 2): a ball on the ground over a switch presses it.
 * It stays on: linked gates open (moveThings) and drawbridges come down.
 */
function pressSwitches(play: PlayState): void {
  if (!play.switches.length) return;
  const b = ballNow(play);
  const g = groundAt(play.course, b.x, b.y);
  if (!g || b.z > g.h + 0.05) return;
  for (const sw of play.switches) {
    if (sw.on || Math.hypot(b.x - sw.x, b.y - sw.y) > sw.def.reach) continue;
    sw.on = true;
    play.linksOn[sw.link] = true;
    play.log.push({ kind: 'switchOn', link: sw.link, x: sw.x, y: sw.y });
    lowerDrawbridges(play, sw.link);
  }
}

/** The drawbridge tiles with this link come down: each becomes plank bridge, raised to the bridge's height. */
function lowerDrawbridges(play: PlayState, link: string): void {
  const down = play.drawbridges.filter((d) => d.link === link && !d.down);
  if (!down.length) return;
  const tiles = play.course.tiles.slice();
  for (const d of down) {
    d.down = true;
    const k = d.ty * play.course.width + d.tx;
    const t = tiles[k];
    if (!t) continue;
    const corners = t.corners.map((h) => h + d.def.rise) as unknown as typeof t.corners;
    tiles[k] = { ...t, surface: d.def.surface, corners, base: t.base + d.def.rise };
  }
  play.course = { ...play.course, tiles };
  play.log.push({ kind: 'bridgeDown', link });
}

/** Gyre and Drift count down; Drift then drops straight down with no speed. */
function endSteering(play: PlayState, s: ShotState): void {
  const st = play.steering;
  if (!st || --st.stepsLeft > 0) return;
  if (st.kind === 'drift' && s.hover) endHover(play.course, s, 0);
  play.steering = null;
}

/** The ball's motion ended: rest, sink, fall out, or drop into the exit. */
function finishBallMotion(play: PlayState): void {
  const s = play.shot!;
  const outcome = s.outcome;
  play.shot = null;
  play.tornado = null;
  play.steering = null;
  play.aura = null;
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
    if (g && SURFACES.get(surfaceOf({ frozen: play.frozen }, g.tile))?.canHoldBall) play.restSpot = { ...play.ball };
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

/**
 * The ball takes damage. Owner, 2026-11-14: then it is immune for half a
 * second. `attacker` is the enemy that did it (its contact, its attack or its
 * seed), for the Guard family and Mirror Plate.
 */
function damageBall(play: PlayState, amount: number, cause: Extract<PlayEvent, { kind: 'damage' }>['cause'], attacker?: EnemyState): void {
  if (amount <= 0 || play.status !== 'playing' || play.clock < play.immuneUntil) return;
  // Storm Cloak, Cork Plate: some kinds of damage cannot hurt the ball at all.
  if (gearFx(play, 'immune').some((fx) => (fx.causes as readonly string[]).includes(cause))) {
    play.log.push({ kind: 'resisted', item: gearWith(play, 'immune'), cause });
    return;
  }
  if ((cause === 'sunk' || cause === 'out') && gearFx(play, 'safeFalls').length) {
    play.log.push({ kind: 'resisted', item: gearWith(play, 'safeFalls'), cause });
    return;
  }
  play.immuneUntil = play.clock + steps(RULES.damageImmunity);
  // Guard family and Mirror Plate: the enemy that did it is hurt back (even if the Lining then ignores the damage).
  if (attacker && !attacker.defeated) {
    let back = 0;
    let stun = false;
    for (const fx of gearFx(play, 'thorns')) {
      back += fx.damage;
      stun ||= fx.stun;
    }
    if (cause === 'seed' && gearFx(play, 'mirror').length) back += amount;
    if (back > 0) {
      play.log.push({ kind: 'thorns', enemy: attacker.uid, damage: back });
      hurtEnemy(play, attacker, back);
      if (stun && !attacker.defeated) applyEnemyStatus(play, attacker, 'stunned');
    }
  }
  if (shieldsLeft(play) > 0) {
    play.shieldsUsed++;
    play.log.push({ kind: 'shielded', item: gearWith(play, 'ignoreDamage') });
    return;
  }
  play.health = Math.max(0, play.health - amount);
  play.log.push({ kind: 'damage', amount, cause });
  // Milestone 8: an enemy with an element (or a contact status, the Bristlecrawler's poison) passes it on.
  if (attacker && play.health > 0) {
    if (attacker.element) applyBallStatus(play, ELEMENT_RULES[attacker.element].contactStatus);
    if (attacker.def.contactStatus) applyBallStatus(play, attacker.def.contactStatus);
  }
  const phoenix = gearFx(play, 'phoenix')[0];
  if (play.health <= 0 && phoenix) {
    // Phoenix Plate: stay alive, and the plate crumbles.
    const item = gearWith(play, 'phoenix');
    const cat = GEAR.get(item)!.category;
    unequip(play, cat);
    play.health = Math.min(play.stats.get('maxHealth'), phoenix.health);
    play.log.push({ kind: 'phoenix', item, health: play.health });
    return;
  }
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
  // Owner, 2026-11-21: a closed gate is sharp on top. Clearing it is the risk: touch it in the air and it hurts.
  const m = play.movers.find((x) => x.uid === o.id);
  if (m?.def.spikedTop && !m.open && !s.ball.grounded) {
    play.log.push({ kind: 'gateSpikes' });
    damageBall(play, RULES.spikeDamage, 'spikes');
  }
  return (o.knock ?? 0) > 0 ? 'knock' : 'bounce';
}

/**
 * The hit's own damage and element: the Tornado deals its own number; Burner
 * hits are fire; otherwise the weapon's element, if it has one (Milestone 6).
 */
function hitStats(play: PlayState, s: ShotState): { base: number; element: AbilityDef['element'] } {
  const weapon = play.gear.weapon ? (GEAR.get(play.gear.weapon)?.element ?? null) : null;
  if (s.hover) {
    const fx = ABILITIES.get('tornado')!.effect;
    return { base: fx.kind === 'tornado' ? fx.damage : 1, element: weapon };
  }
  // Owner default (sheet section 3): an active ability's element wins over the weapon's.
  const aura = play.aura ? (ABILITIES.get(play.aura.kind)?.element ?? null) : null;
  const burning = s.burnSteps > 0 ? (ABILITIES.get('burner')?.element ?? null) : null;
  return { base: play.stats.get('hitDamage'), element: burning ?? aura ?? weapon };
}

/** The ball hits an enemy (FEATURES.md section 2). Returns what the ball does next. */
function hitEnemy(play: PlayState, e: EnemyState, s: ShotState): ContactResult {
  if (e.defeated) return 'pass';
  // Owner, 2026-11-14: the ball only damages an enemy during the player's own action (a shot).
  // A ball that was knocked while standing still does no damage and sets off no hit trigger.
  let counted = !play.knocked && play.clock - e.lastHitClock >= steps(RULES.hitCooldown);
  // Milestone 7: a boss takes only so many hits per shot.
  const bossDef = e.def.behaviour.kind === 'boss' ? BOSSES.get(e.def.behaviour.boss) : undefined;
  // Gloamhorn (Milestone 8): its closed shell blocks every hit.
  const gim = bossDef?.gimmick ?? null;
  if (counted && gim?.kind === 'shell' && play.shotNumber > e.shellOpenShot) {
    counted = false;
    e.lastHitClock = play.clock;
    play.log.push({ kind: 'hit', enemy: e.uid, damage: 0, blocked: true });
  }
  if (counted && bossDef) {
    if (e.hitShot !== play.shotNumber) {
      e.hitShot = play.shotNumber;
      e.hitsInShot = 0;
    }
    const limit = gim?.kind === 'shell' ? gim.openHits : bossDef.hitsPerShot;
    if (e.hitsInShot >= limit) counted = false;
    else e.hitsInShot++;
  }
  // The Brood Queen (Milestone 8): her sides bite a ball that runs into them.
  if (gim?.kind === 'crown' && s.ball.grounded && !e.defeated) damageBall(play, gim.biteDamage, 'bite', e);
  if (counted) {
    e.lastHitClock = play.clock;
    const { base: plain, element } = hitStats(play, s);
    const wedge = wedgeOf(s.ball.x, s.ball.y, e.x, e.y, e.fx, e.fy);
    // Gong Knob: extra damage against a stunned enemy (part of step 1, hit damage).
    const base = plain + (hasStatus(e.statuses, 'stunned') ? gearFx(play, 'stunnedBonus').reduce((n, fx) => n + fx.damage, 0) : 0);
    const res = computeHit(
      {
        base,
        element,
        fromAbove: !s.ball.grounded,
        fromBehind: wedge === 'behind',
        fromFront: wedge === 'front',
      },
      { weakTo: e.weakTo, resists: e.resists, weakSpots: e.weakSpots, guardedSides: e.guardedSides, shieldUp: e.shield && e.shieldMotion !== play.motion },
    );
    if (res.shieldUsed) e.shieldMotion = play.motion;
    // Stinkpuff (Milestone 8): hit, it puffs at once, unless the ball came down on its back.
    if (e.def.behaviour.kind === 'pulse' && s.ball.grounded) puff(play, e, e.def.behaviour.hitRadius);
    // Echo Shell: the first hit each shot counts twice.
    // Owner, 2026-11-17: one success roll, on the first hit each shot.
    let echo = false;
    if (res.damage > 0 && gearFx(play, 'echo').length > 0 && play.echoShot !== play.shotNumber) {
      play.echoShot = play.shotNumber;
      echo = successRoll(play, e, 'echo');
      if (echo) play.log.push({ kind: 'echo' });
    }
    let damage = res.damage * (echo ? 2 : 1);
    // Chilled (Milestone 8): the next hit that does damage does double, and ends the chill.
    const chill = damage > 0 ? e.statuses.find((st) => STATUSES.get(st.id)?.nextHitDouble) : undefined;
    if (chill) {
      damage *= 2;
      endEnemyStatus(play, e, chill.id);
    }
    e.health = Math.max(0, e.health - damage);
    play.log.push({ kind: 'hit', enemy: e.uid, damage, blocked: res.blocked });
    // Owner, 2026-11-15: every hit that does damage gives a shot back, up to the shot allowance.
    if (damage > 0) gainShots(play, RULES.shotsPerHit * (echo ? 2 : 1));
    if (damage > 0) weaponEffects(play, e, s);
    // Owner, 2026-11-18 (question 9): the Burner burns what it hits for 1 turn, with no success roll.
    if (damage > 0 && s.burnSteps > 0 && e.health > 0) applyEnemyStatus(play, e, 'burning', BURNER_BURN_TURNS);
    if (damage > 0) abilityHitEffects(play, e);
    if (e.health <= 0) defeat(play, e);
    else if (!e.defeated) {
      bossPhaseCheck(play, e);
      respond(play, e, 'hit');
    }
  }
  if (e.defeated) {
    // Wrecking Shell: defeats never slow the ball.
    if (gearFx(play, 'rollThrough').length) return 'passFree';
    const burn = ABILITIES.get('burner')!.effect;
    const passTier = burn.kind === 'burn' ? burn.passTier : 1;
    return s.burnSteps > 0 && e.def.tier <= passTier ? 'passFree' : 'pass';
  }
  if (e.def.contact === 'survives') {
    damageBall(play, e.stats.get('attackDamage'), 'enemy', e);
    return e.def.behaviour.kind === 'patrol' ? 'knock' : 'bounce';
  }
  // Trapjaw (Milestone 8): its front bites a ball that runs into it, unless the ball comes down from above.
  if (e.def.contact === 'front' && s.ball.grounded && wedgeOf(s.ball.x, s.ball.y, e.x, e.y, e.fx, e.fy) === 'front') damageBall(play, e.stats.get('attackDamage'), 'bite', e);
  return 'bounce';
}

/** Gloamhorn's shell is open now, or will be for the shot being aimed (Milestone 8). */
export function shellIsOpen(play: PlayState, e: EnemyState): boolean {
  return play.shotNumber + (play.phase === 'aim' ? 1 : 0) <= e.shellOpenShot;
}

/** Bosses use the boss wheel (owner, 2026-11-17). Bosses are tier 5 (FEATURES.md section 4). */
export function isBoss(e: EnemyState): boolean {
  return e.def.tier >= BOSS_TIER;
}

/**
 * How a success roll on this enemy would go: filled slices and wheel size
 * (owner, 2026-11-17; Milestone 7 sheet section 4b). Filled = the weapon's
 * slices + every-wheel slices (Knack, Spinners) + boss-wheel slices on a boss
 * + acorns this course + Hot Streak this shot, at most the wheel's size.
 */
export function wheelFor(play: PlayState, e: EnemyState): { filled: number; size: number } {
  const weapon = play.gear.weapon ? GEAR.get(play.gear.weapon) : undefined;
  const boss = isBoss(e);
  const bossSize = Math.min(RULES.bossWheelSlices, ...gearFx(play, 'bossWheel').map((fx) => fx.slices));
  const size = boss ? bossSize : RULES.wheelSlices;
  const streak = play.streakShot === play.shotNumber ? play.streak : 0;
  const filled = (weapon?.slices ?? 0) + play.stats.get('rollSlices') + (boss ? play.stats.get('bossSlices') : 0) + play.acornSlices + streak;
  return { filled: Math.max(0, Math.min(size, filled)), size };
}

/** Spin the wheel for one weapon effect. Fortune's Mail spins a failed roll again; Hot Streak Charm adds a slice per success this shot. */
function successRoll(play: PlayState, e: EnemyState, effect: RollEffect): boolean {
  const spin = (respun: boolean): boolean => {
    const { filled, size } = wheelFor(play, e);
    const success = play.rng.int(0, size - 1) < filled;
    play.log.push({ kind: 'roll', enemy: e.uid, effect, filled, size, success, respun });
    return success;
  };
  let ok = spin(false);
  const respins = gearFx(play, 'respin').reduce((n, fx) => n + fx.count, 0);
  if (!ok && play.respinsUsed < respins) {
    play.respinsUsed++;
    ok = spin(true);
  }
  if (ok && gearFx(play, 'hotStreak').length) {
    if (play.streakShot !== play.shotNumber) {
      play.streakShot = play.shotNumber;
      play.streak = 0;
    }
    play.streak++;
  }
  return ok;
}

/** What the active ability does to an enemy it hits (Milestone 8: Frost chills). Filled in with the new abilities. */
function abilityHitEffects(play: PlayState, e: EnemyState): void {
  if (play.aura?.kind !== 'frost' || e.health <= 0) return;
  const fx = ABILITIES.get('frost')!.effect;
  if (fx.kind === 'frost') applyEnemyStatus(play, e, 'chilled', fx.chillTurns);
}

/** What the weapon does on a damaging hit (Milestone 6), before the enemy is checked for defeat. */
function weaponEffects(play: PlayState, e: EnemyState, s: ShotState): void {
  const alive = e.health > 0;
  // Owner, 2026-11-17: each special effect works only on a successful roll (Milestone 7 sheet section 4b).
  for (const fx of gearFx(play, 'burn')) if (alive && successRoll(play, e, 'burn')) applyEnemyStatus(play, e, 'burning', fx.turns);
  // Round 3 (owner, 2026-11-22): the Needle family.
  for (const fx of gearFx(play, 'poison')) if (alive && successRoll(play, e, 'poison')) applyEnemyStatus(play, e, 'poisoned', fx.turns);
  if (gearFx(play, 'stun').length && alive && successRoll(play, e, 'stun')) applyEnemyStatus(play, e, 'stunned');
  for (const fx of gearFx(play, 'leech')) {
    if (play.leechShot === play.shotNumber) break;
    play.leechShot = play.shotNumber;
    if (!successRoll(play, e, 'heal')) break;
    const before = play.health;
    play.health = Math.min(play.stats.get('maxHealth'), play.health + fx.heal);
    if (play.health > before) play.log.push({ kind: 'healed', amount: play.health - before, item: gearWith(play, 'leech') });
  }
  for (const fx of gearFx(play, 'chainZap')) {
    if (!successRoll(play, e, 'zap')) continue;
    let best: EnemyState | null = null;
    let bestD = fx.range;
    for (const o of play.enemies) {
      if (o === e || o.defeated || o.burrowed) continue;
      const d = Math.hypot(o.x - e.x, o.y - e.y);
      if (d <= bestD) {
        best = o;
        bestD = d;
      }
    }
    if (best) {
      play.log.push({ kind: 'chainZap', enemy: best.uid });
      hurtEnemy(play, best, fx.damage);
    }
  }
  for (const fx of gearFx(play, 'knockBack')) {
    // Patrollers keep to their path, and a Mole underground cannot be moved.
    if (!alive || e.def.behaviour.kind === 'patrol' || !standing(e)) continue;
    if (!successRoll(play, e, 'knock')) continue;
    const b = s.ball;
    const dx = e.x - b.x;
    const dy = e.y - b.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const speed = rollSpeedFor(play.tuning, fx.distance);
    launchEnemy(play, e, (dx / d) * speed, (dy / d) * speed);
  }
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
  // Owner, 2026-11-17: rare blue stars and acorns.
  const luck = play.stats.get('dropLuck');
  if (b.def.blueStarChance > 0 && play.rng.chance(b.def.blueStarChance * luck)) dropPickup(play, 'blue-star', b.x, b.y, `${b.uid}:blue`);
  if (b.def.acornChance > 0 && play.rng.chance(b.def.acornChance * luck)) {
    const w = acornWeights(play.rarityWeights);
    dropPickup(play, ACORN_LIST[play.rng.weighted(w)]!.id, b.x, b.y, `${b.uid}:acorn`);
  }
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
  e.slamMark = null;
  play.log.push({ kind: 'defeat', enemy: e.uid, stars: e.stars });
  addStars(play, e.stars, e.x, e.y);
  traitsOnDefeat(play, e);
  // Golden Tooth: extra stars in the wallet only.
  for (const fx of gearFx(play, 'starPerDefeat')) play.wallet += fx.stars;
  // Sunfire Crown: a burning enemy bursts when defeated.
  if (hasStatus(e.statuses, 'burning')) {
    for (const fx of gearFx(play, 'burst')) {
      play.log.push({ kind: 'burst', enemy: e.uid });
      for (const o of play.enemies) if (o !== e && !o.defeated && !o.burrowed && Math.hypot(o.x - e.x, o.y - e.y) <= fx.radius) hurtEnemy(play, o, fx.damage);
    }
  }
  if (e.def.behaviour.kind === 'boss') bossDefeated(play, e);
  // Owner, 2026-11-17: a boss's minions leave no flag pole (and neither does the boss).
  const boss = bossDefOf(play, e);
  if (e.def.behaviour.kind === 'boss' || (e.minion && !(boss?.minionsLeaveFlag ?? false))) {
    if (e.def.grantsAbility) giveAbility(play, e.def.grantsAbility, false);
    play.world.obstacles = obstaclesOf(play);
    return;
  }
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

// ---------------------------------------------------------------------------
// Traits, rank and carried gear on defeat (Milestone 8 sheet sections 4 and 5)

function traitsOnDefeat(play: PlayState, e: EnemyState): void {
  if (e.traits.includes('explosive')) {
    play.blasts.push({ uid: `blast:${e.uid}`, x: e.x, y: e.y, z: e.z, at: play.clock + steps(TRAIT_RULES.blast.fuse) });
    play.log.push({ kind: 'fuse', enemy: e.uid, x: e.x, y: e.y, r: TRAIT_RULES.blast.radius });
  }
  if (e.traits.includes('splitting')) split(play, e);
  const luck = play.stats.get('dropLuck');
  if (e.gear && play.rng.chance(ENEMY_GEAR.dropChance * luck)) {
    play.gearItems.push({ uid: `gear-enemy:${e.uid}`, item: e.gear, x: e.x, y: e.y, z: heightAt(play.course, e.x, e.y), taken: false, lockUntil: 0 });
    play.log.push({ kind: 'gearDrop', enemy: e.uid, item: e.gear });
  }
  const rank = rankDef(e.rank);
  if (rank && rank.blueStarChance > 0 && play.rng.chance(rank.blueStarChance * luck)) dropPickup(play, 'blue-star', e.x, e.y, `${e.uid}:blue`);
}

/** Splitting: two small bugs pop out to either side (they do not split again). */
function split(play: PlayState, e: EnemyState): void {
  const def = OBJECTS.get(TRAIT_RULES.splitInto);
  if (def?.kind !== 'enemy') return;
  for (let k = 0; k < TRAIT_RULES.splitCount; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    // To either side of the way it faced.
    let cx = e.x - e.fy * side * TRAIT_RULES.splitOffset;
    let cy = e.y + e.fx * side * TRAIT_RULES.splitOffset;
    const t = tileAt(play.course, Math.floor(cx), Math.floor(cy));
    if (!t || !SURFACES.get(surfaceOf({ frozen: play.frozen }, t))?.canHoldBall) {
      cx = e.x + side * 0.35;
      cy = e.y;
    }
    const o: CourseObject = { id: def.id, x: Math.floor(cx), y: Math.floor(cy), path: [], facing: e.place.facing, phase: 0, orient: 'x', drops: null, extras: NO_EXTRAS, link: null };
    const uid = `split:${e.uid}:${k}`;
    play.enemies.push(newEnemy(play, { seed: play.seed, enemyModifiers: play.enemyModifiers }, def, o, uid, cx, cy, heightAt(play.course, cx, cy)));
    play.log.push({ kind: 'split', enemy: e.uid, into: uid });
  }
}

/**
 * An Explosive blast goes off (owner, 2026-11-19, option A): it hurts the ball
 * and pushes it away; it hurts other enemies but never defeats one (they stop
 * at 1 health), so blasts cannot chain; it wakes sentinels; it cracks crates.
 * Bosses are not hurt. No shots back.
 */
function goOff(play: PlayState, bl: BlastState): void {
  const R = TRAIT_RULES.blast;
  play.log.push({ kind: 'blast', uid: bl.uid, x: bl.x, y: bl.y, r: R.radius });
  const b = ballNow(play);
  const d = Math.hypot(b.x - bl.x, b.y - bl.y);
  if (d <= R.radius && b.z <= bl.z + R.radius) {
    damageBall(play, R.damage, 'blast');
    if (play.status !== 'playing') return;
    const s = ensureBallMoving(play);
    const a = d > 1e-3 ? Math.atan2(b.y - bl.y, b.x - bl.x) : play.rng.float(0, Math.PI * 2);
    s.ball.vx = Math.cos(a) * R.knockSpeed;
    s.ball.vy = Math.sin(a) * R.knockSpeed;
    s.ball.vz = R.knockHop;
    s.ball.grounded = false;
    s.ball.z += 0.001;
    s.restSteps = 0;
  }
  for (const o of play.enemies) {
    if (o.defeated || o.burrowed || isBoss(o) || Math.hypot(o.x - bl.x, o.y - bl.y) > R.radius) continue;
    if (o.health > 1) {
      const dmg = Math.min(R.damage, o.health - 1);
      o.health -= dmg;
      o.scorched = true;
      play.log.push({ kind: 'hit', enemy: o.uid, damage: dmg, blocked: false });
    }
    wake(play, o);
  }
  for (const c of play.breakables) {
    if (c.broken || c.def.breakBy !== 'hit' || Math.hypot(c.x - bl.x, c.y - bl.y) > R.radius) continue;
    c.health = Math.max(0, c.health - R.damage);
    if (c.health <= 0) breakIt(play, c);
    else play.log.push({ kind: 'crateHit', uid: c.uid });
  }
}

/** Blasts whose fuse has burnt down go off. */
function stepBlasts(play: PlayState): void {
  if (!play.blasts.length) return;
  const due = play.blasts.filter((b) => play.clock >= b.at);
  if (!due.length) return;
  play.blasts = play.blasts.filter((b) => play.clock < b.at);
  for (const bl of due) {
    goOff(play, bl);
    if (play.status !== 'playing') return;
  }
}

/** A sentinel that something woke (a blast): it starts acting on enemy turns, as if hit, without acting at once. */
function wake(play: PlayState, e: EnemyState): void {
  if (e.defeated || e.activated || e.def.triggers.hit === 'none' || !actsOnTurns(e)) return;
  e.activated = true;
  play.log.push({ kind: 'activated', enemy: e.uid });
}

/** Stars to the meter and the wallet. Crown of Plenty doubles the wallet's share, except for a raised flag (its star was already counted once). */
/**
 * Food eaten on the course (round 2a; owner, 2026-11-21): it works at once for
 * the rest of this course, which counts as its first. What lasts longer is
 * kept by the run afterwards (play.foods). Garlic's countdown raise is done by
 * the run.
 */
function eatFoodNow(play: PlayState, id: string, auto: boolean): void {
  const f = FOODS.get(id);
  if (!f) return;
  if (f.kind === 'acorn') {
    const a = ACORNS.get(id);
    if (a) {
      play.acornSlices += a.slices;
      play.log.push({ kind: 'acorn', item: a.id, slices: a.slices });
    }
  } else if (f.kind === 'heal') {
    play.health = Math.min(play.stats.get('maxHealth'), play.health + FOOD.appleHeal);
  } else if (f.kind === 'stat') {
    const u = UPGRADES.get(id);
    if (u) {
      play.stats.add({ stat: u.stat, op: u.op, amount: u.amount, source: { kind: 'run', id: `food-now:${id}:${play.foods.length}` }, duration: { kind: 'run' } });
      play.health = Math.min(play.stats.get('maxHealth'), play.health + u.heal);
    }
  }
  play.foods.push({ id, eaten: true });
  play.log.push({ kind: 'foodEaten', item: id, auto });
}

/** The player's answer for the oldest food waiting: eat it now, or put it in the bag. */
export function decideFood(play: PlayState, eatIt: boolean): void {
  const id = play.foodPending.shift();
  if (!id) return;
  if (eatIt || play.bagRoom <= 0) eatFoodNow(play, id, !eatIt);
  else {
    play.bagRoom--;
    play.foods.push({ id, eaten: false });
    play.log.push({ kind: 'foodStashed', item: id });
  }
}

/** Food still waiting for an answer when the course ends goes in the bag if it fits, otherwise it is eaten. */
export function settleFood(play: PlayState): void {
  while (play.foodPending.length) decideFood(play, false);
}

function addStars(play: PlayState, n: number, x: number, y: number, fromFlag = false): void {
  const wallet = !fromFlag && gearFx(play, 'walletDouble').length ? 2 : 1;
  for (let i = 0; i < n; i++) {
    play.wallet += wallet;
    play.meter++;
    play.log.push({ kind: 'star', x, y });
  }
  if (!play.exitOpen && !play.bossExit && play.meter >= play.quota) {
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
  else bossPhaseCheck(play, e);
}

// ---------------------------------------------------------------------------
// Bosses (Milestone 7 sheet section 2)

/** The boss entry (bosses.ts) for a boss, or for a minion the boss that summoned it. */
function bossDefOf(play: PlayState, e: EnemyState): BossDef | undefined {
  if (e.def.behaviour.kind === 'boss') return BOSSES.get(e.def.behaviour.boss);
  if (!e.minion) return undefined;
  const b = play.enemies.find((x) => x.def.behaviour.kind === 'boss');
  return b && b.def.behaviour.kind === 'boss' ? BOSSES.get(b.def.behaviour.boss) : undefined;
}

/** The phase a boss is in from its health: the first phase whose threshold it is still above. */
export function bossPhaseIndex(e: EnemyState, def: BossDef): number {
  const full = e.stats.get('health');
  const i = def.phases.findIndex((p) => e.health > p.above * full);
  return i < 0 ? def.phases.length - 1 : i;
}

/** After damage: a boss that crossed into a new phase sheds a plate (a heart and a shot orb) and clears its slam ring. */
function bossPhaseCheck(play: PlayState, e: EnemyState): void {
  const def = e.def.behaviour.kind === 'boss' ? BOSSES.get(e.def.behaviour.boss) : undefined;
  if (!def || e.defeated) return;
  const phase = bossPhaseIndex(e, def);
  if (phase <= e.phase) return;
  e.phase = phase;
  e.slamMark = null;
  e.ringMark = null;
  e.globMarks = [];
  e.windup = null;
  e.chargeAt = null;
  play.log.push({ kind: 'phase', enemy: e.uid, phase });
  for (const id of def.shed) dropPickup(play, id, e.x, e.y, `${e.uid}:shed${phase}:${id}`);
}

/**
 * One boss action on an enemy turn, as its phase says: land what it marked
 * last turn, then slam, charge, lob globs or ring the ball, and summon.
 */
function bossAction(play: PlayState, e: EnemyState): void {
  const def = e.def.behaviour.kind === 'boss' ? BOSSES.get(e.def.behaviour.boss) : undefined;
  if (!def) return;
  const phase = def.phases[e.phase]!;
  e.bossTurns++;
  if (e.slamMark) landSlam(play, e, def);
  if (play.status !== 'playing') return;
  // The Brood Queen: last turn's globs and ring land first.
  if (e.globMarks.length) for (const m of e.globMarks.splice(0)) fireGlob(play, e, def, m);
  if (e.ringMark) landRing(play, e, phase);
  if (play.status !== 'playing') return;
  if (phase.slamRadius !== null) {
    const b = ballNow(play);
    e.slamMark = { x: b.x, y: b.y, r: phase.slamRadius };
    play.log.push({ kind: 'slamMark', enemy: e.uid, ...e.slamMark });
  }
  let summonNow = true;
  if (phase.charge && def.charge) {
    if (phase.charge === 'alternate' && e.windup) {
      charge(play, e, def);
      summonNow = false;
    } else {
      windUp(play, e);
      if (phase.charge === 'every') {
        e.chargeAt = play.clock + steps(def.charge.windupSeconds);
        summonNow = false;
      }
    }
  }
  const turnAbout = phase.alternate && phase.globs && phase.ring;
  const doGlobs = !!phase.globs && (!turnAbout || e.bossTurns % 2 === 1);
  const doRing = !!phase.ring && (!turnAbout || e.bossTurns % 2 === 0);
  const b = ballNow(play);
  if (doGlobs && phase.globs) {
    // At the ball's spot and to either side of it, across the line from the boss.
    const dx = b.x - e.x;
    const dy = b.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const px = -dy / d;
    const py = dx / d;
    for (let k = 0; k < phase.globs.count; k++) {
      const off = (k - (phase.globs.count - 1) / 2) * phase.globs.spread;
      e.globMarks.push({ x: b.x + px * off, y: b.y + py * off });
    }
    for (const m of e.globMarks) play.log.push({ kind: 'lobMark', enemy: e.uid, x: m.x, y: m.y });
  }
  if (doRing && phase.ring) {
    e.ringMark = { x: b.x, y: b.y, r: phase.ring.radius };
    play.log.push({ kind: 'ringMark', enemy: e.uid, ...e.ringMark });
  }
  const alive = play.enemies.filter((m) => m.minion && !m.defeated).length;
  if (summonNow && alive < phase.maxMinions && phase.pool.length) summon(play, e, def, phase);
}

/** Gloamhorn turns towards the ball and shows the way it will charge. */
function windUp(play: PlayState, e: EnemyState): void {
  const b = ballNow(play);
  const dx = b.x - e.x;
  const dy = b.y - e.y;
  const d = Math.hypot(dx, dy);
  e.windup = d > 1e-6 ? { dx: dx / d, dy: dy / d } : { dx: e.fx, dy: e.fy };
  e.fx = e.windup.dx;
  e.fy = e.windup.dy;
  play.log.push({ kind: 'windup', enemy: e.uid, dx: e.windup.dx, dy: e.windup.dy });
}

/** Gloamhorn charges along its wind-up line; when it stops, its shell opens for the player's next shot. */
function charge(play: PlayState, e: EnemyState, def: BossDef): void {
  const w = e.windup;
  e.windup = null;
  e.chargeAt = null;
  if (!w || !def.charge) return;
  launchEnemy(play, e, w.dx * def.charge.speed, w.dy * def.charge.speed);
  play.log.push({ kind: 'charge', enemy: e.uid });
}

/** Same-turn charges whose wind-up time is over. */
function stepCharges(play: PlayState): void {
  for (const e of play.enemies) {
    if (e.chargeAt === null || play.clock < e.chargeAt || e.defeated) continue;
    const def = bossDefOf(play, e);
    if (def) charge(play, e, def);
    else e.chargeAt = null;
  }
}

/** An acid glob lobbed at a marked spot (the Brood Queen). */
function fireGlob(play: PlayState, e: EnemyState, def: BossDef, target: { x: number; y: number }): void {
  if (!def.glob) return;
  launchSeed(play, e, target, def.glob.loftAngle, def.glob.radius);
}

/** The soldier ring lands: damage and a status to a ball on the ground inside it (no knock). */
function landRing(play: PlayState, e: EnemyState, phase: BossPhase): void {
  const m = e.ringMark!;
  e.ringMark = null;
  const ring = phase.ring;
  const b = ballNow(play);
  const g = groundAt(play.course, b.x, b.y);
  const hit = !!g && b.z <= g.h + 0.05 && Math.hypot(b.x - m.x, b.y - m.y) <= m.r;
  play.log.push({ kind: 'ring', enemy: e.uid, x: m.x, y: m.y, r: m.r, hit });
  if (!hit || !ring) return;
  damageBall(play, ring.damage, 'ring', e);
  if (play.status === 'playing') applyBallStatus(play, ring.status);
}

/** The slam lands on its ring: a ball on the ground inside it takes damage and is thrown out of the ring. */
function landSlam(play: PlayState, e: EnemyState, def: BossDef): void {
  const m = e.slamMark!;
  e.slamMark = null;
  const b = ballNow(play);
  const g = groundAt(play.course, b.x, b.y);
  const onGround = !!g && b.z <= g.h + 0.05;
  const d = Math.hypot(b.x - m.x, b.y - m.y);
  const hit = onGround && d <= m.r;
  play.log.push({ kind: 'slam', enemy: e.uid, x: m.x, y: m.y, r: m.r, hit });
  if (!hit) return;
  damageBall(play, def.slam.damage, 'slam', e);
  if (play.status !== 'playing') return;
  const s = ensureBallMoving(play);
  // Away from the ring's centre (a random way if the ball is right on it).
  const a = d > 1e-3 ? Math.atan2(b.y - m.y, b.x - m.x) : play.rng.float(0, Math.PI * 2);
  s.ball.vx = Math.cos(a) * def.slam.knockSpeed;
  s.ball.vy = Math.sin(a) * def.slam.knockSpeed;
  s.ball.vz = def.slam.knockHop;
  s.ball.grounded = false;
  s.ball.z += 0.001;
  s.restSteps = 0;
}

/** Summon one minion at a free spawn spot (none if every spot is taken). */
function summon(play: PlayState, boss: EnemyState, def: BossDef, phase: BossPhase): void {
  const b = ballNow(play);
  const free = play.course.spawns.filter((p) => {
    const x = p.x + 0.5;
    const y = p.y + 0.5;
    if (Math.hypot(b.x - x, b.y - y) < def.spawnClear + 0.5) return false;
    return !play.enemies.some((o) => !o.defeated && Math.hypot(o.x - x, o.y - y) < def.spawnClear + enemyRadius(o));
  });
  if (!free.length) return;
  const spot = play.rng.pick(free);
  const id = phase.pool[play.rng.weighted(phase.pool.map((p) => p.weight))]!.id;
  const edef = OBJECTS.get(id);
  if (edef?.kind !== 'enemy') return;
  const o: CourseObject = { id, x: spot.x, y: spot.y, path: [], facing: 'se', phase: 0, orient: 'x', drops: null, extras: NO_EXTRAS, link: null };
  const cx = spot.x + 0.5;
  const cy = spot.y + 0.5;
  const uid = `summon:${id}#${play.summoned++}`;
  play.enemies.push(newEnemy(play, { seed: play.seed, enemyModifiers: play.enemyModifiers }, edef, o, uid, cx, cy, heightAt(play.course, cx, cy), true));
  play.log.push({ kind: 'summon', boss: boss.uid, enemy: uid, x: cx, y: cy });
  play.world.obstacles = obstaclesOf(play);
}

/** The boss is beaten: its minions vanish and the exit opens. */
function bossDefeated(play: PlayState, e: EnemyState): void {
  for (const m of play.enemies) {
    if (!m.minion || m.defeated) continue;
    m.defeated = true;
    m.body = null;
    m.activated = false;
    play.log.push({ kind: 'vanish', enemy: m.uid });
  }
  if (!play.exitOpen) {
    play.exitOpen = true;
    play.log.push({ kind: 'exitOpen' });
  }
  void e;
}

// ---------------------------------------------------------------------------
// Triggers and enemy actions (DESIGN.md section 8)

function respond(play: PlayState, e: EnemyState, trigger: 'hit' | 'rest' | 'passBy'): void {
  const r = e.def.triggers[trigger];
  if (r === 'none' || e.defeated) return;
  play.log.push({ kind: 'trigger', enemy: e.uid, trigger });
  if (r === 'immediate') act(play, e, true);
  if ((r === 'activated' || r === 'immediate') && actsOnTurns(e) && !e.activated) {
    e.activated = true;
    play.log.push({ kind: 'activated', enemy: e.uid });
  }
}

/** Behaviours that take actions on enemy turns once activated. */
function actsOnTurns(e: EnemyState): boolean {
  const k = e.def.behaviour.kind;
  return k === 'lob' || k === 'launch' || k === 'boss' || k === 'face' || k === 'pulse';
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
    if (cannotMove(e)) {
      play.log.push({ kind: 'skip', enemy: e.uid });
      return;
    }
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
  } else if (bh.kind === 'face') {
    // Trapjaw: turns to face the ball (not while chilled).
    if (cannotMove(e)) return;
    const b = ballNow(play);
    const d = Math.hypot(b.x - e.x, b.y - e.y);
    if (d < 1e-6) return;
    e.fx = (b.x - e.x) / d;
    e.fy = (b.y - e.y) / d;
    play.log.push({ kind: 'turn', enemy: e.uid });
  } else if (bh.kind === 'pulse') {
    // Stinkpuff: puff the ring marked last turn, then mark the next one.
    if (e.slamMark) puff(play, e, e.slamMark.r);
    e.slamMark = { x: e.x, y: e.y, r: bh.radius };
    play.log.push({ kind: 'puffMark', enemy: e.uid, x: e.x, y: e.y, r: bh.radius });
  } else if (bh.kind === 'boss') {
    bossAction(play, e);
  } else if (bh.kind === 'burrow') {
    // Owner, 2026-11-14: it waits a moment (the hill rumbles), then shoots up out of the ground.
    if (!e.burrowed || e.popAt !== null || cannotMove(e)) return;
    e.popAt = play.clock + steps(e.traits.includes('swift') ? TRAIT_RULES.swiftPopDelay : bh.delay);
    play.log.push({ kind: 'rumble', enemy: e.uid });
  }
  void now;
}

/** A Stinkpuff puffs: a ball on the ground within `r` gets its status (no damage). */
function puff(play: PlayState, e: EnemyState, r: number): void {
  const bh = e.def.behaviour;
  if (bh.kind !== 'pulse') return;
  e.slamMark = null;
  const b = ballNow(play);
  const g = groundAt(play.course, b.x, b.y);
  const hit = !!g && b.z <= g.h + 0.3 && Math.hypot(b.x - e.x, b.y - e.y) <= r;
  play.log.push({ kind: 'puff', enemy: e.uid, x: e.x, y: e.y, r, hit });
  if (hit) applyBallStatus(play, bh.status);
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
  e.body.frozen = play.frozen;
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
  launchSeed(play, e, target, bh.loftAngle, bh.seedRadius);
}

/** Lob a seed (or a boss's glob) at a spot: it has ball physics and hurts the ball it hits. */
function launchSeed(play: PlayState, e: EnemyState, target: { x: number; y: number }, loftAngle: number, seedRadius: number): void {
  const bh = { loftAngle, seedRadius };
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
  play.world.obstacles = obstaclesOf(play);
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
    const ch = e.def.behaviour.kind === 'boss' ? BOSSES.get(e.def.behaviour.boss)?.charge : undefined;
    if (body.outcome || body.step >= maxSteps || (ch && body.step >= steps(ch.maxSeconds))) {
      e.body = null;
      e.z = heightAt(play.course, e.x, e.y);
      // Gloamhorn: after a charge its shell opens for the player's next shot.
      const g = bossDefOf(play, e)?.gimmick;
      if (g?.kind === 'shell' && e.def.behaviour.kind === 'boss') {
        e.shellOpenShot = play.shotNumber + 1;
        play.log.push({ kind: 'shellOpen', enemy: e.uid });
      }
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
      damageBall(play, sp ? sp.stats.get('attackDamage') : 1, 'seed', sp);
    } else if (t.enemy) {
      const e = t.enemy;
      const bh = e.def.behaviour;
      const ch = e.def.behaviour.kind === 'boss' ? BOSSES.get(e.def.behaviour.boss)?.charge : undefined;
      if (ch) {
        // A charging boss: 1 damage and the ball is knocked aside.
        damageBall(play, ch.damage, 'charge', e);
        if (play.status !== 'playing') return;
        const a = Math.atan2(b.y - o.y, b.x - o.x);
        b.vx = Math.cos(a) * ch.knockSpeed;
        b.vy = Math.sin(a) * ch.knockSpeed;
        b.vz = ch.knockHop;
        b.grounded = false;
        b.z += 0.001;
        s.restSteps = 0;
      } else if (e.def.contact === 'moving') damageBall(play, e.stats.get('attackDamage'), 'enemy', e);
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
    // Static (Milestone 8): a charged ball passes under a thunder cloud unharmed.
    if (!play.zapped.includes(c.uid) && play.aura?.kind !== 'static' && under(ballNow(play))) {
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
    // A floating Glowmoth flies over flags without touching them.
    if (e.defeated || e.burrowed || floatOf(e) > 0) continue;
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
      addStars(play, 1, f.x, f.y, true);
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
    } else if (p.def.effect === 'blueStar') {
      play.blueStars++;
      play.log.push({ kind: 'blueStar', x: p.x, y: p.y });
    } else if (p.def.effect === 'acorn') {
      // Owner, 2026-11-21: picked-up food asks "eat now or stash it?"; with the bag full it is eaten at once.
      if (play.bagRoom - play.foodPending.length <= 0) eatFoodNow(play, p.def.id, true);
      else {
        play.foodPending.push(p.def.id);
        play.log.push({ kind: 'foodFound', item: p.def.id });
      }
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
  if (!play.ability || play.abilityUsed || !play.shot || play.shot.outcome || play.status !== 'playing') return false;
  // Kite only works in the air (round 2b sheet 1.2); on the ground it is not used up.
  if (play.ability === 'kite' && play.shot.ball.grounded && !play.shot.hover) return false;
  return true;
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
  } else if (fx.kind === 'frost' || fx.kind === 'static') {
    play.aura = { kind: fx.kind, stepsLeft: steps(fx.time), zapped: [] };
  } else if (fx.kind === 'burr') {
    // Rolling: the ground is what it touches, so it sticks at once. In the air: the first thing it touches.
    if (s.hover) {
      endHover(play.course, s, 0);
      play.tornado = null;
    }
    const g = groundAt(play.course, b.x, b.y);
    if (b.grounded && g) stick(s, g);
    else s.sticky = steps(fx.time);
  } else if (fx.kind === 'kite') {
    s.glide = steps(fx.time);
    s.glideGravity = fx.gravityScale;
    s.glideMaxFall = fx.maxFall;
  } else if (fx.kind === 'gyre') {
    play.steering = { kind: 'gyre', stepsLeft: steps(fx.time) };
  } else if (fx.kind === 'drift') {
    const g = groundAt(play.course, b.x, b.y);
    b.vx = 0;
    b.vy = 0;
    b.vz = 0;
    s.hover = { floor: (g ? Math.max(b.z, g.h) : b.z) + (b.grounded ? fx.lift : 0) };
    b.grounded = false;
    play.steering = { kind: 'drift', stepsLeft: steps(fx.time) };
  } else if (fx.kind === 'tornado') {
    const sp = Math.hypot(b.vx, b.vy);
    const heading = sp > 1e-6 ? Math.atan2(b.vy, b.vx) : Math.atan2(s.dirY, s.dirX);
    s.hover = { floor: b.z };
    play.tornado = { stepsLeft: steps(fx.time), heading, speed: fx.speed, wanderIn: steps(fx.wanderEvery) };
  }
  return true;
}

/** Frost and Static while they last (Milestone 8 sheet section 6). */
function stepAura(play: PlayState, s: ShotState): void {
  const a = play.aura;
  if (!a) return;
  if (a.stepsLeft-- <= 0) {
    play.aura = null;
    return;
  }
  const b = s.ball;
  if (a.kind === 'frost') {
    const fx = ABILITIES.get('frost')!.effect;
    if (fx.kind !== 'frost') return;
    // Water the ball touches turns to ice: under it, and a little ahead so a fast ball does not drop in first.
    const sp = Math.hypot(b.vx, b.vy);
    const ahead = sp > 1e-6 ? fx.lookAhead / sp : 0;
    for (const [x, y] of [
      [b.x, b.y],
      [b.x + b.vx * ahead, b.y + b.vy * ahead],
    ] as const) {
      const g = groundAt(play.course, x, y);
      if (!g || b.z > g.h + 0.15 || !SURFACES.get(g.tile.surface)?.sinks) continue;
      const key = `${g.tile.x},${g.tile.y}`;
      if (!play.frozen[key]) play.log.push({ kind: 'freeze', x: g.tile.x, y: g.tile.y });
      // Owner, 2026-11-18: frozen for 2 turns; freezing it again resets the 2 turns.
      play.frozen[key] = fx.freezeTurns;
      play.frozenAt[key] = play.shotNumber;
    }
    return;
  }
  const fx = ABILITIES.get('static')!.effect;
  if (fx.kind !== 'static') return;
  for (const e of play.enemies) {
    if (e.defeated || e.burrowed || a.zapped.includes(e.uid)) continue;
    if (Math.hypot(e.x - b.x, e.y - b.y) > fx.radius + enemyRadius(e) || Math.abs(e.z - b.z) > 1.2) continue;
    a.zapped.push(e.uid);
    play.log.push({ kind: 'staticZap', enemy: e.uid });
    fieldHit(play, e, fx.damage, 'shock');
    if (play.status !== 'playing') return;
  }
}

/**
 * A hit from an ability's field (Static): your own action, so it counts like a
 * hit (shots back, triggers, stars), with its element; position, guards and
 * shields do not matter. A boss still takes only so many hits per shot.
 */
function fieldHit(play: PlayState, e: EnemyState, base: number, element: Element): void {
  const bossDef = e.def.behaviour.kind === 'boss' ? BOSSES.get(e.def.behaviour.boss) : undefined;
  if (bossDef) {
    if (e.hitShot !== play.shotNumber) {
      e.hitShot = play.shotNumber;
      e.hitsInShot = 0;
    }
    if (e.hitsInShot >= bossDef.hitsPerShot) return;
    e.hitsInShot++;
  }
  const res = computeHit({ base, element, fromAbove: false, fromBehind: false }, { weakTo: e.weakTo, resists: e.resists, weakSpots: [], guardedSides: [], shieldUp: false });
  let damage = res.damage;
  const chill = damage > 0 ? e.statuses.find((st) => STATUSES.get(st.id)?.nextHitDouble) : undefined;
  if (chill) {
    damage *= 2;
    endEnemyStatus(play, e, chill.id);
  }
  e.health = Math.max(0, e.health - damage);
  play.log.push({ kind: 'hit', enemy: e.uid, damage, blocked: false });
  if (damage > 0) gainShots(play, RULES.shotsPerHit);
  if (e.health <= 0) defeat(play, e);
  else {
    bossPhaseCheck(play, e);
    respond(play, e, 'hit');
  }
}

/**
 * After the ball's turn: frozen water ages (owner, 2026-11-18: 2 turns; the
 * turn it was frozen in does not count; a nap counts). Melted water under a
 * resting ball counts as stopping in water.
 */
function ageIce(play: PlayState): void {
  for (const key of Object.keys(play.frozen)) {
    if (play.frozenAt[key] === play.shotNumber && play.turn !== 'recover') continue;
    play.frozen[key]!--;
    if (play.frozen[key]! > 0) continue;
    delete play.frozen[key];
    delete play.frozenAt[key];
    const [x, y] = key.split(',').map(Number) as [number, number];
    play.log.push({ kind: 'melt', x, y });
    if (Math.floor(play.ball.x) === x && Math.floor(play.ball.y) === y && !play.shot) {
      damageBall(play, RULES.sinkDamage, 'sunk');
      play.log.push({ kind: 'underwater' });
    }
  }
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

/** Put a status on an enemy. `turns` overrides the status's own length (the fire gear sets how long Burning lasts). */
export function applyEnemyStatus(play: PlayState, e: EnemyState, id: string, turns?: number): void {
  const def = STATUSES.get(id);
  if (!def || e.defeated) return;
  // Owner, 2026-11-18: fire and ice cancel. Putting one on a thing that has the other removes both.
  const cancelled = def.cancels.filter((c) => hasStatus(e.statuses, c));
  if (cancelled.length) {
    for (const c of cancelled) endEnemyStatus(play, e, c);
    return;
  }
  const n = turns ?? def.turns;
  const have = e.statuses.find((s) => s.id === id);
  if (have) {
    if (def.reapply === 'add') have.turnsLeft += n;
    else if (def.reapply === 'reset') have.turnsLeft = Math.max(have.turnsLeft, n);
    return;
  }
  e.statuses.push({ id, turnsLeft: n });
  // Status modifiers last until the status ends (removed by source), so a reset keeps them going too.
  for (const m of def.enemyModifiers) e.stats.add({ ...m, source: { kind: 'status', id }, duration: { kind: 'forever' } });
  play.log.push(id === 'stunned' ? { kind: 'stunned', target: e.uid } : { kind: 'status', target: e.uid, status: id });
  if (def.enemyCannotMove) {
    // A chilled patroller stops where it is; a rolling one keeps rolling until it stops.
    e.vx = 0;
    e.vy = 0;
  }
}

function endEnemyStatus(play: PlayState, e: EnemyState, id: string): void {
  if (!hasStatus(e.statuses, id)) return;
  e.statuses = e.statuses.filter((s) => s.id !== id);
  e.stats.removeSource({ kind: 'status', id });
  play.log.push({ kind: 'statusEnd', target: e.uid, status: id });
}

/**
 * Put a status on the ball. For the ball one turn is one shot: a status
 * counts down each time a shot is taken while it is on (Milestone 8, as
 * built: Burning hurts as each of those shots is taken). One that lands
 * during a shot works at once and still counts its full turns from the next shot.
 */
export function applyBallStatus(play: PlayState, id: string, turns?: number): void {
  const def = STATUSES.get(id);
  if (!def || play.status !== 'playing') return;
  const cancelled = def.cancels.filter((c) => hasStatus(play.ballStatuses, c));
  if (cancelled.length) {
    for (const c of cancelled) endBallStatus(play, c);
    return;
  }
  const n = turns ?? def.turns;
  const have = play.ballStatuses.find((s) => s.id === id);
  if (have) {
    if (def.reapply === 'add') have.turnsLeft += n;
    else if (def.reapply === 'reset') have.turnsLeft = Math.max(have.turnsLeft, n);
    return;
  }
  play.ballStatuses.push({ id, turnsLeft: n });
  for (const m of def.ballModifiers) play.stats.add({ ...m, source: { kind: 'status', id }, duration: { kind: 'forever' } });
  if (def.ballLosesShots > 0) play.shots = Math.max(0, play.shots - def.ballLosesShots);
  if (def.ballIceRoll && play.shot) play.shot.iceRoll = true;
  play.log.push(id === 'stunned' ? { kind: 'stunned', target: 'ball' } : { kind: 'status', target: 'ball', status: id });
}

function endBallStatus(play: PlayState, id: string): void {
  if (!hasStatus(play.ballStatuses, id)) return;
  play.ballStatuses = play.ballStatuses.filter((s) => s.id !== id);
  play.stats.removeSource({ kind: 'status', id });
  if (play.shot && STATUSES.get(id)?.ballIceRoll) play.shot.iceRoll = ballIceRoll(play);
  play.log.push({ kind: 'statusEnd', target: 'ball', status: id });
}

/** The ball slides as if on ice (Chilled). */
function ballIceRoll(play: PlayState): boolean {
  return play.ballStatuses.some((s) => STATUSES.get(s.id)?.ballIceRoll);
}

/** After a shot: end the statuses whose last turn it was. */
function tickBallStatuses(play: PlayState): void {
  for (const st of play.ballStatuses.filter((x) => x.turnsLeft <= 0)) endBallStatus(play, st.id);
}

/** One turn passed for an enemy (an enemy turn ended). */
function tickEnemyStatuses(e: EnemyState): void {
  for (const st of e.statuses) st.turnsLeft--;
  for (const st of e.statuses.filter((x) => x.turnsLeft <= 0)) {
    e.statuses = e.statuses.filter((x) => x !== st);
    e.stats.removeSource({ kind: 'status', id: st.id });
  }
}

/** Owner, 2026-11-18: water puts out a burning ball (rolling through it or stopping in it). */
function waterPutsOut(play: PlayState): void {
  if (!play.ballStatuses.some((s) => STATUSES.get(s.id)?.waterEnds)) return;
  const b = ballNow(play);
  const g = groundAt(play.course, b.x, b.y);
  if (!g || b.z > g.h + 0.05 || !SURFACES.get(surfaceOf({ frozen: play.frozen }, g.tile))?.sinks) return;
  for (const st of play.ballStatuses.filter((x) => STATUSES.get(x.id)?.waterEnds)) endBallStatus(play, st.id);
}

/** A shot is taken: each status on the ball uses up one turn, and Burning hurts (Milestone 8). */
function ballTurnTaken(play: PlayState): void {
  for (const st of play.ballStatuses) {
    st.turnsLeft--;
    const dmg = STATUSES.get(st.id)?.ballDamagePerShot ?? 0;
    if (dmg > 0) {
      // A turn's burn is not stopped by the half second of immunity from an earlier hit.
      play.immuneUntil = 0;
      damageBall(play, dmg, 'burn');
    }
    if (play.status !== 'playing') return;
  }
}

/** Cannot move: chilled (Milestone 8). Stunned is separate (it skips the whole action). */
function cannotMove(e: EnemyState): boolean {
  return e.statuses.some((s) => STATUSES.get(s.id)?.enemyCannotMove);
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
  tickBallStatuses(play);
  ageIce(play);
  if (play.status !== 'playing') return;
  play.stats.tickTurn();
  play.turnQueue = ['normal'];
  if (play.shots <= 0) {
    if (play.napsUsed < play.stats.get('naps')) play.turnQueue.push('recover');
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
  // Burning (Milestone 6): damage at the start of each enemy turn.
  for (const e of play.enemies) {
    if (e.defeated) continue;
    for (const st of e.statuses) {
      const dmg = STATUSES.get(st.id)?.enemyDamagePerTurn ?? 0;
      if (dmg <= 0 || e.defeated) continue;
      play.log.push({ kind: 'statusDamage', enemy: e.uid, status: st.id, damage: dmg });
      hurtEnemy(play, e, dmg);
    }
  }
  // Regenerating (Milestone 8): 1 health back at the start of each enemy turn, not while burning.
  for (const e of play.enemies) {
    if (e.defeated || !e.traits.includes('regenerating') || hasStatus(e.statuses, 'burning')) continue;
    const full = e.stats.get('health');
    if (e.health >= full) continue;
    e.health = Math.min(full, e.health + TRAIT_RULES.regenerate);
    play.log.push({ kind: 'regen', enemy: e.uid });
  }
  if (kind === 'normal') burrowMoles(play);
  // Swift launchers act twice per enemy turn.
  play.turnActions = play.enemies
    .filter((e) => !e.defeated && e.activated && !e.burrowed)
    .flatMap((e) => (e.traits.includes('swift') && e.def.behaviour.kind === 'launch' ? Array<string>(TRAIT_RULES.swiftActions).fill(e.uid) : [e.uid]));
}

function endTurn(play: PlayState): void {
  for (const e of play.enemies) {
    tickEnemyStatuses(e);
    e.stats.tickTurn();
  }
  if (play.turn === 'recover') {
    // A nap counts as a turn for frozen water (Milestone 8).
    ageIce(play);
    if (play.status !== 'playing') return;
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
