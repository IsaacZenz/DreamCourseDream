import Phaser from 'phaser';
import { FOOD, FOODS } from '../content/consumables';
import { UPGRADES } from '../content/run';
import { cannotEat, eat, type BagItem, type RunState } from '../sim/run';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { pixelText } from './pixelText';
import { shared } from './shared';

const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const CARD_BG = 0x1c1c34;
const GOOD = 0x80f080;
const BAD = 0xff8080;
const SELECT = 0xf8d030;

/** What a food does, in a few words (round 2a sheet section 4.3). */
export function foodDesc(id: string): string {
  const f = FOODS.get(id);
  if (!f) return '';
  if (f.kind === 'heal') return `HEAL ${FOOD.appleHeal}, AT ONCE`;
  if (f.kind === 'raise') return 'BOSS COUNTDOWN +1, AT ONCE';
  if (f.kind === 'acorn') return f.id === 'lucky-acorn' ? '+2 WHEEL SLICES' : f.id === 'golden-acorn' ? '+3 WHEEL SLICES' : '+5 WHEEL SLICES';
  return (UPGRADES.get(id)?.desc ?? '').toUpperCase();
}

/** "1 COURSE", "3 COURSES", or "AT ONCE". */
export function lastsText(item: BagItem): string {
  return item.courses <= 0 ? 'AT ONCE' : item.courses === 1 ? 'LASTS 1 COURSE' : `LASTS ${item.courses} COURSES`;
}

/**
 * The food bag (round 2a; owner, 2026-11-21): three slots, eaten between
 * courses (on the map or in a town), any number at a time. Food picked up on
 * a course is eaten or stashed there (CourseScene). Opened with B; the scene
 * passes its keys here while it is open.
 */
export class BagMenu {
  open = false;
  private sel = 0;
  private note = '';
  private noteColor = UI_TEXT;
  private box: Phaser.GameObjects.Container | null = null;

  private readonly scene: Phaser.Scene;
  private readonly redraw: () => void;

  constructor(scene: Phaser.Scene, redraw: () => void) {
    this.scene = scene;
    this.redraw = redraw;
  }

  show(run: RunState): void {
    this.open = true;
    this.sel = 0;
    this.note = run.bag.length ? '' : 'YOUR BAG IS EMPTY. BUY FOOD IN A TOWN.';
    this.redraw();
  }

  /** A key while open. Returns true if the bag used it. */
  key(run: RunState, k: 'left' | 'right' | 'ok' | 'back'): boolean {
    if (!this.open) return false;
    const n = Math.max(1, run.bag.length);
    if (k === 'left' || k === 'right') this.sel = (this.sel + (k === 'left' ? -1 : 1) + n) % n;
    else if (k === 'back') this.open = false;
    else {
      const item = run.bag[this.sel];
      if (item) {
        const err = eat(run, this.sel);
        this.say(err ?? `ATE ${FOODS.get(item.id)?.name.toUpperCase()}`, err ? BAD : GOOD);
        this.sel = Math.min(this.sel, Math.max(0, run.bag.length - 1));
      }
    }
    if (!run.bag.length && k === 'ok') this.open = false;
    this.redraw();
    return true;
  }

  private say(text: string, color: number): void {
    this.note = text;
    this.noteColor = color;
  }

  /** Draw the bag over the scene, if open. */
  draw(run: RunState): void {
    if (this.box?.active) this.box.destroy();
    this.box = null;
    if (!this.open) return;
    const s = this.scene;
    const m = shared.manifest;
    const w = 300;
    const h = 150;
    const x0 = Math.round((VIEW_WIDTH - w) / 2);
    const y0 = Math.round((VIEW_HEIGHT - h) / 2);
    const c = s.add.container(x0, y0).setScrollFactor(0).setDepth(500);
    this.box = c;
    c.add(s.add.rectangle(0, 0, w, h, UI_BG, 0.97).setOrigin(0, 0).setStrokeStyle(1, SELECT));
    const text = (x: number, y: number, t: string, color = UI_TEXT) => c.add(pixelText(s, m, x, y, t, { color }));
    text(6, 5, `YOUR BAG (${run.bag.length}/${FOOD.bagSlots}). EAT ANY BEFORE A COURSE.`, GOOD);
    text(6, 12, 'FOOD PICKED UP ON A COURSE: EAT IT THERE OR STASH IT.', UI_DIM);
    const cw = 92;
    for (let i = 0; i < FOOD.bagSlots; i++) {
      const item = run.bag[i];
      const x = 6 + i * (cw + 4);
      const y = 22;
      const selected = i === this.sel && !!item;
      c.add(s.add.rectangle(x, y, cw, 62, CARD_BG, 1).setOrigin(0, 0).setStrokeStyle(selected ? 2 : 1, selected ? SELECT : 0x404060));
      if (!item) {
        text(x + 4, y + 27, '(EMPTY)', UI_DIM);
        continue;
      }
      const f = FOODS.get(item.id)!;
      c.add(s.add.image(x + cw / 2, y + 12, f.icon, 0).setScale(2));
      text(x + 4, y + 26, f.name.toUpperCase(), UI_TEXT);
      text(x + 4, y + 34, foodDesc(item.id), UI_DIM);
      text(x + 4, y + 42, lastsText(item), SELECT);
      // Pips: one per course it lasts.
      for (let k = 0; k < item.courses; k++) c.add(s.add.rectangle(x + 4 + k * 6, y + 52, 4, 4, SELECT, 1).setOrigin(0, 0));
      const why = cannotEat(run, i);
      if (why) text(x + 4 + 22, y + 51, why, BAD);
      const hit = s.add.rectangle(x, y, cw, 62, 0, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.sel = i;
        this.key(run, 'ok');
      });
      c.add(hit);
    }
    // What is working now.
    let y = 90;
    text(6, y, run.fed.length ? 'EATEN, STILL WORKING:' : 'NOTHING EATEN IS WORKING NOW.', UI_DIM);
    y += 8;
    for (const f of run.fed.slice(0, 5)) {
      text(10, y, `${FOODS.get(f.id)?.name.toUpperCase()}: ${foodDesc(f.id)}, ${f.left} COURSE${f.left === 1 ? '' : 'S'} LEFT`, UI_TEXT);
      y += 7;
    }
    if (this.note) text(6, h - 20, this.note, this.noteColor);
    text(6, h - 10, 'LEFT/RIGHT: CHOOSE   ENTER: EAT   ESC/B: CLOSE', UI_DIM);
  }
}
