/**
 * Milestone 8 round 3 (sheet docs/plans/milestone-8-round-3.md, signed off by
 * the owner 2026-11-22: pockets 17 and characters 21 blue stars, rest defaults).
 */
import { describe, expect, it } from 'vitest';
import { generateRunMap } from '../src/gen/runMap';
import { choices, createRun, enterNode, leaveShop, leaveCache, mapVisible, type RunState } from '../src/sim/run';

/** Step past whatever the node is, without playing it (enough for map tests). */
function skip(run: RunState): void {
  if (run.status === 'shop') leaveShop(run);
  else if (run.status === 'cache') leaveCache(run);
  else run.status = 'map';
}

describe('Round 3: the map shows only your next choices', () => {
  it('at the start: only the first row', () => {
    const run = createRun('MAPVIS', generateRunMap('MAPVIS'));
    const seen = mapVisible(run);
    expect([...seen].sort()).toEqual(run.map.rows[0]!.map((n) => n.id).sort());
  });

  it('after some steps: the path taken and the next choices, nothing else', () => {
    const run = createRun('MAPVIS2', generateRunMap('MAPVIS2'));
    for (let i = 0; i < 3; i++) {
      enterNode(run, choices(run)[0]!.id);
      skip(run);
    }
    const seen = mapVisible(run);
    const expected = new Set([...run.path, ...choices(run).map((n) => n.id)]);
    expect(seen).toEqual(expected);
    const all = run.map.rows.flat().length;
    expect(seen.size).toBeLessThan(all);
  });
});
