import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEST_COURSES } from '../src/content/courses';
import { SURFACES } from '../src/content/surfaces';
import { parseCourse, type Course } from '../src/sim/course';
import { SHAPES } from '../src/sim/tileShape';
import { buildDrawList, faceBands, pickTile, project } from '../src/render/iso';
import type { Manifest } from '../src/render/manifest';

const manifest = JSON.parse(readFileSync('assets/manifest.json', 'utf8')) as Manifest;

function course(tiles: string[]): Course {
  const r = parseCourse({ format: 1, name: 't', legend: { g: 'grass' }, tiles, start: [0, 0], exit: [1, 0], quota: 0 });
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.course;
}

describe('project', () => {
  it('uses 32x16 diamonds and 8-pixel height steps', () => {
    expect(project(0, 0, 0)).toEqual({ x: 0, y: 0 });
    expect(project(1, 0, 0)).toEqual({ x: 16, y: 8 });
    expect(project(0, 1, 0)).toEqual({ x: -16, y: 8 });
    expect(project(0, 0, 1)).toEqual({ x: 0, y: -8 });
  });
});

describe('faceBands', () => {
  it('draws nothing when the neighbour is as high or higher', () => {
    expect(faceBands(1, 1, 1, 1)).toEqual([]);
    expect(faceBands(1, 1, 2, 2)).toEqual([]);
  });
  it('draws one band per step of drop', () => {
    expect(faceBands(3, 3, 0, 0)).toEqual([
      { k: 0, frame: 'full' },
      { k: 1, frame: 'full' },
      { k: 2, frame: 'full' },
    ]);
  });
  it('adds a triangle cap under a sloped edge', () => {
    expect(faceBands(2, 1, 0, 0)).toEqual([
      { k: 0, frame: 'full' },
      { k: 1, frame: 'capA' },
    ]);
    expect(faceBands(1, 2, 1, 1)).toEqual([{ k: 1, frame: 'capB' }]);
  });
});

describe('draw list', () => {
  it('only draws faces on lower front edges', () => {
    const c = course(['g1 g0', 'g0 g0']);
    const faces = buildDrawList(c).filter((p) => p.kind === 'face');
    // The raised tile (0,0) gets one face on each front edge; edge tiles get floor skirts.
    const raised = faces.filter((f) => f.tile.x === 0 && f.tile.y === 0);
    expect(raised.map((f) => f.sprite).sort()).toEqual(['face-earth-left', 'face-earth-right']);
    // No faces between equal-height neighbours inside the course.
    expect(faces.some((f) => f.tile.x === 0 && f.tile.y === 1 && f.sprite.endsWith('right'))).toBe(false);
  });

  for (const file of TEST_COURSES) {
    const r = parseCourse(file.data);
    if (!r.ok) continue;
    const list = buildDrawList(r.course, { ball: { gx: r.course.start.x + 0.5, gy: r.course.start.y + 0.5 } });

    it(`${file.id}: every sprite and frame it uses is in the manifest`, () => {
      for (const p of list) {
        const entry = manifest.sprites[p.sprite];
        expect(entry, p.sprite).toBeDefined();
        expect(entry!.frames, `${p.sprite}:${p.frame}`).toContain(p.frame);
      }
    });

    it(`${file.id}: tiles further forward are always drawn later`, () => {
      const tops = list.filter((p) => p.kind === 'top');
      for (const a of tops) {
        for (const b of tops) {
          if (b.tile.x + b.tile.y > a.tile.x + a.tile.y) expect(b.depth).toBeGreaterThan(a.depth);
        }
      }
      // A tile's faces are drawn before its top, and the ball after its tile.
      const ball = list.find((p) => p.kind === 'ball')!;
      const ballTop = tops.find((t) => t.tile.x === ball.tile.x && t.tile.y === ball.tile.y)!;
      expect(ball.depth).toBeGreaterThan(ballTop.depth);
    });
  }
});

describe('manifest', () => {
  it('has every shape for every surface, and both faces', () => {
    for (const s of SURFACES.values()) {
      expect(manifest.sprites[s.tileSprite]?.frames).toEqual([...SHAPES]);
      expect(manifest.sprites[`${s.faceSprite}-left`]).toBeDefined();
      expect(manifest.sprites[`${s.faceSprite}-right`]).toBeDefined();
    }
  });
});

describe('pickTile', () => {
  it('finds the tile under a screen point, preferring the front one', () => {
    const c = course(['g0 g0', 'g0 g3']);
    const centre = project(0.5, 0.5, 0);
    expect(pickTile(c, centre.x, centre.y)).toMatchObject({ x: 0, y: 0 });
    // Screen point (0, 4) lies on both (0,0)'s top and the tall tile (1,1)'s top.
    // (1,1) is in front, so it wins.
    expect(pickTile(c, 0, 4)).toMatchObject({ x: 1, y: 1 });
    expect(pickTile(c, 500, 500)).toBeNull();
  });
});
