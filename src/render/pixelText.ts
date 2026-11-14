import Phaser from 'phaser';
import { frameIndex, type Manifest } from './manifest';

const FONT = 'font';

/**
 * Draws text with the tiny pixel font from the asset manifest. Lower-case is
 * shown as upper-case; characters the font lacks show as "?".
 * Returns a container positioned at (x, y), the top-left corner of the text.
 */
export function pixelText(
  scene: Phaser.Scene,
  manifest: Manifest,
  x: number,
  y: number,
  text: string,
  opts: { color?: number; background?: number; padding?: number } = {},
): Phaser.GameObjects.Container {
  const font = manifest.sprites[FONT];
  if (!font) throw new Error('The manifest has no "font" sprite.');
  const pad = opts.padding ?? (opts.background === undefined ? 0 : 1);
  const lines = text.toUpperCase().split('\n');
  const container = scene.add.container(x, y);
  const width = Math.max(...lines.map((l) => l.length)) * font.frameWidth - 1;
  const height = lines.length * font.frameHeight - 1;
  if (opts.background !== undefined) {
    container.add(scene.add.rectangle(0, 0, width + pad * 2, height + pad * 2, opts.background, 0.85).setOrigin(0, 0));
  }
  lines.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      if (ch === ' ') return;
      const frame = font.frames.includes(ch) ? ch : '?';
      const img = scene.add
        .image(pad + col * font.frameWidth, pad + row * font.frameHeight, FONT, frameIndex(font, frame))
        .setOrigin(0, 0)
        .setTint(opts.color ?? 0xffffff);
      container.add(img);
    });
  });
  container.setSize(width + pad * 2, height + pad * 2);
  return container;
}
