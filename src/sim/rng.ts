/**
 * Seeded random number generator. Every random choice in src/sim and src/gen
 * goes through this. Same seed in, same numbers out, on every machine.
 *
 * Algorithm: SFC32 (Small Fast Counting, 128 bits of state). It is fast, has a
 * long period, and uses only 32-bit integer maths, so results are identical
 * across browsers and Node.
 */

/** The full internal state. Save it to resume a generator exactly where it was. */
export type RngState = readonly [number, number, number, number];

/** A seed can be typed by a person ("BIRDIE-42") or be a plain number. */
export type Seed = string | number;

/** Hash a string into four 32-bit numbers (cyrb128). Used to turn seeds into state. */
function hashString(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

const TWO_POW_32 = 4294967296;

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** Make a generator from a seed. Numbers and their string form give the same result. */
  static fromSeed(seed: Seed): Rng {
    const rng = new Rng(hashString(String(seed)));
    // Throw away the first few outputs; SFC32 mixes poorly right after seeding.
    for (let i = 0; i < 15; i++) rng.nextUint32();
    return rng;
  }

  /** Recreate a generator from a state saved with getState(). */
  static fromState(state: RngState): Rng {
    if (state.length !== 4 || state.some((n) => !Number.isInteger(n) || n < 0 || n >= TWO_POW_32)) {
      throw new Error('Invalid RNG state: expected four unsigned 32-bit integers.');
    }
    return new Rng(state);
  }

  /** A copy of the current state, safe to store in save data. */
  getState(): RngState {
    return [this.a, this.b, this.c, this.d];
  }

  /** An independent copy that will produce the same numbers as this one from here on. */
  clone(): Rng {
    return new Rng(this.getState());
  }

  /**
   * A separate stream named by `label`, derived from this generator's current
   * state. Does not advance this generator. Use it to give each system its own
   * stream (for example "map" and "course-3") so that adding a random call in
   * one system does not change the results of another.
   */
  fork(label: string): Rng {
    return Rng.fromSeed(`${this.a}:${this.b}:${this.c}:${this.d}/${label}`);
  }

  /** Next raw value: a whole number from 0 to 2^32 - 1. */
  nextUint32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    return t >>> 0;
  }

  /** A number from 0 (included) to 1 (excluded). */
  next(): number {
    return this.nextUint32() / TWO_POW_32;
  }

  /** A whole number from min to max, both included. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) throw new Error('int() needs whole numbers.');
    if (max < min) throw new Error(`int(${min}, ${max}): max is less than min.`);
    const range = max - min + 1;
    if (range > TWO_POW_32) throw new Error('int() range is too large.');
    // Rejection sampling removes the small bias that plain modulo would add.
    const limit = TWO_POW_32 - (TWO_POW_32 % range);
    let x = this.nextUint32();
    while (x >= limit) x = this.nextUint32();
    return min + (x % range);
  }

  /** A decimal number from min (included) to max (excluded). */
  float(min: number, max: number): number {
    if (max < min) throw new Error(`float(${min}, ${max}): max is less than min.`);
    return min + this.next() * (max - min);
  }

  /** True with the given probability (0 = never, 1 = always). */
  chance(probability: number): boolean {
    return this.next() < probability;
  }

  /** One item from a non-empty list. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() needs at least one item.');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** An index into `weights`, each chosen in proportion to its weight. Needs a positive total. */
  weighted(weights: readonly number[]): number {
    const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
    if (!(total > 0)) throw new Error('weighted() needs a positive total weight.');
    let pick = this.float(0, total);
    let last = 0;
    for (let i = 0; i < weights.length; i++) {
      const w = Math.max(0, weights[i]!);
      if (w <= 0) continue;
      last = i;
      if (pick < w) return i;
      pick -= w;
    }
    return last;
  }

  /** A shuffled copy of the list. The original is not changed. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }
}
