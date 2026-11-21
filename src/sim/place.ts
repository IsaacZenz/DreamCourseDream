/**
 * The place data format (Milestone 8b design sheet section 6): a town, a
 * crossroads or the cache clearing.
 *
 *   {
 *     "kind": "town",
 *     "name": "Meadow town",
 *     "ground": { ...a course file: format, legend, tiles, start, exit, quota, objects, rails, scenery },
 *     "props": [ { "id": "food-hut", "at": [4, 3] } ],
 *     "triggers": [ { "kind": "food", "at": [5, 2], "size": [1, 2], "back": [5.8, 3] } ],
 *     "slots": [ { "end": { ...trigger }, "gate": { ...trigger }, "gateAt": [x, y], "sign": [x, y] } ]
 *   }
 *
 * - ground: read with parseCourse, so heights, tiles, rails (used as fences),
 *   blocker objects and scenery work exactly as on a course. Its "start" is
 *   where the armadillo arrives. Its "exit" is not used (any other tile).
 * - props: place-only things by id from src/content/places.ts, at a point in
 *   grid coordinates (any point, not only tile centres).
 * - triggers: a rectangle of tiles, from "at" (the top-left tile) "size" tiles
 *   wide and deep (default 1 by 1). "back" is where the armadillo stands
 *   after a flat screen closes. "slot" says which path (crossroads).
 * - slots (crossroads only): the 3 possible paths, left to right. Each has its
 *   path end, the boss gate's trigger and spot, and its signpost's spot.
 *
 * `parsePlace` returns readable errors instead of a place if anything is wrong.
 */
import { PLACE_KINDS, PROPS, TRIGGER_KINDS, type PlaceKind, type TriggerKind } from '../content/places.ts';
import { parseCourse, tileAt, type Course } from './course.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface PlacedProp {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface Trigger {
  readonly kind: TriggerKind;
  /** The rectangle, in grid coordinates: x0 <= x < x1, y0 <= y < y1. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** Where to stand after a flat screen closes, or after saying "not yet". */
  readonly back: Point | null;
  /** Crossroads: which path (0, 1, 2 left to right). */
  readonly slot: number | null;
}

export interface Slot {
  readonly end: Trigger;
  readonly gate: Trigger;
  readonly gateAt: Point;
  readonly sign: Point;
}

export interface Place {
  readonly kind: PlaceKind;
  readonly name: string;
  readonly ground: Course;
  readonly props: readonly PlacedProp[];
  readonly triggers: readonly Trigger[];
  readonly slots: readonly Slot[];
}

export type PlaceResult = { ok: true; place: Place } | { ok: false; errors: string[] };

const KEYS = ['kind', 'name', 'ground', 'props', 'triggers', 'slots'];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function point(raw: unknown): Point | null {
  return Array.isArray(raw) && raw.length === 2 && raw.every((n) => typeof n === 'number' && Number.isFinite(n)) ? { x: raw[0] as number, y: raw[1] as number } : null;
}

function parseTrigger(raw: unknown, where: string, ground: Course, errors: string[]): Trigger | null {
  if (!isRecord(raw)) {
    errors.push(`${where}: must be an object.`);
    return null;
  }
  const extra = Object.keys(raw).filter((k) => !['kind', 'at', 'size', 'back', 'slot'].includes(k));
  if (extra.length) errors.push(`${where}: unknown field(s) ${extra.join(', ')}.`);
  if (!TRIGGER_KINDS.includes(raw.kind as TriggerKind)) errors.push(`${where}: "kind" must be one of ${TRIGGER_KINDS.join(', ')}.`);
  const at = point(raw.at);
  const size = raw.size === undefined ? { x: 1, y: 1 } : point(raw.size);
  if (!at || !Number.isInteger(at.x) || !Number.isInteger(at.y)) errors.push(`${where}: "at" must be [x, y], a tile.`);
  if (!size || !Number.isInteger(size.x) || !Number.isInteger(size.y) || size.x < 1 || size.y < 1) errors.push(`${where}: "size" must be [w, h], whole numbers of at least 1.`);
  const back = raw.back === undefined ? null : point(raw.back);
  if (raw.back !== undefined && !back) errors.push(`${where}: "back" must be [x, y].`);
  if (back && !tileAt(ground, Math.floor(back.x), Math.floor(back.y))) errors.push(`${where}: "back" (${back.x}, ${back.y}) is not on a tile.`);
  const slot = raw.slot === undefined ? null : (raw.slot as number);
  if (slot !== null && !(Number.isInteger(slot) && slot >= 0 && slot <= 2)) errors.push(`${where}: "slot" must be 0, 1 or 2.`);
  if (!at || !size) return null;
  for (let y = at.y; y < at.y + size.y; y++) for (let x = at.x; x < at.x + size.x; x++) if (!tileAt(ground, x, y)) errors.push(`${where}: tile (${x}, ${y}) is not on the ground.`);
  return { kind: raw.kind as TriggerKind, x0: at.x, y0: at.y, x1: at.x + size.x, y1: at.y + size.y, back, slot };
}

export function parsePlace(raw: unknown): PlaceResult {
  const errors: string[] = [];
  if (!isRecord(raw)) return { ok: false, errors: ['A place must be a JSON object.'] };
  const unknown = Object.keys(raw).filter((k) => !KEYS.includes(k));
  if (unknown.length) errors.push(`Unknown field(s): ${unknown.join(', ')}.`);
  if (!PLACE_KINDS.includes(raw.kind as PlaceKind)) errors.push(`"kind" must be one of ${PLACE_KINDS.join(', ')}.`);
  if (typeof raw.name !== 'string' || !raw.name) errors.push('"name" must be a non-empty string.');
  const g = parseCourse(raw.ground);
  if (!g.ok) return { ok: false, errors: [...errors, ...g.errors.map((e) => `ground: ${e}`)] };
  const ground = g.course;

  const props: PlacedProp[] = [];
  if (raw.props !== undefined) {
    if (!Array.isArray(raw.props)) errors.push('"props" must be a list.');
    else
      raw.props.forEach((p, i) => {
        const at = isRecord(p) ? point(p.at) : null;
        if (!isRecord(p) || typeof p.id !== 'string' || !at) return void errors.push(`props[${i}]: must be { "id": ..., "at": [x, y] }.`);
        if (!PROPS.has(p.id)) errors.push(`props[${i}]: unknown prop "${p.id}".`);
        if (!tileAt(ground, Math.floor(at.x), Math.floor(at.y))) errors.push(`props[${i}] (${at.x}, ${at.y}) is not on a tile.`);
        props.push({ id: p.id, x: at.x, y: at.y });
      });
  }
  const triggers: Trigger[] = [];
  if (raw.triggers !== undefined) {
    if (!Array.isArray(raw.triggers)) errors.push('"triggers" must be a list.');
    else
      raw.triggers.forEach((t, i) => {
        const tr = parseTrigger(t, `triggers[${i}]`, ground, errors);
        if (tr) triggers.push(tr);
      });
  }
  const slots: Slot[] = [];
  if (raw.slots !== undefined) {
    if (!Array.isArray(raw.slots) || raw.slots.length !== 3) errors.push('"slots" must be a list of 3 paths, left to right.');
    else
      raw.slots.forEach((s, i) => {
        const where = `slots[${i}]`;
        if (!isRecord(s)) return void errors.push(`${where}: must be an object.`);
        const end = parseTrigger(s.end, `${where}.end`, ground, errors);
        const gate = parseTrigger(s.gate, `${where}.gate`, ground, errors);
        const gateAt = point(s.gateAt);
        const sign = point(s.sign);
        if (!gateAt) errors.push(`${where}: "gateAt" must be [x, y].`);
        if (!sign) errors.push(`${where}: "sign" must be [x, y].`);
        if (end && gate && gateAt && sign) slots.push({ end: { ...end, kind: 'path', slot: i }, gate: { ...gate, kind: 'gate', slot: i }, gateAt, sign });
      });
  }
  if (raw.kind === 'crossroads' && raw.slots === undefined) errors.push('A crossroads needs "slots".');

  // The armadillo must not arrive standing on a trigger.
  const s = ground.start;
  for (const t of triggers) if (s.x >= t.x0 && s.x < t.x1 && s.y >= t.y0 && s.y < t.y1) errors.push(`The arrival tile (${s.x}, ${s.y}) is inside a ${t.kind} trigger.`);

  if (errors.length) return { ok: false, errors };
  return { ok: true, place: { kind: raw.kind as PlaceKind, name: raw.name as string, ground, props, triggers, slots } };
}

/** Is a point inside a trigger's rectangle? */
export function inTrigger(t: Trigger, x: number, y: number): boolean {
  return x >= t.x0 && x < t.x1 && y >= t.y0 && y < t.y1;
}

/** A trigger's centre, in grid coordinates. */
export function triggerCentre(t: Trigger): Point {
  return { x: (t.x0 + t.x1) / 2, y: (t.y0 + t.y1) / 2 };
}
