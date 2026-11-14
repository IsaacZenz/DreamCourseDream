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
 *     "quota": 0,
 *     "objects": [ { "id": "mossback", "at": [1, 0] }, { "id": "rock", "at": [0, 1] } ]
 *   }
 *
 * Each string in "tiles" is one grid row (grid y), with tiles separated by
 * spaces (grid x). A tile is written as a legend letter followed by either one
 * digit (a flat tile at that height) or four digits (the corner heights nw, ne,
 * se, sw; see tileShape.ts). A single "." is an empty spot: out of bounds.
 *
 * "objects" is optional: things placed on tiles, by id from
 * src/content/objects.ts (pickups, blockers, moving obstacles, breakables,
 * clouds, enemies). At most one per tile (a thunder cloud floats, so it may share
 * a tile), never on the start or the exit. The stars on offer (enemy star
 * values, placed yellow stars and stars inside breakables) must be at least the
 * quota.
 *
 * Format 2 (Milestone 4) adds optional fields on an object; format 1 files still load:
 *   "path":   [[x, y], ...] tile centres, walked there and back (patrollers,
 *             sliding blocks, drifting clouds). The object's own tile is the start.
 *   "facing": "ne" | "se" | "sw" | "nw" (enemies; default "se").
 *   "phase":  0 to 1, how far round its cycle it starts (moving things, gates).
 *   "orient": "x" | "y", which way a gate's bars run (default "x").
 *   "drops":  pickup ids a breakable drops instead of its default.
 *
 * `parseCourse` checks everything and returns a list of readable errors
 * instead of a course if anything is wrong.
 */
import { OBJECTS, RENAMED_OBJECTS } from '../content/objects.ts';
import { DIRECTIONS, SURFACES, type Direction } from '../content/surfaces.ts';
import { minCorner, shapeOf, type Corners, type ShapeId } from './tileShape.ts';

export const COURSE_FORMAT_VERSION = 2;
const FORMATS_READ = [1, 2];
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

export interface CourseObject {
  /** Object definition id in src/content/objects.ts. */
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** Tile centres to walk there and back, starting with the object's own tile. Empty: it does not move. */
  readonly path: readonly GridPoint[];
  readonly facing: Direction;
  readonly phase: number;
  readonly orient: 'x' | 'y';
  /** Pickup ids, or null for the definition's default. */
  readonly drops: readonly string[] | null;
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
  readonly objects: readonly CourseObject[];
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

const TOP_LEVEL_KEYS = ['format', 'name', 'legend', 'tiles', 'start', 'exit', 'quota', 'objects'];
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
  if (!FORMATS_READ.includes(raw.format as number)) errors.push(`"format" must be one of ${FORMATS_READ.join(', ')}.`);
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

  const course = { name: raw.name as string, width, height, tiles, quota: raw.quota as number, objects: [] as CourseObject[] };
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


  const objects = parseObjects(raw.objects, course, errors);
  for (const o of objects) {
    if (start && o.x === start.x && o.y === start.y) errors.push(`object "${o.id}" at (${o.x}, ${o.y}) is on the start tile.`);
    if (exit && o.x === exit.x && o.y === exit.y) errors.push(`object "${o.id}" at (${o.x}, ${o.y}) is on the exit tile.`);
  }
  const quota = course.quota;
  if (Number.isInteger(quota)) {
    const onOffer = starsOnOffer(objects);
    if (onOffer < quota) errors.push(`"quota" is ${quota}, but the course only offers ${onOffer} star(s) (enemies, placed yellow stars and stars in breakables).`);
  }

  if (errors.length || !start || !exit) return { ok: false, errors };
  return { ok: true, course: { ...course, start, exit, objects } };
}

/** Yellow stars a course can give: enemy star values, placed yellow stars and stars inside breakables. */
export function starsOnOffer(objects: readonly CourseObject[]): number {
  let n = 0;
  for (const o of objects) {
    const def = OBJECTS.get(o.id);
    if (def?.kind === 'enemy') n += def.starValue;
    else if (def?.kind === 'pickup' && def.effect === 'yellowStar') n += 1;
    else if (def?.kind === 'breakable') n += (o.drops ?? def.drops).filter((d) => d === 'yellow-star').length;
  }
  return n;
}

const OBJECT_KEYS = ['id', 'at', 'path', 'facing', 'phase', 'orient', 'drops'];

/** Does this kind of object follow a path? */
function takesPath(id: string): boolean {
  const def = OBJECTS.get(id);
  if (!def) return false;
  if (def.kind === 'enemy') return def.behaviour.kind === 'patrol';
  if (def.kind === 'mover') return def.motion.kind === 'path';
  return def.kind === 'cloud';
}

/**
 * A path may not leave the course, cross an empty spot, or cross a rise or drop
 * of more than one step. Checked by walking each leg in small steps.
 */
function checkPath(course: Omit<Course, 'start' | 'exit'>, pts: readonly GridPoint[], where: string, errors: string[]): void {
  const c = { ...course, start: pts[0]!, exit: pts[0]! };
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 10));
    let prev: Tile | null = tileAt(c, a.x, a.y);
    for (let k = 1; k <= n; k++) {
      const x = a.x + 0.5 + ((b.x - a.x) * k) / n;
      const y = a.y + 0.5 + ((b.y - a.y) * k) / n;
      const t = tileAt(c, Math.floor(x), Math.floor(y));
      if (!t) {
        errors.push(`${where}: the path from (${a.x}, ${a.y}) to (${b.x}, ${b.y}) leaves the course.`);
        return;
      }
      if (prev && t !== prev && Math.abs(t.base - prev.base) > 1) {
        errors.push(`${where}: the path from (${a.x}, ${a.y}) to (${b.x}, ${b.y}) crosses a rise or drop of more than one step.`);
        return;
      }
      prev = t;
    }
  }
}

function parseObjects(raw: unknown, course: Omit<Course, 'start' | 'exit'>, errors: string[]): CourseObject[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    errors.push('"objects" must be a list of { "id": ..., "at": [x, y] }.');
    return [];
  }
  const out: CourseObject[] = [];
  const used = new Set<string>();
  const onCourse = (p: GridPoint) => !!tileAt({ ...course, start: p, exit: p }, p.x, p.y);
  raw.forEach((entry: unknown, i) => {
    const where = `objects[${i}]`;
    if (!isRecord(entry) || typeof entry.id !== 'string') {
      errors.push(`${where}: must be { "id": ..., "at": [x, y] }.`);
      return;
    }
    const extra = Object.keys(entry).filter((k) => !OBJECT_KEYS.includes(k));
    if (extra.length) errors.push(`${where}: unknown field(s) ${extra.join(', ')}.`);
    const renamed = RENAMED_OBJECTS.get(entry.id);
    if (renamed) {
      errors.push(`${where}: "${entry.id}" was renamed; use "${renamed}".`);
      return;
    }
    const def = OBJECTS.get(entry.id);
    if (!def || def.kind === 'flag') {
      errors.push(`${where}: unknown object "${entry.id}". Known: ${[...OBJECTS.values()].filter((d) => d.kind !== 'flag').map((d) => d.id).join(', ')}.`);
      return;
    }
    const p = parsePoint(entry.at, `${where}.at`, errors);
    if (!p) return;
    if (!onCourse(p)) {
      errors.push(`${where}: "${entry.id}" at (${p.x}, ${p.y}) is not on a tile.`);
      return;
    }
    if (def.kind !== 'cloud') {
      const key = `${p.x},${p.y}`;
      if (used.has(key)) errors.push(`${where}: tile (${p.x}, ${p.y}) already has an object. One per tile.`);
      used.add(key);
    }

    // Path
    let path: GridPoint[] = [];
    if (entry.path !== undefined) {
      if (!takesPath(entry.id)) errors.push(`${where}: "${entry.id}" does not move along a path.`);
      else if (!Array.isArray(entry.path) || entry.path.length < 1) errors.push(`${where}.path: must be a list of [x, y] points.`);
      else {
        const pts = entry.path.map((q: unknown, k: number) => parsePoint(q, `${where}.path[${k}]`, errors));
        if (pts.every((q): q is GridPoint => q !== null)) {
          path = [p, ...pts];
          for (const q of pts) if (!onCourse(q)) errors.push(`${where}.path: (${q.x}, ${q.y}) is not on a tile.`);
          if (path.every((q) => onCourse(q))) checkPath(course, path, `${where}.path`, errors);
        }
      }
    } else if (def.kind === 'enemy' && def.behaviour.kind === 'patrol') errors.push(`${where}: "${entry.id}" is a patroller and needs a "path".`);
    else if (def.kind === 'mover' && def.motion.kind === 'path') errors.push(`${where}: "${entry.id}" needs a "path".`);

    // Facing
    let facing: Direction = 'se';
    if (entry.facing !== undefined) {
      if (def.kind !== 'enemy') errors.push(`${where}: only enemies take "facing".`);
      else if (!DIRECTIONS.includes(entry.facing as Direction)) errors.push(`${where}.facing: must be one of ${DIRECTIONS.join(', ')}.`);
      else facing = entry.facing as Direction;
    }

    // Phase
    let phase = 0;
    if (entry.phase !== undefined) {
      const moves = def.kind === 'mover' || def.kind === 'cloud' || (def.kind === 'enemy' && def.behaviour.kind === 'patrol');
      if (!moves) errors.push(`${where}: only moving things take "phase".`);
      else if (typeof entry.phase !== 'number' || entry.phase < 0 || entry.phase > 1) errors.push(`${where}.phase: must be a number from 0 to 1.`);
      else phase = entry.phase;
    }

    // Orient
    let orient: 'x' | 'y' = 'x';
    if (entry.orient !== undefined) {
      if (!(def.kind === 'mover' && def.motion.kind === 'gate')) errors.push(`${where}: only gates take "orient".`);
      else if (entry.orient !== 'x' && entry.orient !== 'y') errors.push(`${where}.orient: must be "x" or "y".`);
      else orient = entry.orient;
    }

    // Drops
    let drops: string[] | null = null;
    if (entry.drops !== undefined) {
      if (def.kind !== 'breakable') errors.push(`${where}: only breakables (crates, cracked tiles) take "drops".`);
      else if (!Array.isArray(entry.drops) || !entry.drops.every((d) => typeof d === 'string')) errors.push(`${where}.drops: must be a list of pickup ids.`);
      else {
        drops = entry.drops as string[];
        for (const d of drops) if (OBJECTS.get(d)?.kind !== 'pickup') errors.push(`${where}.drops: "${d}" is not a pickup.`);
      }
    }

    out.push({ id: entry.id, x: p.x, y: p.y, path, facing, phase, orient, drops });
  });
  return out;
}
