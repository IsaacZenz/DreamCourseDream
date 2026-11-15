/**
 * Area landforms, passages and set pieces for the journey generator
 * (Milestone 5b design sheet, sections 5.3 to 5.6). Every number is a starting
 * value. Heights are in gentle steps (a quarter of a tile); an area made
 * "steep" doubles its heights, so its slopes are twice as steep.
 *
 * Adding a landform that reuses an existing kind is a data entry here; a new
 * kind of shape needs a few lines in src/gen/journey.ts once.
 */

export type LandformKind = 'field' | 'rolling' | 'basin' | 'terraces' | 'ridge' | 'gully' | 'plateau' | 'pond';

export interface LandformDef {
  readonly id: string;
  readonly kind: LandformKind;
  readonly name: string;
  /** Pick weight. */
  readonly weight: number;
  /** Not used below this budget. */
  readonly minBudget: number;
  /** Chance that the area is made steep (heights doubled). */
  readonly steepChance: number;
  /** Ranges the generator draws from: [min, max]. */
  readonly tiltTilesPerStep?: readonly [number, number];
  readonly bumps?: readonly [number, number];
  readonly bumpHeight?: readonly [number, number];
  readonly depth?: readonly [number, number];
  readonly height?: readonly [number, number];
  readonly steps?: readonly [number, number];
  readonly rise?: readonly [number, number];
  /** Weight for an interior rail shape (a loop or an angled wall) in this area. */
  readonly railShapeChance: number;
}

export const LANDFORMS: readonly LandformDef[] = [
  { id: 'field', kind: 'field', name: 'Tilted field', weight: 3, minBudget: 0, steepChance: 0.2, tiltTilesPerStep: [2, 4], railShapeChance: 0.5 },
  { id: 'rolling', kind: 'rolling', name: 'Rolling hills', weight: 3, minBudget: 0, steepChance: 0.3, bumps: [2, 4], bumpHeight: [2, 4], railShapeChance: 0.2 },
  { id: 'basin', kind: 'basin', name: 'Basin', weight: 2, minBudget: 0, steepChance: 0.3, depth: [3, 6], railShapeChance: 0.2 },
  { id: 'terraces', kind: 'terraces', name: 'Terraces', weight: 2, minBudget: 6, steepChance: 0, steps: [3, 5], rise: [2, 2], railShapeChance: 0.1 },
  { id: 'ridge', kind: 'ridge', name: 'Ridge', weight: 2, minBudget: 6, steepChance: 0.3, height: [3, 6], railShapeChance: 0.1 },
  { id: 'gully', kind: 'gully', name: 'Gully', weight: 2, minBudget: 6, steepChance: 0.3, depth: [3, 5], railShapeChance: 0.1 },
  { id: 'plateau', kind: 'plateau', name: 'Plateau', weight: 2, minBudget: 10, steepChance: 0, height: [4, 8], railShapeChance: 0.5 },
  { id: 'pond', kind: 'pond', name: 'Pond', weight: 2, minBudget: 8, steepChance: 0, railShapeChance: 0.3 },
];

export type PassageKind = 'ramp' | 'drop' | 'causeway' | 'gap' | 'step-up';

export interface PassageDef {
  readonly id: PassageKind;
  readonly name: string;
  readonly weight: number;
  readonly minBudget: number;
  /** Terrain cost against the budget. */
  readonly cost: number;
  /** Height change from one area to the next, in steps: [min, max] (positive is up). */
  readonly rise: readonly [number, number];
  /** Length of the passage in tiles (0: the areas touch). */
  readonly length: readonly [number, number];
  /** Width across, in tiles. */
  readonly width: readonly [number, number];
}

export const PASSAGES: readonly PassageDef[] = [
  { id: 'ramp', name: 'Ramp', weight: 4, minBudget: 0, cost: 0, rise: [3, 7], length: [0, 0], width: [3, 5] },
  { id: 'drop', name: 'Drop', weight: 2, minBudget: 0, cost: 0, rise: [-8, -3], length: [0, 0], width: [3, 6] },
  { id: 'causeway', name: 'Causeway', weight: 2, minBudget: 8, cost: 1, rise: [0, 0], length: [3, 6], width: [3, 3] },
  { id: 'gap', name: 'Gap', weight: 1, minBudget: 12, cost: 3, rise: [-2, 0], length: [2, 3], width: [3, 4] },
  { id: 'step-up', name: 'Step up', weight: 1, minBudget: 6, cost: 1, rise: [2, 2], length: [0, 0], width: [3, 6] },
];

export type SetPieceKind = 'pond' | 'spike-pit' | 'sand' | 'arrows';

export interface SetPieceDef {
  readonly id: SetPieceKind;
  readonly name: string;
  readonly weight: number;
  readonly minBudget: number;
  readonly cost: number;
}

export const SET_PIECES: readonly SetPieceDef[] = [
  { id: 'pond', name: 'Pond with island', weight: 2, minBudget: 6, cost: 2 },
  { id: 'spike-pit', name: 'Spike pit', weight: 1, minBudget: 12, cost: 3 },
  { id: 'sand', name: 'Sand field', weight: 3, minBudget: 0, cost: 1 },
  { id: 'arrows', name: 'Booster or conveyor run', weight: 2, minBudget: 6, cost: 1 },
];
