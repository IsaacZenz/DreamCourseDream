/**
 * The first chunk set (Milestone 5 design sheet, section 2.4). Each chunk is a
 * JSON data file in this folder. Adding a chunk: write the file and list it here.
 */
import tee from './tee.json' with { type: 'json' };
import green from './green.json' with { type: 'json' };
import fairway from './fairway.json' with { type: 'json' };
import bend from './bend.json' with { type: 'json' };
import plaza from './plaza.json' with { type: 'json' };
import fork from './fork.json' with { type: 'json' };
import nook from './nook.json' with { type: 'json' };
import ramp from './ramp.json' with { type: 'json' };
import ledge from './ledge.json' with { type: 'json' };
import bowl from './bowl.json' with { type: 'json' };
import ridge from './ridge.json' with { type: 'json' };
import bunker from './bunker.json' with { type: 'json' };
import pond from './pond.json' with { type: 'json' };
import rink from './rink.json' with { type: 'json' };

export const CHUNK_FILES: readonly unknown[] = [tee, green, fairway, bend, plaza, fork, nook, ramp, ledge, bowl, ridge, bunker, pond, rink];
