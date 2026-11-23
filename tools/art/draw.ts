/** Small drawing helpers for the art pipeline's contact sheets and previews. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Manifest } from '../../src/render/manifest.ts';
import { Image, decodePng, type RGBA } from '../png.ts';

export interface Font {
  readonly img: Image;
  readonly glyphs: ReadonlyMap<string, number>;
  readonly w: number;
  readonly h: number;
}

/** The game's own 4×6 pixel font (sprite "font"). */
export function loadFont(root: string, manifest: Manifest): Font {
  const e = manifest.sprites.font!;
  const img = decodePng(readFileSync(join(root, 'assets', e.file)));
  return { img, glyphs: new Map(e.frames.map((ch, i) => [ch, i])), w: e.frameWidth, h: e.frameHeight };
}

export function textWidth(font: Font, text: string, scale: number): number {
  return text.length * font.w * scale;
}

export function drawText(img: Image, font: Font, x: number, y: number, text: string, scale: number, colour: RGBA): void {
  [...text.toUpperCase()].forEach((ch, i) => {
    const g = font.glyphs.get(ch);
    if (g === undefined) return;
    for (let py = 0; py < font.h; py++)
      for (let px = 0; px < font.w; px++)
        if (font.img.get(g * font.w + px, py)[3] > 0) fillRect(img, x + (i * font.w + px) * scale, y + py * scale, scale, scale, colour);
  });
}

export function fillRect(img: Image, x: number, y: number, w: number, h: number, c: RGBA): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.set(x + i, y + j, c);
}

/** A checkerboard, so see-through pixels show as see-through. */
export function checker(img: Image, x: number, y: number, w: number, h: number, size: number, a: RGBA, b: RGBA): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) img.set(x + i, y + j, (Math.floor(i / size) + Math.floor(j / size)) % 2 ? a : b);
}

/** Draw `src` (or part of it) scaled up by a whole number, blending over what is there. */
export function blitScaled(dst: Image, src: Image, dx: number, dy: number, scale: number, sx = 0, sy = 0, sw = src.width, sh = src.height): void {
  for (let y = 0; y < sh; y++)
    for (let x = 0; x < sw; x++) {
      const c = src.get(sx + x, sy + y);
      if (c[3] === 0) continue;
      for (let j = 0; j < scale; j++)
        for (let i = 0; i < scale; i++) {
          const px = dx + x * scale + i;
          const py = dy + y * scale + j;
          if (px < 0 || py < 0 || px >= dst.width || py >= dst.height) continue;
          const d = dst.get(px, py);
          const a = c[3] / 255;
          dst.set(px, py, [Math.round(c[0] * a + d[0] * (1 - a)), Math.round(c[1] * a + d[1] * (1 - a)), Math.round(c[2] * a + d[2] * (1 - a)), 255]);
        }
    }
}

/** How much to enlarge a sprite of this size on a contact sheet. */
export function sheetScale(w: number, h: number): number {
  return Math.max(1, Math.min(6, Math.floor(144 / Math.max(w, h))));
}

/** Lay boxes out in rows no wider than `maxWidth`; returns each box's position and the total height. */
export function flow(sizes: ReadonlyArray<readonly [number, number]>, maxWidth: number, gap: number): { pos: Array<[number, number]>; height: number } {
  const pos: Array<[number, number]> = [];
  let x = gap;
  let y = gap;
  let rowH = 0;
  for (const [w, h] of sizes) {
    if (x > gap && x + w + gap > maxWidth) {
      x = gap;
      y += rowH + gap;
      rowH = 0;
    }
    pos.push([x, y]);
    x += w + gap;
    rowH = Math.max(rowH, h);
  }
  return { pos, height: y + rowH + gap };
}
