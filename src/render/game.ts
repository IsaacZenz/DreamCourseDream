import Phaser from 'phaser';
import { CourseScene } from './CourseScene';
import { MapScene } from './MapScene';
import { TownScene } from './TownScene';
import { BurrowScene } from './BurrowScene';
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
    // Milestone 7: the game opens on the Burrow (owner, 2026-11-17, question 9).
    scene: [BurrowScene, CourseScene, MapScene, TownScene],
  });

  window.addEventListener('resize', () => {
    game.scale.setZoom(integerScale(window.innerWidth, window.innerHeight));
  });

  return game;
}
