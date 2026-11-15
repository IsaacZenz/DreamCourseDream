/**
 * The bot validator (Milestone 5 design sheet, section 5.2). It plays a course
 * in the simulation with no display, using the real game code. It is a floor,
 * not a clever player: it never uses abilities, the bounce boost or perfect
 * shots, so a person always has more tools than it did.
 *
 * Each turn it picks the nearest few targets (enemies, crates, loose stars,
 * lowered flags; the exit once open), tries a handful of shots at each on a
 * copy of the game, scores what happened, and keeps the best copy as the real
 * game. Deterministic: same course, seed and settings give the same game.
 */
import { GEN } from '../content/gen.ts';
import type { Tuning } from '../content/tuning.ts';
import type { ShotCommand } from '../sim/ball.ts';
import type { Course } from '../sim/course.ts';
import { ballNow, canShoot, clonePlay, createPlay, lobSpeedFor, rollSpeedFor, runShot, takeShot, tick, type PlayState } from '../sim/play.ts';

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
  if (play.exitOpen) return [{ x: play.course.exit.x + 0.5, y: play.course.exit.y + 0.5, threat: false, through: false, exit: true }];
  const out: Target[] = [];
  for (const e of play.enemies) if (!e.defeated && !e.body) out.push({ x: e.x, y: e.y, threat: e.activated, through: true, exit: false });
  for (const c of play.breakables) if (!c.broken && c.def.breakBy === 'hit' && c.drops.includes('yellow-star')) out.push({ x: c.x, y: c.y, threat: false, through: true, exit: false });
  for (const p of play.pickups) if (!p.taken && p.def.effect === 'yellowStar') out.push({ x: p.x, y: p.y, threat: false, through: false, exit: false });
  for (const f of play.flags) if (!f.raised) out.push({ x: f.x, y: f.y, threat: false, through: true, exit: false });
  const d = (t: Target) => Math.hypot(t.x - b.x, t.y - b.y) - (t.threat ? 100 : 0);
  return out.sort((a, c) => d(a) - d(c));
}

function nearestTargetDistance(play: PlayState): number {
  const t = targets(play)[0];
  if (!t) return 0;
  const b = ballNow(play);
  return Math.hypot(t.x - b.x, t.y - b.y);
}

export function playBot(course: Course, tuning: Tuning, seed: string): BotResult {
  const cfg = GEN.bot;
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

  let play = createPlay(course, tuning, { seed });
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
    for (let g = 0; !canShoot(play) && play.status === 'playing' && g < 20_000; g++) tick(play);
    if (play.status !== 'playing') break;
    if (!canShoot(play)) return done('bot got stuck');

    const all = targets(play);
    const ts = all.slice(0, cfg.targetsPerTurn);
    if (!ts.length) return done('bot found nothing to go for');
    const b = ballNow(play);
    const power = play.stats.get('shotPower');
    const startHealth = play.health;
    const startMeter = play.meter;
    let best = null as { score: number; state: PlayState; cmd: ShotCommand; clean: boolean } | null;

    const tryShots = (list: readonly Target[], offsets: readonly number[], reaches: readonly number[], lofts: readonly number[]) => {
      for (const t of list) {
        const d = Math.hypot(t.x - b.x, t.y - b.y);
        const base = Math.atan2(t.y - b.y, t.x - b.x);
        const cmds: ShotCommand[] = [];
        for (const off of offsets) {
          const angle = base + (off * Math.PI) / 180;
          for (const reach of reaches) {
            const dist = t.exit ? d * (reach === 1 ? 1 : 1.08) : d * reach + (t.through ? cfg.rollThrough : 0);
            cmds.push({ angle, power: roll(dist) / (tuning.groundMaxSpeed * power), type: 'ground', topSpin: 0, sideSpin: 0 });
          }
          for (const reach of lofts) {
            cmds.push({ angle, power: lob(d * reach) / (tuning.loftMaxSpeed * power), type: 'lofted', topSpin: t.exit ? -1 : 0, sideSpin: 0 });
          }
        }
        for (const raw of cmds) {
          const cmd = { ...raw, power: Math.min(1, Math.max(0, raw.power)) };
          const trial = clonePlay(play);
          const logFrom = trial.log.length;
          takeShot(trial, cmd);
          runShot(trial);
          simulated++;
          const s = cfg.score;
          const lostHealth = startHealth - trial.health;
          const sunk = trial.log.slice(logFrom).filter((e) => e.kind === 'returned').length;
          let score = (trial.meter - startMeter) * s.star - lostHealth * s.health - sunk * s.sunk;
          if (trial.status === 'won') score += s.win;
          else if (trial.status === 'lost') score -= s.lost;
          else score -= nearestTargetDistance(trial) * s.distance;
          const clean = trial.status === 'won' || (trial.meter > startMeter && lostHealth === 0);
          if (!best || score > best.score) best = { score, state: trial, cmd, clean };
          if (trial.status === 'won') return;
        }
        if (best && best.clean) return;
      }
    };
    tryShots(ts, cfg.angleOffsets, cfg.groundReach, cfg.loftReach);
    // Nothing clean: look harder (more targets, wider angles, more power).
    if (!best || !best.clean) tryShots(all.slice(0, cfg.wideTargets), cfg.wideOffsets, cfg.wideReach, cfg.wideLoft);
    const chosen = best as { state: PlayState; cmd: ShotCommand } | null;
    if (!chosen) return done('bot found no shot');
    moves.push({ clock: play.clock, cmd: chosen.cmd });
    play = chosen.state;
  }
  return done('');
}
