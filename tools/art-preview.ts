/**
 * Preview sprite files before they go into the game (docs/plans/art-pipeline.md
 * sections 4.3 and 4.4).
 *
 *   npm run art:preview -- art/src/G14-gear-pin-needle.sprite
 *   npm run art:preview -- G14                    (finds art/src/G14-*.sprite)
 *   npm run art:preview -- art/drafts/G14-a.sprite art/drafts/G14-b.sprite   (render-downs side by side: A, B)
 *
 * Each column shows: the frames at true size and at 3× (about how big they look
 * in the game) on grass and on a dark background, then enlarged, then every copy
 * the press makes (flipped, recolours, themes), then what the game uses now.
 * Writes art/previews/<name>.png.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest } from '../src/render/manifest.ts';
import { blitScaled, checker, drawText, fillRect, loadFont, textWidth } from './art/draw.ts';
import { codeProblem, loadArt, outputsOf, readCodes } from './art/press.ts';
import { readSprite } from './art/sprite.ts';
import { Image, decodePng, encodePng, type RGBA } from './png.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const art = loadArt(ROOT);
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/manifest.json'), 'utf8')) as Manifest;
const font = loadFont(ROOT, manifest);
const codes = readCodes(ROOT);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Give one or more sprite files or codes, e.g. npm run art:preview -- G14');
  process.exit(1);
}
const paths = args.map((a) => {
  if (existsSync(a)) return a;
  for (const folder of ['art/src', 'art/drafts', 'art/mockups']) {
    const dir = join(ROOT, folder);
    const hit = existsSync(dir) ? readdirSync(dir).find((f) => f.startsWith(`${a}-`) && f.endsWith('.sprite')) : undefined;
    if (hit) return join(dir, hit);
  }
  console.error(`No sprite file found for "${a}"`);
  return process.exit(1);
});

const BG: RGBA = [32, 32, 44, 255];
const TEXT: RGBA = [240, 232, 200, 255];
const DIM: RGBA = [150, 146, 170, 255];
const grass = art.ramps.green![3]!;
const grassDark = art.ramps.green![2]!;
const dark = art.ramps.grey![1]!;
const GAP = 12;

interface Block {
  readonly w: number;
  readonly h: number;
  readonly draw: (img: Image, x: number, y: number) => void;
}

const text = (s: string, scale: number, colour = TEXT): Block => ({ w: textWidth(font, s, scale), h: font.h * scale, draw: (img, x, y) => drawText(img, font, x, y, s, scale, colour) });

/** A strip of frames from a sheet, each on a background, at a scale. */
function strip(sheet: Image, fw: number, fh: number, n: number, scale: number, bg: 'grass' | 'dark' | 'checker'): Block {
  const cols = Math.max(1, Math.floor(sheet.width / fw));
  const pad = 2 * scale;
  return {
    w: n * (fw * scale + pad * 2) + (n - 1) * 4,
    h: fh * scale + pad * 2,
    draw: (img, x, y) => {
      for (let f = 0; f < n; f++) {
        const fx = x + f * (fw * scale + pad * 2 + 4);
        const bw = fw * scale + pad * 2;
        const bh = fh * scale + pad * 2;
        if (bg === 'grass') checker(img, fx, y, bw, bh, 8 * Math.max(1, Math.floor(scale / 2)), grass, grassDark);
        else if (bg === 'dark') fillRect(img, fx, y, bw, bh, dark);
        else checker(img, fx, y, bw, bh, Math.max(2, scale), [58, 58, 74, 255], [50, 50, 64, 255]);
        blitScaled(img, sheet, fx + pad, y + pad, scale, (f % cols) * fw, Math.floor(f / cols) * fh, fw, fh);
      }
    },
  };
}

const column = (blocks: Block[]): Block => ({
  w: Math.max(...blocks.map((b) => b.w)),
  h: blocks.reduce((n, b) => n + b.h + 6, -6),
  draw: (img, x, y) => {
    let yy = y;
    for (const b of blocks) {
      b.draw(img, x, yy);
      yy += b.h + 6;
    }
  },
});
const row = (blocks: Block[], gap = 8): Block => ({
  w: blocks.reduce((n, b) => n + b.w + gap, -gap),
  h: Math.max(...blocks.map((b) => b.h)),
  draw: (img, x, y) => {
    let xx = x;
    for (const b of blocks) {
      b.draw(img, xx, y);
      xx += b.w + gap;
    }
  },
});

const columns = paths.map((p, i) => {
  const src = readSprite(p, art.ramps);
  const problem = codeProblem(src, codes);
  if (problem) console.warn(`Warning: ${problem}`);
  const old = manifest.sprites[src.id];
  const outs = outputsOf(src, art, old?.anchor ?? null);
  const main = outs[0]!;
  const n = src.frames.length;
  const big = Math.max(2, Math.min(10, Math.floor(160 / Math.max(src.width, src.height))));
  const title = paths.length > 1 ? `${String.fromCharCode(65 + i)}: ${src.code} ${src.status}` : `${src.code} ${src.id} ${src.status}`;
  const blocks: Block[] = [text(title, 3), text(`${src.width}x${src.height}  ${basename(p)}`, 2, DIM)];
  blocks.push(text('TRUE SIZE AND 3X (GAME SIZE)', 2, DIM));
  blocks.push(row([strip(main.img, src.width, src.height, n, 1, 'grass'), strip(main.img, src.width, src.height, n, 1, 'dark'), strip(main.img, src.width, src.height, n, 3, 'grass'), strip(main.img, src.width, src.height, n, 3, 'dark')]));
  blocks.push(text('ENLARGED', 2, DIM));
  blocks.push(strip(main.img, src.width, src.height, n, big, 'checker'));
  const extra = outs.slice(1);
  if (extra.length) {
    blocks.push(text('MADE AUTOMATICALLY', 2, DIM));
    for (let k = 0; k < extra.length; k += 4)
      blocks.push(row(extra.slice(k, k + 4).map((o) => column([text(o.id.replace(src.id, '').replace(/^@/, '') || o.id, 1, DIM), strip(o.img, src.width, src.height, Math.min(n, 2), 2, o.id.includes('@') ? 'dark' : 'grass')]))));
  }
  if (old) {
    const pic = decodePng(readFileSync(join(ROOT, 'assets', old.file)));
    const oldBig = Math.max(2, Math.min(10, Math.floor(160 / Math.max(old.frameWidth, old.frameHeight))));
    blocks.push(text('IN THE GAME NOW', 2, DIM));
    blocks.push(strip(pic, old.frameWidth, old.frameHeight, Math.min(old.frames.length, 6), oldBig, 'checker'));
  } else blocks.push(text('NEW SPRITE: NOT IN THE GAME YET', 2, DIM));
  return column(blocks);
});

const all = row(columns, GAP * 3);
const img = new Image(all.w + GAP * 2, all.h + GAP * 2);
fillRect(img, 0, 0, img.width, img.height, BG);
all.draw(img, GAP, GAP);
mkdirSync(join(ROOT, 'art/previews'), { recursive: true });
const name = paths.length > 1 ? `compare-${paths.map((p) => basename(p, '.sprite')).join('_')}`.slice(0, 120) : basename(paths[0]!, '.sprite');
const out = join(ROOT, 'art/previews', `${name}.png`);
writeFileSync(out, encodePng(img));
console.log(`Wrote ${out}`);
