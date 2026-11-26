/** Owner, 2026-11-26: the blast-door hatch (course exit and crossroads arrival) and the crossroads start spot. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCrossroads } from '../src/gen/crossroads';
import { tileAt } from '../src/sim/course';

const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8'));

describe('blast-door hatch', () => {
  it('the exit sprite has locked, lit and opening frames', () => {
    expect(manifest.sprites.exit.frames).toEqual(['closed', 'lit-a', 'lit-b', 'opening-1', 'opening-2', 'open']);
  });

  for (const count of [1, 2, 3]) {
    it(`crossroads with ${count} path(s): the hero starts one tile up from the middle, on the path, on the hatch`, () => {
      const x = buildCrossroads({ seed: `hatch/${count}`, count, boss: null });
      const s = x.place.ground.start;
      expect(s).toEqual({ x: 5, y: 5 });
      expect(tileAt(x.place.ground, s.x, s.y)?.surface).toBe('path');
      const hatch = x.place.props.filter((p) => p.id === 'arrival-hatch');
      expect(hatch).toEqual([{ id: 'arrival-hatch', x: 5.5, y: 5.5 }]);
      expect(x.place.ground.objects.some((o) => o.x === s.x && o.y === s.y)).toBe(false);
    });
  }
});
