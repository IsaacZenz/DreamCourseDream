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

/**
 * Themes. Owner, 2026-11-21 (round 2c): regions 1 to 3 are day, bog and
 * thornwood; endless mode always starts (region 4) with its own theme,
 * Starfall; after that each region picks one at random from the run seed
 * (repeats are fine).
 */
export const THEMES = ['day', 'bog', 'thornwood', 'starfall', 'night', 'underground', 'spooky'] as const;
export type ThemeId = (typeof THEMES)[number];

/** A small stable hash of text, for picking a theme from the run seed without the game's random streams. */
export function hashOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function themeForRegion(region: number, seed = ''): ThemeId {
  const r = Math.max(1, region);
  if (r <= 3) return THEMES[r - 1]!;
  if (r === 4) return 'starfall';
  return THEMES[hashOf(`${seed}/theme/${r}`) % THEMES.length]!;
}
