/**
 * The test bench (owner request, 2026-11-14): a blank flat course with one
 * thing at its centre, chosen in the tuning panel (U), so each enemy, obstacle
 * and ability can be tried on its own. Built as ordinary course data.
 */
import { OBJECTS } from '../objects.ts';

export const BENCH_ID = 'test-bench';
const SIZE = 15;
const CENTRE = 7;

export interface BenchChoice {
  /** Object id, with ":drift" for a drifting cloud. */
  readonly id: string;
  readonly label: string;
}

/** Everything that can stand at the centre: enemies first, then obstacles. */
export function benchChoices(): BenchChoice[] {
  const out: BenchChoice[] = [{ id: '', label: '(nothing)' }];
  const defs = [...OBJECTS.values()].filter((d) => !d.id.startsWith('t-'));
  for (const d of defs) if (d.kind === 'enemy') out.push({ id: d.id, label: `Enemy: ${d.name}` });
  for (const d of defs) {
    if (d.kind === 'mover' || d.kind === 'breakable' || d.kind === 'blocker') out.push({ id: d.id, label: `Obstacle: ${d.name}` });
    if (d.kind === 'cloud') {
      out.push({ id: d.id, label: `Obstacle: ${d.name} (still)` });
      out.push({ id: `${d.id}:drift`, label: `Obstacle: ${d.name} (drifting)` });
    }
  }
  return out;
}

/** Course data for the bench with `choice` at the centre. */
export function benchCourse(choice: string): unknown {
  const tiles: string[] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: string[] = [];
    for (let x = 0; x < SIZE; x++) row.push(x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 ? 'g2' : 'g1');
    tiles.push(row.join(' '));
  }
  const [id = '', variant] = choice.split(':');
  const def = OBJECTS.get(id);
  const objects: Record<string, unknown>[] = [];
  if (def) {
    const moves = (def.kind === 'enemy' && def.behaviour.kind === 'patrol') || (def.kind === 'mover' && def.motion.kind === 'path') || variant === 'drift';
    // Moving things walk a line across the centre; everything else stands on it.
    if (moves) objects.push({ id, at: [CENTRE - 3, CENTRE], path: [[CENTRE + 3, CENTRE]] });
    else objects.push({ id, at: [CENTRE, CENTRE] });
  }
  const stars = def?.kind === 'enemy' ? def.starValue : 0;
  return {
    format: 2,
    name: `Test bench: ${def?.name ?? 'empty'}`,
    legend: { g: 'grass' },
    tiles,
    start: [CENTRE, CENTRE + 4],
    exit: [SIZE - 2, 1],
    quota: stars > 0 ? 1 : 0,
    objects,
  };
}
