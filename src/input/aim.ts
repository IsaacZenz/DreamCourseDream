/**
 * Turns mouse positions into shot settings. Pure functions, no Phaser, so they
 * can be unit tested. Screen positions here are world pixels (the camera
 * scroll already applied), in the same space as render/iso.ts `project`.
 */
import { HALF_H, HALF_W, STEP_PX } from '../render/iso.ts';

/** The grid point under a screen point, assuming it lies at height h (steps). Inverse of `project`. */
export function screenToGrid(sx: number, sy: number, h: number): { gx: number; gy: number } {
  const a = sx / HALF_W; // gx - gy
  const b = (sy + h * STEP_PX) / HALF_H; // gx + gy
  return { gx: (a + b) / 2, gy: (b - a) / 2 };
}

/** Grid direction (radians) from the ball towards the mouse, measured at the ball's height. */
export function aimAngle(ball: { x: number; y: number; hSteps: number }, mouse: { x: number; y: number }): number {
  const g = screenToGrid(mouse.x, mouse.y, ball.hSteps);
  return Math.atan2(g.gy - ball.y, g.gx - ball.x);
}

/**
 * The sweeping power meter: rises from 0 to 1 then falls back, over `period`
 * seconds, and repeats while the button is held.
 */
export function meterPower(heldSeconds: number, period: number): number {
  const phase = (heldSeconds / period) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/**
 * Drag-power mode (a slingshot): press anywhere, pull back, release. The shot
 * goes the opposite way to the pull. Power grows with the pull distance on
 * screen, up to full at `fullPx`.
 */
export function dragShot(
  press: { x: number; y: number },
  now: { x: number; y: number },
  ballHSteps: number,
  fullPx: number,
): { angle: number; power: number } {
  const dx = press.x - now.x;
  const dy = press.y - now.y;
  const a = screenToGrid(0, 0, ballHSteps);
  const b = screenToGrid(dx, dy, ballHSteps);
  return { angle: Math.atan2(b.gy - a.gy, b.gx - a.gx), power: Math.min(1, Math.hypot(dx, dy) / fullPx) };
}

/** Spin is chosen in steps from -2 to 2; the simulation takes -1 to 1. */
export const SPIN_LEVELS = 2;
export function spinValue(level: number): number {
  return Math.max(-1, Math.min(1, level / SPIN_LEVELS));
}
