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
import { RUN, UPGRADE_LIST, UPGRADE_PRICE, UPGRADES, type NodeType } from '../content/run.ts';
import { Rng } from './rng.ts';
import { StatSheet, type Modifier } from './stats.ts';
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

export type RunStatus = 'map' | 'course' | 'shop' | 'cache' | 'won' | 'lost';

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

/** The Burrow: one stored gear item per category. Kept between runs (it survives death). */
export type Burrow = { -readonly [C in GearCategory]: string | null };

export interface RunState {
  readonly seed: string;
  /** The Burrow's contents. Changed only in a town; the caller saves it. */
  readonly burrow: Burrow;
  readonly map: RunMap;
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
  /** Counted only until Milestone 7 gives them a wallet (sheet section 2.4). */
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
  readonly totals: { courses: number; stars: number };
  /** What ended the run. */
  endedBy: 'health' | 'shots' | 'boss' | null;
  /** The last town before the forced boss has been offered and visited (owner, 2026-11-15). */
  lastTownVisited: boolean;
}

export function createRun(seed: string, map: RunMap, burrow: GearSlots = NO_GEAR): RunState {
  const run: RunState = {
    seed,
    burrow: { weapon: validGear(burrow.weapon, 'weapon'), armour: validGear(burrow.armour, 'armour'), bauble: validGear(burrow.bauble, 'bauble') },
    map,
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
    ability: CHARACTERS.get(DEFAULT_CHARACTER)!.startingAbility,
    gear: { ...NO_GEAR },
    upgrades: {},
    bought: {},
    shop: null,
    cache: null,
    totals: { courses: 0, stars: 0 },
    endedBy: null,
    lastTownVisited: false,
  };
  run.health = runStats(run).get('maxHealth');
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
  const out: Modifier[] = [];
  for (const u of UPGRADE_LIST) {
    for (let i = 0; i < (run.upgrades[u.id] ?? 0); i++) out.push({ stat: u.stat, op: u.op, amount: u.amount, source: { kind: 'run', id: u.id }, duration: { kind: 'run' } });
  }
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
  const plain = b.start + b.perNode * run.counted;
  const scaled = type === 'hard' || type === 'boss' ? Math.floor(plain * b.hardScale) : plain;
  return Math.min(b.cap, scaled);
}

/** Region 1 has an early and a late column of rarity odds (sheet section 5.2). */
function oddsColumn(run: RunState, better: boolean): number {
  const base = run.counted >= RUN.lateAfter ? 1 : 0;
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
    budget: isCourse ? budgetFor(run, type) : 0,
    courseSeed: `${run.seed}-${id === 'boss' ? `BOSS${node.row}` : id === LAST_TOWN ? 'LASTTOWN' : id.toUpperCase()}`,
    gear,
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
  if (!out.won) {
    run.status = 'lost';
    run.endedBy = out.lostBy ?? 'health';
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
    if (cur.early) run.blueStars += run.countdown * RUN.earlyBossBluePerStep;
    run.current = null;
    run.status = 'won';
    run.endedBy = 'boss';
    return;
  }
  arrive(run, true);
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
// Testing aids (the U panel)

export function debugAddStars(run: RunState, n: number): void {
  run.wallet += n;
}

export function debugSetCountdown(run: RunState, n: number): void {
  run.countdown = Math.max(0, Math.round(n));
}
