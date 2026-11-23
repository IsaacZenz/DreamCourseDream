/**
 * Art List groups and permanent codes (docs/plans/art-pipeline.md section 3).
 *
 * A code is a group letter and a number, like G14. Once given, a code never
 * changes and is never reused, even if the sprite is removed later
 * (owner, 2026-11-23, Q1). New sprites get the next free number in their group.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const GROUPS = {
  T: 'Tiles and cliff faces',
  H: 'Hero and balls',
  E: 'Enemies',
  B: 'Bosses',
  O: 'Objects, pickups and effects',
  S: 'Scenery',
  G: 'Gear',
  I: 'Icons and UI',
  P: 'Places (town buildings, props, rooms)',
} as const;
export type GroupLetter = keyof typeof GROUPS;

/** Sprite ids named in the game's content files, with the name the game gives them. */
export interface ContentNames {
  readonly names: ReadonlyMap<string, string>;
  readonly enemies: ReadonlySet<string>;
  readonly bosses: ReadonlySet<string>;
}

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : d.name.endsWith('.ts') ? [join(dir, d.name)] : []));
}

/** Reads names from src/content by text, so the art tools need not load the game. */
export function readContentNames(root: string): ContentNames {
  const names = new Map<string, string>();
  const enemies = new Set<string>();
  const bosses = new Set<string>();
  for (const file of walk(join(root, 'src/content'))) {
    const text = readFileSync(file, 'utf8');
    const re = /\b(sprite|icon):\s*'([^']+)'/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const id = m[2]!;
      const before = text.slice(Math.max(0, m.index - 900), m.index);
      const start = Math.max(before.lastIndexOf('{\n'), before.lastIndexOf('{ '));
      const obj = before.slice(start);
      const name = /name:\s*'((?:[^'\\]|\\.)+)'/.exec(obj)?.[1] ?? /name:\s*"([^"]+)"/.exec(obj)?.[1];
      if (name && !names.has(id)) names.set(id, name.replace(/\\'/g, "'"));
      if (/kind:\s*'enemy'/.test(obj)) enemies.add(id);
    }
    // Bosses: enemies whose behaviour is a boss fight (their sprite has the boss's id).
    for (const m of text.matchAll(/kind:\s*'boss',\s*boss:\s*'([^']+)'/g)) bosses.add(m[1]!);
    // Ability carriers are made by a helper: carrier('leadgrub', 'Leadgrub', 'anchor').
    for (const m of text.matchAll(/carrier\('([^']+)',\s*'([^']+)'/g)) {
      enemies.add(m[1]!);
      if (!names.has(m[1]!)) names.set(m[1]!, m[2]!);
    }
  }
  return { names, enemies, bosses };
}

export function groupOf(id: string, c: ContentNames): GroupLetter {
  if (c.bosses.has(id)) return 'B';
  if (c.enemies.has(id)) return 'E';
  if (/^(tile-|face-)/.test(id) || id === 'water-shore' || id === 'cracked-tile') return 'T';
  if (/^(armadillo|ball)/.test(id)) return 'H';
  if (/^gear-/.test(id)) return 'G';
  if (/^(icon-|trait-|rank-|node-|upgrade-|perm-)/.test(id) || ['cursor', 'font', 'alert', 'facing-mark', 'arrow'].includes(id)) return 'I';
  if (/^(place-|town-|room-)/.test(id)) return 'P';
  if (/^scenery-/.test(id) || ['rock', 'stump', 'low-wall', 'dead-tree'].includes(id)) return 'S';
  return 'O';
}

/**
 * Sprites that are made automatically from another one and so get no code of
 * their own: "<id>-left" is the flipped copy of "<id>" when both exist.
 */
export function madeFrom(id: string, all: ReadonlySet<string>): string | null {
  if (id.endsWith('-left') && all.has(id.slice(0, -5))) return id.slice(0, -5);
  return null;
}

/** Give every base sprite id a code, keeping all codes already given. */
export function assignCodes(existing: Readonly<Record<string, string>>, ids: readonly string[], c: ContentNames): Record<string, string> {
  const codes: Record<string, string> = { ...existing };
  const taken = new Set(Object.values(codes));
  const all = new Set(ids);
  const next: Record<string, number> = {};
  for (const code of Object.keys(codes)) {
    const L = code[0]!;
    next[L] = Math.max(next[L] ?? 0, Number(code.slice(1)));
  }
  for (const id of ids) {
    if (id.includes('@') || taken.has(id) || madeFrom(id, all)) continue;
    const L = groupOf(id, c);
    next[L] = (next[L] ?? 0) + 1;
    codes[`${L}${next[L]}`] = id;
    taken.add(id);
  }
  return codes;
}

/** "G14" sorts after "G9". */
export function compareCodes(a: string, b: string): number {
  return a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : a.localeCompare(b);
}
