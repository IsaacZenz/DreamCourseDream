/**
 * Where the run goes next (Milestone 8b): walking places by default, or the
 * old map screen and town street when the U panel's "use the map screen"
 * switch is on (a testing view; sheet section 3.1).
 */
import type Phaser from 'phaser';
import { session } from './runSession';
import { getPanel } from './shared';

/** Is the run played by walking (the default), rather than on the map screen? */
export function walking(): boolean {
  return !getPanel().useMapScreen;
}

/** Start the scene for where the run is now. */
export function goRun(scene: Phaser.Scene): void {
  const run = session.run;
  if (!run) return void scene.scene.start('burrow');
  if (run.status === 'course') return void scene.scene.start('course', { run: true });
  if (!walking()) return void scene.scene.start(run.status === 'shop' || run.status === 'cache' ? 'town' : 'map');
  if (run.status === 'shop') return void scene.scene.start('place', { kind: 'town' });
  if (run.status === 'cache') return void scene.scene.start('place', { kind: 'cache' });
  if (run.status === 'map') return void scene.scene.start('place', { kind: 'crossroads' });
  scene.scene.start('map');
}
