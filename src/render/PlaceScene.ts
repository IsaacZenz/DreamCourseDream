import Phaser from 'phaser';
import { GEAR, GEAR_LIST } from '../content/gear';
import { UPGRADE_LIST } from '../content/run';
import { FOOD } from '../content/consumables';
import { OBJECTS, RAIL } from '../content/objects';
import { GROUND_BUMPS, SCENERY } from '../content/scenery';
import { PROPS, WALK, type PlaceKind, type TriggerKind } from '../content/places';
import { townFor } from '../content/places/index';
import { themeForRegion } from '../content/biomes';
import { BOSSES } from '../content/bosses';
import { LAST_REGION } from '../content/run';
import { STEP_HEIGHT } from '../content/tuning';
import { groundAt } from '../sim/ball';
import { railTileList, tileAt } from '../sim/course';
import { triggerCentre, type Place, type Point, type Trigger } from '../sim/place';
import { createWalker, placeWalker, stepWalker, walkFrame, walkHeight, type Facing, type Walker } from '../sim/walk';
import { buildCrossroads, loadPlace } from '../gen/crossroads';
import { generateRunMap } from '../gen/runMap';
import { addUpgrade, bossOf, characterOf, choices, debugVisit, courseJobFor, courseModFor, debugAddStars, debugSetCountdown, enterNode, leaveShop, runStats, setGear, startRegion, typeOf, upcomingJobs, LAST_TOWN, type CourseJob, type MapNode, type RunState } from '../sim/run';
import { courseModLabel } from './courseModView';
import { BagMenu } from './bagMenu';
import { prefetch } from './genQueue';
import { WallPainter } from './wallAtlas';
import { buildDrawList, bumpTopDepth, courseBounds, groundBump, project, tileDepth } from './iso';
import { frameIndex, themedSprite } from './manifest';
import { NODE_NAME, nodeInfo } from './MapScene';
import { goRun } from './nav';
import { pixelText } from './pixelText';
import { BOSS_FIGHTS, debugBossFight, persist, session } from './runSession';
import { gearBoxes, getPanel, preloadAssets, shared } from './shared';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';

const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const GOOD = 0x80f080;
const BAD = 0xff8080;
const STAR = 0xf8d030;
const BOSS_RED = 0xe84040;
/** Camera zoom (sheet section 1.5), from the walking numbers. */
const ZOOM = WALK.cameraZoom;
const STEP = 1 / 60;
const UI_DEPTH = 1000;
/** The address's ?place= testing aid is used once per page load. */
let urlAidUsed = false;

export interface PlaceSceneData {
  kind?: PlaceKind;
  /** Stand at this trigger's "back" spot (after a flat screen, the practice green or the cache pick). */
  back?: TriggerKind;
}

/** Owner, 2026-11-22: these are used with Enter, not by walking onto them. */
/** Owner, 2026-11-22: everything is used with Enter while standing at it; nothing happens just by walking onto it. */
const AT_REACH: Partial<Record<TriggerKind, number>> = { path: 1, gate: 1 };

/** What a trigger is called when the armadillo is near it. */
const NEAR_LABEL: Partial<Record<TriggerKind, string>> = {
  food: 'THE FOOD SHOP',
  gear: 'THE GEAR SHOP',
  burrow: 'YOUR BURROW',
  tee: 'PRACTICE GREEN: NOTHING COUNTS THERE',
  exit: 'THE WAY OUT OF TOWN',
  chest: 'THE CACHE CHEST',
  back: 'BACK TO THE CROSSROADS',
  gate: 'THE BOSS GATE',
};

/** What the bottom line says when Enter would use it. */
const AT_LABEL: Partial<Record<TriggerKind, string>> = {
  food: 'ENTER: GO IN (THE FOOD SHOP)',
  gear: 'ENTER: GO IN (THE GEAR SHOP)',
  burrow: 'ENTER: GO IN (YOUR BURROW)',
  tee: 'ENTER: PLAY THE PRACTICE GREEN',
  exit: 'ENTER: LEAVE TOWN',
  chest: 'ENTER: OPEN THE CHEST',
  back: 'ENTER: BACK TO THE CROSSROADS',
  gate: 'ENTER: THE BOSS GATE',
};

interface Sign {
  readonly at: Point;
  /** The destination's map icon (sheet section 3.3)... */
  readonly icon?: string;
  /** ...floating here, just past the path's end between its posts (owner, 2026-11-22). */
  readonly iconAt?: Point | null;
  /** How near the armadillo must be for the card to show, in tiles. */
  readonly reach?: number;
  readonly title: string;
  readonly color: number;
  readonly lines: readonly string[];
}

/** A big prop the armadillo can walk behind or in front of: drawn by which side of its footprint it is on. */
interface BigProp {
  readonly img: Phaser.GameObjects.Image;
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * A walkable place (Milestone 8b design sheet): the town, the crossroads or
 * the cache clearing. The armadillo walks with W A S D or the arrow keys;
 * stepping onto a door, a path end, the boss gate, the chest or the tee does
 * its job. All walking rules are in src/sim/walk.ts; this scene draws them.
 */
export class PlaceScene extends Phaser.Scene {
  private wanted: PlaceSceneData = {};
  private kind: PlaceKind = 'crossroads';
  private place!: Place;
  private triggers: Trigger[] = [];
  private options: MapNode[] = [];
  private signs: Sign[] = [];
  private walker!: Walker;
  private world!: Phaser.GameObjects.Container;
  private hero!: Phaser.GameObjects.Image;
  private heroShadow!: Phaser.GameObjects.Image;
  private bigProps: BigProp[] = [];
  private theme = 'day';
  private accumulator = 0;
  private overview = false;
  private camX = 0;
  private camY = 0;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift', Phaser.Input.Keyboard.Key>;
  private bag!: BagMenu;
  /** A card or prompt is open: no walking. */
  private modal: Phaser.GameObjects.Container | null = null;
  private onYes: (() => void) | null = null;
  private onNo: (() => void) | null = null;
  private signCard: Phaser.GameObjects.Container | null = null;
  private signKey = '';
  private hint: Phaser.GameObjects.Container | null = null;
  private hintText = '';
  private message: Phaser.GameObjects.Container | null = null;
  private animatedTiles: { img: Phaser.GameObjects.Image; frame: string; frames: readonly string[]; id: string }[] = [];
  private animPhase = -1;
  private sceneryAnims: { img: Phaser.GameObjects.Image; id: string; frameMs: number; offset: number }[] = [];
  /**
   * Owner, 2026-11-21: the camera at 1.5 (not a whole number). Drawing each tile
   * scaled by 1.5 left thin seams between tiles, so the place is drawn at its
   * own size onto one picture every frame, and that picture is scaled instead.
   */
  private canvas!: Phaser.GameObjects.RenderTexture;
  /** Where the place's own (0, 0) sits on that picture. */
  private origin = { x: 0, y: 0 };

  constructor() {
    super('place');
  }

  init(data: PlaceSceneData = {}): void {
    this.wanted = data;
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    preloadAssets(this);
    const run = session.run;
    if (!run) return void this.scene.start('burrow');
    // Testing aids, once: ?place=town, ?place=cache, ?place=boss (the boss is next, so its gate shows).
    const params = new URLSearchParams(window.location.search);
    const aid = urlAidUsed ? null : params.get('place');
    urlAidUsed = true;
    const region = Number(params.get('region'));
    if (aid && region > 1 && run.region !== region) startRegion(run, region, generateRunMap(run.seed, region));
    if (aid === 'town' || aid === 'cache') debugVisit(run, aid === 'town' ? 'shop' : 'cache');
    if (aid === 'boss') debugSetCountdown(run, 0);
    // The place follows the run: a town at a shop node, the clearing at a cache, otherwise the crossroads.
    const kind: PlaceKind | null = run.status === 'shop' ? 'town' : run.status === 'cache' ? 'cache' : run.status === 'map' ? (this.wanted.kind === 'cache' ? 'cache' : 'crossroads') : null;
    if (!kind) return void goRun(this);
    this.kind = kind;
    this.options = kind === 'crossroads' ? choices(run) : [];
    if (kind === 'crossroads' && !this.options.length) return void this.scene.start('map', { view: true });
    this.buildPlace(run);
    this.theme = getPanel().theme || themeForRegion(run.region, run.seed);
    this.cameras.main.setBackgroundColor(shared.manifest.themes?.[this.theme]?.sky ?? '#1d2b53');
    this.overview = false;
    this.accumulator = 0;
    this.modal = null;
    this.signCard = null;
    this.signKey = '';
    this.hint = null;
    this.hintText = '';
    this.message = null;
    this.drawWorld();
    this.spawn();
    this.drawTopBar(run);
    this.drawHelp();
    this.bag = new BagMenu(this, () => this.bag.draw(run));
    this.setupKeys(run);
    this.setRunPanel(run);
    getPanel().onTheme = () => this.scene.restart(this.wanted);
    // The town is the save point (owner, 2026-11-15); arriving at the crossroads updates the save too.
    persist();
    if (kind === 'town') prefetch(upcomingJobs(run));
    if (kind === 'crossroads') prefetch(this.options.map((n) => courseJobFor(run, n)).filter((j): j is CourseJob => j !== null));
    this.paint();
    this.updateCamera(true);
  }

  // -------------------------------------------------------------------------
  // The place and what is active in it

  private buildPlace(run: RunState): void {
    this.signs = [];
    if (this.kind === 'town') {
      this.place = loadPlace(townFor(run.region, run.seed));
      this.triggers = [...this.place.triggers];
      const exit = this.triggers.find((t) => t.kind === 'exit');
      for (const p of this.place.props.filter((q) => q.id === 'signpost')) {
        const nearExit = exit && Math.hypot(p.x - triggerCentre(exit).x, p.y - triggerCentre(exit).y) < 3;
        this.signs.push(
          nearExit
            ? { at: p, title: 'THE WAY OUT', color: GOOD, lines: ['ON TO THE CROSSROADS AND YOUR NEXT COURSE', 'ONCE YOU LEAVE, YOU CANNOT COME BACK'] }
            : { at: p, title: `REGION ${run.region} TOWN`, color: GOOD, lines: ['FOOD SHOP, GEAR SHOP AND YOUR BURROW', 'PRACTICE GREEN: NOTHING COUNTS THERE', 'BLUE STARS DEPOSITED. THE RUN IS SAVED HERE'] },
        );
      }
    } else if (this.kind === 'cache') {
      this.place = loadPlace('cache');
      // Before the pick only the chest works; after it, only the way back.
      this.triggers = this.place.triggers.filter((t) => (run.status === 'cache' ? t.kind === 'chest' : t.kind === 'back'));
    } else {
      const boss = this.options.findIndex((n) => typeOf(run, n) === 'boss');
      const x = buildCrossroads({ seed: `${run.seed}/r${run.region}/${run.path.length}`, count: this.options.length, boss: boss >= 0 ? boss : null });
      this.place = x.place;
      this.triggers = [...this.place.triggers];
      this.options.forEach((n, i) => {
        const type = typeOf(run, n);
        const mod = courseModFor(run, n);
        const lines = n.id === LAST_TOWN ? ['OPTIONAL: SHOP AND BURROW', 'BEFORE THE BOSS'] : nodeInfo(run, type);
        const card = {
          title: n.id === LAST_TOWN ? 'LAST TOWN' : NODE_NAME[type],
          color: type === 'boss' ? BOSS_RED : type === 'hard' ? 0xf8a040 : GOOD,
          lines: [...lines, ...(mod ? [courseModLabel(mod)] : [])],
        };
        // Owner, 2026-11-22: the entrance at the path's end shows the card, with the icon floating past it (no signposts).
        this.signs.push({ at: x.ends[i]!, icon: n.id === LAST_TOWN ? 'node-shop' : `node-${type}`, iconAt: x.beyond[i] ?? null, reach: 2.2, ...card });
      });
    }
  }

  // -------------------------------------------------------------------------
  // Drawing the world: a container drawn at twice the size (the close camera)

  private sprite(id: string): string {
    return themedSprite(shared.manifest, id, this.theme === 'day' ? null : this.theme);
  }

  private image(spriteId: string, frame: string, x: number, y: number, depth: number, themed = true): Phaser.GameObjects.Image {
    const id = themed ? this.sprite(spriteId) : spriteId;
    const entry = shared.manifest.sprites[id];
    if (!entry) throw new Error(`Sprite "${id}" is not in the asset manifest.`);
    const img = this.add
      .image(Math.round(x), Math.round(y), id, frameIndex(entry, frame))
      .setOrigin(entry.anchor[0] / entry.frameWidth, entry.anchor[1] / entry.frameHeight)
      .setDepth(depth);
    this.world.add(img);
    return img;
  }

  private standingDepth(x: number, y: number): number {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return tileDepth(tx, ty, 'ball') + (x - tx + (y - ty) - 1) * 0.4;
  }

  private groundZ(x: number, y: number): number {
    return (groundAt(this.place.ground, x, y)?.h ?? 0) / STEP_HEIGHT;
  }

  /** Where a thing standing on the ground at (x, y) is drawn, raised with its tile (ground bumps, owner 2026-11-21). */
  private onGround(x: number, y: number): { x: number; y: number } {
    const p = project(x, y, this.groundZ(x, y));
    const t = getPanel().groundBumps ? tileAt(this.place.ground, Math.floor(x), Math.floor(y)) : null;
    return { x: p.x, y: p.y - (t ? groundBump(t) : 0) };
  }

  private drawWorld(): void {
    const m = shared.manifest;
    this.world = this.make.container({ x: 0, y: 0 }, false);
    this.events.once('shutdown', () => this.world.destroy());
    this.animatedTiles = [];
    this.sceneryAnims = [];
    this.bigProps = [];
    const g = this.place.ground;
    // Owner, 2026-11-26: organic wall textures, the same every time this place is shown in this run.
    const run = session.run;
    const walls = getPanel().organicWalls
      ? new WallPainter(this, m, { seed: `${run?.seed ?? ''}|${g.name}|${run?.region ?? 0}|${run?.path.length ?? 0}`, theme: this.theme === 'day' ? null : this.theme, overhang: getPanel().wallOverhang })
      : null;
    for (const p of buildDrawList(g)) {
      if (p.kind === 'exit') continue;
      const id = this.sprite(p.sprite);
      const img = this.image(p.sprite, p.frame, p.x, p.y, p.depth);
      const wall = walls?.frameFor(p);
      if (wall) img.setTexture(wall.texture, wall.frame);
      const tint = walls?.debugTint(p);
      if (tint) img.setTint(tint);
      const entry = m.sprites[id]!;
      // Owner, 2026-11-21: ground bumps, for looks only.
      const t = p.kind === 'top' && getPanel().groundBumps ? tileAt(g, p.tile.x, p.tile.y) : null;
      const lift = t ? groundBump(t) : 0;
      if (lift && t) {
        const depth = bumpTopDepth(g, t);
        this.image(p.sprite, p.frame, p.x, p.y, depth - 0.01).setTint(GROUND_BUMPS.edgeTint);
        img.setDepth(depth).y -= lift;
      }
      if (entry.frames.includes(`${p.frame}~1`)) this.animatedTiles.push({ img, frame: p.frame, frames: entry.frames, id });
    }
    walls?.flush();
    // Fences: guard rails, drawn as on a course.
    for (const line of g.rails) {
      const tiles = railTileList(line);
      tiles.forEach((t, k) => {
        const post = this.onGround(t.x + 0.5, t.y + 0.5);
        this.image(RAIL.postSprite, 'idle', post.x, post.y, this.standingDepth(t.x + 0.5, t.y + 0.5));
        const n = tiles[k + 1];
        if (!n) return;
        const dx = n.x - t.x;
        const dy = n.y - t.y;
        const frame = dy === 0 ? 'x' : dx === 0 ? 'y' : dx === dy ? 'd1' : 'd2';
        for (const f of [0.125, 0.375, 0.625, 0.875]) {
          const x = t.x + 0.5 + dx * f;
          const y = t.y + 0.5 + dy * f;
          const q = this.onGround(x, y);
          this.image(RAIL.barSprite, frame, q.x, q.y, this.standingDepth(x, y));
        }
      });
    }
    // Rocks, stumps and trees.
    for (const o of g.objects) {
      const def = OBJECTS.get(o.id);
      if (!def) continue;
      const x = o.x + 0.5;
      const y = o.y + 0.5;
      const q = this.onGround(x, y);
      this.image(def.sprite, m.sprites[this.sprite(def.sprite)]?.frames[0] ?? 'idle', q.x, q.y, this.standingDepth(x, y));
    }
    // Scenery, lying on the ground; fireflies float and flicker.
    g.scenery.forEach((s, k) => {
      const def = SCENERY.get(s.id)!;
      const q = this.onGround(s.x, s.y);
      const depth = def.floats ? this.standingDepth(s.x, s.y) + 0.2 : tileDepth(Math.floor(s.x), Math.floor(s.y), 'arrow') + 0.5;
      const img = this.image(def.sprite, m.sprites[this.sprite(def.sprite)]?.frames[0] ?? 'idle', q.x, q.y, depth);
      if (def.frameMs) this.sceneryAnims.push({ img, id: this.sprite(def.sprite), frameMs: def.frameMs, offset: k * 97 });
    });
    // Props: buildings, signposts, lamps, the gate, the chest.
    for (const p of this.place.props) {
      const def = PROPS.get(p.id)!;
      const entry = m.sprites[def.sprite];
      const frame = p.id === 'chest' ? (session.run?.status === 'cache' ? 'closed' : 'open') : (entry?.frames[0] ?? 'idle');
      const q = this.onGround(p.x, p.y);
      const fp = def.footprint;
      if (fp?.kind === 'box' && fp.hx >= 0.5) {
        const img = this.image(def.sprite, frame, q.x, q.y, this.standingDepth(p.x + fp.hx - 0.05, p.y + fp.hy - 0.05), !!def.themed);
        this.bigProps.push({ img, minX: p.x - fp.hx, maxX: p.x + fp.hx, minY: p.y - fp.hy, maxY: p.y + fp.hy });
      } else if (p.id === 'tee-mat') this.image(def.sprite, frame, q.x, q.y, tileDepth(Math.floor(p.x), Math.floor(p.y), 'arrow'), false);
      else this.image(def.sprite, frame, q.x, q.y, this.standingDepth(p.x, p.y), !!def.themed);
    }
    // Owner, 2026-11-22: each path's destination icon floats out in space just past its end, between the posts.
    for (const s of this.signs) {
      if (!s.icon || !s.iconAt || !m.sprites[s.icon]) continue;
      const q = project(s.iconAt.x, s.iconAt.y, this.groundZ(s.at.x, s.at.y));
      const icon = this.image(s.icon, 'idle', q.x, q.y - 20, 1e6, false);
      this.tweens.add({ targets: icon, y: icon.y - 2, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    this.heroShadow = this.image('ball-shadow', 'idle', 0, 0, 0, false).setScale(1.6, 1.4);
    this.hero = this.image(this.walkSprite(), 'dr-stand', 0, 0, 0, false);
    const b = courseBounds(g);
    this.origin = { x: Math.ceil(24 - b.left), y: Math.ceil(56 - b.top) };
    const w = Math.ceil(b.right - b.left + 48);
    const h = Math.ceil(b.bottom - b.top + 80);
    this.canvas = this.add.renderTexture(0, 0, w, h).setOrigin(0, 0).setScale(ZOOM).setDepth(0);
    this.canvas.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  /** Where the armadillo starts: the arrival spot, or outside the door it came out of. */
  private spawn(): void {
    const s = this.place.ground.start;
    this.walker = createWalker(s.x + 0.5, s.y + 0.5, 'ul', this.triggers);
    const from = this.wanted.back ? this.place.triggers.find((t) => t.kind === this.wanted.back && t.back) : undefined;
    if (from?.back) {
      const c = triggerCentre(from);
      placeWalker(this.walker, from.back.x, from.back.y, this.facingFrom(from.back.x - c.x, from.back.y - c.y), this.triggers);
    }
    this.drawHero();
  }

  /** The facing for a direction on the ground. */
  private facingFrom(gx: number, gy: number): Facing {
    const sx = gx - gy;
    const sy = gx + gy;
    return `${sy < 0 ? 'u' : 'd'}${sx < 0 ? 'l' : 'r'}` as Facing;
  }

  /** Round 3: the run's character, as a walking armadillo. */
  private walkSprite(): string {
    return characterOf(session.run?.character).walkSprite;
  }

  private drawHero(): void {
    const w = this.walker;
    const h = walkHeight(this.place, w.x, w.y) ?? 0;
    const p = project(w.x, w.y, h);
    // Owner, 2026-11-21: standing on a tile drawn raised (ground bumps), the armadillo is drawn raised too.
    const under = getPanel().groundBumps ? tileAt(this.place.ground, Math.floor(w.x), Math.floor(w.y)) : null;
    if (under) p.y -= groundBump(under);
    const left = w.facing[1] === 'l';
    const id = left ? `${this.walkSprite()}-left` : this.walkSprite();
    const entry = shared.manifest.sprites[id]!;
    this.hero.setTexture(id, frameIndex(entry, `${w.facing}-${walkFrame(w)}`));
    this.hero.setOrigin(entry.anchor[0] / entry.frameWidth, entry.anchor[1] / entry.frameHeight);
    this.hero.setPosition(Math.round(p.x), Math.round(p.y));
    this.heroShadow.setPosition(Math.round(p.x), Math.round(p.y));
    // In front of or behind each building by which side of its footprint the armadillo is on.
    let depth = this.standingDepth(w.x, w.y);
    const r = 0.15;
    for (const b of this.bigProps) {
      const front = w.x - r >= b.maxX - 0.01 || w.y - r >= b.maxY - 0.01;
      const behind = w.x + r <= b.minX + 0.01 || w.y + r <= b.minY + 0.01;
      if (front && depth <= b.img.depth) depth = b.img.depth + 0.05;
      else if (behind && !front && depth >= b.img.depth) depth = b.img.depth - 0.05;
    }
    this.hero.setDepth(depth);
    this.heroShadow.setDepth(depth - 0.01);
  }

  // -------------------------------------------------------------------------
  // The camera: follows the armadillo with a small dead zone and stops at the edges.

  /** Draw the place onto its picture (every frame: things move and the draw order changes). */
  private paint(): void {
    this.world.sort('depth');
    this.canvas.clear();
    this.canvas.draw(this.world, this.origin.x, this.origin.y);
    this.canvas.render();
  }

  private updateCamera(snap = false): void {
    const cam = this.cameras.main;
    const scale = this.canvas.scaleX;
    const bw = this.canvas.width * scale;
    const bh = this.canvas.height * scale;
    if (this.overview) {
      cam.setScroll(Math.round(bw / 2 - VIEW_WIDTH / 2), Math.round(bh / 2 - VIEW_HEIGHT / 2));
      return;
    }
    const tx = (this.hero.x + this.origin.x) * scale - VIEW_WIDTH / 2;
    const ty = (this.hero.y + this.origin.y) * scale - VIEW_HEIGHT / 2 + 10;
    const dead = 10;
    if (snap) {
      this.camX = tx;
      this.camY = ty;
    } else {
      if (tx - this.camX > dead) this.camX += (tx - this.camX - dead) * 0.2;
      if (this.camX - tx > dead) this.camX -= (this.camX - tx - dead) * 0.2;
      if (ty - this.camY > dead) this.camY += (ty - this.camY - dead) * 0.2;
      if (this.camY - ty > dead) this.camY -= (this.camY - ty - dead) * 0.2;
    }
    const clamp = (v: number, lo: number, hi: number) => (hi < lo ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v)));
    this.camX = clamp(this.camX, 0, bw - VIEW_WIDTH);
    this.camY = clamp(this.camY, 8 * scale, bh - VIEW_HEIGHT + 8);
    cam.setScroll(Math.round(this.camX), Math.round(this.camY));
  }

  private toggleOverview(): void {
    this.overview = !this.overview;
    if (this.overview) {
      const fit = Math.min((VIEW_WIDTH - 16) / this.canvas.width, (VIEW_HEIGHT - 30) / this.canvas.height);
      this.canvas.setScale(Math.min(ZOOM, fit));
    } else this.canvas.setScale(ZOOM);
    this.say(this.overview ? 'OVERVIEW. O: BACK' : '', UI_DIM);
    this.updateCamera(true);
  }

  // -------------------------------------------------------------------------
  // Every frame: walk in fixed steps, fire triggers, show what is near.

  override update(_time: number, delta: number): void {
    if (!this.walker) return;
    this.animate();
    const busy = !!this.modal || this.bag?.open || this.overview;
    if (!busy) {
      const k = this.keys;
      const input = {
        sx: (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0),
        sy: (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0),
        run: k.shift.isDown,
      };
      this.accumulator = Math.min(this.accumulator + delta / 1000, 0.25);
      while (this.accumulator >= STEP) {
        this.accumulator -= STEP;
        // Owner, 2026-11-22: the chest opens with Enter, not by walking into it.
        // Owner, 2026-11-22: nothing is used by walking onto it; Enter uses what the armadillo stands at.
        stepWalker(this.place, this.walker, input, STEP, this.triggers);
      }
    } else this.walker.moving = false;
    this.drawHero();
    this.paint();
    this.updateCamera();
    this.updateNear();
  }

  private animate(): void {
    const phase = Math.floor(this.time.now / 250);
    if (phase !== this.animPhase) {
      this.animPhase = phase;
      for (const a of this.animatedTiles) {
        const n = a.frames.filter((f) => f.startsWith(`${a.frame}~`)).length + 1;
        const k = phase % n;
        a.img.setFrame(frameIndex(shared.manifest.sprites[a.id]!, k === 0 ? a.frame : `${a.frame}~${k}`));
      }
    }
    for (const a of this.sceneryAnims) {
      const entry = shared.manifest.sprites[a.id];
      if (!entry) continue;
      a.img.setFrame(frameIndex(entry, entry.frames[Math.floor((this.time.now + a.offset) / a.frameMs) % entry.frames.length]!));
    }
  }

  /** Signpost cards and door hints for what the armadillo is next to. */
  private updateNear(): void {
    const w = this.walker;
    let best: Sign | null = null;
    let bestD = Infinity;
    for (const s of this.signs) {
      const d = Math.hypot(w.x - s.at.x, w.y - s.at.y);
      if (d < (s.reach ?? 1.5) && d < bestD) {
        best = s;
        bestD = d;
      }
    }
    const key = best ? `${best.at.x},${best.at.y}` : '';
    if (key !== this.signKey) {
      this.signKey = key;
      this.signCard?.destroy();
      this.signCard = best && !this.modal ? this.card(best.title, best.color, best.lines, VIEW_WIDTH - 6, 20, 'right') : null;
    }
    // A door or path end within a tile: say what it is, and say "ENTER" when Enter would use it.
    let text = '';
    const at = this.atEntrance();
    for (const t of at ? [at] : this.triggers) {
      const cx = Math.max(t.x0, Math.min(t.x1, w.x));
      const cy = Math.max(t.y0, Math.min(t.y1, w.y));
      if (Math.hypot(w.x - cx, w.y - cy) > 1.2) continue;
      if (t.kind === 'path') {
        const n = this.options[t.slot ?? 0];
        const run = session.run;
        const name = n && run ? (n.id === LAST_TOWN ? 'LAST TOWN' : NODE_NAME[typeOf(run, n)]) : '';
        text = this.atEntrance() === t ? `ENTER: GO THIS WAY (${name})` : `THIS WAY: ${name}`;
      } else text = (at === t ? AT_LABEL[t.kind] : NEAR_LABEL[t.kind]) ?? '';
      break;
    }
    if (text !== this.hintText) {
      this.hintText = text;
      this.hint?.destroy();
      this.hint = null;
      if (text) {
        const t = pixelText(this, shared.manifest, 0, 0, text, { color: STAR, background: UI_BG });
        this.hint = this.add.container(Math.round((VIEW_WIDTH - t.width) / 2), VIEW_HEIGHT - 34, [t]).setScrollFactor(0).setDepth(UI_DEPTH);
      }
    }
  }

  // -------------------------------------------------------------------------
  // Triggers (sheet section 1.4)

  private fire(t: Trigger): void {
    const run = session.run;
    if (!run) return;
    switch (t.kind) {
      case 'food':
      case 'gear':
      case 'burrow':
        return void this.scene.start('town', { mode: t.kind });
      case 'chest':
        return void this.scene.start('town', { mode: 'cache' });
      case 'tee':
        return void this.scene.start('course', { practice: true });
      case 'back':
        return void goRun(this);
      case 'exit':
        return this.ask(['LEAVE TOWN?', '', 'ON TO THE CROSSROADS. YOU CANNOT COME BACK.', '', 'ENTER: LEAVE   ESC: STAY'], () => {
          leaveShop(run);
          goRun(this);
        }, () => undefined);
      case 'path': {
        const n = this.options[t.slot ?? 0];
        if (!n) return;
        enterNode(run, n.id);
        return void goRun(this);
      }
      case 'gate': {
        const n = this.options[t.slot ?? 0];
        if (!n) return;
        const bossNode = n;
        return this.bossIntro(run, () =>
          this.ask(['FIGHT NOW?', '', 'ENTER: YES   ESC: NOT YET'], () => {
            session.skipBossIntro = true;
            enterNode(run, bossNode.id);
            goRun(this);
          }, () => undefined),
        );
      }
    }
  }

  /**
   * What Enter would use: a trigger the armadillo stands in (doors, the tee,
   * the exit, the chest's area), or a path end or the boss gate within a
   * tile. The nearest wins.
   */
  private atEntrance(): Trigger | null {
    const w = this.walker;
    let best: Trigger | null = null;
    let bestD = Infinity;
    for (const t of this.triggers) {
      const d = Math.hypot(w.x - Math.max(t.x0, Math.min(t.x1, w.x)), w.y - Math.max(t.y0, Math.min(t.y1, w.y)));
      if (d <= (AT_REACH[t.kind] ?? 0.05) && d < bestD) {
        best = t;
        bestD = d;
      }
    }
    return best;
  }



  // -------------------------------------------------------------------------
  // Cards and prompts (fixed to the screen)

  private card(title: string, color: number, lines: readonly string[], x: number, y: number, align: 'left' | 'right' | 'centre'): Phaser.GameObjects.Container {
    const m = shared.manifest;
    const head = pixelText(this, m, 6, 5, title, { color });
    const body = lines.map((l, i) => pixelText(this, m, 6, 15 + i * 8, l, { color: UI_TEXT }));
    const w = Math.max(head.width, ...body.map((b) => b.width)) + 12;
    const h = 15 + lines.length * 8 + 4;
    const left = align === 'right' ? x - w : align === 'centre' ? Math.round((VIEW_WIDTH - w) / 2) : x;
    const c = this.add.container(left, y).setScrollFactor(0).setDepth(UI_DEPTH + 5);
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.94).setOrigin(0, 0).setStrokeStyle(1, color));
    c.add(head);
    for (const b of body) c.add(b);
    return c;
  }

  private ask(lines: string[], yes: () => void, no: () => void): void {
    this.signCard?.destroy();
    this.signCard = null;
    this.signKey = 'modal';
    const m = shared.manifest;
    const t = pixelText(this, m, 8, 7, lines.join('\n'), { color: UI_TEXT });
    const w = t.width + 16;
    const h = t.height + 14;
    const c = this.add.container(Math.round((VIEW_WIDTH - w) / 2), Math.round((VIEW_HEIGHT - h) / 2)).setScrollFactor(0).setDepth(UI_DEPTH + 10);
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.97).setOrigin(0, 0).setStrokeStyle(1, STAR));
    c.add(t);
    this.modal = c;
    this.onYes = yes;
    this.onNo = no;
  }

  private closeModal(): void {
    this.modal?.destroy();
    this.modal = null;
    this.onYes = null;
    this.onNo = null;
    this.signKey = '';
  }

  /** The boss's introduction card (owner, 2026-11-19), at the gate: any key goes on. */
  private bossIntro(run: RunState, then: () => void): void {
    const bossId = bossOf(run);
    const def = BOSSES.get(bossId);
    const enemy = OBJECTS.get(bossId);
    if (!def || enemy?.kind !== 'enemy') return then();
    this.signCard?.destroy();
    this.signCard = null;
    this.signKey = 'modal';
    const m = shared.manifest;
    const w = 220;
    const h = 120;
    const c = this.add.container(Math.round((VIEW_WIDTH - w) / 2), Math.round((VIEW_HEIGHT - h) / 2)).setScrollFactor(0).setDepth(UI_DEPTH + 10);
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.96).setOrigin(0, 0).setStrokeStyle(2, BOSS_RED));
    const region = run.region;
    const head = region > LAST_REGION ? `ENDLESS MODE - REGION ${region}` : region === LAST_REGION ? `REGION ${region} - THE FINAL BOSS` : `REGION ${region} BOSS`;
    const centred = (y: number, s: string, color: number) => {
      const t = pixelText(this, m, 0, y, s, { color });
      t.setX(Math.round((w - t.width) / 2));
      c.add(t);
    };
    centred(8, head, UI_DIM);
    const entry = m.sprites[enemy.sprite]!;
    const img = this.add.image(w / 2, 72, enemy.sprite, frameIndex(entry, entry.frames[0]!)).setOrigin(entry.anchor[0] / entry.frameWidth, entry.anchor[1] / entry.frameHeight).setScale(1.5);
    c.add(img);
    centred(84, def.name.toUpperCase(), BOSS_RED);
    centred(94, def.title.toUpperCase(), UI_TEXT);
    centred(108, 'ANY KEY', UI_DIM);
    this.tweens.add({ targets: img, y: 68, duration: 500, yoyo: true, repeat: -1 });
    this.modal = c;
    this.onYes = null;
    this.onNo = null;
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      window.removeEventListener('keydown', onKey, true);
      this.closeModal();
      then();
    };
    const onKey = (ev: KeyboardEvent) => {
      ev.stopImmediatePropagation();
      close();
    };
    // Shown for a moment before a key can close it, so the key that walked into the gate does not skip it.
    this.time.delayedCall(250, () => window.addEventListener('keydown', onKey, true));
    this.time.delayedCall(3000, close);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey, true));
  }

  private say(text: string, color: number): void {
    this.message?.destroy();
    this.message = null;
    if (!text) return;
    const t = pixelText(this, shared.manifest, 0, 0, text, { color, background: UI_BG });
    this.message = this.add.container(Math.round((VIEW_WIDTH - t.width) / 2), VIEW_HEIGHT - 20, [t]).setScrollFactor(0).setDepth(UI_DEPTH + 1);
  }

  /** Health, stars, the countdown, the bag and the gear along the top, as in the town. */
  private drawTopBar(run: RunState): void {
    const m = shared.manifest;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(UI_DEPTH);
    c.add(this.add.rectangle(0, 0, VIEW_WIDTH, 15, UI_BG, 0.9).setOrigin(0, 0));
    const title = this.kind === 'town' ? `TOWN (REGION ${run.region})` : this.kind === 'cache' ? 'CACHE' : `CROSSROADS (REGION ${run.region})`;
    const stats = runStats(run);
    c.add(pixelText(this, m, 3, 2, title, { color: GOOD }));
    c.add(pixelText(this, m, 3, 8, `HP ${run.health}/${stats.get('maxHealth')}`, { color: run.health <= 2 ? BAD : UI_TEXT }));
    c.add(pixelText(this, m, 46, 8, `STARS ${run.wallet}`, { color: STAR }));
    c.add(pixelText(this, m, 100, 8, run.countdown > 0 ? `BOSS IN ${run.countdown}` : 'BOSS NEXT', { color: BAD }));
    c.add(pixelText(this, m, 150, 8, `BAG ${run.bag.length}/${FOOD.bagSlots} (B)`, { color: STAR }));
    const boxes = gearBoxes(run.gear, run.gear2, run.pockets);
    let x = VIEW_WIDTH - boxes.length * 14 - 2;
    for (const id of boxes) {
      if (id) c.add(this.add.image(x, 1, GEAR.get(id)!.icon, 0).setOrigin(0, 0));
      else c.add(this.add.rectangle(x + 1, 2, 10, 10, 0, 0).setOrigin(0, 0).setStrokeStyle(1, 0x404058));
      x += 14;
    }
  }

  private drawHelp(): void {
    const t = pixelText(this, shared.manifest, 2, VIEW_HEIGHT - 8, 'WASD/ARROWS: WALK  SHIFT: RUN  B: BAG  M: MAP  O: OVERVIEW  U: TEST PANEL', { color: UI_DIM, background: UI_BG });
    t.setScrollFactor(0).setDepth(UI_DEPTH);
  }

  // -------------------------------------------------------------------------

  private setupKeys(run: RunState): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT }) as typeof this.keys;
    const bagKey = (k: 'left' | 'right') => () => this.bag.key(run, k);
    kb.on('keydown-LEFT', bagKey('left'));
    kb.on('keydown-A', bagKey('left'));
    kb.on('keydown-RIGHT', bagKey('right'));
    kb.on('keydown-D', bagKey('right'));
    const ok = () => {
      if (this.bag.key(run, 'ok')) return;
      if (this.onYes) {
        const yes = this.onYes;
        this.closeModal();
        yes();
        return;
      }
      if (this.modal || this.overview) return;
      // Owner, 2026-11-22: Enter (or E) uses whatever the armadillo stands at: a door, the tee, the exit, the chest, a path end, the gate.
      const way = this.atEntrance();
      if (way) this.fire(way);
    };
    kb.on('keydown-ENTER', ok);
    kb.on('keydown-SPACE', ok);
    kb.on('keydown-E', ok);
    kb.on('keydown-ESC', () => {
      if (this.bag.key(run, 'back')) return;
      if (this.onNo) {
        const no = this.onNo;
        this.closeModal();
        no();
      } else if (this.overview) this.toggleOverview();
    });
    kb.on('keydown-B', () => {
      if (this.modal) return;
      if (this.kind === 'cache' && run.status === 'cache') return;
      if (this.bag.open) this.bag.key(run, 'back');
      else this.bag.show(run);
    });
    kb.on('keydown-M', () => !this.modal && !this.bag.open && this.scene.start('map', { view: true }));
    kb.on('keydown-O', () => !this.modal && !this.bag.open && this.toggleOverview());
    kb.on('keydown-U', () => getPanel().toggle());
  }

  /** Testing aids in the U panel, as on the map and in the town. */
  private setRunPanel(run: RunState): void {
    const again = () => this.scene.restart(this.wanted);
    const panel = getPanel();
    panel.setRun({
      gear: GEAR_LIST.map((g) => ({ id: g.id, label: `${g.name} (${g.rarity})` })),
      upgrades: UPGRADE_LIST.map((u) => ({ id: u.id, label: u.name })),
      countdown: run.countdown,
      canWin: false,
      onStars: () => {
        debugAddStars(run, 20);
        again();
      },
      onGear: (id) => {
        setGear(run, id);
        again();
      },
      onUpgrade: (id) => {
        addUpgrade(run, id);
        again();
      },
      onCountdown: (n) => {
        debugSetCountdown(run, n);
        again();
      },
      onWin: () => undefined,
    });
    panel.setProgress(
      run.status === 'map'
        ? {
            title: 'Region and boss testing aids',
            buttons: [2, 3, 4].map((r) => ({
              label: `Go to region ${r === 4 ? 'four (endless)' : r === 3 ? 'three' : 'two'} now`,
              onClick: () => {
                startRegion(run, r, generateRunMap(run.seed, r));
                this.scene.restart({ kind: 'crossroads' });
              },
            })),
            arenas: BOSS_FIGHTS,
            onArena: (id) => {
              debugBossFight(id, run);
              this.scene.start('course', { run: true });
            },
          }
        : null,
    );
  }
}

