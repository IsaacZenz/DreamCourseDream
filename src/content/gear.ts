/**
 * Gear (FEATURES.md section 8; Milestone 6 design sheet, docs/plans/milestone-6.md
 * section 5, signed off by the owner 2026-11-15).
 *
 * Owner, 2026-11-15: six rarities in three pairs, three items per rarity in
 * each of the three categories (54 items). Common to double rare are built as
 * families (one effect, stronger versions with new names); special rare and
 * legendary items each have their own effect. The third category is "bauble".
 *
 * Stat changes are modifiers (FEATURES.md section 1), applied while the item is
 * equipped. Triggered effects are listed by kind; the rules for each kind are
 * in src/sim/play.ts (course effects) and src/sim/run.ts (run effects).
 * Every number is a starting value.
 */
import type { Element } from './objects.ts';
import type { StatId } from './stats.ts';

export const GEAR_CATEGORIES = ['weapon', 'armour', 'bauble'] as const;
export type GearCategory = (typeof GEAR_CATEGORIES)[number];

export const RARITIES = ['common', 'uncommon', 'rare', 'doubleRare', 'specialRare', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

/** Price in yellow stars (before the shop prices stat), and the name shown. */
export const RARITY_INFO: Readonly<Record<Rarity, { readonly name: string; readonly pair: number; readonly price: number }>> = {
  common: { name: 'Common', pair: 1, price: 10 },
  uncommon: { name: 'Uncommon', pair: 1, price: 15 },
  // Owner, 2026-11-19: dearer high-rarity gear (was 25, 35, 50, 70), to match the extra stars Veterans and Elites give.
  rare: { name: 'Rare', pair: 2, price: 30 },
  doubleRare: { name: 'Double rare', pair: 2, price: 45 },
  specialRare: { name: 'Special rare', pair: 3, price: 70 },
  legendary: { name: 'Legendary', pair: 3, price: 100 },
};

/**
 * How likely each rarity is, in percent, in the order of RARITIES (sheet
 * section 5.2). A hard course and the boss use the next column to the right.
 * Regions 2 and 3 arrive in Milestones 7 and 8.
 */
export const RARITY_ODDS = [
  { stage: 'Region 1, early', weights: [70, 25, 5, 0, 0, 0] },
  { stage: 'Region 1, late', weights: [45, 40, 13, 2, 0, 0] },
  { stage: 'Region 2', weights: [15, 35, 30, 15, 5, 0] },
  { stage: 'Region 3', weights: [5, 15, 25, 30, 18, 7] },
] as const;

/**
 * Success rolls (owner, 2026-11-17; Milestone 7 sheet section 4b): a weapon's
 * special effect works only if a spinning wheel lands on a filled slice.
 * Filled slices by the weapon's rarity; the wheel has 10 slices, or 20 against
 * a boss. Plain stat changes and elements always apply.
 */
export const SLICES_BY_RARITY: Readonly<Record<Rarity, number>> = {
  common: 2,
  uncommon: 3,
  rare: 4,
  doubleRare: 5,
  specialRare: 6,
  legendary: 7,
};

/** Drop luck shifts the odds up: each +25% moves this many points from the lowest rarity on offer to the next one up. */
export const LUCK_SHIFT = { per: 0.25, points: 5 } as const;

/** Things gear does that are not plain stat changes. */
export type GearEffect =
  // Weapons: on contact with an enemy.
  /** Hits set the enemy burning for this many turns. */
  | { readonly kind: 'burn'; readonly turns: number }
  /** Round 3 (owner, 2026-11-22): hits poison the enemy for this many turns (on a successful roll). */
  | { readonly kind: 'poison'; readonly turns: number }
  /** A hit stuns the enemy (on a successful roll, Milestone 7). */
  | { readonly kind: 'stun' }
  /** Extra damage on hits against a stunned enemy. */
  | { readonly kind: 'stunnedBonus'; readonly damage: number }
  /** A damaging hit also zaps the nearest other enemy within range. */
  | { readonly kind: 'chainZap'; readonly range: number; readonly damage: number }
  /** Defeating an enemy does not slow the ball. */
  | { readonly kind: 'rollThrough' }
  /** The first damaging hit each shot heals. */
  | { readonly kind: 'leech'; readonly heal: number }
  /** A burning enemy that is defeated bursts and damages enemies nearby. */
  | { readonly kind: 'burst'; readonly radius: number; readonly damage: number }
  /** Hits throw the enemy this many tiles away from the ball (not patrollers, which keep to their path). */
  | { readonly kind: 'knockBack'; readonly distance: number }
  /** The first hit each shot counts twice: double damage and twice the shots back. */
  | { readonly kind: 'echo' }
  // Armour: when the ball takes damage or touches a hazard.
  /** The first `count` damages each course are ignored, from any source. */
  | { readonly kind: 'ignoreDamage'; readonly count: number }
  /** An enemy that damages the ball takes damage back, and may be stunned. */
  | { readonly kind: 'thorns'; readonly damage: number; readonly stun: boolean }
  /** Heal after each course is finished. */
  | { readonly kind: 'healAfterCourse'; readonly amount: number }
  /** A thrown attack (a Spitter's seed) that hits the ball also hits the thrower for the same damage. */
  | { readonly kind: 'mirror' }
  /** Stopping in water and falling off the edge cost no health. */
  | { readonly kind: 'safeFalls' }
  /** Heal at the start of each course. */
  | { readonly kind: 'healAtStart'; readonly amount: number }
  /** Once: when health would drop to 0, stay at this much instead. The item is then lost. */
  | { readonly kind: 'phoenix'; readonly health: number }
  /** These causes of damage cannot hurt the ball. */
  | { readonly kind: 'immune'; readonly causes: readonly ('zap' | 'spikes')[] }
  /** Owner, 2026-11-17 (Fortune's Mail): the first `count` failed success rolls each course spin again. */
  | { readonly kind: 'respin'; readonly count: number }
  // Baubles: always on.
  /** Extra yellow stars in the wallet (not the meter) for each enemy defeated. */
  | { readonly kind: 'starPerDefeat'; readonly stars: number }
  /** Yellow stars count twice in the wallet (the meter counts them once). */
  | { readonly kind: 'walletDouble' }
  /** The first reroll in each shop is free. */
  | { readonly kind: 'freeReroll' }
  /** Owner, 2026-11-17 (Hot Streak Charm): each successful roll fills one more slice for the rest of that shot. */
  | { readonly kind: 'hotStreak' }
  /** Owner, 2026-11-17 (Golden Spinner): the boss wheel has this many slices instead of the usual. */
  | { readonly kind: 'bossWheel'; readonly slices: number };

export interface GearMod {
  readonly stat: StatId;
  readonly op: 'add' | 'mul';
  readonly amount: number;
}

export interface GearDef {
  readonly id: string;
  readonly name: string;
  /** Sprite id, used for the HUD, the shop card and the item lying on a course. */
  readonly icon: string;
  readonly category: GearCategory;
  readonly rarity: Rarity;
  /** Family name for common to double rare; null for the unique items. */
  readonly family: string | null;
  /** Weapons only: the element of its hits. */
  readonly element: Element | null;
  readonly modifiers: readonly GearMod[];
  readonly effects: readonly GearEffect[];
  /** Weapons: filled slices on the success wheel (owner, 2026-11-17). 0 for armour and baubles (their slice perks are the rollSlices and bossSlices stats). */
  readonly slices: number;
  /** One short line for cards and messages. */
  readonly desc: string;
  readonly price: number;
}

type Entry = Omit<GearDef, 'id' | 'icon' | 'price' | 'element' | 'modifiers' | 'effects' | 'family' | 'slices'> & {
  /** Weapons: leave out to use the rarity's number (SLICES_BY_RARITY). */
  slices?: number;
  element?: Element;
  modifiers?: readonly GearMod[];
  effects?: readonly GearEffect[];
  family?: string;
};

const add = (stat: StatId, amount: number): GearMod => ({ stat, op: 'add', amount });
const mul = (stat: StatId, amount: number): GearMod => ({ stat, op: 'mul', amount });

const entries: readonly Entry[] = [
  // --- Weapons -------------------------------------------------------------
  // Shell family: more damage.
  { name: 'Studded Shell', category: 'weapon', rarity: 'common', family: 'Shell', modifiers: [add('hitDamage', 1)], desc: 'Hit damage +1' },
  { name: 'Spiked Shell', category: 'weapon', rarity: 'uncommon', family: 'Shell', modifiers: [add('hitDamage', 1), add('shotPower', 0.05)], desc: 'Hit damage +1, shot power +5%' },
  { name: 'Iron Shell', category: 'weapon', rarity: 'rare', family: 'Shell', modifiers: [add('hitDamage', 2)], desc: 'Hit damage +2' },
  { name: 'Steel Shell', category: 'weapon', rarity: 'doubleRare', family: 'Shell', modifiers: [add('hitDamage', 2), add('shotPower', 0.1)], desc: 'Hit damage +2, shot power +10%' },
  // Coat family: fire.
  { name: 'Ember Coat', category: 'weapon', rarity: 'common', family: 'Coat', element: 'fire', effects: [{ kind: 'burn', turns: 1 }], desc: 'Burn 1 turn (on a roll)' },
  { name: 'Cinder Coat', category: 'weapon', rarity: 'uncommon', family: 'Coat', element: 'fire', effects: [{ kind: 'burn', turns: 2 }], desc: 'Burn 2 turns (on a roll)' },
  { name: 'Blaze Coat', category: 'weapon', rarity: 'rare', family: 'Coat', element: 'fire', modifiers: [add('hitDamage', 1)], effects: [{ kind: 'burn', turns: 2 }], desc: 'Burn 2 turns (roll), hit damage +1' },
  { name: 'Inferno Coat', category: 'weapon', rarity: 'doubleRare', family: 'Coat', element: 'fire', modifiers: [add('hitDamage', 1)], effects: [{ kind: 'burn', turns: 3 }], desc: 'Burn 3 turns (roll), hit damage +1' },
  // Knob family: stun.
  { name: 'Bonk Knob', category: 'weapon', rarity: 'common', family: 'Knob', effects: [{ kind: 'stun' }], desc: 'Stun on a roll (2 slices)' },
  { name: 'Thump Knob', category: 'weapon', rarity: 'uncommon', family: 'Knob', effects: [{ kind: 'stun' }], desc: 'Stun on a roll (3 slices)' },
  { name: 'Clang Knob', category: 'weapon', rarity: 'rare', family: 'Knob', effects: [{ kind: 'stun' }], desc: 'Stun on a roll (4 slices)' },
  { name: 'Gong Knob', category: 'weapon', rarity: 'doubleRare', family: 'Knob', effects: [{ kind: 'stun' }, { kind: 'stunnedBonus', damage: 1 }], desc: 'Stun (5 slices), +1 damage to stunned' },
  // Needle family (round 3, owner 2026-11-22): poison.
  { name: 'Pin Needle', category: 'weapon', rarity: 'common', family: 'Needle', effects: [{ kind: 'poison', turns: 1 }], desc: 'Poison 1 turn (on a roll)' },
  { name: 'Thistle Needle', category: 'weapon', rarity: 'uncommon', family: 'Needle', effects: [{ kind: 'poison', turns: 2 }], desc: 'Poison 2 turns (on a roll)' },
  { name: 'Venom Needle', category: 'weapon', rarity: 'rare', family: 'Needle', modifiers: [add('hitDamage', 1)], effects: [{ kind: 'poison', turns: 2 }], desc: 'Poison 2 turns (roll), hit damage +1' },
  { name: 'Hex Needle', category: 'weapon', rarity: 'doubleRare', family: 'Needle', modifiers: [add('hitDamage', 1)], effects: [{ kind: 'poison', turns: 3 }], desc: 'Poison 3 turns (roll), hit damage +1' },
  // Special rare.
  { name: 'Thunder Knuckle', category: 'weapon', rarity: 'specialRare', element: 'shock', effects: [{ kind: 'chainZap', range: 3, damage: 1 }], desc: 'Hits may zap the nearest other enemy' },
  { name: 'Wrecking Shell', category: 'weapon', rarity: 'specialRare', modifiers: [add('hitDamage', 2)], effects: [{ kind: 'rollThrough' }], desc: 'Hit damage +2, rolls on through defeats' },
  { name: 'Leech Fang', category: 'weapon', rarity: 'specialRare', effects: [{ kind: 'leech', heal: 1 }], desc: 'First hit each shot may heal 1' },
  // Legendary.
  { name: 'Sunfire Crown', category: 'weapon', rarity: 'legendary', element: 'fire', effects: [{ kind: 'burn', turns: 3 }, { kind: 'burst', radius: 1.5, damage: 1 }], desc: 'Burn 3 turns (roll); burning foes burst' },
  { name: "Giant's Knuckle", category: 'weapon', rarity: 'legendary', modifiers: [add('hitDamage', 3)], effects: [{ kind: 'knockBack', distance: 2 }], desc: 'Hit damage +3, hits may knock foes away' },
  { name: 'Echo Shell', category: 'weapon', rarity: 'legendary', effects: [{ kind: 'echo' }], desc: 'First hit each shot may count twice' },

  // --- Armour --------------------------------------------------------------
  // Lining family: ignore damage.
  { name: 'Padded Lining', category: 'armour', rarity: 'common', family: 'Lining', effects: [{ kind: 'ignoreDamage', count: 1 }], desc: 'First damage each course is ignored' },
  { name: 'Quilted Lining', category: 'armour', rarity: 'uncommon', family: 'Lining', modifiers: [add('maxHealth', 1)], effects: [{ kind: 'ignoreDamage', count: 1 }], desc: 'First damage ignored, max health +1' },
  { name: 'Double Lining', category: 'armour', rarity: 'rare', family: 'Lining', effects: [{ kind: 'ignoreDamage', count: 2 }], desc: 'First 2 damages each course ignored' },
  { name: 'Plated Lining', category: 'armour', rarity: 'doubleRare', family: 'Lining', modifiers: [add('maxHealth', 1)], effects: [{ kind: 'ignoreDamage', count: 2 }], desc: 'First 2 damages ignored, max health +1' },
  // Guard family: hit back.
  { name: 'Thorn Guard', category: 'armour', rarity: 'common', family: 'Guard', effects: [{ kind: 'thorns', damage: 1, stun: false }], desc: 'Enemies that hurt you take 1 damage' },
  { name: 'Bramble Guard', category: 'armour', rarity: 'uncommon', family: 'Guard', effects: [{ kind: 'thorns', damage: 1, stun: true }], desc: 'Hurt back for 1 and stun' },
  { name: 'Briar Guard', category: 'armour', rarity: 'rare', family: 'Guard', effects: [{ kind: 'thorns', damage: 2, stun: false }], desc: 'Enemies that hurt you take 2 damage' },
  { name: 'Thicket Guard', category: 'armour', rarity: 'doubleRare', family: 'Guard', effects: [{ kind: 'thorns', damage: 2, stun: true }], desc: 'Hurt back for 2 and stun' },
  // Hide family: more health.
  { name: 'Thick Hide', category: 'armour', rarity: 'common', family: 'Hide', modifiers: [add('maxHealth', 1)], desc: 'Max health +1' },
  { name: 'Tough Hide', category: 'armour', rarity: 'uncommon', family: 'Hide', modifiers: [add('maxHealth', 2)], desc: 'Max health +2' },
  { name: 'Stone Hide', category: 'armour', rarity: 'rare', family: 'Hide', modifiers: [add('maxHealth', 3)], desc: 'Max health +3' },
  { name: 'Granite Hide', category: 'armour', rarity: 'doubleRare', family: 'Hide', modifiers: [add('maxHealth', 3)], effects: [{ kind: 'healAfterCourse', amount: 1 }], desc: 'Max health +3, heal 1 after each course' },
  // Special rare.
  { name: 'Mirror Plate', category: 'armour', rarity: 'specialRare', effects: [{ kind: 'mirror' }], desc: 'Seeds that hit you hit the thrower too' },
  { name: 'Cork Plate', category: 'armour', rarity: 'specialRare', effects: [{ kind: 'safeFalls' }], desc: 'Water and falls cost no health' },
  { name: 'Moss Plate', category: 'armour', rarity: 'specialRare', effects: [{ kind: 'healAtStart', amount: 1 }], desc: 'Heal 1 at the start of each course' },
  // Legendary.
  { name: 'Phoenix Plate', category: 'armour', rarity: 'legendary', effects: [{ kind: 'phoenix', health: 3 }], desc: 'Once: survive at 3 health, then it crumbles' },
  { name: 'Bastion Plate', category: 'armour', rarity: 'legendary', modifiers: [add('maxHealth', 3)], effects: [{ kind: 'ignoreDamage', count: 2 }], desc: 'Max health +3, first 2 damages ignored' },
  // Grit family (owner, 2026-11-17): more filled slices on the boss wheel.
  { name: 'Grit Pads', category: 'armour', rarity: 'common', family: 'Grit', modifiers: [add('bossSlices', 2)], desc: 'Boss wheel +2 slices' },
  { name: 'Grit Vest', category: 'armour', rarity: 'uncommon', family: 'Grit', modifiers: [add('bossSlices', 3)], desc: 'Boss wheel +3 slices' },
  { name: 'Grit Mail', category: 'armour', rarity: 'rare', family: 'Grit', modifiers: [add('bossSlices', 4), add('maxHealth', 1)], desc: 'Boss wheel +4 slices, max health +1' },
  { name: 'Grit Plate', category: 'armour', rarity: 'doubleRare', family: 'Grit', modifiers: [add('bossSlices', 5), add('maxHealth', 1)], desc: 'Boss wheel +5 slices, max health +1' },
  // Owner, 2026-11-17: slice perks.
  { name: "Gambler's Vest", category: 'armour', rarity: 'specialRare', modifiers: [add('rollSlices', 3), add('maxHealth', -1)], desc: 'Every wheel +3 slices, max health -1' },
  { name: "Fortune's Mail", category: 'armour', rarity: 'legendary', modifiers: [add('maxHealth', 2)], effects: [{ kind: 'respin', count: 1 }], desc: 'Max health +2, first failed roll spins again' },
  { name: 'Storm Cloak', category: 'armour', rarity: 'legendary', modifiers: [add('maxHealth', 1)], effects: [{ kind: 'immune', causes: ['zap', 'spikes'] }], desc: 'Clouds and spikes cannot hurt you, max health +1' },

  // --- Baubles -------------------------------------------------------------
  // Magnet family: star reach.
  { name: 'Star Magnet', category: 'bauble', rarity: 'common', family: 'Magnet', modifiers: [add('starReach', 1)], desc: 'Star reach +1' },
  { name: 'Star Lodestone', category: 'bauble', rarity: 'uncommon', family: 'Magnet', modifiers: [add('starReach', 2)], desc: 'Star reach +2' },
  { name: 'Star Anchor', category: 'bauble', rarity: 'rare', family: 'Magnet', modifiers: [add('starReach', 3)], desc: 'Star reach +3' },
  { name: 'Star Heart', category: 'bauble', rarity: 'doubleRare', family: 'Magnet', modifiers: [add('starReach', 3), add('dropLuck', 0.1)], desc: 'Star reach +3, drop luck +10%' },
  // Sight family: aim guide.
  { name: 'Long Sight', category: 'bauble', rarity: 'common', family: 'Sight', modifiers: [mul('guideLength', 1.5)], desc: 'Aim guide x1.5' },
  { name: 'Far Sight', category: 'bauble', rarity: 'uncommon', family: 'Sight', modifiers: [mul('guideLength', 2)], desc: 'Aim guide x2' },
  { name: 'Eagle Sight', category: 'bauble', rarity: 'rare', family: 'Sight', modifiers: [mul('guideLength', 2.5)], desc: 'Aim guide x2.5' },
  { name: 'Hawk Sight', category: 'bauble', rarity: 'doubleRare', family: 'Sight', modifiers: [mul('guideLength', 3)], desc: 'Aim guide x3' },
  // Pebble family: luck and prices.
  { name: 'Lucky Pebble', category: 'bauble', rarity: 'common', family: 'Pebble', modifiers: [add('dropLuck', 0.25)], desc: 'Drop luck +25%' },
  { name: 'Lucky Stone', category: 'bauble', rarity: 'uncommon', family: 'Pebble', modifiers: [add('dropLuck', 0.5)], desc: 'Drop luck +50%' },
  { name: 'Lucky Gem', category: 'bauble', rarity: 'rare', family: 'Pebble', modifiers: [add('dropLuck', 0.5), add('shopPrices', -0.1)], desc: 'Drop luck +50%, prices -10%' },
  { name: 'Lucky Jewel', category: 'bauble', rarity: 'doubleRare', family: 'Pebble', modifiers: [add('dropLuck', 0.75), add('shopPrices', -0.15)], desc: 'Drop luck +75%, prices -15%' },
  // Spinner family (owner, 2026-11-17): more filled slices on every wheel.
  { name: 'Brass Spinner', category: 'bauble', rarity: 'common', family: 'Spinner', modifiers: [add('rollSlices', 1)], desc: 'Every wheel +1 slice' },
  { name: 'Silver Spinner', category: 'bauble', rarity: 'uncommon', family: 'Spinner', modifiers: [add('rollSlices', 1), add('dropLuck', 0.1)], desc: 'Every wheel +1 slice, drop luck +10%' },
  { name: 'Gold Spinner', category: 'bauble', rarity: 'rare', family: 'Spinner', modifiers: [add('rollSlices', 2)], desc: 'Every wheel +2 slices' },
  { name: 'Jewel Spinner', category: 'bauble', rarity: 'doubleRare', family: 'Spinner', modifiers: [add('rollSlices', 2), add('dropLuck', 0.2)], desc: 'Every wheel +2 slices, drop luck +20%' },
  // Special rare.
  { name: 'Hot Streak Charm', category: 'bauble', rarity: 'specialRare', effects: [{ kind: 'hotStreak' }], desc: 'Each won roll adds a slice this shot' },
  { name: 'Pocket Pillow', category: 'bauble', rarity: 'specialRare', modifiers: [add('naps', 1)], desc: 'One extra nap each course' },
  { name: 'Golden Tooth', category: 'bauble', rarity: 'specialRare', effects: [{ kind: 'starPerDefeat', stars: 1 }], desc: '+1 star in the wallet per defeat' },
  { name: 'Feather Charm', category: 'bauble', rarity: 'specialRare', modifiers: [add('bounceBoost', 1)], desc: 'Bounce boost +100%' },
  // Legendary.
  { name: 'Golden Spinner', category: 'bauble', rarity: 'legendary', modifiers: [add('rollSlices', 1)], effects: [{ kind: 'bossWheel', slices: 15 }], desc: 'Boss wheel 15 slices, every wheel +1' },
  { name: 'Crown of Plenty', category: 'bauble', rarity: 'legendary', effects: [{ kind: 'walletDouble' }], desc: 'Stars count twice in the wallet' },
  { name: 'Pocket Watch', category: 'bauble', rarity: 'legendary', modifiers: [add('maxShots', 2), add('naps', 1)], desc: 'Max shots +2, one extra nap' },
  { name: 'Four-Leaf Clover', category: 'bauble', rarity: 'legendary', modifiers: [mul('dropLuck', 2), add('shopPrices', -0.25)], effects: [{ kind: 'freeReroll' }], desc: 'Luck x2, prices -25%, a free reroll' },
];

/** "Giant's Knuckle" -> "giants-knuckle". */
function idOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const GEAR_LIST: readonly GearDef[] = entries.map((e) => {
  const id = idOf(e.name);
  return {
    id,
    name: e.name,
    icon: `gear-${id}`,
    category: e.category,
    rarity: e.rarity,
    family: e.family ?? null,
    element: e.element ?? null,
    modifiers: e.modifiers ?? [],
    effects: e.effects ?? [],
    slices: e.category === 'weapon' ? (e.slices ?? SLICES_BY_RARITY[e.rarity]) : 0,
    desc: e.desc,
    price: RARITY_INFO[e.rarity].price,
  };
});

export const GEAR: ReadonlyMap<string, GearDef> = new Map(GEAR_LIST.map((g) => [g.id, g]));

/** The gear a creature holds: one item per category, or none. */
export type GearSlots = { readonly [C in GearCategory]: string | null };
export const NO_GEAR: GearSlots = { weapon: null, armour: null, bauble: null };
