/**
 * The Burrow (Milestone 7 sheet section 5; owner, 2026-11-17: one home): the
 * hub screen between runs. The blue star stash, permanent upgrades, starting
 * abilities, the stored gear, and starting or continuing a run. The game
 * opens here.
 */
import Phaser from 'phaser';
import { GEAR, GEAR_CATEGORIES } from '../content/gear';
import { buyUpgrade } from '../sim/profile';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { pixelText } from './pixelText';
import { drawRows, progressRows, type MenuRow } from './progressMenu';
import { BOSS_FIGHTS, continueRun, debugBossFight, debugRegionTwo, newRunSeed, persist, resetProgress, session, startRun } from './runSession';
import { getPanel, preloadAssets, shared } from './shared';
import { damageSave, rawSave } from '../save/store';

const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const GOOD = 0x80f080;
const BAD = 0xff8080;
const BLUE = 0x80c8ff;

let openedFromUrl = false;

export class BurrowScene extends Phaser.Scene {
  private sel = 0;
  private message = '';
  private messageColor = UI_TEXT;
  private showSave = false;

  constructor() {
    super('burrow');
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    // An address that names a course or a run (?course=, ?run=, #<course id>) goes straight to it, for testing.
    if (!openedFromUrl) {
      openedFromUrl = true;
      if (window.location.search || window.location.hash) {
        this.scene.start('course');
        return;
      }
    }
    if (session.broken.length) {
      this.say('YOUR SAVE COULD NOT BE READ. A COPY HAS BEEN KEPT.', BAD);
      session.broken = [];
    }
    this.setupKeys();
    this.redraw();
    // Built once, not on every redraw: rebuilding it during a click would swallow the click.
    this.setPanel();
  }

  private say(text: string, color = UI_TEXT): void {
    this.message = text;
    this.messageColor = color;
  }

  /** Start and continue first, then the upgrades and abilities. */
  private rows(): MenuRow[] {
    const p = session.profile;
    const top: MenuRow[] = [];
    if (session.saved) {
      top.push({
        icon: 'node-shop',
        text: 'CONTINUE YOUR RUN',
        detail: `#${session.saved.seed}, REGION ${session.saved.region}, SAVED IN A TOWN`,
        dim: false,
        act: () => {
          continueRun();
          this.scene.start('town');
          return { ok: true, say: '' };
        },
      });
    }
    top.push({
      icon: 'node-course',
      text: 'START A NEW RUN',
      detail: session.saved ? 'THE SAVED RUN WILL BE LOST' : 'RUNS ARE SAVED ONLY IN TOWNS',
      dim: false,
      act: () => {
        startRun(newRunSeed());
        this.scene.start('map');
        return { ok: true, say: '' };
      },
    });
    const buy = (id: string) => {
      const err = buyUpgrade(p, id);
      if (!err) persist();
      return err;
    };
    return [...top, ...progressRows(p, buy, true)];
  }

  private redraw(): void {
    this.children.removeAll(true);
    const m = shared.manifest;
    const p = session.profile;
    // An earthy room, like the Burrow in town.
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x2a1c10, 1).setOrigin(0, 0);
    const g = this.add.graphics();
    for (let y = 16; y < VIEW_HEIGHT; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < VIEW_WIDTH; x += 23) g.fillStyle(0x3a2814, 1).fillRect(x, y, 5, 3);
    this.add.rectangle(0, 0, VIEW_WIDTH, 15, UI_BG, 0.9).setOrigin(0, 0);
    pixelText(this, m, 3, 2, 'THE BURROW: YOUR HOME', { color: GOOD });
    this.add.image(3, 8, 'star-blue', 0).setOrigin(0, 0.15).setScale(0.6);
    pixelText(this, m, 12, 8, `BLUE STARS: ${p.stash}`, { color: BLUE });
    pixelText(this, m, 96, 8, `RUNS ${p.totals.runs}  BOSSES BEATEN ${p.totals.bossWins}  BEST REGION ${p.totals.bestRegion}`, { color: UI_DIM });
    // The stored gear, top right.
    pixelText(this, m, VIEW_WIDTH - 3 * 14 - 34, 2, 'STORED', { color: UI_DIM });
    let x = VIEW_WIDTH - 3 * 14 - 2;
    for (const c of GEAR_CATEGORIES) {
      const id = session.burrow[c];
      if (id) this.add.image(x, 1, GEAR.get(id)!.icon, 0).setOrigin(0, 0);
      else this.add.rectangle(x + 1, 2, 10, 10, 0, 0).setOrigin(0, 0).setStrokeStyle(1, 0x5a4030);
      x += 14;
    }
    const rows = this.rows();
    this.sel = Math.min(this.sel, rows.length - 1);
    drawRows(this, rows, this.sel, 6, 20, VIEW_WIDTH - 12, 12, (i) => {
      this.sel = i;
      this.activate();
    });
    if (this.message) {
      const t = pixelText(this, m, 0, 0, this.message, { color: this.messageColor, background: UI_BG });
      t.setPosition(Math.round((VIEW_WIDTH - t.width) / 2), VIEW_HEIGHT - 18);
    }
    pixelText(this, m, 3, VIEW_HEIGHT - 8, 'UP/DOWN: CHOOSE  ENTER: BUY OR GO  LEFT/RIGHT: CHARACTER, ABILITY  U: TESTS  1-6: COURSES', { color: UI_DIM });
  }

  private activate(): void {
    const r = this.rows()[this.sel];
    if (!r?.act) return;
    const res = r.act();
    if (!this.scene.isActive()) return;
    this.say(res.say, res.ok ? GOOD : BAD);
    this.redraw();
  }

  private setupKeys(): void {
    const kb = this.input.keyboard!;
    const move = (d: number) => () => {
      const n = this.rows().length;
      this.sel = (this.sel + d + n) % n;
      this.message = '';
      this.redraw();
    };
    const step = (d: 1 | -1) => () => {
      const r = this.rows()[this.sel];
      if (!r?.step) return;
      r.step(d);
      persist();
      this.redraw();
    };
    kb.on('keydown-UP', move(-1));
    kb.on('keydown-W', move(-1));
    kb.on('keydown-DOWN', move(1));
    kb.on('keydown-S', move(1));
    kb.on('keydown-LEFT', step(-1));
    kb.on('keydown-A', step(-1));
    kb.on('keydown-RIGHT', step(1));
    kb.on('keydown-D', step(1));
    kb.on('keydown-ENTER', () => this.activate());
    kb.on('keydown-SPACE', () => this.activate());
    kb.on('keydown-U', () => getPanel().toggle());
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].forEach((k, i) => kb.on(`keydown-${k}`, () => this.scene.start('course', { courseIndex: i })));
  }

  /** Testing aids (sheet section 8.2). */
  private setPanel(): void {
    const panel = getPanel();
    panel.setRun(null);
    panel.setProgress({
      title: 'Burrow testing aids',
      buttons: [
        {
          label: '+10 blue stars',
          onClick: () => {
            session.profile.stash += 10;
            persist();
            this.redraw();
          },
        },
        {
          label: 'Reset upgrades and abilities',
          onClick: () => {
            resetProgress();
            this.redraw();
          },
        },
        ...[2, 3, 4].map((r) => ({
          label: `Start region ${r === 4 ? 'four (endless)' : r === 3 ? 'three' : 'two'} now`,
          onClick: () => {
            debugRegionTwo(r);
            this.scene.start('map');
          },
        })),
        {
          label: this.showSave ? 'Hide the save' : 'Show the save',
          onClick: () => {
            this.showSave = !this.showSave;
            this.setPanel();
          },
        },
        {
          label: 'Damage the save (then reload)',
          onClick: () => {
            damageSave();
            this.say('SAVE DAMAGED ON PURPOSE. RELOAD THE PAGE TO TEST.', BAD);
            this.redraw();
          },
        },
      ],
      arenas: BOSS_FIGHTS,
      onArena: (id) => {
        debugBossFight(id);
        this.scene.start('course', { run: true });
      },
      ...(this.showSave && { text: rawSave() }),
    });
  }
}
