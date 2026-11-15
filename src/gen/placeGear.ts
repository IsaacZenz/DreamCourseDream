/**
 * Put a gear item on a generated course (Milestone 6 design sheet, section
 * 5.7): near the end of the trail, on ground that can hold the ball, reachable
 * from the start, off the start, the exit, rails and other objects. Gear costs
 * no budget. Deterministic: same course and seed, same spot.
 */
import { SURFACES } from '../content/surfaces.ts';
import { parseCourse, railTileList, tileAt, type Course } from '../sim/course.ts';
import { Rng } from '../sim/rng.ts';
import { distancesTo, reachable } from './structure.ts';

/** Share of the reachable ground nearest the exit that the item may be placed on. */
const NEAR_END = 0.3;

/** The course file with the item added, and the parsed course; or the course unchanged if there is no room. */
export function placeGear(raw: Record<string, unknown>, course: Course, item: string, seed: string): { raw: Record<string, unknown>; course: Course } {
  const rng = Rng.fromSeed(seed).fork('placegear');
  const reach = reachable(course);
  const dist = distancesTo(course, course.exit.x, course.exit.y);
  const taken = new Set(course.objects.map((o) => `${o.x},${o.y}`));
  for (const line of course.rails) for (const t of railTileList(line)) taken.add(`${t.x},${t.y}`);
  taken.add(`${course.start.x},${course.start.y}`);
  taken.add(`${course.exit.x},${course.exit.y}`);
  const spots: { x: number; y: number; d: number }[] = [];
  for (let y = 0; y < course.height; y++) {
    for (let x = 0; x < course.width; x++) {
      const t = tileAt(course, x, y);
      const d = dist[y * course.width + x]!;
      if (!t || !reach.has(`${x},${y}`) || taken.has(`${x},${y}`) || !Number.isFinite(d) || d < 2) continue;
      if (!SURFACES.get(t.surface)?.canHoldBall) continue;
      spots.push({ x, y, d });
    }
  }
  if (!spots.length) return { raw, course };
  spots.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const near = spots.slice(0, Math.max(1, Math.ceil(spots.length * NEAR_END)));
  const at = rng.pick(near);
  const objects = [...((raw.objects as unknown[]) ?? []), { id: item, at: [at.x, at.y] }];
  const out = { ...raw, objects };
  const parsed = parseCourse(out);
  return parsed.ok ? { raw: out, course: parsed.course } : { raw, course };
}
