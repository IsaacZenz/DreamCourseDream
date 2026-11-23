/**
 * Art pipeline (docs/plans/art-pipeline.md): the sprite file format, the press,
 * the permanent codes and the style check on every approved sprite in the game.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Manifest, SpriteEntry } from '../src/render/manifest.ts';
import { madeFrom } from '../tools/art/groups.ts';
import { codeProblem, listSources, loadArt, outputsOf, pressApproved, readCodes } from '../tools/art/press.ts';
import { allowedColours, parseSprite, renderFrame, SpriteError, withOutline, type SpriteSource } from '../tools/art/sprite.ts';
import { decodePng, encodePng, Image } from '../tools/png.ts';

const ROOT = process.cwd();
const art = loadArt(ROOT);
const manifest = JSON.parse(readFileSync(join(ROOT, 'assets/manifest.json'), 'utf8')) as Manifest;

const SAMPLE = `# a test sprite
code: G13
id: gear-pin-needle
status: draft
size: 4x3
anchor: 1 2
mirror: -left a>b
variant: gear-pin-needle-blue red>blue
key r red 3
key * gold 4 glow
key w blue 3 alpha 150
frame: a1
.r..
.r*.
.ww.
`;

describe('palette', () => {
  it('has ten ramps of five shades, as STYLE.md says', () => {
    expect(Object.keys(art.ramps)).toHaveLength(10);
    for (const r of Object.values(art.ramps)) expect(r).toHaveLength(5);
  });
  it('every theme replaces ramps with five shades each, using palette ramp names', () => {
    for (const t of Object.values(art.themes))
      for (const [k, r] of Object.entries(t)) {
        expect(art.ramps[k]).toBeDefined();
        expect(r).toHaveLength(5);
      }
  });
  it('ramps go from dark to light', () => {
    const lum = (c: readonly number[]) => 0.3 * c[0]! + 0.59 * c[1]! + 0.11 * c[2]!;
    for (const r of Object.values(art.ramps)) for (let i = 1; i < 5; i++) expect(lum(r[i]!)).toBeGreaterThan(lum(r[i - 1]!));
  });
});

describe('sprite files', () => {
  it('parses the header, key and frames', () => {
    const s = parseSprite(SAMPLE, 't.sprite', art.ramps);
    expect([s.code, s.id, s.status, s.width, s.height]).toEqual(['G13', 'gear-pin-needle', 'draft', 4, 3]);
    expect(s.anchor).toEqual([1, 2]);
    expect(s.frames[0]!.grid[1]![2]).toEqual({ ramp: 'gold', shade: 4, alpha: 255, glow: true });
    expect(s.frames[0]!.grid[2]![1]!.alpha).toBe(150);
  });

  it('lists every mistake with its line number', () => {
    const bad = SAMPLE.replace('key r red 3', 'key r scarlet 3').replace('.r*.', '.r*..').replace('size: 4x3', 'size: 4x3\ncolour: red');
    try {
      parseSprite(bad, 'bad.sprite', art.ramps);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SpriteError);
      const msg = (e as Error).message;
      expect(msg).toMatch(/bad\.sprite:\d+: unknown ramp "scarlet"/);
      expect(msg).toMatch(/row is 5 wide; size says 4/);
      expect(msg).toMatch(/unknown setting "colour:"/);
      expect(msg).toMatch(/letter "r" is not in the key/);
    }
  });

  it('auto-outline rings the drawing with the darkest shade of its ramp', () => {
    const s = parseSprite(SAMPLE.replace(/frame: a1[\s\S]*/, 'frame: a1\n....\n.r..\n....\n'), 't', art.ramps);
    const g = withOutline(s.frames[0]!.grid);
    expect(g[0]![1]).toMatchObject({ ramp: 'red', shade: 0 });
    expect(g[1]![0]).toMatchObject({ ramp: 'red', shade: 0 });
    expect(g[0]![0]).toBeNull(); // corners stay clear
  });

  it('renders palette colours, flips, swaps ramps and applies themes', () => {
    const s = parseSprite(SAMPLE, 't', art.ramps);
    const f = s.frames[0]!;
    expect(renderFrame(s, f, art.ramps).get(1, 0)).toEqual(art.ramps.red![3]);
    expect(renderFrame(s, f, art.ramps, { flip: true }).get(2, 0)).toEqual(art.ramps.red![3]);
    expect(renderFrame(s, f, art.ramps, { swaps: { red: 'blue' } }).get(1, 0)).toEqual(art.ramps.blue![3]);
    expect(renderFrame(s, f, art.ramps, { replace: art.themes.night! }).get(1, 0)).toEqual(art.themes.night!.red![3]);
  });

  it('makes the flipped copy with renamed frames and a mirrored anchor, and each variant', () => {
    const s = parseSprite(SAMPLE, 't', art.ramps);
    const outs = outputsOf(s, art, null);
    expect(outs.map((o) => o.id)).toEqual(['gear-pin-needle', 'gear-pin-needle-left', 'gear-pin-needle-blue', 'gear-pin-needle-blue-left']);
    expect(outs[1]!.entry.frames).toEqual(['b1']);
    expect(outs[1]!.entry.anchor).toEqual([2, 2]);
  });

  it('every sprite file in art/ parses', () => {
    for (const folder of ['art/src', 'art/drafts', 'art/mockups']) expect(() => listSources(art, folder)).not.toThrow();
  });
});

describe('the press', () => {
  it('does nothing to the game while no sprite file is approved, and approved files replace placeholders', () => {
    const sprites: Record<string, SpriteEntry> = { ...manifest.sprites };
    const r = pressApproved(sprites, art, false);
    expect(r.errors).toEqual([]);
    const approved = listSources(art).filter((s) => s.status === 'approved');
    for (const s of approved) expect(sprites[s.id]!.frames).toEqual(s.frames.map((f) => f.name));
    if (approved.length === 0) expect(sprites).toEqual(manifest.sprites);
  });

  it('refuses a file whose code does not match the Art List', () => {
    const codes = readCodes(ROOT);
    const s = parseSprite(SAMPLE, 't', art.ramps);
    expect(codeProblem(s, codes)).toBeNull();
    expect(codeProblem({ ...s, code: 'S4' }, codes)).toMatch(/S4 is "dead-tree"/);
  });

  it('keeps theme versions only when the file asks for them', () => {
    const s = parseSprite(SAMPLE.replace('mirror: -left a>b\n', '').replace(/variant:.*\n/, ''), 't', art.ramps);
    expect(outputsOf(s, art, null)).toHaveLength(1);
    const themed = parseSprite(SAMPLE.replace('mirror: -left a>b\n', '').replace(/variant:.*\n/, 'themes: yes\n'), 't', art.ramps);
    expect(outputsOf(themed, art, null).map((o) => o.id).slice(1)).toEqual(Object.keys(art.themes).map((t) => `gear-pin-needle@${t}`));
  });
});

describe('PNG round trip', () => {
  it('reads back what it writes', () => {
    const img = new Image(3, 2);
    img.set(0, 0, [255, 0, 0, 255]);
    img.set(2, 1, [10, 20, 30, 128]);
    const back = decodePng(encodePng(img));
    expect([back.width, back.height]).toEqual([3, 2]);
    expect(Array.from(back.data)).toEqual(Array.from(img.data));
  });
  it('reads the placeholder art', () => {
    const e = manifest.sprites.snoozegrub!;
    const img = decodePng(readFileSync(join(ROOT, 'assets', e.file)));
    expect(img.width).toBe(e.frameWidth * e.frames.length);
  });
});

describe('permanent codes (owner, 2026-11-23)', () => {
  const codes = readCodes(ROOT);
  it('every sprite the game uses has exactly one code, except copies made automatically', () => {
    const ids = Object.keys(manifest.sprites).filter((id) => !id.includes('@'));
    const all = new Set(ids);
    const coded = new Map<string, string[]>();
    for (const [code, id] of Object.entries(codes)) coded.set(id, [...(coded.get(id) ?? []), code]);
    // Owner art can add its own variants (character recolours) that are not on the list.
    const variants = new Set(listSources(art).flatMap((s) => s.variants.map((v) => v.id)));
    for (const id of ids) if (!madeFrom(id, all) && !variants.has(id)) expect(coded.get(id), `${id} has no code: run npm run art:list`).toHaveLength(1);
  });
  it('codes are a group letter and a number', () => {
    for (const code of Object.keys(codes)) expect(code).toMatch(/^[THEBOSGIP][1-9][0-9]*$/);
  });
});

describe('style check on approved art in the game (STYLE.md)', () => {
  const approved = listSources(art).filter((s) => s.status === 'approved');
  const palette = allowedColours(art.ramps);
  const cases: Array<[string, SpriteSource | null]> = approved.length ? approved.flatMap((s) => outputsOf(s, art, null).map((o): [string, SpriteSource] => [o.id, s])) : [['(no approved art yet)', null]];
  it.each(cases)('%s', (id, src) => {
    if (!src) return;
    const e = manifest.sprites[id]!;
    expect(e, `${id} is missing from the manifest: run npm run art:press`).toBeDefined();
    expect([e.frameWidth, e.frameHeight]).toEqual([src.width, src.height]);
    const path = join(ROOT, 'assets', e.file);
    expect(existsSync(path)).toBe(true);
    const img = decodePng(readFileSync(path));
    const theme = id.split('@')[1];
    const ok = theme ? allowedColours(art.ramps, art.themes[theme]!) : palette;
    const seeThrough = src.frames.some((f) => f.grid.some((r) => r.some((p) => p && p.alpha < 255)));
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) {
        const [r, g, b, a] = img.get(x, y);
        if (a === 0) continue;
        expect(ok.has(`${r},${g},${b}`), `${id} pixel ${x},${y} is not a palette colour`).toBe(true);
        if (!seeThrough) expect(a, `${id} pixel ${x},${y} is half see-through`).toBe(255);
      }
  });
});

it('art folders exist for the owner to use', () => {
  for (const d of ['art/src', 'art/drafts', 'art/inbox', 'art/list']) expect(readdirSync(join(ROOT, d))).toBeDefined();
});
