import Phaser from 'phaser';
import { GENERATED_ID, TEST_COURSES } from '../content/courses';
import { GEN } from '../content/gen';
import { generateCourse, type GenResult } from '../gen/validate';
import type { BotMove } from '../gen/bot';
import { Rng } from '../sim/rng';
import { SeedViewer } from '../ui/seedViewer';
import { BENCH_ID, benchChoices, benchCourse } from '../content/courses/testBench';
import { SURFACES } from '../content/surfaces';
import { parseCourse, railTileList, type Course } from '../sim/course';
import { STEP_HEIGHT, type Tuning } from '../content/tuning';
import { DT, groundAt, type BallState, type ShotCommand, type ShotType } from '../sim/ball';
import {
  ballNow,
  canShoot,
  canUseAbility,
  createPlay,
  debugWin,
  drainLog,
  equipGear,
  isBoss,
  isImmune,
  previewShot,
  shieldsLeft,
  takeShot,
  tick,
  type PlayEvent,
  type PlayState,
  type Preview,
} from '../sim/play';
import { OBJECTS, RAIL } from '../content/objects';
import { RULES } from '../content/rules';
import { ABILITIES, ABILITY_IDS } from '../content/abilities';
import { SPIN_LEVELS, chargeMeter, dragShot, spinValue } from '../input/aim';
import type { TuningPanel } from '../ui/tuningPanel';
import { GEAR, GEAR_CATEGORIES, GEAR_LIST } from '../content/gear';
import { UPGRADE_LIST } from '../content/run';
import { placeGear } from '../gen/placeGear';
import { upcomingJobs, addUpgrade, bossBlueStars, debugSetCountdown, enemyModifiersFor, finishCourse, genOptionsFor, loadoutOf, rewardFor, bossHealthFor } from '../sim/run';
import { ARENAS, arenaData } from '../content/arenas';
import { activeRun, newRunSeed, persist, session, startRun, type RunCourse } from './runSession';
import { ACORNS } from '../content/consumables';
import { jobKey, madeCourse, prefetch, want, type Made } from './genQueue';
import { BOSSES } from '../content/bosses';
import { BLUE_STARS } from '../content/progress';
import { LAST_REGION } from '../content/run';
import { getPanel, getTuning, preloadAssets, shared } from './shared';
import { buildDrawList, courseBounds, pickTile, project, tileDepth, type Placement } from './iso';
import { frameIndex, type Manifest } from './manifest';
import { pixelText } from './pixelText';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';

/** Loaded from assets/manifest.json on first boot. */
let manifest: Manifest = { version: 1, sprites: {} };
/** The ?run= address starts a run only once, not on every restart. */
let runStartedFromUrl = false;

/** Debug overlay modes, cycled with the G key. */
const DEBUG_MODES = ['off', 'coords', 'heights', 'surfaces', 'areas'] as const;
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
const STAR_FILL = 0xf8d030;
const HEALTH_LOST = 0x403040;
const GOOD = 0x80f080;
/** Milestone 7 display colours: success wheel slices, the boss bar and the slam ring. */
const WHEEL_FILLED = 0x40c060;
const WHEEL_EMPTY = 0x404058;
const BOSS_BAR = 0xe04040;
const SLAM_RING = 0xff4030;
const BAD = 0xff8080;
const GUIDE_WARN = 0xf89038;
const DEBUG_OUTER = 0xf8e048;
const DEBUG_INNER = 0xff6040;
const DEBUG_PATH = 0x80c8ff;
const DEBUG_ZONE = 0xf8f040;

/** Keyboard aiming (owner, 2026-11-14: every mechanic works from the keyboard alone). Degrees per second. */
const AIM_TURN = 90;
const AIM_TURN_FINE = 20;
/** Planned power change per second while Up or Down is held. */
const PLAN_RATE = 0.6;

/** Shared by every course and kept across restarts, so live tuning sticks. */
let tuning: Tuning | null = null;
let panel: TuningPanel | null = null;

/** The test bench: what stands at the centre, and the ability to start with. Kept across restarts. */
const bench = { object: 'snoozegrub', ability: '' };
let benchShown = false;

/** Generated courses (Milestone 5): the budget in use, and the last course made (kept so R does not regenerate). */
let genBudget: number | null = null;
let lastGen: { result: GenResult; ms: number } | null = null;
let viewer: SeedViewer | null = null;
/** How fast the bot replays (B key), as a multiple of real time. */
const WATCH_SPEED = 2;
/** The bot's next shot is drawn this long before it is taken, in ms. */
const WATCH_PREVIEW = 700;

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
  /** Keep this seed (restart). Otherwise the address's ?seed= or a new random one. */
  seed?: string;
  /** Generated course: the difficulty budget. */
  budget?: number;
  /** Generated course: replay the bot's game instead of playing (B key). */
  watch?: boolean;
  /** Milestone 6: play the run's current course node. */
  run?: boolean;
}

/** Six letters and digits from a random stream, for the next generated course's seed. */
function seedFrom(rng: Rng): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[rng.int(0, 35)];
  return out;
}

/** A short random seed for a new course. The display may use Math.random; the simulation never does. */
function newSeed(): string {
  return Math.floor(Math.random() * 36 ** 6)
    .toString(36)
    .toUpperCase()
    .padStart(6, '0');
}

/**
 * Draws a course from its data file and plays it (Milestones 2 and 3), with
 * camera pan, a HUD and a debug overlay. All rules and ball movement come from
 * src/sim/play.ts and src/sim/ball.ts; this scene only reads the simulation's
 * state and draws it.
 */
export class CourseScene extends Phaser.Scene {
  private course: Course | null = null;
  private courseIndex = 0;
  private debugMode: DebugMode = 'off';
  private overlay: Phaser.GameObjects.GameObject[] = [];
  private hoverPanel: Phaser.GameObjects.Container | null = null;
  private hoverKey = '';
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'i' | 'j' | 'k' | 'l' | 'shift', Phaser.Input.Keyboard.Key>;
  private camX = 0;
  private camY = 0;
  private ballScreen = { x: 0, y: 0 };

  // The shot
  private phase: Phase = 'plan';
  private play!: PlayState;
  private seed = '';
  private prevBall: BallState | null = null;
  private accumulator = 0;
  private boostQueued = false;
  private abilityQueued = false;
  /** Wild pickup: the HUD ability slot flicks through the icons until this time. */
  private wildUntil = 0;
  private debugDyn!: Phaser.GameObjects.Graphics;
  private ballFrame = '';
  private chargeStart = 0;
  private dragFrom = { x: 0, y: 0 };
  private aim = 0;
  private power = 0;
  /** Power chosen while planning. A preview only: the meter alone sets the real power. */
  private planPower = 0;
  private message: Phaser.GameObjects.Container | null = null;
  private messageUntil = 0;
  /** Messages wait their turn so several things in one shot can all be read. */
  private messageQueue: { text: string; color: number }[] = [];

  // Display
  private ballImg!: Phaser.GameObjects.Image;
  private shadowImg!: Phaser.GameObjects.Image;
  private guide!: Phaser.GameObjects.Graphics;
  private meter!: Phaser.GameObjects.Graphics;
  private shotHud: Phaser.GameObjects.Container | null = null;
  private helpHud: Phaser.GameObjects.Container[] = [];
  private statusHud: Phaser.GameObjects.Container | null = null;
  private statusKey = '';
  private endScreen: Phaser.GameObjects.Container | null = null;
  /** Course objects on screen, by their uid in the simulation. */
  private objectImgs = new Map<string, Phaser.GameObjects.Image>();
  private exitImg: Phaser.GameObjects.Image | null = null;
  private animated: { img: Phaser.GameObjects.Image; frame: string; entry: Manifest['sprites'][string] }[] = [];
  private animPhase = -1;
  private overview = false;
  private hiddenHud: { setVisible: (v: boolean) => void }[] = [];
  /** Bot replay (B key): its shots still to take, and when the next one fires. */
  private watching = false;
  private botMoves: readonly BotMove[] = [];
  private botNext = 0;
  private botAt = 0;
  /** Thumbnail mode for the contact sheet (?thumb=1): no HUD, whole course in view. */
  private thumb = false;
  /** Milestone 6: playing the run's current course node. */
  private runMode = false;
  /** The course result has been given to the run (only once). */
  private runReported = false;

  constructor() {
    super('course');
  }

  init(data: CourseSceneData): void {
    const params = new URLSearchParams(window.location.search);
    // ?course=<id>, or #<id> (used where the address cannot carry a query, such as the shared test build).
    const wanted = params.get('course') ?? window.location.hash.slice(1);
    const fromUrl = TEST_COURSES.findIndex((c) => c.id === wanted);
    this.courseIndex = data.courseIndex ?? (fromUrl >= 0 ? fromUrl : 0);
    this.seed = data.seed ?? params.get('seed')?.toUpperCase() ?? newSeed();
    if (genBudget === null) genBudget = Number(params.get('budget')) || GEN.defaultBudget;
    if (data.budget !== undefined) genBudget = data.budget;
    genBudget = Phaser.Math.Clamp(Math.round(genBudget), GEN.minBudget, GEN.maxBudget);
    this.watching = data.watch === true;
    this.runMode = data.run === true && !!session.run?.current;
    this.thumb = params.get('thumb') === '1';
    // ?bench=<object id> opens the test bench with that thing at its centre (for example ?course=test-bench&bench=rail).
    if (!benchShown && params.get('bench') !== null) bench.object = params.get('bench')!;
    const urlDebug = params.get('debug');
    this.debugMode = data.debug ?? (DEBUG_MODES.includes(urlDebug as DebugMode) ? (urlDebug as DebugMode) : urlDebug === '1' ? 'coords' : 'off');
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    manifest = shared.manifest;
    tuning = getTuning();
    if (this.runMode) this.seed = session.run!.current!.courseSeed;
    // ?run=<seed> (or #run, #run=<seed> where the address cannot carry a query) starts a run (Milestone 6), once.
    const hash = window.location.hash.slice(1);
    const runParam = new URLSearchParams(window.location.search).get('run') ?? (hash === 'run' || hash.startsWith('run=') ? hash.slice(4) : null);
    if (runParam !== null && !runStartedFromUrl) {
      runStartedFromUrl = true;
      startRun(runParam.toUpperCase() || newRunSeed());
      this.scene.start('map');
      return;
    }
    const file = TEST_COURSES[this.courseIndex]!;
    let data: unknown = file.data;
    const arena = this.runMode ? session.run!.current!.arena : null;
    if (arena) {
      // Milestone 7: a boss fight is in a hand-built arena, not generated.
      data = arenaData(arena, session.run!.current!.boss ?? 'stagwarden');
    } else if (this.runMode) {
      // Made in the background already? Then no loading screen at all.
      const ahead = this.runCourse() ? null : madeCourse(this.runKey());
      if (ahead) this.storeRunCourse(ahead);
      const ready = this.runCourse();
      if (!ready) {
        this.course = null;
        this.setupKeys();
        this.showLoading();
        this.requestRunGen();
        return;
      }
      data = ready.raw;
    } else if (file.id === BENCH_ID) data = benchCourse(bench.object);
    else if (file.id === GENERATED_ID) {
      const ready = this.cachedGen();
      if (!ready) {
        // Not made yet: show the loading screen and make it in the background, then start again.
        this.course = null;
        this.setupKeys();
        this.showLoading();
        this.requestGen();
        return;
      }
      data = ready.result.raw;
    }
    const parsed = parseCourse(data);
    this.setupKeys();
    if (!parsed.ok) {
      this.course = null;
      this.showErrors(file.id, parsed.errors);
      return;
    }
    const course = parsed.course;
    this.course = course;

    this.animated = [];
    this.animPhase = -1;
    this.overview = false;
    this.hiddenHud = [];
    for (const p of buildDrawList(course)) if (p.kind !== 'exit') this.place(p);

    panel = getPanel();

    const run = this.runMode ? session.run : null;
    this.play = createPlay(course, tuning, { seed: this.runMode ? run!.current!.courseSeed : this.seed, ...(run && { loadout: loadoutOf(run), enemyModifiers: enemyModifiersFor(run), bossHealth: bossHealthFor(run) }) });
    this.runReported = false;
    this.setRunPanel();
    // Owner, 2026-11-18: while this course is played, make the next ones in the background.
    if (run && run.status === 'course') prefetch(upcomingJobs(run));
    if (file.id === BENCH_ID && bench.ability) this.play.ability = bench.ability;
    // The first visit to the bench opens the panel, so the choices are easy to find.
    if (file.id === BENCH_ID && !benchShown) {
      benchShown = true;
      panel?.toggle(true);
    }
    panel?.setBench({
      choices: benchChoices(),
      abilities: [{ id: '', label: '(none)' }, ...ABILITY_IDS.map((id) => ({ id, label: ABILITIES.get(id)!.name }))],
      current: bench,
      onLoad: (object, ability) => {
        bench.object = object;
        bench.ability = ability;
        this.switchCourse(TEST_COURSES.findIndex((c) => c.id === BENCH_ID));
      },
    });
    this.phase = 'plan';
    // Each course starts with no spin or curve (owner, 2026-11-15).
    settings.top = 0;
    settings.side = 0;
    this.messageQueue = [];
    this.message = null;
    this.endScreen = null;
    this.statusKey = '';
    this.objectImgs = new Map();
    this.shadowImg = this.makeSprite('ball-shadow');
    this.ballImg = this.makeSprite(this.play.character.sprite);
    this.exitImg = this.makeSprite('exit', 'closed');
    this.guide = this.add.graphics().setDepth(OVERLAY_DEPTH - 1);
    this.debugDyn = this.add.graphics().setDepth(OVERLAY_DEPTH - 2);
    this.syncObjects();
    this.drawRails(course);
    this.accumulator = 0;
    this.boostQueued = false;
    this.abilityQueued = false;
    this.wildUntil = 0;
    this.ballFrame = '';
    this.meter = this.add.graphics().setScrollFactor(0).setDepth(HUD_DEPTH);
    this.drawBall(this.play.ball);
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

    if (file.id === GENERATED_ID) {
      this.updateViewer();
      const bot = lastGen!.result.bot;
      this.botMoves = this.watching && bot ? bot.moves : [];
      this.botNext = 0;
      this.botAt = 0;
      if (this.watching) this.showMessage(bot ? 'WATCHING THE BOT' : 'NO BOT GAME TO WATCH', 0x80c8ff);
      if (!bot) this.watching = false;
    } else this.watching = false;
    if (this.thumb) this.thumbView(course);
  }

  /**
   * Guard rails (Milestone 5b): a post at every tile centre and the bar in
   * quarter-tile pieces, each at the ground height under it, so it follows slopes.
   */
  private drawRails(course: Course): void {
    for (const line of course.rails) {
      const tiles = railTileList(line);
      tiles.forEach((t, k) => {
        const z = groundAt(course, t.x + 0.5, t.y + 0.5)?.h ?? 0;
        const p = project(t.x + 0.5, t.y + 0.5, z / STEP_HEIGHT);
        this.makeSprite(RAIL.postSprite).setPosition(p.x, p.y).setDepth(this.standingDepth(t.x + 0.5, t.y + 0.5));
        const n = tiles[k + 1];
        if (!n) return;
        const dx = n.x - t.x;
        const dy = n.y - t.y;
        const frame = dy === 0 ? 'x' : dx === 0 ? 'y' : dx === dy ? 'd1' : 'd2';
        for (const f of [0.125, 0.375, 0.625, 0.875]) {
          const x = t.x + 0.5 + dx * f;
          const y = t.y + 0.5 + dy * f;
          const h = groundAt(course, x, y)?.h ?? z;
          const q = project(x, y, h / STEP_HEIGHT);
          this.makeSprite(RAIL.barSprite, frame).setPosition(q.x, q.y).setDepth(this.standingDepth(x, y));
        }
      });
    }
  }

  /** The generated course for this seed and budget, if it has been made (kept for restarts). */
  private cachedGen(): { result: GenResult; ms: number } | null {
    return lastGen && lastGen.result.seed === this.seed && lastGen.result.budget === genBudget ? lastGen : null;
  }

  /** The run's current course: seed, budget and the bot's loadout. A different key means it must be made again. */
  private runKey(): string {
    const run = session.run!;
    const cur = run.current!;
    return jobKey(cur.courseSeed, cur.budget, genOptionsFor(run));
  }

  private runCourse(): RunCourse | null {
    return session.course && session.course.key === this.runKey() ? session.course : null;
  }

  /**
   * Make the run's current course in a background worker, with the bot playing
   * the player's upgrades, gear and ability (sheet section 4.3), place its gear
   * item if it has one, then start again.
   */
  private requestRunGen(): void {
    const run = session.run!;
    const cur = run.current!;
    const key = this.runKey();
    if (session.pending === key) return;
    session.pending = key;
    const opts = genOptionsFor(run);
    const done = (m: Made) => {
      if (session.pending !== key) return;
      session.pending = null;
      this.storeRunCourse(m);
      if (this.scene.isActive()) this.scene.restart({ run: true, debug: this.debugMode });
    };
    // Owner, 2026-11-18: often it was made in the background already (genQueue.ts).
    want(cur.courseSeed, cur.budget, opts, done);
  }

  /** A made course becomes the run's current course: its gear item (if any) is placed on it. */
  private storeRunCourse({ result, ms }: Made): void {
    const cur = session.run!.current!;
    let raw = result.raw;
    let course = result.course;
    if (cur.gear) ({ raw, course } = placeGear(raw, course, cur.gear, cur.courseSeed));
    session.course = { key: this.runKey(), raw, course, result, ms };
  }

  /** The course result goes back to the run, once. */
  private reportRun(): void {
    const run = session.run;
    if (!this.runMode || this.runReported || !run || run.status !== 'course') return;
    this.runReported = true;
    const p = this.play;
    finishCourse(run, { won: p.status === 'won', lostBy: p.lostBy, health: p.health, wallet: p.wallet, ability: p.ability, gear: p.gear, blueStars: p.blueStars });
    session.course = null;
    // A boss win deposits its blue stars at once (owner, 2026-11-17): save them now.
    persist();
  }

  /** A minion vanishing when its boss falls. */
  private puff(uid: string): void {
    const e = this.play.enemies.find((x) => x.uid === uid);
    if (!e) return;
    const img = this.makeSprite('puff', '0');
    const p = project(e.x, e.y, e.z / STEP_HEIGHT);
    img.setPosition(Math.round(p.x), Math.round(p.y)).setDepth(this.standingDepth(e.x, e.y) + 0.1);
    const entry = manifest.sprites.puff!;
    [1, 2].forEach((f, i) => this.time.delayedCall(120 * (i + 1), () => img.setTexture('puff', frameIndex(entry, String(f)))));
    this.time.delayedCall(400, () => img.destroy());
  }

  /** Key 7: start a run, or go back to the one in progress. */
  private openRun(): void {
    const run = activeRun();
    if (!run) {
      // Milestone 7: runs start from the Burrow.
      this.scene.start('burrow');
    } else if (run.status === 'course') {
      if (!this.runMode) this.scene.restart({ run: true, debug: this.debugMode });
    } else if (run.status === 'shop' || run.status === 'cache') this.scene.start('town');
    else this.scene.start('map');
  }

  /** The run section of the U panel (testing aids). */
  private setRunPanel(): void {
    const run = activeRun();
    const p = panel;
    if (!p) return;
    if (!run) {
      p.setRun(null);
      return;
    }
    p.setRun({
      gear: GEAR_LIST.map((g) => ({ id: g.id, label: `${g.name} (${g.rarity})` })),
      upgrades: UPGRADE_LIST.map((u) => ({ id: u.id, label: u.name })),
      countdown: run.countdown,
      canWin: this.runMode,
      onStars: () => {
        if (this.runMode) this.play.wallet += 20;
        else run.wallet += 20;
        this.statusKey = '';
      },
      onGear: (id) => {
        if (this.runMode) equipGear(this.play, id);
        this.statusKey = '';
        this.showMessage(`GOT ${GEAR.get(id)!.name.toUpperCase()}`, GOOD);
      },
      onUpgrade: (id) => {
        addUpgrade(run, id);
        this.showMessage(this.runMode ? 'UPGRADE ADDED: IT APPLIES FROM THE NEXT COURSE' : 'UPGRADE ADDED', GOOD);
      },
      onCountdown: (n) => debugSetCountdown(run, n),
      onWin: () => {
        if (!this.runMode || this.play.status !== 'playing') return;
        debugWin(this.play);
        this.endShot();
      },
    });
    // Milestone 7: in a boss fight, jump the boss to a phase (sheet section 8.2).
    const boss = this.runMode ? this.play.enemies.find((e) => isBoss(e)) : undefined;
    const setHealth = (n: number) => () => {
      if (!boss || boss.defeated) return;
      boss.health = Math.min(n, boss.health);
      boss.phase = Math.max(boss.phase, n <= boss.stats.get('health') / 3 ? 2 : n <= (boss.stats.get('health') * 2) / 3 ? 1 : 0);
      boss.slamMark = null;
    };
    p.setProgress(
      boss
        ? {
            title: 'Boss testing aids',
            buttons: [
              { label: 'Boss to phase 2', onClick: setHealth(Math.floor((boss.stats.get('health') * 2) / 3)) },
              { label: 'Boss to phase 3', onClick: setHealth(Math.floor(boss.stats.get('health') / 3)) },
              { label: 'Boss to 1 health', onClick: setHealth(1) },
            ],
          }
        : null,
    );
  }

  /** Make the course in a background worker (or right here if workers are not available), then start again. */
  private requestGen(): void {
    const seed = this.seed;
    const budget = genBudget!;
    const done = (result: GenResult, ms: number) => {
      lastGen = { result, ms };
      (result.fallback ? console.warn : console.info)(`${result.summary}, ${Math.round(ms)} ms`);
      // Only if the player has not moved on to something else meanwhile.
      if (this.seed === seed && genBudget === budget && this.scene.isActive()) this.scene.restart({ courseIndex: this.courseIndex, debug: this.debugMode, seed, budget, watch: this.watching });
    };
    try {
      const worker = new Worker(new URL('./genWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ result: GenResult; ms: number }>) => {
        worker.terminate();
        done(e.data.result, e.data.ms);
      };
      worker.postMessage({ seed, budget, tuning });
    } catch {
      this.time.delayedCall(50, () => {
        const t0 = performance.now();
        const result = generateCourse(seed, budget, tuning!);
        done(result, performance.now() - t0);
      });
    }
  }

  /** Loading screen while a course is made (owner, 2026-11-15): a ball bouncing along a strip of checkered ground. */
  private showLoading(): void {
    const cx = VIEW_WIDTH / 2;
    const cy = VIEW_HEIGHT / 2;
    this.cameras.main.setScroll(0, 0);
    const cur = this.runMode ? session.run?.current : null;
    const what = cur ? `MAKING THE NEXT COURSE  ${cur.type === 'hard' ? 'HARD COURSE' : 'COURSE'}  BUDGET ${cur.budget}` : `GENERATING THE JOURNEY  #${this.seed}  BUDGET ${genBudget}`;
    const title = pixelText(this, manifest, 0, 0, what, { color: UI_TEXT, background: UI_BG }).setScrollFactor(0);
    title.setPosition(Math.round(cx - title.width / 2), cy - 40);
    const hint = pixelText(this, manifest, 0, 0, 'BIG COURSES TAKE A FEW SECONDS: THE BOT IS CHECKING IT CAN BE BEATEN', { color: UI_DIM, background: UI_BG }).setScrollFactor(0);
    hint.setPosition(Math.round(cx - hint.width / 2), cy + 34);
    // A strip of checkered tiles, drawn from the real tile sprites.
    const tileEntry = manifest.sprites['tile-grass']!;
    for (let i = -4; i <= 4; i++) {
      const p = { x: cx + i * 16, y: cy + 12 + (i % 2 === 0 ? 0 : 0) };
      this.add
        .image(p.x, p.y + Math.abs(i) * 0, 'tile-grass', frameIndex(tileEntry, i % 2 === 0 ? '0000' : '0000b'))
        .setOrigin(tileEntry.anchor[0] / tileEntry.frameWidth, tileEntry.anchor[1] / tileEntry.frameHeight)
        .setScrollFactor(0);
    }
    const ball = this.makeSprite('ball').setScrollFactor(0).setPosition(cx - 64, cy + 8).setDepth(10);
    const shadow = this.makeSprite('ball-shadow').setScrollFactor(0).setPosition(cx - 64, cy + 12).setDepth(9);
    this.tweens.add({ targets: [ball, shadow], x: cx + 64, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: ball, y: cy - 6, duration: 230, yoyo: true, repeat: -1, ease: 'Quad.easeOut' });
  }

  /** Thumbnail for the contact sheet: no HUD, zoomed out so the whole course shows. */
  private thumbView(course: Course): void {
    const b = courseBounds(course);
    const cam = this.cameras.main;
    const zoom = Math.min(1, VIEW_WIDTH / (b.right - b.left + 16), VIEW_HEIGHT / (b.bottom - b.top + 16));
    cam.removeBounds();
    cam.setZoom(zoom);
    cam.centerOn((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    for (const o of this.children.list) {
      const hud = o as unknown as { scrollFactorX?: number; setVisible?: (v: boolean) => void };
      if (hud.scrollFactorX === 0) hud.setVisible?.(false);
    }
    this.statusHud?.setVisible(false);
  }

  private updateViewer(): void {
    if (!viewer || !lastGen) return;
    const { result: r, ms } = lastGen;
    const lines: string[] = [];
    lines.push(r.fallback ? 'Every attempt failed: this is the fallback course.' : `Accepted on attempt ${r.attempts}.`);
    const rej = Object.entries(r.rejections);
    lines.push(rej.length ? `Rejected: ${rej.map(([k, n]) => `${k} x${n}`).join(', ')}` : 'No rejections.');
    lines.push(`Generated in ${Math.round(ms)} ms.`);
    if (r.bot) lines.push(`Bot: won in ${r.bot.shots} shots with ${r.bot.health} health (${r.bot.simulated} shots tried).`);
    if (r.meta) {
      const s = r.meta.spend;
      lines.push(`Budget ${r.budget}: terrain ${s.terrain}, enemies ${s.enemies}, obstacles ${s.obstacles}, hazards ${s.hazards}.`);
      lines.push(`${r.meta.enemies} enemies, ${r.meta.stars} stars on offer, quota ${r.course.quota}.`);
      const areas = r.meta.terrain.regions.filter((g) => g.kind !== 'pocket').map((g) => `${g.name}${g.steep ? ' (steep)' : ''}`);
      lines.push(`${r.course.width} x ${r.course.height} tiles. Journey: ${areas.join(' > ')}`);
      if (r.meta.terrain.setPieces.length) lines.push(`Set pieces: ${r.meta.terrain.setPieces.join(', ')}`);
    }
    viewer.show({ seed: r.seed, budget: r.budget, passed: !r.fallback, lines, json: JSON.stringify(r.raw, null, 2) });
  }

  /** Load a generated course (key 6, the seed viewer, [ and ], Enter after a win). */
  private loadGenerated(seed: string, budget: number, watch = false): void {
    this.scene.restart({ courseIndex: TEST_COURSES.findIndex((c) => c.id === GENERATED_ID), debug: this.debugMode, seed, budget, watch });
  }

  private get isGenerated(): boolean {
    return TEST_COURSES[this.courseIndex]?.id === GENERATED_ID;
  }

  override update(_time: number, deltaMs: number): void {
    const k = this.keys;
    const step = (PAN_SPEED * deltaMs) / 1000;
    // Camera pan moved to I/J/K/L: the arrows and WASD aim (owner, 2026-11-14).
    const dx = (k.l.isDown ? 1 : 0) - (k.j.isDown ? 1 : 0);
    const dy = (k.k.isDown ? 1 : 0) - (k.i.isDown ? 1 : 0);
    if (dx || dy) this.panBy(dx * step, dy * step);
    this.updateHover();
    if (!this.course) return;
    this.updateShot(tuning!, deltaMs / 1000);
    this.animateTiles();
    this.syncObjects();
    this.drawStatusHud();
    this.drawBossHud();
    this.animateWheels();
    if (this.message && this.time.now > this.messageUntil) {
      this.message.destroy();
      this.message = null;
    }
    if (!this.message && this.messageQueue.length) {
      const m = this.messageQueue.shift()!;
      this.showMessage(m.text, m.color);
    }
  }

  // -------------------------------------------------------------------------

  private place(p: Placement): void {
    const entry = manifest.sprites[p.sprite];
    if (!entry) throw new Error(`Sprite "${p.sprite}" is not in the asset manifest.`);
    const img = this.add
      .image(p.x, p.y, p.sprite, frameIndex(entry, p.frame))
      .setOrigin(entry.anchor[0] / entry.frameWidth, entry.anchor[1] / entry.frameHeight)
      .setDepth(p.depth);
    // Animated overlays (water shimmer, Milestone 5b) have frames "<shape>~1", "<shape>~2", ...
    if (entry.frames.includes(`${p.frame}~1`)) this.animated.push({ img, frame: p.frame, entry });
  }

  /** Step animated tiles (water shimmer) every quarter second. */
  private animateTiles(): void {
    const phase = Math.floor(this.time.now / 250);
    if (phase === this.animPhase) return;
    this.animPhase = phase;
    for (const a of this.animated) {
      const n = a.entry.frames.filter((f) => f.startsWith(`${a.frame}~`)).length + 1;
      const k = phase % n;
      a.img.setFrame(frameIndex(a.entry, k === 0 ? a.frame : `${a.frame}~${k}`));
    }
  }

  /** A splash where something entered or skipped off water. */
  private splash(x: number, y: number): void {
    const g = groundAt(this.course!, x, y);
    const p = project(x, y, (g?.h ?? 0) / STEP_HEIGHT);
    const img = this.makeSprite('splash', '0').setPosition(p.x, p.y).setDepth(this.standingDepth(x, y) + 0.3);
    const entry = manifest.sprites['splash']!;
    for (let f = 1; f < 4; f++) this.time.delayedCall(f * 90, () => img.setFrame(frameIndex(entry, String(f))));
    this.time.delayedCall(360, () => img.destroy());
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
      i: kb.addKey(K.I),
      j: kb.addKey(K.J),
      k: kb.addKey(K.K),
      l: kb.addKey(K.L),
      shift: kb.addKey(K.SHIFT),
    };
    kb.on('keydown-G', () => this.cycleDebug());
    kb.on('keydown-C', () => this.centreOnBall());
    kb.on('keydown-O', () => this.toggleOverview());
    kb.on('keydown-ONE', () => this.switchCourse(0));
    kb.on('keydown-TWO', () => this.switchCourse(1));
    kb.on('keydown-THREE', () => this.switchCourse(2));
    kb.on('keydown-FOUR', () => this.switchCourse(3));
    kb.on('keydown-FIVE', () => this.switchCourse(4));
    kb.on('keydown-SIX', () => this.loadGenerated(this.isGenerated ? this.seed : newSeed(), genBudget!));
    // Generated course: [ and ] lower or raise the budget by 2 and make a new course.
    kb.on('keydown-OPEN_BRACKET', () => this.isGenerated && this.loadGenerated(newSeed(), Math.max(GEN.minBudget, genBudget! - 2)));
    kb.on('keydown-CLOSED_BRACKET', () => this.isGenerated && this.loadGenerated(newSeed(), Math.min(GEN.maxBudget, genBudget! + 2)));
    kb.on('keydown-V', () => {
      if (!viewer) viewer = new SeedViewer({ generate: (seed, budget) => this.loadGenerated(seed, budget), watchBot: () => this.loadGenerated(this.seed, genBudget!, true) });
      viewer.toggle();
      if (viewer.visible && !this.isGenerated) this.loadGenerated(newSeed(), genBudget!);
      else this.updateViewer();
    });
    kb.on('keydown-B', () => this.isGenerated && this.loadGenerated(this.seed, genBudget!, !this.watching));
    kb.on('keydown-N', () => this.switchCourse((this.courseIndex + 1) % TEST_COURSES.length));
    kb.on('keydown-SEVEN', () => this.openRun());

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

  /** Start this course again from the beginning, with the same seed. */
  private restartCourse(): void {
    this.scene.restart({ courseIndex: this.courseIndex, debug: this.debugMode, seed: this.seed, ...(this.isGenerated && { budget: genBudget! }) });
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

  /** Overview (O key, Milestone 5b): zoom out to the whole course; O again goes back to the ball. */
  private toggleOverview(): void {
    if (!this.course) return;
    const cam = this.cameras.main;
    const b = courseBounds(this.course);
    this.overview = !this.overview;
    const hud = this.children.list.filter((o) => (o as unknown as { scrollFactorX?: number }).scrollFactorX === 0) as unknown as { setVisible: (v: boolean) => void; visible: boolean }[];
    if (this.overview) {
      this.hiddenHud = hud.filter((o) => o.visible);
      for (const o of this.hiddenHud) o.setVisible(false);
      cam.removeBounds();
      cam.setZoom(Math.min(1, VIEW_WIDTH / (b.right - b.left + 16), VIEW_HEIGHT / (b.bottom - b.top + 16)));
      cam.centerOn((b.left + b.right) / 2, (b.top + b.bottom) / 2);
    } else {
      cam.setZoom(1);
      const margin = 48;
      cam.setBounds(b.left - margin, b.top - margin, b.right - b.left + margin * 2, b.bottom - b.top + margin * 2);
      for (const o of this.hiddenHud) o.setVisible(true);
      this.hiddenHud = [];
      this.centreOnBall();
    }
  }

  private applyCamera(): void {
    if (this.overview) return;
    const cam = this.cameras.main;
    // Keep our own position clamped to the bounds so panning stops cleanly at the edges.
    const bx = cam.getBounds();
    this.camX = Phaser.Math.Clamp(this.camX, bx.x, Math.max(bx.x, bx.right - VIEW_WIDTH));
    this.camY = Phaser.Math.Clamp(this.camY, bx.y, Math.max(bx.y, bx.bottom - VIEW_HEIGHT));
    cam.setScroll(Math.round(this.camX), Math.round(this.camY));
  }

  // -------------------------------------------------------------------------
  // The shot

  private makeSprite(id: string, frame = 'idle'): Phaser.GameObjects.Image {
    const entry = manifest.sprites[id];
    if (!entry) throw new Error(`Sprite "${id}" is not in the asset manifest.`);
    return this.add
      .image(0, 0, id, frameIndex(entry, frame))
      .setOrigin(entry.anchor[0] / entry.frameWidth, entry.anchor[1] / entry.frameHeight);
  }

  /**
   * Draw order for things standing on a tile: by their spot inside the tile, so
   * the ball is hidden behind an enemy when it is further back, and in front of
   * it when nearer. Objects sit at the tile centre.
   */
  private standingDepth(x: number, y: number): number {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    return tileDepth(tx, ty, 'ball') + (x - tx + (y - ty) - 1) * 0.4;
  }

  /** Make the sprites for course objects match the simulation: new things appear, gone ones are hidden. */
  private syncObjects(): void {
    const play = this.play;
    const now = this.time.now;
    const bob = Math.round(Math.sin(now / 250) * 1);
    const seen = new Set<string>();
    const show = (uid: string, sprite: string, x: number, y: number, z: number, opts: { frame?: string; lift?: number; depth?: number; alpha?: number } = {}) => {
      seen.add(uid);
      let img = this.objectImgs.get(uid);
      if (!img) {
        img = this.makeSprite(sprite, opts.frame ?? manifest.sprites[sprite]?.frames[0] ?? 'idle');
        this.objectImgs.set(uid, img);
      }
      const entry = manifest.sprites[sprite]!;
      if (img.texture.key !== sprite || opts.frame) img.setTexture(sprite, frameIndex(entry, opts.frame ?? entry.frames[0]!));
      const p = project(x, y, z / STEP_HEIGHT);
      img
        .setVisible(true)
        .setAlpha(opts.alpha ?? 1)
        .setPosition(Math.round(p.x), Math.round(p.y) - (opts.lift ?? 0))
        .setDepth(opts.depth ?? this.standingDepth(x, y));
    };
    const ball = ballNow(play);
    const moving = !!play.shot;

    for (const b of play.blockers) show(b.uid, b.def.sprite, b.x, b.y, b.z);
    for (const m of play.movers) show(m.uid, m.def.sprite, m.x, m.y, m.z, m.def.motion.kind === 'gate' ? { frame: m.open ? 'open' : 'closed' } : {});
    for (const b of play.breakables) {
      if (b.broken) continue;
      if (!b.def.shape) show(b.uid, b.def.sprite, b.x, b.y, b.z, { depth: tileDepth(b.tx, b.ty, 'arrow') });
      else if (b.def.sprite === 'secured-crate') show(b.uid, b.def.sprite, b.x, b.y, b.z, { frame: b.health < b.def.health ? 'cracked' : 'whole' });
      else show(b.uid, b.def.sprite, b.x, b.y, b.z);
    }
    for (const e of play.enemies) {
      if (e.defeated) continue;
      if (e.burrowed) {
        // Set off: the hill shakes for the moment before the Mole pops out.
        const shake = e.popAt !== null ? (Math.floor(now / 40) % 2) * 2 : 0;
        show(e.uid, 'molehill', e.x, e.y, e.z, { depth: tileDepth(Math.floor(e.x), Math.floor(e.y), 'shadow'), lift: shake });
        continue;
      }
      // In-game cue: a sentinel's eyes flash (it blinks) when the ball comes near its inner radius.
      const inner = e.stats.get('innerRadius');
      const near = moving && inner > 0 && e.def.triggers.passBy !== 'none' && Math.hypot(ball.x - e.x, ball.y - e.y) < inner + 0.5;
      show(e.uid, e.def.sprite, e.x, e.y, e.z, { alpha: near && Math.floor(now / 80) % 2 ? 0.45 : 1, ...(isBoss(e) && { frame: `phase${e.phase + 1}` }) });
      if (e.activated) show(`${e.uid}:alert`, 'alert', e.x, e.y, e.z, { lift: 18 + bob, depth: HUD_DEPTH - 10 });
      if (e.statuses.some((st) => st.id === 'stunned')) show(`${e.uid}:stun`, 'icon-stunned', e.x, e.y, e.z, { lift: 20, depth: HUD_DEPTH - 10 });
      if (e.statuses.some((st) => st.id === 'burning')) show(`${e.uid}:burn`, 'icon-burning', e.x, e.y, e.z, { lift: 31, depth: HUD_DEPTH - 10 });
      if (e.lobTarget) {
        const z = groundAt(play.course, e.lobTarget.x, e.lobTarget.y)?.h ?? 0;
        show(`${e.uid}:ring`, 'target-ring', e.lobTarget.x, e.lobTarget.y, z, {
          depth: tileDepth(Math.floor(e.lobTarget.x), Math.floor(e.lobTarget.y), 'shadow'),
          alpha: 0.6 + 0.4 * Math.abs(Math.sin(now / 200)),
        });
      }
    }
    for (const sd of play.seeds) show(sd.uid, 'seed', sd.shot.ball.x, sd.shot.ball.y, sd.shot.ball.z);
    for (const f of play.flags) {
      show(f.uid, 'flag-pole', f.x, f.y, f.z, { frame: f.raised ? 'raised' : 'lowered' });
      // Owner, 2026-11-14: a star hovers above a raised flag: the star secured by that defeat.
      if (f.raised) show(`${f.uid}:star`, 'star-marker', f.x, f.y, f.z, { lift: 30 + bob, depth: this.standingDepth(f.x, f.y) + 0.01 });
    }
    for (const c of play.clouds) {
      const g = groundAt(play.course, c.x, c.y)?.h ?? 0;
      show(`${c.uid}:shadow`, 'ball-shadow', c.x, c.y, g, { depth: tileDepth(Math.floor(c.x), Math.floor(c.y), 'shadow'), alpha: 0.9 });
      this.objectImgs.get(`${c.uid}:shadow`)?.setScale(3.5, 3);
      const flash = Math.floor(now / 120 + c.x * 3) % 17 === 0;
      show(c.uid, c.def.sprite, c.x, c.y, g, { frame: flash ? 'flash' : 'idle', lift: 20 + bob, depth: OVERLAY_DEPTH - 20 });
    }
    for (const p of play.pickups) if (!p.taken) show(p.uid, p.def.sprite, p.x, p.y, p.z, { lift: 2 + bob });
    // Gear on the ground (Milestone 6): a dropped item shows faded while it cannot be picked up yet.
    for (const g of play.gearItems) if (!g.taken) show(g.uid, GEAR.get(g.item)!.icon, g.x, g.y, g.z, { lift: 3 + bob, alpha: play.clock < g.lockUntil ? 0.5 : 1 });
    for (const [uid, img] of this.objectImgs) if (!seen.has(uid)) img.setVisible(false);

    if (this.exitImg) {
      const c = play.course;
      const t = groundAt(c, c.exit.x + 0.5, c.exit.y + 0.5);
      const p = project(c.exit.x + 0.5, c.exit.y + 0.5, (t?.h ?? 0) / STEP_HEIGHT);
      const entry = manifest.sprites.exit!;
      this.exitImg
        .setTexture('exit', frameIndex(entry, play.exitOpen ? 'open' : 'closed'))
        .setPosition(Math.round(p.x), Math.round(p.y))
        .setDepth(tileDepth(c.exit.x, c.exit.y, 'exit'));
    }
    this.drawDebugDynamic();
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
    const depth = overWater ? tileDepth(tx, ty, 'overlay') + 0.5 : this.standingDepth(b.x, b.y);
    // Tornado: the ball becomes a small whirlwind. Immune after damage: it blinks.
    const frame = this.play.tornado ? `t${Math.floor(this.time.now / 60) % 4}` : 'ball';
    if (frame !== this.ballFrame) {
      this.ballFrame = frame;
      if (frame === 'ball') this.ballImg.setTexture(this.play.character.sprite, 0);
      else this.ballImg.setTexture('ball-tornado', frameIndex(manifest.sprites['ball-tornado']!, frame.slice(1)));
      const id = frame === 'ball' ? this.play.character.sprite : 'ball-tornado';
      const e = manifest.sprites[id]!;
      this.ballImg.setOrigin(e.anchor[0] / e.frameWidth, e.anchor[1] / e.frameHeight);
    }
    this.ballImg
      .setPosition(Math.round(p.x), Math.round(p.y))
      .setDepth(depth)
      .setAlpha(isImmune(this.play) && Math.floor(this.time.now / 70) % 2 ? 0.35 : 1);
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
      if (this.runMode) this.showMessage('NO RESTARTS IN A RUN', BAD);
      else this.restartCourse();
    });
    onKey('ENTER', () => {
      if (this.runMode) {
        if (this.play.status === 'playing') return;
        this.reportRun();
        this.scene.start('map');
        return;
      }
      if (this.play.status === 'won' && this.isGenerated) {
        // Owner, 2026-11-15: the next generated course's budget rises by a random 0 to 4, from the seed.
        const rng = Rng.fromSeed(`next/${this.seed}/${genBudget}`);
        const budget = Math.min(GEN.maxBudget, genBudget! + rng.int(GEN.climbMin, GEN.climbMax));
        this.loadGenerated(seedFrom(rng), budget);
      } else if (this.play.status === 'won') this.switchCourse((this.courseIndex + 1) % TEST_COURSES.length);
      else if (this.play.status === 'lost') this.restartCourse();
    });
    onKey('U', () => panel?.toggle());
    onKey('H', () => {
      settings.help = !settings.help;
      for (const h of this.helpHud) h.setVisible(settings.help);
    });
    // Space: bounce boost in flight; while aiming, hold to charge and release to shoot (keyboard play).
    onKey('SPACE', () => {
      if (this.phase === 'flight') {
        this.boostQueued = true;
        return;
      }
      if (!this.course || !canShoot(this.play) || this.phase === 'charge' || this.phase === 'pull' || settings.quickShot) return;
      if (this.planPower <= 0) this.planPower = 0.5;
      this.phase = 'charge';
      this.chargeStart = this.time.now;
      this.power = 0;
      this.drawShotHud();
    });
    kb.on('keyup-SPACE', () => {
      if (this.phase === 'charge' && canShoot(this.play) && !this.input.activePointer.leftButtonDown()) this.shoot(this.power);
    });
    onKey('F', () => {
      if (canUseAbility(this.play)) this.abilityQueued = true;
    });
    onKey('ESC', () => this.cancelCharge());

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.course || !canShoot(this.play)) return;
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
      if (!p.leftButtonReleased() || !canShoot(this.play)) return;
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
    if (!canShoot(this.play) || this.watching) return;
    this.power = power;
    this.fire(this.command(power));
  }

  private fire(cmd: ShotCommand): void {
    this.power = cmd.power;
    const shot = takeShot(this.play, cmd);
    this.prevBall = { ...shot.ball };
    this.boostQueued = false;
    this.abilityQueued = false;
    this.phase = 'flight';
    this.messageQueue = [];
    if (shot.cmd.perfect) this.showMessage('PERFECT!', 0xf8e048);
    this.guide.clear();
    this.drawShotHud();
  }

  private updateShot(t: Tuning, dt: number): void {
    const pointer = this.input.activePointer;
    const ballH = this.play.ball.z / STEP_HEIGHT;
    const k = this.keys;

    if (this.phase === 'charge') {
      const m = chargeMeter((this.time.now - this.chargeStart) / 1000, t.meterPeriod, t.meterCycles);
      if (m.expired) {
        // Held too long: the meter ran out, so the ball goes anyway, weakly.
        this.shoot(t.autoLaunchPower);
        this.showMessage('TOO SLOW!', 0xa0a8c0);
      } else this.power = m.power;
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
    } else if ((this.phase === 'plan' || this.phase === 'set') && canShoot(this.play) && !this.watching) {
      // Keyboard aiming: Left/Right (A/D) turn the aim, Up/Down (W/S) set the planned power.
      const turn = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const pw = (k.up.isDown || k.w.isDown ? 1 : 0) - (k.down.isDown || k.s.isDown ? 1 : 0);
      if (turn || pw) {
        if (this.planPower <= 0) this.planPower = 0.5;
        this.phase = 'set';
        this.aim += (turn * (k.shift.isDown ? AIM_TURN_FINE : AIM_TURN) * Math.PI * dt) / 180;
        this.planPower = Phaser.Math.Clamp(this.planPower + pw * PLAN_RATE * dt, t.minPower, 1);
        this.drawShotHud();
      }
    }

    // The world runs all the time in fixed steps of 1/120 s: things move while you aim.
    const before = { ...ballNow(this.play) };
    const speed = this.watching ? WATCH_SPEED : 1;
    this.accumulator = Math.min(this.accumulator + dt * speed, 0.25 * speed);
    let stepped = false;
    while (this.accumulator >= DT && this.play.status === 'playing') {
      // Bot replay (B key): take its next shot on exactly the clock step it took it.
      const move = this.watching && canShoot(this.play) ? this.botMoves[this.botNext] : undefined;
      if (move) {
        if (move.clock !== this.play.clock) {
          this.watching = false;
          this.showMessage('BOT REPLAY OUT OF STEP', BAD);
        } else {
          // Show the shot it chose first; the world waits meanwhile, so the replay stays in step.
          if (!this.botAt) this.botAt = this.time.now + WATCH_PREVIEW / speed;
          if (this.time.now < this.botAt) {
            this.accumulator = 0;
            break;
          }
          this.botAt = 0;
          this.botNext++;
          this.fire(move.cmd);
        }
      }
      if (!stepped) this.prevBall = { ...ballNow(this.play) };
      stepped = true;
      const steer = this.play.tornado ? (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0) : 0;
      const input = { ...(this.boostQueued && { boost: true }), ...(this.abilityQueued && { ability: true }), ...(steer && { steer }) };
      this.boostQueued = false;
      this.abilityQueued = false;
      const shot = this.play.shot;
      const evBefore = shot?.events.length ?? 0;
      tick(this.play, input);
      if (shot) {
        for (const e of shot.events.slice(evBefore)) {
          if ((e.kind === 'bounce' && e.boosted) || e.kind === 'railBoost' || (e.kind === 'splash' && e.boosted)) this.showMessage('BOOST!', 0xf8e048);
          if (e.kind === 'splash') {
            this.splash(e.x, e.y);
            if (e.skip && !e.boosted) this.showMessage('SKIP!', 0x80c8ff);
          }
        }
      }
      this.showEvents(drainLog(this.play));
      this.accumulator -= DT;
    }
    if (!stepped) this.prevBall = before;

    // Knocked while aiming (a Trundler, a Lunger, a cloud): drop the plan and watch.
    if (this.phase !== 'flight' && !canShoot(this.play)) {
      this.phase = 'flight';
      this.power = 0;
      this.planPower = 0;
      this.guide.clear();
      this.drawShotHud();
    }
    if (this.phase === 'flight' && canShoot(this.play)) {
      this.endShot();
    } else if (this.play.status !== 'playing' && !this.endScreen) {
      this.endShot();
    }

    const now = ballNow(this.play);
    const a = this.prevBall && Math.hypot(this.prevBall.x - now.x, this.prevBall.y - now.y) < 0.5 ? this.prevBall : now;
    const alpha = this.accumulator / DT;
    const lerp = (p: number, q: number) => p + (q - p) * alpha;
    this.drawBall({ ...now, x: lerp(a.x, now.x), y: lerp(a.y, now.y), z: lerp(a.z, now.z) });

    if (this.phase === 'flight') {
      if (this.play.shot) {
        // Camera follows the ball.
        this.camX += (this.ballScreen.x - VIEW_WIDTH / 2 - this.camX) * Math.min(1, dt * 6);
        this.camY += (this.ballScreen.y - VIEW_HEIGHT / 2 - this.camY) * Math.min(1, dt * 6);
        this.applyCamera();
      }
    } else if (this.watching) {
      const next = this.botAt ? this.botMoves[this.botNext] : undefined;
      this.drawGuide(next ? previewShot(this.play, next.cmd) : null);
    } else if (this.phase === 'plan' || this.planPower <= 0) this.drawGuide(null);
    else this.drawGuide(previewShot(this.play, this.command(Math.max(t.minPower, this.planPower))));
    this.drawMeter();
  }

  /** The simulation finished the shot (and any turns after it). Show the result. */
  private endShot(): void {
    // Owner, 2026-11-15: spin and curve go back to none at the start of each turn.
    settings.top = 0;
    settings.side = 0;
    this.showEvents(drainLog(this.play));
    this.prevBall = null;
    this.phase = 'plan';
    this.power = 0;
    this.planPower = 0;
    this.guide.clear();
    this.drawBall(this.play.ball);
    if (this.play.status === 'playing') this.centreOnBall();
    this.drawShotHud();
    if (this.play.status !== 'playing') this.showEndScreen();
  }

  /** Turn what the rules report into short messages. */
  private showEvents(events: readonly PlayEvent[]): void {
    for (const e of events) {
      switch (e.kind) {
        case 'star':
          this.queueMessage(`+1 STAR  ${this.play.meter}/${this.play.quota}`, STAR_FILL);
          break;
        case 'exitOpen':
          this.queueMessage('QUOTA MET! THE EXIT IS OPEN', GOOD);
          break;
        case 'defeat':
          this.queueMessage(`${OBJECTS.get(e.enemy.split('#')[0]!)?.name ?? 'ENEMY'} DEFEATED!`, GOOD);
          break;
        case 'heart':
          this.queueMessage('+1 HEALTH', GOOD);
          break;
        case 'shotOrb':
          this.queueMessage('+1 SHOT', GOOD);
          break;
        case 'damage': {
          const what = { spikes: 'SPIKES', sunk: 'SANK', out: 'OUT OF BOUNDS', enemy: 'OUCH', seed: 'HIT BY A SEED', zap: 'ZAPPED', slam: 'SLAMMED', burn: 'BURNING', blast: 'BLAST', charge: 'CHARGED', bite: 'BITTEN', ring: 'SOLDIER ANTS' }[e.cause];
          this.queueMessage(`${what}! -${e.amount} HEALTH`, BAD);
          break;
        }
        case 'activated':
          this.queueMessage(`${this.nameOf(e.enemy)} WAKES UP!`, GUIDE_WARN);
          break;
        case 'flagDown':
          this.queueMessage('FLAG KNOCKED DOWN! -1 STAR', BAD);
          break;
        case 'flagUp':
          this.queueMessage('FLAG RAISED! +1 STAR', STAR_FILL);
          break;
        case 'abilityGained':
          if (e.wild) this.wildUntil = this.time.now + 1000;
          this.queueMessage(`${e.wild ? 'WILD! ' : ''}GOT ${ABILITIES.get(e.ability)?.name.toUpperCase() ?? e.ability}! F TO USE`, 0x80c8ff);
          break;
        case 'abilityUsed':
          this.showMessage(`${ABILITIES.get(e.ability)?.name.toUpperCase() ?? ''}!`, 0x80c8ff);
          break;
        case 'stunned':
          this.queueMessage(e.target === 'ball' ? 'STUNNED! -1 SHOT' : `${this.nameOf(e.target)} STUNNED`, 0xf8e048);
          break;
        case 'break':
          this.queueMessage(e.wild ? 'CRATE BROKEN! A WILD!' : 'CRATE BROKEN!', GOOD);
          break;
        case 'rumble':
          this.showMessage('THE GROUND RUMBLES...', GUIDE_WARN);
          break;
        case 'surface':
          this.queueMessage('A MOLE!', GUIDE_WARN);
          break;
        case 'zap':
          if (e.target === 'ball') this.showMessage('ZAP!', 0xf8f040);
          break;
        case 'enemyTurn':
          break;
        case 'returned':
          this.queueMessage('BACK TO LAST SPOT', 0x80c8ff);
          break;
        case 'abilityLost':
          this.queueMessage(`FELL OFF: ${(ABILITIES.get(e.ability)?.name ?? 'ABILITY').toUpperCase()} LOST`, BAD);
          this.drawStatusHud();
          break;
        case 'bonusShot':
          this.queueMessage('+1 SHOT', GOOD);
          break;
        case 'gearEquipped': {
          const name = GEAR.get(e.item)?.name.toUpperCase() ?? e.item;
          this.queueMessage(e.dropped ? `GOT ${name}! (${GEAR.get(e.dropped)?.name.toUpperCase()} LEFT ON THE GROUND)` : `GOT ${name}!`, GOOD);
          break;
        }
        case 'shielded':
          this.queueMessage(`${GEAR.get(e.item)?.name.toUpperCase() ?? 'ARMOUR'}: DAMAGE IGNORED`, 0x80c8ff);
          break;
        case 'resisted':
          this.queueMessage(`${GEAR.get(e.item)?.name.toUpperCase() ?? 'ARMOUR'}: NO DAMAGE`, 0x80c8ff);
          break;
        case 'thorns':
          this.queueMessage(`HIT BACK! ${this.nameOf(e.enemy)} TAKES ${e.damage}`, GOOD);
          break;
        case 'phoenix':
          this.queueMessage(`PHOENIX PLATE! BACK TO ${e.health} HEALTH. IT CRUMBLES`, 0xf8a020);
          break;
        case 'status':
          if (e.status === 'burning') this.queueMessage(`${this.nameOf(e.target)} IS BURNING`, 0xf8a020);
          break;
        case 'statusDamage':
          this.queueMessage(`${this.nameOf(e.enemy)} BURNS: -${e.damage}`, 0xf8a020);
          break;
        case 'chainZap':
          this.queueMessage(`ZAP! ${this.nameOf(e.enemy)} -1`, 0xf8f040);
          break;
        case 'burst':
          this.queueMessage('FIRE BURST!', 0xf8a020);
          break;
        case 'healed':
          this.queueMessage(`+${e.amount} HEALTH (${GEAR.get(e.item)?.name.toUpperCase() ?? 'GEAR'})`, GOOD);
          break;
        case 'echo':
          this.queueMessage('ECHO! THAT HIT COUNTS TWICE', 0xa080f0);
          break;
        // Milestone 7.
        case 'roll':
          this.spinWheel(e);
          break;
        case 'blueStar':
          this.queueMessage('+1 BLUE STAR! (CARRIED: DEPOSIT IT AT A TOWN)', 0x80c8ff);
          break;
        case 'acorn':
          this.queueMessage(`${(ACORNS.get(e.item)?.name ?? 'ACORN').toUpperCase()}: +${e.slices} WHEEL SLICES THIS COURSE`, 0xf8d030);
          break;
        case 'slamMark':
          this.queueMessage('THE WARDEN WINDS UP: GET OUT OF THE RING!', BAD);
          break;
        case 'slam':
          if (!e.hit) this.queueMessage('SLAM! MISSED YOU', GOOD);
          this.cameras.main.shake(180, 0.006);
          break;
        case 'summon':
          this.queueMessage(`THE WARDEN CALLS A ${this.nameOf(e.enemy)}!`, GUIDE_WARN);
          break;
        case 'phase':
          this.queueMessage(`THE WARDEN SHEDS A PLATE! PHASE ${e.phase + 1}`, 0xf8e048);
          break;
        case 'vanish':
          this.puff(e.enemy);
          break;
        case 'underwater':
          this.queueMessage('UNDER WATER: NEXT SHOT IS WEAKER', 0x80c8ff);
          break;
        case 'recover':
          this.queueMessage(this.play.napsUsed >= this.play.stats.get('naps') ? 'OUT OF SHOTS: NAP. SHOTS REFILLED. THAT WAS YOUR LAST NAP' : 'OUT OF SHOTS: NAP. SHOTS REFILLED', 0x80c8ff);
          break;
        default:
          break;
      }
    }
  }

  private nameOf(uid: string): string {
    return (OBJECTS.get(uid.replace(/^summon:/, '').split('#')[0]!)?.name ?? 'ENEMY').toUpperCase();
  }

  // -------------------------------------------------------------------------
  // Success wheels (owner, 2026-11-17): the simulation has already decided; this only shows the spin.

  private wheels: { c: Phaser.GameObjects.Container; hand: Phaser.GameObjects.Graphics; from: number; to: number; start: number; done: boolean; success: boolean; label: Phaser.GameObjects.Container }[] = [];

  private spinWheel(e: Extract<PlayEvent, { kind: 'roll' }>): void {
    const n = e.size;
    const r = n > 10 ? 15 : 11;
    // Which slices are filled is only for the look (sheet section 4b.1), so the display may pick them at random.
    const order = Phaser.Utils.Array.Shuffle([...Array(n).keys()]);
    const filled = new Set(order.slice(0, e.filled));
    const pool = [...Array(n).keys()].filter((i) => filled.has(i) === e.success);
    const target = pool.length ? pool[Math.floor(Math.random() * pool.length)]! : 0;
    const slot = this.wheels.filter((w) => !w.done).length;
    // Left of the power meter on the right edge.
    const cx = VIEW_WIDTH - 46 - (slot % 4) * 36;
    const cy = 52 + Math.floor(slot / 4) * 40;
    const c = this.add.container(cx, cy).setScrollFactor(0).setDepth(HUD_DEPTH + 5);
    const g = this.add.graphics();
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      g.fillStyle(filled.has(i) ? WHEEL_FILLED : WHEEL_EMPTY, 1);
      g.slice(0, 0, r, i * step - Math.PI / 2, (i + 1) * step - Math.PI / 2, false).fillPath();
    }
    g.lineStyle(1, UI_BG, 1).strokeCircle(0, 0, r);
    c.add(g);
    const hand = this.add.graphics();
    c.add(hand);
    const word = ({ burn: 'BURN', stun: 'STUN', zap: 'ZAP', heal: 'HEAL', knock: 'KNOCK', echo: 'ECHO' } as const)[e.effect];
    const label = pixelText(this, manifest, -r, r + 2, `${word} ${e.filled}/${n}${e.respun ? ' AGAIN' : ''}`, { color: UI_TEXT, background: UI_BG });
    c.add(label);
    // Two and a bit turns, ending in the middle of the target slice.
    const to = Math.PI * 2 * 2 + (target + 0.5) * step;
    this.wheels.push({ c, hand, from: 0, to, start: this.time.now, done: false, success: e.success, label });
  }

  private animateWheels(): void {
    const SPIN = 600;
    const HOLD = 700;
    for (const w of this.wheels) {
      const t = Math.min(1, (this.time.now - w.start) / SPIN);
      const a = w.from + (w.to - w.from) * (1 - (1 - t) ** 3) - Math.PI / 2;
      const r = 13;
      w.hand.clear().lineStyle(2, 0xf8f8f8, 1).lineBetween(0, 0, Math.cos(a) * r, Math.sin(a) * r).fillStyle(0x202030, 1).fillCircle(0, 0, 2);
      if (t >= 1 && !w.done) {
        w.done = true;
        w.label.destroy();
        w.label = pixelText(this, manifest, -14, 17, w.success ? 'YES!' : 'MISS', { color: w.success ? GOOD : BAD, background: UI_BG });
        w.c.add(w.label);
      }
      if (this.time.now - w.start > SPIN + HOLD) w.c.destroy();
    }
    this.wheels = this.wheels.filter((w) => this.time.now - w.start <= SPIN + HOLD);
  }

  // -------------------------------------------------------------------------
  // Boss fights (Milestone 7): the health bar and the slam ring.

  private bossHud: Phaser.GameObjects.Container | null = null;
  private bossKey = '';
  private slamGfx: Phaser.GameObjects.Graphics | null = null;

  private drawBossHud(): void {
    const boss = this.play.enemies.find((e) => isBoss(e));
    if (!boss) return;
    const full = boss.stats.get('health');
    const key = `${boss.health},${boss.defeated},${boss.phase}`;
    if (key !== this.bossKey) {
      this.bossKey = key;
      this.bossHud?.destroy();
      const w = 160;
      const x = Math.round((VIEW_WIDTH - w) / 2);
      const c = this.add.container(x, 32).setScrollFactor(0).setDepth(HUD_DEPTH);
      c.add(this.add.rectangle(0, 0, w, 15, UI_BG, 0.9).setOrigin(0, 0));
      c.add(pixelText(this, manifest, 3, 2, `${boss.def.name.toUpperCase()}  ${boss.defeated ? 'BEATEN!' : `PHASE ${boss.phase + 1}`}`, { color: boss.defeated ? GOOD : BAD }));
      const g = this.add.graphics();
      g.fillStyle(METER_BG, 1).fillRect(3, 10, w - 6, 3);
      g.fillStyle(BOSS_BAR, 1).fillRect(3, 10, Math.round(((w - 6) * boss.health) / full), 3);
      // Phase marks at 2/3 and 1/3.
      g.fillStyle(0xf8f8f8, 1);
      for (const f of [2 / 3, 1 / 3]) g.fillRect(3 + Math.round((w - 6) * f), 9, 1, 5);
      c.add(g);
      c.add(pixelText(this, manifest, w - 30, 2, `${boss.health}/${full}`, { color: UI_TEXT }));
      this.bossHud = c;
    }
    // The slam ring on the ground: an ellipse in screen space round the marked spot.
    if (!this.slamGfx) this.slamGfx = this.add.graphics();
    const g = this.slamGfx;
    g.clear();
    const m = boss.slamMark;
    if (!m || boss.defeated) return;
    const z = groundAt(this.play.course, m.x, m.y)?.h ?? 0;
    const p = project(m.x, m.y, z / STEP_HEIGHT);
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.time.now / 180));
    // One tile is 32 pixels wide and 16 high on screen; the ring's radius is in tiles along each grid axis.
    const rx = m.r * 16 * Math.SQRT2;
    const ry = m.r * 8 * Math.SQRT2;
    // Above every floor tile it spans (a ring covers several tiles), below the clouds and the HUD.
    g.setDepth(OVERLAY_DEPTH - 30);
    g.lineStyle(2, SLAM_RING, pulse).strokeEllipse(Math.round(p.x), Math.round(p.y), rx * 2, ry * 2);
    g.fillStyle(SLAM_RING, 0.12 * pulse).fillEllipse(Math.round(p.x), Math.round(p.y), rx * 2, ry * 2);
  }

  private queueMessage(text: string, color: number): void {
    if (this.messageQueue.some((m) => m.text === text)) return;
    this.messageQueue.push({ text, color });
  }

  /**
   * The aim guide: dots every few steps; yellow in the air, white on the
   * ground, orange where it passes through a sentinel's inner radius. It stops
   * at a stationary thunder cloud (marked with an X); drifting clouds show their lane.
   */
  private drawGuide(preview: Preview | null): void {
    const g = this.guide;
    g.clear();
    if (!preview) return;
    const points = preview.points;
    const zones = this.play.enemies
      .filter((e) => !e.defeated && !e.body && e.def.triggers.passBy !== 'none' && e.stats.get('innerRadius') > 0)
      .map((e) => ({ x: e.x, y: e.y, r: e.stats.get('innerRadius'), ground: e.def.passByGroundOnly }));
    for (let i = 4; i < points.length; i += 4) {
      const p = points[i]!;
      const ground = groundAt(this.course!, p.x, p.y);
      const air = !ground || p.z > ground.h + 0.02;
      const warn = zones.some((z) => Math.hypot(p.x - z.x, p.y - z.y) < z.r && (!z.ground || !air));
      const s = project(p.x, p.y, p.z / STEP_HEIGHT);
      const fade = 1 - (i / points.length) * 0.6;
      g.fillStyle(warn ? GUIDE_WARN : air ? GUIDE_AIR : GUIDE, fade);
      g.fillRect(Math.round(s.x) - 1, Math.round(s.y) - 2, 2, 2);
    }
    if (preview.cloud && points.length) {
      const p = points[points.length - 1]!;
      const s = project(p.x, p.y, p.z / STEP_HEIGHT);
      g.lineStyle(1, BAD, 1);
      g.lineBetween(s.x - 3, s.y - 5, s.x + 3, s.y + 1);
      g.lineBetween(s.x + 3, s.y - 5, s.x - 3, s.y + 1);
    }
    for (const c of this.play.clouds) {
      if (!c.path) continue;
      g.lineStyle(1, DEBUG_ZONE, 0.35);
      const pts = c.path.pts.map((q) => project(q.x, q.y, (groundAt(this.course!, q.x, q.y)?.h ?? 0) / STEP_HEIGHT));
      for (let i = 1; i < pts.length; i++) g.lineBetween(pts[i - 1]!.x, pts[i - 1]!.y, pts[i]!.x, pts[i]!.y);
    }
  }

  /** Debug overlay parts that move: radii, paths, cloud zones. Redrawn every frame while debug is on. */
  private drawDebugDynamic(): void {
    const g = this.debugDyn;
    g.clear();
    if (this.debugMode === 'off' || !this.course) return;
    const ring = (x: number, y: number, r: number, color: number, dashed: boolean) => {
      const h = (groundAt(this.course!, x, y)?.h ?? 0) / STEP_HEIGHT;
      g.lineStyle(1, color, 0.9);
      const n = 48;
      for (let i = 0; i < n; i++) {
        if (dashed && i % 2) continue;
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        const p = project(x + Math.cos(a0) * r, y + Math.sin(a0) * r, h);
        const q = project(x + Math.cos(a1) * r, y + Math.sin(a1) * r, h);
        g.lineBetween(p.x, p.y, q.x, q.y);
      }
    };
    const path = (pts: readonly { x: number; y: number }[]) => {
      g.lineStyle(1, DEBUG_PATH, 0.8);
      const sp = pts.map((q) => project(q.x, q.y, (groundAt(this.course!, q.x, q.y)?.h ?? 0) / STEP_HEIGHT));
      for (let i = 1; i < sp.length; i++) g.lineBetween(sp[i - 1]!.x, sp[i - 1]!.y, sp[i]!.x, sp[i]!.y);
    };
    for (const e of this.play.enemies) {
      if (e.defeated) continue;
      const outer = e.stats.get('outerRadius');
      const inner = e.stats.get('innerRadius');
      if (outer > 0) ring(e.x, e.y, outer, DEBUG_OUTER, false);
      if (inner > 0) ring(e.x, e.y, inner, DEBUG_INNER, true);
      if (e.path) path(e.path.pts);
      if (e.lobTarget) ring(e.lobTarget.x, e.lobTarget.y, 0.75, DEBUG_INNER, false);
    }
    for (const m of this.play.movers) if (m.path) path(m.path.pts);
    for (const c of this.play.clouds) {
      if (c.path) path(c.path.pts);
      const h = (groundAt(this.course, c.x, c.y)?.h ?? 0) / STEP_HEIGHT;
      const top = c.def.zapHeight / STEP_HEIGHT;
      g.lineStyle(1, DEBUG_ZONE, 0.9);
      const corners = [
        [c.x - c.def.half, c.y - c.def.half],
        [c.x + c.def.half, c.y - c.def.half],
        [c.x + c.def.half, c.y + c.def.half],
        [c.x - c.def.half, c.y + c.def.half],
      ] as const;
      for (const lvl of [h, h + top]) {
        for (let i = 0; i < 4; i++) {
          const p = project(corners[i]![0], corners[i]![1], lvl);
          const q = project(corners[(i + 1) % 4]![0], corners[(i + 1) % 4]![1], lvl);
          g.lineBetween(p.x, p.y, q.x, q.y);
        }
      }
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
    const shot = this.play.shot;
    const showing = this.phase === 'charge' ? this.power : shot ? shot.cmd.power : settings.quickShot && this.phase === 'pull' ? this.planPower : 0;
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
      // Owner, 2026-11-15: two naps per course; running out a third time ends it.
      `NAPS LEFT: ${this.play ? Math.max(0, this.play.stats.get('naps') - this.play.napsUsed) : RULES.naps}${this.play && this.play.napsUsed >= this.play.stats.get('naps') ? ' (LAST SHOTS!)' : ''}`,
    ].join('\n');
    this.shotHud = pixelText(this, manifest, 2, 30, text, { color: UI_DIM, background: UI_BG }).setScrollFactor(0).setDepth(HUD_DEPTH);
  }

  /**
   * The status HUD: health, shots, the star meter, yellow stars held and the
   * seed. Redrawn only when something in it changes.
   */
  private drawStatusHud(): void {
    const p = this.play;
    const maxHealth = p.stats.get('maxHealth');
    const maxShots = p.stats.get('maxShots');
    const wild = this.time.now < this.wildUntil ? Math.floor(this.time.now / 90) % ABILITY_IDS.length : -1;
    const usedUp = p.abilityUsed && !!p.shot;
    const shields = shieldsLeft(p);
    const key = [p.health, maxHealth, p.shots, maxShots, p.meter, p.quota, p.wallet, p.exitOpen, p.ability, usedUp, wild, p.ballStatuses.length, p.gear.weapon, p.gear.armour, p.gear.bauble, shields, p.blueStars, p.acornSlices].join(',');
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.statusHud?.destroy();
    const c = this.add.container(2, 10).setScrollFactor(0).setDepth(HUD_DEPTH);
    // Wide enough for every heart and shot orb (permanent upgrades can add several), then the HP text.
    const iconsW = 2 + maxHealth * 9 + 6 + maxShots * 9;
    const bgW = Math.max(150, iconsW + 46);
    c.add(this.add.rectangle(0, 0, bgW, 19, UI_BG, 0.85).setOrigin(0, 0));
    const icon = (id: string, x: number, y: number, dim = false) => {
      const entry = manifest.sprites[id]!;
      const img = this.add.image(x, y, id, 0).setOrigin(0, 0);
      if (dim) img.setTint(HEALTH_LOST).setAlpha(0.8);
      c.add(img);
      return entry.frameWidth;
    };
    // Row 1: health hearts, then shot orbs.
    let x = 2;
    for (let i = 0; i < maxHealth; i++) x += icon('heart', x, 1, i >= p.health) + 1;
    x += 6;
    for (let i = 0; i < maxShots; i++) x += icon('shot-orb', x, 1, i >= p.shots) + 1;
    // Row 2: the star meter, the stars held and the seed.
    const barX = 2;
    const barY = 12;
    const barW = 48;
    const g = this.add.graphics();
    g.fillStyle(METER_BG, 1).fillRect(barX, barY, barW, 5);
    const fill = p.bossExit ? (p.exitOpen ? 1 : 0) : p.quota > 0 ? Math.min(1, p.meter / p.quota) : 1;
    g.fillStyle(p.exitOpen ? GOOD : STAR_FILL, 1).fillRect(barX, barY, Math.round(barW * fill), 5);
    c.add(g);
    // Milestone 7: in a boss arena the exit opens when the boss falls, not from stars.
    const meterText = p.bossExit ? (p.exitOpen ? 'OPEN' : 'BEAT BOSS') : p.quota > 0 ? `${Math.min(p.meter, p.quota)}/${p.quota}${p.exitOpen ? ' OPEN' : ''}` : 'OPEN';
    c.add(pixelText(this, manifest, barX + barW + 3, barY, meterText, { color: p.exitOpen ? GOOD : UI_TEXT }));
    c.add(pixelText(this, manifest, Math.max(104, x + 3), 2, `HP ${p.health}/${maxHealth}`, { color: UI_TEXT }));
    const starX = 94;
    icon('star-yellow', starX - 2, 9);
    c.add(pixelText(this, manifest, starX + 10, barY, this.runMode ? `${p.wallet}` : `${p.wallet}  #${this.seed}${this.isGenerated ? ` B${genBudget}` : ''}`, { color: UI_TEXT }));
    // Milestone 7: blue stars carried (not yet deposited), and an acorn's extra slices this course.
    if (this.runMode && session.run) {
      icon('star-blue', starX + 22, 9);
      c.add(pixelText(this, manifest, starX + 34, barY, `${session.run.blueStars + p.blueStars}`, { color: 0x80c8ff }));
    }
    if (p.acornSlices > 0) c.add(pixelText(this, manifest, 2, 20, `ACORN +${p.acornSlices} SLICES`, { color: STAR_FILL, background: UI_BG }));
    // Ability slot: the icon and name of the held ability (greyed once used this shot). A Wild flicks through them first.
    const slotX = bgW + 4;
    c.add(this.add.rectangle(slotX, 0, 62, 19, UI_BG, 0.85).setOrigin(0, 0));
    const shown = wild >= 0 ? ABILITY_IDS[wild]! : p.ability;
    if (shown) {
      const def = ABILITIES.get(shown)!;
      const img = this.add.image(slotX + 2, 1, def.icon, 0).setOrigin(0, 0);
      if (usedUp) img.setAlpha(0.35);
      c.add(img);
      c.add(pixelText(this, manifest, slotX + 14, 3, wild >= 0 ? '?' : def.name.toUpperCase(), { color: usedUp ? UI_DIM : UI_TEXT }));
      c.add(pixelText(this, manifest, slotX + 14, 11, usedUp ? 'USED' : 'F: USE', { color: UI_DIM }));
    } else c.add(pixelText(this, manifest, slotX + 3, 7, 'NO ABILITY', { color: UI_DIM }));
    if (p.ballStatuses.some((st) => st.id === 'stunned')) c.add(this.add.image(x + 2, 0, 'icon-stunned', 0).setOrigin(0, 0));
    // Gear slots (Milestone 6): weapon, armour, bauble; then the armour's ignored damages left this course.
    const gearX = slotX + 66;
    c.add(this.add.rectangle(gearX, 0, shields > 0 ? 58 : 44, 19, UI_BG, 0.85).setOrigin(0, 0));
    GEAR_CATEGORIES.forEach((cat, i) => {
      const id = p.gear[cat];
      const gx = gearX + 2 + i * 14;
      if (id) c.add(this.add.image(gx, 1, GEAR.get(id)!.icon, 0).setOrigin(0, 0));
      else c.add(this.add.rectangle(gx + 1, 2, 10, 10, 0x000000, 0).setOrigin(0, 0).setStrokeStyle(1, 0x404058));
    });
    c.add(pixelText(this, manifest, gearX + 3, 13, 'W  A  B', { color: UI_DIM }));
    if (shields > 0) {
      c.add(this.add.image(gearX + 44, 1, 'icon-shield', 0).setOrigin(0, 0));
      c.add(pixelText(this, manifest, gearX + 47, 12, String(shields), { color: UI_TEXT }));
    }
    this.statusHud = c;
  }

  /** Course complete or run over. */
  private showEndScreen(): void {
    this.endScreen?.destroy();
    const p = this.play;
    const won = p.status === 'won';
    const cur = this.runMode ? session.run?.current : null;
    const lines = cur
      ? won
        ? cur.type === 'boss'
          ? [
              'THE WARDEN IS BEATEN!',
              '',
              `BLUE STARS: +${bossBlueStars(session.run!.region)}${cur.early ? ` +${session.run!.countdown} EARLY` : ''}, ALL DEPOSITED`,
              'HEALED TO FULL',
              `SHOTS TAKEN: ${p.shotNumber}`,
              '',
              session.run!.region >= LAST_REGION ? 'THE RUN IS COMPLETE. ENTER: RUN SUMMARY' : 'ENTER: PICK A REWARD, THEN REGION ' + (session.run!.region + 1),
            ]
          : [
              'COURSE COMPLETE!',
              '',
              `SHOTS TAKEN: ${p.shotNumber}`,
              `STARS: ${p.meter} (QUOTA ${p.quota})`,
              `FINISH REWARD: +${rewardFor(cur.type)} STARS, +${cur.type === 'hard' ? BLUE_STARS.hard : BLUE_STARS.course} BLUE (CARRIED)`,
              `HEALTH LEFT: ${p.health}`,
              '',
              'ENTER: BACK TO THE MAP',
            ]
        : ['RUN OVER', '', p.lostBy === 'shots' ? 'OUT OF SHOTS, WITH NO NAPS LEFT.' : 'YOUR HEALTH RAN OUT.', 'CARRIED BLUE STARS ARE LOST.', 'GEAR IN YOUR BURROW IS SAFE.', '', 'ENTER: RUN SUMMARY']
      : won
      ? ['COURSE COMPLETE!', '', `SHOTS TAKEN: ${p.shotNumber}`, `STARS: ${p.meter} (QUOTA ${p.quota})`, `HEALTH LEFT: ${p.health}`, '', 'ENTER: NEXT COURSE   R: PLAY AGAIN']
      : ['RUN OVER', '', p.lostBy === 'shots' ? 'OUT OF SHOTS, WITH NO NAPS LEFT.' : 'YOUR HEALTH RAN OUT.', `STARS: ${p.meter} OF ${p.quota}`, `SHOTS TAKEN: ${p.shotNumber}`, '', 'ENTER OR R: RESTART'];
    const text = pixelText(this, manifest, 0, 0, lines.join('\n'), { color: won ? GOOD : BAD });
    const w = text.width + 16;
    const h = text.height + 14;
    const c = this.add.container(Math.round((VIEW_WIDTH - w) / 2), Math.round((VIEW_HEIGHT - h) / 2)).setScrollFactor(0).setDepth(HUD_DEPTH + 10);
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.94).setOrigin(0, 0).setStrokeStyle(1, won ? GOOD : BAD));
    text.setPosition(8, 7);
    c.add(text);
    this.endScreen = c;
    // The run learns the result straight away, so leaving with another key cannot lose it.
    this.reportRun();
    this.messageQueue = [];
    this.message?.destroy();
    this.message = null;
  }

  private stepLabel(): string {
    if (settings.quickShot) return 'QUICK SHOT (TEST)';
    return { plan: '1 PULL OR AIM KEYS', pull: '1 PULL TO PLAN', set: '2 HOLD TO CHARGE', charge: '2 RELEASE!', flight: '-' }[this.phase];
  }

  private showMessage(text: string, color: number): void {
    this.message?.destroy();
    this.message = pixelText(this, manifest, 0, 46, text, { color, background: UI_BG }).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.message.x = Math.round((VIEW_WIDTH - this.message.width) / 2);
    this.messageUntil = this.time.now + 1400;
  }

  // -------------------------------------------------------------------------
  // HUD and debug overlay

  private drawHud(id: string, course: Course): void {
    const n = `${this.courseIndex + 1}/${TEST_COURSES.length}`;
    this.drawStatusHud();
    const cur = this.runMode ? session.run?.current : null;
    const label = cur
      ? cur.arena
        ? `RUN #${session.run!.seed}  REGION ${session.run!.region}  ${BOSSES.get(cur.boss ?? '')?.name.toUpperCase() ?? 'BOSS'}  ARENA: ${ARENAS.get(cur.arena)!.name.toUpperCase()} (${ARENAS.get(cur.arena)!.gimmick.toUpperCase()})`
        : `RUN #${session.run!.seed}  REGION ${session.run!.region}  ${cur.type === 'hard' ? 'HARD COURSE' : 'COURSE'}  ROW ${cur.row}  BUDGET ${cur.budget}`
      : `${n} ${course.name}`;
    pixelText(this, manifest, 2, 2, label, { color: UI_TEXT, background: UI_BG })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setName(`hud-${id}`);
    const lines = [
      'MOUSE: PULL BACK TO PLAN, HOLD TO CHARGE  KEYS: ARROWS/WASD AIM+POWER, HOLD SPACE TO CHARGE',
      'T: GROUND/LOFT  Z/X: SPIN  Q/E: CURVE  SPACE IN FLIGHT: BOOST  F: ABILITY  ESC: RE-PLAN',
      this.runMode
        ? 'IJKL OR RIGHT-DRAG: PAN  C: CENTRE  O: OVERVIEW  G: DEBUG  U: TUNING AND TEST PANEL  H: HELP'
        : 'IJKL OR RIGHT-DRAG: PAN  C: CENTRE  O: OVERVIEW  1-6/N: COURSE  7: RUN  R: RESTART  G: DEBUG  U: TUNING  H: HELP',
      ...(!this.runMode && TEST_COURSES[this.courseIndex]?.id === GENERATED_ID ? ['GENERATED: BRACKET KEYS: BUDGET -/+2  V: SEED VIEWER  B: WATCH THE BOT  ENTER AFTER A WIN: NEXT'] : []),
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
      } else if (this.debugMode === 'surfaces') {
        this.label((SURFACES.get(t.surface)?.name ?? t.surface).slice(0, 3), c.x, c.y);
      }
    }
    if (this.debugMode === 'areas') this.drawAreas(course);
    const mode = pixelText(this, manifest, VIEW_WIDTH - 2, 2, `DEBUG: ${this.debugMode}`, { color: 0xf8e048, background: UI_BG })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    mode.x -= mode.width;
    this.overlay.push(mode);
  }

  /**
   * Debug mode "areas" (generated courses, Milestone 5b): the outline and name of
   * every area, passage and pocket along the journey, and how the budget was spent.
   */
  private drawAreas(course: Course): void {
    const meta = this.isGenerated ? lastGen?.result.meta : null;
    if (!meta) {
      const t = pixelText(this, manifest, 2, 22, 'AREAS: ONLY FOR GENERATED COURSES (KEY 6)', { color: 0xf8e048, background: UI_BG }).setScrollFactor(0).setDepth(HUD_DEPTH);
      this.overlay.push(t);
      return;
    }
    const g = this.add.graphics().setDepth(OVERLAY_DEPTH + 1);
    this.overlay.push(g);
    meta.terrain.regions.forEach((r, i) => {
      const { x, y, w, h } = r.rect;
      const mid = course.tiles[Math.floor(y + h / 2) * course.width + Math.floor(x + w / 2)];
      const z = mid ? Math.min(...mid.corners) : 0;
      g.lineStyle(1, r.kind === 'area' ? DEBUG_OUTER : r.kind === 'passage' ? DEBUG_PATH : GOOD, 0.9);
      const pts = [project(x, y, z), project(x + w, y, z), project(x + w, y + h, z), project(x, y + h, z)];
      g.beginPath();
      g.moveTo(pts[0]!.x, pts[0]!.y);
      for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
      g.closePath();
      g.strokePath();
      const c = project(x + w / 2, y + h / 2, z);
      const name = `${r.kind === 'area' ? `${r.order + 1} ` : ''}${r.name}${r.steep ? ' STEEP' : ''}`.toUpperCase();
      const t = pixelText(this, manifest, 0, 0, name, { color: r.kind === 'area' ? DEBUG_OUTER : DEBUG_PATH, background: UI_BG, padding: 0 }).setDepth(OVERLAY_DEPTH + 2);
      t.setPosition(Math.round(c.x - t.width / 2), Math.round(c.y - 4));
      this.overlay.push(t);
      void i;
    });
    const s = meta.spend;
    const info = pixelText(this, manifest, 2, 22, `BUDGET ${meta.budget}: TERRAIN ${s.terrain}  ENEMIES ${s.enemies}  OBSTACLES ${s.obstacles}  HAZARDS ${s.hazards}`, {
      color: 0xf8e048,
      background: UI_BG,
    })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);
    this.overlay.push(info);
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
    const obj = this.course.objects.find((o) => o.x === t.x && o.y === t.y);
    const objText = obj ? `  OBJ ${OBJECTS.get(obj.id)?.name ?? obj.id}` : '';
    const text = `TILE ${t.x},${t.y}  ${surface}  CORNERS ${t.corners.join(' ')}  SHAPE ${t.shape}${extra ? '  ' + extra : ''}${objText}`;
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
