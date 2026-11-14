import Phaser from 'phaser';
import { TEST_COURSES } from '../content/courses';
import { SURFACES } from '../content/surfaces';
import { parseCourse, type Course } from '../sim/course';
import { buildDrawList, courseBounds, pickTile, project, type Placement } from './iso';
import { frameIndex, type Manifest } from './manifest';
import { pixelText } from './pixelText';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';

/** Loaded from assets/manifest.json on first boot. */
let manifest: Manifest = { version: 1, sprites: {} };

/** Debug overlay modes, cycled with the G key. */
const DEBUG_MODES = ['off', 'coords', 'heights', 'surfaces'] as const;
type DebugMode = (typeof DEBUG_MODES)[number];

const PAN_SPEED = 160; // screen pixels per second
const HUD_DEPTH = 1_000_000;
const OVERLAY_DEPTH = 900_000;

// Colours for debug and HUD only. Game objects get their look from sprites.
const UI_TEXT = 0xf0f0f0;
const UI_DIM = 0xa0a8c0;
const UI_BG = 0x101020;
const GRID_LINE = 0xffffff;

export interface CourseSceneData {
  courseIndex?: number;
  debug?: DebugMode;
}

/**
 * Milestone 1: draws a course from its data file, with camera pan and a debug
 * overlay. Reads course data; never changes it.
 */
export class CourseScene extends Phaser.Scene {
  private course: Course | null = null;
  private courseIndex = 0;
  private debugMode: DebugMode = 'off';
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private hoverPanel: Phaser.GameObjects.Container | null = null;
  private hoverKey = '';
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private camX = 0;
  private camY = 0;
  private ballScreen = { x: 0, y: 0 };

  constructor() {
    super('course');
  }

  init(data: CourseSceneData): void {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = TEST_COURSES.findIndex((c) => c.id === params.get('course'));
    this.courseIndex = data.courseIndex ?? (fromUrl >= 0 ? fromUrl : 0);
    const urlDebug = params.get('debug');
    this.debugMode = data.debug ?? (DEBUG_MODES.includes(urlDebug as DebugMode) ? (urlDebug as DebugMode) : urlDebug === '1' ? 'coords' : 'off');
  }

  preload(): void {
    if (this.cache.json.exists('manifest')) return;
    // Load the manifest first, then every sprite it lists.
    this.load.json('manifest', 'manifest.json');
    this.load.once('filecomplete-json-manifest', () => {
      manifest = this.cache.json.get('manifest') as Manifest;
      for (const [id, entry] of Object.entries(manifest.sprites)) {
        this.load.spritesheet(id, entry.file, { frameWidth: entry.frameWidth, frameHeight: entry.frameHeight });
      }
    });
  }

  create(): void {
    const file = TEST_COURSES[this.courseIndex]!;
    const parsed = parseCourse(file.data);
    this.setupKeys();
    if (!parsed.ok) {
      this.course = null;
      this.showErrors(file.id, parsed.errors);
      return;
    }
    const course = parsed.course;
    this.course = course;

    const ball = { gx: course.start.x + 0.5, gy: course.start.y + 0.5 };
    for (const p of buildDrawList(course, { ball })) this.place(p);
    const ballP = buildDrawList(course, { ball }).find((p) => p.kind === 'ball')!;
    this.ballScreen = { x: ballP.x, y: ballP.y };

    // Camera: start on the ball, keep the course in view.
    const b = courseBounds(course);
    const margin = 48;
    this.cameras.main.setBounds(b.left - margin, b.top - margin, b.right - b.left + margin * 2, b.bottom - b.top + margin * 2);
    this.cameras.main.setRoundPixels(true);
    this.centreOnBall();

    this.drawHud(file.id, course);
    this.drawOverlay();
  }

  override update(_time: number, deltaMs: number): void {
    const k = this.keys;
    const step = (PAN_SPEED * deltaMs) / 1000;
    const dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (dx || dy) this.panBy(dx * step, dy * step);
    this.updateHover();
  }

  // -------------------------------------------------------------------------

  private place(p: Placement): void {
    const entry = manifest.sprites[p.sprite];
    if (!entry) throw new Error(`Sprite "${p.sprite}" is not in the asset manifest.`);
    this.add
      .image(p.x, p.y, p.sprite, frameIndex(entry, p.frame))
      .setOrigin(entry.anchor[0] / entry.frameWidth, entry.anchor[1] / entry.frameHeight)
      .setDepth(p.depth);
  }

  private setupKeys(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: kb.addKey(K.UP),
      down: kb.addKey(K.DOWN),
      left: kb.addKey(K.LEFT),
      right: kb.addKey(K.RIGHT),
      w: kb.addKey(K.W),
      a: kb.addKey(K.A),
      s: kb.addKey(K.S),
      d: kb.addKey(K.D),
    };
    kb.on('keydown-G', () => this.cycleDebug());
    kb.on('keydown-C', () => this.centreOnBall());
    kb.on('keydown-ONE', () => this.switchCourse(0));
    kb.on('keydown-TWO', () => this.switchCourse(1));
    kb.on('keydown-N', () => this.switchCourse((this.courseIndex + 1) % TEST_COURSES.length));

    // Drag with the right or middle mouse button to pan. The left button is kept for aiming (Milestone 2).
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.rightButtonDown() || p.middleButtonDown()) {
        const zoom = this.cameras.main.zoom;
        this.panBy(-(p.x - p.prevPosition.x) / zoom, -(p.y - p.prevPosition.y) / zoom);
      }
    });
  }

  private switchCourse(index: number): void {
    if (index >= TEST_COURSES.length) return;
    this.scene.restart({ courseIndex: index, debug: this.debugMode });
  }

  private panBy(dx: number, dy: number): void {
    this.camX += dx;
    this.camY += dy;
    this.applyCamera();
  }

  private centreOnBall(): void {
    this.camX = this.ballScreen.x - VIEW_WIDTH / 2;
    this.camY = this.ballScreen.y - VIEW_HEIGHT / 2;
    this.applyCamera();
  }

  private applyCamera(): void {
    const cam = this.cameras.main;
    // Keep our own position clamped to the bounds so panning stops cleanly at the edges.
    const bx = cam.getBounds();
    this.camX = Phaser.Math.Clamp(this.camX, bx.x, Math.max(bx.x, bx.right - VIEW_WIDTH));
    this.camY = Phaser.Math.Clamp(this.camY, bx.y, Math.max(bx.y, bx.bottom - VIEW_HEIGHT));
    cam.setScroll(Math.round(this.camX), Math.round(this.camY));
  }

  // -------------------------------------------------------------------------
  // HUD and debug overlay

  private drawHud(id: string, course: Course): void {
    const n = `${this.courseIndex + 1}/${TEST_COURSES.length}`;
    pixelText(this, manifest, 2, 2, `${n} ${course.name}`, { color: UI_TEXT, background: UI_BG })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setName(`hud-${id}`);
    pixelText(this, manifest, 2, VIEW_HEIGHT - 9, 'ARROWS/WASD OR RIGHT-DRAG: PAN  C: CENTRE  1/2/N: COURSE  G: DEBUG', {
      color: UI_DIM,
      background: UI_BG,
    })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  private cycleDebug(): void {
    this.debugMode = DEBUG_MODES[(DEBUG_MODES.indexOf(this.debugMode) + 1) % DEBUG_MODES.length]!;
    this.drawOverlay();
  }

  private drawOverlay(): void {
    for (const o of this.overlay) o.destroy();
    this.overlay = [];
    this.hoverKey = '';
    this.hoverPanel?.destroy();
    this.hoverPanel = null;
    const course = this.course;
    if (!course || this.debugMode === 'off') return;

    const g = this.add.graphics().setDepth(OVERLAY_DEPTH);
    g.lineStyle(1, GRID_LINE, 0.35);
    this.overlay.push(g);

    for (const t of course.tiles) {
      if (!t) continue;
      const [nw, ne, se, sw] = t.corners;
      const pts = [project(t.x, t.y, nw), project(t.x + 1, t.y, ne), project(t.x + 1, t.y + 1, se), project(t.x, t.y + 1, sw)];
      g.beginPath();
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.closePath();
      g.strokePath();
      const c = project(t.x + 0.5, t.y + 0.5, (nw + ne + se + sw) / 4);

      if (this.debugMode === 'coords') {
        this.label(`${t.x},${t.y}`, c.x, c.y);
      } else if (this.debugMode === 'heights') {
        // Flat tiles show one height; sloped tiles show their four corners (nw ne se sw).
        this.label(t.shape === '0000' ? String(t.base) : t.corners.join(''), c.x, c.y);
      } else {
        this.label((SURFACES.get(t.surface)?.name ?? t.surface).slice(0, 3), c.x, c.y);
      }
    }
    const mode = pixelText(this, manifest, VIEW_WIDTH - 2, 2, `DEBUG: ${this.debugMode}`, { color: 0xf8e048, background: UI_BG })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    mode.x -= mode.width;
    this.overlay.push(mode);
  }

  private label(text: string, cx: number, cy: number): void {
    const t = pixelText(this, manifest, 0, 0, text, { color: UI_TEXT, background: UI_BG, padding: 0 }).setDepth(OVERLAY_DEPTH + 1);
    t.setPosition(Math.round(cx - t.width / 2), Math.round(cy - t.height / 2));
    this.overlay.push(t);
  }

  /** In debug mode, show details of the tile under the mouse. */
  private updateHover(): void {
    if (!this.course || this.debugMode === 'off') return;
    const p = this.input.activePointer;
    const world = this.cameras.main.getWorldPoint(p.x, p.y);
    const t = pickTile(this.course, world.x, world.y);
    const key = t ? `${t.x},${t.y}` : 'none';
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.hoverPanel?.destroy();
    if (!t) {
      this.hoverPanel = null;
      return;
    }
    const surface = SURFACES.get(t.surface)?.name ?? t.surface;
    const extra = [t.dir ? `DIR ${t.dir}` : '', t.link ? `LINK ${t.link}` : ''].filter(Boolean).join(' ');
    const text = `TILE ${t.x},${t.y}  ${surface}  CORNERS ${t.corners.join(' ')}  SHAPE ${t.shape}${extra ? '  ' + extra : ''}`;
    this.hoverPanel = pixelText(this, manifest, 2, VIEW_HEIGHT - 18, text, { color: 0xf8e048, background: UI_BG })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
  }

  private showErrors(id: string, errors: string[]): void {
    const lines = [`COURSE "${id}" HAS ERRORS:`, ...errors.slice(0, 20).map((e) => `- ${e}`)];
    // Wrap long lines to fit the screen (4 px per character).
    const max = Math.floor((VIEW_WIDTH - 6) / 4);
    const wrapped = lines.flatMap((l) => l.match(new RegExp(`.{1,${max}}`, 'gu')) ?? ['']);
    pixelText(this, manifest, 2, 2, wrapped.join('\n'), { color: 0xff8080, background: UI_BG }).setScrollFactor(0);
    console.error(`Course ${id} failed its schema check:\n${errors.join('\n')}`);
  }
}
