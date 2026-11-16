import Phaser from 'phaser';
import { CourseScene } from './CourseScene';
import { HubScene } from './HubScene';
import { MapScene } from './MapScene';
import { MenuScene } from './MenuScene';
import { RewardScene } from './RewardScene';
import { TownScene } from './TownScene';
import { VIEW_HEIGHT, VIEW_WIDTH, integerScale } from './config';

export function startGame(parent: HTMLElement): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    backgroundColor: '#1d2b53',
    pixelArt: true,
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      zoom: integerScale(window.innerWidth, window.innerHeight),
    },
    // Owner, 2026-11-16: the game opens on the start menu.
    scene: [MenuScene, CourseScene, MapScene, TownScene, HubScene, RewardScene],
  });

  window.addEventListener('resize', () => {
    game.scale.setZoom(integerScale(window.innerWidth, window.innerHeight));
  });

  return game;
}
