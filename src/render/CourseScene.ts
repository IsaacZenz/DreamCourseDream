import Phaser from 'phaser';
import { GENERATED_ID, TEST_COURSES } from '../content/courses';
import { GEN } from '../content/gen';
import { generateCourse, type GenOptions, type GenResult } from '../gen/validate';
import { botBrain, watchBotConfig, type BotMove } from '../gen/bot';
import { Rng } from '../sim/rng';
import { SeedViewer } from '../ui/seedViewer';
import { BENCH_ID, benchChoices, benchCourse } from '../content/courses/testBench';
import { SURFACES } from '../content/surfaces';
import { parseCourse, railTileList, tileAt, type Course } from '../sim/course';
import { STEP_HEIGHT, type Tuning } from '../content/tuning';
import { DT, groundAt, type BallState, type ShotCommand, type ShotType } from '../sim/ball';
import {
  ballNow,
  canShoot,
  canUseAbility,
  createPlay,
  debugWin,
  decideFood,
  settleFood,
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
  floatOf,
  shellIsOpen,
  coilEdgeLength,
  coilEdgePoint,
  coilNextTurn,
  coilSegmentLength,
  coilSegmentStart,
  inLegRing,
  coilCorners,
  coilRectOf,
  coilSoft,
  type CoilRect,
  debugBossHealth,
  type CoilLine,
  type EnemyState,
} from '../sim/play';
import { STATUSES } from '../content/statuses';
import { RANKS, TRAITS, TRAIT_RULES } from '../content/enemyMods';
import { ELEMENT_IDS, OBJECTS, RAIL } from '../content/objects';
import { GROUND_BUMPS, SCENERY } from '../content/scenery';
import { COURSE_MODS, type CourseMod } from '../content/modifiers';
import type { Direction } from '../content/surfaces';
import { courseModBanner, courseModShort } from './courseModView';
import { RULES } from '../content/rules';
import { ABILITIES, ABILITY_IDS } from '../content/abilities';
import { SPIN_LEVELS, chargeMeter, dragShot, spinValue } from '../input/aim';
import type { TuningPanel } from '../ui/tuningPanel';
import { GEAR, GEAR_CATEGORIES, GEAR_LIST } from '../content/gear';
import { UPGRADE_LIST, botShotsFor } from '../content/run';
import { placeGear } from '../gen/placeGear';
import { mixFor, regionDefFor, upcomingJobs, addUpgrade, bossBlueStars, debugSetCountdown, enemyModifiersFor, finishCourse, genOptionsFor, loadoutOf, rewardFor, bossHealthFor } from '../sim/run';
import { ARENAS, arenaData } from '../content/arenas';
import { activeRun, newRunSeed, persist, session, startRun, type RunCourse } from './runSession';
import { ACORNS, FOOD, FOODS } from '../content/consumables';
import { foodDesc } from './bagMenu';
import { jobKey, madeCourse, prefetch, want, type Made } from './genQueue';
import { BOSSES } from '../content/bosses';
import { BLUE_STARS } from '../content/progress';
import { LAST_REGION } from '../content/run';
import { gearBoxes, getPanel, getTuning, preloadAssets, shared } from './shared';
import { buildDrawList, bumpTopDepth, courseBounds, groundBump, pickTile, project, tileDepth, type Placement } from './iso';
import { frameIndex, themedSprite, type Manifest } from './manifest';
import { THEMES, biomeForRegion, themeForRegion } from '../content/biomes';
import { pixelText } from './pixelText';
import { VIEW_HEIGHT, VIEW_WIDTH } from './config';
import { COURSE_INTRO } from '../content/places';
import { goRun, walking } from './nav';
import practiceGreen from '../content/courses/practice-green.json';
import type { Loadout } from '../sim/play';

/** The practice green's loadout: the run's gear, ability and upgrades, full health, no course modifier. */
function practiceLoadout(): Loadout {
  const run = session.run!;
  const out: Loadout & { health?: number } = { ...loadoutOf(run), courseMod: null };
  delete out.health;
  return out;
}

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
// Milestone 8 marks on the ground.
const PUFF_RING = 0x90d040;
const SOLDIER_RING = 0xc060f0;
const FUSE_RING = 0xff9020;
const FROZEN = 0xd8f0ff;
const STATIC_FIELD = 0xfff060;

/** An element's tint from the asset manifest (Milestone 8 sheet section 3: colours live with the art). */
function elementTint(el: string): number | undefined {
  const hex = manifest.tints?.[el];
  return hex ? parseInt(hex.slice(1), 16) : undefined;
}
const BAD = 0xff8080;
const GUIDE_WARN = 0xf89038;
const DEBUG_OUTER = 0xf8e048;
const DEBUG_INNER = 0xff6040;
const DEBUG_PATH = 0x80c8ff;
const DEBUG_ZONE = 0xf8f040;

/** Owner, 2026-11-26: how long the character stays curled up after a hit that does not move it, in ms. */
const CURL_MS = 600;

/** Keyboard aiming (owner, 2026-11-14: every mechanic works from the keyboard alone). Degrees per second. */
const AIM_TURN = 90;
const AIM_TURN_FINE = 20;
/** Planned power change per second while Up or Down is held. */
const PLAN_RATE = 0.6;

/** Shared by every course and kept across restarts, so live tuning sticks. */
let tuning: Tuning | null = null;
let panel: TuningPanel | null = null;

/** The test bench: what stands at the centre, and the ability to start with. Kept across restarts. */
const bench = { object: 'snoozegrub', ability: '', rank: '', trait: '', element: '' };
let benchShown = false;

/** Generated courses (Milestone 5): the budget in use, and the last course made (kept so R does not regenerate). */
let genBudget: number | null = null;
let lastGen: { result: GenResult; ms: number } | null = null;

/**
 * Testing aid (round 2a): ?region=N makes the generated test course the size,
 * mix and detail of a late course in region N (after 6 counted nodes), so the
 * detail dial and scenery can be seen without playing a run there.
 */
/** Testing aid (round 2b): ?mod=wind|lowGravity|darkness (and &dir=ne|se|sw|nw for wind) gives a test course that modifier. */
function testCourseMod(): CourseMod | null {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('mod');
  if (!id || !COURSE_MODS.has(id)) return null;
  const dir = params.get('dir') as Direction | null;
  const st = Number(params.get('strength'));
  const strength = st === 1 || st === 2 || st === 3 ? st : 2;
  return id === 'wind' ? { id: 'wind', dir: dir && ['ne', 'se', 'sw', 'nw'].includes(dir) ? dir : 'ne', strength } : { id: id as CourseMod['id'] };
}

function testRegionOpts(): GenOptions {
  const n = Number(new URLSearchParams(window.location.search).get('region'));
  const mod = testCourseMod();
  if (!n) return mod ? { loadout: { courseMod: mod } } : {};
  const r = regionDefFor(n);
  const areas = Math.min(r.areas.max, r.areas.start + Math.floor(6 / r.areas.every));
  const lfScale = biomeForRegion(n).landformScale;
  return {
    size: { areas: [areas, areas], areaSize: r.areaSize, maxEnemies: r.maxEnemies, botShots: botShotsFor(areas), mix: mixFor(n), detail: r.detail, ...(Object.keys(lfScale).length && { landformScale: lfScale }) },
    ...(mod && { loadout: { courseMod: mod } }),
  };
}
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
  /** Milestone 8b: the town's practice green (nothing counts). */
  practice?: boolean;
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
  /** Owner, 2026-11-26: hurt while standing (and not moved), Rollo curls into the ball until this time, then stands. */
  private curlUntil = 0;
  private chargeStart = 0;
  private dragFrom = { x: 0, y: 0 };
  private aim = 0;
  private power = 0;
  /** Power chosen while planning. A preview only: the meter alone sets the real power. */
  private planPower = 0;
  private message: Phaser.GameObjects.Container | null = null;
  private messageUntil = 0;
  /** Messages wait their turn so several things in one shot can all be read. */
  private messageQueue: { text: string; color: number; ms?: number }[] = [];

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
  /** Milestone 8b (sheet section 2.3): the practice green. Nothing counts; Esc or sinking the ball goes back to town. */
  private practiceMode = false;

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
    this.practiceMode = data.practice === true && !!session.run;
    if (this.practiceMode) this.courseIndex = 0;
    this.thumb = params.get('thumb') === '1';
    // ?bench=<object id> opens the test bench with that thing at its centre (for example ?course=test-bench&bench=rail).
    if (!benchShown && params.get('bench') !== null) bench.object = params.get('bench')!;
    // ?ability=<id> starts the test bench holding that ability (round 2b testing aid).
    if (!benchShown && params.get('ability')) bench.ability = params.get('ability')!;
    // Milestone 8: &rank=1|2, &trait=<id>, &element=fire|ice|shock for the enemy on the bench.
    if (!benchShown) for (const k of ['rank', 'trait', 'element'] as const) if (params.get(k) !== null) bench[k] = params.get(k)!;
    const urlDebug = params.get('debug');
    this.debugMode = data.debug ?? (DEBUG_MODES.includes(urlDebug as DebugMode) ? (urlDebug as DebugMode) : urlDebug === '1' ? 'coords' : 'off');
  }

  preload(): void {
    preloadAssets(this);
  }

  create(): void {
    // A restart during the opening zoom must not leave input switched off.
    this.intro = false;
    this.input.enabled = true;
    if (this.input.keyboard) this.input.keyboard.enabled = true;
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
    } else if (this.practiceMode) data = practiceGreen;
    else if (file.id === BENCH_ID) data = benchCourse(bench.object, bench);
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
    this.tileImgs = [];
    // Round 2b: the region's theme (or the U panel's pick, or ?theme= / ?region= on a test course).
    this.theme = this.pickTheme();
    this.cameras.main.setBackgroundColor(manifest.themes?.[this.theme]?.sky ?? '#1d2b53');
    for (const p of buildDrawList(course)) if (p.kind !== 'exit') this.place(p);

    panel = getPanel();
    // Round 2b: picking a theme in the U panel shows this course again in it.
    panel.onTheme = () => (this.runMode ? this.scene.restart({ run: true }) : this.practiceMode ? this.scene.restart({ practice: true }) : this.restartCourse());

    const run = this.runMode ? session.run : null;
    const urlMod = testCourseMod();
    this.play = createPlay(course, tuning, {
      seed: this.runMode ? run!.current!.courseSeed : this.seed,
      // Round 3: the run's character (or, on the practice green, the one chosen in the Burrow).
      ...(run ? { character: run.character } : this.practiceMode ? { character: session.run?.character ?? session.profile.character } : {}),
      ...(run ? { loadout: loadoutOf(run), enemyModifiers: enemyModifiersFor(run), bossHealth: bossHealthFor(run) } : this.practiceMode ? { loadout: practiceLoadout() } : urlMod ? { loadout: { courseMod: urlMod } } : {}),
    });
    this.runReported = false;
    this.setRunPanel();
    // Owner, 2026-11-19: a boss fight opens with the boss's introduction card.
    // Milestone 8b: unless it was just shown at the boss gate.
    if (run && arena && run.current?.boss && !session.skipBossIntro) this.showBossIntro(run.current.boss, run.region);
    session.skipBossIntro = false;
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
      ranks: [{ id: '', label: 'Standard' }, ...RANKS.map((r) => ({ id: String(r.rank), label: r.name }))],
      traits: [{ id: '', label: '(no trait)' }, ...[...TRAITS.values()].map((t) => ({ id: t.id, label: t.name }))],
      elements: [{ id: '', label: '(no element)' }, ...ELEMENT_IDS.map((el) => ({ id: el, label: el }))],
      onLoad: (object, ability, extras) => {
        bench.object = object;
        bench.ability = ability;
        Object.assign(bench, extras);
        this.switchCourse(TEST_COURSES.findIndex((c) => c.id === BENCH_ID));
      },
    });
    this.phase = 'plan';
    // Each course starts with no spin or curve (owner, 2026-11-15).
    settings.top = 0;
    settings.side = 0;
    this.messageQueue = [];
    // Round 2b: a course modifier is announced as the course opens.
    if (this.play.courseMod) this.queueMessage(courseModBanner(this.play.courseMod), 0xf8a040, 4000);
    this.message = null;
    this.endScreen = null;
    this.statusKey = '';
    // Phaser reuses this scene object for every course, and the old course's drawings are destroyed with it.
    // Found 2026-11-24: these were kept, so from the second course on the warning marks (spike lines, the
    // centipede's circle, soldier and puff rings, the slam ring) were drawn on destroyed objects and never showed.
    this.marksGfx = null;
    this.slamGfx = null;
    this.bossHud = null;
    this.bossKey = '';
    this.spikeMarksShown = 0;
    this.sweepFlashUntil = 0;
    this.objectImgs = new Map();
    this.shadowImg = this.makeSprite('ball-shadow');
    this.ballImg = this.makeSprite(this.play.character.sprite);
    this.exitImg = this.makeSprite('exit', 'closed');
    this.guide = this.add.graphics().setDepth(OVERLAY_DEPTH - 1);
    this.debugDyn = this.add.graphics().setDepth(OVERLAY_DEPTH - 2);
    this.syncObjects();
    this.drawRails(course);
    this.drawScenery(course);
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
    else this.startIntro();
  }

  /** Owner, 2026-11-23: true while the course opens zoomed in on the ball; no input and no play until it ends. */
  private intro = false;

  /**
   * The opening zoom: close in on the ball (the walking camera's zoom), hold,
   * then zoom out to the normal view. The HUD is hidden meanwhile (it would be
   * scaled with the camera), and the round begins when the zoom ends.
   */
  private startIntro(): void {
    const cam = this.cameras.main;
    this.intro = true;
    this.input.enabled = false;
    if (this.input.keyboard) this.input.keyboard.enabled = false;
    const hud = this.children.list.filter((o) => (o as unknown as { scrollFactorX?: number }).scrollFactorX === 0) as unknown as { setVisible: (v: boolean) => void; visible: boolean }[];
    const hidden = hud.filter((o) => o.visible);
    for (const o of hidden) o.setVisible(false);
    cam.setZoom(COURSE_INTRO.zoom);
    this.time.delayedCall(COURSE_INTRO.holdMs, () => cam.zoomTo(1, COURSE_INTRO.zoomMs, 'Sine.easeInOut'));
    this.time.delayedCall(COURSE_INTRO.holdMs + COURSE_INTRO.zoomMs, () => {
      cam.setZoom(1);
      for (const o of hidden) o.setVisible(true);
      this.intro = false;
      this.input.enabled = true;
      if (this.input.keyboard) this.input.keyboard.enabled = true;
      this.centreOnBall();
    });
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
        p.y -= this.bumpAt(t.x + 0.5, t.y + 0.5);
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
          q.y -= this.bumpAt(x, y);
          this.makeSprite(RAIL.barSprite, frame).setPosition(q.x, q.y).setDepth(this.standingDepth(x, y));
        }
      });
    }
  }

  /**
   * Scenery (round 2a sheet section 2.6): props lying on the ground, under the
   * ball and everything standing. Looks only. The U panel can hide them all.
   */
  private sceneryImgs: Phaser.GameObjects.Image[] = [];
  /** Animated scenery (fireflies): the image, its sprite and how fast it flickers; each starts at its own point. */
  private sceneryAnims: { img: Phaser.GameObjects.Image; sprite: string; frameMs: number; offset: number }[] = [];
  private drawScenery(course: Course): void {
    this.sceneryAnims = [];
    this.sceneryImgs = course.scenery.map((s, k) => {
      const def = SCENERY.get(s.id)!;
      const z = groundAt(course, s.x, s.y)?.h ?? 0;
      const p = project(s.x, s.y, z / STEP_HEIGHT);
      p.y -= this.bumpAt(s.x, s.y);
      const frame = manifest.sprites[this.sprite(def.sprite)]?.frames[0] ?? 'idle';
      // Lying on the ground, under everything standing; fireflies float above what stands on their tile.
      const depth = def.floats ? this.standingDepth(s.x, s.y) + 0.2 : tileDepth(Math.floor(s.x), Math.floor(s.y), 'arrow') + 0.5;
      const img = this.makeSprite(def.sprite, frame).setPosition(Math.round(p.x), Math.round(p.y)).setDepth(depth);
      if (def.frameMs) this.sceneryAnims.push({ img, sprite: this.sprite(def.sprite), frameMs: def.frameMs, offset: k * 97 });
      return img;
    });
    this.syncScenery();
  }
  private syncScenery(): void {
    const show = panel?.showScenery ?? true;
    for (const img of this.sceneryImgs) if (img.visible !== show) img.setVisible(show);
    for (const a of this.sceneryAnims) {
      const entry = manifest.sprites[a.sprite];
      if (!entry) continue;
      const f = entry.frames[Math.floor((this.time.now + a.offset) / a.frameMs) % entry.frames.length]!;
      a.img.setFrame(frameIndex(entry, f));
    }
  }

  /**
   * Darkness (round 2b sheet section 3): the screen darkens away from the ball.
   * Looks only; the rule part is the shorter aim guide (a stat).
   */
  private darkness: Phaser.GameObjects.Image | null = null;
  private drawDarkness(): void {
    if (this.play?.courseMod?.id !== 'darkness') {
      this.darkness?.setVisible(false);
      return;
    }
    if (!this.darkness || !this.darkness.active) {
      // A smooth fade from clear round the ball to dark, made once (a display effect, not game art).
      const key = 'darkness-vignette';
      if (!this.textures.exists(key)) {
        const size = 1024;
        const tex = this.textures.createCanvas(key, size, size)!;
        const ctx = tex.getContext();
        const grad = ctx.createRadialGradient(size / 2, size / 2, 30, size / 2, size / 2, 130);
        grad.addColorStop(0, 'rgba(5,5,16,0)');
        grad.addColorStop(1, 'rgba(5,5,16,0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        tex.refresh();
      }
      this.darkness = this.add.image(0, 0, key).setDepth(OVERLAY_DEPTH - 40);
    }
    const b = ballNow(this.play);
    const p = project(b.x, b.y, b.z / STEP_HEIGHT);
    this.darkness.setVisible(true).setPosition(Math.round(p.x), Math.round(p.y));
  }

  /**
   * The bot plays (owner, 2026-11-21): while it is on (Y, or the U panel), the
   * course check's bot takes every shot of the real game from where it is,
   * so you can watch it. It thinks for a moment first (the game pauses while
   * it tries shots in its head), and answers the food card by stashing.
   */
  private brain: ReturnType<typeof botBrain> | null = null;
  private botThinkAt = 0;
  private botTurn(): void {
    const on = !!panel?.botPlays;
    if (!on || !this.play || this.watching || this.play.status !== 'playing') {
      this.brain = null;
      this.botThinkAt = 0;
      return;
    }
    if (!canShoot(this.play) || this.phase === 'flight' || this.foodCard) return;
    if (!this.brain) this.brain = botBrain(this.course!, getTuning(), watchBotConfig());
    // Show "thinking" for a moment (and let that frame draw) before the pause while it tries shots.
    if (!this.botThinkAt) {
      this.botThinkAt = this.time.now + 600;
      this.showMessage('BOT THINKING...', 0x80c8ff);
      return;
    }
    if (this.time.now < this.botThinkAt) return;
    this.botThinkAt = 0;
    const pick = this.brain.choose(this.play);
    if (!pick.chosen) {
      panel?.setBotPlays(false);
      this.showMessage(`BOT STOPPED: ${pick.reason.toUpperCase()}`, BAD);
      return;
    }
    this.fire(pick.chosen.cmd);
  }

  /**
   * The wind vane (owner, 2026-11-21): an arrow pointing the way the wind
   * blows on screen, and a gauge of 1 to 3 bars for its strength.
   */
  private windVane(dir: Direction, strength: number, x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    c.add(g);
    g.fillStyle(UI_BG, 0.85).fillRect(0, 0, 34, 16);
    g.lineStyle(1, 0x5a6080, 1).strokeRect(0.5, 0.5, 33, 15);
    // Grid directions on screen: x runs down-right, y down-left (iso.ts).
    const [gx, gy] = { ne: [0, -1], se: [1, 0], sw: [0, 1], nw: [-1, 0] }[dir] as [number, number];
    const sx = gx - gy;
    const sy = (gx + gy) / 2;
    const len = Math.hypot(sx, sy);
    const ux = sx / len;
    const uy = sy / len;
    const cx = 9;
    const cy = 8;
    g.lineStyle(1, 0xf8a040, 1).lineBetween(cx - ux * 6, cy - uy * 6, cx + ux * 6, cy + uy * 6);
    // Arrow head.
    const hx = cx + ux * 6;
    const hy = cy + uy * 6;
    g.fillStyle(0xf8a040, 1).fillTriangle(hx, hy, hx - ux * 4 - uy * 3, hy - uy * 4 + ux * 3, hx - ux * 4 + uy * 3, hy - uy * 4 - ux * 3);
    // Strength gauge: 1 to 3 bars, rising.
    for (let k = 0; k < 3; k++) {
      const on = k < strength;
      g.fillStyle(on ? 0xf8a040 : 0x303448, 1).fillRect(20 + k * 4, 12 - (k + 1) * 3, 3, (k + 1) * 3);
    }
    return c;
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
    settleFood(p);
    finishCourse(run, { won: p.status === 'won', lostBy: p.lostBy, health: p.health, wallet: p.wallet, ability: p.ability, gear: p.gear, gear2: p.gear2, blueStars: p.blueStars, foods: p.foods });
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

  /** Milestone 8b: leave the practice green, standing next to it. */
  private backToTown(): void {
    this.scene.start('place', { kind: 'town', back: 'tee' });
  }

  /** Key 7: start a run, or go back to the one in progress. */
  private openRun(): void {
    const run = activeRun();
    if (!run) {
      // Milestone 7: runs start from the Burrow.
      this.scene.start('burrow');
    } else if (run.status === 'course') {
      if (!this.runMode) this.scene.restart({ run: true, debug: this.debugMode });
    } else goRun(this);
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
      debugBossHealth(this.play, boss, n);
      this.showEvents(drainLog(this.play));
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
      worker.postMessage({ seed, budget, tuning, opts: testRegionOpts() });
    } catch {
      this.time.delayedCall(50, () => {
        const t0 = performance.now();
        const result = generateCourse(seed, budget, tuning!, testRegionOpts());
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
    this.syncScenery();
    this.drawDarkness();
    // Owner, 2026-11-23: the round waits for the opening zoom.
    if (this.intro) {
      if (this.course) {
        this.animateTiles();
        this.syncObjects();
      }
      return;
    }
    this.botTurn();
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
      this.showMessage(m.text, m.color, m.ms);
    }
  }

  // -------------------------------------------------------------------------

  /** The ground's images, so the ground can be drawn again when it changes (a drawbridge coming down). */
  private tileImgs: Phaser.GameObjects.Image[] = [];

  /** Round 2b: draw the ground again from the course as it is now. */
  private redrawGround(): void {
    this.course = this.play.course;
    for (const img of this.tileImgs) img.destroy();
    this.tileImgs = [];
    this.animated = [];
    for (const p of buildDrawList(this.play.course)) if (p.kind !== 'exit') this.place(p);
  }

  /** Round 2b: the visual theme on this course ("day" is the plain sprites). */
  private theme = 'day';
  private pickTheme(): string {
    const chosen = getPanel().theme;
    if (chosen) return chosen;
    if ((this.runMode || this.practiceMode) && session.run) return themeForRegion(session.run.region, session.run.seed);
    const params = new URLSearchParams(window.location.search);
    const t = params.get('theme');
    if (t && (THEMES as readonly string[]).includes(t)) return t;
    const n = Number(params.get('region'));
    return n ? themeForRegion(n) : 'day';
  }

  /** The sprite to draw for an id in this course's theme. */
  private sprite(id: string): string {
    return themedSprite(manifest, id, this.theme === 'day' ? null : this.theme);
  }

  private place(p: Placement): void {
    const id = this.sprite(p.sprite);
    const entry = manifest.sprites[id];
    if (!entry) throw new Error(`Sprite "${id}" is not in the asset manifest.`);
    const img = this.add
      .image(p.x, p.y, id, frameIndex(entry, p.frame))
      .setOrigin(entry.anchor[0] / entry.frameWidth, entry.anchor[1] / entry.frameHeight)
      .setDepth(p.depth);
    this.tileImgs.push(img);
    // Owner, 2026-11-21: ground bumps, for looks only.
    const t = p.kind === 'top' && panel?.groundBumps !== false ? tileAt(this.course!, p.tile.x, p.tile.y) : null;
    const lift = t ? groundBump(t) : 0;
    if (lift && t) {
      const depth = bumpTopDepth(this.course!, t);
      this.tileImgs.push(this.add.image(p.x, p.y, id, frameIndex(entry, p.frame)).setOrigin(img.originX, img.originY).setDepth(depth - 0.01).setTint(GROUND_BUMPS.edgeTint));
      img.setDepth(depth).y -= lift;
    }
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
    // Owner, 2026-11-21: Y lets the bot play this game (and the next ones) until Y again.
    kb.on('keydown-Y', () => {
      const p = getPanel();
      p.setBotPlays(!p.botPlays);
      this.showMessage(p.botPlays ? 'THE BOT PLAYS. Y: TAKE OVER' : 'YOU PLAY AGAIN', 0x80c8ff);
    });
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

  private makeSprite(spriteId: string, frame = 'idle'): Phaser.GameObjects.Image {
    const id = this.sprite(spriteId);
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

  /** Round 4: the leg ring flashes after a sweep until this time. */
  private sweepFlashUntil = 0;
  private spikeMarksShown = 0;

  /**
   * Round 4: a point `out` tiles out from the centipede's edge at edge point
   * `u` (on its rectangle `r`, which shrinks when the coil tightens), rounding
   * the corners.
   */
  private coilCentre(r: CoilRect, u: number, out: number): { x: number; y: number; ex: number; ey: number; nx: number; ny: number } {
    const P = coilEdgeLength(r);
    const pt = coilEdgePoint(r, u);
    const m = ((u % P) + P) % P;
    const corners = coilCorners(r);
    const cn = corners.find((x) => x > m + 1e-9)!;
    const cp = [...corners].reverse().find((x) => x <= m + 1e-9)!;
    let nx = pt.nx;
    let ny = pt.ny;
    let mag = 1;
    const blend = (d: number, at: number) => {
      if (d >= 1) return;
      const o = coilEdgePoint(r, at);
      const t = 1 - d;
      nx += o.nx * t;
      ny += o.ny * t;
      mag = 1 + (Math.SQRT2 - 1) * t;
    };
    blend(cn - m, cn + 0.001);
    blend(m - cp, cp - 0.001);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    return { x: pt.x + nx * mag * out, y: pt.y + ny * mag * out, ex: pt.x, ey: pt.y, nx: pt.nx, ny: pt.ny };
  }

  /**
   * Round 4: draw the centipede's body (shell domes round the outside of the
   * edge), its legs in the leg ring, and the faint red leg ring. The two near
   * sides turn see-through when the ball is behind them (sheet section 3).
   */
  private drawCoil(e: EnemyState, show: (uid: string, sprite: string, x: number, y: number, z: number, opts?: { frame?: string; lift?: number; depth?: number; alpha?: number; tint?: number; dx?: number }) => void): void {
    const coil = e.coil!;
    const play = this.play;
    const c = play.course;
    const W = c.width;
    const H = c.height;
    const def = BOSSES.get(e.def.behaviour.kind === 'boss' ? e.def.behaviour.boss : '');
    const rules = def?.gimmick?.kind === 'coil' ? def.gimmick : null;
    if (!rules) return;
    const now = this.time.now;
    const ball = ballNow(play);
    const len = coilSegmentLength(c, coil);
    const rect = coilRectOf(c, coil);
    const groundZ = (x: number, y: number) => groundAt(c, Math.min(W - 0.01, Math.max(0.01, x)), Math.min(H - 0.01, Math.max(0.01, y)))?.h ?? 0;
    for (let k = 0; k < coil.segments; k++) {
      const start = coilSegmentStart(c, coil, k);
      const weak = coil.weak.includes(k);
      const scabbed = weak && !coilSoft(coil, k);
      const shooter = coil.shooters.includes(k);
      for (const j of [0.25, 0.75]) {
        const u = start + len * j;
        // Drawn a little in from the body's true middle so the domes meet the map edge (the sprite's round sides leave a gap otherwise).
        const ctr = this.coilCentre(rect, u, rules.bodyWidth * 0.4);
        const z = groundZ(ctr.ex, ctr.ey);
        const near = ctr.x > rect.x1 - 0.01 || ctr.y > rect.y1 - 0.01;
        const behind = near && Math.hypot(ball.x - ctr.ex, ball.y - ctr.ey) < 3.8;
        // Owner, 2026-11-24: a weak spot that was just hit shows its new shell (a scab) until it wears off.
        const frame = scabbed ? 'scab' : weak ? 'weak' : shooter && j === 0.25 ? 'shooter' : 'armour';
        show(`${e.uid}:seg:${k}:${j}`, 'centipede-segment', ctr.x, ctr.y, z, { frame, alpha: behind ? 0.35 : 1, ...(e.defeated && { tint: 0x808080 }) });
        // Legs: one tile in, in the leg ring, scuttling.
        const lx = ctr.ex - ctr.nx * 0.5;
        const ly = ctr.ey - ctr.ny * 0.5;
        const step = e.defeated ? 0 : (Math.floor(now / 110) + k * 2 + (j > 0.5 ? 1 : 0)) % 2;
        show(`${e.uid}:legs:${k}:${j}`, 'centipede-legs', lx, ly, groundZ(lx, ly), { frame: step ? 'b' : 'a', depth: this.standingDepth(lx, ly) - 0.3, alpha: e.defeated ? 0.6 : 1 });
      }
    }
    if (e.defeated) return;
    // The leg ring: where the sweep reaches. Brighter when the next turn is a sweep turn and the ball is in it.
    const warn = !play.shot && coilNextTurn(e) === 'sweep' && inLegRing(rect, ball.x, ball.y, rules.legReach);
    const flash = now < this.sweepFlashUntil;
    const alpha = flash ? 1 : warn ? 0.6 + 0.4 * Math.abs(Math.sin(now / 160)) : 0.6;
    for (let ty = 0; ty < H; ty++) {
      for (let tx = 0; tx < W; tx++) {
        // Tiles under the body once the coil tightens are not part of the ring.
        if (tx + 0.5 < rect.x0 || ty + 0.5 < rect.y0 || tx + 0.5 > rect.x1 || ty + 0.5 > rect.y1) continue;
        if (!inLegRing(rect, tx + 0.5, ty + 0.5, rules.legReach)) continue;
        show(`${e.uid}:ring:${tx},${ty}`, 'danger-tile', tx + 0.5, ty + 0.5, groundZ(tx + 0.5, ty + 0.5), { depth: tileDepth(tx, ty, 'arrow'), alpha });
      }
    }
    // Owner, 2026-11-24: spikes stuck in the ground; they fade on their last turn.
    for (const q of coil.quills) show(q.uid, 'centipede-quill-stuck', q.x, q.y, groundZ(q.x, q.y), { alpha: q.turnsLeft <= 1 ? 0.55 + 0.25 * Math.abs(Math.sin(now / 150)) : 1 });
  }

  /** Round 4: a spike flying along its line. */
  private flySpike(line: CoilLine): void {
    const c = this.play.course;
    const z = (x: number, y: number) => (groundAt(c, Math.min(c.width - 0.01, Math.max(0.01, x)), Math.min(c.height - 0.01, Math.max(0.01, y)))?.h ?? 0) / STEP_HEIGHT;
    const a = project(line.x0, line.y0, z(line.x0, line.y0));
    const b = project(line.x1, line.y1, z(line.x1, line.y1));
    const img = this.makeSprite('centipede-quill');
    img.setPosition(a.x, a.y - 8).setRotation(Math.atan2(b.y - a.y, b.x - a.x)).setDepth(OVERLAY_DEPTH - 25);
    this.tweens.add({ targets: img, x: b.x, y: b.y - 8, duration: 380, onComplete: () => img.destroy() });
  }

  /** Round 4: shell plates fall off these segments. */
  private dropPlates(uid: string, segments: readonly number[]): void {
    const e = this.play.enemies.find((x) => x.uid === uid);
    if (!e?.coil) return;
    const c = this.play.course;
    const len = coilSegmentLength(c, e.coil);
    for (const k of segments) {
      const ctr = this.coilCentre(coilRectOf(c, e.coil), coilSegmentStart(c, e.coil, k) + len / 2, 1);
      const p = project(ctr.x, ctr.y, 0);
      const img = this.makeSprite('centipede-plate');
      img.setPosition(p.x, p.y - 18).setDepth(OVERLAY_DEPTH - 26);
      this.tweens.add({ targets: img, y: p.y + 6, alpha: 0, angle: 90, duration: 900, onComplete: () => img.destroy() });
    }
  }

  /** Make the sprites for course objects match the simulation: new things appear, gone ones are hidden. */
  private syncObjects(): void {
    const play = this.play;
    const now = this.time.now;
    const bob = Math.round(Math.sin(now / 250) * 1);
    const seen = new Set<string>();
    const show = (uid: string, sprite: string, x: number, y: number, z: number, opts: { frame?: string; lift?: number; depth?: number; alpha?: number; tint?: number; dx?: number } = {}) => {
      seen.add(uid);
      let img = this.objectImgs.get(uid);
      if (!img) {
        img = this.makeSprite(sprite, opts.frame ?? manifest.sprites[sprite]?.frames[0] ?? 'idle');
        this.objectImgs.set(uid, img);
      }
      const themedId = this.sprite(sprite);
      const entry = manifest.sprites[themedId]!;
      if (img.texture.key !== themedId || opts.frame) img.setTexture(themedId, frameIndex(entry, opts.frame ?? entry.frames[0]!));
      const p = project(x, y, z / STEP_HEIGHT);
      p.y -= this.bumpAt(x, y, z);
      img
        .setVisible(true)
        .setAlpha(opts.alpha ?? 1)
        .setPosition(Math.round(p.x) + (opts.dx ?? 0), Math.round(p.y) - (opts.lift ?? 0))
        .setDepth(opts.depth ?? this.standingDepth(x, y));
      if (opts.tint !== undefined) img.setTint(opts.tint);
      else img.clearTint();
    };
    const ball = ballNow(play);
    const moving = !!play.shot;

    for (const b of play.blockers) show(b.uid, b.def.sprite, b.x, b.y, b.z);
    for (const m of play.movers) {
      const gate = m.def.motion.kind === 'gate' || m.def.motion.kind === 'linked';
      show(m.uid, m.def.sprite, m.x, m.y, m.z, gate ? { frame: m.open ? 'open' : 'closed' } : {});
      // A gate across y is the same picture mirrored.
      if (gate) this.objectImgs.get(m.uid)?.setFlipX(m.shape.kind === 'box' && m.shape.hy > m.shape.hx);
    }
    // Round 2b: switches lie flat on their tile; a drawbridge's planks stand up at each tile until it comes down.
    for (const w of play.switches) show(w.uid, w.def.sprite, w.x, w.y, groundAt(play.course, w.x, w.y)?.h ?? 0, { frame: w.on ? 'on' : 'off', depth: tileDepth(Math.floor(w.x), Math.floor(w.y), 'arrow') });
    for (const d of play.drawbridges) if (!d.down) show(d.uid, d.def.sprite, d.tx + 0.5, d.ty + 0.5, groundAt(play.course, d.tx + 0.5, d.ty + 0.5)?.h ?? 0);
    for (const b of play.breakables) {
      if (b.broken) continue;
      if (!b.def.shape) show(b.uid, b.def.sprite, b.x, b.y, b.z, { depth: tileDepth(b.tx, b.ty, 'arrow') });
      else if (b.def.sprite === 'secured-crate') show(b.uid, b.def.sprite, b.x, b.y, b.z, { frame: b.health < b.def.health ? 'cracked' : 'whole' });
      else show(b.uid, b.def.sprite, b.x, b.y, b.z);
    }
    for (const e of play.enemies) {
      // Round 4: the centipede's body round the edge (it stays as the wall once beaten). Its head is drawn only while it is up.
      if (e.coil) {
        this.drawCoil(e, show);
        if (e.defeated || e.coil.head !== 'up') continue;
      }
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
      // Milestone 8: Gloamhorn shows its open shell; an enemy with an element is tinted (the colour is in the manifest).
      const open = isBoss(e) && shellIsOpen(this.play, e) && manifest.sprites[e.def.sprite]?.frames.includes(`open${e.phase + 1}`);
      const tint = e.element ? elementTint(e.element) : undefined;
      show(e.uid, e.def.sprite, e.x, e.y, e.z, { alpha: near && Math.floor(now / 80) % 2 ? 0.45 : 1, ...(isBoss(e) && { frame: `${open ? 'open' : 'phase'}${e.phase + 1}` }), ...(tint !== undefined && { tint }) });
      if (e.activated) show(`${e.uid}:alert`, 'alert', e.x, e.y, e.z, { lift: 18 + bob, depth: HUD_DEPTH - 10 });
      // A floating Glowmoth casts a shadow on the ground, so its height is easy to read.
      if (floatOf(e) > 0) {
        const gz = groundAt(play.course, e.x, e.y)?.h ?? 0;
        show(`${e.uid}:shadow`, 'ball-shadow', e.x, e.y, gz, { depth: tileDepth(Math.floor(e.x), Math.floor(e.y), 'shadow'), alpha: 0.7 });
        this.objectImgs.get(`${e.uid}:shadow`)?.setScale(2.2, 2);
      }
      // Statuses: one icon each, side by side above it.
      const sts = e.statuses.map((st) => STATUSES.get(st.id)?.icon).filter((i): i is string => !!i && !!manifest.sprites[i]);
      sts.forEach((icon, k) => show(`${e.uid}:st:${icon}`, icon, e.x, e.y, e.z, { lift: 22, dx: (k - (sts.length - 1) / 2) * 11, depth: HUD_DEPTH - 10 }));
      // Rank, traits and carried gear (sheet section 7.0a): a row of small badges above it.
      const badges: string[] = [];
      if (e.rank === 1) badges.push('rank-veteran');
      if (e.rank === 2) badges.push('rank-elite');
      for (const t of e.traits) badges.push(`trait-${t}`);
      if (e.gear) badges.push(GEAR.get(e.gear)!.icon);
      const lift = isBoss(e) ? 44 : 14 + (manifest.sprites[e.def.sprite]?.frameHeight ?? 16) - 8;
      badges.forEach((b, k) => show(`${e.uid}:b:${b}`, b, e.x, e.y, e.z, { lift: lift + (e.gear && k === badges.length - 1 ? 3 : 0), dx: (k - (badges.length - 1) / 2) * 9, depth: HUD_DEPTH - 11 }));
      // A bug whose front or back matters shows which way it faces.
      if (!isBoss(e) && [...e.guardedSides, ...e.weakSpots].some((sd) => sd === 'front' || sd === 'behind')) {
        show(`${e.uid}:face`, 'facing-mark', e.x + e.fx * 0.45, e.y + e.fy * 0.45, e.z - floatOf(e), { depth: tileDepth(Math.floor(e.x), Math.floor(e.y), 'shadow') + 0.5, alpha: 0.85 });
      }
      for (const m of e.globMarks) {
        const z = groundAt(play.course, m.x, m.y)?.h ?? 0;
        show(`${e.uid}:glob:${m.x.toFixed(2)}`, 'target-ring', m.x, m.y, z, { depth: tileDepth(Math.floor(m.x), Math.floor(m.y), 'shadow'), alpha: 0.6 + 0.4 * Math.abs(Math.sin(now / 200)), tint: 0xa0ff60 });
      }
      if (e.lobTarget) {
        const z = groundAt(play.course, e.lobTarget.x, e.lobTarget.y)?.h ?? 0;
        show(`${e.uid}:ring`, 'target-ring', e.lobTarget.x, e.lobTarget.y, z, {
          depth: tileDepth(Math.floor(e.lobTarget.x), Math.floor(e.lobTarget.y), 'shadow'),
          alpha: 0.6 + 0.4 * Math.abs(Math.sin(now / 200)),
        });
      }
    }
    for (const sd of play.seeds) show(sd.uid, 'seed', sd.shot.ball.x, sd.shot.ball.y, sd.shot.ball.z);
    this.drawMarks();
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
      p.y -= this.bumpAt(c.exit.x + 0.5, c.exit.y + 0.5);
      const entry = manifest.sprites.exit!;
      this.exitImg
        .setTexture('exit', frameIndex(entry, play.exitOpen ? 'open' : 'closed'))
        .setPosition(Math.round(p.x), Math.round(p.y))
        .setDepth(tileDepth(c.exit.x, c.exit.y, 'exit'));
    }
    this.drawDebugDynamic();
  }

  /** Put the ball and its shadow on screen. Heights in the sim are tiles; the screen uses steps. */
  /**
   * Owner, 2026-11-21: pixels a thing at (x, y), at height z (tiles), is drawn
   * raised because its tile is drawn raised (ground bumps). Fades out as it
   * rises above the ground, so flying things do not jump between tiles.
   */
  private bumpAt(x: number, y: number, z?: number): number {
    if (panel?.groundBumps === false || !this.course) return 0;
    const g = groundAt(this.course, x, y);
    if (!g) return 0;
    return groundBump(g.tile) * Math.max(0, 1 - ((z ?? g.h) - g.h) / 0.25);
  }

  private drawBall(b: BallState): void {
    const course = this.course!;
    const tx = Math.floor(b.x);
    const ty = Math.floor(b.y);
    const g = groundAt(course, b.x, b.y);
    // Owner, 2026-11-21: on a tile drawn raised (ground bumps), the ball is drawn raised too.
    const p = project(b.x, b.y, b.z / STEP_HEIGHT);
    p.y -= this.bumpAt(b.x, b.y, b.z);
    // In water the ball is drawn under the see-through surface; flying over it, on top.
    const inWater = !!g && !!SURFACES.get(g.tile.surface)?.sinks && b.z <= g.h + 0.05;
    const overWater = !!g && !!SURFACES.get(g.tile.surface)?.overlaySprite && !inWater;
    const depth = overWater ? tileDepth(tx, ty, 'overlay') + 0.5 : this.standingDepth(b.x, b.y);
    // Tornado: the ball becomes a small whirlwind. Immune after damage: it blinks.
    // Owner, 2026-11-26: standing still, the character stands up on two legs facing the aim;
    // a shot or a knock rolls it into the ball, and so does a hit that does not move it (for a moment).
    const standing = !this.play.shot && this.time.now >= this.curlUntil;
    const facing = this.aimFacing();
    const walk = this.play.character.walkSprite;
    const frame = this.play.tornado ? `t${Math.floor(this.time.now / 60) % 4}` : standing ? `stand-${facing}` : 'ball';
    if (frame !== this.ballFrame) {
      this.ballFrame = frame;
      let id: string;
      if (this.play.tornado) {
        id = 'ball-tornado';
        this.ballImg.setTexture(id, frameIndex(manifest.sprites[id]!, frame.slice(1)));
      } else if (standing) {
        id = facing[1] === 'l' ? `${walk}-left` : walk;
        this.ballImg.setTexture(id, frameIndex(manifest.sprites[id]!, `${facing}-stand`));
      } else {
        id = this.play.character.sprite;
        this.ballImg.setTexture(id, 0);
      }
      const e = manifest.sprites[id]!;
      this.ballImg.setOrigin(e.anchor[0] / e.frameWidth, e.anchor[1] / e.frameHeight);
    }
    this.ballImg
      .setPosition(Math.round(p.x), Math.round(p.y))
      .setDepth(depth)
      .setAlpha(isImmune(this.play) && Math.floor(this.time.now / 70) % 2 ? 0.35 : 1);
    if (g && g.h <= b.z + 0.01 && !inWater) {
      const sp = project(b.x, b.y, g.h / STEP_HEIGHT);
      sp.y -= this.bumpAt(b.x, b.y);
      this.shadowImg.setVisible(true).setPosition(Math.round(sp.x), Math.round(sp.y)).setDepth(tileDepth(tx, ty, 'shadow'));
    } else {
      this.shadowImg.setVisible(false);
    }
    this.ballScreen = { x: p.x, y: p.y };
  }

  /** Which way the standing character faces on screen: the aim, turned from the ground to the screen. */
  private aimFacing(): 'ul' | 'ur' | 'dl' | 'dr' {
    const gx = Math.cos(this.aim);
    const gy = Math.sin(this.aim);
    const sx = gx - gy;
    const sy = gx + gy;
    return `${sy < 0 ? 'u' : 'd'}${sx < 0 ? 'l' : 'r'}`;
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
      if (this.practiceMode) this.scene.restart({ practice: true });
      else if (this.runMode) this.showMessage('NO RESTARTS IN A RUN', BAD);
      else this.restartCourse();
    });
    onKey('ENTER', () => {
      if (this.runMode) {
        if (this.play.status === 'playing') return;
        this.reportRun();
        this.scene.start('map');
        return;
      }
      if (this.practiceMode) {
        if (this.play.status !== 'playing') this.backToTown();
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
    onKey('ESC', () => {
      // On the practice green, Esc while planning goes back to town (sheet section 2.3).
      if (this.practiceMode && (this.phase === 'plan' || this.play.status !== 'playing')) this.backToTown();
      else this.cancelCharge();
    });

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
      // Round 2a (owner, 2026-11-21): picked-up food asks "eat now or stash it?" and the world waits.
      if (this.play.foodPending.length) {
        this.accumulator = 0;
        this.showFoodPrompt();
        break;
      }
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
      // Tornado and Gyre steer with Left/Right; Drift moves in screen directions with the arrows or W A S D (round 2b).
      const lr = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const ud = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      const steer = this.play.tornado || this.play.steering?.kind === 'gyre' ? lr : 0;
      const drift = this.play.steering?.kind === 'drift' && (lr || ud) ? { x: lr, y: ud } : undefined;
      const input = { ...(this.boostQueued && { boost: true }), ...(this.abilityQueued && { ability: true }), ...(steer && { steer }), ...(drift && { move: drift }) };
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
          // Owner, 2026-11-26: hurt while standing still, Rollo is knocked into a ball, then stands up again.
          if (!this.play.shot) this.curlUntil = this.time.now + CURL_MS;
          const what = { spikes: 'SPIKES', sunk: 'SANK', out: 'OUT OF BOUNDS', enemy: 'OUCH', seed: 'HIT BY A SEED', zap: 'ZAPPED', slam: 'SLAMMED', burn: 'BURNING', blast: 'BLAST', charge: 'CHARGED', bite: 'BITTEN', ring: 'SOLDIER ANTS', quill: 'SPIKED', sweep: 'SWEPT BY THE LEGS', burst: 'THE HEAD BURST UP' }[e.cause];
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
        case 'status': {
          // Milestone 8: statuses on the ball, and the new ones on enemies.
          const word = { burning: 'BURNING', poisoned: 'POISONED', chilled: 'CHILLED' }[e.status] ?? e.status.toUpperCase();
          const what = e.target === 'ball' ? `YOU ARE ${word}` : `${this.nameOf(e.target)} IS ${word}`;
          const hint = e.target === 'ball' ? { burning: ': -1 HEALTH EACH SHOT. WATER PUTS IT OUT', poisoned: ': HIT DAMAGE -1', chilled: ': YOU SLIDE AS IF ON ICE' }[e.status] ?? '' : '';
          this.queueMessage(`${what}${hint}`, e.target === 'ball' ? BAD : 0xf8a020);
          break;
        }
        case 'statusEnd':
          if (e.target === 'ball' && e.status === 'burning' && this.play.ballStatuses.length === 0) this.queueMessage('THE BURN IS OUT', GOOD);
          break;
        case 'fuse':
          this.showMessage('IT IS GOING TO BLOW!', FUSE_RING);
          break;
        case 'blast':
          this.showMessage('BOOM!', FUSE_RING);
          break;
        case 'split':
          this.queueMessage('IT SPLIT IN TWO!', GUIDE_WARN);
          break;
        case 'regen':
          this.queueMessage(`${this.nameOf(e.enemy)} HEALS 1`, GUIDE_WARN);
          break;
        case 'gearDrop':
          this.queueMessage(`IT DROPPED ${GEAR.get(e.item)?.name.toUpperCase() ?? 'GEAR'}!`, GOOD);
          break;
        case 'freeze':
          break;
        case 'melt':
          this.queueMessage('THE ICE MELTS', GUIDE_WARN);
          break;
        case 'staticZap':
          break;
        case 'windup':
          this.queueMessage(`${this.nameOf(e.enemy)} IS GOING TO CHARGE! (ARROW)`, GUIDE_WARN);
          break;
        case 'shellOpen':
          this.queueMessage('ITS SHELL IS OPEN! HIT ITS BACK', GOOD);
          break;
        case 'ringMark':
          this.queueMessage('SOLDIER ANTS ARE COMING! (PURPLE RING)', GUIDE_WARN);
          break;
        case 'puff':
          if (e.hit) this.showMessage('STINK!', PUFF_RING);
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
        case 'foodFound':
          // The eat-or-stash card opens from the update loop (the world waits for the answer).
          break;
        case 'foodEaten':
          this.queueMessage(
            e.auto ? `BAG FULL: ATE THE ${(FOODS.get(e.item)?.name ?? 'FOOD').toUpperCase()} NOW` : `ATE THE ${(FOODS.get(e.item)?.name ?? 'FOOD').toUpperCase()}`,
            0xf8d030,
          );
          break;
        case 'gateSpikes':
          this.queueMessage('OUCH! THE GATE IS SPIKED ON TOP', BAD);
          break;
        case 'switchOn':
          this.queueMessage('SWITCH ON!', GOOD);
          break;
        case 'bridgeDown':
          this.redrawGround();
          this.queueMessage('THE BRIDGE COMES DOWN', GOOD);
          break;
        case 'foodStashed':
          this.queueMessage(`${(FOODS.get(e.item)?.name ?? 'FOOD').toUpperCase()} STASHED IN YOUR BAG`, 0xf8d030);
          break;
        case 'slamMark':
          this.queueMessage('THE WARDEN WINDS UP: GET OUT OF THE RING!', BAD);
          break;
        case 'slam':
          if (!e.hit) this.queueMessage('SLAM! MISSED YOU', GOOD);
          this.cameras.main.shake(180, 0.006);
          break;
        case 'summon':
          this.queueMessage(`${this.nameOf(e.boss)} CALLS A ${this.nameOf(e.enemy)}!`, GUIDE_WARN);
          break;
        case 'phase':
          if (this.play.enemies.find((x) => x.uid === e.enemy)?.coil) this.queueMessage(`PLATES FALL OFF: MORE WEAK SPOTS! PHASE ${e.phase + 1}`, 0xf8e048);
          else this.queueMessage(`${this.nameOf(e.enemy)} SHEDS A PLATE! PHASE ${e.phase + 1}`, 0xf8e048);
          break;
        // Round 4: the centipede.
        case 'hit': {
          const boss = this.play.enemies.find((x) => x.uid === e.enemy);
          if (!boss?.coil) break;
          if (e.blocked) this.showMessage('CLANK! ARMOUR. HIT THE PALE SEGMENTS', UI_DIM, 900);
          else if (e.damage > 0) this.queueMessage(`HIT! -${e.damage}`, GOOD);
          break;
        }
        case 'spikeMark':
          if (this.spikeMarksShown++ < 2) this.queueMessage('SPIKES NEXT TURN: GET OFF THE RED LINES!', GUIDE_WARN);
          break;
        case 'spike':
          this.flySpike(e.line);
          break;
        case 'quillHit':
          this.showMessage('OUCH! A STUCK SPIKE', BAD, 900);
          break;
        case 'scab':
          this.queueMessage('THAT SPOT SCABS OVER FOR 2 TURNS: FIND ANOTHER', GUIDE_WARN);
          break;
        case 'tighten':
          this.cameras.main.shake(500, 0.01);
          this.queueMessage('THE COIL TIGHTENS! THE WALLS CLOSE IN', BAD, 2600);
          break;
        case 'sweep':
          this.sweepFlashUntil = this.time.now + 500;
          this.cameras.main.shake(160, 0.004);
          break;
        case 'crushed':
          this.puff(e.enemy);
          this.queueMessage(`${this.nameOf(e.enemy)} WAS CRUSHED!`, GOOD);
          break;
        case 'headMark':
          this.queueMessage('THE GROUND RUMBLES: GET OUT OF THE RED RING!', BAD);
          break;
        case 'headUp':
          this.cameras.main.shake(260, 0.008);
          this.queueMessage('THE HEAD IS UP! HIT IT FOR DOUBLE DAMAGE', GOOD);
          break;
        case 'headDown':
          this.queueMessage('THE HEAD SINKS BACK DOWN', UI_DIM);
          break;
        case 'plates':
          this.dropPlates(e.enemy, e.segments);
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
    const e = this.play.enemies.find((x) => x.uid === uid);
    return (e?.def.name ?? OBJECTS.get(uid.replace(/^summon:/, '').split('#')[0]!)?.name ?? 'ENEMY').toUpperCase();
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
    const word = ({ burn: 'BURN', poison: 'POISON', stun: 'STUN', zap: 'ZAP', heal: 'HEAL', knock: 'KNOCK', echo: 'ECHO' } as const)[e.effect];
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
    const next = boss.coil && !boss.defeated ? coilNextTurn(boss) : null;
    const key = `${boss.health},${boss.defeated},${boss.phase},${next}`;
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
      // Round 4: what the centipede does on its next turn, so the player can plan where to stop.
      if (next) {
        // Below the line where messages pop up (y 46), so the two never cover each other.
        c.add(this.add.rectangle(0, 25, w, 9, UI_BG, 0.9).setOrigin(0, 0));
        c.add(pixelText(this, manifest, 3, 26, next === 'sweep' ? 'NEXT: SWEEP (KEEP OUT OF THE RED RING)' : 'NEXT: SPIKES (KEEP OFF THE RED LINES)', { color: GUIDE_WARN }));
      }
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

  /**
   * The boss's introduction (owner, 2026-11-19; Milestone 8 sheet section
   * 10c): a pop-up card with the boss, its name, its title and the region,
   * for about 3 seconds; any key skips it (and does nothing else). A
   * placeholder for the Milestone 9 cutscene.
   */
  /**
   * Food picked up on the course (round 2a; owner, 2026-11-21): eat it now (it
   * works for the rest of this course, which counts as its first) or stash it
   * in the bag. A full bag never asks: the food is eaten at once.
   */
  private foodCard: Phaser.GameObjects.Container | null = null;
  private showFoodPrompt(): void {
    if (this.foodCard) return;
    // While the bot plays, it stashes what it finds (or eats it when the bag is full).
    if (panel?.botPlays) {
      decideFood(this.play, false);
      this.showEvents(drainLog(this.play));
      return;
    }
    const id = this.play.foodPending[0];
    const f = id ? FOODS.get(id) : undefined;
    if (!id || !f) return;
    const w = 220;
    const h = 92;
    const c = this.add.container(Math.round((VIEW_WIDTH - w) / 2), Math.round((VIEW_HEIGHT - h) / 2)).setScrollFactor(0).setDepth(HUD_DEPTH + 100);
    this.foodCard = c;
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.96).setOrigin(0, 0).setStrokeStyle(2, 0xf8d030));
    const line = (y: number, t: string, color: number) => {
      const txt = pixelText(this, manifest, 0, y, t, { color });
      txt.setX(Math.round((w - txt.width) / 2));
      c.add(txt);
    };
    line(7, `YOU FOUND ${f.name.toUpperCase()}!`, 0xf8d030);
    c.add(this.makeSprite(f.icon).setPosition(w / 2, 34).setScale(2));
    line(44, foodDesc(id), UI_TEXT);
    line(54, 'EATEN NOW, IT WORKS FROM NOW ON. LASTS 1 TO 3 COURSES', UI_DIM);
    line(68, 'E: EAT IT NOW', GOOD);
    line(78, `S OR ENTER: STASH IT (BAG ${FOOD.bagSlots - this.play.bagRoom}/${FOOD.bagSlots})`, UI_TEXT);
    const close = (eatIt: boolean) => {
      window.removeEventListener('keydown', onKey, true);
      c.destroy();
      this.foodCard = null;
      decideFood(this.play, eatIt);
      this.showEvents(drainLog(this.play));
    };
    // Caught before the game sees it, so the key does nothing else.
    const onKey = (ev: KeyboardEvent) => {
      const k = ev.key.toLowerCase();
      if (k !== 'e' && k !== 's' && k !== 'enter') return;
      ev.stopImmediatePropagation();
      ev.preventDefault();
      close(k === 'e');
    };
    window.addEventListener('keydown', onKey, true);
    this.events.once('shutdown', () => window.removeEventListener('keydown', onKey, true));
  }

  private showBossIntro(bossId: string, region: number): void {
    const def = BOSSES.get(bossId);
    const enemy = OBJECTS.get(bossId);
    if (!def || enemy?.kind !== 'enemy') return;
    const w = 220;
    const h = 120;
    const c = this.add.container(Math.round((VIEW_WIDTH - w) / 2), Math.round((VIEW_HEIGHT - h) / 2)).setScrollFactor(0).setDepth(HUD_DEPTH + 100);
    c.add(this.add.rectangle(0, 0, w, h, UI_BG, 0.96).setOrigin(0, 0).setStrokeStyle(2, BOSS_BAR));
    const endless = region > LAST_REGION;
    const head = endless ? `ENDLESS MODE - REGION ${region}` : region === LAST_REGION ? `REGION ${region} - THE FINAL BOSS` : `REGION ${region} BOSS`;
    const top = pixelText(this, manifest, 0, 8, head, { color: UI_DIM });
    top.setX(Math.round((w - top.width) / 2));
    c.add(top);
    const img = this.makeSprite(enemy.sprite, manifest.sprites[enemy.sprite]!.frames[0]!).setPosition(w / 2, 72).setScale(1.5);
    c.add(img);
    const name = pixelText(this, manifest, 0, 84, def.name.toUpperCase(), { color: BOSS_BAR });
    name.setX(Math.round((w - name.width) / 2));
    c.add(name);
    const title = pixelText(this, manifest, 0, 94, def.title.toUpperCase(), { color: UI_TEXT });
    title.setX(Math.round((w - title.width) / 2));
    c.add(title);
    const hint = pixelText(this, manifest, 0, 108, 'ANY KEY', { color: UI_DIM });
    hint.setX(Math.round((w - hint.width) / 2));
    c.add(hint);
    this.tweens.add({ targets: img, y: 68, duration: 500, yoyo: true, repeat: -1 });
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      window.removeEventListener('keydown', onKey, true);
      c.destroy();
    };
    // Caught before the game sees it, so the key that closes the card does nothing else.
    const onKey = (ev: KeyboardEvent) => {
      ev.stopImmediatePropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    this.time.delayedCall(3000, close);
    this.events.once('shutdown', close);
  }

  private marksGfx: Phaser.GameObjects.Graphics | null = null;

  /**
   * Milestone 8: marks on the ground drawn every frame: Stinkpuff puff rings,
   * the Brood Queen's soldier rings, Explosive fuses, Gloamhorn's charge arrow,
   * frozen water, and the Frost and Static auras round the ball.
   */
  private drawMarks(): void {
    const play = this.play;
    if (!this.marksGfx) this.marksGfx = this.add.graphics();
    const g = this.marksGfx;
    g.clear();
    g.setDepth(OVERLAY_DEPTH - 30);
    const now = this.time.now;
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 180));
    const ring = (x: number, y: number, r: number, color: number, fill = 0.12) => {
      const z = groundAt(play.course, x, y)?.h ?? 0;
      const p = project(x, y, z / STEP_HEIGHT);
      const rx = r * 16 * Math.SQRT2;
      const ry = r * 8 * Math.SQRT2;
      g.lineStyle(2, color, pulse).strokeEllipse(Math.round(p.x), Math.round(p.y), rx * 2, ry * 2);
      g.fillStyle(color, fill * pulse).fillEllipse(Math.round(p.x), Math.round(p.y), rx * 2, ry * 2);
    };
    for (const e of play.enemies) {
      if (e.defeated) continue;
      if (e.coil) {
        // Round 4: the marked spike paths (dashed red lines along the ground) and the head's circle.
        for (const l of e.coil.spikeMarks) {
          const zOf = (x: number, y: number) => (groundAt(play.course, Math.min(play.course.width - 0.01, Math.max(0.01, x)), Math.min(play.course.height - 0.01, Math.max(0.01, y)))?.h ?? 0) / STEP_HEIGHT;
          const steps = Math.max(1, Math.round(Math.hypot(l.x1 - l.x0, l.y1 - l.y0) * 2));
          g.lineStyle(3, SLAM_RING, pulse);
          for (let i = 0; i < steps; i += 2) {
            const t0 = i / steps;
            const t1 = Math.min(1, (i + 1) / steps);
            const ax = l.x0 + (l.x1 - l.x0) * t0;
            const ay = l.y0 + (l.y1 - l.y0) * t0;
            const bx = l.x0 + (l.x1 - l.x0) * t1;
            const by = l.y0 + (l.y1 - l.y0) * t1;
            const a = project(ax, ay, zOf(ax, ay));
            const b = project(bx, by, zOf(bx, by));
            g.lineBetween(a.x, a.y, b.x, b.y);
          }
        }
        // The circle shows only while it is a warning; once the head is up it has done its damage.
        if (e.coil.headMark && e.coil.head === 'marked') ring(e.coil.headMark.x, e.coil.headMark.y, e.coil.headMark.r, SLAM_RING, 0.18);
      }
      if (e.slamMark && !isBoss(e)) ring(e.slamMark.x, e.slamMark.y, e.slamMark.r, PUFF_RING);
      if (e.ringMark) ring(e.ringMark.x, e.ringMark.y, e.ringMark.r, SOLDIER_RING);
      if (e.windup) {
        // The way Gloamhorn will charge: an arrow along the ground.
        const z = e.z;
        const a = project(e.x, e.y, z / STEP_HEIGHT);
        const b = project(e.x + e.windup.dx * 4, e.y + e.windup.dy * 4, z / STEP_HEIGHT);
        g.lineStyle(3, SLAM_RING, pulse).lineBetween(a.x, a.y, b.x, b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        for (const s of [-1, 1]) g.lineBetween(b.x, b.y, b.x - Math.cos(ang + s * 0.5) * 7, b.y - Math.sin(ang + s * 0.5) * 7);
      }
    }
    for (const bl of play.blasts) ring(bl.x, bl.y, TRAIT_RULES.blast.radius, FUSE_RING, 0.2);
    // Frozen water: an icy sheen over each frozen tile; cracked on its last turn.
    for (const [key, left] of Object.entries(play.frozen)) {
      const [tx, ty] = key.split(',').map(Number) as [number, number];
      const h = groundAt(play.course, tx + 0.5, ty + 0.5)?.h ?? 0;
      const pts = [project(tx, ty, h / STEP_HEIGHT), project(tx + 1, ty, h / STEP_HEIGHT), project(tx + 1, ty + 1, h / STEP_HEIGHT), project(tx, ty + 1, h / STEP_HEIGHT)];
      g.fillStyle(FROZEN, left <= 1 ? 0.45 + 0.2 * Math.abs(Math.sin(now / 150)) : 0.7);
      g.fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
      if (left <= 1) {
        g.lineStyle(1, 0x4070a0, 0.9);
        const c = project(tx + 0.5, ty + 0.5, h / STEP_HEIGHT);
        g.lineBetween(c.x - 6, c.y - 2, c.x + 1, c.y + 1).lineBetween(c.x + 1, c.y + 1, c.x + 7, c.y - 1).lineBetween(c.x + 1, c.y + 1, c.x, c.y + 4);
      }
    }
    if (play.aura) {
      const b = ballNow(play);
      if (play.aura.kind === 'static') ring(b.x, b.y, (ABILITIES.get('static')!.effect as { radius: number }).radius, STATIC_FIELD, 0.2);
      else ring(b.x, b.y, 0.4, FROZEN, 0.3);
    }
  }

  private queueMessage(text: string, color: number, ms?: number): void {
    if (this.messageQueue.some((m) => m.text === text)) return;
    this.messageQueue.push({ text, color, ...(ms !== undefined && { ms }) });
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
    const key = [p.health, maxHealth, p.shots, maxShots, p.meter, p.quota, p.wallet, p.exitOpen, p.ability, usedUp, wild, p.ballStatuses.length, p.gear.weapon, p.gear.armour, p.gear.bauble, p.gear2.weapon, p.gear2.armour, p.gear2.bauble, shields, p.blueStars, p.acornSlices, p.courseMod?.id ?? ''].join(',');
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
    if (p.acornSlices > 0) c.add(pixelText(this, manifest, 270, 20, `ACORN +${p.acornSlices} SLICES`, { color: STAR_FILL, background: UI_BG }));
    if (p.courseMod) c.add(pixelText(this, manifest, 270, 28, courseModShort(p.courseMod), { color: 0xf8a040, background: UI_BG }));
    if (p.courseMod?.id === 'wind' && p.courseMod.dir) c.add(this.windVane(p.courseMod.dir, p.courseMod.strength ?? 2, 270, 36));
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
    // The ball's statuses (Milestone 8): each icon with the shots it has left.
    p.ballStatuses.forEach((st, k) => {
      const icon = STATUSES.get(st.id)?.icon;
      if (!icon || !manifest.sprites[icon]) return;
      c.add(this.add.image(x + 2 + k * 16, 0, icon, 0).setOrigin(0, 0));
      c.add(pixelText(this, manifest, x + 12 + k * 16, 5, `${st.turnsLeft}`, { color: UI_TEXT }));
    });
    // Gear slots (Milestone 6): weapon, armour, bauble; then the armour's ignored damages left this course.
    const gearX = slotX + 66;
    // Round 3: second pockets add a box each, after the first three (labelled with the same letter).
    const extra = GEAR_CATEGORIES.filter((cat) => p.pockets.includes(cat));
    const boxes = gearBoxes(p.gear, p.gear2, p.pockets);
    const gearW = boxes.length * 14 + 2;
    c.add(this.add.rectangle(gearX, 0, gearW + (shields > 0 ? 14 : 0), 19, UI_BG, 0.85).setOrigin(0, 0));
    boxes.forEach((id, i) => {
      const gx = gearX + 2 + i * 14;
      if (id) c.add(this.add.image(gx, 1, GEAR.get(id)!.icon, 0).setOrigin(0, 0));
      else c.add(this.add.rectangle(gx + 1, 2, 10, 10, 0x000000, 0).setOrigin(0, 0).setStrokeStyle(1, 0x404058));
    });
    c.add(pixelText(this, manifest, gearX + 3, 13, ['W', 'A', 'B', ...extra.map((cat) => cat[0]!.toUpperCase())].join('  '), { color: UI_DIM }));
    if (shields > 0) {
      c.add(this.add.image(gearX + gearW, 1, 'icon-shield', 0).setOrigin(0, 0));
      c.add(pixelText(this, manifest, gearX + gearW + 3, 12, String(shields), { color: UI_TEXT }));
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
              session.run!.region === LAST_REGION ? 'THE RUN IS COMPLETE. ENTER: RUN SUMMARY' : 'ENTER: PICK A REWARD, THEN REGION ' + (session.run!.region + 1),
            ]
          : [
              'COURSE COMPLETE!',
              '',
              `SHOTS TAKEN: ${p.shotNumber}`,
              `STARS: ${p.meter} (QUOTA ${p.quota})`,
              `FINISH REWARD: +${rewardFor(cur.type)} STARS, +${cur.type === 'hard' ? BLUE_STARS.hard : BLUE_STARS.course} BLUE (CARRIED)`,
              `HEALTH LEFT: ${p.health}`,
              '',
              walking() ? 'ENTER: ON TO THE CROSSROADS' : 'ENTER: BACK TO THE MAP',
            ]
        : ['RUN OVER', '', p.lostBy === 'shots' ? 'OUT OF SHOTS, WITH NO NAPS LEFT.' : 'YOUR HEALTH RAN OUT.', 'CARRIED BLUE STARS ARE LOST.', 'GEAR IN YOUR BURROW IS SAFE.', '', 'ENTER: RUN SUMMARY']
      : won
      ? ['COURSE COMPLETE!', '', `SHOTS TAKEN: ${p.shotNumber}`, `STARS: ${p.meter} (QUOTA ${p.quota})`, `HEALTH LEFT: ${p.health}`, '', 'ENTER: NEXT COURSE   R: PLAY AGAIN']
      : ['RUN OVER', '', p.lostBy === 'shots' ? 'OUT OF SHOTS, WITH NO NAPS LEFT.' : 'YOUR HEALTH RAN OUT.', `STARS: ${p.meter} OF ${p.quota}`, `SHOTS TAKEN: ${p.shotNumber}`, '', 'ENTER OR R: RESTART'];
    if (this.practiceMode) lines.splice(0, lines.length, ...(won ? ['IN THE HOLE! NICE PRACTICE.', '', 'NOTHING COUNTS HERE: NO STARS, NO DAMAGE KEPT.', '', 'ENTER OR ESC: BACK TO TOWN   R: PLAY AGAIN'] : ['OUT OF SHOTS. IN PRACTICE THAT IS FINE.', '', 'ENTER OR ESC: BACK TO TOWN   R: PLAY AGAIN']));
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

  private showMessage(text: string, color: number, ms = 1400): void {
    this.message?.destroy();
    this.message = pixelText(this, manifest, 0, 46, text, { color, background: UI_BG }).setScrollFactor(0).setDepth(HUD_DEPTH);
    this.message.x = Math.round((VIEW_WIDTH - this.message.width) / 2);
    this.messageUntil = this.time.now + ms;
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
      : this.practiceMode
        ? 'PRACTICE GREEN: NOTHING COUNTS. YOUR GEAR WORKS. ESC: BACK TO TOWN'
        : `${n} ${course.name}`;
    pixelText(this, manifest, 2, 2, label, { color: UI_TEXT, background: UI_BG })
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH)
      .setName(`hud-${id}`);
    const lines = [
      'MOUSE: PULL BACK TO PLAN, HOLD TO CHARGE  KEYS: ARROWS/WASD AIM+POWER, HOLD SPACE TO CHARGE',
      'T: GROUND/LOFT  Z/X: SPIN  Q/E: CURVE  SPACE IN FLIGHT: BOOST  F: ABILITY  ESC: RE-PLAN',
      this.runMode
        ? 'IJKL: PAN  C: CENTRE  O: OVERVIEW  G: DEBUG  U: TEST PANEL  Y: BOT PLAYS  H: HELP'
        : 'IJKL: PAN  C: CENTRE  O: OVERVIEW  N: COURSE  7: RUN  R: RESTART  G: DEBUG  U: PANEL  Y: BOT',
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
