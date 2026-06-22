import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { nextRangeRng, nextRng, seedRng } from './rng.js';

const sequence = (seed: number, count: number): number[] => {
  let rng = seedRng(seed);
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const [next, value] = nextRng(rng);
    rng = next;
    values.push(value);
  }
  return values;
};

describe('rng', () => {
  it('produces the same 50-call sequence for the same seed', () => {
    expect(sequence(42, 50)).toEqual(sequence(42, 50));
  });

  it('produces different sequences for different seeds', () => {
    expect(sequence(42, 50)).not.toEqual(sequence(43, 50));
  });

  it('normalizes seed 0 to a non-zero state', () => {
    const rng = seedRng(0);
    expect(rng.value).not.toBe(0);
  });

  it('returns values inside a half-open integer range', () => {
    const [next, value] = nextRangeRng(seedRng(7), 3, 9);
    expect(next.value).not.toBe(seedRng(7).value);
    expect(value).toBeGreaterThanOrEqual(3);
    expect(value).toBeLessThan(9);
  });

  it('rejects invalid integer ranges', () => {
    expect(() => nextRangeRng(seedRng(7), 2, 2)).toThrow(RangeError);
    expect(() => nextRangeRng(seedRng(7), 2.5, 3)).toThrow(RangeError);
    expect(() => nextRangeRng(seedRng(7), 2, 3.5)).toThrow(RangeError);
  });

  it('is deterministic for any unsigned 32-bit seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 0xffffffff }), (seed) => {
        expect(sequence(seed, 25)).toEqual(sequence(seed, 25));
      }),
      { numRuns: 100 },
    );
  });
});
