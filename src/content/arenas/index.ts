/**
 * Boss arenas (Milestone 7 sheet section 3; owner, 2026-11-17: five
 * hand-picked arenas, each with its own gimmick, never the same one twice in
 * a row). Ordinary course files with a boss among their objects and "spawns"
 * for its summons. Written by hand from tiles and objects that already exist.
 */
import bumperRing from './bumper-ring.json';
import sinkholeBowl from './sinkhole-bowl.json';
import iceRink from './ice-rink.json';
import theMoat from './the-moat.json';
import stormSteps from './storm-steps.json';

export interface ArenaFile {
  readonly id: string;
  readonly name: string;
  /** The gimmick in a few words, for the loading screen and the map. */
  readonly gimmick: string;
  readonly data: Record<string, unknown>;
}

export const ARENA_LIST: readonly ArenaFile[] = [
  { id: 'bumper-ring', name: 'Bumper Ring', gimmick: 'Pinball: every edge throws you back', data: bumperRing },
  { id: 'sinkhole-bowl', name: 'Sinkhole Bowl', gimmick: 'The floor slopes down to the Warden', data: sinkholeBowl },
  { id: 'ice-rink', name: 'Ice Rink', gimmick: 'Ice: only the sand stops you', data: iceRink },
  { id: 'the-moat', name: 'The Moat', gimmick: 'An island in a ring of water', data: theMoat },
  { id: 'storm-steps', name: 'Storm Steps', gimmick: 'Terraces under drifting thunder clouds', data: stormSteps },
];

export const ARENAS: ReadonlyMap<string, ArenaFile> = new Map(ARENA_LIST.map((a) => [a.id, a]));
