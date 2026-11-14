/**
 * Status effects (FEATURES.md section 12). Milestone 4 builds the system and
 * Stunned; Poisoned, Burning and Chilled come in Milestone 8.
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
  readonly turns: number;
  /** A second application while active: add time, ignore it, or reset the time. */
  readonly reapply: 'add' | 'ignore' | 'reset';
}

const defs: readonly StatusDef[] = [
  { id: 'stunned', name: 'Stunned', icon: 'icon-stunned', modifiers: [], enemySkipsTurn: true, ballLosesShots: 1, turns: 1, reapply: 'ignore' },
];

export const STATUSES: ReadonlyMap<string, StatusDef> = new Map(defs.map((d) => [d.id, d]));
