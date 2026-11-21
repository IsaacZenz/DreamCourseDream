/**
 * Milestone 8b (sheet docs/plans/milestone-8b.md, signed off by the owner
 * 2026-11-21 with all defaults): walking, place files and the crossroads.
 */
import { describe, expect, it } from 'vitest';
import { PLACE_FILES, townFor } from '../src/content/places/index';
import { WALK } from '../src/content/places';
import { parsePlace, inTrigger, type Place, type Trigger } from '../src/sim/place';
import { canStand, createWalker, groundDirection, stepWalker, walkHeight, type WalkInput } from '../src/sim/walk';
import { buildCrossroads, loadPlace, slotsFor } from '../src/gen/crossroads';
import { parseCourse } from '../src/sim/course';
import practice from '../src/content/courses/practice-green.json';

const DT = 1 / 60;
const run = (place: Place, w: ReturnType<typeof createWalker>, input: WalkInput, seconds: number, triggers: readonly Trigger[] = place.triggers) => {
  const fired: Trigger[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) fired.push(...stepWalker(place, w, input, DT, triggers));
  return fired;
};

/** A tiny test place: a row of tiles with given surface letters and heights. */
function strip(tokens: string[], extra: Record<string, unknown> = {}): Place {
  const res = parsePlace({
    kind: 'town',
    name: 'test',
    ground: { format: 3, name: 't', legend: { g: 'grass', w: 'water', p: 'path' }, tiles: [tokens.join(' '), tokens.join(' '), tokens.join(' ')], start: [0, 1], exit: [1, 1], quota: 0, ...extra },
  });
  if (!res.ok) throw new Error(res.errors.join(' '));
  return res.place;
}

/** Every point the armadillo can reach from its arrival spot, on a 0.25-tile grid. */
function reachable(place: Place): { x: number; y: number }[] {
  const s = place.ground.start;
  const key = (i: number, j: number) => `${i},${j}`;
  const at = (i: number) => i * 0.25 + 0.125;
  const start = [Math.floor((s.x + 0.5) * 4), Math.floor((s.y + 0.5) * 4)] as const;
  const seen = new Set([key(...start)]);
  const queue: (readonly [number, number])[] = [start];
  const out: { x: number; y: number }[] = [];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    out.push({ x: at(i), y: at(j) });
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      if (seen.has(key(ni, nj))) continue;
      if (!canStand(place, at(ni), at(nj), walkHeight(place, at(i), at(j)))) continue;
      seen.add(key(ni, nj));
      queue.push([ni, nj]);
    }
  }
  return out;
}

describe('Milestone 8b: place files', () => {
  it('every place file is valid', () => {
    for (const [id, data] of Object.entries(PLACE_FILES)) {
      const res = parsePlace(data);
      expect(res.ok ? [] : res.errors, id).toEqual([]);
    }
  });

  it('the practice green is a valid course', () => {
    const res = parseCourse(practice);
    expect(res.ok ? [] : res.errors).toEqual([]);
  });

  it('every town door, the tee and the exit can be walked to from the arrival spot', () => {
    for (const id of ['town-meadow', 'town-bog', 'town-thornwood']) {
      const place = loadPlace(id);
      const pts = reachable(place);
      for (const t of place.triggers) expect(pts.some((p) => inTrigger(t, p.x, p.y)), `${id} ${t.kind}`).toBe(true);
      // And every "back" spot is somewhere it can stand.
      for (const t of place.triggers) if (t.back) expect(canStand(place, t.back.x, t.back.y), `${id} ${t.kind} back`).toBe(true);
    }
  });

  it('towns: regions 1 to 3 use their biome; endless picks one from the seed', () => {
    expect([1, 2, 3].map((r) => townFor(r, 'S'))).toEqual(['town-meadow', 'town-bog', 'town-thornwood']);
    expect(townFor(5, 'S')).toBe(townFor(5, 'S'));
    expect(['town-meadow', 'town-bog', 'town-thornwood']).toContain(townFor(7, 'X'));
  });
});

describe('Milestone 8b: walking', () => {
  it('up on the keyboard is up on the screen, at WALK.speed tiles a second along the ground', () => {
    const up = groundDirection(0, -1)!;
    expect(up.gx).toBeCloseTo(-Math.SQRT1_2);
    expect(up.gy).toBeCloseTo(-Math.SQRT1_2);
    const right = groundDirection(1, 0)!;
    expect(right.gx).toBeCloseTo(Math.SQRT1_2);
    expect(right.gy).toBeCloseTo(-Math.SQRT1_2);
    const place = strip(Array(12).fill('g2'));
    const w = createWalker(1.5, 1.5);
    run(place, w, { sx: 1, sy: 1, run: false }, 1); // screen down-right is grid +x
    expect(w.x).toBeCloseTo(1.5 + WALK.speed, 1);
    expect(w.y).toBeCloseTo(1.5, 5);
    expect(w.facing).toBe('dr');
  });

  it('Shift runs faster', () => {
    const place = strip(Array(12).fill('g2'));
    const w = createWalker(1.5, 1.5);
    run(place, w, { sx: 1, sy: 1, run: true }, 1);
    expect(w.x).toBeCloseTo(1.5 + WALK.speed * WALK.runFactor, 1);
  });

  it('stops at the edge of the place, and at water', () => {
    const edge = strip(Array(6).fill('g2'));
    const w = createWalker(1.5, 1.5);
    run(edge, w, { sx: 1, sy: 1, run: false }, 3);
    expect(w.x).toBeLessThan(6);
    expect(w.x).toBeGreaterThan(5.5);
    const pond = strip(['g2', 'g2', 'g2', 'w2', 'g2']);
    const w2 = createWalker(0.5, 1.5);
    run(pond, w2, { sx: 1, sy: 1, run: false }, 3);
    expect(w2.x).toBeLessThan(3);
  });

  it('walks up a 1-step rise but not a 2-step one', () => {
    const one = strip(['g2', 'g2', 'g3', 'g3', 'g3']);
    const w = createWalker(0.5, 1.5);
    run(one, w, { sx: 1, sy: 1, run: false }, 2);
    expect(w.x).toBeGreaterThan(4);
    const two = strip(['g2', 'g2', 'g4', 'g4', 'g4']);
    const w2 = createWalker(0.5, 1.5);
    run(two, w2, { sx: 1, sy: 1, run: false }, 2);
    expect(w2.x).toBeLessThan(2);
    // And not down a 2-step drop either.
    const w3 = createWalker(3.5, 1.5);
    run(two, w3, { sx: -1, sy: -1, run: false }, 2);
    expect(w3.x).toBeGreaterThan(2);
  });

  it('slides along a wall instead of sticking to it', () => {
    // A fence along grid y = 1 (centres); walking at 45 degrees into it keeps going along x.
    const place = strip(Array(10).fill('g2'), { rails: [[[0, 0], [9, 0]]] });
    const w = createWalker(5.5, 1.2);
    run(place, w, { sx: 0, sy: -1, run: false }, 0.5); // screen up: grid (-1, -1); blocked in y, slides in x
    expect(w.y).toBeGreaterThan(0.6);
    expect(w.x).toBeCloseTo(5.5 - 0.5 * WALK.speed * Math.SQRT1_2, 1);
  });

  it('bumps into props and blockers', () => {
    const place = strip(Array(10).fill('g2'), { objects: [{ id: 'rock', at: [4, 1] }] });
    const w = createWalker(1.5, 1.5);
    run(place, w, { sx: 1, sy: 1, run: false }, 2);
    expect(w.x).toBeLessThan(4.5 - 0.38);
  });

  it('a trigger fires once per step onto it', () => {
    const res = parsePlace({
      kind: 'town',
      name: 'test',
      ground: { format: 3, name: 't', legend: { g: 'grass' }, tiles: ['g2 g2 g2 g2 g2 g2'], start: [0, 0], exit: [5, 0], quota: 0 },
      triggers: [{ kind: 'food', at: [3, 0] }],
    });
    if (!res.ok) throw new Error(res.errors.join(' '));
    const place = res.place;
    const w = createWalker(0.5, 0.5, 'dr', place.triggers);
    const right = { sx: 1, sy: 1, run: false };
    const left = { sx: -1, sy: -1, run: false };
    expect(run(place, w, right, 1.1).length).toBe(1); // onto it (x about 3.8)
    expect(run(place, w, { sx: 0, sy: 0, run: false }, 1).length).toBe(0); // standing still on it
    expect(run(place, w, left, 0.5).length).toBe(0); // off it
    expect(run(place, w, right, 0.5).length).toBe(1); // and on again
  });
});

describe('Milestone 8b: the crossroads', () => {
  it('uses the left, middle and right paths as choices allow', () => {
    expect(slotsFor(1)).toEqual([1]);
    expect(slotsFor(2)).toEqual([0, 2]);
    expect(slotsFor(3)).toEqual([0, 1, 2]);
  });

  it('is the same for the same seed and different for another', () => {
    const a = buildCrossroads({ seed: 'RUN/node-4', count: 3, boss: null });
    const b = buildCrossroads({ seed: 'RUN/node-4', count: 3, boss: null });
    const c = buildCrossroads({ seed: 'RUN/node-5', count: 3, boss: null });
    expect(b.place).toEqual(a.place);
    expect(c.place.ground.objects).not.toEqual(a.place.ground.objects);
  });

  it('has one signpost and one path end per choice, and a boss gate on the boss path', () => {
    const x = buildCrossroads({ seed: 'S', count: 2, boss: 1 });
    expect(x.signs.length).toBe(2);
    expect(x.place.props.filter((p) => p.id === 'signpost').length).toBe(2);
    expect(x.place.props.filter((p) => p.id === 'boss-gate').length).toBe(1);
    expect(x.place.triggers.map((t) => [t.kind, t.slot])).toEqual([
      ['path', 0],
      ['gate', 1],
    ]);
  });

  it('every path end and boss gate can be walked to (60 crossroads)', () => {
    for (let i = 0; i < 20; i++) {
      for (const count of [1, 2, 3]) {
        const x = buildCrossroads({ seed: `walk-${i}`, count, boss: i % 3 === 0 ? count - 1 : null });
        const pts = reachable(x.place);
        for (const t of x.place.triggers) expect(pts.some((p) => inTrigger(t, p.x, p.y)), `seed ${i}, ${count} paths, ${t.kind} ${t.slot}`).toBe(true);
      }
    }
  });
});
