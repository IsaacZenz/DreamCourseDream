/**
 * Surface definitions (DESIGN.md section 4, "Surfaces"). Adding a surface means
 * adding an entry here, a placeholder colour in tools/make-placeholder-art.ts,
 * and re-running `npm run art`. Physics numbers (friction, bounce and so on)
 * live in src/content/tuning.ts so they can all be tuned in one place.
 */

export interface SurfaceDef {
  readonly id: string;
  /** Shown in the debug overlay and, later, in tooltips. */
  readonly name: string;
  /** Sprite ID of the tile tops for this surface (one frame per tile shape). */
  readonly tileSprite: string;
  /** Sprite ID of the vertical faces under this surface's edges. */
  readonly faceSprite: string;
  /** Must be a flat tile (pads and gadgets). */
  readonly flatOnly?: boolean;
  /** Needs a direction in the course legend (booster, conveyor). */
  readonly needsDir?: boolean;
  /** Needs a link ID shared with exactly one other tile (warp pair). */
  readonly needsLink?: boolean;
  /** The ball can be placed here at the start, and the exit can sit here. */
  readonly canHoldBall: boolean;
  /**
   * Water: the ball can pass through, but if it comes to rest here it sinks and
   * goes back to its last resting spot.
   */
  readonly sinks?: boolean;
  /** Sprite ID drawn over the tile, above the ball (see-through water surface). One frame per tile shape. */
  readonly overlaySprite?: string;
  /**
   * What the tile does to a ball on it (Milestone 3). The strengths are tuning
   * numbers in src/content/tuning.ts ("hazards"); damage is in src/content/rules.ts.
   * - push: speeds the ball up hard along the tile's direction (booster).
   * - carry: moves the ball along the tile's direction at a set speed (conveyor).
   * - launch: throws the ball upward (spring).
   * - damage: hurts the ball on contact (spikes).
   * - warp: moves the ball to the other tile with the same link (warp pair).
   */
  readonly effect?: 'push' | 'carry' | 'launch' | 'damage' | 'warp';
}

/** Directions along the grid axes, named by where they point on screen. */
export const DIRECTIONS = ['ne', 'se', 'sw', 'nw'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/**
 * Each direction as a unit step on the grid. Grid x runs to the lower right of
 * the screen (se) and grid y to the lower left (sw).
 */
export const DIRECTION_VECTORS: Readonly<Record<Direction, readonly [number, number]>> = {
  ne: [0, -1],
  se: [1, 0],
  sw: [0, 1],
  nw: [-1, 0],
};

const defs: readonly SurfaceDef[] = [
  { id: 'grass', name: 'Grass', tileSprite: 'tile-grass', faceSprite: 'face-earth', canHoldBall: true },
  { id: 'rough', name: 'Rough', tileSprite: 'tile-rough', faceSprite: 'face-earth', canHoldBall: true },
  { id: 'sand', name: 'Sand', tileSprite: 'tile-sand', faceSprite: 'face-sand', canHoldBall: true },
  { id: 'ice', name: 'Ice', tileSprite: 'tile-ice', faceSprite: 'face-ice', canHoldBall: true },
  { id: 'water', name: 'Water', tileSprite: 'tile-water', faceSprite: 'face-earth', canHoldBall: false, sinks: true, overlaySprite: 'tile-water-surface' },
  { id: 'bumper', name: 'Bumper', tileSprite: 'tile-bumper', faceSprite: 'face-bumper', canHoldBall: false },
  { id: 'booster', name: 'Booster', tileSprite: 'tile-booster', faceSprite: 'face-metal', canHoldBall: false, flatOnly: true, needsDir: true, effect: 'push' },
  { id: 'conveyor', name: 'Conveyor', tileSprite: 'tile-conveyor', faceSprite: 'face-metal', canHoldBall: false, flatOnly: true, needsDir: true, effect: 'carry' },
  { id: 'spring', name: 'Spring', tileSprite: 'tile-spring', faceSprite: 'face-metal', canHoldBall: false, flatOnly: true, effect: 'launch' },
  { id: 'spikes', name: 'Spikes', tileSprite: 'tile-spikes', faceSprite: 'face-metal', canHoldBall: false, effect: 'damage' },
  { id: 'warp', name: 'Warp', tileSprite: 'tile-warp', faceSprite: 'face-metal', canHoldBall: false, flatOnly: true, needsLink: true, effect: 'warp' },
];

export const SURFACES: ReadonlyMap<string, SurfaceDef> = new Map(defs.map((d) => [d.id, d]));

/** Sprite drawn on top of tiles that have a direction. Its frames are named by direction. */
export const ARROW_SPRITE = 'arrow';
