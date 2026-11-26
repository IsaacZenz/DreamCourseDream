/**
 * Light and atmosphere (round 9L sheet, `docs/plans/milestone-9-light.md`;
 * owner, 2026-11-26). Looks only: nothing here changes a rule, the physics,
 * the generator or the course check.
 *
 * The numbers live here; the colours live with the art in the asset manifest
 * (`themes.<theme>.ambient` and `lights.<light id>`), written by `npm run art`.
 * Every number here can be tried live in the U panel's light lab.
 */

/** How the light map is drawn. */
export const LIGHT_MAP = {
  /**
   * Owner, 2026-11-26: option A, the light map is drawn at the game's own
   * 384 x 216 (1). Option B, kept in reserve, would raise this (2, 3 ...) to
   * draw the light at the screen's size for smoother light. Nothing else changes.
   */
  resolution: 1,
  /** Steps of brightness from a light's edge to its centre (sheet section 2.2: 4, stepped like pixel art). */
  bands: 4,
  /** How far apart the steps are mixed with a checker pattern (0 = hard steps, 1 = a wide mix). */
  dither: 0.6,
  /** How light fades with distance: 1 = evenly; above 1, it gathers in the middle and fades softly at the edge. */
  falloff: 1.4,
  /**
   * How much of each light is also added on top of the art, 0 to 1. Dark
   * themes are drawn dark already, and the light map alone can only darken;
   * this lets a lamp warm and brighten the ground round it.
   */
  glow: 0.35,
} as const;

/** A kind of light. Its colour is `lights.<id>` in the asset manifest. */
export interface LightDef {
  readonly id: string;
  /** How far the light reaches, in tiles. */
  readonly radius: number;
  /** Brightness at the middle, 0 to 1 (added on top of the theme's ambient light). */
  readonly strength: number;
  /** How it changes over time: still, a slow even pulse, a gentle flicker, or a strong random flicker. */
  readonly motion: 'still' | 'pulse' | 'gentle' | 'strong';
  /** For tall lights: a small bright glow at the lamp itself, this many pixels above the ground. */
  readonly headPx?: number;
  /** The prop drawn on the ground for a placed light (a sprite id), if it has one. */
  readonly sprite?: string;
  /** Multiplies the light map's `glow` for this light (Default 1). Lower keeps it from washing out what it lights. */
  readonly glow?: number;
}

export const LIGHT_LIST: readonly LightDef[] = [
  { id: 'fireflies', radius: 1.5, strength: 0.55, motion: 'strong' },
  { id: 'glow-mushroom', radius: 1.5, strength: 0.6, motion: 'pulse', sprite: 'light-mushroom' },
  { id: 'ground-lantern', radius: 2.5, strength: 0.75, motion: 'gentle', sprite: 'light-lantern' },
  { id: 'lamp-post', radius: 4, strength: 0.8, motion: 'still', headPx: 22, sprite: 'place-lamp' },
  // Hangs from a dead tree already on the course (no prop of its own; the lantern is drawn on the tree).
  { id: 'tree-lantern', radius: 3, strength: 0.75, motion: 'gentle', headPx: 22, sprite: 'light-tree-lantern' },
  { id: 'exit', radius: 3, strength: 0.7, motion: 'pulse' },
  { id: 'hero', radius: 1.5, strength: 0.5, motion: 'still', glow: 0.3 },
  { id: 'glowmoth', radius: 2, strength: 0.6, motion: 'gentle' },
];

export const LIGHTS: ReadonlyMap<string, LightDef> = new Map(LIGHT_LIST.map((l) => [l.id, l]));

/** Enemies whose sprite glows, by sprite id: the light that follows them, in every theme. */
export const GLOWING_SPRITES: Readonly<Record<string, string>> = { glowmoth: 'glowmoth' };

/** A theme's look (sheet section 2.1). Its ambient colour is `themes.<theme>.ambient` in the manifest. */
export interface AtmospherePreset {
  /** Dark themes get placed lights, a light round the hero and a glowing exit. */
  readonly dark: boolean;
  /** Multiplies the manifest's ambient colour (1 = as drawn; lower is darker). For tuning. */
  readonly ambient: number;
  /** Multiplies every light's strength in this theme. */
  readonly lightStrength: number;
  /** Placed lights per 100 course tiles, by light id (dark themes only). */
  readonly lightsPer100: Readonly<Record<string, number>>;
  /** Share of dead trees that get a lantern hung on them (dark themes only). */
  readonly treeLanterns: number;
}

export const ATMOSPHERE: Readonly<Record<string, AtmospherePreset>> = {
  day: { dark: false, ambient: 1, lightStrength: 1, lightsPer100: {}, treeLanterns: 0 },
  bog: { dark: false, ambient: 1, lightStrength: 1, lightsPer100: {}, treeLanterns: 0 },
  thornwood: { dark: false, ambient: 1, lightStrength: 1, lightsPer100: {}, treeLanterns: 0 },
  starfall: { dark: true, ambient: 1, lightStrength: 1, lightsPer100: { 'ground-lantern': 0.8, 'glow-mushroom': 0.8 }, treeLanterns: 0.3 },
  night: { dark: true, ambient: 1, lightStrength: 1, lightsPer100: { 'lamp-post': 0.6, 'ground-lantern': 0.8 }, treeLanterns: 0.5 },
  underground: { dark: true, ambient: 1, lightStrength: 1, lightsPer100: { 'glow-mushroom': 2 }, treeLanterns: 0 },
  spooky: { dark: true, ambient: 1, lightStrength: 1, lightsPer100: { 'lamp-post': 0.4, 'glow-mushroom': 1.2 }, treeLanterns: 0.5 },
};

/** A theme without a preset of its own looks like day. */
export function presetFor(theme: string): AtmospherePreset {
  return ATMOSPHERE[theme] ?? ATMOSPHERE.day!;
}

/** Placed lights keep at least this many tiles from each other, and from the start and the exit. */
export const LIGHT_SPACING = 3.5;

/**
 * The "Darkness" course modifier (round 2b), rebuilt on the light map: in any
 * theme the whole course is lit only by the manifest's `lights.darkness`
 * colour (times `ambient`), and the hero's light reaches this far. The rule
 * part (the shorter aim guide) is unchanged.
 */
export const DARKNESS_MOD = { ambient: 1, heroRadius: 5.5, heroStrength: 0.85 } as const;
