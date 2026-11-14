/**
 * Abilities (FEATURES.md section 7). One slot; taken from ability-carrying
 * enemies (or a Wild from a secured crate); used with a key during a shot, once
 * per shot. Numbers from the Milestone 4 design sheet, section 4.
 */
import type { Element } from './objects.ts';

export type AbilityEffect =
  /** Drop straight down and stop dead; breaks cracked tiles; stuns enemies within `stunRadius`. */
  | { readonly kind: 'anchor'; readonly dropSpeed: number; readonly stunRadius: number }
  /** Sideways speed at least `minSpeed` for `time` seconds; passes through tier 1 enemies it defeats. */
  | { readonly kind: 'burn'; readonly minSpeed: number; readonly time: number; readonly passTier: number }
  /** Upward speed becomes `upSpeed`. */
  | { readonly kind: 'hop'; readonly upSpeed: number }
  /**
   * A whirlwind (owner, 2026-11-14): `speed` for `time` seconds; every `wanderEvery`
   * seconds the heading swings up to `wanderMax` degrees; the player can nudge it
   * `steerRate` degrees per second; cannot fall while active; deals `damage` to
   * enemies it spirals into; keeps `endKeep` of its speed when it ends.
   */
  | {
      readonly kind: 'tornado';
      readonly speed: number;
      readonly time: number;
      readonly wanderEvery: number;
      readonly wanderMax: number;
      readonly steerRate: number;
      readonly damage: number;
      readonly endKeep: number;
    };

export interface AbilityDef {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  /** What activates it. Every starter ability uses the ability key during a shot. */
  readonly activation: 'key';
  readonly effect: AbilityEffect;
  /** Seconds, or null for instant / until it lands. */
  readonly duration: number | null;
  readonly element: Element | null;
  /** Modifiers while active. None for the starter set. */
  readonly modifiers: readonly never[];
  readonly usesPerShot: number;
}

const defs: readonly AbilityDef[] = [
  { id: 'anchor', name: 'Anchor', icon: 'icon-anchor', activation: 'key', effect: { kind: 'anchor', dropSpeed: 12, stunRadius: 1 }, duration: null, element: null, modifiers: [], usesPerShot: 1 },
  { id: 'burner', name: 'Burner', icon: 'icon-burner', activation: 'key', effect: { kind: 'burn', minSpeed: 14, time: 0.6, passTier: 1 }, duration: 0.6, element: 'fire', modifiers: [], usesPerShot: 1 },
  // Owner, 2026-11-14: Hop lifts the bottom of the ball 1.1 tiles: 7 tiles/s up, with gravity 20 and air drag, peaks at about 1.13.
  { id: 'hop', name: 'Hop', icon: 'icon-hop', activation: 'key', effect: { kind: 'hop', upSpeed: 7 }, duration: null, element: null, modifiers: [], usesPerShot: 1 },
  {
    id: 'tornado',
    name: 'Tornado',
    icon: 'icon-tornado',
    activation: 'key',
    effect: { kind: 'tornado', speed: 10, time: 1.5, wanderEvery: 0.1, wanderMax: 40, steerRate: 120, damage: 1, endKeep: 0.5 },
    duration: 1.5,
    element: null,
    modifiers: [],
    usesPerShot: 1,
  },
];

export const ABILITIES: ReadonlyMap<string, AbilityDef> = new Map(defs.map((d) => [d.id, d]));
export const ABILITY_IDS: readonly string[] = defs.map((d) => d.id);
