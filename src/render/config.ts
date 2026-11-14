/** Internal resolution in pixels. Everything is drawn at this size, then scaled up. See DESIGN.md section 4. */
export const VIEW_WIDTH = 384;
export const VIEW_HEIGHT = 216;

/**
 * The largest whole-number scale that fits the window. Whole numbers keep every
 * game pixel the same size on screen, so the pixel art stays sharp. Never below 1.
 */
export function integerScale(windowWidth: number, windowHeight: number): number {
  return Math.max(1, Math.floor(Math.min(windowWidth / VIEW_WIDTH, windowHeight / VIEW_HEIGHT)));
}
