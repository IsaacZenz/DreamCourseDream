import Phaser from 'phaser';
import { GEAR, GEAR_CATEGORIES, GEAR_LIST } from '../content/gear';
import { UPGRADE_LIST, UPGRADES, type NodeType } from '../content/run';
import { BOSSES } from '../content/bosses';
import { ACORNS } from '../content/consumables';
import { BLUE_STARS } from '../content/progress';
import { generateRunMap } from '../gen/runMap';
import { LAST_TOWN, addUpgrade, bossBlueStars, bossOf, regionDef, sizeFor, startRegion, takeBossReward, budgetFor, choices, debugAddStars, debugSetCountdown, enterNode, rewardFor, rowOf, runStats, setGear, typeOf, type MapNode, type RunState } from '../sim/run';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { pixelText } from './pixelText';
import { debugBossFight, newRunSeed, persist, session, startRun } from './runSession';
import { ARENA_LIST } from '../content/arenas';
import { getPanel, preloadAssets, shared } from './shared';

const ROW_H = 26;
const LANE_W = 48;
const MAP_X = 32;
const PANEL_X = 226;
const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const GOOD = 0x80f080;
const BAD = 0xff8080;
const STAR = 0xf8d030;
const LINE_DIM = 0x485070;
const LINE_PATH = 0xf8d030;
const LINE_NEXT = 0xf0f0f0;

const NODE_NAME: Record<NodeType, string> = { course: 'COURSE', hard: 'HARD COURSE', shop: 'TOWN', cache: 'CACHE', boss: 'BOSS' };

/** What a node offers, in a line or two for the side panel. */
function nodeInfo(run: RunState, type: NodeType): string[] {
  switch (type) {
    case 'course':
      return [`BUDGET ${budgetFor(run, 'course')}, ${sizeFor(run, 'course').areas[0]} AREAS`, `FINISH: +${rewardFor('course')} STARS +${BLUE_STARS.course} BLUE`];
    case 'hard':
      return [`BUDGET ${budgetFor(run, 'hard')}, ${sizeFor(run, 'hard').areas[0]} AREAS`, `FINISH: +${rewardFor('hard')} STARS +${BLUE_STARS.hard} BLUE`, 'ALWAYS HAS A GEAR ITEM'];
    case 'shop':
      return ['THE SHOP AND YOUR BURROW', 'DEPOSITS YOUR BLUE STARS', 'SAVES THE RUN'];
    case 'cache':
      return ['TAKE ONE OF THREE, FREE'];
    case 'boss': {
      const boss = BOSSES.get(bossOf(run));
      return [
        `${boss?.name.toUpperCase() ?? 'BOSS'}: ${regionDef(run).bossHealth} HEALTH`,
        `BEAT IT: +${bossBlueStars(run.region)} BLUE STARS`,
        ...(run.countdown > 0 ? [`EARLY: +${run.countdown * BLUE_STARS.earlyPerStep} MORE`] : []),
        'IN ONE OF FIVE ARENAS',
      ];
    }
  }
}

/**
 * The run map (Milestone 6 design sheet, section 9.1): rows of nodes from the
 * bottom up, the path taken, the nodes that can be reached next, and the boss
 * marker above the row the countdown points to. Arrow keys choose, Enter goes.
 */
export class MapScene extends Phaser.Scene {
  private sel = 0;
  private options: MapNode[] = [];
  private cursor: Phaser.GameObjects.Image | null = null;
  private panelBox: Phaser.GameObjects.Container | null = null;
  private scrollY = 0;

  constructor() {
    super('map');
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    preloadAssets(this);
    const run = session.run;
    this.cameras.main.setBackgroundColor('#1d2b53');
    if (!run) {
      startRun(newRunSeed());
      this.scene.restart();
      return;
    }
    // Milestone 7: keep the save up to date (leaving a town removes the run save).
    persist();
    this.options = choices(run);
    this.sel = Math.min(this.sel, Math.max(0, this.options.length - 1));
    this.drawMap(run);
    this.drawPanel(run);
    this.setupKeys(run);
    this.setRunPanel(run);
    this.setProgressPanel(run);
    if (run.status === 'won' || run.status === 'lost') this.drawSummary(run);
    if (run.status === 'reward') this.drawReward(run);
  }

  private nodeXY(row: number, lane: number): { x: number; y: number } {
    const x = lane < 0 ? MAP_X + LANE_W * 1.5 : MAP_X + lane * LANE_W;
    return { x, y: -row * ROW_H };
  }

  private drawMap(run: RunState): void {
    const m = shared.manifest;
    const g = this.add.graphics();
    const here = rowOf(run);
    const bossRow = Math.min(run.map.rows.length + 1, here + run.countdown + 1);
    const onPath = new Set(run.path);
    const next = new Set(this.options.map((n) => n.id));
    // Links.
    for (const row of run.map.rows) {
      for (const n of row) {
        const a = this.nodeXY(n.row, n.lane);
        for (const id of n.links) {
          const t = run.map.rows[n.row]!.find((x) => x.id === id)!;
          const b = this.nodeXY(t.row, t.lane);
          const pathLink = onPath.has(n.id) && onPath.has(t.id);
          const nextLink = n.id === run.at && next.has(t.id);
          g.lineStyle(pathLink || nextLink ? 2 : 1, pathLink ? LINE_PATH : nextLink ? LINE_NEXT : LINE_DIM, n.row >= bossRow ? 0.3 : 1);
          g.lineBetween(a.x, a.y, b.x, b.y);
        }
      }
    }
    // From the start to row 1.
    const start = { x: MAP_X + LANE_W * 1.5, y: 0 };
    for (const n of run.map.rows[0]!) {
      const b = this.nodeXY(1, n.lane);
      const lit = !run.at || run.path[0] === n.id;
      g.lineStyle(lit ? 2 : 1, run.path[0] === n.id ? LINE_PATH : !run.at ? LINE_NEXT : LINE_DIM, 1);
      g.lineBetween(start.x, start.y, b.x, b.y);
    }
    pixelText(this, m, 0, 0, 'START', { color: UI_DIM, background: UI_BG }).setPosition(start.x - 9, start.y - 3);
    // Nodes.
    for (const row of run.map.rows) {
      for (const n of row) {
        const p = this.nodeXY(n.row, n.lane);
        const visited = onPath.has(n.id);
        const type = typeOf(run, n);
        const img = this.add.image(p.x, p.y, visited ? 'node-done' : `node-${type}`, 0);
        const past = n.row <= here && !visited;
        img.setAlpha(past ? 0.25 : n.row >= bossRow ? 0.3 : 1);
        if (next.has(n.id)) {
          img.setInteractive({ useHandCursor: true });
          img.on('pointerdown', () => {
            this.sel = this.options.findIndex((o) => o.id === n.id);
            this.go(run);
          });
          img.on('pointerover', () => {
            this.sel = this.options.findIndex((o) => o.id === n.id);
            this.refreshSelection(run);
          });
        }
      }
    }
    // The boss, just above the row the countdown points to: a red line across the map with the boss at its end.
    // Towns do not lower the countdown, so a path through towns climbs past the line before the boss comes.
    const lineY = -(bossRow - 0.5) * ROW_H;
    g.lineStyle(1, 0xd04050, 1);
    for (let x = MAP_X - 14; x < MAP_X + LANE_W * 3 + 14; x += 6) g.lineBetween(x, lineY, x + 3, lineY);
    const bp = { x: MAP_X + LANE_W * 3 + 26, y: lineY };
    const boss = this.add.image(bp.x, bp.y, 'node-boss', 0);
    if (this.options.some((o) => o.id === 'boss')) {
      boss.setInteractive({ useHandCursor: true });
      boss.on('pointerdown', () => {
        this.sel = this.options.findIndex((o) => o.id === 'boss');
        this.go(run);
      });
    }
    // Owner, 2026-11-15: before the forced boss there is always an optional last town.
    if (this.options.some((o) => o.id === LAST_TOWN)) {
      const tp = this.lastTownXY(bossRow);
      const town = this.add.image(tp.x, tp.y, 'node-shop', 0).setInteractive({ useHandCursor: true });
      town.on('pointerdown', () => {
        this.sel = this.options.findIndex((o) => o.id === LAST_TOWN);
        this.go(run);
      });
      pixelText(this, m, 0, 0, 'LAST TOWN', { color: GOOD, background: UI_BG }).setPosition(tp.x - 17, tp.y + 9);
    }
    const label = pixelText(this, m, 0, 0, run.countdown > 0 ? `BOSS IN ${run.countdown}` : 'BOSS!', { color: 0xff8080, background: UI_BG });
    label.setPosition(bp.x - label.width - 9, bp.y - 9);
    this.cursor = this.add.image(0, 0, 'cursor', 0).setDepth(10);
    // Camera: keep the next row near the lower middle of the screen.
    const nextRow = here + 1;
    this.scrollY = -nextRow * ROW_H - 140;
    this.cameras.main.setScroll(0, this.scrollY);
    this.refreshSelection(run);
  }

  /** Where the optional last town sits: on the boss line, left of centre. */
  private lastTownXY(row: number): { x: number; y: number } {
    return { x: MAP_X + LANE_W, y: -(row - 0.5) * ROW_H };
  }

  private refreshSelection(run: RunState): void {
    const n = this.options[this.sel];
    if (!n || !this.cursor) return;
    const p = n.id === 'boss' ? { x: MAP_X + LANE_W * 3 + 26, y: -(n.row - 0.5) * ROW_H } : n.id === LAST_TOWN ? this.lastTownXY(n.row) : this.nodeXY(n.row, n.lane);
    this.cursor.setPosition(p.x, p.y - 11);
    this.drawPanel(run);
  }

  private drawPanel(run: RunState): void {
    const m = shared.manifest;
    this.panelBox?.destroy();
    const c = this.add.container(PANEL_X, 0).setScrollFactor(0).setDepth(100);
    c.add(this.add.rectangle(0, 0, VIEW_WIDTH - PANEL_X, VIEW_HEIGHT, UI_BG, 0.92).setOrigin(0, 0));
    const stats = runStats(run);
    let y = 3;
    const line = (text: string, color = UI_TEXT) => {
      c.add(pixelText(this, m, 4, y, text, { color }));
      y += 7;
    };
    line(`RUN #${run.seed}  REGION ${run.region}`, UI_DIM);
    y += 2;
    line(`HEALTH ${run.health}/${stats.get('maxHealth')}`, run.health <= 2 ? BAD : UI_TEXT);
    line(`STARS ${run.wallet}`, STAR);
    line(`BLUE: ${run.blueStars} CARRIED, ${session.profile.stash} SAFE`, 0x80c8ff);
    if (run.pocket) line(`POCKET: ${ACORNS.get(run.pocket)?.name.toUpperCase()}`, STAR);
    line(run.countdown > 0 ? `BOSS IN ${run.countdown}` : 'BOSS NEXT!', 0xff8080);
    line(`COURSES DONE ${run.totals.courses}`, UI_DIM);
    y += 3;
    // Gear: icon and name per slot.
    for (const cat of GEAR_CATEGORIES) {
      const id = run.gear[cat];
      if (id) c.add(this.add.image(4, y - 1, GEAR.get(id)!.icon, 0).setOrigin(0, 0));
      else c.add(this.add.rectangle(5, y, 10, 10, 0, 0).setOrigin(0, 0).setStrokeStyle(1, 0x404058));
      c.add(pixelText(this, m, 19, y + 2, id ? GEAR.get(id)!.name : `NO ${cat}`, { color: id ? UI_TEXT : UI_DIM }));
      y += 13;
    }
    // Upgrades bought: icon and count.
    const ups = UPGRADE_LIST.filter((u) => run.upgrades[u.id]);
    if (ups.length) {
      let x = 4;
      for (const u of ups) {
        c.add(this.add.image(x, y, u.icon, 0).setOrigin(0, 0));
        c.add(pixelText(this, m, x + 13, y + 3, `${run.upgrades[u.id]}`, { color: UI_TEXT }));
        x += 26;
      }
      y += 14;
    }
    y += 3;
    // The selected node.
    const n = this.options[this.sel];
    if (n && run.status === 'map') {
      const type = typeOf(run, n);
      line(n.id === LAST_TOWN ? 'NEXT: LAST TOWN' : `NEXT: ${NODE_NAME[type]}`, GOOD);
      for (const l of n.id === LAST_TOWN ? ['OPTIONAL: SHOP AND BURROW', 'BEFORE THE BOSS'] : nodeInfo(run, type)) line(l, UI_DIM);
    }
    const help = run.status === 'map' ? ['ARROWS: CHOOSE  ENTER: GO', 'UP/DOWN: LOOK AHEAD', 'U: TEST PANEL  1-6: TEST COURSES'] : ['N: NEW RUN  S: SAME SEED'];
    help.forEach((h, i) => c.add(pixelText(this, m, 4, VIEW_HEIGHT - 7 * (help.length - i) - 2, h, { color: UI_DIM })));
    this.panelBox = c;
  }

  private go(run: RunState): void {
    const n = this.options[this.sel];
    if (!n || run.status !== 'map') return;
    const cur = enterNode(run, n.id);
    if (cur.type === 'shop' || cur.type === 'cache') this.scene.start('town');
    else this.scene.start('course', { run: true });
  }

  private setupKeys(run: RunState): void {
    const kb = this.input.keyboard!;
    const move = (d: number) => () => {
      if (!this.options.length) return;
      this.sel = (this.sel + d + this.options.length) % this.options.length;
      this.refreshSelection(run);
    };
    const look = (d: number) => () => {
      this.scrollY += d * ROW_H;
      this.cameras.main.setScroll(0, this.scrollY);
    };
    const pick = (d: number) => () => {
      if (run.status !== 'reward') return move(d)();
      const n = run.reward?.length ?? 0;
      if (!n) return;
      this.rewardSel = (this.rewardSel + d + n) % n;
      this.scene.restart();
    };
    kb.on('keydown-LEFT', pick(-1));
    kb.on('keydown-A', pick(-1));
    kb.on('keydown-RIGHT', pick(1));
    kb.on('keydown-D', pick(1));
    kb.on('keydown-UP', look(-1));
    kb.on('keydown-W', look(-1));
    kb.on('keydown-DOWN', look(1));
    const ok = () => {
      if (run.status === 'reward') return this.takeReward(run, this.rewardSel);
      if (run.status === 'won' || run.status === 'lost') return this.scene.start('burrow');
      this.go(run);
    };
    kb.on('keydown-ENTER', ok);
    kb.on('keydown-SPACE', ok);
    kb.on('keydown-ESC', () => run.status === 'reward' && this.takeReward(run, null));
    kb.on('keydown-U', () => getPanel().toggle());
    const course = (i: number) => () => this.scene.start('course', { courseIndex: i });
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].forEach((k, i) => kb.on(`keydown-${k}`, course(i)));
    kb.on('keydown-N', () => {
      if (run.status !== 'won' && run.status !== 'lost') return;
      startRun(newRunSeed());
      this.scene.restart();
    });
    kb.on('keydown-S', () => {
      if (run.status === 'map') return look(1)();
      if (run.status !== 'won' && run.status !== 'lost') return;
      startRun(run.seed);
      this.scene.restart();
    });
  }

  /** Testing aids in the U panel (sheet section 9.4). */
  private setRunPanel(run: RunState): void {
    const panel = getPanel();
    if (run.status === 'won' || run.status === 'lost') {
      panel.setRun(null);
      return;
    }
    const redraw = () => this.scene.restart();
    panel.setRun({
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
        if (UPGRADES.has(id)) addUpgrade(run, id);
        redraw();
      },
      onCountdown: (n) => {
        debugSetCountdown(run, n);
        redraw();
      },
      onWin: () => undefined,
    });
  }

  // -------------------------------------------------------------------------
  // After the boss (Milestone 7 sheet section 7.2): pick 1 of 3 gear items, then the next region.

  private rewardSel = 0;

  private drawReward(run: RunState): void {
    const m = shared.manifest;
    const offers = run.reward ?? [];
    const w = 300;
    const h = 120;
    const c = this.add.container(Math.round((VIEW_WIDTH - w) / 2), Math.round((VIEW_HEIGHT - h) / 2)).setScrollFactor(0).setDepth(200);
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.97).setOrigin(0, 0).setStrokeStyle(1, GOOD));
    c.add(pixelText(this, m, 8, 6, `THE WARDEN IS BEATEN! PICK ONE REWARD, THEN REGION ${run.region + 1}`, { color: GOOD }));
    offers.forEach((o, i) => {
      const g = GEAR.get(o.id)!;
      const x = 8 + i * 96;
      const sel = i === this.rewardSel;
      c.add(this.add.rectangle(x, 18, 90, 80, 0x1c1c34, 1).setOrigin(0, 0).setStrokeStyle(sel ? 2 : 1, sel ? STAR : 0x404060));
      c.add(this.add.image(x + 45, 36, g.icon, 0).setScale(2));
      c.add(pixelText(this, m, x + 4, 52, g.name.toUpperCase().slice(0, 21), { color: UI_TEXT }));
      c.add(pixelText(this, m, x + 4, 59, `${g.category.toUpperCase()} ${g.rarity.toUpperCase()}`, { color: UI_DIM }));
      const words = g.desc.toUpperCase().split(' ');
      let line = '';
      let ly = 68;
      for (const wd of words) {
        if ((line + ' ' + wd).trim().length > 21) {
          c.add(pixelText(this, m, x + 4, ly, line, { color: UI_DIM }));
          ly += 7;
          line = wd;
        } else line = (line + ' ' + wd).trim();
      }
      if (line) c.add(pixelText(this, m, x + 4, ly, line, { color: UI_DIM }));
    });
    c.add(pixelText(this, m, 8, h - 12, 'LEFT/RIGHT: CHOOSE  ENTER: TAKE IT (REPLACES THAT SLOT)  ESC: NONE', { color: UI_DIM }));
  }

  private takeReward(run: RunState, i: number | null): void {
    takeBossReward(run, i, generateRunMap(run.seed, run.region + 1));
    this.rewardSel = 0;
    this.sel = 0;
    this.scrollY = 0;
    this.cameras.main.setScroll(0, 0);
    persist();
    this.scene.restart();
  }

  /** Milestone 7 testing aids on the map: fight the boss now in a chosen arena, or jump to region two. */
  private setProgressPanel(run: RunState): void {
    getPanel().setProgress(
      run.status === 'map'
        ? {
            title: 'Region and boss testing aids',
            buttons: [
              {
                label: 'Go to region two now',
                onClick: () => {
                  startRegion(run, 2, generateRunMap(run.seed, 2));
                  this.scene.restart();
                },
              },
            ],
            arenas: ARENA_LIST.map((a) => ({ id: a.id, label: `${a.name}: ${a.gimmick}` })),
            onArena: (id) => {
              debugBossFight(id, run);
              this.scene.start('course', { run: true });
            },
          }
        : null,
    );
  }

  private drawSummary(run: RunState): void {
    const m = shared.manifest;
    const won = run.status === 'won';
    const reason = won ? `YOU BEAT THE BOSS OF REGION ${run.region}!` : run.endedBy === 'shots' ? 'OUT OF SHOTS WITH NO NAPS LEFT.' : 'YOUR HEALTH RAN OUT.';
    const gear = GEAR_CATEGORIES.map((c) => run.gear[c]).filter(Boolean).map((id) => GEAR.get(id!)!.name);
    const stored = GEAR_CATEGORIES.map((c) => run.burrow[c]).filter(Boolean).map((id) => GEAR.get(id!)!.name);
    const lines = [
      won ? 'RUN COMPLETE!' : 'RUN OVER',
      '',
      reason,
      `ROWS CLIMBED: ${rowOf(run)}   COURSES FINISHED: ${run.totals.courses}`,
      `YELLOW STARS EARNED: ${run.totals.stars}`,
      `BLUE STARS DEPOSITED: ${run.banked}${run.blueStars ? `   LOST (CARRIED): ${run.blueStars}` : ''}   STASH: ${session.profile.stash}`,
      `GEAR HELD: ${gear.length ? gear.join(', ') : 'NONE'}${won ? '' : ' (LOST)'}`,
      `SAFE IN YOUR BURROW: ${stored.length ? stored.join(', ') : 'NOTHING'}`,
      '',
      'ENTER: TO THE BURROW   N: NEW RUN   S: SAME SEED AGAIN',
    ];
    const text = pixelText(this, m, 0, 0, lines.join('\n'), { color: won ? GOOD : BAD });
    const w = text.width + 16;
    const h = text.height + 14;
    const c = this.add.container(Math.round((VIEW_WIDTH - w) / 2), Math.round((VIEW_HEIGHT - h) / 2)).setScrollFactor(0).setDepth(200);
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.96).setOrigin(0, 0).setStrokeStyle(1, won ? GOOD : BAD));
    text.setPosition(8, 7);
    c.add(text);
  }
}
