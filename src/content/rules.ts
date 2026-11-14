/**
 * Course rule numbers (Milestone 3): damage, pickups, star drops. Physics
 * strengths (booster push, spring launch, exit capture) are in tuning.ts so
 * the tuning panel can change them live.
 *
 * Every number here is a starting value (FEATURES.md: "Every number in this
 * file is a starting value").
 */
export const RULES = {
  /** Health lost when the ball stops in water or falls off the course (DESIGN.md section 6). */
  sinkDamage: 1,
  /** Health lost touching spikes. */
  spikeDamage: 1,
  /** Distance at which a heart or shot orb is collected, in tiles. A touch. */
  touchReach: 0.4,
  /** Dropped stars land this far from the enemy, in tiles (a random spot in this ring). */
  starDropMin: 1.1,
  starDropMax: 1.9,
  /** The same enemy cannot be hit again within this many seconds (FEATURES.md section 2). */
  hitCooldown: 0.5,
} as const;
