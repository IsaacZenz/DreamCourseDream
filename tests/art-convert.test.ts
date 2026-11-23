/**
 * The converter (docs/plans/art-converter.md): photo of a drawing to a B2 draft.
 * Tested with small made-up drawings, so no photos are needed.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import jpeg from 'jpeg-js';
import { describe, expect, it } from 'vitest';
import { b2Key, fits, partMap, partText, photoFromRgba, readDrawing, shadeB2, type ConvertSettings } from '../tools/art/convert.ts';
import { loadArt } from '../tools/art/press.ts';
import { parseSprite } from '../tools/art/sprite.ts';

const settings = JSON.parse(readFileSync(join(process.cwd(), 'art/convert.json'), 'utf8')) as ConvertSettings;
const art = loadArt(process.cwd());

/** A 200×200 "photo": paper, a thick square outline split by a line, the top half marker-coloured, an eye dot, and a written code off to the side. */
function drawing(opts: { gap?: boolean; label?: boolean } = {}): Uint8Array {
  const w = 200;
  const px = new Uint8Array(w * w * 4);
  const set = (x: number, y: number, c: readonly number[]) => px.set([c[0]!, c[1]!, c[2]!, 255], (y * w + x) * 4);
  const rect = (x0: number, y0: number, x1: number, y1: number, c: readonly number[]) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(x, y, c);
  };
  rect(0, 0, w, w, [200, 198, 190]); // paper
  rect(44, 44, 156, 97, [80, 130, 120]); // marker in the top half
  const ink = [20, 20, 24];
  rect(40, 40, 160, 44, ink);
  rect(40, 156, 160, 160, ink);
  rect(40, 40, 44, 160, ink);
  rect(156, 40, 160, 160, ink);
  rect(44, 97, 156, 103, ink); // the line across the middle (as thick, for the drawing size, as a real pen line)
  if (opts.gap) rect(90, 156, 100, 160, [200, 198, 190]); // a gap in the bottom line
  rect(66, 124, 76, 134, ink); // an eye
  if (opts.label) {
    rect(172, 172, 180, 186, ink); // a written code: two letters side by side
    rect(184, 172, 192, 186, ink);
  }
  return px;
}

const read = (opts: { gap?: boolean; label?: boolean } = {}) => readDrawing(photoFromRgba(drawing(opts), 200, 200, 200), settings);

describe('reading a drawing', () => {
  it('finds the two parts, which one is marker-coloured, and the eye as a mark', () => {
    const r = read();
    expect(r.regions).toHaveLength(2);
    expect(r.regions.filter((g) => g.coloured > 0.5)).toHaveLength(1);
    expect([...r.extra].some((v) => v === 1)).toBe(true);
  });

  it('a small gap in the outline does not let the outside leak in', () => {
    const r = read({ gap: true });
    expect(r.regions).toHaveLength(2);
    expect(r.label[130 * 200 + 120]).toBeGreaterThanOrEqual(0);
  });

  it('leaves out the written code, and says so', () => {
    const r = read({ label: true });
    expect(r.notes.some((n) => n.includes('left out'))).toBe(true);
    expect(r.extra[178 * 200 + 176]).toBe(0);
  });

  it('reads photos from JPEG', () => {
    const enc = jpeg.encode({ data: drawing(), width: 200, height: 200 }, 95);
    const img = jpeg.decode(enc.data, { useTArray: true, formatAsRGBA: true });
    expect(readDrawing(photoFromRgba(img.data, img.width, img.height, 200), settings).regions).toHaveLength(2);
  });
});

describe('fitting and the part map', () => {
  it('keeps the proportions, and offers a stretched version when the shapes differ', () => {
    const r = read();
    expect(fits(r, 12, 12, settings.shapeMismatch).map((f) => f.mode)).toEqual(['keep']);
    expect(fits(r, 18, 24, settings.shapeMismatch).map((f) => f.mode)).toEqual(['keep', 'fill']);
  });

  it('leaves a free pixel round the edge for the outline, and marks the coloured half', () => {
    const r = read();
    const grid = partMap(r, 12, 12, fits(r, 12, 12, settings.shapeMismatch)[0]!, settings);
    for (let i = 0; i < 12; i++) {
      expect(grid[0]![i]!.part).toBeNull();
      expect(grid[11]![i]!.part).toBeNull();
      expect(grid[i]![0]!.part).toBeNull();
      expect(grid[i]![11]!.part).toBeNull();
    }
    expect(grid[3]![6]!.part?.endsWith('c')).toBe(true);
    expect(grid[8]![6]!.part?.endsWith('p')).toBe(true);
    expect(grid.flat().some((c) => c.mark)).toBe(true);
    expect(partText(grid)).toMatch(/marker-coloured/);
  });
});

describe('shading in B2', () => {
  it('draws the line across as ink, the eye as a mark, and makes a valid sprite file', () => {
    const r = read();
    const grid = partMap(r, 12, 12, fits(r, 12, 12, settings.shapeMismatch)[0]!, settings);
    const ramps: string[] = [];
    const rows = shadeB2(grid, settings, (p) => (p.endsWith('c') ? 'purple' : 'tan'), ramps);
    expect(rows.join('')).toMatch(/i/);
    expect(rows.join('')).toMatch(/e/);
    expect(ramps).toEqual(['purple', 'tan']);
    const text = ['code: G13', 'id: gear-pin-needle', 'status: draft', 'size: 12x12', 'outline: ink', ...b2Key(ramps), 'frame: idle', ...rows].join('\n');
    expect(() => parseSprite(text, 'test', art.ramps)).not.toThrow();
  });

  it('a part given its own colour (--paint) gets its own letters', () => {
    const r = read();
    const grid = partMap(r, 12, 12, fits(r, 12, 12, settings.shapeMismatch)[0]!, settings);
    const ramps: string[] = [];
    shadeB2(grid, settings, (p) => (p.endsWith('c') ? 'green' : p.startsWith('1') ? 'grey' : 'tan'), ramps);
    expect(new Set(ramps).size).toBe(ramps.length);
    expect(b2Key(ramps).filter((k) => /^key [2-4a-cf-h] /.test(k))).toHaveLength(ramps.length * 3);
  });
});
