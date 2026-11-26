/**
 * A course's light (round 9L step L1; owner, 2026-11-26): its placed lights
 * and their props, the light round the hero, the glowing exit, glowing
 * enemies and fireflies, drawn each frame onto the light map.
 *
 * Display only: it reads the course and the play state and changes neither.
 */
import Phaser from 'phaser';
import type { Course } from '../../sim/course';
import { DARKNESS_MOD, GLOWING_SPRITES, LIGHT_MAP, LIGHTS, presetFor } from '../../content/atmosphere';
import type { Manifest } from '../manifest';
import type { LightLabValues } from '../../ui/lightLab';
import { labTheme } from '../../ui/lightLab';
import { LightLayer, type LitSpot } from './LightLayer';
import { lightLevel, placeLights, scaleColour, type PlacedLight } from './lightPlan';

/** What the course screen lends the lights: how to place a point on screen, and how to make a sprite. */
export interface LightHost {
  readonly scene: Phaser.Scene;
  readonly manifest: Manifest;
  /** The world pixel of the ground under a grid point (with the ground bumps). */
  readonly groundPx: (x: number, y: number) => { x: number; y: number };
  readonly makeSprite: (id: string) => Phaser.GameObjects.Image;
  readonly standingDepth: (x: number, y: number) => number;
  /** The light map sits at this depth: above the course, below the aim guide and the HUD. */
  readonly depth: number;
}

/** Where a tree lantern hangs on a dead tree, from the tree's foot, in pixels. */
const TREE_LANTERN_AT = { x: 6, y: -22 } as const;

export class CourseLights {
  private readonly layer: LightLayer;
  private readonly placed: { light: PlacedLight; at: { x: number; y: number }; salt: number }[];
  private readonly fireflies: { at: { x: number; y: number }; salt: number }[];
  private readonly props: Phaser.GameObjects.Image[] = [];
  private readonly preset: ReturnType<typeof presetFor>;
  private readonly exitAt: { x: number; y: number };
  private readonly host: LightHost;
  private readonly theme: string;
  private readonly darkness: boolean;
  private readonly lab: LightLabValues;

  constructor(host: LightHost, course: Course, theme: string, seed: string, darkness: boolean, lab: LightLabValues) {
    this.host = host;
    this.theme = theme;
    this.darkness = darkness;
    this.lab = lab;
    this.preset = presetFor(theme);
    this.layer = new LightLayer(host.scene, host.depth, LIGHT_MAP.resolution);
    this.placed = placeLights(course, theme, seed, labTheme(lab, theme).amount).map((light, i) => ({ light, at: host.groundPx(light.x, light.y), salt: i * 1.7 }));
    for (const { light, at } of this.placed) {
      const def = LIGHTS.get(light.id);
      if (!def?.sprite || !host.manifest.sprites[def.sprite]) continue;
      const img = host.makeSprite(def.sprite);
      if (light.id === 'tree-lantern') img.setPosition(at.x + TREE_LANTERN_AT.x, at.y + TREE_LANTERN_AT.y).setDepth(host.standingDepth(light.x, light.y) + 0.05);
      else img.setPosition(Math.round(at.x), Math.round(at.y)).setDepth(host.standingDepth(light.x, light.y));
      this.props.push(img);
    }
    this.fireflies = course.scenery.filter((s) => s.id === 'fireflies').map((s, i) => ({ at: host.groundPx(s.x, s.y), salt: 40 + i * 2.3 }));
    this.exitAt = host.groundPx(course.exit.x + 0.5, course.exit.y + 0.5);
  }

  /** The placed lights (for tests and the light lab). */
  get lights(): readonly PlacedLight[] {
    return this.placed.map((p) => p.light);
  }

  destroy(): void {
    this.layer.destroy();
    for (const p of this.props) p.destroy();
  }

  private colour(id: string): string {
    return this.host.manifest.lights?.[id] ?? '#ffffff';
  }

  /** Draw this frame's light. `ball` is the hero's spot in grid coordinates; `glowing` the enemies on the course. */
  update(nowMs: number, ball: { x: number; y: number }, glowing: readonly { x: number; y: number; sprite: string }[]): void {
    const t = nowMs / 1000;
    // The light lab's numbers start as the theme's preset (src/content/atmosphere.ts).
    const tune = labTheme(this.lab, this.theme);
    const strength = tune.lightStrength;
    const spots: LitSpot[] = [];
    const add = (id: string, at: { x: number; y: number }, salt: number, over?: { radius?: number; strength?: number }) => {
      const def = LIGHTS.get(id);
      if (!def) return;
      const k = (over?.strength ?? def.strength) * strength * lightLevel(def, t, salt);
      spots.push({ x: at.x, y: at.y, radiusTiles: over?.radius ?? def.radius, colour: scaleColour(this.colour(id), k), ...(def.headPx && { headPx: def.headPx }), ...(def.glow !== undefined && { glow: def.glow }) });
    };
    const lit = this.preset.dark || this.darkness;
    for (const p of this.placed) add(p.light.id, p.at, p.salt);
    for (const f of this.fireflies) add('fireflies', f.at, f.salt);
    for (const g of glowing) {
      const id = GLOWING_SPRITES[g.sprite];
      if (id) add(id, this.host.groundPx(g.x, g.y), g.x * 3.1);
    }
    if (lit) {
      add('exit', this.exitAt, 0);
      add('hero', this.host.groundPx(ball.x, ball.y), 0, this.darkness ? { radius: DARKNESS_MOD.heroRadius, strength: DARKNESS_MOD.heroStrength } : undefined);
    }
    const ambient = this.darkness
      ? scaleColour(this.colour('darkness'), DARKNESS_MOD.ambient * tune.ambient)
      : scaleColour(this.host.manifest.themes?.[this.theme]?.ambient ?? '#ffffff', tune.ambient);
    this.layer.draw(ambient, spots, { bands: this.lab.bands, dither: this.lab.dither, falloff: this.lab.falloff, glow: this.lab.glow });
  }
}
