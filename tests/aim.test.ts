import { describe, expect, it } from 'vitest';
import { aimAngle, dragShot, meterPower, screenToGrid } from '../src/input/aim';
import { project } from '../src/render/iso';

describe('aiming', () => {
  it('screenToGrid undoes project', () => {
    for (const [gx, gy, h] of [
      [0, 0, 0],
      [3.25, 7.5, 2],
      [10, 1, 5],
    ] as const) {
      const p = project(gx, gy, h);
      const g = screenToGrid(p.x, p.y, h);
      expect(g.gx).toBeCloseTo(gx, 9);
      expect(g.gy).toBeCloseTo(gy, 9);
    }
  });

  it('points the shot at the mouse', () => {
    const ball = { x: 4, y: 4, hSteps: 1 };
    const target = project(7, 4, 1); // straight along +x
    expect(aimAngle(ball, target)).toBeCloseTo(0, 9);
    const down = project(4, 9, 1); // straight along +y
    expect(aimAngle(ball, down)).toBeCloseTo(Math.PI / 2, 9);
  });

  it('the meter sweeps up then down', () => {
    expect(meterPower(0, 2)).toBe(0);
    expect(meterPower(0.5, 2)).toBeCloseTo(0.5);
    expect(meterPower(1, 2)).toBeCloseTo(1);
    expect(meterPower(1.5, 2)).toBeCloseTo(0.5);
    expect(meterPower(2, 2)).toBeCloseTo(0);
  });

  it('drag mode shoots opposite the pull, with power from distance', () => {
    // Pull towards screen upper-left, which is grid -x... the shot goes the other way (+x on screen lower-right).
    const press = project(0, 0, 0);
    const pulled = project(-1, 0, 0);
    const r = dragShot(press, pulled, 0, 100);
    expect(r.angle).toBeCloseTo(0, 9);
    expect(r.power).toBeCloseTo(Math.hypot(16, 8) / 100, 9);
    expect(dragShot(press, project(-50, 0, 0), 0, 100).power).toBe(1);
  });
});
