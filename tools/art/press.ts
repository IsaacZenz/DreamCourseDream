/**
 * The Pixel Press (docs/plans/art-pipeline.md section 4.3).
 *
 * Turns every approved sprite file in art/src/ into game images and manifest
 * entries, under the same sprite ids the placeholders use, so the game needs no
 * code changes (CLAUDE.md rule 5). Also makes the flipped copy, the character
 * recolours and the theme versions a sprite file asks for.
 *
 * `npm run art` calls this last, so a placeholder can never overwrite the
 * owner's approved art. `npm run art:press` runs it on its own.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SpriteEntry } from '../../src/render/manifest.ts';
import { encodePng, type Image } from '../png.ts';
import { loadRamps, readPalette, readSprite, renderSheet, type PaletteFile, type Ramps, type RenderOptions, type SpriteSource } from './sprite.ts';

/** Permanent codes from art/codes.json (code to sprite id). */
export function readCodes(root: string): Readonly<Record<string, string>> {
  const path = join(root, 'art/codes.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { codes: Record<string, string> }).codes : {};
}

/** A sprite file's code must be the one the Art List gives its sprite. */
export function codeProblem(src: SpriteSource, codes: Readonly<Record<string, string>>): string | null {
  const owner = codes[src.code];
  if (owner === src.id) return null;
  const right = Object.entries(codes).find(([, id]) => id === src.id)?.[0];
  if (owner) return `${src.path}: code ${src.code} is "${owner}" on the Art List, not "${src.id}"${right ? ` (${src.id} is ${right})` : ''}`;
  return `${src.path}: code ${src.code} is not on the Art List${right ? ` (${src.id} is ${right})` : '; run npm run art:list after adding a new sprite'}`;
}

export interface ArtFiles {
  readonly root: string;
  readonly ramps: Ramps;
  readonly themes: Readonly<Record<string, Ramps>>;
}

export function loadArt(root: string): ArtFiles {
  const ramps = readPalette(join(root, 'art/palette.json'));
  const raw = JSON.parse(readFileSync(join(root, 'art/themes.json'), 'utf8')) as { themes: Record<string, PaletteFile> };
  const themes = Object.fromEntries(Object.entries(raw.themes).map(([k, v]) => [k, loadRamps(v)]));
  return { root, ramps, themes };
}

/** Every sprite file in a folder (art/src by default), sorted by name. */
export function listSources(art: ArtFiles, folder = 'art/src'): SpriteSource[] {
  const dir = join(art.root, folder);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sprite'))
    .sort()
    .map((f) => readSprite(join(dir, f), art.ramps));
}

/** One output of a sprite file: the sprite itself, its flipped copy, a recolour or a theme version. */
export interface Output {
  readonly id: string;
  readonly img: Image;
  readonly entry: SpriteEntry;
  readonly label: string;
}

export function outputsOf(src: SpriteSource, art: ArtFiles, placeholderAnchor: readonly [number, number] | null): Output[] {
  const anchor = src.anchor ?? placeholderAnchor ?? [Math.floor(src.width / 2), src.height - 1];
  const frames = src.frames.map((f) => f.name);
  const out: Output[] = [];
  const add = (id: string, label: string, opt: RenderOptions) => {
    const flip = opt.flip === true;
    out.push({
      id,
      label,
      img: renderSheet(src, art.ramps, opt),
      entry: {
        file: `sprites/${id}.png`,
        frameWidth: src.width,
        frameHeight: src.height,
        frames: flip && src.mirror ? frames.map((n) => src.mirror!.renames.reduce((s, [a, b]) => s.replace(a, b), n)) : frames,
        anchor: flip ? [src.width - 1 - anchor[0], anchor[1]] : [anchor[0], anchor[1]],
      },
    });
  };
  const looks: Array<{ id: string; label: string; swaps?: Readonly<Record<string, string>> }> = [{ id: src.id, label: src.code }, ...src.variants.map((v) => ({ id: v.id, label: `${src.code} as ${v.id}`, swaps: v.swaps }))];
  for (const look of looks) {
    const base: RenderOptions = look.swaps ? { swaps: look.swaps } : {};
    add(look.id, look.label, base);
    if (src.mirror) add(look.id + src.mirror.suffix, `${look.label} flipped`, { ...base, flip: true });
    if (src.themes) {
      for (const [theme, replace] of Object.entries(art.themes)) {
        add(`${look.id}@${theme}`, `${look.label} ${theme}`, { ...base, replace });
        if (src.mirror) add(`${look.id}${src.mirror.suffix}@${theme}`, `${look.label} flipped ${theme}`, { ...base, replace, flip: true });
      }
    }
  }
  return out;
}

export interface PressResult {
  readonly pressed: string[];
  readonly errors: string[];
}

/**
 * Put every approved sprite file into `sprites` (the manifest's sprite table)
 * and, when `write` is true, write the images to assets/sprites/.
 */
export function pressApproved(sprites: Record<string, SpriteEntry>, art: ArtFiles, write: boolean): PressResult {
  const pressed: string[] = [];
  const errors: string[] = [];
  let sources: SpriteSource[];
  try {
    sources = listSources(art);
  } catch (e) {
    return { pressed, errors: [(e as Error).message] };
  }
  const codes = readCodes(art.root);
  const seenCodes = new Map<string, string>();
  for (const src of sources) {
    const problem = codeProblem(src, codes);
    if (problem) errors.push(problem);
    const other = seenCodes.get(src.code);
    if (other) errors.push(`${src.path}: code ${src.code} is also used by ${other}`);
    seenCodes.set(src.code, src.path);
  }
  for (const src of sources.filter((s) => s.status === 'approved')) {
    const old = sprites[src.id];
    if (!old) {
      errors.push(`${src.path}: the game has no sprite called "${src.id}"`);
      continue;
    }
    const names = src.frames.map((f) => f.name);
    if (!src.framesChange && names.join(',') !== old.frames.join(',')) {
      errors.push(`${src.path}: frames are [${names.join(', ')}] but the game expects [${old.frames.join(', ')}]. Rename them, or add "frames-change: yes" if the game code is being changed to match.`);
      continue;
    }
    const sameSize = old.frameWidth === src.width && old.frameHeight === src.height;
    const outs = outputsOf(src, art, sameSize ? old.anchor : null);
    if (!src.anchor && !sameSize) {
      errors.push(`${src.path}: the size changed from ${old.frameWidth}x${old.frameHeight}, so it needs an "anchor:" line (the pixel that stands on the ground)`);
      continue;
    }
    // Old theme versions of these sprites would be placeholder recolours: remove them.
    const ids = new Set(outs.map((o) => o.id));
    for (const id of Object.keys(sprites)) {
      const base = id.split('@')[0]!;
      if (id.includes('@') && ids.has(base) && !ids.has(id)) {
        if (write) rmSync(join(art.root, 'assets', sprites[id]!.file), { force: true });
        delete sprites[id];
      }
    }
    for (const o of outs) {
      sprites[o.id] = o.entry;
      if (write) {
        mkdirSync(join(art.root, 'assets/sprites'), { recursive: true });
        writeFileSync(join(art.root, 'assets', o.entry.file), encodePng(o.img));
      }
      pressed.push(o.id);
    }
  }
  return { pressed, errors };
}
