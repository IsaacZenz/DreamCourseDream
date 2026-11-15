/**
 * Structure validator (Milestone 5 design sheet, section 5.1): a fast check
 * with no simulation. Walks the course tile to tile from the start:
 * - down any height is fine; up is fine across a slope or a step of at most
 *   one (a lofted shot clears it); two or more steps up is a wall;
 * - water can be crossed but not stopped on;
 * - objects never block here (the ball can go round, break, loft over or wait
 *   for them). The bot proves they can really be passed.
 */
import { GEN } from '../content/gen.ts';
import { OBJECTS } from '../content/objects.ts';
import { DIRECTIONS, DIRECTION_VECTORS, SURFACES, type Direction } from '../content/surfaces.ts';
import { tileAt, type Course, type Tile } from '../sim/course.ts';

export type StructureResult = { ok: true } | { ok: false; reason: string };

/** Corner indices (nw, ne, se, sw) along each side of a tile. */
const EDGE: Record<Direction, readonly [number, number]> = { ne: [0, 1], se: [1, 2], sw: [3, 2], nw: [0, 3] };
const OPP: Record<Direction, Direction> = { ne: 'sw', sw: 'ne', se: 'nw', nw: 'se' };

/** Can the ball get from tile a to its neighbour on side d? */
export function canStep(a: Tile, b: Tile, d: Direction): boolean {
  const [i, j] = EDGE[d];
  const [k, l] = EDGE[OPP[d]];
  const up = Math.max(b.corners[k]! - a.corners[i]!, b.corners[l]! - a.corners[j]!);
  return up <= GEN.climbSteps;
}

/** Every tile the ball can reach from the start. */
export function reachable(course: Course): Set<string> {
  const seen = new Set<string>();
  const start = tileAt(course, course.start.x, course.start.y);
  if (!start) return seen;
  const queue: Tile[] = [start];
  seen.add(`${start.x},${start.y}`);
  while (queue.length) {
    const t = queue.shift()!;
    for (const d of DIRECTIONS) {
      const [dx, dy] = DIRECTION_VECTORS[d];
      const n = tileAt(course, t.x + dx, t.y + dy);
      if (!n || seen.has(`${n.x},${n.y}`) || !canStep(t, n, d)) continue;
      seen.add(`${n.x},${n.y}`);
      queue.push(n);
    }
  }
  return seen;
}

export function checkStructure(course: Course): StructureResult {
  const seen = reachable(course);
  if (!seen.has(`${course.exit.x},${course.exit.y}`)) return { ok: false, reason: 'exit unreachable' };

  let stars = 0;
  for (const o of course.objects) {
    if (!seen.has(`${o.x},${o.y}`)) continue;
    const def = OBJECTS.get(o.id);
    if (def?.kind === 'enemy') stars += def.starValue;
    else if (def?.kind === 'breakable' && def.breakBy === 'hit') stars += (o.drops ?? def.drops).filter((d) => d === 'yellow-star').length;
    else if (def?.kind === 'pickup' && def.effect === 'yellowStar') stars++;
  }
  if (stars < course.quota) return { ok: false, reason: 'too few reachable stars' };

  let rest = 0;
  const r = GEN.exitRestRange;
  for (let y = course.exit.y - r; y <= course.exit.y + r; y++) {
    for (let x = course.exit.x - r; x <= course.exit.x + r; x++) {
      const t = tileAt(course, x, y);
      if (t && seen.has(`${x},${y}`) && SURFACES.get(t.surface)?.canHoldBall) rest++;
    }
  }
  if (rest < GEN.exitRestTiles) return { ok: false, reason: 'no room to stop near the exit' };
  return { ok: true };
}
