/**
 * Milestone 8 round 1: the generator dresses enemies (squad themes, leaders,
 * ranks, traits, gear) and sets the quota so it never gets easier (design
 * sheet docs/plans/milestone-8.md sections 4.0, 4.1, 5.2 and 5.3).
 */
import { describe, expect, it } from 'vitest';
import { REGION_MIXES } from '../src/content/enemyMods';
import { OBJECTS } from '../src/content/objects';
import { generateAttempt, quotaFor } from '../src/gen/generate';
import { mixFor } from '../src/sim/run';
import type { JourneySize } from '../src/content/gen';

const size = (region: number, hard = false): JourneySize => ({ areas: [3, 3], areaSize: [9, 13], maxEnemies: 14, botShots: 26, mix: mixFor(region), hard, oddsColumn: 2 });

function courses(region: number, hard: boolean, n: number, budget = 30) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = generateAttempt(`m8gen${i}`, budget, 0, size(region, hard));
    if (r.ok) out.push(r);
  }
  return out;
}

const enemiesOf = (raw: Record<string, unknown>) =>
  (raw.objects as { id: string; at: number[]; rank?: number; traits?: string[]; element?: string; gear?: string }[]).filter((o) => OBJECTS.get(o.id)?.kind === 'enemy');

describe('the quota (owner, 2026-11-18: never easier than now)', () => {
  it("is the stars of the richest 60% of the sources: the sheet's example gives 9", () => {
    expect(quotaFor([2, 2, 2, 1, 1, 1, 1, 1, 1, 1])).toBe(9);
  });
  it('with every source worth 1 it is the old 60% of the stars', () => {
    expect(quotaFor(Array<number>(10).fill(1))).toBe(6);
    expect(quotaFor(Array<number>(7).fill(1))).toBe(Math.round(7 * 0.6));
  });
});

describe('dressing enemies by region', () => {
  const r1 = courses(1, false, 12);
  const r2 = courses(2, false, 12);
  const r3 = courses(3, false, 12);

  it('makes valid courses', () => {
    expect(r1.length).toBeGreaterThanOrEqual(9);
    expect(r2.length).toBeGreaterThanOrEqual(9);
    expect(r3.length).toBeGreaterThanOrEqual(9);
  });
  it('region one has no ranks, traits or gear, only the odd elemental squad', () => {
    const all = r1.flatMap((c) => enemiesOf(c.raw));
    expect(all.some((e) => e.rank || e.traits || e.gear)).toBe(false);
    expect(all.some((e) => e.element)).toBe(true);
  });
  it('region two has Veterans but no Elites; region three has both', () => {
    const two = r2.flatMap((c) => enemiesOf(c.raw));
    const three = r3.flatMap((c) => enemiesOf(c.raw));
    expect(two.some((e) => e.rank === 1)).toBe(true);
    expect(two.some((e) => e.rank === 2)).toBe(false);
    expect(three.some((e) => e.rank === 1)).toBe(true);
    expect(three.some((e) => e.rank === 2)).toBe(true);
    expect(three.some((e) => e.traits?.length)).toBe(true);
    expect(three.some((e) => e.gear)).toBe(true);
  });
  it('a hard course in region one has exactly one Veteran, its leader', () => {
    for (const c of courses(1, true, 6)) expect(enemiesOf(c.raw).filter((e) => e.rank).length).toBe(1);
  });
  it('two Explosive enemies are never placed within 3 tiles', () => {
    for (const c of r3) {
      const ex = enemiesOf(c.raw).filter((e) => e.traits?.includes('explosive'));
      for (const a of ex) for (const b of ex) if (a !== b) expect(Math.hypot(a.at[0]! - b.at[0]!, a.at[1]! - b.at[1]!)).toBeGreaterThanOrEqual(3);
    }
  });
  it('the same seed gives the same dressed course', () => {
    const a = generateAttempt('same', 30, 0, size(3));
    const b = generateAttempt('same', 30, 0, size(3));
    expect(JSON.stringify(a.ok && a.raw)).toBe(JSON.stringify(b.ok && b.raw));
  });
  it('endless regions get more Veterans and Elites, up to 40%', () => {
    expect(mixFor(4).veteran).toBeCloseTo(REGION_MIXES[2]!.veteran + 0.03);
    expect(mixFor(4).elite).toBeCloseTo(REGION_MIXES[2]!.elite + 0.04);
    expect(mixFor(40).elite).toBe(0.4);
  });
});
