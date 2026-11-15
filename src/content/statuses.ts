/**
 * Status effects (FEATURES.md section 12). Milestone 4 builds the system and
 * Stunned. Owner, 2026-11-15: Burning on enemies comes in Milestone 6 (the fire
 * gear needs it). Poisoned, Chilled and Burning on the ball come in Milestone 8.
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
  readonly turns: number;
  /** A second application while active: add time, ignore it, or reset the time. */
  readonly reapply: 'add' | 'ignore' | 'reset';
}

const defs: readonly StatusDef[] = [
  { id: 'stunned', name: 'Stunned', icon: 'icon-stunned', modifiers: [], enemySkipsTurn: true, ballLosesShots: 1, enemyDamagePerTurn: 0, turns: 1, reapply: 'ignore' },
  // The fire gear sets its own number of turns; this is the default. A second application resets the time (sheet question 1).
  { id: 'burning', name: 'Burning', icon: 'icon-burning', modifiers: [], enemySkipsTurn: false, ballLosesShots: 0, enemyDamagePerTurn: 1, turns: 2, reapply: 'reset' },
];

export const STATUSES: ReadonlyMap<string, StatusDef> = new Map(defs.map((d) => [d.id, d]));
