/**
 * Surface definitions (DESIGN.md section 4, "Surfaces"). Adding a surface means
 * adding an entry here, a placeholder colour in tools/make-placeholder-art.ts,
 * and re-running `npm run art`. Physics numbers (friction, bounce and so on)
 * are added to these entries in Milestone 2.
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
}

/** Directions along the grid axes, named by where they point on screen. */
export const DIRECTIONS = ['ne', 'se', 'sw', 'nw'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const defs: readonly SurfaceDef[] = [
  { id: 'grass', name: 'Grass', tileSprite: 'tile-grass', faceSprite: 'face-earth', canHoldBall: true },
  { id: 'rough', name: 'Rough', tileSprite: 'tile-rough', faceSprite: 'face-earth', canHoldBall: true },
  { id: 'sand', name: 'Sand', tileSprite: 'tile-sand', faceSprite: 'face-sand', canHoldBall: true },
  { id: 'ice', name: 'Ice', tileSprite: 'tile-ice', faceSprite: 'face-ice', canHoldBall: true },
  { id: 'water', name: 'Water', tileSprite: 'tile-water', faceSprite: 'face-earth', canHoldBall: false, flatOnly: true },
  { id: 'bumper', name: 'Bumper', tileSprite: 'tile-bumper', faceSprite: 'face-bumper', canHoldBall: false },
  { id: 'booster', name: 'Booster', tileSprite: 'tile-booster', faceSprite: 'face-metal', canHoldBall: false, flatOnly: true, needsDir: true },
  { id: 'conveyor', name: 'Conveyor', tileSprite: 'tile-conveyor', faceSprite: 'face-metal', canHoldBall: false, flatOnly: true, needsDir: true },
  { id: 'spring', name: 'Spring', tileSprite: 'tile-spring', faceSprite: 'face-metal', canHoldBall: false, flatOnly: true },
  { id: 'spikes', name: 'Spikes', tileSprite: 'tile-spikes', faceSprite: 'face-metal', canHoldBall: false },
  { id: 'warp', name: 'Warp', tileSprite: 'tile-warp', faceSprite: 'face-metal', canHoldBall: false, flatOnly: true, needsLink: true },
];

export const SURFACES: ReadonlyMap<string, SurfaceDef> = new Map(defs.map((d) => [d.id, d]));

/** Sprite drawn on top of tiles that have a direction. Its frames are named by direction. */
export const ARROW_SPRITE = 'arrow';
