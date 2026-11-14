/**
 * The course data format (DESIGN.md sections 4 and 11). Hand-built test
 * courses and, later, generated courses use this same format.
 *
 * A course file is JSON:
 *
 *   {
 *     "format": 1,
 *     "name": "Flat with walls",
 *     "legend": { "g": "grass", ">": { "surface": "booster", "dir": "se" }, "w": { "surface": "warp", "link": "a" } },
 *     "tiles": [
 *       "g1 g1 g1",
 *       "g1 g0 g0011",
 *       ". g0 >0"
 *     ],
 *     "start": [1, 1],
 *     "exit": [2, 1],
 *     "quota": 0
 *   }
 *
 * Each string in "tiles" is one grid row (grid y), with tiles separated by
 * spaces (grid x). A tile is written as a legend letter followed by either one
 * digit (a flat tile at that height) or four digits (the corner heights nw, ne,
 * se, sw; see tileShape.ts). A single "." is an empty spot: out of bounds.
 *
 * `parseCourse` checks everything and returns a list of readable errors
 * instead of a course if anything is wrong.
 */
import { DIRECTIONS, SURFACES, type Direction } from '../content/surfaces.ts';
import { minCorner, shapeOf, type Corners, type ShapeId } from './tileShape.ts';

export const COURSE_FORMAT_VERSION = 1;
/** Highest corner height allowed, in steps. Keeps courses on screen. */
export const MAX_HEIGHT = 9;

export interface Tile {
  readonly x: number;
  readonly y: number;
  readonly surface: string;
  readonly corners: Corners;
  readonly shape: ShapeId;
  /** Lowest corner height. */
  readonly base: number;
  readonly dir?: Direction;
  readonly link?: string;
}

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

export interface Course {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Row-major: index = y * width + x. null means out of bounds. */
  readonly tiles: readonly (Tile | null)[];
  readonly start: GridPoint;
  readonly exit: GridPoint;
  readonly quota: number;
}

export type ParseResult = { ok: true; course: Course } | { ok: false; errors: string[] };

export function tileAt(course: Course, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= course.width || y >= course.height) return null;
  return course.tiles[y * course.width + x] ?? null;
}

interface LegendEntry {
  surface: string;
  dir?: Direction;
  link?: string;
}

const TOP_LEVEL_KEYS = ['format', 'name', 'legend', 'tiles', 'start', 'exit', 'quota'];
const TILE_TOKEN = /^(.)(\d|\d{4})$/u;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseLegend(raw: unknown, errors: string[]): Map<string, LegendEntry> {
  const legend = new Map<string, LegendEntry>();
  if (!isRecord(raw)) {
    errors.push('"legend" must be an object mapping one character to a surface.');
    return legend;
  }
  for (const [key, value] of Object.entries(raw)) {
    const where = `legend "${key}"`;
    if ([...key].length !== 1 || key === '.' || /\s|\d/u.test(key)) {
      errors.push(`${where}: keys must be a single character that is not ".", a digit or a space.`);
      continue;
    }
    const entry: unknown = typeof value === 'string' ? { surface: value } : value;
    if (!isRecord(entry) || typeof entry.surface !== 'string') {
      errors.push(`${where}: must be a surface name or { "surface": ... }.`);
      continue;
    }
    const extra = Object.keys(entry).filter((k) => !['surface', 'dir', 'link'].includes(k));
    if (extra.length) errors.push(`${where}: unknown field(s) ${extra.join(', ')}.`);
    const def = SURFACES.get(entry.surface);
    if (!def) {
      errors.push(`${where}: unknown surface "${entry.surface}". Known: ${[...SURFACES.keys()].join(', ')}.`);
      continue;
    }
    const out: LegendEntry = { surface: def.id };
    if (def.needsDir) {
      if (!DIRECTIONS.includes(entry.dir as Direction)) {
        errors.push(`${where}: ${def.id} needs "dir", one of ${DIRECTIONS.join(', ')}.`);
      } else out.dir = entry.dir as Direction;
    } else if (entry.dir !== undefined) errors.push(`${where}: ${def.id} does not take "dir".`);
    if (def.needsLink) {
      if (typeof entry.link !== 'string' || entry.link === '') errors.push(`${where}: ${def.id} needs a "link" name.`);
      else out.link = entry.link;
    } else if (entry.link !== undefined) errors.push(`${where}: ${def.id} does not take "link".`);
    legend.set(key, out);
  }
  return legend;
}

function parsePoint(raw: unknown, name: string, errors: string[]): GridPoint | null {
  if (Array.isArray(raw) && raw.length === 2 && raw.every((n) => Number.isInteger(n))) {
    return { x: raw[0] as number, y: raw[1] as number };
  }
  errors.push(`"${name}" must be [x, y] with whole numbers.`);
  return null;
}

export function parseCourse(raw: unknown): ParseResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['A course must be a JSON object.'] };

  const unknown = Object.keys(raw).filter((k) => !TOP_LEVEL_KEYS.includes(k));
  if (unknown.length) errors.push(`Unknown field(s): ${unknown.join(', ')}.`);
  if (raw.format !== COURSE_FORMAT_VERSION) errors.push(`"format" must be ${COURSE_FORMAT_VERSION}.`);
  if (typeof raw.name !== 'string' || raw.name.trim() === '') errors.push('"name" must be a non-empty string.');
  if (!Number.isInteger(raw.quota) || (raw.quota as number) < 0) errors.push('"quota" must be a whole number, 0 or more.');

  const legend = parseLegend(raw.legend, errors);

  // Tiles
  const rows = raw.tiles;
  const tiles: (Tile | null)[] = [];
  let width = 0;
  let height = 0;
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every((r) => typeof r === 'string')) {
    errors.push('"tiles" must be a non-empty list of row strings.');
  } else {
    height = rows.length;
    const split = rows.map((r: string) => r.trim().split(/\s+/u));
    width = split[0]?.length ?? 0;
    split.forEach((tokens, y) => {
      if (tokens.length !== width) {
        errors.push(`tiles row ${y}: has ${tokens.length} tiles, but row 0 has ${width}. Every row must be the same length.`);
      }
      for (let x = 0; x < width; x++) {
        const token = tokens[x] ?? '.';
        const where = `tile (${x}, ${y}) "${token}"`;
        if (token === '.') {
          tiles.push(null);
          continue;
        }
        const m = TILE_TOKEN.exec(token);
        if (!m) {
          errors.push(`${where}: expected a legend letter then 1 or 4 digits, or ".".`);
          tiles.push(null);
          continue;
        }
        const [, key = '', digits = ''] = m;
        const entry = legend.get(key);
        if (!entry) {
          errors.push(`${where}: "${key}" is not in the legend.`);
          tiles.push(null);
          continue;
        }
        const h = [...digits].map(Number);
        const corners: Corners = h.length === 1 ? [h[0]!, h[0]!, h[0]!, h[0]!] : [h[0]!, h[1]!, h[2]!, h[3]!];
        if (Math.max(...corners) > MAX_HEIGHT) errors.push(`${where}: heights go up to ${MAX_HEIGHT}.`);
        const shape = shapeOf(corners);
        if (!shape) {
          errors.push(`${where}: corner heights must differ by at most 1, and opposite corners cannot both be raised.`);
          tiles.push(null);
          continue;
        }
        if (SURFACES.get(entry.surface)?.flatOnly && shape !== '0000') {
          errors.push(`${where}: ${entry.surface} tiles must be flat.`);
        }
        const tile: Tile = { x, y, surface: entry.surface, corners, shape, base: minCorner(corners) };
        tiles.push({ ...tile, ...(entry.dir && { dir: entry.dir }), ...(entry.link && { link: entry.link }) });
      }
    });
  }

  // Warp links must come in pairs.
  const linkCounts = new Map<string, number>();
  for (const t of tiles) if (t?.link) linkCounts.set(t.link, (linkCounts.get(t.link) ?? 0) + 1);
  for (const [link, n] of linkCounts) {
    if (n !== 2) errors.push(`Warp link "${link}" is used by ${n} tile(s); it must be used by exactly 2.`);
  }

  const course = { name: raw.name as string, width, height, tiles, quota: raw.quota as number } as const;
  const checkSpot = (p: GridPoint | null, name: string) => {
    if (!p) return;
    const t = tileAt({ ...course, start: p, exit: p }, p.x, p.y);
    if (!t) errors.push(`"${name}" (${p.x}, ${p.y}) is not on a tile.`);
    else if (!SURFACES.get(t.surface)?.canHoldBall) errors.push(`"${name}" (${p.x}, ${p.y}) is on ${t.surface}, which cannot hold the ball.`);
  };
  const start = parsePoint(raw.start, 'start', errors);
  const exit = parsePoint(raw.exit, 'exit', errors);
  checkSpot(start, 'start');
  checkSpot(exit, 'exit');
  if (start && exit && start.x === exit.x && start.y === exit.y) errors.push('"start" and "exit" must be different tiles.');

  if (errors.length || !start || !exit) return { ok: false, errors };
  return { ok: true, course: { ...course, start, exit } };
}
