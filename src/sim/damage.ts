/**
 * Damage the ball deals to an enemy (FEATURES.md section 2), in this order:
 *
 *   1. hit damage after modifiers (the ball's stat, or an ability's own number)
 *   2. element: weak x2, resistant half rounded down
 *   3. position: "from above" (the ball was in the air just before contact),
 *      and the front, back or side (Milestone 8 sheet section 4.2: the front and
 *      the back are the 90-degree wedges ahead of and behind the way the enemy
 *      faces; the rest is its side). A weak spot doubles the damage; a guarded
 *      side blocks the hit, except that a hit from above gets past a guarded
 *      front, back or side.
 *   4. shield: blocks the first hit of each shot
 *   5. the result is taken from the enemy's health (by the caller)
 *
 * A blocked hit does no damage, but still counts as a hit for triggers.
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
  /** Milestone 8: hit in the front wedge. Left out: anything not from behind is the front (as before). */
  readonly fromFront?: boolean;
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
  out.push(hit.fromBehind ? 'behind' : (hit.fromFront ?? true) ? 'front' : 'side');
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
  // A hit from above gets past a guarded front, back or side; only a guarded top stops it.
  const guarded = hit.fromAbove ? target.guardedSides.includes('above') : sides.some((s) => target.guardedSides.includes(s));
  if (guarded) return { damage: 0, blocked: true, shieldUsed: false };
  if (sides.some((s) => target.weakSpots.includes(s))) dmg *= 2;
  // 4. Shield
  if (target.shieldUp) return { damage: 0, blocked: true, shieldUsed: true };
  return { damage: dmg, blocked: false, shieldUsed: false };
}

/** Is a point behind something facing (fx, fy)? Behind = in the half opposite its facing. */
export function isBehind(fromX: number, fromY: number, atX: number, atY: number, fx: number, fy: number): boolean {
  return (fromX - atX) * fx + (fromY - atY) * fy < 0;
}

/** Which wedge a point is in, seen from something facing (fx, fy): 90 degrees ahead is the front, 90 behind is the back. */
export function wedgeOf(fromX: number, fromY: number, atX: number, atY: number, fx: number, fy: number): 'front' | 'behind' | 'side' {
  const dx = fromX - atX;
  const dy = fromY - atY;
  const d = Math.hypot(dx, dy) * Math.hypot(fx, fy);
  if (d < 1e-9) return 'front';
  const c = (dx * fx + dy * fy) / d;
  return c >= Math.SQRT1_2 ? 'front' : c <= -Math.SQRT1_2 ? 'behind' : 'side';
}
