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
  /**
   * Owner, 2026-11-26 (organic walls): a wall texture sheet holds one texture
   * per frame (a 16-pixel column each); this is how many rows of each frame
   * the texture really uses, from the top. Absent: every frame is full height.
   */
  readonly heights?: readonly number[];
}

export interface Manifest {
  readonly version: 1;
  readonly sprites: Readonly<Record<string, SpriteEntry>>;
  /** Milestone 8: colour tints by name (an enemy's element: fire, ice, shock), as "#rrggbb". */
  readonly tints?: Readonly<Record<string, string>>;
  /**
   * Round 2b: visual themes. A sprite "<id>@<theme>" is that sprite in the
   * theme; without one, "<id>" is used. Each theme also has a background colour,
   * and (round 9L) its ambient light: the colour the light map starts from.
   */
  readonly themes?: Readonly<Record<string, { readonly sky: string; readonly ambient?: string }>>;
  /** Round 9L: each light's colour by light id (src/content/atmosphere.ts), as "#rrggbb". */
  readonly lights?: Readonly<Record<string, string>>;
}

/** The sprite id to draw for `id` in `theme`: its themed version if the manifest has one. */
export function themedSprite(manifest: Manifest, id: string, theme: string | null): string {
  if (!theme) return id;
  const t = `${id}@${theme}`;
  return manifest.sprites[t] ? t : id;
}

export function frameIndex(entry: SpriteEntry, frame: string): number {
  const i = entry.frames.indexOf(frame);
  if (i < 0) throw new Error(`Frame "${frame}" not found. Frames: ${entry.frames.join(', ')}`);
  return i;
}
