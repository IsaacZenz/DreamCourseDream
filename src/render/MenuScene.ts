import Phaser from 'phaser';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { pixelText } from './pixelText';
import { abandonRun, continueRun, newRunSeed, session, startRun } from './runSession';
import { breakSave } from '../save/save';
import { getPanel, preloadAssets, shared } from './shared';

const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const GOOD = 0x80f080;
const BAD = 0xff8080;
const SELECT = 0xf8d030;
const BLUE = 0x80c0ff;

/** Address parameters that go straight to a course and skip the menu (testing). */
const SKIP_PARAMS = ['course', 'run', 'boss', 'bench', 'seed', 'budget', 'thumb', 'debug'];

type Item = { id: 'continue' | 'new' | 'hub'; label: string };

/**
 * The start menu (owner, 2026-11-16: the real game opens on a proper start
 * menu). A plain placeholder until the finished title screen in Milestone 9.
 * Continue run (when a run is saved at a town), New run, Upgrades (the hub).
 * Keys 1 to 6 still go to the test courses.
 */
export class MenuScene extends Phaser.Scene {
  private sel = 0;
  private confirm = false;
  private message = '';

  constructor() {
    super('menu');
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    preloadAssets(this);
    const q = new URLSearchParams(window.location.search);
    const hash = window.location.hash.slice(1);
    if (!this.registry.get('menuShown') && (SKIP_PARAMS.some((k) => q.has(k)) || hash)) {
      this.registry.set('menuShown', true);
      this.scene.start('course');
      return;
    }
    this.registry.set('menuShown', true);
    this.cameras.main.setBackgroundColor('#1d2b53');
    this.confirm = false;
    this.sel = 0;
    this.setupKeys();
    getPanel().setAids('Testing aids (start menu)', [
      {
        label: '+10 blue stars (stashed)',
        onClick: () => {
          session.profile.stash += 10;
          this.redraw();
        },
      },
      { label: 'Break the save (reload to see the fallback)', onClick: () => breakSave() },
    ]);
    this.redraw();
  }

  private items(): Item[] {
    const out: Item[] = [];
    if (session.saved) out.push({ id: 'continue', label: 'CONTINUE RUN' });
    out.push({ id: 'new', label: 'NEW RUN' }, { id: 'hub', label: 'UPGRADES' });
    return out;
  }

  private redraw(): void {
    this.children.removeAll(true);
    const m = shared.manifest;
    const g = this.add.graphics();
    // A strip of checkered grass and a rolling ball, in the game's pixel style.
    for (let y = 150; y < VIEW_HEIGHT; y += 8) for (let x = 0; x < VIEW_WIDTH; x += 8) g.fillStyle(((x + y) / 8) % 2 ? 0x58a848 : 0x4c9840, 1).fillRect(x, y, 8, 8);
    const ball = this.add.image(40, 148, 'ball', 0).setOrigin(0.5, 1).setScale(2);
    this.tweens.add({ targets: ball, x: VIEW_WIDTH - 40, duration: 4000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // No name chosen yet (DESIGN.md open question 9): a plain stand-in title.
    const title = pixelText(this, m, 0, 0, 'UNTITLED GOLF ROGUELIKE', { color: SELECT });
    title.setScale(2).setPosition(Math.round((VIEW_WIDTH - title.width * 2) / 2), 22);
    const sub = pixelText(this, m, 0, 0, 'A PLACEHOLDER START MENU', { color: UI_DIM });
    sub.setPosition(Math.round((VIEW_WIDTH - sub.width) / 2), 40);
    this.items().forEach((it, i) => {
      const t = pixelText(this, m, 0, 0, `${i === this.sel ? '> ' : '  '}${it.label}`, { color: i === this.sel ? SELECT : UI_TEXT, background: UI_BG, padding: 2 });
      t.setPosition(Math.round((VIEW_WIDTH - t.width) / 2), 62 + i * 14);
      const hit = this.add.rectangle(t.x, t.y, t.width, t.height, 0, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.sel = i;
        this.choose();
      });
    });
    const p = session.profile;
    const info: [string, number][] = [[`BLUE STARS TO SPEND: ${p.stash}`, BLUE]];
    const lr = p.lastRun;
    if (lr?.result === 'left') info.push(['YOUR LAST RUN ENDED WHEN YOU LEFT THE GAME AWAY FROM A TOWN.', BAD]);
    else if (lr) info.push([`LAST RUN: ${lr.result === 'won' ? 'COMPLETE!' : 'ENDED'} IN REGION ${lr.region}, ROW ${lr.row}. ${lr.blueStashed} BLUE STASHED${lr.blueLost ? `, ${lr.blueLost} LOST` : ''}`, lr.result === 'won' ? GOOD : UI_DIM]);
    if (session.notice) info.push([session.notice, BAD]);
    if (this.message) info.push([this.message, BAD]);
    info.forEach(([s, c], i) => {
      const t = pixelText(this, m, 0, 0, s, { color: c, background: UI_BG });
      t.setPosition(Math.round((VIEW_WIDTH - t.width) / 2), 110 + i * 9);
    });
    if (this.confirm) {
      const t = pixelText(this, m, 0, 0, 'ABANDON YOUR SAVED RUN?\nBLUE STARS IT CARRIES ARE LOST.\n\nENTER: ABANDON AND START   ESC: KEEP IT', { color: UI_TEXT, background: UI_BG, padding: 6 });
      t.setPosition(Math.round((VIEW_WIDTH - t.width) / 2), 70).setDepth(10);
    }
    pixelText(this, m, 3, VIEW_HEIGHT - 8, 'UP/DOWN: CHOOSE  ENTER: GO  1-6: TEST COURSES  U: TEST PANEL', { color: UI_DIM, background: UI_BG });
  }

  private choose(): void {
    const it = this.items()[this.sel];
    if (!it) return;
    session.notice = null;
    if (it.id === 'continue') {
      const run = continueRun();
      if (!run) {
        this.message = 'THE SAVED RUN COULD NOT BE READ.';
        this.sel = 0;
        this.redraw();
        return;
      }
      this.scene.start('town');
    } else if (it.id === 'new') {
      if (session.saved && !this.confirm) {
        this.confirm = true;
        this.redraw();
        return;
      }
      this.confirm = false;
      if (session.saved) abandonRun();
      startRun(newRunSeed());
      this.scene.start('map');
    } else this.scene.start('hub');
  }

  private setupKeys(): void {
    const kb = this.input.keyboard!;
    const move = (d: number) => () => {
      if (this.confirm) return;
      const n = this.items().length;
      this.sel = (this.sel + d + n) % n;
      this.redraw();
    };
    kb.on('keydown-UP', move(-1));
    kb.on('keydown-W', move(-1));
    kb.on('keydown-DOWN', move(1));
    kb.on('keydown-S', move(1));
    kb.on('keydown-ENTER', () => this.choose());
    kb.on('keydown-SPACE', () => this.choose());
    kb.on('keydown-ESC', () => {
      this.confirm = false;
      this.redraw();
    });
    kb.on('keydown-U', () => getPanel().toggle());
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'].forEach((k, i) => kb.on(`keydown-${k}`, () => this.scene.start('course', { courseIndex: i })));
    kb.on('keydown-SIX', () => this.scene.start('course', { courseIndex: 5 }));
  }
}
