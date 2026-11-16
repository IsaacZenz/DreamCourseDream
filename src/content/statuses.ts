/**
 * Status effects (FEATURES.md section 12). Milestone 4 builds the system and
 * Stunned. Owner, 2026-11-15: Burning on enemies comes in Milestone 6 (the fire
 * gear needs it). Owner, 2026-11-16: Burning, Chilled and Poisoned on the ball
 * come in Milestone 7, because the bug bosses' colours give them
 * (docs/plans/milestone-7.md section 2.3). Poisoned and Chilled on enemies
 * stay in Milestone 8.
 *
 * For the ball, one turn is one shot. For an enemy, one turn is one enemy turn.
 */
import type { StatId } from './stats.ts';

export interface StatusDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  /** Modifiers while active (applied through the modifier system). */
  readonly modifiers: readonly { readonly stat: StatId; readonly op: 'add' | 'mul'; readonly amount: number }[];
  /** On an enemy: skip its next action (and a patroller stops moving). */
  readonly enemySkipsTurn: boolean;
  /** On the ball: shots lost at once when applied. */
  readonly ballLosesShots: number;
  /** On an enemy: damage at the start of each enemy turn. */
  readonly enemyDamagePerTurn: number;
  /** On the ball: damage at the start of each shot (Burning). */
  readonly ballDamagePerShot: number;
  /** On the ball: plain ground rolls as if it were ice (Chilled). */
  readonly ballIce: boolean;
  readonly turns: number;
  /** A second application while active: add time, ignore it, or reset the time. */
  readonly reapply: 'add' | 'ignore' | 'reset';
}

const NONE = { modifiers: [], enemySkipsTurn: false, ballLosesShots: 0, enemyDamagePerTurn: 0, ballDamagePerShot: 0, ballIce: false } as const;

const defs: readonly StatusDef[] = [
  { ...NONE, id: 'stunned', name: 'Stunned', icon: 'icon-stunned', enemySkipsTurn: true, ballLosesShots: 1, turns: 1, reapply: 'ignore' },
  // The fire gear sets its own number of turns; this is the default. A second application resets the time (sheet question 1).
  // On the ball (Milestone 7): 1 damage at the start of each of the next 2 shots.
  { ...NONE, id: 'burning', name: 'Burning', icon: 'icon-burning', enemyDamagePerTurn: 1, ballDamagePerShot: 1, turns: 2, reapply: 'reset' },
  // Milestone 7, on the ball: rolls as if on ice for 2 shots.
  { ...NONE, id: 'chilled', name: 'Chilled', icon: 'icon-chilled', ballIce: true, turns: 2, reapply: 'reset' },
  // Milestone 7, on the ball: -1 hit damage (never below 1, owner 2026-11-16) and -20% shot power (owner, sheet question 11) for 2 shots.
  {
    ...NONE,
    id: 'poisoned',
    name: 'Poisoned',
    icon: 'icon-poisoned',
    modifiers: [
      { stat: 'hitDamage', op: 'add', amount: -1 },
      { stat: 'shotPower', op: 'mul', amount: 0.8 },
    ],
    turns: 2,
    reapply: 'reset',
  },
];

export const STATUSES: ReadonlyMap<string, StatusDef> = new Map(defs.map((d) => [d.id, d]));
