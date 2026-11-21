/**
 * The asset manifest (DESIGN.md section 12). Game code refers to sprites only
 * by ID; this file maps each ID to an image file, its frame size, the names of
 * its frames and its anchor point. Replace placeholder art by changing the
 * image files (and this manifest if sizes change). No other code needs to change.
 *
 * `assets/manifest.json` is written by `npm run art` (tools/make-placeholder-art.ts).
 */

export interface SpriteEntry {
  /** Path relative to the assets folder. */
  readonly file: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  /** Frame names in sheet order (left to right, top to bottom). */
  readonly frames: readonly string[];
  /** Pixel inside a frame that is placed on the sprite's world position. */
  readonly anchor: readonly [number, number];
}

export interface Manifest {
  readonly version: 1;
  readonly sprites: Readonly<Record<string, SpriteEntry>>;
  /** Milestone 8: colour tints by name (an enemy's element: fire, ice, shock), as "#rrggbb". */
  readonly tints?: Readonly<Record<string, string>>;
}

export function frameIndex(entry: SpriteEntry, frame: string): number {
  const i = entry.frames.indexOf(frame);
  if (i < 0) throw new Error(`Frame "${frame}" not found. Frames: ${entry.frames.join(', ')}`);
  return i;
}
