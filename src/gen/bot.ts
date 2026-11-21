/**
 * The bot validator (Milestone 5 design sheet, section 5.2). It plays a course
 * in the simulation with no display, using the real game code. It is a floor,
 * not a clever player: it never uses abilities, the bounce boost or perfect
 * shots, so a person always has more tools than it did.
 *
 * Each turn it picks its next target (awake attackers first, then the target
 * nearest by walking distance over the real ground; the exit once open). If
 * the target is far, it aims a few tiles along the walking route instead,
 * stopping at the edge before a gap. It tries a handful of shots on a copy of
 * the game, scores what happened (stars, damage, route left to walk), and
 * keeps the best copy as the real game. Milestone 5b added the route finding,
 * extra speed for uphill shots, backspin lofts, a ring of safe shots when
 * everything else goes wrong, and giving up early when stuck.
 * Deterministic: same course, seed and settings give the same game.
 */
import { GEN } from '../content/gen.ts';
import type { Tuning } from '../content/tuning.ts';
import { groundAt, type ShotCommand } from '../sim/ball.ts';
import type { Course } from '../sim/course.ts';
import { distancesTo } from './structure.ts';
import type { Modifier } from '../sim/stats.ts';
import { ballNow, canShoot, clonePlay, createPlay, inWater, lobSpeedFor, rollSpeedFor, runShot, takeShot, tick, type Loadout, type PlayState } from '../sim/play.ts';

export interface BotMove {
  /** World clock step the shot was taken on. */
  readonly clock: number;
  readonly cmd: ShotCommand;
}

export interface BotResult {
  readonly passed: boolean;
  readonly won: boolean;
  readonly shots: number;
  readonly health: number;
  /** Why it failed, or "" if it passed. */
  readonly reason: string;
  readonly moves: readonly BotMove[];
  /** Shots simulated in total, trials included (for speed reports). */
  readonly simulated: number;
}

interface Target {
  x: number;
  y: number;
  /** An awake enemy that will attack: go for it first. */
  threat: boolean;
  /** Roll on through it rather than stop at it. */
  through: boolean;
  exit: boolean;
}

/** Things worth going for now, nearest first. */
function targets(play: PlayState): Target[] {
  const b = ballNow(play);
  // Round 2b: an unpressed switch is worth going for (its gate or drawbridge may be in the way), before the exit too.
  const switches: Target[] = play.switches.filter((w) => !w.on).map((w) => ({ x: w.x, y: w.y, threat: false, through: true, exit: false }));
  if (play.exitOpen) return [...switches, { x: play.course.exit.x + 0.5, y: play.course.exit.y + 0.5, threat: false, through: false, exit: true }];
  const out: Target[] = [...switches];
  for (const e of play.enemies) if (!e.defeated && !e.body) out.push({ x: e.x, y: e.y, threat: e.activated, through: true, exit: false });
  for (const c of play.breakables) if (!c.broken && c.def.breakBy === 'hit' && c.drops.includes('yellow-star')) out.push({ x: c.x, y: c.y, threat: false, through: true, exit: false });
  for (const p of play.pickups) if (!p.taken && p.def.effect === 'yellowStar') out.push({ x: p.x, y: p.y, threat: false, through: false, exit: false });
  for (const f of play.flags) if (!f.raised) out.push({ x: f.x, y: f.y, threat: false, through: true, exit: false });
  const d = (t: Target) => Math.hypot(t.x - b.x, t.y - b.y) - (t.threat ? 100 : 0);
  return out.sort((a, c) => d(a) - d(c));
}


export interface BotHints {
  /** Shot limit (the journey table sets it by budget). */
  readonly maxShots?: number;
  /** Milestone 6: play with the player's run upgrades, gear and ability (owner, 2026-11-15). */
  readonly loadout?: Loadout;
  /** Milestone 7: region toughness on every enemy. */
  readonly enemyModifiers?: readonly Modifier[];
  /** Milestone 7: the boss's health in this region. */
  readonly bossHealth?: number;
}

type BotConfig = Omit<typeof GEN.bot, 'maxShots' | 'maxSimulated'> & { maxShots: number; maxSimulated: number };

/**
 * The bot's choice for one turn, split out of `playBot` (owner, 2026-11-21) so
 * the real game can let the bot take over and be watched. It remembers its
 * walking-distance maps for the whole game. `simulated` counts the shots it has
 * tried in its head.
 */
export function botBrain(course: Course, tuning: Tuning, cfg: BotConfig) {
  // Walking-distance maps, one per target tile, kept for the whole game.
  const fields = new Map<string, Float64Array>();
  const rollMemo = new Map<number, number>();
  const lobMemo = new Map<number, number>();
  const roll = (d: number) => {
    const k = Math.round(d * 10);
    let v = rollMemo.get(k);
    if (v === undefined) rollMemo.set(k, (v = rollSpeedFor(tuning, k / 10)));
    return v;
  };
  const lob = (d: number) => {
    const k = Math.round(d * 10);
    let v = lobMemo.get(k);
    if (v === undefined) lobMemo.set(k, (v = lobSpeedFor(tuning, k / 10, tuning.loftAngle, 0)));
    return v;
  };
  const brain = {
    simulated: 0,
    /** The shot to take now, with the state it leads to (the bot played it out in its head). */
    choose(play: PlayState): { reason: string; chosen: { state: PlayState; cmd: ShotCommand } | null; goalField: Float64Array | null } {
      let simulated = brain.simulated;
    let all = targets(play);
      // Find the way: walking distance from the ball to each target over the real ground.
      const bb = ballNow(play);
      const W = course.width;
      const tileOf = (x: number, y: number) => Math.floor(y) * W + Math.floor(x);
      const fieldOf = (t: Target) => {
        const k = `${Math.floor(t.x)},${Math.floor(t.y)}`;
        let f = fields.get(k);
        if (!f) fields.set(k, (f = distancesTo(course, Math.floor(t.x), Math.floor(t.y))));
        return f;
      };
      const ranked = all
        .map((t) => ({ t, walk: fieldOf(t)[tileOf(bb.x, bb.y)] ?? Infinity }))
        .sort((p, q) => (p.t.threat === q.t.threat ? 0 : p.t.threat ? -1 : 1) || p.walk - q.walk);
      const reach = 7;
      let goalField: Float64Array | null = null;
      if (ranked.length) {
        const first = ranked[0]!;
        goalField = fieldOf(first.t);
        if (first.walk > reach && Number.isFinite(first.walk)) {
          // Follow the route a few tiles: from the ball's tile, keep stepping to a neighbour that is closer.
          let x = Math.floor(bb.x);
          let y = Math.floor(bb.y);
          for (let step = 0; step < reach - 1; step++) {
            let best: [number, number] | null = null;
            let bd = goalField[y * W + x]!;
            for (let dy = -4; dy <= 4; dy++) {
              for (let dx = -4; dx <= 4; dx++) {
                if (Math.abs(dx) + Math.abs(dy) !== 1 && !(dx === 0 || dy === 0)) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= W || ny >= course.height) continue;
                const nd = goalField[ny * W + nx]!;
                if (nd < bd && Math.abs(dx) + Math.abs(dy) <= bd - nd + 0.5) {
                  bd = nd;
                  best = [nx, ny];
                }
              }
            }
            if (!best) break;
            // A jump across a gap: first go to the edge; from the edge, jump and aim a little beyond.
            const jump = Math.abs(best[0] - x) + Math.abs(best[1] - y) > 1;
            if (jump && step > 0) break;
            [x, y] = best;
            if (jump) break;
          }
          all = [{ x: x + 0.5, y: y + 0.5, threat: false, through: false, exit: false }];
        } else all = ranked.filter((r) => r.walk <= reach * 2).map((r) => r.t);
        if (!all.length) all = [first.t];
      }
      const ts = all.slice(0, cfg.targetsPerTurn);
      if (!ts.length) return { reason: 'bot found nothing to go for', chosen: null, goalField };
      const b = ballNow(play);
      const power = play.stats.get('shotPower');
      const startHealth = play.health;
      const startMeter = play.meter;
      // Progress is measured towards the goal of this turn (the first target), so the bot follows the trail.
      const goal = ts[0]!;
      const scoreOf = (trial: PlayState, logFrom: number) => {
        const s = cfg.score;
        const lostHealth = startHealth - trial.health;
        const sunk = trial.log.slice(logFrom).filter((e) => e.kind === 'returned' || e.kind === 'underwater').length;
        let score = (trial.meter - startMeter) * s.star - lostHealth * s.health - sunk * s.sunk;
        if (trial.status === 'won') score += s.win;
        else if (trial.status === 'lost') score -= s.lost;
        else {
          const tb = ballNow(trial);
          const walk = goalField ? (goalField[tileOf(tb.x, tb.y)] ?? Infinity) : Math.hypot(tb.x - goal.x, tb.y - goal.y);
          score -= Math.min(Number.isFinite(walk) ? walk : 60, 60) * s.distance;
        }
        return score;
      };
      const bad = () => !best || best.state.health < startHealth || best.state.log.slice(play.log.length).some((e) => e.kind === 'returned' || e.kind === 'underwater');
      let best = null as { score: number; state: PlayState; cmd: ShotCommand; clean: boolean } | null;

      const tryShots = (list: readonly Target[], offsets: readonly number[], reaches: readonly number[], lofts: readonly number[], extra: ShotCommand[] = []) => {
        for (const t of list.length ? list : [goal]) {
          const d = Math.hypot(t.x - b.x, t.y - b.y);
          const base = Math.atan2(t.y - b.y, t.x - b.x);
          // Uphill needs more speed: add what climbing the height difference costs (with some to spare).
          const dz = (groundAt(course, t.x, t.y)?.h ?? b.z) - b.z;
          const climb = (v: number) => Math.sqrt(v * v + 2 * tuning.gravity * Math.max(0, dz) * cfg.climbMargin);
          const cmds: ShotCommand[] = [...extra];
          extra = [];
          for (const off of offsets) {
            const angle = base + (off * Math.PI) / 180;
            for (const reach of reaches) {
              const dist = t.exit ? d * (reach === 1 ? 1 : 1.08) : d * reach + (t.through ? cfg.rollThrough : 0);
              cmds.push({ angle, power: climb(roll(dist)) / (tuning.groundMaxSpeed * power), type: 'ground', topSpin: 0, sideSpin: 0 });
            }
            for (const reach of lofts) {
              cmds.push({ angle, power: climb(lob(d * reach)) / (tuning.loftMaxSpeed * power), type: 'lofted', topSpin: t.exit ? -1 : 0, sideSpin: 0 });
              // Looking harder: also with backspin, to stop near where it lands (across a gap, on a ledge).
              if (lofts !== cfg.loftReach && !t.exit) cmds.push({ angle, power: climb(lob(d * reach)) / (tuning.loftMaxSpeed * power), type: 'lofted', topSpin: -1, sideSpin: 0 });
            }
          }
          // Stage 1: run each shot only until the ball stops (no enemy turn yet), and score it.
          const stage1: { trial: PlayState; cmd: ShotCommand; score: number; logFrom: number }[] = [];
          for (const raw of cmds) {
            const cmd = { ...raw, power: Math.min(1, Math.max(0, raw.power)) };
            const trial = clonePlay(play);
            const logFrom = trial.log.length;
            takeShot(trial, cmd);
            for (let g = 0; trial.phase === 'shot' && trial.status === 'playing' && g < 200_000; g++) tick(trial);
            simulated++;
            stage1.push({ trial, cmd, score: scoreOf(trial, logFrom), logFrom });
            if (trial.status === 'won') break;
          }
          // Stage 2: the best few play on through the enemy turns, which can still hurt.
          stage1.sort((p, q) => q.score - p.score);
          for (const { trial, cmd, logFrom } of stage1.slice(0, cfg.finishBest)) {
            runShot(trial);
            const score = scoreOf(trial, logFrom);
            const clean = trial.status === 'won' || (trial.meter > startMeter && startHealth - trial.health === 0);
            if (!best || score > best.score) best = { score, state: trial, cmd, clean };
            if (trial.status === 'won') return;
          }
          if (best && best.clean) return;
        }
      };
      // Under water a full-power lofted shot towards the goal is the way out.
      const wet = inWater(play) ? [1, 0.8].map((p): ShotCommand => ({ angle: Math.atan2(goal.y - b.y, goal.x - b.x), power: p, type: 'lofted', topSpin: 0, sideSpin: 0 })) : [];
      tryShots(ts, cfg.angleOffsets, cfg.groundReach, cfg.loftReach, wet);
      // Nothing clean: look harder (more targets, wider angles, more power).
      if (!best || !best.clean) tryShots(all.slice(0, cfg.wideTargets), cfg.wideOffsets, cfg.wideReach, cfg.wideLoft);
      // Every aimed shot hurts or falls off: try a ring of safe shots in all directions.
      if (bad()) {
        const ring: ShotCommand[] = [];
        for (let k = 0; k < cfg.ringDirections; k++) {
          const angle = (k / cfg.ringDirections) * Math.PI * 2;
          for (const p of cfg.ringGround) ring.push({ angle, power: p, type: 'ground', topSpin: 0, sideSpin: 0 });
          for (const p of cfg.ringLoft) ring.push({ angle, power: p, type: 'lofted', topSpin: 0, sideSpin: 0 });
        }
        tryShots([goal], [], [], [], ring);
      }
      brain.simulated = simulated;
      const chosen = best as { state: PlayState; cmd: ShotCommand } | null;
      return { reason: chosen ? '' : 'bot found no shot', chosen, goalField };
    },
  };
  return brain;
}

/** Default settings for a bot playing a real game (the owner watching it): the course check's numbers, no shot limit. */
export function watchBotConfig(): BotConfig {
  return { ...GEN.bot, maxShots: 999, maxSimulated: Infinity };
}

export function playBot(course: Course, tuning: Tuning, seed: string, hints: BotHints = {}): BotResult {
  const maxShots = hints.maxShots ?? GEN.bot.maxShots;
  const cfg = { ...GEN.bot, maxShots, maxSimulated: Math.max(GEN.bot.maxSimulated, maxShots * GEN.bot.simulatedPerShot) };
  let bestProgress = -Infinity;
  let stall = 0;
  const brain = botBrain(course, tuning, cfg);
  let play = createPlay(course, tuning, { seed, ...(hints.loadout && { loadout: hints.loadout }), ...(hints.enemyModifiers && { enemyModifiers: hints.enemyModifiers }), ...(hints.bossHealth !== undefined && { bossHealth: hints.bossHealth }) });
  const moves: BotMove[] = [];
  let simulated = 0;
  const done = (reason: string): BotResult => {
    const won = play.status === 'won';
    const passed = won && reason === '' && play.health >= cfg.minHealthLeft && play.shotNumber <= cfg.maxShots;
    const why = reason || (won && play.health < cfg.minHealthLeft ? 'bot won with too little health' : won ? '' : 'bot lost');
    return { passed, won, shots: play.shotNumber, health: play.health, reason: passed ? '' : why, moves, simulated };
  };

  while (play.status === 'playing') {
    if (play.shotNumber >= cfg.maxShots) return done('bot ran out of shots');
    if (simulated >= cfg.maxSimulated) return done('bot took too long');
    if (stall >= cfg.stallShots) return done('bot got stuck');
    for (let g = 0; !canShoot(play) && play.status === 'playing' && g < 20_000; g++) tick(play);
    if (play.status !== 'playing') break;
    if (!canShoot(play)) return done('bot got stuck');

    const pick = brain.choose(play);
    if (!pick.chosen) return done(pick.reason);
    const { chosen, goalField } = pick;
    simulated = brain.simulated;
    moves.push({ clock: play.clock, cmd: chosen.cmd });
    play = chosen.state;
    // Progress: stars first, then walking distance to this turn's goal. No progress for a while: give up early.
    const nb = ballNow(play);
    const walk = goalField ? (goalField[Math.floor(nb.y) * course.width + Math.floor(nb.x)] ?? 99) : 0;
    const progress = play.meter * 1000 - (Number.isFinite(walk) ? walk : 99) + (play.exitOpen ? 500 : 0);
    if (progress > bestProgress + 0.5) {
      bestProgress = progress;
      stall = 0;
    } else stall++;
  }
  return done('');
}
