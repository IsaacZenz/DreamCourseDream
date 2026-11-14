import { describe, expect, it } from 'vitest';
import { integerScale } from '../src/render/config';

describe('integerScale', () => {
  it('picks the largest whole number that fits', () => {
    expect(integerScale(1920, 1080)).toBe(5);
    expect(integerScale(1280, 720)).toBe(3);
    expect(integerScale(1366, 768)).toBe(3);
  });

  it('is limited by the tighter side', () => {
    expect(integerScale(3840, 500)).toBe(2);
  });

  it('never goes below 1 on tiny windows', () => {
    expect(integerScale(200, 100)).toBe(1);
  });
});
