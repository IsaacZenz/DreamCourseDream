/**
 * Biomes and themes (round 2b sheet section 4; owner, 2026-11-21: defaults).
 *
 * A biome is how a region plays: which landforms it prefers (on top of the
 * round 2a detail dial in run.ts). A theme is how it looks: a set of
 * recoloured sprites in the asset manifest ("<id>@<theme>"); nothing behaves
 * differently in any theme.
 */
export interface BiomeDef {
  readonly id: string;
  readonly name: string;
  /** Landform pick weights are multiplied by these (ids in landforms.ts). Empty: as before. */
  readonly landformScale: Readonly<Record<string, number>>;
}

export const BIOMES: readonly BiomeDef[] = [
  { id: 'meadow', name: 'Meadow', landformScale: {} },
  { id: 'bog', name: 'Bog', landformScale: { pond: 2, basin: 2, plateau: 0.5 } },
  { id: 'thornwood', name: 'Thornwood', landformScale: { ridge: 2, gully: 2, pond: 0.5 } },
];

/** Region 1 meadow, 2 bog, 3 thornwood; endless regions take the three in turn (meadow, bog, thornwood...). */
export function biomeForRegion(region: number): BiomeDef {
  return BIOMES[(Math.max(1, region) - 1) % BIOMES.length]!;
}

/** Owner, 2026-11-21 (Q8): day, bog, thornwood, then night, underground, spooky; then again from bog. */
export const THEMES = ['day', 'bog', 'thornwood', 'night', 'underground', 'spooky'] as const;
export type ThemeId = (typeof THEMES)[number];

export function themeForRegion(region: number): ThemeId {
  const r = Math.max(1, region);
  if (r <= THEMES.length) return THEMES[r - 1]!;
  return THEMES[1 + ((r - THEMES.length - 1) % (THEMES.length - 1))]!;
}
