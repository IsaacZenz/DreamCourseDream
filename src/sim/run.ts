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
 * Milestone 7 (design sheet docs/plans/milestone-7.md, signed off by the owner
 * 2026-11-16): the boss is a generated bug boss fought in its arena. Beating it
 * heals fully, gives blue stars and a choice of gear, and starts region two
 * (a new map, a higher budget, a different bug at its end). After region two's
 * boss the run is complete.
 *
 * Owner, 2026-11-15: a shop node is a little town with the shop and the
 * player's Burrow (home base). The Burrow, its hold and the blue star stash
 * live in the player's profile (src/sim/profile.ts), which is kept between
 * runs; the run holds a reference to it.
 *
 * Owner, 2026-11-16: blue stars earned in a run are carried, and become safe
 * only when stashed: by visiting the Burrow, or by defeating a boss. Yellow
 * stars are only ever carried.
 */
import { CHARACTERS, DEFAULT_CHARACTER } from '../content/characters.ts';
import { GEAR, GEAR_CATEGORIES, GEAR_LIST, LUCK_SHIFT, NO_GEAR, RARITIES, RARITY_ODDS, type GearCategory, type GearDef, type GearSlots } from '../content/gear.ts';
import { RUN, UPGRADE_LIST, UPGRADE_PRICE, UPGRADES, type NodeType } from '../content/run.ts';
import { BOSS_REGIONS, type BugId } from '../content/bosses.ts';
import { bossBlueStars, type BossSpec } from './boss.ts';
import { newProfile, permanentModifiers, sellValue, startingAbilityOf, type Burrow, type LastRun, type Profile } from './profile.ts';
import { Rng } from './rng.ts';
import { StatSheet, type Modifier } from './stats.ts';
import type { Loadout } from './play.ts';

export type { Burrow } from './profile.ts';

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

/** reward: choosing the boss's gear prize. region: waiting for the caller to start the next region (it makes the map). */
export type RunStatus = 'map' | 'course' | 'shop' | 'cache' | 'reward' | 'region' | 'won' | 'lost';

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
  /** Milestone 7: the boss to fight, on a boss node. */
  readonly boss: BossSpec | null;
}

export interface Offer {
  readonly kind: 'gear' | 'upgrade' | 'heal' | 'raise';
  readonly id: string;
  sold: boolean;
}

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

export interface RunState {
  readonly seed: string;
  /** What is kept between runs (stash, upgrades, Burrow, hold). Shared with the caller, who saves it. */
  readonly profile: Profile;
  /** The Burrow's contents (the profile's). Changed only in a town. */
  readonly burrow: Burrow;
  map: RunMap;
  /** Milestone 7: the region (1 or 2) and its boss, picked when the region starts so the map can show it. */
  region: number;
  boss: BossSpec;
  /** Bugs met in this run (owner, 2026-11-16: never the same bug twice). */
  readonly met: BugId[];
  /** Permanent upgrades, as modifiers, fixed when the run starts. */
  readonly permanent: readonly Modifier[];
  /** The boss's gear prize: one item per category to choose from (or skip). */
  reward: { readonly offers: readonly string[] } | null;
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
  /** Blue stars carried (owner, 2026-11-16): lost if the run ends, safe once stashed in the Burrow or by beating a boss. */
  blueStars: number;
  ability: string | null;
  gear: { -readonly [C in GearCategory]: string | null };
  /** Times each run upgrade was bought (or taken from a cache). */
  readonly upgrades: Record<string, number>;
  /** Times each upgrade was bought in a shop, for its rising price. Caches do not raise it. */
  readonly bought: Record<string, number>;
  shop: ShopState | null;
  cache: CacheState | null;
  /** For the run summary. */
  readonly totals: { courses: number; stars: number; blueEarned: number; blueStashed: number; blueLost: number; bosses: number };
  /** What ended the run. left: the game was closed away from a town (owner, 2026-11-16). */
  endedBy: 'health' | 'shots' | 'boss' | 'left' | null;
  /** The last town before the forced boss has been offered and visited (owner, 2026-11-15). */
  lastTownVisited: boolean;
}

/** A boss used where none was picked (tests): the first built combination. */
export const DEFAULT_BOSS: BossSpec = { bug: 'goliath', colour: 'red', skill: 'slam', region: 1 };

/**
 * Start a run. The caller makes the map and picks the boss (src/gen/), and
 * passes the player's profile: its permanent upgrades, starting ability and
 * Burrow apply to the run.
 */
export function createRun(seed: string, map: RunMap, profile: Profile = newProfile(), boss: BossSpec = DEFAULT_BOSS): RunState {
  for (const c of GEAR_CATEGORIES) profile.burrow[c] = validGear(profile.burrow[c], c);
  const run: RunState = {
    seed,
    profile,
    burrow: profile.burrow,
    map,
    region: 1,
    boss,
    met: [boss.bug],
    permanent: permanentModifiers(profile),
    reward: null,
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
    ability: startingAbilityOf(profile) ?? CHARACTERS.get(DEFAULT_CHARACTER)!.startingAbility,
    gear: { ...NO_GEAR },
    upgrades: {},
    bought: {},
    shop: null,
    cache: null,
    totals: { courses: 0, stars: 0, blueEarned: 0, blueStashed: 0, blueLost: 0, bosses: 0 },
    endedBy: null,
    lastTownVisited: false,
  };
  const stats = runStats(run);
  run.health = stats.get('maxHealth');
  // Head Start (Milestone 7).
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
  const out: Modifier[] = [...run.permanent];
  for (const u of UPGRADE_LIST) {
    for (let i = 0; i < (run.upgrades[u.id] ?? 0); i++) out.push({ stat: u.stat, op: u.op, amount: u.amount, source: { kind: 'run', id: u.id }, duration: { kind: 'run' } });
  }
  return out;
}

/** The ball's stat sheet between courses: the character, permanent upgrades, run upgrades and gear. */
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
  return { health: run.health, ability: run.ability, gear: { ...run.gear }, wallet: run.wallet, modifiers: upgradeModifiers(run) };
}

/**
 * What the generator's bot plays with: the player's stats, gear and ability at
 * this point, but full health (sheet section 4.3), so a course entered on low
 * health can still be generated.
 */
export function botLoadoutOf(run: RunState): Loadout {
  return { ability: run.ability, gear: { ...run.gear }, modifiers: upgradeModifiers(run) };
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

/** The budget of a course node (sheet section 4.1): 8 + 2 per counted node, hard courses ×1.5, capped. */
export function budgetFor(run: RunState, type: NodeType): number {
  const b = RUN.budget;
  // Milestone 7: region two starts higher (sheet section 6).
  const start = b.regionStart[run.region - 1] ?? b.regionStart[b.regionStart.length - 1]!;
  const plain = start + b.perNode * run.counted;
  const scaled = type === 'hard' || type === 'boss' ? Math.floor(plain * b.hardScale) : plain;
  return Math.min(b.cap, scaled);
}

/** Region 1 has an early and a late column of rarity odds (sheet section 5.2). */
function oddsColumn(run: RunState, better: boolean): number {
  // Region 1: early, then late. Region 2 has its own column (Milestone 6 sheet section 5.2).
  const base = run.region >= 2 ? run.region : run.counted >= RUN.lateAfter ? 1 : 0;
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
export function rollGear(run: RunState, rng: Rng, opts: { better?: boolean; category?: GearCategory; exclude?: readonly string[]; column?: number } = {}): string | null {
  const held = new Set([...GEAR_CATEGORIES.map((c) => run.gear[c]), ...(opts.exclude ?? [])]);
  const pool = (r: string): GearDef[] => GEAR_LIST.filter((g) => g.rarity === r && !held.has(g.id) && (!opts.category || g.category === opts.category));
  const weights = rarityWeights(opts.column ?? oddsColumn(run, !!opts.better), runStats(run).get('dropLuck')).map((w, i) => (pool(RARITIES[i]!).length ? w : 0));
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
  // The boss arena has no gear on it: the boss's prize is chosen after the fight.
  if (isCourse && type !== 'boss') {
    const rng = rngFor(run, `coursegear:${id}:${run.counted}`);
    const always = type !== 'course';
    if (always || rng.chance(RUN.courseGearChance)) gear = rollGear(run, rng, { better: always, category: rng.pick(GEAR_CATEGORIES) });
  }
  run.current = {
    id,
    row: node.row,
    type,
    early: type === 'boss' && run.countdown > 0,
    budget: isCourse ? budgetFor(run, type) : 0,
    courseSeed: `${run.seed}-${run.region > 1 ? `R${run.region}-` : ''}${id === 'boss' ? `BOSS${node.row}` : id === LAST_TOWN ? 'LASTTOWN' : id.toUpperCase()}`,
    gear,
    boss: type === 'boss' ? run.boss : null,
  };
  if (type === 'shop') {
    run.status = 'shop';
    run.shop = { node: id, offers: [], rerolls: 0, freeRerolls: 0, raised: false };
    run.shop.offers = shopStock(run, run.shop, []);
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
  /** Milestone 7: blue stars picked up on the course (crates, cracked tiles). */
  readonly blueStars?: number;
}

/** Blue stars for finishing a course (sheet section 4.1). */
function courseBlue(run: RunState, cur: CurrentNode): number {
  if (cur.type === 'hard') return RUN.blue.hard;
  if (cur.type === 'course') return rngFor(run, `blue:${cur.courseSeed}`).chance(RUN.blue.courseChance) ? RUN.blue.course : 0;
  return 0;
}

/** Owner, 2026-11-16: blue stars carried become safe. Returns how many were stashed. */
function stash(run: RunState): number {
  const n = run.blueStars;
  run.profile.stash += n;
  run.totals.blueStashed += n;
  run.blueStars = 0;
  return n;
}

function earnBlue(run: RunState, n: number): void {
  run.blueStars += n;
  run.totals.blueEarned += n;
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
  earnBlue(run, out.blueStars ?? 0);
  if (!out.won) {
    endRun(run, out.lostBy === 'shots' ? 'shots' : 'died');
    return;
  }
  run.totals.courses++;
  run.wallet += rewardFor(cur.type);
  run.totals.stars += rewardFor(cur.type);
  // Granite Hide: heal after each course.
  for (const c of GEAR_CATEGORIES) {
    for (const fx of (run.gear[c] && GEAR.get(run.gear[c]!)?.effects) || []) if (fx.kind === 'healAfterCourse') run.health += fx.amount;
  }
  clampHealth(run);
  if (cur.type === 'boss') {
    // Sheet section 2.9: blue stars, a full heal, and a choice of gear. Owner, 2026-11-16: beating a boss stashes the blue stars carried.
    earnBlue(run, bossBlueStars(cur.boss ?? run.boss) + (cur.early ? run.countdown * RUN.earlyBossBluePerStep : 0));
    stash(run);
    run.totals.bosses++;
    run.health = runStats(run).get('maxHealth');
    run.current = null;
    run.reward = { offers: rewardOffers(run) };
    run.status = 'reward';
    return;
  }
  earnBlue(run, courseBlue(run, cur));
  arrive(run, true);
}

/** One weapon, one armour, one bauble, a rarity better than the late odds (sheet section 2.9). */
function rewardOffers(run: RunState): string[] {
  const rng = rngFor(run, `reward:${run.region}`);
  const out: string[] = [];
  for (const c of GEAR_CATEGORIES) {
    const id = rollGear(run, rng, { better: true, category: c, exclude: out, column: Math.min(RARITY_ODDS.length - 1, Math.max(1, run.region) + 1) });
    if (id) out.push(id);
  }
  return out;
}

/**
 * Take the boss's prize (an index into the offers), or skip it (null). Owner,
 * 2026-11-16: the item it replaces goes to the Burrow, or to the hold if that
 * Burrow slot is full. Then the next region, or the end of the run.
 */
export function chooseReward(run: RunState, i: number | null): string | null {
  if (run.status !== 'reward' || !run.reward) return 'NO PRIZE TO CHOOSE';
  if (i !== null) {
    const id = run.reward.offers[i];
    if (!id) return 'NOTHING THERE';
    const old = setGear(run, id);
    if (old) {
      const c = GEAR.get(old)!.category;
      if (!run.burrow[c]) run.burrow[c] = old;
      else run.profile.hold.push(old);
    }
  }
  run.reward = null;
  if (run.region < BOSS_REGIONS.length) run.status = 'region';
  else endRun(run, 'won');
  return null;
}

/** Start the next region with its new map and boss (made by the caller, src/gen/). */
export function startRegion(run: RunState, map: RunMap, boss: BossSpec): void {
  if (run.status !== 'region') throw new Error('No region to start.');
  run.region++;
  run.map = map;
  run.boss = boss;
  run.met.push(boss.bug);
  run.at = null;
  run.path.length = 0;
  run.countdown = RUN.countdown;
  run.raises = 0;
  run.counted = 0;
  run.lastTownVisited = false;
  run.status = 'map';
}

/** The run is over. Blue stars still carried are lost (owner, 2026-11-16); the profile keeps one line about it. */
export function endRun(run: RunState, result: LastRun['result']): void {
  run.current = null;
  run.shop = null;
  run.cache = null;
  run.reward = null;
  run.status = result === 'won' ? 'won' : 'lost';
  run.endedBy = result === 'won' ? 'boss' : result === 'shots' ? 'shots' : result === 'left' ? 'left' : 'health';
  if (result === 'won') stash(run);
  run.totals.blueLost = run.blueStars;
  run.blueStars = 0;
  run.profile.lastRun = { result, region: run.region, row: rowOf(run), blueStashed: run.totals.blueStashed, blueLost: run.totals.blueLost };
}

// ---------------------------------------------------------------------------
// The shop (sheet section 7)

function upgradePrice(run: RunState, id: string): number {
  return UPGRADE_PRICE.base + UPGRADE_PRICE.step * (run.bought[id] ?? 0);
}

/** An offer's price in yellow stars, after the shop prices stat. */
export function priceOf(run: RunState, offer: Offer): number {
  let base: number;
  if (offer.kind === 'gear') base = GEAR.get(offer.id)!.price;
  else if (offer.kind === 'upgrade') base = upgradePrice(run, offer.id);
  else if (offer.kind === 'heal') base = RUN.shop.heal.price;
  else base = RUN.shop.raise.price;
  return Math.max(0, Math.round(base * runStats(run).get('shopPrices')));
}

/** The next reroll's price: 3, then 6, 12... Four-Leaf Clover makes the first one in each shop free. */
export function rerollPrice(run: RunState): number {
  const shop = run.shop;
  if (!shop) return 0;
  if (shop.rerolls === 0 && hasRunEffect(run, 'freeReroll')) return 0;
  const paid = shop.rerolls - shop.freeRerolls;
  return Math.max(1, Math.round(RUN.shop.rerollStart * 2 ** paid * runStats(run).get('shopPrices')));
}

function canRaise(run: RunState, shop: ShopState): boolean {
  return !shop.raised && run.raises < RUN.maxRaises;
}

/** Fill every unsold slot: two gear items, two upgrades, one service. */
function shopStock(run: RunState, shop: ShopState, keep: readonly Offer[]): Offer[] {
  const rng = rngFor(run, `shop:${shop.node}:${shop.rerolls}`);
  const old = (i: number) => keep[i] && keep[i]!.sold ? keep[i]! : null;
  const out: Offer[] = [];
  const takenGear = keep.filter((o) => o.sold && o.kind === 'gear').map((o) => o.id);
  for (let i = 0; i < RUN.shop.gearOffers; i++) {
    const k = old(i);
    if (k) {
      out.push(k);
      continue;
    }
    const id = rollGear(run, rng, { exclude: [...takenGear, ...out.filter((o) => o.kind === 'gear').map((o) => o.id)] });
    out.push(id ? { kind: 'gear', id, sold: false } : { kind: 'heal', id: 'heal', sold: false });
  }
  const ups = rng.shuffle([...UPGRADE_LIST.map((u) => u.id)]);
  for (let i = 0; i < RUN.shop.upgradeOffers; i++) {
    const slot = RUN.shop.gearOffers + i;
    const k = old(slot);
    out.push(k ?? { kind: 'upgrade', id: ups.find((u) => !out.some((o) => o.kind === 'upgrade' && o.id === u))!, sold: false });
  }
  const slot = RUN.shop.gearOffers + RUN.shop.upgradeOffers;
  const k = old(slot);
  const raise = canRaise(run, shop) && rng.chance(0.5);
  out.push(k ?? { kind: raise ? 'raise' : 'heal', id: raise ? 'raise' : 'heal', sold: false });
  return out;
}

/** Why an offer cannot be bought now, or null if it can. */
export function cannotBuy(run: RunState, offer: Offer, free = false): string | null {
  if (offer.sold) return 'SOLD';
  if (!free && priceOf(run, offer) > run.wallet) return 'NOT ENOUGH STARS';
  if (offer.kind === 'heal' && run.health >= runStats(run).get('maxHealth')) return 'HEALTH IS FULL';
  if (offer.kind === 'raise' && run.shop && !canRaise(run, run.shop)) return 'NO RAISES LEFT';
  return null;
}

function applyOffer(run: RunState, offer: Offer): void {
  if (offer.kind === 'gear') setGear(run, offer.id);
  else if (offer.kind === 'upgrade') addUpgrade(run, offer.id);
  else if (offer.kind === 'heal') {
    run.health += run.status === 'cache' ? RUN.cache.heal : RUN.shop.heal.amount;
    clampHealth(run);
  } else {
    run.countdown++;
    run.raises++;
    if (run.shop) run.shop.raised = true;
  }
}

/** Buy offer `i` in the shop. Returns null, or the reason it could not be bought. */
export function buy(run: RunState, i: number): string | null {
  const shop = run.shop;
  const offer = shop?.offers[i];
  if (!shop || run.status !== 'shop' || !offer) return 'NOTHING THERE';
  const why = cannotBuy(run, offer);
  if (why) return why;
  run.wallet -= priceOf(run, offer);
  if (offer.kind === 'upgrade') run.bought[offer.id] = (run.bought[offer.id] ?? 0) + 1;
  applyOffer(run, offer);
  offer.sold = true;
  // A raise bought means the service slot cannot offer another one; nothing else changes.
  return null;
}

/** Replace every unsold offer. Returns null, or why it could not be done. */
export function reroll(run: RunState): string | null {
  const shop = run.shop;
  if (!shop || run.status !== 'shop') return 'NOT IN A SHOP';
  const price = rerollPrice(run);
  if (price > run.wallet) return 'NOT ENOUGH STARS';
  run.wallet -= price;
  if (price === 0) shop.freeRerolls++;
  shop.rerolls++;
  shop.offers = shopStock(run, shop, shop.offers);
  return null;
}

/** Leave the shop. Owner, 2026-11-15: a shop does not lower the boss countdown. */
export function leaveShop(run: RunState): void {
  if (run.status !== 'shop') return;
  run.shop = null;
  arrive(run, false);
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

/**
 * Owner, 2026-11-16: entering the Burrow stashes every blue star carried.
 * Returns how many were stashed.
 */
export function visitBurrow(run: RunState): number {
  if (run.status !== 'shop') return 0;
  return stash(run);
}

/** Owner, 2026-11-16: sell the item housed in the Burrow for 25% of its price, rounded down, in yellow stars. */
export function sellHoused(run: RunState, c: GearCategory): number {
  if (run.status !== 'shop') return 0;
  const id = run.burrow[c];
  if (!id) return 0;
  const n = sellValue(id);
  run.burrow[c] = null;
  run.wallet += n;
  return n;
}

/** Categories with items waiting in the hold: the next Burrow visit sorts them first. */
export function holdCategories(run: RunState): GearCategory[] {
  return GEAR_CATEGORIES.filter((c) => run.profile.hold.some((id) => GEAR.get(id)?.category === c));
}

/** The items to sort in one category: worn first, then housed, then those in the hold. */
export function sortCandidates(run: RunState, c: GearCategory): string[] {
  const out: string[] = [];
  if (run.gear[c]) out.push(run.gear[c]!);
  if (run.burrow[c]) out.push(run.burrow[c]!);
  for (const id of run.profile.hold) if (GEAR.get(id)?.category === c) out.push(id);
  return out;
}

/**
 * Settle one category of the hold (owner, 2026-11-16): choose which candidate
 * to wear and which to house (indexes into `sortCandidates`, or null for
 * none); every other candidate is sold for 25%. Returns the yellow stars
 * gained, or a reason it could not be done.
 */
export function settleCategory(run: RunState, c: GearCategory, wear: number | null, house: number | null): number | string {
  if (run.status !== 'shop') return 'NOT IN A TOWN';
  const list = sortCandidates(run, c);
  if ((wear !== null && !list[wear]) || (house !== null && !list[house])) return 'NOTHING THERE';
  if (wear !== null && wear === house) return 'ONE ITEM CANNOT BE IN TWO PLACES';
  let gained = 0;
  list.forEach((id, i) => {
    if (i !== wear && i !== house) gained += sellValue(id);
  });
  run.gear[c] = wear !== null ? list[wear]! : null;
  run.burrow[c] = house !== null ? list[house]! : null;
  run.profile.hold = run.profile.hold.filter((id) => GEAR.get(id)?.category !== c);
  run.wallet += gained;
  clampHealth(run);
  return gained;
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
// The town save point (owner, 2026-11-15 and 2026-11-16)

/** The fields of a run that are saved at a town. The map is rebuilt from the seed and region; the profile is saved on its own. */
export type SavedRun = Omit<RunState, 'profile' | 'burrow' | 'map'>;

export function saveRun(run: RunState): SavedRun {
  const { profile, burrow, map, ...rest } = run;
  void profile;
  void burrow;
  void map;
  return JSON.parse(JSON.stringify(rest)) as SavedRun;
}

/**
 * Rebuild a run saved at a town. `map` is the region's map made again from the
 * seed. Returns null if the saved data does not look like a run in a town.
 */
export function restoreRun(raw: unknown, map: RunMap, profile: Profile): RunState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as SavedRun;
  if (typeof r.seed !== 'string' || r.status !== 'shop' || !r.shop || !r.current || typeof r.region !== 'number' || !r.boss) return null;
  if (typeof r.health !== 'number' || typeof r.wallet !== 'number' || !r.gear || !r.upgrades || !r.totals) return null;
  const run: RunState = { ...r, profile, burrow: profile.burrow, map, path: [...r.path], met: [...r.met], permanent: [...r.permanent] } as RunState;
  for (const c of GEAR_CATEGORIES) run.gear[c] = validGear(run.gear[c], c);
  if (run.ability !== null && typeof run.ability !== 'string') run.ability = null;
  if (run.at !== null && !nodeById(map, run.at)) return null;
  clampHealth(run);
  return run;
}

// ---------------------------------------------------------------------------
// Testing aids (the U panel)

export function debugAddStars(run: RunState, n: number): void {
  run.wallet += n;
}

export function debugSetCountdown(run: RunState, n: number): void {
  run.countdown = Math.max(0, Math.round(n));
}

export function debugAddBlue(run: RunState, n: number): void {
  earnBlue(run, n);
}
