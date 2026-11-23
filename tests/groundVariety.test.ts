/**
 * Grass variety (art pipeline, owner 2026-11-23, "calm D"): each grass tile gets a
 * design and a meadow level from its spot. Display only.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRASS_VARIETY } from '../src/content/scenery.ts';
import { SURFACES } from '../src/content/surfaces.ts';
import type { Manifest } from '../src/render/manifest.ts';
import { grassDesign, grassFrameSuffix, meadowLevel, meadowNoise } from '../src/render/groundVariety.ts';
import { SHAPES } from '../src/sim/tileShape.ts';

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'assets/manifest.json'), 'utf8')) as Manifest;
const grass = SURFACES.get('grass')!;
const area = (n: number) => Array.from({ length: n * n }, (_, i) => [i % n, Math.floor(i / n)] as const);

describe('grass variety', () => {
  it('is on for grass only', () => {
    expect(grass.grassVariety).toBe(true);
    for (const s of SURFACES.values()) if (s.id !== 'grass') expect(s.grassVariety).toBeFalsy();
  });

  it('always picks the same look for the same tile', () => {
    for (const [x, y] of area(20)) expect(grassFrameSuffix(x, y)).toBe(grassFrameSuffix(x, y));
  });

  it('every frame the game can pick exists in the grass sprite and in every theme version', () => {
    const ids = Object.keys(manifest.sprites).filter((id) => id === grass.tileSprite || id.startsWith(`${grass.tileSprite}@`));
    expect(ids.length).toBeGreaterThan(1);
    for (const id of ids) {
      const frames = new Set(manifest.sprites[id]!.frames);
      for (const shape of SHAPES)
        for (const checker of ['', 'b'])
          for (const level of GRASS_VARIETY.meadowLevels)
            GRASS_VARIETY.designs.forEach((_, k) => expect(frames.has(`${shape}${checker}~g${k}${level.id}`), `${id} ${shape}${checker}~g${k}${level.id}`).toBe(true));
      // Plain frames stay, for the loading screen strip.
      for (const shape of SHAPES) expect(frames.has(shape) && frames.has(`${shape}b`)).toBe(true);
    }
  });

  it('uses every design and every meadow level on a big course, roughly as weighted', () => {
    const designs = new Map<number, number>();
    const levels = new Map<string, number>();
    const tiles = area(80);
    for (const [x, y] of tiles) {
      const level = meadowLevel(x, y);
      levels.set(level, (levels.get(level) ?? 0) + 1);
      const k = grassDesign(x, y, level);
      designs.set(k, (designs.get(k) ?? 0) + 1);
    }
    for (const level of GRASS_VARIETY.meadowLevels) expect(levels.get(level.id) ?? 0, `meadow level ${level.id}`).toBeGreaterThan(tiles.length * 0.05);
    GRASS_VARIETY.designs.forEach((_, k) => expect(designs.get(k) ?? 0, `design ${k}`).toBeGreaterThan(0));
    // Plain tiles are the most common, flowers the rarest: calm, with a little variety.
    const plain = (designs.get(0) ?? 0) + (designs.get(1) ?? 0);
    const flowers = (designs.get(9) ?? 0) + (designs.get(10) ?? 0);
    expect(plain).toBeGreaterThan(tiles.length * 0.3);
    expect(flowers).toBeLessThan(tiles.length * 0.12);
  });

  it('meadow patches are smooth: neighbouring tiles are seldom more than one level apart', () => {
    const order = GRASS_VARIETY.meadowLevels.map((l) => l.id);
    let jumps = 0;
    let pairs = 0;
    for (const [x, y] of area(60)) {
      const a = order.indexOf(meadowLevel(x, y));
      const b = order.indexOf(meadowLevel(x + 1, y));
      pairs++;
      if (Math.abs(a - b) > 1) jumps++;
    }
    expect(jumps / pairs).toBeLessThan(0.02);
  });

  it('the noise stays between 0 and 1', () => {
    for (const [x, y] of area(30)) {
      const n = meadowNoise(x * 1.3, y * 0.7, GRASS_VARIETY.meadowSize);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});
