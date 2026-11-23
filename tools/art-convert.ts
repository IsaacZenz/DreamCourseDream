/**
 * The converter (docs/plans/art-converter.md): a photo of the owner's drawing to
 * first-draft sprite files in the house style B2, ready for Claude's hand finish.
 *
 *   npm run art:convert -- art/inbox/E1-drawing.jpg E1
 *   npm run art:convert -- photo.jpg G13 --colours coloured=green,plain=grey
 *   npm run art:convert -- photo.jpg H6 --ignore 0.6,0.75,1,1 --keep 0.3,0.2
 *
 * --colours   the ramp for marker-coloured parts and for plain parts (default in art/convert.json)
 * --size WxH  the box size, if not the Art List's (or art/targets.json's)
 * --crop      use only this part of the photo (fractions: x0,y0,x1,y1): one drawing on a page
 *             of several. The other options' fractions are then of the cropped part.
 * --ignore    leave out everything in a box of the photo (fractions: x0,y0,x1,y1)
 * --keep      bring back a stroke that was left out (fractions: x,y)
 * --paint     give the part at a spot of the photo a colour ramp (fractions: x,y=ramp), for
 *             drawings without marker or with several colours; repeat for several parts
 *
 * Writes art/drafts/<code>-convert-a.sprite (keeps the drawing's proportions) and,
 * when the drawing's shape does not match the box, -b (stretched to fill it); a part
 * map beside each; art/drafts/<code>-convert-reading.png (what was read from the photo);
 * and a side-by-side preview in art/previews/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest } from '../src/render/manifest.ts';
import { b2Key, fits, partMap, partText, readDrawing, readPhoto, shadeB2, type ConvertSettings } from './art/convert.ts';
import { readCodes, readTargets } from './art/press.ts';
import { Image, encodePng } from './png.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name: string) => {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) if (args[i] === `--${name}`) out.push(args[i + 1] ?? '');
  return out;
};
const [photoPath, code] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!photoPath || !code) {
  console.error('Usage: npm run art:convert -- <photo> <code> [--crop x0,y0,x1,y1] [--colours coloured=purple,plain=tan] [--paint x,y=ramp] [--size WxH] [--ignore x0,y0,x1,y1] [--keep x,y]');
  process.exit(1);
}
const settings = JSON.parse(readFileSync(join(ROOT, 'art/convert.json'), 'utf8')) as ConvertSettings;
const id = readCodes(ROOT)[code];
if (!id) {
  console.error(`${code} is not on the Art List (art/codes.json).`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/manifest.json'), 'utf8')) as Manifest;
const entry = manifest.sprites[id]!;
const size = flag('size')[0] ?? readTargets(ROOT)[id] ?? `${entry.frameWidth}x${entry.frameHeight}`;
const [W, H] = size.split('x').map(Number) as [number, number];
const colours = { ...settings.colours };
for (const pair of (flag('colours')[0] ?? '').split(',').filter(Boolean)) {
  const [k, v] = pair.split('=');
  if (k === 'coloured' || k === 'plain') colours[k] = v!;
}
const nums = (s: string) => s.split(',').map(Number);

const crop = flag('crop')[0];
const photo = readPhoto(photoPath, settings.workSize, crop ? nums(crop) : undefined);
const reading = readDrawing(photo, settings, flag('ignore').map(nums), flag('keep').map(nums));
// --paint x,y=ramp: the part under that spot of the photo takes that ramp.
const painted = new Map<string, string>();
for (const p of flag('paint')) {
  const [at, ramp] = p.split('=');
  const [fx, fy] = nums(at ?? '');
  const region = reading.label[Math.floor(fy! * photo.h) * photo.w + Math.floor(fx! * photo.w)]!;
  if (region < 0 || !ramp) console.warn(`--paint ${p}: no part there (that spot is a line or outside the drawing)`);
  else painted.set(String(region), ramp);
}
const rampOf = (part: string) => painted.get(part.slice(0, -1)) ?? (part.endsWith('c') ? colours.coloured : colours.plain);

// What was read: the photo in grey, parts tinted (marker parts warm), lines dark, marks red, strokes blue.
const view = new Image(photo.w, photo.h);
for (let i = 0; i < photo.w * photo.h; i++) {
  const g = photo.grey[i]! * 0.5 + 100;
  const l = reading.label[i]!;
  let c: [number, number, number] = [g, g, g];
  if (l === -2) c = [30, 30, 40];
  else if (l >= 0) {
    const t = ((l * 67) % 360) / 360;
    c = reading.marker[i] ? [230, 150 + 60 * t, 80] : [120 + 100 * t, 200, 230 - 80 * t];
  }
  if (reading.extra[i] === 1) c = [220, 40, 40];
  if (reading.extra[i] === 2) c = [40, 80, 230];
  view.set(i % photo.w, Math.floor(i / photo.w), [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255]);
}
const base = join(ROOT, 'art/drafts', `${code}-convert`);
writeFileSync(`${base}-reading.png`, encodePng(view));

const files: string[] = [];
for (const [n, fit] of fits(reading, W, H, settings.shapeMismatch).entries()) {
  const letter = 'ab'[n]!;
  const grid = partMap(reading, W, H, fit, settings);
  const ramps: string[] = [];
  const rows = shadeB2(grid, settings, rampOf, ramps);
  // Stand it on the middle of its feet: the filled pixels on the lowest drawn row.
  const bottom = Math.max(...rows.map((r, y) => (/[^.]/.test(r) ? y : -1)));
  const xs = [...rows[bottom]!].map((ch, x) => (ch === '.' ? -1 : x)).filter((x) => x >= 0);
  const anchor = [Math.round((Math.min(...xs) + Math.max(...xs)) / 2), Math.min(H - 1, bottom + 1)];
  // Every frame the game expects gets this one drawing for now (more frames come from more drawings).
  const frames = entry.frames.flatMap((f) => [`frame: ${f}`, ...rows]);
  const text = [
    `# Converter draft (${fit.mode === 'keep' ? "keeps the drawing's proportions" : 'stretched to fill the box'}) from ${photoPath.replace(`${ROOT}/`, '')}. Needs a hand finish.`,
    `code: ${code}`,
    `id: ${id}`,
    'status: draft',
    `size: ${W}x${H}`,
    `anchor: ${anchor[0]} ${anchor[1]}`,
    'outline: ink',
    ...b2Key(ramps),
    ...frames,
  ].join('\n');
  const path = `${base}-${letter}.sprite`;
  writeFileSync(path, text + '\n');
  writeFileSync(`${base}-${letter}.parts.txt`, partText(grid));
  files.push(path);
}
for (const note of reading.notes) console.log(`- ${note}`);
console.log(`Wrote ${files.map((f) => f.replace(`${ROOT}/`, '')).join(', ')} (${size}), part maps, and ${`${base}-reading.png`.replace(`${ROOT}/`, '')}`);
if (existsSync(join(ROOT, 'tools/art-preview.ts'))) execFileSync('node', [join(ROOT, 'tools/art-preview.ts'), ...files], { stdio: 'inherit' });
