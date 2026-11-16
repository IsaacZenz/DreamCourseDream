import Phaser from 'phaser';
import { GEAR, RARITY_INFO } from '../content/gear';
import { chooseReward, type RunState } from '../sim/run';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { pixelText } from './pixelText';
import { persist, session } from './runSession';
import { preloadAssets, shared } from './shared';

const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const CARD_BG = 0x1c1c34;
const GOOD = 0x80f080;
const SELECT = 0xf8d030;
const RARITY_COLOR: Record<string, number> = { common: 0xb0b0c0, uncommon: 0x58d058, rare: 0x6898f8, doubleRare: 0xb878f8, specialRare: 0xf8a040, legendary: 0xf8e040 };

function wrap(text: string, n: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && line.length + 1 + word.length > n) {
      out.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

/**
 * The boss's prize (Milestone 7 design sheet section 2.9): one weapon, one
 * armour, one bauble; take one or skip. Owner, 2026-11-16: the item it replaces
 * goes to the Burrow, or to the hold if that Burrow slot is full.
 */
export class RewardScene extends Phaser.Scene {
  private sel = 0;
  private skipAsk = false;

  constructor() {
    super('reward');
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    preloadAssets(this);
    const run = session.run;
    if (!run || run.status !== 'reward' || !run.reward) {
      this.scene.start('map');
      return;
    }
    this.sel = 0;
    this.skipAsk = false;
    const kb = this.input.keyboard!;
    const n = run.reward.offers.length;
    const move = (d: number) => () => {
      this.sel = (this.sel + d + n) % n;
      this.redraw(run);
    };
    kb.on('keydown-LEFT', move(-1));
    kb.on('keydown-A', move(-1));
    kb.on('keydown-RIGHT', move(1));
    kb.on('keydown-D', move(1));
    kb.on('keydown-ENTER', () => (this.skipAsk ? this.take(run, null) : this.take(run, this.sel)));
    kb.on('keydown-SPACE', () => (this.skipAsk ? this.take(run, null) : this.take(run, this.sel)));
    kb.on('keydown-ESC', () => {
      this.skipAsk = !this.skipAsk;
      this.redraw(run);
    });
    this.redraw(run);
  }

  private take(run: RunState, i: number | null): void {
    chooseReward(run, i);
    persist();
    this.scene.start('map');
  }

  private redraw(run: RunState): void {
    this.children.removeAll(true);
    const m = shared.manifest;
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x22283a, 1).setOrigin(0, 0);
    const text = (x: number, y: number, s: string, color = UI_TEXT) => pixelText(this, m, x, y, s, { color });
    text(6, 6, 'BOSS BEATEN! CHOOSE YOUR PRIZE.', GOOD);
    text(6, 14, 'THE ITEM IT REPLACES GOES TO YOUR BURROW (OR ITS HOLD).', UI_DIM);
    const offers = run.reward!.offers;
    const w = 112;
    const x0 = Math.round((VIEW_WIDTH - (offers.length * (w + 6) - 6)) / 2);
    offers.forEach((id, i) => {
      const g = GEAR.get(id)!;
      const x = x0 + i * (w + 6);
      const y = 26;
      const h = 150;
      const sel = i === this.sel;
      this.add.rectangle(x, y, w, h, CARD_BG, 1).setOrigin(0, 0).setStrokeStyle(sel ? 2 : 1, sel ? SELECT : 0x404060);
      const hit = this.add.rectangle(x, y, w, h, 0, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.take(run, i));
      let ty = y + 4;
      text(x + 4, ty, g.category.toUpperCase(), UI_DIM);
      ty += 8;
      this.add.image(x + w / 2, ty + 12, g.icon, 0).setScale(2);
      ty += 28;
      for (const l of wrap(g.name, 26)) {
        text(x + 4, ty, l);
        ty += 7;
      }
      text(x + 4, ty, RARITY_INFO[g.rarity].name, RARITY_COLOR[g.rarity]!);
      ty += 9;
      for (const l of wrap(g.desc, 26)) {
        text(x + 4, ty, l, UI_DIM);
        ty += 7;
      }
      // What you wear now in that slot, and where it would go.
      const worn = run.gear[g.category];
      ty = y + h - 24;
      text(x + 4, ty, 'YOURS NOW:', UI_DIM);
      text(x + 4, ty + 7, worn ? GEAR.get(worn)!.name : '(NOTHING)', UI_TEXT);
      if (worn) text(x + 4, ty + 14, run.burrow[g.category] ? 'GOES TO THE HOLD' : 'GOES TO THE BURROW', UI_DIM);
    });
    if (this.skipAsk) {
      const t = pixelText(this, m, 0, 0, 'SKIP THE PRIZE?\n\nENTER: SKIP   ESC: BACK', { color: UI_TEXT, background: UI_BG, padding: 6 });
      t.setPosition(Math.round((VIEW_WIDTH - t.width) / 2), 80);
    }
    pixelText(this, m, 3, VIEW_HEIGHT - 8, 'LEFT/RIGHT: CHOOSE  ENTER: TAKE IT  ESC: SKIP', { color: UI_DIM, background: UI_BG });
  }
}
