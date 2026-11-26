/**
 * Light planning (round 9L, step L1). Plain functions with no Phaser, so they
 * run in Node and are unit tested: where a course's lights go, how a light's
 * glow is shaped, and how bright a light is at a moment in time.
 *
 * Display only. The placement uses its own seeded random stream (never the
 * game's), and the course, the physics and the course check never see it.
 */
import { railTileList, tileAt, type Course } from '../../sim/course.ts';
import { Rng } from '../../sim/rng.ts';
import { SCENERY_SURFACES } from '../../content/scenery.ts';
import { LIGHT_SPACING, LIGHTS, presetFor, type LightDef } from '../../content/atmosphere.ts';
import { HALF_H, HALF_W } from '../iso.ts';

/** A light placed on a course: its kind and its spot in grid coordinates. */
export interface PlacedLight {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/**
 * The lights a course gets in a theme: lamps and mushrooms on free ground,
 * lanterns hung on some dead trees. Bright themes get none. The same course,
 * theme and seed always give the same lights. `amount` multiplies how many
 * (the light lab's slider; 1 = the preset's numbers).
 */
export function placeLights(course: Course, theme: string, seed: string, amount = 1): PlacedLight[] {
  const preset = presetFor(theme);
  if (!preset.dark) return [];
  const rng = Rng.fromSeed(`${seed}/lights/${theme}`);
  const out: PlacedLight[] = [];
  const taken: { x: number; y: number }[] = [
    { x: course.start.x + 0.5, y: course.start.y + 0.5 },
    { x: course.exit.x + 0.5, y: course.exit.y + 0.5 },
  ];
  const blocked = new Set(course.objects.map((o) => `${Math.floor(o.x)},${Math.floor(o.y)}`));
  // Every tile a guard rail runs through, not only its corners.
  for (const line of course.rails) for (const p of railTileList(line)) blocked.add(`${Math.floor(p.x)},${Math.floor(p.y)}`);

  // Lanterns hung on dead trees first: they need no free ground.
  for (const o of course.objects) {
    if (o.id !== 'dead-tree' || !rng.chance(Math.min(1, preset.treeLanterns * amount))) continue;
    out.push({ id: 'tree-lantern', x: o.x, y: o.y });
    taken.push({ x: o.x, y: o.y });
  }

  // Free flat ground that scenery could stand on.
  const free: { x: number; y: number }[] = [];
  for (let y = 0; y < course.height; y++) {
    for (let x = 0; x < course.width; x++) {
      const t = tileAt(course, x, y);
      if (!t || t.shape !== '0000' || !SCENERY_SURFACES.has(t.surface) || blocked.has(`${x},${y}`)) continue;
      free.push({ x, y });
    }
  }
  const tiles = course.tiles.filter(Boolean).length;
  // Biggest lights first, so the lamps get the best spots and the small lights fill in.
  const kinds = Object.entries(preset.lightsPer100).sort((a, b) => (LIGHTS.get(b[0])?.radius ?? 0) - (LIGHTS.get(a[0])?.radius ?? 0));
  for (const [id, per100] of kinds) {
    const want = Math.round((per100 * amount * tiles) / 100);
    const pool = rng.shuffle([...free]);
    let placed = 0;
    for (const t of pool) {
      if (placed >= want) break;
      const x = t.x + rng.float(0.3, 0.7);
      const y = t.y + rng.float(0.3, 0.7);
      if (taken.some((p) => Math.hypot(p.x - x, p.y - y) < LIGHT_SPACING)) continue;
      out.push({ id, x, y });
      taken.push({ x, y });
      placed++;
    }
  }
  return out;
}

/**
 * The size on screen of a light's pool, in pixels: a circle on the ground is a
 * 2:1 ellipse in the isometric view (one tile along the grid is 16 across and 8 down).
 */
export function poolRadiusPx(radiusTiles: number): { rx: number; ry: number } {
  const rx = Math.max(2, Math.round(radiusTiles * Math.hypot(HALF_W, HALF_H) * Math.SQRT1_2 * 2));
  return { rx, ry: Math.max(1, Math.round(rx / 2)) };
}

/** A 4 x 4 ordered-dither pattern, 0 to 1 (the classic Bayer matrix). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

/**
 * A light's glow as alpha values (0 to 255), `w` x `h` = (2 rx + 1) x (2 ry + 1),
 * row by row. The brightness falls from the middle to the edge and is cut into
 * `bands` steps, with a checker-pattern mix of `dither` between the steps, so
 * it reads as pixel art rather than a smooth airbrush.
 */
export function poolAlpha(rx: number, ry: number, bands: number, dither: number, falloff: number): { w: number; h: number; data: Uint8Array } {
  const w = rx * 2 + 1;
  const h = ry * 2 + 1;
  const data = new Uint8Array(w * h);
  const steps = Math.max(1, Math.round(bands));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot((x - rx) / (rx + 0.5), (y - ry) / (ry + 0.5));
      if (d >= 1) continue;
      const v = Math.pow(1 - d, Math.max(0.1, falloff));
      const nudge = (BAYER[(y % 4) * 4 + (x % 4)]! - 0.5) * dither;
      const level = Math.max(0, Math.min(steps, Math.floor(v * steps + 0.5 + nudge)));
      data[y * w + x] = Math.round((level / steps) * 255);
    }
  }
  return { w, h, data };
}

/** Small stable hash of a number, 0 to 1 (for flicker that looks random but is the same every time). */
function noise(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Smooth random wobble, 0 to 1, changing about `rate` times a second. */
function wobble(tSec: number, rate: number, salt: number): number {
  const u = tSec * rate + salt;
  const i = Math.floor(u);
  const f = u - i;
  const k = f * f * (3 - 2 * f);
  return noise(i + salt * 13.1) * (1 - k) + noise(i + 1 + salt * 13.1) * k;
}

/** How bright a light is at time `tSec` (seconds), as a share of its strength, 0 to 1. `salt` makes each light move on its own. */
export function lightLevel(def: Pick<LightDef, 'motion'>, tSec: number, salt: number): number {
  switch (def.motion) {
    case 'still':
      return 1;
    case 'pulse':
      return 0.8 + 0.2 * Math.sin(tSec * 2.2 + salt);
    case 'gentle':
      return 0.85 + 0.15 * wobble(tSec, 3, salt);
    case 'strong':
      return 0.35 + 0.65 * wobble(tSec, 7, salt);
  }
}

/** A "#rrggbb" colour times `k` (each channel clamped to 0 to 255), as a number. */
export function scaleColour(hex: string, k: number): number {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = (shift: number) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * k)));
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
