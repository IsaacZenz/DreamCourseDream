/**
 * Organic wall textures (owner, 2026-11-26): which textures each face
 * material uses, and how often. Data only; the painting is in
 * src/render/walls.ts.
 *
 * Texture ids are written without their side: "wall-earth-soil-1" is drawn
 * as art/drawn/wall-earth-soil-1-left.png and -right.png, which the art script
 * packs into the sheets "wall-sheet-left" and "wall-sheet-right" (one frame
 * per texture, see the manifest's `heights`). A material with no entry here (sand, ice, metal...) keeps its
 * old repeating face sprites.
 *
 * Each edge of each tile picks once, from the course seed, the tile and the
 * side, so the same course always looks the same.
 */

/** One choice in a weighted list; `sprite: null` means "nothing on this layer". */
export interface WallVariant {
  readonly sprite: string | null;
  readonly weight: number;
}

/** How one face material is textured. */
export interface WallStyle {
  /** Base soil textures. Sprite ids without the "-left"/"-right" ending. */
  readonly soil: readonly WallVariant[];
  /** Embedded rocks. A null entry is plain soil. */
  readonly rocks: readonly WallVariant[];
  /** Optional details (roots, moss). A null entry is none. */
  readonly details: readonly WallVariant[];
  /** Grass overhang along the top edge, or null for none. */
  readonly overhang: string | null;
}

/** Share of edges with each kind of rock (owner, 2026-11-26). Each kind's share is split evenly between its textures. */
export const EARTH_ROCK_SHARES = { plain: 25, sparse: 40, moderate: 25, large: 10 } as const;

const split = (share: number, sprites: readonly string[]) => sprites.map((sprite) => ({ sprite, weight: share / sprites.length }));

export const WALL_STYLES: Readonly<Record<string, WallStyle>> = {
  'face-earth': {
    soil: split(1, ['wall-earth-soil-1', 'wall-earth-soil-2']),
    rocks: [
      { sprite: null, weight: EARTH_ROCK_SHARES.plain },
      ...split(EARTH_ROCK_SHARES.sparse, ['wall-earth-rocks-sparse-1', 'wall-earth-rocks-sparse-2', 'wall-earth-rocks-sparse-3']),
      ...split(EARTH_ROCK_SHARES.moderate, ['wall-earth-rocks-moderate-1', 'wall-earth-rocks-moderate-2']),
      ...split(EARTH_ROCK_SHARES.large, ['wall-earth-rocks-large-1']),
    ],
    // Roots and moss: supported, no art yet. Add entries like { sprite: 'wall-earth-roots-1', weight: 15 }.
    details: [{ sprite: null, weight: 1 }],
    overhang: 'wall-earth-overhang',
  },
};

/** Which rock kind a rocks sprite id belongs to (for tests and the debug view). */
export function rockKind(sprite: string | null): keyof typeof EARTH_ROCK_SHARES {
  if (!sprite) return 'plain';
  if (sprite.includes('-sparse-')) return 'sparse';
  if (sprite.includes('-moderate-')) return 'moderate';
  return 'large';
}
