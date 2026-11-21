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
  const out: BenchChoice[] = [{ id: '', label: '(nothing)' }, { id: 'rail', label: 'Obstacle: Guard rail' }];
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

/**
 * Course data for the bench with `choice` at the centre. Milestone 8: an
 * enemy there can be given a rank, a trait and an element (a trait it may not
 * have is left off).
 */
export function benchCourse(choice: string, extras: { rank?: string; trait?: string; element?: string } = {}): unknown {
  const tiles: string[] = [];
  for (let y = 0; y < SIZE; y++) {
    const row: string[] = [];
    for (let x = 0; x < SIZE; x++) row.push(x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1 ? 'g2' : 'g1');
    tiles.push(row.join(' '));
  }
  const [id = '', variant] = choice.split(':');
  const def = OBJECTS.get(id);
  const objects: Record<string, unknown>[] = [];
  const more: Record<string, unknown> = {};
  if (def?.kind === 'enemy' && def.behaviour.kind !== 'boss') {
    if (extras.rank) more.rank = Number(extras.rank);
    if (extras.trait && def.allowedTraits.includes(extras.trait)) more.traits = [extras.trait];
    if (extras.element) more.element = extras.element;
  }
  if (def) {
    const moves = (def.kind === 'enemy' && def.behaviour.kind === 'patrol') || (def.kind === 'mover' && def.motion.kind === 'path') || variant === 'drift';
    // Moving things walk a line across the centre; everything else stands on it.
    // Round 2b: switches, linked gates and drawbridges take a link; a gate or drawbridge comes with its switch, two tiles before it.
    const linked = def.kind === 'switch' || def.kind === 'drawbridge' || (def.kind === 'mover' && def.motion.kind === 'linked');
    if (linked) more.link = 'a';
    if (moves) objects.push({ id, at: [CENTRE - 3, CENTRE], path: [[CENTRE + 3, CENTRE]], ...more });
    else objects.push({ id, at: [CENTRE, CENTRE], ...more });
    if (linked && def.kind !== 'switch') objects.push({ id: 'switch', at: [CENTRE - 2, CENTRE], link: 'a' });
  }
  // Guard rails (Milestone 5b): a straight run, a corner and a 45-degree piece around the centre.
  const rails = id === 'rail' ? [[[3, 4], [11, 4]], [[4, 10], [4, 7], [7, 7]], [[9, 7], [11, 9]]] : undefined;
  const stars = def?.kind === 'enemy' ? def.starValue : 0;
  // Milestone 8: a boss on the bench is tried in the open; a Splitting enemy needs no special room.
  return {
    format: 2,
    name: `Test bench: ${id === 'rail' ? 'Guard rail' : (def?.name ?? 'empty')}`,
    legend: { g: 'grass' },
    tiles,
    start: [CENTRE, CENTRE + 4],
    exit: [SIZE - 2, 1],
    quota: stars > 0 ? 1 : 0,
    objects,
    ...(rails && { rails }),
  };
}
