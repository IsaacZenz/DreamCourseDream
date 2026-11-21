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
}

export const SCENERY_LIST: readonly SceneryDef[] = [
  { id: 'tuft', name: 'Grass tuft', sprite: 'scenery-tuft' },
  { id: 'flowers', name: 'Flowers', sprite: 'scenery-flowers' },
  { id: 'pebbles', name: 'Pebbles', sprite: 'scenery-pebbles' },
  { id: 'mushrooms', name: 'Mushrooms', sprite: 'scenery-mushrooms' },
  { id: 'leaves', name: 'Fallen leaves', sprite: 'scenery-leaves' },
  { id: 'bones', name: 'Bones', sprite: 'scenery-bones' },
];

export const SCENERY: ReadonlyMap<string, SceneryDef> = new Map(SCENERY_LIST.map((s) => [s.id, s]));

/** Surfaces scenery may stand on. */
export const SCENERY_SURFACES: ReadonlySet<string> = new Set(['grass', 'rough', 'sand']);
