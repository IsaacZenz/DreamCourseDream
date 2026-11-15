/**
 * Course rule numbers: damage, pickups, drops, enemy turns. Physics strengths
 * (booster push, spring launch, exit capture, flag pole push-past) are in
 * tuning.ts so the tuning panel can change them live.
 *
 * Every number here is a starting value (FEATURES.md: "Every number in this
 * file is a starting value").
 */
export const RULES = {
  /** Owner, 2026-11-15: naps (recover turns) allowed per course. Running out of shots a third time fails the course. */
  naps: 2,
  /** Owner, 2026-11-15: shots gained each time the ball does damage to an enemy (never above the shot allowance). */
  shotsPerHit: 1,
  /** Health lost when the ball stops in water or falls off the course (DESIGN.md section 6). */
  sinkDamage: 1,
  /** Health lost touching spikes. */
  spikeDamage: 1,
  /** Damage a rolling enemy takes from spikes, at most once per launch. */
  enemySpikeDamage: 1,
  /** Distance at which a heart, shot orb or wild is collected, in tiles. A touch. */
  touchReach: 0.4,
  /** Dropped pickups land this far from where they came from, in tiles (a random spot in this ring). */
  starDropMin: 1.1,
  starDropMax: 1.9,
  /** The same enemy or crate cannot be hit again within this many seconds (FEATURES.md section 2). */
  hitCooldown: 0.5,
  /** Owner, 2026-11-14: after any damage the ball cannot be hurt again for this long, in seconds. */
  damageImmunity: 0.5,
  /** Each enemy action in an enemy turn is shown for at least this long, in seconds. */
  enemyActionTime: 0.4,
  /** A lowered flag is raised by the ball touching the ground this close to it, in tiles. */
  flagTouchReach: 0.4,
  /** A new or raised pole turns solid once the ball is this far past touching it, in tiles. */
  poleClearance: 0.1,
  /** Lob: a seed starts this high above the Spitter's feet, in tiles. */
  seedLaunchHeight: 0.4,
  /** A body launched by an enemy, or a seed, is stopped after this many seconds whatever happens. */
  bodyMaxTime: 10,
  /** Two rolling things that meet keep this fraction of their closing speed (ball and Lunger, Mole, seed). */
  bodyRestitution: 0.8,
} as const;
