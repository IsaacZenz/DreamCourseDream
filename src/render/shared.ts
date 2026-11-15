/**
 * Things every scene shares: the asset manifest, the tuning numbers and the
 * debug panel. Whichever scene starts first loads the assets.
 */
import Phaser from 'phaser';
import type { Tuning } from '../content/tuning';
import { loadTuning } from '../save/tuningStore';
import { TuningPanel } from '../ui/tuningPanel';
import type { Manifest } from './manifest';

export const shared: { manifest: Manifest; tuning: Tuning | null; panel: TuningPanel | null } = {
  manifest: { version: 1, sprites: {} },
  tuning: null,
  panel: null,
};

/** Load the manifest, then every sprite it lists. Does nothing if already loaded. */
export function preloadAssets(scene: Phaser.Scene): void {
  if (scene.cache.json.exists('manifest')) {
    shared.manifest = scene.cache.json.get('manifest') as Manifest;
    return;
  }
  scene.load.json('manifest', 'manifest.json');
  scene.load.once('filecomplete-json-manifest', () => {
    shared.manifest = scene.cache.json.get('manifest') as Manifest;
    for (const [id, entry] of Object.entries(shared.manifest.sprites)) {
      scene.load.spritesheet(id, entry.file, { frameWidth: entry.frameWidth, frameHeight: entry.frameHeight });
    }
  });
}

export function getTuning(): Tuning {
  if (!shared.tuning) shared.tuning = loadTuning();
  return shared.tuning;
}

export function getPanel(): TuningPanel {
  if (!shared.panel) {
    shared.panel = new TuningPanel(getTuning());
    if (new URLSearchParams(window.location.search).get('tune') === '1') shared.panel.toggle(true);
  }
  return shared.panel;
}
