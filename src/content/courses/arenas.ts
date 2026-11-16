/**
 * Boss arenas (Milestone 7, sheet section 3): one for now; more to cycle
 * through come in Milestone 8 (owner, 2026-11-16). Kept apart from the test
 * courses so the boss generator (and Node tools) load only these.
 */
import arenaBug from './arena-bug.json' with { type: 'json' };

export const ARENA_FILES: ReadonlyMap<string, unknown> = new Map([['arena-bug', arenaBug]]);
