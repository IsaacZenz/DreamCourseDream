/**
 * Stat sheets and modifiers (FEATURES.md section 1).
 *
 * One system serves permanent upgrades, run boosts, gear, abilities, statuses
 * and enemy traits. Nothing sets a stat directly; everything adds a modifier.
 *
 *   final = (base + all adds) x all multipliers, rounded (whole-number stats)
 *           and kept inside the stat's min and max.
 *
 * Removing a source (for example unequipping gear) removes all its modifiers.
 */
import { STAT_DEFS, type BaseStats, type StatId } from '../content/stats.ts';

export type ModifierSourceKind = 'permanent' | 'run' | 'gear' | 'ability' | 'status' | 'trait' | 'character' | 'region';

export interface ModifierSource {
  readonly kind: ModifierSourceKind;
  /** Which upgrade, item, status and so on. Removing by source matches kind and id. */
  readonly id: string;
}

/**
 * How long a modifier lasts.
 * - forever: until its source is removed (permanent upgrades, traits).
 * - run / course: cleared when the run or the course ends.
 * - turns: counts down once per turn (for the ball, one turn is one shot).
 * - equipped: until its source (gear, ability) is removed.
 */
export type ModifierDuration =
  | { readonly kind: 'forever' }
  | { readonly kind: 'run' }
  | { readonly kind: 'course' }
  | { readonly kind: 'turns'; readonly turns: number }
  | { readonly kind: 'equipped' };

export interface Modifier {
  readonly stat: StatId;
  readonly op: 'add' | 'mul';
  readonly amount: number;
  readonly source: ModifierSource;
  readonly duration: ModifierDuration;
}

interface ActiveModifier {
  readonly mod: Modifier;
  /** Turns left, for 'turns' modifiers. */
  turnsLeft: number;
}

export class StatSheet {
  private readonly base: BaseStats;
  private mods: ActiveModifier[] = [];

  constructor(base: BaseStats) {
    this.base = { ...base };
  }

  baseValue(stat: StatId): number {
    return this.base[stat] ?? 0;
  }

  /** The final value of a stat with every modifier applied. */
  get(stat: StatId): number {
    let add = 0;
    let mul = 1;
    for (const { mod } of this.mods) {
      if (mod.stat !== stat) continue;
      if (mod.op === 'add') add += mod.amount;
      else mul *= mod.amount;
    }
    return clampStat(stat, (this.baseValue(stat) + add) * mul);
  }

  add(mod: Modifier): void {
    if (mod.duration.kind === 'turns' && mod.duration.turns <= 0) return;
    this.mods.push({ mod, turnsLeft: mod.duration.kind === 'turns' ? mod.duration.turns : 0 });
  }

  /** Remove every modifier from one source. Returns how many were removed. */
  removeSource(source: ModifierSource): number {
    const before = this.mods.length;
    this.mods = this.mods.filter((m) => !(m.mod.source.kind === source.kind && m.mod.source.id === source.id));
    return before - this.mods.length;
  }

  /** The course (or the run) ended: drop modifiers that only lasted that long. */
  endScope(scope: 'course' | 'run'): void {
    // A run ending also ends the course.
    const ends = scope === 'run' ? ['course', 'run', 'turns'] : ['course'];
    this.mods = this.mods.filter((m) => !ends.includes(m.mod.duration.kind));
  }

  /** One turn passed: count down and drop 'turns' modifiers that ran out. */
  tickTurn(): void {
    for (const m of this.mods) if (m.mod.duration.kind === 'turns') m.turnsLeft--;
    this.mods = this.mods.filter((m) => m.mod.duration.kind !== 'turns' || m.turnsLeft > 0);
  }

  modifiers(): readonly Modifier[] {
    return this.mods.map((m) => m.mod);
  }

  /** An independent copy (the course generator's bot tries shots on copies of the game). */
  clone(): StatSheet {
    const out = new StatSheet(this.base);
    out.mods = this.mods.map((m) => ({ ...m }));
    return out;
  }
}

export function clampStat(stat: StatId, value: number): number {
  const def = STAT_DEFS[stat];
  const v = def.whole ? Math.round(value) : value;
  return Math.min(def.max, Math.max(def.min, v));
}
