/**
 * Sprite source files (art pipeline, docs/plans/art-pipeline.md section 4.2).
 *
 * A `.sprite` file is plain text: a few header lines, a key that says what each
 * letter means, then one grid of letters per frame. Example:
 *
 *   code: G14
 *   id: gear-pin-needle
 *   status: draft            draft = preview only; approved = goes into the game
 *   size: 12x12
 *   anchor: 6 11             optional; defaults to the placeholder's anchor
 *   outline: auto            optional; adds the outline around the drawing
 *   mirror: -left dr>dl      optional; also makes "<id>-left", renaming frames
 *   variant: armadillo-thud purple>grey tan>brown   optional; a ramp-swapped copy
 *   themes: yes              optional; a ramp-swapped copy for every theme
 *   frames-change: yes       optional; allows frame names unlike the placeholder's
 *   key a red 3              letter a is shade 3 of the red ramp
 *   key * gold 4 glow        glows (Milestone 9 lighting)
 *   key w blue 3 alpha 150   see-through; only water and glow should use this
 *   frame: idle
 *   ..aaaa..
 *   ...
 *
 * '.' is always see-through. Lines starting with '#' are notes.
 */
import { readFileSync } from 'node:fs';
import { Image, type RGBA } from '../png.ts';

export interface PaletteFile {
  readonly ramps: Readonly<Record<string, readonly string[]>>;
}

/** Ramp name to its five colours, darkest first, rounded to 15-bit colour. */
export type Ramps = Readonly<Record<string, readonly RGBA[]>>;

export interface Pixel {
  readonly ramp: string;
  readonly shade: number;
  readonly alpha: number;
  readonly glow: boolean;
}

export interface Frame {
  readonly name: string;
  readonly grid: ReadonlyArray<ReadonlyArray<Pixel | null>>;
}

export interface SpriteSource {
  readonly path: string;
  readonly code: string;
  readonly id: string;
  readonly status: 'draft' | 'approved';
  readonly width: number;
  readonly height: number;
  readonly anchor: readonly [number, number] | null;
  readonly outline: boolean;
  readonly mirror: { readonly suffix: string; readonly renames: ReadonlyArray<readonly [string, string]> } | null;
  readonly variants: ReadonlyArray<{ readonly id: string; readonly swaps: Readonly<Record<string, string>> }>;
  readonly themes: boolean;
  readonly framesChange: boolean;
  readonly frames: readonly Frame[];
}

/** Round to 15-bit colour (5 bits per channel), as the placeholders do. */
export function to15(hex: string, alpha = 255): RGBA {
  const n = parseInt(hex.replace('#', ''), 16);
  const q = (v: number) => {
    const five = Math.round(v / 8.226);
    return (five << 3) | (five >> 2);
  };
  return [q((n >> 16) & 255), q((n >> 8) & 255), q(n & 255), alpha];
}

export function loadRamps(file: PaletteFile): Ramps {
  return Object.fromEntries(Object.entries(file.ramps).map(([k, v]) => [k, v.map((h) => to15(h))]));
}

export function readPalette(path: string): Ramps {
  return loadRamps(JSON.parse(readFileSync(path, 'utf8')) as PaletteFile);
}

export class SpriteError extends Error {}

/** Parse a sprite file. Throws a SpriteError listing every problem with its line number. */
export function parseSprite(text: string, path: string, ramps: Ramps): SpriteSource {
  const errors: string[] = [];
  const fail = (line: number, msg: string) => errors.push(`${path}:${line}: ${msg}`);
  const head: Record<string, { v: string; line: number }> = {};
  const key = new Map<string, Pixel | null>([['.', null]]);
  const variants: Array<{ id: string; swaps: Record<string, string> }> = [];
  const frames: Array<{ name: string; line: number; rows: string[] }> = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trimEnd();
    if (line.trim() === '' || line.trimStart().startsWith('#')) return;
    const cur = frames[frames.length - 1];
    const m = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      if (m[1] === 'frame') frames.push({ name: m[2].trim(), line: n, rows: [] });
      else if (m[1] === 'variant') {
        const [id, ...pairs] = m[2].trim().split(/\s+/);
        const swaps: Record<string, string> = {};
        for (const p of pairs) {
          const [a, b] = p.split('>');
          if (!a || !b || !ramps[a] || !ramps[b]) fail(n, `variant swap "${p}" must be ramp>ramp using palette ramps`);
          else swaps[a] = b;
        }
        if (!id) fail(n, 'variant needs a sprite id');
        else variants.push({ id, swaps });
      } else head[m[1]] = { v: m[2].trim(), line: n };
      return;
    }
    const k = /^key\s+(\S)\s+(.*)$/.exec(line);
    if (k && k[1] !== undefined && k[2] !== undefined) {
      const ch = k[1];
      const words = k[2].trim().split(/\s+/);
      if (words[0] === 'clear') {
        key.set(ch, null);
        return;
      }
      const [ramp, shadeText, ...rest] = words;
      const shade = Number(shadeText);
      if (!ramp || !ramps[ramp]) return fail(n, `unknown ramp "${ramp ?? ''}" (palette has: ${Object.keys(ramps).join(', ')})`);
      if (!Number.isInteger(shade) || shade < 0 || shade > 4) return fail(n, 'shade must be 0 (darkest) to 4 (lightest)');
      let alpha = 255;
      let glow = false;
      for (let j = 0; j < rest.length; j++) {
        if (rest[j] === 'glow') glow = true;
        else if (rest[j] === 'alpha') alpha = Number(rest[++j]);
        else fail(n, `unknown word "${rest[j] ?? ''}" in key`);
      }
      if (!Number.isInteger(alpha) || alpha < 1 || alpha > 255) fail(n, 'alpha must be 1 to 255');
      if (ch === '#') fail(n, '"#" cannot be a key letter (it starts a note)');
      key.set(ch, { ramp, shade, alpha, glow });
      return;
    }
    if (cur) cur.rows.push(line);
    else fail(n, `not understood: "${line}"`);
  });

  const need = (name: string): { v: string; line: number } => {
    const h = head[name];
    if (!h) {
      fail(0, `missing "${name}:" line`);
      return { v: '', line: 0 };
    }
    return h;
  };
  const code = need('code');
  if (code.v && !/^[A-Z][0-9]+$/.test(code.v)) fail(code.line, 'code is one capital letter then a number, like G14');
  const id = need('id').v;
  const status = need('status');
  if (status.v && status.v !== 'draft' && status.v !== 'approved') fail(status.line, 'status is draft or approved');
  const size = need('size');
  const sm = /^(\d+)x(\d+)$/.exec(size.v);
  if (size.v && !sm) fail(size.line, 'size is WIDTHxHEIGHT, like 12x12');
  const width = Number(sm?.[1] ?? 0);
  const height = Number(sm?.[2] ?? 0);

  let anchor: [number, number] | null = null;
  if (head.anchor) {
    const a = head.anchor.v.split(/\s+/).map(Number);
    if (a.length !== 2 || a.some((v) => !Number.isInteger(v))) fail(head.anchor.line, 'anchor is two whole numbers: x y');
    else anchor = [a[0]!, a[1]!];
  }
  const yes = (name: string) => {
    const h = head[name];
    if (!h) return false;
    if (h.v !== 'yes' && h.v !== 'no' && !(name === 'outline' && (h.v === 'auto' || h.v === 'none'))) fail(h.line, `${name} is yes or no`);
    return h.v === 'yes' || h.v === 'auto';
  };
  let mirror: SpriteSource['mirror'] = null;
  if (head.mirror) {
    const [suffix, ...pairs] = head.mirror.v.split(/\s+/);
    const renames: Array<[string, string]> = [];
    for (const p of pairs) {
      const [a, b] = p.split('>');
      if (!a || b === undefined) fail(head.mirror.line, `mirror rename "${p}" must be from>to`);
      else renames.push([a, b]);
    }
    if (!suffix || !suffix.startsWith('-')) fail(head.mirror.line, 'mirror starts with the suffix of the flipped copy, like -left');
    else mirror = { suffix, renames };
  }
  const known = new Set(['code', 'id', 'status', 'size', 'anchor', 'outline', 'mirror', 'themes', 'frames-change']);
  for (const [k, h] of Object.entries(head)) if (!known.has(k)) fail(h.line, `unknown setting "${k}:"`);

  if (frames.length === 0) fail(0, 'no "frame:" found');
  const parsed: Frame[] = frames.map((f) => {
    if (f.rows.length !== height) fail(f.line, `frame "${f.name}" has ${f.rows.length} rows; size says ${height}`);
    const grid = f.rows.map((r, y) => {
      if ([...r].length !== width) fail(f.line + 1 + y, `row is ${[...r].length} wide; size says ${width}`);
      return [...r].map((ch) => {
        if (!key.has(ch)) {
          fail(f.line + 1 + y, `letter "${ch}" is not in the key`);
          return null;
        }
        return key.get(ch) ?? null;
      });
    });
    return { name: f.name, grid };
  });
  const names = new Set<string>();
  for (const f of frames) {
    if (names.has(f.name)) fail(f.line, `frame name "${f.name}" used twice`);
    names.add(f.name);
  }
  if (anchor && (anchor[0] < 0 || anchor[1] < 0 || anchor[0] >= width || anchor[1] >= height)) fail(head.anchor?.line ?? 0, 'anchor is outside the sprite');

  if (errors.length) throw new SpriteError(errors.join('\n'));
  return {
    path,
    code: code.v,
    id,
    status: status.v as 'draft' | 'approved',
    width,
    height,
    anchor,
    outline: yes('outline'),
    mirror,
    variants,
    themes: yes('themes'),
    framesChange: yes('frames-change'),
    frames: parsed,
  };
}

export function readSprite(path: string, ramps: Ramps): SpriteSource {
  return parseSprite(readFileSync(path, 'utf8'), path, ramps);
}

/**
 * Auto-outline (STYLE.md): every see-through pixel touching the drawing (up,
 * down, left, right) becomes shade 0 of the ramp it touches.
 */
export function withOutline(grid: Frame['grid']): Array<Array<Pixel | null>> {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  return grid.map((row, y) =>
    row.map((p, x) => {
      if (p) return p;
      for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = grid[ny]![nx];
        if (q && q.shade > 0) return { ramp: q.ramp, shade: 0, alpha: 255, glow: false };
      }
      return null;
    }),
  );
}

export interface RenderOptions {
  /** Ramp swaps (character recolours): ramp name to ramp name. */
  readonly swaps?: Readonly<Record<string, string>>;
  /** Replacement ramps (themes): ramp name to five colours. */
  readonly replace?: Ramps;
  readonly flip?: boolean;
}

export function renderFrame(src: SpriteSource, frame: Frame, ramps: Ramps, opt: RenderOptions = {}): Image {
  const grid = src.outline ? withOutline(frame.grid) : frame.grid;
  const img = new Image(src.width, src.height);
  grid.forEach((row, y) =>
    row.forEach((p, x) => {
      if (!p) return;
      const name = opt.swaps?.[p.ramp] ?? p.ramp;
      const c = (opt.replace?.[name] ?? ramps[name])![p.shade]!;
      img.set(opt.flip ? src.width - 1 - x : x, y, [c[0], c[1], c[2], p.alpha]);
    }),
  );
  return img;
}

/** All frames side by side, left to right, as the manifest expects. */
export function renderSheet(src: SpriteSource, ramps: Ramps, opt: RenderOptions = {}): Image {
  const out = new Image(src.width * src.frames.length, src.height);
  src.frames.forEach((f, i) => out.blit(renderFrame(src, f, ramps, opt), i * src.width, 0));
  return out;
}

/** Every colour a sprite may use: the palette plus any theme ramps. */
export function allowedColours(...sets: Ramps[]): Set<string> {
  const s = new Set<string>();
  for (const r of sets) for (const ramp of Object.values(r)) for (const c of ramp) s.add(`${c[0]},${c[1]},${c[2]}`);
  return s;
}
