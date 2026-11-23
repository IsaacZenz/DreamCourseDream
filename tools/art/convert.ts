/**
 * The converter (docs/plans/art-converter.md, owner sign-off 2026-11-23): from a
 * photo of the owner's drawing to a first-draft sprite in the house style B2.
 *
 * 1. readPhoto   — the photo, shrunk to a working copy: brightness and colourfulness.
 * 2. readDrawing — the linework, the parts it encloses, marker-coloured areas, marks
 *                  (eyes, mouths) inside parts, open strokes (fumes) outside them.
 * 3. partMap     — the drawing fitted into the sprite's box: one part per pixel.
 * 4. shadeB2     — the part map shaded by the B2 rules, as sprite-file rows.
 *
 * Small sprites still get a hand finish (sheet section 2); this gives the layout.
 */
import { readFileSync } from 'node:fs';
import jpeg from 'jpeg-js';
import { decodePng } from '../png.ts';

export interface ConvertSettings {
  workSize: number;
  paperBlur: number;
  lineDarkness: number;
  markerSaturation: number;
  keepMargin: number;
  minRegion: number;
  minMark: number;
  strokeAspect: number;
  minStroke: number;
  filled: number;
  markHits: number;
  strokeHits: number;
  rimMax: number;
  shapeMismatch: number;
  closeGaps: number;
  markerDarkness: number;
  lineInk: number;
  markerSmooth: number;
  markerShare: number;
  minPart: number;
  colours: { coloured: string; plain: string };
}

// ---------------------------------------------------------------------------
// 1. The photo

export interface Photo {
  readonly w: number;
  readonly h: number;
  /** Brightness 0..255 per pixel. */
  readonly grey: Float32Array;
  /** Colourfulness 0..1 per pixel (marker colouring). */
  readonly sat: Float32Array;
}

/** Build a Photo from RGBA pixels, shrunk so its longer side is at most `size`. */
export function photoFromRgba(data: Uint8Array, w: number, h: number, size: number): Photo {
  const k = Math.max(1, Math.ceil(Math.max(w, h) / size));
  const W = Math.floor(w / k);
  const H = Math.floor(h / k);
  const grey = new Float32Array(W * H);
  const sat = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < k; j++)
        for (let i = 0; i < k; i++) {
          const o = ((y * k + j) * w + x * k + i) * 4;
          r += data[o]!;
          g += data[o + 1]!;
          b += data[o + 2]!;
        }
      const n = k * k;
      r /= n;
      g /= n;
      b /= n;
      const max = Math.max(r, g, b);
      grey[y * W + x] = 0.3 * r + 0.59 * g + 0.11 * b;
      sat[y * W + x] = max > 0 ? (max - Math.min(r, g, b)) / max : 0;
    }
  return { w: W, h: H, grey, sat };
}

export function readPhoto(path: string, size: number): Photo {
  const bytes = readFileSync(path);
  if (/\.png$/i.test(path)) {
    const img = decodePng(bytes);
    return photoFromRgba(img.data, img.width, img.height, size);
  }
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
  return photoFromRgba(img.data, img.width, img.height, size);
}

// ---------------------------------------------------------------------------
// 2. Reading the drawing

export interface Region {
  readonly id: number;
  readonly area: number;
  /** Share of the region's pixels coloured with marker. */
  readonly coloured: number;
}

export interface Reading {
  readonly w: number;
  readonly h: number;
  /** Per pixel: -1 outside, -2 line, otherwise the region id. */
  readonly label: Int32Array;
  /** Per pixel: a drawn line inside the drawing (not its outer edge): becomes ink. */
  readonly inner: Uint8Array;
  /** Per pixel: marker-coloured. */
  readonly marker: Uint8Array;
  /** Per pixel: 1 a mark inside a part (eye, mouth), 2 an open stroke outside the parts (fumes). */
  readonly extra: Uint8Array;
  readonly regions: readonly Region[];
  /** The drawing's box in the working copy: x0, y0, x1, y1. */
  readonly box: readonly [number, number, number, number];
  /** What was found and what was left out (the written code, specks), in words. */
  readonly notes: string[];
}

/**
 * Average brightness around each pixel, by a box blur. With `brightOnly`, only pixels
 * brighter than that count, so lines and marker do not drag the paper level down.
 */
function paper(p: Photo, radius: number, brightOnly = -1): Float32Array {
  const { w, h, grey } = p;
  const sum = new Float64Array((w + 1) * (h + 1));
  const cnt = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = grey[y * w + x]!;
      const use = v > brightOnly ? 1 : 0;
      sum[(y + 1) * (w + 1) + x + 1] = v * use + sum[y * (w + 1) + x + 1]! + sum[(y + 1) * (w + 1) + x]! - sum[y * (w + 1) + x]!;
      cnt[(y + 1) * (w + 1) + x + 1] = use + cnt[y * (w + 1) + x + 1]! + cnt[(y + 1) * (w + 1) + x]! - cnt[y * (w + 1) + x]!;
    }
  const median = [...grey].sort((a, b) => a - b)[Math.floor(grey.length / 2)]!;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(h, y + radius + 1);
      const s = sum[y1 * (w + 1) + x1]! - sum[y0 * (w + 1) + x1]! - sum[y1 * (w + 1) + x0]! + sum[y0 * (w + 1) + x0]!;
      const n = cnt[y1 * (w + 1) + x1]! - cnt[y0 * (w + 1) + x1]! - cnt[y1 * (w + 1) + x0]! + cnt[y0 * (w + 1) + x0]!;
      out[y * w + x] = n > 0 ? s / n : median;
    }
  return out;
}

/** Connected groups of pixels where `on` is true. 8-connected when `diag`. */
function components(w: number, h: number, on: (i: number) => boolean, diag: boolean): Int32Array {
  const lab = new Int32Array(w * h).fill(-1);
  let next = 0;
  const stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (lab[s]! >= 0 || !on(s)) continue;
    lab[s] = next;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (!diag && dx && dy)) continue;
          const u = x + dx;
          const v = y + dy;
          if (u < 0 || v < 0 || u >= w || v >= h) continue;
          const j = v * w + u;
          if (lab[j]! < 0 && on(j)) {
            lab[j] = next;
            stack.push(j);
          }
        }
    }
    next++;
  }
  return lab;
}

/** Pixels within `r` steps (square) of a pixel where `on` is true. */
function grow(w: number, h: number, on: (i: number) => boolean, r: number): Uint8Array {
  const row = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    for (let x = 0; x < w; x++) {
      if (on(y * w + x)) last = x;
      if (x - last <= r) row[y * w + x] = 1;
    }
    last = 1e9;
    for (let x = w - 1; x >= 0; x--) {
      if (on(y * w + x)) last = x;
      if (last - x <= r) row[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    for (let y = 0; y < h; y++) {
      if (row[y * w + x]) last = y;
      if (y - last <= r) out[y * w + x] = 1;
    }
    last = 1e9;
    for (let y = h - 1; y >= 0; y--) {
      if (row[y * w + x]) last = y;
      if (last - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

interface Group {
  n: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  sx: number;
  sy: number;
}
function groups(lab: Int32Array, w: number): Map<number, Group> {
  const g = new Map<number, Group>();
  lab.forEach((l, i) => {
    if (l < 0) return;
    const x = i % w;
    const y = (i - x) / w;
    const e = g.get(l) ?? { n: 0, x0: x, y0: y, x1: x, y1: y, sx: 0, sy: 0 };
    e.n++;
    e.x0 = Math.min(e.x0, x);
    e.y0 = Math.min(e.y0, y);
    e.x1 = Math.max(e.x1, x);
    e.y1 = Math.max(e.y1, y);
    e.sx += x;
    e.sy += y;
    g.set(l, e);
  });
  return g;
}

/**
 * Find the drawing in the photo. `ignore` boxes (fractions of the photo: x0, y0, x1, y1)
 * leave things out; `keep` points (fractions) bring back a left-out stroke.
 */
export function readDrawing(p: Photo, s: ConvertSettings, ignore: ReadonlyArray<readonly number[]> = [], keep: ReadonlyArray<readonly number[]> = []): Reading {
  const { w, h } = p;
  const notes: string[] = [];
  const median = [...p.grey].sort((a, b) => a - b)[Math.floor(p.grey.length / 2)]!;
  const bg = paper(p, Math.max(4, Math.round(Math.max(w, h) * s.paperBlur)), median * 0.8);
  const ignored = (x: number, y: number) => ignore.some((b) => x >= b[0]! * w && x <= b[2]! * w && y >= b[1]! * h && y <= b[3]! * h);
  const dark = (i: number) => p.grey[i]! < bg[i]! * s.lineDarkness && !ignored(i % w, Math.floor(i / w));
  const lineLab = components(w, h, dark, true);
  const lines = [...groups(lineLab, w).entries()].sort((a, b) => b[1].n - a[1].n);
  if (!lines.length) throw new Error('No drawing found: the photo has no dark lines. Is it in focus and well lit?');
  const [mainId, main] = lines[0]!;
  // The drawing's outside: flood in from the edges of the photo, with the lines thickened
  // so small gaps in a hand-drawn outline do not let the outside leak in; then grow the
  // outside back to the real lines.
  const isMain = (i: number) => lineLab[i] === mainId;
  const R = Math.max(2, Math.round(Math.max(main.x1 - main.x0, main.y1 - main.y0) * s.closeGaps));
  const thick = grow(w, h, isMain, R);
  const outside = new Uint8Array(w * h);
  const queue: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i - x) / w;
    if ((x === 0 || y === 0 || x === w - 1 || y === h - 1) && !thick[i]) {
      outside[i] = 1;
      queue.push(i);
    }
  }
  const spread = (open: (j: number) => boolean) => {
    while (queue.length) {
      const i = queue.shift()!;
      const x = i % w;
      const y = (i - x) / w;
      for (const [u, v] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (u < 0 || v < 0 || u >= w || v >= h) continue;
        const j = v * w + u;
        if (!outside[j] && open(j)) {
          outside[j] = 1;
          queue.push(j);
        }
      }
    }
  };
  spread((j) => !thick[j]);
  // Grow back up to the real lines, at most R steps.
  for (let step = 0; step < R; step++) {
    const edge: number[] = [];
    for (let i = 0; i < w * h; i++) {
      if (outside[i]) continue;
      const x = i % w;
      const y = (i - x) / w;
      if (!isMain(i) && ((x > 0 && outside[i - 1]) || (x < w - 1 && outside[i + 1]) || (y > 0 && outside[i - w]) || (y < h - 1 && outside[i + w]))) edge.push(i);
    }
    for (const i of edge) outside[i] = 1;
  }
  // Parts: areas inside the drawing that the lines (with tiny gaps closed) separate.
  const closed = grow(w, h, isMain, 2);
  const regLab = components(w, h, (i) => !outside[i] && !closed[i], false);
  const label = new Int32Array(w * h);
  const marker = new Uint8Array(w * h);
  const extra = new Uint8Array(w * h);
  const inner = new Uint8Array(w * h);
  const regGroups = groups(regLab, w);
  const keptRegion = new Map<number, number>();
  for (const [id, g] of regGroups) if (g.n >= s.minRegion) keptRegion.set(id, keptRegion.size);
  for (let i = 0; i < w * h; i++) {
    if (outside[i]) label[i] = -1;
    else {
      const r = keptRegion.get(regLab[i]!);
      label[i] = r === undefined ? -2 : r;
    }
    // Marker: colourful, or clearly darker than the paper but lighter than a line.
    marker[i] = label[i]! >= 0 && p.grey[i]! < bg[i]! * 0.97 && (p.sat[i]! > s.markerSaturation || p.grey[i]! < bg[i]! * s.markerDarkness) ? 1 : 0;
  }
  // Marker strokes are streaky: decide from the share of marker in a small neighbourhood,
  // so a coloured area reads as one solid part (drips still come through).
  {
    const share = paper({ w, h, grey: Float32Array.from(marker, (v) => v * 255), sat: p.sat }, Math.max(2, Math.round(Math.max(main.x1 - main.x0, main.y1 - main.y0) * s.markerSmooth)));
    for (let i = 0; i < w * h; i++) marker[i] = label[i]! >= 0 && share[i]! / 255 >= s.markerShare ? 1 : 0;
  }
  // Lines inside the drawing (not touching the outside) become ink.
  for (let i = 0; i < w * h; i++) {
    if (!isMain(i) || outside[i]) continue;
    const x = i % w;
    const y = (i - x) / w;
    let nearOut = false;
    for (let dy = -3; dy <= 3 && !nearOut; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const u = x + dx;
        const v = y + dy;
        if (u >= 0 && v >= 0 && u < w && v < h && outside[v * w + u]) {
          nearOut = true;
          break;
        }
      }
    if (!nearOut) inner[i] = 1;
  }
  // Other dark strokes: marks inside a part, open strokes outside, or the written code.
  const m = s.keepMargin;
  const bw = main.x1 - main.x0;
  const bh = main.y1 - main.y0;
  let box: [number, number, number, number] = [main.x0, main.y0, main.x1, main.y1];
  // First pass: what would be left out as compact writing (the code next to the drawing).
  const compact = (g: Group) => Math.max(g.x1 - g.x0 + 1, g.y1 - g.y0 + 1) / Math.max(1, Math.min(g.x1 - g.x0 + 1, g.y1 - g.y0 + 1)) < s.strokeAspect;
  const writing = lines.slice(1).filter(([, g]) => {
    const cx = Math.round(g.sx / g.n);
    const cy = Math.round(g.sy / g.n);
    return g.n >= s.minMark && compact(g) && label[cy * w + cx]! < 0;
  });
  // A stroke lined up beside writing, at the same height, is part of the word (the "1" in "G13").
  const inWord = (g: Group) =>
    writing.some(([, t]) => {
      const overlap = Math.min(g.y1, t.y1) - Math.max(g.y0, t.y0);
      const gap = Math.max(t.x0 - g.x1, g.x0 - t.x1);
      return t !== g && overlap > 0.5 * Math.min(g.y1 - g.y0, t.y1 - t.y0) && gap < (t.y1 - t.y0);
    });
  for (const [id, g] of lines.slice(1)) {
    const cx = Math.round(g.sx / g.n);
    const cy = Math.round(g.sy / g.n);
    const near = g.x0 >= main.x0 - m * bw && g.x1 <= main.x1 + m * bw && g.y0 >= main.y0 - m * bh && g.y1 <= main.y1 + m * bh;
    const under = label[cy * w + cx]!;
    const wanted = keep.some((k) => Math.abs(k[0]! * w - cx) < 12 && Math.abs(k[1]! * h - cy) < 12);
    const aspect = Math.max(g.x1 - g.x0 + 1, g.y1 - g.y0 + 1) / Math.max(1, Math.min(g.x1 - g.x0 + 1, g.y1 - g.y0 + 1));
    let kind = 0;
    if (g.n < s.minMark && !wanted) continue;
    if (under >= 0) kind = 1;
    else if (wanted || (near && aspect >= s.strokeAspect && g.n >= s.minStroke && !inWord(g))) kind = 2;
    if (!kind) {
      notes.push(`left out a mark at ${(cx / w).toFixed(2)},${(cy / h).toFixed(2)} (the written code, or a speck); bring it back with --keep ${(cx / w).toFixed(2)},${(cy / h).toFixed(2)}`);
      continue;
    }
    lineLab.forEach((l, i) => {
      if (l === id) extra[i] = kind;
    });
    if (kind === 2) box = [Math.min(box[0], g.x0), Math.min(box[1], g.y0), Math.max(box[2], g.x1), Math.max(box[3], g.y1)];
  }
  const regions: Region[] = [...keptRegion.entries()].map(([orig, id]) => {
    let col = 0;
    const g = regGroups.get(orig)!;
    void outside;
    regLab.forEach((l, i) => {
      if (l === orig && marker[i]) col++;
    });
    return { id, area: g.n, coloured: col / g.n };
  });
  notes.unshift(`found ${regions.length} parts (${regions.filter((r) => r.coloured > 0.05).length} with marker), ${[...extra].filter((v) => v === 1).length ? 'marks inside parts' : 'no marks'}, ${[...extra].filter((v) => v === 2).length ? 'open strokes' : 'no open strokes'}`);
  return { w, h, label, inner, marker, extra, regions, box, notes };
}

// ---------------------------------------------------------------------------
// 3. The part map

export interface Cell {
  /** A drawn line inside the drawing crosses this pixel: ink. */
  ink: boolean;
  /** How much of a drawn line falls in this pixel (samples out of 16). */
  inkHits: number;
  /** "<region>c" (marker-coloured) or "<region>p" (plain), or null for empty. */
  part: string | null;
  mark: boolean;
  stroke: boolean;
}

export interface Fit {
  readonly mode: 'keep' | 'fill';
  /** Box pixel (centre) to working-copy position. */
  readonly fx: (x: number) => number;
  readonly fy: (y: number) => number;
}

/**
 * Fit the drawing in a W×H box with one free pixel round it for the outline, standing
 * on the bottom. "keep" keeps the drawing's proportions; "fill" stretches it to the box.
 */
export function fits(r: Reading, W: number, H: number, mismatch: number): Fit[] {
  const [x0, y0, x1, y1] = r.box;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const aw = W - 2;
  const ah = H - 2;
  const k = Math.max(bw / aw, bh / ah);
  const usedW = bw / k;
  const keep: Fit = { mode: 'keep', fx: (x) => x0 + (x - 1 - (aw - usedW) / 2) * k, fy: (y) => y1 + 1 - (H - 1 - y) * k };
  const out = [keep];
  const ratio = bw / bh / (aw / ah);
  if (Math.abs(ratio - 1) > mismatch) out.push({ mode: 'fill', fx: (x) => x0 + (x - 1) * (bw / aw), fy: (y) => y0 + (y - 1) * (bh / ah) });
  return out;
}

export function partMap(r: Reading, W: number, H: number, fit: Fit, s: ConvertSettings): Cell[][] {
  const grid: Cell[][] = [];
  const N = 4;
  for (let y = 0; y < H; y++) {
    const row: Cell[] = [];
    for (let x = 0; x < W; x++) {
      let inside = 0;
      let marks = 0;
      let strokes = 0;
      let inks = 0;
      const votes = new Map<string, number>();
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          const px = Math.floor(fit.fx(x + (i + 0.5) / N));
          const py = Math.floor(fit.fy(y + (j + 0.5) / N));
          if (px < 0 || py < 0 || px >= r.w || py >= r.h) continue;
          const k = py * r.w + px;
          const e = r.extra[k]!;
          if (e === 1) marks++;
          if (e === 2) strokes++;
          if (r.inner[k]) inks++;
          const l = r.label[k]!;
          if (l === -1) continue;
          inside++;
          if (l >= 0) {
            const key = `${l}${r.marker[k] ? 'c' : 'p'}`;
            votes.set(key, (votes.get(key) ?? 0) + 1);
          }
        }
      const filled = inside / (N * N) >= s.filled;
      const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      row.push({ part: filled ? (best ?? '?') : null, mark: filled && marks >= s.markHits, stroke: !filled && strokes >= s.strokeHits, ink: filled && inks >= s.lineInk, inkHits: filled ? inks : 0 });
    }
    grid.push(row);
  }
  // Cells that were all line take the most common part around them.
  for (let pass = 0; pass < 3; pass++)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (grid[y]![x]!.part !== '?') continue;
        const near = new Map<string, number>();
        for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
          const q = grid[y + dy]?.[x + dx]?.part;
          if (q && q !== '?') near.set(q, (near.get(q) ?? 0) + 1);
        }
        const best = [...near.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (best) grid[y]![x]!.part = best;
      }
  for (const row of grid) for (const c of row) if (c.part === '?') c.part = null;
  // A line that falls on the border between two pixels is split between them: give it to
  // the one with more of it, so the line does not disappear.
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = grid[y]![x]!;
      if (c.ink || c.inkHits < 2) continue;
      for (const n of [grid[y + 1]?.[x], grid[y]![x + 1]]) {
        if (!n || n.ink || n.inkHits < 2 || c.inkHits + n.inkHits < s.lineInk) continue;
        if (c.inkHits >= n.inkHits) c.ink = true;
        else n.ink = true;
        break;
      }
    }
  // Parts that cover only a pixel or two (slivers between lines) join their neighbour.
  const count = new Map<string, number>();
  for (const row of grid) for (const c of row) if (c.part) count.set(c.part, (count.get(c.part) ?? 0) + 1);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = grid[y]![x]!;
      if (!c.part || (count.get(c.part) ?? 0) >= s.minPart) continue;
      const near = new Map<string, number>();
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) {
        const q = grid[y + dy]?.[x + dx]?.part;
        if (q && q !== c.part && (count.get(q) ?? 0) >= s.minPart) near.set(q, (near.get(q) ?? 0) + 1);
      }
      const best = [...near.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (best) c.part = best;
    }
  return grid;
}

// ---------------------------------------------------------------------------
// 4. Shading in B2 (art/STYLE.md)

/** Letters for each colour ramp used, darkest of the three B2 shades first. */
const RAMP_LETTERS = ['234', 'abc', 'fgh', 'jkl', 'mno', 'stu'];

/** The sprite-file key for the ramps used (in order), plus ink, marks, rim light and shine. */
export function b2Key(ramps: readonly string[]): string[] {
  return [...ramps.flatMap((r, n) => [...RAMP_LETTERS[n]!].map((ch, k) => `key ${ch} ${r} ${k + 2}`)), 'key i grey 1', 'key e grey 0', 'key r blue 4', 'key w grey 4'];
}

/**
 * Shade a part map in B2. `rampOf` names each part's colour ramp; `ramps` collects the
 * ramps used, in order, for b2Key.
 */
export function shadeB2(grid: Cell[][], s: ConvertSettings, rampOf: (part: string) => string, ramps: string[] = []): string[] {
  const letters = (part: string) => {
    const r = rampOf(part);
    if (!ramps.includes(r)) ramps.push(r);
    return RAMP_LETTERS[ramps.indexOf(r)] ?? RAMP_LETTERS[0]!;
  };
  const H = grid.length;
  const W = grid[0]!.length;
  const part = (x: number, y: number) => grid[y]?.[x]?.part ?? null;
  const out = grid.map((row) => row.map(() => '.'));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = grid[y]![x]!;
      if (c.stroke) {
        out[y]![x] = 'e';
        continue;
      }
      const p = c.part;
      if (!p) continue;
      const coloured = p.endsWith('c');
      const up = part(x, y - 1);
      const lf = part(x - 1, y);
      const dn = part(x, y + 1);
      const rt = part(x + 1, y);
      let shade = 1;
      if (!up || !lf) shade = 2;
      else if (!dn || !rt) shade = 0;
      // A small shadow right under a coloured part that overhangs a plain one.
      if (!coloured && up && up.endsWith('c')) shade = 0;
      let ch = letters(p)[shade]!;
      // Ink lines only where the drawing has a line (art/STYLE.md).
      if (c.ink) ch = 'i';
      if (c.mark) ch = 'e';
      out[y]![x] = ch;
    }
  // Rim light: a pixel or two on the right edge of the top of the coloured parts.
  let rims = 0;
  for (let y = 0; y < H && rims < s.rimMax; y++)
    for (let x = W - 1; x >= 0; x--) {
      const p = part(x, y);
      if (!p) continue;
      if (p.endsWith('c') && !part(x + 1, y) && out[y]![x] !== 'e' && out[y]![x] !== 'i') {
        out[y]![x] = 'r';
        rims++;
      }
      break;
    }
  // Shine: one pixel near the top-left of the biggest coloured part.
  const sizes = new Map<string, number>();
  for (const row of grid) for (const c of row) if (c.part?.endsWith('c')) sizes.set(c.part, (sizes.get(c.part) ?? 0) + 1);
  const big = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (big) {
    outer: for (let y = 1; y < H; y++)
      for (let x = 1; x < W; x++)
        if (part(x, y) === big && part(x, y - 1) === big && part(x - 1, y) === big && out[y]![x] !== 'i' && out[y]![x] !== 'e') {
          out[y]![x] = 'w';
          break outer;
        }
  }
  return out.map((r) => r.join(''));
}

/** The part map as text: one letter per part, '.' empty, '*' a mark, '~' an open stroke. */
export function partText(grid: Cell[][]): string {
  const letters = new Map<string, string>();
  const rows = grid.map((row) =>
    row
      .map((c) => {
        if (c.stroke) return '~';
        if (!c.part) return '.';
        if (c.mark) return '*';
        if (!letters.has(c.part)) letters.set(c.part, String.fromCharCode((c.part.endsWith('c') ? 65 : 97) + letters.size));
        return letters.get(c.part)!;
      })
      .join(''),
  );
  const legend = [...letters.entries()].map(([p, l]) => `${l} = part ${p.slice(0, -1)}, ${p.endsWith('c') ? 'marker-coloured' : 'plain'}`);
  return [...rows, '', ...legend, '* = mark (eye, mouth)', '~ = open stroke'].join('\n') + '\n';
}
