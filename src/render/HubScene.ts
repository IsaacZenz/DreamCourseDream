import Phaser from 'phaser';
import { ABILITIES, ABILITY_IDS } from '../content/abilities';
import { PERMANENT_LIST, UNLOCKS } from '../content/permanent';
import { buyLevel, buyUnlock, chooseStartingAbility, levelOf, newProfile, nextCost } from '../sim/profile';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { pixelText } from './pixelText';
import { persist, session } from './runSession';
import { getPanel, preloadAssets, shared } from './shared';

const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const CARD_BG = 0x1c1c34;
const GOOD = 0x80f080;
const BAD = 0xff8080;
const SELECT = 0xf8d030;
const BLUE = 0x80c0ff;

/** Rows: the five levelled upgrades, the starting ability unlock, then back. */
type Row = { kind: 'level'; id: string } | { kind: 'ability' } | { kind: 'back' };

/**
 * The hub (Milestone 7 design sheet, section 5): spend stashed blue stars on
 * permanent upgrades and the starting ability. Buying is final (no refunds).
 */
export class HubScene extends Phaser.Scene {
  private sel = 0;
  private message = '';
  private messageColor = UI_TEXT;

  constructor() {
    super('hub');
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    preloadAssets(this);
    this.cameras.main.setBackgroundColor('#1d2b53');
    this.sel = 0;
    this.message = '';
    this.setupKeys();
    getPanel().setAids('Testing aids (hub)', [
      {
        label: '+10 blue stars (stashed)',
        onClick: () => {
          session.profile.stash += 10;
          persist();
          this.redraw();
        },
      },
      {
        label: 'Reset permanent progress (keeps the Burrow)',
        onClick: () => {
          if (!window.confirm('Reset blue stars, upgrade levels and unlocks?')) return;
          const p = session.profile;
          const fresh = newProfile();
          p.stash = 0;
          for (const k of Object.keys(p.levels)) delete p.levels[k];
          Object.assign(p.unlocks, fresh.unlocks);
          p.startingAbility = null;
          persist();
          this.redraw();
        },
      },
    ]);
    this.redraw();
  }

  private rows(): Row[] {
    return [...PERMANENT_LIST.map((d): Row => ({ kind: 'level', id: d.id })), { kind: 'ability' }, { kind: 'back' }];
  }

  private say(text: string, color: number): void {
    this.message = text;
    this.messageColor = color;
  }

  private redraw(): void {
    this.children.removeAll(true);
    const m = shared.manifest;
    const p = session.profile;
    const text = (x: number, y: number, s: string, color = UI_TEXT) => pixelText(this, m, x, y, s, { color });
    text(6, 4, 'UPGRADES', SELECT);
    text(6, 12, 'BOUGHT WITH BLUE STARS. THEY LAST FOREVER.', UI_DIM);
    this.add.image(VIEW_WIDTH - 70, 4, 'star-blue', 0).setOrigin(0, 0);
    text(VIEW_WIDTH - 57, 7, `${p.stash} TO SPEND`, BLUE);
    this.rows().forEach((row, i) => {
      const y = 24 + i * 21;
      const sel = i === this.sel;
      const h = row.kind === 'back' ? 11 : 19;
      this.add.rectangle(4, y, VIEW_WIDTH - 8, h, CARD_BG, 0.95).setOrigin(0, 0).setStrokeStyle(sel ? 2 : 1, sel ? SELECT : 0x404060);
      const hit = this.add.rectangle(4, y, VIEW_WIDTH - 8, h, 0, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.sel = i;
        this.press();
      });
      if (row.kind === 'back') {
        text(10, y + 3, 'BACK TO THE START MENU', sel ? SELECT : UI_TEXT);
        return;
      }
      if (row.kind === 'level') {
        const def = PERMANENT_LIST.find((d) => d.id === row.id)!;
        const lv = levelOf(p, def.id);
        const cost = nextCost(p, def.id);
        this.add.image(8, y + 4, def.icon, 0).setOrigin(0, 0);
        text(24, y + 3, def.name.toUpperCase(), UI_TEXT);
        text(24, y + 11, def.desc.toUpperCase(), UI_DIM);
        // Pips: one per level, filled when bought.
        for (let k = 0; k < def.costs.length; k++) {
          const px = 150 + k * 9;
          this.add.rectangle(px, y + 5, 7, 7, k < lv ? GOOD : 0x000000, k < lv ? 1 : 0).setOrigin(0, 0).setStrokeStyle(1, k < lv ? GOOD : 0x606080);
        }
        if (cost === null) text(VIEW_WIDTH - 70, y + 7, 'TOP LEVEL', GOOD);
        else {
          this.add.image(VIEW_WIDTH - 72, y + 4, 'star-blue', 0).setOrigin(0, 0);
          text(VIEW_WIDTH - 59, y + 7, `${cost}`, cost > p.stash ? BAD : BLUE);
          text(VIEW_WIDTH - 44, y + 7, `LEVEL ${lv + 1}`, UI_DIM);
        }
        return;
      }
      // The starting ability unlock, then the choice (owner, 2026-11-16: any built ability).
      const u = UNLOCKS.startingAbility;
      this.add.image(8, y + 4, u.icon, 0).setOrigin(0, 0);
      text(24, y + 3, u.name.toUpperCase(), UI_TEXT);
      if (!p.unlocks.startingAbility) {
        text(24, y + 11, u.desc.toUpperCase(), UI_DIM);
        this.add.image(VIEW_WIDTH - 72, y + 4, 'star-blue', 0).setOrigin(0, 0);
        text(VIEW_WIDTH - 59, y + 7, `${u.cost}`, u.cost > p.stash ? BAD : BLUE);
        text(VIEW_WIDTH - 44, y + 7, 'UNLOCK', UI_DIM);
      } else {
        const name = p.startingAbility ? ABILITIES.get(p.startingAbility)!.name.toUpperCase() : 'NONE';
        if (p.startingAbility) this.add.image(150, y + 4, ABILITIES.get(p.startingAbility)!.icon, 0).setOrigin(0, 0);
        text(24, y + 11, 'START EACH RUN HOLDING:', UI_DIM);
        text(164, y + 7, `< ${name} >`, sel ? SELECT : UI_TEXT);
        text(VIEW_WIDTH - 70, y + 7, 'UNLOCKED', GOOD);
      }
    });
    if (this.message) {
      const t = pixelText(this, m, 0, 0, this.message, { color: this.messageColor, background: UI_BG });
      t.setPosition(Math.round((VIEW_WIDTH - t.width) / 2), VIEW_HEIGHT - 18);
    }
    pixelText(this, m, 3, VIEW_HEIGHT - 8, 'UP/DOWN: CHOOSE  ENTER: BUY  LEFT/RIGHT: PICK THE STARTING ABILITY  ESC: BACK', { color: UI_DIM, background: UI_BG });
  }

  private press(): void {
    const row = this.rows()[this.sel];
    const p = session.profile;
    if (!row) return;
    if (row.kind === 'back') {
      this.scene.start('menu');
      return;
    }
    if (row.kind === 'level') {
      const def = PERMANENT_LIST.find((d) => d.id === row.id)!;
      const err = buyLevel(p, row.id);
      this.say(err ?? `${def.name.toUpperCase()} LEVEL ${levelOf(p, row.id)}! IT APPLIES FROM YOUR NEXT RUN`, err ? BAD : GOOD);
    } else if (!p.unlocks.startingAbility) {
      const err = buyUnlock(p, 'startingAbility');
      this.say(err ?? 'UNLOCKED! PICK AN ABILITY WITH LEFT/RIGHT', err ? BAD : GOOD);
    } else this.pickAbility(1);
    persist();
    this.redraw();
  }

  private pickAbility(d: number): void {
    const p = session.profile;
    if (!p.unlocks.startingAbility) return;
    const options: (string | null)[] = [null, ...ABILITY_IDS];
    const i = options.indexOf(p.startingAbility);
    chooseStartingAbility(p, options[(i + d + options.length) % options.length]!);
    persist();
  }

  private setupKeys(): void {
    const kb = this.input.keyboard!;
    const move = (d: number) => () => {
      const n = this.rows().length;
      this.sel = (this.sel + d + n) % n;
      this.message = '';
      this.redraw();
    };
    const side = (d: number) => () => {
      if (this.rows()[this.sel]?.kind !== 'ability') return;
      this.pickAbility(d);
      this.redraw();
    };
    kb.on('keydown-UP', move(-1));
    kb.on('keydown-W', move(-1));
    kb.on('keydown-DOWN', move(1));
    kb.on('keydown-S', move(1));
    kb.on('keydown-LEFT', side(-1));
    kb.on('keydown-A', side(-1));
    kb.on('keydown-RIGHT', side(1));
    kb.on('keydown-D', side(1));
    kb.on('keydown-ENTER', () => this.press());
    kb.on('keydown-SPACE', () => this.press());
    kb.on('keydown-ESC', () => this.scene.start('menu'));
    kb.on('keydown-U', () => getPanel().toggle());
  }
}
