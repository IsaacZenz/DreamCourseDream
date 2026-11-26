/**
 * The light map (round 9L sheet section 2.2; owner, 2026-11-26).
 *
 * A hidden picture the size of the screen is filled with the theme's ambient
 * colour, each light is added onto it as a soft stepped glow, and the picture
 * is then multiplied over the course: white leaves the art as drawn, dark blue
 * turns it dark blue. One extra layer, however many lights there are.
 *
 * Multiplying can only darken, and dark themes are drawn dark already, so a
 * second picture holds the lights alone and is *added* on top, faintly
 * (`glow`): that is what lets a lamp warm the ground round it.
 *
 * The picture is `LIGHT_MAP.resolution` times the game's own size (option A:
 * 1). It covers whatever the camera sees, so it follows zooms and the overview.
 * The HUD and the aim guide are drawn above it, so they are never darkened.
 */
import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from '../config';
import { poolAlpha, poolRadiusPx } from './lightPlan';

/** One light to draw this frame, in world pixels (the ground spot under it). */
export interface LitSpot {
  readonly x: number;
  readonly y: number;
  readonly radiusTiles: number;
  /** The light's colour as 0xrrggbb, already times its strength and flicker. */
  readonly colour: number;
  /** A tall light's lamp: a small glow this many pixels above the spot. */
  readonly headPx?: number;
  /** Multiplies the glow added on top for this light (Default 1). */
  readonly glow?: number;
}

export interface PoolShape {
  readonly bands: number;
  readonly dither: number;
  readonly falloff: number;
  /** How much of each light is also added on top (0 = none). */
  readonly glow: number;
}

export class LightLayer {
  private readonly scene: Phaser.Scene;
  private readonly resolution: number;
  private readonly rt: Phaser.GameObjects.RenderTexture;
  private readonly glowRt: Phaser.GameObjects.RenderTexture;
  private readonly w: number;
  private readonly h: number;

  constructor(scene: Phaser.Scene, depth: number, resolution: number) {
    this.scene = scene;
    this.resolution = resolution;
    this.w = VIEW_WIDTH * resolution;
    this.h = VIEW_HEIGHT * resolution;
    this.rt = scene.add.renderTexture(0, 0, this.w, this.h).setOrigin(0, 0).setDepth(depth).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.glowRt = scene.add.renderTexture(0, 0, this.w, this.h).setOrigin(0, 0).setDepth(depth + 1).setBlendMode(Phaser.BlendModes.ADD);
  }

  setVisible(on: boolean): void {
    this.rt.setVisible(on);
    this.glowRt.setVisible(on);
  }

  destroy(): void {
    this.rt.destroy();
    this.glowRt.destroy();
  }

  /** The texture of a light's glow: made once per size and shape, then reused. */
  private poolKey(radiusTiles: number, shape: PoolShape): string {
    const { rx, ry } = poolRadiusPx(radiusTiles * this.resolution);
    const key = `light-pool-${rx}x${ry}-${shape.bands}-${shape.dither}-${shape.falloff}`;
    const textures = this.scene.textures;
    if (!textures.exists(key)) {
      const pool = poolAlpha(rx, ry, shape.bands, shape.dither, shape.falloff);
      const tex = textures.createCanvas(key, pool.w, pool.h)!;
      const ctx = tex.getContext();
      const img = ctx.createImageData(pool.w, pool.h);
      for (let i = 0; i < pool.data.length; i++) {
        img.data[i * 4] = 255;
        img.data[i * 4 + 1] = 255;
        img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = pool.data[i]!;
      }
      ctx.putImageData(img, 0, 0);
      tex.refresh();
    }
    return key;
  }

  /** Draw this frame's light: the ambient colour, then every light added on top. */
  draw(ambient: number, spots: readonly LitSpot[], shape: PoolShape): void {
    const cam = this.scene.cameras.main;
    const view = cam.worldView;
    if (view.width <= 0 || view.height <= 0) return;
    // Cover exactly what the camera sees.
    this.rt.setPosition(view.x, view.y).setDisplaySize(view.width, view.height);
    this.glowRt.setPosition(view.x, view.y).setDisplaySize(view.width, view.height);
    const sx = this.w / view.width;
    const sy = this.h / view.height;
    // Light textures are made at `resolution` pixels per world pixel; scale them to the camera's view.
    const scale = sx / this.resolution;
    this.rt.clear();
    this.rt.fill(ambient, 1);
    this.glowRt.clear();
    const glow = shape.glow > 0;
    for (const s of spots) {
      const at = (wx: number, wy: number) => [Math.round((wx - view.x) * sx), Math.round((wy - view.y) * sy)] as const;
      const [px, py] = at(s.x, s.y);
      const { rx, ry } = poolRadiusPx(s.radiusTiles * this.resolution);
      if (px + rx * scale < 0 || py + ry * scale < 0 || px - rx * scale > this.w || py - ry * scale > this.h) continue;
      const key = this.poolKey(s.radiusTiles, shape);
      this.rt.stamp(key, undefined, px, py, { tint: s.colour, scale, blendMode: Phaser.BlendModes.ADD });
      if (glow) this.glowRt.stamp(key, undefined, px, py, { tint: s.colour, alpha: shape.glow * (s.glow ?? 1), scale, blendMode: Phaser.BlendModes.ADD });
      if (s.headPx) {
        const [hx, hy] = at(s.x, s.y - s.headPx);
        const head = this.poolKey(0.6, shape);
        this.rt.stamp(head, undefined, hx, hy, { tint: s.colour, scale, blendMode: Phaser.BlendModes.ADD });
        if (glow) this.glowRt.stamp(head, undefined, hx, hy, { tint: s.colour, alpha: Math.min(1, shape.glow * 2), scale, blendMode: Phaser.BlendModes.ADD });
      }
    }
    this.rt.render();
    this.glowRt.render();
  }
}
