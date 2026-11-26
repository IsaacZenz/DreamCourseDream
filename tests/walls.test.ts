/**
 * Organic wall textures (owner, 2026-11-26): the geometry stays the same, the
 * pick is stable and weighted, rocks run across bands with no seams, and the
 * overhang stays at the top.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EARTH_ROCK_SHARES, WALL_STYLES, rockKind } from '../src/content/walls';
import { THEMES } from '../src/content/biomes';
import { parseCourse } from '../src/sim/course';
import { FACE_FRAMES, FACE_H, FACE_W, faceMask, type FaceSide } from '../src/render/faceShapes';
import { buildDrawList } from '../src/render/iso';
import type { Manifest } from '../src/render/manifest';
import { bandKey, composeBand, edgeRandom, edgeTopRows, overhangReach, pickWallLook, seedNumber, type Pixels, type WallLook } from '../src/render/walls';
import { decodePng } from '../tools/png';
import wallsCourse from '../src/content/courses/walls.json';

const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as Manifest;
const SIDES: readonly FaceSide[] = ['left', 'right'];

/** A test texture: every pixel tells its own column and row (red = x, green = row), fully opaque. */
function coordTexture(h: number, alpha = 255): Pixels {
  const data = new Uint8Array(16 * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < 16; x++) data.set([x, y, 7, alpha], (y * 16 + x) * 4);
  return { width: 16, height: h, data };
}
const clear = (h: number): Pixels => ({ width: 16, height: h, data: new Uint8Array(16 * h * 4) });

const look = (over: Partial<WallLook> = {}): WallLook => ({ soil: 's', rocks: null, detail: null, overhang: null, soilShift: 0, rockShift: 0, detailShift: 0, ...over });

describe('face masks', () => {
  it('are exactly the pixels the existing face sprites fill, for both sides and every frame', () => {
    for (const side of SIDES) {
      // A generated placeholder face sheet (sand), so the test does not depend on drawn art.
      const img = decodePng(readFileSync(`assets/sprites/face-sand-${side}.png`));
      FACE_FRAMES.forEach((f, i) => {
        const m = faceMask(side, f);
        for (let y = 0; y < FACE_H; y++) for (let x = 0; x < FACE_W; x++) expect(m[y * FACE_W + x], `${side} ${f} (${x},${y})`).toBe(img.get(i * 16 + x, y)[3] > 0 ? 1 : 0);
      });
    }
  });
});

describe('draw list', () => {
  const parsed = parseCourse(wallsCourse);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const faces = buildDrawList(parsed.course).filter((p) => p.kind === 'face');

  it('gives every face band its edge info, with the top band at depth 0 and 4 rows per step below it', () => {
    expect(faces.length).toBeGreaterThan(100);
    const edges = new Map<string, typeof faces>();
    for (const f of faces) {
      expect(f.wall).toBeDefined();
      const k = `${f.tile.x},${f.tile.y},${f.wall!.side}`;
      edges.set(k, [...(edges.get(k) ?? []), f]);
    }
    for (const bands of edges.values()) {
      const top = bands[bands.length - 1]!;
      expect(top.wall!.depth).toBe(0);
      expect(top.frame).toBe(top.wall!.topFrame);
      for (const b of bands) {
        expect(b.wall!.depth % 4).toBe(0);
        // The band's anchor sits exactly `depth` rows below the top band's anchor.
        expect(b.y - top.y).toBe(b.wall!.depth);
        expect(b.x).toBe(top.x);
      }
    }
  });

  it('has tall walls (8+ bands), sloping tops (caps) and both sides on the wall test course', () => {
    expect(Math.max(...faces.map((f) => f.wall!.depth))).toBeGreaterThanOrEqual(8 * 4);
    expect(faces.some((f) => f.frame.startsWith('cap'))).toBe(true);
    expect(new Set(faces.map((f) => f.wall!.side))).toEqual(new Set(['left', 'right']));
  });
});

describe('picking a look', () => {
  const style = WALL_STYLES['face-earth']!;

  it('is the same every time for the same seed, tile and side', () => {
    const s = seedNumber('ABC123');
    expect(pickWallLook(style, s, 4, 9, 'left')).toEqual(pickWallLook(style, s, 4, 9, 'left'));
    expect(edgeRandom(s, 4, 9, 'left', 2)).toBe(edgeRandom(s, 4, 9, 'left', 2));
  });

  it('changes with the seed, the tile and the side', () => {
    const differs = (f: (i: number) => WallLook) => new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(f(i)))).size > 30;
    expect(differs((i) => pickWallLook(style, seedNumber(`S${i}`), 3, 3, 'left'))).toBe(true);
    expect(differs((i) => pickWallLook(style, 1, i, 3, 'left'))).toBe(true);
    expect(differs((i) => pickWallLook(style, 1, 3, i, 'right'))).toBe(true);
  });

  it('uses the owner\'s rock shares: plain 25%, sparse 40%, moderate 25%, large 10%', () => {
    const counts = { plain: 0, sparse: 0, moderate: 0, large: 0 };
    let n = 0;
    for (let y = 0; y < 100; y++) {
      for (let x = 0; x < 100; x++) {
        for (const side of SIDES) {
          counts[rockKind(pickWallLook(style, seedNumber('share test'), x, y, side).rocks)]++;
          n++;
        }
      }
    }
    for (const k of Object.keys(counts) as (keyof typeof counts)[]) expect(Math.abs(counts[k] / n - EARTH_ROCK_SHARES[k] / 100), k).toBeLessThan(0.015);
  });
});

describe('painting bands', () => {
  const H = 48;

  it('only paints inside the band mask', () => {
    for (const side of SIDES) {
      for (const f of FACE_FRAMES) {
        const out = composeBand({ side, frame: f, depth: 0, topFrame: f }, look(), { soil: coordTexture(H), rocks: null, detail: null, overhang: null });
        const m = faceMask(side, f);
        for (let i = 0; i < FACE_W * FACE_H; i++) expect(out[i * 4 + 3]! > 0 ? 1 : 0).toBe(m[i]);
      }
    }
  });

  it('runs the texture on down the wall with no seam between bands (no repeat every 4 pixels)', () => {
    for (const side of SIDES) {
      for (const shift of [0, 5, 47]) {
        const tex = coordTexture(H);
        // A wall 10 steps tall: bands at depth 0, 4, 8, ... 36.
        for (let d = 0; d < 10; d++) {
          const out = composeBand({ side, frame: 'full', depth: d * 4, topFrame: 'full' }, look({ soilShift: shift }), { soil: tex, rocks: null, detail: null, overhang: null });
          const m = faceMask(side, 'full');
          for (let y = 0; y < FACE_H; y++) {
            for (let x = 0; x < FACE_W; x++) {
              if (!m[y * FACE_W + x]) continue;
              const i = (y * FACE_W + x) * 4;
              // Wall row (y + 4d), texture row (that + shift) wrapped: one continuous strip.
              expect(out[i]).toBe(x);
              expect(out[i + 1]).toBe((((y + d * 4 + shift) % H) + H) % H);
            }
          }
        }
      }
    }
  });

  it('paints the overhang only in its rows under the top edge, following sloped tops', () => {
    const oh = coordTexture(3);
    for (const side of SIDES) {
      for (const topFrame of FACE_FRAMES) {
        const top = edgeTopRows(side, topFrame);
        const reach = overhangReach(side, topFrame, 3);
        for (let d = 0; d <= 24; d += 4) {
          const frame = d === 0 ? topFrame : 'full';
          const out = composeBand({ side, frame, depth: d, topFrame }, look({ overhang: 'o' }), { soil: clear(H), rocks: null, detail: null, overhang: oh });
          let painted = 0;
          for (let y = 0; y < FACE_H; y++) {
            for (let x = 0; x < FACE_W; x++) {
              const i = (y * FACE_W + x) * 4;
              if (!out[i + 3]) continue;
              painted++;
              const row = y + d - top[x]!;
              expect(row).toBeGreaterThanOrEqual(0);
              expect(row).toBeLessThan(3);
              expect(out[i + 1]).toBe(row);
            }
          }
          if (d >= reach) expect(painted, `${side} ${topFrame} depth ${d}`).toBe(0);
        }
      }
    }
  });

  it('finds the true top of the wall in every column, also under the empty end of a cap', () => {
    for (const side of SIDES) {
      for (const topFrame of FACE_FRAMES) {
        const under = topFrame.endsWith('2') ? 8 : 4;
        const top = edgeTopRows(side, topFrame);
        const cap = faceMask(side, topFrame);
        const full = faceMask(side, 'full');
        for (let x = 0; x < FACE_W; x++) {
          // The first row where the cap or the full band under it has a pixel.
          let first = Infinity;
          for (let r = 0; r < FACE_H + under; r++) {
            const inCap = r < FACE_H && cap[r * FACE_W + x];
            const inFull = r - under >= 0 && r - under < FACE_H && full[(r - under) * FACE_W + x];
            if (inCap || inFull) {
              first = r;
              break;
            }
          }
          expect(top[x], `${side} ${topFrame} column ${x}`).toBe(first);
        }
      }
    }
  });

  it('gives two bands the same key only when they paint the same pixels', () => {
    const tex = { soil: coordTexture(H), rocks: coordTexture(32, 128), detail: null, overhang: coordTexture(3) };
    const heights = { soil: H, rocks: 32, detail: 1, overhang: 3 };
    const seen = new Map<string, string>();
    for (let k = 0; k < 400; k++) {
      const r = (s: number) => edgeRandom(99, k, 0, 'left', s);
      const band = { side: SIDES[Math.floor(r(1) * 2)]!, frame: FACE_FRAMES[Math.floor(r(2) * 5)]!, depth: Math.floor(r(3) * 12) * 4, topFrame: FACE_FRAMES[Math.floor(r(4) * 5)]! };
      const lk = look({ soilShift: Math.floor(r(5) * 200), rockShift: Math.floor(r(6) * 200), rocks: 'r', overhang: r(7) < 0.5 ? 'o' : null });
      const key = bandKey(band, lk, heights);
      const pixels = Buffer.from(composeBand(band, lk, { ...tex, overhang: lk.overhang ? tex.overhang : null })).toString('base64');
      if (seen.has(key)) expect(seen.get(key)).toBe(pixels);
      seen.set(key, pixels);
    }
  });
});

describe('wall art in the manifest', () => {
  const style = WALL_STYLES['face-earth']!;
  const ids = [...style.soil, ...style.rocks, ...style.details].map((v) => v.sprite).filter((s): s is string => !!s);
  if (style.overhang) ids.push(style.overhang);

  it('packs every wall texture into one sheet per side and theme, 16 pixels per texture, with its real height', () => {
    for (const side of SIDES) {
      for (const theme of THEMES) {
        const name = theme === 'day' ? `wall-sheet-${side}` : `wall-sheet-${side}@${theme}`;
        const e = manifest.sprites[name];
        expect(e, name).toBeDefined();
        expect(e!.frameWidth).toBe(16);
        expect(e!.heights).toHaveLength(e!.frames.length);
        for (const id of ids) expect(e!.frames, `${name} has ${id}`).toContain(id);
        e!.frames.forEach((f, i) => {
          const drawn = decodePng(readFileSync(`art/drawn/${f}-${side}.png`));
          expect(e!.heights![i]).toBe(drawn.height);
        });
      }
    }
  });

  it('has fully opaque soil textures', () => {
    for (const v of style.soil) {
      for (const side of SIDES) {
        const img = decodePng(readFileSync(`art/drawn/${v.sprite}-${side}.png`));
        for (let i = 3; i < img.data.length; i += 4) expect(img.data[i]).toBe(255);
      }
    }
  });

  it('puts each texture in the sheet exactly as drawn', () => {
    for (const side of SIDES) {
      const e = manifest.sprites[`wall-sheet-${side}`]!;
      const sheet = decodePng(readFileSync(`assets/${e.file}`));
      e.frames.forEach((f, i) => {
        const drawn = decodePng(readFileSync(`art/drawn/${f}-${side}.png`));
        for (let y = 0; y < drawn.height; y++) for (let x = 0; x < 16; x++) expect(sheet.get(i * 16 + x, y)).toEqual(drawn.get(x, y));
      });
    }
  });
});
