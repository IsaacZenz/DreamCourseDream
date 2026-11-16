import Phaser from 'phaser';
import { GEAR, GEAR_CATEGORIES, GEAR_LIST } from '../content/gear';
import { RUN, UPGRADE_LIST, UPGRADES, type NodeType } from '../content/run';
import { LAST_TOWN, addUpgrade, budgetFor, choices, debugAddBlue, debugAddStars, debugSetCountdown, enterNode, rewardFor, rowOf, runStats, setGear, typeOf, type MapNode, type RunState } from '../sim/run';
import { breakSave } from '../save/save';
import { BOSS_TINT } from './bossLook';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { pixelText } from './pixelText';
import { nextRegion, persist, session, startRun } from './runSession';
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
      return [`BUDGET ${budgetFor(run, 'course')}`, `FINISH: +${rewardFor('course')} STARS`];
    case 'hard':
      return [`BUDGET ${budgetFor(run, 'hard')}`, `FINISH: +${rewardFor('hard')} STARS`, 'ALWAYS HAS A GEAR ITEM'];
    case 'shop':
      return ['THE SHOP AND YOUR BURROW', 'DOES NOT LOWER THE COUNTDOWN'];
    case 'cache':
      return ['TAKE ONE OF THREE, FREE'];
    case 'boss':
      // Owner, 2026-11-16: the map shows the bug and its colour (the icon), not the name.
      return [`A BUG BOSS (SEE ITS ICON)`, 'BEAT IT: BLUE STARS, FULL HEAL,', 'A PRIZE, THEN THE NEXT REGION', ...(run.countdown > 0 ? [`EARLY: +${run.countdown * RUN.earlyBossBluePerStep} BLUE STARS`] : [])];
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
      this.scene.start('menu');
      return;
    }
    // Milestone 7: after a boss, choose the prize; then the next region starts here.
    if (run.status === 'reward') {
      this.scene.start('reward');
      return;
    }
    if (run.status === 'region') {
      nextRegion(run);
      this.sel = 0;
    }
    if (run.status === 'won' || run.status === 'lost') persist();
    this.options = choices(run);
    this.sel = Math.min(this.sel, Math.max(0, this.options.length - 1));
    this.drawMap(run);
    this.drawPanel(run);
    this.setupKeys(run);
    this.setRunPanel(run);
    if (run.status === 'won' || run.status === 'lost') this.drawSummary(run);
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
    // Owner, 2026-11-16: the boss's bug, in its colour (a rainbow boss flickers through the colours).
    const boss = this.add.image(bp.x, bp.y, `icon-boss-${run.boss.bug}`, 0).setTint(BOSS_TINT[run.boss.colour]);
    if (run.boss.colour === 'rainbow') {
      const tints = [BOSS_TINT.red, BOSS_TINT.yellow, BOSS_TINT.green, BOSS_TINT.blue];
      let k = 0;
      this.time.addEvent({ delay: 300, loop: true, callback: () => boss.setTint(tints[k++ % tints.length]!) });
    }
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
    line(run.countdown > 0 ? `BOSS IN ${run.countdown}` : 'BOSS NEXT!', 0xff8080);
    line(`BLUE ${run.blueStars} CARRIED`, 0x80c0ff);
    line(`  ${run.profile.stash} STASHED`, 0x80c0ff);
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
    const help = run.status === 'map' ? ['ARROWS: CHOOSE  ENTER: GO', 'UP/DOWN: LOOK AHEAD', 'U: TEST PANEL  1-6: TEST COURSES'] : ['ENTER: START MENU'];
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
    kb.on('keydown-LEFT', move(-1));
    kb.on('keydown-A', move(-1));
    kb.on('keydown-RIGHT', move(1));
    kb.on('keydown-D', move(1));
    kb.on('keydown-UP', look(-1));
    kb.on('keydown-W', look(-1));
    kb.on('keydown-DOWN', look(1));
    kb.on('keydown-ENTER', () => {
      if (run.status === 'won' || run.status === 'lost') {
        session.run = null;
        this.scene.start('menu');
      } else this.go(run);
    });
    kb.on('keydown-SPACE', () => this.go(run));
    kb.on('keydown-U', () => getPanel().toggle());
    const course = (i: number) => () => this.scene.start('course', { courseIndex: i });
    ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'].forEach((k, i) => kb.on(`keydown-${k}`, course(i)));
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
      buttons: [
        {
          label: '+10 blue stars (carried)',
          onClick: () => {
            debugAddBlue(run, 10);
            redraw();
          },
        },
        {
          label: 'Fight the boss now',
          onClick: () => {
            debugSetCountdown(run, 0);
            run.lastTownVisited = true;
            if (run.status === 'map' && choices(run).some((n) => n.id === 'boss')) {
              enterNode(run, 'boss');
              this.scene.start('course', { run: true });
            }
          },
        },
        { label: 'Break the save', onClick: () => breakSave() },
      ],
    });
  }

  private drawSummary(run: RunState): void {
    const m = shared.manifest;
    const won = run.status === 'won';
    const reason = won ? `YOU BEAT ${run.totals.bosses} BOSSES. MORE REGIONS COME LATER.` : run.endedBy === 'shots' ? 'OUT OF SHOTS WITH NO NAPS LEFT.' : 'YOUR HEALTH RAN OUT.';
    const gear = GEAR_CATEGORIES.map((c) => run.gear[c]).filter(Boolean).map((id) => GEAR.get(id!)!.name);
    const stored = GEAR_CATEGORIES.map((c) => run.burrow[c]).filter(Boolean).map((id) => GEAR.get(id!)!.name);
    const lines = [
      won ? 'RUN COMPLETE!' : 'RUN OVER',
      '',
      reason,
      `REGION ${run.region}, ROW ${rowOf(run)}   COURSES FINISHED: ${run.totals.courses}   BOSSES: ${run.totals.bosses}`,
      `YELLOW STARS EARNED: ${run.totals.stars} (LOST WITH THE RUN)`,
      `BLUE STARS: ${run.totals.blueStashed} STASHED (SAFE)${run.totals.blueLost ? `, ${run.totals.blueLost} LOST (NOT STASHED)` : ''}`,
      `BLUE STARS TO SPEND: ${run.profile.stash}`,
      `GEAR HELD: ${gear.length ? gear.join(', ') : 'NONE'}${won ? '' : ' (LOST)'}`,
      `SAFE IN YOUR BURROW: ${stored.length ? stored.join(', ') : 'NOTHING'}`,
      '',
      'ENTER: START MENU (SPEND BLUE STARS ON UPGRADES)   S: SAME SEED AGAIN',
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
