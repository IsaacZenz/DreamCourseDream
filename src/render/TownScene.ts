import Phaser from 'phaser';
import { GEAR, GEAR_CATEGORIES, GEAR_LIST, RARITY_INFO, type GearCategory } from '../content/gear';
import { RUN, UPGRADE_LIST, UPGRADES } from '../content/run';
import {
  addUpgrade,
  burrowSwap,
  buy,
  cannotBuy,
  debugAddStars,
  debugSetCountdown,
  leaveCache,
  leaveShop,
  priceOf,
  reroll,
  rerollPrice,
  runStats,
  setGear,
  takeFromCache,
  type Offer,
  type RunState,
} from '../sim/run';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { pixelText } from './pixelText';
import { session, storeBurrow } from './runSession';
import { getPanel, preloadAssets, shared } from './shared';

const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const CARD_BG = 0x1c1c34;
const GOOD = 0x80f080;
const BAD = 0xff8080;
const STAR = 0xf8d030;
const SELECT = 0xf8d030;
/** Text colour by rarity, matching the icon borders in the placeholder art. */
const RARITY_COLOR: Record<string, number> = {
  common: 0xb0b0c0,
  uncommon: 0x58d058,
  rare: 0x6898f8,
  doubleRare: 0xb878f8,
  specialRare: 0xf8a040,
  legendary: 0xf8e040,
};

type Mode = 'town' | 'shop' | 'burrow' | 'cache';
const SPOTS = [
  { id: 'shop', label: 'SHOP', x: 86 },
  { id: 'burrow', label: 'BURROW', x: 196 },
  { id: 'continue', label: 'CONTINUE', x: 312 },
] as const;

/** Split text into lines of at most `n` characters, at spaces. */
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
 * The town (owner, 2026-11-15): a shop node is a little town with the shop and
 * the player's Burrow. Walk between them with the arrow keys; enter either as
 * often as you like; the signpost carries on with the journey. Also shows the
 * cache (a free pick of one of three).
 */
export class TownScene extends Phaser.Scene {
  private mode: Mode = 'town';
  private sel = 0;
  private message = '';
  private messageColor = UI_TEXT;
  private confirm: { lines: string[]; yes: () => void } | null = null;

  constructor() {
    super('town');
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    preloadAssets(this);
    const run = session.run;
    if (!run || (run.status !== 'shop' && run.status !== 'cache')) {
      this.scene.start('map');
      return;
    }
    this.mode = run.status === 'cache' ? 'cache' : 'town';
    this.sel = 0;
    this.confirm = null;
    this.message = '';
    this.setupKeys(run);
    this.setRunPanel(run);
    this.redraw(run);
  }

  // -------------------------------------------------------------------------

  private say(text: string, color = UI_TEXT): void {
    this.message = text;
    this.messageColor = color;
  }

  private redraw(run: RunState): void {
    this.tweens.killAll();
    this.children.removeAll(true);
    if (this.mode === 'town') this.drawTown(run);
    else if (this.mode === 'shop') this.drawShop(run);
    else if (this.mode === 'burrow') this.drawBurrow(run);
    else this.drawCache(run);
    this.drawTopBar(run);
    if (this.message) {
      const t = pixelText(this, shared.manifest, 0, 0, this.message, { color: this.messageColor, background: UI_BG });
      t.setPosition(Math.round((VIEW_WIDTH - t.width) / 2), VIEW_HEIGHT - 26).setDepth(50);
    }
    if (this.confirm) this.drawConfirm(this.confirm.lines);
  }

  private text(x: number, y: number, s: string, color = UI_TEXT): Phaser.GameObjects.Container {
    return pixelText(this, shared.manifest, x, y, s, { color });
  }

  private help(lines: string[]): void {
    lines.forEach((l, i) => this.text(3, VIEW_HEIGHT - 7 * (lines.length - i) - 1, l, UI_DIM));
  }

  /** Health, stars, gear and the countdown along the top. */
  private drawTopBar(run: RunState): void {
    this.add.rectangle(0, 0, VIEW_WIDTH, 15, UI_BG, 0.9).setOrigin(0, 0).setDepth(40);
    const stats = runStats(run);
    const title = this.mode === 'cache' ? 'CACHE' : this.mode === 'shop' ? 'TOWN: SHOP' : this.mode === 'burrow' ? 'TOWN: YOUR BURROW' : 'TOWN';
    this.text(3, 2, title, GOOD).setDepth(41);
    this.text(3, 8, `HP ${run.health}/${stats.get('maxHealth')}`, run.health <= 2 ? BAD : UI_TEXT).setDepth(41);
    this.text(46, 8, `STARS ${run.wallet}`, STAR).setDepth(41);
    this.text(100, 8, run.countdown > 0 ? `BOSS IN ${run.countdown}` : 'BOSS NEXT', 0xff8080).setDepth(41);
    let x = VIEW_WIDTH - 3 * 14 - 2;
    for (const c of GEAR_CATEGORIES) {
      const id = run.gear[c];
      if (id) this.add.image(x, 1, GEAR.get(id)!.icon, 0).setOrigin(0, 0).setDepth(41);
      else this.add.rectangle(x + 1, 2, 10, 10, 0, 0).setOrigin(0, 0).setStrokeStyle(1, 0x404058).setDepth(41);
      x += 14;
    }
  }

  // -------------------------------------------------------------------------
  // The town street, drawn in the game's pixel style.

  private drawTown(run: RunState): void {
    const g = this.add.graphics();
    // Sky and far hills.
    g.fillStyle(0x78b8e8, 1).fillRect(0, 0, VIEW_WIDTH, 120);
    g.fillStyle(0xa8d8f8, 1).fillRect(0, 70, VIEW_WIDTH, 50);
    g.fillStyle(0x4a8a48, 1);
    for (let x = -20; x < VIEW_WIDTH + 40; x += 70) g.fillEllipse(x, 122, 110, 50);
    // Checkered grass, like the courses (owner, 2026-11-15), and a dirt path.
    for (let y = 120; y < VIEW_HEIGHT; y += 8) for (let x = 0; x < VIEW_WIDTH; x += 8) g.fillStyle(((x + y) / 8) % 2 ? 0x58a848 : 0x4c9840, 1).fillRect(x, y, 8, 8);
    g.fillStyle(0xb08850, 1).fillRect(0, 156, VIEW_WIDTH, 14);
    g.fillStyle(0x987040, 1).fillRect(0, 168, VIEW_WIDTH, 2);
    this.add.image(SPOTS[0].x, 152, 'town-shop', 0).setOrigin(0.5, 1);
    this.add.image(SPOTS[1].x, 154, 'town-burrow', 0).setOrigin(0.5, 1);
    this.add.image(SPOTS[2].x, 158, 'town-sign', 0).setOrigin(0.5, 1);
    SPOTS.forEach((s, i) => {
      const t = pixelText(this, shared.manifest, 0, 0, s.label, { color: i === this.sel ? SELECT : UI_TEXT, background: UI_BG });
      t.setPosition(Math.round(s.x - t.width / 2), 174);
      const hit = this.add.rectangle(s.x, 120, 70, 110, 0, 0).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.sel = i;
        this.enterSpot(run);
      });
    });
    // The hero stands on the path in front of the chosen place, with a pointer above it.
    const s = SPOTS[this.sel]!;
    this.add.image(s.x, 165, 'ball-shadow', 0).setOrigin(0.5, 0.5);
    this.add.image(s.x, 163, 'ball', 0).setOrigin(0.5, 1);
    const cur = this.add.image(s.x, 104 - (s.id === 'continue' ? -14 : s.id === 'burrow' ? -12 : 0), 'cursor', 0);
    this.tweens.add({ targets: cur, y: cur.y - 3, duration: 300, yoyo: true, repeat: -1 });
    const hint = s.id === 'shop' ? 'BUY GEAR, UPGRADES AND SERVICES' : s.id === 'burrow' ? 'STORE GEAR SAFELY. IT SURVIVES IF YOU DIE' : 'LEAVE TOWN AND GO ON WITH THE JOURNEY';
    this.text(3, 186, hint, UI_TEXT);
    this.help(['LEFT/RIGHT: WALK   ENTER: GO IN   U: TEST PANEL']);
  }

  private enterSpot(run: RunState): void {
    const s = SPOTS[this.sel]!;
    this.message = '';
    if (s.id === 'continue') {
      leaveShop(run);
      this.scene.start('map');
      return;
    }
    this.mode = s.id;
    this.sel = 0;
    this.redraw(run);
  }

  // -------------------------------------------------------------------------
  // Cards (shop and cache)

  private offerLines(run: RunState, o: Offer): { kind: string; name: string; rarity: string; rarityColor: number; desc: string; icon: string } {
    if (o.kind === 'gear') {
      const g = GEAR.get(o.id)!;
      return { kind: g.category.toUpperCase(), name: g.name, rarity: RARITY_INFO[g.rarity].name, rarityColor: RARITY_COLOR[g.rarity]!, desc: g.desc, icon: g.icon };
    }
    if (o.kind === 'upgrade') {
      const u = UPGRADES.get(o.id)!;
      const n = run.upgrades[o.id] ?? 0;
      return { kind: 'UPGRADE', name: u.name, rarity: n ? `YOU HAVE ${n}` : 'FOR THIS RUN', rarityColor: UI_DIM, desc: u.desc, icon: u.icon };
    }
    if (o.kind === 'heal') {
      const amount = run.status === 'cache' ? RUN.cache.heal : RUN.shop.heal.amount;
      return { kind: 'SERVICE', name: 'Patch Up', rarity: 'SERVICE', rarityColor: UI_DIM, desc: `Heal ${amount} health`, icon: 'heart' };
    }
    return { kind: 'SERVICE', name: 'Delay the Boss', rarity: 'ONCE PER SHOP', rarityColor: UI_DIM, desc: 'Boss countdown +1', icon: 'node-boss' };
  }

  private drawCard(run: RunState, o: Offer, x: number, y: number, w: number, h: number, selected: boolean, free: boolean, onClick: () => void): void {
    const L = this.offerLines(run, o);
    const why = cannotBuy(run, o, free);
    const dim = !!why;
    this.add.rectangle(x, y, w, h, CARD_BG, 1).setOrigin(0, 0).setStrokeStyle(selected ? 2 : 1, selected ? SELECT : 0x404060);
    const hit = this.add.rectangle(x, y, w, h, 0, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', onClick);
    const chars = Math.floor((w - 6) / 4);
    let ty = y + 4;
    this.text(x + 4, ty, L.kind, UI_DIM);
    ty += 8;
    this.add.image(x + w / 2, ty + 12, L.icon, 0).setScale(2).setAlpha(o.sold ? 0.3 : 1);
    ty += 28;
    for (const l of wrap(L.name, chars)) {
      this.text(x + 4, ty, l, o.sold ? UI_DIM : UI_TEXT);
      ty += 7;
    }
    this.text(x + 4, ty, L.rarity, L.rarityColor);
    ty += 9;
    for (const l of wrap(L.desc, chars)) {
      this.text(x + 4, ty, l, UI_DIM);
      ty += 7;
    }
    const price = o.sold ? 'SOLD' : free ? 'FREE' : `${priceOf(run, o)}`;
    const py = y + h - 12;
    if (!o.sold && !free) this.add.image(x + 3, py - 3, 'star-yellow', 0).setOrigin(0, 0);
    this.text(x + (o.sold || free ? 4 : 16), py, price, o.sold ? UI_DIM : dim ? BAD : STAR);
  }

  private drawShop(run: RunState): void {
    const shop = run.shop!;
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x2a2238, 1).setOrigin(0, 0);
    const w = 71;
    shop.offers.forEach((o, i) =>
      this.drawCard(run, o, 6 + i * 75, 22, w, 140, i === this.sel, false, () => {
        this.sel = i;
        this.buySelected(run);
      }),
    );
    const rp = rerollPrice(run);
    this.help([`LEFT/RIGHT: CHOOSE   ENTER: BUY   R: REROLL (${rp === 0 ? 'FREE' : `${rp} STARS`})   ESC: BACK TO TOWN`]);
  }

  /** Buying gear for a filled slot asks first, showing both items (FEATURES.md section 8). */
  private withGearCheck(run: RunState, o: Offer, act: () => void): void {
    if (o.kind !== 'gear') return act();
    const g = GEAR.get(o.id)!;
    const old = run.gear[g.category];
    if (!old) return act();
    const og = GEAR.get(old)!;
    this.confirm = {
      lines: [
        `REPLACE YOUR ${g.category.toUpperCase()}?`,
        '',
        `YOURS: ${og.name.toUpperCase()} (${RARITY_INFO[og.rarity].name.toUpperCase()})`,
        `  ${og.desc.toUpperCase()}`,
        `NEW:   ${g.name.toUpperCase()} (${RARITY_INFO[g.rarity].name.toUpperCase()})`,
        `  ${g.desc.toUpperCase()}`,
        '',
        'YOURS WILL BE LOST. TIP: STORE IT IN YOUR BURROW FIRST.',
        'ENTER: REPLACE   ESC: KEEP MINE',
      ],
      yes: act,
    };
    this.redraw(run);
  }

  private buySelected(run: RunState): void {
    const o = run.shop!.offers[this.sel];
    if (!o) return;
    const why = cannotBuy(run, o);
    if (why) {
      this.say(why, BAD);
      this.redraw(run);
      return;
    }
    this.withGearCheck(run, o, () => {
      const err = buy(run, this.sel);
      this.say(err ?? `BOUGHT ${this.offerLines(run, o).name.toUpperCase()}`, err ? BAD : GOOD);
      this.redraw(run);
    });
  }

  private drawCache(run: RunState): void {
    const cache = run.cache!;
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x22283a, 1).setOrigin(0, 0);
    this.text(6, 19, 'A CACHE! TAKE ONE OF THESE, FREE.', GOOD);
    const w = 90;
    const x0 = Math.round((VIEW_WIDTH - (cache.offers.length * (w + 6) - 6)) / 2);
    cache.offers.forEach((o, i) =>
      this.drawCard(run, o, x0 + i * (w + 6), 30, w, 132, i === this.sel, true, () => {
        this.sel = i;
        this.takeSelected(run);
      }),
    );
    this.help(['LEFT/RIGHT: CHOOSE   ENTER: TAKE IT   ESC: LEAVE WITHOUT TAKING ANYTHING']);
  }

  private takeSelected(run: RunState): void {
    const o = run.cache!.offers[this.sel];
    if (!o) return;
    const why = cannotBuy(run, o, true);
    if (why) {
      this.say(why, BAD);
      this.redraw(run);
      return;
    }
    this.withGearCheck(run, o, () => {
      takeFromCache(run, this.sel);
      this.scene.start('map');
    });
  }

  // -------------------------------------------------------------------------
  // The Burrow (owner, 2026-11-15): one stored item per category, safe from death.

  private drawBurrow(run: RunState): void {
    this.add.rectangle(0, 0, VIEW_WIDTH, VIEW_HEIGHT, 0x2a1c10, 1).setOrigin(0, 0);
    // Earthy walls with a few stones, in the pixel style.
    const g = this.add.graphics();
    for (let y = 16; y < VIEW_HEIGHT; y += 6) for (let x = (y / 6) % 2 ? 0 : 6; x < VIEW_WIDTH; x += 23) g.fillStyle(0x3a2814, 1).fillRect(x, y, 5, 3);
    this.text(6, 19, 'YOUR BURROW. GEAR STORED HERE IS SAFE IF YOU DIE,', GOOD);
    this.text(6, 26, 'AND WAITS HERE FOR YOUR NEXT RUN. ONE PER KIND.', GOOD);
    this.text(66, 38, 'WEARING', UI_DIM);
    this.text(248, 38, 'STORED', UI_DIM);
    GEAR_CATEGORIES.forEach((c, i) => this.drawBurrowRow(run, c, 46 + i * 44, i === this.sel));
    this.help(['UP/DOWN: CHOOSE   ENTER: SWAP (STORE, TAKE OUT, OR BOTH)   ESC: BACK TO TOWN']);
  }

  private drawBurrowRow(run: RunState, c: GearCategory, y: number, selected: boolean): void {
    this.add.rectangle(4, y, VIEW_WIDTH - 8, 40, CARD_BG, 0.95).setOrigin(0, 0).setStrokeStyle(selected ? 2 : 1, selected ? SELECT : 0x5a4030);
    const hit = this.add.rectangle(4, y, VIEW_WIDTH - 8, 40, 0, 0).setOrigin(0, 0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => {
      this.sel = GEAR_CATEGORIES.indexOf(c);
      this.swapSelected(run);
    });
    this.text(9, y + 17, c.toUpperCase(), UI_DIM);
    const item = (id: string | null, x: number) => {
      if (!id) {
        this.text(x, y + 17, '(EMPTY)', UI_DIM);
        return;
      }
      const gd = GEAR.get(id)!;
      this.add.image(x + 6, y + 20, gd.icon, 0).setScale(2);
      this.text(x + 18, y + 6, gd.name, UI_TEXT);
      this.text(x + 18, y + 13, RARITY_INFO[gd.rarity].name, RARITY_COLOR[gd.rarity]!);
      wrap(gd.desc, 26).forEach((l, k) => this.text(x + 18, y + 21 + k * 7, l, UI_DIM));
    };
    item(run.gear[c], 54);
    this.text(184, y + 17, '<>', selected ? SELECT : UI_DIM);
    item(run.burrow[c], 236);
  }

  private swapSelected(run: RunState): void {
    const c = GEAR_CATEGORIES[this.sel]!;
    const worn = run.gear[c];
    const stored = run.burrow[c];
    if (!burrowSwap(run, c)) {
      this.say('NOTHING TO SWAP', BAD);
    } else {
      storeBurrow(run);
      const name = (id: string | null) => (id ? GEAR.get(id)!.name.toUpperCase() : '');
      this.say(worn && stored ? `SWAPPED: WEARING ${name(stored)}` : worn ? `${name(worn)} STORED SAFELY` : `NOW WEARING ${name(stored)}`, GOOD);
    }
    this.redraw(run);
  }

  // -------------------------------------------------------------------------

  private drawConfirm(lines: string[]): void {
    const t = pixelText(this, shared.manifest, 0, 0, lines.join('\n'), { color: UI_TEXT });
    const w = t.width + 16;
    const h = t.height + 14;
    const c = this.add.container(Math.round((VIEW_WIDTH - w) / 2), Math.round((VIEW_HEIGHT - h) / 2)).setDepth(100);
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.97).setOrigin(0, 0).setStrokeStyle(1, SELECT));
    t.setPosition(8, 7);
    c.add(t);
  }

  private setupKeys(run: RunState): void {
    const kb = this.input.keyboard!;
    const move = (d: number) => () => {
      if (this.confirm) return;
      const n = this.mode === 'town' ? SPOTS.length : this.mode === 'shop' ? run.shop!.offers.length : this.mode === 'cache' ? run.cache!.offers.length : GEAR_CATEGORIES.length;
      this.sel = (this.sel + d + n) % n;
      this.message = '';
      this.redraw(run);
    };
    const horizontal = (d: number) => () => this.mode !== 'burrow' && move(d)();
    const vertical = (d: number) => () => this.mode === 'burrow' && move(d)();
    kb.on('keydown-LEFT', horizontal(-1));
    kb.on('keydown-A', horizontal(-1));
    kb.on('keydown-RIGHT', horizontal(1));
    kb.on('keydown-D', horizontal(1));
    kb.on('keydown-UP', vertical(-1));
    kb.on('keydown-W', vertical(-1));
    kb.on('keydown-DOWN', vertical(1));
    kb.on('keydown-S', vertical(1));
    const ok = () => {
      if (this.confirm) {
        const yes = this.confirm.yes;
        this.confirm = null;
        yes();
        return;
      }
      if (this.mode === 'town') this.enterSpot(run);
      else if (this.mode === 'shop') this.buySelected(run);
      else if (this.mode === 'cache') this.takeSelected(run);
      else this.swapSelected(run);
    };
    kb.on('keydown-ENTER', ok);
    kb.on('keydown-SPACE', ok);
    kb.on('keydown-ESC', () => {
      if (this.confirm) {
        this.confirm = null;
        this.redraw(run);
        return;
      }
      this.message = '';
      if (this.mode === 'shop' || this.mode === 'burrow') {
        this.sel = this.mode === 'shop' ? 0 : 1;
        this.mode = 'town';
        this.redraw(run);
      } else if (this.mode === 'cache') {
        this.confirm = {
          lines: ['LEAVE WITHOUT TAKING ANYTHING?', '', 'ENTER: LEAVE   ESC: STAY'],
          yes: () => {
            leaveCache(run);
            this.scene.start('map');
          },
        };
        this.redraw(run);
      }
    });
    kb.on('keydown-R', () => {
      if (this.mode !== 'shop' || this.confirm) return;
      const err = reroll(run);
      this.say(err ?? 'NEW STOCK!', err ? BAD : GOOD);
      this.redraw(run);
    });
    kb.on('keydown-U', () => getPanel().toggle());
  }

  /** Testing aids in the U panel. */
  private setRunPanel(run: RunState): void {
    const redraw = () => this.redraw(run);
    getPanel().setRun({
      gear: GEAR_LIST.map((g) => ({ id: g.id, label: `${g.name} (${g.rarity})` })),
      upgrades: UPGRADE_LIST.map((u) => ({ id: u.id, label: u.name })),
      countdown: run.countdown,
      canWin: false,
      onStars: () => {
        debugAddStars(run, 20);
        redraw();
      },
      onGear: (id) => {
        setGear(run, id);
        redraw();
      },
      onUpgrade: (id) => {
        addUpgrade(run, id);
        redraw();
      },
      onCountdown: (n) => {
        debugSetCountdown(run, n);
        redraw();
      },
      onWin: () => undefined,
    });
  }
}
