/**
 * Scenery (round 2a sheet section 2.6; owner, 2026-11-21): small things on the
 * ground for looks only. The ball rolls through them and enemies ignore them;
 * the physics and the course check never see them. Where they go and how many
 * is each region's detail dial (gen.ts DetailDef, run.ts REGIONS).
 */
export interface SceneryDef {
  readonly id: string;
  readonly name: string;
  readonly sprite: string;
  /** Owner, 2026-11-21: animated props (fireflies) cycle through their frames, one every this many milliseconds. */
  readonly frameMs?: number;
  /** Floats in the air (fireflies): drawn above everything standing on its tile. */
  readonly floats?: boolean;
}

export const SCENERY_LIST: readonly SceneryDef[] = [
  { id: 'tuft', name: 'Grass tuft', sprite: 'scenery-tuft' },
  { id: 'flowers', name: 'Flowers', sprite: 'scenery-flowers' },
  { id: 'pebbles', name: 'Pebbles', sprite: 'scenery-pebbles' },
  { id: 'mushrooms', name: 'Mushrooms', sprite: 'scenery-mushrooms' },
  { id: 'leaves', name: 'Fallen leaves', sprite: 'scenery-leaves' },
  { id: 'bones', name: 'Bones', sprite: 'scenery-bones' },
  // Owner, 2026-11-21: a small cluster of flickering lights. Looks only.
  { id: 'fireflies', name: 'Fireflies', sprite: 'scenery-fireflies', frameMs: 180, floats: true },
];

export const SCENERY: ReadonlyMap<string, SceneryDef> = new Map(SCENERY_LIST.map((s) => [s.id, s]));

/** Surfaces scenery may stand on. */
export const SCENERY_SURFACES: ReadonlySet<string> = new Set(['grass', 'rough', 'sand']);

/**
 * Ground bumps (owner, 2026-11-21): for looks only, each flat grass, rough or
 * sand tile is drawn raised by 0, 1 or 2 pixels, picked from its spot, so the
 * ground looks less flat. Slopes are never raised (they must read as smooth).
 * The ball, the physics and the course check never see it. The U panel can turn it off.
 */
export const GROUND_BUMPS = {
  surfaces: ['grass', 'rough', 'sand'] as readonly string[],
  /** Chance of each lift in pixels: [0 px, 1 px, 2 px]. */
  weights: [0.45, 0.35, 0.2] as readonly number[],
  /** The tile is drawn again at its true spot underneath, darkened by this tint, to make the little edge. */
  edgeTint: 0x9a9a9a,
} as const;

/** The kinds of grass tile design the art script draws (art pipeline, owner 2026-11-23). */
export type GrassDesignKind = 'plain' | 'blades' | 'dark' | 'light' | 'flowers';

/**
 * Grass variety ("calm D", owner 2026-11-23, art pipeline): for looks only. Each
 * grass tile shows one of several designs, picked from its spot with these weights,
 * and a meadow level from a smooth noise across the course, so the grass never looks
 * like one repeated tile. Display only: the physics and the course check never see it.
 * The colours and how strong each detail is are art settings, in art/ground.json.
 * Frames are named "<shape><checker>~g<design><meadow level>", e.g. "0000b~g3n".
 */
export const GRASS_VARIETY = {
  /** Tile designs in frame order. Two or three of a kind have different layouts. */
  designs: [
    { kind: 'plain', weight: 22 },
    { kind: 'plain', weight: 23 },
    { kind: 'blades', weight: 9 },
    { kind: 'blades', weight: 8 },
    { kind: 'blades', weight: 8 },
    { kind: 'dark', weight: 6 },
    { kind: 'dark', weight: 6 },
    { kind: 'light', weight: 6 },
    { kind: 'light', weight: 6 },
    { kind: 'flowers', weight: 3 },
    { kind: 'flowers', weight: 3 },
  ] as ReadonlyArray<{ readonly kind: GrassDesignKind; readonly weight: number }>,
  /** Meadow patches: the noise has features about this many tiles across. */
  meadowSize: 5,
  /** Meadow levels from darker to lighter: the frame letter and the noise value where the level starts. */
  meadowLevels: [
    { id: 'a', from: 0 },
    { id: 'b', from: 0.28 },
    { id: 'n', from: 0.42 },
    { id: 'c', from: 0.68 },
  ] as ReadonlyArray<{ readonly id: string; readonly from: number }>,
  /** In darker meadow, tufts and dark patches are commoner; in lighter meadow, flowers and light patches. */
  bias: {
    a: { plain: 1, blades: 1.8, dark: 2, light: 0.4, flowers: 0.5 },
    b: { plain: 1, blades: 1.8, dark: 2, light: 0.4, flowers: 0.5 },
    n: { plain: 1, blades: 1, dark: 1, light: 1, flowers: 1 },
    c: { plain: 1, blades: 0.7, dark: 0.3, light: 2, flowers: 2.5 },
  } as Readonly<Record<string, Readonly<Record<GrassDesignKind, number>>>>,
} as const;
