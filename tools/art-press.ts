/**
 * Put the owner's approved sprite files (art/src/*.sprite) into the game without
 * redrawing the placeholders. Run with: npm run art:press
 * (`npm run art` does this too, after making the placeholders.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manifest, SpriteEntry } from '../src/render/manifest.ts';
import { loadArt, pressApproved } from './art/press.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const path = join(ROOT, 'assets/manifest.json');
const manifest = JSON.parse(readFileSync(path, 'utf8')) as Manifest;
const sprites: Record<string, SpriteEntry> = { ...manifest.sprites };
const result = pressApproved(sprites, loadArt(ROOT), true);
if (result.errors.length) {
  console.error(result.errors.join('\n'));
  process.exit(1);
}
writeFileSync(path, JSON.stringify({ ...manifest, sprites }, null, 2) + '\n');
console.log(result.pressed.length ? `Pressed ${result.pressed.length} sprites: ${result.pressed.join(', ')}` : 'No approved sprite files in art/src yet.');
