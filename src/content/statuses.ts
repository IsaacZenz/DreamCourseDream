/**
 * Status effects (FEATURES.md section 12). Milestone 4 built the system and
 * Stunned; Milestone 6 Burning on enemies; Milestone 8 round 1 (sheet section
 * 2, signed off by the owner 2026-11-19) adds Poisoned, Chilled and Burning on
 * the ball.
 *
 * For the ball, one turn is one shot. For an enemy, one turn is one enemy turn.
 */
import type { StatId } from './stats.ts';

type Mod = { readonly stat: StatId; readonly op: 'add' | 'mul'; readonly amount: number };

export interface StatusDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  /** Modifiers on an enemy while active (applied through the modifier system). */
  readonly enemyModifiers: readonly Mod[];
  /** Modifiers on the ball while active. */
  readonly ballModifiers: readonly Mod[];
  /** On an enemy: skip its next action (and a patroller stops moving). */
  readonly enemySkipsTurn: boolean;
  /** On an enemy: it cannot move (a patroller stops, launchers and diggers cannot go); it can still lob. */
  readonly enemyCannotMove: boolean;
  /** On an enemy: the next hit that does damage does double, and ends this status. */
  readonly nextHitDouble: boolean;
  /** On the ball: shots lost at once when applied. */
  readonly ballLosesShots: number;
  /** On an enemy: damage at the start of each enemy turn. */
  readonly enemyDamagePerTurn: number;
  /** On the ball: damage at the start of each shot, the moment the turn begins. */
  readonly ballDamagePerShot: number;
  /** On the ball: rolls as if on ice. */
  readonly ballIceRoll: boolean;
  /** Owner, 2026-11-18: putting this on removes these (fire and ice cancel), and itself does not take hold. */
  readonly cancels: readonly string[];
  /** Owner, 2026-11-18: water puts it out on the ball. */
  readonly waterEnds: boolean;
  readonly turns: number;
  /** A second application while active: add time, ignore it, or reset the time. */
  readonly reapply: 'add' | 'ignore' | 'reset';
}

const NONE = {
  enemyModifiers: [],
  ballModifiers: [],
  enemySkipsTurn: false,
  enemyCannotMove: false,
  nextHitDouble: false,
  ballLosesShots: 0,
  enemyDamagePerTurn: 0,
  ballDamagePerShot: 0,
  ballIceRoll: false,
  cancels: [],
  waterEnds: false,
} as const;

const defs: readonly StatusDef[] = [
  { ...NONE, id: 'stunned', name: 'Stunned', icon: 'icon-stunned', enemySkipsTurn: true, ballLosesShots: 1, turns: 1, reapply: 'ignore' },
  // The fire gear sets its own number of turns; this is the default. A second application resets the time (Milestone 6 sheet question 1).
  { ...NONE, id: 'burning', name: 'Burning', icon: 'icon-burning', enemyDamagePerTurn: 1, ballDamagePerShot: 1, cancels: ['chilled'], waterEnds: true, turns: 2, reapply: 'reset' },
  // FEATURES.md open question F1 (default): hit damage can go to 0.
  {
    ...NONE,
    id: 'poisoned',
    name: 'Poisoned',
    icon: 'icon-poisoned',
    enemyModifiers: [{ stat: 'attackDamage', op: 'add', amount: -1 }],
    ballModifiers: [{ stat: 'hitDamage', op: 'add', amount: -1 }],
    turns: 2,
    reapply: 'reset',
  },
  { ...NONE, id: 'chilled', name: 'Chilled', icon: 'icon-chilled', enemyCannotMove: true, nextHitDouble: true, ballIceRoll: true, cancels: ['burning'], turns: 2, reapply: 'reset' },
];

export const STATUSES: ReadonlyMap<string, StatusDef> = new Map(defs.map((d) => [d.id, d]));
