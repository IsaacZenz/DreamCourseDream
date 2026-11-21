/**
 * The hand-built places (Milestone 8b design sheet sections 2 and 3): three
 * towns (one per biome), three crossroads templates (for 1, 2 and 3 paths)
 * and the cache clearing. Format: src/sim/place.ts.
 */
import townMeadow from './town-meadow.json';
import townBog from './town-bog.json';
import townThornwood from './town-thornwood.json';
import crossroads1 from './crossroads-1.json';
import crossroads2 from './crossroads-2.json';
import crossroads3 from './crossroads-3.json';
import cache from './cache.json';
import { BIOMES, hashOf } from '../biomes.ts';

export const PLACE_FILES: Readonly<Record<string, unknown>> = {
  'town-meadow': townMeadow,
  'town-bog': townBog,
  'town-thornwood': townThornwood,
  'crossroads-1': crossroads1,
  'crossroads-2': crossroads2,
  'crossroads-3': crossroads3,
  cache,
};

/**
 * Which town a region uses: its biome's town in regions 1 to 3; in endless
 * mode one of the three, picked from the run seed (sheet section 2.1).
 */
export function townFor(region: number, seed: string): string {
  const r = Math.max(1, region);
  const biome = r <= 3 ? BIOMES[r - 1]! : BIOMES[hashOf(`${seed}/town/${r}`) % BIOMES.length]!;
  return `town-${biome.id}`;
}
