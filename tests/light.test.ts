/**
 * Round 9L step L1 (sheet docs/plans/milestone-9-light.md, signed off by the
 * owner 2026-11-26): where lights go, the shape of a light's glow, flicker,
 * and that every light and theme has its colour in the asset manifest.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ATMOSPHERE, GLOWING_SPRITES, LIGHT_LIST, LIGHT_SPACING, LIGHTS } from '../src/content/atmosphere';
import { SCENERY_SURFACES } from '../src/content/scenery';
import { THEMES } from '../src/content/biomes';
import { railTileList, tileAt, type Course } from '../src/sim/course';
import { generateAttempt } from '../src/gen/generate';
import { lightLevel, placeLights, poolAlpha, poolRadiusPx, scaleColour } from '../src/render/atmosphere/lightPlan';
import type { Manifest } from '../src/render/manifest';

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8')) as Manifest;

/** A few generated courses (quick attempts, no bot). */
const COURSES: Course[] = Array.from({ length: 30 }, (_, i) => generateAttempt(`L${i}`, 12, 0))
  .filter((r) => r.ok)
  .map((r) => (r as Extract<typeof r, { ok: true }>).course)
  .slice(0, 12);

const DARK = THEMES.filter((t) => ATMOSPHERE[t]?.dark);
const BRIGHT = THEMES.filter((t) => !ATMOSPHERE[t]?.dark);

describe('placing lights', () => {
  it('has courses to test with', () => {
    expect(COURSES.length).toBeGreaterThan(5);
  });

  it('the same course, theme and seed always give the same lights', () => {
    for (const c of COURSES) for (const t of DARK) expect(placeLights(c, t, 'SEED')).toEqual(placeLights(c, t, 'SEED'));
  });

  it('bright themes get no placed lights; dark themes get some', () => {
    for (const c of COURSES) for (const t of BRIGHT) expect(placeLights(c, t, 'SEED')).toEqual([]);
    const total = COURSES.reduce((n, c) => n + placeLights(c, 'night', 'SEED').length, 0);
    expect(total).toBeGreaterThan(COURSES.length);
  });

  it('placing lights does not change the course', () => {
    for (const c of COURSES) {
      const before = JSON.stringify(c);
      for (const t of THEMES) placeLights(c, t, 'SEED');
      expect(JSON.stringify(c)).toBe(before);
    }
  });

  it('ground lights stand on free flat ground, apart from each other, the start and the exit', () => {
    for (const c of COURSES) {
      for (const t of DARK) {
        const lights = placeLights(c, t, 'SEED').filter((l) => l.id !== 'tree-lantern');
        const rails = new Set(c.rails.flatMap((line) => railTileList(line)).map((p) => `${Math.floor(p.x)},${Math.floor(p.y)}`));
        const objects = new Set(c.objects.map((o) => `${Math.floor(o.x)},${Math.floor(o.y)}`));
        for (const l of lights) {
          const tx = Math.floor(l.x);
          const ty = Math.floor(l.y);
          const tile = tileAt(c, tx, ty);
          expect(tile?.shape).toBe('0000');
          expect(SCENERY_SURFACES.has(tile!.surface)).toBe(true);
          expect(rails.has(`${tx},${ty}`)).toBe(false);
          expect(objects.has(`${tx},${ty}`)).toBe(false);
          for (const p of [c.start, c.exit]) expect(Math.hypot(p.x + 0.5 - l.x, p.y + 0.5 - l.y)).toBeGreaterThanOrEqual(LIGHT_SPACING);
        }
        for (let i = 0; i < lights.length; i++) {
          for (let j = i + 1; j < lights.length; j++) expect(Math.hypot(lights[i]!.x - lights[j]!.x, lights[i]!.y - lights[j]!.y)).toBeGreaterThanOrEqual(LIGHT_SPACING);
        }
      }
    }
  });

  it('hangs lanterns only on dead trees, and the light lab amount scales how many', () => {
    const c0 = COURSES[0]!;
    const trees = [3, 6, 9].map((k) => ({ id: 'dead-tree', x: k + 0.5, y: k + 0.5, path: [], facing: c0.objects[0]?.facing ?? 'ne', phase: 0 }));
    const c = { ...c0, objects: [...c0.objects, ...trees] } as Course;
    const all = placeLights(c, 'night', 'TREES', 10);
    const hung = all.filter((l) => l.id === 'tree-lantern');
    expect(hung.length).toBe(c.objects.filter((o) => o.id === 'dead-tree').length);
    for (const l of hung) expect(c.objects.some((o) => o.id === 'dead-tree' && o.x === l.x && o.y === l.y)).toBe(true);
    expect(placeLights(c, 'night', 'TREES', 0)).toEqual([]);
  });
});

describe('the shape of a light', () => {
  it('a circle on the ground is a 2:1 ellipse on screen', () => {
    for (const r of [1, 1.5, 2.5, 4]) {
      const { rx, ry } = poolRadiusPx(r);
      expect(Math.abs(rx - 2 * ry)).toBeLessThanOrEqual(1);
    }
  });

  it('is brightest in the middle, dark at the edge, and cut into steps', () => {
    for (const bands of [1, 3, 4, 8]) {
      const { w, h, data } = poolAlpha(30, 15, bands, 0.6, 1.4);
      expect(data[15 * w + 30]).toBe(255);
      expect(data[0]).toBe(0);
      expect(data[w - 1]).toBe(0);
      expect(data[(h - 1) * w]).toBe(0);
      const levels = new Set(data);
      expect(levels.size).toBeLessThanOrEqual(bands + 1);
      const allowed = new Set(Array.from({ length: bands + 1 }, (_, k) => Math.round((k / bands) * 255)));
      for (const v of levels) expect(allowed.has(v), String(v)).toBe(true);
    }
  });

  it('is the same on the left and the right', () => {
    const { w, h, data } = poolAlpha(20, 10, 4, 0, 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) expect(data[y * w + x]).toBe(data[y * w + (w - 1 - x)]);
  });
});

describe('flicker and colour', () => {
  it('every light stays between dark and its full strength', () => {
    for (const def of LIGHT_LIST) {
      for (let t = 0; t < 20; t += 0.037) {
        const v = lightLevel(def, t, 3.3);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('a still light does not change', () => {
    expect(lightLevel({ motion: 'still' }, 0, 0)).toBe(1);
    expect(lightLevel({ motion: 'still' }, 12.3, 5)).toBe(1);
  });

  it('scales colours and clamps them', () => {
    expect(scaleColour('#808080', 0.5)).toBe(0x404040);
    expect(scaleColour('#808080', 4)).toBe(0xffffff);
    expect(scaleColour('#ff8000', 0)).toBe(0);
  });
});

describe('light colours live with the art (rule 5)', () => {
  it('every light and the Darkness modifier have a colour in the manifest', () => {
    for (const def of LIGHT_LIST) expect(manifest.lights?.[def.id], def.id).toMatch(/^#[0-9a-f]{6}$/u);
    expect(manifest.lights?.darkness).toMatch(/^#[0-9a-f]{6}$/u);
  });

  it('every theme has a preset and an ambient colour', () => {
    for (const t of THEMES) {
      expect(ATMOSPHERE[t], t).toBeDefined();
      expect(manifest.themes?.[t]?.ambient, t).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });

  it('every light prop and glowing sprite exists', () => {
    for (const def of LIGHT_LIST) if (def.sprite) expect(manifest.sprites[def.sprite], def.sprite).toBeDefined();
    for (const [sprite, light] of Object.entries(GLOWING_SPRITES)) {
      expect(manifest.sprites[sprite], sprite).toBeDefined();
      expect(LIGHTS.has(light)).toBe(true);
    }
  });

  it('presets only name lights that exist', () => {
    for (const p of Object.values(ATMOSPHERE)) for (const id of Object.keys(p.lightsPer100)) expect(LIGHTS.has(id), id).toBe(true);
  });
});
