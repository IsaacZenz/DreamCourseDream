/**
 * Second gear pockets (round 3 sheet section 1; owner, 2026-11-22). A permanent
 * unlock per category lets the ball hold two items of that category. Pocket 1
 * is `gear`, pocket 2 is `gear2`; both items work.
 *
 * The pockets are kept in age order: pocket 1 always holds the item held
 * longest. Taking an item out of pocket 1 moves pocket 2's item up.
 *
 * Plain TypeScript; shared by the run (shops, caches, rewards) and the course
 * (pickups).
 */
import { GEAR, GEAR_CATEGORIES, RARITIES, type GearCategory, type GearSlots } from '../content/gear.ts';

export type Slots = { -readonly [C in GearCategory]: string | null };
export type Pocket = 1 | 2;

/** Every item held, pocket 1 then pocket 2, category by category. */
export function heldItems(gear: GearSlots, gear2: GearSlots): { id: string; category: GearCategory; pocket: Pocket }[] {
  const out: { id: string; category: GearCategory; pocket: Pocket }[] = [];
  for (const c of GEAR_CATEGORIES) {
    if (gear[c]) out.push({ id: gear[c]!, category: c, pocket: 1 });
    if (gear2[c]) out.push({ id: gear2[c]!, category: c, pocket: 2 });
  }
  return out;
}

/** The stat-modifier source id for an item in a pocket (pocket 2 is told apart, so the same item twice stacks). */
export function sourceId(id: string, pocket: Pocket): string {
  return pocket === 1 ? id : `${id}@2`;
}

/** Where a new item would go with no question asked, or null when both usable pockets are full. */
export function freePocket(gear: GearSlots, gear2: GearSlots, unlocked: readonly GearCategory[], c: GearCategory): Pocket | null {
  if (!gear[c]) return 1;
  if (unlocked.includes(c) && !gear2[c]) return 2;
  return null;
}

/** Whether a new item of this category would replace one (and so needs a "replace?" question in a shop). */
export function isFull(gear: GearSlots, gear2: GearSlots, unlocked: readonly GearCategory[], c: GearCategory): boolean {
  return freePocket(gear, gear2, unlocked, c) === null;
}

/**
 * Put `id` in, replacing the item in `pocket` if one must go (shop choice).
 * Keeps the age order: the new item is always the newest. Returns the item
 * that was replaced, or null.
 */
export function putIn(gear: Slots, gear2: Slots, unlocked: readonly GearCategory[], id: string, pocket: Pocket = 1): string | null {
  const c = GEAR.get(id)!.category;
  const free = freePocket(gear, gear2, unlocked, c);
  if (free === 1) {
    gear[c] = id;
    return null;
  }
  if (free === 2) {
    gear2[c] = id;
    return null;
  }
  // Only one pocket: replace it.
  if (!unlocked.includes(c)) {
    const old = gear[c];
    gear[c] = id;
    return old;
  }
  if (pocket === 1) {
    const old = gear[c];
    gear[c] = gear2[c];
    gear2[c] = id;
    return old;
  }
  const old = gear2[c];
  gear2[c] = id;
  return old;
}

/**
 * Which pocket a course pickup replaces when both are full: the lower rarity;
 * the same rarity, the one held longest (pocket 1).
 */
export function pickupPocket(gear: GearSlots, gear2: GearSlots, c: GearCategory): Pocket {
  const r1 = RARITIES.indexOf(GEAR.get(gear[c]!)!.rarity);
  const r2 = RARITIES.indexOf(GEAR.get(gear2[c]!)!.rarity);
  return r2 < r1 ? 2 : 1;
}

/** A course pickup (rolling over an item): fills a free pocket, or replaces by `pickupPocket`. Returns the item dropped, or null. */
export function pickUp(gear: Slots, gear2: Slots, unlocked: readonly GearCategory[], id: string): string | null {
  const c = GEAR.get(id)!.category;
  const pocket = freePocket(gear, gear2, unlocked, c) === null && unlocked.includes(c) ? pickupPocket(gear, gear2, c) : 1;
  return putIn(gear, gear2, unlocked, id, pocket);
}

/** Take the item out of a pocket. Taking pocket 1's moves pocket 2's up. Returns the item. */
export function takeOut(gear: Slots, gear2: Slots, c: GearCategory, pocket: Pocket): string | null {
  if (pocket === 2) {
    const old = gear2[c];
    gear2[c] = null;
    return old;
  }
  const old = gear[c];
  gear[c] = gear2[c];
  gear2[c] = null;
  return old;
}
