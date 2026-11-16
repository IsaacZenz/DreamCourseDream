/**
 * Damage the ball deals to an enemy (FEATURES.md section 2), in this order:
 *
 *   1. hit damage after modifiers (the ball's stat, or an ability's own number)
 *   2. element: weak x2, resistant half rounded down
 *   3. position: "from above" (the ball was in the air just before contact) or
 *      "from behind" (from the half opposite the enemy's facing). A weak spot
 *      doubles the damage; a guarded side blocks the hit.
 *   4. shield: blocks the first hit of each shot
 *   5. the result is taken from the enemy's health (by the caller)
 *
 * A blocked hit does no damage, but still counts as a hit for triggers.
 *
 * Owner, 2026-11-16: a hit that is not blocked always does at least 1 damage,
 * whatever modifiers, poison and resistance do. Only a gimmick that blocks the
 * hit (a guarded side, a shield) takes it to 0.
 */
import type { Element, Side } from '../content/objects.ts';

export interface HitTarget {
  readonly weakTo: readonly Element[];
  readonly resists: readonly Element[];
  readonly weakSpots: readonly Side[];
  readonly guardedSides: readonly Side[];
  /** The target has a shield that is still up this shot. */
  readonly shieldUp: boolean;
}

export interface HitInfo {
  /** Step 1: hit damage after modifiers. */
  readonly base: number;
  readonly element: Element | null;
  readonly fromAbove: boolean;
  readonly fromBehind: boolean;
}

export interface HitResult {
  readonly damage: number;
  /** Blocked by a guarded side or a shield. */
  readonly blocked: boolean;
  /** The shield took this hit (so it is down for the rest of the shot). */
  readonly shieldUsed: boolean;
}

/** The sides a hit lands on. A hit from above can also be from behind or the front. */
export function sidesOf(hit: HitInfo): Side[] {
  const out: Side[] = [];
  if (hit.fromAbove) out.push('above');
  out.push(hit.fromBehind ? 'behind' : 'front');
  return out;
}

export function computeHit(hit: HitInfo, target: HitTarget): HitResult {
  let dmg = Math.max(0, Math.round(hit.base));
  // 2. Element
  if (hit.element) {
    if (target.weakTo.includes(hit.element)) dmg *= 2;
    else if (target.resists.includes(hit.element)) dmg = Math.floor(dmg / 2);
  }
  // 3. Position
  const sides = sidesOf(hit);
  if (sides.some((s) => target.guardedSides.includes(s))) return { damage: 0, blocked: true, shieldUsed: false };
  if (sides.some((s) => target.weakSpots.includes(s))) dmg *= 2;
  // 4. Shield
  if (target.shieldUp) return { damage: 0, blocked: true, shieldUsed: true };
  return { damage: Math.max(1, dmg), blocked: false, shieldUsed: false };
}

/** Is a point behind something facing (fx, fy)? Behind = in the half opposite its facing. */
export function isBehind(fromX: number, fromY: number, atX: number, atY: number, fx: number, fy: number): boolean {
  return (fromX - atX) * fx + (fromY - atY) * fy < 0;
}
