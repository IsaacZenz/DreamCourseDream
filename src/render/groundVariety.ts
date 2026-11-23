/**
 * Grass variety (art pipeline, owner 2026-11-23, "calm D"): picks each grass tile's
 * design and meadow level from its spot, so the grass never looks like one repeated
 * tile. Display only, and repeatable: the same tile always looks the same.
 * Settings: GRASS_VARIETY in src/content/scenery.ts.
 */
import { GRASS_VARIETY } from '../content/scenery.ts';

function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise from 0 to 1, with features about `size` tiles across. */
export function meadowNoise(x: number, y: number, size: number): number {
  const fx = x / size;
  const fy = y / size;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const ease = (t: number) => t * t * (3 - 2 * t);
  const sx = ease(fx - x0);
  const sy = ease(fy - y0);
  const a = hash(x0, y0, 7);
  const b = hash(x0 + 1, y0, 7);
  const c = hash(x0, y0 + 1, 7);
  const d = hash(x0 + 1, y0 + 1, 7);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** The meadow level of a tile: one of GRASS_VARIETY.meadowLevels' ids. */
export function meadowLevel(x: number, y: number): string {
  const n = meadowNoise(x, y, GRASS_VARIETY.meadowSize);
  let id = GRASS_VARIETY.meadowLevels[0]!.id;
  for (const level of GRASS_VARIETY.meadowLevels) if (n >= level.from) id = level.id;
  return id;
}

/** The design index of a tile, weighted, with the meadow level's bias. */
export function grassDesign(x: number, y: number, level: string): number {
  const bias = GRASS_VARIETY.bias[level];
  const weights = GRASS_VARIETY.designs.map((d) => d.weight * (bias?.[d.kind] ?? 1));
  let r = hash(x, y, 11) * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < weights.length; k++) {
    r -= weights[k]!;
    if (r < 0) return k;
  }
  return weights.length - 1;
}

/** The frame name suffix for a grass tile, e.g. "~g3n". */
export function grassFrameSuffix(x: number, y: number): string {
  const level = meadowLevel(x, y);
  return `~g${grassDesign(x, y, level)}${level}`;
}
