import Phaser from 'phaser';
import { TEST_COURSES } from '../content/courses';
import { SURFACES } from '../content/surfaces';
import { parseCourse, type Course } from '../sim/course';
import { STEP_HEIGHT, type Tuning } from '../content/tuning';
import { DT, ballAtTile, groundAt, predictPath, startShot, stepShot, type BallState, type ShotState, type ShotType } from '../sim/ball';
import { SPIN_LEVELS, chargeMeter, dragShot, spinValue } from '../input/aim';
import { loadTuning } from '../save/tuningStore';
import { TuningPanel } from '../ui/tuningPanel';
import { buildDrawList, courseBounds, pickTile, project, tileDepth, type Placement } from './iso';
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
const GUIDE = 0xffffff;
const GUIDE_AIR = 0xf8e048;
const METER_BG = 0x202038;
const METER_FILL = 0xf8b048;
const METER_FULL = 0xff6040;
const METER_PLAN = 0xffffff;

/** Shared by every course and kept across restarts, so live tuning sticks. */
let tuning: Tuning | null = null;
let panel: TuningPanel | null = null;

/** Shot settings the player has chosen. Kept across course switches. */
const settings = { type: 'ground' as ShotType, top: 0, side: 0, quickShot: false, help: true };

/**
 * The two-phase shot (owner, 2026-11-14):
 * - plan:   waiting; press the left button to start pulling.
 * - pull:   pulling back like a slingshot sets the direction and a planned power; the guide previews it.
 * - set:    plan locked; hold the left button to charge.
 * - charge: the meter sweeps up, down, up, down; release to shoot. If it runs out, the ball launches at low power.
 * - flight: the ball is moving.
 * Quick-shot mode (P, testing only) fires straight from the pull.
 */
type Phase = 'plan' | 'pull' | 'set' | 'charge' | 'flight';

export interface CourseSceneData {
  courseIndex?: number;
  debug?: DebugMode;
}

/**
 * Draws a course from its data file and plays shots on it (Milestone 2), with
 * camera pan and a debug overlay. All ball movement comes from src/sim/ball.ts;
 * this scene only reads the simulation's state and draws it.
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

  // The shot
  private phase: Phase = 'plan';
  private ball!: BallState;
  /** Where the ball last came to rest; water and out of bounds return it here. */
  private restSpot!: BallState;
  private shot: ShotState | null = null;
  private prevBall: BallState | null = null;
  private accumulator = 0;
  private boostQueued = false;
  private chargeStart = 0;
  private dragFrom = { x: 0, y: 0 };
  private aim = 0;
  private power = 0;
  /** Power chosen while planning. A preview only: the meter alone sets the real power. */
  private planPower = 0;
  private shotsTaken = 0;
  private message: Phaser.GameObjects.Container | null = null;
  private messageUntil = 0;

  // Display
  private ballImg!: Phaser.GameObjects.Image;
  private shadowImg!: Phaser.GameObjects.Image;
  private guide!: Phaser.GameObjects.Graphics;
  private meter!: Phaser.GameObjects.Graphics;
  private shotHud: Phaser.GameObjects.Container | null = null;
  private helpHud: Phaser.GameObjects.Container[] = [];

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

    for (const p of buildDrawList(course)) this.place(p);

    if (!tuning) tuning = loadTuning();
    if (!panel) {
      panel = new TuningPanel(tuning);
      if (new URLSearchParams(window.location.search).get('tune') === '1') panel.toggle(true);
    }

    this.ball = ballAtTile(course, course.start.x, course.start.y);
    this.restSpot = { ...this.ball };
    this.phase = 'plan';
    this.shot = null;
    this.shotsTaken = 0;
    this.shadowImg = this.makeSprite('ball-shadow');
    this.ballImg = this.makeSprite('ball');
    this.guide = this.add.graphics().setDepth(OVERLAY_DEPTH - 1);
    this.meter = this.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this.drawBall(this.ball);
    this.setupShotInput();

    // Camera: start on the ball, keep the course in view.
    const b = courseBounds(course);
    const margin = 48;
    this.cameras.main.setBounds(b.left - margin, b.top - margin, b.right - b.left + margin * 2, b.bottom - b.top + margin * 2);
    this.cameras.main.setRoundPixels(true);
    this.centreOnBall();

    this.drawHud(file.id, course);
    this.drawShotHud();
    this.drawOverlay();
  }

  override update(_time: number, deltaMs: number): void {
    const k = this.keys;
    const step = (PAN_SPEED * deltaMs) / 1000;
    const dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (dx || dy) this.panBy(dx * step, dy * step);
    this.updateHover();
    if (!this.course) return;
    this.updateShot(this.course, tuning!, deltaMs / 1000);
    if (this.message && this.time.now > this.messageUntil) {
      this.message.destroy();
      this.message = null;
    }
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

    // Drag with the right or middle mouse button to pan. The left button is for shots.
    this.input.mouse?.disableContextMenu();
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if ((p.rightButtonDown() || p.middleButtonDown()) && this.phase !== 'charge' && this.phase !== 'pull') {
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
  // The shot

  private makeSprite(id: string): Phaser.GameObjects.Image {
    const entry = manifest.sprites[id];
    if (!entry) throw new Error(`Sprite "${id}" is not in the asset manifest.`);
    return this.add
      .image(0, 0, id, frameIndex(entry, 'idle'))
      .setOrigin(entry.anchor[0] / entry.frameWidth, entry.anchor[1] / entry.frameHeight);
  }

  /** Put the ball and its shadow on screen. Heights in the sim are tiles; the screen uses steps. */
  private drawBall(b: BallState): void {
    const course = this.course!;
    const tx = Math.floor(b.x);
    const ty = Math.floor(b.y);
    const p = project(b.x, b.y, b.z / STEP_HEIGHT);
    const g = groundAt(course, b.x, b.y);
    // In water the ball is drawn under the see-through surface; flying over it, on top.
    const inWater = !!g && !!SURFACES.get(g.tile.surface)?.sinks && b.z <= g.h + 0.05;
    const overWater = !!g && !!SURFACES.get(g.tile.surface)?.overlaySprite && !inWater;
    const depth = overWater ? tileDepth(tx, ty, 'overlay') + 0.5 : tileDepth(tx, ty, 'ball');
    this.ballImg.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(depth);
    if (g && g.h <= b.z + 0.01 && !inWater) {
      const sp = project(b.x, b.y, g.h / STEP_HEIGHT);
      this.shadowImg.setVisible(true).setPosition(Math.round(sp.x), Math.round(sp.y)).setDepth(tileDepth(tx, ty, 'shadow'));
    } else {
      this.shadowImg.setVisible(false);
    }
    this.ballScreen = { x: p.x, y: p.y };
  }

  private setupShotInput(): void {
    const kb = this.input.keyboard!;
    const onKey = (key: string, fn: () => void) => kb.on(`keydown-${key}`, fn);
    onKey('T', () => {
      settings.type = settings.type === 'ground' ? 'lofted' : 'ground';
      this.drawShotHud();
    });
    const spin = (which: 'top' | 'side', d: number) => () => {
      settings[which] = Phaser.Math.Clamp(settings[which] + d, -SPIN_LEVELS, SPIN_LEVELS);
      this.drawShotHud();
    };
    onKey('X', spin('top', 1));
    onKey('Z', spin('top', -1));
    onKey('E', spin('side', 1));
    onKey('Q', spin('side', -1));
    onKey('P', () => {
      settings.quickShot = !settings.quickShot;
      this.cancelCharge();
      this.drawShotHud();
    });
    onKey('R', () => {
      if (!this.course) return;
      this.ball = ballAtTile(this.course, this.course.start.x, this.course.start.y);
      this.restSpot = { ...this.ball };
      this.shot = null;
      this.phase = 'plan';
      this.power = 0;
      this.planPower = 0;
      this.drawBall(this.ball);
      this.centreOnBall();
    });
    onKey('U', () => panel?.toggle());
    onKey('H', () => {
      settings.help = !settings.help;
      for (const h of this.helpHud) h.setVisible(settings.help);
    });
    onKey('SPACE', () => {
      if (this.phase === 'flight') this.boostQueued = true;
    });
    onKey('ESC', () => this.cancelCharge());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.course) return;
      if (p.rightButtonDown() && this.phase !== 'plan' && this.phase !== 'flight') {
        this.cancelCharge();
        return;
      }
      if (!p.leftButtonDown()) return;
      if (this.phase === 'plan') {
        this.phase = 'pull';
        this.dragFrom = { x: p.x, y: p.y };
        this.planPower = 0;
      } else if (this.phase === 'set') {
        this.phase = 'charge';
        this.chargeStart = this.time.now;
        this.power = 0;
      }
      this.drawShotHud();
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.leftButtonReleased()) return;
      if (this.phase === 'charge') this.shoot(this.power);
      else if (this.phase === 'pull') {
        if (this.planPower < 0.02) this.cancelCharge(); // a click, not a pull
        else if (settings.quickShot) this.shoot(this.planPower);
        else this.phase = 'set';
      }
      if (this.phase !== 'flight') this.drawShotHud();
    });
  }

  /** Right-click or Esc: drop the plan and start again. */
  private cancelCharge(): void {
    if (this.phase !== 'flight') this.phase = 'plan';
    this.power = 0;
    this.planPower = 0;
    this.drawShotHud();
  }

  /**
   * A release in the top `perfectWindow` of the bar. Quick-shot mode (testing
   * only) uses the same rule on the pull.
   */
  private isPerfect(power: number): boolean {
    return power >= 1 - tuning!.perfectWindow;
  }

  private command(power: number) {
    return {
      angle: this.aim,
      power,
      type: settings.type,
      topSpin: spinValue(settings.top),
      sideSpin: spinValue(settings.side),
      perfect: this.isPerfect(power),
    };
  }

  private shoot(power: number): void {
    this.power = power;
    this.shot = startShot(tuning!, this.ball, this.command(power));
    this.prevBall = { ...this.shot.ball };
    this.accumulator = 0;
    this.boostQueued = false;
    this.phase = 'flight';
    this.shotsTaken++;
    if (this.shot.cmd.perfect) this.showMessage('PERFECT!', 0xf8e048);
    this.guide.clear();
    this.drawShotHud();
  }

  private updateShot(course: Course, t: Tuning, dt: number): void {
    const pointer = this.input.activePointer;
    const ballH = this.ball.z / STEP_HEIGHT;

    if (this.phase === 'charge') {
      const m = chargeMeter((this.time.now - this.chargeStart) / 1000, t.meterPeriod, t.meterCycles);
      if (m.expired) {
        // Held too long: the meter ran out, so the ball goes anyway, weakly.
        this.shoot(t.autoLaunchPower);
        this.showMessage('TOO SLOW!', 0xa0a8c0);
        return;
      }
      this.power = m.power;
    } else if (this.phase === 'pull') {
      const zoom = this.cameras.main.zoom;
      const d = dragShot(
        { x: this.dragFrom.x / zoom, y: this.dragFrom.y / zoom },
        { x: pointer.x / zoom, y: pointer.y / zoom },
        ballH,
        t.dragFullPx,
      );
      if (d.power > 0) this.aim = d.angle;
      this.planPower = d.power;
    }

    if (this.phase !== 'flight') {
      // The guide previews the planned shot. It does not follow the meter.
      if (this.phase === 'plan' || this.planPower <= 0) this.guide.clear();
      else this.drawGuide(predictPath(course, t, this.ball, this.command(Math.max(t.minPower, this.planPower))));
      this.drawMeter();
      return;
    }

    // Flight: fixed steps of 1/120 s, drawn smoothly in between.
    const shot = this.shot!;
    this.accumulator = Math.min(this.accumulator + dt, 0.25);
    while (this.accumulator >= DT && !shot.outcome) {
      this.prevBall = { ...shot.ball };
      const boost = this.boostQueued;
      this.boostQueued = false;
      const before = shot.events.length;
      stepShot(course, t, shot, { boost });
      for (const e of shot.events.slice(before)) {
        if (e.kind === 'bounce' && e.boosted) this.showMessage('BOOST!', 0xf8e048);
      }
      this.accumulator -= DT;
    }
    const a = this.prevBall ?? shot.ball;
    const alpha = shot.outcome ? 1 : this.accumulator / DT;
    const lerp = (p: number, q: number) => p + (q - p) * alpha;
    const shown = { ...shot.ball, x: lerp(a.x, shot.ball.x), y: lerp(a.y, shot.ball.y), z: lerp(a.z, shot.ball.z) };
    this.drawBall(shown);
    // Camera follows the ball.
    this.camX += (this.ballScreen.x - VIEW_WIDTH / 2 - this.camX) * Math.min(1, dt * 6);
    this.camY += (this.ballScreen.y - VIEW_HEIGHT / 2 - this.camY) * Math.min(1, dt * 6);
    this.applyCamera();

    if (shot.outcome) this.endShot(course, shot);
    this.drawMeter();
  }

  private endShot(course: Course, shot: ShotState): void {
    const outcome = shot.outcome;
    if (outcome === 'sunk' || outcome === 'out') {
      this.showMessage(outcome === 'sunk' ? 'SANK! BACK TO LAST SPOT' : 'OUT OF BOUNDS! BACK TO LAST SPOT', 0x80c8ff);
      this.ball = { ...this.restSpot };
    } else {
      const b = shot.ball;
      const g = groundAt(course, b.x, b.y);
      this.ball = { x: b.x, y: b.y, z: g?.h ?? b.z, vx: 0, vy: 0, vz: 0, grounded: true };
      if (outcome === 'timeout') this.showMessage('SHOT STOPPED (TOOK TOO LONG)', 0xa0a8c0);
      // Only spots that can hold the ball count as a safe return point.
      if (g && SURFACES.get(g.tile.surface)?.canHoldBall) this.restSpot = { ...this.ball };
    }
    this.shot = null;
    this.prevBall = null;
    this.phase = 'plan';
    this.power = 0;
    this.planPower = 0;
    this.drawBall(this.ball);
    if (outcome === 'sunk' || outcome === 'out') this.centreOnBall();
    this.drawShotHud();
  }

  private drawGuide(points: readonly { x: number; y: number; z: number }[]): void {
    const g = this.guide;
    g.clear();
    // A dot every few steps; yellow while in the air, white on the ground.
    for (let i = 4; i < points.length; i += 4) {
      const p = points[i]!;
      const ground = groundAt(this.course!, p.x, p.y);
      const air = !ground || p.z > ground.h + 0.02;
      const s = project(p.x, p.y, p.z / STEP_HEIGHT);
      const fade = 1 - (i / points.length) * 0.6;
      g.fillStyle(air ? GUIDE_AIR : GUIDE, fade);
      g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 2, 2, 2);
    }
  }

  private drawMeter(): void {
    const m = this.meter;
    m.clear();
    const x = VIEW_WIDTH - 12;
    const y = 30;
    const h = 60;
    m.fillStyle(METER_BG, 0.9);
    m.fillRect(x - 1, y - 1, 8, h + 2);
    const showing = this.phase === 'charge' ? this.power : this.shot ? this.shot.cmd.power : settings.quickShot && this.phase === 'pull' ? this.planPower : 0;
    const fill = Math.round(showing * h);
    m.fillStyle(this.isPerfect(showing) ? METER_FULL : METER_FILL, 1);
    m.fillRect(x, y + h - fill, 6, fill);
    // The perfect zone at the top.
    m.fillStyle(METER_FULL, 0.5);
    m.fillRect(x, y, 6, Math.max(1, Math.round(h * tuning!.perfectWindow)));
    // Quarter marks.
    m.fillStyle(UI_DIM, 1);
    for (let q = 1; q < 4; q++) m.fillRect(x - 2, y + Math.round((h * q) / 4), 2, 1);
    // The planned power, as a hint for where to release.
    if (!settings.quickShot && (this.phase === 'pull' || this.phase === 'set' || this.phase === 'charge') && this.planPower > 0) {
      m.fillStyle(METER_PLAN, 1);
      m.fillRect(x - 3, y + h - Math.round(this.planPower * h), 10, 1);
    }
    // Sweeps left before the meter runs out.
    if (this.phase === 'charge') {
      const left = Math.max(0, tuning!.meterCycles - Math.floor((this.time.now - this.chargeStart) / 1000 / tuning!.meterPeriod));
      m.fillStyle(METER_FILL, 1);
      for (let i = 0; i < left; i++) m.fillRect(x + 1 + i * 3, y + h + 3, 2, 2);
    }
  }

  private drawShotHud(): void {
    this.shotHud?.destroy();
    const sign = (n: number) => (n > 0 ? `+${n}` : String(n));
    const text = [
      `SHOT: ${settings.type === 'ground' ? 'GROUND' : 'LOFTED'}`,
      `SPIN: ${settings.top === 0 ? 'NONE' : settings.top > 0 ? 'TOP' : 'BACK'} ${sign(settings.top)}`,
      `CURVE: ${settings.side === 0 ? 'NONE' : settings.side > 0 ? 'RIGHT' : 'LEFT'} ${sign(settings.side)}`,
      `STEP: ${this.stepLabel()}`,
      `SHOTS: ${this.shotsTaken}`,
    ].join('\n');
    this.shotHud = pixelText(this, manifest, 2, 10, text, { color: UI_TEXT, background: UI_BG }).setScrollFactor(0).setDepth(HUD_DEPTH);
  }

  private stepLabel(): string {
    if (settings.quickShot) return 'QUICK SHOT (TEST)';
    return { plan: '1 PULL TO PLAN', pull: '1 PULL TO PLAN', set: '2 HOLD TO CHARGE', charge: '2 RELEASE!', flight: '-' }[this.phase];
  }

  private showMessage(text: string, color: number): void {
    this.message?.destroy();
    this.message = pixelText(this, manifest, 0, 46, text, { color, background: UI_BG }).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.message.x = Math.round((VIEW_WIDTH - this.message.width) / 2);
    this.messageUntil = this.time.now + 1800;
  }

  // -------------------------------------------------------------------------
  // HUD and debug overlay

  private drawHud(id: string, course: Course): void {
    const n = `${this.courseIndex + 1}/${TEST_COURSES.length}`;
    pixelText(this, manifest, 2, 2, `${n} ${course.name}`, { color: UI_TEXT, background: UI_BG })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setName(`hud-${id}`);
    const lines = [
      'LEFT: PULL BACK TO PLAN, THEN HOLD TO CHARGE  RIGHT/ESC: RE-PLAN  T: GROUND/LOFT',
      'Z/X: SPIN  Q/E: CURVE  SPACE: BOOST  P: QUICK SHOT (TEST)  R: RESET  U: TUNING  H: HELP',
      'WASD/ARROWS OR RIGHT-DRAG: PAN  C: CENTRE  1/2/N: COURSE  G: DEBUG',
    ];
    this.helpHud = lines.map((l, i) =>
      pixelText(this, manifest, 2, VIEW_HEIGHT - 7 * (lines.length - i) - 1, l, { color: UI_DIM, background: UI_BG })
        .setScrollFactor(0)
        .setDepth(HUD_DEPTH)
        .setVisible(settings.help),
    );
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
    this.hoverPanel = pixelText(this, manifest, 2, VIEW_HEIGHT - 30, text, { color: 0xf8e048, background: UI_BG })
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
