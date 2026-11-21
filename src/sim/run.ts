/**
 * The run (Milestone 6 design sheet, docs/plans/milestone-6.md, signed off by
 * the owner 2026-11-15). Plain TypeScript, deterministic: every random choice
 * comes from the run seed through a fork named after what it is for, so the
 * same seed and the same choices always give the same run.
 *
 * A run is a branching map of nodes (made by src/gen/runMap.ts). The player
 * moves up one row at a time. Finishing a course, a hard course or a cache
 * lowers the boss countdown by 1 (owner, 2026-11-15: shops do not count).
 * At zero the boss is forced. Health, yellow stars, the ability, gear and run
 * upgrades carry between nodes; shots and naps refill on every course.
 *
 * The boss is a stand-in hard course until Milestone 7 builds The Warden.
 *
 * Owner, 2026-11-15: a shop node is a little town with the shop and the
 * player's Burrow (home base). The Burrow stores one gear item per category;
 * stored gear is safe from death, so it lives outside the run and is passed in
 * when a run starts. The display saves it in the browser.
 */
import { CHARACTERS, DEFAULT_CHARACTER } from '../content/characters.ts';
import { GEAR, GEAR_CATEGORIES, GEAR_LIST, LUCK_SHIFT, NO_GEAR, RARITIES, RARITY_ODDS, type GearCategory, type GearDef, type GearSlots } from '../content/gear.ts';
import { ACORN_LIST, ACORNS, ACORN_SHOP_WEIGHT, FOOD, FOOD_LIST, FOODS, acornWeights, isInstantFood } from '../content/consumables.ts';
import { BOSSES, BOSS_IDS, bossHealthIn } from '../content/bosses.ts';
import type { JourneySize } from '../content/gen.ts';
import { ENDLESS_MIX_STEP, REGION_MIXES, type EnemyMix } from '../content/enemyMods.ts';
import { ENDLESS, LAST_REGION, REGIONS, botShotsFor, type RegionDef } from '../content/run.ts';
import { RUN, UPGRADE_LIST, UPGRADE_PRICE, UPGRADES, type NodeType } from '../content/run.ts';
import { BLUE_STARS, PERMANENT_UPGRADES } from '../content/progress.ts';
import { buyUpgrade, permanentModifiers, type Profile } from './profile.ts';
import { Rng } from './rng.ts';
import { StatSheet, type Modifier } from './stats.ts';
import { COURSE_MOD_LIST, courseModCost, type CourseMod } from '../content/modifiers.ts';
import { DIRECTIONS } from '../content/surfaces.ts';
import { GEN } from '../content/gen.ts';
import { biomeForRegion } from '../content/biomes.ts';
import type { Loadout } from './play.ts';

// ---------------------------------------------------------------------------
// The map

export interface MapNode {
  /** "r<row>l<lane>", rows from 1 at the bottom, lanes from 0 on the left. The boss is "boss". */
  readonly id: string;
  readonly row: number;
  readonly lane: number;
  /** As generated. A "boss" node in the map is an early boss; it is offered only once the countdown is low enough (see `typeOf`). */
  readonly type: NodeType;
  /** Ids of the nodes in the next row this one leads to. */
  readonly links: readonly string[];
}

export interface RunMap {
  /** rows[0] is row 1. */
  readonly rows: readonly (readonly MapNode[])[];
}

export function nodeById(map: RunMap, id: string): MapNode | undefined {
  const m = /^r(\d+)l(\d+)$/.exec(id);
  if (!m) return undefined;
  return map.rows[Number(m[1]) - 1]?.find((n) => n.id === id);
}

// ---------------------------------------------------------------------------
// State

/** reward: the boss is beaten and the player picks 1 of 3 gear items before the next region (Milestone 7). */
export type RunStatus = 'map' | 'course' | 'shop' | 'cache' | 'reward' | 'won' | 'lost';

/** The node being played: where it is, what it is, and for courses the generator's seed and budget. */
export interface CurrentNode {
  readonly id: string;
  readonly row: number;
  readonly type: NodeType;
  /** Fighting the boss before the countdown reached zero. */
  readonly early: boolean;
  readonly budget: number;
  readonly courseSeed: string;
  /** Gear item placed on this course, or null. */
  readonly gear: string | null;
  /** Milestone 7: a boss fight's boss and arena (src/content/arenas), or null on other nodes. */
  readonly boss: string | null;
  /** Round 2b: the course's modifier (wind, low gravity, darkness), or null. Left out in older saves. */
  readonly mod?: CourseMod | null;
  readonly arena: string | null;
}

/**
 * Something for sale or to take. Round 2a: the food shop sells 'food' (a food
 * id from consumables.ts, with how many courses it lasts); the gear shop sells
 * 'gear'. The cache still offers gear, an upgrade (for the run) or a heal.
 */
export interface Offer {
  readonly kind: 'gear' | 'upgrade' | 'heal' | 'raise' | 'acorn' | 'food';
  readonly id: string;
  sold: boolean;
  /** Food: how many courses it lasts once eaten (0 for Apple and Garlic, which work at once). */
  readonly courses?: number;
}

/** A food in the bag (round 2a sheet section 4.1). `courses` is 0 for Apple and Garlic. */
export interface BagItem {
  readonly id: string;
  readonly courses: number;
}

/** A food eaten and still working: `left` courses to go, counting the next one. */
export interface FedFood {
  readonly id: string;
  left: number;
}

export type ShopKind = 'food' | 'gear';

export interface ShopState {
  readonly node: string;
  offers: Offer[];
  /** Rerolls made in this shop, and how many of them were free. */
  rerolls: number;
  freeRerolls: number;
  /** The countdown may be raised once per shop. */
  raised: boolean;
}

export interface CacheState {
  readonly node: string;
  readonly offers: readonly Offer[];
}

/** The Burrow: one stored gear item per category. Kept between runs (it survives death). */
export type Burrow = { -readonly [C in GearCategory]: string | null };

export interface RunState {
  readonly seed: string;
  /** The Burrow's contents. Changed only in a town; the caller saves it. */
  readonly burrow: Burrow;
  /** The region's map (a new one each region, Milestone 7). */
  map: RunMap;
  /** Region number, from 1 (Milestone 7: a new region starts after each boss). */
  region: number;
  /** The last node finished, or null before row 1. */
  at: string | null;
  /** Nodes finished, in order. */
  readonly path: string[];
  status: RunStatus;
  current: CurrentNode | null;
  countdown: number;
  /** Countdown raises bought this region (at most RUN.maxRaises). */
  raises: number;
  /** Courses, hard courses and caches finished: sets the budget (owner, 2026-11-15: shops do not count). */
  counted: number;
  health: number;
  wallet: number;
  /**
   * Blue stars carried (owner, 2026-11-17): found or earned on this run but
   * not yet deposited. Deposited automatically on reaching a town or beating a
   * boss; lost on death or closing the game outside a town.
   */
  blueStars: number;
  /** Blue stars deposited during this run (for the summary). */
  banked: number;
  /** Deposited but not yet added to the profile's stash; the caller takes them with `drainDeposit`. */
  toStash: number;
  /** Permanent upgrade levels this run uses (from the profile; raised when one is bought in a town). */
  readonly permanent: Record<string, number>;
  /** Bosses beaten on this run (the caller records them in the profile). */
  readonly bossesBeaten: string[];
  ability: string | null;
  gear: { -readonly [C in GearCategory]: string | null };
  /** Times each run upgrade was bought (or taken from a cache). */
  readonly upgrades: Record<string, number>;
  /** Times each upgrade was bought in a shop, for its rising price. Caches do not raise it. */
  readonly bought: Record<string, number>;
  shop: ShopState | null;
  cache: CacheState | null;
  /** For the run summary. */
  readonly totals: { courses: number; stars: number };
  /** What ended the run. */
  endedBy: 'health' | 'shots' | 'boss' | null;
  /** The last town before the forced boss has been offered and visited (owner, 2026-11-15). */
  lastTownVisited: boolean;
  /** Round 2a (owner, 2026-11-21): the food bag, at most FOOD.bagSlots. Replaces the single pocket acorn. */
  bag: BagItem[];
  /** Foods eaten and still working. */
  fed: FedFood[];
  /** The town's food shop (the gear shop is `shop`). */
  foodShop: ShopState | null;
  /** The boss reward: a pick of 1 from 3 gear items (Milestone 7 sheet section 2.7). */
  reward: Offer[] | null;
  /** The arena of the last boss fight (from the profile, then this run's), never used twice in a row. */
  lastArena: string | null;
  /** Milestone 8: the final boss (region three) was beaten on this run: the run is won, and may carry on into endless mode. */
  beatFinal: boolean;
}

/** What a run starts with from the player's permanent progress (Milestone 7). */
export interface RunStart {
  readonly levels?: Readonly<Record<string, number>>;
  readonly startAbility?: string | null;
  /** The arena of the player's last boss fight, so the next one differs (owner, 2026-11-17). */
  readonly lastArena?: string | null;
}

export function createRun(seed: string, map: RunMap, burrow: GearSlots = NO_GEAR, start: RunStart = {}): RunState {
  const run: RunState = {
    seed,
    burrow: { weapon: validGear(burrow.weapon, 'weapon'), armour: validGear(burrow.armour, 'armour'), bauble: validGear(burrow.bauble, 'bauble') },
    map,
    region: 1,
    at: null,
    path: [],
    status: 'map',
    current: null,
    countdown: RUN.countdown,
    raises: 0,
    counted: 0,
    health: 0,
    wallet: 0,
    blueStars: 0,
    banked: 0,
    toStash: 0,
    permanent: { ...(start.levels ?? {}) },
    bossesBeaten: [],
    ability: start.startAbility !== undefined && start.startAbility !== null ? start.startAbility : CHARACTERS.get(DEFAULT_CHARACTER)!.startingAbility,
    gear: { ...NO_GEAR },
    upgrades: {},
    bought: {},
    shop: null,
    cache: null,
    totals: { courses: 0, stars: 0 },
    endedBy: null,
    lastTownVisited: false,
    bag: [],
    fed: [],
    foodShop: null,
    reward: null,
    lastArena: start.lastArena ?? null,
    beatFinal: false,
  };
  const stats = runStats(run);
  run.health = stats.get('maxHealth');
  // Head Start (owner, 2026-11-17).
  run.wallet = stats.get('startingStars');
  return run;
}

/** A saved id that is still a gear item of that category, or null. */
function validGear(id: string | null | undefined, c: GearCategory): string | null {
  return id && GEAR.get(id)?.category === c ? id : null;
}

/** A random stream for one purpose. The same label always gives the same stream. */
function rngFor(run: RunState, label: string): Rng {
  return Rng.fromSeed(run.seed).fork(label);
}

// ---------------------------------------------------------------------------
// Stats

function upgradeModifiers(run: RunState): Modifier[] {
  const out: Modifier[] = permanentModifiers(run.permanent);
  for (const u of UPGRADE_LIST) {
    for (let i = 0; i < (run.upgrades[u.id] ?? 0); i++) out.push({ stat: u.stat, op: u.op, amount: u.amount, source: { kind: 'run', id: u.id }, duration: { kind: 'run' } });
  }
  // Round 2a: stat foods eaten and still working (each one stacks).
  run.fed.forEach((f, k) => {
    const u = FOODS.get(f.id)?.kind === 'stat' ? UPGRADES.get(f.id) : undefined;
    if (u) out.push({ stat: u.stat, op: u.op, amount: u.amount, source: { kind: 'run', id: `food:${f.id}:${k}` }, duration: { kind: 'run' } });
  });
  return out;
}

/** The ball's stat sheet between courses: the character, run upgrades and gear. */
export function runStats(run: RunState): StatSheet {
  const sheet = new StatSheet(CHARACTERS.get(DEFAULT_CHARACTER)!.stats);
  for (const m of upgradeModifiers(run)) sheet.add(m);
  for (const c of GEAR_CATEGORIES) {
    const g = run.gear[c] ? GEAR.get(run.gear[c]!) : undefined;
    for (const m of g?.modifiers ?? []) sheet.add({ ...m, source: { kind: 'gear', id: g!.id }, duration: { kind: 'equipped' } });
  }
  return sheet;
}

function clampHealth(run: RunState): void {
  run.health = Math.max(0, Math.min(run.health, runStats(run).get('maxHealth')));
}

function hasRunEffect(run: RunState, kind: string): boolean {
  return GEAR_CATEGORIES.some((c) => run.gear[c] && GEAR.get(run.gear[c]!)?.effects.some((fx) => fx.kind === kind));
}

/** What the ball brings into a course. */
export function loadoutOf(run: RunState): Loadout {
  const acorns = run.fed.filter((f) => FOODS.get(f.id)?.kind === 'acorn').map((f) => f.id);
  return { health: run.health, ability: run.ability, gear: { ...run.gear }, wallet: run.wallet, modifiers: upgradeModifiers(run), acorns, bagRoom: FOOD.bagSlots - run.bag.length, rarityWeights: dropWeights(run), courseMod: run.current?.mod ?? null };
}

/** Rarity weights for things dropped on a course (acorns): the run's odds column after drop luck. */
export function dropWeights(run: RunState): number[] {
  return rarityWeights(oddsColumn(run, false), runStats(run).get('dropLuck'));
}

/**
 * What the course check's bot plays with (owner, 2026-11-18): the region's
 * "par" kit, not the player's own gear, ability and upgrades, and always at
 * full health. A course is proven beatable for a player at par; a player
 * behind par finds it harder. It also means a course made ahead never has to
 * be made again because the player bought something.
 */
/**
 * Round 2b (sheet section 3): the modifier a course node gets, from the run
 * seed, the region and the node, so the course made ahead in the background
 * is the one the player gets. Never on boss fights; none in region 1.
 */
export function courseModFor(run: RunState, node: MapNode): CourseMod | null {
  const type = typeOf(run, node);
  if (type !== 'course' && type !== 'hard') return null;
  const rng = rngFor(run, `mod:${run.region}:${node.id}`);
  if (!rng.chance(regionDef(run).courseModChance)) return null;
  const def = rng.pick(COURSE_MOD_LIST);
  // Owner, 2026-11-21: wind comes in three strengths.
  return def.id === 'wind' ? { id: def.id, dir: rng.pick(DIRECTIONS), strength: rng.pick([1, 2, 3] as const) } : { id: def.id };
}

/** A course's threat budget less its modifier's cost (never below the generator's minimum). */
function budgetWithMod(run: RunState, type: NodeType, mod: CourseMod | null): number {
  const cost = mod ? courseModCost(mod) : 0;
  return Math.max(GEN.minBudget, budgetFor(run, type) - cost);
}

export function botLoadoutOf(run: RunState, mod: CourseMod | null = run.current?.mod ?? null): Loadout {
  const modifiers: Modifier[] = regionDef(run).par.map((p) => ({ stat: p.stat, op: 'add', amount: p.amount, source: { kind: 'region', id: `par${run.region}` }, duration: { kind: 'run' } }));
  // Owner, 2026-11-19 (round 1, option C): from region three on, the bot also wears the region's best gear.
  const pg = regionDef(run).parGear;
  return { ability: null, gear: pg ? { ...pg } : { ...NO_GEAR }, modifiers, courseMod: mod };
}

/**
 * Everything the generator needs for the current course besides its seed and
 * budget: the bot's loadout, the region's journey size and enemy toughness.
 */
export function genOptionsFor(run: RunState, type: NodeType = run.current?.type ?? 'course', mod: CourseMod | null = run.current?.mod ?? null): { loadout: Loadout; size: JourneySize; enemyModifiers: Modifier[] } {
  return { loadout: botLoadoutOf(run, mod), size: sizeFor(run, type), enemyModifiers: enemyModifiersFor(run) };
}

/** A node's course seed: the run seed plus the node (and the region from region two on, so regions differ). */
export function courseSeedOf(run: RunState, node: MapNode): string {
  const id = node.id;
  const base = `${run.seed}-${id === 'boss' ? `BOSS${node.row}` : id === LAST_TOWN ? 'LASTTOWN' : id.toUpperCase()}`;
  return run.region > 1 ? `${base}-${run.region}` : base;
}

/** Everything needed to make a node's course ahead of time (owner, 2026-11-18: make courses in the background). */
export interface CourseJob {
  readonly id: string;
  readonly courseSeed: string;
  readonly budget: number;
  readonly opts: ReturnType<typeof genOptionsFor>;
}

/** The generated course a node would get if the player went there now; null for towns, caches and boss arenas. */
export function courseJobFor(run: RunState, node: MapNode): CourseJob | null {
  const type = typeOf(run, node);
  if (type !== 'course' && type !== 'hard') return null;
  const mod = courseModFor(run, node);
  return { id: node.id, courseSeed: courseSeedOf(run, node), budget: budgetWithMod(run, type, mod), opts: genOptionsFor(run, type, mod) };
}

/**
 * The courses the player can go to next: from the map, the choices now; in a
 * town or cache, the choices after leaving it; during a course, the choices
 * after winning it with the loadout as it is now. A guess for a course in
 * play: if the player ends with other gear, those courses are made again.
 */
export function upcomingJobs(run: RunState): CourseJob[] {
  let ahead: RunState = run;
  if (run.status !== 'map') {
    if (run.status === 'reward' || run.status === 'won' || run.status === 'lost' || run.current?.type === 'boss') return [];
    ahead = structuredClone(run);
    if (ahead.status === 'shop') leaveShop(ahead);
    else if (ahead.status === 'cache') leaveCache(ahead);
    else if (ahead.status === 'course') finishCourse(ahead, { won: true, lostBy: null, health: ahead.health, wallet: ahead.wallet, ability: ahead.ability, gear: ahead.gear });
  }
  return choices(ahead)
    .map((n) => courseJobFor(ahead, n))
    .filter((j): j is CourseJob => j !== null);
}

/** Put on an item between courses (shop, cache, testing aid). The old one is lost. */
export function setGear(run: RunState, id: string): string | null {
  const g = GEAR.get(id);
  if (!g) return null;
  const old = run.gear[g.category];
  run.gear[g.category] = id;
  clampHealth(run);
  return old;
}

/** Add one run upgrade (shop, cache, testing aid). */
export function addUpgrade(run: RunState, id: string): void {
  const u = UPGRADES.get(id);
  if (!u) return;
  run.upgrades[id] = (run.upgrades[id] ?? 0) + 1;
  run.health += u.heal;
  clampHealth(run);
}

// ---------------------------------------------------------------------------
// Moving on the map

/** The boss, as a node above the row the player is on. */
function bossNode(row: number): MapNode {
  return { id: 'boss', row, lane: -1, type: 'boss', links: [] };
}

/** Owner, 2026-11-15: the last town, always offered (and optional) before the forced boss. */
export const LAST_TOWN = 'lasttown';
function lastTownNode(row: number): MapNode {
  return { id: LAST_TOWN, row, lane: -1, type: 'shop', links: [] };
}

/** The row the player stands below: 0 before the first node. */
export function rowOf(run: RunState): number {
  return run.at ? (nodeById(run.map, run.at)?.row ?? 0) : 0;
}

/**
 * What a node is for the player right now. An early-boss node in the map is
 * offered as the boss only once the countdown is at or below RUN.earlyBossAt;
 * before that it is an ordinary course.
 */
export function typeOf(run: RunState, node: MapNode): NodeType {
  if (node.type === 'boss' && node.id !== 'boss' && run.countdown > RUN.earlyBossAt) return 'course';
  return node.type;
}

/** The nodes the player can go to next. At countdown zero (or the top of the map), only the boss. */
export function choices(run: RunState): MapNode[] {
  if (run.status !== 'map') return [];
  const row = rowOf(run);
  if (run.countdown <= 0 || row >= run.map.rows.length) {
    // Owner, 2026-11-15: before the forced boss there is always the chance of a town, unless the player has just left one.
    const justLeftTown = run.lastTownVisited || (!!run.at && nodeById(run.map, run.at)?.type === 'shop');
    return justLeftTown ? [bossNode(row + 1)] : [lastTownNode(row + 1), bossNode(row + 1)];
  }
  if (!run.at) return [...run.map.rows[0]!];
  const here = nodeById(run.map, run.at)!;
  return here.links.map((id) => nodeById(run.map, id)!).filter(Boolean);
}

/** The region's numbers (Milestone 7 sheet section 7.4). Regions past the list use the last entry. */
export function regionDef(run: RunState): RegionDef {
  return regionDefFor(run.region);
}

/**
 * A region's numbers. Regions 1 to 3 are the table; endless regions (owner,
 * 2026-11-18; sheet section 10a) take region three's and add one step per
 * region, except course size, which stays at region three's.
 */
export function regionDefFor(region: number): RegionDef {
  if (region <= REGIONS.length) return REGIONS[Math.max(1, region) - 1]!;
  const last = REGIONS[REGIONS.length - 1]!;
  const k = region - REGIONS.length;
  const health = last.toughness.find((t) => t.stat === 'health')?.amount ?? 0;
  const attack = last.toughness.find((t) => t.stat === 'attackDamage')?.amount ?? 0;
  const par = last.par.map((p) => {
    const step = ENDLESS.par.find((e) => e.stat === p.stat)?.amount ?? 0;
    return { stat: p.stat, amount: p.amount + step * k };
  });
  for (const e of ENDLESS.par) if (!par.some((p) => p.stat === e.stat)) par.push({ stat: e.stat, amount: e.amount * k });
  return {
    ...last,
    threat: { start: last.threat.start + ENDLESS.threatStart * k, perNode: last.threat.perNode, cap: last.threat.cap + ENDLESS.threatCap * k },
    maxEnemies: last.maxEnemies + ENDLESS.maxEnemies * k,
    // +1 health one region, +1 attack the next, health first.
    toughness: [
      { stat: 'health', amount: health + Math.ceil(k / 2) },
      { stat: 'attackDamage', amount: attack + Math.floor(k / 2) },
    ],
    bosses: BOSS_IDS,
    par,
  };
}

/**
 * The threat budget of a course node: the region's start plus so much per
 * counted node in the region, hard courses x1.5, capped (owner, 2026-11-17:
 * region 1 is 8 + 2 per node, cap 30, as in Milestone 6).
 */
export function budgetFor(run: RunState, type: NodeType): number {
  const t = regionDef(run).threat;
  const plain = t.start + t.perNode * run.counted;
  const scaled = type === 'hard' || type === 'boss' ? Math.floor(plain * RUN.budget.hardScale) : plain;
  return Math.min(t.cap, scaled);
}

/** The journey's size for a course node: the region's areas and area size; hard courses one area more. */
export function sizeFor(run: RunState, type: NodeType): JourneySize {
  const r = regionDef(run);
  const plain = Math.min(r.areas.max, r.areas.start + Math.floor(run.counted / r.areas.every));
  // Owner, 2026-11-19 (round 1, option A): a hard course has one area more, but never more than the region's maximum.
  const n = type === 'hard' || type === 'boss' ? Math.min(r.areas.max, plain + 1) : plain;
  const scale = biomeForRegion(run.region).landformScale;
  return {
    areas: [n, n],
    areaSize: r.areaSize,
    maxEnemies: r.maxEnemies,
    botShots: botShotsFor(n),
    mix: mixFor(run.region),
    hard: type === 'hard' || type === 'boss',
    oddsColumn: oddsColumn(run, false),
    detail: r.detail,
    ...(Object.keys(scale).length && { landformScale: scale }),
  };
}

/**
 * How the generator dresses enemies in a region (Milestone 8 sheet sections
 * 4.1 and 5.2). Endless regions (owner, 2026-11-18) keep region three's mix and
 * add more Veterans and Elites each region, up to a cap.
 */
export function mixFor(region: number): EnemyMix {
  const last = REGION_MIXES[REGION_MIXES.length - 1]!;
  if (region <= REGION_MIXES.length) return REGION_MIXES[Math.max(1, region) - 1]!;
  const k = region - REGION_MIXES.length;
  return { ...last, veteran: Math.min(ENDLESS_MIX_STEP.cap, last.veteran + k * ENDLESS_MIX_STEP.veteran), elite: Math.min(ENDLESS_MIX_STEP.cap, last.elite + k * ENDLESS_MIX_STEP.elite) };
}

/** Region toughness: a modifier on every enemy (source "region"). */
export function enemyModifiersFor(run: RunState): Modifier[] {
  return regionDef(run).toughness.map((t) => ({ stat: t.stat, op: 'add' as const, amount: t.amount, source: { kind: 'region' as const, id: `region${run.region}` }, duration: { kind: 'forever' as const } }));
}

/** The boss randomizer (owner, 2026-11-17): a seeded pick from the region's boss pool. */
export function bossOf(run: RunState): string {
  const pool = regionDef(run).bosses;
  // Endless (owner, 2026-11-18): every boss, but never the one beaten in the region before.
  const last = run.region > LAST_REGION ? run.bossesBeaten[run.bossesBeaten.length - 1] : undefined;
  const options = pool.filter((b) => b !== last);
  return rngFor(run, `boss:${run.region}`).pick(options.length ? options : pool);
}

/** The boss's health in the run's region (per boss; endless keeps growing). */
export function bossHealthFor(run: RunState): number {
  const def = BOSSES.get(run.current?.boss ?? bossOf(run));
  return def ? bossHealthIn(def, run.region) : 12;
}

/** Owner, 2026-11-17: a seeded pick from the boss's arena set, never the arena of the last boss fight. */
export function pickArena(run: RunState): string {
  const def = BOSSES.get(bossOf(run));
  const all = def?.arenas ?? [];
  const options = all.filter((a) => a !== run.lastArena);
  return rngFor(run, `arena:${run.region}`).pick(options.length ? options : all);
}

/** Region 1 has an early and a late column of rarity odds (sheet section 5.2); later regions have their own. */
function oddsColumn(run: RunState, better: boolean): number {
  const base = run.region > 1 ? regionDef(run).oddsColumn : run.counted >= RUN.lateAfter ? 1 : 0;
  return Math.min(RARITY_ODDS.length - 1, base + (better ? 1 : 0));
}

/** Rarity weights after drop luck: each +25% moves 5 points from the lowest rarity on offer to the next one up. */
export function rarityWeights(column: number, dropLuck: number): number[] {
  const w = [...RARITY_ODDS[column]!.weights] as number[];
  const shifts = Math.max(0, Math.floor((dropLuck - 1) / LUCK_SHIFT.per + 1e-9));
  for (let k = 0; k < shifts; k++) {
    const i = w.findIndex((x, j) => x > 0 && j < w.length - 1);
    if (i < 0) break;
    const moved = Math.min(LUCK_SHIFT.points, w[i]!);
    w[i]! -= moved;
    w[i + 1]! += moved;
  }
  return w;
}

/**
 * Pick a gear item: first the rarity by the odds for where the player is, then
 * an item of that rarity (and the category, if given) that is not held and not
 * excluded. Rarities with nothing left to offer are skipped.
 */
export function rollGear(run: RunState, rng: Rng, opts: { better?: boolean; category?: GearCategory; exclude?: readonly string[] } = {}): string | null {
  const held = new Set([...GEAR_CATEGORIES.map((c) => run.gear[c]), ...(opts.exclude ?? [])]);
  const pool = (r: string): GearDef[] => GEAR_LIST.filter((g) => g.rarity === r && !held.has(g.id) && (!opts.category || g.category === opts.category));
  const weights = rarityWeights(oddsColumn(run, !!opts.better), runStats(run).get('dropLuck')).map((w, i) => (pool(RARITIES[i]!).length ? w : 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let pick = rng.float(0, total);
  let rarity = RARITIES[0] as string;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i]! <= 0) continue;
    rarity = RARITIES[i]!;
    if (pick < weights[i]!) break;
    pick -= weights[i]!;
  }
  return rng.pick(pool(rarity)).id;
}

/** Go to a node offered by `choices`. Shops and caches open their stock; courses get their seed, budget and gear. */
export function enterNode(run: RunState, id: string): CurrentNode {
  const node = choices(run).find((n) => n.id === id);
  if (!node) throw new Error(`Node "${id}" cannot be chosen now.`);
  const type = typeOf(run, node);
  const isCourse = type === 'course' || type === 'hard' || type === 'boss';
  let gear: string | null = null;
  if (isCourse) {
    const rng = rngFor(run, `coursegear:${id}:${run.counted}`);
    const always = type !== 'course';
    if (always || rng.chance(RUN.courseGearChance)) gear = rollGear(run, rng, { better: always, category: rng.pick(GEAR_CATEGORIES) });
  }
  run.current = {
    id,
    row: node.row,
    type,
    early: type === 'boss' && run.countdown > 0,
    budget: isCourse ? budgetWithMod(run, type, courseModFor(run, node)) : 0,
    courseSeed: courseSeedOf(run, node),
    gear,
    boss: type === 'boss' ? bossOf(run) : null,
    mod: courseModFor(run, node),
    arena: type === 'boss' ? pickArena(run) : null,
  };
  if (run.current.arena) run.lastArena = run.current.arena;
  if (type === 'shop') {
    // Owner, 2026-11-17: reaching a town deposits the blue stars carried.
    deposit(run);
    run.status = 'shop';
    run.shop = { node: id, offers: [], rerolls: 0, freeRerolls: 0, raised: false };
    run.shop.offers = shopStock(run, run.shop, []);
    openFoodShop(run);
  } else if (type === 'cache') {
    run.status = 'cache';
    run.cache = { node: id, offers: cacheStock(run, id) };
  } else run.status = 'course';
  return run.current;
}

/** A node is done: the player now stands on it. */
function arrive(run: RunState, counts: boolean): void {
  const cur = run.current!;
  if (cur.id === LAST_TOWN) run.lastTownVisited = true;
  else if (cur.id !== 'boss') {
    run.at = cur.id;
    run.path.push(cur.id);
  }
  if (counts) {
    run.counted++;
    run.countdown = Math.max(0, run.countdown - 1);
    // A course after the last town (its countdown was raised there) earns another chance at a town before the boss.
    run.lastTownVisited = false;
  }
  run.current = null;
  run.status = 'map';
}

/** What a course ended with (from the course rules in play.ts). */
export interface CourseOutcome {
  readonly won: boolean;
  readonly lostBy: 'health' | 'shots' | null;
  readonly health: number;
  readonly wallet: number;
  readonly ability: string | null;
  readonly gear: GearSlots;
  /** Blue stars picked up on the course (carried). */
  readonly blueStars?: number;
  /** Round 2a: food picked up on the course: eaten there (it keeps working afterwards if it lasts) or stashed in the bag. */
  readonly foods?: readonly { readonly id: string; readonly eaten: boolean }[];
}

/** Move the carried blue stars to the stash (owner, 2026-11-17: at a town, or on beating a boss). */
export function deposit(run: RunState): number {
  const n = run.blueStars;
  run.blueStars = 0;
  run.banked += n;
  run.toStash += n;
  return n;
}

/** Blue stars deposited since the last call, for the caller to add to the profile's stash. */
export function drainDeposit(run: RunState): number {
  const n = run.toStash;
  run.toStash = 0;
  return n;
}

/** Blue stars for beating the boss of a region (region 1 first). */
export function bossBlueStars(region: number): number {
  const list = BLUE_STARS.boss;
  if (region > list.length) return list[list.length - 1]! + ENDLESS.bossBlueStars * (region - list.length);
  return list[Math.max(1, region) - 1]!;
}

/** Yellow stars for finishing a node of this type. */
export function rewardFor(type: NodeType): number {
  return type === 'hard' ? RUN.reward.hard : type === 'boss' ? RUN.reward.boss : RUN.reward.course;
}

/**
 * A course is over. Lost: the run ends (owner, 2026-11-15: running out of
 * naps also ends it). Won: carry health, stars, ability and gear back, add the
 * reward, and move on. Beating the boss ends the run with a win.
 */
export function finishCourse(run: RunState, out: CourseOutcome): void {
  const cur = run.current;
  if (!cur || run.status !== 'course') throw new Error('No course is being played.');
  run.totals.stars += Math.max(0, out.wallet - run.wallet);
  run.health = out.health;
  run.wallet = out.wallet;
  run.ability = out.ability;
  run.gear = { ...out.gear };
  run.blueStars += out.blueStars ?? 0;
  if (!out.won) {
    run.status = 'lost';
    run.endedBy = out.lostBy ?? 'health';
    return;
  }
  run.totals.courses++;
  afterCourse(run, out.foods ?? []);
  if (cur.type === 'course') run.blueStars += BLUE_STARS.course;
  else if (cur.type === 'hard') run.blueStars += BLUE_STARS.hard;
  run.wallet += rewardFor(cur.type);
  run.totals.stars += rewardFor(cur.type);
  // Granite Hide: heal after each course.
  for (const c of GEAR_CATEGORIES) {
    for (const fx of (run.gear[c] && GEAR.get(run.gear[c]!)?.effects) || []) if (fx.kind === 'healAfterCourse') run.health += fx.amount;
  }
  clampHealth(run);
  if (cur.type === 'boss') {
    // Owner, 2026-11-17: beating a boss deposits its reward and everything carried at once.
    run.blueStars += bossBlueStars(run.region) + (cur.early ? run.countdown * BLUE_STARS.earlyPerStep : 0);
    deposit(run);
    run.bossesBeaten.push(cur.boss ?? bossOf(run));
    // DESIGN.md open question 7: beating a boss heals fully.
    run.health = runStats(run).get('maxHealth');
    run.current = null;
    run.reward = bossReward(run);
    if (run.region === LAST_REGION) {
      // The final boss: the run is won (Milestone 8). It may carry on into endless mode (keepGoing).
      run.beatFinal = true;
      run.status = 'won';
      run.endedBy = 'boss';
      return;
    }
    run.status = 'reward';
    return;
  }
  arrive(run, true);
}

// ---------------------------------------------------------------------------
// After the boss: the reward and the next region (Milestone 7 sheet section 7)

/** Three gear items on the better odds column, all different. */
function bossReward(run: RunState): Offer[] {
  const rng = rngFor(run, `bossreward:${run.region}`);
  const out: Offer[] = [];
  for (let i = 0; i < 3; i++) {
    const id = rollGear(run, rng, { better: true, exclude: out.map((o) => o.id) });
    if (id) out.push({ kind: 'gear', id, sold: false });
  }
  return out;
}

/**
 * After the final boss (owner, 2026-11-18): carry on into endless mode. The
 * boss reward (a gear pick) is offered as after any boss, then region four
 * starts. Returns false if the run cannot carry on.
 */
export function keepGoing(run: RunState): boolean {
  if (run.status !== 'won' || !run.beatFinal || run.region !== LAST_REGION) return false;
  run.status = 'reward';
  run.endedBy = null;
  return true;
}

/** Endless mode: past the final boss's region. */
export function isEndless(run: RunState): boolean {
  return run.region > LAST_REGION;
}

/** Take reward `i` (or none, with null), then the next region starts on `nextMap` (src/gen/runMap.ts, region + 1). */
export function takeBossReward(run: RunState, i: number | null, nextMap: RunMap): void {
  if (run.status !== 'reward') return;
  const offer = i === null ? undefined : run.reward?.[i];
  if (offer) setGear(run, offer.id);
  run.reward = null;
  startRegion(run, run.region + 1, nextMap);
}

/** A new region: a new map from the run seed, the countdown back to 7, raises and counted nodes back to 0. */
export function startRegion(run: RunState, region: number, map: RunMap): void {
  run.region = region;
  run.map = map;
  run.at = null;
  // The path is drawn on the region's map, so it starts again.
  run.path.length = 0;
  run.countdown = RUN.countdown;
  run.raises = 0;
  run.counted = 0;
  run.lastTownVisited = false;
  run.current = null;
  run.shop = null;
  run.foodShop = null;
  run.cache = null;
  run.status = 'map';
}

// ---------------------------------------------------------------------------
// The shops (Milestone 6 sheet section 7; round 2a sheet section 3, owner
// 2026-11-21): every town has a gear shop (`run.shop`, gear only) and a food
// shop (`run.foodShop`). Each has its own stock and its own rerolls.

function shopOf(run: RunState, which: ShopKind): ShopState | null {
  return which === 'food' ? run.foodShop : run.shop;
}

/** How many courses a food lasts: 1, 2 or 3 (owner, 2026-11-21: 50%, 30%, 20%). */
function rollCourses(rng: Rng): number {
  return 1 + rng.weighted(FOOD.durationWeights);
}

/** A food's price in yellow stars before the shop prices stat (sheet section 4.5). */
function foodPrice(run: RunState, id: string, courses: number): number {
  const f = FOODS.get(id);
  if (!f) return 0;
  if (f.kind === 'heal') return FOOD.applePrice;
  if (f.kind === 'raise') return FOOD.garlicPrice;
  const one = f.kind === 'acorn' ? (FOOD.acornPrice[id] ?? 0) : FOOD.statPrice + FOOD.statPricePerRegion * (Math.max(1, run.region) - 1);
  return Math.round(one * (FOOD.durationPrice[Math.max(1, courses) - 1] ?? 1));
}

/** An offer's price in yellow stars, after the shop prices stat. */
export function priceOf(run: RunState, offer: Offer): number {
  let base: number;
  if (offer.kind === 'gear') base = GEAR.get(offer.id)!.price;
  else if (offer.kind === 'food') base = foodPrice(run, offer.id, offer.courses ?? 0);
  else if (offer.kind === 'upgrade') base = UPGRADE_PRICE.base + UPGRADE_PRICE.perRegion * (Math.max(1, run.region) - 1);
  else if (offer.kind === 'heal') base = RUN.shop.heal.price;
  else if (offer.kind === 'acorn') base = ACORNS.get(offer.id)!.price;
  else base = RUN.shop.raise.price;
  return Math.max(0, Math.round(base * runStats(run).get('shopPrices')));
}

/** The next reroll's price in one shop: 3, then 6, 12... Four-Leaf Clover makes the first one in each shop free. */
export function rerollPrice(run: RunState, which: ShopKind = 'gear'): number {
  const shop = shopOf(run, which);
  if (!shop) return 0;
  if (shop.rerolls === 0 && hasRunEffect(run, 'freeReroll')) return 0;
  const paid = shop.rerolls - shop.freeRerolls;
  return Math.max(1, Math.round(RUN.shop.rerollStart * 2 ** paid * runStats(run).get('shopPrices')));
}

function canRaise(run: RunState, shop: ShopState): boolean {
  return !shop.raised && run.raises < RUN.maxRaises;
}

/** Fill every unsold slot of the gear shop with gear (round 2a: 3 items, gear only). */
function shopStock(run: RunState, shop: ShopState, keep: readonly Offer[]): Offer[] {
  const rng = rngFor(run, `shop:${shop.node}:${shop.rerolls}`);
  const out: Offer[] = [];
  const takenGear = keep.filter((o) => o.sold && o.kind === 'gear').map((o) => o.id);
  for (let i = 0; i < FOOD.gearOffers; i++) {
    const k = keep[i];
    if (k && k.sold) {
      out.push(k);
      continue;
    }
    const id = rollGear(run, rng, { exclude: [...takenGear, ...out.filter((o) => o.kind === 'gear').map((o) => o.id)] });
    if (id) out.push({ kind: 'gear', id, sold: false });
  }
  return out;
}

/** Open the town's food shop. */
export function openFoodShop(run: RunState): void {
  const node = run.shop?.node ?? run.current?.id ?? 'town';
  run.foodShop = { node, offers: [], rerolls: 0, freeRerolls: 0, raised: false };
  run.foodShop.offers = foodStock(run, run.foodShop, []);
}

/**
 * Fill every unsold slot of the food shop (sheet section 4.4): picked by
 * weight, no food twice; no Apple at full health, no Garlic when no raise is
 * left; which acorn follows the region's rarity odds. Each food rolls how many
 * courses it lasts.
 */
function foodStock(run: RunState, shop: ShopState, keep: readonly Offer[]): Offer[] {
  const rng = rngFor(run, `food:${shop.node}:${shop.rerolls}`);
  const out: Offer[] = [];
  for (let i = 0; i < FOOD.foodOffers; i++) {
    const k = keep[i];
    if (k && k.sold) {
      out.push(k);
      continue;
    }
    const has = (id: string) => out.some((o) => o.id === id) || keep.some((o) => o.sold && o.id === id);
    const hasAcorn = out.some((o) => FOODS.get(o.id)?.kind === 'acorn');
    const options: { id: string; weight: number }[] = [];
    for (const f of FOOD_LIST) {
      if (f.kind === 'acorn' || has(f.id)) continue;
      if (f.kind === 'heal' && run.health >= runStats(run).get('maxHealth')) continue;
      if (f.kind === 'raise' && !canRaise(run, shop)) continue;
      options.push({ id: f.id, weight: f.weight });
    }
    if (!hasAcorn) options.push({ id: 'acorn', weight: ACORN_SHOP_WEIGHT });
    if (!options.length) break;
    let id = options[rng.weighted(options.map((o) => o.weight))]!.id;
    if (id === 'acorn') id = ACORN_LIST[rng.weighted(acornWeights(dropWeights(run)))]!.id;
    out.push({ kind: 'food', id, sold: false, courses: isInstantFood(id) ? 0 : rollCourses(rng) });
  }
  return out;
}

/** Why an offer cannot be bought now, or null if it can. */
export function cannotBuy(run: RunState, offer: Offer, free = false): string | null {
  if (offer.sold) return 'SOLD';
  if (!free && priceOf(run, offer) > run.wallet) return 'NOT ENOUGH STARS';
  if (offer.kind === 'food') {
    if (run.bag.length >= FOOD.bagSlots) return 'BAG IS FULL';
    if (FOODS.get(offer.id)?.kind === 'raise' && run.foodShop && !canRaise(run, run.foodShop)) return 'NO RAISES LEFT';
    return null;
  }
  if (offer.kind === 'heal' && run.health >= runStats(run).get('maxHealth')) return 'HEALTH IS FULL';
  if (offer.kind === 'raise' && run.shop && !canRaise(run, run.shop)) return 'NO RAISES LEFT';
  if (offer.kind === 'acorn' && run.bag.length >= FOOD.bagSlots) return 'BAG IS FULL';
  return null;
}

function applyOffer(run: RunState, offer: Offer): void {
  if (offer.kind === 'gear') setGear(run, offer.id);
  else if (offer.kind === 'food') {
    run.bag.push({ id: offer.id, courses: offer.courses ?? 0 });
    // Garlic: once per shop, as Delay the Boss was.
    if (FOODS.get(offer.id)?.kind === 'raise' && run.foodShop) run.foodShop.raised = true;
  } else if (offer.kind === 'upgrade') addUpgrade(run, offer.id);
  else if (offer.kind === 'heal') {
    run.health += run.status === 'cache' ? RUN.cache.heal : RUN.shop.heal.amount;
    clampHealth(run);
  } else if (offer.kind === 'acorn') {
    run.bag.push({ id: offer.id, courses: 1 });
  } else {
    run.countdown++;
    run.raises++;
    if (run.shop) run.shop.raised = true;
  }
}

/** Buy offer `i` in one of the town's shops. Returns null, or the reason it could not be bought. */
export function buy(run: RunState, i: number, which: ShopKind = 'gear'): string | null {
  const shop = shopOf(run, which);
  const offer = shop?.offers[i];
  if (!shop || run.status !== 'shop' || !offer) return 'NOTHING THERE';
  const why = cannotBuy(run, offer);
  if (why) return why;
  run.wallet -= priceOf(run, offer);
  applyOffer(run, offer);
  offer.sold = true;
  return null;
}

/** Replace every unsold offer in one shop. Returns null, or why it could not be done. */
export function reroll(run: RunState, which: ShopKind = 'gear'): string | null {
  const shop = shopOf(run, which);
  if (!shop || run.status !== 'shop') return 'NOT IN A SHOP';
  const price = rerollPrice(run, which);
  if (price > run.wallet) return 'NOT ENOUGH STARS';
  run.wallet -= price;
  if (price === 0) shop.freeRerolls++;
  shop.rerolls++;
  shop.offers = which === 'food' ? foodStock(run, shop, shop.offers) : shopStock(run, shop, shop.offers);
  return null;
}

/** Leave the town. Owner, 2026-11-15: a shop does not lower the boss countdown. */
export function leaveShop(run: RunState): void {
  if (run.status !== 'shop') return;
  run.shop = null;
  run.foodShop = null;
  arrive(run, false);
}

// ---------------------------------------------------------------------------
// The food bag (round 2a sheet section 4; owner, 2026-11-21)

/** Food can be eaten between courses: on the map or in a town. Never during a course. */
export function canEat(run: RunState): boolean {
  return run.status === 'map' || run.status === 'shop';
}

/** Why bag item `i` cannot be eaten now, or null. */
export function cannotEat(run: RunState, i: number): string | null {
  const item = run.bag[i];
  if (!item) return 'NOTHING THERE';
  if (!canEat(run)) return 'NOT DURING A COURSE';
  const kind = FOODS.get(item.id)?.kind;
  if (kind === 'heal' && run.health >= runStats(run).get('maxHealth')) return 'HEALTH IS FULL';
  if (kind === 'raise' && run.raises >= RUN.maxRaises) return 'NO RAISES LEFT';
  return null;
}

/**
 * Eat bag item `i` (owner, 2026-11-21: any number before a course). Apple and
 * Garlic work at once; the rest work from the next course for as many courses
 * as they last. Returns null, or why it could not be eaten.
 */
export function eat(run: RunState, i: number): string | null {
  const why = cannotEat(run, i);
  if (why) return why;
  const item = run.bag.splice(i, 1)[0]!;
  const f = FOODS.get(item.id)!;
  if (f.kind === 'heal') {
    run.health += FOOD.appleHeal;
  } else if (f.kind === 'raise') {
    run.countdown++;
    run.raises++;
  } else {
    run.fed.push({ id: item.id, left: Math.max(1, item.courses) });
    // Mushroom Stew also heals when eaten (as Tough Shell did when bought).
    if (f.kind === 'stat') run.health += UPGRADES.get(item.id)?.heal ?? 0;
  }
  clampHealth(run);
  return null;
}

/**
 * After a course is won: every food eaten counts one course down and stops
 * working at 0 (max health trimmed). Food picked up on the course (owner,
 * 2026-11-21): stashed food goes into the bag; food eaten there has already
 * had this course as its first, and keeps working for the rest it lasts.
 */
function afterCourse(run: RunState, foods: readonly { readonly id: string; readonly eaten: boolean }[]): void {
  for (const f of run.fed) f.left--;
  run.fed = run.fed.filter((f) => f.left > 0);
  const rng = rngFor(run, `found:${run.region}:${run.counted}:${run.totals.courses}`);
  for (const { id, eaten } of foods) {
    const courses = isInstantFood(id) ? 0 : rollCourses(rng);
    if (!eaten && run.bag.length < FOOD.bagSlots) run.bag.push({ id, courses });
    else if (FOODS.get(id)?.kind === 'raise') {
      if (run.raises < RUN.maxRaises) {
        run.countdown++;
        run.raises++;
      }
    } else if (courses > 1) run.fed.push({ id, left: courses - 1 });
  }
  clampHealth(run);
}

// ---------------------------------------------------------------------------
// The Burrow (owner, 2026-11-15): in a town, swap an equipped item with the one stored in its category.

/**
 * Swap the equipped item of a category with the Burrow's: store it, take the
 * stored one out, or both at once. Free. Returns false if there is nothing to swap.
 */
export function burrowSwap(run: RunState, c: GearCategory): boolean {
  if (run.status !== 'shop') return false;
  const worn = run.gear[c];
  const stored = run.burrow[c];
  if (!worn && !stored) return false;
  run.gear[c] = stored;
  run.burrow[c] = worn;
  clampHealth(run);
  return true;
}

// ---------------------------------------------------------------------------
// The cache (sheet section 8): a free pick of one from three.

function cacheStock(run: RunState, node: string): Offer[] {
  const rng = rngFor(run, `cache:${node}`);
  const out: Offer[] = [];
  const g = rollGear(run, rng);
  if (g) out.push({ kind: 'gear', id: g, sold: false });
  out.push({ kind: 'upgrade', id: rng.pick(UPGRADE_LIST).id, sold: false });
  out.push({ kind: 'heal', id: 'heal', sold: false });
  return out;
}

/** Take offer `i` from the cache (free; an upgrade does not raise its shop price). Taking one finishes the node. */
export function takeFromCache(run: RunState, i: number): string | null {
  const cache = run.cache;
  const offer = cache?.offers[i];
  if (!cache || run.status !== 'cache' || !offer) return 'NOTHING THERE';
  const why = cannotBuy(run, offer, true);
  if (why) return why;
  applyOffer(run, offer);
  offer.sold = true;
  leaveCache(run);
  return null;
}

/** Leave the cache, with or without taking something. A cache counts as a finished node. */
export function leaveCache(run: RunState): void {
  if (run.status !== 'cache') return;
  run.cache = null;
  arrive(run, true);
}

// ---------------------------------------------------------------------------
// Permanent upgrades bought in a town's Burrow (owner, 2026-11-17, question I)

/**
 * Buy a permanent upgrade level in a town, mid-run: the profile pays from its
 * stash and the level works at once for the rest of this run. Returns null,
 * or why it could not be bought.
 */
export function buyPermanentInTown(run: RunState, profile: Profile, id: string): string | null {
  if (run.status !== 'shop') return 'ONLY IN A TOWN';
  const why = buyUpgrade(profile, id);
  if (why) return why;
  run.permanent[id] = (run.permanent[id] ?? 0) + 1;
  run.health += PERMANENT_UPGRADES.get(id)?.heal ?? 0;
  clampHealth(run);
  return null;
}

// ---------------------------------------------------------------------------
// Testing aids (the U panel)

export function debugAddStars(run: RunState, n: number): void {
  run.wallet += n;
}

export function debugSetCountdown(run: RunState, n: number): void {
  run.countdown = Math.max(0, Math.round(n));
}
